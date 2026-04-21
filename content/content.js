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
        if (!options.silentFailure) {
          setFallbackResult("wikipedia", result.message, selectionToken);
        } else {
          resetResult(state);
        }
      }
    } finally {
      // No-op: only copy action remains interactive.
    }
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

    clearTriggerTimer();
    hidePopup(state);
  }

  function onAnyScroll() {
    if (!state.isVisible) {
      return;
    }

    clearTriggerTimer();
    hidePopup(state);
  }

  function onKeyDown(event) {
    if (!state.isVisible) {
      return;
    }

    if (event.key === "Escape") {
      clearTriggerTimer();
      hidePopup(state);
    }
  }

  function clearTriggerTimer() {
    if (state.triggerTimerId === null) {
      return;
    }

    window.clearTimeout(state.triggerTimerId);
    state.triggerTimerId = null;
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

    setSelectionText(state, selectedText);
    resetResult(state);
    state.selectionToken += 1;
    state.actionToken += 1;
    clearLoadingTimer(state);
    clearTriggerTimer();

    const selectionRect = selectionSnapshot?.rect || getSelectionRect();
    if (!selectionRect) {
      hidePopup(state);
      return;
    }

    const popup = createPopupNode(state);
    const { x, y } = computePopupPosition(popup, selectionRect);
    showPopupAt(state, x, y);

    // Show UI first, then fetch definition asynchronously.
    window.setTimeout(() => {
      runInsightsAction({ silentFailure: true });
    }, 0);
  }

  function queueSelectionTrigger(source, event) {
    clearTriggerTimer();
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

  function onMouseUp(event) {
    queueSelectionTrigger("mouseup", event);
  }

  function onDoubleClick(event) {
    queueSelectionTrigger("dblclick", event);
  }

  function onSelectionChange() {
    const text = getCurrentSelectionText();
    if (!text) {
      if (state.isVisible) {
        hidePopup(state);
      }
      return;
    }

    const ownerNode = getSelectionOwnerNode();
    if (isNodeInsidePopup(ownerNode)) {
      return;
    }

    // Fallback trigger path for pages where mouse events are unreliable.
    queueSelectionTrigger("selectionchange", { target: ownerNode || document.body });
  }

  // Expose a lightweight debug API for upcoming steps.
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
})();
