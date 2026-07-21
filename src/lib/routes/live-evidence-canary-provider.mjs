import crypto from "node:crypto";

import { classifyLocalEvidenceSource } from "./local-evidence-source-schema.mjs";
import { cleanString, uniqueStrings } from "./route-v2-utils.mjs";

export const ROUTE_V2_LIVE_EVIDENCE_CANARY_PROVIDER_ID = "live-official-source-canary";
export const LIVE_EVIDENCE_CANARY_DEFAULT_TIMEOUT_MS = 8_000;
export const LIVE_EVIDENCE_CANARY_MAX_SOURCES_PER_TASK = 3;

const MONTH_NAMES = Object.freeze({
  1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
  7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
});

function clean(value) {
  return cleanString(value).replace(/\s+/gu, " ");
}

function normalizeText(value) {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("en-US");
}

function redact(value) {
  return clean(value)
    .replace(/(api[_-]?key|authorization|bearer)\s*[:=]?\s*\S+/giu, "$1=[REDACTED]")
    .slice(0, 300);
}

function publicSourceUrl(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== "https:" || url.username || url.password) return { url: "", reason: "source-url-sensitive-or-invalid" };
    for (const key of url.searchParams.keys()) {
      if (/api.?key|token|secret|authorization|signature|credential/iu.test(key)) {
        return { url: "", reason: "source-url-sensitive-or-invalid" };
      }
    }
    url.hash = "";
    return { url: url.toString(), reason: "" };
  } catch {
    return { url: "", reason: "source-url-sensitive-or-invalid" };
  }
}

