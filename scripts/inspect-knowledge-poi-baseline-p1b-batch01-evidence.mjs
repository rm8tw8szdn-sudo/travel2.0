import crypto from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch01-candidates.wikidata.json";
const RAW_PATH = path.resolve(REPOSITORY_ROOT, RAW_RELATIVE_PATH);
const SUPPLEMENT_RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch01-candidates-supplement01.wikidata.json";
const SUPPLEMENT_RAW_PATH = path.resolve(REPOSITORY_ROOT, SUPPLEMENT_RAW_RELATIVE_PATH);
const SUPPLEMENT02_RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch01-candidates-supplement02.wikidata.json";
const SUPPLEMENT02_RAW_PATH = path.resolve(REPOSITORY_ROOT, SUPPLEMENT02_RAW_RELATIVE_PATH);
const SUPPLEMENT03_RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch01-candidates-supplement03.wikidata.json";
const SUPPLEMENT03_RAW_PATH = path.resolve(REPOSITORY_ROOT, SUPPLEMENT03_RAW_RELATIVE_PATH);
const SELECTION_RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch01-selection.json";
const SELECTION_RAW_PATH = path.resolve(REPOSITORY_ROOT, SELECTION_RAW_RELATIVE_PATH);
const EXPECTED_BASE_RAW_SHA256 = "fe39f0f9ad4bebe31f0cbe64390744b1c3343f484968838d204d8ae431e80c1d";
const EXPECTED_SUPPLEMENT01_RAW_SHA256 = "6de7b51427a4370d2042701dc4c78d3496046c89e556caa9c32ba3abbbceb2fd";
const EXPECTED_SUPPLEMENT02_RAW_SHA256 = "57cb63ea4678380ef70ab522057207a9582bce28a80de8327d79419683c3480e";
const EXPECTED_SUPPLEMENT03_RAW_SHA256 = "ad3915efdcc09bcd09f245ee9200b02eca6d65d532b7f85a493b1b6d7049e9af";
const EXPECTED_SELECTION_RAW_HASHES = Object.freeze({
  base: EXPECTED_BASE_RAW_SHA256,
  supplement01: EXPECTED_SUPPLEMENT01_RAW_SHA256,
  supplement02: EXPECTED_SUPPLEMENT02_RAW_SHA256,
  supplement03: EXPECTED_SUPPLEMENT03_RAW_SHA256,
});
const SELECTION_POLICY_VERSION = "p1b-batch01-poi-selection-v1";
const SELECTION_RULE = "three-primary-backup-optional";
const ENTITY_API_ENDPOINT = "https://www.wikidata.org/w/api.php";
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "travel-collection-route-v2-p1b-batch01-poi-evidence-gate/1.0";
const LANGUAGES = Object.freeze(["en", "es", "cs", "fi", "sv", "nl", "pl", "zh-hans", "zh"]);
const SEARCH_LIMIT = 10;
const ENTITY_BATCH_SIZE = 40;
const SPARQL_BATCH_SIZE = 60;
const PARENT_BATCH_SIZE = 35;
const MIN_SEARCH_DELAY_MS = 750;
const DEFAULT_SEARCH_DELAY_MS = 1_000;
const MIN_BATCH_DELAY_MS = 1_500;
const DEFAULT_BATCH_DELAY_MS = 1_500;
const MAX_RETRY_WAIT_MS = 60_000;
const DEFAULT_REQUEST_RETRIES = 3;
const SUPPLEMENT_OPERATIONS = Object.freeze([
  "identity-requery",
  "manual-identity-review",
  "parent-only-requery",
  "replacement-candidate",
  "additional-buffer",
]);
const INSTITUTION_RELATION_RULES = Object.freeze({
  P131: Object.freeze({
    ruleId: "institution-administrative-location",
    direction: "institution-to-related-entity",
    purpose: "Direct administrative location context for the institution.",
    parentAcceptanceEligible: true,
  }),
  P159: Object.freeze({
    ruleId: "institution-headquarters-location",
    direction: "institution-to-related-entity",
    purpose: "Direct headquarters location or headquarters entity.",
    parentAcceptanceEligible: true,
  }),
  P276: Object.freeze({
    ruleId: "institution-location-or-venue",
    direction: "institution-to-related-entity",
    purpose: "Direct location, venue, or building occupied by the institution.",
    parentAcceptanceEligible: true,
  }),
  P361: Object.freeze({
    ruleId: "component-part-of-institution",
    direction: "related-entity-to-institution",
    purpose: "Building, venue, or component structurally marked as part of the institution.",
    parentAcceptanceEligible: true,
  }),
  P466: Object.freeze({
    ruleId: "building-occupied-by-institution",
    direction: "related-entity-to-institution",
    purpose: "Building or venue whose occupant is the institution.",
    parentAcceptanceEligible: true,
  }),
  P527: Object.freeze({
    ruleId: "institution-has-component",
    direction: "institution-to-related-entity",
    purpose: "Building, venue, wing, or component explicitly included by the institution.",
    parentAcceptanceEligible: true,
  }),
  P749: Object.freeze({
    ruleId: "institution-parent-organization-context",
    direction: "institution-to-related-entity",
    purpose: "Parent organization context; informational only and never sufficient as venue parent evidence.",
    parentAcceptanceEligible: false,
  }),
});
const INSTITUTION_BUILDING_CANDIDATE_NAMES = Object.freeze([
  "Rijksmuseum",
  "Van Gogh Museum",
  "Kunsthal Rotterdam",
]);
const BLOCKING_TYPE_QIDS = Object.freeze([
  "Q515", // city
  "Q486972", // human settlement
  "Q56061", // administrative territorial entity
  "Q1907114", // metropolitan area
  "Q82794", // geographic region
  "Q149621", // district
  "Q8502", // mountain
  "Q23442", // island
  "Q23397", // lake
]);

const SELECTION_BLOCKING_TYPE_QIDS = Object.freeze([
  Object.freeze({ qid: "Q6256", labelEn: "country", policyCategory: "country" }),
  Object.freeze({ qid: "Q515", labelEn: "city", policyCategory: "city" }),
  Object.freeze({ qid: "Q486972", labelEn: "human settlement", policyCategory: "settlement" }),
  Object.freeze({ qid: "Q149621", labelEn: "district", policyCategory: "district" }),
  Object.freeze({ qid: "Q82794", labelEn: "geographic region", policyCategory: "region" }),
  Object.freeze({ qid: "Q1907114", labelEn: "metropolitan area", policyCategory: "metropolitan-area" }),
  Object.freeze({ qid: "Q56061", labelEn: "administrative territorial entity", policyCategory: "region-or-district" }),
  Object.freeze({ qid: "Q473972", labelEn: "protected area", policyCategory: "natural-area" }),
  Object.freeze({ qid: "Q179049", labelEn: "nature reserve", policyCategory: "natural-area" }),
  Object.freeze({ qid: "Q8502", labelEn: "mountain", policyCategory: "mountain" }),
  Object.freeze({ qid: "Q23442", labelEn: "island", policyCategory: "island" }),
  Object.freeze({ qid: "Q23397", labelEn: "lake", policyCategory: "lake" }),
  Object.freeze({ qid: "Q1620908", labelEn: "historical region", policyCategory: "broad-historical-area" }),
]);
const SELECTION_BLOCKING_TYPE_QID_SET = new Set(SELECTION_BLOCKING_TYPE_QIDS.map((value) => value.qid));

const INFORMATIONAL_P31_EXACT_KEYS = Object.freeze([
  "Q11166728|Q1440300",
  "Q1440300",
  "Q153562|Q24354",
  "Q16970",
  "Q16970|Q2977",
  "Q16970|Q2977|Q56242215",
  "Q16970|Q2977|Q56242235",
  "Q17431399|Q207694|Q2772772",
  "Q17431399|Q33506",
  "Q17455058|Q58632302",
  "Q1863818",
  "Q207694|Q33506",
  "Q23413|Q57831",
  "Q24354",
  "Q33506",
  "Q56242215",
].sort((left, right) => left.localeCompare(right, "en")));

const FROZEN_PRIMARY_CANDIDATE_KEYS = Object.freeze([
  Object.freeze({ city: "Bogotá", cityQid: "Q2841", candidateKeys: Object.freeze([
    "Q2841::national-museum-of-colombia",
    "Q2841::botero-museum",
    "Q2841::bogota-primatial-cathedral",
  ]) }),
  Object.freeze({ city: "Medellín", cityQid: "Q48278", candidateKeys: Object.freeze([
    "Q48278::museum-of-antioquia",
    "Q48278::medellin-museum-of-modern-art",
    "Q48278::metropolitan-cathedral-of-medellin",
  ]) }),
  Object.freeze({ city: "Prague", cityQid: "Q1085", candidateKeys: Object.freeze([
    "Q1085::church-of-our-lady-before-tyn",
    "Q1085::old-town-hall-with-astronomical-clock",
    "Q1085::zizkov-television-tower",
  ]) }),
  Object.freeze({ city: "Brno", cityQid: "Q14960", candidateKeys: Object.freeze([
    "Q14960::spilberk-castle",
    "Q14960::cathedral-of-st-peter-and-paul",
    "Q14960::mahen-theatre",
  ]) }),
  Object.freeze({ city: "Helsinki", cityQid: "Q1757", candidateKeys: Object.freeze([
    "Q1757::finnish-national-theatre",
    "Q1757::helsinki-central-library-oodi",
    "Q1757::national-museum-of-finland",
  ]) }),
  Object.freeze({ city: "Turku", cityQid: "Q38511", candidateKeys: Object.freeze([
    "Q38511::sibelius-museum",
    "Q38511::turku-castle",
    "Q38511::turku-cathedral",
  ]) }),
  Object.freeze({ city: "Amsterdam", cityQid: "Q727", candidateKeys: Object.freeze([
    "Q727::anne-frank-house",
    "Q727::rijksmuseum",
    "Q727::van-gogh-museum",
  ]) }),
  Object.freeze({ city: "Rotterdam", cityQid: "Q34370", candidateKeys: Object.freeze([
    "Q34370::maritime-museum-rotterdam",
    "Q34370::euromast",
    "Q34370::erasmus-bridge",
  ]) }),
  Object.freeze({ city: "Warsaw", cityQid: "Q270", candidateKeys: Object.freeze([
    "Q270::warsaw-uprising-museum",
    "Q270::palace-of-culture-and-science",
    "Q270::royal-castle-in-warsaw",
  ]) }),
  Object.freeze({ city: "Kraków", cityQid: "Q31487", candidateKeys: Object.freeze([
    "Q31487::national-museum-in-krakow",
    "Q31487::wawel-royal-castle",
    "Q31487::st-mary-s-basilica",
  ]) }),
]);

const FROZEN_BACKUP_CANDIDATE_KEYS = Object.freeze({
  Q2841: "Q2841::planetarium-of-bogota",
  Q48278: "Q48278::rafael-uribe-uribe-palace-of-culture",
  Q1085: null,
  Q14960: null,
  Q1757: "Q1757::house-of-the-estates",
  Q38511: "Q38511::turku-art-museum",
  Q727: "Q727::royal-palace-of-amsterdam",
  Q34370: "Q34370::depot-boijmans-van-beuningen",
  Q270: "Q270::polin-museum-of-the-history-of-polish-jews",
  Q31487: "Q31487::krakow-barbican",
});

const CANDIDATES = Object.freeze([
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Gold Museum", searchTerms: ["Gold Museum Bogotá"], slot: "primary", identityHint: "museum" },
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Botero Museum", searchTerms: ["Botero Museum Bogotá"], slot: "primary", identityHint: "museum" },
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "National Museum of Colombia", searchTerms: ["National Museum of Colombia"], slot: "primary", identityHint: "museum" },
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Quinta de Bolívar", searchTerms: ["Quinta de Bolívar"], slot: "backup", identityHint: "historic-building-or-museum" },
  { countryCode: "CO", countryQid: "Q739", city: "Medellín", cityQid: "Q48278", name: "Museum of Antioquia", searchTerms: ["Museum of Antioquia"], slot: "primary", identityHint: "museum" },
  { countryCode: "CO", countryQid: "Q739", city: "Medellín", cityQid: "Q48278", name: "Medellín Museum of Modern Art", searchTerms: ["Medellín Museum of Modern Art"], slot: "primary", identityHint: "museum" },
  { countryCode: "CO", countryQid: "Q739", city: "Medellín", cityQid: "Q48278", name: "Metropolitan Cathedral of Medellín", searchTerms: ["Metropolitan Cathedral of Medellín"], slot: "primary", identityHint: "religious-building" },
  { countryCode: "CO", countryQid: "Q739", city: "Medellín", cityQid: "Q48278", name: "Rafael Uribe Uribe Palace of Culture", searchTerms: ["Rafael Uribe Uribe Palace of Culture"], slot: "backup", identityHint: "historic-building" },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Charles Bridge", searchTerms: ["Charles Bridge Prague"], slot: "primary", identityHint: "bridge" },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Municipal House", searchTerms: ["Municipal House Prague"], slot: "primary", identityHint: "historic-building" },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "St. Vitus Cathedral", searchTerms: ["St. Vitus Cathedral Prague"], slot: "primary", identityHint: "religious-building" },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Prague Castle", searchTerms: ["Prague Castle"], slot: "backup", identityHint: "castle-complex" },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Villa Tugendhat", searchTerms: ["Villa Tugendhat"], slot: "primary", identityHint: "historic-building" },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Cathedral of St. Peter and Paul", searchTerms: ["Cathedral of St. Peter and Paul Brno"], slot: "primary", identityHint: "religious-building" },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Špilberk Castle", searchTerms: ["Špilberk Castle"], slot: "primary", identityHint: "castle-or-museum" },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Brno Ossuary", searchTerms: ["Brno Ossuary"], slot: "backup", identityHint: "historical-site" },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "Helsinki Cathedral", searchTerms: ["Helsinki Cathedral"], slot: "primary", identityHint: "religious-building" },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "Temppeliaukio Church", searchTerms: ["Temppeliaukio Church"], slot: "primary", identityHint: "religious-building" },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "National Museum of Finland", searchTerms: ["National Museum of Finland"], slot: "primary", identityHint: "museum" },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "Ateneum Art Museum", searchTerms: ["Ateneum Art Museum"], slot: "backup", identityHint: "museum" },
  { countryCode: "FI", countryQid: "Q33", city: "Turku", cityQid: "Q38511", name: "Turku Castle", searchTerms: ["Turku Castle"], slot: "primary", identityHint: "castle-or-museum" },
  { countryCode: "FI", countryQid: "Q33", city: "Turku", cityQid: "Q38511", name: "Turku Cathedral", searchTerms: ["Turku Cathedral"], slot: "primary", identityHint: "religious-building" },
  { countryCode: "FI", countryQid: "Q33", city: "Turku", cityQid: "Q38511", name: "Sibelius Museum", searchTerms: ["Sibelius Museum"], slot: "primary", identityHint: "museum" },
  { countryCode: "FI", countryQid: "Q33", city: "Turku", cityQid: "Q38511", name: "Turku Art Museum", searchTerms: ["Turku Art Museum"], slot: "backup", identityHint: "museum" },
  { countryCode: "NL", countryQid: "Q55", city: "Amsterdam", cityQid: "Q727", name: "Rijksmuseum", searchTerms: ["Rijksmuseum Amsterdam"], slot: "primary", identityHint: "museum" },
  { countryCode: "NL", countryQid: "Q55", city: "Amsterdam", cityQid: "Q727", name: "Van Gogh Museum", searchTerms: ["Van Gogh Museum"], slot: "primary", identityHint: "museum" },
  { countryCode: "NL", countryQid: "Q55", city: "Amsterdam", cityQid: "Q727", name: "Anne Frank House", searchTerms: ["Anne Frank House"], slot: "primary", identityHint: "historic-building-or-museum" },
  { countryCode: "NL", countryQid: "Q55", city: "Amsterdam", cityQid: "Q727", name: "Royal Palace of Amsterdam", searchTerms: ["Royal Palace of Amsterdam"], slot: "backup", identityHint: "palace" },
  { countryCode: "NL", countryQid: "Q55", city: "Rotterdam", cityQid: "Q34370", name: "Maritime Museum Rotterdam", searchTerms: ["Maritime Museum Rotterdam"], slot: "primary", identityHint: "museum" },
  { countryCode: "NL", countryQid: "Q55", city: "Rotterdam", cityQid: "Q34370", name: "Kunsthal Rotterdam", searchTerms: ["Kunsthal Rotterdam"], slot: "primary", identityHint: "institution-or-building" },
  { countryCode: "NL", countryQid: "Q55", city: "Rotterdam", cityQid: "Q34370", name: "Euromast", searchTerms: ["Euromast"], slot: "primary", identityHint: "tower" },
  { countryCode: "NL", countryQid: "Q55", city: "Rotterdam", cityQid: "Q34370", name: "Erasmus Bridge", searchTerms: ["Erasmus Bridge"], slot: "backup", identityHint: "bridge" },
  { countryCode: "PL", countryQid: "Q36", city: "Warsaw", cityQid: "Q270", name: "Royal Castle in Warsaw", searchTerms: ["Royal Castle in Warsaw"], slot: "primary", identityHint: "castle-palace-or-museum" },
  { countryCode: "PL", countryQid: "Q36", city: "Warsaw", cityQid: "Q270", name: "Warsaw Uprising Museum", searchTerms: ["Warsaw Uprising Museum"], slot: "primary", identityHint: "museum" },
  { countryCode: "PL", countryQid: "Q36", city: "Warsaw", cityQid: "Q270", name: "Palace of Culture and Science", searchTerms: ["Palace of Culture and Science Warsaw"], slot: "primary", identityHint: "monumental-building" },
  { countryCode: "PL", countryQid: "Q36", city: "Warsaw", cityQid: "Q270", name: "POLIN Museum of the History of Polish Jews", searchTerms: ["POLIN Museum of the History of Polish Jews"], slot: "backup", identityHint: "museum" },
  { countryCode: "PL", countryQid: "Q36", city: "Kraków", cityQid: "Q31487", name: "Wawel Royal Castle", searchTerms: ["Wawel Royal Castle"], slot: "primary", identityHint: "castle-palace-or-complex" },
  { countryCode: "PL", countryQid: "Q36", city: "Kraków", cityQid: "Q31487", name: "St. Mary’s Basilica", searchTerms: ["St. Mary's Basilica Kraków"], slot: "primary", identityHint: "religious-building" },
  { countryCode: "PL", countryQid: "Q36", city: "Kraków", cityQid: "Q31487", name: "Schindler’s Factory Museum", searchTerms: ["Schindler's Factory Museum Kraków"], slot: "primary", identityHint: "museum-or-historic-building" },
  { countryCode: "PL", countryQid: "Q36", city: "Kraków", cityQid: "Q31487", name: "National Museum in Kraków", searchTerms: ["National Museum in Kraków"], slot: "backup", identityHint: "museum" },
].map((candidate, index) => Object.freeze({ ...candidate, inputIndex: index + 1 })));

