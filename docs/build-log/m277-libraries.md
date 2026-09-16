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
