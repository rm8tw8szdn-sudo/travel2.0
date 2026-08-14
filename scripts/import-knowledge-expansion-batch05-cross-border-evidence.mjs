import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { normalizeLocalEvidenceSource, sha256EvidenceContent } from "../src/lib/routes/local-evidence-source-schema.mjs";
import { normalizeRouteLegEvidence, validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { stableHash } from "../src/lib/routes/route-v2-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = "2026-08-11T04:00:00.000Z";
const ROUTE_LEG_PATH = "data/route-v2/evidence-seed/route-leg-evidence.jsonl";
const MANIFEST_PATH = "data/route-v2/evidence-seed/evidence-seed-manifest.json";
const AUDIT_PATH = "data/knowledge/batches/knowledge-expansion-batch05-cross-border-evidence-audit.json";

const CONNECTIONS = Object.freeze([
  { from: "Q84", to: "Q90", mode: "rail", url: "https://www.eurostar.com/uk-en/train/france", locator: "Direct London to Paris services", excerpt: "Eurostar publishes direct passenger trains from London to Paris." },
  { from: "Q1761", to: "Q10686", mode: "rail", url: "https://www.irishrail.ie/en-ie/offer/take-the-enterprise-service-to-belfast", locator: "Enterprise service", excerpt: "Iarnród Éireann publishes the cross-border Enterprise passenger service between Dublin and Belfast." },
  { from: "Q1085", to: "Q1741", mode: "rail", url: "https://www.cd.cz/en/typy-jizdenek/vlakem-do-evropy/-27821/", locator: "Prague to Vienna", excerpt: "České dráhy publishes direct Railjet passenger service between Prague and Vienna." },
  { from: "Q1085", to: "Q1781", mode: "rail", url: "https://www.mavcsoport.hu/en/mav-szemelyszallitas/international-travels/travel-night-trains", locator: "Budapest–Prague", excerpt: "MÁV publishes the Budapest–Prague Metropol EuroNight passenger connection." },
  { from: "Q1741", to: "Q1781", mode: "rail", url: "https://www.mavcsoport.hu/en", locator: "International travel", excerpt: "MÁV publishes international passenger rail travel on the Budapest–Vienna corridor." },
  { from: "Q1781", to: "Q1435", mode: "rail", url: "https://www.mavcsoport.hu/sites/default/files/upload/line-lock/10-18_tajekoztato_koprivnica-zagreb_260406-21_0.pdf", locator: "Budapest–Zagreb passenger service", excerpt: "MÁV publishes passenger rail operation on the Budapest–Koprivnica–Zagreb corridor." },
  { from: "Q1748", to: "Q2211", mode: "rail", url: "https://www.oresundstag.se/en/travel-information/timetables", locator: "Copenhagen–Malmö timetable", excerpt: "Öresundståg publishes passenger timetables in both directions between Copenhagen and Malmö." },
  { from: "Q239", to: "Q727", mode: "rail", url: "https://www.eurostar.com/be-en/train/brussels-to-amsterdam", locator: "Direct Brussels to Amsterdam", excerpt: "Eurostar publishes direct passenger trains between Brussels and Amsterdam." },
  { from: "Q239", to: "Q90", mode: "rail", url: "https://www.eurostar.com/be-en/train/brussels-to-paris", locator: "Direct Brussels to Paris", excerpt: "Eurostar publishes direct passenger trains between Brussels and Paris." },
  { from: "Q270", to: "Q1085", mode: "rail", url: "https://www.cd.cz/en/typy-jizdenek/mezinarodni-jizdenky/-28868/", locator: "Prague–Warsaw", excerpt: "České dráhy publishes international passenger tickets for the Prague–Warsaw rail connection." },
  { from: "Q437", to: "Q1435", mode: "rail", url: "https://potniski.sz.si/wp-content/uploads/2026/05/Ljubljana%E2%80%93Zagreb-in-obratno.pdf", locator: "Ljubljana–Zagreb timetable", excerpt: "Slovenske železnice publishes passenger connections between Ljubljana and Zagreb in both directions." },
  { from: "Q60", to: "Q172", mode: "rail", url: "https://content.amtrak.com/content/timetable/Maple%20Leaf.pdf", locator: "Maple Leaf timetable", excerpt: "Amtrak publishes the Maple Leaf passenger timetable linking New York and Toronto." },
]);

const INVESTIGATED_NOT_PUBLISHED = Object.freeze([
  {
    from: "Kuala Lumpur",
    to: "Singapore",
    reason: "No single stable official source confirmed a reusable city-to-city passenger leg without date-specific transfers; kept out of published Evidence.",
    sourcesReviewed: ["https://www.ktmb.com.my/MapsAndRoute.html"],
  },
]);

function parseJsonl(text) {
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function evidenceSource(connection, fromEntityId, toEntityId) {
  const supports = [`route-leg:${fromEntityId}>${toEntityId}:feasibility`];
  return normalizeLocalEvidenceSource({
    url: connection.url,
    supports,
    retrievedAt: NOW,
    confidence: 0.9,
    factLocator: connection.locator,
    factExcerpt: connection.excerpt,
    contentHash: sha256EvidenceContent(connection.excerpt),
  });
}

function routeLeg(connection, fromEntityId, toEntityId) {
  const source = evidenceSource(connection, fromEntityId, toEntityId);
  const record = normalizeRouteLegEvidence({
    fromEntityId,
    toEntityId,
    transportMode: connection.mode,
    directed: true,
    feasibilityStatus: "feasible",
    durationMinMinutes: null,
    durationMaxMinutes: null,
    transferCount: null,
    frequencyLevel: "unknown",
    sourceRefs: [source.sourceId],
    sources: [source],
    confidence: 0.9,
    freshnessStatus: "fresh",
    retrievedAt: NOW,
    expiresAt: null,
    unknowns: [
      { field: "duration", reason: "Timetable-dependent duration is intentionally not generalized." },
      { field: "transferCount", reason: "A stable reusable transfer count is not asserted." },
      { field: "frequencyLevel", reason: "A stable reusable frequency is not asserted." },
    ],
    conflicts: [],
    diagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }, { now: () => NOW });
  const validation = validateRouteLegEvidence(record);
  if (!validation.accepted) throw new Error(`cross-border-leg-invalid:${validation.reasons.join("|")}`);
  return validation.record;
}

async function atomicText(relativePath, contents) {
  const filePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents, "utf8");
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
  const citiesByQid = new Map(repository.listCities().map((city) => [city.wikidataId, city]));
  const additions = [];
  const published = [];
  for (const connection of CONNECTIONS) {
    const left = citiesByQid.get(connection.from);
    const right = citiesByQid.get(connection.to);
    if (!left || !right) throw new Error(`cross-border-city-missing:${connection.from}>${connection.to}`);
    const forward = routeLeg(connection, left.entityId, right.entityId);
    const reverse = routeLeg(connection, right.entityId, left.entityId);
    additions.push(forward, reverse);
    published.push({
      fromEntityId: left.entityId,
      toEntityId: right.entityId,
      fromQid: left.wikidataId,
      toQid: right.wikidataId,
      sourceUrl: connection.url,
      directedEvidenceIds: [forward.legEvidenceId, reverse.legEvidenceId],
    });
  }

  const existing = parseJsonl(await readFile(path.join(ROOT, ROUTE_LEG_PATH), "utf8"));
  const additionIds = new Set(additions.map((record) => record.legEvidenceId));
  const routeLegs = [...new Map([...existing.filter((record) => !additionIds.has(record.legEvidenceId)), ...additions]
    .map((record) => [record.legEvidenceId, record])).values()]
    .sort((left, right) => left.legEvidenceId.localeCompare(right.legEvidenceId, "en"));
  for (const record of routeLegs) {
    const validation = validateRouteLegEvidence(record);
    if (!validation.accepted) throw new Error(`route-leg-invalid:${record.legEvidenceId}:${validation.reasons.join("|")}`);
  }

  const manifest = JSON.parse(await readFile(path.join(ROOT, MANIFEST_PATH), "utf8"));
  const seasons = parseJsonl(await readFile(path.join(ROOT, "data/route-v2/evidence-seed/season-evidence.jsonl"), "utf8"));
  const nextManifest = {
    ...manifest,
    routeLegEvidenceIds: routeLegs.map((record) => record.legEvidenceId),
    counts: { routeLeg: routeLegs.length, season: seasons.length, total: routeLegs.length + seasons.length },
    promotedEvidenceHash: stableHash({ routeLegs, seasons }),
  };
  const audit = {
    schemaVersion: "route-v2-knowledge-expansion-batch05-cross-border-audit-v1",
    retrievedAt: NOW,
    publishedPairCount: published.length,
    publishedDirectedEvidenceCount: additions.length,
    published,
    investigatedNotPublished: INVESTIGATED_NOT_PUBLISHED,
  };
  await atomicText(ROUTE_LEG_PATH, `${routeLegs.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await atomicText(MANIFEST_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`);
  await atomicText(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify({
    status: "PASS",
    verifier: "knowledge-expansion-batch05-cross-border-evidence-import",
    publishedPairs: published.length,
    directedEvidenceAdded: additions.length,
    investigatedNotPublished: INVESTIGATED_NOT_PUBLISHED.length,
    counts: nextManifest.counts,
  }, null, 2));
}

await main();
