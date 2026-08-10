import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeLocalEvidenceSource,
  sha256EvidenceContent,
} from "../src/lib/routes/local-evidence-source-schema.mjs";
import {
  normalizeRouteLegEvidence,
  validateRouteLegEvidence,
} from "../src/lib/routes/route-leg-evidence-schema.mjs";
import {
  normalizeSeasonEvidence,
  validateSeasonEvidence,
} from "../src/lib/routes/season-evidence-schema.mjs";
import { stableHash } from "../src/lib/routes/route-v2-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_LEG_PATH = "data/route-v2/evidence-seed/route-leg-evidence.jsonl";
const SEASON_PATH = "data/route-v2/evidence-seed/season-evidence.jsonl";
const MANIFEST_PATH = "data/route-v2/evidence-seed/evidence-seed-manifest.json";
const NOW = "2026-08-03T18:00:00.000Z";

const SELECTION_PATHS = Object.freeze({
  IT: "data/knowledge/batches/selection.p1b-batch05.json",
  FR: "data/knowledge/batches/selection.p1b-batch06.json",
  ES: "data/knowledge/batches/selection.p1b-batch07.json",
  KR: "data/knowledge/batches/selection.p1b-batch08.json",
});

const SOURCES = Object.freeze({
  trenitalia: {
    url: "https://www.trenitalia.com/en/connections/frecce/frecciarossa.html",
    locator: "Frecciarossa connections",
    excerpt: "Trenitalia lists the Turin-Milan-Bologna-Florence-Rome-Naples and Venice-Bologna-Florence-Rome-Naples passenger corridors on its official Frecciarossa network.",
  },
  trenordComo: {
    url: "https://www.trenord.it/en/routes-and-timetables/most-searched-lines/milano-centrale-como-s-giovanni-route/",
    locator: "Milano Centrale to Como S. Giovanni route",
    excerpt: "Trenord publishes direct passenger trains between Milano Centrale and Como S. Giovanni with regular daily departures.",
  },
  sncf: (from, to) => ({
    url: `https://www.sncf-connect.com/en-en/train/route/${from}/${to}`,
    locator: `${from} to ${to} train route`,
    excerpt: `SNCF Connect publishes passenger train service between ${from} and ${to}, including current route and timetable information.`,
  }),
  renfe: {
    url: "https://www.renfe.com/es/es/experiencias/rutas.html",
    locator: "Renfe principal passenger routes",
    excerpt: "Renfe publishes its principal AVE, long-distance and regional passenger routes connecting Madrid, Barcelona, Valencia, Seville, Cordoba, Granada, Malaga and Toledo.",
  },
  euskotren: {
    url: "https://www.euskotren.eus/en/node/14894",
    locator: "E1 Bilbao to Donostia/San Sebastian line",
    excerpt: "Euskotren identifies the E1 passenger rail line between Bilbao and Donostia/San Sebastian on its official service information.",
  },
  koreaBus: {
    url: "https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=177&vcontsId=140657",
    locator: "Official express and intercity bus terminal routes",
    excerpt: "Korea Tourism Organization lists intercity passenger bus routes from Seoul terminals to Gyeongju, Jeonju, Daegu, Gangneung, Sokcho, Andong, Yeosu and Tongyeong.",
  },
  koreaAir: {
    url: "https://www.airport.co.kr/jeju/cms/frRouteMapCon/routeMap.do",
    locator: "Jeju International Airport domestic route map",
    excerpt: "Korea Airports Corporation publishes the current domestic passenger air route map for Jeju International Airport, including Seoul and Busan airport connections.",
  },
});

