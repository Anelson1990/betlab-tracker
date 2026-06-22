import { useState, useEffect, useCallback } from 'react'
import { TODAY_CARD } from './today.js'

const CARD_KEY = 'betlab-daily-card-v2'
const HISTORY_KEY = 'betlab-card-history-v1'
const MLB_API = 'https://statsapi.mlb.com/api/v1'

const EMPTY_CARD = {
  date: '', bankroll: 40,
  potd: { pick:'', game:'', direction:'', odds:'', stake:10, sources:'', analysis:'', result:'pending', pl:0, type:'money' },
  rfi: [], ml: [],
  hitParlay: { legs:[], stake:5, result:'pending', pl:0, type:'money', odds:'', payout:0 },
  sgp: { legs:[], stake:8, result:'pending', pl:0, type:'paper', odds:'' },
  totalPL: 0,
}

const RC = {
  pending: { color:'#fbbf24', bg:'rgba(251,191,36,.12)', border:'#713f12', label:'⏳ Pending' },
  win:     { color:'#4ade80', bg:'rgba(74,222,128,.12)',  border:'#14532d', label:'✅ Win' },
  loss:    { color:'#f87171', bg:'rgba(248,113,113,.12)', border:'#7f1d1d', label:'❌ Loss' },
  void:    { color:'#94a3b8', bg:'rgba(148,163,184,.12)', border:'#334155', label:'🔄 Void' },
  paper:   { color:'#60a5fa', bg:'rgba(96,165,250,.12)',  border:'#1e40af', label:'📋 Paper' },
}

const cycle = r => { const c=['pending','win','loss','void','paper']; return c[(c.indexOf(r)+1)%c.length] }

function calcPL(result, stake, odds, type) {
  if (type === 'paper') return 0
  if (result === 'win') {
    const o = parseInt(odds)
    if (!o) return parseFloat(stake)
    if (o > 0) return parseFloat(((stake * o) / 100).toFixed(2))
    if (o < 0) return parseFloat(((stake * 100) / Math.abs(o)).toFixed(2))
  }
  if (result === 'loss') return -Math.abs(parseFloat(stake) || 0)
  return 0
}

// Parse card date like "Jun 14" → "2026-06-14"
function parseCardDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
  const parts = dateStr.trim().split(' ')
  if (parts.length >= 2) {
    const month = months[parts[0]] || '06'
    const day = parts[1].padStart(2, '0')
    return `2026-${month}-${day}`
  }
  return new Date().toISOString().split('T')[0]
}

function Badge({ result, onClick, small }) {
  const rc = RC[result] || RC.pending
  return (
    <div onClick={onClick} style={{
      borderRadius:5, padding: small ? '2px 7px' : '4px 10px',
      fontFamily:"'Barlow Condensed',sans-serif", fontSize: small ? '.62rem' : '.72rem',
      fontWeight:800, border:`1px solid ${rc.border}`, color:rc.color,
      background:rc.bg, cursor: onClick ? 'pointer' : 'default', flexShrink:0, whiteSpace:'nowrap'
    }}>{rc.label}</div>
  )
}

function QuickGrade({ result, onChange }) {
  const btns = [
    { r:'win',     label:'✅', activeColor:'#4ade80', activeBg:'rgba(74,222,128,.2)',  activeBorder:'#14532d' },
    { r:'loss',    label:'❌', activeColor:'#f87171', activeBg:'rgba(248,113,113,.2)', activeBorder:'#7f1d1d' },
    { r:'void',    label:'🔄', activeColor:'#94a3b8', activeBg:'rgba(148,163,184,.2)', activeBorder:'#334155' },
    { r:'pending', label:'⏳', activeColor:'#fbbf24', activeBg:'rgba(251,191,36,.2)',  activeBorder:'#713f12' },
    { r:'paper',   label:'📋', activeColor:'#60a5fa', activeBg:'rgba(96,165,250,.2)',  activeBorder:'#1e40af' },
  ]
  return (
    <div style={{ display:'flex', gap:3, flexShrink:0 }}>
      {btns.map(b => (
        <button key={b.r} onClick={()=>onChange(b.r)} style={{
          padding:'3px 7px', borderRadius:4,
          border:`1px solid ${result===b.r ? b.activeBorder : '#1a1a30'}`,
          background: result===b.r ? b.activeBg : '#0c0c1a',
          fontSize:'.65rem', cursor:'pointer',
          opacity: result===b.r ? 1 : 0.4,
        }}>{b.label}</button>
      ))}
    </div>
  )
}

function TypeToggle({ type, onChange }) {
  const isMoney = type === 'money'
  return (
    <div style={{ display:'flex', gap:3, flexShrink:0 }}>
      <button onClick={() => onChange('money')} style={{
        padding:'2px 8px', borderRadius:4, border:'1px solid',
        fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.58rem', fontWeight:700, textTransform:'uppercase',
        background: isMoney ? 'rgba(74,222,128,.15)' : '#0c0c1a',
        color: isMoney ? '#4ade80' : '#404060',
        borderColor: isMoney ? '#14532d' : '#1a1a30',
      }}>💰</button>
      <button onClick={() => onChange('paper')} style={{
        padding:'2px 8px', borderRadius:4, border:'1px solid',
        fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.58rem', fontWeight:700, textTransform:'uppercase',
        background: !isMoney ? 'rgba(96,165,250,.15)' : '#0c0c1a',
        color: !isMoney ? '#60a5fa' : '#404060',
        borderColor: !isMoney ? '#1e40af' : '#1a1a30',
      }}>📋</button>
    </div>
  )
}

