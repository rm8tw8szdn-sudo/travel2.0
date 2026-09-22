const OUTCOMES = new Set([
  "SOURCE_NOT_FOUND",
  "SOURCE_FOUND_BUT_FACT_INSUFFICIENT",
  "SOURCE_FOUND_BUT_WRONG_DIRECTION_OR_GEOGRAPHY",
  "SOURCE_FOUND_AND_FACT_SUFFICIENT_BUT_NO_REVIEWED_CLAIM_PATH",
  "SOURCE_FOUND_AND_ELIGIBLE_FOR_REVIEWED_CLAIM",
  "OTHER_EXPLICIT_BLOCKER",
]);

export function validateReviewedSearchAttempt(attempt, unit) {
  const reasons = [];
  if (!attempt || attempt.unitIdentity !== unit?.unitIdentity) reasons.push("research-attempt-unit-mismatch");
  if (!attempt?.attemptId || !/^batch02-search-/u.test(attempt.attemptId)) reasons.push("research-attempt-id-invalid");
  if (attempt?.executionStatus !== "EXECUTED") reasons.push("research-attempt-not-executed");
  if (!Array.isArray(attempt?.executedQueries) || !attempt.executedQueries.length || attempt.executedQueries.some((query) => typeof query !== "string" || !query.trim())) reasons.push("research-attempt-query-missing");
  if (!attempt?.searchMethod || !attempt?.reviewedResultOutcome || !attempt?.unitSpecificAdjudication) reasons.push("research-attempt-review-incomplete");
  if (!Number.isFinite(Date.parse(attempt?.reviewedAt))) reasons.push("research-attempt-reviewedAt-invalid");
  if (!OUTCOMES.has(attempt?.finalResearchOutcome)) reasons.push("research-attempt-outcome-invalid");
  const references = attempt?.checkedResultReferences;
  if (!Array.isArray(references)) reasons.push("research-attempt-references-invalid");
  if (attempt?.finalResearchOutcome !== "SOURCE_NOT_FOUND" && (!references?.length || references.some((reference) => !/^https?:\/\//u.test(reference?.url || "") || !reference?.reviewOutcome))) reasons.push("research-attempt-source-reference-required");
  if (attempt?.finalResearchOutcome === "SOURCE_NOT_FOUND" && attempt?.reviewedResultOutcome !== "NO_CREDIBLE_RESULT_FOUND") reasons.push("research-attempt-not-found-review-invalid");
  if (attempt?.finalResearchOutcome === "SOURCE_FOUND_AND_ELIGIBLE_FOR_REVIEWED_CLAIM" && !attempt?.reviewedSourceFact) reasons.push("research-attempt-eligible-fact-required");
  return { accepted: reasons.length === 0, reasons };
}

export const RESEARCH_OUTCOMES = Object.freeze([...OUTCOMES]);
