# Terminal Canvas — the design brief for the 1.x run

**Status:** decided 2026-09-02, after M61's first render and its critic report. This is the
document the design critic is handed for every surface milestone that follows. It is
written to be judged against: every principle below names the thing a critic can look for in
a screenshot and say "that is not what the brief said".

---

## 1. What this application is trying to feel like

**A control room for several coding agents, run by one person.** Not a terminal emulator with
a canvas bolted on, and not a whiteboard with terminals pasted onto it. The person using it
has three to twelve agents working at once, in different repositories, and their job is
supervision: start an agent with the right context, know at a glance which one needs a
decision, find the one that printed the thing they are looking for, and read what each one
changed. The canvas is spatial memory for work in flight — "the flaky-test hunt is top left,
the migration is bottom right" — and everything on it should serve that memory rather than
compete with it.

Two consequences shape every choice below.

**The agent's output is the loudest thing on screen.** The terminal well is where the
information is; the chrome around it exists to say *whose* well this is and *what state* it
is in, then get out of the way. A frame that draws attention to itself is a frame that is
stealing it from the agent.

**State is the product's first-class fact.** The one question a supervisor asks more than any
other is "what is everyone doing right now". The app already knows: main's detector holds
a state per panel, the registry holds a status, dormancy is a flag. What the app does not do
yet is *say it the same way everywhere*. That is the single largest design gap M61's critic
found, and it is the thread this run pulls.

## 2. Who it is for

The author, daily, on a laptop, with the window visible most of the day beside an editor.
Secondarily anyone who runs more than one agent CLI and has felt the wall-of-tabs problem.
Not a team (no multiplayer), not a phone, not a beginner learning what a terminal is. The
first-run experience exists because a stranger might open it once; the rest of the app is
for the person who opens it every morning.

## 3. What is currently generic about it, in the critic's words and mine

