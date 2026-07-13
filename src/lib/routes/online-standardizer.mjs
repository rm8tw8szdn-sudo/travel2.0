const WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

function clean(value) { return String(value || "").trim().replace(/\s+/g, " "); }
function hasChinese(value) { return /[\u3400-\u9fff]/u.test(clean(value)); }
export function preferredChineseLabel(labels) {
  return clean(labels?.["zh-hans"]?.value || labels?.["zh-cn"]?.value || labels?.zh?.value);
}
function isDestinationEntityType(value) {
  const type = clean(value);
  if (!type) return true;
  if (/\b(?:route|trail|path|itinerary|tour|road|highway|railway line|language|religion|ethnic group|human|occupation|literary work|written work)\b/i.test(type)) return false;
  return /\b(?:city|town|village|municipality|settlement|county|district|province|state|region|island|mountain|river|lake|park|protected area|archaeological site|temple|monastery|prefecture|commune)\b/i.test(type);
}

function destinationPriority(value) {
  const type = clean(value);
  if (!type) return 2;
  if (/\b(?:city|town|village|municipality|settlement|commune)\b/i.test(type)) return 4;
  if (/\b(?:county|district|province|state|prefecture)\b/i.test(type)) return 3;
  if (/\b(?:island|park|protected area|archaeological site|temple|monastery)\b/i.test(type)) return 2;
  if (/\b(?:mountain|river|lake|region)\b/i.test(type)) return 1;
  return 0;
}
function uniqueBy(values, key) { const seen = new Set(); return values.filter((item) => { const id = key(item); if (!id || seen.has(id)) return false; seen.add(id); return true; }); }

export function orderedLinkedTitles(page) {
  let content = String(page?.revisions?.[0]?.slots?.main?.content || page?.revisions?.[0]?.content || "");
  content = content.replace(/<!--[\s\S]*?-->/g, " ").replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*\/>/gi, " ");
  const markerTitles = [...content.matchAll(/\{\{\s*(?:marker|listing|see|do|go|vicinity|buy|eat|drink|sleep)\b[^{}]*\|\s*name\s*=\s*([^|}\n]+)/gi)]
    .map((match) => clean(match[1]))
    .filter((title) => title && !title.includes(":"))
    .slice(0, 12);
  let previous = "";
  while (content !== previous) {
    previous = content;
    content = content.replace(/\{\{[^{}]*\}\}/g, " ");
  }
  const bodyTitles = [...content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)]
    .map((match) => clean(match[1]))
    .filter((title) => title && !title.includes(":") && !/(?:airport|visa|currency|language|weather|stay safe|dangerous|itinerar)/i.test(title));
  const fallbackTitles = (page.links || []).map((item) => clean(item.title));
  const primaryTitles = [...markerTitles, ...bodyTitles];
  const ordered = primaryTitles.length >= 3 ? primaryTitles : [...primaryTitles, ...fallbackTitles];
  return uniqueBy(ordered, (item) => item).slice(0, 40);
}

function claimEntity(entity, property) {
  return entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value?.id || "";
}

function claimText(entity, property) {
  return entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value || "";
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchJson(fetchImpl, url, { basic = false, deadlineAt = 0 } = {}) {
  let response;
  const attempts = basic ? 1 : 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const remainingMs = deadlineAt ? Math.max(1, deadlineAt - Date.now()) : 15_000;
      const timeoutMs = Math.max(1, Math.min(basic ? 2_500 : 15_000, remainingMs));
      response = await fetchImpl(url, { headers: { "Api-User-Agent": "TravelCollectionRouteV2/2.0 (https://github.com/rm8tw8szdn-sudo/travel-collection)" }, signal: globalThis.AbortSignal?.timeout?.(timeoutMs) });
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await wait(250 * (attempt + 1));
      continue;
    }
    if (response.ok || (response.status !== 429 && response.status < 500)) break;
    if (attempt < attempts - 1) {
      const retryAfter = Number(response.headers?.get?.("retry-after")) || 0;
      await wait(Math.min(30_000, Math.max(retryAfter * 1000, 500 * (attempt + 1))));
    }
  }
  if (!response.ok) throw new Error(`Online entity request failed (${response.status})`);
  return response.json();
}

