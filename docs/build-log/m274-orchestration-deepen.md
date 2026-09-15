# M274 — Orchestration deepen (O1–O4)

Approved 2026-09-15 as an orchestration-only follow-on to Waves 1–4.
**O5 (external Agent Orchestrator / AO integration) is held** and is not
claimed here.

Wave 2 (M271) already overlapped O1–O2. This milestone finishes those
items and adds O3–O4 on the same HUD — still a tail + jump, still no
live xterm in the overlay, still no Three.js, still no fake CI/Steward
branding. Secrets leave through `outward()`.

## What landed

### O1 (finish)
- Selection command bar still emits only real verbs; multi-select
  Interrupt/Jump only when every selected row can run them.
- Empty arms stay in `empty-states.ts` with Show Canvas; none say Connect.
- Greeting still omits placeholder names (`Good evening.`, never
  `Good evening, there.`).
- Roster keyboard: ArrowUp/Down, Enter, Escape. `orchKeysShouldHandle`
  returns false for `.xterm` / contenteditable so a focused terminal
  keeps its keys. Buttons still use `shellControl`.
- Orchestration golden/shot scene remains from M271.

### O2 (finish)
- Travelling current on `.orch__edge` only inside `ORCH_EDGE_FIRE_MS` of
  a real agent transition, not because endpoints are live. Same
  `edge-current` language as M267; reduced motion reports without travel.
- Pipeline stage `data-orch-stage-shift` when the focused task's board
  state actually changes.
- Cube `--live` / `--needs` still from real agent tone.
- Canvas stays mounted behind Orchestrate (M272).
- New needs-you roster rows carry `data-attention-new` until select/ack.

### O3
- Task-centric frame from D08 member ids Canvas already computes.
- Blocker strip: one factual line (waiting on you / reviewable / running
  / queued), never invented.
- Live = working panels + recent window; Historical = durable session
  activity; Logs = recorded tail, not a live terminal; Files stay
  path-real.
- Metric cards are one shared lens (roster + graph + activity).
- Optional multi-select on the filtered pool.

### O4
- Synthetic hub title is **No supervisor yet**, never a fake Orchestrator
  persona. A real supervisor/orchestrator chat still takes the hub.
- Machine readout: `no sample yet` until a sample exists; stale samples
  keep their last reading and name their age.
- `verify:orchestration` pins `outward()` on the HUD chat/scrollback
  readers (`orch.gate.1`).
- Density: greeting/metrics at rest, commands/blocker contextual, logs
  and system as detail. No global restyle.

## Held
O5 / AO. Wave 5 (provenance, portable workflows, annotations, focus-mode,
multiplayer) remains out of scope from the CoS plan.

## Graph depth follow-on

- Cubes now use perspective scenes and three perpendicular CSS faces inside SVG
  foreignObjects. Hub and near/far satellites have distinct tilts; existing state
  tones illuminate the faces and existing selection/jump hooks remain in place.
- Camera projection moves the hub slower than satellites and keeps edge endpoints
  attached. Labels and bounded foreground cards respond at their own rates.
- The hub paints first, satellites paint from back to front, and far labels fade.
  Elliptical ground rings, a radial wash and contact shadows ground the scene.
- Visual inspection: the orchestration capture shows solid joined faces and a
  soft concentric ground plane with readable foreground copy. Its capture is
  1440×868 against a 1440×865 golden; unrelated scenes also fail visual budgets
  and the starter fixture cannot paint. No goldens were regenerated from this run.
- Packaged verification passed (12/12); web typechecking and build passed.
- Full verification finished at 48/50 suites: `verify:panels:kinds` fails check
  147 (move-to-new workspace row absent), and `verify:panels:agents` fails
  `detail.1` (zoom clamps at 0.1 and reports cluster). Orchestration passes
  33/33. These failures are outside the changed graph surface; the full gate
  is not green.

## M275 — cube body language (state skins)

