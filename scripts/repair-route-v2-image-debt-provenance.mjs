import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  attributionRequiredForLicense,
  auditImageProvenance,
  auditProvenanceCollection,
  canonicalLicenseUrl,
  meaningfulCreator,
  meaningfulText,
} from "./lib/image-provenance-license.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const AUDIT_PATH = "data/route-v2/images/image-debt-provenance-completeness-audit.json";
const WRITE = process.argv.includes("--write");
const CHECK = process.argv.includes("--check");
if (WRITE === CHECK) throw new Error("use-exactly-one-mode:--write|--check");

const USER_AGENT = "travel2-route-v2-provenance-repair/1.0 (https://github.com/rm8tw8szdn-sudo/travel2.0)";
const REPAIRED_AT = "2026-08-26T08:00:00.000Z";
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const writeJson = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const clean = (value) => String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const revisionUrl = (sourceUrl, revisionId) => `${sourceUrl.replace(/\/wiki\/File:/u, "/w/index.php?title=File:")}&oldid=${revisionId}`;

const CREATOR_REPAIRS = Object.freeze([
  { entityId: "city-111ccbe353f6c218", qid: "Q180918", file: "Fort pafos.jpg", revisionId: 1258199761, creator: "Paul167", evidenceKind: "explicit-author", fragments: ["Author: [[w:pl:Wikipedysta:Paul167|Paul167]]"] },
  { entityId: "city-38fc358bbc358cb9", qid: "Q36947", file: "SalvadorDaBahiaPalacioRioBranco.jpg", revisionId: 1249317315, creator: "Maximilian Dörrbecker", evidenceKind: "explicit-source-and-creator-category", fragments: ["Source:''' Maximilian Dörrbecker", "Category:User:Maximilian Dörrbecker"] },
  { entityId: "city-48c618f238f3263d", qid: "Q803", file: "Nachtegaalstraat Utrecht.jpg", revisionId: 21613364, revisionUser: "Kattenkruid", creator: "Kattenkruid", evidenceKind: "self-license-by-revision-author", fragments: ["{{self|cc-by-sa-3.0}}"] },
  { entityId: "city-50645031fe7e62a5", qid: "Q220445", file: "Kuching_Waterfront_India_Street.jpg", revisionId: 1219355090, creator: "Aron Paul", evidenceKind: "explicit-author", fragments: ["Author: Aron Paul 2004.", "Uploaded by author"] },
  { entityId: "city-567aca625098d09b", qid: "Q1296", file: "Ghent - centre.jpg", revisionId: 1244523061, creator: "Denis Jacquerye", evidenceKind: "explicit-author-line", fragments: ["Denis Jacquerye, 2001"] },
  { entityId: "city-d029e97d08ae18b0", qid: "Q58337", file: "Banff Avenue - Cascade Mountain01.jpg", revisionId: 11761396, revisionUser: "Port(u*o)s", creator: "Diderot", derivativeContributor: "Port(u*o)s", evidenceKind: "named-original-author-and-recorded-derivative", fragments: ["first uploader [[User:Diderot]]", "rotation of the original image"] },
  { entityId: "city-d2c59cf3c9b76937", qid: "Q5460", file: "StellenboschPleinStreet.jpg", revisionId: 1117694531, creator: "Dewet", evidenceKind: "self-authored-and-creator-category", fragments: ["Taken by myself", "Category:Images by User:Dewet"] },
  { entityId: "city-dad1fbc2e08889af", qid: "Q1355", file: "UB City.jpg", revisionId: 1115837343, creator: "Andreina Lairet", evidenceKind: "file-exif-copyright-holder", fragments: ["Uploaded by User:andreina_photos"], metadata: { name: "Copyright", value: "Andreina Lairet" } },
  { entityId: "city-dcf9139a7d167309", qid: "Q1192713", file: "Carrer de Livingston.JPG", revisionId: 1063752973, creator: "Chixoy", evidenceKind: "explicit-by-line-and-self-source", fragments: ["'''By''': [[:ca:Usuari:Chixoy|Chixoy]]", "I took the photograph"] },
  { entityId: "city-ed958a6d1d2dcc7d", qid: "Q83247", file: "Arco da porta nova Braga.jpg", revisionId: 1064761160, creator: "José Gonçalves", evidenceKind: "explicit-author", fragments: ["Autor:José Gonçalves"] },
  { entityId: "city-fd268a60febe1082", qid: "Q191015", file: "Trakai-bridge.jpg", revisionId: 1149528479, creator: "Jan S. Krogh", evidenceKind: "explicit-photo-credit", fragments: ["Photo Foto Nuotrauka: Jan S. Krogh."] },
  { entityId: "poi-26824c4549fcc7e4", qid: "Q171857", file: "AgraFort.jpg", revisionId: 1051640010, creator: "Michael L. Kaufman", evidenceKind: "named-license-holder", fragments: ["GFDL-user-en-note|Michael L. Kaufman"] },
  { entityId: "poi-3c665a2866fc927e", qid: "Q622225", file: "GD-EG-Alex-Stade002.JPG", revisionId: 1264494115, creator: "Gérard Ducher", evidenceKind: "explicit-personal-picture-credit", fragments: ["Personal picture of Gérard Ducher"] },
  { entityId: "poi-5e1ec61554ca98d4", qid: "Q2005868", file: "Antwerpen Stadhuis crop1 2006-05-28.jpg", revisionId: 1038797310, creator: "Klaus with K", evidenceKind: "self-owned-photos-and-named-author", fragments: ["Image based on two own photos", "Author assumed|[[User:Klaus with K|Klaus with K]]", "{{self|GFDL|Cc-by-sa-3.0-migrated"] },
]);

