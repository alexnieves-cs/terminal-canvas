# Graph Report - terminal-canvas  (2026-08-27)

## Corpus Check
- 102 files · ~271,556 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1121 nodes · 1498 edges · 75 communities (58 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6fe7642b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Ideas backlog|Ideas backlog]]
- [[_COMMUNITY_layout-schema.ts|layout-schema.ts]]
- [[_COMMUNITY_Palette.tsx|Palette.tsx]]
- [[_COMMUNITY_session-registry.ts|session-registry.ts]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_ipc-contract.ts|ipc-contract.ts]]
- [[_COMMUNITY_session-backend.ts|session-backend.ts]]
- [[_COMMUNITY_M4b Layout Persistence — Design|M4b: Layout Persistence — Design]]
- [[_COMMUNITY_scripts|scripts]]
- [[_COMMUNITY_M3 — Real terminals on the canvas|M3 — Real terminals on the canvas]]
- [[_COMMUNITY_Task 4 report the three settings|Task 4 report: the three settings]]
- [[_COMMUNITY_ipc.ts|ipc.ts]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_M2 — Infinite canvas|M2 — Infinite canvas]]
- [[_COMMUNITY_Architecture|Architecture]]
- [[_COMMUNITY_pty-manager.ts|pty-manager.ts]]
- [[_COMMUNITY_PtyManager|PtyManager]]
- [[_COMMUNITY_Architecture|Architecture]]
- [[_COMMUNITY_File Structure|File Structure]]
- [[_COMMUNITY_File structure|File structure]]
- [[_COMMUNITY_File structure|File structure]]
- [[_COMMUNITY_M4c tmux-Backed Sessions — Design|M4c: tmux-Backed Sessions — Design]]
- [[_COMMUNITY_M5c Packaging — Design|M5c: Packaging — Design]]
- [[_COMMUNITY_panel-interaction.ts|panel-interaction.ts]]
- [[_COMMUNITY_M4a Panel Manipulation — Design|M4a: Panel Manipulation — Design]]
- [[_COMMUNITY_File Structure|File Structure]]
- [[_COMMUNITY_M6 Panel Legibility — Design|M6: Panel Legibility — Design]]
- [[_COMMUNITY_Design|Design]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_viewport.ts|viewport.ts]]
- [[_COMMUNITY_TerminalPanel.tsx|TerminalPanel.tsx]]
- [[_COMMUNITY_File structure|File structure]]
- [[_COMMUNITY_Global Constraints|Global Constraints]]
- [[_COMMUNITY_panels.ts|panels.ts]]
- [[_COMMUNITY_Task 10 — End-to-end checks in a real renderer|Task 10 — End-to-end checks in a real renderer]]
- [[_COMMUNITY_Global Constraints|Global Constraints]]
- [[_COMMUNITY_Global Constraints|Global Constraints]]
- [[_COMMUNITY_Canvas.tsx|Canvas.tsx]]
- [[_COMMUNITY_Task 3 report the state machine|Task 3 report: the state machine]]
- [[_COMMUNITY_Task 9 report the glow, on the panel and on the card|Task 9 report: the glow, on the panel and on the card]]
- [[_COMMUNITY_Global Constraints|Global Constraints]]
- [[_COMMUNITY_Global Constraints|Global Constraints]]
- [[_COMMUNITY_File structure|File structure]]
- [[_COMMUNITY_Terminal Canvas|Terminal Canvas]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_PaletteHandlers|PaletteHandlers]]
- [[_COMMUNITY_session-factory.ts|session-factory.ts]]
- [[_COMMUNITY_Task 2 report The BEL scanner|Task 2 report: The BEL scanner]]
- [[_COMMUNITY_CLAUDE|CLAUDE.md]]
- [[_COMMUNITY_Global Constraints|Global Constraints]]
- [[_COMMUNITY_Task 5 report — the IPC surface|Task 5 report — the IPC surface]]
- [[_COMMUNITY_Task 7 report — the detector at the choke point|Task 7 report — the detector at the choke point]]
- [[_COMMUNITY_xterm-pointer.ts|xterm-pointer.ts]]
- [[_COMMUNITY_history.ts|history.ts]]
- [[_COMMUNITY_Task 6 report a number setting reaches the palette|Task 6 report: a number setting reaches the palette]]
- [[_COMMUNITY_Task 8 report — the renderer store|Task 8 report — the renderer store]]
- [[_COMMUNITY_lod.ts|lod.ts]]
- [[_COMMUNITY_Pre-flight conflict scan|Pre-flight conflict scan]]
- [[_COMMUNITY_PtyCreateResult|PtyCreateResult]]
- [[_COMMUNITY_task-11-brief|task-11-brief.md]]
- [[_COMMUNITY_tsconfig.json|tsconfig.json]]
- [[_COMMUNITY_task-10-brief|task-10-brief.md]]
- [[_COMMUNITY_task-1-brief|task-1-brief.md]]
- [[_COMMUNITY_task-1-report|task-1-report.md]]
- [[_COMMUNITY_task-2-brief|task-2-brief.md]]
- [[_COMMUNITY_task-3-brief|task-3-brief.md]]
- [[_COMMUNITY_task-4-brief|task-4-brief.md]]
- [[_COMMUNITY_task-5-brief|task-5-brief.md]]
- [[_COMMUNITY_task-6-brief|task-6-brief.md]]
- [[_COMMUNITY_task-7-brief|task-7-brief.md]]
- [[_COMMUNITY_task-8-brief|task-8-brief.md]]
- [[_COMMUNITY_task-9-brief|task-9-brief.md]]

