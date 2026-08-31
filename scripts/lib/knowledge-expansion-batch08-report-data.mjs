import { calculateKnowledgeExpansionReportData, comma, percent } from "./knowledge-expansion-batch07-report-data.mjs";

export function calculateBatch08ReportData({ root } = {}) {
  return calculateKnowledgeExpansionReportData({ root, batchNumber: 8 });
}

export { comma, percent };
