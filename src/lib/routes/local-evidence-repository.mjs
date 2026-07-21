import path from "node:path";
import { validateEvidenceBundleLifecycle } from "./evidence-bundle-schema.mjs";
import { createLocalEvidenceIndex } from "./local-evidence-index.mjs";
import { createMissingEvidenceManifestStore } from "./missing-evidence-manifest-store.mjs";
import { buildMissingRouteLegEvidence, routeLegEvidenceKey } from "./route-leg-evidence-schema.mjs";
import {
  createRouteLegEvidenceStore,
  isRouteV2LocalEvidenceIndexEnabled,
  ROUTE_V2_LOCAL_EVIDENCE_INDEX_FLAG,
} from "./route-leg-evidence-store.mjs";
import { buildMissingSeasonEvidence, normalizeEvidenceMonth, seasonEvidenceKey } from "./season-evidence-schema.mjs";
import { createSeasonEvidenceStore } from "./season-evidence-store.mjs";
import { cleanString, uniqueStrings } from "./route-v2-utils.mjs";
import { normalizeTimeIntent } from "./search-intent-parser.mjs";

function clean(value) {
  return cleanString(value);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function sameOrder(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function routeOrder(routeRecord = {}) {
  return (Array.isArray(routeRecord.destinationEntities) ? routeRecord.destinationEntities : [])
    .map((destination) => clean(destination?.wikidataId || destination?.entityId || destination?.id || destination?.qid || destination?.name))
    .filter(Boolean);
}

function contextMonths(context = {}) {
  if (context.timeIntent && typeof context.timeIntent === "object") {
    const timeIntent = normalizeTimeIntent(context.timeIntent);
    if (!["single-month", "month-range"].includes(timeIntent.type)) return [];
    return timeIntent.months;
  }
  const explicit = context.month ?? context.travelMonth ?? context.departureMonth
    ?? context.season ?? (Array.isArray(context.bestMonths) ? context.bestMonths[0] : null);
  const month = normalizeEvidenceMonth(explicit);
  return month ? [month] : [];
}

function failed(reason, diagnostics = [], error = "") {
  return {
    enabled: true,
    persisted: false,
    failed: true,
    reason,
    bundle: null,
    diagnostics: clone(diagnostics),
    error: clean(error),
  };
}

export { ROUTE_V2_LOCAL_EVIDENCE_INDEX_FLAG, isRouteV2LocalEvidenceIndexEnabled };

export function createLocalEvidenceRepository({
  env = process.env,
  storageRoot = null,
  routeLegStore = null,
  seasonStore = null,
  missingEvidenceStore = null,
  index = null,
  now = () => new Date().toISOString(),
} = {}) {
  const root = storageRoot || path.resolve(".route-v2-local-evidence");
  const legs = routeLegStore || createRouteLegEvidenceStore({
    storagePath: path.join(root, "route-leg-evidence.jsonl"), env, now,
  });
  const seasons = seasonStore || createSeasonEvidenceStore({
    storagePath: path.join(root, "season-evidence.jsonl"), env, now,
  });
  const missing = missingEvidenceStore || createMissingEvidenceManifestStore({
    storagePath: path.join(root, "missing-evidence-manifest.jsonl"), env, now,
  });
  const evidenceIndex = index || createLocalEvidenceIndex({
    routeLegStore: legs,
    seasonStore: seasons,
    missingEvidenceStore: missing,
  });

  function enabled() {
    return isRouteV2LocalEvidenceIndexEnabled(env);
  }

  async function linkEvidenceBundle({ bundle, routeRecord, evidenceBundleStore, context = {} } = {}) {
    if (!enabled()) {
      return { enabled: false, persisted: false, skipped: true, failed: false, reason: "local-evidence-index-disabled", bundle: clone(bundle) };
    }
    try {
      if (!bundle || !clean(bundle.evidenceBundleId)) return failed("evidence-bundle-missing");
      if (!routeRecord || !clean(routeRecord.id)) return failed("route-record-missing");
      if (!evidenceBundleStore?.upsertLifecycle) return failed("evidence-bundle-store-missing");
      if (clean(bundle.status) === "failed") return failed("failed-evidence-bundle-not-indexable");
      const destinationOrder = Array.isArray(bundle.destinationOrder) ? bundle.destinationOrder.map(clean).filter(Boolean) : [];
      const recordOrder = routeOrder(routeRecord);
      if (!sameOrder(destinationOrder, recordOrder)) {
        return failed("local-evidence-destination-order-mismatch", [{ code: "destination-order-mismatch", message: "EvidenceBundle and RouteRecord destination order differ." }]);
      }
      if (new Set(destinationOrder).size !== destinationOrder.length) return failed("local-evidence-destination-order-duplicate");

      const legRecords = [];
      for (let indexPosition = 0; indexPosition < destinationOrder.length - 1; indexPosition += 1) {
        const built = buildMissingRouteLegEvidence({
          fromEntityId: destinationOrder[indexPosition],
          toEntityId: destinationOrder[indexPosition + 1],
          transportMode: bundle.legs?.[indexPosition]?.transportMode || "unknown",
        }, { now });
        if (!built.created) return failed(built.reason || "route-leg-evidence-build-failed", built.reasons || []);
        legRecords.push(built.record);
      }
      const legWrite = legs.upsertMany(legRecords);
      if (legWrite.persisted !== true) return failed(legWrite.reason || "route-leg-evidence-write-failed", legWrite.reasons || legWrite.diagnostics || [], legWrite.error);

      const months = contextMonths(context);
      const seasonRecords = [];
      if (months.length) {
        for (const entityId of destinationOrder) {
          for (const month of months) {
            const built = buildMissingSeasonEvidence({ entityId, month }, { now });
            if (!built.created) return failed(built.reason || "season-evidence-build-failed", built.reasons || []);
            seasonRecords.push(built.record);
          }
        }
        const seasonWrite = seasons.upsertMany(seasonRecords);
        if (seasonWrite.persisted !== true) return failed(seasonWrite.reason || "season-evidence-write-failed", seasonWrite.reasons || seasonWrite.diagnostics || [], seasonWrite.error);
      }

      const missingInputs = [
        ...legRecords.map((record) => ({
          evidenceType: "route-leg",
          targetKey: routeLegEvidenceKey(record),
          legEvidenceId: record.legEvidenceId,
          requestedByBundleIds: [bundle.evidenceBundleId],
          selectedCandidate: true,
          critical: true,
          reason: "Selected route leg requires reusable transport evidence.",
        })),
        ...seasonRecords.map((record) => ({
          evidenceType: "season",
          targetKey: seasonEvidenceKey(record),
          seasonEvidenceId: record.seasonEvidenceId,
          requestedByBundleIds: [bundle.evidenceBundleId],
          selectedCandidate: true,
          critical: Boolean(context.seasonHardConstraint),
          reason: `Selected destination requires reusable evidence for month ${record.month}.`,
        })),
      ];
      const missingWrite = missing.aggregateMany(missingInputs);
      if (missingWrite.persisted !== true) return failed(missingWrite.reason || "missing-evidence-manifest-write-failed", missingWrite.reasons || missingWrite.diagnostics || [], missingWrite.error);

      const missingEvidenceRefs = missingInputs.map((input) => {
        const item = evidenceIndex.getMissingByTarget(input.evidenceType, input.targetKey);
        return item?.missingEvidenceId;
      }).filter(Boolean);
      const legEvidenceRefs = legRecords.map((record) => record.legEvidenceId);
      const seasonEvidenceRefs = seasonRecords.map((record) => record.seasonEvidenceId);
      const normalizedMissingEvidenceRefs = uniqueStrings(missingEvidenceRefs);
      const referencesUnchanged = bundle.evidenceReferenceMode === "public-evidence-references"
        && sameOrder(bundle.legEvidenceRefs || [], legEvidenceRefs)
        && sameOrder(bundle.seasonEvidenceRefs || [], seasonEvidenceRefs)
        && sameOrder(bundle.missingEvidenceRefs || [], normalizedMissingEvidenceRefs);
      const updatedBundle = {
        ...clone(bundle),
        evidenceReferenceMode: "public-evidence-references",
        legEvidenceRefs,
        seasonEvidenceRefs,
        missingEvidenceRefs: normalizedMissingEvidenceRefs,
        updatedAt: referencesUnchanged ? bundle.updatedAt : now(),
      };
      const validation = validateEvidenceBundleLifecycle(updatedBundle);
      if (!validation.accepted) return failed("referenced-evidence-bundle-invalid", validation.reasons);
      if (referencesUnchanged) {
        return {
          enabled: true,
          persisted: true,
          failed: false,
          skipped: true,
          reason: "local-evidence-unchanged",
          bundle: clone(validation.bundle),
          legEvidenceRefs: clone(validation.bundle.legEvidenceRefs),
          seasonEvidenceRefs: clone(validation.bundle.seasonEvidenceRefs),
          missingEvidenceRefs: clone(validation.bundle.missingEvidenceRefs),
          diagnostics: [],
        };
      }
      const bundleWrite = await evidenceBundleStore.upsertLifecycle(validation.bundle);
      if (bundleWrite?.persisted !== true) return failed(bundleWrite?.reason || "referenced-evidence-bundle-write-failed", bundleWrite?.reasons || bundleWrite?.diagnostics || [], bundleWrite?.error);
      return {
        enabled: true,
        persisted: true,
        failed: false,
        skipped: Boolean(bundleWrite.skipped),
        reason: bundleWrite.skipped ? "local-evidence-unchanged" : "local-evidence-references-persisted",
        bundle: clone(validation.bundle),
        legEvidenceRefs: clone(validation.bundle.legEvidenceRefs),
        seasonEvidenceRefs: clone(validation.bundle.seasonEvidenceRefs),
        missingEvidenceRefs: clone(validation.bundle.missingEvidenceRefs),
        diagnostics: [],
      };
    } catch (error) {
      return failed("local-evidence-index-sidecar-failed", [], error?.message || String(error));
    }
  }

  return {
    enabled,
    linkEvidenceBundle,
    routeLegStore: legs,
    seasonStore: seasons,
    missingEvidenceStore: missing,
    index: evidenceIndex,
  };
}
