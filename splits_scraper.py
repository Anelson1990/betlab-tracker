"""
Pull consensus betting splits (% of Bets / % of Money) and DraftKings odds
(moneyline, spread/runline, total) for mlb/nfl/nba/nhl from ScoresAndOdds,
merged per game by URL slug (e.g. "/mlb/tigers-vs-twins"), which appears on
both the consensus-picks page and the odds page for the same game.

Only games happening "today" in the local system timezone are kept -- game
times on the site are UTC, so a game at e.g. 00:20 UTC the next calendar
day can still be tonight locally; comparison is done after converting to
local time, not by string-matching the UTC date.

DraftKings' odds table column is located dynamically each run (matched by
book logo alt text), not hardcoded by position.

Each market shows a "Lean" based on Money% (which side has the majority of
the money), flagged RLM (reverse line movement) when the Bets% majority is
on the other side -- i.e. more tickets on one side, more money on the other.

Default output is a compact per-game text report. Pass --json for raw JSON.
"""

import argparse
import json
import re
import sys
from datetime import datetime

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.scoresandodds.com/",
}

SPORTS = ("mlb", "nfl", "nba", "nhl")
TARGET_BOOK = "draftkings"
DATA_MARKET_RE = re.compile(r'data-market="([a-z]+)"')


def fetch_soup(url, session, sport, label, debug):
    res = session.get(url, headers=HEADERS, timeout=15)
    if debug:
        print(f"[debug] {sport} {label}: HTTP {res.status_code}", file=sys.stderr)
    res.raise_for_status()
    return BeautifulSoup(res.text, "html.parser")


def is_today_local(game_time_iso, local_today, debug=False, sport=""):
    if not game_time_iso:
        return False
    try:
        dt = datetime.fromisoformat(game_time_iso.replace("Z", "+00:00"))
    except ValueError:
        if debug:
            print(f"[debug] {sport}: could not parse game_time {game_time_iso!r}", file=sys.stderr)
        return False
    return dt.astimezone().date() == local_today


def local_time_str(game_time_iso):
    if not game_time_iso:
        return "?"
    try:
        dt = datetime.fromisoformat(game_time_iso.replace("Z", "+00:00")).astimezone()
    except ValueError:
        return "?"
    text = dt.strftime("%I:%M %p")
    return text.lstrip("0") or text


# ---------- DraftKings odds (odds page) ----------

def draftkings_column(table):
    for i, th in enumerate(table.select("thead th.book-logo")):
        img = th.find("img")
        alt = img.get("alt", "").strip().lower() if img else ""
        if alt == TARGET_BOOK:
            return i
    return None


def slug_and_time(time_td):
    a = time_td.find("a") if time_td else None
    if a is None:
        return None, None
    return a.get("href"), a.get("data-value")


def odds_team_and_cell(row, book_index):
    team_td = row.find("td", class_="game-team")
    name_tag = team_td.find("a", attrs={"data-abbr": True}) if team_td else None
    team_name = name_tag.get_text(strip=True) if name_tag else None
    odds_cells = row.find_all("td", class_="game-odds")
    cell = odds_cells[book_index] if book_index is not None and book_index < len(odds_cells) else None
    return team_name, cell


def parse_odds_tbody(tbody, book_index):
    if tbody is None:
        return []
    rows = tbody.find_all("tr")
    games = []
    i = 0
    while i < len(rows):
        row1 = rows[i]
        time_td = row1.find("td", class_="game-time")
        if time_td is None:
            i += 1
            continue
        row2 = rows[i + 1] if i + 1 < len(rows) else None
        i += 2

        slug, game_time = slug_and_time(time_td)
        away_team, away_cell = odds_team_and_cell(row1, book_index)
        home_team, home_cell = odds_team_and_cell(row2, book_index) if row2 is not None else (None, None)

        games.append({
            "slug": slug, "game_time": game_time,
            "away_team": away_team, "home_team": home_team,
            "away_cell": away_cell, "home_cell": home_cell,
        })
    return games


def index_by_slug(games):
    return {g["slug"]: g for g in games if g["slug"]}


def moneyline_value(cell):
    if cell is None:
        return None
    span = cell.find("span", class_="data-moneyline")
    if span is None:
        return None
    text = span.get_text(strip=True)
    return "+100" if text.lower() == "even" else text


def line_and_price(cell):
    if cell is None:
        return None, None
    value = cell.find("span", class_="data-value")
    price = cell.find("small", class_="data-odds")
    return (
        value.get_text(strip=True) if value else None,
        price.get_text(strip=True) if price else None,
    )


