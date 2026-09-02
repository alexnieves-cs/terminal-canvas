# M37 — A git worktree per panel

**Summary:** a preset (and the built-in "Claude in a fresh worktree") spawns
its agent in a fresh `git worktree` on a `tc/<panelId>-<stamp>` branch under
`userData/worktrees`; the review engine needed no change; records outlive
their panel and are removed only by an explicit, no-`--force` verb.
**Status:** finished (2026-09-01). Spec
`docs/superpowers/specs/2026-09-01-m37-worktree-per-panel-design.md`, plan
`docs/superpowers/plans/2026-09-01-m37-worktree-per-panel.md`.

## What was learned

- **Attachment must be computed, not stored.** The first design cleared a
  record's panel id in `kill()`. That breaks restart-in-place (dispose then
  ensure at the same id would mint a second worktree and abandon the branch)
  and undo-close (the restored id must land back in its own worktree). The
  layout is the source of truth for which panels exist, so `worktree:list`
  derives `attached` from it at read time and the manager reuses a record by
  panel id AND root.
- **The `root` clause is what makes id recycling safe.** Panel ids are
  minted per install and recycle after a reset; without the root check a new
  panel in a different repository would have been spawned into a stranger's
  branch.
- **The check that counts worktrees after a removal expects the count to
  RETURN to its start**, not start plus one — my own arithmetic error in
  `worktree.9`, caught by the check itself. Recorded because "the check is
  wrong" is the first hypothesis to test when a freshly written check goes
  red against an implementation that reads correctly.
- **A palette check that pins a scope's exact row set (`verify:palette`
  50) has to grow when a scope gains a row.** Updated with a comment naming
  the milestone; not a weakening.
- **`sed -i ''` on macOS mangled nothing this time, but the earlier `\b`
  lesson stands**: every multi-file edit in this milestone went through
  Python with an `assert old in s` per replacement, and two of those asserts
  fired on whitespace-different anchors — a failed assert writes nothing,
  which is the property that made it safe to retry.

- **A fifth copy site, and a pre-existing defect under it.** The end-to-end
  check spawned a panel with no worktree at all: `session-registry.ts`
  builds the `pty:create` request field by field and named neither
  `worktree` nor — from M23 until now — `agentOptions`. Per-panel permission
  mode, effort and model rendered in the chrome and inspector (both read the
  renderer's spec) while the CLI spawned with no such flag. Fixed at that
  site (it is this milestone's own copy-site discipline) and pinned by
  `verify:registry` `copy-site.1`; reported to the author as a finding.
  The general lesson joins the absent-`command` entry in `load-bearing.md`:
  a field-by-field copy silently DROPS what it does not name, which is the
  mirror image of the spread-writes-`undefined` failure that entry already
  records.
- **Check 107 flaked a second time (2 of 5 runs)**, always as `minted=null`
  after a reload; its two post-reload windows widened from 8 s to 15 s.

## Evidence

- Watched red then green: `verify:layout` `worktree.1–.10`, `verify:review`
  `worktree.1–.9` (the manager against real git, reds observed by stashing
  the module), `verify:pty-manager` `worktree.1–.3` (reds observed by
  stashing the seam), `verify:rail` `worktree.1–.3`, `verify:palette`
  `worktree.1–.4`; `verify:ipc` 56 channels; `verify:meta` 25/25.
- `verify:panels` `worktree.1` (end to end): red on the first run
  (`spawned=true`, no worktree field — the fifth copy site), green on the
  second (`branch=tc/n126-20260901-2214`, the directory present after close,
  the record listed detached); 204/204 with check 107 green at its wider
  window. `verify:registry` `worktree.1`/`copy-site.1` watched red then
  green.
- `npm run verify`: see the merge commit.
