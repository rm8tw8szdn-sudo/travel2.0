import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, ".route-v2-cache");
const ACCEPTED_PATH = process.env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(CACHE_DIR, "accepted-routes.json");
const REPORT_PATH = process.env.ROUTE_FEED_IMAGE_PREWARM_REPORT || path.join(CACHE_DIR, "feed-image-prewarm-report.json");
const FEED_IMAGE_POOL_PATH = process.env.ROUTE_FEED_IMAGE_POOL_PATH || path.join(CACHE_DIR, "feed-image-pool.json");
const API_BASE_URL = process.env.ROUTE_PREWARM_API_BASE_URL || "http://127.0.0.1:4173";
const TARGET_CROSS = Number.parseInt(process.env.ROUTE_PREWARM_CROSS || "500", 10);
const TARGET_SINGLE = Number.parseInt(process.env.ROUTE_PREWARM_SINGLE || "500", 10);
const WINDOW_SIZE = Number.parseInt(process.env.ROUTE_PREWARM_IMAGE_WINDOW || "50", 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.ROUTE_PREWARM_REQUEST_TIMEOUT_MS || "8000", 10);
const DRY_RUN = process.env.ROUTE_PREWARM_DRY_RUN === "true";
const ENABLE_COUNTRY_POOL = process.env.ROUTE_PREWARM_ENABLE_COUNTRY_POOL === "true";
const ENABLE_WIKIDATA_IMAGE_POOL = process.env.ROUTE_PREWARM_ENABLE_WIKIDATA_IMAGE_POOL !== "false";
const ENABLE_WIKIPEDIA_SEARCH_POOL = process.env.ROUTE_PREWARM_ENABLE_WIKIPEDIA_SEARCH_POOL !== "false";
const ENABLE_DESTINATION_IMAGE_POOL = process.env.ROUTE_PREWARM_ENABLE_DESTINATION_IMAGE_POOL !== "false";
const ENABLE_REPOSITORY_POOL = process.env.ROUTE_PREWARM_ENABLE_REPOSITORY_POOL !== "false";
const ENABLE_FEED_IMAGE_POOL = process.env.ROUTE_PREWARM_ENABLE_FEED_IMAGE_POOL !== "false";
const ENABLE_LEGACY_ROUTE_COVERS = process.env.ROUTE_PREWARM_ENABLE_LEGACY_ROUTE_COVERS === "true";
const USE_IMAGE_SEARCH_FALLBACK = process.env.ROUTE_PREWARM_USE_IMAGE_SEARCH === "true";
const VALIDATE_IMAGES = process.env.ROUTE_PREWARM_VALIDATE_IMAGES === "true";
const RESET_FEED_READY = process.env.ROUTE_PREWARM_RESET === "true";
const ENABLE_WIKI_ACTION_FALLBACK = process.env.ROUTE_PREWARM_ENABLE_WIKI_ACTION_FALLBACK === "true";
const COUNTRY_POOL_CONCURRENCY = Number.parseInt(process.env.ROUTE_PREWARM_COUNTRY_CONCURRENCY || "8", 10);
const WIKIDATA_IMAGE_LIMIT_PER_COUNTRY = Number.parseInt(process.env.ROUTE_PREWARM_WIKIDATA_IMAGE_LIMIT || "16", 10);
const COUNTRY_POOL_CODE_LIMIT = Number.parseInt(process.env.ROUTE_PREWARM_COUNTRY_LIMIT || "80", 10);
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "travel-collection-local-preview/1.0";

