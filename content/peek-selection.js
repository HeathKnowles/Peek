(() => {
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

  function computePopupPosition(popupEl, selectionRect) {
    const gap = 8;
    const viewportPadding = 8;

    const previousDisplay = popupEl.style.display;
    const previousVisibility = popupEl.style.visibility;
    popupEl.style.visibility = "hidden";
    popupEl.style.display = "block";
    const popupRect = popupEl.getBoundingClientRect();
    popupEl.style.display = previousDisplay;
    popupEl.style.visibility = previousVisibility;

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

  window.PeekSelection = {
    shouldShowSelection,
    getCurrentSelectionText,
    getSelectionRect,
    computePopupPosition,
  };
})();
