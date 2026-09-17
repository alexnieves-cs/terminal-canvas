# M280 — the Orchestrate diorama's bloom pass

A restyle of the Orchestrate diorama from a reference dashboard the user supplied:
real HDR bloom on the agent cubes, light pooling on the floor under the ones that
are working, a hub that is not just another cube, and the non-GL half — edge
ribbons, atmosphere, and a card that says what the plate no longer repeats.

Chosen deliberately at the outset, against the alternative of faking bloom in CSS:
**real post-processing**, accepting a new library; and **the reference's look over
the house density rules** where the two disagreed, dark theme first.

## What the bloom pass is, and the four traps under it

`renderer/orchestration/orchestration-bloom.tsx` is the one door. Each of the four
facts in its header cost a measurement, and **each fails silently**:

1. **Demand mode survives.** `useFrame(…, 1)` takes the render from fiber and still
   only runs on invalidated frames, so the idle ring renders nothing between React
   updates. A composer on its own `requestAnimationFrame` would have restored the
   60fps repaint `frameloop="demand"` exists to kill — with no error and no red suite.
2. **Tone mapping had to move to the END of the chain.** The renderer's own
   `toneMapping` is applied when the RenderPass draws, clamping every value to 1.0
   *before* the bloom pass reads it. Left there, raising emissive does nothing at
   all. The renderer goes `NoToneMapping` while the component is mounted, and tone
   mapping is re-applied as the last effect over the HDR buffer; both it and the
   clear alpha are captured and restored on unmount, because the renderer outlives
   the component.
3. **A half-float frame buffer is what makes it HDR.** The default 8-bit buffer
   cannot hold a value above 1.0, so a threshold-driven bloom over it selects nothing.
4. **Clear alpha stays 0.** The canvas is transparent glass between the SVG ground
   and the SVG overlay. A composer clearing to opaque black hides the ground rings
   and edges under it.

**The library choice is load-bearing and is the raw `postprocessing`, not
`@react-three/postprocessing`.** The wrapper peers on `@react-three/fiber >= 9.7.0`
and this app is on 9.4.0, so the convenience would have cost a fiber bump underneath
a diorama that already worked. The raw composer is ~40 lines. Installing it added
exactly one package.

**Measured, not reasoned:** `postprocessing` appears 25× in the lazy
`OrchestrationCubes` chunk and **0× in the first chunk**. `orch.bloom-door.1/.2` pin
both halves — the importer set, and that the island is still reached through `lazy()`.

## Two things designed wrong on paper and corrected by looking

**Ground pools cannot be point lights.** The design said "per-node point lights →
light pools on the floor". The floor is a `shadowMaterial`, which renders received
shadows and is otherwise unlit, so a light would pool on nothing — and giving it a
lit material instead would make the canvas OPAQUE and destroy the alpha that trap
(4) had just been proven to preserve. They are additively-blended emissive discs
sharing one `CanvasTexture`: they add light over the glass without occluding the SVG
beneath, and being emissive they bloom for free.

