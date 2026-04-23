(() => {
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

  function toWikipediaUrl(title) {
    const normalized = normalizeInline(title).replace(/\s+/g, "_");
    if (!normalized) {
      return "";
    }

    return `https://en.wikipedia.org/wiki/${encodeURIComponent(normalized)}`;
  }

  function isDisambiguationSummary(text) {
    const value = normalizeInline(text).toLowerCase();
    if (!value) {
      return false;
    }

    return (
      value.includes("may refer to") ||
      value.includes("can refer to") ||
      value.includes("may stand for") ||
      value.includes("disambiguation")
    );
  }

  async function fetchWikipediaPageSummary(titleOrQuery) {
    const normalized = titleOrQuery.trim().replace(/\s+/g, "_");
    if (!normalized) {
      return null;
    }

    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(normalized)}`;
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const extract = data?.extract;
    const title = data?.title;
    if (!extract) {
      return null;
    }

    return {
      title: title || titleOrQuery,
      summary: trimText(extract, 380),
    };
  }

  async function fetchWikipediaSummary(text) {
    if (!text) {
      return { ok: false, message: "No text selected." };
    }

    const directSummary = await fetchWikipediaPageSummary(text);

    const endpoint = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(text)}&srlimit=5&format=json&origin=*`;

    try {
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        return { ok: false, message: "Wikipedia result unavailable." };
      }

      const data = await response.json();
      const searchResults = Array.isArray(data?.query?.search) ? data.query.search : [];
      if (searchResults.length === 0) {
        return { ok: false, message: "No Wikipedia summary found." };
      }

      const disambiguationCandidates = searchResults.slice(0, 5).map((item) => {
        const title = normalizeInline(item?.title);
        return {
          title,
          snippet: trimText(stripHtmlTags(item?.snippet), 120),
          url: toWikipediaUrl(title),
        };
      }).filter((item) => item.title && item.url);

      if (directSummary && !isDisambiguationSummary(directSummary.summary)) {
        const disambiguationLines = disambiguationCandidates
          .filter((item) => item.title !== directSummary.title)
          .slice(0, 4)
          .map((item, index) => `${index + 1}. ${item.title}${item.snippet ? ` - ${item.snippet}` : ""}`);

        const details = disambiguationLines.length > 0
          ? `${directSummary.summary}\n\nPossible disambiguations:\n${disambiguationLines.join("\n")}`
          : directSummary.summary;

        const links = [
          {
            label: `Wikipedia: ${directSummary.title}`,
            url: toWikipediaUrl(directSummary.title),
          },
          ...disambiguationCandidates
            .filter((item) => item.title !== directSummary.title)
            .slice(0, 4)
            .map((item) => ({
              label: `Alt: ${item.title}`,
              url: item.url,
            })),
        ];

        return {
          ok: true,
          title: directSummary.title,
          message: details,
          links,
        };
      }

      const candidateSummaries = [];
      for (let i = 0; i < searchResults.length; i += 1) {
        const title = searchResults[i]?.title;
        if (!title) {
          continue;
        }

        const summaryFromSearch = await fetchWikipediaPageSummary(title);
        if (!summaryFromSearch) {
          continue;
        }

        if (!isDisambiguationSummary(summaryFromSearch.summary)) {
          const links = [
            {
              label: `Wikipedia: ${summaryFromSearch.title}`,
              url: toWikipediaUrl(summaryFromSearch.title),
            },
            ...disambiguationCandidates
              .filter((item) => item.title !== summaryFromSearch.title)
              .slice(0, 4)
              .map((item) => ({
                label: `Alt: ${item.title}`,
                url: item.url,
              })),
          ];

          const disambiguationLines = disambiguationCandidates
            .filter((item) => item.title !== summaryFromSearch.title)
            .slice(0, 4)
            .map((item, index) => `${index + 1}. ${item.title}${item.snippet ? ` - ${item.snippet}` : ""}`);

          const details = disambiguationLines.length > 0
            ? `${summaryFromSearch.summary}\n\nPossible disambiguations:\n${disambiguationLines.join("\n")}`
            : summaryFromSearch.summary;

          return {
            ok: true,
            title: summaryFromSearch.title,
            message: details,
            links,
          };
        }

        candidateSummaries.push(summaryFromSearch);
      }

      if (candidateSummaries.length === 0) {
        return { ok: false, message: "No Wikipedia summary found." };
      }

      const concreteOptions = candidateSummaries.slice(0, 3).map((item, index) => {
        return `${index + 1}. ${item.title} - ${trimText(item.summary, 120)}`;
      });

      const links = candidateSummaries.slice(0, 5).map((item) => ({
        label: `Wikipedia: ${item.title}`,
        url: toWikipediaUrl(item.title),
      }));

      return {
        ok: true,
        title: text,
        message: `Possible meanings:\n${concreteOptions.join("\n")}`,
        links,
      };
    } catch {
      return { ok: false, message: "Wikipedia request failed." };
    }
  }

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

  async function fetchSelectionInsights(text) {
    const [wikiResult, wiktionaryResult, duckDuckGoResult, stackOverflowResult] = await Promise.all([
      fetchWikipediaSummary(text),
      fetchWiktionaryDefinition(text),
      fetchDuckDuckGoInstantAnswer(text),
      fetchStackOverflowTermInsight(text),
    ]);

    if (!wikiResult.ok && !wiktionaryResult.ok && !duckDuckGoResult.ok && !stackOverflowResult.ok) {
      return {
        ok: false,
        source: "wikipedia",
        message: wikiResult.message || wiktionaryResult.message || duckDuckGoResult.message || stackOverflowResult.message,
      };
    }

    const parts = [];
    const links = [];
    if (wikiResult.ok) {
      const titlePrefix = wikiResult.title ? `${wikiResult.title}\n` : "";
      parts.push(`Wikipedia\n${titlePrefix}${wikiResult.message}`);
      if (Array.isArray(wikiResult.links)) {
        links.push(...wikiResult.links);
      }
    }

    if (wiktionaryResult.ok) {
      parts.push(`Wiktionary\n${wiktionaryResult.message}`);
      if (Array.isArray(wiktionaryResult.links)) {
        links.push(...wiktionaryResult.links);
      }
    }

    if (duckDuckGoResult.ok) {
      parts.push(`DuckDuckGo Instant Answer\n${duckDuckGoResult.message}`);
      if (Array.isArray(duckDuckGoResult.links)) {
        links.push(...duckDuckGoResult.links);
      }
    }

    if (stackOverflowResult.ok) {
      parts.push(`Stack Overflow\n${stackOverflowResult.message}`);
      if (Array.isArray(stackOverflowResult.links)) {
        links.push(...stackOverflowResult.links);
      }
    }

    const uniqueLinks = [];
    const seen = new Set();
    for (let i = 0; i < links.length; i += 1) {
      const item = links[i];
      if (!item?.url || seen.has(item.url)) {
        continue;
      }

      seen.add(item.url);
      uniqueLinks.push(item);
    }

    return {
      ok: true,
      source: "combined",
      message: parts.join("\n\n"),
      links: uniqueLinks.slice(0, 8),
    };
  }

  window.PeekServices = {
    fetchWikipediaSummary,
    fetchWiktionaryDefinition,
    fetchDuckDuckGoInstantAnswer,
    fetchStackOverflowTermInsight,
    fetchSelectionInsights,
  };
})();
