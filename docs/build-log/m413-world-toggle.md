# M413 — the World view toggle (prompt 3 of 4)

A "World view" toggle in the Canvas page's top bar that swaps the 2D canvas for the M412 3D
scene in the same page, with a ~1000ms easeInOutCubic move each way. Dev-only (compiled out of
production), local commit, not pushed.

## What it is

| Piece | File | Notes |
|---|---|---|
| The bit | `world/world-toggle.ts` | One boolean: the top bar's button, `#/world` and `TC_WORLD=1` all write it; Canvas and the stage read it. Not persisted. |
| The move | `world/world-transition.ts` | Pure. One clock (`createWorldTransition`), easeInOutCubic, host look, dolly, per-robot pop + stagger, card stand/tilt. `verify:world world.trans.*`. |
| The stage | `world/WorldStage.tsx` (was `WorldRoute.tsx`) | Mounts the scene in the canvas's grid cell only while showing/leaving; rAF loop writes the host's and the layer's opacity/scale; Esc leaves; `warmWorldView()` on toggle hover/focus. |
| The scene | `WorldView` (`TransitionRig`), `WorldRobot` (pop), `WorldCard` (tilt) | Dolly high/wide → default orbit with the controls off; robots scale from their feet, nearest first; cards lie back (rotateX 80°) and stand up after their robot lands. |
| Who is in the room | `world-scene.ts` `isLiveStatus`, `world-roster.ts` | working / thinking / waiting_approval only. |
| Canvas | `Canvas.tsx`, `TopBar.tsx`, `styles.css` | Host: class `canvas--behind-world` + inert + aria-hidden + shortcuts stood down (like Orchestrate). Palette open or leaving the Canvas page turns the world off. |

## Decisions worth knowing

- **"In place of the 2D canvas" is a layer over a canvas that stays mounted.** Unmounting `Canvas`
  would detach every xterm/PTY and lose camera + selection; the visual is the same, the state is
  untouched. (The old orchestration comment says a canvas "shrink" read as a camera pull-back there;
  the brief asked for it here, kept to 0.94.)
- **Dev-only.** M412 recorded that the `.glb` fetch under `file://` has never run in a packaged
  build; the toggle waits on that. Production build: no `WorldStage`, no `WebGLRenderer`, no
  `warmWorldView` in the first chunk (only the toggle's dead JSX, which never renders).
- **An errored agent leaves the room** (not a live status), so M412's bee and HitReact-on-error are
  seen only by someone watching when the error lands. Follows the brief's list literally.

## Measured (real Electron dev window, CDP, `SIMULATE_AGENTS=true`)

- Move: host opacity 1→0 and layer 0→1 on the easeInOutCubic curve, ~1000ms each way; reversal mid-move continues from the current value.
- 2D state across 3 cycles + a rapid on/off/on + Esc: camera transform, panel DOM node identity, xterm size, selection class all identical; the terminal's focus is blurred while covered and restored on return; no inline style left on the host.
- WebGL: one live context while on, zero after every toggle-off (a `getContext` tracker; `isContextLost()`), including after the interrupted sequence. 120 fps, ~133 calls, ~23k tris.
- Console: only R3F 9.8.1's `THREE.Clock` deprecation warning. No errors.

## Owed

- Goldens: none (dev-only, `verify:visual` never mounts it); no fresh-context critic has seen the move.
- Packaged build untested (see above). Real feeds still unwired (M412).
- Reduced motion snaps (`duration 0`) — verified in `world.trans.4`, not looked at.
- Desk re-flow when an agent flips live↔idle mid-session is unanimated for the departing robot (it disappears) — only arrival is eased.