const WITHDRAWALS = new Map([
  ["city-7b557b748910ebe8", "Commons records only an attribution-required license and an uploader; no explicit photographer/creator is available for Nitra."],
  ["poi-988e10280ee01879", "Commons explicitly records an unknown photographer for Ampel Mosque; the institution attribution cannot substitute for the required creator."],
]);

async function fetchJson(url, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    const body = await response.text();
    if (response.ok && body.trim().startsWith("{")) return JSON.parse(body);
    if (attempt === attempts - 1) throw new Error(`canonical-source-fetch-failed:${response.status}:${body.slice(0, 120)}`);
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error("canonical-source-fetch-exhausted");
}

async function loadCreatorEvidence() {
  const revisionIds = CREATOR_REPAIRS.map((record) => record.revisionId);
  const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
  endpoint.search = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    revids: revisionIds.join("|"),
    prop: "revisions",
    rvslots: "main",
    rvprop: "ids|timestamp|user|content",
  });
  const payload = await fetchJson(endpoint);
  const revisions = new Map(Object.values(payload.query?.pages || {}).flatMap((page) => page.revisions || []).map((revision) => [revision.revid, revision]));

  const metadataRepair = CREATOR_REPAIRS.find((record) => record.metadata);
  const metadataEndpoint = new URL("https://commons.wikimedia.org/w/api.php");
  metadataEndpoint.search = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    titles: `File:${metadataRepair.file}`,
    prop: "imageinfo",
    iiprop: "metadata",
  });
  const metadataPayload = await fetchJson(metadataEndpoint);
  const metadata = Object.values(metadataPayload.query?.pages || {})[0]?.imageinfo?.[0]?.metadata || [];
  const metadataMap = new Map(metadata.map((record) => [clean(record.name), clean(record.value)]));

  return new Map(CREATOR_REPAIRS.map((repair) => {
    const revision = revisions.get(repair.revisionId);
    assert(revision, `canonical-revision-missing:${repair.entityId}:${repair.revisionId}`);
    const source = revision.slots?.main?.["*"] || "";
    for (const fragment of repair.fragments) assert(source.includes(fragment), `canonical-evidence-fragment-missing:${repair.entityId}:${fragment}`);
    if (repair.revisionUser) assert.equal(revision.user, repair.revisionUser, `canonical-evidence-user-mismatch:${repair.entityId}`);
    if (repair.metadata) assert.equal(metadataMap.get(repair.metadata.name), repair.metadata.value, `canonical-metadata-mismatch:${repair.entityId}`);
    return [repair.entityId, {
      ...repair,
      revisionTimestamp: revision.timestamp,
      canonicalEvidenceUrl: repair.metadata
        ? `https://commons.wikimedia.org/wiki/File:${repair.file.replaceAll(" ", "_")}#Metadata`
        : revisionUrl(`https://commons.wikimedia.org/wiki/File:${repair.file.replaceAll(" ", "_")}`, repair.revisionId),
    }];
  }));
}

