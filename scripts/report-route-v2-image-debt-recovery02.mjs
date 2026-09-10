import fs from "node:fs";
import path from "node:path";

import {
  RECOVERY02_REPORT_PATH,
  RECOVERY02_SUMMARY_PATH,
  collectImageDebtRecovery02Audit,
  renderImageDebtRecovery02Report,
} from "./lib/image-debt-recovery02-audit.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const model = collectImageDebtRecovery02Audit({ root: ROOT });
if (model.errors.length) throw new Error(`image-debt-recovery02-audit-failed:\n${model.errors.join("\n")}`);
fs.writeFileSync(path.join(ROOT, RECOVERY02_SUMMARY_PATH), `${JSON.stringify(model, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(ROOT, RECOVERY02_REPORT_PATH), renderImageDebtRecovery02Report(model), "utf8");
console.log(JSON.stringify({ status: "PASS", report: RECOVERY02_REPORT_PATH, summary: RECOVERY02_SUMMARY_PATH, recovered: model.recovered, remaining: model.remaining, current: model.current }, null, 2));
