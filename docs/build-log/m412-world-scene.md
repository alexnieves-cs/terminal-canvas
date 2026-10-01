# M412 — the 3D world view scene (prompt 2 of 4)

A `WorldView` over the M411 event store: one robot per agent at its own desk on a loose arc, a
meeting table, a floating status card per robot, orbit controls that cannot go under the floor.
Dev-only, at `#/world` (`TC_WORLD=1 npm run dev` opens straight onto it). Nothing else in the
app changed behaviour.

## What it is

| Piece | File | Notes |
|---|---|---|
| Decisions | `renderer/world/world-scene.ts` | Pure. Desk arc + table seats from the roster, conductor by name, goal (`home`/`table`), effect per event, typing from open tool calls, card line, tint. `verify:world` runs all of it in plain node. |
| Roster | `world-roster.ts` | One string snapshot (ids + names) so the scene re-renders on a new/renamed agent, not on every event. |
| Scene | `WorldView.tsx` `WorldOffice.tsx` `WorldRobot.tsx` `WorldCard.tsx` | The lazily-loaded set; the only importers of three/fiber/drei. |
| Route | `WorldRoute.tsx` | Hash route, overlay over the canvas (never replaces it), `/* @__PURE__ */ lazy()`, mounted by `App.tsx` under `import.meta.env.DEV`. |

Behaviour, all read from `getAgent` in the frame loop (an event costs a ref read, not a render):

- **Clips** from the real models: `Idle`/`Idle_Gun`, `Walk`/`Walk_Gun` while travelling (re-flow of the arc, or to the table), crossfaded; one-shots `Wave` (message) and `HitReact` (error, failed tool).
- **States** layered on bones after the mixer: forearm work + bob while a tool call is open and the agent is `working`; a slow sway while `thinking`.
- **Pulse:** head tilt once per thought.
- **Walk to the table** only on `waiting_approval` (the one status that is a request); the conductor (an agent whose id or name carries "conductor"/"orchestrator") lives at the head of the table and owns no desk.
- **Flavour:** `Bee.glb` circles a robot in `error`. The other enemy files are unused.
- **Desk screens** glow by status; **robot colour** is `colorOf(agentId)`, the same hash the 2D canvas paints an owner with.

## Measured (M1 Pro, 120 Hz display, real Electron dev window, 4 simulated agents + conductor + 1 test agent)

- 120 fps steady (the display's ceiling), ~200 draw calls, ~45k triangles, no shadow maps (`ContactShadows` only), `dpr` capped at 1.75.
- Orbit: dragged to the horizon stop — the camera sits just above the floor, never under; zoom clamped; right-drag pan clamped to the room (the camera moves with the target).
- Re-flow: adding agents slides desks and walks robots; first sight never walks (no stroll from the origin).

## What went wrong on the way (each is a load-bearing entry now)

1. **drei `Html` + React 19** blanked the first card (re-target when R3F connects events). Fixed with a `portal` card layer.
2. **Additive bone overlay compounded** on constant tracks (the mixer writes only changed values) — robots tumbled. Fixed by undo-before/recapture-after; bones found by `isBone` (a mesh is also called `Head`).
3. **drei's Meshopt default** instantiates WASM the CSP refuses, from a module-scope `preload`. Both decoders are off everywhere.
4. **`gl.info`** read only the last render of a frame ("1 call, 0k tris").
5. The dev window refuses *every* navigation, including Vite's reload after dep re-optimization — the first launch that discovers drei is left with two Reacts until a restart. Pre-existing guard; not changed.

## Pins

`verify:world` grew 16 → 37: `world.scene.*` (the rules, plus `sim-fit.1` — the scripted session must set off every behaviour), `world.door.1`–`.8`, `world.assets.1` (clip/bone/material names in the vendored `.glb`s). Each door pin was mutation-tested (break the trap, watch it go red). `orch-zoom.3`'s importer list gained the world files. `affected.glb.1`: a changed `.glb` is no longer a directory-walk hit for ~25 suites; it selects exactly `verify:world`.

## Gate (run by hand; `npm run affected` stops at the first red plain suite, so the Electron tier was run suite by suite after `npm run build`)

Green: the whole plain tier it selected except the two below, `window`, `canvas`, `xterm`, `panels:core`, `:kinds`, `:product`, `:orchestrate`, `:flowchart`. `npm run build` is clean and the production renderer contains no world code and no `WebGLRenderer` outside its own chunks (the route is compiled out).

Red, and not this milestone's — each checked against a clean `HEAD` (`git stash -u`, rebuild, re-run):

- `verify:first-run revamp.create.1` — red at `HEAD` (already in the M411 note).
- `verify:panels:agents template.1` — red at `HEAD` (88/89 there too).
- `verify:panels:shell` `95`, `95b`, `95c`, `96` (rail workspace rows) — the same four the M397–M410 ledger records as identical to `HEAD`.

Two reds WERE this milestone's and are fixed: `verify:styles shadow.1` (a resting `box-shadow` on the card) and `verify:rail state.2` (the card spelled its own state words — it now reads them from `panel-state.ts`'s `agentWord`).

## Owed / decided not to do

- **No golden.** The route is dev-only and `verify:visual` never mounts it; the world was judged by screenshots of the real window (a fresh-context critic has not seen it).
- **Packaged builds are untested** — the route is compiled out of production, so `fetch` of `.glb` under `file://` was not exercised. Whoever ships the toggle (prompt 3/4) must measure it first (or read the bytes over IPC).
- **Real feeds are not wired.** The card paints the feed's own text; the producer is where secrets get scrubbed, and no real source has been connected.
- **The sim has no conductor** (`world.sim.1` pins 3–4 agents), so the head of the table is exercised only by injecting one into the store from DevTools.
- `@react-three/postprocessing` still has no door (no bloom here); `verify:visual` still has not been run against the fiber 9.8.1 bump (M411).
