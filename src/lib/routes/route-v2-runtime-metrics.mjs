import fs from "node:fs";
import path from "node:path";

export const ROUTE_V2_RUNTIME_METRICS_SCHEMA_VERSION = "route-v2-runtime-metrics-v1";
export const ROUTE_V2_RUNTIME_METRICS_LATENCY_BUCKETS_MS = Object.freeze([
  5,
  10,
  25,
  50,
  100,
  250,
  500,
  1_000,
  2_000,
  5_000,
  10_000,
  30_000,
]);

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 100_000;
const DEFAULT_MAX_ARCHIVES = 3;
const MAX_REASON_CODES = 64;

function clone(value) {
  return structuredClone(value);
}

function cleanReason(value, fallback = "other") {
  const normalized = String(value || "")
    .trim()
    .toLocaleLowerCase("en-US")
    .slice(0, 80);
  return /^[a-z0-9]+(?:[a-z0-9:_-]*[a-z0-9])?$/u.test(normalized)
    ? normalized
    : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function validIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function timestamp(now) {
  const value = Number(now());
  return new Date(Number.isFinite(value) ? value : Date.now()).toISOString();
}

function emptyLatency() {
  return {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    buckets: Array(ROUTE_V2_RUNTIME_METRICS_LATENCY_BUCKETS_MS.length + 1).fill(0),
  };
}

function emptyState(now, requestLimit) {
  const createdAt = timestamp(now);
  return {
    schemaVersion: ROUTE_V2_RUNTIME_METRICS_SCHEMA_VERSION,
    window: {
      startedAt: createdAt,
      updatedAt: createdAt,
      requestLimit,
    },
    totals: {
      requests: 0,
      v2Attempts: 0,
      v2Displayed: 0,
      legacyFallbacks: 0,
      rejects: 0,
      emptyResults: 0,
    },
    reasons: {
      fallback: {},
      candidate: {},
      evidence: {},
      publication: {},
    },
    latencies: {
      search: emptyLatency(),
      planner: emptyLatency(),
      cache: emptyLatency(),
    },
  };
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  return plainObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort());
}

function validCounterObject(value) {
  return plainObject(value) && Object.entries(value).every(([key, count]) => (
    cleanReason(key) === key
    && Number.isInteger(count)
    && count >= 0
  ));
}

function validLatency(value) {
  return hasExactKeys(value, ["count", "totalMs", "maxMs", "buckets"])
    && Number.isInteger(value.count)
    && value.count >= 0
    && Number.isFinite(value.totalMs)
    && value.totalMs >= 0
    && Number.isFinite(value.maxMs)
    && value.maxMs >= 0
    && Array.isArray(value.buckets)
    && value.buckets.length === ROUTE_V2_RUNTIME_METRICS_LATENCY_BUCKETS_MS.length + 1
    && value.buckets.every((count) => Number.isInteger(count) && count >= 0);
}

export function validateRouteV2RuntimeMetrics(value) {
  const errors = [];
  if (!plainObject(value)) return { valid: false, errors: ["metrics-root-invalid"] };
  if (!hasExactKeys(value, ["schemaVersion", "window", "totals", "reasons", "latencies"])) {
    errors.push("metrics-root-fields-invalid");
  }
  if (value.schemaVersion !== ROUTE_V2_RUNTIME_METRICS_SCHEMA_VERSION) {
    errors.push("metrics-schema-version-invalid");
  }
  if (!hasExactKeys(value.window, ["startedAt", "updatedAt", "requestLimit"])
    || !validIsoDate(value.window.startedAt)
    || !validIsoDate(value.window.updatedAt)
    || !Number.isInteger(value.window.requestLimit)
    || value.window.requestLimit < 1) {
    errors.push("metrics-window-invalid");
  }
  const totalKeys = [
    "requests",
    "v2Attempts",
    "v2Displayed",
    "legacyFallbacks",
    "rejects",
    "emptyResults",
  ];
  if (!hasExactKeys(value.totals, totalKeys)
    || totalKeys.some((key) => !Number.isInteger(value.totals[key]) || value.totals[key] < 0)) {
    errors.push("metrics-totals-invalid");
  }
  const reasonKeys = ["fallback", "candidate", "evidence", "publication"];
  if (!hasExactKeys(value.reasons, reasonKeys)
    || reasonKeys.some((key) => !validCounterObject(value.reasons[key]))) {
    errors.push("metrics-reasons-invalid");
  }
  const latencyKeys = ["search", "planner", "cache"];
  if (!hasExactKeys(value.latencies, latencyKeys)
    || latencyKeys.some((key) => !validLatency(value.latencies[key]))) {
    errors.push("metrics-latencies-invalid");
  }
  return { valid: errors.length === 0, errors };
}

function addReason(target, value, count = 1) {
  const reason = cleanReason(value);
  const existingKeys = Object.keys(target);
  const key = Object.hasOwn(target, reason) || existingKeys.length < MAX_REASON_CODES
    ? reason
    : "other";
  target[key] = Number(target[key] || 0) + Math.max(1, boundedInteger(count, 1, 1, 1_000_000));
}

