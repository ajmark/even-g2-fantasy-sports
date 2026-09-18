import type { ScoreCard } from './scores'
import type { YahooSettings } from './yahoo'

export interface PhoneState {
  sleeperUserId: string | null
  sleeperDisplayName: string
  yahoo: YahooSettings
  scores: ScoreCard[]
  refreshing: boolean
}

export interface PhoneActions {
  connectSleeper: (username: string) => Promise<void>
  disconnectSleeper: () => Promise<void>
  saveYahoo: (settings: YahooSettings) => Promise<void>
  clearYahoo: () => Promise<void>
  refresh: () => Promise<void>
}

export function injectPhoneStyles(): void {
  if (document.getElementById('fantasy-phone-styles')) return
  const style = document.createElement('style')
  style.id = 'fantasy-phone-styles'
  style.textContent = `
    :root {
      color-scheme: light dark;
      --color-text: #232323;
      --color-text-dim: #666666;
      --color-bg: #FFFFFF;
      --color-surface: #F0F0F0;
      --color-input-bg: rgba(35,35,35,0.08);
      --color-accent: #FEF991;
      --color-error: #A72B2B;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --color-text: #FFFFFF;
        --color-text-dim: #ADADAD;
        --color-bg: #111111;
        --color-surface: #1A1A1A;
        --color-input-bg: rgba(255,255,255,0.09);
        --color-error: #FF9A9A;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--color-bg);
      color: var(--color-text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      letter-spacing: -0.01em;
    }
    .phone-menu { width: min(100%, 580px); margin: 0 auto; padding: 28px 18px 40px; }
    .phone-header { margin-bottom: 24px; }
    .eh-label {
      font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--color-text-dim); margin: 0 0 8px;
    }
    .eh-title { font-size: 28px; font-weight: 600; letter-spacing: -0.025em; margin: 0 0 8px; }
    .eh-body { font-size: 15px; line-height: 1.5; margin: 0 0 16px; }
    .eh-dim { color: var(--color-text-dim); }
    .phone-card { background: var(--color-surface); border-radius: 16px; padding: 20px; margin: 14px 0; }
    .phone-card h2 { font-size: 20px; margin: 0 0 8px; font-weight: 600; }
    .phone-section-title { font-size: 18px; margin: 28px 0 12px; font-weight: 600; }
    .phone-section-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .phone-section-head .phone-section-title { margin: 0; }
    .eh-input-label { display: block; font-size: 14px; font-weight: 500; margin: 16px 0 8px; }
    .eh-input {
      width: 100%; min-width: 0; padding: 13px 14px; border-radius: 10px;
      border: 1px solid transparent; background: var(--color-input-bg);
      color: var(--color-text); font: inherit; font-size: 16px;
    }
    .eh-input::placeholder { color: var(--color-text-dim); opacity: 1; }
    .eh-input:focus-visible, .eh-button:focus-visible, summary:focus-visible { outline: 2px solid var(--color-text); outline-offset: 3px; }
    .eh-button {
      min-height: 44px; width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid transparent;
      background: var(--color-accent); color: #232323; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
    }
    .eh-button:disabled, .eh-input:disabled { opacity: 0.55; cursor: default; }
    .eh-button.secondary { background: transparent; color: var(--color-text); border-color: var(--color-text-dim); }
    .eh-button.compact { width: auto; padding: 10px 16px; }
    .eh-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .eh-actions .eh-button { flex: 1 1 140px; }
    .eh-caption { font-size: 13px; line-height: 1.5; margin: 10px 0 0; }
    .eh-error { color: var(--color-error); }
    .account-status { overflow-wrap: anywhere; }
    .phone-card details { margin-top: 16px; }
    .phone-card summary { cursor: pointer; font-size: 14px; font-weight: 500; padding: 12px 0; min-height: 44px; }
    .phone-card summary + .eh-caption { margin-top: 0; }
    .score-provider { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
    .score-league { font-size: 14px; line-height: 1.4; margin: 0 0 14px; overflow-wrap: anywhere; }
    .score-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-top: 12px; }
    .score-name { font-size: 15px; overflow-wrap: anywhere; min-width: 0; }
    .score-numbers { text-align: right; flex-shrink: 0; }
    .score-points { display: block; font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .score-projection { display: block; color: var(--color-text-dim); font-size: 12px; margin-top: 3px; }
    .score-message { white-space: pre-line; overflow-wrap: anywhere; }
    [hidden] { display: none !important; }
  `
  document.head.appendChild(style)
}

function setStatus(element: HTMLElement, message: string, error = false): void {
  element.textContent = message
  element.classList.toggle('eh-error', error)
  element.hidden = !message
}

