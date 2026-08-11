import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS,
  createPublishedKnowledgeEntityLayerRepository,
} from "../src/lib/routes/index.mjs";
import { statesFor } from "./lib/route-v2-test-file-state.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const BATCH01_CITY_NAMES = Object.freeze([
  "Amsterdam",
  "Bogotá",
  "Brno",
  "Helsinki",
  "Kraków",
  "Medellín",
  "Prague",
  "Rotterdam",
  "Turku",
  "Warsaw",
]);
const BATCH02_CITY_NAMES = Object.freeze([
  "Barcelona",
  "Berlin",
  "Busan",
  "Florence",
  "Lyon",
  "Madrid",
  "Munich",
  "Paris",
  "Rome",
  "Seoul",
]);
const BATCH03_CITY_NAMES = Object.freeze([
  "Auckland", "Bangkok", "Chiang Mai", "Lucerne", "Melbourne",
  "Queenstown", "Reykjavík", "Sydney", "Vík í Mýrdal", "Zürich",
]);
const BATCH04_CITY_POI_COUNTS = Object.freeze({
  Beppu: 3,
  Fujikawaguchiko: 4,
  Fukuoka: 7,
  Hakodate: 5,
  Hakone: 5,
  Hiroshima: 7,
  Kamakura: 6,
  Kanazawa: 5,
  Kobe: 6,
  Kumamoto: 5,
  Kyoto: 19,
  Miyajima: 6,
  Nagoya: 8,
  Naha: 5,
  Nara: 8,
  "Okinawa City": 3,
  Osaka: 15,
  Otaru: 3,
  Sapporo: 7,
  Takayama: 4,
  Tokyo: 19,
  "Yufuin (Yufu)": 3,
});
const BATCH04_CITY_NAMES = Object.freeze(Object.keys(BATCH04_CITY_POI_COUNTS));
const BATCH05_08_CITY_POI_COUNTS = Object.freeze({
  Bologna: 5,
  Catania: 5,
  Como: 5,
  Florence: 8,
  Milan: 8,
  Naples: 8,
  Palermo: 8,
  Pisa: 5,
  Rome: 15,
  Siena: 5,
  Turin: 5,
  Venice: 8,
  Verona: 5,
  "Aix-en-Provence": 5,
  Annecy: 3,
  Avignon: 5,
  Bordeaux: 8,
  Cannes: 3,
  Chamonix: 3,
  Colmar: 3,
  Lyon: 8,
  Marseille: 8,
  Nice: 8,
  Paris: 15,
  Strasbourg: 8,
  Toulouse: 5,
  Barcelona: 15,
  Bilbao: 8,
  "Córdoba": 8,
  Granada: 8,
  Madrid: 15,
  "Málaga": 5,
  Ronda: 3,
  Salamanca: 5,
  "San Sebastián": 5,
  "Santiago de Compostela": 5,
  Seville: 8,
  Toledo: 5,
  Valencia: 8,
  Andong: 3,
  Busan: 8,
  Daegu: 4,
  Gangneung: 3,
  Gyeongju: 8,
  Incheon: 5,
  "Jeju City": 8,
  Jeonju: 3,
  Seoul: 15,
  Sokcho: 3,
  Suwon: 3,
  Tongyeong: 3,
  Yeosu: 4,
});
const BATCH05_08_CITY_NAMES = Object.freeze(Object.keys(BATCH05_08_CITY_POI_COUNTS));
const BATCH09_13_CITY_POI_COUNTS = Object.freeze({
  Berlin: 15,
  Cologne: 8,
  Dresden: 8,
  Frankfurt: 8,
  "Füssen": 3,
  Hamburg: 8,
  Heidelberg: 5,
  Leipzig: 5,
  Munich: 15,
  Nuremberg: 8,
  "Rothenburg ob der Tauber": 3,
  Stuttgart: 5,
  Bregenz: 5,
  Graz: 8,
  Hallstatt: 3,
  Innsbruck: 8,
  Linz: 5,
  Salzburg: 8,
  Vienna: 15,
  "Zell am See": 3,
  Aveiro: 5,
  Braga: 5,
  Coimbra: 8,
  "Évora": 5,
  Faro: 5,
  "Guimarães": 5,
  Lagos: 5,
  Lisbon: 15,
  Porto: 8,
  Sintra: 8,
  Athens: 15,
  Chania: 8,
  "Corfu Town": 8,
  Delphi: 3,
  Heraklion: 8,
  Kalabaka: 3,
  Nafplio: 5,
  "Rhodes Town": 8,
  Thessaloniki: 8,
  Amsterdam: 15,
  Delft: 5,
  Giethoorn: 3,
  Groningen: 5,
  Haarlem: 5,
  Leiden: 5,
  Maastricht: 5,
  Rotterdam: 8,
  "The Hague": 8,
  Utrecht: 8,
});
const BATCH09_13_CITY_NAMES = Object.freeze(Object.keys(BATCH09_13_CITY_POI_COUNTS));
const EXPECTED_CITY_POI_COUNTS = Object.freeze({
  ...Object.fromEntries([
    ...BATCH01_CITY_NAMES,
    ...BATCH02_CITY_NAMES,
    ...BATCH03_CITY_NAMES,
  ].map((name) => [name, 3])),
  ...BATCH04_CITY_POI_COUNTS,
  ...BATCH05_08_CITY_POI_COUNTS,
  ...BATCH09_13_CITY_POI_COUNTS,
});
const UI_AND_PLANNER_PATHS = Object.freeze([
  "atlas.js",
  "city-detail.js",
  "route-feed-preload.js",
  "travel-data.js",
  "travel-state.js",
]);

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
    })
    .sort((left, right) => left.localeCompare(right, "en"));
}

