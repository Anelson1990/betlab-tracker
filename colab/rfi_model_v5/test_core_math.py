"""
RFI v5 — offline unit tests for the pure math (no network, no Colab, no
sklearn required). Run with:

    python3 test_core_math.py

or, if pytest is available:

    pytest test_core_math.py -v

These exist specifically to let you sanity-check the model logic itself
before ever pointing it at live data — every case here is synthetic.
"""

import math

import config
import features
import poisson_model
import calibration
import tracking


# --- features: team EWMA + shrinkage ------------------------------------

def test_team_fi_rate_empty_history_returns_league_avg():
    assert features.team_fi_rate([]) == config.LEAGUE_FI_RPG


def test_team_fi_rate_shrinks_hard_with_few_games():
    # 3 games at a wildly hot 2.0 FI runs/game shouldn't move the estimate
    # far from league average — small samples should be dominated by shrinkage.
    history = [{'scored': 2, 'allowed': 0} for _ in range(3)]
    rate = features.team_fi_rate(history, field='scored')
    # With TEAM_SHRINK_K=12 and ~3 effective games, shrinkage weight is
    # roughly 12/(12+3) ~= 80% toward league average.
    assert abs(rate - config.LEAGUE_FI_RPG) < abs(2.0 - config.LEAGUE_FI_RPG) * 0.5
    assert rate > config.LEAGUE_FI_RPG  # still pulled toward the hot value, just damped


def test_team_fi_rate_converges_with_many_games():
    # 200 games all at a consistent 0.60 FI runs/game should land close to
    # 0.60, since effective_n >> shrink_k by then.
    history = [{'scored': 0.6 if i % 5 else 1, 'allowed': 0} for i in range(200)]
    rate = features.team_fi_rate(history, field='scored')
    assert 0.5 < rate < 0.75


def test_team_fi_rate_recent_games_weighted_more_than_old():
    # Team was cold (0 runs) for the first 30 games, then hot (3 runs) for
    # the last 5. EWMA should sit noticeably above a flat 200-game average,
    # because recent games get more weight than a plain mean would give them.
    history = [{'scored': 0, 'allowed': 0} for _ in range(30)] + \
              [{'scored': 3, 'allowed': 0} for _ in range(5)]
    ewma_rate = features.team_fi_rate(history, field='scored')
    flat_mean = sum(g['scored'] for g in history) / len(history)
    assert ewma_rate > flat_mean


def test_bayesian_nrfi_shrinks_small_samples():
    # A pitcher who is 3-for-3 on NRFI shouldn't be treated as a 100% lock.
    shrunk = features.bayesian_nrfi(wins=3, starts=3)
    assert shrunk < 0.75
    assert shrunk > config.LEAGUE_NRFI


def test_bayesian_nrfi_matches_raw_rate_with_lots_of_starts():
    shrunk = features.bayesian_nrfi(wins=60, starts=100, k=config.BAYES_K)
    assert abs(shrunk - 0.60) < 0.05


# --- poisson_model --------------------------------------------------------

def test_poisson_nrfi_bounds():
    p = poisson_model.poisson_nrfi(0.45, 0.45)
    assert 0 < p < 1


def test_poisson_nrfi_decreases_with_higher_lambda():
    low = poisson_model.poisson_nrfi(0.3, 0.3)
    high = poisson_model.poisson_nrfi(0.6, 0.6)
    assert high < low


def test_calc_lambda_clamped():
    lam = poisson_model.calc_lambda(sp_fi_era=20, team_fi_rpg=5, ump_nrfi=0.3,
                                     park_nrfi=0.3, wind_boost=2.0, era_l5=20)
    assert lam <= 1.80
    lam2 = poisson_model.calc_lambda(sp_fi_era=0, team_fi_rpg=0, ump_nrfi=0.9,
                                      park_nrfi=0.9, wind_boost=0.1, era_l5=0)
    assert lam2 >= 0.03


def test_combine_probabilities_bounds():
    assert poisson_model.combine_probabilities(0.99, 0.99) <= 0.95
    assert poisson_model.combine_probabilities(0.01, 0.01) >= 0.05


# --- features: weather -----------------------------------------------------

def test_wind_boost_dome_is_neutral():
    w = features.wind_boost_from_weather('HOU', None, config.WIND_OUT_DIR)
    assert w['is_dome']
    assert w['wind_boost'] == 1.0


def test_wind_boost_out_increases_boost():
    raw = {'wind_mph': 15, 'wind_dir': 'S', 'temp_f': 72}
    w = features.wind_boost_from_weather('CHC', raw, config.WIND_OUT_DIR)
    assert w['wind_effect'] == 'out'
    assert w['wind_boost'] > 1.0


def test_wind_boost_strong_wind_in_decreases_boost():
    raw = {'wind_mph': 20, 'wind_dir': 'N', 'temp_f': 72}
    w = features.wind_boost_from_weather('CHC', raw, config.WIND_OUT_DIR)
    assert w['wind_effect'] == 'in'
    assert w['wind_boost'] < 1.0


# --- calibration diagnostics -----------------------------------------------

def test_wilson_ci_contains_point_estimate():
    lo, hi = calibration.wilson_ci(70, 100)
    assert lo < 0.70 < hi


