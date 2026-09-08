# Terminal Canvas: beautiful, well-placed, more capable. A prompt for GPT-6 Astra in Codex CLI.

Launch from `~/Documents/terminal-canvas` on branch `v9-act4-media`:

```sh
codex -m gpt-6-astra -s danger-full-access -a never "$(cat docs/superpowers/specs/2026-09-08-v9-ux-reorg-prompt-astra.md)"
```

## GOAL

Three things, in this order of weight, applied across the whole app rather than to one
screen: make the interface and the experience of using it **beautiful** — coherent,
intentional, at the level of the Claude desktop app, Codex and BridgeMind One, which is the
register `CLAUDE.md` already commits this app to; **relocate** every control, panel, field
and affordance that is not currently living where its purpose says it should, so the rail,
dock, inspector, canvas and each panel kind read as placed on purpose rather than accreted
milestone by milestone; and **grow the feature set** — both deepening what already exists so
it is "vastly better and more useful" and adding what is missing — judged against what this
app is trying to be, an agent super app in the shape of Orca and n8n where a terminal, a
chat, a file, a browser preview, a workflow graph, an image and a note are equal first-class
objects on one canvas.

You should infer scope and priority from this document and the repository, not ask for it.
Where this document says "make it beautiful", "move it", "improve it" or "add it", that is an
instruction to do the work and take the action, including the visual and structural changes
that instruction implies.

## THE RULES THAT MUST NOT BE BROKEN

Never push to `origin`. Never create a GitHub release or any remote object. Never modify
anything outside `~/Documents/terminal-canvas` except Codex's own state under `~/.codex`.
Never weaken, skip or delete a check to make a suite green. Never rewrite a visual golden
without a critic's written sentence for that scene, and never re-baseline blind. Never add a
styling dependency — no Tailwind, no component library, no icon font; the icon set is
`src/renderer/icons.tsx` and it grows by hand. Never claim a verification you did not run;
every claim of green carries the command and its exit code.

## CONTEXT

Read, in this order, before your first change: `AGENTS.md`, `CLAUDE.md` in full (an
engineering decisions log — nearly every line names an invariant and the silent failure that
follows from undoing it; the "What it is" section states the register and the rules every
new or touched surface is held to: the face rule, the rest rule, the path rule, the metrics
rule, the empty-state rule, the conversation-panel rule, and the material rule), `README.md`'s
milestone table, `docs/ideas-backlog.md` (declined and deferred ideas, each with a reason —
several are exactly "add a feature" entries worth re-reading now with fresh eyes), and
`docs/verify-suites.md` before touching any check. Grep `docs/load-bearing.md` and
`docs/load-bearing-recovered.md` by module name before changing that module — a symptom
search fails; these are written from the cause.

This is the tenth run on this codebase (v9, targeting 5.0.0 off 4.1.0). Its authority, plan,
brief and ledger already exist and bear on what you are about to do even though this
document's mandate is broader than any one of their acts:

- `docs/superpowers/specs/2026-09-07-v9-finish-prompt.md` is the standing authority for this
  run. It already grants full UI/UX authority to "change any layout, control, motion,
  typography, spacing, colour, empty state, sheet, rail, header, composer or flow" judged
  below a premium production standard, bounded only by the Obsidian material (struck with a
  reason in the 5.0 brief, not silently), the DOM aliases (`.panel__*`, `*-node__*` —
  restyled, never renamed), and the golden-sentence rule. This document exists to make you
  actually spend effort against that grant rather than let it sit unused behind the
  milestone list.
- `docs/superpowers/specs/2026-09-07-v9-plan.md` is the acts M180–M200; `docs/superpowers/specs/2026-09-07-v9-design-brief.md` is the 5.0 brief. `docs/build-log/m180-m200-ledger.md`
  is the state — read its LAST section first. As of this writing, Act I (M180–M181) and Act
  II (M182–M184, the workflow editor) are merged to `main`; M185 (the live preview) is
  committed on `v9-act4-media`; M186 (a content-addressed asset store, spec at
  `docs/superpowers/specs/2026-09-08-m186-images.md`) has an **uncommitted** working tree —
  `src/main/asset-store.ts` and `src/shared/assets.ts` are new and untracked, and roughly
  twenty-eight tracked files carry uncommitted edits toward it. Run `git status` and `git
  diff --stat` and believe them over this paragraph, which is a snapshot.
- `docs/superpowers/specs/2026-09-08-m187-images-and-assets.md` and
  `2026-09-08-m188-notes-text-frames.md` are drafted specs for acts not yet built.

