import crypto from "node:crypto";
import { scoreWebSearchSource } from "./web-source-scorer.mjs";

const ALLOWED_TYPES = new Set([
  "region-cluster",
  "transport-connection",
  "segment-metric",
  "destination-level",
  "destination-season",
  "theme-fit",
  "route-network",
  "climate-window",
]);

const MONTH_PATTERN = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|spring|summer|autumn|fall|winter)\b/giu;

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function transportModes(text) {
  if (/(rail|train|JR|Express|Limited Express)/iu.test(text)) return ["rail"];
  if (/ferry|cruise|island ferry/iu.test(text)) return ["ferry"];
  if (/walking|pilgrimage|hiking|trek/iu.test(text)) return ["walking"];
  if (/cycling|bike/iu.test(text)) return ["cycling"];
  if (/road|highway|drive|bus/iu.test(text)) return ["road"];
  return ["transport"];
}

function distanceKm(text) {
  const match = clean(text).match(/\b(\d+(?:\.\d+)?)\s*(?:km|kilometres|kilometers)\b/iu);
  return match ? Math.round(Number(match[1])) : null;
}

function durationMinutes(text) {
  const hours = clean(text).match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/iu);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = clean(text).match(/\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/iu);
  return minutes ? Math.round(Number(minutes[1])) : null;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function evidenceHash(item) {
  return hash([
    item.evidenceType,
    item.subject?.name,
    item.relation,
    item.object?.name,
    JSON.stringify(item.value),
    item.provenance?.sourceUrl,
  ].join("|").toLowerCase());
}

function titleCasePlaces(text) {
  const matches = clean(text).match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/gu) || [];
  const blocked = new Set([
    "Best Stops",
    "Distance",
    "Distance Timetable",
    "Every",
    "Guide",
    "How To",
    "Travel Guide",
    "Question",
    "Tickets",
    "Timetable",
    "Timetable Tickets",
    "Kansai Travel",
    "Japan National",
    "National Tourism",
    "Tourism Organization",
    "Express",
    "Osaka Trains",
    "Summer",
    "Winter",
    "Spring",
    "Autumn",
    "Train Budapest",
    "Traveling",
    "What",
  ]);
  return [...new Set(matches.filter((name) => !blocked.has(name) && name.length > 3))].slice(0, 8);
}

function queryPlaces(query, text) {
  const known = [
    ["kansai", ["Kyoto", "Osaka", "Nara"]],
    ["shikoku", ["Shikoku"]],
    ["swiss", ["Switzerland"]],
    ["switzerland", ["Switzerland"]],
    ["norway", ["Norway"]],
    ["croatia", ["Croatia"]],
  ];
  const lowered = `${query} ${text}`.toLowerCase();
  for (const [token, places] of known) {
    if (lowered.includes(token)) return places;
  }
  return [...new Set((clean(query).match(/\b[A-Z][a-z]+\b/gu) || [])
    .filter((name) => !["Train", "Distance", "Time", "Driving"].includes(name)))]
    .slice(0, 4);
}

function canonicalSubject(query, places) {
  if (/kansai/i.test(query)) return { entityId: "", name: "Kansai" };
  if (/shikoku/i.test(query)) return { entityId: "", name: "Shikoku" };
  if (/swiss|switzerland/i.test(query)) return { entityId: "", name: "Switzerland" };
  if (/norway/i.test(query)) return { entityId: "", name: "Norway" };
  if (/croatia/i.test(query)) return { entityId: "", name: "Croatia" };
  return { entityId: "", name: places[0] || clean(query) };
}

function provenance({ result, query, score, retrievedAt }) {
  return {
    providerId: "web-search",
    sourceUrl: result.sourceUrl,
    sourceTitle: result.sourceTitle,
    sourceSnippet: result.sourceSnippet,
    extractionMethod: "web-search-snippet",
    searchQuery: query,
    searchResultRank: result.rank,
    sourceScore: score.sourceScore,
    retrievedAt,
  };
}

function makeEvidence(input) {
  if (!ALLOWED_TYPES.has(input.evidenceType)) return null;
  const item = {
    evidenceId: "",
    id: "",
    kind: input.evidenceType,
    evidenceType: input.evidenceType,
    subject: input.subject,
    object: input.object || {},
    relation: input.relation,
    value: input.value,
    qualifiers: input.qualifiers || {},
    provenance: input.provenance,
    confidence: input.confidence,
    verifiedAt: input.retrievedAt,
    retrievedAt: input.retrievedAt,
    status: "verified",
    provider: "web-search",
    verified: true,
  };
  item.evidenceHash = evidenceHash(item);
  item.evidenceId = `web:${item.evidenceType}:${item.evidenceHash}`;
  item.id = item.evidenceId;
  return item;
}

