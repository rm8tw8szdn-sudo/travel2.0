import { createWebEvidenceExtractor } from "./web-evidence-extractor.mjs";
import {
  classifyLocalEvidenceSource,
  normalizeLocalEvidenceSource,
  sha256EvidenceContent,
  validateLocalEvidenceSource,
} from "./local-evidence-source-schema.mjs";
import { normalizeRouteLegEvidence, validateRouteLegEvidence } from "./route-leg-evidence-schema.mjs";
import { normalizeSeasonEvidence, validateSeasonEvidence } from "./season-evidence-schema.mjs";
import { cleanString, uniqueStrings } from "./route-v2-utils.mjs";

const MONTH_NAMES = new Map([
  [1, ["january", "jan"]], [2, ["february", "feb"]], [3, ["march", "mar"]],
  [4, ["april", "apr"]], [5, ["may"]], [6, ["june", "jun"]],
  [7, ["july", "jul"]], [8, ["august", "aug"]], [9, ["september", "sep", "sept"]],
  [10, ["october", "oct"]], [11, ["november", "nov"]], [12, ["december", "dec"]],
]);

function clean(value) {
  return cleanString(value).replace(/\s+/gu, " ");
}

function normalizeText(value) {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("en-US");
}

function aliasesFor(entity = {}) {
  return uniqueStrings([
    entity.name,
    entity.canonicalNameEn,
    entity.canonicalNameZh,
    ...(Array.isArray(entity.aliases) ? entity.aliases : []),
  ]).filter((alias) => normalizeText(alias).length >= 2);
}

function firstAliasIndex(text, aliases = []) {
  const indexes = aliases.map((alias) => normalizeText(text).indexOf(normalizeText(alias))).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function sourceText(result = {}) {
  return clean(`${result.sourceTitle || result.title || ""}. ${result.sourceSnippet || result.snippet || result.content || ""}`);
}

function sourceSnippet(result = {}) {
  return clean(result.sourceDirection && result.sourceFactText
    ? result.sourceFactText
    : result.sourceSnippet || result.snippet || result.content);
}

function sourceExcerpt(result = {}) {
  return clean(result.sourceSnippet || result.snippet || result.content);
}

function addDuration(values, hours, minutes = 0) {
  const total = Math.round(Number(hours) * 60 + Number(minutes || 0));
  if (Number.isFinite(total) && total > 0 && total <= 24 * 60) values.add(total);
}

function durationValues(text) {
  const normalized = normalizeText(text);
  const values = new Set();
  let remaining = normalized.replace(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:(\d+)\s*(?:minutes?|mins?|min))?/gu, (_match, hours, minutes) => {
    addDuration(values, hours, minutes);
    return " ";
  });
  remaining = remaining.replace(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min)/gu, (_match, minutes) => {
    addDuration(values, 0, minutes);
    return " ";
  });
  return [...values].sort((left, right) => left - right);
}

function supportedDurationValues(result = {}, snippet = "") {
  const factText = clean(result.sourceFactText);
  const leadingAggregate = factText.match(/^\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)(?:\s*\d+\s*(?:minutes?|mins?|min))?/iu);
  return durationValues(leadingAggregate?.[0] || snippet);
}

function transportMode(text, fallback = "unknown") {
  if (/shinkansen|rail|train|limited express|nozomi|hikari|kodama/iu.test(text)) return "rail";
  if (/ferry|boat/iu.test(text)) return "ferry";
  if (/bus|road|highway|drive/iu.test(text)) return "road";
  if (/flight|airline|airport/iu.test(text)) return "air";
  return clean(fallback || "unknown").toLocaleLowerCase("en-US") || "unknown";
}

function transferCount(text) {
  if (/no (?:need to )?(?:change|transfer)|direct (?:train|service|connection)|without (?:a )?(?:change|transfer)/iu.test(text)) return 0;
  const one = text.match(/(?:one|1)\s+(?:change|transfer)/iu);
  return one ? 1 : null;
}

