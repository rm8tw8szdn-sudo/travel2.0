import { envFlag } from "./route-v2-env.mjs";
import { cleanString, uniqueStrings } from "./route-v2-utils.mjs";
import {
  normalizeEvidenceBundle,
  validateEvidenceBundle,
} from "./evidence-bundle.mjs";
import { isRouteV2EvidenceBundleEnabled } from "./evidence-bundle-store.mjs";

export const ROUTE_V2_EVIDENCE_ONLINE_FLAG = "ROUTE_V2_EVIDENCE_ONLINE_ENABLED";
export const ROUTE_V2_TAVILY_EVIDENCE_FLAG = "ROUTE_V2_TAVILY_EVIDENCE_ENABLED";
export const ROUTE_V2_WIKIVOYAGE_EVIDENCE_FLAG = "ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED";
export const ONLINE_EVIDENCE_ADAPTER_SOURCE = "route-v2-phase3c1-online-evidence-adapter";

const ONLINE_EVIDENCE_CREATED_AT = "1970-01-01T00:00:00.000Z";
const MAX_QUERIES_PER_CANDIDATE = 12;
const TARGET_FIELDS = new Set(["transportFeasibility", "seasonalFit"]);
const TRANSPORT_TYPES = new Set(["transport-connection", "segment-metric", "route-network"]);
const SEASON_TYPES = new Set(["destination-season", "climate-window"]);

export function isRouteV2EvidenceOnlineEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_EVIDENCE_ONLINE_FLAG, false);
}

export function isRouteV2TavilyEvidenceEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_TAVILY_EVIDENCE_FLAG, false);
}

export function isRouteV2WikivoyageEvidenceEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_WIKIVOYAGE_EVIDENCE_FLAG, false);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function destinationId(destination = {}) {
  return cleanString(destination.wikidataId || destination.qid || destination.id || destination.name);
}

function destinationName(destination = {}) {
  return cleanString(destination.name || destination.label || destination.id || destination.wikidataId);
}

function destinationAliasesFor(destination = {}) {
  return [
    destination.id,
    destination.wikidataId,
    destination.qid,
    destination.name,
    destination.label,
  ].map((value) => cleanString(value).toLowerCase()).filter(Boolean);
}

function candidateDestinationAliases(candidate = {}) {
  const aliases = new Map();
  for (const destination of candidate.destinations || []) {
    const canonicalId = destinationId(destination).toLowerCase();
    if (!canonicalId) continue;
    for (const text of destinationAliasesFor(destination)) {
      if (!aliases.has(text)) aliases.set(text, canonicalId);
    }
  }
  return aliases;
}

function candidateSeasonTokens(candidate = {}) {
  const tokens = new Set();
  for (const destination of candidate.destinations || []) {
    for (const value of [
      destination.id,
      destination.wikidataId,
      destination.qid,
      destination.name,
      destination.label,
    ]) {
      const text = cleanString(value).toLowerCase();
      if (text) tokens.add(text);
    }
  }
  for (const code of candidate.countries || []) {
    const text = cleanString(code).toLowerCase();
    if (text) tokens.add(text);
  }
  return tokens;
}

function candidateAdjacentPairs(candidate = {}) {
  const aliases = candidateDestinationAliases(candidate);
  const ordered = orderedDestinations(candidate);
  const pairs = new Set();
  for (let index = 1; index < ordered.length; index += 1) {
    const left = aliases.get(destinationId(ordered[index - 1]).toLowerCase())
      || aliases.get(destinationName(ordered[index - 1]).toLowerCase());
    const right = aliases.get(destinationId(ordered[index]).toLowerCase())
      || aliases.get(destinationName(ordered[index]).toLowerCase());
    if (!left || !right || left === right) continue;
    pairs.add(`${left}=>${right}`);
    pairs.add(`${right}=>${left}`);
  }
  return { aliases, pairs };
}

function destinationByAlias(candidate = {}) {
  const aliases = new Map();
  for (const destination of candidate.destinations || []) {
    for (const value of [
      destination.id,
      destination.wikidataId,
      destination.qid,
      destination.name,
      destination.label,
    ]) {
      const text = cleanString(value).toLowerCase();
      if (text && !aliases.has(text)) aliases.set(text, destination);
    }
  }
  return aliases;
}

