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
const NOW = "2026-08-10T14:00:00.000Z";
const ISO = String(process.argv.find((value) => value.startsWith("--country="))?.split("=")[1] || "").toUpperCase();

const SELECTION_PATHS = Object.freeze({
  DE: "data/knowledge/batches/selection.p1b-batch09.json",
  AT: "data/knowledge/batches/selection.p1b-batch10.json",
  PT: "data/knowledge/batches/selection.p1b-batch11.json",
  GR: "data/knowledge/batches/selection.p1b-batch12.json",
  NL: "data/knowledge/batches/selection.p1b-batch13.json",
});

if (!SELECTION_PATHS[ISO]) {
  throw new Error(`country-argument-required:--country=${Object.keys(SELECTION_PATHS).join("|")}`);
}

const SOURCES = Object.freeze({
  db: {
    url: "https://int.bahn.de/en/trains/long-distance-trains/route-maps",
    locator: "Deutsche Bahn long-distance and regional route maps",
    excerpt: "Deutsche Bahn publishes its national ICE, IC and regional passenger network, including the Batch 04 German city corridor stations and tourist access to Füssen and Heidelberg.",
  },
  oebb: {
    url: "https://infrastruktur.oebb.at/en/projects-for-austria/railway-lines",
    locator: "ÖBB main railway lines in Austria",
    excerpt: "ÖBB publishes the Western Line Vienna-Salzburg, Southern Line from Vienna, and Arlberg Line Innsbruck-Bregenz as core passenger rail corridors.",
  },
  oebbHallstatt: {
    url: "https://www.oebb.at/dam/jcr:14e36b88-f49b-4c6a-8de5-8547705f5113/folder-zug-zum-flug-englisch.pdf",
    locator: "ÖBB Railjet and connecting destinations",
    excerpt: "ÖBB lists Salzburg and Hallstatt among reachable passenger rail destinations, with Hallstatt reached through the published Attnang-Puchheim connection.",
  },
  cp: {
    url: "https://www.cp.pt/info/en/w/trains-timetables-pdf",
    locator: "CP official passenger timetable index",
    excerpt: "CP publishes passenger timetables for Lisbon-Porto, Lisbon-Sintra, Lisbon-Évora, Porto-Braga, Porto-Guimarães, Lisbon-Coimbra and the Algarve line.",
  },
  hellenicTrain: {
    url: "https://www.hellenictrain.gr/en/intercity-network",
    locator: "Hellenic Train intercity network",
    excerpt: "Hellenic Train identifies Athens and Thessaloniki as the principal intercity passenger axis in Greece.",
  },
  argolida: {
    url: "https://www.ktelargolida.gr/en/routes/",
    locator: "KTEL Argolidas route information",
    excerpt: "KTEL Argolidas publishes a scheduled passenger bus route in both directions between Athens and Nafplio.",
  },
  fokidas: {
    url: "https://www.ktel-fokidas.gr/χειμερινά-δρομολόγια/delfoi-athina-delfoi/",
    locator: "Delphi-Athens-Delphi official timetable",
    excerpt: "KTEL Fokidas publishes passenger departures in both directions between Delphi and Athens.",
  },
  trikala: {
    url: "https://ktel-trikala.gr/wp-content/uploads/2023/07/timetable2023.pdf",
    locator: "KTEL Trikala official bus timetable",
    excerpt: "KTEL Trikala publishes passenger bus service linking Athens with Trikala and Kalambaka.",
  },
  aegean: {
    url: "https://flights.aegeanair.com/en/flights-from-athens-to-heraklion",
    locator: "AEGEAN Athens to Heraklion route",
    excerpt: "AEGEAN publishes scheduled passenger flights between Athens and Heraklion.",
  },
  creteBus: {
    url: "https://www.e-ktel.com/en/services/dromologia",
    locator: "KTEL Chania-Rethymno intercity timetable",
    excerpt: "KTEL Chania-Rethymno publishes intercity passenger bus service between Heraklion and Chania.",
  },
  ns: {
    url: "https://www.ns.nl/reizen/treinen/nachttrein-in-nederland",
    locator: "NS national and Randstad passenger corridors",
    excerpt: "Nederlandse Spoorwegen publishes passenger services linking Rotterdam, The Hague, Leiden, Amsterdam, Utrecht, Haarlem and the wider national network.",
  },
  nsNetwork: {
    url: "https://www.ns.nl/en/travel-information",
    locator: "NS passenger travel information",
    excerpt: "Nederlandse Spoorwegen provides national passenger journey information for Amsterdam, Rotterdam, Delft and Maastricht stations.",
  },
});

