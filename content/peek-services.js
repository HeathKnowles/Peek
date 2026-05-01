(() => {
  function toResultSourceLabel(result, fallback) {
    return result?.source || fallback;
  }

  function dedupeLinks(links, limit = 8) {
    const uniqueLinks = [];
    const seen = new Set();

    for (let i = 0; i < links.length; i += 1) {
      const item = links[i];
      if (!item?.url || seen.has(item.url)) {
        continue;
      }

      seen.add(item.url);
      uniqueLinks.push(item);
      if (uniqueLinks.length >= limit) {
        break;
      }
    }

    return uniqueLinks;
  }

  async function fetchSelectionInsights(text) {
    const connectors = window.PeekConnectors || {};
    const {
      fetchGoogleFormPeek,
      fetchWikipediaSummary,
      fetchWiktionaryDefinition,
      fetchDuckDuckGoInstantAnswer,
      fetchStackOverflowTermInsight,
    } = connectors;

    if (
      typeof fetchWikipediaSummary !== "function" ||
      typeof fetchWiktionaryDefinition !== "function" ||
      typeof fetchDuckDuckGoInstantAnswer !== "function" ||
      typeof fetchStackOverflowTermInsight !== "function"
    ) {
      return {
        ok: false,
        source: "peek",
        message: "Peek connectors are unavailable.",
      };
    }

    if (typeof fetchGoogleFormPeek === "function") {
      const googleFormResult = await fetchGoogleFormPeek(text);
      if (googleFormResult?.isGoogleForm) {
        if (googleFormResult.ok) {
          return {
            ok: true,
            source: toResultSourceLabel(googleFormResult, "google-forms"),
            message: googleFormResult.message,
            links: googleFormResult.links || [],
          };
        }

        return {
          ok: false,
          source: "google-forms",
          message: googleFormResult.message,
        };
      }
    }

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

    return {
      ok: true,
      source: "combined",
      message: parts.join("\n\n"),
      links: dedupeLinks(links),
    };
  }

  window.PeekServices = {
    fetchSelectionInsights,
  };
})();
