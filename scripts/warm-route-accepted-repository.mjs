import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRouteRepositoryWarmup } from "../src/lib/routes/repository-warmup-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = await runRouteRepositoryWarmup({
  storagePath: process.env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "accepted-routes.json"),
  evidenceStoragePath: process.env.ROUTE_EVIDENCE_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "route-evidence.json"),
  syncStatePath: process.env.ROUTE_PROVIDER_SYNC_STATE_PATH || path.join(root, ".route-v2-cache", "provider-sync-state.json"),
  log: (event) => console.log(JSON.stringify(event)),
});

console.log(JSON.stringify(report, null, 2));
if (!report.ok || report.completionStatus !== "minimum-met") process.exitCode = 1;
