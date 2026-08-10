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
const SELECTION_PATH = "data/knowledge/batches/selection.p1b-batch04.json";
const ROUTE_LEG_PATH = "data/route-v2/evidence-seed/route-leg-evidence.jsonl";
const SEASON_PATH = "data/route-v2/evidence-seed/season-evidence.jsonl";
const MANIFEST_PATH = "data/route-v2/evidence-seed/evidence-seed-manifest.json";
const NOW = "2026-08-03T14:00:00.000Z";

const SOURCES = Object.freeze({
  jrCentral: {
    url: "https://global.jr-central.co.jp/en/onlinebooking/",
    locator: "Tokaido Shinkansen online booking area",
    excerpt: "Central Japan Railway Company lists the Tokaido Shinkansen corridor serving Tokyo, Nagoya, Kyoto and Shin-Osaka.",
  },
  jrWest: {
    url: "https://www.westjr.co.jp/travel-information/en/plan-your-trip/routes-schedule/",
    locator: "JR West route maps and station network",
    excerpt: "JR West publishes route maps and route finding for Kyoto, Osaka, Kobe, Nara and Hiroshima stations on its passenger network.",
  },
  jrWestFerry: {
    url: "https://www.westjr.co.jp/global/en/ticket/pass/kansai_hiroshima/index2.html",
    locator: "Kansai-Hiroshima valid routes",
    excerpt: "JR West lists Sanyo Shinkansen service to Hiroshima and the JR West Miyajima Ferry between Miyajimaguchi and Miyajima.",
  },
  hakone: {
    url: "https://www.japan.travel/en/destinations/kanto/kanagawa/hakone-and-around/",
    locator: "Hakone access from Tokyo",
    excerpt: "JNTO states that Hakone-Yumoto is accessible from Tokyo by the Odakyu Line or by Tokaido Shinkansen to Odawara followed by Hakone Tozan Railway.",
  },
  kamakura: {
    url: "https://www.japan.travel/en/destinations/kanto/kanagawa/kamakura-and-around/",
    locator: "Kamakura access from Tokyo",
    excerpt: "JNTO states that Kamakura Station is 55 minutes from Tokyo Station on the JR Yokosuka Line.",
  },
  kawaguchiko: {
    url: "https://www.japan.travel/en/destinations/tokai/yamanashi/fuji-five-lakes/",
    locator: "Fuji Five Lakes access from Tokyo",
    excerpt: "JNTO states that travelers can take JR Chuo Line from Tokyo and change at Otsuki for the Fuji Kyuko Line to Kawaguchiko.",
  },
  threeStarRoad: {
    url: "https://www.japan.travel/en/itineraries/the-three-star-road-nagoya-takayama-and-kanazawa/",
    locator: "Nagoya, Takayama and Kanazawa itinerary",
    excerpt: "JNTO publishes a continuous itinerary connecting Nagoya, Takayama and Kanazawa using intercity rail and highway bus links.",
  },
  jrKyushu: {
    url: "https://www.jrkyushu.co.jp/english/railpass/railpass.html",
    locator: "Northern Kyushu applicable train area",
    excerpt: "JR Kyushu lists Hakata-Kumamoto Shinkansen and Northern Kyushu rail coverage including Fukuoka, Oita and Kumamoto.",
  },
  yufuin: {
    url: "https://www.jrkyushu.co.jp/english/booking/list_of_trains.html",
    locator: "JR Kyushu booking routes",
    excerpt: "JR Kyushu lists bookable train services between Hakata and Yufuin or Beppu, confirming the Yufuin and Beppu passenger rail corridor.",
  },
  hokkaido: {
    url: "https://www.jrhokkaido.co.jp/global/english/train/",
    locator: "JR Hokkaido route map sections",
    excerpt: "JR Hokkaido lists Sapporo-Hakodate and Sapporo-Otaru as passenger timetable search sections on its official route guide.",
  },
  okinawa: {
    url: "https://www.japan.travel/en/spot/590/",
    locator: "Okinawa City access from Naha",
    excerpt: "JNTO directs travelers to bus 23 from Naha Bus Terminal to Goya in Okinawa City.",
  },
});

