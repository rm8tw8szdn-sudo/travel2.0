import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import {
  BROAD_STRUCTURAL_POI_ROOT_QIDS,
  evaluatePoiTypeIdsForConsumer,
  evaluatePoiTypePaths,
} from "../src/lib/routes/knowledge-poi-semantic-admission.mjs";
import { semanticFactFromWikidataEntity } from "../src/lib/routes/knowledge-semantic-gate.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const policy = readJson("data/knowledge/semantic/knowledge-semantic-type-policy.json");
const audit = readJson("data/knowledge/reports/knowledge-poi-positive-admission-audit.json");
const corrections = readJson("data/knowledge/semantic/production-integrity-corrections.json");
const exceptionDocument = readJson("data/knowledge/semantic/knowledge-semantic-exceptions.json");
const facts = new Map();

function visit(value, source) {
  if (Array.isArray(value)) {
    value.forEach((entry) => visit(entry, source));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (/^Q\d+$/u.test(String(value.id || "")) && value.labels && value.claims) {
    const fact = semanticFactFromWikidataEntity(value, source);
    if (fact) facts.set(fact.qid, fact);
    return;
  }
  Object.values(value).forEach((entry) => visit(entry, source));
}

for (const name of fs.readdirSync(path.join(ROOT, "data/knowledge/raw")).filter((entry) => entry.endsWith(".wikidata.json")).sort()) {
  const sourcePath = `data/knowledge/raw/${name}`;
  const raw = readJson(sourcePath);
  visit(raw, { sourcePath, retrievedAt: raw.retrievedAt });
}
for (const [qid, correction] of Object.entries(corrections.entities || {})) {
  facts.set(qid, { ...facts.get(qid), ...correction, qid });
}

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const publishedPois = repository.listPois();
const countryByEntityId = new Map(countries.map((entity) => [entity.entityId, entity]));
const cityByEntityId = new Map(cities.map((entity) => [entity.entityId, entity]));
const publishedIds = new Set(publishedPois.map((entry) => entry.entityId));
const quarantinedIds = new Set(audit.quarantined.map((entry) => entry.entityId));
const quarantinedQids = new Set(audit.quarantined.map((entry) => entry.wikidataId));
const compositeIds = new Set((policy.compositeAllowances || []).map((entry) => entry.entityId));
const exactMissingTypeExceptionIds = new Set((exceptionDocument.exceptions || []).filter((entry) => {
  if (entry.reviewStatus !== "approved" || entry.kind !== "poi" || entry.code !== "instance-type-missing") return false;
  const poi = publishedPois.find((candidate) => candidate.entityId === entry.entityId);
  const parentCity = cityByEntityId.get(poi?.parentCityEntityId);
  const country = countryByEntityId.get(parentCity?.parentCountryEntityId);
  return poi?.wikidataId === entry.qid
    && poi.parentCityEntityId === entry.parentEntityId
    && country?.wikidataId === entry.expectedCountryQid;
}).map((entry) => entry.entityId));
const failures = [];
for (const poi of publishedPois) {
  const fact = facts.get(poi.wikidataId);
  const admission = evaluatePoiTypeIdsForConsumer("positive-admission-verifier", fact?.instanceOfIds || [], policy);
  if (!admission.accepted
    && !compositeIds.has(poi.entityId)
    && !exactMissingTypeExceptionIds.has(poi.entityId)) {
    failures.push({ entityId: poi.entityId, wikidataId: poi.wikidataId, paths: admission.paths });
  }
}
assert.deepEqual(failures, [], "all published POIs must have specific visitor-facing type admission");
assert.equal(audit.before.publishedPois, audit.after.publishedPois + audit.after.quarantinedPois);
assert.equal(audit.before.candidatePois, audit.before.publishedPois);
assert.equal(audit.after.publishedPois, publishedPois.length);
assert.equal(audit.quarantined.length, audit.after.quarantinedPois);
assert.equal(audit.publishedAdmissions.length, publishedPois.length);
assert.deepEqual(new Set(audit.publishedAdmissions.map((entry) => entry.entityId)), publishedIds);
assert.equal(audit.quarantined.every((entry) => !publishedIds.has(entry.entityId)), true, "quarantined POIs must not remain published");
const selectionFiles = fs.readdirSync(path.join(ROOT, "data/knowledge/batches")).filter((name) => /^selection\.p1b-batch\d+\.json$/u.test(name));
for (const name of selectionFiles) {
  const selection = readJson(`data/knowledge/batches/${name}`);
  for (const poi of selection.pois || []) {
    assert.equal(quarantinedIds.has(poi.entityId), false, `${name}: quarantined entityId remained selected`);
    assert.equal(quarantinedQids.has(poi.wikidataId), false, `${name}: quarantined QID remained selected`);
  }
}
const provenanceFiles = fs.readdirSync(path.join(ROOT, "data/knowledge/batches")).filter((name) => /^provenance\.knowledge-expansion-batch\d+-wave\d+\.json$/u.test(name));
for (const name of provenanceFiles) {
  const provenance = readJson(`data/knowledge/batches/${name}`);
  for (const qid of provenance.publishedEntityQids || []) {
    assert.equal(quarantinedQids.has(qid), false, `${name}: quarantined QID remained in published provenance`);
  }
}
const centroPenal = audit.quarantined.find((entry) => entry.wikidataId === "Q17624835");
assert(centroPenal, "Centro Penal must be present in the quarantine audit");
assert.equal(centroPenal.classification, "C");
assert(centroPenal.reasonCodes.includes("explicit-penal-identity"));
assert.equal(centroPenal.disposition, "quarantined-not-published");
for (const relativePath of [
  "data/knowledge/reports/knowledge-expansion-batch09-route-consumption.json",
  "data/knowledge/reports/knowledge-expansion-batch09-browser-acceptance.json",
  "data/route-v2/images/image-coverage-manifest.json",
]) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  assert.equal(source.includes(centroPenal.entityId), false, `${relativePath}: Centro Penal entityId consumer reference`);
  assert.equal(source.includes(centroPenal.wikidataId), false, `${relativePath}: Centro Penal QID consumer reference`);
}