M61's critic said it directly: rounded white cards with a resting drop shadow on a dotted grid
in a system sans is the Figma/Miro/Linear-canvas default; the launcher is a stock onboarding
modal; the palette is a stock ⌘K component; state, kind and process share one badge slot and
one visual treatment. All of that is accurate. M45 wrote the right direction ("a quiet
instrument: flat surfaces, hairline boundaries, elevation only as elevation, one accent") and
then, having never looked, shipped panels that float on shadows, two accents (iris for
selection, blue for the focused ring), and a whiteboard ground. The brief below is M45's own
direction, kept, made specific, and this time looked at.

Distinctive, for a tool like this, does not mean loud. It means every choice is *specific to
what this app does* — a colour means one thing, a position means one thing, a word means one
thing — so that a screenshot of it could not be mistaken for a screenshot of a design tool.

## 4. Principles, each with what a critic can check

1. **One state vocabulary, one colour per state, one place per surface.** A panel is in
   exactly one of: `asleep` (restored, never started this launch), `not started`, `starting`,
   `working`, `needs you`, `idle`, `exited N`. The same word appears in the rail row, the
   panel's state pill, the attention popover, the status strip, the far-zoom block and the
   palette's Go-to row. The same hue carries it everywhere: blue working, amber needs-you,
   green idle-and-alive, red exited, grey not-started, dashed-grey asleep. *Check:* find one
   panel in two surfaces of the same screenshot and read its state in both; they must match
   word for word.
2. **The state edge.** Every panel frame, every rail row and every far-zoom block carries a
   3px left edge in its state colour. It is the app's one signature mark: legible at 100%
   and at 10%, in both themes, in a thumbnail, and it is what makes the zoomed-out canvas and
   the minimap read as a status board rather than a pile of rectangles. *Check:* at any zoom
   the left edge of every terminal panel names a state.
3. **Identity leads, provenance follows.** Wherever a panel is named — rail, palette, search,
   status strip — the first thing is its title (the user's own name, or the honest default
   `claude — api` M6a computes), and the directory is the dim second line or trailing hint,
   truncated from the left so the repository name survives. A row that begins with
   `/private/var/folders/…` is wrong. *Check:* no row's first 40 characters are a path.
4. **A line marks a boundary; a shadow marks only what floats.** Panels, cards, group frames
   and the shell's regions are bounded by a 1px `--line` and sit flat on the ground. The
   elevation ramp is reserved for the three things that actually float above the canvas: the
   palette, the attention popover, and a drawer at the compact breakpoint. *Check:* a resting
   panel has no shadow; the palette does.
5. **One accent for the interface, and it is not an agent colour.** Iris (`--iris`) answers
   every interaction with the interface itself: selection in the rail and palette, the
   focused panel's ring, links, focus rings on controls. Blue is *working*, never the
   interface. *Check:* the focused panel's ring is the same hue as the rail's selected bar.
6. **Every control says what it is.** No glyph without an accessible name and a hover label;
   the dock's pressed state is unmistakable; a button that toggles a view names the view in
   its label. Copy uses verbs: "Start", "Card", "Expand", "Leave merged view". *Check:* pick
   any icon-only control in a screenshot and the critic should be able to name its purpose
   from the surrounding chrome without a guess.
7. **Three states, always.** A section that can be empty says what empty means ("no runs
   yet"), a section that is still asking says so, and a section with an answer shows it. A
   blank region under a heading is a defect. *Check:* no heading with nothing under it.
8. **The chrome does not compete with the well.** Chrome type never exceeds `--t-lg` (15px)
   except the launcher's one heading; the loudest text on a card is the agent's own tail. The
   32px "click to start" is retired. *Check:* the largest text in a panel is terminal output.
9. **Copy speaks plainly, in the app's own voice.** Sentences, lower-case labels, a verb in
   every action, and a disabled row names the fix, not the rule. The voice is dry and exact —
   "2 panels share this repository, so their subagents cannot be told apart" is the register;
   "Oops!" and "Awesome" are not. *Check:* every disabled row ends in something the user can
   do.

## 5. The specific choices

### Type

Two faces, unchanged in family, changed in role.

- **UI face: the system stack** (`--font-ui`, SF on macOS). Labels, buttons, section
  headings, sentences. Sizes from the existing six-step scale; chrome lives at `--t-sm`
  (12) and `--t-md` (13), headings at `--t-lg` (15) with `--track-tight`. Caps micro-labels at
  `--t-xs` (11) with `--track-caps`, and only ever one or two words.
- **Mono face: the terminal's own stack** (`--font-mono`). Every *value* and every *identity*:
  panel titles, paths, pids, counts, states, the status strip, the palette's Go-to titles.
  The rule is: if the text names a thing the machine knows, it is mono. This is what gives
  the shell a point of view the critic asked for at no asset cost — the chrome quotes the
  well. Chrome mono runs at `--t-sm`; a title at `--t-md` weight 600.
- No display sizes, no bundled face. The renderer's CSP forbids remote fonts and a bundled
  UI face would race the terminal's cell metrics; the system stack reads as native, and
  native reads as finished.

### Colour

- The token set stays two blocks from one name set (M45's mechanism, pinned by
  `verify:styles theme.1`). Two changes of *role*, no new tokens:
  - **Agent-state hues are agent state only:** `--blue` working, `--amber` needs you,
    `--green` idle/alive, `--red` exited. They appear on the state edge, the state dot, the
    pill and the far-zoom block, nowhere else.
  - **Iris is the only interface accent.** The focused panel's ring moves from `--blue` to
    `--iris`; group frame colours stay theirs (they are user-chosen labels, not state).
- **The ground loses the dot grid.** A dotted grid is a whiteboard's promise that you will
  draw; this canvas is for reading. The ground is flat `--s-0`; the sense of panning comes
  from the panels moving, the HUD's coordinates, and the minimap. (Overrules M45's "dot grid
  at a visible alpha with a vignette", and M48's hint strip still teaches the pan gesture.)
- **Resting shadows go.** `--e-2` leaves every panel at rest; `--line` carries the boundary.
  `--e-3`/`--e-4` stay on the palette, popover and drawer. Dark theme frames gain a visible
  hairline (`--line-strong` on the frame, `--line` inside).

### Density

Dense, but ranked. A rail row is 28px; a panel chrome row is 30px; the context pane's fields
are two-line (caps label over mono value) and sections are separated by one hairline and
`--sp-6`. Nothing gets `--sp-8` except an overlay's own padding. The palette shows twelve
rows at rest. The status strip is one line and stays one line at every breakpoint.

### Motion

Motion means one of two things: **the camera moved** (a flight, eased over `--dur-2`, one
frame under reduced motion) or **something appeared over the canvas** (palette, popover,
drawer: a 90ms fade and 4px rise). Nothing else animates — no hover lifts, no pulsing dots.
A state change is a colour change, instant. This is unchanged from M45 and is restated
because "quiet" is a motion property as much as a colour one.

### Iconography

The inline SVG set on a 16px grid, stroke `currentColor`, `aria-hidden`, every one paired
with a text label or an `aria-label` and a `title`. Two additions this run needs: a distinct
glyph for the merged view (lanes, not layers — the Workspaces glyph is already layers) and a
small kind glyph set for the rail's left column (terminal `>_`, review `±`, file `¶`, note
`✎`, toolbox `⚙`, jira `◫`) so kind stops sharing the state slot.

### The panel frame

One frame, every kind (M47's `PanelFrame`, kept). What changes: the state edge on the left;
the boundary is a hairline and the shadow goes; the chrome row is `title (mono, 600) ·
state pill (right)` for terminals and `kind glyph · title · kind-specific controls` for
others; a file panel's Save lives in the chrome row beside its edit toggle, never over the
body; the group header's remove control is a labelled "Remove" not the panel-close `×`.

### The launcher

Not a modal. A panel-shaped card in the same frame family — a chrome row reading
`terminal canvas` and a well — whose "verbs" are four prompt lines in mono
(`> login shell`, `> claude`, `> open a file…`, `> new note…`) with their disabled reasons
inline. The environment line stays (it is the best copy in the app) and moves into the well
as a fifth mono line. The hint strip below is the one place the gestures are taught; the
launcher does not repeat them.

### The palette

Kept as the app's one command surface; reshaped in what a row leads with. Go-to rows:
`title` in mono, then the state word, then the path as a dim trailing hint truncated from
the left. Search hits: `title · matching line`, the term highlighted in the line, never the
path. The empty state names the term. Fuzzy matching over panel rows scores the title and
the state word; a path matches only as a contiguous substring, so highlights stop scattering
across `/private/var/folders`. The disabled-reason column is the palette's own idea and is
never truncated with an ellipsis; a long reason wraps.

### The far view

Below `SUMMARY_ENTER` every kind — not only terminals — renders its summary: the state
edge, the title, the state word. Below `BLOCK_ENTER` every kind is a block in its state
colour with the title if it fits. A minimap (backlog #33, in) draws the same blocks at
thumbnail scale in a top corner, so the status board is visible while working at 100%.

### What it borrows, and what it refuses

It borrows macOS's own restraint — the system face, hairlines, tinted selection — and the
terminal's honesty: mono values, exact words, no decoration. It borrows the command palette
as a form because the form works, and the "disabled with a reason" row which is already
this app's best idea. It refuses the whiteboard (dot grid, floating cards), the dashboard
(gauges, glow), the onboarding modal, and any motion that is not the camera.

## 6. The three things the daily user touches, and what "excellent" means for each

- **Starting a panel.** From the launcher, the top bar, `⌘N` or the palette, the user chooses
  *where* (a directory, with the focused panel's live directory and recent ones offered) and
  *what* (a preset, or a typed command for a one-off task), sees the agent's mode, and gets a
  panel that is live and focused before their hand leaves the keyboard. Excellent means the
  directory question is answered in one keystroke and a one-off `npm test` panel is as cheap
  as a preset.
- **Finding a panel.** By name, by state, by what it said. Excellent means typing three
  letters of a title in `⌘K` lands on it, `⌘F` for a string shows *which* panel and *which
  line*, and every row reads as a panel a person named rather than a path a machine minted.
- **Knowing what every agent is doing.** Excellent means the answer is readable without
  reading: the state edges on the canvas, the rail, the minimap and the dock badge all say
  the same thing at once, and "needs you" is the only thing that is ever amber.

## 7. How this brief is used

Every surface milestone's spec cites the principles it is built against by number. The
critic receives this document and the milestone's PNGs, nothing else, and is asked which
principles the images violate. A finding the milestone rejects is recorded in its build log
with the principle it invokes. When a principle turns out to be wrong in practice, this file
is amended with the date and the reason, and the amendment is the decision.