- One cube, five skins, keyed off the existing `data-tone`: **working** breathes
  on its top face, a shimmer walks its rim and the lift wrapper Y-bobs;
  **needs you** pulses sharper (three finite breaths) and lights an amber beacon
  above the cube that goes out on select; **idle** sits cooler, flatter and 3px
  lower with no glow; **starting** settles in once (scale .82 → 1 on
  `--dur-spring`); **exited** is desaturated with a dashed "cracked" rim, tone
  and label untouched.
- Micro-motion runs only while busy (`.orch__cube--busy`); an idle cube is
  still, and the reduced-motion block stills every cube animation and transition.
- Selection is a true 3D lift: `.orch__cube-lift` translates 22px toward the
  viewer, the contact shadow scales 1.35×, and every sibling dims through
  `filter: brightness(.82)` on `.orch__graph[data-has-selection]` — never a
  fractional opacity (styles check 3).
- The hub is a different object: steadier 14px core glow, no bob/breath; a
  synthetic hub keeps its “No supervisor yet” label with a dashed, unlit body.
- New keyframes (`orch-breath`, `orch-rim-shimmer`, `orch-bob`, `orch-settle`,
  `orch-beacon`) are named in `verify:styles` motion.2's allowlist with their
  reason; two rhythm tokens (`--dur-bob`, `--dur-shimmer`) sit beside
  `--dur-breath`. `TONE_WORKING` is used, never the literal (rail state.2).
- Not done: no golden regenerated; a critic's look at the live app is owed.

## Cube callout follow-on

- Cube-anchored SVG billboards remain upright while their projected anchors move
  with the camera. Busy cubes show compact facts; idle cubes reveal cards on
  hover/focus or selection. Only hovered and selected cards expand, keeping
  automatic detail density bounded.
- Content comes from the per-panel live-session/chat stores and linked board
  items: command, last recorded tool name, task title, cwd and reported cost.
  Pending permission requests say “Waiting on approval”; wants-you state says
  “Needs input.” Unknown facts are omitted. Jump and eligible chat Interrupt
  reuse the existing callbacks.
- Task-frame nonmembers remain as ghost cubes without callouts. Placement reserves
  expanded cards first and shifts overlapping cards sideways with connected stems.
- Focused Electron capture: the upright cards are legible over the dark scene;
  amber identifies the needs-input card, and collision avoidance leaves the
  selected card's Jump/Interrupt controls unobstructed. A DOM rectangle check
  confirms those cards do not overlap. Captures and harness are in
  `out/callout-shots` and `out/callout-shot.cjs`.
- Build and style verification pass. The broad visual run fails across existing
  scenes, including orchestration's capture-size mismatch and the starter fixture;
  no goldens were regenerated. Full verification still encounters the documented
  agents `detail.1` zoom-tier failure; final run output is in
  `out/callout-verify.log`.
- Final focused checks also pass task-frame exclusion and Jump returning to the
  canvas.

## Edges that read as work moving

- Weight is meaning: hub spokes recede (1px, 24% iris); authored links are
  2.5px amber with a soft glow and paint last (`orchEdgePaintOrder`), so the
  dependency graph is not drowned by the star.
- Packets only on real crossings, for `ORCH_PACKET_MS` (1.2s, `--dur-packet`):
  an agent transition sends a dot + trail AWAY from the panel that changed; a
  handoff is read from `useHandoff`'s own `noteEdgeFired` timestamp through a
  new read-only `edgeFiredAt`, never re-stamped. Frames live in `EdgePackets`,
  whose rAF runs only while a packet is live and never re-renders the cubes.
- The payload chip shows the link's `TRIGGER_WORDS` phrase, only on a handoff
  fire of an ENABLED handoff link — a state flicker delivered nothing. A turn
  end emits both kinds; `orchRecordFires` keeps the handoff (`orch.flow.4`).
- Reduced motion: no travel; the chip holds at the midpoint for the window.
- Checks `orch.flow.1–4`; typecheck and `verify:styles` pass. Not looked at in
  the live app yet, and no golden changed (the shot scene fires nothing). Orchestration-model and packaged verification pass; package downloads
  used repository-local caches after the initial sandbox DNS failure.

