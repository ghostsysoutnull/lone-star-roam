# Test runner hardening follow-up

Date: 2026-07-22  
Status: queued (2026-07-22) — see `BACKLOG.md` → Test harness follow-ups  
Scope: unresolved telemetry and runner-self-test issues in `tools/verify.mjs`  
Provenance: Codex-authored (external review lane, `gpt-5.6-sol`); the four
central claims verified in-session at HEAD `09941ed` (Fable 5, 2026-07-22);
scope converged over two reply rounds. Amendments and queue status live in
the `BACKLOG.md` entry — this doc is input to the wave plan, not
implementation authority.

## Objective

Make verification records durable, diagnostically complete, comparable between
runs, and protected by runner-level regression tests. This follow-up does not
change the current flake exit policy or pursue test-suite performance work.

## 1. Retain measurement history

### Problem

`VERIFY_JSON` defaults to one fixed file, `/tmp/lonestar-verify.json`, and each
run replaces it with `writeFileSync`. The documentation and queued follow-ups
refer to accumulated history, but the runner retains only the latest report.
Both JSON and text-report write errors are silently ignored, so a run can appear
fully recorded when no report was written.

### Required change

- Continue writing the latest report to `VERIFY_JSON` for compatibility.
- Also write each completed run to a unique file under a history directory,
  defaulting to `/tmp/lonestar-verify-history/` and overridable through
  `VERIFY_HISTORY_DIR`.
- Use a collision-safe name containing the UTC timestamp and process ID.
- Write the latest report atomically: write a sibling temporary file, then
  rename it over the destination.
- Print a concise warning to stderr if the latest report, history copy, or text
  log cannot be written. A telemetry failure must never remain silent.
- Keep test-result exit semantics unchanged by default. Provide an explicit
  strict telemetry mode if CI or a measurement session must fail when a report
  cannot be persisted.
- Document retention. Either retain a bounded number of reports or provide a
  separate, explicit cleanup command; do not silently delete unrelated `/tmp`
  content.

### Acceptance criteria

- Two sequential fixture runs produce two distinct history files.
- `/tmp/lonestar-verify.json` contains the second run after those executions.
- Both history files parse and retain their original timestamps and arguments.
- An invalid `VERIFY_JSON` path produces a visible warning.
- Strict telemetry mode returns nonzero when required telemetry cannot be
  written; default mode preserves the test result while warning.

## 2. Preserve structured failure identity

### Problem

Failed checks currently retain only `{name, ms, status}`. Their messages are
available in the text log but absent from JSON. Fatal page errors increment the
attempt's failure count without adding any failed check or other structured
failure record. As a result, an attempt can report `failed: 1` while its JSON
contains only passing checks.

This prevents the recorded data from answering which failure recurred, whether
the pool and solo attempts failed for the same reason, or which page-error
signatures should inform a future flake policy.

### Required change

Add a compact `failures` array to every attempt. Each entry should contain:

```json
{
  "type": "assertion | pageerror | runner",
  "check": "check name or null",
  "message": "first diagnostic line",
  "signature": "stable compact identity",
  "count": 1
}
```

Implementation rules:

- Add one entry for every failed `t.check()` call.
- Add one entry for every distinct page-error signature, retaining the observed
  occurrence count.
- Keep stacks and repeated lines out of JSON; the text log remains the place for
  verbose diagnostics.
- Derive signatures deterministically from failure type, check name, and a
  normalized first message line. Dynamic numbers, timing values, and temporary
  paths should not make otherwise identical failures look unrelated.
- Define the accounting invariant explicitly: the attempt's `failed` total must
  equal the number of counted failure entries, while each entry's `count`
  records repeated occurrences of that same failure.
- Add a JSON schema version before changing the report shape.

### Acceptance criteria

- The assertion fixture records an `assertion` failure with its check name and
  stable signature.
- The page-error fixture records a `pageerror` failure even though its normal
  check passes.
- Pool and solo attempts keep independent failure arrays.
- Failure totals reconcile with structured failure entries.
- Repeated identical page errors produce one entry with an increased count.

