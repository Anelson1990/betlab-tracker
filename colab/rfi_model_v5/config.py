"""
RFI v5 — shared configuration.

Everything that was a bare constant scattered through the v4 monolith
lives here, in one place, so training and live-run code can't drift out
of sync with each other.
"""

MLB_API = 'https://statsapi.mlb.com/api/v1'
OSS_API = 'https://www.oddlyspecificstats.com/api'
HEADERS = {"User-Agent": "Mozilla/5.0"}

DRIVE = '/content/drive/MyDrive/nrfi_model'

# League baselines (used as shrinkage targets / defaults, not fit values)
LEAGUE_NRFI = 0.514
LEAGUE_FI_RPG = 0.45
LEAGUE_K_PCT = 0.223
LEAGUE_BB_PCT = 0.084

# --- Betting tiers -----------------------------------------------------
# v4 treated "paper" as a superset of "real" (every real bet was also
# counted in paper), and additionally kept a legacy roi['total'] that
# blended both together. That's the "keep separate" bug: a single WR%
# number could quietly mix real-money outcomes with paper-only outcomes.
#
# v5 makes the two tiers mutually exclusive and tracks them in two
# separate files with independent win%, so neither number is ever
# built from the other's bets.
BET_MIN_PAPER = 0.62   # paper-only band: [PAPER, REAL)
BET_MIN_REAL = 0.65    # real-money band: [REAL, 1.0]
WATCH_MIN = 0.55        # below BET_MIN_PAPER but still logged for calibration

STAKE = 10
PAYOUT = STAKE * (100 / 115)   # -115 odds

MIN_STARTS = 5           # pitcher starts required before trusting its own SP stat
BAYES_K = 15              # shrinkage strength for pitcher NRFI% (games-equivalent)
EITHER_SPOT_MIN_CONF = 0.70   # if either starter is unproven, require this much confidence to bet at all

# Team offense/defense rolling stat: v4 used a hard last-15-game window.
# v5 uses an exponentially-weighted mean (smoother, no window-edge
# discontinuity) blended with league average via Bayesian shrinkage
# (weak early season, strong once a team has played enough games).
TEAM_EWMA_HALFLIFE_GAMES = 10   # weight halves every N games back
TEAM_SHRINK_K = 12               # games-equivalent shrinkage toward league avg

# Files (all namespaced rfi_v5_* so this never collides with v4 output
# sitting in the same Drive folder)
REAL_TRACKING_FILE = f'{DRIVE}/rfi_v5_real_tracking.json'
PAPER_TRACKING_FILE = f'{DRIVE}/rfi_v5_paper_tracking.json'
ALL_GRADED_FILE = f'{DRIVE}/rfi_v5_all_graded.json'       # calibration diagnostics only, not a betting record
CAL_FILE = f'{DRIVE}/rfi_v5_calibration.pkl'
PICKS_FILE_TMPL = f'{DRIVE}/rfi_v5_picks_{{date}}.json'
PITCHER_CACHE = f'{DRIVE}/rfi_v5_pitcher_cache.json'
TRAIN_GAMES_FILE = f'{DRIVE}/rfi_v5_training_games.json'   # historical graded games for train_calibration.py

DOMED = {'TBR', 'HOU', 'SEA', 'MIL', 'TOR', 'ARI', 'MIA', 'MIN'}

TEAM_MAP = {
    'Arizona Diamondbacks': 'ARI', 'Atlanta Braves': 'ATL',
    'Baltimore Orioles': 'BAL', 'Boston Red Sox': 'BOS',
    'Chicago Cubs': 'CHC', 'Chicago White Sox': 'CHW',
    'Cincinnati Reds': 'CIN', 'Cleveland Guardians': 'CLE',
    'Colorado Rockies': 'COL', 'Detroit Tigers': 'DET',
    'Houston Astros': 'HOU', 'Kansas City Royals': 'KCR',
    'Los Angeles Angels': 'LAA', 'Los Angeles Dodgers': 'LAD',
    'Miami Marlins': 'MIA', 'Milwaukee Brewers': 'MIL',
    'Minnesota Twins': 'MIN', 'New York Mets': 'NYM',
    'New York Yankees': 'NYY', 'Philadelphia Phillies': 'PHI',
    'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SDP',
    'San Francisco Giants': 'SFG', 'Seattle Mariners': 'SEA',
    'St. Louis Cardinals': 'STL', 'Tampa Bay Rays': 'TBR',
    'Texas Rangers': 'TEX', 'Toronto Blue Jays': 'TOR',
    'Washington Nationals': 'WSH', 'Athletics': 'ATH',
}

WIND_OUT_DIR = {
    'CHC': ['S', 'SW', 'SSW'], 'COL': ['E', 'NE'],
    'SFG': ['E', 'NE', 'SE'], 'BOS': ['W', 'SW'],
    'NYY': ['E', 'NE'], 'CIN': ['W', 'SW', 'NW'], 'PHI': ['W', 'SW'],
}

CITIES = {
    'COL': 'Denver', 'CHC': 'Chicago', 'BOS': 'Boston',
    'NYY': 'Bronx+NY', 'NYM': 'Queens+NY', 'LAD': 'Los+Angeles',
    'SFG': 'San+Francisco', 'TEX': 'Arlington+TX', 'ATL': 'Atlanta',
    'PHI': 'Philadelphia', 'WSH': 'Washington+DC', 'BAL': 'Baltimore',
    'CLE': 'Cleveland', 'DET': 'Detroit', 'CHW': 'Chicago',
    'KCR': 'Kansas+City', 'STL': 'St+Louis', 'PIT': 'Pittsburgh',
    'CIN': 'Cincinnati', 'LAA': 'Anaheim', 'ATH': 'Oakland',
    'SDP': 'San+Diego', 'SEA': 'Seattle', 'MIA': 'Miami',
    'TBR': 'St+Petersburg+FL', 'ARI': 'Phoenix', 'MIL': 'Milwaukee',
    'MIN': 'Minneapolis', 'TOR': 'Toronto',
}
