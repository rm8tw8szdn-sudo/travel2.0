const normalizeQid = (value) => String(value || "").trim().toUpperCase();

export const BROAD_STRUCTURAL_POI_ROOT_QIDS = Object.freeze([
  "Q41176", // building
  "Q811979", // architectural structure
  "Q13226383", // facility
  "Q121359", // infrastructure
  "Q811430", // fixed construction
]);

export const TRAVEL_POSITIVE_POI_TYPE_QIDS = Object.freeze([
  "Q570116", // tourist attraction
  "Q33506", // museum
  "Q4989906", // monument
  "Q1370598", // structure of worship
  "Q22698", // park
  "Q839954", // archaeological site
  "Q9259", // World Heritage Site
  "Q473972", // protected area
  "Q294440", // public space
  "Q37654", // market
  "Q166118", // archives
  "Q838948", // work of art
  "Q172754", // world's fair
  "Q35145263", // natural geographic object
  "Q20719696", // physico-geographical object
  "Q15324", // body of water
  "Q271669", // landform
  "Q1497375", // architectural ensemble
  "Q210272", // cultural heritage
  "Q338112", // recreation area
  "Q123705", // neighborhood
  // Exact, reviewed visitor-facing subclasses whose Wikidata ancestry also
  // reaches a generic building/facility root. These QIDs are deliberately
  // explicit: the structural root itself never grants admission.
  "Q16970", // church building
  "Q2977", // cathedral
  "Q56242215", // Catholic cathedral
  "Q174782", // square
  "Q24354", // theatre building
  "Q120560", // minor basilica
  "Q16560", // palace
  "Q23413", // castle
  "Q153562", // opera house
  "Q22806", // national library
  "Q537127", // road bridge
  "Q1785071", // fort
  "Q79007", // street
  "Q2031836", // Eastern Orthodox church building
  "Q1088552", // Catholic church building
  "Q56242225", // Eastern Orthodox cathedral
  "Q12280", // bridge
  "Q57831", // fortress
  "Q317557", // parish church
  "Q39715", // lighthouse
  "Q751876", // château
  "Q7075", // library
  "Q40080", // beach
  "Q82117", // city gate
  "Q1060829", // concert hall
  "Q28564", // public library
  "Q845945", // Shinto shrine
  "Q158438", // arch bridge
  "Q1254933", // astronomical observatory
  "Q167346", // botanical garden
  "Q24699794", // museum building
  "Q3397526", // stone bridge
  "Q53536964", // royal palace
  "Q1068842", // footbridge
  "Q41253", // movie theater
  "Q158555", // cable-stayed bridge
  "Q194195", // amusement park
  "Q108325", // chapel
  "Q3469910", // performing arts center
  "Q2114972", // presidential palace
  "Q55876909", // Catholic parish church
  "Q1107656", // garden
  "Q12042110", // steel bridge
  "Q12570", // suspension bridge
  "Q14276458", // deck arch bridge
  "Q856584", // library building
  "Q11420231", // Japanese strolling garden
  "Q17715832", // castle ruin
  "Q2327632", // city museum
  "Q25297630", // international bridge
  "Q483453", // fountain
  "Q56242063", // Protestant church building
  "Q92026", // Japanese castle
  "Q11183017", // sylvan theater
  "Q1210334", // railway bridge
  "Q12797", // star fort
  "Q135419779", // Shikinai Supershrine
  "Q35112127", // historic building
  "Q54114", // boulevard
  "Q56395672", // Jesuit church
  "Q7543083", // avenue
  "Q1010155", // ghat
  "Q11433351", // daimyo garden
  "Q1509716", // collegiate church
  "Q15848826", // city palace
  "Q1622062", // university library
  "Q18615527", // tram bridge
  "Q2416723", // theme park
  "Q330284", // marketplace
  "Q3397551", // built-on bridge
  "Q34545040", // Serbian Orthodox church
  "Q5061188", // house of culture
  "Q57821", // fortification
  "Q81917", // fortified tower
  "Q856234", // academic library
  "Q93338609", // boardwalk
  "Q1055465", // girder bridge
  "Q109607", // ruins
  "Q11390939", // Hachiman shrine
  "Q131542697", // Cathedral Square
  "Q1329623", // cultural center
  "Q133747929", // expiatory temple
  "Q134987079", // shrine dedicated to Empress Jingu
  "Q1429218", // cantilever bridge
  "Q158218", // truss bridge
  "Q1825472", // covered bridge
  "Q2577114", // co-cathedral
  "Q334383", // abbey church
  "Q56242275", // Lutheran church
  "Q6636777", // road-rail bridge
  "Q72926449", // church tower
  "Q906881", // Durbar Square
  "Q92275707", // crusader castle
  "Q996354", // bridge castle
  "Q1006835", // main street
  "Q103842783", // Reformed Christianity church
  "Q1043939", // Carnegie library
  "Q10513727", // chain bridge
  "Q10948212", // Confucian royal ancestral shrine
  "Q110848334", // double-decker bridge
  "Q1129743", // filial church
  "Q11422631", // United Nations Depository Library
  "Q11451876", // Munakata shrine
  "Q11588442", // Gion shrine
  "Q12057999", // fortification system
  "Q1223230", // Roman bridge
  "Q1243306", // multi-level bridge
  "Q1250323", // arched bridge
  "Q125316256", // Itsukushima shrine
  "Q125316983", // Kasuga shrine
  "Q125324170", // Yasaka shrine
  "Q132775089", // Renaissance bridge
  "Q132775244", // Ottoman bridge
  "Q135100459", // Shikinai Subshrine
  "Q1454583", // Masonic temple
  "Q1457501", // cemetery chapel
  "Q1481677", // pleasure garden
  "Q148319", // planetarium
  "Q158626", // beam bridge
  "Q163687", // basilica
  "Q1649060", // pro-cathedral
  "Q1708908", // Cyclist church
  "Q19757", // Roman theatre
  "Q20097897", // sea fort
  "Q2026833", // garden square
  "Q2312233", // spur castle
  "Q2496382", // university church
  "Q2593288", // cultural centre in the Netherlands
  "Q28662786", // monumental staircase
  "Q28793904", // porticoed square
  "Q3200355", // Kumano shrine
  "Q32512", // Sumiyoshi shrine
  "Q3364296", // exhibition park
  "Q3397659", // concrete arch bridge
  "Q4843069", // Bahá'í gardens
  "Q5116872", // Church of England parish church
  "Q514480", // Inari shrine
  "Q5592057", // through arch bridge
  "Q56190453", // memorial complex
  "Q615810", // water castle
  "Q62685721", // pedestrian street
  "Q693842", // votive church
  "Q75666726", // royal garden
  "Q847935", // beach subclass
  "Q911663", // bascule bridge
  "Q92062", // motte-and-bailey castle
  "Q929990", // stressed ribbon bridge
  "Q96371632", // secularized church
  "Q1007870", // art gallery
  "Q1475403", // kunsthalle
  "Q7362268", // Roman amphitheatre
  "Q867143", // Roman temple
  "Q58621988", // temple complex
  "Q98792435", // cultural center
  "Q112132534", // military museum building
]);

