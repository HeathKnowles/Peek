(() => {
  function createState() {
    return {
      isVisible: false,
      currentSelectionText: "",
      selectionToken: 0,
      actionToken: 0,
      triggerTimerId: null,
      popupEl: null,
      headerEl: null,
      actionsEl: null,
      definitionEl: null,
      resultSourceEl: null,
      resultTextEl: null,
      resultLinksEl: null,
      skeletonEl: null,
      loadingTimerId: null,
      searchButtonEl: null,
      dictionaryButtonEl: null,
      copyButtonEl: null,
    };
  }

  window.PeekState = {
    createState,
  };
})();
