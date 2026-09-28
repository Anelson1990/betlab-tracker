# NHL PREDICTION SYSTEM v12.0 — COLAB
# One cell, one tap. NHL API + ESPN odds + Daily Faceoff + MoneyPuck + Dixon-Coles
#  - Moneyline model (fixed v11.2 bugs, see CHANGELOG at bottom)
#  - Player shots-on-goal (SOG) model: rate/60 x projected TOI x opponent factor, negative binomial
#  - Self-grading ledger on Drive: tracks ML and SOG win/loss, units, ROI, calibration

GAME_DATE = None      # None = today (Central time), or '2026-10-07'
ODDS_KEY  = None      # The Odds API key (optional). Needed for REAL SOG prop lines + backup ML odds.
# Manual SOG lines if you have no Odds API key: {'Auston Matthews': (3.5, -120, -110)}  = (line, over odds, under odds)
PROP_LINES = {}
TZ = 'America/Chicago'

# ── Bet / tracking thresholds (edit freely) ──
ML_TRACK_MIN_EDGE = 2.0   # ML picks with edge >= this % count as BETS in the record (all games still tracked for accuracy)
SOG_MIN_EDGE      = 5.0   # % edge needed for a SOG pick on a REAL line (Odds API / PROP_LINES)
SOG_MIN_EDGE_EST  = 8.0   # % edge needed when the line is ESTIMATED (no real line available)
SOG_EST_VIG       = 0.045 # vig added to the naive-average benchmark price for estimated lines
SOG_MAX_PICKS     = 10    # max SOG picks per slate
SOG_PLAYERS_PER_TEAM = 8  # skaters projected per team (by expected SOG)
HOME_SOG_ADJ      = 1.00  # multiplier on home players' SOG (1.00 = none; arena scorer bias is not modelled)

import sys,os,math,json,warnings,difflib,unicodedata
from dataclasses import dataclass
from datetime import datetime,timedelta
from math import lgamma,exp,log
from io import StringIO
import numpy as np,pandas as pd,requests
from scipy.optimize import minimize
from scipy.special import gammaln
from scipy.stats import skellam as skellam_dist,nbinom,poisson
warnings.filterwarnings('ignore')
try:
    from zoneinfo import ZoneInfo;TZI=ZoneInfo(TZ)
except Exception:
    from datetime import timezone;TZI=timezone(timedelta(hours=-6))
try:
    from google.colab import drive
    drive.mount('/content/drive')
    DRIVE='/content/drive/MyDrive/nhl_model';os.makedirs(DRIVE,exist_ok=True)
except Exception: DRIVE='.'
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
L3=0.15
game_date=GAME_DATE or datetime.now(TZI).strftime('%Y-%m-%d')
GD=datetime.strptime(game_date,'%Y-%m-%d')
def season_of(d): return f'{d.year}{d.year+1}' if d.month>=7 else f'{d.year-1}{d.year}'
SEASON=season_of(GD);PREV_SEASON=f'{int(SEASON[:4])-1}{SEASON[:4]}'
SYR=int(SEASON[:4]);PSYR=SYR-1   # MoneyPuck season-year folders
def po_mult(gn=None):
    if gn==7: return 0.90
    if gn==1: return 0.92
    return 0.94
TM={'ANA':'Anaheim Ducks','BOS':'Boston Bruins','BUF':'Buffalo Sabres','CGY':'Calgary Flames','CAR':'Carolina Hurricanes','CHI':'Chicago Blackhawks','COL':'Colorado Avalanche','CBJ':'Columbus Blue Jackets','DAL':'Dallas Stars','DET':'Detroit Red Wings','EDM':'Edmonton Oilers','FLA':'Florida Panthers','LAK':'Los Angeles Kings','MIN':'Minnesota Wild','MTL':'Montréal Canadiens','NSH':'Nashville Predators','NJD':'New Jersey Devils','NYI':'New York Islanders','NYR':'New York Rangers','OTT':'Ottawa Senators','PHI':'Philadelphia Flyers','PIT':'Pittsburgh Penguins','SJS':'San Jose Sharks','SEA':'Seattle Kraken','STL':'St. Louis Blues','TBL':'Tampa Bay Lightning','TOR':'Toronto Maple Leafs','UTA':'Utah Mammoth','VAN':'Vancouver Canucks','VGK':'Vegas Golden Knights','WSH':'Washington Capitals','WPG':'Winnipeg Jets'}
_N={}
for a,n in TM.items(): _N[n.lower()]=a;_N[a.lower()]=a;_N[n.lower().replace('é','e')]=a
_N.update({'utah hockey club':'UTA','utah':'UTA','montreal':'MTL','st louis blues':'STL','st. louis':'STL'})
CO={'ANA':(33.81,-117.88),'BOS':(42.37,-71.06),'BUF':(42.87,-78.88),'CGY':(51.04,-114.05),'CAR':(35.80,-78.72),'CHI':(41.88,-87.67),'COL':(39.75,-105.00),'CBJ':(39.97,-83.01),'DAL':(32.79,-96.81),'DET':(42.33,-83.05),'EDM':(53.55,-113.50),'FLA':(26.16,-80.33),'LAK':(34.04,-118.27),'MIN':(44.94,-93.10),'MTL':(45.50,-73.57),'NSH':(36.16,-86.78),'NJD':(40.73,-74.17),'NYI':(40.72,-73.73),'NYR':(40.75,-73.99),'OTT':(45.30,-75.93),'PHI':(39.90,-75.17),'PIT':(40.44,-80.00),'SJS':(37.33,-121.90),'SEA':(47.62,-122.35),'STL':(38.63,-90.20),'TBL':(27.94,-82.45),'TOR':(43.64,-79.38),'UTA':(40.77,-111.90),'VAN':(49.28,-123.11),'VGK':(36.10,-115.18),'WSH':(38.90,-77.02),'WPG':(49.89,-97.14)}
def resolve(name):
    k=name.strip().lower()
    if k in _N: return _N[k]
    m=difflib.get_close_matches(k,_N.keys(),n=1,cutoff=0.6)
    if m: return _N[m[0]]
    raise ValueError(f'Unknown: {name}')
def norm_name(s):
    s=unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().lower()
    return ' '.join(s.replace('.','').replace('-',' ').split())
def hav(a1,o1,a2,o2):
    R=6371;dl=math.radians(a2-a1);dn=math.radians(o2-o1)
    a=math.sin(dl/2)**2+math.cos(math.radians(a1))*math.cos(math.radians(a2))*math.sin(dn/2)**2
    return R*2*math.atan2(math.sqrt(a),math.sqrt(1-a))
def d2a(d):
    if d<=1: return 0
    return int(round((d-1)*100)) if d>=2 else int(round(-100/(d-1)))
def num(x,default=0.0):
    """Parse odds/numbers that may arrive as '-150', '+120', 'EVEN', None."""
    if x is None: return default
    if isinstance(x,(int,float)): return float(x)
    s=str(x).strip().upper()
    if s in('EVEN','EV','PK'): return 100.0
    try: return float(s.replace('+',''))
    except ValueError: return default
def o2p(o):
    if o==0: return 50.0
    if 1.01<o<30: o=d2a(o)
    if o>=100: return 100/(o+100)*100
    if o<=-100: return abs(o)/(abs(o)+100)*100
    return 50.0
def payout(odds): return odds/100 if odds>=100 else 100/abs(odds) if odds<=-100 else 0
def fmt(utc):
    try: return datetime.fromisoformat(utc.replace('Z','+00:00')).astimezone(TZI).strftime('%b %d %I:%M%p %Z')
    except Exception: return 'TBD'
def toi_min(s):
    try: m,sec=str(s).split(':');return int(m)+int(sec)/60
    except Exception: return None
@dataclass
class TS:
    team:str;gp:int=0;gf:int=0;ga:int=0;w:int=0;l:int=0
@dataclass
class GL:
    date:str;opp:str;gf:int=0;ga:int=0;xgf:float=0;xga:float=0;home:bool=True
@dataclass
class GP:
    name:str='Unknown';sv:float=.905;gp:int=0;gaa:float=2.80;gsax:float=0;conf:bool=False;news:str=''
@dataclass
class INJ:
    player:str;pos:str;team:str='';rating:float=50;xgi:float=0
@dataclass
class SC:
    rest:int=2;travel:int=0;g7d:int=3;home:bool=True
@dataclass
class VL:
    hml:float=0;aml:float=0;spread:float=0;total:float=0;src:str=''
WARN=[]
def warn(msg): WARN.append(msg);print(f'  !! {msg}')
import time
def http_get(url,tries=3,sess=None,**kw):
    """GET with retry + backoff (1s, 2s) on timeouts/5xx/429. Returns the Response, or None if it never connected."""
    kw.setdefault('timeout',15);r=None
    for i in range(tries):
        try:
            r=(sess or requests).get(url,**kw)
            if r.ok or (r.status_code<500 and r.status_code!=429): return r
        except Exception as e:
            if i==tries-1: print(f'  HTTP fail {url.split("?")[0][-60:]}: {e}')
        if i<tries-1: time.sleep(2**i)
    return r

