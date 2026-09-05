import fs from "node:fs";
import path from "node:path";

import { KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";
import {
  BROAD_STRUCTURAL_POI_ROOT_QIDS,
  evaluatePoiTypeIdsForConsumer,
  evaluatePoiTypePaths,
} from "../src/lib/routes/knowledge-poi-semantic-admission.mjs";
import {
  canonicalizeEntityLayerAliases,
  createEntityLayerProvenanceEntry,
  createTypedEntityId,
  entityLayerDistanceKm,
} from "../src/lib/routes/knowledge-entity-layer-primitives.mjs";
import { semanticFactFromWikidataEntity } from "../src/lib/routes/knowledge-semantic-gate.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW_ROOT = path.join(ROOT, "data/knowledge/raw");
const POLICY_PATH = path.join(ROOT, "data/knowledge/semantic/knowledge-semantic-type-policy.json");
const CORRECTIONS_PATH = path.join(ROOT, "data/knowledge/semantic/production-integrity-corrections.json");
const EXCEPTIONS_PATH = path.join(ROOT, "data/knowledge/semantic/knowledge-semantic-exceptions.json");
const AUDIT_PATH = path.join(ROOT, "data/knowledge/reports/knowledge-poi-positive-admission-audit.json");
const GENERATED_AT = "2026-09-02T04:00:00.000Z";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function optionalJson(relativePath, fallback) {
  const filePath = path.join(ROOT, relativePath);
  return fs.existsSync(filePath) ? readJson(relativePath) : fallback;
}

function entityIds(entity = {}, propertyId) {
  return [...new Set((entity.claims?.[propertyId] || [])
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter((value) => /^Q\d+$/u.test(String(value || ""))))].sort();
}

function semanticContext() {
  const facts = new Map();
  const identityEvidence = new Map();
  for (const name of fs.readdirSync(RAW_ROOT).filter((entry) => entry.endsWith(".wikidata.json")).sort()) {
    const relativePath = `data/knowledge/raw/${name}`;
    const raw = readJson(relativePath);
    const source = { sourcePath: relativePath, retrievedAt: raw.retrievedAt };
    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      if (/^Q\d+$/u.test(String(value.id || "")) && value.labels && value.claims) {
        const fact = semanticFactFromWikidataEntity(value, source);
        if (fact) {
          facts.set(fact.qid, fact);
          identityEvidence.set(fact.qid, {
            descriptionEn: String(value.descriptions?.en?.value || "").trim(),
            sitelinks: Object.values(value.sitelinks || {}).map((entry) => ({
              site: String(entry?.site || "").trim(),
              title: String(entry?.title || "").trim(),
            })).filter((entry) => entry.site && entry.title),
            sourcePath: relativePath,
          });
        }
        return;
      }
      Object.values(value).forEach(visit);
    };
    visit(raw);
  }
  const corrections = readJson(path.relative(ROOT, CORRECTIONS_PATH));
  for (const [qid, correction] of Object.entries(corrections.entities || {})) {
    facts.set(qid, { ...facts.get(qid), ...correction, qid });
  }
  return { facts, identityEvidence };
}

const typePolicy = readJson("data/knowledge/semantic/knowledge-semantic-type-policy.json");
const exceptionDocument = readJson(path.relative(ROOT, EXCEPTIONS_PATH));
const { facts, identityEvidence } = semanticContext();
const countries = KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries.flatMap((assetPath) => readJson(assetPath).countries || []);
const cities = KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.flatMap((assetPath) => readJson(assetPath).cities || []);
const countryByEntityId = new Map(countries.map((entity) => [entity.entityId, entity]));
const cityByEntityId = new Map(cities.map((entity) => [entity.entityId, entity]));
const citySourcePathByEntityId = new Map(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.flatMap((relativePath) => (
  (readJson(relativePath).cities || []).map((entity) => [entity.entityId, relativePath])
)));
const previousAudit = optionalJson("data/knowledge/reports/knowledge-poi-positive-admission-audit.json", { quarantined: [] });