const SUPPLEMENT_DEFINITIONS = Object.freeze([
  { baseCandidateName: "Gold Museum", operation: "identity-requery", searchRequests: [{ term: "Museo del Oro", language: "es" }, { term: "Museo del Oro Bogotá", language: "es" }], reasons: ["first-round-no-search-result", "official-spanish-name-requery"] },
  { baseCandidateName: "Botero Museum", operation: "identity-requery", searchRequests: [{ term: "Museo Botero", language: "es" }, { term: "Museo Botero Bogotá", language: "es" }], reasons: ["first-round-no-search-result", "official-spanish-name-requery"] },
  { baseCandidateName: "Municipal House", operation: "identity-requery", searchRequests: [{ term: "Obecní dům", language: "cs" }, { term: "Obecní dům Praha", language: "cs" }], reasons: ["first-round-no-search-result", "official-czech-name-requery"] },
  { baseCandidateName: "St. Vitus Cathedral", operation: "identity-requery", searchRequests: [{ term: "Katedrála svatého Víta", language: "cs" }, { term: "Katedrála svatého Víta Praha", language: "cs" }], reasons: ["first-round-no-search-result", "official-czech-name-requery"] },
  { baseCandidateName: "Charles Bridge", operation: "identity-requery", searchRequests: [{ term: "Karlův most", language: "cs" }, { term: "Charles Bridge Prague", language: "en" }], reasons: ["first-round-company-identity", "bridge-identity-requery"] },
  { baseCandidateName: "Cathedral of St. Peter and Paul", operation: "identity-requery", searchRequests: [{ term: "Katedrála svatého Petra a Pavla", language: "cs" }, { term: "Katedrála svatého Petra a Pavla Brno", language: "cs" }], reasons: ["first-round-no-search-result", "official-czech-name-requery"] },
  { baseCandidateName: "Ateneum Art Museum", operation: "identity-requery", searchRequests: [{ term: "Ateneum", language: "fi" }, { term: "Ateneumin taidemuseo", language: "fi" }], reasons: ["first-round-no-search-result", "official-finnish-name-requery"] },
  { baseCandidateName: "Palace of Culture and Science", operation: "identity-requery", searchRequests: [{ term: "Pałac Kultury i Nauki", language: "pl" }, { term: "Pałac Kultury i Nauki Warszawa", language: "pl" }], reasons: ["first-round-no-search-result", "official-polish-name-requery"] },
  { baseCandidateName: "St. Mary’s Basilica", operation: "identity-requery", searchRequests: [{ term: "Kościół Mariacki", language: "pl" }, { term: "Kościół Mariacki Kraków", language: "pl" }], reasons: ["first-round-no-search-result", "official-polish-name-requery"] },
  { baseCandidateName: "Schindler’s Factory Museum", operation: "identity-requery", searchRequests: [{ term: "Fabryka Emalia Oskara Schindlera", language: "pl" }, { term: "Oskar Schindler’s Enamel Factory", language: "en" }, { term: "Schindler Factory Museum Kraków", language: "en" }], reasons: ["first-round-no-search-result", "formal-polish-and-english-name-requery"] },

  { baseCandidateName: "Euromast", operation: "manual-identity-review", searchRequests: [{ term: "Euromast", language: "nl" }, { term: "Euromast Rotterdam", language: "en" }], knownQids: ["Q969215", "Q100717811"], preferredKnownQid: "Q969215", competingKnownQids: ["Q100717811"], manualDecision: "tower-versus-tram-stop", reasons: ["do-not-select-by-search-rank", "explicit-tower-versus-tram-stop-review"] },
  { baseCandidateName: "Helsinki Cathedral", operation: "manual-identity-review", searchRequests: [{ term: "Helsinki Cathedral", language: "en" }, { term: "Helsingin tuomiokirkko", language: "fi" }], knownQids: ["Q738015", "Q3247489"], preferredKnownQid: "Q738015", competingKnownQids: ["Q3247489"], manualDecision: "building-versus-disambiguation", reasons: ["review-building-separately-from-disambiguation", "retain-coordinate-failed-if-no-single-valid-coordinate"] },
  { baseCandidateName: "Prague Castle", operation: "manual-identity-review", searchRequests: [{ term: "Prague Castle", language: "en" }, { term: "Pražský hrad", language: "cs" }], knownQids: ["Q193369", "Q1087723", "Q11094328"], preferredKnownQid: "Q193369", competingKnownQids: ["Q1087723", "Q11094328"], manualDecision: "castle-complex-institution-review", reasons: ["broad-complex-cannot-auto-pass", "review-three-known-identities"] },

  { baseCandidateName: "Villa Tugendhat", operation: "parent-only-requery", reasons: ["lock-first-round-selected-qid", "structured-parent-evidence-only"] },
  { baseCandidateName: "Brno Ossuary", operation: "parent-only-requery", reasons: ["lock-first-round-selected-qid", "structured-parent-evidence-only"] },
  { baseCandidateName: "Rijksmuseum", operation: "parent-only-requery", reasons: ["lock-first-round-selected-qid", "institution-building-parent-review"] },
  { baseCandidateName: "Van Gogh Museum", operation: "parent-only-requery", reasons: ["lock-first-round-selected-qid", "institution-building-parent-review"] },
  { baseCandidateName: "Royal Palace of Amsterdam", operation: "parent-only-requery", reasons: ["lock-first-round-selected-qid", "municipality-city-parent-review"] },
  { baseCandidateName: "Kunsthal Rotterdam", operation: "parent-only-requery", expectedLockedQid: "Q1668856", reasons: ["lock-first-round-selected-qid", "institution-building-parent-review"] },
  { baseCandidateName: "Erasmus Bridge", operation: "parent-only-requery", reasons: ["lock-first-round-selected-qid", "municipality-city-parent-review"] },

  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Iglesia de San Francisco", operation: "replacement-candidate", identityHint: "religious-building", searchRequests: [{ term: "Iglesia de San Francisco Bogotá", language: "es" }, { term: "San Francisco Church Bogotá", language: "en" }], reasons: ["replacement-pool-for-quinta-de-bolivar"] },
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Torre Colpatria", operation: "replacement-candidate", identityHint: "tower", searchRequests: [{ term: "Torre Colpatria", language: "es" }, { term: "Torre Colpatria Bogotá", language: "es" }], reasons: ["replacement-pool-for-quinta-de-bolivar"] },
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Teatro Colón", operation: "replacement-candidate", identityHint: "theatre-building", searchRequests: [{ term: "Teatro Colón Bogotá", language: "es" }, { term: "Teatro de Cristóbal Colón Bogotá", language: "es" }], reasons: ["replacement-pool-for-quinta-de-bolivar"] },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "Uspenski Cathedral", operation: "replacement-candidate", identityHint: "religious-building", searchRequests: [{ term: "Uspenskin katedraali", language: "fi" }, { term: "Uspenski Cathedral Helsinki", language: "en" }], reasons: ["replacement-pool-for-temppeliaukio-church"] },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "Kiasma", operation: "replacement-candidate", identityHint: "museum-or-building", searchRequests: [{ term: "Kiasma", language: "fi" }, { term: "Kiasma Helsinki", language: "en" }], reasons: ["replacement-pool-for-temppeliaukio-church"] },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "Sibelius Monument", operation: "replacement-candidate", identityHint: "monument", searchRequests: [{ term: "Sibelius-monumentti", language: "fi" }, { term: "Sibelius Monument Helsinki", language: "en" }], reasons: ["replacement-pool-for-temppeliaukio-church"] },

  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Powder Tower", operation: "additional-buffer", identityHint: "tower", searchRequests: [{ term: "Prašná brána", language: "cs" }, { term: "Powder Tower Prague", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Dancing House", operation: "additional-buffer", identityHint: "building", searchRequests: [{ term: "Tančící dům", language: "cs" }, { term: "Dancing House Prague", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Church of Our Lady before Týn", operation: "additional-buffer", identityHint: "religious-building", searchRequests: [{ term: "Kostel Matky Boží před Týnem", language: "cs" }, { term: "Church of Our Lady before Týn Prague", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Old Town Bridge Tower", operation: "additional-buffer", identityHint: "tower", searchRequests: [{ term: "Staroměstská mostecká věž", language: "cs" }, { term: "Old Town Bridge Tower Prague", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Church of St. James", operation: "additional-buffer", identityHint: "religious-building", searchRequests: [{ term: "Kostel svatého Jakuba Brno", language: "cs" }, { term: "Church of St. James Brno", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Old Town Hall", operation: "additional-buffer", identityHint: "historic-building", searchRequests: [{ term: "Stará radnice Brno", language: "cs" }, { term: "Old Town Hall Brno", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Villa Löw-Beer", operation: "additional-buffer", identityHint: "villa-or-museum", searchRequests: [{ term: "Vila Löw-Beer Brno", language: "cs" }, { term: "Villa Löw-Beer Brno", language: "en" }] },
  { countryCode: "NL", countryQid: "Q55", city: "Amsterdam", cityQid: "Q727", name: "Oude Kerk", operation: "additional-buffer", identityHint: "religious-building", searchRequests: [{ term: "Oude Kerk Amsterdam", language: "nl" }, { term: "Old Church Amsterdam", language: "en" }] },
  { countryCode: "NL", countryQid: "Q55", city: "Amsterdam", cityQid: "Q727", name: "Westerkerk", operation: "additional-buffer", identityHint: "religious-building", searchRequests: [{ term: "Westerkerk Amsterdam", language: "nl" }, { term: "Western Church Amsterdam", language: "en" }] },
  { countryCode: "NL", countryQid: "Q55", city: "Amsterdam", cityQid: "Q727", name: "Rembrandt House Museum", operation: "additional-buffer", identityHint: "museum-or-historic-house", searchRequests: [{ term: "Museum Het Rembrandthuis", language: "nl" }, { term: "Rembrandt House Museum Amsterdam", language: "en" }] },
  { countryCode: "NL", countryQid: "Q55", city: "Rotterdam", cityQid: "Q34370", name: "Grote of Sint-Laurenskerk", operation: "additional-buffer", identityHint: "religious-building", searchRequests: [{ term: "Grote of Sint-Laurenskerk Rotterdam", language: "nl" }, { term: "St. Lawrence Church Rotterdam", language: "en" }] },
  { countryCode: "NL", countryQid: "Q55", city: "Rotterdam", cityQid: "Q34370", name: "Depot Boijmans Van Beuningen", operation: "additional-buffer", identityHint: "museum-venue", searchRequests: [{ term: "Depot Boijmans Van Beuningen", language: "nl" }, { term: "Depot Boijmans Van Beuningen Rotterdam", language: "en" }] },
  { countryCode: "NL", countryQid: "Q55", city: "Rotterdam", cityQid: "Q34370", name: "Rotterdam City Hall", operation: "additional-buffer", identityHint: "civic-building", searchRequests: [{ term: "Stadhuis Rotterdam", language: "nl" }, { term: "Rotterdam City Hall", language: "en" }] },
  { countryCode: "PL", countryQid: "Q36", city: "Warsaw", cityQid: "Q270", name: "St. Anne’s Church", operation: "additional-buffer", identityHint: "religious-building", searchRequests: [{ term: "Kościół św. Anny Warszawa", language: "pl" }, { term: "St. Anne’s Church Warsaw", language: "en" }] },
  { countryCode: "PL", countryQid: "Q36", city: "Warsaw", cityQid: "Q270", name: "Warsaw Barbican", operation: "additional-buffer", identityHint: "defensive-structure", searchRequests: [{ term: "Barbakan warszawski", language: "pl" }, { term: "Warsaw Barbican", language: "en" }] },
  { countryCode: "PL", countryQid: "Q36", city: "Kraków", cityQid: "Q31487", name: "Kraków Barbican", operation: "additional-buffer", identityHint: "defensive-structure", searchRequests: [{ term: "Barbakan w Krakowie", language: "pl" }, { term: "Kraków Barbican", language: "en" }] },
  { countryCode: "PL", countryQid: "Q36", city: "Kraków", cityQid: "Q31487", name: "St. Florian’s Gate", operation: "additional-buffer", identityHint: "gate-or-monument", searchRequests: [{ term: "Brama Floriańska", language: "pl" }, { term: "St. Florian’s Gate Kraków", language: "en" }] },
  { countryCode: "PL", countryQid: "Q36", city: "Kraków", cityQid: "Q31487", name: "MOCAK", operation: "additional-buffer", identityHint: "museum-or-venue", searchRequests: [{ term: "MOCAK Muzeum Sztuki Współczesnej w Krakowie", language: "pl" }, { term: "MOCAK Museum of Contemporary Art in Kraków", language: "en" }] },
]);

const EXPECTED_SUPPLEMENT_CANDIDATE_NAMES = Object.freeze([
  "Gold Museum", "Botero Museum", "Municipal House", "St. Vitus Cathedral", "Charles Bridge",
  "Cathedral of St. Peter and Paul", "Ateneum Art Museum", "Palace of Culture and Science",
  "St. Mary’s Basilica", "Schindler’s Factory Museum", "Euromast", "Helsinki Cathedral", "Prague Castle",
  "Villa Tugendhat", "Brno Ossuary", "Rijksmuseum", "Van Gogh Museum", "Royal Palace of Amsterdam",
  "Kunsthal Rotterdam", "Erasmus Bridge", "Iglesia de San Francisco", "Torre Colpatria", "Teatro Colón",
  "Uspenski Cathedral", "Kiasma", "Sibelius Monument", "Powder Tower", "Dancing House",
  "Church of Our Lady before Týn", "Old Town Bridge Tower", "Church of St. James", "Old Town Hall",
  "Villa Löw-Beer", "Oude Kerk", "Westerkerk", "Rembrandt House Museum", "Grote of Sint-Laurenskerk",
  "Depot Boijmans Van Beuningen", "Rotterdam City Hall", "St. Anne’s Church", "Warsaw Barbican",
  "Kraków Barbican", "St. Florian’s Gate", "MOCAK",
]);

const SUPPLEMENT02_DEFINITIONS = Object.freeze([
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Santuario de Monserrate", identityHint: "religious-building", searchRequests: [{ term: "Santuario de Monserrate", language: "es" }, { term: "Monserrate Sanctuary Bogotá", language: "en" }] },
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Museo de Arte Colonial", identityHint: "museum-or-historic-building", searchRequests: [{ term: "Museo de Arte Colonial Bogotá", language: "es" }, { term: "Colonial Museum Bogotá", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Capuchin Crypt in Brno", identityHint: "historical-site", searchRequests: [{ term: "Kapucínská hrobka Brno", language: "cs" }, { term: "Capuchin Crypt Brno", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Church of St. Thomas in Brno", identityHint: "religious-building", searchRequests: [{ term: "Kostel svatého Tomáše Brno", language: "cs" }, { term: "Church of St. Thomas Brno", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Mahen Theatre", identityHint: "theatre-building", searchRequests: [{ term: "Mahenovo divadlo", language: "cs" }, { term: "Mahen Theatre Brno", language: "en" }] },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "Finnish National Theatre", identityHint: "theatre-building", searchRequests: [{ term: "Suomen Kansallisteatteri", language: "fi" }, { term: "Finnish National Theatre Helsinki", language: "en" }] },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "Helsinki Central Library Oodi", identityHint: "library-building", searchRequests: [{ term: "Helsingin keskustakirjasto Oodi", language: "fi" }, { term: "Oodi Helsinki Central Library", language: "en" }] },
  { countryCode: "FI", countryQid: "Q33", city: "Helsinki", cityQid: "Q1757", name: "House of the Estates", identityHint: "historic-building", searchRequests: [{ term: "Säätytalo", language: "fi" }, { term: "House of the Estates Helsinki", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "National Theatre Prague", identityHint: "theatre-building", searchRequests: [{ term: "Národní divadlo Praha", language: "cs" }, { term: "National Theatre Prague", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Clementinum", identityHint: "historic-building-complex", searchRequests: [{ term: "Klementinum", language: "cs" }, { term: "Clementinum Prague", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Rudolfinum", identityHint: "concert-hall-building", searchRequests: [{ term: "Rudolfinum Praha", language: "cs" }, { term: "Rudolfinum Prague", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Church of St. Nicholas, Old Town", identityHint: "religious-building", searchRequests: [{ term: "Kostel svatého Mikuláše Staré Město", language: "cs" }, { term: "St. Nicholas Church Old Town Prague", language: "en" }] },
]);

const EXPECTED_SUPPLEMENT02_CANDIDATE_NAMES = Object.freeze([
  "Santuario de Monserrate", "Museo de Arte Colonial", "Capuchin Crypt in Brno",
  "Church of St. Thomas in Brno", "Mahen Theatre", "Finnish National Theatre",
  "Helsinki Central Library Oodi", "House of the Estates", "National Theatre Prague",
  "Clementinum", "Rudolfinum", "Church of St. Nicholas, Old Town",
]);

const SUPPLEMENT03_DEFINITIONS = Object.freeze([
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Bogotá Primatial Cathedral", identityHint: "religious-building", searchRequests: [{ term: "Catedral Primada de Colombia", language: "es" }, { term: "Catedral Primada de Bogotá", language: "es" }, { term: "Bogotá Primatial Cathedral", language: "en" }] },
  { countryCode: "CO", countryQid: "Q739", city: "Bogotá", cityQid: "Q2841", name: "Planetarium of Bogotá", identityHint: "planetarium-building", searchRequests: [{ term: "Planetario de Bogotá", language: "es" }, { term: "Bogotá Planetarium", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Brno Observatory and Planetarium", identityHint: "observatory-or-planetarium-building", searchRequests: [{ term: "Hvězdárna a planetárium Brno", language: "cs" }, { term: "Brno Observatory and Planetarium", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Brno", cityQid: "Q14960", name: "Janáček Theatre", identityHint: "theatre-building", searchRequests: [{ term: "Janáčkovo divadlo", language: "cs" }, { term: "Janáček Theatre Brno", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Old Town Hall with Astronomical Clock", identityHint: "historic-building", searchRequests: [{ term: "Staroměstská radnice", language: "cs" }, { term: "Old Town Hall Prague", language: "en" }, { term: "Prague Old Town Hall", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Spanish Synagogue", identityHint: "religious-building", searchRequests: [{ term: "Španělská synagoga", language: "cs" }, { term: "Spanish Synagogue Prague", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Church of St. Ludmila", identityHint: "religious-building", searchRequests: [{ term: "Kostel svaté Ludmily Praha", language: "cs" }, { term: "Church of St. Ludmila Prague", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "Žižkov Television Tower", identityHint: "tower", searchRequests: [{ term: "Žižkovský vysílač", language: "cs" }, { term: "Žižkov Television Tower", language: "en" }] },
  { countryCode: "CZ", countryQid: "Q213", city: "Prague", cityQid: "Q1085", name: "National Museum main building", identityHint: "museum-building", searchRequests: [{ term: "Historická budova Národního muzea", language: "cs" }, { term: "National Museum main building Prague", language: "en" }, { term: "Národní muzeum historická budova", language: "cs" }] },
]);

const EXPECTED_SUPPLEMENT03_CANDIDATE_NAMES = Object.freeze([
  "Bogotá Primatial Cathedral", "Planetarium of Bogotá", "Brno Observatory and Planetarium",
  "Janáček Theatre", "Old Town Hall with Astronomical Clock", "Spanish Synagogue",
  "Church of St. Ludmila", "Žižkov Television Tower", "National Museum main building",
]);

const COUNTRY_ASSET_PATHS = Object.freeze([
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
  "data/knowledge/batches/countries.p1a-batch03.json",
]);

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function stableUnique(values = []) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function candidateKey(cityQid, candidateName) {
  const slug = normalizeName(candidateName).replace(/\s+/gu, "-");
  if (!/^Q\d+$/u.test(String(cityQid)) || !slug) throw new Error(`invalid-candidate-key-input:${cityQid}:${candidateName}`);
  return `${cityQid}::${slug}`;
}

function createSupplementCandidateScope(baseRaw) {
  const baseByName = new Map((baseRaw.candidates || []).map((candidate) => [candidate.input.name, candidate]));
  const usableBaseKeys = new Set((baseRaw.candidates || [])
    .filter((candidate) => ["pass", "conditional-manual"].includes(candidate.status))
    .map((candidate) => candidateKey(candidate.input.cityQid, candidate.input.name)));
  const scope = SUPPLEMENT_DEFINITIONS.map((definition, index) => {
    const baseCandidate = definition.baseCandidateName ? baseByName.get(definition.baseCandidateName) : null;
    if (definition.baseCandidateName && !baseCandidate) throw new Error(`supplement-base-candidate-not-found:${definition.baseCandidateName}`);
    const baseInput = baseCandidate?.input || {};
    const name = definition.name || definition.baseCandidateName;
    const cityQid = definition.cityQid || baseInput.cityQid;
    const operation = definition.operation;
    if (!SUPPLEMENT_OPERATIONS.includes(operation)) throw new Error(`invalid-supplement-operation:${operation}`);
    const lockedSelectedQid = operation === "parent-only-requery" ? baseCandidate?.selectedQid : null;
    if (operation === "parent-only-requery" && !/^Q\d+$/u.test(String(lockedSelectedQid))) {
      throw new Error(`supplement-parent-only-missing-base-selected-qid:${name}`);
    }
    if (definition.expectedLockedQid && lockedSelectedQid !== definition.expectedLockedQid) {
      throw new Error(`supplement-parent-only-qid-mismatch:${name}:${lockedSelectedQid}:${definition.expectedLockedQid}`);
    }
    const searchRequests = [...(definition.searchRequests || [])].map((request) => ({
      term: request.term,
      language: request.language || "en",
    }));
    const searchTerms = searchRequests.map((request) => request.term);
    const knownQids = stableUnique([
      ...(definition.knownQids || []),
      ...(lockedSelectedQid ? [lockedSelectedQid] : []),
    ]);
    const result = {
      countryCode: definition.countryCode || baseInput.countryCode,
      countryQid: definition.countryQid || baseInput.countryQid,
      city: definition.city || baseInput.city,
      cityQid,
      name,
      candidateName: name,
      candidateKey: candidateKey(cityQid, name),
      operation,
      sourceRound: "supplement01",
      searchTerms,
      searchRequests,
      searchLanguageByTerm: Object.fromEntries(searchRequests.map((request) => [request.term, request.language])),
      slot: null,
      identityHint: definition.identityHint || baseInput.identityHint,
      knownQids,
      lockedSelectedQid,
      preferredKnownQid: definition.preferredKnownQid || null,
      competingKnownQids: stableUnique(definition.competingKnownQids || []),
      manualDecision: definition.manualDecision || null,
      reasons: [...(definition.reasons || ["fixed-supplement01-additional-buffer-scope"])],
      baseCandidateInputIndex: baseInput.inputIndex || null,
      baseStatus: baseCandidate?.status || null,
      basePreParentStatus: baseCandidate?.preParentStatus || null,
      inputIndex: index + 1,
    };
    if (!result.countryCode || !result.countryQid || !result.city || !result.cityQid || !result.identityHint) {
      throw new Error(`incomplete-supplement-candidate:${name}`);
    }
    return Object.freeze(result);
  });
  const keys = scope.map((candidate) => candidate.candidateKey);
  if (new Set(keys).size !== keys.length) throw new Error("duplicate-supplement-candidate-key");
  const stableOverlap = scope.find((candidate) => usableBaseKeys.has(candidate.candidateKey));
  if (stableOverlap) throw new Error(`stable-usable-candidate-in-supplement:${stableOverlap.candidateKey}`);
  if (scope.length !== EXPECTED_SUPPLEMENT_CANDIDATE_NAMES.length
    || scope.some((candidate, index) => candidate.candidateName !== EXPECTED_SUPPLEMENT_CANDIDATE_NAMES[index])) {
    throw new Error("supplement-fixed-scope-mismatch");
  }
  return scope;
}

function createSupplement02CandidateScope(baseRaw, supplement01Raw) {
  const baseKeys = new Set((baseRaw.candidates || [])
    .map((candidate) => candidateKey(candidate.input.cityQid, candidate.input.name)));
  const supplement01Keys = new Set((supplement01Raw.candidates || []).map((candidate) => candidate.candidateKey));
  const historicalNames = new Set([
    ...(baseRaw.candidates || []).map((candidate) => normalizeName(candidate.input.name)),
    ...(supplement01Raw.candidates || []).map((candidate) => normalizeName(candidate.candidateName)),
  ]);
  const scope = SUPPLEMENT02_DEFINITIONS.map((definition, index) => {
    const searchRequests = definition.searchRequests.map((request) => ({ ...request }));
    const result = {
      ...definition,
      candidateName: definition.name,
      candidateKey: candidateKey(definition.cityQid, definition.name),
      operation: "additional-buffer",
      sourceRound: "supplement02",
      searchTerms: searchRequests.map((request) => request.term),
      searchRequests,
      searchLanguageByTerm: Object.fromEntries(searchRequests.map((request) => [request.term, request.language])),
      slot: null,
      knownQids: [],
      lockedSelectedQid: null,
      preferredKnownQid: null,
      competingKnownQids: [],
      manualDecision: null,
      reasons: ["fixed-supplement02-additional-buffer-scope"],
      baseCandidateInputIndex: null,
      baseStatus: null,
      basePreParentStatus: null,
      inputIndex: index + 1,
    };
    return Object.freeze(result);
  });
  const keys = scope.map((candidate) => candidate.candidateKey);
  if (scope.length !== 12 || new Set(keys).size !== 12) throw new Error("supplement02-fixed-scope-key-mismatch");
  if (scope.some((candidate) => baseKeys.has(candidate.candidateKey))) throw new Error("supplement02-base-candidate-key-overlap");
  if (scope.some((candidate) => supplement01Keys.has(candidate.candidateKey))) throw new Error("supplement02-supplement01-candidate-key-overlap");
  if (scope.some((candidate) => historicalNames.has(normalizeName(candidate.candidateName)))) {
    throw new Error("supplement02-historical-normalized-name-overlap");
  }
  if (scope.some((candidate) => candidate.countryCode === "AU")) throw new Error("supplement02-australia-candidate");
  if (JSON.stringify(scope.map((candidate) => candidate.candidateName)) !== JSON.stringify(EXPECTED_SUPPLEMENT02_CANDIDATE_NAMES)) {
    throw new Error("supplement02-fixed-scope-name-mismatch");
  }
  return scope;
}

function createSupplement03CandidateScope(baseRaw, supplement01Raw, supplement02Raw) {
  const historicalKeys = new Set([
    ...baseRaw.candidates.map((candidate) => candidateKey(candidate.input.cityQid, candidate.input.name)),
    ...supplement01Raw.candidates.map((candidate) => candidate.candidateKey),
    ...supplement02Raw.candidates.map((candidate) => candidate.candidateKey),
  ]);
  const historicalNames = new Set([
    ...baseRaw.candidates.map((candidate) => normalizeName(candidate.input.name)),
    ...supplement01Raw.candidates.map((candidate) => normalizeName(candidate.candidateName)),
    ...supplement02Raw.candidates.map((candidate) => normalizeName(candidate.candidateName)),
  ]);
  const scope = SUPPLEMENT03_DEFINITIONS.map((definition, index) => {
    const searchRequests = definition.searchRequests.map((request) => ({ ...request }));
    return Object.freeze({
      ...definition,
      candidateName: definition.name,
      candidateKey: candidateKey(definition.cityQid, definition.name),
      operation: "additional-buffer",
      sourceRound: "supplement03",
      searchTerms: searchRequests.map((request) => request.term),
      searchRequests,
      searchLanguageByTerm: Object.fromEntries(searchRequests.map((request) => [request.term, request.language])),
      slot: null,
      knownQids: [],
      lockedSelectedQid: null,
      preferredKnownQid: null,
      competingKnownQids: [],
      manualDecision: null,
      reasons: ["fixed-supplement03-additional-buffer-scope"],
      baseCandidateInputIndex: null,
      baseStatus: null,
      basePreParentStatus: null,
      inputIndex: index + 1,
    });
  });
  const keys = scope.map((candidate) => candidate.candidateKey);
  if (scope.length !== 9 || new Set(keys).size !== 9) throw new Error("supplement03-fixed-scope-key-mismatch");
  if (scope.some((candidate) => historicalKeys.has(candidate.candidateKey))) throw new Error("supplement03-historical-candidate-key-overlap");
  if (scope.some((candidate) => historicalNames.has(normalizeName(candidate.candidateName)))) {
    throw new Error("supplement03-historical-normalized-name-overlap");
  }
  if (scope.some((candidate) => candidate.countryCode === "AU")) throw new Error("supplement03-australia-candidate");
  if (JSON.stringify(scope.map((candidate) => candidate.candidateName)) !== JSON.stringify(EXPECTED_SUPPLEMENT03_CANDIDATE_NAMES)) {
    throw new Error("supplement03-fixed-scope-name-mismatch");
  }
  return scope;
}

function supplementSearchCandidates(scope) {
  return scope.filter((candidate) => {
    if (candidate.operation === "parent-only-requery") {
      if (candidate.searchTerms.length !== 0) throw new Error(`parent-only-candidate-has-search-terms:${candidate.candidateKey}`);
      return false;
    }
    return candidate.searchTerms.length > 0;
  });
}

function collectSupplementExactQids(scope, searchEvidence) {
  const searchByInputIndex = new Map(searchEvidence.map((search) => [search.candidateInputIndex, search]));
  return stableUnique(scope.flatMap((candidate) => [
    ...candidate.knownQids,
    ...((searchByInputIndex.get(candidate.inputIndex)?.results || []).map((result) => result.qid)),
  ]));
}

function qidFromUri(value) {
  return String(value || "").match(/\/entity\/(Q\d+)$/u)?.[1] || "";
}

function booleanBinding(value) {
  return value === true || value === "true" || value === "1";
}

function stableObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en")));
}

function stableAliases(value = {}) {
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([language, aliases]) => [language, [...aliases]
      .map((alias) => ({ language: alias.language, value: alias.value }))
      .sort((left, right) => left.value.localeCompare(right.value, "en"))]));
}

function stableClaims(claims = []) {
  return [...claims].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));
}

function pruneEntity(entity, responseMapKey) {
  if (!entity) return { responseMapKey, id: "", missing: true };
  return {
    responseMapKey,
    id: entity.id,
    type: entity.type,
    missing: entity.missing,
    labels: stableObject(entity.labels || {}),
    descriptions: stableObject(entity.descriptions || {}),
    aliases: stableAliases(entity.aliases || {}),
    claims: Object.fromEntries(["P17", "P31", "P131", "P276", "P625"].map((property) => [
      property,
      stableClaims(entity.claims?.[property] || []),
    ])),
  };
}

function claimQids(entity, property) {
  return stableUnique((entity?.claims?.[property] || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter((qid) => /^Q\d+$/u.test(String(qid))));
}

function coordinatesEvidence(entity, sparqlTruthyClaims = []) {
  const statements = (entity?.claims?.P625 || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => ({
      rank: claim.rank || "normal",
      latitude: claim?.mainsnak?.datavalue?.value?.latitude,
      longitude: claim?.mainsnak?.datavalue?.value?.longitude,
      globe: claim?.mainsnak?.datavalue?.value?.globe,
    }))
    .filter(({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude));
  const preferred = statements.filter((statement) => statement.rank === "preferred");
  const selectedPool = preferred.length > 0 ? preferred : statements;
  const unique = [...new Map(selectedPool.map((statement) => [
    `${statement.latitude},${statement.longitude}`,
    { latitude: statement.latitude, longitude: statement.longitude },
  ])).values()];
  const valid = unique.filter(({ latitude, longitude }) => latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180);
  return {
    statements,
    sparqlTruthyClaims: stableUnique(sparqlTruthyClaims),
    selectedRank: preferred.length > 0 ? "preferred" : "non-deprecated",
    uniqueCoordinates: unique,
    validCoordinates: valid,
    accepted: unique.length === 1 && valid.length === 1,
  };
}

function compareProjections(apiClaims = [], sparqlClaims = []) {
  const api = stableUnique(apiClaims);
  const sparql = stableUnique(sparqlClaims);
  const apiSet = new Set(api);
  const sparqlSet = new Set(sparql);
  return {
    apiClaims: api,
    sparqlTruthyClaims: sparql,
    unionClaims: stableUnique([...api, ...sparql]),
    onlyInApi: api.filter((qid) => !sparqlSet.has(qid)),
    onlyInSparql: sparql.filter((qid) => !apiSet.has(qid)),
    exactMatch: api.length === sparql.length && api.every((qid, index) => qid === sparql[index]),
  };
}

class WikidataRequestError extends Error {
  constructor(message, { status = null, responseBody = "", retryAfter = null } = {}) {
    super(message);
    this.name = "WikidataRequestError";
    this.status = status;
    this.responseBody = responseBody;
    this.retryAfter = retryAfter;
  }
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseRetryAfterMs(value, nowMs = Date.now()) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value).trim();
  if (/^\d+(?:\.\d+)?$/u.test(normalized)) {
    return Math.min(Math.max(Math.ceil(Number(normalized) * 1_000), 0), MAX_RETRY_WAIT_MS);
  }
  const retryAtMs = Date.parse(normalized);
  if (!Number.isFinite(retryAtMs)) return null;
  return Math.min(Math.max(retryAtMs - nowMs, 0), MAX_RETRY_WAIT_MS);
}

function retryDelayMs(retryNumber, retryAfter, nowMs = Date.now()) {
  const retryAfterMs = parseRetryAfterMs(retryAfter, nowMs);
  if (retryAfterMs !== null) return retryAfterMs;
  return Math.min(5_000 * (2 ** Math.max(retryNumber - 1, 0)), MAX_RETRY_WAIT_MS);
}

async function waitWithStats(delayMs, counters, kind, sleepImpl = sleep) {
  if (delayMs <= 0) return;
  counters.totalThrottleWaitMs += delayMs;
  if (kind === "search") counters.searchThrottleWaitMs += delayMs;
  if (kind === "batch") counters.batchThrottleWaitMs += delayMs;
  if (kind === "retry") counters.retryWaitMs += delayMs;
  await sleepImpl(delayMs);
}

function attachFailureTelemetry(error, counters, { stage = "unknown", candidate = null } = {}) {
  counters.failedStage = stage;
  counters.failedCandidate = candidate;
  counters.lastHttpStatus = error.status ?? null;
  error.evidenceFailure = {
    ...counters,
    failedStage: counters.failedStage,
    failedCandidate: counters.failedCandidate,
    httpStatus: counters.lastHttpStatus,
  };
  return error;
}

async function fetchJsonWithRetry(url, options, context, requestMeta = {}) {
  const {
    requestRetries,
    timeoutMs,
    counters,
    fetchImpl = fetch,
    sleepImpl = sleep,
    nowImpl = Date.now,
  } = context;
  let lastError;
  for (let attempt = 0; attempt <= requestRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    counters.attemptedRequestCount += 1;
    counters.httpRequestCount = counters.attemptedRequestCount;
    let currentError;
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (response.ok) {
        const payload = await response.json();
        counters.successfulRequestCount += 1;
        return payload;
      }
      const responseBody = await response.text();
      const retryAfter = response.headers?.get?.("retry-after") ?? null;
      currentError = new WikidataRequestError(
        `wikidata-request-failed:${response.status}:${responseBody}`,
        { status: response.status, responseBody, retryAfter },
      );
      if (response.status === 429) counters.http429Count += 1;
    } catch (error) {
      if (error?.name === "AbortError" || /aborted|timeout/iu.test(error?.message || "")) {
        counters.timeoutCount += 1;
      }
      currentError = error instanceof WikidataRequestError
        ? error
        : new WikidataRequestError(`wikidata-network-error:${error.message}`, { status: null });
    } finally {
      clearTimeout(timeout);
    }

    lastError = currentError;
    const retryable = currentError.status === 429
      || currentError.status === null
      || currentError.status >= 500;
    if (!retryable || attempt >= requestRetries) {
      throw attachFailureTelemetry(currentError, counters, requestMeta);
    }
    counters.retryCount += 1;
    const delayMs = retryDelayMs(attempt + 1, currentError.retryAfter, nowImpl());
    await waitWithStats(delayMs, counters, "retry", sleepImpl);
  }
  throw attachFailureTelemetry(lastError, counters, requestMeta);
}

async function collectSearchResponsesSerial(candidates, {
  searchDelayMs,
  counters,
  requestSearch,
  sleepImpl = sleep,
}) {
  const requestKeys = candidates.flatMap((candidate) => candidate.searchTerms.map((term) => (
    `${candidate.searchLanguageByTerm?.[term] || "en"}\u0000${term}`
  )));
  const totalRequests = new Set(requestKeys).size;
  const payloadByRequestKey = new Map();
  const results = [];
  let completedRequests = 0;
  let activeRequests = 0;
  for (const candidate of candidates) {
    const responses = [];
    for (const term of candidate.searchTerms) {
      const language = candidate.searchLanguageByTerm?.[term] || "en";
      const requestKey = `${language}\u0000${term}`;
      let payload = payloadByRequestKey.get(requestKey);
      if (payload) {
        counters.searchCacheHitCount += 1;
      } else {
        counters.searchRequestCount += 1;
        activeRequests += 1;
        counters.searchMaxConcurrency = Math.max(counters.searchMaxConcurrency, activeRequests);
        try {
          payload = await requestSearch(candidate, term);
          payloadByRequestKey.set(requestKey, payload);
        } finally {
          activeRequests -= 1;
        }
        completedRequests += 1;
        if (completedRequests < totalRequests) {
          await waitWithStats(searchDelayMs, counters, "search", sleepImpl);
        }
      }
      responses.push({ term, language, payload });
    }
    results.push(searchEvidenceFromResponses(candidate, responses));
  }
  return results;
}

function uniqueQidBatches(qids, size = ENTITY_BATCH_SIZE) {
  return chunks(stableUnique(qids), size);
}

async function processBatches(batches, {
  batchDelayMs,
  counters,
  processBatch,
  sleepImpl = sleep,
}) {
  const results = [];
  for (let index = 0; index < batches.length; index += 1) {
    results.push(await processBatch(batches[index], index));
    if (index < batches.length - 1) {
      await waitWithStats(batchDelayMs, counters, "batch", sleepImpl);
    }
  }
  return results;
}

function searchUrl(term, language = "en") {
  const url = new URL(ENTITY_API_ENDPOINT);
  url.search = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    language,
    uselang: "en",
    type: "item",
    limit: String(SEARCH_LIMIT),
    search: term,
    origin: "*",
  }).toString();
  return url.toString();
}

function entityUrl(qids, languages = LANGUAGES) {
  const url = new URL(ENTITY_API_ENDPOINT);
  url.search = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    props: "labels|descriptions|aliases|claims",
    languages: languages.join("|"),
    ids: qids.join("|"),
    origin: "*",
  }).toString();
  return url.toString();
}

async function sparqlRequest(query, requestContext, requestMeta = {}) {
  return fetchJsonWithRetry(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query, format: "json" }).toString(),
  }, requestContext, requestMeta);
}

function projectionQuery(qids) {
  return `SELECT ?item ?property ?value WHERE {
  VALUES ?item { ${qids.map((qid) => `wd:${qid}`).join(" ")} }
  { BIND(?item AS ?value) BIND("ENTITY" AS ?property) }
  UNION { ?item wdt:P17 ?value . BIND("P17" AS ?property) }
  UNION { ?item wdt:P31 ?value . BIND("P31" AS ?property) }
  UNION { ?item wdt:P131 ?value . BIND("P131" AS ?property) }
  UNION { ?item wdt:P276 ?value . BIND("P276" AS ?property) }
  UNION { ?item wdt:P625 ?value . BIND("P625" AS ?property) }
}
ORDER BY ?item ?property ?value`;
}

function typeLabelQuery(qids) {
  return `SELECT ?type ?labelEn ?descriptionEn WHERE {
  VALUES ?type { ${qids.map((qid) => `wd:${qid}`).join(" ")} }
  OPTIONAL { ?type rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }
  OPTIONAL { ?type schema:description ?descriptionEn . FILTER(LANG(?descriptionEn) = "en") }
}
ORDER BY ?type`;
}

function parentQuery({ cityQid, pairs }) {
  return `SELECT DISTINCT ?item ?approvedCity ?pathType ?depth ?node1 ?node2 ?node3 WHERE {
  VALUES ?item { ${pairs.map(({ qid }) => `wd:${qid}`).join(" ")} }
  BIND(wd:${cityQid} AS ?approvedCity)
  {
    ?item wdt:P131 ?node1 .
    FILTER(?node1 = ?approvedCity)
    BIND("administrative-path" AS ?pathType)
    BIND(1 AS ?depth)
  }
  UNION {
    ?item wdt:P131 ?node1 .
    ?node1 wdt:P131 ?node2 .
    FILTER(?node2 = ?approvedCity)
    BIND("administrative-path" AS ?pathType)
    BIND(2 AS ?depth)
  }
  UNION {
    ?item wdt:P131 ?node1 .
    ?node1 wdt:P131 ?node2 .
    ?node2 wdt:P131 ?node3 .
    FILTER(?node3 = ?approvedCity)
    BIND("administrative-path" AS ?pathType)
    BIND(3 AS ?depth)
  }
  UNION {
    ?item wdt:P276 ?node1 .
    ?node1 wdt:P131 ?node2 .
    FILTER(?node2 = ?approvedCity)
    BIND("location-path" AS ?pathType)
    BIND(1 AS ?depth)
  }
  UNION {
    ?item wdt:P276 ?node1 .
    ?node1 wdt:P131 ?node2 .
    ?node2 wdt:P131 ?node3 .
    FILTER(?node3 = ?approvedCity)
    BIND("location-path" AS ?pathType)
    BIND(2 AS ?depth)
  }
  UNION {
    ?item wdt:P276 ?node1 .
    ?node1 wdt:P131 ?node2 .
    ?node2 wdt:P131 ?node3 .
    ?node3 wdt:P131 ?approvedCity .
    BIND("location-path" AS ?pathType)
    BIND(3 AS ?depth)
  }
}
ORDER BY ?item ?pathType ?depth ?node1 ?node2 ?node3`;
}

function parentQueryForCityBatch(batch) {
  return parentQuery({ cityQid: batch.cityQid, pairs: batch.queryPairs });
}

function municipalityRelationQuery({ cityQid, municipalityQids }) {
  return `SELECT DISTINCT ?municipality ?approvedCity ?property ?direction WHERE {
  VALUES ?municipality { ${municipalityQids.map((qid) => `wd:${qid}`).join(" ")} }
  BIND(wd:${cityQid} AS ?approvedCity)
  {
    ?approvedCity wdt:P131 ?municipality .
    BIND("P131" AS ?property)
    BIND("approved-city-to-municipality" AS ?direction)
  }
  UNION {
    ?municipality wdt:P150 ?approvedCity .
    BIND("P150" AS ?property)
    BIND("municipality-to-approved-city" AS ?direction)
  }
  UNION {
    ?municipality wdt:P527 ?approvedCity .
    BIND("P527" AS ?property)
    BIND("municipality-to-approved-city" AS ?direction)
  }
  UNION {
    ?approvedCity wdt:P361 ?municipality .
    BIND("P361" AS ?property)
    BIND("approved-city-to-municipality" AS ?direction)
  }
  UNION {
    ?municipality wdt:P460 ?approvedCity .
    BIND("P460" AS ?property)
    BIND("municipality-to-approved-city" AS ?direction)
  }
  UNION {
    ?approvedCity wdt:P460 ?municipality .
    BIND("P460" AS ?property)
    BIND("approved-city-to-municipality" AS ?direction)
  }
}
ORDER BY ?municipality ?property ?direction`;
}

function institutionRelationDiscoveryQuery(institutionQids) {
  if (institutionQids.length < 1 || institutionQids.length > 2) {
    throw new Error(`institution-relation-discovery-batch-size:${institutionQids.length}`);
  }
  return `SELECT DISTINCT ?institution ?property ?relatedEntity WHERE {
  VALUES ?institution { ${institutionQids.map((qid) => `wd:${qid}`).join(" ")} }
  {
    ?institution wdt:P131 ?relatedEntity .
    BIND("P131" AS ?property)
  }
  UNION {
    ?institution wdt:P159 ?relatedEntity .
    BIND("P159" AS ?property)
  }
  UNION {
    ?institution wdt:P276 ?relatedEntity .
    BIND("P276" AS ?property)
  }
  UNION {
    ?relatedEntity wdt:P361 ?institution .
    BIND("P361" AS ?property)
  }
  UNION {
    ?relatedEntity wdt:P466 ?institution .
    BIND("P466" AS ?property)
  }
  UNION {
    ?institution wdt:P527 ?relatedEntity .
    BIND("P527" AS ?property)
  }
  UNION {
    ?institution wdt:P749 ?relatedEntity .
    BIND("P749" AS ?property)
  }
  FILTER(?relatedEntity != ?institution)
}
ORDER BY ?institution ?property ?relatedEntity`;
}

function relatedEntityParentQuery({ cityQid, relatedQids }) {
  if (relatedQids.length < 1 || relatedQids.length > 2) {
    throw new Error(`related-entity-parent-batch-size:${relatedQids.length}`);
  }
  return `SELECT DISTINCT ?item ?approvedCity ?pathType ?depth ?node1 ?node2 ?node3 WHERE {
  VALUES ?item { ${relatedQids.map((qid) => `wd:${qid}`).join(" ")} }
  BIND(wd:${cityQid} AS ?approvedCity)
  {
    ?item wdt:P131 ?node1 .
    FILTER(?node1 = ?approvedCity)
    BIND("administrative-path" AS ?pathType)
    BIND(1 AS ?depth)
  }
  UNION {
    ?item wdt:P131 ?node1 .
    ?node1 wdt:P131 ?node2 .
    FILTER(?node2 = ?approvedCity)
    BIND("administrative-path" AS ?pathType)
    BIND(2 AS ?depth)
  }
  UNION {
    ?item wdt:P131 ?node1 .
    ?node1 wdt:P131 ?node2 .
    ?node2 wdt:P131 ?node3 .
    FILTER(?node3 = ?approvedCity)
    BIND("administrative-path" AS ?pathType)
    BIND(3 AS ?depth)
  }
  UNION {
    ?item wdt:P276 ?node1 .
    FILTER(?node1 = ?approvedCity)
    BIND("location-path" AS ?pathType)
    BIND(0 AS ?depth)
  }
  UNION {
    ?item wdt:P276 ?node1 .
    ?node1 wdt:P131 ?node2 .
    FILTER(?node2 = ?approvedCity)
    BIND("location-path" AS ?pathType)
    BIND(1 AS ?depth)
  }
  UNION {
    ?item wdt:P276 ?node1 .
    ?node1 wdt:P131 ?node2 .
    ?node2 wdt:P131 ?node3 .
    FILTER(?node3 = ?approvedCity)
    BIND("location-path" AS ?pathType)
    BIND(2 AS ?depth)
  }
  UNION {
    ?item wdt:P276 ?node1 .
    ?node1 wdt:P131 ?node2 .
    ?node2 wdt:P131 ?node3 .
    ?node3 wdt:P131 ?approvedCity .
    BIND("location-path" AS ?pathType)
    BIND(3 AS ?depth)
  }
}
ORDER BY ?item ?pathType ?depth ?node1 ?node2 ?node3`;
}

function municipalityRelationsFromBindings(bindings, cityQid) {
  return (bindings || []).map((binding) => ({
    municipalityQid: qidFromUri(binding.municipality?.value),
    cityQid: qidFromUri(binding.approvedCity?.value),
    property: binding.property?.value || "",
    direction: binding.direction?.value || "",
  })).filter((relation) => relation.municipalityQid && relation.cityQid === cityQid
    && ["P131", "P150", "P527", "P361", "P460"].includes(relation.property))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));
}

function institutionRelationsFromBindings(bindings) {
  return (bindings || []).map((binding) => {
    const institutionQid = qidFromUri(binding.institution?.value);
    const property = binding.property?.value || "";
    const relatedEntityQid = qidFromUri(binding.relatedEntity?.value);
    const rule = INSTITUTION_RELATION_RULES[property];
    if (!institutionQid || !relatedEntityQid || !rule) return null;
    return {
      institutionQid,
      property,
      relatedEntityQid,
      ruleId: rule.ruleId,
      direction: rule.direction,
      purpose: rule.purpose,
      parentAcceptanceEligible: rule.parentAcceptanceEligible,
    };
  }).filter(Boolean).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));
}

function relatedEntityParentEvidenceFromBindings(bindings, relatedQids, cityQid) {
  const relatedQidSet = new Set(relatedQids);
  const pathsByQid = new Map(relatedQids.map((qid) => [qid, []]));
  for (const binding of bindings || []) {
    const qid = qidFromUri(binding.item?.value);
    const approvedCityQid = qidFromUri(binding.approvedCity?.value);
    const pathType = binding.pathType?.value || "";
    const depth = Number(binding.depth?.value);
    if (!relatedQidSet.has(qid) || approvedCityQid !== cityQid) continue;
    if (!["administrative-path", "location-path"].includes(pathType)) continue;
    if (![0, 1, 2, 3].includes(depth)) continue;
    const pathQids = [binding.node1, binding.node2, binding.node3]
      .map((node) => qidFromUri(node?.value))
      .filter(Boolean);
    if (pathQids.at(-1) !== cityQid) pathQids.push(cityQid);
    pathsByQid.get(qid).push({ pathType, depth, pathQids });
  }
  return new Map([...pathsByQid.entries()].map(([qid, paths]) => {
    const selected = paths.sort((left, right) => left.depth - right.depth
      || left.pathType.localeCompare(right.pathType, "en")
      || left.pathQids.join("|").localeCompare(right.pathQids.join("|"), "en"))[0];
    return [qid, selected ? { ...selected, accepted: true } : {
      pathType: "unconfirmed",
      depth: null,
      pathQids: [],
      accepted: false,
    }];
  }));
}

function selectInstitutionBuildingCandidates(candidates) {
  const allowedNames = new Set(INSTITUTION_BUILDING_CANDIDATE_NAMES);
  return candidates.filter((candidate) => candidate.operation === "parent-only-requery"
    && candidate.selectedQid
    && allowedNames.has(candidate.candidateName));
}

function institutionRelationDiscoveryBatches(candidates) {
  const byCity = new Map();
  for (const candidate of candidates) {
    const key = candidate.cityQid || "unknown-city";
    const current = byCity.get(key) || { city: candidate.city || "", cityQid: key, candidates: [] };
    current.candidates.push(candidate);
    byCity.set(key, current);
  }
  return [...byCity.values()].flatMap((group) => chunks(group.candidates, 2).map((batchCandidates) => ({
    city: group.city,
    cityQid: group.cityQid,
    candidates: batchCandidates,
    institutionQids: batchCandidates.map((candidate) => candidate.selectedQid),
  })));
}

function relatedEntityParentBatches(cityRelatedEntities) {
  return cityRelatedEntities.flatMap((cityEntry) => chunks(stableUnique(cityEntry.relatedQids), 2)
    .filter((relatedQids) => relatedQids.length > 0)
    .map((relatedQids) => ({
      city: cityEntry.city,
      cityQid: cityEntry.cityQid,
      relatedQids,
    })));
}

function counterSnapshot(counters) {
  return {
    attemptedRequestCount: counters.attemptedRequestCount,
    timeoutCount: counters.timeoutCount,
    retryCount: counters.retryCount,
  };
}

async function runCandidateLevelEvidenceRequest({
  candidateKeys,
  evidenceIssueType,
  failedStage,
  queryScope,
  relatedQids,
  counters,
  request,
}) {
  const before = counterSnapshot(counters);
  try {
    return { succeeded: true, payload: await request(), issues: [] };
  } catch (error) {
    const after = counterSnapshot(counters);
    const timeout = after.timeoutCount > before.timeoutCount || /abort|timeout/iu.test(error?.message || "");
    const resolvedEvidenceIssueType = typeof evidenceIssueType === "function"
      ? evidenceIssueType({ error, timeout })
      : evidenceIssueType;
    const issues = candidateKeys.map((candidateKeyValue) => ({
      candidateKey: candidateKeyValue,
      evidenceIssueType: resolvedEvidenceIssueType,
      failedStage,
      httpStatus: error?.status ?? null,
      timeout,
      attempts: Math.max(after.attemptedRequestCount - before.attemptedRequestCount, 1),
      retries: Math.max(after.retryCount - before.retryCount, 0),
      queryScope,
      relatedQids: stableUnique(relatedQids),
    }));
    return { succeeded: false, payload: null, issues };
  }
}

function applyInstitutionBuildingOutcome(candidate, { discoverySucceeded, relatedEntityEvidence }) {
  const selected = candidate.candidateEntities.find((entity) => entity.qid === candidate.selectedQid);
  if (!selected) return;
  selected.parentEvidence.institutionBuildingEvidence = relatedEntityEvidence;
  const acceptedEvidence = relatedEntityEvidence.find((evidence) => evidence.accepted
    && evidence.parentAcceptanceEligible);
  if (acceptedEvidence) {
    selected.parentEvidence.parentEvidenceLevel = "institution-building-path";
    selected.parentEvidence.parentPathDepth = acceptedEvidence.parentEvidence.depth;
    selected.parentEvidence.parentPathQids = [
      acceptedEvidence.relatedEntityQid,
      ...acceptedEvidence.parentEvidence.pathQids,
    ];
    selected.parentEvidence.requiresManualReview = true;
    selected.parentEvidence.accepted = true;
  }
  if (candidate.candidateName === "Kunsthal Rotterdam" && (!discoverySucceeded || !acceptedEvidence)) {
    selected.parentEvidence.accepted = false;
    selected.parentEvidence.parentEvidenceLevel = "institution-building-unconfirmed";
    selected.parentEvidence.parentPathDepth = null;
    selected.parentEvidence.parentPathQids = [];
    selected.parentEvidence.requiresManualReview = true;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(REPOSITORY_ROOT, relativePath), "utf8"));
}

async function loadProtectedEntityScope() {
  const countries = (await Promise.all(COUNTRY_ASSET_PATHS.map(readJson))).flatMap((asset) => asset.countries || []);
  const pilotCities = (await readJson("data/knowledge/cities.p1b-pilot.json")).cities || [];
  const batchCities = (await readJson("data/knowledge/batches/cities.p1b-batch01.json")).cities || [];
  const pilotPois = (await readJson("data/knowledge/pois.p1b-pilot.json")).pois || [];
  return {
    countries,
    cities: [...pilotCities, ...batchCities],
    pilotPois,
    countryQids: stableUnique(countries.map((entity) => entity.wikidataId)),
    cityQids: stableUnique([...pilotCities, ...batchCities].map((entity) => entity.wikidataId)),
    pilotPoiQids: stableUnique(pilotPois.map((entity) => entity.wikidataId)),
  };
}

function searchEvidenceFromResponses(candidate, responses) {
  const byQid = new Map();
  responses.forEach(({ term, payload }) => {
    (payload.search || []).forEach((result, searchRank) => {
      const current = byQid.get(result.id) || {
        qid: result.id,
        labels: [],
        descriptions: [],
        aliases: [],
        searchTerms: [],
        bestSearchRank: searchRank,
      };
      current.labels.push(result.label);
      current.descriptions.push(result.description);
      current.aliases.push(...(result.aliases || []));
      current.searchTerms.push(term);
      current.bestSearchRank = Math.min(current.bestSearchRank, searchRank);
      byQid.set(result.id, current);
    });
  });
  const results = [...byQid.values()].map((result) => ({
    ...result,
    labels: stableUnique(result.labels),
    descriptions: stableUnique(result.descriptions),
    aliases: stableUnique(result.aliases),
    searchTerms: stableUnique(result.searchTerms),
  })).sort((left, right) => left.bestSearchRank - right.bestSearchRank || left.qid.localeCompare(right.qid, "en"));
  return {
    candidateInputIndex: candidate.inputIndex,
    queries: responses.map(({ term }) => term),
    requests: responses.map(({ term, language }) => ({ term, language: language || candidate.searchLanguageByTerm?.[term] || "en" })),
    resultCount: results.length,
    results,
  };
}

function entityNames(entity) {
  return stableUnique([
    ...Object.values(entity?.labels || {}).map((label) => label?.value),
    ...Object.values(entity?.aliases || {}).flatMap((aliases) => aliases.map((alias) => alias?.value)),
  ]);
}

function identityCategory(typeLabels, identityHint) {
  const labels = typeLabels.map((value) => value.toLocaleLowerCase("en"));
  const categories = [];
  if (labels.some((label) => /museum|gallery|exhibition/iu.test(label))) categories.push("institution-or-museum");
  if (labels.some((label) => /building|church|cathedral|basilica|palace|castle|bridge|tower|villa|house/iu.test(label))) categories.push("physical-building-or-structure");
  if (labels.some((label) => /complex|site|collection|hill|area/iu.test(label))) categories.push("complex-or-broad-site");
  return categories.length > 0 ? stableUnique(categories) : [identityHint, "unclassified-from-type-labels"];
}

function preliminaryStatusPriority(entityEvidence) {
  if (entityEvidence.duplicateEvidence.duplicate) return "duplicate";
  if (entityEvidence.outOfScopeEvidence.outOfScope) return "out-of-scope";
  if (!entityEvidence.countryEvidence.accepted) return "country-failed";
  if (!entityEvidence.coordinateEvidence.accepted) return "coordinate-failed";
  return "identity-ambiguous";
}

function selectCandidateIdentityBeforeParent(candidate, entityEvidence) {
  const viable = entityEvidence.filter((entity) => entity.identityGatePass);
  const strong = viable.filter((entity) => entity.nameEvidence.exactNameOrAliasMatch);
  if (strong.length === 1) {
    const selected = strong[0];
    const needsManual = viable.length > 1
      || !selected.p31Evidence.sourceProjection.exactMatch
      || selected.identityEvidence.categories.length > 1;
    return {
      status: needsManual ? "conditional-manual" : "pass",
      selectedQid: selected.qid,
      selectionReasons: [
        "unique-identity-gate-pass-with-exact-label-or-alias-match",
        ...(needsManual ? ["identity-or-source-projection-requires-manual-review"] : []),
      ],
      identityAlternatives: viable.filter((entity) => entity.qid !== selected.qid).map((entity) => entity.qid),
    };
  }
  if (strong.length > 1) {
    return {
      status: "identity-ambiguous",
      selectedQid: null,
      selectionReasons: ["multiple-identity-gate-pass-entities-have-exact-label-or-alias-match"],
      identityAlternatives: strong.map((entity) => entity.qid),
    };
  }
  if (viable.length === 1) {
    return {
      status: "conditional-manual",
      selectedQid: viable[0].qid,
      selectionReasons: ["unique-identity-gate-pass-without-exact-label-or-alias-match"],
      identityAlternatives: [],
    };
  }
  if (viable.length > 1) {
    return {
      status: "identity-ambiguous",
      selectedQid: null,
      selectionReasons: ["multiple-identity-gate-pass-entities-remain"],
      identityAlternatives: viable.map((entity) => entity.qid),
    };
  }
  const nameMatches = entityEvidence.filter((entity) => entity.nameEvidence.exactNameOrAliasMatch);
  const statusSource = nameMatches.length > 0 ? nameMatches : entityEvidence;
  const statuses = statusSource.map(preliminaryStatusPriority);
  const statusOrder = ["duplicate", "out-of-scope", "country-failed", "coordinate-failed", "identity-ambiguous"];
  const status = statusOrder.find((value) => statuses.includes(value)) || "identity-ambiguous";
  return {
    status,
    selectedQid: null,
    selectionReasons: [entityEvidence.length === 0 ? "wikidata-search-returned-no-exact-entities" : `no-identity-gate-pass-entity:${status}`],
    identityAlternatives: stableUnique(statusSource.map((entity) => entity.qid)),
  };
}

function directParentEvidence(expectedCityQid, p131Projection, p276Projection, cityQidSet) {
  const directP131Qids = p131Projection.unionClaims;
  const directP276Qids = p276Projection.unionClaims;
  const directLocationQids = stableUnique([...directP131Qids, ...directP276Qids]);
  const conflictingApprovedCityQids = directLocationQids
    .filter((value) => cityQidSet.has(value) && value !== expectedCityQid);
  const directP131ToCity = directP131Qids.includes(expectedCityQid);
  const directP276ToCity = directP276Qids.includes(expectedCityQid);
  const accepted = (directP131ToCity || directP276ToCity) && conflictingApprovedCityQids.length === 0;
  return {
    directP131ToCity,
    directP276ToCity,
    directLocationQids,
    conflictingApprovedCityQids,
    parentEvidenceLevel: accepted ? "direct" : "unconfirmed",
    parentPathDepth: accepted ? 0 : null,
    parentPathQids: accepted ? [expectedCityQid] : [],
    transitiveQueryPerformed: false,
    accepted,
  };
}

function parentPathEvidenceByPair(bindings, pairs, cityQid) {
  const pairQids = new Set(pairs.map(({ qid }) => qid));
  const pathsByQid = new Map(pairs.map(({ qid }) => [qid, []]));
  for (const binding of bindings || []) {
    const qid = qidFromUri(binding.item?.value);
    const approvedCityQid = qidFromUri(binding.approvedCity?.value);
    const pathType = binding.pathType?.value;
    const depth = Number(binding.depth?.value);
    if (!pairQids.has(qid) || approvedCityQid !== cityQid) continue;
    if (!["administrative-path", "location-path"].includes(pathType)) continue;
    if (![1, 2, 3].includes(depth)) continue;
    const orderedNodes = [binding.node1, binding.node2, binding.node3]
      .map((node) => qidFromUri(node?.value))
      .filter(Boolean);
    if (orderedNodes.at(-1) !== cityQid) orderedNodes.push(cityQid);
    pathsByQid.get(qid).push({
      parentEvidenceLevel: pathType,
      parentPathDepth: depth,
      parentPathQids: orderedNodes,
    });
  }
  return new Map([...pathsByQid.entries()].map(([qid, paths]) => {
    const selectedPath = [...paths].sort((left, right) => {
      const leftLevel = left.parentEvidenceLevel === "administrative-path" ? 0 : 1;
      const rightLevel = right.parentEvidenceLevel === "administrative-path" ? 0 : 1;
      return leftLevel - rightLevel || left.parentPathDepth - right.parentPathDepth
        || left.parentPathQids.join("|").localeCompare(right.parentPathQids.join("|"), "en");
    })[0];
    return [qid, selectedPath
      ? { ...selectedPath, transitiveQueryPerformed: true, accepted: true }
      : {
        parentEvidenceLevel: "unconfirmed",
        parentPathDepth: null,
        parentPathQids: [],
        transitiveQueryPerformed: true,
        accepted: false,
      }];
  }));
}

function buildCityParentPlans(candidates) {
  const cityOrder = [...new Map(candidates.map((candidate) => [candidate.input.cityQid, {
    city: candidate.input.city,
    cityQid: candidate.input.cityQid,
  }])).values()];
  return cityOrder.map(({ city, cityQid }) => {
    const cityCandidates = candidates.filter((candidate) => candidate.input.cityQid === cityQid);
    const selectedCandidates = cityCandidates.filter((candidate) => candidate.selectedQid);
    const directCandidates = selectedCandidates.filter((candidate) => candidate.candidateEntities
      .find((entity) => entity.qid === candidate.selectedQid)?.parentEvidence.accepted);
    const queryPairs = selectedCandidates
      .filter((candidate) => !directCandidates.includes(candidate))
      .map((candidate) => ({ qid: candidate.selectedQid, cityQid }));
    return {
      city,
      cityQid,
      candidateCount: cityCandidates.length,
      selectedQidCount: selectedCandidates.length,
      directParentResolvedCount: directCandidates.length,
      transitiveParentQueriedCount: queryPairs.length,
      transitiveParentResolvedCount: 0,
      parentFailedCount: 0,
      queryPairs,
      queryAttempted: false,
      querySucceeded: false,
      skippedReason: queryPairs.length === 0
        ? (selectedCandidates.length > 0 ? "direct-evidence-sufficient" : "no-selected-qid")
        : null,
    };
  });
}

async function writeAtomic(filePath, contents, fsOperations = {
  mkdir,
  writeFile,
  rename,
  rm,
}) {
  await fsOperations.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await fsOperations.writeFile(temporaryPath, contents, "utf8");
    await fsOperations.rename(temporaryPath, filePath);
  } finally {
    await fsOperations.rm(temporaryPath, { force: true });
  }
}

function createCounters({
  requestRetries = DEFAULT_REQUEST_RETRIES,
  searchDelayMs = DEFAULT_SEARCH_DELAY_MS,
  batchDelayMs = DEFAULT_BATCH_DELAY_MS,
  timeoutMs = 60_000,
} = {}) {
  return {
    requestRetriesConfigured: requestRetries,
    searchDelayMs,
    batchDelayMs,
    timeoutMs,
    attemptedRequestCount: 0,
    successfulRequestCount: 0,
    httpRequestCount: 0,
    http429Count: 0,
    timeoutCount: 0,
    retryCount: 0,
    totalThrottleWaitMs: 0,
    searchThrottleWaitMs: 0,
    batchThrottleWaitMs: 0,
    retryWaitMs: 0,
    failedStage: null,
    failedCandidate: null,
    lastHttpStatus: null,
    searchRequestCount: 0,
    searchCacheHitCount: 0,
    searchMaxConcurrency: 0,
    exactEntityRequestCount: 0,
    exactEntityQidCount: 0,
    candidateExactEntityBatchCount: 0,
    projectionSparqlRequestCount: 0,
    parentSparqlRequestCount: 0,
    municipalitySparqlRequestCount: 0,
    institutionBuildingSparqlRequestCount: 0,
    institutionBuildingCandidates: [],
    relationDiscoveryRequests: 0,
    relationDiscoverySucceeded: 0,
    relationDiscoveryTimedOut: 0,
    relatedEntityQidCount: 0,
    relatedEntityExactBatches: 0,
    relatedEntityParentRequests: 0,
    relatedEntityParentSucceeded: 0,
    relatedEntityParentTimedOut: 0,
    candidateLevelEvidenceIssues: 0,
    fatalErrors: 0,
    parentBatchesAttempted: 0,
    parentBatchesSucceeded: 0,
    parentBatchesSkippedDirectEvidence: 0,
    parentBatchesSkippedNoSelectedQid: 0,
    sparqlBindingCount: 0,
    evidenceNodeRequestCount: 0,
    typeEntityRequestCount: 0,
    typeLabelRequestCount: 0,
    typeLabelQidCount: 0,
    cityParentProgress: [],
  };
}

async function buildEvidence({
  requestRetries = DEFAULT_REQUEST_RETRIES,
  searchDelayMs = DEFAULT_SEARCH_DELAY_MS,
  batchDelayMs = DEFAULT_BATCH_DELAY_MS,
  timeoutMs = 60_000,
} = {}) {
  const counters = createCounters({ requestRetries, searchDelayMs, batchDelayMs, timeoutMs });
  const requestContext = { requestRetries, timeoutMs, counters };
  const headers = { Accept: "application/json", "User-Agent": USER_AGENT };
  const protectedScope = await loadProtectedEntityScope();

  const searchResponses = await collectSearchResponsesSerial(CANDIDATES, {
    searchDelayMs,
    counters,
    requestSearch: (candidate, term) => fetchJsonWithRetry(
      searchUrl(term),
      { headers },
      requestContext,
      { stage: "search", candidate: candidate.name },
    ),
  });

  const allSearchQids = stableUnique(searchResponses.flatMap((search) => search.results.map((result) => result.qid)));
  const entities = {};
  await processBatches(uniqueQidBatches(allSearchQids), {
    batchDelayMs,
    counters,
    processBatch: async (qidBatch) => {
      counters.exactEntityRequestCount += 1;
      const payload = await fetchJsonWithRetry(
        entityUrl(qidBatch),
        { headers },
        requestContext,
        { stage: "exact-entity-batch", candidate: null },
      );
      for (const [responseMapKey, entity] of Object.entries(payload.entities || {})) {
        entities[responseMapKey] = pruneEntity(entity, responseMapKey);
      }
    },
  });

  const sparqlProjectionByQid = new Map(allSearchQids.map((qid) => [qid, {
    P17: [], P31: [], P131: [], P276: [], P625: [], sparqlItemQids: [],
  }]));
  await processBatches(chunks(allSearchQids, SPARQL_BATCH_SIZE), {
    batchDelayMs,
    counters,
    processBatch: async (qidBatch) => {
      counters.projectionSparqlRequestCount += 1;
      const payload = await sparqlRequest(
        projectionQuery(qidBatch),
        requestContext,
        { stage: "sparql-projection-batch", candidate: null },
      );
      counters.sparqlBindingCount += payload?.results?.bindings?.length || 0;
      for (const binding of payload?.results?.bindings || []) {
        const itemQid = qidFromUri(binding.item?.value);
        const property = binding.property?.value;
        if (!sparqlProjectionByQid.has(itemQid)) continue;
        sparqlProjectionByQid.get(itemQid).sparqlItemQids.push(itemQid);
        if (property === "ENTITY") continue;
        if (!["P17", "P31", "P131", "P276", "P625"].includes(property)) continue;
        if (property === "P625") {
          if (binding.value?.value) sparqlProjectionByQid.get(itemQid).P625.push(binding.value.value);
        } else {
          const valueQid = qidFromUri(binding.value?.value);
          if (valueQid) sparqlProjectionByQid.get(itemQid)[property].push(valueQid);
        }
      }
    },
  });
  for (const projection of sparqlProjectionByQid.values()) {
    for (const property of ["P17", "P31", "P131", "P276", "P625", "sparqlItemQids"]) projection[property] = stableUnique(projection[property]);
  }

  const locationQids = stableUnique(allSearchQids.flatMap((qid) => {
    const entity = entities[qid];
    const sparql = sparqlProjectionByQid.get(qid);
    return [...claimQids(entity, "P131"), ...claimQids(entity, "P276"), ...(sparql?.P131 || []), ...(sparql?.P276 || [])];
  }));
  const locationEntities = {};
  await processBatches(uniqueQidBatches(locationQids), {
    batchDelayMs,
    counters,
    processBatch: async (qidBatch) => {
      counters.evidenceNodeRequestCount += 1;
      const payload = await fetchJsonWithRetry(
        entityUrl(qidBatch, ["en"]),
        { headers },
        requestContext,
        { stage: "location-entity-batch", candidate: null },
      );
      for (const [responseMapKey, entity] of Object.entries(payload.entities || {})) {
        locationEntities[responseMapKey] = pruneEntity(entity, responseMapKey);
      }
    },
  });

  const typeQids = stableUnique([
    ...allSearchQids.flatMap((qid) => [...claimQids(entities[qid], "P31"), ...(sparqlProjectionByQid.get(qid)?.P31 || [])]),
    ...Object.values(locationEntities).flatMap((entity) => claimQids(entity, "P31")),
  ]);
  const typeEntities = {};
  await processBatches(chunks(typeQids, SPARQL_BATCH_SIZE), {
    batchDelayMs,
    counters,
    processBatch: async (qidBatch) => {
      counters.typeLabelRequestCount += 1;
      const payload = await sparqlRequest(
        typeLabelQuery(qidBatch),
        requestContext,
        { stage: "sparql-type-label-batch", candidate: null },
      );
      counters.sparqlBindingCount += payload?.results?.bindings?.length || 0;
      for (const binding of payload?.results?.bindings || []) {
        const typeQid = qidFromUri(binding.type?.value);
        if (!typeQid) continue;
        typeEntities[typeQid] = {
          responseMapKey: typeQid,
          id: typeQid,
          labelEn: binding.labelEn?.value || "",
          descriptionEn: binding.descriptionEn?.value || "",
        };
      }
    },
  });

  const countryQidSet = new Set(protectedScope.countryQids);
  const cityQidSet = new Set(protectedScope.cityQids);
  const pilotPoiQidSet = new Set(protectedScope.pilotPoiQids);
  const blockingTypeQidSet = new Set(BLOCKING_TYPE_QIDS);

  const candidates = CANDIDATES.map((candidate, candidateIndex) => {
    const search = searchResponses[candidateIndex];
    const candidateNameKeys = new Set([candidate.name, ...candidate.searchTerms].map(normalizeName));
    const candidateEntities = search.results.map((searchResult) => {
      const qid = searchResult.qid;
      const entity = entities[qid];
      const sparql = sparqlProjectionByQid.get(qid) || {
        P17: [], P31: [], P131: [], P276: [], P625: [], sparqlItemQids: [],
      };
      const countryProjection = compareProjections(claimQids(entity, "P17"), sparql.P17);
      const p31Projection = compareProjections(claimQids(entity, "P31"), sparql.P31);
      const p131Projection = compareProjections(claimQids(entity, "P131"), sparql.P131);
      const p276Projection = compareProjections(claimQids(entity, "P276"), sparql.P276);
      const directParent = directParentEvidence(candidate.cityQid, p131Projection, p276Projection, cityQidSet);
      const knownCountryClaims = countryProjection.unionClaims.filter((value) => countryQidSet.has(value));
      const conflictingCountryQids = knownCountryClaims.filter((value) => value !== candidate.countryQid);
      const countryAccepted = countryProjection.unionClaims.includes(candidate.countryQid) && conflictingCountryQids.length === 0;
      const coordinateEvidence = coordinatesEvidence(entity, sparql.P625);
      const outOfScopeTypeQids = p31Projection.unionClaims.filter((value) => blockingTypeQidSet.has(value));
      const duplicateKinds = [
        ...(countryQidSet.has(qid) ? ["country-qid-overlap"] : []),
        ...(cityQidSet.has(qid) ? ["city-qid-overlap"] : []),
        ...(pilotPoiQidSet.has(qid) ? ["pilot-poi-qid-overlap"] : []),
      ];
      const names = entityNames(entity);
      const exactNameOrAliasMatch = names.some((name) => candidateNameKeys.has(normalizeName(name)));
      const typeLabels = p31Projection.unionClaims.map((typeQid) => typeEntities[typeQid]?.labelEn).filter(Boolean);
      const exactEntityAnchor = entity?.responseMapKey === qid
        && entity?.id === qid
        && sparql.sparqlItemQids.includes(qid);
      const identityGatePass = exactEntityAnchor
        && countryAccepted
        && coordinateEvidence.accepted
        && outOfScopeTypeQids.length === 0
        && duplicateKinds.length === 0;
      return {
        qid,
        searchEvidence: searchResult,
        exactEntityAnchor: {
          accepted: exactEntityAnchor,
          apiResponseMapKey: entity?.responseMapKey || "",
          apiEntityId: entity?.id || "",
          sparqlItemQid: sparql.sparqlItemQids.includes(qid) ? qid : "",
        },
        nameEvidence: {
          exactNameOrAliasMatch,
          entityNames: names,
          labelEn: entity?.labels?.en?.value || "",
          descriptionEn: entity?.descriptions?.en?.value || "",
        },
        countryEvidence: {
          expectedCountryQid: candidate.countryQid,
          sourceProjection: countryProjection,
          conflictingCountryQids,
          accepted: countryAccepted,
        },
        parentEvidence: {
          expectedCityQid: candidate.cityQid,
          p131: p131Projection,
          p276: p276Projection,
          ...directParent,
          directLocationEntities: directParent.directLocationQids.map((value) => ({
            qid: value,
            labelEn: locationEntities[value]?.labels?.en?.value || "",
            descriptionEn: locationEntities[value]?.descriptions?.en?.value || "",
            typeQids: claimQids(locationEntities[value], "P31"),
          })),
        },
        coordinateEvidence,
        p31Evidence: {
          sourceProjection: p31Projection,
          sortedTypeQids: p31Projection.unionClaims,
          p31Key: p31Projection.unionClaims.join("|"),
          typeEntities: p31Projection.unionClaims.map((typeQid) => ({
            qid: typeQid,
            labelEn: typeEntities[typeQid]?.labelEn || "",
            descriptionEn: typeEntities[typeQid]?.descriptionEn || "",
          })),
        },
        identityEvidence: {
          requestedIdentityHint: candidate.identityHint,
          categories: identityCategory(typeLabels, candidate.identityHint),
        },
        outOfScopeEvidence: {
          blockingTypeQids: outOfScopeTypeQids,
          outOfScope: outOfScopeTypeQids.length > 0,
        },
        duplicateEvidence: {
          duplicateKinds,
          duplicate: duplicateKinds.length > 0,
        },
        identityGatePass,
        hardGatePass: identityGatePass && directParent.accepted,
        apiEntity: entity,
      };
    }).sort((left, right) => left.qid.localeCompare(right.qid, "en"));
    const selection = selectCandidateIdentityBeforeParent(candidate, candidateEntities);
    return {
      input: candidate,
      search,
      ...selection,
      preParentStatus: selection.status,
      candidateEntities,
    };
  });

  const cityParentBatches = buildCityParentPlans(candidates);
  const parentPathByPair = new Map();
  const syncCityParentProgress = () => {
    counters.cityParentProgress = cityParentBatches.map((batch) => ({
      city: batch.city,
      cityQid: batch.cityQid,
      candidateCount: batch.candidateCount,
      selectedQidCount: batch.selectedQidCount,
      directParentResolvedCount: batch.directParentResolvedCount,
      transitiveParentQueriedCount: batch.transitiveParentQueriedCount,
      transitiveParentResolvedCount: batch.transitiveParentResolvedCount,
      parentFailedCount: batch.parentFailedCount,
      queryAttempted: batch.queryAttempted,
      querySucceeded: batch.querySucceeded,
      skippedReason: batch.skippedReason,
      queryCandidateQids: batch.queryPairs.map(({ qid }) => qid),
    }));
  };
  for (const batch of cityParentBatches) {
    if (batch.queryPairs.length > 4) throw new Error(`parent-city-batch-too-large:${batch.city}:${batch.queryPairs.length}`);
    if (batch.skippedReason === "direct-evidence-sufficient") counters.parentBatchesSkippedDirectEvidence += 1;
    if (batch.skippedReason === "no-selected-qid") counters.parentBatchesSkippedNoSelectedQid += 1;
  }
  syncCityParentProgress();

  const queriedCityBatches = cityParentBatches.filter((batch) => batch.queryPairs.length > 0);
  for (let batchIndex = 0; batchIndex < queriedCityBatches.length; batchIndex += 1) {
    const batch = queriedCityBatches[batchIndex];
    batch.queryAttempted = true;
    counters.parentBatchesAttempted += 1;
    counters.parentSparqlRequestCount += 1;
    syncCityParentProgress();
    const payload = await sparqlRequest(
      parentQueryForCityBatch(batch),
      requestContext,
      { stage: "sparql-parent-city-batch", candidate: batch.city },
    );
    counters.sparqlBindingCount += payload?.results?.bindings?.length || 0;
    const batchEvidence = parentPathEvidenceByPair(payload?.results?.bindings || [], batch.queryPairs, batch.cityQid);
    for (const [qid, evidence] of batchEvidence.entries()) {
      parentPathByPair.set(`${qid}|${batch.cityQid}`, evidence);
    }
    batch.transitiveParentResolvedCount = [...batchEvidence.values()].filter((evidence) => evidence.accepted).length;
    batch.querySucceeded = true;
    counters.parentBatchesSucceeded += 1;
    syncCityParentProgress();
    if (batchIndex < queriedCityBatches.length - 1) {
      await waitWithStats(batchDelayMs, counters, "batch");
    }
  }

  for (const candidate of candidates) {
    if (!candidate.selectedQid) continue;
    const selectedEntity = candidate.candidateEntities.find((entity) => entity.qid === candidate.selectedQid);
    if (!selectedEntity) throw new Error(`selected-entity-not-found:${candidate.input.name}:${candidate.selectedQid}`);
    if (!selectedEntity.parentEvidence.accepted) {
      const transitiveEvidence = parentPathByPair.get(`${candidate.selectedQid}|${candidate.input.cityQid}`) || {
        parentEvidenceLevel: "unconfirmed",
        parentPathDepth: null,
        parentPathQids: [],
        transitiveQueryPerformed: true,
        accepted: false,
      };
      Object.assign(selectedEntity.parentEvidence, transitiveEvidence);
    }
    selectedEntity.hardGatePass = selectedEntity.identityGatePass && selectedEntity.parentEvidence.accepted;
    if (!selectedEntity.parentEvidence.accepted) {
      candidate.status = "parent-failed";
      candidate.selectionReasons.push("selected-identity-did-not-reach-approved-city-within-fixed-parent-depth");
    } else {
      candidate.status = candidate.preParentStatus;
      candidate.selectionReasons.push(`parent-evidence:${selectedEntity.parentEvidence.parentEvidenceLevel}`);
    }
  }
  for (const batch of cityParentBatches) {
    const cityCandidates = candidates.filter((candidate) => candidate.input.cityQid === batch.cityQid && candidate.selectedQid);
    batch.parentFailedCount = cityCandidates.filter((candidate) => !candidate.candidateEntities
      .find((entity) => entity.qid === candidate.selectedQid)?.parentEvidence.accepted).length;
  }
  syncCityParentProgress();

  const selectedByQid = new Map();
  const internalDuplicates = [];
  for (const candidate of candidates) {
    if (!candidate.selectedQid) continue;
    if (selectedByQid.has(candidate.selectedQid)) {
      internalDuplicates.push({
        qid: candidate.selectedQid,
        candidateInputIndexes: [selectedByQid.get(candidate.selectedQid).input.inputIndex, candidate.input.inputIndex].sort((left, right) => left - right),
        candidateNames: [selectedByQid.get(candidate.selectedQid).input.name, candidate.input.name].sort((left, right) => left.localeCompare(right, "en")),
      });
    } else {
      selectedByQid.set(candidate.selectedQid, candidate);
    }
  }
  for (const duplicate of internalDuplicates) {
    for (const candidate of candidates.filter((value) => value.selectedQid === duplicate.qid)) {
      candidate.status = "duplicate";
      candidate.selectionReasons.push("selected-qid-used-by-multiple-candidate-names");
    }
  }

  const usableCandidates = candidates.filter((candidate) => ["pass", "conditional-manual"].includes(candidate.status));
  const p31StatsByKey = new Map();
  for (const candidate of usableCandidates) {
    const entity = candidate.candidateEntities.find((value) => value.qid === candidate.selectedQid);
    const key = entity.p31Evidence.p31Key;
    const current = p31StatsByKey.get(key) || {
      p31Key: key,
      candidateCount: 0,
      examplePois: [],
      typeQids: entity.p31Evidence.sortedTypeQids,
      typeEntities: entity.p31Evidence.typeEntities,
      suggestedDisposition: "unresolved",
      reason: "Evidence Gate records exact numeric combinations; classifier policy is not implemented in this checkpoint.",
    };
    current.candidateCount += 1;
    current.examplePois.push(candidate.input.name);
    current.examplePois = stableUnique(current.examplePois);
    p31StatsByKey.set(key, current);
  }

  const cityRecommendations = stableUnique(CANDIDATES.map((candidate) => candidate.city)).map((city) => {
    const cityCandidates = candidates.filter((candidate) => candidate.input.city === city);
    const primaries = cityCandidates.filter((candidate) => candidate.input.slot === "primary");
    const backups = cityCandidates.filter((candidate) => candidate.input.slot === "backup");
    const primaryUsable = primaries.filter((candidate) => ["pass", "conditional-manual"].includes(candidate.status));
    const backupUsable = backups.filter((candidate) => ["pass", "conditional-manual"].includes(candidate.status));
    return {
      city,
      cityQid: cityCandidates[0].input.cityQid,
      primaryCandidates: primaries.map((candidate) => ({ name: candidate.input.name, selectedQid: candidate.selectedQid, status: candidate.status })),
      backupCandidates: backups.map((candidate) => ({ name: candidate.input.name, selectedQid: candidate.selectedQid, status: candidate.status })),
      usablePrimaryCount: primaryUsable.length,
      usableBackupCount: backupUsable.length,
      hasThreePrimaryAndOneBackup: primaryUsable.length === 3 && backupUsable.length === 1,
    };
  });

  const retrievedAt = new Date().toISOString();
  const raw = {
    schemaVersion: "route-v2-poi-baseline-p1b-batch01-candidate-evidence-v2",
    evidenceGateOnly: true,
    canonicalPublishInputApproved: false,
    retrievedAt,
    source: {
      provider: "wikidata-search-api+entity-api+sparql",
      endpoints: [ENTITY_API_ENDPOINT, SPARQL_ENDPOINT],
      userAgent: USER_AGENT,
      ...counters,
      searchResultCount: searchResponses.reduce((total, search) => total + search.resultCount, 0),
      uniqueSearchQidCount: allSearchQids.length,
      exactEntityCount: Object.keys(entities).length,
      sparqlProjectionBindingCount: [...sparqlProjectionByQid.values()].reduce((total, projection) => total
        + projection.P17.length + projection.P31.length + projection.P131.length + projection.P276.length
        + projection.P625.length, 0),
      parentPairCount: parentPathByPair.size,
      locationEntityCount: Object.keys(locationEntities).length,
      typeEntityCount: Object.keys(typeEntities).length,
    },
    scope: {
      inputCandidateCount: CANDIDATES.length,
      cityCount: stableUnique(CANDIDATES.map((candidate) => candidate.cityQid)).length,
      primaryCandidateCount: CANDIDATES.filter((candidate) => candidate.slot === "primary").length,
      backupCandidateCount: CANDIDATES.filter((candidate) => candidate.slot === "backup").length,
      countryCodes: stableUnique(CANDIDATES.map((candidate) => candidate.countryCode)),
      excludesAustralia: CANDIDATES.every((candidate) => candidate.countryCode !== "AU"),
    },
    protectedEntityScope: {
      countryCount: protectedScope.countries.length,
      cityCount: protectedScope.cities.length,
      pilotPoiCount: protectedScope.pilotPois.length,
      countryQids: protectedScope.countryQids,
      cityQids: protectedScope.cityQids,
      pilotPoiQids: protectedScope.pilotPoiQids,
    },
    blockingTypeQids: BLOCKING_TYPE_QIDS,
    parentBatchSummary: counters.cityParentProgress,
    candidates,
    duplicateChecks: {
      internalSelectedQidDuplicates: internalDuplicates,
      countryPoiOverlaps: usableCandidates.filter((candidate) => countryQidSet.has(candidate.selectedQid)).map((candidate) => candidate.selectedQid),
      cityPoiOverlaps: usableCandidates.filter((candidate) => cityQidSet.has(candidate.selectedQid)).map((candidate) => candidate.selectedQid),
      pilotPoiOverlaps: usableCandidates.filter((candidate) => pilotPoiQidSet.has(candidate.selectedQid)).map((candidate) => candidate.selectedQid),
    },
    evidenceGateSummary: {
      byStatus: Object.fromEntries(stableUnique(candidates.map((candidate) => candidate.status)).map((status) => [
        status,
        candidates.filter((candidate) => candidate.status === status).length,
      ])),
      selectedQidCount: candidates.filter((candidate) => candidate.selectedQid).length,
      unresolvedIdentityCount: candidates.filter((candidate) => !candidate.selectedQid).length,
      passCount: candidates.filter((candidate) => candidate.status === "pass").length,
      conditionalManualCount: candidates.filter((candidate) => candidate.status === "conditional-manual").length,
      blockingCandidateCount: candidates.filter((candidate) => !["pass", "conditional-manual"].includes(candidate.status)).length,
      directParentCount: candidates.filter((candidate) => candidate.candidateEntities
        .find((entity) => entity.qid === candidate.selectedQid)?.parentEvidence.parentEvidenceLevel === "direct").length,
      transitiveParentCount: candidates.filter((candidate) => ["administrative-path", "location-path"].includes(candidate.candidateEntities
        .find((entity) => entity.qid === candidate.selectedQid)?.parentEvidence.parentEvidenceLevel)).length,
      parentFailedCount: candidates.filter((candidate) => candidate.status === "parent-failed").length,
      countryPassCount: candidates.filter((candidate) => candidate.candidateEntities
        .find((entity) => entity.qid === candidate.selectedQid)?.countryEvidence.accepted).length,
      countryFailCount: candidates.filter((candidate) => candidate.selectedQid && !candidate.candidateEntities
        .find((entity) => entity.qid === candidate.selectedQid)?.countryEvidence.accepted).length,
      coordinatePassCount: candidates.filter((candidate) => candidate.candidateEntities
        .find((entity) => entity.qid === candidate.selectedQid)?.coordinateEvidence.accepted).length,
      coordinateFailCount: candidates.filter((candidate) => candidate.selectedQid && !candidate.candidateEntities
        .find((entity) => entity.qid === candidate.selectedQid)?.coordinateEvidence.accepted).length,
    },
    numericP31PolicyEvidence: {
      keyAlgorithm: "[...new Set(qids)].sort().join('|')",
      classifierImplemented: false,
      exactCombinationCount: p31StatsByKey.size,
      combinations: [...p31StatsByKey.values()].sort((left, right) => left.p31Key.localeCompare(right.p31Key, "en")),
      knownPoiTypeQids: stableUnique([...p31StatsByKey.values()].flatMap((entry) => entry.typeQids)),
      compatibleExactCombinationKeys: [],
      blockingTypeQids: BLOCKING_TYPE_QIDS,
      unresolvedTypeQids: stableUnique([...p31StatsByKey.values()].flatMap((entry) => entry.typeQids)),
    },
    candidateAvailability: {
      cityRecommendations,
      everyCityHasThreePrimaryAndOneBackup: cityRecommendations.every((city) => city.hasThreePrimaryAndOneBackup),
      thirtyPlusTenFrozen: false,
      classifierPolicyImplemented: false,
      automaticReplacementPerformed: false,
    },
  };

  const contents = serializeJson(raw);
  return {
    raw,
    contents,
    sha256: crypto.createHash("sha256").update(contents).digest("hex"),
  };
}

async function persistCompletedEvidence(build, writer) {
  const result = await build();
  await writer(result.contents);
  return result;
}

async function refreshEvidence(options = {}) {
  return persistCompletedEvidence(
    () => buildEvidence(options),
    (contents) => writeAtomic(RAW_PATH, contents),
  );
}

function knownQidSearchEvidence(candidate, qid) {
  return {
    qid,
    labels: [],
    descriptions: [],
    aliases: [],
    searchTerms: [],
    bestSearchRank: null,
    evidenceSource: candidate.knownQids.includes(qid) ? "known-qid" : "search-result",
  };
}

function selectSupplementIdentity(candidate, candidateEntities) {
  if (candidate.operation === "parent-only-requery") {
    const selected = candidateEntities.find((entity) => entity.qid === candidate.lockedSelectedQid);
    if (!selected) {
      return {
        status: "identity-ambiguous",
        selectedQid: null,
        selectionReasons: ["locked-first-round-qid-not-returned-by-exact-entity-api"],
        identityAlternatives: [],
      };
    }
    const hardStatus = selected.identityGatePass ? null : preliminaryStatusPriority(selected);
    return {
      status: hardStatus || (["pass", "conditional-manual"].includes(candidate.basePreParentStatus)
        ? candidate.basePreParentStatus
        : "conditional-manual"),
      selectedQid: candidate.lockedSelectedQid,
      selectionReasons: ["selected-qid-locked-from-first-round-raw", `base-pre-parent-status:${candidate.basePreParentStatus || "unknown"}`],
      identityAlternatives: [],
    };
  }
  if (candidate.operation === "manual-identity-review") {
    const selected = candidateEntities.find((entity) => entity.qid === candidate.preferredKnownQid);
    if (!selected || !selected.exactEntityAnchor.accepted) {
      return {
        status: "identity-ambiguous",
        selectedQid: null,
        selectionReasons: ["preferred-known-qid-not-confirmed-by-exact-api-and-sparql"],
        identityAlternatives: stableUnique(candidateEntities.map((entity) => entity.qid)),
      };
    }
    const hardStatus = selected.identityGatePass ? null : preliminaryStatusPriority(selected);
    return {
      status: hardStatus || "conditional-manual",
      selectedQid: selected.qid,
      selectionReasons: [
        `manual-identity-policy:${candidate.manualDecision}`,
        `preferred-known-qid:${selected.qid}`,
        "selection-does-not-use-search-rank",
        ...(hardStatus ? [`manual-identity-selected-but-gate-remains:${hardStatus}`] : ["manual-identity-requires-review"]),
      ],
      identityAlternatives: stableUnique(candidateEntities
        .filter((entity) => entity.qid !== selected.qid)
        .map((entity) => entity.qid)),
    };
  }
  return selectCandidateIdentityBeforeParent(candidate, candidateEntities);
}

function buildSupplementEntityEvidence({
  candidate,
  qid,
  searchResult,
  entities,
  sparqlProjectionByQid,
  typeEntities,
  protectedScope,
}) {
  const entity = entities[qid];
  const sparql = sparqlProjectionByQid.get(qid) || {
    P17: [], P31: [], P131: [], P276: [], P625: [], sparqlItemQids: [],
  };
  const countryProjection = compareProjections(claimQids(entity, "P17"), sparql.P17);
  const p31Projection = compareProjections(claimQids(entity, "P31"), sparql.P31);
  const p131Projection = compareProjections(claimQids(entity, "P131"), sparql.P131);
  const p276Projection = compareProjections(claimQids(entity, "P276"), sparql.P276);
  const countryQidSet = new Set(protectedScope.countryQids);
  const cityQidSet = new Set(protectedScope.cityQids);
  const pilotPoiQidSet = new Set(protectedScope.pilotPoiQids);
  const baseCandidateQidSet = new Set(protectedScope.baseCandidateQids || []);
  const supplement01CandidateQidSet = new Set(protectedScope.supplement01CandidateQids || []);
  const supplement02CandidateQidSet = new Set(protectedScope.supplement02CandidateQids || []);
  const blockingTypeQidSet = new Set(BLOCKING_TYPE_QIDS);
  const directParent = directParentEvidence(candidate.cityQid, p131Projection, p276Projection, cityQidSet);
  const knownCountryClaims = countryProjection.unionClaims.filter((value) => countryQidSet.has(value));
  const conflictingCountryQids = knownCountryClaims.filter((value) => value !== candidate.countryQid);
  const countryAccepted = countryProjection.unionClaims.includes(candidate.countryQid) && conflictingCountryQids.length === 0;
  const coordinateEvidence = coordinatesEvidence(entity, sparql.P625);
  const outOfScopeTypeQids = p31Projection.unionClaims.filter((value) => blockingTypeQidSet.has(value));
  const duplicateKinds = [
    ...(countryQidSet.has(qid) ? ["country-qid-overlap"] : []),
    ...(cityQidSet.has(qid) ? ["city-qid-overlap"] : []),
    ...(pilotPoiQidSet.has(qid) ? ["pilot-poi-qid-overlap"] : []),
    ...(baseCandidateQidSet.has(qid) ? ["base-candidate-qid-overlap"] : []),
    ...(supplement01CandidateQidSet.has(qid) ? ["supplement01-candidate-qid-overlap"] : []),
    ...(supplement02CandidateQidSet.has(qid) ? ["supplement02-candidate-qid-overlap"] : []),
  ];
  const names = entityNames(entity);
  const candidateNameKeys = new Set([candidate.name, ...candidate.searchTerms].map(normalizeName));
  const exactNameOrAliasMatch = names.some((name) => candidateNameKeys.has(normalizeName(name)));
  const typeLabels = p31Projection.unionClaims.map((typeQid) => typeEntities[typeQid]?.labelEn).filter(Boolean);
  const exactEntityAnchor = entity?.responseMapKey === qid
    && entity?.id === qid
    && sparql.sparqlItemQids.includes(qid);
  const identityGatePass = exactEntityAnchor
    && countryAccepted
    && coordinateEvidence.accepted
    && outOfScopeTypeQids.length === 0
    && duplicateKinds.length === 0;
  return {
    qid,
    searchEvidence: searchResult,
    exactEntityAnchor: {
      accepted: exactEntityAnchor,
      apiResponseMapKey: entity?.responseMapKey || "",
      apiEntityId: entity?.id || "",
      sparqlItemQid: sparql.sparqlItemQids.includes(qid) ? qid : "",
    },
    nameEvidence: {
      exactNameOrAliasMatch,
      entityNames: names,
      labelEn: entity?.labels?.en?.value || "",
      descriptionEn: entity?.descriptions?.en?.value || "",
    },
    countryEvidence: {
      expectedCountryQid: candidate.countryQid,
      sourceProjection: countryProjection,
      conflictingCountryQids,
      accepted: countryAccepted,
    },
    parentEvidence: {
      expectedCityQid: candidate.cityQid,
      p131: p131Projection,
      p276: p276Projection,
      ...directParent,
      directLocationEntities: directParent.directLocationQids.map((value) => ({
        qid: value,
        labelEn: entities[value]?.labels?.en?.value || "",
        descriptionEn: entities[value]?.descriptions?.en?.value || "",
        typeQids: claimQids(entities[value], "P31"),
      })),
      municipalityCityEvidence: null,
      institutionBuildingEvidence: [],
      requiresManualReview: false,
      coordinateDistanceUsed: false,
    },
    coordinateEvidence,
    p31Evidence: {
      sourceProjection: p31Projection,
      sortedTypeQids: p31Projection.unionClaims,
      p31Key: p31Projection.unionClaims.join("|"),
      typeEntities: p31Projection.unionClaims.map((typeQid) => ({
        qid: typeQid,
        labelEn: typeEntities[typeQid]?.labelEn || "",
        descriptionEn: typeEntities[typeQid]?.descriptionEn || "",
      })),
    },
    identityEvidence: {
      requestedIdentityHint: candidate.identityHint,
      categories: identityCategory(typeLabels, candidate.identityHint),
      manualDecision: candidate.manualDecision,
    },
    outOfScopeEvidence: {
      blockingTypeQids: outOfScopeTypeQids,
      outOfScope: outOfScopeTypeQids.length > 0,
    },
    duplicateEvidence: {
      duplicateKinds,
      duplicate: duplicateKinds.length > 0,
    },
    identityGatePass,
    hardGatePass: identityGatePass && directParent.accepted,
    apiEntity: entity,
  };
}

async function buildSupplementEvidence({
  requestRetries = DEFAULT_REQUEST_RETRIES,
  searchDelayMs = DEFAULT_SEARCH_DELAY_MS,
  batchDelayMs = DEFAULT_BATCH_DELAY_MS,
  timeoutMs = 60_000,
  sourceRound = "supplement01",
} = {}) {
  if (!["supplement01", "supplement02", "supplement03"].includes(sourceRound)) throw new Error(`invalid-supplement-source-round:${sourceRound}`);
  const supplement02Mode = sourceRound === "supplement02";
  const supplement03Mode = sourceRound === "supplement03";
  const laterSupplementMode = supplement02Mode || supplement03Mode;
  const baseContents = await readFile(RAW_PATH, "utf8");
  const baseRawSha256 = crypto.createHash("sha256").update(baseContents).digest("hex");
  if (baseRawSha256 !== EXPECTED_BASE_RAW_SHA256) {
    throw new Error(`base-raw-sha256-mismatch:${baseRawSha256}:${EXPECTED_BASE_RAW_SHA256}`);
  }
  const baseRaw = JSON.parse(baseContents);
  let supplement01Raw = null;
  let supplement01RawSha256 = null;
  let supplement02Raw = null;
  let supplement02RawSha256 = null;
  if (laterSupplementMode) {
    const supplement01Contents = await readFile(SUPPLEMENT_RAW_PATH, "utf8");
    supplement01RawSha256 = crypto.createHash("sha256").update(supplement01Contents).digest("hex");
    if (supplement01RawSha256 !== EXPECTED_SUPPLEMENT01_RAW_SHA256) {
      throw new Error(`supplement01-raw-sha256-mismatch:${supplement01RawSha256}:${EXPECTED_SUPPLEMENT01_RAW_SHA256}`);
    }
    supplement01Raw = JSON.parse(supplement01Contents);
    if (supplement01Raw.baseRawSha256 !== baseRawSha256) {
      throw new Error(`supplement01-base-raw-sha256-mismatch:${supplement01Raw.baseRawSha256}:${baseRawSha256}`);
    }
  }
  if (supplement03Mode) {
    const supplement02Contents = await readFile(SUPPLEMENT02_RAW_PATH, "utf8");
    supplement02RawSha256 = crypto.createHash("sha256").update(supplement02Contents).digest("hex");
    if (supplement02RawSha256 !== EXPECTED_SUPPLEMENT02_RAW_SHA256) {
      throw new Error(`supplement02-raw-sha256-mismatch:${supplement02RawSha256}:${EXPECTED_SUPPLEMENT02_RAW_SHA256}`);
    }
    supplement02Raw = JSON.parse(supplement02Contents);
    if (supplement02Raw.baseRawSha256 !== baseRawSha256
      || supplement02Raw.supplement01RawSha256 !== supplement01RawSha256) {
      throw new Error("supplement02-historical-raw-sha256-mismatch");
    }
  }
  const scope = supplement03Mode
    ? createSupplement03CandidateScope(baseRaw, supplement01Raw, supplement02Raw)
    : (supplement02Mode
      ? createSupplement02CandidateScope(baseRaw, supplement01Raw)
      : createSupplementCandidateScope(baseRaw));
  const counters = createCounters({ requestRetries, searchDelayMs, batchDelayMs, timeoutMs });
  const requestContext = { requestRetries, timeoutMs, counters };
  const headers = { Accept: "application/json", "User-Agent": USER_AGENT };
  const protectedScope = await loadProtectedEntityScope();
  protectedScope.baseCandidateQids = laterSupplementMode
    ? stableUnique(baseRaw.candidates.filter((candidate) => candidate.selectedQid).map((candidate) => candidate.selectedQid))
    : [];
  protectedScope.supplement01CandidateQids = laterSupplementMode
    ? stableUnique(supplement01Raw.candidates.filter((candidate) => candidate.selectedQid).map((candidate) => candidate.selectedQid))
    : [];
  protectedScope.supplement02CandidateQids = supplement03Mode
    ? stableUnique(supplement02Raw.candidates.filter((candidate) => candidate.selectedQid).map((candidate) => candidate.selectedQid))
    : [];
  const searchableCandidates = supplementSearchCandidates(scope);
  const searchResponsesForSearchable = await collectSearchResponsesSerial(searchableCandidates, {
    searchDelayMs,
    counters,
    requestSearch: (candidate, term) => fetchJsonWithRetry(
      searchUrl(term, candidate.searchLanguageByTerm[term] || "en"),
      { headers },
      requestContext,
      { stage: "supplement-search", candidate: candidate.candidateName },
    ),
  });
  const searchByInputIndex = new Map(searchResponsesForSearchable
    .map((search) => [search.candidateInputIndex, search]));
  const searchResponses = scope.map((candidate) => searchByInputIndex.get(candidate.inputIndex)
    || searchEvidenceFromResponses(candidate, []));
  const allCandidateQids = collectSupplementExactQids(scope, searchResponses);

  const entities = {};
  const exactEntityFetchedQids = new Set();
  async function fetchExactEntitiesOnce(qids, { languages = LANGUAGES, stage, candidateBatch = false } = {}) {
    const unreadQids = stableUnique(qids).filter((qid) => !exactEntityFetchedQids.has(qid));
    for (const qid of unreadQids) exactEntityFetchedQids.add(qid);
    await processBatches(uniqueQidBatches(unreadQids), {
      batchDelayMs,
      counters,
      processBatch: async (qidBatch) => {
        counters.exactEntityRequestCount += 1;
        if (candidateBatch) counters.candidateExactEntityBatchCount += 1;
        counters.exactEntityQidCount += qidBatch.length;
        const payload = await fetchJsonWithRetry(
          entityUrl(qidBatch, languages),
          { headers },
          requestContext,
          { stage, candidate: null },
        );
        for (const [responseMapKey, entity] of Object.entries(payload.entities || {})) {
          const pruned = pruneEntity(entity, responseMapKey);
          entities[responseMapKey] = pruned;
          if (/^Q\d+$/u.test(pruned.id || "")) entities[pruned.id] = pruned;
        }
      },
    });
  }
  await fetchExactEntitiesOnce(allCandidateQids, { stage: "supplement-exact-entity-batch", candidateBatch: true });

  const sparqlProjectionByQid = new Map(allCandidateQids.map((qid) => [qid, {
    P17: [], P31: [], P131: [], P276: [], P625: [], sparqlItemQids: [],
  }]));
  await processBatches(chunks(allCandidateQids, SPARQL_BATCH_SIZE), {
    batchDelayMs,
    counters,
    processBatch: async (qidBatch) => {
      counters.projectionSparqlRequestCount += 1;
      const payload = await sparqlRequest(
        projectionQuery(qidBatch),
        requestContext,
        { stage: "supplement-sparql-projection-batch", candidate: null },
      );
      counters.sparqlBindingCount += payload?.results?.bindings?.length || 0;
      for (const binding of payload?.results?.bindings || []) {
        const itemQid = qidFromUri(binding.item?.value);
        const property = binding.property?.value;
        if (!sparqlProjectionByQid.has(itemQid)) continue;
        sparqlProjectionByQid.get(itemQid).sparqlItemQids.push(itemQid);
        if (property === "ENTITY") continue;
        if (!["P17", "P31", "P131", "P276", "P625"].includes(property)) continue;
        if (property === "P625") {
          if (binding.value?.value) sparqlProjectionByQid.get(itemQid).P625.push(binding.value.value);
        } else {
          const valueQid = qidFromUri(binding.value?.value);
          if (valueQid) sparqlProjectionByQid.get(itemQid)[property].push(valueQid);
        }
      }
    },
  });
  for (const projection of sparqlProjectionByQid.values()) {
    for (const property of ["P17", "P31", "P131", "P276", "P625", "sparqlItemQids"]) {
      projection[property] = stableUnique(projection[property]);
    }
  }

  const locationQids = stableUnique(allCandidateQids.flatMap((qid) => {
    const projection = sparqlProjectionByQid.get(qid);
    return [
      ...claimQids(entities[qid], "P131"),
      ...claimQids(entities[qid], "P276"),
      ...(projection?.P131 || []),
      ...(projection?.P276 || []),
    ];
  }));
  const exactRequestsBeforeLocation = counters.exactEntityRequestCount;
  await fetchExactEntitiesOnce(locationQids, { languages: ["en"], stage: "supplement-location-entity-batch" });
  counters.evidenceNodeRequestCount += counters.exactEntityRequestCount - exactRequestsBeforeLocation;

  const typeEntities = {};
  const typeLabelFetchedQids = new Set();
  const typeLabelFailureBatches = [];
  async function fetchTypeLabelsOnce(qids, stage) {
    const unreadQids = stableUnique(qids).filter((qid) => !typeLabelFetchedQids.has(qid));
    for (const qid of unreadQids) typeLabelFetchedQids.add(qid);
    const batches = chunks(unreadQids, SPARQL_BATCH_SIZE);
    for (let index = 0; index < batches.length; index += 1) {
      const qidBatch = batches[index];
      counters.typeLabelRequestCount += 1;
      counters.typeLabelQidCount += qidBatch.length;
      const before = counterSnapshot(counters);
      try {
        const payload = await sparqlRequest(typeLabelQuery(qidBatch), requestContext, { stage, candidate: null });
        counters.sparqlBindingCount += payload?.results?.bindings?.length || 0;
        for (const binding of payload?.results?.bindings || []) {
          const typeQid = qidFromUri(binding.type?.value);
          if (!typeQid) continue;
          typeEntities[typeQid] = {
            responseMapKey: typeQid,
            id: typeQid,
            labelEn: binding.labelEn?.value || "",
            descriptionEn: binding.descriptionEn?.value || "",
          };
        }
      } catch (error) {
        const after = counterSnapshot(counters);
        typeLabelFailureBatches.push({
          stage,
          typeQids: qidBatch,
          httpStatus: error?.status ?? null,
          timeout: after.timeoutCount > before.timeoutCount || /abort|timeout/iu.test(error?.message || ""),
          attempts: Math.max(after.attemptedRequestCount - before.attemptedRequestCount, 1),
          retries: Math.max(after.retryCount - before.retryCount, 0),
        });
      }
      if (index < batches.length - 1) await waitWithStats(batchDelayMs, counters, "batch");
    }
  }
  await fetchTypeLabelsOnce(stableUnique([
    ...allCandidateQids.flatMap((qid) => [
      ...claimQids(entities[qid], "P31"),
      ...(sparqlProjectionByQid.get(qid)?.P31 || []),
    ]),
  ]), "supplement-sparql-type-label-batch");

  const candidates = scope.map((candidate, index) => {
    const search = searchResponses[index];
    const searchResultByQid = new Map(search.results.map((result) => [result.qid, result]));
    const candidateQids = stableUnique([...searchResultByQid.keys(), ...candidate.knownQids]);
    const candidateEntities = candidateQids.map((qid) => buildSupplementEntityEvidence({
      candidate,
      qid,
      searchResult: searchResultByQid.get(qid) || knownQidSearchEvidence(candidate, qid),
      entities,
      sparqlProjectionByQid,
      typeEntities,
      protectedScope,
    })).sort((left, right) => left.qid.localeCompare(right.qid, "en"));
    const selection = selectSupplementIdentity(candidate, candidateEntities);
    return {
      candidateKey: candidate.candidateKey,
      cityQid: candidate.cityQid,
      candidateName: candidate.candidateName,
      operation: candidate.operation,
      sourceRound: candidate.sourceRound,
      countryCode: candidate.countryCode,
      countryQid: candidate.countryQid,
      city: candidate.city,
      reasons: candidate.reasons,
      input: candidate,
      search,
      ...selection,
      preParentStatus: selection.status,
      baseStatus: candidate.baseStatus,
      candidateEntities,
      evidenceIssues: [],
      relationDiscoveryEvidence: {
        required: false,
        attempted: false,
        querySucceeded: null,
        queryFailed: false,
        timedOut: false,
        relations: [],
        skippedReason: "not-an-institution-building-target",
      },
      relatedEntityEvidence: [],
      competingIdentities: candidateEntities.filter((entity) => entity.qid !== selection.selectedQid).map((entity) => ({
        qid: entity.qid,
        labelEn: entity.nameEvidence.labelEn,
        descriptionEn: entity.nameEvidence.descriptionEn,
        p31Key: entity.p31Evidence.p31Key,
        identityGatePass: entity.identityGatePass,
      })),
    };
  });
  const candidateLevelEvidenceIssues = [];
  const addCandidateIssues = (issues) => {
    for (const issue of issues) {
      candidateLevelEvidenceIssues.push(issue);
      const candidate = candidates.find((value) => value.candidateKey === issue.candidateKey);
      if (!candidate) throw new Error(`candidate-level-issue-unknown-key:${issue.candidateKey}`);
      candidate.evidenceIssues.push(issue);
    }
  };
  const failedTypeLabelQids = new Set(typeLabelFailureBatches.flatMap((failure) => failure.typeQids));
  for (const failure of typeLabelFailureBatches) {
    for (const candidate of candidates.filter((value) => value.selectedQid)) {
      const selected = candidate.candidateEntities.find((entity) => entity.qid === candidate.selectedQid);
      const affectedTypeQids = selected.p31Evidence.sortedTypeQids.filter((qid) => failure.typeQids.includes(qid));
      if (affectedTypeQids.length === 0) continue;
      addCandidateIssues([{
        candidateKey: candidate.candidateKey,
        evidenceIssueType: failure.timeout ? "type-label-query-timeout" : "type-label-query-failed",
        failedStage: failure.stage,
        httpStatus: failure.httpStatus,
        timeout: failure.timeout,
        attempts: failure.attempts,
        retries: failure.retries,
        queryScope: { typeQids: failure.typeQids },
        relatedQids: affectedTypeQids,
      }]);
    }
  }
  for (const candidate of candidates.filter((value) => value.selectedQid)) {
    const selected = candidate.candidateEntities.find((entity) => entity.qid === candidate.selectedQid);
    const missingTypeQids = selected.p31Evidence.sortedTypeQids.filter((qid) => !failedTypeLabelQids.has(qid)
      && !typeEntities[qid]?.labelEn);
    if (missingTypeQids.length === 0) continue;
    addCandidateIssues([{
      candidateKey: candidate.candidateKey,
      evidenceIssueType: "type-label-missing",
      failedStage: "supplement-type-label-validation",
      httpStatus: null,
      timeout: false,
      attempts: 0,
      retries: 0,
      queryScope: { typeQids: missingTypeQids },
      relatedQids: missingTypeQids,
    }]);
  }

  const cityParentBatches = buildCityParentPlans(candidates);
  const parentPathByPair = new Map();
  for (const batch of cityParentBatches) {
    if (batch.queryPairs.length > PARENT_BATCH_SIZE) {
      throw new Error(`supplement-parent-city-batch-too-large:${batch.city}:${batch.queryPairs.length}`);
    }
  }
  const queriedCityBatches = cityParentBatches.filter((batch) => batch.queryPairs.length > 0);
  for (let index = 0; index < queriedCityBatches.length; index += 1) {
    const batch = queriedCityBatches[index];
    batch.queryAttempted = true;
    counters.parentBatchesAttempted += 1;
    counters.parentSparqlRequestCount += 1;
    const payload = await sparqlRequest(
      parentQueryForCityBatch(batch),
      requestContext,
      { stage: "supplement-sparql-parent-city-batch", candidate: batch.city },
    );
    counters.sparqlBindingCount += payload?.results?.bindings?.length || 0;
    const batchEvidence = parentPathEvidenceByPair(payload?.results?.bindings || [], batch.queryPairs, batch.cityQid);
    for (const [qid, evidence] of batchEvidence.entries()) parentPathByPair.set(`${qid}|${batch.cityQid}`, evidence);
    batch.transitiveParentResolvedCount = [...batchEvidence.values()].filter((evidence) => evidence.accepted).length;
    batch.querySucceeded = true;
    counters.parentBatchesSucceeded += 1;
    if (index < queriedCityBatches.length - 1) await waitWithStats(batchDelayMs, counters, "batch");
  }
  for (const candidate of candidates) {
    if (!candidate.selectedQid) continue;
    const selectedEntity = candidate.candidateEntities.find((entity) => entity.qid === candidate.selectedQid);
    if (!selectedEntity) throw new Error(`supplement-selected-entity-not-found:${candidate.candidateName}:${candidate.selectedQid}`);
    if (!selectedEntity.parentEvidence.accepted) {
      Object.assign(selectedEntity.parentEvidence, parentPathByPair.get(`${candidate.selectedQid}|${candidate.cityQid}`) || {
        parentEvidenceLevel: "unconfirmed",
        parentPathDepth: null,
        parentPathQids: [],
        transitiveQueryPerformed: true,
        accepted: false,
      });
    }
  }

  const municipalityRelationsByCity = new Map();
  const municipalityOutcomeByCity = new Map();
  for (const batch of cityParentBatches) {
    const cityCandidates = candidates.filter((candidate) => candidate.cityQid === batch.cityQid && candidate.selectedQid);
    const affectedCandidates = cityCandidates.filter((candidate) => {
      const selected = candidate.candidateEntities.find((entity) => entity.qid === candidate.selectedQid);
      return (selected?.parentEvidence.directLocationEntities || [])
        .some((entity) => normalizeName(entity.labelEn) === normalizeName(candidate.city));
    });
    const municipalityQids = stableUnique(affectedCandidates.flatMap((candidate) => {
      const selected = candidate.candidateEntities.find((entity) => entity.qid === candidate.selectedQid);
      return selected.parentEvidence.directLocationEntities
        .filter((entity) => normalizeName(entity.labelEn) === normalizeName(candidate.city))
        .map((entity) => entity.qid);
    }));
    if (municipalityQids.length === 0) {
      municipalityRelationsByCity.set(batch.cityQid, []);
      municipalityOutcomeByCity.set(batch.cityQid, { attempted: false, succeeded: null, timedOut: false });
      continue;
    }
    counters.municipalitySparqlRequestCount += 1;
    const outcome = await runCandidateLevelEvidenceRequest({
      candidateKeys: affectedCandidates.map((candidate) => candidate.candidateKey),
      evidenceIssueType: ({ timeout }) => timeout ? "municipality-equivalence-timeout" : "municipality-equivalence-query-failed",
      failedStage: "supplement-sparql-municipality-city-relation",
      queryScope: { city: batch.city, cityQid: batch.cityQid, municipalityQids },
      relatedQids: municipalityQids,
      counters,
      request: () => sparqlRequest(
        municipalityRelationQuery({ cityQid: batch.cityQid, municipalityQids }),
        requestContext,
        { stage: "supplement-sparql-municipality-city-relation", candidate: batch.city },
      ),
    });
    addCandidateIssues(outcome.issues);
    const payload = outcome.payload;
    if (outcome.succeeded) counters.sparqlBindingCount += payload?.results?.bindings?.length || 0;
    municipalityRelationsByCity.set(batch.cityQid, outcome.succeeded
      ? municipalityRelationsFromBindings(payload?.results?.bindings || [], batch.cityQid)
      : []);
    municipalityOutcomeByCity.set(batch.cityQid, {
      attempted: true,
      succeeded: outcome.succeeded,
      timedOut: outcome.issues.some((issue) => issue.timeout),
    });
    await waitWithStats(batchDelayMs, counters, "batch");
  }
  for (const candidate of candidates) {
    if (!candidate.selectedQid) continue;
    const selected = candidate.candidateEntities.find((entity) => entity.qid === candidate.selectedQid);
    const bridge = municipalityBridgeEvidence({
      city: candidate.city,
      cityQid: candidate.cityQid,
      directLocationEntities: selected.parentEvidence.directLocationEntities,
      relations: municipalityRelationsByCity.get(candidate.cityQid) || [],
    });
    const municipalityOutcome = municipalityOutcomeByCity.get(candidate.cityQid) || {
      attempted: false,
      succeeded: null,
      timedOut: false,
    };
    Object.assign(bridge, {
      queryAttempted: bridge.sameNameLocationQids.length > 0 && municipalityOutcome.attempted,
      querySucceeded: bridge.sameNameLocationQids.length > 0 ? municipalityOutcome.succeeded : null,
      queryFailed: bridge.sameNameLocationQids.length > 0 && municipalityOutcome.succeeded === false,
      timedOut: bridge.sameNameLocationQids.length > 0 && municipalityOutcome.timedOut,
    });
    selected.parentEvidence.municipalityCityEvidence = bridge;
    if (!selected.parentEvidence.accepted && bridge.accepted) {
      selected.parentEvidence.parentEvidenceLevel = "municipality-city-structured-relationship";
      selected.parentEvidence.parentPathDepth = null;
      selected.parentEvidence.parentPathQids = [bridge.structuredRelations[0].municipalityQid, candidate.cityQid];
      selected.parentEvidence.requiresManualReview = true;
      selected.parentEvidence.accepted = true;
    }
  }

  const institutionCandidates = selectInstitutionBuildingCandidates(candidates);
  counters.institutionBuildingCandidates = institutionCandidates.map((candidate) => candidate.candidateKey);
  const relationsByInstitutionQid = new Map(institutionCandidates.map((candidate) => [candidate.selectedQid, []]));
  const discoverySucceededByCandidateKey = new Map();
  const discoveryBatches = institutionRelationDiscoveryBatches(institutionCandidates);
  for (let index = 0; index < discoveryBatches.length; index += 1) {
    const batch = discoveryBatches[index];
    counters.institutionBuildingSparqlRequestCount += 1;
    counters.relationDiscoveryRequests += 1;
    const outcome = await runCandidateLevelEvidenceRequest({
      candidateKeys: batch.candidates.map((candidate) => candidate.candidateKey),
      evidenceIssueType: ({ timeout }) => timeout
        ? "institution-building-discovery-timeout"
        : "institution-building-discovery-failed",
      failedStage: "supplement-institution-relation-discovery",
      queryScope: {
        city: batch.city,
        cityQid: batch.cityQid,
        institutionQids: batch.institutionQids,
        maximumInstitutionQidsPerBatch: 2,
      },
      relatedQids: [],
      counters,
      request: () => sparqlRequest(
        institutionRelationDiscoveryQuery(batch.institutionQids),
        requestContext,
        { stage: "supplement-institution-relation-discovery", candidate: batch.city },
      ),
    });
    addCandidateIssues(outcome.issues);
    if (outcome.succeeded) {
      counters.relationDiscoverySucceeded += 1;
      counters.sparqlBindingCount += outcome.payload?.results?.bindings?.length || 0;
      for (const relation of institutionRelationsFromBindings(outcome.payload?.results?.bindings || [])) {
        if (!relationsByInstitutionQid.has(relation.institutionQid)) continue;
        relationsByInstitutionQid.get(relation.institutionQid).push(relation);
      }
    } else if (outcome.issues.some((issue) => issue.timeout)) {
      counters.relationDiscoveryTimedOut += 1;
    }
    for (const candidate of batch.candidates) {
      const relations = (relationsByInstitutionQid.get(candidate.selectedQid) || [])
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));
      discoverySucceededByCandidateKey.set(candidate.candidateKey, outcome.succeeded);
      candidate.relationDiscoveryEvidence = {
        required: true,
        attempted: true,
        querySucceeded: outcome.succeeded,
        queryFailed: !outcome.succeeded,
        timedOut: outcome.issues.some((issue) => issue.timeout),
        relations,
        zeroRelations: outcome.succeeded && relations.length === 0,
        skippedReason: null,
      };
    }
    if (index < discoveryBatches.length - 1) await waitWithStats(batchDelayMs, counters, "batch");
  }

  const allRelations = [...relationsByInstitutionQid.values()].flat();
  const relatedEntityQids = stableUnique(allRelations.map((relation) => relation.relatedEntityQid));
  counters.relatedEntityQidCount = relatedEntityQids.length;
  const candidateKeysByRelatedQid = new Map();
  const citiesByRelatedQid = new Map();
  for (const candidate of institutionCandidates) {
    for (const relation of relationsByInstitutionQid.get(candidate.selectedQid) || []) {
      const keys = candidateKeysByRelatedQid.get(relation.relatedEntityQid) || [];
      candidateKeysByRelatedQid.set(relation.relatedEntityQid, stableUnique([...keys, candidate.candidateKey]));
      const cities = citiesByRelatedQid.get(relation.relatedEntityQid) || [];
      citiesByRelatedQid.set(relation.relatedEntityQid, [...cities, {
        city: candidate.city,
        cityQid: candidate.cityQid,
        candidateKey: candidate.candidateKey,
      }]);
    }
  }

  const unreadRelatedEntityQids = relatedEntityQids.filter((qid) => !exactEntityFetchedQids.has(qid));
  const relatedExactBatches = uniqueQidBatches(unreadRelatedEntityQids);
  for (let index = 0; index < relatedExactBatches.length; index += 1) {
    const qidBatch = relatedExactBatches[index];
    for (const qid of qidBatch) exactEntityFetchedQids.add(qid);
    counters.relatedEntityExactBatches += 1;
    counters.exactEntityRequestCount += 1;
    counters.exactEntityQidCount += qidBatch.length;
    counters.evidenceNodeRequestCount += 1;
    const outcome = await runCandidateLevelEvidenceRequest({
      candidateKeys: stableUnique(qidBatch.flatMap((qid) => candidateKeysByRelatedQid.get(qid) || [])),
      evidenceIssueType: ({ timeout }) => timeout ? "related-entity-exact-timeout" : "related-entity-exact-failed",
      failedStage: "supplement-related-entity-exact-batch",
      queryScope: { relatedQids: qidBatch, batchSize: qidBatch.length },
      relatedQids: qidBatch,
      counters,
      request: () => fetchJsonWithRetry(
        entityUrl(qidBatch, LANGUAGES),
        { headers },
        requestContext,
        { stage: "supplement-related-entity-exact-batch", candidate: null },
      ),
    });
    addCandidateIssues(outcome.issues);
    if (outcome.succeeded) {
      for (const [responseMapKey, entity] of Object.entries(outcome.payload.entities || {})) {
        const pruned = pruneEntity(entity, responseMapKey);
        entities[responseMapKey] = pruned;
        if (/^Q\d+$/u.test(pruned.id || "")) entities[pruned.id] = pruned;
      }
    }
    if (index < relatedExactBatches.length - 1) await waitWithStats(batchDelayMs, counters, "batch");
  }

  const cityRelatedEntities = [...new Map(institutionCandidates.map((candidate) => [candidate.cityQid, {
    city: candidate.city,
    cityQid: candidate.cityQid,
  }])).values()].map((cityEntry) => ({
    ...cityEntry,
    relatedQids: stableUnique(relatedEntityQids.filter((qid) => entities[qid]
      && (citiesByRelatedQid.get(qid) || []).some((city) => city.cityQid === cityEntry.cityQid))),
  }));
  const relatedParentEvidenceByPair = new Map();
  const relatedParentOutcomeByPair = new Map();
  const relatedParentBatches = relatedEntityParentBatches(cityRelatedEntities);
  for (let index = 0; index < relatedParentBatches.length; index += 1) {
    const batch = relatedParentBatches[index];
    const candidateKeys = stableUnique(batch.relatedQids.flatMap((qid) => (citiesByRelatedQid.get(qid) || [])
      .filter((city) => city.cityQid === batch.cityQid)
      .map((city) => city.candidateKey)));
    counters.relatedEntityParentRequests += 1;
    const outcome = await runCandidateLevelEvidenceRequest({
      candidateKeys,
      evidenceIssueType: ({ timeout }) => timeout ? "related-entity-parent-timeout" : "related-entity-parent-failed",
      failedStage: "supplement-related-entity-parent",
      queryScope: {
        city: batch.city,
        cityQid: batch.cityQid,
        relatedQids: batch.relatedQids,
        maximumRelatedEntityQidsPerBatch: 2,
      },
      relatedQids: batch.relatedQids,
      counters,
      request: () => sparqlRequest(
        relatedEntityParentQuery({ cityQid: batch.cityQid, relatedQids: batch.relatedQids }),
        requestContext,
        { stage: "supplement-related-entity-parent", candidate: batch.city },
      ),
    });
    addCandidateIssues(outcome.issues);
    if (outcome.succeeded) {
      counters.relatedEntityParentSucceeded += 1;
      counters.sparqlBindingCount += outcome.payload?.results?.bindings?.length || 0;
      const evidence = relatedEntityParentEvidenceFromBindings(
        outcome.payload?.results?.bindings || [],
        batch.relatedQids,
        batch.cityQid,
      );
      for (const [qid, parentEvidence] of evidence.entries()) {
        relatedParentEvidenceByPair.set(`${qid}|${batch.cityQid}`, parentEvidence);
        relatedParentOutcomeByPair.set(`${qid}|${batch.cityQid}`, { attempted: true, succeeded: true, timedOut: false });
      }
    } else {
      if (outcome.issues.some((issue) => issue.timeout)) counters.relatedEntityParentTimedOut += 1;
      for (const qid of batch.relatedQids) {
        relatedParentOutcomeByPair.set(`${qid}|${batch.cityQid}`, {
          attempted: true,
          succeeded: false,
          timedOut: outcome.issues.some((issue) => issue.timeout),
        });
      }
    }
    if (index < relatedParentBatches.length - 1) await waitWithStats(batchDelayMs, counters, "batch");
  }

  for (const candidate of institutionCandidates) {
    const relations = relationsByInstitutionQid.get(candidate.selectedQid) || [];
    const relatedEntityEvidence = relations.map((relation) => {
      const relatedEntity = entities[relation.relatedEntityQid];
      const parentOutcome = relatedParentOutcomeByPair.get(`${relation.relatedEntityQid}|${candidate.cityQid}`) || {
        attempted: false,
        succeeded: null,
        timedOut: false,
      };
      const parentEvidence = relatedParentEvidenceByPair.get(`${relation.relatedEntityQid}|${candidate.cityQid}`) || {
        pathType: "unconfirmed",
        depth: null,
        pathQids: [],
        accepted: false,
      };
      return {
        ...relation,
        exactEntityRead: Boolean(relatedEntity),
        exactEntity: relatedEntity ? {
          qid: relation.relatedEntityQid,
          labelEn: relatedEntity.labels?.en?.value || "",
          descriptionEn: relatedEntity.descriptions?.en?.value || "",
          p31Qids: claimQids(relatedEntity, "P31"),
          p131Qids: claimQids(relatedEntity, "P131"),
          p276Qids: claimQids(relatedEntity, "P276"),
          coordinates: coordinatesEvidence(relatedEntity),
        } : null,
        parentQuery: {
          ...parentOutcome,
          queryFailed: parentOutcome.succeeded === false,
          querySucceededWithZeroPaths: parentOutcome.succeeded === true && !parentEvidence.accepted,
        },
        parentEvidence,
        canonicalIdentityMayChange: true,
        requiresManualReview: true,
        accepted: Boolean(relatedEntity) && relation.parentAcceptanceEligible && parentEvidence.accepted,
      };
    }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));
    candidate.relatedEntityEvidence = relatedEntityEvidence;
    applyInstitutionBuildingOutcome(candidate, {
      discoverySucceeded: discoverySucceededByCandidateKey.get(candidate.candidateKey) === true,
      relatedEntityEvidence,
    });
  }

  for (const candidate of candidates) {
    if (!candidate.selectedQid) continue;
    const selected = candidate.candidateEntities.find((entity) => entity.qid === candidate.selectedQid);
    selected.hardGatePass = selected.identityGatePass && selected.parentEvidence.accepted;
    candidate.status = resolveSupplementStatus({
      preParentStatus: candidate.preParentStatus,
      parentEvidence: selected.parentEvidence,
      evidenceIssues: candidate.evidenceIssues,
    });
    candidate.selectionReasons.push(selected.parentEvidence.accepted
      ? `parent-evidence:${selected.parentEvidence.parentEvidenceLevel}`
      : "selected-identity-did-not-reach-approved-city-within-fixed-parent-depth-or-structured-bridge");
  }

  const internalSelectedQidDuplicates = [];
  const supplementSelectedByQid = new Map();
  for (const candidate of candidates.filter((value) => value.selectedQid)) {
    const current = supplementSelectedByQid.get(candidate.selectedQid) || [];
    current.push(candidate);
    supplementSelectedByQid.set(candidate.selectedQid, current);
  }
  for (const [qid, duplicateCandidates] of supplementSelectedByQid.entries()) {
    if (duplicateCandidates.length < 2) continue;
    internalSelectedQidDuplicates.push({ qid, candidateKeys: duplicateCandidates.map((candidate) => candidate.candidateKey).sort() });
    for (const candidate of duplicateCandidates) {
      candidate.status = "duplicate";
      candidate.selectionReasons.push("selected-qid-used-by-multiple-supplement-candidates");
    }
  }
  const baseSelectedByQid = new Map();
  for (const baseCandidate of baseRaw.candidates.filter((candidate) => candidate.selectedQid)) {
    const key = candidateKey(baseCandidate.input.cityQid, baseCandidate.input.name);
    const current = baseSelectedByQid.get(baseCandidate.selectedQid) || [];
    current.push(key);
    baseSelectedByQid.set(baseCandidate.selectedQid, current);
  }
  const baseRoundSelectedQidOverlaps = [];
  for (const candidate of candidates.filter((value) => value.selectedQid)) {
    const otherBaseKeys = (baseSelectedByQid.get(candidate.selectedQid) || [])
      .filter((key) => key !== candidate.candidateKey);
    if (otherBaseKeys.length === 0) continue;
    baseRoundSelectedQidOverlaps.push({
      qid: candidate.selectedQid,
      supplementCandidateKey: candidate.candidateKey,
      otherBaseCandidateKeys: otherBaseKeys,
    });
    candidate.status = "duplicate";
    candidate.selectionReasons.push("selected-qid-overlaps-different-base-candidate");
  }
  const supplement01SelectedByQid = new Map();
  if (laterSupplementMode) {
    for (const historicalCandidate of supplement01Raw.candidates.filter((candidate) => candidate.selectedQid)) {
      const current = supplement01SelectedByQid.get(historicalCandidate.selectedQid) || [];
      current.push(historicalCandidate.candidateKey);
      supplement01SelectedByQid.set(historicalCandidate.selectedQid, current);
    }
  }
  const supplement01RoundSelectedQidOverlaps = [];
  for (const candidate of candidates.filter((value) => value.selectedQid)) {
    const historicalKeys = supplement01SelectedByQid.get(candidate.selectedQid) || [];
    if (historicalKeys.length === 0) continue;
    supplement01RoundSelectedQidOverlaps.push({
      qid: candidate.selectedQid,
      supplement02CandidateKey: candidate.candidateKey,
      supplement01CandidateKeys: historicalKeys,
    });
    candidate.status = "duplicate";
    candidate.selectionReasons.push("selected-qid-overlaps-supplement01-candidate");
  }
  const supplement02SelectedByQid = new Map();
  if (supplement03Mode) {
    for (const historicalCandidate of supplement02Raw.candidates.filter((candidate) => candidate.selectedQid)) {
      const current = supplement02SelectedByQid.get(historicalCandidate.selectedQid) || [];
      current.push(historicalCandidate.candidateKey);
      supplement02SelectedByQid.set(historicalCandidate.selectedQid, current);
    }
  }
  const supplement02RoundSelectedQidOverlaps = [];
  for (const candidate of candidates.filter((value) => value.selectedQid)) {
    const historicalKeys = supplement02SelectedByQid.get(candidate.selectedQid) || [];
    if (historicalKeys.length === 0) continue;
    supplement02RoundSelectedQidOverlaps.push({
      qid: candidate.selectedQid,
      supplement03CandidateKey: candidate.candidateKey,
      supplement02CandidateKeys: historicalKeys,
    });
    candidate.status = "duplicate";
    candidate.selectionReasons.push("selected-qid-overlaps-supplement02-candidate");
  }

  for (const batch of cityParentBatches) {
    const selected = candidates.filter((candidate) => candidate.cityQid === batch.cityQid && candidate.selectedQid);
    batch.parentFailedCount = selected.filter((candidate) => {
      const entity = candidate.candidateEntities.find((value) => value.qid === candidate.selectedQid);
      return !entity?.parentEvidence.accepted;
    }).length;
  }
  counters.cityParentProgress = cityParentBatches.map((batch) => ({
    city: batch.city,
    cityQid: batch.cityQid,
    candidateCount: batch.candidateCount,
    selectedQidCount: batch.selectedQidCount,
    directParentResolvedCount: batch.directParentResolvedCount,
    transitiveParentQueriedCount: batch.transitiveParentQueriedCount,
    transitiveParentResolvedCount: batch.transitiveParentResolvedCount,
    parentFailedCount: batch.parentFailedCount,
    queryAttempted: batch.queryAttempted,
    querySucceeded: batch.querySucceeded,
    skippedReason: batch.skippedReason,
    queryCandidateQids: batch.queryPairs.map(({ qid }) => qid),
  }));

  const crossTypeOverlaps = candidates.flatMap((candidate) => candidate.candidateEntities
    .filter((entity) => entity.duplicateEvidence.duplicate)
    .map((entity) => ({
      candidateKey: candidate.candidateKey,
      qid: entity.qid,
      duplicateKinds: entity.duplicateEvidence.duplicateKinds,
    })));
  const compareEvidenceIssues = (left, right) => left.candidateKey.localeCompare(right.candidateKey, "en")
    || left.evidenceIssueType.localeCompare(right.evidenceIssueType, "en")
    || left.failedStage.localeCompare(right.failedStage, "en")
    || JSON.stringify(left.queryScope).localeCompare(JSON.stringify(right.queryScope), "en");
  candidateLevelEvidenceIssues.sort(compareEvidenceIssues);
  for (const candidate of candidates) candidate.evidenceIssues.sort(compareEvidenceIssues);
  const statuses = ["pass", "conditional-manual", "identity-ambiguous", "parent-failed", "country-failed", "coordinate-failed", "out-of-scope", "duplicate"];
  const retrievedAt = new Date().toISOString();
  counters.candidateLevelEvidenceIssues = candidateLevelEvidenceIssues.length;
  const raw = {
    schemaVersion: `route-v2-poi-baseline-p1b-batch01-candidate-${sourceRound}-evidence-v1`,
    evidenceGateOnly: true,
    canonicalPublishInputApproved: false,
    classifierImplemented: false,
    retrievedAt,
    baseRaw: {
      path: RAW_RELATIVE_PATH,
      sha256: baseRawSha256,
      retrievedAt: baseRaw.retrievedAt,
      candidateCount: baseRaw.candidates.length,
    },
    baseRawSha256,
    ...(laterSupplementMode ? {
      supplement01Raw: {
        path: SUPPLEMENT_RAW_RELATIVE_PATH,
        sha256: supplement01RawSha256,
        retrievedAt: supplement01Raw.retrievedAt,
        candidateCount: supplement01Raw.candidates.length,
      },
      supplement01RawSha256,
    } : {}),
    ...(supplement03Mode ? {
      supplement02Raw: {
        path: SUPPLEMENT02_RAW_RELATIVE_PATH,
        sha256: supplement02RawSha256,
        retrievedAt: supplement02Raw.retrievedAt,
        candidateCount: supplement02Raw.candidates.length,
      },
      supplement02RawSha256,
    } : {}),
    supplementScope: {
      candidateCount: scope.length,
      failedBaseCandidateCount: scope.filter((candidate) => candidate.baseCandidateInputIndex).length,
      newCandidateCount: scope.filter((candidate) => !candidate.baseCandidateInputIndex).length,
      cityCount: stableUnique(scope.map((candidate) => candidate.cityQid)).length,
      operationCounts: Object.fromEntries(SUPPLEMENT_OPERATIONS.map((operation) => [
        operation,
        scope.filter((candidate) => candidate.operation === operation).length,
      ])),
      candidateKeys: scope.map((candidate) => candidate.candidateKey),
      excludesStableUsableBaseCandidates: true,
      ...(laterSupplementMode ? { excludesAllHistoricalCandidates: true } : {}),
      excludesAustralia: scope.every((candidate) => candidate.countryCode !== "AU"),
      fixedScopeOnly: true,
    },
    source: {
      provider: "wikidata-search-api+entity-api+sparql",
      endpoints: [ENTITY_API_ENDPOINT, SPARQL_ENDPOINT],
      userAgent: USER_AGENT,
      ...counters,
      candidateCount: scope.length,
      searchCandidateCount: searchableCandidates.length,
      searchTermCount: scope.reduce((total, candidate) => total + candidate.searchTerms.length, 0),
      parentOnlyCandidateCount: scope.filter((candidate) => candidate.operation === "parent-only-requery").length,
      knownQidCandidateCount: scope.filter((candidate) => candidate.knownQids.length > 0).length,
      uniqueCandidateOrKnownQidCount: allCandidateQids.length,
      exactEntityBatchCount: counters.exactEntityRequestCount,
      sparqlBatchCount: counters.projectionSparqlRequestCount + counters.typeLabelRequestCount
        + counters.parentSparqlRequestCount + counters.municipalitySparqlRequestCount
        + counters.institutionBuildingSparqlRequestCount + counters.relatedEntityParentRequests,
      searchResultCount: searchResponses.reduce((total, search) => total + search.resultCount, 0),
      uniqueP31TypeQidCount: typeLabelFetchedQids.size,
    },
    protectedEntityScope: {
      countryCount: protectedScope.countries.length,
      cityCount: protectedScope.cities.length,
      pilotPoiCount: protectedScope.pilotPois.length,
      countryQids: protectedScope.countryQids,
      cityQids: protectedScope.cityQids,
      pilotPoiQids: protectedScope.pilotPoiQids,
    },
    blockingTypeQids: BLOCKING_TYPE_QIDS,
    institutionRelationRules: INSTITUTION_RELATION_RULES,
    parentBatchSummary: counters.cityParentProgress,
    candidates,
    candidateLevelEvidenceIssues,
    fatalErrors: [],
    duplicateChecks: {
      internalSelectedQidDuplicates,
      baseRoundSelectedQidOverlaps,
      supplement01RoundSelectedQidOverlaps,
      supplement02RoundSelectedQidOverlaps,
      crossTypeOverlaps,
      crossTypeOverlapCount: crossTypeOverlaps.length,
    },
    evidenceGateSummary: {
      byStatus: Object.fromEntries(statuses.map((status) => [status, candidates.filter((candidate) => candidate.status === status).length])),
      selectedQidCount: candidates.filter((candidate) => candidate.selectedQid).length,
      unresolvedIdentityCount: candidates.filter((candidate) => !candidate.selectedQid).length,
      usableCandidateCount: candidates.filter((candidate) => ["pass", "conditional-manual"].includes(candidate.status)).length,
      blockingCandidateCount: candidates.filter((candidate) => !["pass", "conditional-manual"].includes(candidate.status)).length,
    },
  };
  if (supplement03Mode) validateSupplement03RawStructure(raw, baseRaw, supplement01Raw, supplement02Raw);
  else if (supplement02Mode) validateSupplement02RawStructure(raw, baseRaw, supplement01Raw);
  else validateSupplementRawStructure(raw);
  const contents = serializeJson(raw);
  return {
    raw,
    contents,
    sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    mergedPoolAnalysis: supplement03Mode
      ? analyzeMergedCandidatePoolFourRounds(baseRaw, supplement01Raw, supplement02Raw, raw)
      : (supplement02Mode
        ? analyzeMergedCandidatePoolThreeRounds(baseRaw, supplement01Raw, raw)
        : analyzeMergedCandidatePool(baseRaw, raw)),
  };
}