# ── NHL API ───────────────────────────────────────────────
class NHL:
    B='https://api-web.nhle.com/v1'
    def __init__(self): self._c={};self.fails=0;self._s=requests.Session();self._s.headers['User-Agent']=UA
    def _g(self,u):
        if u in self._c: return self._c[u]
        try:
            r=http_get(u,sess=self._s)
            if r is not None and r.ok: self._c[u]=r.json();return self._c[u]
            self.fails+=1
        except Exception as e: self.fails+=1;print(f'  NHL err {u.split("/v1/")[-1]}: {e}')
        return None
    def sched(self,d):
        data=self._g(f'{self.B}/schedule/{d}')
        if not data: return[]
        for w in data.get('gameWeek',[]):
            if w.get('date')==d: return w.get('games',[])
        return[]   # v11.2 returned another day's games here
    def stand(self,d):
        data=self._g(f'{self.B}/standings/{d}') or self._g(f'{self.B}/standings/now')
        if not data: return{}
        return{e.get('teamAbbrev',{}).get('default',''):{'gp':e.get('gamesPlayed',0),'w':e.get('wins',0),'l':e.get('losses',0),'gf':e.get('goalFor',0),'ga':e.get('goalAgainst',0)} for e in data.get('standings',[]) if e.get('teamAbbrev',{}).get('default','')}
    def tsched(self,tri,season=None):
        d=self._g(f'{self.B}/club-schedule-season/{tri}/{season or SEASON}');return d.get('games',[]) if d else[]
    def boxscore(self,gid): return self._g(f'{self.B}/gamecenter/{int(gid)}/boxscore')
    def roster(self,tri):
        d=self._g(f'{self.B}/roster/{tri}/current')
        if not d: return set()
        return {int(p['id']) for grp in('forwards','defensemen') for p in d.get(grp,[]) if p.get('id')}
    def gamelog(self,pid,season,gtype):
        d=self._g(f'{self.B}/player/{int(pid)}/game-log/{season}/{gtype}');return d.get('gameLog',[]) if d else[]
FINAL_STATES=('OFF','FINAL')
def done(g,types): return g.get('gameState','') in FINAL_STATES and g.get('gameType') in types

# ── NHL Stats REST API (team + skater season totals) ──────
class ST:
    B='https://api.nhle.com/stats/rest/en';_c={}
    @staticmethod
    def _rows(path,season,gtype=2):
        k=(path,season,gtype)
        if k in ST._c: return ST._c[k]
        rows=[]
        try:
            r=http_get(f'{ST.B}/{path}',params={'isAggregate':'false','isGame':'false','start':0,'limit':-1,
                'cayenneExp':f'seasonId={season} and gameTypeId={gtype}'},headers={'User-Agent':UA},timeout=20)
            if r is not None and r.ok: rows=r.json().get('data',[])
        except Exception as e: print(f'  Stats {path} {season}: {e}')
        ST._c[k]=rows;return rows
    @staticmethod
    def skaters(season,gtype=2): return ST._rows('skater/summary',season,gtype)
    @staticmethod
    def teams(season,gtype=2): return ST._rows('team/summary',season,gtype)

# ── MoneyPuck ─────────────────────────────────────────────
class MP:
    B='https://moneypuck.com/moneypuck/playerData/seasonSummary/{yr}/regular';_c={}
    @staticmethod
    def _csv(k,yr=None):
        yr=yr or SYR
        if (k,yr) in MP._c: return MP._c[(k,yr)]
        df=pd.DataFrame()
        try:
            r=http_get(f'{MP.B.format(yr=yr)}/{k}.csv',headers={'User-Agent':UA},timeout=25)
            if r is None: raise IOError('no response')
            if r.ok and ',' in r.text[:100]:
                df=pd.read_csv(StringIO(r.text));print(f'  MP {k} {yr}: {len(df)}r')
            else: print(f'  MP {k} {yr}: HTTP {r.status_code}')
        except Exception as e: print(f'  MP {k} {yr}: {e}')
        MP._c[(k,yr)]=df;return df
    @staticmethod
    def skaters(yr=None): return MP._csv('skaters',yr)
    @staticmethod
    def goalies(yr=None): return MP._csv('goalies',yr)
    @staticmethod
    def teams(yr=None): return MP._csv('teams',yr)
    @staticmethod
    def _txg1(tri,yr):
        df=MP.teams(yr)
        if df.empty: return None
        ta=df[(df['team']==tri)&(df['situation']=='all')]
        if ta.empty: return None
        r=ta.iloc[0];gp=r.get('games_played',0) or 0
        if gp<=0: return None
        return r.get('xGoalsFor',0)/gp,r.get('xGoalsAgainst',0)/gp,gp
    @staticmethod
    def lg_xg():
        for yr in(SYR,PSYR):
            df=MP.teams(yr)
            if not df.empty:
                a=df[df['situation']=='all']
                if not a.empty and a['games_played'].sum()>0: return float(a['xGoalsFor'].sum()/a['games_played'].sum())
        return 2.80
    @staticmethod
    def txg(tri,lg):
        """Current-season xGF/xGA per game + games played, and a prior from last season regressed 1/3 to league."""
        cur=MP._txg1(tri,SYR);prev=MP._txg1(tri,PSYR)
        pf,pa=(prev[0]*2/3+lg/3,prev[1]*2/3+lg/3) if prev else(lg,lg)
        if cur: return cur[0],cur[1],cur[2],pf,pa
        return pf,pa,0,pf,pa
    @staticmethod
    def pxi(name,team=None):
        df=MP.skaters()
        if df.empty: df=MP.skaters(PSYR)
        if df.empty or 'onIce_xGoalsPercentage' not in df.columns: return 0
        d5=df[df['situation']=='5on5']
        mask=d5['name'].map(norm_name)==norm_name(name)
        if team: mask=mask&(d5['team']==team)
        m=d5[mask]
        if m.empty: return 0
        p=m.iloc[0];on=p.get('onIce_xGoalsPercentage',.5);off=p.get('offIce_xGoalsPercentage',.5)
        gp=max(p.get('games_played',1),1);toi=p.get('icetime',0)/(gp*60)
        return(on-off)*2.80*min(toi/60,.35)*2
    @staticmethod
    def top(tri,team_xg,lg,n=5):
        df=MP.skaters()
        if df.empty: return[]
        d=df[(df['team']==tri)&(df['situation']=='all')&(df['games_played']>=5)].sort_values('gameScore',ascending=False)
        mult=team_xg/lg if lg>0 else 1;props=[]
        for _,p in d.head(n).iterrows():
            gp=max(p.get('games_played',1),1);pg=p.get('I_F_goals',0)/gp*mult
            pa=(p.get('I_F_primaryAssists',0)+p.get('I_F_secondaryAssists',0))/gp*mult
            props.append({'name':p.get('name',''),'team':tri,'g':round(pg,2),'a':round(pa,2),'pts':round(pg+pa,2),
                'p_goal':1-exp(-pg),'p_pt':1-exp(-(pg+pa))})
        return props
    @staticmethod
    def gsax(name,team=None):
        df=MP.goalies()
        if df.empty: return 0
        da=df[df['situation']=='all']
        mask=da['name'].map(norm_name)==norm_name(name)
        if team: mask=mask&(da['team']==team)
        m=da[mask]
        if m.empty: return 0
        return m.iloc[0].get('xGoals',0)-m.iloc[0].get('goals',0)

# ── Daily Faceoff ─────────────────────────────────────────
class DF:
    @staticmethod
    def _nd(url):
        try:
            r=requests.get(url,headers={'User-Agent':UA},timeout=15)
            if not r.ok or '__NEXT_DATA__' not in r.text: return None
            s=r.text.index('__NEXT_DATA__');j=r.text.index('{',s);e=r.text.index('</script>',j)
            return json.loads(r.text[j:e])
        except Exception: return None
    @staticmethod
    def goalies():
        data=DF._nd('https://www.dailyfaceoff.com/starting-goalies/')
        if not data: print('  DF goalies: unavailable');return{}
        def sv(v,d=.905):
            try: v=float(v);return v/100 if v>1 else v
            except Exception: return d
        try:
            res={}
            for g in data['props']['pageProps']['data']:
                try: ht=resolve(g.get('homeTeamName',''));at=resolve(g.get('awayTeamName',''))
                except Exception: continue
                def mk(s):
                    return GP(name=g.get(f'{s}GoalieName','?') or '?',sv=sv(g.get(f'{s}GoalieSavePercentage')),
                        gp=(g.get(f'{s}GoalieWins',0)or 0)+(g.get(f'{s}GoalieLosses',0)or 0)+(g.get(f'{s}GoalieOvertimeLosses',0)or 0),
                        gaa=sv(g.get(f'{s}GoalieGoalsAgainstAvg'),2.80),conf=g.get(f'{s}NewsStrengthName','')=='Confirmed',
                        news=(g.get(f'{s}NewsDetails','')or'')[:80])
                res[f'{at}@{ht}']={'hg':mk('home'),'ag':mk('away'),
                    'vl':VL(hml=num(g.get('homeTeamMoneylinePointSpread')),aml=num(g.get('awayTeamMoneylinePointSpread')),
                        spread=num(g.get('pointSpread')),src='DF')}
            print(f'  DF: {len(res)} games');return res
        except Exception as e: print(f'  DF err: {e}');return{}
    @staticmethod
    def injuries():
        data=DF._nd('https://www.dailyfaceoff.com/hockey-player-news/injuries')
        if not data: print('  DF injuries: unavailable');return[]
        try:
            raw=[INJ(player=r.get('playerName',''),pos=r.get('playerPosition',''),team=r.get('teamAbbreviation',''),rating=r.get('playerRating',50)or 50) for r in data['props']['pageProps']['data']['data']]
            seen=set();out=[]
            for i in raw:
                k=f'{i.player}|{i.team}'
                if k not in seen: seen.add(k);out.append(i)
            return out
        except Exception: return[]