const COUNTRY_PAGE_POOL = {
  AF: ["Band-e Amir National Park", "Minaret of Jam", "Kabul"],
  AR: ["Perito Moreno Glacier", "Buenos Aires", "Iguazu Falls"],
  AT: ["Vienna State Opera", "Schönbrunn Palace", "Hallstatt"],
  AU: ["Great Barrier Reef", "Sydney Opera House", "Uluru"],
  BE: ["Grand-Place", "Bruges", "Antwerp Cathedral"],
  BA: ["Stari Most", "Sarajevo", "Una National Park"],
  BG: ["Rila Monastery", "Sofia", "Plovdiv"],
  BR: ["Rio de Janeiro", "Iguazu Falls", "Salvador, Bahia"],
  CA: ["Banff National Park", "Moraine Lake", "Vancouver"],
  CH: ["Matterhorn", "Chillon Castle", "Lake Geneva"],
  CL: ["Torres del Paine National Park", "Valparaíso", "Atacama Desert"],
  CY: ["Paphos", "Kyrenia", "Troodos Mountains"],
  CZ: ["Charles Bridge", "Prague Castle", "Český Krumlov"],
  DE: ["Brandenburg Gate", "Cologne Cathedral", "Neuschwanstein Castle", "Dresden Frauenkirche"],
  DK: ["Nyhavn", "Kronborg", "Copenhagen"],
  EE: ["Tallinn", "Lahemaa National Park", "Tartu"],
  EG: ["Pyramids of Giza", "Luxor Temple", "Abu Simbel"],
  ES: ["Alhambra", "Sagrada Família", "Plaza de España, Seville"],
  ET: ["Lalibela", "Simien Mountains National Park", "Gondar"],
  FI: ["Helsinki Cathedral", "Suomenlinna", "Lapland (Finland)"],
  FR: ["Eiffel Tower", "Mont Saint-Michel", "Bordeaux", "Palace of Versailles"],
  GB: ["Tower Bridge", "Palace of Westminster", "Edinburgh Castle"],
  GR: ["Acropolis of Athens", "Santorini", "Meteora"],
  HR: ["Dubrovnik", "Plitvice Lakes National Park", "Hvar"],
  HU: ["Hungarian Parliament Building", "Buda Castle", "Lake Balaton"],
  IE: ["Cliffs of Moher", "Dublin", "Giant's Causeway"],
  IN: ["Taj Mahal", "Varanasi", "Valley of Flowers National Park"],
  IS: ["Jökulsárlón", "Thingvellir National Park", "Reykjavík"],
  IT: ["Colosseum", "Venice", "Florence Cathedral", "Cinque Terre"],
  JP: ["Kiyomizu-dera", "Fushimi Inari-taisha", "Mount Fuji", "Tokyo Tower"],
  KH: ["Angkor Wat", "Phnom Penh", "Tonlé Sap"],
  KR: ["Gyeongbokgung", "Busan", "Jeju Island"],
  LA: ["Luang Prabang", "Pha That Luang", "Vang Vieng"],
  LB: ["Baalbek", "Byblos", "Beirut"],
  LS: ["Maloti Mountains", "Maletsunyane Falls", "Thaba Bosiu"],
  LT: ["Vilnius Old Town", "Trakai Island Castle", "Curonian Spit"],
  LU: ["Luxembourg City", "Vianden Castle", "Grund, Luxembourg"],
  MA: ["Aït Benhaddou", "Marrakesh", "Chefchaouen", "Sahara"],
  MK: ["Ohrid", "Skopje", "Mavrovo National Park"],
  MX: ["Chichen Itza", "Mexico City", "Guanajuato City"],
  NL: ["Canals of Amsterdam", "Keukenhof", "Kinderdijk"],
  NO: ["Lofoten", "Geirangerfjord", "Bergen"],
  NP: ["Annapurna", "Kathmandu Durbar Square", "Phewa Lake"],
  PL: ["Wawel Castle", "Kraków Old Town", "Tatra Mountains"],
  PT: ["Belém Tower", "Ponte de Dom Luís I", "Sintra"],
  PY: ["Asunción", "Jesuit Missions of La Santísima Trinidad de Paraná and Jesús de Tavarangue", "Iguazu Falls"],
  RO: ["Bran Castle", "Transfăgărășan", "Sibiu"],
  SD: ["Meroë", "Khartoum", "Jebel Barkal"],
  SE: ["Stockholm", "Gamla stan", "Abisko National Park"],
  SI: ["Lake Bled", "Ljubljana Castle", "Postojna Cave"],
  SK: ["Bratislava Castle", "High Tatras", "Spiš Castle"],
  TH: ["Grand Palace", "Wat Arun", "Ayutthaya Historical Park"],
  TR: ["Cappadocia", "Hagia Sophia", "Pamukkale"],
  UY: ["Colonia del Sacramento", "Montevideo", "Punta del Este"],
  US: ["Golden Gate Bridge", "Grand Canyon National Park", "New York City", "Yosemite National Park"],
  VE: ["Angel Falls", "Canaima National Park", "Mérida, Mérida"],
  VN: ["Hạ Long Bay", "Hội An", "Ho Chi Minh City"],
  ZA: ["Table Mountain", "Kruger National Park", "Cape Town"],
};

