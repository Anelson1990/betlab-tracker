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
  const [open, setOpen] = useState(false)
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
                <div key={i} style={{ display:'flex', justifyContent:'space-between',
                  alignItems:'center', padding:'6px 0',
                  borderBottom:i<bet.legs.length-1?`1px solid ${C.border}`:'none' }}>
                  <span style={{ color:C.text, fontSize:'.75rem', flex:1, paddingRight:8 }}>
                    {sIcon(leg.result)} {leg.description||leg.player||leg.prop}
                  </span>
                  <span style={{ color:sColor(leg.result), fontSize:'.75rem', fontWeight:700 }}>
                    {sLabel(leg.result)}
                  </span>
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

          {bet.status==='pending' && onGrade && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6 }}>
              {[
                { label:'✅ WIN',  st:'win',  color:C.accent },
                { label:'❌ LOSS', st:'loss', color:C.red },
                { label:'🔄 VOID', st:'void', color:C.dim },
              ].map(({ label, st, color }) => (
                <button key={st} onClick={()=>onGrade(st)}
                  style={{ padding:'10px 4px', background:color+'15',
                    border:`1px solid ${color}40`, borderRadius:8,
                    color, fontWeight:700, fontSize:'.72rem', cursor:'pointer' }}>
                  {label}
                </button>
              ))}
              {bet.onDelete && (
                <button onClick={bet.onDelete}
                  style={{ padding:'10px 4px', background:'transparent',
                    border:`1px solid ${C.border}`, borderRadius:8,
                    color:C.muted, fontWeight:700, fontSize:'.72rem', cursor:'pointer' }}>
                  🗑 DEL
                </button>
              )}
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
              Nelson · BetLab v3
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
              fontWeight:800, fontSize:'.85rem', cursor:'pointer' }}>
            ⚡ LOAD CARD
          </button>
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
                bet={{ ...card.potd, type:'POTD', platform:card.potd.platform||'DK' }}
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
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>🎲 RFI</div>
              {card.rfi.filter(b=>b.stake>0).map((b,i) => (
                <BetRow key={i}
                  bet={{ ...b, pick:`${b.pick} — ${b.game}`, type:'RFI', platform:b.platform||'DK',
                    onDelete:()=>{ const c=JSON.parse(JSON.stringify(card)); c.rfi.splice(i,1); persist(c) } }}
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
                  platform:card.sgp.platform||'B365' }}
                onGrade={gradeSgp}
              />
            </div>
          )}

          {/* Props */}
          {(card.props||[]).filter(b=>b.stake>0).length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>⚾ PROPS</div>
              {card.props.filter(b=>b.stake>0).map((b,i) => (
                <BetRow key={i}
                  bet={{ ...b, type:'Props', platform:b.platform||'PP' }}
                  onGrade={st=>gradeItem('props',i,st)}
                />
              ))}
            </div>
          )}

          {/* Paper picks */}
          {(card.ml||[]).length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>📋 PAPER PICKS</div>
              {card.ml.map((b,i) => (
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
              ))}
            </div>
          )}

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

          {/* Session Summary */}
          {totalStaked > 0 && (
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
