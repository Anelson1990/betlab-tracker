import { useState, useEffect } from 'react'
import { SEED_CARDS, SEED_MODELS, MODEL_COLORS, STATUS_CONFIG, RESULT_CONFIG } from './data.js'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import TodayCard from './TodayCard.jsx'
import BetCard from './BetCard.jsx'
import ChecklistTab from './Checklist.jsx'
import SharpMoney from './SharpMoney.jsx'
import Knowledge from './Knowledge.jsx'

const STORAGE_KEY = 'betlab-tracker-cards-v1'
const BR_KEY = 'betlab-bankroll-v2'
const DEFAULT_ACCOUNTS = { dk: 150.97, b365: 30.00, pp: 30.00 }

function loadCards() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : SEED_CARDS } catch { return SEED_CARDS }
}
function saveCards(cards) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)) } catch {} }

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0e0e1e', border:'1px solid #1a1a30', borderRadius:6, padding:'6px 10px', fontSize:'.6rem' }}>
      <div style={{ color:'#60a5fa', fontWeight:700, marginBottom:3 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color:p.color||p.fill, display:'flex', justifyContent:'space-between', gap:10 }}>
          <span>{p.name||p.dataKey}</span>
          <span style={{ fontWeight:700 }}>{p.dataKey==='br'||p.dataKey==='profit'?'$'+Number(p.value).toFixed(0):Number(p.value).toFixed(1)+'%'}</span>
        </div>
      ))}
    </div>
  )
}

const EMPTY_FORM = { date:'', potd:'', potdResult:'W', potdPL:'', rfi:'', ml:'', hitParlay:'L', staked:'', pl:'', bankroll:'', notes:'' }

