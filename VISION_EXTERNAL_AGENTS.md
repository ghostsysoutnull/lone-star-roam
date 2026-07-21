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

## Gate result (2026-07-21) — gold case FAILED, live bug found anyway

Harness: depth-2 clone of a temp branch at the defect commit, built inside a
throwaway full clone so the real repo never receives a ref. `git cat-file -e
68aec12` fails inside it; codex independently reported 2 visible commits.
Model pinned `gpt-5.6-sol` (OpenAI, high effort). Lockdown probe: write
attempt blocked by the OS (`Read-only file system`), no file created.
Both previously-unverified hypotheses now settled — the sandbox holds and
the answer key is unreachable. (`bubblewrap` absent from PATH; codex fell
back to its bundled copy, sandbox still enforced.)

**Gold case: MISSED.** `codex review --commit 5f560fe` did not find the
`solarSitesAt` clearance omission it was tested on.

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

Provisional numbers: noise low (2 findings, both specific, both carrying
computed evidence — it ran node probes against baked data rather than
pattern-matching), precision 1 of 2 fully verified real plus 1 confirmed
omission. Both measured on n=2 from a single commit. **The negative
control (false-positive baseline on an aesthetic rework) was not run, so
the false-positive rate — the actual input to "is the triage time worth
it" — remains unmeasured.**

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
