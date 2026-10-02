# M415 — the World view's visual pass: glossy robots, name pills, hologram cards

Brings the 3D world view toward the reference captures in `docs/reference/cortxos-1…5.png`
(matched in look, no branding taken). Reads the same event store; no behaviour, contract or
schema change. Local commit, not pushed. Still dev-only, like M412–M414.

## What it is

| Piece | File | Notes |
|---|---|---|
| The robot | `WorldRobot.tsx` | Primitives, not the rigged Quaternius model: capsule legs/torso/arms and a big ellipsoid head in ONE shared geometry kit; a per-agent `MeshPhysicalMaterial` (clearcoat 1, clearcoatRoughness 0.15) in the agent's `colorOf` hue pushed to full saturation; a black glossy visor and two unlit pill eyes with a gradient halo (a quad, not a bloom pass). |
| The gloss | `WorldRobot.tsx` | `RoomEnvironment` prefiltered once per renderer (PMREM) and set on the robot materials only — never `scene.environment` (would relight the office), never a fetched HDR (CSP). |
| Motion | `WorldRobot.tsx`, `world-scene.ts` | Sines on plain groups: phase-shifted idle bob, a lean toward what it is busy with (`leanOf`), a hop with squash-and-stretch when a tool call starts (`hopsOn`), a wave (message), a shake (error / failed call), a head tilt (thought), a blink, a waddle when walking. No mixer, no skeleton. |
| The pill | `WorldCard.tsx`, `styles.css` | White, over the crown, a dot in the badge hue + the name; every robot has one (the far ones have nothing else). |
| The card | `WorldCard.tsx`, `world-scene.ts`, `styles.css` | Frosted white glass (backdrop blur, `--r-lg`, hairline) BESIDE the robot at a distance-scaled pixel offset; uppercase title (`cardTitle`), badge (`cardBadge`), the last four calls in mono (`recentTools`). Nearest six only (`cardTiers`, unchanged). |
| Checks | `verify-world.cjs` | `world.card.title/tools/badge.1`, `world.robot.hop/lean.1`, `world.card.glass.1`; `world.door.6` (gloss + shared kit) and `world.tone.2` (badge hue) rewritten; `door.4`/`assets.1` narrowed to the bee; `scene.card.1`, `tone.1` and `cardLine`/`statusTone` retired with the card they described. |

## Decisions

- **The badge's colours are the brief's, not the canvas's.** WORKING green, QUIET red, IDLE grey
  (plus the app's amber "needs you" and red for a stopped agent). On the 2D canvas green means
  IDLE and working is blue, so the two views now disagree on green — asked for by name; the
  M414 rule it replaces (`world.tone.2`) said the opposite. One-line revert if unwanted: point
  `.world-tag[data-badge=…]` back at `var(--tone)` with `data-tone`.
- **QUIET is the world's own reading**: a working/thinking agent with no event inside
  `QUIET_MS` (45s) and no call open (a long test run is not silence). Words otherwise come from
  `agentWord`.
- **The title is the agent's latest thought or message** — the contract has no task field. The
  card remembers it, so a run of tool calls that pushes it out of the 50-event ring does not
  drop the title back to the name.
- **White glass in BOTH themes.** Its ground is the room, not the chrome; the tokens are in
  both theme blocks with the same values (`verify:styles` theme.1).
- **The visor follows the head.** A bent RoundedBoxGeometry (the first cut) is a few large
  triangles whose chords sink inside the head at the middle — only its sides showed, as two
  black horns. It is now a dense plane pulled into a rounded rectangle and laid onto the
  ellipsoid (`conform`).
- `Character.glb` / `Character_Gun.glb` are still vendored (and ship in `out/renderer/models`
  in a dev build) but nothing loads them; the bee is the one model left. Deleting them is a
  separate call.

## Measured (real Electron dev window, M1 Pro, CDP, events injected through the store)

- Two robots close: 144 fps, ~75 calls, ~33k tris. Fourteen live robots with a tool call every
  250ms: 144 fps (the display's cap), 427 calls, 207k tris, 6 cards + 8 pill-only.
- QUIET appeared on the silent agent after 45s while the other stayed WORKING.
- Production JS has no world code (no `RoomEnvironment` in `out/renderer/assets/*.js`).

## Owed

- A fresh-context critic of the close-up against `cortxos-5.png`; no goldens (dev-only view).
- The room itself (floor, glowing edges) was out of scope; the reference's light platform
  look is the next pass if wanted.
- Base-M1 fps not measured (M1 Pro only).