function orderedDestinations(candidate = {}) {
  const aliasMap = destinationByAlias(candidate);
  const destinations = Array.isArray(candidate.destinations) ? candidate.destinations : [];
  const order = Array.isArray(candidate.proposedOrder) ? candidate.proposedOrder : [];
  const resolved = order
    .map((id) => aliasMap.get(cleanString(id).toLowerCase()))
    .filter(Boolean);
  if (resolved.length >= 2) return resolved;
  return destinations;
}

function queryRecord({ query = "", targetField = "", queryType = "", subject = "", object = "" } = {}) {
  return {
    query: cleanString(query),
    targetField,
    queryType,
    subject: cleanString(subject),
    object: cleanString(object),
  };
}

export function buildOnlineEvidenceQueries({ candidate = {} } = {}) {
  const queries = [];
  const ordered = orderedDestinations(candidate);
  for (let index = 1; index < ordered.length; index += 1) {
    const from = ordered[index - 1];
    const to = ordered[index];
    const fromName = destinationName(from);
    const toName = destinationName(to);
    if (!fromName || !toName) continue;
    queries.push(queryRecord({
      query: `${fromName} to ${toName} train ferry bus distance time official`,
      targetField: "transportFeasibility",
      queryType: "transport",
      subject: fromName,
      object: toName,
    }));
  }

  const seenNames = new Set();
  for (const destination of ordered) {
    const name = destinationName(destination);
    if (!name || seenNames.has(name.toLowerCase())) continue;
    seenNames.add(name.toLowerCase());
    queries.push(queryRecord({
      query: `${name} best months season climate travel`,
      targetField: "seasonalFit",
      queryType: "season",
      subject: name,
    }));
  }

  for (const country of candidate.countries || []) {
    const code = cleanString(country);
    if (!code) continue;
    queries.push(queryRecord({
      query: `${code} best months season climate travel`,
      targetField: "seasonalFit",
      queryType: "season",
      subject: code,
    }));
  }

  const unique = [];
  const seen = new Set();
  for (const item of queries) {
    const key = item.query.toLowerCase();
    if (!item.query || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= MAX_QUERIES_PER_CANDIDATE) break;
  }
  return unique;
}

function enabledProviders({ providers = {}, env = process.env } = {}) {
  const list = [];
  if (isRouteV2TavilyEvidenceEnabled(env)) {
    list.push({ providerKey: "tavily", provider: providers.tavily || null });
  }
  if (isRouteV2WikivoyageEvidenceEnabled(env)) {
    list.push({ providerKey: "wikivoyage", provider: providers.wikivoyage || null });
  }
  return list;
}

function providerConfigured(provider) {
  if (!provider?.searchEvidence) return false;
  if (provider.capabilities && provider.capabilities.configured === false) return false;
  return true;
}

function diagnostic({
  providerId = "",
  query = "",
  targetField = "",
  status = "failed",
  reason = "",
  sourceCount = 0,
  error = "",
} = {}) {
  return {
    providerId: cleanString(providerId),
    query: cleanString(query),
    targetField,
    status,
    reason: cleanString(reason),
    sourceCount: Number(sourceCount) || 0,
    error: cleanString(error),
  };
}

function sourceUrlOf(item = {}) {
  return cleanString(item.provenance?.sourceUrl || item.sourceUrl);
}

function sourceCountOf(item = {}) {
  const sources = Array.isArray(item.qualifiers?.corroboratingSources)
    ? item.qualifiers.corroboratingSources
    : [sourceUrlOf(item)].filter(Boolean);
  return uniqueStrings(sources).length;
}

function factName(value = {}) {
  return cleanString(value.name || value.entityId || value.id);
}

function evidenceMatchesTransportCandidate(item = {}, candidate = {}) {
  const { aliases, pairs } = candidateAdjacentPairs(candidate);
  const subject = factName(item.subject).toLowerCase();
  const object = factName(item.object).toLowerCase();
  if (!subject || !object) return false;
  const subjectId = aliases.get(subject);
  const objectId = aliases.get(object);
  if (!subjectId || !objectId) return false;
  return pairs.has(`${subjectId}=>${objectId}`);
}

function evidenceMatchesSeasonCandidate(item = {}, candidate = {}) {
  const tokens = candidateSeasonTokens(candidate);
  const subject = factName(item.subject).toLowerCase();
  return Boolean(subject && tokens.has(subject));
}

