import crypto from "node:crypto";

import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const LOCAL_EVIDENCE_SOURCE_TYPES = new Set([
  "official-transport-operator",
  "government-transport-agency",
  "official-tourism-board",
  "official-city-transport",
  "approved-high-trust-source",
]);

const TRUSTED_SOURCE_DOMAINS = Object.freeze([
  { domain: "global.jr-central.co.jp", sourceType: "official-transport-operator", publisher: "Central Japan Railway Company" },
  { domain: "jr-central.co.jp", sourceType: "official-transport-operator", publisher: "Central Japan Railway Company" },
  { domain: "jreast.co.jp", sourceType: "official-transport-operator", publisher: "East Japan Railway Company" },
  { domain: "jr-east.co.jp", sourceType: "official-transport-operator", publisher: "East Japan Railway Company" },
  { domain: "westjr.co.jp", sourceType: "official-transport-operator", publisher: "West Japan Railway Company" },
  { domain: "jr-west.co.jp", sourceType: "official-transport-operator", publisher: "West Japan Railway Company" },
  { domain: "jr-kyushu.co.jp", sourceType: "official-transport-operator", publisher: "Kyushu Railway Company" },
  { domain: "jrkyushu.co.jp", sourceType: "official-transport-operator", publisher: "Kyushu Railway Company" },
  { domain: "jr-hokkaido.co.jp", sourceType: "official-transport-operator", publisher: "Hokkaido Railway Company" },
  { domain: "jrhokkaido.co.jp", sourceType: "official-transport-operator", publisher: "Hokkaido Railway Company" },
  { domain: "jr-shikoku.co.jp", sourceType: "official-transport-operator", publisher: "Shikoku Railway Company" },
  { domain: "mlit.go.jp", sourceType: "government-transport-agency", publisher: "Ministry of Land, Infrastructure, Transport and Tourism" },
  { domain: "road-info-prvs.mlit.go.jp", sourceType: "government-transport-agency", publisher: "Ministry of Land, Infrastructure, Transport and Tourism" },
  { domain: "japan.travel", sourceType: "official-tourism-board", publisher: "Japan National Tourism Organization" },
  { domain: "visitjapan.jp", sourceType: "official-tourism-board", publisher: "Japan National Tourism Organization" },
  { domain: "visitkanazawa.jp", sourceType: "official-tourism-board", publisher: "Kanazawa City Tourism Association" },
  { domain: "kyoto.travel", sourceType: "official-tourism-board", publisher: "Kyoto City Official Travel Guide" },
  { domain: "osaka-info.jp", sourceType: "official-tourism-board", publisher: "Osaka Convention and Tourism Bureau" },
  { domain: "straeto.is", sourceType: "official-transport-operator", publisher: "Strætó bs." },
  { domain: "railway.co.th", sourceType: "official-transport-operator", publisher: "State Railway of Thailand" },
  { domain: "sbb.ch", sourceType: "official-transport-operator", publisher: "Swiss Federal Railways" },
  { domain: "airnewzealand.co.nz", sourceType: "official-transport-operator", publisher: "Air New Zealand" },
  { domain: "transportnsw.info", sourceType: "government-transport-agency", publisher: "Transport for NSW" },
  { domain: "info.korail.com", sourceType: "official-transport-operator", publisher: "Korea Railroad Corporation" },
  { domain: "trenitalia.com", sourceType: "official-transport-operator", publisher: "Trenitalia" },
  { domain: "trenord.it", sourceType: "official-transport-operator", publisher: "Trenord" },
  { domain: "sncf-connect.com", sourceType: "official-transport-operator", publisher: "SNCF Connect" },
  { domain: "renfe.com", sourceType: "official-transport-operator", publisher: "Renfe" },
  { domain: "euskotren.eus", sourceType: "official-transport-operator", publisher: "Euskotren" },
  { domain: "visitkorea.or.kr", sourceType: "official-tourism-board", publisher: "Korea Tourism Organization" },
  { domain: "airport.co.kr", sourceType: "government-transport-agency", publisher: "Korea Airports Corporation" },
  { domain: "vedur.is", sourceType: "approved-high-trust-source", publisher: "Icelandic Meteorological Office" },
  { domain: "tmd.go.th", sourceType: "approved-high-trust-source", publisher: "Thai Meteorological Department" },
  { domain: "meteoswiss.admin.ch", sourceType: "approved-high-trust-source", publisher: "Federal Office of Meteorology and Climatology MeteoSwiss" },
  { domain: "niwa.co.nz", sourceType: "approved-high-trust-source", publisher: "Earth Sciences New Zealand" },
  { domain: "bom.gov.au", sourceType: "approved-high-trust-source", publisher: "Australian Bureau of Meteorology" },
  { domain: "data.jma.go.jp", sourceType: "approved-high-trust-source", publisher: "Japan Meteorological Agency" },
  { domain: "protezionecivile.gov.it", sourceType: "approved-high-trust-source", publisher: "Italian Civil Protection Department" },
  { domain: "meteofrance.com", sourceType: "approved-high-trust-source", publisher: "Meteo-France" },
  { domain: "aemet.es", sourceType: "approved-high-trust-source", publisher: "AEMET" },
  { domain: "kma.go.kr", sourceType: "approved-high-trust-source", publisher: "Korea Meteorological Administration" },
  { domain: "bahn.de", sourceType: "official-transport-operator", publisher: "Deutsche Bahn AG" },
  { domain: "oebb.at", sourceType: "official-transport-operator", publisher: "Österreichische Bundesbahnen" },
  { domain: "cp.pt", sourceType: "official-transport-operator", publisher: "CP – Comboios de Portugal" },
  { domain: "hellenictrain.gr", sourceType: "official-transport-operator", publisher: "Hellenic Train" },
  { domain: "ktelargolida.gr", sourceType: "official-transport-operator", publisher: "KTEL Argolidas" },
  { domain: "ktel-fokidas.gr", sourceType: "official-transport-operator", publisher: "KTEL Fokidas" },
  { domain: "ktel-trikala.gr", sourceType: "official-transport-operator", publisher: "KTEL Trikala" },
  { domain: "aegeanair.com", sourceType: "official-transport-operator", publisher: "AEGEAN Airlines" },
  { domain: "e-ktel.com", sourceType: "official-transport-operator", publisher: "KTEL Chania-Rethymno" },
  { domain: "ns.nl", sourceType: "official-transport-operator", publisher: "Nederlandse Spoorwegen" },
  { domain: "dwd.de", sourceType: "approved-high-trust-source", publisher: "Deutscher Wetterdienst" },
  { domain: "geosphere.at", sourceType: "approved-high-trust-source", publisher: "GeoSphere Austria" },
  { domain: "ipma.pt", sourceType: "approved-high-trust-source", publisher: "Instituto Português do Mar e da Atmosfera" },
  { domain: "emy.gr", sourceType: "approved-high-trust-source", publisher: "Hellenic National Meteorological Service" },
  { domain: "knmi.nl", sourceType: "approved-high-trust-source", publisher: "Royal Netherlands Meteorological Institute" },
]);

