# Vision — external-model agents in the dev loop

Status: parked 2026-07-21 (assessment done, no integration built; CLI
surfaces probed same day, no trials run). This doc records the strategy so a
future session can retake it without re-deriving the analysis. Not a game
track — a dev-process track; if retaken it follows the multi-wave protocol
like any other effort (spec first if more than one session).

## What exists today

- **`wave-coder`** (`.claude/agents/wave-coder.md`, pinned Sonnet 5): the
  in-family delegation lane — handoff waves and mechanical chunks. Working
  and defect-free on its last chunks (LEDGER compression 2026-07-21: 46/46
  rows to contract, self-caught its own errors). The ledger's model column
  (`fable` vs `fable+sonnet-agent`) tracks its ROI.
- **Copilot CLI** (`copilot`, 1.0.73 on 2026-07-21, update available):
  locked-down screenshot judging only (`tools/judge-shot.sh`; lockdown law
  in `GOTCHAS.md` → Verification). The lockdown lesson came from Copilot
  taking unprompted shell actions without it.
- **Codex CLI** (`codex`, 0.144.5 on 2026-07-21): installed, **authenticated**
  (`codex doctor`: auth configured, ChatGPT mode), unused. OpenAI's agentic
  CLI, frontier GPT models. Ships a purpose-built non-interactive review
  subcommand — see Probed surfaces.
- **Antigravity** (`agy`, 1.1.5 on 2026-07-21): installed, unused, auth
  state unverified. Google's agentic CLI, frontier Gemini models. Weakest
  lockdown surface of the three.

## The assessed position (2026-07-21)

- **Mechanical chunk execution: keep wave-coder.** Chunk quality is already
  at the contract ceiling; a frontier external model cannot improve
  "zero defects" and adds integration cost (invocation wrapper, contract
  format, sandbox confinement) to a lane that is not underperforming.
  Haiku-tier downgrade also rejected (real error surface in chunk work;
  self-catching is what the lower tier does worst).
- **Independent-model review is the genuine value.** A different model
  family catches different bugs than any same-family reviewer — diversity
  value no Anthropic-side delegation provides. Natural slot: an optional
  adversarial review pass over a wave's diff on risky waves (new-system
  architecture, physics, save-format changes), findings reported for the
  main session to verify — never an editor.
- **Review is also the safest integration**: read-only invocation, small
  lockdown wrapper, failure mode is a bad opinion rather than a bad edit.
- **Codex is the lane-1 vehicle, `agy` is second** — decided on lockdown
  quality, not model preference (see Probed surfaces). Codex is also
  already authenticated, so lane 1 costs lockdown work only, no setup.
- **Billing**: external CLIs spend OpenAI/Google quota instead of Claude
  tokens — relevant to session token budgets, but only where the output
  earns its review time.

## Probed surfaces (2026-07-21 — facts, re-probe at retake)

Recorded per the doc's own law: probed flags belong in the record, and CLI
versions are point-in-time facts.

**Codex** — richest lockdown surface of the three, better than judge-shot's.
- `codex review [--commit <SHA> | --base <BRANCH> | --uncommitted]
  [PROMPT]` — first-class non-interactive code review. Custom review
  instructions arrive as the prompt (`-` reads stdin). This is lane 1's
  vehicle; no diff-piping wrapper needs inventing.
- `codex exec` lockdown flags: `-s read-only` (real sandbox tier; other
  values `workspace-write`, `danger-full-access`), `--ephemeral` (no
  session files persisted), `--ignore-user-config`, `--ignore-rules`
  (skip user/project execpolicy), `-C <DIR>` workdir root.
- Structured output: `--output-schema <FILE>` (JSON Schema for the final
  response) and `-o <FILE>` / `--json`. A schema'd findings list triages
  like a flake report — fits "findings are claims, not fixes" directly.
- Never pass `--dangerously-bypass-approvals-and-sandbox` or
  `--dangerously-bypass-hook-trust`. Copilot's `--allow-all-tools`
  precedent applies verbatim.

