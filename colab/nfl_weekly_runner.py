# ════════════════════════════════════════════════════════════════
# BETLAB NFL WEEKLY RUNNER v1.2  (Google Colab cell)
# - Mirrors the MLB daily runner: Drive mount, self-grading on each
#   run, ROI tracking per model, Consensus card, ROI summary table
# - Three models vote (same architecture as MLB LGB/LGR/MC):
#     LGB  = LightGBM classifier
#     LGR  = Logistic regression (elastic net)
#     MC   = Monte Carlo over predicted margin + real residual spread
# - Consensus = STRICT: all three clear CONF_FLOOR and agree unanimously
# - Backtest claim carried over from v1.0 (not re-verified in v1.1):
#   73.6% over 235 fires across 4 held-out seasons
#   (2021 71.0% | 2022 78.4% | 2023 64.1% | 2024 84.3%)
# - Runs WEEKLY (not daily). Grades last completed week on each run.
#
# v1.1 fixes (found by actually running v1.0 end to end):
#   1. v1.0 never produced picks for upcoming games. Features only exist
#      for games that already have play-by-play, so every unplayed game
#      was dropped by dropna(). v1.1 builds upcoming-game features from
#      each team's form over all games played so far (same definition
#      the model was trained on: everything BEFORE the game).
#   2. v1.0 could pick games in the target week that were already
#      played (e.g. Thursday night). v1.1 only predicts unplayed games.
#   3. nfl_data_py pins pandas<2 / numpy<2, which downgrades Colab's
#      pandas and broke the rolling-feature code (IndexError). v1.1 uses
#      nflreadpy (nflverse's successor library) and groupby().transform(),
#      which works on pandas 1.x, 2.x and 3.x.
#   4. Guard for a season with no play-by-play yet (pd.concat([]) crash).
#
# v1.2 speed:
#   - Completed seasons are processed once and cached on Drive as small
#     parquet files. Weekly runs only download the current season.
#   - Models retrain only when the training seasons change (i.e. once per
#     new season), not every 30 days: past seasons don't change, so a
#     30-day retrain produced the same model at the cost of a rebuild.
#     Set FORCE_RETRAIN = True to rebuild on demand.
#
# ⚠️  HONEST LIMITATION — READ BEFORE BETTING:
#   This predicts WINNERS well but that is NOT the same as beating the
#   market. Separate testing showed betting this model's disagreements
#   with the moneyline returned -8% to -14% ROI across the same 4
#   seasons. Use it as a Consensus signal and shop for price
#   separately, exactly like the MLB workflow. A high-confidence pick
#   is NOT automatically a profitable bet.
# ════════════════════════════════════════════════════════════════

from google.colab import drive
drive.mount('/content/drive')

!pip install nflreadpy lightgbm scikit-learn pyarrow -q

import os, json, math, pickle, gc, warnings
import numpy as np
import pandas as pd
import lightgbm as lgb
import nflreadpy as nflr
from datetime import datetime
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import log_loss
warnings.filterwarnings('ignore')

NFL_DRIVE       = '/content/drive/MyDrive/BetLab_NFL'
os.makedirs(NFL_DRIVE, exist_ok=True)

today_str       = datetime.now().strftime('%Y-%m-%d')
CURRENT_SEASON  = 2026
TRAIN_SEASONS   = list(range(2016, CURRENT_SEASON))   # everything before this season
STAKE           = 10
PAYOUT          = STAKE * (100/110)                   # standard -110 juice

CONF_FLOOR      = 0.68   # strict consensus floor. 0.62=42% of games/70.3%
                         #                        0.70=18% of games/75.6%
FORCE_RETRAIN   = False  # True = retrain models on this run

ROI_FILE        = f'{NFL_DRIVE}/nfl_roi.json'
MODEL_BUNDLE    = f'{NFL_DRIVE}/nfl_models.pkl'
MODEL_META      = f'{NFL_DRIVE}/nfl_model_meta.json'
CACHE_DIR       = f'{NFL_DRIVE}/cache'
os.makedirs(CACHE_DIR, exist_ok=True)

