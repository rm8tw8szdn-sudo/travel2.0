import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES } from "./japan-evidence-validation-pilot.mjs";
import { validateMissingEvidenceManifestItem } from "./missing-evidence-manifest-schema.mjs";
import { validateRouteLegEvidence } from "./route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "./season-evidence-schema.mjs";
import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const ROUTE_V2_EVIDENCE_SEED_SCHEMA_VERSION = "route-v2-evidence-seed-v1";
export const ROUTE_V2_EVIDENCE_SEED_ROOT = path.resolve("data", "route-v2", "evidence-seed");

const FILES = Object.freeze({
  routeLeg: "route-leg-evidence.jsonl",
  season: "season-evidence.jsonl",
  manifest: "evidence-seed-manifest.json",
});

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function clean(value) {
  return cleanString(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function readJsonl(filePath, { validate = () => ({ accepted: true }), idField = "id" } = {}) {
  if (!fs.existsSync(filePath)) return { records: [], diagnostics: [{ code: "source-file-missing", file: path.basename(filePath) }] };
  const records = [];
  const diagnostics = [];
  const seen = new Set();
  for (const [index, line] of fs.readFileSync(filePath, "utf8").split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      diagnostics.push({ code: "source-json-corrupt", file: path.basename(filePath), index, error: clean(error?.message || error) });
      continue;
    }
    const validation = validate(parsed);
    if (!validation.accepted) {
      diagnostics.push({ code: "source-schema-invalid", file: path.basename(filePath), index, recordId: clean(parsed?.[idField]), reasons: clone(validation.reasons || validation.missing || []) });
      continue;
    }
    const record = validation.record || parsed;
    const id = clean(record?.[idField]);
    if (seen.has(id)) {
      diagnostics.push({ code: "source-duplicate-id", file: path.basename(filePath), index, recordId: id });
      continue;
    }
    seen.add(id);
    records.push(clone(record));
  }
  records.sort((left, right) => clean(left?.[idField]).localeCompare(clean(right?.[idField]), "en"));
  return { records, diagnostics };
}

function sourceComplete(source = {}) {
  return Boolean(
    clean(source.sourceId)
    && /^https:\/\//u.test(clean(source.url))
    && clean(source.publisher)
    && /^official-/u.test(clean(source.sourceType))
    && clean(source.retrievedAt)
    && /^[a-f0-9]{64}$/u.test(clean(source.contentHash))
    && Array.isArray(source.supports)
    && source.supports.length
    && Number.isFinite(Number(source.confidence)),
  );
}

function commonEligibility(record = {}) {
  const reasons = [];
  if (!Array.isArray(record.sources) || !record.sources.length) reasons.push("official-source-required");
  if ((record.sources || []).some((source) => !sourceComplete(source))) reasons.push("source-metadata-incomplete");
  if (!Array.isArray(record.sourceRefs) || record.sourceRefs.length !== record.sources?.length) reasons.push("source-reference-incomplete");
  if (!clean(record.retrievedAt) || !clean(record.expiresAt)) reasons.push("record-lifecycle-incomplete");
  if (clean(record.freshnessStatus) !== "fresh") reasons.push("record-not-fresh");
  if (!Number.isFinite(Number(record.confidence))) reasons.push("record-confidence-missing");
  if (!Array.isArray(record.unknowns) || !Array.isArray(record.conflicts)) reasons.push("record-diagnostics-incomplete");
  if (record.conflicts?.length) reasons.push("record-conflict-unresolved");
  return reasons;
}

function routeLegEligibility(record = {}) {
  const reasons = commonEligibility(record);
  if (record.directed !== true) reasons.push("route-leg-must-be-directed");
  if (clean(record.feasibilityStatus) !== "feasible") reasons.push("route-leg-not-feasible");
  if (!Number.isFinite(Number(record.durationMinMinutes)) || !Number.isFinite(Number(record.durationMaxMinutes))) reasons.push("route-leg-duration-incomplete");
  const supports = (record.sources || []).flatMap((source) => source.supports || []);
  const prefix = `route-leg:${clean(record.fromEntityId)}>${clean(record.toEntityId)}:`;
  if (!supports.includes(`${prefix}feasibility`) || !supports.includes(`${prefix}duration`)) reasons.push("route-leg-key-facts-not-source-supported");
  return uniqueStrings(reasons);
}

function seasonEligibility(record = {}) {
  const reasons = commonEligibility(record);
  const supportedFact = clean(record.suitabilityStatus) === "suitable"
    || clean(record.suitabilityStatus) === "unsuitable"
    || (record.weatherRisks || []).length
    || (record.transportRisks || []).length
    || (record.closureRisks || []).length;
  if (!supportedFact) reasons.push("season-fact-incomplete");
  const prefix = `season:${clean(record.entityId)}:${Number(record.month)}:`;
  if (!(record.sources || []).some((source) => (source.supports || []).some((support) => clean(support).startsWith(prefix)))) reasons.push("season-key-fact-not-source-supported");
  return uniqueStrings(reasons);
}

function countryIds(country) {
  if (clean(country).toUpperCase() !== "JP") return new Set();
  return new Set(ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES.map((entity) => clean(entity.wikidataId)));
}

function matchesCountry(record, evidenceType, ids) {
  if (!ids.size) return false;
  return evidenceType === "route-leg"
    ? ids.has(clean(record.fromEntityId)) && ids.has(clean(record.toEntityId))
    : ids.has(clean(record.entityId));
}

function jsonl(records) {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

function stableManifest({ country, routeLegs, seasons }) {
  const routeLegEvidenceIds = routeLegs.map((record) => record.legEvidenceId);
  const seasonEvidenceIds = seasons.map((record) => record.seasonEvidenceId);
  const promotedEvidenceHash = stableHash({ routeLegs, seasons });
  return {
    schemaVersion: ROUTE_V2_EVIDENCE_SEED_SCHEMA_VERSION,
    country,
    routeLegEvidenceIds,
    seasonEvidenceIds,
    counts: { routeLeg: routeLegs.length, season: seasons.length, total: routeLegs.length + seasons.length },
    promotedEvidenceHash,
  };
}

function outputPayloads({ country, routeLegs, seasons }) {
  const manifest = stableManifest({ country, routeLegs, seasons });
  return new Map([
    [FILES.routeLeg, jsonl(routeLegs)],
    [FILES.season, jsonl(seasons)],
    [FILES.manifest, `${JSON.stringify(manifest, null, 2)}\n`],
  ]);
}

function existingConflicts(outputRoot, payloads) {
  const conflicts = [];
  let unchanged = true;
  for (const [name, payload] of payloads) {
    const target = path.join(outputRoot, name);
    if (!fs.existsSync(target)) {
      unchanged = false;
      continue;
    }
    const current = fs.readFileSync(target, "utf8");
    if (current !== payload) {
      unchanged = false;
      conflicts.push({ file: name, currentHash: sha256(current), proposedHash: sha256(payload) });
    }
  }
  return { conflicts, unchanged };
}

export function planEvidenceSeedPromotion({
  sourceRoot,
  outputRoot = ROUTE_V2_EVIDENCE_SEED_ROOT,
  country = "JP",
  type = "all",
} = {}) {
  const normalizedCountry = clean(country).toUpperCase();
  const normalizedType = ["route-leg", "season", "all"].includes(clean(type)) ? clean(type) : "all";
  const source = path.resolve(clean(sourceRoot));
  const manifestSnapshot = readJsonl(path.join(source, "missing-evidence-manifest.jsonl"), {
    validate: validateMissingEvidenceManifestItem,
    idField: "missingEvidenceId",
  });
  const routeLegSnapshot = readJsonl(path.join(source, FILES.routeLeg), { validate: validateRouteLegEvidence, idField: "legEvidenceId" });
  const seasonSnapshot = readJsonl(path.join(source, FILES.season), { validate: validateSeasonEvidence, idField: "seasonEvidenceId" });
  const routeLegById = new Map(routeLegSnapshot.records.map((record) => [record.legEvidenceId, record]));
  const seasonById = new Map(seasonSnapshot.records.map((record) => [record.seasonEvidenceId, record]));
  const ids = countryIds(normalizedCountry);
  const promotedRouteLegs = [];
  const promotedSeasons = [];
  const rejected = [];
  const skipped = [];

  for (const item of manifestSnapshot.records) {
    if (normalizedType !== "all" && item.evidenceType !== normalizedType) {
      skipped.push({ missingEvidenceId: item.missingEvidenceId, reason: "type-filtered" });
      continue;
    }
    if (item.status !== "resolved") {
      rejected.push({ missingEvidenceId: item.missingEvidenceId, evidenceType: item.evidenceType, targetKey: item.targetKey, reason: `manifest-status-${item.status}` });
      continue;
    }
    const record = item.evidenceType === "route-leg"
      ? routeLegById.get(item.legEvidenceId)
      : seasonById.get(item.seasonEvidenceId);
    if (!record) {
      rejected.push({ missingEvidenceId: item.missingEvidenceId, evidenceType: item.evidenceType, targetKey: item.targetKey, reason: "resolved-record-missing" });
      continue;
    }
    if (!matchesCountry(record, item.evidenceType, ids)) {
      skipped.push({ missingEvidenceId: item.missingEvidenceId, reason: "country-filtered" });
      continue;
    }
    const reasons = item.evidenceType === "route-leg" ? routeLegEligibility(record) : seasonEligibility(record);
    if (reasons.length) {
      rejected.push({ missingEvidenceId: item.missingEvidenceId, evidenceType: item.evidenceType, targetKey: item.targetKey, reason: "promotion-eligibility-failed", reasons });
      continue;
    }
    if (item.evidenceType === "route-leg") promotedRouteLegs.push(clone(record));
    else promotedSeasons.push(clone(record));
  }
  promotedRouteLegs.sort((left, right) => left.legEvidenceId.localeCompare(right.legEvidenceId, "en"));
  promotedSeasons.sort((left, right) => left.seasonEvidenceId.localeCompare(right.seasonEvidenceId, "en"));
  const payloads = outputPayloads({ country: normalizedCountry, routeLegs: promotedRouteLegs, seasons: promotedSeasons });
  const comparison = existingConflicts(path.resolve(outputRoot), payloads);
  return {
    ok: manifestSnapshot.diagnostics.length === 0 && routeLegSnapshot.diagnostics.length === 0 && seasonSnapshot.diagnostics.length === 0,
    sourceRoot: source,
    outputRoot: path.resolve(outputRoot),
    country: normalizedCountry,
    type: normalizedType,
    routeLegs: promotedRouteLegs,
    seasons: promotedSeasons,
    manifest: stableManifest({ country: normalizedCountry, routeLegs: promotedRouteLegs, seasons: promotedSeasons }),
    payloads,
    rejected,
    skipped,
    conflicts: comparison.conflicts,
    unchanged: comparison.unchanged,
    diagnostics: [...manifestSnapshot.diagnostics, ...routeLegSnapshot.diagnostics, ...seasonSnapshot.diagnostics],
    stats: {
      promoted: promotedRouteLegs.length + promotedSeasons.length,
      routeLeg: promotedRouteLegs.length,
      season: promotedSeasons.length,
      rejected: rejected.length,
      skipped: skipped.length,
      conflict: comparison.conflicts.length,
    },
  };
}

export function promoteEvidenceSeed(options = {}) {
  const plan = planEvidenceSeedPromotion(options);
  if (options.dryRun) return { ...plan, dryRun: true, written: false, changed: false };
  if (!plan.ok || plan.conflicts.length) return { ...plan, dryRun: false, written: false, changed: false };
  if (plan.unchanged) return { ...plan, dryRun: false, written: false, changed: false };
  fs.mkdirSync(plan.outputRoot, { recursive: true });
  const tempPaths = [];
  const committed = [];
  try {
    for (const [name, payload] of plan.payloads) {
      const target = path.join(plan.outputRoot, name);
      const temp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(temp, payload, "utf8");
      const backup = `${target}.${process.pid}.bak`;
      if (fs.existsSync(target)) fs.copyFileSync(target, backup);
      tempPaths.push({ temp, target, backup, hadTarget: fs.existsSync(target) });
    }
    for (const item of tempPaths) {
      fs.renameSync(item.temp, item.target);
      committed.push(item);
    }
  } catch (error) {
    for (const item of committed.reverse()) {
      if (item.hadTarget && fs.existsSync(item.backup)) fs.copyFileSync(item.backup, item.target);
      else if (!item.hadTarget && fs.existsSync(item.target)) fs.rmSync(item.target, { force: true });
    }
    return { ...plan, dryRun: false, written: false, changed: false, error: clean(error?.message || error) };
  } finally {
    for (const item of tempPaths) if (fs.existsSync(item.temp)) fs.rmSync(item.temp, { force: true });
    for (const item of tempPaths) if (fs.existsSync(item.backup)) fs.rmSync(item.backup, { force: true });
  }
  return { ...plan, dryRun: false, written: true, changed: true };
}
