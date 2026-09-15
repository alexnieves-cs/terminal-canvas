# M267 — motion and material — 2026-09-14

Started by a Codex session that stopped at its usage limit while reviewing the visual
captures (after build + `verify:styles` were green, before any critic sentence, golden or
log). Resumed and closed by Claude the same night. Builds on the uncommitted polish pass in
[2026-09-14-ui-polish.md](2026-09-14-ui-polish.md).

## What changed, and why each is state rather than decoration

- **Drag weight.** `usePanelDrag` stamps `data-panel-dragging` on the panel element on the
  gesture's first real move: an iris rim and deeper shadow, paint only. On release
  `data-panel-settling` runs `panel-settle` on `.panel__motion` (a translate, never a size),
  so xterm never refits and no PTY sees a resize. *Fixed on resume:* the gesture begins on
  mousedown, so the Codex version lifted and bounced every panel a person merely clicked to
  select; lift and settle now both wait for a move.
- **Edge current.** A `firing` link is a 3px dashed stroke whose dash travels once
  (`edge-current`, `--dur-flow`), with a halo around the existing packet. `waiting`, `armed`,
  `arrived` are unchanged; reduced motion drops the dash, animation, packet and halo.
- **Summoned pill.** `.command-pill__panel` rises on a spring with a blur-in (`pill-expand`
  on `--dur-spring`) on a raised `--s-3` surface wearing the overlay elevation `--e-3`; the
  rest button fires one `pill-beacon` as it opens. Added to `verify:styles`' OVERLAY list.
- **Aura depth.** `.canvas__aura` is two radial planes and a sheen tinted by the canvas
  activity, with parallax slowed from 0.12 to 0.09 of the camera.
- **Living signal.** A `working` status dot emits a finite three-breath ripple when it enters
  that state; a long-running session does not animate forever.
- **Arrival.** `panel-enter` is an 18px spring rise on `--dur-spring` (still no scale above
  `.pf__body`).
- New tokens `--dur-spring` (520ms), `--dur-flow` (900ms). `motion.2` amended; new check
  `motion.material.1` pins drag paint-only, settle on the motion wrapper, firing current, and
  its reduced-motion arm.

- **A new chat spawns clear of the floating chrome.** `beginNewChat`'s cascade centred
  a 560×620 chat under the bottom-right navigation cluster, so its Send sat under the
  minimap — a covered door, red at HEAD as `onboarding.start.1` and visible in the `auto`
  scene. `clearOfOverlays` (pure, `viewport.ts`; `verify:viewport spawn-clear.1–3`) moves
  the spawn point left or up just far enough to clear `.minimap`, `.canvas-hud` and the
  command pill's rest button, measured at spawn because the cluster's corner is a CSS
  breakpoint. An exact `at` (the starter) is untouched; a point already clear never moves.

## Critic review of the visual scenes

Two fresh-context critics viewed golden, fresh and diff for every scene; the resuming session
viewed the flagged ones itself. Most diffs are older merged UI the goldens never caught (the
single Create control, the Task/Panel creation sheet, review-panel reorganisation, the icon
rail, workflow node glyphs, first-run launcher, GitHub/Jira cards). **Approved, not yet
written** — the golden copy awaits the user's go-ahead:

- `edge-firing` — the firing edge is now the dashed iris current instead of a thin grey line; the moving edge is found without reading a label (M267).
- `edge-waiting` — the edge pixels are unchanged; the current is scoped to firing only (M267).
- `reduced-motion` — the needs-you edge stays solid amber with no packet or halo; the reduced arm holds (M267).
- `chat`, `composer`, `attention` — wider transcript inset, separated turns and an inset composer; nothing clipped (polish + older composer controls).
- `zoomed-out-dark`, `zoomed-out`, `workflow-edit` — the aura now reads as an off-centre warm light under the needs-you tint; faint, no content affected (M267).
- `group`, `group-collapsed` — solid rounded group boundary; the needs-you badge still visible (older merged).
- `kinds`, `kinds-dark` — file kinds keep their headers and terminals stay chromeless per M236; contrast holds.
- `across`, `approval`, `tool-objects`, `watcher`, `vault` — review panel reorganised into this-chat / also-changed with the commit in its footer; legible, nothing occluded (older merged).
- `spawn-sheet`, `supervisor`, `templates`, `starter`, `start-work`, `lineup`, `chat-copilot` — the Task/Panel creation sheet replaces the single form (older merged, M262).
- `launcher` — the numbered first-run steps and Start work (older merged, M262).
- `integrations`, `github`, `board`, `file-missing` — card restyles and the Jira not-connected banner (older merged).
- `wide`, `workflow` — icon rail and typed workflow nodes (older merged).
- `graph` — the never-fired edge stays unstyled; arrowhead marker marginally clearer.
- `navigator-files`, `navigator-panels`, `navigator-workspaces`, `overview`, `palette`, `palette-dark`, `palette-query`, `routine`, `runs`, `search`, `search-empty`, `skills`, `verbs`, `trail`, `teammate`, `subagents`, `browser`, `flip`, `header`, `ink`, `inspector-detail`, `inspector-tools`, `inspector-work`, `memory`, `merged` — only the toolbar collapse, the chat panel's reflow behind the surface, camera drift and pid/RAM jitter.

**Held back from the batch, then decided one by one:**

- `compact` — 66%: the compact inspector drawer now lays its fading scrim over the canvas
  (`drawer-motion.1`), which the golden predates; the drawer and its content are intact.
  Written.
- `auto` — held until the Send occlusion was understood. The LIVE spawn path was the defect
  (fixed above, `onboarding.start.1` green); this scene is a seeded layout whose camera puts
  the chat's corner under the navigation cluster, a floating overlay over a panel panned
  beneath it, as designed. The composer's icon Send is older merged UI. Written after the fix.
- `header` — first read as jitter and left alone; two runs then failed at the same 0.55%, so
  it was looked at again: the inspector says 2 panels share the repository (not 3) and the
  floating subagents card near the minimap is now the empty-state caption, stable fixture
  content, legible, nothing covered. Written.

## Evidence

- After both fixes: typecheck and build green; `verify:styles` 75/75, `verify:viewport`
  156/156, `verify:meta` 50/50 and every other plain suite the change reaches green;
  `verify:panels:product` 118/118 (`onboarding.start.1` green for the first time since it
  went red), `panels:shell` 99/99, `panels:core` 83/83, `panels:kinds` 50/50,
  `panels:agents` 82/82, `canvas` 7/7, `xterm` 11/11, `window` 4/4. `verify:visual` 60/62
  before `auto` was written (`auto`, and `header` on jitter).
- Red at HEAD e9821008, reproduced in a clean worktree, not caused by this diff:
  `verify:panels:shell 106` (the review button's ancestor is hidden) and
  `verify:panels:product onboarding.start.1` (Send under the minimap). `browser.1` passed at
  HEAD and failed once on the dirty tree: a fixture-startup flake.
