const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const routeImageCachePath = process.env.ROUTE_IMAGE_CACHE_PATH || path.join(root, ".route-v2-cache", "route-image-cache.json");
const routeImageCacheVersion = "verified-country-v9";
const acceptedRoutesPath = process.env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "accepted-routes.json");
const proxiedImageDiskCacheDir = process.env.ROUTE_IMAGE_PROXY_CACHE_DIR || path.join(root, ".route-v2-cache", "proxied-images");
const proxiedImageCache = new Map();
const proxiedImageMaxBytes = 16 * 1024 * 1024;
const proxiedImageTimeoutMs = Number(process.env.ROUTE_IMAGE_PROXY_TIMEOUT_MS || 12000);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

function safeStaticPath(urlPath) {
  let pathname = decodeURIComponent(urlPath.split("?")[0] || "/");
  if (pathname === "/" || pathname === "/travel-collection") pathname = "/travel-collection/";
  if (pathname === "/travel-collection/") pathname = "/travel-collection/index.html";
  if (pathname.startsWith("/travel-collection/")) pathname = pathname.slice("/travel-collection".length);
  const resolved = path.resolve(root, `.${pathname}`);
  return resolved.startsWith(root) ? resolved : "";
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sendJson(response, status, payload) {
  send(response, status, JSON.stringify(payload), { "content-type": "application/json; charset=utf-8" });
}

function publicKnowledgeEntity(entity) {
  const value = {
    entityId: entity.entityId,
    entityType: entity.entityType,
    wikidataId: entity.wikidataId,
    canonicalNameZh: entity.canonicalNameZh,
    canonicalNameEn: entity.canonicalNameEn,
    aliases: [...entity.aliases],
    coordinates: entity.coordinates ? { ...entity.coordinates } : null,
  };

  if (entity.entityType === "country") {
    return {
      ...value,
      isoAlpha2: entity.isoAlpha2,
      isoAlpha3: entity.isoAlpha3,
      isoNumeric: entity.isoNumeric,
      continent: entity.continent ? { ...entity.continent } : null,
      region: entity.region,
      subregion: entity.subregion,
      capital: entity.capital ? {
        ...entity.capital,
        aliases: [...entity.capital.aliases],
      } : null,
    };
  }

  if (entity.entityType === "city") {
    return { ...value, parentCountryEntityId: entity.parentCountryEntityId };
  }

  return { ...value, parentCityEntityId: entity.parentCityEntityId };
}

function knowledgeEntityLayerSummary(repository) {
  const countries = repository.listCountries().length;
  const cities = repository.listCities().length;
  const pois = repository.listPois().length;
  return { countries, cities, pois, total: countries + cities + pois };
}

function knowledgeEntityError(response, status, code, message) {
  sendJson(response, status, { error: { code, message } });
}

function handleKnowledgeEntityLayerRequest(request, response, url, repository) {
  const prefix = "/api/knowledge-entities";
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return false;

  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    knowledgeEntityError(response, 405, "method_not_allowed", "Knowledge Entity Layer endpoints are read-only.");
    return true;
  }

  if (url.pathname === `${prefix}/summary`) {
    sendJson(response, 200, knowledgeEntityLayerSummary(repository));
    return true;
  }

  if (url.pathname === `${prefix}/countries`) {
    sendJson(response, 200, { countries: repository.listCountries().map(publicKnowledgeEntity) });
    return true;
  }

  const countryCitiesMatch = url.pathname.match(/^\/api\/knowledge-entities\/countries\/([^/]+)\/cities$/);
  if (countryCitiesMatch) {
    const country = repository.getEntity(decodeURIComponent(countryCitiesMatch[1]));
    if (!country) {
      knowledgeEntityError(response, 404, "entity_not_found", "Country entity was not found.");
      return true;
    }
    if (country.entityType !== "country") {
      knowledgeEntityError(response, 400, "invalid_parent_type", "The requested parent entity is not a country.");
      return true;
    }
    sendJson(response, 200, {
      country: publicKnowledgeEntity(country),
      cities: repository.listCitiesByCountry(country.entityId).map(publicKnowledgeEntity),
    });
    return true;
  }

  const cityPoisMatch = url.pathname.match(/^\/api\/knowledge-entities\/cities\/([^/]+)\/pois$/);
  if (cityPoisMatch) {
    const city = repository.getEntity(decodeURIComponent(cityPoisMatch[1]));
    if (!city) {
      knowledgeEntityError(response, 404, "entity_not_found", "City entity was not found.");
      return true;
    }
    if (city.entityType !== "city") {
      knowledgeEntityError(response, 400, "invalid_parent_type", "The requested parent entity is not a city.");
      return true;
    }
    sendJson(response, 200, {
      city: publicKnowledgeEntity(city),
      pois: repository.listPoisByCity(city.entityId).map(publicKnowledgeEntity),
    });
    return true;
  }

  const entityMatch = url.pathname.match(/^\/api\/knowledge-entities\/entities\/([^/]+)$/);
  if (entityMatch) {
    const entity = repository.getEntity(decodeURIComponent(entityMatch[1]));
    if (!entity) {
      knowledgeEntityError(response, 404, "entity_not_found", "Knowledge entity was not found.");
      return true;
    }
    sendJson(response, 200, { entity: publicKnowledgeEntity(entity) });
    return true;
  }

  knowledgeEntityError(response, 404, "endpoint_not_found", "Knowledge Entity Layer endpoint was not found.");
  return true;
}

function proxiedImageDiskPaths(cacheKey) {
  const hash = crypto.createHash("sha256").update(cacheKey).digest("hex");
  return {
    bodyPath: path.join(proxiedImageDiskCacheDir, `${hash}.bin`),
    metaPath: path.join(proxiedImageDiskCacheDir, `${hash}.json`),
  };
}

function readProxiedImageDiskCache(cacheKey) {
  const { bodyPath, metaPath } = proxiedImageDiskPaths(cacheKey);
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (meta?.cacheKey !== cacheKey || !String(meta.contentType || "").startsWith("image/")) return null;
    const body = fs.readFileSync(bodyPath);
    if (!body.length || body.length > proxiedImageMaxBytes) return null;
    return { body, contentType: meta.contentType };
  } catch {
    return null;
  }
}

function writeProxiedImageDiskCache(cacheKey, body, contentType) {
  try {
    fs.mkdirSync(proxiedImageDiskCacheDir, { recursive: true });
    const { bodyPath, metaPath } = proxiedImageDiskPaths(cacheKey);
    fs.writeFileSync(bodyPath, body);
    fs.writeFileSync(metaPath, JSON.stringify({
      cacheKey,
      contentType,
      bytes: body.length,
      cachedAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Disk cache is an optimization; memory cache and direct proxying still work.
  }
}

async function proxyRemoteImage(url, response, signal) {
  const imageUrl = String(url || "").trim();
  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    send(response, 400, "Invalid image URL", { "content-type": "text/plain; charset=utf-8" });
    return;
  }
  if (parsed.protocol !== "https:") {
    send(response, 400, "Only https images are allowed", { "content-type": "text/plain; charset=utf-8" });
    return;
  }
  const cacheKey = parsed.href;
  const cached = proxiedImageCache.get(cacheKey);
  if (cached) {
    send(response, 200, cached.body, {
      "content-type": cached.contentType,
      "cache-control": "public, max-age=86400",
    });
    return;
  }
  const diskCached = readProxiedImageDiskCache(cacheKey);
  if (diskCached) {
    proxiedImageCache.set(cacheKey, diskCached);
    send(response, 200, diskCached.body, {
      "content-type": diskCached.contentType,
      "cache-control": "public, max-age=86400",
    });
    return;
  }
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), proxiedImageTimeoutMs);
  const proxySignal = AbortSignal.any ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
  let upstream;
  try {
    upstream = await fetch(parsed.href, {
      headers: {
        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) TravelCollectionRouteImageProxy/1.0 Safari/537.36",
        "referer": "https://commons.wikimedia.org/",
      },
      signal: proxySignal,
    });
  } catch {
    send(response, 502, "Remote image unavailable", { "content-type": "text/plain; charset=utf-8" });
    return;
  } finally {
    clearTimeout(timeout);
  }
  const contentType = upstream.headers.get("content-type") || "";
  const contentLength = Number(upstream.headers.get("content-length") || 0);
  if (!upstream.ok || !contentType.startsWith("image/") || contentLength > proxiedImageMaxBytes) {
    send(response, 502, "Remote image unavailable", { "content-type": "text/plain; charset=utf-8" });
    return;
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length > proxiedImageMaxBytes) {
    send(response, 502, "Remote image too large", { "content-type": "text/plain; charset=utf-8" });
    return;
  }
  proxiedImageCache.set(cacheKey, { body, contentType });
  writeProxiedImageDiskCache(cacheKey, body, contentType);
  if (proxiedImageCache.size > 200) {
    const oldestKey = proxiedImageCache.keys().next().value;
    proxiedImageCache.delete(oldestKey);
  }
  send(response, 200, body, {
    "content-type": contentType,
    "cache-control": "public, max-age=86400",
  });
}

