import { validateRouteIntentInvariants } from "./route-intent-invariant-gate.mjs";

export function validateFallbackRouteAgainstIntent(record = {}, routeIntent = {}, options = {}) {
  const validation = validateRouteIntentInvariants(record, routeIntent, {
    ...options,
    source: "fallback",
    requireFingerprint: false,
    claimedSuccess: true,
  });
  const missing = validation.violations
    .filter((entry) => entry.code === "required-city-missing")
    .flatMap((entry) => Array.isArray(entry.actual) ? entry.actual : []);
  const requiredIds = new Set(
    routeIntent.requiredDestinationIds || routeIntent.normalizedRouteIntent?.hardConstraints?.requiredCities?.values?.map((entry) => entry.id) || [],
  );
  const missingRequiredDestinationIds = missing.filter((entry) => requiredIds.has(entry));
  const missingRequiredDestinationNames = missing.filter((entry) => !requiredIds.has(entry));
  const orderMismatch = validation.reasonCodes.includes("fixed-order-mismatch");
  const durationConflict = validation.reasonCodes.includes("exact-days-mismatch");
  const capacityConflict = validation.reasonCodes.includes("duration-capacity-conflict")
    || validation.reasonCodes.includes("route-capacity-exceeded");
  const timeConstraintConflict = validation.reasonCodes.includes("month-conflict")
    || validation.reasonCodes.includes("season-conflict")
    || validation.reasonCodes.includes("invalid-time-intent");
  const countryConflict = validation.reasonCodes.includes("country-mismatch");
  const regionConflict = validation.reasonCodes.includes("region-mismatch");
  const destinationConflict = missing.length > 0
    || orderMismatch
    || validation.reasonCodes.includes("unexpected-city-added")
    || validation.reasonCodes.includes("required-city-count-mismatch");
  const compatibilityReasonCodes = [
    ...(missing.length ? ["required-destination-missing"] : []),
    ...(orderMismatch ? ["fixed-destination-order-mismatch"] : []),
    ...(durationConflict ? ["duration-mismatch"] : []),
    ...(capacityConflict ? ["duration-capacity-conflict"] : []),
    ...(timeConstraintConflict ? ["time-constraint-conflict"] : []),
    ...(countryConflict ? ["country-constraint-conflict"] : []),
    ...(regionConflict ? ["region-constraint-conflict"] : []),
  ];
  return {
    matched: validation.matched,
    reasonCodes: [...new Set([...compatibilityReasonCodes, ...validation.reasonCodes])],
    missingRequiredDestinationIds,
    missingRequiredDestinationNames,
    orderMismatch,
    durationConflict,
    capacityConflict,
    timeConstraintConflict,
    destinationConflict,
    countryConflict,
    regionConflict,
    requiresEvidence: validation.requiresEvidence,
    fingerprint: validation.fingerprint,
    fingerprintVersion: validation.fingerprintVersion,
    violations: validation.violations,
  };
}
