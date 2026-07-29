import { evaluateRouteIntentOracle } from "./route-intent-model-oracle.mjs";

function sorted(values) {
  return [...new Set(values || [])].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

export function isRouteIntentShadowValidationEnabled(env = process.env) {
  return String(env.ROUTE_V2_ROUTE_INTENT_SHADOW_VALIDATION || "false").trim().toLocaleLowerCase("en-US") === "true";
}

export function runRouteIntentShadowValidation({
  routeIntent,
  record,
  productionValidation,
  requireFingerprint = true,
  source = "route-result",
  onDiagnostic = null,
} = {}) {
  const oracle = evaluateRouteIntentOracle(routeIntent, record, { requireFingerprint });
  const productionCodes = sorted(productionValidation?.reasonCodes);
  const oracleCodes = sorted(oracle.violationCodes);
  const consistent = Boolean(productionValidation)
    && productionValidation.matched === oracle.matched
    && productionValidation.requiresEvidence === oracle.requiresEvidence
    && JSON.stringify(productionCodes) === JSON.stringify(oracleCodes);
  const diagnostic = {
    type: "route-intent-shadow-validation",
    source,
    consistent,
    production: {
      matched: Boolean(productionValidation?.matched),
      requiresEvidence: Boolean(productionValidation?.requiresEvidence),
      reasonCodes: productionCodes,
    },
    oracle: {
      matched: oracle.matched,
      requiresEvidence: oracle.requiresEvidence,
      reasonCodes: oracleCodes,
    },
  };
  if (!consistent && typeof onDiagnostic === "function") onDiagnostic(structuredClone(diagnostic));
  return diagnostic;
}

export function compareRouteIntentShadow({
  route,
  intent,
  productionResult,
  source = "route-result",
  env = process.env,
  onDiagnostic = null,
} = {}) {
  if (!isRouteIntentShadowValidationEnabled(env)) {
    return {
      type: "route-intent-shadow-validation",
      source,
      enabled: false,
      skipped: true,
      matched: true,
      consistent: true,
    };
  }
  const diagnostic = runRouteIntentShadowValidation({
    routeIntent: intent,
    record: route,
    productionValidation: productionResult,
    requireFingerprint: true,
    source,
    onDiagnostic,
  });
  return {
    ...diagnostic,
    enabled: true,
    skipped: false,
    matched: diagnostic.consistent,
  };
}
