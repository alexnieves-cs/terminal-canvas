# M45 — The visual language

**Status:** finished 2026-09-02.
**Branch:** `m45-visual`. **Spec:** `docs/superpowers/specs/2026-09-01-m45-visual-language-design.md`.

One line: a quiet instrument — flat surfaces, hairline boundaries, elevation that is only
elevation, one accent, two themes from one token set, and the terminal follows the theme.

## What landed

- `verify:styles` widened first (the instrument before the paint): 11 measures each theme
  block separately plus the non-text 3:1 rule; `theme.1` (same token set in both blocks),
  `theme.2` (bare `:root` = light), `icons.1` (no glyph as a control's text), `font.1` (no
  `@font-face`, no `font-src`); 8 defines "structural" as "declared on bare `:root`".
- The stylesheet rewritten (3,359 → ~2,800 lines): tokens on a 1.2 type scale 11–24, eight
  space steps, three radii; a light block and a dark block; Poppins, its woff2, its OFL and
  the CSP allowance gone; every `--in-*`/`--sh-*`/`--glass-*`/`--sheen`/`--bevel-*` rule gone.
- `appearance.theme`, the schema's first enum (system|light|dark), refused outside its
  values on BOTH doors; a palette cycle row; an Appearance radio submenu; `settings:changed`
  (main → renderer) so the menu's write applies at once.
- `terminal/themes.ts` (dark = the old palette; light re-tuned), `useTheme.ts` (stamps
  `data-theme`, follows `prefers-color-scheme` for `system`), the fan-out through
  `applyTerminalOptions` with a `refresh` on opened terminals.
- `icons.tsx`: fifteen inline SVGs; every glyph site (14 files) replaced; `.icon-button` 24×24;
  rail rows 28px with rename/close revealed on `:hover`/`:focus-within` and start always
  visible; `kbd` chips on New panel and Search; mono inspector values by field key.
- Checks: `verify:layout theme.1`, `verify:palette theme.1`, `verify:registry theme.1`
  (fault-injected: a live-only fan-out turns it red), `verify:panels theme.1/targets.1/reveal.1`.

## Decisions taken beyond the spec, in writing

- **`settings:changed` is a new main → renderer event.** The spec gave the menu a radio group
  and said nothing about how the renderer hears it; today the renderer re-reads settings only
  when the palette opens, which is fine for Restore's boot-only checkboxes and wrong for a theme.
  Both diagrams updated; `verify:ipc`'s invoke count is unmoved.
- **`--track-display` went with the display sizes** it existed for; `--track-tight` and
  `--track-caps` stay. `--font-ui` was added on bare `:root` so `body` and the two prose
  surfaces name one stack.
- **Debt, recorded:** the `--text`/`--muted`/`--bg`/`--panel-bg`/`--chrome-bg`/`--border`
  aliases survive one more milestone (M46/M47 retire them with the frame).
- `verify:styles` 1's ALLOW list still names the two translucent whites from M10; neither has
  a user now. Left for the next styles pass rather than churned here.

## Snags

- `verify:palette theme.1`'s first cut called `.run()` on a row that did not exist yet and
  THREW — aborting the suite and printing nothing. Guarded (`if (row) row.run()`) so a missing
  row is a red line, the rule `docs/verify-suites.md` states first.
- `verify:panels reveal.1` read computed opacity in the same tick as `focus()` and saw `0`
  mid-transition. The check now settles past `--dur-1` before reading.
- The registry's `theme.1` was green on arrival (M44's fan-out already covers a detached
  session), so it was fault-injected — a live-only walk — and watched go red with `keyboard.1`.

## Verify-chain note

`npm run verify` went red twice before going green, with different failures each time
(verify:panels 112/144 once, then the 300s watchdog), while the same suite passed 219/219
standalone three times in ~170s. The cause was a tmux server left alive on the
`terminal-canvas-verify-panels` socket by an earlier killed run, competing with the next one;
`tmux -L terminal-canvas-verify-panels kill-server` before re-running is the fix. Recorded here
rather than in load-bearing because it is the harness's hygiene, not the app's.

## Not proven by any suite

- How it LOOKS. `scripts/shot.cjs` paints the real renderer; the eye is the check.
- The light ANSI palette against a real agent TUI (Claude Code's status glyphs, box drawing on
  white). Manual-only, once.
- The `system` arm following a live macOS appearance change without a relaunch: `matchMedia`
  `change` is wired; no suite flips the OS.
