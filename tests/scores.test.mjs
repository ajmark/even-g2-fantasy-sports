import assert from 'node:assert/strict'
import test from 'node:test'
import { getTextWidth, measureTextWrap } from '@evenrealities/pretext'
import { formatScoreCard, formatScoreboard, GLASSES_TEXT_WIDTH } from '../src/scores.ts'

const CHECKED_AT = new Date(2026, 8, 16, 17, 4, 9)

function matchup(provider, overrides = {}) {
  return {
    provider,
    leagueName: `${provider} league`,
    week: 2,
    team: { name: 'My team', points: 0, projected: 105.34 },
    opponent: { name: 'Opponent', points: 12.5, projected: 100 },
    ...overrides,
  }
}

function assertFits(text, maximumLines) {
  assert.ok(text.split('\n').length <= maximumLines, 'explicit line count exceeds budget')
  for (const line of text.split('\n')) {
    assert.ok(getTextWidth(line) <= GLASSES_TEXT_WIDTH, `line exceeds ${GLASSES_TEXT_WIDTH}px: ${line}`)
  }
  const measured = measureTextWrap(text, GLASSES_TEXT_WIDTH)
  assert.ok(measured.lineCount <= maximumLines, `wrapped layout uses ${measured.lineCount} lines`)
  assert.ok(measured.height <= 280, `wrapped layout uses ${measured.height}px of the 280px inner height`)
  assert.ok(measured.lineWidths.every((width) => width <= GLASSES_TEXT_WIDTH))
}

test('both provider scorecards and their combined scoreboard fit the G2 text area', () => {
  assert.equal(GLASSES_TEXT_WIDTH, 568)
  const cards = [matchup('sleeper'), matchup('yahoo')]
  for (const card of cards) assertFits(formatScoreCard(card).join('\n'), 4)
  const result = formatScoreboard(cards, CHECKED_AT)
  assertFits(result, 10)
  assert.equal(measureTextWrap(result, GLASSES_TEXT_WIDTH).height, 270)
  assert.match(result, /Sleeper \| sleeper league/)
  assert.match(result, /Yahoo \| yahoo league/)
  assert.match(result, /09\/16\/26 17:04:09 \| Tap to refresh/)
})

test('long league and team names truncate while retaining both scores and projections', () => {
  const cards = ['sleeper', 'yahoo'].map((provider) => matchup(provider, {
    leagueName: 'A very long league name '.repeat(20),
    team: { name: 'W'.repeat(200), points: 123.45, projected: 156.7 },
    opponent: { name: 'Championship challengers '.repeat(20), points: 98.76, projected: 129.4 },
  }))
  for (const card of cards) {
    const lines = formatScoreCard(card)
    assertFits(lines.join('\n'), 4)
    assert.match(lines[2], /: 123\.45 \(proj 156\.7\)$/)
    assert.match(lines[3], /: 98\.76 \(proj 129\.4\)$/)
  }
  assertFits(formatScoreboard(cards, CHECKED_AT), 10)
})

test('embedded whitespace and wide Unicode names do not add hidden lines', () => {
  const card = matchup('yahoo', {
    leagueName: 'League\nwith\r\nline\tbreaks ' + '冠軍聯盟'.repeat(30),
    team: { name: 'Team\n\r\tname ' + '冠軍🏈'.repeat(50), points: 12.34, projected: 99.5 },
    opponent: { name: 'Длинное имя '.repeat(30), points: 10, projected: null },
  })
  const formatted = formatScoreCard(card).join('\n')
  assert.equal(formatted.split('\n').length, 4)
  assertFits(formatted, 4)
  assertFits(formatScoreboard([card, matchup('sleeper')], CHECKED_AT), 10)
})

test('unknown scores stay unknown and do not produce a misleading matchup status', () => {
  for (const value of [null, NaN, Infinity]) {
    const card = matchup('sleeper', {
      team: { name: 'My team', points: value, projected: null },
      opponent: { name: 'Opponent', points: 0, projected: null },
    })
    const lines = formatScoreCard(card)
    assert.equal(lines[1], 'Week 2')
    assert.equal(lines[2], 'My team: --')
    assert.equal(lines[3], 'Opponent: 0.00')
    assert.doesNotMatch(lines.join('\n'), /proj|WINNING|LOSING|TIED|NaN|Infinity/)
    assertFits(formatScoreboard([card, matchup('yahoo')], CHECKED_AT), 10)
  }
})

test('known scores distinguish winning, losing, and an actual zero tie', () => {
  for (const [mine, theirs, expected] of [[1, 0, 'WINNING'], [0, 1, 'LOSING'], [0, 0, 'TIED']]) {
    const card = matchup('yahoo', {
      team: { name: 'Mine', points: mine, projected: null },
      opponent: { name: 'Theirs', points: theirs, projected: null },
    })
    assert.equal(formatScoreCard(card)[1], `Week 2 - ${expected}`)
  }
})

test('setup, errors, byes, and long messages stay within the combined line budget', () => {
  const variants = [
    [],
    [{ provider: 'yahoo', message: 'API key saved.\nYahoo OAuth setup needed.' }],
    [{ provider: 'sleeper', message: 'Could not load Sleeper scores. Tap to retry.' }, { provider: 'yahoo', message: 'Yahoo token expired/invalid.\nUpdate it on your phone.' }],
    [{ provider: 'sleeper', message: 'A long setup explanation '.repeat(60) }, { provider: 'yahoo', message: 'W'.repeat(500) }],
    [matchup('sleeper'), matchup('yahoo', { opponent: undefined, message: 'No opponent this week (bye).' })],
    [matchup('sleeper', { opponent: undefined, message: 'Waiting on opponent.' }), { provider: 'yahoo', message: 'No matchup scheduled.\nCheck your team key on phone.' }],
  ]
  for (const cards of variants) {
    for (const card of cards) assertFits(formatScoreCard(card).join('\n'), 4)
    const combined = formatScoreboard(cards, CHECKED_AT)
    assertFits(combined, 10)
    assert.match(combined, /^Sleeper/)
    assert.match(combined, /\nYahoo/)
  }
})

test('provider order is stable even when results arrive in the opposite order', () => {
  const result = formatScoreboard([matchup('yahoo'), matchup('sleeper')], CHECKED_AT)
  assert.ok(result.indexOf('Sleeper') < result.indexOf('Yahoo'))
  assertFits(result, 10)
})
