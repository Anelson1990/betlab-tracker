import { useState } from 'react'

export default function SharpMoney() {
  const [input, setInput] = useState('')
  const [games, setGames] = useState([])
  const [parsed, setParsed] = useState(false)

  const parse = () => {
    // Parse the sharp money paste format
    // Format: "Team1\nTeam2\nbets%1\nbets%2\nmoney%1\nmoney%2\nodds1\nodds2"
    const lines = input.trim().split('\n').map(l => l.trim()).filter(Boolean)
    const results = []
    let i = 0
    while (i < lines.length) {
      try {
        // Look for team names followed by percentages
        const away = lines[i]; i++
        const home = lines[i]; i++
        // Skip time/date lines
        while (i < lines.length && (lines[i].includes('PM') || lines[i].includes('AM') || lines[i].includes('/'))) i++
        const awayBets = parseInt(lines[i]); i++
        const homeBets = parseInt(lines[i]); i++
        // Skip % of Money label if present
        if (lines[i] && isNaN(parseInt(lines[i]))) i++
        const awayMoney = parseInt(lines[i]); i++
        const homeMoney = parseInt(lines[i]); i++
        // Get odds
        let awayOdds = '', homeOdds = ''
        if (lines[i] && (lines[i].includes('+') || lines[i].includes('-'))) { awayOdds = lines[i]; i++ }
        if (lines[i] && (lines[i].includes('+') || lines[i].includes('-'))) { homeOdds = lines[i]; i++ }
        // Skip arrows and other UI elements
        while (i < lines.length && (lines[i].includes('›') || lines[i].includes('+'))) i++

        if (away && home && !isNaN(awayBets) && !isNaN(awayMoney)) {
          const betGap = Math.abs(awayMoney - awayBets)
          const moneyFavor = awayMoney > homeMoney ? away : home
          const betFavor = awayBets > homeBets ? away : home
          const reverse = moneyFavor !== betFavor
          const sharpPick = moneyFavor
          const sharpOdds = moneyFavor === away ? awayOdds : homeOdds

          results.push({ away, home, awayBets, homeBets: 100-awayBets, awayMoney, homeMoney: 100-awayMoney, betGap, sharpPick, sharpOdds, reverse })
        }
      } catch { i++ }
    }
    setGames(results)
    setParsed(true)
  }

  const getSignal = (gap, reverse) => {
    if (gap >= 40) return { label: '🔥🔥🔥 Very Strong', color: '#4ade80' }
    if (gap >= 30) return { label: '🔥🔥 Strong', color: '#86efac' }
    if (gap >= 20) return { label: '🔥 Signal', color: '#fbbf24' }
    if (gap >= 10) return { label: '⚪ Slight lean', color: '#60a5fa' }
    return { label: '⚪ Public', color: '#505070' }
  }

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', color:'#f0f0f8', marginBottom:4 }}>💰 Sharp Money</div>
        <div style={{ fontSize:'.54rem', color:'#404060', lineHeight:1.5, marginBottom:10 }}>
          Paste the sharp money data from covers.com or scoresandodds.com. I'll flag the gaps automatically.
        </div>
        <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Paste sharp money data here..." rows={8}
          style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'8px 10px', fontSize:'.6rem', color:'#f0f0f8', outline:'none', resize:'vertical', lineHeight:1.6, marginBottom:6 }} />
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={parse} style={{ flex:1, padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, textTransform:'uppercase', color:'#fff' }}>Analyze Sharp Money</button>
          <button onClick={()=>{setInput('');setGames([]);setParsed(false)}} style={{ padding:'9px 12px', background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, color:'#505070' }}>Clear</button>
        </div>
      </div>

      {/* LEGEND */}
      <div style={{ background:'#06060e', border:'1px solid #1a1a30', borderRadius:8, padding:10 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.62rem', fontWeight:800, textTransform:'uppercase', color:'#404060', marginBottom:6 }}>Signal Guide</div>
        {[['🔥🔥🔥 40%+ gap','Very Strong — sharp piling in','#4ade80'],['🔥🔥 30%+ gap','Strong sharp signal','#86efac'],['🔥 20%+ gap','Reverse line movement','#fbbf24'],['⚪ <20% gap','Public or neutral','#505070']].map(([label,desc,color]) => (
          <div key={label} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:3 }}>
            <div style={{ fontSize:'.58rem', color, width:120, flexShrink:0 }}>{label}</div>
            <div style={{ fontSize:'.52rem', color:'#404060' }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* RESULTS */}
      {parsed && games.length === 0 && (
        <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>
          Couldn't parse the data. Try copying directly from the sharp money table including team names and percentages.
        </div>
      )}

      {games.sort((a,b) => b.betGap - a.betGap).map((g,i) => {
        const sig = getSignal(g.betGap, g.reverse)
        return (
          <div key={i} style={{ background:'#09090f', border:`1px solid ${g.betGap>=20?'rgba(74,222,128,.2)':'#1a1a2e'}`, borderRadius:10, padding:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
              <div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.95rem', fontWeight:800, color:'#f0f0f8' }}>{g.away} @ {g.home}</div>
                <div style={{ fontSize:'.5rem', color:sig.color, fontWeight:700, marginTop:2 }}>{sig.label}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color:sig.color }}>{g.sharpPick}</div>
                <div style={{ fontSize:'.46rem', color:'#505070' }}>{g.sharpOdds} · Sharp pick</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              <div style={{ background:'#0c0c1a', borderRadius:6, padding:'6px 8px' }}>
                <div style={{ fontSize:'.42rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>% of Tickets</div>
                <div style={{ display:'flex', height:6, borderRadius:3, overflow:'hidden', marginBottom:4 }}>
                  <div style={{ width:`${g.awayBets}%`, background:'#60a5fa' }} />
                  <div style={{ width:`${g.homeBets}%`, background:'#1a1a30' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.5rem' }}>
                  <span style={{ color:'#60a5fa' }}>{g.away} {g.awayBets}%</span>
                  <span style={{ color:'#505070' }}>{g.home} {g.homeBets}%</span>
                </div>
              </div>
              <div style={{ background:'#0c0c1a', borderRadius:6, padding:'6px 8px' }}>
                <div style={{ fontSize:'.42rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>% of Money</div>
                <div style={{ display:'flex', height:6, borderRadius:3, overflow:'hidden', marginBottom:4 }}>
                  <div style={{ width:`${g.awayMoney}%`, background:'#4ade80' }} />
                  <div style={{ width:`${g.homeMoney}%`, background:'#1a1a30' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.5rem' }}>
                  <span style={{ color:'#4ade80' }}>{g.away} {g.awayMoney}%</span>
                  <span style={{ color:'#505070' }}>{g.home} {g.homeMoney}%</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop:6, fontSize:'.52rem', color:'#606080', lineHeight:1.5 }}>
              Gap: <strong style={{ color:sig.color }}>{g.betGap}%</strong> more money on {g.sharpPick} than tickets
              {g.reverse && <span style={{ color:'#fbbf24' }}> · Reverse line movement</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
