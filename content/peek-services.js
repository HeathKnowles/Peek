(() => {
  async function fetchWikipediaSummary(text) {
    if (!text) {
      return { ok: false, message: "No text selected." };
    }

    const endpoint = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(text)}&limit=1&namespace=0&format=json&origin=*`;

    try {
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        return { ok: false, message: "Wikipedia result unavailable." };
      }

      const data = await response.json();
      const titles = Array.isArray(data?.[1]) ? data[1] : [];
      const descriptions = Array.isArray(data?.[2]) ? data[2] : [];
      const title = titles[0];
      const description = descriptions[0];

      if (!title && !description) {
        return { ok: false, message: "No Wikipedia summary found." };
      }

      const summary = description || `Wikipedia article found: ${title}`;
      const shortSummary = summary.length > 160 ? `${summary.slice(0, 157)}...` : summary;
      return { ok: true, message: shortSummary };
    } catch {
      return { ok: false, message: "Wikipedia request failed." };
    }
  }

  async function fetchDictionaryDefinition(text) {
    const words = text.split(" ").filter(Boolean);
    if (words.length !== 1) {
      return { ok: false, message: "Dictionary works best with one word." };
    }

    const word = words[0];
    const endpoint = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;

    try {
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        return { ok: false, message: "Dictionary result unavailable." };
      }

      const data = await response.json();
      const entry = Array.isArray(data) ? data[0] : null;
      const meaning = entry?.meanings?.[0];
      const definition = meaning?.definitions?.[0]?.definition;

      if (!definition) {
        return { ok: false, message: "No dictionary definition found." };
      }

      const shortDefinition = definition.length > 140 ? `${definition.slice(0, 137)}...` : definition;
      return { ok: true, message: shortDefinition };
    } catch {
      return { ok: false, message: "Dictionary request failed." };
    }
  }

  window.PeekServices = {
    fetchWikipediaSummary,
    fetchDictionaryDefinition,
  };
})();
