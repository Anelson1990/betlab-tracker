import { useState } from 'react'

const QUOTES = [
  { text: "The card is the card.", author: "BetLab Rule #1" },
  { text: "Models find the edge. Research confirms it. Discipline keeps it.", author: "BetLab Process" },
  { text: "A bet you didn't make can't hurt you. A bet you shouldn't have made always does.", author: "BetLab Rule #2" },
  { text: "Sharp money finds value before the public knows it exists.", author: "BetLab Sharp Guide" },
  { text: "The parlay that looks too good to miss is usually the one that misses.", author: "BetLab Rule #3" },
  { text: "One bad beat doesn't break the system. One bad habit does.", author: "BetLab Discipline" },
  { text: "xwOBA tells you what should have happened. ERA tells you what did. Trust the process.", author: "BetLab Research" },
  { text: "Nuclear juice isn't value. It's a trap with good PR.", author: "BetLab Rule #4" },
  { text: "Verify the starter on MLB.com. Every. Single. Day.", author: "BetLab Research" },
  { text: "When sharps and models agree, the edge is real. When they conflict, wait for data.", author: "BetLab Sharp Guide" },
  { text: "A 76% sharp gap doesn't happen by accident. It happens because someone knows something.", author: "BetLab Sharp Guide" },
  { text: "Jung Hoo Lee is not Josh Jung.", author: "Jun 16 Lesson 😂" },
]