function evidenceMatchesCandidate(item = {}, candidate = {}, targetField = "") {
  if (targetField === "transportFeasibility") return evidenceMatchesTransportCandidate(item, candidate);
  if (targetField === "seasonalFit") return evidenceMatchesSeasonCandidate(item, candidate);
  return false;
}

function targetFieldForEvidence(item = {}) {
  if (TRANSPORT_TYPES.has(item.evidenceType)) return "transportFeasibility";
  if (SEASON_TYPES.has(item.evidenceType)) return "seasonalFit";
  return "";
}

function categoryForTarget(targetField) {
  if (targetField === "transportFeasibility") return "transport-feasibility";
  if (targetField === "seasonalFit") return "seasonal-fit";
  return "";
}

function decisionsForTarget(targetField) {
  if (targetField === "transportFeasibility") return ["transport-feasibility", "route-order-feasibility"];
  if (targetField === "seasonalFit") return ["seasonal-fit"];
  return [];
}

function structuredFacts(item = {}, providerId = "", sourceCount = 0) {
  const facts = {
    subject: factName(item.subject),
    object: factName(item.object),
    providerId,
    sourceCount,
  };
  if (Array.isArray(item.value)) facts.transportModes = item.value.map(cleanString).filter(Boolean);
  if (typeof item.value === "string") facts.network = cleanString(item.value);
  if (item.value && typeof item.value === "object" && !Array.isArray(item.value)) {
    if (Number.isFinite(Number(item.value.distanceKm))) facts.distanceKm = Number(item.value.distanceKm);
    if (Number.isFinite(Number(item.value.durationMinutes))) facts.durationMinutes = Number(item.value.durationMinutes);
    if (cleanString(item.value.metricType)) facts.metricType = cleanString(item.value.metricType);
  }
  if (SEASON_TYPES.has(item.evidenceType)) {
    facts.months = Array.isArray(item.value) ? item.value.map(cleanString).filter(Boolean) : [cleanString(item.value)].filter(Boolean);
  }
  return Object.fromEntries(Object.entries(facts).filter(([, value]) => (
    Array.isArray(value) ? value.length > 0 : value !== "" && value != null
  )));
}

function toEvidenceBundleItem(item = {}, { candidate = {}, providerId = "" } = {}) {
  const targetField = targetFieldForEvidence(item);
  if (!targetField || !evidenceMatchesCandidate(item, candidate, targetField)) return null;
  const sourceUrl = sourceUrlOf(item);
  const sourceCount = sourceCountOf(item);
  const facts = structuredFacts(item, providerId, sourceCount);
  if (!sourceUrl || Object.keys(facts).length <= 2) return null;
  const corroborated = item.qualifiers?.corroborated === true && sourceCount >= 2;
  return {
    status: corroborated ? "verified" : "weak_signal",
    sourceType: "online-evidence",
    sourceId: cleanString(item.evidenceId || item.id),
    sourceUrl,
    evidenceCategory: categoryForTarget(targetField),
    extractedFacts: facts,
    supportsWhichDecision: decisionsForTarget(targetField),
    confidence: Math.min(0.95, Math.max(0.35, Number(item.confidence) || (corroborated ? 0.82 : 0.58))),
    freshness: cleanString(item.retrievedAt || item.verifiedAt),
    matchMethod: corroborated ? "multi-source-corroborated-online-evidence" : "single-source-online-evidence",
    targetField,
  };
}

function stripAdapterOnlyFields(item = {}) {
  const cloneItem = { ...item };
  delete cloneItem.targetField;
  return cloneItem;
}

function removeUnknownsForVerifiedFields(unknowns = [], verifiedFields = new Set()) {
  return (Array.isArray(unknowns) ? unknowns : [])
    .filter((entry) => !verifiedFields.has(cleanString(entry.field)));
}

function addFailuresForUnresolvedFields({ failures = [], baseUnknowns = [], attemptedFields = new Set(), resolvedFields = new Set(), weakFields = new Set(), reason = "no-result" } = {}) {
  const output = [...(Array.isArray(failures) ? failures : [])];
  const unknownFields = new Set((Array.isArray(baseUnknowns) ? baseUnknowns : [])
    .map((entry) => cleanString(entry.field))
    .filter((field) => TARGET_FIELDS.has(field)));
  for (const field of attemptedFields) {
    if (resolvedFields.has(field) || weakFields.has(field)) continue;
    if (!unknownFields.has(field)) continue;
    output.push({
      field,
      reason,
      sourceType: "online-evidence",
      evidenceCategory: field === "transportFeasibility" ? "transport-feasibility" : "seasonal-fit",
      supportsWhichDecision: field,
    });
  }
  return output;
}

