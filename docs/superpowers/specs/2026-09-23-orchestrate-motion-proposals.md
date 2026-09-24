# Orchestrate — motion, physics and graphics proposals (2026-09-23)

A research-backed proposal set for the Orchestrate page. Nothing here is built. It rests on
three inputs gathered the same day: a survey of agent visualizers and operational control
rooms, a survey of three.js / R3F techniques with measured bundle costs, and a file:line review
of the current page (OrchestrationView, OrchestrationCubes, OrchestrationLive, the ledgers
M280–M316, `product-rules.md`, `orchestrate-reference-plan.md`).

The thesis: **the page already has good bones (the lazy 3D door, demand frameloop, SVG hit
layer, semantic zoom, adaptive quality) but its motion is clock-driven decoration on top of a
state vocabulary that is mostly words.** The highest-value move is to make every motion a
consequence of a real event and every state a shape, and only then to spend on fidelity.

---

## 1. What the research says

### The field
- **Agent visualizers are 2D and mostly toys.** Agent Flow (patoles/agent-flow, ~1.7k★) is
  the strongest functional one: d3-force + Canvas2D, particles on bezier edges whose
  *direction* encodes call vs. return, a burst on tool completion, and — the transferable
  part — **one pure `detect-state-changes` function feeding visuals, audio and log**, plus
  `TOOL_MIN_DISPLAY_S` / `TOOL_MAX_RUNNING_S` so a 30 ms tool is still seen and a stuck one
  fades rather than lies. Pixel Agents (9.4k★) and Claude Office (523★) show that *pose*
  carries information and *locomotion* does not; Claude Office's context-window-as-filling-
  trash-can is the best example of making a hidden resource physical.
- **3D agent offices (R3F + bloom, "spawn portals") are decoration** with near-zero adoption.
  No product found combines physics, 3D and functional encoding well — the space is open.
- **Commercial command centres** (Codex app, Cursor 3 Agents Window, Devin Command Center)
  are lists and Kanban. Nothing found uses motion as state.
- **The proven motion vocabulary is from ops and tools:** Kiali (circle = OK request, red
  diamond = error, density = rate, *speed* = latency), Netflix Vizceral (density normalised to
  recent max, three discrete zoom levels), Unreal Blueprint (the wire that *just ran* pulses),
  Rivet (hover the wire → see the payload that crossed it), ComfyUI AnimatedLinks (animate only
  links touching the hovered node), GitHub globe (arcs = merged PRs, spikes = open, adaptive
  DPR), Gource (actor fires a beam at the file it touched; idle files fade; replay with idle
  skip), perfect-cursors (buffer streamed positions ~250 ms and spline-interpolate).
- **Principles:** WWDC18 *Designing Fluid Interfaces* (interruptible, velocity-inheriting
  springs); Heer & Robertson 2007 (stage transitions, one kind of change per beat); Ware
  (motion is the strongest preattentive channel — spend it only on what deserves
  interruption); "resist the urge to juice it" (juice that encodes nothing is noise).

### The techniques (measured, 2026-09)
| Technique | Cost | Verdict |
|---|---|---|
| `maath` `damp3/dampC/dampQ` — critically damped, **returns "still moving"** | ~1–3 KB shaken | Adopt. Fits `frameloop="demand"` exactly. |
| Hand-written verlet/PBD rope (12–20 nodes, 4–8 constraint iterations) drawn with three's `Line2` | ~1 KB, µs per frame | Adopt for dependency cables. Vercel Ship badge is the model. |
| InstancedMesh tokens driven by a curve DataTexture in the vertex shader | 0 KB | Adopt for Watch flights and towers. |
| `camera-controls` — `fitToBox`, `setLookAt(…, true)`, `update()` returns "needs render" | 10 KB gz | Adopt for Watch (lazy chunk only). |
| `ContactShadows frames={1}` style one-shot bake; N8AO half-res `accumulate` | 0 / 84 KB gz | Bake: adopt. N8AO: top quality tier only, lazy. |
| Rapier | ~761 KB gz WASM | Reject. Nothing here needs rigid bodies. |
| Theatre.js, cannon-es | stale / unmaintained | Reject. |
| troika SDF text | 45 KB gz, breaks on WebGPU | Reject — labels are SVG already and stay crisp. |
| WebGPU / TSL compute particles | pmndrs postprocessing v6 does not run on it; r3f v10 is alpha | Defer until r3f v10 stable; it means rewriting the bloom door. |

