import { useState, useEffect } from 'react'
import { SEED_SHARP } from './sharp.js'

const STORAGE_KEY = 'betlab-sharp-v2'
const MLB_API = 'https://statsapi.mlb.com/api/v1'

const GROUPS = [
  { label: '10-19%', min: 10, max: 19, color: '#60a5fa', bg: 'rgba(96,165,250,.1)', border: '#1e40af' },
  { label: '20-29%', min: 20, max: 29, color: '#fbbf24', bg: 'rgba(251,191,36,.1)', border: '#713f12' },
  { label: '30-39%', min: 30, max: 39, color: '#f97316', bg: 'rgba(249,115,22,.1)', border: '#9a3412' },
  { label: '40-49%', min: 40, max: 49, color: '#4ade80', bg: 'rgba(74,222,128,.1)', border: '#14532d' },
  { label: '50%+',   min: 50, max: 999, color: '#a78bfa', bg: 'rgba(167,139,250,.1)', border: '#4c1d95' },
]

function getGroup(gap) {
  return GROUPS.find(g => gap >= g.min && gap <= g.max) || null
}

function parseCardDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
  const parts = dateStr.trim().split(' ')
  if (parts.length >= 2) {
    const month = months[parts[0]] || '06'
    const day = parts[1].padStart(2, '0')
    return `2026-${month}-${day}`
  }
  return new Date().toISOString().split('T')[0]
}

