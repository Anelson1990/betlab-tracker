import { useState } from 'react'
import { SEED_SHARP } from './sharp.js'
import { SPORTS, parseCardDate, fetchGames, matchGame, decideWin } from './sportApi.js'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const GROUPS = [
  { label: '1-9%',   min: 1,  max: 9,  color: '#64748b', bg: 'rgba(100,116,139,.1)', border: '#334155' },
  { label: '10-19%', min: 10, max: 19, color: '#60a5fa', bg: 'rgba(96,165,250,.1)', border: '#1e40af' },
  { label: '20-29%', min: 20, max: 29, color: '#fbbf24', bg: 'rgba(251,191,36,.1)', border: '#713f12' },
  { label: '30-39%', min: 30, max: 39, color: '#f97316', bg: 'rgba(249,115,22,.1)', border: '#9a3412' },
  { label: '40-49%', min: 40, max: 49, color: '#4ade80', bg: 'rgba(74,222,128,.1)', border: '#14532d' },
  { label: '50%+',   min: 50, max: 999, color: '#a78bfa', bg: 'rgba(167,139,250,.1)', border: '#4c1d95' },
]
function tierFor(gap) {
  return GROUPS.find(g => gap >= g.min && gap <= g.max) || null
}

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

const MIGRATION_FLAG = 'betlab-sharp-mlb-legacy-migrated-v1'
const LEGACY_ACTIVE_KEY = 'betlab-sharp-v2'
const LEGACY_HISTORY_KEY = 'betlab-sharp-history-v1'
const LEGACY_DELETED_KEY = 'betlab-sharp-deleted-v1'

function migrateLegacyMlbData(activeKey, historyKey, deletedKey) {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return
    const legacyActive = JSON.parse(localStorage.getItem(LEGACY_ACTIVE_KEY) || 'null')
    const legacyHistory = JSON.parse(localStorage.getItem(LEGACY_HISTORY_KEY) || 'null')
    const legacyDeleted = JSON.parse(localStorage.getItem(LEGACY_DELETED_KEY) || '[]')

    if (legacyActive?.days?.length) {
      const current = JSON.parse(localStorage.getItem(activeKey) || '{"days":[]}')
      const currentDates = new Set(current.days.map(d => d.date))
      const toAdd = legacyActive.days.filter(d => !currentDates.has(d.date))
      if (toAdd.length) {
        current.days = [...current.days, ...toAdd]
        localStorage.setItem(activeKey, JSON.stringify(current))
      }
    }
    if (legacyHistory?.days?.length) {
      const current = JSON.parse(localStorage.getItem(historyKey) || '{"days":[]}')
      const currentDates = new Set(current.days.map(d => d.date))
      const toAdd = legacyHistory.days.filter(d => !currentDates.has(d.date))
      if (toAdd.length) {
        current.days = [...current.days, ...toAdd]
        localStorage.setItem(historyKey, JSON.stringify(current))
      }
    }
    if (Array.isArray(legacyDeleted) && legacyDeleted.length) {
      const current = new Set(JSON.parse(localStorage.getItem(deletedKey) || '[]'))
      legacyDeleted.forEach(d => current.add(d))
      localStorage.setItem(deletedKey, JSON.stringify([...current]))
    }
    localStorage.setItem(MIGRATION_FLAG, '1')
  } catch {}
}

const CHECKPOINTS = ['9 AM', '11 AM', '1 PM', '3 PM', '5 PM', 'Close']
function checkpointOrder(ct) {
  const i = CHECKPOINTS.indexOf(ct)
  return i === -1 ? 999 : i
}

