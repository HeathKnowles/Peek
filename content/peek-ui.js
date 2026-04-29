(() => {
  function createActionButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.className = "peek-action-btn";
    return button;
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

      .peek-render-container {
        margin-top: 10px;
        display: none;
      }

      .peek-render-image {
        width: 100%;
        display: block;
        border-radius: 10px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        object-fit: contain;
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

    const renderContainer = document.createElement("div");
    renderContainer.className = "peek-render-container";

    const renderImage = document.createElement("img");
    renderImage.className = "peek-render-image";
    renderImage.alt = "Peek result";

    renderContainer.append(renderImage);
    popup.append(header, actions, renderContainer);
    document.documentElement.appendChild(popup);

    state.popupEl = popup;
    state.headerEl = header;
    state.actionsEl = actions;
    state.renderContainerEl = renderContainer;
    state.renderImageEl = renderImage;
    state.searchButtonEl = null;
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
    const controls = [state.searchButtonEl, state.copyButtonEl];
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

  function showImage(state, imageUrl) {
    if (!state.renderContainerEl || !state.renderImageEl) {
      return;
    }

    clearLoadingTimer(state);
    
    // Clear any previous content and show the image
    state.renderContainerEl.replaceChildren(state.renderImageEl);
    state.renderContainerEl.style.display = "block";
    state.renderImageEl.src = imageUrl;
    
    // Handle image loading errors
    state.renderImageEl.onerror = function() {
      const errorElement = document.createElement("div");
      errorElement.style.padding = "10px";
      errorElement.style.backgroundColor = "#fef2f2";
      errorElement.style.borderRadius = "8px";
      errorElement.style.border = "1px solid rgba(239, 68, 68, 0.28)";
      errorElement.style.fontSize = "12px";
      errorElement.style.lineHeight = "1.4";
      errorElement.style.color = "#dc2626";
      errorElement.style.marginTop = "8px";
      errorElement.textContent = "Could not load image";
      state.renderContainerEl.replaceChildren(errorElement);
    };
  }

  function tryRenderImageFromText(state, text) {
    if (!text) {
      return false;
    }

    let url;
    try {
      url = new URL(text.trim());
    } catch {
      return false;
    }

    // Check if URL looks like an image based on extension
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.ico'];
    const lowerUrl = url.toString().toLowerCase();
    const isLikelyImage = imageExtensions.some(ext => lowerUrl.endsWith(ext));
    
    if (!isLikelyImage) {
      return false;
    } else {
      showImage(state, url.toString());
    }
    return true;
  }

  function resetResult(state) {
    if (!state.renderContainerEl || !state.renderImageEl) {
      return;
    }

    state.renderContainerEl.style.display = "none";
    state.renderImageEl.src = "";
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
    if (!state.renderContainerEl || !state.renderImageEl) {
      return;
    }
    
    // Clear loading timer
    clearLoadingTimer(state);
    
    // Create a simple text display
    // Create a text element to show the result
    const textElement = document.createElement("div");
    textElement.style.padding = "10px";
    textElement.style.backgroundColor = "#f8fafc";
    textElement.style.borderRadius = "8px";
    textElement.style.border = "1px solid rgba(148, 163, 184, 0.28)";
    textElement.style.fontSize = "12px";
    textElement.style.lineHeight = "1.4";
    textElement.style.color = "#0f172a";
    textElement.style.marginTop = "8px";
    textElement.textContent = text || "No result";
    
    // Clear any previous content and add the text
    state.renderContainerEl.replaceChildren(textElement);
    state.renderContainerEl.style.display = "block";
  }

  function showLoadingState(state, source) {
    if (!state.renderContainerEl || !state.renderImageEl) {
      return;
    }
    
    // Create a loading indicator
    const loadingElement = document.createElement("div");
    loadingElement.style.padding = "10px";
    loadingElement.style.backgroundColor = "#f8fafc";
    loadingElement.style.borderRadius = "8px";
    loadingElement.style.border = "1px solid rgba(148, 163, 184, 0.28)";
    loadingElement.style.fontSize = "12px";
    loadingElement.style.lineHeight = "1.4";
    loadingElement.style.color = "#0f172a";
    loadingElement.style.marginTop = "8px";
    loadingElement.textContent = "Loading...";
    
    // Clear any previous content and add the loading indicator
    state.renderContainerEl.replaceChildren(loadingElement);
    state.renderContainerEl.style.display = "block";
  }

  function scheduleLoadingState(state, source, token) {
    clearLoadingTimer(state);
    state.loadingTimerId = window.setTimeout(() => {
      if (token !== state.selectionToken || !state.isVisible) {
        return;
      }

      showLoadingState(state, source);
    }, 160);
  }

  // Export the PeekUI object
  window.PeekUI = {
    ensurePopupStyles,
    createPopupNode,
    clearLoadingTimer,
    setSelectionText,
    showPopupAt,
    resetResult,
    hidePopup,
    setResult,
    showLoadingState,
    scheduleLoadingState,
    tryRenderImageFromText,
  };
})();
