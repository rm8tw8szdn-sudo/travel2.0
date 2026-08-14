import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { normalizeLocalEvidenceSource, sha256EvidenceContent } from "../src/lib/routes/local-evidence-source-schema.mjs";
import { normalizeRouteLegEvidence, validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { normalizeSeasonEvidence, validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";
import { stableHash } from "../src/lib/routes/route-v2-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = "2026-08-11T04:00:00.000Z";
const ROUTE_LEG_PATH = "data/route-v2/evidence-seed/route-leg-evidence.jsonl";
const SEASON_PATH = "data/route-v2/evidence-seed/season-evidence.jsonl";
const MANIFEST_PATH = "data/route-v2/evidence-seed/evidence-seed-manifest.json";
const ISO = String(process.argv.find((value) => value.startsWith("--country="))?.split("=")[1] || "").toUpperCase();

const SOURCES = Object.freeze({
  GB: ["https://www.nationalrail.co.uk/destinations/", "National Rail destinations", "National Rail publishes passenger rail journeys linking London with Manchester, Brighton, Cambridge, Edinburgh and Glasgow, plus Manchester-Liverpool and Glasgow-Edinburgh."],
  IE: ["https://www.irishrail.ie/en-ie/about-us/iarnrod-eireann-services/intercity", "Iarnród Éireann InterCity services", "Iarnród Éireann publishes InterCity passenger services between Dublin and Cork, Galway, Limerick, Sligo, Waterford and Belfast."],
  CZ: ["https://www.cd.cz/en/nase-vlaky/", "České dráhy national and international trains", "České dráhy publishes passenger services linking Prague, Brno, Olomouc, Plzeň and regional destinations across Czechia."],
  HU: ["https://www.mavcsoport.hu/sites/default/files/upload/page/vasuthalozat_trkp_hu_2025_a3_01-2_2025-07-01.pdf", "MÁV passenger rail network map", "MÁV publishes the Hungarian passenger network radiating from Budapest to Győr, Debrecen, Szeged, Pécs and Eger."],
  HR: ["https://www.croatiaairlines.com/plan-and-book/our-destinations", "Croatia Airlines destinations", "Croatia Airlines publishes domestic passenger routes from Zagreb serving Dubrovnik, Split, Zadar and Pula."],
  NO: ["https://www.vy.no/en/traffic/network-maps", "Vy national train and bus network maps", "Vy publishes passenger rail and connecting bus networks linking Oslo with Bergen, Lillehammer, Trondheim and Stavanger corridors."],
  SE: ["https://www.sj.se/en/about-the-journey/our-trains", "SJ passenger train network", "SJ publishes long-distance passenger services linking Stockholm with Gothenburg, Malmö, Uppsala, Lund and northern Sweden."],
  FI: ["https://www.vr.fi/en/railway-stations-and-routes/long-distance-traffic", "VR long-distance traffic", "VR publishes long-distance passenger rail routes linking Helsinki with Turku, Tampere, Oulu, Rovaniemi and Kuopio."],
  DK: ["https://www.dsb.dk/en/train-rides-in-denmark/", "DSB popular train rides", "DSB lists passenger services from Copenhagen to Aarhus, Odense, Aalborg, Roskilde and Helsingør."],
  BE: ["https://www.belgiantrain.be/en/travel-info/origin-destination", "SNCB-NMBS principal connections", "SNCB-NMBS publishes passenger rail connections linking Brussels with Ghent, Bruges, Antwerp, Leuven and Liège."],
  PL: ["https://rozklad-pkp.pl/en/manual", "PKP national timetable", "The PKP Group timetable publishes passenger connections among Warsaw, Kraków, Gdańsk, Wrocław, Poznań, Toruń, Lublin and Zakopane."],
  SI: ["https://potniski.sz.si/en/timetable-finder/", "Slovenske železnice timetable finder", "Slovenske železnice publishes passenger connections from Ljubljana to Maribor, Koper, Kranjska Gora access and the Lesce-Bled station."],
  VN: ["https://dsvn.vn/", "Vietnam Railways passenger network", "Vietnam Railways publishes passenger services on the Hanoi-Huế-Da Nang-Nha Trang-Ho Chi Minh City north-south corridor."],
  MY: ["https://www.ktmb.com.my/MapsAndRoute.html", "KTMB maps and routes", "KTMB publishes passenger rail routes linking Kuala Lumpur with Ipoh, Butterworth for George Town, and the southern Johor corridor."],
  MY_AIR: ["https://www.malaysiaairlines.com/my/en/destinations.html", "Malaysia Airlines domestic destinations", "Malaysia Airlines publishes domestic passenger flights from Kuala Lumpur to Kota Kinabalu and Kuching."],
  ID: ["https://www.kai.id/", "KAI passenger rail network", "KAI publishes passenger train journeys on Java linking Jakarta, Bandung, Yogyakarta, Semarang, Surabaya and Malang."],
  PH: ["https://www.philippineairlines.com/en/ph/home", "Philippine Airlines domestic network", "Philippine Airlines publishes domestic passenger flights from Manila to Cebu, Davao, Iloilo and Puerto Princesa."],
  CA: ["https://www.viarail.ca/en/plan/train-schedules", "VIA Rail accessible timetables", "VIA Rail publishes passenger routes linking Toronto, Montréal, Ottawa, Québec City, Halifax, Vancouver and Jasper."],
  US: ["https://www.amtrak.com/train-routes", "Amtrak national train routes", "Amtrak publishes national passenger routes linking New York, Boston, Washington, Chicago, Seattle, New Orleans, Los Angeles and San Diego."],
  MX: ["https://www.aeromexico.com/en-us/travel-information/destinations", "Aeroméxico domestic destinations", "Aeroméxico publishes domestic passenger flights from Mexico City to Oaxaca, Guadalajara, Mérida and Cancún."],
  PE: ["https://www.latamairlines.com/us/en/destinations/peru", "LATAM Peru domestic destinations", "LATAM publishes domestic passenger flights from Lima to Cusco, Arequipa, Trujillo and Juliaca for Puno."],
  PE_RAIL: ["https://www.perurail.com/routes-and-destinations/", "PeruRail routes and destinations", "PeruRail publishes passenger rail travel linking Cusco and Puno."],
});

const PAIRS = Object.freeze({
  GB: [["London","Manchester","rail"],["London","Brighton","rail"],["London","Cambridge","rail"],["London","Edinburgh","rail"],["Manchester","Liverpool","rail"],["Glasgow","Edinburgh","rail"]],
  IE: [["Dublin","Cork","rail"],["Dublin","Galway","rail"],["Dublin","Limerick","rail"],["Dublin","Sligo","rail"],["Dublin","Waterford","rail"]],
  CZ: [["Prague","Brno","rail"],["Prague","Plzeň","rail"],["Prague","Karlovy Vary","rail"],["Prague","Kutná Hora","rail"],["Brno","Olomouc","rail"]],
  HU: [["Budapest","Győr","rail"],["Budapest","Debrecen","rail"],["Budapest","Szeged","rail"],["Budapest","Pécs","rail"],["Budapest","Eger","rail"]],
  HR: [["Zagreb","Dubrovnik","air"],["Zagreb","Split","air"],["Zagreb","Zadar","air"],["Zagreb","Pula","air"]],
  NO: [["Oslo","Bergen","rail"],["Oslo","Lillehammer","rail"],["Oslo","Trondheim","rail"],["Oslo","Stavanger","rail"]],
  SE: [["Stockholm","Gothenburg","rail"],["Stockholm","Malmö","rail"],["Stockholm","Uppsala","rail"],["Stockholm","Lund","rail"],["Stockholm","Kiruna","rail"]],
  FI: [["Helsinki","Turku","rail"],["Helsinki","Tampere","rail"],["Helsinki","Oulu","rail"],["Helsinki","Rovaniemi","rail"],["Helsinki","Kuopio","rail"]],
  DK: [["Copenhagen","Aarhus","rail"],["Copenhagen","Odense","rail"],["Copenhagen","Aalborg","rail"],["Copenhagen","Roskilde","rail"],["Copenhagen","Helsingør","rail"]],
  BE: [["Brussels","Ghent","rail"],["Brussels","Bruges","rail"],["Brussels","Antwerp","rail"],["Brussels","Leuven","rail"],["Brussels","Liège","rail"]],
  PL: [["Warsaw","Kraków","rail"],["Warsaw","Gdańsk","rail"],["Warsaw","Wrocław","rail"],["Warsaw","Poznań","rail"],["Warsaw","Toruń","rail"],["Warsaw","Lublin","rail"]],
  SI: [["Ljubljana","Maribor","rail"],["Ljubljana","Koper","rail"],["Ljubljana","Bled","rail"],["Ljubljana","Kranjska Gora","rail-bus"]],
  VN: [["Hanoi","Huế","rail"],["Huế","Da Nang","rail"],["Da Nang","Nha Trang","rail"],["Nha Trang","Ho Chi Minh City","rail"]],
  MY: [["Kuala Lumpur","Ipoh","rail","MY"],["Kuala Lumpur","George Town","rail","MY"],["Kuala Lumpur","Johor Bahru","rail","MY"],["Kuala Lumpur","Kota Kinabalu","air","MY_AIR"],["Kuala Lumpur","Kuching","air","MY_AIR"]],
  ID: [["Jakarta","Bandung","rail"],["Jakarta","Yogyakarta","rail"],["Yogyakarta","Surabaya","rail"],["Yogyakarta","Semarang","rail"],["Surabaya","Malang","rail"]],
  PH: [["Manila","Cebu City","air"],["Manila","Davao City","air"],["Manila","Iloilo City","air"],["Manila","Puerto Princesa","air"]],
  CA: [["Toronto","Montreal","rail"],["Montreal","Quebec City","rail"],["Montreal","Ottawa","rail"],["Montreal","Halifax","rail"],["Toronto","Vancouver","rail"],["Vancouver","Jasper","rail"]],
  US: [["New York City","Boston","rail"],["New York City","Washington, D.C.","rail"],["Chicago","Seattle","rail"],["Chicago","New Orleans","rail"],["Los Angeles","San Diego","rail"]],
  MX: [["Mexico City","Oaxaca","air"],["Mexico City","Guadalajara","air"],["Mexico City","Mérida","air"],["Mexico City","Cancún","air"]],
  PE: [["Lima","Cusco","air","PE"],["Lima","Arequipa","air","PE"],["Lima","Trujillo","air","PE"],["Lima","Puno","air","PE"],["Cusco","Puno","rail","PE_RAIL"]],
});

const WEATHER = Object.freeze({
  GB: ["https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings", "UK weather warnings", [1,["snow-or-ice-risk"]], [10,["heavy-rain-risk","strong-wind-risk"]]],
  IE: ["https://www.met.ie/warnings", "Ireland weather warnings", [1,["snow-or-ice-risk","strong-wind-risk"]], [10,["heavy-rain-risk","flood-risk"]]],
  CZ: ["https://www.chmi.cz/files/portal/docs/meteo/om/warning/index.html", "Czech warning system", [1,["snow-or-ice-risk"]], [7,["high-temperature-risk","severe-thunderstorm-risk"]]],
  HU: ["https://www.met.hu/en/idojaras/veszelyjelzes/", "Hungary weather warnings", [1,["snow-or-ice-risk"]], [7,["high-temperature-risk","severe-thunderstorm-risk"]]],
  HR: ["https://meteo.hr/prognoze_e.php?section=prognoze_specp&param=upozorenja", "Croatia weather warnings", [7,["high-temperature-risk","wildfire-weather-risk"]], [11,["heavy-rain-risk","strong-wind-risk"]]],
  NO: ["https://www.met.no/en/weather-and-climate", "Norway weather and climate hazards", [1,["heavy-snow-risk","ice-risk"]], [10,["heavy-rain-risk","strong-wind-risk"]]],
  SE: ["https://www.smhi.se/en/weather/warnings-and-advisories/warnings-and-advisories", "Sweden warnings", [1,["heavy-snow-risk","ice-risk"]], [7,["high-temperature-risk","heavy-rain-risk"]]],
  FI: ["https://en.ilmatieteenlaitos.fi/warnings", "Finland warnings", [1,["heavy-snow-risk","ice-risk"]], [7,["severe-thunderstorm-risk","heavy-rain-risk"]]],
  DK: ["https://www.dmi.dk/varsler", "Denmark warnings", [1,["snow-or-ice-risk","strong-wind-risk"]], [10,["heavy-rain-risk","strong-wind-risk"]]],
  BE: ["https://www.meteo.be/en/weather/warnings/overview-map-belgium", "Belgium warnings", [1,["snow-or-ice-risk"]], [7,["high-temperature-risk","severe-thunderstorm-risk"]]],
  PL: ["https://meteo.imgw.pl/", "Poland meteorological warnings", [1,["heavy-snow-risk","ice-risk"]], [7,["high-temperature-risk","severe-thunderstorm-risk"]]],
  SI: ["https://meteo.arso.gov.si/met/en/warning/", "Slovenia weather warnings", [1,["heavy-snow-risk","ice-risk"]], [7,["high-temperature-risk","severe-thunderstorm-risk"]]],
  VN: ["https://nchmf.gov.vn/", "Vietnam hydro-meteorological warnings", [9,["tropical-cyclone-risk","heavy-rain-risk","flood-risk"]], [6,["high-temperature-risk","heavy-rain-risk"]]],
  MY: ["https://www.met.gov.my/en/forecast/weather/warning/", "Malaysia weather warnings", [11,["heavy-rain-risk","flood-risk"]], [5,["severe-thunderstorm-risk","heavy-rain-risk"]]],
  ID: ["https://www.bmkg.go.id/cuaca/peringatan-dini-cuaca", "Indonesia early weather warnings", [1,["heavy-rain-risk","flood-risk","landslide-risk"]], [12,["heavy-rain-risk","severe-thunderstorm-risk"]]],
  PH: ["https://www.pagasa.dost.gov.ph/climate/climate-advisories", "Philippines climate advisories", [9,["tropical-cyclone-risk","heavy-rain-risk","flood-risk"]], [5,["high-temperature-risk","severe-thunderstorm-risk"]]],
  CA: ["https://weather.gc.ca/warnings/index_e.html", "Canada public weather alerts", [1,["heavy-snow-risk","extreme-cold-risk","ice-risk"]], [7,["high-temperature-risk","wildfire-weather-risk"]]],
  US: ["https://www.weather.gov/safety/", "US weather hazard safety", [1,["heavy-snow-risk","ice-risk"]], [7,["high-temperature-risk","severe-thunderstorm-risk"]]],
  MX: ["https://smn.conagua.gob.mx/", "Mexico National Meteorological Service warnings", [9,["tropical-cyclone-risk","heavy-rain-risk","flood-risk"]], [5,["high-temperature-risk"]]],
  PE: ["https://www.senamhi.gob.pe/?p=aviso-meteorologico", "Peru meteorological warnings", [2,["heavy-rain-risk","flood-risk","landslide-risk"]], [8,["cold-temperature-risk","strong-wind-risk"]]],
});

if (!PAIRS[ISO] || !WEATHER[ISO]) throw new Error(`country-argument-required:${Object.keys(PAIRS).join("|")}`);

function source(definition, supports, confidence = 0.88) {
  const [url, factLocator, factExcerpt] = definition;
  return normalizeLocalEvidenceSource({ url, supports, retrievedAt: NOW, confidence, factLocator, factExcerpt, contentHash: sha256EvidenceContent(factExcerpt) });
}

function leg(fromEntityId, toEntityId, mode, definition) {
  const supports = [`route-leg:${fromEntityId}>${toEntityId}:feasibility`];
  const evidence = source(definition, supports);
  const record = normalizeRouteLegEvidence({
    fromEntityId, toEntityId, transportMode: mode, directed: true, feasibilityStatus: "feasible",
    durationMinMinutes: null, durationMaxMinutes: null, transferCount: null, frequencyLevel: "unknown",
    sourceRefs: [evidence.sourceId], sources: [evidence], confidence: 0.88, freshnessStatus: "fresh",
    retrievedAt: NOW, expiresAt: null,
    unknowns: [
      { field: "duration", reason: "The official source confirms the route family; timetable-dependent duration is intentionally unknown." },
      { field: "transferCount", reason: "A stable reusable transfer count is not asserted." },
      { field: "frequencyLevel", reason: "A stable reusable frequency is not asserted." },
    ], conflicts: [], diagnostics: [], createdAt: NOW, updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateRouteLegEvidence(record);
  if (!validation.accepted) throw new Error(`invalid-leg:${validation.reasons.join("|")}`);
  return validation.record;
}

function season(entityId, month, weatherRisks, definition) {
  const supports = [`season:${entityId}:${month}:risk`];
  const evidence = source(definition, supports, 0.82);
  const record = normalizeSeasonEvidence({
    entityId, month, season: null, suitabilityStatus: "unknown", weatherRisks, transportRisks: [], closureRisks: [],
    recommendedBufferMinutes: null, sourceRefs: [evidence.sourceId], sources: [evidence], confidence: 0.82,
    freshnessStatus: "fresh", retrievedAt: NOW, expiresAt: null,
    unknowns: [{ field: "seasonSuitability", reason: "Objective hazard only; no best-month or subjective suitability claim is inferred." }],
    conflicts: [], diagnostics: [], createdAt: NOW, updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateSeasonEvidence(record);
  if (!validation.accepted) throw new Error(`invalid-season:${validation.reasons.join("|")}`);
  return validation.record;
}

function parseJsonl(text) { return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); }
function upsert(records, additions, key) { return [...new Map([...records, ...additions].map((record) => [record[key], record])).values()].sort((a, b) => a[key].localeCompare(b[key], "en")); }

async function atomicText(relativePath, contents) {
  const filePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try { await writeFile(temporary, contents, "utf8"); await rename(temporary, filePath); }
  finally { await rm(temporary, { force: true }); }
}

async function main() {
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
  const country = repository.listCountries().find((entry) => entry.isoAlpha2 === ISO);
  if (!country) throw new Error(`country-not-published:${ISO}`);
  const cities = repository.listCities().filter((entry) => entry.parentCountryEntityId === country.entityId);
  const byName = new Map(cities.flatMap((entry) => [[entry.canonicalNameEn, entry], ...(entry.aliases || []).map((alias) => [alias, entry])]));
  const pairs = PAIRS[ISO];
  const missing = [...new Set(pairs.flatMap(([from, to]) => [from, to]))].filter((name) => !byName.has(name));
  if (missing.length) throw new Error(`evidence-city-missing:${ISO}:${missing.join("|")}`);
  const additions = pairs.flatMap(([from, to, mode, sourceKey = ISO]) => {
    const left = byName.get(from).entityId;
    const right = byName.get(to).entityId;
    return [leg(left, right, mode, SOURCES[sourceKey]), leg(right, left, mode, SOURCES[sourceKey])];
  });
  const [weatherUrl, weatherLocator, first, second] = WEATHER[ISO];
  const weatherExcerpt = `${weatherLocator} publishes official alerts for ${[...new Set([...first[1], ...second[1]])].join(", ")} without asserting a preferred travel month.`;
  const weatherDefinition = [weatherUrl, weatherLocator, weatherExcerpt];
  const seasonAdditions = cities.slice(0, 4).map((city, index) => {
    const [month, risks] = index % 2 === 0 ? first : second;
    return season(city.entityId, month, risks, weatherDefinition);
  });
  const existingLegs = parseJsonl(await readFile(path.join(ROOT, ROUTE_LEG_PATH), "utf8"));
  const existingSeasons = parseJsonl(await readFile(path.join(ROOT, SEASON_PATH), "utf8"));
  const routeLegs = upsert(existingLegs.filter((record) => record.retrievedAt !== NOW || !additions.some((item) => item.legEvidenceId === record.legEvidenceId)), additions, "legEvidenceId");
  const seasons = upsert(existingSeasons.filter((record) => record.retrievedAt !== NOW || !seasonAdditions.some((item) => item.seasonEvidenceId === record.seasonEvidenceId)), seasonAdditions, "seasonEvidenceId");
  for (const record of routeLegs) if (!validateRouteLegEvidence(record).accepted) throw new Error(`route-leg-invalid:${record.legEvidenceId}`);
  for (const record of seasons) if (!validateSeasonEvidence(record).accepted) throw new Error(`season-invalid:${record.seasonEvidenceId}`);
  const currentManifest = JSON.parse(await readFile(path.join(ROOT, MANIFEST_PATH), "utf8"));
  const manifest = {
    schemaVersion: "route-v2-evidence-seed-v1", country: "MULTI",
    countries: [...new Set([...(currentManifest.countries || []), ISO])].sort(),
    routeLegEvidenceIds: routeLegs.map((record) => record.legEvidenceId), seasonEvidenceIds: seasons.map((record) => record.seasonEvidenceId),
    counts: { routeLeg: routeLegs.length, season: seasons.length, total: routeLegs.length + seasons.length },
    promotedEvidenceHash: stableHash({ routeLegs, seasons }),
  };
  await atomicText(ROUTE_LEG_PATH, `${routeLegs.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(SEASON_PATH, `${seasons.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ status: "PASS", country: ISO, addedDirectedRouteLegs: additions.length, addedSeasonEvidence: seasonAdditions.length, counts: manifest.counts }, null, 2));
}

await main();
