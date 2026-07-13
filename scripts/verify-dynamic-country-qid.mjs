import assert from "node:assert/strict";
import { buildKnowledgeGraphPool, fetchCountryQid } from "../src/lib/routes/index.mjs";

let qidLookupSeen = false;
let destinationQuerySeen = false;

const fetchImpl = async (url) => {
  const decoded = decodeURIComponent(String(url));
  if (decoded.includes('wdt:P297 "CH"')) {
    qidLookupSeen = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: { bindings: [{ country: { value: "http://www.wikidata.org/entity/Q39" } }] },
      }),
      headers: new Map(),
    };
  }
  if (decoded.includes("wd:Q39")) {
    destinationQuerySeen = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: {
          bindings: [
            { place: { value: "http://www.wikidata.org/entity/Q72" }, zh: { value: "苏黎世" }, en: { value: "Zurich" }, typeLabel: { value: "city" }, coord: { value: "Point(8.5417 47.3769)" } },
            { place: { value: "http://www.wikidata.org/entity/Q70" }, zh: { value: "伯尔尼" }, en: { value: "Bern" }, typeLabel: { value: "city" }, coord: { value: "Point(7.4474 46.9480)" } },
            { place: { value: "http://www.wikidata.org/entity/Q68144" }, zh: { value: "卢塞恩" }, en: { value: "Lucerne" }, typeLabel: { value: "city" }, coord: { value: "Point(8.3093 47.0502)" } },
            { place: { value: "http://www.wikidata.org/entity/Q16716" }, zh: { value: "日内瓦" }, en: { value: "Geneva" }, typeLabel: { value: "city" }, coord: { value: "Point(6.1432 46.2044)" } },
          ],
        },
      }),
      headers: new Map(),
    };
  }
  return { ok: false, status: 404, json: async () => ({}), headers: new Map() };
};

const qid = await fetchCountryQid("CH", fetchImpl, Date.now() + 30_000);
assert.equal(qid, "Q39", `dynamic country QID lookup should return Q39, got ${qid}`);

const pool = await buildKnowledgeGraphPool({ countryCodes: ["CH"], fetchImpl, deadlineAt: Date.now() + 30_000 });
assert.ok(qidLookupSeen, "buildKnowledgeGraphPool should look up CH via wdt:P297");
assert.ok(destinationQuerySeen, "destination SPARQL should use dynamically resolved wd:Q39");
assert.ok(pool.CH.length >= 4, `CH pool should contain mocked destinations, got ${pool.CH?.length}`);
const sourceTitles = pool.CH.map((item) => item.sourceTitle);
assert.ok(sourceTitles.includes("Zurich"), `CH pool should keep mocked destination Zurich, got ${JSON.stringify(sourceTitles)}`);
assert.ok(sourceTitles.includes("Interlaken"), `CH pool should include fallback rail anchor Interlaken, got ${JSON.stringify(sourceTitles)}`);
assert.ok(sourceTitles.includes("Zermatt"), `CH pool should include fallback rail anchor Zermatt, got ${JSON.stringify(sourceTitles)}`);

console.log("Dynamic country QID verified: CH resolved through wdt:P297 to Q39, used wd:Q39, and kept fallback rail anchors.");
