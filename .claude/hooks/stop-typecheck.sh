#!/bin/bash
# Stop: keep the session working until the tree typechecks. stop_hook_active
# prevents an infinite loop when the failure is not something this turn can fix.
INPUT=$(cat)
if echo "$INPUT" | grep -q '"stop_hook_active": *true'; then exit 0; fi
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
OUT=$(npm run -s typecheck 2>&1) || {
  echo "Typecheck failed - fix before stopping:" >&2
  echo "$OUT" | tail -40 >&2
  exit 2
}
exit 0