export function createWikidataEntityResolver({ fetchImpl = globalThis.fetch } = {}) {
  const cache = new Map();
  const typeLabels = new Map();
  return async function resolveLinkedEntities(page, { extraEntityIds = [], basic = false, deadlineAt = 0 } = {}) {
    const cacheKey = `${basic ? "basic" : "full"}:${String(page?.pageid || page?.title || "")}:${extraEntityIds.join("|")}`;
    if (cacheKey && cache.has(cacheKey)) return structuredClone(cache.get(cacheKey));
    const titles = orderedLinkedTitles(page).slice(0, basic ? 8 : 20);
    if (!titles.length) return [];

    const pageUrl = new URL(WIKIVOYAGE_API);
    pageUrl.searchParams.set("origin", "*");
    pageUrl.searchParams.set("format", "json");
    pageUrl.searchParams.set("formatversion", "2");
    pageUrl.searchParams.set("action", "query");
    pageUrl.searchParams.set("prop", "pageprops");
    pageUrl.searchParams.set("redirects", "1");
    pageUrl.searchParams.set("titles", titles.join("|"));
    const pagePayload = await fetchJson(fetchImpl, pageUrl, { basic, deadlineAt });
    const pageItems = (pagePayload.query?.pages || []).filter((item) => item.pageprops?.wikibase_item);
    const ids = uniqueBy([...extraEntityIds, ...pageItems.map((item) => item.pageprops.wikibase_item)], (item) => item);
    if (!ids.length) return [];

    const entityUrl = new URL(WIKIDATA_API);
    entityUrl.searchParams.set("origin", "*");
    entityUrl.searchParams.set("format", "json");
    entityUrl.searchParams.set("action", "wbgetentities");
    entityUrl.searchParams.set("ids", ids.join("|"));
    entityUrl.searchParams.set("props", "labels|claims");
    entityUrl.searchParams.set("languages", "zh-hans|zh-cn|zh|en");
    const entityPayload = await fetchJson(fetchImpl, entityUrl, { basic, deadlineAt });
    const entities = entityPayload.entities || {};
    const instanceIds = uniqueBy(ids.map((id) => claimEntity(entities[id], "P31")).filter(Boolean), (item) => item);
    const missingTypeIds = instanceIds.filter((id) => !typeLabels.has(id));
    if (!basic && missingTypeIds.length) {
      const typeUrl = new URL(WIKIDATA_API);
      typeUrl.searchParams.set("origin", "*");
      typeUrl.searchParams.set("format", "json");
      typeUrl.searchParams.set("action", "wbgetentities");
      typeUrl.searchParams.set("ids", missingTypeIds.join("|"));
      typeUrl.searchParams.set("props", "labels");
      typeUrl.searchParams.set("languages", "en");
      const typeEntities = (await fetchJson(fetchImpl, typeUrl, { basic, deadlineAt })).entities || {};
      missingTypeIds.forEach((id) => typeLabels.set(id, clean(typeEntities[id]?.labels?.en?.value)));
    }
    const countryIds = uniqueBy(ids.map((id) => claimEntity(entities[id], "P17")).filter(Boolean), (item) => item);

    let countries = {};
    if (countryIds.length) {
      const countryUrl = new URL(WIKIDATA_API);
      countryUrl.searchParams.set("origin", "*");
      countryUrl.searchParams.set("format", "json");
      countryUrl.searchParams.set("action", "wbgetentities");
      countryUrl.searchParams.set("ids", countryIds.join("|"));
      countryUrl.searchParams.set("props", "labels|claims");
      countryUrl.searchParams.set("languages", "zh-hans|zh-cn|zh|en");
      countries = (await fetchJson(fetchImpl, countryUrl, { basic, deadlineAt })).entities || {};
    }

    const titleById = new Map(pageItems.map((item) => [item.pageprops.wikibase_item, item.title]));
    const result = ids.map((wikidataId) => {
      const entity = entities[wikidataId];
      const countryId = claimEntity(entity, "P17");
      const country = countries[countryId];
      const instance = claimEntity(entity, "P31");
      const entityTypeName = typeLabels.get(instance) || "";
      const hasCoordinates = Boolean(entity?.claims?.P625?.length);
      if (!entity || !countryId || wikidataId === countryId || instance === "Q6256" || !hasCoordinates || (!basic && !isDestinationEntityType(entityTypeName))) return null;
      const name = preferredChineseLabel(entity.labels);
      const sourceTitle = clean(entity.labels?.en?.value || titleById.get(wikidataId));
      const countryName = preferredChineseLabel(country?.labels);
      const countryCode = clean(claimText(country, "P297"));
      if (!hasChinese(name) || !hasChinese(countryName) || !countryCode) return null;
      return {
        wikidataId, name, sourceTitle, entityTypeName, countryWikidataId: countryId, countryCode, countryName,
        sourceUrl: `https://www.wikidata.org/wiki/${wikidataId}`,
      };
    }).filter(Boolean).slice(0, 20);
    if (cacheKey) cache.set(cacheKey, structuredClone(result));
    return result;
  };
}

