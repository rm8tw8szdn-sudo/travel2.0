import crypto from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
export const POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch02-candidates.wikidata.json";
const RAW_PATH = path.resolve(REPOSITORY_ROOT, POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH);
const SELECTION_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch02-selection.json";
const SELECTION_PATH = path.resolve(REPOSITORY_ROOT, SELECTION_RELATIVE_PATH);
const SELECTION_POLICY_VERSION = "p1b-batch02-poi-selection-v1";
const SELECTION_RULE = "three-primary-backup-optional";
const ENTITY_API_ENDPOINT = "https://www.wikidata.org/w/api.php";
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "travel-collection-route-v2-p1b-batch02-poi-evidence/1.0";
const LANGUAGES = Object.freeze(["en", "zh-hans", "zh", "fr", "de", "it", "es", "ko"]);
const BLOCKING_TYPE_QIDS = Object.freeze([
  "Q6256", // country
  "Q515", // city
  "Q486972", // human settlement
  "Q56061", // administrative territorial entity
  "Q1907114", // metropolitan area
  "Q82794", // geographic region
  "Q149621", // district
  "Q473972", // protected area
  "Q179049", // nature reserve
  "Q8502", // mountain
  "Q23442", // island
  "Q23397", // lake
]);

export const POI_BASELINE_P1B_BATCH02_CANDIDATES = Object.freeze([
  Object.freeze({ countryCode: "FR", countryQid: "Q142", city: "Paris", cityQid: "Q90", parentCityEntityId: "city-32da4cad2757df97", wikidataId: "Q243", expectedNameEn: "Eiffel Tower" }),
  Object.freeze({ countryCode: "FR", countryQid: "Q142", city: "Paris", cityQid: "Q90", parentCityEntityId: "city-32da4cad2757df97", wikidataId: "Q19675", expectedNameEn: "Louvre Museum" }),
  Object.freeze({ countryCode: "FR", countryQid: "Q142", city: "Paris", cityQid: "Q90", parentCityEntityId: "city-32da4cad2757df97", wikidataId: "Q23402", expectedNameEn: "Musée d'Orsay" }),
  Object.freeze({ countryCode: "FR", countryQid: "Q142", city: "Lyon", cityQid: "Q456", parentCityEntityId: "city-5bba0fc2f52dc8df", wikidataId: "Q1516", expectedNameEn: "Basilica of Notre-Dame de Fourvière" }),
  Object.freeze({ countryCode: "FR", countryQid: "Q142", city: "Lyon", cityQid: "Q456", parentCityEntityId: "city-5bba0fc2f52dc8df", wikidataId: "Q8352", expectedNameEn: "Musée des Confluences" }),
  Object.freeze({ countryCode: "FR", countryQid: "Q142", city: "Lyon", cityQid: "Q456", parentCityEntityId: "city-5bba0fc2f52dc8df", wikidataId: "Q511", expectedNameEn: "Museum of Fine Arts of Lyon" }),
  Object.freeze({ countryCode: "DE", countryQid: "Q183", city: "Berlin", cityQid: "Q64", parentCityEntityId: "city-92d9ceba1c4a056d", wikidataId: "Q151963", expectedNameEn: "Museum Island" }),
  Object.freeze({ countryCode: "DE", countryQid: "Q183", city: "Berlin", cityQid: "Q64", parentCityEntityId: "city-92d9ceba1c4a056d", wikidataId: "Q82425", expectedNameEn: "Brandenburg Gate" }),
  Object.freeze({ countryCode: "DE", countryQid: "Q183", city: "Berlin", cityQid: "Q64", parentCityEntityId: "city-92d9ceba1c4a056d", wikidataId: "Q313746", expectedNameEn: "East Side Gallery" }),
  Object.freeze({ countryCode: "DE", countryQid: "Q183", city: "Munich", cityQid: "Q1726", parentCityEntityId: "city-6dd5cc0f5d9b27be", wikidataId: "Q252648", expectedNameEn: "Marienplatz" }),
  Object.freeze({ countryCode: "DE", countryQid: "Q183", city: "Munich", cityQid: "Q1726", parentCityEntityId: "city-6dd5cc0f5d9b27be", wikidataId: "Q260223", expectedNameEn: "Englischer Garten" }),
  Object.freeze({ countryCode: "DE", countryQid: "Q183", city: "Munich", cityQid: "Q1726", parentCityEntityId: "city-6dd5cc0f5d9b27be", wikidataId: "Q131631", expectedNameEn: "Nymphenburg Palace" }),
  Object.freeze({ countryCode: "IT", countryQid: "Q38", city: "Rome", cityQid: "Q220", parentCityEntityId: "city-133b155bac966dfa", wikidataId: "Q10285", expectedNameEn: "Colosseum", expectedDescriptionCityNameEn: "Rome" }),
  Object.freeze({ countryCode: "IT", countryQid: "Q38", city: "Rome", cityQid: "Q220", parentCityEntityId: "city-133b155bac966dfa", wikidataId: "Q99309", expectedNameEn: "Pantheon" }),
  Object.freeze({ countryCode: "IT", countryQid: "Q38", city: "Rome", cityQid: "Q220", parentCityEntityId: "city-133b155bac966dfa", wikidataId: "Q185382", expectedNameEn: "Trevi Fountain" }),
  Object.freeze({ countryCode: "IT", countryQid: "Q38", city: "Florence", cityQid: "Q2044", parentCityEntityId: "city-d40570b2aac4850d", wikidataId: "Q51252", expectedNameEn: "Uffizi Gallery" }),
  Object.freeze({ countryCode: "IT", countryQid: "Q38", city: "Florence", cityQid: "Q2044", parentCityEntityId: "city-d40570b2aac4850d", wikidataId: "Q191739", expectedNameEn: "Florence Cathedral" }),
  Object.freeze({ countryCode: "IT", countryQid: "Q38", city: "Florence", cityQid: "Q2044", parentCityEntityId: "city-d40570b2aac4850d", wikidataId: "Q1348158", expectedNameEn: "piazzale Michelangelo" }),
  Object.freeze({ countryCode: "ES", countryQid: "Q29", city: "Madrid", cityQid: "Q2807", parentCityEntityId: "city-f833a342bb5b925a", wikidataId: "Q160112", expectedNameEn: "Museo del Prado" }),
  Object.freeze({ countryCode: "ES", countryQid: "Q29", city: "Madrid", cityQid: "Q2807", parentCityEntityId: "city-f833a342bb5b925a", wikidataId: "Q171517", expectedNameEn: "Royal Palace of Madrid" }),
  Object.freeze({ countryCode: "ES", countryQid: "Q29", city: "Madrid", cityQid: "Q2807", parentCityEntityId: "city-f833a342bb5b925a", wikidataId: "Q1131807", expectedNameEn: "El Retiro Park" }),
  Object.freeze({ countryCode: "ES", countryQid: "Q29", city: "Barcelona", cityQid: "Q1492", parentCityEntityId: "city-6e97dec8890873f7", wikidataId: "Q48435", expectedNameEn: "Basilica and Expiatory Church of the Holy Family" }),
  Object.freeze({ countryCode: "ES", countryQid: "Q29", city: "Barcelona", cityQid: "Q1492", parentCityEntityId: "city-6e97dec8890873f7", wikidataId: "Q212867", expectedNameEn: "Park Güell" }),
  Object.freeze({ countryCode: "ES", countryQid: "Q29", city: "Barcelona", cityQid: "Q1492", parentCityEntityId: "city-6e97dec8890873f7", wikidataId: "Q461371", expectedNameEn: "Casa Batlló" }),
  Object.freeze({ countryCode: "KR", countryQid: "Q884", city: "Seoul", cityQid: "Q8684", parentCityEntityId: "city-f485961843960f06", wikidataId: "Q477157", expectedNameEn: "Changdeokgung" }),
  Object.freeze({ countryCode: "KR", countryQid: "Q884", city: "Seoul", cityQid: "Q8684", parentCityEntityId: "city-f485961843960f06", wikidataId: "Q494407", expectedNameEn: "National Museum of Korea" }),
  Object.freeze({ countryCode: "KR", countryQid: "Q884", city: "Seoul", cityQid: "Q8684", parentCityEntityId: "city-f485961843960f06", wikidataId: "Q69134", expectedNameEn: "Namsan Seoul Tower" }),
  Object.freeze({ countryCode: "KR", countryQid: "Q884", city: "Busan", cityQid: "Q16520", parentCityEntityId: "city-6fdc557c860230e3", wikidataId: "Q16689597", expectedNameEn: "Busan Museum" }),
  Object.freeze({ countryCode: "KR", countryQid: "Q884", city: "Busan", cityQid: "Q16520", parentCityEntityId: "city-6fdc557c860230e3", wikidataId: "Q490777", expectedNameEn: "Diamond Tower" }),
  Object.freeze({ countryCode: "KR", countryQid: "Q884", city: "Busan", cityQid: "Q16520", parentCityEntityId: "city-6fdc557c860230e3", wikidataId: "Q2494268", expectedNameEn: "Haedong Yonggungsa" }),
]);

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function stableObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en")));
}

