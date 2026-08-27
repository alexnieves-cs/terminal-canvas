# M6p: Palette Structure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Cmd+K` a reading order — visible sections that survive searching,
a resting list of roughly eight rows instead of seventeen, highlighted matches,
gated deletes, and a footer that teaches the keys — so that M6b has somewhere to
put a row per setting.

**Architecture:** Renderer-only. Sections become ordered *data* (`SECTIONS`) in
the pure `palette-model.ts` tier rather than a closed union, so a new section is
one object literal. `filterCommands` sorts section-first; a new pure
`bestMatchIndex` keeps `Enter` pointed at the best match anyway. `Command` grows
five optional fields (`searchText`, `shortcut`, `destructive`, `hiddenAtRest`,
`scope`), each present-means-something in the idiom `disabledReason` set. The
scope drill-in and the confirm step are view state and `InputMode` respectively
— no new IPC channel, no schema change, no modal.

**Tech Stack:** TypeScript, React 18 (no StrictMode), Electron, esbuild-bundled
plain-node verify suites.

**Spec:** `docs/superpowers/specs/2026-08-26-m6p-palette-structure-design.md`

## Baselines (re-derived by running the suites at `2443ae3`)

**`verify:palette` 33 · `verify:panels` 51.** Both existing docs were wrong in
opposite directions — CLAUDE.md's table said palette 32, and M6b's plan said
panels 48. New checks continue from 34 and 52. Re-derive rather than trust this
line if any time has passed; that caution is CLAUDE.md's own, about the
`registry.dispose` call-site count.

## Global Constraints

Each fails **silently** if broken.

- **Present-means-something.** Every new `Command` field is optional and its
  *presence* carries the meaning, exactly as `disabledReason` does. Never write
  `hiddenAtRest: false` or `shortcut: undefined` — build the object field by
  field, the rule M5a's absent-`command` note states four times over.
- **Hidden at rest is not hidden from search.** A row dropped at empty query
  MUST return under a query. `verify:palette` check 31's comment is the rule: a
  row that disappears is indistinguishable from a feature that is missing.
- **`verify:panels` 39 is not to be disturbed.** It finds its row by the literal
  `Go to`, then recomputes `centreOn`'s arithmetic to assert *where* the camera
  landed. `Go to <label>` keeps its title.
- **The four focus rules survive.** `usePalette`'s open/capture/stand-down/restore
  contract is untouched. Escape's new two-stage behaviour lives in
  `Palette.tsx`'s `onKeyDown`, not in the hook — the hook's `Cmd+K` listener is
  on `window` and must keep its empty dep array.
- **`Palette.tsx` closes BEFORE running a row's command.** Any action that puts
  the palette into an input mode must re-open it in the same batch, as
  `beginRenamePreset` already does.
- **No `onWheel` in `Palette.tsx`.** Scrolling is a *yield* decided upstream in
  `shouldYieldWheel` rule 1; a bubble handler here runs after the ancestor's
  capture listener has already cancelled the event.
- **Comments explain *why*.** Match the surrounding density.
- **Commits:** `feat(m6p):` / `fix(m6p):` / `docs(m6p):`.
- **`npm run verify` green before any task is called done.**

---

### Task 0: Spec and plan — DONE

- [x] Spec written to `docs/superpowers/specs/2026-08-26-m6p-palette-structure-design.md`
- [x] This plan written
- [x] Baselines re-derived by running `verify:palette` (33) and `verify:panels` (51)

### Task 1: The pure layer

**Files:** modify `src/renderer/palette/palette-model.ts`; test `scripts/verify-palette.cjs`

**Produces:** `SectionId`, `SectionDef`, `SECTIONS`, `sectionIndex()`, widened
`Command`, section-first `filterCommands`, `bestMatchIndex`, `splitHighlight`.
Tasks 2–4 consume all of it.