async function refreshSupplementEvidence(options = {}) {
  return persistCompletedEvidence(
    () => buildSupplementEvidence(options),
    (contents) => writeAtomic(SUPPLEMENT_RAW_PATH, contents),
  );
}

async function buildSupplement02Evidence(options = {}) {
  return buildSupplementEvidence({ ...options, sourceRound: "supplement02" });
}

async function refreshSupplement02Evidence(options = {}) {
  return persistCompletedEvidence(
    () => buildSupplement02Evidence(options),
    (contents) => writeAtomic(SUPPLEMENT02_RAW_PATH, contents),
  );
}

async function buildSupplement03Evidence(options = {}) {
  return buildSupplementEvidence({ ...options, sourceRound: "supplement03" });
}

async function refreshSupplement03Evidence(options = {}) {
  return persistCompletedEvidence(
    () => buildSupplement03Evidence(options),
    (contents) => writeAtomic(SUPPLEMENT03_RAW_PATH, contents),
  );
}

async function analyzeSupplementEvidenceFiles() {
  const baseContents = await readFile(RAW_PATH, "utf8");
  const baseRawSha256 = crypto.createHash("sha256").update(baseContents).digest("hex");
  if (baseRawSha256 !== EXPECTED_BASE_RAW_SHA256) {
    throw new Error(`base-raw-sha256-mismatch:${baseRawSha256}:${EXPECTED_BASE_RAW_SHA256}`);
  }
  const baseRaw = JSON.parse(baseContents);
  const supplementRaw = JSON.parse(await readFile(SUPPLEMENT_RAW_PATH, "utf8"));
  if (supplementRaw.baseRawSha256 !== baseRawSha256) {
    throw new Error(`supplement-base-raw-sha256-mismatch:${supplementRaw.baseRawSha256}:${baseRawSha256}`);
  }
  return {
    status: "PASS",
    mode: "analyze-supplement01",
    calledWikidata: false,
    raw: SUPPLEMENT_RAW_RELATIVE_PATH,
    retrievedAt: supplementRaw.retrievedAt,
    source: supplementRaw.source,
    supplementScope: supplementRaw.supplementScope,
    evidenceGateSummary: supplementRaw.evidenceGateSummary,
    duplicateChecks: supplementRaw.duplicateChecks,
    candidateLevelEvidenceIssues: supplementRaw.candidateLevelEvidenceIssues,
    mergedPoolAnalysis: analyzeMergedCandidatePool(baseRaw, supplementRaw),
  };
}

