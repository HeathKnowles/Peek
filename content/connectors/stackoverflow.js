(() => {
  const connectors = window.PeekConnectors || (window.PeekConnectors = {});
  const utils = connectors.utils;
  if (!utils) {
    return;
  }

  const { trimText, cleanTextForMessage } = utils;

  async function fetchStackOverflowTermInsight(text) {
    if (!text) {
      return { ok: false, message: "No text selected." };
    }

    const endpoint = `https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${encodeURIComponent(text)}&site=stackoverflow&pagesize=3`;

    try {
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        return { ok: false, message: "Stack Overflow result unavailable." };
      }

      const data = await response.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) {
        return { ok: false, message: "No Stack Overflow matches found." };
      }

      const lines = [];
      const links = [];
      for (let i = 0; i < items.length && lines.length < 2; i += 1) {
        const item = items[i];
        const title = cleanTextForMessage(item?.title);
        const excerpt = cleanTextForMessage(item?.excerpt || item?.body);
        if (!title || !excerpt) {
          continue;
        }

        lines.push(`${lines.length + 1}. ${title} - ${trimText(excerpt, 170)}`);
        if (item?.link) {
          links.push({
            label: `Stack Overflow: ${trimText(title, 56)}`,
            url: item.link,
          });
        }
      }

      if (lines.length === 0) {
        return { ok: false, message: "No Stack Overflow matches found." };
      }

      return {
        ok: true,
        message: lines.join("\n"),
        links,
      };
    } catch {
      return { ok: false, message: "Stack Overflow request failed." };
    }
  }

  connectors.fetchStackOverflowTermInsight = fetchStackOverflowTermInsight;
})();
