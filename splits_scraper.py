"""
Scrapes betting splits (handle/bets %) from ScoresAndOdds by sport.

NOTE: The endpoint URL, JSON field names, and Next.js props path below are
NOT verified against ScoresAndOdds' real response shape -- this environment's
network policy blocks outbound requests to that host, so I couldn't fetch a
live sample to confirm them. Run with --debug; if a sport comes back empty,
it will print the actual HTTP status/content-type and top-level JSON keys
(or a page snippet) so you can see what the site really returns and adjust
the field lookups below.
"""

import argparse
import json
import re
import sys
from datetime import datetime

import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.scoresandodds.com/",
}

NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
    re.DOTALL,
)


def fmt(val):
    """Normalize a handle/bet value to a "NN%" string, or "N/A" if unusable."""
    if val is None or val == "":
        return "N/A"
    if isinstance(val, (int, float)):
        return f"{int(val)}%"
    s = str(val).strip()
    if s.endswith("%"):
        s = s[:-1]
    return f"{s}%" if s.replace(".", "", 1).isdigit() else "N/A"


def pct_value(fmt_str):
    """Extract a numeric percentage from an fmt() result, or None if N/A."""
    if fmt_str == "N/A":
        return None
    try:
        return float(fmt_str.rstrip("%"))
    except ValueError:
        return None


def debug_dump(sport, res, note):
    print(f"[debug] {sport}: {note}", file=sys.stderr)
    print(f"[debug] {sport}: HTTP {res.status_code}  Content-Type: {res.headers.get('Content-Type')}", file=sys.stderr)
    ctype = res.headers.get("Content-Type", "")
    if "json" in ctype:
        try:
            body = res.json()
            print(f"[debug] {sport}: top-level JSON keys: {list(body.keys())}", file=sys.stderr)
        except ValueError:
            print(f"[debug] {sport}: response claimed JSON but failed to parse", file=sys.stderr)
    else:
        snippet = res.text[:300].replace("\n", " ")
        print(f"[debug] {sport}: response snippet: {snippet!r}", file=sys.stderr)


def fetch_games(sport, session, debug):
    url = f"https://www.scoresandodds.com/api/consensus/{sport}"
    res = session.get(url, headers=HEADERS, timeout=12)

    if res.status_code == 200 and "json" in res.headers.get("Content-Type", ""):
        body = res.json()
        games = body.get("games", [])
        if not games and debug:
            debug_dump(sport, res, "API returned 200 JSON but no 'games' key/list")
        return games

    if debug:
        debug_dump(sport, res, "API route didn't return JSON 200, falling back to page scrape")

    page_url = f"https://www.scoresandodds.com/{sport}/consensus-picks"
    res = session.get(page_url, headers=HEADERS, timeout=12)
    match = NEXT_DATA_RE.search(res.text)
    if not match:
        if debug:
            debug_dump(sport, res, "no __NEXT_DATA__ script tag found on page")
        return []

    data = json.loads(match.group(1))
    games = data.get("props", {}).get("pageProps", {}).get("games", [])
    if not games and debug:
        print(f"[debug] {sport}: __NEXT_DATA__ pageProps keys: {list(data.get('props', {}).get('pageProps', {}).keys())}", file=sys.stderr)
    return games


def scrape_all(debug=False):
    sports = ["mlb", "nfl", "nba", "nhl"]
    date_str = datetime.now().strftime("%b %d")
    all_records = []

    with requests.Session() as session:
        for sport in sports:
            try:
                games = fetch_games(sport, session, debug)
            except requests.RequestException as exc:
                print(f"[warn] {sport}: request failed: {exc}", file=sys.stderr)
                continue
            except (ValueError, json.JSONDecodeError) as exc:
                print(f"[warn] {sport}: failed to parse response: {exc}", file=sys.stderr)
                continue

            for g in games:
                away_team = g.get("away_team_abbr") or g.get("away", {}).get("abbr") or "AWAY"
                home_team = g.get("home_team_abbr") or g.get("home", {}).get("abbr") or "HOME"

                ml = g.get("moneyline", {}) or g.get("ml", {})
                ml_hnd = fmt(ml.get("away_handle_pct") or ml.get("away_handle"))
                ml_bet = fmt(ml.get("away_bets_pct") or ml.get("away_bets"))

                rl = g.get("spread", {}) or g.get("runline", {})
                rl_hnd = fmt(rl.get("away_handle_pct") or rl.get("away_handle"))
                rl_bet = fmt(rl.get("away_bets_pct") or rl.get("away_bets"))

                tot = g.get("total", {}) or g.get("over_under", {})
                tot_hnd = fmt(tot.get("over_handle_pct") or tot.get("over_handle"))
                tot_bet = fmt(tot.get("over_bets_pct") or tot.get("over_bets"))

                hnd_val = pct_value(ml_hnd)
                if hnd_val is None:
                    pick_team = "N/A"
                else:
                    pick_team = away_team if hnd_val >= 50 else home_team

                notes_str = (
                    f"ScoresAndOdds | ML: {away_team} ({ml_hnd} H / {ml_bet} B) | "
                    f"RL/SPR: {away_team} ({rl_hnd} H / {rl_bet} B) | "
                    f"Total Over: ({tot_hnd} H / {tot_bet} B)"
                )

                all_records.append({
                    "date": date_str,
                    "sport": sport,
                    "game": f"{away_team} @ {home_team}",
                    "pick": f"{pick_team} ML" if pick_team != "N/A" else "N/A",
                    "odds": "-110",
                    "notes": notes_str,
                    "result": "pending",
                })

    return all_records


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--debug", action="store_true", help="print diagnostics about the raw responses to stderr")
    args = parser.parse_args()

    print(json.dumps(scrape_all(debug=args.debug), indent=2))