function frequencyLevel(text) {
  const perHour = text.match(/(?:up to\s*)?(\d+)\s+(?:trains?|services?)\s+per hour/iu);
  if (perHour) return Number(perHour[1]) >= 6 ? "high" : Number(perHour[1]) >= 2 ? "medium" : "low";
  if (/frequent|many trains|every \d+ minutes/iu.test(text)) return "high";
  if (/limited service|once daily|one train per day/iu.test(text)) return "low";
  return "unknown";
}

function expiresAt(retrievedAt, days = 180) {
  const value = Date.parse(retrievedAt);
  return Number.isFinite(value) ? new Date(value + days * 86_400_000).toISOString() : null;
}

function sourceForResult(result, supports, retrievedAt) {
  const url = clean(result.sourceUrl || result.url);
  const classification = classifyLocalEvidenceSource(url);
  const snippet = sourceSnippet(result);
  if (!classification || snippet.length < 24) return null;
  const content = sourceText(result);
  const source = normalizeLocalEvidenceSource({
    sourceType: classification.sourceType,
    url,
    publisher: classification.publisher,
    retrievedAt,
    supports,
    confidence: 0.9,
    contentHash: /^[a-f0-9]{64}$/u.test(clean(result.sourceContentHash))
      ? clean(result.sourceContentHash)
      : sha256EvidenceContent(content),
    factLocator: clean(result.sourceFactLocator || result.sourceTitle || result.title).slice(0, 240),
    factExcerpt: sourceExcerpt(result).slice(0, 600),
  });
  const validation = validateLocalEvidenceSource(source);
  return validation.accepted ? validation.source : null;
}

function mergeSources(existing = [], incoming = []) {
  const byId = new Map();
  for (const source of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const validation = validateLocalEvidenceSource(source);
    if (!validation.accepted) continue;
    const previous = byId.get(validation.source.sourceId);
    byId.set(validation.source.sourceId, previous ? {
      ...previous,
      supports: uniqueStrings([...previous.supports, ...validation.source.supports]),
      confidence: Math.max(previous.confidence, validation.source.confidence),
    } : validation.source);
  }
  return [...byId.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId, "en"));
}

function materialEvidenceRecord(value = {}) {
  const record = structuredClone(value);
  delete record.updatedAt;
  delete record.retrievedAt;
  delete record.expiresAt;
  record.sources = (record.sources || []).map((source) => {
    const next = { ...source };
    delete next.retrievedAt;
    return next;
  });
  return JSON.stringify(record);
}

function preserveIdempotentRecord(existing, next, validate) {
  if (materialEvidenceRecord(existing) !== materialEvidenceRecord(next)) return next;
  const validation = validate(existing);
  return validation.accepted ? validation.record : next;
}

function issue(field, reason) {
  return { field: clean(field), reason: clean(reason) };
}

function uniqueIssues(values = []) {
  const byKey = new Map();
  for (const value of values) {
    const normalized = issue(value?.field, value?.reason || value?.message);
    if (normalized.field && normalized.reason) byKey.set(`${normalized.field}|${normalized.reason}`, normalized);
  }
  return [...byKey.values()];
}

