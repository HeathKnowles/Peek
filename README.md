<p align="center">
  <img src="logo.png" alt="Peek Logo" width="180" />
</p>

# Peek Selection Popup

Peek at anything

This is a lightweight extension that shows a small smart popup when you select anything...From Images to Text to Google Forms..anything


Currently supported:
Text
Images
Google Forms

It combines multiple quick-reference sources in one place, with source links and quick copy:

- Wikipedia (summary)
- Wiktionary (definitions)
- DuckDuckGo Instant Answers
- Stack Overflow (for technical terms)

Connector modules live in `content/connectors/`:
- `google-forms.js`
- `wikipedia.js`
- `wiktionary.js`
- `duckduckgo.js`
- `stackoverflow.js`

## Install

1. Open Chrome/Edge Extensions.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this folder.

## Use

1. Select a word or short phrase.
2. Read the insight popup.
3. Click links or Copy.

## Google OAuth (launchWebAuthFlow)

The extension now supports a native OAuth 2.0 Authorization Code + PKCE flow via `chrome.identity.launchWebAuthFlow`, with refresh-token based session management in `chrome.storage.local`.

### 1. Google Cloud Console

1. Create OAuth 2.0 credentials for a **Web application**.
2. Add redirect URI:
   - `https://<your-extension-id>.chromiumapp.org`
3. Add your extension ID under JavaScript origins if your setup requires it.

### 2. Backend/Worker endpoints

Configure two secure endpoints (for example in your backend or Cloudflare Worker):

1. **Exchange endpoint** (`POST`) to exchange auth code:
   - input: `code`, `codeVerifier`, `redirectUri`, `clientId`
   - output: `access_token`, `refresh_token`, `expires_in`, `token_type`, `scope`
2. **Refresh endpoint** (`POST`) to refresh access token:
   - input: `refreshToken`, `clientId`
   - output: `access_token`, optional `refresh_token`, `expires_in`, `token_type`, `scope`

### 3. Configure + run from extension runtime messaging

Use `chrome.runtime.sendMessage` from popup/options/content scripts:

1. Configure:
   - `type: "peek-google-auth-configure"`
   - payload: `clientId`, `scopes`, `exchangeEndpoint`, `refreshEndpoint`
2. Start login:
   - `type: "peek-google-auth-start"`
3. Get valid access token (auto-refresh if expired):
   - `type: "peek-google-auth-token"`
4. Check status:
   - `type: "peek-google-auth-status"`
5. Force refresh:
   - `type: "peek-google-auth-refresh"`
6. Sign out:
   - `type: "peek-google-auth-disconnect"`

`peek-fetch-text` also accepts `useGoogleAuth: true` to attach a bearer token in background requests.