function snapshotTree(directory) {
  const files = filesUnder(directory);
  return { files, states: statesFor(files) };
}

function assertTreeUnchanged(before, after, label) {
  assert.deepEqual(after.files, before.files, `${label} file list changed`);
  assert.deepEqual(after.states, before.states, `${label} file contents or metadata changed`);
}

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function repositoryTotals(repository) {
  const countries = repository.listCountries().length;
  const cities = repository.listCities().length;
  const pois = repository.listPois().length;
  return { countries, cities, pois, total: countries + cities + pois };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(child, output, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Server startup timed out.\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off("data", onOutput);
      child.off("exit", onExit);
    }

    function onOutput() {
      if (!output.stdout.includes("Travel Collection preview:")) return;
      cleanup();
      resolve();
    }

    function onExit(code) {
      cleanup();
      reject(new Error(`Server exited during startup with code ${code}.\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`));
    }

    child.stdout.on("data", onOutput);
    child.once("exit", onExit);
    onOutput();
  });
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!stopped && child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

function assertPortReleased(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(port, HOST, () => probe.close((error) => error ? reject(error) : resolve()));
  });
}

const dataDirectory = path.resolve(PROJECT_ROOT, "data", "knowledge");
const cacheDirectory = path.resolve(PROJECT_ROOT, ".route-v2-cache");
const dataBefore = snapshotTree(dataDirectory);
const cacheBefore = snapshotTree(cacheDirectory);
const uiBefore = statesFor(UI_AND_PLANNER_PATHS.map((relativePath) => path.resolve(PROJECT_ROOT, relativePath)));

let failure;
let result;
let child;
let port;

