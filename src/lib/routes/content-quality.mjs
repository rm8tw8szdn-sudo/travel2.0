const GENERIC_TITLE = /^(?:经典|海岸|铁路(?:穿越)?|徒步|公路自驾|寺庙巡礼)(?:路线|线)?\s*[·-]?\s*\d+$/u;
const TEMPLATE_SUMMARY = /^适合|旅行灵感|深入规划/u;
const CHINESE = /[\u3400-\u9fff]/u;
const UNTRANSLATED = /[A-Za-z]{3,}|[\u3040-\u30ff]/u;
const DISABLED_COUNTRY_CODES = new Set(["CN"]);
const MONTH_RANGE = /^(?:1[0-2]|[1-9])(?:-(?:1[0-2]|[1-9]))?月$/u;

export function classifyRoute(entities) {
  const codes = new Set((entities || []).map((item) => item?.countryCode).filter(Boolean));
  return codes.size > 1 ? "cross" : codes.size === 1 ? "single" : "failed";
}

export function validateRouteContent(record, { minimumDestinations = null } = {}) {
  const reasons = [];
  const title = String(record?.name || record?.canonicalTitle || "").trim();
  const summary = String(record?.summary || "").trim();
  const recommendation = String(record?.recommendationText || "").trim();
  const copy = `${summary} ${recommendation}`.trim();
  const classification = classifyRoute(record?.countryEntities);
  const countryCodes = new Set((record?.countryEntities || []).map((item) => item?.countryCode).filter(Boolean));
  const travelStyle = String(record?.travelStyle || record?.travelStyleConceptKey || record?.concept?.travelStyle || record?.contentEvidence?.travelStyle || "").trim();
  const minDestinations = Number.isInteger(minimumDestinations)
    ? Math.max(1, minimumDestinations)
    : travelStyle === "city-break"
      ? 2
      : 3;
  if (!title || !CHINESE.test(title) || GENERIC_TITLE.test(title) || /[·-]\s*\d+$/u.test(title)) reasons.push("generic-title");
  if (!summary) reasons.push("missing-summary");
  if (!recommendation) reasons.push("missing-recommendation");
  if (!summary || !recommendation || !CHINESE.test(summary) || !CHINESE.test(recommendation) || TEMPLATE_SUMMARY.test(summary) || TEMPLATE_SUMMARY.test(recommendation)) reasons.push("template-summary");
  if (UNTRANSLATED.test(`${title} ${copy}`)) reasons.push("untranslated-copy");
  if (classification === "failed") reasons.push("missing-country-code", "classification-failed");
  if ([...countryCodes].some((code) => DISABLED_COUNTRY_CODES.has(code))) reasons.push("disabled-country");
  if ((record?.destinationEntities || []).some((item) => DISABLED_COUNTRY_CODES.has(item?.countryCode))) reasons.push("disabled-destination-country");
  if ((record?.destinationEntities || []).filter((item) => item?.name && item?.countryCode).length < minDestinations) reasons.push("missing-destinations");
  if ((record?.destinationEntities || []).some((item) => item?.countryCode && !countryCodes.has(item.countryCode))) reasons.push("destination-country-mismatch");
  if (!record?.recommendedDays || /^约6天$/u.test(record.recommendedDays)) reasons.push("default-duration");
  if (record?.recommendedDays && !/^约?\d+(?:-\d+)?天$/u.test(record.recommendedDays)) reasons.push("invalid-duration");
  if (!(record?.bestMonths || []).length || record.bestMonths.some((item) => item === "季节灵活" || item === "全年" || !MONTH_RANGE.test(item))) reasons.push("default-season");
  if ((record?.highlights || []).length < 3) reasons.push("missing-highlights");
  return { accepted: reasons.length === 0, classification, reasons: [...new Set(reasons)] };
}