function buildCandidates({ query, result, score, retrievedAt }) {
  const text = `${result.sourceTitle}. ${result.sourceSnippet}`;
  const queryDerivedPlaces = queryPlaces(query, text);
  const places = unique(queryDerivedPlaces.length >= 2 ? queryDerivedPlaces : [...queryDerivedPlaces, ...titleCasePlaces(text)]).slice(0, 8);
  const subject = canonicalSubject(query, places);
  const base = { query, result, score, retrievedAt };
  const source = provenance(base);
  const confidence = Math.min(0.9, Math.max(0.45, score.sourceScore * 0.82));
  const evidence = [];

  if (/(includes|links|connects|between|nearby|region|area)/iu.test(text) && places.length >= 2) {
    evidence.push(makeEvidence({
      evidenceType: "region-cluster",
      subject,
      relation: "groups-destinations",
      value: places.slice(0, 5),
      qualifiers: { memberNames: places.slice(0, 5) },
      provenance: source,
      confidence,
      retrievedAt,
    }));
  }

  if (/(rail|train|ferry|road|bus|walking|cycling|connects|links|frequent)/iu.test(text) && places.length >= 2) {
    const distance = distanceKm(text);
    const minutes = durationMinutes(text);
    evidence.push(makeEvidence({
      evidenceType: "transport-connection",
      subject: { entityId: "", name: places[0] },
      object: { entityId: "", name: places[1] },
      relation: "connected-to",
      value: transportModes(text),
      qualifiers: { sourcePhrase: result.sourceSnippet },
      provenance: source,
      confidence,
      retrievedAt,
    }));
    if (distance != null || minutes != null) {
      evidence.push(makeEvidence({
        evidenceType: "segment-metric",
        subject: { entityId: "", name: places[0] },
        object: { entityId: "", name: places[1] },
        relation: "has-segment-metric",
        value: {
          distanceKm: distance,
          durationMinutes: minutes,
          metricType: "web-snippet",
        },
        qualifiers: { distanceKm: distance, durationMinutes: minutes, sourcePhrase: result.sourceSnippet },
        provenance: source,
        confidence: Math.max(0.45, confidence - 0.05),
        retrievedAt,
      }));
    }
  }

  if (/(temple|food|historic|scenic|alpine|northern lights|island|pilgrimage)/iu.test(text)) {
    const theme = /northern lights/iu.test(text) ? "northern lights"
      : /island/iu.test(text) ? "island"
        : /alpine|scenic/iu.test(text) ? "scenic rail"
          : /pilgrimage/iu.test(text) ? "pilgrimage"
            : "culture";
    evidence.push(makeEvidence({
      evidenceType: "theme-fit",
      subject,
      relation: "has-theme",
      value: theme,
      qualifiers: { sourcePhrase: result.sourceSnippet },
      provenance: source,
      confidence,
      retrievedAt,
    }));
  }

  const months = [...new Set((text.match(MONTH_PATTERN) || []).map(clean))];
  if (months.length) {
    evidence.push(makeEvidence({
      evidenceType: "destination-season",
      subject,
      relation: "has-season",
      value: months.slice(0, 4),
      provenance: source,
      confidence,
      retrievedAt,
    }));
  }

  if (/(Glacier Express|Bernina Express|JR|scenic trains|ferry route)/u.test(text)) {
    const network = clean((text.match(/(?:Glacier Express|Bernina Express|JR|scenic trains|ferry route)/u) || [])[0]);
    evidence.push(makeEvidence({
      evidenceType: "route-network",
      subject,
      relation: "has-route-network",
      value: network,
      provenance: source,
      confidence,
      retrievedAt,
    }));
  }

  return evidence.filter(Boolean);
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function createWebEvidenceExtractor({ now = () => new Date().toISOString() } = {}) {
  return {
    extract({ query = "", results = [], retrievedAt = now() } = {}) {
      const filteredSources = [];
      const evidence = [];
      for (const result of results) {
        const normalized = {
          sourceUrl: clean(result.sourceUrl || result.url),
          sourceTitle: clean(result.sourceTitle || result.title),
          sourceSnippet: clean(result.sourceSnippet || result.snippet),
          rank: result.rank,
        };
        const score = scoreWebSearchSource(normalized);
        if (!score.acceptedForExtraction) {
          filteredSources.push({ ...normalized, ...score });
          continue;
        }
        evidence.push(...buildCandidates({ query, result: normalized, score, retrievedAt }));
      }
      return { evidence, filteredSources };
    },
  };
}
