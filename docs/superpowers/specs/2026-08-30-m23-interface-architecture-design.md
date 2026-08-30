# M23 — Interface architecture: an app shell that can absorb the backlog

> **What this document is.** A design spec for restructuring the application's
> information architecture, its panel chrome, and its theming — not a visual
> refresh. M10 already built the visual system and `verify:styles` polices it;
> what M10 did not do, and could not have, is decide **where things go** once
> the app has more than three regions and more than one panel kind. This spec
> decides that, and it decides it against the twenty-odd unshipped entries in
> [`docs/ideas-backlog.md`](../../ideas-backlog.md) rather than against the app
> as it stands today, because the app as it stands today has no room for any of
> them.
>
> **Read the Diagnosis first.** Every proposal below is an answer to a measured
> number in it, and a proposal read without its number reads as taste.

**Status:** design approved 2026-08-30. Not yet planned; see
[Sequencing](#10-sequencing) for the six phases and which of them are
independently shippable.

---

## 1. Diagnosis — measured, not asserted

### 1.1 The chrome budget

`.shell` ([styles.css:290](../../../src/renderer/styles.css#L290)) is a fixed
four-column grid:

```
grid-template-columns: 220px  240px  1fr  260px
                       tree   rail   canvas  inspector
```

**720px of chrome before the canvas gets a pixel**, plus a 56px top bar. On a
1440×900 built-in display — the ordinary case for this app's user — the canvas
is 720px wide. **The canvas is the product, and it has exactly half the
window.**

There are no breakpoints. The numbers are the same on a 13" laptop and a 32"
external display, so the constrained case and the roomy case are equally badly
served: one is starved, the other wastes 1100px of canvas it could have had.

### 1.2 Three regions, one job

Of the three side regions, **two are driven by the same selection**:

| Region | Keyed on | Shows |
|---|---|---|
| Tree (220px) | the **selected** panel's cwd | that panel's directory |
| Inspector (260px) | the **selected** panel | that panel's identity, work, cost |
| Rail (240px) | the whole canvas | workspaces, all panels, attention |

So on a laptop, 480px of a 1440px window is two columns describing **one
panel**. That is not a layout that got crowded; it is a layout that never
decided what its regions were for.

### 1.3 The rail's sections cannot grow

`SideRail` renders three sections unconditionally — Workspaces, Panels,
Attention — and the CSS caps two of them so "a long workspace list cannot push
the panel outline off screen"
([styles.css:445](../../../src/renderer/styles.css#L445)). The cap is the right
call given the constraint, and it is the constraint that is wrong: three lists
of unbounded length are sharing one column's height, so **each is permanently
capped at roughly a third of it**, forever, and a fourth section (groups #35, a
run ledger #46, search results #16) has nowhere to go at all.

### 1.4 The inspector is an unbounded scroll of heterogeneous sections

Six sections today, in one non-collapsing 260px scroll:

```
Panel  →  Links  →  Actions  →  Toolbox  →  Changes  →  Cost
```

Three separate problems, and they compound:

- **Identity scrolls away.** "Which panel is this" is the question that
  qualifies every other section's answer, and by the time the user has scrolled
  to Cost it is off screen. A figure with no subject is worse than no figure.
- **Four rhythms in one scroll.** Identity is static; Changes re-reads when the
  agent goes idle; Cost re-reads every 2s; Toolbox re-reads on an explicit
  refresh. Interleaving a static fact with a value that moves every two seconds
  means the thing the user is reading moves under them.
- **No priority.** Every section uses the same `--t-xs` caps heading and the
  same field-list shape, so `cwd`, `$4.12 list price` and `3 files changed` all
  read at one weight. The value ramp is doing hierarchy's whole job and it
  cannot.

**And four more sections are queued behind them**: the environment report
(#47), usage history (#19), discard (#51), and the write half of the toolbox
(#26).

### 1.5 Actions are an undifferentiated wall

Every verb in the pane is `.inspector__action`. Restart, Save as preset,
Review, Link and **Close** carry the same affordance, mid-scroll, so the
destructive one sits beside the benign ones with nothing separating them. The
palette solved exactly this — destructive rows are *marked* **and** gated
behind a confirm, and `CLAUDE.md` records why both halves are needed ("a red
row still runs on one `Enter`, and an unmarked confirm is a question the user
did not expect to be asked"). The inspector inherited neither half.

### 1.6 Five panel kinds, five hand-rolled headers

`terminal`, `review`, `file`, `jira` and `toolbox` all ship today. The CSS says
each "reuses `.panel` for its box, its chrome and its resize" and then each
declares its own heading, refresh control, note line, list and summary.
Measured by grepping the stylesheet's own class names:

```
__summary   ×3      __refresh   ×3      __note   ×3
__more      ×3      __body      ×3
```

Near-duplicates, not exact ones — which is the harder kind to spot and the kind
that drifts. **Four more kinds are queued** (chat #8, groups #35, annotations
#15, spreadsheets #14 tier 2), and the backlog's own structural note says nine
separate entries all need "a canvas node that is not a terminal".

### 1.7 Chrome vanishes exactly when it is needed (#60)

At `scale = 0.3` a panel's chrome bar, close button and resize handles are 30%
size. **The controls that let you manage the canvas are smallest at precisely
the zoom where you are looking at the whole canvas.**

### 1.8 The zoomed-out view is the least informative view in the app (#22)

A card at 45% and a card at 8% render the same thing: `handle.tail(6)`. At 8%
that is a grey smear. `LIVE_MIN_SCALE` already encodes the argument one rung up
— "below this, terminal text is unreadable anyway and a card is honest" — and
the same argument applies one rung further down, where the card's own text is
unreadable and a card is no longer honest.

### 1.9 An empty canvas is indistinguishable from a broken one (#38)

Every canvas shortcut is `Cmd`-gated **by design**, because bare keys belong to
the agent TUI. That trade was correct and it hands the entire discovery burden
to a first-run experience that does not exist. A new user sees a grey field, a
zoom percentage, and no affordance whatsoever.

### 1.10 There is one theme, and no switch (#10)

M10 did the expensive half — every colour is a token inside a single
`:root[data-theme="dark"]` block, structural tokens live on bare `:root` where
a theme cannot reach them, and `verify:styles` 1/7/8 police the split from both
sides. Nothing sets `data-theme`, nothing reads `prefers-color-scheme`, and no
light palette exists.

---

## 2. Principles

Six rules. Each exists because breaking it fails **silently**, which is the
standard this repository already documents its invariants against.

**P1 — Chrome is summoned; the canvas is resident.** The default state of any
region is the one that gives the canvas the most room its width can justify.
A region that is resident by default has to earn it at that width, not in
general.

**P2 — One question per surface.** A surface answers one question. "Which panel
is this" and "what did it cost" are two questions and must not share a scroll
position.

**P3 — Adaptation is measured on `.shell`, never on the window.** See
[§7.1](#71-the-window-must-never-be-measured). This is the single most
dangerous line in the whole spec.

**P4 — A render decision is never a resource decision.** How a panel *draws* at
a given zoom has no resource consequence and must never become a state in
`assignTiers`, which rations WebGL contexts and PTYs and is deliberately pure.

**P5 — Anything a far-away or restored panel shows must be a `Panel` fact.**
Not terminal content. A dormant panel's xterm buffer is empty and `tail()`
returns `[]` — which is *every panel on the canvas the moment the app starts*.

**P6 — A new surface inherits the palette's rules, it does not re-derive them.**
Destructive is marked **and** gated. Disabled is visible with a reason, never
absent — "a row that disappears is indistinguishable from a feature that is
missing". Focus is never stolen from the terminal.

---

## 3. The shell — an adaptive dock

### 3.1 Shape

```
┌────────────────────────────────────────────────────────────────────┐
│ ⬤⬤⬤   terminal.  [+ New panel]           ⌘K    ⚙   ◫   ⛶      │ 56px
├────┬──────────────┬────────────────────────────┬──────────────────┤
│ ⌸  │              │                            │  ▌ auth refactor │ ← pinned
│ ▤  │  NAVIGATOR   │        C A N V A S         │  ● idle · 41293  │
│ ⌷  │    260px     │                            │ ─────────────────│
│ ⚑③ │  ONE pane    │                            │ Detail Work Tools│ ← tabs
│ ⌕  │  at a time   │                            │                  │
│    │              │                            │   …scrolls…      │
│ 48 │              │                            │ ─────────────────│
│    │              │                            │ [Restart]  ⋯   ✕│ ← pinned
└────┴──────────────┴────────────────────────────┴──────────────────┘
```

### 3.2 The dock (48px, always visible)

An icon column, and the **only** permanently resident chrome besides the top
bar. Each icon selects the navigator pane; clicking the active one collapses
the pane.

| Icon | Pane | Status |
|---|---|---|
| `⌸` | Workspaces | today's rail section |
| `▤` | Panels | today's rail section |
| `⌷` | Files | today's tree region |
| `⚑` | Attention | today's rail section, **plus a badge** |
| `⌕` | Search | #16, future — the dock is where it lands |
| `✎` | Annotate | #15, future |

The dock is what makes a fifth and sixth navigator cheap: adding one is a row
in an array, not a negotiation over a column's height (§1.3).

### 3.3 One pane at a time — and what it costs

This is the central move, and it has one real cost worth stating plainly rather
than burying.

**What it buys:** each navigator gets the full column height instead of a
capped third of one, and a new navigator costs nothing structural.

**What it costs:** you lose "3 waiting, *and their names*" at a glance, because
Attention is no longer resident.

**Why that is acceptable here specifically:** the canvas already carries
attention twice. M6d's edge indicators point at every off-screen waiting panel,
and `Cmd+J` jumps to the head of the queue without acknowledging it. The rail's
Attention section is the *third* copy of a fact already on screen. So the
mitigation is:

- **A count badge on the dock icon**, always visible — this is the half that
  must not be lost, and it is what keeps a waiting agent from becoming
  invisible.
- **A popover on click**, not a full pane, because attention is transient and
  interruptive and a popover is the shape that matches. It composes with #37
  (sound) and #17 (OS notification) later.

**Risk, recorded rather than hidden:** if in use the badge proves insufficient —
if users report missing a waiting agent they would previously have seen — the
fix is to make Attention pin itself resident *while non-empty* at the Wide
breakpoint, which is a rule this structure can express and today's cannot.

### 3.4 Breakpoints

Container queries on `.shell`, on `inline-size`:

| Width | Chrome | Navigator | Context | Canvas @1440 |
|---|---|---|---|---|
| `< 1100` — **Compact** | **48px** | transient drawer | transient drawer | — |
| `1100–1600` — **Standard** | **~308px** | resident (one) | drawer | **1132px** |
| `≥ 1600` — **Wide** | **~608px** | resident | resident | — |

At 1440 the canvas goes **720px → 1132px**: **+412px, +57%**.

**Transient drawers are legitimate; resident overlays are not.** In Compact the
panes overlay the canvas rather than narrowing it, which looks like the thing
[§7.1](#71-the-window-must-never-be-measured) forbids and is not. The
distinction is *dwell*: a drawer is dismissed on outside click and by `Escape`,
exactly as the palette is, and the palette has been a canvas-overlaying surface
since M5b with `shouldYieldWheel` rule 1 already written for it. A **resident**
overlay would put panels permanently under chrome and make every world
coordinate a lie. A transient one is a surface the user opened and is about to
close.

### 3.5 Per-breakpoint state falls out of the existing sparse map

`preferences` is deliberately sparse: an id absent from the map means "still at
the schema default", so a default can be changed later and actually reach
people. That gives the adaptive behaviour for free, with **no schema change and
no tri-state**:

- **Absent** → the breakpoint decides whether the region is resident.
- **Present** → the user touched it, and the user wins at every width.

`shell.railOpen` and `shell.inspectorOpen` keep their ids and their `boolean`
type. The standing rule (#11: one `SettingDef`, never a bespoke home) is
untouched, and `parsePreferences` needs no new arm.

### 3.6 The top bar

Unchanged in principle — it is already correct that it is quiet, that `+ New
panel` is the only beveled control because it is the only **verb**, and that
every control mounts `shellControl()`. Three changes:

- **Zoom moves to the canvas HUD.** `−  100%  +  Fit` is a *view* control and
  belongs with the other view readout, in the corner that already holds one.
  This frees the bar's left group.
- **`Merged` becomes `◫`**, an icon toggle keeping `aria-pressed` and the
  held-down `--on` treatment. Both halves stay, for the reason `TopBar.tsx`
  already gives: a screen reader needs the state named and the button has to
  look held down.
- **`⛶` enters focus mode** (#23), and the spec names it *Zoom to fit panel*
  rather than *Maximise*, because those are two different features that look
  identical in a screenshot and the backlog is explicit that one must not
  silently stand in for the other.

---

## 4. The context pane

### 4.1 Shape — pinned header, tabs, pinned actions

```
┌──────────────────────────────┐
│ ▌ auth refactor              │  identity — PINNED, never scrolls
│ ● idle · zsh · pid 41293     │
├──────────────────────────────┤
│  Detail  │  Work  │  Tools   │  tabs
├──────────────────────────────┤
│                              │
│      …the active tab…        │  the only thing that scrolls
│                              │
├──────────────────────────────┤
│ [ Restart ]      ⋯        ✕ │  actions — PINNED
└──────────────────────────────┘
```

### 4.2 Tabs are grouped by question, not by feature

| Tab | Answers | Holds today | Absorbs later |
|---|---|---|---|
| **Detail** | *What is this panel?* | fields, links, spec-vs-resolved, live cwd/command | — |
| **Work** | *What has it done, and what did it cost?* | Changes (M9a), Cost (M17) | run ledger #46, usage history #19, discard #51 |
| **Tools** | *What can it do?* | Toolbox (M21) | environment report #47, toolbox write half #26 |

Three tabs, four queued sections absorbed, **no fourth tab needed** — which
keeps it under the five-to-six ceiling above which a tab set stops being
scannable.

Tabs rather than an accordion, deliberately: these are equally-important views
the user switches *between*, which is the case tabs serve; an accordion serves
"control what is visible upfront", which is a different job and would restore
§1.4's interleaving of four rhythms in one scroll.

**The identity header is the fix for §1.4's worst symptom.** It carries the
honest chain (`title ?? status.command ?? spec.command ?? 'login shell'` — M6a),
the agent-state dot, and the pid, and it does not scroll. The Cost figure is
never on screen without its subject.

### 4.3 `inspectorSignature` must keep covering hidden tabs

**Narrowing the signature to the active tab is the obvious optimisation and it
is wrong.** `Canvas` freezes the inspector model on that signature, so a value
the signature does not cover renders once and never updates again. Narrow it to
the visible tab and switching to **Work** shows the totals from whenever the
user last looked at Work — stale, plausible, and with nothing thrown. That is
precisely the freeze `verify:rail` 75 exists to catch, reintroduced through a
new door.

The cost of keeping it whole is a re-render of a memoised pane roughly every
two seconds while a pinned panel accumulates usage. That is nothing. **Keep the
whole-model signature; add a check that a usage change moves it while a rect
change does not** — which `verify:rail` 86 already asserts and which must stay
green through this restructure.

### 4.4 Actions become a pinned bar with three ranks

| Rank | Treatment | Members |
|---|---|---|
| **Primary** | beveled, per §P6 the bevel means "this does something" | Restart (terminal) · Commit (review) · Save (file) |
| **Secondary** | `⋯` overflow menu | Save as preset · Review · Link · Move to workspace |
| **Destructive** | segregated right, `--red` on hover, **confirm-gated** | Close |

The bevel rule is inherited rather than invented: `--bevel-*` is documented as
belonging to **verbs only**, because "if every chip in the app is extruded then
extrusion stops carrying information".

The confirm gate on Close is a genuine behaviour change and it is deliberate.
`CLAUDE.md` records that three surfaces close a panel and only the panel's own
`✕` arms, on the reasoning that the rail and inspector rows act on a panel the
user "has already deliberately selected and then aimed at a labelled control".
That reasoning held when the control was one of five identical buttons a scroll
away. It does not hold for a button pinned in a fixed position at the corner of
the pane, which is a mis-click target in a way a mid-scroll button is not.
**Adopt the same one-click arming `TerminalPanel` already uses** rather than a
modal — this app has exactly one modal-shaped surface and should keep it that
way.

### 4.5 Hierarchy inside 260px

The value ramp cannot carry hierarchy alone (§1.4). Three ranks, using tokens
that already exist:

- **Identity** — `--t-lg`, `--font-display`, `--fg`. The only display type in
  the pane.
- **Section headings** — `--t-xs` caps at `--track-caps`, `--fg-3`. Today's
  treatment, unchanged.
- **Figures that answer a question** — `--t-md`, `tabular-nums`, `--fg`;
  their labels `--t-sm`, `--fg-3`. A dollar total and a file count are what the
  user came for and must outweigh their own labels, which they currently do not.

---

## 5. The panel chrome system

### 5.1 One frame, kinds supply content

`PanelFrame`, one `.pf-*` namespace, replacing five hand-rolled headers:

```
.pf                       the box — border, radius, elevation, state accent
├── .pf__chrome           counter-scaled 1/scale, clamped [1, 2.5]
│   ├── .pf__state        agent-state dot, or the kind glyph
│   ├── .pf__title        the honest chain — ONE implementation
│   ├── .pf__meta         kind-supplied one-liner (cwd · file path · "3 files")
│   └── .pf__actions      kind-supplied controls, then close
├── .pf__body             kind-supplied — NEVER counter-scaled
└── .pf__handles          counter-scaled
```

A kind supplies a meta line, a body, and an action list. It supplies **no**
heading, refresh control, note line, summary or `+N more` — those become
`.pf__note`, `.pf__summary`, `.pf__more` once, and the three current copies of
each collapse into them.

### 5.2 The counter-scale boundary is load-bearing

**`.pf__body` must never be counter-scaled, and the reason is not cosmetic.**
A transform on the subtree hosting xterm changes what `getBoundingClientRect()`
reports while `dimensions.css.cell.width` stays transform-blind — which is
*exactly* the arithmetic `pointer-correct.ts` exists to compensate for. Counter-
scale the wrong node and the correction factor is wrong by a second unknown,
and every click in that panel lands on the wrong cell with nothing thrown.

This goes in the code as a comment on the rule itself, not only here.

The clamp band `[1, 2.5]` bounds the other direction: an unclamped `1/scale` at
`MIN_SCALE` (0.1) would render chrome at 10× and a header would cover the
canvas.

### 5.3 Kind accent — existing doctrine, no new colours

| Kind | Accent | Why |
|---|---|---|
| terminal | agent-state colour | it has an agent |
| review, toolbox | `--iris` | app identity — the app's own artifact, not an agent's activity |
| file | `--fg-3` | a document is neutral |
| jira | `--blue` | external system |

`--iris` is already defined as "app identity, never agent state", so a review
node taking it is consistent with the token block rather than an exception to
it.

### 5.4 One status dot, one rule set

The same four state colours are currently declared across roughly five selector
lists (panel border, card stripe, rail dot, inspector dot, edge pip). One
`PanelStatusDot` component, one CSS rule keyed on `data-agent-state`.

**Constraint:** `.panel--agent-wants-you` must keep `border-color: var(--amber)`
**un-transformed**, because `verify:panels` 62 and 97 compare the two by
*resolved value*. Any consolidation that routes amber through a mix, a filter
or an alpha breaks both checks — which is the correct outcome, since the border
colour is the only evidence a user has that the jump key did not acknowledge.

---

## 6. Semantic zoom (#22)

### 6.1 Three render tiers, and they are not `Tier`

| `viewport.scale` | Renders |
|---|---|
| `≥ 0.60` | full chrome + body |
| `0.25 – 0.60` | title in display face, state dot, one metric |
| `< 0.25` | coloured block, kind glyph, title only if it fits |

**This must not become a fourth state in `assignTiers`.** That function decides
who holds a WebGL context and a PTY; it is pure, plain-node tested, and adding
"how does a card draw" to it makes the file that rations contexts start making
typography decisions. Two separate questions reading the same `viewport.scale`
(P4).

### 6.2 Hysteresis

A 0.05 band on each threshold. A card flipping between two renderings while the
user pinches is the same class of thrash `DEMOTE_DELAY_MS` and `CULL_MARGIN_PX`
exist to prevent — cheaper here because nothing is destroyed, still visibly bad.

### 6.3 The far tiers may only show `Panel` facts

P5, and this is where it bites hardest. The one metric each far tier shows must
come from the `Panel` or from a store keyed on its id — title, agent state,
cost, waiting — and **never** from `handle.tail()`. A dormant panel has never
been attached, its buffer is empty, and that is every panel on the canvas the
moment the app starts. A far tier sourced from terminal content is blank on
exactly the view it was built for.

This also resolves §1.8 in the direction #53 wants later: when a real
last-screen source exists (a `serialize` snapshot at `detachSlot`, or
`capture-pane` on a surviving tmux session), it feeds the **near** card only.
The far tiers never wanted it.

---

## 7. Invariants this must not break

Seven, each with the silent failure first.

### 7.1 The window must never be measured

**Failure:** edge pips aim at the window's edge while the canvas ends 308px
earlier, and every world point the HUD reports is off by the dock's width.
Nothing throws.

**Rule:** adaptation is a **container query on `.shell`**. It never enters JS,
it only changes grid track widths, and the canvas already tolerates that
because `useViewport`, `Canvas` and `EdgeIndicators` all measure the `.canvas`
host at event time. No `window.innerWidth`, no `ResizeObserver` on the window.

### 7.2 A resident region is a grid column, never an overlay

**Failure:** panels sit permanently under chrome and every
`getBoundingClientRect()` in the canvas is a lie.

**Rule:** Standard and Wide panes are grid columns. Only Compact's **transient**
drawers overlay, and they are dismissed on outside click and `Escape` like the
palette (§3.4).

### 7.3 No chrome takes DOM focus

**Failure:** the button works and the next keystroke goes nowhere.

**Rule:** every control in the dock, the panes and the tab strip mounts
`shellControl()`, whose `onMouseDown: preventDefault` is the whole mechanism.
`verify:panels` 75c and 157 both go red if it is dropped, and 157 must drive a
**real** `sendInputEvent` — a synthetic `MouseEvent` is `isTrusted: false` and
moves no focus whether or not `preventDefault` fires, so a dispatched check
passes against the exact regression.

### 7.4 Nothing here may spawn a process

**Failure:** one agent CLI per panel, launched by a view change, on a restored
canvas.

**Rule:** navigating in a pane is `goToPanel` (frame, select, raise) and never
`onSelectPanel` (which clears dormancy and calls `registry.wake`). Waking stays
behind the explicit start control on dormant rows only. Entering any new mode
resolves dormancy **before** it commits, the ordering M18's merged view had to
learn.

### 7.5 The frozen-rows architecture survives

**Failure:** the shell rebuilds its lists at 60Hz during every drag, invisibly
on a four-panel canvas.

**Rule:** every row array the panes take stays frozen on a signature.
`treeSignature` and `railSignature` both use `JSON.stringify` and not a
separator join, because a filename is agent-written text and a wider forgery
door than a user-typed title. New arrays inherit this; adding an unfrozen one
defeats the memo outright.

### 7.6 Chrome standing down is one predicate

**Failure:** `Cmd+N` spawns a panel behind an open drawer; `Cmd+G` reveals the
nav grid over a commit draft and the field goes dead.

**Rule:** a drawer being open composes into `shouldIgnoreKeys` and
`shouldYieldWheel` the way `palette.isOpen` and `navGrid.isOpen` already do —
one predicate, not a copy. And the four `edit:*` menu accelerators are
main-process IPC that passes through no renderer keydown, so they need the
guard explicitly; `verify:panels` 123 is the check.

### 7.7 The theme block split holds

**Failure:** a radius or a duration inside a theme block is a value every
future theme has to remember to repeat.

**Rule:** structure on bare `:root`, colour only in `[data-theme]` blocks.
`verify:styles` 7 and 8 police both directions and must stay green.

---

## 8. First run and empty states (#38)

### 8.1 Keyed on `panels.length === 0`, never on "nothing running"

**Failure if keyed wrong:** a restored canvas has no output and no processes
until its panels are woken, so a first-run state keyed on activity appears on
top of a perfectly good workspace.

### 8.2 Not a tour

A modal walkthrough of an app whose pitch is "it is a canvas, put things on it"
is a contradiction. Instead:

- **A centred launcher card**, in display type, offering the three real verbs —
  *New panel* · *Open a file* · *Choose a preset* — each calling the **real**
  create path. A hardcoded first-run panel is `SEED_PANELS` with a nicer name
  and will diverge from whatever placement and presets decide later.
- **A gesture hint strip**, bottom-centre, naming pan / zoom / `⌘K` / `⌘N`,
  each hint fading permanently once its gesture has been used once. Persisted
  in the settings map, so it does not come back.
- **A shell-probe failure banner.** `shell-env.ts` logs loudly and the
  user-visible consequence is "command not found" in every panel with no
  explanation. One line naming the actual cause is worth more than the rest of
  this section.

### 8.3 The other empty states

| Surface | Today | Should say |
|---|---|---|
| Attention pane | ✅ handled | — |
| Workspaces pane | ✅ handled | — |
| Panels pane | no rows rendered | "no panels — ⌘N to start one" |
| Context pane, no selection | ✅ summary | — |
| Files pane, panel has no cwd | — | which panel, and why there is nothing |
| Search results (#16) | — | distinguish "no matches" from "nothing indexed" |

The rule the rail already follows generalises: **a header with a void under it
reads as a broken list**, so every section that renders unconditionally owes an
empty state.

---

## 9. Theming (#10)

### 9.1 The setting is an enum, and this is the moment that earns it

`SettingDef['type']` is `'boolean' | 'number'`
([settings-schema.ts:49](../../../src/shared/settings-schema.ts#L49)).
`CLAUDE.md` records that an earlier draft added `'enum'` and it was removed
"rather than given a type-mapping layer, since a customer-free abstraction is
exactly what `ideas-backlog.md` #11 warns against."

**That objection expires here.** `appearance.theme` — `system` | `light` |
`dark` — is the customer. Add `'enum'` properly, with a `values` array, and
extend `parsePreferences` to reject a value outside it the same way it already
rejects an out-of-range number. Faking it as two booleans would produce two
switches that can disagree, which is the failure "One map, and a typed view
over it" exists to prevent.

### 9.2 The CSS half is a second block, exactly as M10 designed

A `:root[data-theme="light"]` block. Specificity, not source order, decides —
`:root` is `(0,1,0)` and `:root[data-theme="light"]` is `(0,2,0)` — so it can be
appended without reordering anything.

**The ground must be the lightest thing in the app, without exception.** This
is the dark block's own rule inverted, and it is inverted for the same stated
reason: translucency reads as glass only when the pane differs from what is
behind it, so a light theme whose canvas is darker than its panels makes panels
sink instead of float. The surface ramp keeps the **same delta-L\* discipline**,
≥ 2.6 between adjacent steps, ~22 L\* end to end.

`--iris` at `#67e8f9` fails on a light ground and needs a darker twin. Every
`--*-dim` tint needs re-mixing: an alpha chosen against `#050507` does not
survive against a light surface.

### 9.3 The expensive half is xterm, and it is most of the work

Terminal colours are `Terminal` **options**, not CSS. A stylesheet swap will not
change one character of terminal output. So:

- `create-terminal.ts` owns the palette — it is the one place a `Terminal` is
  constructed.
- The **registry** fans the change across every session, including detached
  ones.
- Every session needs `refresh(0, rows - 1)` afterwards. `verify:xterm` already
  established that a detached terminal does not repaint on its own; a themed-
  but-stale terminal shows the old palette until something else forces a redraw.
- **A light ANSI palette is mandatory, not optional.** Agent CLIs emit colours
  chosen for a dark ground; an unadjusted 16-colour palette on white produces
  genuinely unreadable output.
- **Cards render app CSS, not xterm's theme.** `tail()` is styled by the
  stylesheet, so the two palettes must be authored together or a card visibly
  disagrees with the panel it represents.

Whichever of theming and #36 (per-panel font size) ships first should build the
**fan-out**, not a one-off — both are `Terminal` options fanned across the
registry.

### 9.4 `verify:styles` 11 measures the second block for free

It recovers every `--fg*` and `--s-*` hex from the theme block and computes real
WCAG contrast for every text token against every surface it can land on. A
second block gets the same measurement with no new check — **provided the
check's selector is widened to iterate theme blocks rather than assume one.**
That widening is Phase 5's first task, not a loose end.

Read its header comment before trusting a green run: it renders nothing, so it
can say the stylesheet obeys the rules and nothing at all about whether the app
looks right. **There is no visual regression test in this repository, and that
is a position rather than an omission.**

---

## 10. Sequencing

Six phases, 0 through 5. **Each is independently shippable** — the app is coherent after any
of them — and they are ordered so the largest measurable win lands first.

### Phase 0 — Foundations (no visual change)

Container query scaffolding on `.shell`, the `.pf-*` namespace declared beside
the existing `.panel` rules, `'enum'` added to `SettingDef`, and
`verify:styles` 11 widened to iterate theme blocks. Nothing on screen moves.

**Success:** `npm run verify` green, and a screenshot before and after is
byte-identical.

**Why it is separate:** it is the only phase with no visual diff, which makes it
the only one where a regression is unambiguous.

### Phase 1 — Dock and navigator ← *the biggest win*

Tree, rail and inspector regions become dock + one navigator pane + one context
pane. Breakpoints land. Attention becomes a badge plus a popover.

**Success:**
1. At a `.shell` inline-size of 1440, `.canvas` measures **1132px ± 1**
   (`verify:panels` 73's exact-inset assertion, restated for the new grid).
2. A panel under the reclaimed width is still **promoted** — the second clause
   of 73 and 125, and not tautological once §7.4's dormancy ordering is in play.
3. Switching navigator panes spawns **nothing** — session count scoped to the
   affected ids, unchanged (`verify:panels` 148's shape).
4. A Compact drawer is dismissed by outside click **and** `Escape`, and a wheel
   over it moves no camera (`verify:panels` 47/105's pair, third surface).
5. Every dock and pane control passes the **real-`sendInputEvent`** focus check
   (§7.3).

**Risk:** highest of the six. Every check in `verify:panels` that asserts an
inset or a promotion is in scope.

### Phase 2 — Context pane

Pinned identity, three tabs, pinned action bar with three ranks, hierarchy
inside 260px.

**Success:**
1. The identity heading is on screen with **every** tab active — asserted for
   all three, since one is a scroll position and three is a structure.
2. `inspectorSignature` **still moves** on a usage change while a rect change
   leaves it byte-identical (`verify:rail` 86, unchanged and green).
3. Close is **marked destructive and gated** — read back from the panel list,
   not off the overlay, per the palette's own rule that a confirm which confirms
   unconditionally is invisible.
4. The Work tab renders current figures **immediately** after being switched to
   from Detail, having been hidden while they changed (§4.3's whole point).

### Phase 3 — Panel chrome and semantic zoom

`PanelFrame` absorbs five kinds. Counter-scaled chrome (#60). Three render
tiers (#22).

**Success:**
1. All five kinds render through one frame; the five ×3 CSS duplicates
   (`__summary`, `__refresh`, `__note`, `__more`, `__body`) are **one each**.
2. `.pf__body` carries **no transform at any scale** — asserted as source text
   *and* by `__m4aCellToScreen` at a scale ≠ 1, because this is the failure with
   no visible symptom (§5.2).
3. `assignTiers` is **unchanged** — asserted as source text, since P4 has no
   runtime symptom when broken.
4. A dormant panel renders a **non-empty** far tier (P5 — the check that fails
   against a `tail()`-sourced implementation).
5. Chrome hit targets are ≥ 24px at `scale = 0.2`.

### Phase 4 — First run and empty states

**Success:**
1. The launcher appears with zero panels and **not** on a restored canvas whose
   panels are merely dormant (§8.1 — the clause that discriminates).
2. Its verbs call the **real** create path — a panel minted through it is
   indistinguishable from one minted by `⌘N`.
3. A faded hint stays faded across a relaunch.
4. Every unconditionally-rendered section has an empty state (§8.3).

### Phase 5 — Light mode

**Success:**
1. `verify:styles` 11 computes contrast for **both** blocks and both pass.
2. Switching themes re-themes **every** session including detached ones, and a
   re-attached terminal shows the new palette **without** a further redraw
   (§9.3 — the clause that fails against a fan-out that skipped detached
   sessions).
3. A card's preview and its panel's terminal agree in both themes.
4. `appearance.theme` round-trips through a write and a reopen, and a value
   outside its `values` array is dropped with a warning.

### Beyond — what Phases 1–2 make cheap *(not scheduled here)*

`⌕` Search (#16), `✎` Annotate (#15) and the minimap (#33) each land as one
dock entry and one pane, which is the whole point of Phases 1–2. They are named
here to show the structure absorbs them, not scheduled.

---

## 11. What this deliberately does not do

Six, each a decision rather than an oversight.

- **No new colour direction.** M10's palette is measured and checked; this spec
  adds a second theme block and touches no dark value.
- **No motion language beyond what exists.** `--dur-1`/`--dur-2`/`--ease` and
  the `prefers-reduced-motion` block are sufficient. A pane that slides is a
  pane that is slower than one that appears.
- **No draggable or resizable panes.** VS Code's drag-a-view-between-sidebars
  affordance is a layout-persistence problem of its own, and one pane at a time
  removes most of what it is for.
- **No minimap.** #33 is one dock entry once Phase 1 lands, and it has its own
  unresolved question — whether semantic zoom makes it redundant — which this
  spec does not settle.
- **No panel-kind additions.** Chat (#8), groups (#35) and annotations (#15)
  each get *cheaper* here; none is designed here.
- **No visual regression test.** Its absence remains a position. Every success
  criterion above is a measurable fact — a width, a count, a source-text
  assertion — precisely because the eye is not available as an instrument.

---

## 12. Open questions

Four, each named rather than defaulted into.

1. **Which side does the single Standard-breakpoint pane take?** Navigator-left
   is conventional; context-right is where the current inspector is and matches
   the selection-follows-the-canvas reading. Probably a preference, which under
   the standing rule is one more `SettingDef` and nothing else.
2. **Does the attention badge suffice?** §3.3 records the trade and the fallback
   (pin Attention resident while non-empty at Wide). This is the one item that
   should be answered by use rather than by argument.
3. **Does focus mode (#23) imply only that panel is live?** Pinning the budget
   to one panel frees seven contexts and demotes seven running agents because
   the user zoomed in — the kind of decision-on-their-behalf dormancy exists to
   avoid. Probably not, but it must be a decision.
4. **Where do the semantic-zoom thresholds actually sit?** 0.60 and 0.25 are
   reasoned, not measured. They should be checked against a real canvas at a
   real panel size before Phase 3 closes, the same standing caveat
   `agent.idleAfterMs`'s 1500ms default carries.

---

## 13. How the backlog lands on this

Not a commitment — the README milestone table is still the roadmap contract.
This is the argument that the structure absorbs what is queued.

| Entry | Where it lands | Cost after this spec |
|---|---|---|
| #16 search | dock entry + navigator pane | one pane |
| #33 minimap | dock toggle + canvas overlay | one toggle |
| #15 annotations | dock mode + `.pf` accent | one mode |
| #35 groups | a `Panel` kind through `PanelFrame` | one kind |
| #8 chat | a `Panel` kind through `PanelFrame` | one kind |
| #46 run ledger | **Work** tab | one section |
| #47 environment report | **Tools** tab | one section |
| #19 usage history | **Work** tab | one section |
| #51 discard | **Work** tab, destructive rank | one action |
| #26 toolbox write half | **Tools** tab | one section |
| #22 semantic zoom | **Phase 3** | shipped here |
| #60 zoom-independent chrome | **Phase 3** | shipped here |
| #38 first run | **Phase 4** | shipped here |
| #10 light mode | **Phase 5** | shipped here |
| #32 keyboard-first | dock is tabbable; terminal boundary unchanged | partial |
| #53 real card previews | feeds the **near** tier only (§6.3) | unblocked |

**Ten of the sixteen become "one pane" or "one section" instead of "a
negotiation over a column's height".** That is the whole argument for doing
this before any of them rather than after.

---

## 14. References

Interface research consulted while writing this:

- [VS Code — Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout)
  and [User Interface](https://code.visualstudio.com/docs/getstarted/userinterface):
  the activity-bar-plus-one-view pattern §3.2 adopts, the secondary sidebar
  §4 mirrors, and Zen mode as the precedent for §3.4's Compact breakpoint.
- [Accordions vs. Tabs — Buckeye UX](https://bux.osu.edu/blog/accordions-vs-tabs/)
  and [Tabs UX best practices — Eleken](https://www.eleken.co/blog-posts/tabs-ux):
  the five-to-six ceiling and the switch-between-views versus
  control-what-is-visible distinction §4.2 turns on.
- [Progressive disclosure — IxDF](https://ixdf.org/literature/topics/progressive-disclosure)
  and [GitLab Pajamas](https://design.gitlab.com/patterns/progressive-disclosure/):
  the tiered-controls and persist-the-user's-choice rules §3.5 implements
  through the existing sparse preferences map.
- [tldraw SDK](https://tldraw.dev/homepage) and
  [Figma's properties panel](https://www.superbcrew.com/how-to-use-figma-a-cloud-based-interface-design-tool/):
  contextual-panel-follows-selection as the norm for canvas tools, which §1.2
  finds this app already doing **twice** with two different regions.

Internal, and load-bearing:

- [`CLAUDE.md`](../../../CLAUDE.md) — every invariant in §7, and the reasoning
  each one records.
- [`docs/ideas-backlog.md`](../../ideas-backlog.md) — §13's entries, and the
  structural note that nine of them want the same thing.
- [`docs/superpowers/specs/2026-08-29-m10-visual-system-design.md`](2026-08-29-m10-visual-system-design.md)
  — the token system this spec builds on and does not revisit.