const PAIRS = Object.freeze({
  DE: [
    ["berlin", "hamburg", "rail", SOURCES.db],
    ["berlin", "dresden", "rail", SOURCES.db],
    ["berlin", "munich", "rail", SOURCES.db],
    ["munich", "nuremberg", "rail", SOURCES.db],
    ["munich", "fussen", "rail", SOURCES.db],
    ["frankfurt", "cologne", "rail", SOURCES.db],
    ["frankfurt", "heidelberg", "rail", SOURCES.db],
    ["munich", "stuttgart", "rail", SOURCES.db],
  ],
  AT: [
    ["vienna", "salzburg", "rail", SOURCES.oebb],
    ["vienna", "graz", "rail", SOURCES.oebb],
    ["salzburg", "innsbruck", "rail", SOURCES.oebb],
    ["salzburg", "hallstatt", "rail", SOURCES.oebbHallstatt],
    ["innsbruck", "bregenz", "rail", SOURCES.oebb],
  ],
  PT: [
    ["lisbon", "porto", "rail", SOURCES.cp],
    ["lisbon", "sintra", "rail", SOURCES.cp],
    ["lisbon", "evora", "rail", SOURCES.cp],
    ["porto", "braga", "rail", SOURCES.cp],
    ["porto", "guimaraes", "rail", SOURCES.cp],
    ["lisbon", "coimbra", "rail", SOURCES.cp],
    ["faro", "lagos", "rail", SOURCES.cp],
  ],
  GR: [
    ["athens", "thessaloniki", "rail", SOURCES.hellenicTrain],
    ["athens", "nafplio", "bus", SOURCES.argolida],
    ["athens", "delphi", "bus", SOURCES.fokidas],
    ["athens", "kalabaka", "bus", SOURCES.trikala],
    ["athens", "heraklion", "air", SOURCES.aegean],
    ["heraklion", "chania", "bus", SOURCES.creteBus],
  ],
  NL: [
    ["amsterdam", "rotterdam", "rail", SOURCES.ns],
    ["amsterdam", "the-hague", "rail", SOURCES.ns],
    ["amsterdam", "utrecht", "rail", SOURCES.ns],
    ["amsterdam", "haarlem", "rail", SOURCES.ns],
    ["rotterdam", "delft", "rail", SOURCES.nsNetwork],
    ["amsterdam", "leiden", "rail", SOURCES.ns],
    ["amsterdam", "maastricht", "rail", SOURCES.nsNetwork],
  ],
});

const SEASON_SOURCES = Object.freeze({
  DE: {
    url: "https://www.dwd.de/EN/weather/warnings/information/weather-watch.html",
    locator: "DWD official extreme-weather hazard guidance",
    excerpt: "Deutscher Wetterdienst identifies extreme heat, heavy rain, flooding, heavy snowfall and ice as objective hazards that can disrupt transport in Germany.",
  },
  AT: {
    url: "https://www.geosphere.at/en/news-and-events/news/climate-report-for-june-2026-despite-a-record-breaking-heatwave-it-was-not-the-warmest-june-on-record",
    locator: "GeoSphere Austria June 2026 climate report",
    excerpt: "GeoSphere Austria records a June heatwave, repeated heavy showers and high-mountain snowfall, including strong impacts in Vienna and eastern Austria.",
  },
  PT: {
    url: "https://dataclima.ipma.pt/en/index-eventos/exceptionally-wet-25-26/",
    locator: "IPMA exceptionally wet 2025/2026 period",
    excerpt: "IPMA documents persistent winter heavy rainfall, floods, inundations and landslides across mainland Portugal during the exceptionally wet period ending February 2026.",
  },
  GR: {
    url: "https://www.emy.gr/en/announcements/823",
    locator: "HNMS July 2025 heatwave assessment",
    excerpt: "The Hellenic National Meteorological Service documents an intense and unusual July heatwave lasting multiple consecutive days in Greece.",
  },
  NL: {
    url: "https://www.knmi.nl/over-het-knmi/nieuws/aantal-dagen-met-zware-neerslag-toegenomen-door-hogere-temperaturen",
    locator: "KNMI heavy precipitation analysis",
    excerpt: "KNMI defines heavy precipitation as more than 50 millimetres in one day and reports that such events are increasing, with South Limburg affected most often.",
  },
});

