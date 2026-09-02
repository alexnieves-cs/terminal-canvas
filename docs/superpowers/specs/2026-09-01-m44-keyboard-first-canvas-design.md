# M44 — A keyboard-first canvas, and the accessibility that comes with it

**Status:** designed 2026-09-01.
**Backlog entries:** #32 (keyboard traversal, screen readers, the boundary),
#63 (the spatial order the palette's panel list never had).

## What this milestone is for

Every canvas shortcut is `Cmd`-gated because agent TUIs claim every bare
key — including `Tab`, which is autocomplete in all of them, and `Escape`,
which is how you interrupt an agent. That trade is right and it leaves two
holes. A user who cannot use a trackpad has no way to move between panels
except `Cmd+K` and typing a name, and no way OUT of a focused terminal at
all: once xterm's hidden textarea holds DOM focus, every keystroke is the
agent's, and the chrome — which is already tabbable, every control being an
ordinary button — is unreachable. And the chrome names almost nothing to a
screen reader: the panels are anonymous `div`s, the attention list changes
silently, the canvas is a region with no role.

## Decisions

### 1. Traversal moves SELECTION, never focus

`Cmd+←/→/↑/↓` selects the nearest panel in that direction from the
selected one (or from the focused one, or from the panel nearest the
camera's centre when nothing is selected). `nearestInDirection(rects, from,
dir)` is pure, in `canvas/spatial-order.ts`, bundled beside `viewport.ts`
in `verify:viewport`: candidates are the panels whose centre lies in the
half-plane ahead of `from`'s centre, scored by distance along the axis plus
twice the perpendicular offset, so a panel dead ahead beats a nearer one far
to the side. No candidate: the selection stays. It calls `selectAndRaise`
— the switcher's verb, which raises and frames but NEVER wakes — because
`assignTiers` pins the FOCUSED panel live unconditionally, and arrowing
across a restored twelve-panel canvas with focus attached would spawn
twelve PTYs and blow through `LIVE_BUDGET` on the way. Traversal
highlights; a second, deliberate key focuses.

### 2. `Cmd+Enter` focuses, and wakes, the selection

The deliberate key. It calls `onSelectPanel` — the click path, which clears
dormancy and spawns — and then `registry.focus`. A dormant panel woken this
way is the same act as clicking its card, which is the only thing that
should ever start a process on a restored canvas.

### 3. `Cmd+Escape` is the one chord out of a terminal

It blurs xterm's textarea, clears `focusedId` (the background click's
release — the panel may now be demoted, exactly as after a click on empty
canvas), and moves DOM focus to the canvas host, which gains `tabIndex=0`
so `Tab` from there walks the chrome in DOM order: rail, canvas, inspector,
with the top bar first. `Escape` alone stays the agent's. The README's
Keyboard table says which key is the way out, in one line, because the
boundary is honest only if it is stated.

### 4. Names for a screen reader, and one live region

- The canvas host: `role="application"`, `aria-label="Canvas"`, and
  `aria-roledescription="infinite canvas of terminal panels"`.
- Every panel (all five kinds): `role="group"` and an `aria-label` from the
  honest chain plus its kind — "claude — terminal", "review: claude".
- The rail's Attention list: `aria-live="polite"`, so a panel entering
  `wants-you` is announced without stealing focus.
- Every icon-only control already carries `aria-label`; M45's SVG icons
  take `aria-hidden`. Toggle buttons carry `aria-pressed` (the merged
  toggle already does; the rail/inspector toggles gain it).
- The palette's list: `role="listbox"` with `role="option"` rows and
  `aria-activedescendant` on the input, so the selected row is announced.

### 5. xterm's screen-reader mode is a setting, fanned across the registry

`accessibility.screenReaderMode` (boolean, off) — off because xterm's mode
maintains a live DOM mirror of the buffer, which is expensive precisely
because everything else here avoids DOM text under WebGL. The registry
gains `applyTerminalOptions(partial)`, which sets the option on EVERY
session's terminal including detached ones (the terminal object outlives
its host), and `SessionHandle` gains `configure(options)`. This fan-out is
built generally on purpose: M45's theme and M49's font size are the next
two callers, and the backlog says whichever ships first should build it
rather than a one-off. **What xterm cannot offer, stated plainly:** a
carded panel has no terminal on screen and therefore no mirror to read; a
live panel's mirror announces output as it arrives and nothing before it;
and the mode does not make a full-screen TUI's layout meaningful to a
reader — it reads lines. Those limits go in the README's accessibility
section, not only here.

### 6. The palette's panel list has an order

`orderPanels(rects, viewport, size, lastFocusedAt)` — pure, beside
`nearestInDirection` — lists on-screen panels first (by distance from the
camera's centre), then the rest by recency of focus. `Canvas.tsx` orders
`panelRows` through it. A separate function over the same inputs
`assignTiers` reads, never a fourth return value from `assignTiers`: the
file that rations WebGL contexts must not start answering presentation
questions (#63's own constraint).

## What it must not break

- **Dormancy outranks focus, and traversal never wakes**: 1 goes through
  `selectAndRaise`; only 2 wakes.
- **`shouldIgnoreKeys`**: every new chord stands down while the palette or
  the nav grid is open.
- **`shellControl`'s no-focus rule** for mouse presses is untouched; Tab
  focus is a different path and is the whole point of 3.
- **`registry.version()`** carries nothing new; `applyTerminalOptions` is a
  fan-out over existing handles.

## Verification

- `verify:viewport` `keyboard.1–.4`: the cone prefers dead-ahead over
  nearer-but-sideways; no candidate answers null; four directions from one
  fixture; `orderPanels` puts on-screen first then by recency, stable for
  ties.
- `verify:registry` `keyboard.1`: `applyTerminalOptions` reaches a live AND
  a detached session's terminal, and a session created afterwards inherits
  the current options.
- `verify:layout` `keyboard.1`: the setting.
- `verify:palette` `keyboard.1`: rows keep the context's order.
- `verify:panels` `keyboard.1–.4`: `Cmd+→` selects the panel to the right
  and spawns nothing (session count scoped to the target id); `Cmd+Enter`
  wakes and focuses it; `Cmd+Escape` moves `document.activeElement` off
  xterm's textarea and a real `Tab` then lands on a shell control; the
  panels carry `role="group"` with labels and the Attention list is
  `aria-live`.
