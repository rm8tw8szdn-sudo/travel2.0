import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controllerPath = path.join(projectRoot, "route-detail-load-controller.js");
assert(fs.existsSync(controllerPath), "the detail page must use a reusable authoritative-load controller");

const context = {
  AbortController,
  clearTimeout,
  setTimeout,
};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(controllerPath, "utf8"), context, { filename: controllerPath });
const createController = context.RouteV2DetailLoadController?.create;
assert.equal(typeof createController, "function");

const transitions = [];
const controller = createController({ timeoutMs: 40 });
const first = controller.begin();
first.signal.addEventListener("abort", () => {
  setTimeout(() => {
    if (first.isCurrent()) transitions.push("old-404");
  }, 10);
});

const second = controller.begin();
assert.equal(first.signal.aborted, true, "a replacement detail load must cancel the older request");
assert.equal(first.isCurrent(), false, "an older request must lose authority immediately");
assert.equal(second.isCurrent(), true);
transitions.push("ready");
assert.equal(second.settle(), true, "a successful current request must settle and cancel its watchdog");

await new Promise((resolve) => setTimeout(resolve, 70));
assert.deepEqual(transitions, ["ready"], "a delayed 404 must not overwrite or append after a successful detail render");
assert.equal(controller.snapshot().watchdogActive, false, "success must leave no active detail watchdog");

const timeoutController = createController({ timeoutMs: 10 });
const timed = timeoutController.begin();
await new Promise((resolve) => setTimeout(resolve, 25));
assert.equal(timed.signal.aborted, true);
assert.equal(timed.abortReason(), "timeout");
assert.equal(timed.isCurrent(), true, "the current timeout remains authoritative for a genuine error state");

const detailHtml = fs.readFileSync(path.join(projectRoot, "route-detail.html"), "utf8");
const detailSource = fs.readFileSync(path.join(projectRoot, "route-detail.js"), "utf8");
assert(
  detailHtml.indexOf("route-detail-load-controller.js") < detailHtml.indexOf("route-detail.js"),
  "the controller must load before the detail page script",
);
assert.match(detailSource, /detailLoadController\.begin\(\)/u);
assert.match(detailSource, /if \(!load\.isCurrent\(\)\) return;/u);
assert.match(detailSource, /load\.settle\(\)/u);
assert.match(detailSource, /load\.abortReason\(\) === "superseded"/u);

console.log(JSON.stringify({
  status: "PASS",
  delayedFailureIgnored: true,
  watchdogCancelledAfterSuccess: true,
  genuineTimeoutRemainsVisible: true,
}));
