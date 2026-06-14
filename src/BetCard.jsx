import { useState, useEffect } from 'react'

const CARD_KEY = 'betlab-daily-card-v1'
const HISTORY_KEY = 'betlab-card-history-v1'
const MLB_API = 'https://statsapi.mlb.com/api/v1'

const EMPTY_CARD = {
  date: '', bankroll: 40,
  potd: { pick: '', game: '', direction: '', odds: '', stake: 10, sources: '', analysis: '', result: 'pending', pl: 0 },
  rfi: [], ml: [],
  hitParlay: { legs: [], stake: 5, result: 'pending', pl: 0 },
  sgp: { legs: [], stake: 8, result: 'pending', pl: 0 },
  totalPL: 0,
}

const RC = {
  pending: { color: '#fbbf24', bg: 'rgba(251,191,36,.12)', border: '#713f12', label: '⏳ Pending' },
  win:     { color: '#4ade80', bg: 'rgba(74,222,128,.12)',  border: '#14532d', label: '✅ Win' },
  loss:    { color: '#f87171', bg: 'rgba(248,113,113,.12)', border: '#7f1d1d', label: '❌ Loss' },
  void:    { color: '#94a3b8', bg: 'rgba(148,163,184,.12)', border: '#334155', label: '🔄 Void' },
  paper:   { color: '#60a5fa', bg: 'rgba(96,165,250,.12)',  border: '#1e40af', label: '📋 Paper' },
}

const cycle = r => { const c=['pending','win','loss','void','paper']; return c[(c.indexOf(r)+1)%c.length] }

function calcPL(result, stake, odds) {
  if (result === 'win') {
    const o = parseInt(odds)
    if (!o) return parseFloat(stake)
    if (o > 0) return parseFloat(((stake * o) / 100).toFixed(2))
    if (o < 0) return parseFloat(((stake * 100) / Math.abs(o)).toFixed(2))
  }
  if (result === 'loss') return -Math.abs(parseFloat(stake) || 0)
  return 0
}

function Badge({ result, onClick, small }) {
  const rc = RC[result] || RC.pending
  return (
    <div onClick={onClick} style={{
      borderRadius: 5, padding: small ? '2px 7px' : '4px 10px',
      fontFamily: "'Barlow Condensed',sans-serif", fontSize: small ? '.62rem' : '.72rem',
      fontWeight: 800, border: `1px solid ${rc.border}`, color: rc.color,
      background: rc.bg, cursor: onClick ? 'pointer' : 'default', flexShrink: 0, whiteSpace: 'nowrap'
    }}>{rc.label}</div>
  )
}

function Inp({ value, onChange, placeholder, type = 'text', label }) {
  return (
    <div>
      {label && <div style={{ fontSize: '.44rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#404060', marginBottom: 3 }}>{label}</div>}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
        style={{ width: '100%', background: '#0c0c1a', border: '1px solid #1a1a30', borderRadius: 6, padding: '7px 10px', fontSize: '.68rem', color: '#f0f0f8', outline: 'none' }} />
    </div>
  )
}

