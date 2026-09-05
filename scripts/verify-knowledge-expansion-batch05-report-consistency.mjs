import path from "node:path";
import fs from "node:fs";

import { verifySingleHistoricalKnowledgeReportSnapshot } from "./lib/historical-knowledge-report-snapshots.mjs";

const canonicalPath = "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_REPORT.md";
const overridePath = process.env.ROUTE_V2_BATCH05_REPORT_PATH;
const overrides = overridePath ? new Map([[canonicalPath, fs.readFileSync(overridePath, "utf8")]]) : new Map();
const result = verifySingleHistoricalKnowledgeReportSnapshot({ root: path.resolve(import.meta.dirname, ".."), batch: "05", overrides });
console.log(JSON.stringify({ verifier: "knowledge-expansion-batch05-report-consistency", ...result }, null, 2));
