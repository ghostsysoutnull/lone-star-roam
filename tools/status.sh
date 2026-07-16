#!/usr/bin/env bash
# Session status in one call (token-cheap boot/pre-commit check):
# branch + sync + dirty tree, last commits, NEXT_SESSION.md freshness, module syntax.
cd "$(dirname "$0")/.." || exit 1

git status -sb
git log -5 --format='%h %cd %s' --date=format:'%m-%d %H:%M'

if [ "$(git log -1 --format=%H -- NEXT_SESSION.md)" = "$(git log -1 --format=%H)" ]; then
  echo "NEXT_SESSION.md: updated in HEAD"
else
  echo "NEXT_SESSION.md: last touched in $(git log -1 --format='%h (%cd)' --date=format:'%m-%d' -- NEXT_SESSION.md)"
fi

bad=0
for f in src/*.js tools/*.mjs tools/checks/*.mjs; do
  out=$(node --check "$f" 2>&1) || { echo "$out" | head -3; bad=1; }
done
[ "$bad" = 0 ] && echo "syntax OK ($(ls src/*.js tools/*.mjs tools/checks/*.mjs | wc -l) files)"

if [ "$bad" = 0 ]; then
  node tools/test.mjs || bad=1
else
  echo "fast checks skipped (syntax errors)"
fi

exit "$bad"
