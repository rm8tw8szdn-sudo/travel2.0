import { calculateKnowledgeExpansionReportData, comma, percent } from "./knowledge-expansion-batch07-report-data.mjs";

export function calculateBatch09ReportData({ root } = {}) {
  return calculateKnowledgeExpansionReportData({ root, batchNumber: 9 });
}

export { comma, percent };
