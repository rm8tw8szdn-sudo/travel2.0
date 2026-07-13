import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GOLD_CASES } from "../src/lib/routes/route-gold-cases.mjs";
import { TRAVEL_STYLE_LABEL } from "../src/lib/routes/route-planning-concept.mjs";

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  if (value) return value.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function clean(value) {
  return String(value || "").trim();
}

function asCountryCodes(country) {
  return clean(country)
    .split(/[\/,|]/u)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function durationBandForDays(days) {
  const n = Number(days) || 0;
  if (n <= 0) return "";
  if (n <= 3) return "1-3d";
  if (n <= 6) return "4-6d";
  if (n <= 10) return "7-10d";
  if (n <= 14) return "10-14d";
  return "15d+";
}

function parseDays(record = {}) {
  const direct = Number(record.durationDays);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  const text = clean(record.recommendedDays);
  const range = text.match(/(\d+)\s*-\s*(\d+)/u);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  const single = text.match(/(\d+)/u);
  return single ? Number(single[1]) : 0;
}

function recordCountryCodes(record = {}) {
  const codes = [
    ...(record.countries || []),
    ...(record.countryEntities || []).map((item) => item.countryCode),
    ...(record.destinationEntities || []).map((item) => item.countryCode),
  ];
  return [...new Set(codes.map((code) => clean(code).toUpperCase()).filter(Boolean))];
}

function recordTravelStyles(record = {}) {
  return [
    record.travelStyle,
    record.travelStyleConceptKey,
    record.travelStyleLabel,
    record.concept?.travelStyle,
    record.concept?.travelStyleLabel,
    ...(record.designStrategies || []),
    ...(record.tags || []),
    ...(record.themes || []),
  ].map(clean).filter(Boolean);
}

export function goldCaseCells(goldCases = GOLD_CASES) {
  return goldCases.map((goldCase) => {
    const countries = asCountryCodes(goldCase.country);
    return {
    id: goldCase.id,
    country: countries.join("/"),
    countries,
    travelStyle: goldCase.travelStyleConceptKey || "classic-first-trip",
    travelStyleLabel: goldCase.travelStyle || TRAVEL_STYLE_LABEL[goldCase.travelStyleConceptKey] || "",
    durationDays: Number(goldCase.durationDays) || 8,
    durationBand: goldCase.durationBand || durationBandForDays(goldCase.durationDays),
    expectedDestinations: goldCase.expected?.destinations || [],
  };
  }).filter((cell) => cell.countries.length);
}

function styleMatches(styles, cell) {
  return styles.includes(cell.travelStyle) || styles.includes(cell.travelStyleLabel);
}

function recordDestinationNames(record = {}) {
  return [
    ...(record.destinations || []),
    ...(record.destinationEntities || []).map((item) => item.name),
  ].map(clean).filter(Boolean);
}

function destinationOverlapPass(record, cell) {
  const expected = (cell.expectedDestinations || []).map(clean).filter(Boolean);
  if (!expected.length) return true;
  const actual = new Set(recordDestinationNames(record));
  const hits = expected.filter((name) => actual.has(name)).length;
  return hits / expected.length >= 0.6;
}

function strictMatchesCell(record, cell) {
  const countries = recordCountryCodes(record);
  if (!(cell.countries || asCountryCodes(cell.country)).every((country) => countries.includes(country))) return false;
  if (!styleMatches(recordTravelStyles(record), cell)) return false;
  if (!destinationOverlapPass(record, cell)) return false;
  const recordBand = record.durationBand || record.concept?.durationBand || durationBandForDays(parseDays(record));
  return !cell.durationBand || recordBand === cell.durationBand;
}

function looseMatchesCell(record, cell) {
  const countries = recordCountryCodes(record);
  if (!(cell.countries || asCountryCodes(cell.country)).some((country) => countries.includes(country))) return false;
  if (styleMatches(recordTravelStyles(record), cell)) return true;
  const days = parseDays(record);
  return days && Math.abs(days - cell.durationDays) <= 1;
}

function readRecords(storagePath) {
  if (!fs.existsSync(storagePath)) return [];
  const payload = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  return Array.isArray(payload?.records) ? payload.records : [];
}

export function createPlannerCoverageMatrixReport({ storagePath }) {
  const records = readRecords(storagePath);
  const cells = goldCaseCells();
  const rows = cells.map((cell) => {
    const strict = records.filter((record) => strictMatchesCell(record, cell));
    const loose = records.filter((record) => looseMatchesCell(record, cell));
    const countryCount = records.filter((record) => {
      const countries = recordCountryCodes(record);
      return (cell.countries || asCountryCodes(cell.country)).some((country) => countries.includes(country));
    }).length;
    return {
      ...cell,
      strictCount: strict.length,
      looseCount: loose.length,
      countryCount,
      sampleIds: strict.slice(0, 3).map((record) => record.id || record.name).filter(Boolean),
    };
  });
  const missingStrict = rows.filter((row) => row.strictCount === 0);
  const missingLoose = rows.filter((row) => row.looseCount === 0);
  return {
    ok: missingStrict.length === 0,
    generatedAt: new Date().toISOString(),
    storagePath,
    totalRecords: records.length,
    totals: {
      cells: rows.length,
      strictCovered: rows.length - missingStrict.length,
      looseCovered: rows.length - missingLoose.length,
      strictMissing: missingStrict.length,
      looseMissing: missingLoose.length,
    },
    cells: rows,
    missingStrict,
    missingLoose,
    suggestedPlannerContexts: missingStrict.map((row) => ({
      country: row.country,
      countries: row.countries,
      countryCode: row.country,
      travelStyle: row.travelStyle,
      durationDays: row.durationDays,
    })),
  };
}

function printTable(report) {
  const lines = [
    `Planner coverage matrix: ${report.totals.strictCovered}/${report.totals.cells} strict cells covered (${report.totalRecords} accepted records)`,
    "country  style                 band     strict  loose  country  goldCase",
    ...report.cells.map((row) => [
      row.country.padEnd(7),
      row.travelStyle.padEnd(21),
      row.durationBand.padEnd(8),
      String(row.strictCount).padStart(6),
      String(row.looseCount).padStart(6),
      String(row.countryCount).padStart(7),
      row.id,
    ].join(" ")),
  ];
  console.log(lines.join("\n"));
}

const defaultStorage = path.basename(process.cwd()) === "travel-collection"
  ? path.resolve(".route-v2-cache", "accepted-routes.json")
  : path.resolve("travel-collection", ".route-v2-cache", "accepted-routes.json");
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || "")) {
  const report = createPlannerCoverageMatrixReport({ storagePath: arg("accepted-storage", defaultStorage) });
  if (arg("format", "json") === "table" || process.argv.includes("--table")) {
    printTable(report);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}
