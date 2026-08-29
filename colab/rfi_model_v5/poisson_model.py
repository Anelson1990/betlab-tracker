"""
RFI v5 — Poisson lambda calculation and probability combination.
Pure math, unchanged in spirit from v4 (this part wasn't the problem —
the input feature quality was). Kept isolated so calibration and
feature changes can be swapped independently.
"""

import math

from config import LEAGUE_FI_RPG, LEAGUE_NRFI


def calc_lambda(sp_fi_era, team_fi_rpg, ump_nrfi, park_nrfi,
                 wind_boost, era_l5, opp_obp=0.320,
                 league_fi_rpg=LEAGUE_FI_RPG, league_nrfi=LEAGUE_NRFI):
    lam_base = (sp_fi_era / 9.0) * 0.70 + (era_l5 / 9.0) * 0.30
    off_adj = (team_fi_rpg - league_fi_rpg) * 0.35
    obp_adj = (opp_obp - 0.320) * 0.6
    park_adj = (league_nrfi - park_nrfi) * 0.4
    ump_adj = (league_nrfi - ump_nrfi) * 0.3
    return max(0.03, min(1.80,
        (lam_base + off_adj + obp_adj + park_adj + ump_adj) * wind_boost))


def poisson_nrfi(lambda_home, lambda_away):
    """P(zero runs from either side in the 1st) under independent Poisson."""
    return math.exp(-lambda_home) * math.exp(-lambda_away)


def combine_probabilities(poi, sp_prod, poi_weight=0.65):
    combined = poi * poi_weight + sp_prod * (1 - poi_weight)
    return max(0.05, min(0.95, combined))


def sp_product_nrfi(home_pitcher_nrfi_pct, away_pitcher_nrfi_pct, league_nrfi=LEAGUE_NRFI):
    return max(0.05, min(0.95, home_pitcher_nrfi_pct * away_pitcher_nrfi_pct / league_nrfi))
