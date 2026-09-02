# M55 — Recover an orphan session

**Status:** designed 2026-09-02. Backlog #61, reinstated by the scope
amendment (§7): "Placement exists after M50, so a recovered orphan gets a
real position; offered as a dialog naming the sessions, never adopted
silently, and never offered for a dead pane."

## What this milestone is for

At boot, any tmux session whose panel id is in no saved layout is killed,
with a comment saying adoption would mint geometry the user never chose.
That trade destroys work at exactly the one moment the app has recovered
something nobody else can reach: an agent mid-run when the machine died
between the spawn and the store's coalesced write. One dialog fixes it.

It also fixes a latent defect the same block carries: the "known" set is
`layoutStore.initial().panels` — the ACTIVE workspace only — so a session
kept across quit (M38's keep arm) for a panel in a hidden workspace is
killed as an orphan at the next launch. The known set becomes every
workspace's ids.

## Shape

### Main decides what is an orphan, and asks

- `main/orphans.ts` (pure): `findOrphans(sessions, known)` — the listed
  sessions whose id is in no workspace. It is fed by `ptyManager.list()`,
  which comes from `parseListOutput`, which already drops dead panes — so
  a corpse is never a candidate, by construction rather than by a second
  filter. `orphanPrompt(rows)` — the dialog's message and detail, naming
  every session (id, command, cwd, pid), capped so a hundred orphans do not
  make a dialog taller than the screen.
- `index.ts`, at the point the kill loop is today: with orphans present,
  `dialog.showMessageBox` (app-modal; the window does not exist yet, which
  is fine) with **Restore** and **Discard**. Discard is today's path.
  Restore keeps the sessions alive, counts them as surviving for the
  stale-baseline sweep, and after `createWindow()` sends
  `session:recover` (a new main → renderer event) with the rows, through
  the same wait-for-load send M54 added.
- Nothing is adopted silently: no dialog, no restore. A launch with no
  orphans shows nothing.

### The renderer places and adopts

- `renderer/panels/recover.ts` (pure): `recoverPanels(rows, panels,
  centre)` builds one `TerminalPanel` per row through `makePanel` with
  THE ORPHAN'S OWN ID (the tmux session is named by it, and `new-session
  -A` is what reattaches), cascaded from the viewport centre exactly as a
  preset spawn is, with the session's cwd and command as its spec.
  `seedAfter(ids, next)` returns the id counter to use after adopting
  those ids — an adopted `n17` with the counter at 12 would otherwise mint
  a second `n17` five spawns later, the duplicate-id defect through yet
  another door.
- `Canvas.tsx` subscribes `session.onRecover`, applies both through the
  ordinary history path (one entry per recovery, so `Cmd+Z` un-adopts —
  which DISPOSES the sessions, and that is right: the user was asked and
  said yes, then said no).
- The registry treats the new panels as unspawned; tiering spawns them;
  `create()` reattaches (`reattached: true`), as M38's kept sessions do.

## What it must not break

- `verify:tmux`'s `parseListOutput` dead-pane check stays the only dead
  filter; `findOrphans` adds none.
- The stale-baseline sweep still runs at boot with a correct `surviving`.
- `nextIdRef`'s seeding from restored ids stays; recovery extends it.

## Verification

- `verify:tmux orphan.1` `findOrphans` keeps only unknown ids, across a
  known set drawn from several workspaces; `orphan.2` the prompt names
  each session and caps the list with "+N more".
- `verify:viewport recover.1` `recoverPanels` builds panels with the rows'
  ids, cwd and command, cascaded and non-overlapping; `recover.2`
  `seedAfter` moves past adopted `n`/`r` ids and ignores foreign ids.
- `verify:panels recover.1`: a session spawned outside any layout, then
  `session:recover` sent to the renderer — the panel appears with that id,
  goes live, the manager still lists exactly one session under it, and a
  preset spawn afterwards mints an id past the adopted one.
- The dialog itself is manual-only (no suite drives `showMessageBox`),
  recorded as such.