function addReasons(target, values = []) {
  for (const value of Array.isArray(values) ? values : []) addReason(target, value);
}

function addLatency(target, value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return;
  const normalized = Math.min(30_000, Math.max(0, duration));
  const bucketIndex = ROUTE_V2_RUNTIME_METRICS_LATENCY_BUCKETS_MS.findIndex(
    (upperBound) => normalized <= upperBound,
  );
  target.count += 1;
  target.totalMs = Number((target.totalMs + normalized).toFixed(3));
  target.maxMs = Math.max(target.maxMs, normalized);
  target.buckets[bucketIndex < 0 ? target.buckets.length - 1 : bucketIndex] += 1;
}

function percentile(latency, quantile) {
  if (!latency.count) return 0;
  const threshold = Math.max(1, Math.ceil(latency.count * quantile));
  let cumulative = 0;
  for (let index = 0; index < latency.buckets.length; index += 1) {
    cumulative += latency.buckets[index];
    if (cumulative >= threshold) {
      return index < ROUTE_V2_RUNTIME_METRICS_LATENCY_BUCKETS_MS.length
        ? ROUTE_V2_RUNTIME_METRICS_LATENCY_BUCKETS_MS[index]
        : 30_000;
    }
  }
  return 30_000;
}

function withPercentiles(value) {
  return {
    ...clone(value),
    meanMs: value.count ? Number((value.totalMs / value.count).toFixed(3)) : 0,
    p50Ms: percentile(value, 0.5),
    p95Ms: percentile(value, 0.95),
    p99Ms: percentile(value, 0.99),
  };
}

function snapshotState(state) {
  return {
    ...clone(state),
    latencies: Object.fromEntries(
      Object.entries(state.latencies).map(([key, value]) => [key, withPercentiles(value)]),
    ),
  };
}

function stateForStorage(state) {
  return clone(state);
}

function sanitizeEvent(event = {}) {
  const source = plainObject(event) ? event : {};
  const reasons = (value) => (
    Array.isArray(value)
      ? value.slice(0, 256).map((item) => cleanReason(item))
      : []
  );
  return {
    v2Attempted: Boolean(source.v2Attempted),
    v2Displayed: Boolean(source.v2Displayed),
    fallback: Boolean(source.fallback),
    fallbackReason: cleanReason(source.fallbackReason, "unspecified"),
    rejectCount: boundedInteger(source.rejectCount, 0, 0, 1_000_000),
    resultCount: boundedInteger(source.resultCount, 0, 0, 1_000_000),
    candidateRejectReasons: reasons(source.candidateRejectReasons),
    evidenceRejectReasons: reasons(source.evidenceRejectReasons),
    publicationRejectReasons: reasons(source.publicationRejectReasons),
    timings: {
      searchMs: Number(source.timings?.searchMs) || 0,
      plannerMs: Number(source.timings?.plannerMs) || 0,
      cacheMs: Number(source.timings?.cacheMs) || 0,
    },
  };
}

function defaultStoragePath(env) {
  const configured = String(env?.ROUTE_V2_RUNTIME_METRICS_PATH || "").trim();
  return configured || path.resolve(".route-v2-cache", "route-v2-runtime-metrics.json");
}

function removeIfExists(fsImpl, filePath) {
  if (fsImpl.existsSync(filePath)) fsImpl.rmSync(filePath, { force: true });
}