const SEASON_FACTS = Object.freeze({
  DE: [
    ["berlin", 7, ["high-temperature-risk"]],
    ["frankfurt", 7, ["high-temperature-risk"]],
    ["munich", 1, ["heavy-snow-risk", "ice-risk"]],
    ["dresden", 6, ["heavy-rain-risk", "flood-risk"]],
  ],
  AT: [
    ["vienna", 6, ["high-temperature-risk"]],
    ["graz", 6, ["high-temperature-risk"]],
    ["innsbruck", 6, ["high-mountain-snow-risk"]],
    ["hallstatt", 6, ["heavy-rain-risk"]],
  ],
  PT: [
    ["lisbon", 2, ["heavy-rain-risk", "flood-risk"]],
    ["porto", 2, ["heavy-rain-risk", "flood-risk"]],
    ["coimbra", 2, ["heavy-rain-risk", "landslide-risk"]],
    ["faro", 2, ["heavy-rain-risk", "flood-risk"]],
  ],
  GR: [
    ["athens", 7, ["high-temperature-risk"]],
    ["thessaloniki", 7, ["high-temperature-risk"]],
    ["heraklion", 7, ["high-temperature-risk"]],
    ["rhodes-town", 7, ["high-temperature-risk"]],
  ],
  NL: [
    ["maastricht", 6, ["heavy-rain-risk", "flood-risk"]],
    ["amsterdam", 6, ["heavy-rain-risk"]],
    ["rotterdam", 6, ["heavy-rain-risk"]],
    ["the-hague", 6, ["heavy-rain-risk"]],
  ],
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
      {
        field: "duration",
        reason: "The official source confirms the connection, but this reusable record does not preserve a timetable-dependent duration.",
      },
      {
        field: "transferCount",
        reason: "The official source does not provide a stable reusable transfer count for this evidence record.",
      },
      {
        field: "frequencyLevel",
        reason: "The official source does not provide a stable reusable service frequency for this evidence record.",
      },
    ],
    conflicts: [],
    diagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateRouteLegEvidence(record);
  if (!validation.accepted) {
    throw new Error(`invalid-leg:${from}>${to}:${validation.reasons.join(",")}`);
  }
  return validation.record;
}

function season(cityIds, country, [city, month, weatherRisks]) {
  const entityId = cityIds[city];
  const supports = [`season:${entityId}:${month}:risk`];
  const source = evidenceSource({
    ...SEASON_SOURCES[country],
    supports,
    confidence: 0.82,
  });
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
    unknowns: [{
      field: "seasonSuitability",
      reason: "This record preserves objective risk only and does not infer a best or recommended travel month.",
    }],
    conflicts: [],
    diagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateSeasonEvidence(record);
  if (!validation.accepted) {
    throw new Error(`invalid-season:${country}:${city}:${month}:${validation.reasons.join(",")}`);
  }
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
  return [...records.values()].sort(
    (left, right) => left[idField].localeCompare(right[idField], "en"),
  );
}

async function main() {
  const selection = JSON.parse(
    await readFile(path.join(ROOT, SELECTION_PATHS[ISO]), "utf8"),
  );
  const cityIds = Object.fromEntries(selection.cities.map((city) => [city.key, city.entityId]));
  const referenced = new Set([
    ...PAIRS[ISO].flatMap(([from, to]) => [from, to]),
    ...SEASON_FACTS[ISO].map(([city]) => city),
  ]);
  const missing = [...referenced].filter((key) => !cityIds[key]);
  if (missing.length) throw new Error(`batch04-city-missing:${ISO}:${missing.join("|")}`);

  const additions = PAIRS[ISO].flatMap(([from, to, mode, source]) => [
    leg(cityIds, from, to, mode, source),
    leg(cityIds, to, from, mode, source),
  ]);
  const seasonAdditions = SEASON_FACTS[ISO].map((fact) => season(cityIds, ISO, fact));
  const existingLegs = parseJsonl(await readFile(path.join(ROOT, ROUTE_LEG_PATH), "utf8"));
  const existingSeasons = parseJsonl(await readFile(path.join(ROOT, SEASON_PATH), "utf8"));
  const routeLegs = upsert(existingLegs, additions, "legEvidenceId");
  const seasons = upsert(existingSeasons, seasonAdditions, "seasonEvidenceId");

  for (const record of routeLegs) {
    const validation = validateRouteLegEvidence(record);
    if (!validation.accepted) {
      throw new Error(`route-leg-invalid:${record.legEvidenceId}:${validation.reasons.join(",")}`);
    }
  }
  for (const record of seasons) {
    const validation = validateSeasonEvidence(record);
    if (!validation.accepted) {
      throw new Error(`season-invalid:${record.seasonEvidenceId}:${validation.reasons.join(",")}`);
    }
  }

  const currentManifest = JSON.parse(await readFile(path.join(ROOT, MANIFEST_PATH), "utf8"));
  const manifest = {
    schemaVersion: "route-v2-evidence-seed-v1",
    country: "MULTI",
    countries: [...new Set([...(currentManifest.countries || []), ISO])].sort(),
    routeLegEvidenceIds: routeLegs.map((record) => record.legEvidenceId),
    seasonEvidenceIds: seasons.map((record) => record.seasonEvidenceId),
    counts: {
      routeLeg: routeLegs.length,
      season: seasons.length,
      total: routeLegs.length + seasons.length,
    },
    promotedEvidenceHash: stableHash({ routeLegs, seasons }),
  };
  await atomicText(
    ROUTE_LEG_PATH,
    `${routeLegs.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  await atomicText(
    SEASON_PATH,
    `${seasons.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  await atomicText(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    country: ISO,
    addedDirectedRouteLegs: additions.length,
    addedSeasonEvidence: seasonAdditions.length,
    counts: manifest.counts,
  }, null, 2));
}

await main();
