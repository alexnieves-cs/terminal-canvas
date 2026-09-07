# v7 Act II — eight backlog entries (M140–M147): build log

`main`, 2026-09-07, from `719dd14` (the close of Act I), built in the worktree
`.claude/worktrees/v7-act2` (`TC_VERIFY_SUFFIX=act2`, plain-node suites only there) while
`main` ran the Electron tier, and merged at `d78018c`. Spec:
`docs/superpowers/specs/2026-09-07-v7-act2-backlog-eight-design.md`. Plan:
`docs/superpowers/plans/2026-09-07-v7-act2-backlog-eight.md`. Every entry in
`docs/ideas-backlog.md` was read whole before its milestone was scoped, and each carries a
note now saying what this act left. Build order: M146, M144, M141, M147, M145, M143, M142,
M140 — smallest and most independent first, the two Act V needs (M147, M145) in the middle.

## Before the act: the Act I critic's wave

The fresh-context critic on Act I returned fix-first with one Critical and six Majors; the
verifier found the claims supported except one count. All landed as `d89413d` in the
worktree before any Act II code:

- **C1** — `useChatSessions` had nested the orchestrator's prompt INSIDE the teammate arm, so
  a template-minted orchestrator (no teammate) resumed as an ordinary chat: M81's failure,
  one block kind later. The prompt sits in the one prompt chain now; product
  `orchestrator.resume.1` reads the spawn's argv.
- **M1/M2** — a refused mint ended as `stopped — by hand`, and a refused send left a worker
  `started` forever. Both end the pool BY NAME now (`endRefused`), interrupting live
  workers and muting the engine's own `stopped`; the fake agents seam returns the
  manager's real word (`pool.2e`).
- **M4** — a joined pool (an edge into a collect) whose items outnumber the workers the live
  ceiling allows is REFUSED by name before any mint (`pool.2f`); the alternative — minting
  every edge up front — cannot exist for workers that do not yet.
- **M5** — CI fetches tags (`panels-split.2` reads `pre-v7-run` through `git show`).
- **M6** — the Places-gate claim on the list file was struck from the module header and
  `CLAUDE.md` (and, after the verifier found it still standing, from the Act I spec); there
  is no teammate on a pool.
- **M7** — hand check 8 decided: a rename onto an occupied shelf key collapses to ONE slot
  (`renameInShelf` dedupes; `shelf.rename.1`).
- Minors: `verify:pty` 8/9 test the version AFTER the path; `panels-split.1` matches the
  script name; `pool-model` starts a new run clean and keeps a refusal through a stop;
  `usePoolsLive` memoised; a blank orchestrator prompt refused by name (`workflow.2c` — the
  critic had also asked for an edge INTO a pool block to be refused, and that refusal was
  REVERTED on `main` at `ecb7dff`: the M133 fixture is that very shape and the pool starts
  with the run; `workflow.2c` now asserts the edge is allowed); `poolTargetsRef` above its
  reader; the `handcheck-trash` header.
- The verifier's one false count ("twelve mutable names": eleven) is corrected here.

## The watchdogs, measured where the suite runs

The first full chain after the split killed `core` at 40 s while two reviewer agents ran
plain-node suites beside it. The parts were re-measured in the chain's Electron tail (build,
canvas, xterm, then the five) twice, alone: 30.3/30.4, 74.7/75.0, 44.0/44.0, 86.3/86.0,
73.7/73.7 s — the quiet figures — and pinned at 40/95/55/110/95 s with the condition named
beside each constant (`389d5a2`). The harness prints each part's wall clock with its tally.

## M146 — zoom to fit

Red: `c547fe5` (`fit.sel.1`, `zoom.fit.1`). `fitSelection` is a flight over `fitTo`, the
same math `fitAll` uses; `zoomToFit` frames the selection when any, every panel otherwise,
and resets on an empty canvas (a verb that did nothing would read as broken). `Reset zoom`
keeps `canvas.fit`'s id and ⌘0. Palette check 48's shortcut set gained the row. Core `fit.1`
selects the second panel by a DISPATCHED shift-mousedown on its chrome (a real
`sendInputEvent` click did not add to the selection in the hidden window — the check's own
comment says so) and runs both rows through the palette. (The Act II critic: the row had
carried a `⌘1` hint while the chord ran `fitAll`, not the selection-aware verb — the hint was
dropped in the review wave, M149.)

## M144 — zoom-independent chrome

Red: styles `chrome.scale.1`, core `frame.3`. A CSS transform on `.pf__chrome` and
`.panel__resize` — no layout box moves — with `--chrome-scale` stamped once on `.world`
(`clamp(1, 1/scale, 2.5)`), declared at 1 in the stylesheet so styles check 2 sees the token.
`frame.3` zooms out with the harness's ⌘- until the scale is at or under 0.6 and reads the
ratios against the ACTUAL scale, never an assumed 0.5. ("No layout box moves" is the BODY's
box: the chrome's own rule also sets `width: calc(100% / var(--chrome-scale))` so the
scaled bar spans the frame, which is a layout property of the chrome alone — the verifier's
narrower truth.)

