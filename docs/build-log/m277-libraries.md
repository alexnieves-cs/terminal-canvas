# M277 — zod at new boundaries, charts in the pane, one-shot toasts

Built 2026-09-16 on `main` (`ddbda87e`). Rounds 6–8 of the library work: three
independent adoptions, each confined to a place that had **nothing there
before** rather than replacing something that already worked. That constraint is
the whole shape of the milestone — a library that displaces a working reader
buys a migration and a class of silent behaviour change; a library that fills a
hole buys only itself.

## Zod, at the two boundaries that had NO reader

Never a retrofit of `parseTemplates`, which stays the layout file's own
hand-written reader. The two arms adopted were the ones with no reader at all:

- **`parsePortable`** cast `r.templates` after an `Array.isArray` and nothing
  else, so any object at all reached the template library — and the LAYOUT
  reader was the first thing to look at it, a relaunch later, with no way back
  to the import that caused it. Its sibling `parsePack` already routed payloads
  through a parser; this was the arm that did not.
- **`template:save`** cast its payload, so the editor could write a record the
  layout reader would refuse: a save that appears to succeed and is gone after
  the next launch.

`TemplateSaveResult` gains a third arm, **`refused`**, kept distinct from
`stale` because stale offers Reload and reloading cannot help a payload main
will never accept. The two cross-field rules (keys unique, every edge names a
real node) are declared once in a refinement, so they hold for every arm the
node union grows — those are exactly the checks a hand-written parser loses when
a sixth kind lands. `verify:workflow-schema` `wfs.agree.1` pins the
**directional** invariant: everything the store keeps, the schema accepts.

New module: `src/shared/workflow-graph-schema.ts`.

## Recharts, which required inventing the history first

Neither surface had a time series. Both stores keep only the latest sample, and
`foldUsageHistory` discarded every `endedAt` the ledger carried — so the pane
could say "$4.12 across 9 sessions" and never whether that was one afternoon or
a week. The chart was not a rendering problem; the data did not exist.

- A bounded **60-sample ring per panel** (`machine-series.ts`), with its OWN
  listener set, so a 2-second poll does not re-render every terminal.
- **Daily buckets** off the ledger rows (`usage-series.ts`).

The figures stay. The charts sit under them and answer a different question.
There is no network sampling anywhere in this app, so nothing claims one.

**Colours are read from the live theme** (`chart-tokens.ts`) because `var()`
does not resolve in SVG presentation attributes — the natural spelling paints an
invisible series with no error and no red suite. No hex leaves a theme block
either way.

New modules: `session/machine-series.ts`, `shell/usage-series.ts`,
`shell/chart-tokens.ts`, `shell/MachineChart.tsx`, `shell/UsageChart.tsx`.

## Sonner, for outcomes that had nowhere to go

An export told only the console, a saved credential said nothing at all, and
`say()` opened the whole command palette to show one sentence.

The **attention system is untouched** and remains the source of truth for
anything still true after a toast has gone — a toast is for what is finished,
attention for what is outstanding. The suppression rule is *imported* from
command-pill rather than re-expressed, and `toast.door.1` pins sonner to exactly
**two** importing files so it cannot be walked around.

New modules: `shell/toast.ts`, `shell/toast-decision.ts`,
`shell/CanvasToaster.tsx`.

## Suites added

`verify:workflow-schema`, `verify:chart-series`, `verify:toast` — all three run
by being written, via the runner's derivation from `package.json`.

## Gate

`verify` 41/42 (the one red is pre-existing and untracked), `styles` 75/75,
`panels:shell` 99/99, `panels:product` 109/117 — **identical before and after**,
verified by stashing this work and re-running, not by reading the numbers.

## Command-deck restyle follow-up (2026-09-16)