function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  form.setAttribute('aria-busy', String(busy))
  form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')
    .forEach((control) => { control.disabled = busy })
}

function scoreTeamRow(team: NonNullable<ScoreCard['team']>): HTMLElement {
  const row = document.createElement('div')
  row.className = 'score-row'
  const name = document.createElement('span')
  name.className = 'score-name'
  name.textContent = team.name
  const numbers = document.createElement('span')
  numbers.className = 'score-numbers'
  const points = document.createElement('span')
  points.className = 'score-points'
  points.textContent = typeof team.points === 'number' && Number.isFinite(team.points)
    ? team.points.toFixed(2) : '—'
  numbers.append(points)
  if (typeof team.projected === 'number' && Number.isFinite(team.projected)) {
    const projected = document.createElement('span')
    projected.className = 'score-projection'
    projected.textContent = `Projected ${team.projected.toFixed(1)}`
    numbers.append(projected)
  }
  row.append(name, numbers)
  return row
}

// Only replace the score area: an in-flight refresh must not erase form edits.
export function updatePhoneScores(appEl: HTMLElement, scores: ScoreCard[], refreshing: boolean): void {
  const scoreArea = appEl.querySelector<HTMLElement>('[data-phone-scores]')
  if (!scoreArea) return
  const cards = document.createDocumentFragment()
  for (const provider of ['sleeper', 'yahoo'] as const) {
    const providerScores = scores.filter((score) => score.provider === provider)
    if (providerScores.length === 0) {
      providerScores.push({ provider, message: refreshing ? 'Loading scores…' : 'Set up this account below to see scores.' })
    }
    for (const score of providerScores) {
      const card = document.createElement('article')
      card.className = 'phone-card'
      const heading = document.createElement('h3')
      heading.className = 'score-provider'
      heading.textContent = provider === 'sleeper' ? 'Sleeper' : 'Yahoo Fantasy'
      card.append(heading)
      const leagueParts = [score.leagueName, score.week !== undefined ? `Week ${score.week}` : ''].filter(Boolean)
      if (leagueParts.length) {
        const league = document.createElement('p')
        league.className = 'score-league eh-dim'
        league.textContent = leagueParts.join(' · ')
        card.append(league)
      }
      if (score.team) card.append(scoreTeamRow(score.team))
      if (score.opponent) card.append(scoreTeamRow(score.opponent))
      if (score.message) {
        const message = document.createElement('p')
        message.className = 'eh-caption eh-dim score-message'
        message.textContent = score.message
        card.append(message)
      }
      cards.append(card)
    }
  }
  scoreArea.replaceChildren(cards)
  scoreArea.setAttribute('aria-busy', String(refreshing))
  const refreshButton = appEl.querySelector<HTMLButtonElement>('[data-refresh]')
  if (refreshButton) {
    refreshButton.disabled = refreshing
    refreshButton.textContent = refreshing ? 'Refreshing…' : 'Refresh'
  }
  const status = appEl.querySelector<HTMLElement>('[data-score-status]')
  if (status) status.textContent = refreshing ? 'Refreshing scores…' : ''
}

