(function initializeRouteV2DetailLoadController(global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.RouteV2DetailLoadController = api;
}(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  function create({ timeoutMs = 11_000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    let sequence = 0;
    let active = null;

    function clearWatchdog(state) {
      if (!state?.watchdog) return;
      clearTimer(state.watchdog);
      state.watchdog = null;
    }

    function supersedeActive() {
      if (!active) return;
      const previous = active;
      active = null;
      previous.abortReason = "superseded";
      clearWatchdog(previous);
      if (!previous.controller.signal.aborted) previous.controller.abort("superseded");
    }

    function begin() {
      supersedeActive();
      const state = {
        token: ++sequence,
        controller: new AbortController(),
        abortReason: "",
        settled: false,
        watchdog: null,
      };
      active = state;
      state.watchdog = setTimer(() => {
        if (active !== state || state.settled) return;
        state.abortReason = "timeout";
        state.watchdog = null;
        if (!state.controller.signal.aborted) state.controller.abort("timeout");
      }, Math.max(1, Number(timeoutMs) || 11_000));

      return Object.freeze({
        token: state.token,
        signal: state.controller.signal,
        abortReason: () => state.abortReason,
        isCurrent: () => active === state,
        settle() {
          if (active !== state) return false;
          state.settled = true;
          clearWatchdog(state);
          return true;
        },
      });
    }

    function snapshot() {
      return Object.freeze({
        token: active?.token || 0,
        settled: active?.settled === true,
        abortReason: active?.abortReason || "",
        watchdogActive: Boolean(active?.watchdog),
      });
    }

    return Object.freeze({ begin, snapshot });
  }

  return Object.freeze({ create });
}));
