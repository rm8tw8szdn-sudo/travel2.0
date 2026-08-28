const SHA256 = /^[0-9a-f]{64}$/u;
const QID = /^Q\d+$/u;
const PLACEHOLDER_TEXT = /^(?:unknown|n\/?a|none|todo|tbd|-)$/iu;
const NON_AUTHOR_TEXT = /^(?:(?:wikimedia commons|wikipedia)$|(?:unknown(?:\s+author)?|anonymous|no machine-readable author provided|no author provided|author not provided)(?:\.|\s|$))/iu;

function text(value) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim() : "";
}

export function meaningfulText(value) {
  const normalized = text(value);
  return Boolean(normalized) && !PLACEHOLDER_TEXT.test(normalized);
}

export function meaningfulCreator(value) {
  const normalized = text(value);
  return meaningfulText(normalized) && !NON_AUTHOR_TEXT.test(normalized);
}

export function attributionRequiredForLicense(license) {
  return /^CC BY(?:-SA)?(?:\s|$)/iu.test(text(license));
}

export function canonicalLicenseUrl(license, sourceUrl = "") {
  const label = text(license);
  if (/^CC0(?:\s+1\.0)?$/iu.test(label)) return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (/^Public Domain Mark(?:\s+1\.0)?$/iu.test(label)) return "https://creativecommons.org/publicdomain/mark/1.0/";
  if (/^Public domain$/iu.test(label)) {
    const source = text(sourceUrl).replace(/#.*$/u, "");
    return source ? `${source}#Licensing` : null;
  }
  const match = label.match(/^CC\s+(BY(?:-SA)?)\s+(\d+\.\d+)(?:\s+([a-z]{2,3}))?$/iu);
  if (!match) return null;
  const family = match[1].toLocaleLowerCase("en-US");
  const version = match[2];
  const jurisdiction = match[3]?.toLocaleLowerCase("en-US");
  return `https://creativecommons.org/licenses/${family}/${version}/${jurisdiction ? `${jurisdiction}/` : ""}`;
}

function comparableUrl(value) {
  try {
    const url = new URL(text(value));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.protocol = "https:";
    url.hostname = url.hostname.toLocaleLowerCase("en-US");
    if (url.pathname !== "/" && !url.pathname.endsWith("/")) url.pathname += "/";
    return url.href;
  } catch {
    return null;
  }
}

export function licenseUrlMatches(license, licenseUrl, sourceUrl) {
  const expected = canonicalLicenseUrl(license, sourceUrl);
  const actual = comparableUrl(licenseUrl);
  if (!expected || !actual) return false;
  return actual === comparableUrl(expected);
}

function issue(field, code) {
  return { field, code };
}

export function auditImageProvenance(record) {
  const errors = [];
  const requiredText = [
    "entityId", "wikidataId", "entityType", "assetPath", "localAssetPath", "sourceUrl", "sourcePlatform",
    "license", "licenseUrl", "sourceHash", "processedHash", "acquisitionDate",
    "originalFilename", "verificationStatus", "usageStatus",
  ];
  for (const field of requiredText) {
    if (!meaningfulText(record?.[field])) errors.push(issue(field, "required-value-missing"));
  }
  if (!QID.test(text(record?.wikidataId))) errors.push(issue("wikidataId", "qid-invalid"));
  if (!text(record?.assetPath).startsWith("assets/route-v2-images/")) errors.push(issue("assetPath", "dedicated-local-path-invalid"));
  if (text(record?.localAssetPath) !== text(record?.assetPath)) errors.push(issue("localAssetPath", "local-asset-path-mismatch"));
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/u.test(text(record?.sourceUrl))) errors.push(issue("sourceUrl", "canonical-commons-file-url-required"));
  if (text(record?.sourcePlatform) !== "Wikimedia Commons") errors.push(issue("sourcePlatform", "canonical-source-platform-required"));
  if (!SHA256.test(text(record?.sourceHash))) errors.push(issue("sourceHash", "sha256-invalid"));
  if (!SHA256.test(text(record?.processedHash))) errors.push(issue("processedHash", "sha256-invalid"));
  if (record?.status !== "imageReady") errors.push(issue("status", "verified-dedicated-status-required"));
  if (record?.visualAuditStatus !== "passed") errors.push(issue("visualAuditStatus", "visual-audit-pass-required"));
  if (record?.usageStatus !== "approved-local-runtime") errors.push(issue("usageStatus", "approved-local-runtime-required"));
  if (!licenseUrlMatches(record?.license, record?.licenseUrl, record?.sourceUrl)) errors.push(issue("licenseUrl", "license-family-version-url-mismatch"));
  if (comparableUrl(record?.licenseUrl) === comparableUrl(record?.sourceUrl)) errors.push(issue("licenseUrl", "source-url-cannot-be-license-url"));

  const requiresAttribution = attributionRequiredForLicense(record?.license);
  const creator = record?.creator || record?.author;
  if (requiresAttribution) {
    if (!meaningfulCreator(creator)) errors.push(issue("creator", "attribution-license-creator-required"));
    if (!meaningfulText(record?.attribution)) errors.push(issue("attribution", "attribution-license-credit-required"));
  } else if (!meaningfulCreator(creator) && record?.creatorStatus !== "not-provided-by-source") {
    errors.push(issue("creatorStatus", "non-attribution-missing-creator-status-required"));
  }

  const rights = record?.rights;
  if (!rights || typeof rights !== "object") {
    errors.push(issue("rights", "rights-object-required"));
  } else {
    if (text(rights.sourceUrl) !== text(record.sourceUrl)) errors.push(issue("rights.sourceUrl", "rights-source-mismatch"));
    if (text(rights.license) !== text(record.license)) errors.push(issue("rights.license", "rights-license-mismatch"));
    if (!licenseUrlMatches(rights.license, rights.licenseUrl, rights.sourceUrl)) errors.push(issue("rights.licenseUrl", "rights-license-url-mismatch"));
    if (requiresAttribution) {
      if (!meaningfulCreator(rights.author)) errors.push(issue("rights.author", "rights-author-required"));
      if (!meaningfulText(rights.attribution)) errors.push(issue("rights.attribution", "rights-attribution-required"));
      if (text(rights.author) !== text(creator)) errors.push(issue("rights.author", "rights-author-mismatch"));
      if (text(rights.attribution) !== text(record.attribution)) errors.push(issue("rights.attribution", "rights-attribution-mismatch"));
    } else if (!meaningfulCreator(creator) && rights.creatorStatus !== "not-provided-by-source") {
      errors.push(issue("rights.creatorStatus", "rights-missing-creator-status-required"));
    }
    if (rights.externalCopyrightMaterial !== true) errors.push(issue("rights.externalCopyrightMaterial", "external-copyright-marker-required"));
  }

  return {
    valid: errors.length === 0,
    errors,
    requiresAttribution,
    creatorComplete: requiresAttribution ? meaningfulCreator(creator) : meaningfulCreator(creator) || record?.creatorStatus === "not-provided-by-source",
    attributionComplete: requiresAttribution ? meaningfulText(record?.attribution) : true,
    licenseUrlComplete: licenseUrlMatches(record?.license, record?.licenseUrl, record?.sourceUrl),
  };
}

export function auditProvenanceCollection(records) {
  const audited = records.map((record) => ({ record, result: auditImageProvenance(record) }));
  const attributionRecords = audited.filter((entry) => entry.result.requiresAttribution);
  return {
    total: audited.length,
    valid: audited.filter((entry) => entry.result.valid).length,
    invalid: audited.filter((entry) => !entry.result.valid).map((entry) => ({
      entityId: entry.record.entityId,
      wikidataId: entry.record.wikidataId,
      canonicalNameEn: entry.record.canonicalNameEn,
      errors: entry.result.errors,
    })),
    attributionRequired: attributionRecords.length,
    creatorCompleteWhereRequired: attributionRecords.filter((entry) => entry.result.creatorComplete).length,
    attributionCompleteWhereRequired: attributionRecords.filter((entry) => entry.result.attributionComplete).length,
    licenseUrlComplete: audited.filter((entry) => entry.result.licenseUrlComplete).length,
  };
}
