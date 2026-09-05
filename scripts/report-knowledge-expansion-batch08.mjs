import path from "node:path";

import { verifySingleHistoricalKnowledgeReportSnapshot } from "./lib/historical-knowledge-report-snapshots.mjs";

const result = verifySingleHistoricalKnowledgeReportSnapshot({ root: path.resolve(import.meta.dirname, ".."), batch: "08" });
console.log(JSON.stringify({ verifier: "knowledge-expansion-batch08-report", mode: "sealed-immutable-no-write", ...result }, null, 2));
