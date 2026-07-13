const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php";
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";

function clean(value) { return String(value || "").replace(/<[^>]*>/g, " ").replace(/&[^;]+;/g, " ").trim().replace(/\s+/g, " "); }
function fileTitle(value) { const title = clean(value); return title ? (title.startsWith("File:") ? title : `File:${title}`) : ""; }
function normalized(value) { return clean(value).toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " "); }
function words(value) { return normalized(value).split(" ").filter((item) => item.length > 1); }
function rejection(page, reason) { return { assetId: clean(page?.title).replace(/^File:/, "").toLocaleLowerCase("en-US"), reason }; }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function providerUsable(asset) {
  const width = Number(asset?.width);
  const height = Number(asset?.height);
  const ratio = width / height;
  const dimensions = asset?.discoveredVia === "route-banner"
    ? width >= 1200 && height >= 180 && ratio >= 3 && ratio <= 10
    : width >= 800 && height >= 450 && ratio >= 1.2 && ratio <= 2.2;
  return Boolean(asset?.author && asset?.license && dimensions);
}

async function fetchWithRetry(fetchImpl, url, { deadlineAt = 0 } = {}) {
  let response;
  const bounded = Boolean(deadlineAt);
  const attempts = bounded ? 1 : 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const remainingMs = deadlineAt ? Math.max(1, deadlineAt - Date.now()) : 15_000;
      response = await fetchImpl(url, { headers: { "Api-User-Agent": "TravelCollectionRouteV2/2.0 (https://github.com/rm8tw8szdn-sudo/travel-collection)" }, signal: globalThis.AbortSignal?.timeout?.(Math.max(1, Math.min(bounded ? 5_000 : 15_000, remainingMs))) });
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await wait(250 * (attempt + 1));
      continue;
    }
    if (response.ok || (response.status !== 429 && response.status < 500)) return response;
    if (attempt < attempts - 1) {
      const retryAfter = Number(response.headers?.get?.("retry-after")) || 0;
      await wait(Math.min(30_000, Math.max(retryAfter * 1000, 500 * (attempt + 1))));
    }
  }
  return response;
}

function candidateFromPage(page, input, discoveredVia) {
  const info = page?.imageinfo?.[0];
  if (!info?.url || !info?.descriptionurl) return { candidate: null, rejection: rejection(page, "missing-source") };
  const metadata = info.extmetadata || {};
  const title = clean(page.title).replace(/^File:/, "");
  if (/\.(?:svg|gif|pdf|webm|ogv)$/i.test(title)) return { candidate: null, rejection: rejection(page, "unsupported-format") };
  if (/\b(?:logo|flag|map|diagram|portrait|airport|terminal|hotel|room|advert|poster|team|club|bandits|jersey)\b/i.test(title)) {
    return { candidate: null, rejection: rejection(page, "forbidden-subject") };
  }
  const destinationNames = (input.destinations || []).flatMap((item) => [item.name, item.sourceTitle]).filter(Boolean);
  if (input.scope === "route" && discoveredVia !== "route-banner" && destinationNames.some((name) => normalized(title).includes(normalized(name)))) {
    return { candidate: null, rejection: rejection(page, "single-destination-cover") };
  }
  const queryText = input.scope === "route"
    ? [input.sourceTitle, ...(input.routeSearchTerms || []), ...(input.destinations || []).map((item) => item.sourceTitle)].filter(Boolean).join(" ")
    : [input.name, input.sourceTitle, input.countryName, ...(input.themes || [])].join(" ");
  const queryWords = words(queryText);
  const evidence = normalized([title, metadata.ImageDescription?.value, metadata.Categories?.value].join(" "));
  const hits = queryWords.filter((word) => evidence.includes(word)).length;
  const semanticScore = queryWords.length ? hits / queryWords.length : 0;
  if (discoveredVia === "route-theme-search" && semanticScore === 0) return { candidate: null, rejection: rejection(page, "unrelated-to-query") };
  const assetId = clean(page.title).replace(/^File:/, "").toLocaleLowerCase("en-US");
  return { candidate: {
    provider: "wikimedia-commons",
    assetId,
    sourceUrl: info.descriptionurl,
    imageUrl: info.thumburl || info.url,
    author: clean(metadata.Artist?.value || metadata.Credit?.value),
    license: clean(metadata.LicenseShortName?.value || metadata.UsageTerms?.value),
    width: Number(info.thumbwidth || info.width) || 0,
    height: Number(info.thumbheight || info.height) || 0,
    createdAt: clean(metadata.DateTimeOriginal?.value || metadata.DateTime?.value),
    updatedAt: new Date().toISOString(),
    discoveredVia,
    semanticScore: discoveredVia === "route-banner" ? 1 : discoveredVia === "route-pageimage" ? Math.max(0.9, semanticScore) : semanticScore,
    scope: input.scope,
  }, rejection: null };
}

