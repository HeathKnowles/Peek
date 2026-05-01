(() => {
  const connectors = window.PeekConnectors || (window.PeekConnectors = {});
  const utils = connectors.utils;
  if (!utils) {
    return;
  }

  const { trimText, cleanTextForMessage } = utils;

  function getDuckDuckGoText(data) {
    const abstractText = cleanTextForMessage(data?.AbstractText);
    if (abstractText) {
      return abstractText;
    }

    const definition = cleanTextForMessage(data?.Definition);
    if (definition) {
      return definition;
    }

    const answer = cleanTextForMessage(data?.Answer);
    if (answer) {
      return answer;
    }

    const relatedTopics = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
    const flattened = [];
    for (let i = 0; i < relatedTopics.length; i += 1) {
      const topic = relatedTopics[i];
      if (topic?.Text) {
        flattened.push(cleanTextForMessage(topic.Text));
        continue;
      }

      const nested = Array.isArray(topic?.Topics) ? topic.Topics : [];
      for (let j = 0; j < nested.length; j += 1) {
        const itemText = cleanTextForMessage(nested[j]?.Text);
        if (itemText) {
          flattened.push(itemText);
        }
      }
    }

    return flattened.slice(0, 2).join("\n") || "";
  }

  async function fetchDuckDuckGoInstantAnswer(text) {
    if (!text) {
      return { ok: false, message: "No text selected." };
    }

    const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(text)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;

    try {
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        return { ok: false, message: "DuckDuckGo result unavailable." };
      }

      const data = await response.json();
      const message = getDuckDuckGoText(data);
      if (!message) {
        return { ok: false, message: "No DuckDuckGo instant answer found." };
      }

      const links = [];
      if (data?.AbstractURL) {
        links.push({ label: "DuckDuckGo source", url: data.AbstractURL });
      }
      links.push({ label: "DuckDuckGo search", url: `https://duckduckgo.com/?q=${encodeURIComponent(text)}` });

      return {
        ok: true,
        message: trimText(message, 360),
        links,
      };
    } catch {
      return { ok: false, message: "DuckDuckGo request failed." };
    }
  }

  connectors.fetchDuckDuckGoInstantAnswer = fetchDuckDuckGoInstantAnswer;
})();
