import { useState } from 'react'
import { SEED_SHARP } from './sharp.js'
import { SPORTS, parseCardDate, fetchGames, matchGame, decideWin, decideTotal, resolveTeamAbbr, mergePicksIntoStorage } from './sportApi.js'
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

// OLD FORMULA gap: distance from 50/50 on the money% side alone. This is
// DIFFERENT math from the current gap (money% minus bets%) -- a game with
// old_gap=76 and new_gap=76 do NOT mean the same thing, which is exactly
// why mixing them into one tier bucket silently corrupted stats before
// (see FORMULA_FIX_DATE below). Kept as a fully separate, parallel stat.
function oldGapFor(moneyPct) {
  if (moneyPct == null) return null
  return Math.abs(moneyPct - 50)
}

// Real, recovered baseline for the OLD formula era (through Jun 30 2026),
// recovered Aug 25 2026 from git history (commit 16ece8e) after being
// removed from live stats on Aug 11 -- removed correctly, since mixing it
// into NEW-formula tiers was the actual bug, but the numbers themselves
// were real and validated at the time ("confirmed durable in Airtable").
// Tracked here on its own, clearly labeled, never combined with new-formula
// tiers or overall record.
const OLD_FORMULA_BASELINE = {
  asOf: 'Jun 30',
  byGroup: { '1-9%': { w:0,l:0 }, '10-19%': { w: 5, l: 2 }, '20-29%': { w: 5, l: 6 }, '30-39%': { w: 3, l: 4 }, '40-49%': { w: 9, l: 4 }, '50%+': { w: 10, l: 6 } },
  alignment: { confirms: { w: 25, l: 9 }, conflicts: { w: 3, l: 6 }, neutral: { w: 5, l: 4 } },
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

// Shared composite key: game name alone is NOT enough to identify a real
// "closing pick" once ML/spread/total tracking exists for the same game.
// Used consistently everywhere a pick needs to be matched back to its
// specific market's closing entry, not just its game.
function marketKey(p) {
  return `${p.game}__${p.market || 'ml'}`
}
function getClosingPicksMap(picks) {
  const map = new Map()
  for (const p of picks) {
    const key = marketKey(p)
    const cur = map.get(key)
    if (!cur || checkpointOrder(p.checkTime) >= checkpointOrder(cur.checkTime)) {
      map.set(key, p)
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

// Market types tracked per pick, stored as pick.market: 'ml' | 'spread' | 'total'.
// Defaults to 'ml' for backward compat with every pick logged before this field
// existed. 'spread' is sport-labeled (Run Line for MLB, Puck Line for NHL,
// Spread for NFL/NBA) but uses IDENTICAL underlying logic -- same gap math,
// same tier thresholds, same graph. Only the display label changes.
const MARKET_LABELS = {
  mlb: { ml: 'Moneyline', spread: 'Run Line', total: 'Total' },
  nhl: { ml: 'Moneyline', spread: 'Puck Line', total: 'Total' },
  nfl: { ml: 'Moneyline', spread: 'Spread', total: 'Total' },
  nba: { ml: 'Moneyline', spread: 'Spread', total: 'Total' },
}
function marketLabel(sportKey, market) {
  return (MARKET_LABELS[sportKey] || MARKET_LABELS.mlb)[market || 'ml'] || 'Moneyline'
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
  // Real fix for the single-file size ceiling confirmed Sep 6 (a fresh,
  // correctly-updated export still only ever read back through Sep 1,
  // since the read itself silently truncates once the file gets large
  // enough). Splits into one file per month instead -- each stays small
  // and reliably readable indefinitely, since only the current month's
  // file keeps growing.
  const exportToDriveMonthly = async () => {
    setDriveExporting(true)
    setDriveStatus('Exporting by month...')
    try {
      const results = await driveSync.exportToDriveByMonth(sport, { sport, active: data.days, history: history.days })
      const summary = results.map(r => `${r.month} (${r.days}d)`).join(', ')
      setDriveStatus(`Sent to Drive: BetLab Sharp Data / ${sport.toUpperCase()} / monthly / — ${summary}`)
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
  // POTD moved to its own standalone, cross-sport component (Potd.jsx) --
  // it no longer lives here since it needs to track picks across all
  // sports, not just whichever one this SharpMoney instance is showing.

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
      const isClosing = closingMap.get(marketKey(pick))?.id === pick.id
      if (!isClosing) continue
      if (pick.result !== 'pending') continue
      const nameField = pick.sharpPick || pick.bet || pick.side || ''
      const isTotal = (pick.market === 'total') || /^(over|under)\b/i.test(nameField)
      // For ML/spread, the team to search for IS the first word of the pick
      // ("NYY ML", "NYY -1.5"). For totals, the pick text has no team at all
      // ("Over 8.5") -- the OLD code took the first word here regardless,
      // which for a total pick extracted the literal string "Over" and tried
      // to find a team abbreviated "OVER", which obviously never exists.
      // Real fix: for totals, pull either team from the GAME field instead,
      // since matchGame only needs a valid team belonging to the right game,
      // not the specific side that was picked.
      const teamAbbr = isTotal ? resolveTeamAbbr(sport, (pick.game || '').split('@')[0].trim()) : resolveTeamAbbr(sport, nameField)
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
      // Totals use completely different math than win/loss -- combined score
      // vs a line, not which side won. decideWin has zero concept of this.
      const won = isTotal ? decideTotal(m, nameField) : decideWin(m)
      if (won === null && isTotal) { log.push(`${pick.game}: exact push on the total, marked no-grade`); pick.result = 'nograde'; continue }
      pick.result = won ? 'win' : 'loss'
      // Store the actual final score + margin so a 1-run loss (variance) reads
      // differently from a blowout (the read was actually wrong).
      pick.finalScore = `${m.awayAbbr} ${m.awayScore} - ${m.homeAbbr} ${m.homeScore}`
      pick.margin = Math.abs(m.awayScore - m.homeScore)
      log.push(`${won?'WIN':'LOSS'} ${pick.game} (closing ${pick.checkTime||''}) - ${m.awayAbbr} ${m.awayScore} @ ${m.homeAbbr} ${m.homeScore} - Sharp on ${teamAbbr}`)
    }

    log.push('Auto-grade complete')
    const stillPending = updDay.picks.filter(p => closingMap.get(marketKey(p))?.id === p.id && p.result==='pending').length
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
    const pending = day.picks.filter(p => closingMap.get(marketKey(p))?.id === p.id && p.result==='pending').length
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
    let logLine = `${date} archived to history (${w}-${l} on closing picks). Verified ${saved.picks.length} total checkpoints saved.`

    // Best-effort Drive sync of just THIS day -- never re-uploads the whole
    // history, and a Drive failure here can never undo or block the local
    // archive above, which already succeeded and is the source of truth.
    if (driveSync.isConfigured()) {
      try {
        await driveSync.syncDayToDrive(sport, saved)
        logLine += ' Synced to Drive.'
      } catch (e) {
        logLine += ` Drive sync skipped (${e.message || e}) -- local archive is still safe.`
      }
    }
    setGradeLog([logLine])
  }

  // Auto-corrects a pick whose sharpPick text has gone stale -- if the gap
  // for the CURRENTLY NAMED side is negative, real money has moved to the
  // OTHER side, and the label needs to re-flip to match. Without this, a
  // game that reverses TWICE in one day (flip, then flip back) only gets
  // caught by the FIRST flip -- the second reversal just shows as a
  // negative gap on a stale name, which is confusing and easy to misread
  // (confirmed real case: DET @ MIN, Aug 30 -- flipped MIN->DET at 1 PM,
  // then drifted back toward MIN by 3 PM without the label updating).

  const loadJSON = async () => {
    try {
      const parsed = JSON.parse(pasteInput.trim())
      const result = mergePicksIntoStorage(sport, parsed)
      if (!result.success) { setPasteError(result.error); return }
      const updated = result.updatedData
      setData(updated)
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
  const isMlPick = p => (p.market || 'ml') === 'ml'
  const closingPicksAll = [...closingPicksAcrossDays(statsEligibleDays(data.days)), ...closingPicksAcrossDays(statsEligibleDays(history.days))].filter(isMlPick)
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

  // SPREAD/PUCKLINE/RUNLINE and TOTAL tracking -- reuses the exact same gap
  // math and tier thresholds as moneyline (a 20% gap means the same thing
  // structurally regardless of market), but kept in fully separate buckets,
  // same principle as old/new formula and as the ML market filter above.
  // No baseline for either -- starting from zero real data, unlike ML which
  // has weeks of history behind it.
  function computeMarketStats(marketKey) {
    const picks = [...closingPicksAcrossDays(statsEligibleDays(data.days)), ...closingPicksAcrossDays(statsEligibleDays(history.days))]
      .filter(p => p.market === marketKey && (p.result === 'win' || p.result === 'loss'))
    const byTier = GROUPS.map(g => {
      const sub = picks.filter(p => p.gap >= g.min && p.gap <= g.max)
      const w = sub.filter(p=>p.result==='win').length
      const l = sub.length - w
      return { ...g, picks: sub.length, wins: w, losses: l, wr: sub.length ? Math.round((w/sub.length)*100) : 0 }
    })
    const w = picks.filter(p=>p.result==='win').length
    const l = picks.length - w
    return { picks, byTier, wins: w, losses: l, total: picks.length, wr: picks.length ? Math.round((w/picks.length)*100) : 0 }
  }
  const spreadStats = computeMarketStats('spread')
  const totalStats = computeMarketStats('total')

  // Gap SIZE distribution by market -- separate question from win rate.
  // Tests whether one market structurally produces bigger/rarer extreme
  // signals than another, independent of whether those signals actually
  // predict outcomes. ML restricted to statsEligibleDays (Jul 10+) to stay
  // apples-to-apples with spread/total, which never had an old-formula
  // era -- comparing magnitude across genuinely different formulas would
  // be meaningless, same lesson as everywhere else old/new formula matters.
  function computeGapDistribution(marketKey) {
    const picks = marketKey === 'ml'
      ? [...closingPicksAcrossDays(statsEligibleDays(data.days)), ...closingPicksAcrossDays(statsEligibleDays(history.days))].filter(isMlPick)
      : [...closingPicksAcrossDays(data.days), ...closingPicksAcrossDays(history.days)].filter(p => p.market === marketKey)
    const gaps = picks.map(p => Math.abs(p.gap)).filter(g => !isNaN(g))
    if (!gaps.length) return { n: 0, mean: 0, median: 0, pct20: 0, pct40: 0 }
    const sorted = [...gaps].sort((a,b) => a-b)
    const mid = Math.floor(sorted.length/2)
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2
    return {
      n: gaps.length,
      mean: gaps.reduce((s,g)=>s+g,0)/gaps.length,
      median,
      pct20: gaps.filter(g=>g>=20).length/gaps.length*100,
      pct40: gaps.filter(g=>g>=40).length/gaps.length*100,
    }
  }
  const gapDistML = computeGapDistribution('ml')
  const gapDistSpread = computeGapDistribution('spread')
  const gapDistTotal = computeGapDistribution('total')

  // Real, validated combo pattern (Sep 2 cross-analysis, n=46, 70% WR,
  // clearly the strongest result out of 78 combinations tested that day --
  // most others were noise at small sample size). Gate strictly on the
  // literal string "confirms" -- a real data-quality issue found the same
  // day showed other tools writing momentum/trend labels (e.g.
  // "strengthened", "flipped") into this same field, which are a
  // DIFFERENT concept (already covered by Movement Shape) and must never
  // be treated as model-alignment confirmation.
  function isHotComboPick(p) {
    return (p.market || 'ml') === 'ml' && p.gap >= 30 && p.confirms === 'confirms'
  }
  const hotComboPicks = [...closingPicksAcrossDays(statsEligibleDays(data.days)), ...closingPicksAcrossDays(statsEligibleDays(history.days))]
    .filter(isMlPick).filter(isHotComboPick).filter(p => p.result === 'win' || p.result === 'loss')
  const hotComboW = hotComboPicks.filter(p => p.result === 'win').length
  const hotComboStats = { wins: hotComboW, losses: hotComboPicks.length - hotComboW, total: hotComboPicks.length,
    wr: hotComboPicks.length ? Math.round(hotComboW/hotComboPicks.length*100) : 0 }

  // Real, EARLY hypothesis (Sep 4 investigation) -- not yet validated the way
  // the 30%+/confirms combo above is. Found while checking whether new-
  // formula gap MAGNITUDE tiers were flat because new formula adds noise
  // (user's suspicion) or because magnitude is the wrong thing to measure.
  // A negative gap means the picked side has LESS money than bets -- the
  // same "stale pick" signature the reflip fix already treats as
  // meaningful. Real result on n=6: 5-1 (83% WR) -- genuinely striking but
  // far too small to trust yet (a single flip swings this ~15+ points).
  // Tracked here specifically so it accumulates automatically rather than
  // needing a manual re-check each time -- do not treat this as confirmed
  // until the sample is meaningfully larger.
  function isNegativeGapPick(p) {
    return (p.market || 'ml') === 'ml' && p.gap < 0
  }
  const negGapPicks = [...closingPicksAcrossDays(statsEligibleDays(data.days)), ...closingPicksAcrossDays(statsEligibleDays(history.days))]
    .filter(isMlPick).filter(isNegativeGapPick).filter(p => p.result === 'win' || p.result === 'loss')
  const negGapW = negGapPicks.filter(p => p.result === 'win').length
  const negGapStats = { wins: negGapW, losses: negGapPicks.length - negGapW, total: negGapPicks.length,
    wr: negGapPicks.length ? Math.round(negGapW/negGapPicks.length*100) : 0 }

  // Real findings from the Sep 4 108-combination cross-analysis (gap tier,
  // old formula, gap sign, confirms, line reaction, and movement shape,
  // pairwise). Only two combinations cleared BOTH bars -- a real sample
  // size AND meaningfully away from 50% -- everything else was either
  // weak or in the n=3-15 range where noise reliably looks like signal
  // (the same range that produced two patterns earlier this project that
  // later washed out with more data).
  function oldTierGoodBad(oldGap) {
    if (oldGap == null) return null
    if (oldGap < 20) return 'good'
    if (oldGap < 40) return 'bad'
    return 'good'
  }

  // AVOID: old formula shows real conviction (good tier) but the sharp
  // side FLIPPED during the day. Real, n=23, 35% WR -- a conviction-
  // looking old-formula number on a game that already reversed once is a
  // real warning sign, not a green light. Needs the game's full
  // checkpoint series (not just the closing pick) to know if it flipped.
  function isAvoidTierPick(closing, shape) {
    if ((closing.market || 'ml') !== 'ml') return false
    const oldGap = closing.rawMoney != null ? Math.abs(closing.rawMoney - 50) : null
    if (oldGap == null) return false
    return oldTierGoodBad(oldGap) === 'good' && shape?.shape === 'flipped'
  }

  // OLD FORMULA + CONFIRMS moved below allClosingPicksEver's real
  // definition -- see there for the function and stats computation.

  // AVOID tier's stats need the full per-game series (for shape), so this
  // walks full days the same way computeCheckpointStats does rather than
  // using the flat closing-picks list.
  const avoidTierStats = (() => {
    let w = 0, l = 0
    const allDays = [...statsEligibleDays(data.days), ...statsEligibleDays(history.days)]
    for (const day of allDays) {
      const byGame = {}
      day.picks.forEach(p => {
        if ((p.market || 'ml') !== 'ml') return
        ;(byGame[marketKey(p)] ||= []).push(p)
      })
      for (const picks of Object.values(byGame)) {
        if (picks.length < 2) continue
        const sorted = [...picks].sort((a,b)=>checkpointOrder(a.checkTime)-checkpointOrder(b.checkTime))
        const closingPick = sorted[sorted.length-1]
        if (closingPick.result !== 'win' && closingPick.result !== 'loss') continue
        const shape = classifyMovementShape(sorted)
        if (isAvoidTierPick(closingPick, shape)) {
          if (closingPick.result === 'win') w++; else l++
        }
      }
    }
    return { wins: w, losses: l, total: w + l, wr: (w + l) ? Math.round(w / (w + l) * 100) : 0 }
  })()

  // OLD FORMULA tracking -- fully separate from everything above. Pulls from
  // ALL days regardless of FORMULA_FIX_DATE (unlike the new-formula stats),
  // because old_gap only needs raw money%, which doesn't change meaning
  // across that cutoff -- only the GAP FORMULA changed, not what money% means.
  // Only picks with a real rawMoney field can compute this; picks logged
  // before this field existed simply don't contribute (not zero, just absent).
  const allClosingPicksEver = [...closingPicksAcrossDays(data.days), ...closingPicksAcrossDays(history.days)].filter(isMlPick)

  // RLM (Reverse Line Movement) tracker -- new field, Sep 10. Real, distinct
  // signal from anything else tracked: the source itself flags when the
  // book's line has moved AGAINST where the majority of tickets/bets are,
  // meaning a smaller number of bets are carrying disproportionate real
  // money and the book is reacting to that weight specifically, not just
  // "money% happens to be high." Different from Line Reaction (which infers
  // movement from checkpoints I've logged myself, same-side odds over
  // time) -- this is the source's own real-time read at a single moment.
  // NOT restricted to moneyline: real data shows RLM gets flagged mostly
  // on spread picks (Rays, Rangers, 49ers, Pirates all real spread
  // examples logged Sep 8-10), so this uses the full closing-picks
  // population across every market instead of the ML-only pattern used
  // elsewhere.
  const allClosingPicksEverAllMarkets = [...closingPicksAcrossDays(data.days), ...closingPicksAcrossDays(history.days)]
  function isRlmPick(p) {
    return p.rlm === true
  }
  const rlmPicks = allClosingPicksEverAllMarkets.filter(isRlmPick).filter(p => p.result === 'win' || p.result === 'loss')
  const rlmW = rlmPicks.filter(p => p.result === 'win').length
  const rlmStats = { wins: rlmW, losses: rlmPicks.length - rlmW, total: rlmPicks.length,
    wr: rlmPicks.length ? Math.round(rlmW/rlmPicks.length*100) : 0 }

  // RUN LINE SWEET SPOT -- Run Line has been the single strongest,
  // most consistently validated market in the whole system (56% WR
  // overall on 184 picks, confirmed repeatedly across Movement Shape,
  // Line Reaction, and CLV all pointing the same direction). But the
  // real edge isn't spread evenly across every gap size -- specifically
  // the 20-29% tier (66% WR, n=44) and 40-49% tier (70% WR, n=10) are
  // the two real, validated bands; 1-9% (51%), 10-19% (48%), and 30-39%
  // (50%) show no real edge, and 50%+ (100%, n=2) is far too thin to
  // trust despite the eye-catching number. Flags only the two bands
  // that have actually earned it, not the whole market.
  function isRunLineSweetSpot(p) {
    if (p.market !== 'spread') return false
    return (p.gap >= 20 && p.gap <= 29) || (p.gap >= 40 && p.gap <= 49)
  }
  const runLineSweetSpotPicks = allClosingPicksEverAllMarkets.filter(isRunLineSweetSpot).filter(p => p.result === 'win' || p.result === 'loss')
  const runLineSweetSpotW = runLineSweetSpotPicks.filter(p => p.result === 'win').length
  const runLineSweetSpotStats = { wins: runLineSweetSpotW, losses: runLineSweetSpotPicks.length - runLineSweetSpotW, total: runLineSweetSpotPicks.length,
    wr: runLineSweetSpotPicks.length ? Math.round(runLineSweetSpotW/runLineSweetSpotPicks.length*100) : 0 }

  // OLD FORMULA + CONFIRMS: the real signal, replacing the earlier
  // new-formula version of this tier. Backed out directly from the Sep 7
  // stats screen: all-time confirms was 55-33 (63%, n=88), new-formula-
  // only confirms was 9-10 (47%, n=19) -- meaning old-formula-era
  // confirms alone works out to 46-23, 66.7%, n=69, genuinely STRONGER
  // than the blended headline number, not just carrying it. New-formula
  // gap sign showed no real edge here (the version this tier used to
  // track, 47% WR, n=19) -- replaced rather than kept alongside it, per
  // instruction not to mix new formula into this specific combination.
  //
  // Uses oldGapFor(rawMoney), NOT statsEligibleDays-restricted -- old-
  // formula gap is valid math on ANY date with rawMoney recorded,
  // matching exactly how the Old Formula stats section itself scopes
  // its own data (allClosingPicksEver, full history) -- confirmed by
  // reading that section's own code before assuming the scoping here.
  function isWatchTierPick(closing) {
    if ((closing.market || 'ml') !== 'ml') return false
    if (closing.rawMoney == null) return false
    const oldGap = oldGapFor(closing.rawMoney)
    return oldTierGoodBad(oldGap) === 'good' && closing.confirms === 'confirms'
  }

  const watchTierPicks = allClosingPicksEver.filter(isWatchTierPick).filter(p => p.result === 'win' || p.result === 'loss')
  const watchTierW = watchTierPicks.filter(p => p.result === 'win').length
  const watchTierStats = { wins: watchTierW, losses: watchTierPicks.length - watchTierW, total: watchTierPicks.length,
    wr: watchTierPicks.length ? Math.round(watchTierW/watchTierPicks.length*100) : 0 }

  const oldFormulaPicks = allClosingPicksEver
    .filter(p => (p.result === 'win' || p.result === 'loss') && p.rawMoney != null)
    .map(p => ({ ...p, oldGap: oldGapFor(p.rawMoney) }))

  const oldGroupStats = GROUPS.map(g => {
    const livePicks = oldFormulaPicks.filter(p => p.oldGap >= g.min && p.oldGap <= g.max)
    const liveWins = livePicks.filter(p => p.result === 'win').length
    const liveLosses = livePicks.length - liveWins
    const base = OLD_FORMULA_BASELINE.byGroup[g.label] || { w: 0, l: 0 }
    const wins = base.w + liveWins
    const losses = base.l + liveLosses
    const picks = wins + losses
    const wr = picks ? Math.round((wins/picks)*100) : 0
    return { ...g, picks, wins, losses, wr }
  })
  const oldBaseW = Object.values(OLD_FORMULA_BASELINE.byGroup).reduce((s,g)=>s+g.w,0)
  const oldBaseL = Object.values(OLD_FORMULA_BASELINE.byGroup).reduce((s,g)=>s+g.l,0)
  const oldLiveW = oldFormulaPicks.filter(p=>p.result==='win').length
  const oldLiveL = oldFormulaPicks.filter(p=>p.result==='loss').length
  const oldOverallStats = {
    wins: oldBaseW + oldLiveW, losses: oldBaseL + oldLiveL,
    get total() { return this.wins + this.losses },
    get wr() { return this.total ? Math.round((this.wins/this.total)*100) : 0 },
  }

  // Sharp-vs-model ALIGNMENT (confirms/conflicts/neutral) is formula-agnostic
  // -- it only asks "did the sharp pick agree with the model," which doesn't
  // depend on which gap formula was used. So unlike the gap-tier stats above,
  // this pulls from ALL live picks with no FORMULA_FIX_DATE restriction.
  //
  // The baseline (OLD_FORMULA_BASELINE.alignment) was hardcoded because the
  // live app's own storage had lost the Jun 14-30 period at the time. If
  // live storage now genuinely has NO days at or before that baseline's
  // asOf date, the period truly is still missing locally and the baseline
  // fills the real gap. If live storage DOES have those early days (e.g.
  // restored from a fuller Drive backup), counting both would double-count
  // the same real picks -- so the baseline is skipped entirely in that case.
  const liveHasBaselinePeriod = [...data.days, ...history.days]
    .some(d => parseCardDate(d.date) <= parseCardDate(OLD_FORMULA_BASELINE.asOf))
  const alignmentAllTime = ['confirms','conflicts','neutral'].reduce((acc, key) => {
    const live = allClosingPicksEver.filter(p => p.confirms === key && (p.result==='win'||p.result==='loss'))
    const liveW = live.filter(p=>p.result==='win').length
    const liveL = live.length - liveW
    const base = liveHasBaselinePeriod ? { w:0, l:0 } : (OLD_FORMULA_BASELINE.alignment[key] || { w:0, l:0 })
    const wins = base.w + liveW, losses = base.l + liveL, total = wins + losses
    acc[key] = { wins, losses, total, wr: total ? Math.round((wins/total)*100) : 0 }
    return acc
  }, {})

  // Shared engine for the three multi-checkpoint stats (Line Reaction, CLV,
  // Movement Shape). Takes a marketFilter so each can be computed
  // separately per market -- user wants full market separation everywhere,
  // not just pooled-but-uncontaminated, since this is a data-gathering
  // year rather than a live-betting one and thin per-market cells are an
  // acceptable, even preferable, tradeoff for a complete dataset later.
  function computeCheckpointStats(marketFilter, kind) {
    const buckets = kind === 'reaction'
      ? { 'line frozen': { w:0, l:0 }, 'line drifted': { w:0, l:0 }, 'line moved hard': { w:0, l:0 } }
      : kind === 'clv'
      ? { beat: { w:0, l:0 }, worse: { w:0, l:0 } }
      : { flipped:{w:0,l:0}, spiked:{w:0,l:0}, building:{w:0,l:0}, fading:{w:0,l:0}, steady:{w:0,l:0} }
    const allDays = [...data.days, ...history.days]
    for (const day of allDays) {
      const byGame = {}
      day.picks.forEach(p => {
        if ((p.market || 'ml') !== marketFilter) return
        (byGame[marketKey(p)] ||= []).push(p)
      })
      for (const picks of Object.values(byGame)) {
        if (picks.length < 2) continue
        const sorted = [...picks].sort((a,b)=>checkpointOrder(a.checkTime)-checkpointOrder(b.checkTime))
        const last = sorted[sorted.length-1]
        if (last.result !== 'win' && last.result !== 'loss') continue

        if (kind === 'shape') {
          const shape = classifyMovementShape(sorted)
          if (!shape) continue
          buckets[shape.shape][last.result === 'win' ? 'w' : 'l'] += 1
          continue
        }
        const withOdds = sameSideOddsRun(sorted)
        if (withOdds.length < 2) continue
        if (kind === 'reaction') {
          const reaction = lineReaction(last.gap, oddsMove(withOdds[0].sharpOdds, withOdds[withOdds.length-1].sharpOdds))
          if (!reaction) continue
          buckets[reaction.label][last.result === 'win' ? 'w' : 'l'] += 1
        } else {
          const clv = calcCLV(withOdds[0].sharpOdds, withOdds[withOdds.length-1].sharpOdds)
          if (!clv) continue
          buckets[clv.beat ? 'beat' : 'worse'][last.result === 'win' ? 'w' : 'l'] += 1
        }
      }
    }
    return Object.entries(buckets).map(([label, v]) => {
      const total = v.w + v.l
      return { label, wins: v.w, losses: v.l, total, wr: total ? Math.round((v.w/total)*100) : null }
    })
  }

  const lineReactionStatsML = computeCheckpointStats('ml', 'reaction')
  const lineReactionStatsSpread = computeCheckpointStats('spread', 'reaction')
  const lineReactionStatsTotal = computeCheckpointStats('total', 'reaction')
  const clvStatsML = computeCheckpointStats('ml', 'clv')
  const clvStatsSpread = computeCheckpointStats('spread', 'clv')
  const clvStatsTotal = computeCheckpointStats('total', 'clv')
  const shapeStatsML = computeCheckpointStats('ml', 'shape')
  const shapeStatsSpread = computeCheckpointStats('spread', 'shape')
  const shapeStatsTotal = computeCheckpointStats('total', 'shape')

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

  const [marketFilter, setMarketFilter] = useState('ml') // ml | spread | total

  // CRITICAL FIX: previously grouped by game name ALONE, meaning ML/spread/
  // total entries for the SAME game got bucketed together and sorted as if
  // they were sequential checkpoints of one series -- creating fake
  // "movement" between entirely different markets (e.g. an ML gap at 9 AM
  // compared against a totally unrelated spread gap also at 9 AM, plotted
  // as if the line moved between them). Now keyed by game+market so each
  // market gets its own fully independent checkpoint history and graph.
  const todayGameGroups = (() => {
    const byGame = {}
    todayPicks
      .filter(p => (p.market || 'ml') === marketFilter)
      .forEach(p => { const key = `${p.game}__${p.market||'ml'}`; (byGame[key] ||= []).push(p) })
    return Object.values(byGame).map(picks => {
      const game = picks[0].game
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
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={exportToDrive} disabled={driveExporting} style={{ flex:1, padding:'6px 12px', background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, textTransform:'uppercase', color:'#60a5fa' }}>
                  {driveExporting ? 'Sending...' : 'Export (Full)'}
                </button>
                <button onClick={exportToDriveMonthly} disabled={driveExporting} style={{ flex:1, padding:'6px 12px', background:'rgba(74,222,128,.15)', border:'1px solid #4ade80', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, textTransform:'uppercase', color:'#4ade80' }}>
                  {driveExporting ? 'Sending...' : 'Export by Month'}
                </button>
              </div>
              <div style={{ fontSize:'.44rem', color:'#606080', marginTop:5, lineHeight:1.4 }}>
                Full export eventually gets too large for Claude to read in one piece — confirmed real limit. Export by Month splits into one small file per month instead (e.g. mlb-2026-09.json), which stays reliably readable no matter how much history accumulates. Prefer this one going forward.
              </div>
              {driveStatus && <div style={{ fontSize:'.46rem', color:'#8080a0', marginTop:5 }}>{driveStatus}</div>}
            </div>
          </div>
        )}
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

          <div style={{ display:'flex', gap:4, marginTop:4 }}>
            {[['ml','Moneyline'],['spread',marketLabel(sport,'spread')],['total','Total']].map(([key,label]) => (
              <button key={key} onClick={()=>setMarketFilter(key)} style={{
                flex:1, padding:'6px 4px', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif",
                fontSize:'.62rem', fontWeight:700, textTransform:'uppercase',
                background: marketFilter===key ? (key==='spread'?'rgba(34,211,238,.15)':key==='total'?'rgba(192,132,252,.15)':'rgba(37,99,235,.15)') : '#0c0c1a',
                border: `1px solid ${marketFilter===key ? (key==='spread'?'#22d3ee':key==='total'?'#c084fc':'#2563eb') : '#1a1a2e'}`,
                color: marketFilter===key ? (key==='spread'?'#22d3ee':key==='total'?'#c084fc':'#60a5fa') : '#505070',
              }}>{label}</button>
            ))}
          </div>

          {todayGameGroups.length === 0 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>
              No {marketFilter==='ml'?'Moneyline':marketFilter==='spread'?marketLabel(sport,'spread'):'Total'} picks logged today for {meta.label}. Tap + Add or paste JSON.
            </div>
          )}

          {todayGameGroups.map(({ game, sorted, opening, closing, openTier, closeTier }) => {
            const trend = closing.gap - opening.gap
            const movedTier = openTier?.label !== closeTier?.label
            const tierColor = closeTier ? closeTier.color : '#404060'
            const tierBorder = closeTier ? closeTier.border : '#1a1a2e'
            const closingOldGap = closing.rawMoney != null ? oldGapFor(closing.rawMoney) : null
            const closeOldTier = closingOldGap != null ? tierFor(closingOldGap) : null
            const mRead = marginRead(closing.result, closing.margin)
            const shape = classifyMovementShape(sorted)
            const pickMarket = closing.market || 'ml'
            const isHotCombo = isHotComboPick(closing)
            const isNegGap = isNegativeGapPick(closing)
            const isAvoid = isAvoidTierPick(closing, shape)
            const isWatch = isWatchTierPick(closing) && !isHotCombo // don't double-flag when the stronger combo already fired
            const isRlm = isRlmPick(closing)
            const isRunLineSweet = isRunLineSweetSpot(closing)
            return (
              <div key={game} style={{ background:'#09090f', border:`1px solid ${isAvoid ? '#ef4444' : isHotCombo ? '#facc15' : tierBorder}`, borderRadius:8, padding:'10px 10px', marginBottom:2 }}>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom: (shape || pickMarket!=='ml' || isHotCombo || isNegGap || isAvoid || isWatch || isRlm || isRunLineSweet) ? 6 : 0 }}>
                  {isRunLineSweet && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#22d3ee22', border:'1px solid #22d3ee', borderRadius:5, padding:'2px 7px' }}>
                      <span style={{ fontSize:'.56rem', fontWeight:800, color:'#22d3ee', textTransform:'uppercase' }}>🎯 RL Sweet Spot</span>
                      <span style={{ fontSize:'.46rem', color:'#8080a0' }}>
                        · 20-29% or 40-49% gap, the two validated Run Line bands · {runLineSweetSpotStats.total ? `${runLineSweetSpotStats.wins}-${runLineSweetSpotStats.losses} (${runLineSweetSpotStats.wr}%) all-time` : 'building history'}
                      </span>
                    </div>
                  )}
                  {isRlm && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#34d39922', border:'1px solid #34d399', borderRadius:5, padding:'2px 7px' }}>
                      <span style={{ fontSize:'.56rem', fontWeight:800, color:'#34d399', textTransform:'uppercase' }}>↩ RLM</span>
                      <span style={{ fontSize:'.46rem', color:'#8080a0' }}>
                        · book moved against the ticket majority · {rlmStats.total ? `${rlmStats.wins}-${rlmStats.losses} (${rlmStats.wr}%) all-time` : 'building history'}
                      </span>
                    </div>
                  )}
                  {isAvoid && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#ef444422', border:'1px solid #ef4444', borderRadius:5, padding:'2px 7px' }}>
                      <span style={{ fontSize:'.56rem', fontWeight:800, color:'#ef4444', textTransform:'uppercase' }}>🚫 Avoid Tier</span>
                      <span style={{ fontSize:'.46rem', color:'#8080a0' }}>
                        · old formula good + flipped sides · {avoidTierStats.total ? `${avoidTierStats.wins}-${avoidTierStats.losses} (${avoidTierStats.wr}%) all-time` : 'building history'}
                      </span>
                    </div>
                  )}
                  {isHotCombo && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#facc1522', border:'1px solid #facc15', borderRadius:5, padding:'2px 7px' }}>
                      <span style={{ fontSize:'.56rem', fontWeight:800, color:'#facc15', textTransform:'uppercase' }}>⭐ Tracked Combo</span>
                      <span style={{ fontSize:'.46rem', color:'#8080a0' }}>
                        · 30%+ gap + confirms model · {hotComboStats.total ? `${hotComboStats.wins}-${hotComboStats.losses} (${hotComboStats.wr}%) all-time` : 'building history'}
                      </span>
                    </div>
                  )}
                  {isWatch && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#60a5fa22', border:'1px solid #60a5fa', borderRadius:5, padding:'2px 7px' }}>
                      <span style={{ fontSize:'.56rem', fontWeight:800, color:'#60a5fa', textTransform:'uppercase' }}>👀 Watch Tier</span>
                      <span style={{ fontSize:'.46rem', color:'#8080a0' }}>
                        · old formula good + confirms model · {watchTierStats.total ? `${watchTierStats.wins}-${watchTierStats.losses} (${watchTierStats.wr}%) all-time` : 'building history'}
                      </span>
                    </div>
                  )}
                  {isNegGap && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#f9731622', border:'1px solid #f97316', borderRadius:5, padding:'2px 7px' }}>
                      <span style={{ fontSize:'.56rem', fontWeight:800, color:'#f97316', textTransform:'uppercase' }}>⚠ Negative Gap</span>
                      <span style={{ fontSize:'.46rem', color:'#8080a0' }}>
                        · early hypothesis, not yet validated · {negGapStats.total ? `${negGapStats.wins}-${negGapStats.losses} (${negGapStats.wr}%) all-time` : 'building history'}
                      </span>
                    </div>
                  )}
                  {pickMarket !== 'ml' && (
                    <div style={{ display:'inline-flex', alignItems:'center', background: pickMarket==='spread' ? '#164e6322' : '#4c1d9522', border:`1px solid ${pickMarket==='spread' ? '#22d3ee' : '#c084fc'}`, borderRadius:5, padding:'2px 7px' }}>
                      <span style={{ fontSize:'.5rem', fontWeight:800, color: pickMarket==='spread' ? '#22d3ee' : '#c084fc' }}>{marketLabel(sport, pickMarket)}</span>
                    </div>
                  )}
                  {shape && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:`${shape.color}22`, border:`1px solid ${shape.color}`, borderRadius:5, padding:'2px 7px' }}>
                      <span style={{ fontSize:'.56rem', fontWeight:800, color:shape.color, textTransform:'uppercase' }}>{shape.label}</span>
                      <span style={{ fontSize:'.46rem', color:'#8080a0' }}>· {shape.note}</span>
                    </div>
                  )}
                </div>
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
                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end', alignItems:'baseline' }}>
                      {closingOldGap != null && (
                        <div>
                          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.2rem', fontWeight:800, color:'#fbbf24' }}>{closingOldGap}%</div>
                          <div style={{ fontSize:'.36rem', color:'#78716c', textTransform:'uppercase' }}>old · {closeOldTier ? closeOldTier.label : 'no tier'}</div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.2rem', fontWeight:800, color:tierColor }}>{closing.gap}%</div>
                        <div style={{ fontSize:'.36rem', color:'#404060', textTransform:'uppercase' }}>new · {closeTier ? closeTier.label : 'no tier'}</div>
                      </div>
                    </div>
                    <div style={{ fontSize:'.4rem', color:'#404060', textTransform:'uppercase', marginTop:2 }}>closing</div>
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
                  const hasOldGap = sorted.some(p => p.rawMoney != null)
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
                      <LineChart data={sorted.map(p=>({checkTime:p.checkTime||'?', gap:p.gap, oldGap: p.rawMoney!=null ? oldGapFor(p.rawMoney) : null, odds:parseOdds(p.sharpOdds)}))} margin={{top:4,right:6,bottom:0,left:-30}}>
                        <XAxis dataKey="checkTime" tick={{fontSize:7,fill:'#404060'}} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="gap" hide domain={[dataMin => dataMin - 1, dataMax => dataMax + 1]} />
                        <YAxis yAxisId="odds" hide domain={[dataMin => dataMin - 4, dataMax => dataMax + 4]} />
                        <Tooltip contentStyle={{background:'#0e0e1e',border:'1px solid #1a1a30',borderRadius:6,fontSize:'.55rem'}} labelStyle={{color:'#60a5fa'}}
                          formatter={(v,name)=>name==='gap'?[`${v}%`,'New Gap']:name==='oldGap'?[`${v}%`,'Old Gap']:[v>0?`+${v}`:`${v}`,'Odds']} />
                        <Line yAxisId="gap" type="monotone" dataKey="gap" stroke="#60a5fa" strokeWidth={2} dot={{r:3,fill:'#60a5fa'}} />
                        {hasOldGap && <Line yAxisId="gap" type="monotone" dataKey="oldGap" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 3" dot={{r:3,fill:'#fbbf24'}} connectNulls />}
                        {hasOdds && <Line yAxisId="odds" type="monotone" dataKey="odds" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 3" dot={{r:2,fill:'#38bdf8'}} />}
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:2, flexWrap:'wrap' }}>
                      <span style={{ fontSize:'.42rem', color:'#60a5fa' }}>— new gap %</span>
                      {hasOldGap && <span style={{ fontSize:'.42rem', color:'#fbbf24' }}>┄ old gap %</span>}
                      {hasOdds && <span style={{ fontSize:'.42rem', color:'#38bdf8' }}>-- odds</span>}
                    </div>
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

          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:800, textTransform:'uppercase', color:'#60a5fa', marginTop:4, marginBottom:2, borderBottom:'2px solid #1e40af', paddingBottom:4 }}>
            🔵 New Formula — money% minus bets%
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

          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:800, textTransform:'uppercase', color:'#fbbf24', marginTop:10, marginBottom:2, borderBottom:'2px solid #713f12', paddingBottom:4 }}>
            🟡 Old Formula — distance from 50/50 on money%
          </div>
          <div style={{ fontSize:'.44rem', color:'#404060', marginBottom:4, lineHeight:1.4 }}>
            Different math from the formula above — a game can land in different tiers under each.
            Baseline from real, validated Jun 30 data recovered from git history; live picks only add
            in for days where raw money% was captured (not every day has this yet).
          </div>
          <div style={{ background:'#09090f', border:'1px solid #713f12', borderRadius:10, padding:12, marginBottom:2 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
              {[
                { val: oldOverallStats.total, lbl: 'Total Graded' },
                { val: `${oldOverallStats.wins}-${oldOverallStats.losses}`, lbl: 'W-L' },
                { val: `${oldOverallStats.wr}%`, lbl: 'Win Rate' },
              ].map(s => (
                <div key={s.lbl} style={{ textAlign:'center', background:'#0c0c1a', borderRadius:6, padding:'8px 4px' }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color:'#fbbf24', lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:'.38rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginTop:3 }}>{s.lbl}</div>
                </div>
              ))}
            </div>
          </div>
          {oldGroupStats.map(g => (
            <div key={`old-${g.label}`} style={{ background:'#09090f', border:'1px solid #713f12', borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:'#fbbf24' }}>{g.label} Gap</div>
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
                    <div style={{ height:'100%', width:`${g.wr}%`, background:'#fbbf24', borderRadius:3 }} />
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

          <div style={{ background:'#09090f', border:'1px solid #713f12', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#fbbf24', marginBottom:3 }}>Sharp vs Model Alignment (All-Time)</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              Formula-agnostic — only asks whether the sharp pick agreed with the model, independent of which gap formula was in use. Spans full history{liveHasBaselinePeriod ? '' : `, includes the recovered ${OLD_FORMULA_BASELINE.asOf} baseline for the earliest period`}.
            </div>
            {['confirms','conflicts','neutral'].map(key => {
              const a = alignmentAllTime[key]
              const label = key==='confirms'?'Confirms Models':key==='conflicts'?'Conflicts Models':'Neutral'
              const color = key==='confirms'?'#4ade80':key==='conflicts'?'#f87171':'#94a3b8'
              return (
                <div key={key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #0d0d1a' }}>
                  <div style={{ fontSize:'.6rem', color }}>{label}</div>
                  <div style={{ fontSize:'.6rem', color:'#a0a0c0' }}>
                    {a.total === 0 ? '— no data yet' : `${a.wins}-${a.losses} · ${a.wr}% WR`}
                  </div>
                </div>
              )
            })}
          </div>

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
              Did the book move the line when the money came in? Needs 2+ checkpoints with odds and a 10%+ gap, so this builds slower than the other stats. Split by market — spread/total will start thin and build up over time.
            </div>
            {['ml','spread','total'].map(mk => {
              const stats = mk==='ml'?lineReactionStatsML:mk==='spread'?lineReactionStatsSpread:lineReactionStatsTotal
              return (
                <div key={mk} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:'.52rem', fontWeight:700, color:'#8080a0', textTransform:'uppercase', marginBottom:4 }}>{mk==='ml'?'Moneyline':marketLabel(sport,mk)}</div>
                  {[
                    { label:'line moved hard', display:'Line moved hard', sub:'book respecting it', color:'#4ade80' },
                    { label:'line drifted', display:'Line drifted', sub:'mild response', color:'#fbbf24' },
                    { label:'line frozen', display:'Line frozen', sub:'big money, book unmoved', color:'#f87171' },
                  ].map(s => {
                    const r = stats.find(x => x.label === s.label)
                    return (
                      <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid #0d0d1a' }}>
                        <div>
                          <div style={{ fontSize:'.56rem', color:s.color }}>{s.display}</div>
                          <div style={{ fontSize:'.4rem', color:'#404060' }}>{s.sub}</div>
                        </div>
                        <div style={{ fontSize:'.56rem', color:'#a0a0c0' }}>
                          {!r || r.total === 0 ? '— no data yet' : `${r.wins}-${r.losses} · ${r.wr}% WR`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:3 }}>Closing Line Value</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              Did your entry price beat where the line actually closed? Skill-independent of whether the pick itself won — the closing line is the market's most information-complete price, so consistently beating it is real evidence of a good read. Split by market.
            </div>
            {['ml','spread','total'].map(mk => {
              const stats = mk==='ml'?clvStatsML:mk==='spread'?clvStatsSpread:clvStatsTotal
              return (
                <div key={mk} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:'.52rem', fontWeight:700, color:'#8080a0', textTransform:'uppercase', marginBottom:4 }}>{mk==='ml'?'Moneyline':marketLabel(sport,mk)}</div>
                  {[
                    { label:'beat', display:'Beat the close', sub:'entry price better than closing price', color:'#4ade80' },
                    { label:'worse', display:'Worse than close', sub:'line moved away from your entry', color:'#f87171' },
                  ].map(s => {
                    const r = stats.find(x => x.label === s.label)
                    return (
                      <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid #0d0d1a' }}>
                        <div>
                          <div style={{ fontSize:'.56rem', color:s.color }}>{s.display}</div>
                          <div style={{ fontSize:'.4rem', color:'#404060' }}>{s.sub}</div>
                        </div>
                        <div style={{ fontSize:'.56rem', color:'#a0a0c0' }}>
                          {!r || r.total === 0 ? '— no data yet' : `${r.wins}-${r.losses} · ${r.wr}% WR`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:3 }}>Movement Shape</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              What the money actually did across the day, not just where it ended up. Split by market — a shape's real meaning may differ between moneyline and totals, worth tracking separately rather than assuming they behave the same.
            </div>
            {['ml','spread','total'].map(mk => {
              const stats = mk==='ml'?shapeStatsML:mk==='spread'?shapeStatsSpread:shapeStatsTotal
              return (
                <div key={mk} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:'.52rem', fontWeight:700, color:'#8080a0', textTransform:'uppercase', marginBottom:4 }}>{mk==='ml'?'Moneyline':marketLabel(sport,mk)}</div>
                  {[
                    { label:'flipped', display:'Flipped sides', sub:'sharp lean changed team during the day', color:'#a78bfa' },
                    { label:'building', display:'Building all day', sub:'gap grew steadily, same side throughout', color:'#4ade80' },
                    { label:'steady', display:'Steady', sub:'held a consistent gap, same side', color:'#60a5fa' },
                    { label:'spiked', display:'Spiked & faded', sub:'peaked mid-day then cooled back down', color:'#fbbf24' },
                    { label:'fading', display:'Fading', sub:'gap shrank steadily, same side throughout', color:'#f87171' },
                  ].map(s => {
                    const r = stats.find(x => x.label === s.label)
                    return (
                      <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid #0d0d1a' }}>
                        <div>
                          <div style={{ fontSize:'.56rem', color:s.color }}>{s.display}</div>
                          <div style={{ fontSize:'.4rem', color:'#404060' }}>{s.sub}</div>
                        </div>
                        <div style={{ fontSize:'.56rem', color:'#a0a0c0' }}>
                          {!r || r.total === 0 ? '— no data yet' : `${r.wins}-${r.losses} · ${r.wr}% WR`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {[
            { stats: spreadStats, label: marketLabel(sport, 'spread'), color: '#22d3ee' },
            { stats: totalStats, label: marketLabel(sport, 'total'), color: '#c084fc' },
          ].map(({ stats, label, color }) => (
            <div key={label} style={{ background:'#09090f', border:`1px solid ${stats.total ? color+'55' : '#1a1a2e'}`, borderRadius:10, padding:12 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color, marginBottom:3 }}>{label} Performance</div>
              <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8 }}>
                Same gap math and tiers as Moneyline, tracked in its own separate bucket. Starting fresh, no historical baseline.
              </div>
              {stats.total === 0 ? (
                <div style={{ fontSize:'.56rem', color:'#303050', textAlign:'center', padding:'10px 0' }}>No graded {label.toLowerCase()} picks yet</div>
              ) : (
                <>
                  <div style={{ fontSize:'.6rem', color:'#a0a0c0', marginBottom:6 }}>{stats.wins}-{stats.losses} overall · {stats.wr}% WR ({stats.total} picks)</div>
                  {stats.byTier.filter(t => t.picks > 0).map(t => (
                    <div key={t.label} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #0d0d1a' }}>
                      <div style={{ fontSize:'.56rem', color:'#8080a0' }}>{t.label}</div>
                      <div style={{ fontSize:'.56rem', color:'#a0a0c0' }}>{t.wins}-{t.losses} · {t.wr}% (n={t.picks})</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}

          <div style={{ background:'#09090f', border:'1px solid #facc1555', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#facc15', marginBottom:3 }}>⭐ Tracked Combo — 30%+ Gap + Confirms Model</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              Real, validated pattern from the Sep 2 cross-analysis — the single strongest result out of 78 combinations tested that day, still worth confirming it holds as more data comes in. Moneyline only, restricted to real "confirms" model-alignment tags (not the unrelated momentum-label values some other tool wrote into this field around Aug 26-31).
            </div>
            {hotComboStats.total === 0 ? (
              <div style={{ fontSize:'.56rem', color:'#303050', textAlign:'center', padding:'8px 0' }}>No graded picks in this combo yet</div>
            ) : (
              <div style={{ fontSize:'.6rem', color:'#e0e0f0' }}>
                {hotComboStats.wins}-{hotComboStats.losses} · <span style={{ color: hotComboStats.wr>=55?'#4ade80':hotComboStats.wr<=45?'#f87171':'#a0a0c0', fontWeight:700 }}>{hotComboStats.wr}% WR</span> ({hotComboStats.total} picks)
              </div>
            )}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #ef444455', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#ef4444', marginBottom:3 }}>🚫 Avoid Tier — Old Formula Good + Flipped Sides</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              Real result from the Sep 4 108-combination cross-analysis — one of only two combinations that cleared both a real sample size and a meaningful gap from 50%. A conviction-looking old-formula number on a game whose sharp side already reversed once is a real warning sign, not a green light.
            </div>
            {avoidTierStats.total === 0 ? (
              <div style={{ fontSize:'.56rem', color:'#303050', textAlign:'center', padding:'8px 0' }}>No graded picks in this combo yet</div>
            ) : (
              <div style={{ fontSize:'.6rem', color:'#e0e0f0' }}>
                {avoidTierStats.wins}-{avoidTierStats.losses} · <span style={{ color: avoidTierStats.wr>=55?'#4ade80':avoidTierStats.wr<=45?'#f87171':'#a0a0c0', fontWeight:700 }}>{avoidTierStats.wr}% WR</span> ({avoidTierStats.total} picks)
              </div>
            )}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #60a5fa55', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#60a5fa', marginBottom:3 }}>👀 Watch Tier — Old Formula Good + Confirms Model</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              Replaced Sep 7 — the new-formula version of this tier (positive gap + confirms) came back flat at 47% WR on n=19, in line with every other new-formula test. Backed out from the same day's stats: old-formula-era confirms alone works out to 46-23, 66.7%, n=69 — genuinely stronger than the blended all-time number, not just riding it. This tier now tracks that combination going forward instead.
            </div>
            {watchTierStats.total === 0 ? (
              <div style={{ fontSize:'.56rem', color:'#303050', textAlign:'center', padding:'8px 0' }}>No graded picks in this combo yet</div>
            ) : (
              <div style={{ fontSize:'.6rem', color:'#e0e0f0' }}>
                {watchTierStats.wins}-{watchTierStats.losses} · <span style={{ color: watchTierStats.wr>=55?'#4ade80':watchTierStats.wr<=45?'#f87171':'#a0a0c0', fontWeight:700 }}>{watchTierStats.wr}% WR</span> ({watchTierStats.total} picks)
              </div>
            )}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #22d3ee55', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#22d3ee', marginBottom:3 }}>🎯 Run Line Sweet Spot</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              Run Line has been the single strongest, most consistently validated market in the whole system — but the real edge isn't spread evenly across every gap size. Specifically the 20-29% tier (66% WR, n=44) and 40-49% tier (70% WR, n=10) are the two real, validated bands from the full Run Line Performance breakdown; 1-9%, 10-19%, and 30-39% show no real edge, and 50%+ (100%, n=2) is far too thin to trust despite the number. Flags only the two bands that have actually earned it.
            </div>
            {runLineSweetSpotStats.total === 0 ? (
              <div style={{ fontSize:'.56rem', color:'#303050', textAlign:'center', padding:'8px 0' }}>No graded picks yet</div>
            ) : (
              <div style={{ fontSize:'.6rem', color:'#e0e0f0' }}>
                {runLineSweetSpotStats.wins}-{runLineSweetSpotStats.losses} · <span style={{ color: runLineSweetSpotStats.wr>=55?'#4ade80':runLineSweetSpotStats.wr<=45?'#f87171':'#a0a0c0', fontWeight:700 }}>{runLineSweetSpotStats.wr}% WR</span> ({runLineSweetSpotStats.total} picks)
              </div>
            )}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #34d39955', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#34d399', marginBottom:3 }}>↩ RLM — Reverse Line Movement</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              New field, Sep 10 — the source's own real-time flag that the book's line moved AGAINST where the majority of tickets/bets are, meaning a smaller number of bets are carrying disproportionate real money. Distinct from Line Reaction (which infers movement from my own logged checkpoints over time) — this is the source's read at a single moment. Applies across all markets, not just moneyline, since real RLM tags have shown up mostly on spread picks.
            </div>
            {rlmStats.total === 0 ? (
              <div style={{ fontSize:'.56rem', color:'#303050', textAlign:'center', padding:'8px 0' }}>No graded picks yet</div>
            ) : (
              <div style={{ fontSize:'.6rem', color:'#e0e0f0' }}>
                {rlmStats.wins}-{rlmStats.losses} · <span style={{ color: rlmStats.wr>=55?'#4ade80':rlmStats.wr<=45?'#f87171':'#a0a0c0', fontWeight:700 }}>{rlmStats.wr}% WR</span> ({rlmStats.total} picks)
              </div>
            )}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #f9731655', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#f97316', marginBottom:3 }}>⚠ Negative Gap (Early Hypothesis)</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              NOT yet validated — found Sep 4 while checking whether new-formula gap magnitude tiers were flat because the formula adds noise, or because magnitude is the wrong thing to measure. A negative gap means the picked side has LESS money than bets, the same "stale pick" signature the reflip fix treats as meaningful. Real result at the time: 5-1 (83% WR) on just n=6 — striking but far too small to trust. Tracked here to accumulate automatically; treat as noise until the sample is meaningfully larger.
            </div>
            {negGapStats.total === 0 ? (
              <div style={{ fontSize:'.56rem', color:'#303050', textAlign:'center', padding:'8px 0' }}>No graded picks yet</div>
            ) : (
              <div style={{ fontSize:'.6rem', color:'#e0e0f0' }}>
                {negGapStats.wins}-{negGapStats.losses} · <span style={{ color: negGapStats.wr>=55?'#4ade80':negGapStats.wr<=45?'#f87171':'#a0a0c0', fontWeight:700 }}>{negGapStats.wr}% WR</span> ({negGapStats.total} picks)
                {negGapStats.total < 20 && <span style={{ color:'#606080' }}> — still too thin to trust</span>}
              </div>
            )}
          </div>

          <div style={{ background:'#09090f', border:'1px solid #92400e55', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#fb923c', marginBottom:3 }}>Gap Size by Market</div>
            <div style={{ fontSize:'.42rem', color:'#404060', marginBottom:8, lineHeight:1.4 }}>
              A different question from win rate — does one market produce bigger, rarer extreme signals than another, regardless of whether those signals actually win? Moneyline restricted to Jul 10+ to stay comparable with Spread/Total, which never had an old-formula era.
            </div>
            {[
              { d: gapDistML, label: 'Moneyline' },
              { d: gapDistSpread, label: marketLabel(sport, 'spread') },
              { d: gapDistTotal, label: 'Total' },
            ].map(({ d, label }) => (
              <div key={label} style={{ padding:'6px 0', borderBottom:'1px solid #0d0d1a' }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <div style={{ fontSize:'.6rem', color:'#e0e0f0', fontWeight:700 }}>{label}</div>
                  <div style={{ fontSize:'.5rem', color:'#606080' }}>n={d.n}</div>
                </div>
                {d.n === 0 ? (
                  <div style={{ fontSize:'.52rem', color:'#404060' }}>No data yet</div>
                ) : (
                  <div style={{ fontSize:'.52rem', color:'#a0a0c0', marginTop:2 }}>
                    mean {d.mean.toFixed(1)}% · median {d.median.toFixed(1)}% · {d.pct20.toFixed(0)}% hit 20%+ · <span style={{ color: d.pct40>0?'#fb923c':'#606080', fontWeight: d.pct40>0?700:400 }}>{d.pct40.toFixed(0)}% hit 40%+</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