async function queryPages(fetchImpl, params, policy = {}) {
  const url = new URL(COMMONS_API);
  url.searchParams.set("origin", "*");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|extmetadata");
  url.searchParams.set("iiurlwidth", "1400");
  Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, String(value)));
  const response = await fetchWithRetry(fetchImpl, url, policy);
  if (!response.ok) return [];
  return (await response.json()).query?.pages || [];
}

async function destinationPageImage(fetchImpl, title, api = WIKIVOYAGE_API, policy = {}) {
  if (!title) return "";
  const url = new URL(api);
  url.searchParams.set("origin", "*");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "name");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("titles", title);
  const response = await fetchWithRetry(fetchImpl, url, policy);
  if (!response.ok) return "";
  return clean((await response.json()).query?.pages?.[0]?.pageimage);
}

export function createWikimediaImageProvider({ fetchImpl = globalThis.fetch } = {}) {
  return {
    name: "wikimedia-commons",
    async search(input) {
      const policy = { deadlineAt: input.deadlineAt || 0 };
      const candidates = [];
      const rejections = [];
      const collect = (pages, discoveredVia) => pages.forEach((page) => {
        const result = candidateFromPage(page, input, discoveredVia);
        if (result.candidate) candidates.push(result.candidate);
        if (result.rejection) rejections.push(result.rejection);
      });
      const identities = new Set(input.excludeAssetIdentities || []);
      const priority = { "route-banner": 5, "route-pageimage": 4, "destination-wikipedia-pageimage": 4, "destination-wikivoyage-pageimage": 3, "route-theme-search": 1, "destination-search": 1 };
      const result = () => ({ candidates: candidates
        .filter((item) => providerUsable(item) && !identities.has([item.provider, item.assetId, item.sourceUrl, item.imageUrl].join("|")))
        .sort((a, b) => (priority[b.discoveredVia] || 0) - (priority[a.discoveredVia] || 0) || b.semanticScore - a.semanticScore || a.assetId.localeCompare(b.assetId)), rejections });
      if (input.scope === "route" && input.routeBannerTitle) {
        const pages = await queryPages(fetchImpl, { titles: fileTitle(input.routeBannerTitle) }, policy);
        collect(pages, "route-banner");
        if (result().candidates.length) return result();
      }
      if (input.scope === "route" && input.routeImageTitle) {
        const pages = await queryPages(fetchImpl, { titles: fileTitle(input.routeImageTitle) }, policy);
        collect(pages, "route-pageimage");
        if (result().candidates.length) return result();
      }
      if (input.scope === "destination") {
        const title = input.sourceTitle || input.name;
        const wikipediaImage = await destinationPageImage(fetchImpl, title, WIKIPEDIA_API, policy);
        if (wikipediaImage) collect(await queryPages(fetchImpl, { titles: fileTitle(wikipediaImage) }, policy), "destination-wikipedia-pageimage");
        if (result().candidates.length) return result();
        const wikivoyageImage = await destinationPageImage(fetchImpl, title, WIKIVOYAGE_API, policy);
        if (wikivoyageImage) collect(await queryPages(fetchImpl, { titles: fileTitle(wikivoyageImage) }, policy), "destination-wikivoyage-pageimage");
        if (result().candidates.length) return result();
      }
      const query = input.scope === "destination"
        ? (input.sourceTitle || input.name)
        : (input.sourceTitle || input.name);
      const pages = await queryPages(fetchImpl, {
        generator: "search", gsrnamespace: "6", gsrlimit: "12", gsrsearch: query,
      }, policy);
      collect(pages, input.scope === "route" ? "route-theme-search" : "destination-search");
      if (input.scope === "route" && !result().candidates.length) {
        const routeContext = (input.destinations || []).map((item) => item.sourceTitle).filter(Boolean).slice(0, 2);
        for (const term of input.routeSearchTerms || []) {
          const contextQuery = [term, ...routeContext].join(" ");
          collect(await queryPages(fetchImpl, { generator: "search", gsrnamespace: "6", gsrlimit: "12", gsrsearch: contextQuery }, policy), "route-theme-search");
          if (result().candidates.length) return result();
        }
      }
      return result();
    },
  };
}
