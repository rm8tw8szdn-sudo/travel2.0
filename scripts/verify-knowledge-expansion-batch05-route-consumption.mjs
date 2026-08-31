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
const BATCH = process.argv.includes("--batch=08") ? "08" : process.argv.includes("--batch=07") ? "07" : process.argv.includes("--batch=06") ? "06" : "05";
const STRESS = process.argv.includes("--stress");
const TEMPORARY_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `route-v2-batch${BATCH}-consumption-`));
const REPORT_PATH = path.join(ROOT, `data/knowledge/reports/knowledge-expansion-batch${BATCH}-route-consumption.json`);
const GENERATED_AT = BATCH === "08" ? "2026-08-28T08:00:00.000Z" : BATCH === "07" ? "2026-08-24T06:00:00.000Z" : BATCH === "06" ? "2026-08-17T10:00:00.000Z" : "2026-08-11T06:00:00.000Z";
const BATCH05_COUNTRIES = Object.freeze([
  ["GB", "United Kingdom"], ["IE", "Ireland"], ["CZ", "Czechia"], ["HU", "Hungary"], ["HR", "Croatia"],
  ["NO", "Norway"], ["SE", "Sweden"], ["FI", "Finland"], ["DK", "Denmark"], ["BE", "Belgium"],
  ["PL", "Poland"], ["SI", "Slovenia"], ["VN", "Vietnam"], ["MY", "Malaysia"], ["ID", "Indonesia"],
  ["PH", "Philippines"], ["CA", "Canada"], ["US", "United States"], ["MX", "Mexico"], ["PE", "Peru"],
]);
const BATCH05_LONG_TRIP_CODES = new Set(["GB", "VN", "ID", "CA", "US"]);
const BATCH05_CROSS_COUNTRY_CASES = Object.freeze([
  { query: "Czechia Austria Hungary 14 days", durationDays: 14, countryCodes: ["AT", "CZ", "HU"] },
  { query: "Belgium Netherlands France 14 days", durationDays: 14, countryCodes: ["BE", "FR", "NL"] },
  { query: "Sweden Norway 14 days", durationDays: 14, countryCodes: ["NO", "SE"] },
  { query: "Denmark Sweden 10 days", durationDays: 10, countryCodes: ["DK", "SE"] },
  { query: "Vietnam Malaysia 14 days", durationDays: 14, countryCodes: ["MY", "VN"] },
  { query: "USA Canada 14 days", durationDays: 14, countryCodes: ["CA", "US"] },
]);
const expansionSeed = ["06", "07", "08"].includes(BATCH)
  ? JSON.parse(fs.readFileSync(path.join(ROOT, `data/knowledge/seeds/knowledge-expansion-batch${BATCH}-20-country.json`), "utf8"))
  : null;
const COUNTRIES = ["06", "07", "08"].includes(BATCH)
  ? Object.freeze(Object.entries(expansionSeed.countries).map(([code, entry]) => [code, entry.label]))
  : BATCH05_COUNTRIES;
const LONG_TRIP_CODES = ["06", "07", "08"].includes(BATCH)
  ? new Set(Object.entries(expansionSeed.countries).filter(([, entry]) => entry.tier === 1).map(([code]) => code))
  : BATCH05_LONG_TRIP_CODES;
