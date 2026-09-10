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
