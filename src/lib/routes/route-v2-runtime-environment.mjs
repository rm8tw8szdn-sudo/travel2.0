const SERVER_RUNTIME_FLAGS = [
  "ROUTE_V2_INTENT_ENABLED",
  "ROUTE_V2_TIME_INTENT_ENABLED",
  "ROUTE_V2_CANDIDATE_POOL_ENABLED",
  "ROUTE_V2_TRACE_ENABLED",
  "ROUTE_V2_EVIDENCE_BUNDLE_ENABLED",
];

const SERVER_SAFETY_FLAGS = [
  "ROUTE_V2_EVIDENCE_ONLINE_ENABLED",
  "ROUTE_V2_TAVILY_EVIDENCE_ENABLED",
  "ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED",
  "SEARCH_AUTO_ACCEPT_GENERATED",
];

function hasValue(env, key) {
  return env[key] !== undefined && env[key] !== null && String(env[key]).trim() !== "";
}

function flagEnabled(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return String(value).trim().toLocaleLowerCase("en-US") === "true";
}

export function createRouteV2RuntimeEnvironment(env = process.env) {
  const runtime = { ...env };
  const runtimeEnabled = flagEnabled(env.ROUTE_V2_RUNTIME_ENABLED, true);
  runtime.ROUTE_V2_RUNTIME_ENABLED = runtimeEnabled ? "true" : "false";

  if (runtimeEnabled) {
    for (const flag of SERVER_RUNTIME_FLAGS) {
      if (!hasValue(runtime, flag)) runtime[flag] = "true";
    }
  }
  for (const flag of SERVER_SAFETY_FLAGS) {
    if (!hasValue(runtime, flag)) runtime[flag] = "false";
  }
  return runtime;
}
