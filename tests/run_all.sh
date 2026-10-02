#!/bin/sh
# The tests that need nothing but node.
#
# Most of tests/ drives a real browser through Playwright and wants both that
# module and a server on the page under test, so running the lot plainly
# reports two dozen "failures" that are only a missing browser. A runner that
# cries wolf is worse than none, so those are SKIPPED here and named, with
# what they need.
#
#   node tests/<name>.cjs        runs one
#   NODE_PATH=/opt/node22/lib/node_modules node tests/<browser one>.cjs
#                                runs a browser one, with a server already up
cd "$(dirname "$0")/.." || exit 1
fail=0 ran=0 skipped=0
for t in tests/*.cjs; do
  if grep -ql 'playwright\|chromium' "$t" 2>/dev/null || grep -q 'playwright\|chromium' "$t"; then
    skipped=$((skipped + 1)); continue
  fi
  ran=$((ran + 1))
  printf '%-34s' "$(basename "$t")"
  if node "$t" >/dev/null 2>&1; then echo pass; else echo FAIL; fail=1; fi
done
echo ""
echo "$ran run, $skipped skipped (they drive a browser — see the top of this file)"
[ $fail -eq 0 ] && echo "all green"
exit $fail