function poiAssetPathForParent(parentCityEntityId) {
  const cityPath = citySourcePathByEntityId.get(parentCityEntityId) || "";
  if (cityPath === "data/knowledge/cities.p1b-pilot.json") return "data/knowledge/pois.p1b-pilot.json";
  const batchNumber = cityPath.match(/cities\.p1b-batch(\d+)\.json$/u)?.[1];
  return batchNumber ? `data/knowledge/batches/pois.p1b-batch${batchNumber}.json` : "";
}

function exactCompositeAllowance(entity, instanceOfIds) {
  const parentCity = cityByEntityId.get(entity.parentCityEntityId);
  const country = countryByEntityId.get(parentCity?.parentCountryEntityId);
  return (typePolicy.compositeAllowances || []).find((entry) => (
    entry.qid === entity.wikidataId
    && entry.entityId === entity.entityId
    && entry.parentEntityId === entity.parentCityEntityId
    && entry.expectedCountryQid === country?.wikidataId
    && JSON.stringify(entry.instanceOfIds) === JSON.stringify(instanceOfIds)
  ));
}

function exactMissingTypeException(entity) {
  const parentCity = cityByEntityId.get(entity.parentCityEntityId);
  const country = countryByEntityId.get(parentCity?.parentCountryEntityId);
  return (exceptionDocument.exceptions || []).find((entry) => (
    entry.reviewStatus === "approved"
    && entry.kind === "poi"
    && entry.code === "instance-type-missing"
    && entry.qid === entity.wikidataId
    && entry.entityId === entity.entityId
    && entry.parentEntityId === entity.parentCityEntityId
    && entry.expectedCountryQid === country?.wikidataId
  ));
}

function classify(entity) {
  const fact = facts.get(entity.wikidataId);
  const instanceOfIds = [...new Set(fact?.instanceOfIds || [])].sort();
  const admission = evaluatePoiTypeIdsForConsumer("publication-audit", instanceOfIds, typePolicy);
  const paths = admission.paths;
  const composite = exactCompositeAllowance(entity, instanceOfIds);
  const missingTypeException = exactMissingTypeException(entity);
  if (admission.accepted || composite || missingTypeException) {
    const admissionSource = composite
      ? "exact-reviewed-composite"
      : missingTypeException
        ? "exact-reviewed-missing-type-exception"
        : "canonical-travel-positive-type";
    return {
      classification: "A",
      reasonCodes: [admissionSource],
      admissionSource,
      instanceOfIds,
      paths,
      admission,
    };
  }
  const evidence = identityEvidence.get(entity.wikidataId) || {};
  const identityText = [entity.canonicalNameEn, entity.canonicalNameZh, evidence.descriptionEn, ...(evidence.sitelinks || []).map((entry) => entry.title)].join(" ");
  const explicitPenalIdentity = /\b(?:prison|penal|penitentiary|detention|correctional|jail|incarceration)\b/iu.test(identityText);
  if (explicitPenalIdentity
    || admission.classification === "operational-unsuitable"
    || admission.classification === "financial-market-restricted") {
    return {
      classification: "C",
      reasonCodes: [explicitPenalIdentity
        ? "explicit-penal-identity"
        : admission.classification === "financial-market-restricted"
          ? "financial-market-without-independent-visitor-type"
          : "operational-type-without-independent-visitor-type"],
      instanceOfIds,
      paths,
      admission,
    };
  }
  if (admission.broadStructuralOnly) return { classification: "B", reasonCodes: ["broad-structural-type-only"], instanceOfIds, paths, admission };
  return { classification: "D", reasonCodes: ["positive-visitor-type-unconfirmed"], instanceOfIds, paths, admission };
}

