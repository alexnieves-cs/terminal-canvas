#!/bin/bash
# SessionStart: stdout is added to the session context.
cat >/dev/null
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
echo "Lane: ${RD_LANE:-unset}  Branch: $(git branch --show-current 2>/dev/null)  Base: $(git describe --tags --abbrev=0 2>/dev/null || echo none)"
echo "Run book: docs/redesign/RUN.md  Decisions: docs/redesign/DECISIONS.md"
echo "Owned globs:"
node -e 'const o=require("./docs/redesign/ownership.json"); console.log((o.lanes[process.env.RD_LANE]||[]).join("\n")||"(lead or unset — no lane filter)")'
echo "Open requests:"
tail -n 15 docs/redesign/requests.md 2>/dev/null
