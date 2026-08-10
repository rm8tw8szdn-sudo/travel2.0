import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeEntityLayerAliases,
  createEntityLayerProvenanceEntry,
  createTypedEntityId,
} from "../src/lib/routes/knowledge-entity-layer-primitives.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "travel-collection-route-v2-knowledge-expansion-batch02/1.0";
const RETRIEVED_AT = "2026-08-03T12:00:00.000Z";
const LANGUAGES = ["en", "zh-hans", "zh", "ja"];
const SEED_PATH = "data/knowledge/seeds/knowledge-expansion-batch02-japan.json";

const OUTPUTS = Object.freeze({
  raw: "data/knowledge/raw/knowledge-expansion-batch02-japan.wikidata.json",
  cities: "data/knowledge/batches/cities.p1b-batch04.json",
  pois: "data/knowledge/batches/pois.p1b-batch04.json",
  provenance: "data/knowledge/batches/provenance.knowledge-expansion-batch02.json",
  conflicts: "data/knowledge/batches/conflicts.knowledge-expansion-batch02.json",
  review: "data/knowledge/batches/review-queue.knowledge-expansion-batch02.json",
  selection: "data/knowledge/batches/selection.p1b-batch04.json",
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchJson(url, attempt = 0) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : Math.min(30_000, 3_000 * (attempt + 1));
    await sleep(backoff);
    return fetchJson(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`wikidata-fetch-failed:${response.status}:${url.pathname}`);
  return response.json();
}

function apiUrl(parameters) {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ format: "json", ...parameters });
  return url;
}