# ── Odds API (optional) ───────────────────────────────────
class OA:
    B='https://api.the-odds-api.com/v4/sports/icehockey_nhl'
    @staticmethod
    def fetch(key):
        if not key: return{}
        try:
            r=requests.get(f'{OA.B}/odds/',params={'apiKey':key,'regions':'us','markets':'h2h,spreads,totals','bookmakers':'draftkings','oddsFormat':'american'},timeout=15)
            if not r.ok: print(f'  OA: HTTP {r.status_code}');return{}
            res={}
            for g in r.json():
                hn,an=g.get('home_team',''),g.get('away_team','')
                try: ha,aa=resolve(hn),resolve(an)
                except Exception: continue
                vl=VL(src='OA')
                for bk in g.get('bookmakers',[]):
                    for mk in bk.get('markets',[]):
                        if mk['key']=='h2h':
                            for o in mk.get('outcomes',[]):
                                if o['name']==hn: vl.hml=num(o.get('price'))
                                elif o['name']==an: vl.aml=num(o.get('price'))
                        elif mk['key']=='spreads':
                            for o in mk.get('outcomes',[]):
                                if o['name']==hn: vl.spread=num(o.get('point'))
                        elif mk['key']=='totals':
                            outs=mk.get('outcomes',[])
                            if outs: vl.total=num(outs[0].get('point'))
                res[f'{aa}@{ha}']=vl
            print(f'  OA: {len(res)} games');return res
        except Exception as e: print(f'  OA err: {e}');return{}
    @staticmethod
    def sog_lines(key,slate_keys):
        """Player SOG over/under lines. 1 request per game (uses Odds API credits)."""
        if not key: return{}
        out={}
        try:
            r=requests.get(f'{OA.B}/events',params={'apiKey':key},timeout=15)
            if not r.ok: print(f'  OA events: HTTP {r.status_code}');return{}
            for ev in r.json():
                try: k=f'{resolve(ev.get("away_team",""))}@{resolve(ev.get("home_team",""))}'
                except Exception: continue
                if k not in slate_keys: continue
                r2=requests.get(f'{OA.B}/events/{ev["id"]}/odds',params={'apiKey':key,'regions':'us','markets':'player_shots_on_goal','oddsFormat':'american'},timeout=15)
                if not r2.ok: continue
                bks=r2.json().get('bookmakers',[])
                bks=sorted(bks,key=lambda b:b.get('key')!='draftkings')   # prefer DraftKings
                for bk in bks:
                    got=0
                    for mk in bk.get('markets',[]):
                        if mk.get('key')!='player_shots_on_goal': continue
                        tmp={}
                        for o in mk.get('outcomes',[]):
                            nm=norm_name(o.get('description',''));side=o.get('name','').lower()
                            tmp.setdefault((nm,o.get('point')),{})[side]=num(o.get('price'))
                        best={}
                        for(nm,pt),sd in tmp.items():
                            if pt is None or nm in out or 'over' not in sd or 'under' not in sd: continue
                            io,iu=o2p(sd['over']),o2p(sd['under']);dist=abs(io/(io+iu)-.5)   # main line = most balanced price
                            if nm not in best or dist<best[nm][0]: best[nm]=(dist,(float(pt),sd['over'],sd['under'],f'OA/{bk.get("key")}'))
                        for nm,(_,v) in best.items(): out[nm]=v;got+=1
                    if got: break
            print(f'  OA SOG lines: {len(out)} players')
        except Exception as e: print(f'  OA SOG err: {e}')
        return out

# ── ESPN (free odds + series info) ────────────────────────
class ESPN:
    E2N={'TB':'TBL','SJ':'SJS','LA':'LAK','NJ':'NJD','UTAH':'UTA','UTA':'UTA','WSH':'WSH','WAS':'WSH','MON':'MTL'}
    @staticmethod
    def _tri(ea): return ESPN.E2N.get(ea,ea)
    @staticmethod
    def _ml(od,side):
        """ESPN has used two shapes: homeTeamOdds.moneyLine (old) and moneyline.home.close.odds (new)."""
        v=od.get(f'{side}TeamOdds',{}).get('moneyLine')
        if v in(None,0,''):
            m=od.get('moneyline',{}).get(side,{})
            v=(m.get('close') or {}).get('odds') or (m.get('open') or {}).get('odds')
        return num(v)
    @staticmethod
    def scoreboard(dt=None):
        url='https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard'
        if dt: url+=f'?dates={dt.replace("-","")}'
        try:
            r=requests.get(url,headers={'User-Agent':UA},timeout=15)
            if not r.ok: print(f'  ESPN: HTTP {r.status_code}');return{}
            data=r.json()
        except Exception as e: print(f'  ESPN err: {e}');return{}
        res={}
        for ev in data.get('events',[]):
            try:
                comp=(ev.get('competitions') or [{}])[0];ht=at=''
                for t in comp.get('competitors',[]):
                    ab=ESPN._tri(t.get('team',{}).get('abbreviation',''))
                    if t.get('homeAway')=='home': ht=ab
                    else: at=ab
                series=comp.get('series') or {}
                s_sum=series.get('summary','');g_num=series.get('gameNumber',0) or 0
                vl=VL(src='ESPN')
                for od in comp.get('odds',[]):
                    prov=od.get('provider',{}).get('name','');hml=ESPN._ml(od,'home');aml=ESPN._ml(od,'away')
                    cand=VL(hml=hml,aml=aml,spread=num(od.get('spread')),total=num(od.get('overUnder')),src=f'ESPN/{prov}')
                    if 'draftkings' in prov.lower() and hml: vl=cand;break
                    if hml and vl.hml==0: vl=cand
                res[f'{at}@{ht}']={'vl':vl,'eid':ev.get('id',''),'series':f'{s_sum} (Game {g_num})' if s_sum else '','gnum':g_num}
            except Exception as e: print(f'  ESPN event skipped: {e}')
        print(f'  ESPN: {len(res)} games')
        for k,v in res.items():
            ml=f'H:{int(v["vl"].hml):+d} A:{int(v["vl"].aml):+d}' if v['vl'].hml else 'no odds'
            print(f'    {k}: {ml} T:{v["vl"].total} | {v.get("series","")}')
        return res

# ── Dixon-Coles (scipy, rho fixed, vectorised) ────────────
class DC:
    def __init__(self,hl=70,rho=-0.13):
        self.xi=.5**(1/hl);self.att={};self.dfn={};self.gam=1.06;self.rho=rho;self.ok=False
    def fit(self,res,ref):
        if not res or len(res)<30: warn('DC: not enough games to fit');return
        teams=sorted(set([r['ht'] for r in res]+[r['at'] for r in res]))
        nt=len(teams);ti={t:i for i,t in enumerate(teams)};rho=self.rho
        hi=np.array([ti[r['ht']] for r in res]);ai=np.array([ti[r['at']] for r in res])
        hg=np.array([r['hg'] for r in res],float);ag=np.array([r['ag'] for r in res],float)
        days=np.array([(ref-datetime.strptime(r['date'],'%Y-%m-%d')).days for r in res],float)
        w=self.xi**(days/2);lgh=gammaln(hg+1);lga=gammaln(ag+1)
        m00=(hg==0)&(ag==0);m10=(hg==1)&(ag==0);m01=(hg==0)&(ag==1);m11=(hg==1)&(ag==1)
        def nll(p):
            at=p[:nt];df=p[nt:2*nt];g=p[2*nt]
            lh=np.maximum(at[hi]*df[ai]*g,.01);la=np.maximum(at[ai]*df[hi],.01)
            tau=np.ones_like(lh)
            tau[m00]=1-lh[m00]*la[m00]*rho;tau[m10]=1+la[m10]*rho;tau[m01]=1+lh[m01]*rho;tau[m11]=1-rho
            tau=np.maximum(tau,1e-10)
            ll=w*(-lh+hg*np.log(lh)-lgh-la+ag*np.log(la)-lga+np.log(tau))
            return -ll.sum()+100*(at.sum()-nt)**2
        x0=np.ones(2*nt+1);x0[2*nt]=1.06
        bounds=[(0.2,4)]*nt+[(0.2,4)]*nt+[(0.98,1.12)]
        print(f'  DC: {nt} teams, {len(res)} games, rho={rho}(fixed)...')
        r=minimize(nll,x0,method='L-BFGS-B',bounds=bounds,options={'maxiter':5000,'ftol':1e-12})
        if r.fun<nll(x0):
            bp=r.x;self.att={teams[i]:bp[i] for i in range(nt)};self.dfn={teams[i]:bp[nt+i] for i in range(nt)}
            self.gam=bp[2*nt];self.ok=True
            sa=sorted(self.att.items(),key=lambda x:x[1],reverse=True)
            print(f'  DC OK: gamma={self.gam:.4f} iter={r.nit}')
            print(f'  Top5: {[(t,round(float(v),3)) for t,v in sa[:5]]}')
            print(f'  Bot5: {[(t,round(float(v),3)) for t,v in sa[-5:]]}')
        else: warn('DC fit failed')
    def xg(self,ht,at):
        if not self.ok or ht not in self.att or at not in self.att: return None,None
        return self.att[ht]*self.dfn[at]*self.gam,self.att[at]*self.dfn[ht]

