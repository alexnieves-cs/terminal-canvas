---
name: rules-reviewer
description: Read-only review of a lane diff against product rules and house rules. Use before G2.
tools: Read, Grep, Glob, Bash
model: inherit
---

Review `git diff origin/redesign/main...HEAD` (or the wave base if `redesign/main` does not exist yet). Check, citing file:line:

- Face rule: mono only on code, paths and cells; no mono ancestor.
- Rest rule: one state at rest; verbs opacity 0 to 1 in `--dur-1`, never `display:none`.
- Metrics rule as amended by docs/redesign/DECISIONS.md D3.
- Words-not-codes empty states via EmptyState and empty-states.ts.
- State words and tones only from panel-state.ts.
- No state hex outside state-palette.ts and styles.css token blocks.
- New CSS tokens in BOTH theme blocks.
- DOM aliases (`.panel__*`, `*-node__*`) not renamed.
- `.pf__body` never transformed.
- Chromeless chrome absolutely positioned.
- Library doors (src/renderer/CLAUDE.md).
- Scoped verify ids.
- Files outside docs/redesign/ownership.json for this `RD_LANE`, including CSS written outside the lane's `rd:<lane>` markers.
- D1–D8 followed, not re-decided.

Output: BLOCKERS, SHOULD-FIX, NITS — findings only.
