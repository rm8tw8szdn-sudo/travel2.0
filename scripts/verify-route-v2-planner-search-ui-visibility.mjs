import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../routes.js", import.meta.url), "utf8");

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf(") {", start) + 2;
  assert.ok(bodyStart > 1, `${name} body must exist`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

const context = vm.createContext({
  BAD_REMOTE_COVER_PATTERNS: [],
  ROUTE_IMAGE_COUNTRY_MISMATCH_RULES: [],
  badRuntimeImageUrls: new Set(),
});
for (const name of [
  "coverIdentity",
  "routeCountryCodes",
  "imageCountryCodesForUrl",
  "routeHasAnyCountry",
  "routeImageAllowed",
  "routeImageAllowedForAsset",
]) vm.runInContext(functionSource(name), context);

const record = {
  id: "planner-designed-test",
  countries: ["NL"],
  countryEntities: [{ countryCode: "NL" }],
  feedReady: false,
  searchStatus: "needs-review",
};
const image = {
  imageUrl: "http://127.0.0.1:4175/assets/profile-avatar-kuma-small.jpg",
  imageCountryCodes: ["NL"],
  semanticStatus: "verified",
};

assert.equal(context.routeImageAllowed(record, image.imageUrl), false);
assert.equal(context.routeImageAllowedForAsset(record, image), true);
assert.equal(
  source.match(/routeImageAllowedForAsset\(record, image\)/gu)?.length,
  3,
  "Every newly returned route cover must use prospective-asset validation",
);

const visibilityContext = vm.createContext({
  feedState: {
    records: [record],
    query: "Netherlands Amsterdam 7 days",
    activeTab: "cross",
    feedRouteType: "cross",
  },
  hasReadyRouteCover: () => true,
});
for (const name of ["routeKind", "visibleRecords"]) {
  vm.runInContext(functionSource(name), visibilityContext);
}
assert.deepEqual(
  Array.from(visibilityContext.visibleRecords(), (item) => item.id),
  [record.id],
  "Search results must not inherit the public-feed route-type tab filter",
);
assert.match(source, /feedRouteType:\s*feedState\.query\s*\?\s*""\s*:\s*feedState\.activeTab/u);
assert.match(source, /if \(requested\.query\)[\s\S]*selectAppendableRecords\(pageRecords, BATCH_SIZE, previousRecords\)[\s\S]*appendRecords\(batchRecords, SEARCH_PAGE_SIZE\)/u);
const searchBranchStart = source.indexOf("if (requested.query)");
const searchBranch = source.slice(searchBranchStart, source.indexOf("} else {", searchBranchStart));
assert.doesNotMatch(searchBranch, /feedReady|searchStatus|needs-review/u);
assert.doesNotMatch(searchBranch, /filter\(hasReadyRouteCover\)/u);

console.log("PASS verify-route-v2-planner-search-ui-visibility");