function routeTheme(title, categories = []) {
  const text = `${title} ${categories.join(" ")}`.toLocaleLowerCase("en-US");
  if (/train|rail/.test(text)) return "铁路旅行";
  if (/pilgrim|temple/.test(text)) return "寺庙巡礼";
  if (/road|highway|driv/.test(text)) return "公路自驾";
  if (/walk|trail|hiking|trek/.test(text)) return "徒步旅行";
  if (/coast|seaside|ocean|island/.test(text)) return "海岸旅行";
  if (/heritage|historic|culture/.test(text)) return "文化旅行";
  return "经典旅行";
}

function routeName(page, countries, theme) {
  const chineseLink = (page.langlinks || []).find((item) => item.lang === "zh")?.title;
  if (chineseLink && chineseLink.length <= 20) return clean(chineseLink);
  if (/^Across .+ by train$/i.test(page.title) && countries.length === 1) return `乘火车穿越${countries[0].name}`;
  const region = countries.length === 1 ? countries[0].name : countries.slice(0, 3).map((item) => item.name).join("与");
  return `${region}${theme.replace(/旅行$/, "")}线`;
}

function duration(page, destinationCount) {
  const text = clean(page.extract);
  const range = text.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*days?\b/i);
  if (range) return { durationDays: Math.round((Number(range[1]) + Number(range[2])) / 2), recommendedDays: `${range[1]}-${range[2]}天`, estimated: false };
  const exact = text.match(/\b(\d{1,2})[ -]days?\b/i);
  if (exact) return { durationDays: Number(exact[1]), recommendedDays: `${exact[1]}天`, estimated: false };
  const days = Math.max(3, Math.min(21, destinationCount * 2));
  return { durationDays: days, recommendedDays: `约${days}天`, estimated: true };
}

function pageBannerTitle(page) {
  const content = clean(page?.revisions?.[0]?.slots?.main?.content || page?.revisions?.[0]?.content);
  return clean(content.match(/\{\{\s*pagebanner\s*\|\s*([^|}\n]+)/i)?.[1]);
}

function routeSearchTerms(page) {
  const text = clean(page.extract);
  const terms = [];
  const pattern = /(?:also known as|corresponds to)\s+(?:the\s+)?["“]?([^"”.,;\n]{3,80})/gi;
  for (const match of text.matchAll(pattern)) terms.push(clean(match[1]));
  return uniqueBy(terms.filter((term) => term.toLocaleLowerCase("en-US") !== clean(page.title).toLocaleLowerCase("en-US")), (item) => item.toLocaleLowerCase("en-US")).slice(0, 3);
}

