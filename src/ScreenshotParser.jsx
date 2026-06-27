import { useState } from 'react'

const C = {
  bg:'#07070f', card:'#0e0e1c', border:'#1a1a2e',
  accent:'#4ade80', gold:'#fbbf24', red:'#f87171',
  blue:'#60a5fa', purple:'#a78bfa', muted:'#1e1e30',
  text:'#e0e0f0', dim:'#5050a0',
}

// Simple regex-based parser for common sportsbook formats
const parseBetSlip = (text) => {
  const lines = text.split('\n').filter(l => l.trim())
  const bet = { pick:'', odds:'', stake:0, payout:0 }
  
  // Find pick/selection (team name or player)
  for (let line of lines) {
    if (/MLB|NFL|NBA|NHL|soccer|esports/i.test(line)) {
      bet.pick = line.trim()
      break
    }
  }
  
  // Find odds (-110, +150, etc)
  const oddsMatch = text.match(/([+-]\d{2,3})/);  if (oddsMatch) bet.odds = oddsMatch[1]
  
  // Find stake
  const stakeMatch = text.match(/(\$\d+\.?\d*|wager.*?(\d+\.?\d*))/i)
  if (stakeMatch) bet.stake = parseFloat(stakeMatch[1].replace(/\D/g, '')) || 0
  
  // Find payout/to-win
  const payoutMatch = text.match(/(to win|payout).*?(\d+\.?\d*)/i)
  if (payoutMatch) bet.payout = parseFloat(payoutMatch[2]) || 0
  
  return bet
}

export default function ScreenshotParser({ onAddBet }) {
  const [parserOpen, setParserOpen] = useState(false)
  const [parserStatus, setParserStatus] = useState('')
  const [parsedBet, setParsedBet] = useState(null)
  
  const parseScreenshot = async (file) => {
    if (!file) return
    
    setParserStatus('⏳ Loading image...')
    
    try {
      // Dynamically load Tesseract
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      
      // Read file as data URL
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          setParserStatus('🔍 Extracting text from image...')
          const { data } = await worker.recognize(e.target.result)
          
          if (!data.text || data.text.trim().length < 5) {
            setParserStatus('❌ No text found in image. Try a clearer screenshot.')
            await worker.terminate()
            return
          }
          
          setParserStatus('✅ Text extracted. Parsing bet...')
          const bet = parseBetSlip(data.text)
          
          if (!bet.pick || !bet.odds || bet.stake === 0) {
            setParserStatus('❌ Could not parse: missing pick, odds, or stake. Check format.')
          } else {
            setParserStatus(`✅ Parsed! Pick: ${bet.pick.slice(0,30)}... | Odds: ${bet.odds} | Stake: $${bet.stake}`)
            setParsedBet(bet)
          }
          
          await worker.terminate()
        } catch (err) {
          setParserStatus(`❌ Parse error: ${err.message.slice(0,40)}`)
          await worker.terminate()
        }
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setParserStatus(`❌ Error loading OCR: ${err.message.slice(0,40)}`)
    }
  }
  
  const addParsedBet = (bet, category) => {
    onAddBet(bet, category)
    setParsedBet(null)
    setParserStatus('')
    setParserOpen(false)
  }
  
  return (
    <div style={{ background:C.bg, border:`1px solid ${C.blue}30`,
      borderRadius:12, padding:14, marginTop:14 }}>
      <div style={{ color:C.blue, fontSize:'.65rem', letterSpacing:'.12em',
        textTransform:'uppercase', marginBottom:10, fontWeight:800 }}>📸 Bet Slip Parser</div>
      
      {!parserOpen ? (
        <button onClick={()=>setParserOpen(true)}
          style={{ width:'100%', padding:10, background:C.blue+'15',
            border:`1px solid ${C.blue}`, borderRadius:8, color:C.blue,
            fontWeight:700, fontSize:'.75rem', cursor:'pointer',
            letterSpacing:'.05em' }}>
          + UPLOAD SCREENSHOT
        </button>
      ) : (
        <div>
          {/* File input */}
          <input type='file' accept='image/*'
            onChange={(e) => parseScreenshot(e.target.files[0])}
            style={{ width:'100%', marginBottom:10, fontSize:'.7rem',
              color:C.dim, padding:'8px', background:C.bg,
              border:`1px solid ${C.border}`, borderRadius:6 }} />
          
          {/* Parser status */}
          {parserStatus && (
            <div style={{ background:C.bg, border:`1px solid ${C.border}`,
              borderRadius:8, padding:10, marginBottom:10, fontSize:'.7rem',
              color:parserStatus.startsWith('✅')?C.accent:parserStatus.startsWith('❌')?C.red:C.dim,
              lineHeight:1.5 }}>
              {parserStatus}
            </div>
          )}

          {/* Parsed bet display */}
          {parsedBet && (
            <div style={{ background:C.bg, border:`1px solid ${C.border}`,
              borderRadius:8, padding:10, marginBottom:10, fontSize:'.7rem' }}>
              <div style={{ color:C.dim, marginBottom:6, fontWeight:700 }}>Parsed Bet:</div>
              <div style={{ color:C.text, marginBottom:3 }}>📍 {parsedBet.pick}</div>
              <div style={{ color:C.text, marginBottom:3 }}>🎯 {parsedBet.odds}</div>
              <div style={{ color:C.text, marginBottom:6 }}>💰 ${parsedBet.stake}</div>
              
              {/* Category routing buttons */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginTop:10 }}>
                {[
                  { label:'⭐ POTD', category:'potd', color:C.gold },
                  { label:'🎯 RFI', category:'rfi', color:C.blue },
                  { label:'📊 Props', category:'props', color:C.accent },
                  { label:'🎰 Off-Card', category:'offcard', color:C.dim }
                ].map(({ label, category, color }) => (
                  <button key={category}
                    onClick={() => addParsedBet(parsedBet, category)}
                    style={{ padding:'8px 6px', background:color+'15',
                      border:`1px solid ${color}`, borderRadius:6, color,
                      fontWeight:700, fontSize:'.65rem', cursor:'pointer',
                      letterSpacing:'.03em' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={()=>setParserOpen(false)}
            style={{ width:'100%', padding:8, background:'transparent',
              border:`1px solid ${C.border}`, borderRadius:6, color:C.dim,
              fontWeight:700, fontSize:'.7rem', cursor:'pointer' }}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}
