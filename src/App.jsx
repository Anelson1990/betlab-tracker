import { useState, useEffect } from 'react'
import { CHECKLIST } from './data.js'
import { SPORTS } from './sportApi.js'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import SharpMoney from './SharpMoney.jsx'
import ChecklistTab from './Checklist.jsx'
import Knowledge from './Knowledge.jsx'

const BR_KEY = 'betlab-bankroll-v2'
const BR_HISTORY_KEY = 'betlab-bankroll-history-v1'
const GOAL_KEY = 'betlab-goal-v1'
const DEFAULT_ACCOUNTS = { dk: 150.97, b365: 30.00, pp: 30.00 }
const DEFAULT_GOAL = 300

function isoToday() {
  return new Date().toISOString().split('T')[0]
}

function loadBankrollHistory() {
  try { const h = localStorage.getItem(BR_HISTORY_KEY); return h ? JSON.parse(h) : [] } catch { return [] }
}
function saveBankrollHistory(h) { try { localStorage.setItem(BR_HISTORY_KEY, JSON.stringify(h)) } catch {} }

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0e0e1e', border:'1px solid #1a1a30', borderRadius:6, padding:'6px 10px', fontSize:'.6rem' }}>
      <div style={{ color:'#60a5fa', fontWeight:700, marginBottom:3 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color:p.color||p.fill, display:'flex', justifyContent:'space-between', gap:10 }}>
          <span>{p.name||p.dataKey}</span>
          <span style={{ fontWeight:700 }}>${Number(p.value).toFixed(0)}</span>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('sharp')
  const [activeSport, setActiveSport] = useState('mlb')
  const [editingAcct, setEditingAcct] = useState(null)
  const [acctInput, setAcctInput] = useState('')
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [calMonthOffset, setCalMonthOffset] = useState(0)
  const [accounts, setAccounts] = useState(() => {
    try { const s = localStorage.getItem(BR_KEY); return s ? JSON.parse(s) : DEFAULT_ACCOUNTS } catch { return DEFAULT_ACCOUNTS }
  })
  const [goal, setGoal] = useState(() => {
    try { const s = localStorage.getItem(GOAL_KEY); return s ? parseFloat(s) : DEFAULT_GOAL } catch { return DEFAULT_GOAL }
  })
  const [bankrollHistory, setBankrollHistory] = useState(loadBankrollHistory)

  const latestBR = Object.values(accounts).reduce((a,b) => a+b, 0)

  // Auto-snapshot today's total bankroll whenever accounts change. Overwrites
  // today's entry (not append) so multiple edits in one day don't spam history.
  useEffect(() => {
    const today = isoToday()
    setBankrollHistory(prev => {
      const idx = prev.findIndex(h => h.date === today)
      const next = [...prev]
      if (idx >= 0) next[idx] = { date: today, total: latestBR }
      else next.push({ date: today, total: latestBR })
      next.sort((a,b) => a.date.localeCompare(b.date))
      saveBankrollHistory(next)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestBR])

  const saveAcct = () => {
    const val = parseFloat(acctInput)
    if (!val || !editingAcct) return
    const updated = { ...accounts, [editingAcct]: val }
    setAccounts(updated)
    try { localStorage.setItem(BR_KEY, JSON.stringify(updated)) } catch {}
    setEditingAcct(null); setAcctInput('')
  }

  const saveGoal = () => {
    const val = parseFloat(goalInput)
    if (!val) return
    setGoal(val)
    try { localStorage.setItem(GOAL_KEY, JSON.stringify(val)) } catch {}
    setEditingGoal(false); setGoalInput('')
  }

  const tabs = [
    ['sharp','💰 Sharp'],
    ['stats','📈 Stats'],
    ['checklist','✅ Checklist'],
    ['learn','📖 Learn'],
  ]

  const goalPct = Math.min(100, Math.round((latestBR/goal)*100))

  return (
    <div style={{ background:'#060608', minHeight:'100vh', maxWidth:520, margin:'0 auto' }}>

      {/* HEADER */}
      <div style={{ background:'linear-gradient(180deg,#08081a,#060608)', padding:'14px 14px 10px', borderBottom:'1px solid #1a1a30', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.8rem', letterSpacing:'.06em' }}>
            <span style={{ background:'linear-gradient(135deg,#fff,#7070a0)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Bet</span>
            <span style={{ background:'linear-gradient(135deg,#93c5fd,#2563eb)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Lab</span>
            <span style={{ background:'linear-gradient(135deg,#fff,#7070a0)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}> Sharp</span>
          </div>
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

        {/* Goal progress bar — tap the goal amount to edit */}
        <div style={{ marginBottom:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
            {editingGoal ? (
              <div style={{ display:'flex', gap:2, alignItems:'center' }}>
                <span style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase' }}>Goal: $</span>
                <input value={goalInput} onChange={e=>setGoalInput(e.target.value)} type="number"
                  style={{ width:50, background:'#0c0c1a', border:'1px solid #4ade80', borderRadius:4, padding:'1px 3px', fontSize:'.5rem', color:'#f0f0f8', outline:'none' }}
                  onKeyDown={e=>e.key==='Enter'&&saveGoal()} autoFocus />
                <button onClick={saveGoal} style={{ padding:'1px 4px', background:'#2563eb', border:'none', borderRadius:3, fontSize:'.5rem', color:'#fff' }}>✓</button>
              </div>
            ) : (
              <div onClick={()=>{setGoalInput(String(goal));setEditingGoal(true)}} style={{ cursor:'pointer', fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.08em' }}>Goal: ${goal} ✎</div>
            )}
            <div style={{ fontSize:'.44rem', color:'#4ade80' }}>{goalPct}%</div>
          </div>
          <div style={{ height:4, background:'#1a1a30', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${goalPct}%`, background:'linear-gradient(90deg,#2563eb,#4ade80)', borderRadius:2 }} />
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

      {/* SHARP TAB — sport selector + per-sport tracker */}
      {tab === 'sharp' && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, padding:'10px 12px', background:'#07070f', borderBottom:'1px solid #1a1a30' }}>
            {SPORTS.map(s => (
              <button key={s.key} onClick={()=>setActiveSport(s.key)} style={{
                padding:'8px 4px',
                fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, letterSpacing:'.04em', textTransform:'uppercase',
                border:'1px solid', borderRadius:7,
                background: activeSport===s.key?'#1a1a30':'#0c0c1a', color: activeSport===s.key?'#f0f0f8':'#404060', borderColor: activeSport===s.key?'#2a2a50':'#1a1a30',
              }}>{s.emoji} {s.label}</button>
            ))}
          </div>
          <SharpMoney sport={activeSport} />
        </>
      )}

      {/* STATS TAB — bankroll tracker, calendar, line graph, adjustable goal meter. Nothing else. */}
      {tab === 'stats' && (
        <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:10 }}>

          {/* Strip: quick bankroll facts */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4 }}>
            {[
              { val:`$${latestBR.toFixed(0)}`, lbl:'Bankroll', color:'#4ade80' },
              { val:`${goalPct}%`, lbl:'To Goal', color:'#60a5fa' },
              { val:bankrollHistory.length, lbl:'Days Tracked', color:'#a78bfa' },
            ].map(s => (
              <div key={s.lbl} style={{ textAlign:'center', background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:'8px 4px' }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, lineHeight:1, color:s.color }}>{s.val}</div>
                <div style={{ fontSize:'.38rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:2 }}>{s.lbl}</div>
              </div>
            ))}
          </div>

          {/* Adjustable goal meter */}
          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070' }}>Goal Meter</div>
              {editingGoal ? (
                <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                  <input value={goalInput} onChange={e=>setGoalInput(e.target.value)} type="number"
                    style={{ width:70, background:'#0c0c1a', border:'1px solid #4ade80', borderRadius:5, padding:'4px 6px', fontSize:'.7rem', color:'#f0f0f8', outline:'none' }}
                    onKeyDown={e=>e.key==='Enter'&&saveGoal()} autoFocus />
                  <button onClick={saveGoal} style={{ padding:'4px 8px', background:'#2563eb', border:'none', borderRadius:5, fontSize:'.6rem', color:'#fff' }}>Save</button>
                </div>
              ) : (
                <button onClick={()=>{setGoalInput(String(goal));setEditingGoal(true)}} style={{ padding:'4px 10px', background:'rgba(74,222,128,.1)', border:'1px solid #14532d', borderRadius:5, fontSize:'.6rem', color:'#4ade80', fontWeight:700 }}>Edit Goal ✎</button>
              )}
            </div>
            <div style={{ textAlign:'center', marginBottom:10 }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'2.2rem', color:'#f0f0f8', lineHeight:1 }}>${latestBR.toFixed(2)}</div>
              <div style={{ fontSize:'.5rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.08em', marginTop:2 }}>of ${goal.toFixed(0)} goal · ${Math.max(0,goal-latestBR).toFixed(2)} to go</div>
            </div>
            <div style={{ height:10, background:'#1a1a30', borderRadius:5, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${goalPct}%`, background:'linear-gradient(90deg,#2563eb,#4ade80)', borderRadius:5, transition:'width .3s' }} />
            </div>
          </div>

          {/* Line graph */}
          <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, textTransform:'uppercase', color:'#505070', marginBottom:8 }}>Bankroll Over Time</div>
            {bankrollHistory.length < 2 ? (
              <div style={{ fontSize:'.6rem', color:'#404060', textAlign:'center', padding:'20px 0' }}>Need at least 2 days logged to draw a trend line.</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={bankrollHistory.map(h => ({ date: h.date.slice(5), total: h.total }))} margin={{ top:4, right:4, bottom:4, left:-20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a30" />
                  <XAxis dataKey="date" tick={{ fontSize:7, fill:'#404060' }} />
                  <YAxis tick={{ fontSize:8, fill:'#404060' }} domain={['dataMin - 10','dataMax + 10']} />
                  <Tooltip content={<TT />} />
                  <Line type="monotone" dataKey="total" name="Bankroll" stroke="#4ade80" strokeWidth={2} dot={{ r:2, fill:'#4ade80' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Calendar */}
          {(() => {
            const byDate = {}
            bankrollHistory.forEach(h => { byDate[h.date] = h.total })
            const sortedDates = Object.keys(byDate).sort()

            const now = new Date()
            const viewDate = new Date(now.getFullYear(), now.getMonth() + calMonthOffset, 1)
            const monthLabel = viewDate.toLocaleDateString('en-US', { month:'long', year:'numeric' })
            const year = viewDate.getFullYear()
            const month = viewDate.getMonth()
            const firstDay = new Date(year, month, 1).getDay()
            const daysInMonth = new Date(year, month + 1, 0).getDate()
            const cells = [...Array(firstDay).fill(null), ...Array(daysInMonth).keys()].map((d,i) => d === null ? null : d + 1)

            return (
              <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <button onClick={()=>setCalMonthOffset(o=>o-1)} style={{ background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:5, padding:'3px 8px', color:'#60a5fa', fontSize:'.7rem' }}>‹</button>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#505070' }}>{monthLabel}</div>
                  <button onClick={()=>setCalMonthOffset(o=>o+1)} style={{ background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:5, padding:'3px 8px', color:'#60a5fa', fontSize:'.7rem' }}>›</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3, marginBottom:4 }}>
                  {['S','M','T','W','T','F','S'].map((d,i) => (
                    <div key={i} style={{ textAlign:'center', fontSize:'.4rem', color:'#404060', fontWeight:700 }}>{d}</div>
                  ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
                  {cells.map((d,i) => {
                    if (d === null) return <div key={'e'+i} />
                    const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                    const total = byDate[dateKey]
                    const has = total !== undefined
                    // day-over-day delta vs the most recent PRIOR logged date (not just calendar-adjacent)
                    let delta = null
                    if (has) {
                      const priorDates = sortedDates.filter(dt => dt < dateKey)
                      if (priorDates.length > 0) delta = total - byDate[priorDates[priorDates.length-1]]
                    }
                    const up = delta === null ? true : delta >= 0
                    return (
                      <div key={'d'+i} style={{
                        aspectRatio:'1', borderRadius:5, padding:'2px',
                        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                        background: has ? (up ? 'rgba(74,222,128,.15)' : 'rgba(248,113,113,.15)') : '#0c0c16',
                        border: `1px solid ${has ? (up ? '#4ade8055' : '#f8717155') : '#13131f'}` }}>
                        <div style={{ fontSize:'.5rem', color: has ? (up?'#4ade80':'#f87171') : '#404060', fontWeight:700 }}>{d}</div>
                        {has && delta !== null && (
                          <div style={{ fontSize:'.46rem', fontWeight:800, color: up?'#4ade80':'#f87171', lineHeight:1 }}>
                            {delta>=0?'+':''}{Math.round(delta)}
                          </div>
                        )}
                        {has && delta === null && (
                          <div style={{ fontSize:'.4rem', fontWeight:700, color:'#60a5fa', lineHeight:1 }}>${Math.round(total)}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display:'flex', gap:10, marginTop:8, justifyContent:'center' }}>
                  <span style={{ fontSize:'.48rem', color:'#4ade80' }}>● Green = up day</span>
                  <span style={{ fontSize:'.48rem', color:'#f87171' }}>● Red = down day</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* CHECKLIST TAB */}
      {tab === 'checklist' && <ChecklistTab />}

      {/* LEARN TAB */}
      {tab === 'learn' && <Knowledge />}

    </div>
  )
}
