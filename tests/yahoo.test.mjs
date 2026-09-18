import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPTY_YAHOO_SETTINGS, fetchYahooScore, parseYahooScoreboard } from '../src/yahoo.ts'

const TEAM_KEY = '461.l.1000.t.1'
const SETTINGS = { apiKey: 'test-client-id', accessToken: 'test-access-token', teamKey: TEAM_KEY }

// Representative Yahoo JSON: resources are fragmented arrays; collections use
// numeric object keys plus a count. Values are synthetic, with no real account data.
function team(key, name, total, projected) {
  return [
    [{ team_key: key }, { team_id: key.split('.').at(-1) }, { name }, { managers: [{ manager: { name: 'Manager name is not team name' } }] }],
    {
      team_points: { coverage_type: 'week', week: '2', total },
      ...(projected === undefined ? {} : { team_projected_points: { total: projected } }),
    },
  ]
}

function fixture(selectedTeams) {
  return {
    fantasy_content: {
      league: [
        { league_key: '461.l.1000', name: 'Thursday League', current_week: '2' },
        { scoreboard: {
          week: '2',
          matchups: {
            0: { matchup: { week: '2', teams: {
              0: { team: team('461.l.1000.t.3', 'Other matchup', '90', '100') },
              1: { team: team('461.l.1000.t.4', 'Another team', '95', '101') },
              count: 2,
            } } },
            1: { matchup: { week: '2', teams: selectedTeams } },
            count: 2,
          },
        } },
      ],
    },
  }
}

function normalFixture() {
  return fixture({
    0: { team: team('461.l.1000.t.2', 'The opponent', '48.75', '110.24') },
    1: { team: team(TEAM_KEY, 'My team', '0.00', '102.6') },
    count: 2,
  })
}

test('selects the configured team across matchups and preserves an actual zero', () => {
  assert.deepEqual(parseYahooScoreboard(normalFixture(), TEAM_KEY), {
    provider: 'yahoo',
    leagueName: 'Thursday League',
    week: 2,
    team: { name: 'My team', points: 0, projected: 102.6 },
    opponent: { name: 'The opponent', points: 48.75, projected: 110.24 },
  })
})

test('accepts numeric resource wrappers and array collections without confusing metadata', () => {
  const wrappedTeam = {
    0: { 0: { team_key: TEAM_KEY }, 1: { name: 'Wrapped team' } },
    1: { team_points: [{ total: '12.34' }], team_projected_points: { 0: { total: '0' } } },
  }
  const payload = fixture([
    { team: wrappedTeam },
    { team: team('461.l.1000.t.2', 'Opponent', 4) },
  ])
  assert.deepEqual(parseYahooScoreboard(payload, TEAM_KEY).team, {
    name: 'Wrapped team', points: 12.34, projected: 0,
  })
})

test('missing, blank, and invalid totals stay unknown; optional projections stay absent', () => {
  for (const value of [undefined, null, '', ' ', 'not available', 'NaN', Infinity, true]) {
    const payload = fixture({
      0: { team: team(TEAM_KEY, 'My team', value) },
      1: { team: team('461.l.1000.t.2', 'Opponent', '-2.5', value) },
      count: 2,
    })
    const result = parseYahooScoreboard(payload, TEAM_KEY)
    assert.equal(result.team.points, null)
    assert.equal(result.team.projected, null)
    assert.equal(result.opponent.points, -2.5)
    assert.equal(result.opponent.projected, null)
  }
})

test('a single-team matchup keeps its score and reports a bye', () => {
  const result = parseYahooScoreboard(fixture({ 0: { team: team(TEAM_KEY, 'My team', '14') }, count: 1 }), TEAM_KEY)
  assert.equal(result.team.points, 14)
  assert.equal(result.opponent, undefined)
  assert.match(result.message, /bye/)
})

test('empty scoreboard and a team not scheduled in any matchup do not borrow another matchup', () => {
  const empty = { fantasy_content: { league: [{ name: 'Offseason' }, { scoreboard: { matchups: { count: 0 } } }] } }
  for (const result of [parseYahooScoreboard(empty, TEAM_KEY), parseYahooScoreboard(normalFixture(), '461.l.1000.t.8')]) {
    assert.equal(result.team, undefined)
    assert.equal(result.opponent, undefined)
    assert.match(result.message, /No matchup scheduled/)
  }
})

test('malformed/error responses fail safely', () => {
  for (const payload of [null, [], {}, { error: { description: 'untrusted response detail' } }, { fantasy_content: { league: [] } }]) {
    const result = parseYahooScoreboard(payload, TEAM_KEY)
    assert.equal(result.team, undefined)
    assert.match(result.message, /unavailable/)
    assert.doesNotMatch(result.message, /untrusted/)
  }
})

test('missing setup and invalid team keys never issue requests', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request') })
  const cases = [
    [EMPTY_YAHOO_SETTINGS, /API key/],
    [{ ...SETTINGS, apiKey: ' ' }, /API key/],
    [{ ...SETTINGS, accessToken: ' ' }, /OAuth setup needed/],
    [{ ...SETTINGS, teamKey: ' ' }, /team key/],
    [{ ...SETTINGS, teamKey: '461.l.1000.t.1?redirect=elsewhere' }, /Invalid/],
    [{ ...SETTINGS, teamKey: 'https://example.test' }, /Invalid/],
  ]
  for (const [settings, expected] of cases) assert.match((await fetchYahooScore(settings)).message, expected)
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('fetch uses the derived league URL and only the access token as bearer', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => normalFixture() }))
  const result = await fetchYahooScore({ ...SETTINGS, teamKey: ` ${TEAM_KEY} `, accessToken: ' test-access-token ' })
  const [url, options] = fetchMock.mock.calls[0].arguments
  assert.equal(url, 'https://fantasysports.yahooapis.com/fantasy/v2/league/461.l.1000/scoreboard?format=json')
  assert.equal(options.method, 'GET')
  assert.equal(options.headers.Authorization, 'Bearer test-access-token')
  assert.ok(options.signal instanceof AbortSignal)
  assert.ok(!JSON.stringify([url, options]).includes(SETTINGS.apiKey))
  assert.equal(result.team.points, 0)
})

test('HTTP errors produce useful messages without exposing server bodies', async (t) => {
  for (const [status, expected] of [[401, /token expired\/invalid/], [403, /access denied/], [404, /league not found/], [429, /limit reached/], [500, /unavailable/]]) {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
      ok: false, status,
      json: async () => { throw new Error('Response body must not be exposed') },
    }))
    assert.match((await fetchYahooScore(SETTINGS)).message, expected)
    fetchMock.mock.restore()
  }
})

test('network and invalid JSON failures produce safe errors', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error(`secret ${SETTINGS.accessToken}`) })
  const failed = await fetchYahooScore(SETTINGS)
  assert.match(failed.message, /connection failed/)
  assert.ok(!failed.message.includes(SETTINGS.accessToken))
  fetchMock.mock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Invalid JSON') } }))
  assert.match((await fetchYahooScore(SETTINGS)).message, /connection failed/)
})

test('slow requests abort after ten seconds and yield a timeout message', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  const pending = fetchYahooScore(SETTINGS)
  t.mock.timers.tick(10_000)
  assert.match((await pending).message, /timed out/)
})
