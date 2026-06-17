export const SEED_CARDS = [
  { id: "0607", date: "Jun 7",  potd: "CWS @ PHI YRFI",    potdResult: "W", potdPL: 9,     rfi: "2-1", ml: "0-0", hitParlay: "L", staked: 40,    pl: 9,      bankroll: 330,   notes: "POTD 1-0. RFI model on fire." },
  { id: "0608", date: "Jun 8",  potd: "WSH @ SF NRFI",     potdResult: "W", potdPL: 18.03, rfi: "3-1", ml: "1-1", hitParlay: "L", staked: 52.54, pl: 6.73,   bankroll: 337,   notes: "Webb+Lovelady. Buddy NYY NRFI killed parlay. CLE lost extras." },
  { id: "0609", date: "Jun 9",  potd: "ARI @ MIA YRFI",    potdResult: "W", potdPL: 10,    rfi: "1-1", ml: "2-0", hitParlay: "L", staked: 52,    pl: -20.57, bankroll: 279,   notes: "LAD 12-2 blowout. Rice 0-5. NYY+MIA won but parlay dead." },
  { id: "0610", date: "Jun 10", potd: "PHI @ TOR YRFI",    potdResult: "W", potdPL: 19,    rfi: "3-2", ml: "0-0", hitParlay: "W", staked: 85,    pl: 36,     bankroll: 153,   notes: "Harper HR. Caminero+Diaz+Aranda all hit. $30→$153." },
  { id: "0611", date: "Jun 11", potd: "ATL ML -116",        potdResult: "V", potdPL: 0,     rfi: "1-0", ml: "0-1", hitParlay: "L", staked: 45,    pl: -21,    bankroll: 132,   notes: "ATL postponed. KC SGP lost. MIN SGP lost 11-0." },
  { id: "0612", date: "Jun 12", potd: "ATL ML +110",        potdResult: "L", potdPL: -20,   rfi: "0-1", ml: "0-3", hitParlay: "W", staked: 50,    pl: -44,    bankroll: 5,     notes: "Consensus ML 0-5. ATL slammed. Deposited $35." },
  { id: "0613", date: "Jun 13", potd: "ARI ML (Paper)",     potdResult: "P", potdPL: 0,     rfi: "2-0", ml: "8-0", hitParlay: "P", staked: 0,     pl: 0,      bankroll: 40,    notes: "Missed day. Models 15/15 paper. ARI 5-2. All 8 ML won." },
  { id: "0614", date: "Jun 14", potd: "ATL ML +108",        potdResult: "L", potdPL: -10,   rfi: "0-0", ml: "3-2", hitParlay: "W", staked: 15,    pl: -2.68,  bankroll: 37.32, notes: "ATL 1-8 loss. Hit parlay +146 cashed early. SD/MIL/NYY paper wins. COL 23-9 OVER missed." },
  { id: "0615", date: "Jun 15", potd: "CIN ML -136",        potdResult: "W", potdPL: 18.38, rfi: "0-0", ml: "4-1", hitParlay: "L", staked: 30,    pl: 95.38,  bankroll: 121.22,notes: "Burns 12-0 Cy Young. ML parlay $5→$87 cashed (PHI/WSH/CIN/STL/CHC/ATH). Hit parlay lost PCA only." },
  { id: "0616", date: "Jun 16", potd: "WSH ML -136", potdResult: "W", potdPL: 11.03, rfi: "0-0", ml: "3-2", hitParlay: "P", staked: 35, pl: -4, bankroll: 84.23, notes: "WSH won 76% sharp gap. 6-leg ML parlay lost (SD + CHC killed it). CIN YRFI off card +$9.57. ⚠️ Hit parlay LIVE — Lee suspended game resumes Jun 17 2PM. Taylor ✅ Burleson ✅ Lee ⏳" },
];

