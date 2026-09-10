import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const LOCK_VERSION = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validProcessIdentity(value) {
  return typeof value === "string"
    && (/^(?:windows|posix)-start-ms:\d+$/u.test(value) || validTimestamp(value));
}

export function parseLockOwner(value) {
  if (!isPlainObject(value)
    || value.version !== LOCK_VERSION
    || !Number.isSafeInteger(value.pid)
    || value.pid <= 0
    || typeof value.token !== "string"
    || !/^[a-f0-9-]{16,128}$/iu.test(value.token)
    || !validTimestamp(value.createdAt)
    || !validProcessIdentity(value.processStartedAt)) return null;
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

export function processStartIdentity(pid, {
  platform = process.platform,
  execFile = execFileSync,
} = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    if (platform === "win32") {
      const command = `$p = Get-Process -Id ${pid} -ErrorAction Stop; ([DateTimeOffset]$p.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()`;
      const output = execFile("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      const milliseconds = String(output || "").trim();
      return /^\d+$/u.test(milliseconds) ? `windows-start-ms:${milliseconds}` : null;
    }
    const output = execFile("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const timestamp = Date.parse(String(output || "").trim());
    return Number.isFinite(timestamp) ? `posix-start-ms:${timestamp}` : null;
  } catch {
    return null;
  }
}

let cachedCurrentProcessIdentity;

function currentProcessStartIdentity() {
  if (cachedCurrentProcessIdentity === undefined) {
    cachedCurrentProcessIdentity = processStartIdentity(process.pid);
  }
  return cachedCurrentProcessIdentity;
}

export function lockOwnerState(owner, dependencies = {}) {
  const parsed = parseLockOwner(owner);
  if (!parsed) return "unknown";
  const liveness = (dependencies.processLiveness || processLiveness)(parsed.pid);
  if (liveness !== "alive") return liveness;
  const actualIdentity = dependencies.processStartIdentity
    ? dependencies.processStartIdentity(parsed.pid)
    : parsed.pid === process.pid
      ? currentProcessStartIdentity()
      : processStartIdentity(parsed.pid);
  if (!actualIdentity) return "unknown";
  if (!/^(?:windows|posix)-start-ms:\d+$/u.test(parsed.processStartedAt)) return "unknown";
  return actualIdentity === parsed.processStartedAt ? "alive" : "dead";
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

function createOwnedMarker(markerPath, owner) {
  let descriptor;
  try {
    descriptor = fs.openSync(markerPath, "wx");
    writeOwnerDescriptor(descriptor, owner);
    return descriptor;
  } catch (error) {
    if (descriptor != null) {
      try { fs.closeSync(descriptor); } catch {}
      fs.rmSync(markerPath, { force: true });
    }
    throw error;
  }
}

function releaseOwnedMarker(markerPath, descriptor, owner) {
  fs.closeSync(descriptor);
  if (sameOwner(readLockOwner(markerPath), owner)) fs.rmSync(markerPath, { force: true });
}

function acquireRecoveryTakeover(recoveryPath, staleOwner, options) {
  const takeoverPath = `${recoveryPath}.takeover-${staleOwner.token}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const takeoverOwner = newOwner(options);
    let descriptor;
    try {
      descriptor = createOwnedMarker(takeoverPath, takeoverOwner);
      return { descriptor, owner: takeoverOwner, path: takeoverPath };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = readLockOwner(takeoverPath);
      if (!existing || options.ownerState(existing) !== "dead") return null;
      if (!sameOwner(readLockOwner(takeoverPath), existing)) continue;
      fs.rmSync(takeoverPath, { force: true });
    }
  }
  return null;
}

function recoverStaleRecoveryMarker(recoveryPath, observedOwner, options) {
  const takeover = acquireRecoveryTakeover(recoveryPath, observedOwner, options);
  if (!takeover) return false;
  try {
    const currentOwner = readLockOwner(recoveryPath);
    if (!sameOwner(currentOwner, observedOwner)) return false;
    if (options.ownerState(currentOwner) !== "dead") return false;
    if (!sameOwner(readLockOwner(takeover.path), takeover.owner)) return false;
    fs.rmSync(recoveryPath);
    return true;
  } finally {
    releaseOwnedMarker(takeover.path, takeover.descriptor, takeover.owner);
  }
}

function acquireRecoveryMarker(recoveryPath, options) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const owner = newOwner(options);
    try {
      const descriptor = createOwnedMarker(recoveryPath, owner);
      return { descriptor, owner };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = readLockOwner(recoveryPath);
      if (!existing || options.ownerState(existing) !== "dead") return null;
      if (!recoverStaleRecoveryMarker(recoveryPath, existing, options)) return null;
    }
  }
  return null;
}

function recoverDeadOwner(lockPath, observedOwner, options) {
  const recoveryPath = `${lockPath}.recovery`;
  const recovery = acquireRecoveryMarker(recoveryPath, options);
  if (!recovery) return false;
  try {
    const currentOwner = readLockOwner(lockPath);
    if (!sameOwner(currentOwner, observedOwner)) return false;
    if (options.ownerState(currentOwner) !== "dead") return false;
    fs.rmSync(lockPath);
    return true;
  } finally {
    releaseOwnedMarker(recoveryPath, recovery.descriptor, recovery.owner);
  }
}

export function acquireOwnedFileLock(lockPath, {
  pid = process.pid,
  processStartedAt = pid === process.pid ? currentProcessStartIdentity() : processStartIdentity(pid),
  now = Date.now,
  tokenFactory = crypto.randomUUID,
  ownerState = lockOwnerState,
} = {}) {
  if (!processStartedAt) throw new Error("process_identity_unavailable");
  const options = { pid, processStartedAt, now, tokenFactory, ownerState };
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
      if (!observedOwner || ownerState(observedOwner) !== "dead") {
        throw new Error("accepted_repository_write_conflict");
      }
      if (!recoverDeadOwner(lockPath, observedOwner, options)) {
        throw new Error("accepted_repository_write_conflict");
      }
    }
  }
  throw new Error("accepted_repository_write_conflict");
}
