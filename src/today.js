// BetLab Today Card — replaced completely each session
// Last updated: Jun 21, 2026
export const TODAY_CARD = {
  date: "Jun 21",
  bankroll: 180.74,
  potd: {
    pick: "CIN ML even",
    game: "CIN @ NYY",
    direction: "CIN",
    odds: "even",
    stake: 0,
    type: "money",
    sources: "Burns ERA 2.01 8-1 vs Rodriguez ERA 4.15 SPOT. 56% money on CIN quietly.",
    analysis: "Chase Burns ERA 2.01 8-1 vs Rodriguez ERA 4.15 0 starts. Even money exceptional value. Cashed.",
    result: "win", pl: 0,
  },
  rfi: [
    { game: "CWS @ DET", homeTeam: "DET", awayTeam: "CWS", pick: "NRFI", conf: "62.8%", stake: 0, type: "paper", result: "win", pl: 0 },
    { game: "MIL @ ATL", homeTeam: "ATL", awayTeam: "MIL", pick: "YRFI", conf: "62.0%", stake: 0, type: "paper", result: "win", pl: 0 },
  ],
  ml: [
    { game: "NYM @ PHI", direction: "PHI", odds: "-180", stake: 0, sources: "XGB+MC. Wheeler ERA 2.01. 74% sharp.", type: "paper", result: "win", pl: 0 },
    { game: "WSH @ TB",  direction: "TB",  odds: "-130", stake: 0, sources: "Martinez ERA 2.60. 48% sharp.", type: "paper", result: "pending", pl: 0 },
    { game: "SF @ MIA",  direction: "SF",  odds: "-140", stake: 0, sources: "Webb ERA 3.46 vs Gusto ERA 7.24. 41% sharp.", type: "paper", result: "win", pl: 0 },
  ],
  hitParlay: {
    stake: 0, odds: "", payout: 0, type: "paper", result: "win", pl: 0,
    notes: "MIL OVER + DET UNDER parlay hit.",
    legs: [],
  },
  sgp: {
    stake: 15,
    odds: "+283",
    payout: 57.45,
    type: "money",
    result: "win",
    pl: 42.45,
    notes: "PHI F5 ML + Schwarber hit + YRFI. All 3 correlated. Peterson ERA 5.91 delivered.",
    legs: [
      { player: "PHI F5 ML", team: "PHI", prop: "F5 ML", rate: "Wheeler ERA 2.01", note: "vs Peterson ERA 5.91" },
      { player: "Schwarber O0.5 hits", team: "PHI", prop: "hits", rate: "70%", note: "vsLHP .292" },
      { player: "NYM @ PHI YRFI", team: "PHI", prop: "YRFI", rate: "52.9%", note: "Peterson ERA 5.91 gave up runs" },
    ],
  },
  totalPL: 40.74,
  notes: "Burns ERA 2.01 cashed. RFI 4-0 best day ever. PHI SGP +283 cashed. LGB broken — fix before Jun 22.",
};
