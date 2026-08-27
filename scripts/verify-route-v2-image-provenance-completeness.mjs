import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  auditImageProvenance,
  auditProvenanceCollection,
} from "./lib/image-provenance-license.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const AUDIT_PATH = "data/route-v2/images/image-debt-provenance-completeness-audit.json";
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

const validCcBy = Object.freeze({
  entityId: "city-test",
  wikidataId: "Q123",
  entityType: "City",
  assetPath: "assets/route-v2-images/cities/city-q123.webp",
  localAssetPath: "assets/route-v2-images/cities/city-q123.webp",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Exact_city.jpg",
  sourcePlatform: "Wikimedia Commons",
  creator: "Verified Photographer",
  author: "Verified Photographer",
  attribution: "Verified Photographer — CC BY 4.0",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceHash: "a".repeat(64),
  processedHash: "b".repeat(64),
  acquisitionDate: "2026-08-24",
  originalFilename: "Exact city.jpg",
  verificationStatus: "verified-exact-entity-source-license-size-and-visual-audit",
  status: "imageReady",
  visualAuditStatus: "passed",
  usageStatus: "approved-local-runtime",
  rights: {
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Exact_city.jpg",
    author: "Verified Photographer",
    attribution: "Verified Photographer — CC BY 4.0",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    externalCopyrightMaterial: true,
  },
});

assert.equal(auditImageProvenance(validCcBy).valid, true);

const mutations = [
  { name: "license-url-deleted", mutate: (record) => { delete record.licenseUrl; } },
  { name: "license-url-empty", mutate: (record) => { record.licenseUrl = ""; } },
  { name: "cc-by-creator-missing", mutate: (record) => { record.creator = null; record.author = null; } },
  { name: "placeholder-creator", mutate: (record) => { record.creator = "unknown"; record.author = "unknown"; } },
  { name: "cc-by-sa-attribution-missing", mutate: (record) => { record.license = "CC BY-SA 4.0"; record.licenseUrl = "https://creativecommons.org/licenses/by-sa/4.0/"; record.rights.license = record.license; record.rights.licenseUrl = record.licenseUrl; record.attribution = null; record.rights.attribution = null; } },
  { name: "wrong-license-version", mutate: (record) => { record.licenseUrl = "https://creativecommons.org/licenses/by/3.0/"; record.rights.licenseUrl = record.licenseUrl; } },
  { name: "source-url-as-license-url", mutate: (record) => { record.licenseUrl = record.sourceUrl; record.rights.licenseUrl = record.licenseUrl; } },
  { name: "canonical-source-missing", mutate: (record) => { record.sourceUrl = ""; record.rights.sourceUrl = ""; } },
  { name: "processed-hash-missing", mutate: (record) => { record.processedHash = null; } },
  { name: "verified-dedicated-incomplete", mutate: (record) => { record.attribution = "   "; record.rights.attribution = "   "; } },
];

for (const fixture of mutations) {
  const record = structuredClone(validCcBy);
  fixture.mutate(record);
  const result = auditImageProvenance(record);
  assert.equal(result.valid, false, `${fixture.name} must fail`);
}

const provenance = json(PROVENANCE_PATH);
const auditArtifact = json(AUDIT_PATH);
const result = auditProvenanceCollection(provenance.assets.filter((record) => record.status === "imageReady"));
assert.equal(result.invalid.length, 0, JSON.stringify(result.invalid.slice(0, 10), null, 2));
assert.equal(result.total, provenance.assets.length);
assert.equal(result.valid, provenance.assets.length);
assert.equal(result.licenseUrlComplete, provenance.assets.length);
assert.equal(result.creatorCompleteWhereRequired, result.attributionRequired);
assert.equal(result.attributionCompleteWhereRequired, result.attributionRequired);

assert.equal(auditArtifact.schemaVersion, "route-v2-image-debt-provenance-completeness-v1");
assert.equal(auditArtifact.after.verifiedDedicated, provenance.assets.length);
assert.equal(auditArtifact.after.provenanceComplete, provenance.assets.length);
assert.equal(auditArtifact.after.licenseComplete, provenance.assets.length);
assert.equal(auditArtifact.after.licenseUrlComplete, provenance.assets.length);
assert.equal(auditArtifact.after.creatorCompleteWhereRequired, auditArtifact.after.attributionRequired);
assert.equal(auditArtifact.after.attributionCompleteWhereRequired, auditArtifact.after.attributionRequired);
assert.equal(auditArtifact.mutationFixtures.killed, mutations.length);
assert.equal(auditArtifact.mutationFixtures.total, mutations.length);

for (const withdrawn of provenance.withdrawnAssets || []) {
  assert.equal(withdrawn.withdrawalReason, "LICENSE_METADATA_INCOMPLETE");
  assert.equal(withdrawn.status, "withdrawn");
  assert.equal(fs.existsSync(path.join(ROOT, withdrawn.assetPath)), false, `withdrawn asset file retained:${withdrawn.assetPath}`);
}

console.log(JSON.stringify({
  verifier: "route-v2-image-provenance-completeness",
  status: "PASS",
  verifiedDedicated: result.total,
  provenanceComplete: result.valid,
  attributionRequired: result.attributionRequired,
  creatorCompleteWhereRequired: result.creatorCompleteWhereRequired,
  attributionCompleteWhereRequired: result.attributionCompleteWhereRequired,
  licenseUrlComplete: result.licenseUrlComplete,
  withdrawn: provenance.withdrawnAssets?.length || 0,
  mutationCasesKilled: mutations.length,
}, null, 2));
