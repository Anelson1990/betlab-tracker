import { useState } from 'react'
import { SEED_SHARP } from './sharp.js'
import { SPORTS, parseCardDate, fetchGames, matchGame, decideWin } from './sportApi.js'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import * as driveSync from './driveSync.js'

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

// The old MLB_BASELINE (hardcoded totals "through Jun 30") was computed using
// a gap formula ("distance from 50/50") that was found to be WRONG and
// corrected around Jul 10 2026 to the current one (money% minus bets%). A
// gap of "76" under the old formula and a gap of "76" now do not represent
// the same thing, so mixing that baseline into current tier stats would
// silently corrupt them. Both sports now start stats from zero baseline;
// the June/early-July data itself stays fully visible in History (nothing
// is deleted), it's just excluded from the Stats tab's calculations below.
const FORMULA_FIX_DATE = '2026-07-10'
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

// Convert American odds ("-140", "+152", "even") to a number for comparison.
// Returns null if unparseable so callers can skip cleanly.
function parseOdds(o) {
  if (o === null || o === undefined) return null
  const s = String(o).trim().toLowerCase()
  if (!s) return null
  if (s === 'even' || s === 'ev' || s === 'pk') return 100
  const n = parseInt(s.replace(/[^0-9+-]/g, ''), 10)
  return Number.isNaN(n) ? null : n
}

// Which team a checkpoint's pick is actually on, e.g. "BOS ML" -> "BOS".
function pickSide(p) {
  const field = p.sharpPick || p.bet || p.side || ''
  const first = field.split(' ')[0]
  return first ? first.toUpperCase() : null
}

// Odds are only meaningfully comparable across checkpoints if they're on the
// SAME side. A real case this catches: BOS @ TOR on Aug 13 -- the sharp lean
// flipped from TOR (9 AM) to BOS (1 PM). Naively diffing "first odds" vs
// "last odds" compared TOR's price to BOS's price -- two different teams --
// and produced a confident-looking but meaningless CLV/line-reaction number.
// This finds the longest run of SAME-SIDE checkpoints ending at the closing
// pick, so odds comparisons only ever happen within one continuous side.
function sameSideOddsRun(sortedPicks) {
  if (sortedPicks.length === 0) return []
  const closingSide = pickSide(sortedPicks[sortedPicks.length - 1])
  if (!closingSide) return []
  const run = []
  for (let i = sortedPicks.length - 1; i >= 0; i--) {
    if (pickSide(sortedPicks[i]) !== closingSide) break
    run.unshift(sortedPicks[i])
  }
  return run.filter(p => parseOdds(p.sharpOdds) !== null)
}

// Classifies the SHAPE of a game's checkpoints across the day -- not just the
// closing gap size, but what the money actually did. Real finding this is
// built on: games where the sharp side flipped during the day won more often
// (59%, n=22) than games that held one side the whole time (48%, n=166) --
// the opposite of the naive assumption that a stable signal is the
// trustworthy one. Distinguishing "spiked and faded" from "steady" and
// "built all day" is exactly the read that's been done by hand in chat
// every checkpoint; this makes it visible on the card itself.
function classifyMovementShape(sortedPicks) {
  if (sortedPicks.length < 2) return null
  const firstSide = pickSide(sortedPicks[0])
  const lastSide = pickSide(sortedPicks[sortedPicks.length - 1])
  const gaps = sortedPicks.map(p => p.gap)
  const first = gaps[0], last = gaps[gaps.length - 1]
  const peak = Math.max(...gaps)
  const peakIsMiddle = peak > first + 8 && peak > last + 8 && gaps.indexOf(peak) > 0 && gaps.indexOf(peak) < gaps.length - 1

  if (firstSide && lastSide && firstSide !== lastSide) {
    return { shape: 'flipped', label: 'Flipped sides', color: '#a78bfa', note: `${firstSide} → ${lastSide} during the day` }
  }
  if (peakIsMiddle) {
    return { shape: 'spiked', label: 'Spiked & faded', color: '#fbbf24', note: `peaked at ${peak}%, settled at ${last}%` }
  }
  if (last - first >= 8) {
    return { shape: 'building', label: 'Building all day', color: '#4ade80', note: `${first}% → ${last}%, sustained growth` }
  }
  if (first - last >= 8) {
    return { shape: 'fading', label: 'Fading', color: '#f87171', note: `${first}% → ${last}%, losing steam` }
  }
  return { shape: 'steady', label: 'Steady', color: '#60a5fa', note: `held around ${last}% all day` }
}

// How far the line moved from first to last checkpoint, in cents. Positive =
// the sharp side got MORE expensive (book respecting the money). Near zero =
// line frozen despite the money.
function oddsMove(firstOdds, lastOdds) {
  const a = parseOdds(firstOdds), b = parseOdds(lastOdds)
  if (a === null || b === null) return null
  return b - a
}

