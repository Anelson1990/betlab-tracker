// BetLab Tracker Data — imports from separate files
// Edit today.js daily · append to cards.js and sharp.js · update models.js weekly

export { SEED_CARDS } from './cards.js'
export { SEED_SHARP } from './sharp.js'
export { SEED_MODELS } from './models.js'
export { TODAY_CARD } from './today.js'

export const MODEL_COLORS = {
  'MC YRFI':        '#4ade80',
  'Hit Locks':      '#f97316',
  'Consensus ML':   '#fbbf24',
  'LGB Moderate':   '#a78bfa',
  'XGB F5 ML':      '#60a5fa',
  'Hit Standalone': '#fb923c',
  'NRFI RB v2.3':   '#34d399',
  'MC F5 Total':    '#818cf8',
  'Hit Parlay':     '#f472b6',
  'MC F5 ML':       '#94a3b8',
  'K Unders':       '#22d3ee',
  'K Parlays':      '#a3e635',
  'POI YRFI':       '#ef4444',
  'LGB Strong':     '#6b7280',
  'RB ML':          '#4b5563',
};

export const STATUS_CONFIG = {
  active:  { label: 'Active',  color: '#4ade80', bg: 'rgba(74,222,128,.1)',   border: '#14532d' },
  monitor: { label: 'Monitor', color: '#fbbf24', bg: 'rgba(251,191,36,.1)',   border: '#713f12' },
  display: { label: 'Display', color: '#60a5fa', bg: 'rgba(96,165,250,.1)',   border: '#1e40af' },
  retired: { label: 'Retired', color: '#6b7280', bg: 'rgba(107,114,128,.1)',  border: '#374151' },
};

export const RESULT_CONFIG = {
  W: { label: 'Win',   color: '#4ade80', bg: 'rgba(74,222,128,.15)',   border: '#14532d' },
  L: { label: 'Loss',  color: '#f87171', bg: 'rgba(248,113,113,.15)', border: '#7f1d1d' },
  P: { label: 'Paper', color: '#60a5fa', bg: 'rgba(96,165,250,.15)',  border: '#1e40af' },
  V: { label: 'Void',  color: '#94a3b8', bg: 'rgba(148,163,184,.15)', border: '#334155' },
};

export const CHECKLIST = [
  { id: "weather",  step: 1,  label: "Weather Check",      desc: "Doinksports weather. Wind 15mph+ out = YRFI. In = NRFI. Rain 60%+ = skip. Dome = no weather." },
  { id: "umpire",   step: 2,  label: "Umpire Check",       desc: "oddlyspecificstats.com/umpires. Run impact 1.20+ = YRFI. 0.80- = NRFI." },
  { id: "injuries", step: 3,  label: "Injuries/Lineups",   desc: "Verify lineups MLB.com. Flag SPOT starters under 5 GS. Check IL moves." },
  { id: "bullpen",  step: 35, label: "Bullpen Check",      desc: "Model bullpen output. TAXED = risk. Closer on IL = committee. rotowire.com/baseball/closers.php." },
  { id: "rfi",      step: 4,  label: "RFI Check",          desc: "oddlyspecificstats.com matchups. L10 70%+ both = NRFI. Streak + first 5 batters deep dive. RFI Combined v3.0 threshold 62%+." },
  { id: "ml",       step: 5,  label: "ML Check",           desc: "XGB + Consensus must both fire. Check LGB. Sharp 20%+ against = skip. ATL rule = never POTD without LGB." },
  { id: "sharp",    step: 6,  label: "Sharp Money",        desc: "50%+ = massive. 30-49% = strong. 20-29% = signal. Confirms models = 67% WR. Conflicts = 17% WR." },
  { id: "potd",     step: 7,  label: "POTD Deep Dive",     desc: "Research top 2. Last 5 starts, FIP, xwOBA, TTO splits, verify SP MLB.com. Juice max -150." },
  { id: "props",    step: 8,  label: "Hit Props",          desc: "Model output → lineup → Savant xBA → split → pitcher. 85%+ = lock. 80% = min. PrizePicks flex." },
  { id: "sgp",      step: 9,  label: "SGP/Parlay",         desc: "ML -150+ = SGP only. Target +150 to +300. Max 4 legs. Correlated chain. 2 of 3 locked = cash out." },
  { id: "staking",  step: 10, label: "Staking",            desc: "Over $200: POTD $20, parlay $10, RFI $10. Card is the card. Always tell Claude actual stake. No SB props." },
  { id: "platform", step: 11, label: "Platform Selection", desc: "POTD/ML: shop DK vs B365. ML parlay: B365 auto-cashout. Hit props: PrizePicks flex. RFI: DK." },
  { id: "card",     step: 12, label: "Lock Card",          desc: "Confirm all picks. No off card bets. Log actual stakes. Update bankroll after results." },
];
