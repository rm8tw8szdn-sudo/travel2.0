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
const SEED_PATH = "data/knowledge/seeds/knowledge-expansion-batch04-multi-country.json";
const RETRIEVED_AT = "2026-08-10T12:00:00.000Z";
const LANGUAGES = ["en", "zh-hans", "zh", "de", "pt", "el", "nl"];
const ISO = String(process.argv.find((value) => value.startsWith("--country="))?.split("=")[1] || "").toUpperCase();

if (!ISO) throw new Error("country-argument-required:--country=DE|AT|PT|GR|NL");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const clean = (value) => String(value || "").normalize("NFKC").trim();
const normalizeTitle = (value) => clean(value).toLocaleLowerCase("en-US");

async function fetchJson(url, attempt = 0) {
  const response = await fetch(url, {
    headers: { "User-Agent": "travel-collection-route-v2-knowledge-expansion-batch04/1.0" },
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    const retry = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1_000 : Math.min(30_000, 2_000 * (attempt + 1)));
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
  return Object.values(payload.entities || {}).find(
    (entity) => normalizeTitle(entity?.sitelinks?.enwiki?.title) === target,
  ) || null;
}

async function resolveTitleBatch(titles) {
  const payload = await fetchJson(apiUrl({
    action: "wbgetentities",
    sites: "enwiki",
    titles: titles.join("|"),
    redirects: "yes",
    props: "sitelinks",
  }));
  return {
    payload,
    resolved: new Map(titles.map((title) => [title, entityForTitle(title, payload)?.id || ""])),
  };
}

async function fetchEntities(qids) {
  const entities = {};
  for (let index = 0; index < qids.length; index += 40) {
    const payload = await fetchJson(apiUrl({
      action: "wbgetentities",
      ids: qids.slice(index, index + 40).join("|"),
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

function localizedLabel(entity, fallback) {
  return entity?.labels?.["zh-hans"]?.value || entity?.labels?.zh?.value || fallback;
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
  return createEntityLayerProvenanceEntry({
    field,
    sourceType,
    source,
    sourceUrl,
    retrievedAt: RETRIEVED_AT,
    value,
  });
}

function buildCity(seed, qid, entity, country) {
  const entityId = createTypedEntityId({ entityType: "city", wikidataId: qid });
  const coordinates = coordinate(entity);
  if (!coordinates) throw new Error(`city-coordinate-missing:${seed.key}:${qid}`);
  const wiki = `https://www.wikidata.org/wiki/${qid}`;
  const canonicalNameZh = localizedLabel(entity, seed.canonicalNameEn);
  const entityAliases = aliases(entity, seed.aliases || [], [canonicalNameZh, seed.canonicalNameEn]);
  const schema = (field, value) => provenance(
    field,
    "project-schema",
    `Route V2 Knowledge Expansion ${country.batchLabel}`,
    "",
    value,
  );
  const wd = (field, value) => provenance(
    field,
    "wikidata",
    "Wikidata enwiki title plus wbgetentities",
    wiki,
    value,
  );
  return {
    schemaVersion: "route-v2-city-baseline-p1b",
    entityId,
    entityType: "city",
    parentCountryEntityId: country.countryEntityId,
    wikidataId: qid,
    canonicalNameZh,
    canonicalNameEn: seed.canonicalNameEn,
    aliases: entityAliases,
    coordinates,
    entitySourceType: "wikidata",
    confidence: 0.95,
    retrievedAt: RETRIEVED_AT,
    provenance: {
      entityId: schema("entityId", entityId),
      entityType: schema("entityType", "city"),
      parentCountryEntityId: provenance(
        "parentCountryEntityId",
        "repository-reference",
        `${country.label} Country Entity`,
        `https://www.wikidata.org/wiki/${country.wikidataId}`,
        country.countryEntityId,
      ),
      wikidataId: wd("wikidataId", qid),
      canonicalNameZh: wd("canonicalNameZh", canonicalNameZh),
      canonicalNameEn: wd("canonicalNameEn", seed.canonicalNameEn),
      aliases: wd("aliases", entityAliases),
      coordinates: wd("coordinates", coordinates),
      entitySourceType: schema("entitySourceType", "wikidata"),
      confidence: schema("confidence", 0.95),
      retrievedAt: wd("retrievedAt", RETRIEVED_AT),
    },
  };
}

function buildPoi(seed, qid, entity, city, country) {
  const entityId = createTypedEntityId({ entityType: "poi", wikidataId: qid });
  const coordinates = coordinate(entity);
  if (!coordinates) throw new Error(`poi-coordinate-missing:${city.key}:${seed.canonicalNameEn}:${qid}`);
  const wiki = `https://www.wikidata.org/wiki/${qid}`;
  const canonicalNameZh = localizedLabel(entity, seed.canonicalNameEn);
  const entityAliases = aliases(entity, [], [canonicalNameZh, seed.canonicalNameEn]);
  const schema = (field, value) => provenance(
    field,
    "project-schema",
    `Route V2 Knowledge Expansion ${country.batchLabel}`,
    "",
    value,
  );
  const wd = (field, value) => provenance(
    field,
    "wikidata",
    "Wikidata enwiki title plus wbgetentities",
    wiki,
    value,
  );
  return {
    schemaVersion: "route-v2-poi-baseline-p1b",
    entityId,
    entityType: "poi",
    parentCityEntityId: city.entityId,
    wikidataId: qid,
    canonicalNameZh,
    canonicalNameEn: seed.canonicalNameEn,
    aliases: entityAliases,
    coordinates,
    entitySourceType: "wikidata",
    confidence: 0.95,
    retrievedAt: RETRIEVED_AT,
    provenance: {
      entityId: schema("entityId", entityId),
      entityType: schema("entityType", "poi"),
      parentCityEntityId: provenance(
        "parentCityEntityId",
        "repository-reference",
        `${country.label} City Entity`,
        `https://www.wikidata.org/wiki/${city.wikidataId}`,
        city.entityId,
      ),
      wikidataId: wd("wikidataId", qid),
      canonicalNameZh: wd("canonicalNameZh", canonicalNameZh),
      canonicalNameEn: wd("canonicalNameEn", seed.canonicalNameEn),
      aliases: wd("aliases", entityAliases),
      coordinates: wd("coordinates", coordinates),
      entitySourceType: schema("entitySourceType", "wikidata"),
      confidence: schema("confidence", 0.95),
      retrievedAt: wd("retrievedAt", RETRIEVED_AT),
    },
  };
}

async function readAssets(paths, key) {
  return (await Promise.all(paths.map(async (relativePath) => (
    JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"))[key]
  )))).flat();
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

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function main() {
  const rootSeed = JSON.parse(await readFile(path.join(ROOT, SEED_PATH), "utf8"));
  const country = rootSeed.countries[ISO];
  if (!country) throw new Error(`unsupported-country:${ISO}`);
  const prefix = `knowledge-expansion-${country.batchLabel}`;
  const outputs = {
    raw: `data/knowledge/raw/${prefix}.wikidata.json`,
    cities: `data/knowledge/batches/cities.p1b-batch${country.batchNumber}.json`,
    pois: `data/knowledge/batches/pois.p1b-batch${country.batchNumber}.json`,
    provenance: `data/knowledge/batches/provenance.${prefix}.json`,
    conflicts: `data/knowledge/batches/conflicts.${prefix}.json`,
    review: `data/knowledge/batches/review-queue.${prefix}.json`,
    selection: `data/knowledge/batches/selection.p1b-batch${country.batchNumber}.json`,
  };
  const outputSet = new Set([outputs.cities, outputs.pois]);
  const existingCities = await readAssets(
    KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.filter((value) => !outputSet.has(value)),
    "cities",
  );
  const existingPois = await readAssets(
    KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.filter((value) => !outputSet.has(value)),
    "pois",
  );
  const existingCityByQid = new Map(existingCities.map((entry) => [entry.wikidataId, entry]));
  const existingPoiByQid = new Map(existingPois.map((entry) => [entry.wikidataId, entry]));
  const entries = country.cities.flatMap((city) => [
    { type: "city", key: city.key, enwikiTitle: city.enwikiTitle, seed: city },
    ...(country.poiGroups[city.key] || []).map(([enwikiTitle, canonicalNameEn]) => ({
      type: "poi",
      key: `${city.key}:${canonicalNameEn}`,
      cityKey: city.key,
      enwikiTitle,
      seed: { enwikiTitle, canonicalNameEn },
    })),
  ]);
  const qidByKey = new Map([
    ...country.cities
      .filter((city) => city.existing)
      .map((city) => [`city:${city.key}`, city.wikidataId]),
    ...Object.entries(country.explicitQids || {}),
  ]);
  const titleAudit = [];
  const titled = entries.filter((entry) => entry.enwikiTitle);
  for (let index = 0; index < titled.length; index += 25) {
    const batch = titled.slice(index, index + 25);
    const { payload, resolved } = await resolveTitleBatch(batch.map((entry) => entry.enwikiTitle));
    for (const entry of batch) {
      const qid = resolved.get(entry.enwikiTitle) || "";
      if (qid && !qidByKey.has(`${entry.type}:${entry.key}`)) {
        qidByKey.set(`${entry.type}:${entry.key}`, qid);
      }
      titleAudit.push({
        key: entry.key,
        type: entry.type,
        requestedTitle: entry.enwikiTitle,
        resolvedTitle: redirectedTitle(entry.enwikiTitle, payload),
        qid,
      });
    }
    await sleep(500);
  }
  const unresolved = entries.filter((entry) => !qidByKey.get(`${entry.type}:${entry.key}`));
  const unresolvedCities = unresolved.filter((entry) => entry.type === "city");
  if (unresolvedCities.length) {
    throw new Error(`wikidata-unresolved-city:${unresolvedCities.map((entry) => entry.key).join("|")}`);
  }
  const resolved = entries.filter((entry) => qidByKey.get(`${entry.type}:${entry.key}`));
  const qids = [...new Set(
    resolved.map((entry) => qidByKey.get(`${entry.type}:${entry.key}`)),
  )].sort();
  const entities = await fetchEntities(qids);
  const selectedByQid = new Map();
  const duplicateSelections = [];
  for (const entry of resolved) {
    const qid = qidByKey.get(`${entry.type}:${entry.key}`);
    const previous = selectedByQid.get(qid);
    if (previous && previous.key !== entry.key) {
      duplicateSelections.push({ qid, keys: [previous.key, entry.key] });
    }
    selectedByQid.set(qid, entry);
  }
  if (duplicateSelections.length) {
    throw new Error(`wikidata-duplicate-selection:${JSON.stringify(duplicateSelections)}`);
  }
  const cityByKey = new Map();
  const newCities = [];
  for (const citySeed of country.cities) {
    const qid = qidByKey.get(`city:${citySeed.key}`);
    const existing = existingCityByQid.get(qid);
    if (existing && existing.parentCountryEntityId !== country.countryEntityId) {
      throw new Error(`existing-city-parent-mismatch:${qid}:${citySeed.key}`);
    }
    const city = existing || buildCity(citySeed, qid, entities[qid], country);
    cityByKey.set(citySeed.key, { ...city, key: citySeed.key });
    if (!existing) newCities.push(city);
  }
  const newPois = [];
  const missingCoordinates = [];
  const selectedPoiQidsByCity = {};
  for (const citySeed of country.cities) {
    selectedPoiQidsByCity[citySeed.key] = [];
    for (const [enwikiTitle, canonicalNameEn] of country.poiGroups[citySeed.key] || []) {
      const key = `${citySeed.key}:${canonicalNameEn}`;
      const qid = qidByKey.get(`poi:${key}`);
      if (!qid) continue;
      if (!coordinate(entities[qid])) {
        missingCoordinates.push({
          type: "poi",
          key,
          requestedTitle: enwikiTitle,
          reasonCode: "wikidata-coordinate-not-confirmed",
        });
        continue;
      }
      selectedPoiQidsByCity[citySeed.key].push(qid);
      const existing = existingPoiByQid.get(qid);
      if (existing) {
        if (existing.parentCityEntityId !== cityByKey.get(citySeed.key).entityId) {
          throw new Error(`existing-poi-parent-mismatch:${qid}:${citySeed.key}`);
        }
      } else {
        newPois.push(buildPoi(
          { canonicalNameEn },
          qid,
          entities[qid],
          cityByKey.get(citySeed.key),
          country,
        ));
      }
    }
  }
  const cityValidation = validateKnowledgeCityEntitySet(newCities);
  const poiValidation = validateKnowledgePoiEntitySet(newPois);
  if (!cityValidation.accepted) {
    throw new Error(`city-validation-failed:${JSON.stringify(cityValidation.reasons)}`);
  }
  if (!poiValidation.accepted) {
    throw new Error(`poi-validation-failed:${JSON.stringify(poiValidation.reasons)}`);
  }
  newCities.sort((left, right) => left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en"));
  newPois.sort((left, right) => (
    left.parentCityEntityId.localeCompare(right.parentCityEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
  ));
  const reviews = [
    ...country.regionalReview.map((name) => ({
      entityType: "region",
      seedKey: name,
      requestedTitle: name,
      reasonCode: "entity-type-not-supported-by-current-schema",
      disposition: "excluded-from-published-batch",
    })),
    ...unresolved.map((entry) => ({
      entityType: entry.type,
      seedKey: entry.key,
      requestedTitle: entry.enwikiTitle || null,
      reasonCode: "stable-wikidata-id-not-confirmed",
      disposition: "excluded-from-published-batch",
    })),
    ...missingCoordinates.map((entry) => ({
      entityType: entry.type,
      seedKey: entry.key,
      requestedTitle: entry.requestedTitle,
      reasonCode: entry.reasonCode,
      disposition: "excluded-from-published-batch",
    })),
  ].map((entry, index) => ({
    reviewId: `${country.batchLabel}-review-${String(index + 1).padStart(3, "0")}`,
    ...entry,
  }));
  const selection = {
    schemaVersion: `route-v2-${country.batchLabel}-selection-v1`,
    country: [{
      entityId: country.countryEntityId,
      wikidataId: country.wikidataId,
      canonicalNameEn: country.label,
    }],
    cities: [...cityByKey.values()].map(({ key, ...city }) => ({
      key,
      entityId: city.entityId,
      parentCountryEntityId: city.parentCountryEntityId,
      wikidataId: city.wikidataId,
      canonicalNameEn: city.canonicalNameEn,
      targetPoiCount: country.cities.find((entry) => entry.key === key).targetPoiCount,
      selectedPoiCount: selectedPoiQidsByCity[key].length,
    })).sort((left, right) => left.key.localeCompare(right.key, "en")),
    pois: newPois.map((poi) => ({
      entityId: poi.entityId,
      parentCityEntityId: poi.parentCityEntityId,
      wikidataId: poi.wikidataId,
      canonicalNameEn: poi.canonicalNameEn,
    })),
    regionalReview: country.regionalReview,
  };
  await atomicText(outputs.raw, jsonText({
    schemaVersion: `route-v2-${country.batchLabel}-raw-v1`,
    retrievedAt: RETRIEVED_AT,
    endpoint: ENDPOINT,
    seedPath: SEED_PATH,
    country: ISO,
    qids,
    titleAudit,
    selections: entries.map((entry) => ({
      type: entry.type,
      key: entry.key,
      requestedTitle: entry.enwikiTitle || null,
      qid: qidByKey.get(`${entry.type}:${entry.key}`) || null,
    })),
    wikidata: { entities },
  }));
  await atomicText(outputs.cities, jsonText({
    schemaVersion: `route-v2-city-baseline-p1b-batch${country.batchNumber}`,
    generatedFrom: outputs.raw,
    cityCount: newCities.length,
    cities: newCities,
  }));
  await atomicText(outputs.pois, jsonText({
    schemaVersion: `route-v2-poi-baseline-p1b-batch${country.batchNumber}`,
    generatedFrom: outputs.raw,
    poiCount: newPois.length,
    pois: newPois,
  }));
  await atomicText(outputs.provenance, jsonText({
    schemaVersion: `route-v2-${country.batchLabel}-provenance-v1`,
    retrievedAt: RETRIEVED_AT,
    source: "Wikidata enwiki title resolution plus wbgetentities",
    entityQids: qids,
  }));
  await atomicText(outputs.conflicts, jsonText({
    schemaVersion: `route-v2-${country.batchLabel}-conflicts-v1`,
    conflictCount: 0,
    conflicts: [],
  }));
  await atomicText(outputs.review, jsonText({
    schemaVersion: `route-v2-${country.batchLabel}-review-v1`,
    reviewCount: reviews.length,
    entries: reviews,
  }));
  await atomicText(outputs.selection, jsonText(selection));
  console.log(JSON.stringify({
    country: ISO,
    newCities: newCities.length,
    requestedPois: Object.values(selectedPoiQidsByCity).flat().length,
    reusedPois: Object.values(selectedPoiQidsByCity)
      .flat()
      .filter((qid) => existingPoiByQid.has(qid))
      .length,
    newPois: newPois.length,
    unresolvedPois: unresolved.filter((entry) => entry.type === "poi").length,
    coordinateMissingPois: missingCoordinates.length,
    regionalReview: country.regionalReview,
    outputs,
  }, null, 2));
}

await main();