const PAIRS = Object.freeze({
  IT: [
    ["rome", "florence", "rail", SOURCES.trenitalia],
    ["florence", "bologna", "rail", SOURCES.trenitalia],
    ["bologna", "venice", "rail", SOURCES.trenitalia],
    ["venice", "milan", "rail", SOURCES.trenitalia],
    ["milan", "turin", "rail", SOURCES.trenitalia],
    ["florence", "pisa", "rail", SOURCES.trenitalia],
    ["rome", "naples", "rail", SOURCES.trenitalia],
    ["milan", "como", "rail", SOURCES.trenordComo],
    ["milan", "verona", "rail", SOURCES.trenitalia],
  ],
  FR: [
    ["paris", "lyon", "rail", SOURCES.sncf("paris", "lyon")],
    ["lyon", "marseille", "rail", SOURCES.sncf("lyon", "marseille")],
    ["marseille", "nice", "rail", SOURCES.sncf("marseille", "nice")],
    ["nice", "cannes", "rail", SOURCES.sncf("nice", "cannes")],
    ["paris", "bordeaux", "rail", SOURCES.sncf("paris", "bordeaux")],
    ["paris", "strasbourg", "rail", SOURCES.sncf("paris", "strasbourg")],
    ["strasbourg", "colmar", "rail", SOURCES.sncf("strasbourg", "colmar")],
    ["lyon", "annecy", "rail", SOURCES.sncf("lyon", "annecy")],
    ["marseille", "aix-en-provence", "rail", SOURCES.sncf("marseille", "aix-en-provence")],
  ],
  ES: [
    ["madrid", "barcelona", "rail", SOURCES.renfe],
    ["madrid", "seville", "rail", SOURCES.renfe],
    ["seville", "cordoba", "rail", SOURCES.renfe],
    ["cordoba", "granada", "rail", SOURCES.renfe],
    ["granada", "malaga", "rail", SOURCES.renfe],
    ["madrid", "toledo", "rail", SOURCES.renfe],
    ["madrid", "valencia", "rail", SOURCES.renfe],
    ["bilbao", "san-sebastian", "rail", SOURCES.euskotren],
  ],
  KR: [
    ["seoul", "gyeongju", "bus", SOURCES.koreaBus],
    ["seoul", "jeonju", "bus", SOURCES.koreaBus],
    ["seoul", "daegu", "bus", SOURCES.koreaBus],
    ["seoul", "gangneung", "bus", SOURCES.koreaBus],
    ["seoul", "sokcho", "bus", SOURCES.koreaBus],
    ["seoul", "andong", "bus", SOURCES.koreaBus],
    ["seoul", "yeosu", "bus", SOURCES.koreaBus],
    ["seoul", "tongyeong", "bus", SOURCES.koreaBus],
    ["seoul", "jeju", "air", SOURCES.koreaAir],
    ["busan", "jeju", "air", SOURCES.koreaAir],
  ],
});

const SEASON_SOURCES = Object.freeze({
  IT: {
    url: "https://www.protezionecivile.gov.it/en/approfondimento/case-heat-waves/",
    locator: "Italian heat-wave alert period",
    excerpt: "Italian Civil Protection states that national heat-wave bulletins are produced daily from May to September and that prolonged very high temperatures present health risks.",
  },
  FR: {
    url: "https://meteofrance.com/actualites-et-dossiers/actualites/retour-sur-la-2e-vague-de-chaleur-de-lete-du-4-au-19-juillet-2026",
    locator: "July heat-wave record",
    excerpt: "Meteo-France documents a nationwide heat wave from 4 to 19 July 2026, with red and orange heat vigilance across numerous departments.",
  },
  ES: {
    url: "https://www.aemet.es/es/conocermas/recursos_en_linea/publicaciones_y_estudios/estudios/detalles/olascalor",
    locator: "AEMET historical heat-wave definition and register",
    excerpt: "AEMET defines and records Spanish heat waves using consecutive extreme maximum temperatures during July and August.",
  },
  KR: {
    url: "https://www.kma.go.kr/kma/servlet/NeoboardProcess?bid=eng_notice&mode=download&num=8",
    locator: "KMA long-term July climate risk summary",
    excerpt: "Korea Meteorological Administration documents July climate risks including days with heavy precipitation and heat-wave conditions in its official long-term climate summary.",
  },
});

