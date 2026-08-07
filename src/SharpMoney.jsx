import { useState } from 'react'
import { SEED_SHARP } from './sharp.js'
import { SPORTS, parseCardDate, fetchGames, matchGame, decideWin } from './sportApi.js'

const GROUPS = [
  { label: '1-9%',   min: 1,  max: 9,  color: '#64748b', bg: 'rgba(100,116,139,.1)', border: '#334155' },
  { label: '10-19%', min: 10, max: 19, color: '#60a5fa', bg: 'rgba(96,165,250,.1)', border: '#1e40af' },
  { label: '20-29%', min: 20, max: 29, color: '#fbbf24', bg: 'rgba(251,191,36,.1)', border: '#713f12' },
  { label: '30-39%', min: 30, max: 39, color: '#f97316', bg: 'rgba(249,115,22,.1)', border: '#9a3412' },
  { label: '40-49%', min: 40, max: 49, color: '#4ade80', bg: 'rgba(74,222,128,.1)', border: '#14532d' },
  { label: '50%+',   min: 50, max: 999, color: '#a78bfa', bg: 'rgba(167,139,250,.1)', border: '#4c1d95' },
]

// Real graded MLB totals through Jun 30 2026 that predate reliable localStorage
// history. Only applied to MLB — the other sports start fresh with no baseline
// since this is their first season being tracked.
const MLB_BASELINE = {
  asOf: 'Jun 30',
  byGroup: { '1-9%': { w: 0, l: 0 }, '10-19%': { w: 5, l: 2 }, '20-29%': { w: 5, l: 6 }, '30-39%': { w: 3, l: 4 }, '40-49%': { w: 9, l: 4 }, '50%+': { w: 10, l: 6 } },
  alignment: { confirms: { w: 25, l: 9 }, conflicts: { w: 3, l: 6 }, neutral: { w: 5, l: 4 } },
}
const EMPTY_BASELINE = {
  asOf: null,
  byGroup: { '1-9%': { w: 0, l: 0 }, '10-19%': { w: 0, l: 0 }, '20-29%': { w: 0, l: 0 }, '30-39%': { w: 0, l: 0 }, '40-49%': { w: 0, l: 0 }, '50%+': { w: 0, l: 0 } },
  alignment: { confirms: { w: 0, l: 0 }, conflicts: { w: 0, l: 0 }, neutral: { w: 0, l: 0 } },
}

function getDeletedDates(dKey) {
  try { return new Set(JSON.parse(localStorage.getItem(dKey) || '[]')) }
  catch { return new Set() }
}
function markDateDeleted(dKey, date) {
  try {
    const s = getDeletedDates(dKey)
    s.add(date)
    localStorage.setItem(dKey, JSON.stringify([...s]))
  } catch {}
}

