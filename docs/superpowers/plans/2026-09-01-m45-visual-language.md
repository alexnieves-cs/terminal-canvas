# M45 — The visual language: implementation plan

Spec: `../specs/2026-09-01-m45-visual-language-design.md`. Nine tasks. The
stylesheet is 3,300 lines and every task below either adds a check the old
stylesheet fails or changes rules under checks that must stay green; the
order puts the measuring instrument first.

## Task 1 — The instrument (`verify:styles`)

1. Widen check 11 to iterate `[data-theme]` blocks separately and measure
   each; add the non-text 3:1 rule for the five accents on `--s-1` and
   `--s-4`. Against today's single block it stays green (one block).
2. `theme.1`: every `[data-theme="light"]` token is declared in
   `[data-theme="dark"]` and vice versa. RED (no light block).
3. `theme.2`: bare `:root` declares the light block's colours. RED.
4. `icons.1`: source-text scan of `src/renderer/**/*.tsx` — no button whose
   text content is one of the inventory glyphs. RED (fourteen sites).
5. `font.1`: no `@font-face` in the stylesheet, no `font-src` in
   `index.html`. RED.
6. Check 8's regex widens to every token declared on bare `:root`.

## Task 2 — Tokens and both blocks

Rewrite the token layer: the structural block (space, radius, type,
motion), then `:root` + `[data-theme="light"]` and `[data-theme="dark"]`
with the spec's set, values iterated against the widened check 11 until
both blocks clear every ratio. Delete the retired tokens and every rule
that used them (`--in-*`, `--well-inset`, `--sheen`, `--bevel-*`,
`--press-inset`, `--glass-*`, `--sh-*`, `--t-3xl`, `--t-4xl`,
`--lh-display`, `--r-xl`, `--r-2xl`, `--sp-9`, `--font-display`). Poppins:
delete the face, the woff2, the OFL, the `font-src`. Grep every use before
each deletion; check 2 (every `var()` declared) is the safety net.

## Task 3 — The enum setting (`verify:layout`, `verify:palette`)

`theme.1` in both suites RED, then `'enum'` on `SettingDef` with `values`,
`parsePreferences`' new arm, `appearance.theme`, the palette's cycle row,
`menu.ts`'s radio submenu.

## Task 4 — The switch and the terminal (`verify:registry`, `verify:panels`)

`verify:registry` `theme.1` RED, then `terminal/themes.ts`,
`create-terminal.ts` taking a theme, `useTheme.ts` (stamp + `matchMedia`),
and the fan-out through `applyTerminalOptions` with a `refresh` on attached
terminals. `verify:panels` `theme.1` RED then green after the build.

## Task 5 — Icons (`verify:styles` `icons.1` green)

`renderer/icons.tsx`, then every glyph site: rail rows, top bar, file
tree, inspector, the five panel kinds' chrome, the group layer, the
diagnostics overlay, the link badge stays SVG as it is.

## Task 6 — Targets and reveals (`verify:panels` `targets.1`, `reveal.1`)

Both RED against the old sizes, then `.icon-button`, the 28px row, the
reveal rules with `:focus-within`, the always-visible start control.

## Task 7 — The rest of the stylesheet

Component by component, in file order: shell, rail, inspector, tree,
canvas, HUD, panel chrome, card, the four non-terminal kinds, palette,
nav grid, diagnostics overlay, banners, links, ports, groups. Each pass:
replace shadow-boundaries with `--line`, hover/selection with `--s-4`/
`--s-5`, sizes with the scale, display faces with the UI face. `npm run
verify:styles` after each; `scripts/shot.cjs` screenshots at the end of the
pass in both themes for the eye.

## Task 8 — Chips and mono values

`kbd` chips on the two top-bar buttons; `.inspector__value--mono` on
command, asked-for, cwd, live cwd, worktree path, pid. `verify:rail` is
unaffected (it asserts on the model); confirm by grep.

## Task 9 — Close

`docs/load-bearing.md` (the two-block rule and the measuring instrument;
why the boundary is a line; the enum's customer; the terminal theme rides
the fan-out), `CLAUDE.md`'s architecture list, `docs/ui-followup-work.md`
marked done item by item, backlog #10 → gone, README screenshots
(none exist — a note that the app is best judged running), suite counts,
build log, `npm run verify`, merge.
