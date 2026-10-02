# src/renderer — the library layer (M276–M277, Rounds 1–8)

(Moved from the root CLAUDE.md; loads when working under this directory. The `zod` row's door is in `src/shared/`.)


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
| `three` + `@react-three/fiber` + `@react-three/drei` (M412) | `world/WorldView.tsx`, `WorldOffice.tsx`, `WorldRobot.tsx`, `WorldCard.tsx` — `three`/fiber from the first three (and `WorldCard`'s `useFrame`), drei from `WorldView`, `WorldOffice`, `WorldCard` and `WorldRobot` (the error bee's `useGLTF`); `three/examples/jsm/` — `SkeletonUtils`, `BufferGeometryUtils`, `RoomEnvironment` — from `WorldRobot`, whose robots are primitives since M415 (a shared geometry kit; the clearcoat's reflections are a `RoomEnvironment` built in code, never a fetched HDR) | The 3D world view, reached through the top bar's "World view" toggle (M413; `#/world` writes the same bit) and ONE `/* @__PURE__ */ lazy()` in `world/WorldStage.tsx`, which `Canvas.tsx` mounts only under `import.meta.env.DEV` (the toggle is dev-only until a packaged build's `.glb` fetch under `file://` has been measured). The stage mounts the scene only while it is showing, over a 2D canvas that stays mounted. Named imports from drei's barrel, never `<Environment>` (a CDN fetch the CSP refuses), and `useGLTF` always with both decoders off. `verify:world world.door.1`–`.12` pin the importer set (and that the pure modules — `world-scene`, `world-roster`, `world-palette`, `world-transition`, `world-toggle`, the store — import none of it), the lazy, the mount discipline, the decoders, the card layer and the bee's clip name in its vendored model. `orch-zoom.3` lists the same files for `three`/fiber. |
| `motion` | `primitives/MotionSurface.tsx`, `workflow/` | Motion still answers to the token rules in `styles.css` (`verify:styles`). |
| `postprocessing` | `orchestration/orchestration-bloom.tsx`, reached only from the lazily-`import()`ed `OrchestrationCubes` | The diorama's bloom. Rides three.js's deferred chunk, so the first chunk pays nothing — a second importer undoes that silently, which is why `verify:orchestration orch.bloom-door.1/.2` pin the importer set AND the `lazy()`. The raw library, NOT `@react-three/postprocessing`, whose peer range would have forced a `@react-three/fiber` bump under a working scene. |

**Installed with no door yet (2026-09-30), now only half true (M412).** `@react-three/drei` has
its door (the row above); `@react-three/postprocessing` is still in `dependencies` with
**nothing importing it**, so it has no row and is reachable from no chunk. Whoever writes its
first adopter adds the row in the same change — an ambient import is the drift this table exists to
stop. drei re-exports enough that a careless `import { ... } from '@react-three/drei'` can pull far more
than the helper asked for: take named helpers (`Html`, `Grid`, `OrbitControls`, `ContactShadows`)
and measure the chunk.

Taking `@react-three/postprocessing` is what the `postprocessing` row warned about: its peer
range forced `@react-three/fiber` **9.4.0 → 9.8.1** under the working diorama. `npm run build`
and `verify:orchestration` (145/145) are green on the bump, but neither of those LOOKS at the
scene — the bloom and the Watch lens are judged by `verify:visual`, which is hand-run and has
not been run against it. Do that before trusting the diorama's pixels.

Renderer libraries are vite-bundled, so nothing here ships `node_modules` and the