export default function SharpMoney({ sport }) {
  const meta = SPORTS.find(s => s.key === sport) || SPORTS[0]
  const isMlb = sport === 'mlb'
  const BASELINE_STATS = isMlb ? MLB_BASELINE : EMPTY_BASELINE
  const STORAGE_KEY = `betlab-sharp-v2-${sport}`
  const HISTORY_KEY = `betlab-sharp-history-v1-${sport}`
  const DELETED_KEY = `betlab-sharp-deleted-v1-${sport}`
  const SEED = isMlb ? SEED_SHARP : []

  function loadData() {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      const stored = s ? JSON.parse(s) : null
      const deleted = getDeletedDates(DELETED_KEY)
      if (stored === null) return { days: SEED.filter(d => !deleted.has(d.date)) }
      const storedDates = new Set(stored.days.map(d => d.date))
      const untouchedSeedDays = SEED.filter(d => !storedDates.has(d.date) && !deleted.has(d.date))
      return { days: [...stored.days, ...untouchedSeedDays] }
    } catch { return { days: SEED } }
  }
  function saveData(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {} }

  const [data, setData] = useState(loadData)
  const [view, setView] = useState('today')
  const [grading, setGrading] = useState(false)
  const [gradeLog, setGradeLog] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteInput, setPasteInput] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [editDate, setEditDate] = useState('')
  const [form, setForm] = useState({ game:'', sharpPick:'', sharpOdds:'', gap:'', confirms:'' })
  const [history, setHistory] = useState(() => {
    try { const h = localStorage.getItem(HISTORY_KEY); return h ? JSON.parse(h) : { days: [] } }
    catch { return { days: [] } }
  })

  const today = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })
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
      id: Date.now().toString(), game: form.game, sharpPick: form.sharpPick,
      sharpOdds: form.sharpOdds, gap: parseInt(form.gap) || 0, confirms: form.confirms, result: 'pending',
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

  const deleteDay = (date) => {
    const updated = JSON.parse(JSON.stringify(data))
    updated.days = updated.days.filter(d => d.date !== date)
    markDateDeleted(DELETED_KEY, date)
    save(updated)
    setGradeLog([`🗑 ${date} deleted permanently — won't resurface from seed data.`])
  }

  const autoGrade = async (date) => {
    setGrading(true)
    const log = []
    const day = data.days.find(d => d.date === date)
    if (!day) { setGrading(false); return }
    const isoDate = parseCardDate(date)
    log.push(`🔄 Fetching ${meta.label} games for ${date}...`)
    const games = await fetchGames(sport, isoDate)
    if (!games.length) { setGradeLog([`⚠️ No ${meta.label} games found. Try after games finish.`]); setGrading(false); return }
    log.push(`✅ Found ${games.length} games`)
    const updated = JSON.parse(JSON.stringify(data))
    const updDay = updated.days.find(d => d.date === date)

    for (const pick of updDay.picks) {
      if (pick.result !== 'pending') continue
      const nameField = pick.sharpPick || pick.bet || pick.side || ''
      const teamAbbr = nameField.split(' ')[0]
      if (!teamAbbr) { log.push(`⚠️ ${pick.game}: no pick name`); continue }
      const m = matchGame(sport, games, teamAbbr)
      if (!m) { log.push(`⚠️ ${pick.game}: game not found`); continue }
      if (!m.final) { log.push(`⏳ ${pick.game}: not final yet`); continue }
      const won = decideWin(m)
      pick.result = won ? 'win' : 'loss'
      log.push(`${won?'✅':'❌'} ${pick.game} — ${m.awayAbbr} ${m.awayScore} @ ${m.homeAbbr} ${m.homeScore} — Sharp on ${teamAbbr} → ${won?'WIN':'LOSS'}`)
    }

    log.push('✅ Auto-grade complete')
    const stillPending = updDay.picks.filter(p=>p.result==='pending').length
    if (stillPending > 0) log.push(`⏳ ${stillPending} still pending — not ready to archive`)
    else log.push('✅ All graded — ready to archive')
    save(updated)
    setGradeLog(log)
    setGrading(false)
  }

  const archiveSharpDay = (date) => {
    const day = data.days.find(d => d.date === date)
    if (!day) { setGradeLog([`⚠️ ${date}: nothing to archive`]); return }
    const pending = day.picks.filter(p=>p.result==='pending').length
    if (pending > 0) { setGradeLog([`⚠️ ${date}: ${pending} picks still pending. Grade them first.`]); return }
    if (day.picks.length === 0) { setGradeLog([`⚠️ ${date}: no picks`]); return }

    let hist
    try { hist = JSON.parse(localStorage.getItem(HISTORY_KEY)||'{"days":[]}') }
    catch { hist = { days: [] } }
    const exIdx = hist.days.findIndex(d => d.date === date)
    if (exIdx >= 0) hist.days[exIdx] = JSON.parse(JSON.stringify(day))
    else hist.days.push(JSON.parse(JSON.stringify(day)))
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist))

    let verify
    try { verify = JSON.parse(localStorage.getItem(HISTORY_KEY)||'{"days":[]}') }
    catch { verify = { days: [] } }
    const saved = verify.days.find(d => d.date === date)
    if (!saved || saved.picks.length !== day.picks.length) {
      setGradeLog([`❌ ${date}: archive write failed — keeping day in active card to avoid data loss.`])
      return
    }

    const w = day.picks.filter(p=>p.result==='win').length
    const l = day.picks.filter(p=>p.result==='loss').length
    const updated = JSON.parse(JSON.stringify(data))
    updated.days = updated.days.filter(d => d.date !== date)
    save(updated)
    setHistory(verify)
    setGradeLog([`🗂 ${date} archived to history (${w}-${l}). Verified ${saved.picks.length} picks saved.`])
  }

  const loadJSON = async () => {
    try {
      const parsed = JSON.parse(pasteInput.trim())
      if (!parsed.date || !parsed.picks) { setPasteError('JSON must have "date" and "picks" fields'); return }
      const updated = JSON.parse(JSON.stringify(data))
      const existing = updated.days.find(d => d.date === parsed.date)
      const withIds = parsed.picks.map((p,i) => ({ ...p, id: p.id || Date.now().toString()+i }))
      if (existing) {
        const sig = (p) => `${p.game||''}|${p.sharpPick||p.bet||p.side||''}`
        const seen = new Set(existing.picks.map(sig))
        const adds = withIds.filter(p => !seen.has(sig(p)))
        existing.picks = [...existing.picks, ...adds]
      } else {
        updated.days.push({ date: parsed.date, picks: withIds })
      }
      save(updated)
      setPasteInput(''); setPasteError(''); setShowPaste(false)

      const staleDates = updated.days
        .filter(d => d.date !== parsed.date && d.picks.some(p => p.result === 'pending'))
        .map(d => d.date)
      if (staleDates.length > 0) {
        const sweepLog = [`🧹 Sweeping ${staleDates.length} prior day(s) with pending picks...`]
        for (const staleDate of staleDates) {
          await autoGrade(staleDate)
          const latest = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"days":[]}')
          const sd = latest.days.find(d => d.date === staleDate)
          if (sd && sd.picks.every(p => p.result !== 'pending')) {
            archiveSharpDay(staleDate)
            sweepLog.push(`🗂 ${staleDate} fully graded — archived`)
          } else if (sd) {
            const left = sd.picks.filter(p => p.result === 'pending').length
            sweepLog.push(`⏳ ${staleDate} — ${left} still pending (games not final yet)`)
          }
        }
        setGradeLog(sweepLog)
      }
    } catch { setPasteError('Invalid JSON — check format') }
  }

  const allPicks = [...data.days, ...history.days].flatMap(d => d.picks)
  const gradedPicks = allPicks.filter(p => p.result === 'win' || p.result === 'loss')

  const groupStats = GROUPS.map(g => {
    const livePicks = gradedPicks.filter(p => p.gap >= g.min && p.gap <= g.max)
    const liveWins = livePicks.filter(p => p.result === 'win').length
    const liveLosses = livePicks.length - liveWins
    const base = BASELINE_STATS.byGroup[g.label] || { w: 0, l: 0 }
    const wins = base.w + liveWins
    const losses = base.l + liveLosses
    const picks = wins + losses
    const wr = picks ? Math.round((wins/picks)*100) : 0
    return { ...g, picks, wins, losses, wr }
  })

  const baselineOverallW = Object.values(BASELINE_STATS.byGroup).reduce((s,g)=>s+g.w,0)
  const baselineOverallL = Object.values(BASELINE_STATS.byGroup).reduce((s,g)=>s+g.l,0)
  const liveOverallW = gradedPicks.filter(p=>p.result==='win').length
  const liveOverallL = gradedPicks.filter(p=>p.result==='loss').length
  const overallStats = {
    wins: baselineOverallW + liveOverallW,
    losses: baselineOverallL + liveOverallL,
    get total() { return this.wins + this.losses },
    get wr() { return this.total ? Math.round((this.wins/this.total)*100) : 0 },
  }

  const alignmentStats = ['confirms','conflicts','neutral'].reduce((acc, key) => {
    const live = gradedPicks.filter(p => p.confirms === key)
    const liveW = live.filter(p=>p.result==='win').length
    const liveL = live.length - liveW
    const base = BASELINE_STATS.alignment[key] || { w:0, l:0 }
    const wins = base.w + liveW, losses = base.l + liveL, total = wins + losses
    acc[key] = { wins, losses, total, wr: total ? Math.round((wins/total)*100) : null }
    return acc
  }, {})

  const IS = { background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none', width:'100%' }

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

      {/* HEADER */}
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', color:'#f0f0f8', lineHeight:1 }}>{meta.emoji} {meta.label} Sharp Money</div>
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
            <button onClick={()=>{
              if (!window.confirm(`Wipe ALL ${meta.label} data (today's picks + history)? This cannot be undone. Other sports are not affected.`)) return
              try {
                localStorage.removeItem(STORAGE_KEY)
                localStorage.removeItem(HISTORY_KEY)
                localStorage.removeItem(DELETED_KEY)
              } catch {}
              setData({ days: [] })
              setHistory({ days: [] })
              setGradeLog([`🗑 All ${meta.label} data wiped clean.`])
            }} style={{ padding:'6px 10px', background:'rgba(248,113,113,.08)', border:'1px solid #7f1d1d', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#f87171' }}>
              🗑 Reset {meta.label}
            </button>
          </div>
        </div>

        <div style={{ display:'flex', gap:4 }}>
          {[['today','Today'],['history','History'],['stats','Stats']].map(([v,l]) => (
            <button key={v} onClick={()=>setView(v)} style={{ flex:1, padding:'6px 2px', fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.6rem', fontWeight:700, textTransform:'uppercase', border:'1px solid', borderRadius:5, background:view===v?'#1a1a30':'#0c0c1a', color:view===v?'#f0f0f8':'#404060', borderColor:view===v?'#2a2a50':'#1a1a30' }}>{l}</button>
          ))}
        </div>
      </div>

      {showPaste && (
        <div style={{ background:'#09090f', border:'1px solid #14532d', borderRadius:10, padding:12 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#4ade80', marginBottom:8 }}>Paste {meta.label} Sharp JSON</div>
          <textarea
            value={pasteInput}
            onChange={e=>setPasteInput(e.target.value)}
            placeholder='{"date":"Aug 5","picks":[...]}'
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
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>Add {meta.label} Sharp Pick</div>
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

      {gradeLog.length > 0 && (
        <div style={{ background:'#060610', border:'1px solid #1a1a30', borderRadius:8, padding:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <div style={{ fontSize:'.6rem', fontWeight:700, textTransform:'uppercase', color:'#404060' }}>⚡ Grade Log</div>
            <button onClick={()=>setGradeLog([])} style={{ background:'none', border:'none', color:'#404060', fontSize:'.52rem' }}>Clear</button>
          </div>
          {gradeLog.map((l,i) => <div key={i} style={{ fontSize:'.56rem', color:'#606080', lineHeight:1.8 }}>{l}</div>)}
        </div>
      )}

      {view === 'today' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {data.days.filter(d => d.date !== today && d.picks.some(p=>p.result==='pending')).map(day => {
            const pendingCount = day.picks.filter(p=>p.result==='pending').length
            return (
              <div key={'stale-'+day.date} style={{ background:'rgba(251,191,36,.08)', border:'1px solid #fbbf24', borderRadius:10, padding:'10px 12px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:800, color:'#fbbf24' }}>
                    ⚠️ {day.date} — {pendingCount} ungraded
                  </div>
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={()=>autoGrade(day.date)} disabled={grading}
                      style={{ padding:'5px 10px', background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:5, fontSize:'.6rem', fontWeight:700, color:'#60a5fa' }}>
                      {grading ? '⏳' : '⚡ Grade Now'}
                    </button>
                    <button onClick={()=>{ if(window.confirm(`Delete all of ${day.date}? This cannot be undone.`)) deleteDay(day.date) }}
                      style={{ padding:'5px 10px', background:'rgba(248,113,113,.1)', border:'1px solid #7f1d1d', borderRadius:5, fontSize:'.6rem', fontWeight:700, color:'#f87171' }}>
                      🗑 Delete Day
                    </button>
                  </div>
                </div>
                {day.picks.filter(p=>p.result==='pending').map(p => (
                  <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'.62rem', color:'#a0a0c0', padding:'3px 0' }}>
                    <div>{p.game} — {p.sharpPick}</div>
                    <button onClick={()=>deletePick(day.date, p.id)}
                      style={{ padding:'2px 6px', background:'rgba(248,113,113,.1)', border:'1px solid #7f1d1d', borderRadius:4, color:'#f87171', fontSize:'.55rem' }}>✕</button>
                  </div>
                ))}
              </div>
            )
          })}
          {todayPicks.length === 0 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>
              No {meta.label} sharp picks logged today. Tap + Add or paste JSON.
            </div>
          )}

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
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:4 }}>
              <button onClick={()=>autoGrade(today)} disabled={grading} style={{ width:'100%', padding:9, background:grading?'#1a1a30':'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', color:grading?'#404060':'#60a5fa' }}>
                {grading ? '⏳ Grading...' : '⚡ Auto Grade Sharp Picks'}
              </button>
              <button onClick={()=>archiveSharpDay(today)} disabled={grading} style={{ width:'100%', padding:9, background:'linear-gradient(135deg,#fbbf24,#d97706)', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', color:'#000' }}>
                🗂 Archive Day to History
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'history' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {history.days.length === 0 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>No archived {meta.label} history yet.</div>
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

      {view === 'stats' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070' }}>Overall {meta.label} Sharp Performance</div>
              {isMlb && <div style={{ fontSize:'.44rem', color:'#404060' }}>baseline {BASELINE_STATS.asOf} + live</div>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
              {[
                { val: overallStats.total, lbl: 'Total Graded' },
                { val: `${overallStats.wins}-${overallStats.losses}`, lbl: 'W-L' },
                { val: `${overallStats.wr}%`, lbl: 'Win Rate' },
              ].map(s => (
                <div key={s.lbl} style={{ textAlign:'center', background:'#0c0c1a', borderRadius:6, padding:'8px 4px' }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color:'#4ade80', lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:'.38rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginTop:3 }}>{s.lbl}</div>
                </div>
              ))}
            </div>
          </div>

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

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>Sharp vs Model Alignment</div>
            {[
              { key:'confirms', label:'✅ Confirms Models', color:'#4ade80' },
              { key:'conflicts', label:'⚠️ Conflicts Models', color:'#f87171' },
              { key:'neutral', label:'⚪ Neutral', color:'#94a3b8' },
            ].map(s => {
              const a = alignmentStats[s.key]
              return (
                <div key={s.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #0d0d1a' }}>
                  <div style={{ fontSize:'.6rem', color:s.color }}>{s.label}</div>
                  <div style={{ fontSize:'.6rem', color:'#a0a0c0' }}>
                    {a.total === 0 ? '— no data' : `${a.wins}-${a.losses} · ${a.wr}% WR`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
