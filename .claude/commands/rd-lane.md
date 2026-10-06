---
description: Load this lane's brief and produce a plan (use in plan mode)
---

You are lane $RD_LANE of the Terminal Canvas redesign. Read, in order: CLAUDE.md (the redesign section), docs/redesign/DECISIONS.md, docs/redesign/RUN.md, docs/redesign/lanes/$RD_LANE.md, docs/redesign/ownership.json (your entry), docs/redesign/CONCEPT.md, and every mockup PNG your brief names (look at them).

Then use the lb-scout subagent on every existing file your brief lists, in parallel.

Produce a plan: milestones (Mxxx) in order; per milestone the files, the pure model first, the checks (ids) that will prove each acceptance criterion, and the shot scenes. Flag any file you need that you do not own, and any foundation change (goes to docs/redesign/requests.md). Do not edit src/shared/redesign-contracts.ts. Extra focus: $ARGUMENTS
