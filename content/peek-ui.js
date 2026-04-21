(() => {
  function createActionButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.className = "peek-action-btn";
    return button;
  }

  function createSourceBadge(source) {
    const fragment = document.createDocumentFragment();

    if (source === "wikipedia" || source === "combined") {
      const icon = document.createElement("img");
      icon.src = "https://en.wikipedia.org/static/favicon/wikipedia.ico";
      icon.alt = "Wikipedia";
      icon.width = 14;
      icon.height = 14;
      icon.style.display = "block";

      const label = document.createElement("span");
      label.textContent = source === "combined" ? "Insight" : "Wikipedia";
      fragment.append(icon, label);
      return fragment;
    }

    const label = document.createElement("span");
    label.textContent = "Dictionary";
    fragment.append(label);
    return fragment;
  }

  function ensurePopupStyles() {
    if (document.getElementById("peek-popup-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "peek-popup-style";
    style.textContent = `
      .peek-popup {
        position: fixed;
        z-index: 2147483647;
        display: none;
        width: min(460px, calc(100vw - 24px));
        min-width: 320px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.4);
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        color: #0f172a;
        font-family: "Segoe UI", "SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
        pointer-events: auto;
      }

      .peek-header {
        font-size: 14px;
        font-weight: 650;
        letter-spacing: 0.01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .peek-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
        min-height: 28px;
      }

      .peek-action-btn {
        border: 1px solid rgba(59, 130, 246, 0.28);
        background: #eff6ff;
        color: #1e3a8a;
        padding: 5px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.25;
        cursor: pointer;
        white-space: nowrap;
        transition: background-color 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
      }

      .peek-action-btn:hover {
        background: #dbeafe;
        border-color: rgba(37, 99, 235, 0.45);
      }

      .peek-action-btn:active {
        transform: translateY(1px);
      }

      .peek-action-btn:disabled {
        opacity: 0.72;
        cursor: default;
      }

      .peek-definition {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(148, 163, 184, 0.28);
        font-size: 12px;
        line-height: 1.45;
        color: #334155;
        display: none;
      }

      .peek-result-source {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 650;
        color: #0f172a;
      }

      .peek-result-text {
        white-space: pre-line;
        margin-top: 6px;
      }

      .peek-result-links {
        margin-top: 8px;
        display: none;
        grid-template-columns: 1fr;
        gap: 4px;
        font-size: 11px;
      }

      @keyframes peekShimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      .peek-skeleton-bar {
        height: 8px;
        border-radius: 6px;
        background: linear-gradient(90deg, #e2e8f0 20%, #f1f5f9 45%, #e2e8f0 70%);
        background-size: 200% 100%;
        animation: peekShimmer 1.1s linear infinite;
      }

      .peek-result-link {
        color: #1d4ed8;
        text-decoration: none;
      }

      .peek-result-link:hover {
        text-decoration: underline;
      }

      @media (max-width: 420px) {
        .peek-popup {
          min-width: 0;
          width: calc(100vw - 16px);
          padding: 10px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function createPopupNode(state) {
    if (state.popupEl) {
      return state.popupEl;
    }

    const popup = document.createElement("div");
    popup.id = "peek-selection-popup";
    popup.className = "peek-popup";
    popup.setAttribute("aria-hidden", "true");

    const header = document.createElement("div");
    header.className = "peek-header";
    header.textContent = "Selection";

    const actions = document.createElement("div");
    actions.className = "peek-actions";

    const copyButton = createActionButton("Copy", "copy");

    actions.append(copyButton);

    const definition = document.createElement("div");
    definition.className = "peek-definition";

    const resultSource = document.createElement("div");
    resultSource.className = "peek-result-source";

    const resultText = document.createElement("div");
    resultText.className = "peek-result-text";

    const resultLinks = document.createElement("div");
    resultLinks.className = "peek-result-links";

    const skeleton = document.createElement("div");
    skeleton.style.display = "none";
    skeleton.style.marginTop = "6px";
    skeleton.style.gap = "6px";

    const skeletonLineOne = document.createElement("div");
    skeletonLineOne.className = "peek-skeleton-bar";
    skeletonLineOne.style.width = "100%";

    const skeletonLineTwo = document.createElement("div");
    skeletonLineTwo.className = "peek-skeleton-bar";
    skeletonLineTwo.style.width = "82%";

    skeleton.append(skeletonLineOne, skeletonLineTwo);
    definition.append(resultSource, resultText, resultLinks, skeleton);
    popup.append(header, actions, definition);
    document.documentElement.appendChild(popup);

    state.popupEl = popup;
    state.headerEl = header;
    state.actionsEl = actions;
    state.definitionEl = definition;
    state.resultSourceEl = resultSource;
    state.resultTextEl = resultText;
    state.resultLinksEl = resultLinks;
    state.skeletonEl = skeleton;
    state.searchButtonEl = null;
    state.dictionaryButtonEl = null;
    state.copyButtonEl = copyButton;

    return popup;
  }

  function clearLoadingTimer(state) {
    if (state.loadingTimerId === null) {
      return;
    }

    window.clearTimeout(state.loadingTimerId);
    state.loadingTimerId = null;
  }

  function setButtonsBusy(state, activeAction, isBusy) {
    const controls = [state.searchButtonEl, state.dictionaryButtonEl, state.copyButtonEl];
    controls.forEach((button) => {
      if (!button) {
        return;
      }

      const isActive = button.dataset.action === activeAction;
      if (isBusy && isActive) {
        button.disabled = true;
        button.style.opacity = "0.72";
      } else {
        button.disabled = false;
        button.style.opacity = "1";
      }
    });
  }

  function setSelectionText(state, text) {
    state.currentSelectionText = text;
    if (state.headerEl) {
      state.headerEl.textContent = text || "Selection";
    }
  }

  function showPopupAt(state, x, y) {
    const popup = createPopupNode(state);
    popup.style.left = `${Math.max(0, x)}px`;
    popup.style.top = `${Math.max(0, y)}px`;
    popup.style.display = "block";
    popup.setAttribute("aria-hidden", "false");
    state.isVisible = true;
  }

  function resetResult(state) {
    if (!state.definitionEl || !state.resultSourceEl || !state.resultTextEl || !state.resultLinksEl || !state.skeletonEl) {
      return;
    }

    state.resultSourceEl.replaceChildren();
    state.resultTextEl.textContent = "";
    state.resultTextEl.style.display = "block";
    state.resultLinksEl.replaceChildren();
    state.resultLinksEl.style.display = "none";
    state.skeletonEl.style.display = "none";
    state.definitionEl.style.display = "none";
  }

  function hidePopup(state) {
    if (!state.popupEl) {
      return;
    }

    state.popupEl.style.display = "none";
    state.popupEl.setAttribute("aria-hidden", "true");
    state.isVisible = false;
    state.selectionToken += 1;
    clearLoadingTimer(state);
    resetResult(state);
    setButtonsBusy(state, "", false);
  }

  function setResult(state, source, text, links = []) {
    if (!state.definitionEl || !state.resultSourceEl || !state.resultTextEl || !state.resultLinksEl || !state.skeletonEl) {
      return;
    }

    if (!text) {
      resetResult(state);
      return;
    }

    clearLoadingTimer(state);
    state.resultSourceEl.replaceChildren();
    state.resultSourceEl.append(createSourceBadge(source));
    state.resultTextEl.style.display = "block";
    state.skeletonEl.style.display = "none";
    state.resultTextEl.textContent = text;

    state.resultLinksEl.replaceChildren();
    const safeLinks = Array.isArray(links) ? links : [];
    if (safeLinks.length > 0) {
      safeLinks.forEach((item) => {
        if (!item?.url) {
          return;
        }

        const anchor = document.createElement("a");
        anchor.href = item.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.className = "peek-result-link";
        anchor.textContent = item.label || item.url;
        state.resultLinksEl.append(anchor);
      });
      state.resultLinksEl.style.display = state.resultLinksEl.childElementCount > 0 ? "grid" : "none";
    } else {
      state.resultLinksEl.style.display = "none";
    }

    state.definitionEl.style.display = "block";
  }

  function showLoadingSkeleton(state, source) {
    if (!state.definitionEl || !state.resultSourceEl || !state.resultTextEl || !state.skeletonEl) {
      return;
    }

    state.resultSourceEl.replaceChildren();
    state.resultSourceEl.append(createSourceBadge(source));
    state.resultTextEl.style.display = "none";
    state.skeletonEl.style.display = "grid";
    state.definitionEl.style.display = "block";
  }

  function scheduleLoadingState(state, source, token) {
    clearLoadingTimer(state);
    state.loadingTimerId = window.setTimeout(() => {
      if (token !== state.selectionToken || !state.isVisible) {
        return;
      }

      showLoadingSkeleton(state, source);
    }, 160);
  }

  window.PeekUI = {
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
  };
})();