**To bloom in colour, the emissive colour must be DARKER, and the tone mapper must
not be ACES.** Two separate causes, found in that order. First: at lightness 0.7 ×
intensity 1.95 all three channels clip, and every clipped channel is white — the
ring bloomed colourless. Capping lightness at 0.44 and pushing saturation *up* fixed
the pale roles. Second, and the real one: **ACES desaturates highlights by design**,
and with tone mapping moved to the end of the chain the lit cube faces land squarely
in that range. Only the most saturated roles (the watcher's violet, needs-you amber)
kept any hue; the steel-blue terminals went white, which reads as *tone overrode
role* — the one thing this scene may not say. `ToneMappingMode.NEUTRAL` (Khronos PBR
Neutral) holds saturation into the highlights and is what shipped.

## The fixture: `orchestration-working`

**The existing scenes could not verify any of this.** Every agent in them is `idle`,
and idle deliberately sits *under* the bloom threshold with no ground pool — so the
whole pass rendered pixel-identical to no pass at all. It was first confirmed with a
throwaway probe forcing `idle → working`, reverted against a pre-probe backup.

The scene that replaces the probe seeds four of the fixture's own panels by sending
the same `agent:state` transitions main would have sent, addressed by the `data-node`
each cube now carries. That is the only faked thing and it is disclosed in the
scene's `intent`, as `edge-firing` discloses its frozen clock.

**It must run AFTER `orchestration-dark`, self-contained.** Sequenced between the two
scenes, its seeded transitions landed in the canvas-wide **activity feed** — a real
event ring — and added two rows to the dark scene's golden. Handing the tones back to
idle restores the state but never the HISTORY. The only way to leave a neighbour
untouched is to run after it.

The pair is now a contrast, and that is the point: **`orchestration-dark` pins that
idle does NOT bloom; `orchestration-working` pins that working does, in its role's
colour.**

## The non-GL half, and what it cost

Bloom only reaches pixels inside the WebGL canvas — cubes and their pools. Edges, the
haze and the cards are SVG/HTML over that canvas, so their glow is a CSS filter: a
deliberate approximation that will never match the composer exactly.

- **Edges** 1.25px → 2.25px, live 3px with a glow; lensed-out edges stay hairlines,
  because what the lens drops must not compete with what it keeps.
- **Atmosphere** — a two-lobe haze and a vignette, both `pointer-events: none`, so
  every SVG hit-target keeps every click it had.
- **The card** gained a role-tinted icon tile and a name / kind / state stack.

Three traps in that last one:

- `.orch__callout-card > strong, > span` is **direct-child scoped**. Wrapping the
  title in a new element silently dropped its `display: block` *and* its ellipsis,
  and the kind ran inline into the name (`claude — apiterminal`).
- **The card's height was written down twice** — its own box and the collision placer
  that decides where it may sit. Adding a line grew one and not the other, so the
  placer reserved space for a card shorter than the card was. Now one `CALLOUT_H`.
- **The kind duplicated the plate.** Each cube's plate already read `• working ·
  terminal`; the card then said the same three facts eight pixels away. Resolved by
  taking the kind off the SATELLITE plates only — the hub and the `+N more` node keep
  theirs, because "Workspace hub", "Orchestrator" and "Other" name a position in the
  ring that `node.kind` cannot express and no card repeats.

The placer also gained a 24px sweep of candidate positions. Edge-derived candidates
alone were enough while a card was two lines tall; at three, a crowded arc can have
no edge-derived slot that clears its neighbours, and the placer was picking the
least-bad overlap from a set that never contained the free spot further along.

**And then the sweep turned out to be the smaller half of the problem: `y` was
never a candidate at all.** The placer's own header had recorded the symptom — "a
dense ring has NO free spot for a 184×154 card; four captures of weight-tuning only
moved which node it hid" — and that conclusion was true, but only *inside the search
it was running*. A `flip` boolean decided above-or-below before a single candidate
was scored, and below was reachable only when above ran off the stage; every
candidate after that differed in `x` alone. Tuning costs inside a search that cannot
reach the answer just changes which wrong answer wins, which is exactly what four
captures had shown. Both rows are candidates now — `rows.flatMap(y => drifts.map(…))`
— and the distance term had to change with them: `Math.abs(x − n.x)` charged nothing
for vertical displacement, so left alone it would have made the lower row free for
every card. It is `Math.hypot` now, so the two rows compete on one measure.

A row that runs off the stage is **dropped, not clamped**. A clamped row silently
re-enters the search as a different box from the one its cost was computed for.

**What this did not fix, and the measurement that says why.** Cards still overlap
cubes and plates on the crowded arc. The stage is 860×420 with `RING_R` 250 and the
hub at its centre, so the ring's projected ellipse uses nearly the full height: for a
bottom-of-ring cube the below row starts past the stage floor and is dropped, and the
only row left is the one that points back into the ring's interior. Free area does
exist — roughly 44% of the stage is uncovered — but it is in the corners, and it is
not adjacent to the cubes that need it. Reaching it means either a smaller ring, a
taller stage, or accepting a long stem, and each of those is a design decision about
the whole scene rather than a placer weight. **It is not another tuning pass**, which
is the one thing this surface has already proven does nothing.

## An unrelated defect this run's own failure exposed

`verify:visual`'s watchdog could not kill what it watched. The chain is
verify-visual → `npm` → Electron; with no process group of its own the watchdog's
`SIGTERM` landed on npm, which died obediently and orphaned the Electron grandchild.
Measured here: that orphan was still holding its fixture HOME and a GPU process **ten
minutes** after the suite had printed FAIL and exited, and it ignored a SIGTERM aimed
straight at it. `spawn(…, { detached: true })` plus `process.kill(-pid, 'SIGKILL')`
takes the whole group. The comment on that variable had claimed the kill worked since
the watchdog was written.

The run that exposed it also overran the 221 s watchdog at 19 of 64 scenes — but
under a 15.9 load average and ~60 MB free, with a `electron-vite dev` of someone
else's sharing the GPU. **`WATCHDOG_MS` was NOT raised**: a scoped re-run painted and
compared three scenes in 18.1 s wall, which is the harness's normal rate, so there is
no evidence this milestone's one added scene moved the ceiling. Raising a watchdog to
fit a contended run is how a real hang stops being visible.

## Goldens

Three scenes changed, and only three — the change is confined to
`renderer/orchestration/` plus `.orch__*`-scoped rules appended to `styles.css`.

- **`orchestration`** (light) — 9.278% of pixels differ. Edges are ribbons rather
  than hairlines, the atmosphere layer sits behind the ring, and every satellite
  plate now reads its state alone while the hub keeps "Workspace hub". **There is no
  glow here and that is the shipped decision, not an omission**: the ground pools are
  additive, and additive blending over a light floor can only lighten it, so the
  white ellipses under dark cubes read as holes cut in the floor. They stand down
  entirely in the light theme. Light-theme bloom is deferred, by the user's choice of
  dark-first.
- **`orchestration-dark`** — 9.274% differ. The half of the pair that pins the
  negative: every agent is idle, idle sits *under* the bloom threshold, and nothing
  in the ring glows. The selected card moved off the left arc, so the top-centre
  plate it used to cover is legible; the hub is still partly behind it.
- **`orchestration-working`** (new) — the half that pins the positive. Two working
  agents and one `wants-you`, in three different roles, and **the three read as three
  hues at one brightness**: a steel-blue terminal at top centre, a teal chat at lower
  left, amber on `tests` at upper right with its own amber pool. That mix is the
  whole point of the scene. An earlier draft seeded `.slice(0, 4)` of the ring, which
  were four TERMINALS, so the scene built to show `role ≠ tone` was comparing lit
  terminals against *unlit* chats — brightness, not hue — and every verdict read off
  it, including my own "role colour is back", was unsupported. The fresh-context
  critic found that; the seeding goes by `data-kind` now and refuses by name if fewer
  than two kinds are lit.

Two honest notes about the new scene. The steel-blue terminal is still the palest of
the three — it holds its hue but sits closer to white than the chat does, and that is
the residual of the whole tone-mapping fight rather than a clean result. And
`ACTIVE AGENTS` reads 2 beside three lit cubes: only `agentic` panels count toward
that tile, and `tests` is counted under `WAITING ON YOU` instead. That is the model's
semantics, not a miscount, but a reader comparing the tile to the ring will have to
be told.


## The gate

`npm run verify` — **52/54 suites, 551.6 s.** The two reds are the M279 baseline
reproduced exactly, which is what makes them placeable rather than assumed:

| Suite | This run | M279's record |
|---|---|---|
| `verify:panels:agents` | 81/82 — `detail.1` | 81/82 — `detail.1`, pre-existing since M275/M277 |
| `verify:panels:product` | 109/117 — `workflow.edit.1/.2`, `workflow.lib.1`, `workflow.wire.1`, `workflow.inspect.1`, `workflow.save.1`, `workflow.panel.1e`, `reach.1` | 109/117 — "the M277 set exactly", the same eight ids |

Same counts, same names. `detail.1` is the canvas card's zoom tier and the eight are
the `@xyflow` flow editor and the launcher's tab order; this milestone touched
`renderer/orchestration/` and `.orch__*` rules, and no orchestration check is among
them. `verify:orchestration` is 55/55, `verify:styles` 75/75, and `verify:meta`
`visual.1` is green at 64 declared / 64 goldens.

`verify:visual` is hand-run and is the three goldens above.
