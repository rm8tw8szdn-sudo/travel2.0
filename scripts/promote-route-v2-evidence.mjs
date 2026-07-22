import path from "node:path";
import { pathToFileURL } from "node:url";

import { promoteEvidenceSeed, ROUTE_V2_EVIDENCE_SEED_ROOT } from "../src/lib/routes/evidence-seed-promotion.mjs";

function parseArgs(args = process.argv.slice(2)) {
  const options = { sourceRoot: "", outputRoot: ROUTE_V2_EVIDENCE_SEED_ROOT, country: "", type: "all", dryRun: false, acceptUpdate: false };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--dry-run") options.dryRun = true;
    else if (token === "--accept-update") options.acceptUpdate = true;
    else if (token === "--source") options.sourceRoot = path.resolve(args[++index] || "");
    else if (token === "--output") options.outputRoot = path.resolve(args[++index] || "");
    else if (token === "--country") options.country = String(args[++index] || "").toUpperCase();
    else if (token === "--type") options.type = String(args[++index] || "all");
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.sourceRoot) throw new Error("--source is required");
  if (!/^[A-Z]{2}$/u.test(options.country)) throw new Error("--country must be a two-letter code");
  if (!["route-leg", "season", "all"].includes(options.type)) throw new Error("--type must be route-leg, season, or all");
  return options;
}

export function runEvidencePromotionCli(args = process.argv.slice(2)) {
  return promoteEvidenceSeed(parseArgs(args));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  try {
    const result = runEvidencePromotionCli();
    process.stdout.write(`${JSON.stringify({
      ok: result.ok && (result.conflicts.length === 0 || result.updateAccepted === true),
      dryRun: result.dryRun,
      written: result.written,
      changed: result.changed,
      updateAccepted: result.updateAccepted === true,
      sourceRoot: result.sourceRoot,
      outputRoot: result.outputRoot,
      stats: result.stats,
      rejected: result.rejected,
      skipped: result.skipped,
      conflicts: result.conflicts,
      diagnostics: result.diagnostics,
    }, null, 2)}\n`);
    if (!result.ok || (result.conflicts.length && result.updateAccepted !== true)) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
