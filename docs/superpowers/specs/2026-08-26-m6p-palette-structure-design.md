# M6p: Palette Structure — Design

**Status:** approved, in progress
**Predecessor:** `2026-08-26-m6-panel-legibility-design.md` (M6a shipped)
**Blocks:** M6b (settings schema), whose entire user surface is this palette

## Goal

Make `Cmd+K` organized enough to add things to.

M5b built the palette's mechanics correctly — fuzzy search, ranked rows,
disabled rows that explain themselves, four focus rules that keep xterm's
keyboard away. What it did not build is a *reading order*. The list is a flat
wall sorted by score, dominated by errands nobody runs daily, with no visual
break between kinds of thing and no highlight on the characters the user just
typed.

That is a usability problem today and a blocker tomorrow: M6b's plan puts one
row per application setting into this same list.

## The four defects, from the code

**1. The grouping is decorative.** `commands.ts`'s header comment states that
"construction order IS the grouping" because `filterCommands` sorts stably. It
does — but it sorts `(b.score - a.score) || (a.order - b.order)`, and score
wins first. Construction order is therefore the grouping only for the *empty*
query. Type one character and the groups interleave: `Delete preset Claude` can
sit directly above `New panel from Claude`, and the only thing distinguishing
them is a 68px uppercase chip that is rendered identically on every row.

**2. Preset administration is most of the list.** Each preset emits four rows —
spawn, rename, delete, make-default. `BUILT_IN_PRESETS` has three entries, so a
fresh install shows twelve preset rows before the user has created anything, of
which three are verbs anyone uses more than once a month. Counting the panel
switcher, the rename row, the save-prompt row and the two canvas rows, the
resting list is about seventeen rows in a `max-height: 46vh` window.

**3. Affordances built and left unwired.** `fuzzyMatch` returns `positions`,
documented as *"Indices into the ORIGINAL target, so the view can highlight
them"*. `Palette.tsx` renders `{row.title}` as a bare string. The data has been
computed and discarded on every keystroke since M5b.

**4. Destructive rows are instant and unmarked.** `Delete preset X` and
`Delete prompt Y` run on a single `Enter`, styled exactly like `Go to n1`.
`Reset canvas…` is the one exception, and only because main owns a dialog for
it — which is a property of that command's implementation, not a policy.

Additionally the palette teaches nothing: no footer, and exactly one row
(`Reset zoom`) names its keyboard equivalent, as a hardcoded subtitle string.

## Design

### Sections are data, not a union

The per-row group chip is deleted and replaced by headers between rows.
Sections are declared as an ordered array in `palette-model.ts`:

    export const SECTIONS: readonly SectionDef[] = [
      { id: 'panel',  label: 'Panels' },
      { id: 'spawn',  label: 'New panel' },
      { id: 'prompt', label: 'Prompts' },
      { id: 'canvas', label: 'Canvas' },
      { id: 'manage', label: 'Manage' }
    ]

Array order **is** display order and the sort key. This shape is chosen against
the closed union `CommandGroup` deliberately: M6b's plan contains a whole
section explaining that adding `'Setting'` means editing a type *and* updating
`verify:palette` check 30 together, because the order is hardcoded in both. With
`SECTIONS`, M6b appends one object literal.

### Group-first sorting, best-match selection

`filterCommands` sorts by section index, then score, then construction order.
Headers stay true while typing, and a destructive row can never leapfrog its
benign sibling.

That alone would point `Enter` at the first row of the first section rather than
at the best match, so a new pure export `bestMatchIndex(rows, query)` re-scores
the filtered rows and returns the highest-scoring **runnable** one. The view
seeds its selection from it for a non-empty query and from `firstRunnable`
otherwise. `stepRunnable` is untouched: it walks the flat array, which is now in
display order, so `ArrowDown` reads visually downward.

### Hidden at rest, never hidden from search

`Command.hiddenAtRest?: true` — present-means-hidden, the idiom
`disabledReason` already establishes. Set on preset rename/delete/make-default
and prompt delete. Those rows are dropped only when the query is empty **and**
no scope is active.

They remain fully searchable. Typing "delete" at the top level brings them back,
in the `Manage` section at the bottom. This is what keeps the rule
`verify:palette` check 31 states in its comment — *a row that disappears is
indistinguishable from a feature that is missing* — while clearing the resting
view. A design that hid them from search too would trade a cluttered palette for
an incomplete one.

### Scope drill-in

`PaletteScope = null | 'presets' | 'prompts'`, held as view state in
`Palette.tsx`; `Command.scope` names which drill-in a row belongs to. Two
always-visible rows, `Manage presets…` and `Manage prompts…`, are the
discoverable door — the feature is never reachable only by guessing a query.

Inside a scope: only that scope's rows show, `hiddenAtRest` included; a chip
renders left of the input; the placeholder becomes `Search presets…`.

