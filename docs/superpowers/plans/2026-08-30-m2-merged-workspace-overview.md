# Backlog #2 — merged workspace overview: decision plan

**Goal:** Resolve the remaining M7 all-in-one-view question without adding a
second navigation surface or a third `LIVE_BUDGET` promotion authority.

**Spec:** `docs/superpowers/specs/2026-08-30-m2-merged-workspace-overview-design.md`.

## Tasks

- [x] Read the workspace, tiering, lifecycle, and M11 navigation invariants in
  `CLAUDE.md`; inspect M7 and M11 documentation.
- [x] Compare a read-only overview with M11's navigation grid and reject it as
  duplicate navigation.
- [x] Compare a live canvas with the two `LIVE_BUDGET` guards, demote-not-
  dispose lifecycle, and per-workspace cameras; reject it as a different,
  unscoped editing model.
- [x] Record the decision and the stale-shortcut correction in the backlog and
  README.

There is intentionally no implementation task and therefore no watched-red
check. Creating a non-existent module merely to satisfy the test-first ritual
would misrepresent the decision as a shipped feature; the spec declines that
module outright.