async function analyzeSupplement02EvidenceFiles() {
  const baseContents = await readFile(RAW_PATH, "utf8");
  const baseRawSha256 = crypto.createHash("sha256").update(baseContents).digest("hex");
  if (baseRawSha256 !== EXPECTED_BASE_RAW_SHA256) {
    throw new Error(`base-raw-sha256-mismatch:${baseRawSha256}:${EXPECTED_BASE_RAW_SHA256}`);
  }
  const supplement01Contents = await readFile(SUPPLEMENT_RAW_PATH, "utf8");
  const supplement01RawSha256 = crypto.createHash("sha256").update(supplement01Contents).digest("hex");
  if (supplement01RawSha256 !== EXPECTED_SUPPLEMENT01_RAW_SHA256) {
    throw new Error(`supplement01-raw-sha256-mismatch:${supplement01RawSha256}:${EXPECTED_SUPPLEMENT01_RAW_SHA256}`);
  }
  const baseRaw = JSON.parse(baseContents);
  const supplement01Raw = JSON.parse(supplement01Contents);
  const supplement02Raw = JSON.parse(await readFile(SUPPLEMENT02_RAW_PATH, "utf8"));
  validateSupplement02RawStructure(supplement02Raw, baseRaw, supplement01Raw);
  return {
    status: "PASS",
    mode: "analyze-supplement02",
    calledWikidata: false,
    raw: SUPPLEMENT02_RAW_RELATIVE_PATH,
    retrievedAt: supplement02Raw.retrievedAt,
    source: supplement02Raw.source,
    supplementScope: supplement02Raw.supplementScope,
    evidenceGateSummary: supplement02Raw.evidenceGateSummary,
    duplicateChecks: supplement02Raw.duplicateChecks,
    candidateLevelEvidenceIssues: supplement02Raw.candidateLevelEvidenceIssues,
    mergedPoolAnalysis: analyzeMergedCandidatePoolThreeRounds(baseRaw, supplement01Raw, supplement02Raw),
  };
}

