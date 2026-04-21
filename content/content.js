(() => {
  if (window.__peekInjected) {
    return;
  }
  window.__peekInjected = true;

  const state = {
    isVisible: false,
    currentSelectionText: "",
    popupEl: null,
    headerEl: null,
    actionsEl: null,
  };

  function createPopupNode() {
    if (state.popupEl) {
      return state.popupEl;
    }

    const popup = document.createElement("div");
    popup.id = "peek-selection-popup";
    popup.setAttribute("aria-hidden", "true");
    popup.style.position = "fixed";
    popup.style.zIndex = "2147483647";
    popup.style.display = "none";
    popup.style.maxWidth = "320px";
    popup.style.minWidth = "220px";
    popup.style.padding = "10px";
    popup.style.borderRadius = "10px";
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
    actions.style.gap = "8px";
    actions.style.marginTop = "8px";

    popup.append(header, actions);
    document.documentElement.appendChild(popup);

    state.popupEl = popup;
    state.headerEl = header;
    state.actionsEl = actions;

    return popup;
  }

  function setSelectionText(text) {
    state.currentSelectionText = text;
    if (state.headerEl) {
      state.headerEl.textContent = text || "Selection";
    }
  }

  function showPopupAt(x, y) {
    const popup = createPopupNode();
    popup.style.left = `${Math.max(0, x)}px`;
    popup.style.top = `${Math.max(0, y)}px`;
    popup.style.display = "block";
    popup.setAttribute("aria-hidden", "false");
    state.isVisible = true;
  }

  function hidePopup() {
    if (!state.popupEl) {
      return;
    }

    state.popupEl.style.display = "none";
    state.popupEl.setAttribute("aria-hidden", "true");
    state.isVisible = false;
  }

  // Expose a lightweight debug API for upcoming steps.
  window.__peek = {
    state,
    createPopupNode,
    setSelectionText,
    showPopupAt,
    hidePopup,
  };

  createPopupNode();
})();
