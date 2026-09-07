# Terminal Canvas — the v8 run: polish, in goal mode, on Fable 5.1

**How to run this:** open a fresh Claude Code session in `~/Documents/terminal-canvas` on
Fable 5.1, type `/goal`, and paste this entire document as the goal description. Nobody is at
the keyboard afterwards. Every decision a prior run would have asked a person is a recorded
default below; where two designs are defensible, pick one, write the reason in the build log,
and move. The evaluator cannot tell "deliberating" from "stuck", and only one earns its turns.

This is the ninth run on this codebase (M1–M160 are in `docs/build-log/`, README's milestone
table and `CLAUDE.md`). Eight runs made the canvas trustworthy, wide and capable. **None of
them made it feel like a product.** That is this run's one job. The app today reads as an
engineer's instrument: monospace in the chrome, raw `/private/var/folders/…` paths at full
width inside panel bodies, six controls on every panel header, a status bar that recites CPU
and RAM and "no tmux — sessions end on reload" at rest, a hint strip that explains itself, a
launcher whose title is set in a terminal face. It is honest and dense and it looks like a
debugger. The target is the opposite register: the calm, conversation-first surfaces of the
Claude desktop app and Codex, and the "one native window for everything you do with agents"
posture of BridgeMind One — where a terminal is *one* thing a pane can be, not the material
everything is made of.

## The goal condition — what the evaluator is actually checking

After every turn a small fast model reads the transcript and asks whether this is true yet.
Keep it true-or-false:

> `main` is at a new tagged version (4.1.0 unless a seam changed, then 5.0.0), clean, with
> `npm run verify` printing every suite's tally at exit 0 and `npm run verify:packaged` green,
> both pasted in the final message. Acts 0 through IV below are each fully closed — a spec, a
> plan, red-first checks, a fresh-context critic AND a fresh-context verifier per milestone, a
> build log per act, no owed item silently dropped. Every golden under `verify/visual/goldens/`
> has been regenerated ON PURPOSE with the critic's written sign-off on each scene (the ledger
> lists every scene and the sentence the critic wrote), never by a blind re-baseline. The
> design brief in `docs/superpowers/specs/` for this run is finished and every one of its
> principles is either implemented or struck through with a reason. Nothing was pushed to
> `origin` and no GitHub release was created. The final message states, per act, what shipped,
> what was declined and why, and whether `main` is shippable right now.

If a suite is red, if a claim has no command and exit code beside it, if a golden changed
without a critic sentence, or if an act was entered and left half-built, the condition is
**not** met — keep working. If everything reachable is done, report and stop; padding is as
much a failure as quitting early.

## What "polished" means here — the research, so you do not have to redo it

Three reference surfaces, and what to take from each. Do not clone any of them; the canvas is
still an infinite canvas of panels, which none of them are.