// The read that actually matters: a big gap with a line that DIDN'T move
// suggests the book isn't respecting that money (often heavy recreational
// volume). A line that moved on the sharp side is the book taking it
// seriously. Only fires when there's a real gap AND parseable odds.
function lineReaction(gap, move) {
  if (move === null || gap < 10) return null
  const absMove = Math.abs(move)
  if (absMove <= 3) return { label: 'line frozen', color: '#f87171', note: 'big money, book unmoved' }
  if (absMove >= 12) return { label: 'line moved hard', color: '#4ade80', note: 'book respecting it' }
  return { label: 'line drifted', color: '#fbbf24', note: 'mild book response' }
}

// Convert American odds to implied probability (0-1), WITHOUT removing vig --
// fine here since we're comparing two prices on the same side of the same
// market, so any constant vig cancels out in the comparison either way.
function impliedProb(americanOdds) {
  const o = parseOdds(americanOdds)
  if (o === null) return null
  return o < 0 ? Math.abs(o) / (Math.abs(o) + 100) : 100 / (o + 100)
}

// Closing Line Value: did your entry price beat where the market actually
// closed? This is a distinct, more established metric than line-reaction --
// CLV is skill-independent of whether the bet itself wins, because the
// closing line is the market's most information-complete price. Positive
// CLV means you got a worse implied probability than the close (i.e. better
// odds for you) -- you were paid more for the same risk than a bettor who
// waited until close.
function calcCLV(entryOdds, closeOdds) {
  const pEntry = impliedProb(entryOdds), pClose = impliedProb(closeOdds)
  if (pEntry === null || pClose === null) return null
  // Positive = you beat the close (your price implied lower probability,
  // i.e. you got paid more for the same side than the closing bettor did).
  const clvPct = Math.round((pClose - pEntry) * 1000) / 10
  return { clvPct, beat: clvPct > 0 }
}
// A 1-2 run loss is close enough to be normal baseball variance -- the read
// wasn't necessarily wrong, the game just didn't break your way. A 5+ run
// margin is a real miss worth reconsidering. Only meaningful on losses.
function marginRead(result, margin) {
  if (result !== 'loss' || margin === undefined || margin === null) return null
  if (margin <= 2) return { label: 'close — variance', color: '#94a3b8' }
  if (margin <= 4) return { label: 'moderate margin', color: '#fbbf24' }
  return { label: 'blowout — real miss', color: '#f87171' }
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
  const BASELINE_STATS = EMPTY_BASELINE
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
  const [expandedDays, setExpandedDays] = useState(new Set())
  const toggleDay = (date) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }
  const [grading, setGrading] = useState(false)
  const [gradeLog, setGradeLog] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [driveStatus, setDriveStatus] = useState('')
  const [driveExporting, setDriveExporting] = useState(false)

  const exportToDrive = async () => {
    setDriveExporting(true)
    setDriveStatus('Exporting...')
    try {
      await driveSync.exportToDrive(sport, { sport, active: data.days, history: history.days })
      setDriveStatus(`Sent to Drive: BetLab Sharp Data / ${sport.toUpperCase()} / ${sport}-export.json`)
    } catch (e) {
      setDriveStatus(driveSync.isConfigured() ? `Export failed: ${e.message || e}` : 'Not set up yet — add your Client ID in driveSync.js first.')
    }
    setDriveExporting(false)
  }
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
        odds: entry.odds || '', notes: entry.notes || '',
        // Respect an explicit result if provided (e.g. "noplay" for a
        // backdated sat-out day, or a already-known win/loss); default pending.
        result: ['win','loss','noplay'].includes(entry.result) ? entry.result : 'pending',
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
    const finalScore = `${m.awayAbbr} ${m.awayScore} - ${m.homeAbbr} ${m.homeScore}`
    const margin = Math.abs(m.awayScore - m.homeScore)
    savePotd(potdEntries.map(e => e.id === entry.id ? { ...e, result: won ? 'win' : 'loss', finalScore, margin } : e))
    setGradeLog([`${won?'WIN':'LOSS'} POTD ${entry.game} — ${finalScore} (margin ${margin})`])
    setPotdGrading(false)
  }
  // Log a deliberate no-play day. Tracked so the record shows when the model
  // correctly sat out, rather than leaving a silent gap. Never counts toward
  // W-L since potdGraded filters to win/loss only.
  const addNoPlay = () => {
    savePotd([...potdEntries, {
      id: Date.now().toString(), date: today, game: '—', pick: 'NO PLAY',
      odds: '', notes: potdForm.notes || 'No qualifying signal — model declined to fire.',
      result: 'noplay',
    }])
    setPotdForm({ game:'', pick:'', odds:'', notes:'' })
    setShowPotdAdd(false)
  }

  const potdGraded = potdEntries.filter(e => e.result === 'win' || e.result === 'loss')
  const potdNoPlays = potdEntries.filter(e => e.result === 'noplay').length
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
      // 'none' is a legitimate entry (game had no real sharp lean) but it can
      // never be graded — mark it explicitly rather than leaving it pending
      // forever and blocking the day from archiving.
      if (!teamAbbr || teamAbbr.toLowerCase() === 'none') {
        pick.result = 'nograde'
        log.push(`${pick.game}: no side to grade (marked no-grade)`)
        continue
      }
      const m = matchGame(sport, games, teamAbbr)
      if (!m) { log.push(`${pick.game}: game not found`); continue }
      if (!m.final) { log.push(`${pick.game}: not final yet`); continue }
      const won = decideWin(m)
      pick.result = won ? 'win' : 'loss'
      // Store the actual final score + margin so a 1-run loss (variance) reads
      // differently from a blowout (the read was actually wrong).
      pick.finalScore = `${m.awayAbbr} ${m.awayScore} - ${m.homeAbbr} ${m.homeScore}`
      pick.margin = Math.abs(m.awayScore - m.homeScore)
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

  const archiveSharpDay = async (date) => {
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
    // Mark the date so loadData's seed-merge can never resurrect it. Without
    // this, archiving a seed day removes it from active storage but leaves it
    // absent from the deleted list -- so on the very next load it gets merged
    // back in from SEED, then re-graded and double-counted against history.
    markDateDeleted(DELETED_KEY, date)
    save(updated)
    setHistory(verify)
    setGradeLog([`${date} archived to history (${w}-${l} on closing picks). Verified ${saved.picks.length} total checkpoints saved.`])
  }

  const loadJSON = async () => {
    try {
      const parsed = JSON.parse(pasteInput.trim())
      if (!parsed.date || !parsed.picks) { setPasteError('JSON must have "date" and "picks" fields'); return }
      // Guard against double-counting: if this date is already archived, its
      // picks are already in history and already counted in stats. Re-adding
      // them to active data would count the same games twice.
      let existingHist
      try { existingHist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{"days":[]}') }
      catch { existingHist = { days: [] } }
      if (existingHist.days.some(d => d.date === parsed.date)) {
        setPasteError(`${parsed.date} is already archived in History — pasting again would double-count it. Delete it from History first if you need to redo that day.`)
        return
      }
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

  // Stats only count days on/after the formula fix -- older days stay fully
  // visible in the History tab (nothing deleted), just excluded here so they
  // don't corrupt tier/alignment win rates with incompatible gap values.
  const statsEligibleDays = (days) => isMlb
    ? days.filter(d => parseCardDate(d.date) >= FORMULA_FIX_DATE)
    : days
  const closingPicksAll = [...closingPicksAcrossDays(statsEligibleDays(data.days)), ...closingPicksAcrossDays(statsEligibleDays(history.days))]
  const gradedPicks = closingPicksAll.filter(p => p.result === 'win' || p.result === 'loss')
  const excludedDayCount = isMlb ? [...data.days, ...history.days].filter(d => parseCardDate(d.date) < FORMULA_FIX_DATE).length : 0

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

  // Win rate grouped by how the LINE reacted to the money. Needs first-vs-last
  // checkpoint per game, so it walks full days rather than the collapsed
  // closing-picks list. Only games with 2+ checkpoints, parseable odds, and a
  // real gap (>=10) can produce a reaction, so this set is smaller than the
  // overall graded count -- expect it to build slowly.
  const lineReactionStats = (() => {
    const buckets = {
      'line frozen': { w:0, l:0 },
      'line drifted': { w:0, l:0 },
      'line moved hard': { w:0, l:0 },
    }
    const allDays = [...data.days, ...history.days]
    for (const day of allDays) {
      const byGame = {}
      day.picks.forEach(p => { (byGame[p.game] ||= []).push(p) })
      for (const picks of Object.values(byGame)) {
        if (picks.length < 2) continue
        const sorted = [...picks].sort((a,b)=>checkpointOrder(a.checkTime)-checkpointOrder(b.checkTime))
        const last = sorted[sorted.length-1]
        if (last.result !== 'win' && last.result !== 'loss') continue
        const withOdds = sameSideOddsRun(sorted)
        if (withOdds.length < 2) continue
        const reaction = lineReaction(last.gap, oddsMove(withOdds[0].sharpOdds, withOdds[withOdds.length-1].sharpOdds))
        if (!reaction) continue
        buckets[reaction.label][last.result === 'win' ? 'w' : 'l'] += 1
      }
    }
    return Object.entries(buckets).map(([label, v]) => {
      const total = v.w + v.l
      return { label, wins: v.w, losses: v.l, total, wr: total ? Math.round((v.w/total)*100) : null }
    })
  })()

  // Closing Line Value stats: win rate for picks that beat the close vs
  // picks that didn't. Distinct from line-reaction -- this is the
  // established metric (does your entry price beat the market's final,
  // most information-complete price), tracked as its own signal independent
  // of gap size or tier.
  const clvStats = (() => {
    const buckets = { beat: { w:0, l:0 }, worse: { w:0, l:0 } }
    const allDays = [...data.days, ...history.days]
    for (const day of allDays) {
      const byGame = {}
      day.picks.forEach(p => { (byGame[p.game] ||= []).push(p) })
      for (const picks of Object.values(byGame)) {
        if (picks.length < 2) continue
        const sorted = [...picks].sort((a,b)=>checkpointOrder(a.checkTime)-checkpointOrder(b.checkTime))
        const last = sorted[sorted.length-1]
        if (last.result !== 'win' && last.result !== 'loss') continue
        const withOdds = sameSideOddsRun(sorted)
        if (withOdds.length < 2) continue
        const clv = calcCLV(withOdds[0].sharpOdds, withOdds[withOdds.length-1].sharpOdds)
        if (!clv) continue
        buckets[clv.beat ? 'beat' : 'worse'][last.result === 'win' ? 'w' : 'l'] += 1
      }
    }
    return Object.entries(buckets).map(([label, v]) => {
      const total = v.w + v.l
      return { label, wins: v.w, losses: v.l, total, wr: total ? Math.round((v.w/total)*100) : null }
    })
  })()

  // Win rate by the SHAPE of a game's checkpoints across the day, not just
  // its closing gap. Built after finding that games where the sharp side
  // flipped won MORE often than games that held one side all day -- the
  // opposite of the naive assumption, and worth tracking as its own signal
  // distinct from gap size, confirms/conflicts, line reaction, or CLV.
  const shapeStats = (() => {
    const buckets = { flipped:{w:0,l:0}, spiked:{w:0,l:0}, building:{w:0,l:0}, fading:{w:0,l:0}, steady:{w:0,l:0} }
    const allDays = [...data.days, ...history.days]
    for (const day of allDays) {
      const byGame = {}
      day.picks.forEach(p => { (byGame[p.game] ||= []).push(p) })
      for (const picks of Object.values(byGame)) {
        if (picks.length < 2) continue
        const sorted = [...picks].sort((a,b)=>checkpointOrder(a.checkTime)-checkpointOrder(b.checkTime))
        const last = sorted[sorted.length-1]
        if (last.result !== 'win' && last.result !== 'loss') continue
        const shape = classifyMovementShape(sorted)
        if (!shape) continue
        buckets[shape.shape][last.result === 'win' ? 'w' : 'l'] += 1
      }
    }
    return Object.entries(buckets).map(([label, v]) => {
      const total = v.w + v.l
      return { label, wins: v.w, losses: v.l, total, wr: total ? Math.round((v.w/total)*100) : null }
    })
  })()

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
            <button onClick={()=>setShowExport(!showExport)} style={{ padding:'6px 12px', background:'rgba(167,139,250,.1)', border:'1px solid #4c1d95', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', color:'#a78bfa' }}>
              Export
            </button>
          </div>
        </div>

        {showExport && (
          <div style={{ marginTop:8, background:'#0c0c1a', border:'1px solid #4c1d95', borderRadius:8, padding:10 }}>
            <div style={{ fontSize:'.5rem', color:'#a78bfa', marginBottom:6, lineHeight:1.4 }}>
              Every {meta.label} pick, active + archived, all fields (gap, odds, checkpoints, results). Copy this and paste it to Claude for a real trend analysis — the app's Stats tab only computes single-variable breakdowns, not combinations like "confirms + 40%+ gap" together.
            </div>
            <textarea readOnly value={JSON.stringify({ sport, active: data.days, history: history.days }, null, 1)}
              onClick={e => e.target.select()}
              style={{ width:'100%', minHeight:120, background:'#060610', border:'1px solid #1a1a2e', borderRadius:6, padding:8, color:'#8ee08e', fontSize:'.6rem', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }} />
            <div style={{ fontSize:'.44rem', color:'#505070', marginTop:4 }}>Tap the box, select all, copy.</div>

            <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #1a1a2e' }}>
              <div style={{ fontSize:'.5rem', color:'#a78bfa', marginBottom:6, lineHeight:1.4 }}>
                Sends everything for {meta.label} — active + archived — to your Drive, in its own {meta.label} folder inside "BetLab Sharp Data". Claude can read it directly from there in any conversation, no copy/paste needed. Tap anytime you want your Drive copy refreshed.
              </div>
              <button onClick={exportToDrive} disabled={driveExporting} style={{ padding:'6px 12px', background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, textTransform:'uppercase', color:'#60a5fa' }}>
                {driveExporting ? 'Sending...' : 'Export to Drive'}
              </button>
              {driveStatus && <div style={{ fontSize:'.46rem', color:'#8080a0', marginTop:5 }}>{driveStatus}</div>}
            </div>
          </div>
        )}
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
          {/* Any prior day still sitting in active data — whether or not it
              still has pending picks. Previously this only showed days WITH
              pending picks, which meant a fully-graded day that hadn't been
              archived yet would vanish from the UI entirely: not "today", not
              in history, no way to reach it. */}
          {data.days.filter(d => d.date !== today).map(day => {
            const closingMap = getClosingPicksMap(day.picks)
            const pendingCount = [...closingMap.values()].filter(p=>p.result==='pending').length
            const allGraded = pendingCount === 0
            return (
              <div key={'stale-'+day.date} style={{ background: allGraded ? 'rgba(74,222,128,.06)' : 'rgba(251,191,36,.08)', border:`1px solid ${allGraded ? '#14532d' : '#fbbf24'}`, borderRadius:10, padding:'10px 12px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:800, color: allGraded ? '#4ade80' : '#fbbf24' }}>
                    {day.date} — {allGraded ? 'all graded, ready to archive' : `${pendingCount} closing pick(s) ungraded`}
                  </div>
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={()=>autoGrade(day.date)} disabled={grading}
                      style={{ padding:'5px 10px', background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:5, fontSize:'.6rem', fontWeight:700, color:'#60a5fa' }}>
                      {grading ? '...' : 'Grade Now'}
                    </button>
                    <button onClick={()=>archiveSharpDay(day.date)} disabled={grading}
                      style={{ padding:'5px 10px', background:'rgba(251,191,36,.15)', border:'1px solid #d97706', borderRadius:5, fontSize:'.6rem', fontWeight:700, color:'#fbbf24' }}>
                      Archive
                    </button>
                    <button onClick={()=>{ if(window.confirm(`Delete all of ${day.date}? This cannot be undone.`)) deleteDay(day.date) }}
                      style={{ padding:'5px 10px', background:'rgba(248,113,113,.1)', border:'1px solid #7f1d1d', borderRadius:5, fontSize:'.6rem', fontWeight:700, color:'#f87171' }}>
                      Delete Day
                    </button>
                  </div>
                </div>

                {/* List each stuck game individually so one bad entry (postponed
                    game, unparseable pick name) can be graded or removed without
                    nuking the whole day's other picks. */}
                {[...closingMap.values()].filter(p => p.result === 'pending').map(p => (
                  <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:6, background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'5px 8px', marginTop:4 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'.62rem', color:'#e0e0f0', fontWeight:700 }}>{p.sharpPick || p.game}</div>
                      <div style={{ fontSize:'.46rem', color:'#505070' }}>{p.game} · {p.gap}% · {p.checkTime || '?'}</div>
                    </div>
                    <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                      <button onClick={()=>setResult(day.date, p.id, 'win')}
                        style={{ padding:'2px 7px', borderRadius:4, border:'1px solid #14532d', background:'#0c0c1a', color:'#4ade80', fontSize:'.55rem', fontWeight:700 }}>W</button>
                      <button onClick={()=>setResult(day.date, p.id, 'loss')}
                        style={{ padding:'2px 7px', borderRadius:4, border:'1px solid #7f1d1d', background:'#0c0c1a', color:'#f87171', fontSize:'.55rem', fontWeight:700 }}>L</button>
                      <button onClick={()=>{ if(window.confirm(`Remove ${p.game} from ${day.date}? Use this for postponed games or entries that can't be graded.`)) deleteGame(day.date, p.game) }}
                        style={{ padding:'2px 7px', borderRadius:4, border:'1px solid #7f1d1d', background:'rgba(248,113,113,.08)', color:'#f87171', fontSize:'.55rem', fontWeight:700 }}>Remove</button>
                    </div>
                  </div>
                ))}
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
            const mRead = marginRead(closing.result, closing.margin)
            const shape = classifyMovementShape(sorted)
            return (
              <div key={game} style={{ background:'#09090f', border:`1px solid ${tierBorder}`, borderRadius:8, padding:'10px 10px', marginBottom:2 }}>
                {shape && (
                  <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:`${shape.color}22`, border:`1px solid ${shape.color}`, borderRadius:5, padding:'2px 7px', marginBottom:6 }}>
                    <span style={{ fontSize:'.56rem', fontWeight:800, color:shape.color, textTransform:'uppercase' }}>{shape.label}</span>
                    <span style={{ fontSize:'.46rem', color:'#8080a0' }}>· {shape.note}</span>
                  </div>
                )}
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color:'#f0f0f8' }}>{closing.sharpPick || closing.bet || closing.side || game}</div>
                    <div style={{ fontSize:'.46rem', color:'#505070' }}>
                      {game} {closing.signal ? '· '+closing.signal : closing.confirms==='confirms' ? '· confirms' : closing.confirms==='conflicts' ? '· conflicts' : ''}
                    </div>
                    {closing.finalScore && (
                      <div style={{ fontSize:'.5rem', marginTop:3 }}>
                        <span style={{ color:'#8080a0' }}>{closing.finalScore}</span>
                        {mRead && <span style={{ color:mRead.color, marginLeft:5, fontWeight:700 }}>· {mRead.label}</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.2rem', fontWeight:800, color:tierColor }}>{closing.gap}%</div>
                    <div style={{ fontSize:'.4rem', color:'#404060', textTransform:'uppercase' }}>{closeTier ? closeTier.label : 'no tier'} · closing</div>
                  </div>
                </div>

                {sorted.length >= 2 && (() => {
                  // Only compare odds within a continuous same-side run ending
                  // at the closing pick -- if the sharp lean flipped teams
                  // during the day, an earlier checkpoint's price belongs to a
                  // DIFFERENT team and isn't comparable to the close at all.
                  const withOdds = sameSideOddsRun(sorted)
                  const oddsFirst = withOdds[0]
                  const oddsLast = withOdds[withOdds.length - 1]
                  const hasOdds = withOdds.length >= 2
                  const sideFlipped = sorted.length >= 2 && pickSide(sorted[0]) !== pickSide(sorted[sorted.length-1])
                  const move = hasOdds ? oddsMove(oddsFirst.sharpOdds, oddsLast.sharpOdds) : null
                  const reaction = hasOdds ? lineReaction(closing.gap, move) : null
                  const clv = hasOdds ? calcCLV(oddsFirst.sharpOdds, oddsLast.sharpOdds) : null
                  return (
                  <>
                    {sideFlipped && (
                      <div style={{ fontSize:'.46rem', color:'#a78bfa', marginBottom:3 }}>
                        ⚠ sharp side flipped today ({pickSide(sorted[0])} → {pickSide(sorted[sorted.length-1])}) — line/CLV below only covers the {pickSide(sorted[sorted.length-1])} run
                      </div>
                    )}
                    <div style={{ fontSize:'.5rem', marginBottom:3 }}>
                      <span style={{ color:'#404060' }}>Gap </span>
                      <span style={{ color: openTier ? openTier.color : '#404060', fontWeight:700 }}>{opening.gap}% ({openTier ? openTier.label : 'none'})</span>
                      <span style={{ color:'#404060' }}> {'->'} </span>
                      <span style={{ color: closeTier ? closeTier.color : '#404060', fontWeight:700 }}>{closing.gap}% ({closeTier ? closeTier.label : 'none'})</span>
                      {movedTier && <span style={{ color:'#a78bfa', marginLeft:5 }}>· moved tiers</span>}
                      {trend !== 0 && <span style={{ color: trend>0?'#4ade80':'#f87171', marginLeft:5, fontWeight:700 }}>{trend>0?`+${trend}`:`${trend}`}</span>}
                    </div>
                    {hasOdds && (
                      <div style={{ fontSize:'.5rem', marginBottom:4 }}>
                        <span style={{ color:'#404060' }}>Line </span>
                        <span style={{ color:'#8080a0', fontWeight:700 }}>{oddsFirst.sharpOdds}</span>
                        <span style={{ color:'#404060' }}> ({oddsFirst.checkTime}) {'->'} </span>
                        <span style={{ color:'#8080a0', fontWeight:700 }}>{oddsLast.sharpOdds}</span>
                        <span style={{ color:'#404060' }}> ({oddsLast.checkTime})</span>
                        {move !== null && move !== 0 && (
                          <span style={{ color:'#606080', marginLeft:5 }}>({move>0?'+':''}{move})</span>
                        )}
                        {reaction && (
                          <span style={{ color:reaction.color, marginLeft:6, fontWeight:700 }}>
                            · {reaction.label} — {reaction.note}
                          </span>
                        )}
                        {clv && (
                          <span style={{ color: clv.beat ? '#4ade80' : '#f87171', marginLeft:6, fontWeight:700 }}>
                            · CLV {clv.beat?'+':''}{clv.clvPct}%
                          </span>
                        )}
                      </div>
                    )}
                    <ResponsiveContainer width="100%" height={110}>
                      <LineChart data={sorted.map(p=>({checkTime:p.checkTime||'?', gap:p.gap, odds:parseOdds(p.sharpOdds)}))} margin={{top:4,right:6,bottom:0,left:-30}}>
                        <XAxis dataKey="checkTime" tick={{fontSize:7,fill:'#404060'}} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="gap" hide domain={[dataMin => dataMin - 1, dataMax => dataMax + 1]} />
                        <YAxis yAxisId="odds" hide domain={[dataMin => dataMin - 4, dataMax => dataMax + 4]} />
                        <Tooltip contentStyle={{background:'#0e0e1e',border:'1px solid #1a1a30',borderRadius:6,fontSize:'.55rem'}} labelStyle={{color:'#a78bfa'}}
                          formatter={(v,name)=>name==='gap'?[`${v}%`,'Gap']:[v>0?`+${v}`:`${v}`,'Odds']} />
                        <Line yAxisId="gap" type="monotone" dataKey="gap" stroke="#a78bfa" strokeWidth={2} dot={{r:3,fill:'#a78bfa'}} />
                        {hasOdds && <Line yAxisId="odds" type="monotone" dataKey="odds" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 3" dot={{r:2,fill:'#38bdf8'}} />}
                      </LineChart>
                    </ResponsiveContainer>
                    {hasOdds && (
                      <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:2 }}>
                        <span style={{ fontSize:'.42rem', color:'#a78bfa' }}>— gap %</span>
                        <span style={{ fontSize:'.42rem', color:'#38bdf8' }}>-- odds</span>
                      </div>
                    )}
                  </>
                  )
                })()}

                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
                  {sorted.map(p => (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:3, background: p.id===closing.id ? 'rgba(167,139,250,.15)' : '#0c0c1a', border:`1px solid ${p.id===closing.id?'#4c1d95':'#1a1a30'}`, borderRadius:5, padding:'2px 6px' }}>
                      <span style={{ fontSize:'.5rem', color: p.id===closing.id ? '#a78bfa' : '#505070', fontWeight: p.id===closing.id?800:400 }}>
                        {p.checkTime||'?'}: {p.gap}%{p.sharpOdds ? ` @ ${p.sharpOdds}` : ''}{p.id===closing.id?' (closing)':''}
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
                <div style={{ fontSize:'.4rem', color:'#404060', textTransform:'uppercase' }}>{potdWins}-{potdGraded.length-potdWins} · {potdGraded.length} graded{potdNoPlays>0 ? ` · ${potdNoPlays} no-play` : ''}</div>
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
                  <button onClick={addNoPlay} title="Log today as a deliberate no-play day" style={{ flex:1, padding:8, background:'rgba(100,116,139,.18)', border:'1px solid #334155', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#94a3b8' }}>No Play</button>
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
                  {entry.finalScore && (() => {
                    const mRead = marginRead(entry.result, entry.margin)
                    return (
                      <div style={{ fontSize:'.5rem', marginTop:3 }}>
                        <span style={{ color:'#8080a0' }}>{entry.finalScore}</span>
                        {mRead && <span style={{ color:mRead.color, marginLeft:5, fontWeight:700 }}>· {mRead.label}</span>}
                      </div>
                    )
                  })()}
                </div>
                <div style={{ fontSize:'1.1rem', fontWeight:800, color: entry.result==='win'?'#4ade80':entry.result==='loss'?'#f87171':entry.result==='noplay'?'#64748b':'#fbbf24' }}>
                  {entry.result==='win'?'W':entry.result==='loss'?'L':entry.result==='noplay'?'—':'?'}
                </div>
              </div>
              <div style={{ display:'flex', gap:3, alignItems:'center', marginTop:6, justifyContent:'flex-end' }}>
                <button onClick={()=>deletePotd(entry.id)} style={{ padding:'3px 7px', background:'rgba(248,113,113,.08)', border:'1px solid #7f1d1d', borderRadius:4, color:'#f87171', fontSize:'.5rem', marginRight:'auto' }}>Delete</button>
                {entry.result==='noplay' ? (
                  <span style={{ fontSize:'.5rem', color:'#64748b', fontStyle:'italic' }}>sat out — not counted in W-L</span>
                ) : (
                  <>
                    {entry.result==='pending' && (
                      <button onClick={()=>autoGradePotd(entry)} disabled={potdGrading} style={{ padding:'3px 8px', background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:4, color:'#60a5fa', fontSize:'.55rem', fontWeight:700 }}>
                        {potdGrading ? '...' : 'Auto Grade'}
                      </button>
                    )}
                    <button onClick={()=>setPotdResult(entry.id, 'win')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${entry.result==='win'?'#14532d':'#1a2a1a'}`, background:entry.result==='win'?'rgba(74,222,128,.2)':'#0c0c1a', fontSize:'.6rem', opacity:entry.result==='win'?1:0.4 }}>W</button>
                    <button onClick={()=>setPotdResult(entry.id, 'loss')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${entry.result==='loss'?'#7f1d1d':'#1a2a1a'}`, background:entry.result==='loss'?'rgba(248,113,113,.2)':'#0c0c1a', fontSize:'.6rem', opacity:entry.result==='loss'?1:0.4 }}>L</button>
                  </>
                )}
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
            const losses = closingList.filter(p=>p.result==='loss').length
            const graded = wins + losses
            const wr = graded ? Math.round((wins/graded)*100) : null
            const isOpen = expandedDays.has(day.date)
            return (
              <div key={day.date} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, overflow:'hidden' }}>
                <div onClick={()=>toggleDay(day.date)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', cursor:'pointer' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ color:'#505070', fontSize:'.7rem', transform: isOpen?'rotate(90deg)':'none', transition:'transform .15s', display:'inline-block' }}>›</span>
                    <div>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:'#f0f0f8' }}>{day.date}</div>
                      <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase' }}>{closingList.length} games · {graded} graded</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {graded > 0 && <div style={{ fontSize:'.55rem', color:'#505070' }}>{wins}-{losses}</div>}
                    {wr !== null && <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color:wr>=55?'#4ade80':'#f87171' }}>{wr}%</div>}
                  </div>
                </div>
                {isOpen && closingList.map(p => {
                  const mRead = marginRead(p.result, p.margin)
                  return (
                  <div key={p.id} style={{ padding:'6px 12px', borderTop:'1px solid #1a1a2e', fontSize:'.65rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ color:'#e0e0f0', marginBottom:2 }}>{p.game} — {p.sharpPick}</div>
                      <div style={{ color:'#5050a0', fontSize:'.55rem' }}>Closing gap: {p.gap}% ({p.checkTime||'?'}) | {p.confirms}</div>
                      {p.finalScore && (
                        <div style={{ fontSize:'.5rem', marginTop:2 }}>
                          <span style={{ color:'#8080a0' }}>{p.finalScore}</span>
                          {mRead && <span style={{ color:mRead.color, marginLeft:5, fontWeight:700 }}>· {mRead.label}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ color:p.result==='win'?'#4ade80':p.result==='loss'?'#f87171':'#fbbf24', fontWeight:800 }}>
                      {p.result==='win'?'W':p.result==='loss'?'L':'?'}
                    </div>
                  </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {view === 'stats' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070' }}>Overall {meta.label} Sharp Performance</div>
              <div style={{ fontSize:'.44rem', color:'#404060' }}>closing picks only</div>
            </div>
            {excludedDayCount > 0 && (
              <div style={{ fontSize:'.44rem', color:'#64748b', marginBottom:8, lineHeight:1.4 }}>
                {excludedDayCount} day(s) before Jul 10 excluded — those used an older gap formula, not comparable to current tiers. Still viewable in History.
              </div>
            )}
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

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:3 }}>Line Reaction to Sharp Money</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              Did the book move the line when the money came in? Needs 2+ checkpoints with odds and a 10%+ gap, so this builds slower than the other stats.
            </div>
            {[
              { label:'line moved hard', display:'Line moved hard', sub:'book respecting it', color:'#4ade80' },
              { label:'line drifted', display:'Line drifted', sub:'mild response', color:'#fbbf24' },
              { label:'line frozen', display:'Line frozen', sub:'big money, book unmoved', color:'#f87171' },
            ].map(s => {
              const r = lineReactionStats.find(x => x.label === s.label)
              return (
                <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #0d0d1a' }}>
                  <div>
                    <div style={{ fontSize:'.6rem', color:s.color }}>{s.display}</div>
                    <div style={{ fontSize:'.42rem', color:'#404060' }}>{s.sub}</div>
                  </div>
                  <div style={{ fontSize:'.6rem', color:'#a0a0c0' }}>
                    {!r || r.total === 0 ? '— no data yet' : `${r.wins}-${r.losses} · ${r.wr}% WR`}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:3 }}>Closing Line Value</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              Did your entry price beat where the line actually closed? Skill-independent of whether the pick itself won — the closing line is the market's most information-complete price, so consistently beating it is real evidence of a good read.
            </div>
            {[
              { label:'beat', display:'Beat the close', sub:'entry price better than closing price', color:'#4ade80' },
              { label:'worse', display:'Worse than close', sub:'line moved away from your entry', color:'#f87171' },
            ].map(s => {
              const r = clvStats.find(x => x.label === s.label)
              return (
                <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #0d0d1a' }}>
                  <div>
                    <div style={{ fontSize:'.6rem', color:s.color }}>{s.display}</div>
                    <div style={{ fontSize:'.42rem', color:'#404060' }}>{s.sub}</div>
                  </div>
                  <div style={{ fontSize:'.6rem', color:'#a0a0c0' }}>
                    {!r || r.total === 0 ? '— no data yet' : `${r.wins}-${r.losses} · ${r.wr}% WR`}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:3 }}>Movement Shape</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              What the money actually did across the day, not just where it ended up. Real finding this is tracking: games where the sharp side flipped have outperformed games that held steady — worth watching whether that keeps holding as more data comes in.
            </div>
            {[
              { label:'flipped', display:'Flipped sides', sub:'sharp lean changed team during the day', color:'#a78bfa' },
              { label:'building', display:'Building all day', sub:'gap grew steadily, same side throughout', color:'#4ade80' },
              { label:'steady', display:'Steady', sub:'held a consistent gap, same side', color:'#60a5fa' },
              { label:'spiked', display:'Spiked & faded', sub:'peaked mid-day then cooled back down', color:'#fbbf24' },
              { label:'fading', display:'Fading', sub:'gap shrank steadily, same side throughout', color:'#f87171' },
            ].map(s => {
              const r = shapeStats.find(x => x.label === s.label)
              return (
                <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #0d0d1a' }}>
                  <div>
                    <div style={{ fontSize:'.6rem', color:s.color }}>{s.display}</div>
                    <div style={{ fontSize:'.42rem', color:'#404060' }}>{s.sub}</div>
                  </div>
                  <div style={{ fontSize:'.6rem', color:'#a0a0c0' }}>
                    {!r || r.total === 0 ? '— no data yet' : `${r.wins}-${r.losses} · ${r.wr}% WR`}
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
