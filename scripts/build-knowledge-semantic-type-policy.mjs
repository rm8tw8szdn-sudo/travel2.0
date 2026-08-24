import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import {
  semanticFactFromWikidataEntity,
  validatePublishedKnowledgeSemantics,
} from "../src/lib/routes/knowledge-semantic-gate.mjs";
import { stableHash } from "../src/lib/routes/route-v2-utils.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW_ROOT = path.join(ROOT, "data/knowledge/raw");
const CORRECTIONS_PATH = path.join(ROOT, "data/knowledge/semantic/production-integrity-corrections.json");
const EXCEPTIONS_PATH = path.join(ROOT, "data/knowledge/semantic/knowledge-semantic-exceptions.json");
const POLICY_PATH = path.join(ROOT, "data/knowledge/semantic/knowledge-semantic-type-policy.json");
const MAXIMUM_SUBCLASS_DEPTH = 8;
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "travel2-route-v2-semantic-audit/1.0 (https://github.com/rm8tw8szdn-sudo/travel2.0)";

const ROOTS = Object.freeze({
  city: Object.freeze([
    ["Q486972", "human settlement is the reviewed settlement root"],
    ["Q15284", "municipality is an explicitly supported local-government settlement form"],
  ]),
  poi: Object.freeze([
    ["Q570116", "tourist attraction"],
    ["Q41176", "building"],
    ["Q33506", "museum"],
    ["Q4989906", "monument"],
    ["Q1370598", "structure of worship"],
    ["Q22698", "park"],
    ["Q839954", "archaeological site"],
    ["Q9259", "World Heritage Site"],
    ["Q473972", "protected area"],
    ["Q294440", "public space"],
    ["Q121359", "infrastructure"],
    ["Q13226383", "facility"],
    ["Q3918", "university"],
    ["Q37654", "market"],
    ["Q166118", "archives"],
    ["Q838948", "work of art"],
    ["Q172754", "world's fair"],
    ["Q35145263", "natural geographic object"],
    ["Q20719696", "physico-geographical object"],
    ["Q15324", "body of water"],
    ["Q271669", "landform"],
    ["Q811979", "architectural structure"],
    ["Q811430", "fixed construction"],
    ["Q1497375", "architectural ensemble"],
    ["Q132911", "elevator"],
    ["Q210272", "cultural heritage"],
    ["Q338112", "recreation area"],
    ["Q123705", "neighborhood"],
  ]),
});

const COMPOSITE_ALLOWANCES = Object.freeze([
  ["Q173527", "poi-530476ec6243aa16", "Knossos is an archaeological site whose additional polis class also belongs to the settlement hierarchy."],
  ["Q8399", "poi-524890b346304829", "Vieux Lyon is intentionally published as a historic neighborhood POI rather than a route City."],
  ["Q45865", "poi-dd0ea8f8f324bbd1", "Hahoe Folk Village is an exact heritage-village POI represented as a human settlement."],
  ["Q18641306", "poi-8d4144297cdb2b44", "Gamcheon Culture Village is an exact cultural-village POI."],
  ["Q12605227", "poi-ac79c7ce38182554", "Abai Village is an exact visitor-facing village POI."],
  ["Q211252", "poi-a922cf46eed7d44e", "Madinat al-Zahra is an archaeological site whose historic city class is retained."],
  ["Q495266", "poi-df88170f6306e307", "Yangdong Folk Village is an exact heritage-village POI."],
  ["Q20444179", "poi-730cedb51468a4e5", "Dongpirang Village is an exact cultural-village POI."],
  ["Q11269655", "poi-d5ed664da2165f25", "Jeonju Hanok Village is an exact visitor-facing village POI."],
  ["Q3393650", "poi-88e1d189073082a5", "Serralves is an exact cultural foundation POI whose current P31 is foundation."],
  ["Q437959", "poi-7ab19c2b130f72e0", "Old Port of Marseille is an exact visitor-facing historic port POI whose seaport taxonomy exceeds the bounded generic POI path."],
  ["Q576339", "poi-bf0a161622a18722", "Albaicín is an exact visitor-facing historic neighborhood POI in Granada."],
  ["Q2842387", "poi-10ce57887f93f3ba", "Sacromonte is an exact visitor-facing historic neighborhood POI in Granada."],
  ["Q17154", "poi-2986b7ceeddfe153", "Gothic Quarter is an exact visitor-facing historic neighborhood POI in Barcelona."],
  ["Q151963", "poi-d406ad37b4ddadbc", "Museum Island is an exact visitor-facing museum ensemble and neighborhood POI in Berlin."],
  ["Q965606", "poi-69ee875827beaf18", "Petite France is an exact visitor-facing historic neighborhood POI in Strasbourg."],
  ["Q490981", "poi-bbd6159b384bb9c9", "Bukchon Hanok Village is an exact visitor-facing historic neighborhood POI in Seoul."],
].map(([qid, entityId, reason]) => Object.freeze({
  qid,
  entityId,
  kind: "poi",
  reason,
  sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
})));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function semanticFacts() {
  const facts = new Map();
  for (const name of fs.readdirSync(RAW_ROOT).filter((entry) => entry.endsWith(".wikidata.json")).sort()) {
    const raw = readJson(path.join(RAW_ROOT, name));
    const source = { sourcePath: `data/knowledge/raw/${name}`, retrievedAt: raw.retrievedAt };
    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      if (/^Q\d+$/u.test(String(value.id || "")) && value.labels && value.claims) {
        const fact = semanticFactFromWikidataEntity(value, source);
        if (fact) facts.set(fact.qid, fact);
        return;
      }
      Object.values(value).forEach(visit);
    };
    visit(raw);

    for (const binding of raw.wikidata?.results?.bindings || []) {
      const qid = String(binding.country?.value || "").match(/Q\d+$/u)?.[0];
      if (!qid) continue;
      const point = String(binding.coordinate?.value || "").match(/Point\(([-\d.]+)\s+([-\d.]+)\)/u);
      facts.set(qid, {
        qid,
        labels: Object.entries(binding)
          .filter(([key]) => /country(?:Label|Alias)/u.test(key))
          .map(([, item]) => item?.value)
          .filter(Boolean),
        semanticClass: "country",
        instanceOfIds: ["Q6256"],
        countryQids: [],
        coordinates: point ? { latitude: Number(point[2]), longitude: Number(point[1]) } : null,
        ...source,
      });
    }
  }
  const corrections = readJson(CORRECTIONS_PATH);
  for (const [qid, fact] of Object.entries(corrections.entities || {})) {
    facts.set(qid, { ...facts.get(qid), ...fact, qid });
  }
  return facts;
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function parentQids(entity = {}) {
  return [...new Set((entity.claims?.P279 || [])
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter((qid) => /^Q\d+$/u.test(String(qid || ""))))].sort();
}