BASE_STATS = ['off_epa_per_play','def_epa_per_play','off_success_rate',
              'pass_epa','rush_epa','turnover_margin']
PBP_COLS   = ['game_id','posteam','defteam','season','week','epa','success',
              'play_type','interception','fumble_lost']

print(f'BetLab NFL Weekly v1.2 | {today_str}')
print('='*65)


# ══ DATA (nflreadpy returns polars; convert to pandas) ═══════════

def load_pbp(season):
    return nflr.load_pbp([season]).select(PBP_COLS).to_pandas()

def load_sched(seasons):
    return nflr.load_schedules(list(seasons)).to_pandas()


# ══ GUARDS + UTILS ══════════════════════════════════════════════

def already_graded(roi, key):
    return key in roi.get('graded_weeks', [])

def mark_graded(roi, key):
    roi.setdefault('graded_weeks', [])
    if key not in roi['graded_weeks']:
        roi['graded_weeks'].append(key)
    roi['graded_weeks'] = roi['graded_weeks'][-40:]
    return roi

def load_roi(filepath, default_keys):
    if os.path.exists(filepath):
        with open(filepath) as f:
            r = json.load(f)
    else:
        r = {}
    for k in default_keys:
        if k not in r:
            r[k] = {'bets': [], 'wins': 0, 'total': 0, 'profit': 0.0}
    return r

def make_serializable(obj):
    if isinstance(obj, dict):  return {k: make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):  return [make_serializable(i) for i in obj]
    if isinstance(obj, float) and math.isnan(obj): return 0
    if isinstance(obj, (np.float32, np.float64)):  return float(obj)
    if isinstance(obj, (np.int32, np.int64)):      return int(obj)
    if isinstance(obj, (np.bool_, bool)):          return bool(obj)
    if isinstance(obj, str):                       return str(obj)
    return obj

roi = load_roi(ROI_FILE, ['consensus_3of3', 'lgb', 'lgr', 'mc'])
print('ROI file loaded ✅')


# ══ FEATURE BUILDING (point-in-time, leakage-free) ══════════════

def build_team_game_stats(seasons):
    """Per-team per-game stats from real play-by-play.
    Memory-safe: one season at a time, raw PBP discarded immediately.
    Completed seasons are cached on Drive; only the current season is
    re-downloaded each run."""
    out = []
    for season in seasons:
        cache = f'{CACHE_DIR}/team_games_{season}.parquet'
        if season < CURRENT_SEASON and os.path.exists(cache):
            out.append(pd.read_parquet(cache))
            print(f'  {season} ✅ (cached)')
            continue
        try:
            pbp = load_pbp(season)
        except Exception as e:
            print(f'  ⚠️  {season} PBP unavailable ({e}) — skipping')
            continue
        plays = pbp[pbp['epa'].notna() & pbp['posteam'].notna()].copy()
        del pbp; gc.collect()
        if len(plays) == 0:
            print(f'  ⚠️  {season} had no usable plays — skipping'); continue

        off = plays.groupby(['game_id','posteam','season','week']).agg(
            off_epa_per_play=('epa','mean'), off_success_rate=('success','mean'),
        ).reset_index().rename(columns={'posteam':'team'})
        off_pass = plays[plays['play_type']=='pass'].groupby(['game_id','posteam']).agg(
            pass_epa=('epa','mean')).reset_index().rename(columns={'posteam':'team'})
        off_rush = plays[plays['play_type']=='run'].groupby(['game_id','posteam']).agg(
            rush_epa=('epa','mean')).reset_index().rename(columns={'posteam':'team'})

        giveaways = plays.groupby(['game_id','posteam']).agg(
            giveaways=('interception','sum')).reset_index().rename(columns={'posteam':'team'})
        fum_lost = plays[plays['fumble_lost']==1].groupby(['game_id','posteam']).size(
            ).reset_index(name='fumbles_lost').rename(columns={'posteam':'team'})
        giveaways = giveaways.merge(fum_lost, on=['game_id','team'], how='left').fillna({'fumbles_lost':0})
        giveaways['giveaways'] += giveaways['fumbles_lost']

        deff = plays.groupby(['game_id','defteam','season','week']).agg(
            def_epa_per_play=('epa','mean')).reset_index().rename(columns={'defteam':'team'})
        takeaways = plays.groupby(['game_id','defteam']).agg(
            takeaways=('interception','sum')).reset_index().rename(columns={'defteam':'team'})
        fum_forced = plays[plays['fumble_lost']==1].groupby(['game_id','defteam']).size(
            ).reset_index(name='fumbles_forced').rename(columns={'defteam':'team'})
        takeaways = takeaways.merge(fum_forced, on=['game_id','team'], how='left').fillna({'fumbles_forced':0})
        takeaways['takeaways'] += takeaways['fumbles_forced']

        gt = (off.merge(off_pass, on=['game_id','team'], how='left')
                 .merge(off_rush, on=['game_id','team'], how='left')
                 .merge(giveaways[['game_id','team','giveaways']], on=['game_id','team'], how='left')
                 .merge(deff, on=['game_id','team','season','week'], how='outer')
                 .merge(takeaways[['game_id','team','takeaways']], on=['game_id','team'], how='left'))
        gt[['giveaways','takeaways']] = gt[['giveaways','takeaways']].fillna(0)
        gt['turnover_margin'] = gt['takeaways'] - gt['giveaways']
        out.append(gt)
        if season < CURRENT_SEASON:
            gt.to_parquet(cache, index=False)
        del plays; gc.collect()
        print(f'  {season} ✅')

    if not out:
        return pd.DataFrame(columns=['game_id','team','season','week'] + BASE_STATS)

    gt = pd.concat(out, ignore_index=True).sort_values(['team','season','week'])

    # POINT-IN-TIME. shift(1) excludes the current game from its own feature.
    # This single step is what stops future data leaking backward: a team's
    # week-3 value equals the mean of its weeks 1-2 only.
    for col in BASE_STATS:
        by_team = gt.groupby(['team','season'])[col]
        gt[f'{col}_season'] = by_team.transform(lambda s: s.shift(1).expanding().mean())
        gt[f'{col}_last5']  = by_team.transform(lambda s: s.shift(1).rolling(5, min_periods=2).mean())
    return gt