try {
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: PROJECT_ROOT });
  const totals = repositoryTotals(repository);
  assert.deepEqual(totals, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS);
  assert.deepEqual(repository.validateParentReferences(), { accepted: true, reasons: [] });

  const countries = repository.listCountries();
  const cities = repository.listCities();
  const pois = repository.listPois();
  const batchCityNames = [...new Set([
    ...BATCH01_CITY_NAMES,
    ...BATCH02_CITY_NAMES,
    ...BATCH03_CITY_NAMES,
    ...BATCH04_CITY_NAMES,
    ...BATCH05_08_CITY_NAMES,
    ...BATCH09_13_CITY_NAMES,
  ])];
  const batchCities = batchCityNames.map((name) => {
    const city = cities.find((candidate) => candidate.canonicalNameEn === name);
    assert.ok(city, `Published batch City missing from repository: ${name}`);
    return city;
  });
  const batchCityIds = new Set(batchCities.map((city) => city.entityId));
  const pilotPois = pois.filter((poi) => !batchCityIds.has(poi.parentCityEntityId));

  assert.equal(new Set(countries.map((entity) => entity.entityId)).size, 51);
  assert.equal(new Set(cities.map((entity) => entity.entityId)).size, 144);
  assert.equal(new Set(pois.map((entity) => entity.entityId)).size, 904);
  assert.equal(new Set([...countries, ...cities, ...pois].map((entity) => entity.entityId)).size, 1099);
  assert.equal(new Set(cities.map((entity) => entity.wikidataId)).size, 144);
  assert.equal(new Set(pois.map((entity) => entity.wikidataId)).size, 904);
  assert.equal(pilotPois.length, 9);
  for (const city of batchCities) {
    const expectedCount = EXPECTED_CITY_POI_COUNTS[city.canonicalNameEn];
    assert.ok(Number.isInteger(expectedCount), `Missing expected POI count for ${city.canonicalNameEn}`);
    assert.equal(repository.listPoisByCity(city.entityId).length, expectedCount, `${city.canonicalNameEn} POI count`);
  }

  const countriesCopy = repository.listCountries();
  countriesCopy[0].canonicalNameEn = "external mutation";
  assert.notEqual(repository.listCountries()[0].canonicalNameEn, "external mutation");

  const loaderSource = readText("src/lib/routes/knowledge-entity-layer-published-assets.mjs");
  for (const forbidden of ["raw/", "candidate", "selection", "review", "conflict", ".route-v2-cache", "readdir", "fetch(", "writeFile"]) {
    assert.equal(loaderSource.includes(forbidden), false, `published-assets loader uses forbidden input or capability: ${forbidden}`);
  }
  const serverSource = readText("server.js");
  assert.equal((serverSource.match(/createPublishedKnowledgeEntityLayerRepository\(/g) || []).length, 1, "server must construct the repository exactly once");
  assert.ok(serverSource.indexOf("createPublishedKnowledgeEntityLayerRepository(") < serverSource.indexOf("http.createServer("));

  port = await findFreePort();
  const output = { stdout: "", stderr: "" };
  child = spawn(process.execPath, ["server.js"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, HOST, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output.stdout += chunk; });
  child.stderr.on("data", (chunk) => { output.stderr += chunk; });
  await waitForServer(child, output);

  const requestedPaths = [];
  const responsePayloads = [];
  async function request(relativePath, options = {}) {
    assert.ok(relativePath.startsWith("/api/knowledge-entities/"), `forbidden runtime request: ${relativePath}`);
    requestedPaths.push(relativePath);
    const response = await fetch(`http://${HOST}:${port}${relativePath}`, options);
    const payload = await response.json();
    responsePayloads.push(payload);
    return { status: response.status, payload };
  }

  const summaryResponse = await request("/api/knowledge-entities/summary");
  assert.equal(summaryResponse.status, 200);
  assert.deepEqual(summaryResponse.payload, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS);

  const countriesResponse = await request("/api/knowledge-entities/countries");
  assert.equal(countriesResponse.status, 200);
  assert.equal(countriesResponse.payload.countries.length, 51);
  const countriesAgain = await request("/api/knowledge-entities/countries");
  assert.deepEqual(countriesAgain.payload, countriesResponse.payload);

  for (const city of cities) {
    const lookup = await request(`/api/knowledge-entities/entities/${city.entityId}`);
    assert.equal(lookup.status, 200);
    assert.equal(lookup.payload.entity.entityType, "city");
  }
  for (const poi of pois) {
    const lookup = await request(`/api/knowledge-entities/entities/${poi.entityId}`);
    assert.equal(lookup.status, 200);
    assert.equal(lookup.payload.entity.entityType, "poi");
  }

  const batchCityResults = [];
  for (const city of batchCities) {
    const response = await request(`/api/knowledge-entities/cities/${city.entityId}/pois`);
    assert.equal(response.status, 200);
    assert.equal(response.payload.pois.length, EXPECTED_CITY_POI_COUNTS[city.canonicalNameEn], `${city.canonicalNameEn} runtime POI count`);
    assert.ok(response.payload.pois.every((poi) => poi.parentCityEntityId === city.entityId));
    const repeated = await request(`/api/knowledge-entities/cities/${city.entityId}/pois`);
    assert.deepEqual(repeated.payload, response.payload, `${city.canonicalNameEn} ordering changed`);
    batchCityResults.push({
      city: city.canonicalNameEn,
      entityId: city.entityId,
      pois: response.payload.pois.map((poi) => poi.canonicalNameEn),
    });
  }

  for (const poi of pilotPois) {
    const response = await request(`/api/knowledge-entities/entities/${poi.entityId}`);
    assert.equal(response.status, 200);
    assert.equal(response.payload.entity.entityId, poi.entityId);
  }

  const countryLookup = await request(`/api/knowledge-entities/entities/${countries[0].entityId}`);
  const cityLookup = await request(`/api/knowledge-entities/entities/${cities[0].entityId}`);
  const poiLookup = await request(`/api/knowledge-entities/entities/${pois[0].entityId}`);
  assert.deepEqual([
    countryLookup.payload.entity.entityType,
    cityLookup.payload.entity.entityType,
    poiLookup.payload.entity.entityType,
  ], ["country", "city", "poi"]);

  const missing = await request("/api/knowledge-entities/entities/entity-does-not-exist");
  assert.equal(missing.status, 404);
  const wrongCountryParent = await request(`/api/knowledge-entities/countries/${cities[0].entityId}/cities`);
  assert.equal(wrongCountryParent.status, 400);
  const wrongCityParent = await request(`/api/knowledge-entities/cities/${countries[0].entityId}/pois`);
  assert.equal(wrongCityParent.status, 400);
  const writeAttempt = await request("/api/knowledge-entities/summary", { method: "POST" });
  assert.equal(writeAttempt.status, 405);

  countriesResponse.payload.countries[0].canonicalNameEn = "response mutation";
  const isolatedResponse = await request("/api/knowledge-entities/countries");
  assert.notEqual(isolatedResponse.payload.countries[0].canonicalNameEn, "response mutation");

  const publicPayloadText = JSON.stringify(responsePayloads);
  for (const forbidden of ["provenance", "sourceUrl", "generatedFrom", ".route-v2-cache", "data/knowledge", "candidate", "review", "conflict"]) {
    assert.equal(publicPayloadText.includes(forbidden), false, `runtime API exposed forbidden detail: ${forbidden}`);
  }
  assert.ok(requestedPaths.every((relativePath) => relativePath.startsWith("/api/knowledge-entities/")));
  assert.equal((output.stdout.match(/Knowledge Entity Layer: 51 countries, 144 cities, 904 POIs/g) || []).length, 1);
  assert.equal(output.stderr, "", `server stderr was not empty:\n${output.stderr}`);

  result = {
    status: "PASS",
    totals,
    runtime: {
      serverRepositoryConstructions: 1,
      citiesQueried: cities.length,
      poisQueried: pois.length,
      pilotPoisQueried: pilotPois.length,
      batch01CitiesWithThreePois: batchCityResults.filter((result) => BATCH01_CITY_NAMES.includes(result.city)).length,
      batch02CitiesWithThreePois: batchCityResults.filter((result) => BATCH02_CITY_NAMES.includes(result.city)).length,
      batch03CitiesWithThreePois: batchCityResults.filter((result) => BATCH03_CITY_NAMES.includes(result.city)).length,
      batch04JapanCitiesWithTieredPois: batchCityResults.filter((result) => BATCH04_CITY_NAMES.includes(result.city)).length,
      batch05To08MultiCountryCitiesWithTieredPois: batchCityResults.filter((result) => BATCH05_08_CITY_NAMES.includes(result.city)).length,
      stableOrdering: true,
      responseIsolation: true,
      missingEntityStatus: missing.status,
      invalidParentTypeStatus: wrongCityParent.status,
      writeMethodStatus: writeAttempt.status,
    },
    batch01: batchCityResults.filter((result) => BATCH01_CITY_NAMES.includes(result.city)),
    batch02: batchCityResults.filter((result) => BATCH02_CITY_NAMES.includes(result.city)),
    batch04: batchCityResults.filter((result) => BATCH04_CITY_NAMES.includes(result.city)),
    batch05To08: batchCityResults.filter((result) => BATCH05_08_CITY_NAMES.includes(result.city)),
    sideEffects: {
      entityLayerCacheReads: 0,
      cacheWrites: 0,
      externalNetworkRequests: 0,
      dataFilesModified: 0,
      plannerOrUiIntegrated: false,
    },
  };
} catch (error) {
  failure = error;
} finally {
  if (child) await stopServer(child);
}

try {
  if (port) await assertPortReleased(port);
  assertTreeUnchanged(dataBefore, snapshotTree(dataDirectory), "Knowledge data");
  assertTreeUnchanged(cacheBefore, snapshotTree(cacheDirectory), "Route V2 cache");
  assert.deepEqual(
    statesFor(UI_AND_PLANNER_PATHS.map((relativePath) => path.resolve(PROJECT_ROOT, relativePath))),
    uiBefore,
    "UI or Planner-facing files changed",
  );
} catch (sideEffectError) {
  if (!failure) failure = sideEffectError;
}

if (failure) throw failure;
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
