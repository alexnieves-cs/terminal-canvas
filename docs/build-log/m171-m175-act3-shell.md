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

55 scenes changed after M171–M173; a fresh-context critic walked every diff. Its one
defect: the tail clip had hidden a workspace's counts, a teammate's facts and the dock
badge's word — scoped to the Panels list. Nine goldens that predate Act I carried Acts I–II's
sub-budget drift and are sentenced with it named. The sentences are in the ledger.

## Reviews

Both ran over the act's diff, the brief, the spec, the ledger and the logs; the findings and
the evidence are in the ledger.

**Critic — FIX-FIRST, 0 Critical, 5 Major, 12 Minor.** The Majors: `Canvas` still
subscribed to the machine-cost total for a readout M173 had deleted — a 2 s re-render of the
whole component feeding nothing (gone, with six dead HUD props; the mousemove `cursor` state
of the same shape is backlog #87); the launcher's mono chip read `login` for the shell
preset (the row carries `command?` now); the verb list printed an absolute cwd (the path
rule); the evidence lines; a recents chip that opened the sheet on another folder (the door
takes `seed.cwd`). The Minors, each landed or recorded: a comment that contradicted the
M171 rule; `data-agent-state` on terminal rows alone; real list semantics for the headings;
a `hintsLoaded` state; one hint list for both surfaces; an unrecorded pointer-events fix on
the update notice (its check owed to M178); the fallback group by id; the palette's path
column through the one helper.

**Verifier — 25 claims: 19 SUPPORTED, 4 OVERCLAIMED, 1 UNSUPPORTED, 1 in progress.** The
overclaims were tallies quoted from the working tree rather than the commits, a scene count
off by one, and the WHERE field owed with no disposition (declined now, with its reason);
the unsupported claim was `hints.1`'s red on a stub that was never committed. Each is
corrected in the ledger.
