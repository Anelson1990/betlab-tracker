import { useState, useEffect } from 'react'
import { parseCardDate, gradeSharpPicks } from './mlbUtils'

const CARD_KEY = 'betlab-today-v3'
const SHARP_KEY = 'betlab-sharp-v2'

const C = {
  bg:'#07070f', card:'#0e0e1c', border:'#1a1a2e',
  accent:'#4ade80', gold:'#fbbf24', red:'#f87171',
  blue:'#60a5fa', purple:'#a78bfa', muted:'#1e1e30',
  text:'#e0e0f0', dim:'#5050a0',
}

const EMPTY = {
  date:'', bankroll:0,
  potd:null, rfi:[], sgp:null, ml:[], props:[], notes:''
}

const sColor = s => ({ win:C.accent, loss:C.red, void:C.dim, pending:C.gold }[s]||C.dim)
const sIcon  = s => ({ win:'✅', loss:'❌', void:'🔄', pending:'⏳' }[s]||'⏳')
const sLabel = s => ({ win:'WIN', loss:'LOSS', void:'VOID', pending:'PENDING' }[s]||'PENDING')
const plStr  = v => (v>=0?'+':'')+v.toFixed(2)
const plCol  = v => v>0?C.accent:v<0?C.red:C.dim

function Pill({ label, color }) {
  return (
    <span style={{ background:color+'20', color, fontSize:'.58rem', fontWeight:800,
      padding:'3px 8px', borderRadius:20, letterSpacing:'.1em', textTransform:'uppercase' }}>
      {label}
    </span>
  )
}