# ── Core Math ─────────────────────────────────────────────
def biv_mat(hxg,axg,l3=L3,mx=10):
    l1=max(hxg-l3,.01);l2=max(axg-l3,.01);m=np.zeros((mx,mx))
    for h in range(mx):
        for a in range(mx):
            lb=-l1-l2-l3+h*log(l1)+a*log(l2)-lgamma(h+1)-lgamma(a+1);t=0
            for k in range(min(h,a)+1):
                t+=exp(lgamma(h+1)-lgamma(h-k+1)-lgamma(k+1)+lgamma(a+1)-lgamma(a-k+1)-lgamma(k+1)+lgamma(k+1)+k*(log(max(l3,1e-15))-log(l1)-log(l2)))
            m[h,a]=exp(lb)*t
    s=m.sum();return m/s if s>0 else m
def dc_cor(m,hr,ar,rho):
    c=m.copy()
    c[0,0]*=max(1-hr*ar*rho,0);c[1,0]*=max(1+ar*rho,0);c[0,1]*=max(1+hr*rho,0);c[1,1]*=max(1-rho,0)
    s=c.sum();return c/s if s>0 else c
def ot_split(h,a,po):
    """P(home wins | tied after regulation). Sudden death = first-goal race -> h/(h+a).
    Regular season: 5-min 3v3 (scoring ~1.5x per-minute 5v5 rate), then shootout treated as 50/50."""
    ph=h/(h+a)
    if po: return ph,1-ph
    pg=1-exp(-(h+a)/12*1.5);hw=pg*ph+(1-pg)*.5
    return hw,1-hw
def kelly(prob,odds,frac=.25):
    if odds==0 or abs(odds)<100: return 0,0,'NO EDGE'
    b=payout(odds);imp=o2p(odds)/100
    edge=(prob-imp)*100;kf=max(0,(b*prob-(1-prob))/b*frac)   # edge in percentage points
    tier=ml_tier(edge)
    return edge,(kf*100 if edge>0 else 0),tier
def ml_tier(edge_pct):
    for t,lbl in[(8,'STRONG BET'),(4,'VALUE BET'),(2,'LEAN'),(0,'SLIGHT')]:
        if edge_pct>t: return lbl
    return 'NO EDGE'

# ── Shots-on-goal model ───────────────────────────────────
# lambda = shrunk shots/60  x  projected TOI/60  x  opponent shots-allowed factor  x  home adj
#   shots/60: current season, shrunk toward last season's rate (itself shrunk toward the position average)
#   TOI: 60% last-5-games average + 40% season average (role changes show up in TOI first)
#   opponent factor: opponent SA/game (shrunk toward last season) / league SA/game
# P(over line) from a negative binomial whose dispersion is estimated from the players' own game logs.
K_MIN=200.0   # minutes of prior ice time used for shrinkage (~10 games of a top-6 F); a judgement call, tune via the ledger
def skater_pool(season,syr):
    """{playerId: dict(name,team,pos,gp,shots,toi)} with toi = total minutes. NHL stats API first, MoneyPuck fallback."""
    pool={}
    for r in ST.skaters(season):
        try:
            gp=r.get('gamesPlayed',0) or 0
            if gp<=0: continue
            team=str(r.get('teamAbbrevs','')).split(',')[-1].strip()
            pool[int(r['playerId'])]={'name':r.get('skaterFullName',''),'team':team,'pos':'D' if r.get('positionCode')=='D' else 'F',
                'gp':gp,'shots':r.get('shots',0) or 0,'toi':(r.get('timeOnIcePerGame',0) or 0)*gp/60}
        except Exception: continue
    if pool: return pool,'NHL'
    df=MP.skaters(syr)
    if df.empty: return{},'none'
    for _,r in df[df['situation']=='all'].iterrows():
        gp=r.get('games_played',0) or 0
        if gp<=0: continue
        pool[int(r['playerId'])]={'name':r.get('name',''),'team':r.get('team',''),'pos':'D' if r.get('position')=='D' else 'F',
            'gp':gp,'shots':r.get('I_F_shotsOnGoal',0) or 0,'toi':(r.get('icetime',0) or 0)/60}
    return pool,'MP'
def pos_rates(pool):
    out={}
    for p in('F','D'):
        s=sum(v['shots'] for v in pool.values() if v['pos']==p and v['toi']>=100)
        t=sum(v['toi'] for v in pool.values() if v['pos']==p and v['toi']>=100)
        if t>0: out[p]=s/t*60
    return out
def team_shots(season):
    out={}
    for r in ST.teams(season):
        try: tri=resolve(r.get('teamFullName',''))
        except Exception: continue
        out[tri]={'gp':r.get('gamesPlayed',0) or 0,'sf':r.get('shotsForPerGame',0) or 0,'sa':r.get('shotsAgainstPerGame',0) or 0,
            'ga':r.get('goalsAgainstPerGame',0) or 0}
    return out
def estimate_nb_r(samples):
    """Pooled method-of-moments dispersion: Var = mu + mu^2/r. Returns None (=Poisson) if no overdispersion."""
    Sm2=Sex=0.0;n_pl=0
    for xs in samples:
        if len(xs)<5: continue
        x=np.array(xs,float);m=x.mean();v=x.var(ddof=1);n=len(x);n_pl+=1
        Sm2+=n*m*m;Sex+=n*(v-m)
    if n_pl<10 or Sex<=0: return None
    return float(np.clip(Sm2/Sex,3,200))
def p_over(lam,line,r):
    k=math.floor(line)   # over 2.5 -> X>=3 -> 1-cdf(2); over 3 (integer line) -> X>=4, push at 3
    if r is None: cdf=poisson.cdf(k,lam);pm=poisson.pmf(k,lam)
    else: pp=r/(r+lam);cdf=nbinom.cdf(k,r,pp);pm=nbinom.pmf(k,r,pp)
    over=1-cdf
    if float(line).is_integer(): under=cdf-pm;return over,under,pm
    return over,cdf,0.0
def est_line(avg):
    return max(0.5,math.floor(avg)+0.5)
def p2a(p):
    p=min(max(p,.01),.99);return -round(p/(1-p)*100) if p>=.5 else round((1-p)/p*100)
def est_prices(avg,line,r):
    """No real line: benchmark 'book' = the player's plain season average (NB/Poisson), plus vig.
    Edge then only appears where the model disagrees with the raw average (TOI change, opponent, shrinkage)."""
    o,u,_=p_over(max(avg,.05),line,r);t=o+u
    return p2a(o/t*(1+SOG_EST_VIG)),p2a(u/t*(1+SOG_EST_VIG))

# ── Ledger (tracking + auto-grading) ──────────────────────
LEDGER=f'{DRIVE}/nhl_ledger.csv'
LCOLS=['date','game_id','game','market','tier','selection','player_id','team','opp','side','line','odds','model_p','implied_p','edge','proj','line_src','result','actual','profit','logged_at']
def load_ledger():
    try:
        if os.path.exists(LEDGER):
            d=pd.read_csv(LEDGER,dtype={'result':str,'actual':str,'selection':str})
            for c in LCOLS:
                if c not in d.columns: d[c]=np.nan
            return d[LCOLS]
    except Exception as e: warn(f'ledger unreadable ({e}) - starting a new one')
    return pd.DataFrame(columns=LCOLS)
def save_ledger(d):
    try: d.to_csv(LEDGER,index=False);print(f'  Ledger saved: {LEDGER} ({len(d)} rows)')
    except Exception as e: warn(f'ledger save failed: {e}')
def box_players(box):
    out={}
    pbs=box.get('playerByGameStats',{})
    for side in('homeTeam','awayTeam'):
        for grp in('forwards','defense'):
            for p in pbs.get(side,{}).get(grp,[]):
                s=p.get('sog',p.get('shots'))
                if p.get('playerId') is not None and s is not None: out[int(p['playerId'])]=int(s)
    return out
