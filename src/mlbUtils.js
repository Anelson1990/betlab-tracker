// Shared MLB API grading helpers
const MLB_API = 'https://statsapi.mlb.com/api/v1'

export function parseCardDate(dateStr) {
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

export async function fetchGames(dateStr) {
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${dateStr}&hydrate=linescore,team`)
    return (await res.json())?.dates?.[0]?.games || []
  } catch { return [] }
}

export function findGame(games, abbr) {
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

// Grade pending sharp picks for a given day's pick array (mutates copies, returns {picks, log})
export async function gradeSharpPicks(picks, dateStr) {
  const log = []
  const games = await fetchGames(dateStr)
  if (!games.length) return { picks, log: ['⚠️ No games found'], graded: 0 }
  let graded = 0
  const out = picks.map(p => ({ ...p }))
  for (const pick of out) {
    if (pick.result !== 'pending') continue
    const nameField = pick.sharpPick || pick.bet || pick.side || ''
    const teamAbbr = nameField.split(' ')[0]
    if (!teamAbbr) { log.push(`⚠️ ${pick.game}: no pick name`); continue }
    const game = findGame(games, teamAbbr)
    if (!game) { log.push(`⚠️ ${pick.game}: game not found`); continue }
    if (game.status?.detailedState !== 'Final') { log.push(`⏳ ${pick.game}: not final`); continue }
    const hs = game.teams?.home?.score
    const as = game.teams?.away?.score
    const ha = game.teams?.home?.team?.abbreviation?.toUpperCase()
    const ta = teamAbbr.toUpperCase()
    const pickedHome = ta === ha
    const won = (pickedHome && hs > as) || (!pickedHome && as > hs)
    pick.result = won ? 'win' : 'loss'
    graded++
    log.push(`${won?'✅':'❌'} ${pick.game} → ${won?'WIN':'LOSS'}`)
  }
  return { picks: out, log, graded }
}
