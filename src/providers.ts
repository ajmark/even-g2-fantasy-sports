import { fetchSleeperScore } from './sleeper.ts'
import { fetchYahooScore, type YahooSettings } from './yahoo.ts'
import type { ScoreCard } from './scores.ts'

// Each provider handles its own setup and failure state, so either can run alone.
export async function loadScores(sleeperUserId: string | null, yahoo: YahooSettings): Promise<ScoreCard[]> {
  return Promise.all([
    sleeperUserId
      ? fetchSleeperScore(sleeperUserId).catch((): ScoreCard => ({
        provider: 'sleeper', message: 'Could not load Sleeper scores. Tap to retry.',
      }))
      : Promise.resolve<ScoreCard>({ provider: 'sleeper', message: 'Connect Sleeper in the phone menu.' }),
    fetchYahooScore(yahoo).catch((): ScoreCard => ({
      provider: 'yahoo', message: 'Could not load Yahoo scores. Tap to retry.',
    })),
  ])
}
