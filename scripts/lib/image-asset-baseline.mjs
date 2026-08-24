import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createPublishedKnowledgeEntityLayerRepository } from "../../src/lib/routes/index.mjs";

export const IMAGE_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".bmp", ".ico"]);
export const BASELINE_SCHEMA_VERSION = "route-v2-image-asset-baseline-v2";
export const INVENTORY_PATH = "data/route-v2/images/image-asset-baseline.json";
export const REPORT_PATH = "ROUTE_V2_IMAGE_ASSET_BASELINE_REPORT.md";
export const FORMAL_MANIFEST_PATH = "data/route-v2/images/image-coverage-manifest.json";
export const IMAGE_SIZE_AUDIT_THRESHOLD_BYTES = 300_000;
export const NORMAL_GIT_DEFAULT_FAIL_THRESHOLD_BYTES = 500_000;
export const NORMAL_GIT_HARD_LIMIT_BYTES = 5_000_000;
export const IMAGE_ASSET_BASELINE_SOURCE_HEAD = "8f63d1f814df050c577a0c0bc6286ccb74618f65";

const GENERATED_REFERENCE_EXCLUSIONS = new Set([
  INVENTORY_PATH,
  REPORT_PATH,
  "docs/superpowers/plans/2026-08-14-route-v2-image-asset-baseline.md",
]);
const TEXT_EXTENSIONS = new Set([".css", ".cjs", ".html", ".js", ".json", ".jsonl", ".md", ".mjs", ".txt", ".xml"]);
const DESTINATION_LEGACY_PATTERN = /^assets\/(?:atlas-|city-|country-(?:landmark-)?|detail-(?:city-|route-|japan)|favorite-(?:city-|route-|[a-z].*-cover)|home-(?:aurora|japan)-cover|route-(?:city-|country-|detail-|.*cover)|trip-)/u;
const UI_PATTERN = /^assets\/(?:achievement-crops\/|footprint-|home-(?:bear|map|mascot)|profile-)/u;
const SAFE_PLACEHOLDERS = new Set([
  "assets/route-city-placeholder.svg",
  "assets/trip-cover-placeholder.svg",
  "assets/home-mascot-placeholder.svg",
]);
export const NORMAL_GIT_SIZE_EXCEPTIONS = Object.freeze([
  Object.freeze({
    id: "historical-home-map-p2",
    path: "assets/home-map-p2.png",
    expectedSha256: "b63667f43faf98619407229dc14e1a384eb114a02ca8aaa8363272ad4a8e474e",
    expectedBytes: 2_052_937,
    maximumApprovedBytes: 2_052_937,
    reason: "Pre-existing production home-map UI asset retained by the Image Asset Baseline phase.",
    assetCategory: "ui-decorative",
    approvalStatus: "baseline-approved",
    baselineStatus: "historical-production-exception",
  }),
  ...Object.freeze([
    ["historical-atlas-iceland", "assets/atlas-iceland-cover.svg", "d35d3ce442ff55a385b620d3f832a45451d16a4d45a7ce8e7af034dc9094bbe9", 573_603],
    ["historical-country-uzbekistan", "assets/country-uzbekistan-cover.svg", "f7d394d8669697ce56502391ba9393370fb1e7392b5675faa7c5ca31f3143caa", 643_159],
    ["historical-favorite-city-paris", "assets/favorite-city-paris.svg", "58042212d70f01947f5260ad1652794a3141fee0acbe49a99ced2870449eabb5", 573_608],
    ["historical-favorite-city-reykjavik", "assets/favorite-city-reykjavik.svg", "c2cb912d70bb8228f58f4798339d4c1e5c8964708c1e3519e3ea0c46b84438e7", 573_617],
    ["historical-favorite-iceland", "assets/favorite-iceland-cover.svg", "d35d3ce442ff55a385b620d3f832a45451d16a4d45a7ce8e7af034dc9094bbe9", 573_603],
    ["historical-favorite-route-canada", "assets/favorite-route-canada.svg", "0aa280c3de78cac0a83f2a5dae62e85c3a3f2790a9209bd39c2d691d0824ef91", 573_612],
    ["historical-favorite-route-central-asia", "assets/favorite-route-central-asia.svg", "443ce398302651fa29db5525d45160dc5c18f967f3a9bfe145483e4ca1612df3", 573_609],
    ["historical-route-central-asia", "assets/route-central-asia-cover.svg", "443ce398302651fa29db5525d45160dc5c18f967f3a9bfe145483e4ca1612df3", 573_609],
  ]).map(([id, exceptionPath, expectedSha256, expectedBytes]) => Object.freeze({
    id,
    path: exceptionPath,
    expectedSha256,
    expectedBytes,
    maximumApprovedBytes: expectedBytes,
    reason: "Pre-existing non-product legacy audit asset retained for historical review evidence; not approved as a new product image.",
    assetCategory: "legacy-unused",
    approvalStatus: "baseline-approved",
    baselineStatus: "historical-audit-exception",
  })),
]);

function cleanPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "")
    .replace(/^\//u, "")
    .replace(/^travel-collection\//u, "")
    .replace(/[?#].*$/u, "");
}

export function validateNormalGitSizeException(exception) {
  const errors = [];
  if (!/^[a-z0-9][a-z0-9-]+$/u.test(String(exception?.id || ""))) errors.push("stable-id-required");
  if (!String(exception?.path || "").startsWith("assets/")) errors.push("exact-asset-path-required");
  if (!/^[a-f0-9]{64}$/u.test(String(exception?.expectedSha256 || ""))) errors.push("expected-sha256-required");
  if (!Number.isInteger(exception?.expectedBytes) || exception.expectedBytes <= NORMAL_GIT_DEFAULT_FAIL_THRESHOLD_BYTES) errors.push("expected-bytes-required");
  if (!Number.isInteger(exception?.maximumApprovedBytes) || exception.maximumApprovedBytes < exception.expectedBytes) errors.push("maximum-approved-bytes-required");
  if (String(exception?.reason || "").trim().length < 20) errors.push("meaningful-reason-required");
  if (!String(exception?.assetCategory || "").trim()) errors.push("asset-category-required");
  if (exception?.approvalStatus !== "baseline-approved") errors.push("baseline-approval-required");
  if (!String(exception?.baselineStatus || "").trim()) errors.push("baseline-status-required");
  return errors;
}

export function evaluateNormalGitImageSizePolicy(asset, { exceptions = NORMAL_GIT_SIZE_EXCEPTIONS } = {}) {
  const normalized = {
    path: cleanPath(asset?.path),
    bytes: Number(asset?.bytes || 0),
    sha256: String(asset?.sha256 || "").toLowerCase(),
    category: String(asset?.category || ""),
    isGitLfs: Boolean(asset?.isGitLfs),
  };
  const auditRequired = normalized.bytes > IMAGE_SIZE_AUDIT_THRESHOLD_BYTES;
  if (normalized.isGitLfs) return { ...normalized, allowed: true, auditRequired, exceptionMatch: false, decision: "git-lfs" };
  if (normalized.bytes > NORMAL_GIT_HARD_LIMIT_BYTES) {
    return { ...normalized, allowed: false, auditRequired: true, exceptionMatch: false, decision: "hard-reject-over-5mb" };
  }
  const pathException = exceptions.find((entry) => cleanPath(entry.path) === normalized.path) || null;
  const exceptionMatch = Boolean(pathException
    && validateNormalGitSizeException(pathException).length === 0
    && pathException.expectedSha256 === normalized.sha256
    && pathException.expectedBytes === normalized.bytes
    && normalized.bytes <= pathException.maximumApprovedBytes
    && pathException.assetCategory === normalized.category);
  if (normalized.bytes > NORMAL_GIT_DEFAULT_FAIL_THRESHOLD_BYTES) {
    if (exceptionMatch) {
      return { ...normalized, allowed: true, auditRequired: true, exceptionMatch: true, exceptionId: pathException.id, decision: "exact-size-exception" };
    }
    return { ...normalized, allowed: false, auditRequired: true, exceptionMatch: false, decision: "reject-unapproved-over-500kb" };
  }
  if (auditRequired) return { ...normalized, allowed: true, auditRequired: true, exceptionMatch: false, decision: "audit-pass" };
  return { ...normalized, allowed: true, auditRequired: false, exceptionMatch: false, decision: "within-target" };
}

function run(command, args, { root, input = undefined, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    input,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowFailure && (result.status !== 0 || result.error)) {
    throw new Error(`${command} ${args.join(" ")} failed: ${String(result.stderr || result.error?.message || "unknown error").trim()}`);
  }
  return result;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function stableUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function parseSvgDimensions(source) {
  const svgTag = source.match(/<svg\b[^>]*>/iu)?.[0] || "";
  const number = (name) => {
    const match = svgTag.match(new RegExp(`\\b${name}=["']([0-9]+(?:\\.[0-9]+)?)`, "iu"));
    return match ? Number(match[1]) : null;
  };
  const width = number("width");
  const height = number("height");
  if (width && height) return { width, height };
  const viewBox = svgTag.match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/iu);
  return { width: viewBox ? Number(viewBox[1]) : null, height: viewBox ? Number(viewBox[2]) : null };
}

function extractEmbeddedRaster(source) {
  const match = source.match(/<image\b[^>]*(?:href|xlink:href)=["']data:image\/(png|jpe?g|webp|gif);base64,([^"']+)["']/iu);
  if (!match) return null;
  return { extension: match[1].replace("jpeg", "jpg"), buffer: Buffer.from(match[2].replace(/\s+/gu, ""), "base64") };
}

function normalizedSvgVisualHash(source) {
  return sha256(Buffer.from(source
    .replace(/aria-label=["'][^"']*["']/giu, "aria-label=\"ENTITY\"")
    .replace(/<text\b[^>]*>[\s\S]*?<\/text>/giu, "<text>ENTITY</text>")
    .replace(/hsl\([^)]*\)/giu, "hsl(COLOR)")
    .replace(/#[0-9a-f]{3,8}/giu, "#COLOR")
    .replace(/\s+/gu, " ")
    .trim()));
}

function inspectRasterEntries({ root, entries }) {
  if (!entries.length) return new Map();
  const helper = path.join(root, "scripts/lib/perceptual-image-hash.py");
  let result = run(process.env.PYTHON || "python", [helper], { root, input: JSON.stringify(entries), allowFailure: true });
  if (result.status !== 0 || result.error) result = run("python3", [helper], { root, input: JSON.stringify(entries) });
  const parsed = JSON.parse(result.stdout || "[]");
  return new Map(parsed.map((entry) => [entry.key, entry]));
}

function trackedFileSets(root) {
  const tracked = run("git", ["ls-files", "-z"], { root }).stdout.split("\0").filter(Boolean).map(cleanPath);
  const untracked = run("git", ["ls-files", "-z", "--others", "--exclude-standard"], { root }).stdout.split("\0").filter(Boolean).map(cleanPath);
  return { tracked: new Set(tracked), all: stableUnique([...tracked, ...untracked]) };
}

function gitAttributes({ root, paths }) {
  const result = run("git", ["check-attr", "filter", "--stdin"], { root, input: `${paths.join("\n")}\n` });
  return new Map(result.stdout.split(/\r?\n/u).filter(Boolean).map((line) => {
    const match = line.match(/^(.*?):\s+filter:\s+(.*)$/u);
    return match ? [cleanPath(match[1]), match[2] === "lfs"] : [cleanPath(line), false];
  }));
}

function lfsInventory(root) {
  const result = run("git", ["lfs", "ls-files", "--long"], { root });
  const records = [];
  for (const line of result.stdout.split(/\r?\n/u).filter(Boolean)) {
    const match = line.match(/^([0-9a-f]{64})\s+[\*-]\s+(.+)$/u);
    if (!match) continue;
    const filePath = cleanPath(match[2]);
    const stagedPointer = run("git", ["show", `:${filePath}`], { root, allowFailure: true });
    const pointer = stagedPointer.status === 0
      ? stagedPointer.stdout
      : run("git", ["show", `HEAD:${filePath}`], { root, allowFailure: true }).stdout;
    const size = Number(pointer.match(/^size\s+(\d+)$/mu)?.[1] || 0);
    records.push({ path: filePath, oid: match[1], bytes: size, pointerValid: /^version https:\/\/git-lfs\.github\.com\/spec\/v1$/mu.test(pointer) && size > 0 });
  }
  return records.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

function referenceKind(sourcePath) {
  if (/^scripts\/verify-/u.test(sourcePath)) return "test";
  if (/^data\/knowledge\/(?:raw|reports|batches)\//u.test(sourcePath)) return "audit";
  if (/^data\/route-v2\/images\/batch\d{2}-dedicated-image-provenance\.json$/u.test(sourcePath)) return "audit";
  if (/^(?:docs\/|ROUTE_V2_.*\.md$)/u.test(sourcePath) || sourcePath.endsWith(".md")) return "audit";
  if (/^scripts\//u.test(sourcePath)) return "build";
  if (sourcePath === FORMAL_MANIFEST_PATH || sourcePath === "route-v2-image-coverage.js") return "manifest";
  if (sourcePath === "route-feed-bootstrap.js") return "embedded-bootstrap-provenance";
  if ([
    "server.js",
    "server-security.js",
    "src/lib/routes/online-standardizer.mjs",
    "src/lib/routes/repository-warmup-runner.mjs",
    "src/lib/routes/search-generated-media.mjs",
    "src/lib/routes/wikimedia-image-provider.mjs",
  ].includes(sourcePath)) return "dormant-network-provider";
  return "production";
}

function collectReferences({ root, allFiles, imagePathSet }) {
  const references = new Map([...imagePathSet].map((imagePath) => [imagePath, []]));
  const missing = [];
  const external = [];
  const localPattern = /(?:(?:\.\.\/|\.\/|\/)?(?:assets|data)[/\\][A-Za-z0-9_@.,%+()\- /\\]+\.(?:svg|png|jpe?g|webp|avif|gif|bmp|ico))(?:[?#][^"'`\s)]*)?/giu;
  const externalPattern = /https?:\/\/[^\s"'`)<]+/giu;
  for (const sourcePath of allFiles) {
    if (GENERATED_REFERENCE_EXCLUSIONS.has(sourcePath) || imagePathSet.has(sourcePath)) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(sourcePath).toLocaleLowerCase("en-US"))) continue;
    const absolutePath = path.join(root, sourcePath);
    let source;
    try {
      const stat = fs.statSync(absolutePath);
      if (!stat.isFile() || stat.size > 16 * 1024 * 1024) continue;
      source = fs.readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    const kind = referenceKind(sourcePath);
    for (const match of source.matchAll(localPattern)) {
      if (/[${}]/u.test(match[0])) continue;
      const assetPath = cleanPath(match[0]);
      const line = source.slice(0, match.index).split(/\r?\n/u).length;
      const reference = { sourcePath, line, kind };
      if (references.has(assetPath)) references.get(assetPath).push(reference);
      else if (!assetPath.includes("<")) missing.push({ assetPath, ...reference });
    }
    for (const match of source.matchAll(externalPattern)) {
      const url = match[0].replace(/[.,;]+$/u, "");
      if (!/(?:image|photo|thumbnail|avatar|cover|unsplash|wikimedia|gravatar|\.png|\.jpe?g|\.webp|\.gif|\.svg)/iu.test(url)) continue;
      const line = source.slice(0, match.index).split(/\r?\n/u).length;
      external.push({ url, sourcePath, line, kind });
    }
  }
  for (const values of references.values()) values.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en") || left.line - right.line);
  return {
    references,
    missing: missing.sort((left, right) => left.assetPath.localeCompare(right.assetPath, "en") || left.sourcePath.localeCompare(right.sourcePath, "en")),
    external: external.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en") || left.line - right.line),
  };
}

function hammingDistance(left, right) {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

function duplicateGroups(assets) {
  const exact = new Map();
  for (const asset of assets) {
    if (!exact.has(asset.sha256)) exact.set(asset.sha256, []);
    exact.get(asset.sha256).push(asset.path);
  }
  const exactGroups = [...exact.entries()].filter(([, paths]) => paths.length > 1).map(([hash, paths]) => ({ hash, paths, duplicateBytes: assets.find((asset) => asset.sha256 === hash).bytes * (paths.length - 1) }));

  const perceptualAssets = assets.filter((asset) => asset.perceptualHash?.dhash64);
  const parents = perceptualAssets.map((_, index) => index);
  const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const union = (left, right) => { const a = find(left); const b = find(right); if (a !== b) parents[b] = a; };
  for (let left = 0; left < perceptualAssets.length; left += 1) {
    for (let right = left + 1; right < perceptualAssets.length; right += 1) {
      if (hammingDistance(perceptualAssets[left].perceptualHash.dhash64, perceptualAssets[right].perceptualHash.dhash64) <= 5) union(left, right);
    }
  }
  const groups = new Map();
  for (let index = 0; index < perceptualAssets.length; index += 1) {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(perceptualAssets[index]);
  }
  const perceptualGroups = [...groups.values()].filter((group) => group.length > 1).map((group) => ({
    paths: group.map((asset) => asset.path).sort((left, right) => left.localeCompare(right, "en")),
    entities: stableUnique(group.flatMap((asset) => asset.entityIds)),
    productionConsumed: group.some((asset) => asset.productionConsumed),
    maximumPairDistance: Math.max(...group.flatMap((left) => group.map((right) => hammingDistance(left.perceptualHash.dhash64, right.perceptualHash.dhash64)))),
  })).sort((left, right) => right.paths.length - left.paths.length || left.paths[0].localeCompare(right.paths[0], "en"));
  return {
    exactGroups: exactGroups.sort((left, right) => right.duplicateBytes - left.duplicateBytes || left.paths[0].localeCompare(right.paths[0], "en")),
    exactDuplicateBytes: exactGroups.reduce((sum, group) => sum + group.duplicateBytes, 0),
    perceptualGroups,
  };
}

function categoryFor({ imagePath, formalRecords, references }) {
  if (formalRecords.some((record) => record.entityType === "Country")) return "country-cover";
  if (formalRecords.some((record) => record.entityType === "City" && record.isDedicated)) return "dedicated-city";
  if (formalRecords.some((record) => record.entityType === "POI" && record.isDedicated)) return "dedicated-poi";
  if (SAFE_PLACEHOLDERS.has(imagePath)) return "neutral-placeholder";
  if (imagePath.startsWith("assets/ref/")) return "audit-source";
  if (UI_PATTERN.test(imagePath)) return "ui-decorative";
  if (DESTINATION_LEGACY_PATTERN.test(imagePath)) return references.some((reference) => reference.kind === "production") ? "route-generic-travel-ui" : "legacy-unused";
  return "unknown";
}

function provenanceFor({ category, hasEmbeddedRaster, extension, formalRecords }) {
  if (formalRecords.length) {
    const rights = formalRecords.find((record) => record.rights)?.rights;
    return rights?.sourceType === "project-generated-vector" ? "verified-project-generated" : "manifest-declared";
  }
  if (category === "neutral-placeholder") return "verified-project-neutral";
  if (category === "audit-source") return "audit-source-only";
  if (category === "ui-decorative") return "project-ui-asset";
  if (hasEmbeddedRaster || [".jpg", ".jpeg"].includes(extension)) return "unverified-legacy-raster";
  if (category === "route-generic-travel-ui" || category === "legacy-unused") return "unverified-legacy-asset";
  return "unknown";
}

function lifecycleFor({ category, references, formalRecords, provenanceStatus }) {
  if (formalRecords.length || references.some((reference) => ["production", "manifest"].includes(reference.kind))) return "ACTIVE";
  if (category === "audit-source" || references.some((reference) => reference.kind === "audit")) return "KEEP FOR AUDIT";
  if (references.some((reference) => ["test", "build"].includes(reference.kind))) return "KEEP FOR COMPATIBILITY";
  if (category === "legacy-unused" && provenanceStatus.startsWith("unverified-legacy")) return "SAFE TO DELETE";
  if (category === "unknown") return "UNKNOWN";
  return "KEEP FOR COMPATIBILITY";
}

function formalRecordIndex(manifest) {
  const index = new Map();
  const append = (record, entityType) => {
    const assetPath = cleanPath(record.assetPath);
    if (!index.has(assetPath)) index.set(assetPath, []);
    index.get(assetPath).push({
      entityId: record.entityId,
      qid: record.wikidataId,
      entityType,
      status: record.status,
      isDedicated: record.status === "imageReady" && ["City", "POI"].includes(entityType),
      isPlaceholder: record.status === "placeholder",
      needsBackfill: Boolean(record.needsBackfill),
      countryCode: record.countryCode,
      parentCityEntityId: record.parentCityEntityId || null,
      rights: record.rights || null,
    });
  };
  for (const record of manifest.countries || []) append(record, "Country");
  for (const record of manifest.cities || []) append(record, "City");
  for (const record of manifest.pois || []) append(record, "POI");
  return index;
}

function verifyBackfill({ manifest, repository }) {
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const pois = repository.listPois();
  const countryById = new Map(countries.map((record) => [record.entityId, record]));
  const cityById = new Map(cities.map((record) => [record.entityId, record]));
  const poiById = new Map(pois.map((record) => [record.entityId, record]));
  const problems = [];
  const debts = [];
  for (const record of manifest.cities || []) {
    const entity = cityById.get(record.entityId);
    const country = entity ? countryById.get(entity.parentCountryEntityId) : null;
    if (!entity || entity.wikidataId !== record.wikidataId || country?.isoAlpha2 !== record.countryCode) problems.push({ entityId: record.entityId, reason: "city-entity-qid-or-parent-mismatch" });
    if (record.status === "placeholder") {
      if (!record.needsBackfill || record.assetPath !== manifest.fallbackPolicy.city || record.isDedicated) problems.push({ entityId: record.entityId, reason: "city-debt-placeholder-mismatch" });
      debts.push({ entityId: record.entityId, qid: record.wikidataId, entityType: "City", countryCode: record.countryCode, parentCityEntityId: null, priority: record.backfillPriority });
    } else if (record.status !== "imageReady" || record.needsBackfill || record.assetKind !== "verified-destination-image" || record.semanticScope !== "exact-city") {
      problems.push({ entityId: record.entityId, reason: "city-dedicated-image-mismatch" });
    }
  }
  for (const record of manifest.pois || []) {
    const entity = poiById.get(record.entityId);
    const city = entity ? cityById.get(entity.parentCityEntityId) : null;
    const country = city ? countryById.get(city.parentCountryEntityId) : null;
    if (!entity || entity.wikidataId !== record.wikidataId || city?.entityId !== record.parentCityEntityId || country?.isoAlpha2 !== record.countryCode) problems.push({ entityId: record.entityId, reason: "poi-entity-qid-or-parent-mismatch" });
    if (record.status === "placeholder") {
      if (!record.needsBackfill || record.assetPath !== manifest.fallbackPolicy.poi || record.isDedicated) problems.push({ entityId: record.entityId, reason: "poi-debt-placeholder-mismatch" });
      debts.push({ entityId: record.entityId, qid: record.wikidataId, entityType: "POI", countryCode: record.countryCode, parentCityEntityId: record.parentCityEntityId, priority: record.backfillPriority });
    } else if (record.status !== "imageReady" || record.needsBackfill || record.assetKind !== "verified-destination-image" || record.semanticScope !== "exact-poi") {
      problems.push({ entityId: record.entityId, reason: "poi-dedicated-image-mismatch" });
    }
  }
  const byCountry = [...new Set(debts.map((record) => record.countryCode))].sort().map((countryCode) => ({
    countryCode,
    cities: debts.filter((record) => record.countryCode === countryCode && record.entityType === "City").length,
    pois: debts.filter((record) => record.countryCode === countryCode && record.entityType === "POI").length,
    total: debts.filter((record) => record.countryCode === countryCode).length,
  }));
  return {
    total: debts.length,
    cities: debts.filter((record) => record.entityType === "City").length,
    pois: debts.filter((record) => record.entityType === "POI").length,
    byCountry,
    problems,
  };
}

export function collectTrackedImagePaths({ root }) {
  const sets = trackedFileSets(root);
  return sets.all.filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase("en-US")) && fs.existsSync(path.join(root, filePath)));
}

export function collectImageReferences({ root, imagePaths }) {
  const sets = trackedFileSets(root);
  return collectReferences({ root, allFiles: sets.all, imagePathSet: new Set(imagePaths) });
}

export function buildImageAssetBaseline({ root }) {
  const projectRoot = path.resolve(root);
  const fileSets = trackedFileSets(projectRoot);
  const imagePaths = fileSets.all.filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase("en-US")) && fs.existsSync(path.join(projectRoot, filePath)));
  const imagePathSet = new Set(imagePaths);
  const attributes = gitAttributes({ root: projectRoot, paths: imagePaths });
  const lfsRecords = lfsInventory(projectRoot);
  const lfsByPath = new Map(lfsRecords.map((record) => [record.path, record]));
  const formalManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, FORMAL_MANIFEST_PATH), "utf8"));
  const formalByPath = formalRecordIndex(formalManifest);
  const referenceAudit = collectReferences({ root: projectRoot, allFiles: fileSets.all, imagePathSet });
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-image-baseline-"));
  const nativeRasterEntries = [];
  const prepared = [];
  try {
    for (const imagePath of imagePaths) {
      const absolutePath = path.join(projectRoot, imagePath);
      const buffer = fs.readFileSync(absolutePath);
      const extension = path.extname(imagePath).toLocaleLowerCase("en-US");
      let svgSource = null;
      let embedded = null;
      if (extension === ".svg") {
        svgSource = buffer.toString("utf8");
        embedded = extractEmbeddedRaster(svgSource);
        if (embedded) {
          const extractedPath = path.join(temporaryRoot, `${prepared.length}.${embedded.extension}`);
          fs.writeFileSync(extractedPath, embedded.buffer);
          nativeRasterEntries.push({ key: imagePath, path: extractedPath });
        }
      } else {
        nativeRasterEntries.push({ key: imagePath, path: absolutePath });
      }
      prepared.push({ imagePath, absolutePath, buffer, extension, svgSource, embedded });
    }
    const rasterMetadata = inspectRasterEntries({ root: projectRoot, entries: nativeRasterEntries });
    const assets = prepared.map(({ imagePath, buffer, extension, svgSource, embedded }) => {
      const formalRecords = formalByPath.get(imagePath) || [];
      const references = referenceAudit.references.get(imagePath) || [];
      const raster = rasterMetadata.get(imagePath) || null;
      const svgDimensions = svgSource ? parseSvgDimensions(svgSource) : null;
      const category = categoryFor({ imagePath, formalRecords, references });
      const provenanceStatus = provenanceFor({ category, hasEmbeddedRaster: Boolean(embedded), extension, formalRecords });
      const lifecycle = lifecycleFor({ category, references, formalRecords, provenanceStatus });
      const productionConsumed = references.some((reference) => reference.kind === "production");
      const inFormalChain = formalRecords.length > 0 || references.some((reference) => reference.kind === "manifest");
      const isLfs = attributes.get(imagePath) === true;
      return {
        path: imagePath,
        format: extension.slice(1),
        bytes: buffer.length,
        width: svgDimensions?.width || raster?.width || null,
        height: svgDimensions?.height || raster?.height || null,
        sha256: sha256(buffer),
        perceptualHash: raster?.dhash64 ? { algorithm: "dhash64", dhash64: raster.dhash64, source: embedded ? "embedded-raster" : "file" } : null,
        vectorVisualHash: svgSource && !embedded ? normalizedSvgVisualHash(svgSource) : null,
        rasterInspectionError: raster?.error || null,
        hasEmbeddedRaster: Boolean(embedded),
        isTracked: fileSets.tracked.has(imagePath),
        isGitLfs: isLfs,
        lfsPointer: lfsByPath.get(imagePath) || null,
        referenced: references.length > 0,
        references,
        category,
        assetType: formalRecords[0]?.isDedicated ? "dedicated" : SAFE_PLACEHOLDERS.has(imagePath) ? "placeholder" : category,
        entityIds: stableUnique(formalRecords.map((record) => record.entityId)),
        qids: stableUnique(formalRecords.map((record) => record.qid)),
        entityTypes: stableUnique(formalRecords.map((record) => record.entityType)),
        provenanceStatus,
        productionConsumed,
        inFormalPageChain: inFormalChain,
        lifecycle,
        suspectedObsolete: ["SAFE TO DELETE", "legacy-unused"].includes(lifecycle) || category === "legacy-unused",
      };
    }).sort((left, right) => left.path.localeCompare(right.path, "en"));

    const duplicates = duplicateGroups(assets);
    const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot });
    const backfill = verifyBackfill({ manifest: formalManifest, repository });
    const unsafeProductionImages = assets.filter((asset) => asset.productionConsumed && asset.provenanceStatus.startsWith("unverified-legacy") && DESTINATION_LEGACY_PATTERN.test(asset.path)).map((asset) => ({ path: asset.path, references: asset.references.filter((reference) => reference.kind === "production") }));
    const unknownAssets = assets.filter((asset) => asset.category === "unknown" || asset.provenanceStatus === "unknown" || asset.lifecycle === "UNKNOWN").map((asset) => asset.path);
    const safeToDelete = assets.filter((asset) => asset.lifecycle === "SAFE TO DELETE").map((asset) => asset.path);
    const placeholderAssets = assets.filter((asset) => asset.category === "neutral-placeholder").map((asset) => asset.path);
    const normalGitImages = assets.filter((asset) => !asset.isGitLfs);
    const sizePolicy = normalGitImages.map((asset) => evaluateNormalGitImageSizePolicy(asset));
    const normalGitSizeAuditAssets = sizePolicy.filter((entry) => entry.auditRequired);
    const normalGitLargeAssets = sizePolicy.filter((entry) => entry.bytes > NORMAL_GIT_DEFAULT_FAIL_THRESHOLD_BYTES);
    const sizePolicyViolations = sizePolicy.filter((entry) => !entry.allowed);
    const hardLimitViolations = sizePolicy.filter((entry) => entry.decision === "hard-reject-over-5mb").map((entry) => entry.path);
    const exceptionValidation = NORMAL_GIT_SIZE_EXCEPTIONS.map((entry) => ({ id: entry.id, path: entry.path, errors: validateNormalGitSizeException(entry) }));
    const duplicateExceptionIds = NORMAL_GIT_SIZE_EXCEPTIONS.filter((entry, index, records) => records.findIndex((candidate) => candidate.id === entry.id) !== index).map((entry) => entry.id);
    const duplicateExceptionPaths = NORMAL_GIT_SIZE_EXCEPTIONS.filter((entry, index, records) => records.findIndex((candidate) => cleanPath(candidate.path) === cleanPath(entry.path)) !== index).map((entry) => entry.path);
    const invalidSizeExceptions = exceptionValidation.filter((entry) => entry.errors.length > 0).concat([
      ...duplicateExceptionIds.map((id) => ({ id, errors: ["duplicate-id"] })),
      ...duplicateExceptionPaths.map((exceptionPath) => ({ path: exceptionPath, errors: ["duplicate-path"] })),
    ]);
    const usedExceptionIds = new Set(sizePolicy.filter((entry) => entry.exceptionMatch).map((entry) => entry.exceptionId));
    const unusedSizeExceptions = NORMAL_GIT_SIZE_EXCEPTIONS.filter((entry) => !usedExceptionIds.has(entry.id)).map((entry) => entry.id);
    const sizes = assets.map((asset) => asset.bytes);
    const categoryCounts = Object.fromEntries([...new Set(assets.map((asset) => asset.category))].sort().map((category) => [category, assets.filter((asset) => asset.category === category).length]));
    const generatedFromHead = run("git", ["show", "-s", "--format=%cI", IMAGE_ASSET_BASELINE_SOURCE_HEAD], { root: projectRoot }).stdout.trim();
    const committedDeletedPaths = run("git", ["diff", "--name-only", "--diff-filter=D", `${IMAGE_ASSET_BASELINE_SOURCE_HEAD}..HEAD`, "--"], { root: projectRoot }).stdout;
    const workingDeletedPaths = run("git", ["diff", "--name-only", "--diff-filter=D", "HEAD", "--"], { root: projectRoot }).stdout;
    const deletedImagePaths = [...new Set(`${committedDeletedPaths}\n${workingDeletedPaths}`
      .split(/\r?\n/u)
      .map(cleanPath)
      .filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase("en-US"))))]
      .sort((left, right) => left.localeCompare(right, "en"));
    return {
      schemaVersion: BASELINE_SCHEMA_VERSION,
      sourceBaselineHead: IMAGE_ASSET_BASELINE_SOURCE_HEAD,
      generatedFromHead,
      inventory: assets,
      summary: {
        totalImages: assets.length,
        categoryCounts,
        productionImages: assets.filter((asset) => asset.productionConsumed || asset.inFormalPageChain).length,
        placeholderAssets: placeholderAssets.length,
        auditSourceAssets: assets.filter((asset) => asset.category === "audit-source").length,
        totalBytes: sizes.reduce((sum, value) => sum + value, 0),
        normalGitImageBytes: normalGitImages.reduce((sum, asset) => sum + asset.bytes, 0),
        lfsImageBytes: assets.filter((asset) => asset.isGitLfs).reduce((sum, asset) => sum + (asset.lfsPointer?.bytes || asset.bytes), 0),
        lfsTrackedBytes: lfsRecords.reduce((sum, record) => sum + record.bytes, 0),
        averageBytes: sizes.length ? Math.round(sizes.reduce((sum, value) => sum + value, 0) / sizes.length) : 0,
        medianBytes: percentile(sizes, 0.5),
        p95Bytes: percentile(sizes, 0.95),
        largerThan300Kb: assets.filter((asset) => asset.bytes > 300_000).length,
        largerThan500Kb: assets.filter((asset) => asset.bytes > 500_000).length,
        largerThan1Mb: assets.filter((asset) => asset.bytes > 1_000_000).length,
        largerThan5Mb: assets.filter((asset) => asset.bytes > 5_000_000).length,
        largestAssets: [...assets].sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path, "en")).slice(0, 20).map(({ path: assetPath, bytes, category, isGitLfs }) => ({ path: assetPath, bytes, category, isGitLfs })),
      },
      coverage: {
        countries: { dedicated: formalManifest.countries.filter((record) => record.status === "imageReady").length, total: formalManifest.countries.length },
        cities: { dedicated: formalManifest.cities.filter((record) => record.status === "imageReady").length, total: formalManifest.cities.length },
        corePois: { dedicated: formalManifest.pois.filter((record) => record.status === "imageReady").length, total: formalManifest.pois.length },
        neutralPlaceholderAssignments: [...formalManifest.cities, ...formalManifest.pois].filter((record) => record.status === "placeholder").length,
        invalidMappings: formalManifest.invalidMappings.length,
      },
      backfill,
      references: {
        missingLocalAssets: referenceAudit.missing,
        blockingMissingLocalAssets: referenceAudit.missing.filter((entry) => ["production", "manifest"].includes(entry.kind)),
        externalImageReferences: referenceAudit.external,
        unsafeProductionImages,
      },
      orphanAssets: {
        safeToDelete,
        keepForAudit: assets.filter((asset) => asset.lifecycle === "KEEP FOR AUDIT").map((asset) => asset.path),
        keepForCompatibility: assets.filter((asset) => asset.lifecycle === "KEEP FOR COMPATIBILITY").map((asset) => asset.path),
        unknown: unknownAssets,
      },
      placeholders: placeholderAssets,
      remediation: {
        deletedImagePaths,
        deletedImageCount: deletedImagePaths.length,
      },
      duplicates,
      git: {
        sizeThresholds: {
          targetBytes: IMAGE_SIZE_AUDIT_THRESHOLD_BYTES,
          auditAboveBytes: IMAGE_SIZE_AUDIT_THRESHOLD_BYTES,
          defaultFailAboveBytes: NORMAL_GIT_DEFAULT_FAIL_THRESHOLD_BYTES,
          hardFailAboveBytes: NORMAL_GIT_HARD_LIMIT_BYTES,
        },
        normalGitSizeAuditAssets,
        normalGitLargeAssets,
        sizePolicyViolations,
        sizeExceptions: NORMAL_GIT_SIZE_EXCEPTIONS,
        invalidSizeExceptions,
        unusedSizeExceptions,
        hardLimitViolations,
        lfsRecords,
        invalidLfsPointers: lfsRecords.filter((record) => !record.pointerValid).map((record) => record.path),
      },
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function humanBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(2)} KB`;
  return `${bytes} B`;
}

function markdownList(values, empty = "None") {
  return values.length ? values.map((value) => `- ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n") : `- ${empty}`;
}

