# Terminal Canvas 2.0 — the product thesis, and the design brief that follows from it

**Status:** decided 2026-09-03, after M71 and before any feature work of the third run. This
document EXTENDS `2026-09-02-design-brief.md`; it does not replace it. Every principle of that
brief (1–9) stands unchanged and is still what the design critic is handed. What this document
adds is the half that brief could not have: what the application is FOR now that a node does
not have to be a terminal, and the four principles (10–13) that keep a canvas of unlike nodes
from becoming a soup.

---

## Part one — the thesis

### What this application is for

**A place to run several agents at once and stay in charge of them.** Not a terminal
emulator; not a chat client; not a whiteboard. The person using it has work that is too big
for one agent in one window — three repositories, a migration, a flaky-test hunt, a review,
a note that says what was decided — and their job is not to type into agents but to
*direct* them: give each one the right context to start, see which one needs a decision,
read what each one changed, hand one's output to the next, and know what the whole thing is
costing. 1.1 made the first two of those excellent for terminals. 2.0 makes the unit on the
canvas the thing the work actually is — a conversation, a document, a process, a watcher —
so that directing agents stops being a matter of reading twelve terminals.

The one-sentence version, which every milestone in this run has to serve: **a node on the
canvas is a thing an agent can work in, and the canvas is how one person directs several of
them.**

### Who it is for

The author, daily, on a laptop, beside an editor — unchanged from the 1.x brief. What changes
is what they are doing with it. In 1.1 they open shells and run `claude` in them. In 2.0 they
open a *conversation* with the same agent when the work is a conversation, keep the terminal
when the work is a terminal (a dev server, a build, a TUI the agent is driving), open the
files the agent is changing beside it, and let edges carry one agent's result into the next.
A stranger who runs more than one agent CLI is the second user. Not a team, not a phone.

### A day with it

Morning: the canvas restores. Yesterday's chat with the migration agent is a node with its
transcript readable — no process running, nothing burning — beside the worktree it was
working in and the review node showing what it changed. The supervisor node says, in a
sentence, what the canvas is: two agents idle, one exited red, one waiting for an approval.
The approval is answered from the dock badge's popover without flying to the panel.

Midday: a new task. The spawn sheet offers a *template* — "review this repository" — and
the repository is the parameter; four nodes and three edges land, the first starts. A
watcher node beside them runs the test suite on every file change and turns red when the
agent breaks it. The composer in a chat panel takes a dropped screenshot and an `@file`
reference; a slash command inserts the project's own prompt.

Afternoon: eight agents are running and the budget setting pauses the ninth send with a
sentence naming the ceiling. The task graph fans one agent's summary into three reviewers
and joins their verdicts into a fourth. A memory entry records what was decided so
tomorrow's agent does not re-derive it.

Evening: the run is saved with a name, re-runnable. The canvas is exported. Quit keeps the
terminals on tmux; the chat processes end, and `--resume` brings any of them back.

### What it replaces

- A window of terminal tabs each running an agent — replaced in 1.0.
- A separate chat client beside those terminals — replaced in 2.0 by a chat node that is
  the *same agent* (same login, same `CLAUDE.md`, hooks, skills, memory), so nothing moves
  between two products.
- A notes app open to remember what was decided — replaced by notes and a project memory
  that live beside the agents that act on them.
- A shell script that runs agents in sequence — replaced by edges on the canvas that do the
  same thing visibly, with a name and a re-run.

### What it deliberately refuses to be

- **A general chat app.** There is no model picker across vendors in a chat panel, no
  "assistant" persona, no conversation list. A chat node is an agent working in a directory,
  and it is on the canvas because of where it is, not what it is.
- **A browser.** The web panel is declined in writing (scope decision §2): an embedded page
  cannot live inside the world transform, and a page floating over the canvas is a second
  application drawn on top of this one.
- **An IDE.** File panels render and edit one file with a watch; there is no project-wide
  editor, no language service, no debugger. The editor beside this app is the editor.
