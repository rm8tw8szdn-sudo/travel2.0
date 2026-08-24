import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const BATCH = String(process.argv.find((value) => value.startsWith("--batch="))?.split("=")[1] || "06").padStart(2, "0");
if (!["06", "07"].includes(BATCH)) throw new Error("batch-argument-invalid:--batch=06|07");
const SEED_PATH = `data/knowledge/seeds/knowledge-expansion-batch${BATCH}-20-country.json`;
const MANIFEST_PATH = "data/route-v2/images/image-coverage-manifest.json";
const PROVENANCE_PATH = `data/route-v2/images/batch${BATCH}-dedicated-image-provenance.json`;
const PRIOR_PROVENANCE_PATH = BATCH === "07" ? "data/route-v2/images/batch06-dedicated-image-provenance.json" : null;
const ACQUIRED_AT = BATCH === "07" ? "2026-08-24T05:00:00.000Z" : "2026-08-17T09:00:00.000Z";
const USER_AGENT = `travel2-route-v2-image-backfill-batch${BATCH}/1.0 (https://github.com/rm8tw8szdn-sudo/travel2.0)`;
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIDTHS = [1200, 1000, 800, 640];
const TARGET_BYTES = 300_000;
const HIGH_FREQUENCY_HISTORY = new Set([
  "JP", "KR", "IT", "FR", "ES", "DE", "AT", "PT", "GR", "NL",
  "GB", "US", "CA", "TH", "CH", "AU", "NZ", "IS", "SG", "TR"
]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const clean = (value) => String(value || "").normalize("NFKC").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function apiUrl(endpoint, parameters) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ format: "json", origin: "*", ...parameters });
  return url;
}

async function fetchResponse(url, attempt = 0) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  if ((response.status === 429 || response.status >= 500) && attempt < 7) {
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : Math.min(20_000, 900 * 2 ** attempt));
    return fetchResponse(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`remote-fetch-failed:${response.status}:${new URL(url).hostname}`);
  return response;
}

async function fetchJson(url) {
  return fetchResponse(url).then((response) => response.json());
}

async function fetchEntities(qids) {
  const result = {};
  const unique = [...new Set(qids)].filter((qid) => /^Q\d+$/u.test(qid));
  for (let index = 0; index < unique.length; index += 50) {
    const payload = await fetchJson(apiUrl(WIKIDATA_API, {
      action: "wbgetentities",
      ids: unique.slice(index, index + 50).join("|"),
      props: "claims",
    }));
    Object.assign(result, payload.entities || {});
    await sleep(120);
  }
  return result;
}

function preferredP18(entity) {
  const claims = (entity?.claims?.P18 || []).filter((claim) => claim?.rank !== "deprecated");
  const preferred = claims.find((claim) => claim.rank === "preferred") || claims[0];
  return clean(preferred?.mainsnak?.datavalue?.value);
}

function freeLicense(value) {
  return /^(?:CC BY(?:-SA)?(?: |$)|CC0|Public domain|Public Domain Mark)/iu.test(clean(value));
}

function normalizeLicenseUrl(value) {
  const text = clean(value);
  if (!text) return null;
  if (text.startsWith("//")) return `https:${text}`;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

async function commonsInfo(fileTitle, width) {
  const payload = await fetchJson(apiUrl(COMMONS_API, {
    action: "query",
    titles: `File:${fileTitle}`,
    prop: "imageinfo",
    iiprop: "url|size|mime|sha1|extmetadata",
    iiurlwidth: String(width),
  }));
  const page = Object.values(payload.query?.pages || {})[0];
  return page?.missing !== undefined ? null : page?.imageinfo?.[0] || null;
}

function extensionFor(contentType) {
  if (/^image\/jpeg(?:;|$)/iu.test(contentType)) return "jpg";
  if (/^image\/png(?:;|$)/iu.test(contentType)) return "png";
  if (/^image\/webp(?:;|$)/iu.test(contentType)) return "webp";
  return "";
}

async function downloadSizedImage(fileTitle) {
  let lastReason = "commons-thumbnail-unavailable";
  for (const width of WIDTHS) {
    const info = await commonsInfo(fileTitle, width);
    if (!info?.thumburl || !info?.descriptionurl) return { accepted: false, reason: "commons-imageinfo-incomplete" };
    const license = clean(info.extmetadata?.LicenseShortName?.value);
    if (!freeLicense(license)) return { accepted: false, reason: `commons-license-not-approved:${license || "missing"}` };
    const response = await fetchResponse(info.thumburl);
    const contentType = clean(response.headers.get("content-type")).toLocaleLowerCase("en-US");
    const extension = extensionFor(contentType);
    if (!extension) return { accepted: false, reason: `commons-thumbnail-format-rejected:${contentType || "missing"}` };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > TARGET_BYTES) {
      lastReason = `commons-thumbnail-over-300kb:${buffer.length}`;
      await sleep(80);
      continue;
    }
    if (buffer.length < 8_000) return { accepted: false, reason: `commons-thumbnail-too-small:${buffer.length}` };
    return {
      accepted: true,
      buffer,
      extension,
      width: Number(info.thumbwidth || width),
      height: Number(info.thumbheight || 0),
      sourceUrl: info.descriptionurl,
      downloadUrl: info.thumburl,
      originalUrl: info.url,
      originalFileSha1: clean(info.sha1),
      license,
      licenseUrl: normalizeLicenseUrl(info.extmetadata?.LicenseUrl?.value),
      author: clean(info.extmetadata?.Artist?.value) || null,
      attribution: clean(info.extmetadata?.Credit?.value) || null,
    };
  }
  return { accepted: false, reason: lastReason };
}

