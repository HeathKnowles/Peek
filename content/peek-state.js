(() => {
  function createState() {
    return {
      isVisible: false,
      currentSelectionText: "",
      selectionToken: 0,
      actionToken: 0,
      triggerTimerId: null,
      renderToken: 0,
      renderUrl: "",
      popupEl: null,
      headerEl: null,
      actionsEl: null,
      renderContainerEl: null,
      renderImageEl: null,
      loadingTimerId: null,
      searchButtonEl: null,
      copyButtonEl: null,
    };
  }

  window.PeekState = {
    createState,
  };
})();