function stableClaims(claims = []) {
  return [...claims].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));
}

function pruneEntity(entity, responseMapKey) {
  if (!entity || entity.missing !== undefined) return entity ? { responseMapKey, id: entity.id, missing: entity.missing } : undefined;
  return {
    responseMapKey,
    pageid: entity.pageid,
    ns: entity.ns,
    title: entity.title,
    lastrevid: entity.lastrevid,
    modified: entity.modified,
    type: entity.type,
    id: entity.id,
    labels: stableObject(entity.labels || {}),
    descriptions: stableObject(entity.descriptions || {}),
    aliases: stableObject(entity.aliases || {}),
    claims: Object.fromEntries(["P17", "P31", "P131", "P276", "P625"].map((property) => [
      property,
      stableClaims(entity.claims?.[property] || []),
    ])),
  };
}

function claimQids(entity, property) {
  return [...new Set((entity?.claims?.[property] || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter((value) => /^Q\d+$/u.test(String(value))))].sort((left, right) => left.localeCompare(right, "en"));
}

function coordinates(entity) {
  return (entity?.claims?.P625 || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter((value) => Number.isFinite(Number(value?.latitude)) && Number.isFinite(Number(value?.longitude)));
}

function qidFromUri(value) {
  return String(value || "").match(/Q\d+$/u)?.[0] || "";
}

function buildParentQuery() {
  const values = POI_BASELINE_P1B_BATCH02_CANDIDATES
    .map((candidate) => `(wd:${candidate.wikidataId} wd:${candidate.cityQid} wd:${candidate.countryQid})`)
    .join(" ");
  return `SELECT DISTINCT ?item ?city ?country ?evidenceType WHERE {
    VALUES (?item ?city ?country) { ${values} }
    { ?item wdt:P131* ?city . BIND("administrative-path" AS ?evidenceType) }
    UNION { ?item wdt:P276 ?city . BIND("direct-location" AS ?evidenceType) }
    UNION { ?item wdt:P17 ?country . BIND("country-match" AS ?evidenceType) }
  }
  ORDER BY ?item ?evidenceType`;
}

async function fetchJsonWithRetry(url, options, { fetchImplementation, timeoutMs, retries, counters }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      counters.httpRequestCount += 1;
      const response = await fetchImplementation(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`wikidata-fetch-failed:${response.status}`);
      const payload = await response.json();
      clearTimeout(timer);
      return payload;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= retries) break;
      counters.retryCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function validateKnowledgePoiBaselineP1bBatch02CandidateRaw(raw) {
  const entities = raw?.wikidata?.entities || {};
  const parentEvidence = raw?.parentEvidence || {};
  const expectedQids = POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.wikidataId).sort();
  const globalReasons = [];
  if (raw?.schemaVersion !== "route-v2-poi-baseline-p1b-batch02-candidate-evidence-v1") globalReasons.push("schema-version-invalid");
  if (raw?.source?.provider !== "wikidata-api+sparql") globalReasons.push("provider-invalid");
  if (JSON.stringify(Object.keys(entities).sort()) !== JSON.stringify(expectedQids)) globalReasons.push("qid-set-mismatch");
  if (Number.isNaN(Date.parse(raw?.retrievedAt))) globalReasons.push("retrieved-at-invalid");

  const results = POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => {
    const entity = entities[candidate.wikidataId];
    const evidence = parentEvidence[candidate.wikidataId] || {};
    const reasons = [];
    const p17 = claimQids(entity, "P17");
    const p31 = claimQids(entity, "P31");
    const coordinateValues = coordinates(entity);
    const labelEn = entity?.labels?.en?.value || "";
    const labelZh = entity?.labels?.["zh-hans"]?.value || entity?.labels?.zh?.value || "";
    const blockingTypeQids = p31.filter((qid) => BLOCKING_TYPE_QIDS.includes(qid));
    const parentAccepted = evidence.expectedCityWikidataId === candidate.cityQid
      && evidence.expectedCountryWikidataId === candidate.countryQid
      && evidence.countryMatch === true
      && (evidence.administrativePath === true
        || evidence.directLocation === true
        || (candidate.expectedDescriptionCityNameEn && evidence.descriptionCityMatch === true));
    if (!entity || entity.missing !== undefined) reasons.push("entity-missing");
    if (entity?.responseMapKey !== candidate.wikidataId || entity?.id !== candidate.wikidataId) reasons.push("exact-qid-mismatch");
    if (labelEn !== candidate.expectedNameEn) reasons.push("canonical-name-en-mismatch");
    if (!labelZh) reasons.push("canonical-name-zh-missing");
    if (!p17.includes(candidate.countryQid)) reasons.push("country-evidence-mismatch");
    if (!parentAccepted) reasons.push("city-parent-evidence-mismatch");
    if (p31.length === 0) reasons.push("type-evidence-missing");
    if (blockingTypeQids.length > 0) reasons.push("blocking-type-qid");
    if (coordinateValues.length !== 1) reasons.push("coordinate-cardinality-invalid");
    return {
      candidateKey: `${candidate.cityQid}:${candidate.wikidataId}`,
      ...candidate,
      labelEn,
      labelZh,
      p17,
      p31,
      blockingTypeQids,
      coordinateCount: coordinateValues.length,
      parentEvidence: evidence,
      parentAccepted,
      status: reasons.length === 0 ? "pass" : "blocking",
      reasons,
    };
  });
  return {
    status: globalReasons.length === 0 && results.every((result) => result.status === "pass") ? "PASS" : "BLOCKED",
    globalReasons,
    candidateCount: results.length,
    passCount: results.filter((result) => result.status === "pass").length,
    blockingCount: results.filter((result) => result.status === "blocking").length,
    results,
  };
}

