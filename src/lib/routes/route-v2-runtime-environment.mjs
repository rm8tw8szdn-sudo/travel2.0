import crypto from "node:crypto";

export const ROUTE_V2_RUNTIME_DECISION_SCHEMA_VERSION = "route-v2-runtime-decision-v1";

const SERVER_RUNTIME_FLAGS = [
  "ROUTE_V2_INTENT_ENABLED",
  "ROUTE_V2_TIME_INTENT_ENABLED",
  "ROUTE_V2_CANDIDATE_POOL_ENABLED",
  "ROUTE_V2_TRACE_ENABLED",
  "ROUTE_V2_EVIDENCE_BUNDLE_ENABLED",
];

const SERVER_SAFETY_FLAGS = [
  "ROUTE_V2_EVIDENCE_LOCAL_ENABLED",
  "ROUTE_V2_EVIDENCE_ONLINE_ENABLED",
  "ROUTE_V2_TAVILY_EVIDENCE_ENABLED",
  "ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED",
  "ROUTE_V2_EVIDENCE_VALIDATION_ENABLED",
  "ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED",
  "ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED",
  "ROUTE_V2_PUBLICATION_GATE_ENABLED",
  "ROUTE_V2_READY_POOL_ENABLED",
  "ROUTE_V2_ROUTE_INTENT_SHADOW_VALIDATION",
  "ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT",
  "SEARCH_AUTO_ACCEPT_GENERATED",
];

export const ROUTE_V2_CONTROLLED_RUNTIME_FLAGS = Object.freeze([
  ...SERVER_RUNTIME_FLAGS,
  ...SERVER_SAFETY_FLAGS.filter((flag) => flag.startsWith("ROUTE_V2_")),
]);

function hasValue(env, key) {
  return env[key] !== undefined && env[key] !== null && String(env[key]).trim() !== "";
}

function flagEnabled(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return String(value).trim().toLocaleLowerCase("en-US") === "true";
}

