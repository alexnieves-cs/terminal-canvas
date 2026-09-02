# M55 — Recover an orphan session

**Status:** finished 2026-09-02.
**Branch:** `m55-orphans`. **Spec:** `docs/superpowers/specs/2026-09-02-m55-orphans-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m55-orphans.md`. Backlog #61.

One line: at boot, a session in no layout is offered back by name — Restore adopts it as a
panel under its own id, Discard ends it — and the known set is every workspace's ids, which
also fixes hidden-workspace sessions being killed as orphans.

## What landed

- `main/orphans.ts` (pure): `findOrphans` (no second dead filter — `parseListOutput` is the
  one), `orphanPrompt` (named rows, capped with "+N more", Restore/Discard).
- `shared/orphans.ts`: `OrphanRow`; `session:recover` event (contract, preload, both diagrams).
- `renderer/panels/recover.ts`: `recoverPanels` (the session's own id, cwd/command, cascaded)
  and `seedAfter`, now the ONE id-seeding rule shared by `Canvas.tsx` and `switchWorkspace`.
- `Canvas.tsx`: `session.onRecover` through `commitHistory`.
- `index.ts`: known ids from `layoutStore.workspaces()`, an app-modal dialog (Restore is the
  default button), restore counted as surviving for the baseline sweep, the send after
  `createWindow()` through M54's wait-for-load send.
- Checks: `verify:tmux orphan.1/.2`, `verify:viewport recover.1/.2`, `verify:panels recover.1`
  (red first with nothing subscribed: the panel never appeared).

## Snags

- The latent defect (active-workspace-only known set) was found while reading the block, not
  by a failing check; `orphan.1` now pins the rule at the pure layer, but the wiring line in
  `index.ts` is covered by review only.

## Not proven

- The dialog: no suite drives `showMessageBox`. Manual-only, like the reset confirmation.
- A recovered session whose cwd no longer exists: the panel adopts and reattaches (tmux holds
  the shell regardless), but the Changes section's answer for it was not exercised.