## God Nodes (most connected - your core abstractions)
1. `Ideas backlog` - 82 edges
2. `scripts` - 25 edges
3. `LayoutStore` - 21 edges
4. `PtyManager` - 18 edges
5. `compilerOptions` - 18 edges
6. `compilerOptions` - 17 edges
7. `PaletteActions` - 16 edges
8. `Registry` - 16 edges
9. `SessionHandle` - 15 edges
10. `PanelId` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Canvas()` --calls--> `usePalette()`  [INFERRED]
  src/renderer/canvas/Canvas.tsx → src/renderer/palette/usePalette.ts
- `Canvas()` --calls--> `useRegistryVersion()`  [INFERRED]
  src/renderer/canvas/Canvas.tsx → src/renderer/session/useRegistry.ts
- `which()` --calls--> `whichFromEnv()`  [EXTRACTED]
  src/main/index.ts → src/main/shell-env.ts
- `Session` --references--> `PanelId`  [EXTRACTED]
  src/main/pty-manager.ts → src/shared/types.ts
- `TierInput` --references--> `Viewport`  [EXTRACTED]
  src/renderer/canvas/lod.ts → src/renderer/canvas/viewport.ts

## Import Cycles
- None detected.

## Communities (75 total, 17 thin omitted)

### Community 0 - "Ideas backlog"
Cohesion: 0.02
Nodes (82): 10. Light mode / dark mode, 11. A real settings surface — and a search bar in it, 12. Jira connection — tickets as first-class canvas context, 13. Drag and drop images into a session (terminal or chat), 14. Panels that *are* other apps — a live document beside a live agent, 15. An annotation layer — ink, highlights, sticky notes on the canvas, 16. Search across every panel, 17. Attention routing for agents you cannot see (+74 more)

### Community 1 - "layout-schema.ts"
Cohesion: 0.06
Nodes (36): Cancel, createLayoutStore(), LayoutStore, LayoutStoreDeps, App(), installDropGuard(), container, SettingRow (+28 more)

### Community 2 - "Palette.tsx"
Cohesion: 0.06
Nodes (24): buildCommands(), PaletteActions, PaletteContext, PanelRow, PresetRow, PromptRow, withReason(), fuzzyMatch (+16 more)

### Community 3 - "session-registry.ts"
Cohesion: 0.05
Nodes (11): PanelSession, PanelSpecTemplate, PanelStatus, SessionFactory, SessionHandle, Bridge, createRegistry(), onData() (+3 more)

### Community 4 - "index.ts"
Cohesion: 0.09
Nodes (32): afterPresetChange(), backend, confirmReset(), createWindow(), layoutStore, loginEnv, onSpawnPreset(), ptyManager (+24 more)

### Community 6 - "session-backend.ts"
Cohesion: 0.16
Nodes (23): createDirectBackend(), createTmuxBackend(), whichFromEnv(), buildHasSessionArgs(), buildKillServerArgs(), buildKillSessionArgs(), buildListArgs(), buildStartServerArgs() (+15 more)

### Community 7 - "M4b: Layout Persistence — Design"
Cohesion: 0.08
Nodes (24): Architecture, Boot ordering, Dormancy outranks focus, Failure modes, Files, First run, Goal, Id stability is M4b's debt to M4c (+16 more)

### Community 8 - "scripts"
Cohesion: 0.08
Nodes (25): scripts, build, dev, package, postinstall, start, typecheck, typecheck:node (+17 more)

### Community 9 - "M3 — Real terminals on the canvas"
Cohesion: 0.09
Nodes (21): Architecture, `create-terminal.ts`, Data flow, Error handling, Focus and input, Forward notes for M4, Goal, Integration — real Electron, against the built renderer (+13 more)

### Community 10 - "Task 4 report: the three settings"
Cohesion: 0.09
Nodes (21): Absent-vs-malformed rule confirmed unaffected, Check added, Commands run and output, Files touched, Files touched (this round), Finding, Fix, Fix round 1/5 (+13 more)

### Community 11 - "ipc.ts"
Cohesion: 0.18
Nodes (15): registerIpcHandlers(), bridge, Window, CanvasBridge, CapturedPanel, IPC, IPC_EVENTS, PresetTemplate (+7 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, baseUrl, composite, esModuleInterop, isolatedModules, lib, module, moduleResolution (+12 more)

### Community 13 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, baseUrl, composite, esModuleInterop, isolatedModules, jsx, lib, module (+12 more)

### Community 14 - "M2 — Infinite canvas"
Cohesion: 0.10
Nodes (19): Architecture, `canvas-input.ts`, Chosen approach: one CSS-transformed world layer, Components, Data flow, Deferred: approach C, crisp at rest, DOM structure, Error handling (+11 more)

### Community 15 - "Architecture"
Cohesion: 0.10
Nodes (19): Architecture, Failure modes, Files, Fuzzy matching, Goal, IPC summary, Layering, M5b: Command Palette — Design (+11 more)

### Community 16 - "pty-manager.ts"
Cohesion: 0.18
Nodes (14): AgentEvent, Detector, initialDetector(), nextState(), scanForBell(), ScanState, resolveCommand(), resolveCwd() (+6 more)

### Community 17 - "PtyManager"
Cohesion: 0.19
Nodes (3): PtyManager, SessionBackend, PanelId

### Community 18 - "Architecture"
Cohesion: 0.11
Nodes (17): Architecture, Availability, Built-ins are code, not data, Failure modes, Files, Goal, M5a: Panel Presets — Design, One targeted improvement (+9 more)

### Community 19 - "File Structure"
Cohesion: 0.12
Nodes (16): File Structure, Global Constraints, M4b: Layout Persistence — Implementation Plan, Preconditions, Self-Review, Task 10: The Restore submenu and Reset canvas, Task 11: Documentation, Task 1: The shared schema and the `verify:layout` harness (+8 more)

### Community 20 - "File structure"
Cohesion: 0.12
Nodes (16): File structure, Global Constraints, M5b: Command Palette Implementation Plan, Self-review, Task 10: The prompt channels, Task 11: Prompts in the palette — insert, save, delete, Task 12: Record what the palette changed, Task 1: `fuzzy.ts`, `palette-model.ts`, and the `verify:palette` suite (+8 more)

### Community 21 - "File structure"
Cohesion: 0.12
Nodes (16): File structure, Global Constraints, M6c — Agent State Implementation Plan, Task 10: End-to-end checks in a real renderer, Task 11: Documentation, Task 1: Measure the idleness threshold, Task 2: The BEL scanner, Task 3: The state machine (+8 more)

### Community 22 - "M4c: tmux-Backed Sessions — Design"
Cohesion: 0.12
Nodes (16): Architecture, Boot reconciliation, Exit-code fidelity, Failure modes, Files, Goal, M4c: tmux-Backed Sessions — Design, Scope (+8 more)

### Community 23 - "M5c: Packaging — Design"
Cohesion: 0.12
Nodes (16): App identity, and the state that follows from it, Architecture, Files, Goal, M5c: Packaging — Design, Native module survival, Scope, Socket isolation, and why it is not a config value (+8 more)

### Community 24 - "panel-interaction.ts"
Cohesion: 0.22
Nodes (11): CanvasHud(), CanvasHudProps, applyDrag(), DragMode, DragState, ResizeEdge, PanelDragDeps, ViewportControls (+3 more)

### Community 25 - "M4a: Panel Manipulation — Design"
Cohesion: 0.12
Nodes (15): Architecture, Closing a panel, Error handling and edge cases, Forward notes for M4b / M4c, Goal, Input routing, M4a: Panel Manipulation — Design, `panel-interaction.ts` (+7 more)

### Community 26 - "File Structure"
Cohesion: 0.13
Nodes (14): Definition of Done, File Structure, Global Constraints, M4a: Panel Manipulation Implementation Plan, One deviation from the spec, and why, Task 1: Pure interaction geometry, Task 2: Pointer correction arithmetic, Task 3: The interceptor, proven while the gate still stands (+6 more)

### Community 27 - "M6: Panel Legibility — Design"
Cohesion: 0.13
Nodes (14): Architecture, Failure modes, Files, Goal, M6: Panel Legibility — Design, M6a — Identity, M6b — Settings, M6c — Agent state (+6 more)

### Community 28 - "Design"
Cohesion: 0.13
Nodes (14): Confirm before destroying, Design, Goal, Group-first sorting, best-match selection, Hidden at rest, never hidden from search, Keyboard hints, M6p: Palette Structure — Design, Non-goals (+6 more)

### Community 29 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, electron, electron-builder, @electron/rebuild, electron-vite, react, react-dom, @types/react (+7 more)

### Community 30 - "viewport.ts"
Cohesion: 0.20
Nodes (11): normalizeWheel(), WheelIntent, WheelLike, INITIAL, REPEATABLE_KEYS, centreOn(), clampScale(), fitTo() (+3 more)

### Community 31 - "TerminalPanel.tsx"
Cohesion: 0.16
Nodes (9): TerminalPanel, TerminalPanelImpl(), TerminalPanelProps, applyAgentState(), clearAgentState(), listeners, notify(), states (+1 more)

### Community 32 - "File structure"
Cohesion: 0.14
Nodes (13): Deliberate deviation from the spec, File structure, Global Constraints, M4c: tmux-Backed Sessions Implementation Plan, Self-Review, Task 1: The pure tmux core and its plain-node suite, Task 2: The backend seam and DirectBackend, Task 3: TmuxBackend (+5 more)

### Community 33 - "Global Constraints"
Cohesion: 0.14
Nodes (13): Baselines (re-derived by running the suites at `2443ae3`), Global Constraints, M6p: Palette Structure — Implementation Plan, Task 0: Spec and plan — DONE, Task 1: The pure layer, Task 2: The rows, Task 3: The view, Task 4: Scope drill-in (+5 more)

### Community 34 - "panels.ts"
Cohesion: 0.19
Nodes (7): firstRunPanels(), makePanel(), nextZ(), Panel, raisePanel(), SEED_PANELS, shell()

### Community 35 - "Task 10 — End-to-end checks in a real renderer"
Cohesion: 0.14
Nodes (13): 54 — a real bell reaches the panel's DOM, 55 — the trap, in a real renderer, 56 — the card, 57 — focus acknowledges, and main answers, Check numbers, Falsification runs (summary), Follow-ups for whoever owns the docs task, Full results (+5 more)

### Community 36 - "Global Constraints"
Cohesion: 0.15
Nodes (12): Global Constraints, M6b: Settings Schema — Implementation Plan, Task 1: The schema module, Task 2: `parsePreferences`, and the migration that keeps existing files restoring, Task 3: `LayoutStore` owns the preferences map, Task 4: The two channels, Task 5: The Restore submenu is built from the schema, Task 6: Settings rows in the palette (+4 more)

### Community 37 - "Global Constraints"
Cohesion: 0.17
Nodes (11): Global Constraints, M6a: Panel Identity — Implementation Plan, Task 1: `Panel.title` round-trips through the layout format, Task 2: `buildHasSessionArgs` — the argv that tells create from reattach, Task 3: `SessionBackend.hasSession` and `reattached` on `PtyCreateResult`, Task 4: `PanelStatus.running` stops discarding what main already sent, Task 5: The panel header says what actually spawned, Task 6: The rename row in the palette's command list (+3 more)

### Community 38 - "Canvas.tsx"
Cohesion: 0.21
Nodes (9): Canvas(), EMPTY_PANELS, EMPTY_PRESETS, EMPTY_PROMPTS, EMPTY_SETTINGS, registry, usePanelDrag(), useViewport() (+1 more)

### Community 39 - "Task 3 report: the state machine"
Cohesion: 0.17
Nodes (11): Commit, Concerns, Constraints honored, Deviation confirmed intentional (not "fixed"), Files changed, Final passing output, Status: DONE, Task 3 report: the state machine (+3 more)

### Community 40 - "Task 9 report: the glow, on the panel and on the card"
Cohesion: 0.17
Nodes (11): Files changed, Fix round 1/5 (review response), Hand verification I could NOT perform, IMPORTANT: `starting` had no CSS rule, MINOR: the redundant IPC round trip — NOT folded, and why, Regression suites run (as permitted, not the full verify chain), Revised "needs human eyes" list, Task 9 report: the glow, on the panel and on the card (+3 more)

### Community 41 - "Global Constraints"
Cohesion: 0.18
Nodes (10): Definition of Done, Global Constraints, M2 Infinite Canvas Implementation Plan, Task 1: Viewport transform core, Task 2: Hit-testing and zoom-to-fit, Task 3: Wheel event normalization, Task 4: Canvas component with live pan and zoom, Task 5: Selection HUD (+2 more)

### Community 42 - "Global Constraints"
Cohesion: 0.18
Nodes (10): Definition of Done, Global Constraints, M3 Terminals on the Canvas Implementation Plan, Task 1: Prove xterm survives a detached host, Task 2: Tier assignment, Task 3: The session registry, Task 4: Split terminal construction from attachment, Task 5: Wire the canvas to real terminals (+2 more)

### Community 43 - "File structure"
Cohesion: 0.18
Nodes (10): File structure, Global Constraints, M5a: Panel Presets Implementation Plan, Task 1: The `Preset` type and `parsePresets`, Task 2: `LayoutStore` learns about presets, Task 3: Built-in presets, id minting, naming, availability, Task 4: The IPC contract and the preload bridge, Task 5: `makePanel` takes a spec (+2 more)

### Community 44 - "Terminal Canvas"
Cohesion: 0.20
Nodes (8): Architecture, Getting started, If `npm run dev` misbehaves, Milestones, Prerequisites, Stack, Terminal Canvas, Things that are non-obvious

### Community 45 - "package.json"
Cohesion: 0.20
Nodes (9): author, dependencies, node-pty, description, license, main, name, private (+1 more)

### Community 47 - "session-factory.ts"
Cohesion: 0.42
Nodes (8): attachTerminal(), createTerminal(), detachTerminal(), disposeTerminal(), TerminalHandles, theme, createHandle(), createSessionFactory()

### Community 48 - "Task 2 report: The BEL scanner"
Cohesion: 0.20
Nodes (9): Commit, Files, Fix round 1/5: coverage gap (Important finding), Notes / deviations, Status: DONE, Step 2: watch it fail, Step 4: watch it pass, Task 2 report: The BEL scanner (+1 more)

### Community 49 - "CLAUDE.md"
Cohesion: 0.22
Nodes (7): Architecture, Commands, Conventions, Gotchas, Load-bearing details, What this is, Working on this repo

### Community 50 - "Global Constraints"
Cohesion: 0.22
Nodes (8): Global Constraints, M5c Packaging Implementation Plan, Task 1: The socket resolver, Task 2: Thread the resolved socket through the probe, Task 3: The config builder, and the cheap suite that reads it, Task 4: The startup diagnostic, Task 5: The suite that really packages and really launches, Task 6: The documentation the next person needs

### Community 51 - "Task 5 report — the IPC surface"
Cohesion: 0.22
Nodes (8): Commit, Concerns, `npm run typecheck` — clean, `npm run verify:ipc` — fails as intended, Status: DONE, Task 5 report — the IPC surface, Verification, What was done

### Community 52 - "Task 7 report — the detector at the choke point"
Cohesion: 0.22
Nodes (8): Every `new PtyManager` construction site, Helper names: assumed vs. found, Notes / concerns, Step 2 — watch it fail, Step 6 — the four commands, Task 7 report — the detector at the choke point, The five silent-failure points, and where each landed, What changed

### Community 53 - "xterm-pointer.ts"
Cohesion: 0.25
Nodes (3): RectOrigin, synthetic, TYPES

### Community 55 - "Task 6 report: a number setting reaches the palette"
Cohesion: 0.25
Nodes (7): Commit, Constraint compliance, Fix round 1/5: out-of-range edit no longer fails silently, Fix round 2/5: the refusal message is now a visible element, not just a placeholder, Helper-name findings (point 1), Task 6 report: a number setting reaches the palette, TDD sequence

### Community 56 - "Task 8 report — the renderer store"
Cohesion: 0.25
Nodes (7): Files touched, registry.dispose call sites, Task 8 report — the renderer store, The store, The subscription, Verification, What is NOT yet observable

### Community 57 - "lod.ts"
Cohesion: 0.38
Nodes (6): assignTiers(), intersectsViewport(), Tier, TierInput, screenToWorld(), Size

### Community 58 - "Pre-flight conflict scan"
Cohesion: 0.29
Nodes (6): Cross-task rows (tasks sharing a file or an interface), Per-task self-consistency rows, Pre-flight conflict scan, Progress, Rulings made before execution, SDD ledger — plan: docs/superpowers/plans/2026-08-27-m6c-agent-state.md

## Knowledge Gaps
- **586 isolated node(s):** `name`, `version`, `description`, `main`, `author` (+581 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PanelId` connect `PtyManager` to `pty-manager.ts`, `ipc.ts`, `ipc-contract.ts`, `session-backend.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `Registry` connect `session-registry.ts` to `Canvas.tsx`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _586 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Ideas backlog` be split into smaller, more focused modules?**
  _Cohesion score 0.024390243902439025 - nodes in this community are weakly interconnected._
- **Should `layout-schema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06448087431693988 - nodes in this community are weakly interconnected._
- **Should `Palette.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05731523378582202 - nodes in this community are weakly interconnected._
- **Should `session-registry.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05314009661835749 - nodes in this community are weakly interconnected._