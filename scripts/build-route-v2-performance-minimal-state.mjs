import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? path.resolve(String(process.argv[index + 1] || "")) : "";
}

const baselineRoot = option("baseline");
const currentRoot = option("current");
const outputRoot = option("output");
assert(baselineRoot && currentRoot && outputRoot, "--baseline, --current, and --output are required");
assert.equal(path.resolve(baselineRoot), path.resolve(outputRoot), "output must be the extracted baseline state");

const changed = new Set();
const baselineContentByPath = new Map();

function filePath(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function read(root, relativePath) {
  return fs.readFileSync(filePath(root, relativePath), "utf8").replaceAll("\r\n", "\n");
}

function write(relativePath, content) {
  if (!baselineContentByPath.has(relativePath)) {
    baselineContentByPath.set(relativePath, read(outputRoot, relativePath));
  }
  fs.writeFileSync(filePath(outputRoot, relativePath), content, "utf8");
  changed.add(relativePath);
}

function replaceOnce(text, before, after, label) {
  const index = text.indexOf(before);
  assert(index >= 0, `missing baseline snippet: ${label}`);
  assert.equal(text.indexOf(before, index + before.length), -1, `ambiguous baseline snippet: ${label}`);
  return `${text.slice(0, index)}${after}${text.slice(index + before.length)}`;
}

function functionBlock(text, marker) {
  const start = text.indexOf(marker);
  assert(start >= 0, `missing function marker: ${marker}`);
  const signatureTail = text.slice(start).match(/\)\s*\{/u);
  const opening = signatureTail ? start + signatureTail.index + signatureTail[0].lastIndexOf("{") : -1;
  assert(opening >= 0, `missing function body: ${marker}`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = opening; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function: ${marker}`);
}

function replaceFunctionFromCurrent(relativePath, marker) {
  const baseline = read(outputRoot, relativePath);
  const current = read(currentRoot, relativePath);
  const before = functionBlock(baseline, marker);
  const after = functionBlock(current, marker);
  write(relativePath, replaceOnce(baseline, before, after, `${relativePath}:${marker}`));
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

write(
  "src/lib/routes/content-quality.mjs",
  read(currentRoot, "src/lib/routes/content-quality.mjs"),
);

{
  const relativePath = "src/lib/routes/route-candidate-builder.mjs";
  let text = read(outputRoot, relativePath);
  text = replaceOnce(
    text,
    "  const stableRequired = stableSortDestinations(required, `${seed}:required`);\n  const orders = [",
    `  const stableRequired = stableSortDestinations(required, \`\${seed}:required\`);
  if (required.length === 2) {
    return [
      { method: "required-flexible-balanced", candidateVariant: "balanced", destinations: required },
      { method: "required-flexible-low-transfer", candidateVariant: "low-transfer", destinations: stableRequired },
      { method: "required-flexible-depth", candidateVariant: "depth", destinations: [...required].reverse() },
    ];
  }
  const orders = [`,
    "two-required-destination variants",
  );
  text = replaceOnce(
    text,
    `  const sequences = requiredConstraint.ids.length
    ? requiredCandidateSequences(normalizedPool, maxDestinations, candidateSeed, requiredConstraint)
    : candidateSequences(normalizedPool, maxDestinations, candidateSeed);`,
    `  const sequences = requiredConstraint.ids.length
    ? requiredCandidateSequences(normalizedPool, maxDestinations, candidateSeed, requiredConstraint)
    : normalizedPool.length === 2
      ? [
          { method: "two-destination-balanced", candidateVariant: "balanced", destinations: normalizedPool },
          { method: "two-destination-low-transfer", candidateVariant: "low-transfer", destinations: stableSortDestinations(normalizedPool, \`\${candidateSeed}:two-destination\`) },
          { method: "two-destination-depth", candidateVariant: "depth", destinations: [...normalizedPool].reverse() },
        ]
      : candidateSequences(normalizedPool, maxDestinations, candidateSeed);`,
    "two-destination pool variants",
  );
  write(relativePath, text);
}

replaceFunctionFromCurrent(
  "src/lib/routes/route-destination-suggestion.mjs",
  "function buildCountryEntries(",
);

{
  const relativePath = "src/lib/routes/route-destination-suggestion.mjs";
  let text = read(outputRoot, relativePath);
  text = replaceOnce(
    text,
    `  if (intent.intentMode !== "destination-suggestion" || !intent.canGenerate) {
    return { ready: false, reason: "destination-suggestion-not-requested", suggestion: null };
  }
  const normalizedSessionId = clean(sessionId) || \`intent:\${clean(intent.intentHash)}\`;
  const seed = stableHash({ sessionId: normalizedSessionId, intentHash: clean(intent.intentHash), mode: intent.intentMode });
  let entries = buildCountryEntries({ intent, acceptedRoutes, intentCatalog });`,
    `  const requiredDestinationIds = unique(intent.requiredDestinationIds || []);
  const explicitCountryCodes = unique([
    ...(Array.isArray(intent.countryCodes) ? intent.countryCodes : []),
    intent.countryCode,
  ].map((code) => clean(code).toUpperCase()).filter((code) => /^[A-Z]{2}$/u.test(code)));
  const destinationSuggestionMode = intent.intentMode === "destination-suggestion";
  const countryScopedSuggestionMode = intent.intentMode === "specified-destination"
    && requiredDestinationIds.length === 0
    && explicitCountryCodes.length > 0;
  if ((!destinationSuggestionMode && !countryScopedSuggestionMode) || !intent.canGenerate) {
    return { ready: false, reason: "destination-suggestion-not-requested", suggestion: null };
  }
  const normalizedSessionId = clean(sessionId) || \`intent:\${clean(intent.intentHash)}\`;
  const suggestionMode = countryScopedSuggestionMode
    ? "country-scoped-destination-suggestion"
    : "destination-suggestion";
  const seed = stableHash({ sessionId: normalizedSessionId, intentHash: clean(intent.intentHash), mode: suggestionMode });
  let entries = buildCountryEntries({
    intent,
    acceptedRoutes,
    intentCatalog,
    minimumDestinationCountOverride: countryScopedSuggestionMode ? 2 : null,
  });
  if (countryScopedSuggestionMode) {
    const allowedCountryCodes = new Set(explicitCountryCodes);
    entries = entries.filter((entry) => allowedCountryCodes.has(entry.countryCode));
  }`,
    "country-scoped destination suggestion",
  );
  text = replaceOnce(
    text,
    '    mode: "destination-suggestion",',
    "    mode: suggestionMode,",
    "suggestion mode",
  );
  write(relativePath, text);
}

{
  const relativePath = "src/lib/routes/search-intent-parser.mjs";
  let text = read(outputRoot, relativePath);
  text = replaceOnce(
    text,
    "    || /先.+(?:然后|再去|再到).+(?:最后|然后|再去|再到)/u.test(query)",
    "    || /先.+(?:然后|再(?:去|到)?).+(?:最后|然后|再(?:去|到)?)/u.test(query)",
    "bare-zai fixed-order syntax",
  );
  text = replaceOnce(
    text,
    `  const timeIntent = timeIntentEnabled ? parseTimeIntent(rawQuery) : null;
  const intent = {`,
    `  const timeIntent = timeIntentEnabled ? parseTimeIntent(rawQuery) : null;
  const countryCodes = unique([
    ...(matchedCountry?.code ? [matchedCountry.code] : []),
    ...matchedCities.map((item) => item.countryCode),
  ].map((code) => clean(code).toUpperCase()).filter(Boolean));
  const intent = {`,
    "country codes calculation",
  );
  text = replaceOnce(
    text,
    `    countryCode: matchedCountry?.code || "",
    country: matchedCountry?.label || "",`,
    `    countryCode: matchedCountry?.code || "",
    countryCodes,
    country: matchedCountry?.label || "",`,
    "country codes field",
  );
  write(relativePath, text);
}

{
  const relativePath = "src/lib/routes/route-search-service.mjs";
  let text = read(outputRoot, relativePath);
  text = replaceOnce(
    text,
    'import { buildSearchGeneratedFallbackRoute } from "./search-generated-route-builder.mjs";',
    `import { buildSearchGeneratedFallbackRoute } from "./search-generated-route-builder.mjs";
import { stableHash } from "./route-v2-utils.mjs";`,
    "stable hash import",
  );
  text = replaceOnce(
    text,
    `  const suggested = destinationSuggestion && typeof destinationSuggestion === "object" ? destinationSuggestion : null;
  const countryCode = suggested?.countryCode || intent.countryCode;`,
    `  const suggested = destinationSuggestion && typeof destinationSuggestion === "object" ? destinationSuggestion : null;
  const rawQueryFingerprint = stableHash({ rawQuery: clean(intent.rawQuery) }).slice(0, 12);
  const countryCode = suggested?.countryCode || intent.countryCode;`,
    "raw query fingerprint",
  );
  text = replaceOnce(
    text,
    `  const normalizedCities = suggested?.normalizedCities || (Array.isArray(intent.normalizedCities) ? intent.normalizedCities : []);
  const travelStyle =`,
    `  const normalizedCities = suggested?.normalizedCities || (Array.isArray(intent.normalizedCities) ? intent.normalizedCities : []);
  const countryCodes = suggested
    ? [countryCode].filter(Boolean)
    : unique([...(intent.countryCodes || []), countryCode].filter(Boolean));
  const travelStyle =`,
    "planner country codes",
  );
  text = replaceOnce(
    text,
    "    intentId: suggested ? `${intent.intentHash}-${suggested.seed.slice(0, 12)}` : intent.intentHash,",
    "    intentId: suggested ? `${intent.intentHash}-${suggested.seed.slice(0, 12)}-${rawQueryFingerprint}` : intent.intentHash,",
    "physical planner intent identity",
  );
  text = replaceOnce(
    text,
    `    country: countryCode,
    countryCode,
    countryName,`,
    `    country: countryCode,
    countryCode,
    countries: [...countryCodes],
    countryCodes: [...countryCodes],
    countryName,`,
    "planner country constraint",
  );
  text = replaceOnce(
    text,
    `    const destinationSuggestionResult = intent.intentMode === "destination-suggestion"
      ? buildRouteDestinationSuggestion({`,
    `    const countryScopedDestinationSuggestion = intent.intentMode === "specified-destination"
      && !(intent.requiredDestinationIds || []).length
      && (intent.countryCodes || []).length > 0;
    const destinationSuggestionResult = (
      intent.intentMode === "destination-suggestion"
      || countryScopedDestinationSuggestion
    )
      ? buildRouteDestinationSuggestion({`,
    "country-scoped planner entry",
  );
  text = replaceOnce(
    text,
    `    const destinationSuggestionMode = intent.intentMode === "destination-suggestion";
    const plannerEligible = intent.canGenerate && (!destinationSuggestionMode || Boolean(destinationSuggestion));
    const cacheIntent = destinationSuggestion
      ? {
        ...intent,
        intentHash: \`\${intent.intentHash}-\${destinationSuggestion.seed.slice(0, 12)}\`,
        intentKey: \`\${intent.intentKey}|session:\${destinationSuggestion.seed.slice(0, 12)}\`,
      }
      : intent;`,
    `    const destinationSuggestionMode = intent.intentMode === "destination-suggestion";
    const plannerEligible = intent.canGenerate && (!destinationSuggestionMode || Boolean(destinationSuggestion));
    const cacheRawQueryFingerprint = stableHash({ rawQuery: clean(intent.rawQuery) }).slice(0, 12);
    const cacheIntent = destinationSuggestion
      ? {
        ...intent,
        intentHash: \`\${intent.intentHash}-\${destinationSuggestion.seed.slice(0, 12)}-\${cacheRawQueryFingerprint}\`,
        intentKey: \`\${intent.intentKey}|session:\${destinationSuggestion.seed.slice(0, 12)}|query:\${cacheRawQueryFingerprint}\`,
      }
      : intent;`,
    "raw-query-isolated search cache",
  );
  write(relativePath, text);
}

{
  const relativePath = "src/lib/routes/route-composition-planner.mjs";
  let text = read(outputRoot, relativePath);
  text = replaceOnce(
    text,
    `  const suggestionIds = new Set(
    Array.isArray(context.destinationSuggestion?.destinationIds)
      ? context.destinationSuggestion.destinationIds.map(clean).filter(Boolean)
      : [],
  );
  const suggestionPool = suggestionIds.size
    ? rawPool.filter((destination) => destinationIdentityKeys(destination).some((key) => suggestionIds.has(key)))
    : [];
  const pool = suggestionPool.length >= ROUTE_CANDIDATE_SELECTION_TARGET ? suggestionPool : rawPool;`,
    `  const entityPool = rawPool.filter((destination) => clean(destination.destinationSource) === "knowledge-entity-layer");
  const requiredIds = new Set(
    Array.isArray(context.requiredDestinationIds)
      ? context.requiredDestinationIds.map(clean).filter(Boolean)
      : [],
  );
  const entityKeys = new Set(entityPool.flatMap((destination) => destinationIdentityKeys(destination)));
  const entityPoolCoversRequired = [...requiredIds].every((id) => entityKeys.has(id));
  const groundedPool = entityPool.length >= 2 && entityPoolCoversRequired ? entityPool : rawPool;
  const suggestionIds = new Set(
    Array.isArray(context.destinationSuggestion?.destinationIds)
      ? context.destinationSuggestion.destinationIds.map(clean).filter(Boolean)
      : [],
  );
  const suggestionPool = suggestionIds.size
    ? groundedPool.filter((destination) => destinationIdentityKeys(destination).some((key) => suggestionIds.has(key)))
    : [];
  const pool = suggestionPool.length >= 2 ? suggestionPool : groundedPool;`,
    "entity-grounded two-city pool",
  );
  text = replaceOnce(
    text,
    '    const strictSuggestionCapacity = context?.intentMode === "destination-suggestion"',
    "    const strictSuggestionCapacity = context?.destinationSuggestion",
    "country-scoped suggestion capacity",
  );
  text = replaceOnce(
    text,
    '      const suggestionShape = (candidate) => JSON.stringify([...(candidate.proposedOrder || [])].sort());',
    `      const suggestionShape = (candidate) => JSON.stringify({
        destinations: [...(candidate.proposedOrder || [])].sort(),
        variant: clean(candidate.candidateVariant || ""),
      });`,
    "candidate variant shape",
  );
  const current = read(currentRoot, relativePath);
  const literaryFunction = functionBlock(current, "function plannerLiteraryTravelValue(");
  text = replaceOnce(
    text,
    "// 候选 record 构造（sourceType = planner-designed，绕过 composition-validator 旧桶校验）",
    `${literaryFunction}

// 候选 record 构造（sourceType = planner-designed，绕过 composition-validator 旧桶校验）`,
    "literary route summary function",
  );
  text = replaceOnce(
    text,
    `  const displayTravelValue = concept.travelStyle === "classic-first-trip"
    ? \`在给定天数内保留\${places.length}个目的地之间的顺路关系和清晰主题。\`
    : concept.travelValue;`,
    `  const displayTravelValue = plannerLiteraryTravelValue({
    countryEntities,
    destinationEntities,
    concept,
  });`,
    "literary route summary selection",
  );
  text = replaceOnce(
    text,
    "  const quality = validateRouteContent(record);",
    `  const suggestedDestinationCount = Array.isArray(context?.destinationSuggestion?.destinationIds)
    ? context.destinationSuggestion.destinationIds.length
    : 0;
  const quality = validateRouteContent(record, {
    minimumDestinations: suggestedDestinationCount > 0
      ? Math.min(2, suggestedDestinationCount)
      : null,
  });`,
    "two-city content quality",
  );
  write(relativePath, text);
}

const inventory = [...changed].sort().map((relativePath) => {
  const baseline = baselineContentByPath.get(relativePath) || read(baselineRoot, relativePath);
  const output = read(outputRoot, relativePath);
  return {
    path: relativePath,
    baselineSha256: sha256(baseline),
    outputSha256: sha256(output),
    currentSha256: sha256(read(currentRoot, relativePath)),
    equalsCurrent: output === read(currentRoot, relativePath),
  };
});

process.stdout.write(`${JSON.stringify({
  state: "C-minimal-current-fixes",
  baselineRoot,
  currentRoot,
  outputRoot,
  changedFiles: inventory,
}, null, 2)}\n`);
