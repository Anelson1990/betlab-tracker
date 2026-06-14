import { useState, useEffect } from 'react'
import { SEED_CARDS, SEED_MODELS, MODEL_COLORS, STATUS_CONFIG, RESULT_CONFIG } from './data.js'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

const STORAGE_KEY = 'betlab-tracker-cards-v1'

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : SEED_CARDS
  } catch {
    return SEED_CARDS
  }
}

function saveCards(cards) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)) } catch {}
}

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0e0e1e', border:'1px solid #1a1a30', borderRadius:6, padding:'6px 10px', fontSize:'.6rem' }}>
      <div style={{ color:'#60a5fa', fontWeight:700, marginBottom:3 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.fill, display:'flex', justifyContent:'space-between', gap:10 }}>
          <span>{p.name || p.dataKey}</span>
          <span style={{ fontWeight:700 }}>
            {p.dataKey === 'br' || p.dataKey === 'profit' ? '$' + Number(p.value).toFixed(0) : Number(p.value).toFixed(1) + '%'}
          </span>
        </div>
      ))}
    </div>
  )
}

const EMPTY_FORM = { date:'', potd:'', potdResult:'W', potdPL:'', rfi:'', ml:'', hitParlay:'L', staked:'', pl:'', bankroll:'', notes:'' }

