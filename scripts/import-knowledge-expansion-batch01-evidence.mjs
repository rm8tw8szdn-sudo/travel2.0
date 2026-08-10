import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createTypedEntityId } from "../src/lib/routes/knowledge-entity-layer-primitives.mjs";
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
const NOW = "2026-08-03T08:30:00.000Z";

const CITIES = Object.freeze(Object.fromEntries([
  ["reykjavik", "Q1764"], ["vik", "Q685369"], ["bangkok", "Q1861"], ["chiang-mai", "Q52028"],
  ["zurich", "Q72"], ["lucerne", "Q4191"], ["auckland", "Q37100"], ["queenstown", "Q613602"],
  ["sydney", "Q3130"], ["melbourne", "Q3141"], ["seoul", "Q8684"], ["busan", "Q16520"],
].map(([key, qid]) => [key, createTypedEntityId({ entityType: "city", wikidataId: qid })])));

function source({ url, supports, locator, excerpt, confidence = 0.9 }) {
  return normalizeLocalEvidenceSource({
    url, supports, retrievedAt: NOW, confidence,
    factLocator: locator, factExcerpt: excerpt,
    contentHash: sha256EvidenceContent(excerpt),
  });
}

function leg({ from, to, mode, url, locator, excerpt, min = null, max = null, transfers = null, frequency = "unknown" }) {
  const fromEntityId = CITIES[from];
  const toEntityId = CITIES[to];
  const supports = [`route-leg:${fromEntityId}>${toEntityId}:feasibility`, ...(min == null ? [] : [`route-leg:${fromEntityId}>${toEntityId}:duration`])];
  const evidenceSource = source({ url, supports, locator, excerpt });
  const record = normalizeRouteLegEvidence({
    fromEntityId, toEntityId, transportMode: mode, directed: true,
    feasibilityStatus: "feasible", durationMinMinutes: min, durationMaxMinutes: max,
    transferCount: transfers, frequencyLevel: frequency,
    sourceRefs: [evidenceSource.sourceId], sources: [evidenceSource], confidence: 0.9,
    freshnessStatus: "fresh", retrievedAt: NOW, expiresAt: null,
    unknowns: [
      ...(min == null ? [{ field: "duration", reason: "The official source confirms the connection but does not provide a stable reusable duration." }] : []),
      ...(transfers == null ? [{ field: "transferCount", reason: "The official source does not provide a reusable transfer count." }] : []),
      ...(frequency === "unknown" ? [{ field: "frequencyLevel", reason: "The official source does not provide a reusable service frequency." }] : []),
    ], conflicts: [], diagnostics: [], createdAt: NOW, updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateRouteLegEvidence(record);
  if (!validation.accepted) throw new Error(`invalid-leg:${from}>${to}:${validation.reasons.join(",")}`);
  return validation.record;
}

function season({ city, month, url, locator, excerpt, weather = [], transport = [], closure = [] }) {
  const entityId = CITIES[city];
  const supports = [`season:${entityId}:${month}:risk`];
  const evidenceSource = source({ url, supports, locator, excerpt, confidence: 0.85 });
  const record = normalizeSeasonEvidence({
    entityId, month, season: null, suitabilityStatus: "unknown",
    weatherRisks: weather, transportRisks: transport, closureRisks: closure,
    recommendedBufferMinutes: null, sourceRefs: [evidenceSource.sourceId], sources: [evidenceSource],
    confidence: 0.85, freshnessStatus: "fresh", retrievedAt: NOW, expiresAt: null,
    unknowns: [{ field: "seasonSuitability", reason: "This record preserves an official hard-risk observation only and does not infer a best travel month or general suitability." }],
    conflicts: [], diagnostics: [], createdAt: NOW, updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateSeasonEvidence(record);
  if (!validation.accepted) throw new Error(`invalid-season:${city}:${month}:${validation.reasons.join(",")}`);
  return validation.record;
}

const NEW_LEGS = [
  leg({ from: "reykjavik", to: "vik", mode: "bus", url: "https://www.straeto.is/en/user-information/news/changed-route-system-in-the-countryside", locator: "Route 52 South Iceland service", excerpt: "Strætó's official route update identifies Route 52 as the Reykjavík–Höfn service and includes Vík in the South Iceland operating pattern." }),
  leg({ from: "vik", to: "reykjavik", mode: "bus", url: "https://www.straeto.is/media/2026/03/gjaldskra-stakar-ferdir-sudurland-2026.pdf", locator: "South Iceland fares: Mjódd and Vík", excerpt: "The official South Iceland fare table lists both Reykjavík's Mjódd terminal and Vík on the regional Strætó network." }),
  leg({ from: "bangkok", to: "chiang-mai", mode: "rail", url: "https://www.railway.co.th/Service/Passenger_detail?value1=0049613716F4864B9ED01F76DB703841020000002E5BAB26358500DA1EAEF1D224158E6E74ACE99FD36F6E274B3D6D5B27BCA48B&value2=0049613716F4864B9ED01F76DB703841020000001C7DF86A1BF1D1AF145DA950EB0118DB52E449866F3E6B399B81702CF92E6938", locator: "Train 51 timetable", excerpt: "State Railway of Thailand lists Train 51 from Krung Thep Aphiwat to Chiang Mai, departing 22:30 and arriving 11:40.", min: 790, max: 790, transfers: 0, frequency: "scheduled" }),
  leg({ from: "chiang-mai", to: "bangkok", mode: "rail", url: "https://www.railway.co.th/Service/Passenger_detail?value1=0049613716F4864B9ED01F76DB703841020000002E5BAB26358500DA1EAEF1D224158E6E74ACE99FD36F6E274B3D6D5B27BCA48B&value2=0049613716F4864B9ED01F76DB703841020000001C7DF86A1BF1D1AF145DA950EB0118DB52E449866F3E6B399B81702CF92E6938", locator: "Train 52 timetable", excerpt: "State Railway of Thailand lists Train 52 from Chiang Mai to Krung Thep Aphiwat, departing 15:30 and arriving 05:10.", min: 820, max: 820, transfers: 0, frequency: "scheduled" }),
  leg({ from: "zurich", to: "lucerne", mode: "rail", url: "https://www.sbb.ch/en/travel-information/services-on-train/our-trains/giruno.html", locator: "Giruno operation routes", excerpt: "Swiss Federal Railways states that Giruno trains operate on the Zürich–Zug–Lucerne rail line." }),
  leg({ from: "lucerne", to: "zurich", mode: "rail", url: "https://www.sbb.ch/en/travel-information/services-on-train/our-trains/giruno.html", locator: "Giruno operation routes", excerpt: "Swiss Federal Railways identifies Zürich, Zug and Lucerne as stations on the same Giruno operating line, confirming the reverse city pair is rail-connected." }),
  leg({ from: "auckland", to: "queenstown", mode: "flight", url: "https://www.airnewzealand.co.nz/flights/en-nz/flights-from-auckland-to-queenstown", locator: "Auckland to Queenstown flight FAQ", excerpt: "Air New Zealand states that Auckland to Queenstown flights are non-stop and take about 1 hour 55 minutes.", min: 115, max: 115, transfers: 0, frequency: "multiple-daily" }),
  leg({ from: "queenstown", to: "auckland", mode: "flight", url: "https://www.airnewzealand.co.nz/flights/en-nz/flights-from-queenstown-to-auckland", locator: "Queenstown to Auckland flight FAQ", excerpt: "Air New Zealand states that direct Queenstown to Auckland flights take about 1 hour 50 minutes and operate up to five times daily.", min: 110, max: 110, transfers: 0, frequency: "multiple-daily" }),
  leg({ from: "sydney", to: "melbourne", mode: "rail", url: "https://transportnsw.info/destination-route/SYD/MEL", locator: "Sydney to Melbourne by train", excerpt: "Transport for NSW lists a direct NSW TrainLink journey from Sydney Central to Melbourne Southern Cross with a shortest duration of 10 hours 48 minutes.", min: 648, max: 648, transfers: 0, frequency: "daily" }),
  leg({ from: "melbourne", to: "sydney", mode: "rail", url: "https://transportnsw.info/destination-route/MEL/SYD", locator: "Melbourne to Sydney by train", excerpt: "Transport for NSW lists the Melbourne Southern Cross to Sydney Central NSW TrainLink journey with a shortest duration of 10 hours 57 minutes.", min: 657, max: 657, transfers: 0, frequency: "daily" }),
  leg({ from: "seoul", to: "busan", mode: "rail", url: "https://info.korail.com/", locator: "KORAIL ticket search defaults", excerpt: "KORAIL's official ticket search exposes Seoul as the departure station and Busan as the arrival station for a passenger rail search." }),
  leg({ from: "busan", to: "seoul", mode: "rail", url: "https://info.korail.com/info/selectBbsNttView.do?bbsNo=199&integrDeptCode=&key=911&nttNo=5115&pageIndex=384&searchCnd=SJ&searchCtgry=&searchKrwd=", locator: "Gyeongbu KTX operations", excerpt: "KORAIL's official Gyeongbu KTX notice documents Seoul–Busan train operations on the national high-speed rail corridor." }),
];

const NEW_SEASONS = [
  season({ city: "reykjavik", month: 1, url: "https://en.vedur.is/about-imo/news/the-weather-in-iceland-in-2023", locator: "January snow conditions", excerpt: "The Icelandic Meteorological Office recorded heavy snow cover in Reykjavík in January 2023.", weather: ["heavy-snow-risk"], transport: ["winter-traffic-disruption-risk"] }),
  season({ city: "reykjavik", month: 2, url: "https://en.vedur.is/about-imo/news/the-weather-in-iceland-in-2022", locator: "February snow and traffic", excerpt: "The Icelandic Meteorological Office reported heavy countrywide snow in February 2022 and common traffic disruption; Reykjavík had one of its snowiest Februarys in years.", weather: ["heavy-snow-risk"], transport: ["winter-traffic-disruption-risk"] }),
  season({ city: "vik", month: 1, url: "https://en.vedur.is/weather/articles/nr/1206", locator: "January precipitation", excerpt: "The Icelandic Meteorological Office reported changeable January weather with heavy precipitation in South and West Iceland.", weather: ["heavy-precipitation-risk"], transport: ["winter-road-condition-risk"] }),
  season({ city: "vik", month: 2, url: "https://en.vedur.is/about-imo/news/the-weather-in-iceland-in-2022", locator: "February countrywide snow", excerpt: "The Icelandic Meteorological Office reported cold conditions and heavy snow across Iceland in February 2022 with common traffic disruption.", weather: ["heavy-snow-risk"], transport: ["winter-traffic-disruption-risk"] }),
  season({ city: "bangkok", month: 4, url: "https://www.tmd.go.th/en/warning-and-events/warning-storm/summer-storm-in-upper-thailand-no-8-75-2024", locator: "Summer storm warning", excerpt: "The Thai Meteorological Department warned of hot to very hot conditions and summer storms affecting Bangkok in April.", weather: ["extreme-heat-risk", "severe-storm-risk"] }),
  season({ city: "bangkok", month: 9, url: "https://www.tmd.go.th/en/warning-and-events/warning-storm/heavy-to-very-heavy-rains-in-thailand-strong-wind-waves-in-the-andaman-sea-and-the-upper-gulf-no-3-158-2024", locator: "Heavy rain warning", excerpt: "The Thai Meteorological Department included Bangkok in a September warning for heavy rain with flash-flood and overflow risk.", weather: ["heavy-rain-risk", "flash-flood-risk"] }),
  season({ city: "chiang-mai", month: 4, url: "https://www.tmd.go.th/en/warning-and-events/warning-storm/summer-storm-in-upper-thailand-no-8-75-2024", locator: "Summer storm warning", excerpt: "The Thai Meteorological Department warned of hot to very hot conditions and summer storms affecting Chiang Mai in April.", weather: ["extreme-heat-risk", "severe-storm-risk"] }),
  season({ city: "chiang-mai", month: 9, url: "https://www.tmd.go.th/en/warning-and-events/warning-storm/heavy-to-very-heavy-rains-in-thailand-strong-wind-waves-in-the-andaman-sea-and-the-upper-gulf-no-3-158-2024", locator: "Heavy rain warning", excerpt: "The Thai Meteorological Department included Chiang Mai in a September warning for heavy rain with flash-flood and overflow risk.", weather: ["heavy-rain-risk", "flash-flood-risk"] }),
  season({ city: "zurich", month: 1, url: "https://www.meteoswiss.admin.ch/weather/weather-and-climate-from-a-to-z/snow.html", locator: "Snow hazards", excerpt: "MeteoSwiss documents snow and ice as winter hazards that can affect Swiss transport and road conditions.", weather: ["snow-or-ice-risk"], transport: ["winter-transport-disruption-risk"] }),
  season({ city: "zurich", month: 7, url: "https://www.meteoswiss.admin.ch/climate/the-climate-of-switzerland.html", locator: "Swiss summer heat", excerpt: "MeteoSwiss identifies June, July and August as the period of Switzerland's longest and most intense heatwaves.", weather: ["heatwave-risk"] }),
  season({ city: "lucerne", month: 1, url: "https://www.meteoswiss.admin.ch/weather/weather-and-climate-from-a-to-z/snow.html", locator: "Snow hazards", excerpt: "MeteoSwiss documents snow and ice as winter hazards that can affect Swiss transport and road conditions.", weather: ["snow-or-ice-risk"], transport: ["winter-transport-disruption-risk"] }),
  season({ city: "lucerne", month: 7, url: "https://www.meteoswiss.admin.ch/climate/the-climate-of-switzerland.html", locator: "Swiss summer heat", excerpt: "MeteoSwiss identifies June, July and August as the period of Switzerland's longest and most intense heatwaves.", weather: ["heatwave-risk"] }),
  season({ city: "auckland", month: 1, url: "https://niwa.co.nz/news/auckland-suffers-wettest-month-history", locator: "January 2023 Auckland flooding", excerpt: "Earth Sciences New Zealand recorded exceptional January rainfall and widespread flooding across Auckland in 2023.", weather: ["extreme-rainfall-risk", "flood-risk"] }),
  season({ city: "auckland", month: 7, url: "https://niwa.co.nz/sites/default/files/Climate_Summary_July_2023_Final.pdf", locator: "July 2023 Auckland impacts", excerpt: "Earth Sciences New Zealand's July 2023 summary reports heavy rain, flooding and slips in parts of Auckland.", weather: ["heavy-rain-risk", "flood-or-slip-risk"] }),
  season({ city: "queenstown", month: 4, url: "https://niwa.co.nz/climate-and-weather/annual/annual-climate-summary-2010", locator: "April southwest South Island flooding", excerpt: "Earth Sciences New Zealand reported heavy April rain and flooding in the southwest South Island, including Lake Wakatipu reaching flood-threshold levels.", weather: ["heavy-rain-risk", "lake-flood-risk"] }),
  season({ city: "queenstown", month: 7, url: "https://niwa.co.nz/sites/default/files/Climate_Summary_July_2020_NIWA.pdf", locator: "July snow near Queenstown", excerpt: "Earth Sciences New Zealand reported July snow near Queenstown, chain requirements on Crown Range Road and heavy-snow road closures in the region.", weather: ["snow-or-ice-risk"], transport: ["road-chain-or-closure-risk"] }),
  season({ city: "sydney", month: 1, url: "https://www.bom.gov.au/climate/current/month/nsw/archive/202001.sydney.shtml", locator: "January 2020 Greater Sydney", excerpt: "The Australian Bureau of Meteorology reported exceptional January heat, elevated fire danger and continuing bushfire smoke across Greater Sydney.", weather: ["extreme-heat-risk", "bushfire-smoke-risk"] }),
  season({ city: "sydney", month: 3, url: "https://www.bom.gov.au/climate/current/statements/scs76.pdf", locator: "Sydney and NSW coast extreme rainfall", excerpt: "The Australian Bureau of Meteorology documented extreme rainfall, severe-weather warnings and flooding affecting Sydney and the central and southern New South Wales coast.", weather: ["extreme-rainfall-risk", "flood-risk"] }),
  season({ city: "melbourne", month: 1, url: "https://www.bom.gov.au/climate/current/annual/vic/melbourne.shtml", locator: "Greater Melbourne January heat", excerpt: "The Australian Bureau of Meteorology recorded temperatures above 42°C in Greater Melbourne during January 2025.", weather: ["extreme-heat-risk", "fire-weather-risk"] }),
  season({ city: "melbourne", month: 7, url: "https://www.bom.gov.au/climate/current/annual/vic/melbourne.shtml", locator: "Greater Melbourne July wind", excerpt: "The Australian Bureau of Meteorology recorded a 120 km/h July wind gust in Greater Melbourne during 2025.", weather: ["damaging-wind-risk"] }),
];

function parseJsonl(text) {
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function atomicText(relativePath, text) {
  const filePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try { await writeFile(temporary, text, "utf8"); await rename(temporary, filePath); }
  finally { await rm(temporary, { force: true }); }
}

function upsert(existing, additions, idField) {
  const map = new Map(existing.map((record) => [record[idField], record]));
  for (const record of additions) map.set(record[idField], record);
  return [...map.values()].sort((left, right) => left[idField].localeCompare(right[idField], "en"));
}

async function main() {
  const existingLegs = parseJsonl(await readFile(path.join(ROOT, ROUTE_LEG_PATH), "utf8"));
  const existingSeasons = parseJsonl(await readFile(path.join(ROOT, SEASON_PATH), "utf8"));
  const routeLegs = upsert(existingLegs, NEW_LEGS, "legEvidenceId");
  const seasons = upsert(existingSeasons, NEW_SEASONS, "seasonEvidenceId");
  for (const record of routeLegs) { const result = validateRouteLegEvidence(record); if (!result.accepted) throw new Error(`route-leg-invalid:${result.reasons}`); }
  for (const record of seasons) { const result = validateSeasonEvidence(record); if (!result.accepted) throw new Error(`season-invalid:${result.reasons}`); }
  const manifest = {
    schemaVersion: "route-v2-evidence-seed-v1", country: "MULTI",
    countries: ["AU", "CH", "IS", "JP", "KR", "NZ", "TH"],
    routeLegEvidenceIds: routeLegs.map((record) => record.legEvidenceId),
    seasonEvidenceIds: seasons.map((record) => record.seasonEvidenceId),
    counts: { routeLeg: routeLegs.length, season: seasons.length, total: routeLegs.length + seasons.length },
    promotedEvidenceHash: stableHash({ routeLegs, seasons }),
  };
  await atomicText(ROUTE_LEG_PATH, `${routeLegs.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(SEASON_PATH, `${seasons.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ addedRouteLegs: NEW_LEGS.length, addedSeasons: NEW_SEASONS.length, counts: manifest.counts }, null, 2));
}

await main();
