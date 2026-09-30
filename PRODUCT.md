# Product

<!-- impeccable:product-schema 1 -->

> Written in M388 from `README.md`, `CLAUDE.md` and `docs/product-rules.md` only — product
> truth restated, nothing invented. It has **not** been through the impeccable init interview:
> the run brief asked for it to be derived from those three files and flagged for the owner's
> review (`docs/build-log/m388-m396-ledger.md`, "PRODUCT.md — owed review"). Where the sources
> are silent, this file says so rather than filling the gap.

## Platform

web

(An Electron desktop app for macOS, Apple Silicon by default. The UI is web technology
inside one native window; its design language is the app's own — the Obsidian brief — not
AppKit's. Source: `README.md` "Stack", `docs/product-rules.md` "Material".)

## Users

A person who hands coding work to agents and stays responsible for the result: they start
agents (`claude`, `codex`, other CLIs), steer them, read what comes back, and decide what
lands. They work in repositories on their own Mac and keep several agents, terminals, files
and previews going at once. Teammates may share a workspace (identities, chats and sessions
are kept apart: *a teammate is an identity, a chat is its conversation, a session is its
execution*).

Not stated in the sources: team size, seniority, or how many hours a day the canvas is open.

## Product Purpose

**The core job:** move a meaningful task from intention to reviewed result while the person
keeps control and understanding. *A workspace holds your work; tasks connect agents, tools
and evidence; the canvas is where you see and act on those connections.*

It is an infinite canvas of **authored objects** — agents, terminals, files, previews,
workflows, pictures and notes — each of which a person arranges, edits and keeps. A terminal
is one thing a panel can be.

## Positioning

- Every terminal is a genuine PTY, so any TUI that works in Terminal works here; agents can
  outlive a reload (and, if asked, a quit) through `tmux`.
- The canvas says who needs you: a panel's edge carries its agent's state, off-screen panels
  that wait get an edge pip, `⌘J` flies to the next one, one vocabulary in every place.
- A review layer diffs each panel against the snapshot taken when *its* agent started, so a
  person reviews what that agent changed and commits it without leaving the canvas.
- Edges hand off work (a finished source starts its target with its output as context), and
  every verb reaches four doors: a canvas gesture, a palette row, an agent line and a
  workflow node.

## Operating Context

- Daily use on a busy canvas: many panels, some live, some dormant cards; zoomed in to work,
  zoomed out to see; `⌘K` palette to find anything; the command pill to act on this canvas
  now; the context pane (inspector) for configuration and provenance.
- First run: the launcher asks what you are working on and which repository, then starts a
  task; the canvas is otherwise empty.
- Work leaves only through gated doors (panel text export, canvas PNG, portable canvas,
  deck export), each scrubbing secrets and reporting the count.

## Capabilities and Constraints

- **An object is authored, not only started.** Notes, pictures, workflows and regions take
  the same selection, drag, resize, marks, grouping, undo, tiering and export rules as
  everything else, and join `isTerminalPanel`'s exclusion list.
- **What arrives from outside is inert until a person looks.** An imported canvas starts no
  process; imported workflow action nodes are refused by name until read.
- **Nothing leaves without passing the gate** (`outward` / `redactSecrets`, a named caller
  list, a scrub count). The canvas PNG is the one ungated door, by recorded decision.
- **Project, workspace and task do not merge.** There is no project record in the layout.
- **A `note` is a Markdown FILE and nothing else is.** Sticky, text and frame are canvas
  objects, never "notes".
- **The four density layers** decide where a fact goes: rest (name, kind, one meaningful
  state), contextual (next action, blocker; opacity 0 → 1), inspector (configuration,
  provenance, outcomes), deep detail (logs, metrics, history).
- **Every canvas shortcut is `⌘`-gated**, because a terminal claims every bare key (`Tab`
  autocompletes, `Escape` interrupts).
- macOS only; unsigned builds; the renderer's CSP is `default-src 'self'` (no remote assets).
- Undecided in the sources: pricing, a phone companion, multi-window use of one canvas.

## Brand Commitments

- Name: **terminal canvas** (lowercase in the launcher).
- Material from the Obsidian brief, sharpened not replaced: dark flagship, cyan accent,
  glass over blur, 12px corners, system SF, one filled primary control per surface, one
  resting shadow (`docs/superpowers/specs/2026-09-05-design-brief-obsidian.md`).
- Voice: words, not codes — every empty state says what the surface is for and offers one
  verb; a control that cannot run is present and disabled with a reason naming the fix;
  never a bare zero or a bare ellipsis.
- The face rule: `--font-mono` for code, commands, paths and terminal cells only; anything a
  person reads as a sentence is in `--font-ui`.

## Evidence on Hand

- `npm run shot` renders the real renderer's scenes to PNGs with a stated intent each;
  `verify:visual` compares them against committed goldens.
- `docs/dead-end-audit.md` walks every surface for dead ends.
- No customer quotes, usage numbers or testimonials exist in the sources; none may be
  invented.

## Product Principles

1. The person keeps control and understanding — agents propose, a person decides what lands.
2. One vocabulary everywhere: the same state words in the edge, the rail, the minimap and the
   pill.
3. Nothing is a dead end: every control either works or says why not and how to fix it.
4. Inert until looked at; gated on the way out.
5. The canvas shows connections — between agents, tools and evidence — and lets you act on
   them where you see them.

## Accessibility & Inclusion

- The canvas is a labelled application region and each panel a named group; the Attention
  list announces a panel that starts waiting; an optional screen-reader mode mirrors each
  live terminal's text (with stated limits).
- `⌘←/→/↑/↓` move a selection between panels, `⌘Enter` steps in, `⌘Escape` steps out.
- Reduced motion is honoured: camera flights collapse to one frame; motion answers to the
  `--dur-*`/`--ease` tokens.
