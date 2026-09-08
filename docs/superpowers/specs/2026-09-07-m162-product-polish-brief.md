# Design brief — product polish (M162, 2026-09-07)

Amends `2026-09-05-design-brief-obsidian.md`, which amends `2026-09-02-design-brief.md`. The
critic is handed all three; where they disagree, this one is the decision. Everything not
named here stands: one state vocabulary and one hue per state, the state edge, identity before
provenance, one interface accent that is never an agent colour, every control named, three
states always, the chrome never louder than the well, plain copy, the system face, dark as
the flagship, cyan as the accent, glass over blur, one filled primary control per surface,
one resting lift on the frame.

This brief is finished when every principle below is either implemented (a milestone and a
check beside it) or struck through with a reason. The run's ledger
(`docs/build-log/m161-m179-ledger.md`) records which.

## What is wrong, in one sentence

Eight runs made the canvas trustworthy, wide and capable, and it reads as an instrument: the
material is right (Obsidian's glass, aura and lit edge are all there) and everything laid on
the material — the faces, the words, the controls at rest, the paths, the numbers — was chosen
for an engineer reading a debugger. Nothing below changes what the app can do. Every rule is
about what a surface SAYS at rest and in what voice.

## The three references, measured

Not cloned: the canvas is still an infinite canvas of panels, which none of them are. What
each one settles, with the numbers this brief adopts.

**BridgeMind One — the posture.** One native window; a rail of named DESTINATIONS (Dashboard,
Routines, Plugins, Skills) rather than a process list; a pane is a first-class object with a
soft frame, a name and a state, and the shell inside it is content; `Tidy` squares a layout;
"dock a browser on localhost or a thread beside the shell". Adopted: the dock's icons become
named places (label on hover, the current one filled); the Panels list groups by what a row
IS; a pane's frame is the same frame for every kind, and a terminal is one body a frame can
hold. Declined: modes as a top-level switch — the canvas already holds every mode at once,
and a mode switch would hide what a person arranged.

**The Claude desktop app — the conversation.** One column; the assistant's prose in the
system's proportional face at a comfortable measure; tool calls collapsed into quiet
single-line rows that expand on click; the composer a rounded well with one filled send;
status as words and soft pills; 12–16px radii; hairline borders on a slightly lifted
surface; motion only where it carries meaning. Measured and adopted:

| Property | Value | Token |
|---|---|---|
| Prose measure | 72 characters | `--measure: 72ch` (new, structural) |
| Body prose | 14px / 1.5 | `--t-base: 14px` (new, structural) · `--lh-body` |
| Reading inset | 20px | `--inset: 20px` (new, structural) |
| Frame and well radius | 12px | `--r-lg` |
| Control and card radius | 8px | `--r-md` |
| Chip radius | 5px | `--r-sm` |
| Pill | full | `--r-full` |
| User turn ground | a soft tint, one step from the panel | `--bubble` (new, both themes) |
| Composer height | 2 lines at rest, grows to 6 | Act II |

**Codex — the lists and the diffs.** Thread rows with a title, a one-line summary and a state
word; a diff as a CARD with a file header and a soft green/red wash rather than a wall of
`+`/`-`; approvals as a sentence and two buttons; a project sidebar that lists things you are
working on. Adopted: the rail row's last line (M105 already carries it) beneath the name; the
review panel's file cards (Act I, M165) with `--green-dim` / `--red-dim` washes, which already
exist; approvals as one sentence and two buttons in the composer's well (M169).

**Explicitly not the target.** iTerm. tmux status lines. Anything that looks like `htop`.
Metrics at rest. Paths at rest. Monospace anywhere a human is reading English.

## The five rules

Each rule is stated as what a check can read. Where a rule can be read mechanically, the
check is named; where it can only be looked at, the golden and the critic's sentence are the
check.

### 1. The face rule

`--font-mono` is for code, commands, paths and terminal cells. Everything a person reads as a
sentence or a name — titles, labels, rail rows, chat turns, descriptions, empty states, the
launcher, hints, notes, a teammate's brief, an annotation — is set in `--font-ui`. The body's
default is already `--font-ui` (`body { font-family: var(--font-ui) }`), so mono is always an
explicit opt-in, and the rule is a closed list of opt-ins.

- Two ramps. UI: 11px caps headings (`--t-xs`, `--track-caps`), 12px meta (`--t-sm`), 13px
  rows and controls (`--t-md`), 14px prose (`--t-base`), 15px titles (`--t-lg`), 18px sheet
  titles (`--t-xl`), 24px the wordmark (`--t-2xl`). Mono: 12px paths and facts beside prose
  (`--t-sm`), 13px code and terminal cells (`--t-md`; xterm's own metrics are untouched).
- A mono ANCESTOR is the failure mode this rule exists for: `.chat__transcript`,
  `.diagnostics-overlay`, `.panel__card` and `.subagent-ambiguous` each set mono once and
  every sentence beneath inherited it. A container never sets mono; the leaf that holds code
  does.
- **Check:** `verify:styles face.1` — a closed PROSE list of selectors (the panel title, the
  launcher's title, verbs and environment line, the chat transcript and input, the rail row's
  verbs, the memory note, a subagent's description, an annotation's label, the inspector's
  link label, an edge label, a board row's note, a skill card's note, an integration row's
  meta, the workflow diagram's words, the diagnostics sheet, every `*__empty`); a rule whose
  selector names one of them and whose body sets `var(--font-mono)` fails. Green from M162
  (the sweep is this milestone's).

### 2. The rest rule

A surface at rest shows what identifies it — a kind glyph, a name, one state (a dot, or a
word when the word IS the state). Verbs, marks and metrics appear on hover or on focus of the
surface, in `--dur-1`, and never move the layout when they do (they occupy their box at
opacity 0). A control hidden at rest stays in the tab order with its `aria-label` (M44's
reach rule), keeps its ≥ 24px box (`targets.1`), and is clickable by a script without a hover
(every `verify:panels` check that clicks a chrome verb).

| Surface | At rest | On hover / focus-within |
|---|---|---|
| Panel header | glyph · title · state dot | `⋯` · lock/pin marks · the kind's verbs · `fill` · `×` |
| Rail row | glyph · name · state dot · last line | `start` · rename · `×`; the state WORD in the row's title |
| Dock button | icon | the place's name |
| Work card | title · key · state pill · its verbs | (verbs stay: they are the card's purpose) |
| Review file card | basename · `+n −n` pills | `discard` |
| Tool row | glyph · verb · target · state pill | (click expands) |
| Status pill | zoom % | `−` `+` `fit` |

- Opacity is `0` or `1`, never fractional (`verify:styles 3`); the fade is a transition on
  opacity, and `prefers-reduced-motion` removes the transition.
- **Check:** `verify:styles rest.1` (M163) — the chrome verbs' rule sets `opacity: 0` and the
  frame's `:hover`, `:focus-within` and `.panel--selected` rules set it to `1`;
  `verify:panels reveal.1` is rewritten to the same shape for the rail's `start`.

### 3. The path rule

Show the repository's basename and the path relative to it: `repo/src/server.ts`, never
`/private/var/folders/hl/…/T/tc shot fixtures oWeOhc/repo/src/server.ts`. A path outside every
repository shows its last two segments with an ellipsis (`shortPath`, which the palette and
the chat's tool rows already use). The full absolute path lives in a `title` tooltip and in
the inspector's Detail tab, never in a panel body at rest.

- One helper decides: `displayPath(path, root)` in `shared/display-path.ts` (M164), pure,
  plain-node checked. Every `PanelFrame` body that prints a path (review, file, toolbox,
  skill, memory, work, watcher, teammates' places, the sheet's suggestions, the palette's
  rows) calls it. A second helper would differ from it exactly where nobody looks.
- **Check:** `verify:rail path.1` (M164) pins the helper's arms; `verify:panels path.1` reads
  a review body and a file body in the harness and asserts no `/private/var` or `/var/folders`
  text at rest and the full path on the `title`.

### 4. The metrics rule

CPU, RAM, tokens and dollars belong in the inspector (a `Machine` section beside `Cost`) and
the context pane's summary. No number of that kind appears in a panel header, a card at the
far tiers, the rail or the status bar. A count in a heading (`Agents · 4`) is not a metric;
it is a size.

- **Check:** `verify:styles metrics.1` (M163) — `data-machine-cost` appears in no file under
  `src/renderer` except the inspector's; `.canvas-hud` has no `__cost` rule.

### 5. Words, not codes (M127's critic, M149 F.7)

Every empty state says what the surface is for and offers one verb, in the UI face, centred,
with the kind's glyph. No state is a bare zero, a bare ellipsis or a bare dash. The
vocabulary of states stays `panel-state.ts`'s five words and nowhere else (`verify:rail
state.2`).

- **Check:** the golden and the critic's sentence, per M177's scenes — an empty state's words
  are looked at, not parsed; `verify:rail state.2` pins only the vocabulary.

## The findings — the prompt's ten and this walk's twelve

Read on 2026-09-07 from the 4.0 goldens (`verify/visual/goldens/`, 55 scenes, every one
opened). Disposition: FIX in a milestone, or DECLINE with the reason.

| # | Finding | Seen in | Disposition |
|---|---|---|---|
| 1 | Panel chrome six controls wide at rest (`⋯`, lock, pill, `CPU 0% · RAM 3 MB`, `fill`, `×`) | kinds, kinds-dark, header | FIX M163 (rest rule); the cost readout to the inspector's `Machine` section (metrics rule) |
| 2 | Raw temp paths at full width in review, file, toolbox, skill and memory bodies | kinds, board, composer | FIX M164 (path rule, `displayPath`) |
| 3 | Monospace where a human reads prose: the launcher's title, verbs and env line; `YOU`/`CLAUDE` turns; the work card's description; the rail's verbs; the hint strip | launcher, chat, board | FIX M162 (the face sweep — the CSS half, this milestone); the chat's turn shape is M167 |
| 4 | The status bar recites the machine (`100% · fit · 0, 0 · <name> · CPU · RAM · no tmux …`) | every scene | FIX M173: a floating zoom pill; the tmux notice becomes a first-run banner in the launcher and a line in the environment report |
| 5 | The hint strip is a fixed strip that explains itself | every scene | FIX M173: removed; its four hints move to the empty state and the launcher |
| 6 | The rail is a process list: `name · state · start` in one weight, every kind alike | navigator-panels | FIX M171: grouped by kind under quiet headings with counts, glyph in a soft tint, state as a dot, `start` on hover |
| 7 | The chat panel is a terminal wearing a hat: caps labels, `TOOL Read …` rows, a bare textarea with `Send` `Interrupt` | chat, composer, tool-objects | FIX M167–M169 |
| 8 | Dark panels are flat rectangles on a dark field; the glass and aura too quiet at the golden's scale | kinds-dark, zoomed-out-dark | FIX M163: `--glass-1` one clear step from `--s-0`, `--edge-light` visible, `--lift` present; re-valued tokens, no new names |
| 9 | The launcher is a card of buttons and a mono command list with an error sentence under a hairline | launcher | FIX M174 |
| 10 | The far view is boxes with words — right idea (a status wall), wrong material | zoomed-out, zoomed-out-dark, overview | FIX M166: glyph, name, state wash and nothing else; the minimap uses the same washes |
| 11 | The palette's rows are mono with raw `…/tc shot fixtures oWeOhc/repo` paths and the state word in a third column | palette, palette-dark, palette-query | FIX M175 (the UI face for titles; `displayPath` for the path column) |
| 12 | The spawn sheet's field labels are caps mono (`WHERE`, `WHAT`, `HOW`) over mono inputs | spawn-sheet, templates, lineup | FIX M175 (labels in the UI face; mono stays on the command and path inputs only) |
| 13 | The context pane's action bar is a wall of ten equal buttons | inspector-detail, chat | DECLINE the restructure: `reach.1` walks that order and M92's verbs are named there; M175 gives it the material (14px, the UI face, one filled Restart) and nothing moves |
| 14 | The trail lane's cards say `STARTING A MILESTONE` in caps and set the skill's name in mono | trail | FIX M164 (the name is a name; the phase is a sentence) |
| 15 | The subagent side notes (`SUBAGENTS 3 panels share this repository…`) are mono caps at rest | overview, header | FIX M162 (the sentence's face — done); ~~the caps heading~~ DECLINED in M164: small caps section headings are the app's idiom (the inspector's, the toolbox groups') and the note's sentence is what a person reads |
| 16 | The dock's `0 live / 0 quiet` capsules are counts at rest at the bottom of the dock | every scene | FIX M172: fold into the Agents heading's count in the rail; the dock keeps the attention badge |
| 17 | The watcher header carries five controls (pill, trigger phrase, Disarm, Run now, Stop) plus `fill` and `×` | board | FIX M163 (rest rule): the trigger phrase stays as the panel's identity; the verbs reveal |
| 18 | The work card's four verbs (`Assign to…`, `Open PR`, `Review`, `Done`) are bare buttons | board, kinds | DECLINE hiding them (they are the card's purpose); M164 restyles them as quiet chips |
| 19 | The browser pane's `Back` `Forward` `Reload` are bare word buttons over a mono address bar | teammate, browser | FIX M164: icon controls (`icons.tsx` grows by three); the address stays mono |
| 20 | The memory panel's add line is a mono select, a mono input and an `Add` button | kinds, composer | FIX M164 (the face) and M177 (the empty state) |
| 21 | The teammate pane's routine rows are three lines of facts and four buttons each | teammate | FIX M175 (material) and M177 (empty states); the four verbs stay — each is a distinct action |
| 22 | The Workspaces pane's `Run again` is filled twice (two runs, two primaries) | palette-dark, header | DECLINE: M79's rule — a run's verb is its own; `primary.1` names the site. One filled control per SURFACE; a run row is a surface |

## The material — tokens

Every value in this brief is a token. A NEW colour is declared in BOTH theme blocks
(`theme.1`); a NEW structural value is declared on bare `:root` (check 8). Names are new;
no existing name is re-spelled. Re-VALUING an existing token in one theme is allowed and is
how finding 8 is fixed.

New in M162:

| Token | Light | Dark | Where |
|---|---|---|---|
| `--bubble` | `#e6ecf7` | `#1a2130` | the user turn's ground (M167); measured by `verify:styles 11` as a ground |
| `--measure` | `72ch` | — | `:root` |
| `--t-base` | `14px` | — | `:root` (the type scale) |
| `--inset` | `20px` | — | `:root` (the spacing scale) |

Re-valued in M163 (finding 8), dark only: `--glass-1` from `.74` to `.88` alpha,
`--edge-light` from `.06` to `.11`, `--lift` one step wider. The light values stand.

Named later, by the milestone that needs them, each in both blocks: the tool row's state
pill (M168, reuses `--*-dim`), the diff card's washes (M165, reuses `--green-dim` /
`--red-dim`), the far card's wash (M166, the existing `color-mix` of the tone).

`--well` stays the xterm background and `--amber` a literal. Blur is paid where M109 pays it
and nowhere new.

## What a restyle may not touch

- The DOM aliases roughly two hundred checks select on: `.panel`, `.panel__chrome`,
  `.panel__title`, `.panel__close`, `.panel__slot`, `.panel__card`, `.panel__resize`, every
  `*-node__*` hook and every `data-*` attribute a check reads. Restyle the classes; never
  rename them.
- `.pf__body` is never transformed (`frame.2`); the counter-scale is `.pf__chrome` and the
  handles (`chrome.scale.1`).
- xterm's cell metrics, the pointer correction, OSC 133, the PTY flush gate, dormancy tiers,
  the WebGL budget.
- Every control's name and tab order (`labels.1`, `labels.2`, `reach.*`, `targets.1`).
- A golden changes on purpose: `npm run verify:visual`, every diff LOOKED at, a sentence per
  scene in the ledger, then `UPDATE_GOLDENS=1`.

## Motion (M176)

Five moments and no others: a panel spawning (scale from `.98`, `--dur-2`, `--ease`); a
hover reveal (`--dur-1`); the needs-you pulse (once, M109's finite breaths); the palette
opening (M109's rise); the camera's flight (M56's curve). `prefers-reduced-motion` removes
every one. `verify:styles motion.2` pins the durations to the two tokens.

## Empty states (M177)

Every pane, panel kind and board column with nothing in it: the kind's glyph, one sentence
saying what the surface is for, one verb. The rail's empty state keeps `no panels` and `⌘N`
(`empty.1`); the hint strip's four hints land here.

## Finished (M179)

Every principle above, and where it lives now. Implemented means a milestone shipped it and a
check or a golden's sentence pins it; struck means declined with its reason in the ledger.

| Principle | State |
|---|---|
| The face rule | Implemented — M162's sweep, M164's bodies, M174's launcher; `face.1`, `material.1` |
| The rest rule | Implemented — M163's header, M165's cards, M171's rail, M172's dock; `rest.1`, `diff.1`, `rail.1`, `dock.1`, `reveal.1` |
| The path rule | Implemented where a root is known (M164's review and memory, M175's palette column); the file and toolbox panels show the last two segments until backlog #86 gives them a root; the sheet's WHERE input keeps the real path (an editable value cannot be a shortened one — struck for that field) |
| The metrics rule | Implemented — M163's inspector section, M172's dock, M173's HUD pill; `metrics.1`, `hud.2`, `machine.1` |
| Words, not codes | Implemented — M177's `EmptyState` over one list, M173's hints; `empty.1`, `empty.2`, `hints.1`; the board's three column states kept (F.7) |
| The measure, the body size, the inset (72ch / 14px / 20px) | Implemented — `--measure`, `--t-base`, `--inset` on the reading bodies and the chat's prose (M164, M167); ~~14px on the palette, sheet and context pane~~ struck: the brief's own ramp says 13px is a row or control |
| The radii (12 / 8 / 5 / full) | Implemented — the frame, the composer well, the cards, the chips (M163, M165, M169); the tokens were Obsidian's |
| `--bubble` | Implemented — M167's user turn |
| BridgeMind One's places | Implemented — M171's groups, M172's named dock; ~~modes as a top-level switch~~ struck (the brief's own reason) |
| The Claude app's conversation | Implemented — M167–M169; ~~avatars, a model picker, tables and images in the grammar~~ struck (the Act II spec's reasons) |
| Codex's lists and diff cards | Implemented — M165's cards, M105's last line kept, M169's approval sentence |
| Motion: five moments and no others | Implemented — M176; `motion.2` (a sixth keyframe, the ⌘G grid's rise, allowed by name as an overlay's arrival) |
| Empty states as places | Implemented — M177; the Integrations audit's per-service sentence, the Skills column, the work menu and the workflow tab keep their own inline sentences (each already a sentence with a verb) |
| The golden-sentence rule | Implemented — every changed scene in the ledger; two harness facts recorded (the window's content size, the fixture's fixed name) |
| What a restyle may not touch | Held — no DOM alias renamed (shell 83 caught the one attempt), `.pf__body` untransformed, the cells untouched, every control named and reachable |
| The findings 1–22 | 1–12, 14, 16, 17, 19–21 fixed in their milestones; 13, 18, 22 declined in this table; 15's sentence fixed and its caps heading declined (M164) |
