# M431 — the flat room, and the room's richness pass

Built in session f6b9900a (2026-10-05); committed from main's working tree by a later session at the user's word.

| M | What |
|---|---|
| M431 | A machine with no WebGL, or one whose context is lost for good, gets the FLAT room (`WorldFlat.tsx`) under the note instead of the note alone: a grid of agent tiles with the 3D card's words (headline, badge, facts, recent tools) and the same doors — Approve / Deny / Open, double-click and Enter on a picked tile to open — and the room's own chrome (replay, teammates, requests, the Ask pill, the legend; no Fit or zoom). Its own lazy chunk, no three.js (~41 KB fetched on a no-WebGL machine). The request block and the lead moved from `WorldCard` into the plain-DOM `WorldCardBody.tsx`, shared by both rooms. |
| (same) | The richness pass on the 3D room: a sheen rim on the robot shells, a slow trim pulse that follows how many agents are busy (still under reduced motion), soft contact blobs under each robot, a tiled floor drawn in code, and a desk accessory per agent (plant, mug, lamp, papers) chosen by the seat order. |

## Checks

`verify:world` `world.flat.1`–`.4`, `world.rich.1`–`.7` (241/241 at commit); `verify:styles`, `verify:meta`, `tsc`, build green.
A code review found three defects, fixed before commit: Enter on a picked tile un-picked it; a picked waiting tile lost its
amber ring; the import-closure check could be fooled by a multi-line or dynamic import.

## Not done

- The last visual fixes (dark-mode note strip, scroll affordance, Deny/Open as buttons, tighter contact blobs) were not
  re-screenshotted. No Electron tier; the World view has no goldens.
- Approve / Deny on a tile not exercised with a real agent.
- Left alone: a thinking agent's pill says "Thinking" while its badge groups it as WORKING (deliberate); the room sits
  off-centre after Fit room (likely older; not compared against HEAD).
- `#4` of that brief ("Ask your team" as a real send) had already shipped in M422; only `postTeamAsk`'s stale comment changed.