Everything adopted lives behind the existing `lazy()` door of `OrchestrationCubes` /
`OrchestrationLive`, so the first chunk pays nothing (`orch.bloom-door.*`, `orch-zoom.3`,
`orch-live.door.1` stay green).

---

## 2. Diagnosis of the current page

Facts from the review, each with its source:

1. **Motion is clock-driven, not event-driven.** `orchestration-cube-motion.ts:75–93`: a
   working cube gets `wave(clockMs, 2800)` emissive, `wave(clockMs,1800)` rim and a ±2 px
   infinite bob. It encodes "the state word is working" — which the word already says — and
   says nothing about whether the agent did anything in the last minute. The M294 critic's
   "working is nearly indistinguishable from idle" is this.
2. **The demand frameloop is defeated.** A working cube invalidates every frame for as long
   as it works (`OrchestrationCubes.tsx:295–301`), so any live session pins the scene at
   60 fps. The frame-time sampler rAF (`OrchestrationView.tsx:1886–1909`) runs whenever WebGL
   is up, **including under the List lens**.
3. **Most of the state model has no shape.** Distinct in the scene: working, needs-you,
   starting, idle, exited, selection, stage change. **Words only:** failed vs. passed checks,
   blocked/dependency-blocked, queued, review / verified / agent-finished / stale /
   changes-requested, merged/accepted, interrupted/stopped, spend and limits, every job-journal
   state (M316), and permission-pending vs. plain wants-you (both amber). There is **no red
   anywhere in the scene**, though the plan assigns red to failure.
4. **A live bug:** a `passed` checkpoint's plate reads "check · idle" because `stateWord`
   maps passed → idle (`OrchestrationView.tsx:449`).
5. **Infinite loops against the plan's "finite attention pulses":** Watch's needs-you beat
   `(sin(t*2.2)+1)*.25` (`OrchestrationLive.tsx:310`) and the contended-file torus pulse
   (`:453–457`) never stop, while the Scene's needs-you pulse is 3 cycles.
   `styles.css:8448` loops `edge-current` forever on `.orch__edge[data-connected-live]` —
   check which surface that selector reaches before calling it a violation of "no endless
   connector motion".
6. **The goldens can't see motion.** `orchestration`, `-dark` and `-working` are shot under
   reduced motion (`scripts/shot.cjs:702/734/758`), so no motion regression is ever caught.
7. **Dead code:** the hub icosahedron and its `sin(t/700)` pulse are unreachable
   (`hub: false` at `OrchestrationView.tsx:1105, 1201`). That is correct per the "no supervisor
   crystal" rule, but it still ships.
8. **Critic debt still open** (M294 round 3): "small, flat, unlit", tiers read as coplanar,
   no cyan edges, light theme is a grey inversion; after M298 "busy is carried by text more
   than light".

---

## 3. Proposals

Ranked by value ÷ cost. Each lists **what it encodes**, **technique**, **cost**, **rules it
touches**, and **how it would be verified**. P1 is the foundation the rest assume.

### P1 — One transition detector, one invalidation contract *(foundation; highest leverage)*

