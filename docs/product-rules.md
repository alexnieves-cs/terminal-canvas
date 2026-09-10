# Product rules

> Split out of CLAUDE.md. What the app is supposed to be, and the rules a later
> run must not spend. Every rule here is bound by a named check.

## What it is

The line above says "an infinite canvas of authored objects". That is 5.0's truth, and it is
what the four runs before it were working towards: 1.0's sentence was "every node is a live
terminal panel", 4.1's was "the canvas reads as a product", and v9's brief
(`docs/superpowers/specs/2026-09-07-v9-design-brief.md`) named the destination — one calm native
window where a person arranges agents, conversations, files, boards, workflows, pictures and
notes, and a terminal is ONE thing a panel can be.

What that means concretely, and what a later run must not undo:

- **An object is authored, not only started.** A note, a picture, a workflow and a region are
  things a person makes; they take the same selection, drag, resize, marks, grouping, undo,
  tiering and export rules as everything else, and every one of them joins `isTerminalPanel`'s
  exclusion list rather than getting a partition of its own.
- **Four doors, and the fourth is real.** Every v9 verb reaches a canvas gesture, a palette row,
  an agent line AND a workflow node (`V9_DOORS`, `verify:verbs closure.v9.1`). The workflow door
  is M188's `action` node — a verb line run through the SAME executor the palette and `tc plan`
  take. A door that is only declared is not a door, and the check binds each one.
- **What arrives from outside is inert until a person looks.** An imported canvas starts no
  process, and an imported workflow's action nodes are refused by name until they are read
  (`reviewed: false`). A fetch node does a GET and refuses every write, because the approval
  door this app already has is the only way a write should happen.
- **Nothing leaves without passing the gate.** `outward` and `redactSecrets` have a named,
  checked caller list; an export scrubs field by field and reports its count; a feedback draft
  says what it scrubbed and is submitted by the person, not the app; pixels travel only when
  asked, and are never called redacted.

The 4.1 rules below still hold and are still checked — they are what "reads as a product" meant,
and 5.0 did not spend them.

- **The face rule** (`face.1`, `material.1`). `--font-mono` is for code, commands, paths and
  terminal cells. Titles, labels, rail rows, chat turns, descriptions, empty states, the
  launcher and hints are set in `--font-ui`. If a human reads it as a sentence, it is not
  mono. A mono ANCESTOR is the failure this rule exists for: a container never sets mono; the
  leaf that holds code does.