function getClosingPicksMap(picks) {
  const map = new Map()
  for (const p of picks) {
    const cur = map.get(p.game)
    if (!cur || checkpointOrder(p.checkTime) >= checkpointOrder(cur.checkTime)) {
      map.set(p.game, p)
    }
  }
  return map
}
function closingPicksAcrossDays(days) {
  const out = []
  for (const day of days) out.push(...getClosingPicksMap(day.picks).values())
  return out
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
    if (isMlb) migrateLegacyMlbData(STORAGE_KEY, HISTORY_KEY, DELETED_KEY)
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
  const [form, setForm] = useState({ game:'', sharpPick:'', sharpOdds:'', gap:'', confirms:'', checkTime:'9 AM' })
  const [history, setHistory] = useState(() => {
    try { const h = localStorage.getItem(HISTORY_KEY); return h ? JSON.parse(h) : { days: [] } }
    catch { return { days: [] } }
  })

  // ── Play of the Day — separate from gap-tier tracking. No stake, no
  // bankroll tie-in, just a manual pick (informed by sharp + model) with a
  // running W-L record. Its own storage key so it never mixes with the
  // checkpoint/gap data above.
  const POTD_KEY = `betlab-potd-v1-${sport}`
  const [potdEntries, setPotdEntries] = useState(() => {
    try {
      const p = localStorage.getItem(POTD_KEY)
      if (!p) return []
      const parsed = JSON.parse(p)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  })
  const [showPotdAdd, setShowPotdAdd] = useState(false)
  const [showPotdPaste, setShowPotdPaste] = useState(false)
  const [potdPasteInput, setPotdPasteInput] = useState('')
  const [potdPasteError, setPotdPasteError] = useState('')
  const [potdForm, setPotdForm] = useState({ game:'', pick:'', odds:'', notes:'' })
  const [potdGrading, setPotdGrading] = useState(false)

  const savePotd = (entries) => {
    setPotdEntries(entries)
    try { localStorage.setItem(POTD_KEY, JSON.stringify(entries)) } catch {}
  }
  const addPotd = () => {
    if (!potdForm.game || !potdForm.pick) return
    savePotd([...potdEntries, {
      id: Date.now().toString(), date: today, game: potdForm.game, pick: potdForm.pick,
      odds: potdForm.odds, notes: potdForm.notes, result: 'pending',
    }])
    setPotdForm({ game:'', pick:'', odds:'', notes:'' })
    setShowPotdAdd(false)
  }
  const loadPotdJSON = () => {
    try {
      const parsed = JSON.parse(potdPasteInput.trim())
      const entry = Array.isArray(parsed) ? parsed[0] : parsed
      if (!entry.game || !entry.pick) { setPotdPasteError('JSON must have "game" and "pick" fields'); return }
      savePotd([...potdEntries, {
        id: Date.now().toString(), date: entry.date || today, game: entry.game, pick: entry.pick,
        odds: entry.odds || '', notes: entry.notes || '', result: 'pending',
      }])
      setPotdPasteInput(''); setPotdPasteError(''); setShowPotdPaste(false)
    } catch { setPotdPasteError('Invalid JSON — check format') }
  }
  const setPotdResult = (id, result) => {
    savePotd(potdEntries.map(e => e.id === id ? { ...e, result } : e))
  }
  const deletePotd = (id) => {
    savePotd(potdEntries.filter(e => e.id !== id))
  }
  const autoGradePotd = async (entry) => {
    setPotdGrading(true)
    const isoDate = parseCardDate(entry.date)
    const games = await fetchGames(sport, isoDate)
    if (!games.length) { setGradeLog([`No ${meta.label} games found for ${entry.date} yet.`]); setPotdGrading(false); return }
    const teamAbbr = entry.pick.split(' ')[0]
    const m = matchGame(sport, games, teamAbbr)
    if (!m) { setGradeLog([`${entry.game}: game not found.`]); setPotdGrading(false); return }
    if (!m.final) { setGradeLog([`${entry.game}: not final yet.`]); setPotdGrading(false); return }
    const won = decideWin(m)
    savePotd(potdEntries.map(e => e.id === entry.id ? { ...e, result: won ? 'win' : 'loss' } : e))
    setGradeLog([`${won?'WIN':'LOSS'} POTD ${entry.game} — ${m.awayAbbr} ${m.awayScore} @ ${m.homeAbbr} ${m.homeScore}`])
    setPotdGrading(false)
  }
  const potdGraded = potdEntries.filter(e => e.result === 'win' || e.result === 'loss')
  const potdWins = potdGraded.filter(e => e.result === 'win').length
  const potdWR = potdGraded.length ? Math.round((potdWins/potdGraded.length)*100) : 0

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
      sharpOdds: form.sharpOdds, gap: parseInt(form.gap) || 0, confirms: form.confirms,
      checkTime: form.checkTime, result: 'pending',
    })
    save(updated)
    setForm({ game:'', sharpPick:'', sharpOdds:'', gap:'', confirms:'', checkTime:'9 AM' })
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

  // Removes ALL checkpoints for one game at once — for a delayed/postponed
  // game you want out of today's card entirely, not just its latest check.
  const deleteGame = (date, game) => {
    const updated = JSON.parse(JSON.stringify(data))
    const day = updated.days.find(d => d.date === date)
    if (!day) return
    day.picks = day.picks.filter(p => p.game !== game)
    if (day.picks.length === 0) updated.days = updated.days.filter(d => d.date !== date)
    save(updated)
  }

  const deleteDay = (date) => {
    const updated = JSON.parse(JSON.stringify(data))
    updated.days = updated.days.filter(d => d.date !== date)
    markDateDeleted(DELETED_KEY, date)
    save(updated)
    setGradeLog([`deleted ${date} permanently`])
  }

  const autoGrade = async (date) => {
    setGrading(true)
    const log = []
    const day = data.days.find(d => d.date === date)
    if (!day) { setGrading(false); return }
    const isoDate = parseCardDate(date)
    log.push(`Fetching ${meta.label} games for ${date}...`)
    const games = await fetchGames(sport, isoDate)
    if (!games.length) { setGradeLog([`No ${meta.label} games found. Try after games finish.`]); setGrading(false); return }
    log.push(`Found ${games.length} games`)
    const updated = JSON.parse(JSON.stringify(data))
    const updDay = updated.days.find(d => d.date === date)
    const closingMap = getClosingPicksMap(updDay.picks)

    for (const pick of updDay.picks) {
      const isClosing = closingMap.get(pick.game)?.id === pick.id
      if (!isClosing) continue
      if (pick.result !== 'pending') continue
      const nameField = pick.sharpPick || pick.bet || pick.side || ''
      const teamAbbr = nameField.split(' ')[0]
      if (!teamAbbr) { log.push(`${pick.game}: no pick name`); continue }
      const m = matchGame(sport, games, teamAbbr)
      if (!m) { log.push(`${pick.game}: game not found`); continue }
      if (!m.final) { log.push(`${pick.game}: not final yet`); continue }
      const won = decideWin(m)
      pick.result = won ? 'win' : 'loss'
      log.push(`${won?'WIN':'LOSS'} ${pick.game} (closing ${pick.checkTime||''}) - ${m.awayAbbr} ${m.awayScore} @ ${m.homeAbbr} ${m.homeScore} - Sharp on ${teamAbbr}`)
    }

    log.push('Auto-grade complete')
    const stillPending = updDay.picks.filter(p => closingMap.get(p.game)?.id === p.id && p.result==='pending').length
    if (stillPending > 0) log.push(`${stillPending} closing pick(s) still pending - not ready to archive`)
    else log.push('All closing picks graded - ready to archive')
    save(updated)
    setGradeLog(log)
    setGrading(false)
  }

  const archiveSharpDay = (date) => {
    const day = data.days.find(d => d.date === date)
    if (!day) { setGradeLog([`${date}: nothing to archive`]); return }
    if (day.picks.length === 0) { setGradeLog([`${date}: no picks`]); return }
    const closingMap = getClosingPicksMap(day.picks)
    const pending = day.picks.filter(p => closingMap.get(p.game)?.id === p.id && p.result==='pending').length
    if (pending > 0) { setGradeLog([`${date}: ${pending} closing pick(s) still pending. Grade them first.`]); return }

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
      setGradeLog([`${date}: archive write failed - keeping day in active card to avoid data loss.`])
      return
    }

    const closingSaved = [...getClosingPicksMap(saved.picks).values()]
    const w = closingSaved.filter(p=>p.result==='win').length
    const l = closingSaved.filter(p=>p.result==='loss').length
    const updated = JSON.parse(JSON.stringify(data))
    updated.days = updated.days.filter(d => d.date !== date)
    save(updated)
    setHistory(verify)
    setGradeLog([`${date} archived to history (${w}-${l} on closing picks). Verified ${saved.picks.length} total checkpoints saved.`])
  }

  const loadJSON = async () => {
    try {
      const parsed = JSON.parse(pasteInput.trim())
      if (!parsed.date || !parsed.picks) { setPasteError('JSON must have "date" and "picks" fields'); return }
      const updated = JSON.parse(JSON.stringify(data))
      const existing = updated.days.find(d => d.date === parsed.date)
      const withIds = parsed.picks.map((p,i) => ({ ...p, id: p.id || Date.now().toString()+i }))
      if (existing) {
        const sig = (p) => `${p.game||''}|${p.sharpPick||p.bet||p.side||''}|${p.checkTime||''}`
        const seen = new Set(existing.picks.map(sig))
        const adds = withIds.filter(p => !seen.has(sig(p)))
        existing.picks = [...existing.picks, ...adds]
      } else {
        updated.days.push({ date: parsed.date, picks: withIds })
      }
      save(updated)
      setPasteInput(''); setPasteError(''); setShowPaste(false)

      const staleDates = updated.days
        .filter(d => {
          if (d.date === parsed.date) return false
          const closingMap = getClosingPicksMap(d.picks)
          return [...closingMap.values()].some(p => p.result === 'pending')
        })
        .map(d => d.date)
      if (staleDates.length > 0) {
        const sweepLog = [`Sweeping ${staleDates.length} prior day(s) with pending closing picks...`]
        for (const staleDate of staleDates) {
          await autoGrade(staleDate)
          const latest = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"days":[]}')
          const sd = latest.days.find(d => d.date === staleDate)
          if (sd) {
            const closingMap = getClosingPicksMap(sd.picks)
            const stillPending = [...closingMap.values()].some(p => p.result === 'pending')
            if (!stillPending) {
              archiveSharpDay(staleDate)
              sweepLog.push(`${staleDate} fully graded - archived`)
            } else {
              sweepLog.push(`${staleDate} - closing pick(s) still pending (games not final yet)`)
            }
          }
        }
        setGradeLog(sweepLog)
      }
    } catch { setPasteError('Invalid JSON — check format') }
  }

  const closingPicksAll = [...closingPicksAcrossDays(data.days), ...closingPicksAcrossDays(history.days)]
  const gradedPicks = closingPicksAll.filter(p => p.result === 'win' || p.result === 'loss')

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

  const todayGameGroups = (() => {
    const byGame = {}
    todayPicks.forEach(p => { (byGame[p.game] ||= []).push(p) })
    return Object.entries(byGame).map(([game, picks]) => {
      const sorted = [...picks].sort((a,b) => checkpointOrder(a.checkTime) - checkpointOrder(b.checkTime))
      const opening = sorted[0]
      const closing = sorted[sorted.length - 1]
      return { game, sorted, opening, closing, openTier: tierFor(opening.gap), closeTier: tierFor(closing.gap) }
    }).sort((a,b) => b.closing.gap - a.closing.gap)
  })()

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

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
              Paste JSON
            </button>
          </div>
        </div>

        <div style={{ display:'flex', gap:4 }}>
          {[['today','Today'],['potd','POTD'],['history','History'],['stats','Stats']].map(([v,l]) => (
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
            placeholder='{"date":"Aug 7","picks":[...]}'
            style={{ width:'100%', minHeight:100, background:'#0c0c1a', border:'1px solid #1a1a2e', borderRadius:6, padding:8, color:'#e0e0f0', fontSize:'.72rem', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }} />
          {pasteError && <div style={{ color:'#f87171', fontSize:'.7rem', marginTop:4 }}>{pasteError}</div>}
          <div style={{ display:'flex', gap:4, marginTop:8 }}>
            <button onClick={loadJSON} style={{ flex:1, padding:8, background:'#4ade80', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#000' }}>Load Picks</button>
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
              <select value={form.checkTime} onChange={e=>setForm(f=>({...f,checkTime:e.target.value}))} style={IS}>
                {CHECKPOINTS.map(c => <option key={c} value={c}>{c} check</option>)}
              </select>
              <select value={form.confirms} onChange={e=>setForm(f=>({...f,confirms:e.target.value}))} style={{...IS, gridColumn:'1 / -1'}}>
                <option value="">Model signal?</option>
                <option value="confirms">Confirms models</option>
                <option value="conflicts">Conflicts models</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>
            <div style={{ display:'flex', gap:4, marginTop:4 }}>
              <button onClick={addPick} style={{ flex:1, padding:8, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#fff' }}>Add</button>
              <button onClick={()=>{setShowAdd(false);setForm({game:'',sharpPick:'',sharpOdds:'',gap:'',confirms:'',checkTime:'9 AM'})}} style={{ flex:1, padding:8, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#505070' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {gradeLog.length > 0 && (
        <div style={{ background:'#060610', border:'1px solid #1a1a30', borderRadius:8, padding:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <div style={{ fontSize:'.6rem', fontWeight:700, textTransform:'uppercase', color:'#404060' }}>Grade Log</div>
            <button onClick={()=>setGradeLog([])} style={{ background:'none', border:'none', color:'#404060', fontSize:'.52rem' }}>Clear</button>
          </div>
          {gradeLog.map((l,i) => <div key={i} style={{ fontSize:'.56rem', color:'#606080', lineHeight:1.8 }}>{l}</div>)}
        </div>
      )}

      {view === 'today' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {data.days.filter(d => {
            if (d.date === today) return false
            const closingMap = getClosingPicksMap(d.picks)
            return [...closingMap.values()].some(p => p.result === 'pending')
          }).map(day => {
            const closingMap = getClosingPicksMap(day.picks)
            const pendingCount = [...closingMap.values()].filter(p=>p.result==='pending').length
            return (
              <div key={'stale-'+day.date} style={{ background:'rgba(251,191,36,.08)', border:'1px solid #fbbf24', borderRadius:10, padding:'10px 12px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:800, color:'#fbbf24' }}>
                    {day.date} — {pendingCount} closing pick(s) ungraded
                  </div>
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={()=>autoGrade(day.date)} disabled={grading}
                      style={{ padding:'5px 10px', background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:5, fontSize:'.6rem', fontWeight:700, color:'#60a5fa' }}>
                      {grading ? '...' : 'Grade Now'}
                    </button>
                    <button onClick={()=>{ if(window.confirm(`Delete all of ${day.date}? This cannot be undone.`)) deleteDay(day.date) }}
                      style={{ padding:'5px 10px', background:'rgba(248,113,113,.1)', border:'1px solid #7f1d1d', borderRadius:5, fontSize:'.6rem', fontWeight:700, color:'#f87171' }}>
                      Delete Day
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {todayGameGroups.length === 0 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>
              No {meta.label} sharp picks logged today. Tap + Add or paste JSON.
            </div>
          )}

          {todayGameGroups.map(({ game, sorted, opening, closing, openTier, closeTier }) => {
            const trend = closing.gap - opening.gap
            const movedTier = openTier?.label !== closeTier?.label
            const tierColor = closeTier ? closeTier.color : '#404060'
            const tierBorder = closeTier ? closeTier.border : '#1a1a2e'
            return (
              <div key={game} style={{ background:'#09090f', border:`1px solid ${tierBorder}`, borderRadius:8, padding:'10px 10px', marginBottom:2 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color:'#f0f0f8' }}>{closing.sharpPick || closing.bet || closing.side || game}</div>
                    <div style={{ fontSize:'.46rem', color:'#505070' }}>
                      {game} {closing.signal ? '· '+closing.signal : closing.confirms==='confirms' ? '· confirms' : closing.confirms==='conflicts' ? '· conflicts' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.2rem', fontWeight:800, color:tierColor }}>{closing.gap}%</div>
                    <div style={{ fontSize:'.4rem', color:'#404060', textTransform:'uppercase' }}>{closeTier ? closeTier.label : 'no tier'} · closing</div>
                  </div>
                </div>

                {sorted.length >= 2 && (
                  <>
                    <div style={{ fontSize:'.5rem', marginBottom:4 }}>
                      <span style={{ color:'#404060' }}>Opened </span>
                      <span style={{ color: openTier ? openTier.color : '#404060', fontWeight:700 }}>{opening.gap}% ({openTier ? openTier.label : 'none'})</span>
                      <span style={{ color:'#404060' }}> {'->'} Closed </span>
                      <span style={{ color: closeTier ? closeTier.color : '#404060', fontWeight:700 }}>{closing.gap}% ({closeTier ? closeTier.label : 'none'})</span>
                      {movedTier && <span style={{ color:'#a78bfa', marginLeft:5 }}>· moved tiers</span>}
                      {trend !== 0 && <span style={{ color: trend>0?'#4ade80':'#f87171', marginLeft:5, fontWeight:700 }}>{trend>0?`+${trend}`:`${trend}`}</span>}
                    </div>
                    <ResponsiveContainer width="100%" height={44}>
                      <LineChart data={sorted.map(p=>({checkTime:p.checkTime||'?', gap:p.gap}))} margin={{top:2,right:6,bottom:0,left:-30}}>
                        <XAxis dataKey="checkTime" tick={{fontSize:7,fill:'#404060'}} axisLine={false} tickLine={false} />
                        <YAxis hide domain={['dataMin - 3','dataMax + 3']} />
                        <Tooltip contentStyle={{background:'#0e0e1e',border:'1px solid #1a1a30',borderRadius:6,fontSize:'.55rem'}} labelStyle={{color:'#a78bfa'}} formatter={(v)=>[`${v}%`,'Gap']} />
                        <Line type="monotone" dataKey="gap" stroke="#a78bfa" strokeWidth={2} dot={{r:3,fill:'#a78bfa'}} />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                )}

                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
                  {sorted.map(p => (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:3, background: p.id===closing.id ? 'rgba(167,139,250,.15)' : '#0c0c1a', border:`1px solid ${p.id===closing.id?'#4c1d95':'#1a1a30'}`, borderRadius:5, padding:'2px 6px' }}>
                      <span style={{ fontSize:'.5rem', color: p.id===closing.id ? '#a78bfa' : '#505070', fontWeight: p.id===closing.id?800:400 }}>
                        {p.checkTime||'?'}: {p.gap}%{p.id===closing.id?' (closing)':''}
                      </span>
                      <button onClick={()=>deletePick(today, p.id)} style={{ background:'none', border:'none', color:'#7f1d1d', fontSize:'.55rem', padding:0, marginLeft:2, cursor:'pointer' }}>X</button>
                    </div>
                  ))}
                </div>

                <div style={{ display:'flex', gap:3, alignItems:'center', marginTop:8, justifyContent:'space-between' }}>
                  <button onClick={()=>{ if(window.confirm(`Delete ${game} entirely (all ${sorted.length} checkpoint${sorted.length>1?'s':''})? Use this if the game got delayed/postponed.`)) deleteGame(today, game) }}
                    style={{ padding:'3px 8px', background:'rgba(248,113,113,.08)', border:'1px solid #7f1d1d', borderRadius:4, color:'#f87171', fontSize:'.5rem', fontWeight:700 }}>
                    Delete Game
                  </button>
                  <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                    <span style={{ fontSize:'.46rem', color:'#404060', marginRight:4 }}>Grade closing:</span>
                    <button onClick={()=>setResult(today, closing.id, 'win')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${closing.result==='win'?'#14532d':'#1a2a1a'}`, background:closing.result==='win'?'rgba(74,222,128,.2)':'#0c0c1a', fontSize:'.65rem', opacity:closing.result==='win'?1:0.4 }}>W</button>
                    <button onClick={()=>setResult(today, closing.id, 'loss')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${closing.result==='loss'?'#7f1d1d':'#1a2a1a'}`, background:closing.result==='loss'?'rgba(248,113,113,.2)':'#0c0c1a', fontSize:'.65rem', opacity:closing.result==='loss'?1:0.4 }}>L</button>
                    <button onClick={()=>setResult(today, closing.id, 'pending')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${closing.result==='pending'?'#713f12':'#1a2a1a'}`, background:closing.result==='pending'?'rgba(251,191,36,.2)':'#0c0c1a', fontSize:'.65rem', opacity:closing.result==='pending'?1:0.4 }}>?</button>
                  </div>
                </div>
              </div>
            )
          })}

          {todayGameGroups.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:4 }}>
              <button onClick={()=>autoGrade(today)} disabled={grading} style={{ width:'100%', padding:9, background:grading?'#1a1a30':'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', color:grading?'#404060':'#60a5fa' }}>
                {grading ? 'Grading...' : 'Auto Grade Closing Picks'}
              </button>
              <button onClick={()=>archiveSharpDay(today)} disabled={grading} style={{ width:'100%', padding:9, background:'linear-gradient(135deg,#fbbf24,#d97706)', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', color:'#000' }}>
                Archive Day to History
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'potd' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>

          <div style={{ background:'#09090f', border:'1px solid #4c1d95', borderRadius:10, padding:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:800, textTransform:'uppercase', color:'#a78bfa' }}>Play of the Day</div>
                <div style={{ fontSize:'.42rem', color:'#404060' }}>No stake · sharp movement + model, tracked for record only</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.3rem', fontWeight:800, color: potdGraded.length===0?'#404060':potdWR>=55?'#4ade80':'#f87171' }}>
                  {potdGraded.length===0 ? '—' : `${potdWR}%`}
                </div>
                <div style={{ fontSize:'.4rem', color:'#404060', textTransform:'uppercase' }}>{potdWins}-{potdGraded.length-potdWins} · {potdGraded.length} graded</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={()=>setShowPotdAdd(!showPotdAdd)} style={{ flex:1, padding:'6px 8px', background:'rgba(167,139,250,.12)', border:'1px solid #4c1d95', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, textTransform:'uppercase', color:'#a78bfa' }}>+ Add</button>
              <button onClick={()=>setShowPotdPaste(!showPotdPaste)} style={{ flex:1, padding:'6px 8px', background:'rgba(74,222,128,.1)', border:'1px solid #14532d', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, textTransform:'uppercase', color:'#4ade80' }}>Paste JSON</button>
            </div>
          </div>

          {showPotdPaste && (
            <div style={{ background:'#09090f', border:'1px solid #14532d', borderRadius:10, padding:12 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', color:'#4ade80', marginBottom:8 }}>Paste POTD JSON</div>
              <textarea
                value={potdPasteInput}
                onChange={e=>setPotdPasteInput(e.target.value)}
                placeholder='{"game":"KC @ WSH","pick":"WSH ML","odds":"-136","notes":"sharp held 40%+ all day, model agrees"}'
                style={{ width:'100%', minHeight:80, background:'#0c0c1a', border:'1px solid #1a1a2e', borderRadius:6, padding:8, color:'#e0e0f0', fontSize:'.7rem', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }} />
              {potdPasteError && <div style={{ color:'#f87171', fontSize:'.68rem', marginTop:4 }}>{potdPasteError}</div>}
              <div style={{ display:'flex', gap:4, marginTop:8 }}>
                <button onClick={loadPotdJSON} style={{ flex:1, padding:8, background:'#4ade80', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#000' }}>Load</button>
                <button onClick={()=>{setShowPotdPaste(false);setPotdPasteInput('');setPotdPasteError('')}} style={{ flex:1, padding:8, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#505070' }}>Cancel</button>
              </div>
            </div>
          )}

          {showPotdAdd && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <input value={potdForm.game} onChange={e=>setPotdForm(f=>({...f,game:e.target.value}))} placeholder="Game e.g. KC @ WSH" style={IS} />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  <input value={potdForm.pick} onChange={e=>setPotdForm(f=>({...f,pick:e.target.value}))} placeholder="Pick e.g. WSH ML" style={IS} />
                  <input value={potdForm.odds} onChange={e=>setPotdForm(f=>({...f,odds:e.target.value}))} placeholder="Odds e.g. -136" style={IS} />
                </div>
                <input value={potdForm.notes} onChange={e=>setPotdForm(f=>({...f,notes:e.target.value}))} placeholder="Why (sharp movement + model read)" style={IS} />
                <div style={{ display:'flex', gap:4 }}>
                  <button onClick={addPotd} style={{ flex:1, padding:8, background:'#4c1d95', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#fff' }}>Add</button>
                  <button onClick={()=>{setShowPotdAdd(false);setPotdForm({game:'',pick:'',odds:'',notes:''})}} style={{ flex:1, padding:8, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#505070' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {potdEntries.length === 0 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>
              No plays logged yet.
            </div>
          )}

          {[...(Array.isArray(potdEntries) ? potdEntries : [])].reverse().map(entry => (
            <div key={entry.id} style={{ background:'#09090f', border:'1px solid #2a2a50', borderRadius:8, padding:'10px 10px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.9rem', fontWeight:800, color:'#f0f0f8' }}>{entry.pick}{entry.odds ? ` (${entry.odds})` : ''}</div>
                  <div style={{ fontSize:'.46rem', color:'#505070' }}>{entry.game} · {entry.date}</div>
                  {entry.notes && <div style={{ fontSize:'.52rem', color:'#8080a0', marginTop:3, lineHeight:1.4 }}>{entry.notes}</div>}
                </div>
                <div style={{ fontSize:'1.1rem', fontWeight:800, color: entry.result==='win'?'#4ade80':entry.result==='loss'?'#f87171':'#fbbf24' }}>
                  {entry.result==='win'?'W':entry.result==='loss'?'L':'?'}
                </div>
              </div>
              <div style={{ display:'flex', gap:3, alignItems:'center', marginTop:6, justifyContent:'flex-end' }}>
                <button onClick={()=>deletePotd(entry.id)} style={{ padding:'3px 7px', background:'rgba(248,113,113,.08)', border:'1px solid #7f1d1d', borderRadius:4, color:'#f87171', fontSize:'.5rem', marginRight:'auto' }}>Delete</button>
                {entry.result==='pending' && (
                  <button onClick={()=>autoGradePotd(entry)} disabled={potdGrading} style={{ padding:'3px 8px', background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:4, color:'#60a5fa', fontSize:'.55rem', fontWeight:700 }}>
                    {potdGrading ? '...' : 'Auto Grade'}
                  </button>
                )}
                <button onClick={()=>setPotdResult(entry.id, 'win')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${entry.result==='win'?'#14532d':'#1a2a1a'}`, background:entry.result==='win'?'rgba(74,222,128,.2)':'#0c0c1a', fontSize:'.6rem', opacity:entry.result==='win'?1:0.4 }}>W</button>
                <button onClick={()=>setPotdResult(entry.id, 'loss')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${entry.result==='loss'?'#7f1d1d':'#1a2a1a'}`, background:entry.result==='loss'?'rgba(248,113,113,.2)':'#0c0c1a', fontSize:'.6rem', opacity:entry.result==='loss'?1:0.4 }}>L</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'history' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {history.days.length === 0 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>No archived {meta.label} history yet.</div>
          )}
          {[...history.days].reverse().map(day => {
            const closingMap = getClosingPicksMap(day.picks)
            const closingList = [...closingMap.values()]
            const wins = closingList.filter(p=>p.result==='win').length
            const graded = closingList.filter(p=>p.result==='win'||p.result==='loss').length
            const wr = graded ? Math.round((wins/graded)*100) : null
            return (
              <div key={day.date} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px 6px' }}>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:'#f0f0f8' }}>{day.date}</div>
                    <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase' }}>{closingList.length} games · {day.picks.length} total checkpoints · {graded} graded</div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {wr !== null && <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color:wr>=55?'#4ade80':'#f87171' }}>{wr}% WR</div>}
                  </div>
                </div>
                {closingList.map(p => (
                  <div key={p.id} style={{ padding:'6px 12px', borderTop:'1px solid #1a1a2e', fontSize:'.65rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ color:'#e0e0f0', marginBottom:2 }}>{p.game} — {p.sharpPick}</div>
                      <div style={{ color:'#5050a0', fontSize:'.55rem' }}>Closing gap: {p.gap}% ({p.checkTime||'?'}) | {p.confirms}</div>
                    </div>
                    <div style={{ color:p.result==='win'?'#4ade80':p.result==='loss'?'#f87171':'#fbbf24', fontWeight:800 }}>
                      {p.result==='win'?'W':p.result==='loss'?'L':'?'}
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
              {isMlb && <div style={{ fontSize:'.44rem', color:'#404060' }}>baseline {BASELINE_STATS.asOf} + live, closing picks only</div>}
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
                    <span>{g.wr >= 55 ? 'Edge' : g.wr >= 50 ? 'Breakeven' : 'Below 50%'}</span>
                  </div>
                </>
              )}
              {g.picks === 0 && <div style={{ fontSize:'.56rem', color:'#303050', textAlign:'center' }}>No graded picks in this range yet</div>}
            </div>
          ))}

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>Sharp vs Model Alignment</div>
            {[
              { key:'confirms', label:'Confirms Models', color:'#4ade80' },
              { key:'conflicts', label:'Conflicts Models', color:'#f87171' },
              { key:'neutral', label:'Neutral', color:'#94a3b8' },
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
