import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildBatch03PromotionModel } from "./prepare-plannable-expansion-batch03-promotion.mjs";
import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { evaluateBatch03CountryPromotion } from "../src/lib/routes/plannable-expansion-batch03-promotion-authority.mjs";

const ROOT=path.resolve(import.meta.dirname,".."),clone=structuredClone;
const searchServiceSource=fs.readFileSync(path.join(ROOT,"src/lib/routes/route-search-service.mjs"),"utf8");
assert.match(searchServiceSource,/const BATCH03_PROMOTION_CANDIDATE_CODES = Object\.freeze\(\["LC", "VC", "ST", "SB", "TG", "TM", "TO", "AG", "CG", "GD", "GM", "KN", "BI", "GN"\]\)/u);
assert.doesNotMatch(searchServiceSource,/createPromotionEvaluationSearchService/u,"no generic caller-selected Promotion evaluator");
const report=JSON.parse(fs.readFileSync(path.join(ROOT,"data/knowledge/reports/plannable-expansion-batch03-promotion.json"),"utf8"));
const live=await buildBatch03PromotionModel();
function assertContract(value){assert.deepEqual(value,live,"promotion artifact must exactly match independent live evaluation")}
assertContract(report);
assert.equal(live.evaluated,14);assert.equal(live.unaccounted,0);assert.equal(live.multiDisposition,0);assert.equal(live.promoted,0);assert.equal(live.blocked,14);assert.deepEqual(live.promotedCountryCodes,[]);assert.equal(new Set(live.evaluatedCountryCodes).size,14);assert.deepEqual(live.readinessBefore,{plannable:122,evidenceBacked:119,catalogOnly:73});assert.deepEqual(live.readinessAfter,live.readinessBefore);assert.deepEqual(live.exactMembershipChange,[]);assert.equal(live.accidentalPromotions,0);
const lc=live.decisions.find((entry)=>entry.countryCode==="LC");assert.equal(lc.eligible,true);assert.equal(lc.transportExempt,true);assert.equal(lc.requiredSeason,1);assert.equal(lc.admittedSeason,1);assert.equal(lc.liveRouteGate.passedQueries,0);assert.equal(lc.decision,"BLOCK");assert.equal(lc.firstAuthoritativeBlocker,"live-route-gate-failed");
assert.deepEqual(lc.liveRouteGate.failures.map((entry)=>entry.query),["Saint Lucia","Saint Lucia 7 days","Saint Lucia February","Saint Lucia 7 days in February"]);
assert.deepEqual(lc.liveRouteGate.failures.map((entry)=>entry.parsedConstraints),[
 {countryCodes:["LC"],destinationIds:[],destinationNames:[],durationDays:null,months:[],season:null,region:null,theme:null,transport:null,invalidDuration:false},
 {countryCodes:["LC"],destinationIds:[],destinationNames:[],durationDays:7,months:[],season:null,region:null,theme:null,transport:null,invalidDuration:false},
 {countryCodes:["LC"],destinationIds:[],destinationNames:[],durationDays:null,months:[2],season:null,region:null,theme:null,transport:null,invalidDuration:false},
 {countryCodes:["LC"],destinationIds:[],destinationNames:[],durationDays:7,months:[2],season:null,region:null,theme:null,transport:null,invalidDuration:false},
]);
assert.equal(lc.liveRouteGate.failures.every((entry)=>entry.candidateScopeMembership===true&&entry.reason==="constraint-conflict"&&entry.constraintConflict?.reasonCodes?.includes("no-valid-route")&&entry.plannerRejected?.some((rejection)=>rejection.reason==="skeleton-too-short")),true,"LC must enter Batch03 scope and reach the real planner blocker");
assert.equal(live.positiveControl.countryCode,"BB");assert.equal(live.positiveControl.decision,"PROMOTE");assert.equal(live.positiveControl.passedQueries,4);assert.equal(live.positiveControl.failures.length,0);
assert.equal(live.scopeControls.batch01CannotAuthorizeLc.failures.every((entry)=>entry.candidateScopeMembership===false&&entry.plannerRejected.length===0),true,"Batch01 evaluator must not authorize LC");
assert.equal(live.scopeControls.unrelatedCountryExcluded.failures.every((entry)=>entry.candidateScopeMembership===false&&entry.plannerRejected.length===0),true,"Batch03 evaluator must exclude unrelated countries");
assert.deepEqual(live.scopeControls.callerCannotInject,live.scopeControls.unrelatedCountryExcluded,"caller candidate injection must have no effect");
assert.deepEqual(live.scopeControls.callerCannotRemoveLc,lc.liveRouteGate,"caller candidate removal must have no effect");
assert.equal(live.decisions.filter((entry)=>entry.countryCode!=="LC").every((entry)=>!entry.eligible&&entry.decision==="BLOCK"&&entry.liveRouteGate===null),true);
const repository=createPublishedKnowledgeEntityLayerRepository({projectRoot:ROOT}),country=repository.listCountries().find((entry)=>entry.isoAlpha2==="LC"),cities=repository.listCities().filter((entry)=>entry.parentCountryEntityId===country.entityId),ids=new Set(cities.map((entry)=>entry.entityId)),pois=cities.flatMap((city)=>repository.listPoisByCity(city.entityId));
const seasons=fs.readFileSync(path.join(ROOT,"data/route-v2/evidence-seed/season-evidence.jsonl"),"utf8").split(/\r?\n/u).filter(Boolean).map(JSON.parse).filter((entry)=>ids.has(entry.entityId));
const fixture={country,cities,pois,routeLegEvidence:[],seasonEvidence:seasons,currentCatalogOnly:true};assert.equal(evaluateBatch03CountryPromotion(fixture).eligible,true,"LC evidence gate positive path");assert.equal(evaluateBatch03CountryPromotion({...fixture,seasonEvidence:[]}).eligible,false,"LC missing season");assert.equal(evaluateBatch03CountryPromotion({...fixture,seasonEvidence:[{...seasons[0],entityId:"city-0000000000000000"}]}).eligible,false,"LC wrong destination season");assert.equal(evaluateBatch03CountryPromotion({...fixture,cities:[{...cities[0],entityId:"city-0000000000000000"}]}).eligible,false,"LC destination mutation");assert.equal(evaluateBatch03CountryPromotion({...fixture,pois:[]}).eligible,false,"LC missing POI");assert.equal(evaluateBatch03CountryPromotion({...fixture,currentCatalogOnly:false,promote:true}).eligible,false,"caller promote grants no authority");
const mutations=[
 ["report-flip",v=>{v.decisions[1].decision="PROMOTE"}],
 ["artifact-pass",v=>{v.decisions[0].decision="PROMOTE";v.promoted=1;v.blocked=13;v.promotedCountryCodes=["LC"]}],
 ["evidence-blocked-promote",v=>{v.decisions[1].decision="PROMOTE"}],
 ["missing-season-promote",v=>{v.decisions[1].admittedSeason=v.decisions[1].requiredSeason;v.decisions[1].decision="PROMOTE"}],
 ["missing-transport-promote",v=>{const d=v.decisions.find(x=>x.countryCode==="AG");d.admittedTransport=d.requiredTransport;d.decision="PROMOTE"}],
 ["same-count-substitution",v=>{v.evaluatedCountryCodes[0]="ZZ"}],
 ["replace-lc",v=>{v.decisions[0].countryCode="VC"}],
 ["unknown-country",v=>{v.decisions[0].countryCode="ZZ"}],
 ["duplicate-member",v=>{v.evaluatedCountryCodes[13]=v.evaluatedCountryCodes[0]}],
 ["stale-evaluation",v=>{v.decisions[0].liveRouteGate.passedQueries=4}],
 ["live-result-mismatch",v=>{v.decisions[0].liveRouteGate.decision="PROMOTE"}],
 ["caller-request",v=>{v.callerRequestedPromotions=["LC"]}],
 ["report-scope-injection",v=>{v.evaluatedCountryCodes[13]="BB"}],
 ["artifact-scope-removal",v=>{v.evaluatedCountryCodes=v.evaluatedCountryCodes.filter(x=>x!=="LC")}],
 ["scope-control-forgery",v=>{v.scopeControls.callerCannotInject.decision="PROMOTE"}],
];
for(const [name,mutate] of mutations){const value=clone(report);mutate(value);assert.throws(()=>assertContract(value),undefined,name)}
console.log(JSON.stringify({verifier:"plannable-expansion-batch03-promotion",status:"PASS",evaluated:14,promoted:0,blocked:14,lc:{candidateScope:"PASS",evidenceGate:"PASS",transportExemption:"PASS",seasonGate:"PASS",liveRouteEvaluator:"BLOCK",exactBlocker:"skeleton-too-short",finalDisposition:"BLOCK"},positiveLiveControl:"PASS",scopeControls:{batch01Isolation:"PASS",unrelatedExclusion:"PASS",callerInjection:"REJECTED",callerRemoval:"REJECTED",sameCountSubstitution:"REJECTED"},authorityMutationCases:mutations.length,lcNegativeControls:5,readiness:live.readinessAfter,accidentalPromotions:0},null,2));
