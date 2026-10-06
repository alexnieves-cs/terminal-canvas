# Redesign decisions (D1–D8)

Locked by the owner before any lane starts. These are the guide's recommended
defaults from GUIDE.pdf §2.3, accepted exactly. Every lane brief points here.
A later change is a new decision in this file, not a silent edit in a lane.

The code still behaves as 5.0 until the lane named below lands. Recording a
decision is not implementing it.

## D1 — Cyan selection vs. cyan working

Conflict: M63/M279 rule is "selection is cyan; work is blue." The concept makes
cyan both the accent and the working state, and draws selection as a 2px cyan ring.

**Accepted default.** Accept cyan for working. Selection becomes a 2px ring + 6px
halo in `--fg`-tinted cyan at higher luminance (`#A6F6FF`) plus the inspector
binding, so a selected working panel still reads as two facts. Record the rule
change in the ledger and in `docs/product-rules.md` when F1 lands the ring.
Phase 0 does not edit product-rules: the rule on disk still describes today's
pixels, and F1 changes the rule in the same commit as the pixels.

## D2 — Nav

Conflict: Today the center control is Canvas | Orchestrate | People. The concept
is Canvas | Sessions | Review. The Orchestration view (M268) is kept.

**Accepted default.** The center control becomes Canvas | Sessions | Review.
Orchestrate moves to the View menu, the palette ("Show Orchestrate") and a
Sessions header link. People stays conditional. World stays a lens inside
Canvas, not a tab.

## D3 — Metrics rule vs. mockups

Conflict: The Sessions table shows Run and Cost columns. The title bar in the
mockups shows "7 sessions · $3.12 today". The inspector shows usage (allowed).

**Accepted default.** Sessions is a triage view at the inspector/deep-detail
density layers, so its columns are allowed. Amend `metrics.1` to scope to canvas
surfaces when L-D lands. Drop "$3.12 today" from the title bar and keep
"7 sessions". The spend total lives in the Sessions header.

## D4 — ⌘K clash

Conflict: Claude Code's TUI (and macOS terminals) use ⌘K to clear the screen.
The canvas palette is also ⌘K.

**Accepted default.** The canvas owns ⌘K unless the focused panel is in focus
lock (⌘⇧L), in which case every key goes to the terminal. This is shown in
mockup 08.

## D5 — Chord migrations

Conflict: Tidy is ⌘⌥T today and ⌘⇧T in the concept. New chords: ⌘1/2/3, ⌘0,
⌘⇧0, ⌘G, ⌘Y, ⌘., ⌘L, ⌘⇧S, ⌘⇧W, ⌘⇧L, ⌘⇧J.

**Accepted default.** Keep the old chord as a hidden alias for one release.
Every new chord is registered in `src/shared/shortcuts.ts`, and a check fails
on duplicates. F3 creates that registry. Phase 0 does not add the module.

## D6 — World in production

Conflict: A TopBar comment says the toggle is dev-only. `src/renderer/CLAUDE.md`
says Canvas mounts the World in production since M427.

**Accepted default.** Ship it on by default with the WebGL probe and the flat
fallback. Verify in a packaged build (`verify:packaged`) before release. The
flat fallback is not a separate `WorldFlat.tsx` today; it is the no-WebGL note
inside `WorldStage` / `WorldView` (see the W6 brief).

## D7 — Tone remap side effects

Conflict: Watcher "passed", work "done" and auto "done" map to `idle` (green) today.

**Accepted default.** Move "finished OK" facts to the `done` tone (green).
`idle` becomes slate. Words stay the same. Only tones move. F1 applies this
inside `panel-state.ts` only.

## D8 — Version

**Accepted default.** Ship as 6.0.0 (the visual language changes) with a
migration note on chords. The bump is Phase 5 (M456), not this change.
`package.json` stays `5.0.0` until that release.
