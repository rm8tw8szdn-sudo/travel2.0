import {
  normalizeIsoAlpha2,
  normalizeIsoAlpha3,
  validateCountryEntity,
  validateCountryEntitySet,
} from "./knowledge-country-baseline-schema.mjs";
import { cleanString, stableHash } from "./route-v2-utils.mjs";

function conflict({ type, severity = "blocking", entity = {}, value = "", message = "" } = {}) {
  return {
    conflictId: `conflict-${stableHash({
      type,
      severity,
      isoAlpha2: entity.isoAlpha2,
      entityId: entity.entityId,
      value,
    }).slice(0, 16)}`,
    isoAlpha2: normalizeIsoAlpha2(entity.isoAlpha2),
    entityId: cleanString(entity.entityId),
    severity,
    type,
    value,
    message,
  };
}

function detectDuplicates(entities = [], keyName, valueFor) {
  const seen = new Map();
  const conflicts = [];
  for (const entity of entities) {
    const value = cleanString(valueFor(entity));
    if (!value) continue;
    if (seen.has(value)) {
      conflicts.push(conflict({
        type: `${keyName}-duplicate`,
        entity,
        value,
        message: `${keyName} duplicates ${seen.get(value).entityId}`,
      }));
    } else {
      seen.set(value, entity);
    }
  }
  return conflicts;
}

export function dedupeCountryEntities(entities = []) {
  const sorted = [...entities].sort((a, b) => normalizeIsoAlpha2(a.isoAlpha2).localeCompare(normalizeIsoAlpha2(b.isoAlpha2)));
  const conflicts = [
    ...detectDuplicates(sorted, "isoAlpha2", (entity) => normalizeIsoAlpha2(entity.isoAlpha2)),
    ...detectDuplicates(sorted, "isoAlpha3", (entity) => normalizeIsoAlpha3(entity.isoAlpha3)),
    ...detectDuplicates(sorted, "wikidataId", (entity) => cleanString(entity.wikidataId)),
  ];
  for (const entity of sorted) {
    const validation = validateCountryEntity(entity);
    if (!validation.accepted) {
      conflicts.push(conflict({
        type: "country-validation-failed",
        entity,
        value: validation.reasons.join(","),
        message: "Country entity failed schema validation.",
      }));
    }
  }
  const setValidation = validateCountryEntitySet(sorted);
  if (!setValidation.accepted) {
    for (const reason of setValidation.reasons) {
      conflicts.push({
        conflictId: `conflict-${stableHash({ type: "country-set-validation-failed", reason }).slice(0, 16)}`,
        isoAlpha2: "",
        entityId: "",
        severity: "blocking",
        type: "country-set-validation-failed",
        value: reason,
        message: "Country entity set failed validation.",
      });
    }
  }
  return {
    entities: sorted,
    conflicts: conflicts.sort((a, b) => (
      cleanString(a.isoAlpha2).localeCompare(cleanString(b.isoAlpha2))
      || cleanString(a.type).localeCompare(cleanString(b.type))
      || cleanString(a.value).localeCompare(cleanString(b.value))
    )),
  };
}