def test_wilson_ci_narrows_with_more_data():
    lo1, hi1 = calibration.wilson_ci(70, 100)
    lo2, hi2 = calibration.wilson_ci(700, 1000)
    assert (hi2 - lo2) < (hi1 - lo1)


def test_brier_score_perfect_predictions():
    records = [{'conf': 1.0, 'won': True}, {'conf': 1.0, 'won': True}]
    assert calibration.brier_score(records) == 0.0


def test_brier_score_worst_case():
    records = [{'conf': 1.0, 'won': False}]
    assert calibration.brier_score(records) == 1.0


def test_calibration_report_flags_overconfidence():
    # 20 picks all made at 90% confidence, but only 10 actually won (50% WR).
    # That's a big miscalibration and should be flagged.
    records = [{'conf': 0.90, 'won': i < 10} for i in range(20)]
    rows = calibration.calibration_report(records, print_output=False)
    row = next(r for r in rows if r['lo'] <= 0.90 < r['hi'])
    assert row['actual_wr'] == 0.5
    assert row['pred_avg'] == 0.90
    assert row['actual_wr'] - row['pred_avg'] < -0.05  # overconfident


# --- tracking: mutually exclusive tiers + game_pk dedup ---------------------

def _fake_pred(game_pk, matchup, pick, confidence, poi=0.5, sp_prod=0.5,
               combined=0.5, either_spot=False):
    return {
        'matchup': matchup, 'game_pk': game_pk, 'pick': pick,
        'confidence': confidence, 'poi_nrfi': poi, 'sp_prod': sp_prod,
        'combined_nrfi': combined, 'lam_home': 0.4, 'lam_away': 0.4,
        'h_nrfi_pct': 0.5, 'a_nrfi_pct': 0.5, 'h_fi_era': 4.0, 'a_fi_era': 4.0,
        'ump_nrfi': 0.5, 'park_nrfi': 0.5, 'either_spot': either_spot,
    }


def test_tracking_tiers_are_mutually_exclusive():
    real_store = tracking._empty_bet_store()
    paper_store = tracking._empty_bet_store()
    all_graded = tracking._empty_all_graded_store()

    preds = [
        _fake_pred(1, 'A @ B', 'NRFI', 0.66),   # real
        _fake_pred(2, 'C @ D', 'NRFI', 0.63),   # paper
        _fake_pred(3, 'E @ F', 'NRFI', 0.58),   # watch — not a bet
    ]
    results = {
        1: {'nrfi': True, 'home_fi': 0, 'away_fi': 0},
        2: {'nrfi': True, 'home_fi': 0, 'away_fi': 0},
        3: {'nrfi': False, 'home_fi': 1, 'away_fi': 0},
    }
    real_store, paper_store, all_graded = tracking.grade_completed_games(
        '2026-04-01', preds, results, real_store, paper_store, all_graded,
        verbose=False)

    assert real_store['total'] == 1
    assert paper_store['total'] == 1
    # game 3 (WATCH tier) must not appear in either betting store...
    assert all(b['game_pk'] != 3 for b in real_store['bets'])
    assert all(b['game_pk'] != 3 for b in paper_store['bets'])
    # ...but it must still show up in the diagnostic log.
    assert any(r['game_pk'] == 3 for r in all_graded['records'])


def test_tracking_dedup_by_game_pk_not_matchup_string():
    # Doubleheader: same matchup string twice, different game_pk.
    real_store = tracking._empty_bet_store()
    paper_store = tracking._empty_bet_store()
    all_graded = tracking._empty_all_graded_store()

    preds = [
        _fake_pred(101, 'A @ B', 'NRFI', 0.70),
        _fake_pred(102, 'A @ B', 'YRFI', 0.66),
    ]
    results = {
        101: {'nrfi': True, 'home_fi': 0, 'away_fi': 0},
        102: {'nrfi': False, 'home_fi': 2, 'away_fi': 1},
    }
    real_store, paper_store, all_graded = tracking.grade_completed_games(
        '2026-04-01', preds, results, real_store, paper_store, all_graded,
        verbose=False)
    assert real_store['total'] == 2  # both games graded independently


def test_tracking_regrade_is_a_noop():
    real_store = tracking._empty_bet_store()
    paper_store = tracking._empty_bet_store()
    all_graded = tracking._empty_all_graded_store()
    preds = [_fake_pred(1, 'A @ B', 'NRFI', 0.70)]
    results = {1: {'nrfi': True, 'home_fi': 0, 'away_fi': 0}}

    real_store, paper_store, all_graded = tracking.grade_completed_games(
        '2026-04-01', preds, results, real_store, paper_store, all_graded, verbose=False)
    real_store, paper_store, all_graded = tracking.grade_completed_games(
        '2026-04-01', preds, results, real_store, paper_store, all_graded, verbose=False)
    assert real_store['total'] == 1  # not double-counted on a second pass


def _run_all():
    import sys
    tests = [(name, fn) for name, fn in list(globals().items())
              if name.startswith('test_') and callable(fn)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f'  PASS  {name}')
        except AssertionError as e:
            failed += 1
            print(f'  FAIL  {name}: {e}')
        except Exception as e:
            failed += 1
            print(f'  ERROR {name}: {e!r}')
    print(f'\n{len(tests) - failed}/{len(tests)} passed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    _run_all()
