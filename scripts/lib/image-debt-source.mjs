const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "travel2-route-v2-image-debt/1.0 (https://github.com/rm8tw8szdn-sudo/travel2.0)";
const APPROVED_LICENSE = /^(?:CC0|CC BY(?:-SA)?(?: |$)|Public domain|Public Domain Mark)/iu;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const clean = (value) => String(value || "").normalize("NFKC").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();

function apiUrl(endpoint, parameters) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ format: "json", origin: "*", ...parameters });
  return url;
}

export async function fetchResponse(url, { attempt = 0, maxAttempts = 6, timeoutMs = 20_000 } = {}) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : Math.min(16_000, 700 * 2 ** attempt));
    return fetchResponse(url, { attempt: attempt + 1, maxAttempts, timeoutMs });
  }
  if (!response.ok) throw new Error(`remote-fetch-failed:${response.status}:${new URL(url).hostname}`);
  return response;
}

async function fetchJson(url) {
  return fetchResponse(url).then((response) => response.json());
}

export async function fetchWikidataEntities(qids) {
  const result = {};
  const unique = [...new Set(qids)].filter((qid) => /^Q\d+$/u.test(qid));
  for (let index = 0; index < unique.length; index += 50) {
    const payload = await fetchJson(apiUrl(WIKIDATA_API, {
      action: "wbgetentities",
      ids: unique.slice(index, index + 50).join("|"),
      props: "claims|labels",
      languages: "en",
    }));
    Object.assign(result, payload.entities || {});
    await sleep(80);
  }
  return result;
}

export async function fetchWikidataRecoveryEntities(qids) {
  const result = {};
  const unique = [...new Set(qids)].filter((qid) => /^Q\d+$/u.test(qid));
  for (let index = 0; index < unique.length; index += 50) {
    const payload = await fetchJson(apiUrl(WIKIDATA_API, {
      action: "wbgetentities",
      ids: unique.slice(index, index + 50).join("|"),
      props: "claims|labels|aliases|sitelinks",
      languages: "en|de|es|fr|it|pt|ru|ja|zh|ar|id|tr|pl|nl|el",
    }));
    Object.assign(result, payload.entities || {});
    await sleep(80);
  }
  return result;
}

export function preferredP18(entity, expectedQid) {
  if (!entity || entity.id !== expectedQid) return null;
  const claims = (entity.claims?.P18 || []).filter((claim) => claim?.rank !== "deprecated" && clean(claim?.mainsnak?.datavalue?.value));
  const claim = claims.find((candidate) => candidate.rank === "preferred") || claims[0];
  return claim ? {
    fileTitle: clean(claim.mainsnak.datavalue.value),
    semanticProof: "wikidata-exact-entity-p18",
    semanticStatementId: clean(claim.id),
  } : null;
}

function qidFromSnak(snak) {
  const numericId = snak?.datavalue?.value?.["numeric-id"];
  return Number.isInteger(numericId) ? `Q${numericId}` : null;
}

export async function exactStructuredDepictsCandidates(qid) {
  const payload = await fetchJson(apiUrl(COMMONS_API, {
    action: "query",
    generator: "search",
    gsrsearch: `haswbstatement:P180=${qid}`,
    gsrnamespace: "6",
    gsrlimit: "10",
    prop: "info",
  }));
  const pages = Object.values(payload.query?.pages || {}).filter((page) => /^File:/u.test(page.title || "")).sort((left, right) => left.pageid - right.pageid);
  const mediaInfoIds = pages.map((page) => `M${page.pageid}`);
  const mediaInfo = mediaInfoIds.length ? await fetchJson(apiUrl(COMMONS_API, {
    action: "wbgetentities",
    ids: mediaInfoIds.join("|"),
    props: "claims",
  })) : { entities: {} };
  const verified = [];
  for (const page of pages) {
    const mediaInfoId = `M${page.pageid}`;
    const entity = mediaInfo.entities?.[mediaInfoId];
    const statement = (entity?.claims?.P180 || []).find((claim) => claim?.rank !== "deprecated" && qidFromSnak(claim.mainsnak) === qid);
    if (statement) verified.push({
      fileTitle: page.title.replace(/^File:/u, ""),
      semanticProof: "commons-structured-data-exact-p180",
      semanticStatementId: clean(statement.id),
      mediaInfoId,
    });
  }
  return verified;
}

