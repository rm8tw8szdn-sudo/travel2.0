import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DEDICATED_ENVIRONMENT_SCHEMA_VERSION,
  validateDedicatedEnvironmentSnapshot,
} from "./lib/route-v2-dedicated-performance-environment.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phase = option("phase");
const cpu = option("cpu");
const coordinatorSha = option("coordinator-sha");
const currentSha = option("current-sha");
const baselineSha = option("baseline-sha");
const output = path.resolve(option("output"));

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing --${name}`);
  return String(process.argv[index + 1]);
}

function read(file) {
  return fs.readFileSync(file, "utf8").trim();
}

function command(commandName, args = []) {
  return execFileSync(commandName, args, { encoding: "utf8" }).trim();
}

function numberFile(file, { optional = false } = {}) {
  try { return Number(read(file)); } catch (error) { if (optional) return null; throw error; }
}

const procStat = read("/proc/stat");
const cpuLines = procStat.split("\n").filter((line) => /^cpu\d*\s/u.test(line));
const stealTicks = cpuLines.reduce((sum, line) => sum + Number(line.trim().split(/\s+/u)[8] || 0), 0);
const contextSwitches = Number(procStat.match(/^ctxt\s+(\d+)$/mu)?.[1]);
const sched = read("/proc/self/sched");
const cpuMigrations = Number(sched.match(/se\.nr_migrations\s*:\s*(\d+)/u)?.[1] || 0);
const affinityOutput = command("taskset", ["-pc", String(process.pid)]);
const affinityList = affinityOutput.split(":").at(-1).trim();
const cpuInfo = read("/proc/cpuinfo");
const siblingList = read(`/sys/devices/system/cpu/cpu${cpu}/topology/thread_siblings_list`);
const snapshot = {
  kind: "NON_FORMAL_DEDICATED_RELIABILITY_ENVIRONMENT",
  schemaVersion: DEDICATED_ENVIRONMENT_SCHEMA_VERSION,
  phase,
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  kernel: command("uname", ["-a"]),
  cpuModel: cpuInfo.match(/^model name\s*:\s*(.+)$/mu)?.[1] || "",
  cpuTopology: command("lscpu"),
  hypervisor: (() => { try { return command("systemd-detect-virt"); } catch { return "none"; } })(),
  smtEnabled: siblingList.includes(",") || siblingList.includes("-"),
  affinityList,
  governor: read(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_governor`),
  minimumFrequencyKHz: numberFile(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_min_freq`),
  maximumFrequencyKHz: numberFile(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_max_freq`),
  currentFrequencyKHz: numberFile(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_cur_freq`, { optional: true }),
  loadAverage: read("/proc/loadavg"),
  procStat,
  contextSwitches,
  cpuMigrations,
  stealTicks,
  memoryState: read("/proc/meminfo"),
  lockfileSha256: createHash("sha256").update(fs.readFileSync(path.join(projectRoot, "package-lock.json"))).digest("hex"),
  coordinatorSha: command("git", ["-C", projectRoot, "rev-parse", "HEAD"]),
  currentSha,
  baselineSha,
};
const validation = validateDedicatedEnvironmentSnapshot(snapshot, { cpu, coordinatorSha, currentSha, baselineSha });
snapshot.preflight = validation;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
if (!validation.valid) {
  process.stderr.write(`${validation.errors.join("\n")}\n`);
  process.exitCode = 1;
}
