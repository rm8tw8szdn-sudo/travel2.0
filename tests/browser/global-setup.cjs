const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

module.exports = async function globalSetup() {
  const port = Number(process.env.PW_PORT || 4287);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PW_PORT must be an integer from 1 to 65535.");
  }
  const wrapper = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, PW_PORT: String(port) },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  let closed = null;
  const closedPromise = new Promise((resolve) => {
    wrapper.once("close", (code, signal) => {
      closed = { code, signal };
      resolve(closed);
    });
  });

  async function waitForExit(timeoutMs) {
    let timer;
    try {
      return await Promise.race([
        closedPromise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Browser test server did not stop within the shutdown timeout.")), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  let teardownPromise;
  function teardown() {
    if (teardownPromise) return teardownPromise;
    teardownPromise = (async () => {
      if (!closed && wrapper.connected) {
        wrapper.send({ type: "stop" }, (error) => {
          // Closing IPC is also a shutdown request understood by the wrapper.
          if (error && wrapper.connected) wrapper.disconnect();
        });
      }
      let result;
      try {
        result = await waitForExit(15_000);
      } catch (error) {
        // Last resort for an unresponsive wrapper: terminate only this run's
        // owned process tree. Normal teardown uses IPC and cleans its temp data.
        if (!closed && Number.isSafeInteger(wrapper.pid) && wrapper.pid > 0) {
          if (process.platform === "win32") {
            spawnSync("taskkill.exe", ["/PID", String(wrapper.pid), "/T", "/F"], {
              stdio: "ignore", windowsHide: true, timeout: 5000,
            });
          } else {
            try { process.kill(-wrapper.pid, "SIGKILL"); } catch (killError) {
              if (killError.code !== "ESRCH") throw killError;
            }
          }
        }
        throw new Error(`${error.message} The logged temporary directory may remain.`, { cause: error });
      }
      if (result.code !== 0) {
        throw new Error(`Browser test server exited unexpectedly (code ${result.code}, signal ${result.signal || "none"}).`);
      }
    })();
    return teardownPromise;
  }

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => complete(new Error("Browser test server did not become ready within 90 seconds.")), 90_000);
      function complete(error) {
        clearTimeout(timer);
        wrapper.off("message", onMessage);
        wrapper.off("error", onError);
        wrapper.off("close", onClose);
        if (error) reject(error);
        else resolve();
      }
      function onMessage(message) {
        if (message?.type === "ready" && message.port === port) complete();
      }
      function onError(error) { complete(error); }
      function onClose(code, signal) {
        complete(new Error(`Browser test server exited before readiness (code ${code}, signal ${signal || "none"}).`));
      }
      wrapper.on("message", onMessage);
      wrapper.once("error", onError);
      wrapper.once("close", onClose);
    });
  } catch (error) {
    await teardown().catch((cleanupError) => console.error(cleanupError.message));
    throw error;
  }

  return teardown;
};
