import { routeLegEvidenceKey } from "./route-leg-evidence-schema.mjs";
import { seasonEvidenceKey } from "./season-evidence-schema.mjs";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function clean(value) {
  return String(value || "").trim();
}

function endpointKey(input = {}) {
  return `${clean(input.fromEntityId)}>${clean(input.toEntityId)}`;
}

function scopedDiagnostics(entries = [], predicate = () => false) {
  return entries
    .filter((entry) => entry?.ok === false && (!entry.record || predicate(entry.record)))
    .map((entry) => ({
      type: clean(entry.type),
      index: Number.isInteger(entry.index) ? entry.index : -1,
      recordId: clean(entry.recordId),
      reasons: Array.isArray(entry.reasons) ? [...entry.reasons] : [],
      error: clean(entry.error),
    }));
}

export function createLocalEvidenceIndex({ routeLegStore, seasonStore, missingEvidenceStore } = {}) {
  if (!routeLegStore || !seasonStore || !missingEvidenceStore) throw new Error("LOCAL_EVIDENCE_INDEX_STORES_REQUIRED");
  let cache = null;
  let loadedRevisions = null;
  let loadCount = 0;

  function revisions() {
    return {
      routeLeg: routeLegStore.revision(),
      season: seasonStore.revision(),
      missing: missingEvidenceStore.revision(),
    };
  }

  function current(revision) {
    return loadedRevisions
      && loadedRevisions.routeLeg === revision.routeLeg
      && loadedRevisions.season === revision.season
      && loadedRevisions.missing === revision.missing;
  }

  function reload() {
    const routeLegSnapshot = typeof routeLegStore.snapshot === "function"
      ? routeLegStore.snapshot()
      : { records: routeLegStore.list(), entries: [], diagnostics: [] };
    const seasonSnapshot = typeof seasonStore.snapshot === "function"
      ? seasonStore.snapshot()
      : { records: seasonStore.list(), entries: [], diagnostics: [] };
    const routeLegRecords = routeLegSnapshot.records || [];
    const seasonRecords = seasonSnapshot.records || [];
    const missingRecords = missingEvidenceStore.list();
    const routeLegByEndpoints = new Map();
    for (const record of routeLegRecords) {
      const key = endpointKey(record);
      const records = routeLegByEndpoints.get(key) || [];
      records.push(record);
      routeLegByEndpoints.set(key, records);
    }
    for (const records of routeLegByEndpoints.values()) {
      records.sort((left, right) => String(left.transportMode).localeCompare(String(right.transportMode), "en")
        || String(left.legEvidenceId).localeCompare(String(right.legEvidenceId), "en"));
    }
    cache = {
      routeLegById: new Map(routeLegRecords.map((record) => [record.legEvidenceId, record])),
      routeLegByKey: new Map(routeLegRecords.map((record) => [routeLegEvidenceKey(record), record])),
      routeLegByEndpoints,
      seasonById: new Map(seasonRecords.map((record) => [record.seasonEvidenceId, record])),
      seasonByKey: new Map(seasonRecords.map((record) => [seasonEvidenceKey(record), record])),
      missingById: new Map(missingRecords.map((record) => [record.missingEvidenceId, record])),
      missingByTarget: new Map(missingRecords.map((record) => [`${record.evidenceType}|${record.targetKey}`, record])),
      routeLegEntries: routeLegSnapshot.entries || [],
      seasonEntries: seasonSnapshot.entries || [],
    };
    loadedRevisions = revisions();
    loadCount += 1;
    return stats();
  }

  function ensureLoaded() {
    const revision = revisions();
    if (!cache || !current(revision)) reload();
  }

  function reset() {
    cache = null;
    loadedRevisions = null;
  }

  function getRouteLegById(legEvidenceId) {
    ensureLoaded();
    return clone(cache.routeLegById.get(String(legEvidenceId || "")) || null);
  }

  function getRouteLeg(input = {}) {
    ensureLoaded();
    return clone(cache.routeLegByKey.get(routeLegEvidenceKey(input)) || null);
  }

  function getRouteLegsByEndpoints(input = {}) {
    ensureLoaded();
    return clone(cache.routeLegByEndpoints.get(endpointKey(input)) || []);
  }

  function getRouteLegDiagnostics(input = {}) {
    ensureLoaded();
    const fromEntityId = clean(input.fromEntityId);
    const toEntityId = clean(input.toEntityId);
    return clone(scopedDiagnostics(cache.routeLegEntries, (record) => (
      clean(record?.fromEntityId) === fromEntityId && clean(record?.toEntityId) === toEntityId
    )));
  }

  function getSeasonById(seasonEvidenceId) {
    ensureLoaded();
    return clone(cache.seasonById.get(String(seasonEvidenceId || "")) || null);
  }

  function getSeason(input = {}) {
    ensureLoaded();
    return clone(cache.seasonByKey.get(seasonEvidenceKey(input)) || null);
  }

  function getSeasonDiagnostics(input = {}) {
    ensureLoaded();
    const entityId = clean(input.entityId);
    const month = Number(input.month);
    return clone(scopedDiagnostics(cache.seasonEntries, (record) => (
      clean(record?.entityId) === entityId && Number(record?.month) === month
    )));
  }

  function getMissing(missingEvidenceId) {
    ensureLoaded();
    return clone(cache.missingById.get(String(missingEvidenceId || "")) || null);
  }

  function getMissingByTarget(evidenceType, targetKey) {
    ensureLoaded();
    return clone(cache.missingByTarget.get(`${String(evidenceType || "")}|${String(targetKey || "")}`) || null);
  }

  function getRouteEvidence({ destinationOrder = [], transportMode = "unknown", month = null } = {}) {
    ensureLoaded();
    const order = (Array.isArray(destinationOrder) ? destinationOrder : []).map((value) => String(value || "").trim()).filter(Boolean);
    const routeLegEvidence = order.slice(0, -1).map((fromEntityId, index) => (
      cache.routeLegByKey.get(routeLegEvidenceKey({ fromEntityId, toEntityId: order[index + 1], transportMode })) || null
    ));
    const seasonEvidence = month == null ? [] : order.map((entityId) => (
      cache.seasonByKey.get(seasonEvidenceKey({ entityId, month })) || null
    ));
    const missingEvidence = [
      ...routeLegEvidence.filter(Boolean).map((record) => cache.missingByTarget.get(`route-leg|${routeLegEvidenceKey(record)}`) || null),
      ...seasonEvidence.filter(Boolean).map((record) => cache.missingByTarget.get(`season|${seasonEvidenceKey(record)}`) || null),
    ];
    return clone({
      destinationOrder: order,
      routeLegEvidence,
      seasonEvidence,
      missingEvidence,
    });
  }

  function stats() {
    return {
      loaded: Boolean(cache),
      loadCount,
      loadedRevisions: clone(loadedRevisions),
      routeLegCount: cache?.routeLegById.size || 0,
      seasonCount: cache?.seasonById.size || 0,
      missingCount: cache?.missingById.size || 0,
      routeLegDiagnosticCount: cache?.routeLegEntries.filter((entry) => entry?.ok === false).length || 0,
      seasonDiagnosticCount: cache?.seasonEntries.filter((entry) => entry?.ok === false).length || 0,
      storeParseCounts: {
        routeLeg: routeLegStore.parseCount(),
        season: seasonStore.parseCount(),
        missing: missingEvidenceStore.parseCount(),
      },
    };
  }

  return {
    getRouteLegById,
    getRouteLeg,
    getRouteLegsByEndpoints,
    getRouteLegDiagnostics,
    getSeasonById,
    getSeason,
    getSeasonDiagnostics,
    getMissing,
    getMissingByTarget,
    getRouteEvidence,
    reload,
    reset,
    stats,
  };
}
