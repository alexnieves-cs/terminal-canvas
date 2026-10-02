# M420 — a real bloom pass for the World view

The cyan trim was geometry (a bright un-tone-mapped core over a gaussian-alpha halo band) because
M416 judged a post-processing pass too costly for one detail and the `postprocessing` door was
pinned to the diorama. This milestone adds the real thing: an HDR bloom, tuned for the high-key
studio, with the geometric trim kept as the bloom-OFF look. Reads the same event store; no
contract, schema or IPC change. Local commit, not pushed. Still dev-only, like M412–M417.

Side by side, same camera, nine injected agents (real Electron dev window, M1 Pro): [bloom off](m420-bloom-pass/bloom-off.png),
[bloom on](m420-bloom-pass/bloom-on.png); crops [trim](m420-bloom-pass/trim-off-on.png) (left off, right on),
[table](m420-bloom-pass/table-off-on.png), [whiteboard](m420-bloom-pass/board-off-on.png).

## What it is

| Piece | File | Notes |
|---|---|---|
| The composer | `world/WorldBloom.tsx` | The SECOND importer of `postprocessing`. `EffectComposer` (HalfFloat) → `RenderPass` → one `EffectPass` of `[ToneMappingEffect(ACES), BloomEffect(mipmap blur)]` → a second `EffectPass` of `FXAAEffect`. Takes the frame with `useFrame(…, 1)`, so unmounting it hands the render back to fiber — that handover is the fallback. |
| The settings + the bit | `world/world-bloom.ts` | Pure of three and the library, and OUTSIDE the agent store's import graph (an HMR edit of `world-set.ts` re-instantiates the store, M416 — so these numbers are tunable live). `BLOOM`, `bloomThreshold`, `glowScale`, `haloShare`, `unlitScale`/`unlitInk`, `bloomDprCap`, a TypeScript port of three's ACES (`acesToneMap`, a numeric `acesPreimage`), and `isBloomOn`/`setBloomOn`/`useBloomOn`. |
| The switch | `setBloomOn(false)` | On by default; a dev's `localStorage['tc.world.bloom'] = '0'` turns it off for good, and `import('/world/world-bloom.ts?t=…').then(m => m.setBloomOn(false, false))` flips it live (HMR gives the module a `?t=` URL — read it from the served `WorldView.tsx`, or the import is a different instance and does nothing). No UI: the view is dev-only. |
| The bloom-off look | `WorldPlatform.tsx`, `WorldRobot.tsx`, `WorldProps.tsx`, `WorldView.tsx` | Every treatment is the identity with bloom off — M416/M417's picture, 250 calls. |

## Where this departs from the brief, and why

- **"UnrealBloomPass via @react-three/postprocessing if that is what the door allows."** The door
  allows the RAW `postprocessing` library and says NOT the wrapper (its peer range already forced
  fiber 9.4.0 → 9.8.1 once, and it has no importer). `UnrealBloomPass` is a three `examples/jsm`
  pass — a different door again. `BloomEffect` with `mipmapBlur` is the same progressive
  down/up-sample family, in the library the door names. "Re-pin the door" therefore meant a second
  importer of `postprocessing`: the renderer table's two rows, `orch.bloom-door.1` (now exactly two
  files), `orch-zoom.3`, `world.door.1` (eight three importers) and `world.bloom.door.1/.2`.
- **"Revisit the trim geometry if bloom makes the halo band redundant."** It does not: it gets
  STRONGER. Over a pale slab a screen-blended bloom is a tint, and the composer's ACES greys the
  unlit band (the most saturated cyan ACES can reproduce is (143, 219, 225), against the band's own
  (54, 230, 255)). At the same alpha the band lost about half its red-channel pull; 2.2× the
  opacity — on the slab only, not the black table — puts the blended tint back where bloom-off
  had it (measured on the slab, red 165). The bloom is the glow AROUND the core; the band is still
  the trim's reach inward across the flat top.
- **"Hold 60 fps … if bloom costs more than about 5 fps, tune it down."** Measured below; the tuning
  is a pixel budget on the composer (the ratio comes down, the bloom stays) plus FXAA in place of
  MSAA. Nothing was dropped silently, but the budget IS silent at runtime — see Owed.

## The decisions that took measuring (each in `docs/load-bearing.md`)

