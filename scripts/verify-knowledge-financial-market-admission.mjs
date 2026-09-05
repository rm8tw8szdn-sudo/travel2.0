import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  POI_ADMISSION_CONSUMER_IDS,
  RESTRICTED_FINANCIAL_MARKET_POI_TYPE_QIDS,
  evaluatePoiTypeIdsForConsumer,
} from "../src/lib/routes/knowledge-poi-semantic-admission.mjs";
import { KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/semantic/knowledge-semantic-type-policy.json"), "utf8"));

const cases = Object.freeze([
  Object.freeze({ name: "stock-exchange", instanceOfIds: ["Q11691"], expected: false }),
  Object.freeze({ name: "regulated-financial-market", instanceOfIds: ["Q7309637"], expected: false }),
  Object.freeze({ name: "stock-exchange-plus-market", instanceOfIds: ["Q11691", "Q37654"], expected: false }),
  Object.freeze({ name: "physical-marketplace", instanceOfIds: ["Q330284"], expected: true }),
  Object.freeze({ name: "public-market", instanceOfIds: ["Q37654"], expected: true }),
  Object.freeze({ name: "financial-plus-independent-attraction", instanceOfIds: ["Q11691", "Q570116"], expected: true }),
  Object.freeze({ name: "financial-plus-independent-monument", instanceOfIds: ["Q11691", "Q4989906"], expected: true }),
]);

const results = [];
for (const testCase of cases) {
  const decisions = Object.fromEntries(POI_ADMISSION_CONSUMER_IDS.map((consumerId) => {
    const decision = evaluatePoiTypeIdsForConsumer(consumerId, testCase.instanceOfIds, policy);
    assert.equal(decision.accepted, testCase.expected, `${testCase.name}:${consumerId}`);
    return [consumerId, {
      accepted: decision.accepted,
      classification: decision.classification,
      financialMarketTypeDetected: decision.financialMarketTypeDetected,
    }];
  }));
  assert.equal(new Set(Object.values(decisions).map((entry) => entry.accepted)).size, 1, `${testCase.name}:cross-consumer drift`);
  results.push({ name: testCase.name, expected: testCase.expected, decisions });
}

const audit = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/reports/knowledge-poi-positive-admission-audit.json"), "utf8"));
const financialTypeQids = new Set(RESTRICTED_FINANCIAL_MARKET_POI_TYPE_QIDS);
const financialQuarantined = (audit.quarantined || []).filter((entry) => (
  (entry.instanceOfIds || []).some((qid) => financialTypeQids.has(qid))
));
assert.equal(financialQuarantined.length, 8, "the eight audited financial exchanges must be quarantined");
assert(financialQuarantined.every((entry) => entry.classification === "C"), "financial exchanges must be explicitly unsuitable");
assert(financialQuarantined.every((entry) => entry.reasonCodes.includes("financial-market-without-independent-visitor-type")));
assert(financialQuarantined.some((entry) => entry.canonicalNameEn === "Ghana Stock Exchange"), "Ghana Stock Exchange audit entry");

const financialQids = new Set(financialQuarantined.map((entry) => entry.wikidataId));
const publishedPois = KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.flatMap((relativePath) => (
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")).pois || []
));
assert.equal(publishedPois.some((entry) => financialQids.has(entry.wikidataId)), false, "financial exchanges must not remain published");

const batchRoot = path.join(ROOT, "data/knowledge/batches");
for (const name of fs.readdirSync(batchRoot)) {
  if (/^selection\.p1b-batch\d+\.json$/u.test(name)) {
    const selection = JSON.parse(fs.readFileSync(path.join(batchRoot, name), "utf8"));
    assert.equal((selection.pois || []).some((entry) => financialQids.has(entry.wikidataId)), false, `${name}:financial selection reference`);
  }
  if (/^provenance\.knowledge-expansion-batch.+\.json$/u.test(name)) {
    const provenance = JSON.parse(fs.readFileSync(path.join(batchRoot, name), "utf8"));
    assert.equal((provenance.publishedEntityQids || []).some((qid) => financialQids.has(qid)), false, `${name}:financial published provenance reference`);
  }
}

for (const relativePath of [
  "data/route-v2/images/image-coverage-manifest.json",
  "route-v2-image-coverage.js",
  "data/knowledge/reports/knowledge-expansion-batch09-route-consumption.json",
  "data/knowledge/reports/knowledge-expansion-batch09-hard-constraint-stress.json",
  "data/knowledge/reports/knowledge-expansion-batch09-browser-acceptance.json",
]) {
  const text = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  for (const qid of financialQids) assert.equal(text.includes(qid), false, `${relativePath}:${qid}:downstream reference`);
  assert.equal(text.includes("Ghana Stock Exchange"), false, `${relativePath}:Ghana Stock Exchange must not be consumed`);
}

process.stdout.write(`${JSON.stringify({
  verifier: "knowledge-financial-market-admission",
  status: "PASS",
  cases: results.length,
  consumers: POI_ADMISSION_CONSUMER_IDS,
  quarantinedFinancialExchanges: financialQuarantined.map((entry) => ({
    wikidataId: entry.wikidataId,
    canonicalNameEn: entry.canonicalNameEn,
  })),
  downstreamConsumerReferences: 0,
  results,
}, null, 2)}\n`);