function BetRow({ bet, onGrade }) {
  const [open, setOpen] = useState(!!(bet.legs && bet.legs.length > 0))
  const pl = bet.status==='win'?(bet.payout||0):bet.status==='loss'?-(bet.stake||0):0

  return (
    <div style={{ background:C.muted, border:`1px solid ${C.border}`,
      borderLeft:`3px solid ${sColor(bet.status)}`,
      borderRadius:10, marginBottom:8, overflow:'hidden' }}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{ padding:'12px 14px', cursor:'pointer',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', gap:6, marginBottom:5, flexWrap:'wrap' }}>
            <Pill label={bet.type||'bet'} color={C.blue} />
            {bet.platform && <Pill label={bet.platform} color={C.purple} />}
            <Pill label={sLabel(bet.status)} color={sColor(bet.status)} />
          </div>
          <div style={{ color:C.text, fontWeight:700, fontSize:'.9rem' }}>
            {bet.pick||bet.game||'—'}
          </div>
          {bet.modelFire && (
            <div style={{ color:C.accent, fontSize:'.65rem', marginTop:3, fontWeight:600 }}>
              📊 {bet.modelFire}
            </div>
          )}
          {bet.odds && <div style={{ color:C.dim, fontSize:'.72rem', marginTop:2 }}>{bet.odds}</div>}
        </div>
        <div style={{ textAlign:'right', marginLeft:12 }}>
          <div style={{ color:C.text, fontWeight:800, fontSize:'1rem' }}>
            ${(bet.stake||0).toFixed(2)}
          </div>
          {bet.status!=='pending' && (
            <div style={{ color:plCol(pl), fontWeight:700, fontSize:'.85rem' }}>
              {plStr(pl)}
            </div>
          )}
          <div style={{ color:C.dim, fontSize:'.7rem', marginTop:2 }}>{open?'▲':'▼'}</div>
        </div>
      </div>

      {/* ALWAYS-VISIBLE GRADE BUTTONS */}
      {onGrade && (
        <div style={{ display:'flex', flexWrap:'wrap',
          gap:6, padding:'0 14px 12px' }}>
          {[
            { label:'✅', st:'win',  color:C.accent },
            { label:'❌', st:'loss', color:C.red },
            { label:'🔄', st:'void', color:C.dim },
          ].map(({ label, st, color }) => {
            const active = bet.status===st
            return (
              <button key={st} onClick={(e)=>{ e.stopPropagation(); onGrade(st) }}
                style={{ flex:'1 1 60px', padding:'9px 4px',
                  background:active?color:color+'15',
                  border:`2px solid ${active?color:color+'40'}`,
                  borderRadius:8,
                  color:active?'#000':color,
                  fontWeight:800, fontSize:'.8rem', cursor:'pointer',
                  boxShadow:active?`0 0 8px ${color}80`:'none',
                  transform:active?'scale(1.02)':'none' }}>
                {label}{active?' ✓':''}
              </button>
            )
          })}
          {bet.status!=='pending' && (
            <button onClick={(e)=>{ e.stopPropagation(); onGrade('pending') }}
              style={{ flex:'1 1 40px', padding:'9px 4px', background:C.gold+'15',
                border:`1px solid ${C.gold}40`, borderRadius:8,
                color:C.gold, fontWeight:700, fontSize:'.72rem', cursor:'pointer' }}>
              ↩
            </button>
          )}
          {bet.onPaperBet && bet.status==='pending' && (
            <button onClick={(e)=>{ e.stopPropagation(); bet.onPaperBet() }}
              style={{ flex:'1 1 40px', padding:'9px 4px', background:C.blue+'15',
                border:`1px solid ${C.blue}40`, borderRadius:8,
                color:C.blue, fontWeight:700, fontSize:'.72rem', cursor:'pointer' }}>
              📋
            </button>
          )}
          {bet.onDelete && (
            <button onClick={(e)=>{ e.stopPropagation(); bet.onDelete() }}
              style={{ flex:'1 1 40px', padding:'9px 4px', background:'transparent',
                border:`1px solid ${C.border}`, borderRadius:8,
                color:C.muted, fontWeight:700, fontSize:'.72rem', cursor:'pointer' }}>
              🗑
            </button>
          )}
        </div>
      )}

      {open && (
        <div style={{ padding:'0 14px 14px', borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, margin:'12px 0' }}>
            {[
              { label:'Stake',  val:'$'+(bet.stake||0).toFixed(2) },
              { label:'Odds',   val:bet.odds||'—' },
              { label:'Payout', val:'$'+(bet.payout||0).toFixed(2) },
            ].map(({ label, val }) => (
              <div key={label} style={{ background:C.bg, borderRadius:7, padding:'8px 6px', textAlign:'center' }}>
                <div style={{ color:C.dim, fontSize:'.55rem', letterSpacing:'.1em',
                  textTransform:'uppercase', marginBottom:2 }}>{label}</div>
                <div style={{ color:C.text, fontWeight:700, fontSize:'.85rem' }}>{val}</div>
              </div>
            ))}
          </div>

          {bet.legs && bet.legs.length > 0 && (
            <div style={{ marginBottom:10 }}>
              {bet.legs.map((leg,i) => (
                <div key={i} style={{ padding:'8px 0',
                  borderBottom:i<bet.legs.length-1?`1px solid ${C.border}`:'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'center', marginBottom:6 }}>
                    <span style={{ color:C.text, fontSize:'.75rem', flex:1, paddingRight:8 }}>
                      {sIcon(leg.result)} {leg.description||leg.player||leg.prop}
                    </span>
                    <span style={{ color:sColor(leg.result), fontSize:'.72rem', fontWeight:700 }}>
                      {sLabel(leg.result)}
                    </span>
                  </div>
                  {bet.onGradeLeg && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
                      {[
                        { label:'✅', st:'win',  color:C.accent },
                        { label:'❌', st:'loss', color:C.red },
                        { label:'🔄', st:'void', color:C.dim },
                      ].map(({ label, st, color }) => {
                        const active = leg.result===st
                        return (
                          <button key={st} onClick={(e)=>{ e.stopPropagation(); bet.onGradeLeg(i, st) }}
                            style={{ padding:'5px 4px',
                              background:active?color:color+'10',
                              border:`2px solid ${active?color:color+'40'}`, borderRadius:6,
                              color:active?'#000':color,
                              fontWeight:800, fontSize:'.7rem', cursor:'pointer',
                              boxShadow:active?`0 0 6px ${color}80`:'none' }}>
                            {label}{active?' ✓':''}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {bet.sources && (
            <div style={{ color:C.dim, fontSize:'.7rem', marginBottom:8,
              background:C.bg, borderRadius:6, padding:'8px 10px' }}>
              {bet.sources}
            </div>
          )}

          {bet.analysis && (
            <div style={{ color:C.text, fontSize:'.75rem', marginBottom:10, lineHeight:1.5 }}>
              {bet.analysis}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TodayCard({ accounts, adjustAccount }) {
  const [card, setCard]         = useState(EMPTY)
  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [pasteMode, setPasteMode] = useState(false)
  const [saved, setSaved]       = useState(false)
  const [grading, setGrading]   = useState(false)
  const [gradeLog, setGradeLog] = useState([])
  const [archiveConfirm, setArchiveConfirm] = useState(false)
  const [undoStack, setUndoStack] = useState([])
  const [offcardPaste, setOffcardPaste] = useState(false)
  const [offcardText, setOffcardText] = useState('')
  const [offcardError, setOffcardError] = useState('')
  const [offcardManual, setOffcardManual] = useState(false)
  const [offcardForm, setOffcardForm] = useState({ pick:'', odds:'-110', stake:'', payout:'', platform:'DK' })

  useEffect(() => {
    try {
      const s = localStorage.getItem(CARD_KEY)
      if (s) { const c = JSON.parse(s); if (c.date) setCard(c) }
    } catch {}
  }, [])

  const persist = (c, trackUndo=true) => {
    if (trackUndo) {
      setUndoStack(prev => [...prev.slice(-9), JSON.parse(JSON.stringify(card))])
    }
    setCard(c)
    try { localStorage.setItem(CARD_KEY, JSON.stringify(c)) } catch {}
  }

  const undo = () => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    setCard(prev)
    try { localStorage.setItem(CARD_KEY, JSON.stringify(prev)) } catch {}
  }

  // ── RULE #1 ENFORCEMENT ──
  const loadJSON = () => {
    try {
      const parsed = JSON.parse(jsonInput.trim())

      if (parsed.potd && parsed.potd.stake > 0) {
        if (!parsed.potd.modelFire || parsed.potd.modelFire.trim() === '') {
          setJsonError('🚨 RULE #1 — POTD missing modelFire. Add XGB/Consensus/LGB/MC confirmation or move to paper.')
          return
        }
        const mf = parsed.potd.modelFire.toUpperCase()
        if (!mf.includes('XGB') && !mf.includes('CONSENSUS') && !mf.includes('LGB') && !mf.includes('MC')) {
          setJsonError('🚨 RULE #1 — modelFire must reference a real model: XGB, Consensus, LGB, or MC.')
          return
        }
      }

      // Sportsbook-style: hold (deduct) every pending stake from its platform
      if (adjustAccount) {
        const holdBet = (b) => { if (b && b.stake > 0 && (b.status||'pending')==='pending') adjustAccount(b.platform||'dk', -(b.stake)) }
        if (parsed.potd) holdBet(parsed.potd)
        ;(parsed.rfi||[]).forEach(holdBet)
        ;(parsed.props||[]).forEach(holdBet)
        ;(parsed.offcard||[]).forEach(holdBet)
        if (parsed.sgp) holdBet(parsed.sgp)
      }

      persist(parsed)
      setJsonError('')
      setPasteMode(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { setJsonError('Invalid JSON — check format and try again') }
  }

  // ── GRADERS ──
  // Sportsbook-style account math for a status transition.
  // Stake is held (deducted) while pending. Win credits stake+profit. Push/void refunds stake.
  const acctDelta = (bet, oldStatus, newStatus) => {
    if (!adjustAccount || !bet || !(bet.stake > 0)) return
    const stake = bet.stake || 0
    const profit = bet.payout || 0
    // value returned to account for a given status (relative to money already held out)
    const credit = (st) => {
      if (st === 'win')  return stake + profit  // get stake back + winnings
      if (st === 'void') return stake           // refund stake (push)
      if (st === 'loss') return 0               // lose the held stake
      return 0                                   // pending = still held out
    }
    const delta = credit(newStatus) - credit(oldStatus)
    if (delta !== 0) adjustAccount(bet.platform || 'dk', delta)
  }

  const gradeItem = (type, idx, status) => {
    const c = JSON.parse(JSON.stringify(card))
    const item = c[type][idx]
    acctDelta(item, item.status || 'pending', status)
    const pl = status==='win'?(item.payout||0):status==='loss'?-(item.stake||0):0
    c[type][idx] = { ...item, status, pl }
    persist(c)
  }

  // ── OFF-CARD SLIP PARSER ──
  const parseOffcard = () => {
    const text = offcardText.trim()
    if (!text) { setOffcardError('Paste some bet slip text first'); return }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const oddsRe = /([+-]\d{3,4})\b/
    const moneyRe = /\$\s?(\d+(?:\.\d{1,2})?)/

    // Find odds (first +/- 3-4 digit number)
    let odds = ''
    for (const l of lines) {
      const m = l.match(oddsRe)
      if (m) { odds = m[1]; break }
    }

    // Find stake — look for "wager/risk/bet/stake" line, else first $ amount
    let stake = 0
    const stakeLine = lines.find(l => /(wager|risk|stake|bet amount)/i.test(l))
    if (stakeLine) {
      const m = stakeLine.match(moneyRe)
      if (m) stake = parseFloat(m[1])
    }

    // Find payout — "to pay/to win/returns/total payout"
    let payout = 0
    const payLine = lines.find(l => /(to pay|to win|return|payout|total payout)/i.test(l))
    if (payLine) {
      const m = payLine.match(moneyRe)
      if (m) payout = parseFloat(m[1])
    }

    // If we have payout as total return, convert to profit (subtract stake)
    let profit = payout
    if (payout && stake && payout > stake) profit = Math.round((payout - stake) * 100) / 100

    // If no stake found, grab any $ amounts — smallest is usually stake, largest is payout
    if (!stake) {
      const amounts = []
      for (const l of lines) {
        const m = l.match(moneyRe)
        if (m) amounts.push(parseFloat(m[1]))
      }
      if (amounts.length >= 2) {
        amounts.sort((a,b)=>a-b)
        stake = amounts[0]
        if (!profit) profit = Math.round((amounts[amounts.length-1] - stake) * 100) / 100
      } else if (amounts.length === 1) {
        stake = amounts[0]
      }
    }

    // Compute profit from odds if still missing
    if (!profit && stake && odds) {
      const o = parseInt(odds)
      profit = o > 0 ? stake * (o/100) : stake / (Math.abs(o)/100)
      profit = Math.round(profit * 100) / 100
    }

    // Pick name = the most "wordy" line (most letters, least likely to be a number/label)
    let pick = ''
    let bestScore = 0
    for (const l of lines) {
      if (/(wager|risk|stake|to pay|to win|return|payout|odds|bet ?slip|cash ?out|total)/i.test(l)) continue
      const letters = (l.match(/[a-zA-Z]/g)||[]).length
      if (letters > bestScore) { bestScore = letters; pick = l }
    }
    // Clean odds/$ out of pick
    pick = pick.replace(oddsRe,'').replace(/\$\s?[\d.]+/g,'').replace(/\s{2,}/g,' ').trim()

    if (!pick) { setOffcardError('Could not find a pick name. Use + ADD MANUALLY instead.'); return }

    const bet = { pick, odds, stake, payout:profit, platform:'DK', status:'pending', pl:0, notes:'parsed from slip' }
    if (adjustAccount && stake > 0) adjustAccount('DK', -stake)
    const c = JSON.parse(JSON.stringify(card))
    c.offcard = [...(c.offcard||[]), bet]
    persist(c)
    setOffcardText('')
    setOffcardError('')
    setOffcardPaste(false)
  }

  const saveOffcardManual = () => {
    const f = offcardForm
    if (!f.pick.trim()) { setOffcardError('Enter a pick name'); return }
    const stake = parseFloat(f.stake) || 0
    let payout = parseFloat(f.payout) || 0
    // compute payout from odds if blank
    if (!payout && stake && f.odds) {
      const o = parseInt(f.odds)
      payout = o > 0 ? stake*(o/100) : stake/(Math.abs(o)/100)
      payout = Math.round(payout*100)/100
    }
    const bet = { pick:f.pick.trim(), odds:f.odds, stake, payout, platform:f.platform, status:'pending', pl:0, notes:'' }
    if (adjustAccount && stake > 0) adjustAccount(f.platform, -stake)
    const c = JSON.parse(JSON.stringify(card))
    c.offcard = [...(c.offcard||[]), bet]
    persist(c)
    setOffcardForm({ pick:'', odds:'-110', stake:'', payout:'', platform:'DK' })
    setOffcardManual(false)
    setOffcardError('')
  }

  const gradeSgp = (status) => {
    acctDelta(card.sgp, card.sgp.status || 'pending', status)
    const pl = status==='win'?(card.sgp.payout||0):status==='loss'?-(card.sgp.stake||0):0
    persist({ ...card, sgp:{ ...card.sgp, status, pl } })
  }

  const gradePaper = (idx, result) => {
    const c = JSON.parse(JSON.stringify(card))
    c.ml[idx].result = result
    persist(c)
  }

  // ── AUTO GRADE ──
  const autoGrade = async () => {
    if (!card.date) return
    setGrading(true)
    const log = []
    const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
      Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
    const parts = card.date.trim().split(' ')
    const dateStr = `2026-${months[parts[0]]||'06'}-${(parts[1]||'01').padStart(2,'0')}`

    log.push('🔄 Fetching games for ' + card.date + '...')
    try {
      const res = await fetch('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date='+dateStr+'&hydrate=linescore,team')
      const games = (await res.json())?.dates?.[0]?.games || []
      log.push('✅ Found ' + games.length + ' games')

      const findGame = (str) => {
        if (!str) return null
        const t = str.toUpperCase().trim()
        return games.find(g => {
          const h = (g.teams?.home?.team?.abbreviation||'').toUpperCase()
          const a = (g.teams?.away?.team?.abbreviation||'').toUpperCase()
          const hn = (g.teams?.home?.team?.teamName||'').toUpperCase()
          const an = (g.teams?.away?.team?.teamName||'').toUpperCase()
          const hfn = (g.teams?.home?.team?.name||'').toUpperCase()
          const afn = (g.teams?.away?.team?.name||'').toUpperCase()
          return h===t||a===t||hn.includes(t)||an.includes(t)||hfn.includes(t)||afn.includes(t)
        })
      }

      const getResult = (game, direction) => {
        if (!game) return null
        const st = (game.status?.detailedState||'').toLowerCase()
        if (!st.includes('final')) return 'pending'
        const hs = game.teams?.home?.score
        const as = game.teams?.away?.score
        if (hs===undefined||as===undefined) return null
        const d = (direction||'').toUpperCase()
        const h = (game.teams?.home?.team?.abbreviation||'').toUpperCase()
        const a = (game.teams?.away?.team?.abbreviation||'').toUpperCase()
        const hn = (game.teams?.home?.team?.name||'').toUpperCase()
        const an = (game.teams?.away?.team?.name||'').toUpperCase()
        const isHome = h===d||hn.includes(d)
        const isAway = a===d||an.includes(d)
        if (isHome) return hs > as ? 'win' : 'loss'
        if (isAway) return as > hs ? 'win' : 'loss'
        return null
      }

      const updated = JSON.parse(JSON.stringify(card))

      // Grade POTD
      if (updated.potd?.stake > 0 && updated.potd?.status === 'pending') {
        const g = findGame(updated.potd.direction || updated.potd.pick?.split(' ')[0])
        const r = getResult(g, updated.potd.direction || updated.potd.pick?.split(' ')[0])
        if (r && r !== 'pending') {
          updated.potd.status = r
          updated.potd.pl = r==='win'?(updated.potd.payout||0):-(updated.potd.stake||0)
          log.push((r==='win'?'✅':'❌') + ' POTD ' + updated.potd.pick + ' → ' + r.toUpperCase())
        } else {
          log.push('⏳ POTD ' + updated.potd.pick + ': not final yet')
        }
      }

      // Grade RFI
      ;(updated.rfi||[]).forEach((b, i) => {
        if (b.stake > 0 && b.status === 'pending') {
          const parts = b.game?.split('@') || b.game?.split('vs') || []
          const g = findGame(parts[0]?.trim()) || findGame(parts[1]?.trim())
          if (!g) { log.push('⏳ RFI ' + b.game + ': game not found'); return }
          const st = (g.status?.detailedState||'').toLowerCase()
          if (!st.includes('final')) { log.push('⏳ RFI ' + b.game + ': not final yet'); return }
          const i1h = g.linescore?.innings?.[0]?.home?.runs ?? null
          const i1a = g.linescore?.innings?.[0]?.away?.runs ?? null
          const scored = i1h !== null && i1a !== null ? (i1h + i1a) > 0 : (g.teams?.home?.score||0)+(g.teams?.away?.score||0) > 0
          const r = b.pick==='YRFI' ? (scored?'win':'loss') : (!scored?'win':'loss')
          updated.rfi[i].status = r
          updated.rfi[i].pl = r==='win'?(b.payout||0):-(b.stake||0)
          log.push((r==='win'?'✅':'❌') + ' RFI ' + b.pick + ' ' + b.game + ' → ' + r.toUpperCase())
        }
      })

      // Grade SGP
      if (updated.sgp?.stake > 0 && updated.sgp?.status === 'pending') {
        log.push('⏳ SGP: grade manually — multi-leg')
      }

      // Grade paper picks
      ;(updated.ml||[]).forEach((b, i) => {
        if (!b.result || b.result === 'pending') {
          const g = findGame(b.direction)
          const r = getResult(g, b.direction)
          if (r && r !== 'pending') {
            updated.ml[i].result = r
            log.push((r==='win'?'✅':'❌') + ' Paper ' + b.direction + ' ' + b.game + ' → ' + r.toUpperCase())
          } else {
            log.push('⏳ Paper ' + (b.direction||'') + ' ' + (b.game||'') + ': not final yet')
          }
        }
      })

      persist(updated)
      log.push('✅ Auto-grade complete')
    } catch (e) {
      log.push('❌ Error: ' + e.message)
    }
    setGradeLog(log)
    setGrading(false)
  }

  // ── TOTALS ──
  const allBets = [
    ...(card.rfi||[]).filter(b=>b.stake>0),
    ...(card.props||[]).filter(b=>b.stake>0),
    ...(card.offcard||[]).filter(b=>b.stake>0),
    ...(card.sgp?.stake>0 ? [card.sgp] : []),
    ...(card.potd?.stake>0 ? [card.potd] : []),
  ]
  const totalStaked = allBets.reduce((s,b)=>s+(b.stake||0),0)
  const totalPL     = allBets.reduce((s,b)=>s+(b.pl||0),0)
  const isEmpty = !card.date

  const acctTotal = (accounts?.dk||0)+(accounts?.b365||0)+(accounts?.pp||0) || card.bankroll || 185.90

  return (
    <div>
      {/* HEADER */}
      <div style={{ background:'linear-gradient(135deg,#0a0a18,#0e0e22)',
        border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.8rem',
                letterSpacing:'.12em', background:`linear-gradient(135deg,${C.accent},${C.blue})`,
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1 }}>
                BETLAB
              </div>
              {card.date && (
                <span style={{ background:C.accent+'20', color:C.accent, fontSize:'.6rem',
                  fontWeight:800, padding:'3px 8px', borderRadius:20, letterSpacing:'.1em' }}>
                  {card.date} · TODAY
                </span>
              )}
            </div>
            <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.15em', textTransform:'uppercase' }}>
              Nelson · BetLab v3.1 · grade-fix
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'1.5rem', fontWeight:800, color:C.accent,
              fontFamily:"'Bebas Neue',sans-serif", letterSpacing:'.05em' }}>
              ${acctTotal.toFixed(2)}
            </div>
            <div style={{ color:C.dim, fontSize:'.6rem' }}>
              DK ${accounts?.dk||0} · B365 ${accounts?.b365||0} · PP ${accounts?.pp||0}
            </div>
            {totalStaked > 0 && (
              <div style={{ color:plCol(totalPL), fontSize:'.75rem', fontWeight:700, marginTop:2 }}>
                {plStr(totalPL)} today
              </div>
            )}
          </div>
        </div>

        {card.bankroll > 0 && (
          <div style={{ marginTop:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between',
              fontSize:'.6rem', color:C.dim, marginBottom:4 }}>
              <span>Goal: $300</span>
              <span>{Math.round((card.bankroll/300)*100)}%</span>
            </div>
            <div style={{ background:C.muted, borderRadius:10, height:4 }}>
              <div style={{ background:`linear-gradient(90deg,${C.accent},${C.blue})`,
                width:Math.min((card.bankroll/300)*100,100)+'%',
                height:'100%', borderRadius:10 }} />
            </div>
          </div>
        )}
      </div>

      {/* PASTE / DELETE BUTTONS */}
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        <button onClick={()=>setPasteMode(p=>!p)}
          style={{ flex:1, padding:11,
            background:pasteMode?C.accent+'15':'transparent',
            border:`1px solid ${pasteMode?C.accent:C.border}`,
            borderRadius:9, color:pasteMode?C.accent:C.dim,
            fontWeight:700, fontSize:'.75rem', cursor:'pointer',
            letterSpacing:'.08em', textTransform:'uppercase' }}>
          {pasteMode ? '✕ Cancel' : "📋 Paste Today's JSON"}
        </button>
        {undoStack.length > 0 && (
          <button onClick={undo}
            style={{ padding:'11px 14px', background:C.gold+'15',
              border:`1px solid ${C.gold}40`, borderRadius:9,
              color:C.gold, fontWeight:700, fontSize:'.75rem', cursor:'pointer' }}>
            ↩ Undo
          </button>
        )}
        {!isEmpty && (
          <button onClick={()=>{ if(window.confirm('Clear today\'s card?')){ persist(EMPTY); setGradeLog([]) } }}
            style={{ padding:'11px 14px', background:C.red+'10',
              border:`1px solid ${C.red}30`, borderRadius:9,
              color:C.red, fontWeight:700, fontSize:'.75rem', cursor:'pointer' }}>
            🗑
          </button>
        )}
      </div>

      {pasteMode && (
        <div style={{ marginBottom:12 }}>
          <textarea value={jsonInput} onChange={e=>setJsonInput(e.target.value)}
            placeholder="Paste today's JSON from Claude..."
            style={{ width:'100%', minHeight:120, background:C.muted,
              border:`1px solid ${C.border}`, borderRadius:8, padding:10,
              color:C.text, fontSize:'.75rem', fontFamily:'monospace',
              resize:'vertical', boxSizing:'border-box' }} />
          {jsonError && (
            <div style={{ color:C.red, fontSize:'.72rem', marginTop:4, fontWeight:600 }}>
              {jsonError}
            </div>
          )}
          <button onClick={loadJSON}
            style={{ width:'100%', padding:12, marginTop:8,
              background:`linear-gradient(135deg,${C.accent},#22c55e)`,
              border:'none', borderRadius:8, color:'#000',
              fontWeight:800, fontSize:'.85rem', cursor:'pointer', marginBottom:6 }}>
            ⚡ LOAD CARD
          </button>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            <button onClick={()=>{
              try {
                const j = JSON.parse(jsonInput)
                const paperCard = JSON.parse(JSON.stringify(j))
                paperCard.ml = paperCard.ml || []
                paperCard.ml.push({
                  game: "Paper bet",
                  direction: "DIRECTION",
                  odds: "-110",
                  sources: "Notes here",
                  result: "pending"
                })
                setJsonInput(JSON.stringify(paperCard, null, 2))
              } catch { alert('Invalid JSON') }
            }}
              style={{ padding:10, background:C.blue+'15',
                border:`1px solid ${C.blue}40`, borderRadius:8,
                color:C.blue, fontWeight:700, fontSize:'.75rem', cursor:'pointer' }}>
              📋 ADD PAPER BET
            </button>
            <button onClick={()=>{
              try {
                const j = JSON.parse(jsonInput)
                if (j.ml && j.ml.length > 0) {
                  j.ml.pop()
                  setJsonInput(JSON.stringify(j, null, 2))
                } else {
                  alert('No paper bets to delete')
                }
              } catch { alert('Invalid JSON') }
            }}
              style={{ padding:10, background:C.red+'15',
                border:`1px solid ${C.red}40`, borderRadius:8,
                color:C.red, fontWeight:700, fontSize:'.75rem', cursor:'pointer' }}>
              🗑 DELETE LAST BET
            </button>
          </div>
        </div>
      )}

      {saved && (
        <div style={{ background:C.accent+'15', border:`1px solid ${C.accent}40`,
          borderRadius:8, padding:10, textAlign:'center',
          color:C.accent, fontSize:'.8rem', fontWeight:700, marginBottom:10 }}>
          ✅ Card loaded successfully
        </div>
      )}

      {isEmpty && !pasteMode && (
        <div style={{ textAlign:'center', padding:'40px 0', color:C.dim }}>
          <div style={{ fontSize:'2.5rem', marginBottom:10 }}>🎯</div>
          <div style={{ fontSize:'.85rem', color:C.text, marginBottom:6 }}>No card loaded yet</div>
          <div style={{ fontSize:'.75rem' }}>Paste today's JSON from Claude to get started</div>
        </div>
      )}

      {!isEmpty && (
        <div>
          {/* POTD */}
          {card.potd?.stake > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.gold, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>🎯 PICK OF THE DAY</div>
              <BetRow
                bet={{ ...card.potd, type:'POTD', platform:card.potd.platform||'DK',
                  onDelete:()=>{ const c=JSON.parse(JSON.stringify(card)); if (adjustAccount && c.potd?.stake>0 && (c.potd?.status||'pending')==='pending') adjustAccount(c.potd.platform||'dk', c.potd.stake); c.potd=null; persist(c) },
                  onPaperBet:()=>{
                    const c=JSON.parse(JSON.stringify(card))
                    if (adjustAccount && c.potd.stake>0 && (c.potd.status||'pending')==='pending') adjustAccount(c.potd.platform||'dk', c.potd.stake)
                    c.ml=c.ml||[]
                    c.ml.push({ game:c.potd.game||'', direction:c.potd.pick, odds:c.potd.odds||'', sources:c.potd.notes||'', result:'pending' })
                    c.potd=null
                    persist(c)
                  } }}
                onGrade={(st) => {
                  acctDelta(card.potd, card.potd.status || 'pending', st)
                  const pl = st==='win'?(card.potd.payout||0):st==='loss'?-(card.potd.stake||0):0
                  persist({ ...card, potd:{ ...card.potd, status:st, pl } })
                }}
              />
            </div>
          )}

          {/* RFI */}
          {(card.rfi||[]).filter(b=>b.stake>0).length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                  textTransform:'uppercase' }}>🎲 RFI</div>
                <button onClick={()=>{
                  const c = JSON.parse(JSON.stringify(card))
                  c.rfi = c.rfi || []
                  c.rfi.push({ game:"", pick:"YRFI", conf:"60%", stake:0, payout:0, platform:"DK", status:"pending", pl:0, notes:"" })
                  persist(c)
                }}
                  style={{ padding:'4px 8px', background:C.blue+'15',
                    border:`1px solid ${C.blue}40`, borderRadius:6,
                    color:C.blue, fontWeight:700, fontSize:'.6rem', cursor:'pointer' }}>
                  + PAPER BET
                </button>
              </div>
              {card.rfi.filter(b=>b.stake>0).map((b,i) => (
                <BetRow key={i}
                  bet={{ ...b, pick:`${b.pick} — ${b.game}`, type:'RFI', platform:b.platform||'DK',
                    onDelete:()=>{
                      const c=JSON.parse(JSON.stringify(card))
                      if (adjustAccount && b.stake>0 && (b.status||'pending')==='pending') adjustAccount(b.platform||'dk', b.stake)
                      c.rfi.splice(i,1); persist(c)
                    },
                    onPaperBet:()=>{
                      const c=JSON.parse(JSON.stringify(card))
                      if (adjustAccount && b.stake>0 && (b.status||'pending')==='pending') adjustAccount(b.platform||'dk', b.stake)
                      c.ml=c.ml||[]
                      c.ml.push({ game:b.game, direction:b.pick, odds:b.conf||'', sources:b.notes||'', result:'pending' })
                      c.rfi.splice(i,1)
                      persist(c)
                    } }}
                  onGrade={st=>gradeItem('rfi',i,st)}
                />
              ))}
            </div>
          )}

          {/* SGP */}
          {card.sgp?.stake > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>⚡ SGP / PARLAY</div>
              <BetRow
                bet={{ ...card.sgp, type:'SGP',
                  pick:card.sgp.pick||((card.sgp.legs?.length||0)+'-Leg SGP'),
                  platform:card.sgp.platform||'B365',
                  onDelete:()=>{ const c=JSON.parse(JSON.stringify(card)); c.sgp=null; persist(c) },
                  onGradeLeg:(legIdx, st)=>{
                    const c=JSON.parse(JSON.stringify(card))
                    c.sgp.legs[legIdx].result = st
                    persist(c)
                  } }}
                onGrade={gradeSgp}
              />
            </div>
          )}

          {/* Props */}
          {(card.props||[]).filter(b=>b.stake>0).length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                  textTransform:'uppercase' }}>⚾ PROPS</div>
                <button onClick={()=>{
                  const c = JSON.parse(JSON.stringify(card))
                  c.props = c.props || []
                  c.props.push({ pick:"", stake:0, payout:0, platform:"PP", status:"pending", pl:0, notes:"" })
                  persist(c)
                }}
                  style={{ padding:'4px 8px', background:C.blue+'15',
                    border:`1px solid ${C.blue}40`, borderRadius:6,
                    color:C.blue, fontWeight:700, fontSize:'.6rem', cursor:'pointer' }}>
                  + PAPER BET
                </button>
              </div>
              {card.props.filter(b=>b.stake>0).map((b,i) => (
                <BetRow key={i}
                  bet={{ ...b, type:'Props', platform:b.platform||'PP',
                    onDelete:()=>{
                      const c=JSON.parse(JSON.stringify(card))
                      if (adjustAccount && b.stake>0 && (b.status||'pending')==='pending') adjustAccount(b.platform||'pp', b.stake)
                      c.props.splice(i,1); persist(c)
                    },
                    onPaperBet:()=>{
                      const c=JSON.parse(JSON.stringify(card))
                      if (adjustAccount && b.stake>0 && (b.status||'pending')==='pending') adjustAccount(b.platform||'pp', b.stake)
                      c.ml=c.ml||[]
                      c.ml.push({ game:'', direction:b.pick, odds:'', sources:b.notes||'', result:'pending' })
                      c.props.splice(i,1)
                      persist(c)
                    } }}
                  onGrade={st=>gradeItem('props',i,st)}
                />
              ))}
            </div>
          )}

          {/* Paper picks */}
          <div style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase' }}>📋 PAPER PICKS</div>
              <button onClick={()=>{
                const c = JSON.parse(JSON.stringify(card))
                c.ml = c.ml || []
                c.ml.push({ game:"", direction:"", odds:"-110", sources:"", result:"pending" })
                persist(c)
              }}
                style={{ padding:'4px 8px', background:C.blue+'15',
                  border:`1px solid ${C.blue}40`, borderRadius:6,
                  color:C.blue, fontWeight:700, fontSize:'.6rem', cursor:'pointer' }}>
                + PAPER BET
              </button>
            </div>
            {(card.ml||[]).length > 0 ? (
              card.ml.map((b,i) => (
                <div key={i} style={{ background:C.muted, border:`1px solid ${C.border}`,
                  borderLeft:`3px solid ${sColor(b.result||'pending')}`,
                  borderRadius:8, padding:'10px 12px', marginBottom:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ color:C.text, fontSize:'.78rem', fontWeight:600 }}>
                        {b.direction} {b.game}
                      </div>
                      <div style={{ color:C.dim, fontSize:'.65rem', marginTop:2 }}>{b.sources}</div>
                      <div style={{ color:C.blue, fontWeight:700, fontSize:'.75rem', marginTop:2 }}>{b.odds}</div>
                    </div>
                    <div style={{ display:'flex', gap:4, marginLeft:8 }}>
                      {['win','loss','void'].map(st => (
                        <button key={st} onClick={()=>gradePaper(i,st)}
                          style={{ padding:'5px 7px', borderRadius:6, border:'none',
                            background:b.result===st?(st==='win'?C.accent:st==='loss'?C.red:C.dim)+'30':'transparent',
                            color:b.result===st?(st==='win'?C.accent:st==='loss'?C.red:C.dim):C.muted,
                            fontSize:'.7rem', cursor:'pointer', fontWeight:700 }}>
                          {st==='win'?'✅':st==='loss'?'❌':'🔄'}
                        </button>
                      ))}
                      <button onClick={()=>{
                        const c = JSON.parse(JSON.stringify(card))
                        c.ml.splice(i,1)
                        persist(c)
                      }}
                        style={{ padding:'5px 7px', borderRadius:6, border:'none',
                          background:'transparent', color:C.muted,
                          fontSize:'.7rem', cursor:'pointer', fontWeight:700 }}>
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color:C.dim, fontSize:'.7rem', textAlign:'center', padding:'10px 0' }}>
                No paper picks yet — tap + PAPER BET to add one
              </div>
            )}
          </div>

          {/* Off-card bets */}
          <div style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ color:C.gold, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase' }}>🎰 OFF-CARD BETS</div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={()=>{ setOffcardPaste(p=>!p); setOffcardManual(false) }}
                  style={{ padding:'4px 8px', background:C.gold+'15',
                    border:`1px solid ${C.gold}40`, borderRadius:6,
                    color:C.gold, fontWeight:700, fontSize:'.6rem', cursor:'pointer' }}>
                  📸 PARSE
                </button>
                <button onClick={()=>{ setOffcardManual(m=>!m); setOffcardPaste(false) }}
                  style={{ padding:'4px 8px', background:C.gold+'15',
                    border:`1px solid ${C.gold}40`, borderRadius:6,
                    color:C.gold, fontWeight:700, fontSize:'.6rem', cursor:'pointer' }}>
                  ✏️ ADD
                </button>
              </div>
            </div>

            {offcardPaste && (
              <div style={{ marginBottom:8 }}>
                <textarea value={offcardText} onChange={e=>setOffcardText(e.target.value)}
                  placeholder="Paste bet slip text from screenshot here... e.g. 'Aaron Judge O1.5 hits -120 $10'"
                  style={{ width:'100%', minHeight:70, background:C.bg,
                    border:`1px solid ${C.gold}40`, borderRadius:8, color:C.text,
                    padding:10, fontSize:'.72rem', fontFamily:'monospace', resize:'vertical' }} />
                <button onClick={parseOffcard}
                  style={{ width:'100%', padding:10, marginTop:6,
                    background:`linear-gradient(135deg,${C.gold},#d97706)`,
                    border:'none', borderRadius:8, color:'#000',
                    fontWeight:800, fontSize:'.78rem', cursor:'pointer' }}>
                  ⚡ PARSE BETS
                </button>
                {offcardError && (
                  <div style={{ color:C.red, fontSize:'.65rem', marginTop:4 }}>{offcardError}</div>
                )}
              </div>
            )}

            {offcardManual && (
              <div style={{ marginBottom:8, background:C.bg,
                border:`1px solid ${C.gold}40`, borderRadius:8, padding:10 }}>
                <input value={offcardForm.pick}
                  onChange={e=>setOffcardForm(f=>({...f,pick:e.target.value}))}
                  placeholder="Pick — e.g. Athletics Live 1st 5 Innings"
                  style={{ width:'100%', background:C.muted, border:`1px solid ${C.border}`,
                    borderRadius:6, color:C.text, padding:9, fontSize:'.78rem', marginBottom:6 }} />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                  <input value={offcardForm.odds}
                    onChange={e=>setOffcardForm(f=>({...f,odds:e.target.value}))}
                    placeholder="Odds +180"
                    style={{ background:C.muted, border:`1px solid ${C.border}`,
                      borderRadius:6, color:C.text, padding:9, fontSize:'.78rem' }} />
                  <select value={offcardForm.platform}
                    onChange={e=>setOffcardForm(f=>({...f,platform:e.target.value}))}
                    style={{ background:C.muted, border:`1px solid ${C.border}`,
                      borderRadius:6, color:C.text, padding:9, fontSize:'.78rem' }}>
                    <option value="DK">DK</option>
                    <option value="B365">B365</option>
                    <option value="PP">PP</option>
                    <option value="FD">FD</option>
                    <option value="MGM">MGM</option>
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
                  <input value={offcardForm.stake} type="number" inputMode="decimal"
                    onChange={e=>setOffcardForm(f=>({...f,stake:e.target.value}))}
                    placeholder="Stake $"
                    style={{ background:C.muted, border:`1px solid ${C.border}`,
                      borderRadius:6, color:C.text, padding:9, fontSize:'.78rem' }} />
                  <input value={offcardForm.payout} type="number" inputMode="decimal"
                    onChange={e=>setOffcardForm(f=>({...f,payout:e.target.value}))}
                    placeholder="To win $ (auto)"
                    style={{ background:C.muted, border:`1px solid ${C.border}`,
                      borderRadius:6, color:C.text, padding:9, fontSize:'.78rem' }} />
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={saveOffcardManual}
                    style={{ flex:1, padding:10,
                      background:`linear-gradient(135deg,${C.gold},#d97706)`,
                      border:'none', borderRadius:8, color:'#000',
                      fontWeight:800, fontSize:'.78rem', cursor:'pointer' }}>
                    ✅ ADD BET
                  </button>
                  <button onClick={()=>{ setOffcardManual(false); setOffcardError('') }}
                    style={{ padding:'10px 14px', background:'transparent',
                      border:`1px solid ${C.border}`, borderRadius:8,
                      color:C.dim, fontWeight:700, fontSize:'.78rem', cursor:'pointer' }}>
                    Cancel
                  </button>
                </div>
                {offcardError && (
                  <div style={{ color:C.red, fontSize:'.65rem', marginTop:6 }}>{offcardError}</div>
                )}
              </div>
            )}

            {(card.offcard||[]).length > 0 ? (
              card.offcard.map((b,i) => (
                <BetRow key={i}
                  bet={{ ...b, type:'Off-Card', platform:b.platform||'DK',
                    onDelete:()=>{
                      const c=JSON.parse(JSON.stringify(card))
                      if (adjustAccount && b.stake>0 && (b.status||'pending')==='pending') adjustAccount(b.platform||'dk', b.stake)
                      c.offcard.splice(i,1); persist(c)
                    } }}
                  onGrade={st=>gradeItem('offcard',i,st)}
                />
              ))
            ) : (!offcardPaste && !offcardManual) && (
              <div style={{ color:C.dim, fontSize:'.7rem', textAlign:'center', padding:'10px 0' }}>
                No off-card bets — 📸 PARSE a slip or ✏️ ADD manually
              </div>
            )}
          </div>
          <button onClick={autoGrade} disabled={grading}
            style={{ width:'100%', padding:12, marginBottom:10,
              background:grading?C.muted:`linear-gradient(135deg,${C.blue},#2563eb)`,
              border:'none', borderRadius:10, color:'#fff',
              fontWeight:800, fontSize:'.85rem',
              cursor:grading?'not-allowed':'pointer', letterSpacing:'.05em' }}>
            {grading ? '🔄 GRADING...' : '⚡ AUTO GRADE CARD'}
          </button>

          {/* Grade Log */}
          {gradeLog.length > 0 && (
            <div style={{ background:C.bg, border:`1px solid ${C.border}`,
              borderRadius:10, padding:12, marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between',
                alignItems:'center', marginBottom:8 }}>
                <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.1em',
                  textTransform:'uppercase' }}>Grade Log</div>
                <button onClick={()=>setGradeLog([])}
                  style={{ background:'none', border:'none',
                    color:C.dim, fontSize:'.65rem', cursor:'pointer' }}>Clear</button>
              </div>
              {gradeLog.map((l,i) => (
                <div key={i} style={{
                  color:l.startsWith('✅')?C.accent:l.startsWith('❌')?C.red:l.startsWith('⏳')?C.gold:C.dim,
                  fontSize:'.72rem', marginBottom:3, lineHeight:1.4 }}>{l}</div>
              ))}
            </div>
          )}

          {/* Session Summary + Archive */}
          {true && (
            <div style={{ background:'linear-gradient(135deg,#0a0a18,#0e0e22)',
              border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:10 }}>Session Summary</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                {[
                  { label:'Staked', val:'$'+totalStaked.toFixed(2), color:C.text },
                  { label:'P&L',    val:plStr(totalPL),             color:plCol(totalPL) },
                  { label:'Bets',   val:allBets.length,             color:C.blue },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background:C.bg, borderRadius:8,
                    padding:'10px 6px', textAlign:'center' }}>
                    <div style={{ color:C.dim, fontSize:'.55rem', letterSpacing:'.1em',
                      textTransform:'uppercase', marginBottom:3 }}>{label}</div>
                    <div style={{ color, fontWeight:800, fontSize:'1rem' }}>{val}</div>
                  </div>
                ))}
              </div>
              {card.notes && (
                <div style={{ color:C.dim, fontSize:'.7rem', marginTop:10,
                  lineHeight:1.5, borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
                  {card.notes}
                </div>
              )}

              {/* ARCHIVE BUTTON */}
              {!archiveConfirm ? (
                <button onClick={()=>setArchiveConfirm(true)}
                  style={{ width:'100%', padding:13, marginTop:12,
                    background:`linear-gradient(135deg,${C.gold},#d97706)`,
                    border:'none', borderRadius:10, color:'#000',
                    fontWeight:800, fontSize:'.9rem', cursor:'pointer',
                    letterSpacing:'.05em' }}>
                  🗂 ARCHIVE DAY TO HISTORY
                </button>
              ) : (
                <div style={{ marginTop:12 }}>
                  <div style={{ color:C.gold, fontSize:'.75rem', textAlign:'center',
                    marginBottom:8, fontWeight:700 }}>
                    Archive {card.date} to history?
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <button onClick={async ()=>{
                      const rfiW = (card.rfi||[]).filter(b=>b.status==='win').length
                      const rfiL = (card.rfi||[]).filter(b=>b.status==='loss').length
                      const rfiN = (card.rfi||[]).filter(b=>b.stake>0).length
                      const mlW  = (card.ml||[]).filter(b=>b.result==='win').length
                      const mlL  = (card.ml||[]).filter(b=>b.result==='loss').length
                      const allPL = [
                        ...(card.rfi||[]).filter(b=>b.stake>0).map(b=>b.pl||0),
                        ...(card.props||[]).filter(b=>b.stake>0).map(b=>b.pl||0),
                        card.sgp?.stake>0 ? (card.sgp.pl||0) : 0,
                        card.potd?.stake>0 ? (card.potd.pl||0) : 0,
                      ].reduce((s,v)=>s+v,0)
                      const totalS = [
                        ...(card.rfi||[]).filter(b=>b.stake>0).map(b=>b.stake||0),
                        ...(card.props||[]).filter(b=>b.stake>0).map(b=>b.stake||0),
                        card.sgp?.stake>0 ? (card.sgp.stake||0) : 0,
                        card.potd?.stake>0 ? (card.potd.stake||0) : 0,
                      ].reduce((s,v)=>s+v,0)
                      const newCard = {
                        id: 'arc-'+Date.now(),
                        date: card.date,
                        potd: card.potd?.pick || 'NONE',
                        potdResult: card.potd?.status==='win'?'W':card.potd?.status==='loss'?'L':card.potd?.status==='void'?'V':'P',
                        potdPL: card.potd?.pl || 0,
                        rfi: `${rfiW}-${rfiL}`,
                        ml: `${mlW}-${mlL}`,
                        hitParlay: card.sgp?.status==='win'?'W':card.sgp?.status==='loss'?'L':'P',
                        staked: totalS,
                        pl: allPL,
                        bankroll: card.bankroll,
                        notes: [
                          card.potd?.pick ? `POTD: ${card.potd.pick} ${card.potd?.status==='win'?'✅':'❌'}` : '',
                          rfiN>0 ? `RFI: ${rfiW}-${rfiL}` : '',
                          card.sgp?.stake>0 ? `SGP: ${card.sgp.pick||'SGP'} ${card.sgp.status==='win'?'✅':'❌'}` : '',
                          (card.ml||[]).length>0 ? `Paper: ${mlW}W-${mlL}L` : '',
                          card.notes||'',
                        ].filter(Boolean).join(' · '),
                      }
                      try {
                        const key = 'betlab-tracker-cards-v1'
                        const existing = JSON.parse(localStorage.getItem(key)||'[]')
                        localStorage.setItem(key, JSON.stringify([...existing, newCard]))
                      } catch(e) { console.error(e) }
                      // Save paper bets to dedicated paper archive for stats
                      try {
                        const pkey = 'betlab-paper-history-v1'
                        const papers = JSON.parse(localStorage.getItem(pkey)||'[]')
                        const todayPapers = (card.ml||[])
                          .filter(b => b.result && b.result!=='pending')
                          .map(b => ({
                            date: card.date,
                            pick: b.direction || b.sources || b.game || 'Paper',
                            game: b.game||'',
                            odds: b.odds||'',
                            result: b.result,
                          }))
                        if (todayPapers.length) localStorage.setItem(pkey, JSON.stringify([...papers, ...todayPapers]))
                      } catch(e) { console.error(e) }

                      // Auto-grade today's pending sharp picks via MLB API
                      let sharpMsg = ''
                      try {
                        const sd = JSON.parse(localStorage.getItem(SHARP_KEY)||'{"days":[]}')
                        const dayIdx = (sd.days||[]).findIndex(d => d.date === card.date)
                        if (dayIdx >= 0) {
                          const pending = sd.days[dayIdx].picks.filter(p=>p.result==='pending').length
                          if (pending > 0) {
                            const { picks, graded } = await gradeSharpPicks(sd.days[dayIdx].picks, parseCardDate(card.date))
                            sd.days[dayIdx].picks = picks
                            localStorage.setItem(SHARP_KEY, JSON.stringify(sd))
                            sharpMsg = ` · ${graded} sharp graded`
                          }
                        }
                      } catch(e) { console.error(e) }

                      persist(EMPTY)
                      setArchiveConfirm(false)
                      setGradeLog([`✅ Card archived to history!${sharpMsg}`])
                    }}
                      style={{ padding:12, background:C.gold+'20',
                        border:`1px solid ${C.gold}`, borderRadius:8,
                        color:C.gold, fontWeight:800, fontSize:'.8rem', cursor:'pointer' }}>
                      ✅ YES ARCHIVE
                    </button>
                    <button onClick={()=>setArchiveConfirm(false)}
                      style={{ padding:12, background:'transparent',
                        border:`1px solid ${C.border}`, borderRadius:8,
                        color:C.dim, fontWeight:700, fontSize:'.8rem', cursor:'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
