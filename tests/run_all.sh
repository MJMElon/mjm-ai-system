#!/bin/sh
# Every Life of Seedling test, in one go. They lift the real code out of
# operation/operation_reports.html rather than copying it, so a change to the
# page that moves one of their anchors shows up here as a failure rather than
# as a test quietly passing against nothing.
cd "$(dirname "$0")/.." || exit 1
fail=0
for t in tests/*.cjs; do
  printf '%-34s' "$(basename "$t")"
  if node "$t" >/dev/null 2>&1; then echo pass; else echo FAIL; fail=1; fi
done
exit $fail