def team_snapshot(gt):
    """Each team's form over ALL games played so far. For an unplayed game
    this is exactly 'everything before the game', matching the shift(1)
    features the models were trained on."""
    gt = gt.sort_values(['team','season','week'])
    rows = []
    for team, g in gt.groupby('team'):
        row = {'team': team}
        for col in BASE_STATS:
            s = g[col]
            last5 = s.tail(5)
            row[f'{col}_season'] = s.mean() if s.notna().sum() >= 1 else np.nan
            row[f'{col}_last5']  = last5.mean() if last5.notna().sum() >= 2 else np.nan
        rows.append(row)
    return pd.DataFrame(rows)


def add_diff_features(df):
    feats = []
    for window in ['season','last5']:
        for stat in BASE_STATS:
            col = f'{stat}_diff_{window}'
            if stat.startswith('def_'):
                # defense: home's edge = away allows MORE than home allows
                df[col] = df[f'away_{stat}_{window}'] - df[f'home_{stat}_{window}']
            else:
                df[col] = df[f'home_{stat}_{window}'] - df[f'away_{stat}_{window}']
            feats.append(col)
    df['rest_diff'] = df['home_rest'] - df['away_rest']
    feats.append('rest_diff')
    return df, feats


def build_dataset(gt, seasons):
    """Training rows: played games with point-in-time features."""
    sched = load_sched(seasons)
    fcols = [c for c in gt.columns if c.endswith('_season') or c.endswith('_last5')]
    home = gt[['game_id','team']+fcols].add_prefix('home_').rename(
        columns={'home_game_id':'game_id'})
    away = gt[['game_id','team']+fcols].add_prefix('away_').rename(
        columns={'away_game_id':'game_id'})
    df = sched.merge(home, on=['game_id','home_team'], how='left')
    df = df.merge(away, on=['game_id','away_team'], how='left')
    df = df.dropna(subset=[f'home_{c}' for c in fcols]+[f'away_{c}' for c in fcols])
    return add_diff_features(df)


