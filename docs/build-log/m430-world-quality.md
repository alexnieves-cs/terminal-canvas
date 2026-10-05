# M430 — one quality tier for the room

The brief: replace the World view's three separately-tuned knobs (M414's pixel-ratio governor,
M417's card budget, M427's "starved → bloom off" stopgap) and its always-on shadow pass with ONE
tier, `WorldQuality = 'full' | 'lean' | 'flat'`, decided from the MEASURED frame rate, mirroring
Orchestrate's `OrchQuality` (M292). Built in a worktree off local `main` 8010b3b4, unmerged,
unpushed. `verify:world` 189 → 204.

| Commit | What landed |
|---|---|
| `3b1c0cfe` | `world/world-quality.ts` (the tier, `qualityPlan`, the step rule, `bloomRenders`, the in-memory store, `useBloomRendered`); `WorldView` drives shadows, cards, bloom and the ratio from it; `renderer/webgl-probe.ts` shared with Orchestrate; the probe and the lost-context note in `WorldStage`; the stopgap removed; `world.quality.*` and the re-pinned checks. |
| (this commit) | Four load-bearing entries and this log. |

## What each tier draws, and why each item costs frames

| | full | lean | flat |
|---|---|---|---|
| bloom (iff the person has it on) | yes | no | no |
| key light's shadow map | 2048² | 1024² | none (the light casts nothing) |
| pixel ratio cap / floor | 1.75 / 1.25 | 1.5 / 1 | 1 / 1 |
| full cards (`cardTiers` budget) | 3 | 2 | 1 |

- **Bloom** is the one full-frame pass: a HalfFloat scene buffer, a mip-chain blur and an FXAA pass —
  M420 measured ~1.2 ms per megapixel on an M1 Pro. It goes first because it is the item a person
  loses least by (the trim's glow is also geometry; `glowScale(.., false)` and friends are the
  identity).
- **Shadows** cost a second render of every caster into the map (the draw calls again — the robots
  are six meshes each) plus a filtered lookup in every lit fragment. A 1024 map is a quarter of the
  depth pass's fill; flat removes the pass AND the lookup (see "Shadows off really costs nothing").
- **Pixel ratio**: fill is quadratic in it. Each tier's floor is where the tier gives up: full is
  never drawn below 1.25x (a soft bloom over a 1x picture is the worst of both), lean goes to 1x.