const PAIRS = Object.freeze([
  ["tokyo", "nagoya", "rail", SOURCES.jrCentral],
  ["nagoya", "kyoto", "rail", SOURCES.jrCentral],
  ["kyoto", "osaka", "rail", SOURCES.jrWest],
  ["osaka", "nara", "rail", SOURCES.jrWest],
  ["osaka", "kobe", "rail", SOURCES.jrWest],
  ["kobe", "hiroshima", "rail", SOURCES.jrWestFerry],
  ["hiroshima", "miyajima", "rail-ferry", SOURCES.jrWestFerry],
  ["hiroshima", "fukuoka", "rail", SOURCES.jrWest],
  ["tokyo", "hakone", "rail", SOURCES.hakone],
  ["tokyo", "kamakura", "rail", SOURCES.kamakura],
  ["tokyo", "kawaguchiko", "rail", SOURCES.kawaguchiko],
  ["nagoya", "takayama", "rail-bus", SOURCES.threeStarRoad],
  ["takayama", "kanazawa", "bus", SOURCES.threeStarRoad],
  ["fukuoka", "kumamoto", "rail", SOURCES.jrKyushu],
  ["fukuoka", "beppu", "rail", SOURCES.jrKyushu],
  ["beppu", "yufuin", "rail", SOURCES.yufuin],
  ["sapporo", "otaru", "rail", SOURCES.hokkaido],
  ["sapporo", "hakodate", "rail", SOURCES.hokkaido],
  ["naha", "okinawa-city", "bus", SOURCES.okinawa],
]);

const NORMALS_URL = "https://www.data.jma.go.jp/stats/data/en/normal/normal.html";
const SEASON_FACTS = Object.freeze([
  ["tokyo", 8, ["high-temperature-risk"], [], "Tokyo August mean temperature", "JMA 1991-2020 normals give Tokyo an August monthly mean temperature of 26.9 degrees Celsius."],
  ["nagoya", 8, ["high-temperature-risk"], [], "Nagoya August mean temperature", "JMA 1991-2020 normals give Nagoya an August monthly mean temperature of 28.2 degrees Celsius."],
  ["osaka", 8, ["high-temperature-risk"], [], "Osaka August mean temperature", "JMA 1991-2020 normals give Osaka an August monthly mean temperature of 29.0 degrees Celsius."],
  ["hiroshima", 8, ["high-temperature-risk"], [], "Hiroshima August mean temperature", "JMA 1991-2020 normals give Hiroshima an August monthly mean temperature of 28.5 degrees Celsius."],
  ["fukuoka", 7, ["heavy-rain-risk"], [], "Fukuoka July precipitation normal", "JMA 1991-2020 normals give Fukuoka a July monthly precipitation total of 299.1 millimetres."],
  ["fukuoka", 8, ["high-temperature-risk"], [], "Fukuoka August mean temperature", "JMA 1991-2020 normals give Fukuoka an August monthly mean temperature of 28.4 degrees Celsius."],
  ["sapporo", 1, ["heavy-snow-risk"], ["winter-rail-disruption-risk"], "Sapporo January snowfall observations", "JMA monthly climate statistics document substantial January snowfall totals at Sapporo station across the historical observation series."],
  ["sapporo", 2, ["heavy-snow-risk"], ["winter-rail-disruption-risk"], "Sapporo February snowfall observations", "JMA monthly climate statistics document substantial February snowfall totals at Sapporo station across the historical observation series."],
  ["kyoto", 1, ["snow-risk"], ["winter-transport-disruption-risk"], "Kyoto January snowfall observations", "JMA monthly climate statistics document January snowfall at Kyoto station in the historical observation series."],
  ["kyoto", 2, ["snow-risk"], ["winter-transport-disruption-risk"], "Kyoto February snowfall observations", "JMA monthly climate statistics document February snowfall at Kyoto station in the historical observation series."],
  ["naha", 6, ["heavy-rain-risk"], [], "Okinawa rainy season", "JNTO advises cautious travel planning during Okinawa's rainy season from late May to early June."],
  ["naha", 9, ["typhoon-risk"], ["transport-disruption-risk"], "Okinawa September typhoon risk", "JNTO advises cautious travel planning in September when typhoons frequently hit the Okinawa islands."],
  ["okinawa-city", 6, ["heavy-rain-risk"], [], "Okinawa main-island rainy season", "JNTO advises cautious travel planning during Okinawa's rainy season from late May to early June."],
  ["okinawa-city", 9, ["typhoon-risk"], ["transport-disruption-risk"], "Okinawa main-island September typhoon risk", "JNTO advises cautious travel planning in September when typhoons frequently hit the Okinawa islands."],
]);

