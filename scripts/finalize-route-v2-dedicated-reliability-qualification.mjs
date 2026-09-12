import fs from "node:fs";
import path from "node:path";
import { ROUTE_V2_PERFORMANCE_PROTOCOL as protocol } from "./lib/route-v2-performance-reliability.mjs";
import { auditDedicatedReliabilityQualificationEvidence } from "./lib/route-v2-dedicated-reliability-qualification.mjs";

const directory = path.resolve(option("evidence-directory"));
const expected = {
  cpu: option("cpu"),
  coordinatorSha: option("coordinator-sha"),
  currentSha: option("current-sha"),
  baselineSha: option("baseline-sha"),
};
function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing --${name}`);
  return String(process.argv[index + 1]);
}
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
const runs = Array.from({ length: 5 }, (_, index) => readJson(`qualification-run-${index + 1}.json`));
const exitCodes = fs.readFileSync(path.join(directory, "qualification-exit-codes.txt"), "utf8").trim().split("\n").map(Number);
if (expected.baselineSha !== protocol.baselineRef) throw new Error("baseline identity mismatch");
const result = auditDedicatedReliabilityQualificationEvidence({ runs, before: readJson("environment-before.json"), after: readJson("environment-after.json"), exitCodes }, expected);
fs.writeFileSync(path.join(directory, "qualification-result.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${result.auditVerdict}\n`);
if (result.auditVerdict !== "AUDIT VALID") process.exitCode = 1;
