# M46 — The interface architecture

**Status:** designed 2026-09-01. Adopts
[`2026-08-30-m23-interface-architecture-design.md`](2026-08-30-m23-interface-architecture-design.md)
— written after M23 (agent modes) had taken that number and never built —
under a new number, with the amendments the scope decision (§5) lists.
Read that document's Diagnosis first; every number below is one it measured.

## What this milestone is for

Three side regions cost 720px of a 1440px display before the canvas gets a
pixel, two of them describe the same selected panel, the rail's three
sections are each capped at a third of one column forever, and the
inspector interleaves four refresh rhythms in one 260px scroll. The canvas
is the product and it has half the window.

## What is adopted, unchanged

- **The dock** (§3.2): a 48px icon column, always resident, one icon per
  navigator — Workspaces, Panels, Files, Attention — selecting one pane at a
  time; the active icon collapses it. M45's icon set supplies the glyphs;
  its `.icon-button` supplies the target.
- **One navigator pane** (§3.3) at 260px, so each list gets the whole
  column. Attention becomes a count badge on its dock icon plus a popover;
  the risk the spec recorded (a waiting agent becoming invisible) is
  answered by M43's dock badge and notification, which exist by now.
- **Breakpoints as container queries on `.shell`** (§3.4, §7.1): Compact
  under 1100 (transient drawers), Standard to 1600 (one resident pane),
  Wide above (pane and context both resident). Never `window.innerWidth`,
  never a `ResizeObserver` on the window — the canvas measures its own host
  at event time and every edge pip and HUD coordinate depends on that.
- **Per-breakpoint state from the sparse preferences map** (§3.5): absent
  means the breakpoint decides; present means the user won at every width.
  No schema change.
- **The context pane** (§4): pinned identity header (the honest chain, the
  state dot, the pid), three tabs — Detail / Work / Tools — grouped by
  question, a pinned action bar in three ranks with a confirm-gated Close,
  and `inspectorSignature` kept WHOLE (§4.3 — narrowing it to the visible
  tab is the obvious optimisation and it freezes hidden tabs stale).
- **The top bar** (§3.6): the zoom cluster moves to the HUD; `Merged`
  becomes an icon toggle keeping `aria-pressed`; zoom-to-fit-panel waits
  for M56.
- **The seven invariants** (§7) and **the empty states** (§8.3), each of
  which lands here except the first-run launcher (M48).

## Amendments

1. **Phase 0's byte-identical screenshot is dropped** — M45 already changed
   every pixel; the enum setting and the widened style suite landed there.
2. **Zoom-independent chrome is not built** (§5.2) — scope decision §3, #60.
   The `.pf__body`-is-never-transformed rule is still written down beside
   the frame, because the temptation returns.
3. **`PanelFrame` moves to M47** with semantic zoom; this milestone is the
   shell.
4. **The HUD becomes a pointer surface for the zoom cluster only**, and
   `shouldYieldWheel` gains the HUD as a surface — a wheel over the zoom
   buttons must not pan the world underneath.
5. **The canvas-wide token and dollar totals** (#19's aggregate half) land
   in the no-selection summary of the context pane.

## Verification

The spec's Phase 1 and Phase 2 success criteria, verbatim, restated as
checks: `verify:panels` 73/125/156's exact-inset assertions restated for
the new grid (at a `.shell` inline size of 1440 the canvas measures 1132px
± 1); a promotion still happens under the reclaimed width; switching
navigator panes spawns nothing (session count scoped to the affected ids);
a Compact drawer dismisses on outside click AND `Escape` and a wheel over
it moves no camera; every dock and pane control passes the real
`sendInputEvent` focus check; the identity header is on screen with every
tab active; `inspectorSignature` still moves on a usage change while a rect
change leaves it byte-identical (`verify:rail` 86, unchanged); Close is
marked destructive and gated, read back from the panel list; the Work tab
renders current figures immediately after being switched to.
