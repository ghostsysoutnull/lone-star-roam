#!/usr/bin/env bash
# judge-shot.sh — Copilot screenshot analysis with the locked-down invocation
# from GOTCHAS.md → Verification. Never loads the image into Claude's context.
# Usage: tools/judge-shot.sh <shot.png> "<question>" [facts|judgment]
#   facts (default) → gemini-3.5-flash --effort low   (factual reads)
#   judgment        → claude-sonnet-5                 (composition/feel reads)
# The bogus --available-tools name disables ALL of Copilot's tools; never
# swap it for --allow-all-tools (that lets Copilot read repo files).
set -euo pipefail
shot="${1:?usage: tools/judge-shot.sh <shot.png> \"<question>\" [facts|judgment]}"
q="${2:?missing question — targeted and word-capped, answerable from the image alone}"
tier="${3:-facts}"
[ -f "$shot" ] || { echo "no such file: $shot" >&2; exit 1; }
command -v copilot >/dev/null || { echo "copilot CLI not installed" >&2; exit 1; }
case "$tier" in
  facts)    model="gemini-3.5-flash"; set -- --effort low ;;
  judgment) model="claude-sonnet-5";  set -- ;;
  *) echo "tier must be facts|judgment" >&2; exit 1 ;;
esac
exec copilot -p "$q" --attachment "$shot" --model "$model" "$@" \
  --available-tools ask_user --no-ask-user