const BAD_IMAGE_PATTERNS = /map|locator|flag|logo|icon|diagram|sign|marker|svg|\.png(?:[?#]|$)|\.tiff?|tif(?:[/?#]|$)|collage|pays|interior|room|shop|stall|vendor|worker|people|person|crowd|selfie|passport|luggage|brochure|poster|airport|station|platform|parking|garage|workshop|national[_ -]?road|rail[_ -]?trail|car[_ -]?wash|memorial|arkadenhof|front\.jpe?g|museum|camping|thumbnail_unscaled.*\.png|red[_ -]?background|blank/i;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
}

function backupFile(filePath) {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").slice(0, 15);
  const backupPath = `${filePath}.${stamp}.before-feed-image-prewarm`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function imageIdentity(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return `${url.hostname}${url.pathname.replace(/\/\d+px-/i, "/").toLowerCase()}`;
  } catch {
    return text.toLowerCase();
  }
}

function countryCodes(record = {}) {
  return [...new Set([
    ...(record.countryEntities || []).map((item) => item.countryCode),
    ...(record.countries || []),
  ].map((code) => String(code || "").trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
}

function routeKind(record = {}) {
  if (record.classification === "cross" || record.classification === "single") return record.classification;
  return countryCodes(record).length > 1 ? "cross" : "single";
}

function routeHasChina(record = {}) {
  return countryCodes(record).includes("CN")
    || [...(record.countries || []), ...(record.countryEntities || []).map((item) => item.name)]
      .some((item) => /中国|china/i.test(String(item || "")));
}

function isMaterializedRoute(record = {}) {
  return String(record.id || "").startsWith("materialized-")
    || record.contentEvidence?.plannerRuleVersion
    || record.contentEvidence?.materialized
    || record.coverAsset?.discoveredVia === "planner-rule-materialized"
    || record.coverAsset?.discoveredVia === "materialized-route-pool";
}

function imageCountryCodes(asset = {}) {
  return Array.isArray(asset.imageCountryCodes)
    ? asset.imageCountryCodes.map((code) => String(code || "").toUpperCase()).filter(Boolean)
    : [];
}

function countryName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function prioritizedCountryCodes(records = []) {
  const scores = new Map();
  for (const record of records) {
    if (routeHasChina(record)) continue;
    const weight = routeKind(record) === "cross" ? 2 : 1;
    for (const code of countryCodes(record)) {
      if (code === "CN") continue;
      scores.set(code, (scores.get(code) || 0) + weight);
    }
  }
  const limit = Number.isFinite(COUNTRY_POOL_CODE_LIMIT) && COUNTRY_POOL_CODE_LIMIT > 0
    ? COUNTRY_POOL_CODE_LIMIT
    : scores.size;
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([code]) => code);
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rotate(items = [], seed = 0) {
  const unique = items.filter((item, index, all) => item && all.indexOf(item) === index);
  if (unique.length < 2) return unique;
  const offset = seed % unique.length;
  return unique.slice(offset).concat(unique.slice(0, offset));
}

function isVerifiedCover(record = {}, asset = {}) {
  if (!asset?.imageUrl) return false;
  const routeCodes = countryCodes(record);
  const imgCodes = imageCountryCodes(asset);
  return (asset.status === "verified" || asset.semanticStatus === "verified" || asset.coverStatus === "verified")
    && routeCodes.length > 0
    && imgCodes.some((code) => routeCodes.includes(code));
}

function currentVerifiedAsset(record = {}) {
  if (isMaterializedRoute(record)) return null;
  const onlineText = [
    record.onlineCoverAsset?.imageUrl,
    record.onlineCoverAsset?.sourceUrl,
    record.onlineCoverAsset?.title,
    record.onlineCoverAsset?.assetId,
    record.onlineCoverAsset?.provider,
  ].filter(Boolean).join(" ");
  if (isVerifiedCover(record, record.onlineCoverAsset) && !BAD_IMAGE_PATTERNS.test(onlineText)) return record.onlineCoverAsset;
  const coverText = [
    record.coverAsset?.imageUrl,
    record.coverAsset?.sourceUrl,
    record.coverAsset?.title,
    record.coverAsset?.assetId,
    record.coverAsset?.provider,
  ].filter(Boolean).join(" ");
  if (!isMaterializedRoute(record) && isVerifiedCover(record, record.coverAsset) && !BAD_IMAGE_PATTERNS.test(coverText)) return record.coverAsset;
  return null;
}

function legacyRouteCoverAsset(record = {}) {
  if (isMaterializedRoute(record)) return null;
  const asset = record.coverAsset;
  const imageUrl = asset?.imageUrl || record.coverImage || "";
  const text = [imageUrl, asset?.sourceUrl, asset?.title, asset?.assetId, asset?.provider].filter(Boolean).join(" ");
  const codes = countryCodes(record);
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl) || !codes.length) return null;
  if (BAD_IMAGE_PATTERNS.test(text)) return null;
  return {
    ...asset,
    provider: "prewarm-existing-route-cover",
    imageUrl,
    sourceUrl: asset?.sourceUrl || imageUrl,
    title: asset?.title || asset?.assetId || record.name || "",
    query: record.name || record.canonicalTitle || "",
    qualityScore: Number(asset?.semanticScore || 0) * 20 + 60,
    imageCountryCodes: codes,
    status: "verified",
    semanticStatus: "verified",
    coverStatus: "verified",
    matchEvidence: `route-pageimage; country:${codes.join("|")}`,
    imageDedupeKey: imageIdentity(imageUrl),
    dedupeKey: imageIdentity(imageUrl),
    verifiedAt: new Date().toISOString(),
  };
}

function cleanInvalidFeedCovers(records = []) {
  let cleaned = 0;
  for (const record of records) {
    const asset = record.onlineCoverAsset;
    const text = [asset?.imageUrl, asset?.sourceUrl, asset?.title, asset?.assetId, asset?.provider].filter(Boolean).join(" ");
    if (!asset && !record.feedReady) continue;
    if (isMaterializedRoute(record) || !isVerifiedCover(record, asset) || BAD_IMAGE_PATTERNS.test(text)) {
      delete record.onlineCoverAsset;
      delete record.feedReady;
      delete record.feedReadyAt;
      if (record.coverStatus === "verified") delete record.coverStatus;
      cleaned += 1;
    }
  }
  return cleaned;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSparql(query, timeoutMs = REQUEST_TIMEOUT_MS) {
  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set("query", query);
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": USER_AGENT,
    },
  }, timeoutMs);
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return payload?.results?.bindings || [];
}

