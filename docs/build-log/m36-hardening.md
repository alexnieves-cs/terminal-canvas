# M36 — Hardening for 1.0

**Summary:** the red baseline made green, Unicode 11 widths, a byte cap on
the flush that keeps the tail and announces itself, two memo-defeating
callbacks made stable, and the three Jira result types declared once.
**Status:** finished (2026-09-01). Spec
`docs/superpowers/specs/2026-09-01-m36-hardening-design.md`, plan
`docs/superpowers/plans/2026-09-01-m36-hardening.md`.

## What was learned

- **Check 143 was red because two green branches were never run in
  sequence.** 142 leaves nineteen panels marquee-selected; M26 made a press
  on a selected member keep the selection (so a group drag can begin); 143's
  card press therefore kept all nineteen. Repaired by clearing the selection
  first, so the check asserts its own claim.
- **Repairing 143 exposed a second fixture dependency, 144b.** The old 143's
  drag had moved all nineteen panels together, and 144b's "find a second
  exposed chrome" search only succeeded because of where that drag left the
  canvas. With 143 moving one panel, no second chrome was exposed and 144b's
  shift-click never fired. 144b now spawns two fresh panels first (the
  cascade rule leaves the previous chrome uncovered), so it owns its fixture.
  The general lesson, worth applying to every end-to-end check written from
  here: **a check that searches the canvas for a usable element is asserting
  on the geometry every earlier check left behind, and a repair anywhere
  above it can change that geometry without touching anything it claims.**
  Spawn what you need.
- **107 flaked once** (`minted=null`, a review gesture after a reload not
  resolving inside its 8s window) and passed on the next two runs with no
  code change between them. Recorded, not acted on.
- **BSD `sed` has no `\b`.** A whole-file rename loop using `\bM24\b` was a
  silent no-op; the Python sweep was the one that ran. Use `[[:<:]]` or a
  script.
- The cap measures `string.length`, not bytes, and says so; the name keeps
  "bytes" because that is the budget it stands in for.

## Evidence

- `npm run verify`: every suite green in the run of 2026-09-01 except
  `verify:panels` 144b (the fixture dependency above); `verify:panels`
  re-run green after the 144b fixture fix, with no source change between the
  two runs.
- New checks, each watched red first: `verify:xterm` `unicode.1`
  (`activeVersion: "6", cursorX: 1` → `"11", 2`), `verify:pty-manager`
  `backpressure.1` (largest payload 55,900 chars, no marker → 4,141, four
  markers), `verify:panels` `memo-stable.1` (both inline → both identifiers),
  `verify:jira` `types.1` (three redeclared → none).