function diagnosticUrl(value) {
  try {
    const url = new URL(clean(value));
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

function diagnostic({ reason, url = "", status = null, error = "" } = {}) {
  return {
    provider: ROUTE_V2_LIVE_EVIDENCE_CANARY_PROVIDER_ID,
    status: "failed",
    reason: clean(reason),
    sourceUrl: diagnosticUrl(url),
    httpStatus: Number.isInteger(status) ? status : null,
    error: redact(error),
  };
}

function decodeHtmlEntities(value) {
  const named = new Map([
    ["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", "\""], ["apos", "'"], ["nbsp", " "],
  ]);
  return String(value || "")
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/giu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/giu, (match, name) => named.get(name.toLocaleLowerCase("en-US")) || match);
}

function htmlTitle(html) {
  const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
  return clean(decodeHtmlEntities(match?.[1] || "Official source"));
}

function htmlToText(html) {
  return clean(decodeHtmlEntities(String(html || "")
    .replace(/<(script|style|noscript|svg|template|head)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replace(/<!--([\s\S]*?)-->/gu, " ")
    .replace(/<br\s*\/?\s*>/giu, " ")
    .replace(/<\/p\s*>|<\/li\s*>|<\/h[1-6]\s*>|<\/tr\s*>/giu, " ")
    .replace(/<[^>]+>/gu, " ")));
}

function aliases(entity = {}) {
  return uniqueStrings([
    entity.canonicalNameEn,
    entity.name,
    entity.canonicalNameZh,
    ...(Array.isArray(entity.aliases) ? entity.aliases : []),
  ]).map(clean).filter((value) => normalizeText(value).length >= 2);
}

function firstIndex(text, values = [], { after = -1 } = {}) {
  const normalized = normalizeText(text);
  const indexes = values.map((value) => normalized.indexOf(normalizeText(value), Math.max(0, after + 1))).filter((value) => value >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function boundedWindow(text, start, end, { before = 220, after = 780 } = {}) {
  const from = Math.max(0, Math.min(start, end) - before);
  const to = Math.min(text.length, Math.max(start, end) + after);
  return clean(text.slice(from, to)).slice(0, 1_200);
}

function escapePattern(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function matchedSpan(text, patterns = []) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.index >= 0) return { start: match.index, end: match.index + match[0].length };
  }
  return null;
}

function directedRouteSpan(text, fromAliases = [], toAliases = []) {
  const normalized = normalizeText(text);
  for (const from of fromAliases.map(normalizeText)) {
    for (const to of toAliases.map(normalizeText)) {
      for (const phrase of [
        `${from} to ${to}`,
        `from ${from} to ${to}`,
        `travel from ${from} to ${to}`,
        `reach ${to} from ${from}`,
        `${from} → ${to}`,
        `${from} - ${to}`,
        `${from} – ${to}`,
      ]) {
        const index = normalized.indexOf(phrase);
        if (index >= 0) return { start: index, end: index + phrase.length };
      }
      const escapedFrom = escapePattern(from);
      const escapedTo = escapePattern(to);
      const explicit = matchedSpan(normalized, [
        new RegExp(`\\b(?:arrive|arrives|arriving|reach|reaches|reaching)\\s+(?:in\\s+)?${escapedTo}\\b.{0,80}\\bfrom\\s+${escapedFrom}\\b`, "iu"),
        new RegExp(`\\b${escapedTo}\\b.{0,180}\\b(?:accessible|reached|reach|travel)\\b.{0,120}\\bfrom\\s+${escapedFrom}\\b`, "iu"),
        new RegExp(`\\bfrom\\s+${escapedFrom}\\b.{0,500}\\b${escapedTo}\\b`, "iu"),
        new RegExp(`\\b${escapedTo}\\b.{0,180}\\bfrom\\s+${escapedFrom}\\b`, "iu"),
        new RegExp(`\\b${escapedFrom}\\b.{0,520}\\b(?:connects?|service|train|rail|bus|shinkansen)\\b.{0,180}\\b${escapedTo}\\b`, "iu"),
      ]);
      if (explicit) return explicit;
    }
  }
  return null;
}

function allIndexes(text, token) {
  const indexes = [];
  let cursor = 0;
  while (token && cursor < text.length) {
    const index = text.indexOf(token, cursor);
    if (index < 0) break;
    indexes.push(index);
    cursor = index + Math.max(1, token.length);
  }
  return indexes;
}

function seasonEvidenceSpan(text, entityAliases = [], monthName = "") {
  const normalized = normalizeText(text);
  const entityIndexes = entityAliases.flatMap((alias) => allIndexes(normalized, normalizeText(alias)));
  const monthIndexes = [monthName, monthName.slice(0, 3)]
    .map(normalizeText)
    .filter((value) => value.length >= 3)
    .flatMap((month) => allIndexes(normalized, month));
  const candidates = [];
  for (const entityIndex of entityIndexes) {
    for (const monthIndex of monthIndexes) {
      if (Math.abs(entityIndex - monthIndex) > 1_800) continue;
      const excerpt = boundedWindow(text, entityIndex, monthIndex, { before: 320, after: 1_000 });
      const normalizedAlias = entityAliases.map(normalizeText).find((alias) => normalizeText(excerpt).includes(alias)) || "";
      const escapedAlias = escapePattern(normalizedAlias);
      const directRisk = escapedAlias && new RegExp(`(?:snow|snowfall|icy|ice-covered|freezing|blizzard|closure|closed|suspension|通行止|積雪).{0,120}${escapedAlias}|${escapedAlias}.{0,120}(?:snow|snowfall|icy|ice-covered|freezing|blizzard|closure|closed|suspension|通行止|積雪)`, "iu").test(normalizeText(excerpt));
      const riskScore = directRisk ? 0 : /snow|snowfall|icy|ice-covered|freezing|blizzard|closure|closed|suspension|通行止|積雪/iu.test(excerpt) ? 1 : 2;
      candidates.push({ start: entityIndex, end: monthIndex, riskScore, distance: Math.abs(entityIndex - monthIndex) });
    }
  }
  candidates.sort((left, right) => left.riskScore - right.riskScore || left.distance - right.distance || left.start - right.start);
  return candidates[0] || null;
}

function relevantSnippet(text, context = {}) {
  if (context.record?.fromEntityId && context.record?.toEntityId) {
    const span = directedRouteSpan(text, aliases(context.from), aliases(context.to));
    return span ? boundedWindow(text, span.start, span.end) : "";
  }
  if (context.record?.entityId && context.record?.month) {
    const monthName = MONTH_NAMES[Number(context.record.month)] || "";
    const span = monthName ? seasonEvidenceSpan(text, aliases(context.entity), monthName) : null;
    return span ? boundedWindow(text, span.start, span.end, { before: 320, after: 1_000 }) : "";
  }
  return "";
}

function explicitLocatorSnippet(text, locator) {
  const value = typeof locator === "string" ? locator : locator?.text;
  const locatorText = clean(value);
  if (!locatorText) return { requested: false, snippet: "", factText: "", locator: "" };
  const index = text.toLocaleLowerCase("en-US").indexOf(locatorText.toLocaleLowerCase("en-US"));
  if (index < 0) return { requested: true, snippet: "", factText: "", locator: locatorText };
  const before = Math.min(500, Math.max(0, Number(locator?.before) || 120));
  const after = Math.min(700, Math.max(80, Number(locator?.after) || 320));
  return {
    requested: true,
    snippet: boundedWindow(text, index, index + locatorText.length, { before, after }),
    factText: clean(text.slice(index, index + locatorText.length)),
    locator: locatorText,
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function failureReason(diagnostics = []) {
  const reasons = new Set(diagnostics.map((entry) => entry.reason));
  if (reasons.has("source-rate-limited")) return "rate-limited";
  if (reasons.has("source-timeout")) return "timeout";
  if (reasons.has("source-http-5xx") || reasons.has("source-fetch-failed")) return "provider-error";
  if (reasons.has("source-empty-content") || reasons.has("source-parse-failed")) return "parse-failed";
  return "no-result";
}

async function fetchOfficialPage({ result, context, fetchImpl, timeoutMs, signal, now }) {
  const requested = publicSourceUrl(result.sourceUrl || result.url);
  const requestedUrl = requested.url;
  if (!requestedUrl) {
    return { ok: false, attempted: false, diagnostic: diagnostic({ reason: requested.reason, url: result.sourceUrl || result.url }) };
  }
  if (!classifyLocalEvidenceSource(requestedUrl)) {
    return { ok: false, attempted: false, diagnostic: diagnostic({ reason: "source-not-official", url: requestedUrl }) };
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("live-canary-source-timeout"));
  }, timeoutMs);
  const abort = () => controller.abort(signal?.reason || new Error("live-canary-aborted"));
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  try {
    const response = await fetchImpl(requestedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
        "User-Agent": "travel2-route-v2-evidence-canary/1.0",
      },
    });
    const final = publicSourceUrl(response?.url || requestedUrl);
    const finalUrl = final.url;
    if (!finalUrl) {
      return { ok: false, attempted: true, diagnostic: diagnostic({ reason: final.reason, url: response?.url, status: response?.status }) };
    }
    if (!classifyLocalEvidenceSource(finalUrl)) {
      return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-redirected-to-untrusted-domain", url: finalUrl, status: response?.status }) };
    }
    if (response.status === 404) return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-http-404", url: finalUrl, status: 404 }) };
    if (response.status === 429) return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-rate-limited", url: finalUrl, status: 429 }) };
    if (response.status >= 500) return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-http-5xx", url: finalUrl, status: response.status }) };
    if (!response.ok) return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-http-error", url: finalUrl, status: response.status }) };
    const contentType = clean(response.headers?.get?.("content-type"));
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/iu.test(contentType)) {
      return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-unsupported-content-type", url: finalUrl, status: response.status }) };
    }
    const html = await response.text();
    if (!clean(html)) return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-empty-content", url: finalUrl, status: response.status }) };
    const text = htmlToText(html.slice(0, 2_000_000));
    if (text.length < 80) return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-parse-failed", url: finalUrl, status: response.status }) };
    const directionallyRelevantSnippet = relevantSnippet(text, context);
    if (!directionallyRelevantSnippet) return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-content-irrelevant", url: finalUrl, status: response.status }) };
    const located = explicitLocatorSnippet(text, result.sourceLocator);
    if (located.requested && !located.snippet) {
      return { ok: false, attempted: true, diagnostic: diagnostic({ reason: "source-locator-not-found", url: finalUrl, status: response.status }) };
    }
    const snippet = located.snippet || directionallyRelevantSnippet;
    const classification = classifyLocalEvidenceSource(finalUrl);
    return {
      ok: true,
      attempted: true,
      result: {
        sourceUrl: finalUrl,
        sourceTitle: htmlTitle(html).slice(0, 240),
        sourceSnippet: snippet,
        sourceFactText: located.factText || "",
        sourcePublisher: classification.publisher,
        sourceType: classification.sourceType,
        sourceHttpStatus: response.status,
        sourceContentHash: sha256(text),
        sourceFactLocator: (located.locator || htmlTitle(html)).slice(0, 240),
        sourceDirection: context.record?.fromEntityId && context.record?.toEntityId ? {
          fromEntityId: clean(context.record.fromEntityId),
          toEntityId: clean(context.record.toEntityId),
        } : null,
        retrievedAt: now(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      attempted: true,
      diagnostic: diagnostic({
        reason: timedOut ? "source-timeout" : controller.signal.aborted ? "source-aborted" : "source-fetch-failed",
        url: requestedUrl,
        error: error?.message || error,
      }),
    };
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener?.("abort", abort);
  }
}

export function createRouteV2LiveEvidenceCanaryProvider({
  discoveryProvider,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  timeoutMs = LIVE_EVIDENCE_CANARY_DEFAULT_TIMEOUT_MS,
  maxSourcesPerTask = LIVE_EVIDENCE_CANARY_MAX_SOURCES_PER_TASK,
} = {}) {
  const configured = Boolean(discoveryProvider?.searchEvidence && discoveryProvider?.capabilities?.configured === true && typeof fetchImpl === "function");
  return {
    providerId: ROUTE_V2_LIVE_EVIDENCE_CANARY_PROVIDER_ID,
    capabilities: {
      evidenceSource: true,
      realtimeUserRequest: false,
      producesRouteRecord: false,
      requiresApiKey: discoveryProvider?.capabilities?.requiresApiKey !== false,
      configured,
      fetchesOfficialPages: true,
    },
    async searchEvidence({ query = "", limit = 5, signal = null, task = null, context = {}, timeoutMs: requestTimeoutMs = null, maxRetries = null } = {}) {
      if (!configured) {
        return {
          ok: false, configured: false, attempted: false, provider: ROUTE_V2_LIVE_EVIDENCE_CANARY_PROVIDER_ID,
          query: clean(query), results: [], failure: "provider-not-configured", diagnostics: [], attempts: 0, retrievedAt: now(),
        };
      }
      const discovered = await discoveryProvider.searchEvidence({ query, limit, signal, task, context, timeoutMs: requestTimeoutMs, maxRetries });
      if (!discovered?.ok) {
        return { ...discovered, provider: ROUTE_V2_LIVE_EVIDENCE_CANARY_PROVIDER_ID, results: [] };
      }
      const seen = new Set();
      const candidates = [];
      const diagnostics = [];
      for (const result of Array.isArray(discovered.results) ? discovered.results : []) {
        const rawUrl = clean(result.sourceUrl || result.url);
        const candidateUrl = publicSourceUrl(rawUrl);
        if (!candidateUrl.url) {
          diagnostics.push(diagnostic({ reason: candidateUrl.reason, url: rawUrl }));
          continue;
        }
        if (seen.has(candidateUrl.url)) continue;
        seen.add(candidateUrl.url);
        if (!classifyLocalEvidenceSource(candidateUrl.url)) {
          diagnostics.push(diagnostic({ reason: "source-not-official", url: candidateUrl.url }));
          continue;
        }
        candidates.push({ ...result, sourceUrl: candidateUrl.url });
        if (candidates.length >= Math.min(LIVE_EVIDENCE_CANARY_MAX_SOURCES_PER_TASK, Math.max(1, Number(maxSourcesPerTask) || 1))) break;
      }
      let cursor = 0;
      const fetchResults = new Array(candidates.length);
      async function worker() {
        while (cursor < candidates.length) {
          const index = cursor;
          cursor += 1;
          fetchResults[index] = await fetchOfficialPage({
            result: candidates[index],
            context,
            fetchImpl,
            timeoutMs: Math.max(250, Number(requestTimeoutMs) || Number(timeoutMs) || LIVE_EVIDENCE_CANARY_DEFAULT_TIMEOUT_MS),
            signal,
            now,
          });
        }
      }
      await Promise.all(Array.from({ length: Math.min(2, candidates.length || 1) }, () => worker()));
      const results = [];
      let pageAttempts = 0;
      for (const outcome of fetchResults.filter(Boolean)) {
        if (outcome.attempted) pageAttempts += 1;
        if (outcome.ok) results.push(outcome.result);
        else if (outcome.diagnostic) diagnostics.push(outcome.diagnostic);
      }
      const attempts = Math.max(0, Number(discovered.attempts) || (discovered.attempted ? 1 : 0)) + pageAttempts;
      return {
        ok: results.length > 0,
        configured: true,
        attempted: true,
        provider: ROUTE_V2_LIVE_EVIDENCE_CANARY_PROVIDER_ID,
        query: clean(query),
        results,
        failure: results.length ? "" : failureReason(diagnostics),
        diagnostics: diagnostics.slice(0, 20),
        attempts,
        retrievedAt: now(),
      };
    },
  };
}
