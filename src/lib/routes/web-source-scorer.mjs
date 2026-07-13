const TRUSTED_DOMAINS = [
  // 通用知识源（Wikimedia 家族）
  "wikivoyage.org",
  "wikipedia.org",
  "wikidata.org",
  // 国际/官方机构
  "unesco.org",
  "nationalparks",
  // 国家官方旅游局（visit*/tourism*）
  "japan.travel",
  "myswitzerland.com",
  "visitnorway.com",
  "croatia.hr",
  "visitjapan.jp",
  "uk.travel",
  "visitbritain.com",
  "france.fr",
  "renfe.com", // 西班牙国铁
  "italia.it",
  // 官方交通运营（铁路/航空/渡轮）
  "sbb.ch", // 瑞士国铁
  "jr-central.co.jp",
  "jr-east.co.jp",
  "jr-west.co.jp",
  "jr-hokkaido.co.jp",
  "jr-shikoku.co.jp",
  "jr-kyushu.co.jp",
  "shinkansen.co.jp",
  "bahn.com", // 德国铁路
  "sncf-connect.com", // 法国国铁
  "trenitalia.com", // 意大利国铁
  "eurostar.com",
  "thalys.com",
  "obb.at", // 奥地利联邦铁路
  "southeasternrailway.co.uk",
  "nationalrail.co.uk",
  "avisit.com",
  // 渡轮/海岛
  "directferries.com",
  "attica.com",
];

const COMMERCIAL_PATTERNS = [
  /hotel/i,
  /booking/i,
  /discount/i,
  /deal/i,
  /airport transfer/i,
  /coupon/i,
];

function clean(value) {
  return String(value || "").trim();
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "").toLowerCase();
  } catch {
    return "";
  }
}

function isTrustedHost(host) {
  return TRUSTED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`) || host.includes(domain));
}

export function scoreWebSearchSource(result = {}) {
  const sourceUrl = clean(result.url || result.sourceUrl);
  const sourceTitle = clean(result.title || result.sourceTitle);
  const snippet = clean(result.snippet || result.sourceSnippet);
  const host = hostOf(sourceUrl);
  if (!sourceUrl) {
    return { sourceScore: 0, acceptedForExtraction: false, filterReason: "missing-source-url", host };
  }
  if (!sourceTitle || !snippet) {
    return { sourceScore: 0.1, acceptedForExtraction: false, filterReason: "missing-title-or-snippet", host };
  }
  if (COMMERCIAL_PATTERNS.some((pattern) => pattern.test(`${sourceUrl} ${sourceTitle} ${snippet}`))) {
    return { sourceScore: 0.2, acceptedForExtraction: false, filterReason: "commercial-or-booking-source", host };
  }
  const trusted = isTrustedHost(host);
  const official = /\.(gov|go|gouv)\./u.test(host) || /\.gov$/u.test(host);
  const sourceScore = trusted || official ? 0.9 : 0.55;
  return {
    sourceScore,
    acceptedForExtraction: sourceScore >= 0.45,
    filterReason: sourceScore >= 0.45 ? "" : "low-source-score",
    host,
  };
}