def fetch_draftkings_odds(sport, session, debug):
    url = f"https://www.scoresandodds.com/{sport}/odds"
    try:
        soup = fetch_soup(url, session, sport, "odds", debug)
    except requests.RequestException as exc:
        print(f"[warn] {sport} odds: request failed: {exc}", file=sys.stderr)
        return {}

    table = soup.find("table", class_="odds-table")
    if table is None:
        if debug:
            print(f"[debug] {sport}: no odds table found", file=sys.stderr)
        return {}

    book_index = draftkings_column(table)
    if book_index is None:
        if debug:
            print(f"[debug] {sport}: draftkings column not found", file=sys.stderr)
        return {}

    ml_tbody = table.find("tbody", id=lambda x: x and x.startswith("odds-table-moneyline"))
    sp_tbody = table.find("tbody", id=lambda x: x and x.startswith("odds-table-spread"))
    to_tbody = table.find("tbody", id=lambda x: x and x.startswith("odds-table-total"))

    ml_by_slug = index_by_slug(parse_odds_tbody(ml_tbody, book_index))
    sp_by_slug = index_by_slug(parse_odds_tbody(sp_tbody, book_index))
    to_by_slug = index_by_slug(parse_odds_tbody(to_tbody, book_index))

    by_slug = {}
    for slug, g in ml_by_slug.items():
        sp = sp_by_slug.get(slug)
        to = to_by_slug.get(slug)

        away_line, away_price = line_and_price(sp["away_cell"]) if sp else (None, None)
        home_line, home_price = line_and_price(sp["home_cell"]) if sp else (None, None)
        over_line, over_price = line_and_price(to["away_cell"]) if to else (None, None)
        under_line, under_price = line_and_price(to["home_cell"]) if to else (None, None)

        by_slug[slug] = {
            "game_time": g["game_time"],
            "away_team": g["away_team"],
            "home_team": g["home_team"],
            "moneyline": {
                "away": moneyline_value(g["away_cell"]),
                "home": moneyline_value(g["home_cell"]),
            },
            "spread": {
                "away_line": away_line, "away_price": away_price,
                "home_line": home_line, "home_price": home_price,
            },
            "total": {
                "over": over_line, "over_price": over_price,
                "under": under_line, "under_price": under_price,
            },
        }
    return by_slug


# ---------- Consensus splits (consensus-picks page) ----------

def pct(span):
    if span is None:
        return None
    text = span.get_text(strip=True)
    return text if text else None


def parse_consensus_li(li):
    chart = li.find("span", class_="trend-graph-chart")
    if chart is None:
        return None, None
    m = DATA_MARKET_RE.search(chart.get("data-content", ""))
    market = m.group(1) if m else None

    bars = chart.find_all("span", class_="trend-graph-percentage")
    if len(bars) < 2:
        return market, None

    bets_bar, money_bar = bars[0], bars[1]
    data = {
        "away_bets_pct": pct(bets_bar.find("span", class_="percentage-a")),
        "home_bets_pct": pct(bets_bar.find("span", class_="percentage-b")),
        "away_money_pct": pct(money_bar.find("span", class_="percentage-a")),
        "home_money_pct": pct(money_bar.find("span", class_="percentage-b")),
    }
    return market, data


def fetch_splits(sport, session, debug):
    url = f"https://www.scoresandodds.com/{sport}/consensus-picks"
    try:
        soup = fetch_soup(url, session, sport, "consensus-picks", debug)
    except requests.RequestException as exc:
        print(f"[warn] {sport} splits: request failed: {exc}", file=sys.stderr)
        return {}

    cards = soup.find_all("div", class_="trend-card")
    by_slug = {}
    for card in cards:
        info = card.find("div", class_="event-info")
        link = info.find("a", href=True) if info else None
        slug = link.get("href") if link else None
        if not slug:
            continue

        # The site renders one trend-card per market per game, so multiple
        # cards share the same slug -- merge into the existing entry.
        for li in card.find_all("li", class_="consensus"):
            market, data = parse_consensus_li(li)
            if market and data:
                by_slug.setdefault(slug, {})[market] = data

    if debug and not by_slug:
        print(f"[debug] {sport}: no consensus cards parsed", file=sys.stderr)

    return by_slug


# ---------- merge ----------

def scrape_sport(sport, session, debug, local_today):
    odds_by_slug = fetch_draftkings_odds(sport, session, debug)
    if not odds_by_slug:
        print(f"{sport.upper()}: no games found")
        return []

    splits_by_slug = fetch_splits(sport, session, debug)

    records = []
    for slug, odds in odds_by_slug.items():
        if not is_today_local(odds["game_time"], local_today, debug, sport):
            continue

        splits = splits_by_slug.get(slug)
        if splits is None and debug:
            print(f"[debug] {sport}: no splits matched for {slug}", file=sys.stderr)

        records.append({
            "sport": sport,
            "slug": slug,
            "game_time": odds["game_time"],
            "away_team": odds["away_team"],
            "home_team": odds["home_team"],
            "splits": splits,
            "draftkings": {
                "moneyline": odds["moneyline"],
                "spread": odds["spread"],
                "total": odds["total"],
            },
        })

    if not records:
        print(f"{sport.upper()}: no games found")

    return records


