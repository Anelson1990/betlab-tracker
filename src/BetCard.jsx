import { useState, useEffect } from 'react'

const CARD_KEY = 'betlab-daily-card-v1'
const HISTORY_KEY = 'betlab-card-history-v1'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

const EMPTY_CARD = {
  date: '',
  bankroll: 40,
  potd: { pick: '', game: '', direction: '', odds: '', stake: 10, sources: '', analysis: '', result: 'pending', pl: 0 },
  rfi: [],
  ml: [],
  hitParlay: { legs: [], stake: 5, result: 'pending', pl: 0 },
  sgp: { legs: [], stake: 8, result: 'pending', pl: 0 },
  totalPL: 0,
  graded: false,
}

const RESULT_COLORS = {
  pending: { color: '#fbbf24', bg: 'rgba(251,191,36,.12)', border: '#713f12', label: '⏳ Pending' },
  win:     { color: '#4ade80', bg: 'rgba(74,222,128,.12)',  border: '#14532d', label: '✅ Win' },
  loss:    { color: '#f87171', bg: 'rgba(248,113,113,.12)', border: '#7f1d1d', label: '❌ Loss' },
  void:    { color: '#94a3b8', bg: 'rgba(148,163,184,.12)', border: '#334155', label: '🔄 Void' },
  paper:   { color: '#60a5fa', bg: 'rgba(96,165,250,.12)',  border: '#1e40af', label: '📋 Paper' },
}

function ResultBadge({ result, onClick, small }) {
  const rc = RESULT_COLORS[result] || RESULT_COLORS.pending
  return (
    <div onClick={onClick} style={{
      borderRadius: 5, padding: small ? '2px 6px' : '4px 10px',
      fontFamily: "'Barlow Condensed',sans-serif", fontSize: small ? '.6rem' : '.72rem',
      fontWeight: 800, border: `1px solid ${rc.border}`,
      color: rc.color, background: rc.bg, cursor: onClick ? 'pointer' : 'default',
      flexShrink: 0, whiteSpace: 'nowrap'
    }}>{rc.label}</div>
  )
}

function cycleResult(current) {
  const cycle = ['pending', 'win', 'loss', 'void', 'paper']
  return cycle[(cycle.indexOf(current) + 1) % cycle.length]
}

function calcPL(result, stake, odds) {
  if (result === 'win') {
    if (!odds) return stake
    const o = parseInt(odds)
    if (o > 0) return parseFloat(((stake * o) / 100).toFixed(2))
    if (o < 0) return parseFloat(((stake * 100) / Math.abs(o)).toFixed(2))
    return stake
  }
  if (result === 'loss') return -Math.abs(stake)
  return 0
}