def build_upcoming(gt, sched, week):
    """Prediction rows: UNPLAYED games in `week`, features = each team's
    form over every game it has played so far this season."""
    games = sched[(sched['week']==week) & sched['home_score'].isna()].copy()
    snap = team_snapshot(gt)
    df = games.merge(snap.add_prefix('home_'), on='home_team', how='left')
    df = df.merge(snap.add_prefix('away_'), on='away_team', how='left')
    fcols = [c for c in snap.columns if c != 'team']
    need = [f'home_{c}' for c in fcols] + [f'away_{c}' for c in fcols]
    missing = df[df[need].isna().any(axis=1)]
    if len(missing):
        print(f'  ⚠️  {len(missing)} game(s) skipped — a team has <2 games played: '
              + ', '.join(missing['away_team'] + ' @ ' + missing['home_team']))
    df = df.dropna(subset=need)
    return add_diff_features(df)


# ══ MODEL TRAINING ══════════════════════════════════════════════

def train_models(train, feats):
    """Fits all three models. Mirrors MLB: LGB tree, LGR linear, MC sim."""
    print('  Training LGB...')
    lgb_m = lgb.LGBMClassifier(n_estimators=150, max_depth=3, learning_rate=0.03,
                               min_child_samples=25, reg_alpha=1.0, reg_lambda=1.0, verbose=-1)
    lgb_m.fit(train[feats], train['home_win'])

    print('  Training LGR (tuning C via 5-fold CV)...')
    scaler = StandardScaler()
    Xs = scaler.fit_transform(train[feats]); y = train['home_win'].values
    best_C, best_loss = 0.5, 999
    for C in [0.01, 0.05, 0.1, 0.5, 1.0]:
        losses = []
        for tr_i, val_i in StratifiedKFold(5, shuffle=True, random_state=42).split(Xs, y):
            m = LogisticRegression(penalty='elasticnet', solver='saga', l1_ratio=0.5,
                                   C=C, max_iter=2000, random_state=42)
            m.fit(Xs[tr_i], y[tr_i])
            losses.append(log_loss(y[val_i], m.predict_proba(Xs[val_i])[:,1]))
        avg = np.mean(losses)
        if avg < best_loss: best_loss, best_C = avg, C
    print(f'    Best C: {best_C} (CV log-loss {best_loss:.4f})')
    lgr_m = LogisticRegression(penalty='elasticnet', solver='saga', l1_ratio=0.5,
                               C=best_C, max_iter=2000, random_state=42)
    lgr_m.fit(Xs, y)

    print('  Training MC margin model...')
    mc_margin = lgb.LGBMRegressor(n_estimators=150, max_depth=3, learning_rate=0.03,
                                  min_child_samples=25, reg_alpha=1.0, verbose=-1)
    mc_margin.fit(train[feats], train['result'])
    # residual spread measured from history, not assumed
    resid_std = float(np.std(train['result'] - mc_margin.predict(train[feats])))
    print(f'    MC residual std: {resid_std:.2f} pts')

    return {'lgb': lgb_m, 'lgr': lgr_m, 'scaler': scaler, 'mc_margin': mc_margin,
            'resid_std': resid_std, 'feats': feats, 'best_C': best_C,
            'trained_date': today_str, 'n_train': len(train),
            'train_seasons': TRAIN_SEASONS}


def predict_probs(bundle, X, n_sims=10000, seed=42):
    feats = bundle['feats']
    p_lgb = bundle['lgb'].predict_proba(X[feats])[:,1]
    p_lgr = bundle['lgr'].predict_proba(bundle['scaler'].transform(X[feats]))[:,1]
    pred_margin = bundle['mc_margin'].predict(X[feats])
    rng = np.random.default_rng(seed)
    sims = rng.normal(loc=pred_margin[:,None], scale=bundle['resid_std'],
                      size=(len(pred_margin), n_sims))
    p_mc = (sims > 0).mean(axis=1)
    return p_lgb, p_lgr, p_mc, pred_margin