export const SEED_MODELS = [
  { name: "MC YRFI",       bets: 33,  wins: 24,  profit: 118.80,  roi: 36.0,  status: "active",  note: "Best ROI. 65%+ threshold. STRONG AGREE only. No dead zone." },
  { name: "Hit Locks",     bets: 30,  wins: 24,  profit: 124.56,  roi: 41.5,  status: "active",  note: "Best prop signal. 80% WR. 85%+ rate · lineup confirmed · Savant verified before adding." },
  { name: "LGB Moderate",  bets: 33,  wins: 20,  profit: 44.00,   roi: 13.3,  status: "active",  note: "65-70% tier only. LGB Strong retired -18.2% ROI. Check every pick." },
  { name: "Hit Std",       bets: 131, wins: 91,  profit: 299.79,  roi: 22.9,  status: "active",  note: "80%+ only. SGP legs preferred over singles due to juice." },
  { name: "NRFI RB v2.3",  bets: 128, wins: 80,  profit: 216.00,  roi: 16.9,  status: "active",  note: "63%+ only. Dead zone 65-74% = skip. SPOT flag = check ERA before skipping." },
  { name: "XGB F5 ML",     bets: 153, wins: 93,  profit: 208.70,  roi: 13.6,  status: "active",  note: "Best ML model. Must agree with Consensus. Sharp 20%+ against = skip." },
  { name: "Consensus ML",  bets: 93,  wins: 57,  profit: 135.65,  roi: 14.6,  status: "active",  note: "Primary ML signal. Must agree with XGB. Sharp 20%+ against = skip." },
  { name: "MC F5 Total",   bets: 177, wins: 106, profit: 212.20,  roi: 12.0,  status: "active",  note: "+$212 profit. 59.9% WR. Check when XGB F5 Total agrees. Underused." },
  { name: "Consensus F5",  bets: 52,  wins: 31,  profit: 59.57,   roi: 11.5,  status: "active",  note: "Recovered to positive ROI. Use when firing with XGB F5." },
  { name: "MC F5 ML",      bets: 189, wins: 102, profit: 17.40,   roi: 0.9,   status: "active",  note: "54% WR. Use only when STRONG AGREE fires with XGB." },
  { name: "Hit Parlay",    bets: 78,  wins: 45,  profit: 16.05,   roi: 2.1,   status: "monitor", note: "3-leg max 80%+. Lineup confirmed + Savant verified before building." },
  { name: "POI YRFI",      bets: 178, wins: 83,  profit: -227.90, roi: -12.8, status: "monitor", note: "⚠️ Monitoring — 46.6% WR. May be double-graded. Do not bet until verified." },
  { name: "MC Full ML",    bets: 102, wins: 46,  profit: -159.80, roi: -15.7, status: "display", note: "Display only. Never bet directly. Negative ROI confirmed." },
  { name: "MC NRFI",       bets: 52,  wins: 25,  profit: -52.50,  roi: -10.1, status: "display", note: "Display only. Negative ROI." },
  { name: "LGB Strong",    bets: 16,  wins: 7,   profit: -29.10,  roi: -18.2, status: "retired", note: "Retired. 43.8% WR. Only use LGB Moderate 65-70% tier." },
  { name: "RB ML",         bets: 103, wins: 50,  profit: -95.22,  roi: -9.2,  status: "retired", note: "Retired. Negative ROI confirmed." },
  { name: "RFI New v2.0",  bets: 14,  wins: 8,   profit: 26.00,   roi: 18.6,  status: "retired", note: "Retired. Dropped from 63% to 57% WR." },
];

export const MODEL_COLORS = {
  "MC YRFI":      "#4ade80",
  "LGB Moderate": "#60a5fa",
  "Hit Locks":    "#f97316",
  "Hit Std":      "#34d399",
  "NRFI RB v2.3": "#a78bfa",
  "XGB F5 ML":    "#818cf8",
  "MC F5 Total":  "#38bdf8",
  "Consensus ML": "#e879f9",
  "MC F5 ML":     "#fbbf24",
  "Hit Parlay":   "#94a3b8",
  "POI YRFI":     "#fb923c",
  "MC Full ML":   "#f87171",
  "MC NRFI":      "#fb7185",
  "LGB Strong":   "#6b7280",
  "RB ML":        "#ef4444",
  "RFI New v2.0": "#6b7280",
};

export const STATUS_CONFIG = {
  active:  { label: "✅ Active",       color: "#4ade80", bg: "rgba(74,222,128,.12)",  border: "#14532d" },
  monitor: { label: "⚠️ Monitor",      color: "#fbbf24", bg: "rgba(251,191,36,.12)",  border: "#713f12" },
  display: { label: "📋 Display",      color: "#94a3b8", bg: "rgba(148,163,184,.12)", border: "#334155" },
  retired: { label: "❌ Retired",      color: "#f87171", bg: "rgba(248,113,113,.12)", border: "#7f1d1d" },
};

export const RESULT_CONFIG = {
  W: { label: "WIN",   color: "#4ade80", bg: "rgba(74,222,128,.15)",  border: "#14532d" },
  L: { label: "LOSS",  color: "#f87171", bg: "rgba(248,113,113,.15)", border: "#7f1d1d" },
  V: { label: "VOID",  color: "#94a3b8", bg: "rgba(148,163,184,.15)", border: "#334155" },
  P: { label: "PAPER", color: "#60a5fa", bg: "rgba(96,165,250,.15)",  border: "#1e40af" },
};