// Fetch today's MLB games
async function fetchMLBGames(date) {
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${date}&hydrate=linescore,team`)
    const data = await res.json()
    return data?.dates?.[0]?.games || []
  } catch { return [] }
}

// Fetch linescore for a specific game
async function fetchLinescore(gamePk) {
  try {
    const res = await fetch(`${MLB_API}/game/${gamePk}/linescore`)
    const data = await res.json()
    return data
  } catch { return null }
}

// Fetch box score for hit props
async function fetchBoxScore(gamePk) {
  try {
    const res = await fetch(`${MLB_API}/game/${gamePk}/boxscore`)
    const data = await res.json()
    return data
  } catch { return null }
}

function findGame(games, teamAbbr) {
  if (!teamAbbr) return null
  const abbr = teamAbbr.toUpperCase()
  return games.find(g => {
    const home = g.teams?.home?.team?.abbreviation?.toUpperCase() || ''
    const away = g.teams?.away?.team?.abbreviation?.toUpperCase() || ''
    const homeName = g.teams?.home?.team?.teamName?.toUpperCase() || ''
    const awayName = g.teams?.away?.team?.teamName?.toUpperCase() || ''
    return home === abbr || away === abbr || homeName.includes(abbr) || awayName.includes(abbr)
  })
}

export default function BetCard({ bankroll, onCardSaved }) {
  const [card, setCard] = useState(null)
  const [grading, setGrading] = useState(false)
  const [gradeLog, setGradeLog] = useState([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [newCardDate, setNewCardDate] = useState('')
  const [newCardBR, setNewCardBR] = useState(bankroll || 40)
  const [activeSection, setActiveSection] = useState('potd')
  const [addingRFI, setAddingRFI] = useState(false)
  const [addingML, setAddingML] = useState(false)
  const [addingHit, setAddingHit] = useState(false)
  const [addingSGP, setAddingSGP] = useState(false)
  const [rfiForm, setRfiForm] = useState({ game: '', homeTeam: '', awayTeam: '', pick: 'YRFI', conf: '', stake: 8 })
  const [mlForm, setMlForm] = useState({ game: '', team: '', direction: '', odds: '', stake: 5, sources: '' })
  const [hitForm, setHitForm] = useState({ player: '', rate: '', l10: '', split: '' })
  const [sgpForm, setSgpForm] = useState({ game: '', legs: '', odds: '' })

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CARD_KEY)
      if (stored) setCard(JSON.parse(stored))
    } catch {}
  }, [])

  const save = (updated) => {
    setCard(updated)
    try { localStorage.setItem(CARD_KEY, JSON.stringify(updated)) } catch {}
  }

  const startNewCard = () => {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const newCard = { ...EMPTY_CARD, date: newCardDate || today, bankroll: parseFloat(newCardBR) || 40 }
    save(newCard)
    setShowNewForm(false)
  }

  const archiveCard = () => {
    if (!card) return
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      history.push({ ...card, archivedAt: new Date().toISOString() })
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch {}
    if (onCardSaved) onCardSaved(card)
    localStorage.removeItem(CARD_KEY)
    setCard(null)
  }

  const updatePOTD = (field, val) => {
    const updated = { ...card, potd: { ...card.potd, [field]: val } }
    if (field === 'result') {
      updated.potd.pl = calcPL(val, card.potd.stake, card.potd.odds)
    }
    recalcTotal(updated)
  }

  const updateRFI = (i, field, val) => {
    const rfi = [...card.rfi]
    rfi[i] = { ...rfi[i], [field]: val }
    if (field === 'result') rfi[i].pl = calcPL(val, rfi[i].stake || 8, '-110')
    const updated = { ...card, rfi }
    recalcTotal(updated)
  }

  const updateML = (i, field, val) => {
    const ml = [...card.ml]
    ml[i] = { ...ml[i], [field]: val }
    if (field === 'result') ml[i].pl = calcPL(val, ml[i].stake || 5, ml[i].odds)
    const updated = { ...card, ml }
    recalcTotal(updated)
  }

  const updateHitLeg = (i, field, val) => {
    const legs = [...card.hitParlay.legs]
    legs[i] = { ...legs[i], [field]: val }
    // parlay wins only when all legs win
    const allWin = legs.every(l => l.result === 'win')
    const anyLoss = legs.some(l => l.result === 'loss')
    const parlayResult = allWin ? 'win' : anyLoss ? 'loss' : 'pending'
    const updated = { ...card, hitParlay: { ...card.hitParlay, legs, result: parlayResult, pl: calcPL(parlayResult, card.hitParlay.stake, '+350') } }
    recalcTotal(updated)
  }

  const recalcTotal = (updated) => {
    const potdPL = updated.potd.pl || 0
    const rfiPL = (updated.rfi || []).reduce((a, r) => a + (r.pl || 0), 0)
    const mlPL = (updated.ml || []).reduce((a, m) => a + (m.pl || 0), 0)
    const hitPL = updated.hitParlay.pl || 0
    const sgpPL = updated.sgp.pl || 0
    updated.totalPL = parseFloat((potdPL + rfiPL + mlPL + hitPL + sgpPL).toFixed(2))
    save(updated)
  }

  const addRFI = () => {
    const pick = { ...rfiForm, result: 'pending', pl: 0, stake: parseFloat(rfiForm.stake) || 8 }
    const updated = { ...card, rfi: [...card.rfi, pick] }
    recalcTotal(updated)
    setRfiForm({ game: '', homeTeam: '', awayTeam: '', pick: 'YRFI', conf: '', stake: 8 })
    setAddingRFI(false)
  }

  const addML = () => {
    const pick = { ...mlForm, result: 'pending', pl: 0, stake: parseFloat(mlForm.stake) || 5 }
    const updated = { ...card, ml: [...card.ml, pick] }
    recalcTotal(updated)
    setMlForm({ game: '', team: '', direction: '', odds: '', stake: 5, sources: '' })
    setAddingML(false)
  }

  const addHitLeg = () => {
    const leg = { ...hitForm, result: 'pending' }
    const updated = { ...card, hitParlay: { ...card.hitParlay, legs: [...card.hitParlay.legs, leg] } }
    recalcTotal(updated)
    setHitForm({ player: '', rate: '', l10: '', split: '' })
    setAddingHit(false)
  }

  // ── AUTO GRADE ──
  const autoGrade = async () => {
    if (!card) return
    setGrading(true)
    setGradeLog(['🔄 Fetching MLB scores...'])
    const log = []

    const dateStr = new Date().toISOString().split('T')[0]
    const games = await fetchMLBGames(dateStr)

    if (!games.length) {
      setGradeLog(['⚠️ No games found for today. Try again after games finish.'])
      setGrading(false)
      return
    }

    log.push(`✅ Found ${games.length} games`)
    let updated = { ...card }

    // Grade POTD
    if (card.potd.pick && card.potd.result === 'pending') {
      log.push(`🎯 Grading POTD: ${card.potd.pick}`)
      const game = findGame(games, card.potd.direction)
      if (game) {
        const status = game.status?.detailedState
        if (status === 'Final') {
          const homeScore = game.teams?.home?.score
          const awayScore = game.teams?.away?.score
          const homeTeam = game.teams?.home?.team?.abbreviation
          const awayTeam = game.teams?.away?.team?.abbreviation
          const pickedTeam = card.potd.direction?.toUpperCase()

          if (card.potd.pick.includes('YRFI') || card.potd.pick.includes('NRFI')) {
            // Check linescore for first inning
            const ls = await fetchLinescore(game.gamePk)
            const homeR1 = ls?.innings?.[0]?.home?.runs || 0
            const awayR1 = ls?.innings?.[0]?.away?.runs || 0
            const yrfi = homeR1 > 0 || awayR1 > 0
            const pickedYRFI = card.potd.pick.includes('YRFI')
            const result = (pickedYRFI && yrfi) || (!pickedYRFI && !yrfi) ? 'win' : 'loss'
            updated.potd = { ...updated.potd, result, pl: calcPL(result, updated.potd.stake, updated.potd.odds) }
            log.push(`${result === 'win' ? '✅' : '❌'} POTD ${card.potd.pick}: 1st inn home:${homeR1} away:${awayR1} → ${result.toUpperCase()}`)
          } else {
            // ML pick
            const homeWon = homeScore > awayScore
            const pickedHome = pickedTeam === homeTeam
            const result = (pickedHome && homeWon) || (!pickedHome && !homeWon) ? 'win' : 'loss'
            updated.potd = { ...updated.potd, result, pl: calcPL(result, updated.potd.stake, updated.potd.odds) }
            log.push(`${result === 'win' ? '✅' : '❌'} POTD ${card.potd.direction} ML: ${awayTeam} ${awayScore} @ ${homeTeam} ${homeScore} → ${result.toUpperCase()}`)
          }
        } else {
          log.push(`⏳ POTD game status: ${status} — not final yet`)
        }
      } else {
        log.push(`⚠️ POTD: couldn't find game for ${card.potd.direction}`)
      }
    }

    // Grade RFI picks
    for (let i = 0; i < card.rfi.length; i++) {
      const pick = card.rfi[i]
      if (pick.result !== 'pending') continue
      log.push(`🎯 Grading RFI: ${pick.game}`)
      const game = findGame(games, pick.homeTeam || pick.awayTeam)
      if (game && game.status?.detailedState === 'Final') {
        const ls = await fetchLinescore(game.gamePk)
        const homeR1 = ls?.innings?.[0]?.home?.runs || 0
        const awayR1 = ls?.innings?.[0]?.away?.runs || 0
        const yrfi = homeR1 > 0 || awayR1 > 0
        const pickedYRFI = pick.pick === 'YRFI'
        const result = (pickedYRFI && yrfi) || (!pickedYRFI && !yrfi) ? 'win' : 'loss'
        updated.rfi[i] = { ...updated.rfi[i], result, pl: calcPL(result, pick.stake, '-110') }
        log.push(`${result === 'win' ? '✅' : '❌'} ${pick.game} ${pick.pick}: home:${homeR1} away:${awayR1} → ${result.toUpperCase()}`)
      } else {
        log.push(`⏳ ${pick.game} — not final yet`)
      }
    }

    // Grade ML picks
    for (let i = 0; i < card.ml.length; i++) {
      const pick = card.ml[i]
      if (pick.result !== 'pending') continue
      log.push(`🎯 Grading ML: ${pick.team}`)
      const game = findGame(games, pick.direction || pick.team)
      if (game && game.status?.detailedState === 'Final') {
        const homeScore = game.teams?.home?.score
        const awayScore = game.teams?.away?.score
        const homeTeam = game.teams?.home?.team?.abbreviation
        const awayTeam = game.teams?.away?.team?.abbreviation
        const pickedTeam = (pick.direction || pick.team)?.toUpperCase()
        const homeWon = homeScore > awayScore
        const pickedHome = pickedTeam === homeTeam
        const result = (pickedHome && homeWon) || (!pickedHome && !homeWon) ? 'win' : 'loss'
        updated.ml[i] = { ...updated.ml[i], result, pl: calcPL(result, pick.stake, pick.odds) }
        log.push(`${result === 'win' ? '✅' : '❌'} ${pick.team} ML: ${awayTeam} ${awayScore} @ ${homeTeam} ${homeScore} → ${result.toUpperCase()}`)
      } else {
        log.push(`⏳ ${pick.game || pick.team} — not final yet`)
      }
    }

    // Grade hit parlay legs
    for (let i = 0; i < card.hitParlay.legs.length; i++) {
      const leg = card.hitParlay.legs[i]
      if (leg.result !== 'pending') continue
      log.push(`🎯 Checking hits: ${leg.player}`)
      // Find game for this player's team
      const game = findGame(games, leg.team)
      if (game && game.status?.detailedState === 'Final') {
        const box = await fetchBoxScore(game.gamePk)
        const allPlayers = [
          ...Object.values(box?.teams?.home?.players || {}),
          ...Object.values(box?.teams?.away?.players || {}),
        ]
        const playerName = leg.player?.toLowerCase()
        const playerData = allPlayers.find(p => p.person?.fullName?.toLowerCase().includes(playerName) || playerName.includes(p.person?.lastName?.toLowerCase()))
        if (playerData) {
          const hits = playerData.stats?.batting?.hits || 0
          const result = hits >= 1 ? 'win' : 'loss'
          updated.hitParlay.legs[i] = { ...updated.hitParlay.legs[i], result }
          log.push(`${result === 'win' ? '✅' : '❌'} ${leg.player}: ${hits} hits → ${result.toUpperCase()}`)
        } else {
          log.push(`⚠️ ${leg.player}: couldn't find in box score — grade manually`)
        }
      } else {
        log.push(`⏳ ${leg.player} game — not final yet`)
      }
    }

    // Recalc parlay result
    const allHitWin = updated.hitParlay.legs.every(l => l.result === 'win')
    const anyHitLoss = updated.hitParlay.legs.some(l => l.result === 'loss')
    if (allHitWin) { updated.hitParlay.result = 'win'; updated.hitParlay.pl = calcPL('win', updated.hitParlay.stake, '+350') }
    else if (anyHitLoss) { updated.hitParlay.result = 'loss'; updated.hitParlay.pl = -updated.hitParlay.stake }

    log.push('✅ Auto-grade complete')
    recalcTotal(updated)
    setGradeLog(log)
    setGrading(false)
  }

  const inp = (val, setter, placeholder, type = 'text') => (
    <input value={val} onChange={e => setter(e.target.value)} placeholder={placeholder} type={type}
      style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none', marginBottom:4 }} />
  )

  const sel = (val, setter, options) => (
    <select value={val} onChange={e => setter(e.target.value)}
      style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none', marginBottom:4 }}>
      {options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )

  const sectionBtn = (id, label) => (
    <button onClick={() => setActiveSection(id)} style={{
      flex:1, padding:'6px 4px', fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.62rem',
      fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', border:'1px solid',
      borderRadius:5, transition:'all .15s',
      background: activeSection===id ? '#1a1a30' : '#0c0c1a',
      color: activeSection===id ? '#f0f0f8' : '#404060',
      borderColor: activeSection===id ? '#2a2a50' : '#1a1a30',
    }}>{label}</button>
  )

  const addBtn = (label, onClick) => (
    <button onClick={onClick} style={{ width:'100%', padding:'7px', background:'#0c0c1a', border:'1px dashed #2a2a50', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:4 }}>{label}</button>
  )

  if (!card) return (
    <div style={{ padding:12 }}>
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:16, textAlign:'center', marginBottom:8 }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.4rem', color:'#505070', marginBottom:4 }}>No Active Card</div>
        <div style={{ fontSize:'.6rem', color:'#404060', marginBottom:12 }}>Start today's card to track picks and auto-grade results</div>
        <button onClick={() => setShowNewForm(true)} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff' }}>+ Start Today's Card</button>
      </div>
      {showNewForm && (
        <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
          <div style={{ fontSize:'.5rem', letterSpacing:'.1em', textTransform:'uppercase', color:'#404060', marginBottom:3 }}>Date</div>
          {inp(newCardDate, setNewCardDate, 'Jun 14')}
          <div style={{ fontSize:'.5rem', letterSpacing:'.1em', textTransform:'uppercase', color:'#404060', marginBottom:3 }}>Starting Bankroll ($)</div>
          {inp(newCardBR, setNewCardBR, '40.00', 'number')}
          <button onClick={startNewCard} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff', marginTop:4 }}>Create Card</button>
        </div>
      )}
    </div>
  )

  const totalStaked = (card.potd.stake||0) + card.rfi.reduce((a,r)=>a+(r.stake||0),0) + card.ml.reduce((a,m)=>a+(m.stake||0),0) + (card.hitParlay.stake||0) + (card.sgp.stake||0)

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

      {/* CARD HEADER */}
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', color:'#f0f0f8', lineHeight:1 }}>{card.date} · Card</div>
            <div style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:1 }}>Bankroll ${card.bankroll.toFixed(2)}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.3rem', lineHeight:1, color: card.totalPL >= 0 ? '#4ade80' : '#f87171' }}>
              {card.totalPL >= 0 ? '+' : ''}${card.totalPL.toFixed(2)}
            </div>
            <div style={{ fontSize:'.4rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060' }}>Total P&L · ${totalStaked.toFixed(0)} staked</div>
          </div>
        </div>

        {/* Section nav */}
        <div style={{ display:'flex', gap:3, marginBottom:8 }}>
          {sectionBtn('potd','🎯 POTD')}
          {sectionBtn('rfi','🎲 RFI')}
          {sectionBtn('ml','⚾ ML')}
          {sectionBtn('props','⚡ Props')}
        </div>

        {/* Auto grade button */}
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={autoGrade} disabled={grading} style={{
            flex:1, padding:'8px', background: grading ? '#1a1a30' : 'rgba(37,99,235,.2)',
            border:'1px solid #2563eb', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif",
            fontSize:'.72rem', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase',
            color: grading ? '#404060' : '#60a5fa',
          }}>{grading ? '⏳ Grading...' : '⚡ Auto Grade All'}</button>
          <button onClick={archiveCard} style={{
            padding:'8px 12px', background:'rgba(74,222,128,.08)', border:'1px solid #14532d',
            borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem',
            fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#4ade80',
          }}>Archive ✓</button>
        </div>
      </div>

      {/* GRADE LOG */}
      {gradeLog.length > 0 && (
        <div style={{ background:'#060610', border:'1px solid #1a1a30', borderRadius:8, padding:10 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.6rem', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'#404060', marginBottom:6 }}>Grade Log</div>
          {gradeLog.map((l, i) => <div key={i} style={{ fontSize:'.58rem', color:'#606080', lineHeight:1.8 }}>{l}</div>)}
          <button onClick={() => setGradeLog([])} style={{ background:'none', border:'none', color:'#404060', fontSize:'.52rem', marginTop:4 }}>Clear</button>
        </div>
      )}

      {/* ── POTD SECTION ── */}
      {activeSection === 'potd' && (
        <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:'#fbbf24', marginBottom:8 }}>🎯 Pick of the Day</div>

          {inp(card.potd.pick, v => save({...card, potd:{...card.potd, pick:v}}), 'ATL ML -116 · Pick name')}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, marginBottom:4 }}>
            {inp(card.potd.direction, v => save({...card, potd:{...card.potd, direction:v}}), 'Team abbr e.g. ATL')}
            {inp(card.potd.odds, v => save({...card, potd:{...card.potd, odds:v}}), 'Odds e.g. -116')}
            {inp(card.potd.stake, v => save({...card, potd:{...card.potd, stake:parseFloat(v)||0}}), 'Stake $', 'number')}
            {inp(card.potd.sources, v => save({...card, potd:{...card.potd, sources:v}}), 'Sources e.g. XGB+Con+LGB')}
          </div>

          <textarea value={card.potd.analysis} onChange={e => save({...card, potd:{...card.potd, analysis:e.target.value}})}
            placeholder="Analysis — pitcher ERAs, sharp money, key signals..."
            rows={3} style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.62rem', color:'#f0f0f8', outline:'none', resize:'none', marginBottom:8 }} />

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <ResultBadge result={card.potd.result} onClick={() => updatePOTD('result', cycleResult(card.potd.result))} />
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1rem', fontWeight:800, color: card.potd.pl >= 0 ? '#4ade80' : '#f87171' }}>
              {card.potd.pl >= 0 ? '+' : ''}${card.potd.pl.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* ── RFI SECTION ── */}
      {activeSection === 'rfi' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {card.rfi.map((pick, i) => (
            <div key={i} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color:'#f0f0f8' }}>{pick.game || 'RFI Pick'}</div>
                  <div style={{ fontSize:'.48rem', color:'#505070' }}>{pick.pick} · {pick.conf}% conf · ${pick.stake} staked</div>
                </div>
                <ResultBadge result={pick.result} onClick={() => updateRFI(i, 'result', cycleResult(pick.result))} small />
              </div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', color: pick.pl >= 0 ? '#4ade80' : '#f87171', textAlign:'right' }}>
                {pick.pl >= 0 ? '+' : ''}${pick.pl.toFixed(2)}
              </div>
            </div>
          ))}

          {addingRFI ? (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'#505070', marginBottom:8 }}>Add RFI Pick</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                {inp(rfiForm.game, v => setRfiForm(f=>({...f,game:v})), 'ATL @ CWS')}
                {inp(rfiForm.homeTeam, v => setRfiForm(f=>({...f,homeTeam:v})), 'Home abbr e.g. CWS')}
                {sel(rfiForm.pick, v => setRfiForm(f=>({...f,pick:v})), [['YRFI','YRFI'],['NRFI','NRFI']])}
                {inp(rfiForm.conf, v => setRfiForm(f=>({...f,conf:v})), 'Conf % e.g. 67.0')}
                {inp(rfiForm.stake, v => setRfiForm(f=>({...f,stake:v})), 'Stake $', 'number')}
              </div>
              <div style={{ display:'flex', gap:4, marginTop:4 }}>
                <button onClick={addRFI} style={{ flex:1, padding:7, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#fff' }}>Add</button>
                <button onClick={() => setAddingRFI(false)} style={{ flex:1, padding:7, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#505070' }}>Cancel</button>
              </div>
            </div>
          ) : addBtn('+ Add RFI Pick', () => setAddingRFI(true))}
        </div>
      )}

      {/* ── ML SECTION ── */}
      {activeSection === 'ml' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {card.ml.map((pick, i) => (
            <div key={i} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color:'#f0f0f8' }}>{pick.team || pick.game}</div>
                  <div style={{ fontSize:'.48rem', color:'#505070' }}>{pick.odds} · ${pick.stake} · {pick.sources}</div>
                </div>
                <ResultBadge result={pick.result} onClick={() => updateML(i, 'result', cycleResult(pick.result))} small />
              </div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', color: pick.pl >= 0 ? '#4ade80' : '#f87171', textAlign:'right' }}>
                {pick.pl >= 0 ? '+' : ''}${pick.pl.toFixed(2)}
              </div>
            </div>
          ))}

          {addingML ? (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'#505070', marginBottom:8 }}>Add ML Pick</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                {inp(mlForm.game, v => setMlForm(f=>({...f,game:v})), 'DET @ CLE')}
                {inp(mlForm.direction, v => setMlForm(f=>({...f,direction:v,team:v})), 'Team abbr e.g. DET')}
                {inp(mlForm.odds, v => setMlForm(f=>({...f,odds:v})), 'Odds e.g. +108')}
                {inp(mlForm.stake, v => setMlForm(f=>({...f,stake:v})), 'Stake $', 'number')}
                {inp(mlForm.sources, v => setMlForm(f=>({...f,sources:v})), 'Sources e.g. XGB+Con')}
              </div>
              <div style={{ display:'flex', gap:4, marginTop:4 }}>
                <button onClick={addML} style={{ flex:1, padding:7, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#fff' }}>Add</button>
                <button onClick={() => setAddingML(false)} style={{ flex:1, padding:7, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#505070' }}>Cancel</button>
              </div>
            </div>
          ) : addBtn('+ Add ML Pick', () => setAddingML(true))}
        </div>
      )}

      {/* ── PROPS SECTION ── */}
      {activeSection === 'props' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {/* Hit Parlay */}
          <div style={{ background:'#09090f', border:'1px solid #1a2a1a', borderRadius:10, padding:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'#4ade80' }}>⚡ Lazer Hit Parlay</div>
              <ResultBadge result={card.hitParlay.result} small />
            </div>

            {card.hitParlay.legs.map((leg, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'#0c0c1a', borderRadius:6, padding:'6px 10px', marginBottom:4 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'.65rem', fontWeight:700, color:'#f0f0f8' }}>{leg.player}</div>
                  <div style={{ fontSize:'.46rem', color:'#505070' }}>{leg.rate} · {leg.l10} · {leg.split}</div>
                </div>
                <ResultBadge result={leg.result} onClick={() => updateHitLeg(i, 'result', cycleResult(leg.result))} small />
              </div>
            ))}

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
              <div style={{ fontSize:'.52rem', color:'#505070' }}>${card.hitParlay.stake} staked</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color: card.hitParlay.pl >= 0 ? '#4ade80' : '#f87171' }}>
                {card.hitParlay.pl >= 0 ? '+' : ''}${card.hitParlay.pl.toFixed(2)}
              </div>
            </div>

            {addingHit ? (
              <div style={{ marginTop:8, borderTop:'1px solid #1a2a1a', paddingTop:8 }}>
                {inp(hitForm.player, v => setHitForm(f=>({...f,player:v})), 'Player name e.g. Josh Jung')}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
                  {inp(hitForm.rate, v => setHitForm(f=>({...f,rate:v})), '85%')}
                  {inp(hitForm.l10, v => setHitForm(f=>({...f,l10:v})), 'L10 9/10')}
                  {inp(hitForm.split, v => setHitForm(f=>({...f,split:v})), 'vsRHP .309')}
                </div>
                <div style={{ display:'flex', gap:4, marginTop:4 }}>
                  <button onClick={addHitLeg} style={{ flex:1, padding:7, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#fff' }}>Add Leg</button>
                  <button onClick={() => setAddingHit(false)} style={{ flex:1, padding:7, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#505070' }}>Cancel</button>
                </div>
              </div>
            ) : addBtn('+ Add Hit Leg', () => setAddingHit(true))}
          </div>
        </div>
      )}
    </div>
  )
}
