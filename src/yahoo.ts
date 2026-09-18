import type { ScoreCard, TeamScore } from './scores'

export interface YahooSettings {
  /** Yahoo client ID / consumer key, saved on the phone for future OAuth setup. */
  apiKey: string
  /** Temporary, manually supplied OAuth token until sign-in is implemented. */
  accessToken: string
  teamKey: string
}

export const EMPTY_YAHOO_SETTINGS: YahooSettings = {
  apiKey: '',
  accessToken: '',
  teamKey: '',
}

const YAHOO_API = 'https://fantasysports.yahooapis.com/fantasy/v2'
const REQUEST_TIMEOUT_MS = 10_000
const TEAM_KEY_PATTERN = /^(\d+\.l\.\d+)\.t\.\d+$/

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Yahoo splits resource fields across arrays and objects with numeric keys.
// Only unwrap those containers: searching arbitrary descendants could mix a
// team's name/points with its opponent's or its manager's metadata.
function field(value: unknown, key: string): unknown {
  if (isObject(value) && Object.hasOwn(value, key)) return value[key]
  const fragments = Array.isArray(value)
    ? value
    : isObject(value)
      ? Object.entries(value).filter(([name]) => /^\d+$/.test(name)).map(([, item]) => item)
      : []
  for (const fragment of fragments) {
    const found = field(fragment, key)
    if (found !== undefined) return found
  }
  return undefined
}

function resources(value: unknown, key: string): unknown[] {
  if (isObject(value) && Object.hasOwn(value, key)) return [value[key]]
  const fragments = Array.isArray(value)
    ? value
    : isObject(value)
      ? Object.entries(value).filter(([name]) => /^\d+$/.test(name)).map(([, item]) => item)
      : []
  return fragments.flatMap((fragment) => resources(fragment, key))
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function points(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function week(value: unknown): number | undefined {
  const number = points(value)
  return number !== null && Number.isInteger(number) && number > 0 ? number : undefined
}

function teamScore(team: unknown): TeamScore {
  return {
    name: text(field(team, 'name')) ?? 'Yahoo team',
    points: points(field(field(team, 'team_points'), 'total')),
    projected: points(field(field(team, 'team_projected_points'), 'total')),
  }
}

function message(content: string): ScoreCard {
  return { provider: 'yahoo', message: content }
}

/** Parse Yahoo's league/scoreboard response without substituting missing scores with zero. */
export function parseYahooScoreboard(payload: unknown, teamKey: string): ScoreCard {
  const league = field(field(payload, 'fantasy_content'), 'league')
  const scoreboard = field(league, 'scoreboard')
  if (scoreboard === undefined || scoreboard === null) {
    return message('Yahoo score unavailable.\nTry refreshing.')
  }

  const card: ScoreCard = {
    provider: 'yahoo',
    leagueName: text(field(league, 'name')),
    week: week(field(scoreboard, 'week')) ?? week(field(league, 'current_week')),
  }

  for (const matchup of resources(field(scoreboard, 'matchups'), 'matchup')) {
    const teams = resources(field(matchup, 'teams'), 'team')
    const mine = teams.find((team) => field(team, 'team_key') === teamKey)
    if (mine === undefined) continue

    const opponent = teams.find((team) => {
      const key = text(field(team, 'team_key'))
      return key !== undefined && key !== teamKey
    })
    card.week = week(field(matchup, 'week')) ?? card.week
    card.team = teamScore(mine)
    if (opponent !== undefined) {
      card.opponent = teamScore(opponent)
    } else {
      card.message = 'No opponent this week (bye).'
    }
    return card
  }

  card.message = 'No matchup scheduled.\nCheck your team key on phone.'
  return card
}

/**
 * Read-only scaffold. Yahoo requires OAuth 2.0 in addition to the client ID.
 * The key is deliberately never used as a bearer token or sent in a URL.
 * Future sign-in/token refresh belongs behind this adapter.
 * Docs: https://sports.yahoo.com/developer/docs/
 * Auth: https://developer.yahoo.com/oauth2/guide/apirequests/
 */
export async function fetchYahooScore(settings: YahooSettings): Promise<ScoreCard> {
  if (!settings.apiKey.trim()) return message('Add your Yahoo API key\nin the phone menu.')
  if (!settings.accessToken.trim()) return message('API key saved.\nYahoo OAuth setup needed.')
  if (!settings.teamKey.trim()) return message('Add your Yahoo team key\nin the phone menu.')

  const teamKey = settings.teamKey.trim()
  const leagueKey = TEAM_KEY_PATTERN.exec(teamKey)?.[1]
  if (!leagueKey) return message('Invalid Yahoo team key.\nUse game.l.league.t.team.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${YAHOO_API}/league/${leagueKey}/scoreboard?format=json`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${settings.accessToken.trim()}`,
      },
      signal: controller.signal,
    })
    if (response.status === 401) return message('Yahoo token expired/invalid.\nUpdate it on your phone.')
    if (response.status === 403) return message('Yahoo access denied.\nCheck account permissions.')
    if (response.status === 404) return message('Yahoo league not found.\nCheck your team key.')
    if (response.status === 429) return message('Yahoo request limit reached.\nTry again later.')
    if (!response.ok) return message('Yahoo score unavailable.\nTry refreshing.')
    return parseYahooScoreboard(await response.json(), teamKey)
  } catch {
    // Do not surface/log response bodies or exceptions that could contain tokens.
    return controller.signal.aborted
      ? message('Yahoo request timed out.\nTry refreshing.')
      : message('Yahoo connection failed.\nTry refreshing.')
  } finally {
    clearTimeout(timeout)
  }
}