function source({ url, supports, locator, excerpt, confidence = 0.9 }) {
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
  const evidenceSource = source({ ...sourceDefinition, supports });
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
    sourceRefs: [evidenceSource.sourceId],
    sources: [evidenceSource],
    confidence: 0.9,
    freshnessStatus: "fresh",
    retrievedAt: NOW,
    expiresAt: null,
    unknowns: [
      { field: "duration", reason: "The official source confirms the connection but does not provide a stable reusable duration for this directed record." },
      { field: "transferCount", reason: "The official source does not provide a reusable transfer count." },
      { field: "frequencyLevel", reason: "The official source does not provide a reusable service frequency." },
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

function season(cityIds, [city, month, weather, transport, locator, excerpt]) {
  const entityId = cityIds[city];
  const supports = [`season:${entityId}:${month}:risk`];
  const url = city === "naha" || city === "okinawa-city"
    ? "https://www.japan.travel/en/destinations/okinawa/Okinawa/naha-and-the-main-island/"
    : NORMALS_URL;
  const evidenceSource = source({ url, supports, locator, excerpt, confidence: 0.85 });
  const record = normalizeSeasonEvidence({
    entityId,
    month,
    season: null,
    suitabilityStatus: "unknown",
    weatherRisks: weather,
    transportRisks: transport,
    closureRisks: [],
    recommendedBufferMinutes: null,
    sourceRefs: [evidenceSource.sourceId],
    sources: [evidenceSource],
    confidence: 0.85,
    freshnessStatus: "fresh",
    retrievedAt: NOW,
    expiresAt: null,
    unknowns: [{ field: "seasonSuitability", reason: "This record preserves objective climate or disruption risk only and does not infer a best or recommended month." }],
    conflicts: [],
    diagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateSeasonEvidence(record);
  if (!validation.accepted) throw new Error(`invalid-season:${city}:${month}:${validation.reasons.join(",")}`);
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
  const selection = JSON.parse(await readFile(path.join(ROOT, SELECTION_PATH), "utf8"));
  const cityIds = Object.fromEntries(selection.cities.map((city) => [city.key, city.entityId]));
  const missingCities = [...new Set(PAIRS.flatMap(([from, to]) => [from, to]).concat(SEASON_FACTS.map(([city]) => city)))].filter((key) => !cityIds[key]);
  if (missingCities.length) throw new Error(`batch02-city-missing:${missingCities.join("|")}`);

  const additions = PAIRS.flatMap(([from, to, mode, evidenceSource]) => [
    leg(cityIds, from, to, mode, evidenceSource),
    leg(cityIds, to, from, mode, evidenceSource),
  ]);
  const seasonAdditions = SEASON_FACTS.map((fact) => season(cityIds, fact));
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
  const manifest = {
    schemaVersion: "route-v2-evidence-seed-v1",
    country: "MULTI",
    countries: [...new Set(["AU", "CH", "IS", "JP", "KR", "NZ", "TH"])].sort(),
    routeLegEvidenceIds: routeLegs.map((record) => record.legEvidenceId),
    seasonEvidenceIds: seasons.map((record) => record.seasonEvidenceId),
    counts: { routeLeg: routeLegs.length, season: seasons.length, total: routeLegs.length + seasons.length },
    promotedEvidenceHash: stableHash({ routeLegs, seasons }),
  };
  await atomicText(ROUTE_LEG_PATH, `${routeLegs.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(SEASON_PATH, `${seasons.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    addedDirectedRouteLegs: additions.length,
    addedSeasonEvidence: seasonAdditions.length,
    coveredCitiesByTransport: new Set(PAIRS.flatMap(([from, to]) => [from, to])).size,
    coveredCitiesBySeason: new Set(SEASON_FACTS.map(([city]) => city)).size,
    counts: manifest.counts,
  }, null, 2));
}

await main();
