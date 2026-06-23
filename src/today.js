// BetLab Today Card — replaced completely each session
// Last updated: Jun 22, 2026
export const TODAY_CARD = {
  date: "Jun 22",
  bankroll: 185.90,
  potd: {
    pick: "CHC ML -124",
    game: "CHC @ NYM",
    direction: "CHC",
    odds: "-124",
    stake: 20,
    type: "money",
    sources: "XGB 75% · Sharp 59% gap · Senga ERA 9.00 returning from TJ · PCA 95%",
    analysis: "Game postponed — POTD void. CHC lineup strong vs Senga ERA 9.00.",
    result: "void", pl: 0,
  },
  rfi: [
    { game: "CHC @ NYM", homeTeam: "NYM", awayTeam: "CHC", pick: "YRFI", conf: "64.0%", stake: 0, type: "paper", result: "void", pl: 0, notes: "Game postponed" },
    { game: "MIL @ CIN", homeTeam: "CIN", awayTeam: "MIL", pick: "YRFI", conf: "63.8%", stake: 10, type: "money", result: "loss", pl: -10, notes: "Was NRFI — Singer held MIL in 1st" },
  ],
  ml: [
    { game: "LAD @ MIN", direction: "LAD", odds: "-148", stake: 0, sources: "XGB 75% · Sharp 67% gap · Ohtani/Freeman/Betts/Tucker", type: "paper", result: "pending", pl: 0 },
    { game: "MIL @ CIN", direction: "MIL", odds: "-148", stake: 0, sources: "XGB 75% · Sharp 60% gap · Woodruff vs Singer ERA 5.32", type: "paper", result: "pending", pl: 0 },
    { game: "STL",       direction: "STL", odds: "-144", stake: 0, sources: "XGB 75% · Sharp 47% gap · Pallante ERA 3.76 vs Kelly ERA 5.81", type: "paper", result: "win", pl: 0 },
  ],
  hitParlay: {
    stake: 13,
    odds: "flex",
    payout: 13,
    type: "prizepicks_flex",
    result: "void",
    pl: 0,
    notes: "PCA + Suzuki void CHC postponed. Burleson hit. $13 refund.",
    legs: [
      { player: "PCA O0.5 hits",     team: "CHC", rate: "95%", l10: "10/10", split: "vs Senga ERA 9.00", result: "void" },
      { player: "Burleson O0.5 hits",team: "STL", rate: "95%", l10: "9/10",  split: "vs Kelly ERA 5.81", result: "win" },
      { player: "Suzuki O0.5 hits",  team: "CHC", rate: "85%", l10: "9/10",  split: "vs Senga ERA 9.00", result: "void" },
    ],
  },
  sgp: {
    stake: 10,
    odds: "+269",
    payout: 36.90,
    type: "money",
    result: "win",
    pl: 26.90,
    notes: "STL F5 + Herrera hit + Del Castillo hit · +5% boost · cashed $36.90",
    legs: [
      { player: "STL F5 ML",              team: "STL", prop: "F5 ML",  rate: "XGB 75%", note: "✅ Pallante ERA 3.76" },
      { player: "Ivan Herrera O0.5 hits", team: "STL", prop: "hits",   rate: "80%",     note: "✅ cashed" },
      { player: "Del Castillo O0.5 hits", team: "ARI", prop: "hits",   rate: "80%",     note: "✅ cashed" },
    ],
  },
  totalPL: 5.16,
  notes: "CHC postponed chaos — pivoted to STL SGP +269 WIN + ATL NRFI WIN. YRFI parlay lost MIL was NRFI. PP refund. B365 still empty.",
};