function rebuildPoiEntity(entity) {
  const fact = facts.get(entity.wikidataId);
  const parentCity = cityByEntityId.get(entity.parentCityEntityId);
  if (!fact?.coordinates || !parentCity) throw new Error(`recovered-poi-source-incomplete:${entity.wikidataId}`);
  const retrievedAt = fact.retrievedAt;
  const canonicalNameEn = entity.canonicalNameEn || fact.labels.find((label) => /[A-Za-z]/u.test(label)) || fact.labels[0] || entity.wikidataId;
  const canonicalNameZh = entity.canonicalNameZh || fact.labels.find((label) => /[\u3400-\u9fff]/u.test(label)) || canonicalNameEn;
  const aliases = canonicalizeEntityLayerAliases(fact.labels, [canonicalNameZh, canonicalNameEn]);
  const wiki = `https://www.wikidata.org/wiki/${entity.wikidataId}`;
  const source = (field, sourceType, description, sourceUrl, value) => createEntityLayerProvenanceEntry({
    field,
    sourceType,
    source: description,
    sourceUrl,
    retrievedAt,
    value,
  });
  return {
    schemaVersion: "route-v2-poi-baseline-p1b",
    entityId: entity.entityId,
    entityType: "poi",
    parentCityEntityId: entity.parentCityEntityId,
    wikidataId: entity.wikidataId,
    canonicalNameZh,
    canonicalNameEn,
    aliases,
    coordinates: fact.coordinates,
    entitySourceType: "wikidata",
    confidence: 0.9,
    retrievedAt,
    provenance: {
      entityId: source("entityId", "project-schema", "Route V2 recovered candidate identity", "", entity.entityId),
      entityType: source("entityType", "project-schema", "Route V2 recovered candidate identity", "", "poi"),
      parentCityEntityId: source("parentCityEntityId", "repository-reference", `${parentCity.canonicalNameEn} City Entity`, `https://www.wikidata.org/wiki/${parentCity.wikidataId}`, parentCity.entityId),
      wikidataId: source("wikidataId", "wikidata", "Wikidata sealed semantic snapshot", wiki, entity.wikidataId),
      canonicalNameZh: source("canonicalNameZh", "wikidata", "Wikidata sealed semantic snapshot", wiki, canonicalNameZh),
      canonicalNameEn: source("canonicalNameEn", "wikidata", "Wikidata sealed semantic snapshot", wiki, canonicalNameEn),
      aliases: source("aliases", "wikidata", "Wikidata sealed semantic snapshot", wiki, aliases),
      coordinates: source("coordinates", "wikidata", "Wikidata sealed semantic snapshot", wiki, fact.coordinates),
      entitySourceType: source("entitySourceType", "project-schema", "Route V2 recovered candidate identity", "", "wikidata"),
      confidence: source("confidence", "project-schema", "Route V2 recovered candidate identity", "", 0.9),
      retrievedAt: source("retrievedAt", "wikidata", "Wikidata sealed semantic snapshot", wiki, retrievedAt),
    },
  };
}

function recoverPreviouslyPublishedBatch09Candidates() {
  const recovered = [];
  for (let wave = 1; wave <= 4; wave += 1) {
    const batchNumber = 29 + wave;
    const provenancePath = `data/knowledge/batches/provenance.knowledge-expansion-batch09-wave${wave}.json`;
    const selectionPath = `data/knowledge/batches/selection.p1b-batch${batchNumber}.json`;
    const provenance = optionalJson(provenancePath, { publishedEntityQids: [] });
    const selection = optionalJson(selectionPath, { cities: [], pois: [] });
    const selectedQids = new Set([...(selection.cities || []), ...(selection.pois || [])].map((entry) => entry.wikidataId));
    for (const selectedPoi of selection.pois || []) {
      recovered.push({
        entity: {
          entityId: selectedPoi.entityId,
          entityType: "poi",
          parentCityEntityId: selectedPoi.parentCityEntityId,
          wikidataId: selectedPoi.wikidataId,
          canonicalNameEn: selectedPoi.canonicalNameEn,
          canonicalNameZh: "",
        },
        provenancePath,
        selectionPath,
      });
    }
    for (const qid of provenance.publishedEntityQids || []) {
      if (selectedQids.has(qid)) continue;
      const fact = facts.get(qid);
      if (!fact?.coordinates) throw new Error(`batch09-recovery-fact-missing:${qid}`);
      const candidateParents = cities.filter((city) => {
        const country = countryByEntityId.get(city.parentCountryEntityId);
        return fact.countryQids.includes(country?.wikidataId) && city.coordinates;
      }).map((city) => ({
        city,
        distanceKm: entityLayerDistanceKm(city.coordinates, fact.coordinates),
      })).sort((left, right) => left.distanceKm - right.distanceKm || left.city.entityId.localeCompare(right.city.entityId, "en"));
      const parent = candidateParents[0];
      if (!parent || parent.distanceKm > 10) throw new Error(`batch09-recovery-parent-missing:${qid}`);
      recovered.push({
        entity: {
          entityId: createTypedEntityId({ entityType: "poi", wikidataId: qid }),
          entityType: "poi",
          parentCityEntityId: parent.city.entityId,
          wikidataId: qid,
          canonicalNameEn: fact.labels?.find((label) => /[A-Za-z]/u.test(label)) || fact.labels?.[0] || qid,
          canonicalNameZh: fact.labels?.find((label) => /[\u3400-\u9fff]/u.test(label)) || fact.labels?.[0] || qid,
        },
        provenancePath,
        selectionPath,
      });
    }
  }
  return recovered;
}

