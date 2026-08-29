"""
RFI v5 — bet tracking, kept in three genuinely separate stores.

v4 had `roi['paper']` (superset: every bet >= paper threshold, including
real ones) and `roi['real']` (subset: bet >= real threshold) *plus* a
legacy top-level `roi['total']/['wins']/['profit']` that blended both
together on every grading pass. That legacy blended total is the "keep
real and paper separate" bug — it's easy to end up eyeballing that
number and not realize it's a mix.

v5 has three files, three independent win%s, and the tiers are mutually
exclusive:

  - REAL_TRACKING_FILE:  confidence >= BET_MIN_REAL        (real money)
  - PAPER_TRACKING_FILE: BET_MIN_PAPER <= confidence < BET_MIN_REAL  (paper only)
  - ALL_GRADED_FILE:     every graded game regardless of tier — this is
                          a calibration diagnostic log, explicitly NOT a
                          betting record (no win%/profit reported from
                          it), and it's also the source for
                          train_calibration.py's training set.

Dedup is by MLB `game_pk`, not by "date + matchup" string matching like
v4 — a doubleheader produces two games with the identical matchup string
on the identical date, which v4's dedup key would silently collapse into
one.
"""

import json
import os

from config import (
    REAL_TRACKING_FILE, PAPER_TRACKING_FILE, ALL_GRADED_FILE,
    TRAIN_GAMES_FILE, BET_MIN_PAPER, BET_MIN_REAL, STAKE, PAYOUT,
)


def _empty_bet_store():
    return {'total': 0, 'wins': 0, 'profit': 0.0, 'bets': []}


def _empty_all_graded_store():
    return {'graded_game_pks': [], 'records': []}


def load_store(path, empty_factory):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return empty_factory()


def save_store(path, store):
    with open(path, 'w') as f:
        json.dump(store, f, indent=2)


def load_real():
    return load_store(REAL_TRACKING_FILE, _empty_bet_store)


def load_paper():
    return load_store(PAPER_TRACKING_FILE, _empty_bet_store)


def load_all_graded():
    return load_store(ALL_GRADED_FILE, _empty_all_graded_store)


def save_real(store):
    save_store(REAL_TRACKING_FILE, store)


def save_paper(store):
    save_store(PAPER_TRACKING_FILE, store)


def save_all_graded(store):
    save_store(ALL_GRADED_FILE, store)


def _apply_bet(store, bet_entry):
    store['total'] += 1
    store['wins'] += int(bet_entry['won'])
    store['profit'] = round(store['profit'] + bet_entry['profit'], 2)
    store['bets'].append(bet_entry)


def summarize(store, label, min_qualified=50, min_wr=0.58):
    t = store['total']
    if t == 0:
        return f'  \N{EN DASH} {label:<20} No bets yet'
    wr = store['wins'] / t * 100
    roi_pct = store['profit'] / (t * STAKE) * 100
    qual = '✅ QUALIFIED' if t >= min_qualified and wr / 100 >= min_wr else f'⏳ {t}/{min_qualified} bets'
    icon = '✅' if store['profit'] > 0 else '❌'
    return (f'  {icon} {label:<20} {t}b | {wr:.1f}%WR | '
            f'${store["profit"]:+.2f} | ROI:{roi_pct:.1f}% | {qual}')


