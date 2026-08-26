# STEP 1: Install browser-impersonation request library
# !pip install curl_cffi -q

from curl_cffi import requests
from bs4 import BeautifulSoup
import pandas as pd
import re
import time
from datetime import date

LEAGUES = {
    'NFL': 'nfl',
    'MLB': 'mlb',
    'NHL': 'nhl',
    'NBA': 'nba'
}

# The site resolves '?date=' server-side for all four leagues (confirmed by
# checking each league's own canonical link tag). Pinning it explicitly
# avoids relying on their default/cache picking the right day.
def _today_str():
    return date.today().isoformat()


def _pct_pairs(card):
    """Each consensus card has two '.trend-graph-percentage' blocks:
    index 0 = % of bets (away, home), index 1 = % of money (away, home)."""
    blocks = card.select('.trend-graph-percentage')
    pairs = []
    for b in blocks:
        vals = [s.get_text(strip=True) for s in b.select('span') if s.get_text(strip=True)]
        pairs.append(vals)
    bets = pairs[0] if len(pairs) > 0 and len(pairs[0]) == 2 else [None, None]
    money = pairs[1] if len(pairs) > 1 and len(pairs[1]) == 2 else [None, None]
    return bets, money


def _side_line(card):
    """Pulls the away/home line values out of the '.trend-graph-sides' label,
    e.g. 'NE (+3.5) % of Bets SEA (-3.5)' -> ('+3.5', '-3.5')
    or 'Over (o44.5) % of Bets Under (u44.5)' -> ('44.5', '44.5')."""
    sides = card.select('.trend-graph-sides')
    if not sides:
        return None, None
    text = sides[0].get_text(' ', strip=True)
    nums = re.findall(r'\(([ou]?[-+]?\d+\.?\d*)\)', text)
    if len(nums) == 2:
        return nums[0].lstrip('ou'), nums[1].lstrip('ou')
    return None, None


def _best_odds(card):
    """Pulls the best available sportsbook price for each side, straight out
    of the same consensus card (no separate odds page/site needed).
    Moneyline cards store the price alone in '.data-moneyline'; spread/total
    cards store the line in '.data-moneyline' and the juice in '.data-odds'
    (falls back to '.data-moneyline' if '.data-odds' isn't present).
    Returns [(away_price, away_book), (home_price, home_book)] — for total
    cards this is [(over_price, over_book), (under_price, under_book)].
    NOTE: 'best' picks whichever book has the best number on that side, so
    the away and home price can come from two different books. Use
    fetch_book_odds() below for one consistent book (e.g. DraftKings)."""
    containers = card.select('.best-odds-container')
    out = []
    for c in containers[:2]:
        price_el = c.select_one('.data-odds') or c.select_one('.data-moneyline')
        book_el = c.select_one('.book-icn img')
        price = price_el.get_text(strip=True) if price_el else None
        book = book_el.get('alt') if book_el else None
        out.append((price, book))
    while len(out) < 2:
        out.append((None, None))
    return out


def fetch_book_odds(league_slug, book_name, run_date=None):
    """Pulls one specific sportsbook's actual lines (not 'best across books')
    from the site's full odds table at /<league>/odds/, which lists every
    tracked book as its own column. Returns a dict keyed by
    (away_team, home_team) -> {market: {...}} so it can be merged onto the
    consensus-picks rows by team names.

    book_name must match the book's 'alt' text on the site exactly, e.g.
    'draftkings', 'fanduel', 'betmgm', 'caesars', 'bet365', 'fanatics',
    'riverscasino' — check the page yourself if a book you want isn't
    pulling data, since these names aren't guaranteed stable long-term."""
    run_date = run_date or _today_str()
    url = f"https://www.scoresandodds.com/{league_slug}/odds/?date={run_date}"

    response = _get_with_retry(url)
    if response is None:
        return {}

    soup = BeautifulSoup(response.text, 'html.parser')
    table = soup.select_one('table.odds-table')
    if not table:
        return {}

    book_imgs = table.select('thead th.book-logo img')
    books = [img.get('alt') for img in book_imgs]
    if book_name not in books:
        print(f"  '{book_name}' not found in this table's books: {books}")
        return {}
    book_idx = books.index(book_name)

    out = {}
    for market, tbody_class in [
        ('moneyline', 'odds-table-moneyline--0'),
        ('spread', 'odds-table-spread--0'),
        ('total', 'odds-table-total--0'),
    ]:
        tbody = table.select_one(f'tbody.{tbody_class}')
        if not tbody:
            continue
        rows = tbody.select('tr')
        # Rows come in away/home pairs, in game order.
        for i in range(0, len(rows) - 1, 2):
            away_row, home_row = rows[i], rows[i + 1]
            # '.team-name' also contains the starting pitcher (MLB), e.g.
            # "RaysPeralta (R)" — use the team link's own text/data-abbr to
            # get a clean name that matches the consensus-picks page.
            away_name_el = away_row.select_one('.game-team .team-name a[data-abbr]')
            home_name_el = home_row.select_one('.game-team .team-name a[data-abbr]')
            away_name = away_name_el.get_text(strip=True) if away_name_el else None
            home_name = home_name_el.get_text(strip=True) if home_name_el else None
            if not away_name or not home_name:
                continue

            def _cell(row):
                cells = row.select('.game-odds')
                if len(cells) <= book_idx:
                    return None, None
                cell = cells[book_idx]
                value_el = cell.select_one('.data-value') or cell.select_one('.data-moneyline')
                odds_el = cell.select_one('.data-odds')
                value = value_el.get_text(strip=True) if value_el else None
                odds = odds_el.get_text(strip=True) if odds_el else None
                return value, odds

            away_val, away_odds = _cell(away_row)
            home_val, home_odds = _cell(home_row)

            key = (away_name, home_name)
            out.setdefault(key, {})[market] = {
                'away_line': away_val, 'away_price': away_odds or away_val,
                'home_line': home_val, 'home_price': home_odds or home_val,
            }

    return out


