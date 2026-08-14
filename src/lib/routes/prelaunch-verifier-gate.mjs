import { spawnSync } from "node:child_process";

export const MANDATORY_PRELAUNCH_VERIFIERS = Object.freeze([
  Object.freeze({
    name: "production-readiness-phase1-rollout-control",
    relativePath: "scripts/verify-route-v2-production-readiness-phase1.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "production-readiness-phase2-runtime-observability",
    relativePath: "scripts/verify-route-v2-production-readiness-phase2.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "real-user-search-intent-regression",
    relativePath: "scripts/verify-route-v2-real-user-search-intent-regression.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "multi-city-hard-constraints",
    relativePath: "scripts/verify-route-v2-multi-city-hard-constraints.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "single-city-hard-constraint",
    relativePath: "scripts/verify-route-v2-single-city-hard-constraint.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "trip-footprint-knowledge-identity",
    relativePath: "scripts/verify-travel-state.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "multi-country-hard-constraints",
    relativePath: "scripts/verify-route-v2-multi-country-hard-constraints.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "region-island-constraint-preservation",
    relativePath: "scripts/verify-route-v2-region-island-constraints.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "pr19-p1-closures",
    relativePath: "scripts/verify-route-v2-pr19-p1-closures.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "long-trip-capacity",
    relativePath: "scripts/verify-route-v2-long-trip-capacity.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "ui-input-image-navigation-safety",
    relativePath: "scripts/verify-route-v2-ui-input-image-navigation.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "generated-detail-authoritative-load",
    relativePath: "scripts/verify-route-v2-generated-detail-stability.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "theme-evidence-trust",
    relativePath: "scripts/verify-route-v2-theme-evidence-trust.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "route-intent-model",
    relativePath: "scripts/verify-route-v2-route-intent-model.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "route-intent-oracle",
    relativePath: "scripts/verify-route-v2-route-intent-oracle.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "semantic-intent-and-candidate-snapshot-consistency",
    relativePath: "scripts/verify-route-v2-semantic-intent-consistency.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "malformed-route-intent-production-paths",
    relativePath: "scripts/verify-route-v2-malformed-route-intent.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "route-intent-generative",
    relativePath: "scripts/verify-route-v2-intent-generative.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "route-intent-boundaries",
    relativePath: "scripts/verify-route-v2-intent-boundaries.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "route-intent-mutation",
    relativePath: "scripts/verify-route-v2-intent-mutations.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "cache-semantic-and-evidence-association-integrity",
    relativePath: "scripts/verify-route-v2-cache-semantic-integrity.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "published-knowledge-semantic-integrity",
    relativePath: "scripts/verify-knowledge-semantic-gate.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "knowledge-coverage-semantics",
    relativePath: "scripts/verify-knowledge-coverage-semantics.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "knowledge-expansion-batch05-integrity",
    relativePath: "scripts/verify-knowledge-expansion-batch05.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "knowledge-expansion-batch05-adversarial-semantics",
    relativePath: "scripts/verify-knowledge-expansion-batch05-adversarial.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "knowledge-expansion-batch05-route-consumption",
    relativePath: "scripts/verify-knowledge-expansion-batch05-route-consumption.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "route-v2-image-coverage-batch05",
    relativePath: "scripts/verify-route-v2-image-coverage-batch05.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "route-v2-image-asset-baseline",
    relativePath: "scripts/verify-route-v2-image-asset-baseline.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "route-v2-image-quality-adversarial",
    relativePath: "scripts/verify-route-v2-image-quality-adversarial.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "route-v2-city-detail-image-fallback",
    relativePath: "scripts/verify-route-v2-city-detail-image-fallback.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "knowledge-expansion-batch05-report-consistency",
    relativePath: "scripts/verify-knowledge-expansion-batch05-report-consistency.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "publication-gate",
    relativePath: "scripts/verify-route-v2-publication-gate.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "search-acceptance-gate",
    relativePath: "scripts/verify-route-v2-search-acceptance-gate.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "fallback-constraint-preservation",
    relativePath: "scripts/verify-route-v2-fallback-constraint-preservation.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "evidence-bundle-lifecycle",
    relativePath: "scripts/verify-route-v2-evidence-3a-foundation.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "candidate-evidence-validation",
    relativePath: "scripts/verify-route-v2-candidate-evidence-validation.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "search-cache-semantic-migration",
    relativePath: "scripts/verify-route-v2-search-cache-semantic-migration.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "cache-baseline-v2",
    relativePath: "scripts/verify-route-v2-cache-baseline-v2.mjs",
    phase: "post-performance",
  }),
  Object.freeze({
    name: "route-summary-quality",
    relativePath: "scripts/verify-route-v2-route-summary-quality.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "image-assets-pilot",
    relativePath: "scripts/verify-route-v2-image-assets-pilot.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "image-proxy-network-boundary",
    relativePath: "scripts/verify-route-v2-image-proxy-network-boundary.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "server-security-boundaries",
    relativePath: "scripts/verify-route-v2-server-security-boundaries.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "neutral-city-placeholder",
    relativePath: "scripts/verify-route-v2-neutral-city-placeholder.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "verifier-lifecycle-and-platform-integrity",
    relativePath: "scripts/verify-route-v2-verifier-lifecycle.mjs",
    phase: "static",
  }),
  Object.freeze({
    name: "intent-performance",
    relativePath: "scripts/verify-route-v2-intent-performance.mjs",
    phase: "performance",
  }),
]);

function outputSummary(value, maximumLength = 2_000) {
  const normalized = String(value || "").trim();
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, maximumLength)}…`;
}

export class MandatoryVerifierStageError extends Error {
  constructor(stageResult) {
    super(`${stageResult.name} failed with exit code ${stageResult.exitCode}`);
    this.name = "MandatoryVerifierStageError";
    this.stageResult = stageResult;
  }
}

export function runMandatoryVerifierStage({
  stage,
  projectRoot,
  env,
  timeoutMs = 240_000,
  spawnImpl = spawnSync,
} = {}) {
  if (!stage?.name || !stage?.relativePath) throw new Error("mandatory-verifier-stage-required");
  const startedAt = performance.now();
  const result = spawnImpl(process.execPath, [stage.relativePath], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
  }) || {};
  const stageResult = {
    name: stage.name,
    relativePath: stage.relativePath,
    command: `node ${stage.relativePath}`,
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    durationMs: Number((performance.now() - startedAt).toFixed(3)),
    stdoutSummary: outputSummary(result.stdout),
    stderrSummary: outputSummary(result.stderr || result.error?.message),
  };
  if (stageResult.exitCode !== 0 || stageResult.signal || result.error) {
    throw new MandatoryVerifierStageError(stageResult);
  }
  return {
    ...stageResult,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

export function publicVerifierStageResult(stageResult = {}) {
  return {
    name: stageResult.name,
    command: stageResult.command,
    exitCode: stageResult.exitCode,
    durationMs: stageResult.durationMs,
    stdoutSummary: stageResult.stdoutSummary,
    stderrSummary: stageResult.stderrSummary,
  };
}