**Antigravity** — thinner. `--print` (non-interactive), `--sandbox`
(documented only as "terminal restrictions" — no read-only tier equivalent
to codex's), `--mode plan`, `--model`, `--effort low|medium|high`,
`--add-dir`. Its `--allow-all-tools` counterpart is
`--dangerously-skip-permissions`. The absence of a read-only sandbox tier
is why it ranks second.

**Model rosters** (the trap — see Standing constraints):
- `agy models` → `gemini-3.5-flash-{low,medium,high}`,
  `gemini-3.1-pro-{low,high}`, **`claude-sonnet-4-6`**,
  **`claude-opus-4-6-thinking`**, `gpt-oss-120b-medium`.
- Copilot fronts `claude-sonnet-5` (judge-shot's judgment tier) alongside
  `gemini-3.5-flash`. Its full roster is unenumerated —
  `--list-models` is not a valid flag.

**Unverified — verify at retake, do not assume:**
- Whether `codex review` honors `-c sandbox_mode="read-only"`. It does not
  expose `-s` in its own flag list, so the sandbox must come through a
  config override; that it holds is a hypothesis, not a probe result.
- Whether `codex review` can take unprompted actions under that override.
- Whether Copilot usefully reviews a *text* diff (`--attachment` is
  documented for images and native documents).
- Whether `agy` is authenticated.

## Gate result (2026-07-21) — recall poor, precision high, live bug found

Harness: depth-2 clone of a temp branch at the defect commit, built inside a
throwaway full clone so the real repo never receives a ref. `git cat-file -e
68aec12` fails inside it; codex independently reported 2 visible commits.
Model pinned `gpt-5.6-sol` (OpenAI, high effort). Lockdown probe: write
attempt blocked by the OS (`Read-only file system`), no file created.
Both previously-unverified hypotheses now settled — the sandbox holds and
the answer key is unreachable. (`bubblewrap` absent from PATH; codex fell
back to its bundled copy, sandbox still enforced.)

**Gold case: MISSED.** `codex review --commit 5f560fe` did not find the
solar clearance omission it was tested on.

*Location correction (2026-07-21):* the defect is **not** inside
`solarSitesAt`, despite `68aec12`'s commit message saying so. At that
commit `solarSitesAt` is a pure filter over baked plant coordinates and
needs no checks. The missing clearance is one level up, in the
ScenerySystem render branch, which draws an `r*2 × r*2` field patch plus
crop rows at the baked radius **unconditionally** — while the turbine
branch a few lines away gates on road and airport. The miss still counts:
that is the same sibling-inconsistency pattern codex *did* catch between
turbines and their siblings.

**But it found a real, larger, still-live defect instead.** Two findings,
both on `windTurbinesAt`, both same-class (placement legality):

1. **Turbine cap applied before circle rejection** — `expect` is capped at
   `TURBINE_CAP` *before* `draws` is derived, then candidates are drawn
   across the whole 260-unit chunk and rejected against the farm circle.
   Compact farms occupy ~2% of a chunk, so nearly every draw is rejected.
   Verified independently by replaying the real `seededRand` stream against
   `data/energy.json`: of 145 compact farms (r ≤ 130, count ≥ 5) holding
   11,021 real turbines, **133 render under 25% of their baked count and 15
   render zero** — deterministic counts, before the `inTexas`/road/airport
   gates that only cut further. The reviewer's cited farm (count 17, r 20)
   renders zero, exactly as it claimed. `windTurbinesAt` at HEAD is
   byte-identical to the reviewed version, so this ships today.
2. **No `cityClear` gate** — turbines check road and airport clearance but
   not city footprints, unlike sibling placement functions. Omission
   confirmed by inspection; the specific Snyder instance is unverified.

**Scoring, against the pre-registered standard.** The gate was written as
binary — "does it name that omission, unprompted?" It did not. **By the
standard set before the run, the gold case is a FAIL.** The unexpected find
does not retroactively pass it; that would be validating the method on
exploratory data after the pre-registered test failed.

The asymmetry makes the miss sharper, not incidental: it found the
*turbine* missing-`cityClear` omission while missing the *solar*
missing-all-clearance omission — same bug class, same commit, same diff.
That pattern reads as triage and luck, not reliable detection.

**Two separable conclusions, and only one is supported:**
- **Validated as an opportunistic finder** (n=1): it surfaced a live defect
  that survived Fable review, Sonnet review, a full verify suite, and
  months of play. That is the diversity value this doc predicted.
- **NOT validated as a gate or safety net**: it missed the seeded bug, so a
  clean report from it means nothing. Never treat its silence as assurance.

**Negative control: PASSED, cleanly.** `codex review --commit 8021248` (the
H-frame rework — purely cosmetic, 75 lines, one file, nothing real to
find). It spent 15 tool calls probing tower counts, terrain seating,
conductor spans and placement angles numerically, then returned **zero
findings**: "No actionable regression was identified in the changed code."
It investigated hard and correctly declined to invent anything.

**Measured profile: low noise, incomplete coverage.**
- **Precision: high.** 2 findings on the defect commit, both legitimate
  (1 verified real, 1 confirmed omission); 0 findings on a clean commit
  despite deep investigation. No fabrication observed. Triage cost is
  therefore cheap — the reason to run it is that its output is short and
  worth reading.
- **Recall: poor.** It missed the seeded bug while flagging a same-class
  omission in the same diff.

The practical consequence of that asymmetry: **believe it when it speaks,
never read its silence as a clean bill of health.** That makes it a good
opportunistic finder and a useless gate, which is exactly how it should be
integrated.

Caveat that remains: measured on n=2 commits, both from the Energy track.

## Standing rules for this effort (set 2026-07-21)

- **This effort files bugs; it does not fix them.** Every defect an external
  reviewer surfaces goes to `BACKLOG.md` with full provenance and waits for
  a future wave. Nothing is fixed in the session that finds it. This keeps
  the evaluation honest — a finder that also patches its own findings can
  no longer be scored — and keeps wave scope from being hijacked by
  whatever the reviewer happened to notice.
- **Provenance is mandatory per backlog entry**: how it was found, which
  external model found it, whether it was independently verified
  in-session, and the Claude session model that ran the effort.
- **Record the Claude session model, every time.** Session provenance is
  part of the finding. See the erratum below — this rule exists because it
  was got wrong on day one.
- **An all-clear carries no evidential weight.** Only positive, verified
  findings count. See Round A: Gemini's confident "No defects found" was
  issued over known-broken code it had described correctly.

### Erratum — session model misattributed (2026-07-21)

Commits `94c8fc5`, `87554e8` and `77768eb` carry
`Co-Authored-By: Claude Fable 5`. **The session ran Opus 4.8 (1M context)**
(`claude-opus-4-8[1m]`). The trailer was copied from prior commits without
checking the running model, and the session greeting additionally asserted
Fable 5 was running — the inverse of CLAUDE.md's "flag it if a different
model is running" rule. Pushed history left intact; the correction lives
here and in `BACKLOG.md`. Check the running model before writing a trailer.

## Planned rounds (agreed 2026-07-21 — run one at a time, in order)

**Status: A done. B and C deferred to a later session at Bruno's
direction.** Round A's result (below) lowered their value — B can only
refine an established profile, and C is no longer evaluation but
bug-hunting with a validated finder. Both remain worth running; neither is
urgent.

### Round A — RESULT (2026-07-21): no case for a panel; codex is the reviewer

Run under the option-b design: identical 27 KB diff of `5f560fe` as prompt
text, identical neutral prompt (no mention of solar, placement or
clearance), empty working directory, no repo access for either. Models
pinned `gemini-3.1-pro-high` and `gpt-5.6-sol`.

**Tier note — Gemini was not run cheap.** The head-to-head used
`gemini-3.1-pro-high`, Google's strongest tier on the `agy` roster, against
`gpt-5.6-sol` at reasoning effort high. `gemini-3.1-pro-low` appears in
this record only in the lockdown probes (auth, write, shell and read
permission tests), never in a scored review. Gemini's result is therefore
not attributable to tier selection.

| | solar clearance omission | turbine cap defect |
|---|---|---|
| **codex / GPT**, text-only | missed | **found** (+ a second real defect) |
| **Gemini**, text-only | missed | **missed, and explicitly validated it** |

- **Gemini returned "No defects found"** — then wrote a confident four-point
  review affirming the code sound, including: *"Rejection checks … are
  correctly applied before capping per-chunk instances to 32."* That is the
  defect, described accurately and certified correct.
- **codex reproduced its finding with no tools at all** (its one shell call
  was an `ls` of the empty dir). So its gate-run win was *not* tool-
  dependent — it re-derived the cap defect from the diff text alone. This
  retires the confound that motivated option b.
- **codex also found a second real defect**: `draws = Math.ceil(expect) + 3`
  means chunks fully inside a farm accept every candidate, so interior
  chunks *over*-populate (expect 6.6 → 10 turbines). Verified: 5 farms
  render over their baked count while 213 render under.
- **Statewide verification**: 27,644 baked turbines → **5,175 rendered
  (19%)**. The sampler is wrong in both directions, dominated by
  under-rendering.

**Conclusion: no evidence for a two-model panel.** The diversity thesis
predicted different families catch different bugs; on this corpus Gemini
caught strictly less than nothing — a false all-clear over known-broken
code. codex is the reviewer; `agy` is not worth integrating on this
evidence.

**Hardened operating rule.** Earlier phrasing was "never read its silence
as a clean bill of health." Gemini's run shows that is too weak: it did not
stay silent, it actively asserted correctness. **An all-clear from these
tools carries no evidential weight — treat it as noise, not reassurance.**
Only positive findings count, and only after verification.

Residual asymmetry, recorded not hidden: codex retained shell access
(unused beyond `ls`), Gemini's was denied. With no repo present there was
nothing to probe, so the comparison is fair in substance.

Scope note: **only the defect arm was run.** Gemini never saw the control
commit (`8021248`). Judged unnecessary — a model that returns zero findings
on the *defect* commit has already demonstrated it is not noisy, so the
control could only reconfirm silence. Recorded so the two-arm plan does not
read as silently half-executed.

### Round A — original plan (superseded by the result above)

Re-run both gate commits (`5f560fe` defect, `8021248` control) through
Antigravity with a Gemini model pinned, then diff the findings against
codex's.
- *Decides*: whether the integration is one reviewer or a two-model panel.
  The sharp question is whether Gemini finds the `solarSitesAt` clearance
  omission codex missed. A different-family hit there is direct evidence
  for the doc's central diversity thesis; a same miss suggests the bug is
  simply hard to see in that diff, and one reviewer suffices.
- *Lockdown: PROBED 2026-07-21 (5 tests) — safe enough to run, but the
  round as designed is CONFOUNDED.* See below.
- *Cost*: 2 review calls, plus a decision on the confound first.

### `agy` lockdown probe (2026-07-21)

Authenticated and working (`--print`, non-interactive). Model pin is
trustworthy: a bogus slug fails loudly and lists the valid roster, the
`judge-shot.sh` precedent — so pinning a Gemini model reliably keeps
Anthropic models out of the loop.

Probes below ran on `gemini-3.1-pro-low` — deliberately the cheap tier,
since they test the CLI's permission surface, not model quality. No scored
review used it; the Round A head-to-head used `gemini-3.1-pro-high`.

| capability | codex `-s read-only` | agy `--print --sandbox` |
|---|---|---|
| read workspace files | yes | yes |
| run shell commands | **yes** (git, node, sed) | **no** — auto-denied |
| write workspace files | no | no |
| write outside workspace | no | **yes** — see below |
| enforcement | **OS-level** (read-only FS) | **policy-level** (headless auto-deny) |

- **Writes into the workspace are blocked**, but by headless
  permission auto-deny, *not* by `--sandbox`. Both `write_file` and
  `command` are denied because headless mode cannot prompt. Any
  allow-rule in `settings.json`, or `--dangerously-skip-permissions`,
  removes the protection entirely. Policy can be misconfigured; a
  read-only filesystem cannot be talked around. **codex's guarantee is
  strictly stronger.**
- **There is a pre-approved write path outside the workspace.** With no
  active workspace, agy silently redirected a file write to
  `~/.gemini/antigravity-cli/scratch/` and succeeded. It did not refuse —
  it relocated. Contained and known, but it is a real write path in
  `$HOME`. (Probe file deleted.)

**The confound.** Because `command` is auto-denied, agy cannot run `git`,
`node` or any probe. codex's most credible evidence — running node scripts
against `data/energy.json` to prove specific farms render zero turbines —
is unavailable to agy in this configuration. A weaker agy review would
therefore be attributable to *tool starvation, not model family*, which is
exactly the variable round A exists to isolate. Running it as-is would
produce an uninterpretable result.

Ways out, none free:
1. **Narrow allow-rules** in `~/.gemini/settings.json` for read-only
   commands. Closest to parity, but `command(...)` allow-rules risk
   re-opening writes via shell redirection, and it means editing Bruno's
   global config — his call, not a session decision.
2. **Feed the diff as prompt text.** No tools needed; both models then
   reason over identical input. Fair comparison of *diff reasoning*, but
   handicaps codex relative to its own gate run, so it does not compare
   like-for-like against the recorded result.
3. **Run agy degraded and label it.** Answers "can Gemini catch it by
   reading alone?" — a real question, but not the family comparison.

**Round B — breadth, commits outside the Energy track.** Tests whether the
high-precision / poor-recall profile generalizes or is an artifact of one
track's code style.
- *Decides*: how much to trust the profile when designing the integration.
- *Known limit*: corpus is thin. Most `fix:` commits (`8398546` unit
  mismatch, `b5671ec` placement legality, `54b3511`, `308ce22`) have no
  single clean defect-introducing commit, so each needs archaeology or the
  tree-audit mode (review the file at the fix's parent) rather than
  `--commit`.
- *Cost*: archaeology per case + 1 review call each.

**Round C — live audit of current HEAD.** Point the reviewer at shipped
code rather than history.
- *Decides*: nothing about the tool — there is no ground truth here, so it
  measures no precision or recall. This is bug-hunting, not evaluation,
  and should be judged on bugs found rather than on what it teaches about
  the reviewer.
- *Cost*: every finding needs main-session verification before it counts
  (the turbine finding took two probes, one of which was wrong on the
  first attempt). Budget verification time, not just review calls.
- *Note*: the two known bug classes are already swept by hand — the
  cap-before-draw pattern is unique to `windTurbinesAt`, and every other
  seeded placement function checks city clearance (some via `cityClear`,
  `ranchHQSite` via `nearestCity` + `cityRadius`). So round C should hunt
  classes we have *not* thought of, not re-run these.

## Candidate first waves (when retaken)

1. **Backtest the reviewer before trusting it** — the gate, and it comes
   first. Run `codex review --commit <SHA>` against a past wave's diff
   whose defects are already known and score the hit rate against ground
   truth. Point it at the **defect-introducing** commit, not the fix
   commit — `--commit <SHA>` reviews the changes that commit introduced,
   so the fix SHA shows corrected code and scores nothing.

   Corpus notes (verified 2026-07-21):
   - Gold case is `5f560fe` (Energy W3) → fixed by `68aec12`:
     `solarSitesAt` shipped as the only Energy placement function with no
     road/river clearance check while every sibling had one. Sibling
     inconsistency, visible inside the diff, human-reported.
   - **Map W1.1 is unusable** — W1, W1.1 and W1.2 are folded into a single
     commit (`60bf81d`), so defect and fix share one diff and there is
     nothing to score. Do not use it.
   - Aesthetic reworks (`8021248` lattice→H-frame, `9b32732` W4.5 solar,
     `dfc54fe`, `01c8547`) are **negative controls**, not targets — a
     code reviewer cannot be expected to find "reads too busy", so
     finding volume there measures false-positive burden.
   - Other `fix:` commits (`8398546` unit mismatch, `b5671ec` placement
     legality, `54b3511`, `308ce22`) are good defects but have no single
     clean introducing commit; reaching them needs the tree-audit mode
     (review the file at the fix's parent) rather than commit review. A findings list on fresh code has nothing to
   score against; a findings list on known-buggy code does. If it misses
   what we already know is there, it does not get a live wave. This
   replaces the earlier blind gate ("trial on the next risky wave").
2. **`tools/review-diff.sh`** — judge-shot-pattern wrapper around
   `codex review`, not around a hand-rolled diff pipe. Lockdown mandatory:
   read-only sandbox (verify the override holds first), `--ephemeral`,
   `--ignore-user-config`, `--ignore-rules`, workdir confinement, pinned
   non-Anthropic model asserted, probed flags recorded in the script
   header. Prefer `--output-schema` for a structured findings list over
   parsing prose. Findings triaged by the main session like flake reports
   (reason before acting).
3. **Execution experiment** (lower priority): one settled-contract chunk
   run through an external CLI under full sandbox, same contract as a
   wave-coder chunk, its own ledger label (e.g. `fable+codex-agent`) so
   the ROI comparison stays honest. Only worth running if the backtest
   shows the model is worth listening to.

Footnote, deliberately *not* promoted: reusing the already-locked-down
Copilot wrapper for text diffs is the cheapest possible first step and
needs no new lockdown — but the value this doc names is independent
*frontier* review, and Copilot's cheap tier is `gemini-3.5-flash --effort
low`, the factual-read tier. Codex is both more capable and more
lockdown-complete. Footnote, not a reordering.

## Standing constraints (apply to any retake)

- **Pin the model and assert the family, every invocation.** `agy` and
  Copilot both front Anthropic models (`claude-sonnet-4-6`,
  `claude-opus-4-6-thinking`, `claude-sonnet-5`). An unpinned invocation
  can answer from an Anthropic model and the entire diversity premise
  evaporates *with no visible failure* — the lane keeps producing
  plausible findings while delivering nothing a same-family reviewer
  wouldn't. Treat a missing/unrecognized model pin as a hard error, never
  a default.
- **Lockdown before first use** — the Copilot precedent is law: probe the
  CLI's tool/permission surface, disable everything not needed, verify the
  lockdown actually holds on a throwaway prompt before real work.
- **Ledger honesty** — any external-agent wave/chunk gets its own model
  label; never fold external work under `fable` or `fable+sonnet-agent`.
- **Review findings are claims, not fixes** — the main session verifies
  before acting; external agents never edit the tree in review lane.
- **Probe versions at retake** — CLIs move fast; the versions and flag
  surfaces above are point-in-time facts, not live state.

## Retake triggers

- A risky wave lands where a second, independent review would have caught
  something Sonnet/Fable review missed (post-mortem evidence).
- Claude-side token budget pressure makes offloading review cycles to
  other quotas attractive.
- Bruno asks for it.