function stringClaimValues(entity, property) {
  return (entity?.claims?.[property] || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => clean(claim?.mainsnak?.datavalue?.value))
    .filter(Boolean);
}

function wikipediaApi(siteKey) {
  const language = siteKey.replace(/wiki$/u, "");
  return /^[-a-z]+$/u.test(language) ? `https://${language}.wikipedia.org/w/api.php` : null;
}

export function recoveryIdentityMetadata(entity) {
  const labels = Object.values(entity?.labels || {}).map((entry) => clean(entry?.value)).filter(Boolean);
  const aliases = Object.values(entity?.aliases || {}).flatMap((entries) => entries.map((entry) => clean(entry?.value))).filter(Boolean);
  const sitelinks = Object.entries(entity?.sitelinks || {})
    .filter(([site, link]) => site.endsWith("wiki") && site !== "commonswiki" && clean(link?.title) && wikipediaApi(site))
    .map(([site, link]) => ({ site, language: site.replace(/wiki$/u, ""), title: clean(link.title), url: clean(link.url) || null }));
  return {
    labels: [...new Set(labels)],
    aliases: [...new Set(aliases)],
    sitelinks,
    commonsCategories: [...new Set([
      ...stringClaimValues(entity, "P373"),
      ...(entity?.sitelinks?.commonswiki?.title?.startsWith("Category:")
        ? [clean(entity.sitelinks.commonswiki.title).replace(/^Category:/u, "")]
        : []),
    ])],
    officialWebsites: [...new Set(stringClaimValues(entity, "P856").map(normalizeHttps).filter(Boolean))],
  };
}

const WIKIPEDIA_PRIORITY = ["en", "es", "de", "fr", "pt", "it", "ru", "ja", "zh", "ar", "id", "tr", "pl", "nl", "el"];

export async function multilingualWikipediaLeadCandidates({ qid, wikidataEntity, limit = 8 }) {
  const metadata = recoveryIdentityMetadata(wikidataEntity);
  const links = [...metadata.sitelinks].sort((left, right) => {
    const leftIndex = WIKIPEDIA_PRIORITY.indexOf(left.language);
    const rightIndex = WIKIPEDIA_PRIORITY.indexOf(right.language);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) || left.site.localeCompare(right.site, "en");
  }).slice(0, limit);
  const resolved = await Promise.all(links.map(async (link) => {
    const endpoint = wikipediaApi(link.site);
    try {
      const payload = await fetchJson(apiUrl(endpoint, {
        action: "query",
        titles: link.title,
        prop: "pageimages|pageprops",
        piprop: "name|original",
        pithumbsize: "1600",
        ppprop: "wikibase_item",
        redirects: "1",
      }));
      const page = Object.values(payload.query?.pages || {})[0];
      const linkedQid = clean(page?.pageprops?.wikibase_item);
      const fileTitle = clean(page?.pageimage);
      const identityUrl = link.url || `https://${link.language}.wikipedia.org/wiki/${encodeURIComponent(link.title.replaceAll(" ", "_"))}`;
      if (linkedQid !== qid) {
        return { attempt: { sourcePath: "wikipedia-multilingual", queryIdentity: `${link.site}:${link.title}`, candidateUrl: identityUrl, candidateFile: fileTitle || null, status: "rejected", reasonCode: "ENTITY_AMBIGUOUS", reasonDetail: `page-qid:${linkedQid || "missing"}` }, candidate: null };
      } else if (!fileTitle) {
        return { attempt: { sourcePath: "wikipedia-multilingual", queryIdentity: `${link.site}:${link.title}`, candidateUrl: identityUrl, candidateFile: null, status: "rejected", reasonCode: "NO_EXACT_IMAGE", reasonDetail: "qid-linked-page-has-no-lead-image" }, candidate: null };
      } else {
        return { attempt: { sourcePath: "wikipedia-multilingual", queryIdentity: `${link.site}:${link.title}`, candidateUrl: identityUrl, candidateFile: fileTitle, status: "candidate", reasonCode: null, reasonDetail: "exact-qid-linked-page-lead-image" }, candidate: { fileTitle, semanticProof: "wikipedia-qid-linked-lead-image", semanticStatementId: `${link.site}:${link.title}`, mediaInfoId: null, sourcePath: "wikipedia-multilingual", sourceLanguage: link.language, identityUrl } };
      }
    } catch (error) {
      return { attempt: { sourcePath: "wikipedia-multilingual", queryIdentity: `${link.site}:${link.title}`, candidateUrl: link.url, candidateFile: null, status: "rejected", ...classifySourceError(error) }, candidate: null };
    }
  }));
  const candidates = resolved.map((entry) => entry.candidate).filter(Boolean);
  const attempts = resolved.map((entry) => entry.attempt);
  return { candidates, attempts, sitelinksChecked: links.length };
}

