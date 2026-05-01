(() => {
  const connectors = window.PeekConnectors || (window.PeekConnectors = {});

  function trimText(text, maxLength) {
    if (!text) {
      return "";
    }

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 3)}...`;
  }

  function normalizeInline(text) {
    if (!text) {
      return "";
    }

    return text.replace(/\s+/g, " ").trim();
  }

  function stripHtmlTags(text) {
    if (!text) {
      return "";
    }

    return normalizeInline(text.replace(/<[^>]*>/g, " "));
  }

  function cleanTextForMessage(text) {
    if (!text) {
      return "";
    }

    return normalizeInline(stripHtmlTags(text));
  }

  function decodeHtmlEntities(text) {
    if (!text) {
      return "";
    }

    const element = document.createElement("textarea");
    element.innerHTML = text;
    return normalizeInline(element.value);
  }

  function hasExtensionMessaging() {
    return !!(window.chrome && chrome.runtime && typeof chrome.runtime.sendMessage === "function");
  }

  function needsBackgroundBridge(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.hostname === "docs.google.com" || parsed.hostname === "sites.google.com";
    } catch {
      return false;
    }
  }

  async function fetchViaBackground(url, timeoutMs = 20000, options = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "peek-fetch-text",
          url,
          timeoutMs,
          useGoogleAuth: options.useGoogleAuth === true,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              ok: false,
              status: 0,
              url,
              text: "",
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          if (!response || typeof response.text !== "string") {
            resolve({
              ok: false,
              status: 0,
              url,
              text: "",
              error: "No response from background fetch.",
            });
            return;
          }

          resolve(response);
        }
      );
    });
  }

  async function fetchText(url, timeoutMs = 20000, options = {}) {
    if (!url || typeof url !== "string") {
      return { ok: false, status: 0, url: "", text: "" };
    }

    const backgroundOnly = !!options.backgroundOnly;
    const useGoogleAuth = options.useGoogleAuth === true;
    const requiresBridge = needsBackgroundBridge(url);

    if (hasExtensionMessaging()) {
      const bridged = await fetchViaBackground(url, timeoutMs, {
        useGoogleAuth,
      });
      if (bridged.ok || bridged.status > 0 || requiresBridge || backgroundOnly) {
        return bridged;
      }
    }

    if (requiresBridge || backgroundOnly) {
      return {
        ok: false,
        status: 0,
        url,
        text: "",
        error: "Background fetch bridge unavailable.",
      };
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "omit",
      });
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        url: response.url || url,
        text,
      };
    } catch {
      return {
        ok: false,
        status: 0,
        url,
        text: "",
      };
    }
  }

  connectors.utils = {
    trimText,
    normalizeInline,
    stripHtmlTags,
    cleanTextForMessage,
    decodeHtmlEntities,
    fetchText,
  };
})();
