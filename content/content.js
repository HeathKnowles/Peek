(() => {
  if (window.__peekInjected) {
    return;
  }
  window.__peekInjected = true;

  if (!window.PeekState || !window.PeekUI || !window.PeekSelection || !window.PeekServices) {
    return;
  }

  const state = window.PeekState.createState();
  const {
    ensurePopupStyles,
    createPopupNode,
    clearLoadingTimer,
    setSelectionText,
    showPopupAt,
    resetResult,
    hidePopup,
    setResult,
    scheduleLoadingState,
  } = window.PeekUI;
  const {
    shouldShowSelection,
    getCurrentSelectionText,
    getSelectionRect,
    computePopupPosition,
  } = window.PeekSelection;
  const { fetchSelectionInsights } = window.PeekServices;

  function getSelectionOwnerNode() {
    const selection = window.getSelection();
    if (!selection) {
      return null;
    }

    return selection.anchorNode || selection.focusNode || null;
  }

  function isNodeInsidePopup(node) {
    if (!node || !state.popupEl) {
      return false;
    }

    return state.popupEl.contains(node);
  }

  function isGoogleFormCandidateLink(href) {
    return !!resolveGoogleFormCandidateUrl(href);
  }

  function resolveGoogleSearchRedirectUrl(rawHref) {
    if (!rawHref || typeof rawHref !== "string") {
      return "";
    }

    let parsed;
    try {
      parsed = new URL(rawHref, window.location.href);
    } catch {
      return "";
    }

    const isGoogleDomain = /(^|\.)google\.[a-z.]+$/i.test(parsed.hostname);
    if (!isGoogleDomain || parsed.pathname !== "/url") {
      return "";
    }

    return parsed.searchParams.get("q") || parsed.searchParams.get("url") || parsed.searchParams.get("adurl") || "";
  }

  function resolveGenericRedirectUrl(rawHref) {
    if (!rawHref || typeof rawHref !== "string") {
      return "";
    }

    let parsed;
    try {
      parsed = new URL(rawHref, window.location.href);
    } catch {
      return "";
    }

    const keys = ["u", "url", "q", "target", "dest", "redirect"];
    for (let i = 0; i < keys.length; i += 1) {
      const value = parsed.searchParams.get(keys[i]);
      if (value && /^https?:\/\//i.test(value)) {
        return value;
      }
    }

    return "";
  }

  function resolveGoogleFormCandidateUrl(href) {
    if (!href || typeof href !== "string") {
      return "";
    }

    const redirected = resolveGoogleSearchRedirectUrl(href) || resolveGenericRedirectUrl(href);
    const candidate = redirected || href;
    try {
      const url = new URL(candidate, window.location.href);
      const isFormsUrl = url.hostname === "docs.google.com" && /^\/forms\/d\/(?:e\/)?[a-zA-Z0-9_-]+/.test(url.pathname);
      const isGoogleSitesUrl = url.hostname === "sites.google.com";
      if (!isFormsUrl && !isGoogleSitesUrl) {
        return "";
      }
      return url.toString();
    } catch {
      return "";
    }
  }

  function clearTriggerTimer() {
    if (state.triggerTimerId === null) {
      return;
    }

    window.clearTimeout(state.triggerTimerId);
    state.triggerTimerId = null;
  }

  function clearHoverTimer() {
    if (state.hoverTimerId === null) {
      return;
    }

    window.clearTimeout(state.hoverTimerId);
    state.hoverTimerId = null;
  }

  function clearAllTimers() {
    clearTriggerTimer();
    clearHoverTimer();
  }

  async function handleCopyAction() {
    if (!state.currentSelectionText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.currentSelectionText);
      if (state.copyButtonEl) {
        const originalLabel = state.copyButtonEl.textContent;
        state.copyButtonEl.textContent = "Copied";
        window.setTimeout(() => {
          if (state.copyButtonEl) {
            state.copyButtonEl.textContent = originalLabel || "Copy";
          }
        }, 900);
      }
    } catch {
      if (state.copyButtonEl) {
        const originalLabel = state.copyButtonEl.textContent;
        state.copyButtonEl.textContent = "Copy failed";
        window.setTimeout(() => {
          if (state.copyButtonEl) {
            state.copyButtonEl.textContent = originalLabel || "Copy";
          }
        }, 1200);
      }
    }
  }

  function setFallbackResult(source, text, token) {
    if (token !== state.selectionToken || !state.isVisible) {
      return;
    }

    setResult(state, source, text, []);
  }

  async function runInsightsAction(options = {}) {
    const selectionToken = state.selectionToken;
    const actionToken = state.actionToken + 1;
    state.actionToken = actionToken;

    const isImageShown = window.PeekUI.tryRenderImageFromText(state, state.currentSelectionText);
    if (isImageShown) {
      return;
    }

    scheduleLoadingState(state, "wikipedia", selectionToken);
    try {
      const result = await fetchSelectionInsights(state.currentSelectionText);
      if (selectionToken !== state.selectionToken || actionToken !== state.actionToken || !state.isVisible) {
        return;
      }

      if (result.ok) {
        setResult(state, result.source || "wikipedia", result.message, result.links || []);
      } else {
        clearLoadingTimer(state);
        const failureSource = result?.source || "wikipedia";
        const shouldShowFailure = !options.silentFailure || failureSource === "google-forms";
        if (shouldShowFailure) {
          setFallbackResult(failureSource, result.message || "No result found.", selectionToken);
        } else {
          resetResult(state);
        }
      }
    } finally {
      // No-op: only copy action remains interactive.
    }
  }

  function showPeekForTextAtRect(text, rect) {
    if (!text || !rect) {
      return;
    }

    setSelectionText(state, text);
    resetResult(state);
    state.selectionToken += 1;
    state.actionToken += 1;
    clearLoadingTimer(state);
    clearAllTimers();

    const popup = createPopupNode(state);
    const { x, y } = computePopupPosition(popup, rect);
    showPopupAt(state, x, y);

    window.setTimeout(() => {
      runInsightsAction({ silentFailure: true });
    }, 0);
  }

  function onPopupClick(event) {
    const actionElement = event.target.closest("button[data-action]");
    if (!actionElement) {
      return;
    }

    const { action } = actionElement.dataset;
    if (action === "copy") {
      handleCopyAction();
    }
  }

  function onDocumentPointerDown(event) {
    if (!state.isVisible) {
      return;
    }

    if (state.popupEl && state.popupEl.contains(event.target)) {
      return;
    }

    clearAllTimers();
    state.hoverAnchorEl = null;
    hidePopup(state);
  }

  function onAnyScroll() {
    if (!state.isVisible) {
      return;
    }

    clearAllTimers();
    state.hoverAnchorEl = null;
    hidePopup(state);
  }

  function onKeyDown(event) {
    if (!state.isVisible) {
      return;
    }

    if (event.key === "Escape") {
      clearAllTimers();
      state.hoverAnchorEl = null;
      hidePopup(state);
    }
  }

  function handleSelectionTrigger(source, eventTarget, selectionSnapshot) {
    if (state.popupEl && eventTarget && state.popupEl.contains(eventTarget)) {
      return;
    }

    const ownerNode = getSelectionOwnerNode();
    if (isNodeInsidePopup(ownerNode)) {
      return;
    }

    const selectedText = selectionSnapshot?.text || getCurrentSelectionText();
    if (!shouldShowSelection(selectedText, source)) {
      hidePopup(state);
      return;
    }

    const selectionRect = selectionSnapshot?.rect || getSelectionRect();
    if (!selectionRect) {
      hidePopup(state);
      return;
    }

    state.hoverAnchorEl = null;
    showPeekForTextAtRect(selectedText, selectionRect);
  }

  function queueSelectionTrigger(source, event) {
    clearTriggerTimer();
    clearHoverTimer();
    state.hoverAnchorEl = null;

    const eventTarget = event?.target || getSelectionOwnerNode() || document.body;
    const selectionSnapshot = {
      text: getCurrentSelectionText(),
      rect: getSelectionRect(),
    };
    const delay = source === "dblclick" ? 8 : source === "selectionchange" ? 40 : 32;
    state.triggerTimerId = window.setTimeout(() => {
      state.triggerTimerId = null;
      handleSelectionTrigger(source, eventTarget, selectionSnapshot);
    }, delay);
  }

  function queueHoverTrigger(anchorEl) {
    clearTriggerTimer();
    clearHoverTimer();
    state.hoverTimerId = window.setTimeout(() => {
      state.hoverTimerId = null;
      if (!anchorEl || !anchorEl.isConnected) {
        return;
      }

      const candidateUrl = resolveGoogleFormCandidateUrl(anchorEl.href);
      if (!candidateUrl) {
        return;
      }

      state.hoverAnchorEl = anchorEl;
      showPeekForTextAtRect(candidateUrl, anchorEl.getBoundingClientRect());
    }, 220);
  }

  function onMouseUp(event) {
    queueSelectionTrigger("mouseup", event);
  }

  function onDoubleClick(event) {
    queueSelectionTrigger("dblclick", event);
  }

  function onSelectionChange() {
    const text = getCurrentSelectionText();
    if (!text) {
      if (state.isVisible && !state.hoverAnchorEl) {
        hidePopup(state);
      }
      return;
    }

    const ownerNode = getSelectionOwnerNode();
    if (isNodeInsidePopup(ownerNode)) {
      return;
    }

    queueSelectionTrigger("selectionchange", { target: ownerNode || document.body });
  }

  function onMouseOver(event) {
    if (!event?.target || isNodeInsidePopup(event.target)) {
      return;
    }

    const targetElement = event.target.nodeType === Node.ELEMENT_NODE ? event.target : event.target.parentElement;
    const anchor = targetElement?.closest ? targetElement.closest("a[href]") : null;
    if (!anchor || !resolveGoogleFormCandidateUrl(anchor.href)) {
      return;
    }

    if (state.hoverAnchorEl === anchor && state.isVisible) {
      return;
    }

    queueHoverTrigger(anchor);
  }

  function onMouseOut(event) {
    if (!state.hoverAnchorEl) {
      return;
    }

    const fromAnchor = event?.target?.closest ? event.target.closest("a[href]") : null;
    if (fromAnchor !== state.hoverAnchorEl) {
      return;
    }

    const nextNode = event.relatedTarget;
    if (
      nextNode &&
      (state.hoverAnchorEl.contains(nextNode) || (state.popupEl && state.popupEl.contains(nextNode)))
    ) {
      return;
    }

    clearHoverTimer();
    state.hoverAnchorEl = null;
    if (state.isVisible) {
      hidePopup(state);
    }
  }

  window.__peek = {
    state,
    runInsightsAction,
    status: "ready",
  };

  createPopupNode(state);
  ensurePopupStyles();
  state.popupEl.addEventListener("click", onPopupClick);
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("scroll", onAnyScroll, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("dblclick", onDoubleClick);
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
})();