def scrape_all(debug=False):
    local_today = datetime.now().astimezone().date()
    if debug:
        print(f"[debug] local today resolved as: {local_today.isoformat()}", file=sys.stderr)

    all_records = []
    with requests.Session() as session:
        for sport in SPORTS:
            all_records.extend(scrape_sport(sport, session, debug, local_today))
    return all_records


# ---------- compact text report ----------

def dash(value):
    return value if value else "-"


def pair(a, b):
    return f"{dash(a)}/{dash(b)}"


def line_price(line, price):
    if not line and not price:
        return "-"
    return f"{dash(line)}@{dash(price)}"


def to_float(pct_str):
    if not pct_str:
        return None
    try:
        return float(pct_str.rstrip("%"))
    except ValueError:
        return None


def market_lean(away_label, home_label, bets_a, bets_b, money_a, money_b):
    m_a, m_b = to_float(money_a), to_float(money_b)
    if m_a is None or m_b is None or m_a == m_b:
        return None

    money_side, money_pct = (away_label, m_a) if m_a > m_b else (home_label, m_b)

    flag = ""
    b_a, b_b = to_float(bets_a), to_float(bets_b)
    if b_a is not None and b_b is not None and b_a != b_b:
        bets_side = away_label if b_a > b_b else home_label
        if bets_side != money_side:
            flag = " RLM"

    return f"-> {money_side} {money_pct:g}%M{flag}"


def format_game(rec):
    dk = rec["draftkings"]
    splits = rec["splits"] or {}
    ml_s = splits.get("moneyline", {})
    sp_s = splits.get("spread", {})
    to_s = splits.get("total", {})
    sp, to = dk["spread"], dk["total"]
    away, home = rec["away_team"], rec["home_team"]

    lines = [f"{away} @ {home}  {local_time_str(rec['game_time'])}"]

    ml_lean = market_lean(away, home, ml_s.get("away_bets_pct"), ml_s.get("home_bets_pct"),
                           ml_s.get("away_money_pct"), ml_s.get("home_money_pct"))
    lines.append(f" ML  {pair(dk['moneyline']['away'], dk['moneyline']['home'])}" + (f"  {ml_lean}" if ml_lean else ""))
    lines.append(f"     B:{pair(ml_s.get('away_bets_pct'), ml_s.get('home_bets_pct'))}  M:{pair(ml_s.get('away_money_pct'), ml_s.get('home_money_pct'))}")

    sp_lean = market_lean(away, home, sp_s.get("away_bets_pct"), sp_s.get("home_bets_pct"),
                           sp_s.get("away_money_pct"), sp_s.get("home_money_pct"))
    lines.append(f" SPR {line_price(sp['away_line'], sp['away_price'])}/{line_price(sp['home_line'], sp['home_price'])}" + (f"  {sp_lean}" if sp_lean else ""))
    lines.append(f"     B:{pair(sp_s.get('away_bets_pct'), sp_s.get('home_bets_pct'))}  M:{pair(sp_s.get('away_money_pct'), sp_s.get('home_money_pct'))}")

    # Total: away position = Over, home position = Under (per odds-page markup)
    to_lean = market_lean("Over", "Under", to_s.get("away_bets_pct"), to_s.get("home_bets_pct"),
                           to_s.get("away_money_pct"), to_s.get("home_money_pct"))
    lines.append(f" TOT {line_price(to['over'], to['over_price'])}/{line_price(to['under'], to['under_price'])}" + (f"  {to_lean}" if to_lean else ""))
    lines.append(f"     B:{pair(to_s.get('away_bets_pct'), to_s.get('home_bets_pct'))}  M:{pair(to_s.get('away_money_pct'), to_s.get('home_money_pct'))}")

    return "\n".join(lines)


def print_report(records):
    by_sport = {}
    for rec in records:
        by_sport.setdefault(rec["sport"], []).append(rec)

    for sport in SPORTS:
        games = by_sport.get(sport)
        if not games:
            continue
        print(f"\n{sport.upper()}")
        for rec in games:
            print(format_game(rec))
            print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--debug", action="store_true", help="print diagnostics to stderr")
    parser.add_argument("--json", action="store_true", help="print raw JSON instead of the compact report")
    args = parser.parse_args()

    results = scrape_all(debug=args.debug)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print_report(results)
