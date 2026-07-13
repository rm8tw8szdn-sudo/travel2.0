import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function emptyGroup() {
  return {
    total: 0,
    missingCover: 0,
    missingCoverLicense: 0,
    invalidCoverDimensions: 0,
    issueIds: [],
  };
}

function validCoverDimensions(asset = {}) {
  const width = Number(asset.width);
  const height = Number(asset.height);
  const ratio = width / height;
  if (asset.discoveredVia === "route-banner") {
    return width >= 1200 && height >= 180 && ratio >= 3 && ratio <= 10;
  }
  return width >= 800 && height >= 450 && ratio >= 1.2 && ratio <= 2.2;
}

function addIssue(group, recordId) {
  if (group.issueIds.length < 20) group.issueIds.push(recordId);
}

export function auditAcceptedRouteMediaPayload(payload = {}) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const summary = {
    total: records.length,
    missingCover: 0,
    missingCoverLicense: 0,
    invalidCoverDimensions: 0,
    plannerDesignedMissingLicense: 0,
    bySourceType: {},
  };

  for (const record of records) {
    const sourceType = String(record?.sourceType || "unknown");
    const group = summary.bySourceType[sourceType] || emptyGroup();
    summary.bySourceType[sourceType] = group;
    group.total += 1;

    const cover = record?.coverAsset;
    const id = String(record?.id || "(missing-id)");
    if (!cover?.imageUrl) {
      summary.missingCover += 1;
      group.missingCover += 1;
      addIssue(group, id);
      continue;
    }
    if (!cover.author || !cover.license) {
      summary.missingCoverLicense += 1;
      group.missingCoverLicense += 1;
      if (sourceType === "planner-designed") summary.plannerDesignedMissingLicense += 1;
      addIssue(group, id);
    }
    if (!validCoverDimensions(cover)) {
      summary.invalidCoverDimensions += 1;
      group.invalidCoverDimensions += 1;
      addIssue(group, id);
    }
  }

  summary.issueCount = summary.missingCover + summary.missingCoverLicense + summary.invalidCoverDimensions;
  return summary;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const defaultPath = path.resolve(".route-v2-cache", "accepted-routes.json");
  const inputPath = path.resolve(argValue("--input", defaultPath));
  const failOnIssues = process.argv.includes("--fail-on-issues");
  const jsonOutput = process.argv.includes("--json");
  const summary = auditAcceptedRouteMediaPayload(readJson(inputPath));
  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Accepted route media audit: ${summary.total} records, ${summary.issueCount} issues`);
    console.log(JSON.stringify(summary.bySourceType, null, 2));
    if (summary.plannerDesignedMissingLicense === 0) {
      console.log("planner-designed cover licensing: OK");
    } else {
      console.log(`planner-designed cover licensing: ${summary.plannerDesignedMissingLicense} missing`);
    }
  }
  if (failOnIssues && summary.issueCount > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