function relevantRouteLegResult(result, context = {}) {
  const snippet = sourceSnippet(result);
  const fromIndex = firstAliasIndex(snippet, aliasesFor(context.from));
  const toIndex = firstAliasIndex(snippet, aliasesFor(context.to));
  const verifiedDirection = clean(result.sourceDirection?.fromEntityId) === clean(context.record?.fromEntityId)
    && clean(result.sourceDirection?.toEntityId) === clean(context.record?.toEntityId);
  if (snippet.length < 24 || (!verifiedDirection && (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex))) return null;
  const explicitlyUnavailable = /no (?:direct )?(?:service|connection)|not connected|service (?:is )?(?:suspended|closed)/iu.test(snippet);
  const extractedDurations = result.sourceFactText ? [] : (() => {
    const extractor = createWebEvidenceExtractor({ now: () => context.retrievedAt });
    const extracted = extractor.extract({ query: context.query, results: [result], retrievedAt: context.retrievedAt });
    return extracted.evidence
      .filter((item) => item.evidenceType === "segment-metric")
      .map((item) => Number(item.value?.durationMinutes))
      .filter((value) => Number.isFinite(value) && value > 0);
  })();
  const durations = [...new Set([...supportedDurationValues(result, snippet), ...extractedDurations])].sort((left, right) => left - right);
  const supportedMode = transportMode(snippet, context.transportMode);
  const explicitlyConnected = /connects?|connected|service between|rapid service|express|travel(?:ing)? (?:from|between)|reach|arriv(?:e|es|ing)|runs? between|shinkansen|train|rail|ferry|bus|nozomi|hikari|kodama/iu.test(snippet)
    || (verifiedDirection && /\baccess\b/iu.test(snippet))
    || (verifiedDirection && durations.length > 0 && supportedMode !== "unknown");
  if (!explicitlyUnavailable && !explicitlyConnected) return null;
  return {
    result,
    feasible: !explicitlyUnavailable,
    durations,
    transportMode: supportedMode,
    transferCount: transferCount(snippet),
    frequencyLevel: frequencyLevel(snippet),
  };
}

function routeLegConflict(facts = [], record = {}) {
  const feasibility = new Set([
    ...facts.map((fact) => fact.feasible),
    ...(record.feasibilityStatus === "feasible" ? [true] : record.feasibilityStatus === "infeasible" ? [false] : []),
  ]);
  if (feasibility.size > 1) return "qualified-sources-disagree-on-directed-feasibility";
  const durationFacts = facts.filter((fact) => fact.durations.length > 0);
  const previousDurations = [record.durationMinMinutes, record.durationMaxMinutes].filter(Number.isFinite);
  const durations = [...previousDurations, ...durationFacts.flatMap((fact) => fact.durations)];
  if ((durationFacts.length >= 2 || (durationFacts.length >= 1 && previousDurations.length)) && durations.length >= 2) {
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    if (max - min >= 60) return "qualified-sources-have-materially-different-duration-ranges";
  }
  return "";
}

