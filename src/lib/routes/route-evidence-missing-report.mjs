import { cleanString } from "./route-v2-utils.mjs";

function clean(value) {
  return cleanString(value);
}

export function buildRouteV2MissingEvidenceReport(validations = []) {
  const items = new Map();
  function add(type, key, candidateId, validationId, reasonCodes) {
    if (!key) return;
    const aggregateKey = `${type}|${key}`;
    const current = items.get(aggregateKey) || {
      evidenceType: type,
      targetKey: key,
      requestCount: 0,
      candidateIds: [],
      validationIds: [],
      reasonCodes: [],
    };
    current.requestCount += 1;
    current.candidateIds = [...new Set([...current.candidateIds, clean(candidateId)].filter(Boolean))].sort();
    current.validationIds = [...new Set([...current.validationIds, clean(validationId)].filter(Boolean))].sort();
    current.reasonCodes = [...new Set([...current.reasonCodes, ...(reasonCodes || []).map(clean).filter(Boolean)])].sort();
    items.set(aggregateKey, current);
  }
  for (const validation of Array.isArray(validations) ? validations : []) {
    if (validation?.status === "rejected") continue;
    for (const leg of validation?.legResults || []) {
      if (leg.status === "ready") continue;
      add("route-leg", `${clean(leg.fromEntityId)}>${clean(leg.toEntityId)}|${clean(leg.transportMode || "unknown")}`, validation.candidateId, validation.validationId, leg.reasonCodes);
    }
    for (const season of validation?.seasonResults || []) {
      if (["ready", "skipped"].includes(season.status)) continue;
      add("season", `${clean(season.entityId)}|${Number(season.month) || "unknown"}`, validation.candidateId, validation.validationId, season.reasonCodes);
    }
  }
  return [...items.values()].sort((left, right) => right.requestCount - left.requestCount
    || left.evidenceType.localeCompare(right.evidenceType, "en")
    || left.targetKey.localeCompare(right.targetKey, "en"));
}