def grade_ledger(d,nhl,upto):
    pend=d[(d['result'].isna()|(d['result']=='pending'))&(d['date']<=upto)]
    if pend.empty: return d,0
    n=0
    for gid in pend['game_id'].dropna().unique():
        box=nhl.boxscore(gid)
        if not box or box.get('gameState','') not in FINAL_STATES: continue
        hs=box.get('homeTeam',{}).get('score');as_=box.get('awayTeam',{}).get('score')
        ha=box.get('homeTeam',{}).get('abbrev','');aa=box.get('awayTeam',{}).get('abbrev','')
        if hs is None or as_ is None: continue
        winner=ha if hs>as_ else aa;players=box_players(box)
        exp_key=str(pend.loc[pend['game_id']==gid,'game'].iloc[0])
        if exp_key!=f'{aa}@{ha}':
            warn(f'boxscore {gid} is {aa}@{ha}, ledger says {exp_key} - left pending');continue
        for i in pend.index[pend['game_id']==gid]:
            row=d.loc[i];odds=num(row['odds'])
            if row['market']=='ML':
                res='W' if row['selection']==winner else 'L';act=f'{aa} {as_}-{hs} {ha}'
            else:
                pid=int(float(row['player_id']));line=float(row['line'])
                if pid not in players: res='V';act='DNP'
                else:
                    s=players[pid];act=str(s)
                    if s==line: res='P'
                    else: res='W' if((s>line)==(row['side']=='OVER')) else 'L'
            d.at[i,'result']=res;d.at[i,'actual']=act
            d.at[i,'profit']=payout(odds) if(res=='W' and odds) else(-1.0 if(res=='L' and odds) else 0.0);n+=1
    return d,n
def _wl(x):
    w=(x['result']=='W').sum();l=(x['result']=='L').sum();p=(x['result']=='P').sum()
    risk=((x['result']=='W')|(x['result']=='L')).sum();u=x['profit'].astype(float).sum()
    roi=u/risk*100 if risk else 0;wp=w/(w+l)*100 if w+l else 0
    return f'{w}-{l}'+(f'-{p}' if p else '')+f'  ({wp:.1f}%)  {u:+.2f}u  ROI {roi:+.1f}%'
def report(d):
    g=d[d['result'].isin(['W','L','P'])].copy()
    print(f'\n{S}\n  RECORD (graded, all time) — {LEDGER}\n{S}')
    if g.empty: print('  No graded picks yet. Picks are graded automatically on the next run after the games finish.');return
    g['edge']=g['edge'].astype(float);g['model_p']=g['model_p'].astype(float)
    ml=g[g['market']=='ML'];bets=ml[(ml['edge']>=ML_TRACK_MIN_EDGE)&(ml['odds'].astype(float)!=0)]
    print(f'  ML BETS (edge>={ML_TRACK_MIN_EDGE}%):  {_wl(bets) if len(bets) else "none yet"}')
    for t in['STRONG BET','VALUE BET','LEAN']:
        x=bets[bets['tier']==t]
        if len(x): print(f'    {t:11s} {_wl(x)}')
    if len(ml):
        wl=ml[ml['result'].isin(['W','L'])];acc=(wl['result']=='W').mean()*100 if len(wl) else 0
        br=((wl['model_p']-(wl['result']=='W').astype(float))**2).mean() if len(wl) else float('nan')
        print(f'  ML model side, every game: {(ml["result"]=="W").sum()}-{(ml["result"]=="L").sum()} ({acc:.1f}%)  Brier {br:.3f} (0.250 = coin flip)')
    sog=g[g['market']=='SOG'];sp=sog[sog['tier']=='PICK']
    print(f'  SOG PICKS: {_wl(sp) if len(sp) else "none yet"}')
    for src,lbl in[(True,'real lines'),(False,'estimated lines')]:
        x=sp[sp['line_src'].astype(str).str.startswith('EST')!=src]
        if len(x): print(f'    {lbl:15s} {_wl(x)}')
    for sd in['OVER','UNDER']:
        x=sp[sp['side']==sd]
        if len(x): print(f'    {sd:15s} {_wl(x)}')
    allp=d[(d['market']=='SOG')&d['actual'].astype(str).str.fullmatch(r'\d+')]
    if len(allp):
        err=(allp['actual'].astype(float)-allp['proj'].astype(float))
        print(f'  SOG projection check ({len(allp)} player-games): bias {err.mean():+.2f}  MAE {err.abs().mean():.2f}  (bias>0 = model too low)')
    rec=g[pd.to_datetime(g['date'])>=GD-timedelta(days=7)]
    if len(rec):
        print(f'  Last 7 days  ML bets: {_wl(rec[(rec["market"]=="ML")&(rec["edge"]>=ML_TRACK_MIN_EDGE)&(rec["odds"].astype(float)!=0)])}')
        print(f'               SOG picks: {_wl(rec[(rec["market"]=="SOG")&(rec["tier"]=="PICK")])}')

# ═══════════════════════════════════════════════════════════
# LOAD ALL DATA
# ═══════════════════════════════════════════════════════════
S='='*60
nhl=NHL()
all_games=nhl.sched(game_date)
pre=[g for g in all_games if g.get('gameType')==1]
games=[g for g in all_games if g.get('gameType') in(2,3)]
IS_PO=any(g.get('gameType')==3 for g in games)
RHO=-0.08 if IS_PO else -0.13
GTYPES=(2,3) if IS_PO else(2,)
mode='PLAYOFFS' if IS_PO else 'REGULAR SEASON'
print(f'\n{S}\n  NHL v12.0 | {mode} | {game_date} | season {SEASON}\n  rho={RHO} | L3={L3}\n{S}')
print(f'\nSchedule: {len(games)} games' + (f' ({len(pre)} preseason games skipped)' if pre else ''))
for g in games: print(f'  {g.get("awayTeam",{}).get("abbrev","")} @ {g.get("homeTeam",{}).get("abbrev","")}  [{g.get("gameState","")}]')

# Grade old picks first so the record is current
print('\nGrading ledger...')
ledger=load_ledger();ledger,ng=grade_ledger(ledger,nhl,game_date);print(f'  graded {ng} picks')

print('\nLoading data...')
standings=nhl.stand(game_date);print(f'  Standings: {len(standings)} teams')
LG_XG=MP.lg_xg()
MP_OK=not MP.teams().empty or not MP.teams(PSYR).empty
if MP.teams().empty: warn(f'MoneyPuck {SYR} team data missing - using last season as prior only')
df_data=DF.goalies();df_inj=DF.injuries();print(f'  Injuries: {len(df_inj)}')
odds_bk=OA.fetch(ODDS_KEY)
espn_data=ESPN.scoreboard(game_date)
# Team shot rates (current + last season) and league save %
TSH=team_shots(SEASON);TSH_P=team_shots(PREV_SEASON)
def lg_mean(d,k):
    v=[x[k] for x in d.values() if x['gp']>0 and x[k]>0];return float(np.mean(v)) if v else None
LG_SA=lg_mean(TSH,'sa') if sum(x['gp'] for x in TSH.values())>=100 else None
LG_SA=LG_SA or lg_mean(TSH_P,'sa') or 28.0
def lg_sv_calc():
    for d in(TSH,TSH_P):
        if sum(x['gp'] for x in d.values())>=100:
            sa=lg_mean(d,'sa');ga=lg_mean(d,'ga')
            if sa and ga: return 1-ga/sa
    return .900
LG_SV=lg_sv_calc()
print(f'  League: SA/gm={LG_SA:.1f} SV%={LG_SV:.3f} xG/gm={LG_XG:.2f}')

# Dixon-Coles history: this season + last season (time-decayed), shootout goal removed
print('\nBuilding game history...')
hist=[];seen=set()
teams_all=sorted(set(standings.keys())|set(TM.keys()))
for season in(PREV_SEASON,SEASON):
    for tri in teams_all:
        for g in nhl.tsched(tri,season):
            gd=g.get('gameDate','')
            if gd>=game_date or not done(g,GTYPES if season==SEASON else(2,)): continue
            gid=g.get('id',0)
            if gid in seen: continue
            seen.add(gid);ha=g.get('homeTeam',{}).get('abbrev','');aa=g.get('awayTeam',{}).get('abbrev','')
            hg=g.get('homeTeam',{}).get('score',0) or 0;ag=g.get('awayTeam',{}).get('score',0) or 0
            if (g.get('gameOutcome') or {}).get('lastPeriodType')=='SO':
                if hg>ag: hg-=1
                else: ag-=1
            if ha and aa: hist.append({'ht':ha,'at':aa,'hg':hg,'ag':ag,'date':gd})
print(f'  {len(hist)} unique games')
if nhl.fails: warn(f'{nhl.fails} NHL API requests failed while loading schedules - Dixon-Coles may be missing games')
dc=DC(rho=RHO);dc.fit(hist,GD)
DEGRADED=not dc.ok and MP.teams().empty
if DEGRADED: warn('No DC fit and no current MoneyPuck data - ML output is mostly default numbers, NO BETS will be flagged')