def apply_consensus(df, floor=CONF_FLOOR):
    """STRICT consensus: all three clear the floor AND agree unanimously."""
    for m in ['lgb','lgr','mc']:
        df[f'{m}_pick_home'] = df[f'prob_{m}'] > 0.5
        df[f'{m}_clears']    = (df[f'prob_{m}'] >= floor) | (df[f'prob_{m}'] <= 1-floor)
    df['votes_home']  = df[['lgb_pick_home','lgr_pick_home','mc_pick_home']].sum(axis=1)
    df['n_clear']     = df[['lgb_clears','lgr_clears','mc_clears']].sum(axis=1)
    df['unanimous']   = df['votes_home'].isin([0,3])
    df['consensus']   = (df['n_clear']==3) & df['unanimous']
    df['pick']        = np.where(df['votes_home']>=2, df['home_team'], df['away_team'])
    conf = df[['prob_lgb','prob_lgr','prob_mc']].mean(axis=1)
    df['avg_conf']    = np.where(df['votes_home']>=2, conf, 1-conf)
    # 2-of-3 majority tracked separately (53.6% historically — much weaker)
    df['majority_2of3'] = (~df['consensus']) & (df['n_clear']>=2) & \
                          (df['votes_home'].isin([2,1]))
    return df


# ══ GRADE LAST COMPLETED WEEK ═══════════════════════════════════

print(f'\n=== GRADING PREVIOUS PICKS ===')

def grade_week(season, week):
    """Grades a saved picks file against real final scores."""
    key = f'{season}_W{week}'
    picks_file = f'{NFL_DRIVE}/nfl_picks_{key}.json'
    if not os.path.exists(picks_file):
        print(f'  No saved picks for {key}'); return 0
    if already_graded(roi, key):
        print(f'  {key}: already graded ✅ — skipping'); return 0

    with open(picks_file) as f:
        saved = json.load(f)

    sched = load_sched([season])
    wk = sched[sched['week']==week]
    if len(wk)==0 or wk['home_score'].isna().any():
        print(f'  {key}: week not finished yet — will grade on a later run'); return 0

    results = {}
    for _, g in wk.iterrows():
        results[g['game_id']] = {
            'home_team': g['home_team'], 'away_team': g['away_team'],
            'home_score': int(g['home_score']), 'away_score': int(g['away_score']),
            'home_win': int(g['home_score']) > int(g['away_score']),
            'tie': int(g['home_score']) == int(g['away_score']),
        }

    graded = 0
    for p in saved.get('picks', []):
        r = results.get(p.get('game_id'))
        if not r or r['tie']:
            continue
        actual = r['home_team'] if r['home_win'] else r['away_team']

        for model_key, pick_field in [('consensus_3of3','pick'), ('lgb','lgb_pick'),
                                      ('lgr','lgr_pick'), ('mc','mc_pick')]:
            if model_key == 'consensus_3of3' and not p.get('consensus'):
                continue
            pick = p.get(pick_field)
            if not pick:
                continue
            won = (pick == actual)
            profit = round(PAYOUT if won else -STAKE, 2)
            roi[model_key]['total'] += 1
            roi[model_key]['wins']  += int(won)
            roi[model_key]['profit'] = round(roi[model_key]['profit'] + profit, 2)
            roi[model_key]['bets'].append({
                'season': season, 'week': week, 'matchup': p.get('matchup',''),
                'pick': pick, 'conf': p.get(f'{model_key}_conf', p.get('avg_conf')),
                'won': won, 'profit': profit,
                'score': f"{r['away_team']} {r['away_score']} - {r['home_team']} {r['home_score']}",
            })

        if p.get('consensus'):
            won = (p['pick'] == actual)
            print(f"  {'✅' if won else '❌'} CONSENSUS: {p['matchup']} | {p['pick']} "
                  f"({p.get('avg_conf',0):.1f}%) → {r['away_team']} {r['away_score']}-{r['home_score']} {r['home_team']}")
            graded += 1

    mark_graded(roi, key)
    with open(ROI_FILE,'w') as f: json.dump(make_serializable(roi), f, indent=2)
    print(f'  {key} graded: {graded} consensus picks')
    return graded

