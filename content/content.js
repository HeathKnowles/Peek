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
    setButtonsBusy,
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
  const { fetchWikipediaSummary, fetchDictionaryDefinition } = window.PeekServices;

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

    setResult(state, source, text);
  }

  async function runWikipediaAction() {
    const token = state.selectionToken;
    scheduleLoadingState(state, "wikipedia", token);
    setButtonsBusy(state, "search", true);
    try {
      const result = await fetchWikipediaSummary(state.currentSelectionText);
      if (token !== state.selectionToken || !state.isVisible) {
        return;
      }

      if (result.ok) {
        setResult(state, "wikipedia", result.message);
      } else {
        clearLoadingTimer(state);
        setFallbackResult("wikipedia", result.message, token);
      }
    } finally {
      if (token === state.selectionToken) {
        setButtonsBusy(state, "search", false);
      }
    }
  }

  async function runDictionaryAction() {
    const token = state.selectionToken;
    scheduleLoadingState(state, "dictionary", token);
    setButtonsBusy(state, "dictionary", true);
    try {
      const result = await fetchDictionaryDefinition(state.currentSelectionText);
      if (token !== state.selectionToken || !state.isVisible) {
        return;
      }

      if (result.ok) {
        setResult(state, "dictionary", result.message);
      } else {
        clearLoadingTimer(state);
        setFallbackResult("dictionary", result.message, token);
      }
    } finally {
      if (token === state.selectionToken) {
        setButtonsBusy(state, "dictionary", false);
      }
    }
  }

  function onPopupClick(event) {
    const actionElement = event.target.closest("button[data-action]");
    if (!actionElement) {
      return;
    }

    const { action } = actionElement.dataset;
    if (action === "search") {
      runWikipediaAction();
      return;
    }

    if (action === "dictionary") {
      runDictionaryAction();
      return;
    }

    if (action === "copy") {
      handleCopyAction();
    }
  }

  function handleSelectionTrigger(source, event) {
    if (state.popupEl && state.popupEl.contains(event.target)) {
      return;
    }

    const selectedText = getCurrentSelectionText();
    if (!shouldShowSelection(selectedText, source)) {
      hidePopup();
      return;
    }

    setSelectionText(state, selectedText);
    resetResult(state);
    state.selectionToken += 1;
    setButtonsBusy(state, "", false);

    const selectionRect = getSelectionRect();
    if (!selectionRect) {
      hidePopup(state);
      return;
    }

    const popup = createPopupNode(state);
    const { x, y } = computePopupPosition(popup, selectionRect);
    showPopupAt(state, x, y);

    // Show UI first, then fetch definition asynchronously.
    window.setTimeout(() => {
      runDictionaryAction();
    }, 0);
  }

  function onMouseUp(event) {
    window.setTimeout(() => {
      handleSelectionTrigger("mouseup", event);
    }, 0);
  }

  function onDoubleClick(event) {
    window.setTimeout(() => {
      handleSelectionTrigger("dblclick", event);
    }, 0);
  }

  // Expose a lightweight debug API for upcoming steps.
  window.__peek = {
    state,
    runWikipediaAction,
    runDictionaryAction,
  };

  createPopupNode(state);
  ensurePopupStyles();
  state.popupEl.addEventListener("click", onPopupClick);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("dblclick", onDoubleClick);
})();