**BridgeMind One** (bridgemind.ai, docs.bridgemind.ai — an Electron "Agent Super App", the same
category as this app). One native window with three *modes* — Agent (a left rail: Dashboard,
Routines, Plugins, Skills; chats with named persistent agents; a composer), Code (open a
folder, "launch Claude Code or Codex into panes and drag to split the canvas… parallel agents
stay legible", panes snap to presets, a `Tidy` verb squares the layout, "dock a browser on
localhost or a thread beside the shell"), and Chat (a standalone sandboxed conversation).
Take from it: **the product is the arrangement of agents, not the terminal**; a pane is a
first-class object with a soft frame, a name and a state, and the shell inside it is content.
Skills, Plugins and Routines are *destinations* in a rail, not palette entries. Everything you
can do is visible as a named place before it is a keyboard chord.

**The Claude desktop app** (chat surface). Take from it: generous whitespace; one column of
conversation with the assistant's prose set in a proportional face at a comfortable measure
(≈ 65–75 characters); tool calls collapsed into quiet single-line rows that expand on click
(a verb, a target, a state — never a JSON dump at rest); a composer that is a soft rounded
well anchored at the bottom with one filled send control and small secondary affordances;
status as words and soft pills, never as raw metrics; the system's own font; 12–16px radii;
hairline borders on a slightly lifted surface; motion only where it carries meaning.

**Codex** (OpenAI's desktop/agent surface). Take from it: thread lists with a title, a
one-line summary and a state word; a diff shown as a *card* with a file header and a soft
green/red wash, not as a wall of `+`/`-` text; approvals as a short sentence and two buttons;
a project sidebar that is a list of *things you are working on*, not a process table.

**What is explicitly NOT the target.** iTerm. tmux status lines. Anything that looks like
`htop`. Metrics at rest. Paths at rest. Monospace anywhere a human is reading English.

## The audit of the current build — findings to carry, from the 4.0 goldens

Read `verify/visual/goldens/*.png` yourself first (Fable 5.1's vision is good on dense UI;
lean on it). These are what the author of this prompt saw on 2026-09-07 in `kinds-dark`,
`overview`, `launcher`, `chat` and `board`. Every one becomes a numbered finding in Act 0's
brief with a disposition; add your own.

1. **Panel chrome is six controls wide at rest** — `⋯`, lock, state pill, `CPU 0% · RAM 3 MB`,
   `fill`, `×`. A chat app shows a title and a state and reveals the rest on hover. The
   machine-cost readout belongs in an inspector, not on every header.
2. **Raw temp paths at full width** inside review, file, toolbox and skill bodies
   (`/private/var/folders/hl/31vg6kxy1rp3lm3040000gn/T/tc shot fixtures …`). Show the repo's
   basename, the path relative to it, and the full path only in a tooltip or the inspector.
3. **Monospace where a human reads prose.** The launcher's hero title, its five verbs, the
   chat panel's `YOU`/`CLAUDE` turns, the work card's description, the panel rail's
   annotations, the hint strip. Mono is for code, commands, paths and terminal cells — nothing
   else.
4. **The status bar recites the machine** — `100% · fit · 0, 0 · claude — api (2) not started ·
   CPU 0% · RAM 3 MB · no tmux — sessions end on reload`. At rest it should say almost nothing;
   the tmux warning is a first-run notice, not a permanent footer.
5. **The hint strip** (`⌘N starts a panel · hints fade once you have used them`) is a fixed
   strip that itself needs explaining. Hints belong in the empty state and the launcher.
6. **The rail is a process list.** Rows are `name · state · start` in one weight; a chat and a
   terminal and a file and a Jira board all look the same. Group by what they are (Agents,
   Files, Boards, Integrations, Workflows), give each row a kind glyph in a soft tint, and let
   the state be a dot with a word on hover.
7. **The chat panel is a terminal wearing a hat.** `YOU` / `CLAUDE` labels in caps mono, tool
   rows as `TOOL Read …/src/server.ts` with a `show result` verb, the composer a plain
   textarea with `Send` and `Interrupt` as bare buttons. This is the panel that most needs to
   look like Claude/Codex, because it is the panel that IS that conversation.
8. **The dark theme's panels are flat dark rectangles on a dark field** — the Obsidian brief's
   glass and aura are there but too quiet to read at the golden's scale. Lift panels one clear
   step from the field; a bezel and an edge-light should be visible, not implied.
9. **The launcher is a card of buttons and a mono command list**, with an error sentence in
   mono under a hairline. It should be a welcome: a title in the UI face, three large soft
   doors, recents, and the environment report folded into one calm sentence with a fix verb.
10. **The far view (`zoomed-out`) is boxes with words** — right idea (a status wall), wrong
    material. Cards should carry the kind glyph, the name, and a state colour wash, and
    nothing else.

## Ground rules that do not change

- **The Obsidian brief (M109–M111) is amended, not replaced.** Dark is the flagship, cyan is
  the accent, glass over blur, state edges glow, one filled primary control per surface,
  system SF, no bundled face. This run writes a *second* brief that sharpens Obsidian toward the
  three references above. A new colour or radius or spacing value is a NEW token declared in
  BOTH theme blocks (`verify:styles theme.1`), never a re-spelling of an existing name.
- **`--amber` stays a literal. `--well` equals the xterm background** (`verify:panels theme.1`
  pins the dark literal). Re-run the contrast check (`verify:styles 11`) after every token
  change and keep it green.
- **`.pf__body` is never transformed.** Counter-scaled chrome is `.pf__chrome` and
  `.pf__handles` and nothing else (`verify:panels frame.2`). Any redesign of the frame keeps
  every DOM alias (`.panel`, `.panel__chrome`, `.panel__title`, `.panel__close`, `.panel__slot`,
  `.panel__card`, `.panel__resize`, the `*-node__*` hooks) — roughly two hundred checks select
  on them. Restyle the classes; do not rename them.
- **Terminals stay terminals.** xterm's cell metrics, the pointer correction, OSC 133, the PTY
  flush gate, dormancy tiers and the WebGL budget are untouched. The terminal *frame* gets the
  new material; the cells inside it do not change size, face or palette unless a milestone
  specs it with a golden.
- **Hover-revealed controls must remain keyboard-reachable and named** (M44's rule,
  `verify:rail`/`verify:panels` reach checks). Hiding a control at rest never removes it from
  the tab order or its `aria-label`.
- **Words, not ellipses; sentences, not codes** (M127's critic). Every empty state says what
  the surface is for and what to do next.
- **Every golden that changes is changed on purpose.** The method is M148–M149's: regenerate
  with `npm run verify:visual`, look at every diff, write the critic's sentence per scene into
  the act's build log, then accept. A re-baseline without a sentence fails the goal condition.
- **The verify harness is the contract.** Red-first checks for every milestone; `verify:styles`
  for tokens and rules, `verify:visual` for what it looks like, the panels suites for behaviour.
  Never run two Electron verify chains at once (the load-flake rule). Kill the verify tmux
  server between runs. Each worktree gets its own `TC_VERIFY_SUFFIX`.
- **No new runtime dependency** for styling. No Tailwind, no component library, no icon font.
  The SVG icon set in `icons.tsx` grows if a milestone needs a glyph.
- **No pushes, no releases.** Tag locally, draft the release body, stop.

## Milestone numbering

M160 is the last number used. This run starts at **M161**. One branch per act, named for its
first milestone (`m161-polish-brief`), merged to `main` at the act's close with the act's build
log in `docs/build-log/m161-…md`.

## The acts

### Act 0 — the baseline and the brief (M161–M162)

- **M161 · baseline.** `npm run verify` and `npm run verify:packaged` green on `main` at
  `7049dab` before a line changes; paste the tallies into the ledger. Regenerate the goldens
  once with nothing changed to prove the harness is stable. Read every golden.
- **M162 · the brief.** `docs/superpowers/specs/2026-09-07-m162-product-polish-brief.md`. It
  contains: the three references and what is taken from each (above, made concrete with
  measurements — the measure, the radii, the spacing scale, the two type ramps); the ten
  findings above plus yours, each with a disposition (FIX in act N / DECLINE and why); the
  **face rule** (mono only for code, commands, paths and terminal cells); the **rest rule**
  (what every surface shows at rest vs on hover vs on focus); the **path rule** (basename +
  relative path, full path in a tooltip); the **metrics rule** (no CPU/RAM/token numbers
  outside the inspector and the context pane); and the new tokens with their values in both
  themes. `verify:styles` gains a check per rule that can be checked mechanically (e.g. no
  `--font-mono` on `.pf__title`, `.launcher__*`, `.chat-node__turn`, `.rail__row`).

### Act I — the frame every kind wears (M163–M166)

- **M163 · the quiet header.** At rest: kind glyph in a soft tint, title, state dot (word on
  hover). On hover/focus of the panel: `⋯`, lock/pin marks, `fill`, `×` fade in. The
  machine-cost readout leaves the header for the inspector. 12px radius, hairline border, one
  step lifted from the field, edge-light on top, the state edge kept but softened into the
  border rather than a stripe. Both themes. Goldens: `kinds`, `kinds-dark`.
- **M164 · the body's material.** Reading kinds (review, file, toolbox, skills, work, note)
  get the UI face for prose, 14px/1.5, a 20px inset, and mono only for code spans and diffs.
  Paths obey the path rule everywhere a `PanelFrame` body prints one. Terminal bodies keep
  their cells; the `--well` bezel is made visible.
- **M165 · diffs as cards.** The review panel's per-file rows become file cards: a header
  with the basename and `+2 −2` as soft pills, the hunk with a colour wash, `discard` revealed
  on hover. Commit and refresh stay as the frame's verbs.
- **M166 · the far view as a status wall.** Cards at the far tiers show glyph, name, state
  wash; the minimap uses the same washes. Golden: `zoomed-out`, `overview`.

### Act II — the conversation (M167–M170)

The chat panel is the one that most needs to look like the thing it is.

- **M167 · turns.** Drop the `YOU`/`CLAUDE` caps labels for an avatar-less rhythm: the user's
  turn as a soft filled bubble aligned right at ≤ 75% width, the assistant's as unboxed prose
  at the full measure, timestamps on hover. Markdown rendered (headings, lists, code fences in
  mono with a copy verb). Streaming shows a soft cursor, not a spinner.
- **M168 · tool rows.** Each tool call is one collapsed row: glyph, verb (`Read`, `Edit`,
  `Run`), the target under the path rule, a state pill; click expands to the result in a
  scrolling well capped at ~12 lines with `show all`. Consecutive rows group under one
  "worked for 2m · 6 tools" header, collapsed by default.
- **M169 · the composer.** A rounded well anchored to the panel's bottom with a subtle
  inner shadow; grows to 6 lines; one filled `Send` (cyan) at the right; `Interrupt` appears
  only while a turn runs and replaces `Send`; the model row, the skills capsule and the
  attach affordance are quiet chips above the text. Approvals render as a sentence and two
  buttons in the same well.
- **M170 · the agent card when it is a terminal.** A `claude`/`codex` *terminal* panel gets a
  header identical to the chat kind's, a state word from the agent-state machine, and the
  terminal cells as its body — so a person cannot tell a conversation from a terminal by its
  frame, only by its body. Goldens: `chat`, `teammate`, `trail`, `attention`.

### Act III — the shell (M171–M175)

- **M171 · the rail as places.** Group rows by kind under quiet headings (Agents, Files,
  Boards, Integrations, Workflows, Notes); each row is glyph + name + state dot; `start`
  appears on hover; a selected row is a soft filled pill; counts in the heading. Keep the
  keyboard reach and the exact names `verify:rail` reads.
- **M172 · the dock and top bar.** The left icon dock becomes a rail of named destinations
  (label on hover, the current one filled); the top bar holds the app name in the UI face,
  one filled `New…` control, search as a rounded field, and the appearance and pane toggles
  at the right — nothing else.
- **M173 · the status bar at rest says nothing.** Zoom controls stay as a floating pill at the
  bottom right; the coordinates, the selected panel's name, CPU/RAM and the tmux notice leave.
  The tmux notice becomes a dismissible first-run banner in the launcher and a line in the
  environment report. The hint strip is removed; its hints move to the empty state.
- **M174 · the launcher as a welcome.** Title in the UI face, one line of purpose, three
  large soft doors, a recents row (last folders and presets), the command verbs as a quiet
  list in the UI face with mono only for the command itself, the environment line as one
  calm sentence with `Fix…`. Golden: `launcher`.
- **M175 · palette and sheets.** The palette, the spawn sheet, the settings drill-in and the
  context pane take the same material: 14px, the UI face, section headings in small caps
  tracking, rows with a glyph, `kbd` chips only where a chord exists. Goldens: `palette`,
  `palette-dark`, `palette-query`, `templates`.

### Act IV — the finish (M176–M179)

- **M176 · motion with intent.** Panel spawn (scale from 0.98, 160ms, the brief's ease), hover
  reveal (80ms), the needs-you pulse (once), palette open, camera ease — and nothing else.
  `prefers-reduced-motion` disables all of it. `verify:styles` pins the durations.
- **M177 · empty states as places.** Every pane, panel kind and board column with nothing in it
  says what it is for and offers one verb, in the UI face, centred, with a glyph. Board columns
  keep M149 F.7's three states.
- **M178 · the second full audit.** Walk every golden as M149 did, on both themes, with the
  brief's rules as the lens. Each finding FIXED/DECLINED/OWED, with the check that pins it.
  Fix what the walk finds before closing the act.
- **M179 · reconcile.** Version bump, README's milestone table and preamble, `CLAUDE.md`'s
  load-bearing entries for every new rule (the face rule, the rest rule, the path rule, the
  metrics rule, the golden-sentence rule), the release body with the Gatekeeper sentence,
  the ledger with both tallies, the tag. `graphify update .` before the final message.

## The ledger

Keep `docs/build-log/m161-m179-ledger.md` open from the first turn: per milestone — spec path,
plan path, red check names, the critic's findings and dispositions, the verifier's verdict,
the golden scenes touched with the critic's sentence each, the commit. Compaction will happen
mid-run; the ledger, not memory, is the source of truth. Rebuild your understanding from it,
`CLAUDE.md`, the brief and README's table, in that order.

## The final message

Paste both tallies with exit codes. List the acts with shipped / declined / owed. Name the
tag. Say in one sentence whether `main` is shippable right now and what a human still has to
do (push, release). Stop.