const SECTIONS = [
  {
    id: 'potd',
    icon: '🎯',
    title: 'POTD Rules',
    color: '#fbbf24',
    rules: [
      { rule: '3+ model sources required', detail: 'XGB + Consensus minimum. MC F5 or LGB Moderate as 3rd source preferred.' },
      { rule: 'LGB conflict = no POTD', detail: 'If LGB fires opposite direction skip as POTD. Can still paper track.' },
      { rule: 'ATL rule', detail: 'Never POTD ATL unless LGB agrees direction. Has burned us 3 times.' },
      { rule: 'Juice threshold -150 max', detail: 'Nuclear juice (-170+) = SGP only, never standalone POTD.' },
      { rule: 'Plus money + sharp = best value', detail: 'When XGB+Con fire and sharp money confirms on plus money = highest value play.' },
      { rule: 'Deep dive required', detail: 'Research last 5 starts, FIP, xwOBA, TTO splits before confirming.' },
      { rule: '2nd TTO OPS .800+ = flag', detail: 'Pitcher gets hit hard second time through lineup. Check splits.' },
      { rule: 'Verify SP on MLB.com daily', detail: 'Never trust model ERA blindly. Senga lesson: research said rehab, MLB.com confirmed starting.' },
    ]
  },
  {
    id: 'rfi',
    icon: '🎲',
    title: 'RFI Rules',
    color: '#a78bfa',
    rules: [
      { rule: 'RFI RB v2.3 — 63%+ threshold', detail: 'Dead zone 65-74% = skip unless other signals present.' },
      { rule: 'MC YRFI — 65%+ threshold', detail: 'STRONG AGREE only. Below 65% = display only.' },
      { rule: 'POI YRFI — monitor only', detail: 'Do not bet until double-grade bug fixed and WR verified.' },
      { rule: 'Manual override conditions', detail: 'Both SP ERA 5.00+ AND hitter park AND POI 70%+ = qualify. Wind 20mph+ blowing out = boosts YRFI. Both teams YRFI 5+/7 games = manual candidate.' },
      { rule: 'Houser lesson Jun 17', detail: 'L5 NRFI 1/5 = giving up 1st inning runs 80% of last 5 starts. L5 matters more than season ERA.' },
      { rule: 'Suspended games', detail: 'Cannot bet YRFI/NRFI if game resumes after 1st inning already played.' },
      { rule: 'SPOT starter — check FI R/G', detail: 'Under 5 GS = auto-skip RFI RB. But manually check FI R/G before fully skipping.' },
    ]
  },
  {
    id: 'sharp',
    icon: '💰',
    title: 'Sharp Money Rules',
    color: '#4ade80',
    rules: [
      { rule: '10-19% gap = data only', detail: 'Note the direction but do not act on it alone.' },
      { rule: '20-29% = signal', detail: 'Confirms or conflicts model. Factor into decision.' },
      { rule: '30-39% = strong', detail: 'Follow unless model strongly conflicts.' },
      { rule: '40-49% = very strong', detail: 'Almost always follow. Note if conflicts model.' },
      { rule: '50%+ = massive', detail: 'Rare and powerful. WSH 76% Jun 16 = biggest seen. Follow.' },
      { rule: 'Sharp + model agree = strongest', detail: 'WSH series Jun 14-16: 61-76% gaps, models agreed, won 3 straight.' },
      { rule: 'Same team 3+ days = follow', detail: 'Sharps have intel when they stay on the same team all series.' },
      { rule: 'Do NOT add rules yet', detail: 'Need 50+ graded picks per group before setting win rate thresholds.' },
    ]
  },
  {
    id: 'hits',
    icon: '⚡',
    title: 'Hit Prop Rules',
    color: '#f97316',
    rules: [
      { rule: '5-step verification required', detail: '1) On model output · 2) In lineup MLB.com · 3) Savant xBA/xwOBA pulled · 4) Handedness split positive · 5) Pitcher matchup researched' },
      { rule: '85%+ = Double Lock', detail: 'L10 8/10+, split confirmed ✅ = include in parlay.' },
      { rule: '80% = Hot', detail: 'L10 7/10+, split must be positive = include with caution.' },
      { rule: 'Below 80% = paper only', detail: 'Never a real money parlay leg below 80% rate.' },
      { rule: 'Full names always', detail: 'Jung Hoo Lee ≠ Josh Jung. Different player, different team. Verify team abbreviation.' },
      { rule: 'Josh Jung flag', detail: '2 misses out of 3 uses. Always require Savant current form check before including.' },
      { rule: 'New callup = paper only', detail: 'Track 10+ model appearances before adding to real money parlay.' },
      { rule: 'No memory picks', detail: 'Player must be on TODAY\'s model output. No exceptions.' },
    ]
  },
  {
    id: 'pitchers',
    icon: '⚾',
    title: 'Pitcher Research',
    color: '#38bdf8',
    rules: [
      { rule: '10-point deep dive', detail: 'ERA · FIP · WHIP · Last 5 starts · xwOBA · Hard hit% · K% · TTO splits · FI R/G · Rest days' },
      { rule: 'FIP over ERA', detail: 'FIP is more predictive. ERA can be lucky or unlucky. xwOBA is most reliable.' },
      { rule: 'xwOBA benchmarks', detail: 'Elite <.300 · Good .300-.330 · Average .330-.360 · Concerning >.360' },
      { rule: 'Hard hit% benchmarks', detail: 'Elite <35% · Average 35-45% · Concerning >45%' },
      { rule: 'Verify article dates', detail: 'Must be 2026 season data. Older articles may reference prior seasons.' },
      { rule: 'SPOT starter under 3 GS', detail: 'Complete unknown — skip ML unless other signals very strong.' },
      { rule: 'Debut pitchers', detail: 'Wildcard. Sullivan Jun 17 — 0 ERA but CHC still won 7-1. Factor in offense matchup.' },
      { rule: 'Opener effect', detail: 'If team uses opener going 1-2 innings it inflates ERA of "starter". Check actual role.' },
    ]
  },
  {
    id: 'bullpen',
    icon: '🏟️',
    title: 'Bullpen Rules',
    color: '#fb923c',
    rules: [
      { rule: 'Check before every ML/parlay', detail: 'Is closer on IL? Committee situation? Key reliever used 3 straight days?' },
      { rule: 'Free source — rotowire.com/baseball/closers.php', detail: 'Shows closer status and IL for all 30 teams. No login required.' },
      { rule: 'Closer on IL = committee risk', detail: 'CHC Jun 17: Palencia on IL, 52.6% save rate = 26th MLB = weak bullpen.' },
      { rule: '30+ pitches last 2 days = limited', detail: 'Reliever with heavy recent usage may be unavailable or ineffective.' },
      { rule: 'Leading by 3+ after 5 = safe', detail: 'If starter ERA <3.50 and large lead after 5 innings, bullpen risk minimal.' },
      { rule: 'Within 1 run after 5 + weak bullpen = flag', detail: 'Especially in parlays — one bad reliever kills the leg.' },
    ]
  },
  {
    id: 'staking',
    icon: '🏦',
    title: 'Staking Rules',
    color: '#94a3b8',
    rules: [
      { rule: 'Under $50 bankroll', detail: 'POTD $10 · Hit parlay $5 · RFI $5' },
      { rule: '$50-$100 bankroll', detail: 'POTD $15 · Hit parlay $8 · RFI $8' },
      { rule: '$100-$200 bankroll', detail: 'POTD $20 · Hit parlay $10 · RFI $10' },
      { rule: 'Card is the card', detail: 'No off card bets. Exception: max $5-10 manual YRFI signal only.' },
      { rule: 'Always tell Claude actual stake', detail: 'Model stake is a suggestion. Actual stake must be communicated for accurate tracking.' },
      { rule: 'Off card = log immediately', detail: 'All off card bets must be added to tracker the moment they are placed.' },
      { rule: 'Parlay max stake', detail: '$5-15 max on parlays. Never bet parlay money you can\'t afford to lose.' },
    ]
  },
  {
    id: 'models',
    icon: '📊',
    title: 'Model Calibration',
    color: '#818cf8',
    rules: [
      { rule: 'LGB Moderate only', detail: 'LGB Strong retired at -18.2% ROI. Only use 65-70% tier.' },
      { rule: 'Consensus F5 recovered', detail: 'Was negative, now +11.5% ROI. Use when firing with XGB F5.' },
      { rule: 'MC F5 Total — underused', detail: '+$212 profit on 177 bets. When XGB F5 Total agrees = check daily.' },
      { rule: 'XGB + MC F5 Total STRONG AGREE', detail: 'COL @ ATH Jun 14: both fired OVER → 23-9 final. Best signal type for totals.' },
      { rule: 'POI YRFI dead zone', detail: 'Monitor only. Do not bet. May have double-grade issue distorting WR.' },
      { rule: 'RFI RB 65-74% dead zone', detail: 'Skip. Below threshold and above threshold have better WR than this band.' },
      { rule: 'Model qualification before counting', detail: 'Each model must hit WR threshold before counting as confirmation vote.' },
    ]
  },
]