async function fetchNodes(qids, retrievedAt) {
  const graph = new Map();
  const fetched = new Set();
  let frontier = [...new Set(qids)].sort();
  for (let depth = 0; depth <= MAXIMUM_SUBCLASS_DEPTH && frontier.length; depth += 1) {
    const batch = [...new Set(frontier)].filter((qid) => !fetched.has(qid)).sort();
    frontier = [];
    batch.forEach((qid) => fetched.add(qid));
    const responses = await Promise.all(chunks(batch, 50).map(async (ids) => {
      const url = new URL(WIKIDATA_API);
      for (const [key, value] of Object.entries({
        action: "wbgetentities",
        ids: ids.join("|"),
        props: "labels|claims",
        languages: "en",
        languagefallback: "1",
        format: "json",
        origin: "*",
      })) url.searchParams.set(key, value);
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) throw new Error(`wikidata-type-policy-fetch-${response.status}`);
      return response.json();
    }));
    for (const response of responses) {
      for (const [qid, entity] of Object.entries(response.entities || {})) {
        const parents = parentQids(entity);
        graph.set(qid, {
          qid,
          label: String(entity.labels?.en?.value || "").trim(),
          parentQids: parents,
          sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
          retrievedAt,
        });
        frontier.push(...parents);
      }
    }
  }
  return graph;
}

function shortestPathToRoot(startQid, rootQids, graph) {
  const roots = new Set(rootQids);
  const queue = [[startQid]];
  const visited = new Set([startQid]);
  while (queue.length) {
    const pathToNode = queue.shift();
    const current = pathToNode.at(-1);
    if (roots.has(current)) return pathToNode;
    if (pathToNode.length - 1 >= MAXIMUM_SUBCLASS_DEPTH) continue;
    for (const parentQid of graph.get(current)?.parentQids || []) {
      if (visited.has(parentQid)) continue;
      visited.add(parentQid);
      queue.push([...pathToNode, parentQid]);
    }
  }
  return null;
}

function pruneToReviewedPaths(typeClassifications, graph) {
  const retainedParents = new Map();
  for (const classification of Object.values(typeClassifications)) {
    for (const pathToRoot of Object.values(classification.allowedKinds)) {
      for (let index = 0; index < pathToRoot.length; index += 1) {
        const qid = pathToRoot[index];
        if (!retainedParents.has(qid)) retainedParents.set(qid, new Set());
        const parentQid = pathToRoot[index + 1];
        if (parentQid) retainedParents.get(qid).add(parentQid);
      }
    }
  }
  for (const qid of Object.values(ROOTS).flatMap((entries) => entries.map(([rootQid]) => rootQid))) {
    if (!retainedParents.has(qid)) retainedParents.set(qid, new Set());
  }
  return new Map([...retainedParents.entries()].map(([qid, parents]) => [qid, {
    ...graph.get(qid),
    parentQids: [...parents].sort(),
  }]));
}

const retrievedAtArg = process.argv.find((argument) => argument.startsWith("--retrieved-at="));
const retrievedAt = retrievedAtArg?.slice("--retrieved-at=".length) || new Date().toISOString();
if (Number.isNaN(Date.parse(retrievedAt))) throw new Error("valid --retrieved-at is required");

