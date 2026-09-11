# M258 — navigation and object identity

Brief §4 (minimap and zoom) and §5 (panel frames and object identity). No spec or plan
doc: the user waived them for this milestone, and waived the product-rules / golden-sentence
ceremony. The rules kept are the ones that fail silently: no xterm refit on hover, no
session disposal or `pty.kill` from dormant rendering, `npm run verify` green.

## What landed

- **Minimap** — an opaque raised backing (`--s-3`), a `--line-strong` edge, the overlay
  elevation (`--e-3`) and a `--nav-moat` ring. The legend (the four tone words, from
  `panel-state.ts`'s `MINIMAP_LEGEND`) is opacity 0 at rest and 1 on hover. The camera
  rectangle is a 2px iris ring. A selected block gets a neutral ink outline, never iris.
- **Drag the view rectangle to pan** — `minimap.ts`'s `minimapPanViewport` (pure: the
  delta is `toWorld(p2) − toWorld(p1)`, recomputed from the ORIGIN camera and projection)
  and `minimapViewHit`. The load-bearing rule still holds: the map PREVIEWS the drag and
  moves the camera once, on release, through `goToViewport`.
- **One navigation cluster** at `min-width: 1280px`: the map stacks directly above the
  zoom pill (`--nav-hud-h`). On narrower windows it keeps the top-right corner.
- **Zoom readout** — `zoomReadoutShown`: visible while zooming (900ms settle) or when the
  scale is outside 100% ± 5%. It fades with opacity only, so its box stays and the buttons
  never move under the cursor.
- **Fit task** — a new verb `fit-task` with four doors: the HUD button, the `task.fit`
  palette row, `tc plan fit-task`, and an action node. It frames the active task, which is
  the lens's task (Show related) if one is on, otherwise the one task of the single
  selected or focused panel (`task-members.ts` `fitTaskTarget`). With no task context the
  HUD button is disabled and carries `FIT_TASK_NO_CONTEXT` as its reason.
- **Frame** — the ⋯ menu is keyboard-reachable: opening it focuses the first row,
  arrows/Home/End move between rows, and Escape closes it and returns focus to ⋯. It gains
  Fill view / Restore size. The header's `fill` word is replaced by an icon titled
  "Fill view". The kind glyph gets a fixed 16px column. Four glyphs are redrawn (review,
  Jira, memory, work). A header grows an invisible drag hit-slop (`.pf__chrome::after`,
  absolute, z-index −1). Terminal and note frames don't get it.
- **Interiors** — file prose is an editorial page (`--measure-read` 66ch, local reading
  serif, centred). A workflow has graph paper. A work card has lane rules. A browser's
  address bar is a compact floating pill. A review sits on a recessed ground.
- **Dormant panels** — a dashed ghost frame around a compact summary card
  (`.panel__card-dormant`). This is paint only: no rule touches the frame's box, the stored
  rect is untouched, and nothing reaches a session.
- **Last active** — `session/last-active-store.ts`, per id, cleared beside every
  `clearLastLine` (`verify:rail last-active.2`). It stamps a time only on an observed
  change of state word. The card shows `paused 3m` / `idle 2d` via `lastActiveWord`.

## Conflicts with standing rules, and what was done

- `verify:styles shadow.1` limited `--e-3` to overlays. The brief asks for stronger
  elevation, and the user relaxed the design rules. `.minimap` and `.canvas-hud` are now
  named overlays in that check's list rather than a free-for-all.
- The brief's hit-slop on panel *edges* can't reach outside the frame: `.panel` clips its
  overflow, and clipping clips hit-testing too. The slop hangs inside, below the header.
- The browser address overlay is a floating pill kept in flow. A truly absolute overlay
  would slide the preview-control rows under it, and several checks click those rows.

## Deferred

- **Last-active for restored panels.** A panel restored asleep has no observed time, so it
  shows nothing (absent stays absent). A real "since" needs main's scrollback-log mtime
  across `scrollback:tail` (a contract change) or a persisted field in `LayoutSnapshot`
  (a parser change). Neither was taken here.
- A chat panel's last-active (its transcript rows carry `at`) is not wired.
- Moving lock/pin into the ⋯ menu: the frame has no lock/pin verbs today, only marks. They
  stay in the palette.
