# src/renderer — the library layer (M276–M277, Rounds 1–8)

(The `zod` row's door is in `src/shared/`.)


Every third-party library here is **confined to a named module set and reached through it**,
never imported ambiently. That is the rule; the modules are where to look:

| Library | Its one door | Why the confinement is load-bearing |
|---|---|---|
| `yjs` + `y-monaco` | `shared-text/replica.ts` + `shared-text/binding.ts` (+ M339's `value.ts`, yjs only), lazily `import()`ed by `CodeEditor` (Source) and `shared-text/useSharedValue.ts` (Rich) | Shared text only: y-monaco needs the Y.Text in the editor's process, so this is a REPLICA whose every update main re-judges (`main/presence/canvas-sync.ts`). Carets ride awareness, never the doc. Everything else stays yjs-free and speaks `canvas-ops.ts` (`verify:canvas-sync cs.door.1`, `text.door.1/.2`). |
| `monaco-editor` | `file/monaco.ts`, lazily `import()`ed by `CodeEditor` | A static import from anything `Canvas.tsx` reaches puts ~6MB in the first chunk, silently. `file/editor-registry.ts` exists precisely so the harness door can be installed without it. |
| `zod` | `shared/workflow-graph-schema.ts` | Adopted at the boundaries that had NO reader — **not** a retrofit of `parseTemplates`, which stays the layout file's hand-written reader. |
| `sonner` | `shell/toast.ts` + `shell/CanvasToaster.tsx` | `toast.door.1` pins the importer set so it cannot be walked around. A toast is for what is FINISHED; the attention system stays the source of truth for what is still outstanding. |
| `recharts` | `shell/MachineChart.tsx`, `shell/UsageChart.tsx` | Colours come from `shell/chart-tokens.ts`, read off the live theme — `var()` does not resolve in SVG presentation attributes, so the natural spelling paints an invisible series with no error. |
| `@radix-ui/*` | `renderer/primitives/` | Adopters take the primitive, never the Radix package. |
| `@xyflow/react` + `zustand` | `renderer/workflow/` | The store is the flow editor's own; it is not an app-wide state layer and should not become one. |
| `three` + `@react-three/fiber` | `orchestration/OrchestrationCubes.tsx` and (M304) `orchestration/OrchestrationLive.tsx`, each lazily `import()`ed by `OrchestrationView` | The diorama and the Watch lens only. Measured at **+2.2MB in the FIRST chunk** when that import was static — the same trap as Monaco's row, and nothing pins it. |
| `three` + `@react-three/fiber` + `@react-three/drei` (M412) | `world/WorldView.tsx`, `WorldOffice.tsx`, `WorldRobot.tsx`, `WorldCard.tsx` and (M416) `WorldPlatform.tsx`, `WorldProps.tsx`, `world-gloss.ts` and (M420) `WorldBloom.tsx` and (M423) `WorldStructure.tsx` (terraces, file tiles, handoff arcs) — `three`/fiber from the scene files (and the `useFrame` in `WorldCard` and `WorldProps`), drei from `WorldView`, `WorldOffice`, `WorldCard`, `WorldRobot` (the error bee's `useGLTF`) and `WorldPlatform` / `WorldProps` (`RoundedBox`); `three/examples/jsm/` — `SkeletonUtils`, `BufferGeometryUtils` — from `WorldRobot`, whose robots are primitives since M415 (a shared geometry kit), and `RoomEnvironment` from `world-gloss.ts` (the clearcoat's reflections, built in code, never a fetched HDR, shared by the robots and the black table). `WorldChrome.tsx` (M416: the "Ask your team" pill, Fit room / zoom, the legend) and its children `WorldTime.tsx` (M425 replay) and `WorldPeers.tsx` (M426 teammates) are plain DOM and import none of it; so are (M431) `WorldCardBody.tsx` (the card's lead and request block) and `WorldFlat.tsx`, the flat room a machine with no WebGL gets — its own `lazy()` in the stage, whose import closure `world.flat.1` pins free of every scene file; and (M434) `WorldMinimap.tsx`, the room from above, which reaches the scene only through the `CameraApi` (`world.map.2`); `useWorldContextPublisher.ts` (M421) is the one world file that reaches into the canvas's own modules, called only from Canvas. The trim's glow is geometry with a vertex alpha AND (M420) a real bloom: `WorldBloom.tsx` is the composer, the second importer of `postprocessing` (row below), and `world-bloom.ts` is its pure half — settings, the on/off bit, the ACES port — which imports none of it | The 3D world view, reached through the top bar's "World view" toggle (M413; `#/world` writes the same bit) and ONE `/* @__PURE__ */ lazy()` in `world/WorldStage.tsx`, which `Canvas.tsx` mounts in production since M427 (the built renderer was measured loading the room and the bee's `.glb` under `file://`; three stays out of the first chunk — `orch-zoom.3` reads the built entry's static imports). The stage mounts the scene only while it is showing, over a 2D canvas that stays mounted. Named imports from drei's barrel, never `<Environment>` (a CDN fetch the CSP refuses), and `useGLTF` always with both decoders off. `verify:world world.door.1`–`.12` and `world.bloom.*` pin the importer set (and that the pure modules — `world-scene`, `world-set`, `world-roster`, `world-palette`, `world-transition`, `world-toggle`, (M428) `world-facts`, the store — import none of it), the lazy, the mount discipline, the decoders, the card layer and the bee's clip name in its vendored model. `orch-zoom.3` lists the same files for `three`/fiber. |
| `motion` | `primitives/MotionSurface.tsx`, `workflow/` | Motion still answers to the token rules in `styles.css` (`verify:styles`). |
| `postprocessing` | `orchestration/orchestration-bloom.tsx` (reached only from the lazily-`import()`ed `OrchestrationCubes`) and, since M420, `world/WorldBloom.tsx` (reached only from `WorldView`, itself behind `WorldStage`'s `lazy()`) | The two blooms. Both ride three.js's deferred chunk, so the first chunk pays nothing — a THIRD importer undoes that silently, which is why `verify:orchestration orch.bloom-door.1/.2` and `verify:world world.bloom.door.1/.2` pin the importer set AND the `lazy()`s. The raw library, NOT `@react-three/postprocessing`, whose peer range forced a `@react-three/fiber` bump (9.4.0 → 9.8.1) under a working scene when it was installed. The two composers do NOT share an order or a tone map on purpose: the diorama ends on NEUTRAL with the bloom first; the world ends on the studio's ACES with the tone map first (`WorldBloom.tsx` header, (2)–(3)). |

**`@react-three/postprocessing` has no door.** It is in `dependencies` with nothing importing
it (both blooms use the raw `postprocessing` library, and `world.bloom.door.1` pins that nobody
imports the wrapper), so it has no row and is reachable from no chunk. Whoever writes its first
adopter adds the row in the same change — an ambient import is the drift this table exists to
stop. drei re-exports enough that a careless `import { ... } from '@react-three/drei'` can pull
far more than the helper asked for: take named helpers (`Html`, `Grid`, `OrbitControls`,
`ContactShadows`) and measure the chunk.

Installing the wrapper moved `@react-three/fiber` from 9.4.0 to 9.8.1 (its peer range) under the
working diorama. `npm run build` and `verify:orchestration` do not look at the scene; the bloom
and the Watch lens are judged by the hand-run `verify:visual`, so run it before trusting the
diorama's pixels after a fiber bump.

Renderer libraries are vite-bundled, so nothing here ships `node_modules` and the
`dependencies`/`devDependencies` split currently carries no rule — don't read one into it.
