---
description: LEAD ONLY — merge a lane into redesign/main and run G3
argument-hint: <lane-branch>
---

Refuse unless the current branch is `redesign/main` and `RD_LANE` is `lead`. Until `redesign/main` exists, refuse and say so: Phase 0 merged to `main`, and the lead cuts `redesign/main` from tag `rd-p0` before the first lane merge (docs/redesign/RUN.md).

Steps: fetch; confirm the lane's PR shows G2 results and critic sentences in the ledger; `git merge --no-ff $ARGUMENTS`; on conflict stop and list the hunks (do not resolve foundation files by guessing); `scripts/redesign/with-electron-lock.sh npm run verify`; `npm run build`; update the ledger's merge table; print the rebase command for every other live lane in this wave.
