# M248–M250 — deck, bottom command pill, rich notes and .docx import

Plan: `~/.claude/plans/in-its-own-worktree-fancy-anchor.md`. Each milestone is built in its own
worktree (`m248-deck`, `m249-command-pill`, `m250-notes-docx`) and merged in the
`m248-m250` integration worktree. This ledger is the state. Each branch appends its own line.
The integrator takes the union.

## M249 — bottom command pill

- **M249 — done on branch `m249-command-pill`, not merged.** Spec:
  `docs/superpowers/specs/2026-09-10-m249-command-pill.md`. Plan:
  `docs/superpowers/plans/2026-09-10-m249-command-pill.md`.
- **Red first.**
  - `verify:pill` went 0/7 against the missing module.
  - `verify:panels:product pill.*` went 0/5 against a `CommandPill` that rendered nothing.
    That was 2026-09-10 17:26, with `TC_WATCHDOG_SCALE=2`, after an unscaled attempt hit the
    watchdog before printing. `paste.1` read `leaked: true`, which is the guard's absence
    observed at `ptyManager.write`.
- **Green.** `TC_VERIFY_SUFFIX=m249 npm run verify` at 18:55 passed `verify:pill` 7/7 and
  product `pill.focus.1`, `.rects.1`, `.paste.1`, `.jump.1` and `.send.1`. Product
  `headroom.1` was 157.2 s of 230 s (68%), so no re-pin.
- **Green runs found three real defects:**
  - The input was disabled on the readiness report. A disabled input cannot take
    Cmd+Shift+Space's focus.
  - `send()` read stale `draft` state when the Enter landed in the same task as the change.
  - The first `pill.jump.1` rang the FOCUSED shell and never reached wants-you. This was a
    fixture fault: the check now rings a second, unfocused shell, the shell 70b way.
- **The gate is NOT fully green, and the reds are main's.** `37/41 suites passed in 548.8s`.
  Red: panels shell 98/98b/106, kinds `broadcast.1` plus the watchdog, agents `search.1` and
  `attention.1`, and product `onboarding.start.1`. Every one is red on untouched 7a3323d0 in
  the m248 agent's baseline runs of main (`/tmp/claude-501/m248-base-*.log`) and in the m248
  and m250 full verifies. They are camera, focus and timing checks on this shared machine, and
  M249 adds no failure.
- **Three plain-tier reds on main were repaired here, because the gate needs them:**
  - `verify:meta milestones.1`: added the missing README `| M244 |` row.
  - `verify:styles` 4/5/6: M244's checklist and new-object-row literals moved onto the scale.
    `3px`/`5px`/`7px`/`10px`/`11px`/`14px` shift by 1–2px, so the goldens touching the
    new-object row may move.
  - `verify:palette sheet.1`: updated to M244's deliberate order, the creation-registry rows
    first and then the sheet.
- **The critic (fresh context) found eight issues. Seven are fixed:**
  1. The focus restore could land in a stale terminal. The return target is now recorded on
     the input's focusin and forgotten on a blur outside the pill.
  2. The string refusal arms were silent. They now go through `sendRefusalSentence`, and
     errors are caught.
  3. The success `say()` opened the palette and took the keyboard. The outcome is now shown
     in place as a `role=status` note, and `send.1` asserts no palette opened.
  4. Link mode and middle-press acted on the panel under the pill. The capture slot now
     stands down over `.command-pill` and `.new-object-row`.
  5. The keyboard was lost after a click-open. Fixed by the same focus events as 1.
  6. `rects.1` could not see the host shrinking. It now reads the host box, the `.world`
     transform and the pill's parentage.
  7. The shortcut was only synthetic. It is now a real `sendInputEvent` chord, with
     `writesBefore` taken first.
  8. Declined: the truncated sentence at `verify-suites.md:144` predates this milestone.
- **Goldens.** `verify:visual` is hand-run and was not run. The pill now appears at the bottom
  of every scene, so scene goldens will change. They need a critic's sentence here before
  `UPDATE_GOLDENS=1`, and that is owed at integration.
- **Shared edits the integrator unions:**
  - `V9_DOORS` `show-related` and `arrange-task` canvas strings
  - `Canvas.tsx` `shouldIgnoreKeys` (`|| pillFocused()`)
  - `package.json` `verify:pill`
  - `README` M244 row
  - the `styles.css` tokenisation
  - `verify-palette.cjs sheet.1`
  - `useCanvasPointer.ts` capture stand-down

## M250 — rich note editing and .docx import