# SOG inputs
POOL,POOL_SRC=skater_pool(SEASON,SYR);POOL_P,_=skater_pool(PREV_SEASON,PSYR)
POSR=pos_rates(POOL_P) or pos_rates(POOL)
if not POSR: warn('No skater data for position shot rates - SOG model disabled');
print(f'  Skaters: {len(POOL)} this season [{POOL_SRC}], {len(POOL_P)} last season | pos SOG/60: {({k:round(v,2) for k,v in POSR.items()})}')
slate_keys={f'{g.get("awayTeam",{}).get("abbrev","")}@{g.get("homeTeam",{}).get("abbrev","")}' for g in games}
SOG_LINES=OA.sog_lines(ODDS_KEY,slate_keys)
for nm,v in PROP_LINES.items(): SOG_LINES[norm_name(nm)]=(float(v[0]),num(v[1]),num(v[2]),'MANUAL')

def shrink_team(tri,key):
    c=TSH.get(tri);p=TSH_P.get(tri);prior=(p[key]*.7+LG_SA*.3) if p and p[key] else LG_SA
    if c and c['gp']>0 and c[key]>0: return(c[key]*c['gp']+prior*10)/(c['gp']+10)
    return prior
def team_logs(tri):
    return sorted([g for g in nhl.tsched(tri) if g.get('gameDate','')<game_date and done(g,GTYPES)],key=lambda x:x.get('gameDate',''),reverse=True)
def project_sog(tri,opp,is_home,inj_names):
    if not POSR: return[],None
    opp_f=shrink_team(opp,'sa')/LG_SA
    cands=[]
    ids=nhl.roster(tri)   # current roster -> offseason trades/signings land on the right team
    if not ids: ids=set(k for k,v in POOL.items() if v['team']==tri)|set(k for k,v in POOL_P.items() if v['team']==tri and k not in POOL)
    for pid in ids:
        c=POOL.get(pid);p=POOL_P.get(pid);base=c or p
        if not base: continue
        if norm_name(base['name']) in inj_names: continue
        pr=POSR.get(base['pos'],list(POSR.values())[0])
        prior=((p['shots']+pr*K_MIN/60)/((p['toi']+K_MIN)/60)) if p else pr
        rate=((c['shots']+prior*K_MIN/60)/((c['toi']+K_MIN)/60)) if c else prior
        toi_s=(c['toi']/c['gp']) if c else(p['toi']/p['gp'])
        cands.append({'pid':pid,'name':base['name'],'pos':base['pos'],'rate':rate,'toi_s':toi_s,'gp':c['gp'] if c else 0,
            'avg':(c['shots']/c['gp']) if c else(p['shots']/p['gp'])})
    cands=sorted(cands,key=lambda x:x['rate']*x['toi_s'],reverse=True)[:SOG_PLAYERS_PER_TEAM+4]
    out=[];samples=[]
    for cd in cands:
        logs=[]
        for gt in(GTYPES[::-1]):
            logs+=nhl.gamelog(cd['pid'],SEASON,gt)
        logs=sorted(logs,key=lambda x:x.get('gameDate',''),reverse=True)
        logs=[l for l in logs if l.get('gameDate','')<game_date]
        tois=[toi_min(l.get('toi')) for l in logs[:5]];tois=[t for t in tois if t]
        toi=(.6*np.mean(tois)+.4*cd['toi_s']) if len(tois)>=3 else cd['toi_s']
        lam=cd['rate']*toi/60*opp_f*(HOME_SOG_ADJ if is_home else 1)
        samples.append([l.get('shots',0) or 0 for l in logs[:20]])
        l5=[l.get('shots',0) or 0 for l in logs[:5]]
        out.append({**cd,'team':tri,'opp':opp,'toi':toi,'lam':lam,'l5':l5})
    out=sorted(out,key=lambda x:x['lam'],reverse=True)[:SOG_PLAYERS_PER_TEAM]
    team_exp=shrink_team(tri,'sf')*opp_f
    return out,(team_exp,samples)

