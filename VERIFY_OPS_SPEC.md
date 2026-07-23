# Verify Ops — track spec

Interstitial single-wave track: make the recurring testing failure modes
impossible to repeat before Sea-Industry continues (Bruno, 2026-07-23,
after the Sea W1 wave-close incident). Sea-Industry W2 resumes immediately
after this wave; its briefing content is preserved at the bottom of
`NEXT_SESSION.md`'s "Then" line.

## Executive summary

**Goal**: a test cycle that fails loudly instead of weirdly — a second
concurrent verify refuses instead of silently corrupting the first, the
runner warns when the machine is too loaded to trust results, and the
timing-sensitive toast checks stop producing false failures under load.

**Wave 1 — the developer gets:**
- a verify run that cannot be started twice: the second launch prints who
  holds the lock and exits with the infra code
- a loud startup warning when machine load makes boot timeouts likely
- the toast-assertion flake class fixed everywhere it exists, not per-site
- standing launch-discipline law in `GOTCHAS.md` so the incident's operator
  errors are codified

*Expected result: pid lockfile with stale-detection in `tools/verify.mjs`
(exit 3 on refusal); one-line load warning at startup; `band.mjs` +
`sea.mjs` toast reads converted to `t.until`, plus a grep sweep for any
other single-read toast assertion; new selftest assertions for lock
acquire/refuse/stale/release; GOTCHAS bullet on launch discipline. No
player-visible change, no tours, no shots, perf none.*
*Suggested setup: **handoff yes** (wave-coder; all contracts below are
settled), effort high. The selftest is the safety net for runner edits.*

## The recurring problems (why this wave exists)

Every recent wave has burned time on the same classes:

1. **Infra flakes under parallelism/load** — 60 s `page.waitForFunction`
   boot timeouts that solo-green. Wind-farm wave: 1; Sea W1 close: 19 in
   one run. Cause: browser boot starves when the pool + machine load
   exceed the cores. The runner already retries solo (correct) but gives
   no up-front signal that a run is starting into hostile load.
2. **Single-read toast assertions** — a check teleports/acts, then reads
   `#toast` textContent once. Under load the expected toast is late, or an
   earlier/competing toast still occupies the element, and the check fails
   on healthy code. Sea W1 close: `band` "soft wall pushes back" read
   "You're leaving Texas. It'll be here." where the land-edge message was
   expected; solo-green on an idle machine. The harness has the right
   idiom already (`t.until(expr, ms, every)`, `tools/verify.mjs:281`) —
   the class just predates it.
3. **Concurrent-run collisions** — nothing stops a second
   `tools/verify.mjs` while one is running. The second run dies silently
   (empty stdout, eventual exit 1), both race on the static-server port
   and clobber `/tmp/lonestar-verify.log`. This turned one misread into a
   3-run pile-up at load 33 and a 1804 s wall (baseline 227 s).
4. **Operator/harness launch hazards** (not fixable in-repo, must be law):
   Claude Code background notifications for *compound* commands
   (`a | b && verify`) can report completion while the verify still runs —
   that misread caused the duplicate launches; foreground runs die at the
   600 s Bash timeout and orphan mid-run; piping status/verify through
   `tail`/`head` cuts root-cause lines (already law, breached again
   2026-07-23).

## Incident record (2026-07-23, Sea W1 wave close — the evidence)

- Launch: `tools/status.sh 2>&1 | tail -8 && node tools/verify.mjs -q -j4`
  as one background command. Harness notified "completed, exit 0" with only
  status output in the task file; the verify (pid 25364) was in fact alive.
- Misread → second launch (`-q -j4`): exited instantly, empty output.
  Third launch (foreground): hit the 600 s Bash cap, moved to background,
  also died. `ps` later showed only pid 25364 ever ran the suites.
- Machine: 12 cores, load average peaked 33.
- Result: 544 passed, 19 boot-timeout solo-green flakes, 1 assertion flake
  (`band`, solo attempt lost to another boot timeout), 1804 s wall.
  `band` confirmed 33/33 solo on the idle machine afterward.
- Durable evidence: `~/.cache/lonestar-verify/history/20260723T*` sidecars
  (machine snapshots carry the loadavg); `/tmp/lonestar-verify.log` held
  only the last writer.

## Design settled (the wave executes, it does not decide)

### W1a — single-instance lock (tools/verify.mjs)