async function fetchCountryQids(codes = []) {
  const values = [...new Set(codes)]
    .filter((code) => /^[A-Z]{2}$/.test(code))
    .map((code) => `"${code}"`)
    .join(" ");
  if (!values) return new Map();
  const query = [
    "SELECT ?country ?code WHERE {",
    ` VALUES ?code { ${values} }`,
    " ?country wdt:P297 ?code.",
    "}",
  ].join("\n");
  const bindings = await fetchSparql(query, Math.max(REQUEST_TIMEOUT_MS, 12_000)).catch(() => []);
  const qids = new Map();
  for (const binding of bindings) {
    const code = String(binding?.code?.value || "").toUpperCase();
    const qid = String(binding?.country?.value || "").split("/").pop();
    if (/^[A-Z]{2}$/.test(code) && /^Q\d+$/.test(qid)) qids.set(code, qid);
  }
  return qids;
}

function wikidataImageUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!/commons\.wikimedia\.org$/i.test(url.hostname)) return raw.replace(/^http:/i, "https:");
    url.protocol = "https:";
    if (/Special:FilePath/i.test(url.pathname) && !url.searchParams.has("width")) {
      url.searchParams.set("width", "960");
    }
    return url.href;
  } catch {
    return "";
  }
}

function imageTitleFromUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    const parts = url.pathname.split("/");
    return decodeURIComponent(parts.at(-1) || "").replace(/_/g, " ");
  } catch {
    return String(value || "");
  }
}