const assetDocuments = KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.map((relativePath) => ({
  relativePath,
  document: readJson(relativePath),
}));
const currentlyPublished = assetDocuments.flatMap(({ document }) => document.pois || []);
const recoveredBatch09 = recoverPreviouslyPublishedBatch09Candidates();
const candidateByEntityId = new Map(assetDocuments.flatMap(({ relativePath, document }) => (
  (document.pois || []).map((entity) => [entity.entityId, { entity, origin: null, sourceAssetPath: relativePath, wasPublished: true }])
)));
for (const entry of previousAudit.quarantined || []) {
  if (candidateByEntityId.has(entry.entityId)) continue;
  candidateByEntityId.set(entry.entityId, {
    entity: {
      entityId: entry.entityId,
      entityType: "poi",
      parentCityEntityId: entry.parentCityEntityId,
      wikidataId: entry.wikidataId,
      canonicalNameEn: entry.canonicalNameEn,
      canonicalNameZh: entry.canonicalNameZh || "",
    },
    origin: entry.recoveredFrom || null,
    sourceAssetPath: entry.sourceAssetPath || poiAssetPathForParent(entry.parentCityEntityId),
    wasPublished: false,
  });
}
for (const { entity, ...origin } of recoveredBatch09) {
  if (!candidateByEntityId.has(entity.entityId)) candidateByEntityId.set(entity.entityId, {
    entity,
    origin,
    sourceAssetPath: poiAssetPathForParent(entity.parentCityEntityId),
    wasPublished: false,
  });
}
const classifications = [...candidateByEntityId.values()].map(({ entity, origin, sourceAssetPath, wasPublished }) => ({
  entity,
  origin,
  sourceAssetPath,
  wasPublished,
  result: classify(entity),
}));
const previouslyQuarantinedNowAdmissible = classifications.filter(({ wasPublished, result }) => !wasPublished && result.classification === "A");
const restoredSelectionEntries = new Map();
const restoredProvenanceQids = new Map();
for (const classification of previouslyQuarantinedNowAdmissible) {
  const rebuilt = rebuildPoiEntity(classification.entity);
  const poiAssetPath = classification.sourceAssetPath || poiAssetPathForParent(rebuilt.parentCityEntityId);
  const batchNumber = poiAssetPath.match(/pois\.p1b-batch(\d+)\.json$/u)?.[1];
  const poiAsset = assetDocuments.find(({ relativePath }) => relativePath === poiAssetPath);
  if (!poiAsset || Number(batchNumber) < 30 || Number(batchNumber) > 33) {
    throw new Error(`recovered-poi-target-ambiguous:${rebuilt.wikidataId}:${poiAssetPath}`);
  }
  poiAsset.document.pois = [...(poiAsset.document.pois || []), rebuilt];
  if (Object.hasOwn(poiAsset.document, "poiCount")) poiAsset.document.poiCount = poiAsset.document.pois.length;
  currentlyPublished.push(rebuilt);
  classification.entity = rebuilt;
  classification.wasPublished = true;
  const selectionPath = `data/knowledge/batches/selection.p1b-batch${batchNumber}.json`;
  const positiveTypePath = classification.result.paths.find((path, index) => classification.result.admission?.pathClassifications?.[index] === "travel-positive")
    || classification.result.paths.find((path) => evaluatePoiTypePaths([path], { maximumDepth: typePolicy.maximumSubclassDepth }).accepted);
  const distanceKm = entityLayerDistanceKm(cityByEntityId.get(rebuilt.parentCityEntityId).coordinates, rebuilt.coordinates);
  if (!restoredSelectionEntries.has(selectionPath)) restoredSelectionEntries.set(selectionPath, []);
  restoredSelectionEntries.get(selectionPath).push({
    entityId: rebuilt.entityId,
    parentCityEntityId: rebuilt.parentCityEntityId,
    wikidataId: rebuilt.wikidataId,
    canonicalNameEn: rebuilt.canonicalNameEn,
    positiveTypePath,
    distanceKm: Number(distanceKm.toFixed(3)),
  });
  const wave = Number(batchNumber) - 29;
  const provenancePath = `data/knowledge/batches/provenance.knowledge-expansion-batch09-wave${wave}.json`;
  if (!restoredProvenanceQids.has(provenancePath)) restoredProvenanceQids.set(provenancePath, []);
  restoredProvenanceQids.get(provenancePath).push(rebuilt.wikidataId);
}
const currentQuarantined = classifications.filter(({ result }) => result.classification !== "A");
const quarantinedByEntityId = new Map();
for (const { entity, result, origin = null, sourceAssetPath } of currentQuarantined) {
  quarantinedByEntityId.set(entity.entityId, {
    entityId: entity.entityId,
    wikidataId: entity.wikidataId,
    parentCityEntityId: entity.parentCityEntityId,
    canonicalNameEn: entity.canonicalNameEn,
    classification: result.classification,
    reasonCodes: result.reasonCodes,
    instanceOfIds: result.instanceOfIds,
    positiveTypePaths: result.paths,
    identityEvidence: identityEvidence.get(entity.wikidataId) || null,
    sourceAssetPath,
    ...(origin ? { recoveredFrom: origin } : {}),
    disposition: "quarantined-not-published",
  });
}
const quarantined = [...quarantinedByEntityId.values()];
const quarantinedIds = new Set(quarantined.map((entry) => entry.entityId));

