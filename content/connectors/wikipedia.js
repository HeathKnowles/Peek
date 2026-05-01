(() => {
  const connectors = window.PeekConnectors || (window.PeekConnectors = {});
  const utils = connectors.utils;
  if (!utils) {
    return;
  }

  const { trimText, normalizeInline, stripHtmlTags } = utils;

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

      const disambiguationCandidates = searchResults
        .slice(0, 5)
        .map((item) => {
          const title = normalizeInline(item?.title);
          return {
            title,
            snippet: trimText(stripHtmlTags(item?.snippet), 120),
            url: toWikipediaUrl(title),
          };
        })
        .filter((item) => item.title && item.url);

      if (directSummary && !isDisambiguationSummary(directSummary.summary)) {
        const disambiguationLines = disambiguationCandidates
          .filter((item) => item.title !== directSummary.title)
          .slice(0, 4)
          .map((item, index) => `${index + 1}. ${item.title}${item.snippet ? ` - ${item.snippet}` : ""}`);

        const details =
          disambiguationLines.length > 0
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

          const details =
            disambiguationLines.length > 0
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

      const concreteOptions = candidateSummaries.slice(0, 3).map((item, index) => `${index + 1}. ${item.title} - ${trimText(item.summary, 120)}`);
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

  connectors.fetchWikipediaSummary = fetchWikipediaSummary;
})();
