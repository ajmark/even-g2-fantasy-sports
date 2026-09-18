import { getTextWidth, pxTruncate } from '@evenrealities/pretext'

export type ProviderId = 'sleeper' | 'yahoo'

export interface TeamScore {
  name: string
  points: number | null
  projected: number | null
}

export interface ScoreCard {
  provider: ProviderId
  leagueName?: string
  week?: number | string
  team?: TeamScore
  opponent?: TeamScore
  message?: string
}

// 10 lines at the G2's 27px line height fit inside 288px with 4px padding.
export const GLASSES_TEXT_WIDTH = 568
const PROVIDER_NAMES: Record<ProviderId, string> = { sleeper: 'Sleeper', yahoo: 'Yahoo' }

function singleLine(value: string): string {
  return value.replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

function numberText(value: number | null, decimals: number): string {
  return value !== null && Number.isFinite(value) ? value.toFixed(decimals) : '--'
}

function teamLine(team: TeamScore): string {
  const projection = team.projected !== null && Number.isFinite(team.projected)
    ? ` (proj ${numberText(team.projected, 1)})` : ''
  const suffix = `: ${numberText(team.points, 2)}${projection}`
  const name = pxTruncate(singleLine(team.name), Math.max(0, GLASSES_TEXT_WIDTH - getTextWidth(suffix)))
  return pxTruncate(`${name}${suffix}`, GLASSES_TEXT_WIDTH)
}

function messageLines(message: string): string[] {
  const words = singleLine(message).split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && getTextWidth(next) > GLASSES_TEXT_WIDTH) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 3).map((text, index) => pxTruncate(
    index === 2 && lines.length > 3 ? `${text}...` : text, GLASSES_TEXT_WIDTH,
  ))
}

export function formatScoreCard(card: ScoreCard): string[] {
  const header = pxTruncate(
    `${PROVIDER_NAMES[card.provider]}${card.leagueName ? ` | ${singleLine(card.leagueName)}` : ''}`,
    GLASSES_TEXT_WIDTH,
  )
  if (!card.team) {
    const lines = [header, ...messageLines(card.message || 'No scores available.')]
    while (lines.length < 4) lines.push('')
    return lines
  }
  let status = ''
  const mine = card.team.points
  const theirs = card.opponent?.points
  if (mine !== null && Number.isFinite(mine) && theirs != null && Number.isFinite(theirs)) {
    status = mine > theirs ? 'WINNING' : mine < theirs ? 'LOSING' : 'TIED'
  }
  const detail = [card.week !== undefined ? `Week ${singleLine(String(card.week))}` : '', status]
    .filter(Boolean).join(' - ')
  return [
    header,
    pxTruncate(detail || card.message || 'Matchup', GLASSES_TEXT_WIDTH),
    teamLine(card.team),
    card.opponent ? teamLine(card.opponent) : pxTruncate(singleLine(card.message || 'No opponent scheduled.'), GLASSES_TEXT_WIDTH),
  ]
}

export function formatScoreboard(scores: ScoreCard[], checkedAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${pad(checkedAt.getMonth() + 1)}/${pad(checkedAt.getDate())}/${pad(checkedAt.getFullYear() % 100)}`
  const time = `${pad(checkedAt.getHours())}:${pad(checkedAt.getMinutes())}:${pad(checkedAt.getSeconds())}`
  const cards = (['sleeper', 'yahoo'] as const).map((provider) => scores.find((card) => card.provider === provider)
    ?? { provider, message: 'Set up on your phone.' })
  return [
    ...formatScoreCard(cards[0]),
    '',
    ...formatScoreCard(cards[1]),
    pxTruncate(`${date} ${time} | Tap to refresh`, GLASSES_TEXT_WIDTH),
  ].join('\n')
}
