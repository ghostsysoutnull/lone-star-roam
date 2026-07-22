# Test cycle — fast logic checks

## Goal

Shorten the edit-test loop without weakening the browser verification suite.
Move checks that do not require a running Three.js game into a fast Node-based
layer, while retaining browser checks for player-visible behavior and
cross-system wiring.

The desired workflow is:

1. Run fast logic checks after ordinary edits.
2. Run the relevant named browser suite while developing a feature.
3. Run the complete browser suite before pushing.

The existing `node tools/verify.mjs` remains the final integration gate. This
track does not reduce its coverage or declare a browser-only behavior covered
by a logic check.

Current development-machine baselines: all four fast groups complete in about
0.55 s. The full browser suite's timing is no longer quoted as a fixed number
here — every run writes per-attempt boot/settle/body/cleanup/total timings,
machine conditions (cpus/freemem/loadavg), and the scheduled queue order to
`/tmp/lonestar-verify.json` (override: `VERIFY_JSON`); that sidecar is the
source of record for full-run timing, not a number frozen in this doc.

## Why this is worth doing

The full browser suite takes on the order of minutes on the development
machine (see the JSON sidecar for the current measured figure). Many
invariants are deterministic table, geometry, and rule checks that do not
need Chromium, WebGL, or a game boot. Giving those checks a separate,
near-immediate command makes routine edits cheaper to validate and makes
failures easier to localize.

## Decisions

- **Runner:** Node's built-in test runner. No test framework, package
  installation, or build step.
- **Test location:** `tools/unit/*.test.mjs`.
- **Production ownership:** Tests import production helpers or data. Never
  copy a production rule into a test merely to make it executable in Node.
- **Pure seams:** When a browser module mixes deterministic rules with Three.js
  objects or DOM work, extract the rule into a small dependency-free module and
  have the runtime call that module.
- **Data loading:** Tests read checked-in JSON directly. They do not start an
  HTTP server or browser.
- **Commands:** Add `node tools/test.mjs` for all fast checks and
  `node tools/test.mjs <group>` for a focused group. The command reports named
  groups and exits nonzero on failure.
- **Browser suite contract:** `node tools/verify.mjs` stays mandatory before a
  push. Existing browser checks remain unless a check is strictly duplicated by
  a more focused browser check; pure checks complement them, not replace them.
- **No changed-file guessing in this track:** Automatic affected-suite
  selection is useful but is a separate workflow feature. This track first
  establishes trustworthy fast checks and clear ownership.

## Boundaries

### Belongs in fast logic checks

- Checked-in data shape, counts, IDs, uniqueness, and cross-table references.
- Geometry and classification helpers when given explicit data.
- Seeded deterministic placement and eligibility rules.
- Pure mission, route, reward, deadline, gear, and weather rules.
- Build-output invariants that do not require the original external inputs.

### Stays in browser verification

- Game boot and module wiring.
- Input, movement, physics integration, and mode transitions.
- HUD and DOM behavior.
- Scene lifecycle, spawned meshes, audio callbacks, and timing behavior.
- Any assertion that needs the real game loop, a live save, or a player action.

## Waves

### Wave 1 — Foundation and data contracts

Create the dependency-free runner and its documented commands. Add data-contract
groups for the highest-risk checked-in tables:

- airport IDs, tiers, runway data, and aviation-route references;
- cities, highway tiers, and band-data counts/uniqueness;
- collectible, species, legend, and save-table totals;
- static JSON shape, finite numeric coordinates, and reference validity.

Success criteria:

- all checks run without Chromium or an HTTP server;
- a focused group can run independently;
- each failure identifies the invalid record and invariant;
- browser tests still own boot and visible behavior.

### Wave 2 — Extract deterministic rules

Extract the smallest production-owned pure helpers needed to test rules that
currently require a booted game. Start with high-churn, high-cost rules:

- airport route resolution and schedule eligibility;
- mission offer validity, payout, and deadline calculations;
- seeded placement eligibility for farmsteads, brands, haunts, and similar
  location generators;
- weather and time selection rules with supplied state.