# ═══════════════════════════════════════════════════════════
# PREDICT
# ═══════════════════════════════════════════════════════════
preds=[];new_rows=[];sog_all=[];nb_samples=[];now_s=datetime.now(TZI).strftime('%Y-%m-%d %H:%M')
for game in games:
    ht=game.get('homeTeam',{}).get('abbrev','');at=game.get('awayTeam',{}).get('abbrev','')
    if not ht or not at: continue
    key=f'{at}@{ht}';gt=fmt(game.get('startTimeUTC',''));gid=game.get('id')
    pregame=game.get('gameState','FUT') in('FUT','PRE')
    series=espn_data.get(key,{}).get('series','');gnum=espn_data.get(key,{}).get('gnum',0)
    print(f'\n{"-"*60}\n  {TM.get(at,at)} @ {TM.get(ht,ht)} | {gt}'+(f'\n  {series}' if series else '')+f'\n{"-"*60}')
    sh=standings.get(ht,{});sa=standings.get(at,{})
    hts=TS(TM.get(ht,ht),sh.get('gp',0),sh.get('gf',0),sh.get('ga',0),sh.get('w',0),sh.get('l',0))
    ats=TS(TM.get(at,at),sa.get('gp',0),sa.get('gf',0),sa.get('ga',0),sa.get('w',0),sa.get('l',0))
    hlogs=team_logs(ht);alogs=team_logs(at)
    def recent(tri,comp,n=10):
        out=[]
        for g in comp[:n]:
            ih=g.get('homeTeam',{}).get('abbrev','')==tri
            hs2=g.get('homeTeam',{}).get('score',0) or 0;as2=g.get('awayTeam',{}).get('score',0) or 0
            gf_=hs2 if ih else as2;ga_=as2 if ih else hs2
            out.append(GL(g.get('gameDate',''),'',gf_,ga_,gf_*.6+LG_XG*.4,ga_*.6+LG_XG*.4,ih))
        return out
    hrg=recent(ht,hlogs);arg=recent(at,alogs)
    # Goalies
    hg_p=df_data.get(key,{}).get('hg',GP());ag_p=df_data.get(key,{}).get('ag',GP())
    if hg_p.name not in('Unknown','?'): hg_p.gsax=MP.gsax(hg_p.name,ht)
    if ag_p.name not in('Unknown','?'): ag_p.gsax=MP.gsax(ag_p.name,at)
    # Injuries
    hinj=[i for i in df_inj if i.team==ht];ainj=[i for i in df_inj if i.team==at]
    for i in hinj: i.xgi=MP.pxi(i.player,ht)
    for i in ainj: i.xgi=MP.pxi(i.player,at)
    # Schedule context
    def sctx(tri,past,ih,venue):
        tgt=GD;rest=3
        if past:
            try: rest=(tgt-datetime.strptime(past[0].get('gameDate',game_date),'%Y-%m-%d')).days
            except Exception: pass
        g7=sum(1 for g in past if g.get('gameDate','')>=(tgt-timedelta(days=7)).strftime('%Y-%m-%d'))
        travel=0
        if past:   # last game's arena -> tonight's arena (home teams travel too when returning from a road trip)
            lv=past[0].get('homeTeam',{}).get('abbrev','');l1,l2=CO.get(lv),CO.get(venue)
            if l1 and l2: travel=int(hav(l1[0],l1[1],l2[0],l2[1]))
        return SC(rest=rest,travel=travel,g7d=g7,home=ih)
    hsc=sctx(ht,hlogs,True,ht);asc=sctx(at,alogs,False,ht)
    # Odds: DF -> OA -> ESPN
    vl=df_data.get(key,{}).get('vl')
    if not vl or vl.hml==0: vl=odds_bk.get(key)
    if (not vl or vl.hml==0) and espn_data.get(key): vl=espn_data[key]['vl']
    # ── ML ENGINE ──
    K=10
    hxf,hxa,hgp,hpf,hpa=MP.txg(ht,LG_XG);axf,axa,agp,apf,apa=MP.txg(at,LG_XG)
    hro=np.mean([g.xgf for g in hrg]) if hrg else 0;hrn=len(hrg)
    aro=np.mean([g.xgf for g in arg]) if arg else 0;arn=len(arg)
    ho=(hpf*K+hxf*hgp+hro*hrn)/(K+hgp+hrn);hd=(hpa*K+hxa*hgp)/(K+hgp)
    ao=(apf*K+axf*agp+aro*arn)/(K+agp+arn);ad=(apa*K+axa*agp)/(K+agp)
    hxg=ho*(ad/LG_XG)*1.025;axg=ao*(hd/LG_XG)*.980   # home edge applied to the rate model only
    dh,da=dc.xg(ht,at)
    if dh and da: hxg=hxg*.4+dh*.6;axg=axg*.4+da*.6  # DC gamma already carries home ice
    for gp2,tgt in[(hg_p,'away'),(ag_p,'home')]:
        if gp2 and gp2.gp>0:
            sv=gp2.sv
            if gp2.gsax!=0: sv=sv+gp2.gsax/(gp2.gp*30)*.3
            mult=(1-np.clip(sv,.870,.945))/(1-LG_SV)
            if tgt=='away': axg*=mult
            else: hxg*=mult
    hxg-=sum(i.xgi for i in hinj);axg-=sum(i.xgi for i in ainj)   # injured good player -> LOWER team xG
    for ctx,tg in[(hsc,'h'),(asc,'a')]:
        f=1.0
        if ctx.rest==0: f*=.94
        elif ctx.rest==1: f*=.965
        elif ctx.rest>=3: f*=1.015
        if ctx.travel>3000: f*=.98
        elif ctx.travel>1500: f*=.99
        if ctx.g7d>=4: f*=1-.015*(ctx.g7d-3)
        if tg=='h': hxg*=f
        else: axg*=f
    hwp_=hts.w/hts.gp if hts.gp else .5;awp_=ats.w/ats.gp if ats.gp else .5
    hxg*=1+(hwp_-.5)*.021;axg*=1+(awp_-.5)*.021
    hxg=max(hxg,.5);axg=max(axg,.5)
    if IS_PO:
        pm=po_mult(gnum) if gnum else po_mult();hxg*=pm;axg*=pm
        print(f'  PLAYOFF: xG*{pm:.2f} (Game {gnum})')
    mat=dc_cor(biv_mat(hxg,axg),hxg,axg,dc.rho)
    hw=float(np.tril(mat,-1).sum());aw=float(np.triu(mat,1).sum());dr=float(np.trace(mat))
    hot,aot=ot_split(hxg,axg,IS_PO);hwf=hw+dr*hot;awf=aw+dr*aot
    top5=sorted([(f'{h}-{a}',mat[h,a]) for h in range(10) for a in range(10) if mat[h,a]>1e-6],key=lambda x:x[1],reverse=True)[:5]
    # Final-score totals: a tie after regulation adds exactly one goal (OT winner or shootout-winner goal)
    tot=np.zeros(22)
    for h in range(10):
        for a in range(10): tot[h+a+(1 if h==a else 0)]+=mat[h,a]
    ou={l:(float(tot[int(l)+1:].sum()),float(tot[:int(l)+1].sum())) for l in np.arange(3.5,9,.5)}
    margins={k:float(skellam_dist.pmf(k,hxg,axg)) for k in range(-7,8)}
    kh_b=ka_b=None
    if vl and abs(vl.hml)>=100 and abs(vl.aml)>=100:
        he,hk,ha2=kelly(hwf,vl.hml);ae,ak,aa2=kelly(awf,vl.aml)
        kh_b={'edge':he,'kelly':hk,'action':ha2};ka_b={'edge':ae,'kelly':ak,'action':aa2}
    props=MP.top(ht,hxg,LG_XG)+MP.top(at,axg,LG_XG)
    pred={'matchup':f'{TM.get(at,at)} @ {TM.get(ht,ht)}','ht':ht,'at':at,'gid':gid,
        'hxg':round(hxg,2),'axg':round(axg,2),'total':round(hxg+axg,2),
        'hwp':round(hwf*100,1),'awp':round(awf*100,1),'top5':top5,'ou':ou,'margins':margins,
        'vl':vl,'kh':kh_b,'ka':ka_b,'hg':hg_p,'ag':ag_p,'hinj':hinj,'ainj':ainj,
        'hsc':hsc,'asc':asc,'props':props,'series':series,'gnum':gnum,'pregame':pregame}
    print(f'  xG: H:{hxg:.2f} A:{axg:.2f} T:{hxg+axg:.2f}\n  Win: H:{hwf*100:.1f}% A:{awf*100:.1f}%')
    for lbl,gpx in(('H-G',hg_p),('A-G',ag_p)):
        if gpx.name not in('Unknown','?'):
            print(f'  {lbl}: {gpx.name} ({"V" if gpx.conf else "?"}) SV%={gpx.sv:.3f}'+(f' GSAx={gpx.gsax:+.1f}' if gpx.gsax else ''))
    hi=ai=None
    if vl and abs(vl.hml)>=100 and abs(vl.aml)>=100:
        hi=o2p(vl.hml);ai=o2p(vl.aml)
        print(f'  Odds: H:{int(vl.hml):+d}({hi:.0f}%) A:{int(vl.aml):+d}({ai:.0f}%) T:{vl.total} [{vl.src}]')
        print(f'  Edge: H:{hwf*100-hi:+.1f}% A:{awf*100-ai:+.1f}%')
    else: print('  Odds: none found')
    if hinj: print(f'  H-Inj: {", ".join(i.player for i in hinj[:4])}')
    if ainj: print(f'  A-Inj: {", ".join(i.player for i in ainj[:4])}')
    if hsc.rest<=1: print(f'  ** HOME B2B ({hsc.rest}d rest) **')
    if asc.rest<=1: print(f'  ** AWAY B2B ({asc.rest}d rest) **')
    # ML ledger row: the model's side (bigger edge, or bigger win% when no odds)
    if hi is not None:
        he_,ae_=pred['hwp']-hi,pred['awp']-ai
        side_h=he_>=ae_;edge=he_ if side_h else ae_;odds=vl.hml if side_h else vl.aml;imp=hi if side_h else ai
        tier='NO BET (data)' if DEGRADED else ml_tier(edge)
    else:
        side_h=hwf>=awf;edge=0.0;odds=0;imp=np.nan;tier='NO ODDS'
    pred.update({'pick':ht if side_h else at,'side':'HOME' if side_h else 'AWAY','edge':edge,'odds':odds,'tier':tier,
        'pct':pred['hwp'] if side_h else pred['awp']})
    if pregame:
        new_rows.append({'date':game_date,'game_id':gid,'game':key,'market':'ML','tier':tier,'selection':pred['pick'],
            'player_id':np.nan,'team':pred['pick'],'opp':at if side_h else ht,'side':pred['side'],'line':np.nan,'odds':odds,
            'model_p':round(pred['pct']/100,4),'implied_p':round(imp/100,4) if imp==imp else np.nan,'edge':round(edge,2),
            'proj':np.nan,'line_src':vl.src if vl else '','result':'pending','actual':'','profit':0.0,'logged_at':now_s})
    # ── SOG ──
    inj_names={norm_name(i.player) for i in df_inj}
    hs_,hx=project_sog(ht,at,True,inj_names);as_l,ax=project_sog(at,ht,False,inj_names)
    if hx: nb_samples+=hx[1]+ax[1];pred['team_sog']=(round(hx[0],1),round(ax[0],1));print(f'  Team SOG proj: H {hx[0]:.1f}  A {ax[0]:.1f}')
    for p in hs_+as_l: p.update({'gid':gid,'game':key,'pregame':pregame})
    sog_all+=hs_+as_l
    preds.append(pred)

# ── SOG pricing ──
NB_R=estimate_nb_r(nb_samples)
print(f'\n  SOG dispersion: '+(f'negative binomial r={NB_R:.1f}' if NB_R else 'Poisson (no overdispersion detected / too little data)'))
sog_rows=[]
for p in sog_all:
    nm=norm_name(p['name'])
    if nm in SOG_LINES: line,oo,uo,src=SOG_LINES[nm]
    else:
        line=est_line(p['avg']);oo,uo=est_prices(p['avg'],line,NB_R);src='EST'
    po_,pu_,pp_=p_over(p['lam'],line,NB_R)
    io,iu=o2p(oo)/100,o2p(uo)/100
    # compare to break-even that ignores pushes (conservative)
    eo=(po_-io)*100;eu=(pu_-iu)*100
    side,edge,mp,odds,imp=('OVER',eo,po_,oo,io) if eo>=eu else('UNDER',eu,pu_,uo,iu)
    p.update({'line':line,'src':src,'side':side,'edge':edge,'mp':mp,'odds':odds,'imp':imp,'p_over':po_})
    sog_rows.append(p)
thr=lambda p:SOG_MIN_EDGE_EST if p['src']=='EST' else SOG_MIN_EDGE
sog_picks=[] if DEGRADED else sorted([p for p in sog_rows if p['edge']>=thr(p) and p['pregame']],key=lambda x:x['edge'],reverse=True)[:SOG_MAX_PICKS]
pick_ids={(p['gid'],p['pid']) for p in sog_picks}
for p in sog_rows:
    if not p['pregame']: continue
    new_rows.append({'date':game_date,'game_id':p['gid'],'game':p['game'],'market':'SOG','tier':'PICK' if(p['gid'],p['pid']) in pick_ids else 'TRACK',
        'selection':p['name'],'player_id':p['pid'],'team':p['team'],'opp':p['opp'],'side':p['side'],'line':p['line'],'odds':p['odds'],
        'model_p':round(p['mp'],4),'implied_p':round(p['imp'],4),'edge':round(p['edge'],2),'proj':round(p['lam'],2),
        'line_src':p['src'],'result':'pending','actual':'','profit':0.0,'logged_at':now_s})

# ═══════════════════════════════════════════════════════════
# BETSLIP
# ═══════════════════════════════════════════════════════════
print(f'\n{S}\n  NHL BETSLIP | {game_date} | {mode}\n  DC: gamma={dc.gam:.4f} ok={dc.ok} | L3={L3} | {len(hist)}gm\n{S}')
if WARN:
    print('  DATA WARNINGS:');[print(f'   - {w}') for w in WARN]
groups={'STRONG BET':[],'VALUE BET':[],'LEAN':[],'SLIGHT':[]};noedge=[]
for p in preds:
    (groups[p['tier']] if p['tier'] in groups else noedge).append(p)
