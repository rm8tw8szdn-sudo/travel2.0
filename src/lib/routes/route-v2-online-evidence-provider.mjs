import { cleanString } from "./route-v2-utils.mjs";

export const ROUTE_V2_EVIDENCE_ONLINE_TIMEOUT_MS = "ROUTE_V2_EVIDENCE_ONLINE_TIMEOUT_MS";
export const ROUTE_V2_EVIDENCE_ONLINE_MAX_QUERIES = "ROUTE_V2_EVIDENCE_ONLINE_MAX_QUERIES";
export const ROUTE_V2_EVIDENCE_ONLINE_MAX_RETRIES = "ROUTE_V2_EVIDENCE_ONLINE_MAX_RETRIES";

export const ROUTE_V2_ONLINE_EVIDENCE_FAILURES = Object.freeze([
  "provider-not-configured",
  "timeout",
  "no-result",
  "parse-failed",
  "provider-error",
  "rate-limited",
  "aborted",
]);

const EVIDENCE_BUNDLE_FLAG = "ROUTE_V2_EVIDENCE_BUNDLE_ENABLED";
const ONLINE_FLAG = "ROUTE_V2_EVIDENCE_ONLINE_ENABLED";
const TAVILY_FLAG = "ROUTE_V2_TAVILY_EVIDENCE_ENABLED";
const WIKIVOYAGE_FLAG = "ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED";
const DEFAULT_TAVILY_URL = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRIES = 0;
const HARD_MAX_RETRIES = 3;

function strictFlag(env = process.env, name) {
  return String(env?.[name] || "").trim() === "true";
}

function numberFrom(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function normalizeResult(result = {}, rank = 0) {
  return {
    sourceUrl: cleanString(result.sourceUrl || result.url || result.link),
    sourceTitle: cleanString(result.sourceTitle || result.title || result.name),
    sourceSnippet: cleanString(result.sourceSnippet || result.snippet || result.description || result.content).replace(/\s+/gu, " ").slice(0, 600),
    rank: Number(result.rank ?? rank + 1),
  };
}

function isHttpUrl(value = "") {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidResult(result = {}) {
  return Boolean(isHttpUrl(result.sourceUrl) && (result.sourceTitle || result.sourceSnippet));
}

function rawResultsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.items)) return payload.items;
  }
  return null;
}

function diagnostic({
  provider = "",
  attempt = 0,
  status = "failed",
  reason = "",
  retry = false,
  waitMs = 0,
  httpStatus = null,
  error = "",
} = {}) {
  return {
    provider: cleanString(provider),
    attempt: Number(attempt) || 0,
    status,
    reason: cleanString(reason),
    retry: Boolean(retry),
    waitMs: Number(waitMs) || 0,
    httpStatus,
    error: cleanString(error),
  };
}

function providerResult({
  ok = false,
  configured = false,
  attempted = false,
  provider = "",
  query = "",
  results = [],
  failure = "",
  diagnostics = [],
  attempts = 0,
  retrievedAt = "",
  extra = {},
} = {}) {
  return {
    ok: Boolean(ok),
    configured: Boolean(configured),
    attempted: Boolean(attempted),
    provider: cleanString(provider),
    query: cleanString(query),
    results: Array.isArray(results) ? results : [],
    failure: cleanString(failure),
    diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
    attempts: Number(attempts) || 0,
    retrievedAt: cleanString(retrievedAt),
    ...extra,
  };
}

function abortError(message = "aborted") {
  return Object.assign(new Error(message), { name: "AbortError" });
}

function externalAbortReason(signal) {
  return signal?.aborted ? "aborted" : "";
}

function createAbortContext({ signal = null, timeoutMs = 0 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  let timer = null;

  function abortFromExternal() {
    controller.abort(signal?.reason || abortError("external-abort"));
  }

  if (signal?.aborted) abortFromExternal();
  else if (signal?.addEventListener) signal.addEventListener("abort", abortFromExternal, { once: true });

  const normalizedTimeout = Number(timeoutMs);
  if (Number.isFinite(normalizedTimeout) && normalizedTimeout > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(abortError("online-evidence-timeout"));
    }, normalizedTimeout);
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      if (timer) clearTimeout(timer);
      if (signal?.removeEventListener) signal.removeEventListener("abort", abortFromExternal);
    },
  };
}

async function fetchJsonWithAbort({ fetchImpl, url, request, timeoutMs, signal } = {}) {
  const abortContext = createAbortContext({ signal, timeoutMs });
  try {
    const response = await fetchImpl(url, {
      ...request,
      signal: abortContext.signal,
    });
    return { response, timedOut: false };
  } catch (error) {
    if (abortContext.timedOut()) {
      throw Object.assign(abortError("online-evidence-timeout"), { routeV2Failure: "timeout" });
    }
    if (error?.name === "AbortError" || externalAbortReason(signal)) {
      throw Object.assign(abortError(error?.message || "external-abort"), { routeV2Failure: "aborted" });
    }
    throw error;
  } finally {
    abortContext.cleanup();
  }
}