export const TODAY_CARD = {
  date: "Jun 17",
  bankroll: 84.23,
  potd: {
    pick: "MIA ML +107",
    game: "MIA @ PHI",
    direction: "MIA",
    odds: "+107",
    stake: 15,
    type: "money",
    sources: "XGB 87.0% · Con 87.0% · Sharp 32% gap · Alcantara ERA 4.25 · Painter ERA 6.43 1-7",
    analysis: "Alcantara 6-4 ERA 4.25 WHIP 1.22 vs Painter 1-7 ERA 6.43 12 HRs allowed. MIA on 6-game win streak. Sharp money 32% gap on MIA plus money. NBC Sports model also on MIA. Painter K rate 17th percentile relying on worst defense in league.",
    result: "pending", pl: 0,
  },
  rfi: [
    { game: "MIA @ PHI", homeTeam: "PHI", awayTeam: "MIA", pick: "YRFI", conf: "63.4", stake: 8, type: "money", result: "pending", pl: 0 },
    { game: "NYM @ CIN", homeTeam: "CIN", awayTeam: "NYM", pick: "YRFI", conf: "manual", stake: 4, type: "money", result: "loss", pl: -4 },
  ],
  ml: [
    { game: "KC @ WSH", direction: "WSH", odds: "-135", stake: 0, sources: "XGB 95.8% · Sharp 52% gap · 4th straight day", type: "paper", result: "pending", pl: 0 },
    { game: "SF @ ATL", direction: "ATL", odds: "-134", stake: 0, sources: "XGB 93.5% · Con 93.5% · suspended game", type: "paper", result: "pending", pl: 0 },
    { game: "DET @ HOU", direction: "HOU", odds: "-100", stake: 0, sources: "XGB 82.7% · Con 82.7%", type: "paper", result: "pending", pl: 0 },
  ],
  hitParlay: {
    stake: 8,
    odds: "",
    payout: 0,
    type: "money",
    result: "pending",
    pl: 0,
    legs: [
      { player: "Samad Taylor", team: "SD", rate: "88.9%", l10: "8/9", split: "vsRHP .348 · batting 2nd", result: "pending" },
      { player: "Alec Burleson", team: "STL", rate: "85%", l10: "10/10", split: "vsRHP .330 · xwOBA .388", result: "pending" },
      { player: "James Wood", team: "WSH", rate: "80%", l10: "9/10", split: "vsRHP .293 · vs Avila ERA 6.19", result: "pending" },
    ],
  },
  sgp: { stake: 0, odds: "", type: "paper", result: "pending", pl: 0, legs: [] },
  totalPL: -4,
  notes: "⚠️ CARRYOVER: Jun 16 hit parlay (Taylor ✅ Burleson ✅ Lee ⏳) still live — suspended game resumes 2PM. Lee needs 1 hit to cash.",
};