export function adaptRouteLegEvidenceResults({ record = {}, context = {}, results = [], retrievedAt } = {}) {
  const timestamp = clean(retrievedAt);
  const discoveredFacts = (Array.isArray(results) ? results : [])
    .map((result) => relevantRouteLegResult(result, { ...context, retrievedAt: timestamp }))
    .filter(Boolean);
  if (!discoveredFacts.length) {
    return { outcome: "needs-review", reason: "no-qualified-directed-transport-fact", record: structuredClone(record), sourceCount: 0 };
  }
  const qualified = discoveredFacts.map((fact) => ({
    fact,
    source: sourceForResult(
      fact.result,
      [
        `route-leg:${record.fromEntityId}>${record.toEntityId}:feasibility`,
        ...(fact.durations.length ? [`route-leg:${record.fromEntityId}>${record.toEntityId}:duration`] : []),
      ],
      timestamp,
    ),
  })).filter((entry) => entry.source);
  if (!qualified.length) {
    return { outcome: "pending", reason: "no-qualified-official-source", record: structuredClone(record), sourceCount: 0 };
  }
  const facts = qualified.map((entry) => entry.fact);
  const incomingSources = qualified.map((entry) => entry.source);
  const conflictReason = routeLegConflict(facts, record);
  const sources = mergeSources(record.sources, incomingSources);
  const durationValuesFound = [record.durationMinMinutes, record.durationMaxMinutes, ...facts.flatMap((fact) => fact.durations)].filter(Number.isFinite);
  const knownTransfers = [record.transferCount, ...facts.map((fact) => fact.transferCount)].filter(Number.isFinite);
  const frequencies = [record.frequencyLevel, ...facts.map((fact) => fact.frequencyLevel)].filter((value) => value && value !== "unknown");
  const feasibilityValues = new Set(facts.map((fact) => fact.feasible));
  const unknowns = [];
  if (!durationValuesFound.length || conflictReason) unknowns.push(issue("duration", conflictReason || "Qualified source did not state a reusable duration."));
  if (!knownTransfers.length) unknowns.push(issue("transferCount", "Qualified source did not state a transfer count."));
  if (!frequencies.length) unknowns.push(issue("frequencyLevel", "Qualified source did not state a reusable service frequency."));
  const next = normalizeRouteLegEvidence({
    ...record,
    transportMode: record.transportMode === "unknown"
      ? facts.find((fact) => fact.transportMode !== "unknown")?.transportMode || "unknown"
      : record.transportMode,
    feasibilityStatus: conflictReason ? "needs-evidence" : feasibilityValues.has(true) ? "feasible" : "infeasible",
    durationMinMinutes: conflictReason || !durationValuesFound.length ? null : Math.min(...durationValuesFound),
    durationMaxMinutes: conflictReason || !durationValuesFound.length ? null : Math.max(...durationValuesFound),
    transferCount: knownTransfers.length && !conflictReason ? Math.min(...knownTransfers) : null,
    frequencyLevel: frequencies[0] || "unknown",
    sources,
    sourceRefs: sources.map((source) => source.sourceId),
    confidence: conflictReason ? 0.5 : Math.min(...sources.map((source) => source.confidence)),
    freshnessStatus: "fresh",
    retrievedAt: timestamp,
    expiresAt: expiresAt(timestamp),
    unknowns,
    conflicts: uniqueIssues([
      ...(Array.isArray(record.conflicts) ? record.conflicts : []),
      ...(conflictReason ? [issue("routeLeg", conflictReason)] : []),
    ]),
    diagnostics: uniqueIssues(record.diagnostics),
    updatedAt: timestamp,
  }, { now: () => timestamp });
  const validation = validateRouteLegEvidence(next);
  if (!validation.accepted) return { outcome: "failed", reason: "route-leg-evidence-schema-invalid", reasons: validation.reasons, record: null, sourceCount: sources.length };
  const stableRecord = preserveIdempotentRecord(record, validation.record, validateRouteLegEvidence);
  const incomplete = stableRecord.feasibilityStatus === "feasible"
    && (stableRecord.durationMinMinutes == null || stableRecord.durationMaxMinutes == null);
  return {
    outcome: conflictReason || incomplete ? "needs-review" : "resolved",
    reason: conflictReason || (incomplete ? "qualified-source-missing-duration" : "qualified-route-leg-evidence"),
    record: stableRecord,
    sourceCount: sources.length,
  };
}

function monthMentioned(text, month) {
  const normalized = normalizeText(text);
  if (new RegExp(`(?:^|\\D)${month}(?:st|nd|rd|th)?\\s*(?:month|月)(?:\\D|$)`, "iu").test(text)) return true;
  return (MONTH_NAMES.get(Number(month)) || []).some((name) => new RegExp(`\\b${name}\\b`, "iu").test(normalized));
}

function relevantSeasonResult(result, context = {}) {
  const text = sourceText(result);
  const snippet = sourceSnippet(result);
  if (snippet.length < 24 || firstAliasIndex(text, aliasesFor(context.entity)) < 0 || !monthMentioned(text, context.month)) return null;
  const weather = [];
  const transport = [];
  const closure = [];
  if (/heavy snow|plenty of snow|snowfall|snow can fall|snow-covered|snowy|icy|ice-covered|freezing|blizzard|大雪|積雪/iu.test(snippet)) weather.push("snow-or-ice-risk");
  if (/delay|speed restriction|winter tires?|snow chains?|service suspension|suspended service|preventive road closure|通行止|速度規制/iu.test(snippet)) transport.push("winter-transport-disruption-risk");
  if (/seasonal(?:ly)? closed|winter closure|closed (?:in|during)|closure|通行止/iu.test(snippet)) closure.push("seasonal-or-weather-closure-risk");
  const openYearRound = /open year[- ]round|remains open|no (?:seasonal )?closure/iu.test(snippet);
  const bufferMatch = snippet.match(/(?:allow|add|plan for)\s+(?:an additional|an extra|extra)?\s*(\d+)\s*(?:minutes?|mins?)/iu);
  const recommendedBufferMinutes = bufferMatch ? Number(bufferMatch[1]) : null;
  if (!weather.length && !transport.length && !closure.length && !openYearRound && recommendedBufferMinutes == null) return null;
  return { result, weather, transport, closure, openYearRound, recommendedBufferMinutes };
}