function rawMissingCounts(records) {
  const missingLicenseUrl = records.filter((record) => !meaningfulText(record.licenseUrl));
  const missingCreator = records.filter((record) => !meaningfulText(record.creator || record.author));
  const missingAttribution = records.filter((record) => !meaningfulText(record.attribution));
  const union = new Set([...missingLicenseUrl, ...missingCreator, ...missingAttribution].map((record) => record.entityId));
  return { licenseUrl: missingLicenseUrl.length, creatorOrAuthor: missingCreator.length, attribution: missingAttribution.length, union: union.size };
}

function mutationFixtureResult() {
  const valid = {
    entityId: "city-fixture", wikidataId: "Q1", entityType: "City",
    assetPath: "assets/route-v2-images/cities/city-q1.webp",
    localAssetPath: "assets/route-v2-images/cities/city-q1.webp",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Fixture.jpg", sourcePlatform: "Wikimedia Commons",
    creator: "Fixture Creator", author: "Fixture Creator", attribution: "Fixture Creator — CC BY 4.0",
    license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceHash: "a".repeat(64), processedHash: "b".repeat(64), acquisitionDate: "2026-08-26",
    originalFilename: "Fixture.jpg", verificationStatus: "verified", usageStatus: "approved-local-runtime",
    status: "imageReady", visualAuditStatus: "passed",
    rights: { sourceUrl: "https://commons.wikimedia.org/wiki/File:Fixture.jpg", author: "Fixture Creator", attribution: "Fixture Creator — CC BY 4.0", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", externalCopyrightMaterial: true },
  };
  const mutate = [
    (record) => { delete record.licenseUrl; },
    (record) => { record.licenseUrl = ""; },
    (record) => { record.creator = null; record.author = null; },
    (record) => { record.creator = "unknown"; record.author = "unknown"; },
    (record) => { record.attribution = null; record.rights.attribution = null; },
    (record) => { record.licenseUrl = "https://creativecommons.org/licenses/by/3.0/"; record.rights.licenseUrl = record.licenseUrl; },
    (record) => { record.licenseUrl = record.sourceUrl; record.rights.licenseUrl = record.sourceUrl; },
    (record) => { record.sourceUrl = ""; record.rights.sourceUrl = ""; },
    (record) => { record.processedHash = null; },
    (record) => { record.verificationStatus = " "; },
  ];
  const killed = mutate.filter((mutation) => {
    const record = structuredClone(valid);
    mutation(record);
    return !auditImageProvenance(record).valid;
  }).length;
  return { total: mutate.length, killed };
}

function afterSummary(records) {
  const audit = auditProvenanceCollection(records);
  return {
    verifiedDedicated: audit.total,
    provenanceComplete: audit.valid,
    licenseComplete: audit.valid,
    licenseUrlComplete: audit.licenseUrlComplete,
    attributionRequired: audit.attributionRequired,
    creatorCompleteWhereRequired: audit.creatorCompleteWhereRequired,
    attributionCompleteWhereRequired: audit.attributionCompleteWhereRequired,
    completenessPercent: audit.total ? Number((audit.valid / audit.total * 100).toFixed(2)) : 100,
  };
}

const provenance = readJson(PROVENANCE_PATH);
if (CHECK) {
  const auditArtifact = readJson(AUDIT_PATH);
  const audit = auditProvenanceCollection(provenance.assets);
  assert.equal(audit.invalid.length, 0, JSON.stringify(audit.invalid.slice(0, 10), null, 2));
  assert.deepEqual(afterSummary(provenance.assets), auditArtifact.after);
  console.log(JSON.stringify({ mode: "check", status: "PASS", ...auditArtifact.after, withdrawn: provenance.withdrawnAssets?.length || 0 }, null, 2));
  process.exit(0);
}

const canonicalEvidence = await loadCreatorEvidence();
const before = {
  verifiedDedicated: provenance.assets.length,
  rawMissing: rawMissingCounts(provenance.assets),
  strict: afterSummary(provenance.assets),
};
const repairs = [];
const withdrawn = [];
const active = [];

for (const original of provenance.assets) {
  const record = structuredClone(original);
  const expectedLicenseUrl = canonicalLicenseUrl(record.license, record.sourceUrl);
  assert(expectedLicenseUrl, `unsupported-license:${record.entityId}:${record.license}`);
  if (record.licenseUrl !== expectedLicenseUrl) repairs.push({ entityId: record.entityId, type: meaningfulText(record.licenseUrl) ? "license-url-normalized" : "license-url-filled", before: record.licenseUrl || null, after: expectedLicenseUrl, canonicalSource: record.sourceUrl });
  record.licenseUrl = expectedLicenseUrl;
  record.rights = { ...record.rights, sourceUrl: record.sourceUrl, license: record.license, licenseUrl: expectedLicenseUrl, externalCopyrightMaterial: true };

  const requiresAttribution = attributionRequiredForLicense(record.license);
  if (requiresAttribution && !meaningfulCreator(record.creator || record.author)) {
    const reason = WITHDRAWALS.get(record.entityId);
    if (reason) {
      withdrawn.push({ ...record, status: "withdrawn", needsBackfill: true, withdrawalReason: "LICENSE_METADATA_INCOMPLETE", withdrawalDetail: reason, withdrawnAt: REPAIRED_AT, originalVerificationStatus: record.verificationStatus });
      continue;
    }
    const evidence = canonicalEvidence.get(record.entityId);
    assert(evidence, `verified-creator-repair-missing:${record.entityId}`);
    assert.equal(record.wikidataId, evidence.qid);
    assert.equal(record.commonsFileTitle, evidence.file);
    record.creator = evidence.creator;
    record.author = evidence.creator;
    record.attribution = `${evidence.creator} — ${record.license}`;
    record.creatorMetadataSource = {
      evidenceKind: evidence.evidenceKind,
      canonicalEvidenceUrl: evidence.canonicalEvidenceUrl,
      sourceRevisionId: evidence.revisionId,
      sourceRevisionTimestamp: evidence.revisionTimestamp,
      ...(evidence.derivativeContributor ? { derivativeContributor: evidence.derivativeContributor } : {}),
    };
    delete record.creatorStatus;
    delete record.attributionStatus;
    repairs.push({ entityId: record.entityId, type: "creator-and-attribution-repaired", creator: record.creator, attribution: record.attribution, ...record.creatorMetadataSource });
  } else if (requiresAttribution && !meaningfulText(record.attribution)) {
    record.attribution = `${record.creator || record.author} — ${record.license}`;
    repairs.push({ entityId: record.entityId, type: "attribution-generated-from-source-backed-creator-and-license", attribution: record.attribution, canonicalSource: record.sourceUrl });
  } else if (!requiresAttribution && !meaningfulCreator(record.creator || record.author)) {
    repairs.push({ entityId: record.entityId, type: "non-attribution-creator-status-recorded", previousCreator: record.creator || record.author || null, canonicalSource: record.sourceUrl });
    record.creator = null;
    record.author = null;
    record.creatorStatus = "not-provided-by-source";
    record.attribution = null;
    record.attributionStatus = "not-required-for-license";
  }

  if (requiresAttribution) {
    record.rights.author = record.creator || record.author;
    record.rights.attribution = record.attribution;
    delete record.rights.creatorStatus;
    delete record.rights.attributionStatus;
  } else if (!meaningfulCreator(record.creator || record.author)) {
    record.rights.author = null;
    record.rights.attribution = null;
    record.rights.creatorStatus = "not-provided-by-source";
    record.rights.attributionStatus = "not-required-for-license";
  }
  record.provenanceRepairStatus = "strict-completeness-verified";
  record.provenanceRepairedAt = REPAIRED_AT;
  active.push(record);
}

const finalAudit = auditProvenanceCollection(active);
assert.equal(finalAudit.invalid.length, 0, JSON.stringify(finalAudit.invalid.slice(0, 20), null, 2));
const mutationFixtures = mutationFixtureResult();
assert.equal(mutationFixtures.killed, mutationFixtures.total);

const withdrawnIds = new Set(withdrawn.map((record) => record.entityId));
const attempts = provenance.attempts.map((attempt) => withdrawnIds.has(attempt.entityId) ? {
  ...attempt,
  status: "needsBackfill",
  reasonCode: "LICENSE_METADATA_INCOMPLETE",
  reasonDetail: WITHDRAWALS.get(attempt.entityId),
  provenanceWithdrawalAt: REPAIRED_AT,
} : attempt);

const nextProvenance = {
  ...provenance,
  repairedAt: REPAIRED_AT,
  assetCount: active.length,
  cityAssetCount: active.filter((record) => record.entityType === "City").length,
  poiAssetCount: active.filter((record) => record.entityType === "POI").length,
  assets: active,
  attempts,
  withdrawnAssets: [...(provenance.withdrawnAssets || []).filter((record) => !withdrawnIds.has(record.entityId)), ...withdrawn],
};
const auditArtifact = {
  schemaVersion: "route-v2-image-debt-provenance-completeness-v1",
  auditedAt: REPAIRED_AT,
  policy: {
    required: ["entityId", "wikidataId", "entityType", "assetPath", "localAssetPath", "sourceUrl", "sourcePlatform", "license", "licenseUrl", "sourceHash", "processedHash", "acquisitionDate", "originalFilename", "verificationStatus", "usageStatus", "rights"],
    canonicalSourceField: "sourceUrl",
    conditionallyRequired: { attributionLicenses: ["creator", "attribution"], nonAttributionMissingCreator: ["creatorStatus=not-provided-by-source"] },
    optional: ["description", "objectName", "derivativeContributor"],
    placeholderValuesRejected: ["unknown", "anonymous", "n/a", "none", "todo", "tbd", "-", "Wikimedia Commons as creator", "Wikipedia as creator", "assumed machine-readable author"],
  },
  before,
  repair: {
    metadataChanges: repairs.length,
    creatorRepairs: repairs.filter((record) => record.type === "creator-and-attribution-repaired").length,
    attributionRepairs: repairs.filter((record) => record.type.includes("attribution")).length,
    licenseUrlFilled: repairs.filter((record) => record.type === "license-url-filled").length,
    licenseUrlNormalized: repairs.filter((record) => record.type === "license-url-normalized").length,
    nonAttributionCreatorStatuses: repairs.filter((record) => record.type === "non-attribution-creator-status-recorded").length,
    alternateImageReplacements: 0,
    withdrawn: withdrawn.length,
    repairs,
    withdrawals: withdrawn.map((record) => ({ entityId: record.entityId, wikidataId: record.wikidataId, canonicalNameEn: record.canonicalNameEn, entityType: record.entityType, assetPath: record.assetPath, reason: record.withdrawalReason, detail: record.withdrawalDetail })),
  },
  after: afterSummary(active),
  mutationFixtures,
};

writeJson(PROVENANCE_PATH, nextProvenance);
writeJson(AUDIT_PATH, auditArtifact);
for (const record of withdrawn) {
  const assetPath = path.resolve(ROOT, record.assetPath);
  const allowedRoot = path.resolve(ROOT, "assets/route-v2-images");
  assert(assetPath.startsWith(`${allowedRoot}${path.sep}`), `unsafe-withdrawal-path:${record.assetPath}`);
  if (fs.existsSync(assetPath)) fs.unlinkSync(assetPath);
}

console.log(JSON.stringify({ mode: "write", status: "PASS", before, repair: { creatorRepairs: auditArtifact.repair.creatorRepairs, licenseUrlFilled: auditArtifact.repair.licenseUrlFilled, licenseUrlNormalized: auditArtifact.repair.licenseUrlNormalized, nonAttributionCreatorStatuses: auditArtifact.repair.nonAttributionCreatorStatuses, withdrawn: withdrawn.length }, after: auditArtifact.after }, null, 2));