function removeFailedUnknowns(unknowns = [], failedFields = new Set()) {
  return (Array.isArray(unknowns) ? unknowns : [])
    .filter((entry) => !failedFields.has(cleanString(entry.field)));
}

async function searchWithTimeout(provider, request, timeoutMs) {
  if (!Number.isFinite(Number(timeoutMs)) || Number(timeoutMs) <= 0) {
    return provider.searchEvidence(request);
  }
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(Object.assign(new Error("online-evidence-timeout"), { name: "AbortError" })), Number(timeoutMs));
  });
  return Promise.race([provider.searchEvidence(request), timeoutPromise]);
}

export async function enrichEvidenceBundleWithOnlineEvidence({
  candidate = {},
  baseBundle = {},
  providers = {},
  extractor = null,
  corroborator = null,
  env = process.env,
  now = () => ONLINE_EVIDENCE_CREATED_AT,
  timeoutMs = 0,
} = {}) {
  const baseClone = clone(baseBundle);
  const diagnostics = [];
  const resolvedFields = [];

  function safeReturn(extra = {}) {
    return {
      enabled: Boolean(extra.enabled),
      attempted: Boolean(extra.attempted),
      bundle: extra.bundle || baseClone,
      resolvedFields: extra.resolvedFields || resolvedFields,
      diagnostics: extra.diagnostics || diagnostics,
    };
  }

  if (!isRouteV2EvidenceBundleEnabled(env)) {
    return safeReturn({ enabled: false, attempted: false });
  }
  if (!isRouteV2EvidenceOnlineEnabled(env)) {
    return safeReturn({ enabled: false, attempted: false });
  }
  const providerEntries = enabledProviders({ providers, env });
  if (!providerEntries.length) {
    diagnostics.push(diagnostic({ status: "skipped", reason: "provider-not-configured" }));
    return safeReturn({ enabled: false, attempted: false });
  }

  const baseValidation = validateEvidenceBundle(baseBundle);
  if (candidate.candidateId !== baseBundle.candidateId || candidate.intentId !== baseBundle.intentId) {
    diagnostics.push(diagnostic({ status: "failed", reason: "candidate-bundle-id-mismatch", error: "" }));
    return safeReturn({ enabled: true, attempted: false });
  }
  if (!baseValidation.accepted) {
    diagnostics.push(diagnostic({ status: "failed", reason: "base-bundle-invalid", error: baseValidation.reasons.join(",") }));
    return safeReturn({ enabled: true, attempted: false });
  }
  const queries = buildOnlineEvidenceQueries({ candidate });
  if (!queries.length) return safeReturn({ enabled: true, attempted: false });

  const onlineItems = [];
  const attemptedFields = new Set();
  let anyProviderConfigured = false;

  for (const entry of providerEntries) {
    const providerId = cleanString(entry.provider?.providerId || entry.providerKey);
    if (!providerConfigured(entry.provider)) {
      diagnostics.push(diagnostic({ providerId, status: "skipped", reason: "provider-not-configured" }));
      continue;
    }
    anyProviderConfigured = true;
    for (const query of queries) {
      attemptedFields.add(query.targetField);
      let searchPayload;
      try {
        searchPayload = await searchWithTimeout(entry.provider, {
          query: query.query,
          limit: 5,
        }, timeoutMs);
      } catch (error) {
        const timedOut = error?.name === "AbortError" || /timeout/i.test(error?.message || "");
        diagnostics.push(diagnostic({
          providerId,
          query: query.query,
          targetField: query.targetField,
          status: "failed",
          reason: timedOut ? "timeout" : "provider-error",
          error: error?.message || String(error),
        }));
        continue;
      }
      const results = Array.isArray(searchPayload?.results) ? searchPayload.results : [];
      if (!results.length) {
        diagnostics.push(diagnostic({
          providerId,
          query: query.query,
          targetField: query.targetField,
          status: "failed",
          reason: "no-result",
        }));
        continue;
      }
      let extracted;
      try {
        extracted = extractor?.extract
          ? extractor.extract({ query: query.query, results, retrievedAt: searchPayload?.retrievedAt || now() })
          : { evidence: [] };
      } catch (error) {
        diagnostics.push(diagnostic({
          providerId,
          query: query.query,
          targetField: query.targetField,
          status: "failed",
          reason: "parse-failed",
          sourceCount: results.length,
          error: error?.message || String(error),
        }));
        continue;
      }
      if (!extracted || !Array.isArray(extracted.evidence)) {
        diagnostics.push(diagnostic({
          providerId,
          query: query.query,
          targetField: query.targetField,
          status: "failed",
          reason: "parse-failed",
          sourceCount: results.length,
        }));
        continue;
      }
      let corroborated;
      try {
        corroborated = corroborator?.corroborate
          ? corroborator.corroborate(extracted.evidence)
          : { evidence: extracted.evidence, diagnostics: [] };
      } catch (error) {
        diagnostics.push(diagnostic({
          providerId,
          query: query.query,
          targetField: query.targetField,
          status: "failed",
          reason: "parse-failed",
          sourceCount: results.length,
          error: error?.message || String(error),
        }));
        continue;
      }
      const candidateItems = (corroborated.evidence || [])
        .map((item) => toEvidenceBundleItem(item, { candidate, providerId }))
        .filter(Boolean)
        .filter((item) => item.targetField === query.targetField);
      if (!candidateItems.length) {
        diagnostics.push(diagnostic({
          providerId,
          query: query.query,
          targetField: query.targetField,
          status: "failed",
          reason: "parse-failed",
          sourceCount: results.length,
        }));
        continue;
      }
      onlineItems.push(...candidateItems);
      const verified = candidateItems.some((item) => item.status === "verified");
      diagnostics.push(diagnostic({
        providerId,
        query: query.query,
        targetField: query.targetField,
        status: verified ? "resolved" : "weak_signal",
        reason: verified ? "corroborated" : "single-source",
        sourceCount: Math.max(...candidateItems.map((item) => Number(item.extractedFacts.sourceCount) || 1)),
      }));
    }
  }

  if (!anyProviderConfigured) {
    return safeReturn({ enabled: false, attempted: false });
  }

  const verifiedFields = new Set(onlineItems.filter((item) => item.status === "verified").map((item) => item.targetField));
  const weakFields = new Set(onlineItems.filter((item) => item.status === "weak_signal").map((item) => item.targetField));
  const unresolvedFields = new Set([...attemptedFields].filter((field) => !verifiedFields.has(field) && !weakFields.has(field)));

  const baseUnknowns = Array.isArray(baseBundle.unknowns) ? clone(baseBundle.unknowns) : [];
  const unknownsAfterVerified = removeUnknownsForVerifiedFields(baseUnknowns, verifiedFields);
  const failures = addFailuresForUnresolvedFields({
    failures: Array.isArray(baseBundle.failures) ? clone(baseBundle.failures) : [],
    baseUnknowns,
    attemptedFields,
    resolvedFields: verifiedFields,
    weakFields,
    reason: "no-result",
  });
  const failedUnknownFields = new Set(failures
    .map((failure) => cleanString(failure.field))
    .filter((field) => TARGET_FIELDS.has(field) && unresolvedFields.has(field)));
  const outputUnknowns = removeFailedUnknowns(unknownsAfterVerified, failedUnknownFields);

  const enriched = normalizeEvidenceBundle({
    ...clone(baseBundle),
    evidenceBundleId: "",
    items: [
      ...(Array.isArray(baseBundle.items) ? clone(baseBundle.items) : []),
      ...onlineItems.map(stripAdapterOnlyFields),
    ],
    unknowns: outputUnknowns,
    failures,
    createdAt: now(),
  }, { now });
  const enrichedValidation = validateEvidenceBundle(enriched);
  if (!enrichedValidation.accepted) {
    diagnostics.push(diagnostic({ status: "failed", reason: "parse-failed", error: enrichedValidation.reasons.join(",") }));
    return safeReturn({ enabled: true, attempted: true });
  }

  return {
    enabled: true,
    attempted: true,
    bundle: enriched,
    resolvedFields: [...verifiedFields],
    diagnostics,
  };
}
