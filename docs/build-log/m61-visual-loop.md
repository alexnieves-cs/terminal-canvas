# M61 — The visual loop, and three post-1.0 defects

**Status:** finished 2026-09-02.
**Branch:** `m61-visual-loop`. **Spec:** `docs/superpowers/specs/2026-09-02-m61-visual-loop-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m61-visual-loop.md`.

One line: `npm run shot` paints 23 scenes of the real renderer and a manifest of intents; the
images were looked at and a fresh-context critic reported on them; the exit-flush race, the
mouse-only group buttons and the stale milestone table are fixed with checks, and the first
render caught a fourth defect the suites could not see.

## What landed

- `scripts/shot.cjs` grown from a five-image spike into a scene harness: a seeded fixture
  canvas (every panel kind, a real git repository with a modified file behind the review node,
  a dormant panel with a pre-written scrollback log so search has a hit, two live terminals in
  one repository for the subagent notice, a group, a bookmark, a second workspace), 23 scenes
  each driven through a user's own route (chords, clicks on real controls, palette "go to" and
  bookmark rows for the camera), `manifest.json` with an intent per scene. `npm run shot`.
- `pty-manager.ts`: `flush()` refuses a session the map no longer holds. Both doors closed
  (onExit's flush, and a flush timer armed by a read that landed after `kill()`).
  `verify:pty-manager exit-flush.1`, red first (one stale send, one stale append).
- `GroupLayer.tsx`: both buttons through `shellControl()` plus `stopPropagation` so a press
  does not start the header drag. Palette rows `group.toggle` / `group.remove` on the captured
  panel's group, `REASON_NOT_IN_GROUP`. `verify:palette group-rows.1`, `verify:rail
  group-keys.2` (text scan for a mousedown-only button), `verify:panels group-keys.1` (a
  dispatched click cards the live member and nothing is closed) — each red first.
- `README.md` milestone table: M36–M60 rows from the build logs; `verify:meta milestones.1`
  pins build logs ↔ rows in both directions.
- The subagent attribution notice framed like its sibling nodes, wrapping inside 200px.
- **Found by the first render:** the context pane's three tabs all painted the same body
  (`.context__panel { display: block }` beat `[hidden]`). One reset line; `verify:styles
  hidden.1`. Two milestones (M46, M59) walked this surface without seeing it.

## Harness lessons (worth more than the images)

- **Camera moves go through the palette, not synthetic drags.** A middle-drag pan built from
  dispatched mouse events lands approximately; the "Go to panel" and bookmark rows land
  exactly, and are what a user does. Reduced motion is forced on through the harness override
  `verify:panels` already uses, so a flight is one frame.
- **Escape in a palette scope is two-stage** (pop the scope, then close). A single Escape left
  the search scope open over the next three scenes.
- **A bell rung by the focused panel is acknowledged instantly.** Focus a different panel
  before ringing, or attention shows "nothing waiting" beside an amber rail dot.
- **A Python edit script turns `'\\r'` into a real carriage return** and `'\r'` into a BEL
  when it round-trips through a heredoc. Write control bytes as `String.fromCharCode`.
- The fixture layout has to fit the canvas the window actually leaves: at 1440×900 with the
  navigator open it is roughly 1130×790 world units at scale 1.

## The critic

A fresh-context sub-agent given the 23 PNGs and the manifest intents, nothing else. It
returned 56 findings. Every one is decided here; "scheduled" means it is an input to the
design brief and scope decision that follow M61, where it is assigned a milestone or cut
with a reason. Nothing beyond the two fixes named in the spec was fixed inside M61 — scope
discipline: this milestone builds the loop, it does not redesign the app.

**Accepted and fixed in M61**

- The subagent notice read as a rendering error (the brief's own example) — framed.
- The context pane's tabs all painted the same body — the `[hidden]` reset; the critic did not
  see this one because the final render already had the fix.

**Accepted and scheduled** (the critic's numbering)

- 1, 21 — the compact drawer is a floating slab that cuts panels and the status strip.
- 2 — the note's Save button sits over its body text.
- 3 — at 22% live panels shrink rather than summarise; semantic zoom covers cards only.
  Scheduled as a design question, not a defect: the live tier is deliberately untouched by
  card detail, and whether a live panel should demote to a summary at far zoom is the
  "overview" question the brief's minimap and zoom-independent-chrome entries circle.
- 4 — the merged view has no visible read-only marker and lane labels are illegible.
- 5 — `dormant` in the navigator and `idle` on the same panel's pill: two vocabularies.
- 6 — the pinned action bar renders Restart as a tall column and orphans Close.
- 7 — the palette's first row hides under the section header after a query.
- 9, 10, 11, 12 — search hits and Go-to rows lead with the cwd path, the empty state does not
  name the term, fuzzy highlights scatter over paths. These are "finding a panel", one of
  the three things the author asked to feel better; scheduled together.
- 13 — teal (selection, palette) and blue (focus ring, group, Jira) both act as accents. The
  distinction is deliberate (selected is not focused) but nothing says so; the design brief
  must state the colour rule or collapse it.
- 14 — "click to start" at 32px is the loudest text in the app.
- 16 — the attention popover floats off its anchor with no visible jump verb.
- 17 — dark-theme frames are indistinguishable from the well.
- 19, 30 — launcher: the disabled tile wraps taller than its row; the hint line duplicates
  the strip below it.
- 22, 23, 24 — Work shows only Changes and Tools only commands; Run and Cost do not say
  "nothing to show"; Detail repeats the pid and pairs COMMAND with ASKED FOR unexplained.
  22 and 23 are three-state-rule violations and would have been M59's to find.
- 25 — the Jira panel with no credential is a dead end: a sentence, no verb. Also M59's.
- 26, 27, 28 — toolbox title is a temp path; the Files pane does not say what it is rooted
  on; the Workspaces pane has no rename/delete/merged door.
- 29, 32, 33 — the notice has no relationship line to its panels; the group's remove `×`
  is the panel close glyph; discard and commit have no shared treatment.
- 34–42 — nine unlabelled affordances (the merge button, the attention edge pip, the
  status strip's focused-panel name, dock active state, the kind dot, the wake triangle,
  the file panel's edit toggle state, the fit icon, the context toggle). Scheduled as one
  "every control says what it is" milestone; 37 (dock pressed state too faint) and 34 (merge
  button shares the Workspaces glyph) are the two that cost a daily user the most.
- 43–48 — the generic-ness findings (resting shadows on every panel, a stock onboarding
  modal, proportional chrome over a monospace product, a whiteboard dot grid, a stock ⌘K
  component, one slot for pid/state/kind). These are the design brief's raw material and
  are answered there rather than here.

**Rejected, with the reason**

- 8 (a scrim behind the palette) — the canvas is what the palette's rows act on; dimming it
  hides the panel the user is about to go to. The notice poking out is finding 29's, not a
  scrim's.
- 15 (a carded group looks unchanged) — the fixture's members were already dormant, so the
  collapse had nothing live to card; the check `group-keys.1` proves the live case. The
  critic's alternative (fold members to chrome rows) is a real design option and is carried
  into the brief as a question, not as a defect.
- 18 (the amber "no tmux" strip is permanent) — it is permanent only on the harness's direct
  backend; with tmux installed it does not render. It stays amber because a user without
  tmux loses sessions on reload and should keep seeing that. Colour reconsidered in the brief.
- 20 (the review node's amber line differs between shots) — timing: `kinds` was captured
  before the twin's first live tick made the repository shared. A real state, not a render
  inconsistency.
- 31 (hint strip content changes without a rule) — the rule exists: a hint fades once its
  gesture has been used and stays faded (M48). The critic's point that the rule is invisible
  is fair and goes to the brief as copy, not as a defect.

**Kept, as the critic said** — 49–56: named disabled reasons, the environment line, the
dormant tail, the navigator row shape, the honest status strip, the review table, the dark
well, the group header's shape.

## The verifier

A fresh-context sub-agent given the spec and the diff, and allowed to run the plain-node
suites. Every promise confirmed delivered. Nine risks raised; six acted on in a follow-up
commit on the next branch, three declined:

- **Acted on.** `exit-flush.1` could pass on an ungated tree if the trap never fired — it
  now carries a control case (the same trap on a natural exit must deliver its marker,
  which also pins flush-before-announce). `hidden.1` was a hand list of two classes — it now
  derives the toggled classes from the renderer's JSX, and its first run flagged
  `aria-hidden` as a false positive, fixed with a lookbehind. `group-keys.2` now also
  requires the wrapper to be built on `shellControl`. The `group-collapsed` scene wakes a
  member first so carding changes pixels. The two palette actions refuse in the merged view
  at the action, as `beginCreateGroup` does. The flush gate's comment states that a
  detached session is gated on purpose. `PaletteContext.groups` is typed as `CanvasGroup`.
- **Declined.** A `<button onPointerDown>` would slip past `group-keys.2` — true, and the
  repo has no pointer-event buttons; widening the scan is cheap when one appears. The
  `removed` assertion counting `.panel[data-panel-id]` is brittle if a non-panel ever
  carries that attribute — none does. The M61 README row was not in the spec — the pin's
  second direction requires it once the build log exists.

## What M61 leaves for the next document

The three things the author touches most — starting a panel, finding a panel, seeing what
every agent is doing — each have critic findings against them (44 and 30; 9–12; 5, 14, 16,
38 and 48). That is the argument the scope decision starts from.
