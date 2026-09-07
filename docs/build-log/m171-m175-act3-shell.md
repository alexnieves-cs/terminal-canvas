# v8 Act III — the shell (M171–M175): build log

Branch `m171-shell`, 2026-09-07, from `main` at Act II's merge. Spec:
`docs/superpowers/specs/2026-09-07-v8-act3-shell-design.md`. Plan:
`docs/superpowers/plans/2026-09-07-v8-act3-shell.md`. Ledger:
`docs/build-log/m161-m179-ledger.md`.

## M171 — the rail as places

`railGroups` folds the Panels list into six places with counts; every row leads with its
kind's glyph in a soft tint; the state is a dot with the word on the row's title (the tail
keeps the word, clipped, for the checks); `start` reveals on hover; the selected row is a
pill. `reveal.1` was rewritten to the rest rule and watched red; shell 83's `.rail-row__dot`
read taught the rule again — the new dot keeps the old alias.

## M172 — the dock and top bar

A dock button's name is a tag revealed on hover or keyboard focus; the current place is a
filled pill; the live/quiet capsules left the dock (the metrics rule — the rail's `Agents ·
N` heading carries the count); the search reads as a field.

## M173 — the status bar at rest says nothing

The HUD is a floating pill with the zoom controls and the update notice; the hint strip is
gone and its gestures are the rail's empty-state sentences (`canvas/hints.ts`); the tmux
notice is a dismissible first-run banner in the launcher. `firstrun.3` reads the empty
state now; `firstrun.4` reads the banner.

## M174 — the launcher as a welcome

The wordmark in the UI face, the doors as cards, a recents row, the verbs with mono on the
command alone, the environment line one sentence.

## M175 — palette and sheets

The palette's state as a dot; `material.1` pins what the surfaces already were (the UI
face, mono only on paths and `--mono` inputs, caps headings).

## Goldens

(the critic's walk and the sentences are in the ledger)

## Reviews

(filled once the fresh-context critic and verifier have run over the act)
