import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAcceptedRouteRepository,
  createRouteDiscovery,
  validateRouteContent,
} from "../src/lib/routes/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "output", "route-v2-live-acceptance.json");
const storagePath = process.env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "accepted-routes.json");
const repository = createAcceptedRouteRepository({ storagePath });
const discovery = createRouteDiscovery({ acceptedRepository: repository });

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function unique(values, key) {
  const seen = new Set();
  return values.filter((item) => {
    const identity = key(item);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function assertAcceptedRecord(record) {
  const quality = validateRouteContent(record);
  if (!quality.accepted) throw new Error(`content quality failed: ${quality.reasons.join(",")}`);
  if (record.contentQualityStatus !== "accepted") throw new Error("record is not accepted");
  if (!record.coverAsset?.imageUrl) throw new Error("route cover is missing");
  if (!record.countries?.length || !record.destinationEntities?.length) throw new Error("country or destination is missing");
  const text = [record.name, record.summary, record.recommendationText, ...(record.highlights || []), ...(record.themes || []), ...(record.destinations || [])].join(" ");
  if (!/[\u3400-\u9fff]/u.test(text)) throw new Error("Chinese display content is missing");
  if (/经典路线\s*[·-]|\d+$|季节灵活|约6天/u.test(`${record.name} ${record.recommendedDays} ${(record.bestMonths || []).join(" ")}`)) throw new Error("generic/default display content leaked");
}

async function verifyQuery(sample) {
  const first = await discovery.discover({
    mode: "feed",
    query: sample.query,
    limit: 8,
    cursor: null,
    routeType: sample.routeType || "",
    excludeIds: [],
    sessionId: `repository-sample-${sample.type}`,
  });
  if (!first.records.length) throw new Error("empty accepted repository result");
  first.records.forEach(assertAcceptedRecord);
  if (!first.records.some(sample.matches)) throw new Error("search returned unrelated accepted routes");
  const ids = first.records.map((record) => record.id);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate routeId in first page");
  const titles = first.records.map((record) => record.name);
  if (new Set(titles).size !== titles.length) throw new Error("duplicate Chinese title in first page");
  let pagination = "not-applicable";
  if (first.hasMore && first.nextCursor) {
    const second = await discovery.discover({
      mode: "feed",
      query: sample.query,
      limit: 8,
      cursor: first.nextCursor,
      routeType: sample.routeType || "",
      excludeIds: ids,
      sessionId: `repository-sample-${sample.type}`,
    });
    if (second.records.some((record) => ids.includes(record.id))) throw new Error("pagination repeated routeId");
    second.records.forEach(assertAcceptedRecord);
    pagination = "passed";
  }
  return { type: sample.type, query: sample.query, matchedRouteIds: first.records.filter(sample.matches).map((record) => record.id), routeType: sample.routeType || "", pagination };
}

const report = { startedAt: new Date().toISOString(), pool: repository.status(), samples: [], extraSamples: [], failures: [] };
try {
  const records = repository.list({ limit: 10_000 }).records;
  if (!repository.status().meetsMinimum) throw new Error(`Accepted pool below minimum: ${JSON.stringify(repository.status())}`);
  const countries = shuffle(unique(records.flatMap((record) => record.countryEntities || []).filter((item) => item.countryCode !== "CN"), (item) => item.countryCode)).slice(0, 10);
  const cities = shuffle(unique(records.flatMap((record) => record.destinationEntities || []).filter((item) => item.countryCode !== "CN"), (item) => item.wikidataId)).slice(0, 10);
  const routeSamples = shuffle(records).slice(0, 10);
  if (countries.length < 10 || cities.length < 10 || routeSamples.length < 10) throw new Error(`Sample pool is too small: ${countries.length} countries, ${cities.length} cities, ${routeSamples.length} routes`);
  const samples = [
    ...countries.map((country) => ({ type: "country", query: country.name, matches: (record) => record.countryEntities.some((item) => item.countryCode === country.countryCode) })),
    ...cities.map((city) => ({ type: "city", query: city.name, matches: (record) => record.destinationEntities.some((item) => item.wikidataId === city.wikidataId) })),
    ...routeSamples.map((route) => ({ type: "route", query: route.name, routeType: route.classification, matches: (record) => record.id === route.id })),
  ];
  for (const sample of samples) {
    try {
      const result = await verifyQuery(sample);
      report.samples.push(result);
      process.stdout.write(`PASS ${sample.type}: ${sample.query}\n`);
    } catch (error) {
      report.failures.push({ type: sample.type, query: sample.query, message: error.message });
      break;
    }
  }
  if (!report.failures.length) {
    const extra = shuffle(unique(records.flatMap((record) => record.destinationEntities || []), (item) => item.wikidataId)).slice(10, 15);
    for (const city of extra) {
      const result = await verifyQuery({ type: "extra-city", query: city.sourceTitle || city.name, matches: (record) => record.destinationEntities.some((item) => item.wikidataId === city.wikidataId) });
      report.extraSamples.push(result);
      process.stdout.write(`PASS extra-city: ${city.name}\n`);
    }
  }
} catch (error) {
  report.failures.push({ type: "setup", query: "", message: error.message });
} finally {
  report.finishedAt = new Date().toISOString();
  report.passed = report.failures.length === 0 && report.samples.length === 30 && report.extraSamples.length === 5;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (!report.passed) {
  console.error(`Route V2 repository acceptance failed. Report: ${reportPath}`);
  process.exitCode = 1;
} else {
  console.log(`Route V2 repository acceptance passed: 10 countries, 10 cities, 10 route names, plus 5 extra entity samples. Report: ${reportPath}`);
}
