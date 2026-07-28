import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function ordinalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => ordinalCompare(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      if (entry.isFile()) files.push(absolutePath);
    }
  };
  visit(root);
  return files;
}

function classify(relativePath) {
  const name = relativePath.toLowerCase();
  if (name === "accepted-routes.json") return "accepted-current";
  if (name.includes(".before-") || name.includes(".before_") || /accepted-routes\..*\.json$/u.test(name)) {
    return "historical-backup";
  }
  if (name.endsWith(".log") || name.startsWith("bulk-route-generation-")) return "runtime-log";
  if (name.startsWith("proxied-images/") || [
    "route-image-cache.json",
    "destination-images.json",
    "feed-image-pool.json",
    "feed-image-pool-report.json",
    "feed-image-prewarm-report.json",
    "feed-proxy-warm-report.json",
    "image-country-audit-500.json",
  ].includes(name)) return "media-cache";
  if ([
    "provider-sync-state.json",
    "route-candidate-pool.jsonl",
    "search-analytics.jsonl",
    "search-cache.json",
    "search-review-candidates.json",
  ].includes(name)) return "mutable-runtime-state";
  if (name === "knowledge-graph-pool.json") return "mutable-derived-knowledge";
  if (name.startsWith("route-feed-bootstrap-")) return "derived-feed-bootstrap";
  if (name === "route-evidence.json" || name.startsWith("route-evidence.")) return "derived-route-evidence";
  return "unclassified";
}

function aggregate(category, entries) {
  const normalizedEntries = entries
    .map(({ path: entryPath, bytes, sha256: fileHash }) => ({ path: entryPath, bytes, sha256: fileHash }))
    .sort((left, right) => ordinalCompare(left.path, right.path));
  const hashInput = JSON.stringify({
    schemaVersion: "route-v2-asset-manifest-v1",
    category,
    files: normalizedEntries,
  });
  return {
    files: normalizedEntries.length,
    bytes: normalizedEntries.reduce((sum, entry) => sum + entry.bytes, 0),
    sha256: sha256(Buffer.from(hashInput, "utf8")),
    entries: normalizedEntries,
  };
}

const root = path.resolve(option("root", ".route-v2-cache"));
const outputPath = option("output");
assert(fs.existsSync(root) && fs.statSync(root).isDirectory(), `manifest root is not a directory: ${root}`);

const entries = listFiles(root).map((absolutePath) => {
  const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
  const content = fs.readFileSync(absolutePath);
  return {
    path: relativePath,
    bytes: content.byteLength,
    sha256: sha256(content),
    category: classify(relativePath),
  };
});
const byCategory = new Map();
for (const entry of entries) {
  if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
  byCategory.get(entry.category).push(entry);
}

const report = {
  schemaVersion: "route-v2-asset-manifest-forensics-v1",
  algorithm: {
    traversal: "recursive ordinal path order",
    pathFormat: "root-relative forward-slash paths",
    fileDigest: "SHA-256 of exact file bytes",
    aggregateDigest: "SHA-256 of UTF-8 compact JSON containing schemaVersion, category, and sorted {path,bytes,sha256} entries",
    includesMtime: false,
    normalizesJson: false,
    includesJsonl: true,
  },
  root,
  historicalClaim: {
    sha256: "056d3af349b05cc7ae59620c23be26e11e91dd1d0c37a8bf2b153362834568cb",
    reproducibleWithThisAlgorithm: false,
    reason: "The historical report did not persist an aggregate algorithm or its 331-entry input snapshot.",
  },
  all: aggregate("all", entries),
  categories: Object.fromEntries(
    [...byCategory.entries()]
      .sort(([left], [right]) => ordinalCompare(left, right))
      .map(([category, categoryEntries]) => [category, aggregate(category, categoryEntries)]),
  ),
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  const absoluteOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, serialized, "utf8");
}
process.stdout.write(serialized);
