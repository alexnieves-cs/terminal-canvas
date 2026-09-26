# src/renderer — the library layer (M276–M277, Rounds 1–8)

(Moved from the root CLAUDE.md; loads when working under this directory. The `zod` row's door is in `src/shared/`.)


Every third-party library here is **confined to a named module set and reached through it**,
never imported ambiently. That is the rule; the modules are where to look:

| Library | Its one door | Why the confinement is load-bearing |
|---|---|---|
| `yjs` + `y-monaco` | `shared-text/replica.ts` + `shared-text/binding.ts`, lazily `import()`ed by `CodeEditor` | Shared text only: y-monaco needs the Y.Text in the editor's process, so this is a REPLICA whose every update main re-judges (`main/presence/canvas-sync.ts`). Carets ride awareness, never the doc. Everything else stays yjs-free and speaks `canvas-ops.ts` (`verify:canvas-sync cs.door.1`, `text.door.1/.2`). |
| `monaco-editor` | `file/monaco.ts`, lazily `import()`ed by `CodeEditor` | A static import from anything `Canvas.tsx` reaches puts ~6MB in the first chunk, silently. `file/editor-registry.ts` exists precisely so the harness door can be installed without it. |
| `zod` | `shared/workflow-graph-schema.ts` | Adopted at the boundaries that had NO reader — **not** a retrofit of `parseTemplates`, which stays the layout file's hand-written reader. |
| `sonner` | `shell/toast.ts` + `shell/CanvasToaster.tsx` | `toast.door.1` pins the importer set so it cannot be walked around. A toast is for what is FINISHED; the attention system stays the source of truth for what is still outstanding. |
| `recharts` | `shell/MachineChart.tsx`, `shell/UsageChart.tsx` | Colours come from `shell/chart-tokens.ts`, read off the live theme — `var()` does not resolve in SVG presentation attributes, so the natural spelling paints an invisible series with no error. |
| `@radix-ui/*` | `renderer/primitives/` | Adopters take the primitive, never the Radix package. |
| `@xyflow/react` + `zustand` | `renderer/workflow/` | The store is the flow editor's own; it is not an app-wide state layer and should not become one. |
| `three` + `@react-three/fiber` | `orchestration/OrchestrationCubes.tsx` and (M304) `orchestration/OrchestrationLive.tsx`, each lazily `import()`ed by `OrchestrationView` | The diorama and the Watch lens only. Measured at **+2.2MB in the FIRST chunk** when that import was static — the same trap as Monaco's row, and nothing pins it. |
| `motion` | `primitives/MotionSurface.tsx`, `workflow/` | Motion still answers to the token rules in `styles.css` (`verify:styles`). |
| `postprocessing` | `orchestration/orchestration-bloom.tsx`, reached only from the lazily-`import()`ed `OrchestrationCubes` | The diorama's bloom. Rides three.js's deferred chunk, so the first chunk pays nothing — a second importer undoes that silently, which is why `verify:orchestration orch.bloom-door.1/.2` pin the importer set AND the `lazy()`. The raw library, NOT `@react-three/postprocessing`, whose peer range would have forced a `@react-three/fiber` bump under a working scene. |

Renderer libraries are vite-bundled, so nothing here ships `node_modules` and the
