import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const SEALED_SNAPSHOT_PATH = "data/knowledge/reports/knowledge-expansion-sealed-snapshots.json";

export function normalizeSealedReportText(value) {
  return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

export function sealedReportHash(value) {
  return crypto.createHash("sha256").update(normalizeSealedReportText(value)).digest("hex");
}

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

function comma(value) {
  return Number(value).toLocaleString("en-US");
}

function sourceText(root, relativePath, overrides) {
  if (overrides?.has(relativePath)) return overrides.get(relativePath);
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function git(projectRoot, args, errorCode, { encoding = "utf8" } = {}) {
  const result = spawnSync("git", args, {
    cwd: projectRoot,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  invariant(result.status === 0 && !result.error, errorCode);
  return result.stdout;
}

function validateSnapshotCommit(projectRoot, snapshot, batch) {
  const commit = String(snapshot.sourceMergeCommit || "").trim();
  const pullRequest = Number(snapshot.sourcePullRequest);
  invariant(/^[0-9a-f]{40}$/u.test(commit), `sealed-batch${batch}-source-commit-invalid`);
  invariant(Number.isInteger(pullRequest) && pullRequest > 0, `sealed-batch${batch}-source-pr-invalid`);
  git(projectRoot, ["cat-file", "-e", `${commit}^{commit}`], `sealed-batch${batch}-source-commit-missing`);
  const metadata = git(
    projectRoot,
    ["show", "-s", "--format=%P%n%B", commit],
    `sealed-batch${batch}-source-commit-unreadable`,
  );
  const [parentLine = "", ...messageLines] = normalizeSealedReportText(metadata).split("\n");
  invariant(parentLine.trim().split(/\s+/u).filter(Boolean).length === 2, `sealed-batch${batch}-source-not-merge-commit`);
  invariant(
    new RegExp(`\\bMerge pull request #${pullRequest}\\b`, "u").test(messageLines.join("\n")),
    `sealed-batch${batch}-source-pr-mismatch`,
  );
  return commit;
}

function validateHistoricalPath(relativePath, batch) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  invariant(
    normalized.length > 0
      && !path.posix.isAbsolute(normalized)
      && !/^[A-Za-z]:/u.test(normalized)
      && !normalized.split("/").includes(".."),
    `sealed-batch${batch}-source-path-invalid:${relativePath}`,
  );
  return normalized;
}

function historicalBlobText(projectRoot, commit, relativePath, batch) {
  const normalizedPath = validateHistoricalPath(relativePath, batch);
  return git(
    projectRoot,
    ["show", `${commit}:${normalizedPath}`],
    `sealed-batch${batch}-source-path-missing:${normalizedPath}`,
  );
}

function validateArithmetic(snapshot, batch) {
  for (const section of ["knowledge", "evidence"]) {
    for (const key of Object.keys(snapshot[section].additions)) {
      invariant(
        snapshot[section].before[key] + snapshot[section].additions[key] === snapshot[section].after[key],
        `sealed-batch${batch}-${section}-${key}-arithmetic-mismatch`,
      );
    }
  }
  invariant(
    snapshot.knowledge.after.entities
      === snapshot.knowledge.after.countries + snapshot.knowledge.after.cities + snapshot.knowledge.after.pois,
    `sealed-batch${batch}-entity-total-mismatch`,
  );
  invariant(
    snapshot.knowledge.before.entities
      === snapshot.knowledge.before.countries + snapshot.knowledge.before.cities + snapshot.knowledge.before.pois,
    `sealed-batch${batch}-before-entity-total-mismatch`,
  );
}

function validateReportTokens(report, snapshot, batch) {
  const additions = snapshot.knowledge.additions;
  const after = snapshot.knowledge.after;
  for (const token of [
    `Published additions: ${additions.countries} Countries / ${additions.cities} Cities / ${comma(additions.pois)} POIs`,
    `Published totals: ${after.countries} Countries / ${after.cities} Cities / ${comma(after.pois)} POIs / ${comma(after.entities)} entities`,
  ]) invariant(report.includes(token), `sealed-batch${batch}-report-token-missing:${token}`);
  const transport = Number(report.match(/Directed (?:transport )?Evidence added:\s*([\d,]+)/iu)?.[1]?.replaceAll(",", ""));
  invariant(transport === snapshot.evidence.additions.transport, `sealed-batch${batch}-transport-report-mismatch`);
  const monthRisk = Number(report.match(/Objective (?:month-risk Evidence|Month Risk) added:\s*([\d,]+)/iu)?.[1]?.replaceAll(",", ""));
  invariant(monthRisk === snapshot.evidence.additions.monthRisk, `sealed-batch${batch}-month-risk-report-mismatch`);
}

export function verifyHistoricalKnowledgeReportSnapshots({
  root,
  gitRoot,
  batches = ["05", "06", "07", "08"],
  overrides = new Map(),
  manifestOverride = null,
  currentRuntimeState = null,
} = {}) {
  const projectRoot = path.resolve(root || path.join(import.meta.dirname, "..", ".."));
  const historyRoot = path.resolve(gitRoot || projectRoot);
  const manifest = manifestOverride || JSON.parse(fs.readFileSync(path.join(projectRoot, SEALED_SNAPSHOT_PATH), "utf8"));
  const checkedFiles = [];
  const results = [];
  for (const batchValue of batches) {
    const batch = String(batchValue).padStart(2, "0");
    const snapshot = manifest.batches[batch];
    invariant(snapshot, `sealed-batch${batch}-snapshot-missing`);
    validateArithmetic(snapshot, batch);
    const sourceMergeCommit = validateSnapshotCommit(historyRoot, snapshot, batch);
    for (const [relativePath, expectedHash] of Object.entries(snapshot.files)) {
      const historicalText = historicalBlobText(historyRoot, sourceMergeCommit, relativePath, batch);
      const historicalHash = sealedReportHash(historicalText);
      invariant(expectedHash === historicalHash, `sealed-batch${batch}-manifest-git-hash-mismatch:${relativePath}`);
      const text = sourceText(projectRoot, relativePath, overrides);
      const actualHash = sealedReportHash(text);
      invariant(actualHash === historicalHash, `sealed-batch${batch}-git-blob-mismatch:${relativePath}`);
      checkedFiles.push(relativePath);
    }
    const reportPath = `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH${batch}_REPORT.md`;
    validateReportTokens(normalizeSealedReportText(sourceText(projectRoot, reportPath, overrides)), snapshot, batch);
    const routePath = `data/knowledge/reports/knowledge-expansion-batch${batch}-route-consumption.json`;
    const route = JSON.parse(sourceText(projectRoot, routePath, overrides));
    invariant(route.status === "PASS", `sealed-batch${batch}-route-status-not-pass`);
    invariant(route.queryCount === snapshot.routeConsumption, `sealed-batch${batch}-route-query-count-mismatch`);
    invariant(route.externalFetchCalls === 0, `sealed-batch${batch}-route-external-fetch`);
    results.push({ batch, sourceMergeCommit, checkedFiles: Object.keys(snapshot.files).length });
  }
  const ordered = Object.keys(manifest.batches).sort();
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = manifest.batches[ordered[index]];
    const right = manifest.batches[ordered[index + 1]];
    for (const key of ["countries", "cities", "pois", "entities"]) {
      invariant(left.knowledge.after[key] === right.knowledge.before[key], `sealed-cross-batch-knowledge-${ordered[index]}-${key}`);
    }
    for (const key of ["transport", "monthRisk"]) {
      invariant(left.evidence.after[key] === right.evidence.before[key], `sealed-cross-batch-evidence-${ordered[index]}-${key}`);
    }
  }
  return {
    status: "PASS",
    batches: results,
    checkedFiles: checkedFiles.length,
    currentRuntimeStateIgnoredByHistoricalSnapshot: currentRuntimeState !== null,
    protectedAssets: manifest.protectedAssets,
  };
}

export function verifySingleHistoricalKnowledgeReportSnapshot({ root, batch, overrides = new Map() } = {}) {
  return verifyHistoricalKnowledgeReportSnapshots({ root, batches: [String(batch).padStart(2, "0")], overrides });
}
