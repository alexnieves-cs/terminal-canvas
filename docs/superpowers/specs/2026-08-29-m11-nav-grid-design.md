# M11 — the Cmd-held navigation grid

Backlog [#1](../../ideas-backlog.md). Hold a chord, see every workspace laid out
as a 3×3 grid, release to jump. This is the *gesture* half of workspace
switching; M7 already built the transaction underneath it.

## What this is not

Three features have worn this UI in the backlog, and two of them belong to other
entries. Recording that here so the next reader does not re-litigate it:

- **Saved camera bookmarks** are #42, explicitly "the saved-bookmark answer built
  as a data model and a palette group, **with no hold-to-reveal overlay at all**
  — #1's hard part is the gesture; this one has none."
- **Directional panel traversal** (`Cmd`+arrow to the next panel) is #32, which
  says in as many words that it "is not the same idea as #1's nav grid".
- **Viewport quadrants** were the third candidate and are rejected here: nine
  regions of a bounding box have no stable identity on an infinite canvas, so
  they are recomputed every time a panel moves. A hold-to-reveal gesture is only
  worth learning if a cell is in the same place next time, which is the whole
  argument for cells being *named* things.

So a cell is a **workspace**, and #1's own scheduling note already said so:
"self-contained once #2 gives it destinations." #2 shipped in M7.

## Success criteria

1. `Cmd+G` reveals the grid immediately, with no timer anywhere in the design.
2. A workspace occupies the same cell across launches and as other workspaces
   are added — position is stable or the gesture is not worth learning.
3. Releasing `Cmd` switches to the highlighted workspace, **demoting rather than
   disposing** — every surviving session keeps its pid.
4. There is no state in which the overlay is on screen and cannot be dismissed.
5. While it is open, no canvas shortcut fires and no bare key reaches an agent.
6. No new IPC channel: `verify:ipc` stays at 31.

## Modules

| File | Tier | Responsibility |
|---|---|---|
| `renderer/navgrid/nav-grid.ts` | plain node | `buildGrid`, `stepCell` — pure |
| `renderer/navgrid/useNavGrid.ts` | — | the held-modifier state machine |
| `renderer/navgrid/NavGrid.tsx` | — | the overlay |

`nav-grid.ts` imports nothing but types, so it joins `viewport.ts`, `lod.ts` and
`rail-rows.ts` in the cheapest verify tier as a new `verify:navgrid` suite. The
gesture is the risky half of this milestone and the arithmetic is not; keeping
them in separate files is what lets the arithmetic be checked in seconds.

## Cell assignment

`buildGrid(workspaces, activeId)` returns exactly nine cells.

- Cells 0–7 take the first eight workspaces **in stored order**.
- Cell 8 is **always** `{ kind: 'more' }` — it opens the palette in the
  `workspaces` scope. It is not conditional on there being a ninth workspace:
  a cell that appears only sometimes is a cell whose position is not stable, and
  it is the one escape hatch that must never be missing.
- Unused cells 0–7 are `{ kind: 'empty' }` and render disabled.

Growing the grid to 4×3 as workspaces are added is rejected: it reshuffles every
existing workspace's position, which destroys the muscle memory that is the only
reason to prefer this over `Cmd+K`. Truncating to the first nine with no overflow
is also rejected, on `verify:palette` 31's standing rule — *a row that disappears
is indistinguishable from a feature that is missing.*

`stepCell(cells, index, dx, dy)` moves the cursor. It **skips `empty` cells** —
the rule `stepRunnable` already obeys for the palette's disabled rows, since a
cursor that cannot be committed is a dead key — and it **does not wrap** at the
edges. Wrapping in two dimensions means an arrow at the right edge teleports the
cursor to the far left, which reads as a mis-fire rather than as navigation.

## Where the cursor starts, and what the mouse does

The cursor opens on the **active workspace's own cell**, so a release with no
arrow pressed is a no-op rather than a jump somewhere arbitrary — the gesture has
to be abandonable by doing nothing, which is how `Cmd+Tab` behaves and what makes
it safe to summon speculatively.

When the active workspace is *past* cell 7 — reachable only through `More…` — the
cursor opens on cell 8 instead. That is still the "you are here" cell in the only
sense the grid can express, and seeding cell 0 there would make a no-arrow release
jump to a different workspace, which is exactly the accident the rule above
exists to prevent.

The mouse **moves the cursor and does not commit**: hovering a cell selects it,
and releasing `Cmd` is still the only thing that jumps. One commit gesture, not
two — and a `Cmd`-held click is an awkward chord to require. Hovering an `empty`
cell leaves the cursor alone, the rule `stepCell` obeys for the arrows and the
palette already obeys for disabled rows.

## The gesture, and the three ways out

`Cmd+G` reveals, guarded on `event.repeat` — the rule `Cmd+K` already obeys,
because a held chord is one gesture and roughly fifteen events per second, and an
unguarded toggle flickers at the repeat rate. Arrows or the mouse move the
cursor. Then exactly three exits:

| Exit | Commits? |
|---|---|
| `keyup` with `event.key === 'Meta'` | yes — `switchWorkspace(cell.workspaceId)` |
| `Escape` | no |
| `blur` on `window` | no |

**The commit test is `key === 'Meta'`, deliberately not `!event.metaKey`.** The
obvious spelling asks whether the modifier bitfield has already cleared inside
the keyup for `Meta` itself, and that was probed and found **unanswerable by any
check this repo can run**: `sendInputEvent` reports back exactly the `modifiers`
array it was handed (`['meta']` → `metaKey: true`, `[]` → `metaKey: false`), so
a check written against it is circular and proves only that the harness echoes
its own input. `key === 'Meta'` is correct under both readings of that bitfield
and covers `MetaLeft` and `MetaRight` alike, so it is robustness against an
unknown rather than a bet on how it resolves.

**The `blur` handler is required, not defensive.** `Cmd+Tab` is the ordinary
instance rather than an exotic one: the user holds `Cmd`, taps `Tab`, macOS
switches applications, and the `keyup` for `Cmd` is delivered to *the other
application*. With only a `keyup` listener the overlay stays up forever, over a
canvas whose own shortcuts have stood down — with no key left that dismisses it
and no recovery short of `Cmd+R`. This is success criterion 4, and it is the one
failure in this milestone that is unrecoverable rather than merely wrong.

This app has **no `keyup` or `blur` listener anywhere today** — every keyboard
path in it is keydown-only. "A key is still held" is therefore a genuinely new
class of state here, and it is new state whose failure mode is a stuck modal.
That, and not the grid, is the expensive part of this milestone.

**Releasing on the already-active cell never calls `switchWorkspace`.** That
function is a transaction that writes the outgoing canvas before flipping the
active id; invoking it for a same-id switch would re-render the entire canvas,
re-seed the id counter and clear the undo stack in order to arrive exactly where
it already was.

## Who owns the keyboard while it is open

The grid takes **no DOM focus**, which is the one place it diverges from
`usePalette`'s four rules and the reason it is not built as a palette scope. It
needs `keyup` at the `window`, and `usePalette`'s rule 4 — `restoreFocus` on
close — would fire into the middle of a workspace switch. But xterm therefore
still holds DOM focus, so bare arrows would reach the running agent.

Two mechanisms cover that, and they are both ones this codebase already relies
on elsewhere:

1. The keydown listener is **capture-phase on `window`** and `stopPropagation()`s
   the keys it claims, so xterm's own target-phase handler never runs — the same
   asymmetry `shouldYieldWheel` uses to beat xterm to a wheel event.
2. `navGrid.isOpen` composes into `useViewport`'s `shouldIgnoreKeys` beside
   `palette.isOpen`, so `Cmd+N` cannot spawn a panel behind the overlay.

`isOpen` must be a `useCallback` reading a **ref**, never state. It sits in the
keydown effect's dependency array, and an identity that changed on every open
would tear that listener down and reinstall it — the constraint
`usePalette.isOpen` and `shouldYieldWheel` both already record.

The wheel stands down too, as a new first rule in `shouldYieldWheel` alongside
the palette's: while the grid is open every other canvas gesture yields, and it
would be strange for a pinch to zoom the world behind an overlay that has already
swallowed the keyboard.

## Where it mounts

A sibling of `.world`, beside `EdgeIndicators` and `Palette` — never inside it.
`.world` carries the single `translate() scale()` transform, so an overlay
mounted within it would pan and zoom away with the canvas, which is the opposite
of what a viewport-pinned overlay is for. This is `EdgeIndicators`' rule and the
reason it is a sibling too.

## Testing

**`verify:navgrid`** (new, plain node) — the arithmetic:

- a workspace holds its cell as the list grows (criterion 2);
- cell 8 is `more` even with two workspaces, and with twelve;
- `stepCell` skips `empty`;
- `stepCell` refuses to wrap at each of the four edges;
- the cursor seeds on the active workspace's cell, and on cell 8 when the active
  workspace is past cell 7 — the second is the case no fixture reaches by
  accident, since it needs nine workspaces to exist at all.

**`verify:panels`** (real Electron) — the gesture:

- `Cmd+G` reveals; an arrow moves the cursor;
- release switches **and every pid is preserved**. The pid clause is the whole
  check, on check 64's argument: a dispose-and-respawn satisfies every count,
  every layout read and the file on disk, and only the pid separates it from the
  demote this milestone requires (criterion 3);
- `Escape` commits nothing, read back out of `workspace.list()` rather than off
  the overlay — `verify:panels` 50's rule, that a cancel which cancels
  unconditionally is invisible and so is one that does not;
- a dispatched `blur` dismisses (criterion 4);
- `Cmd+N` while open spawns nothing (criterion 5).

**A limit to state rather than discover later.** The `keyup` and `blur` presses
in the Electron tier are dispatched or `sendInputEvent`-driven, so they establish
what the handler *does* and say nothing about what macOS *delivers* — the same
shape of gap this repo already records for `verify:panels` 32 and for the
auto-repeat checks. The specific unverified link is that a physically released
`Cmd` emits a `keyup` with `key === 'Meta'` while an Electron window has focus.
It needs a hand on the keyboard once, and it should not be written down as
checked until somebody has.

## Out of scope, deliberately

- **No setting.** The reveal chord is not configurable; a `SettingDef` here would
  be a customer-free toggle, which #11's standing rule exists to refuse.
- **No mouse-only door.** The grid is reachable only by the chord. The rail and
  the palette both already switch workspaces for a mouse user, so this adds a
  third path for the keyboard rather than a first path for anyone.
- **No reordering.** Which workspace sits in which cell is stored order, and
  there is no gesture to change it. Drag-to-reorder is a real idea and a
  different one.
