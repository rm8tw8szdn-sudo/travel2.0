import crypto from "node:crypto";
import fs from "node:fs";

const LOCK_VERSION = 1;
const PROCESS_STARTED_AT = new Date(Date.now() - process.uptime() * 1000).toISOString();

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseLockOwner(value) {
  if (!isPlainObject(value)
    || value.version !== LOCK_VERSION
    || !Number.isSafeInteger(value.pid)
    || value.pid <= 0
    || typeof value.token !== "string"
    || !/^[a-f0-9-]{16,128}$/iu.test(value.token)
    || !validTimestamp(value.createdAt)
    || !validTimestamp(value.processStartedAt)) return null;
  return {
    version: LOCK_VERSION,
    pid: value.pid,
    token: value.token,
    createdAt: value.createdAt,
    processStartedAt: value.processStartedAt,
  };
}

function readLockOwner(lockPath) {
  try {
    return parseLockOwner(JSON.parse(fs.readFileSync(lockPath, "utf8")));
  } catch {
    return null;
  }
}

export function processLiveness(pid) {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (error?.code === "ESRCH") return "dead";
    if (error?.code === "EPERM") return "alive";
    return "unknown";
  }
}

function sameOwner(left, right) {
  return Boolean(left && right)
    && left.version === right.version
    && left.pid === right.pid
    && left.token === right.token
    && left.processStartedAt === right.processStartedAt;
}

function newOwner({ pid, processStartedAt, now, tokenFactory }) {
  return {
    version: LOCK_VERSION,
    pid,
    token: tokenFactory(),
    createdAt: new Date(now()).toISOString(),
    processStartedAt,
  };
}

function writeOwnerDescriptor(descriptor, owner) {
  fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, "utf8");
  fs.fsyncSync(descriptor);
}

function recoverDeadOwner(lockPath, observedOwner, options) {
  const recoveryPath = `${lockPath}.recovery`;
  let recoveryDescriptor;
  try {
    recoveryDescriptor = fs.openSync(recoveryPath, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
  try {
    writeOwnerDescriptor(recoveryDescriptor, newOwner(options));
  } catch (error) {
    fs.closeSync(recoveryDescriptor);
    fs.rmSync(recoveryPath, { force: true });
    throw error;
  }
  try {
    const currentOwner = readLockOwner(lockPath);
    if (!sameOwner(currentOwner, observedOwner)) return false;
    if (options.liveness(currentOwner.pid) !== "dead") return false;
    fs.rmSync(lockPath);
    return true;
  } finally {
    fs.closeSync(recoveryDescriptor);
    fs.rmSync(recoveryPath, { force: true });
  }
}

export function acquireOwnedFileLock(lockPath, {
  pid = process.pid,
  processStartedAt = PROCESS_STARTED_AT,
  now = Date.now,
  tokenFactory = crypto.randomUUID,
  liveness = processLiveness,
} = {}) {
  const options = { pid, processStartedAt, now, tokenFactory, liveness };
  const owner = newOwner(options);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let descriptor;
    try {
      descriptor = fs.openSync(lockPath, "wx");
      writeOwnerDescriptor(descriptor, owner);
      let released = false;
      return {
        owner: { ...owner },
        release() {
          if (released) return;
          released = true;
          fs.closeSync(descriptor);
          if (sameOwner(readLockOwner(lockPath), owner)) fs.rmSync(lockPath, { force: true });
        },
      };
    } catch (error) {
      if (descriptor != null) {
        try { fs.closeSync(descriptor); } catch {}
        fs.rmSync(lockPath, { force: true });
      }
      if (error?.code !== "EEXIST") throw error;
      const observedOwner = readLockOwner(lockPath);
      if (!observedOwner || liveness(observedOwner.pid) !== "dead") {
        throw new Error("accepted_repository_write_conflict");
      }
      if (!recoverDeadOwner(lockPath, observedOwner, options)) {
        throw new Error("accepted_repository_write_conflict");
      }
    }
  }
  throw new Error("accepted_repository_write_conflict");
}