const SEASON_FACTS = Object.freeze({
  IT: [["rome", 8, ["high-temperature-risk"]], ["milan", 8, ["high-temperature-risk"]], ["naples", 8, ["high-temperature-risk"]], ["palermo", 8, ["high-temperature-risk"]]],
  FR: [["paris", 7, ["high-temperature-risk"]], ["lyon", 7, ["high-temperature-risk"]], ["marseille", 7, ["high-temperature-risk"]], ["bordeaux", 7, ["high-temperature-risk"]]],
  ES: [["madrid", 7, ["high-temperature-risk"]], ["seville", 7, ["high-temperature-risk"]], ["valencia", 8, ["high-temperature-risk"]], ["barcelona", 8, ["high-temperature-risk"]]],
  KR: [["seoul", 7, ["heavy-rain-risk", "high-temperature-risk"]], ["busan", 7, ["heavy-rain-risk", "high-temperature-risk"]], ["jeju", 7, ["heavy-rain-risk"]], ["gangneung", 7, ["heavy-rain-risk"]]],
});

function evidenceSource({ url, supports, locator, excerpt, confidence = 0.88 }) {
  return normalizeLocalEvidenceSource({
    url,
    supports,
    retrievedAt: NOW,
    confidence,
    factLocator: locator,
    factExcerpt: excerpt,
    contentHash: sha256EvidenceContent(excerpt),
  });
}

