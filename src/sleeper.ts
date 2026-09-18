import type { ScoreCard } from './scores.ts'

const SLEEPER_API = 'https://api.sleeper.app/v1'

interface SleeperState {
  week: number
  display_week?: number
  season: string
  league_season?: string
}

interface SleeperLeague {
  league_id: string
  name: string
}

interface SleeperRoster {
  roster_id: number
  owner_id: string | null
}

interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points: number
  starters: string[]
}

interface SleeperUser {
  user_id: string
  display_name: string
}

interface SleeperLeagueDetail {
  scoring_settings: Record<string, number>
}

interface SleeperProjection {
  player_id: string
  stats: Record<string, number>
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${SLEEPER_API}${path}`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Sleeper API ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function resolveSleeperUser(usernameOrId: string): Promise<SleeperUser | null> {
  const res = await fetch(`${SLEEPER_API}/user/${encodeURIComponent(usernameOrId)}`, { signal: AbortSignal.timeout(15_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not reach Sleeper. Please try again.')
  const data = (await res.json()) as SleeperUser | null
  if (!data || !data.user_id) return null
  return data
}

const PROJECTIONS_BASE = 'https://api.sleeper.app/projections/nfl'
const PROJECTION_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

let projectionsCache: { key: string; points: Map<string, number> } | null = null

function computeProjectedPoints(stats: Record<string, number>, scoring: Record<string, number>): number {
  let total = 0
  for (const [statKey, weight] of Object.entries(scoring)) {
    const value = stats[statKey]
    if (typeof value === 'number') total += value * weight
  }
  return total
}

async function getProjectedPointsMap(
  season: string,
  week: number,
  scoring: Record<string, number>,
): Promise<Map<string, number>> {
  const key = `${season}-${week}-${JSON.stringify(scoring)}`
  if (projectionsCache?.key === key) return projectionsCache.points

  const positionParams = PROJECTION_POSITIONS.map((p) => `position[]=${p}`).join('&')
  const res = await fetch(`${PROJECTIONS_BASE}/${season}/${week}?season_type=regular&${positionParams}`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Sleeper projections failed: ${res.status}`)
  const projections = (await res.json()) as SleeperProjection[]

  const points = new Map<string, number>()
  for (const proj of projections) {
    points.set(proj.player_id, computeProjectedPoints(proj.stats ?? {}, scoring))
  }
  projectionsCache = { key, points }
  return points
}

function sumProjected(starters: string[], points: Map<string, number>): number {
  return starters.reduce((sum, id) => sum + (points.get(id) ?? 0), 0)
}

export async function fetchSleeperScore(sleeperUserId: string): Promise<ScoreCard> {
  const state = await getJson<SleeperState>('/state/nfl')
  const season = state.league_season ?? state.season
  const week = state.display_week ?? state.week

  const leagues = await getJson<SleeperLeague[]>(`/user/${sleeperUserId}/leagues/nfl/${season}`)
  const league = leagues[0]
  if (!league) return { provider: 'sleeper', message: 'No active Sleeper leagues found.' }
  const base: ScoreCard = { provider: 'sleeper', leagueName: league.name, week }

  const [rosters, matchups, users, leagueDetail] = await Promise.all([
    getJson<SleeperRoster[]>(`/league/${league.league_id}/rosters`),
    getJson<SleeperMatchup[]>(`/league/${league.league_id}/matchups/${week}`),
    getJson<SleeperUser[]>(`/league/${league.league_id}/users`),
    getJson<SleeperLeagueDetail>(`/league/${league.league_id}`),
  ])

  const myRoster = rosters.find((r) => r.owner_id === sleeperUserId)
  if (!myRoster) return { ...base, message: 'No roster found for this user.' }

  const myMatchup = matchups.find((m) => m.roster_id === myRoster.roster_id)
  if (!myMatchup || myMatchup.matchup_id === null) {
    return { ...base, message: `Week ${week}: No matchup this week (bye).` }
  }

  const oppMatchup = matchups.find(
    (m) => m.matchup_id === myMatchup.matchup_id && m.roster_id !== myRoster.roster_id,
  )

  const nameByRosterId = (rosterId: number): string => {
    const roster = rosters.find((r) => r.roster_id === rosterId)
    const user = roster?.owner_id ? users.find((u) => u.user_id === roster.owner_id) : undefined
    return user?.display_name ?? `Team ${rosterId}`
  }

  const myPoints = myMatchup.points ?? 0
  const myName = nameByRosterId(myRoster.roster_id)

  const projectedPoints = await getProjectedPointsMap(season, week, leagueDetail.scoring_settings).catch(() => null)
  const myProjected = projectedPoints ? sumProjected(myMatchup.starters ?? [], projectedPoints) : null

  if (!oppMatchup) {
    return { ...base, team: { name: myName, points: myPoints, projected: myProjected }, message: 'Waiting on opponent.' }
  }

  const oppPoints = oppMatchup.points ?? 0
  const oppName = nameByRosterId(oppMatchup.roster_id)
  const oppProjected = projectedPoints ? sumProjected(oppMatchup.starters ?? [], projectedPoints) : null

  return {
    ...base,
    team: { name: myName, points: myPoints, projected: myProjected },
    opponent: { name: oppName, points: oppPoints, projected: oppProjected },
  }
}
