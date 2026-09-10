import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAcceptedRouteRepository } from "../src/lib/routes/accepted-repository.mjs";
import { acquireOwnedFileLock, processStartIdentity } from "../src/lib/routes/file-owner-lock.mjs";

function route() {
  return {
    id: "concurrent-japan", name: "日本城市文化漫游",
    summary: "东京京都大阪串联城市文化与街区风景。",
    recommendationText: "沿铁路探索不同城市的历史建筑和当地生活。",
    countryEntities: [{ name: "日本", countryCode: "JP" }],
    destinationEntities: [
      { name: "东京", wikidataId: "Q1490", countryCode: "JP" },
      { name: "京都", wikidataId: "Q34600", countryCode: "JP" },
      { name: "大阪", wikidataId: "Q35765", countryCode: "JP" },
    ],
    countries: ["日本"], destinations: ["东京", "京都", "大阪"],
    recommendedDays: "7天", bestMonths: ["5月"], highlights: ["建筑", "文化", "美食"],
    coverAsset: {
      provider: "test", assetId: "concurrent-cover",
      sourceUrl: "https://example.test/source", imageUrl: "https://upload.wikimedia.org/concurrent.jpg",
    },
    contentQualityStatus: "accepted", sourceType: "source-original",
  };
}

function temporaryRepositoryRoot() {
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "accepted-concurrency-"));
}

function removeTemporaryRoot(temporaryRoot) {
  const target = fs.realpathSync(temporaryRoot);
  assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
  fs.rmSync(target, { recursive: true, force: true });
}

function lockOwner(pid, token = crypto.randomUUID()) {
  return {
    version: 1,
    pid,
    token,
    createdAt: new Date().toISOString(),
    processStartedAt: new Date(Date.now() - 1000).toISOString(),
  };
}

async function exitedProcessId() {
  const child = spawn(process.execPath, ["--eval", "process.exit(0)"], { stdio: "ignore" });
  const pid = child.pid;
  await once(child, "exit");
  return pid;
}