const mutations = [
  ["prison-as-core-poi", [["Q40357", "Q811979"]], false],
  ["detention-facility-as-core-poi", [["Q40357", "Q811979"]], false],
  ["generic-building-only-as-core-poi", [["Q41176"]], false],
  ["building-subclass-as-core-poi", [["Q900001", "Q41176"]], false],
  ["facility-subclass-as-core-poi", [["Q900002", "Q13226383"]], false],
  ["multi-hop-building-as-core-poi", [["Q900003", "Q900004", "Q41176"]], false],
  ["multi-hop-facility-as-core-poi", [["Q900005", "Q900006", "Q13226383"]], false],
  ["museum-building-as-core-poi", [["Q33506", "Q41176"]], true],
  ["monument-building-as-core-poi", [["Q4989906", "Q811979", "Q41176"]], true],
  ["gallery-structure-as-core-poi", [["Q1007870", "Q15090615", "Q811979"]], true],
  ["temple-complex-facility-as-core-poi", [["Q58621988", "Q1497364", "Q13226383"]], true],
  ["broad-plus-attraction-as-core-poi", [["Q900007", "Q41176"], ["Q570116"]], true],
  ["operational-plus-attraction-as-core-poi", [["Q40357", "Q13226383"], ["Q570116"]], false],
  ["cyclic-subclass-chain", [["Q900008", "Q900009", "Q900008", "Q41176"]], false],
];
for (const [label, paths, expected] of mutations) {
  assert.equal(evaluatePoiTypePaths(paths).accepted, expected, label);
}

const broadRoots = new Set(BROAD_STRUCTURAL_POI_ROOT_QIDS);
const multiLevelBroadPaths = Object.entries(policy.typeClassifications).flatMap(([typeQid, classification]) => {
  const path = classification?.allowedKinds?.poi;
  return Array.isArray(path) && path.length > 1 && broadRoots.has(path.at(-1)) ? [{ typeQid, path }] : [];
});
assert.equal(audit.multiLevelBroadRootAudit.total, multiLevelBroadPaths.length);
assert.equal(audit.multiLevelBroadRootAudit.entries.length, multiLevelBroadPaths.length);
assert.equal(
  audit.multiLevelBroadRootAudit.travelPositive
    + audit.multiLevelBroadRootAudit.broadStructuralOnly
    + audit.multiLevelBroadRootAudit.operationalUnsuitable
    + audit.multiLevelBroadRootAudit.unsafeUnresolved,
  audit.multiLevelBroadRootAudit.total,
);

console.log(JSON.stringify({
  verifier: "knowledge-poi-positive-admission",
  status: "PASS",
  publishedPoisChecked: publishedPois.length,
  quarantinedPoisChecked: audit.quarantined.length,
  selectionFilesChecked: selectionFiles.length,
  provenanceFilesChecked: provenanceFiles.length,
  classificationsBefore: audit.before.classifications,
  multiLevelBroadRootAudit: Object.fromEntries(Object.entries(audit.multiLevelBroadRootAudit).filter(([key]) => key !== "entries")),
  mutations: mutations.length,
  centroPenalPublished: publishedIds.has(centroPenal.entityId),
}, null, 2));
