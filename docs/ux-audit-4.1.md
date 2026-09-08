# The 4.1 UX audit (M178)

The second full walk, after the product-polish run's Acts I–III and M176–M177, with the
brief's five rules as the lens (`docs/superpowers/specs/2026-09-07-m162-product-polish-brief.md`):
the face rule, the rest rule, the path rule, the metrics rule, words rather than codes. Every
golden under `verify/visual/goldens/` was opened — the three dark scenes (`kinds-dark`,
`palette-dark`, `zoomed-out-dark`) for the dark theme, the rest for light — by a fresh-context
critic handed the rules and nothing else, and the author read every finding against the
image. Each finding is FIXED (with the check that pins it), DECLINED (with the rule it defers
to) or OWED (with a backlog number). The method is M149's.

## 1. The walk

Twenty-six findings, in the critic's severity order, each with its disposition. The scene
names are the goldens'.

| # | Scenes | What | Rule | Disposition |
|---|---|---|---|---|
| F.1 | inspector-*, navigator-*, palette*, search*, header, flip, subagents, wide, ink, runs | The context pane's enabled Restart painted white on white: a `(0,2,1)` grid rule from M46 set its background over the primary's iris fill — a control with no name at rest, since 4.0 | rest / material | FIXED — the background left the grid rule; shell `restart.paint.1` reads the computed fill and ink on a live panel |
| F.2 | palette-query | Verb rows interpolated a titleless chat's raw cwd (`Open review of chat: /private/var/…`) | path | FIXED — the row's target label goes through the one helper (`railLabel` for a titleless chat reads the short form); the palette's `path.1` holds |
| F.3 | palette, palette-dark, palette-query | A panel row's TITLE was mono (M64's mono rows) | face | FIXED — `.palette__row--mono .palette__title` in the UI face; `.palette__title` in `face.1`'s list; the hint (the path) stays mono |
| F.4 | navigator-files | The Files heading starved the root's name to one letter | header | FIXED — the root keeps its width, the attribution gives (`verify:styles tree.1`; the critic's second walk caught the first fix at `R…` — a 3ch floor IS `R…`) |
| F.5 | kinds, kinds-dark, board, chat-copilot; palette*, spawn-sheet | `…/tc shot fixtures golden/repo` where the rule's answer is `repo` | path | OWED — backlog #86 (a root on the file, toolbox and panel-row models) |
| F.6 | inspector-detail | Detail's CWD showed the short form, so the full path had no visible home | path | FIXED — Detail prints the full path, wrapped |
| F.7 | palette*, navigator-workspaces, header, flip, search, auto, lineup | Bare dashes in run facts and the lineup preview | words | OWED — backlog #88 (the run row's facts as data with no empty segment; the lineup preview's sentence) |
| F.8 | watcher, reduced-motion, group | The group frame's `card` / `remove` verbs visible at rest | rest | FIXED — they rest at 0 and reveal on the frame's hover / focus-within |
| F.9 | kinds, vault, board, teammate, inspector-tools, wide | Header and row meta clipped mid-word | header / words | OWED — backlog #88 (meta drops whole; the teammate row's `svc` becomes a word) |
| F.10 | tool-objects, auto, chat | Git's four header lines under a card header that already says the file | the diff card | FIXED — the hunk starts at the first `@@` (`meta` lines dropped) |
| F.11 | teammate, routine | Caps sentences as headings | words / face | FIXED — a label and a note beneath in the UI face |
| F.12 | workflow, wide | Block kinds as caps with a hyphen (`POOL - 6 AT A TIME`) | words / face | OWED — backlog #88 (the diagram's meta in sentence case, `·` not `-`) |
| F.13 | github, templates, supervisor, graph | `ISSUE · OPEN` as caps mono where Codex's row is a state word | register | OWED — backlog #88 (a state pill beside the mono key) |
| F.14 | every rail scene, supervisor | Raw backticks in UI sentences | words | FIXED — `lastLineOf` strips inline fences (`lastline.2`); the sheet's supervisor preview is #88's |
| F.15 | skills | `no bundled files` / `placed` in mono; a wrapped name drops its `⋯` | face / layout | FIXED (the face) — the facts line AND the resources sentence in the UI face (`face.1`; the critic's second walk caught the resources line still mono); the `⋯` wrap OWED (#88) |
| F.16 | teammate, routine | A place's path read right-to-left with the ellipsis at the wrong end | path | FIXED — `direction: ltr` on the short form; the full path on the title |
| F.17 | composer, tool-objects, approval, auto | `1 turns` | words | OWED — backlog #88 (the label is built in `inspector-fields.ts`; one pluralisation with its check) |
| F.18 | compact | The context drawer starts below the canvas top | posture | OWED — verify first (backlog #88 names the check) |
| F.19 | group, reduced-motion, browser | An asleep card with no tail was a blank body over `click to start` | words | FIXED — `asleep — nothing recorded before the last quit` above the verb |
| F.20 | wide, workflow, reduced-motion | The off-canvas attention tag lands on panel content | overlap | OWED — backlog #88 (M43's indicator inset avoids a frame's chrome) |
| F.21 | every scene | Live values (a run's duration, pids, ports) inside the budgets | harness | OWED — backlog #88 (the fixture's run gets an `endedAt`; the clock frozen) |
| F.22 | kinds, vault, browser | A file header's `95 B · 4 lines` at rest | rest | DECLINED under the REST rule (the Act IV critic's correction — this is a rest finding, not a metrics one): the header at rest is glyph · title · state, and `95 B · 4 lines` is the file's size beside its name, which the brief's own footnote keeps as an identity fact; the clip is F.9 |
| F.23 | browser | The address three times on one panel | density | DECLINED under the REST rule and the PATH rule's readout clause (the Act IV critic: a scene's intent is not a rule): the title is the page's name, the readout beside it is the guest's LIVE url (`data-browser-url`, set from `getURL()` and nothing a page can write — the M103 provenance surface, an identity fact), and the bar is the one editable field; one of the three is the address as identity, one as provenance, one as a control, and collapsing any two loses a fact |
| F.24 | chat, kinds | The collapsed `2 tools` row is a count where the brief's row is glyph · verb · target · state | register | OWED — backlog #88 (`2 tools · Read, Edit · server.ts` as the summary) |
| F.25 | kinds, vault, auto | The minimap overlays a panel's chrome | overlay | DECLINED — an HUD overlay by M58; the fixture places a panel under it |
| F.26 | inspector-*, navigator-*, search*, header | Two live terminals show an empty well in some scenes | harness | OWED — backlog #88 (the fixture PTY gets a tail so no golden reads as a blank body) |

