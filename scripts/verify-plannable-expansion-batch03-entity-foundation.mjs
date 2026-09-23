import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { getAuthoritativeKnowledgeReadiness } from "../src/lib/routes/knowledge-readiness-authority.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { createTypedEntityId } from "../src/lib/routes/knowledge-entity-layer-primitives.mjs";
import { assertBatch03AdmissionAuthority, evaluateBatch03AdmissionAuthority, loadBatch03SemanticAuthority } from "./lib/batch03-entity-admission-authority.mjs";

const ROOT=path.resolve(import.meta.dirname,".."); const json=(file)=>JSON.parse(fs.readFileSync(path.join(ROOT,file),"utf8")); const clone=(value)=>structuredClone(value);
const report=json("data/knowledge/reports/plannable-expansion-batch03-entity-foundation.json"); const cities=json("data/knowledge/batches/cities.p1b-batch52.json"); const pois=json("data/knowledge/batches/pois.p1b-batch52.json"); const review=json("data/knowledge/batches/review-queue.plannable-expansion-batch03.json");
const EXPECTED_DESTINATIONS=Object.freeze({LC:["Q41699"],VC:["Q41474"],ST:["Q3932"],SB:["Q40921"],TG:["Q3792"],TM:["Q23438"],TO:["Q38834"],AG:["Q36262","Q31578200"],CG:["Q3844","Q223920"],GD:["Q41547","Q375507"],GM:["Q3726","Q217568"],KN:["Q41295","Q992311"],BI:["Q3854","Q167551"],GN:["Q3733","Q874317"]});
const countryIdByCode=new Map(createPublishedKnowledgeEntityLayerRepository({projectRoot:ROOT}).listCountries().map((x)=>[x.isoAlpha2,x.entityId]));
function assertContract({report,cities,pois,review}){assert.equal(report.preflight.reconciledPoiUniverse,116);assert.deepEqual(report.destinationDisposition,{reviewed:21,admitted:21,reused:0,quarantined:0,rejected:0,unaccounted:0,multiDisposition:0});assert.deepEqual(report.poiDisposition,{reviewed:116,admitted:116,reused:0,quarantined:0,rejected:0,unaccounted:0,multiDisposition:0});assert.equal(cities.cityCount,21);assert.equal(pois.poiCount,116);assert.deepEqual(review,{schemaVersion:"route-v2-plannable-expansion-batch03-review-v1",reviewCount:0,reviews:[]});assert.deepEqual(validateKnowledgeCityEntitySet(cities.cities),{accepted:true,reasons:[]});assert.deepEqual(validateKnowledgePoiEntitySet(pois.pois),{accepted:true,reasons:[]});assert.equal(new Set(cities.cities.map((x)=>x.entityId)).size,21);assert.equal(new Set(cities.cities.map((x)=>x.wikidataId)).size,21);assert.equal(new Set(pois.pois.map((x)=>x.entityId)).size,116);assert.equal(new Set(pois.pois.map((x)=>x.wikidataId)).size,116);const expectedByQid=new Map(Object.entries(EXPECTED_DESTINATIONS).flatMap(([code,qids])=>qids.map((qid)=>[qid,countryIdByCode.get(code)])));assert.equal(cities.cities.every((x)=>expectedByQid.get(x.wikidataId)===x.parentCountryEntityId),true);assert.equal(cities.cities.every((x)=>x.entityType==="city"),true);const cityIds=new Set(cities.cities.map((x)=>x.entityId));assert.equal(pois.pois.every((x)=>cityIds.has(x.parentCityEntityId)),true);assert.equal(pois.pois.every((x)=>Object.keys(x.provenance??{}).length>0&&!x.ancestryCycle&&(x.ancestryDepth===undefined||x.ancestryDepth<=8)&&!Object.hasOwn(x,"countryCode")),true);assert.deepEqual(report.readiness,{plannable:122,evidenceBacked:119,catalogOnly:73,accidentalPromotions:0});assert.equal(report.evidenceAdded,0);assert.equal(report.imageChanges,0);assert.equal(report.candidateLeakage,"NONE");}
assertContract({report,cities,pois,review});
assert.equal(report.authority.candidateAuthority,"NONE");assert.equal(report.authority.reportAuthority,"NONE");assert.equal(report.authority.callerAuthority,"NONE");
const repositoryForAuthority=createPublishedKnowledgeEntityLayerRepository({projectRoot:ROOT});
const selectedCountries=repositoryForAuthority.listCountries().filter((entry)=>report.countries.includes(entry.isoAlpha2));
const baseAuthority=loadBatch03SemanticAuthority(ROOT);
assertBatch03AdmissionAuthority({countries:selectedCountries,cities:cities.cities,pois:pois.pois,...baseAuthority});