- [x] Write failing checks 34–43: section-first ordering under a query;
      `bestMatchIndex` returning the best **runnable** row and `-1` when none is;
      `hiddenAtRest` dropped at empty query and restored under one;
      `searchText` in the haystack; `splitHighlight` segment boundaries and its
      empty-query case. Watch them fail.
- [x] Rewrite check 30 for the new section order.
- [x] Implement. `firstRunnable` and `stepRunnable` keep their signatures.

### Task 2: The rows

**Files:** modify `src/renderer/palette/commands.ts`; test `scripts/verify-palette.cjs`

- [x] Failing checks: the two retitles still findable via `searchText`; the four
      admin row kinds carrying `hiddenAtRest`; `destructive` on both deletes;
      `⌘N` on the default preset's spawn row only; the two `manage.*` drill-in
      rows always visible.
- [x] Implement. Checks 19–33 must still pass unchanged apart from 30.

### Task 3: The view

**Files:** modify `src/renderer/palette/Palette.tsx`

- [x] Section headers interleaved by walking the flat rows; `splitHighlight`
      spans; `<kbd>` chips; footer bar; selection seeded from `bestMatchIndex`
      for a non-empty query.

### Task 4: Scope drill-in

**Files:** modify `src/renderer/palette/Palette.tsx`

- [x] `scope` state, chip left of the input, scoped placeholder, two-stage
      Escape, `Backspace`-on-empty pop. Reset scope to `null` on close.

### Task 5: Confirm mode

**Files:** modify `src/renderer/palette/Palette.tsx`, `src/renderer/canvas/Canvas.tsx`

- [x] `InputMode.kind`; confirm rendering; `deletePreset`/`deletePrompt` become
      two-step, reusing `beginRenamePreset`'s reopen shape.

### Task 6: CSS

**Files:** modify `src/renderer/styles.css`

- [x] `.palette__section` (sticky), `__footer`, `__scope`, `__kbd`, `__hit`,
      `__row--destructive`, the selection accent bar, `scroll-margin-top` on
      `.palette__row`. Delete `.palette__group`. Keep the existing
      `#1b1d27`/`#343747` palette.

### Task 7: End-to-end checks

**Files:** modify `scripts/verify-panels.cjs`

- [x] Update three row-finder strings (`New panel from echo -v`,
      `Insert prompt: two liner` ×2) for the retitles.
- [x] Append checks 52–54: a `.palette__section` header exists in the DOM; the
      presets drill-in narrows the list and Escape restores it **without
      closing**; `Enter` on a delete row enters confirm mode and `Escape` leaves
      the preset still present in `preset.list()`.

### Task 8: Docs

**Files:** modify `CLAUDE.md`, `docs/superpowers/plans/2026-08-26-m6b-settings-schema.md`

- [x] CLAUDE.md: suite table counts (correcting palette 32 → 34+), the palette
      module map, and load-bearing notes for section-first sorting, hidden-at-rest,
      two-stage Escape, and sticky-header `scroll-margin-top`.
- [x] M6b's plan: rewrite collision note 2 (`CommandGroup` is no longer a closed
      union; `searchText` already exists), correct its stale panels baseline, and
      record M6p as its prerequisite.

---

## Verification

`npm run verify` is the gate. Then, by hand in `npm run dev` — three things no
headless check can prove:

1. **Sticky headers vs. `scrollIntoView`.** Hold `ArrowDown` through a long
   list; the selected row must never park under a header. A synthetic
   `WheelEvent` triggers no default scroll in Chromium, so no check can see this.
2. **Two-stage Escape under real key repeat.** The checks supply `repeat: true`
   by hand, proving the guard *reads* the flag — never that Chromium *sets* it
   for a real chord on macOS. Hold Escape in a scope: it must pop once, not blow
   through to closing.
3. **The wheel is still yielded.** Scroll over the taller list; the canvas must
   not pan behind it.

Screenshot the resting palette and one scoped view before calling it done.