## M141 — prompt placeholders

Red: rail `holes.builtin.1–.3` (the spec said `verify:palette`; `composer-model.ts` is in the
rail bundle, so the checks went there), core `prompt.builtin.1`. `BUILT_IN_HOLES`,
`fillBuiltIns`, `askableHoles`; `insertPrompt` fills from the target after M75's questions and
before delivery, `{{branch}}` through `git:status` only when the body names it.

## M147 — the environment and the template set

Red: layout `preset.env.1–.2`, palette `workspace.template.1`, shell `workspace.template.1`.
`parseEnvMap` drops a malformed map WHOLE; `buildPtyEnv` had merged overrides since M1 and
only the field was missing. The sheet's env field is a textarea under the title, shown for a
preset or a command, with an `not KEY=value: …` line for what it could not read. The
actions object gained `self` — the one verb that opens another verb's door.

## M145 — the image handoff

Red: file `clipboard.1–.3`, core `paste.image.1`, `verify:ipc` at 123. The prune orders by the
file's own stamp, not mtime — two files in one millisecond share an mtime and a tie could
delete the newest (the check writes 25 in one loop). The harness writes under its own
attachments directory, exposed on ctx, never the real `userData`.

## M143 — the live tier's card

Already built (M63's rows-as-rows) and the addon already declined (M112, by measurement); the
milestone is the pin it lacked: `verify:xterm card.rows.1` over a real Terminal, attached and
detached. No code.

## M142 — cost history

Red: file `ledger.usage.1`, rail `summary.history.1`, kinds `cost.history.1`, `verify:ipc` at
124. The usage row carries per-model totals and NO price; the renderer prices with `costOf`,
the summary's own rule. The first insertion into `verify:file` ran its async block after the
tally (the suite's checks are `await`ed inside one IIFE); the `ledger.usage.1` block is
awaited now (the clipboard block holds no `await` and completes synchronously, which the
verifier noted). **What Act II did NOT ship, found by the 4.0 audit (M149):** the renderer's
READ of `ledger:usage` — every other piece landed and `cost.history.1` (kinds) was red from
the merge until `9c75f6d`, when the Electron tail first ran over the merged tree.
`ledger:usage` rides the palette handlers object rather than `registerIpcHandlers`' positional
list, whose later params would have shifted under every caller.

## M140 — the toolbox's write half

Red: rail `toolbox.open.1`, product `editor.cmd.1`. Every row carries `sourcePath`; the Open
door opens the file panel — driven end to end for a COMMAND row; the hook and MCP rows carry
the path as data (`toolbox.open.1` pins all three) and are not clicked by any Electron check. The first `feat` commit did not typecheck (`props` in a component
that destructures); fixed on `main` at `a4caabb` before the tail ran.

## The worktree's node_modules symlink, committed — and what the merge did

The Act II worktree had `node_modules` as a symlink to `main`'s (a checkout cannot run the
plain-node suites without one). `.gitignore` said `node_modules/` — a DIRECTORY pattern,
which a symlink does not match — so the worktree's `git add -A` committed the link
(`d89413d`), and the merge into `main` (`d78018c`) replaced the real directory with a link to
`../../../node_modules`, which from `main` is nowhere: the Electron tail died on `tsc:
command not found` with no other symptom. Fixed at `138d323`: the link untracked, the
pattern made a NAME (`node_modules`), the merged worktree removed, `npm ci` re-run. The
lesson is in `docs/load-bearing.md`.

## The Electron tier over the merged tree

After `138d323`, every part green: core 75/75, shell 94/94, kinds 48/48, agents 77/77,
product 57/57 (the tallies include M149's checks, which landed before the tier was green —
see the Act III log). Three harness mistakes of this act's own were found by that tier:
`fit.1`'s selector was quoted twice (`data-panel-id=""n19""`) and THREW, which aborted the
whole core part as `infrastructure` — a thrown check is not a red, it is every check below it
never running; `cost.history.1` spawned `cat -v` with the agent flag, and cat read
`--session-id <uuid>` as a file name and exited, taking the pin with it; `editor.cmd.1`'s
injected script carried a real newline inside a quoted string. Watchdogs re-pinned from two
green runs each in the Electron tier: core 49 s (38.5, 37.6), shell 96 s (76.5, 76.7), kinds
60 s (47.1, 47.4), agents 109 s (86.2, 86.7), product 95 s (74.7, 75.2).

## Reviewed in Act III

The fresh-context critic and verifier over this act ran after Act III's goldens landed;
their findings and the fix wave are recorded in `docs/build-log/m148-m149-act3-visual.md`
under *Reviews*. The one Critical was this act's: a preset's `env` never reached the process.
