import fs from "node:fs";
import path from "node:path";

import { validateKnowledgeCityEntitySet } from "../../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import {
  semanticFactFromWikidataEntity,
  validatePublishedKnowledgeSemantics,
} from "../../src/lib/routes/knowledge-semantic-gate.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function collectBatch03SemanticFacts(root) {
  const rawRoot = path.join(root, "data/knowledge/raw");
  const facts = new Map();
  for (const name of fs.readdirSync(rawRoot).filter((entry) => entry.endsWith(".wikidata.json")).sort()) {
    const raw = readJson(path.join(rawRoot, name));
    const source = { sourcePath: `data/knowledge/raw/${name}`, retrievedAt: raw.retrievedAt };
    const visit = (value) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object") return;
      if (/^Q\d+$/u.test(String(value.id || "")) && value.labels && value.claims) {
        const fact = semanticFactFromWikidataEntity(value, source);
        if (fact) facts.set(fact.qid, fact);
        return;
      }
      Object.values(value).forEach(visit);
    };
    visit(raw);
  }
  const corrections = readJson(path.join(root, "data/knowledge/semantic/production-integrity-corrections.json"));
  for (const [qid, fact] of Object.entries(corrections.entities || {})) {
    facts.set(qid, { ...facts.get(qid), ...fact, qid, retrievedAt: corrections.retrievedAt });
  }
  return facts;
}

export function loadBatch03SemanticAuthority(root) {
  const poiParentCityIdsByQid = new Map();
  const rawRoot = path.join(root, "data/knowledge/raw");
  for (const name of fs.readdirSync(rawRoot).filter((entry) => entry.endsWith(".wikidata.json")).sort()) {
    const raw = readJson(path.join(rawRoot, name));
    for (const [cityEntityId, records] of Object.entries(raw.geosearch || {})) {
      for (const record of Array.isArray(records) ? records : []) {
        const qid = String(record?.qid || "").trim().toUpperCase();
        if (!/^Q\d+$/u.test(qid)) continue;
        if (!poiParentCityIdsByQid.has(qid)) poiParentCityIdsByQid.set(qid, new Set());
        poiParentCityIdsByQid.get(qid).add(cityEntityId);
      }
    }
  }
  return {
    factsByQid: collectBatch03SemanticFacts(root),
    poiParentCityIdsByQid,
    typePolicy: readJson(path.join(root, "data/knowledge/semantic/knowledge-semantic-type-policy.json")),
    exceptionDocument: readJson(path.join(root, "data/knowledge/semantic/knowledge-semantic-exceptions.json")),
  };
}

export function evaluateBatch03AdmissionAuthority({ countries, cities, pois, factsByQid, poiParentCityIdsByQid, typePolicy, exceptionDocument }) {
  const entityIds = new Set([...countries, ...cities, ...pois].map((entry) => entry.entityId));
  const scopedExceptions = {
    schemaVersion: exceptionDocument?.schemaVersion,
    exceptions: (exceptionDocument?.exceptions || []).filter((entry) => entityIds.has(entry.entityId)),
  };
  const citySchema = validateKnowledgeCityEntitySet(cities);
  const poiSchema = validateKnowledgePoiEntitySet(pois);
  const semantic = validatePublishedKnowledgeSemantics({
    countries,
    cities,
    pois,
    factsByQid,
    typePolicy,
    exceptionDocument: scopedExceptions,
  });
  const exactBindingViolations = [];
  for (const poi of pois) {
    const reviewedParents = poiParentCityIdsByQid?.get(poi.wikidataId);
    if (!reviewedParents?.has(poi.parentCityEntityId)) {
      exactBindingViolations.push({ qid: poi.wikidataId, entityId: poi.entityId, kind: "poi", code: reviewedParents ? "raw-destination-binding-mismatch" : "raw-destination-binding-missing" });
    }
  }
  semantic.violations.push(...exactBindingViolations);
  semantic.accepted = semantic.violations.length === 0;
  const violationsByEntity = new Map();
  for (const violation of semantic.violations) {
    const key = violation.entityId || `configuration:${violation.code}`;
    if (!violationsByEntity.has(key)) violationsByEntity.set(key, []);
    violationsByEntity.get(key).push(violation.code);
  }
  const decision = (entity) => ({
    entityId: entity.entityId,
    wikidataId: entity.wikidataId,
    canonicalNameEn: entity.canonicalNameEn,
    decision: violationsByEntity.has(entity.entityId) ? "QUARANTINE" : "ADMIT",
    reasons: violationsByEntity.get(entity.entityId) || [],
  });
  return {
    accepted: citySchema.accepted && poiSchema.accepted && semantic.accepted,
    citySchema,
    poiSchema,
    semantic,
    destinationDecisions: cities.map(decision),
    poiDecisions: pois.map(decision),
  };
}

export function assertBatch03AdmissionAuthority(options) {
  const result = evaluateBatch03AdmissionAuthority(options);
  if (!result.accepted) {
    throw new Error(`batch03-independent-admission-rejected:${JSON.stringify({ citySchema: result.citySchema.reasons, poiSchema: result.poiSchema.reasons, semantic: result.semantic.violations })}`);
  }
  return result;
}