async function analyzeSupplement03EvidenceFiles() {
  const baseContents = await readFile(RAW_PATH, "utf8");
  const supplement01Contents = await readFile(SUPPLEMENT_RAW_PATH, "utf8");
  const supplement02Contents = await readFile(SUPPLEMENT02_RAW_PATH, "utf8");
  const baseRawSha256 = crypto.createHash("sha256").update(baseContents).digest("hex");
  const supplement01RawSha256 = crypto.createHash("sha256").update(supplement01Contents).digest("hex");
  const supplement02RawSha256 = crypto.createHash("sha256").update(supplement02Contents).digest("hex");
  if (baseRawSha256 !== EXPECTED_BASE_RAW_SHA256
    || supplement01RawSha256 !== EXPECTED_SUPPLEMENT01_RAW_SHA256
    || supplement02RawSha256 !== EXPECTED_SUPPLEMENT02_RAW_SHA256) {
    throw new Error("supplement03-historical-raw-sha256-mismatch");
  }
  const baseRaw = JSON.parse(baseContents);
  const supplement01Raw = JSON.parse(supplement01Contents);
  const supplement02Raw = JSON.parse(supplement02Contents);
  const supplement03Raw = JSON.parse(await readFile(SUPPLEMENT03_RAW_PATH, "utf8"));
  validateSupplement03RawStructure(supplement03Raw, baseRaw, supplement01Raw, supplement02Raw);
  return {
    status: "PASS",
    mode: "analyze-supplement03",
    calledWikidata: false,
    raw: SUPPLEMENT03_RAW_RELATIVE_PATH,
    retrievedAt: supplement03Raw.retrievedAt,
    source: supplement03Raw.source,
    supplementScope: supplement03Raw.supplementScope,
    evidenceGateSummary: supplement03Raw.evidenceGateSummary,
    duplicateChecks: supplement03Raw.duplicateChecks,
    candidateLevelEvidenceIssues: supplement03Raw.candidateLevelEvidenceIssues,
    mergedPoolAnalysis: analyzeMergedCandidatePoolFourRounds(baseRaw, supplement01Raw, supplement02Raw, supplement03Raw),
  };
}

function supplementStructureFixture(baseRaw) {
  const scope = createSupplementCandidateScope(baseRaw);
  return {
    schemaVersion: "route-v2-poi-baseline-p1b-batch01-candidate-supplement01-evidence-v1",
    retrievedAt: "2026-07-16T00:00:00.000Z",
    baseRawSha256: EXPECTED_BASE_RAW_SHA256,
    supplementScope: {
      candidateCount: scope.length,
      candidateKeys: scope.map((candidate) => candidate.candidateKey),
      operationCounts: Object.fromEntries(SUPPLEMENT_OPERATIONS.map((operation) => [
        operation,
        scope.filter((candidate) => candidate.operation === operation).length,
      ])),
    },
    source: { fatalErrors: 0 },
    candidates: scope.map((candidate) => ({
      candidateKey: candidate.candidateKey,
      candidateName: candidate.candidateName,
      operation: candidate.operation,
      sourceRound: "supplement01",
      search: { queries: candidate.searchTerms, results: [] },
      candidateEntities: [],
      evidenceIssues: [],
      status: "identity-ambiguous",
    })),
    candidateLevelEvidenceIssues: [],
  };
}

function supplement02StructureFixture(baseRaw, supplement01Raw, suppliedScope = null) {
  const scope = suppliedScope || createSupplement02CandidateScope(baseRaw, supplement01Raw);
  return {
    schemaVersion: "route-v2-poi-baseline-p1b-batch01-candidate-supplement02-evidence-v1",
    retrievedAt: "2026-07-16T00:00:00.000Z",
    baseRawSha256: EXPECTED_BASE_RAW_SHA256,
    supplement01RawSha256: EXPECTED_SUPPLEMENT01_RAW_SHA256,
    supplementScope: {
      candidateCount: scope.length,
      candidateKeys: scope.map((candidate) => candidate.candidateKey),
      operationCounts: Object.fromEntries(SUPPLEMENT_OPERATIONS.map((operation) => [
        operation,
        scope.filter((candidate) => candidate.operation === operation).length,
      ])),
    },
    source: { fatalErrors: 0 },
    candidates: scope.map((candidate) => ({
      candidateKey: candidate.candidateKey,
      candidateName: candidate.candidateName,
      city: candidate.city,
      cityQid: candidate.cityQid,
      countryCode: candidate.countryCode,
      operation: candidate.operation,
      sourceRound: "supplement02",
      search: { queries: candidate.searchTerms, results: [] },
      candidateEntities: [],
      evidenceIssues: [],
      selectedQid: null,
      status: "identity-ambiguous",
    })),
    candidateLevelEvidenceIssues: [],
  };
}

function supplement03StructureFixture(baseRaw, supplement01Raw, supplement02Raw, suppliedScope = null) {
  const scope = suppliedScope || createSupplement03CandidateScope(baseRaw, supplement01Raw, supplement02Raw);
  return {
    schemaVersion: "route-v2-poi-baseline-p1b-batch01-candidate-supplement03-evidence-v1",
    retrievedAt: "2026-07-16T00:00:00.000Z",
    baseRawSha256: EXPECTED_BASE_RAW_SHA256,
    supplement01RawSha256: EXPECTED_SUPPLEMENT01_RAW_SHA256,
    supplement02RawSha256: EXPECTED_SUPPLEMENT02_RAW_SHA256,
    supplementScope: {
      candidateCount: scope.length,
      candidateKeys: scope.map((candidate) => candidate.candidateKey),
      operationCounts: Object.fromEntries(SUPPLEMENT_OPERATIONS.map((operation) => [
        operation,
        scope.filter((candidate) => candidate.operation === operation).length,
      ])),
    },
    source: { fatalErrors: 0 },
    candidates: scope.map((candidate) => ({
      candidateKey: candidate.candidateKey,
      candidateName: candidate.candidateName,
      city: candidate.city,
      cityQid: candidate.cityQid,
      countryCode: candidate.countryCode,
      operation: candidate.operation,
      sourceRound: "supplement03",
      search: { queries: candidate.searchTerms, results: [] },
      candidateEntities: [],
      evidenceIssues: [],
      selectedQid: null,
      status: "identity-ambiguous",
    })),
    candidateLevelEvidenceIssues: [],
  };
}

function validateSupplementRawStructure(raw) {
  if (raw.baseRawSha256 !== EXPECTED_BASE_RAW_SHA256) throw new Error("supplement-structure-base-hash-mismatch");
  if (!Number.isFinite(Date.parse(raw.retrievedAt || ""))) throw new Error("supplement-structure-invalid-retrieved-at");
  if (raw.supplementScope?.candidateCount !== 44 || raw.candidates?.length !== 44) {
    throw new Error(`supplement-structure-candidate-count:${raw.candidates?.length}`);
  }
  const expectedKeys = raw.supplementScope.candidateKeys || [];
  const actualKeys = raw.candidates.map((candidate) => candidate.candidateKey);
  if (expectedKeys.length !== 44 || new Set(expectedKeys).size !== 44
    || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("supplement-structure-candidate-key-order-mismatch");
  }
  if (JSON.stringify(raw.candidates.map((candidate) => candidate.candidateName))
    !== JSON.stringify(EXPECTED_SUPPLEMENT_CANDIDATE_NAMES)) {
    throw new Error("supplement-structure-candidate-name-order-mismatch");
  }
  const operationCounts = Object.fromEntries(SUPPLEMENT_OPERATIONS.map((operation) => [
    operation,
    raw.candidates.filter((candidate) => candidate.operation === operation).length,
  ]));
  if (JSON.stringify(operationCounts) !== JSON.stringify(raw.supplementScope.operationCounts)) {
    throw new Error("supplement-structure-operation-count-mismatch");
  }
  const allowedStatuses = new Set([
    "pass", "conditional-manual", "identity-ambiguous", "parent-failed", "country-failed",
    "coordinate-failed", "out-of-scope", "duplicate",
  ]);
  for (const candidate of raw.candidates) {
    if (candidate.sourceRound !== "supplement01" || !SUPPLEMENT_OPERATIONS.includes(candidate.operation)) {
      throw new Error(`supplement-structure-candidate-metadata:${candidate.candidateKey}`);
    }
    if (!candidate.search || !Array.isArray(candidate.candidateEntities)
      || !Array.isArray(candidate.evidenceIssues) || !allowedStatuses.has(candidate.status)) {
      throw new Error(`supplement-structure-candidate-evidence:${candidate.candidateKey}`);
    }
  }
  const issueFields = [
    "candidateKey", "evidenceIssueType", "failedStage", "httpStatus", "timeout",
    "attempts", "retries", "queryScope", "relatedQids",
  ];
  for (const issue of raw.candidateLevelEvidenceIssues || []) {
    if (!actualKeys.includes(issue.candidateKey) || issueFields.some((field) => !(field in issue))) {
      throw new Error(`supplement-structure-candidate-issue:${issue.candidateKey || "missing"}`);
    }
  }
  if (raw.source?.candidateLevelEvidenceIssues !== undefined
    && raw.source.candidateLevelEvidenceIssues !== (raw.candidateLevelEvidenceIssues || []).length) {
    throw new Error("supplement-structure-candidate-issue-count-mismatch");
  }
  for (const field of [
    "relationDiscoveryRequests", "relationDiscoverySucceeded", "relationDiscoveryTimedOut",
    "relatedEntityQidCount", "relatedEntityExactBatches", "relatedEntityParentRequests",
    "relatedEntityParentSucceeded", "relatedEntityParentTimedOut",
  ]) {
    if (raw.source?.[field] !== undefined && (!Number.isInteger(raw.source[field]) || raw.source[field] < 0)) {
      throw new Error(`supplement-structure-telemetry:${field}`);
    }
  }
  if ((raw.source?.fatalErrors || 0) !== 0) throw new Error("supplement-structure-has-fatal-errors");
  return true;
}

function validateSupplement02RawStructure(raw, baseRaw, supplement01Raw) {
  if (raw.schemaVersion !== "route-v2-poi-baseline-p1b-batch01-candidate-supplement02-evidence-v1") {
    throw new Error("supplement02-structure-schema-version");
  }
  if (raw.baseRawSha256 !== EXPECTED_BASE_RAW_SHA256) throw new Error("supplement02-structure-base-hash-mismatch");
  if (raw.supplement01RawSha256 !== EXPECTED_SUPPLEMENT01_RAW_SHA256) {
    throw new Error("supplement02-structure-supplement01-hash-mismatch");
  }
  if (!Number.isFinite(Date.parse(raw.retrievedAt || ""))) throw new Error("supplement02-structure-invalid-retrieved-at");
  const scope = createSupplement02CandidateScope(baseRaw, supplement01Raw);
  const expectedKeys = scope.map((candidate) => candidate.candidateKey);
  const actualKeys = (raw.candidates || []).map((candidate) => candidate.candidateKey);
  if (raw.supplementScope?.candidateCount !== 12 || raw.candidates?.length !== 12
    || JSON.stringify(raw.supplementScope?.candidateKeys) !== JSON.stringify(expectedKeys)
    || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("supplement02-structure-candidate-key-order-mismatch");
  }
  if (JSON.stringify(raw.candidates.map((candidate) => candidate.candidateName))
    !== JSON.stringify(EXPECTED_SUPPLEMENT02_CANDIDATE_NAMES)) {
    throw new Error("supplement02-structure-candidate-name-order-mismatch");
  }
  const historicalKeys = new Set([
    ...baseRaw.candidates.map((candidate) => candidateKey(candidate.input.cityQid, candidate.input.name)),
    ...supplement01Raw.candidates.map((candidate) => candidate.candidateKey),
  ]);
  const allowedStatuses = new Set([
    "pass", "conditional-manual", "identity-ambiguous", "parent-failed", "country-failed",
    "coordinate-failed", "out-of-scope", "duplicate",
  ]);
  for (const candidate of raw.candidates) {
    if (historicalKeys.has(candidate.candidateKey) || candidate.sourceRound !== "supplement02"
      || candidate.operation !== "additional-buffer" || !candidate.search
      || !Array.isArray(candidate.candidateEntities) || !Array.isArray(candidate.evidenceIssues)
      || !allowedStatuses.has(candidate.status)) {
      throw new Error(`supplement02-structure-candidate:${candidate.candidateKey}`);
    }
    if (candidate.evidenceIssues.length > 0 && candidate.status === "pass") {
      throw new Error(`supplement02-structure-issue-candidate-pass:${candidate.candidateKey}`);
    }
  }
  const issueFields = [
    "candidateKey", "evidenceIssueType", "failedStage", "httpStatus", "timeout",
    "attempts", "retries", "queryScope", "relatedQids",
  ];
  for (const issue of raw.candidateLevelEvidenceIssues || []) {
    if (!actualKeys.includes(issue.candidateKey) || issueFields.some((field) => !(field in issue))) {
      throw new Error(`supplement02-structure-candidate-issue:${issue.candidateKey || "missing"}`);
    }
  }
  if (raw.source?.candidateLevelEvidenceIssues !== undefined
    && raw.source.candidateLevelEvidenceIssues !== (raw.candidateLevelEvidenceIssues || []).length) {
    throw new Error("supplement02-structure-candidate-issue-count-mismatch");
  }
  if ((raw.source?.fatalErrors || 0) !== 0) throw new Error("supplement02-structure-has-fatal-errors");
  return true;
}

function validateSupplement03RawStructure(raw, baseRaw, supplement01Raw, supplement02Raw) {
  if (raw.schemaVersion !== "route-v2-poi-baseline-p1b-batch01-candidate-supplement03-evidence-v1") {
    throw new Error("supplement03-structure-schema-version");
  }
  if (raw.baseRawSha256 !== EXPECTED_BASE_RAW_SHA256
    || raw.supplement01RawSha256 !== EXPECTED_SUPPLEMENT01_RAW_SHA256
    || raw.supplement02RawSha256 !== EXPECTED_SUPPLEMENT02_RAW_SHA256) {
    throw new Error("supplement03-structure-historical-hash-mismatch");
  }
  if (!Number.isFinite(Date.parse(raw.retrievedAt || ""))) throw new Error("supplement03-structure-invalid-retrieved-at");
  const scope = createSupplement03CandidateScope(baseRaw, supplement01Raw, supplement02Raw);
  const expectedKeys = scope.map((candidate) => candidate.candidateKey);
  const actualKeys = (raw.candidates || []).map((candidate) => candidate.candidateKey);
  if (raw.supplementScope?.candidateCount !== 9 || raw.candidates?.length !== 9
    || JSON.stringify(raw.supplementScope?.candidateKeys) !== JSON.stringify(expectedKeys)
    || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("supplement03-structure-candidate-key-order-mismatch");
  }
  if (JSON.stringify(raw.candidates.map((candidate) => candidate.candidateName))
    !== JSON.stringify(EXPECTED_SUPPLEMENT03_CANDIDATE_NAMES)) {
    throw new Error("supplement03-structure-candidate-name-order-mismatch");
  }
  const historicalKeys = new Set([
    ...baseRaw.candidates.map((candidate) => candidateKey(candidate.input.cityQid, candidate.input.name)),
    ...supplement01Raw.candidates.map((candidate) => candidate.candidateKey),
    ...supplement02Raw.candidates.map((candidate) => candidate.candidateKey),
  ]);
  const allowedStatuses = new Set([
    "pass", "conditional-manual", "identity-ambiguous", "parent-failed", "country-failed",
    "coordinate-failed", "out-of-scope", "duplicate",
  ]);
  for (const candidate of raw.candidates) {
    if (historicalKeys.has(candidate.candidateKey) || candidate.sourceRound !== "supplement03"
      || candidate.operation !== "additional-buffer" || !candidate.search
      || !Array.isArray(candidate.candidateEntities) || !Array.isArray(candidate.evidenceIssues)
      || !allowedStatuses.has(candidate.status)) {
      throw new Error(`supplement03-structure-candidate:${candidate.candidateKey}`);
    }
    if (candidate.evidenceIssues.length > 0 && candidate.status === "pass") {
      throw new Error(`supplement03-structure-issue-candidate-pass:${candidate.candidateKey}`);
    }
  }
  const issueFields = [
    "candidateKey", "evidenceIssueType", "failedStage", "httpStatus", "timeout",
    "attempts", "retries", "queryScope", "relatedQids",
  ];
  for (const issue of raw.candidateLevelEvidenceIssues || []) {
    if (!actualKeys.includes(issue.candidateKey) || issueFields.some((field) => !(field in issue))) {
      throw new Error(`supplement03-structure-candidate-issue:${issue.candidateKey || "missing"}`);
    }
  }
  if (raw.source?.candidateLevelEvidenceIssues !== undefined
    && raw.source.candidateLevelEvidenceIssues !== (raw.candidateLevelEvidenceIssues || []).length) {
    throw new Error("supplement03-structure-candidate-issue-count-mismatch");
  }
  if ((raw.source?.fatalErrors || 0) !== 0) throw new Error("supplement03-structure-has-fatal-errors");
  return true;
}

