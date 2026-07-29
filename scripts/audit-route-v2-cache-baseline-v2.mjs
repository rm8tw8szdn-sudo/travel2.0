import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditRouteV2Cache,
  createCacheBaselineV2,
  verifyCacheBaselineV2,
} from "../src/lib/routes/cache-baseline-v2.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function has(name) {
  return process.argv.includes(name);
}

function writeAtomic(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, contents, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

const cacheRoot = path.resolve(argument("--root", path.join(projectRoot, ".route-v2-cache")));
const baselinePath = path.resolve(argument("--baseline", path.join(projectRoot, "route-v2-cache-manifest-v2.json")));
const audit = auditRouteV2Cache(cacheRoot, {
  enumerationOrder: has("--reverse-enumeration") ? "reverse" : "normal",
});

if (has("--write-baseline")) {
  if (audit.status !== "PASS") {
    process.stderr.write(`${JSON.stringify(audit, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    const baseline = createCacheBaselineV2(audit);
    writeAtomic(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      action: "baseline-written",
      schemaVersion: baseline.schemaVersion,
      immutable: {
        fileCount: baseline.immutable.fileCount,
        totalBytes: baseline.immutable.totalBytes,
        aggregateSha256: baseline.immutable.aggregateSha256,
      },
      runtimeState: {
        fileCount: baseline.runtimeState.fileCount,
        totalBytes: baseline.runtimeState.totalBytes,
      },
    }, null, 2)}\n`);
  }
} else if (fs.existsSync(baselinePath)) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const verification = verifyCacheBaselineV2(audit, baseline);
  const output = {
    status: verification.ok ? "PASS" : "FAIL",
    schemaVersion: audit.schemaVersion,
    immutable: audit.immutable,
    runtimeState: {
      fileCount: audit.runtimeState.fileCount,
      totalBytes: audit.runtimeState.totalBytes,
      auditSha256: audit.runtimeState.auditSha256,
      requiredFiles: audit.runtimeState.files.filter((entry) => entry.required),
    },
    externalFormal: audit.externalFormal,
    fullCache: audit.fullCache,
    historicalWholeCacheHash: audit.historicalWholeCacheHash,
    errors: verification.errors,
  };
  process[verification.ok ? "stdout" : "stderr"].write(`${JSON.stringify(output, null, 2)}\n`);
  if (!verification.ok) process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  if (audit.status !== "PASS") process.exitCode = 1;
}