function clean(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function diagnosticCode(value, fallback = "unspecified") {
  const normalized = clean(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9:_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return normalized || fallback;
}

export function normalizeRouteV2CanaryPercentage(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.min(100, Math.max(0, Number(fallback) || 0));
  return Math.min(100, Math.max(0, parsed));
}

function percentageText(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function subjectHash({ subjectType, subjectId, salt }) {
  return crypto
    .createHash("sha256")
    .update([
      ROUTE_V2_RUNTIME_DECISION_SCHEMA_VERSION,
      clean(salt) || "route-v2-production-readiness-phase1",
      subjectType,
      subjectId,
    ].join("\0"))
    .digest("hex");
}

export function createRouteV2RuntimeEnvironment(env = process.env) {
  const runtime = { ...env };
  const runtimeEnabled = flagEnabled(env.ROUTE_V2_RUNTIME_ENABLED, false);
  const rolloutPercentage = normalizeRouteV2CanaryPercentage(env.ROUTE_V2_CANARY_PERCENTAGE, 0);
  runtime.ROUTE_V2_RUNTIME_ENABLED = runtimeEnabled ? "true" : "false";
  runtime.ROUTE_V2_CANARY_PERCENTAGE = percentageText(rolloutPercentage);

  if (runtimeEnabled) {
    for (const flag of SERVER_RUNTIME_FLAGS) {
      if (!hasValue(runtime, flag)) runtime[flag] = "true";
    }
  } else {
    for (const flag of ROUTE_V2_CONTROLLED_RUNTIME_FLAGS) runtime[flag] = "false";
  }
  for (const flag of SERVER_SAFETY_FLAGS) {
    if (!hasValue(runtime, flag)) runtime[flag] = "false";
  }
  return runtime;
}

export function resolveRouteV2RuntimeDecision({
  env = process.env,
  userId = "",
  sessionId = "",
} = {}) {
  const configuredEnvironment = createRouteV2RuntimeEnvironment(env);
  const masterEnabled = flagEnabled(configuredEnvironment.ROUTE_V2_RUNTIME_ENABLED, false);
  const rolloutPercentage = normalizeRouteV2CanaryPercentage(
    configuredEnvironment.ROUTE_V2_CANARY_PERCENTAGE,
    0,
  );
  const normalizedUserId = clean(userId);
  const normalizedSessionId = clean(sessionId);
  const subjectType = normalizedUserId ? "user" : normalizedSessionId ? "session" : "anonymous";
  const subjectId = normalizedUserId || normalizedSessionId;
  const hash = subjectId
    ? subjectHash({
        subjectType,
        subjectId,
        salt: configuredEnvironment.ROUTE_V2_CANARY_SALT,
      })
    : "";
  const bucket = hash ? Number.parseInt(hash.slice(0, 8), 16) % 10_000 : null;
  const included = Boolean(
    masterEnabled
    && rolloutPercentage > 0
    && (
      rolloutPercentage >= 100
      || (bucket !== null && bucket < rolloutPercentage * 100)
    ),
  );
  const environment = { ...configuredEnvironment };
  if (!included) {
    for (const flag of ROUTE_V2_CONTROLLED_RUNTIME_FLAGS) environment[flag] = "false";
  }
  const v2IntentEnabled = flagEnabled(environment.ROUTE_V2_INTENT_ENABLED, false);
  const enabled = included && v2IntentEnabled;
  const reason = !masterEnabled
    ? "master-disabled"
    : rolloutPercentage <= 0
      ? "rollout-disabled"
      : !subjectId && rolloutPercentage < 100
        ? "missing-subject"
        : !included
          ? "canary-excluded"
          : !v2IntentEnabled
            ? "canary-included-v2-disabled"
            : "canary-included";
  const resolvedFlags = Object.fromEntries(
    ROUTE_V2_CONTROLLED_RUNTIME_FLAGS.map((flag) => [
      flag,
      flagEnabled(environment[flag], false),
    ]),
  );
  const diagnostics = [
    `master:${masterEnabled ? "enabled" : "disabled"}`,
    `rollout:${percentageText(rolloutPercentage)}`,
    `subject:${subjectType}`,
    `decision:${reason}`,
  ];

  return {
    environment,
    decision: {
      schemaVersion: ROUTE_V2_RUNTIME_DECISION_SCHEMA_VERSION,
      enabled,
      included,
      masterEnabled,
      rolloutPercentage,
      subjectType,
      subjectHash: hash ? hash.slice(0, 16) : null,
      bucket,
      reason,
      resolvedFlags,
      diagnostics,
    },
  };
}

export function finalizeRouteV2RuntimeDecision(decision = {}, {
  attempted = false,
  displayed = false,
  fallback = false,
  fallbackReason = "",
} = {}) {
  const normalizedAttempted = Boolean(attempted);
  const normalizedDisplayed = Boolean(displayed);
  const normalizedFallback = Boolean(fallback);
  const normalizedFallbackReason = normalizedFallback
    ? diagnosticCode(fallbackReason, "unspecified")
    : null;
  const outcome = normalizedDisplayed
    ? "v2-displayed"
    : normalizedFallback
      ? "legacy-fallback"
      : normalizedAttempted
        ? "v2-no-display"
        : decision?.enabled
          ? "v2-eligible"
          : "legacy";
  const diagnostics = [
    ...(Array.isArray(decision?.diagnostics) ? decision.diagnostics.map((item) => diagnosticCode(item)) : []),
    `outcome:${outcome}`,
    ...(normalizedFallbackReason ? [`fallback:${normalizedFallbackReason}`] : []),
  ];
  return {
    ...structuredClone(decision || {}),
    attempted: normalizedAttempted,
    displayed: normalizedDisplayed,
    fallback: normalizedFallback,
    fallbackReason: normalizedFallbackReason,
    outcome,
    diagnostics,
  };
}
