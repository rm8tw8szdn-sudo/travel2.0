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
  const batchCities = BATCH01_CITY_NAMES.map((name) => {
    const city = cities.find((candidate) => candidate.canonicalNameEn === name);
    assert.ok(city, `Batch01 City missing from repository: ${name}`);
    return city;
  });
  const batchCityIds = new Set(batchCities.map((city) => city.entityId));
  const pilotPois = pois.filter((poi) => !batchCityIds.has(poi.parentCityEntityId));

  assert.equal(new Set(countries.map((entity) => entity.entityId)).size, 50);
  assert.equal(new Set(cities.map((entity) => entity.entityId)).size, 15);
  assert.equal(new Set(pois.map((entity) => entity.entityId)).size, 45);
  assert.equal(new Set([...countries, ...cities, ...pois].map((entity) => entity.entityId)).size, 110);
  assert.equal(new Set(cities.map((entity) => entity.wikidataId)).size, 15);
  assert.equal(new Set(pois.map((entity) => entity.wikidataId)).size, 45);
  assert.equal(pilotPois.length, 15);
  for (const city of batchCities) assert.equal(repository.listPoisByCity(city.entityId).length, 3, `${city.canonicalNameEn} POI count`);

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
  assert.equal(countriesResponse.payload.countries.length, 50);
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
    assert.equal(response.payload.pois.length, 3, `${city.canonicalNameEn} runtime POI count`);
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
  assert.equal((output.stdout.match(/Knowledge Entity Layer: 50 countries, 15 cities, 45 POIs/g) || []).length, 1);
  assert.equal(output.stderr, "", `server stderr was not empty:\n${output.stderr}`);

  result = {
    status: "PASS",
    totals,
    runtime: {
      serverRepositoryConstructions: 1,
      citiesQueried: cities.length,
      poisQueried: pois.length,
      pilotPoisQueried: pilotPois.length,
      batch01CitiesWithThreePois: batchCityResults.length,
      stableOrdering: true,
      responseIsolation: true,
      missingEntityStatus: missing.status,
      invalidParentTypeStatus: wrongCityParent.status,
      writeMethodStatus: writeAttempt.status,
    },
    batch01: batchCityResults,
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