export async function refreshKnowledgePoiBaselineP1bBatch02CandidateRaw({
  fetchImplementation = globalThis.fetch,
  timeoutMs = 60_000,
  retries = 2,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof fetchImplementation !== "function") throw new Error("wikidata-fetch-unavailable");
  const entityEndpoint = new URL(ENTITY_API_ENDPOINT);
  entityEndpoint.search = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    props: "labels|descriptions|aliases|claims",
    languages: LANGUAGES.join("|"),
    ids: POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.wikidataId).join("|"),
    origin: "*",
  }).toString();
  const parentQuery = buildParentQuery();
  const counters = { httpRequestCount: 0, retryCount: 0 };
  const headers = { accept: "application/json", "user-agent": USER_AGENT };
  const entityPayload = await fetchJsonWithRetry(entityEndpoint, { headers }, {
    fetchImplementation, timeoutMs, retries, counters,
  });
  const parentPayload = await fetchJsonWithRetry(SPARQL_ENDPOINT, {
    method: "POST",
    headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ query: parentQuery, format: "json" }),
  }, { fetchImplementation, timeoutMs, retries, counters });

  const entities = Object.fromEntries(Object.entries(entityPayload?.entities || {})
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([responseMapKey, entity]) => [responseMapKey, pruneEntity(entity, responseMapKey)]));
  const parentEvidence = Object.fromEntries(POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => {
    const descriptionEn = entities[candidate.wikidataId]?.descriptions?.en?.value || "";
    return [candidate.wikidataId, {
      wikidataId: candidate.wikidataId,
      expectedCityWikidataId: candidate.cityQid,
      expectedCountryWikidataId: candidate.countryQid,
      administrativePath: false,
      directLocation: false,
      descriptionCityMatch: Boolean(candidate.expectedDescriptionCityNameEn
        && descriptionEn.toLocaleLowerCase("en").includes(candidate.expectedDescriptionCityNameEn.toLocaleLowerCase("en"))),
      countryMatch: false,
    }];
  }));
  for (const binding of parentPayload?.results?.bindings || []) {
    const qid = qidFromUri(binding.item?.value);
    if (!parentEvidence[qid]) continue;
    if (binding.evidenceType?.value === "administrative-path") parentEvidence[qid].administrativePath = true;
    if (binding.evidenceType?.value === "direct-location") parentEvidence[qid].directLocation = true;
    if (binding.evidenceType?.value === "country-match") parentEvidence[qid].countryMatch = true;
  }
  const raw = {
    schemaVersion: "route-v2-poi-baseline-p1b-batch02-candidate-evidence-v1",
    retrievedAt: now(),
    source: {
      provider: "wikidata-api+sparql",
      endpoints: [entityEndpoint.toString(), SPARQL_ENDPOINT],
      parentQuery,
      candidateCount: POI_BASELINE_P1B_BATCH02_CANDIDATES.length,
      cityCount: new Set(POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.cityQid)).size,
      wikidataIds: POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.wikidataId),
      httpRequestCount: counters.httpRequestCount,
      retryCount: counters.retryCount,
      entityRecordCount: Object.keys(entities).length,
      semanticBindingCount: parentPayload?.results?.bindings?.length || 0,
    },
    candidates: POI_BASELINE_P1B_BATCH02_CANDIDATES,
    parentEvidence,
    wikidata: { success: entityPayload?.success, entities },
  };
  return { ...raw, gate: validateKnowledgePoiBaselineP1bBatch02CandidateRaw(raw) };
}

