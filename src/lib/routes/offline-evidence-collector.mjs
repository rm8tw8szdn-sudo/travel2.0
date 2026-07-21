import { envFlag } from "./route-v2-env.mjs";
import { adaptRouteLegEvidenceResults, adaptSeasonEvidenceResults } from "./offline-evidence-fact-adapter.mjs";
import { cleanString, uniqueStrings } from "./route-v2-utils.mjs";

export const ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_FLAG = "ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED";
export const OFFLINE_EVIDENCE_DEFAULT_LIMIT = 20;
export const OFFLINE_EVIDENCE_MAX_LIMIT = 30;
export const OFFLINE_EVIDENCE_DEFAULT_MAX_ATTEMPTS = 3;
export const OFFLINE_EVIDENCE_DEFAULT_CONCURRENCY = 2;

const ALLOWED_TYPES = new Set(["route-leg", "season", "all"]);
const RETRYABLE_FAILURES = new Set(["timeout", "rate-limited", "provider-error", "parse-failed", "aborted", "no-result"]);

function clean(value) {
  return cleanString(value);
}

function normalize(value) {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("en-US");
}

function integerOption(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return fallback;
  return number;
}

function requiredValue(args, index, option) {
  const value = args[index + 1];
  if (!value || String(value).startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

export function parseOfflineEvidenceCollectorArgs(args = []) {
  const parsed = { limit: OFFLINE_EVIDENCE_DEFAULT_LIMIT, type: "all", country: "", dryRun: false, resume: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index]);
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--resume") parsed.resume = true;
    else if (arg === "--limit") {
      const value = Number(requiredValue(args, index, arg));
      if (!Number.isInteger(value) || value < 1 || value > OFFLINE_EVIDENCE_MAX_LIMIT) {
        throw new Error(`--limit must be an integer between 1 and ${OFFLINE_EVIDENCE_MAX_LIMIT}`);
      }
      parsed.limit = value;
      index += 1;
    } else if (arg === "--type") {
      const value = clean(requiredValue(args, index, arg));
      if (!ALLOWED_TYPES.has(value)) throw new Error("--type must be route-leg, season, or all");
      parsed.type = value;
      index += 1;
    } else if (arg === "--country") {
      parsed.country = clean(requiredValue(args, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return parsed;
}

export function isRouteV2OfflineEvidenceCollectionEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_FLAG, false);
}

function countryEntity(repository, countryEntityId) {
  return repository?.getEntity?.(countryEntityId) || null;
}

export function createOfflineEvidenceEntityResolver({ repository = null, fallbacks = {} } = {}) {
  const entitiesByAlias = new Map();
  const countriesByAlias = new Map();
  const countries = repository?.listCountries?.() || [];
  const cities = repository?.listCities?.() || [];

  function addAlias(index, alias, value) {
    const key = normalize(alias);
    if (key && !index.has(key)) index.set(key, structuredClone(value));
  }

  for (const country of countries) {
    const normalizedCountry = {
      entityId: clean(country.entityId),
      wikidataId: clean(country.wikidataId),
      countryCode: clean(country.isoAlpha2).toUpperCase(),
      name: clean(country.canonicalNameEn || country.canonicalNameZh),
      canonicalNameEn: clean(country.canonicalNameEn),
      canonicalNameZh: clean(country.canonicalNameZh),
      aliases: uniqueStrings(country.aliases || []),
    };
    for (const alias of [normalizedCountry.entityId, normalizedCountry.wikidataId, normalizedCountry.countryCode, normalizedCountry.name, normalizedCountry.canonicalNameEn, normalizedCountry.canonicalNameZh, ...normalizedCountry.aliases]) {
      addAlias(countriesByAlias, alias, normalizedCountry);
    }
  }

  for (const city of cities) {
    const parent = countryEntity(repository, city.parentCountryEntityId);
    const normalizedCity = {
      entityId: clean(city.entityId),
      wikidataId: clean(city.wikidataId),
      countryEntityId: clean(city.parentCountryEntityId),
      countryCode: clean(parent?.isoAlpha2).toUpperCase(),
      countryName: clean(parent?.canonicalNameEn || parent?.canonicalNameZh),
      name: clean(city.canonicalNameEn || city.canonicalNameZh),
      canonicalNameEn: clean(city.canonicalNameEn),
      canonicalNameZh: clean(city.canonicalNameZh),
      aliases: uniqueStrings(city.aliases || []),
    };
    for (const alias of [normalizedCity.entityId, normalizedCity.wikidataId, normalizedCity.name, normalizedCity.canonicalNameEn, normalizedCity.canonicalNameZh, ...normalizedCity.aliases]) {
      addAlias(entitiesByAlias, alias, normalizedCity);
    }
  }

  for (const [countryCode, destinations] of Object.entries(fallbacks || {})) {
    const country = countriesByAlias.get(normalize(countryCode)) || { countryCode: clean(countryCode).toUpperCase(), name: clean(countryCode) };
    for (const destination of Array.isArray(destinations) ? destinations : []) {
      const normalizedDestination = {
        entityId: clean(destination.entityId),
        wikidataId: clean(destination.wikidataId || destination.qid),
        countryEntityId: clean(country.entityId),
        countryCode: clean(country.countryCode || countryCode).toUpperCase(),
        countryName: clean(country.name || country.canonicalNameEn || country.canonicalNameZh),
        name: clean(destination.sourceTitle || destination.name),
        canonicalNameEn: clean(destination.sourceTitle),
        canonicalNameZh: clean(destination.name),
        aliases: uniqueStrings(destination.aliases || []),
      };
      for (const alias of [normalizedDestination.entityId, normalizedDestination.wikidataId, normalizedDestination.name, normalizedDestination.canonicalNameEn, normalizedDestination.canonicalNameZh, ...normalizedDestination.aliases]) {
        addAlias(entitiesByAlias, alias, normalizedDestination);
      }
    }
  }

  function resolveEntity(value) {
    const key = normalize(value);
    const entity = entitiesByAlias.get(key);
    return entity ? structuredClone(entity) : {
      entityId: clean(value),
      wikidataId: clean(value),
      countryEntityId: "",
      countryCode: "",
      countryName: "",
      name: clean(value),
      canonicalNameEn: "",
      canonicalNameZh: "",
      aliases: [],
    };
  }

  function matchesCountry(context = {}, filter = "") {
    const normalizedFilter = normalize(filter);
    if (!normalizedFilter) return true;
    const targetCountry = countriesByAlias.get(normalizedFilter);
    const acceptedAliases = new Set([
      normalizedFilter,
      ...(targetCountry ? [targetCountry.entityId, targetCountry.wikidataId, targetCountry.countryCode, targetCountry.name, targetCountry.canonicalNameEn, targetCountry.canonicalNameZh] : []).map(normalize),
    ]);
    return [
      ...(context.countryCodes || []),
      ...(context.countryEntityIds || []),
      ...(context.countryNames || []),
      ...(context.entityIds || []),
    ].some((value) => acceptedAliases.has(normalize(value)));
  }

  return { resolveEntity, matchesCountry };
}

function buildTaskContext(task, repository, entityResolver) {
  if (task.evidenceType === "route-leg") {
    const record = repository.routeLegStore.get(task.legEvidenceId);
    if (!record) return { ready: false, reason: "route-leg-evidence-record-missing" };
    const from = entityResolver.resolveEntity(record.fromEntityId);
    const to = entityResolver.resolveEntity(record.toEntityId);
    return {
      ready: true,
      record,
      from,
      to,
      transportMode: record.transportMode,
      query: `${from.canonicalNameEn || from.name} to ${to.canonicalNameEn || to.name} official ${record.transportMode === "unknown" ? "transport" : record.transportMode} travel time timetable`,
      countryCodes: uniqueStrings([from.countryCode, to.countryCode]),
      countryEntityIds: uniqueStrings([from.countryEntityId, to.countryEntityId]),
      countryNames: uniqueStrings([from.countryName, to.countryName]),
      entityIds: uniqueStrings([record.fromEntityId, record.toEntityId]),
    };
  }
  const record = repository.seasonStore.get(task.seasonEvidenceId);
  if (!record) return { ready: false, reason: "season-evidence-record-missing" };
  const entity = entityResolver.resolveEntity(record.entityId);
  const monthName = MONTH_NAME_BY_NUMBER[record.month] || `month ${record.month}`;
  return {
    ready: true,
    record,
    entity,
    month: record.month,
    query: `${entity.canonicalNameEn || entity.name} ${monthName} official winter closure transport restriction`,
    countryCodes: uniqueStrings([entity.countryCode]),
    countryEntityIds: uniqueStrings([entity.countryEntityId]),
    countryNames: uniqueStrings([entity.countryName]),
    entityIds: uniqueStrings([record.entityId]),
  };
}

const MONTH_NAME_BY_NUMBER = Object.freeze({
  1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
  7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
});

function allowedStatuses(resume) {
  return resume ? new Set(["pending", "needs-review", "collecting"]) : new Set(["pending"]);
}

export function selectOfflineEvidenceTasks({
  repository,
  entityResolver,
  limit = OFFLINE_EVIDENCE_DEFAULT_LIMIT,
  type = "all",
  country = "",
  resume = false,
  maxAttempts = OFFLINE_EVIDENCE_DEFAULT_MAX_ATTEMPTS,
} = {}) {
  if (!repository?.missingEvidenceStore) throw new Error("OFFLINE_EVIDENCE_MANIFEST_STORE_REQUIRED");
  if (!entityResolver?.resolveEntity || !entityResolver?.matchesCountry) throw new Error("OFFLINE_EVIDENCE_ENTITY_RESOLVER_REQUIRED");
  if (!ALLOWED_TYPES.has(type)) throw new Error("OFFLINE_EVIDENCE_TYPE_INVALID");
  const safeLimit = integerOption(limit, OFFLINE_EVIDENCE_DEFAULT_LIMIT, { max: OFFLINE_EVIDENCE_MAX_LIMIT });
  const safeMaxAttempts = integerOption(maxAttempts, OFFLINE_EVIDENCE_DEFAULT_MAX_ATTEMPTS, { max: 10 });
  const statuses = allowedStatuses(resume);
  return repository.missingEvidenceStore.list()
    .filter((task) => statuses.has(task.status))
    .filter((task) => task.attemptCount < safeMaxAttempts)
    .filter((task) => type === "all" || task.evidenceType === type)
    .map((task) => ({ task, context: buildTaskContext(task, repository, entityResolver) }))
    .filter((entry) => entry.context.ready)
    .filter((entry) => entityResolver.matchesCountry(entry.context, country))
    .sort((left, right) => right.task.priority - left.task.priority || left.task.missingEvidenceId.localeCompare(right.task.missingEvidenceId, "en"))
    .slice(0, safeLimit)
    .map((entry) => ({ task: structuredClone(entry.task), context: structuredClone(entry.context) }));
}

function emptyStats() {
  return {
    claimed: 0,
    resolved: 0,
    needsReview: 0,
    retryableFailures: 0,
    permanentFailures: 0,
    routeLegEvidenceWritten: 0,
    seasonEvidenceWritten: 0,
    duplicateSkipped: 0,
    resolvedSkipped: 0,
    networkRequests: 0,
    durationMs: 0,
  };
}

function transition(repository, task, status, { attempted = false, code = "", message = "" } = {}) {
  return repository.missingEvidenceStore.updateCollectionState(task.missingEvidenceId, {
    status,
    attempted,
    diagnostic: { code, message },
  });
}

function providerConfigured(provider) {
  return Boolean(provider?.searchEvidence && provider?.capabilities?.configured !== false);
}

function sanitizedTaskResult(task, status, reason) {
  return { missingEvidenceId: task.missingEvidenceId, evidenceType: task.evidenceType, status, reason: clean(reason) };
}

export async function collectOfflineEvidenceBatch({
  repository,
  provider,
  entityResolver,
  env = process.env,
  limit = OFFLINE_EVIDENCE_DEFAULT_LIMIT,
  type = "all",
  country = "",
  dryRun = false,
  resume = false,
  maxAttempts = OFFLINE_EVIDENCE_DEFAULT_MAX_ATTEMPTS,
  concurrency = OFFLINE_EVIDENCE_DEFAULT_CONCURRENCY,
  timeoutMs = null,
  maxRetries = null,
  now = () => new Date().toISOString(),
  clock = () => Date.now(),
} = {}) {
  const startedAt = clock();
  const stats = emptyStats();
  if (!isRouteV2OfflineEvidenceCollectionEnabled(env)) {
    return { ok: false, stopped: true, reason: "offline-evidence-collection-disabled", dryRun: Boolean(dryRun), stats, tasks: [] };
  }
  const selected = selectOfflineEvidenceTasks({ repository, entityResolver, limit, type, country, resume, maxAttempts });
  const resolvedCount = repository.missingEvidenceStore.list()
    .filter((task) => task.status === "resolved")
    .filter((task) => type === "all" || task.evidenceType === type)
    .map((task) => buildTaskContext(task, repository, entityResolver))
    .filter((context) => context.ready && entityResolver.matchesCountry(context, country))
    .length;
  stats.resolvedSkipped = resolvedCount;
  if (dryRun) {
    stats.durationMs = Math.max(0, clock() - startedAt);
    return {
      ok: true,
      stopped: false,
      reason: "dry-run",
      dryRun: true,
      stats,
      tasks: selected.map(({ task, context }) => ({
        missingEvidenceId: task.missingEvidenceId,
        evidenceType: task.evidenceType,
        priority: task.priority,
        query: context.query,
      })),
    };
  }
  if (!providerConfigured(provider)) {
    stats.durationMs = Math.max(0, clock() - startedAt);
    return { ok: false, stopped: true, reason: "provider-not-configured", dryRun: false, stats, tasks: [] };
  }

  const results = new Array(selected.length);
  let cursor = 0;
  const safeConcurrency = integerOption(concurrency, OFFLINE_EVIDENCE_DEFAULT_CONCURRENCY, { max: 4 });

  async function processEntry(entry, resultIndex) {
    const { task, context } = entry;
    const collecting = transition(repository, task, "collecting", {
      attempted: true,
      code: "collection-started",
      message: "Offline evidence collection started.",
    });
    if (collecting?.persisted !== true) {
      stats.permanentFailures += 1;
      results[resultIndex] = sanitizedTaskResult(task, "failed", collecting?.reason || "manifest-collecting-transition-failed");
      return;
    }
    stats.claimed += 1;
    let providerResult;
    try {
      providerResult = await provider.searchEvidence({
        query: context.query,
        limit: 5,
        timeoutMs,
        maxRetries,
      });
    } catch (error) {
      providerResult = { ok: false, configured: true, attempted: true, attempts: 1, failure: /timeout/iu.test(error?.message || "") ? "timeout" : "provider-error", results: [], retrievedAt: now() };
    }
    stats.networkRequests += Math.max(0, Number(providerResult?.attempts) || (providerResult?.attempted ? 1 : 0));
    if (!providerResult?.ok) {
      const failure = clean(providerResult?.failure || "provider-error");
      const status = RETRYABLE_FAILURES.has(failure) ? "pending" : "failed";
      const failureTransition = transition(repository, task, status, { code: failure, message: `Evidence provider failed: ${failure}.` });
      if (failureTransition?.persisted !== true) {
        stats.permanentFailures += 1;
        results[resultIndex] = sanitizedTaskResult(task, "failed", failureTransition?.reason || "manifest-failure-transition-failed");
        return;
      }
      if (status === "pending") stats.retryableFailures += 1;
      else stats.permanentFailures += 1;
      results[resultIndex] = sanitizedTaskResult(task, status, failure);
      return;
    }
    const retrievedAt = clean(providerResult.retrievedAt) || now();
    const adapted = task.evidenceType === "route-leg"
      ? adaptRouteLegEvidenceResults({ record: context.record, context: { ...context, retrievedAt }, results: providerResult.results, retrievedAt })
      : adaptSeasonEvidenceResults({ record: context.record, context: { ...context, retrievedAt }, results: providerResult.results, retrievedAt });
    if (adapted.outcome === "pending") {
      const pendingTransition = transition(repository, task, "pending", {
        code: adapted.reason,
        message: `No reliable source was persisted: ${adapted.reason}.`,
      });
      if (pendingTransition?.persisted !== true) {
        stats.permanentFailures += 1;
        results[resultIndex] = sanitizedTaskResult(task, "failed", pendingTransition?.reason || "manifest-pending-transition-failed");
        return;
      }
      stats.retryableFailures += 1;
      results[resultIndex] = sanitizedTaskResult(task, "pending", adapted.reason);
      return;
    }
    if (adapted.outcome === "failed" || !adapted.record) {
      const adaptedTransition = transition(repository, task, adapted.outcome === "needs-review" ? "needs-review" : "failed", {
        code: adapted.reason,
        message: `Evidence extraction did not produce a publishable local fact: ${adapted.reason}.`,
      });
      if (adaptedTransition?.persisted !== true) {
        stats.permanentFailures += 1;
        results[resultIndex] = sanitizedTaskResult(task, "failed", adaptedTransition?.reason || "manifest-adapter-transition-failed");
        return;
      }
      if (adapted.outcome === "needs-review") stats.needsReview += 1;
      else stats.permanentFailures += 1;
      results[resultIndex] = sanitizedTaskResult(task, adapted.outcome === "needs-review" ? "needs-review" : "failed", adapted.reason);
      return;
    }
    if (adapted.outcome === "needs-review" && adapted.sourceCount === 0) {
      const noFactTransition = transition(repository, task, "needs-review", {
        code: adapted.reason,
        message: `No qualified fact was persisted: ${adapted.reason}.`,
      });
      if (noFactTransition?.persisted !== true) {
        stats.permanentFailures += 1;
        results[resultIndex] = sanitizedTaskResult(task, "failed", noFactTransition?.reason || "manifest-no-fact-transition-failed");
        return;
      }
      stats.needsReview += 1;
      results[resultIndex] = sanitizedTaskResult(task, "needs-review", adapted.reason);
      return;
    }
    const store = task.evidenceType === "route-leg" ? repository.routeLegStore : repository.seasonStore;
    const write = store.upsert(adapted.record);
    if (write?.persisted !== true) {
      transition(repository, task, "failed", { code: write?.reason || "evidence-write-failed", message: "Atomic evidence upsert failed." });
      stats.permanentFailures += 1;
      results[resultIndex] = sanitizedTaskResult(task, "failed", write?.reason || "evidence-write-failed");
      return;
    }
    const indexed = task.evidenceType === "route-leg"
      ? repository.index.getRouteLegById(adapted.record.legEvidenceId)
      : repository.index.getSeasonById(adapted.record.seasonEvidenceId);
    if (!indexed) {
      transition(repository, task, "failed", { code: "evidence-index-refresh-failed", message: "Persisted evidence was not visible in the local index." });
      stats.permanentFailures += 1;
      results[resultIndex] = sanitizedTaskResult(task, "failed", "evidence-index-refresh-failed");
      return;
    }
    if (write.skipped) stats.duplicateSkipped += 1;
    else if (task.evidenceType === "route-leg") stats.routeLegEvidenceWritten += 1;
    else stats.seasonEvidenceWritten += 1;
    const finalStatus = adapted.outcome === "resolved" ? "resolved" : "needs-review";
    const finalTransition = transition(repository, task, finalStatus, { code: adapted.reason, message: `Offline evidence collection completed with status ${finalStatus}.` });
    if (finalTransition?.persisted !== true) {
      stats.permanentFailures += 1;
      results[resultIndex] = sanitizedTaskResult(task, "failed", finalTransition?.reason || "manifest-final-transition-failed");
      return;
    }
    if (finalStatus === "resolved") stats.resolved += 1;
    else stats.needsReview += 1;
    results[resultIndex] = sanitizedTaskResult(task, finalStatus, adapted.reason);
  }

  async function worker() {
    while (cursor < selected.length) {
      const resultIndex = cursor;
      cursor += 1;
      await processEntry(selected[resultIndex], resultIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeConcurrency, selected.length || 1) }, () => worker()));
  stats.durationMs = Math.max(0, clock() - startedAt);
  return {
    ok: stats.permanentFailures === 0,
    stopped: false,
    reason: stats.permanentFailures ? "batch-completed-with-permanent-failures" : "batch-complete",
    dryRun: false,
    stats,
    tasks: results.filter(Boolean),
  };
}
