# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

No active track: **the test-gate hardening + telemetry wave shipped
2026-07-22** (handoff via `wave-coder`) — `verify.mjs` now throws on
non-finite `t.near` comparisons, fails suites on any unexpected page error
(deduped, no allowlist, routes through the existing solo-rerun flake path),
preserves both pool and solo attempts for JSON telemetry instead of the solo
rerun overwriting the pool one, and writes a full per-attempt timing +
machine-conditions JSON sidecar (`/tmp/lonestar-verify.json`) every run. New
`tools/verify-selftest.mjs` + `tools/checks-fixtures/` validate the runner
itself. The full verify came back clean on first run (572 passed, 0 failed,
3 known solo-green flakes) — the new guards surfaced no latent check bugs.
Solo-green exit-zero is flagged as **temporary policy** pending an
evidence-based flake policy built from the recorded JSON history.

Also produced (measurement only, no action taken): a CDP-profiled
caller-attribution table for `inPoly()` time during one game boot — the
biggest cost by far is `neighborStateAt` (`geo.js`) called from the W3
terrain painter's `bandTint` (`world.js`), ~2.8s of a ~10.7s boot profile
(full table: `TESTING_ASSESSMENT.md` → Addendum). The startup-optimization
decision waits on this table plus accumulated verify history — which does
not exist yet: the JSON sidecar overwrites itself every run. The queued
runner-telemetry wave (briefing below) makes it durable; no track opened.

**Queue order (set 2026-07-22)**: runner-telemetry wave (below), then the
turbine-sampler wave (`BACKLOG.md` → Bugs), then sea-industry
(`VISION_SEA_INDUSTRY.md`, spec session first — doc-only, may interleave
anywhere). The Mexico 25-mi band conversation was discarded 2026-07-22
(covered by `VISION_MEXICO_SHOULDER.md`). Map W2 (layers + waypoint) is
queued in `BACKLOG.md`.

## Session briefing
- **This session**: runner telemetry + durable history, single wave —
  settle the failure matrix + retention in the plan, then hand off. Scope
  doc: `TEST_RUNNER_FOLLOWUP.md`; amendments + provenance in `BACKLOG.md`
  → Test harness follow-ups. Hardening wave (gate hardening + JSON
  sidecar) shipped 2026-07-22, commit ecad959.
- **Recommended setup**: handoff **yes**, effort **high** — mechanical
  runner work once the plan settles the two open contracts (per-phase
  failure matrix incl. the browser-crash relaunch-vs-abort cell; retention
  knobs). Session runs Fable 5; flag it if another model is running.
- **Budget**: code + fixtures + self-test expansion; no game perf cost, no
  judged shots (self-test adds a few boots + one capture fixture asserted
  numerically); one full verify at wave close, retained as the first
  trusted history entry.
- **Then**: rewrite this block for the turbine-sampler + city-clearance
  wave (`BACKLOG.md` → Bugs); sea-industry spec session may interleave
  anytime (doc-only).

Gotchas carried over: history dir must be reboot-durable
(`~/.cache/lonestar-verify/history/`); browser-crash casualties are
`infra`, never FAIL — signature-history integrity is the wave's point.
