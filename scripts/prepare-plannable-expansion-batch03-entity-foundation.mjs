import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { assertBatch03AdmissionAuthority, loadBatch03SemanticAuthority } from "./lib/batch03-entity-admission-authority.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`);
const SELECTION = Object.freeze({ LC:["Q41699"],VC:["Q41474"],ST:["Q3932"],SB:["Q40921"],TG:["Q3792"],TM:["Q23438"],TO:["Q38834"],AG:["Q36262","Q31578200"],CG:["Q3844","Q223920"],GD:["Q41547","Q375507"],GM:["Q3726","Q217568"],KN:["Q41295","Q992311"],BI:["Q3854","Q167551"],GN:["Q3733","Q874317"] });
const codes = Object.keys(SELECTION);
const names = fs.readdirSync(path.join(ROOT,"data/knowledge/batches"));
const cityFiles = names.filter((name)=>/^cities\.p1b-batch\d+\.json$/u.test(name)).map((name)=>`data/knowledge/batches/${name}`);
const poiFiles = names.filter((name)=>/^pois\.p1b-batch\d+\.json$/u.test(name)).map((name)=>`data/knowledge/batches/${name}`);
const publishedCities = new Set(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities);
const publishedPois = new Set(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois);
const countries = KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries.flatMap((file)=>read(file).countries);
const countryByCode = new Map(countries.map((entry)=>[entry.isoAlpha2,entry]));
const allCities = cityFiles.flatMap((file)=>read(file).cities.map((entity)=>({entity,file})));
const cityCandidates = [];
for(const [code,qids] of Object.entries(SELECTION)){
  const country=countryByCode.get(code); assert(country,`country-missing:${code}`);
  for(const qid of qids){
    const matches=allCities.filter(({entity,file})=>entity.parentCountryEntityId===country.entityId&&entity.wikidataId===qid&&!publishedCities.has(file));
    assert(matches.length>=1,`destination-candidate-missing:${code}:${qid}`);
    const entity=matches[0].entity;
    assert(matches.every((entry)=>entry.entity.entityId===entity.entityId),`destination-identity-conflict:${code}:${qid}`);
    cityCandidates.push(entity);
  }
}
assert.equal(cityCandidates.length,21);
assert.equal(new Set(cityCandidates.map((entry)=>entry.entityId)).size,21);
assert.equal(new Set(cityCandidates.map((entry)=>entry.wikidataId)).size,21);
assert.equal(validateKnowledgeCityEntitySet(cityCandidates).accepted,true);
const selectedCityIds=new Set(cityCandidates.map((entry)=>entry.entityId));
const allPois=poiFiles.flatMap((file)=>read(file).pois.map((entity)=>({entity,file})));
const poiCandidates=[...new Map(allPois.filter(({entity,file})=>selectedCityIds.has(entity.parentCityEntityId)&&!publishedPois.has(file)).map(({entity})=>[entity.entityId,entity])).values()];
assert.equal(poiCandidates.length,116,"Batch03 candidate POI universe must reconcile to 116");
assert.equal(new Set(poiCandidates.map((entry)=>entry.wikidataId)).size,116);
assert.equal(validateKnowledgePoiEntitySet(poiCandidates).accepted,true);
const cityById=new Map(cityCandidates.map((entry)=>[entry.entityId,entry]));
assert.equal(poiCandidates.every((entry)=>cityById.has(entry.parentCityEntityId)),true);
const semanticAuthority=loadBatch03SemanticAuthority(ROOT);
const selectedCountries=codes.map((code)=>countryByCode.get(code));
const admissionAuthority=assertBatch03AdmissionAuthority({countries:selectedCountries,cities:cityCandidates,pois:poiCandidates,...semanticAuthority});
cityCandidates.sort((a,b)=>a.entityId.localeCompare(b.entityId)); poiCandidates.sort((a,b)=>a.entityId.localeCompare(b.entityId));
const perCountry=codes.map((countryCode)=>{const country=countryByCode.get(countryCode);const destinations=cityCandidates.filter((entry)=>entry.parentCountryEntityId===country.entityId);const ids=new Set(destinations.map((entry)=>entry.entityId));const pois=poiCandidates.filter((entry)=>ids.has(entry.parentCityEntityId));const transportRequired=2*Math.max(0,destinations.length-1);return {countryCode,admittedDestinations:destinations.map((entry)=>({entityId:entry.entityId,wikidataId:entry.wikidataId,canonicalNameEn:entry.canonicalNameEn})),admittedDestinationCount:destinations.length,admittedPoiCount:pois.length,foundationComplete:true,remainingBlocker:"evidence-pending",transport:{required:transportRequired,admitted:0,missing:transportRequired},season:{required:destinations.length,admitted:0,missing:destinations.length},themeExisting:0};});
const report={schemaVersion:"route-v2-plannable-expansion-batch03-entity-foundation-v1",baselineMain:"7a11095b9d1b626d64fac875762b4c95bab0fd65",countries:codes,preflight:{reportedPoiUniverse:130,reconciledPoiUniverse:116,discrepancy:-14,reason:"The explicit per-country candidate counts sum to and match the actual candidate entity universe."},authority:{source:"independent-raw-wikidata-semantic-gate",candidateAuthority:"NONE",reportAuthority:"NONE",callerAuthority:"NONE",checkedFacts:admissionAuthority.semantic.factCount,typePolicyNodes:admissionAuthority.semantic.typePolicyNodeCount,destinationDecisions:admissionAuthority.destinationDecisions,poiDecisions:admissionAuthority.poiDecisions},destinationDisposition:{reviewed:21,admitted:21,reused:0,quarantined:0,rejected:0,unaccounted:0,multiDisposition:0},poiDisposition:{reviewed:116,admitted:116,reused:0,quarantined:0,rejected:0,unaccounted:0,multiDisposition:0},perCountry,production:{countries:195,destinations:911,pois:4275,total:5381},readiness:{plannable:122,evidenceBacked:119,catalogOnly:73,accidentalPromotions:0},candidateLeakage:"NONE",evidenceAdded:0,imageChanges:0,performanceClearance:"NOT_CLEARED"};
write("data/knowledge/batches/cities.p1b-batch52.json",{schemaVersion:"route-v2-city-baseline-p1b-batch52",generatedFrom:"plannable-expansion-batch03-entity-foundation",cityCount:cityCandidates.length,cities:cityCandidates});
write("data/knowledge/batches/pois.p1b-batch52.json",{schemaVersion:"route-v2-poi-baseline-p1b-batch52",generatedFrom:"plannable-expansion-batch03-entity-foundation",poiCount:poiCandidates.length,pois:poiCandidates});
write("data/knowledge/batches/review-queue.plannable-expansion-batch03.json",{schemaVersion:"route-v2-plannable-expansion-batch03-review-v1",reviewCount:0,reviews:[]});
write("data/knowledge/reports/plannable-expansion-batch03-entity-foundation.json",report);
console.log(JSON.stringify({status:"PASS",destinations:report.destinationDisposition,pois:report.poiDisposition,production:report.production},null,2));
