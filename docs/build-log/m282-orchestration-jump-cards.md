# M282 — Orchestrate jump cards

The Orchestrate bottom strip is now System / Current task / Terminal / Code / Files, after the
reference's bottom row. The three new cells are **jump cards**: previews of canvas panels that
select on click and jump on double-click (`onJumpPanel`, `onOpenFiles`). Panels stay on the canvas.

- **Terminal** absorbs the old *Selected* cell (title, state word, chat phase, command, cost, cwd)
  and adds the last six lines of the tail from `useOrchOutput`. That is the Logs tab's reader, so
  every line already passes `outward()` (`orch.gate.1`). The hook now pulls whenever the page is
  up, not only on the Logs tab.
- **Code** is `orchBestFile`: the selected file, else the first file panel. It shows the path, not
  the contents. `file:read` is keyed by panelId and ARMS THE WATCH, so a preview read would fight
  the file panel's own watch silently. No "recent" ordering either — the model has no edit times.
- **Files** lists the first five file panels and offers Open files.
- **Deployments** is omitted: there is no deploy provider, and a cell of invented state breaks rest-layer honesty.

No xterm and no Monaco in Orchestrate. A second xterm refits and sends SIGWINCH into the agent
(M234), and Monaco would drag its chunk forward. `orch.jump.2` pins both and the absence of
`file.read`; `orch.jump.1` pins the Code card's choice.

Five columns is narrow, so the perf grid is a fixed two-up and the task stage buttons wrap.

## Closeout — goldens and gate (2026-09-17)

Two defects surfaced by LOOKING at the captures before writing anything, both caused by the
strip going from three cells to five, and both fixed here rather than baked into a golden.

**The task title clipped mid-word.** `.orch__task-main` is a column flex with
`align-items: flex-start`, so every child shrink-wraps to its CONTENT width on the cross axis.
The title span was therefore exactly as wide as its text, its own `overflow: hidden` never
engaged, and the shared `text-overflow: ellipsis` rule at `styles.css:7390` did nothing — the
clip happened at the card edge instead, cutting `Watchdog fires under load` to
`Watchdog fires under l` with no truncation mark. At three cells the title fit, so the rule had
never been exercised. Fixed with `.orch__task-main > * { align-self: stretch; max-width: 100% }`;
it now reads `Watchdog fires un…`. The same trap is one `align-items` away in any of these cards,
which is why the fix carries its reason in the stylesheet.

**The dark golden could not go green.** M281 left one unresolved failure: a live memory-chart
tile at 512,736, 81% against a 35% budget. It is not material or layout — the System card paints
a REAL sample of this machine's process table, so two runs a minute apart differ (measured 2 MB
against 1 MB, with two different sparklines). A golden cannot pin a value that is true only at
capture time. The shot mask, which already hid the clock and greeting for exactly this reason,
now also hides `.orch__perf-value` and `.orch__perf-card svg` in all three orchestration scenes.
`visibility: hidden` keeps the boxes, so the cards, labels and geometry stay pinned; only the
live numbers are out. All three intent strings disclose it, as the clock mask already did.
NOT masked, and a smaller residual risk of the same kind: the Terminal card's `0% · 2 MB` cost
caption. It shares the source but is small type in one tile, well under the tile budget.

**Critic — each scene inspected before `UPDATE_GOLDENS=1`:**

- `orchestration` (light): the five-cell strip reads as one row of peers — System, Current task,
  Terminal, Code, Files. The Terminal card is populated here (this scene selects a satellite), and
  carries title, state, command and a six-line tail, every line through `outward()`. Code shows
  `server.ts` and `…/src/server.ts` with `Open in its panel` — a path, never contents, which is
  what `orch.jump.1/.2` pin. Deployments is absent as designed. The perf grid is two-up and the
  four stage buttons wrap 2×2 at the narrower width; both are legible rather than cramped.
- `orchestration-dark`: M281's translucent navy and iris rims carry the new cells unchanged —
  the three added cards take the same glass as the two they joined, so the strip did not become a
  second material. The task float keeps its one-third stage fill. The diorama is untouched.
- `orchestration-working`: bloom, the cyan live edge and the amber `Needs input` callout still
  dominate; the strip stays quiet behind them, which is the right order. The Terminal card shows
  its EMPTY state (`select an agent in the pool or graph to jump to it`) because this scene seeds
  agent states rather than selecting — so the pair now pins both of that card's states across the
  set. The callout over the `dev server` label is M281's known crowding, unchanged by this pass.

**Goldens written**, and then proved stable rather than merely written. The update run kept 60
goldens byte for byte and wrote only what had moved — the design at `verify-visual.cjs:196`
earning its keep. It also wrote `starter`, which nothing here had looked at; that write was
reverted, because a golden nobody inspected is the blind re-baseline the rule exists to stop.
The confirming non-update run then read all three back at **0.000% differ, 0 px, worst tile 0%**.
That number is the point: M281 could never get the dark scene under budget twice in a row, and it
is now bit-identical across runs, which is what closes its one open failure.

`starter` remains red and is NOT this change — `starter scene: the arrangement is not on screen`,
a paint failure carried on main since the diorama pass. It is intermittent rather than steady: it
painted during the update run and failed to paint minutes later in the confirming run, which is
the reason it must not be re-baselined from whichever run happened to produce a picture.

**Gate: `npm run verify` 52/54 in 556s**, plus `verify:visual` 65/66 and `verify:packaged`
untouched since M281's 12/12. Targeted: `verify:orchestration` 60/60 (including `orch.jump.1/.2`
and `orch.gate.1`), `verify:styles` 75/75, `verify:meta` 50/50, `npm run build` clean. The build
also re-confirms the lazy door: `OrchestrationCubes-*.js` is 2.34MB in its OWN chunk, not the
6.0MB first chunk.

The two red suites are the SAME two M281 recorded, re-run individually to place them by name
rather than by suite:

- `verify:panels:agents` — `detail.1` only. At zoom 0.1 five cards claim `cluster` where the
  check expects the block tier near 0.08. A LOD tier boundary; no orchestration module is in it.
- `verify:panels:product` — eight checks, seven of them the workflow editor (`workflow.edit.1/.2`,
  `lib.1`, `wire.1`, `inspect.1`, `save.1`, `panel.1e`) and `reach.1`, keyboard reach through the
  context pane and launcher. Three of the workflow reds are `Script failed to execute`, so that
  suite is failing at the harness rather than at an assertion.

Neither touches this change, which is a stylesheet rule scoped to `.orch__task-main > *` and a
capture mask in `scripts/shot.cjs`. Both reds are carried, not introduced.
