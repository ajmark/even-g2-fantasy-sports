# Fantasy Sports for Even G2

A small [Even Hub](https://www.evenrealities.com/) app that puts current-week
[Sleeper](https://sleeper.com/) and [Yahoo Fantasy](https://sports.yahoo.com/fantasy/)
football scores on your phone and Even Realities G2 smart glasses.

Sleeper is ready to connect with a username. Yahoo support is scaffolded: you
can save your API key now, and an adapter can request scores with a manually
provided OAuth access token. Automatic Yahoo sign-in is still unfinished.

## What it does

The phone menu shows separate Sleeper and Yahoo score cards, with account
settings always available below. The glasses combine both providers in one
compact scoreboard. For example, when both providers are configured and their
requests succeed, the display has this shape (illustrative scores):

```
Sleeper | Friends League
Week 3 - WINNING
alex: 87.42 (proj 112.6)
rival: 71.10 (proj 104.3)

Yahoo | Work League
Week 3 - LOSING
Alex: 64.50 (proj 108.2)
Rival: 75.20 (proj 110.0)
09/17/26 13:05:22 | Tap to refresh
```

- **Current scores** for you and your opponent, with separate provider labels.
- **Sleeper projections** computed from weekly player projections and your
  league's scoring settings, including PPR, half-PPR, and custom scoring.
- **Yahoo scores and projections** parsed from Yahoo's league scoreboard when
  authorization is configured and those values are available.
- **WINNING / LOSING / TIED** status at a glance.
- **Tap the glasses touchpad** or **Refresh** on the phone to update scores.
- Handles bye weeks and the case where the opponent hasn't been scheduled yet.
- A missing key, disconnected account, or failed request appears in that
  provider's section; the other provider can still show scores.

Sleeper and Yahoo are optional and independent. You can keep using Sleeper
while waiting for your Yahoo key, or configure Yahoo without connecting Sleeper.
With only a Yahoo key saved, its score section reports that OAuth setup is needed.

Sleeper requests use `https://api.sleeper.app` and require no Sleeper password.
The Yahoo adapter makes read-only requests to
`https://fantasysports.yahooapis.com` using an OAuth bearer token. The saved API
key is a Client ID for future authorization; it is never used as a bearer token.

## Requirements

- Even Realities **G2** glasses paired to your phone.
- The **Even Realities app** (version 2.2.5 or newer) on your phone.
- For Sleeper scores: an account in at least one NFL league for the current season.
- For Yahoo adapter testing: a Yahoo API key / Client ID, an authorized OAuth
  access token, and a team key for your league.

For building from source you'll also need npm and **Node.js 20.19+ or 22.12+**
(or a newer supported major). Use **Node.js 24+** to run the tests, which load
TypeScript directly; local validation uses Node.js 24.19.

## Install on your G2 glasses

There are two ways to get the app onto the glasses: load it straight from your
computer during development, or package it as an `.ehpk` and install it through
Even Hub.

### Option A: Run from your computer (developer mode, hot reload)

This is the fastest way to try it out. Your phone and computer must be on the
same Wi-Fi network.

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/ajmark/even-g2-fantasy-sports.git
   cd even-g2-fantasy-sports
   npm install
   ```

2. Start the dev server, listening on your LAN address so the phone can reach it:

   ```bash
   npx vite --host
   ```

   Note the `Network:` URL Vite prints (for example `http://192.168.1.50:5173`).

3. In a second terminal, generate a QR code for that URL:

   ```bash
   npx evenhub qr --url "http://192.168.1.50:5173"
   ```

   (Running `npx evenhub qr` with no arguments auto-detects your IP and reuses
   the last settings.)

4. Open the **Even Realities app** on your phone, go to **Even Hub**, and use
   the developer **Scan QR** option to scan the code in your terminal. The app
   loads on your glasses and reloads automatically when you edit the source.

5. Complete the setup on your phone (see [First-time setup](#first-time-setup)).

### Option B: Install the packaged app (`.ehpk`)

1. Build and package:

   ```bash
   npm install
   npm run build
   npx evenhub pack app.json dist -o fantasy-sports.ehpk
   ```

   This validates `app.json`, bundles the `dist/` folder, and writes
   `fantasy-sports.ehpk` in the project root.

2. Sign in to the Even Hub developer portal (`npx evenhub login` authenticates
   the CLI with the same account) and upload `fantasy-sports.ehpk`. After it
   is accepted, the app appears in **Even Hub** inside the Even Realities app
   and can be installed to your glasses like any other Even Hub app.

If the pack step fails, the error message names the `app.json` field that needs
fixing. The manifest in this repo is already valid, so this usually only happens
if you edit it (for example, changing `package_id` or `version`).

## First-time setup

1. Launch **Fantasy Sports** from Even Hub on your phone.
2. Under **Accounts & settings → Sleeper**, enter the username shown in your
   Sleeper profile or your numeric user ID and tap **Connect Sleeper**.
3. Under **Yahoo Fantasy**, enter your Yahoo **API key / Client ID** when you
   receive it, then tap **Save Yahoo settings**. The field is masked.
4. Your Sleeper matchup appears after refresh. Yahoo shows **API key saved ·
   Yahoo authorization pending** until authorization is supplied.

You can complete either provider's setup independently. Settings persist on
the phone through the Even Hub bridge's `setLocalStorage` / `getLocalStorage`
API, rather than browser storage. Reopening the app restores saved settings.

### Yahoo authorization scaffold

A Yahoo API key / Client ID alone cannot access your fantasy scores. Yahoo also
requires OAuth account authorization. The automatic sign-in, authorization
callback, token exchange, and token renewal flow are not implemented yet.

For optional adapter testing, expand **Advanced developer setup** on the phone:

1. Enter an existing authorized **OAuth access token**. This input is masked.
2. Enter your numeric **Team key**, using the shape
   `game.l.league.t.team`, for example `461.l.1000.t.1`. Replace the example
   numbers with your actual game, league, and team IDs.
3. Tap **Save Yahoo settings**, then refresh scores.

Leave the token field blank when editing settings to keep the saved token.
Changing the API key requires a token issued for the new client. Expired tokens
must be replaced manually; automatic refresh is not implemented. There is no
client-secret field, and a Yahoo client secret should not be placed in this
WebView or bundled app.

**Clear Yahoo settings** removes the saved API key, access token, and team key
without disconnecting Sleeper. Saving or clearing settings is explicit; typing
in a field does not save it, and score refreshes preserve unfinished form edits.

The adapter has fixture-based coverage, but real Yahoo credentials have not yet
been used to verify live scores. Yahoo request behavior, including CORS and
authorization from the Even App WebView, still needs validation on a device.
A backend may be needed for the eventual OAuth flow or API access.

See the official [Yahoo Fantasy Sports API documentation](https://sports.yahoo.com/developer/docs/)
and [Yahoo OAuth authenticated API requests guide](https://developer.yahoo.com/oauth2/guide/apirequests/).

## Using it

- Tap the glasses touchpad or **Refresh** on the phone to refresh both providers.
- Open the phone menu to view both score sections and edit account settings.
- Expand Sleeper's **Change account**, enter another username, and tap
  **Connect Sleeper** to switch accounts. Use **Disconnect** to remove Sleeper.
- Use **Save Yahoo settings** to save changes or **Clear Yahoo settings** to
  remove Yahoo configuration.

Sleeper uses your **first** league for the current season. Yahoo uses the league
and team selected by your team key. Multiple leagues per provider are not
implemented yet. Long names are shortened to fit the glasses display.

## Project layout

```
app.json          Even Hub manifest (package id, version, network permission)
index.html        WebView entry point loaded by the Even Realities app
src/main.ts       Bridge lifecycle, saved settings, refresh coordination
src/phone-ui.ts   Persistent phone menu, account forms, provider score cards
src/providers.ts  Independent score loading for both providers
src/scores.ts     Shared score model and combined glasses formatting
src/sleeper.ts    Sleeper account, matchup, and projection requests
src/yahoo.ts      Yahoo OAuth-token adapter and scoreboard response parser
tests/            Fixture and behavior tests
dist/             Build output (generated by `npm run build`)
```

Built with the [Even Hub SDK](https://www.npmjs.com/package/@evenrealities/even_hub_sdk),
Vite, and TypeScript. The glasses UI is a single full-screen text container on
the G2's 576x288 canvas.

## Testing without glasses

Run the tests and production build:

```bash
npm test
npm run build
```

The tests use fixtures and mocked requests, so a Yahoo key is not required.
Passing these checks does not verify Yahoo authentication or networking on a
physical phone and glasses.

The Even Hub simulator is included as a dev dependency. Start the Vite dev
server, then run the simulator and point it at the dev URL to see the glasses
output and phone UI on your desktop.

## Troubleshooting

- **"Could not connect Sleeper"**: check the spelling of your
  username. It is case-insensitive but must match your Sleeper profile name,
  not your display name in a specific league.
- **"No active Sleeper leagues found"**: your account has no NFL league for the
  current season, or the season hasn't started on Sleeper yet.
- **Sleeper scores unavailable**: the Sleeper API request failed.
  Check the phone's internet connection and tap the glasses to retry.
- **Yahoo authorization pending**: your API key was saved, but OAuth still
  needs to be supplied. Saving the key alone does not sign you in.
- **Yahoo token expired/invalid**: replace the token under **Advanced developer
  setup** and save again.
- **Invalid Yahoo team key**: use numeric IDs in the shape `461.l.1000.t.1`.
- **Yahoo connection failed**: check your connection. Direct Yahoo access from
  the phone WebView has not yet been validated and may require a backend.
- **App doesn't load from the QR code**: make sure the phone and computer are on
  the same network and that Vite was started with `--host`. Firewalls on the
  computer can also block port 5173.