function clean(value) {
  return cleanString(value);
}

function hostOf(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== "https:") return "";
    return url.hostname.replace(/^www\./u, "").toLocaleLowerCase("en-US");
  } catch {
    return "";
  }
}

function validIsoDate(value) {
  return Boolean(clean(value) && Number.isFinite(Date.parse(value)));
}

export function sha256EvidenceContent(value) {
  return crypto.createHash("sha256").update(clean(value)).digest("hex");
}

export function classifyLocalEvidenceSource(url) {
  const host = hostOf(url);
  if (!host) return null;
  const match = TRUSTED_SOURCE_DOMAINS.find((entry) => host === entry.domain || host.endsWith(`.${entry.domain}`));
  return match ? { ...match, host } : null;
}

export function createLocalEvidenceSourceId(input = {}) {
  return `les-${stableHash({
    url: clean(input.url),
    contentHash: clean(input.contentHash),
    sourceType: clean(input.sourceType),
  }).slice(0, 20)}`;
}

export function normalizeLocalEvidenceSource(input = {}) {
  const classification = classifyLocalEvidenceSource(input.url);
  const normalized = {
    sourceId: clean(input.sourceId),
    sourceType: clean(input.sourceType || classification?.sourceType),
    url: clean(input.url),
    publisher: clean(input.publisher || classification?.publisher),
    retrievedAt: clean(input.retrievedAt),
    supports: uniqueStrings(Array.isArray(input.supports) ? input.supports : []),
    confidence: Number(input.confidence),
    contentHash: clean(input.contentHash),
    factLocator: clean(input.factLocator).slice(0, 240),
    factExcerpt: clean(input.factExcerpt).slice(0, 600),
  };
  normalized.sourceId = normalized.sourceId || createLocalEvidenceSourceId(normalized);
  return normalized;
}