export const OPERATIONAL_POI_TYPE_QIDS = Object.freeze([
  "Q1248784", // airport
  "Q62447", // aerodrome
  "Q695850", // airbase
  "Q55488", // railway station
  "Q928830", // metro station
  "Q728937", // railway line
  "Q5503", // rapid transit
  "Q18325841", // public transport network
  "Q2678338", // railway network
  "Q2516436", // transportation system
  "Q15984860", // transport system
  "Q44782", // port
  "Q3918", // university institution
  "Q16917", // hospital
  "Q40357", // prison
  "Q861951", // police station
  "Q917182", // military academy
  "Q132911", // elevator
]);

// These are semantic *classes*, not entity-specific exceptions. A financial
// exchange may live in a notable building, but a financial-market ancestry is
// not visitor-facing travel evidence by itself. It requires an independent
// positive path that does not merely terminate at the generic market root.
export const RESTRICTED_FINANCIAL_MARKET_POI_TYPE_QIDS = Object.freeze([
  "Q11691", // stock exchange
  "Q179076", // trading venue / financial market ancestry used by exchanges
  "Q7309637", // regulated market
]);

export const INCOMPATIBLE_POI_ENTITY_TYPE_QIDS = Object.freeze([
  "Q6256", // country
  "Q486972", // human settlement
  "Q15284", // municipality
]);

const broadStructuralRoots = new Set(BROAD_STRUCTURAL_POI_ROOT_QIDS);
const travelPositiveTypes = new Set(TRAVEL_POSITIVE_POI_TYPE_QIDS);
const operationalTypes = new Set(OPERATIONAL_POI_TYPE_QIDS);
const restrictedFinancialMarketTypes = new Set(RESTRICTED_FINANCIAL_MARKET_POI_TYPE_QIDS);
const incompatiblePoiEntityTypes = new Set(INCOMPATIBLE_POI_ENTITY_TYPE_QIDS);
const physicalMarketRootQid = "Q37654";

function normalizePath(path) {
  return Array.isArray(path) ? path.map(normalizeQid).filter(Boolean) : [];
}

function pathKey(path) {
  return path.join(">");
}