function collectOfflineP31Evidence(raw, { statuses = null } = {}) {
  const includedStatuses = statuses ? new Set(statuses) : null;
  const blockingTypeQidSet = new Set(raw.blockingTypeQids || []);
  const selectedCandidates = (raw.candidates || []).filter((candidate) => candidate.selectedQid
    && (!includedStatuses || includedStatuses.has(candidate.status)));
  const combinationsByKey = new Map();
  let completeP31KeyCandidateCount = 0;
  for (const candidate of selectedCandidates) {
    const entity = candidate.candidateEntities.find((value) => value.qid === candidate.selectedQid);
    const typeQids = stableUnique(entity?.p31Evidence?.sortedTypeQids || []);
    const p31Key = typeQids.join("|");
    if (p31Key) completeP31KeyCandidateCount += 1;
    const blockingTypeQids = typeQids.filter((qid) => blockingTypeQidSet.has(qid));
    const current = combinationsByKey.get(p31Key) || {
      p31Key,
      candidateCount: 0,
      examplePois: [],
      typeQids,
      blockingTypeQids,
      currentEvidenceDisposition: blockingTypeQids.length > 0 ? "blocking" : "unresolved",
    };
    current.candidateCount += 1;
    current.examplePois = stableUnique([...current.examplePois, candidate.input.name]);
    combinationsByKey.set(p31Key, current);
  }
  return {
    selectedEntityCount: selectedCandidates.length,
    completeP31KeyCandidateCount,
    completeP31KeyCount: [...combinationsByKey.keys()].filter(Boolean).length,
    incompleteP31KeyCandidateCount: selectedCandidates.length - completeP31KeyCandidateCount,
    combinations: [...combinationsByKey.values()].sort((left, right) => left.p31Key.localeCompare(right.p31Key, "en")),
  };
}

function analyzeExistingEvidence(raw) {
  return {
    status: "PASS",
    mode: "analyze-existing-evidence",
    calledWikidata: false,
    raw: RAW_RELATIVE_PATH,
    retrievedAt: raw.retrievedAt,
    historicalNumericP31PolicyEvidencePreserved: true,
    selectedEntityP31Evidence: collectOfflineP31Evidence(raw),
    usableCandidateP31Evidence: collectOfflineP31Evidence(raw, {
      statuses: ["pass", "conditional-manual"],
    }),
  };
}

function resolveSupplementStatus({ preParentStatus, parentEvidence, evidenceIssues = [] }) {
  const hardFailureStatuses = new Set([
    "identity-ambiguous", "country-failed", "coordinate-failed", "out-of-scope", "duplicate",
  ]);
  if (hardFailureStatuses.has(preParentStatus)) return preParentStatus;
  if (!parentEvidence?.accepted) return "parent-failed";
  if (preParentStatus === "conditional-manual" || parentEvidence.requiresManualReview || evidenceIssues.length > 0) {
    return "conditional-manual";
  }
  return "pass";
}

function municipalityBridgeEvidence({ city, cityQid, directLocationEntities = [], relations = [] }) {
  const cityName = normalizeName(city);
  const sameNameLocationQids = stableUnique(directLocationEntities
    .filter((entity) => normalizeName(entity.labelEn) === cityName)
    .map((entity) => entity.qid));
  const structuredRelations = relations.filter((relation) => relation.cityQid === cityQid
    && sameNameLocationQids.includes(relation.municipalityQid))
    .map((relation) => ({
      municipalityQid: relation.municipalityQid,
      cityQid: relation.cityQid,
      property: relation.property,
      direction: relation.direction,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));
  return {
    sameNameLocationQids,
    structuredRelations,
    coordinateDistanceUsed: false,
    requiresManualReview: structuredRelations.length > 0,
    accepted: structuredRelations.length > 0,
  };
}

function mergedCandidateRecordFromBase(candidate) {
  return {
    candidateKey: candidateKey(candidate.input.cityQid, candidate.input.name),
    candidateName: candidate.input.name,
    city: candidate.input.city,
    cityQid: candidate.input.cityQid,
    countryCode: candidate.input.countryCode,
    status: candidate.status,
    baseStatus: candidate.status,
    supplementStatus: null,
    selectedQid: candidate.selectedQid,
    candidateEntities: candidate.candidateEntities,
    sourceRound: "base",
    baseCandidate: candidate,
    supplementCandidate: null,
  };
}

function mergeCandidatePools(baseRaw, supplementRaw) {
  const baseRecords = (baseRaw.candidates || []).map(mergedCandidateRecordFromBase);
  const baseByKey = new Map(baseRecords.map((record) => [record.candidateKey, record]));
  const supplementByKey = new Map();
  for (const candidate of supplementRaw.candidates || []) {
    if (supplementByKey.has(candidate.candidateKey)) throw new Error(`duplicate-supplement-merge-key:${candidate.candidateKey}`);
    supplementByKey.set(candidate.candidateKey, candidate);
  }
  const merged = baseRecords.map((baseRecord) => {
    const supplementCandidate = supplementByKey.get(baseRecord.candidateKey);
    if (!supplementCandidate) return baseRecord;
    supplementByKey.delete(baseRecord.candidateKey);
    return {
      ...baseRecord,
      status: supplementCandidate.status,
      supplementStatus: supplementCandidate.status,
      selectedQid: supplementCandidate.selectedQid,
      candidateEntities: supplementCandidate.candidateEntities,
      sourceRound: "supplement01",
      supplementCandidate,
    };
  });
  for (const supplementCandidate of supplementByKey.values()) {
    merged.push({
      candidateKey: supplementCandidate.candidateKey,
      candidateName: supplementCandidate.candidateName,
      city: supplementCandidate.city || supplementCandidate.input?.city,
      cityQid: supplementCandidate.cityQid || supplementCandidate.input?.cityQid,
      countryCode: supplementCandidate.countryCode || supplementCandidate.input?.countryCode,
      status: supplementCandidate.status,
      baseStatus: null,
      supplementStatus: supplementCandidate.status,
      selectedQid: supplementCandidate.selectedQid,
      candidateEntities: supplementCandidate.candidateEntities,
      sourceRound: "supplement01",
      baseCandidate: null,
      supplementCandidate,
    });
  }
  return merged;
}

function candidateP31Disposition(status) {
  if (status === "pass") return "informational-candidate";
  if (status === "conditional-manual") return "manual-review-candidate";
  if (status === "identity-ambiguous") return "unresolved";
  return "blocking";
}

function collectMergedP31Scope(records, { statuses = null, blockingTypeQids = [] } = {}) {
  const includedStatuses = statuses ? new Set(statuses) : null;
  const blockingTypeQidSet = new Set(blockingTypeQids);
  const selected = records.filter((record) => record.selectedQid
    && (!includedStatuses || includedStatuses.has(record.status)));
  const byKey = new Map();
  let completeP31KeyCandidateCount = 0;
  for (const record of selected) {
    const entity = (record.candidateEntities || []).find((value) => value.qid === record.selectedQid);
    const typeQids = stableUnique(entity?.p31Evidence?.sortedTypeQids || []);
    const p31Key = typeQids.join("|");
    if (p31Key) completeP31KeyCandidateCount += 1;
    const current = byKey.get(p31Key) || {
      p31Key,
      candidateCount: 0,
      typeQids,
      blockingTypeQids: typeQids.filter((qid) => blockingTypeQidSet.has(qid)),
      sourceRounds: [],
      examples: [],
      candidateDispositions: [],
    };
    const disposition = candidateP31Disposition(record.status);
    current.candidateCount += 1;
    current.sourceRounds = stableUnique([...current.sourceRounds, record.sourceRound]);
    current.candidateDispositions = stableUnique([...current.candidateDispositions, disposition]);
    current.examples.push({
      candidateKey: record.candidateKey,
      candidateName: record.candidateName,
      selectedQid: record.selectedQid,
      sourceRound: record.sourceRound,
      status: record.status,
      disposition,
    });
    current.examples.sort((left, right) => left.candidateKey.localeCompare(right.candidateKey, "en"));
    byKey.set(p31Key, current);
  }
  return {
    selectedEntityCount: selected.length,
    completeP31KeyCandidateCount,
    completeP31KeyCount: [...byKey.keys()].filter(Boolean).length,
    incompleteP31KeyCandidateCount: selected.length - completeP31KeyCandidateCount,
    combinations: [...byKey.values()].sort((left, right) => left.p31Key.localeCompare(right.p31Key, "en")),
  };
}

function collectMergedP31Evidence(records, { blockingTypeQids = [] } = {}) {
  return {
    classifierImplemented: false,
    keyAlgorithm: "[...new Set(qids)].sort().join('|')",
    selectedEntityP31Evidence: collectMergedP31Scope(records, { blockingTypeQids }),
    usableCandidateP31Evidence: collectMergedP31Scope(records, {
      statuses: ["pass", "conditional-manual"],
      blockingTypeQids,
    }),
  };
}

function analyzeMergedCandidatePool(baseRaw, supplementRaw) {
  const records = mergeCandidatePools(baseRaw, supplementRaw);
  const usableStatuses = new Set(["pass", "conditional-manual"]);
  const cityOrder = stableUnique((baseRaw.candidates || []).map((candidate) => candidate.input.city));
  const citySummaries = cityOrder.map((city) => {
    const cityRecords = records.filter((record) => record.city === city);
    const baseCandidates = (baseRaw.candidates || []).filter((candidate) => candidate.input.city === city);
    const recovered = cityRecords.filter((record) => record.baseStatus
      && !usableStatuses.has(record.baseStatus)
      && usableStatuses.has(record.supplementStatus));
    const newUsable = cityRecords.filter((record) => record.baseStatus === null && usableStatuses.has(record.status));
    const totalUsable = cityRecords.filter((record) => usableStatuses.has(record.status)).length;
    return {
      city,
      cityQid: cityRecords[0]?.cityQid || "",
      baseUsable: baseCandidates.filter((candidate) => usableStatuses.has(candidate.status)).length,
      recoveredUsable: recovered.length,
      newUsable: newUsable.length,
      totalUsable,
      blockingOrUnresolved: cityRecords.length - totalUsable,
      atLeastFourUsable: totalUsable >= 4,
    };
  });
  return {
    baseCandidateCount: (baseRaw.candidates || []).length,
    supplementCandidateCount: (supplementRaw.candidates || []).length,
    mergedCandidateCount: records.length,
    citySummaries,
    everyCityHasAtLeastFourUsable: citySummaries.every((city) => city.atLeastFourUsable),
    ...collectMergedP31Evidence(records, { blockingTypeQids: baseRaw.blockingTypeQids || BLOCKING_TYPE_QIDS }),
  };
}

function mergeCandidatePoolsThreeRounds(baseRaw, supplement01Raw, supplement02Raw) {
  const records = mergeCandidatePools(baseRaw, supplement01Raw).map((record) => ({
    ...record,
    supplement01Status: record.supplementStatus,
    supplement02Status: null,
  }));
  const keys = new Set(records.map((record) => record.candidateKey));
  for (const candidate of supplement02Raw.candidates || []) {
    if (keys.has(candidate.candidateKey)) throw new Error(`duplicate-three-round-merge-key:${candidate.candidateKey}`);
    keys.add(candidate.candidateKey);
    records.push({
      candidateKey: candidate.candidateKey,
      candidateName: candidate.candidateName,
      city: candidate.city || candidate.input?.city,
      cityQid: candidate.cityQid || candidate.input?.cityQid,
      countryCode: candidate.countryCode || candidate.input?.countryCode,
      status: candidate.status,
      baseStatus: null,
      supplementStatus: candidate.status,
      supplement01Status: null,
      supplement02Status: candidate.status,
      selectedQid: candidate.selectedQid,
      candidateEntities: candidate.candidateEntities,
      sourceRound: "supplement02",
      baseCandidate: null,
      supplementCandidate: null,
      supplement02Candidate: candidate,
    });
  }
  return records;
}

function analyzeMergedCandidatePoolThreeRounds(baseRaw, supplement01Raw, supplement02Raw) {
  const records = mergeCandidatePoolsThreeRounds(baseRaw, supplement01Raw, supplement02Raw);
  const usableStatuses = new Set(["pass", "conditional-manual"]);
  const cityOrder = stableUnique((baseRaw.candidates || []).map((candidate) => candidate.input.city));
  const citySummaries = cityOrder.map((city) => {
    const cityRecords = records.filter((record) => record.city === city);
    const baseCandidates = baseRaw.candidates.filter((candidate) => candidate.input.city === city);
    const supplement01RecoveredUsable = cityRecords.filter((record) => record.sourceRound === "supplement01"
      && record.baseStatus && !usableStatuses.has(record.baseStatus) && usableStatuses.has(record.status)).length;
    const supplement01NewUsable = cityRecords.filter((record) => record.sourceRound === "supplement01"
      && record.baseStatus === null && usableStatuses.has(record.status)).length;
    const supplement02Usable = cityRecords.filter((record) => record.sourceRound === "supplement02"
      && usableStatuses.has(record.status)).length;
    const totalUsable = cityRecords.filter((record) => usableStatuses.has(record.status)).length;
    return {
      city,
      cityQid: cityRecords[0]?.cityQid || "",
      baseUsable: baseCandidates.filter((candidate) => usableStatuses.has(candidate.status)).length,
      supplement01RecoveredUsable,
      supplement01NewUsable,
      supplement02Usable,
      totalUsable,
      blockingOrUnresolved: cityRecords.length - totalUsable,
      atLeastFourUsable: totalUsable >= 4,
    };
  });
  return {
    baseCandidateCount: baseRaw.candidates.length,
    supplement01CandidateCount: supplement01Raw.candidates.length,
    supplement02CandidateCount: supplement02Raw.candidates.length,
    mergedCandidateCount: records.length,
    uniqueCandidateKeyCount: new Set(records.map((record) => record.candidateKey)).size,
    citySummaries,
    everyCityHasAtLeastFourUsable: citySummaries.every((city) => city.atLeastFourUsable),
    ...collectMergedP31Evidence(records, { blockingTypeQids: baseRaw.blockingTypeQids || BLOCKING_TYPE_QIDS }),
  };
}

function mergeCandidatePoolsFourRounds(baseRaw, supplement01Raw, supplement02Raw, supplement03Raw) {
  const records = mergeCandidatePoolsThreeRounds(baseRaw, supplement01Raw, supplement02Raw).map((record) => ({
    ...record,
    supplement03Status: null,
  }));
  const keys = new Set(records.map((record) => record.candidateKey));
  for (const candidate of supplement03Raw.candidates || []) {
    if (keys.has(candidate.candidateKey)) throw new Error(`duplicate-four-round-merge-key:${candidate.candidateKey}`);
    keys.add(candidate.candidateKey);
    records.push({
      candidateKey: candidate.candidateKey,
      candidateName: candidate.candidateName,
      city: candidate.city || candidate.input?.city,
      cityQid: candidate.cityQid || candidate.input?.cityQid,
      countryCode: candidate.countryCode || candidate.input?.countryCode,
      status: candidate.status,
      baseStatus: null,
      supplementStatus: candidate.status,
      supplement01Status: null,
      supplement02Status: null,
      supplement03Status: candidate.status,
      selectedQid: candidate.selectedQid,
      candidateEntities: candidate.candidateEntities,
      sourceRound: "supplement03",
      baseCandidate: null,
      supplementCandidate: null,
      supplement02Candidate: null,
      supplement03Candidate: candidate,
    });
  }
  return records;
}

function finalSupplementDecision(citySummaries) {
  const freezePrerequisiteMet = citySummaries.every((city) => city.atLeastFourUsable);
  return {
    freezePrerequisiteMet,
    finalSetFrozen: false,
    supplement04Started: false,
    nextStep: freezePrerequisiteMet
      ? "freeze-30-plus-10-may-be-considered-in-a-later-turn"
      : "revisit-batch-scale-or-3-plus-1-rule",
  };
}

function analyzeMergedCandidatePoolFourRounds(baseRaw, supplement01Raw, supplement02Raw, supplement03Raw) {
  const records = mergeCandidatePoolsFourRounds(baseRaw, supplement01Raw, supplement02Raw, supplement03Raw);
  const usableStatuses = new Set(["pass", "conditional-manual"]);
  const cityOrder = stableUnique(baseRaw.candidates.map((candidate) => candidate.input.city));
  const citySummaries = cityOrder.map((city) => {
    const cityRecords = records.filter((record) => record.city === city);
    const baseCandidates = baseRaw.candidates.filter((candidate) => candidate.input.city === city);
    const supplement01RecoveredUsable = cityRecords.filter((record) => record.sourceRound === "supplement01"
      && record.baseStatus && !usableStatuses.has(record.baseStatus) && usableStatuses.has(record.status)).length;
    const supplement01NewUsable = cityRecords.filter((record) => record.sourceRound === "supplement01"
      && record.baseStatus === null && usableStatuses.has(record.status)).length;
    const supplement02Usable = cityRecords.filter((record) => record.sourceRound === "supplement02"
      && usableStatuses.has(record.status)).length;
    const supplement03Usable = cityRecords.filter((record) => record.sourceRound === "supplement03"
      && usableStatuses.has(record.status)).length;
    const totalUsable = cityRecords.filter((record) => usableStatuses.has(record.status)).length;
    return {
      city,
      cityQid: cityRecords[0]?.cityQid || "",
      baseUsable: baseCandidates.filter((candidate) => usableStatuses.has(candidate.status)).length,
      supplement01RecoveredUsable,
      supplement01NewUsable,
      supplement01Usable: supplement01RecoveredUsable + supplement01NewUsable,
      supplement02Usable,
      supplement03Usable,
      totalUsable,
      blockingOrUnresolved: cityRecords.length - totalUsable,
      atLeastFourUsable: totalUsable >= 4,
    };
  });
  return {
    baseCandidateCount: baseRaw.candidates.length,
    supplement01CandidateCount: supplement01Raw.candidates.length,
    supplement02CandidateCount: supplement02Raw.candidates.length,
    supplement03CandidateCount: supplement03Raw.candidates.length,
    mergedCandidateCount: records.length,
    uniqueCandidateKeyCount: new Set(records.map((record) => record.candidateKey)).size,
    citySummaries,
    everyCityHasAtLeastFourUsable: citySummaries.every((city) => city.atLeastFourUsable),
    ...finalSupplementDecision(citySummaries),
    ...collectMergedP31Evidence(records, { blockingTypeQids: baseRaw.blockingTypeQids || BLOCKING_TYPE_QIDS }),
  };
}

function validateCreatedFromRawHashes(hashes) {
  for (const [round, expectedHash] of Object.entries(EXPECTED_SELECTION_RAW_HASHES)) {
    if (hashes?.[round] !== expectedHash) {
      throw new Error(`selection-raw-hash-mismatch:${round}:${hashes?.[round] ?? "missing"}:${expectedHash}`);
    }
  }
  if (Object.keys(hashes || {}).length !== Object.keys(EXPECTED_SELECTION_RAW_HASHES).length) {
    throw new Error("selection-raw-hash-mismatch:unexpected-hash-fields");
  }
  return true;
}

function classifyNumericP31Key(p31Key, { knownTypeQids = [], projectionExact = true } = {}) {
  const typeQids = p31Key ? p31Key.split("|") : [];
  if (typeQids.some((qid) => SELECTION_BLOCKING_TYPE_QID_SET.has(qid))) return "blocking";
  const knownTypeQidSet = new Set(knownTypeQids);
  if (typeQids.length === 0 || typeQids.some((qid) => !knownTypeQidSet.has(qid))) return "manual-review";
  if (!projectionExact) return "manual-review";
  return INFORMATIONAL_P31_EXACT_KEYS.includes(p31Key) ? "informational" : "manual-review";
}

function validateSelectionQidSafety(candidates, protectedScope = {}) {
  const protectedQids = new Map([
    ...(protectedScope.pilotPoiQids || []).map((qid) => [qid, "pilot-poi"]),
    ...(protectedScope.countryQids || []).map((qid) => [qid, "country"]),
    ...(protectedScope.cityQids || []).map((qid) => [qid, "city"]),
  ]);
  for (const candidate of candidates) {
    const overlapKind = protectedQids.get(candidate.selectedQid);
    if (overlapKind) throw new Error(`selection-protected-qid-overlap:${candidate.selectedQid}:${overlapKind}`);
  }
  return true;
}

function sourceRawForRound(sourceRound, raws) {
  const source = {
    base: { raw: raws.baseRaw, rawPath: RAW_RELATIVE_PATH },
    supplement01: { raw: raws.supplement01Raw, rawPath: SUPPLEMENT_RAW_RELATIVE_PATH },
    supplement02: { raw: raws.supplement02Raw, rawPath: SUPPLEMENT02_RAW_RELATIVE_PATH },
    supplement03: { raw: raws.supplement03Raw, rawPath: SUPPLEMENT03_RAW_RELATIVE_PATH },
  }[sourceRound];
  if (!source) throw new Error(`selection-unknown-source-round:${sourceRound}`);
  return source;
}

function rawCandidateKey(candidate) {
  return candidate.candidateKey || candidateKey(candidate.input?.cityQid, candidate.input?.name);
}

function selectedEntityForRecord(record) {
  const entity = (record.candidateEntities || []).find((value) => value.qid === record.selectedQid);
  if (!entity) throw new Error(`selection-selected-entity-missing:${record.candidateKey}:${record.selectedQid}`);
  return entity;
}

function selectionIdentityRisk(record, entity) {
  if (!entity.p31Evidence?.sourceProjection?.exactMatch) return "p31-source-projection-difference";
  if (record.status === "conditional-manual") {
    if (entity.parentEvidence?.requiresManualReview) return `manual-parent-evidence:${entity.parentEvidence.parentEvidenceLevel}`;
    if ((entity.identityEvidence?.categories || []).length > 1) return "mixed-institution-and-physical-identity";
    return "conditional-manual-evidence-boundary";
  }
  return "low-within-frozen-evidence-gate";
}

function selectionRationale(record, entity, role) {
  const statusPriority = record.status === "pass" ? "pass-priority" : "conditional-manual-after-pass";
  const parentLevel = entity.parentEvidence?.parentEvidenceLevel || "unknown";
  return `${role}:${statusPriority};complete-country-coordinate-parent-and-p31-evidence;parent-${parentLevel};city-evidence-quality-order`;
}

function selectionCandidateFromRecord(record, raws, role) {
  const entity = selectedEntityForRecord(record);
  const typeQids = stableUnique(entity.p31Evidence?.sortedTypeQids || []);
  const source = sourceRawForRound(record.sourceRound, raws);
  const candidateIndex = (source.raw?.candidates || []).findIndex((candidate) => rawCandidateKey(candidate) === record.candidateKey);
  if (candidateIndex < 0) throw new Error(`selection-raw-traceability-missing:${record.candidateKey}:${record.sourceRound}`);
  if (!typeQids.length) throw new Error(`selection-p31-key-incomplete:${record.candidateKey}`);
  return {
    candidateKey: record.candidateKey,
    candidateName: record.candidateName,
    selectedQid: record.selectedQid,
    cityQid: record.cityQid,
    status: record.status,
    sourceRound: record.sourceRound,
    parentEvidenceLevel: entity.parentEvidence?.parentEvidenceLevel || "unknown",
    P31Key: typeQids.join("|"),
    identityRisk: selectionIdentityRisk(record, entity),
    selectionRationale: selectionRationale(record, entity, role),
    rawReference: {
      rawPath: source.rawPath,
      candidateIndex: candidateIndex + 1,
      candidateKey: record.candidateKey,
    },
  };
}

function collectSelectionP31PolicyEvidence(primaryRecords) {
  const typeEvidenceByQid = new Map();
  for (const record of primaryRecords) {
    const entity = selectedEntityForRecord(record);
    for (const typeEntity of entity.p31Evidence?.typeEntities || []) {
      const current = typeEvidenceByQid.get(typeEntity.qid) || { qid: typeEntity.qid, labelEn: "", descriptionEn: "" };
      if (!current.labelEn && typeEntity.labelEn) current.labelEn = typeEntity.labelEn;
      if (!current.descriptionEn && typeEntity.descriptionEn) current.descriptionEn = typeEntity.descriptionEn;
      typeEvidenceByQid.set(typeEntity.qid, current);
    }
    for (const qid of entity.p31Evidence?.sortedTypeQids || []) {
      if (!typeEvidenceByQid.has(qid)) typeEvidenceByQid.set(qid, { qid, labelEn: "", descriptionEn: "" });
    }
  }
  const allTypeEvidence = [...typeEvidenceByQid.values()].sort((left, right) => left.qid.localeCompare(right.qid, "en"));
  const knownPoiTypeQids = allTypeEvidence.filter((value) => value.labelEn);
  const unresolvedTypeQids = allTypeEvidence.filter((value) => !value.labelEn).map((value) => value.qid);
  const knownTypeQids = knownPoiTypeQids.map((value) => value.qid);
  const byKey = new Map();
  for (const record of primaryRecords) {
    const entity = selectedEntityForRecord(record);
    const P31Key = stableUnique(entity.p31Evidence?.sortedTypeQids || []).join("|");
    const projectionExact = entity.p31Evidence?.sourceProjection?.exactMatch === true;
    const classification = classifyNumericP31Key(P31Key, { knownTypeQids, projectionExact });
    const current = byKey.get(P31Key) || {
      P31Key,
      classification,
      primaryCandidateCount: 0,
      sourceRounds: [],
      examples: [],
      projectionExactForEveryExample: true,
    };
    current.primaryCandidateCount += 1;
    current.sourceRounds = stableUnique([...current.sourceRounds, record.sourceRound]);
    current.examples.push({
      candidateKey: record.candidateKey,
      selectedQid: record.selectedQid,
      status: record.status,
    });
    current.examples.sort((left, right) => left.candidateKey.localeCompare(right.candidateKey, "en"));
    current.projectionExactForEveryExample &&= projectionExact;
    byKey.set(P31Key, current);
  }
  const primaryKeyAssessments = [...byKey.values()].sort((left, right) => left.P31Key.localeCompare(right.P31Key, "en"));
  const keysFor = (classification) => primaryKeyAssessments
    .filter((value) => value.classification === classification)
    .map((value) => value.P31Key);
  const primaryClassificationDistribution = Object.fromEntries(["informational", "manual-review", "blocking"].map((classification) => [
    classification,
    primaryKeyAssessments
      .filter((value) => value.classification === classification)
      .reduce((count, value) => count + value.primaryCandidateCount, 0),
  ]));
  return {
    classifierImplemented: false,
    classificationBasis: "complete-sorted-numeric-p31-key-exact-match-only",
    blockingPriority: true,
    unknownTypeDefault: "manual-review",
    projectionDifferenceDefault: "manual-review",
    knownPoiTypeQids,
    blockingTypeQids: SELECTION_BLOCKING_TYPE_QIDS,
    informationalExactKeys: INFORMATIONAL_P31_EXACT_KEYS,
    manualExactKeys: keysFor("manual-review"),
    blockingExactKeys: keysFor("blocking"),
    unresolvedTypeQids,
    primaryKeyAssessments,
    primaryClassificationDistribution,
  };
}

function excludedSelectionReference(record, raws, selectedCandidateKeys) {
  const source = sourceRawForRound(record.sourceRound, raws);
  const candidateIndex = (source.raw?.candidates || []).findIndex((candidate) => rawCandidateKey(candidate) === record.candidateKey);
  if (candidateIndex < 0) throw new Error(`selection-raw-traceability-missing:${record.candidateKey}:${record.sourceRound}`);
  return {
    candidateKey: record.candidateKey,
    candidateName: record.candidateName,
    selectedQid: record.selectedQid,
    cityQid: record.cityQid,
    status: record.status,
    sourceRound: record.sourceRound,
    exclusionReason: selectedCandidateKeys.has(record.candidateKey)
      ? "selected-elsewhere"
      : (["pass", "conditional-manual"].includes(record.status)
        ? "usable-not-selected-after-city-quota-freeze"
        : `status-not-selection-eligible:${record.status}`),
    rawReference: {
      rawPath: source.rawPath,
      candidateIndex: candidateIndex + 1,
      candidateKey: record.candidateKey,
    },
  };
}

function validateSelectionDocument(selection, records, protectedScope) {
  validateCreatedFromRawHashes(selection.createdFromRawHashes);
  if (selection.policyVersion !== SELECTION_POLICY_VERSION) throw new Error("selection-policy-version-mismatch");
  if (selection.selectionRule !== SELECTION_RULE) throw new Error("selection-rule-mismatch");
  if (selection.primaryCount !== 30 || selection.primaryCandidates.length !== 30) throw new Error("selection-primary-count-mismatch");
  if (selection.backupCount !== 8 || selection.backupCandidates.length !== 8) throw new Error("selection-backup-count-mismatch");
  if (selection.cities.length !== 10 || selection.cities.some((city) => city.primaryCandidateKeys.length !== 3)) {
    throw new Error("selection-city-primary-quota-mismatch");
  }
  if (selection.cities.some((city) => city.backupCandidateKey !== null && typeof city.backupCandidateKey !== "string")) {
    throw new Error("selection-city-backup-quota-mismatch");
  }
  for (const cityName of ["Brno", "Prague"]) {
    const city = selection.cities.find((value) => value.city === cityName);
    if (!city || city.backupCandidateKey !== null || city.backupReason !== "no-fourth-usable-candidate") {
      throw new Error(`selection-null-backup-contract-mismatch:${cityName}`);
    }
  }
  const selected = [...selection.primaryCandidates, ...selection.backupCandidates];
  if (selected.some((candidate) => !["pass", "conditional-manual"].includes(candidate.status))) {
    throw new Error("selection-ineligible-status-selected");
  }
  if (selected.some((candidate) => !candidate.P31Key)) throw new Error("selection-p31-key-incomplete");
  if (new Set(selection.primaryCandidates.map((candidate) => candidate.selectedQid)).size !== selection.primaryCount) {
    throw new Error("selection-primary-qid-duplicate");
  }
  if (new Set(selection.backupCandidates.map((candidate) => candidate.selectedQid)).size !== selection.backupCount) {
    throw new Error("selection-backup-qid-duplicate");
  }
  const primaryQids = new Set(selection.primaryCandidates.map((candidate) => candidate.selectedQid));
  if (selection.backupCandidates.some((candidate) => primaryQids.has(candidate.selectedQid))) {
    throw new Error("selection-primary-backup-qid-overlap");
  }
  const recordKeys = new Set(records.map((record) => record.candidateKey));
  if (selected.some((candidate) => !recordKeys.has(candidate.candidateKey))) throw new Error("selection-candidate-not-in-merged-pool");
  validateSelectionQidSafety(selected, protectedScope);
  return true;
}

function buildSelectionDocumentFromRaws({ baseRaw, supplement01Raw, supplement02Raw, supplement03Raw, protectedScope }) {
  const raws = { baseRaw, supplement01Raw, supplement02Raw, supplement03Raw };
  const records = mergeCandidatePoolsFourRounds(baseRaw, supplement01Raw, supplement02Raw, supplement03Raw);
  const byKey = new Map(records.map((record) => [record.candidateKey, record]));
  const selectedCandidateKeys = new Set();
  const primaryRecords = [];
  const backupRecords = [];
  const cities = FROZEN_PRIMARY_CANDIDATE_KEYS.map((cityConfig) => {
    const cityPrimaryRecords = cityConfig.candidateKeys.map((key) => {
      const record = byKey.get(key);
      if (!record) throw new Error(`selection-frozen-candidate-missing:${key}`);
      if (record.cityQid !== cityConfig.cityQid) throw new Error(`selection-frozen-candidate-city-mismatch:${key}`);
      if (!["pass", "conditional-manual"].includes(record.status)) throw new Error(`selection-frozen-candidate-ineligible:${key}:${record.status}`);
      if (!record.selectedQid) throw new Error(`selection-frozen-candidate-qid-missing:${key}`);
      if (selectedCandidateKeys.has(key)) throw new Error(`selection-frozen-candidate-key-duplicate:${key}`);
      selectedCandidateKeys.add(key);
      primaryRecords.push(record);
      return record;
    });
    const backupKey = FROZEN_BACKUP_CANDIDATE_KEYS[cityConfig.cityQid];
    let backupRecord = null;
    if (backupKey) {
      backupRecord = byKey.get(backupKey);
      if (!backupRecord) throw new Error(`selection-frozen-backup-missing:${backupKey}`);
      if (backupRecord.cityQid !== cityConfig.cityQid) throw new Error(`selection-frozen-backup-city-mismatch:${backupKey}`);
      if (!["pass", "conditional-manual"].includes(backupRecord.status)) throw new Error(`selection-frozen-backup-ineligible:${backupKey}:${backupRecord.status}`);
      if (!backupRecord.selectedQid) throw new Error(`selection-frozen-backup-qid-missing:${backupKey}`);
      if (selectedCandidateKeys.has(backupKey)) throw new Error(`selection-frozen-candidate-key-duplicate:${backupKey}`);
      selectedCandidateKeys.add(backupKey);
      backupRecords.push(backupRecord);
    }
    return {
      city: cityConfig.city,
      cityQid: cityConfig.cityQid,
      primaryCandidateKeys: cityPrimaryRecords.map((record) => record.candidateKey),
      backupCandidateKey: backupRecord?.candidateKey || null,
      backupReason: backupRecord ? "optional-operational-reserve" : "no-fourth-usable-candidate",
      publishPrimaryQuotaMet: true,
      backupRequiredForPublish: false,
    };
  });
  const primaryCandidates = primaryRecords.map((record) => selectionCandidateFromRecord(record, raws, "primary"));
  const backupCandidates = backupRecords.map((record) => selectionCandidateFromRecord(record, raws, "backup"));
  const selection = {
    policyVersion: SELECTION_POLICY_VERSION,
    createdFromRawHashes: { ...EXPECTED_SELECTION_RAW_HASHES },
    selectionRule: SELECTION_RULE,
    primaryCount: primaryCandidates.length,
    backupCount: backupCandidates.length,
    cities,
    primaryCandidates,
    backupCandidates,
    excludedCandidates: records
      .filter((record) => !selectedCandidateKeys.has(record.candidateKey))
      .map((record) => excludedSelectionReference(record, raws, selectedCandidateKeys)),
    P31PolicyEvidence: collectSelectionP31PolicyEvidence(primaryRecords),
    selectionReadiness: {
      primaryReady: cities.every((city) => city.publishPrimaryQuotaMet),
      backupRequiredForPublish: false,
      publishCandidateCount: primaryCandidates.length,
      operationalReserveCount: backupCandidates.length,
      finalSetFrozen: true,
      readyForImplementationReview: true,
      published: false,
    },
  };
  validateSelectionDocument(selection, records, protectedScope);
  return selection;
}

async function readSelectionInputs() {
  const [baseContents, supplement01Contents, supplement02Contents, supplement03Contents, protectedScope] = await Promise.all([
    readFile(RAW_PATH, "utf8"),
    readFile(SUPPLEMENT_RAW_PATH, "utf8"),
    readFile(SUPPLEMENT02_RAW_PATH, "utf8"),
    readFile(SUPPLEMENT03_RAW_PATH, "utf8"),
    loadProtectedEntityScope(),
  ]);
  const createdFromRawHashes = {
    base: crypto.createHash("sha256").update(baseContents).digest("hex"),
    supplement01: crypto.createHash("sha256").update(supplement01Contents).digest("hex"),
    supplement02: crypto.createHash("sha256").update(supplement02Contents).digest("hex"),
    supplement03: crypto.createHash("sha256").update(supplement03Contents).digest("hex"),
  };
  validateCreatedFromRawHashes(createdFromRawHashes);
  return {
    baseRaw: JSON.parse(baseContents),
    supplement01Raw: JSON.parse(supplement01Contents),
    supplement02Raw: JSON.parse(supplement02Contents),
    supplement03Raw: JSON.parse(supplement03Contents),
    protectedScope,
    createdFromRawHashes,
  };
}

async function freezeSelection() {
  return persistCompletedEvidence(async () => {
    const inputs = await readSelectionInputs();
    const raw = buildSelectionDocumentFromRaws(inputs);
    const contents = serializeJson(raw);
    return {
      raw,
      contents,
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    };
  }, (contents) => writeAtomic(SELECTION_RAW_PATH, contents));
}

async function analyzeSelectionFile() {
  const inputs = await readSelectionInputs();
  const contents = await readFile(SELECTION_RAW_PATH, "utf8");
  const raw = JSON.parse(contents);
  const records = mergeCandidatePoolsFourRounds(inputs.baseRaw, inputs.supplement01Raw, inputs.supplement02Raw, inputs.supplement03Raw);
  validateSelectionDocument(raw, records, inputs.protectedScope);
  const rebuiltContents = serializeJson(buildSelectionDocumentFromRaws(inputs));
  if (contents !== rebuiltContents) throw new Error("selection-byte-determinism-mismatch");
  const primaryQids = raw.primaryCandidates.map((candidate) => candidate.selectedQid);
  const backupQids = raw.backupCandidates.map((candidate) => candidate.selectedQid);
  return {
    status: "PASS",
    mode: "selection-analysis",
    calledWikidata: false,
    selection: SELECTION_RAW_RELATIVE_PATH,
    selectionSha256: crypto.createHash("sha256").update(contents).digest("hex"),
    sizeBytes: Buffer.byteLength(contents),
    policyVersion: raw.policyVersion,
    selectionRule: raw.selectionRule,
    createdFromRawHashes: raw.createdFromRawHashes,
    primaryCount: raw.primaryCount,
    backupCount: raw.backupCount,
    cities: raw.cities,
    primaryQidsUnique: new Set(primaryQids).size === primaryQids.length,
    backupQidsUnique: new Set(backupQids).size === backupQids.length,
    primaryBackupQidsDisjoint: backupQids.every((qid) => !new Set(primaryQids).has(qid)),
    rawTraceabilityComplete: [...raw.primaryCandidates, ...raw.backupCandidates]
      .every((candidate) => candidate.rawReference?.candidateKey === candidate.candidateKey),
    p31Complete: raw.primaryCandidates.every((candidate) => Boolean(candidate.P31Key)),
    P31PolicyEvidence: raw.P31PolicyEvidence,
    selectionReadiness: raw.selectionReadiness,
    deterministicByteMatch: true,
  };
}

const EXPECTED_CANDIDATE_NAMES = Object.freeze([
  "Gold Museum", "Botero Museum", "National Museum of Colombia", "Quinta de Bolívar",
  "Museum of Antioquia", "Medellín Museum of Modern Art", "Metropolitan Cathedral of Medellín", "Rafael Uribe Uribe Palace of Culture",
  "Charles Bridge", "Municipal House", "St. Vitus Cathedral", "Prague Castle",
  "Villa Tugendhat", "Cathedral of St. Peter and Paul", "Špilberk Castle", "Brno Ossuary",
  "Helsinki Cathedral", "Temppeliaukio Church", "National Museum of Finland", "Ateneum Art Museum",
  "Turku Castle", "Turku Cathedral", "Sibelius Museum", "Turku Art Museum",
  "Rijksmuseum", "Van Gogh Museum", "Anne Frank House", "Royal Palace of Amsterdam",
  "Maritime Museum Rotterdam", "Kunsthal Rotterdam", "Euromast", "Erasmus Bridge",
  "Royal Castle in Warsaw", "Warsaw Uprising Museum", "Palace of Culture and Science", "POLIN Museum of the History of Polish Jews",
  "Wawel Royal Castle", "St. Mary’s Basilica", "Schindler’s Factory Museum", "National Museum in Kraków",
]);

function fixtureResponse(status, { payload = {}, body = "fixture-error", headers = {} } = {}) {
  const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => normalizedHeaders[String(name).toLowerCase()] ?? null },
    json: async () => payload,
    text: async () => body,
  };
}

