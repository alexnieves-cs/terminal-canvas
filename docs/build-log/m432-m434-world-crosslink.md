# M432–M434 — World ↔ Orchestrate, the instanced room, the minimap

| M | What |
|---|---|
| M432 | Cross-links. Orchestrate's FOCUSED island plate carries a "View in World" chip: back to the canvas page, the room on the next frame, and the room picks and glides to the first member standing in it once its open move is at rest (`world-select` `requestArrival`/`takeArrival`, taken in `WorldView`'s `TransitionRig`). The picked robot's card carries "View in Orchestrate": the panel becomes the canvas's selection and the page switch carries it (`WorldActions.orchestrate` / `canOrchestrate`, a panel on THIS canvas only). |
| M433 | Draw calls. Every desk body is one merged vertex-coloured geometry in ONE `InstancedMesh` (`DeskBodies`); each desk keeps its glide/sink and writes its slot after the glide. Stools are two instanced meshes. Robots have a level of detail (`robotLod`, `world-perf.ts`): far below `LOD_FAR_PX` px per unit, the six casters stop casting and the eye halo goes. |
| M434 | The minimap (`WorldMinimap.tsx`, pure rules in `world-minimap.ts`), bottom-left over the camera buttons from `MINIMAP_MIN_AGENTS`: slab, table, a dot per robot (amber ring waiting, accent ring picked), the camera's sight line. Press the floor → `CameraApi.centre`; press a dot → pick + `focus`. Polled at 250 ms through `CameraApi.plan()`, never per frame. |

## Item 10 (the packaging blocker) — already cleared

M427 measured it: `Bee.glb` loads under `file://` in the built renderer AND from inside `app.asar` in the
packaged app (`m421-m427-world-ahead.md`, "The error bee's `.glb` stayed"). Nothing to do.

## Measured in the real window (dev, `SIMULATE_AGENTS=true`, isolated `--user-data-dir`, CDP)

- 12 agents: desks render through the instanced mesh with their screens in place; scene meshes 147.
- A minimap dot press picks the robot and glides to it; the sight line follows.
- 32 agents at the widest zoom: 3 instanced meshes, **11 shadow casters in the whole scene** (6 a robot
  without the LOD). `LOD_FAR_PX` was raised 20 → 28 after the 12-agent room never reached 20 at max zoom-out.

## Not exercised live

- Both cross-links need real panels (the simulator's agents have none, so `canOrchestrate` is false and no
  island has members in the room). Pinned by `world.cross.1`–`.3` only.

## Checks

`verify:world` `world.cross.1`–`.3`, `world.lod.1`–`.3`, `world.map.1`–`.2`; `world.studio.3`, `world.open.4/.5`
re-pinned to the instanced/extra-member shapes.
