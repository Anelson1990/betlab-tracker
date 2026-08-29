"""
RFI v5 — daily entrypoint. Run this in Colab once a day (re-run later in
the day to pick up lineups that weren't posted yet — already-processed
games are cached and skipped).

Layout vs. the v4 monolith this replaces:
    config.py             constants/paths/thresholds
    data_sources.py       all network I/O (MLB Stats API, OSS API, wttr.in)
    features.py           pure feature math (team EWMA+shrinkage, pitcher
                           shrinkage, park/ump/weather) — unit-testable
    poisson_model.py       lambda + Poisson probability + combination
    calibration.py         apply a fitted calibrator + reliability diagnostics
    train_calibration.py   offline: fit calibrator + pick threshold on
                           separate chronological folds (run manually,
                           not from here)
    tracking.py            real/paper/all-graded stores kept fully separate
    test_core_math.py      offline unit tests (no network) for the math

See README.md for the first-run checklist (you need a trained
calibration bundle and some backfilled history before this is anything
more than the raw Poisson/SP-product blend).
"""

import json
import os
import time
from datetime import datetime, timedelta

try:
    from google.colab import drive
    drive.mount('/content/drive')
except ImportError:
    pass  # running outside Colab (e.g. local test) — DRIVE paths must already exist

import config
import data_sources
import features
import poisson_model
import calibration
import tracking

today_str = datetime.now().strftime('%Y-%m-%d')
yesterday_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
SEASON = int(today_str.split('-')[0])

PICKS_FILE = config.PICKS_FILE_TMPL.format(date=today_str)
PREV_PICKS_FILE = config.PICKS_FILE_TMPL.format(date=yesterday_str)


def lineup_confirmed(lineup):
    return isinstance(lineup, list) and len(lineup) >= 9