- **A hosted product.** No accounts, no sync, no server. Every credential a feature would
  need arrives through one seam (M14's store, and in 2.0 the broker), and every such feature
  ships built against an injected client with a Connect verb and a named reason.
- **A cloud of agents.** One person, one machine, a bounded number of processes with a
  ceiling the user set.

### What must be true at the end of the run

The sentence "every node on this canvas is a terminal" is false. Concretely: a chat node, a
watcher node and a supervisor node exist, none of them holds a PTY or a WebGL context, and
the application is better for it — a conversation is readable as a conversation, an approval
is answerable without finding the panel, and a workflow of several agents is a thing you can
name and run again.

---

## Part two — the design brief, extended

### What the 1.x brief already settled, kept

Principles 1–9 of `2026-09-02-design-brief.md`: one state vocabulary and one hue per state;
the state edge; identity leads and provenance follows; a line marks a boundary and a shadow
marks only what floats; iris is the only interface accent; every control says what it is;
three states always; the chrome does not compete with the well; copy speaks plainly. Type,
colour, density, motion and iconography as that brief specifies. The critic still receives
that document; it now receives this one beside it.

### The problem this half of the brief exists for

Five kinds already sit beside the terminal (review, file, note-as-file, Jira, toolbox) and
they were designed one at a time. 2.0 adds a conversation, a process that is not a terminal
(the watcher), a supervisor and a memory. Without a rule for how unlike nodes share one
canvas, the result is a dashboard: each widget in its own idiom, each with its own
controls, the state edge meaning something different on each. The rule has to be about
*what a node IS* rather than about what it looks like, so that a twelfth kind inherits it.

### Principle 10 — every node is one of three natures, and the nature is what the frame says

Every kind on the canvas is a **conversation**, a **document** or a **process**, and the
frame carries the nature before it carries the kind:

- A **process** node has a *state* — it is running, waiting, idle or exited — and the state
  edge is its signature. Terminal panels, chat panels while a turn is in flight, watcher
  nodes, the supervisor. The left edge is the state hue; the pill reads the state word.
- A **conversation** node has *turns*. A chat panel is a process while streaming and a
  conversation at rest, and the frame says which: streaming, the edge is blue and the pill
  reads `working`; at rest, the edge is the resting green and the pill reads the turn count.
  The body is a transcript, always scrolled to the newest turn unless the user scrolled
  away, and the composer is pinned to the bottom of the body, never floating over it.
- A **document** node has *content* and possibly a *dirty* flag — file, note, review,
  toolbox, Jira, vault, memory. The edge is the kind's neutral tone; the pill reads the
  kind's own fact (`dirty`, `3 files`, `12 tickets`).

*Check:* pick any node in a screenshot; from the edge and the pill alone the critic can
say whether it is running, resting or inert — before reading its title.

### Principle 11 — the same vocabulary, whoever produced it

A chat panel and a terminal panel running the same agent use the SAME state words, the same
hues, the same rail row, the same attention pip, the same dock badge. `needs you` is amber
whether it came from a bell in a PTY or a `can_use_tool` request on stdio. A permission
request is rendered the same way on the card, in the context pane, in the popover and in
the palette: the tool's name, its input in mono, and two verbs. *Check:* find one waiting
agent in two surfaces; the word and the hue match, and the critic cannot tell from the
rendering which front-end the agent is behind.

### Principle 12 — the transcript is a well, and it is typographically the terminal's peer

The chat panel's body obeys principle 8 as the terminal's does: the agent's own words are
the loudest thing. Assistant text at the terminal's mono size (`--t-md`), left-aligned, no
bubbles, no avatars, no colour fill behind a turn; a turn is separated by `--sp-4` and a
one-word caps role label at `--t-xs` in the margin. Tool calls are a collapsed one-line
row in the transcript (`Bash · cat /etc/hosts`) with the result folded under it, expanded
by a control that says what it does. Thinking is a dim single line that expands. The
composer is a plain `textarea` in the mono face with a hairline above it, the send verb
and the interrupt verb as labelled controls in one row. *Check:* a chat panel and a
terminal panel side by side read as two views of one kind of thing, not as a chat app and
a terminal.

### Principle 13 — edges say what they do, and a workflow is legible at the far view

An edge that carries a handoff draws its trigger word at its midpoint (`on exit`, `on
idle`, `all of`); a join draws one ring where its inputs meet; a conditional edge is dashed
until its condition is true. At the block tier the far view shows nodes as blocks in their
tone and edges as hairlines with a dot that moves when a handoff fires — so a running
workflow is readable at 10% as a diagram, which is what the canvas is for. A run's name is
a caps label above the group frame that holds it. *Check:* at the far view the critic can
say which node is waiting on which, without reading a title.

### Kind glyphs and tones, extended

The rail's kind glyph set gains: chat `…` (three dots in a speech line), watcher `◉`,
supervisor `⌖`, vault `▤`, memory `≡`. Tones: conversation at rest uses `--green`'s dim
(alive, not working); document kinds keep `kind`; the watcher is a process and uses the
state hues, with `pass`/`fail` mapped to `idle`/`exited N` so no new hue is minted.

### Copy, extended

The verbs are: `Send`, `Interrupt`, `Allow`, `Deny`, `Open as chat`, `Open in terminal`,
`Run again`, `Save as template`, `Watch`. A disabled row names the fix: `claude was not
found on the login PATH — install it or set the path in the environment report`; `this
terminal is still running its session — stop it, then open it as chat`.

### How this brief is used

Every surface milestone's spec cites principles by number from BOTH briefs. The critic
receives the two briefs and the PNGs, nothing else. A rejected finding is recorded in the
build log with the principle it invokes. An amendment is dated and is the decision.
