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
  potd:{ pick:'', game:'', odds:'', stake:0, payout:0, platform:'DK', result:'pending', pl:0, sources:'', analysis:'' },
  rfi:[], ml:[], props:[], sgp:null,
  sharp:[], notes:''
}

const statusColor = s => ({ win:C.accent, loss:C.red, void:C.dim, pending:C.gold }[s]||C.dim)
const statusIcon  = s => ({ win:'✅', loss:'❌', void:'🔄', pending:'⏳' }[s]||'⏳')
const statusLabel = s => ({ win:'WIN', loss:'LOSS', void:'VOID', pending:'PENDING' }[s]||'PENDING')
const plStr = v => (v>=0?'+':'')+v.toFixed(2)
const plCol = v => v>0?C.accent:v<0?C.red:C.dim

function Pill({ label, color, bg }) {
  return <span style={{ background:bg||color+'20', color, fontSize:'.58rem', fontWeight:800,
    padding:'3px 8px', borderRadius:20, letterSpacing:'.1em', textTransform:'uppercase' }}>{label}</span>
}

function BetRow({ bet, onGrade }) {
  const [open, setOpen] = useState(false)
  const pl = bet.status==='win' ? (bet.payout||0)-(bet.stake||0) : bet.status==='loss' ? -(bet.stake||0) : 0

  return (
    <div style={{ background:C.muted, border:`1px solid ${C.border}`,
      borderLeft:`3px solid ${statusColor(bet.status)}`,
      borderRadius:10, marginBottom:8, overflow:'hidden' }}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{ padding:'12px 14px', cursor:'pointer', display:'flex',
          justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', gap:6, marginBottom:5, flexWrap:'wrap' }}>
            <Pill label={bet.type||bet.betType||'bet'} color={C.blue} />
            {bet.platform && <Pill label={bet.platform} color={C.purple} />}
            <Pill label={statusLabel(bet.status)} color={statusColor(bet.status)} />
          </div>
          <div style={{ color:C.text, fontWeight:700, fontSize:'.9rem', lineHeight:1.2 }}>
            {bet.pick||bet.game||'—'}
          </div>
          {bet.odds && <div style={{ color:C.dim, fontSize:'.72rem', marginTop:3 }}>{bet.odds}</div>}
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
          {/* Stats row */}
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

          {/* Legs */}
          {bet.legs?.length > 0 && (
            <div style={{ marginBottom:10 }}>
              {bet.legs.map((leg,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between',
                  alignItems:'center', padding:'6px 0',
                  borderBottom:i<bet.legs.length-1?`1px solid ${C.border}`:'none' }}>
                  <span style={{ color:C.text, fontSize:'.75rem', flex:1, paddingRight:8 }}>
                    {statusIcon(leg.result)} {leg.description||leg.player||leg.prop}
                  </span>
                  <span style={{ color:statusColor(leg.result), fontSize:'.75rem', fontWeight:700 }}>
                    {statusLabel(leg.result)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {bet.sources && (
            <div style={{ color:C.dim, fontSize:'.7rem', marginBottom:8,
              background:C.bg, borderRadius:6, padding:'8px 10px' }}>
              📊 {bet.sources}
            </div>
          )}

          {bet.analysis && (
            <div style={{ color:C.text, fontSize:'.75rem', marginBottom:10,
              lineHeight:1.5 }}>{bet.analysis}</div>
          )}

          {/* Grade buttons */}
          {bet.status==='pending' && onGrade && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
              {[
                { label:'✅ WIN',  status:'win',  color:C.accent },
                { label:'❌ LOSS', status:'loss', color:C.red },
                { label:'🔄 VOID', status:'void', color:C.dim },
              ].map(({ label, status, color }) => (
                <button key={status} onClick={()=>onGrade(status)}
                  style={{ padding:'10px 4px', background:`${color}15`,
                    border:`1px solid ${color}40`, borderRadius:8,
                    color, fontWeight:700, fontSize:'.72rem', cursor:'pointer',
                    letterSpacing:'.05em' }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TodayCard({ accounts }) {
  const [card, setCard]       = useState(EMPTY)
  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [pasteMode, setPasteMode] = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    try {
      const s = localStorage.getItem(CARD_KEY)
      if (s) { const c = JSON.parse(s); if(c.date) setCard(c) }
    } catch {}
  }, [])

  const persist = (c) => {
    setCard(c)
    try { localStorage.setItem(CARD_KEY, JSON.stringify(c)) } catch {}
  }

  const loadJSON = () => {
    try {
      const parsed = JSON.parse(jsonInput.trim())
      persist(parsed)
      setJsonError('')
      setPasteMode(false)
      setSaved(true)
      setTimeout(()=>setSaved(false), 2000)
    } catch { setJsonError('Invalid JSON — check format and try again') }
  }

  const gradeItem = (type, idx, status) => {
    const c = { ...card }
    const payout = (item) => item.payout||0
    const stake  = (item) => item.stake||0
    const pl = status==='win' ? payout(c[type][idx])-stake(c[type][idx])
              : status==='loss' ? -stake(c[type][idx]) : 0
    c[type] = c[type].map((item,i) => i===idx ? { ...item, status, pl } : item)
    persist(c)
  }

  const gradePotd = (status) => {
    const pl = status==='win' ? (card.potd.payout||0)-(card.potd.stake||0)
              : status==='loss' ? -(card.potd.stake||0) : 0
    persist({ ...card, potd:{ ...card.potd, status, pl } })
  }

  const gradeSgp = (status) => {
    const pl = status==='win' ? (card.sgp.payout||0)-(card.sgp.stake||0)
              : status==='loss' ? -(card.sgp.stake||0) : 0
    persist({ ...card, sgp:{ ...card.sgp, status, pl } })
  }

  // Calculate session P&L
  const allBets = [
    card.potd?.stake>0 ? { ...card.potd, type:'POTD', betType:'potd' } : null,
    ...(card.rfi||[]).map(b=>({ ...b, betType:'rfi', type:'RFI' })),
    ...(card.ml||[]).map(b=>({ ...b, betType:'ml', type:'ML' })),
    ...(card.props||[]).map(b=>({ ...b, betType:'props', type:'Props' })),
    card.sgp?.stake>0 ? { ...card.sgp, type:'SGP', betType:'sgp' } : null,
  ].filter(Boolean).filter(b=>b.type!=='paper'&&b.stake>0)

  const totalStaked = allBets.reduce((s,b)=>s+(b.stake||0),0)
  const totalPL     = allBets.reduce((s,b)=>s+(b.pl||0),0)

  const isEmpty = !card.date

  return (
    <div>
      {/* ── HEADER ── */}
      <div style={{ background:`linear-gradient(135deg,#0a0a18,#0e0e22)`,
        border:`1px solid ${C.border}`, borderRadius:12, padding:'16px',
        marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.8rem',
                letterSpacing:'.12em', background:`linear-gradient(135deg,${C.accent},${C.blue})`,
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1 }}>
                BETLAB
              </div>
              {card.date && (
                <span style={{ background:`${C.accent}20`, color:C.accent, fontSize:'.6rem',
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
              ${(accounts?.dk+accounts?.b365+accounts?.pp||185.90).toFixed(2)}
            </div>
            <div style={{ color:C.dim, fontSize:'.6rem' }}>
              DK ${accounts?.dk||0} · B365 ${accounts?.b365||0} · PP ${accounts?.pp||0}
            </div>
            {totalStaked>0 && (
              <div style={{ color:plCol(totalPL), fontSize:'.75rem', fontWeight:700, marginTop:2 }}>
                {plStr(totalPL)} today
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {card.bankroll>0 && (
          <div style={{ marginTop:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between',
              fontSize:'.6rem', color:C.dim, marginBottom:4 }}>
              <span>Goal: $300</span>
              <span>{Math.round((card.bankroll/300)*100)}%</span>
            </div>
            <div style={{ background:C.muted, borderRadius:10, height:4 }}>
              <div style={{ background:`linear-gradient(90deg,${C.accent},${C.blue})`,
                width:Math.min((card.bankroll/300)*100,100)+'%',
                height:'100%', borderRadius:10, transition:'width .5s' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── PASTE ZONE ── */}
      <button onClick={()=>setPasteMode(p=>!p)}
        style={{ width:'100%', padding:'11px', marginBottom:10,
          background:pasteMode?`${C.accent}15`:'transparent',
          border:`1px solid ${pasteMode?C.accent:C.border}`,
          borderRadius:9, color:pasteMode?C.accent:C.dim,
          fontWeight:700, fontSize:'.75rem', cursor:'pointer',
          letterSpacing:'.08em', textTransform:'uppercase' }}>
        {pasteMode ? '✕ Cancel' : '📋 Paste Today\'s JSON'}
      </button>

      {pasteMode && (
        <div style={{ marginBottom:12 }}>
          <textarea
            value={jsonInput}
            onChange={e=>setJsonInput(e.target.value)}
            placeholder='Paste the JSON from Claude here...'
            style={{ width:'100%', minHeight:120, background:C.muted,
              border:`1px solid ${C.border}`, borderRadius:8, padding:10,
              color:C.text, fontSize:'.75rem', fontFamily:'monospace',
              resize:'vertical', boxSizing:'border-box' }} />
          {jsonError && (
            <div style={{ color:C.red, fontSize:'.72rem', marginTop:4 }}>{jsonError}</div>
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
        <div style={{ background:`${C.accent}15`, border:`1px solid ${C.accent}40`,
          borderRadius:8, padding:'10px', textAlign:'center',
          color:C.accent, fontSize:'.8rem', fontWeight:700, marginBottom:10 }}>
          ✅ Card loaded successfully
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {isEmpty && !pasteMode && (
        <div style={{ textAlign:'center', padding:'40px 0', color:C.dim }}>
          <div style={{ fontSize:'2.5rem', marginBottom:10 }}>🎯</div>
          <div style={{ fontSize:'.85rem', color:C.text, marginBottom:6 }}>No card loaded yet</div>
          <div style={{ fontSize:'.75rem' }}>Paste today's JSON from Claude to get started</div>
        </div>
      )}

      {/* ── TODAY'S CARD ── */}
      {!isEmpty && (
        <div>
          {/* POTD */}
          {card.potd?.pick && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6, display:'flex',
                alignItems:'center', gap:6 }}>
                <span style={{ color:C.gold }}>🎯</span> PICK OF THE DAY
              </div>
              <BetRow
                bet={{ ...card.potd, type:'POTD', betType:'potd',
                  pick:card.potd.pick, platform:card.potd.platform||'DK' }}
                onGrade={gradePotd}
              />
            </div>
          )}

          {/* RFI */}
          {card.rfi?.filter(b=>b.stake>0).length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>
                🎲 RFI
              </div>
              {card.rfi.filter(b=>b.stake>0).map((b,i) => (
                <BetRow key={i}
                  bet={{ ...b, pick:`${b.pick} — ${b.game}`, type:'RFI',
                    betType:'rfi', platform:b.platform||'DK' }}
                  onGrade={s=>gradeItem('rfi',i,s)}
                />
              ))}
            </div>
          )}

          {/* SGP */}
          {card.sgp?.stake > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>
                ⚡ SGP / PARLAY
              </div>
              <BetRow
                bet={{ ...card.sgp, type:'SGP', betType:'sgp',
                  pick:card.sgp.pick||`${card.sgp.legs?.length||0}-Leg SGP`,
                  platform:card.sgp.platform||'B365' }}
                onGrade={gradeSgp}
              />
            </div>
          )}

          {/* Props */}
          {card.props?.filter(b=>b.stake>0).length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>
                ⚾ PROPS
              </div>
              {card.props.filter(b=>b.stake>0).map((b,i) => (
                <BetRow key={i}
                  bet={{ ...b, type:'Props', betType:'props', platform:b.platform||'PP' }}
                  onGrade={s=>gradeItem('props',i,s)}
                />
              ))}
            </div>
          )}

          {/* Paper picks */}
          {card.ml?.length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>
                📋 PAPER PICKS
              </div>
              {card.ml.map((b,i) => (
                <div key={i} style={{ background:C.muted, border:`1px solid ${C.border}`,
                  borderRadius:8, padding:'10px 12px', marginBottom:6,
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ color:C.text, fontSize:'.78rem', fontWeight:600 }}>
                      {b.direction} {b.game}
                    </div>
                    <div style={{ color:C.dim, fontSize:'.65rem', marginTop:2 }}>{b.sources}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ color:C.blue, fontWeight:700, fontSize:'.8rem' }}>{b.odds}</div>
                    <div style={{ color:statusColor(b.result||'pending'),
                      fontSize:'.7rem', marginTop:2 }}>
                      {statusIcon(b.result||'pending')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sharp picks */}
          {card.sharp?.length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:6 }}>
                💰 SHARP MONEY
              </div>
              {card.sharp.slice(0,5).map((s,i) => (
                <div key={i} style={{ background:C.muted, border:`1px solid ${C.border}`,
                  borderRadius:8, padding:'9px 12px', marginBottom:5,
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ color:C.text, fontSize:'.75rem', fontWeight:600 }}>{s.game}</div>
                    <div style={{ display:'flex', gap:5, marginTop:4 }}>
                      <span style={{ background:`${C.gold}15`, color:C.gold,
                        fontSize:'.58rem', fontWeight:700, padding:'2px 6px',
                        borderRadius:10 }}>{s.pick}</span>
                      <span style={{ background:`${C.blue}15`, color:C.blue,
                        fontSize:'.58rem', fontWeight:700, padding:'2px 6px',
                        borderRadius:10 }}>{s.gap}%</span>
                      <span style={{ background:s.signal==='confirms'?`${C.accent}15`:s.signal==='conflicts'?`${C.red}15`:`${C.dim}20`,
                        color:s.signal==='confirms'?C.accent:s.signal==='conflicts'?C.red:C.dim,
                        fontSize:'.58rem', fontWeight:700, padding:'2px 6px', borderRadius:10 }}>
                        {s.signal}
                      </span>
                    </div>
                  </div>
                  <div style={{ color:statusColor(s.result||'pending'), fontSize:'.9rem' }}>
                    {statusIcon(s.result||'pending')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Session summary */}
          {totalStaked > 0 && (
            <div style={{ background:`linear-gradient(135deg,#0a0a18,#0e0e22)`,
              border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginTop:4 }}>
              <div style={{ color:C.dim, fontSize:'.6rem', letterSpacing:'.12em',
                textTransform:'uppercase', marginBottom:10 }}>Session Summary</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                {[
                  { label:'Staked', val:`$${totalStaked.toFixed(2)}`, color:C.text },
                  { label:'P&L',    val:plStr(totalPL),               color:plCol(totalPL) },
                  { label:'Bets',   val:allBets.length,               color:C.blue },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background:C.bg, borderRadius:8, padding:'10px 6px', textAlign:'center' }}>
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