export default function App() {
  const [tab, setTab] = useState('cards')
  const [cards, setCards] = useState(loadCards)
  const [models] = useState(SEED_MODELS)
  const [expanded, setExpanded] = useState({})
  const [modelFilter, setModelFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => { saveCards(cards) }, [cards])

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }))
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addCard = () => {
    if (!form.date || !form.potd) return
    const card = {
      id: Date.now().toString(),
      date: form.date,
      potd: form.potd,
      potdResult: form.potdResult,
      potdPL: parseFloat(form.potdPL) || 0,
      rfi: form.rfi,
      ml: form.ml,
      hitParlay: form.hitParlay,
      staked: parseFloat(form.staked) || 0,
      pl: parseFloat(form.pl) || 0,
      bankroll: parseFloat(form.bankroll) || 0,
      notes: form.notes,
    }
    setCards(prev => [...prev, card])
    setForm(EMPTY_FORM)
    setShowForm(false)
  }

  const deleteCard = (id, e) => {
    e.stopPropagation()
    if (window.confirm('Delete this card?')) {
      setCards(prev => prev.filter(c => c.id !== id))
    }
  }

  // Stats
  const realCards = cards.filter(c => c.potdResult !== 'P')
  const potdWins = realCards.filter(c => c.potdResult === 'W').length
  const potdLoss = realCards.filter(c => c.potdResult === 'L').length
  const potdVoid = realCards.filter(c => c.potdResult === 'V').length
  const latestBR = cards.length ? cards[cards.length - 1].bankroll : 40
  const totalPL = cards.reduce((a, c) => a + c.pl, 0)
  const activeModels = models.filter(m => m.status === 'active')
  const filteredModels = modelFilter === 'all' ? models : models.filter(m => m.status === modelFilter)
  const bankrollData = cards.filter(c => c.bankroll > 0).map(c => ({ date: c.date, br: c.bankroll }))
  const topModels = [...activeModels].sort((a, b) => b.roi - a.roi).slice(0, 8)

  return (
    <div style={{ background:'#060608', minHeight:'100vh', maxWidth:520, margin:'0 auto' }}>

      {/* HEADER */}
      <div style={{ background:'linear-gradient(180deg,#08081a,#060608)', padding:'14px 14px 10px', borderBottom:'1px solid #1a1a30', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.8rem', letterSpacing:'.06em' }}>
            <span style={{ background:'linear-gradient(135deg,#fff,#7070a0)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Bet</span>
            <span style={{ background:'linear-gradient(135deg,#93c5fd,#2563eb)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Lab</span>
            <span style={{ background:'linear-gradient(135deg,#fff,#7070a0)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}> Tracker</span>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.4rem', color:'#4ade80', lineHeight:1 }}>${latestBR.toFixed(2)}</div>
            <div style={{ fontSize:'.38rem', letterSpacing:'.1em', textTransform:'uppercase', color:'#404060' }}>Bankroll</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {[['cards','📋 Cards'],['models','📊 Models'],['analytics','📈 Analytics']].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex:1, padding:'7px 4px',
              fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase',
              border:'1px solid', borderRadius:6, transition:'all .15s',
              background: tab===t ? '#1a1a30' : '#0c0c1a',
              color: tab===t ? '#f0f0f8' : '#404060',
              borderColor: tab===t ? '#2a2a50' : '#1a1a30',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* STRIP */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, padding:'10px 12px', background:'#07070f', borderBottom:'1px solid #1a1a30' }}>
        {[
          { val: `${potdWins}-${potdLoss}`, lbl: 'POTD', color: '#4ade80' },
          { val: `${totalPL >= 0 ? '+' : ''}$${totalPL.toFixed(0)}`, lbl: 'Net P&L', color: totalPL >= 0 ? '#4ade80' : '#f87171' },
          { val: cards.length, lbl: 'Days', color: '#60a5fa' },
          { val: activeModels.length, lbl: 'Active', color: '#a78bfa' },
        ].map(s => (
          <div key={s.lbl} style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, lineHeight:1, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:'.38rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:2 }}>{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* ── CARDS TAB ── */}
      {tab === 'cards' && (
        <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>
          {[...cards].reverse().map(c => {
            const rc = RESULT_CONFIG[c.potdResult] || RESULT_CONFIG.P
            const isOpen = expanded[c.id]
            const borderColor = c.potdResult==='W' ? '#14532d' : c.potdResult==='L' ? '#7f1d1d' : c.potdResult==='V' ? '#334155' : '#1e40af'
            return (
              <div key={c.id} style={{ background:'#09090f', border:`1px solid ${borderColor}`, borderRadius:10, overflow:'hidden' }}>
                <div onClick={() => toggle(c.id)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px 8px', cursor:'pointer' }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:'#505070', width:34, flexShrink:0 }}>{c.date}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.95rem', fontWeight:800, color:'#f0f0f8', lineHeight:1.1 }}>{c.potd}</div>
                    <div style={{ fontSize:'.38rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:1 }}>Pick of the Day</div>
                  </div>
                  <div style={{ borderRadius:5, padding:'3px 7px', fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, border:`1px solid ${rc.border}`, color:rc.color, background:rc.bg, flexShrink:0 }}>{rc.label}</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.95rem', fontWeight:800, color: c.potdPL >= 0 ? '#4ade80' : '#f87171', width:44, textAlign:'right', flexShrink:0 }}>
                    {c.potdPL >= 0 ? '+' : ''}${Math.abs(c.potdPL).toFixed(0)}
                  </div>
                  <button onClick={e => deleteCard(c.id, e)} style={{ background:'none', border:'none', color:'#404060', fontSize:'.7rem', padding:'0 0 0 4px', flexShrink:0 }}>✕</button>
                </div>
                {isOpen && (
                  <div style={{ padding:'0 12px 10px', borderTop:'1px solid #111120' }}>
                    {[
                      ['RFI Record', c.rfi || '—', null],
                      ['ML Record', c.ml || '—', null],
                      ['Hit Parlay', c.hitParlay === 'W' ? '✅ Win' : c.hitParlay === 'P' ? '📋 Paper' : '❌ Loss', c.hitParlay === 'W' ? '#4ade80' : c.hitParlay === 'P' ? '#60a5fa' : '#f87171'],
                      ['Total Staked', `$${c.staked.toFixed(2)}`, null],
                      ['Total P&L', `${c.pl >= 0 ? '+' : ''}$${c.pl.toFixed(2)}`, c.pl >= 0 ? '#4ade80' : '#f87171'],
                      ['Bankroll End', `$${c.bankroll.toFixed(2)}`, '#fbbf24'],
                    ].map(([lbl, val, col]) => (
                      <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid #0d0d1a' }}>
                        <span style={{ fontSize:'.52rem', letterSpacing:'.06em', textTransform:'uppercase', color:'#404060' }}>{lbl}</span>
                        <span style={{ fontSize:'.62rem', fontWeight:600, color: col || '#a0a0c0' }}>{val}</span>
                      </div>
                    ))}
                    {c.notes && <div style={{ fontSize:'.56rem', color:'#505070', lineHeight:1.5, marginTop:6, paddingTop:6, borderTop:'1px solid #0d0d1a' }}>{c.notes}</div>}
                  </div>
                )}
              </div>
            )
          })}

          {/* ADD CARD */}
          {!showForm ? (
            <button onClick={() => setShowForm(true)} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff', marginTop:2 }}>
              + Log Today's Card
            </button>
          ) : (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:'#505070', marginBottom:10 }}>Log New Card</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                {[
                  ['date','Date','Jun 14','text'],
                  ['potd','POTD Pick','ATL ML -116','text'],
                ].map(([k,l,p,t]) => (
                  <div key={k}>
                    <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>{l}</label>
                    <input value={form[k]} onChange={e => setF(k, e.target.value)} placeholder={p} type={t}
                      style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                <div>
                  <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>POTD Result</label>
                  <select value={form.potdResult} onChange={e => setF('potdResult', e.target.value)}
                    style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }}>
                    <option value="W">✅ Win</option>
                    <option value="L">❌ Loss</option>
                    <option value="V">🔄 Void</option>
                    <option value="P">📋 Paper</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>POTD P&L ($)</label>
                  <input value={form.potdPL} onChange={e => setF('potdPL', e.target.value)} placeholder="10.00" type="number"
                    style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
                </div>
                <div>
                  <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>RFI Record</label>
                  <input value={form.rfi} onChange={e => setF('rfi', e.target.value)} placeholder="2-1"
                    style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
                </div>
                <div>
                  <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>ML Record</label>
                  <input value={form.ml} onChange={e => setF('ml', e.target.value)} placeholder="1-0"
                    style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
                </div>
                <div>
                  <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>Hit Parlay</label>
                  <select value={form.hitParlay} onChange={e => setF('hitParlay', e.target.value)}
                    style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }}>
                    <option value="W">✅ Win</option>
                    <option value="L">❌ Loss</option>
                    <option value="P">📋 Paper</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>Total Staked ($)</label>
                  <input value={form.staked} onChange={e => setF('staked', e.target.value)} placeholder="40.00" type="number"
                    style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
                </div>
                <div>
                  <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>Total P&L ($)</label>
                  <input value={form.pl} onChange={e => setF('pl', e.target.value)} placeholder="-5.00" type="number"
                    style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
                </div>
                <div>
                  <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>Bankroll End ($)</label>
                  <input value={form.bankroll} onChange={e => setF('bankroll', e.target.value)} placeholder="45.00" type="number"
                    style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
                </div>
              </div>
              <div style={{ marginBottom:6 }}>
                <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>Notes</label>
                <input value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Key picks, lessons, what hit..."
                  style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
              </div>
              <button onClick={addCard} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff', marginBottom:4 }}>Save Card</button>
              <button onClick={() => setShowForm(false)} style={{ width:'100%', padding:9, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#505070' }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* ── MODELS TAB ── */}
      {tab === 'models' && (
        <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:2 }}>
            {[['all','All'],['active','Active'],['monitor','Monitor'],['display','Display'],['retired','Retired']].map(([v,l]) => (
              <button key={v} onClick={() => setModelFilter(v)} style={{
                padding:'4px 8px', background: modelFilter===v ? '#1a1a30' : '#0c0c1a',
                border:'1px solid #1a1a30', borderRadius:4, fontSize:'.52rem', fontWeight:700,
                letterSpacing:'.06em', textTransform:'uppercase', color: modelFilter===v ? '#f0f0f8' : '#404060',
              }}>{l}</button>
            ))}
          </div>
          {filteredModels.map(m => {
            const color = MODEL_COLORS[m.name] || '#60a5fa'
            const sc = STATUS_CONFIG[m.status]
            const wr = m.bets ? Math.round((m.wins / m.bets) * 100) : 0
            const isOpen = expanded['m_' + m.name]
            return (
              <div key={m.name} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, overflow:'hidden' }}>
                <div onClick={() => toggle('m_' + m.name)} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 10px 6px', cursor:'pointer' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }} />
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color, flex:1 }}>{m.name}</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:700, color }}>{wr}% WR</div>
                  <div style={{ fontSize:'.58rem', fontWeight:700, color: m.roi > 0 ? '#4ade80' : '#f87171', width:44, textAlign:'right' }}>{m.roi > 0 ? '+' : ''}{m.roi}% ROI</div>
                  <div style={{ borderRadius:4, padding:'2px 5px', fontSize:'.38rem', fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', border:`1px solid ${sc.border}`, color:sc.color, background:sc.bg, flexShrink:0 }}>{sc.label}</div>
                </div>
                <div style={{ height:4, background:'#1a1a30', margin:'0 10px 6px', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.max(0,wr)}%`, background:color, opacity:0.7, borderRadius:2 }} />
                </div>
                {isOpen && (
                  <div style={{ padding:'0 10px 10px', borderTop:'1px solid #111120' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4, margin:'8px 0' }}>
                      {[
                        { val: `${m.wins}-${m.bets-m.wins}`, lbl: 'Record', col: color },
                        { val: `${m.profit>=0?'+':''}$${m.profit.toFixed(0)}`, lbl: 'Profit', col: m.profit>=0?'#4ade80':'#f87171' },
                        { val: m.bets, lbl: 'Bets', col: '#fbbf24' },
                      ].map(s => (
                        <div key={s.lbl} style={{ textAlign:'center', background:'#0c0c1a', borderRadius:5, padding:6 }}>
                          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:700, lineHeight:1, color:s.col }}>{s.val}</div>
                          <div style={{ fontSize:'.36rem', letterSpacing:'.06em', textTransform:'uppercase', color:'#404060', marginTop:2 }}>{s.lbl}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:'.56rem', color:'#505070', lineHeight:1.5 }}>{m.note}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {tab === 'analytics' && (
        <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
          {/* Stat boxes */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {[
              { val:`${potdWins}-${potdLoss}`, lbl:'POTD Record', sub:`${potdVoid} void · ${Math.round((potdWins/(potdWins+potdLoss||1))*100)}% WR`, col:'#4ade80' },
              { val:`$${latestBR.toFixed(0)}`, lbl:'Bankroll', sub:'From $50 start', col:'#fbbf24' },
              { val:'77.4%', lbl:'MC YRFI WR', sub:'Best model · 32 bets', col:'#4ade80' },
              { val:activeModels.length, lbl:'Active Models', sub:`${models.filter(m=>m.status==='retired').length} retired`, col:'#60a5fa' },
            ].map(s => (
              <div key={s.lbl} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:'9px 10px' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.5rem', lineHeight:1, color:s.col }}>{s.val}</div>
                <div style={{ fontSize:'.42rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:2 }}>{s.lbl}</div>
                <div style={{ fontSize:'.48rem', color:'#505070', marginTop:2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Bankroll chart */}
          {bankrollData.length > 1 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:'#505070', marginBottom:10 }}>Bankroll History</div>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={bankrollData} margin={{ top:4, right:4, bottom:4, left:-20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a30" />
                  <XAxis dataKey="date" tick={{ fontSize:8, fill:'#404060' }} />
                  <YAxis tick={{ fontSize:8, fill:'#404060' }} />
                  <Tooltip content={<TT />} />
                  <ReferenceLine y={50} stroke="#404060" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="br" name="Bankroll" stroke="#4ade80" strokeWidth={2} dot={{ r:3, fill:'#4ade80' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* WR bar chart */}
          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:'#505070', marginBottom:10 }}>Active Model Win Rates</div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={topModels} margin={{ top:4, right:4, bottom:28, left:-20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a30" />
                <XAxis dataKey="name" tick={{ fontSize:7, fill:'#404060' }} angle={-35} textAnchor="end" interval={0} />
                <YAxis domain={[40,85]} tick={{ fontSize:8, fill:'#404060' }} />
                <Tooltip content={<TT />} />
                <ReferenceLine y={55} stroke="#f87171" strokeDasharray="4 4" />
                <Bar dataKey="wr" name="Win Rate %">
                  {topModels.map((m,i) => <Cell key={i} fill={MODEL_COLORS[m.name]||'#60a5fa'} opacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ROI bar chart */}
          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:'#505070', marginBottom:10 }}>Active Model ROI %</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={topModels} margin={{ top:4, right:4, bottom:28, left:-10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a30" />
                <XAxis dataKey="name" tick={{ fontSize:7, fill:'#404060' }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize:8, fill:'#404060' }} />
                <Tooltip content={<TT />} />
                <ReferenceLine y={0} stroke="#404060" />
                <Bar dataKey="roi" name="ROI %">
                  {topModels.map((m,i) => <Cell key={i} fill={m.roi>0?(MODEL_COLORS[m.name]||'#4ade80'):'#f87171'} opacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* POTD list */}
          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:'#505070', marginBottom:8 }}>POTD History</div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              {[...cards].reverse().map(c => (
                <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, background:'#0c0c1a', borderRadius:5, padding:'6px 8px' }}>
                  <div style={{ fontSize:'.48rem', color:'#505070', width:32, flexShrink:0 }}>{c.date}</div>
                  <div style={{ fontSize:'.6rem', color:'#f0f0f8', flex:1 }}>{c.potd}</div>
                  <div style={{ fontSize:'.8rem' }}>{c.potdResult==='W'?'✅':c.potdResult==='L'?'❌':c.potdResult==='V'?'🔄':'📋'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