function retryDelayMs({ attempt, reason, response } = {}) {
  if (reason === "rate-limited") {
    const retryAfter = Number(response?.headers?.get?.("retry-after")) || 0;
    return retryAfter > 0 ? Math.min(5_000, retryAfter * 1_000) : 250 * attempt;
  }
  return 150 * attempt;
}

function shouldRetry({ reason, status, attempt, maxRetries } = {}) {
  if (attempt > maxRetries) return false;
  if (reason === "provider-not-configured" || reason === "no-result" || reason === "parse-failed" || reason === "aborted") return false;
  if (reason === "timeout") return true;
  if (reason === "rate-limited") return true;
  if (reason === "provider-error" && (!status || status >= 500)) return true;
  return false;
}

function configuredForProvider({ provider = "tavily", env = process.env, apiKey = "", apiUrl = "" } = {}) {
  const baseFlags = strictFlag(env, EVIDENCE_BUNDLE_FLAG) && strictFlag(env, ONLINE_FLAG);
  if (provider === "tavily") {
    return {
      configured: Boolean(baseFlags && strictFlag(env, TAVILY_FLAG) && cleanString(apiKey) && cleanString(apiUrl || DEFAULT_TAVILY_URL)),
      reason: "provider-not-configured",
    };
  }
  if (provider === "wikivoyage") {
    return {
      configured: false,
      reason: "provider-not-configured",
    };
  }
  return { configured: false, reason: "provider-not-configured" };
}

export function routeV2OnlineEvidenceConfig({
  provider = "tavily",
  env = process.env,
  apiUrl = "",
  apiKey = "",
} = {}) {
  const providerId = cleanString(provider) || "tavily";
  const endpoint = providerId === "tavily" ? cleanString(apiUrl || env.ROUTE_WEB_SEARCH_API_URL || DEFAULT_TAVILY_URL) : "";
  const key = cleanString(apiKey || env.ROUTE_WEB_SEARCH_API_KEY);
  const configured = configuredForProvider({ provider: providerId, env, apiKey: key, apiUrl: endpoint });
  return {
    provider: providerId,
    configured: configured.configured,
    reason: configured.configured ? "" : configured.reason,
    endpoint,
    timeoutMs: numberFrom(env[ROUTE_V2_EVIDENCE_ONLINE_TIMEOUT_MS], DEFAULT_TIMEOUT_MS, { min: 1, max: 60_000 }),
    maxQueries: numberFrom(env[ROUTE_V2_EVIDENCE_ONLINE_MAX_QUERIES], 12, { min: 1, max: 50 }),
    maxRetries: numberFrom(env[ROUTE_V2_EVIDENCE_ONLINE_MAX_RETRIES], DEFAULT_MAX_RETRIES, { min: 0, max: HARD_MAX_RETRIES }),
  };
}