for lbl,emo,desc in[('STRONG BET','!!!','>8% edge'),('VALUE BET','!!','4-8% edge'),('LEAN','!','2-4% edge'),('SLIGHT','~','0-2%')]:
    picks=groups[lbl]
    if not picks: continue
    print(f'\n{emo} {lbl}S ({desc})\n  {"-"*56}')
    for p in sorted(picks,key=lambda x:x['edge'],reverse=True):
        v=p['vl'];k=p['kh'] if p['side']=='HOME' else p['ka']
        print(f'  {TM.get(p["pick"],p["pick"])}\n    {p["side"]} ML: {int(p["odds"]):+d} | Model: {p["pct"]:.1f}% | Edge: {p["edge"]:+.1f}%')
        print(f'    xG: {p["hxg"]:.2f} vs {p["axg"]:.2f} | Total: {p["total"]:.1f}')
        gp2=p['hg'] if p['side']=='HOME' else p['ag']
        if gp2.name not in('Unknown','?'): print(f'    Goalie: {gp2.name} ({"V" if gp2.conf else "?"})'+(f' GSAx={gp2.gsax:+.1f}' if gp2.gsax else ''))
        if v and v.total>0 and v.total in p['ou']:
            ov,un=p['ou'][v.total];print(f'    Total: {"OVER" if ov>un else "UNDER"} {v.total:.1f} ({max(ov,un)*100:.1f}%)')
        if k and k['action']!='NO EDGE': print(f'    Kelly: {k["action"]} | wager {k["kelly"]:.1f}%')
        if p.get('series'): print(f'    Series: {p["series"]}')
        rs=p['hsc'].rest if p['side']=='HOME' else p['asc'].rest
        if rs<=1: print(f'    ** B2B ({rs}d rest) **')
        if not p['pregame']: print('    (game already started - not logged)')
        print()
if noedge:
    print(f'\n--- NO EDGE / NO ODDS ({len(noedge)} games) ---')
    for p in noedge: print(f'  {p["matchup"][:35]:35s} {p["hwp"]:4.0f}%/{p["awp"]:4.0f}%  xG:{p["hxg"]:.1f}-{p["axg"]:.1f}  [{p["tier"]}]')

print(f'\n{S}\n  SHOTS ON GOAL PICKS (verify the player is in tonight\'s lineup)\n{S}')
if not sog_picks: print('  No SOG plays cleared the edge threshold.')
for p in sog_picks:
    tag='' if p['src']!='EST' else '  [EST line - check the real line/price before betting]'
    print(f'  {p["name"]:22s} ({p["team"]} vs {p["opp"]}) {p["side"]} {p["line"]} @ {int(p["odds"]):+d}  model {p["mp"]*100:.1f}%  edge {p["edge"]:+.1f}%{tag}')
    print(f'    proj {p["lam"]:.2f} SOG | TOI {p["toi"]:.1f}m | {p["rate"]:.2f}/60 | L5 {p["l5"]} | src {p["src"]}')
print(f'\n  Top projections (all):')
for p in sorted(sog_rows,key=lambda x:x['lam'],reverse=True)[:15]:
    print(f'   {p["name"]:22s} {p["team"]} {p["lam"]:.2f}  P(O{p["line"]})={p["p_over"]*100:.0f}%  [{p["src"]}]')

print(f'\n{S}\n  POINTS / GOAL PROPS (MoneyPuck, all situations)\n{S}')
allp=sorted([pr for p in preds for pr in p['props']],key=lambda x:x['pts'],reverse=True)[:10]
for pr in allp: print(f'  {pr["name"]:22s} ({pr["team"]}) G:{pr["g"]:.2f} A:{pr["a"]:.2f}  P(goal)={pr["p_goal"]*100:.0f}%  P(1+pt)={pr["p_pt"]*100:.0f}%')

# ═══════════════════════════════════════════════════════════
# LEDGER + RECORD
# ═══════════════════════════════════════════════════════════
if new_rows:
    nr=pd.DataFrame(new_rows,columns=LCOLS)
    def rk(df): return df['game_id'].astype(str)+'|'+df['market']+'|'+df['player_id'].fillna(-1).astype(float).astype(int).astype(str)
    def has_price(df): return (df['odds'].fillna(0).astype(float)!=0)&~df['line_src'].fillna('').astype(str).str.startswith('EST')
    if len(ledger):
        old=ledger[(ledger['date']==game_date)&(ledger['result'].isin(['pending'])|ledger['result'].isna())]
        priced_old=set(rk(old[has_price(old)]))
        downgrade=rk(nr).isin(priced_old)&~has_price(nr)
        if downgrade.any(): print(f'  Ledger: kept {int(downgrade.sum())} earlier rows that had real odds (this run had none for them)')
        nr=nr[~downgrade]
    keep=~((ledger['date']==game_date)&rk(ledger).isin(set(rk(nr)))&(ledger['result'].isin(['pending'])|ledger['result'].isna())) if len(ledger) else None
    ledger=pd.concat([ledger[keep],nr],ignore_index=True) if len(ledger) else nr
    print(f'  NHL API failed requests this run: {nhl.fails}') if nhl.fails else None
save_ledger(ledger)
report(ledger)

# BetLab POTD JSON (paste into the tracker's "Paste JSON" box)
bets=[p for p in preds if p['tier'] in('STRONG BET','VALUE BET') and p['pregame']]
if bets:
    b=max(bets,key=lambda x:x['edge'])
    potd={'sport':'nhl','date':f'{GD.strftime("%b")} {GD.day}','game':f'{b["at"]} @ {b["ht"]}','pick':f'{b["pick"]} ML',
        'odds':f'{int(b["odds"]):+d}','notes':f'NHL v12 edge {b["edge"]:+.1f}%, model {b["pct"]:.1f}%'}
    print(f'\nBetLab POTD JSON:\n{json.dumps(potd)}')

print(f'\n{S}\n  v12.0 | {game_date} | {len(preds)} games | DC gamma={dc.gam:.4f}'+(f'\n  PLAYOFF MODE | sudden-death OT' if IS_PO else '')+f'\n{S}')
out={'date':game_date,'ver':'12.0','rho':dc.rho,'gamma':dc.gam,'l3':L3,'playoff':IS_PO,'trained':len(hist),'nb_r':NB_R,
    'preds':[{'m':p['matchup'],'ht':p['ht'],'at':p['at'],'hxg':p['hxg'],'axg':p['axg'],'t':p['total'],
        'hwp':p['hwp'],'awp':p['awp'],'hml':p['vl'].hml if p['vl'] else 0,'aml':p['vl'].aml if p['vl'] else 0,
        'spr':p['vl'].spread if p['vl'] else 0,'vtot':p['vl'].total if p['vl'] else 0,'tier':p['tier'],
        'hg':p['hg'].name,'ag':p['ag'].name,'series':p.get('series',''),'gnum':p.get('gnum',0),'team_sog':p.get('team_sog')} for p in preds],
    'sog':[{'name':p['name'],'team':p['team'],'proj':round(p['lam'],2),'line':p['line'],'src':p['src'],'side':p['side'],'edge':round(p['edge'],2)} for p in sog_rows],
    'ts':now_s}
try:
    fp=f'{DRIVE}/nhl_{game_date}.json'
    with open(fp,'w') as f: json.dump(out,f,indent=2,default=float)
    with open(f'{DRIVE}/nhl_latest.json','w') as f: json.dump(out,f,indent=2,default=float)
    print(f'\nSaved: {fp}')
except Exception as e: print(f'\nDrive save skipped: {e}')

# CHANGELOG v11.2 -> v12.0
# - Playoff mode now comes from the NHL schedule's gameType (v11.2 treated Oct-Dec as playoffs)
# - GAME_DATE defaults to today in Central time (Colab runs on UTC); season derived from the game date
# - Preseason games skipped; history/recent form use only regular-season (+playoff) games
# - sched() no longer returns another day's games when the date is missing
# - Injury adjustment sign fixed (injured good player now lowers his team's xG)
# - Away win% adjustment now uses the away team's record
# - Home ice no longer double-counted on top of Dixon-Coles gamma; PP adjustment removed (already inside all-situations xG)
# - Goalie adjustment uses the league save % from the NHL stats API instead of a hardcoded .910
# - Shootout goal removed from DC training scores; last season's games included (time-decayed) so DC works from night one
# - Team xG prior = last season regressed 1/3 to league (instead of flat 2.80)
# - OT: analytic (no Monte Carlo); playoff diagonal no longer zeroed; totals now include the OT/SO goal
# - Name matching for goalies/injuries uses full names + team (no last-name-only collisions)
# - Game times shown in real Central time (CDT/CST)
# - NEW: player SOG model + self-grading ledger (ML + SOG W/L, units, ROI, Brier, projection bias/MAE)
# v12.0 review pass
# - Retry with backoff on all NHL / stats / MoneyPuck requests; failed-request count is printed and warned
# - Grading refuses a boxscore whose teams don't match the ledger row (left pending)
# - Pregame rerun with a dead odds source no longer replaces rows that had real odds/lines
# - Travel = last game's arena -> tonight's arena, for both teams (was: to the away team's own city)
# - Odds API SOG: when a player has several lines, the main (most evenly priced) one is used
# - kelly() edge now in percentage points (same unit as the betslip); ML accuracy/Brier exclude pushes
