# Redesign (M435–M456) — 6.0.0

The run's state is [m435-m456-ledger.md](m435-m456-ledger.md). Decisions are
[docs/redesign/DECISIONS.md](../redesign/DECISIONS.md). This file is the
per-milestone record the README table cites. Goldens were not rewritten.
No DMG was built.

## M435 — Phase 0

The kit: contracts, the ownership map, and the CSS, shot and verify seams.
No token was re-valued and no screen was restyled.

## M436 — One state colour

Dark material re-valued. `[data-tone]` reads `--state-*`. Working is cyan.
A finished-OK fact uses the done tone. The words stay (D1, D7).

## M437 — The shared model

One attention queue, task territories, zoom tiers with hysteresis, and
canvas-to-floor. No screen is wired.

## M438 — The shell frame

Canvas, Sessions and Review. One shortcut registry. Focus lock is ⌘⇧L.
The title bar may show a session count and never a dollar amount (D2–D5).

## M439 — Launch and restore

A dark card: the mark, "Every agent, in its place.", and an honest checklist.
Holding ⌥ skips the remaining reattaches.

## M440 — First run

Workspace, then Agents, Sessions, and First task. A missing tool offers its
install command. A preview teaches the state colours. Nothing runs.

## M441 — Empty canvas

One primary verb, quick spawns, and three inert starter layouts. The minimap
says "Nothing placed yet". A double-click on empty canvas still places a
flowchart step (R-024).

## M442 — Work tier

Task regions, a needs-you panel with Allow, Diff and Deny, handoff edges,
the inspector, the zoom HUD, the minimap, and a selection ring distinct from
working.

## M443 — Create and arrange

Dragging from a port opens a connected spawn. Smart guides use the 24px gap.
A marquee brings up Align, Tidy, Make task (⌘G) and Pause all.

## M444 — Navigate

Plan turns panels into status cards. Map is the same canvas as dots. ⌘K is
grouped, with fly-to and fit-task. Work, Plan and Map sit on the zoom HUD.

## M445 — Sessions

A triage page: an attention queue, a table grouped by task (run and cost are
allowed here), a bulk bar, and a detail pane. The spend total lives in this
header (D3).

## M446 — Settings, Keyboard

The shortcut map, a conflict when an agent's own ⌘K would steal the palette,
a shortcut recorded inline, and focus lock so the terminal gets every key
(D4, D5).

## M447 — Paused, not lost

A host that stops answering says paused. A crashed session explains itself
with one fix. Reattaching panels are skeletons. Stale GitHub or Jira data
is marked.

## M448 — Night studio

A dark room. Robot shells are neutral. State is drawn from the canvas
palette: eyes, antenna, floor ring and desk screen.

## M449 — Canvas into World

The plan tips back, terraces rise, a cancel chip, and the 2D / World lens.
Reduced motion is a 120ms cross-fade, not a dolly.

## M450 — The room

The same layout stood up. Terraces sit at the canvas coordinates. Waiting
agents raise a beacon where they stand.

## M451 — Overview

Orbit, pan, zoom, ⌘1, ⌘2 and ⌘3, fit, follow, and back to 2D. A replay
scrubber. Past rooms keep the verbs and disable them.

## M452 — Focus

Picking an agent glides in. The sheet holds the ask, Approve and Deny, facts,
a reply for a chat agent, and Open in Canvas. A plain shell is not answered
from the room.

## M453 — Attention flight

⌘J walks the same queue in the World as on the canvas. Approve sends
immediately. Undo appears only when a review can still discard that change
(D9).

## M454 — The flat room

Without WebGL the flat room keeps the same words and the same doors. The
doors between the canvas and the World go both ways.

## M455 — Phase 4

Linux integration: the fix list, the release-notes draft, dark shot fixes,
the renderer budget, and the header rest rule so a skill count stays visible
at rest. Goldens were not rewritten.

## M456 — 6.0.0

The version, the release notes, and the GitHub release. The build is
unsigned. The DMG is attached after a Mac package pass.
