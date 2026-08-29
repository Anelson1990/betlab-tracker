"""
RFI v5 — feature engineering. Pure functions, no network calls, so this
module can be unit-tested with synthetic data (see test_core_math.py).

Biggest change from v4: team offense/defense first-inning rate.

v4 used a hard "last 15 games" mean:
    fi_off = mean(scored for last 15 games)

Two problems with that:
  1. Window-edge discontinuity — a game's influence on the feature is
     100% one day and 0% the next the moment it rolls out of the last-15
     window, instead of fading out gradually.
  2. No shrinkage — a team 8 games into the season gets its rate from 8
     (or fewer) noisy games with zero pull toward league average, while
     the *pitcher* stat in this same model (bayesian_nrfi) already does
     exactly that shrinkage. Team stats deserve the same treatment.

v5 uses an exponentially-weighted mean over the full season-to-date
(so recent games matter most but nothing drops off a cliff), then blends
that with league average using games-played-based shrinkage, same
Bayesian idea as the pitcher NRFI% stat:

    shrunk = (ewma * n_effective + league_avg * K) / (n_effective + K)

where n_effective is the effective sample size of the EWMA (which is
less than the raw game count, since older games count for less).
"""

import math

from config import (
    LEAGUE_NRFI, LEAGUE_FI_RPG, LEAGUE_K_PCT,
    TEAM_EWMA_HALFLIFE_GAMES, TEAM_SHRINK_K,
    BAYES_K, MIN_STARTS, DOMED,
)


# --- Team first-inning rate: EWMA + shrinkage --------------------------

def _ewma_with_effective_n(values, halflife):
    """
    Exponentially-weighted mean over `values` (oldest first), most recent
    value weighted highest, plus the weights' effective sample size
    (Kish's approximation: (sum w)^2 / sum(w^2)), used for shrinkage.
    Returns (ewma, effective_n). (0.0, 0.0) for empty input.
    """
    if not values:
        return 0.0, 0.0
    decay = 0.5 ** (1.0 / halflife)
    weights = []
    w = 1.0
    for _ in range(len(values)):
        weights.append(w)
        w *= decay
    # weights[0] corresponds to the most recent value once we reverse
    weights.reverse()
    total_w = sum(weights)
    ewma = sum(v * w for v, w in zip(values, weights)) / total_w
    effective_n = (total_w ** 2) / sum(w * w for w in weights)
    return ewma, effective_n


def team_fi_rate(history, league_avg=LEAGUE_FI_RPG,
                  halflife=TEAM_EWMA_HALFLIFE_GAMES, shrink_k=TEAM_SHRINK_K,
                  field='scored'):
    """
    history: chronologically ascending list of {'scored': int, 'allowed': int}
    for ONE team, already truncated to games strictly before the game being
    predicted (point-in-time — never include the game itself or future
    games; data_sources.load_oss_team_history sorts ascending so callers
    should slice with `[:idx]` up to the target date before calling this).
    """
    if not history:
        return league_avg
    values = [g[field] for g in history]
    ewma, eff_n = _ewma_with_effective_n(values, halflife)
    shrunk = (ewma * eff_n + league_avg * shrink_k) / (eff_n + shrink_k)
    return round(shrunk, 4)


def team_fi_off_def(history):
    """Convenience wrapper returning (offense_rate, defense_rate)."""
    off = team_fi_rate(history, field='scored')
    de = team_fi_rate(history, field='allowed')
    return off, de


# --- Pitcher stat shrinkage (same approach as v4, kept as-is — it was
# already doing the right thing) ---------------------------------------

def bayesian_nrfi(wins, starts, lg=LEAGUE_NRFI, k=BAYES_K):
    return (wins + lg * k) / (starts + k)


def get_oss_pitcher(oss_pitchers, mlb_id, name=''):
    p = oss_pitchers.get(int(mlb_id)) if mlb_id else None
    if not p and name:
        nl = name.lower()
        p = next((v for v in oss_pitchers.values()
                  if v.get('pitcherName', '').lower() == nl), None)
    if not p:
        return {
            'nrfi_pct': LEAGUE_NRFI, 'fi_era': 4.5, 'fi_k_pct': LEAGUE_K_PCT,
            'fi_bb_pct': 0.084, 'starts': 0, 'streak_type': 'none',
            'streak_count': 0, 'source': 'default',
        }
    starts = int(p.get('starts', 0) or 0)
    nrfi_wins = int(p.get('nrfiWins', 0) or 0)
    streak = p.get('streak', {}) or {}
    return {
        'nrfi_pct': bayesian_nrfi(nrfi_wins, starts),
        'fi_era': _safe_float(p.get('era'), 4.5),
        'fi_k_pct': _safe_float(p.get('kPct'), LEAGUE_K_PCT),
        'fi_bb_pct': _safe_float(p.get('bbPct'), 0.084),
        'starts': starts,
        'streak_type': streak.get('type', 'none'),
        'streak_count': int(streak.get('count', 0) or 0),
        'source': 'oss',
    }