const CROSS_COUNTRY_CASES = BATCH === "08" ? Object.freeze([
  { query: "Armenia Georgia 14 days", durationDays: 14, countryCodes: ["AM", "GE"] },
  { query: "Azerbaijan Georgia 14 days", durationDays: 14, countryCodes: ["AZ", "GE"] },
  { query: "Bosnia and Herzegovina Croatia 14 days", durationDays: 14, countryCodes: ["BA", "HR"] },
  { query: "North Macedonia Albania 14 days", durationDays: 14, countryCodes: ["AL", "MK"] },
  { query: "Luxembourg Belgium 10 days", durationDays: 10, countryCodes: ["BE", "LU"] },
  { query: "摩纳哥 France 7 days", durationDays: 7, countryCodes: ["FR", "MC"] },
  { query: "Oman → Qatar 14 days", durationDays: 14, countryCodes: ["OM", "QA"] },
  { query: "Dominican Republic Jamaica 14 days", durationDays: 14, countryCodes: ["DO", "JM"] },
  { query: "Bolivia Paraguay 14 days", durationDays: 14, countryCodes: ["BO", "PY"] },
  { query: "Nicaragua Costa Rica 14 days", durationDays: 14, countryCodes: ["CR", "NI"] },
]) : BATCH === "07" ? Object.freeze([
  { query: "Estonia Latvia Lithuania 14 days", durationDays: 14, countryCodes: ["EE", "LT", "LV"] },
  { query: "Albania Montenegro 14 days", durationDays: 14, countryCodes: ["AL", "ME"] },
  { query: "Georgia Turkey 14 days", durationDays: 14, countryCodes: ["GE", "TR"] },
  { query: "Jordan Israel 14 days", durationDays: 14, countryCodes: ["IL", "JO"] },
  { query: "Ecuador Peru 14 days", durationDays: 14, countryCodes: ["EC", "PE"] },
  { query: "Guatemala → Panama 14 days", durationDays: 14, countryCodes: ["GT", "PA"] },
]) : BATCH === "06" ? Object.freeze([
  { query: "Argentina Chile 14 days", durationDays: 14, countryCodes: ["AR", "CL"] },
  { query: "Cambodia Vietnam 14 days", durationDays: 14, countryCodes: ["KH", "VN"] },
  { query: "Romania Hungary 14 days", durationDays: 14, countryCodes: ["HU", "RO"] },
  { query: "Andorra Spain 10 days", durationDays: 10, countryCodes: ["AD", "ES"] },
  { query: "Morocco Spain 14 days", durationDays: 14, countryCodes: ["ES", "MA"] },
  { query: "Uruguay → Argentina 14 days", durationDays: 14, countryCodes: ["AR", "UY"] },
]) : BATCH05_CROSS_COUNTRY_CASES;
const CITY_ALIAS_CASE = BATCH === "08"
  ? { query: "Yerevan Gyumri 10 days", durationDays: 10, qids: ["Q1953", "Q199500"] }
  : BATCH === "07"
  ? { query: "Tbilisi Batumi 10 days", durationDays: 10, qids: ["Q994", "Q25475"] }
  : BATCH === "06"
  ? { query: "Rio de Janeiro São Paulo 10 days", durationDays: 10, qids: ["Q8678", "Q174"] }
  : { query: "New York Toronto 10 days", durationDays: 10, qids: ["Q60", "Q172"] };

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
    throw new Error(`NETWORK_DISABLED_FOR_BATCH${BATCH}_ROUTE_CONSUMPTION`);
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
    if (BATCH === "05") assert.equal(staleFixtures.length, 15, "expected real stale Accepted coverage fixtures");
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
    const countryOnlyResults = [];
    const seasonalResults = [];
    for (const [countryCode, label] of COUNTRIES) {
      if (["07", "08"].includes(BATCH)) {
        const response = await service.search({ query: label, limit: 3, sessionId: `batch${BATCH}-${countryCode.toLowerCase()}-country-only` });
        assert(response.records.length > 0, `${label}:${JSON.stringify(response.diagnostics)}`);
        const record = response.records[0];
        const countryCodes = recordCountryCodes(record);
        const cityEntities = recordCityEntities(record);
        assert.deepEqual(countryCodes, [countryCode], `${label}:country-only-constraint`);
        assert(cityEntities.length > 0, `${label}:country-only-knowledge-city-consumption`);
        assert.equal(cityEntities.every((city) => /^city-[a-f0-9]{16}$/u.test(city.entityId) && /^Q\d+$/u.test(city.wikidataId)), true, `${label}:country-only-knowledge-identity`);
        assert.equal(unique(cityEntities.map((city) => city.entityId)).length, cityEntities.length, `${label}:country-only-duplicate-city`);
        countryOnlyResults.push({
          countryCode,
          label,
          query: label,
          durationDays: Number(record.durationDays),
          recordId: record.id,
          cityEntityIds: cityEntities.map((city) => city.entityId),
          cityQids: cityEntities.map((city) => city.wikidataId),
        });
      }
      const durations = LONG_TRIP_CODES.has(countryCode) ? [7, 14, 21] : [7, 14];
      for (const durationDays of durations) {
        const query = `${label} ${durationDays} days`;
        const response = await service.search({ query, limit: 3, sessionId: `batch${BATCH}-${countryCode.toLowerCase()}-${durationDays}` });
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
      const seasonalQuery = `${label} 7 days in December`;
      const seasonalResponse = await service.search({ query: seasonalQuery, limit: 3, sessionId: `batch${BATCH}-${countryCode.toLowerCase()}-december` });
      assert(seasonalResponse.records.length > 0, `${seasonalQuery}:${JSON.stringify(seasonalResponse.diagnostics)}`);
      const seasonalRecord = seasonalResponse.records[0];
      assert.equal(Number(seasonalRecord.durationDays), 7, `${seasonalQuery}:exact-duration`);
      assert.deepEqual(recordCountryCodes(seasonalRecord), [countryCode], `${seasonalQuery}:country-constraint`);
      assert(recordCityEntities(seasonalRecord).length > 0, `${seasonalQuery}:knowledge-city-consumption`);
      seasonalResults.push({ countryCode, query: seasonalQuery, recordId: seasonalRecord.id, countryCodes: recordCountryCodes(seasonalRecord) });
    }
    if (["07", "08"].includes(BATCH)) assert.equal(countryOnlyResults.length, COUNTRIES.length);
    assert.equal(results.length, COUNTRIES.length * 2 + LONG_TRIP_CODES.size);
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
      const response = await service.search({ query: item.query, limit: 3, sessionId: `batch${BATCH}-cross-${crossCountryResults.length + 1}` });
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
    const cityAliasResponse = await service.search({ query: CITY_ALIAS_CASE.query, limit: 3, sessionId: `batch${BATCH}-city-alias` });
    assert(cityAliasResponse.records.length > 0, `${CITY_ALIAS_CASE.query}:${JSON.stringify(cityAliasResponse.diagnostics)}`);
    const cityAliasRecord = cityAliasResponse.records[0];
    const cityAliasQids = recordCityEntities(cityAliasRecord).map((city) => city.wikidataId);
    assert.equal(Number(cityAliasRecord.durationDays), CITY_ALIAS_CASE.durationDays, `${CITY_ALIAS_CASE.query}:exact-duration`);
    assert.deepEqual(new Set(cityAliasQids), new Set(CITY_ALIAS_CASE.qids), `${CITY_ALIAS_CASE.query}:all-required-cities`);
    const stressReport = STRESS ? await runBatch08Stress({ service, repository }) : null;
    const acceptedAfter = acceptedRepository.list({ limit: 10_000 }).records;
    assert.equal(acceptedAfter.length, seededAcceptedIds.size, "verifier must not mutate seeded Accepted fixtures");
    assert.deepEqual(new Set(acceptedAfter.map((record) => record.id)), seededAcceptedIds, "Accepted fixture identities must stay stable");
    assert.equal(externalFetchCalls, 0);

    const report = {
      schemaVersion: `route-v2-knowledge-expansion-batch${BATCH}-route-consumption-v1`,
      generatedAt: GENERATED_AT,
      status: "PASS",
      queryCount: countryOnlyResults.length + results.length + seasonalResults.length + crossCountryResults.length + 1,
      externalFetchCalls,
      staleAcceptedFixturesRejected: staleFixtures.length,
      countryOnlyResults,
      crossCountryResults,
      seasonalResults,
      explicitCityAliasResult: {
        query: CITY_ALIAS_CASE.query,
        durationDays: CITY_ALIAS_CASE.durationDays,
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
    if (stressReport) {
      const stressPath = path.join(ROOT, "data/knowledge/reports/knowledge-expansion-batch08-hard-constraint-stress.json");
      fs.mkdirSync(path.dirname(stressPath), { recursive: true });
      fs.writeFileSync(stressPath, `${JSON.stringify(stressReport, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify({
      status: "PASS",
      verifier: `knowledge-expansion-batch${BATCH}-route-consumption`,
      queryCount: countryOnlyResults.length + results.length + seasonalResults.length + crossCountryResults.length + 1,
      countries: COUNTRIES.length,
      countryOnlyCases: countryOnlyResults.length,
      longTripCountries: LONG_TRIP_CODES.size,
      crossCountryCases: crossCountryResults.length,
      explicitCityAliasCases: 1,
      staleAcceptedFixturesRejected: staleFixtures.length,
      externalFetchCalls,
      stressCases: stressReport?.summary.totalCases || 0,
      reportWritten: process.argv.includes("--write-report"),
    }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
} finally {
  fs.rmSync(TEMPORARY_ROOT, { recursive: true, force: true });
}

async function runBatch08Stress({ service, repository }) {
  assert.equal(BATCH, "08", "hard-constraint stress is Batch 08 only");
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const countryByCode = new Map(countries.map((record) => [record.isoAlpha2, record]));
  const nameFrequency = new Map();
  for (const city of cities) {
    const key = String(city.canonicalNameEn || "").trim().toLocaleLowerCase("en");
    nameFrequency.set(key, (nameFrequency.get(key) || 0) + 1);
  }
  const safeCitiesByCode = new Map(COUNTRIES.map(([countryCode, label]) => {
    const country = countryByCode.get(countryCode);
    const safe = cities.filter((city) => {
      if (city.parentCountryEntityId !== country?.entityId) return false;
      const name = String(city.canonicalNameEn || "").trim();
      const key = name.toLocaleLowerCase("en");
      return name && key !== String(label).toLocaleLowerCase("en") && nameFrequency.get(key) === 1;
    });
    return [countryCode, safe];
  }));
  const cases = [];
  const push = (record) => cases.push({ allowConflict: false, impossible: false, ...record });

  for (const [countryCode, label] of COUNTRIES) {
    for (const durationDays of [1, 2, 7, 14]) push({ category: "single-country-duration", query: `${label} ${durationDays} days`, durationDays, countryCodes: [countryCode] });
    push({ category: "month", query: `${label} 7 days in February`, durationDays: 7, countryCodes: [countryCode] });
    push({ category: "month", query: `${label} 7 days in April`, durationDays: 7, countryCodes: [countryCode] });
    push({ category: "month", query: `${label} 7 days in December`, durationDays: 7, countryCodes: [countryCode] });
    push({ category: "season", query: `${label} 7 days in summer`, durationDays: 7, countryCodes: [countryCode] });
    push({ category: "season", query: `${label} 7 days in winter`, durationDays: 7, countryCodes: [countryCode] });
    push({ category: "single-country-capacity-conflict", query: `${label} 46 days`, durationDays: 46, countryCodes: [countryCode], impossible: true });
    const safeCity = safeCitiesByCode.get(countryCode)?.[0];
    if (safeCity) push({ category: "explicit-city", query: `${safeCity.canonicalNameEn} ${label} 7 days`, durationDays: 7, countryCodes: [countryCode], cityQids: [safeCity.wikidataId] });
  }

  for (let index = 0; index < COUNTRIES.length; index += 1) {
    const [leftCode, leftLabel] = COUNTRIES[index];
    const [rightCode, rightLabel] = COUNTRIES[(index + 1) % COUNTRIES.length];
    const includesAmbiguousMonaco = leftCode === "MC" || rightCode === "MC";
    for (const durationDays of [7, 14]) push({ category: "multi-country", query: `${leftLabel} ${rightLabel} ${durationDays} days`, durationDays, countryCodes: [leftCode, rightCode].sort(), allowConflict: includesAmbiguousMonaco });
    push({ category: "multi-country-capacity-conflict", query: `${leftLabel} ${rightLabel} 61 days`, durationDays: 61, countryCodes: [leftCode, rightCode].sort(), impossible: true });
    const explicitCity = safeCitiesByCode.get(leftCode)?.[0];
    if (explicitCity) push({ category: "explicit-city-extra-country", query: `${explicitCity.canonicalNameEn} ${rightLabel} 14 days`, durationDays: 14, countryCodes: [leftCode, rightCode].sort(), cityQids: [explicitCity.wikidataId], allowConflict: rightCode === "MC" });
  }

  let pairedCityCountries = 0;
  for (const [countryCode] of COUNTRIES) {
    const safe = safeCitiesByCode.get(countryCode) || [];
    if (safe.length < 2 || pairedCityCountries >= 10) continue;
    const first = safe[0];
    const second = safe[1];
    push({ category: "explicit-two-city", query: `${first.canonicalNameEn} ${second.canonicalNameEn} 7 days`, durationDays: 7, countryCodes: [countryCode], cityQids: [first.wikidataId, second.wikidataId], exactCityCount: 2 });
    push({ category: "fixed-city-order", query: `${first.canonicalNameEn} → ${second.canonicalNameEn} 7 days`, durationDays: 7, countryCodes: [countryCode], cityQids: [first.wikidataId, second.wikidataId], exactCityCount: 2, fixedOrder: true });
    pairedCityCountries += 1;
  }
  assert.equal(pairedCityCountries, 10, "ten Batch 08 countries must support two-city stress cases");

  for (const [query, durationDays] of [["2月", null], ["冬天", null], ["7 days", 7], ["2", 2]]) {
    push({ category: "destination-free-recommendation", query, durationDays });
  }
  for (const query of ["Armenia island vacation 7 days", "Luxembourg island vacation 7 days", "Moldova island vacation 7 days", "Paraguay island vacation 7 days"]) {
    push({ category: "insufficient-theme-evidence", query, durationDays: 7, allowConflict: true });
  }
  for (const query of ["Santiago 7 days", "Lagos 7 days", "Cordoba 7 days"]) {
    push({ category: "homonym-fail-closed", query, impossible: true });
  }

  const results = [];
  for (const [index, testCase] of cases.entries()) {
    const response = await service.search({ query: testCase.query, limit: 3, sessionId: `batch08-stress-${index + 1}` });
    if (testCase.impossible) {
      assert.equal(response.records.length, 0, `${testCase.query}: must fail closed`);
      assert.match(String(response.diagnostics?.reason || ""), /(constraint|capacity|duration|ambig|unresolved)/u, `${testCase.query}: explicit fail-closed diagnostics`);
      results.push({ category: testCase.category, query: testCase.query, outcome: "fail-closed" });
      continue;
    }
    if (testCase.allowConflict && response.records.length === 0) {
      assert.match(String(response.diagnostics?.reason || ""), /(constraint|unresolved|ambig)/u, `${testCase.query}: trusted fail-closed diagnostics`);
      results.push({ category: testCase.category, query: testCase.query, outcome: "fail-closed" });
      continue;
    }
    assert(response.records.length > 0, `${testCase.query}: route expected; ${JSON.stringify(response.diagnostics)}`);
    const record = response.records[0];
    const actualCountries = recordCountryCodes(record).sort();
    const actualCities = recordCityEntities(record);
    const actualCityQids = actualCities.map((city) => city.wikidataId);
    if (testCase.countryCodes) assert.deepEqual(actualCountries, testCase.countryCodes, `${testCase.query}: hard Country set`);
    if (testCase.durationDays != null) assert.equal(Number(record.durationDays), testCase.durationDays, `${testCase.query}: exact days`);
    for (const qid of testCase.cityQids || []) assert(actualCityQids.includes(qid), `${testCase.query}: explicit City ${qid}`);
    if (testCase.exactCityCount != null) assert.equal(actualCities.length, testCase.exactCityCount, `${testCase.query}: exact explicit City count`);
    if (testCase.fixedOrder) assert.deepEqual(actualCityQids, testCase.cityQids, `${testCase.query}: fixed order`);
    assert.equal(new Set(actualCityQids).size, actualCityQids.length, `${testCase.query}: no duplicate City padding`);
    results.push({ category: testCase.category, query: testCase.query, outcome: "route", countryCodes: actualCountries, cityQids: actualCityQids });
  }
  const categories = Object.fromEntries([...new Set(results.map((record) => record.category))].sort().map((category) => [category, results.filter((record) => record.category === category).length]));
  assert(cases.length >= 300, `expected hundreds of stress cases, received ${cases.length}`);
  return {
    schemaVersion: "route-v2-knowledge-expansion-batch08-hard-constraint-stress-v1",
    generatedAt: "2026-08-28T10:00:00.000Z",
    status: "PASS",
    summary: { totalCases: cases.length, routeCases: results.filter((record) => record.outcome === "route").length, failClosedCases: results.filter((record) => record.outcome === "fail-closed").length, categories },
    assertions: { hardCountryPreserved: true, hardCityPreserved: true, fixedOrderPreserved: true, noDuplicateCityPadding: true, impossibleConstraintsFailClosed: true, externalFetchCalls: 0 },
    results,
  };
}