def main():
    print('=' * 65)
    print(f'  RFI v5  |  {today_str}')
    print(f'  Poisson + OSS FI stats (EWMA+shrinkage) + Elastic Net calibration')
    print('=' * 65)

    # --- Load OSS data --------------------------------------------------
    print('\nLoading OSS data...')
    oss_pitchers = data_sources.load_oss_pitchers(SEASON)
    print(f'  OSS pitchers: {len(oss_pitchers)}')
    oss_umpires = data_sources.load_oss_umpires(config.LEAGUE_NRFI)
    print(f'  OSS umpires: {len(oss_umpires)}')
    oss_parks = data_sources.load_oss_parks()
    print(f'  OSS parks: {len(oss_parks)}')
    team_history = data_sources.load_oss_team_history(SEASON)
    print(f'  OSS team histories: {len(team_history)} teams')

    pitcher_cache = data_sources.load_pitcher_cache(config.PITCHER_CACHE)

    # --- Load calibration model ------------------------------------------
    print('\nLoading calibration model...')
    cal_bundle = calibration.load_calibration_bundle(config.CAL_FILE)
    if cal_bundle:
        model_type = cal_bundle.get('model_type', 'logistic')  # older bundles predate this key
        print(f'  Calibration loaded: {model_type} '
              f'(trained {cal_bundle["trained_date"]} | '
              f'{cal_bundle["n_training"]} fit games | '
              f'holdout threshold {cal_bundle["selected_threshold"]:.2f} | '
              f'holdout OOS edge: {cal_bundle["oos_edge"]:+.4f})')
        live_threshold_real = cal_bundle['selected_threshold']
    else:
        print('  No calibration model yet — using raw combined probability, '
              f'and config-file thresholds (paper={config.BET_MIN_PAPER}, '
              f'real={config.BET_MIN_REAL}). Run train_calibration.py once you '
              'have enough graded history.')
        live_threshold_real = config.BET_MIN_REAL

    # --- Load tracking stores --------------------------------------------
    real_store = tracking.load_real()
    paper_store = tracking.load_paper()
    all_graded_store = tracking.load_all_graded()

    # --- Grade yesterday ---------------------------------------------------
    print(f'\n=== GRADING YESTERDAY ({yesterday_str}) ===')
    if os.path.exists(PREV_PICKS_FILE):
        with open(PREV_PICKS_FILE) as f:
            prev = json.load(f)
        results = data_sources.fetch_first_inning_results(yesterday_str)
        if results:
            real_store, paper_store, all_graded_store = tracking.grade_completed_games(
                yesterday_str, prev.get('all_games', []), results,
                real_store, paper_store, all_graded_store,
                paper_min=config.BET_MIN_PAPER, real_min=live_threshold_real,
            )
            tracking.save_real(real_store)
            tracking.save_paper(paper_store)
            tracking.save_all_graded(all_graded_store)
        else:
            print('  No final results yet for yesterday.')
    else:
        print(f'  No picks file for {yesterday_str}.')

    print(f'\n{"="*65}')
    print(f'  RFI v5 TRACKING SUMMARY | {today_str}')
    print(f'{"="*65}')
    print(tracking.summarize(real_store, f'Real (>={live_threshold_real*100:.0f}%)'))
    print(tracking.summarize(paper_store, f'Paper ({config.BET_MIN_PAPER*100:.0f}-{live_threshold_real*100:.0f}%)'))

    print('\n  Live calibration (ALL graded games, every tier — this is the')
    print('  diagnostic that actually tells you if confidence means what it says):')
    calibration.calibration_report(all_graded_store.get('records', []))

    # Keep the training set fresh for the next train_calibration.py run.
    tracking.export_training_rows(all_graded_store)

    # --- Fetch today's slate -----------------------------------------------
    print(f"\n=== TODAY'S GAMES ({today_str}) ===")
    sched = data_sources.fetch_schedule(today_str)

    existing = {}
    if os.path.exists(PICKS_FILE):
        with open(PICKS_FILE) as f:
            ex = json.load(f)
        for p in ex.get('all_games', []):
            existing[p.get('matchup', '')] = p

    games = []
    skipped_lineup = 0
    for d in sched.get('dates', []):
        for g in d.get('games', []):
            if g.get('gameType') != 'R':
                continue
            home = g['teams']['home']
            away = g['teams']['away']
            home_sp = home.get('probablePitcher', {})
            away_sp = away.get('probablePitcher', {})
            umpires = g.get('officials', [])
            hp_ump = next((o.get('official', {}).get('fullName', '')
                           for o in umpires if o.get('officialType') == 'Home Plate'), '')
            home_lin = g.get('lineups', {}).get('homePlayers', [])
            away_lin = g.get('lineups', {}).get('awayPlayers', [])
            matchup = f"{away['team']['name']} @ {home['team']['name']}"
            if not lineup_confirmed(home_lin) or not lineup_confirmed(away_lin):
                skipped_lineup += 1
                print(f'  \N{DOUBLE VERTICAL BAR} {matchup} (H:{len(home_lin)} A:{len(away_lin)})')
                continue
            print(f'  OK {matchup}')
            games.append({
                'matchup': matchup, 'game_pk': g['gamePk'],
                'home_team': home['team']['name'], 'away_team': away['team']['name'],
                'home_abbr': config.TEAM_MAP.get(home['team']['name'], ''),
                'away_abbr': config.TEAM_MAP.get(away['team']['name'], ''),
                'home_sp_id': home_sp.get('id'), 'home_sp_name': home_sp.get('fullName', 'TBD'),
                'away_sp_id': away_sp.get('id'), 'away_sp_name': away_sp.get('fullName', 'TBD'),
                'umpire': hp_ump,
            })

    print(f'\n  {len(games)} confirmed | {skipped_lineup} pending lineups')

    # --- Run predictions -----------------------------------------------------
    print('\nRunning predictions...')
    picks = []
    all_games_data = []

    for game in games:
        if game['matchup'] in existing:
            pred = existing[game['matchup']]
            all_games_data.append(pred)
            if pred.get('bet'):
                picks.append(pred)
            print(f'  (cached) {game["matchup"]}')
            continue

        try:
            home_abbr = game['home_abbr']
            away_abbr = game['away_abbr']
            h_oss = features.get_oss_pitcher(oss_pitchers, game['home_sp_id'], game['home_sp_name'])
            a_oss = features.get_oss_pitcher(oss_pitchers, game['away_sp_id'], game['away_sp_name'])
            h_l5, h_rest = features.pitcher_l5_era_and_rest(pitcher_cache, game['home_sp_id'], SEASON, today_str)
            a_l5, a_rest = features.pitcher_l5_era_and_rest(pitcher_cache, game['away_sp_id'], SEASON, today_str)
            h_gs = features.pitcher_games_started(pitcher_cache, game['home_sp_id'], SEASON)
            a_gs = features.pitcher_games_started(pitcher_cache, game['away_sp_id'], SEASON)
            either_spot = features.either_starter_unproven(h_gs, a_gs)

            raw_weather = None if home_abbr in config.DOMED else data_sources.fetch_weather_raw(
                config.CITIES.get(home_abbr, ''))
            weather = features.wind_boost_from_weather(home_abbr, raw_weather, config.WIND_OUT_DIR)
            wind_boost = weather['wind_boost']
            ump_nrfi = features.get_ump_nrfi(oss_umpires, game.get('umpire', ''))
            park_nrfi = features.get_park_nrfi(oss_parks, home_abbr)
            h_fi_off, h_fi_def = features.team_fi_off_def(team_history.get(game['home_team'], []))
            a_fi_off, a_fi_def = features.team_fi_off_def(team_history.get(game['away_team'], []))

            lam_home = poisson_model.calc_lambda(a_oss['fi_era'], h_fi_off, ump_nrfi, park_nrfi, wind_boost, a_l5)
            lam_away = poisson_model.calc_lambda(h_oss['fi_era'], a_fi_off, ump_nrfi, park_nrfi, wind_boost, h_l5)

            poi = poisson_model.poisson_nrfi(lam_home, lam_away)
            sp_prod = poisson_model.sp_product_nrfi(h_oss['nrfi_pct'], a_oss['nrfi_pct'])
            combined = poisson_model.combine_probabilities(poi, sp_prod)

            feature_row = calibration.build_feature_row(
                poi, sp_prod, combined, lam_home, lam_away,
                h_oss['nrfi_pct'], a_oss['nrfi_pct'], h_oss['fi_era'], a_oss['fi_era'],
                ump_nrfi, park_nrfi, either_spot,
            )
            final = calibration.apply_calibration(cal_bundle, feature_row, fallback_prob=combined)
            final = max(0.05, min(0.95, final))

            pick = 'NRFI' if final > 0.50 else 'YRFI'
            conf = final if pick == 'NRFI' else 1 - final

            if either_spot and conf < config.EITHER_SPOT_MIN_CONF:
                tier, bet = 'SKIP (unproven SP)', False
            elif conf >= live_threshold_real:
                tier, bet = 'REAL BET', True
            elif conf >= config.BET_MIN_PAPER:
                tier, bet = 'PAPER', True
            elif conf >= config.WATCH_MIN:
                tier, bet = 'WATCH', False
            else:
                tier, bet = 'PASS', False

            pred = {
                'matchup': game['matchup'], 'game_pk': game['game_pk'],
                'home_team': game['home_team'], 'away_team': game['away_team'],
                'home_sp': game['home_sp_name'], 'away_sp': game['away_sp_name'],
                'home_gs': h_gs, 'away_gs': a_gs, 'either_spot': either_spot,
                'lam_home': round(lam_home, 4), 'lam_away': round(lam_away, 4),
                'poi_nrfi': round(poi, 4), 'sp_prod': round(sp_prod, 4),
                'combined_nrfi': round(combined, 4), 'calibrated_nrfi': round(final, 4),
                'pick': pick, 'confidence': round(conf, 4), 'tier': tier, 'bet': bet,
                'h_nrfi_pct': round(h_oss['nrfi_pct'], 3), 'a_nrfi_pct': round(a_oss['nrfi_pct'], 3),
                'h_fi_era': h_oss['fi_era'], 'a_fi_era': a_oss['fi_era'],
                'h_era_l5': h_l5, 'a_era_l5': a_l5, 'h_rest': h_rest, 'a_rest': a_rest,
                'h_fi_off': h_fi_off, 'a_fi_off': a_fi_off,
                'umpire': game.get('umpire', ''), 'ump_nrfi': round(ump_nrfi, 3),
                'park_nrfi': round(park_nrfi, 4), 'wind_effect': weather['wind_effect'],
                'wind_mph': weather['wind_mph'], 'temp_f': weather['temp_f'],
                'is_dome': weather['is_dome'], 'date': today_str,
            }
            all_games_data.append(pred)
            if bet:
                picks.append(pred)

            print(f'\n  {game["matchup"]}')
            print(f'    {pick} {conf*100:.1f}% | tier: {tier} | '
                  f'λ:{lam_home:.3f}/{lam_away:.3f} | '
                  f'POI:{poi*100:.1f}% SP:{sp_prod*100:.1f}% -> Cal:{final*100:.1f}%')
            time.sleep(0.2)

        except Exception as e:
            import traceback
            print(f'  ERROR {game["matchup"]}: {e}')
            traceback.print_exc()

    # --- Save + display card ------------------------------------------------
    with open(PICKS_FILE, 'w') as f:
        json.dump({'date': today_str, 'version': 'rfi_v5',
                   'picks': picks, 'all_games': all_games_data}, f, indent=2)

    print(f'\n{"="*65}')
    print(f'  RFI v5 DAILY CARD | {today_str}')
    print(f'{"="*65}')

    real_bets = [p for p in picks if p['tier'] == 'REAL BET']
    paper_bets = [p for p in picks if p['tier'] == 'PAPER']
    watch_list = [p for p in all_games_data if p['tier'] == 'WATCH']

    print(f'\n  {len(real_bets)} REAL bets | {len(paper_bets)} PAPER bets | '
          f'{len(watch_list)} WATCH | {skipped_lineup} pending')

    if real_bets:
        print(f'\n  REAL BETS (>={live_threshold_real*100:.0f}% confidence):')
        for p in sorted(real_bets, key=lambda x: -x['confidence']):
            print(f'    {p["pick"]} {p["confidence"]*100:.1f}% | {p["matchup"]}')
    else:
        print(f'\n  No REAL bets today (threshold: >={live_threshold_real*100:.0f}%)')

    if paper_bets:
        print(f'\n  PAPER BETS ({config.BET_MIN_PAPER*100:.0f}-{live_threshold_real*100:.0f}%, tracking only):')
        for p in sorted(paper_bets, key=lambda x: -x['confidence']):
            print(f'    {p["pick"]} {p["confidence"]*100:.1f}% | {p["matchup"]}')

    if watch_list:
        print(f'\n  WATCH ({config.WATCH_MIN*100:.0f}-{config.BET_MIN_PAPER*100:.0f}%):')
        for p in sorted(watch_list, key=lambda x: -x['confidence'])[:5]:
            print(f'    {p["pick"]} {p["confidence"]*100:.1f}% | {p["matchup"]}')

    if skipped_lineup > 0:
        print(f'\n  {skipped_lineup} games awaiting lineups — run again later today.')

    print(f'\nSaved: {PICKS_FILE}')
    print('\nDone.')


if __name__ == '__main__':
    main()
