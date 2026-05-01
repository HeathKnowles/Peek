(() => {
  const connectors = window.PeekConnectors || (window.PeekConnectors = {});
  const utils = connectors.utils;
  if (!utils) {
    return;
  }

  const { trimText, normalizeInline, decodeHtmlEntities, fetchText } = utils;

  function parseUrl(text) {
    if (!text || typeof text !== "string") {
      return null;
    }

    const candidate = text.trim().replace(/^<|>$/g, "");
    try {
      return new URL(candidate);
    } catch {
      return null;
    }
  }

  function resolveGoogleSearchRedirectUrl(text) {
    const parsedUrl = parseUrl(text);
    if (!parsedUrl) {
      return "";
    }

    const isGoogleDomain = /(^|\.)google\.[a-z.]+$/i.test(parsedUrl.hostname);
    if (!isGoogleDomain || parsedUrl.pathname !== "/url") {
      return "";
    }

    return parsedUrl.searchParams.get("q") || parsedUrl.searchParams.get("url") || parsedUrl.searchParams.get("adurl") || "";
  }

  function resolveGenericRedirectUrl(text) {
    const parsedUrl = parseUrl(text);
    if (!parsedUrl) {
      return "";
    }

    const keys = ["u", "url", "q", "target", "dest", "redirect"];
    for (let i = 0; i < keys.length; i += 1) {
      const value = parsedUrl.searchParams.get(keys[i]);
      if (value && /^https?:\/\//i.test(value)) {
        return value;
      }
    }

    return "";
  }

  function normalizeGoogleFormPath(pathname) {
    let fetchPath = pathname;
    const isPublicFormPath = /^\/forms\/d\/e\//.test(pathname);
    if (isPublicFormPath) {
      if (fetchPath.endsWith("/edit")) {
        fetchPath = fetchPath.replace(/\/edit$/, "/viewform");
      } else if (!fetchPath.endsWith("/viewform")) {
        fetchPath = `${fetchPath.replace(/\/$/, "")}/viewform`;
      }
    }
    return fetchPath;
  }

  function extractGoogleFormUrl(text) {
    const parsedUrl = parseUrl(text);
    if (!parsedUrl || parsedUrl.hostname !== "docs.google.com") {
      return null;
    }

    const pathMatch = parsedUrl.pathname.match(/^\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
    if (!pathMatch) {
      return null;
    }

    const fetchPath = normalizeGoogleFormPath(parsedUrl.pathname);
    return {
      formId: pathMatch[1],
      url: `${parsedUrl.origin}${fetchPath}${parsedUrl.search}`,
    };
  }

  function decodeEscapedUrl(value) {
    if (!value) {
      return "";
    }

    return value
      .replace(/\\u003d/g, "=")
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/");
  }

  function sanitizeUrlCandidate(value) {
    if (!value) {
      return "";
    }

    return decodeEscapedUrl(value)
      .split(/(?:&quot;|&lt;|["'<\s])/i)[0]
      .trim();
  }

  function extractFormUrlFromSiteHtml(html) {
    if (!html) {
      return null;
    }

    const directUrlMatch = html.match(/https:\/\/docs\.google\.com\/forms\/d\/(?:e\/)?[a-zA-Z0-9_-]+(?:\/(?:viewform|edit))?(?:\?[^"'<>\\\s]*)?/i);
    if (directUrlMatch?.[0]) {
      const normalized = sanitizeUrlCandidate(directUrlMatch[0]);
      return extractGoogleFormUrl(normalized) || null;
    }

    const encodedMatch = html.match(/https:\\\/\\\/docs\.google\.com\\\/forms\\\/d\\\/(?:e\\\/)?[a-zA-Z0-9_-]+(?:\\\/(?:viewform|edit))?(?:\\\?[^"'<>\\\s]*)?/i);
    if (encodedMatch?.[0]) {
      const normalized = sanitizeUrlCandidate(encodedMatch[0]);
      return extractGoogleFormUrl(normalized) || null;
    }

    return null;
  }

  async function resolveGoogleFormTarget(text) {
    const redirected = resolveGoogleSearchRedirectUrl(text) || resolveGenericRedirectUrl(text);
    const normalizedText = redirected || text;

    const directForm = extractGoogleFormUrl(normalizedText);
    if (directForm) {
      return {
        isGoogleForm: true,
        formTarget: directForm,
      };
    }

    const parsedUrl = parseUrl(normalizedText);
    if (!parsedUrl) {
      return { isGoogleForm: false };
    }

    if (parsedUrl.hostname !== "sites.google.com") {
      return { isGoogleForm: false };
    }

    try {
      const response = await fetchText(parsedUrl.toString(), 20000, { backgroundOnly: true });
      if (!response.ok) {
        const bridgeError = (response?.error || "").toLowerCase();
        const message = bridgeError.includes("receiving end")
          ? "Peek background worker is not connected. Reload the extension and retry."
          : "Google Sites page is unavailable.";
        return {
          isGoogleForm: true,
          errorMessage: message,
        };
      }

      const html = response.text;
      const formTarget = extractFormUrlFromSiteHtml(html);
      if (!formTarget) {
        return {
          isGoogleForm: true,
          errorMessage: "No Google Form found in this Google Sites page.",
        };
      }

      return {
        isGoogleForm: true,
        formTarget,
      };
    } catch {
      return {
        isGoogleForm: true,
        errorMessage: "Google Sites request failed.",
      };
    }
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
    const resolved = await resolveGoogleFormTarget(text);
    if (!resolved.isGoogleForm) {
      return { isGoogleForm: false };
    }

    if (!resolved.formTarget) {
      return {
        isGoogleForm: true,
        ok: false,
        source: "google-forms",
        message: resolved.errorMessage || "Google Form preview unavailable.",
      };
    }

    try {
      const response = await fetchText(resolved.formTarget.url, 20000, { backgroundOnly: true });
      if (!response.ok) {
        const bridgeError = (response?.error || "").toLowerCase();
        const message = bridgeError.includes("receiving end")
          ? "Peek background worker is not connected. Reload the extension and retry."
          : "Google Form preview unavailable.";
        return {
          isGoogleForm: true,
          ok: false,
          source: "google-forms",
          message,
        };
      }

      let html = response.text;
      let formPayload = extractGoogleFormPayload(html);
      const isRestricted = html.includes("ServiceLogin") || html.includes("accounts.google.com");

      if (!formPayload && isRestricted) {
        const authResponse = await fetchText(resolved.formTarget.url, 20000, {
          backgroundOnly: true,
          useGoogleAuth: true,
        });

        if (authResponse.ok) {
          html = authResponse.text;
          formPayload = extractGoogleFormPayload(html);
        } else {
          const authError = (authResponse?.error || "").toLowerCase();
          const needsOAuthConnection = (
            authError.includes("not authenticated") ||
            authError.includes("oauth") ||
            authError.includes("refresh token") ||
            authError.includes("clientid is not configured") ||
            authError.includes("exchange endpoint is not configured") ||
            authError.includes("refresh endpoint is not configured")
          );
          return {
            isGoogleForm: true,
            ok: false,
            source: "google-forms",
            message: needsOAuthConnection
              ? "Google Form is private. Connect Google OAuth in Peek settings, then retry."
              : "Google Form is private or requires sign-in.",
          };
        }
      }

      if (!formPayload) {
        return {
          isGoogleForm: true,
          ok: false,
          source: "google-forms",
          message: "Google Form schema could not be read.",
        };
      }

      const schema = buildGoogleFormSchema(formPayload, html, resolved.formTarget.url);
      return {
        isGoogleForm: true,
        ok: true,
        source: "google-forms",
        message: formatGoogleFormPeek(schema),
        links: [
          {
            label: "Open Google Form",
            url: resolved.formTarget.url,
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
