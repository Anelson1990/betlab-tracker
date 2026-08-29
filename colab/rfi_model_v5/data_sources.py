"""
RFI v5 — data access layer.

All network I/O lives here so the math (features.py, poisson_model.py,
calibration.py) can be unit-tested offline with plain dicts/lists and
never has to know about requests/HTTP.
"""

import json
import os
import time
from collections import defaultdict

import requests

from config import MLB_API, OSS_API, HEADERS


def oss_get(endpoint, timeout=15):
    try:
        r = requests.get(f'{OSS_API}/{endpoint}', headers=HEADERS, timeout=timeout)
        if r.status_code == 200:
            return r.json()
        print(f'  OSS {endpoint}: HTTP {r.status_code}')
    except Exception as e:
        print(f'  OSS error {endpoint}: {e}')
    return {}


def load_oss_pitchers(season):
    raw = oss_get(f'pitchers?season={season}')
    pitchers = {}
    for p in raw.get('pitchers', []):
        pid = p.get('pitcherId')
        if pid:
            pitchers[int(pid)] = p
    return pitchers


def load_oss_umpires(league_nrfi):
    raw = oss_get('umpires')
    umpires = {}
    for u in raw.get('splitBuckets', []):
        name = u.get('umpireName', '')
        if not name:
            continue
        g = int(u.get('games', 0) or 0)
        n = int(u.get('nrfi', 0) or 0)
        umpires[name.lower()] = n / g if g > 0 else league_nrfi
    return umpires


def load_oss_parks():
    raw = oss_get('ballparks')
    buckets = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for p in raw.get('splitBuckets', []):
        abbr = p.get('homeTeamAbbr', '')
        dn = p.get('dayNight', 'all').lower()
        nrfi = int(p.get('nrfi', 0) or 0)
        games = int(p.get('games', 0) or 0)
        if abbr and games > 0:
            buckets[abbr][dn][0] += nrfi
            buckets[abbr][dn][1] += games
    parks = {}
    for abbr, splits in buckets.items():
        parks[abbr] = {dn: n / g for dn, (n, g) in splits.items() if g > 0}
    return parks


def load_oss_team_history(season):
    """
    Chronologically sorted per-team first-inning game log:
    {team_name: [{'date': ..., 'scored': int, 'allowed': int}, ...]}
    Sorted ascending by date so features.py can take a point-in-time
    prefix (no accidental use of future games).
    """
    raw = oss_get('teams')
    rows = raw.get('gameRows', [])
    history = defaultdict(list)
    for row in rows:
        if row.get('season') != season:
            continue
        team = row.get('team', '')
        date = row.get('officialDate', '')
        if team and date:
            history[team].append({
                'date': date,
                'scored': int(row.get('scoredRun', 0) or 0),
                'allowed': int(row.get('allowedRun', 0) or 0),
            })
    for team in history:
        history[team].sort(key=lambda g: g['date'])
    return dict(history)


def load_pitcher_cache(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def fetch_weather_raw(city):
    """Raw wttr.in hourly reading ~9AM slot, or None on any failure."""
    try:
        r = requests.get(f'https://wttr.in/{city}?format=j1', timeout=8)
        w = r.json()
        h = w['weather'][0]['hourly'][3]
        return {
            'wind_mph': float(h['windspeedMiles']),
            'wind_dir': h.get('winddir16Point', ''),
            'temp_f': float(h['tempF']),
        }
    except Exception:
        return None


def fetch_schedule(date_str):
    url = (f'{MLB_API}/schedule?sportId=1&date={date_str}'
           f'&hydrate=probablePitcher,lineups,officials')
    return requests.get(url, timeout=15).json()


def fetch_first_inning_results(date_str):
    """
    {home_team_name: {'home_fi': int, 'away_fi': int, 'nrfi': bool, 'game_pk': int}}
    Keyed by game_pk internally too so callers can dedup robustly instead
    of matching on the "Away @ Home" string (v4's dedup key), which
    breaks on doubleheaders (same matchup string twice in one day).
    """
    results = {}
    try:
        url = f'{MLB_API}/schedule?sportId=1&date={date_str}&hydrate=linescore'
        data = requests.get(url, timeout=10).json()
        for d in data.get('dates', []):
            for g in d.get('games', []):
                if g.get('status', {}).get('statusCode') != 'F':
                    continue
                gid = g['gamePk']
                try:
                    ls = requests.get(f'{MLB_API}/game/{gid}/linescore', timeout=10).json()
                    innings = ls.get('innings', [])
                    if innings:
                        inn1 = innings[0]
                        hr = int(inn1.get('home', {}).get('runs', 0) or 0)
                        ar = int(inn1.get('away', {}).get('runs', 0) or 0)
                        results[gid] = {
                            'home_fi': hr, 'away_fi': ar, 'nrfi': (hr + ar) == 0,
                            'game_pk': gid,
                        }
                    time.sleep(0.1)
                except Exception:
                    pass
    except Exception as e:
        print(f'  Results error: {e}')
    return results
