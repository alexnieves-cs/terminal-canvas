# M63 — The state vocabulary

**Status:** design, 2026-09-02. **Branch:** `m63-state-vocabulary`.
**Brief principles built against:** 1 (one vocabulary), 2 (the state edge), 5 (one accent),
7 (three states), 8 (the chrome does not compete). Surface milestone: shot, looked at,
critiqued.

## What this milestone is for

The question a supervisor asks most is "what is everyone doing". The app knows — main's
detector, the registry's status and the dormancy flag — and says it four different ways:
the rail says `dormant` and `pid 87468`, the panel's pill says `idle` and `pid 87468`, the
card says `click to start` in 32px, the summary tier says `busy`, and the attention popover
says nothing but a name. M61's critic read one panel in two surfaces of one screenshot and
got two words. This milestone makes the word one word, computed in one place, and gives it
one mark — the state edge — that reads at every zoom.

## Failure modes this guards against

- Two surfaces disagreeing about a panel's state (the critic's finding 5), which teaches the
  user that neither is trustworthy.
- A state legible only as a border tint on a live panel, invisible on a card at 20% (finding
  3) or in the rail (finding 48, where pid, kind and state share one slot).
- The interface's own accent (iris) and the "working" hue (blue) reading as the same
  signal (finding 13): the focused ring is blue today.
- A card whose loudest text is a 32px instruction (finding 14).

## Design

### One function

`src/renderer/panels/panel-state.ts`, pure, plain-node checked in `verify:rail`:

```
panelState(input: { kind: RailTailKind, status: PanelStatus | undefined, dormant: boolean },
           agent: AgentState | undefined): { word: string; tone: Tone }
```

Words, in the order they are tested:

| condition | word | tone |
|---|---|---|
| kind is review / file / note / toolbox / jira | the kind name | `kind` |
| dormant | `asleep` | `asleep` |
| status undefined or `idle` | `not started` | `none` |
| status `starting` | `starting` | `starting` |
| status `error` | the message | `exited` |
| status `exited` | `exited N` | `exited` |
| running, agent `wants-you` | `needs you` | `needs-you` |
| running, agent `busy` | `working` | `working` |
| running, agent `idle` | `idle` | `idle` |
| running, agent `starting` | `starting` | `starting` |
| running, no agent word known | `running` | `idle` |

`Tone` is the closed set `kind | asleep | none | starting | working | needs-you | idle |
exited`. The CSS maps each tone to one hue (`--blue` working, `--amber` needs-you, `--green`
idle, `--red` exited, `--fg-4` none/starting, dashed `--line-strong` asleep, `--fg-3` kind)
in ONE place: `[data-tone="…"]` rules, which the edge, the rail dot, the pill and the far
tiers all read. No other selector names a state hue.

`railTail` becomes a one-line wrapper (`panelState(...).word` with no agent state) so every
existing `verify:rail` fixture keeps compiling; its expectations are restated for the new
words. The pin: no renderer file outside `panel-state.ts` contains the literals `'dormant'`,
`'not started'`, `'needs you'`, `'working'` or `'asleep'` as display strings — `verify:rail
state.2` reads the tree as text.

### Where the word appears

- **Rail row:** the right column is the word. `RailRow` carries the input (`kind`, `status`,
  `dormant`) rather than a precomputed tail, because the agent half of the answer changes
  without `registry.version()` (the store fans out per id) and the row already subscribes to
  it; the row computes the word. pid leaves the rail — it is in the inspector's pinned
  header and Detail tab. The left column stays the state dot for terminals and becomes a
  kind glyph for the other kinds (five small icons added to `icons.tsx`).
- **Panel pill:** `StatusBadge` becomes the state word with `data-tone`, for every
  terminal. The machine-cost badge stays.
- **Card:** the 32px instruction goes. The tail tier shows the word as a small tone-coloured
  line (`.panel__card-state`) above the existing `.panel__card-idle` affordance, which keeps
  its exact text `click to start` (three checks read it) but at chrome size. The summary tier
  shows the word; the block tier is filled with the tone.
- **Attention popover:** anchored beside the bell (a caret on the dock edge, bottom-aligned
  to the button), each row reads `label · needs you` with a trailing chevron and the title
  "Go to …"; the empty state stays `nothing waiting`.
- **Status strip:** the focused-panel token gains its label: `focus: twin`.

### The state edge

`.pf::before` — a 3px column on the frame's left edge, full height, in the tone's colour,
radius matching the frame's left corners. Present on every kind (kind tone for the
non-terminal kinds). The existing whole-border tint for `wants-you` and `exited` STAYS: the
attention glow is a separate, checked property (`verify:panels` 62/97 compare resolved
border colours) and the brief says needs-you may be the loudest thing on screen. The edge is
what survives at far zoom and on a card; the glow is what says "now".

### One accent

`.panel--selected` moves from `--blue` to `--iris`. Blue is now only ever "working".

### The card's tail, rows as rows (backlog #53, rewritten down)

`SessionHandle.tail(n)` returns the last `n` rows of the viewport as rows — interior blank
rows kept, trailing blank rows trimmed — instead of the last `n` non-empty trimmed lines
from the whole buffer. A TUI's card then shows the bottom of its real screen with its layout
intact rather than six fragments of a box frame. Colour is NOT carried: rendering ANSI in
the card is a second renderer, and the scope decision's "serialize-at-detach" phrasing is
amended to this narrower form.

## What it must not break

- `registry.version()` carries nothing new; the rail row's word is computed from a per-id
  subscription exactly as its dot was.
- Every `data-agent-state` attribute the checks read stays where it is.
- The `.panel__card-idle` text stays byte-identical.
- `assignTiers` and `card-detail.ts` are untouched: the word is a rendering of facts they
  already produce.

## Checks

- `verify:rail state.1` — every (kind × status × dormant × agent) combination yields one of
  the vocabulary's words with a tone from the closed set; `state.2` — the text pin above;
  `state.3` — `railTail` agrees with `panelState` for every fixture the older checks use.
- `verify:panels state-edge.1` — a live panel that rang its bell has an edge whose
  computed `::before` background equals the resolved `--amber`, and a dormant panel's equals
  the asleep tone; `state-word.1` — the pill and the rail row read the same word for the
  same panel in three states (asleep, working, needs you); `state-popover.1` — the popover
  row carries the word and a chevron and its title starts with "Go to".
- `verify:styles tone.1` — every `data-tone` value in the renderer has a rule, and no
  selector outside the tone block names an agent hue for a state.

## Definition of done

The function and its checks; every surface above rendered from it; `npm run shot`, my own
look, a critic holding the brief, the build log's accept/reject record; `npm run verify`
green alone; merged; branched.