function normalizeTitle(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function redirectedTitle(title, payload) {
  let current = title;
  for (let index = 0; index < 5; index += 1) {
    const normalized = (payload.normalized || []).find((entry) => normalizeTitle(entry.from) === normalizeTitle(current));
    if (normalized) current = normalized.to;
    const redirect = (payload.redirects || []).find((entry) => normalizeTitle(entry.from) === normalizeTitle(current));
    if (redirect) current = redirect.to;
    if (!normalized && !redirect) break;
  }
  return current;
}

function entityForTitle(title, payload) {
  const target = normalizeTitle(redirectedTitle(title, payload));
  return Object.values(payload.entities || {}).find((entity) => normalizeTitle(entity?.sitelinks?.enwiki?.title) === target) || null;
}

async function resolveTitleBatch(titles) {
  const payload = await fetchJson(apiUrl({
    action: "wbgetentities",
    sites: "enwiki",
    titles: titles.join("|"),
    redirects: "yes",
    props: "sitelinks",
  }));
  return { payload, resolved: new Map(titles.map((title) => [title, entityForTitle(title, payload)?.id || ""])) };
}

async function searchFallback(seed, cityName = "") {
  const query = [seed.canonicalNameEn, cityName, "Japan"].filter(Boolean).join(" ");
  const payload = await fetchJson(apiUrl({
    action: "wbsearchentities",
    language: "en",
    uselang: "en",
    type: "item",
    limit: "10",
    search: query,
  }));
  const exact = (payload.search || []).find((entry) => normalizeTitle(entry.label) === normalizeTitle(seed.canonicalNameEn));
  const japan = (payload.search || []).find((entry) => /japan|japanese/u.test(String(entry.description || "")));
  const selected = exact || japan || payload.search?.[0];
  return { query, qid: selected?.id || "", candidates: payload.search || [] };
}

async function fetchEntities(qids) {
  const entities = {};
  for (let index = 0; index < qids.length; index += 40) {
    const batch = qids.slice(index, index + 40);
    const payload = await fetchJson(apiUrl({
      action: "wbgetentities",
      ids: batch.join("|"),
      props: "labels|aliases|descriptions|claims|sitelinks",
      languages: LANGUAGES.join("|"),
    }));
    Object.assign(entities, payload.entities || {});
    await sleep(150);
  }
  return entities;
}

function coordinate(entity) {
  const claim = (entity?.claims?.P625 || []).find((entry) => entry?.rank !== "deprecated");
  const value = claim?.mainsnak?.datavalue?.value;
  if (!Number.isFinite(Number(value?.latitude)) || !Number.isFinite(Number(value?.longitude))) return null;
  return { latitude: Number(value.latitude), longitude: Number(value.longitude) };
}

function aliases(entity, curated, canonical) {
  return canonicalizeEntityLayerAliases([
    ...curated,
    ...LANGUAGES.flatMap((language) => [
      entity?.labels?.[language]?.value,
      ...(entity?.aliases?.[language] || []).map((entry) => entry.value),
    ]),
  ].filter(Boolean), canonical);
}

function provenance(field, sourceType, source, sourceUrl, value) {
  return createEntityLayerProvenanceEntry({ field, sourceType, source, sourceUrl, retrievedAt: RETRIEVED_AT, value });
}

function buildCity(seed, qid, rawEntity, countryEntityId) {
  const entityId = createTypedEntityId({ entityType: "city", wikidataId: qid });
  const coords = coordinate(rawEntity);
  if (!coords) throw new Error(`city-coordinate-missing:${seed.key}:${qid}`);
  const wiki = `https://www.wikidata.org/wiki/${qid}`;
  const cityAliases = aliases(rawEntity, seed.aliases || [], [seed.canonicalNameZh, seed.canonicalNameEn]);
  const schema = (field, value) => provenance(field, "project-schema", "Route V2 Knowledge Expansion Batch 02", "", value);
  const wd = (field, value) => provenance(field, "wikidata", "Wikidata enwiki title plus wbgetentities", wiki, value);
  return {
    schemaVersion: "route-v2-city-baseline-p1b",
    entityId,
    entityType: "city",
    parentCountryEntityId: countryEntityId,
    wikidataId: qid,
    canonicalNameZh: seed.canonicalNameZh,
    canonicalNameEn: seed.canonicalNameEn,
    aliases: cityAliases,
    coordinates: coords,
    entitySourceType: "wikidata",
    confidence: 0.95,
    retrievedAt: RETRIEVED_AT,
    provenance: {
      entityId: schema("entityId", entityId),
      entityType: schema("entityType", "city"),
      parentCountryEntityId: provenance("parentCountryEntityId", "repository-reference", "Route V2 Japan Country Entity", "https://www.wikidata.org/wiki/Q17", countryEntityId),
      wikidataId: wd("wikidataId", qid),
      canonicalNameZh: provenance("canonicalNameZh", "project-schema", "Curated Chinese display name for Knowledge Expansion Batch 02", wiki, seed.canonicalNameZh),
      canonicalNameEn: wd("canonicalNameEn", seed.canonicalNameEn),
      aliases: wd("aliases", cityAliases),
      coordinates: wd("coordinates", coords),
      entitySourceType: schema("entitySourceType", "wikidata"),
      confidence: schema("confidence", 0.95),
      retrievedAt: wd("retrievedAt", RETRIEVED_AT),
    },
  };
}

function buildPoi(seed, qid, rawEntity, city) {
  const entityId = createTypedEntityId({ entityType: "poi", wikidataId: qid });
  const coords = coordinate(rawEntity);
  if (!coords) throw new Error(`poi-coordinate-missing:${city.key}:${seed.canonicalNameEn}:${qid}`);
  const wiki = `https://www.wikidata.org/wiki/${qid}`;
  const poiAliases = aliases(rawEntity, [], [seed.canonicalNameZh, seed.canonicalNameEn]);
  const schema = (field, value) => provenance(field, "project-schema", "Route V2 Knowledge Expansion Batch 02", "", value);
  const wd = (field, value) => provenance(field, "wikidata", "Wikidata enwiki title plus wbgetentities", wiki, value);
  return {
    schemaVersion: "route-v2-poi-baseline-p1b",
    entityId,
    entityType: "poi",
    parentCityEntityId: city.entityId,
    wikidataId: qid,
    canonicalNameZh: seed.canonicalNameZh,
    canonicalNameEn: seed.canonicalNameEn,
    aliases: poiAliases,
    coordinates: coords,
    entitySourceType: "wikidata",
    confidence: 0.95,
    retrievedAt: RETRIEVED_AT,
    provenance: {
      entityId: schema("entityId", entityId),
      entityType: schema("entityType", "poi"),
      parentCityEntityId: provenance("parentCityEntityId", "repository-reference", "Route V2 Japan City Entity", `https://www.wikidata.org/wiki/${city.wikidataId}`, city.entityId),
      wikidataId: wd("wikidataId", qid),
      canonicalNameZh: provenance("canonicalNameZh", "project-schema", "Curated Chinese display name for Knowledge Expansion Batch 02", wiki, seed.canonicalNameZh),
      canonicalNameEn: wd("canonicalNameEn", seed.canonicalNameEn),
      aliases: wd("aliases", poiAliases),
      coordinates: wd("coordinates", coords),
      entitySourceType: schema("entitySourceType", "wikidata"),
      confidence: schema("confidence", 0.95),
      retrievedAt: wd("retrievedAt", RETRIEVED_AT),
    },
  };
}

async function atomicText(relativePath, contents) {
  const filePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents, "utf8");
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const seed = JSON.parse(await readFile(path.join(ROOT, SEED_PATH), "utf8"));
  const existingCities = (await Promise.all(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities
    .filter((relativePath) => relativePath !== OUTPUTS.cities)
    .map(async (relativePath) => JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8")).cities))).flat();
  const existingPois = (await Promise.all(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois
    .filter((relativePath) => relativePath !== OUTPUTS.pois)
    .map(async (relativePath) => JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8")).pois))).flat();
  const existingCityByQid = new Map(existingCities.map((city) => [city.wikidataId, city]));
  const existingPoiByQid = new Map(existingPois.map((poi) => [poi.wikidataId, poi]));

  const entries = [];
  for (const city of seed.cities) {
    entries.push({ type: "city", key: city.key, enwikiTitle: city.enwikiTitle, canonicalNameEn: city.canonicalNameEn, seed: city });
    for (const [enwikiTitle, canonicalNameEn, canonicalNameZh] of seed.poiGroups[city.key] || []) {
      entries.push({ type: "poi", key: `${city.key}:${canonicalNameEn}`, cityKey: city.key, enwikiTitle, canonicalNameEn, canonicalNameZh, seed: { enwikiTitle, canonicalNameEn, canonicalNameZh } });
    }
  }

  const titleEntries = entries.filter((entry) => entry.enwikiTitle);
  const qidByKey = new Map([
    ...seed.cities.filter((city) => city.existing).map((city) => [`city:${city.key}`, city.wikidataId]),
    ...Object.entries(seed.explicitQids || {}),
  ]);
  const titleAudit = [];
  for (let index = 0; index < titleEntries.length; index += 25) {
    const batch = titleEntries.slice(index, index + 25);
    const { payload, resolved } = await resolveTitleBatch(batch.map((entry) => entry.enwikiTitle));
    for (const entry of batch) {
      const qid = resolved.get(entry.enwikiTitle) || "";
      if (qid) qidByKey.set(`${entry.type}:${entry.key}`, qid);
      titleAudit.push({ key: entry.key, type: entry.type, requestedTitle: entry.enwikiTitle, resolvedTitle: redirectedTitle(entry.enwikiTitle, payload), qid });
    }
    await sleep(1_000);
  }

  const fallbackAudit = [];
  const titleUnresolved = entries.filter((value) => !qidByKey.get(`${value.type}:${value.key}`));
  const unresolvedCities = titleUnresolved.filter((entry) => entry.type === "city");
  if (unresolvedCities.length && !process.argv.includes("--resolve-fallbacks")) {
    console.error(JSON.stringify({
      status: "NEEDS_EXPLICIT_QID_REVIEW",
      unresolved: unresolvedCities.map((entry) => ({ type: entry.type, key: entry.key, requestedTitle: entry.enwikiTitle || null })),
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  for (const entry of process.argv.includes("--resolve-fallbacks") ? titleUnresolved : []) {
    const city = seed.cities.find((value) => value.key === entry.cityKey);
    const fallback = await searchFallback(entry, city?.canonicalNameEn || "");
    if (fallback.qid) qidByKey.set(`${entry.type}:${entry.key}`, fallback.qid);
    fallbackAudit.push({ key: entry.key, type: entry.type, ...fallback });
    await sleep(1_500);
  }

  const unresolved = entries.filter((entry) => !qidByKey.get(`${entry.type}:${entry.key}`));
  const blockingUnresolved = unresolved.filter((entry) => entry.type === "city");
  if (blockingUnresolved.length) throw new Error(`wikidata-unresolved-city:${blockingUnresolved.map((entry) => entry.key).join("|")}`);
  const resolvedEntries = entries.filter((entry) => qidByKey.get(`${entry.type}:${entry.key}`));

  const allQids = [...new Set(resolvedEntries.map((entry) => qidByKey.get(`${entry.type}:${entry.key}`)))].sort();
  const rawEntities = await fetchEntities(allQids);
  const qidDuplicates = allQids.filter((qid) => resolvedEntries.filter((entry) => qidByKey.get(`${entry.type}:${entry.key}`) === qid).length > 1);
  const allowedExistingPoiDuplicates = new Set(existingPois.map((poi) => poi.wikidataId));
  const blockingDuplicateQids = qidDuplicates.filter((qid) => !allowedExistingPoiDuplicates.has(qid));
  if (blockingDuplicateQids.length) throw new Error(`wikidata-duplicate-selection:${[...new Set(blockingDuplicateQids)].join("|")}`);

  const cityByKey = new Map();
  const newCities = [];
  for (const citySeed of seed.cities) {
    const qid = qidByKey.get(`city:${citySeed.key}`);
    const existing = existingCityByQid.get(qid);
    const city = existing || buildCity(citySeed, qid, rawEntities[qid], seed.country.countryEntityId);
    cityByKey.set(citySeed.key, { ...city, key: citySeed.key });
    if (!existing) newCities.push(city);
  }

  const newPois = [];
  const missingCoordinatePois = [];
  const requestedPoiQidsByCity = {};
  for (const citySeed of seed.cities) {
    requestedPoiQidsByCity[citySeed.key] = [];
    for (const [, canonicalNameEn, canonicalNameZh] of seed.poiGroups[citySeed.key]) {
      const key = `${citySeed.key}:${canonicalNameEn}`;
      const qid = qidByKey.get(`poi:${key}`);
      if (!qid) continue;
      if (!coordinate(rawEntities[qid])) {
        missingCoordinatePois.push({ type: "poi", key, enwikiTitle: seed.poiGroups[citySeed.key].find((entry) => entry[1] === canonicalNameEn)?.[0] || null, canonicalNameEn });
        continue;
      }
      requestedPoiQidsByCity[citySeed.key].push(qid);
      const existing = existingPoiByQid.get(qid);
      if (existing) {
        if (existing.parentCityEntityId !== cityByKey.get(citySeed.key).entityId) throw new Error(`existing-poi-parent-mismatch:${qid}`);
        continue;
      }
      newPois.push(buildPoi({ canonicalNameEn, canonicalNameZh }, qid, rawEntities[qid], cityByKey.get(citySeed.key)));
    }
  }

  const cityValidation = validateKnowledgeCityEntitySet(newCities);
  const poiValidation = validateKnowledgePoiEntitySet(newPois);
  if (!cityValidation.accepted) throw new Error(`city-validation-failed:${JSON.stringify(cityValidation.reasons)}`);
  if (!poiValidation.accepted) throw new Error(`poi-validation-failed:${JSON.stringify(poiValidation.reasons)}`);

  newCities.sort((left, right) => left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en"));
  newPois.sort((left, right) => left.parentCityEntityId.localeCompare(right.parentCityEntityId, "en") || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en"));

  const raw = {
    schemaVersion: "route-v2-knowledge-expansion-batch02-japan-raw-v1",
    retrievedAt: RETRIEVED_AT,
    endpoint: ENDPOINT,
    seedPath: SEED_PATH,
    qids: allQids,
    titleAudit,
    fallbackAudit,
    selections: entries.map((entry) => ({ type: entry.type, key: entry.key, requestedTitle: entry.enwikiTitle || null, qid: qidByKey.get(`${entry.type}:${entry.key}`) || null })),
    wikidata: { entities: rawEntities },
  };
  const citiesAsset = { schemaVersion: "route-v2-city-baseline-p1b-batch04", generatedFrom: OUTPUTS.raw, cityCount: newCities.length, cities: newCities };
  const poisAsset = { schemaVersion: "route-v2-poi-baseline-p1b-batch04", generatedFrom: OUTPUTS.raw, poiCount: newPois.length, pois: newPois };
  const selection = {
    schemaVersion: "route-v2-knowledge-expansion-batch02-selection-v1",
    country: [{ entityId: seed.country.countryEntityId, wikidataId: seed.country.wikidataId, canonicalNameEn: "Japan" }],
    cities: [...cityByKey.values()].map(({ key, ...city }) => ({ key, entityId: city.entityId, parentCountryEntityId: city.parentCountryEntityId, wikidataId: city.wikidataId, canonicalNameEn: city.canonicalNameEn, targetPoiCount: requestedPoiQidsByCity[key].length })).sort((left, right) => left.key.localeCompare(right.key, "en")),
    pois: newPois.map((poi) => ({ entityId: poi.entityId, parentCityEntityId: poi.parentCityEntityId, wikidataId: poi.wikidataId, canonicalNameEn: poi.canonicalNameEn })),
  };
  const provenanceReport = { schemaVersion: "route-v2-knowledge-expansion-batch02-provenance-v1", retrievedAt: RETRIEVED_AT, source: "Wikidata enwiki title resolution plus wbgetentities and explicit Chinese display-name curation", entityQids: allQids };
  const conflicts = { schemaVersion: "route-v2-knowledge-expansion-batch02-conflicts-v1", conflictCount: 0, conflicts: [] };
  const reviewEntries = [
    ...unresolved.map((entry) => ({ ...entry, reasonCode: "stable-wikidata-id-not-confirmed" })),
    ...missingCoordinatePois.map((entry) => ({ ...entry, reasonCode: "wikidata-coordinate-not-confirmed" })),
  ].map((entry) => ({
    reviewId: `batch02-unresolved-${entry.type}-${entry.key}`,
    entityType: entry.type,
    seedKey: entry.key,
    requestedTitle: entry.enwikiTitle || null,
    reasonCode: entry.reasonCode,
    disposition: "excluded-from-published-batch",
  }));
  const review = { schemaVersion: "route-v2-knowledge-expansion-batch02-review-v1", reviewCount: reviewEntries.length, entries: reviewEntries };

  await atomicText(OUTPUTS.raw, jsonText(raw));
  await atomicText(OUTPUTS.cities, jsonText(citiesAsset));
  await atomicText(OUTPUTS.pois, jsonText(poisAsset));
  await atomicText(OUTPUTS.provenance, jsonText(provenanceReport));
  await atomicText(OUTPUTS.conflicts, jsonText(conflicts));
  await atomicText(OUTPUTS.review, jsonText(review));
  await atomicText(OUTPUTS.selection, jsonText(selection));

  console.log(JSON.stringify({
    newCities: newCities.length,
    requestedJapanPois: Object.values(requestedPoiQidsByCity).reduce((total, qids) => total + qids.length, 0),
    existingJapanPoisReused: Object.values(requestedPoiQidsByCity).flat().filter((qid) => existingPoiByQid.has(qid)).length,
    newPois: newPois.length,
    unresolvedPoisExcluded: unresolved.filter((entry) => entry.type === "poi").length,
    coordinateMissingPoisExcluded: missingCoordinatePois.length,
    titleFallbacks: fallbackAudit.length,
    outputs: OUTPUTS,
  }, null, 2));
}

await main();