test("file-backed repository instances preserve each other's mutations", () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const storagePath = path.join(temporaryRoot, "accepted.json");
    const first = createAcceptedRouteRepository({ storagePath });
    assert.equal(first.upsert(route()).accepted, true);
    const second = createAcceptedRouteRepository({ storagePath });

    first.mark("concurrent-japan", { summary: "第一位写入者保存的新摘要。" });
    second.mark("concurrent-japan", { recommendationText: "第二位写入者保存的新说明。" });

    const reloaded = createAcceptedRouteRepository({ storagePath }).get("concurrent-japan");
    assert.equal(reloaded.summary, "第一位写入者保存的新摘要。");
    assert.equal(reloaded.recommendationText, "第二位写入者保存的新说明。");
    assert.equal(fs.existsSync(`${storagePath}.lock`), false);
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("active lock owners are protected and normal release permits the next writer", () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const storagePath = path.join(temporaryRoot, "accepted.json");
    const lockPath = `${storagePath}.lock`;
    const active = acquireOwnedFileLock(lockPath);
    const repository = createAcceptedRouteRepository({ storagePath });
    assert.throws(() => repository.upsert(route()), /accepted_repository_write_conflict/);
    assert.equal(fs.existsSync(lockPath), true);
    assert.equal(JSON.parse(fs.readFileSync(lockPath, "utf8")).token, active.owner.token);
    active.release();
    assert.equal(repository.upsert(route()).accepted, true);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("dead owner locks recover across repository restart", async () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const storagePath = path.join(temporaryRoot, "accepted.json");
    const lockPath = `${storagePath}.lock`;
    fs.writeFileSync(lockPath, JSON.stringify(lockOwner(await exitedProcessId())));
    const first = createAcceptedRouteRepository({ storagePath });
    assert.equal(first.upsert(route()).accepted, true);
    assert.equal(fs.existsSync(lockPath), false);

    fs.writeFileSync(lockPath, JSON.stringify(lockOwner(await exitedProcessId())));
    const restarted = createAcceptedRouteRepository({ storagePath });
    assert.equal(restarted.mark("concurrent-japan", { summary: "重启后成功恢复旧锁。" }).summary, "重启后成功恢复旧锁。");
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("a reused PID with a different process start identity is recovered", () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const storagePath = path.join(temporaryRoot, "accepted.json");
    const lockPath = `${storagePath}.lock`;
    const actualIdentity = processStartIdentity(process.pid);
    assert.ok(actualIdentity, "the current process start identity must be observable");
    const staleOwner = lockOwner(process.pid);
    staleOwner.processStartedAt = actualIdentity.replace(/\d+$/u, (value) => String(Number(value) - 1));
    fs.writeFileSync(lockPath, JSON.stringify(staleOwner));
    const repository = createAcceptedRouteRepository({ storagePath });
    assert.equal(repository.upsert(route()).accepted, true);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("a dead recovery owner is reclaimed before recovering the main lock", async () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const storagePath = path.join(temporaryRoot, "accepted.json");
    const lockPath = `${storagePath}.lock`;
    const recoveryPath = `${lockPath}.recovery`;
    fs.writeFileSync(lockPath, JSON.stringify(lockOwner(await exitedProcessId())));
    fs.writeFileSync(recoveryPath, JSON.stringify(lockOwner(await exitedProcessId())));
    const restarted = createAcceptedRouteRepository({ storagePath });
    assert.equal(restarted.upsert(route()).accepted, true);
    assert.equal(fs.existsSync(lockPath), false);
    assert.equal(fs.existsSync(recoveryPath), false);
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("an active recovery owner is never removed", async () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const storagePath = path.join(temporaryRoot, "accepted.json");
    const lockPath = `${storagePath}.lock`;
    const recoveryPath = `${lockPath}.recovery`;
    fs.writeFileSync(lockPath, JSON.stringify(lockOwner(await exitedProcessId())));
    const activeRecovery = acquireOwnedFileLock(recoveryPath);
    const repository = createAcceptedRouteRepository({ storagePath });
    assert.throws(() => repository.upsert(route()), /accepted_repository_write_conflict/);
    assert.equal(JSON.parse(fs.readFileSync(recoveryPath, "utf8")).token, activeRecovery.owner.token);
    assert.equal(fs.existsSync(lockPath), true);
    activeRecovery.release();
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("malformed lock metadata fails safe without deleting the lock", () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const storagePath = path.join(temporaryRoot, "accepted.json");
    const lockPath = `${storagePath}.lock`;
    fs.writeFileSync(lockPath, '{"pid":"unknown","token":"broken"}');
    const repository = createAcceptedRouteRepository({ storagePath });
    assert.throws(() => repository.upsert(route()), /accepted_repository_write_conflict/);
    assert.equal(fs.readFileSync(lockPath, "utf8"), '{"pid":"unknown","token":"broken"}');
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("indeterminate owner liveness fails safe", () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const lockPath = path.join(temporaryRoot, "accepted.json.lock");
    const owner = lockOwner(424242);
    fs.writeFileSync(lockPath, JSON.stringify(owner));
    assert.throws(
      () => acquireOwnedFileLock(lockPath, { ownerState: () => "unknown" }),
      /accepted_repository_write_conflict/,
    );
    assert.equal(JSON.parse(fs.readFileSync(lockPath, "utf8")).token, owner.token);
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("exceptions during mutation release the owned lock", () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const storagePath = path.join(temporaryRoot, "accepted.json");
    const repository = createAcceptedRouteRepository({ storagePath });
    assert.equal(repository.upsert(route()).accepted, true);
    assert.throws(() => repository.mark("concurrent-japan", { summary: () => "cannot clone" }), /clone|function|DataCloneError/iu);
    assert.equal(fs.existsSync(`${storagePath}.lock`), false);
    assert.equal(repository.mark("concurrent-japan", { summary: "异常后仍可写入。" }).summary, "异常后仍可写入。");
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("release never removes a replacement owner lock", () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const lockPath = path.join(temporaryRoot, "accepted.json.lock");
    const owned = acquireOwnedFileLock(lockPath);
    fs.rmSync(lockPath, { force: true });
    const replacement = lockOwner(process.pid);
    replacement.processStartedAt = processStartIdentity(process.pid);
    fs.writeFileSync(lockPath, JSON.stringify(replacement));
    owned.release();
    assert.equal(JSON.parse(fs.readFileSync(lockPath, "utf8")).token, replacement.token);
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});

test("competing stale recovery retains a single writer", async () => {
  const temporaryRoot = temporaryRepositoryRoot();
  try {
    const lockPath = path.join(temporaryRoot, "accepted.json.lock");
    const readyPath = path.join(temporaryRoot, "ready.txt");
    const goPath = path.join(temporaryRoot, "go.txt");
    const winnerPath = path.join(temporaryRoot, "winner.txt");
    fs.writeFileSync(lockPath, JSON.stringify(lockOwner(await exitedProcessId())));
    const moduleUrl = pathToFileURL(path.resolve("src/lib/routes/file-owner-lock.mjs")).href;
    const source = `
      import fs from "node:fs";
      import { acquireOwnedFileLock } from ${JSON.stringify(moduleUrl)};
      const [lockPath, readyPath, goPath, winnerPath] = process.argv.slice(1);
      fs.appendFileSync(readyPath, "ready\\n");
      while (!fs.existsSync(goPath)) await new Promise(resolve => setTimeout(resolve, 5));
      try {
        const lock = acquireOwnedFileLock(lockPath);
        fs.appendFileSync(winnerPath, process.pid + "\\n");
        await new Promise(resolve => setTimeout(resolve, 400));
        lock.release();
      } catch (error) {
        if (error?.message === "accepted_repository_write_conflict") process.exit(2);
        throw error;
      }
    `;
    const children = [0, 1].map(() => spawn(process.execPath, [
      "--input-type=module", "--eval", source, lockPath, readyPath, goPath, winnerPath,
    ], { stdio: "inherit" }));
    while ((fs.existsSync(readyPath) ? fs.readFileSync(readyPath, "utf8").trim().split(/\n/u).length : 0) < 2) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    fs.writeFileSync(goPath, "go");
    const exitCodes = await Promise.all(children.map(async (child) => (await once(child, "exit"))[0]));
    assert.deepEqual(exitCodes.sort(), [0, 2]);
    assert.equal(fs.readFileSync(winnerPath, "utf8").trim().split(/\n/u).length, 1);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    removeTemporaryRoot(temporaryRoot);
  }
});