async function fetchGames(dateStr) {
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${dateStr}&hydrate=linescore,team`)
    return (await res.json())?.dates?.[0]?.games || []
  } catch { return [] }
}

function findGame(games, abbr) {
  if (!abbr) return null
  const a = abbr.toUpperCase()
  return games.find(g => {
    const h = g.teams?.home?.team?.abbreviation?.toUpperCase() || ''
    const aw = g.teams?.away?.team?.abbreviation?.toUpperCase() || ''
    const hn = g.teams?.home?.team?.teamName?.toUpperCase() || ''
    const an = g.teams?.away?.team?.teamName?.toUpperCase() || ''
    return h===a || aw===a || hn.includes(a) || an.includes(a)
  })
}

function loadData() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    const stored = s ? JSON.parse(s) : { days: [] }
    // Seed dates always win — merge stored days that aren't in seed
    const seedDates = new Set(SEED_SHARP.map(d => d.date))
    const extraDays = stored.days.filter(d => !seedDates.has(d.date))
    return { days: [...SEED_SHARP, ...extraDays] }
  } catch { return { days: SEED_SHARP } }
}

function saveData(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {} }

export default function SharpMoney() {
  const [data, setData] = useState(loadData)
  const [view, setView] = useState('today') // today | history | stats
  const [grading, setGrading] = useState(false)
  const [gradeLog, setGradeLog] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteInput, setPasteInput] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editingPick, setEditingPick] = useState(null)
  const [editForm, setEditForm] = useState({ sharpPick:'', game:'', gap:'' })
  const [form, setForm] = useState({ game:'', sharpPick:'', sharpOdds:'', gap:'', confirms:'' })
  const [history, setHistory] = useState(() => {
    try {
      const h = localStorage.getItem('betlab-sharp-history-v1')
      return h ? JSON.parse(h) : { days: [] }
    } catch { return { days: [] } }
  })

  const today = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })

  // Get or create today's day record
  const todayRecord = data.days.find(d => d.date === today)
  const todayPicks = todayRecord?.picks || []

  const save = (d) => { setData(d); saveData(d) }

  const addPick = () => {
    if (!form.game || !form.sharpPick || !form.gap) return
    const dateToUse = editDate || today
    const updated = JSON.parse(JSON.stringify(data))
    let day = updated.days.find(d => d.date === dateToUse)
    if (!day) { day = { date: dateToUse, picks: [] }; updated.days.push(day) }
    day.picks.push({
      id: Date.now().toString(),
      game: form.game,
      sharpPick: form.sharpPick,
      sharpOdds: form.sharpOdds,
      gap: parseInt(form.gap) || 0,
      confirms: form.confirms,
      result: 'pending',
    })
    save(updated)
    setForm({ game:'', sharpPick:'', sharpOdds:'', gap:'', confirms:'' })
    setShowAdd(false)
  }

  const setResult = (date, id, result) => {
    const updated = JSON.parse(JSON.stringify(data))
    const day = updated.days.find(d => d.date === date)
    if (!day) return
    const pick = day.picks.find(p => p.id === id)
    if (pick) pick.result = result
    save(updated)
  }

  const deletePick = (date, id) => {
    const updated = JSON.parse(JSON.stringify(data))
    const day = updated.days.find(d => d.date === date)
    if (!day) return
    day.picks = day.picks.filter(p => p.id !== id)
    if (day.picks.length === 0) updated.days = updated.days.filter(d => d.date !== date)
    save(updated)
  }

  const editPick = (date, id, fields) => {
    const updated = JSON.parse(JSON.stringify(data))
    const day = updated.days.find(d => d.date === date)
    if (!day) return
    const pick = day.picks.find(p => p.id === id)
    if (pick) Object.assign(pick, fields)
    save(updated)
  }

  const loadJSON = () => {
    try {
      const parsed = JSON.parse(pasteInput.trim())
      if (!parsed.date || !parsed.picks) { setPasteError('JSON must have "date" and "picks" fields'); return }
      const updated = JSON.parse(JSON.stringify(data))
      const existing = updated.days.find(d => d.date === parsed.date)
      const withIds = parsed.picks.map((p,i) => ({ ...p, id: p.id || Date.now().toString()+i }))
      if (existing) {
        // merge — dedupe by game + pick so re-pasting doesn't duplicate
        const sig = (p) => `${p.game||''}|${p.sharpPick||p.bet||p.side||''}`
        const seen = new Set(existing.picks.map(sig))
        const adds = withIds.filter(p => !seen.has(sig(p)))
        existing.picks = [...existing.picks, ...adds]
      } else {
        updated.days.push({ date: parsed.date, picks: withIds })
      }
      save(updated)
      setPasteInput('')
      setPasteError('')
      setShowPaste(false)
    } catch { setPasteError('Invalid JSON — check format') }
  }
  const autoGrade = async (date) => {
    setGrading(true)
    const log = []
    const day = data.days.find(d => d.date === date)
    if (!day) { setGrading(false); return }
    const dateStr = parseCardDate(date)
    log.push(`🔄 Fetching games for ${date}...`)
    const games = await fetchGames(dateStr)
    if (!games.length) { setGradeLog(['⚠️ No games found. Try after games finish.']); setGrading(false); return }
    log.push(`✅ Found ${games.length} games`)
    const updated = JSON.parse(JSON.stringify(data))
    const updDay = updated.days.find(d => d.date === date)

    for (const pick of updDay.picks) {
      if (pick.result !== 'pending') continue
      // Extract team abbr from sharpPick/bet/side (e.g. "WSH -136" → "WSH")
      const nameField = pick.sharpPick || pick.bet || pick.side || ''
      const teamAbbr = nameField.split(' ')[0]
      if (!teamAbbr) { log.push(`⚠️ ${pick.game}: no pick name`); continue }
      const game = findGame(games, teamAbbr)
      if (!game) { log.push(`⚠️ ${pick.game}: game not found`); continue }
      if (game.status?.detailedState !== 'Final') { log.push(`⏳ ${pick.game}: not final yet`); continue }
      const hs = game.teams?.home?.score
      const as = game.teams?.away?.score
      const ha = game.teams?.home?.team?.abbreviation?.toUpperCase()
      const aa = game.teams?.away?.team?.abbreviation?.toUpperCase()
      const ta = teamAbbr.toUpperCase()
      const pickedHome = ta === ha
      const won = (pickedHome && hs > as) || (!pickedHome && as > hs)
      pick.result = won ? 'win' : 'loss'
      log.push(`${won?'✅':'❌'} ${pick.game} — ${aa} ${as} @ ${ha} ${hs} — Sharp on ${teamAbbr} → ${won?'WIN':'LOSS'}`)
    }

    log.push('✅ Auto-grade complete')
    save(updated)
    setGradeLog(log)
    setGrading(false)
  }

  // Stats across all history
  const allPicks = data.days.flatMap(d => d.picks)
  const gradedPicks = allPicks.filter(p => p.result === 'win' || p.result === 'loss')

  const groupStats = GROUPS.map(g => {
    const picks = gradedPicks.filter(p => p.gap >= g.min && p.gap <= g.max)
    const wins = picks.filter(p => p.result === 'win').length
    const wr = picks.length ? Math.round((wins/picks.length)*100) : 0
    return { ...g, picks: picks.length, wins, wr }
  })

  const RC = {
    pending: { color:'#fbbf24', label:'⏳' },
    win:     { color:'#4ade80', label:'✅ Win' },
    loss:    { color:'#f87171', label:'❌ Loss' },
    skip:    { color:'#94a3b8', label:'⏭️ Skip' },
  }
  const cycle = r => { const c=['pending','win','loss','skip']; return c[(c.indexOf(r)+1)%c.length] }

  const IS = { background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none', width:'100%' }

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

      {/* HEADER */}
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', color:'#f0f0f8', lineHeight:1 }}>💰 Sharp Money</div>
            <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.08em', marginTop:2 }}>
              {gradedPicks.length} graded · {gradedPicks.filter(p=>p.result==='win').length} wins · {gradedPicks.length ? Math.round((gradedPicks.filter(p=>p.result==='win').length/gradedPicks.length)*100) : 0}% overall WR
            </div>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={()=>setShowAdd(!showAdd)} style={{ padding:'6px 12px', background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', color:'#60a5fa' }}>
              + Add
            </button>
            <button onClick={()=>setShowPaste(!showPaste)} style={{ padding:'6px 12px', background:'rgba(74,222,128,.1)', border:'1px solid #14532d', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', color:'#4ade80' }}>
              📋 Paste JSON
            </button>
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display:'flex', gap:4 }}>
          {[['today','Today'],['history','History'],['stats','Stats']].map(([v,l]) => (
            <button key={v} onClick={()=>setView(v)} style={{ flex:1, padding:'6px 2px', fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.6rem', fontWeight:700, textTransform:'uppercase', border:'1px solid', borderRadius:5, background:view===v?'#1a1a30':'#0c0c1a', color:view===v?'#f0f0f8':'#404060', borderColor:view===v?'#2a2a50':'#1a1a30' }}>{l}</button>
          ))}
        </div>
      </div>

      {/* PASTE JSON FORM */}
      {showPaste && (
        <div style={{ background:'#09090f', border:'1px solid #14532d', borderRadius:10, padding:12 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#4ade80', marginBottom:8 }}>Paste Sharp JSON</div>
          <textarea
            value={pasteInput}
            onChange={e=>setPasteInput(e.target.value)}
            placeholder='{"date":"Jun 23","picks":[...]}'
            style={{ width:'100%', minHeight:100, background:'#0c0c1a', border:'1px solid #1a1a2e', borderRadius:6, padding:8, color:'#e0e0f0', fontSize:'.72rem', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }} />
          {pasteError && <div style={{ color:'#f87171', fontSize:'.7rem', marginTop:4 }}>{pasteError}</div>}
          <div style={{ display:'flex', gap:4, marginTop:8 }}>
            <button onClick={loadJSON} style={{ flex:1, padding:8, background:'#4ade80', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#000' }}>⚡ Load Picks</button>
            <button onClick={()=>{setShowPaste(false);setPasteInput('');setPasteError('')}} style={{ flex:1, padding:8, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#505070' }}>Cancel</button>
          </div>
        </div>
      )}
      {showAdd && (
        <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>Add Sharp Pick</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <input value={editDate} onChange={e=>setEditDate(e.target.value)} placeholder={`Date (default: ${today})`} style={IS} />
            <input value={form.game} onChange={e=>setForm(f=>({...f,game:e.target.value}))} placeholder="Game e.g. KC @ WSH" style={IS} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              <input value={form.sharpPick} onChange={e=>setForm(f=>({...f,sharpPick:e.target.value}))} placeholder="Sharp pick e.g. WSH -136" style={IS} />
              <input value={form.sharpOdds} onChange={e=>setForm(f=>({...f,sharpOdds:e.target.value}))} placeholder="Odds e.g. -136" style={IS} />
              <input value={form.gap} onChange={e=>setForm(f=>({...f,gap:e.target.value}))} placeholder="Gap % e.g. 76" type="number" style={IS} />
              <select value={form.confirms} onChange={e=>setForm(f=>({...f,confirms:e.target.value}))} style={IS}>
                <option value="">Model signal?</option>
                <option value="confirms">✅ Confirms models</option>
                <option value="conflicts">⚠️ Conflicts models</option>
                <option value="neutral">⚪ Neutral</option>
              </select>
            </div>
            <div style={{ display:'flex', gap:4, marginTop:4 }}>
              <button onClick={addPick} style={{ flex:1, padding:8, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#fff' }}>Add</button>
              <button onClick={()=>{setShowAdd(false);setForm({game:'',sharpPick:'',sharpOdds:'',gap:'',confirms:''})}} style={{ flex:1, padding:8, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#505070' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* GRADE LOG */}
      {gradeLog.length > 0 && (
        <div style={{ background:'#060610', border:'1px solid #1a1a30', borderRadius:8, padding:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <div style={{ fontSize:'.6rem', fontWeight:700, textTransform:'uppercase', color:'#404060' }}>⚡ Grade Log</div>
            <button onClick={()=>setGradeLog([])} style={{ background:'none', border:'none', color:'#404060', fontSize:'.52rem' }}>Clear</button>
          </div>
          {gradeLog.map((l,i) => <div key={i} style={{ fontSize:'.56rem', color:'#606080', lineHeight:1.8 }}>{l}</div>)}
        </div>
      )}

      {/* TODAY VIEW */}
      {view === 'today' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {todayPicks.length === 0 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>
              No sharp picks logged today. Tap + Add to enter today's data.
            </div>
          )}

          {/* Group by gap size */}
          {GROUPS.map(g => {
            const picks = todayPicks.filter(p => p.gap >= g.min && p.gap <= g.max)
            if (picks.length === 0) return null
            return (
              <div key={g.label}>
                <div style={{ fontSize:'.52rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:g.color, marginBottom:4, paddingLeft:4 }}>{g.label} Gap</div>
                {picks.sort((a,b) => b.gap - a.gap).map(pick => (
                  <div key={pick.id} style={{ background:'#09090f', border:`1px solid ${g.border}`, borderRadius:8, padding:'9px 10px', marginBottom:4 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:'#f0f0f8' }}>{pick.sharpPick || pick.bet || pick.side || pick.game}</div>
                        <div style={{ fontSize:'.46rem', color:'#505070' }}>{pick.game} · {pick.gap}% gap {pick.signal ? '· '+pick.signal : pick.confirms === 'confirms' ? '✅ confirms' : pick.confirms === 'conflicts' ? '⚠️ conflicts' : ''}</div>
                      </div>
                      <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color:g.color }}>{pick.gap}%</div>
                        <button onClick={()=>setResult(today, pick.id, 'win')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${pick.result==='win'?'#14532d':'#1a2a1a'}`, background:pick.result==='win'?'rgba(74,222,128,.2)':'#0c0c1a', fontSize:'.65rem', opacity:pick.result==='win'?1:0.4 }}>✅</button>
                        <button onClick={()=>setResult(today, pick.id, 'loss')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${pick.result==='loss'?'#7f1d1d':'#1a2a1a'}`, background:pick.result==='loss'?'rgba(248,113,113,.2)':'#0c0c1a', fontSize:'.65rem', opacity:pick.result==='loss'?1:0.4 }}>❌</button>
                        <button onClick={()=>setResult(today, pick.id, 'pending')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${pick.result==='pending'?'#713f12':'#1a2a1a'}`, background:pick.result==='pending'?'rgba(251,191,36,.2)':'#0c0c1a', fontSize:'.65rem', opacity:pick.result==='pending'?1:0.4 }}>⏳</button>
                        <button onClick={()=>deletePick(today, pick.id)} style={{ padding:'3px 6px', background:'rgba(248,113,113,.1)', border:'1px solid #7f1d1d', borderRadius:4, color:'#f87171', fontSize:'.55rem' }}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {todayPicks.length > 0 && (
            <button onClick={()=>autoGrade(today)} disabled={grading} style={{ width:'100%', padding:9, background:grading?'#1a1a30':'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', color:grading?'#404060':'#60a5fa', marginTop:4 }}>
              {grading ? '⏳ Grading...' : '🗂 Grade & Archive Sharp Picks'}
            </button>
          )}
        </div>
      )}

      {/* HISTORY VIEW */}
      {view === 'history' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {history.days.length === 0 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>No archived history yet.</div>
          )}
          {[...history.days].reverse().map(day => {
            const wins = day.picks.filter(p=>p.result==='win').length
            const graded = day.picks.filter(p=>p.result==='win'||p.result==='loss').length
            const wr = graded ? Math.round((wins/graded)*100) : null
            return (
              <div key={day.date} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px 6px' }}>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:'#f0f0f8' }}>{day.date}</div>
                    <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase' }}>{day.picks.length} picks · {graded} graded</div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {wr !== null && <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color:wr>=55?'#4ade80':'#f87171' }}>{wr}% WR</div>}
                  </div>
                </div>
                {day.picks.map(p => (
                  <div key={p.id} style={{ padding:'6px 12px', borderTop:'1px solid #1a1a2e', fontSize:'.65rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ color:'#e0e0f0', marginBottom:2 }}>{p.game} — {p.sharpPick}</div>
                      <div style={{ color:'#5050a0', fontSize:'.55rem' }}>Gap: {p.gap}% | {p.confirms}</div>
                    </div>
                    <div style={{ color:p.result==='win'?'#4ade80':p.result==='loss'?'#f87171':'#fbbf24', fontWeight:800 }}>
                      {p.result==='win'?'✅':p.result==='loss'?'❌':'⏳'}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* STATS VIEW */}
      {view === 'stats' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>

          {/* Overall */}
          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>Overall Sharp Performance</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
              {[
                { val: gradedPicks.length, lbl: 'Total Graded' },
                { val: `${gradedPicks.filter(p=>p.result==='win').length}-${gradedPicks.filter(p=>p.result==='loss').length}`, lbl: 'W-L' },
                { val: `${gradedPicks.length ? Math.round((gradedPicks.filter(p=>p.result==='win').length/gradedPicks.length)*100) : 0}%`, lbl: 'Win Rate' },
              ].map(s => (
                <div key={s.lbl} style={{ textAlign:'center', background:'#0c0c1a', borderRadius:6, padding:'8px 4px' }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color:'#4ade80', lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:'.38rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginTop:3 }}>{s.lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* By group */}
          {groupStats.map(g => (
            <div key={g.label} style={{ background:'#09090f', border:`1px solid ${g.border}`, borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:g.color }}>{g.label} Gap</div>
                  <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase' }}>{g.picks} picks graded</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.4rem', fontWeight:800, color: g.picks===0?'#404060':g.wr>=55?'#4ade80':'#f87171', lineHeight:1 }}>
                    {g.picks === 0 ? '—' : `${g.wr}%`}
                  </div>
                  <div style={{ fontSize:'.4rem', color:'#404060', textTransform:'uppercase' }}>Win Rate</div>
                </div>
              </div>
              {g.picks > 0 && (
                <>
                  <div style={{ height:6, background:'#1a1a30', borderRadius:3, overflow:'hidden', marginBottom:6 }}>
                    <div style={{ height:'100%', width:`${g.wr}%`, background:g.color, borderRadius:3 }} />
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.5rem', color:'#505070' }}>
                    <span>{g.wins}W · {g.picks-g.wins}L</span>
                    <span>{g.wr >= 55 ? '✅ Edge' : g.wr >= 50 ? '⚪ Breakeven' : '❌ Below 50%'}</span>
                  </div>
                </>
              )}
              {g.picks === 0 && <div style={{ fontSize:'.56rem', color:'#303050', textAlign:'center' }}>No graded picks in this range yet</div>}
            </div>
          ))}

          {/* Confirms vs Conflicts */}
          {gradedPicks.length > 0 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>Sharp vs Model Alignment</div>
              {[
                { key:'confirms', label:'✅ Confirms Models', color:'#4ade80' },
                { key:'conflicts', label:'⚠️ Conflicts Models', color:'#f87171' },
                { key:'neutral', label:'⚪ Neutral', color:'#94a3b8' },
              ].map(s => {
                const picks = gradedPicks.filter(p => p.confirms === s.key)
                const wins = picks.filter(p => p.result === 'win').length
                const wr = picks.length ? Math.round((wins/picks.length)*100) : null
                return (
                  <div key={s.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #0d0d1a' }}>
                    <div style={{ fontSize:'.6rem', color:s.color }}>{s.label}</div>
                    <div style={{ fontSize:'.6rem', color:'#a0a0c0' }}>
                      {picks.length === 0 ? '— no data' : `${wins}-${picks.length-wins} · ${wr}% WR`}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
