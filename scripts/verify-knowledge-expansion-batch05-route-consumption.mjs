import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createKnowledgeEntityLayerPlannerAdapter,
  createKnowledgeEntityLayerSearchIntentCatalog,
  createPublishedKnowledgeEntityLayerRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteSearchService,
  routeUsesStaleCoveragePlaceholder,
} from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const TEMPORARY_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-batch05-consumption-"));
const REPORT_PATH = path.join(ROOT, "data/knowledge/reports/knowledge-expansion-batch05-route-consumption.json");
const GENERATED_AT = "2026-08-11T06:00:00.000Z";
const COUNTRIES = Object.freeze([
  ["GB", "United Kingdom"], ["IE", "Ireland"], ["CZ", "Czechia"], ["HU", "Hungary"], ["HR", "Croatia"],
  ["NO", "Norway"], ["SE", "Sweden"], ["FI", "Finland"], ["DK", "Denmark"], ["BE", "Belgium"],
  ["PL", "Poland"], ["SI", "Slovenia"], ["VN", "Vietnam"], ["MY", "Malaysia"], ["ID", "Indonesia"],
  ["PH", "Philippines"], ["CA", "Canada"], ["US", "United States"], ["MX", "Mexico"], ["PE", "Peru"],
]);
const LONG_TRIP_CODES = new Set(["GB", "VN", "ID", "CA", "US"]);
const CROSS_COUNTRY_CASES = Object.freeze([
  { query: "Czechia Austria Hungary 14 days", durationDays: 14, countryCodes: ["AT", "CZ", "HU"] },
  { query: "Belgium Netherlands France 14 days", durationDays: 14, countryCodes: ["BE", "FR", "NL"] },
  { query: "Sweden Norway 14 days", durationDays: 14, countryCodes: ["NO", "SE"] },
  { query: "Denmark Sweden 10 days", durationDays: 10, countryCodes: ["DK", "SE"] },
  { query: "Vietnam Malaysia 14 days", durationDays: 14, countryCodes: ["MY", "VN"] },
  { query: "USA Canada 14 days", durationDays: 14, countryCodes: ["CA", "US"] },
]);

function memorySearchCache() {
  const entries = new Map();
  return {
    get(intent) { return structuredClone(entries.get(intent.intentHash) || null); },
    put(item) { entries.set(item.intent.intentHash, structuredClone(item)); },
    appendReviewCandidates() {},
    findRoute() { return null; },
  };
}

