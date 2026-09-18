import {
  waitForEvenAppBridge, TextContainerProperty, CreateStartUpPageContainer,
  TextContainerUpgrade, OsEventTypeList, type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { formatScoreboard, type ScoreCard } from './scores.ts'
import { resolveSleeperUser } from './sleeper.ts'
import { loadScores } from './providers.ts'
import { EMPTY_YAHOO_SETTINGS, type YahooSettings } from './yahoo.ts'
import { injectPhoneStyles, renderPhoneMenu, updatePhoneScores, type PhoneActions } from './phone-ui.ts'

const STORAGE_KEY_USER_ID = 'sleeperUserId'
const STORAGE_KEY_DISPLAY_NAME = 'sleeperDisplayName'
const STORAGE_KEY_YAHOO = 'yahooSettings'
const appEl = document.getElementById('app')!
let sleeperUserId: string | null = null
let sleeperDisplayName = ''
let yahoo: YahooSettings = { ...EMPTY_YAHOO_SETTINGS }
let scores: ScoreCard[] = []
let refreshing = false
let settingsVersion = 0
let refreshAgain = false
let refreshTask: Promise<void> | null = null
let glassesContainerCreated = false

// Storage and display share the bridge. Keep asynchronous bridge calls in order.
let bridgeQueue: Promise<unknown> = Promise.resolve()
function bridgeCall<T>(operation: () => Promise<T>): Promise<T> {
  const result = bridgeQueue.then(operation)
  bridgeQueue = result.catch(() => undefined)
  return result
}

async function saveValue(bridge: EvenAppBridge, key: string, value: string) {
  const saved = await bridgeCall(() => bridge.setLocalStorage(key, value))
  if (!saved) throw new Error('Could not save settings on your phone. Please try again.')
}

function readYahooSettings(value: string): YahooSettings {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_YAHOO_SETTINGS }
    const record = parsed as Record<string, unknown>
    return {
      apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
      accessToken: typeof record.accessToken === 'string' ? record.accessToken : '',
      teamKey: typeof record.teamKey === 'string' ? record.teamKey : '',
    }
  } catch {
    return { ...EMPTY_YAHOO_SETTINGS }
  }
}

async function ensureGlassesContainer(bridge: EvenAppBridge): Promise<boolean> {
  if (glassesContainerCreated) return true
  const result = await bridgeCall(() => bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: 576, height: 288,
      borderWidth: 0, borderColor: 5, paddingLength: 4,
      containerID: 1, containerName: 'main',
      content: 'Loading fantasy football scores...', isEventCapture: 1,
    })],
  })))
  glassesContainerCreated = result === 0
  return glassesContainerCreated
}

function renderMenu(bridge: EvenAppBridge) {
  renderPhoneMenu(appEl, { sleeperUserId, sleeperDisplayName, yahoo, scores, refreshing }, phoneActions(bridge))
}

function settingsChanged(bridge: EvenAppBridge, provider: 'sleeper' | 'yahoo') {
  // Keep the other account's draft and pending form handler intact across saves.
  const otherForm = provider === 'sleeper' ? '[data-yahoo-form]' : '[data-sleeper-form]'
  const otherCard = appEl.querySelector(otherForm)?.closest('article')
  settingsVersion += 1
  scores = []
  renderMenu(bridge)
  if (otherCard) appEl.querySelector(otherForm)?.closest('article')?.replaceWith(otherCard)
}

async function refreshScores(bridge: EvenAppBridge): Promise<void> {
  if (refreshTask) {
    refreshAgain = true
    return refreshTask
  }
  refreshTask = (async () => {
    do {
      refreshAgain = false
      const version = settingsVersion
      refreshing = true
      updatePhoneScores(appEl, scores, true)
      const nextScores = await loadScores(sleeperUserId, { ...yahoo })
      // Ignore responses from accounts/settings that were changed mid-fetch.
      if (version !== settingsVersion) {
        refreshAgain = true
        continue
      }
      scores = nextScores
      updatePhoneScores(appEl, scores, true)
      if (await ensureGlassesContainer(bridge)) {
        await bridgeCall(async () => {
          if (version !== settingsVersion) return
          const updated = await bridge.textContainerUpgrade(new TextContainerUpgrade({
            containerID: 1, containerName: 'main',
            content: formatScoreboard(scores, new Date()), contentOffset: 0, contentLength: 0,
          }))
          if (!updated) throw new Error('Could not update the glasses. Tap refresh to try again.')
        })
        appEl.querySelector('#glasses-error')?.remove()
      } else {
        throw new Error('Could not connect to the glasses. Tap refresh to try again.')
      }
    } while (refreshAgain)
  })()
  try {
    await refreshTask
  } finally {
    refreshTask = null
    refreshing = false
    updatePhoneScores(appEl, scores, false)
  }
}