export function createRouteV2RuntimeMetrics({
  storagePath,
  env = process.env,
  maxBytes = env.ROUTE_V2_RUNTIME_METRICS_MAX_BYTES,
  maxRequestsPerWindow = env.ROUTE_V2_RUNTIME_METRICS_WINDOW_REQUESTS,
  maxArchives = env.ROUTE_V2_RUNTIME_METRICS_MAX_ARCHIVES,
  now = () => Date.now(),
  fsImpl = fs,
} = {}) {
  const resolvedStoragePath = storagePath === null || storagePath === false
    ? ""
    : String(storagePath || defaultStoragePath(env));
  const byteLimit = boundedInteger(maxBytes, DEFAULT_MAX_BYTES, 4 * 1024, 1024 * 1024);
  const requestLimit = boundedInteger(
    maxRequestsPerWindow,
    DEFAULT_MAX_REQUESTS_PER_WINDOW,
    1,
    10_000_000,
  );
  const archiveLimit = boundedInteger(maxArchives, DEFAULT_MAX_ARCHIVES, 0, 10);
  const diagnosticEntries = [];
  let state = emptyState(now, requestLimit);

  if (resolvedStoragePath && fsImpl.existsSync(resolvedStoragePath)) {
    try {
      const stat = fsImpl.statSync(resolvedStoragePath);
      if (!stat.isFile() || stat.size > byteLimit) throw new Error("metrics-file-invalid-or-oversized");
      const parsed = JSON.parse(fsImpl.readFileSync(resolvedStoragePath, "utf8"));
      const validation = validateRouteV2RuntimeMetrics(parsed);
      if (!validation.valid) throw new Error(validation.errors.join(","));
      state = {
        ...parsed,
        window: { ...parsed.window, requestLimit },
        latencies: Object.fromEntries(
          Object.entries(parsed.latencies).map(([key, value]) => [
            key,
            {
              count: value.count,
              totalMs: value.totalMs,
              maxMs: value.maxMs,
              buckets: [...value.buckets],
            },
          ]),
        ),
      };
    } catch (error) {
      diagnosticEntries.push({
        code: "metrics-load-failed",
        reason: cleanReason(error?.message),
      });
    }
  }

  function atomicWrite() {
    if (!resolvedStoragePath) return { persisted: false, written: false, reason: "memory-only" };
    const serialized = `${JSON.stringify(stateForStorage(state), null, 2)}\n`;
    const bytes = Buffer.byteLength(serialized);
    if (bytes > byteLimit) {
      return { persisted: false, written: false, reason: "metrics-size-limit-exceeded" };
    }
    const directory = path.dirname(resolvedStoragePath);
    const temporaryPath = `${resolvedStoragePath}.${process.pid}.tmp`;
    let descriptor = null;
    try {
      fsImpl.mkdirSync(directory, { recursive: true });
      descriptor = fsImpl.openSync(temporaryPath, "w");
      fsImpl.writeFileSync(descriptor, serialized, "utf8");
      fsImpl.fsyncSync(descriptor);
      fsImpl.closeSync(descriptor);
      descriptor = null;
      fsImpl.renameSync(temporaryPath, resolvedStoragePath);
      return { persisted: true, written: true, bytes };
    } catch (error) {
      if (descriptor !== null) {
        try {
          fsImpl.closeSync(descriptor);
        } catch {
          // Best-effort descriptor cleanup after a failed metrics write.
        }
      }
      try {
        removeIfExists(fsImpl, temporaryPath);
      } catch {
        // Best-effort temporary file cleanup.
      }
      diagnosticEntries.push({
        code: "metrics-write-failed",
        reason: cleanReason(error?.message),
      });
      return { persisted: false, written: false, reason: "metrics-write-failed" };
    }
  }

  function rotate() {
    if (!resolvedStoragePath || !fsImpl.existsSync(resolvedStoragePath) || archiveLimit <= 0) {
      state = emptyState(now, requestLimit);
      return { rotated: false };
    }
    try {
      for (let index = archiveLimit; index >= 1; index -= 1) {
        const destination = `${resolvedStoragePath}.${index}`;
        const source = index === 1 ? resolvedStoragePath : `${resolvedStoragePath}.${index - 1}`;
        if (!fsImpl.existsSync(source)) continue;
        removeIfExists(fsImpl, destination);
        fsImpl.renameSync(source, destination);
      }
      state = emptyState(now, requestLimit);
      return { rotated: true };
    } catch (error) {
      diagnosticEntries.push({
        code: "metrics-rotation-failed",
        reason: cleanReason(error?.message),
      });
      return { rotated: false, reason: "metrics-rotation-failed" };
    }
  }

  function record(input = {}) {
    const event = sanitizeEvent(input);
    const previous = clone(state);
    let rotation = { rotated: false };
    if (state.totals.requests >= requestLimit) rotation = rotate();
    state.window.updatedAt = timestamp(now);
    state.window.requestLimit = requestLimit;
    state.totals.requests += 1;
    if (event.v2Attempted) state.totals.v2Attempts += 1;
    if (event.v2Displayed) state.totals.v2Displayed += 1;
    if (event.fallback) {
      state.totals.legacyFallbacks += 1;
      addReason(state.reasons.fallback, event.fallbackReason);
    }
    state.totals.rejects += event.rejectCount;
    if (event.resultCount === 0) state.totals.emptyResults += 1;
    addReasons(state.reasons.candidate, event.candidateRejectReasons);
    addReasons(state.reasons.evidence, event.evidenceRejectReasons);
    addReasons(state.reasons.publication, event.publicationRejectReasons);
    addLatency(state.latencies.search, event.timings.searchMs);
    addLatency(state.latencies.planner, event.timings.plannerMs);
    addLatency(state.latencies.cache, event.timings.cacheMs);

    const write = atomicWrite();
    if (resolvedStoragePath && !write.persisted) state = previous;
    return { ...write, ...rotation };
  }

  function snapshot() {
    return snapshotState(state);
  }

  function diagnostics() {
    return {
      schemaVersion: ROUTE_V2_RUNTIME_METRICS_SCHEMA_VERSION,
      writerMode: "single-instance",
      maxBytes: byteLimit,
      maxRequestsPerWindow: requestLimit,
      maxArchives: archiveLimit,
      persistence: resolvedStoragePath ? "atomic-json" : "memory-only",
      diagnostics: clone(diagnosticEntries),
    };
  }

  return {
    record,
    snapshot,
    diagnostics,
  };
}
