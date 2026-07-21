import { routeLegEvidenceKey } from "./route-leg-evidence-schema.mjs";
import { seasonEvidenceKey } from "./season-evidence-schema.mjs";

function clone(value) {
  return value == null ? value : structuredClone(value);
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
    const routeLegRecords = routeLegStore.list();
    const seasonRecords = seasonStore.list();
    const missingRecords = missingEvidenceStore.list();
    cache = {
      routeLegById: new Map(routeLegRecords.map((record) => [record.legEvidenceId, record])),
      routeLegByKey: new Map(routeLegRecords.map((record) => [routeLegEvidenceKey(record), record])),
      seasonById: new Map(seasonRecords.map((record) => [record.seasonEvidenceId, record])),
      seasonByKey: new Map(seasonRecords.map((record) => [seasonEvidenceKey(record), record])),
      missingById: new Map(missingRecords.map((record) => [record.missingEvidenceId, record])),
      missingByTarget: new Map(missingRecords.map((record) => [`${record.evidenceType}|${record.targetKey}`, record])),
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

  function getSeasonById(seasonEvidenceId) {
    ensureLoaded();
    return clone(cache.seasonById.get(String(seasonEvidenceId || "")) || null);
  }

  function getSeason(input = {}) {
    ensureLoaded();
    return clone(cache.seasonByKey.get(seasonEvidenceKey(input)) || null);
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
    getSeasonById,
    getSeason,
    getMissing,
    getMissingByTarget,
    getRouteEvidence,
    reload,
    reset,
    stats,
  };
}