export function renderImageAssetBaselineReport(model) {
  const categories = Object.entries(model.summary.categoryCounts).map(([category, count]) => `| ${category} | ${count} |`).join("\n");
  const top = model.summary.largestAssets.map((asset, index) => `| ${index + 1} | ${asset.path} | ${humanBytes(asset.bytes)} | ${asset.category} | ${asset.isGitLfs ? "yes" : "no"} |`).join("\n");
  const debt = model.backfill.byCountry.map((entry) => `| ${entry.countryCode} | ${entry.cities} | ${entry.pois} | ${entry.total} |`).join("\n");
  const exact = model.duplicates.exactGroups.map((group) => `- ${humanBytes(group.duplicateBytes)} duplicate bytes · ${group.paths.join(" · ")}`).join("\n") || "- None";
  const perceptual = model.duplicates.perceptualGroups.map((group) => `- distance≤${group.maximumPairDistance} · ${group.paths.join(" · ")}`).join("\n") || "- None";
  return `# Route V2 Image Asset Baseline Report

Baseline source HEAD: ${model.sourceBaselineHead}

Baseline source HEAD timestamp: ${model.generatedFromHead}

## Outcome

- Repository image files: ${model.summary.totalImages}
- Production/formal-chain image files: ${model.summary.productionImages}
- Placeholder files: ${model.summary.placeholderAssets}
- Audit/source files: ${model.summary.auditSourceAssets}
- Unknown assets: ${model.orphanAssets.unknown.length}
- Missing production local image references: ${model.references.blockingMissingLocalAssets.length}
- Runtime/production external image references: ${model.references.externalImageReferences.filter((entry) => entry.kind === "production").length}
- Embedded bootstrap provenance image URLs (sanitized before display): ${model.references.externalImageReferences.filter((entry) => entry.kind === "embedded-bootstrap-provenance").length}
- Dormant server/provider image URLs (not requested by the browser baseline): ${model.references.externalImageReferences.filter((entry) => entry.kind === "dormant-network-provider").length}
- Unsafe unverified destination images in production consumers: ${model.references.unsafeProductionImages.length}
- Active invalid mappings: ${model.coverage.invalidMappings}
- Proven safe image files deleted in this phase: ${model.remediation.deletedImageCount}

## Classification

| Category | Count |
| --- | ---: |
${categories}

## Entity coverage

- Country covers: ${model.coverage.countries.dedicated}/${model.coverage.countries.total}
- Dedicated City images: ${model.coverage.cities.dedicated}/${model.coverage.cities.total}
- Dedicated Core POI images: ${model.coverage.corePois.dedicated}/${model.coverage.corePois.total}
- Neutral placeholder assignments: ${model.coverage.neutralPlaceholderAssignments}
- Invalid mappings: ${model.coverage.invalidMappings}

## Needs-backfill verification

- Total: ${model.backfill.total}
- City: ${model.backfill.cities}
- Core POI: ${model.backfill.pois}
- Entity/QID/parent/placeholder problems: ${model.backfill.problems.length}

| Country | City debt | POI debt | Total |
| --- | ---: | ---: | ---: |
${debt}

## Placeholder assets

${markdownList(model.placeholders)}

## Unused and legacy assets

### Deleted after reverse-reference proof

${markdownList(model.remediation.deletedImagePaths)}

### Safe to delete

${markdownList(model.orphanAssets.safeToDelete)}

### Keep for audit

${markdownList(model.orphanAssets.keepForAudit)}

### Keep for compatibility

${markdownList(model.orphanAssets.keepForCompatibility)}

### Unknown

${markdownList(model.orphanAssets.unknown)}

## Exact duplicates

- Groups: ${model.duplicates.exactGroups.length}
- Duplicate bytes: ${humanBytes(model.duplicates.exactDuplicateBytes)}

${exact}

## Perceptual duplicate candidates

- Groups: ${model.duplicates.perceptualGroups.length}

${perceptual}

## Size baseline

- Total image bytes: ${humanBytes(model.summary.totalBytes)}
- Normal Git image bytes: ${humanBytes(model.summary.normalGitImageBytes)}
- Git LFS image bytes: ${humanBytes(model.summary.lfsImageBytes)}
- Git LFS audit/large-file bytes: ${humanBytes(model.summary.lfsTrackedBytes)}
- Average: ${humanBytes(model.summary.averageBytes)}
- Median: ${humanBytes(model.summary.medianBytes)}
- P95: ${humanBytes(model.summary.p95Bytes)}
- >300 KB: ${model.summary.largerThan300Kb}
- >500 KB: ${model.summary.largerThan500Kb}
- >1 MB: ${model.summary.largerThan1Mb}
- >5 MB: ${model.summary.largerThan5Mb}

## Largest 20 image assets

| # | Path | Size | Category | LFS |
| ---: | --- | ---: | --- | --- |
${top}

## Consumer and manifest findings

### Missing local assets

${markdownList(model.references.missingLocalAssets)}

### External image references

${markdownList(model.references.externalImageReferences)}

### Unsafe production image consumers

${markdownList(model.references.unsafeProductionImages)}

### Normal Git assets above 500 KB

${markdownList(model.git.normalGitLargeAssets)}

### Normal Git size exceptions

${markdownList(model.git.sizeExceptions)}

### Normal Git size-policy violations

${markdownList(model.git.sizePolicyViolations)}

### Invalid LFS pointers

${markdownList(model.git.invalidLfsPointers)}

## Final directory and manifest rules

1. data/route-v2/images/image-coverage-manifest.json remains the only runtime entity-image manifest.
2. assets/route-v2-images/countries/ contains reviewed non-photographic Country graphic covers.
3. City and POI records without a verified, rights-audited, entity-bound asset must use assets/route-city-placeholder.svg and retain needsBackfill.
4. Route/general, UI, audit, and legacy files are catalogued here but never counted as dedicated City/POI coverage.
5. Country covers may appear only in Country or explicit Country-semantic positions; they cannot serve as City/POI fallback.
6. No runtime consumer may fetch a remote image or use an unverified legacy destination photograph.

## Batch 06+ admission standard

1. New entity images require exact entity/QID/parent binding, local immutable path, source identity, creator/license when available, acquisition time, source/processed hashes, dimensions, format, bytes, and reviewed verification status.
2. Dedicated City/POI assets must be semantically exact; otherwise use the neutral placeholder and keep the debt.
3. New or modified normal-Git images target 300 KB or less; images above 300 KB enter the size audit, images above 500 KB fail without an exact path/hash/bytes/category exception, and product images above 5 MB hard-fail. Large non-product audit snapshots must use Git LFS.
4. Image Manifest, Image Quality, City Detail, Trip/Footprint, this baseline gate, and comprehensive prelaunch must all pass.
5. Exact and perceptual duplicate candidates must be explained; reusing the one neutral placeholder is valid, copying a destination photo across entities is not.
`;
}

export function stableBaselineJson(model) {
  return `${JSON.stringify(model, null, 2)}\n`;
}