function imageIdentity(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return `${url.hostname}${url.pathname.replace(/\/\d+px-/i, "/").toLowerCase()}`;
  } catch {
    return text.toLowerCase();
  }
}

function excludedImageIdentities(route = {}) {
  const urls = Array.isArray(route.excludeImageUrls) ? route.excludeImageUrls : [];
  const titles = Array.isArray(route.excludeImageTitles) ? route.excludeImageTitles : [];
  return new Set([
    ...urls.map(imageIdentity),
    ...titles.map((title) => String(title || "").trim().toLowerCase()),
  ].filter(Boolean));
}

function isExcludedImage(image, excluded) {
  if (!image || !excluded?.size) return false;
  return excluded.has(imageIdentity(image.imageUrl))
    || excluded.has(imageIdentity(image.url))
    || excluded.has(imageIdentity(image.thumburl))
    || excluded.has(String(image.title || "").trim().toLowerCase());
}

function routeCountryCodes(route = {}) {
  return [...new Set([
    ...(route.countryEntities || []).map((item) => item.countryCode),
    ...(route.countries || []),
  ].map((code) => String(code || "").trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
}

function englishCountryName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function routeCountryTerms(route = {}) {
  return routeCountryCodes(route).map((code) => {
    const entity = (route.countryEntities || []).find((item) => String(item.countryCode || "").toUpperCase() === code);
    return {
      code,
      terms: [
        englishCountryName(code),
        entity?.name,
        ...(route.countries || []).filter((country) => String(country || "").toUpperCase() !== code),
      ].filter(Boolean),
    };
  });
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContainsTerm(text, term) {
  const value = String(term || "").trim();
  if (!value) return false;
  if (/^[A-Z]{2}$/i.test(value)) return new RegExp(`(?:^|[^a-z])${escapeRegExp(value)}(?:[^a-z]|$)`, "i").test(text);
  return new RegExp(escapeRegExp(value).replace(/\s+/g, "[\\s_-]+"), "i").test(text);
}

function inferImageCountryCodes(route = {}, image = {}, query = "") {
  const haystack = [
    image.title,
    image.sourceUrl,
    image.imageUrl,
    image.query,
    query,
  ].filter(Boolean).join(" ");
  return routeCountryTerms(route)
    .filter(({ terms }) => terms.some((term) => textContainsTerm(haystack, term)))
    .map(({ code }) => code);
}

function imageDedupeKey(image = {}) {
  return imageIdentity(image.imageUrl || image.url || image.thumburl) || String(image.title || "").trim().toLowerCase();
}

function isBadRouteImage(image = {}) {
  const text = [image.imageUrl, image.sourceUrl, image.title].filter(Boolean).join(" ");
  return /world[_ -]?map|danubemap|blank|locator|flag|logo|icon|diagram|schema|svg|\.tiff?|tif(?:[/?#]|$)|no[_ -]?image|image[_ -]?not[_ -]?available|placeholder|thumbnail\.jpg|red[_ -]?background/i.test(text)
    || /big[_ -]?spy[_ -]?hop|national[_ -]?road|padang[_ -]?besar|sign|marker|parking|garage|workshop|interior|room|shop|stall|vendor|worker|selfie|passport|luggage|brochure|poster/i.test(text);
}

function verifiedImageForRoute(route = {}, image = {}, query = "") {
  if (!image?.imageUrl || isBadRouteImage(image)) return null;
  const routeCodes = routeCountryCodes(route);
  if (!routeCodes.length) return null;
  const imageCountryCodes = [...new Set(inferImageCountryCodes(route, image, query))];
  const matchedCodes = imageCountryCodes.filter((code) => routeCodes.includes(code));
  if (!matchedCodes.length) return null;
  return {
    ...image,
    status: "verified",
    semanticStatus: "verified",
    coverStatus: "verified",
    imageCountryCodes: matchedCodes,
    imageDedupeKey: imageDedupeKey(image),
    dedupeKey: imageDedupeKey(image),
    qualityScore: Number(image.qualityScore || 0),
    matchEvidence: `country:${matchedCodes.join("|")}; query:${query || image.query || ""}`,
    verifiedAt: new Date().toISOString(),
    failureReason: "",
  };
}

function routeImageSearchText(route = {}) {
  return [
    route.id,
    route.name,
    route.canonicalTitle,
    route.sourceTitle,
    ...(route.countries || []),
    ...(route.countryEntities || []).flatMap((item) => [item.countryCode, item.name]),
    ...(route.destinations || []),
    ...(route.cities || []),
  ].filter(Boolean).join(" ");
}

function countryCoverPool() {
  if (countryCoverPool.cache) return countryCoverPool.cache;
  const pool = new Map();
  const payload = readJsonFile(acceptedRoutesPath, { records: [] });
  const records = Array.isArray(payload.records) ? payload.records : [];
  for (const record of records) {
    const cover = record.coverAsset || {};
    const imageUrl = cover.imageUrl || record.coverImage || "";
    if (!imageUrl || isBadRouteImage({ ...cover, imageUrl })) continue;
    if (!/^https?:\/\//i.test(imageUrl)) continue;
    const key = imageDedupeKey({ ...cover, imageUrl });
    if (!key) continue;
    for (const code of routeCountryCodes(record)) {
      const imageText = [cover.title, cover.assetId, cover.sourceUrl, imageUrl].filter(Boolean).join(" ");
      const countryTerms = routeCountryTerms({ countryEntities: [{ countryCode: code }], countries: [code] })[0]?.terms || [];
      if (!countryTerms.some((term) => textContainsTerm(imageText, term))) continue;
      const list = pool.get(code) || [];
      if (!list.some((item) => item.dedupeKey === key)) {
        list.push({
          provider: "accepted-country-cover",
          imageUrl,
          sourceUrl: cover.sourceUrl || "",
          title: cover.title || cover.assetId || record.name || code,
          query: `${englishCountryName(code)} repository cover`,
          qualityScore: Number(cover.semanticScore || 50),
          imageCountryCodes: [code],
          dedupeKey: key,
          imageDedupeKey: key,
        });
      }
      pool.set(code, list);
    }
  }
  for (const [code, list] of pool.entries()) {
    list.sort((left, right) => Number(right.qualityScore || 0) - Number(left.qualityScore || 0));
    pool.set(code, list.slice(0, 80));
  }
  countryCoverPool.cache = pool;
  return pool;
}

function repositoryCountryFallbackImage(route = {}, excluded = new Set()) {
  const codes = routeCountryCodes(route);
  if (!codes.length) return null;
  const pool = countryCoverPool();
  const seed = stableImageSeed(route.id || route.name || routeImageSearchText(route));
  const orderedCodes = rotateImageCandidates(codes, seed);
  for (const code of orderedCodes) {
    const images = pool.get(code) || [];
    if (!images.length) continue;
    for (let offset = 0; offset < images.length; offset += 1) {
      const image = images[(seed + offset) % images.length];
      if (isExcludedImage(image, excluded)) continue;
      return {
        ...image,
        status: "verified",
        semanticStatus: "verified",
        coverStatus: "verified",
        imageCountryCodes: [code],
        matchEvidence: `country:${code}; repository-country-cover`,
        verifiedAt: new Date().toISOString(),
        failureReason: "",
      };
    }
  }
  return null;
}

const curatedCountryCovers = {
  AT: [
    ["Schloss Schönbrunn, Vienna", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Wien_-_Schloss_Sch%C3%B6nbrunn_%281%29.JPG/960px-Wien_-_Schloss_Sch%C3%B6nbrunn_%281%29.JPG"],
  ],
  BE: [
    ["Bruges Rozenhoedkaai", "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Bruges_Belgium_Rozenhoedkaai-01.jpg/960px-Bruges_Belgium_Rozenhoedkaai-01.jpg"],
  ],
  AR: [
    ["Perito Moreno Argentina", "https://commons.wikimedia.org/wiki/Special:FilePath/Perito_Moreno_Glacier_Patagonia_Argentina_Luca_Galuzzi_2005.JPG?width=960"],
  ],
  CH: [
    ["Matterhorn Switzerland", "https://commons.wikimedia.org/wiki/Special:FilePath/Matterhorn_from_Domh%C3%BCtte_-_2.jpg?width=960"],
  ],
  CL: [
  ],
  CZ: [
  ],
  DE: [
    ["Cologne Cathedral Germany", "https://commons.wikimedia.org/wiki/Special:FilePath/K%C3%B6lner_Dom_von_Osten.jpg?width=960"],
  ],
  ES: [
  ],
  FI: [
    ["Helsinki Cathedral", "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Helsinki_Cathedral_in_July_2004.jpg/960px-Helsinki_Cathedral_in_July_2004.jpg"],
  ],
  FR: [
    ["Mont Saint Michel France", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Mont-Saint-Michel_vu_du_ciel.jpg/960px-Mont-Saint-Michel_vu_du_ciel.jpg"],
    ["Bordeaux Place de la Bourse", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/138_-_Place_de_la_Bourse_et_le_miroir_d%27eau_-_Bordeaux.jpg/960px-138_-_Place_de_la_Bourse_et_le_miroir_d%27eau_-_Bordeaux.jpg"],
  ],
  GB: [
    ["Tower Bridge London", "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Tower_Bridge_from_Shad_Thames.jpg/960px-Tower_Bridge_from_Shad_Thames.jpg"],
    ["City of London from Tower Bridge", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/City_of_London%2C_seen_from_Tower_Bridge.jpg/960px-City_of_London%2C_seen_from_Tower_Bridge.jpg"],
  ],
  HU: [
    ["Hungarian Parliament Building", "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg/960px-Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg"],
  ],
  GR: [
    ["Santorini Greece", "https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Oia_-_Santorini_-_Greece_-_16.jpg/960px-Oia_-_Santorini_-_Greece_-_16.jpg"],
  ],
  HR: [
  ],
  IN: [
    ["Valley of Flowers India", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Valley_of_flowers_national_park%2C_Uttarakhand%2C_India_03_%28edit%29.jpg/960px-Valley_of_flowers_national_park%2C_Uttarakhand%2C_India_03_%28edit%29.jpg"],
    ["Taj Mahal India", "https://commons.wikimedia.org/wiki/Special:FilePath/Taj_Mahal_%28Edited%29.jpeg?width=960"],
  ],
  IS: [
    ["Jökulsárlón lagoon Iceland", "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/J%C3%B6kuls%C3%A1rl%C3%B3n_lagoon_in_Iceland.jpg/960px-J%C3%B6kuls%C3%A1rl%C3%B3n_lagoon_in_Iceland.jpg"],
  ],
  IT: [
    ["Milan Cathedral Italy", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg/960px-Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg"],
  ],
  JP: [
    ["Kiyomizu-dera Kyoto Japan", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg/960px-Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg"],
    ["Fushimi Inari Taisha Kyoto Japan", "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine%2C_Kyoto%2C_Japan.jpg/960px-Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine%2C_Kyoto%2C_Japan.jpg"],
  ],
  KH: [
    ["Angkor Wat Cambodia", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Angkor_Wat.jpg/960px-Angkor_Wat.jpg"],
  ],
  LU: [
    ["Luxembourg City Grund", "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Luxembourg_City_Grund_from_Bock.jpg/960px-Luxembourg_City_Grund_from_Bock.jpg"],
  ],
  MA: [
    ["Aït Benhaddou Morocco", "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/A%C3%AFtBenhaddou_Morocco_2.jpg/960px-A%C3%AFtBenhaddou_Morocco_2.jpg"],
  ],
  NL: [
    ["Keukenhof Netherlands tulips", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Keukenhof%2C_tulips_%2833513228345%29.jpg/960px-Keukenhof%2C_tulips_%2833513228345%29.jpg"],
  ],
  NO: [
    ["Lofoten Norway", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Reine_i_Lofoten_LC0148.jpg/960px-Reine_i_Lofoten_LC0148.jpg"],
  ],
  NP: [
  ],
  PL: [
    ["Wawel Krakow Poland", "https://commons.wikimedia.org/wiki/Special:FilePath/Krakow_Wawel_20070804_0930.jpg?width=960"],
  ],
  PT: [
  ],
  SK: [
    ["Bratislava Castle Slovakia", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Bratislava_Castle%2C_Danube%2C_St_Martin_Cathedral.jpg/960px-Bratislava_Castle%2C_Danube%2C_St_Martin_Cathedral.jpg"],
  ],
  TH: [
    ["Bangkok Grand Palace Thailand", "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Bangkok-large.png/960px-Bangkok-large.png"],
  ],
  TR: [
    ["Cappadocia hot air balloons Turkey", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Hot_air_balloon_start_in_Cappadocia_2014.jpg/960px-Hot_air_balloon_start_in_Cappadocia_2014.jpg"],
    ["Hagia Sophia Turkey", "https://commons.wikimedia.org/wiki/Special:FilePath/Hagia_Sophia_Mars_2013.jpg?width=960"],
  ],
  SE: [
    ["Stockholm Sweden", "https://commons.wikimedia.org/wiki/Special:FilePath/Stockholm_Gamla_stan.jpg?width=960"],
  ],
  SI: [
  ],
  US: [
    ["Zion National Park United States", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Kolob_Canyons_part_of_Zion_National_Park.JPG/960px-Kolob_Canyons_part_of_Zion_National_Park.JPG"],
    ["Golden Gate Bridge United States", "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Golden_Gate_Bridge_at_sunset_1.jpg/960px-Golden_Gate_Bridge_at_sunset_1.jpg"],
  ],
  VN: [
    ["Halong Bay Vietnam", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Halong_Bay_in_Vietnam.jpg/960px-Halong_Bay_in_Vietnam.jpg"],
  ],
  ZA: [
    ["Kruger National Park South Africa", "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Kruger_National_Park_%28ZA%29%2C_Landschaft_--_2024_--_0031.jpg/960px-Kruger_National_Park_%28ZA%29%2C_Landschaft_--_2024_--_0031.jpg"],
    ["Table Mountain South Africa", "https://commons.wikimedia.org/wiki/Special:FilePath/Table_Mountain_DanieVDM.jpg?width=960"],
  ],
};

function curatedCountryFallbackImage(route = {}, excluded = new Set()) {
  const codes = rotateImageCandidates(routeCountryCodes(route), stableImageSeed(route.id || route.name || ""));
  for (const code of codes) {
    const covers = curatedCountryCovers[code] || [];
    const ordered = rotateImageCandidates(covers, stableImageSeed(`${route.id || route.name || ""}:${code}`));
    for (const [title, imageUrl] of ordered) {
      const image = {
        provider: "curated-country-cover",
        imageUrl,
        sourceUrl: imageUrl,
        title,
        query: `${englishCountryName(code)} curated cover`,
        qualityScore: 80,
        imageCountryCodes: [code],
        dedupeKey: imageIdentity(imageUrl),
        imageDedupeKey: imageIdentity(imageUrl),
        status: "verified",
        semanticStatus: "verified",
        coverStatus: "verified",
        matchEvidence: `country:${code}; curated-country-cover`,
        verifiedAt: new Date().toISOString(),
        failureReason: "",
      };
      if (!isExcludedImage(image, excluded)) return image;
    }
  }
  return null;
}

const countrySummaryImageCache = new Map();

async function wikipediaCountrySummaryImage(code, signal, excluded = new Set()) {
  const normalized = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  if (countrySummaryImageCache.has(normalized)) {
    const cached = countrySummaryImageCache.get(normalized);
    return cached && !isExcludedImage(cached, excluded) ? cached : null;
  }
  const country = englishCountryName(normalized);
  const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(country)}`;
  const response = await fetch(apiUrl, {
    signal,
    headers: { "user-agent": "travel-collection-local-preview/1.0" },
  }).catch(() => null);
  if (!response?.ok) {
    countrySummaryImageCache.set(normalized, null);
    return null;
  }
  const payload = await response.json().catch(() => ({}));
  const source = payload.thumbnail?.source || payload.originalimage?.source || "";
  const title = `${country} Wikipedia summary`;
  const image = {
    provider: "wikipedia-country-summary",
    imageUrl: source,
    sourceUrl: payload.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(country.replace(/ /g, "_"))}`,
    title,
    query: country,
    qualityScore: 65,
    imageCountryCodes: [normalized],
    dedupeKey: imageIdentity(source),
    imageDedupeKey: imageIdentity(source),
    status: "verified",
    semanticStatus: "verified",
    coverStatus: "verified",
    matchEvidence: `country:${normalized}; wikipedia-country-summary`,
    verifiedAt: new Date().toISOString(),
    failureReason: "",
  };
  if (!source || isBadRouteImage(image)) {
    countrySummaryImageCache.set(normalized, null);
    return null;
  }
  countrySummaryImageCache.set(normalized, image);
  return isExcludedImage(image, excluded) ? null : image;
}

async function wikipediaCountryFallbackImage(route = {}, signal, excluded = new Set()) {
  const codes = rotateImageCandidates(routeCountryCodes(route), stableImageSeed(route.id || route.name || ""));
  for (const code of codes) {
    const image = await wikipediaCountrySummaryImage(code, signal, excluded);
    if (image?.imageUrl) return image;
  }
  return null;
}

const routeImageFallbackRules = [
  [/中欧四国快闪|奥地利、斯洛伐克、匈牙利、捷克|central-europe-hopper/i, {
    query: "Hungarian Parliament Building",
    title: "Hungarian_Parliament_Building_from_across_the_Danube,_2025-01-11.jpg",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg/960px-Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg",
    sourceUrl: "https://en.wikipedia.org/wiki/Hungarian_Parliament_Building",
  }],
  [/欧洲E45|e45/i, {
    query: "Brenner Pass",
    title: "Brennerpass_nordrampe.jpg",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Brennerpass_nordrampe.jpg/960px-Brennerpass_nordrampe.jpg",
    sourceUrl: "https://en.wikipedia.org/wiki/Brenner_Pass",
  }],
  [/多瑙河|danube/i, {
    query: "Wachau",
    title: "Wachau_(2).JPG",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Wachau_%282%29.JPG/960px-Wachau_%282%29.JPG",
    sourceUrl: "https://en.wikipedia.org/wiki/Wachau",
  }],
  [/曼谷.*新加坡|bangkok.*singapore/i, {
    query: "Gardens by the Bay",
    title: "Gardens_by_the_Bay,_Singapore.jpg",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Gardens_by_the_Bay%2C_Singapore.jpg/960px-Gardens_by_the_Bay%2C_Singapore.jpg",
    sourceUrl: "https://en.wikipedia.org/wiki/Gardens_by_the_Bay",
  }],
];

function routeFallbackImage(route = {}, excluded = new Set()) {
  void route;
  void excluded;
  return null;
/*
  if (isPlannerMaterializedRoute(route)) return null;
  const routeText = [route.id, route.name, route.canonicalTitle, route.sourceTitle].filter(Boolean).join(" ");
  const fallback = routeImageFallbackRules.find(([pattern]) => pattern.test(routeText))?.[1];
  if (!fallback || isExcludedImage(fallback, excluded)) return null;
  return { provider: "wikimedia-route-fallback", ...fallback };
*/
}

function isPlannerMaterializedRoute(route = {}) {
  const id = String(route.id || "");
  return Boolean(
    id.startsWith("materialized-")
      || route.contentEvidence?.plannerRuleVersion
      || route.contentEvidence?.materialized
      || route.coverAsset?.discoveredVia === "planner-rule-materialized"
      || route.coverAsset?.discoveredVia === "materialized-route-pool"
      || route.provenance?.providerId === "planner-rule-materialized",
  );
}

function isRouteFallbackProvider(value = "") {
  const provider = String(value || "").toLowerCase();
  return provider.includes("fallback") || provider.includes("prewarmed");
}

function cleanRouteImageTerm(value) {
  return String(value || "")
    .replace(/^gold-case-accepted-/i, "")
    .replace(/^gold-c\d+-\d+-/i, "")
    .replace(/^gold-\d+-/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(jp|it|fr|gr|tr|is|no|fi|se|th|vn|kh|my|sg|eg|ke|tz|uz|kz|kg|gb|us|ca|au|nz|mx|es|de|ch|at|nl|be|lu|hr|pt|ma|pe|za|na|ph)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

const countryImageTerms = {
  AR: "Argentina",
  AT: "Austria",
  AU: "Australia",
  BA: "Bosnia Herzegovina",
  BE: "Belgium",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CZ: "Czech Republic",
  DE: "Germany",
  EE: "Estonia",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "England",
  GR: "Greece",
  HR: "Croatia",
  HU: "Hungary",
  IS: "Iceland",
  IT: "Italy",
  JP: "Japan",
  KH: "Cambodia",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  ME: "Montenegro",
  NL: "Netherlands",
  NO: "Norway",
  NZ: "New Zealand",
  PT: "Portugal",
  SI: "Slovenia",
  SK: "Slovakia",
  TH: "Thailand",
  TR: "Turkey",
  VN: "Vietnam",
};

const placeImageTerms = {
  "曼谷": "Bangkok",
  "东京": "Tokyo",
  "京都": "Kyoto Japan",
  "大阪": "Osaka",
  "奈良": "Nara Japan",
  "箱根": "Hakone Mount Fuji",
  "富士山": "Mount Fuji",
  "金泽": "Kanazawa",
  "高山": "Takayama Japan",
  "白川乡": "Shirakawa-go",
  "松本": "Matsumoto Japan",
  "札幌": "Sapporo",
  "小樽": "Otaru",
  "富良野": "Furano Hokkaido",
  "熊野": "Kumano Kodo",
  "四国": "Shikoku Japan",
  "暹粒": "Siem Reap Angkor Wat",
  "金边": "Phnom Penh",
  "胡志明市": "Ho Chi Minh City",
  "卢布尔雅那": "Ljubljana",
  "萨格勒布": "Zagreb",
  "萨拉热窝": "Sarajevo",
  "莫斯塔尔": "Mostar bridge",
  "科托尔": "Kotor Montenegro",
  "阿姆斯特丹": "Amsterdam canals",
  "鹿特丹": "Rotterdam",
  "布鲁塞尔": "Brussels Grand Place",
  "布鲁日": "Bruges canal",
  "卢森堡市": "Luxembourg City",
  "维尔纽斯": "Vilnius old town",
  "里加": "Riga old town",
  "塔林": "Tallinn old town",
  "赫尔辛基": "Helsinki",
  "坎特伯雷": "Canterbury Cathedral",
  "兰斯": "Reims Cathedral",
  "洛桑": "Lausanne",
  "奥斯塔": "Aosta Italy",
  "罗马": "Rome",
  "维也纳": "Vienna old town",
  "布拉迪斯拉发": "Bratislava castle",
  "布达佩斯": "Budapest parliament",
  "布拉格": "Prague Charles Bridge",
  "埃尔卡拉法特": "El Calafate Patagonia",
  "莫雷诺冰川": "Perito Moreno glacier",
  "埃尔查尔坦": "El Chalten Fitz Roy",
  "托雷斯德尔潘恩": "Torres del Paine",
};

const routeImageQueryRules = [
  [/奥地利|斯洛伐克|匈牙利|捷克|austria|slovakia|hungary|czech/i, ["Budapest Parliament", "Vienna State Opera", "Bratislava Castle", "Prague Charles Bridge"]],
  [/多瑙河|danube/i, ["Budapest Parliament Danube", "Wachau Austria Danube", "Iron Gates Danube"]],
  [/曼谷.*新加坡|bangkok.*singapore/i, ["Petronas Twin Towers Kuala Lumpur", "Gardens by the Bay Singapore", "Bangkok Grand Palace"]],
  [/曼谷.*胡志明|bangkok.*ho chi minh|hcmc/i, ["Angkor Wat Cambodia", "Mekong Delta Vietnam", "Grand Palace Bangkok"]],
  [/欧洲E45|e45|alta.*gela/i, ["Brenner Pass Alps", "Alta Norway northern lights", "Aalborg Denmark old town"]],
  [/西撒哈拉|sahara|senegal/i, ["Dakhla Western Sahara", "Sahara desert Morocco", "Saint Louis Senegal bridge"]],
  [/皇家内陆|camino real|silver/i, ["Guanajuato Mexico", "Zacatecas Mexico cathedral", "San Miguel de Allende"]],
  [/佛教圣地|buddhist|buddha/i, ["Mahabodhi Temple Bodh Gaya", "Sarnath Dhamek Stupa", "Lumbini Maya Devi Temple"]],
  [/布伦纳|brenner|innsbruck/i, ["Innsbruck Golden Roof", "Brenner Pass Alps", "Neuschwanstein Castle"]],
  [/camino(?! real)|frances|朝圣/i, ["Santiago de Compostela Cathedral", "Camino de Santiago Pyrenees", "Burgos Cathedral"]],
  [/hawaii|夏威夷/i, ["Na Pali Coast", "Haleakala", "Hawaii Volcanoes National Park"]],
  [/azores|亚速尔/i, ["Sete Cidades", "Lagoa do Fogo", "Mount Pico Azores"]],
  [/palawan|巴拉望/i, ["El Nido Palawan", "Coron Palawan", "Puerto Princesa Underground River"]],
  [/croatian|克罗地亚|hvar|korcula/i, ["Hvar Croatia", "Dubrovnik old town", "Korcula Croatia"]],
  [/maya|玛雅|yucatan/i, ["Chichen Itza", "Tulum ruins", "Uxmal"]],
  [/australia|wildlife|澳大利亚|野生动物/i, ["Kangaroo Island", "Great Barrier Reef", "Uluru"]],
  [/unesco|土耳其|turkey/i, ["Cappadocia hot air balloons", "Hagia Sophia", "Pamukkale"]],
  [/italy|意大利|food|美食/i, ["Florence Cathedral", "Tuscany landscape", "Bologna Italy"]],
  [/namibia|纳米比亚/i, ["Sossusvlei", "Etosha National Park", "Deadvlei"]],
  [/christmas|christkindlesmarkt|圣诞市场/i, ["Nuremberg Christkindlesmarkt", "Cologne Cathedral Christmas market", "Dresden Striezelmarkt"]],
  [/czech republic.*germany|germany.*czech republic|prague.*germany|germany.*prague|捷克.*德国|德国.*捷克/i, ["Prague Charles Bridge", "Dresden old town", "Saxon Switzerland National Park"]],
  [/canada|rockies|加拿大|落基/i, ["Moraine Lake", "Lake Louise", "Banff National Park"]],
  [/tulip|netherlands|荷兰|郁金香/i, ["Keukenhof", "Tulip fields Netherlands", "Amsterdam canals"]],
  [/transcontinental|canadian.*rail|加拿大横贯/i, ["Canadian Pacific Railway Banff", "Banff National Park", "Vancouver skyline"]],
  [/norway.*rail|flam|挪威景观铁路|挪威北部/i, ["Flåm Line", "Lofoten Norway", "Tromsø aurora"]],
  [/garden route|花园大道/i, ["Knysna Heads", "Tsitsikamma National Park", "Garden Route South Africa"]],
  [/south island|new zealand|新西兰|南岛/i, ["Milford Sound", "Aoraki Mount Cook", "Queenstown New Zealand"]],
  [/california|pacific coast|加州|太平洋海岸/i, ["Big Sur", "Golden Gate Bridge", "California Highway 1"]],
  [/andalusia|安达卢西亚/i, ["Alhambra", "Mezquita-Catedral de Córdoba", "Plaza de España Seville"]],
  [/morocco|摩洛哥/i, ["Ait Benhaddou", "Chefchaouen", "Marrakesh"]],
  [/peru|秘鲁/i, ["Machu Picchu", "Cusco", "Sacred Valley Peru"]],
  [/london|伦敦/i, ["Tower Bridge", "Palace of Westminster", "London Eye"]],
  [/shikoku|四国/i, ["Shikoku Pilgrimage", "Matsuyama Castle", "Ritsurin Garden"]],
  [/balkan/i, ["Kotor Montenegro old town", "Mostar bridge Bosnia", "Ljubljana Slovenia old town"]],
  [/benelux/i, ["Amsterdam canals", "Bruges Belgium canal", "Luxembourg City old town"]],
  [/baltic/i, ["Tallinn old town", "Riga old town", "Vilnius old town"]],
  [/francigena/i, ["Via Francigena Tuscany", "Aosta Italy mountains", "Canterbury Cathedral"]],
  [/central europe|europe hopper/i, ["Prague Charles Bridge", "Budapest parliament", "Vienna old town"]],
  [/patagonia/i, ["Torres del Paine", "Perito Moreno glacier", "Fitz Roy Patagonia"]],
  [/mekong/i, ["Angkor Wat Cambodia", "Bangkok skyline", "Mekong Delta Vietnam"]],
  [/japan alps|alps/i, ["Kamikochi Japan Alps", "Takayama Japan old town", "Matsumoto Castle"]],
  [/japan|\bjp\b|tokyo|kansai|shikoku|kumano/i, ["Kyoto Japan temple", "Tokyo skyline", "Kumano Kodo Japan"]],
  [/iceland/i, ["Iceland winter landscape", "Jokulsarlon glacier lagoon", "Iceland aurora"]],
  [/turkey|cappadocia/i, ["Cappadocia hot air balloons", "Istanbul Hagia Sophia", "Pamukkale Turkey"]],
  [/norway|fjord|nordic/i, ["Norway fjord", "Lofoten Norway", "Bergen Norway"]],
];

function normalizeImageTerm(value) {
  const text = String(value || "").trim();
  const upper = text.toUpperCase?.() || "";
  if (placeImageTerms[text]) return placeImageTerms[text];
  if (countryImageTerms[upper]) return countryImageTerms[upper];
  if (/^[A-Z]{2}$/.test(upper)) {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(upper) || upper;
    } catch {
      return upper;
    }
  }
  return text;
}

function isUsefulImageQuery(query) {
  const text = String(query || "").trim();
  return text.length >= 3 && !/[?]{2,}/.test(text);
}

function stableImageSeed(value = "") {
  return [...String(value || "")].reduce((total, char) => ((total * 33) + char.charCodeAt(0)) >>> 0, 5381);
}

function rotateImageCandidates(items = [], seed = 0) {
  const unique = items.filter((item, index, all) => item && all.indexOf(item) === index);
  if (unique.length < 2) return unique;
  const offset = seed % unique.length;
  return unique.slice(offset).concat(unique.slice(0, offset));
}

function routeImageQueries(route = {}) {
  const idTerm = cleanRouteImageTerm(route.id || route.sourceTitle);
  const countryNames = (route.countryEntities || []).flatMap((item) => [item.countryCode, item.name]).filter(Boolean);
  const countries = (route.countries || []).concat(countryNames).map(normalizeImageTerm).filter(Boolean);
  const entityDestinations = (route.destinationEntities || []).map((item) => item.name).filter(Boolean);
  const destinations = (route.destinations || route.cities || []).concat(entityDestinations).map(normalizeImageTerm).filter(Boolean);
  const routeText = [route.id, route.name, route.canonicalTitle, route.sourceTitle, idTerm, ...countries, ...destinations].filter(Boolean).join(" ");
  const name = String(route.name || route.canonicalTitle || "").trim();
  const seed = stableImageSeed(route.id || route.name || route.canonicalTitle || routeText);
  const ruleQueries = rotateImageCandidates(routeImageQueryRules.flatMap(([pattern, queries]) => pattern.test(routeText) ? queries : []), seed);
  const countryQueries = rotateImageCandidates(countries.slice(0, 2).flatMap((country) => [
    [country, "national park landscape"].filter(Boolean).join(" "),
    [country, "city skyline"].filter(Boolean).join(" "),
    [country, "historic old town"].filter(Boolean).join(" "),
  ]), seed + 3);
  const destinationQueries = rotateImageCandidates([
    [idTerm, destinations[0], "travel"].filter(Boolean).join(" "),
    [name, destinations[0], "travel"].filter(Boolean).join(" "),
    [destinations[0], "landmark"].filter(Boolean).join(" "),
    [destinations[0], countries[0], "travel"].filter(Boolean).join(" "),
    [countries[0], destinations[0], "landmark"].filter(Boolean).join(" "),
    ...destinations.slice(1, 4).map((place) => [place, "landmark"].filter(Boolean).join(" ")),
  ], seed + 7);
  const candidates = isPlannerMaterializedRoute(route)
    ? [...ruleQueries, ...countryQueries, ...destinationQueries]
    : [...ruleQueries, ...destinationQueries, ...countryQueries];
  return candidates
    .map((query) => query.trim())
    .filter(isUsefulImageQuery)
    .filter((query, index, all) => all.indexOf(query) === index);
}

const routeImagePageRules = [
  [/湄公河|mekong/i, ["Angkor Wat", "Grand Palace", "Mekong Delta"]],
  [/balkan|巴尔干/i, ["Kotor", "Stari Most", "Ljubljana Castle"]],
  [/benelux|比荷卢/i, ["Canals of Amsterdam", "Grand-Place", "Bruges"]],
  [/baltic|波罗的海/i, ["Tallinn", "Riga", "Vilnius Old Town"]],
  [/francigena/i, ["Via Francigena", "Aosta Valley", "Canterbury Cathedral"]],
  [/奥地利|斯洛伐克|匈牙利|捷克/i, ["Hungarian Parliament Building", "Vienna State Opera", "Bratislava Castle"]],
  [/central europe|中欧|奥地利|捷克|匈牙利/i, ["Charles Bridge", "Hungarian Parliament Building", "Vienna State Opera"]],
  [/patagonia|巴塔哥尼亚/i, ["Torres del Paine National Park", "Perito Moreno Glacier", "Monte Fitz Roy"]],
  [/danube|多瑙河/i, ["Hungarian Parliament Building", "Wachau", "Iron Gates"]],
  [/bangkok.*singapore|曼谷.*新加坡/i, ["Petronas Towers", "Gardens by the Bay", "Grand Palace"]],
  [/bangkok.*ho chi minh|曼谷.*胡志明/i, ["Angkor Wat", "Mekong Delta", "Grand Palace"]],
  [/e45|欧洲E45/i, ["Brenner Pass", "Alta, Norway", "Aalborg"]],
  [/sahara|西撒哈拉/i, ["Dakhla, Western Sahara", "Sahara", "Saint-Louis, Senegal"]],
  [/camino(?! real)|frances|法国之路|朝圣/i, ["Santiago de Compostela Cathedral", "Camino de Santiago", "Burgos Cathedral"]],
  [/hawaii|夏威夷/i, ["Nā Pali Coast State Park", "Haleakalā National Park", "Hawaii Volcanoes National Park"]],
  [/azores|亚速尔/i, ["Sete Cidades", "Lagoa do Fogo", "Mount Pico"]],
  [/palawan|巴拉望/i, ["El Nido, Palawan", "Coron, Palawan", "Puerto Princesa Subterranean River National Park"]],
  [/croatian|克罗地亚|hvar|korcula/i, ["Hvar", "Dubrovnik", "Korčula"]],
  [/maya|玛雅|yucatan/i, ["Chichen Itza", "Tulum", "Uxmal"]],
  [/australia|wildlife|澳大利亚|野生动物/i, ["Kangaroo Island", "Great Barrier Reef", "Uluru"]],
  [/unesco|土耳其|turkey/i, ["Cappadocia", "Hagia Sophia", "Pamukkale"]],
  [/italy|意大利|food|美食/i, ["Florence Cathedral", "Tuscany", "Bologna"]],
  [/namibia|纳米比亚/i, ["Sossusvlei", "Etosha National Park", "Deadvlei"]],
  [/christmas|christkindlesmarkt|圣诞市场/i, ["Nuremberg Christkindlesmarkt", "Cologne Cathedral", "Dresden Striezelmarkt"]],
  [/czech republic.*germany|germany.*czech republic|prague.*germany|germany.*prague|捷克.*德国|德国.*捷克/i, ["Charles Bridge", "Dresden", "Saxon Switzerland National Park"]],
  [/canada|rockies|加拿大|落基/i, ["Moraine Lake", "Lake Louise", "Banff National Park"]],
  [/tulip|netherlands|荷兰|郁金香/i, ["Keukenhof", "Tulip field", "Amsterdam"]],
  [/transcontinental|canadian.*rail|加拿大横贯/i, ["Canadian Pacific Railway", "Banff National Park", "Vancouver"]],
  [/norway.*rail|flam|挪威景观铁路|挪威北部/i, ["Flåm Line", "Lofoten", "Tromsø"]],
  [/garden route|花园大道/i, ["Knysna", "Tsitsikamma National Park", "Garden Route"]],
  [/south island|new zealand|新西兰|南岛/i, ["Milford Sound", "Aoraki / Mount Cook", "Queenstown, New Zealand"]],
  [/california|pacific coast|加州|太平洋海岸/i, ["Big Sur", "Golden Gate Bridge", "California State Route 1"]],
  [/andalusia|安达卢西亚/i, ["Alhambra", "Mosque–Cathedral of Córdoba", "Plaza de España, Seville"]],
  [/morocco|摩洛哥/i, ["Aït Benhaddou", "Chefchaouen", "Marrakesh"]],
  [/peru|秘鲁/i, ["Machu Picchu", "Cusco", "Sacred Valley"]],
  [/london|伦敦/i, ["Tower Bridge", "Palace of Westminster", "London Eye"]],
  [/shikoku|四国/i, ["Shikoku Pilgrimage", "Matsuyama Castle", "Ritsurin Garden"]],
  [/japan alps|日本中部|alps/i, ["Kamikōchi", "Takayama, Gifu", "Matsumoto Castle"]],
  [/japan|日本|\bjp\b/i, ["Kiyomizu-dera", "Tokyo Tower", "Fushimi Inari-taisha"]],
];

function routeImagePages(route = {}) {
  const idTerm = cleanRouteImageTerm(route.id || route.sourceTitle);
  const countryNames = (route.countryEntities || []).flatMap((item) => [item.countryCode, item.name]).filter(Boolean);
  const countries = (route.countries || []).concat(countryNames).map(normalizeImageTerm).filter(Boolean);
  const entityDestinations = (route.destinationEntities || []).map((item) => item.name).filter(Boolean);
  const destinations = (route.destinations || route.cities || []).concat(entityDestinations).map(normalizeImageTerm).filter(Boolean);
  const routeText = [route.id, route.name, route.canonicalTitle, route.sourceTitle, idTerm, ...countries, ...destinations].filter(Boolean).join(" ");
  const seed = stableImageSeed(route.id || route.name || route.canonicalTitle || routeText);
  const rulePages = rotateImageCandidates(routeImagePageRules.flatMap(([pattern, pages]) => pattern.test(routeText) ? pages : []), seed);
  const countryPages = rotateImageCandidates(countries.slice(0, 2), seed + 11);
  const destinationPages = rotateImageCandidates(destinations.slice(0, 5), seed + 5);
  const candidates = isPlannerMaterializedRoute(route)
    ? [...rulePages, ...countryPages, ...destinationPages]
    : [...rulePages, ...destinationPages, ...countryPages];
  return candidates
    .filter((page, index, all) => all.indexOf(page) === index);
}

function isUsableCommonsImage(page) {
  const info = page?.imageinfo?.[0] || {};
  const title = String(page?.title || "");
  const mime = String(info.mime || "");
  if (!/^image\/(jpeg|png|webp)$/i.test(mime)) return false;
  if (/map|locator|flag|icon|logo|diagram|blank|svg|model|miniature|gear|seller|passport|luggage|brochure|poster|airline|airport|sign|marker|car|automobile|vehicle|parking|garage|workshop|interior|room|shop|stall|vendor|worker|people|person|crowd|selfie/i.test(title)) return false;
  if (Number(info.width || 0) < 500 || Number(info.height || 0) < 320) return false;
  return Boolean(info.thumburl || info.url);
}

function significantQueryTokens(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 4 && !["travel", "landmark", "landscape", "old", "town"].includes(token));
}

function scoreCommonsImage(page, query) {
  const info = page?.imageinfo?.[0] || {};
  const title = String(page?.title || "").toLowerCase();
  const width = Number(info.width || 0);
  const height = Number(info.height || 0);
  const ratio = height ? width / height : 0;
  let score = 0;
  if (ratio >= 1.15 && ratio <= 2.4) score += 12;
  if (ratio < 0.95) score -= 10;
  if (width >= 1200) score += 4;
  if (height >= 700) score += 3;
  for (const token of significantQueryTokens(query)) {
    if (title.includes(token)) score += 8;
  }
  if (/temple|cathedral|castle|bridge|palace|parliament|tower|skyline|old town|glacier|fjord|mountain|canal|wat|stupa|mosque|church|square|pagoda|shrine|monastery|fortress|opera|coast|beach|harbour|harbor|desert|valley|waterfall|national park|landscape/i.test(title)) score += 10;
  if (/statue|detail|interior|front|entrance|station|platform|sign|road|marker|museum|camping|car|automobile|vehicle|parking|garage|workshop|shop|stall|vendor|worker|people|person|crowd|selfie/i.test(title)) score -= 30;
  return score;
}

async function searchCommonsImages(query, signal, excluded = new Set(), limit = 4) {
  const apiUrl = new URL("https://commons.wikimedia.org/w/api.php");
  apiUrl.searchParams.set("action", "query");
  apiUrl.searchParams.set("generator", "search");
  apiUrl.searchParams.set("gsrnamespace", "6");
  apiUrl.searchParams.set("gsrlimit", "20");
  apiUrl.searchParams.set("gsrsearch", query);
  apiUrl.searchParams.set("prop", "imageinfo");
  apiUrl.searchParams.set("iiprop", "url|mime|size");
  apiUrl.searchParams.set("iiurlwidth", "960");
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("origin", "*");
  const response = await fetch(apiUrl, {
    signal,
    headers: { "user-agent": "travel-collection-local-preview/1.0" },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const pages = Object.values(payload.query?.pages || {});
  return pages
    .filter((candidate) => {
      if (!isUsableCommonsImage(candidate)) return false;
      const info = candidate.imageinfo?.[0] || {};
      return !isExcludedImage({
        imageUrl: info.thumburl || info.url,
        url: info.url,
        thumburl: info.thumburl,
        title: candidate.title,
      }, excluded);
    })
    .sort((left, right) => scoreCommonsImage(right, query) - scoreCommonsImage(left, query))
    .slice(0, limit)
    .map((page) => {
      const info = page.imageinfo[0];
      return {
        provider: "wikimedia-commons-search",
        imageUrl: info.thumburl || info.url,
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || "").replace(/^File:/, "File:"))}`,
        title: page.title,
        query,
        qualityScore: scoreCommonsImage(page, query),
      };
    });
}

async function searchCommonsImage(query, signal, excluded = new Set()) {
  const images = await searchCommonsImages(query, signal, excluded, 1);
  const page = images?.[0];
  if (!page) return null;
  return page;
}

const countryCommonsPoolCache = new Map();

async function countryCommonsImagePool(code, signal) {
  const normalized = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return [];
  if (countryCommonsPoolCache.has(normalized)) return countryCommonsPoolCache.get(normalized);
  const country = englishCountryName(normalized);
  const poolRoute = { countryEntities: [{ countryCode: normalized, name: country }], countries: [normalized] };
  const queries = [
    `${country} landmark`,
    `${country} historic old town`,
    `${country} national park landscape`,
    `${country} city skyline`,
    `${country} UNESCO heritage`,
  ];
  const seen = new Set();
  const verified = [];
  const batches = await Promise.all(queries.map(async (query) => ({
    query,
    images: await searchCommonsImages(query, signal, new Set(), 6).catch(() => []),
  })));
  for (const { query, images } of batches) {
    for (const image of images || []) {
      const item = verifiedImageForRoute(poolRoute, image, query);
      const key = item?.imageDedupeKey || imageIdentity(item?.imageUrl);
      if (!item?.imageUrl || !key || seen.has(key)) continue;
      seen.add(key);
      verified.push({
        ...item,
        provider: "wikimedia-country-pool",
        matchEvidence: `country:${normalized}; country-pool:${query}`,
      });
      if (verified.length >= 12) break;
    }
    if (verified.length >= 12) break;
  }
  countryCommonsPoolCache.set(normalized, verified);
  return verified;
}

async function countryCommonsPoolFallbackImage(route = {}, signal, excluded = new Set()) {
  const codes = rotateImageCandidates(routeCountryCodes(route), stableImageSeed(route.id || route.name || ""));
  for (const code of codes) {
    const pool = rotateImageCandidates(await countryCommonsImagePool(code, signal), stableImageSeed(`${route.id || route.name || ""}:${code}:country-pool`));
    for (const image of pool) {
      const verified = verifiedImageForRoute(route, image, image.query || englishCountryName(code));
      if (verified?.imageUrl && !isExcludedImage(verified, excluded)) {
        return {
          ...verified,
          provider: "wikimedia-country-pool",
          matchEvidence: `country:${verified.imageCountryCodes.join("|")}; country-pool:${image.query || code}`,
        };
      }
    }
  }
  return null;
}

const countryPagePool = {
  AR: ["Perito Moreno Glacier", "Buenos Aires", "Iguazu Falls"],
  AT: ["Vienna State Opera", "Schönbrunn Palace", "Hallstatt"],
  BE: ["Grand-Place", "Bruges", "Antwerp Cathedral"],
  CH: ["Matterhorn", "Chillon Castle", "Lake Geneva"],
  CL: ["Torres del Paine National Park", "Valparaíso", "Atacama Desert"],
  CZ: ["Charles Bridge", "Prague Castle", "Český Krumlov"],
  DE: ["Brandenburg Gate", "Cologne Cathedral", "Neuschwanstein Castle", "Dresden Frauenkirche"],
  EE: ["Tallinn", "Lahemaa National Park", "Tartu"],
  ES: ["Alhambra", "Sagrada Família", "Plaza de España, Seville"],
  FI: ["Helsinki Cathedral", "Suomenlinna", "Lapland (Finland)"],
  FR: ["Eiffel Tower", "Mont Saint-Michel", "Bordeaux", "Palace of Versailles"],
  GB: ["Tower Bridge", "Palace of Westminster", "Edinburgh Castle"],
  GR: ["Acropolis of Athens", "Santorini", "Meteora"],
  HR: ["Dubrovnik", "Plitvice Lakes National Park", "Hvar"],
  HU: ["Hungarian Parliament Building", "Buda Castle", "Lake Balaton"],
  IT: ["Colosseum", "Venice", "Florence Cathedral", "Cinque Terre"],
  JP: ["Kiyomizu-dera", "Fushimi Inari-taisha", "Mount Fuji", "Tokyo Tower"],
  KH: ["Angkor Wat", "Phnom Penh", "Tonlé Sap"],
  LA: ["Luang Prabang", "Pha That Luang", "Vang Vieng"],
  LS: ["Maloti Mountains", "Maletsunyane Falls", "Thaba Bosiu"],
  LT: ["Vilnius Old Town", "Trakai Island Castle", "Curonian Spit"],
  LU: ["Luxembourg City", "Vianden Castle", "Grund, Luxembourg"],
  MA: ["Aït Benhaddou", "Marrakesh", "Chefchaouen"],
  NL: ["Canals of Amsterdam", "Keukenhof", "Kinderdijk"],
  NO: ["Lofoten", "Geirangerfjord", "Bergen"],
  NP: ["Annapurna", "Kathmandu Durbar Square", "Phewa Lake"],
  PL: ["Wawel Castle", "Kraków Old Town", "Tatra Mountains"],
  PT: ["Belém Tower", "Ponte de Dom Luís I", "Sintra"],
  PY: ["Asunción", "Jesuit Missions of La Santísima Trinidad de Paraná and Jesús de Tavarangue", "Iguazu Falls"],
  SE: ["Stockholm", "Gamla stan", "Abisko National Park"],
  SI: ["Lake Bled", "Ljubljana Castle", "Postojna Cave"],
  SK: ["Bratislava Castle", "High Tatras", "Spiš Castle"],
  TH: ["Grand Palace", "Wat Arun", "Ayutthaya Historical Park"],
  TR: ["Cappadocia", "Hagia Sophia", "Pamukkale"],
  UY: ["Montevideo", "Colonia del Sacramento", "Punta del Este"],
  VE: ["Angel Falls", "Mérida, Mérida", "Canaima National Park"],
  VN: ["Hạ Long Bay", "Hội An", "Ho Chi Minh City"],
  ZA: ["Table Mountain", "Kruger National Park", "Cape Town"],
};

const countryPagePoolCache = new Map();

async function countryPagePoolImages(code, signal) {
  const normalized = String(code || "").toUpperCase();
  if (countryPagePoolCache.has(normalized)) return countryPagePoolCache.get(normalized);
  const country = englishCountryName(normalized);
  const poolRoute = { countryEntities: [{ countryCode: normalized, name: country }], countries: [normalized] };
  const pages = countryPagePool[normalized] || [country];
  const images = await Promise.all(pages.map(async (page) => {
    const image = await searchWikipediaPageImage(page, signal, new Set()).catch(() => null);
    return verifiedImageForRoute(poolRoute, image, `${page} ${country}`);
  }));
  const seen = new Set();
  const verified = images.filter((image) => {
    const key = image?.imageDedupeKey || imageIdentity(image?.imageUrl);
    if (!image?.imageUrl || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  countryPagePoolCache.set(normalized, verified);
  return verified;
}

async function countryPagePoolFallbackImage(route = {}, signal, excluded = new Set()) {
  const codes = rotateImageCandidates(routeCountryCodes(route), stableImageSeed(route.id || route.name || ""));
  for (const code of codes) {
    const images = rotateImageCandidates(await countryPagePoolImages(code, signal), stableImageSeed(`${route.id || route.name || ""}:${code}:page-pool`));
    for (const image of images) {
      const verified = verifiedImageForRoute(route, image, `${image.query || image.title || ""} ${englishCountryName(code)}`);
      if (verified?.imageUrl && !isExcludedImage(verified, excluded)) {
        return { ...verified, provider: "wikipedia-country-page-pool" };
      }
    }
  }
  return null;
}

async function searchWikipediaPageImage(title, signal, excluded = new Set()) {
  const apiUrl = new URL("https://en.wikipedia.org/w/api.php");
  apiUrl.searchParams.set("action", "query");
  apiUrl.searchParams.set("prop", "pageimages|info");
  apiUrl.searchParams.set("piprop", "thumbnail|original|name");
  apiUrl.searchParams.set("pithumbsize", "960");
  apiUrl.searchParams.set("inprop", "url");
  apiUrl.searchParams.set("redirects", "1");
  apiUrl.searchParams.set("titles", title);
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("origin", "*");
  const response = await fetch(apiUrl, {
    signal,
    headers: { "user-agent": "travel-collection-local-preview/1.0" },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const page = Object.values(payload.query?.pages || {}).find((item) => item?.thumbnail?.source || item?.original?.source);
  const source = page?.thumbnail?.source || page?.original?.source || "";
  const imageTitle = page?.pageimage || page?.title || title;
  if (!source || isExcludedImage({ imageUrl: source, title: imageTitle }, excluded)) return null;
  if (/\.tiff?(?:[/?#]|$)|\/tiff?|scan|archive/i.test(source)) return null;
  if (/svg|map|locator|flag|logo|icon|diagram|sign|marker|scan|archive/i.test(source) || /map|locator|flag|logo|icon|diagram|sign|marker|scan|archive/i.test(imageTitle)) return null;
  return {
    provider: "wikipedia-pageimage",
    imageUrl: source,
    sourceUrl: page?.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    title: imageTitle,
    query: title,
    qualityScore: 70,
  };
}

async function resolveOnlineRouteImage(route, signal) {
  const routeId = String(route?.id || "").trim();
  if (!routeId) return null;
  const excluded = excludedImageIdentities(route);
  const plannerMaterialized = isPlannerMaterializedRoute(route);
  const cache = readJsonFile(routeImageCachePath, {});
  const cached = cache[routeId];
  if (
    cached?.imageUrl
      && cached.expiresAt > Date.now()
      && cached.cacheVersion === routeImageCacheVersion
      && cached.semanticStatus === "verified"
      && Array.isArray(cached.imageCountryCodes)
      && cached.imageCountryCodes.some((code) => routeCountryCodes(route).includes(code))
      && !isExcludedImage(cached, excluded)
      && !(plannerMaterialized && isRouteFallbackProvider(cached.provider))
  ) {
    cache[routeId] = { ...cached, lastAccess: new Date().toISOString(), hitCount: Number(cached.hitCount || 0) + 1 };
    writeJsonFile(routeImageCachePath, cache);
    return cache[routeId];
  }
  const fallback = verifiedImageForRoute(route, routeFallbackImage(route, excluded), "fallback");
  if (fallback?.imageUrl) {
    const item = {
      ...fallback,
      routeId,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      hitCount: 1,
      cacheVersion: routeImageCacheVersion,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    if (!excluded.size) {
      cache[routeId] = item;
      writeJsonFile(routeImageCachePath, cache);
    }
    return item;
  }
  const curatedFallback = curatedCountryFallbackImage(route, excluded);
  if (curatedFallback?.imageUrl) {
    const item = {
      ...curatedFallback,
      routeId,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      hitCount: 1,
      cacheVersion: routeImageCacheVersion,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    if (!excluded.size) {
      cache[routeId] = item;
      writeJsonFile(routeImageCachePath, cache);
    }
    return item;
  }
  const verifiedRepositoryFallback = repositoryCountryFallbackImage(route, excluded);
  if (verifiedRepositoryFallback?.imageUrl) {
    const item = {
      ...verifiedRepositoryFallback,
      routeId,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      hitCount: 1,
      cacheVersion: routeImageCacheVersion,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    if (!excluded.size) {
      cache[routeId] = item;
      writeJsonFile(routeImageCachePath, cache);
    }
    return item;
  }
  const countryPageFallback = await countryPagePoolFallbackImage(route, signal, excluded);
  if (countryPageFallback?.imageUrl) {
    const item = {
      ...countryPageFallback,
      routeId,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      hitCount: 1,
      cacheVersion: routeImageCacheVersion,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    if (!excluded.size) {
      cache[routeId] = item;
      writeJsonFile(routeImageCachePath, cache);
    }
    return item;
  }
  const repositoryFallback = null;
  if (repositoryFallback?.imageUrl) {
    const item = {
      ...repositoryFallback,
      routeId,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      hitCount: 1,
      cacheVersion: routeImageCacheVersion,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    if (!excluded.size) {
      cache[routeId] = item;
      writeJsonFile(routeImageCachePath, cache);
    }
    return item;
  }
  const countrySummaryFallback = await wikipediaCountryFallbackImage(route, signal, excluded);
  if (countrySummaryFallback?.imageUrl) {
    const item = {
      ...countrySummaryFallback,
      routeId,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      hitCount: 1,
      cacheVersion: routeImageCacheVersion,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    if (!excluded.size) {
      cache[routeId] = item;
      writeJsonFile(routeImageCachePath, cache);
    }
    return item;
  }
  for (const title of routeImagePages(route)) {
    const image = await searchWikipediaPageImage(title, signal, excluded).catch(() => null);
    const verified = verifiedImageForRoute(route, image, title);
    if (verified?.imageUrl) {
      const item = {
        ...verified,
        routeId,
        createdAt: new Date().toISOString(),
        lastAccess: new Date().toISOString(),
        hitCount: 1,
        cacheVersion: routeImageCacheVersion,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
      if (!excluded.size) {
        cache[routeId] = item;
        writeJsonFile(routeImageCachePath, cache);
      }
      return item;
    }
  }
  const countryPoolFallback = await countryCommonsPoolFallbackImage(route, signal, excluded);
  if (countryPoolFallback?.imageUrl) {
    const item = {
      ...countryPoolFallback,
      routeId,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      hitCount: 1,
      cacheVersion: routeImageCacheVersion,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    if (!excluded.size) {
      cache[routeId] = item;
      writeJsonFile(routeImageCachePath, cache);
    }
    return item;
  }
  for (const query of routeImageQueries(route)) {
    const image = await searchCommonsImage(query, signal, excluded).catch(() => null);
    const verified = verifiedImageForRoute(route, image, query);
    if (verified?.imageUrl) {
      const item = {
        ...verified,
        routeId,
        createdAt: new Date().toISOString(),
        lastAccess: new Date().toISOString(),
        hitCount: 1,
        cacheVersion: routeImageCacheVersion,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
      if (!excluded.size) {
        cache[routeId] = item;
        writeJsonFile(routeImageCachePath, cache);
      }
      return item;
    }
  }
  return null;
}

async function loadRouteLibrary() {
  const routesUrl = pathToFileURL(path.join(root, "src", "lib", "routes", "index.mjs")).href;
  return import(routesUrl);
}

async function createDiscoveryHandler(routeLibrary, knowledgeEntityLayerRepository, routeV2RuntimeEnv) {
  const {
    createAcceptedRouteRepository,
    createRouteFeedRefillWorker,
    createRouteDiscovery,
    createRouteDiscoveryHandler,
    createRouteJobStore,
  } = routeLibrary;
  const acceptedRepository = createAcceptedRouteRepository({
    storagePath: process.env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "accepted-routes.json"),
  });
  const jobStore = createRouteJobStore();
  const feedRefillWorker = createRouteFeedRefillWorker({
    repository: acceptedRepository,
    jobStore,
    root,
    env: routeV2RuntimeEnv,
    log: (event) => {
      if (process.env.ROUTE_FEED_REFILL_LOG === "true") console.log(JSON.stringify({ stage: "feed-refill", ...event }));
    },
  });
  const discovery = createRouteDiscovery({
    acceptedRepository,
    jobStore,
    feedRefillWorker,
    knowledgeEntityLayerRepository,
    env: routeV2RuntimeEnv,
  });
  return createRouteDiscoveryHandler({ discovery });
}

async function main() {
  const routeLibrary = await loadRouteLibrary();
  const routeV2RuntimeEnv = routeLibrary.createRouteV2RuntimeEnvironment(process.env);
  const knowledgeEntityLayerRepository = routeLibrary.createPublishedKnowledgeEntityLayerRepository({ projectRoot: root });
  const knowledgeEntitySummary = knowledgeEntityLayerSummary(knowledgeEntityLayerRepository);
  const discoveryHandler = await createDiscoveryHandler(routeLibrary, knowledgeEntityLayerRepository, routeV2RuntimeEnv);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
      if (handleKnowledgeEntityLayerRequest(request, response, url, knowledgeEntityLayerRepository)) return;

      if (url.pathname === "/api/routes/image-search") {
        const abortController = new AbortController();
        request.on("aborted", () => abortController.abort());
        const body = request.method === "POST" ? await readBody(request) : undefined;
        const route = body?.length ? JSON.parse(body.toString("utf8")) : {};
        const image = await resolveOnlineRouteImage(route, abortController.signal);
        sendJson(response, 200, { ok: true, status: image?.imageUrl ? "verified" : "not_found", image });
        return;
      }

      if (url.pathname === "/api/routes/image-proxy") {
        const abortController = new AbortController();
        request.on("aborted", () => abortController.abort());
        await proxyRemoteImage(url.searchParams.get("url"), response, abortController.signal);
        return;
      }

      if (url.pathname === "/api/routes/discovery") {
        const abortController = new AbortController();
        request.on("aborted", () => abortController.abort());
        const body = request.method === "POST" ? await readBody(request) : undefined;
        const apiRequest = new Request(url.href, {
          method: request.method,
          headers: request.headers,
          body,
          signal: abortController.signal,
        });
        const apiResponse = await discoveryHandler(apiRequest, {
          requestId: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          waitUntil(task) { Promise.resolve(task).catch(() => null); },
        });
        response.writeHead(apiResponse.status, Object.fromEntries(apiResponse.headers.entries()));
        response.end(Buffer.from(await apiResponse.arrayBuffer()));
        return;
      }

      if (url.pathname === "/") {
        response.writeHead(302, { location: "/travel-collection/" });
        response.end();
        return;
      }

      const filePath = safeStaticPath(url.pathname);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        send(response, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      send(response, 200, fs.readFileSync(filePath), {
        "content-type": contentTypes[ext] || "application/octet-stream",
        "cache-control": "no-store",
      });
    } catch (error) {
      send(response, 500, error?.stack || String(error), { "content-type": "text/plain; charset=utf-8" });
    }
  });

  server.listen(port, host, () => {
    console.log(`Knowledge Entity Layer: ${knowledgeEntitySummary.countries} countries, ${knowledgeEntitySummary.cities} cities, ${knowledgeEntitySummary.pois} POIs`);
    console.log(`Travel Collection preview: http://${host}:${port}/travel-collection/`);
    console.log(`Routes/Search page: http://${host}:${port}/travel-collection/routes.html`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = Object.freeze({ proxyRemoteImage });
