function boundedFacts(facts, { includeExtract = true, includeSourceText = true } = {}) {
  const extract = String(facts.extract || "")
    .replace(/[^\u3400-\u9fffA-Za-z0-9\s.,;:!?'"()/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    source: includeSourceText ? facts.source : { name: facts.source?.name || "Wikivoyage" },
    sourceTitle: includeSourceText ? facts.sourceTitle : "",
    extract: includeExtract ? extract.slice(0, 1800) : "",
    categories: includeSourceText ? (facts.categories || []).slice(0, 30) : [],
    countryEntities: facts.countryEntities || [],
    destinationEntities: facts.destinationEntities || [],
    durationEvidence: facts.durationEvidence || null,
    seasonEvidence: facts.seasonEvidence || null,
    themesEvidence: facts.themesEvidence || [],
  };
}

function promptForFacts(facts, options) {
  return `基于 evidence 生成有地理信息的简体中文路线标题和简介。展示文字必须全部为自然简体中文，不得夹杂英文单词、日文假名或繁体字。不得添加 evidence 中不存在的国家、城市、景点或交通线。禁止数字后缀、泛化标题和模板推荐语。recommendationText 不得以“适合”开头，必须直接说明这条路线为何值得体验。返回 JSON：title、summary、recommendationText 为简体中文；countryIds 只能复制 evidence 中的 wikidataId；destinationIds 必须从 evidence 复制3-8个主要目的地 wikidataId；themes 为简体中文数组；recommendedDays 必须包含“天”，格式为“10天”或“10-14天”；bestMonths 必须为至少一个明确月份区间数组（如 3-5月、10-11月），可依据 evidence 中国家和目的地的地理气候推断，禁止空值、全年或季节灵活；highlights 为3-5条简体中文事实亮点。\nevidence=${JSON.stringify(boundedFacts(facts, options))}`;
}

export function buildTextEnrichmentMessages(facts, options = { includeExtract: true }) {
  return [
    { role: "system", content: "你是旅行路线中文内容标准化器。只能整理证据，不得补造事实。返回严格 JSON。" },
    { role: "user", content: promptForFacts(facts, options) },
  ];
}

export function textEnrichmentRequestBody({ model, messages }) {
  return { model, response_format: { type: "json_object" }, temperature: 0.2, messages };
}

export function suggestionIssues(suggestion, facts) {
  const issues = [];
  const disabledCountryCodes = new Set(["CN"]);
  const countryIds = new Set((facts.countryEntities || []).map((item) => item.wikidataId));
  const destinationEntities = facts.destinationEntities || [];
  const destinationIds = new Set(destinationEntities.map((item) => item.wikidataId));
  const selectedCountryIds = new Set(suggestion.countryIds || []);
  const selectedCountryCodes = new Set((facts.countryEntities || [])
    .filter((item) => selectedCountryIds.has(item.wikidataId))
    .map((item) => item.countryCode)
    .filter(Boolean));
  const copy = [suggestion.title, suggestion.summary, suggestion.recommendationText, ...(suggestion.themes || []), ...(suggestion.highlights || [])].join(" ");
  const englishTerms = copy.match(/[A-Za-z]{3,}/gu) || [];
  if (!(suggestion.countryIds || []).length) issues.push("missing-countryIds");
  if (!(suggestion.countryIds || []).every((id) => countryIds.has(id))) issues.push("unsupported-countryIds");
  if ((facts.countryEntities || []).some((item) => selectedCountryIds.has(item.wikidataId) && disabledCountryCodes.has(item.countryCode))) issues.push("disabled-country");
  if ((suggestion.destinationIds || []).length < 3 || (suggestion.destinationIds || []).length > 8) issues.push("destinationIds-count");
  if (!(suggestion.destinationIds || []).every((id) => destinationIds.has(id))) issues.push("unsupported-destinationIds");
  if ((suggestion.destinationIds || []).some((id) => disabledCountryCodes.has(destinationEntities.find((item) => item.wikidataId === id)?.countryCode))) issues.push("disabled-destination-country");
  if (!(suggestion.destinationIds || []).every((id) => {
    const destination = destinationEntities.find((item) => item.wikidataId === id);
    return selectedCountryIds.has(destination?.countryWikidataId) || selectedCountryCodes.has(destination?.countryCode);
  })) issues.push("destination-country-outside-route");
  if (!/[\u3400-\u9fff]/u.test(copy)) issues.push("missing-chinese-copy");
  if (englishTerms.length) issues.push(`english-copy:${[...new Set(englishTerms)].slice(0, 5).join(",")}`);
  if (/[\u3040-\u30ff]/u.test(copy)) issues.push("japanese-kana-copy");
  if (/^适合/u.test(String(suggestion.recommendationText || "").trim())) issues.push("template-recommendation");
  if (!/^约?\d+(?:-\d+)?天$/u.test(String(suggestion.recommendedDays || "").trim())) issues.push("invalid-recommendedDays");
  if (!(suggestion.bestMonths || []).length) issues.push("missing-bestMonths");
  if ((suggestion.highlights || []).length < 3) issues.push("missing-highlights");
  return issues;
}

export function parseTextEnrichmentSuggestion(content, facts) {
  let suggestion;
  try { suggestion = JSON.parse(content); } catch { throw new Error("TEXT_ENRICHMENT_INVALID_JSON"); }
  const issues = suggestionIssues(suggestion, facts);
  const allowedCountries = (facts.countryEntities || []).map((item) => `${item.wikidataId}:${item.name}`).join("、");
  const allowedDestinations = (facts.destinationEntities || []).map((item) => `${item.wikidataId}:${item.name}`).join("、");
  return {
    suggestion,
    issues,
    repairPrompt: `上次输出不合格：${issues.join("、")}。只能使用 evidence 白名单中的实体 ID：countryIds 仅可从 [${allowedCountries}] 逐字复制；destinationIds 仅可从 [${allowedDestinations}] 选择3-8个并逐字复制。所有展示文案必须为简体中文，英文词必须翻译成中文表达，不得原样保留；推荐语不得以‘适合’开头，天数必须带‘天’。请仅返回修正后的 JSON。`,
  };
}

export { boundedFacts, promptForFacts };
