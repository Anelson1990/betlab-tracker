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

// Betting-site/sharp-splits abbreviations that don't match a sport's own API
// abbreviation. Two confirmed real cases so far, same bug pattern each time:
// MLB: Arizona is commonly written "ARI" on splits sites, but MLB's API uses
//   "AZ" -- exact match failed, and the old substring-fallback logic then
//   matched "ARI" against "Mariners" (M-ARI-NERS) as a false positive,
//   silently grading a Colorado @ Arizona pick against Seattle @ Yankees'
//   actual result.
// NFL: Washington is commonly written "WAS", but ESPN's API uses "WSH" --
//   this one just failed to match at all (correctly, since the substring
//   fallback was already removed by the time this was found) rather than
//   silently misgrading, but still blocked Auto Grade from working.
// Kept as per-sport maps since abbreviation quirks are sport/API-specific;
// add to the relevant map immediately if another mismatch is ever found
// rather than reintroducing any kind of fuzzy/substring fallback.
const ABBR_ALIASES = {
  mlb: { ARI: 'AZ' },
  nfl: { WAS: 'WSH' },
  nba: {},
  nhl: {},
}

// Returns { found, final, homeAbbr, awayAbbr, homeScore, awayScore, pickedHome, pickedAbbr }
// or null if the team couldn't be matched to a game.
export function matchGame(sport, games, teamAbbr) {
  if (!teamAbbr) return null
  let a = teamAbbr.toUpperCase()
  a = (ABBR_ALIASES[sport] && ABBR_ALIASES[sport][a]) || a

  if (sport === 'mlb') {
    // Exact abbreviation match ONLY. A previous fallback (checking if the
    // search term appeared as a substring anywhere in a team's full name)
    // caused a real, confirmed silent misgrade -- "ARI" matched inside
    // "Mariners" and attributed Seattle @ Yankees' score to a Colorado @
    // Arizona pick. Failing to match and returning null (pick stays pending,
    // visible in the app) is far safer than a wrong but confident match.
    const game = games.find(g => {
      const h = g.teams?.home?.team?.abbreviation?.toUpperCase() || ''
      const aw = g.teams?.away?.team?.abbreviation?.toUpperCase() || ''
      return h === a || aw === a
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