const cloneFacts=(facts)=>new Map([...facts].map(([qid,fact])=>[qid,clone(fact)]));
const cloneBindings=(bindings)=>new Map([...bindings].map(([qid,parents])=>[qid,new Set(parents)]));
const authorityFixture=({cities:fixtureCities=clone(cities.cities),pois:fixturePois=clone(pois.pois),factsByQid=cloneFacts(baseAuthority.factsByQid),typePolicy=clone(baseAuthority.typePolicy)}={})=>({countries:clone(selectedCountries),cities:fixtureCities,pois:fixturePois,factsByQid,poiParentCityIdsByQid:cloneBindings(baseAuthority.poiParentCityIdsByQid),typePolicy,exceptionDocument:clone(baseAuthority.exceptionDocument)});
const expectAuthorityReject=(label,fixture)=>assert.throws(()=>assertBatch03AdmissionAuthority(fixture),/batch03-independent-admission-rejected/u,label);
const cityFactMutation=(label,typeQid)=>{const fixture=authorityFixture();const qid=fixture.cities[0].wikidataId;fixture.factsByQid.get(qid).instanceOfIds=[typeQid];expectAuthorityReject(label,fixture);};
cityFactMutation("generator-region-as-destination","Q82794");
cityFactMutation("generator-island-as-destination","Q23442");
cityFactMutation("generator-administrative-as-destination","Q15617994");
const poiFactMutation=(label,typeQid)=>{const fixture=authorityFixture();const qid=fixture.pois[0].wikidataId;fixture.factsByQid.get(qid).instanceOfIds=[typeQid];expectAuthorityReject(label,fixture);};
poiFactMutation("generator-non-visitable-poi","Q55488");
poiFactMutation("generator-watercourse-or-generic-feature-poi","Q121359");
{
  const fixture=authorityFixture();const injected=clone(fixture.cities[0]);injected.wikidataId="Q999999991";injected.entityId=createTypedEntityId({entityType:"city",wikidataId:injected.wikidataId});injected.canonicalNameEn="Unreviewed Candidate";injected.provenance.wikidataId.value=injected.wikidataId;injected.provenance.entityId.value=injected.entityId;injected.provenance.canonicalNameEn.value=injected.canonicalNameEn;fixture.cities.push(injected);expectAuthorityReject("generator-candidate-only-injection",fixture);
}
{
  const fixture=authorityFixture();fixture.cities[0].parentCountryEntityId=fixture.countries.find((entry)=>entry.entityId!==fixture.cities[0].parentCountryEntityId).entityId;fixture.cities[0].provenance.parentCountryEntityId.value=fixture.cities[0].parentCountryEntityId;expectAuthorityReject("generator-cross-country-substitution",fixture);
}
{
  const fixture=authorityFixture();const sourceCity=fixture.cities.find((city)=>fixture.cities.some((candidate)=>candidate.parentCountryEntityId===city.parentCountryEntityId&&candidate.entityId!==city.entityId));const poi=fixture.pois.find((entry)=>entry.parentCityEntityId===sourceCity.entityId);const replacement=fixture.cities.find((entry)=>entry.parentCountryEntityId===sourceCity.parentCountryEntityId&&entry.entityId!==sourceCity.entityId);poi.parentCityEntityId=replacement.entityId;poi.provenance.parentCityEntityId.value=replacement.entityId;expectAuthorityReject("generator-cross-destination-substitution",fixture);
}
{
  const fixture=authorityFixture();const replacement=clone(fixture.cities[0]);replacement.wikidataId="Q999999992";replacement.entityId=createTypedEntityId({entityType:"city",wikidataId:replacement.wikidataId});replacement.canonicalNameEn="Same Count Replacement";replacement.provenance.wikidataId.value=replacement.wikidataId;replacement.provenance.entityId.value=replacement.entityId;replacement.provenance.canonicalNameEn.value=replacement.canonicalNameEn;fixture.cities[0]=replacement;expectAuthorityReject("generator-same-count-replacement",fixture);
}
{
  const fixture=authorityFixture();const fact=fixture.factsByQid.get(fixture.cities[0].wikidataId);fixture.factsByQid.delete(fixture.cities[0].wikidataId);fixture.factsByQid.set("Q999999993",fact);expectAuthorityReject("generator-authority-qid-mismatch",fixture);
}
{
  const fixture=authorityFixture();fixture.factsByQid.delete(fixture.cities[0].wikidataId);expectAuthorityReject("generator-authority-absent",fixture);
}
const ancestryFixture=(label,mutate)=>{const fixture=authorityFixture();const typeQid=fixture.factsByQid.get(fixture.pois[0].wikidataId).instanceOfIds[0];mutate(fixture.typePolicy,typeQid);expectAuthorityReject(label,fixture);};
ancestryFixture("generator-ancestry-cycle",(policy,typeQid)=>{policy.nodes[typeQid].parentQids=[typeQid];policy.typeClassifications[typeQid].allowedKinds.poi=[typeQid,typeQid];});
ancestryFixture("generator-ancestry-depth-overflow",(policy,typeQid)=>{policy.maximumSubclassDepth=1;});
ancestryFixture("generator-invalid-ancestor",(policy,typeQid)=>{policy.typeClassifications[typeQid].allowedKinds.poi=[typeQid,"Q6256"];});
assert.equal(evaluateBatch03AdmissionAuthority(authorityFixture()).accepted,true,"positive controls must traverse the production authority path");
const mutations=[["wrong-country-qid",v=>v.cities.cities[0].parentCountryEntityId="country-wrong"],["wrong-destination-qid",v=>v.cities.cities[0].wikidataId="Q0"],["region-as-city",v=>v.cities.cities[0].entityType="region"],["island-as-city",v=>v.cities.cities[0].entityType="island"],["country-as-city",v=>v.cities.cities[0].entityType="country"],["invalid-ancestry",v=>v.pois.pois[0].provenance={}],["ancestry-cycle",v=>v.pois.pois[0].ancestryCycle=true],["depth-overflow",v=>v.pois.pois[0].ancestryDepth=999],["cross-country-poi",v=>v.pois.pois[0].countryCode="ZZ"],["cross-destination-poi",v=>v.pois.pois[0].parentCityEntityId="city-wrong"],["candidate-injection",v=>v.report.candidateLeakage="CANDIDATE"],["quarantine-injection",v=>v.review.reviewCount=1],["same-count-substitution",v=>v.cities.cities[0].entityId="city-substitute"],["duplicate-qid",v=>v.cities.cities[1].wikidataId=v.cities.cities[0].wikidataId],["homonym-wrong-country",v=>v.cities.cities[0].parentCountryEntityId=v.cities.cities[1].parentCountryEntityId]];
for(const [label,mutate] of mutations){const v={report:clone(report),cities:clone(cities),pois:clone(pois),review:clone(review)};mutate(v);assert.throws(()=>assertContract(v),undefined,label);}
const repo=createPublishedKnowledgeEntityLayerRepository({projectRoot:ROOT});assert.deepEqual({countries:repo.listCountries().length,destinations:repo.listCities().length,pois:repo.listPois().length,total:repo.listCountries().length+repo.listCities().length+repo.listPois().length},report.production);assert.deepEqual(getAuthoritativeKnowledgeReadiness().expectedCounts,{plannable:122,evidenceBacked:119,catalogOnly:73});
console.log(JSON.stringify({verifier:"plannable-expansion-batch03-entity-foundation",status:"PASS",destinations:report.destinationDisposition,pois:report.poiDisposition,production:report.production,artifactMutationCases:mutations.length,generatorPathAuthorityCases:14,candidateLeakage:"NONE"},null,2));
