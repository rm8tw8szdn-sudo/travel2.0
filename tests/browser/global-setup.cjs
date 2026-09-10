const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

async function withTimeout(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function globalSetup() {
  const port = Number(process.env.PW_PORT || 4287);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PW_PORT must be an integer from 1 to 65535.");
  }
  const child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, PW_PORT: String(port) },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    windowsHide: true,
  });
  const closed = new Promise(resolve => child.once("close", code => resolve(code)));
  let teardownPromise;
  function teardown() {
    return teardownPromise ||= (async () => {
      if (child.connected) child.send({ type: "stop" }, error => { if (error && child.connected) child.disconnect(); });
      let code;
      try {
        code = await withTimeout(closed, 15_000, "Browser test server did not stop; temporary data may remain.");
      } catch (error) {
        // The child now hosts HTTP directly, so no process-tree kill is needed.
        child.kill("SIGKILL");
        if (child.connected) child.disconnect();
        child.unref();
        throw error;
      }
      if (code !== 0) throw new Error("Browser test server exited unexpectedly (code " + code + ").");
    })();
  }

  try {
    const [message] = await withTimeout(Promise.race([
      once(child, "message"),
      closed.then(code => { throw new Error("Browser test server exited before readiness (code " + code + ")."); }),
    ]), 90_000, "Browser test server did not become ready within 90 seconds.");
    if (message?.type !== "ready" || message.port !== port) throw new Error("Unexpected browser server readiness message.");
  } catch (error) {
    await teardown().catch(cleanupError => console.error(cleanupError.message));
    throw error;
  }
  return teardown;
};