**What.** A pure `orchTransitions(prev, next, nowMs) → OrchTransition[]` in plain TS (next to
`orchestration-cube-motion.ts`), emitting semantic events: `tool-event`, `check-passed`,
`check-failed`, `became-blocked`, `unblocked`, `needs-you`, `answered`, `verified`,
`merged`, `ended`, `reattached`. **Every** visual consumer — Scene cubes, platform rims,
SVG beacons, Watch flights, the reduced-motion text log, the activity feed — reads the same
list. Motion, log and words cannot disagree (Agent Flow's detector pattern).

Beside it, an **invalidation contract**: every animator returns a boolean "still moving"
(`maath` damp does this natively; the rope returns kinetic energy > ε; camera-controls
`update()` returns it; the token queue returns non-empty). The scene invalidates while any
is true and **then stops**. Clock sines are removed.

- **Encodes:** nothing new by itself; it makes every later proposal honest and cheap.
- **Cost:** ~0 KB (+ `maath` ~2 KB shaken, lazy). Removes the permanent 60 fps.
- **Rules:** Watch rule 5 ("every movement must explain an event") becomes structural rather
  than per-effect.
- **Verify:** plain-node checks over the detector (fixture pairs → exact transitions); a
  deterministic-clock check that every motion function settles within its declared duration
  and returns `false` after; an Electron check that with 3 working-but-silent sessions the
  scene renders **0 frames** over 2 s idle; the frame sampler is off under the List lens.

### P2 — Working is shown by *real activity*, not a sine *(fixes the critic's #1 complaint)*

**What.** Replace the working bob/wave with an **impulse model**: each `tool-event` for a
session kicks a critically-damped spring (emissive +, scale +2%, a single rim flash) that
settles in ~600 ms. A session doing real work "breathes" at the rate of its real events; a
session that says *working* but has emitted nothing for N seconds settles to a calm steady
glow and, past a threshold, shows a **"quiet for 4 m"** contextual word. Busy rate reads
the way Kiali/Vizceral read load: density normalised to the recent max across the island, so
a quiet system doesn't look dead and a busy one doesn't saturate.

- **Encodes:** event rate; stalls (the most useful thing a control room can show and today it
  is invisible).
- **Technique:** `dampC`/`damp` on emissive and scale; impulse queue; per-session rolling
  count over a 30 s window.
- **Cost:** negligible; fewer frames than today.
- **Rules:** "height and glow are never a hidden score" — the pulse is a *moment per event*,
  not a level; the level stays the state tone. "Never a zero-value statement at rest" — the
  quiet word appears only when it's true and past threshold (contextual layer).
- **Verify:** fixture feeding N events → N impulses; silent working session → settles, then
  quiet word after the threshold; reduced motion → no impulse, the rolling count shows as a
  contextual number instead.

### P3 — Complete the state vocabulary: every state gets a shape, a colour and a moment

The plan says "every state also has words and a shape"; today half have only words. One
design per state, all one-shot, all with a reduced-motion equivalent (a static form +
the word):

| State | Resting form | Moment (one-shot, on transition) |
|---|---|---|
| **check passed** | checkpoint puck *seats* into its socket, cyan rim closed | 250 ms drop + one damped settle, a short cyan tick along the plate edge |
| **check failed** | puck stays raised, **red** rim, hairline fracture decal on the puck top | one red spark burst (≤24 instanced particles, 500 ms), plate rim flashes red once |
| **stale** (evidence older than revision) | puck desaturated, dashed rim | cross-fade from its prior colour; no motion |
| **blocked** | station tethered by a slack cable (P4) to its upstream | cable drops slack |
| **queued** | hollow wireframe station, 40% opacity | fills solid when it starts (the existing `starting` settle) |
| **permission-pending** vs **waiting-for-reply** | amber, but permission gets a **key/lock glyph** notch in the cube; waiting gets a speech notch | amber pulse ×3 (existing) |
| **changes-requested** | amber rim on the review checkpoint only | one amber sweep along the plate rim |
| **verified** | cyan rim **closes** around the whole plate (a seal) | the rim draws itself 0→100% over 700 ms |
| **merged** | see P7 | — |
| **ended / unknown** | dark (existing); `unknown` gets a hollow outline to separate "gone, reconciled" from "ended cleanly" | — |

Also: **fix `passed → idle`** at `OrchestrationView.tsx:449` (a real mislabel), and give the
Minimap the same red/amber/cyan tones so a failure is visible when zoomed out.

- **Cost:** geometry is already cached per size class; decals are one small texture; spark
  bursts are one InstancedMesh shared scene-wide.
- **Rules:** cyan = execution/selection, amber = decisions, **red = failure** (finally used),
  violet = family. Each shape pairs with a word (List parity untouched).
- **Verify:** per-state golden composite in the critic loop (these ARE visible under reduced
  motion, so goldens finally carry them); `verify:orchestration` checks mapping state → form.

### P4 — Dependency cables with real rope physics

**What.** In the dependency lens, and around the selection, dependency edges become **verlet
ropes** pinned to sockets on the two stations/platforms. Their physics encodes their
meaning:

- upstream **running** → rest length shortens: the cable pulls **taut**.
- downstream **blocked, upstream idle/queued** → cable hangs **slack**, sagging under gravity.
- upstream **failed** → the cable **snaps** at the upstream end and retracts, swinging once;
  the free end glows red.
- dependency **satisfied** → cable relaxes and fades out over 600 ms.

Then the rope **settles and stops** — kinetic energy < ε ends invalidation. That's the
difference from the forbidden "endless connector motion": the cable only moves when its
state changes. ComfyUI's lesson applies: cables are drawn only in the dependency lens or for
the selection's neighbourhood, never all at once.

- **Technique:** 12–16 nodes, position-based dynamics, 4–8 distance-constraint iterations,
  Catmull-Rom through `Line2`/`LineMaterial` (0 KB, already in three). Same shape as the
  Vercel Ship lanyard, without Rapier.
- **Cost:** ~1 KB code, microseconds for 20 cables; zero frames at rest.
- **Rules:** the dependency lens is read-only (M289) — cables are display, never a drag
  handle. Hit testing stays on the SVG layer (cables get an SVG polyline mirror for hover).
- **Verify:** plain-node rope sim: taut length < slack length; energy decays below ε within
  N steps for every transition; snapped rope never re-attaches without an `unblocked` event.

### P5 — Causal packets with an outcome shape, and "hover the wire, see the evidence"

**What.** The one-shot `edge-current` already exists. Extend it with Kiali's encoding and
Rivet's inspection:

- Packets travel **only** when an event happens on that edge (Unreal's "the wire that just
  ran"), in the direction of causality; a *return* travels backwards with its trail flipped
  (Agent Flow).
- Packet **shape = outcome**: circle for success, diamond for failure (red). Shape, not only
  colour, so it survives colour-vision deficiency.
- **Hover a connector** → a callout with what crossed it last: the check's output excerpt
  (M306's exact output record), the handoff note, the file set. The wire becomes the place
  evidence is inspected.

- **Cost:** SVG overlay already hosts packets; the hover payload reuses existing records.
- **Rules:** no endless motion; no camera flights on events; contextual density layer only.
- **Verify:** event → exactly one packet with the right shape; no packet without an event;
  hover callout content equals the stored record (not a re-derivation).

### P6 — Hidden resources as physical props (context, spend, run limits)

**What.** Claude Office's best idea, done soberly:

- **Context window as a fill level** inside the station body: a translucent inner column whose
  height is context used ÷ window. At ~85% it turns amber; a compaction event makes it
  *drop* with one damped settle. (Needs the context figure — check what `usage:panel` /
  `ledger:usage` already carries before building.)
- **Run limits as a rim gauge** (Mini Metro's filling timer ring): the platform rim fills
  clockwise as spend/turns approach an enforced limit; amber past 80%, red at the limit.
  Advisory limits draw dashed.

- **Encodes:** things people currently must open the inspector to find.
- **Rules — careful:** "height and glow are never a hidden score" — the fill is *labelled*
  (hover and inspector say "62% of context"), it is inside the body, not the body's height.
  It lives at the **contextual** layer (visible on hover/selection or when past a threshold),
  never at rest as a zero-value statement. The `$1.84` execution box stays not-copied: show
  proportion to a limit, not a dollar figure at rest.
- **Verify:** fill = value ÷ limit exactly; absent data → no gauge (not an empty one).

### P7 — The merge moment *(the product's payoff, currently invisible)*

**What.** M315 made Accept merge a reviewed lane into main. That is the core job's finish
line — "intention to reviewed result" — and today it's a word. Make it the single most
authored motion on the page:

1. The lane platform's verified seal (P3) is already closed.
2. On `merged`, the platform lifts slightly and **glides along an arc** to dock against the
   workspace plate (staged per Heer & Robertson: lift → travel → dock, one change per beat,
   ~900 ms total).
3. At contact a single cyan weld seam runs along the joined edge; the lane's stations
   collapse into one "merged" tablet carrying the commit short-hash.
4. The platform then settles to the resting "done" form.

Reduced motion: a cross-fade to the docked form plus the word "Merged into main · a1b2c3d".

- **Cost:** one-shot; no new libraries (`damp3` + a quadratic path).
- **Rules:** "no camera flights on events" — the *object* moves, the camera does not. Plates'
  placement is append-only (`orchCellCentre`): docking is a transitional animation to a
  merged form, the cell itself is not reassigned.
- **Verify:** motion trace settles; placement of other plates unchanged before/after.

### P8 — Recovery made visible (M316)

**What.** On reopen, M316 reconciles jobs against live workers. Show that honestly:

- A session that was running and is **gone** reappears as a **hollow wireframe ghost** with
  "ended while closed" — never as a live cube (the Phase E rule: never show Running for a gone
  session).
- **Reconnect** animates the wireframe *filling solid* from the base up (~500 ms).
- **Retry / continue** re-enters through the existing `starting` settle; **abandon** fades
  the ghost out.
- The job journal's `pending / safe-retry / blocked / abandoned` items get the P3 forms.

- **Verify:** reconciled-gone → ghost, never working tone; each recovery verb produces its
  one transition.

### P9 — Watch lens: honest flows, finite pulses, and **replay**

1. **Finite pulses.** Make Watch's needs-you beat and contended torus finite (3 cycles, then
   a static amber ring), matching the Scene. Small fix.
2. **Direction encodes read vs. write.** Writes fly session → tower (today); reads flow
   tower → session as a thin reversed stream (Agent Flow's return), replacing the scan ring.
3. **Minimum dwell / maximum lifetime** for command columns and flights (Agent Flow's two
   constants): a 30 ms command is still seen for its minimum; a column with no outcome fades
   at its maximum with "no result recorded" rather than standing for 20 s.
4. **Burst smoothing.** Hold the event stream ~250 ms and interpolate (perfect-cursors):
   bursts of 12 tool calls arrive as a readable stagger instead of a pile-up. The existing
   0.42 s queue becomes adaptive: compress the stagger as the queue deepens.
5. **Instanced flights.** One `InstancedMesh` for every token and spark, positions from a
   curve DataTexture in the vertex shader — one draw call regardless of burst size; lets the
   8-item cap rise.
6. **Replay — the big one.** Phase E gave a durable timeline. Add a scrubber to Watch that
   replays the last hour/session **paced by real timestamps with idle periods skipped**
   (Gource, zoetrope): "watch the 50 minutes you were away in 40 seconds". This turns the
   M309 return briefing from text into a thing you can watch, and it's what no competitor has.
   Reduced motion: the scrubber steps the text log instead.
7. **Camera.** `camera-controls` in place of OrbitControls: `fitToBox` for Reset,
   `setLookAt(…, true)` for Follow, `rest`/`update()` feeding the invalidation contract
   (kick one frame on `transitionstart` — drei #2005).

- **Cost:** `camera-controls` 10 KB gz inside Watch's lazy chunk; everything else 0 KB.
- **Verify:** Watch shot mid-flight stays deterministic (seeded clock); replay of a fixture
  timeline produces the same event order as the log; finite pulses settle.

### P10 — Fidelity that serves reading *(the "small, flat, unlit" debt)*

Only after P1–P3, and all tier-gated through the existing adaptive-quality ladder:

- **Bloom means something.** Emissive > 1 (over the 0.62 threshold) is reserved for
  *attention* and *a just-happened event* (P2's impulse peak). Resting working stays below
  threshold. Bloom becomes a signal instead of a finish.
- **Crisp cyan edges.** `Line2` rims at 1.5 px on each tier's top edge (the critic's "no cyan
  edges", "tiers read coplanar") — the tier separation becomes a line, not a luminance guess.
- **Grounding.** Bake a contact shadow once per layout change (`frames={1}` pattern) instead
  of the live PCF shadow; N8AO half-res with `accumulate` on the top tier only, lazy (84 KB
  gz) — converges while the camera rests, then stops.
- **Dither/noise** at low opacity in the existing composer pass to kill banding in the
  blue-black gradients.
- **Light theme** gets its own material pass (lit surfaces, ink rims, no additive pools)
  rather than an inversion.

- **Rules:** judged against the reference by the fresh-context critic, silhouette → material
  → glow → connectors → labels → composition → chrome; goldens rewritten on purpose only.

### P11 — Object constancy across lenses and zoom tiers

**What.** Scene → Watch today is a cut between two unrelated scenes. Stage it: the island's
diamond platforms *tilt* from the ortho stage (56°) into Watch's perspective over ~500 ms
while stations morph into session cores, so the person keeps track of which thing is which
(Heer & Robertson's object constancy). Same for semantic-zoom tier changes (summary →
stations → evidence): stations grow out of the plate instead of popping in.

- **Cost:** high (two scenes share a transitional camera); do last.
- **Reduced motion:** a 150 ms cross-fade.

---

## 4. Motion must become verifiable

Goldens are shot under reduced motion, so everything above would be invisible to the gate.
Add, in `verify:orchestration` (plain node where possible):

- **Settles:** every motion function, sampled on a deterministic clock, reaches its rest value
  and reports "not moving" within its declared duration.
- **Finite:** no attention motion exceeds its cycle count; no infinite loop outside an
  explicitly named allowlist (which should be empty).
- **Event-bound:** no packet, flight or impulse without a transition from `orchTransitions`.
- **Idle budget:** an Electron check that a scene with working-but-silent sessions renders 0
  frames over 2 s, and that the frame sampler is off under List.
- **One motion golden:** a single `orchestration-motion` scene captured *with* motion at a
  fixed clock mid-transition (like Watch's mid-flight shot), for the critic.

## 5. Not recommended

- **Rapier / any rigid-body engine** — ~761 KB gz WASM for effects a 1 KB verlet does.
- **Walking/pathfinding avatars, spawn portals, holograms** — the most common gimmick in the
  field; locomotion that encodes nothing.
- **A central crystal or hub** — would imply a supervisor (not-copied list). Delete the dead
  hub code rather than revive it.
- **Always-on DoF, transmission materials, god rays** — expensive, encode nothing.
- **WebGPU now** — postprocessing v6 and troika don't run on it; r3f v10 is alpha. Revisit
  when r3f v10 is stable, starting with compute particles, and plan a bloom-door rewrite.
- **Theatre.js** — stale; a few camera moves don't need an authoring suite.
- **Sonification** beyond, at most, one optional soft tick on completion.

## 6. Suggested sequencing

| Wave | Proposals | Why this order |
|---|---|---|
| 1 | P1, P2, the `passed→idle` fix, finite Watch pulses, sampler off under List, delete dead hub | Foundation + removes the permanent 60 fps; small, testable, immediately visible |
| 2 | P3, P5 | Completes the vocabulary; red finally exists; goldens can carry it |
| 3 | P4, P7, P8 | The physical moments: cables, merge, recovery |
| 4 | P9 (replay first), P6 | Watch becomes the return briefing; resources become visible |
| 5 | P10, P11 | Fidelity and constancy, judged by the critic against the reference |

Open questions for the person before Wave 3+: is the context-window figure already recorded
per session (P6)? Should replay (P9.6) cover only the current task or the whole workspace?