def _get_with_retry(url, tries=3, backoff=5):
    """A 403 here is almost always IP-reputation blocking (common on shared
    cloud IPs like Colab), not a bad request — retrying the same IP won't
    fix that, so this only helps with transient blips, not a flagged IP."""
    last_status = None
    for attempt in range(tries):
        try:
            response = requests.get(url, impersonate="chrome120", timeout=15)
        except Exception as e:
            last_status = str(e)
            time.sleep(backoff)
            continue
        if response.status_code == 200:
            return response
        last_status = response.status_code
        if response.status_code == 403:
            # Retrying won't help a flagged IP — fail fast instead of
            # burning three slow attempts on a block that won't clear.
            break
        time.sleep(backoff)
    if last_status == 403:
        print(f"  HTTP 403 — this IP is likely blocked by the site's bot "
              f"protection (common on Colab's shared IPs). Try restarting "
              f"the Colab runtime for a new IP, or run from a non-cloud IP.")
    else:
        print(f"  Failed after {tries} attempts: {last_status}")
    return None


def fetch_league_splits(league_name, league_slug, run_date=None, book=None):
    run_date = run_date or _today_str()
    url = f"https://www.scoresandodds.com/{league_slug}/consensus-picks?date={run_date}"

    response = _get_with_retry(url)
    if response is None:
        print(f"Failed to load {league_name}")
        return []

    soup = BeautifulSoup(response.text, 'html.parser')

    # The site is server-rendered HTML (no __NEXT_DATA__ JSON payload).
    # Each game renders as three consecutive '.trend-card.consensus' blocks,
    # in this fixed order: moneyline, spread, total.
    cards = soup.select('.trend-card.consensus')
    if not cards:
        # Not necessarily an error — leagues have off-seasons (e.g. NHL/NBA
        # in August) and there just may be no games on this date.
        print(f"  {league_name}: 0 games found for {run_date} (off-season or no games that day)")
        return []

    book_odds = fetch_book_odds(league_slug, book, run_date=run_date) if book else {}

    games_list = []
    for i in range(0, len(cards) - 2, 3):
        ml_card, spread_card, total_card = cards[i], cards[i + 1], cards[i + 2]

        header = ml_card.select_one('.event-header')
        if not header:
            continue
        away_team = header.select_one('.team-pennant.left .team-name')
        home_team = header.select_one('.team-pennant.right .team-name')
        away_team = away_team.get_text(strip=True) if away_team else None
        home_team = home_team.get_text(strip=True) if home_team else None

        ml_bets, ml_money = _pct_pairs(ml_card)
        spread_bets, spread_money = _pct_pairs(spread_card)
        total_bets, total_money = _pct_pairs(total_card)

        away_spread_line, home_spread_line = _side_line(spread_card)
        over_line, _under_line = _side_line(total_card)

        (away_ml_price, away_ml_book), (home_ml_price, home_ml_book) = _best_odds(ml_card)
        (away_spread_price, away_spread_book), (home_spread_price, home_spread_book) = _best_odds(spread_card)
        (over_price, over_book), (under_price, under_book) = _best_odds(total_card)

        row = {}
        if book:
            g = book_odds.get((away_team, home_team), {})
            ml = g.get('moneyline', {})
            sp = g.get('spread', {})
            tot = g.get('total', {})
            row.update({
                f'{book}_away_ml': ml.get('away_price'),
                f'{book}_home_ml': ml.get('home_price'),
                f'{book}_away_spread_line': sp.get('away_line'),
                f'{book}_away_spread_price': sp.get('away_price'),
                f'{book}_home_spread_line': sp.get('home_line'),
                f'{book}_home_spread_price': sp.get('home_price'),
                f'{book}_total_line': tot.get('away_line'),  # over line
                f'{book}_over_price': tot.get('away_price'),
                f'{book}_under_price': tot.get('home_price'),
            })
            if not g:
                print(f"  no {book} match for {away_team} @ {home_team} (name mismatch or game not listed)")

        games_list.append({
            'league': league_name,
            'away_team': away_team,
            'home_team': home_team,
            'away_ml_bets_pct': ml_bets[0],
            'home_ml_bets_pct': ml_bets[1],
            'away_ml_money_pct': ml_money[0],
            'home_ml_money_pct': ml_money[1],
            'away_spread_line': away_spread_line,
            'away_spread_bets_pct': spread_bets[0],
            'away_spread_money_pct': spread_money[0],
            'home_spread_line': home_spread_line,
            'home_spread_bets_pct': spread_bets[1],
            'home_spread_money_pct': spread_money[1],
            'over_line': over_line,
            'over_bets_pct': total_bets[0],
            'over_money_pct': total_money[0],
            # Best available sportsbook price (not a consensus stat — the
            # single best line/price across books that scoresandodds tracks)
            'away_ml_best_price': away_ml_price,
            'away_ml_best_book': away_ml_book,
            'home_ml_best_price': home_ml_price,
            'home_ml_best_book': home_ml_book,
            'away_spread_best_price': away_spread_price,
            'away_spread_best_book': away_spread_book,
            'home_spread_best_price': home_spread_price,
            'home_spread_best_book': home_spread_book,
            'over_best_price': over_price,
            'over_best_book': over_book,
            'under_best_price': under_price,
            'under_best_book': under_book,
            **row,
        })

    return games_list