The orchestration shell now uses a centrally lit blue-black ground (`--deck-ground`
#070B14, `--deck-surface` #0D1420 in dark mode, with matching light-theme tokens).
The R3F island gains translucent clearcoat faces and edge outlines above illuminated
platforms. Roles tint connections and cube bodies; small dots retain state meaning.
A real orchestrator pulses cyan; a synthetic workspace hub does not claim activity.
Mono cube labels are the user's explicit exception to the usual UI-face rule.

Compact KPI cards retain their existing filters and add accent slivers. Activity
rows gain event-kind icon chips. The existing CPU and memory histories now use
Recharts area strips through MachineChart and resolved chart tokens, with no
invented samples. MotionSurface supplies a reduced-motion-aware rail entrance.
Existing primitive and toast doors remain in place; no dependency was added by
this restyle. Canvas/PTY geometry and interaction aliases are unchanged.

Validation is not fully green; no golden has been updated blindly.

Visual review: `orchestration` keeps the selected callout above the scene and moves
mono labels clear of their platforms; light-theme role outlines remain legible.
`orchestration-dark` makes the central light and translucent cube edges readable
against the blue-black ground, while the metric strips remain subordinate to the
scene. The fixture has no supervisor and no live activity; those empty states
remain truthful. An isolated two-scene capture was reviewed in
`out/command-deck-preview/`; it is visual QA, not a substitute for the full gate.

Verification: final typecheck/build passed, styles 75/75 and orchestration 53/53.
The complete `npm run verify` finished at 51/54 suites: panels:shell failed review
file-attribution checks and its watchdog; panels:agents failed `detail.1`;
panels:product failed workflow editing, reachability and task-review checks and
its watchdog. These failures are recorded, not waived or repaired as part of the
restyle. Full output: `out/command-deck-verify-final.log`. Packaged verification
passed 12/12 (`out/command-deck-packaged-final.log`); the subsequent final palette
adjustment also passed the build. The first visual run hit its watchdog; a final
full visual comparison is pending.

### The R3F island is lazily imported (2026-09-16)

`OrchestrationView` reached `OrchestrationCubes` through a STATIC import, which put
three.js and @react-three/fiber in the app's first chunk. Measured, not reasoned about:

| | first chunk | cubes chunk |
|---|---|---|
| before the restyle | 5,989.37 kB | — |
| restyle, static import | **8,187.47 kB** | — |
| restyle, lazy `import()` | **5,992.09 kB** | 2,171.20 kB |

So the static form charged every session +2.2MB of startup parse for a view most
sessions never open; the lazy form is +2.7 kB over the pre-restyle chunk, and three
moves to a chunk fetched on the first Orchestration paint. Confirmed by grep rather
than by reading sizes: `WebGLRenderer` appears 0 times in the first chunk and 57
times in `OrchestrationCubes-*.js`.

This is Monaco's rule (`file/editor-registry.ts`'s header) applied a second time, and
it fails the same way — silently, with every suite green, because **no suite pins the
chunk split**. `OrchCubeSpec` is therefore an `import type`, erased at compile time;
dropping that one `type` keyword re-bundles three with no error and no red suite.

Green after the split: `tsc --noEmit -p tsconfig.web.json`, `npm run build`,
`verify:orchestration`, `verify:styles`, and `npm run shot` — both orchestration
scenes captured, so the lazy chunk arrives inside the harness's 2s poll for
`.orch__cube-canvas canvas`, and the island renders.

**Correction to the entry above.** It records `panels:shell` as failing review
file-attribution checks. It does not regress: measured by stashing this work,
rebuilding and re-running, the clean tree is **99/99 in 79.4s** (83% of a 96s
watchdog) and this work is **99/99 in 74.1s** (77%). Those six review-node reds and
the watchdog were contention in the full 54-suite run — the same `panel s01 already
has a live PTY` signature as the other starvation flakes. `panels:agents detail.1`
and the `panels:product` workflow reds remain the known pre-existing baseline.

Still owed: the `orchestration-dark` golden. `verify:meta visual.1` is red because
shot.cjs declares 62 scenes against 61 goldens; the capture is in
`out/shots/orchestration-dark.png` and needs a critic's sentence before
`UPDATE_GOLDENS=1` writes it.
