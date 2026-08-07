// BetLab Sharp Tracker Data
// The checklist below still applies across sports — sport-specific nuance
// (weather sites, umpire sites, etc.) is MLB-flavored since that's where it
// was written, but the underlying discipline (verify lineups, check sharp
// money, size stakes, lock the card) generalizes fine.

export const CHECKLIST = [
  { id: "weather",  step: 1,  label: "Weather Check",      desc: "Doinksports weather. Wind 15mph+ out = YRFI. In = NRFI. Rain 60%+ = skip. Dome = no weather." },
  { id: "umpire",   step: 2,  label: "Umpire Check",       desc: "oddlyspecificstats.com/umpires. Run impact 1.20+ = YRFI. 0.80- = NRFI." },
  { id: "injuries", step: 3,  label: "Injuries/Lineups",   desc: "Verify lineups MLB.com. Flag SPOT starters under 5 GS. Check IL moves." },
  { id: "bullpen",  step: 35, label: "Bullpen Check",      desc: "Model bullpen output. TAXED = risk. Closer on IL = committee. rotowire.com/baseball/closers.php." },
  { id: "rfi",      step: 4,  label: "RFI Check",          desc: "oddlyspecificstats.com matchups. L10 70%+ both = NRFI. Streak + first 5 batters deep dive. RFI Combined v3.0 threshold 62%+." },
  { id: "ml",       step: 5,  label: "ML Check",           desc: "XGB + Consensus must both fire. Check LGB. Sharp 20%+ against = skip. ATL rule = never POTD without LGB." },
  { id: "sharp",    step: 6,  label: "Sharp Money",        desc: "50%+ = massive. 40-49% = best tier. 30-39% and 20-29% = trap tiers, historically below breakeven. 10-19% = real edge. Confirms models = strong WR. Conflicts = weak WR." },
  { id: "potd",     step: 7,  label: "POTD Deep Dive",     desc: "Research top 2. Last 5 starts, FIP, xwOBA, TTO splits, verify SP MLB.com. Juice max -150." },
  { id: "props",    step: 8,  label: "Hit Props",          desc: "Model output → lineup → Savant xBA → split → pitcher. 85%+ = lock. 80% = min. PrizePicks flex." },
  { id: "sgp",      step: 9,  label: "SGP/Parlay",         desc: "ML -150+ = SGP only. Target +150 to +300. Max 4 legs. Correlated chain. 2 of 3 locked = cash out." },
  { id: "staking",  step: 10, label: "Staking",            desc: "Over $200: POTD $20, parlay $10, RFI $10. Card is the card. Always tell Claude actual stake. No SB props." },
  { id: "platform", step: 11, label: "Platform Selection", desc: "POTD/ML: shop DK vs B365. ML parlay: B365 auto-cashout. Hit props: PrizePicks flex. RFI: DK." },
  { id: "card",     step: 12, label: "Lock Card",          desc: "Confirm all picks. No off card bets. Log actual stakes. Update bankroll after results." },
];