for (const { relativePath, document } of assetDocuments) {
  const filtered = (document.pois || []).filter((entity) => !quarantinedIds.has(entity.entityId));
  writeJson(path.join(ROOT, relativePath), {
    ...document,
    ...(Object.hasOwn(document, "poiCount") ? { poiCount: filtered.length } : {}),
    pois: filtered,
  });
}

const remainingPoiIds = new Set(currentlyPublished.filter((entity) => !quarantinedIds.has(entity.entityId)).map((entity) => entity.entityId));
for (const name of fs.readdirSync(path.join(ROOT, "data/knowledge/batches")).filter((entry) => /^selection\.p1b-batch\d+\.json$/u.test(entry)).sort()) {
  const relativePath = `data/knowledge/batches/${name}`;
  const document = readJson(relativePath);
  const pois = [...new Map([...(document.pois || []), ...(restoredSelectionEntries.get(relativePath) || [])]
    .map((entry) => [entry.entityId, entry])).values()].filter((entry) => remainingPoiIds.has(entry.entityId));
  if (pois.length === (document.pois || []).length) continue;
  const countByCity = new Map();
  for (const poi of pois) countByCity.set(poi.parentCityEntityId, (countByCity.get(poi.parentCityEntityId) || 0) + 1);
  writeJson(path.join(ROOT, relativePath), {
    ...document,
    cities: (document.cities || []).map((city) => ({
      ...city,
      selectedPoiCount: countByCity.get(city.entityId) || 0,
    })),
    pois,
  });
}

for (const name of fs.readdirSync(path.join(ROOT, "data/knowledge/batches")).filter((entry) => /^provenance\.knowledge-expansion-batch.+\.json$/u.test(entry)).sort()) {
  const relativePath = `data/knowledge/batches/${name}`;
  const document = readJson(relativePath);
  if (!Array.isArray(document.publishedEntityQids)) continue;
  const publishedEntityQids = [...new Set([...document.publishedEntityQids, ...(restoredProvenanceQids.get(relativePath) || [])])]
    .filter((qid) => !quarantined.some((entry) => entry.wikidataId === qid)).sort();
  if (publishedEntityQids.length === document.publishedEntityQids.length) continue;
  writeJson(path.join(ROOT, relativePath), { ...document, publishedEntityQids });
}