export function renderPhoneMenu(appEl: HTMLElement, state: PhoneState, actions: PhoneActions): void {
  // This template is static. All account data, API values, and API responses are
  // assigned through DOM properties, never interpolated into HTML.
  appEl.innerHTML = `
    <main class="phone-menu">
      <header class="phone-header">
        <p class="eh-label">Even G2 · Fantasy football</p>
        <h1 class="eh-title">Your fantasy scores</h1>
        <p class="eh-body eh-dim">Sleeper and Yahoo in one place. Tap your glasses to refresh scores.</p>
      </header>
      <section aria-labelledby="scores-title">
        <div class="phone-section-head">
          <h2 class="phone-section-title" id="scores-title">Scores</h2>
          <button class="eh-button secondary compact" data-refresh type="button">Refresh</button>
        </div>
        <p class="eh-caption eh-dim" data-score-status role="status" aria-live="polite"></p>
        <p class="eh-caption eh-error" data-refresh-error role="status" aria-live="polite" hidden></p>
        <div data-phone-scores></div>
      </section>
      <section aria-labelledby="accounts-title">
        <h2 class="phone-section-title" id="accounts-title">Accounts & settings</h2>
        <article class="phone-card">
          <h2>Sleeper</h2>
          <p class="eh-body eh-dim account-status" data-sleeper-status></p>
          <details data-sleeper-details>
            <summary data-sleeper-summary>Connect Sleeper</summary>
            <form data-sleeper-form>
              <label class="eh-input-label" for="sleeper-username">Username or user ID</label>
              <input class="eh-input" id="sleeper-username" name="sleeper-username" type="text" placeholder="Sleeper username or ID" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" required />
              <div class="eh-actions">
                <button class="eh-button" data-connect-sleeper type="submit">Connect Sleeper</button>
                <button class="eh-button secondary" data-disconnect-sleeper type="button">Disconnect</button>
              </div>
              <p class="eh-caption" data-sleeper-feedback role="status" aria-live="polite" hidden></p>
            </form>
          </details>
        </article>
        <article class="phone-card">
          <h2>Yahoo Fantasy</h2>
          <p class="eh-body eh-dim account-status" data-yahoo-status></p>
          <p class="eh-caption eh-dim" id="yahoo-help">Enter your Yahoo API key (Client ID) when it arrives. Yahoo also requires account authorization. Automatic Yahoo sign-in is not connected in this scaffold yet.</p>
          <form data-yahoo-form>
            <label class="eh-input-label" for="yahoo-api-key">API key / Client ID</label>
            <input class="eh-input" id="yahoo-api-key" name="yahoo-api-key" type="password" placeholder="Enter your Yahoo API key" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" aria-describedby="yahoo-help" required />
            <p class="eh-caption eh-dim">Settings are saved on this phone through Even Hub.</p>
            <details>
              <summary>Advanced developer setup</summary>
              <p class="eh-caption eh-dim">For testing with an existing Yahoo OAuth access token and team key. Tokens expire; automatic renewal is not connected yet.</p>
              <label class="eh-input-label" for="yahoo-access-token">OAuth access token</label>
              <input class="eh-input" id="yahoo-access-token" name="yahoo-access-token" type="password" placeholder="Optional for testing" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" aria-describedby="yahoo-token-help" />
              <p class="eh-caption eh-dim" id="yahoo-token-help"></p>
              <label class="eh-input-label" for="yahoo-team-key">Team key</label>
              <input class="eh-input" id="yahoo-team-key" name="yahoo-team-key" type="text" placeholder="e.g. game.l.league.t.team" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" />
            </details>
            <div class="eh-actions">
              <button class="eh-button" data-save-yahoo type="submit">Save Yahoo settings</button>
              <button class="eh-button secondary" data-clear-yahoo type="button">Clear Yahoo settings</button>
            </div>
            <p class="eh-caption" data-yahoo-feedback role="status" aria-live="polite" hidden></p>
          </form>
        </article>
      </section>
    </main>
  `

  const sleeperStatus = appEl.querySelector<HTMLElement>('[data-sleeper-status]')!
  sleeperStatus.textContent = state.sleeperUserId
    ? `Connected as ${state.sleeperDisplayName || state.sleeperUserId}`
    : 'No account connected. Connect with your username; no API key is needed.'
  const sleeperDetails = appEl.querySelector<HTMLDetailsElement>('[data-sleeper-details]')!
  sleeperDetails.open = !state.sleeperUserId
  appEl.querySelector<HTMLElement>('[data-sleeper-summary]')!.textContent = state.sleeperUserId ? 'Change account' : 'Connect Sleeper'
  const sleeperForm = appEl.querySelector<HTMLFormElement>('[data-sleeper-form]')!
  const sleeperInput = appEl.querySelector<HTMLInputElement>('#sleeper-username')!
  const connectButton = appEl.querySelector<HTMLButtonElement>('[data-connect-sleeper]')!
  const disconnectButton = appEl.querySelector<HTMLButtonElement>('[data-disconnect-sleeper]')!
  disconnectButton.hidden = !state.sleeperUserId
  const sleeperFeedback = appEl.querySelector<HTMLElement>('[data-sleeper-feedback]')!
  let sleeperBusy = false
  sleeperForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (sleeperBusy) return
    const username = sleeperInput.value.trim()
    if (!username) {
      setStatus(sleeperFeedback, 'Enter a Sleeper username or user ID.', true)
      return
    }
    sleeperBusy = true
    setFormBusy(sleeperForm, true)
    connectButton.textContent = 'Connecting…'
    setStatus(sleeperFeedback, '')
    try {
      await actions.connectSleeper(username)
      setStatus(sleeperFeedback, 'Sleeper account connected.')
    } catch {
      setStatus(sleeperFeedback, 'Could not connect Sleeper. Check your username and connection, then try again.', true)
    } finally {
      sleeperBusy = false
      setFormBusy(sleeperForm, false)
      connectButton.textContent = 'Connect Sleeper'
    }
  })
  disconnectButton.addEventListener('click', async () => {
    if (sleeperBusy) return
    sleeperBusy = true
    setFormBusy(sleeperForm, true)
    setStatus(sleeperFeedback, '')
    try {
      await actions.disconnectSleeper()
      setStatus(sleeperFeedback, 'Sleeper account disconnected.')
    } catch {
      setStatus(sleeperFeedback, 'Could not disconnect Sleeper. Please try again.', true)
    } finally {
      sleeperBusy = false
      setFormBusy(sleeperForm, false)
    }
  })

  const yahooStatus = appEl.querySelector<HTMLElement>('[data-yahoo-status]')!
  yahooStatus.textContent = !state.yahoo.apiKey ? 'Waiting for your API key.'
    : !state.yahoo.accessToken ? 'API key saved · Yahoo authorization pending.'
    : !state.yahoo.teamKey ? 'API key and access token saved · Team key needed.'
    : 'Developer settings saved · Ready to request scores.'
  const yahooForm = appEl.querySelector<HTMLFormElement>('[data-yahoo-form]')!
  const apiKeyInput = appEl.querySelector<HTMLInputElement>('#yahoo-api-key')!
  const tokenInput = appEl.querySelector<HTMLInputElement>('#yahoo-access-token')!
  const teamInput = appEl.querySelector<HTMLInputElement>('#yahoo-team-key')!
  apiKeyInput.value = state.yahoo.apiKey
  teamInput.value = state.yahoo.teamKey
  appEl.querySelector<HTMLElement>('#yahoo-token-help')!.textContent = state.yahoo.accessToken
    ? 'An access token is saved. Leave this blank to keep it, or enter a replacement.'
    : 'Leave blank to save your API key now and authorize later.'
  const yahooFeedback = appEl.querySelector<HTMLElement>('[data-yahoo-feedback]')!
  const saveButton = appEl.querySelector<HTMLButtonElement>('[data-save-yahoo]')!
  const clearButton = appEl.querySelector<HTMLButtonElement>('[data-clear-yahoo]')!
  clearButton.hidden = !state.yahoo.apiKey && !state.yahoo.accessToken && !state.yahoo.teamKey
  let yahooBusy = false
  yahooForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (yahooBusy) return
    const apiKey = apiKeyInput.value.trim()
    if (!apiKey) {
      setStatus(yahooFeedback, 'Enter your Yahoo API key, or use Clear Yahoo settings to remove saved settings.', true)
      return
    }
    const settings: YahooSettings = {
      apiKey,
      accessToken: tokenInput.value.trim() || state.yahoo.accessToken,
      teamKey: teamInput.value.trim(),
    }
    if (settings.teamKey && !/^\d+\.l\.\d+\.t\.\d+$/.test(settings.teamKey)) {
      setStatus(yahooFeedback, 'Use a Yahoo team key like 461.l.1000.t.1.', true)
      return
    }
    yahooBusy = true
    setFormBusy(yahooForm, true)
    saveButton.textContent = 'Saving…'
    setStatus(yahooFeedback, '')
    try {
      await actions.saveYahoo(settings)
      tokenInput.value = ''
      setStatus(yahooFeedback, settings.accessToken ? 'Yahoo settings saved.' : 'API key saved. Yahoo authorization is still pending.')
    } catch {
      setStatus(yahooFeedback, 'Could not save Yahoo settings. Please try again.', true)
    } finally {
      yahooBusy = false
      setFormBusy(yahooForm, false)
      saveButton.textContent = 'Save Yahoo settings'
    }
  })
  clearButton.addEventListener('click', async () => {
    if (yahooBusy) return
    yahooBusy = true
    setFormBusy(yahooForm, true)
    setStatus(yahooFeedback, '')
    try {
      await actions.clearYahoo()
      apiKeyInput.value = ''
      tokenInput.value = ''
      teamInput.value = ''
      setStatus(yahooFeedback, 'Yahoo settings cleared.')
    } catch {
      setStatus(yahooFeedback, 'Could not clear Yahoo settings. Please try again.', true)
    } finally {
      yahooBusy = false
      setFormBusy(yahooForm, false)
    }
  })

  const refreshButton = appEl.querySelector<HTMLButtonElement>('[data-refresh]')!
  const refreshError = appEl.querySelector<HTMLElement>('[data-refresh-error]')!
  let refreshBusy = false
  refreshButton.addEventListener('click', async () => {
    if (refreshBusy) return
    refreshBusy = true
    refreshButton.disabled = true
    setStatus(refreshError, '')
    try {
      await actions.refresh()
    } catch {
      setStatus(refreshError, 'Could not refresh scores. Please try again.', true)
    } finally {
      refreshBusy = false
      refreshButton.disabled = false
    }
  })
  updatePhoneScores(appEl, state.scores, state.refreshing)
}
