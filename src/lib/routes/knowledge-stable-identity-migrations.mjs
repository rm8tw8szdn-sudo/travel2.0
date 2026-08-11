import { createTypedEntityId } from "./knowledge-entity-layer-primitives.mjs";

const APPROVED_MIGRATIONS = new Map([
  ["city:city-47c9ca41467ed3e5", "Q736897"],
  ["city:city-8e7ea972d32813e9", "Q169134"],
  ["poi:poi-93764b4ab8abf8c2", "Q686508"],
  ["poi:poi-1fcc9f3db234bde7", "Q730019"],
]);

function clean(value) {
  return String(value || "").trim();
}

export function isApprovedKnowledgeEntityIdentity({ entityType, entityId, wikidataId } = {}) {
  const type = clean(entityType).toLocaleLowerCase("en-US");
  const id = clean(entityId);
  const qid = clean(wikidataId).toUpperCase();
  if (!type || !id || !qid) return false;
  const deterministicId = createTypedEntityId({ entityType: type, wikidataId: qid });
  return id === deterministicId || APPROVED_MIGRATIONS.get(`${type}:${id}`) === qid;
}

export function listApprovedKnowledgeEntityIdentityMigrations() {
  return [...APPROVED_MIGRATIONS.entries()].map(([key, wikidataId]) => {
    const separator = key.indexOf(":");
    return Object.freeze({
      entityType: key.slice(0, separator),
      entityId: key.slice(separator + 1),
      wikidataId,
    });
  });
}