function sourceRegions(page) {
  const titleRegion = clean(page.title).match(/^Across\s+(.+?)\s+by\s+/i)?.[1];
  const extract = clean(page.extract);
  const extractRegion = extract.match(/\bis\s+([A-Z][A-Za-z .'-]{2,40})['’]s\s+/)?.[1];
  const categoryRegions = (page.categories || []).map((item) => clean(item.title).replace(/^Category:/, ""))
    .map((item) => item.match(/^(.+?)\s+itineraries$/i)?.[1])
    .filter((item) => item && !/^(?:itineraries|asia|africa|europe|oceania|north america|south america|usable|guide|outline|star)$/i.test(item));
  return uniqueBy([titleRegion, extractRegion, ...categoryRegions].filter((item) => item && !/^(?:usable|guide|outline|star)$/i.test(item)), (item) => item.toLocaleLowerCase("en-US")).slice(0, 3);
}

function basicRouteName(page, theme) {
  const chineseLink = (page.langlinks || []).find((item) => item.lang === "zh")?.title;
  if (chineseLink && hasChinese(chineseLink) && chineseLink.length <= 24) return clean(chineseLink);
  const marker = clean(page.title).match(/\b\d{1,4}\b/)?.[0] || String(page.pageid);
  const base = theme === "铁路旅行" ? "铁路穿越线" : `${theme.replace(/旅行$/, "")}路线`;
  return `${base} · ${marker}`;
}

function basicCoverAsset(page, sourceUrl) {
  const thumbnail = page.thumbnail;
  const imageTitle = clean(page.pageimage);
  if (!thumbnail?.source || !imageTitle) return null;
  return {
    provider: "wikivoyage-pageimage",
    assetId: imageTitle.toLocaleLowerCase("en-US"),
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(imageTitle.replace(/ /g, "_"))}`,
    imageUrl: clean(thumbnail.source),
    author: "",
    license: "",
    width: Number(thumbnail.width) || 0,
    height: Number(thumbnail.height) || 0,
    discoveredVia: "route-pageimage",
    semanticScore: 1,
    metadataStatus: "pending",
    sourcePageUrl: sourceUrl,
  };
}

function standardizeBasicPage(page) {
  const sourceTitle = clean(page.title);
  if (!page.pageid || !sourceTitle) return null;
  if (/\bitineraries\s*$/i.test(sourceTitle) || /\b(?:route|itinerary)\s+(?:index|list)\b/i.test(sourceTitle) || /^list of .*(?:routes|itineraries)$/i.test(sourceTitle)) return null;
  const categories = (page.categories || []).map((item) => clean(item.title).replace(/^Category:/, ""));
  const theme = routeTheme(sourceTitle, categories);
  const sourceUrl = `https://en.wikivoyage.org/wiki/${encodeURIComponent(sourceTitle.replace(/ /g, "_"))}`;
  const regions = sourceRegions(page);
  const timing = duration(page, 3);
  const coverAsset = basicCoverAsset(page, sourceUrl);
  return {
    id: `wikivoyage-${page.pageid}`,
    name: basicRouteName(page, theme),
    canonicalTitle: basicRouteName(page, theme),
    sourceTitle,
    summary: `这是一条以${theme}为核心的 Wikivoyage 在线路线，可在详情中继续补全目的地信息。`,
    recommendationText: `适合希望快速了解${theme}方向、再按在线信息深入规划的人。`,
    countryEntities: regions.map((name) => ({ wikidataId: "", countryCode: "", name, sourceUrl })),
    destinationEntities: [],
    countries: regions,
    cities: [],
    destinations: [],
    ...timing,
    bestMonths: ["季节灵活"],
    themes: [theme],
    tags: [theme, "在线路线"],
    highlights: [`路线主题为${theme}`, "路线信息来自 Wikivoyage", "完整目的地将在详情中联网补全"],
    coverAsset,
    destinationAssets: [],
    routeBannerTitle: pageBannerTitle(page),
    routeImageTitle: imageTitleOrEmpty(page),
    routeSearchTerms: routeSearchTerms(page),
    enrichmentStatus: "basic",
    source: { name: "Wikivoyage", url: sourceUrl },
    provenance: {
      title: { provider: "Wikivoyage-derived", sourceUrl },
      countries: { provider: "Wikivoyage-derived", sourceUrl, status: regions.length ? "basic" : "deferred" },
      destinations: { provider: "Wikivoyage", sourceUrl, status: "deferred" },
      cover: { provider: "Wikivoyage pageimage", sourceUrl, status: coverAsset ? "basic" : "deferred" },
    },
  };
}

function imageTitleOrEmpty(page) { return clean(page.pageimage); }

export function createOnlineRouteStandardizer({ resolveLinkedEntities = createWikidataEntityResolver() } = {}) {
  return {
    async standardize(page, { preferredEntityId = "", preferredQuery = "", enrichmentMode = "full", deadlineAt = 0 } = {}) {
      const sourceTitle = clean(page.title);
      if (!page.pageid || !sourceTitle) return null;
      if (/\bitineraries\s*$/i.test(sourceTitle) || /\b(?:route|itinerary)\s+(?:index|list)\b/i.test(sourceTitle) || /^list of .*(?:routes|itineraries)$/i.test(sourceTitle)) return null;
      if (enrichmentMode === "basic") {
        const basicRecord = standardizeBasicPage(page);
        return basicRecord ? { ...basicRecord, preferredEntityId: preferredEntityId || "" } : null;
      }
      const normalizedQuery = clean(preferredQuery).toLocaleLowerCase("en-US");
      const preferredMentioned = Boolean(preferredEntityId && normalizedQuery && (
        clean(page.extract).toLocaleLowerCase("en-US").includes(normalizedQuery)
        || (page.links || []).some((item) => clean(item.title).toLocaleLowerCase("en-US") === normalizedQuery)
      ));
      const basic = false;
      const eligibleDestinations = uniqueBy(await resolveLinkedEntities(page, { extraEntityIds: preferredMentioned ? [preferredEntityId] : [], basic, deadlineAt }), (item) => item.wikidataId)
        .filter((item) => item.wikidataId !== item.countryWikidataId && hasChinese(item.name) && hasChinese(item.countryName) && isDestinationEntityType(item.entityTypeName));
      const preferredDestinations = eligibleDestinations.filter((item) => destinationPriority(item.entityTypeName) >= 2);
      const destinationPool = preferredDestinations.length >= 3 ? preferredDestinations : eligibleDestinations;
      const destinationEntities = [
        ...destinationPool.filter((item) => item.wikidataId === preferredEntityId),
        ...destinationPool.filter((item) => item.wikidataId !== preferredEntityId)
          .sort((left, right) => destinationPriority(right.entityTypeName) - destinationPriority(left.entityTypeName)),
      ].slice(0, 5);
      if (destinationEntities.length < 3) return null;
      const countryEntities = uniqueBy(destinationEntities.map((item) => ({
        wikidataId: item.countryWikidataId || `country:${item.countryCode}`,
        countryCode: item.countryCode,
        name: item.countryName,
        sourceUrl: item.countryWikidataId ? `https://www.wikidata.org/wiki/${item.countryWikidataId}` : "https://www.wikidata.org",
      })), (item) => item.countryCode);
      if (!countryEntities.length) return null;
      const categories = (page.categories || []).map((item) => clean(item.title).replace(/^Category:/, ""));
      const theme = routeTheme(sourceTitle, categories);
      const name = routeName(page, countryEntities, theme);
      const places = destinationEntities.map((item) => item.name);
      const timing = duration(page, places.length);
      const sourceUrl = `https://en.wikivoyage.org/wiki/${encodeURIComponent(sourceTitle.replace(/ /g, "_"))}`;
      return {
        id: `wikivoyage-${page.pageid}`,
        name,
        canonicalTitle: name,
        sourceTitle,
        summary: `路线串联${places.slice(0, 4).join("、")}${places.length > 4 ? "等目的地" : ""}，以${theme}为主要体验。`,
        recommendationText: `适合希望沿${places.slice(0, 3).join("、")}展开${theme}的人，建议根据在线交通与季节信息调整停留节奏。`,
        countryEntities,
        destinationEntities,
        countries: countryEntities.map((item) => item.name),
        cities: places,
        destinations: places,
        ...timing,
        bestMonths: ["季节灵活"],
        themes: [theme],
        tags: [theme, countryEntities.length > 1 ? "跨国路线" : "单国路线"],
        highlights: [
          `串联${places.slice(0, 3).join("、")}等主要目的地`,
          `路线主题为${theme}`,
          `${countryEntities.length > 1 ? `跨越${countryEntities.map((item) => item.name).join("、")}` : `集中体验${countryEntities[0].name}`}`,
        ],
        routeBannerTitle: pageBannerTitle(page),
        routeImageTitle: clean(page.pageimage),
        routeSearchTerms: routeSearchTerms(page),
        enrichmentStatus: basic ? "basic" : "enriched",
        source: { name: "Wikivoyage", url: sourceUrl },
        provenance: {
          title: { provider: "Wikivoyage/Wikidata", sourceUrl },
          countries: { provider: "Wikidata", sourceUrl: "https://www.wikidata.org" },
          destinations: { provider: "Wikivoyage/Wikidata", sourceUrl },
          duration: { provider: timing.estimated ? "derived-from-online-entities" : "Wikivoyage", sourceUrl },
        },
      };
    },
  };
}