const repository = createPublishedKnowledgeEntityLayerRepository();
const facts = semanticFacts();
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const published = [...cities, ...pois];
const countryByEntityId = new Map(countries.map((entity) => [entity.entityId, entity]));
const cityByEntityId = new Map(cities.map((entity) => [entity.entityId, entity]));
const poiByEntityId = new Map(pois.map((entity) => [entity.entityId, entity]));
const observedTypeQids = [...new Set(published.flatMap((entity) => facts.get(entity.wikidataId)?.instanceOfIds || []))].sort();
const rootQids = Object.values(ROOTS).flatMap((entries) => entries.map(([qid]) => qid));
const fullGraph = await fetchNodes([...observedTypeQids, ...rootQids], retrievedAt);
const cityObservedTypes = new Set(cities.flatMap((entity) => facts.get(entity.wikidataId)?.instanceOfIds || []));
const poiObservedTypes = new Set(pois.flatMap((entity) => facts.get(entity.wikidataId)?.instanceOfIds || []));
const typeClassifications = Object.fromEntries(observedTypeQids.flatMap((typeQid) => {
  const allowedKinds = {};
  if (cityObservedTypes.has(typeQid)) {
    const cityPath = shortestPathToRoot(typeQid, ROOTS.city.map(([rootQid]) => rootQid), fullGraph);
    if (cityPath) allowedKinds.city = cityPath;
  }
  if (poiObservedTypes.has(typeQid)) {
    const poiPath = shortestPathToRoot(typeQid, ROOTS.poi.map(([rootQid]) => rootQid), fullGraph);
    if (poiPath) allowedKinds.poi = poiPath;
  }
  if (!Object.keys(allowedKinds).length) return [];
  return [[typeQid, {
    qid: typeQid,
    label: fullGraph.get(typeQid)?.label || "",
    allowedKinds,
    sourceUrl: `https://www.wikidata.org/wiki/${typeQid}`,
    reviewedAt: retrievedAt,
  }]];
}));
const graph = pruneToReviewedPaths(typeClassifications, fullGraph);

const compositeAllowances = COMPOSITE_ALLOWANCES.map((entry) => {
  const entity = poiByEntityId.get(entry.entityId);
  if (!entity || entity.wikidataId !== entry.qid) throw new Error(`composite-allowance-entity-mismatch:${entry.entityId}`);
  const parentCity = cityByEntityId.get(entity.parentCityEntityId);
  const expectedCountry = countryByEntityId.get(parentCity?.parentCountryEntityId);
  if (!parentCity || !expectedCountry) throw new Error(`composite-allowance-parent-missing:${entry.entityId}`);
  const instanceOfIds = [...new Set(facts.get(entry.qid)?.instanceOfIds || [])].sort();
  if (!instanceOfIds.length) throw new Error(`composite-allowance-instance-type-missing:${entry.entityId}`);
  return {
    allowanceId: `knowledge-semantic-composite-${stableHash({
      qid: entry.qid,
      entityId: entry.entityId,
      parentEntityId: parentCity.entityId,
      expectedCountryQid: expectedCountry.wikidataId,
    }).slice(0, 16)}`,
    ...entry,
    parentEntityId: parentCity.entityId,
    expectedCountryQid: expectedCountry.wikidataId,
    instanceOfIds,
    reviewStatus: "approved",
    reviewVersion: 1,
    reviewedAt: retrievedAt,
  };
});

const policy = {
  schemaVersion: "route-v2-knowledge-semantic-type-policy-v1",
  retrievedAt,
  maximumSubclassDepth: MAXIMUM_SUBCLASS_DEPTH,
  source: {
    provider: "Wikidata",
    apiUrl: WIKIDATA_API,
    property: "P279",
  },
  roots: Object.fromEntries(Object.entries(ROOTS).map(([kind, entries]) => [kind, entries.map(([qid, reason]) => ({
    qid,
    label: graph.get(qid)?.label || "",
    reason,
    sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
  }))])),
  typeClassifications,
  compositeAllowances,
  nodes: Object.fromEntries([...graph.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))),
};

const validation = validatePublishedKnowledgeSemantics({
  countries,
  cities,
  pois,
  factsByQid: facts,
  typePolicy: policy,
  exceptionDocument: readJson(EXCEPTIONS_PATH),
});
if (!validation.accepted) {
  throw new Error(`generated-type-policy-rejected:${JSON.stringify(validation.violations)}`);
}

fs.writeFileSync(POLICY_PATH, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  generated: path.relative(ROOT, POLICY_PATH).replaceAll("\\", "/"),
  observedTypeCount: observedTypeQids.length,
  classifiedTypeCount: Object.keys(typeClassifications).length,
  nodeCount: graph.size,
  maximumSubclassDepth: MAXIMUM_SUBCLASS_DEPTH,
  cityRootCount: policy.roots.city.length,
  poiRootCount: policy.roots.poi.length,
  compositeAllowanceCount: policy.compositeAllowances.length,
  checkedPublishedEntities: validation.checked,
  usedExceptionCount: validation.usedExceptionCount,
}, null, 2)}\n`);
