import { useState, useEffect } from 'react'

const CARD_KEY = 'betlab-today-v3'

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
  const pl = bet.status==='win'?(bet.payout||0)-(bet.stake||0):bet.status==='loss'?-(bet.stake||0):0

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
      {bet.status==='pending' && onGrade && (
        <div style={{ display:'grid',
          gridTemplateColumns:bet.onPaperBet?'1fr 1fr 1fr 1fr 1fr':'1fr 1fr 1fr 1fr',
          gap:6, padding:'0 14px 12px' }}>
          {[
            { label:'✅', st:'win',  color:C.accent },
            { label:'❌', st:'loss', color:C.red },
            { label:'🔄', st:'void', color:C.dim },
          ].map(({ label, st, color }) => (
            <button key={st} onClick={(e)=>{ e.stopPropagation(); onGrade(st) }}
              style={{ padding:'9px 4px', background:color+'15',
                border:`1px solid ${color}40`, borderRadius:8,
                color, fontWeight:700, fontSize:'.8rem', cursor:'pointer' }}>
              {label}
            </button>
          ))}
          {bet.onPaperBet && (
            <button onClick={(e)=>{ e.stopPropagation(); bet.onPaperBet() }}
              style={{ padding:'9px 4px', background:C.blue+'15',
                border:`1px solid ${C.blue}40`, borderRadius:8,
                color:C.blue, fontWeight:700, fontSize:'.72rem', cursor:'pointer' }}>
              📋
            </button>
          )}
          {bet.onDelete && (
            <button onClick={(e)=>{ e.stopPropagation(); bet.onDelete() }}
              style={{ padding:'9px 4px', background:'transparent',
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
                      ].map(({ label, st, color }) => (
                        <button key={st} onClick={(e)=>{ e.stopPropagation(); bet.onGradeLeg(i, st) }}
                          style={{ padding:'5px 4px',
                            background:leg.result===st?color+'30':color+'10',
                            border:`1px solid ${color}40`, borderRadius:6,
                            color, fontWeight:700, fontSize:'.7rem', cursor:'pointer' }}>
                          {label}
                        </button>
                      ))}
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

export default function TodayCard({ accounts }) {
  const [card, setCard]         = useState(EMPTY)
  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [pasteMode, setPasteMode] = useState(false)
  const [saved, setSaved]       = useState(false)
  const [grading, setGrading]   = useState(false)
  const [gradeLog, setGradeLog] = useState([])
  const [archiveConfirm, setArchiveConfirm] = useState(false)

  useEffect(() => {
    try {
      const s = localStorage.getItem(CARD_KEY)
      if (s) { const c = JSON.parse(s); if (c.date) setCard(c) }
    } catch {}
  }, [])

  const persist = (c) => {
    setCard(c)
    try { localStorage.setItem(CARD_KEY, JSON.stringify(c)) } catch {}
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

      persist(parsed)
      setJsonError('')
      setPasteMode(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { setJsonError('Invalid JSON — check format and try again') }
  }

  // ── GRADERS ──
  const gradeItem = (type, idx, status) => {
    const c = JSON.parse(JSON.stringify(card))
    const item = c[type][idx]
    const pl = status==='win'?(item.payout||0)-(item.stake||0):status==='loss'?-(item.stake||0):0
    c[type][idx] = { ...item, status, pl }
    persist(c)
  }

  const gradeSgp = (status) => {
    const pl = status==='win'?(card.sgp.payout||0)-(card.sgp.stake||0):status==='loss'?-(card.sgp.stake||0):0
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
          updated.potd.pl = r==='win'?(updated.potd.payout||0)-(updated.potd.stake||0):-(updated.potd.stake||0)
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
          updated.rfi[i].pl = r==='win'?(b.payout||0)-(b.stake||0):-(b.stake||0)
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
                  onDelete:()=>{ const c=JSON.parse(JSON.stringify(card)); c.potd=null; persist(c) },
                  onPaperBet:()=>{
                    const c=JSON.parse(JSON.stringify(card))
                    c.ml=c.ml||[]
                    c.ml.push({ game:c.potd.game||'', direction:c.potd.pick, odds:c.potd.odds||'', sources:c.potd.notes||'', result:'pending' })
                    c.potd=null
                    persist(c)
                  } }}
                onGrade={(st) => {
                  const pl = st==='win'?(card.potd.payout||0)-(card.potd.stake||0):st==='loss'?-(card.potd.stake||0):0
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
                    onDelete:()=>{ const c=JSON.parse(JSON.stringify(card)); c.rfi.splice(i,1); persist(c) },
                    onPaperBet:()=>{
                      const c=JSON.parse(JSON.stringify(card))
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
                    onDelete:()=>{ const c=JSON.parse(JSON.stringify(card)); c.props.splice(i,1); persist(c) },
                    onPaperBet:()=>{
                      const c=JSON.parse(JSON.stringify(card))
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

          {/* Auto Grade Button */}
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
                    <button onClick={()=>{
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
                      persist(EMPTY)
                      setArchiveConfirm(false)
                      setGradeLog(['✅ Card archived to history!'])
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