export function normalizePoiTypePaths(paths = [], { maximumDepth = 8 } = {}) {
  const validByKey = new Map();
  const invalid = [];
  for (const input of Array.isArray(paths) ? paths : []) {
    const path = normalizePath(input);
    const cycleDetected = new Set(path).size !== path.length;
    const maximumDepthExceeded = path.length > maximumDepth + 1;
    if (!path.length || cycleDetected || maximumDepthExceeded) {
      invalid.push(Object.freeze({ path, cycleDetected, maximumDepthExceeded }));
      continue;
    }
    validByKey.set(pathKey(path), path);
  }
  return Object.freeze({
    valid: [...validByKey.values()].sort((left, right) => pathKey(left).localeCompare(pathKey(right), "en")),
    invalid: invalid.sort((left, right) => pathKey(left.path).localeCompare(pathKey(right.path), "en")),
  });
}

export function isTravelPositivePoiPath(path) {
  const normalized = normalizePath(path);
  return normalized.some((entryQid) => travelPositiveTypes.has(entryQid))
    && !normalized.some((entryQid) => operationalTypes.has(entryQid));
}

export function isRestrictedFinancialMarketPoiPath(path) {
  return normalizePath(path).some((entryQid) => restrictedFinancialMarketTypes.has(entryQid));
}

export function isBroadStructuralPoiPath(path) {
  const normalized = normalizePath(path);
  return normalized.some((entryQid) => broadStructuralRoots.has(entryQid))
    && !isTravelPositivePoiPath(normalized)
    && !isOperationalPoiPath(normalized);
}

export function isOperationalPoiPath(path) {
  return normalizePath(path).some((entryQid) => operationalTypes.has(entryQid));
}

function policyClassification(typePolicy, typeQid) {
  const classifications = typePolicy?.typeClassifications;
  return classifications instanceof Map
    ? classifications.get(typeQid)
    : classifications?.[typeQid];
}

function policyNode(typePolicy, typeQid) {
  const nodes = typePolicy?.nodes;
  return nodes instanceof Map ? nodes.get(typeQid) : nodes?.[typeQid];
}

function policyPoiRoots(typePolicy) {
  const roots = typePolicy?.roots?.poi;
  if (roots instanceof Set) return roots;
  return new Set((Array.isArray(roots) ? roots : []).map((entry) => normalizeQid(entry?.qid || entry)).filter(Boolean));
}

function ancestryPathsToPoiRoots(typeQid, typePolicy, maximumDepth) {
  const roots = policyPoiRoots(typePolicy);
  const queue = [[typeQid]];
  const paths = [];
  while (queue.length > 0) {
    const path = queue.shift();
    const currentQid = path.at(-1);
    if (roots.has(currentQid)) {
      paths.push(path);
      continue;
    }
    const parents = (policyNode(typePolicy, currentQid)?.parentQids || []).map(normalizeQid).filter(Boolean);
    if (path.length - 1 >= maximumDepth || parents.length === 0) {
      paths.push(path);
      continue;
    }
    for (const parentQid of parents) {
      if (path.includes(parentQid)) paths.push([...path, parentQid]);
      else queue.push([...path, parentQid]);
    }
  }
  return paths;
}

function pathsForPolicyType(typeQid, typePolicy, maximumDepth) {
  const classification = policyClassification(typePolicy, typeQid);
  const reviewedPoiPath = classification?.allowedKinds?.poi;
  if (Array.isArray(reviewedPoiPath) && reviewedPoiPath.length > 0) return [reviewedPoiPath];
  const reviewedCityPath = classification?.allowedKinds?.city;
  if (Array.isArray(reviewedCityPath) && reviewedCityPath.length > 0) return [reviewedCityPath];
  return ancestryPathsToPoiRoots(typeQid, typePolicy, maximumDepth);
}

export function poiTypePathsFromPolicy(instanceOfIds = [], typePolicy = {}) {
  const maximumDepth = Number.isInteger(typePolicy?.maximumSubclassDepth) ? typePolicy.maximumSubclassDepth : 8;
  return [...new Set((Array.isArray(instanceOfIds) ? instanceOfIds : []).map(normalizeQid).filter(Boolean))]
    .flatMap((typeQid) => pathsForPolicyType(typeQid, typePolicy, maximumDepth));
}

