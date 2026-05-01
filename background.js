(() => {
  const ALLOWED_HOSTS = new Set([
    "docs.google.com",
    "sites.google.com",
  ]);
  const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
  const OAUTH_STORAGE_KEY = "peek-google-oauth";
  const OAUTH_CONFIG_STORAGE_KEY = "peek-google-oauth-config";
  const AUTH_EXPIRY_SKEW_MS = 60 * 1000;
  const DEFAULT_OAUTH_CONFIG = {
    clientId: "REPLACE_WITH_GOOGLE_WEB_CLIENT_ID",
    scopes: [
      "openid",
      "email",
    ],
    exchangeEndpoint: "REPLACE_WITH_BACKEND_EXCHANGE_ENDPOINT",
    refreshEndpoint: "REPLACE_WITH_BACKEND_REFRESH_ENDPOINT",
  };

  let inFlightTokenRefresh = null;

  function isAllowedUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
      return false;
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }

    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname);
  }

  function nowMs() {
    return Date.now();
  }

  function toBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function randomBase64Url(size = 32) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return toBase64Url(bytes);
  }

  async function sha256Base64Url(input) {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return toBase64Url(new Uint8Array(digest));
  }

  function getRuntimeRedirectUri() {
    return chrome.identity.getRedirectURL().replace(/\/$/, "");
  }

  function normalizeScopes(scopes) {
    if (!Array.isArray(scopes)) {
      return DEFAULT_OAUTH_CONFIG.scopes.slice();
    }

    const deduped = new Set();
    for (let i = 0; i < scopes.length; i += 1) {
      const scope = typeof scopes[i] === "string" ? scopes[i].trim() : "";
      if (scope) {
        deduped.add(scope);
      }
    }

    return deduped.size > 0 ? Array.from(deduped) : DEFAULT_OAUTH_CONFIG.scopes.slice();
  }

  function normalizeTokenPayload(payload, fallbackRefreshToken = "") {
    if (!payload || typeof payload !== "object") {
      throw new Error("Token endpoint returned an invalid payload.");
    }

    const accessToken = payload.accessToken || payload.access_token;
    const refreshToken = payload.refreshToken || payload.refresh_token || fallbackRefreshToken;
    const expiresInRaw = payload.expiresIn ?? payload.expires_in;
    const tokenType = payload.tokenType || payload.token_type || "Bearer";
    const scope = payload.scope || payload.scopes || "";
    const expiresIn = Number(expiresInRaw);

    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw new Error("Token endpoint did not return an access token.");
    }
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error("Token endpoint did not return a valid expires_in value.");
    }

    return {
      accessToken,
      refreshToken: typeof refreshToken === "string" ? refreshToken : "",
      tokenType: typeof tokenType === "string" && tokenType ? tokenType : "Bearer",
      scope: Array.isArray(scope) ? scope.join(" ") : String(scope || ""),
      expiresAt: nowMs() + (expiresIn * 1000),
    };
  }

  async function getStoredConfig() {
    const result = await chrome.storage.local.get([OAUTH_CONFIG_STORAGE_KEY]);
    const stored = result?.[OAUTH_CONFIG_STORAGE_KEY];
    if (!stored || typeof stored !== "object") {
      return { ...DEFAULT_OAUTH_CONFIG };
    }

    return {
      clientId: typeof stored.clientId === "string" ? stored.clientId : DEFAULT_OAUTH_CONFIG.clientId,
      scopes: normalizeScopes(stored.scopes),
      exchangeEndpoint: typeof stored.exchangeEndpoint === "string" ? stored.exchangeEndpoint : DEFAULT_OAUTH_CONFIG.exchangeEndpoint,
      refreshEndpoint: typeof stored.refreshEndpoint === "string" ? stored.refreshEndpoint : DEFAULT_OAUTH_CONFIG.refreshEndpoint,
    };
  }

  function ensureConfig(config) {
    if (!config.clientId || config.clientId === DEFAULT_OAUTH_CONFIG.clientId) {
      throw new Error("Google OAuth clientId is not configured.");
    }
    if (!config.exchangeEndpoint || config.exchangeEndpoint === DEFAULT_OAUTH_CONFIG.exchangeEndpoint) {
      throw new Error("OAuth exchange endpoint is not configured.");
    }
    if (!config.refreshEndpoint || config.refreshEndpoint === DEFAULT_OAUTH_CONFIG.refreshEndpoint) {
      throw new Error("OAuth refresh endpoint is not configured.");
    }
  }

  async function getStoredTokenState() {
    const result = await chrome.storage.local.get([OAUTH_STORAGE_KEY]);
    const state = result?.[OAUTH_STORAGE_KEY];
    if (!state || typeof state !== "object") {
      return null;
    }

    return state;
  }

  async function persistTokenState(existing, tokenPayload, config) {
    const scopeSource = tokenPayload.scope || normalizeScopes(config.scopes).join(" ");
    const scope = normalizeScopes(String(scopeSource).split(/\s+/));
    const nextState = {
      clientId: config.clientId,
      scopes: scope,
      accessToken: tokenPayload.accessToken,
      refreshToken: tokenPayload.refreshToken || existing?.refreshToken || "",
      tokenType: tokenPayload.tokenType || "Bearer",
      expiresAt: tokenPayload.expiresAt,
      updatedAt: new Date().toISOString(),
    };

    await chrome.storage.local.set({
      [OAUTH_STORAGE_KEY]: nextState,
    });
    return nextState;
  }

  function buildAuthUrl({ clientId, redirectUri, scopes, state, codeChallenge }) {
    const url = new URL(GOOGLE_AUTH_BASE);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  function parseAuthCodeFromRedirect(redirectUrl, expectedState) {
    const parsed = new URL(redirectUrl);
    const state = parsed.searchParams.get("state");
    if (state !== expectedState) {
      throw new Error("OAuth state validation failed.");
    }

    const authCode = parsed.searchParams.get("code");
    if (!authCode) {
      const authError = parsed.searchParams.get("error") || "Authorization was not completed.";
      throw new Error(`OAuth authorization failed: ${authError}`);
    }

    return authCode;
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let body = null;
    if (responseText) {
      try {
        body = JSON.parse(responseText);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const message = body?.error || body?.message || responseText || "OAuth server request failed.";
      throw new Error(message);
    }

    return body;
  }

  async function exchangeCodeForTokens({ code, codeVerifier, redirectUri, config }) {
    const response = await postJson(config.exchangeEndpoint, {
      code,
      codeVerifier,
      redirectUri,
      clientId: config.clientId,
    });
    return normalizeTokenPayload(response);
  }

  async function refreshAccessToken({ refreshToken, config }) {
    const response = await postJson(config.refreshEndpoint, {
      refreshToken,
      clientId: config.clientId,
    });
    return normalizeTokenPayload(response, refreshToken);
  }

  async function refreshTokenState(config, existingState) {
    if (!existingState?.refreshToken) {
      throw new Error("No refresh token available. Re-authentication is required.");
    }

    if (!inFlightTokenRefresh) {
      inFlightTokenRefresh = refreshAccessToken({
        refreshToken: existingState.refreshToken,
        config,
      })
        .then((tokenPayload) => persistTokenState(existingState, tokenPayload, config))
        .finally(() => {
          inFlightTokenRefresh = null;
        });
    }

    return inFlightTokenRefresh;
  }

  async function getValidTokenState(config) {
    const state = await getStoredTokenState();
    if (!state?.accessToken) {
      throw new Error("User is not authenticated.");
    }

    const expiresAt = Number(state.expiresAt || 0);
    if (Number.isFinite(expiresAt) && nowMs() + AUTH_EXPIRY_SKEW_MS < expiresAt) {
      return state;
    }

    return refreshTokenState(config, state);
  }

  async function fetchTextWithTimeout(url, timeoutMs, options = {}) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {};
      if (options.accessToken) {
        headers.Authorization = `Bearer ${options.accessToken}`;
      }

      const response = await fetch(url, {
        method: "GET",
        credentials: "omit",
        redirect: "follow",
        signal: controller.signal,
        headers,
      });
      const text = await response.text();

      return {
        ok: response.ok,
        status: response.status,
        url: response.url || url,
        text,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        url,
        text: "",
        error: error instanceof Error ? error.message : "Background fetch failed.",
      };
    } finally {
      clearTimeout(timerId);
    }
  }

  async function handleFetchText(message) {
    const targetUrl = typeof message.url === "string" ? message.url : "";
    const timeoutMs = typeof message.timeoutMs === "number" && message.timeoutMs > 0 ? message.timeoutMs : 20000;
    const useGoogleAuth = message.useGoogleAuth === true;

    if (!isAllowedUrl(targetUrl)) {
      return {
        ok: false,
        status: 0,
        url: targetUrl,
        text: "",
        error: "URL is not allowed for background fetch.",
      };
    }

    let accessToken = "";
    if (useGoogleAuth) {
      const config = await getStoredConfig();
      ensureConfig(config);
      const validState = await getValidTokenState(config);
      accessToken = validState.accessToken || "";
    }

    return fetchTextWithTimeout(targetUrl, timeoutMs, {
      accessToken,
    });
  }

  async function handleGoogleAuthStart(message) {
    const config = await getStoredConfig();
    if (
      typeof message.clientId === "string" ||
      Array.isArray(message.scopes) ||
      typeof message.exchangeEndpoint === "string" ||
      typeof message.refreshEndpoint === "string"
    ) {
      const nextConfig = {
        clientId: typeof message.clientId === "string" ? message.clientId : config.clientId,
        scopes: Array.isArray(message.scopes) ? normalizeScopes(message.scopes) : normalizeScopes(config.scopes),
        exchangeEndpoint: typeof message.exchangeEndpoint === "string" ? message.exchangeEndpoint : config.exchangeEndpoint,
        refreshEndpoint: typeof message.refreshEndpoint === "string" ? message.refreshEndpoint : config.refreshEndpoint,
      };
      await chrome.storage.local.set({
        [OAUTH_CONFIG_STORAGE_KEY]: nextConfig,
      });
    }

    const finalConfig = await getStoredConfig();
    ensureConfig(finalConfig);

    const redirectUri = getRuntimeRedirectUri();
    const state = randomBase64Url(24);
    const codeVerifier = randomBase64Url(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);

    const authUrl = buildAuthUrl({
      clientId: finalConfig.clientId,
      redirectUri,
      scopes: normalizeScopes(finalConfig.scopes),
      state,
      codeChallenge,
    });
    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });
    if (!redirectUrl || typeof redirectUrl !== "string") {
      throw new Error("OAuth flow did not return a redirect URL.");
    }

    const code = parseAuthCodeFromRedirect(redirectUrl, state);
    const tokenPayload = await exchangeCodeForTokens({
      code,
      codeVerifier,
      redirectUri,
      config: finalConfig,
    });
    const persisted = await persistTokenState(null, tokenPayload, finalConfig);

    return {
      ok: true,
      authenticated: true,
      hasRefreshToken: !!persisted.refreshToken,
      scopes: persisted.scopes || [],
      expiresAt: persisted.expiresAt,
      redirectUri,
    };
  }

  async function handleGoogleAuthToken() {
    const config = await getStoredConfig();
    ensureConfig(config);

    const state = await getValidTokenState(config);
    return {
      ok: true,
      accessToken: state.accessToken,
      tokenType: state.tokenType || "Bearer",
      expiresAt: state.expiresAt,
      scopes: Array.isArray(state.scopes) ? state.scopes : [],
    };
  }

  async function handleGoogleAuthRefresh() {
    const config = await getStoredConfig();
    ensureConfig(config);

    const state = await getStoredTokenState();
    const refreshed = await refreshTokenState(config, state || {});
    return {
      ok: true,
      accessToken: refreshed.accessToken,
      tokenType: refreshed.tokenType || "Bearer",
      expiresAt: refreshed.expiresAt,
      scopes: Array.isArray(refreshed.scopes) ? refreshed.scopes : [],
    };
  }

  async function handleGoogleAuthStatus() {
    const config = await getStoredConfig();
    const state = await getStoredTokenState();
    const expiresAt = Number(state?.expiresAt || 0);

    return {
      ok: true,
      configured: (
        config.clientId !== DEFAULT_OAUTH_CONFIG.clientId &&
        config.exchangeEndpoint !== DEFAULT_OAUTH_CONFIG.exchangeEndpoint &&
        config.refreshEndpoint !== DEFAULT_OAUTH_CONFIG.refreshEndpoint
      ),
      authenticated: !!state?.refreshToken || !!state?.accessToken,
      hasRefreshToken: !!state?.refreshToken,
      scopes: Array.isArray(state?.scopes) ? state.scopes : normalizeScopes(config.scopes),
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
      isExpired: !expiresAt || nowMs() + AUTH_EXPIRY_SKEW_MS >= expiresAt,
      redirectUri: getRuntimeRedirectUri(),
    };
  }

  async function handleGoogleAuthDisconnect() {
    await chrome.storage.local.remove([OAUTH_STORAGE_KEY]);
    return {
      ok: true,
      authenticated: false,
    };
  }

  async function handleGoogleAuthConfigure(message) {
    const current = await getStoredConfig();
    const next = {
      clientId: typeof message.clientId === "string" ? message.clientId : current.clientId,
      scopes: Array.isArray(message.scopes) ? normalizeScopes(message.scopes) : normalizeScopes(current.scopes),
      exchangeEndpoint: typeof message.exchangeEndpoint === "string" ? message.exchangeEndpoint : current.exchangeEndpoint,
      refreshEndpoint: typeof message.refreshEndpoint === "string" ? message.refreshEndpoint : current.refreshEndpoint,
    };

    await chrome.storage.local.set({
      [OAUTH_CONFIG_STORAGE_KEY]: next,
    });
    return {
      ok: true,
      configured: (
        next.clientId !== DEFAULT_OAUTH_CONFIG.clientId &&
        next.exchangeEndpoint !== DEFAULT_OAUTH_CONFIG.exchangeEndpoint &&
        next.refreshEndpoint !== DEFAULT_OAUTH_CONFIG.refreshEndpoint
      ),
      scopes: next.scopes,
      redirectUri: getRuntimeRedirectUri(),
    };
  }

  async function handleGoogleAuthResetConfig() {
    await chrome.storage.local.remove([OAUTH_CONFIG_STORAGE_KEY]);
    return {
      ok: true,
      configured: false,
      defaultsApplied: true,
      redirectUri: getRuntimeRedirectUri(),
    };
  }

  const handlers = {
    "peek-fetch-text": handleFetchText,
    "peek-google-auth-start": handleGoogleAuthStart,
    "peek-google-auth-token": handleGoogleAuthToken,
    "peek-google-auth-refresh": handleGoogleAuthRefresh,
    "peek-google-auth-status": handleGoogleAuthStatus,
    "peek-google-auth-disconnect": handleGoogleAuthDisconnect,
    "peek-google-auth-configure": handleGoogleAuthConfigure,
    "peek-google-auth-reset-config": handleGoogleAuthResetConfig,
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return undefined;
    }

    const handler = handlers[message.type];
    if (!handler) {
      return undefined;
    }

    handler(message, sender)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unexpected background error.",
        });
      });

    return true;
  });
})();