**Do this reconciliation before any new work**, the same discipline the prior resume applied
to Astra's own interrupted M180: run `npm run typecheck`, then either finish and commit M186
in scoped conventional commits (`feat(m186): …`) if the working tree is close to its spec, or
if it is further from the spec than a clean finish, decide and record which, then continue.
Do not discard uncommitted work without reading it first.

## THE THREE MANDATES

### 1. Beautiful

The 4.1 goldens under `verify/visual/goldens/` are the floor, not the ceiling — `CLAUDE.md`
says so explicitly and this document repeats it because it is the point of your first
mandate. Walk the goldens (all of them; `npm run shot` plus a fresh look, not memory) against
the rules already named: is every mono glyph actually code, a path or a terminal cell, and
everything a human reads as a sentence in `--font-ui`; does every surface at rest show only
what identifies it, with verbs and metrics appearing on hover in `--dur-1`; does every path
go through `shared/display-path.ts` rather than a raw string; is a metric (CPU, RAM, tokens,
dollars) confined to the inspector's Machine section and never a panel header, card tier,
rail row or the status bar; does every empty state say what the surface is for and offer one
verb through `shell/EmptyState.tsx`; does a chat read as a conversation — bubble, unboxed
prose, one collapsed tool row, a rounded composer — never a terminal wearing a header. Where
a surface fails one of these, fix it as part of the nearest act, with a golden and the
critic's sentence. Where the register itself is thin — spacing that is merely consistent
rather than considered, a transition that is functional rather than felt, a control that
works but does not delight — raise it, using the finite-motion rule (`--dur-1`/`--dur-2`,
purposeful, never decorative) and the one-resting-shadow (`--lift`) rule as your ceiling, not
your excuse. A NEW token name is declared in both theme blocks; a RE-VALUATION of an
existing one is recorded in the ledger with its finding.

### 2. Placed where it belongs

Before moving anything, name the surface's job in one sentence — the rail is a list of
places, the dock is workspace-level navigation, the inspector is a pinned panel's identity
and machine detail, the palette is every verb reachable by name, a panel's header is its
identity at rest. Then find every control, field or piece of information that is not living
in the surface whose job it matches, and move it. Concrete candidates worth checking, not a
closed list: whether a kind's administrative actions (rename, delete, permissions) are
reachable from the place a person is actually looking when they need them, rather than
requiring a trip to the palette; whether the Machine section's fields are grouped by the
question a person is asking ("is this agent expensive" vs. "is this agent alive") rather than
by the order they were added milestone by milestone; whether the workflow library, the skills
shelf and the board columns use one shared visual grammar for "a rack of things you drag from"
rather than three; whether a verb that exists in the verb table (`shared/verb-table.ts`) but
is missing one of its four doors (canvas gesture, palette row, workflow node, agent-askable)
should gain it now that the surface it belongs on is clearer. Every relocation is a targeted
change with a reason recorded — not a redesign for its own sake, and not a rename of a
`.panel__*`/`*-node__*` alias, ever, no matter how much cleaner the new name would read.

### 3. More capable

Deepen before you add: an existing feature that half-works (a field that reads but never
writes, a kind with no far-view treatment, a verb with three doors and a missing fourth) is
worth more finished than a new one started. For net-new, `docs/ideas-backlog.md` is the
existing backlog of considered-and-deferred ideas — re-read every entry with today's canvas
in mind, since several were declined for reasons that no longer hold (a milestone since
shipped the prerequisite). The v9 plan's remaining acts (M186 assets, M187 notes/text/frames,
M188 node schemas and a real executor, M189 a GitHub work-item node, M190 export/import,
M191 an extension registry, M192 feedback and a getting-started doc) are the currently-scoped
feature backlog and take priority over invention. You may also propose and build something
genuinely new if it is judged against the product thesis in the finish prompt's GOAL section
— the Orca/n8n canvas, agents and workflows as equal objects — and not against novelty alone;
record the reasoning for a net-new feature in its spec before building it, the same rigor a
plan gets.

### 3a. A second work style: tiled panels beside the canvas

