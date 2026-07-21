#!/usr/bin/env bash
# law.sh — pre-coding lookup in one call: matching GOTCHAS.md bullets (the law
# book), MODULES.md anchor lines, and a per-file src hit count to grep next.
# Usage: tools/law.sh <pattern>    pattern is a case-insensitive ERE,
#        e.g. tools/law.sh 'rail|siding'   or   tools/law.sh chapel
set -euo pipefail
cd "$(dirname "$0")/.."
pat="${1:?usage: tools/law.sh <pattern>}"

echo "== GOTCHAS.md =="
awk -v pat="$pat" '
  BEGIN { lpat = tolower(pat) }
  function flush() { if (blk != "" && tolower(blk) ~ lpat) printf "[%s]\n%s\n\n", sec, blk; blk = "" }
  /^#/   { flush(); sec = $0; next }
  /^- /  { flush(); blk = $0; next }
  { if (blk != "" && $0 != "") blk = blk "\n" $0 }
  END    { flush() }
' GOTCHAS.md

echo "== MODULES.md =="
grep -iE -- "$pat" MODULES.md | grep '^-' || echo "(no anchor lines)"

echo
echo "== src hits (file:matches) =="
rg -ic -- "$pat" src tools/checks 2>/dev/null | sort -t: -k2 -rn || echo "(none)"
