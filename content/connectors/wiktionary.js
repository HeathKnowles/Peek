(() => {
  const connectors = window.PeekConnectors || (window.PeekConnectors = {});
  const utils = connectors.utils;
  if (!utils) {
    return;
  }

  const { trimText, normalizeInline, cleanTextForMessage } = utils;

  async function fetchWiktionaryDefinition(text) {
    const words = text.split(" ").filter(Boolean);
    if (words.length !== 1) {
      return { ok: false, message: "Wiktionary works best with one word." };
    }

    const word = words[0];
    const endpoint = `https://en.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&redirects=1&titles=${encodeURIComponent(word)}&format=json&origin=*`;

    try {
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        return { ok: false, message: "Wiktionary result unavailable." };
      }

      const data = await response.json();
      const pages = data?.query?.pages || {};
      const firstPage = Object.values(pages)[0];
      const title = normalizeInline(firstPage?.title) || word;
      const extract = cleanTextForMessage(firstPage?.extract);
      if (!extract) {
        return { ok: false, message: "No Wiktionary definition found." };
      }

      const firstLines = extract
        .split("\n")
        .map((line) => normalizeInline(line))
        .filter(Boolean)
        .slice(0, 4)
        .join("\n");

      return {
        ok: true,
        title,
        message: trimText(firstLines || extract, 420),
        links: [
          {
            label: `Wiktionary: ${title}`,
            url: `https://en.wiktionary.org/wiki/${encodeURIComponent(title)}`,
          },
        ],
      };
    } catch {
      return { ok: false, message: "Wiktionary request failed." };
    }
  }

  connectors.fetchWiktionaryDefinition = fetchWiktionaryDefinition;
})();
