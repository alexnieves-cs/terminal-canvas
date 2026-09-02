# M46 — The interface architecture

**Status:** finished 2026-09-02.
**Branch:** `m46-interface`. **Spec:** `docs/superpowers/specs/2026-09-01-m46-interface-architecture-design.md`
over the M23-numbered design it adopts.

One line: dock | one navigator | canvas | context — the canvas gets the window less 308px
at a laptop width instead of the window less 720.

## What landed

- `useShellBreakpoint`: a ResizeObserver on `.shell` (never the window) stamps `data-bp`
  (compact < 1100 ≤ standard < 1600 ≤ wide); the stylesheet keys its column widths on it,
  the chrome hook keys the presence rule on it — one source of truth for the thresholds.
- `useShellChrome` rewritten around the sparse map's PRESENCE (`SettingRow.persisted`):
  absent means the breakpoint decides (navigator resident at Standard/Wide, context only at
  Wide), present means the user won at every width; Compact has no resident chrome and both
  panes are transient drawers dismissed by Escape and an outside click.
- `Dock.tsx` (Panels / Workspaces / Files, `aria-pressed`, and Attention as a badge plus a
  popover), `Navigator.tsx` (ONE pane, full height; `SideRail` deleted; `FileTree` is the Files
  pane's body), the context pane (pinned identity header with the pid, Detail/Work/Tools tabs
  persisted as `shell.contextTab`, inactive tabs rendered but `hidden`, a pinned action bar in
  three ranks, Close armed like the panel's own ×), the top bar (zoom cluster gone to the HUD,
  Merged an icon toggle, the context toggle), the HUD's zoom cluster as its one pointer surface.
- `buildInspectorSummary` gains canvas-wide token and list-price totals (#19's aggregate half).
- Two enum settings: `shell.navigator`, `shell.contextTab`. `LayoutStore.clearPreference`.
- Checks: `verify:layout shell.1`, `verify:rail summary.1`, `verify:panels shell.1/.2,
  drawer.1, ctx.1/.2, hud.1, empty.1`; 73/156 restated for the new grid; the attention, tree,
  zoom and keyboard.4 sites restated.

## Decisions taken beyond the spec, in writing

- **`data-bp` from a ResizeObserver on `.shell`, not a CSS container query.** The spec's rule
  is "adaptation is measured on `.shell`, never on the window", and its named failure is a pip
  aimed at the window's edge. Observing the shell keeps that property and gives the chrome hook
  the breakpoint it needs for the presence rule — a container query cannot be read from JS, so
  the thresholds would have lived in two places.
- **At Standard the context pane is pinned by its toggle, not summoned as a drawer.** The
  spec's table says "drawer" at Standard; a drawer that overlays the canvas at the width most
  laptops run at, opened by the same chord that pins it, was two behaviours behind one key. The
  toggle persists (present → user wins), Compact keeps the drawers. Recorded as a deviation.
- **The secondary rank is a visible row of small controls, not a `⋯` menu.** Every existing
  check that reaches Rename / Save as preset / Link reads them from the DOM; a hidden menu
  would have made each of them a two-step gesture for no user gain at 260px.
- **`files.treeOpen` stays a boolean** and means "the navigator shows Files"; `shell.navigator`
  chooses between Panels and Workspaces when it does not. Cmd+B keeps its meaning.

## Snags

- Four fixtures in `verify:panels` were shaped by the old three-region shell and had to be
  restated, not loosened: the workspace-row checks (95–96) and the tree checks (158/161) now
  show the pane they read through the dock, the way a user would; 144 frames an already-live
  panel through its rail row when the wider canvas leaves no live slot on screen (a card clicked
  under a spent LIVE_BUDGET is woken but never promoted — watched); 144b probes the second
  panel's chrome AFTER the first click raises the first panel over it.
- The M45 theme block's card wake dispatched a mousedown with no client coordinates, so the hit
  test never fired and its "live AND detached" clause was half-vacuous. Fixed with the M46
  fixtures (coordinates supplied, the wake asserted).

- The restated zoom check dispatched on a `null` button against the old build and THREW,
  aborting the run below it. Made null-safe: a missing HUD button reads red, not as an abort.