async function atomicWrite(relativePath, contents) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

function candidateRecord(entity, countryCode, parentCityEntityId = null) {
  return {
    entityId: entity.entityId,
    wikidataId: entity.wikidataId,
    entityType: entity.entityType === "city" ? "City" : "POI",
    countryCode,
    parentCityEntityId,
    canonicalNameEn: entity.canonicalNameEn,
  };
}

async function main() {
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const pois = repository.listPois();
  const seed = JSON.parse(await readFile(path.join(ROOT, SEED_PATH), "utf8"));
  const oldManifest = JSON.parse(await readFile(path.join(ROOT, MANIFEST_PATH), "utf8"));
  const batchCodes = new Set(Object.keys(seed.countries));
  const historicalCodes = oldManifest.countries.map((record) => record.countryCode);
  const countryById = new Map(countries.map((country) => [country.entityId, country]));
  const citiesByCode = new Map();
  for (const city of cities) {
    const code = countryById.get(city.parentCountryEntityId)?.isoAlpha2;
    if (!citiesByCode.has(code)) citiesByCode.set(code, []);
    citiesByCode.get(code).push(city);
  }
  const poisByCity = new Map(cities.map((city) => [city.entityId, pois.filter((poi) => poi.parentCityEntityId === city.entityId)]));
  const sortedCities = (code) => [...(citiesByCode.get(code) || [])].sort((left, right) => (
    (poisByCity.get(right.entityId)?.length || 0) - (poisByCity.get(left.entityId)?.length || 0)
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
  ));
  const corePoi = (city) => [...(poisByCity.get(city.entityId) || [])]
    .sort((left, right) => left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en"))[0] || null;
  const inherited = PRIOR_PROVENANCE_PATH && fs.existsSync(path.join(ROOT, PRIOR_PROVENANCE_PATH))
    ? JSON.parse(await readFile(path.join(ROOT, PRIOR_PROVENANCE_PATH), "utf8"))
    : { assets: [], attempts: [] };
  const current = fs.existsSync(path.join(ROOT, PROVENANCE_PATH))
    ? JSON.parse(await readFile(path.join(ROOT, PROVENANCE_PATH), "utf8"))
    : { assets: [], attempts: [] };
  const previous = {
    assets: [...new Map([...(inherited.assets || []), ...(current.assets || [])].map((record) => [record.entityId, record])).values()],
    attempts: [...new Map([...(inherited.attempts || []), ...(current.attempts || [])].map((record) => [record.entityId, record])).values()],
  };

  const candidates = (previous.assets || []).map((record) => ({
    entityId: record.entityId,
    wikidataId: record.wikidataId,
    entityType: record.entityType,
    countryCode: record.countryCode,
    parentCityEntityId: record.parentCityEntityId || null,
    canonicalNameEn: record.canonicalNameEn,
  }));
  for (const code of historicalCodes) {
    const city = sortedCities(code)[0];
    if (city) candidates.push(candidateRecord(city, code));
    if (city && HIGH_FREQUENCY_HISTORY.has(code)) {
      const poi = corePoi(city);
      if (poi) candidates.push(candidateRecord(poi, code, city.entityId));
    }
  }
  for (const code of batchCodes) {
    const topCities = sortedCities(code).slice(0, 2);
    for (const city of topCities) candidates.push(candidateRecord(city, code));
    const poi = topCities[0] ? corePoi(topCities[0]) : null;
    if (poi) candidates.push(candidateRecord(poi, code, topCities[0].entityId));
  }
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.entityId, candidate])).values()];
  const candidateIds = new Set(uniqueCandidates.map((candidate) => candidate.entityId));
  const entities = await fetchEntities(uniqueCandidates.map((candidate) => candidate.wikidataId));
  for (const record of previous.assets || []) {
    if (candidateIds.has(record.entityId)) continue;
    if (!/^assets\/route-v2-images\/(?:cities|pois)\/[a-z0-9-]+\.(?:jpe?g|png|webp)$/u.test(record.assetPath || "")) continue;
    await rm(path.join(ROOT, record.assetPath), { force: true });
  }
  const assets = new Map((previous.assets || []).filter((record) => candidateIds.has(record.entityId) && fs.existsSync(path.join(ROOT, record.assetPath))).map((record) => [record.entityId, record]));
  const attempts = new Map((previous.attempts || []).filter((record) => candidateIds.has(record.entityId)).map((record) => [record.entityId, record]));
  const usedCommonsFiles = new Set([...assets.values()].map((record) => record.commonsFileTitle));
  const usedHashes = new Set([...assets.values()].map((record) => record.processedHash));

  for (const candidate of uniqueCandidates) {
    if (assets.has(candidate.entityId)) continue;
    const p18 = preferredP18(entities[candidate.wikidataId]);
    if (!p18) {
      attempts.set(candidate.entityId, { ...candidate, status: "needsBackfill", reason: "wikidata-p18-missing" });
      continue;
    }
    if (usedCommonsFiles.has(p18)) {
      attempts.set(candidate.entityId, { ...candidate, status: "needsBackfill", reason: "commons-file-already-bound", commonsFileTitle: p18 });
      continue;
    }
    let image;
    try {
      image = await downloadSizedImage(p18);
    } catch (error) {
      attempts.set(candidate.entityId, { ...candidate, status: "needsBackfill", reason: `download-error:${error.message}`, commonsFileTitle: p18 });
      await sleep(180);
      continue;
    }
    if (!image.accepted) {
      attempts.set(candidate.entityId, { ...candidate, status: "needsBackfill", reason: image.reason, commonsFileTitle: p18 });
      continue;
    }
    const hash = sha256(image.buffer);
    if (usedHashes.has(hash)) {
      attempts.set(candidate.entityId, { ...candidate, status: "needsBackfill", reason: "processed-image-duplicate", commonsFileTitle: p18, processedHash: hash });
      continue;
    }
    const kind = candidate.entityType === "City" ? "cities" : "pois";
    const prefix = candidate.entityType === "City" ? "city" : "poi";
    const assetPath = `assets/route-v2-images/${kind}/${prefix}-${candidate.wikidataId.toLocaleLowerCase("en-US")}.${image.extension}`;
    await atomicWrite(assetPath, image.buffer);
    const record = {
      ...candidate,
      assetPath,
      status: "imageReady",
      needsBackfill: false,
      assetKind: "verified-destination-image",
      semanticScope: candidate.entityType === "City" ? "exact-city" : "exact-poi",
      visualTruthStatus: "verified-entity-p18-photograph",
      rights: {
        sourceType: "wikimedia-commons-exact-entity-p18",
        sourceUrl: image.sourceUrl,
        author: image.author,
        attribution: image.attribution,
        license: image.license,
        licenseUrl: image.licenseUrl,
        externalCopyrightMaterial: true
      },
      assetType: "dedicated-destination-image",
      isDedicated: true,
      isPlaceholder: false,
      localPath: assetPath,
      sourceUrl: image.sourceUrl,
      sourcePath: PROVENANCE_PATH,
      license: image.license,
      dimensions: { width: image.width, height: image.height },
      sourceHash: hash,
      processedHash: hash,
      bytes: image.buffer.length,
      format: image.extension,
      verificationStatus: "verified-exact-entity-p18-commons-license",
      acquiredAt: ACQUIRED_AT,
      commonsFileTitle: p18,
      commonsDownloadUrl: image.downloadUrl,
      commonsOriginalUrl: image.originalUrl,
      commonsOriginalFileSha1: image.originalFileSha1
    };
    assets.set(candidate.entityId, record);
    attempts.set(candidate.entityId, { ...candidate, status: "imageReady", reason: "published", commonsFileTitle: p18 });
    usedCommonsFiles.add(p18);
    usedHashes.add(hash);
    await sleep(180);
  }

  const document = {
    schemaVersion: `route-v2-image-backfill-batch${BATCH}-provenance-v1`,
    acquiredAt: ACQUIRED_AT,
    sourcePolicy: "exact Wikidata entity P18 plus Wikimedia Commons free-license extmetadata; fixed local thumbnail only",
    candidateCount: uniqueCandidates.length,
    assetCount: assets.size,
    cityAssetCount: [...assets.values()].filter((record) => record.entityType === "City").length,
    poiAssetCount: [...assets.values()].filter((record) => record.entityType === "POI").length,
    assets: [...assets.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en")),
    attempts: [...attempts.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en"))
  };
  await atomicWrite(PROVENANCE_PATH, Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8"));
  console.log(JSON.stringify({
    status: "PASS",
    candidates: uniqueCandidates.length,
    imageReady: document.assetCount,
    dedicatedCities: document.cityAssetCount,
    dedicatedPois: document.poiAssetCount,
    needsBackfill: uniqueCandidates.length - document.assetCount,
    totalBytes: document.assets.reduce((sum, record) => sum + record.bytes, 0),
    output: PROVENANCE_PATH
  }, null, 2));
}

await main();
