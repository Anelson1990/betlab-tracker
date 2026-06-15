export const SEED_CARDS = [
  { id: "0607", date: "Jun 7",  potd: "CWS @ PHI YRFI",    potdResult: "W", potdPL: 9,     rfi: "2-1", ml: "0-0", hitParlay: "L", staked: 40,    pl: 9,      bankroll: 330, notes: "POTD 1-0. RFI model on fire." },
  { id: "0608", date: "Jun 8",  potd: "WSH @ SF NRFI",     potdResult: "W", potdPL: 18.03, rfi: "3-1", ml: "1-1", hitParlay: "L", staked: 52.54, pl: 6.73,   bankroll: 337, notes: "Webb+Lovelady. Buddy NYY NRFI killed parlay. CLE lost extras." },
  { id: "0609", date: "Jun 9",  potd: "ARI @ MIA YRFI",    potdResult: "W", potdPL: 10,    rfi: "1-1", ml: "2-0", hitParlay: "L", staked: 52,    pl: -20.57, bankroll: 279, notes: "LAD 12-2 blowout. Rice 0-5. NYY+MIA won but parlay dead." },
  { id: "0610", date: "Jun 10", potd: "PHI @ TOR YRFI",    potdResult: "W", potdPL: 19,    rfi: "3-2", ml: "0-0", hitParlay: "W", staked: 85,    pl: 36,     bankroll: 153, notes: "Harper HR. Caminero+Diaz+Aranda all hit. $30→$153." },
  { id: "0611", date: "Jun 11", potd: "ATL ML -116",        potdResult: "V", potdPL: 0,     rfi: "1-0", ml: "0-1", hitParlay: "L", staked: 45,    pl: -21,    bankroll: 132, notes: "ATL postponed. KC SGP lost. MIN SGP lost 11-0." },
  { id: "0612", date: "Jun 12", potd: "ATL ML +110",        potdResult: "L", potdPL: -20,   rfi: "0-1", ml: "0-3", hitParlay: "W", staked: 50,    pl: -44,    bankroll: 5,   notes: "Consensus ML 0-5. ATL slammed. Deposited $35." },
  { id: "0613", date: "Jun 13", potd: "ARI ML (Paper)",     potdResult: "P", potdPL: 0,     rfi: "2-0", ml: "8-0", hitParlay: "P", staked: 0,     pl: 0,      bankroll: 40,  notes: "Missed day. Models 15/15 paper. ARI 5-2. All 8 ML won." },
  { id: "0614", date: "Jun 14", potd: "ATL ML +108",        potdResult: "L", potdPL: -10,   rfi: "0-0", ml: "3-2", hitParlay: "W", staked: 15,    pl: -2.68,  bankroll: 37.32, notes: "ATL 1-8 loss. Hit parlay +146 cashed early. SD/MIL/NYY paper wins. COL 23-9 OVER missed." },
];

export const SEED_MODELS = [
  { name: "MC YRFI",       bets: 33,  wins: 24,  profit: 118.80,  roi: 36.0,  status: "active",  note: "Best ROI. 65%+ threshold. STRONG AGREE only. No dead zone." },
  { name: "LGB Moderate",  bets: 31,  wins: 19,  profit: 45.30,   roi: 14.6,  status: "active",  note: "3rd best ROI. 65-70% tier only. LGB Strong retired -19.9% ROI." },
  { name: "Hit Locks",     bets: 27,  wins: 22,  profit: 119.18,  roi: 44.1,  status: "active",  note: "Best prop signal. 81.5% WR. 85%+ rate · check splits · green matchup." },
  { name: "Hit Std",       bets: 114, wins: 82,  profit: 310.58,  roi: 27.2,  status: "active",  note: "80%+ only. SGP legs · not singles due to -200 juice." },
  { name: "NRFI RB v2.3",  bets: 123, wins: 78,  profit: 209.90,  roi: 17.1,  status: "active",  note: "63%+ only. Dead zone 65-74% = skip. Review SPOT flag dont auto-skip." },
  { name: "XGB F5 ML",     bets: 138, wins: 82,  profit: 153.04,  roi: 11.1,  status: "active",  note: "Best ML model. Must agree with Consensus. Sharp 20%+ against = skip." },
  { name: "MC F5 Total",   bets: 167, wins: 100, profit: 200.00,  roi: 12.0,  status: "active",  note: "Underused. +$200 profit. 59.9% WR. Check when XGB F5 Total agrees." },
  { name: "Consensus ML",  bets: 77,  wins: 44,  profit: 52.61,   roi: 6.8,   status: "active",  note: "Must agree with XGB F5 ML. Sharp 20%+ against = skip." },
  { name: "MC F5 ML",      bets: 183, wins: 101, profit: 58.70,   roi: 3.2,   status: "active",  note: "55.2% WR. Use when STRONG AGREE fires with XGB." },
  { name: "Hit Parlay",    bets: 58,  wins: 33,  profit: 3.77,    roi: 0.6,   status: "monitor", note: "Marginally positive. 3-leg max 80%+. SGP legs preferred over parlay." },
  { name: "POI YRFI",      bets: 178, wins: 83,  profit: -227.90, roi: -12.8, status: "monitor", note: "⚠️ Monitoring — 46.6% WR. May be double-graded. Verify before retiring." },
  { name: "MC Full ML",    bets: 102, wins: 46,  profit: -159.80, roi: -15.7, status: "display", note: "Display only. Never bet directly. Negative ROI confirmed." },
  { name: "MC NRFI",       bets: 52,  wins: 25,  profit: -52.50,  roi: -10.1, status: "display", note: "Display only. Negative ROI." },
  { name: "LGB Strong",    bets: 14,  wins: 6,   profit: -27.80,  roi: -19.9, status: "retired", note: "Retired. 42.9% WR. Only use LGB Moderate 65-70% tier." },
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
