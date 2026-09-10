# M245 — the `sheet` object (CSV first, xlsx through SheetJS)

Spec: `docs/superpowers/specs/2026-09-10-m245-sheet.md`.
Plan: `docs/superpowers/plans/2026-09-10-m245-sheet.md`.
Branch `m245-sheet`, worktree `.claude/worktrees/m245-sheet`, cut from local `main` at 7a3323d0.

## Evidence
- **Watched failing:** `verify:sheet` 1/42 against the absent modules (only the empty-window
  check passed, vacuously), before any module existed.
- **Green:** `verify:sheet` 43/43; `verify:checklist` 16/16 and `verify:file` 97/97 unchanged
  after `file-read`/`file-write`/`file-watch`/`portable` gained the base64 arm; `verify:verbs`
  25/25 with `sheet` in `creation.registry.1` and `sheet-edit`'s four doors; `verify:ipc` 1/1;
  `npm run typecheck` exit 0.
- **The alias question, settled by deleting it and building (CLAUDE.md):** NEEDED. Without it
  esbuild cannot resolve `@shared/file-panel` (from `main/file-read.ts`, `main/file-write.ts`)
  or `@shared/chat-panel` (from `renderer/panels/panels.ts`). `xlsx` itself needs none; the
  renderer and main bundles are unchanged (electron-vite already aliases both).
- **Dependency:** `xlsx` pinned to SheetJS's own 0.20.3 tarball, not the npm registry's 0.18.5
  (CVE-2023-30533, CVE-2024-22363). The user chose write-back with a named loss list.

## Decisions a reader would otherwise re-litigate
- A sheet is a file panel with `source.sheet`, the checklist precedent — not a panel kind.
- Formulas are stored, never values; a literal `=` is written `'=`. The grammar is closed.
- Bytes cross the bridge as an optional `encoding: 'base64'` on the existing file channels —
  no new channel, so the channel list in CLAUDE.md and the README diagram are unchanged.
- xlsx losses come from the zip entry list; a real SheetJS workbook exposing an empty list is a
  red check (`sheet.xlsx.6`), because an empty list is the silent failure.
- Row/column insert and delete are toolbar buttons (keyboard-reachable), not a context menu.
- A new xlsx is never minted; the pill creates a CSV.

## Fresh-context critic (feature-dev:code-reviewer, read-only over the uncommitted diff)
Three findings, each verified against the code and fixed; each now has a check.
1. **Critical — xlsx metadata re-keyed against the file as first OPENED.** `encode` never
   refreshed `book.workbook`, and `writeXlsx` carries comments/formats/links/merges/cols BY
   ADDRESS, so after a row/column edit they landed on other cells, silently. Fixed two ways: the
   book is re-read from every write (`sheet.xlsx.10`), and row/column insert/delete on an xlsx
   is REFUSED by name, the buttons disabled with the same reason (`sheet.xlsx.9`). Shifting
   address-keyed parts correctly is its own feature; refusing is the honest cut.
2. **Critical — dates read as raw serials**, and retyping one made it text. Date-formatted
   numbers now read as ISO text and write back as serials with their format (1904-aware), and
   date-looking TEXT is apostrophe-escaped like numbers (`sheet.xlsx.7`, `.8`). The first cut
   of the fix still failed `xlsx.7`: SheetJS leaves `z` unset without `cellNF: true`.
3. **Important — a second fast Cmd+Z/paste was dropped silently** (busy guard returned false
   with no error). Operations now QUEUE (`sheet.disk.7`: two unawaited undos both apply).
Checked clean by the critic: CSV round trip, the evaluator, `shiftFormula`, absent/malformed,
the export gate, the CAS/staleness logic, the Cmd+C/V/Z routing, the doors, the window math,
and the editor's commit-on-blur (no double commit).

Also from the D09 session's lesson: every `focus()` in SheetNode passes `preventScroll`.

## Electron tier
- `verify:panels:product` (second run, 203.7 s of 230 s — `headroom.1` green at 89%, so the NEXT
  check added to this part must re-pin `WATCHDOG_MS`): **`sheet-clip.1` and `sheet-clip.2` PASS**,
  non-vacuously — DOM focus in the sheet with `focusedId` naming the live terminal `n1`, the paste
  in the file and not the terminal, the blurred control reaching the terminal; the undo restoring
  the file with the terminal the canvas undo would have removed still present.
- **Unattributed, recorded rather than claimed:** the same run failed `browser.1`,
  `preview.bind.1` and `task.show.1`; the first run (which died at its watchdog before the sheet
  section, just after another session's Electron run ended) failed `across.1` and `browser.1`. None
  touches a sheet, and the failing set moved between runs. A baseline on untouched `main`
  (7a3323d0) to attribute them was killed by the OS for low memory (16 GB, several sessions each
  running an Electron tier). The user chose to commit M245 now; the baseline is re-run at the end
  of the run, and this entry is corrected by what it shows.
- The full `npm run verify` has therefore NOT been run green on this branch yet.