## 3. Cover the contracts in the runner self-test

### Problem

`TEST_CYCLE_SPEC.md` says the runner self-test validates the non-finite
`t.near()` guard, but none of its fixtures invokes `t.near()`. The self-test also
has no fail-then-pass fixture, so it does not exercise the solo-green flake
count, temporary exit-zero policy, or preservation of the original failed
attempt in that case.

### Required change

- Add a fixture that calls `t.near(NaN, 0, ...)` and confirm that it fails with
  the non-finite diagnostic on both attempts.
- Add a deterministic solo-green fixture. It must fail its pool attempt, pass
  its solo attempt, and be isolated from machine timing or browser contention.
- Run the solo-green fixture in a separate child invocation so its expected
  exit code can be asserted as zero without a permanent-failure fixture masking
  the result.
- Assert the flake clause in the summary, `totals.flakes`, the suite's `flake`
  flag, and both attempt records.
- Assert that the original pool failure still has its structured failure
  identity after the solo attempt passes.
- Extend the page-error assertions to validate the new structured failure
  record, not only stdout.
- Keep self-test output compact and print child output only when an assertion
  fails.
- Update `TEST_CYCLE_SPEC.md` so its stated coverage exactly matches executable
  assertions.

### Acceptance criteria

- Reverting the finite-number guard makes the self-test fail.
- Removing the flake count from the summary makes the self-test fail.
- Restoring pool-attempt overwrite behavior makes the self-test fail.
- Removing fatal page-error accounting makes the self-test fail.
- Changing the JSON failure schema without updating the self-test makes the
  self-test fail.

## 4. Record comparable run conditions

### Problem

The machine block is created after browser execution and teardown. Its free
memory and load therefore do not describe the conditions used to choose worker
width or the conditions at the beginning of the measured run. The JSON also
does not record whether a requested screenshot caused real rendering, even
though rendering materially changes timing.

### Required change

- Capture a start snapshot immediately before calculating the memory cap and
  launching workers.
- Capture an end snapshot after browser teardown.
- Store both snapshots with timestamps, CPU count, free memory, and load
  averages.
- Retain requested and effective worker widths beside those snapshots.
- Instrument `t.shot()` so each attempt records how many real-render frames and
  screenshots it requested. Do not infer rendering solely from the presence of
  the `SHOT` environment variable.
- Include aggregate rendering counts at report level so two runs with different
  rendering work cannot be compared accidentally.
- Version the schema so existing consumers can distinguish the old single
  machine block from the start/end form.

### Acceptance criteria

- Every completed report contains start and end machine snapshots in temporal
  order.
- The start snapshot is the one used by the default worker-width calculation.
- A normal fixture run reports zero requested screenshots and render frames.
- A fixture that invokes `t.shot()` reports the exact nonzero counts.
- The report remains compact enough to inspect without printing passing-check
  detail to the console.

## Implementation order

1. Define and version the revised JSON schema.
2. Add structured failure records and reconciliation checks.
3. Add durable history, atomic latest-report writes, and visible write errors.
4. Add start/end condition and rendering instrumentation.
5. Expand the fixtures and runner self-test against the complete schema.
6. Update testing documentation only after the executable contracts pass.

## Verification plan

1. Run syntax and fast project checks.
2. Run `node tools/verify-selftest.mjs` and require every assertion to pass.
3. Run two sequential green fixtures and inspect latest/history persistence.
4. Run a fixture with an invalid telemetry destination and verify default and
   strict-mode behavior.
5. Run the screenshot fixture once with capture enabled and verify rendering
   counts and the produced image.
6. Run the complete browser verification once after all runner contracts pass;
   retain that report as the first trusted entry in the new history format.

## Completion criteria

This follow-up is complete only when:

- reports survive beyond the next verification run;
- telemetry write failures are visible;
- every counted failure has structured identity;
- finite-number, fatal-pageerror, confirmed-failure, and solo-green paths are
  executable self-test cases;
- recorded machine conditions describe both the start and end of the run;
- rendering work is explicit in telemetry;
- documentation no longer promises behavior that the runner or self-test does
  not enforce.
