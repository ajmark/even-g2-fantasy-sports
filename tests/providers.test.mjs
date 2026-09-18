import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScores } from '../src/providers.ts'
import { fetchSleeperScore } from '../src/sleeper.ts'
import { EMPTY_YAHOO_SETTINGS } from '../src/yahoo.ts'

const YAHOO = { apiKey: 'synthetic-client', accessToken: 'synthetic-token', teamKey: '461.l.1000.t.1' }
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value })

function yahooResponse() {
  return response({ fantasy_content: { league: [
    { name: 'Yahoo league' },
    { scoreboard: { week: '2', matchups: {
      0: { matchup: { teams: {
        0: { team: [[{ team_key: YAHOO.teamKey }, { name: 'Yahoo owner' }], { team_points: { total: '24.75' } }] },
        1: { team: [[{ team_key: '461.l.1000.t.2' }, { name: 'Yahoo opponent' }], { team_points: { total: '30.25' } }] },
        count: 2,
      } } }, count: 1,
    } } },
  ] } })
}

function sleeperResponses({ season = '2090', week = 2, profiles = [{ user: 'owner', league: 'league', rec: 0.5 }], projectionFailure = false, bye = false } = {}) {
  const requests = []
  function fetchResponse(rawUrl) {
    const url = new URL(rawUrl)
    requests.push(url)
    if (url.pathname === '/v1/state/nfl') return response({ season, week })
    const owner = profiles.find((profile) => url.pathname === `/v1/user/${profile.user}/leagues/nfl/${season}`)
    if (owner) return response([{ league_id: owner.league, name: `${owner.user} league` }])
    const league = profiles.find((profile) => url.pathname.startsWith(`/v1/league/${profile.league}`))
    if (league) {
      const suffix = url.pathname.slice(`/v1/league/${league.league}`.length)
      if (suffix === '/rosters') return response([{ roster_id: 1, owner_id: league.user }, { roster_id: 2, owner_id: 'opponent' }])
      if (suffix === `/matchups/${week}`) return response([
        { roster_id: 1, matchup_id: bye ? null : 7, points: 0, starters: ['receiver'] },
        { roster_id: 2, matchup_id: 7, points: 16.5, starters: ['quarterback'] },
      ])
      if (suffix === '/users') return response([{ user_id: league.user, display_name: `${league.user} team` }, { user_id: 'opponent', display_name: 'Opposing team' }])
      if (!suffix) return response({ scoring_settings: { rec: league.rec, rec_yd: 0.1, pass_yd: 0.04, pass_td: 4 } })
    }
    if (url.pathname === `/projections/nfl/${season}/${week}`) {
      if (projectionFailure) return response({}, 503)
      return response([
        { player_id: 'receiver', stats: { rec: 4, rec_yd: 50 } },
        { player_id: 'quarterback', stats: { pass_yd: 250, pass_td: 2 } },
      ])
    }
    throw new Error(`Unexpected test request: ${url.pathname}`)
  }
  return { fetchResponse, requests }
}

test('unconfigured providers return setup cards without making network requests', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected fetch') })
  const results = await loadScores(null, EMPTY_YAHOO_SETTINGS)
  assert.deepEqual(results.map(({ provider }) => provider), ['sleeper', 'yahoo'])
  assert.match(results[0].message, /Connect Sleeper/)
  assert.match(results[1].message, /API key/)
  assert.equal(fetchMock.mock.callCount(), 0)

  const keyOnly = await loadScores(null, { ...EMPTY_YAHOO_SETTINGS, apiKey: 'key-awaiting-authorization' })
  assert.match(keyOnly[1].message, /OAuth setup needed/)
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('Sleeper failure does not suppress a successful Yahoo matchup', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (new URL(url).hostname === 'api.sleeper.app') throw new Error('Sleeper offline')
    return yahooResponse()
  })
  const [sleeper, yahoo] = await loadScores('owner', YAHOO)
  assert.match(sleeper.message, /Could not load Sleeper/)
  assert.equal(yahoo.team.name, 'Yahoo owner')
  assert.equal(yahoo.team.points, 24.75)
  assert.equal(yahoo.opponent.points, 30.25)
})

test('Yahoo authorization failure does not suppress Sleeper scores or projections', async (t) => {
  const sleeper = sleeperResponses({ season: '2091' })
  t.mock.method(globalThis, 'fetch', async (url) => new URL(url).hostname === 'api.sleeper.app'
    ? sleeper.fetchResponse(url) : response({}, 401))
  const [card, yahoo] = await loadScores('owner', YAHOO)
  assert.equal(card.team.points, 0)
  assert.equal(card.team.projected, 7)
  assert.equal(card.opponent.points, 16.5)
  assert.equal(card.opponent.projected, 18)
  assert.match(yahoo.message, /token expired\/invalid/)
})

test('Yahoo can run alone without issuing any Sleeper requests', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => yahooResponse())
  const [sleeper, yahoo] = await loadScores(null, YAHOO)
  assert.match(sleeper.message, /Connect Sleeper/)
  assert.equal(yahoo.team.points, 24.75)
  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(new URL(fetchMock.mock.calls[0].arguments[0]).hostname, 'fantasysports.yahooapis.com')
})

test('both provider failures remain separate retry cards', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network unavailable') })
  const results = await loadScores('owner', YAHOO)
  assert.deepEqual(results.map(({ provider }) => provider), ['sleeper', 'yahoo'])
  assert.ok(results.every((card) => card.message && !card.team))
})

test('Sleeper projection failure preserves actual matchup scores', async (t) => {
  const sleeper = sleeperResponses({ season: '2092', projectionFailure: true })
  t.mock.method(globalThis, 'fetch', async (url) => sleeper.fetchResponse(url))
  const [card, yahoo] = await loadScores('owner', EMPTY_YAHOO_SETTINGS)
  assert.equal(card.team.points, 0)
  assert.equal(card.opponent.points, 16.5)
  assert.equal(card.team.projected, null)
  assert.equal(card.opponent.projected, null)
  assert.match(yahoo.message, /API key/)
})

test('switching Sleeper accounts in the same week uses each league scoring rules', async (t) => {
  const sleeper = sleeperResponses({ season: '2093', profiles: [
    { user: 'half-ppr', league: 'half-league', rec: 0.5 },
    { user: 'full-ppr', league: 'full-league', rec: 1 },
  ] })
  t.mock.method(globalThis, 'fetch', async (url) => sleeper.fetchResponse(url))
  const first = await fetchSleeperScore('half-ppr')
  const second = await fetchSleeperScore('full-ppr')
  const repeated = await fetchSleeperScore('full-ppr')
  assert.equal(first.team.name, 'half-ppr team')
  assert.equal(first.team.projected, 7)
  assert.equal(second.team.name, 'full-ppr team')
  assert.equal(second.team.projected, 9)
  assert.equal(repeated.team.projected, 9)
  assert.equal(second.opponent.projected, 18)
  assert.equal(sleeper.requests.filter((url) => url.pathname.startsWith('/projections/')).length, 2)
})

test('a Sleeper bye yields a readable state without requesting projections', async (t) => {
  const sleeper = sleeperResponses({ season: '2094', bye: true })
  t.mock.method(globalThis, 'fetch', async (url) => sleeper.fetchResponse(url))
  const card = await fetchSleeperScore('owner')
  assert.match(card.message, /bye/)
  assert.equal(card.team, undefined)
  assert.equal(sleeper.requests.filter((url) => url.pathname.startsWith('/projections/')).length, 0)
})