1. **`toneMapped={false}` means nothing under a composer.** three tone-maps only when drawing to the
   screen; into the composer's target the scene is linear HDR and ONE tone map runs over the sum.
   First cut (the orchestration's order: bloom, then ACES) measured: ground 239 → ~226, board
   255 → 226, the cyan trim a white line with no cyan.
2. **NEUTRAL fixed the ground and broke the cubes.** The orchestration ends on Khronos Neutral; here
   it matched the ground within a level and flattened the brown/teal/purple clusters to pastels.
   The studio was tuned under ACES, so the pass applies ACES — and **before** the bloom in the one
   effect list, because the bloom's luminance pass reads the pass's HDR input whatever the order:
   the glow is selected from the HDR scene and added over a picture that already has its look.
   With that, the slab, desks and robots are PIXEL-IDENTICAL on/off (slab 212,213,215 both ways).
3. **The unlit ground is brighter in the HDR buffer than any glow.** Painted as its ACES pre-image
   (so it comes out 239,240,243 again) it sits at ~1.76 linear luminance. A hand-set threshold of
   0.92 then 1.05 bloomed the whole frame to white (239 → 255). The threshold is DERIVED from that
   pre-image (+0.12) and each glow colour is scaled to a fixed headroom above it.
4. **The whiteboard cannot be a pre-image of white** (~4.4, past an 8-bit canvas, and past the
   threshold: the whole card bloomed out). The material is scaled to just under the threshold and
   every colour painted on the canvas is its pre-image over that scale (`unlitInk`, round trip
   ≤ 1 level). A flat 1.5× lift had already been tried and the critic read the words as gone.
5. **MSAA on a HalfFloat buffer is most of the cost** (below); FXAA is its own later pass because it
   needs the tone-mapped picture.
6. **A pixel-ratio change does not change fiber's `size`**, so the composer's resize effect has
   `viewport.dpr` in its deps, and the pixel budget re-applies on every resize.

## Measured (real Electron dev window, M1 Pro, CDP; nine agents injected through the store)

Display-capped (120 Hz), native window (2016×1302 canvas): **120 fps with bloom on and off** —
the cost is invisible at the cap. Draw calls 250 → 266 (+16: the composer's passes).
Pixel sampling, on vs off, same camera: ground 239,240,243 / 239,240,243; slab 212,213,215 / 212,213,215;
shadowed slab 212,213,215 / 212,213,215.

Frame time needs the cap off (`--disable-frame-rate-limit --disable-gpu-vsync`; screenshots hang
under those flags, so the two were separate launches), and fps is then a pixel-count story, ~1.2 ms/MP:

| Window (canvas) | bloom off | bloom on, as shipped |
|---|---|---|
| 1800×1100 @2× (2877×1827, 5.3 MP) | 300–347 fps, 2.9–3.3 ms | 157 fps, 6.4 ms — **+3.1 ms** (one earlier run, 195 fps = +2.2 ms; the machine was loaded for the later one) |
| 3200×2000 @2× (5327×3402, 18 MP) | 93–111 fps | **128 fps** on a 3539×2260 (8.0 MP) canvas — the pixel budget has cut the ratio |
| 3200×2000 @2×, NO budget (the intermediate state) | 93 fps | **47 fps** at the same 5327×3402 canvas — over the 60 fps line |

The tuning sweep (5.3 MP, uncapped, bloom on): MSAA×4 132 fps (+4.7 ms), MSAA×2 166 (+3.1), none 216
(+1.7), **FXAA 195 (+2.2)**. Mip levels 7 → 4 moved nothing (216–220). Under a 120 Hz vsync, MSAA×4 at
2400×1500 @2× (9.9 MP) quantised 120 → 60. So: cost in fps at the cap, none; in frame time, +2–3 ms at
a typical retina window; and the one size where it would have broken the 60 fps budget (18 MP) is
brought under it by capping the ratio, `BLOOM.maxPixels` = 8 MP, applied only over that. **Base M1 is
not measured** — this machine is an M1 Pro; at ~1.2 ms/MP an 8 MP canvas is ~10 ms here, and a base M1's
GPU is roughly half, so ~20 ms there (~50 fps) is the estimate to check.

Console across four toggles: only R3F's pre-existing `THREE.Clock` notice.

## The critic

A fresh-context critic was handed the off/on frames, the crops and `cortxos-1.png`. It confirmed the
trim and table glow read soft and the slab/ground are intact, and found three regressions, all
fixed or accounted for:

- **The table's rim was a thick opaque band and its body went teal.** The 2.2× band opacity was
  meant for the pale slab and had been applied to the table's band too (over black it was already
  vivid). Now `overPale` is slab-only (`world.bloom.glow.1`), and intensity 0.9 → 0.6, radius
  0.8 → 0.7 (the critic's "by about a third").
- **The whiteboard was washed out** — fixed as decision 4, with a remaining cost below.
- Cube clusters "shifted": they drift every frame (not a regression). "+16 draw calls": by design.

## The gate

`npm run verify`: the plain tier is 50/51; the one red is `verify:first-run` `revamp.create.1`, the
known baseline red — re-run with this change stashed, it fails identically. Because of it the runner
stops after wave 1, so the build and the Electron tier were run by hand with the runner's own
selection. `npm run build` passes, and in its output the composer is in the orchestration chunk only:
no `EffectComposer` in any other chunk, and no `DESK 01` or `tc.world.bloom` anywhere (the world view
is not in production). Electron tier: `pty`, `pty-manager`, `window`, `canvas`, `xterm`, `panels:core`,
`panels:kinds`, `panels:product`, `panels:orchestrate` and `panels:flowchart` pass. Three are red —
`verify:ipc` 1, `panels:shell` 95/95b/95c/96 and `panels:agents` `template.1` — the SAME checks M417
recorded as red on HEAD; this change touches only the dev-only world files and was not stashed and
re-run for them. `verify:world` is 138/138 (was 126), `verify:orchestration` 145/145, `verify:meta` green
inside wave 1.

## Owed

- **The whiteboard still reads paler than bloom-off**: the card's white is 240 (not 255 — as bright as
  the ground) and its minified words are less contrasty (darkest word pixel 209–217 against 186).
  The cause is filtering in the compressed domain (the GPU averages a stroke with the white around
  it before ACES lifts the average), so a darker ink does not help — tried 0.4× and 0.1×, both
  saturate near 209 and were removed. The real fix is to leave the board out of the composer's
  tone map (a second, un-mapped pass over a depth buffer), or to draw it as a lit surface.
- **The pixel budget is invisible at runtime**: the stats readout does not say the ratio was
  lowered for bloom. It is in this log and `world.bloom.budget.1` only.
- **No automatic bloom-off for a starved GPU.** The DPR governor still steps the ratio down under
  40 fps; it does not turn bloom off. `setBloomOn(false, false)` is the call such a rule would make
  (and does not persist, by design).
- FXAA is a hair softer than MSAA on thin dark lines (the stool legs read a touch lighter).
- Base-M1 fps, a packaged build and goldens (dev-only view, none) are unchanged from M417's Owed.
