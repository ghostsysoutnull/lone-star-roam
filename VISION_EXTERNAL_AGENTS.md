# Vision — external-model agents in the dev loop

Status: parked 2026-07-21 (assessment done, no integration built). This doc
records the strategy so a future session can retake it without re-deriving
the analysis. Not a game track — a dev-process track; if retaken it follows
the multi-wave protocol like any other effort (spec first if more than one
session).

## What exists today

- **`wave-coder`** (`.claude/agents/wave-coder.md`, pinned Sonnet 5): the
  in-family delegation lane — handoff waves and mechanical chunks. Working
  and defect-free on its last chunks (LEDGER compression 2026-07-21: 46/46
  rows to contract, self-caught its own errors). The ledger's model column
  (`fable` vs `fable+sonnet-agent`) tracks its ROI.
- **Copilot CLI** (`copilot`): locked-down screenshot judging only
  (`tools/judge-shot.sh`; lockdown law in `GOTCHAS.md` → Verification).
  The lockdown lesson came from Copilot taking unprompted shell actions
  without it.
- **Codex CLI** (`codex`, probed 0.144.5 on 2026-07-21): installed,
  unused. OpenAI's agentic CLI, frontier GPT models.
- **Antigravity** (`agy`, probed 1.1.5 on 2026-07-21): installed, unused.
  Google's agentic CLI, frontier Gemini models.

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
- **Billing**: external CLIs spend OpenAI/Google quota instead of Claude
  tokens — relevant to session token budgets, but only where the output
  earns its review time.

## Candidate first waves (when retaken)

1. **`tools/review-diff.sh`** — judge-shot-pattern wrapper: feed a diff (or
   ref range) to `codex` and/or `agy` read-only, get a findings list.
   Lockdown mandatory: no file writes, no network beyond the model call,
   workdir confinement, probed flags recorded in the script header.
   Trial on the next risky wave's diff; findings triaged by the main
   session like flake reports (reason before acting).
2. **Execution experiment** (lower priority): one settled-contract chunk
   run through an external CLI under full sandbox, same contract as a
   wave-coder chunk, its own ledger label (e.g. `fable+codex-agent`) so
   the ROI comparison stays honest. Only worth running if lane 1 shows
   the model is worth listening to.

## Standing constraints (apply to any retake)

- **Lockdown before first use** — the Copilot precedent is law: probe the
  CLI's tool/permission surface, disable everything not needed, verify the
  lockdown actually holds on a throwaway prompt before real work.
- **Ledger honesty** — any external-agent wave/chunk gets its own model
  label; never fold external work under `fable` or `fable+sonnet-agent`.
- **Review findings are claims, not fixes** — the main session verifies
  before acting; external agents never edit the tree in review lane.
- **Probe versions at retake** — CLIs move fast; the versions above are
  point-in-time facts, not live state.

## Retake triggers

- A risky wave lands where a second, independent review would have caught
  something Sonnet/Fable review missed (post-mortem evidence).
- Claude-side token budget pressure makes offloading review cycles to
  other quotas attractive.
- Bruno asks for it.
