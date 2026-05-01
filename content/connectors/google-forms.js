(() => {
  const connectors = window.PeekConnectors || (window.PeekConnectors = {});
  const utils = connectors.utils;
  if (!utils) {
    return;
  }

  const { trimText, normalizeInline, decodeHtmlEntities } = utils;

  function extractGoogleFormUrl(text) {
    if (!text) {
      return null;
    }

    const candidate = text.trim().replace(/^<|>$/g, "");
    let parsedUrl;
    try {
      parsedUrl = new URL(candidate);
    } catch {
      return null;
    }

    if (parsedUrl.hostname !== "docs.google.com") {
      return null;
    }

    const pathMatch = parsedUrl.pathname.match(/^\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
    if (!pathMatch) {
      return null;
    }

    let fetchPath = parsedUrl.pathname;
    const isPublicFormPath = /^\/forms\/d\/e\//.test(parsedUrl.pathname);
    if (isPublicFormPath) {
      if (fetchPath.endsWith("/edit")) {
        fetchPath = fetchPath.replace(/\/edit$/, "/viewform");
      } else if (!fetchPath.endsWith("/viewform")) {
        fetchPath = `${fetchPath.replace(/\/$/, "")}/viewform`;
      }
    }

    return {
      formId: pathMatch[1],
      url: `${parsedUrl.origin}${fetchPath}${parsedUrl.search}`,
    };
  }

  function extractMetaItemPropContent(html, itemProp) {
    if (!html || !itemProp) {
      return "";
    }

    const pattern = new RegExp(`<meta[^>]*itemprop=["']${itemProp}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
    const match = html.match(pattern);
    return decodeHtmlEntities(match?.[1] || "");
  }

  function extractJsonArraySlice(text, startIndex) {
    if (!text || startIndex < 0 || startIndex >= text.length || text[startIndex] !== "[") {
      return "";
    }

    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let i = startIndex; i < text.length; i += 1) {
      const char = text[i];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === "\\") {
          isEscaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, i + 1);
        }
      }
    }

    return "";
  }

  function extractGoogleFormPayload(html) {
    if (!html) {
      return null;
    }

    const markers = ["FB_PUBLIC_LOAD_DATA_", "FB_InlineRegister"];
    for (let i = 0; i < markers.length; i += 1) {
      const marker = markers[i];
      const markerIndex = html.indexOf(marker);
      if (markerIndex < 0) {
        continue;
      }

      const arrayStart = html.indexOf("[", markerIndex);
      if (arrayStart < 0) {
        continue;
      }

      const jsonSlice = extractJsonArraySlice(html, arrayStart);
      if (!jsonSlice) {
        continue;
      }

      try {
        return JSON.parse(jsonSlice);
      } catch {
        continue;
      }
    }

    return null;
  }

  function looksLikeGoogleFormNode(node) {
    return (
      Array.isArray(node) &&
      typeof node[1] === "string" &&
      typeof node[3] === "number" &&
      node[1].trim().length > 0 &&
      node[1].trim().length < 240
    );
  }

  function collectQuestionNodes(root) {
    const foundNodes = [];
    const seenNodeKeys = new Set();

    function visit(node) {
      if (!Array.isArray(node)) {
        return;
      }

      if (looksLikeGoogleFormNode(node)) {
        const nodeKey = `${node[0]}::${node[1]}::${node[3]}`;
        if (!seenNodeKeys.has(nodeKey)) {
          seenNodeKeys.add(nodeKey);
          foundNodes.push(node);
        }
      }

      for (let i = 0; i < node.length; i += 1) {
        if (Array.isArray(node[i])) {
          visit(node[i]);
        }
      }
    }

    visit(root);
    return foundNodes;
  }

  function findLikelyItemsArray(formPayload) {
    if (!Array.isArray(formPayload)) {
      return [];
    }

    const directCandidates = [
      formPayload?.[1]?.[1],
      formPayload?.[1]?.[0],
      formPayload?.[0],
      formPayload,
    ];

    let bestCandidate = [];
    let bestScore = 0;

    for (let i = 0; i < directCandidates.length; i += 1) {
      const candidate = directCandidates[i];
      if (!Array.isArray(candidate)) {
        continue;
      }

      const score = collectQuestionNodes(candidate).length;
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (bestScore > 0) {
      return bestCandidate;
    }

    return formPayload;
  }

  function collectQuestionOptions(node) {
    const options = [];
    const seen = new Set();

    function pushOption(value) {
      if (typeof value !== "string") {
        return;
      }

      const normalized = normalizeInline(value);
      if (!normalized || normalized.length > 120 || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      options.push(normalized);
    }

    function visit(value, depth) {
      if (!Array.isArray(value) || depth > 7) {
        return;
      }

      if (
        typeof value[0] === "string" &&
        value[0].trim() &&
        value.slice(1).every((item) => item === null || typeof item === "number" || typeof item === "boolean" || typeof item === "string")
      ) {
        pushOption(value[0]);
      }

      for (let i = 0; i < value.length; i += 1) {
        if (Array.isArray(value[i])) {
          visit(value[i], depth + 1);
        }
      }
    }

    visit(node?.[4], 0);
    return options;
  }

  function isQuestionRequired(node) {
    const requiredFlag = node?.[4]?.[0]?.[2];
    return requiredFlag === 1 || requiredFlag === true;
  }

  function hasBranchingMetadata(pageBreakNode) {
    const routing = pageBreakNode?.[4];
    if (!Array.isArray(routing)) {
      return false;
    }

    for (let i = 0; i < routing.length; i += 1) {
      const value = routing[i];
      if (!Array.isArray(value)) {
        continue;
      }

      for (let j = 0; j < value.length; j += 1) {
        if (typeof value[j] === "number" && value[j] > 0) {
          return true;
        }
      }
    }

    return false;
  }

  function buildGoogleFormSchema(formPayload, html, formUrl) {
    const title = extractMetaItemPropContent(html, "name") || "Untitled form";
    const description = extractMetaItemPropContent(html, "description");
    const itemsRoot = findLikelyItemsArray(formPayload);
    const questionNodes = collectQuestionNodes(itemsRoot);

    const pages = [{ pageNumber: 1, questions: [] }];
    let currentPageIndex = 0;
    let containsBranching = false;

    for (let i = 0; i < questionNodes.length; i += 1) {
      const node = questionNodes[i];
      const type = node?.[3];

      if (type === 14) {
        if (hasBranchingMetadata(node)) {
          containsBranching = true;
        }
        currentPageIndex += 1;
        pages.push({
          pageNumber: currentPageIndex + 1,
          questions: [],
        });
        continue;
      }

      if (typeof type !== "number") {
        continue;
      }

      pages[currentPageIndex].questions.push({
        title: normalizeInline(node?.[1]) || "Untitled question",
        type,
        required: isQuestionRequired(node),
        options: collectQuestionOptions(node),
      });
    }

    return {
      title,
      description,
      totalSteps: pages.length,
      pages,
      containsBranching,
      url: formUrl,
    };
  }

  function formatGoogleFormPeek(schema) {
    const lines = [];
    lines.push("Google Forms");
    lines.push(`Title: ${schema.title || "Untitled form"}`);
    if (schema.description) {
      lines.push(`Description: ${trimText(schema.description, 160)}`);
    }
    lines.push(`Steps: ${schema.totalSteps || 1} | Branching: ${schema.containsBranching ? "Yes" : "No"}`);

    const pageLimit = Math.min(schema.pages.length, 3);
    for (let i = 0; i < pageLimit; i += 1) {
      const page = schema.pages[i];
      const questions = Array.isArray(page?.questions) ? page.questions : [];
      lines.push("");
      lines.push(`Page ${page.pageNumber}`);
      if (questions.length === 0) {
        lines.push("- No questions");
        continue;
      }

      const questionLimit = Math.min(questions.length, 5);
      for (let j = 0; j < questionLimit; j += 1) {
        const question = questions[j];
        const requiredLabel = question.required ? ", required" : "";
        lines.push(`${j + 1}. ${trimText(question.title, 88)} (Type ${question.type}${requiredLabel})`);
        if (Array.isArray(question.options) && question.options.length > 0) {
          lines.push(`   Options: ${trimText(question.options.slice(0, 4).join(" | "), 120)}`);
        }
      }
    }

    return lines.join("\n");
  }

  async function fetchGoogleFormPeek(text) {
    const parsedUrl = extractGoogleFormUrl(text);
    if (!parsedUrl) {
      return { isGoogleForm: false };
    }

    try {
      const response = await fetch(parsedUrl.url, {
        method: "GET",
        credentials: "omit",
      });

      if (!response.ok) {
        return {
          isGoogleForm: true,
          ok: false,
          source: "google-forms",
          message: "Google Form preview unavailable.",
        };
      }

      const html = await response.text();
      const formPayload = extractGoogleFormPayload(html);
      const isRestricted = html.includes("ServiceLogin") || html.includes("accounts.google.com");

      if (!formPayload && isRestricted) {
        return {
          isGoogleForm: true,
          ok: false,
          source: "google-forms",
          message: "Google Form is private or requires sign-in.",
        };
      }

      const schema = buildGoogleFormSchema(formPayload, html, parsedUrl.url);
      return {
        isGoogleForm: true,
        ok: true,
        source: "google-forms",
        message: formatGoogleFormPeek(schema),
        links: [
          {
            label: "Open Google Form",
            url: parsedUrl.url,
          },
        ],
      };
    } catch {
      return {
        isGoogleForm: true,
        ok: false,
        source: "google-forms",
        message: "Google Form request failed.",
      };
    }
  }

  connectors.fetchGoogleFormPeek = fetchGoogleFormPeek;
})();
