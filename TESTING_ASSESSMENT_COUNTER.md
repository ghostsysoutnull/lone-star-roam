# Counterpoint to the testing assessment review

Date: 2026-07-22

## Position

The review correctly validates the assessment's main findings, but it moves too quickly from diagnosis to a committed two-wave delivery track.

The immediate commitment should be test trustworthiness plus measurement. The startup implementation should remain undecided until better measurement identifies the exact caller, repeatable baseline, and expected wall-time payoff.

## The 306-second baseline caveat is misstated

The 306-second run was an existing current-HEAD report at `j=4`. The assessment did not produce that run while the machine reported 0.8 GiB free.

The low-memory reading occurred later during the assessment. Its targeted browser probes explicitly used `j=4`, so automatic worker-width selection did not affect those results.

The valid caveat is broader:

- the earlier 227-second run preceded later suite growth;
- the 306-second run included two solo confirmation reruns;
- machine contention was not recorded for either baseline;
- startup and check-body timings were not separated;
- the original failed-attempt timings were overwritten by the solo results.

The baseline is variable and incomplete, but low free memory does not explain away the recorded 306-second result.

## The profile identifies a hotspot, not yet the replacement

The CPU profile attributed 3.9 seconds of a 6.75-second isolated page boot to polygon containment. It did not prove that all 3.9 seconds came from neighboring-state terrain tinting.

The same containment function serves several startup paths. Terrain classification is the strongest source-level suspect, but caller-level timing or call counts should confirm the attribution before a replacement is selected.

A baked state mask is not a purely mechanical optimization. It introduces:

- a new generated asset;
- another grid-format contract;
- coordinate and grid-dimension synchronization obligations;
- boundary-equivalence risk;
- a visible terrain-color dependency;
- rebake and documentation obligations.

A runtime scanline classifier or specialized spatial index may deliver most of the gain with less pipeline risk. Improved measurement should choose between those approaches.

## Phase 1 is not entirely mechanical

The finite-number assertion fix is straightforward.

The flake policy is not. Parallel real-loop timing flakes are an established class and do not belong to a stable suite list. Making every previously unknown solo-green failure fatal could turn the full gate permanently red under load.

The contract must first decide:

- which failure signatures qualify for automatic confirmation;
- whether known flakes have an expiry or budget;
- whether one solo-green rerun is sufficient evidence;
- how an unknown intermittent failure affects exit status;
- how repeated known flakes are escalated into real defects.

That is reliability policy, not mechanical harness plumbing.

Page-error handling also needs runner self-tests. Unexpected page errors must fail, but attempt accounting should ensure that a late event or an exception already represented by a failed check does not produce misleading duplicate diagnoses.

## Scheduler weights should follow telemetry

The missing weight entries are a real maintenance defect. Updating them from body duration alone is not automatically a speed improvement.

Every scheduled suite carries a large and nearly uniform startup cost. A longest-body-first order can still leave one worker with an extra full startup and make the complete run slower, even when every body estimate is accurate.

Scheduling should use measured end-to-end attempt cost:

- page startup;
- initial settling;
- check body;
- cleanup;
- expected retry cost;
- worker contention class, especially for true rendering.

The runner should also keep page counts balanced across workers. Weight changes should follow telemetry rather than join the trivial-fix bucket.

## What the review gets right

The following conclusions stand:

- the approximate-number helper contains the most serious silent correctness defect;
- unexpected page errors must affect the result;
- the ferry screenshot must not run by default;
- pooled and solo attempts must both remain visible;
- the final summary must state its flake count;
- shared boot shards should remain parked;
- broad Node migration is primarily incremental maintainability work;
- telemetry must precede performance claims;
- the startup hotspot is a promising browser-gate optimization candidate.

## Better sequencing

Do not commit to a two-wave harness track yet.

Use one narrowly scoped hardening and measurement wave:

1. Reject non-finite approximate comparisons.
2. Make unexpected page errors fail with runner self-tests.
3. Preserve pooled and solo attempt records.
4. Report flakes explicitly in the final summary.
5. Gate the ferry screenshot and render one explicit frame for requested shots.
6. Record startup, settling, body, cleanup, and retry timings.
7. Record worker width and machine conditions with every run.
8. Keep the existing flake exit policy temporarily, while collecting structured evidence for its replacement.

Then collect comparable measurements and decide whether polygon classification remains the dominant actionable hotspot.

The hardening work should stand on its own as a testing investment. It should not imply approval for the larger startup optimization until its new measurements are available.

## How measurement should improve

Performance comparisons should separate:

- preparation and game-start time;
- actual checking time;
- cleanup time;
- retry time;
- time lost to contention.

Every report should retain:

- each original and retry attempt;
- worker width;
- machine load and available memory;
- whether true rendering occurred;
- the selected suite order;
- per-suite and per-check durations;
- flake and confirmed-failure counts.

Comparison protocol:

1. Use the same worker width and machine conditions.
2. Use a fixed representative suite panel for cheap experiments.
3. Run enough repetitions to report the median and spread, not one result.
4. Keep clean runs separate from runs containing retries.
5. Confirm a promising change once with the complete suite.
6. Attribute savings to startup, body, retry, or scheduling before declaring the work successful.

This prevents a loaded-machine result, a lucky clean run, or a changed retry count from being mistaken for an implementation improvement.

## Revised recommendation

Approve one hardening-and-telemetry wave, not a two-wave track.

After that wave:

- keep shared boot shards and broad migration work in the backlog;
- review caller-level startup measurements;
- authorize a separate startup optimization only if the measured testing payoff remains dominant.

## Executive summary

**Finding:** The review is mostly accurate, but it overstates what the startup profile proves and understates the judgment required for flake handling, scheduling, and terrain changes.

**Take:** Approve one hardening-and-measurement wave. Do not pre-commit to the startup implementation or a two-wave harness track.

**Plan:** Collect comparable testing measurements and decide on the startup optimization afterward.

**Open:** The larger optimization, its implementation shape, and its sequencing remain undecided until caller-level timings are available.