function fixtureEntityBinding(qid) {
  return { value: `http://www.wikidata.org/entity/${qid}` };
}

function fixtureParentBinding({ qid, cityQid, pathType, depth, nodes = [] }) {
  return {
    item: fixtureEntityBinding(qid),
    approvedCity: fixtureEntityBinding(cityQid),
    pathType: { value: pathType },
    depth: { value: String(depth) },
    ...Object.fromEntries(nodes.map((nodeQid, index) => [`node${index + 1}`, fixtureEntityBinding(nodeQid)])),
  };
}

function fixturePlanCandidate(candidate, index, { selected = true, direct = false } = {}) {
  const selectedQid = selected ? `Q${90_000 + index}` : null;
  return {
    input: candidate,
    selectedQid,
    candidateEntities: selected ? [{
      qid: selectedQid,
      parentEvidence: { accepted: direct, parentEvidenceLevel: direct ? "direct" : "unconfirmed" },
    }] : [],
  };
}

async function runSelfTests() {
  const results = [];
  const supplementBaseFixture = JSON.parse(await readFile(RAW_PATH, "utf8"));
  const supplement01Fixture = JSON.parse(await readFile(SUPPLEMENT_RAW_PATH, "utf8"));
  const supplement02Fixture = JSON.parse(await readFile(SUPPLEMENT02_RAW_PATH, "utf8"));
  const supplement03Fixture = JSON.parse(await readFile(SUPPLEMENT03_RAW_PATH, "utf8"));
  const selectionProtectedScope = await loadProtectedEntityScope();
  async function test(name, operation) {
    await operation();
    results.push({ name, status: "PASS" });
  }

  await test("retry-after-numeric-seconds", () => {
    assert.equal(parseRetryAfterMs("12", 0), 12_000);
  });
  await test("retry-after-http-date", () => {
    const nowMs = Date.UTC(2026, 6, 16, 0, 0, 0);
    assert.equal(parseRetryAfterMs(new Date(nowMs + 12_000).toUTCString(), nowMs), 12_000);
  });
  await test("retry-after-fallback-exponential", () => {
    assert.deepEqual([1, 2, 3].map((retryNumber) => retryDelayMs(retryNumber, null, 0)), [5_000, 10_000, 20_000]);
  });
  await test("http-429-retries", async () => {
    const counters = createCounters({ requestRetries: 1 });
    const responses = [
      fixtureResponse(429, { headers: { "Retry-After": "12" } }),
      fixtureResponse(200, { payload: { ok: true } }),
    ];
    const waits = [];
    const payload = await fetchJsonWithRetry("https://fixture.invalid", {}, {
      requestRetries: 1,
      timeoutMs: 60_000,
      counters,
      fetchImpl: async () => responses.shift(),
      sleepImpl: async (delayMs) => waits.push(delayMs),
      nowImpl: () => 0,
    }, { stage: "fixture-429", candidate: "fixture" });
    assert.deepEqual(payload, { ok: true });
    assert.equal(counters.http429Count, 1);
    assert.equal(counters.retryCount, 1);
    assert.deepEqual(waits, [12_000]);
  });
  await test("http-400-does-not-retry", async () => {
    const counters = createCounters({ requestRetries: 3 });
    let calls = 0;
    await assert.rejects(() => fetchJsonWithRetry("https://fixture.invalid", {}, {
      requestRetries: 3,
      timeoutMs: 60_000,
      counters,
      fetchImpl: async () => { calls += 1; return fixtureResponse(400); },
      sleepImpl: async () => assert.fail("400 must not wait for a retry"),
    }, { stage: "fixture-400" }), (error) => error.status === 400);
    assert.equal(calls, 1);
    assert.equal(counters.retryCount, 0);
  });
  await test("http-500-retries-by-configuration", async () => {
    const counters = createCounters({ requestRetries: 2 });
    const responses = [fixtureResponse(500), fixtureResponse(500), fixtureResponse(200, { payload: { ok: true } })];
    const waits = [];
    await fetchJsonWithRetry("https://fixture.invalid", {}, {
      requestRetries: 2,
      timeoutMs: 60_000,
      counters,
      fetchImpl: async () => responses.shift(),
      sleepImpl: async (delayMs) => waits.push(delayMs),
      nowImpl: () => 0,
    }, { stage: "fixture-500" });
    assert.equal(counters.retryCount, 2);
    assert.deepEqual(waits, [5_000, 10_000]);
  });
  await test("search-concurrency-is-one", async () => {
    const counters = createCounters();
    let virtualNowMs = 0;
    const requestStartTimes = [];
    const responses = await collectSearchResponsesSerial(CANDIDATES, {
      searchDelayMs: DEFAULT_SEARCH_DELAY_MS,
      counters,
      requestSearch: async () => {
        requestStartTimes.push(virtualNowMs);
        return { search: [] };
      },
      sleepImpl: async (delayMs) => { virtualNowMs += delayMs; },
    });
    assert.equal(responses.length, 40);
    assert.equal(counters.searchMaxConcurrency, 1);
    assert.equal(requestStartTimes.length, 40);
  });
  await test("search-interval-at-least-750ms", async () => {
    const counters = createCounters();
    let virtualNowMs = 0;
    const requestStartTimes = [];
    await collectSearchResponsesSerial(CANDIDATES.slice(0, 3), {
      searchDelayMs: MIN_SEARCH_DELAY_MS,
      counters,
      requestSearch: async () => { requestStartTimes.push(virtualNowMs); return { search: [] }; },
      sleepImpl: async (delayMs) => { virtualNowMs += delayMs; },
    });
    assert.ok(requestStartTimes.slice(1).every((value, index) => value - requestStartTimes[index] >= MIN_SEARCH_DELAY_MS));
  });
  await test("exact-entity-qids-deduplicated-and-batched", () => {
    const qids = [...Array.from({ length: 45 }, (_, index) => `Q${index + 1}`), "Q1", "Q40"];
    const batches = uniqueQidBatches(qids);
    assert.equal(batches.flat().length, 45);
    assert.ok(batches.every((batch) => batch.length <= 40));
    assert.equal(new Set(batches.flat()).size, 45);
  });
  await test("sparql-uses-values-batches", () => {
    const query = projectionQuery(["Q1", "Q2"]);
    assert.match(query, /VALUES \?item \{ wd:Q1 wd:Q2 \}/u);
    for (const property of ["P17", "P31", "P131", "P276", "P625"]) assert.match(query, new RegExp(property, "u"));
  });
  await test("direct-p131-skips-transitive-query", () => {
    const cityQid = CANDIDATES[0].cityQid;
    const direct = directParentEvidence(
      cityQid,
      compareProjections([cityQid], []),
      compareProjections([], []),
      new Set(CANDIDATES.map((candidate) => candidate.cityQid)),
    );
    assert.equal(direct.accepted, true);
    const fixture = fixturePlanCandidate(CANDIDATES[0], 0, { direct: true });
    fixture.candidateEntities[0].parentEvidence = direct;
    const plan = buildCityParentPlans([fixture]).find((batch) => batch.cityQid === cityQid);
    assert.equal(plan.queryPairs.length, 0);
    assert.equal(plan.skippedReason, "direct-evidence-sufficient");
  });
  await test("direct-p276-skips-transitive-query", () => {
    const cityQid = CANDIDATES[0].cityQid;
    const direct = directParentEvidence(
      cityQid,
      compareProjections([], []),
      compareProjections([], [cityQid]),
      new Set(CANDIDATES.map((candidate) => candidate.cityQid)),
    );
    assert.equal(direct.directP276ToCity, true);
    assert.equal(direct.accepted, true);
    const fixture = fixturePlanCandidate(CANDIDATES[0], 0, { direct: true });
    fixture.candidateEntities[0].parentEvidence = direct;
    assert.equal(buildCityParentPlans([fixture]).find((batch) => batch.cityQid === cityQid).queryPairs.length, 0);
  });
  await test("p131-depth-1-is-accepted", () => {
    const evidence = parentPathEvidenceByPair([
      fixtureParentBinding({ qid: "Q200", cityQid: "Q100", pathType: "administrative-path", depth: 1, nodes: ["Q100"] }),
    ], [{ qid: "Q200" }], "Q100").get("Q200");
    assert.deepEqual(evidence, {
      parentEvidenceLevel: "administrative-path",
      parentPathDepth: 1,
      parentPathQids: ["Q100"],
      transitiveQueryPerformed: true,
      accepted: true,
    });
  });
  await test("p131-depth-2-is-accepted", () => {
    const evidence = parentPathEvidenceByPair([
      fixtureParentBinding({ qid: "Q200", cityQid: "Q100", pathType: "administrative-path", depth: 2, nodes: ["Q300", "Q100"] }),
    ], [{ qid: "Q200" }], "Q100").get("Q200");
    assert.equal(evidence.accepted, true);
    assert.equal(evidence.parentPathDepth, 2);
    assert.deepEqual(evidence.parentPathQids, ["Q300", "Q100"]);
  });
  await test("p131-depth-3-is-accepted", () => {
    const evidence = parentPathEvidenceByPair([
      fixtureParentBinding({ qid: "Q200", cityQid: "Q100", pathType: "administrative-path", depth: 3, nodes: ["Q300", "Q400", "Q100"] }),
    ], [{ qid: "Q200" }], "Q100").get("Q200");
    assert.equal(evidence.accepted, true);
    assert.equal(evidence.parentPathDepth, 3);
  });
  await test("parent-depth-4-is-rejected", () => {
    const evidence = parentPathEvidenceByPair([
      fixtureParentBinding({ qid: "Q200", cityQid: "Q100", pathType: "administrative-path", depth: 4, nodes: ["Q300", "Q400", "Q500"] }),
    ], [{ qid: "Q200" }], "Q100").get("Q200");
    assert.equal(evidence.accepted, false);
    assert.equal(evidence.parentPathDepth, null);
  });
  await test("p276-plus-p131-depth-1-is-accepted", () => {
    const evidence = parentPathEvidenceByPair([
      fixtureParentBinding({ qid: "Q200", cityQid: "Q100", pathType: "location-path", depth: 1, nodes: ["Q300", "Q100"] }),
    ], [{ qid: "Q200" }], "Q100").get("Q200");
    assert.equal(evidence.accepted, true);
    assert.equal(evidence.parentEvidenceLevel, "location-path");
    assert.deepEqual(evidence.parentPathQids, ["Q300", "Q100"]);
  });
  await test("parent-query-has-no-unbounded-path", () => {
    const query = parentQuery({ cityQid: "Q100", pairs: [{ qid: "Q200" }] });
    assert.doesNotMatch(query, /wdt:P131[*+]/u);
    assert.match(query, /BIND\(3 AS \?depth\)/u);
  });
  await test("institution-building-is-split-into-discovery-and-parent-validation", () => {
    const discovery = institutionRelationDiscoveryQuery(["Q190804"]);
    const parent = relatedEntityParentQuery({ cityQid: "Q727", relatedQids: ["Q25861166"] });
    assert.match(discovery, /\?institution \?property \?relatedEntity/u);
    assert.match(parent, /\?item \?approvedCity \?pathType/u);
    assert.notEqual(discovery, parent);
  });
  await test("institution-relation-discovery-query-has-no-parent-path", () => {
    const query = institutionRelationDiscoveryQuery(["Q190804"]);
    assert.doesNotMatch(query, /\?node|\?depth|\?approvedCity|P131[*+]|P625|P31|rdfs:label|schema:description/u);
    assert.match(query, /SELECT DISTINCT \?institution \?property \?relatedEntity/u);
  });
  await test("related-entity-parent-query-has-no-relation-discovery-union", () => {
    const query = relatedEntityParentQuery({ cityQid: "Q727", relatedQids: ["Q25861166"] });
    assert.doesNotMatch(query, /\?institution|\?relatedEntity|P159|P466|P527|P361|P749/u);
    assert.doesNotMatch(query, /wdt:P131[*+]/u);
    assert.match(query, /wdt:P276/u);
  });
  await test("institution-relation-discovery-batches-have-at-most-two-candidates", () => {
    const fixture = [
      { candidateKey: "Q727::a", selectedQid: "Q1", cityQid: "Q727" },
      { candidateKey: "Q727::b", selectedQid: "Q2", cityQid: "Q727" },
      { candidateKey: "Q727::c", selectedQid: "Q3", cityQid: "Q727" },
    ];
    const batches = institutionRelationDiscoveryBatches(fixture);
    assert.ok(batches.every((batch) => batch.candidates.length <= 2));
    assert.equal(batches.flatMap((batch) => batch.candidates).length, 3);
  });
  await test("related-entity-parent-batches-have-at-most-two-qids", () => {
    const batches = relatedEntityParentBatches([{ city: "Amsterdam", cityQid: "Q727", relatedQids: ["Q3", "Q1", "Q2", "Q2"] }]);
    assert.ok(batches.every((batch) => batch.relatedQids.length <= 2));
    assert.deepEqual(batches.flatMap((batch) => batch.relatedQids), ["Q1", "Q2", "Q3"]);
  });
  await test("empty-related-entity-set-skips-parent-query", () => {
    assert.deepEqual(relatedEntityParentBatches([{ city: "Rotterdam", cityQid: "Q34370", relatedQids: [] }]), []);
  });
  await test("relation-discovery-timeout-becomes-candidate-level-issue", async () => {
    const counters = createCounters({ requestRetries: 0 });
    const result = await runCandidateLevelEvidenceRequest({
      candidateKeys: ["Q34370::kunsthal-rotterdam"],
      evidenceIssueType: "institution-building-discovery-timeout",
      failedStage: "supplement-institution-relation-discovery",
      queryScope: { institutionQids: ["Q1668856"] },
      relatedQids: [],
      counters,
      request: async () => {
        counters.attemptedRequestCount += 1;
        counters.timeoutCount += 1;
        throw new WikidataRequestError("wikidata-network-error:This operation was aborted", { status: null });
      },
    });
    assert.equal(result.succeeded, false);
    assert.equal(result.issues[0].timeout, true);
    assert.equal(result.issues[0].candidateKey, "Q34370::kunsthal-rotterdam");
  });
  await test("related-parent-timeout-becomes-candidate-level-issue", async () => {
    const counters = createCounters({ requestRetries: 0 });
    const result = await runCandidateLevelEvidenceRequest({
      candidateKeys: ["Q727::rijksmuseum"],
      evidenceIssueType: "related-entity-parent-timeout",
      failedStage: "supplement-related-entity-parent",
      queryScope: { cityQid: "Q727", relatedQids: ["Q25861166"] },
      relatedQids: ["Q25861166"],
      counters,
      request: async () => {
        counters.attemptedRequestCount += 1;
        counters.timeoutCount += 1;
        throw new WikidataRequestError("wikidata-network-error:This operation was aborted", { status: null });
      },
    });
    assert.equal(result.succeeded, false);
    assert.equal(result.issues[0].evidenceIssueType, "related-entity-parent-timeout");
  });
  await test("candidate-level-failure-does-not-block-later-candidates", async () => {
    const counters = createCounters({ requestRetries: 0 });
    const outcomes = [];
    for (const candidateKeyValue of ["Q1::failed", "Q1::succeeded"]) {
      outcomes.push(await runCandidateLevelEvidenceRequest({
        candidateKeys: [candidateKeyValue],
        evidenceIssueType: "fixture-timeout",
        failedStage: "fixture-stage",
        queryScope: { candidateKey: candidateKeyValue },
        relatedQids: [],
        counters,
        request: async () => {
          counters.attemptedRequestCount += 1;
          if (candidateKeyValue.endsWith("failed")) {
            counters.timeoutCount += 1;
            throw new WikidataRequestError("fixture-timeout", { status: null });
          }
          counters.successfulRequestCount += 1;
          return { ok: true };
        },
      }));
    }
    assert.deepEqual(outcomes.map((outcome) => outcome.succeeded), [false, true]);
  });
  await test("candidate-level-issue-cannot-upgrade-candidate-to-pass", () => {
    assert.equal(resolveSupplementStatus({
      preParentStatus: "pass",
      parentEvidence: { accepted: true, requiresManualReview: false },
      evidenceIssues: [{ evidenceIssueType: "fixture-timeout" }],
    }), "conditional-manual");
  });
  await test("fatal-selected-exact-entity-error-still-prevents-write", async () => {
    let writeCount = 0;
    await assert.rejects(() => persistCompletedEvidence(
      async () => { throw new Error("fatal-selected-exact-entity-error"); },
      async () => { writeCount += 1; },
    ), /fatal-selected-exact-entity-error/u);
    assert.equal(writeCount, 0);
  });
  await test("candidate-level-issues-still-allow-atomic-supplement-write", async () => {
    let written = "";
    await persistCompletedEvidence(async () => ({
      contents: "{\"candidateLevelEvidenceIssues\":[{\"candidateKey\":\"Q1::fixture\"}]}\n",
    }), async (contents) => { written = contents; });
    assert.match(written, /candidateLevelEvidenceIssues/u);
  });
  await test("kunsthal-timeout-remains-parent-failed", () => {
    const candidate = {
      candidateName: "Kunsthal Rotterdam",
      preParentStatus: "pass",
      evidenceIssues: [{ evidenceIssueType: "institution-building-discovery-timeout" }],
      candidateEntities: [{ qid: "Q1668856", parentEvidence: { accepted: true, requiresManualReview: true } }],
      selectedQid: "Q1668856",
    };
    applyInstitutionBuildingOutcome(candidate, { discoverySucceeded: false, relatedEntityEvidence: [] });
    assert.equal(candidate.candidateEntities[0].parentEvidence.accepted, false);
    assert.equal(resolveSupplementStatus({
      preParentStatus: candidate.preParentStatus,
      parentEvidence: candidate.candidateEntities[0].parentEvidence,
      evidenceIssues: candidate.evidenceIssues,
    }), "parent-failed");
  });
  await test("erasmus-bridge-does-not-enter-institution-building", () => {
    const fixture = [{ candidateName: "Erasmus Bridge", operation: "parent-only-requery", selectedQid: "Q1348188" }];
    assert.deepEqual(selectInstitutionBuildingCandidates(fixture), []);
  });
  await test("euromast-is-not-batched-with-kunsthal", () => {
    const fixture = [
      { candidateName: "Kunsthal Rotterdam", candidateKey: "Q34370::kunsthal-rotterdam", operation: "parent-only-requery", selectedQid: "Q1668856", cityQid: "Q34370" },
      { candidateName: "Euromast", candidateKey: "Q34370::euromast", operation: "manual-identity-review", selectedQid: "Q969215", cityQid: "Q34370" },
    ];
    const selected = selectInstitutionBuildingCandidates(fixture);
    assert.deepEqual(selected.map((candidate) => candidate.candidateName), ["Kunsthal Rotterdam"]);
  });
  await test("institution-property-rules-are-explicit-and-frozen", () => {
    assert.equal(Object.isFrozen(INSTITUTION_RELATION_RULES), true);
    assert.deepEqual(Object.keys(INSTITUTION_RELATION_RULES), ["P131", "P159", "P276", "P361", "P466", "P527", "P749"]);
    assert.ok(Object.values(INSTITUTION_RELATION_RULES).every((rule) => rule.ruleId && rule.purpose && rule.direction));
  });
  await test("relation-discovery-parser-keeps-only-approved-properties", () => {
    const parsed = institutionRelationsFromBindings([
      { institution: fixtureEntityBinding("Q1"), property: { value: "P276" }, relatedEntity: fixtureEntityBinding("Q2") },
      { institution: fixtureEntityBinding("Q1"), property: { value: "P999" }, relatedEntity: fixtureEntityBinding("Q3") },
    ]);
    assert.deepEqual(parsed.map((relation) => relation.relatedEntityQid), ["Q2"]);
    assert.equal(parsed[0].ruleId, INSTITUTION_RELATION_RULES.P276.ruleId);
  });
  await test("supplement-structure-validation-accepts-explicit-candidate-issues", () => {
    const fixture = supplementStructureFixture(supplementBaseFixture);
    fixture.candidateLevelEvidenceIssues.push({
      candidateKey: fixture.candidates[0].candidateKey,
      evidenceIssueType: "fixture-timeout",
      failedStage: "fixture-stage",
      httpStatus: null,
      timeout: true,
      attempts: 1,
      retries: 0,
      queryScope: {},
      relatedQids: [],
    });
    fixture.candidates[0].evidenceIssues = [...fixture.candidateLevelEvidenceIssues];
    assert.equal(validateSupplementRawStructure(fixture), true);
  });
  await test("supplement-fixed-44-keys-and-operations-remain-unchanged-after-refactor", () => {
    const scope = createSupplementCandidateScope(supplementBaseFixture);
    assert.equal(scope.length, 44);
    assert.deepEqual(scope.map((candidate) => `${candidate.candidateKey}|${candidate.operation}`),
      createSupplementCandidateScope(supplementBaseFixture).map((candidate) => `${candidate.candidateKey}|${candidate.operation}`));
  });
  await test("search-term-payloads-are-reused-within-one-run", async () => {
    const counters = createCounters();
    let requests = 0;
    const fixtureCandidates = [
      { inputIndex: 1, searchTerms: ["shared"], searchLanguageByTerm: { shared: "en" } },
      { inputIndex: 2, searchTerms: ["shared"], searchLanguageByTerm: { shared: "en" } },
    ];
    const results = await collectSearchResponsesSerial(fixtureCandidates, {
      searchDelayMs: 1_000,
      counters,
      requestSearch: async () => { requests += 1; return { search: [] }; },
      sleepImpl: async () => {},
    });
    assert.equal(results.length, 2);
    assert.equal(requests, 1);
    assert.equal(counters.searchCacheHitCount, 1);
  });
  await test("forty-candidates-form-ten-city-batches", () => {
    const plans = buildCityParentPlans(CANDIDATES.map((candidate, index) => fixturePlanCandidate(candidate, index)));
    assert.equal(plans.length, 10);
    assert.ok(plans.every((plan) => plan.candidateCount === 4));
  });
  await test("parent-city-batch-has-at-most-four-qids", () => {
    const plans = buildCityParentPlans(CANDIDATES.map((candidate, index) => fixturePlanCandidate(candidate, index)));
    assert.ok(plans.every((plan) => plan.queryPairs.length <= 4));
    assert.equal(plans.reduce((total, plan) => total + plan.queryPairs.length, 0), 40);
  });
  await test("parent-city-plan-builds-query-with-query-pairs", () => {
    const plan = buildCityParentPlans(CANDIDATES.map((candidate, index) => fixturePlanCandidate(candidate, index)))[0];
    const query = parentQueryForCityBatch(plan);
    assert.match(query, new RegExp(`BIND\\(wd:${plan.cityQid} AS \\?approvedCity\\)`, "u"));
    assert.ok(plan.queryPairs.every(({ qid }) => query.includes(`wd:${qid}`)));
  });
  await test("parent-query-avoids-multi-property-cartesian-product", () => {
    const query = parentQuery({ cityQid: "Q100", pairs: [{ qid: "Q200" }, { qid: "Q201" }] });
    assert.doesNotMatch(query, /OPTIONAL|P17|P31|P625/iu);
    assert.match(query, /VALUES \?item \{ wd:Q200 wd:Q201 \}/u);
  });
  await test("missing-selected-qid-skips-parent-query", () => {
    const plans = buildCityParentPlans(CANDIDATES.map((candidate, index) => fixturePlanCandidate(candidate, index, { selected: false })));
    assert.equal(plans.reduce((total, plan) => total + plan.queryPairs.length, 0), 0);
    assert.ok(plans.every((plan) => plan.skippedReason === "no-selected-qid"));
  });
  await test("failed-city-parent-batch-does-not-write-raw", async () => {
    let writeCount = 0;
    await assert.rejects(() => persistCompletedEvidence(
      async () => { throw new Error("fixture-parent-city-batch-failed:Prague"); },
      async () => { writeCount += 1; },
    ), /fixture-parent-city-batch-failed:Prague/u);
    assert.equal(writeCount, 0);
  });
  await test("all-city-parent-batches-complete-before-write", async () => {
    let completedCityBatches = 0;
    let observedAtWrite = 0;
    await persistCompletedEvidence(async () => {
      completedCityBatches = 10;
      return { contents: "{}\n" };
    }, async () => { observedAtWrite = completedCityBatches; });
    assert.equal(observedAtWrite, 10);
  });
  await test("failed-build-does-not-write-raw", async () => {
    let writeCount = 0;
    await assert.rejects(() => persistCompletedEvidence(
      async () => { throw new Error("fixture-build-failed"); },
      async () => { writeCount += 1; },
    ), /fixture-build-failed/u);
    assert.equal(writeCount, 0);
  });
  await test("successful-build-writes-atomically", async () => {
    const operations = [];
    await writeAtomic("C:/fixture/raw.json", "{}\n", {
      mkdir: async () => operations.push("mkdir"),
      writeFile: async (temporaryPath) => operations.push(`write:${temporaryPath.endsWith(".tmp")}`),
      rename: async (temporaryPath, finalPath) => operations.push(`rename:${temporaryPath.endsWith(".tmp")}:${finalPath.endsWith("raw.json")}`),
      rm: async (temporaryPath) => operations.push(`rm:${temporaryPath.endsWith(".tmp")}`),
    });
    assert.deepEqual(operations, ["mkdir", "write:true", "rename:true:true", "rm:true"]);
  });
  await test("offline-p31-analysis-separates-selected-and-usable", () => {
    const fixtureCandidate = (name, qid, status, typeQids) => ({
      input: { name },
      selectedQid: qid,
      status,
      candidateEntities: [{ qid, p31Evidence: { sortedTypeQids: typeQids } }],
    });
    const raw = {
      retrievedAt: "fixture",
      blockingTypeQids: ["Q999"],
      numericP31PolicyEvidence: { historical: true },
      candidates: [
        fixtureCandidate("Pass", "Q1", "pass", ["Q20", "Q10"]),
        fixtureCandidate("Manual", "Q2", "conditional-manual", ["Q30"]),
        fixtureCandidate("Parent failed", "Q3", "parent-failed", ["Q10", "Q20"]),
      ],
    };
    const before = JSON.stringify(raw.numericP31PolicyEvidence);
    const analysis = analyzeExistingEvidence(raw);
    assert.equal(analysis.calledWikidata, false);
    assert.equal(analysis.selectedEntityP31Evidence.selectedEntityCount, 3);
    assert.equal(analysis.selectedEntityP31Evidence.completeP31KeyCount, 2);
    assert.equal(analysis.usableCandidateP31Evidence.selectedEntityCount, 2);
    assert.equal(analysis.usableCandidateP31Evidence.completeP31KeyCount, 2);
    assert.equal(JSON.stringify(raw.numericP31PolicyEvidence), before);
  });
  await test("supplement-candidate-keys-are-globally-unique", () => {
    const scope = createSupplementCandidateScope(supplementBaseFixture);
    assert.equal(scope.length, 44);
    assert.equal(new Set(scope.map((candidate) => candidate.candidateKey)).size, scope.length);
  });
  await test("supplement-operations-are-mutually-exclusive", () => {
    const scope = createSupplementCandidateScope(supplementBaseFixture);
    const allowed = new Set(SUPPLEMENT_OPERATIONS);
    assert.ok(scope.every((candidate) => allowed.has(candidate.operation)));
    assert.equal(new Set(scope.map((candidate) => candidate.candidateKey)).size, scope.length);
  });
  await test("supplement-multi-term-search-results-deduplicate-qids", () => {
    const candidate = { inputIndex: 1, searchTerms: ["local name", "English name"] };
    const evidence = searchEvidenceFromResponses(candidate, [
      { term: "local name", payload: { search: [{ id: "Q1", label: "Local", description: "first" }] } },
      { term: "English name", payload: { search: [{ id: "Q1", label: "English", description: "same item" }, { id: "Q2", label: "Other" }] } },
    ]);
    assert.equal(evidence.resultCount, 2);
    assert.deepEqual(evidence.results.find((result) => result.qid === "Q1").searchTerms, ["English name", "local name"]);
  });
  await test("supplement-parent-only-candidates-do-not-search", () => {
    const scope = createSupplementCandidateScope(supplementBaseFixture);
    const searchable = supplementSearchCandidates(scope);
    assert.ok(scope.filter((candidate) => candidate.operation === "parent-only-requery")
      .every((candidate) => candidate.searchTerms.length === 0 && !searchable.includes(candidate)));
  });
  await test("supplement-known-manual-qids-enter-exact-read-set", () => {
    const scope = createSupplementCandidateScope(supplementBaseFixture);
    const searchEvidence = scope.map((candidate) => ({
      candidateInputIndex: candidate.inputIndex,
      results: [],
    }));
    const exactQids = collectSupplementExactQids(scope, searchEvidence);
    for (const qid of ["Q969215", "Q100717811", "Q738015", "Q193369", "Q1087723", "Q11094328"]) {
      assert.ok(exactQids.includes(qid));
    }
  });
  await test("supplement-excludes-stable-usable-base-candidates", () => {
    const scope = createSupplementCandidateScope(supplementBaseFixture);
    const usableBaseKeys = new Set(supplementBaseFixture.candidates
      .filter((candidate) => ["pass", "conditional-manual"].includes(candidate.status))
      .map((candidate) => candidateKey(candidate.input.cityQid, candidate.input.name)));
    assert.ok(scope.every((candidate) => !usableBaseKeys.has(candidate.candidateKey)));
  });
  await test("supplement-scope-does-not-mutate-base-raw", () => {
    const before = serializeJson(supplementBaseFixture);
    createSupplementCandidateScope(supplementBaseFixture);
    assert.equal(serializeJson(supplementBaseFixture), before);
  });
  await test("supplement-success-writes-atomically", async () => {
    const operations = [];
    await writeAtomic("C:/fixture/supplement01.json", "{}\n", {
      mkdir: async () => operations.push("mkdir"),
      writeFile: async (temporaryPath) => operations.push(`write:${temporaryPath.endsWith(".tmp")}`),
      rename: async (temporaryPath, finalPath) => operations.push(`rename:${temporaryPath.endsWith(".tmp")}:${finalPath.endsWith("supplement01.json")}`),
      rm: async (temporaryPath) => operations.push(`rm:${temporaryPath.endsWith(".tmp")}`),
    });
    assert.deepEqual(operations, ["mkdir", "write:true", "rename:true:true", "rm:true"]);
  });
  await test("supplement-failure-does-not-write-file", async () => {
    let writeCount = 0;
    await assert.rejects(() => persistCompletedEvidence(
      async () => { throw new Error("fixture-supplement-failed"); },
      async () => { writeCount += 1; },
    ), /fixture-supplement-failed/u);
    assert.equal(writeCount, 0);
  });
  await test("merged-analysis-preserves-base-and-supplement-status", () => {
    const base = { candidates: [{
      input: { city: "Prague", cityQid: "Q1085", name: "Fixture" },
      status: "parent-failed",
      selectedQid: "Q1",
      candidateEntities: [],
    }] };
    const supplement = { candidates: [{
      candidateKey: "Q1085::fixture",
      cityQid: "Q1085",
      candidateName: "Fixture",
      sourceRound: "supplement01",
      status: "conditional-manual",
      selectedQid: "Q1",
      candidateEntities: [],
    }] };
    const merged = mergeCandidatePools(base, supplement);
    assert.equal(merged[0].baseStatus, "parent-failed");
    assert.equal(merged[0].supplementStatus, "conditional-manual");
    assert.equal(merged[0].status, "conditional-manual");
  });
  await test("institution-building-path-never-upgrades-to-clean-pass", () => {
    assert.equal(resolveSupplementStatus({
      preParentStatus: "pass",
      parentEvidence: { accepted: true, requiresManualReview: true, parentEvidenceLevel: "institution-building-path" },
    }), "conditional-manual");
  });
  await test("same-name-municipality-without-structured-relation-is-not-parent", () => {
    const evidence = municipalityBridgeEvidence({
      city: "Amsterdam",
      cityQid: "Q727",
      directLocationEntities: [{ qid: "Q9899", labelEn: "Amsterdam" }],
      relations: [],
    });
    assert.equal(evidence.accepted, false);
    assert.equal(evidence.sameNameLocationQids.includes("Q9899"), true);
  });
  await test("merged-p31-analysis-has-selected-and-usable-scopes", () => {
    const fixtureRecord = (name, qid, status, p31Qids, sourceRound) => ({
      candidateKey: `Q1::${normalizeName(name).replace(/\s+/gu, "-")}`,
      candidateName: name,
      city: "Fixture City",
      cityQid: "Q1",
      status,
      selectedQid: qid,
      sourceRound,
      candidateEntities: [{ qid, p31Evidence: { sortedTypeQids: p31Qids } }],
    });
    const records = [
      fixtureRecord("Base usable", "Q10", "pass", ["Q200"], "base"),
      fixtureRecord("Supplement blocked", "Q11", "parent-failed", ["Q201", "Q200"], "supplement01"),
    ];
    const analysis = collectMergedP31Evidence(records, { blockingTypeQids: ["Q201"] });
    assert.equal(analysis.selectedEntityP31Evidence.selectedEntityCount, 2);
    assert.equal(analysis.usableCandidateP31Evidence.selectedEntityCount, 1);
    assert.ok(analysis.selectedEntityP31Evidence.combinations.some((entry) => entry.p31Key === "Q200|Q201"));
  });
  await test("supplement-scope-excludes-australia", () => {
    assert.ok(createSupplementCandidateScope(supplementBaseFixture).every((candidate) => candidate.countryCode !== "AU"));
  });
  await test("supplement-fixed-scope-has-no-extra-candidates", () => {
    const scope = createSupplementCandidateScope(supplementBaseFixture);
    assert.deepEqual(scope.map((candidate) => candidate.candidateName), EXPECTED_SUPPLEMENT_CANDIDATE_NAMES);
    assert.deepEqual(Object.fromEntries(SUPPLEMENT_OPERATIONS.map((operation) => [
      operation,
      scope.filter((candidate) => candidate.operation === operation).length,
    ])), {
      "identity-requery": 10,
      "manual-identity-review": 3,
      "parent-only-requery": 7,
      "replacement-candidate": 6,
      "additional-buffer": 18,
    });
  });
  await test("supplement02-fixed-scope-has-exactly-12-candidates", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    assert.deepEqual(scope.map((candidate) => candidate.candidateName), EXPECTED_SUPPLEMENT02_CANDIDATE_NAMES);
    assert.equal(scope.length, 12);
  });
  await test("supplement02-fixed-scope-has-four-approved-cities", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    assert.deepEqual(stableUnique(scope.map((candidate) => candidate.cityQid)), ["Q1085", "Q14960", "Q1757", "Q2841"]);
  });
  await test("supplement02-candidate-keys-are-unique", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    assert.equal(new Set(scope.map((candidate) => candidate.candidateKey)).size, 12);
  });
  await test("supplement02-does-not-overlap-base-candidate-keys", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    const baseKeys = new Set(supplementBaseFixture.candidates.map((candidate) => candidateKey(candidate.input.cityQid, candidate.input.name)));
    assert.ok(scope.every((candidate) => !baseKeys.has(candidate.candidateKey)));
  });
  await test("supplement02-does-not-overlap-supplement01-candidate-keys", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    const supplement01Keys = new Set(supplement01Fixture.candidates.map((candidate) => candidate.candidateKey));
    assert.ok(scope.every((candidate) => !supplement01Keys.has(candidate.candidateKey)));
  });
  await test("supplement02-source-round-is-fixed", () => {
    assert.ok(createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture)
      .every((candidate) => candidate.sourceRound === "supplement02"));
  });
  await test("supplement02-operations-are-all-additional-buffer", () => {
    assert.ok(createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture)
      .every((candidate) => candidate.operation === "additional-buffer"));
  });
  await test("supplement02-searches-only-new-fixed-candidates", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    assert.deepEqual(supplementSearchCandidates(scope).map((candidate) => candidate.candidateKey),
      scope.map((candidate) => candidate.candidateKey));
  });
  await test("supplement02-scope-does-not-mutate-base-raw", () => {
    const before = serializeJson(supplementBaseFixture);
    createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    assert.equal(serializeJson(supplementBaseFixture), before);
  });
  await test("supplement02-scope-does-not-mutate-supplement01-raw", () => {
    const before = serializeJson(supplement01Fixture);
    createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    assert.equal(serializeJson(supplement01Fixture), before);
  });
  await test("supplement02-failure-does-not-write-file", async () => {
    let writeCount = 0;
    await assert.rejects(() => persistCompletedEvidence(
      async () => { throw new Error("fixture-supplement02-failed"); },
      async () => { writeCount += 1; },
    ), /fixture-supplement02-failed/u);
    assert.equal(writeCount, 0);
  });
  await test("supplement02-success-writes-atomically", async () => {
    const operations = [];
    await writeAtomic("C:/fixture/supplement02.json", "{}\n", {
      mkdir: async () => operations.push("mkdir"),
      writeFile: async (temporaryPath) => operations.push(`write:${temporaryPath.endsWith(".tmp")}`),
      rename: async (temporaryPath, finalPath) => operations.push(`rename:${temporaryPath.endsWith(".tmp")}:${finalPath.endsWith("supplement02.json")}`),
      rm: async (temporaryPath) => operations.push(`rm:${temporaryPath.endsWith(".tmp")}`),
    });
    assert.deepEqual(operations, ["mkdir", "write:true", "rename:true:true", "rm:true"]);
  });
  await test("supplement02-merged-analysis-includes-three-rounds", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    const supplement02 = supplement02StructureFixture(supplementBaseFixture, supplement01Fixture, scope);
    const analysis = analyzeMergedCandidatePoolThreeRounds(supplementBaseFixture, supplement01Fixture, supplement02);
    assert.equal(analysis.baseCandidateCount, 40);
    assert.equal(analysis.supplement01CandidateCount, 44);
    assert.equal(analysis.supplement02CandidateCount, 12);
  });
  await test("supplement02-merged-analysis-has-no-duplicate-candidate-key", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    const supplement02 = supplement02StructureFixture(supplementBaseFixture, supplement01Fixture, scope);
    const records = mergeCandidatePoolsThreeRounds(supplementBaseFixture, supplement01Fixture, supplement02);
    assert.equal(new Set(records.map((record) => record.candidateKey)).size, records.length);
  });
  await test("supplement02-merged-analysis-has-selected-and-usable-p31-scopes", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    const supplement02 = supplement02StructureFixture(supplementBaseFixture, supplement01Fixture, scope);
    const analysis = analyzeMergedCandidatePoolThreeRounds(supplementBaseFixture, supplement01Fixture, supplement02);
    assert.ok(analysis.selectedEntityP31Evidence);
    assert.ok(analysis.usableCandidateP31Evidence);
  });
  await test("supplement02-candidate-level-failure-does-not-stop-other-candidates", async () => {
    const counters = createCounters({ requestRetries: 0 });
    const failed = await runCandidateLevelEvidenceRequest({
      candidateKeys: ["Q2841::failed"], evidenceIssueType: "fixture-failed", failedStage: "fixture",
      queryScope: {}, relatedQids: [], counters,
      request: async () => { const error = new Error("fixture"); error.status = 503; throw error; },
    });
    const succeeded = await runCandidateLevelEvidenceRequest({
      candidateKeys: ["Q2841::succeeded"], evidenceIssueType: "fixture-failed", failedStage: "fixture",
      queryScope: {}, relatedQids: [], counters, request: async () => ({ results: { bindings: [] } }),
    });
    assert.equal(failed.succeeded, false);
    assert.equal(succeeded.succeeded, true);
  });
  await test("supplement02-candidate-level-issue-cannot-be-pass", () => {
    assert.equal(resolveSupplementStatus({
      preParentStatus: "pass",
      parentEvidence: { accepted: true, requiresManualReview: false },
      evidenceIssues: [{ evidenceIssueType: "fixture" }],
    }), "conditional-manual");
  });
  await test("supplement02-scope-excludes-australia", () => {
    assert.ok(createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture)
      .every((candidate) => candidate.countryCode !== "AU"));
  });
  await test("supplement02-does-not-use-cache", () => {
    const cacheDirectoryToken = [".route", "v2", "cache"].join("-");
    assert.equal(buildSupplement02Evidence.toString().includes(cacheDirectoryToken), false);
    assert.equal(analyzeSupplement02EvidenceFiles.toString().includes(cacheDirectoryToken), false);
  });
  await test("supplement02-fixed-list-has-no-extra-candidates", () => {
    const scope = createSupplement02CandidateScope(supplementBaseFixture, supplement01Fixture);
    assert.equal(scope.length, EXPECTED_SUPPLEMENT02_CANDIDATE_NAMES.length);
    assert.deepEqual(scope.map((candidate) => candidate.candidateName), EXPECTED_SUPPLEMENT02_CANDIDATE_NAMES);
  });
  await test("supplement03-fixed-scope-has-exactly-nine-candidates", () => {
    const scope = createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    assert.equal(scope.length, 9);
    assert.deepEqual(scope.map((candidate) => candidate.candidateName), EXPECTED_SUPPLEMENT03_CANDIDATE_NAMES);
  });
  await test("supplement03-city-scope-is-only-bogota-brno-prague", () => {
    const scope = createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    assert.deepEqual(stableUnique(scope.map((candidate) => candidate.cityQid)), ["Q1085", "Q14960", "Q2841"]);
  });
  await test("supplement03-candidate-keys-are-nine-of-nine-unique", () => {
    const scope = createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    assert.equal(new Set(scope.map((candidate) => candidate.candidateKey)).size, 9);
  });
  await test("supplement03-does-not-overlap-any-historical-candidate-key", () => {
    const scope = createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    const historicalKeys = new Set([
      ...supplementBaseFixture.candidates.map((candidate) => candidateKey(candidate.input.cityQid, candidate.input.name)),
      ...supplement01Fixture.candidates.map((candidate) => candidate.candidateKey),
      ...supplement02Fixture.candidates.map((candidate) => candidate.candidateKey),
    ]);
    assert.ok(scope.every((candidate) => !historicalKeys.has(candidate.candidateKey)));
  });
  await test("supplement03-source-round-is-fixed", () => {
    assert.ok(createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture)
      .every((candidate) => candidate.sourceRound === "supplement03"));
  });
  await test("supplement03-operations-are-all-additional-buffer", () => {
    assert.ok(createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture)
      .every((candidate) => candidate.operation === "additional-buffer"));
  });
  await test("supplement03-searches-only-new-fixed-candidates", () => {
    const scope = createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    assert.deepEqual(supplementSearchCandidates(scope).map((candidate) => candidate.candidateKey),
      scope.map((candidate) => candidate.candidateKey));
  });
  await test("supplement03-scope-does-not-mutate-three-historical-raws", () => {
    const before = [supplementBaseFixture, supplement01Fixture, supplement02Fixture].map(serializeJson);
    createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    assert.deepEqual([supplementBaseFixture, supplement01Fixture, supplement02Fixture].map(serializeJson), before);
  });
  await test("supplement03-failure-does-not-write-file", async () => {
    let writeCount = 0;
    await assert.rejects(() => persistCompletedEvidence(
      async () => { throw new Error("fixture-supplement03-failed"); },
      async () => { writeCount += 1; },
    ), /fixture-supplement03-failed/u);
    assert.equal(writeCount, 0);
  });
  await test("supplement03-success-writes-atomically", async () => {
    const operations = [];
    await writeAtomic("C:/fixture/supplement03.json", "{}\n", {
      mkdir: async () => operations.push("mkdir"),
      writeFile: async (temporaryPath) => operations.push(`write:${temporaryPath.endsWith(".tmp")}`),
      rename: async (temporaryPath, finalPath) => operations.push(`rename:${temporaryPath.endsWith(".tmp")}:${finalPath.endsWith("supplement03.json")}`),
      rm: async (temporaryPath) => operations.push(`rm:${temporaryPath.endsWith(".tmp")}`),
    });
    assert.deepEqual(operations, ["mkdir", "write:true", "rename:true:true", "rm:true"]);
  });
  await test("supplement03-merged-analysis-includes-four-rounds", () => {
    const scope = createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    const supplement03 = supplement03StructureFixture(supplementBaseFixture, supplement01Fixture, supplement02Fixture, scope);
    const analysis = analyzeMergedCandidatePoolFourRounds(supplementBaseFixture, supplement01Fixture, supplement02Fixture, supplement03);
    assert.deepEqual([analysis.baseCandidateCount, analysis.supplement01CandidateCount, analysis.supplement02CandidateCount, analysis.supplement03CandidateCount], [40, 44, 12, 9]);
  });
  await test("supplement03-merged-analysis-has-unique-candidate-keys", () => {
    const scope = createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    const supplement03 = supplement03StructureFixture(supplementBaseFixture, supplement01Fixture, supplement02Fixture, scope);
    const records = mergeCandidatePoolsFourRounds(supplementBaseFixture, supplement01Fixture, supplement02Fixture, supplement03);
    assert.equal(new Set(records.map((record) => record.candidateKey)).size, records.length);
  });
  await test("supplement03-merged-analysis-has-selected-and-usable-p31-scopes", () => {
    const scope = createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    const supplement03 = supplement03StructureFixture(supplementBaseFixture, supplement01Fixture, supplement02Fixture, scope);
    const analysis = analyzeMergedCandidatePoolFourRounds(supplementBaseFixture, supplement01Fixture, supplement02Fixture, supplement03);
    assert.ok(analysis.selectedEntityP31Evidence);
    assert.ok(analysis.usableCandidateP31Evidence);
  });
  await test("supplement03-candidate-level-failure-does-not-stop-other-candidates", async () => {
    const counters = createCounters({ requestRetries: 0 });
    const failed = await runCandidateLevelEvidenceRequest({
      candidateKeys: ["Q1085::failed"], evidenceIssueType: "fixture-failed", failedStage: "fixture",
      queryScope: {}, relatedQids: [], counters,
      request: async () => { const error = new Error("fixture"); error.status = 503; throw error; },
    });
    const succeeded = await runCandidateLevelEvidenceRequest({
      candidateKeys: ["Q1085::succeeded"], evidenceIssueType: "fixture-failed", failedStage: "fixture",
      queryScope: {}, relatedQids: [], counters, request: async () => ({ results: { bindings: [] } }),
    });
    assert.equal(failed.succeeded, false);
    assert.equal(succeeded.succeeded, true);
  });
  await test("supplement03-candidate-level-issue-cannot-be-pass", () => {
    assert.equal(resolveSupplementStatus({
      preParentStatus: "pass",
      parentEvidence: { accepted: true, requiresManualReview: false },
      evidenceIssues: [{ evidenceIssueType: "fixture" }],
    }), "conditional-manual");
  });
  await test("supplement03-scope-excludes-australia", () => {
    assert.ok(createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture)
      .every((candidate) => candidate.countryCode !== "AU"));
  });
  await test("supplement03-fixed-list-has-no-extra-candidates", () => {
    const scope = createSupplement03CandidateScope(supplementBaseFixture, supplement01Fixture, supplement02Fixture);
    assert.equal(scope.length, EXPECTED_SUPPLEMENT03_CANDIDATE_NAMES.length);
    assert.deepEqual(scope.map((candidate) => candidate.candidateName), EXPECTED_SUPPLEMENT03_CANDIDATE_NAMES);
  });
  await test("supplement03-does-not-use-cache", () => {
    const cacheDirectoryToken = [".route", "v2", "cache"].join("-");
    assert.equal(buildSupplement03Evidence.toString().includes(cacheDirectoryToken), false);
    assert.equal(analyzeSupplement03EvidenceFiles.toString().includes(cacheDirectoryToken), false);
  });
  await test("supplement03-shortfall-never-starts-supplement04", () => {
    const decision = finalSupplementDecision([{ atLeastFourUsable: false }]);
    assert.equal(decision.supplement04Started, false);
    assert.equal(decision.nextStep, "revisit-batch-scale-or-3-plus-1-rule");
  });
  await test("supplement03-success-never-freezes-final-set", () => {
    const decision = finalSupplementDecision([{ atLeastFourUsable: true }]);
    assert.equal(decision.freezePrerequisiteMet, true);
    assert.equal(decision.finalSetFrozen, false);
  });
  await test("selection-has-exactly-three-primary-per-city", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    assert.equal(selection.primaryCount, 30);
    assert.ok(selection.cities.every((city) => city.primaryCandidateKeys.length === 3));
  });
  await test("selection-backup-is-optional-and-at-most-one", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    assert.equal(selection.backupCount, 8);
    assert.ok(selection.cities.every((city) => city.backupCandidateKey === null || typeof city.backupCandidateKey === "string"));
  });
  await test("selection-missing-backup-is-not-blocking", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    assert.equal(selection.selectionReadiness.backupRequiredForPublish, false);
    assert.equal(selection.selectionReadiness.primaryReady, true);
  });
  await test("selection-brno-and-prague-three-primary-pass-with-null-backup", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    for (const cityName of ["Brno", "Prague"]) {
      const city = selection.cities.find((value) => value.city === cityName);
      assert.equal(city.primaryCandidateKeys.length, 3);
      assert.equal(city.backupCandidateKey, null);
      assert.equal(city.backupReason, "no-fourth-usable-candidate");
    }
  });
  await test("selection-never-selects-blocking-status", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    assert.ok([...selection.primaryCandidates, ...selection.backupCandidates]
      .every((candidate) => ["pass", "conditional-manual"].includes(candidate.status)));
  });
  await test("selection-primary-qids-are-unique", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    assert.equal(new Set(selection.primaryCandidates.map((candidate) => candidate.selectedQid)).size, 30);
  });
  await test("selection-backup-qids-are-unique", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    assert.equal(new Set(selection.backupCandidates.map((candidate) => candidate.selectedQid)).size, selection.backupCount);
  });
  await test("selection-primary-and-backup-qids-do-not-overlap", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    const primaryQids = new Set(selection.primaryCandidates.map((candidate) => candidate.selectedQid));
    assert.ok(selection.backupCandidates.every((candidate) => !primaryQids.has(candidate.selectedQid)));
  });
  await test("selection-every-entry-is-traceable-to-a-raw-round", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    assert.ok([...selection.primaryCandidates, ...selection.backupCandidates]
      .every((candidate) => ["base", "supplement01", "supplement02", "supplement03"].includes(candidate.sourceRound)
        && candidate.rawReference?.candidateKey === candidate.candidateKey));
  });
  await test("selection-primary-order-is-stable", () => {
    const selection = buildSelectionDocumentFromRaws({ baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope });
    assert.deepEqual(selection.primaryCandidates.map((candidate) => candidate.candidateKey), FROZEN_PRIMARY_CANDIDATE_KEYS.flatMap((city) => city.candidateKeys));
  });
  await test("selection-bytes-are-deterministic", () => {
    const options = { baseRaw: supplementBaseFixture, supplement01Raw: supplement01Fixture, supplement02Raw: supplement02Fixture, supplement03Raw: supplement03Fixture, protectedScope: selectionProtectedScope };
    assert.equal(serializeJson(buildSelectionDocumentFromRaws(options)), serializeJson(buildSelectionDocumentFromRaws(options)));
  });
  await test("selection-builder-is-offline", () => {
    assert.doesNotMatch(buildSelectionDocumentFromRaws.toString(), /fetch|wikidata|SPARQL_ENDPOINT|ENTITY_API_ENDPOINT/u);
  });
  await test("selection-does-not-use-cache", () => {
    const cacheDirectoryToken = [".route", "v2", "cache"].join("-");
    assert.equal(freezeSelection.toString().includes(cacheDirectoryToken), false);
    assert.equal(analyzeSelectionFile.toString().includes(cacheDirectoryToken), false);
  });
  await test("selection-requires-all-four-frozen-raw-hashes", () => {
    assert.throws(() => validateCreatedFromRawHashes({ ...EXPECTED_SELECTION_RAW_HASHES, supplement03: "wrong" }), /selection-raw-hash-mismatch/u);
  });
  await test("p31-informational-key-must-match-exactly", () => {
    const key = INFORMATIONAL_P31_EXACT_KEYS[0];
    assert.equal(classifyNumericP31Key(key, { knownTypeQids: key.split("|"), projectionExact: true }), "informational");
    assert.equal(classifyNumericP31Key(`${key}|Q999999999`, { knownTypeQids: [...key.split("|"), "Q999999999"], projectionExact: true }), "manual-review");
  });
  await test("p31-unknown-qid-defaults-to-manual", () => {
    assert.equal(classifyNumericP31Key("Q999999999", { knownTypeQids: [], projectionExact: true }), "manual-review");
  });
  await test("p31-blocking-type-has-priority", () => {
    assert.equal(classifyNumericP31Key("Q33506|Q515", { knownTypeQids: ["Q33506", "Q515"], projectionExact: true }), "blocking");
  });
  await test("selection-rejects-pilot-poi-qid-overlap", () => {
    assert.throws(() => validateSelectionQidSafety([{ selectedQid: "Q1" }], { pilotPoiQids: ["Q1"], countryQids: [], cityQids: [] }), /selection-protected-qid-overlap/u);
  });
  await test("selection-rejects-country-or-city-qid-overlap", () => {
    assert.throws(() => validateSelectionQidSafety([{ selectedQid: "Q2" }], { pilotPoiQids: [], countryQids: ["Q2"], cityQids: [] }), /selection-protected-qid-overlap/u);
    assert.throws(() => validateSelectionQidSafety([{ selectedQid: "Q3" }], { pilotPoiQids: [], countryQids: [], cityQids: ["Q3"] }), /selection-protected-qid-overlap/u);
  });
  await test("selection-does-not-create-canonical-poi", () => {
    assert.equal(SELECTION_RAW_RELATIVE_PATH.endsWith("pois-p1b-batch01-selection.json"), true);
    assert.doesNotMatch(freezeSelection.toString(), /canonical|provenance|conflicts|review-queue/u);
  });
  await test("cache-is-not-read-or-written", () => {
    const cacheDirectoryToken = [".route", "v2", "cache"].join("-");
    assert.equal(loadProtectedEntityScope.toString().includes(cacheDirectoryToken), false);
    assert.equal(buildEvidence.toString().includes(cacheDirectoryToken), false);
    assert.equal(buildSupplementEvidence.toString().includes(cacheDirectoryToken), false);
    assert.equal(analyzeSupplementEvidenceFiles.toString().includes(cacheDirectoryToken), false);
  });
  await test("fixed-40-candidates-and-10-cities", () => {
    assert.deepEqual(CANDIDATES.map((candidate) => candidate.name), EXPECTED_CANDIDATE_NAMES);
    assert.equal(CANDIDATES.length, 40);
    assert.equal(stableUnique(CANDIDATES.map((candidate) => candidate.cityQid)).length, 10);
    assert.equal(CANDIDATES.reduce((total, candidate) => total + candidate.searchTerms.length, 0), 40);
  });
  await test("candidate-scope-excludes-australia", () => {
    assert.ok(CANDIDATES.every((candidate) => candidate.countryCode !== "AU"));
  });

  return {
    status: "PASS",
    mode: "self-test",
    calledWikidata: false,
    fixtureCount: results.length,
    results,
  };
}

