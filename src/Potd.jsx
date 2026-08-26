import { useState } from 'react'
import { SPORTS, parseCardDate, fetchGames, matchGame, decideWin } from './sportApi.js'

const IS = { flex:1, padding:'6px 8px', background:'#0c0c1a', border:'1px solid #1a1a2e', borderRadius:6, color:'#e0e0f0', fontSize:'.68rem', boxSizing:'border-box' }
const GLOBAL_POTD_KEY = 'betlab-potd-v1'
const LEGACY_MLB_KEY = 'betlab-potd-v1-mlb' // old per-sport key, only MLB ever had real entries

function marginRead(result, margin) {
  if (result !== 'loss' || margin === undefined || margin === null) return null
  if (margin <= 2) return { label: 'close — variance', color: '#94a3b8' }
  if (margin <= 4) return { label: 'moderate margin', color: '#fbbf24' }
  return { label: 'blowout — real miss', color: '#f87171' }
}

function loadPotd() {
  try {
    const g = localStorage.getItem(GLOBAL_POTD_KEY)
    if (g) {
      const parsed = JSON.parse(g)
      return Array.isArray(parsed) ? parsed : []
    }
    // One-time migration: the old per-sport key only ever held MLB data
    // (this tab was previously nested inside the MLB Sharp view, so no
    // other sport's POTD data could exist). Carry it forward with an
    // explicit sport field so the real win/loss record isn't lost.
    const legacy = localStorage.getItem(LEGACY_MLB_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy)
      const migrated = (Array.isArray(parsed) ? parsed : []).map(e => ({ ...e, sport: e.sport || 'mlb' }))
      localStorage.setItem(GLOBAL_POTD_KEY, JSON.stringify(migrated))
      return migrated
    }
    return []
  } catch { return [] }
}

