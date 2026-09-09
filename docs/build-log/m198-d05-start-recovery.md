# M198 — D05 start recovery

The [D05 guide](../product-development-guide-2026-09-08.md#d05--start-work-from-an-issue-or-intention),
[spec](../superpowers/specs/2026-09-09-m198-start-work-recovery.md), and
[plan](../superpowers/plans/2026-09-09-m198-start-work-recovery.md) define this close.

`dispatchWorkItem` now reserves and persists the conversation id and worktree association as soon
as the lane exists. Concurrent clicks for one item join one promise; a retry revalidates the
requested teammate and repository through main, reuses the same lane and conversation, and resumes
only the missing create or first-send step. A completed dispatch is idempotent.

The three `start.recovery.*` Electron checks were watched red first: the old path minted two lanes
for simultaneous clicks, orphaned the first lane after a refused create, and minted a second chat
after a refused send. They now exercise real temporary Git repositories and clean their worktrees.

No IPC or schema changed. The optional item associations already shipped in M114 are the recovery
journal.

Verification: `verify:panels:product` 94/94; the final `npm run verify` exited 0 with every suite
tally; `verify:visual` 60/60 with no golden rewritten; `verify:packaged` 12/12.
