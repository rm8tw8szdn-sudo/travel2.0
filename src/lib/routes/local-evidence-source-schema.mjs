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
  { domain: "jr-hokkaido.co.jp", sourceType: "official-transport-operator", publisher: "Hokkaido Railway Company" },
  { domain: "jr-shikoku.co.jp", sourceType: "official-transport-operator", publisher: "Shikoku Railway Company" },
  { domain: "mlit.go.jp", sourceType: "government-transport-agency", publisher: "Ministry of Land, Infrastructure, Transport and Tourism" },
  { domain: "road-info-prvs.mlit.go.jp", sourceType: "government-transport-agency", publisher: "Ministry of Land, Infrastructure, Transport and Tourism" },
  { domain: "japan.travel", sourceType: "official-tourism-board", publisher: "Japan National Tourism Organization" },
  { domain: "visitjapan.jp", sourceType: "official-tourism-board", publisher: "Japan National Tourism Organization" },
  { domain: "visitkanazawa.jp", sourceType: "official-tourism-board", publisher: "Kanazawa City Tourism Association" },
  { domain: "kyoto.travel", sourceType: "official-tourism-board", publisher: "Kyoto City Official Travel Guide" },
  { domain: "osaka-info.jp", sourceType: "official-tourism-board", publisher: "Osaka Convention and Tourism Bureau" },
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
