(() => {
  function createActionButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.style.border = "1px solid rgba(0, 0, 0, 0.14)";
    button.style.background = "#f8fafc";
    button.style.color = "#0f172a";
    button.style.padding = "4px 8px";
    button.style.borderRadius = "7px";
    button.style.fontSize = "12px";
    button.style.lineHeight = "1.2";
    button.style.cursor = "pointer";
    button.style.whiteSpace = "nowrap";
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
    `;

    document.head.appendChild(style);
  }

  function createPopupNode(state) {
    if (state.popupEl) {
      return state.popupEl;
    }

    const popup = document.createElement("div");
    popup.id = "peek-selection-popup";
    popup.setAttribute("aria-hidden", "true");
    popup.style.position = "fixed";
    popup.style.zIndex = "2147483647";
    popup.style.display = "none";
    popup.style.maxWidth = "420px";
    popup.style.minWidth = "300px";
    popup.style.padding = "12px";
    popup.style.borderRadius = "12px";
    popup.style.border = "1px solid rgba(0, 0, 0, 0.12)";
    popup.style.background = "#ffffff";
    popup.style.color = "#1f2937";
    popup.style.fontFamily = "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    popup.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.14)";
    popup.style.pointerEvents = "auto";

    const header = document.createElement("div");
    header.style.fontSize = "13px";
    header.style.fontWeight = "600";
    header.style.whiteSpace = "nowrap";
    header.style.overflow = "hidden";
    header.style.textOverflow = "ellipsis";
    header.textContent = "Selection";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.gap = "6px";
    actions.style.marginTop = "6px";
    actions.style.minHeight = "24px";

    const copyButton = createActionButton("Copy", "copy");

    actions.append(copyButton);

    const definition = document.createElement("div");
    definition.style.marginTop = "8px";
    definition.style.fontSize = "12px";
    definition.style.lineHeight = "1.35";
    definition.style.color = "#334155";
    definition.style.display = "none";

    const resultSource = document.createElement("div");
    resultSource.style.display = "flex";
    resultSource.style.alignItems = "center";
    resultSource.style.gap = "6px";
    resultSource.style.fontSize = "11px";
    resultSource.style.fontWeight = "600";
    resultSource.style.color = "#0f172a";

    const resultText = document.createElement("div");
    resultText.style.whiteSpace = "pre-line";

    const resultLinks = document.createElement("div");
    resultLinks.style.marginTop = "8px";
    resultLinks.style.display = "none";
    resultLinks.style.gridTemplateColumns = "1fr";
    resultLinks.style.gap = "4px";
    resultLinks.style.fontSize = "11px";

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