export default function App() {
  const [tab, setTab] = useState('today')
  const [cards, setCards] = useState(loadCards)
  const [models] = useState(SEED_MODELS)
  const [expanded, setExpanded] = useState({})
  const [modelFilter, setModelFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingAcct, setEditingAcct] = useState(null)
  const [acctInput, setAcctInput] = useState('')
  const [accounts, setAccounts] = useState(() => {
    try { const s = localStorage.getItem(BR_KEY); return s ? JSON.parse(s) : DEFAULT_ACCOUNTS } catch { return DEFAULT_ACCOUNTS }
  })

  useEffect(() => { saveCards(cards) }, [cards])

  const saveAcct = () => {
    const val = parseFloat(acctInput)
    if (!val || !editingAcct) return
    const updated = { ...accounts, [editingAcct]: val }
    setAccounts(updated)
    try { localStorage.setItem(BR_KEY, JSON.stringify(updated)) } catch {}
    setEditingAcct(null); setAcctInput('')
  }

  // Adjust a platform balance by a delta (sportsbook-style hold/credit)
  const adjustAccount = (platform, delta) => {
    const key = (platform||'dk').toLowerCase()
    setAccounts(prev => {
      const acctKey = prev[key] !== undefined ? key : 'dk'
      const updated = { ...prev, [acctKey]: Math.round(((prev[acctKey]||0) + delta) * 100) / 100 }
      try { localStorage.setItem(BR_KEY, JSON.stringify(updated)) } catch {}
      return updated
    })
  }

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }))
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addCard = () => {
    if (!form.date || !form.potd) return
    const card = { id: Date.now().toString(), date:form.date, potd:form.potd, potdResult:form.potdResult, potdPL:parseFloat(form.potdPL)||0, rfi:form.rfi, ml:form.ml, hitParlay:form.hitParlay, staked:parseFloat(form.staked)||0, pl:parseFloat(form.pl)||0, bankroll:parseFloat(form.bankroll)||0, notes:form.notes }
    setCards(prev => [...prev, card])
    setForm(EMPTY_FORM); setShowForm(false)
  }

  const deleteCard = (id, e) => {
    e.stopPropagation()
    if (window.confirm('Delete this card?')) setCards(prev => prev.filter(c => c.id !== id))
  }

  // Stats
  const realCards = cards.filter(c => c.potdResult !== 'P')
  const potdWins = realCards.filter(c => c.potdResult === 'W').length
  const potdLoss = realCards.filter(c => c.potdResult === 'L').length
  const potdVoid = realCards.filter(c => c.potdResult === 'V').length
  const latestBR = Object.values(accounts).reduce((a,b) => a+b, 0)
  const totalPL = cards.reduce((a,c) => a+c.pl, 0)
  const activeModels = models.filter(m => m.status === 'active')
  const filteredModels = modelFilter === 'all' ? models : models.filter(m => m.status === modelFilter)
  const bankrollData = cards.filter(c => c.bankroll > 0).map(c => ({ date:c.date, br:c.bankroll }))
  const topModels = [...activeModels].sort((a,b) => b.roi - a.roi).slice(0, 8).map(m => ({
    ...m,
    wr: m.bets ? Math.round((m.wins/m.bets)*100) : 0
  }))
  const GOAL = 300

  const tabs = [
    ['today','🎯 Today'],
    ['paper','📋 Paper'],
    ['sharp','💰 Sharp'],
    ['cards','🗂 Cards'],
    ['models','📊 Models'],
    ['analytics','📈 Stats'],
    ['knowledge','📖 Learn'],
  ]

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
            <div style={{ textAlign:'right' }}>
              {[['dk','DK','#60a5fa'],['b365','B365','#4ade80'],['pp','PP','#f97316']].map(([key,label,color]) => (
                <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4, marginBottom:2 }}>
                  <div style={{ fontSize:'.38rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', width:20 }}>{label}</div>
                  {editingAcct === key ? (
                    <div style={{ display:'flex', gap:2 }}>
                      <input value={acctInput} onChange={e=>setAcctInput(e.target.value)} type="number"
                        style={{ width:60, background:'#0c0c1a', border:`1px solid ${color}`, borderRadius:4, padding:'2px 4px', fontSize:'.62rem', color:'#f0f0f8', outline:'none', textAlign:'right' }}
                        onKeyDown={e=>e.key==='Enter'&&saveAcct()} autoFocus />
                      <button onClick={saveAcct} style={{ padding:'2px 5px', background:'#2563eb', border:'none', borderRadius:3, fontSize:'.55rem', color:'#fff' }}>✓</button>
                      <button onClick={()=>setEditingAcct(null)} style={{ padding:'2px 4px', background:'#1a1a30', border:'none', borderRadius:3, fontSize:'.55rem', color:'#505070' }}>✕</button>
                    </div>
                  ) : (
                    <div onClick={()=>{setAcctInput(accounts[key].toFixed(2));setEditingAcct(key)}} style={{ cursor:'pointer', fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:700, color }}>
                      ${accounts[key].toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.1rem', color:'#4ade80', lineHeight:1, borderTop:'1px solid #1a1a30', paddingTop:2, marginTop:2 }}>${latestBR.toFixed(2)}</div>
              <div style={{ fontSize:'.32rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060' }}>Total · tap to edit</div>
            </div>
          </div>
        </div>

        {/* Goal progress bar */}
        <div style={{ marginBottom:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
            <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.08em' }}>Goal: ${GOAL}</div>
            <div style={{ fontSize:'.44rem', color:'#4ade80' }}>{Math.round((latestBR/GOAL)*100)}%</div>
          </div>
          <div style={{ height:4, background:'#1a1a30', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Math.min(100,(latestBR/GOAL)*100)}%`, background:'linear-gradient(90deg,#2563eb,#4ade80)', borderRadius:2 }} />
          </div>
        </div>

        <div style={{ display:'flex', gap:3, overflowX:'auto' }}>
          {tabs.map(([t,l]) => (
            <button key={t} onClick={()=>setTab(t)} style={{
              flexShrink:0, padding:'6px 8px',
              fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.6rem', fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase',
              border:'1px solid', borderRadius:6, transition:'all .15s',
              background: tab===t?'#1a1a30':'#0c0c1a', color: tab===t?'#f0f0f8':'#404060', borderColor: tab===t?'#2a2a50':'#1a1a30',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* STRIP */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, padding:'10px 12px', background:'#07070f', borderBottom:'1px solid #1a1a30' }}>
        {[
          { val:`${potdWins}-${potdLoss}`, lbl:'POTD', color:'#4ade80' },
          { val:`${totalPL>=0?'+':''}$${totalPL.toFixed(0)}`, lbl:'Net P&L', color:totalPL>=0?'#4ade80':'#f87171' },
          { val:cards.length, lbl:'Days', color:'#60a5fa' },
          { val:activeModels.length, lbl:'Active', color:'#a78bfa' },
        ].map(s => (
          <div key={s.lbl} style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, lineHeight:1, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:'.38rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:2 }}>{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* TODAY TAB */}
      {tab === 'today' && (
        <div style={{ padding:'10px 12px' }}>
          <TodayCard accounts={accounts} adjustAccount={adjustAccount} />
        </div>
      )}

      {/* PAPER BETS TAB */}
      {tab === 'paper' && (
        <div style={{ padding:'10px 12px' }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem',
            fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase',
            color:'#505070', marginBottom:10 }}>
            📋 Paper Picks — Today
          </div>
          <div style={{ background:'#09090f', border:'1px solid #1a1a2e',
            borderRadius:10, padding:12, marginBottom:10 }}>
            <div style={{ fontSize:'.6rem', color:'#404060', marginBottom:8,
              letterSpacing:'.1em', textTransform:'uppercase' }}>
              Paper picks track model performance without real money.
              Grade them at end of day to build your stats.
            </div>
            {(() => {
              try {
                const s = localStorage.getItem('betlab-today-v3')
                const c = s ? JSON.parse(s) : null
                if (!c || !c.ml || c.ml.length === 0) {
                  return <div style={{ color:'#404060', fontSize:'.75rem', textAlign:'center', padding:'20px 0' }}>
                    No paper picks today — paste today\'s JSON on the Today tab
                  </div>
                }
                return c.ml.map((b,i) => (
                  <div key={i} style={{ background:'#0c0c1a', border:'1px solid #1a1a2e',
                    borderLeft:`3px solid ${b.result==='win'?'#4ade80':b.result==='loss'?'#f87171':'#334155'}`,
                    borderRadius:8, padding:'10px 12px', marginBottom:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ color:'#f0f0f8', fontSize:'.8rem', fontWeight:700 }}>
                          {b.direction} · {b.game}
                        </div>
                        <div style={{ color:'#404060', fontSize:'.65rem', marginTop:2 }}>{b.sources}</div>
                        <div style={{ color:'#60a5fa', fontSize:'.72rem', fontWeight:700, marginTop:2 }}>{b.odds}</div>
                      </div>
                      <div style={{ color:b.result==='win'?'#4ade80':b.result==='loss'?'#f87171':'#6060a0',
                        fontSize:'1rem', fontWeight:700 }}>
                        {b.result==='win'?'✅':b.result==='loss'?'❌':b.result==='void'?'🔄':'⏳'}
                      </div>
                    </div>
                  </div>
                ))
              } catch { return null }
            })()}
          </div>
        </div>
      )}

      {/* SHARP MONEY TAB */}
      {tab === 'sharp' && <SharpMoney />}

      {/* CARDS TAB */}
      {tab === 'cards' && (
        <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>
          {[...cards].reverse().map(c => {
            const rc = RESULT_CONFIG[c.potdResult] || RESULT_CONFIG.P
            const isOpen = expanded[c.id]
            const borderColor = c.potdResult==='W'?'#14532d':c.potdResult==='L'?'#7f1d1d':c.potdResult==='V'?'#334155':'#1e40af'
            return (
              <div key={c.id} style={{ background:'#09090f', border:`1px solid ${borderColor}`, borderRadius:10, overflow:'hidden' }}>
                <div onClick={()=>toggle(c.id)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px 8px', cursor:'pointer' }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:'#505070', width:34, flexShrink:0 }}>{c.date}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.95rem', fontWeight:800, color:'#f0f0f8', lineHeight:1.1 }}>{c.potd}</div>
                    <div style={{ fontSize:'.38rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:1 }}>Pick of the Day</div>
                  </div>
                  <div style={{ borderRadius:5, padding:'3px 7px', fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, border:`1px solid ${rc.border}`, color:rc.color, background:rc.bg, flexShrink:0 }}>{rc.label}</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.95rem', fontWeight:800, color:c.potdPL>=0?'#4ade80':'#f87171', width:44, textAlign:'right', flexShrink:0 }}>
                    {c.potdPL>=0?'+':''}${Math.abs(c.potdPL).toFixed(0)}
                  </div>
                  <button onClick={e=>deleteCard(c.id,e)} style={{ background:'none', border:'none', color:'#404060', fontSize:'.7rem', padding:'0 0 0 4px', flexShrink:0 }}>✕</button>
                </div>
                {isOpen && (
                  <div style={{ padding:'0 12px 10px', borderTop:'1px solid #111120' }}>
                    {[
                      ['RFI Record',   c.rfi||'—',    null],
                      ['ML Record',    c.ml||'—',     null],
                      ['SGP/Parlay',   c.hitParlay==='W'?'✅ Win':c.hitParlay==='P'?'📋 Paper':'❌ Loss', c.hitParlay==='W'?'#4ade80':c.hitParlay==='P'?'#60a5fa':'#f87171'],
                      ['Total Staked', `$${c.staked.toFixed(2)}`, null],
                      ['Total P&L',    `${c.pl>=0?'+':''}$${c.pl.toFixed(2)}`, c.pl>=0?'#4ade80':'#f87171'],
                      ['Bankroll End', `$${c.bankroll.toFixed(2)}`, '#fbbf24'],
                    ].map(([lbl,val,col]) => (
                      <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid #0d0d1a' }}>
                        <span style={{ fontSize:'.52rem', letterSpacing:'.06em', textTransform:'uppercase', color:'#404060' }}>{lbl}</span>
                        <span style={{ fontSize:'.62rem', fontWeight:600, color:col||'#a0a0c0' }}>{val}</span>
                      </div>
                    ))}
                    {c.notes && (
                      <div style={{ fontSize:'.6rem', color:'#6060a0', lineHeight:1.6, marginTop:8, paddingTop:6, borderTop:'1px solid #0d0d1a' }}>
                        {c.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {!showForm ? (
            <button onClick={()=>setShowForm(true)} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff', marginTop:2 }}>+ Log Card Manually</button>
          ) : (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:'#505070', marginBottom:10 }}>Log Card</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                {[['date','Date','Jun 14','text'],['potd','POTD Pick','ATL ML -116','text']].map(([k,l,p,t]) => (
                  <div key={k}>
                    <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>{l}</label>
                    <input value={form[k]} onChange={e=>setF(k,e.target.value)} placeholder={p} type={t} style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>POTD Result</label>
                  <select value={form.potdResult} onChange={e=>setF('potdResult',e.target.value)} style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }}>
                    <option value="W">✅ Win</option><option value="L">❌ Loss</option><option value="V">🔄 Void</option><option value="P">📋 Paper</option>
                  </select>
                </div>
                {[['potdPL','POTD P&L ($)','10.00','number'],['rfi','RFI Record','2-1','text'],['ml','ML Record','1-0','text'],['staked','Total Staked ($)','40.00','number'],['pl','Total P&L ($)','-5.00','number'],['bankroll','Bankroll End ($)','45.00','number']].map(([k,l,p,t]) => (
                  <div key={k}>
                    <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>{l}</label>
                    <input value={form[k]} onChange={e=>setF(k,e.target.value)} placeholder={p} type={t} style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
                  </div>
                ))}
              </div>
              <div style={{ marginBottom:6 }}>
                <label style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3, display:'block' }}>Notes</label>
                <input value={form.notes} onChange={e=>setF('notes',e.target.value)} placeholder="Key picks, lessons..." style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' }} />
              </div>
              <button onClick={addCard} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, textTransform:'uppercase', color:'#fff', marginBottom:4 }}>Save</button>
              <button onClick={()=>setShowForm(false)} style={{ width:'100%', padding:9, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, textTransform:'uppercase', color:'#505070' }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* MODELS TAB */}
      {tab === 'models' && (
        <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:2 }}>
            {[['all','All'],['active','Active'],['monitor','Monitor'],['display','Display'],['retired','Retired']].map(([v,l]) => (
              <button key={v} onClick={()=>setModelFilter(v)} style={{ padding:'4px 8px', background:modelFilter===v?'#1a1a30':'#0c0c1a', border:'1px solid #1a1a30', borderRadius:4, fontSize:'.52rem', fontWeight:700, textTransform:'uppercase', color:modelFilter===v?'#f0f0f8':'#404060' }}>{l}</button>
            ))}
          </div>
          {filteredModels.map(m => {
            const color = MODEL_COLORS[m.name] || '#60a5fa'
            const sc = STATUS_CONFIG[m.status]
            const wr = m.bets ? Math.round((m.wins/m.bets)*100) : 0
            const isOpen = expanded['m_'+m.name]
            return (
              <div key={m.name} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, overflow:'hidden' }}>
                <div onClick={()=>toggle('m_'+m.name)} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 10px 6px', cursor:'pointer' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }} />
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color, flex:1 }}>{m.name}</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:700, color }}>{wr}% WR</div>
                  <div style={{ fontSize:'.58rem', fontWeight:700, color:m.roi>0?'#4ade80':'#f87171', width:44, textAlign:'right' }}>{m.roi>0?'+':''}{m.roi}%</div>
                  <div style={{ borderRadius:4, padding:'2px 5px', fontSize:'.38rem', fontWeight:700, textTransform:'uppercase', border:`1px solid ${sc.border}`, color:sc.color, background:sc.bg, flexShrink:0 }}>{sc.label}</div>
                </div>
                <div style={{ height:4, background:'#1a1a30', margin:'0 10px 6px', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.max(0,wr)}%`, background:color, opacity:0.7, borderRadius:2 }} />
                </div>
                {isOpen && (
                  <div style={{ padding:'0 10px 10px', borderTop:'1px solid #111120' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4, margin:'8px 0' }}>
                      {[{val:`${m.wins}-${m.bets-m.wins}`,lbl:'Record',col:color},{val:`${m.profit>=0?'+':''}$${m.profit.toFixed(0)}`,lbl:'Profit',col:m.profit>=0?'#4ade80':'#f87171'},{val:m.bets,lbl:'Bets',col:'#fbbf24'}].map(s => (
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

      {/* KNOWLEDGE TAB */}
      {tab === 'knowledge' && <Knowledge />}

      {/* ANALYTICS TAB */}
      {tab === 'analytics' && (
        <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {[
              {val:`${potdWins}-${potdLoss}`,lbl:'POTD Record',sub:`${potdVoid} void · ${Math.round((potdWins/(potdWins+potdLoss||1))*100)}% WR`,col:'#4ade80'},
              {val:`$${latestBR.toFixed(0)}`,lbl:'Bankroll',sub:`Goal $${GOAL} · ${Math.round((latestBR/GOAL)*100)}%`,col:'#fbbf24'},
              {val:'72.7%',lbl:'MC YRFI WR',sub:'Best model · 33 bets',col:'#4ade80'},
              {val:'81.5%',lbl:'Hit Lock WR',sub:'Best prop · 27 bets',col:'#f97316'},
            ].map(s => (
              <div key={s.lbl} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:'9px 10px' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.5rem', lineHeight:1, color:s.col }}>{s.val}</div>
                <div style={{ fontSize:'.42rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:2 }}>{s.lbl}</div>
                <div style={{ fontSize:'.48rem', color:'#505070', marginTop:2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Bankroll vs Goal */}
          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:6 }}>Bankroll vs $300 Goal</div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:'.52rem', color:'#4ade80' }}>${latestBR.toFixed(2)}</span>
              <span style={{ fontSize:'.52rem', color:'#404060' }}>$300 goal</span>
            </div>
            <div style={{ height:8, background:'#1a1a30', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(100,(latestBR/GOAL)*100)}%`, background:'linear-gradient(90deg,#2563eb,#4ade80)', borderRadius:4 }} />
            </div>
            <div style={{ fontSize:'.5rem', color:'#404060', marginTop:4 }}>Need ${Math.max(0,GOAL-latestBR).toFixed(2)} more to hit goal</div>
          </div>

          {bankrollData.length > 1 && (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:10 }}>Bankroll History</div>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={bankrollData} margin={{ top:4, right:4, bottom:4, left:-20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a30" />
                  <XAxis dataKey="date" tick={{ fontSize:8, fill:'#404060' }} />
                  <YAxis tick={{ fontSize:8, fill:'#404060' }} />
                  <Tooltip content={<TT />} />
                  <ReferenceLine y={50} stroke="#404060" strokeDasharray="3 3" />
                  <ReferenceLine y={300} stroke="#2563eb" strokeDasharray="4 2" label={{ value:'Goal', fill:'#2563eb', fontSize:8, position:'right' }} />
                  <Line type="monotone" dataKey="br" name="Bankroll" stroke="#4ade80" strokeWidth={2} dot={{ r:3, fill:'#4ade80' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Paper Bets History & Stats */}
          {(() => {
            let papers = []
            try { papers = JSON.parse(localStorage.getItem('betlab-paper-history-v1')||'[]') } catch {}
            const live = (() => {
              try {
                const c = JSON.parse(localStorage.getItem('betlab-today-v3')||'{}')
                return (c.ml||[]).filter(b=>b.result && b.result!=='pending').map(b=>({
                  date:c.date||'Today', pick:b.direction||b.sources||b.game||'Paper', game:b.game||'', odds:b.odds||'', result:b.result
                }))
              } catch { return [] }
            })()
            const all = [...papers, ...live]
            const w = all.filter(p=>p.result==='win').length
            const l = all.filter(p=>p.result==='loss').length
            const v = all.filter(p=>p.result==='void').length
            const wr = w+l>0 ? Math.round((w/(w+l))*100) : 0
            return (
              <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>📋 Paper Bets — Model Tracking</div>
                {all.length === 0 ? (
                  <div style={{ fontSize:'.6rem', color:'#404060', textAlign:'center', padding:'8px 0' }}>
                    No graded paper bets yet. Grade paper picks and archive the day to build history.
                  </div>
                ) : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:8 }}>
                      {[
                        {val:`${w}-${l}`, lbl:'Record', col:'#4ade80'},
                        {val:`${wr}%`, lbl:'Win Rate', col: wr>=58?'#4ade80':wr>=50?'#fbbf24':'#f87171'},
                        {val:`${all.length}`, lbl:'Total', col:'#60a5fa'},
                      ].map(s => (
                        <div key={s.lbl} style={{ background:'#0c0c1a', border:'1px solid #1a1a2e', borderRadius:6, padding:'7px 8px', textAlign:'center' }}>
                          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', lineHeight:1, color:s.col }}>{s.val}</div>
                          <div style={{ fontSize:'.42rem', letterSpacing:'.06em', textTransform:'uppercase', color:'#404060', marginTop:2 }}>{s.lbl}</div>
                        </div>
                      ))}
                    </div>
                    {v>0 && <div style={{ fontSize:'.5rem', color:'#505070', marginBottom:6 }}>{v} void/push (excluded from WR)</div>}
                    <div style={{ maxHeight:200, overflowY:'auto' }}>
                      {all.slice().reverse().map((p,i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid #0d0d1a' }}>
                          <div style={{ flex:1, paddingRight:8 }}>
                            <div style={{ fontSize:'.62rem', color:'#a0a0c0' }}>{p.pick}</div>
                            <div style={{ fontSize:'.46rem', color:'#404060' }}>{p.date}{p.game?' · '+p.game:''}{p.odds?' · '+p.odds:''}</div>
                          </div>
                          <div style={{ fontSize:'.7rem' }}>{p.result==='win'?'✅':p.result==='loss'?'❌':'🔄'}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })()}

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:10 }}>Active Model Win Rates</div>
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

          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>POTD History</div>
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