One net-new feature is named explicitly rather than left to discovery, because a reference
for it exists and should be looked at, not re-derived: a screenshot of BridgeMind's own
desktop app is at
`/Users/alexnieves/.claude/uploads/69c79a70-533d-405d-b0ed-2ef23df2797c/c77fc1d8-image.jpg`
(copy it into `docs/` if you want it in the repository for the spec to reference). It shows a
mode this app does not have: no pan/zoom world at all, a plain flat sidebar (`Workspaces`,
`Pinned`, a flat `Folders` list below, each workspace row carrying a live-session count
badge and its own children when expanded), and a main area that is a fixed, edge-to-edge
TILING of resizable panes — each pane one agent session with its own small chrome (a status
dot, a `⋯` menu, a fork/duplicate icon, `+`, `X`), its live transcript, an activity line above
the composer (`Worked for 8m 23s`, `Slithering… (52s · ↓1.7k tokens)`, `auto mode on
(shift+tab to cycle)`), a composer (`Ask Codex to do anything`), and a footer line naming the
engine, its effort and its cwd (`gpt-6-astra high · ~/Desktop/bridgemind`). Panes are resized
by dragging the shared border between them and rearranged directly, with no camera and no
free x/y placement — the geometry is a proportional split tree, closer to a tiling window
manager or `tmux` than to a canvas.

The user wants this as a genuine second **work style** for this app, chosen per workspace
(or globally, your call to make and record) alongside the existing free canvas — "canvas" and
"tiles" as two ways of arranging the same panels, not two apps. This is more tractable than it
sounds because of a property `CLAUDE.md` already documents as load-bearing: a panel's
*session* (its xterm `Terminal` and its PTY, or its `AgentSessionManager` conversation) is
owned by `session-registry.ts` outside React and is independent of the *view* that renders
it, and `PanelFrame.tsx` is already a kind-agnostic frame that any panel kind renders through.
A tiled work style should be a second GEOMETRY ENGINE and a second layout container — a split
tree with resizable dividers instead of `viewport.ts`'s pan/zoom world — that hosts the same
sessions through the same `SessionHandle`s and the same `PanelFrame` chrome, never a parallel
panel system or a second place a session can live. Treat this as its own spec-and-plan-sized
piece of work (a workspace-level `layoutMode: 'canvas' | 'tiles'` field on the layout schema
with the record rules already governing every other field there; a pure split-tree module
parallel to `viewport.ts`, testable the same way under plain node; a switch that keeps a
workspace's existing canvas positions intact when tiling is left and canvas is returned to);
do not improvise it inline against a mandate meant for smaller relocations.

## PROCESS

Every milestone-shaped piece of this work — a redesign of a surface, a relocation with real
consequences, a new feature — follows this repository's fixed shape: a spec in
`docs/superpowers/specs/`, a plan in `docs/superpowers/plans/`, checks written first and
watched failing against the absent code, implementation, a fresh-context critic and a
fresh-context verifier, and a ledger line with its evidence. `npm run verify` is the one
command that must print every suite's tally at exit 0 before anything is called done;
`npm run verify:visual` (goldens) and `npm run verify:packaged` (the DMG-adjacent packaged
binary) sit outside that chain and are owed at every act close. A pure cosmetic pass over an
already-specced surface (spacing, colour, a token re-valuation) does not need a fresh spec
of its own — fold it into the ledger entry of the act it touches, with the critic's sentence
for its golden.

## INSTRUCTION PRIORITY

1. This document. 2. `AGENTS.md`. 3. `CLAUDE.md`, the design briefs, `docs/load-bearing.md`,
`docs/verify-suites.md`. 4. Any skill, plugin instruction or other contextual file. Where
this document's three mandates and the standing `v9-finish-prompt.md` authority overlap, they
agree; where its milestone ORDER would have you defer visual and IA work to "Act VIII, the
audit," this document overrides that ordering — the audit-at-the-end pattern is why the 4.0
run shipped a status bar reciting CPU and RAM for two acts before anyone looked. Do the
looking now, continuously, on every surface you touch.

## AUTONOMY

Nobody is at the keyboard after `go`. Make every design and placement decision yourself, pick
one where two are defensible, write the reason in the build log, and continue. Bias toward
action: a targeted, reasoned change beats a comprehensive rewrite, but "targeted" is measured
against the SURFACE being fixed, not against the smallest possible diff — a relocation done
by name of a scoped kind (image, workflow node, board card) to its right home is finished
work, not scope creep, when it is the thing this document asked for. Preserve everything you
did not judge broken. When something needs a person (a signing identity, a third-party
tenant), build against a fake as this repository does everywhere and record the hand check as
owed. After a successful irreversible action (a merge, a written golden, a tag), verify it did
not already happen before repeating it.

## OUTPUT

End every session with: what you looked at and what you judged already good enough to leave
(named, not implied); every relocation made and the one-sentence reason each was wrong before;
every visual change with its golden and the critic's sentence; every feature deepened or added
with its spec, its doors, and its ledger line; the `npm run verify`, `verify:visual` and
`verify:packaged` commands and exit codes; and what you would do next if the session
continued, ranked.