function wikidataImageAsset({ code, imageUrl, placeLabel = "", typeLabel = "" } = {}) {
  const url = wikidataImageUrl(imageUrl);
  const title = imageTitleFromUrl(url);
  const text = [url, title, placeLabel, typeLabel].filter(Boolean).join(" ");
  if (!url || BAD_IMAGE_PATTERNS.test(text)) return null;
  if (/\.(?:svg|gif|pdf|webm|ogv|tiff?|xcf)(?:[?#]|$)/i.test(url)) return null;
  const key = imageIdentity(url);
  return {
    provider: "wikidata-country-entity-image",
    imageUrl: url,
    sourceUrl: url,
    title: placeLabel || title,
    query: `${placeLabel || title} ${countryName(code)}`,
    qualityScore: 86,
    imageCountryCodes: [code],
    status: "verified",
    semanticStatus: "verified",
    coverStatus: "verified",
    matchEvidence: `country:${code}; wikidata:P17+P18; type:${typeLabel || "place"}`,
    imageDedupeKey: key,
    dedupeKey: key,
    verifiedAt: new Date().toISOString(),
  };
}

async function fetchWikidataCountryImages(code, qid) {
  if (!/^[A-Z]{2}$/.test(code) || !/^Q\d+$/.test(qid)) return [];
  const limit = Math.max(4, Math.min(40, WIKIDATA_IMAGE_LIMIT_PER_COUNTRY));
  const query = [
    "SELECT DISTINCT ?place ?placeLabel ?typeLabel ?image WHERE {",
    ` ?place wdt:P17 wd:${qid}; wdt:P18 ?image; wdt:P31 ?type.`,
    " VALUES ?root { wd:Q570116 wd:Q839954 wd:Q515 wd:Q532 wd:Q8502 wd:Q23442 wd:Q23397 wd:Q46169 wd:Q12280 wd:Q23413 wd:Q2977 wd:Q16970 wd:Q32815 wd:Q44613 }",
    " ?type wdt:P279* ?root.",
    " FILTER NOT EXISTS { ?place wdt:P31/wdt:P279* wd:Q5. }",
    ' SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    `} LIMIT ${limit * 3}`,
  ].join("\n");
  const bindings = await fetchSparql(query, Math.max(REQUEST_TIMEOUT_MS, 14_000)).catch(() => []);
  const seen = new Set();
  const images = [];
  for (const binding of bindings) {
    const image = wikidataImageAsset({
      code,
      imageUrl: binding?.image?.value,
      placeLabel: binding?.placeLabel?.value,
      typeLabel: binding?.typeLabel?.value,
    });
    const key = image?.imageDedupeKey;
    if (!image?.imageUrl || !key || seen.has(key)) continue;
    seen.add(key);
    images.push(image);
    if (images.length >= limit) break;
  }
  return images;
}

async function imageLoads(imageUrl) {
  if (!/^https?:\/\//i.test(String(imageUrl || ""))) return false;
  const response = await fetchWithTimeout(imageUrl, { method: "HEAD" }, REQUEST_TIMEOUT_MS).catch(() => null);
  const contentType = response?.headers?.get("content-type") || "";
  return Boolean(response?.ok && /^image\//i.test(contentType));
}

async function wikipediaPageImage(pageTitle, code) {
  const summaryUrl = new URL(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`);
  const summaryResponse = await fetchWithTimeout(summaryUrl, {
    headers: { "user-agent": "travel-collection-local-preview/1.0" },
  }, REQUEST_TIMEOUT_MS).catch(() => null);
  const summary = await summaryResponse?.json?.().catch(() => ({}));
  const summarySource = summary?.originalimage?.source || summary?.thumbnail?.source || "";
  const summaryTitle = summary?.title || pageTitle;
  if (summarySource && !BAD_IMAGE_PATTERNS.test(summarySource) && !BAD_IMAGE_PATTERNS.test(summaryTitle)) {
    return {
      provider: "wikipedia-country-landmark-summary",
      imageUrl: summarySource,
      sourceUrl: summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`,
      title: summaryTitle,
      query: `${pageTitle} ${countryName(code)}`,
      qualityScore: 76,
      imageCountryCodes: [code],
      status: "verified",
      semanticStatus: "verified",
      coverStatus: "verified",
      matchEvidence: `country:${code}; wikipedia-summary:${pageTitle}`,
      imageDedupeKey: imageIdentity(summarySource),
      dedupeKey: imageIdentity(summarySource),
      verifiedAt: new Date().toISOString(),
    };
  }
  if (!ENABLE_WIKI_ACTION_FALLBACK) return null;
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "pageimages|info");
  url.searchParams.set("piprop", "thumbnail|original|name");
  url.searchParams.set("pithumbsize", "960");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("titles", pageTitle);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const response = await fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS).catch(() => null);
  const payload = await response?.json?.().catch(() => ({}));
  const page = Object.values(payload.query?.pages || {}).find((item) => item?.thumbnail?.source || item?.original?.source);
  const source = page?.thumbnail?.source || page?.original?.source || "";
  const title = page?.pageimage || page?.title || pageTitle;
  if (!source || BAD_IMAGE_PATTERNS.test(source) || BAD_IMAGE_PATTERNS.test(title)) return null;
  const asset = {
    provider: "prewarm-wikipedia-country-page",
    imageUrl: source,
    sourceUrl: page?.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`,
    title,
    query: `${pageTitle} ${countryName(code)}`,
    qualityScore: 78,
    imageCountryCodes: [code],
    status: "verified",
    semanticStatus: "verified",
    coverStatus: "verified",
    matchEvidence: `country:${code}; prewarm-page:${pageTitle}`,
    imageDedupeKey: imageIdentity(source),
    dedupeKey: imageIdentity(source),
    verifiedAt: new Date().toISOString(),
  };
  if (!await imageLoads(source)) return null;
  return asset;
}

const destinationImageCache = new Map();

function routeDestinations(record = {}) {
  return (record.destinationEntities || [])
    .map((item) => ({
      code: String(item?.countryCode || "").toUpperCase(),
      title: String(item?.sourceTitle || item?.name || "").trim(),
      name: String(item?.name || item?.sourceTitle || "").trim(),
    }))
    .filter((item) => /^[A-Z]{2}$/.test(item.code) && item.title);
}

async function destinationPageImage(destination) {
  const key = `${destination.code}:${destination.title}`.toLowerCase();
  if (destinationImageCache.has(key)) return destinationImageCache.get(key);
  let image = await wikipediaPageImage(destination.title, destination.code).catch(() => null);
  if (!image && destination.name && destination.name !== destination.title) {
    image = await wikipediaPageImage(destination.name, destination.code).catch(() => null);
  }
  if (image) {
    image.provider = "wikipedia-destination-pageimage";
    image.matchEvidence = `country:${destination.code}; destination:${destination.title}`;
    image.query = destination.title;
  }
  destinationImageCache.set(key, image || null);
  return image || null;
}

async function chooseDestinationImage(record, recentSet) {
  if (!ENABLE_DESTINATION_IMAGE_POOL) return null;
  const destinations = rotate(routeDestinations(record), stableHash(`${record.id || record.name || ""}:destinations`)).slice(0, 8);
  for (const destination of destinations) {
    const image = await destinationPageImage(destination);
    const key = image?.imageDedupeKey || imageIdentity(image?.imageUrl);
    if (image && key && !recentSet.has(key) && isVerifiedCover(record, image)) return image;
  }
  return null;
}

async function wikipediaSearchPages(query, limit = 8) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(limit));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const response = await fetchWithTimeout(url, {
    headers: { "user-agent": USER_AGENT },
  }, REQUEST_TIMEOUT_MS).catch(() => null);
  const payload = await response?.json?.().catch(() => ({}));
  return (payload.query?.search || [])
    .map((item) => String(item?.title || "").trim())
    .filter((title) => title && !BAD_IMAGE_PATTERNS.test(title));
}

async function countrySearchPageCandidates(code) {
  if (!ENABLE_WIKIPEDIA_SEARCH_POOL) return [];
  const country = countryName(code);
  const queries = [
    `${country} landmark`,
    `${country} tourist attraction`,
    `${country} national park`,
    `${country} World Heritage Site`,
    `${country} capital city skyline`,
  ];
  const pages = [];
  for (const query of queries) {
    const found = await wikipediaSearchPages(query, 5).catch(() => []);
    for (const title of found) {
      if (!pages.includes(title)) pages.push(title);
      if (pages.length >= 18) return pages;
    }
  }
  return pages;
}

async function runPool(items, worker, concurrency = COUNTRY_POOL_CONCURRENCY) {
  const results = [];
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, next));
  return results;
}

async function buildCountryPools(records) {
  const neededCodes = prioritizedCountryCodes(records);
  const entries = await runPool(neededCodes, async (code) => {
    const searchPages = await countrySearchPageCandidates(code);
    const pages = [...new Set([...(COUNTRY_PAGE_POOL[code] || []), ...searchPages, countryName(code)])];
    const images = [];
    for (const page of pages) {
      const image = await wikipediaPageImage(page, code);
      if (image && !images.some((item) => item.imageDedupeKey === image.imageDedupeKey)) images.push(image);
      if (images.length >= Math.max(4, Math.min(12, WIKIDATA_IMAGE_LIMIT_PER_COUNTRY))) break;
    }
    return [code, images];
  });
  return new Map(entries);
}

async function buildWikidataImagePools(records) {
  const neededCodes = prioritizedCountryCodes(records);
  const qids = await fetchCountryQids(neededCodes);
  const entries = await runPool(neededCodes, async (code) => {
    const images = qids.has(code) ? await fetchWikidataCountryImages(code, qids.get(code)) : [];
    return [code, images];
  }, Math.max(1, Math.min(3, COUNTRY_POOL_CONCURRENCY)));
  return new Map(entries);
}

function choosePoolImage(record, countryPools, recentSet) {
  const codes = rotate(countryCodes(record), stableHash(record.id || record.name || ""));
  for (const code of codes) {
    const images = rotate(countryPools.get(code) || [], stableHash(`${record.id || record.name || ""}:${code}`));
    for (const image of images) {
      const key = image.imageDedupeKey || imageIdentity(image.imageUrl);
      if (key && !recentSet.has(key) && isVerifiedCover(record, image)) return image;
    }
  }
  return null;
}

function addPoolImage(pool, code, image) {
  const normalized = String(code || "").toUpperCase();
  const key = image?.imageDedupeKey || image?.dedupeKey || imageIdentity(image?.imageUrl);
  if (!/^[A-Z]{2}$/.test(normalized) || !image?.imageUrl || !key) return;
  const list = pool.get(normalized) || [];
  if (!list.some((item) => (item.imageDedupeKey || item.dedupeKey || imageIdentity(item.imageUrl)) === key)) {
    list.push({
      ...image,
      provider: "repository-country-image-pool",
      imageCountryCodes: [normalized],
      matchEvidence: `country:${normalized}; repository-country-image-pool`,
      status: "verified",
      semanticStatus: "verified",
      coverStatus: "verified",
      imageDedupeKey: key,
      dedupeKey: key,
    });
    pool.set(normalized, list);
  }
}

function buildRepositoryCountryPools(records = []) {
  const pool = new Map();
  for (const record of records) {
    const routeCodes = countryCodes(record);
    if (isMaterializedRoute(record)) continue;
    const image = currentVerifiedAsset(record) || (ENABLE_LEGACY_ROUTE_COVERS ? legacyRouteCoverAsset(record) : null);
    if (!image?.imageUrl) continue;
    const text = [image.imageUrl, image.sourceUrl, image.title, image.assetId, image.provider].filter(Boolean).join(" ");
    if (BAD_IMAGE_PATTERNS.test(text)) continue;
    const codes = imageCountryCodes(image).length ? imageCountryCodes(image) : routeCodes;
    for (const code of codes.filter((item) => routeCodes.includes(item))) addPoolImage(pool, code, image);
  }
  return pool;
}

function buildFeedImageCountryPools() {
  const pool = new Map();
  if (!ENABLE_FEED_IMAGE_POOL || !fs.existsSync(FEED_IMAGE_POOL_PATH)) return pool;
  const payload = readJson(FEED_IMAGE_POOL_PATH);
  const entries = payload?.entries && typeof payload.entries === "object" ? payload.entries : {};
  for (const [code, images] of Object.entries(entries)) {
    for (const image of Array.isArray(images) ? images : []) {
      const text = [image.imageUrl, image.sourceUrl, image.title, image.provider].filter(Boolean).join(" ");
      if (!image?.imageUrl || BAD_IMAGE_PATTERNS.test(text)) continue;
      addPoolImage(pool, code, {
        ...image,
        provider: image.provider || "feed-image-pool",
        matchEvidence: image.matchEvidence || `country:${code}; feed-image-pool`,
      });
    }
  }
  return pool;
}

function mergeCountryPools(primary, secondary) {
  const merged = new Map();
  for (const source of [primary, secondary]) {
    for (const [code, images] of source.entries()) {
      for (const image of images) addPoolImage(merged, code, image);
    }
  }
  return merged;
}

async function requestVerifiedImage(record, recentImageKeys) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/routes/image-search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...record,
      excludeImageUrls: [...recentImageKeys],
      excludeImageTitles: [],
    }),
  }).catch(() => null);
  const payload = await response?.json?.().catch(() => ({}));
  if (!response?.ok || !payload?.ok || payload.status !== "verified") return null;
  const image = payload.image;
  return isVerifiedCover(record, image) ? image : null;
}

function applyCover(record, image) {
  const now = new Date().toISOString();
  const normalized = {
    ...image,
    status: "verified",
    semanticStatus: "verified",
    coverStatus: "verified",
    verifiedAt: image.verifiedAt || now,
    imageDedupeKey: image.imageDedupeKey || image.dedupeKey || imageIdentity(image.imageUrl),
    dedupeKey: image.dedupeKey || image.imageDedupeKey || imageIdentity(image.imageUrl),
  };
  record.onlineCoverAsset = normalized;
  record.coverStatus = "verified";
  record.feedReady = true;
  record.feedReadyAt = now;
  return normalized;
}

async function prewarmType(records, type, target, countryPools) {
  const candidates = records
    .filter((record) => routeKind(record) === type && !routeHasChina(record))
    .sort((left, right) => {
      const leftCodes = countryCodes(left).join(".");
      const rightCodes = countryCodes(right).join(".");
      const leftRank = stableHash(`${type}:${leftCodes}:${left.id || left.name || ""}`);
      const rightRank = stableHash(`${type}:${rightCodes}:${right.id || right.name || ""}`);
      return leftRank - rightRank;
    });
  const recent = [];
  const stats = {
    type,
    target,
    scanned: 0,
    ready: 0,
    reused: 0,
    updated: 0,
    failed: 0,
    duplicateAvoided: 0,
    failures: [],
  };

  for (const record of candidates) {
    if (stats.ready >= target) break;
    stats.scanned += 1;
    const recentSet = new Set(recent.slice(-WINDOW_SIZE));
    let asset = currentVerifiedAsset(record);
    let key = asset ? (asset.imageDedupeKey || asset.dedupeKey || imageIdentity(asset.imageUrl)) : "";
    if (asset && key && recentSet.has(key)) {
      stats.duplicateAvoided += 1;
      asset = null;
    }
    if (asset && key && (!VALIDATE_IMAGES || await imageLoads(asset.imageUrl))) {
      applyCover(record, asset);
      stats.reused += 1;
      stats.ready += 1;
      recent.push(key);
      continue;
    }

    const legacyImage = ENABLE_LEGACY_ROUTE_COVERS ? legacyRouteCoverAsset(record) : null;
    const legacyKey = legacyImage ? (legacyImage.imageDedupeKey || legacyImage.dedupeKey || imageIdentity(legacyImage.imageUrl)) : "";
    if (legacyImage && legacyKey && !recentSet.has(legacyKey) && (!VALIDATE_IMAGES || await imageLoads(legacyImage.imageUrl))) {
      const applied = applyCover(record, legacyImage);
      stats.updated += 1;
      stats.ready += 1;
      recent.push(applied.imageDedupeKey || legacyKey);
      continue;
    }

    const destinationImage = await chooseDestinationImage(record, recentSet);
    const pooledImage = destinationImage || choosePoolImage(record, countryPools, recentSet);
    const image = pooledImage || (USE_IMAGE_SEARCH_FALLBACK ? await requestVerifiedImage(record, recentSet) : null);
    const imageKey = image ? (image.imageDedupeKey || image.dedupeKey || imageIdentity(image.imageUrl)) : "";
    if (image && imageKey && !recentSet.has(imageKey) && (!VALIDATE_IMAGES || await imageLoads(image.imageUrl))) {
      const applied = applyCover(record, image);
      stats.updated += 1;
      stats.ready += 1;
      recent.push(applied.imageDedupeKey || imageKey);
      continue;
    }

    stats.failed += 1;
    if (stats.failures.length < 30) {
      stats.failures.push({
        id: record.id,
        name: record.name,
        countries: countryCodes(record),
        reason: imageKey && recentSet.has(imageKey) ? "duplicate-in-window" : "no-verified-loadable-image",
      });
    }
  }
  return stats;
}

const payload = readJson(ACCEPTED_PATH);
const records = Array.isArray(payload.records) ? payload.records : [];
if (!records.length) throw new Error(`No accepted records found at ${ACCEPTED_PATH}`);
if (RESET_FEED_READY) {
  for (const record of records) {
    delete record.onlineCoverAsset;
    delete record.feedReady;
    delete record.feedReadyAt;
    if (record.coverStatus === "verified") delete record.coverStatus;
  }
}
const cleaned = cleanInvalidFeedCovers(records);

const startedAt = new Date().toISOString();
console.log(`Prewarming route feed images: cross=${TARGET_CROSS}, single=${TARGET_SINGLE}, dryRun=${DRY_RUN}`);
const repositoryPools = ENABLE_REPOSITORY_POOL ? buildRepositoryCountryPools(records) : new Map();
const feedImagePools = ENABLE_FEED_IMAGE_POOL ? buildFeedImageCountryPools() : new Map();
const networkCountryPools = ENABLE_COUNTRY_POOL ? await buildCountryPools(records) : new Map();
const wikidataCountryPools = ENABLE_WIKIDATA_IMAGE_POOL ? await buildWikidataImagePools(records) : new Map();
const countryPools = mergeCountryPools(mergeCountryPools(mergeCountryPools(repositoryPools, feedImagePools), networkCountryPools), wikidataCountryPools);
console.log(JSON.stringify({
  countryPools: countryPools.size,
  readyImages: [...countryPools.values()].reduce((sum, images) => sum + images.length, 0),
  repositoryPoolEnabled: ENABLE_REPOSITORY_POOL,
  repositoryPoolCountries: repositoryPools.size,
  repositoryPoolImages: [...repositoryPools.values()].reduce((sum, images) => sum + images.length, 0),
  feedImagePoolEnabled: ENABLE_FEED_IMAGE_POOL,
  feedImagePoolCountries: feedImagePools.size,
  feedImagePoolImages: [...feedImagePools.values()].reduce((sum, images) => sum + images.length, 0),
  legacyRouteCoversEnabled: ENABLE_LEGACY_ROUTE_COVERS,
  countryPoolEnabled: ENABLE_COUNTRY_POOL,
  countryPoolCodeLimit: COUNTRY_POOL_CODE_LIMIT,
  wikidataImagePoolEnabled: ENABLE_WIKIDATA_IMAGE_POOL,
  destinationImagePoolEnabled: ENABLE_DESTINATION_IMAGE_POOL,
  wikidataPoolCountries: wikidataCountryPools.size,
  wikidataPoolImages: [...wikidataCountryPools.values()].reduce((sum, images) => sum + images.length, 0),
}, null, 2));
const cross = await prewarmType(records, "cross", TARGET_CROSS, countryPools);
console.log(JSON.stringify(cross, null, 2));
const single = await prewarmType(records, "single", TARGET_SINGLE, countryPools);
console.log(JSON.stringify(single, null, 2));

const report = {
  ok: cross.ready >= TARGET_CROSS && single.ready >= TARGET_SINGLE,
  startedAt,
  finishedAt: new Date().toISOString(),
  apiBaseUrl: API_BASE_URL,
  windowSize: WINDOW_SIZE,
  dryRun: DRY_RUN,
  resetFeedReady: RESET_FEED_READY,
  repositoryPoolEnabled: ENABLE_REPOSITORY_POOL,
  feedImagePoolEnabled: ENABLE_FEED_IMAGE_POOL,
  legacyRouteCoversEnabled: ENABLE_LEGACY_ROUTE_COVERS,
  countryPoolEnabled: ENABLE_COUNTRY_POOL,
  countryPoolCodeLimit: COUNTRY_POOL_CODE_LIMIT,
  wikidataImagePoolEnabled: ENABLE_WIKIDATA_IMAGE_POOL,
  destinationImagePoolEnabled: ENABLE_DESTINATION_IMAGE_POOL,
  imageSearchFallbackEnabled: USE_IMAGE_SEARCH_FALLBACK,
  imageValidationEnabled: VALIDATE_IMAGES,
  cleanedInvalidFeedCovers: cleaned,
  results: [cross, single],
};

if (!DRY_RUN) {
  const backupPath = backupFile(ACCEPTED_PATH);
  payload.repositoryVersion = `feed-image-prewarm-${Date.now()}`;
  writeJsonAtomic(ACCEPTED_PATH, payload);
  report.backupPath = backupPath;
}
writeJsonAtomic(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