def _safe_float(v, d=0.0):
    try:
        if v is None or str(v).strip() in ('', 'N/A', '-'):
            return d
        return float(v)
    except Exception:
        return d


# --- Park / umpire lookups ----------------------------------------------

def get_park_nrfi(oss_parks, abbr, day_night='N'):
    if abbr in DOMED:
        return LEAGUE_NRFI
    park = oss_parks.get(abbr, {})
    key = 'day' if day_night == 'D' else 'night'
    return park.get(key, park.get('all', LEAGUE_NRFI))


def get_ump_nrfi(oss_umpires, name):
    if not name:
        return LEAGUE_NRFI
    return oss_umpires.get(name.lower(), LEAGUE_NRFI)


def either_starter_unproven(home_gs, away_gs, min_starts=MIN_STARTS):
    return home_gs < min_starts or away_gs < min_starts


# --- Pitcher cache lookups (pure — cache dict is loaded/saved by data_sources) --

def pitcher_l5_era_and_rest(pitcher_cache, pid, season, today_str):
    """Returns (era_last5, days_rest). Falls back to league-ish defaults
    when there's no cached game log yet for this pitcher."""
    if not pid:
        return 4.5, 4
    key = f'{pid}_{season}'
    cached = pitcher_cache.get(key, {})
    log = [g for g in cached.get('game_log', []) if g['date'] < today_str]
    if not log:
        return 4.5, 4
    last5 = log[-5:]
    er = sum(g['er'] for g in last5)
    ip = max(sum(g['ip'] for g in last5), 0.1)
    last_date = log[-1]['date']
    try:
        from datetime import datetime
        rest = min((datetime.strptime(today_str, '%Y-%m-%d') -
                    datetime.strptime(last_date, '%Y-%m-%d')).days, 10)
    except Exception:
        rest = 4
    return round(er * 9 / ip, 2), rest


def pitcher_games_started(pitcher_cache, pid, season):
    if not pid:
        return 0
    key = f'{pid}_{season}'
    return pitcher_cache.get(key, {}).get('gs', 0)


# --- Weather -> wind boost (pure; network fetch lives in data_sources) --

def wind_boost_from_weather(abbr, raw_weather, wind_out_dir):
    """
    raw_weather: {'wind_mph', 'wind_dir', 'temp_f'} or None (fetch failed
    / domed park). Returns the full weather dict used downstream,
    including the multiplicative 'wind_boost' applied to lambda.
    """
    if abbr in DOMED:
        return {'wind_mph': 0, 'wind_dir': 'dome', 'temp_f': 72,
                'wind_boost': 1.0, 'wind_effect': 'dome', 'is_dome': True}
    if raw_weather is None:
        return {'wind_mph': 5, 'wind_dir': '', 'temp_f': 72,
                'wind_boost': 1.0, 'wind_effect': 'neutral', 'is_dome': False}

    wind_mph = raw_weather['wind_mph']
    wind_dir = raw_weather['wind_dir']
    temp_f = raw_weather['temp_f']
    out_dirs = wind_out_dir.get(abbr, [])

    wind_boost = 1.0
    wind_effect = 'neutral'
    if out_dirs and any(d in wind_dir for d in out_dirs) and wind_mph >= 8:
        wind_effect = 'out'
        wind_boost = 1.0 + min(0.12, (wind_mph - 8) * 0.012)
    elif wind_mph >= 15:
        wind_effect = 'in'
        wind_boost = max(0.88, 1.0 - (wind_mph - 10) * 0.010)
    elif wind_mph >= 10:
        wind_effect = 'slight_in'
        wind_boost = 0.96

    if temp_f < 50:
        wind_boost *= 0.95
    elif temp_f > 85:
        wind_boost *= 1.03

    return {'wind_mph': wind_mph, 'wind_dir': wind_dir, 'temp_f': temp_f,
            'wind_boost': wind_boost, 'wind_effect': wind_effect, 'is_dome': False}
