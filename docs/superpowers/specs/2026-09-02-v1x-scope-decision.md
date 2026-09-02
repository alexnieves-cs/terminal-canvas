# Terminal Canvas 1.x — the features-and-interface run: what it contains, and what it does not

> **What this document is.** The decision record for the run that starts after 1.0.0 and
> M61: which milestones it contains, in what order, each with a definition of done, and
> every open backlog entry decided — in, cut, or rewritten down — with the reason. It sits
> beside `2026-09-01-v1-scope-decision.md`, which it revisits rather than replaces: several
> of that document's cuts were made under a ship deadline that no longer applies, and
> several of its "in" decisions produced surfaces M61's critic found thin.

**Status:** decided 2026-09-02. Milestones M62–M70. The build log records progress; where
the plan changes mid-run, this file is amended and the amendment is dated.

**The number this starts from is M62**, from the milestone table after M61 repaired it.

---

## 1. The argument

The brief for this run says: make it better and make it yours, and if the highest-value work
is making *starting a panel*, *finding a panel* and *knowing what every agent is doing*
excellent rather than adding anything, that is a legitimate answer. M61's critic, given only
pixels, found defects against all three: the launcher is a stock modal; every palette and
search row leads with a temp path; a panel's state is written two different ways in one
screenshot and its loudest text is "click to start". The design brief
(`2026-09-02-design-brief.md`) turns those into principles. This run is the brief executed,
in the order that lets each milestone be looked at on the finished chrome of the one before.

So the answer to the author's question is: **mostly yes — the run is those three things, made
excellent — plus the handful of features that make them excellent** (a spawn sheet with a
directory and a one-off command, the state vocabulary with its edge and its minimap, the
context pane finished) **and one ship milestone**. Eight backlog features the previous run cut
stay cut; three come in because the three daily things need them; two come in because the
critic's findings need them.

## 2. Where this overrules the brief or the previous decision, in writing