function leg(cityIds, from, to, mode, sourceDefinition) {
  const fromEntityId = cityIds[from];
  const toEntityId = cityIds[to];
  const supports = [`route-leg:${fromEntityId}>${toEntityId}:feasibility`];
  const source = evidenceSource({ ...sourceDefinition, supports });
  const record = normalizeRouteLegEvidence({
    fromEntityId,
    toEntityId,
    transportMode: mode,
    directed: true,
    feasibilityStatus: "feasible",
    durationMinMinutes: null,
    durationMaxMinutes: null,
    transferCount: null,
    frequencyLevel: "unknown",
    sourceRefs: [source.sourceId],
    sources: [source],
    confidence: 0.88,
    freshnessStatus: "fresh",
    retrievedAt: NOW,
    expiresAt: null,
    unknowns: [
      { field: "duration", reason: "The official source confirms the connection, but this reusable record does not preserve a timetable-dependent duration." },
      { field: "transferCount", reason: "The official source does not provide a stable reusable transfer count for this evidence record." },
      { field: "frequencyLevel", reason: "The official source does not provide a stable reusable service frequency for this evidence record." },
    ],
    conflicts: [],
    diagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateRouteLegEvidence(record);
  if (!validation.accepted) throw new Error(`invalid-leg:${from}>${to}:${validation.reasons.join(",")}`);
  return validation.record;
}

function season(cityIds, country, [city, month, weatherRisks]) {
  const entityId = cityIds[city];
  const supports = [`season:${entityId}:${month}:risk`];
  const source = evidenceSource({ ...SEASON_SOURCES[country], supports, confidence: 0.82 });
  const record = normalizeSeasonEvidence({
    entityId,
    month,
    season: null,
    suitabilityStatus: "unknown",
    weatherRisks,
    transportRisks: [],
    closureRisks: [],
    recommendedBufferMinutes: null,
    sourceRefs: [source.sourceId],
    sources: [source],
    confidence: 0.82,
    freshnessStatus: "fresh",
    retrievedAt: NOW,
    expiresAt: null,
    unknowns: [{ field: "seasonSuitability", reason: "This record preserves objective risk only and does not infer a best or recommended travel month." }],
    conflicts: [],
    diagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateSeasonEvidence(record);
  if (!validation.accepted) throw new Error(`invalid-season:${country}:${city}:${month}:${validation.reasons.join(",")}`);
  return validation.record;
}

function parseJsonl(text) {
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function atomicText(relativePath, text) {
  const filePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

function upsert(existing, additions, idField) {
  const records = new Map(existing.map((record) => [record[idField], record]));
  for (const record of additions) records.set(record[idField], record);
  return [...records.values()].sort((left, right) => left[idField].localeCompare(right[idField], "en"));
}

async function main() {
  const selections = Object.fromEntries(await Promise.all(Object.entries(SELECTION_PATHS).map(async ([country, relativePath]) => [
    country,
    JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8")),
  ])));
  const cityIdsByCountry = Object.fromEntries(Object.entries(selections).map(([country, selection]) => [
    country,
    Object.fromEntries(selection.cities.map((city) => [city.key, city.entityId])),
  ]));
  for (const country of Object.keys(SELECTION_PATHS)) {
    const cityIds = cityIdsByCountry[country];
    const referenced = new Set(PAIRS[country].flatMap(([from, to]) => [from, to]).concat(SEASON_FACTS[country].map(([city]) => city)));
    const missing = [...referenced].filter((key) => !cityIds[key]);
    if (missing.length) throw new Error(`batch03-city-missing:${country}:${missing.join("|")}`);
  }
  const additionsByCountry = {};
  const seasonAdditionsByCountry = {};
  for (const country of Object.keys(SELECTION_PATHS)) {
    const cityIds = cityIdsByCountry[country];
    additionsByCountry[country] = PAIRS[country].flatMap(([from, to, mode, source]) => [
      leg(cityIds, from, to, mode, source),
      leg(cityIds, to, from, mode, source),
    ]);
    seasonAdditionsByCountry[country] = SEASON_FACTS[country].map((fact) => season(cityIds, country, fact));
  }
  const additions = Object.values(additionsByCountry).flat();
  const seasonAdditions = Object.values(seasonAdditionsByCountry).flat();
  const existingLegs = parseJsonl(await readFile(path.join(ROOT, ROUTE_LEG_PATH), "utf8"));
  const existingSeasons = parseJsonl(await readFile(path.join(ROOT, SEASON_PATH), "utf8"));
  const routeLegs = upsert(existingLegs, additions, "legEvidenceId");
  const seasons = upsert(existingSeasons, seasonAdditions, "seasonEvidenceId");
  for (const record of routeLegs) {
    const validation = validateRouteLegEvidence(record);
    if (!validation.accepted) throw new Error(`route-leg-invalid:${validation.reasons.join(",")}`);
  }
  for (const record of seasons) {
    const validation = validateSeasonEvidence(record);
    if (!validation.accepted) throw new Error(`season-invalid:${validation.reasons.join(",")}`);
  }
  const currentManifest = JSON.parse(await readFile(path.join(ROOT, MANIFEST_PATH), "utf8"));
  const manifest = {
    schemaVersion: "route-v2-evidence-seed-v1",
    country: "MULTI",
    countries: [...new Set([...(currentManifest.countries || []), ...Object.keys(SELECTION_PATHS)])].sort(),
    routeLegEvidenceIds: routeLegs.map((record) => record.legEvidenceId),
    seasonEvidenceIds: seasons.map((record) => record.seasonEvidenceId),
    counts: { routeLeg: routeLegs.length, season: seasons.length, total: routeLegs.length + seasons.length },
    promotedEvidenceHash: stableHash({ routeLegs, seasons }),
  };
  await atomicText(ROUTE_LEG_PATH, `${routeLegs.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(SEASON_PATH, `${seasons.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    countries: Object.fromEntries(Object.keys(SELECTION_PATHS).map((country) => [country, {
      addedDirectedRouteLegs: additionsByCountry[country].length,
      addedSeasonEvidence: seasonAdditionsByCountry[country].length,
    }])),
    counts: manifest.counts,
  }, null, 2));
}

await main();