export async function searchRouteV2OnlineEvidence({
  query = "",
  provider = "tavily",
  fetchImpl = globalThis.fetch,
  signal = null,
  timeoutMs = null,
  maxRetries = null,
  env = process.env,
  apiUrl = "",
  apiKey = "",
  limit = 5,
  now = () => new Date().toISOString(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const providerId = cleanString(provider) || "tavily";
  const config = routeV2OnlineEvidenceConfig({ provider: providerId, env, apiUrl, apiKey });
  const diagnostics = [];
  const normalizedQuery = cleanString(query);
  const attemptsAllowed = numberFrom(maxRetries ?? config.maxRetries, config.maxRetries, { min: 0, max: HARD_MAX_RETRIES }) + 1;
  const requestTimeoutMs = numberFrom(timeoutMs ?? config.timeoutMs, config.timeoutMs, { min: 1, max: 60_000 });

  if (!config.configured || typeof fetchImpl !== "function" || !normalizedQuery) {
    diagnostics.push(diagnostic({ provider: providerId, attempt: 0, reason: "provider-not-configured", status: "skipped" }));
    return providerResult({
      configured: false,
      attempted: false,
      provider: providerId,
      query: normalizedQuery,
      failure: "provider-not-configured",
      diagnostics,
      attempts: 0,
      retrievedAt: now(),
    });
  }

  if (signal?.aborted) {
    diagnostics.push(diagnostic({ provider: providerId, attempt: 0, reason: "aborted", error: "external-abort" }));
    return providerResult({
      configured: true,
      attempted: true,
      provider: providerId,
      query: normalizedQuery,
      failure: "aborted",
      diagnostics,
      attempts: 0,
      retrievedAt: now(),
    });
  }

  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    try {
      const { response } = await fetchJsonWithAbort({
        fetchImpl,
        url: config.endpoint,
        timeoutMs: requestTimeoutMs,
        signal,
        request: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cleanString(apiKey || env.ROUTE_WEB_SEARCH_API_KEY)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: normalizedQuery,
            max_results: limit,
            search_depth: "basic",
            include_answer: true,
            include_raw_content: false,
          }),
        },
      });

      if (!response?.ok) {
        const status = Number(response?.status) || 0;
        const reason = status === 429 ? "rate-limited" : "provider-error";
        const retry = shouldRetry({ reason, status, attempt, maxRetries: attemptsAllowed - 1 });
        const waitMs = retry ? retryDelayMs({ attempt, reason, response }) : 0;
        diagnostics.push(diagnostic({ provider: providerId, attempt, reason, retry, waitMs, httpStatus: status }));
        if (retry) {
          await wait(waitMs);
          continue;
        }
        return providerResult({
          configured: true,
          attempted: true,
          provider: providerId,
          query: normalizedQuery,
          failure: reason,
          diagnostics,
          attempts: attempt,
          retrievedAt: now(),
        });
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        diagnostics.push(diagnostic({ provider: providerId, attempt, reason: "parse-failed", error: error?.message || String(error) }));
        return providerResult({
          configured: true,
          attempted: true,
          provider: providerId,
          query: normalizedQuery,
          failure: "parse-failed",
          diagnostics,
          attempts: attempt,
          retrievedAt: now(),
        });
      }

      const rawResults = rawResultsFromPayload(payload);
      if (!rawResults) {
        diagnostics.push(diagnostic({ provider: providerId, attempt, reason: "parse-failed", error: "unexpected provider payload shape" }));
        return providerResult({
          configured: true,
          attempted: true,
          provider: providerId,
          query: normalizedQuery,
          failure: "parse-failed",
          diagnostics,
          attempts: attempt,
          retrievedAt: now(),
        });
      }
      const results = rawResults.slice(0, limit).map(normalizeResult).filter(isValidResult);
      if (!results.length) {
        diagnostics.push(diagnostic({ provider: providerId, attempt, reason: "no-result" }));
        return providerResult({
          configured: true,
          attempted: true,
          provider: providerId,
          query: normalizedQuery,
          failure: "no-result",
          diagnostics,
          attempts: attempt,
          retrievedAt: now(),
        });
      }
      diagnostics.push(diagnostic({ provider: providerId, attempt, status: "resolved", reason: "ok", httpStatus: response.status || 200 }));
      return providerResult({
        ok: true,
        configured: true,
        attempted: true,
        provider: providerId,
        query: normalizedQuery,
        results,
        failure: "",
        diagnostics,
        attempts: attempt,
        retrievedAt: now(),
        extra: {
          mode: "real-search",
          isRealSearch: true,
        },
      });
    } catch (error) {
      const reason = error?.routeV2Failure || (error?.name === "AbortError" ? "aborted" : "provider-error");
      const retry = shouldRetry({ reason, attempt, maxRetries: attemptsAllowed - 1 });
      const waitMs = retry ? retryDelayMs({ attempt, reason }) : 0;
      diagnostics.push(diagnostic({
        provider: providerId,
        attempt,
        reason,
        retry,
        waitMs,
        error: error?.message || String(error),
      }));
      if (retry) {
        await wait(waitMs);
        continue;
      }
      return providerResult({
        configured: true,
        attempted: true,
        provider: providerId,
        query: normalizedQuery,
        failure: reason,
        diagnostics,
        attempts: attempt,
        retrievedAt: now(),
      });
    }
  }

  return providerResult({
    configured: true,
    attempted: true,
    provider: providerId,
    query: normalizedQuery,
    failure: "provider-error",
    diagnostics,
    attempts: attemptsAllowed,
    retrievedAt: now(),
  });
}

export function createRouteV2TavilyEvidenceProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
  apiUrl = "",
  apiKey = "",
  now = () => new Date().toISOString(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const config = routeV2OnlineEvidenceConfig({ provider: "tavily", env, apiUrl, apiKey });
  return {
    providerId: "tavily",
    capabilities: {
      evidenceSource: true,
      realtimeUserRequest: false,
      producesRouteRecord: false,
      requiresApiKey: true,
      configured: config.configured,
    },
    async searchEvidence({ query = "", limit = 5, signal = null, timeoutMs = null, maxRetries = null } = {}) {
      return searchRouteV2OnlineEvidence({
        query,
        provider: "tavily",
        fetchImpl,
        signal,
        timeoutMs,
        maxRetries,
        env,
        apiUrl,
        apiKey,
        limit,
        now,
        wait,
      });
    },
  };
}

export function createRouteV2WikivoyageEvidenceProvider({ env = process.env } = {}) {
  const config = routeV2OnlineEvidenceConfig({ provider: "wikivoyage", env });
  return {
    providerId: "wikivoyage",
    capabilities: {
      evidenceSource: true,
      realtimeUserRequest: false,
      producesRouteRecord: false,
      requiresApiKey: false,
      configured: config.configured,
      unavailableReason: "wikivoyage-evidence-provider-not-implemented",
    },
    async searchEvidence({ query = "" } = {}) {
      return providerResult({
        configured: false,
        attempted: false,
        provider: "wikivoyage",
        query: cleanString(query),
        failure: "provider-not-configured",
        diagnostics: [diagnostic({
          provider: "wikivoyage",
          status: "skipped",
          reason: "provider-not-configured",
          error: "wikivoyage-evidence-provider-not-implemented",
        })],
        attempts: 0,
        retrievedAt: new Date(0).toISOString(),
      });
    },
  };
}