export async function commonsCategoryCandidates({ qid, wikidataEntity, entityType, limitPerCategory = 24 }) {
  const categories = recoveryIdentityMetadata(wikidataEntity).commonsCategories.slice(0, 3);
  const categoryQueries = categories.flatMap((category) => [
    { category, sort: "timestamp", direction: "descending", sourcePath: "commons-qid-linked-category" },
    { category, sort: "sortkey", direction: "ascending", sourcePath: "commons-qid-linked-category-alphabetic" },
  ]);
  const resolved = await Promise.all(categoryQueries.map(async ({ category, sort, direction, sourcePath }) => {
    try {
      const payload = await fetchJson(apiUrl(COMMONS_API, {
        action: "query",
        list: "categorymembers",
        cmtitle: `Category:${category}`,
        cmnamespace: "6",
        cmtype: "file",
        cmlimit: String(limitPerCategory),
        cmsort: sort,
        cmdir: direction,
      }));
      const files = (payload.query?.categorymembers || [])
        .map((entry) => clean(entry.title).replace(/^File:/u, ""))
        .filter((title) => /\.(?:jpe?g|png|webp|tiff?)$/iu.test(title));
      return { attempt: { sourcePath, queryIdentity: `${qid}:Category:${category}:${sort}`, candidateUrl: `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(category.replaceAll(" ", "_"))}`, candidateFile: files[0] || null, candidateCount: files.length, status: files.length ? "candidate-set" : "rejected", reasonCode: files.length ? null : "NO_EXACT_IMAGE", reasonDetail: files.length ? `qid-linked-category-files:${sort}` : `qid-linked-category-has-no-bitmap-files:${sort}` }, candidates: files.map((fileTitle) => ({
        fileTitle,
        semanticProof: entityType === "City" ? "commons-qid-linked-category-city-representative" : "commons-qid-linked-category-exact-poi",
        semanticStatementId: `${qid}:P373:${category}`,
        mediaInfoId: null,
        sourcePath,
        category,
      })) };
    } catch (error) {
      return { attempt: { sourcePath, queryIdentity: `${qid}:Category:${category}:${sort}`, candidateUrl: `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(category.replaceAll(" ", "_"))}`, candidateFile: null, status: "rejected", ...classifySourceError(error) }, candidates: [] };
    }
  }));
  const candidates = resolved.flatMap((entry) => entry.candidates);
  const attempts = resolved.map((entry) => entry.attempt);
  if (!categories.length) attempts.push({ sourcePath: "commons-qid-linked-category", queryIdentity: `${qid}:P373`, candidateUrl: `https://www.wikidata.org/wiki/${qid}`, candidateFile: null, status: "rejected", reasonCode: "NO_EXACT_IMAGE", reasonDetail: "qid-has-no-exact-commons-category" });
  return { candidates, attempts, categoriesChecked: categories.length };
}

