(() => {
  const connectors = window.PeekConnectors || (window.PeekConnectors = {});

  function trimText(text, maxLength) {
    if (!text) {
      return "";
    }

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 3)}...`;
  }

  function normalizeInline(text) {
    if (!text) {
      return "";
    }

    return text.replace(/\s+/g, " ").trim();
  }

  function stripHtmlTags(text) {
    if (!text) {
      return "";
    }

    return normalizeInline(text.replace(/<[^>]*>/g, " "));
  }

  function cleanTextForMessage(text) {
    if (!text) {
      return "";
    }

    return normalizeInline(stripHtmlTags(text));
  }

  function decodeHtmlEntities(text) {
    if (!text) {
      return "";
    }

    const element = document.createElement("textarea");
    element.innerHTML = text;
    return normalizeInline(element.value);
  }

  connectors.utils = {
    trimText,
    normalizeInline,
    stripHtmlTags,
    cleanTextForMessage,
    decodeHtmlEntities,
  };
})();