def grade_completed_games(date_str, all_games_data, results_by_gamepk,
                           real_store, paper_store, all_graded_store,
                           paper_min=BET_MIN_PAPER, real_min=BET_MIN_REAL,
                           verbose=True):
    """
    all_games_data: every prediction dict produced today (or whatever day
    is being graded), REGARDLESS of bet tier — WATCH/PASS games are
    graded into all_graded_store too, which is what makes the calibration
    report meaningful across the full confidence range. Each dict must
    carry 'game_pk' (see run_daily.py — this is the field v4 computed
    but never actually attached to its `pred` dict).

    results_by_gamepk: {game_pk: {'home_fi', 'away_fi', 'nrfi'}} from
    data_sources.fetch_first_inning_results().

    Mutates and returns (real_store, paper_store, all_graded_store).
    """
    graded_pks = set(all_graded_store.get('graded_game_pks', []))
    n_graded = 0

    for pred in all_games_data:
        gid = pred.get('game_pk')
        if gid is None or gid in graded_pks:
            continue
        result = results_by_gamepk.get(gid)
        if result is None:
            continue  # not final yet

        graded_pks.add(gid)
        actual_nrfi = result['nrfi']
        pick_nrfi = pred['pick'] == 'NRFI'
        won = pick_nrfi == actual_nrfi
        conf = pred['confidence']
        profit = round(PAYOUT if won else -STAKE, 2)

        diag_record = {
            'date': date_str, 'game_pk': gid, 'matchup': pred['matchup'],
            'pick': pred['pick'], 'conf': conf, 'won': won,
            'actual_nrfi': actual_nrfi,
            'home_fi': result['home_fi'], 'away_fi': result['away_fi'],
            'poi': pred['poi_nrfi'], 'sp_prod': pred['sp_prod'],
            'combined': pred['combined_nrfi'],
            'lam_home': pred['lam_home'], 'lam_away': pred['lam_away'],
            'h_nrfi': pred['h_nrfi_pct'], 'a_nrfi': pred['a_nrfi_pct'],
            'h_fi_era': pred['h_fi_era'], 'a_fi_era': pred['a_fi_era'],
            'ump_nrfi': pred['ump_nrfi'], 'park_nrfi': pred['park_nrfi'],
            'either_unproven': pred['either_spot'],
        }
        all_graded_store.setdefault('records', []).append(diag_record)

        bet_entry = {k: diag_record[k] for k in (
            'date', 'game_pk', 'matchup', 'pick', 'conf', 'won',
            'actual_nrfi', 'home_fi', 'away_fi')}
        bet_entry['profit'] = profit

        tier = None
        if conf >= real_min:
            _apply_bet(real_store, bet_entry)
            tier = 'REAL'
        elif conf >= paper_min:
            _apply_bet(paper_store, bet_entry)
            tier = 'PAPER'
        # confidence below paper_min: diagnostic-only, no bet store touched

        n_graded += 1
        if verbose:
            icon = '✅' if won else '❌'
            tier_str = f' [{tier}]' if tier else ' [no bet]'
            print(f'  {icon} {pred["pick"]} {conf*100:.1f}% | '
                  f'Actual: {"NRFI" if actual_nrfi else "YRFI"} '
                  f'(H:{result["home_fi"]} A:{result["away_fi"]}) | '
                  f'{pred["matchup"]}{tier_str}')

    all_graded_store['graded_game_pks'] = list(graded_pks)[-5000:]
    if verbose:
        print(f'  Graded {n_graded} new game(s) for {date_str}.')
    return real_store, paper_store, all_graded_store


def export_training_rows(all_graded_store, path=TRAIN_GAMES_FILE):
    """
    Flattens all_graded_store['records'] into the exact shape
    train_calibration.py expects and writes it to TRAIN_GAMES_FILE.
    Call this periodically (e.g. weekly) as more games get graded, then
    re-run train_calibration.py to refresh the calibrator.
    """
    rows = []
    for r in all_graded_store.get('records', []):
        rows.append({
            'date': r['date'], 'poi': r['poi'], 'sp_prod': r['sp_prod'],
            'combined': r['combined'], 'lam_home': r['lam_home'],
            'lam_away': r['lam_away'], 'h_nrfi': r['h_nrfi'],
            'a_nrfi': r['a_nrfi'], 'h_fi_era': r['h_fi_era'],
            'a_fi_era': r['a_fi_era'], 'ump_nrfi': r['ump_nrfi'],
            'park_nrfi': r['park_nrfi'], 'either_unproven': r['either_unproven'],
            'actual_nrfi': r['actual_nrfi'],
        })
    rows.sort(key=lambda r: r['date'])
    with open(path, 'w') as f:
        json.dump(rows, f, indent=2)
    print(f'  Exported {len(rows)} training rows -> {path}')
    return rows