export default function Potd() {
  const today = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })
  const [entries, setEntries] = useState(loadPotd)
  const [showAdd, setShowAdd] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteInput, setPasteInput] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [form, setForm] = useState({ sport:'mlb', game:'', pick:'', odds:'', notes:'' })
  const [grading, setGrading] = useState(null) // entry id currently grading
  const [gradeLog, setGradeLog] = useState([])

  const save = (next) => {
    setEntries(next)
    try { localStorage.setItem(GLOBAL_POTD_KEY, JSON.stringify(next)) } catch {}
  }

  const add = () => {
    if (!form.game || !form.pick) return
    save([...entries, {
      id: Date.now().toString(), date: today, sport: form.sport, game: form.game, pick: form.pick,
      odds: form.odds, notes: form.notes, result: 'pending',
    }])
    setForm({ sport:'mlb', game:'', pick:'', odds:'', notes:'' })
    setShowAdd(false)
  }

  const addNoPlay = () => {
    save([...entries, {
      id: Date.now().toString(), date: today, sport: form.sport, game: '—', pick: 'NO PLAY',
      odds: '', notes: form.notes || 'No qualifying signal — model declined to fire.',
      result: 'noplay',
    }])
    setForm({ sport:'mlb', game:'', pick:'', odds:'', notes:'' })
    setShowAdd(false)
  }

  const loadJSON = () => {
    try {
      const parsed = JSON.parse(pasteInput.trim())
      const entry = Array.isArray(parsed) ? parsed[0] : parsed
      if (!entry.game || !entry.pick) { setPasteError('JSON must have "game" and "pick" fields'); return }
      save([...entries, {
        id: Date.now().toString(), date: entry.date || today,
        sport: entry.sport || 'mlb', // defaults to mlb to match historical convention
        game: entry.game, pick: entry.pick, odds: entry.odds || '', notes: entry.notes || '',
        result: ['win','loss','noplay'].includes(entry.result) ? entry.result : 'pending',
      }])
      setPasteInput(''); setPasteError(''); setShowPaste(false)
    } catch { setPasteError('Invalid JSON — check format') }
  }

  const setResult = (id, result) => save(entries.map(e => e.id === id ? { ...e, result } : e))
  const remove = (id) => save(entries.filter(e => e.id !== id))

  const autoGrade = async (entry) => {
    setGrading(entry.id)
    const sportKey = entry.sport || 'mlb'
    const sportMeta = SPORTS.find(s => s.key === sportKey) || SPORTS[0]
    const isoDate = parseCardDate(entry.date)
    const games = await fetchGames(sportKey, isoDate)
    if (!games.length) { setGradeLog([`No ${sportMeta.label} games found for ${entry.date} yet.`]); setGrading(null); return }
    const teamAbbr = entry.pick.split(' ')[0]
    const m = matchGame(sportKey, games, teamAbbr)
    if (!m) { setGradeLog([`${entry.game}: game not found.`]); setGrading(null); return }
    if (!m.final) { setGradeLog([`${entry.game}: not final yet.`]); setGrading(null); return }
    const won = decideWin(m)
    const finalScore = `${m.awayAbbr} ${m.awayScore} - ${m.homeAbbr} ${m.homeScore}`
    const margin = Math.abs(m.awayScore - m.homeScore)
    save(entries.map(e => e.id === entry.id ? { ...e, result: won ? 'win' : 'loss', finalScore, margin } : e))
    setGradeLog([`${won?'WIN':'LOSS'} POTD ${entry.game} — ${finalScore} (margin ${margin})`])
    setGrading(null)
  }

  const graded = entries.filter(e => e.result === 'win' || e.result === 'loss')
  const noPlays = entries.filter(e => e.result === 'noplay').length
  const wins = graded.filter(e => e.result === 'win').length
  const wr = graded.length ? Math.round((wins/graded.length)*100) : 0
  const sportEmoji = k => (SPORTS.find(s => s.key === k) || {}).emoji || '🏆'

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>

      <div style={{ background:'#09090f', border:'1px solid #4c1d95', borderRadius:10, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:800, textTransform:'uppercase', color:'#a78bfa' }}>Play of the Day</div>
            <div style={{ fontSize:'.42rem', color:'#404060' }}>No stake · sharp movement + model, tracked for record only · all sports</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.3rem', fontWeight:800, color: graded.length===0?'#404060':wr>=55?'#4ade80':'#f87171' }}>
              {graded.length===0 ? '—' : `${wr}%`}
            </div>
            <div style={{ fontSize:'.4rem', color:'#404060', textTransform:'uppercase' }}>{wins}-{graded.length-wins} · {graded.length} graded{noPlays>0 ? ` · ${noPlays} no-play` : ''}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={()=>setShowAdd(!showAdd)} style={{ flex:1, padding:'6px 8px', background:'rgba(167,139,250,.12)', border:'1px solid #4c1d95', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, textTransform:'uppercase', color:'#a78bfa' }}>+ Add</button>
          <button onClick={()=>setShowPaste(!showPaste)} style={{ flex:1, padding:'6px 8px', background:'rgba(74,222,128,.1)', border:'1px solid #14532d', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, textTransform:'uppercase', color:'#4ade80' }}>Paste JSON</button>
        </div>
      </div>

      {gradeLog.length > 0 && (
        <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:8, fontSize:'.6rem', color:'#8080a0' }}>{gradeLog[0]}</div>
      )}

      {showPaste && (
        <div style={{ background:'#09090f', border:'1px solid #14532d', borderRadius:10, padding:12 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:800, textTransform:'uppercase', color:'#4ade80', marginBottom:8 }}>Paste POTD JSON</div>
          <textarea
            value={pasteInput}
            onChange={e=>setPasteInput(e.target.value)}
            placeholder='{"sport":"nfl","game":"KC @ WSH","pick":"WSH ML","odds":"-136","notes":"..."}'
            style={{ width:'100%', minHeight:80, background:'#0c0c1a', border:'1px solid #1a1a2e', borderRadius:6, padding:8, color:'#e0e0f0', fontSize:'.7rem', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }} />
          <div style={{ fontSize:'.42rem', color:'#404060', marginTop:4 }}>"sport" defaults to "mlb" if omitted (matches historical convention). Use mlb/nfl/nba/nhl.</div>
          {pasteError && <div style={{ color:'#f87171', fontSize:'.68rem', marginTop:4 }}>{pasteError}</div>}
          <div style={{ display:'flex', gap:4, marginTop:8 }}>
            <button onClick={loadJSON} style={{ flex:1, padding:8, background:'#4ade80', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#000' }}>Load</button>
            <button onClick={()=>{setShowPaste(false);setPasteInput('');setPasteError('')}} style={{ flex:1, padding:8, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#505070' }}>Cancel</button>
          </div>
        </div>
      )}

      {showAdd && (
        <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <select value={form.sport} onChange={e=>setForm(f=>({...f,sport:e.target.value}))} style={{ ...IS, appearance:'auto' }}>
              {SPORTS.map(s => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
            </select>
            <input value={form.game} onChange={e=>setForm(f=>({...f,game:e.target.value}))} placeholder="Game e.g. KC @ WSH" style={IS} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              <input value={form.pick} onChange={e=>setForm(f=>({...f,pick:e.target.value}))} placeholder="Pick e.g. WSH ML" style={IS} />
              <input value={form.odds} onChange={e=>setForm(f=>({...f,odds:e.target.value}))} placeholder="Odds e.g. -136" style={IS} />
            </div>
            <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Why (sharp movement + model read)" style={IS} />
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={add} style={{ flex:1, padding:8, background:'#4c1d95', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#fff' }}>Add</button>
              <button onClick={addNoPlay} title="Log today as a deliberate no-play day" style={{ flex:1, padding:8, background:'rgba(100,116,139,.18)', border:'1px solid #334155', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#94a3b8' }}>No Play</button>
              <button onClick={()=>{setShowAdd(false);setForm({sport:'mlb',game:'',pick:'',odds:'',notes:''})}} style={{ flex:1, padding:8, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:700, color:'#505070' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>
          No plays logged yet.
        </div>
      )}

      {[...entries].reverse().map(entry => (
        <div key={entry.id} style={{ background:'#09090f', border:'1px solid #2a2a50', borderRadius:8, padding:'10px 10px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:'.7rem' }}>{sportEmoji(entry.sport)}</span>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.9rem', fontWeight:800, color:'#f0f0f8' }}>{entry.pick}{entry.odds ? ` (${entry.odds})` : ''}</div>
              </div>
              <div style={{ fontSize:'.46rem', color:'#505070' }}>{entry.game} · {entry.date}</div>
              {entry.notes && <div style={{ fontSize:'.52rem', color:'#8080a0', marginTop:3, lineHeight:1.4 }}>{entry.notes}</div>}
              {entry.finalScore && (() => {
                const mRead = marginRead(entry.result, entry.margin)
                return (
                  <div style={{ fontSize:'.5rem', marginTop:3 }}>
                    <span style={{ color:'#8080a0' }}>{entry.finalScore}</span>
                    {mRead && <span style={{ color:mRead.color, marginLeft:5, fontWeight:700 }}>· {mRead.label}</span>}
                  </div>
                )
              })()}
            </div>
            <div style={{ fontSize:'1.1rem', fontWeight:800, color: entry.result==='win'?'#4ade80':entry.result==='loss'?'#f87171':entry.result==='noplay'?'#64748b':'#fbbf24' }}>
              {entry.result==='win'?'W':entry.result==='loss'?'L':entry.result==='noplay'?'—':'?'}
            </div>
          </div>
          <div style={{ display:'flex', gap:3, alignItems:'center', marginTop:6, justifyContent:'flex-end' }}>
            <button onClick={()=>remove(entry.id)} style={{ padding:'3px 7px', background:'rgba(248,113,113,.08)', border:'1px solid #7f1d1d', borderRadius:4, color:'#f87171', fontSize:'.5rem', marginRight:'auto' }}>Delete</button>
            {entry.result==='noplay' ? (
              <span style={{ fontSize:'.5rem', color:'#64748b', fontStyle:'italic' }}>sat out — not counted in W-L</span>
            ) : (
              <>
                {entry.result==='pending' && (
                  <button onClick={()=>autoGrade(entry)} disabled={grading===entry.id} style={{ padding:'3px 8px', background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:4, color:'#60a5fa', fontSize:'.55rem', fontWeight:700 }}>
                    {grading===entry.id ? '...' : 'Auto Grade'}
                  </button>
                )}
                <button onClick={()=>setResult(entry.id, 'win')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${entry.result==='win'?'#14532d':'#1a2a1a'}`, background:entry.result==='win'?'rgba(74,222,128,.2)':'#0c0c1a', fontSize:'.6rem', opacity:entry.result==='win'?1:0.4 }}>W</button>
                <button onClick={()=>setResult(entry.id, 'loss')} style={{ padding:'3px 7px', borderRadius:4, border:`1px solid ${entry.result==='loss'?'#7f1d1d':'#1a2a1a'}`, background:entry.result==='loss'?'rgba(248,113,113,.2)':'#0c0c1a', fontSize:'.6rem', opacity:entry.result==='loss'?1:0.4 }}>L</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