- **Cards**: each is a DOM tree that follows a 3D point every frame and is painted over the live
  canvas with `backdrop-filter: blur(14px)` — a composited layer re-blurred each frame. A waiting or
  picked agent still always gets its full card (`WorldCard`'s `const full = !compact || waiting || picked`).

Deliberately NOT tier items: **robot idle motion** (a few transforms per robot on the CPU, no fill,
and a still room loses the one thing that says who is working — removing it removes information),
and **`antialias`** (a context attribute fixed when the context is made; changing it means a new
context, which `world.door.9` forbids mid-view).

## The step rule, and the step-up decision

Within a tier the ratio steps down by 0.25 after `LOW_WINDOWS` (3) half-second windows under 40 fps,
to the tier's floor; at the floor, `TIER_WINDOWS` (6, three seconds) more low windows step the
tier, and the ratio is brought under the new tier's cap. A good window, a stall (> 1.5 s window), a
non-number or a pinned tier forgets the streak. A step starts from the ratio actually DRAWN (under
the display and the bloom's pixel budget), so it never spends windows "stepping" a ratio nobody is
drawing at. Walk from a 2x display at a steady 20 fps: window 3 → full@1.5, 6 → full@1.25,
12 → lean@1.25, 15 → lean@1, 21 → flat@1 (`world.quality.step.1`).

**It never steps back up — neither the ratio nor the tier — for the session.** Orchestrate's tier
does climb back (under 12 ms after over 24), and that is right for it: its diorama renders on
demand and its tiers flip a pool and a composer. Here the frame loop is always on, and lowering the
quality is what raised the frame rate — so the fast windows that would justify a climb are
measurements of the CHEAPER tier and say nothing about whether the dearer one fits; the dearer one
already measured slow. A climbing rule would oscillate: the bloom pulsing on and off, shadows
popping, and a shader recompile hitch on every flip (dropping the shadow recompiles every lit
material). Since a tier is only ever left by failing it, "never return to a failed tier" and "never
step up" are the same rule. The session is the app's run: the tier is in memory, a reopened view
starts from it (and from its cap), and a relaunch or reload starts at `full` again. Nothing is
written to storage (`world.quality.store.1`).

## Shadows off really costs nothing — from three r186's and fiber 9.8.1's source

- fiber's `shadows` prop only sets `gl.shadowMap.enabled` (and `needsUpdate`). `shadowMapEnabled`
  is a program parameter, but `WebGLRenderer`'s `needsProgramChange` never compares it, so the flag
  alone recompiles nothing: every lit material keeps sampling a map that is no longer drawn.
- The key light's `castShadow` is in the lights' hash (`numDirectionalShadows`); flipping it bumps
  `lights.state.version`, which recompiles every lit material without the lookup, and
  `WebGLShadowMap.render` returns at `lights.length === 0`. No `material.needsUpdate` needed.
- three allocates a light's map only while `shadow.map === null`; a changed `mapSize` alone changes
  nothing. `Lights` disposes and nulls the map on every tier change.

## Departures from the brief

- **The pixel ratio is now the Canvas's `dpr` prop.** Reading fiber's source for the shadow question
  turned up a worse one: `applyRootConfiguration` runs on every `<Canvas>` render and resets the
  ratio to the prop's whenever they differ. Every governor `setDpr` since M414 (and M420's bloom
  budget) lasted only until WorldView next re-rendered. The governor reports the ratio up and the
  view passes it down. Not measured live — owed below.
- **The bloom's pixel budget moved out of `WorldBloom`.** Two writers of one ratio fought, and the
  composer's unmount restored the display's ratio — so the tier step that drops the bloom would have
  raised the fill. It is now one term of `worldDpr`, applied while the bloom renders.
- **The probe is a new shared module, not an import of `orchWebglAvailable`.** OrchestrationView is
  already in the first chunk (Canvas imports it statically), so importing it would not have grown
  the chunk — but it would tie WorldStage to Orchestrate's whole module graph. `webgl-probe.ts` has
  no imports; `orchWebglAvailable` now delegates to it.
- **The no-WebGL note is one note for both causes** ("The world view needs WebGL, which this machine
  is not providing right now." + Back to canvas); `data-world-no-webgl` says `none` or `lost`.
- **No new CSS.** The note reuses `world-route__note--stage --action`; the tier changes nothing
  styled.

## Traps

1. `useBloomOn()` is now the PERSON's bit only. Any new material that compensates for the composer
   must take `useBloomRendered()` (`world.quality.bloom.1` pins that only world-quality.ts calls the person's hook).
2. The verify bundle requires world-quality.ts, which keeps module state: `world.quality.store.1`
   steps it to `lean` — any later check that reads the tier sees `lean`.
3. `npm run verify:first-run` is red on this branch at `revamp.create.1` (the HUD renders
   `data-screen-control=""` the check's `^<div class="canvas-hud">` does not allow) — `CanvasHud.tsx`
   is untouched here; it is not this milestone's.

## Checks run (worktree, symlinked node_modules — plain node only)

`npm run typecheck` clean. `verify:world` 204/204. `verify:orchestration` 145/145 — `orch-zoom.3`
ran its SOURCE half only (no `out/renderer` in the worktree; it was not built, by the brief's
limits). Every other plain suite `npm run affected -- --list` selected is green but `verify:first-run`
(28/29, above). No Electron suite, no build, no `verify:visual` was run.

## Owed — only a live run can confirm

Turn the readout on first: `localStorage.setItem('tc.world.stats', '1')`, reopen the world. It now
reads `NN fps · NNN calls · NNk tris · <tier> @<ratio>x`.

1. **Each tier, pinned, on the same room.** In DevTools: `window.__tcWorldQuality = 'full'` (then
   `'lean'`, `'flat'`; `delete window.__tcWorldQuality` to hand back to the governor). The pin takes
   effect within half a second. For each, with the same agents (e.g. `SIMULATE_AGENTS=true`, 6 and 12
   agents) and the same window size, record from the readout after 5 s at rest: fps, calls, k tris,
   tier and ratio, and `document.querySelector('.world-view').dataset.quality`. Expect calls to drop
   by the casters' count from lean→flat (no depth pass) and by the composer's ~15 from full→lean.
2. **Shadows truly off at flat.** At `flat`, the floor under the robots must show NO shadow at all,
   not a frozen one: walk a robot (a status change sends it to the table) and look for a shadow left
   behind. Then `'lean'`: shadows back, softer-edged from the 1024 map. One hitch at each switch is
   the recompile; note its length.
3. **The ratio sticks.** Pin `lean`, confirm `@1.50x` (on a 2x display), then cause a WorldView
   re-render (pick a robot; an agent arriving) and confirm the readout stays `@1.50x` — the (4c) trap.
   On a 3200×2000-CSS-pixel canvas on a 2x display at `full` the ratio should read the bloom budget (~1.12x, `bloomDprCap`); turning
   the bloom off by hand (`localStorage.setItem('tc.world.bloom','0')`, reopen) must return it to
   the governed ratio, not above it.
4. **The governor itself, unpinned.** On a slow machine (a base M1, or throttle: Chrome DevTools →
   Performance → CPU 6x, or a large external display), watch the readout walk full@1.75 → 1.5 →
   1.25 → lean → … and stop; then confirm it never climbs back while the room is fast. Close and
   reopen the view: it must open at the tier it reached. Reload: back to `full`.
5. **Bloom compensation follows the tier.** At `lean` with the person's bloom on, the ground must be
   the studio ground (#eef0f3 — sample a pixel), not the brighter pre-image, and the cyan trim must
   be cyan, not clipped white.
6. **Cards.** At `flat`, only the nearest agent has a full card; a WAITING agent anywhere keeps its
   full card with Approve / Deny.
7. **No WebGL / lost context.** Launch with `--disable-gpu --disable-software-rasterizer` (or
   `--disable-webgl`) and open the world: the note, no `WorldView-*.js` request in the Network tab.
   Lost at runtime: in DevTools, `document.querySelector('.world-view canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`
   → after `LOST_GRACE_MS` (2 s) unrestored, the note with `data-world-no-webgl="lost"` and Try again;
   `…restoreContext()` within the grace → no note, and look at whether the room (and the bloom's
   composer) actually draws again after three's restore. Leaving the world normally must never
   show the note.
8. `verify:visual` and the Electron tier, before merge. Goldens should not move — `full` is the M427
   room — with one caveat: a governor step under harness contention now STICKS (the (4c) fix), where
   before it was undone at the next re-render. A world scene that differs only in sharpness is that;
   pin `window.__tcWorldQuality = 'full'` in the shot harness rather than re-baselining it.

## Review round (fresh-context reviewer, merged on `m428-m430-world`)

Three findings taken, each with a check:

- **A lost context was shown at once**, which unmounted the scene and threw away three's own restore
  (it prevents the loss, and Chromium restores a prevented loss). Now `LOST_GRACE_MS` (2 s), cleared
  by `webglcontextrestored`, and the note offers Try again. `world.quality.lost.1`.
- **A reopened view started at the tier's cap**, re-earning in 1.5 s per step a ratio the session had
  already measured too dear; and its first frames ignored the bloom's pixel budget. The governed
  ratio is now carried down-only beside the tier (`sessionDpr`), and the first frame is drawn at it
  under the budget. `world.quality.session-dpr.1`.
- **A slow START could cost the session a tier for good** (compile, shadow map, composer, model,
  dolly — each hitch under the 1.5 s stall rule). The first `SETTLE_WINDOWS` (2 s) of an open and of
  each tier step are not counted. `world.quality.settle.1`.
