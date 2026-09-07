# v7 Act III — the visual-regression suite and the 4.0 UX audit (M148–M149): build log

`main`, 2026-09-07, after Act II. Spec: `docs/superpowers/specs/2026-09-07-v7-act3-visual-design.md`.
Plan: `docs/superpowers/plans/2026-09-07-v7-act3-visual.md`.

## M148 — `verify:visual`

Red: `verify:meta visual.1` (`720798e`). `scripts/verify-visual.cjs` is an Electron entry
that runs `npm run shot` as a child into a scratch `SHOT_DIR`, decodes each capture and its
golden with `nativeImage` and compares with two constants that carry their own sentences —
`CHANNEL_TOLERANCE` 24/255, `PIXEL_BUDGET` 0.5 %. Reds write `out/visual/<scene>.diff.png`
(differing pixels in red over the dimmed golden) beside `<scene>.fresh.png`. `verify:meta` 19
names `verify:visual` as the second exclusion beside `verify:packaged`.

The first goldens, and the two runs that measured the suite, are recorded below.

## M149 — the audit

`docs/ux-audit-4.0.md`, from looking at every golden. Findings, fixes and added scenes below.