The M176 scale arrival (the brief's "scale from 0.98") is DECLINED by the audit's own run:
a scale on `.pf__motion`, an ancestor of `.pf__body`, broke the annotation stage (product
`annot.1`); the arrival is a rise, and `motion.2` pins that.


## 2. What reads right against the register

The critic's own paragraph, kept whole: the rail is a place, not a process list — grouped by
what a row is, a glyph in a soft tint, a dot for state, the last line beneath a chat, the
selected row a filled pill; the dock is icons with the current place filled and the
attention badge alone. The chat is a conversation: the user's turn a soft bubble, the
assistant's prose at the measure with inline code, `thought` and tool rows quiet, the
composer a rounded well with one filled Send that fills only when there is something to
send. The launcher is words. Empty states say what and offer one verb everywhere the walk
looked. The status bar is gone; a zoom pill sits where it should. The review card's washes,
the far view, the header discipline, the spawn sheet's preview sentences, the integrations
page, the browser's icon nav, and the dark theme's aura and lifted glass all match the
brief. Nothing anywhere recites CPU or RAM outside `MACHINE` in Detail.

## 2b. Scene intents rewritten

Twelve intents in `scripts/shot.cjs` described the 4.0 shape or a state the scene no longer
frames (workflow's Run "disabled"; kinds' Jira panel; across's context pane; runs' run
frame; graph's edge label; approval's chat card; board's dashed edges; trail's tether side;
skills' provenance line; merged's lanes; zoomed-out's legible titles; inspector-detail's
live well). Each is rewritten to what the golden shows; the board's dashed drop edge is
checked in M178's wave (present in the CSS; the golden's columns are not droppable at rest —
the affordance shows on drag, recorded).


## 3. What the walk could not see

The hover states (the rest rule's reveal, the dock's tags, the timestamps) — no golden holds a
pointer; the checks `rest.1`, `reveal.1`, `dock.1` and the styles rules carry them. The
arrival animation and the pulse — a capture settles first. The 100 % density — manual-only
since M149.