- **The rest rule** (`rest.1`, `rail.1`, `dock.1`, `diff.1`; `verify:panels` `rest.1`,
  `reveal.1`). A surface at rest shows what identifies it — glyph, name, one state word or
  dot. Verbs, marks and metrics appear on hover or focus, at opacity 0 → 1 in `--dur-1`
  (never display: the box, the name and the tab order stay, and a script's click lands
  without a hover — M44's reach rule still applies). Opacity is 0 or 1 (check 3).
- **The path rule** (`verify:rail path.1`, kinds `path.1`). `shared/display-path.ts` is the ONE
  helper: the repository's basename and the path relative to it where a root is known, the
  last two segments behind `…/` where none is (backlog #86 is the file and toolbox panels'
  root); the full path on the element's `title`, never in a body at rest. `shortPath` lives
  there too and the palette re-exports it.
- **The metrics rule** (`metrics.1`, `hud.2`; shell `machine.1`). CPU, RAM, tokens and
  dollars belong in the inspector (the Machine section — three arms, a fourth for a chat,
  never a confident `0%`) and the context pane. No number of that kind appears in a panel
  header, a card tier, the rail or the status bar; the HUD is a zoom pill.
- **Words, not codes** (`empty.1`, `verify:rail empty.2`, `hints.1`). Every empty state says
  what the surface is for and offers one verb (M127's critic, M149 F.7), through
  `shell/EmptyState.tsx` over `shared/empty-states.ts`; the gesture hints and the tmux notice
  are `canvas/hints.ts`'s sentences in the empty state and the launcher. No state is a bare
  zero or a bare ellipsis.
- **Conversation panels look like the conversation they are.** The user's turn is a soft
  bubble, the assistant's is unboxed prose at a readable measure, a tool call is one collapsed
  row (verb, target, state) that expands on click. The composer is a rounded well with one
  filled primary control. A chat is never a terminal wearing a header.
- **Material comes from the Obsidian brief and is sharpened, not replaced**
  (`docs/superpowers/specs/2026-09-05-design-brief-obsidian.md`): dark flagship, cyan accent,
  glass over blur, 12px corners, system SF, one filled primary control per surface, one
  resting shadow. A new NAME is declared in both theme blocks (`verify:styles theme.1`); a
  RE-VALUATION of an existing token is one theme's, recorded in the run's ledger with its
  finding; `--well` stays the xterm background and `--amber` a literal. No styling
  dependency is added — no Tailwind, no component library, no icon font; `icons.tsx` grows.
- **A golden changes on purpose or not at all** (the golden-sentence rule). A restyle
  regenerates its scenes with `npm run verify:visual`, and each changed scene gets a critic's
  sentence in the ledger before `UPDATE_GOLDENS=1` writes it; a change UNDER the budgets that
  matters is forced by deleting the golden, with its sentence. A blind re-baseline is a
  regression that cannot be seen. Two harness facts the run learned: the shot window's
  content is pinned to the goldens' 1440x865 (macOS clamps a window to the work area at
  creation only), and the fixture directory is a FIXED name — a per-run suffix in a printed
  path moved goldens past the tile budget on some runs and not others.
- **What a restyle may not touch.** The DOM aliases (`.panel__*`, the `*-node__*` hooks) that
  roughly two hundred checks select on — restyle the classes, never rename them. `.pf__body`,
  which is never transformed (`verify:panels frame.2`). xterm's cell metrics, the pointer
  correction, OSC 133, the PTY flush gate, dormancy tiers and the WebGL budget. The frame gets
  the new material; the cells inside it do not change unless a milestone specs it with a golden.

## The v10 product contract (M193, D01)

The run after 5.0.0 executes [the ordered product development guide](docs/product-development-guide-2026-09-08.md)
(`D01`–`D20`, mapped to M193–M224). D01's reconcile adopted three things as binding on every
milestone in it; the evidence and the reasoning are in
[docs/build-log/m193-m224-ledger.md](docs/build-log/m193-m224-ledger.md).

- **The core job.** Move a meaningful task from intention to reviewed result while the person
  keeps control and understanding. The mental model is: *a workspace holds your work; tasks
  connect agents, tools and evidence; the canvas is where you see and act on those connections.*
  **Project, workspace and task do not merge** — a workspace may hold several tasks and several
  repositories, and there is still no first-class project record in `LayoutSnapshot`. **A teammate
  is an identity, a chat is its conversation, a session is its execution**; the code already keeps
  these apart and the UI must stop blurring them.
- **The four density layers**, which decide WHERE a fact goes and not merely how it is styled.
  Rest: name, kind, one meaningful state — a zero-value statement at rest (`no skills used`)
  violates the rest rule. Contextual: next action, related work, current blocker, revealed at
  opacity 0 → 1. Inspector: configuration, provenance, detailed outcomes. Deep detail: logs,
  diagnostics, metrics, history.
- **The palette finds anything; the command pill acts on this canvas now (M249).** The pill at
  the bottom of the canvas is a canvas's rest layer. It shows one state, in priority order:
  "N agents need you", "N agents running", "N selected", or a glyph alone, never "0 …". Its
  contextual layer is the input to the orchestrator chat plus Fit, Jump, Running and the
  selection actions. It has no search and no command list. Every control runs an existing verb
  through the palette's own executor. A control that cannot run is disabled with its reason,
  never hidden.
- **A `note` is a Markdown FILE and nothing else is.** M27's prose file panel: a path on disk,
  indexed by the vault, reachable by `[[links]]`, backlinks and `#tags`, searchable, and alive
  outside any canvas. M187's sixteenth kind has three forms — a **sticky**, a **text** and a
  **frame** — which live in the workspace record, have no path and do not survive their canvas;
  each is called by its own form name and **never** a note (collectively *canvas objects*, never
  *canvas notes*). `annotations` keeps meaning M93's labels and M155's ink. **Nothing is renamed
  in code**: the `note` kind, `shared/notes.ts`, `isNotePanel` and the `.note-node__*` aliases are
  unchanged — this is a copy rule plus one real defect to fix, `RailTailKind`/`StateKind`'s single
  `'note'` literal now carrying BOTH meanings since M187 gave the kind the name the comment says
  it should never have (`rail-rows.ts:147-155, 201-202, 317`; `panel-state.ts:24-25`).
- **A deck is a note's slides view, not a new kind (M248).** `kind: 'file'` with
  `source.deck`, the checklist's shape. It KEEPS ITS HEADER under the M236 frame rule — "slide
  N of M" is a fact the body does not carry, and "N slide changes" appears only above zero. Its
  filmstrip is the contextual layer (opacity 0 → 1, absolutely positioned, never the body's
  box). A person's edit writes the file; an agent's or a workflow's is a per-slide proposal a
  person keeps or discards.

