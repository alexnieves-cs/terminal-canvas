# M66 — Every control says what it is

**Status:** design, 2026-09-02. **Branch:** `m66-labels`.
**Brief principles built against:** 6 (every control says what it is), 9 (copy), 7 (three
states), 3 (identity). Surface milestone: shot at all three breakpoints, looked at, critiqued.

## What this milestone is for

M61's critic had a category the dead-end audit never had: *cannot identify*. Nine controls
fell into it — the merged-view button (the Workspaces glyph again), the amber triangle at the
canvas edge, the status strip's tokens, the dock's pressed state, the kind dot, the rail's
▶, the file panel's edit toggle, the fit icon, the context toggle. Two more milestones added
findings of the same shape: hints that fade with no visible rule; settings rows whose
sentence is cut mid-word; a palette list that clips through a row; a context pane whose
action bar lost its row heights; the compact breakpoint's drawers cutting panels and the
strip. None of these is a feature. Each is a control whose failure mode is confusion.

## Design

Ordered by where a daily user meets them.

### The top bar and the dock

- The merged-view button gets its own glyph (three horizontal lanes) and, while active, a
  text label beside it: `merged view · read-only` in the top bar, in the muted ink — the door
  out is the same button, now reading `back to <workspace>` on hover.
- The dock's pressed state becomes unmistakable: the iris fill stays, plus a 2px iris bar on
  the dock's left edge for the active pane (the same "bar in the left slot means selected"
  the rail uses). Every dock button keeps its label; the tooltip already names the pane.
- The context toggle reflects its state (`aria-pressed`, the `--on` fill it lacks).

### The canvas edge and the far view

- The attention pip is labelled: a small mono chip beside the triangle with the panel's name
  and `needs you`, so an amber wedge at the canvas edge is never a mystery. Pips already
  carry the panel id; the label reads the rail row's label through the same rows.
- The merged view's lane names render at chrome size, in a lane header that does not scale
  with the world (a screen-space overlay positioned from the lane rect, the way the HUD sits
  outside `.world`), and the active lane says `this workspace`.

### The rail

- The wake ▶ becomes a labelled control: `start` in the mono face, iris on hover, still
  `shellControl`.
- The state column right-aligns to one edge whether or not a row carries a start control
  (the start control gets a fixed slot on every terminal row; sessionless rows leave it
  empty), so the words form a column.

### The context pane

- The action bar is a grid, not a wrapped flex: Restart full width on its own row, the three
  secondary actions on one row, Close at the end of that row. No button is ever a column.
- The file panel's edit toggle shows its state: `aria-pressed`, the `--on` fill, and the
  label `editing` beside the pencil while it is on.

### The compact breakpoint

- A drawer runs from the top bar to the bottom of the shell, ABOVE the status strip and the
  hint strip (both get an opaque ground and a z-index above the drawers' backdrop); the
  strip stays one line and never hides under a drawer.

### The palette

- Settings rows: the hint wraps to two lines rather than cutting a sentence with an ellipsis;
  the settings descriptions are rewritten in the palette's own voice (lower-case, no full
  stop, a verb) in `settings-schema.ts` — one voice per column.
- The list clips on a row boundary: its max-height is a whole number of rows.
- A row that matches only through its hidden `searchText` (no visible highlight) ranks
  below rows with a visible match at equal section: `filterCommands` adds a visible-match
  bonus so `Tidy everything` does not lead a query for `group`.

### The hint strip

- The strip says its rule once, as its last hint: `hints fade once you have used them`.
- The status strip's zoom cluster names its verbs on hover (already) and the fit icon gains a
  visible `fit` label at the standard and wide breakpoints.

## What it must not break

- `shellControl` on every control; the `verify:rail group-keys.2` shape extends to every
  `<button` in `src/renderer/shell` and `src/renderer/canvas`: no `onMouseDown`-only button.
- The HUD stays `pointer-events: none` except its zoom cluster.
- The merged view stays read-only; its lane header is chrome and carries no verb.

## Checks

- `verify:rail labels.1` — text scan: every `<button` in the renderer carries `aria-label`,
  `title` or visible text within its element; `labels.2` — every `.icon-button` class site
  has an `aria-label` or `title` on the same element.
- `verify:styles compact.1` — the drawer rules set `top` to the top bar and `bottom: 0`, and
  the strip's z-index exceeds the drawers'.
- `verify:palette voice.1` — every setting description is lower-case-initial and has no
  trailing full stop; `rank.1` — a row with a visible title match outranks a searchText-only
  match in the same section.
- `verify:panels labels.3` — the merged view's top bar shows `merged view · read-only` while
  active and the lane header reads the workspace name at chrome size; `labels.4` — an
  attention pip carries a chip naming its panel.

## Definition of done

Every item above, the checks red first where a check exists for its shape, shot at 1000,
1440 and 1800 wide, looked at, critiqued, merged, branched.