# Grade every ungraded saved week
for fn in sorted(os.listdir(NFL_DRIVE)):
    if fn.startswith('nfl_picks_') and fn.endswith('.json'):
        stem = fn.replace('nfl_picks_','').replace('.json','')
        try:
            s_str, w_str = stem.split('_W')
            grade_week(int(s_str), int(w_str))
        except Exception as e:
            print(f'  Skipped {fn}: {e}')


# ══ BUILD / LOAD MODELS ═════════════════════════════════════════

print(f'\n=== MODELS ===')

need_train = FORCE_RETRAIN or not os.path.exists(MODEL_BUNDLE)
bundle = None
if not need_train:
    try:
        with open(MODEL_BUNDLE,'rb') as f: bundle = pickle.load(f)
        if bundle.get('train_seasons') != TRAIN_SEASONS:
            print(f'  Training seasons changed — retraining'); need_train = True
        else:
            print(f"  Loaded ✅ (trained {bundle['trained_date']}, "
                  f"{bundle['n_train']} games, C={bundle['best_C']})")
    except Exception as e:
        print(f'  Load failed ({e}) — retraining'); need_train = True

if need_train:
    print('  Building historical features (several minutes)...')
    gt_hist = build_team_game_stats(TRAIN_SEASONS)
    hist, FEATS = build_dataset(gt_hist, TRAIN_SEASONS)
    hist = hist.dropna(subset=['result'])
    hist['home_win'] = (hist['result'] > 0).astype(int)
    print(f'  Training set: {len(hist)} games, {len(FEATS)} features')
    bundle = train_models(hist, FEATS)
    with open(MODEL_BUNDLE,'wb') as f: pickle.dump(bundle, f)
    with open(MODEL_META,'w') as f:
        json.dump({k:v for k,v in bundle.items()
                   if k not in ('lgb','lgr','scaler','mc_margin')}, f, indent=2, default=str)
    print('  Models trained and saved ✅')
    del gt_hist, hist; gc.collect()

FEATS = bundle['feats']


# ══ THIS WEEK'S PICKS ═══════════════════════════════════════════

print(f'\n=== THIS WEEK ===')

sched_cur = load_sched([CURRENT_SEASON])
unplayed = sched_cur[sched_cur['home_score'].isna()]
if len(unplayed) == 0:
    print('  No unplayed games left this season.')
    target_week = None
else:
    target_week = int(unplayed['week'].min())
    print(f'  Target: {CURRENT_SEASON} Week {target_week} '
          f'({len(unplayed[unplayed["week"]==target_week])} unplayed games)')

