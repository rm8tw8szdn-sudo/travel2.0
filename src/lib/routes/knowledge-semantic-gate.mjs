import {
  entityLayerDistanceKm,
  normalizeEntityLayerCoordinates,
  normalizeEntityLayerText,
} from "./knowledge-entity-layer-primitives.mjs";
import { stableHash } from "./route-v2-utils.mjs";

const TYPE_POLICY_SCHEMA_VERSION = "route-v2-knowledge-semantic-type-policy-v1";
const EXCEPTION_SCHEMA_VERSION = "route-v2-knowledge-semantic-exceptions-v2";
const MAXIMUM_ALLOWED_SUBCLASS_DEPTH = 8;

function clean(value) {
  return normalizeEntityLayerText(value);
}

function qid(value) {
  return clean(value).toUpperCase();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizedName(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function claimValues(entity = {}, propertyId) {
  return list(entity.claims?.[propertyId]).map((claim) => claim?.mainsnak?.datavalue?.value).filter(Boolean);
}

function claimEntityIds(entity = {}, propertyId) {
  return claimValues(entity, propertyId).map((value) => qid(value?.id || value)).filter(Boolean);
}

function claimCoordinates(entity = {}) {
  const value = claimValues(entity, "P625")[0];
  return normalizeEntityLayerCoordinates(value ? { latitude: value.latitude, longitude: value.longitude } : null);
}

function multilingualValues(value = {}) {
  return Object.values(value || {}).flatMap((entry) => list(entry).length ? list(entry).map((item) => item?.value) : [entry?.value]);
}

export function semanticFactFromWikidataEntity(entity = {}, source = {}) {
  const entityQid = qid(entity.id);
  if (!entityQid) return null;
  return {
    qid: entityQid,
    labels: [...new Set([
      ...multilingualValues(entity.labels),
      ...multilingualValues(entity.aliases),
      ...Object.values(entity.sitelinks || {}).map((item) => item?.title),
    ].map(clean).filter(Boolean))],
    instanceOfIds: [...new Set(claimEntityIds(entity, "P31"))],
    countryQids: [...new Set(claimEntityIds(entity, "P17"))],
    coordinates: claimCoordinates(entity),
    sourcePath: clean(source.sourcePath),
    retrievedAt: clean(source.retrievedAt),
  };
}

function factMap(value) {
  if (value instanceof Map) return value;
  return new Map(Object.entries(value || {}).map(([entryQid, fact]) => [qid(entryQid), { ...fact, qid: qid(fact?.qid || entryQid) }]));
}

function compatibleName(entity = {}, fact = {}) {
  const published = [entity.canonicalNameEn, entity.canonicalNameZh, ...(entity.aliases || [])]
    .map(normalizedName).filter(Boolean);
  const reference = list(fact.labels).map(normalizedName).filter(Boolean);
  return published.some((name) => reference.some((label) => (
    name === label || (Math.min(name.length, label.length) >= 5 && (name.includes(label) || label.includes(name)))
  )));
}

function exceptionScope(entry = {}) {
  return {
    qid: qid(entry.qid),
    entityId: clean(entry.entityId),
    kind: clean(entry.kind).toLocaleLowerCase("en-US"),
    parentEntityId: clean(entry.parentEntityId),
    expectedCountryQid: qid(entry.expectedCountryQid),
    code: clean(entry.code),
  };
}

function exceptionKey(entry = {}) {
  const scope = exceptionScope(entry);
  return [scope.qid, scope.entityId, scope.kind, scope.parentEntityId, scope.expectedCountryQid, scope.code].join(":");
}

function expectedExceptionId(entry = {}) {
  return `knowledge-semantic-exception-${stableHash(exceptionScope(entry)).slice(0, 16)}`;
}

function addConfigurationViolation(violations, code, details = {}) {
  violations.push({ qid: "", entityId: "", kind: "configuration", code, ...details });
}

function normalizeTypePolicy(typePolicy, violations) {
  if (!typePolicy || typeof typePolicy !== "object" || Array.isArray(typePolicy)) {
    addConfigurationViolation(violations, "type-policy-missing");
    return null;
  }
  if (typePolicy.schemaVersion !== TYPE_POLICY_SCHEMA_VERSION) {
    addConfigurationViolation(violations, "type-policy-schema-version-invalid");
  }
  const maximumSubclassDepth = Number(typePolicy.maximumSubclassDepth);
  if (!Number.isInteger(maximumSubclassDepth) || maximumSubclassDepth < 1 || maximumSubclassDepth > MAXIMUM_ALLOWED_SUBCLASS_DEPTH) {
    addConfigurationViolation(violations, "type-policy-subclass-depth-invalid", { maximumSubclassDepth });
  }
  if (typePolicy.source?.provider !== "Wikidata" || typePolicy.source?.property !== "P279" || !clean(typePolicy.source?.apiUrl)) {
    addConfigurationViolation(violations, "type-policy-source-invalid");
  }
  if (!clean(typePolicy.retrievedAt) || Number.isNaN(Date.parse(typePolicy.retrievedAt))) {
    addConfigurationViolation(violations, "type-policy-retrieved-at-invalid");
  }

  const roots = {};
  const allRootQids = new Set();
  for (const kind of ["city", "poi"]) {
    const rootEntries = list(typePolicy.roots?.[kind]);
    if (!rootEntries.length) addConfigurationViolation(violations, "type-policy-roots-missing", { policyKind: kind });
    roots[kind] = new Set();
    for (const root of rootEntries) {
      const rootQid = qid(root?.qid);
      if (!/^Q\d+$/u.test(rootQid) || !clean(root?.label) || !clean(root?.reason) || clean(root?.sourceUrl) !== `https://www.wikidata.org/wiki/${rootQid}`) {
        addConfigurationViolation(violations, "type-policy-root-invalid", { policyKind: kind, rootQid });
        continue;
      }
      if (roots[kind].has(rootQid)) addConfigurationViolation(violations, "type-policy-root-duplicate", { policyKind: kind, rootQid });
      if (allRootQids.has(rootQid)) addConfigurationViolation(violations, "type-policy-root-cross-kind", { rootQid });
      roots[kind].add(rootQid);
      allRootQids.add(rootQid);
    }
  }

  const nodes = new Map();
  for (const [nodeKey, node] of Object.entries(typePolicy.nodes || {})) {
    const nodeQid = qid(node?.qid || nodeKey);
    const parentQids = list(node?.parentQids).map(qid);
    if (nodeQid !== qid(nodeKey) || !/^Q\d+$/u.test(nodeQid)
      || clean(node?.sourceUrl) !== `https://www.wikidata.org/wiki/${nodeQid}`
      || !clean(node?.retrievedAt) || Number.isNaN(Date.parse(node.retrievedAt))
      || parentQids.some((parentQid) => !/^Q\d+$/u.test(parentQid) || parentQid === nodeQid)
      || new Set(parentQids).size !== parentQids.length) {
      addConfigurationViolation(violations, "type-policy-node-invalid", { nodeQid });
      continue;
    }
    nodes.set(nodeQid, { ...node, qid: nodeQid, parentQids });
  }
  for (const rootQid of allRootQids) {
    if (!nodes.has(rootQid)) addConfigurationViolation(violations, "type-policy-root-node-missing", { rootQid });
  }
  for (const node of nodes.values()) {
    for (const parentQid of node.parentQids) {
      if (!nodes.has(parentQid)) addConfigurationViolation(violations, "type-policy-parent-node-missing", { nodeQid: node.qid, parentQid });
    }
  }

  const typeClassifications = new Map();
  for (const [classificationKey, classification] of Object.entries(typePolicy.typeClassifications || {})) {
    const typeQid = qid(classification?.qid || classificationKey);
    const allowedKinds = {};
    let valid = typeQid === qid(classificationKey) && /^Q\d+$/u.test(typeQid)
      && clean(classification?.sourceUrl) === `https://www.wikidata.org/wiki/${typeQid}`
      && clean(classification?.reviewedAt) && !Number.isNaN(Date.parse(classification.reviewedAt));
    for (const [kind, rawPath] of Object.entries(classification?.allowedKinds || {})) {
      const path = list(rawPath).map(qid);
      const pathValid = ["city", "poi"].includes(kind)
        && path.length >= 1
        && path[0] === typeQid
        && path.length - 1 <= maximumSubclassDepth
        && roots[kind].has(path.at(-1))
        && path.every((pathQid) => nodes.has(pathQid))
        && path.slice(0, -1).every((pathQid, index) => nodes.get(pathQid)?.parentQids.includes(path[index + 1]));
      if (!pathValid) valid = false;
      else allowedKinds[kind] = path;
    }
    if (!valid || Object.keys(allowedKinds).length === 0 || typeClassifications.has(typeQid)) {
      addConfigurationViolation(violations, "type-policy-classification-invalid", { typeQid });
      continue;
    }
    typeClassifications.set(typeQid, { ...classification, qid: typeQid, allowedKinds });
  }

  const compositeAllowances = new Map();
  const allowanceIds = new Set();
  for (const allowance of list(typePolicy.compositeAllowances)) {
    const allowanceQid = qid(allowance?.qid);
    const entityId = clean(allowance?.entityId);
    const kind = clean(allowance?.kind).toLocaleLowerCase("en-US");
    const parentEntityId = clean(allowance?.parentEntityId);
    const expectedCountryQid = qid(allowance?.expectedCountryQid);
    const instanceOfIds = list(allowance?.instanceOfIds).map(qid);
    const expectedId = `knowledge-semantic-composite-${stableHash({
      qid: allowanceQid,
      entityId,
      parentEntityId,
      expectedCountryQid,
    }).slice(0, 16)}`;
    const key = [allowanceQid, entityId, kind, parentEntityId, expectedCountryQid, [...instanceOfIds].sort().join(",")].join(":");
    if (allowance.allowanceId !== expectedId || allowanceIds.has(allowance.allowanceId)
      || kind !== "poi" || !/^Q\d+$/u.test(allowanceQid) || !/^poi-[0-9a-f]{16}$/u.test(entityId)
      || !/^city-[0-9a-f]{16}$/u.test(parentEntityId) || !/^Q\d+$/u.test(expectedCountryQid)
      || !instanceOfIds.length || new Set(instanceOfIds).size !== instanceOfIds.length
      || JSON.stringify(instanceOfIds) !== JSON.stringify([...instanceOfIds].sort())
      || !clean(allowance.reason) || clean(allowance.sourceUrl) !== `https://www.wikidata.org/wiki/${allowanceQid}`
      || allowance.reviewStatus !== "approved" || !Number.isInteger(allowance.reviewVersion) || allowance.reviewVersion < 1
      || !clean(allowance.reviewedAt) || Number.isNaN(Date.parse(allowance.reviewedAt))) {
      addConfigurationViolation(violations, "type-policy-composite-allowance-invalid", { allowanceId: clean(allowance?.allowanceId), allowanceQid });
      continue;
    }
    if (compositeAllowances.has(key)) addConfigurationViolation(violations, "type-policy-composite-allowance-duplicate", { allowanceId: allowance.allowanceId });
    allowanceIds.add(allowance.allowanceId);
    compositeAllowances.set(key, allowance);
  }

  return {
    maximumSubclassDepth,
    roots,
    nodes,
    typeClassifications,
    compositeAllowances,
    compositeAllowanceCount: compositeAllowances.size,
  };
}

function findClassifiedTypePath(instanceOfIds, kind, policy) {
  for (const instanceOfQid of instanceOfIds) {
    const path = policy.typeClassifications.get(qid(instanceOfQid))?.allowedKinds?.[kind];
    if (path) return path;
  }
  return null;
}

function compositeAllowanceKey({ entity, kind, parentEntityId, expectedCountryQid, instanceOfIds }) {
  return [
    qid(entity.wikidataId),
    clean(entity.entityId),
    clean(kind).toLocaleLowerCase("en-US"),
    clean(parentEntityId),
    qid(expectedCountryQid),
    [...instanceOfIds].sort().join(","),
  ].join(":");
}

function normalizeExceptions({
  exceptionDocument,
  countries,
  cities,
  pois,
  countryByEntityId,
  cityByEntityId,
  violations,
}) {
  const entries = list(exceptionDocument?.exceptions ?? exceptionDocument);
  if (exceptionDocument && !Array.isArray(exceptionDocument) && exceptionDocument.schemaVersion !== EXCEPTION_SCHEMA_VERSION) {
    addConfigurationViolation(violations, "exception-schema-version-invalid");
  }
  const entityByKindAndId = new Map([
    ...countries.map((entity) => [`country:${entity.entityId}`, entity]),
    ...cities.map((entity) => [`city:${entity.entityId}`, entity]),
    ...pois.map((entity) => [`poi:${entity.entityId}`, entity]),
  ]);
  const byScope = new Map();
  const ids = new Set();
  for (const entry of entries) {
    const scope = exceptionScope(entry);
    const key = exceptionKey(scope);
    const expectedId = expectedExceptionId(scope);
    const entity = entityByKindAndId.get(`${scope.kind}:${scope.entityId}`);
    const actualParentEntityId = scope.kind === "city"
      ? clean(entity?.parentCountryEntityId)
      : scope.kind === "poi"
        ? clean(entity?.parentCityEntityId)
        : "";
    const actualCountry = scope.kind === "city"
      ? countryByEntityId.get(entity?.parentCountryEntityId)
      : scope.kind === "poi"
        ? countryByEntityId.get(cityByEntityId.get(entity?.parentCityEntityId)?.parentCountryEntityId)
        : null;
    const sourceUrl = clean(entry?.sourceUrl);
    const sourcePath = clean(entry?.sourcePath);
    let valid = true;
    const reject = (code) => {
      addConfigurationViolation(violations, code, { exceptionId: clean(entry?.exceptionId), exceptionQid: scope.qid });
      valid = false;
    };
    if (entry?.exceptionId !== expectedId) reject("exception-id-invalid");
    if (ids.has(entry?.exceptionId)) reject("exception-id-duplicate");
    if (!entity || qid(entity.wikidataId) !== scope.qid) reject("exception-entity-scope-invalid");
    if (!scope.parentEntityId || actualParentEntityId !== scope.parentEntityId) reject("exception-parent-scope-invalid");
    if (!scope.expectedCountryQid || qid(actualCountry?.wikidataId) !== scope.expectedCountryQid) reject("exception-country-scope-invalid");
    if (!scope.code || clean(entry?.exceptionType) !== scope.code) reject("exception-type-invalid");
    if (!clean(entry?.reason)) reject("exception-reason-missing");
    if (!sourceUrl && !sourcePath) reject("exception-source-missing");
    if (sourceUrl && sourceUrl !== `https://www.wikidata.org/wiki/${scope.qid}`) reject("exception-source-url-invalid");
    if (entry?.reviewStatus !== "approved" || !Number.isInteger(entry?.reviewVersion) || entry.reviewVersion < 1
      || !clean(entry?.reviewedAt) || Number.isNaN(Date.parse(entry.reviewedAt))) reject("exception-review-invalid");
    if (byScope.has(key)) reject("exception-scope-duplicate");
    ids.add(entry?.exceptionId);
    if (valid) byScope.set(key, entry);
  }
  return { entries, byScope };
}

function validateEntity({
  entity,
  kind,
  facts,
  countryByEntityId,
  cityByEntityId,
  exceptionByScope,
  usedExceptionIds,
  typePolicy,
  violations,
}) {
  const entityQid = qid(entity.wikidataId);
  const fact = facts.get(entityQid);
  const parentEntityId = kind === "city"
    ? clean(entity.parentCountryEntityId)
    : kind === "poi"
      ? clean(entity.parentCityEntityId)
      : "";
  const expectedCountry = kind === "country"
    ? entity
    : kind === "city"
      ? countryByEntityId.get(entity.parentCountryEntityId)
      : countryByEntityId.get(cityByEntityId.get(entity.parentCityEntityId)?.parentCountryEntityId);
  const expectedCountryQid = qid(expectedCountry?.wikidataId);
  const add = (code, details = {}) => {
    const exception = exceptionByScope.get(exceptionKey({
      qid: entityQid,
      entityId: entity.entityId,
      kind,
      parentEntityId,
      expectedCountryQid,
      code,
    }));
    if (exception) {
      usedExceptionIds.add(exception.exceptionId);
      return;
    }
    violations.push({ qid: entityQid, entityId: entity.entityId, kind, code, ...details });
  };

  if (!fact) {
    add("qid-not-in-semantic-snapshot");
    return;
  }
  if (!clean(fact.sourcePath || fact.sourceUrl)) add("semantic-source-missing");
  if (!compatibleName(entity, fact)) add("canonical-name-mismatch", { labels: list(fact.labels).slice(0, 8) });

  const factCoordinates = normalizeEntityLayerCoordinates(fact.coordinates);
  const publishedCoordinates = normalizeEntityLayerCoordinates(entity.coordinates);
  if (!factCoordinates) add("semantic-coordinate-missing");
  else if (!publishedCoordinates) add("published-coordinate-missing");
  else {
    const distanceKm = entityLayerDistanceKm(publishedCoordinates, factCoordinates);
    const maximumKm = kind === "city" ? 30 : kind === "poi" ? 10 : 100;
    if (distanceKm > maximumKm) add("semantic-coordinate-mismatch", { distanceKm: Number(distanceKm.toFixed(3)), maximumKm });
  }

  const instanceOfIds = [...new Set(list(fact.instanceOfIds).map(qid))].sort();
  if ((kind === "city" || kind === "poi") && instanceOfIds.length === 0) {
    add("instance-type-missing");
  } else if (kind === "city" && typePolicy) {
    const cityPath = findClassifiedTypePath(instanceOfIds, "city", typePolicy);
    if (!cityPath) add("instance-type-not-allowed", { instanceOfIds, maximumSubclassDepth: typePolicy.maximumSubclassDepth });
  } else if (kind === "poi" && typePolicy) {
    const poiPath = findClassifiedTypePath(instanceOfIds, "poi", typePolicy);
    const composite = typePolicy.compositeAllowances.get(compositeAllowanceKey({
      entity,
      kind,
      parentEntityId,
      expectedCountryQid,
      instanceOfIds,
    }));
    if (!composite && !poiPath) {
      add("instance-type-not-allowed", {
        instanceOfIds,
        maximumSubclassDepth: typePolicy.maximumSubclassDepth,
        settlementTypeDetected: instanceOfIds.some((instanceOfQid) => Boolean(typePolicy.typeClassifications.get(instanceOfQid)?.allowedKinds?.city)),
      });
    }
  }
  if (fact.semanticClass && clean(fact.semanticClass) !== kind) add("semantic-class-mismatch", { semanticClass: fact.semanticClass });

  const factCountries = new Set(list(fact.countryQids).map(qid));
  if (kind !== "country" && expectedCountryQid && !factCountries.size) {
    add("country-claim-missing", { expectedCountryQid });
  } else if (kind !== "country" && expectedCountryQid && !factCountries.has(expectedCountryQid)) {
    add("country-claim-mismatch", { expectedCountryQid, actualCountryQids: [...factCountries] });
  }

  if (kind === "poi") {
    const parentCity = cityByEntityId.get(entity.parentCityEntityId);
    const parentCoordinates = normalizeEntityLayerCoordinates(parentCity?.coordinates);
    if (parentCoordinates && publishedCoordinates) {
      const parentDistanceKm = entityLayerDistanceKm(parentCoordinates, publishedCoordinates);
      if (parentDistanceKm > 200) add("poi-parent-distance-implausible", { parentDistanceKm: Number(parentDistanceKm.toFixed(3)) });
    }
  }
}

export function validatePublishedKnowledgeSemantics({
  countries = [],
  cities = [],
  pois = [],
  factsByQid = new Map(),
  typePolicy = null,
  exceptionDocument = null,
  exceptions = [],
} = {}) {
  const facts = factMap(factsByQid);
  const countryByEntityId = new Map(countries.map((entity) => [entity.entityId, entity]));
  const cityByEntityId = new Map(cities.map((entity) => [entity.entityId, entity]));
  const violations = [];
  const normalizedTypePolicy = normalizeTypePolicy(typePolicy, violations);
  const normalizedExceptions = normalizeExceptions({
    exceptionDocument: exceptionDocument || exceptions,
    countries,
    cities,
    pois,
    countryByEntityId,
    cityByEntityId,
    violations,
  });
  const usedExceptionIds = new Set();

  for (const entity of countries) validateEntity({ entity, kind: "country", facts, countryByEntityId, cityByEntityId, exceptionByScope: normalizedExceptions.byScope, usedExceptionIds, typePolicy: normalizedTypePolicy, violations });
  for (const entity of cities) validateEntity({ entity, kind: "city", facts, countryByEntityId, cityByEntityId, exceptionByScope: normalizedExceptions.byScope, usedExceptionIds, typePolicy: normalizedTypePolicy, violations });
  for (const entity of pois) validateEntity({ entity, kind: "poi", facts, countryByEntityId, cityByEntityId, exceptionByScope: normalizedExceptions.byScope, usedExceptionIds, typePolicy: normalizedTypePolicy, violations });

  for (const entry of normalizedExceptions.byScope.values()) {
    if (!usedExceptionIds.has(entry.exceptionId)) {
      addConfigurationViolation(violations, "exception-unused", { exceptionId: entry.exceptionId, exceptionQid: qid(entry.qid) });
    }
  }

  return {
    accepted: violations.length === 0,
    violations,
    checked: countries.length + cities.length + pois.length,
    factCount: facts.size,
    exceptionCount: normalizedExceptions.byScope.size,
    usedExceptionCount: usedExceptionIds.size,
    typePolicyNodeCount: normalizedTypePolicy?.nodes.size || 0,
    compositeAllowanceCount: normalizedTypePolicy?.compositeAllowanceCount || 0,
  };
}