## Helpful, not just pretty

- **A lens dims, it does not remove.** A metric card or roster filter feeds the
  scene the whole frame plus `orchLensLit`'s lit set; excluded cubes dim in place
  (`filter`, not opacity) and lose their callouts. `filterGraph` used to remove
  them, which re-derived `stage.ringR` and reflowed the diorama on every click.
  Waiting on you now leaves only the amber cubes and their cards (`orch.lens.1–2`).
- **Callouts are the cube's other face**: click selects, double-click jumps; the
  card's own Jump/Interrupt buttons are excluded so a press never also toggles.
- **The ring cap is a `+N more` node, never a silent drop.** `ORCH_RING_CAP` (8)
  seats by urgency (wants-you, then live) and keeps canvas order among the
  seated; the overflow wears its most urgent hidden state and recounts under a
  task frame. Clicking it sets the roster to “Not on the ring (N)”, an option
  offered only while the ring is capped; it lapses to All when the cap does
  (`orch.ring.1–2`).
- **Pipeline wash.** `orchStageShifts` compares board items by id, so a
  different task taking focus is no longer read as a shift (the old single-state
  ref did). The moved item's D08 members (`taskMembersOf`, fallback its
  `panelId`) get a one-shot ground rim in the stage's colour for
  `ORCH_STAGE_WASH_MS`; reduced motion holds a still rim for the window.
  `orch-stage-wash` is in `verify:styles` motion allowlist (`orch.wash.1`).
- **The blocker strip stays the textual truth**: it reads `liveSnap` (never the
  lens, frame or cap) and the graph is `aria-describedby` it.
- Not done: not looked at in the live app; no golden changed; Electron tier not run.

## Diorama posture — reduced motion, callout tail, the orchestration golden

- **Still CSS 3D, no Three.js.** Nothing new is rendered; this pass makes the
  existing diorama honest and pins it.
- **Reduced motion is a checked contract, not a list someone remembers.**
  `orch.motion.1` parses `styles.css` and fails any `.orch` selector that
  animates or transitions without a `none` in a reduced-motion block. Every one
  was already covered; the check keeps a new keyframe from moving silently.
- **Callout tail, through the gate.** An expanded card (hovered or selected,
  never more than two) shows the last non-blank line of the chat reply
  (`lastAssistantText`) or terminal (`useLastLine`), scrubbed by `outward()`
  inside `outwardTail` (`orch.gate.2`). An empty tail is omitted.
- **Found by looking: selection flattened every other cube.** M275's sibling
  dim put `filter` on `.orch__cube-solid`, the `preserve-3d` element; a filter
  computes transform-style to flat, so selecting one cube turned the rest into
  single grey cards. `.orch__cube--exited` had the same bug. Both filters moved
  to the faces; `orch.depth.5` fails a filter on solid/lift/scene.
- **Found by looking: back-of-ring cards clipped.** Placement clamped x, never
  y, so an expanded card above a back cube drew past the stage top. It now
  flips below its cube (`CALLOUT_BELOW_K`), and every card paints in its own
  pass after all cubes — inside the host, a flipped card lay under the hub,
  which paints later by depth. That pass repeats the host's hover so reaching
  for Jump does not collapse the card.
- **The orchestration shot was never the HUD.** The committed golden showed the
  plain canvas (the dock click raced the view), and its 865 height against an
  868 capture was a standing red. The scene is now sized `[1440, 900]`, runs
  under emulated `prefers-reduced-motion` (cubes at rest), throws if no 3D cube
  paints, lifts the task frame, selects a back satellite so the flipped card is
  in frame, and hides only the clock values and greeting (they change every
  run) — disclosed in its intent.
- Checks: `verify:orchestration` 49/49, `verify:styles` 75/75, web typecheck
  clean, build passes. `starter` still fails in the shot harness, unchanged.