Each extraction must leave runtime behavior unchanged and add tests using the
same exported helper the game calls.

Success criteria:

- no duplicated production logic in tests;
- representative valid and invalid inputs cover each extracted rule;
- deterministic seed fixtures remain stable;
- browser suites retain one end-to-end assertion per affected system.

### Wave 3 — Workflow integration and coverage ledger

Make fast checks part of normal development:

- add the command to `tools/status.sh`;
- document when to run fast checks, named browser suites, and the full suite;
- add a compact ownership ledger mapping each fast group to its browser
  sentinel;
- identify remaining expensive browser assertions that are pure-rule
  candidates, but do not migrate them without a production seam.

Success criteria:

- a status run catches syntax and fast-rule regressions together;
- contributors can choose the smallest relevant check command from the docs;
- the full browser run remains the pre-push integration gate;
- timing and workflow documentation report current measured baselines.

## Non-goals

- Replacing `tools/verify.mjs`.
- Unit-testing Three.js rendering or screenshots.
- Adding a package manager, transpiler, bundler, or third-party test library.
- Making test selection automatic from changed files.
- Changing game content, save formats, seeded RNG strings, or checked-in data
  merely to make it easier to test.

## Risks and safeguards

| Risk | Safeguard |
| --- | --- |
| Tests drift from runtime behavior | Tests import the production helper; do not reimplement rules. |
| Refactoring changes player behavior | Keep extraction narrowly scoped and retain a browser sentinel. |
| Data tests become brittle census snapshots | Assert structural and referential invariants, not incidental ordering. |
| Fast checks become a substitute for integration | Keep the full browser suite required before pushing. |
| Scope expands into CI or changed-file selection | Keep both as separately approved follow-up tracks. |

## Coverage ledger

| Fast group | Owns | Browser sentinel retained |
| --- | --- | --- |
| `data` | Checked-in city, road, county, and agriculture data shape and reference integrity | `band` covers loaded places/roads and `ag` covers the live county join plus generated farm content |
| `aviation` | Airport record/runway constraints and every civilian route reference | `aviation` covers pads, geometry, scheduling, and real-loop aircraft behavior; `band` covers the expanded field table |
| `progress` | Collectible table totals, unique labels, and additive save defaults | `padre` covers DOM totals; `shoulder`, `wildlife`, and `haunts` cover live Passport, species, and legend behavior |
| `rules` | Production-owned route validation/scheduling and mission terms/payout rounding | `aviation` covers the runtime schedule; `missions` covers offers, haul lifecycle, deadlines, and paid outcomes |

### Deferred pure-rule candidates

- Airport footprint/layout calculations could accept an injected terrain sampler,
  leaving `aviation` to retain its raycast and live-system sentinels.
- Farmstead, feedlot, chapel, ranch, and brand placement eligibility could move
  behind dependency-free seeded-site helpers; their scenery/mesh checks remain
  browser-owned.
- Static shop and weather tables could gain contracts once their rule ownership
  is separated from DOM and Three.js effects.

Do not migrate any of these until runtime calls the extracted helper and a
browser sentinel continues to cover the visible integration.

## Runner self-test

`tools/verify-selftest.mjs` validates `tools/verify.mjs`'s own runner
internals — the near-guard, fatal-pageerror handling, pool/solo attempt
preservation, summary format, and JSON sidecar shape — against three minimal
fixture suites in `tools/checks-fixtures/` (green/assertfail/pagethrow) via
`VERIFY_CHECKS`. It spawns one child `verify.mjs` run, asserts exit code,
specific stdout lines, and the JSON sidecar's shape, and reports a compact
PASS/FAIL per assertion. Run it on demand and always after changing
`verify.mjs`'s runner internals (sink/report/JSON shape) — game-suite changes
don't need it.

## Completion

The track is complete when fast logic checks cover the agreed data contracts and
extracted deterministic rules, run without a browser, are part of the normal
status command, and have documented browser sentinels. Fold the shipped work
into `ROADMAP.md`, retain this spec as history, and remove the session briefing.
