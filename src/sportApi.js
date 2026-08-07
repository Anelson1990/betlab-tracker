// Sport-aware grading helpers. MLB uses the official MLB Stats API (proven,
// already in production). NFL/NBA/NHL use ESPN's public scoreboard API —
// free, unauthenticated, same JSON shape across all three leagues.

export const SPORTS = [
  { key: 'mlb', label: 'MLB', emoji: '⚾' },
  { key: 'nfl', label: 'NFL', emoji: '🏈' },
  { key: 'nba', label: 'NBA', emoji: '🏀' },
  { key: 'nhl', label: 'NHL', emoji: '🏒' },
]

const ESPN_PATHS = {
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
}

// Parse a short label like "Jun 14" into an ISO date using the REAL current
// year (not hardcoded), so this doesn't silently go stale season to season.
export function parseCardDate(dateStr) {
  const now = new Date()
  if (!dateStr) return now.toISOString().split('T')[0]
  const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
  const parts = dateStr.trim().split(' ')
  if (parts.length >= 2 && months[parts[0]]) {
    const month = months[parts[0]]
    const day = parts[1].padStart(2, '0')
    // NFL/NHL seasons cross the calendar year boundary. If the label's month
    // is far ahead of today's month (e.g. picking "Jan" in December), assume
    // next year; otherwise use the current year.
    const monthNum = parseInt(month, 10)
    const nowMonth = now.getMonth() + 1
    let year = now.getFullYear()
    if (nowMonth >= 10 && monthNum <= 3) year += 1
    return `${year}-${month}-${day}`
  }
  return now.toISOString().split('T')[0]
}

function toEspnDate(isoDate) {
  return isoDate.replace(/-/g, '')
}

async function fetchMlbGames(isoDate) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${isoDate}&hydrate=linescore,team`)
    return (await res.json())?.dates?.[0]?.games || []
  } catch { return [] }
}

async function fetchEspnGames(sport, isoDate) {
  try {
    const path = ESPN_PATHS[sport]
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${toEspnDate(isoDate)}`)
    const json = await res.json()
    return json?.events || []
  } catch { return [] }
}

export async function fetchGames(sport, isoDate) {
  return sport === 'mlb' ? fetchMlbGames(isoDate) : fetchEspnGames(sport, isoDate)
}

// Returns { found, final, homeAbbr, awayAbbr, homeScore, awayScore, pickedHome, pickedAbbr }
// or null if the team couldn't be matched to a game.
export function matchGame(sport, games, teamAbbr) {
  if (!teamAbbr) return null
  const a = teamAbbr.toUpperCase()

  if (sport === 'mlb') {
    const game = games.find(g => {
      const h = g.teams?.home?.team?.abbreviation?.toUpperCase() || ''
      const aw = g.teams?.away?.team?.abbreviation?.toUpperCase() || ''
      const hn = g.teams?.home?.team?.teamName?.toUpperCase() || ''
      const an = g.teams?.away?.team?.teamName?.toUpperCase() || ''
      return h === a || aw === a || hn.includes(a) || an.includes(a)
    })
    if (!game) return null
    const ha = game.teams?.home?.team?.abbreviation?.toUpperCase()
    const aa = game.teams?.away?.team?.abbreviation?.toUpperCase()
    return {
      found: true,
      final: game.status?.detailedState === 'Final',
      homeAbbr: ha, awayAbbr: aa,
      homeScore: game.teams?.home?.score, awayScore: game.teams?.away?.score,
      pickedHome: a === ha, pickedAbbr: a === ha ? ha : aa,
    }
  }

  // ESPN shape (NFL/NBA/NHL)
  const event = games.find(g => {
    const comp = g.competitions?.[0]
    return comp?.competitors?.some(c => c.team?.abbreviation?.toUpperCase() === a)
  })
  if (!event) return null
  const comp = event.competitions?.[0]
  const home = comp?.competitors?.find(c => c.homeAway === 'home')
  const away = comp?.competitors?.find(c => c.homeAway === 'away')
  const ha = home?.team?.abbreviation?.toUpperCase()
  const aa = away?.team?.abbreviation?.toUpperCase()
  return {
    found: true,
    final: !!event.status?.type?.completed,
    homeAbbr: ha, awayAbbr: aa,
    homeScore: parseInt(home?.score, 10), awayScore: parseInt(away?.score, 10),
    pickedHome: a === ha, pickedAbbr: a === ha ? ha : aa,
  }
}

export function decideWin(m) {
  if (!m || !m.final) return null
  return m.pickedHome ? m.homeScore > m.awayScore : m.awayScore > m.homeScore
}
