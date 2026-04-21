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
    searchButtonEl: null,
    openTabButtonEl: null,
    copyButtonEl: null,
  };

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
    actions.style.flexWrap = "wrap";
    actions.style.gap = "8px";
    actions.style.marginTop = "8px";
    actions.style.minHeight = "26px";

    const searchButton = createActionButton("Search", "search");
    const openTabButton = createActionButton("Open in New Tab", "open-tab");
    const copyButton = createActionButton("Copy", "copy");

    actions.append(searchButton, openTabButton, copyButton);

    popup.append(header, actions);
    document.documentElement.appendChild(popup);

    state.popupEl = popup;
    state.headerEl = header;
    state.actionsEl = actions;
    state.searchButtonEl = searchButton;
    state.openTabButtonEl = openTabButton;
    state.copyButtonEl = copyButton;

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

  function getSelectionRect() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return null;
    }

    return rect;
  }

  function computePopupPosition(selectionRect) {
    const popup = createPopupNode();
    const gap = 8;
    const viewportPadding = 8;

    // Show invisibly so dimensions are measurable without visual flicker.
    const previousDisplay = popup.style.display;
    const previousVisibility = popup.style.visibility;
    popup.style.visibility = "hidden";
    popup.style.display = "block";
    const popupRect = popup.getBoundingClientRect();
    popup.style.display = previousDisplay;
    popup.style.visibility = previousVisibility;

    let x = selectionRect.right + gap;
    let y = selectionRect.bottom + gap;

    const maxX = window.innerWidth - popupRect.width - viewportPadding;
    x = Math.min(x, maxX);
    x = Math.max(viewportPadding, x);

    const wouldOverflowBottom = y + popupRect.height > window.innerHeight - viewportPadding;
    if (wouldOverflowBottom) {
      y = selectionRect.top - popupRect.height - gap;
    }

    const maxY = window.innerHeight - popupRect.height - viewportPadding;
    y = Math.min(y, maxY);
    y = Math.max(viewportPadding, y);

    return { x, y };
  }

  function normalizeSelectionText(rawText) {
    return rawText.replace(/\s+/g, " ").trim();
  }

  function getWordCount(text) {
    if (!text) {
      return 0;
    }

    return text.split(" ").filter(Boolean).length;
  }

  function shouldIgnoreAsParagraph(text, wordCount) {
    return wordCount > 12 || text.length > 140;
  }

  function shouldShowSelection(text, source) {
    if (!text) {
      return false;
    }

    const wordCount = getWordCount(text);
    if (wordCount === 0) {
      return false;
    }

    if (shouldIgnoreAsParagraph(text, wordCount)) {
      return false;
    }

    const isShortSelection = wordCount >= 1 && wordCount <= 3;
    if (isShortSelection) {
      return true;
    }

    return source === "dblclick";
  }

  function getCurrentSelectionText() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return "";
    }

    return normalizeSelectionText(selection.toString());
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

    setSelectionText(selectedText);

    const selectionRect = getSelectionRect();
    if (!selectionRect) {
      hidePopup();
      return;
    }

    const { x, y } = computePopupPosition(selectionRect);
    showPopupAt(x, y);
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
    createPopupNode,
    setSelectionText,
    showPopupAt,
    hidePopup,
    normalizeSelectionText,
    shouldShowSelection,
    getSelectionRect,
    computePopupPosition,
  };

  createPopupNode();
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("dblclick", onDoubleClick);
})();
