# M416 — the World view's room: a lit studio, a glowing slab, set dressing, overlay chrome

The room M415 left out of scope ("the reference's light platform look is the next pass"), after
`docs/reference/cortxos-1…4.png` (matched in look, no branding taken). Reads the same event
store; no contract, schema or IPC change. Local commit, not pushed. Still dev-only, like M412–M415.

## What it is

| Piece | File | Notes |
|---|---|---|
| The light | `WorldView.tsx` | Background `#eef0f3`, a hemisphere, ONE key directional that casts (2048² map, `shadow.radius` 3.5, intensity 0.6, camera sized to the platform and re-fitted when the room grows), a faint cool fill, `ACESFilmicToneMapping`. The canvas is no longer `flat`; `ContactShadows` is gone (a second scene pass the shadow map replaces). |
| The platform | `WorldPlatform.tsx`, `world-set.ts` | A drei `RoundedBox` slab (0.9 thick, 0.45 radius), light gray, sized to the roster (`slabHalf`), its top the floor (y = 0). A shadow-catcher plane under it so it sits on the ground. |
| The trim | `WorldPlatform.tsx` (`TrimLine`), `world-set.ts` | Two flat bands following one rounded-rectangle outline on the slab's FLAT top: a bright core (`cyanCore`, un-tone-mapped) over a halo whose vertex alpha is a gaussian, reaching further inward than outward. The same component draws the table's edge line. |
| The table | `WorldOffice.tsx` | A black clearcoat rounded plate (extruded from the same outline function) on a column; the robots' `RoomEnvironment` on THIS material only. |
| Set dressing | `WorldProps.tsx`, `world-set.ts` | Three `InstancedMesh` clusters of cubes (brown / teal / purple, seeded, drifting and turning), four stools (a cylinder seat and four legs), a whiteboard on a stand, and a `DESK 01` sprite over the first desk. |
| The whiteboard | `WorldProps.tsx`, `world-set.ts` | A canvas texture painted ONLY when its words change: a white document card with the latest request (or the board's invitation to make one). |
| The camera | `world-set.ts`, `WorldView.tsx` | A corner view (azimuth −0.62, polar 0.98, fov 34, distance 2.75 × the slab's half-width), polar clamped to [0.3, 1.36]. "Fit room" and ± are glides run by the SAME rig as the canvas↔world move. |
| The chrome | `WorldChrome.tsx`, `styles.css` | "Ask your team" pill bottom-centre, Fit room + zoom bottom-left, a legend bar along the bottom (a dot in each live agent's robot colour and its name, first eight and "+N more"). Plain DOM, no three. |
| The ask | `agent-world-store.ts` (`postTeamAsk`), `world-set.ts` | A `message` event from a pseudo-agent in the world's own store. |
| Checks | `verify-world.cjs` | `world.set.slab/props/trim/cubes/cam`, `world.ask.1–3`, `world.legend.1`, `world.chrome.1–2`, `world.studio.1–4`, `world.rig.1` (116 total); `world.door.1` is now seven importers and `door.6`/`door.8` follow the gloss and the new classes; `orch-zoom.3` lists the same files. |

## Where this departs from the brief, and why

- **"Wire the pill to the existing team-ask command if one exists."** One exists by that name and
  is not that: the app's team-ask is the multi-human approval QUEUE (`shared/team-asks.ts`, an
  agent asking people to allow a command), the other direction. So the pill takes the fallback —
  a `message` event in the event store. The event is from a pseudo-agent (`world:you`) with its
  own seq, never a live status, so it gets no robot and no legend entry; only the whiteboard
  reads it. **It dispatches to no running agent**, and the hint beside the field says
  "Posts to the board" for that reason. Wiring it to a real agent is a bridge call, which the
  scene may not make (`world.door.3`) and which would need the outward gate — see Owed.
  It is not written into a real agent's stream because the store drops a lower seq as a
  duplicate, so the real feed's next event would silently vanish.
- **"PCFSoft shadows."** three r186 removed `PCFSoftShadowMap`: asking for it (R3F's default for
  `shadows`/`"soft"`) logs a warning and falls back. `shadows="percentage"` is `PCFShadowMap`,
  which IS the soft one now (a rotated Vogel disk sized by `shadow.radius`).
- **"Subtle bloom."** Not a post-processing pass: the halo is geometry with a vertex alpha. A real
  bloom is a second full-frame pass and a second importer of `postprocessing`, which one door owns
  (`orch.bloom-door.1/.2`); and the glow it would draw is the same band. Say so if the real one is
  wanted — it is a swap of one component plus re-pinning the door.
- **The room no longer follows the app theme.** It was dark under the dark app; a high-key studio
  is the brief. `world-palette.ts` is now a fixed `STUDIO` (the cards' white glass already took
  this stance in M415).

## Traps (each found by running it or by a check)

- **Additive blending over a pale slab clips to white** — the glow disappears. The halo is normally
  blended, and neither band is tone-mapped (ACES greys an unlit cyan).
- **A RoundedBox top is flat only `radius` in from its edge.** A band laid in the lip hangs in the
  air beside the slab; and an inward offset of a rounded rectangle whose radius is smaller than the
  offset is a SHARP rectangle — the trim has its own, larger, corner radius.
- **Props belong in the corners only.** The first layout put two stools at the middle of the left
  edge; `world.set.props.1` found them standing in desks for rosters of nine and twenty-five (past
  `maxSpread` the ring wraps round the table instead of stopping). A corner point is always clear
  of the ring's reach.
- **The rig's hand-back at rest fights any glide**: with the controls off it snaps the camera to the
  rest pose, so a Fit-room glide that ran after it was undone on its first frame. The glide runs
  first, and a move to or from the canvas cancels it (`world.rig.1`).
- **Vite HMR of a pure module in the store's import graph re-instantiates the STORE.** An edit to
  `world-set.ts` (imported by the store since the ask) left the app feeding the old instance while
  the views read the new — "No live agents" and an injected roster that goes nowhere. Restart the
  dev app after editing `world-set.ts` / `world-scene.ts`; edits to the `.tsx` scene files are safe.
- **A component file that exports a non-component** (`studioEnv` from `WorldRobot.tsx`) makes
  Vite log "Fast Refresh export is incompatible" and re-evaluate the module on every edit. It
  lives in `world-gloss.ts` (the seventh three importer).
- **`names.words.1` forbids the word "Team"** in a user-visible string: the board's first title
  was "Team board". "Ask your team" (lowercase, the brief's own words) passes.
- A float `(reach·n)/n` is not `reach`: `glowProfile`'s last offset is the reach itself.
- With fov 34 a camera at 2.1 × the slab's half-width cannot see the slab; 2.75 shows the trim on
  several edges and still crops the corners, as the reference's wide shot does.

## Measured (real Electron dev window, M1 Pro, CDP; agents injected through the store)

- 3 agents: 144 fps (the display's cap), 120–146 calls, 38–51k tris.
- 9–11 agents, six full cards: 144 fps, 300–350 calls, 127–152k tris.
- 11 agents at an emulated retina 1800×1100 (the 1.75 clamp makes a 2877×1827 canvas, 5.3 MP):
  144 fps. At 3200×2000 (5327×3402, 18 MP, ~3.4× the pixels): 80–89 fps — the fill is what moves it.
- 900 px wide (the narrowest the world opens): the tools end at 206 px, the pill starts at 244.
- Console after a remount: only R3F's own `THREE.Clock` deprecation notice (pre-existing); no
  shadow-map warning. Production JS has no world code (no `RoomEnvironment`, `DESK 01`, or pill
  copy in `out/renderer/assets/*.js`).

## Owed

- A fresh-context critic of the wide shot against `cortxos-1.png` (no goldens: dev-only view).
- **Base-M1 fps is not measured** — only an M1 Pro, at 144 with headroom. The estimate (a base M1's
  GPU is roughly half) puts a typical retina window well above 60; it is an estimate.
- **The wide shot is dominated by cards** — the nearest six get a full card (`CARD_BUDGET`, M414),
  where the reference shows one. Unchanged here (`world.perf.7` pins six); a product call.
- The pill could dispatch to a real agent (the conductor, or each live one) through a callback from
  `Canvas.tsx`, behind the `outward` gate. Not done: it would be the first write the world makes.
- Robot hues come from `colorOf(agentId)`, so a roster of ids that hash alike (the demo's) is
  two or three hues; real ids vary.
- `docs/design-reference.png` was deleted in the tree by someone else (`critic.reference.1` red) —
  not touched. Packaged build (`.glb` under `file://`) still unmeasured, so the toggle stays dev-only.