function runtimeEnv() {
  return {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "false",
    ROUTE_V2_PUBLICATION_GATE_ENABLED: "false",
    ROUTE_V2_READY_POOL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "30000",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function recordCountryCodes(record = {}) {
  return unique((record.countryEntities || []).map((entry) => entry.countryCode));
}

function recordCityEntities(record = {}) {
  return Array.isArray(record.destinationEntities) ? record.destinationEntities : [];
}

function recordPoiIds(record = {}) {
  const routePois = Array.isArray(record.routeExpansion?.poiEntityIds) ? record.routeExpansion.poiEntityIds : [];
  const destinationPois = recordCityEntities(record).flatMap((city) => Array.isArray(city.poiEntityIds) ? city.poiEntityIds : []);
  return unique([...routePois, ...destinationPois]);
}

try {
  const originalFetch = globalThis.fetch;
  let externalFetchCalls = 0;
  globalThis.fetch = async () => {
    externalFetchCalls += 1;
    throw new Error("NETWORK_DISABLED_FOR_BATCH05_ROUTE_CONSUMPTION");
  };
  try {
    const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
    const env = runtimeEnv();
    const acceptedRepository = createAcceptedRouteRepository({ storagePath: path.join(TEMPORARY_ROOT, "accepted", "accepted-routes.json") });
    const formalAccepted = JSON.parse(fs.readFileSync(path.join(ROOT, ".route-v2-cache", "accepted-routes.json"), "utf8")).records;
    const targetCodes = new Set(COUNTRIES.map(([countryCode]) => countryCode));
    const staleFixtures = [];
    for (const countryCode of targetCodes) {
      const fixture = formalAccepted.find((record) => (record.destinationEntities || []).some((destination) => (
        String(destination.wikidataId || destination.entityId || "").startsWith(`coverage:${countryCode}:`)
      )));
      if (fixture) staleFixtures.push({ countryCode, record: fixture });
    }
    assert.equal(staleFixtures.length, 15, "expected real stale Accepted coverage fixtures");
    for (const fixture of staleFixtures) {
      assert.equal(routeUsesStaleCoveragePlaceholder({
        record: fixture.record,
        requiredCountryCodes: [fixture.countryCode],
        plannableCountryCodes: [...targetCodes],
      }), true, `${fixture.record.id}:${fixture.countryCode}:stale coverage fixture must be rejected`);
      acceptedRepository.upsert(fixture.record);
    }
    const seededAcceptedIds = new Set(acceptedRepository.list({ limit: 10_000 }).records.map((record) => record.id));
    assert(seededAcceptedIds.size > 0, "stale Accepted fixtures must be seeded");
    const planner = createRouteCompositionPlanner({
      acceptedRepository,
      evidenceRepository: createEvidenceRepository({ storagePath: path.join(TEMPORARY_ROOT, "runtime", "legacy-evidence.json") }),
      candidatePoolStore: createRouteCandidatePoolStore({ storagePath: path.join(TEMPORARY_ROOT, "runtime", "candidate-pool.jsonl"), env }),
      decisionTraceStore: createDecisionTraceStore({ storagePath: path.join(TEMPORARY_ROOT, "runtime", "decision-traces.jsonl"), env }),
      evidenceBundleStore: createEvidenceBundleStore({ storagePath: path.join(TEMPORARY_ROOT, "runtime", "evidence-bundles.jsonl"), env }),
      knowledgeGraph: createKnowledgeEntityLayerPlannerAdapter({ repository }),
      env,
    });
    const service = createRouteSearchService({
      acceptedRepository,
      searchCache: memorySearchCache(),
      planner,
      intentCatalog: createKnowledgeEntityLayerSearchIntentCatalog({ repository }),
      env,
    });

    const results = [];
    for (const [countryCode, label] of COUNTRIES) {
      const durations = LONG_TRIP_CODES.has(countryCode) ? [7, 14, 21] : [7, 14];
      for (const durationDays of durations) {
        const query = `${label} ${durationDays} days`;
        const response = await service.search({ query, limit: 3, sessionId: `batch05-${countryCode.toLowerCase()}-${durationDays}` });
        assert(response.records.length > 0, `${query}:${JSON.stringify(response.diagnostics)}`);
        const record = response.records[0];
        const countryCodes = recordCountryCodes(record);
        const cityEntities = recordCityEntities(record);
        const poiIds = recordPoiIds(record);
        assert.equal(Number(record.durationDays), durationDays, `${query}:exact-duration`);
        assert.deepEqual(countryCodes, [countryCode], `${query}:country-constraint`);
        assert(cityEntities.length > 0, `${query}:knowledge-city-consumption`);
        assert.equal(cityEntities.every((city) => /^city-[a-f0-9]{16}$/u.test(city.entityId) && /^Q\d+$/u.test(city.wikidataId)), true, `${query}:knowledge-identity`);
        assert.equal(unique(cityEntities.map((city) => city.entityId)).length, cityEntities.length, `${query}:duplicate-city`);
        assert.equal(unique(poiIds).length, poiIds.length, `${query}:duplicate-poi`);
        results.push({
          countryCode,
          label,
          query,
          durationDays,
          recordId: record.id,
          routeReferenceMode: record.routeReferenceMode || null,
          cityEntityIds: cityEntities.map((city) => city.entityId),
          cityQids: cityEntities.map((city) => city.wikidataId),
          poiCount: Number(record.routeExpansion?.actualPoiCount || poiIds.length || 0),
          coverageStatus: record.routeExpansion?.coverageStatus || "route-returned",
        });
      }
    }
    assert.equal(results.length, 45);
    for (const [countryCode] of COUNTRIES) {
      const countryResults = results.filter((entry) => entry.countryCode === countryCode).sort((left, right) => left.durationDays - right.durationDays);
      for (let index = 1; index < countryResults.length; index += 1) {
        const previous = countryResults[index - 1];
        const current = countryResults[index];
        assert(
          current.cityEntityIds.length >= previous.cityEntityIds.length || current.poiCount >= previous.poiCount,
          `${countryCode}:${current.durationDays}:route-depth-must-not-shrink`,
        );
      }
    }
    const crossCountryResults = [];
    for (const item of CROSS_COUNTRY_CASES) {
      const response = await service.search({ query: item.query, limit: 3, sessionId: `batch05-cross-${crossCountryResults.length + 1}` });
      assert(response.records.length > 0, `${item.query}:${JSON.stringify(response.diagnostics)}`);
      const record = response.records[0];
      const countryCodes = recordCountryCodes(record).sort();
      const cityEntities = recordCityEntities(record);
      assert.equal(Number(record.durationDays), item.durationDays, `${item.query}:exact-duration`);
      assert.deepEqual(countryCodes, item.countryCodes, `${item.query}:all-required-countries`);
      assert(cityEntities.length >= item.countryCodes.length, `${item.query}:knowledge-city-consumption`);
      assert.equal(cityEntities.every((city) => /^city-[a-f0-9]{16}$/u.test(city.entityId) && /^Q\d+$/u.test(city.wikidataId)), true, `${item.query}:knowledge-identity`);
      assert.equal(unique(cityEntities.map((city) => city.entityId)).length, cityEntities.length, `${item.query}:duplicate-city`);
      crossCountryResults.push({
        query: item.query,
        durationDays: item.durationDays,
        requiredCountryCodes: item.countryCodes,
        actualCountryCodes: countryCodes,
        recordId: record.id,
        cityEntityIds: cityEntities.map((city) => city.entityId),
        cityQids: cityEntities.map((city) => city.wikidataId),
      });
    }
    const cityAliasResponse = await service.search({ query: "New York Toronto 10 days", limit: 3, sessionId: "batch05-city-alias-new-york-toronto" });
    assert(cityAliasResponse.records.length > 0, `New York Toronto 10 days:${JSON.stringify(cityAliasResponse.diagnostics)}`);
    const cityAliasRecord = cityAliasResponse.records[0];
    const cityAliasQids = recordCityEntities(cityAliasRecord).map((city) => city.wikidataId);
    assert.equal(Number(cityAliasRecord.durationDays), 10, "New York Toronto 10 days:exact-duration");
    assert.deepEqual(new Set(cityAliasQids), new Set(["Q60", "Q172"]), "New York Toronto 10 days:all-required-cities");
    assert.deepEqual(recordCountryCodes(cityAliasRecord).sort(), ["CA", "US"], "New York Toronto 10 days:country-coverage");
    const acceptedAfter = acceptedRepository.list({ limit: 10_000 }).records;
    assert.equal(acceptedAfter.length, seededAcceptedIds.size, "verifier must not mutate seeded Accepted fixtures");
    assert.deepEqual(new Set(acceptedAfter.map((record) => record.id)), seededAcceptedIds, "Accepted fixture identities must stay stable");
    assert.equal(externalFetchCalls, 0);

    const report = {
      schemaVersion: "route-v2-knowledge-expansion-batch05-route-consumption-v1",
      generatedAt: GENERATED_AT,
      status: "PASS",
      queryCount: results.length + crossCountryResults.length + 1,
      externalFetchCalls,
      staleAcceptedFixturesRejected: staleFixtures.length,
      crossCountryResults,
      explicitCityAliasResult: {
        query: "New York Toronto 10 days",
        durationDays: 10,
        recordId: cityAliasRecord.id,
        cityQids: cityAliasQids,
        countryCodes: recordCountryCodes(cityAliasRecord).sort(),
      },
      countries: Object.fromEntries(COUNTRIES.map(([countryCode, label]) => {
        const countryResults = results.filter((entry) => entry.countryCode === countryCode);
        return [countryCode, {
          label,
          testedDurations: countryResults.map((entry) => entry.durationDays),
          reliableMaxDurationDays: Math.max(...countryResults.map((entry) => entry.durationDays)),
          results: countryResults,
        }];
      })),
    };
    if (process.argv.includes("--write-report")) {
      fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
      fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify({
      status: "PASS",
      verifier: "knowledge-expansion-batch05-route-consumption",
      queryCount: results.length + crossCountryResults.length + 1,
      countries: COUNTRIES.length,
      longTripCountries: LONG_TRIP_CODES.size,
      crossCountryCases: crossCountryResults.length,
      explicitCityAliasCases: 1,
      staleAcceptedFixturesRejected: staleFixtures.length,
      externalFetchCalls,
      reportWritten: process.argv.includes("--write-report"),
    }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
} finally {
  fs.rmSync(TEMPORARY_ROOT, { recursive: true, force: true });
}
