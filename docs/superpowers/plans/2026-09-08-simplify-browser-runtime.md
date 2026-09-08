# Simplify Browser Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove redundant browser-server process orchestration without reducing acceptance coverage or runtime isolation.

**Architecture:** The existing browser child process will host the production HTTP server directly. `main()` returns the listening HTTP server so tests can close it without parsing stdout or spawning a grandchild. Retain IPC ownership, bounded waits, and verified temporary-directory cleanup.

**Tech Stack:** Node.js 24 HTTP/child_process, existing Playwright Test.

---

- [x] Modify `server.js`: await the listening event, reject bind errors, and return the HTTP server from `main()`.
- [x] Simplify `tests/browser/server.cjs`: call `main()` directly, use temporary cwd for relative defaults, override only source-root-bound paths, retain isolation flags and owned-directory checks, and close connections on stop.
- [x] Simplify `tests/browser/global-setup.cjs`: manage one direct child with IPC; share timeout handling and remove process-group/taskkill fallbacks intended for grandchildren.
- [x] Run all 21 browser checks, 22 unit tests and 4 smoke verifiers. Check failed startup with an occupied port and verify cleanup.
- [x] Record net source reduction, update execution documentation, review the diff, and update draft PR #30.
