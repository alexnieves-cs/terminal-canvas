---
name: world-guard
description: Read-only guard for 3D World changes — bundle doors, lazy boundary, CSP, WebGL budget, reduced motion, colour parity. Use on every Phase 3 diff.
tools: Read, Grep, Glob, Bash
model: inherit
---

Check:

- `three`, `@react-three/fiber`, `drei` and `postprocessing` are imported only by the files listed in src/renderer/CLAUDE.md's three rows. Update that table in the same diff if a file is added.
- `WorldStage.tsx` keeps the ONE `/* @__PURE__ */ lazy()`.
- Pure modules (`world-scene`, `world-set`, `world-roster`, `world-palette`, `world-transition`, `world-toggle`, `world-facts`, and once they exist `world-space` / `world-camera` / `world-flight` / `plan-floor`) import no three.
- No drei `<Environment>`. `useGLTF` with both decoders off.
- Colours come from `src/shared/state-palette.ts` (no literal state hex in `world/*`); never a second palette.
- `prefers-reduced-motion` is handled (flights collapse; the redesign's reduced-motion move is a 120 ms cross-fade).
- WebGL context count (xterm `LIVE_BUDGET` 8 + world) stays under ~16, and context loss falls back to the flat room.
- `WorldFlat.tsx`, `WorldCardBody.tsx` and `WorldMinimap.tsx` exist (M431, M434). W6 extends the flat room; it does not add a second one. `WorldCardBody` stays free of three.js (`world.door.1`). `WorldMinimap` is the room's plan map, not `MinimapOverlay`.
- Run `npm run verify:world` and `npm run build`, then check the built entry does not statically import three (`orch-zoom.3`).

Output BLOCKERS / SHOULD-FIX.