def run_splits_scraper(run_date=None, book=None):
    run_date = run_date or _today_str()
    master = []
    for league, slug in LEAGUES.items():
        print(f"Scraping {league} public money splits for {run_date}...")
        games = fetch_league_splits(league, slug, run_date=run_date, book=book)
        print(f"  {league}: {len(games)} games")
        master.extend(games)

    return pd.DataFrame(master)


def _fmt(v):
    return '-' if v is None or (isinstance(v, float) and pd.isna(v)) else v


def print_by_league(splits_df, book=None):
    if splits_df.empty:
        print("No games found.")
        return

    for league in LEAGUES:
        league_df = splits_df[splits_df['league'] == league]
        print(f"\n{'=' * 25} {league} ({len(league_df)} games) {'=' * 25}")
        if league_df.empty:
            print("  (no games today)")
            continue

        for _, g in league_df.iterrows():
            print(f"\n{g['away_team']} @ {g['home_team']}")
            print(f"  ML     away {_fmt(g['away_ml_bets_pct'])} bets / {_fmt(g['away_ml_money_pct'])} money"
                  f"   home {_fmt(g['home_ml_bets_pct'])} bets / {_fmt(g['home_ml_money_pct'])} money")
            print(f"  Spread {_fmt(g['away_spread_line'])} ({_fmt(g['away_spread_bets_pct'])} bets/"
                  f"{_fmt(g['away_spread_money_pct'])} money)  |  {_fmt(g['home_spread_line'])} "
                  f"({_fmt(g['home_spread_bets_pct'])} bets/{_fmt(g['home_spread_money_pct'])} money)")
            print(f"  Total  o{_fmt(g['over_line'])} ({_fmt(g['over_bets_pct'])} bets/{_fmt(g['over_money_pct'])} money)")
            print(f"  Best price   ML {_fmt(g['away_ml_best_price'])}({_fmt(g['away_ml_best_book'])})"
                  f"/{_fmt(g['home_ml_best_price'])}({_fmt(g['home_ml_best_book'])})"
                  f"   Spread {_fmt(g['away_spread_best_price'])}({_fmt(g['away_spread_best_book'])})"
                  f"/{_fmt(g['home_spread_best_price'])}({_fmt(g['home_spread_best_book'])})"
                  f"   Total {_fmt(g['over_best_price'])}({_fmt(g['over_best_book'])})"
                  f"/{_fmt(g['under_best_price'])}({_fmt(g['under_best_book'])})")
            if book and f'{book}_away_ml' in g:
                print(f"  {book.title()}     ML {_fmt(g[f'{book}_away_ml'])}/{_fmt(g[f'{book}_home_ml'])}"
                      f"   Spread {_fmt(g[f'{book}_away_spread_line'])} {_fmt(g[f'{book}_away_spread_price'])}"
                      f"/{_fmt(g[f'{book}_home_spread_line'])} {_fmt(g[f'{book}_home_spread_price'])}"
                      f"   Total {_fmt(g[f'{book}_total_line'])} {_fmt(g[f'{book}_over_price'])}"
                      f"/{_fmt(g[f'{book}_under_price'])}")


if __name__ == '__main__':
    book = 'draftkings'
    splits_df = run_splits_scraper(book=book)
    print(f"\nTotal games pulled: {len(splits_df)}")
    print_by_league(splits_df, book=book)