async function fetchMLBGames(date) {
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${date}&hydrate=linescore,team`)
    return (await res.json())?.dates?.[0]?.games || []
  } catch { return [] }
}

async function fetchLinescore(gamePk) {
  try { return (await (await fetch(`${MLB_API}/game/${gamePk}/linescore`)).json()) } catch { return null }
}

async function fetchBoxScore(gamePk) {
  try { return (await (await fetch(`${MLB_API}/game/${gamePk}/boxscore`)).json()) } catch { return null }
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
  const [gradeLog, setGradeLog] = useState([])
  const [section, setSection] = useState('potd')
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newBR, setNewBR] = useState(bankroll || 40)
  const [addingRFI, setAddingRFI] = useState(false)
  const [addingML, setAddingML] = useState(false)
  const [addingHit, setAddingHit] = useState(false)
  const [rfiForm, setRfiForm] = useState({ game:'', homeTeam:'', awayTeam:'', pick:'YRFI', conf:'', stake:8 })
  const [mlForm, setMlForm] = useState({ game:'', direction:'', odds:'', stake:5, sources:'' })
  const [hitForm, setHitForm] = useState({ player:'', team:'', rate:'', l10:'', split:'' })

  useEffect(() => {
    try { const s = localStorage.getItem(CARD_KEY); if (s) setCard(JSON.parse(s)) } catch {}
  }, [])

  const save = c => { setCard(c); try { localStorage.setItem(CARD_KEY, JSON.stringify(c)) } catch {} }

  const recalc = c => {
    const pl = (c.potd.pl||0) + c.rfi.reduce((a,r)=>a+(r.pl||0),0) + c.ml.reduce((a,m)=>a+(m.pl||0),0) + (c.hitParlay.pl||0) + (c.sgp.pl||0)
    c.totalPL = parseFloat(pl.toFixed(2))
    save(c)
  }

  // ── IMPORT FROM JSON ──────────────────────────────────────────────────────
  const importCard = () => {
    setImportError('')
    try {
      // Strip markdown code fences if present
      const clean = importText.replace(/```json|```/g, '').trim()
      const data = JSON.parse(clean)

      // Validate required fields
      if (!data.date || !data.potd) { setImportError('Missing required fields: date, potd'); return }

      const newCard = {
        date: data.date,
        bankroll: parseFloat(data.bankroll) || parseFloat(newBR) || 40,
        potd: {
          pick: data.potd.pick || '',
          game: data.potd.game || '',
          direction: data.potd.direction || '',
          odds: data.potd.odds || '',
          stake: parseFloat(data.potd.stake) || 10,
          sources: data.potd.sources || '',
          analysis: data.potd.analysis || '',
          result: 'pending', pl: 0,
        },
        rfi: (data.rfi || []).map(r => ({
          game: r.game || '', homeTeam: r.homeTeam || '', awayTeam: r.awayTeam || '',
          pick: r.pick || 'YRFI', conf: r.conf || '', stake: parseFloat(r.stake) || 8,
          result: 'pending', pl: 0,
        })),
        ml: (data.ml || []).map(m => ({
          game: m.game || '', direction: m.direction || '', odds: m.odds || '',
          stake: parseFloat(m.stake) || 5, sources: m.sources || '',
          result: 'pending', pl: 0,
        })),
        hitParlay: {
          stake: parseFloat(data.hitParlay?.stake) || 5,
          result: 'pending', pl: 0,
          legs: (data.hitParlay?.legs || []).map(l => ({
            player: l.player || '', team: l.team || '', rate: l.rate || '',
            l10: l.l10 || '', split: l.split || '', result: 'pending',
          })),
        },
        sgp: {
          stake: parseFloat(data.sgp?.stake) || 8,
          result: 'pending', pl: 0,
          legs: data.sgp?.legs || [],
          odds: data.sgp?.odds || '',
          game: data.sgp?.game || '',
        },
        totalPL: 0,
      }
      recalc(newCard)
      setShowImport(false)
      setImportText('')
      setSection('potd')
    } catch (e) {
      setImportError('Invalid JSON — check format and try again')
    }
  }

  const startNew = () => {
    const today = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })
    recalc({ ...EMPTY_CARD, date: newDate || today, bankroll: parseFloat(newBR) || 40 })
    setShowNewForm(false)
  }

  const archive = () => {
    if (!card) return
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      h.push({ ...card, archivedAt: new Date().toISOString() })
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
    } catch {}
    if (onCardSaved) onCardSaved(card)
    localStorage.removeItem(CARD_KEY)
    setCard(null)
  }

  const updPOTD = (f, v) => {
    const c = { ...card, potd: { ...card.potd, [f]: v } }
    if (f === 'result') c.potd.pl = calcPL(v, c.potd.stake, c.potd.odds)
    recalc(c)
  }

  const updRFI = (i, f, v) => {
    const rfi = [...card.rfi]; rfi[i] = { ...rfi[i], [f]: v }
    if (f === 'result') rfi[i].pl = calcPL(v, rfi[i].stake, '-110')
    recalc({ ...card, rfi })
  }

  const updML = (i, f, v) => {
    const ml = [...card.ml]; ml[i] = { ...ml[i], [f]: v }
    if (f === 'result') ml[i].pl = calcPL(v, ml[i].stake, ml[i].odds)
    recalc({ ...card, ml })
  }

  const updHit = (i, f, v) => {
    const legs = [...card.hitParlay.legs]; legs[i] = { ...legs[i], [f]: v }
    const allW = legs.every(l => l.result === 'win')
    const anyL = legs.some(l => l.result === 'loss')
    const res = allW ? 'win' : anyL ? 'loss' : 'pending'
    recalc({ ...card, hitParlay: { ...card.hitParlay, legs, result: res, pl: calcPL(res, card.hitParlay.stake, '+350') } })
  }

  const addRFI = () => {
    recalc({ ...card, rfi: [...card.rfi, { ...rfiForm, stake: parseFloat(rfiForm.stake)||8, result:'pending', pl:0 }] })
    setRfiForm({ game:'', homeTeam:'', awayTeam:'', pick:'YRFI', conf:'', stake:8 }); setAddingRFI(false)
  }

  const addML = () => {
    recalc({ ...card, ml: [...card.ml, { ...mlForm, stake: parseFloat(mlForm.stake)||5, result:'pending', pl:0 }] })
    setMlForm({ game:'', direction:'', odds:'', stake:5, sources:'' }); setAddingML(false)
  }

  const addHit = () => {
    recalc({ ...card, hitParlay: { ...card.hitParlay, legs: [...card.hitParlay.legs, { ...hitForm, result:'pending' }] } })
    setHitForm({ player:'', team:'', rate:'', l10:'', split:'' }); setAddingHit(false)
  }

  // ── AUTO GRADE ────────────────────────────────────────────────────────────
  const autoGrade = async () => {
    setGrading(true); const log = []; let updated = JSON.parse(JSON.stringify(card))
    log.push('🔄 Fetching MLB scores...')
    const dateStr = new Date().toISOString().split('T')[0]
    const games = await fetchMLBGames(dateStr)
    if (!games.length) { setGradeLog(['⚠️ No games found. Try after games finish.']); setGrading(false); return }
    log.push(`✅ Found ${games.length} games`)

    const gradeGame = async (pick, teamAbbr, isRFI, stake, odds) => {
      const game = findGame(games, teamAbbr)
      if (!game) return { result: 'pending', note: `⚠️ Game not found for ${teamAbbr}` }
      if (game.status?.detailedState !== 'Final') return { result: 'pending', note: `⏳ ${teamAbbr} game not final yet` }
      const hs = game.teams?.home?.score; const as = game.teams?.away?.score
      const ha = game.teams?.home?.team?.abbreviation; const aa = game.teams?.away?.team?.abbreviation
      if (isRFI) {
        const ls = await fetchLinescore(game.gamePk)
        const hr1 = ls?.innings?.[0]?.home?.runs || 0; const ar1 = ls?.innings?.[0]?.away?.runs || 0
        const yrfi = hr1 > 0 || ar1 > 0; const pickedY = pick === 'YRFI'
        const result = (pickedY && yrfi) || (!pickedY && !yrfi) ? 'win' : 'loss'
        return { result, note: `${result==='win'?'✅':'❌'} ${pick}: 1st inn home:${hr1} away:${ar1} → ${result.toUpperCase()}` }
      } else {
        const picked = teamAbbr?.toUpperCase(); const homeWon = hs > as
        const pickedHome = picked === ha
        const result = (pickedHome && homeWon) || (!pickedHome && !homeWon) ? 'win' : 'loss'
        return { result, note: `${result==='win'?'✅':'❌'} ${picked} ML: ${aa} ${as} @ ${ha} ${hs} → ${result.toUpperCase()}` }
      }
    }

    // POTD
    if (card.potd.direction && card.potd.result === 'pending') {
      const isRFI = card.potd.pick?.includes('YRFI') || card.potd.pick?.includes('NRFI')
      const { result, note } = await gradeGame(isRFI ? (card.potd.pick?.includes('YRFI') ? 'YRFI' : 'NRFI') : null, card.potd.direction, isRFI, card.potd.stake, card.potd.odds)
      updated.potd.result = result; updated.potd.pl = calcPL(result, updated.potd.stake, updated.potd.odds)
      log.push(`🎯 POTD: ${note}`)
    }

    // RFI
    for (let i = 0; i < card.rfi.length; i++) {
      if (card.rfi[i].result !== 'pending') continue
      const { result, note } = await gradeGame(card.rfi[i].pick, card.rfi[i].homeTeam || card.rfi[i].awayTeam, true, card.rfi[i].stake, '-110')
      updated.rfi[i].result = result; updated.rfi[i].pl = calcPL(result, updated.rfi[i].stake, '-110')
      log.push(`🎲 RFI: ${note}`)
    }

    // ML
    for (let i = 0; i < card.ml.length; i++) {
      if (card.ml[i].result !== 'pending') continue
      const { result, note } = await gradeGame(null, card.ml[i].direction, false, card.ml[i].stake, card.ml[i].odds)
      updated.ml[i].result = result; updated.ml[i].pl = calcPL(result, updated.ml[i].stake, updated.ml[i].odds)
      log.push(`⚾ ML: ${note}`)
    }

    // Hit parlay legs
    for (let i = 0; i < card.hitParlay.legs.length; i++) {
      const leg = card.hitParlay.legs[i]
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

    // Recalc parlay
    const allW = updated.hitParlay.legs.every(l => l.result === 'win')
    const anyL = updated.hitParlay.legs.some(l => l.result === 'loss')
    if (allW) { updated.hitParlay.result='win'; updated.hitParlay.pl=calcPL('win', updated.hitParlay.stake, '+350') }
    else if (anyL) { updated.hitParlay.result='loss'; updated.hitParlay.pl=-updated.hitParlay.stake }

    log.push('✅ Auto-grade complete — tap any result to override')
    recalc(updated); setGradeLog(log); setGrading(false)
  }

  const S = { inp: { width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#f0f0f8', outline:'none' } }
  const inp = (v, set, ph, type='text') => <input value={v} onChange={e=>set(e.target.value)} placeholder={ph} type={type} style={S.inp} />
  const sel = (v, set, opts) => <select value={v} onChange={e=>set(e.target.value)} style={S.inp}>{opts.map(([val,lbl])=><option key={val} value={val}>{lbl}</option>)}</select>
  const addBtn = (lbl, fn) => <button onClick={fn} style={{ width:'100%', padding:7, background:'#0c0c1a', border:'1px dashed #2a2a50', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:4 }}>{lbl}</button>
  const secBtn = (id, lbl) => <button onClick={()=>setSection(id)} style={{ flex:1, padding:'6px 2px', fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.6rem', fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase', border:'1px solid', borderRadius:5, background: section===id?'#1a1a30':'#0c0c1a', color: section===id?'#f0f0f8':'#404060', borderColor: section===id?'#2a2a50':'#1a1a30' }}>{lbl}</button>

  // ── NO CARD ───────────────────────────────────────────────────────────────
  if (!card) return (
    <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:16 }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.3rem', color:'#505070', marginBottom:4, textAlign:'center' }}>No Active Card</div>
        <div style={{ fontSize:'.58rem', color:'#404060', marginBottom:12, textAlign:'center', lineHeight:1.6 }}>
          Paste the JSON from Claude to instantly load today's card with all picks, odds, and analysis pre-filled
        </div>

        {/* IMPORT */}
        <button onClick={()=>setShowImport(!showImport)} style={{ width:'100%', padding:9, background:'rgba(37,99,235,.15)', border:'1px solid #2563eb', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#60a5fa', marginBottom:6 }}>
          📋 Paste Card JSON
        </button>

        {showImport && (
          <div style={{ marginBottom:8 }}>
            <textarea value={importText} onChange={e=>setImportText(e.target.value)}
              placeholder={`Paste the JSON card from Claude here...\n\nExample:\n{\n  "date": "Jun 14",\n  "bankroll": 40,\n  "potd": {\n    "pick": "ATL ML -116",\n    "direction": "ATL",\n    "odds": "-116",\n    "stake": 10,\n    "sources": "XGB+Con+LGB",\n    "analysis": "Pérez ERA 2.31 elite vs Kay ERA 4.89"\n  },\n  "rfi": [...],\n  "ml": [...],\n  "hitParlay": { "stake": 5, "legs": [...] }\n}`}
              rows={10} style={{ width:'100%', background:'#0c0c1a', border:`1px solid ${importError?'#7f1d1d':'#1a1a30'}`, borderRadius:6, padding:'8px 10px', fontSize:'.6rem', color:'#f0f0f8', outline:'none', resize:'vertical', lineHeight:1.6 }} />
            {importError && <div style={{ fontSize:'.55rem', color:'#f87171', marginTop:3 }}>⚠️ {importError}</div>}
            <button onClick={importCard} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff', marginTop:6 }}>
              Load Card ↗
            </button>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:8, margin:'8px 0' }}>
          <div style={{ flex:1, height:1, background:'#1a1a30' }} />
          <div style={{ fontSize:'.48rem', color:'#404060', letterSpacing:'.08em', textTransform:'uppercase' }}>or start manually</div>
          <div style={{ flex:1, height:1, background:'#1a1a30' }} />
        </div>

        <button onClick={()=>setShowNewForm(!showNewForm)} style={{ width:'100%', padding:9, background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#505070' }}>
          + Start Blank Card
        </button>

        {showNewForm && (
          <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
            {inp(newDate, setNewDate, 'Date e.g. Jun 14')}
            {inp(newBR, setNewBR, 'Bankroll e.g. 40', 'number')}
            <button onClick={startNew} style={{ width:'100%', padding:9, background:'#2563eb', border:'none', borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.8rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff' }}>Create</button>
          </div>
        )}
      </div>

      {/* JSON FORMAT GUIDE */}
      <div style={{ background:'#06060e', border:'1px solid #1a1a30', borderRadius:8, padding:10 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.65rem', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'#404060', marginBottom:6 }}>📋 JSON Format Guide</div>
        <pre style={{ fontSize:'.5rem', color:'#505070', lineHeight:1.7, overflow:'auto', whiteSpace:'pre-wrap' }}>{`{
  "date": "Jun 14",
  "bankroll": 40,
  "potd": {
    "pick": "ATL ML -116",
    "direction": "ATL",
    "odds": "-116",
    "stake": 10,
    "sources": "XGB 93.2% · Con 93.2% · LGB 68.4%",
    "analysis": "Pérez ERA 2.31 vs Kay ERA 4.89"
  },
  "rfi": [
    {
      "game": "ATL @ CWS",
      "homeTeam": "CWS",
      "awayTeam": "ATL",
      "pick": "YRFI",
      "conf": "64.2",
      "stake": 15
    }
  ],
  "ml": [
    {
      "game": "DET @ CLE",
      "direction": "DET",
      "odds": "+108",
      "stake": 5,
      "sources": "XGB 83.7% · Con 83.7%"
    }
  ],
  "hitParlay": {
    "stake": 5,
    "legs": [
      {
        "player": "Josh Jung",
        "team": "TEX",
        "rate": "85%",
        "l10": "9/10",
        "split": "vsRHP .309"
      }
    ]
  }
}`}</pre>
      </div>
    </div>
  )

  const totalStaked = (card.potd.stake||0) + card.rfi.reduce((a,r)=>a+(r.stake||0),0) + card.ml.reduce((a,m)=>a+(m.stake||0),0) + (card.hitParlay.stake||0) + (card.sgp.stake||0)
  const endBR = card.bankroll + card.totalPL

  return (
    <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

      {/* CARD HEADER */}
      <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', color:'#f0f0f8', lineHeight:1 }}>{card.date}</div>
            <div style={{ fontSize:'.42rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginTop:1 }}>
              Start ${card.bankroll.toFixed(2)} · Staked ${totalStaked.toFixed(2)} · End ${endBR.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.4rem', lineHeight:1, color: card.totalPL >= 0 ? '#4ade80' : '#f87171' }}>
              {card.totalPL >= 0 ? '+' : ''}${card.totalPL.toFixed(2)}
            </div>
            <div style={{ fontSize:'.38rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060' }}>Total P&L</div>
          </div>
        </div>

        <div style={{ display:'flex', gap:3, marginBottom:8 }}>
          {secBtn('potd','🎯 POTD')}
          {secBtn('rfi','🎲 RFI')}
          {secBtn('ml','⚾ ML')}
          {secBtn('props','⚡ Props')}
        </div>

        <div style={{ display:'flex', gap:4 }}>
          <button onClick={autoGrade} disabled={grading} style={{
            flex:1, padding:8, background: grading?'#1a1a30':'rgba(37,99,235,.15)', border:'1px solid #2563eb',
            borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem', fontWeight:700,
            letterSpacing:'.08em', textTransform:'uppercase', color: grading?'#404060':'#60a5fa',
          }}>{grading ? '⏳ Grading...' : '⚡ Auto Grade'}</button>
          <button onClick={archive} style={{
            padding:'8px 12px', background:'rgba(74,222,128,.08)', border:'1px solid #14532d',
            borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem',
            fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#4ade80',
          }}>Archive ✓</button>
          <button onClick={()=>{localStorage.removeItem(CARD_KEY);setCard(null)}} style={{
            padding:'8px 10px', background:'rgba(248,113,113,.08)', border:'1px solid #7f1d1d',
            borderRadius:6, fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.7rem',
            fontWeight:700, color:'#f87171',
          }}>✕</button>
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
        <div style={{ background:'#09090f', border:'1px solid rgba(250,204,21,.2)', borderRadius:10, padding:12 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:'#fbbf24', marginBottom:8 }}>🎯 Pick of the Day</div>

          <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:8 }}>
            <Inp value={card.potd.pick} onChange={v=>updPOTD('pick',v)} placeholder="ATL ML -116" label="Pick" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
              <Inp value={card.potd.direction} onChange={v=>updPOTD('direction',v)} placeholder="ATL" label="Team Abbr" />
              <Inp value={card.potd.odds} onChange={v=>updPOTD('odds',v)} placeholder="-116" label="Odds" />
              <Inp value={card.potd.stake} onChange={v=>updPOTD('stake',parseFloat(v)||0)} placeholder="10" type="number" label="Stake $" />
              <div>
                <div style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3 }}>Payout if Win</div>
                <div style={{ background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.68rem', color:'#4ade80', fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700 }}>
                  +${calcPL('win', card.potd.stake, card.potd.odds).toFixed(2)}
                </div>
              </div>
            </div>
            <Inp value={card.potd.sources} onChange={v=>updPOTD('sources',v)} placeholder="XGB 93.2% · Con 93.2% · LGB 68.4%" label="Model Sources" />
            <div>
              <div style={{ fontSize:'.44rem', letterSpacing:'.08em', textTransform:'uppercase', color:'#404060', marginBottom:3 }}>Analysis</div>
              <textarea value={card.potd.analysis} onChange={e=>updPOTD('analysis',e.target.value)}
                placeholder="Pitcher ERAs, sharp money, key signals..." rows={3}
                style={{ width:'100%', background:'#0c0c1a', border:'1px solid #1a1a30', borderRadius:6, padding:'7px 10px', fontSize:'.62rem', color:'#f0f0f8', outline:'none', resize:'none' }} />
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderTop:'1px solid #1a1a2e' }}>
            <Badge result={card.potd.result} onClick={()=>updPOTD('result', cycle(card.potd.result))} />
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'1.1rem', fontWeight:800, color: card.potd.pl>=0?'#4ade80':'#f87171' }}>
              {card.potd.pl>=0?'+':''}${card.potd.pl.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* ── RFI ── */}
      {section === 'rfi' && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {card.rfi.map((r,i) => (
            <div key={i} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color:'#f0f0f8' }}>{r.game}</div>
                  <div style={{ fontSize:'.46rem', color:'#505070' }}>{r.pick} · {r.conf}% · ${r.stake} · odds -110</div>
                </div>
                <Badge result={r.result} onClick={()=>updRFI(i,'result',cycle(r.result))} small />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:'.5rem', color:'#404060' }}>Win: +${calcPL('win',r.stake,'-110').toFixed(2)} · Loss: -${r.stake}</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color: r.pl>=0?'#4ade80':'#f87171' }}>{r.pl>=0?'+':''}${r.pl.toFixed(2)}</div>
              </div>
            </div>
          ))}
          {addingRFI ? (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'#505070' }}>Add RFI Pick</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                {inp(rfiForm.game, v=>setRfiForm(f=>({...f,game:v})), 'ATL @ CWS')}
                {inp(rfiForm.homeTeam, v=>setRfiForm(f=>({...f,homeTeam:v})), 'Home abbr e.g. CWS')}
                {sel(rfiForm.pick, v=>setRfiForm(f=>({...f,pick:v})), [['YRFI','YRFI'],['NRFI','NRFI']])}
                {inp(rfiForm.conf, v=>setRfiForm(f=>({...f,conf:v})), 'Conf % e.g. 67.0')}
                {inp(rfiForm.stake, v=>setRfiForm(f=>({...f,stake:v})), 'Stake $', 'number')}
              </div>
              <div style={{ display:'flex', gap:4 }}>
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
          {card.ml.map((m,i) => (
            <div key={i} style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color:'#f0f0f8' }}>{m.direction} ML · {m.odds}</div>
                  <div style={{ fontSize:'.46rem', color:'#505070' }}>{m.game} · ${m.stake} · {m.sources}</div>
                </div>
                <Badge result={m.result} onClick={()=>updML(i,'result',cycle(m.result))} small />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:'.5rem', color:'#404060' }}>Win: +${calcPL('win',m.stake,m.odds).toFixed(2)} · Loss: -${m.stake}</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color: m.pl>=0?'#4ade80':'#f87171' }}>{m.pl>=0?'+':''}${m.pl.toFixed(2)}</div>
              </div>
            </div>
          ))}
          {addingML ? (
            <div style={{ background:'#09090f', border:'1px solid #1a1a2e', borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.68rem', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'#505070' }}>Add ML Pick</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                {inp(mlForm.game, v=>setMlForm(f=>({...f,game:v})), 'DET @ CLE')}
                {inp(mlForm.direction, v=>setMlForm(f=>({...f,direction:v})), 'Team abbr e.g. DET')}
                {inp(mlForm.odds, v=>setMlForm(f=>({...f,odds:v})), 'Odds e.g. +108')}
                {inp(mlForm.stake, v=>setMlForm(f=>({...f,stake:v})), 'Stake $', 'number')}
                {inp(mlForm.sources, v=>setMlForm(f=>({...f,sources:v})), 'Sources e.g. XGB+Con')}
              </div>
              <div style={{ display:'flex', gap:4 }}>
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
          <div style={{ background:'#09090f', border:'1px solid #1a2a1a', borderRadius:10, padding:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.72rem', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'#4ade80' }}>⚡ Lazer Hit Parlay</div>
              <Badge result={card.hitParlay.result} small />
            </div>
            {card.hitParlay.legs.map((leg,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'#0c0c1a', borderRadius:6, padding:'7px 10px', marginBottom:4 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'.65rem', fontWeight:700, color:'#f0f0f8' }}>{leg.player}</div>
                  <div style={{ fontSize:'.46rem', color:'#505070' }}>{leg.rate} · {leg.l10} · {leg.split}</div>
                </div>
                <Badge result={leg.result} onClick={()=>updHit(i,'result',cycle(leg.result))} small />
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6, paddingTop:6, borderTop:'1px solid #1a2a1a' }}>
              <div style={{ fontSize:'.5rem', color:'#404060' }}>
                ${card.hitParlay.stake} staked · Win: +${calcPL('win',card.hitParlay.stake,'+350').toFixed(2)}
              </div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'.92rem', fontWeight:800, color: card.hitParlay.pl>=0?'#4ade80':'#f87171' }}>
                {card.hitParlay.pl>=0?'+':''}${card.hitParlay.pl.toFixed(2)}
              </div>
            </div>
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