function phoneActions(bridge: EvenAppBridge): PhoneActions {
  return {
    async connectSleeper(username) {
      const user = await resolveSleeperUser(username)
      if (!user) throw new Error("Couldn't find that Sleeper account. Check the spelling and try again.")
      await saveValue(bridge, STORAGE_KEY_DISPLAY_NAME, user.display_name || user.user_id)
      await saveValue(bridge, STORAGE_KEY_USER_ID, user.user_id)
      sleeperUserId = user.user_id
      sleeperDisplayName = user.display_name || user.user_id
      settingsChanged(bridge, 'sleeper')
      await refreshScores(bridge).catch(showGlassesError)
    },
    async disconnectSleeper() {
      await saveValue(bridge, STORAGE_KEY_USER_ID, '')
      sleeperUserId = null
      sleeperDisplayName = ''
      settingsChanged(bridge, 'sleeper')
      await refreshScores(bridge).catch(showGlassesError)
    },
    async saveYahoo(settings) {
      const next = {
        apiKey: settings.apiKey.trim(), accessToken: settings.accessToken.trim(), teamKey: settings.teamKey.trim(),
      }
      if (!next.apiKey) throw new Error('Enter your Yahoo API key / client ID first.')
      if (next.teamKey && !/^\d+\.l\.\d+\.t\.\d+$/.test(next.teamKey)) {
        throw new Error('Use a Yahoo team key like 461.l.1000.t.1.')
      }
      // Tokens belong to the client that issued them; a changed key needs a new token.
      if (next.apiKey !== yahoo.apiKey && next.accessToken === yahoo.accessToken) next.accessToken = ''
      await saveValue(bridge, STORAGE_KEY_YAHOO, JSON.stringify(next))
      yahoo = next
      settingsChanged(bridge, 'yahoo')
      await refreshScores(bridge).catch(showGlassesError)
    },
    async clearYahoo() {
      await saveValue(bridge, STORAGE_KEY_YAHOO, '')
      yahoo = { ...EMPTY_YAHOO_SETTINGS }
      settingsChanged(bridge, 'yahoo')
      await refreshScores(bridge).catch(showGlassesError)
    },
    refresh: () => refreshScores(bridge),
  }
}

function showGlassesError() {
  let message = appEl.querySelector<HTMLParagraphElement>('#glasses-error')
  if (!message) {
    message = document.createElement('p')
    message.id = 'glasses-error'
    message.className = 'eh-caption eh-error'
    message.setAttribute('role', 'status')
    appEl.appendChild(message)
  }
  message.textContent = 'Could not update the glasses. Check the connection and tap Refresh scores.'
}

async function init() {
  injectPhoneStyles()
  appEl.textContent = 'Connecting to Even Hub...'
  const bridge = await waitForEvenAppBridge()
  sleeperUserId = await bridgeCall(() => bridge.getLocalStorage(STORAGE_KEY_USER_ID)) || null
  sleeperDisplayName = await bridgeCall(() => bridge.getLocalStorage(STORAGE_KEY_DISPLAY_NAME))
  yahoo = readYahooSettings(await bridgeCall(() => bridge.getLocalStorage(STORAGE_KEY_YAHOO)))
  renderMenu(bridge)
  bridge.onEvenHubEvent((event) => {
    const sys = event.sysEvent
    // G2 taps may omit CLICK_EVENT (zero). Ignore scroll/IMU/lifecycle events.
    if (!sys || (sys.eventType !== undefined && sys.eventType !== OsEventTypeList.CLICK_EVENT)) return
    void refreshScores(bridge).catch(showGlassesError)
  })
  await refreshScores(bridge).catch(showGlassesError)
}

void init().catch(() => {
  appEl.textContent = 'Could not load phone settings. Please reopen Fantasy Football in Even Hub.'
})