const publishedAfter = currentlyPublished.filter((entity) => !quarantinedIds.has(entity.entityId));
const classificationCounts = Object.fromEntries(["A", "B", "C", "D"].map((classification) => [
  classification,
  classification === "A"
    ? publishedAfter.length
    : quarantined.filter((entry) => entry.classification === classification).length,
]));

const broadStructuralRoots = new Set(BROAD_STRUCTURAL_POI_ROOT_QIDS);
const multiLevelBroadRootPaths = Object.entries(typePolicy.typeClassifications || {}).flatMap(([typeQid, classification]) => {
  const path = classification?.allowedKinds?.poi;
  return Array.isArray(path) && path.length > 1 && broadStructuralRoots.has(path.at(-1))
    ? [{ typeQid, path, admission: evaluatePoiTypePaths([path], { maximumDepth: typePolicy.maximumSubclassDepth }) }]
    : [];
});
const broadPathTypeQids = new Set(multiLevelBroadRootPaths.map((entry) => entry.typeQid));
const broadPathCandidateClassifications = classifications.filter(({ result }) => result.instanceOfIds.some((typeQid) => broadPathTypeQids.has(typeQid)));
const multiLevelBroadRootAudit = {
  total: multiLevelBroadRootPaths.length,
  travelPositive: multiLevelBroadRootPaths.filter((entry) => entry.admission.classification === "travel-positive").length,
  broadStructuralOnly: multiLevelBroadRootPaths.filter((entry) => entry.admission.classification === "broad-structural-only").length,
  operationalUnsuitable: multiLevelBroadRootPaths.filter((entry) => entry.admission.classification === "operational-unsuitable").length,
  unsafeUnresolved: multiLevelBroadRootPaths.filter((entry) => entry.admission.classification === "unsafe-unresolved").length,
  candidateEntities: broadPathCandidateClassifications.length,
  published: broadPathCandidateClassifications.filter(({ entity }) => !quarantinedIds.has(entity.entityId)).length,
  quarantined: broadPathCandidateClassifications.filter(({ entity }) => quarantinedIds.has(entity.entityId)).length,
  entries: multiLevelBroadRootPaths.map(({ typeQid, path, admission }) => ({
    typeQid,
    label: typePolicy.typeClassifications?.[typeQid]?.label || typeQid,
    path,
    classification: admission.classification,
  })),
};
const publishedIdSet = new Set(publishedAfter.map((entity) => entity.entityId));
const publishedAdmissions = classifications.filter(({ entity, result }) => publishedIdSet.has(entity.entityId) && result.classification === "A")
  .map(({ entity, result }) => ({
    entityId: entity.entityId,
    wikidataId: entity.wikidataId,
    parentCityEntityId: entity.parentCityEntityId,
    instanceOfIds: result.instanceOfIds,
    admissionSource: result.admissionSource,
  })).sort((left, right) => left.entityId.localeCompare(right.entityId, "en"));

const audit = {
  schemaVersion: "route-v2-knowledge-poi-positive-admission-audit-v2",
  generatedAt: GENERATED_AT,
  policy: {
    principle: "A broad structural class alone is insufficient to establish visitor-facing Route POI eligibility.",
    semanticTypePolicyPath: path.relative(ROOT, POLICY_PATH).replaceAll("\\", "/"),
    classifierPath: "src/lib/routes/knowledge-poi-semantic-admission.mjs",
  },
  before: {
    publishedPois: classifications.length,
    candidatePois: classifications.length,
    classifications: classificationCounts,
  },
  after: {
    publishedPois: publishedAfter.length,
    quarantinedPois: quarantined.length,
  },
  multiLevelBroadRootAudit,
  publishedAdmissions,
  quarantined: quarantined.sort((left, right) => left.classification.localeCompare(right.classification, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en")),
};
writeJson(AUDIT_PATH, audit);

console.log(JSON.stringify({
  status: "PASS",
  before: audit.before,
  after: audit.after,
  centroPenal: audit.quarantined.find((entry) => entry.wikidataId === "Q17624835"),
}, null, 2));