export function validateLocalEvidenceSource(input = {}) {
  const reasons = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { accepted: false, reasons: ["local-evidence-source-not-object"] };
  }
  const source = normalizeLocalEvidenceSource(input);
  const classification = classifyLocalEvidenceSource(source.url);
  if (!classification) reasons.push("local-evidence-source-untrusted-or-not-https");
  if (!LOCAL_EVIDENCE_SOURCE_TYPES.has(source.sourceType)) reasons.push("local-evidence-sourceType-invalid");
  if (classification && source.sourceType !== classification.sourceType) reasons.push("local-evidence-sourceType-mismatch");
  if (classification && source.publisher !== classification.publisher) reasons.push("local-evidence-publisher-mismatch");
  if (!source.publisher) reasons.push("local-evidence-publisher-required");
  if (!validIsoDate(source.retrievedAt)) reasons.push("local-evidence-retrievedAt-invalid");
  if (!source.supports.length) reasons.push("local-evidence-supports-required");
  if (!Number.isFinite(source.confidence) || source.confidence < 0 || source.confidence > 1) reasons.push("local-evidence-confidence-invalid");
  if (!/^[a-f0-9]{64}$/u.test(source.contentHash)) reasons.push("local-evidence-contentHash-invalid");
  if (source.factLocator && source.factLocator.length > 240) reasons.push("local-evidence-factLocator-too-long");
  if (source.factExcerpt && source.factExcerpt.length > 600) reasons.push("local-evidence-factExcerpt-too-long");
  if (source.sourceId !== createLocalEvidenceSourceId(source)) reasons.push("local-evidence-sourceId-mismatch");
  return { accepted: reasons.length === 0, reasons, source: structuredClone(source) };
}

export function normalizeLocalEvidenceSources(values = []) {
  const byId = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const validation = validateLocalEvidenceSource(value);
    if (!validation.accepted) continue;
    byId.set(validation.source.sourceId, validation.source);
  }
  return [...byId.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId, "en"));
}

export function validateLocalEvidenceSources(values = []) {
  const reasons = [];
  if (!Array.isArray(values)) return { accepted: false, reasons: ["local-evidence-sources-array-required"], sources: [] };
  const sources = [];
  const seenIds = new Set();
  values.forEach((value, index) => {
    const validation = validateLocalEvidenceSource(value);
    if (!validation.accepted) {
      reasons.push(...validation.reasons.map((reason) => `sources[${index}]:${reason}`));
      return;
    }
    if (seenIds.has(validation.source.sourceId)) {
      reasons.push(`sources[${index}]:local-evidence-source-duplicate`);
      return;
    }
    seenIds.add(validation.source.sourceId);
    sources.push(validation.source);
  });
  return { accepted: reasons.length === 0, reasons, sources: structuredClone(sources) };
}