export function evaluatePoiTypePaths(paths = [], { maximumDepth = 8 } = {}) {
  const normalized = normalizePoiTypePaths(paths, { maximumDepth });
  const normalizedPaths = normalized.valid;
  const pathClassifications = normalizedPaths.map((path) => (
    isOperationalPoiPath(path)
      ? "operational-unsuitable"
      : isRestrictedFinancialMarketPoiPath(path)
        ? "financial-market-restricted"
        : isTravelPositivePoiPath(path)
          ? normalizePath(path).includes(physicalMarketRootQid)
            ? "travel-positive-market"
            : "travel-positive"
        : isBroadStructuralPoiPath(path)
          ? "broad-structural-only"
          : "unsafe-unresolved"
  ));
  const invalidPathDetected = normalized.invalid.length > 0;
  const independentVisitorTypeDetected = pathClassifications.includes("travel-positive");
  const marketVisitorTypeDetected = pathClassifications.includes("travel-positive-market");
  const positiveVisitorTypeDetected = independentVisitorTypeDetected || marketVisitorTypeDetected;
  const operationalTypeDetected = pathClassifications.includes("operational-unsuitable");
  const financialMarketTypeDetected = pathClassifications.includes("financial-market-restricted");
  const broadStructuralTypeDetected = pathClassifications.includes("broad-structural-only");
  const unresolvedTypeDetected = invalidPathDetected || pathClassifications.includes("unsafe-unresolved");
  const accepted = !invalidPathDetected
    && !operationalTypeDetected
    && !unresolvedTypeDetected
    && positiveVisitorTypeDetected
    && (!financialMarketTypeDetected || independentVisitorTypeDetected);
  const classification = operationalTypeDetected
    ? "operational-unsuitable"
    : financialMarketTypeDetected && !accepted
      ? "financial-market-restricted"
    : accepted
      ? "travel-positive"
      : broadStructuralTypeDetected && !unresolvedTypeDetected
        ? "broad-structural-only"
        : "unsafe-unresolved";
  return Object.freeze({
    accepted,
    classification,
    broadStructuralOnly: classification === "broad-structural-only",
    broadStructuralTypeDetected,
    operationalTypeDetected,
    financialMarketTypeDetected,
    independentVisitorTypeDetected,
    marketVisitorTypeDetected,
    positiveVisitorTypeDetected,
    unresolvedTypeDetected,
    invalidPathDetected,
    pathClassifications,
    paths: normalizedPaths,
    invalidPaths: normalized.invalid,
  });
}

export function evaluatePoiTypeIdsFromPolicy(instanceOfIds = [], typePolicy = {}) {
  const maximumDepth = Number.isInteger(typePolicy?.maximumSubclassDepth)
    ? typePolicy.maximumSubclassDepth
    : 8;
  const normalizedTypeQids = [...new Set((Array.isArray(instanceOfIds) ? instanceOfIds : [])
    .map(normalizeQid)
    .filter(Boolean))];
  const typeSignals = normalizedTypeQids.map((typeQid) => {
    const paths = pathsForPolicyType(typeQid, typePolicy, maximumDepth);
    const pathDecision = evaluatePoiTypePaths(paths, { maximumDepth });
    const classification = policyClassification(typePolicy, typeQid);
    const incompatibleEntityKind = incompatiblePoiEntityTypes.has(typeQid)
      || Boolean(classification?.allowedKinds?.city && !classification?.allowedKinds?.poi);
    return Object.freeze({
      typeQid,
      classification: incompatibleEntityKind
        ? "incompatible-entity-kind"
        : pathDecision.classification,
      incompatibleEntityKind,
      paths: pathDecision.paths,
      invalidPaths: pathDecision.invalidPaths,
      pathClassifications: pathDecision.pathClassifications,
    });
  });
  // Invalid signals must survive aggregation just like valid paths: a positive
  // sibling type cannot erase a cycle or an unverified over-depth chain.
  const pathDecision = evaluatePoiTypePaths(typeSignals.flatMap((signal) => [
    ...signal.paths,
    ...signal.invalidPaths.map((entry) => entry.path),
  ]), { maximumDepth });
  const incompatibleEntityKindDetected = typeSignals.some((signal) => signal.incompatibleEntityKind);
  const accepted = pathDecision.accepted && !incompatibleEntityKindDetected;
  return Object.freeze({
    ...pathDecision,
    accepted,
    classification: incompatibleEntityKindDetected
      ? "incompatible-entity-kind"
      : pathDecision.classification,
    incompatibleEntityKindDetected,
    evaluatedTypeQids: normalizedTypeQids,
    typeSignals,
  });
}

export const POI_ADMISSION_CONSUMER_IDS = Object.freeze([
  "importer",
  "semantic-gate",
  "publication-audit",
  "positive-admission-verifier",
  "core-poi-image-classification",
  "batch05-adversarial-verifier",
]);

const poiAdmissionConsumerIds = new Set(POI_ADMISSION_CONSUMER_IDS);

export function evaluatePoiTypeIdsForConsumer(consumerId, instanceOfIds = [], typePolicy = {}) {
  const normalizedConsumerId = String(consumerId || "").trim();
  if (!poiAdmissionConsumerIds.has(normalizedConsumerId)) {
    throw new TypeError(`Unknown POI admission consumer: ${normalizedConsumerId || "<empty>"}`);
  }
  return evaluatePoiTypeIdsFromPolicy(instanceOfIds, typePolicy);
}