export async function officialSourceAttempts({ qid, wikidataEntity }) {
  const websites = recoveryIdentityMetadata(wikidataEntity).officialWebsites.slice(0, 2);
  if (!websites.length) return [{ sourcePath: "official-source", queryIdentity: `${qid}:P856`, candidateUrl: `https://www.wikidata.org/wiki/${qid}`, candidateFile: null, status: "rejected", reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: "no-exact-entity-official-website" }];
  const attempts = await Promise.all(websites.map(async (website) => {
    try {
      const response = await fetchResponse(website, { maxAttempts: 0, timeoutMs: 5_000 });
      const body = String(await response.text()).slice(0, 250_000);
      const hasOpenLicense = /creativecommons\.org\/licenses\/(?:by|by-sa|zero)|public domain/iu.test(body);
      return { sourcePath: "official-source", queryIdentity: `${qid}:P856`, candidateUrl: website, candidateFile: null, status: "rejected", reasonCode: hasOpenLicense ? "NO_EXACT_IMAGE" : "LICENSE_UNVERIFIED", reasonDetail: hasOpenLicense ? "official-page-open-license-found-but-no-file-level-exact-candidate" : "official-page-has-no-file-level-reuse-license" };
    } catch (error) {
      return { sourcePath: "official-source", queryIdentity: `${qid}:P856`, candidateUrl: website, candidateFile: null, status: "rejected", ...classifySourceError(error) };
    }
  }));
  return attempts;
}

export async function openverseSourceAttempts({ record, limit = 3 }) {
  const query = record.entityType === "City"
    ? `${record.canonicalNameEn} ${record.countryNameEn}`
    : `${record.canonicalNameEn} ${record.parentCityNameEn || ""} ${record.countryNameEn}`.trim();
  const endpoint = new URL("https://api.openverse.org/v1/images/");
  endpoint.search = new URLSearchParams({ q: query, license: "cc0,by,by-sa,pdm", page_size: String(limit) });
  try {
    const payload = await fetchJson(endpoint);
    const results = (payload.results || []).slice(0, limit);
    if (!results.length) return [{ sourcePath: "openverse", queryIdentity: query, candidateUrl: endpoint.href, candidateFile: null, status: "rejected", reasonCode: "NO_EXACT_IMAGE", reasonDetail: "no-open-license-search-result" }];
    return results.map((result) => ({
      sourcePath: "openverse",
      queryIdentity: query,
      candidateUrl: normalizeHttps(result.foreign_landing_url) || normalizeHttps(result.detail_url) || endpoint.href,
      candidateFile: clean(result.title) || null,
      creator: clean(result.creator) || null,
      license: clean(result.license) || null,
      licenseUrl: normalizeHttps(result.license_url),
      status: "rejected",
      reasonCode: "ENTITY_AMBIGUOUS",
      reasonDetail: "aggregated-search-result-not-sufficient-exact-entity-proof",
    }));
  } catch (error) {
    return [{ sourcePath: "openverse", queryIdentity: query, candidateUrl: endpoint.href, candidateFile: null, status: "rejected", ...classifySourceError(error) }];
  }
}

export async function exactImageCandidates({ qid, wikidataEntity }) {
  const primary = preferredP18(wikidataEntity, qid);
  if (primary) return [primary];
  return exactStructuredDepictsCandidates(qid);
}

