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
decision waits on this table plus the accumulating
`/tmp/lonestar-verify.json` history — no track opened yet.

**Next per the 2026-H2 program (`VISION_2026H2.md`): sea-industry
(`VISION_SEA_INDUSTRY.md`) — spec session first.** The Mexico 25-mi band
conversation was discarded 2026-07-22 (covered by `VISION_MEXICO_SHOULDER.md`).
Map W2 (layers + waypoint) is queued in `BACKLOG.md`.