function numericOption(args, name, fallback, minimum = 0) {
  const argument = args.find((value) => value.startsWith(`--${name}=`));
  if (!argument) return fallback;
  const value = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(value) || value < minimum) throw new Error(`invalid-${name}:${argument}`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.every((argument) => ["--refresh", "--refresh-supplement01", "--refresh-supplement02", "--refresh-supplement03", "--self-test", "--analyze-existing", "--analyze-supplement01", "--analyze-supplement02", "--analyze-supplement03", "--freeze-selection", "--analyze-selection"].includes(argument)
    || /^--(?:timeout-ms|retries|request-retries|search-delay-ms|batch-delay-ms)=\d+$/u.test(argument))) {
    throw new Error(`unsupported-arguments:${args.join(",")}`);
  }
  const explicitModes = ["--refresh", "--refresh-supplement01", "--refresh-supplement02", "--refresh-supplement03", "--self-test", "--analyze-existing", "--analyze-supplement01", "--analyze-supplement02", "--analyze-supplement03", "--freeze-selection", "--analyze-selection"]
    .filter((mode) => args.includes(mode));
  if (explicitModes.length > 1) throw new Error(`multiple-modes-not-allowed:${explicitModes.join(",")}`);
  if (args.includes("--self-test")) {
    if (args.length !== 1) throw new Error("self-test-does-not-accept-refresh-or-network-options");
    process.stdout.write(`${JSON.stringify(await runSelfTests(), null, 2)}\n`);
    return;
  }
  if (args.includes("--freeze-selection")) {
    if (args.length !== 1) throw new Error("freeze-selection-does-not-accept-refresh-or-network-options");
    const { raw, contents, sha256 } = await freezeSelection();
    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      mode: "selection-freeze",
      calledWikidata: false,
      selection: SELECTION_RAW_RELATIVE_PATH,
      sizeBytes: Buffer.byteLength(contents),
      sha256,
      policyVersion: raw.policyVersion,
      selectionRule: raw.selectionRule,
      createdFromRawHashes: raw.createdFromRawHashes,
      primaryCount: raw.primaryCount,
      backupCount: raw.backupCount,
      cities: raw.cities,
      P31PolicyEvidence: raw.P31PolicyEvidence,
      selectionReadiness: raw.selectionReadiness,
    }, null, 2)}\n`);
    return;
  }
  if (args.includes("--analyze-selection")) {
    if (args.length !== 1) throw new Error("analyze-selection-does-not-accept-refresh-or-network-options");
    process.stdout.write(`${JSON.stringify(await analyzeSelectionFile(), null, 2)}\n`);
    return;
  }
  if (args.includes("--analyze-existing")) {
    if (args.length !== 1) throw new Error("analyze-existing-does-not-accept-refresh-or-network-options");
    const raw = JSON.parse(await readFile(RAW_PATH, "utf8"));
    process.stdout.write(`${JSON.stringify(analyzeExistingEvidence(raw), null, 2)}\n`);
    return;
  }
  if (args.includes("--analyze-supplement01")) {
    if (args.length !== 1) throw new Error("analyze-supplement01-does-not-accept-refresh-or-network-options");
    process.stdout.write(`${JSON.stringify(await analyzeSupplementEvidenceFiles(), null, 2)}\n`);
    return;
  }
  if (args.includes("--analyze-supplement02")) {
    if (args.length !== 1) throw new Error("analyze-supplement02-does-not-accept-refresh-or-network-options");
    process.stdout.write(`${JSON.stringify(await analyzeSupplement02EvidenceFiles(), null, 2)}\n`);
    return;
  }
  if (args.includes("--analyze-supplement03")) {
    if (args.length !== 1) throw new Error("analyze-supplement03-does-not-accept-refresh-or-network-options");
    process.stdout.write(`${JSON.stringify(await analyzeSupplement03EvidenceFiles(), null, 2)}\n`);
    return;
  }
  if (!args.includes("--refresh")) {
    if (args.includes("--refresh-supplement03")) {
      if (args.some((argument) => argument.startsWith("--retries="))
        && args.some((argument) => argument.startsWith("--request-retries="))) {
        throw new Error("do-not-combine-retries-and-request-retries");
      }
      const legacyRetriesUsed = args.some((argument) => argument.startsWith("--retries="));
      const requestRetries = numericOption(
        args,
        "request-retries",
        numericOption(args, "retries", DEFAULT_REQUEST_RETRIES),
      );
      const timeoutMs = numericOption(args, "timeout-ms", 60_000, 1);
      const searchDelayMs = numericOption(args, "search-delay-ms", DEFAULT_SEARCH_DELAY_MS, MIN_SEARCH_DELAY_MS);
      const batchDelayMs = numericOption(args, "batch-delay-ms", DEFAULT_BATCH_DELAY_MS, MIN_BATCH_DELAY_MS);
      const { raw, contents, sha256, mergedPoolAnalysis } = await refreshSupplement03Evidence({
        requestRetries,
        searchDelayMs,
        batchDelayMs,
        timeoutMs,
      });
      process.stdout.write(`${JSON.stringify({
        status: "PASS",
        mode: "supplement03-evidence-refresh",
        calledWikidata: true,
        raw: SUPPLEMENT03_RAW_RELATIVE_PATH,
        retrievedAt: raw.retrievedAt,
        sizeBytes: Buffer.byteLength(contents),
        sha256,
        baseRawSha256: raw.baseRawSha256,
        supplement01RawSha256: raw.supplement01RawSha256,
        supplement02RawSha256: raw.supplement02RawSha256,
        retryParameter: legacyRetriesUsed ? "--retries (compatibility alias)" : "--request-retries",
        source: raw.source,
        supplementScope: raw.supplementScope,
        evidenceGateSummary: raw.evidenceGateSummary,
        duplicateChecks: raw.duplicateChecks,
        candidateLevelEvidenceIssues: raw.candidateLevelEvidenceIssues,
        candidates: raw.candidates.map((candidate) => ({
          candidateKey: candidate.candidateKey,
          candidateName: candidate.candidateName,
          city: candidate.city,
          status: candidate.status,
          selectedQid: candidate.selectedQid,
          selectionReasons: candidate.selectionReasons,
          evidenceIssues: candidate.evidenceIssues,
        })),
        mergedPoolAnalysis,
      }, null, 2)}\n`);
      return;
    }
    if (args.includes("--refresh-supplement02")) {
      if (args.some((argument) => argument.startsWith("--retries="))
        && args.some((argument) => argument.startsWith("--request-retries="))) {
        throw new Error("do-not-combine-retries-and-request-retries");
      }
      const legacyRetriesUsed = args.some((argument) => argument.startsWith("--retries="));
      const requestRetries = numericOption(
        args,
        "request-retries",
        numericOption(args, "retries", DEFAULT_REQUEST_RETRIES),
      );
      const timeoutMs = numericOption(args, "timeout-ms", 60_000, 1);
      const searchDelayMs = numericOption(args, "search-delay-ms", DEFAULT_SEARCH_DELAY_MS, MIN_SEARCH_DELAY_MS);
      const batchDelayMs = numericOption(args, "batch-delay-ms", DEFAULT_BATCH_DELAY_MS, MIN_BATCH_DELAY_MS);
      const { raw, contents, sha256, mergedPoolAnalysis } = await refreshSupplement02Evidence({
        requestRetries,
        searchDelayMs,
        batchDelayMs,
        timeoutMs,
      });
      process.stdout.write(`${JSON.stringify({
        status: "PASS",
        mode: "supplement02-evidence-refresh",
        calledWikidata: true,
        raw: SUPPLEMENT02_RAW_RELATIVE_PATH,
        retrievedAt: raw.retrievedAt,
        sizeBytes: Buffer.byteLength(contents),
        sha256,
        baseRawSha256: raw.baseRawSha256,
        supplement01RawSha256: raw.supplement01RawSha256,
        retryParameter: legacyRetriesUsed ? "--retries (compatibility alias)" : "--request-retries",
        source: raw.source,
        supplementScope: raw.supplementScope,
        evidenceGateSummary: raw.evidenceGateSummary,
        duplicateChecks: raw.duplicateChecks,
        candidateLevelEvidenceIssues: raw.candidateLevelEvidenceIssues,
        candidates: raw.candidates.map((candidate) => ({
          candidateKey: candidate.candidateKey,
          candidateName: candidate.candidateName,
          city: candidate.city,
          status: candidate.status,
          selectedQid: candidate.selectedQid,
          selectionReasons: candidate.selectionReasons,
          evidenceIssues: candidate.evidenceIssues,
        })),
        mergedPoolAnalysis,
      }, null, 2)}\n`);
      return;
    }
    if (args.includes("--refresh-supplement01")) {
      if (args.some((argument) => argument.startsWith("--retries="))
        && args.some((argument) => argument.startsWith("--request-retries="))) {
        throw new Error("do-not-combine-retries-and-request-retries");
      }
      const legacyRetriesUsed = args.some((argument) => argument.startsWith("--retries="));
      const requestRetries = numericOption(
        args,
        "request-retries",
        numericOption(args, "retries", DEFAULT_REQUEST_RETRIES),
      );
      const timeoutMs = numericOption(args, "timeout-ms", 60_000, 1);
      const searchDelayMs = numericOption(args, "search-delay-ms", DEFAULT_SEARCH_DELAY_MS, MIN_SEARCH_DELAY_MS);
      const batchDelayMs = numericOption(args, "batch-delay-ms", DEFAULT_BATCH_DELAY_MS, MIN_BATCH_DELAY_MS);
      const { raw, contents, sha256, mergedPoolAnalysis } = await refreshSupplementEvidence({
        requestRetries,
        searchDelayMs,
        batchDelayMs,
        timeoutMs,
      });
      process.stdout.write(`${JSON.stringify({
        status: "PASS",
        mode: "supplement01-evidence-refresh",
        calledWikidata: true,
        raw: SUPPLEMENT_RAW_RELATIVE_PATH,
        retrievedAt: raw.retrievedAt,
        sizeBytes: Buffer.byteLength(contents),
        sha256,
        baseRawSha256: raw.baseRawSha256,
        retryParameter: legacyRetriesUsed ? "--retries (compatibility alias)" : "--request-retries",
        source: raw.source,
        supplementScope: raw.supplementScope,
        evidenceGateSummary: raw.evidenceGateSummary,
        duplicateChecks: raw.duplicateChecks,
        candidateLevelEvidenceIssues: raw.candidateLevelEvidenceIssues,
        mergedPoolAnalysis,
      }, null, 2)}\n`);
      return;
    }
    const raw = JSON.parse(await readFile(RAW_PATH, "utf8"));
    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      mode: "read-existing-evidence",
      calledWikidata: false,
      raw: RAW_RELATIVE_PATH,
      retrievedAt: raw.retrievedAt,
      source: raw.source,
      evidenceGateSummary: raw.evidenceGateSummary,
      candidateAvailability: raw.candidateAvailability,
    }, null, 2)}\n`);
    return;
  }
  if (args.some((argument) => argument.startsWith("--retries="))
    && args.some((argument) => argument.startsWith("--request-retries="))) {
    throw new Error("do-not-combine-retries-and-request-retries");
  }
  const legacyRetriesUsed = args.some((argument) => argument.startsWith("--retries="));
  const requestRetries = numericOption(
    args,
    "request-retries",
    numericOption(args, "retries", DEFAULT_REQUEST_RETRIES),
  );
  const timeoutMs = numericOption(args, "timeout-ms", 60_000, 1);
  const searchDelayMs = numericOption(args, "search-delay-ms", DEFAULT_SEARCH_DELAY_MS, MIN_SEARCH_DELAY_MS);
  const batchDelayMs = numericOption(args, "batch-delay-ms", DEFAULT_BATCH_DELAY_MS, MIN_BATCH_DELAY_MS);
  const { raw, contents, sha256 } = await refreshEvidence({ requestRetries, searchDelayMs, batchDelayMs, timeoutMs });
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    mode: "evidence-refresh",
    calledWikidata: true,
    raw: RAW_RELATIVE_PATH,
    retrievedAt: raw.retrievedAt,
    sizeBytes: Buffer.byteLength(contents),
    sha256,
    retryParameter: legacyRetriesUsed ? "--retries (compatibility alias)" : "--request-retries",
    source: raw.source,
    evidenceGateSummary: raw.evidenceGateSummary,
    candidateAvailability: raw.candidateAvailability,
  }, null, 2)}\n`);
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch((error) => {
    const invokedArgs = process.argv.slice(2);
    const selectionMode = invokedArgs.includes("--freeze-selection") || invokedArgs.includes("--analyze-selection");
    const supplement03Mode = invokedArgs.includes("--refresh-supplement03") || invokedArgs.includes("--analyze-supplement03");
    const supplement02Mode = invokedArgs.includes("--refresh-supplement02") || invokedArgs.includes("--analyze-supplement02");
    const supplementMode = supplement03Mode || supplement02Mode || invokedArgs.includes("--refresh-supplement01") || invokedArgs.includes("--analyze-supplement01");
    const networkMode = invokedArgs.includes("--refresh") || invokedArgs.includes("--refresh-supplement01") || invokedArgs.includes("--refresh-supplement02") || invokedArgs.includes("--refresh-supplement03");
    process.stderr.write(`${JSON.stringify({
      status: "FAIL",
      mode: selectionMode
        ? (invokedArgs.includes("--freeze-selection") ? "selection-freeze" : "selection-analysis")
        : (supplement03Mode ? "supplement03-evidence" : (supplement02Mode ? "supplement02-evidence" : (supplementMode ? "supplement01-evidence" : "evidence-refresh"))),
      calledWikidata: networkMode,
      rawWritten: false,
      error: {
        name: error.name,
        message: error.message,
        httpStatus: error.status ?? null,
        stack: error.stack || null,
      },
      fatalErrors: [{
        failedStage: error.evidenceFailure?.failedStage || "supplement-structure-or-local-fatal",
        candidate: error.evidenceFailure?.failedCandidate || null,
        httpStatus: error.status ?? null,
        message: error.message,
      }],
      requestTelemetry: error.evidenceFailure || null,
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
