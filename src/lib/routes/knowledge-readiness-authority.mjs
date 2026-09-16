import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPublishedKnowledgeCountryCodes } from "./knowledge-entity-layer-published-assets.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = path.resolve(moduleDirectory, "../../../data/knowledge/semantic/country-route-readiness-policy.json");
let cachedAuthority = null;

function normalizedUniqueCodes(value, field) {
  if (!Array.isArray(value)) throw new Error(`READINESS_AUTHORITY_${field.toUpperCase()}_INVALID`);
  const codes = value.map((code) => String(code || "").trim().toUpperCase());
  if (codes.some((code) => !/^[A-Z]{2}$/u.test(code)) || new Set(codes).size !== codes.length) {
    throw new Error(`READINESS_AUTHORITY_${field.toUpperCase()}_INVALID`);
  }
  return codes.sort();
}

export function validateKnowledgeReadinessAuthority(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("READINESS_AUTHORITY_INVALID");
  if (policy.schemaVersion !== "route-v2-country-route-readiness-policy-v1") throw new Error("READINESS_AUTHORITY_SCHEMA_INVALID");
  const plannableCountryCodes = normalizedUniqueCodes(policy.plannableCountryCodes, "plannable");
  const evidenceBackedCountryCodes = normalizedUniqueCodes(policy.evidenceBackedCountryCodes, "evidence_backed");
  const catalogOnlyCountryCodes = normalizedUniqueCodes(policy.catalogOnlyCountryCodes, "catalog_only");
  const evidencePendingCountryCodes = normalizedUniqueCodes(policy.evidencePendingCountryCodes, "evidence_pending");
  const plannable = new Set(plannableCountryCodes);
  const catalogOnly = new Set(catalogOnlyCountryCodes);
  const publishedCountryCodes = getPublishedKnowledgeCountryCodes();
  const published = new Set(publishedCountryCodes);
  const readinessCodes = new Set([...plannableCountryCodes, ...catalogOnlyCountryCodes]);
  const unknownReadinessCodes = [...readinessCodes].filter((code) => !published.has(code));
  const missingPublishedCodes = publishedCountryCodes.filter((code) => !readinessCodes.has(code));
  if (unknownReadinessCodes.length) throw new Error(`READINESS_AUTHORITY_UNKNOWN_COUNTRY_CODE:${unknownReadinessCodes.join(",")}`);
  if (missingPublishedCodes.length) throw new Error(`READINESS_AUTHORITY_MISSING_PUBLISHED_COUNTRY:${missingPublishedCodes.join(",")}`);
  if (plannableCountryCodes.some((code) => catalogOnly.has(code))) throw new Error("READINESS_AUTHORITY_OVERLAPPING_READINESS_STATE");
  if (readinessCodes.size !== published.size) throw new Error("READINESS_AUTHORITY_PARTITION_MISMATCH");
  if (evidenceBackedCountryCodes.some((code) => !published.has(code) || !plannable.has(code))) throw new Error("READINESS_AUTHORITY_INVALID_EVIDENCE_BACKED_MEMBERSHIP");
  if (evidencePendingCountryCodes.some((code) => !published.has(code) || !catalogOnly.has(code))) throw new Error("READINESS_AUTHORITY_INVALID_EVIDENCE_PENDING_MEMBERSHIP");
  if (plannableCountryCodes.length !== 118 || evidenceBackedCountryCodes.length !== 115 || catalogOnlyCountryCodes.length !== 77) {
    throw new Error("READINESS_AUTHORITY_COUNT_INVALID");
  }
  return Object.freeze({
    schemaVersion: policy.schemaVersion,
    plannableCountryCodes: Object.freeze(plannableCountryCodes),
    evidenceBackedCountryCodes: Object.freeze(evidenceBackedCountryCodes),
    catalogOnlyCountryCodes: Object.freeze(catalogOnlyCountryCodes),
    evidencePendingCountryCodes: Object.freeze(evidencePendingCountryCodes),
  });
}

export function getAuthoritativeKnowledgeReadiness() {
  if (cachedAuthority) return cachedAuthority;
  let policy;
  try {
    policy = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
  } catch (error) {
    throw new Error(`READINESS_AUTHORITY_UNAVAILABLE:${error.message}`);
  }
  cachedAuthority = validateKnowledgeReadinessAuthority(policy);
  return cachedAuthority;
}