- **M250 — rich note editing and .docx import** (branch `m250-notes-docx`, from 7a3323d0).
  Spec `docs/superpowers/specs/2026-09-10-m250-notes-docx.md`, plan `docs/superpowers/plans/2026-09-10-m250-notes-docx.md`.
  Checks first: `verify:notes` written against the missing modules and watched failing at **3/25**
  (the three that passed were preconditions: the exact pins, the fixture rebuild, the untouched docx);
  **25/25** after the implementation; the critic round added `notes.edit.3`, `html.2` and
  `docx.refuse.2` together with their fixes — NOT separately watched red; each pins a reproduction
  the critic ran against the pre-fix code. Dependencies `mammoth@1.12.2` and `jszip@3.10.2` pinned exact;
  `npm audit --omit=dev` → `found 0 vulnerabilities`. New channel `docx:import` (EXPECTED_CHANNELS
  134 → 135). Base 7a3323d0 was already red on `verify:styles` 4/5/6, `verify:palette sheet.1` and
  `verify:meta milestones.1` (all from M244), confirmed against an extracted copy of the base; fixed
  here. The M244 CSS literals map onto the nearest tokens (e.g. 14px → `--sp-5` 12px), so the New
  object row and checklist shift by a few pixels: `verify:visual` is hand-run and was NOT re-baselined.
  Critic (fresh context; 20k-case random round trip, byte-identical in every case): 1 blocker, 7
  should-fix, 5 nits. FIXED: the blocker (a Save or Source toggle after a REFUSED rich edit wrote the
  note without the typing and unmounted the reopened block — `flush()` is now three-state and stops
  both), a refusal reopening list/table/image/code edits with the ORIGINAL source (`renderBlock`
  seeds what was typed; `notes.edit.3`), ⌘Z mid-typing reverting a previous commit, table column
  alignment rewritten on a width change (`notes.table.1` now pins `| :--- | ---: | --- |`), an
  inflated-size cap for zip bombs in main (`docx.refuse.2`), html-to-md escapes (a trailing `#`, a
  line after a hard break, emphasis edge spaces, `~`, an entity-looking `&`; `html.2`), the agent
  and workflow doors now require a path (the chooser is the palette row's), `remapPortable`
  rebuilding the file source field by field, and a block index shifted after a split. DECLINED /
  DEFERRED with reason: the gate is the app's doors, not the filesystem — an agent with a shell can
  still `cat` the .md (said in the code and the load-bearing entry rather than claimed otherwise);
  an edited block with MIXED line endings takes one ending (only that block's bytes change; recorded);
  pictures from a conversion whose note then answers `exists` stay in the store unreferenced (the
  store is content-addressed and pruned by age, so it is disk, not a correctness defect); two
  adjacent `<ul>`s become one loose list (mammoth rarely emits it). No Electron check drives the
  Rich editor's DOM: its behaviour lives in `md-blocks.ts`, which `verify:notes` pins; the plan's
  manual `npm run dev` pass (Rich/Source on a note with HTML, a docx import) is the integrator's.
  Gate NOT fully green. `npm run verify` (TC_VERIFY_SUFFIX=m250, under the Electron lock, 625.6s)
  passed 36 of 41 suites. The reds were `verify:canvas`, `panels:shell`, `panels:kinds`,
  `panels:agents` and `panels:product`. Each was classified by running it back to back on a clean
  extract of 7a3323d0 (scratch, its own suffix, the same lock hold):
  - `canvas`: 6/6 on both sides; the gate's wheel/zoom red was contention.
  - `panels:shell`: 94/97 on both, the same ids (98, 98b, 106).
  - `panels:kinds`: `broadcast.1` plus its watchdog on both.
  - `panels:product`: 101/101 in this branch and 100/101 at base (`task.show.1`); the gate's
    product red was contention.
  - `panels:agents`: base fails `attention.1` (the camera does not move). This branch also failed
    `search.1` and `headroom.1`. An experiment reverting ONLY the `sheet.1` row move made seeding
    and headroom recover, leaving `search.1` failing at the same `moved:false` camera step as base
    `attention.1`. So the row move was reverted: `verify:palette sheet.1` stays red, as it has been
    since 7a3323d0.
  After the revert: build green and every plain suite green except `sheet.1`. The Electron tier
  was not re-run as one gate after the revert. The reverted order is exactly what the experiment's
  `panels:agents` run exercised, and the other Electron suites do not depend on it.
  Remaining reds: `sheet.1`, `panels:shell` 98/98b/106, `panels:kinds` `broadcast.1`/watchdog,
  and the camera-framing class (`attention.1`, `search.1` at `moved`). All are baseline or
  contention; none is attributable to M250.