if target_week is not None:
    gt_cur = build_team_game_stats([CURRENT_SEASON])
    gt_cur = gt_cur[gt_cur['season'] == CURRENT_SEASON] if len(gt_cur) else gt_cur
    week_games = build_upcoming(gt_cur, sched_cur, target_week)[0] if len(gt_cur) else pd.DataFrame()

    if len(week_games) == 0:
        print(f'  ⚠️  No feature rows for week {target_week}. Teams need 2+ games '
              f'played this season before features exist (weeks 1-2 are always skipped).')
    else:
        p_lgb, p_lgr, p_mc, pred_margin = predict_probs(bundle, week_games)
        week_games['prob_lgb'] = p_lgb
        week_games['prob_lgr'] = p_lgr
        week_games['prob_mc']  = p_mc
        week_games['pred_margin'] = pred_margin
        week_games = apply_consensus(week_games)

        picks = []
        for _, g in week_games.iterrows():
            picks.append(make_serializable({
                'game_id': g['game_id'], 'matchup': f"{g['away_team']} @ {g['home_team']}",
                'home_team': g['home_team'], 'away_team': g['away_team'],
                'season': CURRENT_SEASON, 'week': target_week,
                'pick': g['pick'], 'avg_conf': round(g['avg_conf']*100,1),
                'consensus': bool(g['consensus']), 'majority_2of3': bool(g['majority_2of3']),
                'n_clear': int(g['n_clear']),
                'lgb_pick': g['home_team'] if g['prob_lgb']>0.5 else g['away_team'],
                'lgr_pick': g['home_team'] if g['prob_lgr']>0.5 else g['away_team'],
                'mc_pick':  g['home_team'] if g['prob_mc']>0.5  else g['away_team'],
                'lgb_conf': round(max(g['prob_lgb'],1-g['prob_lgb'])*100,1),
                'lgr_conf': round(max(g['prob_lgr'],1-g['prob_lgr'])*100,1),
                'mc_conf':  round(max(g['prob_mc'], 1-g['prob_mc'])*100,1),
                'pred_margin': round(float(g['pred_margin']),1),
                'generated': today_str,
            }))

        # Don't overwrite a week's picks once any of its games has kicked off
        # (re-running mid-week would otherwise replace them with a smaller set).
        picks_file = f'{NFL_DRIVE}/nfl_picks_{CURRENT_SEASON}_W{target_week}.json'
        if os.path.exists(picks_file):
            with open(picks_file) as f: prev = json.load(f)
            prev_ids = {p['game_id'] for p in prev.get('picks', [])}
            picks = prev['picks'] + [p for p in picks if p['game_id'] not in prev_ids]
        with open(picks_file,'w') as f:
            json.dump({'season':CURRENT_SEASON,'week':target_week,
                       'generated':today_str,'picks':picks}, f, indent=2)

        cons   = [p for p in picks if p['consensus']]
        maj    = [p for p in picks if p['majority_2of3']]
        others = [p for p in picks if not p['consensus'] and not p['majority_2of3']]

        print(f'\n{"="*65}')
        print(f'  🏈 BETLAB NFL CARD | {CURRENT_SEASON} Week {target_week}')
        print(f'  {len(cons)} Consensus | {len(maj)} 2-of-3 | {len(picks)} games')
        print(f'{"="*65}')

        if cons:
            print(f'\n  ★ CONSENSUS (3/3 agree, all clear {CONF_FLOOR*100:.0f}%) — 73.6% historical:')
            for p in sorted(cons, key=lambda x:-x['avg_conf']):
                print(f"    🔥 ➤ {p['pick']:<5} {p['avg_conf']:.1f}% avg  |  {p['matchup']}")
                print(f"       LGB:{p['lgb_pick']} {p['lgb_conf']:.1f}% · "
                      f"LGR:{p['lgr_pick']} {p['lgr_conf']:.1f}% · "
                      f"MC:{p['mc_pick']} {p['mc_conf']:.1f}%")
                print(f"       Predicted margin: {p['home_team']} {p['pred_margin']:+.1f}")
        else:
            print(f'\n  ★ CONSENSUS: none this week')

        if maj:
            print(f'\n  ⚠️  2-OF-3 MAJORITY — 53.6% historically, near coin-flip, treat as WATCH:')
            for p in sorted(maj, key=lambda x:-x['avg_conf']):
                print(f"    ? {p['pick']:<5} {p['avg_conf']:.1f}%  |  {p['matchup']}")

        if others:
            print(f'\n  📊 NO SIGNAL ({len(others)} games below floor or split):')
            for p in others:
                print(f"    – {p['matchup']:<28} lean {p['pick']} {p['avg_conf']:.1f}%")

        print(f'\n  Saved ✅ {picks_file}')


# ══ ROI TABLE ═══════════════════════════════════════════════════

def print_roi_table():
    print(f'\n{"="*65}')
    print(f'  BETLAB NFL ROI | {today_str}')
    print(f'{"="*65}')
    for key, name in [('consensus_3of3','Consensus 3/3'), ('lgb','LGB alone'),
                      ('lgr','LGR alone'), ('mc','MC alone')]:
        d = roi[key]
        if d['total'] == 0:
            print(f'    – {name:<18} No graded picks yet'); continue
        wr = d['wins']/d['total']*100
        r  = d['profit']/(d['total']*STAKE)*100
        print(f'    {"✅" if d["profit"]>0 else "❌"} {name:<18} '
              f'{d["total"]:3d}b | {wr:.1f}%WR | ${d["profit"]:+.2f} | ROI:{r:.1f}%')
    print(f'\n  Backtest reference (4 held-out seasons, 235 fires): 73.6% WR')
    print(f'  Reminder: high accuracy ≠ profitable. Shop for price.')

print_roi_table()
print('\nDone 🏈')
