import { useState, useEffect } from 'react'
import { CHECKLIST } from './data.js'

const CL_KEY = 'betlab-checklist-v1'

export default function ChecklistTab() {
  const [checked, setChecked] = useState({})
  const [notes, setNotes] = useState({})
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    try {
      const s = localStorage.getItem(CL_KEY)
      if (s) { const d = JSON.parse(s); setChecked(d.checked||{}); setNotes(d.notes||{}) }
    } catch {}
  }, [])

  const save = (c, n) => {
    try { localStorage.setItem(CL_KEY, JSON.stringify({ checked: c, notes: n })) } catch {}
  }

  const toggle = id => {
    const c = { ...checked, [id]: !checked[id] }
    setChecked(c); save(c, notes)
  }

  const setNote = (id, val) => {
    const n = { ...notes, [id]: val }
    setNotes(n); save(checked, n)
  }

  const reset = () => {
    setChecked({}); setNotes({})
    try { localStorage.removeItem(CL_KEY) } catch {}
  }

  const toggleExpand = id => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const completed = CHECKLIST.filter(c => checked[c.id]).length
  const pct = Math.round((completed / CHECKLIST.length) * 100)

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

      {/* PROGRESS */}
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', color:'#f0f0f8', lineHeight:1 }}>Daily Checklist</div>
            <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.08em', marginTop:2 }}>{completed} of {CHECKLIST.length} steps complete</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.6rem', lineHeight:1, color: pct===100?'#4ade80':pct>=50?'#fbbf24':'#f87171' }}>{pct}%</div>
            <button onClick={reset} style={{ fontSize:'.48rem', color:'#404060', background:'none', border:'none', cursor:'pointer', textTransform:'uppercase', letterSpacing:'.06em' }}>Reset</button>
          </div>
        </div>
        <div style={{ height:6, background:'#1a1a30', borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background: pct===100?'#4ade80':pct>=50?'#fbbf24':'#f87171', borderRadius:3, transition:'width .3s' }} />
        </div>
        {pct === 100 && (
          <div style={{ marginTop:8, padding:'6px 10px', background:'rgba(74,222,128,.1)', border:'1px solid #14532d', borderRadius:6, fontSize:'.6rem', color:'#4ade80', textAlign:'center', fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase' }}>
            ✅ All steps complete — card is ready to build
          </div>
        )}
      </div>

      {/* STEPS */}
      {CHECKLIST.map(item => {
        const done = !!checked[item.id]
        const open = expanded[item.id]
        return (
          <div key={item.id} style={{ background:'#09090f', border:`1px solid ${done?'#14532d':'#1a1a2e'}`, borderRadius:10, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', cursor:'pointer' }} onClick={()=>toggleExpand(item.id)}>
              <button onClick={e=>{e.stopPropagation();toggle(item.id)}} style={{
                width:22, height:22, borderRadius:5, border:`2px solid ${done?'#4ade80':'#2a2a50'}`,
                background: done?'#4ade80':'transparent', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
              }}>
                {done && <span style={{ color:'#060608', fontSize:'.7rem', fontWeight:900 }}>✓</span>}
              </button>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:800, letterSpacing:'.06em', textTransform:'uppercase', color: done?'#4ade80':'#f0f0f8' }}>
                    Step {item.step} — {item.label}
                  </div>
                </div>
                {!open && notes[item.id] && <div style={{ fontSize:'.52rem', color:'#505070', marginTop:2 }}>{notes[item.id]}</div>}
              </div>
              <div style={{ fontSize:'.6rem', color:'#404060' }}>{open?'▲':'▼'}</div>
            </div>
            {open && (
              <div style={{ padding:'0 12px 10px', borderTop:'1px solid #111120' }}>
                <div style={{ fontSize:'.6rem', color:'#808098', lineHeight:1.6, marginBottom:8 }}>{item.desc}</div>
                <textarea
                  value={notes[item.id]||''}
                  onChange={e=>setNote(item.id, e.target.value)}
                  placeholder="Notes for this step..."
                  rows={2}
                  style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'6px 10px', fontSize:'.6rem', color:'#f0f0f8', outline:'none', resize:'none' }}
                />
                <button onClick={()=>toggle(item.id)} style={{
                  width:'100%', padding:7, marginTop:4,
                  background: done?'rgba(248,113,113,.1)':'rgba(74,222,128,.1)',
                  border:`1px solid ${done?'#7f1d1d':'#14532d'}`,
                  borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem',
                  fontWeight:700, textTransform:'uppercase', color: done?'#f87171':'#4ade80',
                }}>{done?'Mark Incomplete':'Mark Complete ✓'}</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