- **The previous scope decision cut the minimap (#33)** on the argument that semantic zoom
  makes it redundant. Overruled: M57 shipped semantic zoom and the zoomed-out canvas is still
  the least informative view in the app (critic 3, 46). A minimap that draws *state* rather
  than rectangles is the persistent status board the third daily question needs, and it is
  the only surface visible while working at 100%. In, M69.
- **The previous decision cut ad-hoc task panels (#55)** on the fit-before-spawn collision.
  Overruled in a narrow form: a typed command from the spawn sheet becomes a focused panel,
  and a focused panel is promoted live unconditionally by `assignTiers`, so it spawns through
  the ordinary path with no new "spawn at a stated grid" door. In, M65, with that constraint
  stated as its design.
- **The previous decision cut zoom-independent chrome (#60)**; this one keeps it cut but takes
  the half of the complaint that matters — controls vanishing at far zoom — through the state
  edge and the summary tier applying to every kind (M63, M69), never by counter-scaling a
  node near `.panel__slot`.
- **M45's "dot grid at a visible alpha" and resting panel shadows are retired** by the brief
  (§5 Colour). M45's own stated direction is what the brief enforces; the implementation
  departed from it and nobody looked.
- **The brief's candidate list** (minimap, focus mode, annotations, zoom-independent chrome,
  live-tier cards, ad-hoc panels, spawn-time mode choice, lock/pin, panes, images, time
  machine, placeholders, toolbox editing and query, second usage adapter, two windows) is
  decided entry by entry in §3. Four of the fifteen are in (minimap, ad-hoc panels,
  spawn-time mode choice, live-tier cards). The rest are cut with reasons that are about this
  product rather than about time.
- **The order puts the state vocabulary (M63) before finding (M64) and starting (M65)**,
  although the author listed starting first. The state word and the state edge are what the
  rail row, the Go-to row and the spawn sheet's "recent panels" all render; building them
  first means the other two are built once, on the final row shape.

## 3. Every open backlog entry, decided

Read alongside `docs/ideas-backlog.md`. Entries the backlog lists as gone are not repeated.
"Unchanged" means the previous decision's cut stands for its stated reason and nothing in
this run changes the reason.

| # | Entry | Decision |
|---|---|---|
| 4 | Multiplayer | **Cut, unchanged.** One person, one machine. |
| 8 | Chat box; cross-vendor model choice | **Cut.** A chat panel is a different product's feature. Spawn-time *choice* of mode/effort/model for the existing agent kinds is **in — M65**, as fields on the spawn sheet reading the same `agentOptions` M23 built; no vendor table. |
| 9 | Integrations / super-app | **Cut, unchanged.** |
| 12 | Jira leftovers (Server/DC, OAuth, second provider) | **Cut, unchanged.** The Jira panel's no-credential **dead end** (critic 25) is a defect and is **in — M68**: a Connect verb that opens the palette's credential row. |
| 13 | Image drop / clipboard paste | **Cut.** The path handoff shipped in M59; clipboard images need a temp-file lifecycle nothing else here needs. |
| 14 | Panels that are other apps, tiers 2–4 | **Cut, unchanged.** |
| 15 | Annotation layer | **Cut.** The input-arbitration decision is the whole cost and nothing in the three daily things needs ink. Notes (M27) remain the text case. Revisit after this run if the canvas-as-memory thesis wants it. |
| 19 | Accounting: history, second adapter, un-pinned panel | **Cut, unchanged.** A retention store with one customer; an adapter with no request; a guess that blames the wrong agent. |
| 20 | Two windows | **Cut, unchanged.** `LIVE_BUDGET` would have to become an app fact. |
| 23 | Focus mode (maximise) | **Cut.** Zoom-to-fit exists (M56); maximise is a resize the handle already performs, and its budget question has no good default. The "surprise underneath" is recorded and does not need a feature to remember it. |
| 24 | Links: selection, routing, port sides | **Cut, unchanged.** |
| 26 | Toolbox: cross-panel query, editing | **Cut.** The query is attractive ("which panel can deploy") but it is a fourth palette scope on a run whose finding milestone is about identity and text; the editing half is a different risk posture. The Tools tab **does** gain the permissions section it is missing (critic 23) — **M68**. |
| 27 | Prompt placeholders | **Cut, unchanged.** Expanding a project prompt makes the same file behave differently in and out of the app. |
| 28 | Accounts | **Cut, unchanged.** |
| 31 | Secrets rule | **Standing.** Nothing in this run moves bytes off the machine; the spawn sheet's recent-directories list holds paths only. |
| 33 | Minimap | **In — M69.** Overruled, see §2. State blocks, top corner, `canvas.minimap` setting off by default, a named camera verb, wheel yield for chrome, outside `.world`. |
| 34 | Preset env overrides, template sets | **Cut, unchanged.** Env captures secrets; sets have no request. The spawn sheet makes a single spawn cheap enough that a set is three keystrokes. |
| 40 | Remote read-only view | **Cut, unchanged.** |
| 41 | Review's live-cwd resolution | **Cut, unchanged.** Both cwds are shown. |
| 46 | Run ledger | **Shipped in M52**; its Work-tab section must say "no runs yet" when empty — **M68**. |
| 48 | Lock and pin | **Cut.** Pin is a third author of the live budget; the armed close and the group frame cover the mis-click. |
| 53 | Live-tier cards showing the last real screen | **In — M63, rewritten down (amended 2026-09-02 while building it):** the card's tail is read as ROWS — anchored on the last non-empty row, interior blanks kept — so a TUI's card shows the bottom of its real screen with its layout intact. Colour is NOT carried: `serialize`-at-detach would need an ANSI renderer in the card, a second renderer. `capture-pane` stays cut. |
| 55 | Ad-hoc task panels | **In — M65**, narrow form; see §2. |
| 60 | Zoom-independent chrome | **Cut**, with its complaint answered elsewhere; see §2. |
| 64 | Rationing terminal memory | **Cut, unchanged.** No observed failure. |
| 65 | Panes inside a panel | **Cut, unchanged.** |
| 66 | Images in the terminal | **Cut, unchanged.** |
| 67 | Layout time machine | **Cut, unchanged.** Makes reset reversible. |
| 69 | HUD gesture line | **Shipped in M56**; unchanged. |
| 70, 72, 73 | Harness, hook namespace, flag registry | **Cut, unchanged.** Scoped ids and `verify:meta` 22 carry the argument; the screenshot harness is the one harness this run adds. |
| 74 | Updates | **Cut, unchanged.** No updater exists. |
| 77 | Link-drawing leftovers | **Cut, unchanged.** A hand check. |

**Invented, in no backlog entry, and where the idea came from:**

- **The state edge** (M63) — from the critic's finding that state, kind and pid share one
  slot, and from M57's block tier, which already paints a card in its state colour at far
  zoom: the edge is that block's colour brought back to every zoom.
- **The spawn sheet** (M65) — from watching the harness type a title into the palette and
  press Enter to go somewhere: the same shape, pointed at *starting* rather than finding.
  A directory picker with the focused panel's live cwd first is the concrete thing the
  daily user does by hand today (open a shell, `cd`, run `claude`).
- **"Every control says what it is"** (M66) — from nine critic findings under "cannot
  identify", which is a category the dead-end audit did not have.

## 4. The milestones

Nine, M62 through M70. Each on its own branch, merged when `npm run verify` is green, with a
spec and a plan under `docs/superpowers/`, a build log, a fresh-context verifier, and — for
every milestone but M62 and M70 — `npm run shot`, my own look, and a fresh-context critic
holding the brief.

| # | Milestone | Definition of done |
|---|---|---|
| **M62** | **The two documents** | This file and the design brief, committed. No code. |
| **M63** | **The state vocabulary** (surface) | One pure function `panelState(status, agentState, dormant)` → one of the seven words, plain-node checked, and it is the ONLY source of a state word in the renderer (pinned as text: no other file spells `'not started'`/`'dormant'`). The state edge on every panel frame, rail row, card and far-zoom block, in the state's hue; the pill and the rail column read the same word; the attention popover is anchored to the bell, names the state, and each row has a visible "jump" verb; the focused ring is iris. The rail's left column becomes a kind glyph; pid leaves the rail for the inspector. The dormant card's "click to start" becomes a chrome-sized "start" affordance. Live-tier cards show their last real screen (#53). The status strip's focused-panel token is labelled. Every check in `verify:panels` that reads a rail/pill string is restated for the vocabulary. Shot, looked at, critiqued. |
| **M64** | **Finding a panel** (feature + surface) | Go-to rows and search hits lead with the title in mono, then state, then a left-truncated path hint; the search empty state names the term; the palette scrolls to the top on every query change; fuzzy scoring over panel rows matches title and state, and paths only contiguously; a `state:` prefix in the query filters Go-to rows by state word ("needs you" first). `verify:palette` checks for each; `verify:panels` for the scroll-to-top and the hit row's text. |
| **M65** | **Starting a panel** (feature + surface) | A spawn sheet in the palette (`New panel…`, the top bar button, and the launcher's lines all open it; `⌘N` stays the instant default): preset, directory (the focused panel's live cwd, then recent directories, then a typed path), title, and for an agent preset its mode/effort/model; Enter spawns a FOCUSED panel at the viewport centre through the ordinary create path. A typed command instead of a preset spawns a task panel whose title is the command and whose pill reads `exited N` when it ends. The launcher is reshaped per the brief. Recent directories persist in the layout with absent/malformed rules. Every field disabled-with-reason where it cannot apply (no agent → no mode). Checks in `verify:palette` (sheet rows, reasons), `verify:layout` (recents parse), `verify:panels` (a sheet spawn is live and focused; a task panel reports its exit). |
| **M66** | **Every control says what it is** (surface) | Every icon-only control has a `title` and `aria-label` (pinned as text in `verify:rail`/`verify:styles`); the dock's pressed state is unmistakable; the merged view gets its own glyph, a "Merged view · read-only" label in the top bar while active, and lane labels at chrome size; the status strip's tokens are labelled; the compact breakpoint's drawers run full height with an opaque strip; the context pane's action bar is a proper row; the file panel's edit toggle shows its state; the hint strip says "hints fade once used". Shot at all three breakpoints, critiqued. |
| **M67** | **The frame, second pass** (surface) | The brief's frame: hairline boundary, no resting shadow, `--e-3+` only on overlays; dark-theme hairlines visible; the ground flat, no dot grid; file Save in the chrome row; group remove labelled; discard and commit share one verb treatment; the toolbox title is `toolbox · <repo name>`; the subagent notice gets a leader line to its panels. `verify:styles` pins the no-resting-shadow and no-grid rules. Shot in both themes, critiqued. |
| **M68** | **The context pane finished** (feature + surface) | Work: Changes, Runs, Cost each three-state; Tools: commands and permissions; Detail: no field repeated from the pinned header, COMMAND/ASKED FOR collapsed into one line that says when they differ. The Jira panel's no-credential state has a Connect verb. Files pane names its root panel; Workspaces pane carries rename, delete (armed) and the merged-view door. Checks in `verify:rail` for each section's three arms. |
| **M69** | **The overview** (feature + surface) | Summary and block tiers apply to every kind; the minimap (#33) as state blocks in a top corner, toggled by `canvas.minimap`, click and drag move the camera through a named verb, wheel over it yields; `verify:viewport` for the minimap projection; `verify:panels` for the toggle and a click. Shot at 22% and 100% with the minimap, critiqued. |
| **M70** | **Ship 1.1.0** | Version, README's "what it looks like" section with three of the harness's own images described, CLAUDE.md and `docs/load-bearing.md` reconciled, the manual-only list re-read (struck where M61's harness now covers a visual fact by eye — it does not, and the list says so), `npm run package` and `verify:packaged` run with numbers, `graphify .` full. |

### Sequencing rationale

- **M63 first** because the state word and edge are what M64's rows, M65's sheet and M69's
  minimap all render.
- **M64 and M65 next** because they are the daily things and they are features; a restyle by
  M67 costs them one row each.
- **M66 and M67 after** so the labels and the frame are applied once to finished surfaces.
- **M68 after M66** because the context pane's action bar is M66's.
- **M69 late** because the minimap draws M63's blocks on M67's ground.
- **M70 last.**

### If the plan is wrong

A milestone that stops being believed changes here, dated, with the reason. The build log
records the change first.

## 5. What this plan will still not prove

- The manual-only list at the end of `docs/load-bearing.md` is unchanged by a screenshot
  harness: pixels prove what painted, not what a real keypress or dialog does. M61 did not
  strike an item and M70 is not expected to. Any new native surface this run adds (none is
  planned) joins the list.
- A critic's report is evidence about a rendering, not about the app: the harness drives the
  renderer with synthetic events on the direct backend, so tmux-specific chrome (reattach
  states, the "no tmux" strip's absence) is not in any image.
