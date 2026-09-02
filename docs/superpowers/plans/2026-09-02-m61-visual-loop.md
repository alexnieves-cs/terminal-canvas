# M61 plan — the visual loop

Spec: `docs/superpowers/specs/2026-09-02-m61-visual-loop-design.md`. Each task is check-first
where a check exists for its shape; tasks 1 and 7 have no assertion by design.

1. **README rows and the pin.** Write `verify:meta milestones.1` (build-log ↔ README table,
   both directions), run it red (M36–M60 rows missing), add the rows from the build-log
   summaries, run it green.
2. **Exit-flush gate.** Write `verify:pty-manager exit-flush.1` (trap-on-exit marker after
   `kill()` + recreate at the same id must reach neither `pty:data` nor the sink), run it red,
   gate `flush()` on session identity, run it green. Rewrite the `onExit` comment.
3. **Group controls.** Write `verify:rail group-keys.2` (text scan: no `<button` with
   `onMouseDown` and no `shellControl` in `GroupLayer.tsx`), red; write
   `verify:palette group-rows.1`, red; add `groups` to `PaletteContext`, the two rows, the
   reason constant, `toggleGroup`/`removeGroup` actions, and the `shellControl` wiring; green.
4. **`verify:panels group-keys.1`.** A group made through the palette on two selected panels,
   then click on toggle/remove asserted; red first against the mousedown-only buttons (a
   dispatched `click` does nothing there), green after task 3.
5. **The ambiguous notice's frame** in `styles.css` and `SubagentLayer.tsx`.
6. **The harness.** Grow `scripts/shot.cjs`: fixture layout, projects root, pre-written log,
   scene list, manifest, `npm run shot`. README verify section names it.
7. **Look, then critic.** Read every PNG. Dispatch the critic with images + manifest intents
   only. Record findings and decisions in `docs/build-log/m61-visual-loop.md`.
8. **Verify chain alone, commit, merge, branch.** `docs/verify-suites.md` and CLAUDE.md
   suite counts touched only where a number changed.
