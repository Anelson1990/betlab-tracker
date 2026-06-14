export const SEED_CARDS = [
  { id: "0607", date: "Jun 7",  potd: "CWS @ PHI YRFI",    potdResult: "W", potdPL: 9,     rfi: "2-1", ml: "0-0", hitParlay: "L", staked: 40,    pl: 9,      bankroll: 330, notes: "POTD 1-0. RFI model on fire." },
  { id: "0608", date: "Jun 8",  potd: "WSH @ SF NRFI",     potdResult: "W", potdPL: 18.03, rfi: "3-1", ml: "1-1", hitParlay: "L", staked: 52.54, pl: 6.73,   bankroll: 337, notes: "Webb+Lovelady. Buddy NYY NRFI killed parlay. CLE lost extras." },
  { id: "0609", date: "Jun 9",  potd: "ARI @ MIA YRFI",    potdResult: "W", potdPL: 10,    rfi: "1-1", ml: "2-0", hitParlay: "L", staked: 52,    pl: -20.57, bankroll: 279, notes: "LAD 12-2 blowout. Rice 0-5. NYY+MIA won but parlay dead." },
  { id: "0610", date: "Jun 10", potd: "PHI @ TOR YRFI",    potdResult: "W", potdPL: 19,    rfi: "3-2", ml: "0-0", hitParlay: "W", staked: 85,    pl: 36,     bankroll: 153, notes: "Harper HR. Caminero+Diaz+Aranda all hit. $30→$153." },
  { id: "0611", date: "Jun 11", potd: "ATL ML -116",        potdResult: "V", potdPL: 0,     rfi: "1-0", ml: "0-1", hitParlay: "L", staked: 45,    pl: -21,    bankroll: 132, notes: "ATL postponed. KC SGP lost. MIN SGP lost 11-0." },
  { id: "0612", date: "Jun 12", potd: "ATL ML +110",        potdResult: "L", potdPL: -20,   rfi: "0-1", ml: "0-3", hitParlay: "W", staked: 50,    pl: -44,    bankroll: 5,   notes: "Consensus ML 0-5. ATL slammed. Deposited $35." },
  { id: "0613", date: "Jun 13", potd: "ARI ML (Paper)",     potdResult: "P", potdPL: 0,     rfi: "2-0", ml: "8-0", hitParlay: "P", staked: 0,     pl: 0,      bankroll: 40,  notes: "Missed day. Models 15/15 paper. ARI 5-2. All 8 ML won." },
];

export const SEED_MODELS = [
  { name: "MC YRFI",       bets: 32,  wins: 24, profit: 128.80,  roi: 40.2,  status: "active",  note: "Best ROI. 65%+ threshold. STRONG AGREE only." },
  { name: "LGB Moderate",  bets: 35,  wins: 24, profit: 120.90,  roi: 34.5,  status: "active",  note: "3rd best ROI. Underused. Check every day." },
  { name: "Hit Locks",     bets: 20,  wins: 15, profit: 65.35,   roi: 32.7,  status: "active",  note: "85%+ rate. Best parlay legs. Check splits." },
  { name: "Hit Std",       bets: 89,  wins: 64, profit: 242.16,  roi: 27.2,  status: "active",  note: "80%+ only. SGP legs not singles (-200 juice)." },
  { name: "NRFI RB v2.3",  bets: 123, wins: 78, profit: 209.90,  roi: 17.1,  status: "active",  note: "63%+ only. Dead zone 65-74% skip." },
  { name: "Consensus ML",  bets: 59,  wins: 36, profit: 83.04,   roi: 14.1,  status: "active",  note: "Must agree with XGB for bet." },
  { name: "XGB F5 ML",     bets: 128, wins: 77, profit: 159.57,  roi: 12.5,  status: "active",  note: "Best ML model. Sharp 20%+ against = skip." },
  { name: "MC F5 Total",   bets: 153, wins: 90, profit: 153.00,  roi: 10.0,  status: "active",  note: "Underused. +$153 profit. Check w/ XGB Total." },
  { name: "POI YRFI",      bets: 145, wins: 83, profit: 102.10,  roi: 7.0,   status: "active",  note: "Secondary RFI. Use when MC YRFI agrees." },
  { name: "Hit Parlay",    bets: 45,  wins: 25, profit: -7.75,   roi: -1.7,  status: "monitor", note: "3-leg max 80%+. SGP legs preferred." },
  { name: "MC Full ML",    bets: 102, wins: 46, profit: -159.80, roi: -15.7, status: "display", note: "Display only. Never bet directly." },
  { name: "MC NRFI",       bets: 52,  wins: 25, profit: -52.50,  roi: -10.1, status: "display", note: "Display only. Negative ROI." },
  { name: "RB ML",         bets: 103, wins: 50, profit: -95.22,  roi: -9.2,  status: "retired", note: "Retired. Negative ROI." },
  { name: "RFI New v2.0",  bets: 14,  wins: 8,  profit: 26.00,   roi: 18.6,  status: "retired", note: "Retired. 57% WR — dropped from 63%." },
];

export const MODEL_COLORS = {
  "MC YRFI":      "#4ade80",
  "LGB Moderate": "#60a5fa",
  "Hit Locks":    "#f97316",
  "Hit Std":      "#34d399",
  "NRFI RB v2.3": "#a78bfa",
  "Consensus ML": "#e879f9",
  "XGB F5 ML":    "#818cf8",
  "MC F5 Total":  "#38bdf8",
  "POI YRFI":     "#fbbf24",
  "Hit Parlay":   "#94a3b8",
  "MC Full ML":   "#f87171",
  "MC NRFI":      "#fb7185",
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