export default function Knowledge() {
  const [activeSection, setActiveSection] = useState(null)
  const [quoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length))
  const quote = QUOTES[quoteIdx]

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

      {/* QUOTE OF THE DAY */}
      <div style={{ background:'linear-gradient(135deg,#09090f,#0c0c1a)', border:'1px solid #2a2a50', borderRadius:10, padding:14 }}>
        <div style={{ fontSize:'.44rem', letterSpacing:'.12em', textTransform:'uppercase', color:'#404060', marginBottom:8 }}>📖 Today's Reminder</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.05rem', fontWeight:700, color:'#f0f0f8', lineHeight:1.4, marginBottom:6, fontStyle:'italic' }}>
          "{quote.text}"
        </div>
        <div style={{ fontSize:'.5rem', color:'#505070', textTransform:'uppercase', letterSpacing:'.08em' }}>— {quote.author}</div>
      </div>

      {/* QUICK RULES */}
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>⚡ Quick Rules</div>
        {[
          ['🎯', 'POTD needs 3+ sources · LGB conflict = skip · -150 max juice', '#fbbf24'],
          ['🎲', 'RFI needs 63%+ RB or 65%+ MC · POI YRFI = monitor only', '#a78bfa'],
          ['💰', '20%+ sharp gap = signal · 50%+ = massive · same team 3 days = follow', '#4ade80'],
          ['⚡', 'Hit props: model → lineup → Savant → split → pitcher · all 5 required', '#f97316'],
          ['⚾', 'Check MLB.com for SP daily · FIP over ERA · xwOBA most reliable', '#38bdf8'],
          ['🏟️', 'Check bullpen before ML bets · closer on IL = risk · rotowire closers page', '#fb923c'],
          ['🏦', 'Card is the card · no memory picks · always log actual stake placed', '#94a3b8'],
        ].map(([icon, text, color]) => (
          <div key={text} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'5px 0', borderBottom:'1px solid #0d0d1a' }}>
            <div style={{ fontSize:'.8rem', width:20, flexShrink:0 }}>{icon}</div>
            <div style={{ fontSize:'.58rem', color:'#808098', lineHeight:1.5 }}>{text}</div>
          </div>
        ))}
      </div>

      {/* SECTIONS */}
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.6rem', fontWeight:800, textTransform:'uppercase', color:'#404060', paddingLeft:4 }}>
        Tap any section to expand
      </div>

      {SECTIONS.map(s => (
        <div key={s.id} style={{ background:'#09090f', border:`1px solid ${activeSection===s.id ? s.color+'40' : '#1a1a2e'}`, borderRadius:10, overflow:'hidden' }}>
          <div onClick={()=>setActiveSection(activeSection===s.id?null:s.id)}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 12px', cursor:'pointer' }}>
            <div style={{ fontSize:'1.1rem' }}>{s.icon}</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:s.color, flex:1 }}>{s.title}</div>
            <div style={{ fontSize:'.55rem', color:'#404060' }}>{s.rules.length} rules · {activeSection===s.id?'▲':'▼'}</div>
          </div>

          {activeSection === s.id && (
            <div style={{ borderTop:'1px solid #111120' }}>
              {s.rules.map((r, i) => (
                <div key={i} style={{ padding:'8px 12px', borderBottom:'1px solid #0d0d1a' }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, color:s.color, marginBottom:3 }}>
                    {r.rule}
                  </div>
                  <div style={{ fontSize:'.58rem', color:'#808098', lineHeight:1.5 }}>{r.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* ALL QUOTES */}
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>📖 All Quotes</div>
        {QUOTES.map((q, i) => (
          <div key={i} style={{ padding:'8px 0', borderBottom:'1px solid #0d0d1a' }}>
            <div style={{ fontSize:'.62rem', color:'#a0a0c0', fontStyle:'italic', lineHeight:1.5, marginBottom:2 }}>"{q.text}"</div>
            <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em' }}>— {q.author}</div>
          </div>
        ))}
      </div>

    </div>
  )
}