- Lock path: `~/.cache/lonestar-verify/lock.json` (the runner's own cache
  dir — survives `/tmp` cleaners, one obvious home).
- Content: `{ pid, startedAt, argv }`, written with `wx` (O_EXCL) — the
  create IS the acquisition; no mkdir dance.
- On `EEXIST`: read the file, `process.kill(pid, 0)` to probe.
  - Holder alive → print exactly:
    `verify: another run is active (pid <pid>, started <startedAt>, argv <argv>) — refusing; wait or kill it`
    and exit **3** (the established infra exit code).
  - Holder dead (stale) → print one reclaim line, unlink, acquire.
- Release: `unlink` in a `finally` around the whole run + on
  `SIGINT`/`SIGTERM` handlers (handlers re-raise after cleanup so the exit
  code semantics stay untouched).
- Scope: the lock guards the *runner* (server + pool + log), so acquire
  before the static server starts and after arg parsing (a `--help`/bad-arg
  exit must not touch the lock).
- `verify-selftest.mjs` additions (the selftest spawns child runs already —
  follow its existing child-run pattern):
  1. run A holds lock → spawned run B exits 3 with the refusal line;
  2. stale lock (write a dead pid) → next run reclaims and proceeds;
  3. after a normal run, the lock file is gone;
  4. a SIGTERM'd run leaves no lock behind.

### W1b — load warning (tools/verify.mjs)

- At startup, after lock acquisition: if `os.loadavg()[0] > os.cpus().length`,
  print exactly:
  `verify: load <1min-load> on <cores> cores — boot timeouts likely, results may flake; prefer an idle machine`
- Warning only — never gate or change behavior. The sidecar already
  records `machine.start.loadavg`; no schema change.

### W1c — toast-assertion class fix (checks)

- Idiom: replace fixed-wait + single read with
  `await t.until(`document.getElementById('toast').textContent.includes('<expected>')`, 8000)`
  followed by the existing assertions (the `until` throws its own labeled
  timeout, which is the failure signal; keep any content assertions after
  it for message-shape detail).
- Known sites (fix all, keep each check's clear-toast setup lines):
  - `tools/checks/band.mjs` "soft wall pushes back + tells you why" — both
    reads (land edge 'far as this road goes', gulf message).
  - `tools/checks/sea.mjs` announcer check — the Brownsville toast read.
  - `tools/checks/sea.mjs` Ports-log check — poll for
    `save.ports.includes('texascity')` via `t.until` instead of
    `t.wait(1.0)` then read (same late-arrival class, DOM assertions after).
- Class sweep (mandatory, report count in the wave report):
  `rg -n "toast'?\)?\.textContent|getElementById\('toast'\)" tools/checks/`
  — every hit that is read-once-after-fixed-wait converts to the idiom;
  hits already under `t.until` or asserting emptiness are fine as-is.
- Do NOT touch toast *content* strings — this wave changes when checks
  read, never what the game says.

### W1d — launch-discipline law (docs)

- New `GOTCHAS.md` bullet (Verification section), covering:
  - the full verify launches as **its own single background command** —
    never chained (`&&`/`|`) behind anything (compound background commands
    can notify completion early — 2026-07-23 incident), never foreground
    (600 s Bash cap orphans the run);
  - one instance at a time — the runner now enforces this (exit 3 + the
    pid line); on a refusal, wait for the holder, don't relaunch;
  - reaffirm: no `tail`/`head` on verify/status output (breached again
    2026-07-23 — the rule needs the incident citation).
- `CLAUDE.md` testing-workflow: one sentence pointing at the bullet
  ("full verifies launch per the GOTCHAS launch-discipline rule").

## Hard requirements

- Exit-code contract unchanged for existing paths; refusal uses 3 (infra).
- The lock must never survive a normal or signaled exit (selftest-proven).
- No check weakens: `t.until` tightens timing without loosening content
  assertions.
- Runner diff stays inside `tools/verify.mjs` + `tools/verify-selftest.mjs`;
  check diffs inside `tools/checks/`; docs as listed. No game-code edits.

## Verification & budget

- `node tools/verify-selftest.mjs` (51 assertions + the 4 new lock cases).
- Named suites: `band`, `sea` (the hardened checks).
- One full `node tools/verify.mjs -q -j4` at wave close (runner changed —
  the full run is the point), launched per the new W1d law.
- Budget: code + selftest + named suites + one full run; no shots; no
  tours; grep-first; perf none.