`Escape` pops the scope, and only closes the palette at scope `null`.
`Backspace` on an empty query also pops. Two-stage escape is what every palette
the user already has open does, and the alternative — Escape always closing —
makes the drill-in a trap the user must re-open the palette to leave.

There is no `panels` scope. The Panels section is goto rows plus one rename row;
there is no administration errand to hide.

### Titles lose the prefix the header now supplies

Under a `NEW PANEL` header, "New panel from Claude" says "new panel" twice. Two
retitles, and only two:

| today | becomes |
|---|---|
| `New panel from Claude` | `Claude` |
| `Insert prompt: review` | `review` |

`Command.searchText?: string` carries the dropped words into `haystack()`, so
"new panel" still finds the spawn rows. Without it the retitle would silently
delete a search term people use — the row would still be there and would simply
stop being findable the way they find it. **`searchText` is the same field
M6b's plan schedules for its keyword search**, so it lands here once.

`Go to <label>` keeps its verb, asymmetrically and on purpose. The Panels
section holds goto rows *and* `Rename panel…`, so the verb still separates them
— and `verify:panels` check 39 finds that row by the literal text `Go to` before
recomputing `centreOn`'s arithmetic to prove where the camera landed. It is the
most delicate assertion in the suite and there is no benefit worth disturbing it
for.

### Confirm before destroying

`InputMode` gains `kind: 'text' | 'confirm'`. In `confirm` the palette shows the
question and `↵ confirm · esc cancel`, with no list and no editable value;
`Enter` calls `submit('')`.

The two delete actions in `Canvas.tsx` adopt the exact two-step shape
`beginRenamePreset` already uses — `setInputMode({...})` followed by
`palette.openPalette()`, including the reopen that looks redundant and is not
(`Palette.tsx` closes *before* running a row's command, so a mode set without
the reopen would be set on an overlay that is already gone).

This reuse is the whole reason the feature is cheap: M5a deferred preset editing
by name because "building a preset-manager dialog now would be the first modal
in this app, and it would collide with xterm's keyboard focus". Input mode is
that problem already solved. A confirm step inherits all four focus rules free.

`Command.destructive?: true` drives the red styling.

### Keyboard hints

`Command.shortcut?: string`, rendered as a `<kbd>` chip. Exactly two rows
honestly have one and no others are invented:

- the **default** preset's spawn row → `⌘N` (`PresetRow.isDefault` already
  carries which preset that is)
- `Reset zoom` → `⌘0`, moved out of the hardcoded `subtitle`

The first is worth more than its size. CLAUDE.md records that the default-preset
feature stayed inert through an entire milestone because nothing anywhere said
what `Cmd+N` would spawn — the out-of-the-box canvas looked correct and only a
user who edited `defaultPresetId` by hand could tell. This row says it.

A footer bar reads `↑↓ move · ↵ run · esc close`, or `esc back` inside a scope.

### Row layout

Grid becomes `1fr auto auto`: title (with `.palette__hit` spans on matched
characters) | subtitle-or-disabled-reason | `<kbd>`. The selected row gains a
2px left accent bar rather than only a background shift.

Section headers are `position: sticky`, which obliges `scroll-margin-top` on
`.palette__row`: without it `scrollIntoView({ block: 'nearest' })` parks the
selected row *underneath* a sticky header, and the failure is invisible to every
headless check because a synthetic wheel performs no default scroll in Chromium
(the limit `verify:panels` check 47 already documents).

## Non-goals

- **No mode sigils** (`>` / `@` / `#`). They are invisible to a first-time user
  and do nothing for the resting view, which is the actual complaint.
- **No recents or frecency ranking.** It needs persisted state, and a list this
  short does not earn it. Revisit if the resting list grows past M6b.
- **No panel scope.** See above.
- **No new IPC channels and no schema change.** This milestone is renderer-only
  apart from documentation.

## Verification tiers

| tier | suite | covers |
|---|---|---|
| plain node | `verify:palette` | section order, group-first sort, `bestMatchIndex`, `hiddenAtRest` both directions, `searchText`, `splitHighlight` |
| real Electron | `verify:panels` | a rendered header, scope narrowing and its Escape, a delete that Escape cancels with the preset still present |

Baselines re-derived by running the suites at `2443ae3`, because CLAUDE.md and
M6b's plan disagreed: **`verify:palette` 33** (CLAUDE.md said 32) and
**`verify:panels` 51** (M6b's plan said 48).

Three things no headless check can prove, verified by hand in `npm run dev`:
sticky headers versus `scrollIntoView`; two-stage Escape under real OS key
repeat (checks supply `repeat: true` by hand, which proves the guard *reads* the
flag, never that Chromium *sets* it); and the palette still yielding its wheel
to native scrolling over a taller list.