export function adaptSeasonEvidenceResults({ record = {}, context = {}, results = [], retrievedAt } = {}) {
  const timestamp = clean(retrievedAt);
  const discoveredFacts = (Array.isArray(results) ? results : [])
    .map((result) => relevantSeasonResult(result, { ...context, month: record.month }))
    .filter(Boolean);
  if (!discoveredFacts.length) {
    return { outcome: "needs-review", reason: "no-qualified-season-hard-risk", record: structuredClone(record), sourceCount: 0 };
  }
  const qualified = discoveredFacts.map((fact) => ({
    fact,
    source: sourceForResult(
      fact.result,
      [
        ...(fact.weather.length ? [`season:${record.entityId}:${record.month}:weather-risk`] : []),
        ...(fact.transport.length ? [`season:${record.entityId}:${record.month}:transport-risk`] : []),
        ...(fact.closure.length || fact.openYearRound ? [`season:${record.entityId}:${record.month}:closure-status`] : []),
        ...(fact.recommendedBufferMinutes != null ? [`season:${record.entityId}:${record.month}:transport-buffer`] : []),
      ],
      timestamp,
    ),
  })).filter((entry) => entry.source);
  if (!qualified.length) {
    return { outcome: "pending", reason: "no-qualified-official-source", record: structuredClone(record), sourceCount: 0 };
  }
  const facts = qualified.map((entry) => entry.fact);
  const incomingSources = qualified.map((entry) => entry.source);
  const hasClosure = facts.some((fact) => fact.closure.length > 0);
  const hasOpen = facts.some((fact) => fact.openYearRound);
  const conflictReason = hasClosure && hasOpen ? "qualified-sources-disagree-on-seasonal-closure" : "";
  const sources = mergeSources(record.sources, incomingSources);
  const buffers = [record.recommendedBufferMinutes, ...facts.map((fact) => fact.recommendedBufferMinutes)].filter(Number.isFinite);
  const weatherRisks = uniqueStrings([...(record.weatherRisks || []), ...facts.flatMap((fact) => fact.weather)]);
  const transportRisks = uniqueStrings([...(record.transportRisks || []), ...facts.flatMap((fact) => fact.transport)]);
  const closureRisks = uniqueStrings([...(record.closureRisks || []), ...facts.flatMap((fact) => fact.closure)]);
  const next = normalizeSeasonEvidence({
    ...record,
    suitabilityStatus: "unknown",
    weatherRisks,
    transportRisks,
    closureRisks,
    recommendedBufferMinutes: buffers.length && !conflictReason ? Math.max(...buffers) : null,
    sources,
    sourceRefs: sources.map((source) => source.sourceId),
    confidence: conflictReason ? 0.5 : Math.min(...sources.map((source) => source.confidence)),
    freshnessStatus: "fresh",
    retrievedAt: timestamp,
    expiresAt: expiresAt(timestamp),
    unknowns: [issue("seasonSuitability", "Evidence 3B records hard risks only and does not infer a best travel month.")],
    conflicts: uniqueIssues([
      ...(Array.isArray(record.conflicts) ? record.conflicts : []),
      ...(conflictReason ? [issue("seasonality", conflictReason)] : []),
    ]),
    diagnostics: uniqueIssues(record.diagnostics),
    updatedAt: timestamp,
  }, { now: () => timestamp });
  const validation = validateSeasonEvidence(next);
  if (!validation.accepted) return { outcome: "failed", reason: "season-evidence-schema-invalid", reasons: validation.reasons, record: null, sourceCount: sources.length };
  const stableRecord = preserveIdempotentRecord(record, validation.record, validateSeasonEvidence);
  return {
    outcome: conflictReason ? "needs-review" : "resolved",
    reason: conflictReason || "qualified-season-hard-risk-evidence",
    record: stableRecord,
    sourceCount: sources.length,
  };
}