async function writeTextAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function numericOption(args, name, fallback) {
  const argument = args.find((value) => value.startsWith(`--${name}=`));
  if (!argument) return fallback;
  const value = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(value) || value < 0) throw new Error(`invalid-${name}:${argument}`);
  return value;
}

async function verifySelection() {
  const rawText = await readFile(RAW_PATH, "utf8");
  const raw = JSON.parse(rawText);
  const gate = validateKnowledgePoiBaselineP1bBatch02CandidateRaw(raw);
  if (gate.status !== "PASS") throw new Error(`poi-batch02-candidate-gate-failed:${JSON.stringify(gate)}`);

  const selectionText = await readFile(SELECTION_PATH, "utf8");
  const selection = JSON.parse(selectionText);
  const rawSha256 = crypto.createHash("sha256").update(rawText).digest("hex");
  const selectionSha256 = crypto.createHash("sha256").update(selectionText).digest("hex");
  const expectedPrimaryQids = POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.wikidataId);
  const countryQids = new Set(POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.countryQid));
  const cityQids = new Set(POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.cityQid));

  if (selection?.schemaVersion !== "route-v2-poi-baseline-p1b-batch02-selection-v1") throw new Error("selection-schema-invalid");
  if (selection?.policyVersion !== SELECTION_POLICY_VERSION) throw new Error("selection-policy-invalid");
  if (selection?.selectionRule !== SELECTION_RULE) throw new Error("selection-rule-invalid");
  if (selection?.createdFromRawHashes?.base !== rawSha256) throw new Error("selection-source-hash-invalid");
  if (selection?.primaryCount !== 30 || selection?.backupCount !== 0) throw new Error("selection-count-invalid");
  if (JSON.stringify(selection?.primaryWikidataIds) !== JSON.stringify(expectedPrimaryQids)) throw new Error("selection-primary-qids-invalid");
  if (!Array.isArray(selection?.backupWikidataIds) || selection.backupWikidataIds.length !== 0) throw new Error("selection-backups-invalid");
  if (new Set(selection.primaryWikidataIds).size !== selection.primaryWikidataIds.length) throw new Error("selection-primary-qid-duplicate");
  if (!Array.isArray(selection?.cities) || selection.cities.length !== 10) throw new Error("selection-city-count-invalid");

  for (const city of selection.cities) {
    const expected = POI_BASELINE_P1B_BATCH02_CANDIDATES.filter((candidate) => candidate.cityQid === city.cityQid);
    if (expected.length !== 3) throw new Error(`selection-city-unknown:${city.cityQid}`);
    if (city.city !== expected[0].city || city.parentCityEntityId !== expected[0].parentCityEntityId) {
      throw new Error(`selection-city-identity-invalid:${city.cityQid}`);
    }
    if (JSON.stringify(city.primaryWikidataIds) !== JSON.stringify(expected.map((candidate) => candidate.wikidataId))) {
      throw new Error(`selection-city-qids-invalid:${city.cityQid}`);
    }
  }

  const countryPoiOverlap = selection.primaryWikidataIds.filter((qid) => countryQids.has(qid));
  const cityPoiOverlap = selection.primaryWikidataIds.filter((qid) => cityQids.has(qid));
  if (countryPoiOverlap.length > 0 || cityPoiOverlap.length > 0) throw new Error("selection-entity-type-qid-overlap");

  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    calledWikidata: false,
    candidateRawSha256: rawSha256,
    selectionSha256,
    policyVersion: selection.policyVersion,
    selectionRule: selection.selectionRule,
    cities: selection.cities.length,
    primary: selection.primaryCount,
    backups: selection.backupCount,
    countryPoiOverlap: countryPoiOverlap.length,
    cityPoiOverlap: cityPoiOverlap.length,
  }, null, 2)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const supported = args.every((argument) => ["--refresh", "--verify-selection"].includes(argument)
    || /^--(?:timeout-ms|retries)=\d+$/u.test(argument));
  if (!supported) throw new Error(`unsupported-arguments:${args.join(",")}`);
  if (args.includes("--refresh") && args.includes("--verify-selection")) throw new Error("refresh-and-verify-selection-mutually-exclusive");
  if (args.includes("--verify-selection")) {
    await verifySelection();
    return;
  }
  if (args.includes("--refresh")) {
    const raw = await refreshKnowledgePoiBaselineP1bBatch02CandidateRaw({
      timeoutMs: numericOption(args, "timeout-ms", 60_000),
      retries: numericOption(args, "retries", 2),
    });
    if (raw.gate.status !== "PASS") {
      process.stderr.write(`${JSON.stringify({ status: "RAW_REJECTED", gate: raw.gate }, null, 2)}\n`);
      throw new Error("poi-batch02-candidate-gate-failed");
    }
    const contents = serializeJson(raw);
    await writeTextAtomic(RAW_PATH, contents);
    process.stdout.write(`${JSON.stringify({
      status: "RAW_REFRESHED",
      calledWikidata: true,
      httpRequestCount: raw.source.httpRequestCount,
      retryCount: raw.source.retryCount,
      retrievedAt: raw.retrievedAt,
      candidateCount: raw.gate.candidateCount,
      passCount: raw.gate.passCount,
      blockingCount: raw.gate.blockingCount,
      raw: POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH,
      fileSizeBytes: Buffer.byteLength(contents),
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    }, null, 2)}\n`);
    return;
  }
  const contents = await readFile(RAW_PATH, "utf8");
  const raw = JSON.parse(contents);
  const gate = validateKnowledgePoiBaselineP1bBatch02CandidateRaw(raw);
  if (gate.status !== "PASS") throw new Error(`poi-batch02-candidate-gate-failed:${JSON.stringify(gate)}`);
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    calledWikidata: false,
    sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    retrievedAt: raw.retrievedAt,
    candidateCount: gate.candidateCount,
    passCount: gate.passCount,
    blockingCount: gate.blockingCount,
  }, null, 2)}\n`);
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
