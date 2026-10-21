#!/bin/bash
# SessionStart: stdout is added to the session context.
cat >/dev/null
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
# A cloud session cannot set RD_LANE, so the lane may live in .git/tc-lane
# (see docs/streams/RUN.md); the edit hook reads the same two places.
LANE="${RD_LANE:-$(cat .git/tc-lane 2>/dev/null)}"
echo "Lane: ${LANE:-unset}  Branch: $(git branch --show-current 2>/dev/null)  Base: $(git describe --tags --abbrev=0 2>/dev/null || echo none)"
if [ -n "$LANE" ] && RD_LANE="$LANE" node -e 'process.exit(require("./docs/streams/ownership.json").lanes[process.env.RD_LANE] ? 0 : 1)' 2>/dev/null; then
  echo "Run book: docs/streams/RUN.md  Plan: docs/streams/ROADMAP.md  Ledger: docs/build-log/m457-m509-ledger.md"
  echo "Owned globs (shared files and files nobody owns are also open):"
  RD_LANE="$LANE" node -e 'console.log(require("./docs/streams/ownership.json").lanes[process.env.RD_LANE].join("\n"))'
  echo "Open requests:"
  tail -n 15 docs/streams/requests.md 2>/dev/null
  exit 0
fi
echo "Live run: docs/streams/RUN.md (lanes A-E; set one with: echo <lane> > .git/tc-lane)"
echo "Redesign run book: docs/redesign/RUN.md  Decisions: docs/redesign/DECISIONS.md"
echo "Owned globs:"
RD_LANE="$LANE" node -e 'const o=require("./docs/redesign/ownership.json"); console.log((o.lanes[process.env.RD_LANE]||[]).join("\n")||"(lead or unset — no lane filter)")'
echo "Open requests:"
tail -n 15 docs/redesign/requests.md 2>/dev/null
