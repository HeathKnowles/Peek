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
    if (directSummary && !isDisambiguationSummary(directSummary.summary)) {
      return {
        ok: true,
        title: directSummary.title,
        message: directSummary.summary,
      };
    }

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
          return {
            ok: true,
            title: summaryFromSearch.title,
            message: summaryFromSearch.summary,
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

      return {
        ok: true,
        title: text,
        message: `Possible meanings:\n${concreteOptions.join("\n")}`,
      };
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
      const meanings = Array.isArray(entry?.meanings) ? entry.meanings : [];
      if (meanings.length === 0) {
        return { ok: false, message: "No dictionary definition found." };
      }

      const topMeanings = meanings.slice(0, 3);
      const formattedMeaningLines = [];

      for (let i = 0; i < topMeanings.length; i += 1) {
        const meaning = topMeanings[i];
        const partOfSpeech = normalizeInline(meaning?.partOfSpeech) || "meaning";
        const definitions = Array.isArray(meaning?.definitions) ? meaning.definitions : [];
        const topDefinitions = definitions
          .map((item) => normalizeInline(item?.definition))
          .filter(Boolean)
          .slice(0, 2);

        if (topDefinitions.length === 0) {
          continue;
        }

        const joinedDefinitions = topDefinitions.join("; ");
        formattedMeaningLines.push(`${i + 1}. (${partOfSpeech}) ${joinedDefinitions}`);
      }

      if (formattedMeaningLines.length === 0) {
        return { ok: false, message: "No dictionary definition found." };
      }

      const pronunciation = normalizeInline(entry?.phonetic || entry?.phonetics?.[0]?.text);
      const prefix = pronunciation ? `Pronunciation: ${pronunciation}\n` : "";
      const fullText = `${prefix}${formattedMeaningLines.join("\n")}`;

      return {
        ok: true,
        message: trimText(fullText, 520),
      };
    } catch {
      return { ok: false, message: "Dictionary request failed." };
    }
  }

  async function fetchSelectionInsights(text) {
    const [wikiResult, dictionaryResult] = await Promise.all([
      fetchWikipediaSummary(text),
      fetchDictionaryDefinition(text),
    ]);

    if (!wikiResult.ok && !dictionaryResult.ok) {
      return {
        ok: false,
        source: "wikipedia",
        message: wikiResult.message || dictionaryResult.message,
      };
    }

    const parts = [];
    if (wikiResult.ok) {
      const titlePrefix = wikiResult.title ? `${wikiResult.title}\n` : "";
      parts.push(`${titlePrefix}${wikiResult.message}`);
    }

    if (dictionaryResult.ok) {
      parts.push(`${dictionaryResult.message}`);
    }

    return {
      ok: true,
      source: dictionaryResult.ok ? "combined" : "wikipedia",
      message: parts.join("\n\n"),
    };
  }

  window.PeekServices = {
    fetchWikipediaSummary,
    fetchDictionaryDefinition,
    fetchSelectionInsights,
  };
})();
