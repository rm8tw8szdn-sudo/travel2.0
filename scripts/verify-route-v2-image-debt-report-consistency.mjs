import fs from "node:fs";
import path from "node:path";

import { calculateImageDebtReportData } from "./lib/image-debt-report-data.mjs";
import { runImageDebtFinalReportMutationFixtures, verifyImageDebtFinalReport } from "./lib/image-debt-report-consistency.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const reportPath = process.env.ROUTE_V2_IMAGE_DEBT_REPORT_PATH || path.join(ROOT, "ROUTE_V2_IMAGE_DEBT_ELIMINATION_REPORT.md");
const source = fs.readFileSync(reportPath, "utf8");
const stats = calculateImageDebtReportData({ root: ROOT });
const summary = verifyImageDebtFinalReport({ source, stats });
const mutations = runImageDebtFinalReportMutationFixtures({ source, stats });

console.log(JSON.stringify({
  verifier: "route-v2-image-debt-report-consistency",
  status: "PASS",
  summary,
  mutations,
}, null, 2));