export const SEED_SHARP = [
  {
    date: "Jun 14",
    picks: [
      { id: "1", game: "KC @ WSH", sharpPick: "WSH -136", sharpOdds: "-136", gap: 76, confirms: "confirms", result: "win" },
      { id: "2", game: "MIN @ TEX", sharpPick: "TEX -125", sharpOdds: "-125", gap: 40, confirms: "conflicts", result: "loss" },
      { id: "3", game: "SD @ BAL", sharpPick: "SD +120", sharpOdds: "+120", gap: 34, confirms: "confirms", result: "win" },
      { id: "4", game: "ATL @ NYM", sharpPick: "ATL +108", sharpOdds: "+108", gap: 11, confirms: "confirms", result: "loss" },
      { id: "5", game: "DET @ CLE", sharpPick: "DET -110", sharpOdds: "-110", gap: 2, confirms: "neutral", result: "loss" },
    ]
  },
  {
    date: "Jun 15",
    picks: [
      { id: "1", game: "KC @ WSH", sharpPick: "WSH -135", sharpOdds: "-135", gap: 61, confirms: "confirms", result: "win" },
      { id: "2", game: "NYM @ CIN", sharpPick: "CIN -136", sharpOdds: "-136", gap: 41, confirms: "confirms", result: "win" },
      { id: "3", game: "TB @ LAD", sharpPick: "TB +158", sharpOdds: "+158", gap: 45, confirms: "neutral", result: "loss" },
      { id: "4", game: "DET @ HOU", sharpPick: "DET +105", sharpOdds: "+105", gap: 24, confirms: "conflicts", result: "loss" },
      { id: "5", game: "MIN @ TEX", sharpPick: "MIN +135", sharpOdds: "+135", gap: 19, confirms: "confirms", result: "win" },
      { id: "6", game: "PHI @ MIL", sharpPick: "MIL +110", sharpOdds: "+110", gap: 7, confirms: "conflicts", result: "win" },
    ]
  },
  {
    date: "Jun 16",
    picks: [
      { id: "1", game: "KC @ WSH", sharpPick: "WSH -136", sharpOdds: "-136", gap: 76, confirms: "confirms", result: "win" },
      { id: "2", game: "MIN @ TEX", sharpPick: "TEX -125", sharpOdds: "-125", gap: 40, confirms: "conflicts", result: "loss" },
      { id: "3", game: "LAA @ ARI", sharpPick: "ARI -105", sharpOdds: "-105", gap: 27, confirms: "neutral", result: "win" },
      { id: "4", game: "DET @ HOU", sharpPick: "HOU -166", sharpOdds: "-166", gap: 24, confirms: "neutral", result: "win" },
      { id: "5", game: "BAL @ SEA", sharpPick: "BAL +135", sharpOdds: "+135", gap: 23, confirms: "neutral", result: "loss" },
      { id: "6", game: "CLE @ MIL", sharpPick: "MIL -150", sharpOdds: "-150", gap: 14, confirms: "neutral", result: "win" },
      { id: "7", game: "NYM @ CIN", sharpPick: "CIN even", sharpOdds: "even", gap: 3, confirms: "confirms", result: "win" },
    ]
  },
  {
    date: "Jun 17",
    picks: [
      { id: "1", game: "LAA @ ARI", sharpPick: "ARI -170", sharpOdds: "-170", gap: 53, confirms: "neutral", result: "pending" },
      { id: "2", game: "KC @ WSH", sharpPick: "WSH -135", sharpOdds: "-135", gap: 52, confirms: "confirms", result: "pending" },
      { id: "3", game: "BAL @ SEA", sharpPick: "BAL +116", sharpOdds: "+116", gap: 37, confirms: "neutral", result: "pending" },
      { id: "4", game: "CLE @ MIL", sharpPick: "CLE +106", sharpOdds: "+106", gap: 36, confirms: "neutral", result: "pending" },
      { id: "5", game: "MIA @ PHI", sharpPick: "MIA +107", sharpOdds: "+107", gap: 32, confirms: "confirms", result: "pending" },
      { id: "6", game: "PIT @ ATH", sharpPick: "PIT -124", sharpOdds: "-124", gap: 25, confirms: "neutral", result: "pending" },
      { id: "7", game: "NYM @ CIN", sharpPick: "NYM -130", sharpOdds: "-130", gap: 14, confirms: "conflicts", result: "pending" },
      { id: "8", game: "SD @ STL", sharpPick: "STL -125", sharpOdds: "-125", gap: 6, confirms: "neutral", result: "pending" },
      { id: "9", game: "DET @ HOU", sharpPick: "DET -110", sharpOdds: "-110", gap: 1, confirms: "neutral", result: "pending" },
    ]
  },
];

export const CHECKLIST = [
  { id: "weather",  step: 1,  label: "Weather",      desc: "Wind 10mph+? Direction? Dome? Temp extremes? Flag any game with 10mph+ blowing in/out." },
  { id: "umpire",   step: 2,  label: "Umpire",       desc: "Wide or tight zone? ABS challenge system impact? Check covers.com/umpires." },
  { id: "injuries", step: 3,  label: "Injuries",     desc: "Any lineup scratches? SP changes? Games still awaiting lineups?" },
  { id: "rfi",      step: 4,  label: "RFI Check",    desc: "RFI RB v2.3 63%+? MC YRFI 65%+? Both agree = stronger signal. Dead zone 65-74% = skip. SPOT flag = check ERA." },
  { id: "ml",       step: 5,  label: "ML Check",     desc: "XGB F5 ML fires? Consensus agrees? LGB Moderate? MC F5 ML? Sharp 20%+ against = skip. Juice -150+ = SGP only." },
  { id: "sharp",    step: 6,  label: "Sharp Money",  desc: "Tickets% vs Money% gap. 20%+ = reverse signal. 30%+ = strong. 40%+ = very strong. Plus money underdog 30%+ = value." },
  { id: "potd",     step: 7,  label: "POTD",         desc: "Highest confidence minus money. 3+ sources. Juice under -150. ALL models agree direction. LGB conflict = no POTD." },
  { id: "hits",     step: 8,  label: "Hit Props",    desc: "80%+ rate. L10 8/10+. xBA above AVG. Splits confirmed. Green/yellow matchup. Contact hitter. Game not started?" },
  { id: "kprops",   step: 9,  label: "K Props",      desc: "75%+ rate. Green matchup. Line matches projection. Use as SGP legs not standalone." },
  { id: "sgp",      step: 10, label: "SGP Build",    desc: "ML confirmed 2+ models + K prop or hit prop correlated. All same game. Combined odds plus money." },
  { id: "staking",  step: 11, label: "Staking",      desc: "POTD $10 max. MC YRFI $8-10. RFI $5-8. SGP $8-10. Hit parlay $5. No single bet over $10 until $100 bankroll." },
  { id: "discipline", step: 12, label: "Discipline", desc: "Any bet over limit? Sharp opposing ML? Hit parlay all 80%+? Same team multiple slips? LGB checked? MC F5 Total checked? Sharp on every ML?" },
];