async function fetchMLBGames(dateStr) {
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${dateStr}&hydrate=linescore,team`)
    return (await res.json())?.dates?.[0]?.games || []
  } catch { return [] }
}

async function fetchLinescore(gamePk) {
  try { return await (await fetch(`${MLB_API}/game/${gamePk}/linescore`)).json() } catch { return null }
}

async function fetchBoxScore(gamePk) {
  try { return await (await fetch(`${MLB_API}/game/${gamePk}/boxscore`)).json() } catch { return null }
}

function findGame(games, abbr) {
  if (!abbr) return null
  const a = abbr.toUpperCase()
  return games.find(g => {
    const h = g.teams?.home?.team?.abbreviation?.toUpperCase() || ''
    const aw = g.teams?.away?.team?.abbreviation?.toUpperCase() || ''
    const hn = g.teams?.home?.team?.teamName?.toUpperCase() || ''
    const an = g.teams?.away?.team?.teamName?.toUpperCase() || ''
    return h===a || aw===a || hn.includes(a) || an.includes(a)
  })
}

export default function BetCard({ bankroll, onCardSaved }) {
  const [card, setCard] = useState(null)
  const [grading, setGrading] = useState(false)
  const [gradedOnLoad, setGradedOnLoad] = useState(false)
  const [gradeLog, setGradeLog] = useState([])
  const [section, setSection] = useState('potd')
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newBR, setNewBR] = useState(bankroll || 40)
  const [editing, setEditing] = useState(false)
  const [addingRFI, setAddingRFI] = useState(false)
  const [addingML, setAddingML] = useState(false)
  const [addingHit, setAddingHit] = useState(false)
  const [rfiForm, setRfiForm] = useState({ game:'', homeTeam:'', awayTeam:'', pick:'YRFI', conf:'', stake:8, type:'money' })
  const [mlForm, setMlForm] = useState({ game:'', direction:'', odds:'', stake:5, sources:'', type:'money' })
  const [hitForm, setHitForm] = useState({ player:'', team:'', rate:'', l10:'', split:'' })

  useEffect(() => {
    setCard(TODAY_CARD)
  }, [])

  // Auto-grade on load when card has pending picks and games may be finished
  useEffect(() => {
    if (card && !gradedOnLoad && !grading) {
      const hasPending = card.potd.result === 'pending' ||
        card.rfi.some(r => r.result === 'pending') ||
        card.ml.some(m => m.result === 'pending') ||
        card.hitParlay.legs.some(l => l.result === 'pending')
      if (hasPending) {
        setGradedOnLoad(true)
        autoGrade(card, true)
      }
    }
  }, [card])

  const save = c => { setCard(c); try { localStorage.setItem(CARD_KEY, JSON.stringify(c)) } catch {} }

  const recalc = c => {
    c.potd.pl = calcPL(c.potd.result, c.potd.stake, c.potd.odds, c.potd.type)
    c.rfi = c.rfi.map(r => ({ ...r, pl: calcPL(r.result, r.stake, '-110', r.type) }))
    c.ml = c.ml.map(m => ({ ...m, pl: calcPL(m.result, m.stake, m.odds, m.type) }))
    c.hitParlay.pl = c.hitParlay.type === 'paper' ? 0 :
      c.hitParlay.result === 'win' ? (c.hitParlay.payout ? c.hitParlay.payout - c.hitParlay.stake : calcPL('win', c.hitParlay.stake, c.hitParlay.odds || '+350', 'money')) :
      c.hitParlay.result === 'loss' ? -c.hitParlay.stake : 0
    const pl = c.potd.pl + c.rfi.reduce((a,r)=>a+(r.pl||0),0) + c.ml.reduce((a,m)=>a+(m.pl||0),0) + c.hitParlay.pl + (c.sgp.pl||0)
    c.totalPL = parseFloat(pl.toFixed(2))
    save(c)
  }

  const importCard = () => {
    setImportError('')
    try {
      const data = JSON.parse(importText.replace(/```json|```/g,'').trim())
      if (!data.date || !data.potd) { setImportError('Missing required fields: date, potd'); return }
      const newCard = {
        date: data.date,
        bankroll: parseFloat(data.bankroll) || parseFloat(newBR) || 40,
        potd: { pick:data.potd.pick||'', game:data.potd.game||'', direction:data.potd.direction||'', odds:data.potd.odds||'', stake:parseFloat(data.potd.stake)||10, sources:data.potd.sources||'', analysis:data.potd.analysis||'', result:'pending', pl:0, type:data.potd.type||'money' },
        rfi: (data.rfi||[]).map(r => ({ game:r.game||'', homeTeam:r.homeTeam||'', awayTeam:r.awayTeam||'', pick:r.pick||'YRFI', conf:r.conf||'', stake:parseFloat(r.stake)||8, result:'pending', pl:0, type:r.type||'money' })),
        ml: (data.ml||[]).map(m => ({ game:m.game||'', direction:m.direction||'', odds:m.odds||'', stake:parseFloat(m.stake)||5, sources:m.sources||'', result:'pending', pl:0, type:m.type||'paper' })),
        hitParlay: { stake:parseFloat(data.hitParlay?.stake)||5, odds:data.hitParlay?.odds||'', payout:data.hitParlay?.payout||0, result:'pending', pl:0, type:data.hitParlay?.type||'money', legs:(data.hitParlay?.legs||[]).map(l => ({ player:l.player||'', team:l.team||'', rate:l.rate||'', l10:l.l10||'', split:l.split||'', result:'pending' })) },
        sgp: { stake:parseFloat(data.sgp?.stake)||8, result:'pending', pl:0, type:'paper', legs:[], odds:data.sgp?.odds||'' },
        totalPL: 0,
      }
      recalc(newCard)
      setShowImport(false); setImportText(''); setSection('potd')
    } catch { setImportError('Invalid JSON — check format and try again') }
  }

  const startNew = () => {
    const today = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })
    recalc({ ...EMPTY_CARD, date:newDate||today, bankroll:parseFloat(newBR)||40 })
    setShowNewForm(false)
  }

  const archive = () => {
    if (!card) return
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')
      h.push({ ...card, archivedAt: new Date().toISOString() })
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
    } catch {}
    if (onCardSaved) onCardSaved(card)
    localStorage.removeItem(CARD_KEY)
    setCard(null)
  }

  const updPOTD = (f, v) => recalc({ ...card, potd: { ...card.potd, [f]:v } })
  const updRFI = (i, f, v) => { const rfi=[...card.rfi]; rfi[i]={...rfi[i],[f]:v}; recalc({...card,rfi}) }
  const delRFI = i => recalc({ ...card, rfi: card.rfi.filter((_,idx)=>idx!==i) })
  const updML = (i, f, v) => { const ml=[...card.ml]; ml[i]={...ml[i],[f]:v}; recalc({...card,ml}) }
  const delML = i => recalc({ ...card, ml: card.ml.filter((_,idx)=>idx!==i) })
  const updHit = (i, f, v) => {
    const legs=[...card.hitParlay.legs]; legs[i]={...legs[i],[f]:v}
    const allW=legs.every(l=>l.result==='win'), anyL=legs.some(l=>l.result==='loss')
    recalc({ ...card, hitParlay: { ...card.hitParlay, legs, result: allW?'win':anyL?'loss':'pending' } })
  }
  const delHit = i => recalc({ ...card, hitParlay: { ...card.hitParlay, legs: card.hitParlay.legs.filter((_,idx)=>idx!==i) } })

  const addRFI = () => { recalc({...card,rfi:[...card.rfi,{...rfiForm,stake:parseFloat(rfiForm.stake)||8,result:'pending',pl:0}]}); setRfiForm({game:'',homeTeam:'',awayTeam:'',pick:'YRFI',conf:'',stake:8,type:'money'}); setAddingRFI(false) }
  const addML = () => { recalc({...card,ml:[...card.ml,{...mlForm,stake:parseFloat(mlForm.stake)||5,result:'pending',pl:0}]}); setMlForm({game:'',direction:'',odds:'',stake:5,sources:'',type:'money'}); setAddingML(false) }
  const addHit = () => { recalc({...card,hitParlay:{...card.hitParlay,legs:[...card.hitParlay.legs,{...hitForm,result:'pending'}]}}); setHitForm({player:'',team:'',rate:'',l10:'',split:''}); setAddingHit(false) }

  // ── AUTO GRADE — uses card date not today ─────────────────────────────────
  const autoGrade = async (cardToGrade, silent=false) => {
    const c = cardToGrade || card
    if (!c) return
    if (!silent) setGrading(true)
    const log = []
    const dateStr = parseCardDate(c.date)
    log.push(`🔄 Fetching games for ${c.date} (${dateStr})...`)
    const games = await fetchMLBGames(dateStr)
    if (!games.length) { if (!silent) { setGradeLog(['⚠️ No games found for ' + c.date + '. Games may not be final yet.']); setGrading(false) }; return }
    log.push(`✅ Found ${games.length} games on ${c.date}`)
    let updated = JSON.parse(JSON.stringify(c))

    const gradeGame = async (pick, teamAbbr, isRFI) => {
      const game = findGame(games, teamAbbr)
      if (!game) return { result:'pending', note:`⚠️ Game not found for ${teamAbbr}` }
      if (game.status?.detailedState !== 'Final') return { result:'pending', note:`⏳ ${teamAbbr} game not final yet` }
      const hs=game.teams?.home?.score, as=game.teams?.away?.score
      const ha=game.teams?.home?.team?.abbreviation, aa=game.teams?.away?.team?.abbreviation
      if (isRFI) {
        const ls = await fetchLinescore(game.gamePk)
        const hr1=ls?.innings?.[0]?.home?.runs||0, ar1=ls?.innings?.[0]?.away?.runs||0
        const yrfi=hr1>0||ar1>0, pickedY=pick==='YRFI'
        const result=(pickedY&&yrfi)||(!pickedY&&!yrfi)?'win':'loss'
        return { result, note:`${result==='win'?'✅':'❌'} ${pick}: 1st inn home:${hr1} away:${ar1} → ${result.toUpperCase()}` }
      } else {
        const picked=teamAbbr?.toUpperCase(), homeWon=hs>as, pickedHome=picked===ha
        const result=(pickedHome&&homeWon)||(!pickedHome&&!homeWon)?'win':'loss'
        return { result, note:`${result==='win'?'✅':'❌'} ${picked}: ${aa} ${as} @ ${ha} ${hs} → ${result.toUpperCase()}` }
      }
    }

    // POTD
    if (c.potd.direction && c.potd.result === 'pending') {
      const isRFI = c.potd.pick?.includes('YRFI') || c.potd.pick?.includes('NRFI')
      const { result, note } = await gradeGame(isRFI?(c.potd.pick?.includes('YRFI')?'YRFI':'NRFI'):null, c.potd.direction, isRFI)
      updated.potd.result = result; log.push(`🎯 POTD: ${note}`)
    }

    // RFI
    for (let i=0; i<c.rfi.length; i++) {
      if (c.rfi[i].result !== 'pending') continue
      const { result, note } = await gradeGame(c.rfi[i].pick, c.rfi[i].homeTeam||c.rfi[i].awayTeam, true)
      updated.rfi[i].result = result; log.push(`🎲 RFI: ${note}`)
    }

    // ML
    for (let i=0; i<c.ml.length; i++) {
      if (c.ml[i].result !== 'pending') continue
      const { result, note } = await gradeGame(null, c.ml[i].direction, false)
      updated.ml[i].result = result; log.push(`⚾ ML: ${note}`)
    }

    // Hit parlay legs
    for (let i=0; i<c.hitParlay.legs.length; i++) {
      const leg = c.hitParlay.legs[i]
      if (leg.result !== 'pending') continue
      const game = findGame(games, leg.team)
      if (game && game.status?.detailedState === 'Final') {
        const box = await fetchBoxScore(game.gamePk)
        const all = [...Object.values(box?.teams?.home?.players||{}), ...Object.values(box?.teams?.away?.players||{})]
        const pn = leg.player?.toLowerCase()
        const pd = all.find(p => p.person?.fullName?.toLowerCase().includes(pn) || pn.includes(p.person?.lastName?.toLowerCase()))
        if (pd) {
          const hits = pd.stats?.batting?.hits || 0
          updated.hitParlay.legs[i].result = hits >= 1 ? 'win' : 'loss'
          log.push(`${hits>=1?'✅':'❌'} ${leg.player}: ${hits} hits`)
        } else { log.push(`⚠️ ${leg.player}: not found in box score — grade manually`) }
      } else { log.push(`⏳ ${leg.player} game not final`) }
    }

    // Recalc parlay result
    const allW=updated.hitParlay.legs.every(l=>l.result==='win'), anyL=updated.hitParlay.legs.some(l=>l.result==='loss')
    if (allW) updated.hitParlay.result='win'
    else if (anyL) updated.hitParlay.result='loss'

    const hasNewResults = log.some(l => l.includes('✅') || l.includes('❌'))
    if (hasNewResults) { log.push('✅ Auto-grade complete — tap any result to override'); recalc(updated) }
    else if (!silent) { log.push('⏳ No new results — games may still be live') }
    if (!silent) { setGradeLog(log); setGrading(false) }
    else if (hasNewResults) setGradeLog(log)
  }

  const IS = { background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none', width:'100%' }
  const inp = (v, set, ph, type='text') => <input value={v} onChange={e=>set(e.target.value)} placeholder={ph} type={type} style={IS} />
  const sel = (v, set, opts) => <select value={v} onChange={e=>set(e.target.value)} style={IS}>{opts.map(([val,lbl])=><option key={val} value={val}>{lbl}</option>)}</select>
  const addBtn = (lbl, fn) => <button onClick={fn} style={{ width:'100%', padding:7, background:'#0c0c1a', border:'1px dashed #2a2a50', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, textTransform:'uppercase', color:'#404060', marginTop:4 }}>{lbl}</button>
  const secBtn = (id, lbl) => <button onClick={()=>setSection(id)} style={{ flex:1, padding:'6px 2px', fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.6rem', fontWeight:700, textTransform:'uppercase', border:'1px solid', borderRadius:5, background:section===id?'#1a1a30':'#0c0c1a', color:section===id?'#f0f0f8':'#404060', borderColor:section===id?'#2a2a50':'#1a1a30' }}>{lbl}</button>
  const delBtn = fn => <button onClick={fn} style={{ padding:'2px 7px', background:'rgba(248,113,113,.1)', border:'1px solid #7f1d1d', borderRadius:4, color:'#f87171', fontSize:'.6rem', flexShrink:0 }}>✕</button>
  const editInp = (val, key, updFn, ph='', type='text') => editing
    ? <input value={val||''} onChange={e=>updFn(key, e.target.value)} placeholder={ph} type={type} style={{ background:'#0c0c1a', border:'1px solid #2563eb', borderRadius:4, padding:'3px 6px', fontSize:'.65rem', color:'#f0f0f8', outline:'none', width:'100%' }} />
    : <span style={{ fontSize:'.65rem', color:'#a0a0c0' }}>{val||<span style={{color:'#303050'}}>—</span>}</span>

  // ── NO CARD ───────────────────────────────────────────────────────────────
  if (!card) return (
    <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:16 }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.3rem', color:'#505070', marginBottom:4, textAlign:'center' }}>No Active Card</div>
        <div style={{ fontSize:'.58rem', color:'#404060', marginBottom:12, textAlign:'center', lineHeight:1.6 }}>Paste the JSON from Claude to load today's card instantly</div>
        <button onClick={()=>setShowImport(!showImport)} style={{ width:'100%', padding:9, background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, textTransform:'uppercase', color:'#60a5fa', marginBottom:6 }}>📋 Paste Card JSON</button>
        {showImport && (
          <div style={{ marginBottom:8 }}>
            <textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder="Paste JSON from Claude here..." rows={8}
              style={{ width:'100%', background:'#0c0c1a', border:`1px solid ${importError?'#7f1d1d':'#1a1a30'}`, borderRadius:6, padding:'8px 10px', fontSize:'.6rem', color:'#f0f0f8', outline:'none', resize:'vertical', lineHeight:1.6 }} />
            {importError && <div style={{ fontSize:'.55rem', color:'#f87171', marginTop:3 }}>⚠️ {importError}</div>}
            <button onClick={importCard} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, color:'#fff', marginTop:6 }}>Load Card ↗</button>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:8, margin:'8px 0' }}>
          <div style={{ flex:1, height:1, background:'#1a1a30' }} />
          <div style={{ fontSize:'.48rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.08em' }}>or start manually</div>
          <div style={{ flex:1, height:1, background:'#1a1a30' }} />
        </div>
        <button onClick={()=>setShowNewForm(!showNewForm)} style={{ width:'100%', padding:9, background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, textTransform:'uppercase', color:'#505070' }}>+ Start Blank Card</button>
        {showNewForm && (
          <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
            {inp(newDate, setNewDate, 'Date e.g. Jun 14')}
            {inp(newBR, setNewBR, 'Bankroll e.g. 40', 'number')}
            <button onClick={startNew} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, color:'#fff', marginTop:4 }}>Create</button>
          </div>
        )}
      </div>
    </div>
  )

  const totalStaked = (card.potd.type==='money'?card.potd.stake:0) + card.rfi.filter(r=>r.type==='money').reduce((a,r)=>a+(r.stake||0),0) + card.ml.filter(m=>m.type==='money').reduce((a,m)=>a+(m.stake||0),0) + (card.hitParlay.type==='money'?card.hitParlay.stake:0)

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

      {/* CARD HEADER */}
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.4rem', color:'#f0f0f8', lineHeight:1 }}>{card.date} <span style={{ fontSize:'.55rem', color:'#4ade80', fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700 }}>TODAY</span></div>
            <div style={{ fontSize:'.42rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:1 }}>
              Start ${card.bankroll.toFixed(2)} · Staked ${totalStaked.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.4rem', lineHeight:1, color: card.totalPL>=0?'#4ade80':'#f87171' }}>
              {card.totalPL>=0?'+':''}${card.totalPL.toFixed(2)}
            </div>
            <div style={{ fontSize:'.38rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060' }}>Real Money P&L</div>
          </div>
        </div>

        <div style={{ display:'flex', gap:3, marginBottom:8 }}>
          {secBtn('potd','🎯 POTD')}
          {secBtn('rfi','🎲 RFI')}
          {secBtn('ml','⚾ ML')}
          {secBtn('props','⚡ Props')}
        </div>

        {card.notes && (
          <div style={{ background:'rgba(251,191,36,.08)', border:'1px solid #713f12', borderRadius:6, padding:'6px 10px', marginBottom:8, fontSize:'.56rem', color:'#fbbf24', lineHeight:1.6 }}>
            {card.notes}
          </div>
        )}

        <div style={{ display:'flex', gap:4 }}>
          <button onClick={()=>autoGrade(card, false)} disabled={grading} style={{
            flex:2, padding:8, background:grading?'#1a1a30':'rgba(37,99,235,.15)', border:'1px solid #2563eb',
            borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700,
            textTransform:'uppercase', color:grading?'#404060':'#60a5fa',
          }}>{grading?'⏳ Grading...':'⚡ Auto Grade'}</button>
          <button onClick={()=>setEditing(!editing)} style={{
            flex:1, padding:8, background:editing?'rgba(251,191,36,.15)':'#0c0c1a',
            border:`1px solid ${editing?'#713f12':'#1a1a30'}`, borderRadius:6,
            fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700,
            textTransform:'uppercase', color:editing?'#fbbf24':'#404060',
          }}>{editing?'✓ Done':'✏️ Edit'}</button>
          <button onClick={archive} style={{ flex:1, padding:8, background:'rgba(74,222,128,.08)', border:'1px solid #14532d', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', color:'#4ade80' }}>Archive</button>
          <button onClick={()=>{localStorage.removeItem(CARD_KEY);setCard(null)}} style={{ padding:'8px 10px', background:'rgba(248,113,113,.08)', border:'1px solid #7f1d1d', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#f87171' }}>✕</button>
        </div>
      </div>

      {/* GRADE LOG */}
      {gradeLog.length > 0 && (
        <div style={{ background:'#060610', border:'1px solid #1a1a30', borderRadius:8, padding:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.6rem', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'#404060' }}>⚡ Grade Log</div>
            <button onClick={()=>setGradeLog([])} style={{ background:'none', border:'none', color:'#404060', fontSize:'.52rem' }}>Clear</button>
          </div>
          {gradeLog.map((l,i) => <div key={i} style={{ fontSize:'.56rem', color:'#606080', lineHeight:1.8 }}>{l}</div>)}
        </div>
      )}

      {/* ── POTD ── */}
      {section === 'potd' && (
        <div style={{ background:'#09090f', border:`1px solid ${card.potd.type==='money'?'rgba(74,222,128,.2)':'rgba(96,165,250,.2)'}`, borderRadius:10, padding:12 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#fbbf24' }}>🎯 Pick of the Day</div>
            <TypeToggle type={card.potd.type||'money'} onChange={v=>updPOTD('type',v)} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
            <div><div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Pick</div>{editInp(card.potd.pick,'pick',updPOTD,'ATL ML -116')}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div><div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Team Abbr</div>{editInp(card.potd.direction,'direction',updPOTD,'ATL')}</div>
              <div><div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Odds</div>{editInp(card.potd.odds,'odds',updPOTD,'-116')}</div>
              <div>
                <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Stake $</div>
                {editing ? <input value={card.potd.stake} onChange={e=>updPOTD('stake',parseFloat(e.target.value)||0)} type="number" style={{ background:'#0c0c1a', border:'1px solid #2563eb', borderRadius:4, padding:'3px 6px', fontSize:'.65rem', color:'#f0f0f8', outline:'none', width:'100%' }} />
                : <span style={{ fontSize:'.65rem', color:'#a0a0c0' }}>${card.potd.stake}</span>}
              </div>
              <div>
                <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Win Payout</div>
                <span style={{ fontSize:'.65rem', color:'#4ade80', fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700 }}>+${calcPL('win',card.potd.stake,card.potd.odds,'money').toFixed(2)}</span>
              </div>
            </div>
            <div><div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Sources</div>{editInp(card.potd.sources,'sources',updPOTD,'XGB + Con + LGB')}</div>
            <div>
              <div style={{ fontSize:'.44rem', color:'#404060', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Analysis</div>
              {editing ? <textarea value={card.potd.analysis||''} onChange={e=>updPOTD('analysis',e.target.value)} rows={3} style={{ width:'100%', background:'#0c0c1a', border:'1px solid #2563eb', borderRadius:4, padding:'4px 8px', fontSize:'.62rem', color:'#f0f0f8', outline:'none', resize:'none' }} />
              : <div style={{ fontSize:'.6rem', color:'#808098', lineHeight:1.6 }}>{card.potd.analysis||'—'}</div>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:8, borderTop:'1px solid #1a1a2e' }}>
            <QuickGrade result={card.potd.result} onChange={v=>updPOTD('result',v)} />
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color:card.potd.pl>=0?'#4ade80':'#f87171' }}>
              {card.potd.type==='paper'?'📋 Paper':`${card.potd.pl>=0?'+':''}$${card.potd.pl.toFixed(2)}`}
            </div>
          </div>
        </div>
      )}

      {/* ── RFI ── */}
      {section === 'rfi' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {card.rfi.length === 0 && <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>No RFI picks today</div>}
          {card.rfi.map((r,i) => (
            <div key={i} style={{ background:'#09090f', border:`1px solid ${r.type==='money'?'#1a2a1a':'#1a1a2e'}`, borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color:'#f0f0f8' }}>{r.game}</div>
                  <div style={{ fontSize:'.46rem', color:'#505070' }}>{r.pick} · {r.conf}% · ${r.stake} · -110</div>
                </div>
                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                  <TypeToggle type={r.type||'money'} onChange={v=>updRFI(i,'type',v)} />
                  {editing && delBtn(()=>delRFI(i))}
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <QuickGrade result={r.result} onChange={v=>updRFI(i,'result',v)} />
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:r.pl>=0?'#4ade80':'#f87171' }}>
                  {r.type==='paper'?'📋 Paper':`${r.pl>=0?'+':''}$${r.pl.toFixed(2)}`}
                </div>
              </div>
            </div>
          ))}
          {addingRFI ? (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, textTransform:'uppercase', color:'#505070' }}>Add RFI Pick</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                {inp(rfiForm.game, v=>setRfiForm(f=>({...f,game:v})), 'ATL @ CWS')}
                {inp(rfiForm.homeTeam, v=>setRfiForm(f=>({...f,homeTeam:v})), 'Home abbr')}
                {sel(rfiForm.pick, v=>setRfiForm(f=>({...f,pick:v})), [['YRFI','YRFI'],['NRFI','NRFI']])}
                {inp(rfiForm.conf, v=>setRfiForm(f=>({...f,conf:v})), 'Conf %')}
                {inp(rfiForm.stake, v=>setRfiForm(f=>({...f,stake:v})), 'Stake $', 'number')}
              </div>
              <TypeToggle type={rfiForm.type} onChange={v=>setRfiForm(f=>({...f,type:v}))} />
              <div style={{ display:'flex', gap:4, marginTop:4 }}>
                <button onClick={addRFI} style={{ flex:1, padding:7, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#fff' }}>Add</button>
                <button onClick={()=>setAddingRFI(false)} style={{ flex:1, padding:7, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#505070' }}>Cancel</button>
              </div>
            </div>
          ) : addBtn('+ Add RFI Pick', ()=>setAddingRFI(true))}
        </div>
      )}

      {/* ── ML ── */}
      {section === 'ml' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {card.ml.length === 0 && <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:8, padding:16, textAlign:'center', fontSize:'.6rem', color:'#404060' }}>No ML picks today</div>}
          {card.ml.map((m,i) => (
            <div key={i} style={{ background:'#09090f', border:`1px solid ${m.type==='money'?'#1a2a1a':'#1a1a2e'}`, borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color:'#f0f0f8' }}>{m.direction} ML · {m.odds}</div>
                  <div style={{ fontSize:'.46rem', color:'#505070' }}>{m.game} · ${m.stake} · {m.sources}</div>
                </div>
                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                  <TypeToggle type={m.type||'paper'} onChange={v=>updML(i,'type',v)} />
                  {editing && delBtn(()=>delML(i))}
                </div>
              </div>
              {editing && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, marginBottom:6 }}>
                  <input value={m.direction||''} onChange={e=>updML(i,'direction',e.target.value)} placeholder="Team" style={{ background:'#0c0c1a', border:'1px solid #2563eb', borderRadius:4, padding:'3px 6px', fontSize:'.62rem', color:'#f0f0f8', outline:'none' }} />
                  <input value={m.odds||''} onChange={e=>updML(i,'odds',e.target.value)} placeholder="Odds" style={{ background:'#0c0c1a', border:'1px solid #2563eb', borderRadius:4, padding:'3px 6px', fontSize:'.62rem', color:'#f0f0f8', outline:'none' }} />
                  <input value={m.stake||''} onChange={e=>updML(i,'stake',parseFloat(e.target.value)||0)} placeholder="Stake" type="number" style={{ background:'#0c0c1a', border:'1px solid #2563eb', borderRadius:4, padding:'3px 6px', fontSize:'.62rem', color:'#f0f0f8', outline:'none' }} />
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <QuickGrade result={m.result} onChange={v=>updML(i,'result',v)} />
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.88rem', fontWeight:800, color:m.pl>=0?'#4ade80':'#f87171' }}>
                  {m.type==='paper'?'📋 Paper':`${m.pl>=0?'+':''}$${m.pl.toFixed(2)}`}
                </div>
              </div>
            </div>
          ))}
          {addingML ? (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, textTransform:'uppercase', color:'#505070' }}>Add ML Pick</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                {inp(mlForm.game, v=>setMlForm(f=>({...f,game:v})), 'DET @ CLE')}
                {inp(mlForm.direction, v=>setMlForm(f=>({...f,direction:v})), 'Team abbr')}
                {inp(mlForm.odds, v=>setMlForm(f=>({...f,odds:v})), 'Odds e.g. +108')}
                {inp(mlForm.stake, v=>setMlForm(f=>({...f,stake:v})), 'Stake $', 'number')}
                {inp(mlForm.sources, v=>setMlForm(f=>({...f,sources:v})), 'Sources')}
              </div>
              <TypeToggle type={mlForm.type} onChange={v=>setMlForm(f=>({...f,type:v}))} />
              <div style={{ display:'flex', gap:4, marginTop:4 }}>
                <button onClick={addML} style={{ flex:1, padding:7, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#fff' }}>Add</button>
                <button onClick={()=>setAddingML(false)} style={{ flex:1, padding:7, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#505070' }}>Cancel</button>
              </div>
            </div>
          ) : addBtn('+ Add ML Pick', ()=>setAddingML(true))}
        </div>
      )}

      {/* ── PROPS ── */}
      {section === 'props' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ background:'#09090f', border:`1px solid ${card.hitParlay.type==='money'?'#1a2a1a':'#1a1a2e'}`, borderRadius:10, padding:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, textTransform:'uppercase', color:'#4ade80' }}>⚡ Lazer Hit Parlay</div>
              <TypeToggle type={card.hitParlay.type||'money'} onChange={v=>recalc({...card,hitParlay:{...card.hitParlay,type:v}})} />
            </div>
            {card.hitParlay.legs.length === 0 && <div style={{ fontSize:'.6rem', color:'#404060', textAlign:'center', padding:'8px 0' }}>No legs added yet</div>}
            {card.hitParlay.legs.map((leg,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'#0c0c1a', borderRadius:6, padding:'7px 10px', marginBottom:4 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'.65rem', fontWeight:700, color:'#f0f0f8' }}>{leg.player}</div>
                  <div style={{ fontSize:'.46rem', color:'#505070' }}>{leg.rate} · {leg.l10} · {leg.split}</div>
                </div>
                <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                  <button onClick={()=>updHit(i,'result','win')} style={{ padding:'3px 8px', borderRadius:4, border:`1px solid ${leg.result==='win'?'#14532d':'#1a2a1a'}`, background:leg.result==='win'?'rgba(74,222,128,.2)':'#0c0c1a', color:leg.result==='win'?'#4ade80':'#404060', fontSize:'.65rem', fontWeight:700 }}>✅</button>
                  <button onClick={()=>updHit(i,'result','loss')} style={{ padding:'3px 8px', borderRadius:4, border:`1px solid ${leg.result==='loss'?'#7f1d1d':'#1a2a1a'}`, background:leg.result==='loss'?'rgba(248,113,113,.2)':'#0c0c1a', color:leg.result==='loss'?'#f87171':'#404060', fontSize:'.65rem', fontWeight:700 }}>❌</button>
                  <button onClick={()=>updHit(i,'result','pending')} style={{ padding:'3px 6px', borderRadius:4, border:'1px solid #1a2a1a', background:'#0c0c1a', color:leg.result==='pending'?'#fbbf24':'#404060', fontSize:'.65rem' }}>⏳</button>
                </div>
                {editing && delBtn(()=>delHit(i))}
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6, paddingTop:6, borderTop:'1px solid #1a2a1a' }}>
              <div>
                <div style={{ fontSize:'.5rem', color:'#404060', marginBottom:4 }}>
                  ${card.hitParlay.stake} staked{card.hitParlay.odds?` · ${card.hitParlay.odds}`:''}{card.hitParlay.payout?` · Payout $${card.hitParlay.payout}`:''}
                </div>
                <QuickGrade result={card.hitParlay.result} onChange={v=>recalc({...card,hitParlay:{...card.hitParlay,result:v}})} />
              </div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color:card.hitParlay.pl>=0?'#4ade80':'#f87171' }}>
                {card.hitParlay.type==='paper'?'📋 Paper':`${card.hitParlay.pl>=0?'+':''}$${card.hitParlay.pl.toFixed(2)}`}
              </div>
            </div>
            {editing && (
              <div style={{ marginTop:8, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, borderTop:'1px solid #1a2a1a', paddingTop:8 }}>
                <input value={card.hitParlay.odds||''} onChange={e=>save({...card,hitParlay:{...card.hitParlay,odds:e.target.value}})} placeholder="Odds +146" style={{ background:'#0c0c1a', border:'1px solid #2563eb', borderRadius:4, padding:'4px 6px', fontSize:'.62rem', color:'#f0f0f8', outline:'none' }} />
                <input value={card.hitParlay.payout||''} onChange={e=>save({...card,hitParlay:{...card.hitParlay,payout:parseFloat(e.target.value)||0}})} placeholder="Payout $" type="number" style={{ background:'#0c0c1a', border:'1px solid #2563eb', borderRadius:4, padding:'4px 6px', fontSize:'.62rem', color:'#f0f0f8', outline:'none' }} />
                <input value={card.hitParlay.stake||''} onChange={e=>recalc({...card,hitParlay:{...card.hitParlay,stake:parseFloat(e.target.value)||0}})} placeholder="Stake $" type="number" style={{ background:'#0c0c1a', border:'1px solid #2563eb', borderRadius:4, padding:'4px 6px', fontSize:'.62rem', color:'#f0f0f8', outline:'none' }} />
              </div>
            )}
            {addingHit ? (
              <div style={{ marginTop:8, borderTop:'1px solid #1a2a1a', paddingTop:8, display:'flex', flexDirection:'column', gap:4 }}>
                {inp(hitForm.player, v=>setHitForm(f=>({...f,player:v})), 'Josh Jung')}
                {inp(hitForm.team, v=>setHitForm(f=>({...f,team:v})), 'Team abbr e.g. TEX')}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
                  {inp(hitForm.rate, v=>setHitForm(f=>({...f,rate:v})), '85%')}
                  {inp(hitForm.l10, v=>setHitForm(f=>({...f,l10:v})), 'L10 9/10')}
                  {inp(hitForm.split, v=>setHitForm(f=>({...f,split:v})), 'vsRHP .309')}
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  <button onClick={addHit} style={{ flex:1, padding:7, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#fff' }}>Add Leg</button>
                  <button onClick={()=>setAddingHit(false)} style={{ flex:1, padding:7, background:'#1a1a30', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700, color:'#505070' }}>Cancel</button>
                </div>
              </div>
            ) : addBtn('+ Add Hit Leg', ()=>setAddingHit(true))}
          </div>
        </div>
      )}
    </div>
  )
}