function normalizeHttps(value) {
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

export async function commonsImageInfo(fileTitle, width = 1600) {
  const payload = await fetchJson(apiUrl(COMMONS_API, {
    action: "query",
    titles: `File:${fileTitle}`,
    prop: "imageinfo",
    iiprop: "url|size|mime|mediatype|sha1|extmetadata",
    iiurlwidth: String(width),
  }));
  const page = Object.values(payload.query?.pages || {})[0];
  const info = page?.missing !== undefined ? null : page?.imageinfo?.[0];
  if (!info) return { accepted: false, reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: "commons-imageinfo-missing" };
  const license = clean(info.extmetadata?.LicenseShortName?.value);
  const presentationProblem = disallowedVisualPresentation({
    fileTitle,
    objectName: info.extmetadata?.ObjectName?.value,
    description: info.extmetadata?.ImageDescription?.value,
  });
  if (presentationProblem) return { accepted: false, reasonCode: "IMAGE_TOO_LOW_QUALITY", reasonDetail: presentationProblem };
  if (!APPROVED_LICENSE.test(license)) return { accepted: false, reasonCode: "LICENSE_UNVERIFIED", reasonDetail: license || "license-missing" };
  if (info.mediatype !== "BITMAP" || !/^image\/(?:jpeg|png|webp|tiff)$/iu.test(clean(info.mime))) {
    return { accepted: false, reasonCode: "IMAGE_TOO_LOW_QUALITY", reasonDetail: `unsupported-media:${info.mediatype || "missing"}:${info.mime || "missing"}` };
  }
  if (Number(info.width || 0) < 640 || Number(info.height || 0) < 360) {
    return { accepted: false, reasonCode: "IMAGE_TOO_LOW_QUALITY", reasonDetail: `source-dimensions:${info.width || 0}x${info.height || 0}` };
  }
  const thumbnailUrl = normalizeHttps(info.thumburl);
  const descriptionUrl = normalizeHttps(info.descriptionurl);
  const originalUrl = normalizeHttps(info.url);
  if (!thumbnailUrl || !descriptionUrl || !originalUrl) return { accepted: false, reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: "commons-url-incomplete" };
  const licenseUrl = normalizeHttps(info.extmetadata?.LicenseUrl?.value) || canonicalCommonsLicenseUrl(license, descriptionUrl);
  return {
    accepted: true,
    fileTitle,
    sourceUrl: descriptionUrl,
    downloadUrl: thumbnailUrl,
    originalUrl,
    sourcePlatform: "Wikimedia Commons",
    originalFileSha1: clean(info.sha1),
    sourceWidth: Number(info.width || 0),
    sourceHeight: Number(info.height || 0),
    thumbnailWidth: Number(info.thumbwidth || 0),
    thumbnailHeight: Number(info.thumbheight || 0),
    mime: clean(info.mime),
    author: clean(info.extmetadata?.Artist?.value) || null,
    creator: clean(info.extmetadata?.Artist?.value) || null,
    attribution: clean(info.extmetadata?.Credit?.value) || null,
    license,
    licenseUrl,
    description: clean(info.extmetadata?.ImageDescription?.value) || null,
    objectName: clean(info.extmetadata?.ObjectName?.value) || null,
  };
}

function canonicalCommonsLicenseUrl(license, descriptionUrl) {
  const normalized = clean(license).toLowerCase();
  if (normalized === "cc0") return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (normalized === "cc by-sa 3.0") return "https://creativecommons.org/licenses/by-sa/3.0/";
  if (normalized === "cc by-sa 4.0") return "https://creativecommons.org/licenses/by-sa/4.0/";
  if (normalized === "cc by 3.0") return "https://creativecommons.org/licenses/by/3.0/";
  if (normalized === "cc by 4.0") return "https://creativecommons.org/licenses/by/4.0/";
  if (normalized === "public domain") return `${descriptionUrl}#Licensing`;
  return null;
}

export function disallowedVisualPresentation({ fileTitle, objectName, description } = {}) {
  const text = clean(`${fileTitle || ""} ${objectName || ""} ${description || ""}`);
  if (/(?:^|[^a-z])(montage|collage|photocollage|photomontage|montaje|kolaż|kollage|коллаж)(?:[^a-z]|$)/iu.test(text)) return "disallowed-collage-or-montage";
  if (/(?:^|[^a-z])(locator map|location map|map of|mapa|diagram|screenshot|coat of arms|flag of|bandera|escudo|blason|crest|emblem|logo|poster)(?:[^a-z]|$)/iu.test(text)) return "disallowed-non-photographic-presentation";
  return null;
}

export function classifySourceError(error) {
  const message = clean(error?.message || error);
  return { reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: message || "source-request-failed" };
}
