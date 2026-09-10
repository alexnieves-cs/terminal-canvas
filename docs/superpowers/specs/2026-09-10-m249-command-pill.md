# M249 — the bottom command pill

## Why

The palette answers *find anything*: an unbounded, searchable list of every row the app can
run. That is the wrong shape for the four things a person does to the canvas many times an
hour: fit it, go to the agent that wants them, glance at what is running, and act on the
selection. The pill answers *act on this canvas now*.

**Pill vs palette.** The palette is *find anything* and has an unbounded list; the pill is
*act on this canvas now*. The pill has no search and no command list. Every pill button runs
an EXISTING verb through the same `PaletteActions` executor the palette rows call
(`usePaletteActions.ts`) — there is no second implementation of any of them:

| Pill control | Verb it runs | PaletteActions member |
|---|---|---|
| Fit | `zoom-fit` | `zoomToFit` |
| Jump to attention | Cmd+J's cycle (the same `jumpToAttention` the OS-notification click runs) | `goToPanel` |
| Running agents → a row | `focus` | `goToPanel` |
| Tidy (2+ selected) | `tidy` | `tidyPanels` |
| Arrange task / Related (1 selected) | `arrange-task` / `show-related` | `arrangeTask` / `showRelated` |
| Group (2+ selected) | the palette's group row | `beginCreateGroup` |
| Close (exactly 1 selected) | `close` | `closePanel` |
| The input | the chat composer's send | `window.canvas.agentSession.send` |

`show-related` and `arrange-task` are v9 verbs, so their `V9_DOORS` canvas strings now name
the pill as well. `zoom-fit`, `focus`, `tidy` and `close` are legacy verbs outside
`closure.v9.1`, so they have no door row to update.

## Shape

`src/renderer/canvas/CommandPill.tsx` is a SIBLING of `.world` inside the clipping host,
`position: absolute; bottom; left: 50%`. It is outside the transformed layer, so it can never
change a panel's size. The expanded state grows UPWARD over the canvas. It is absolutely
positioned, never a box that pushes anything, which is the M234 SIGWINCH lesson.
`verify:panels:product pill.rects.1` pins this.

**Rest** (one meaningful state, from the pure `pillRestState()` in `command-pill.ts`, in
priority order): "N agent(s) need you" (the attention set), else "N agent(s) running", else
"N selected", else a glyph alone. It never shows a zero statement.

**Contextual** (a click on the rest pill, or `Cmd+Shift+Space`): the input, Fit, Jump,
Running, and the selection actions, which appear only when something is selected. A control
that cannot run is DISABLED with a named reason; it is never removed.

## Orchestrator

The input's target is the workspace's orchestrator chat: the first chat panel with
`chat.supervisor === true`, or else the first with `chat.orchestrator` set. If neither
exists, the first send creates a supervisor chat through the sheet's existing
`beginNewChat({ title: 'supervisor', appendSystemPrompt: SUPERVISOR_PROMPT, message })`.
The text lands in that chat's composer **unsent**, because M81's rule is that nothing starts
work unread. The pill then says what it did. Before that, the input's placeholder names the
affordance: "no orchestrator yet — first send creates a supervisor chat".

## Focus rules

- The pill's buttons are `shellControl`s: mousedown `preventDefault`, so focus never leaves
  xterm's textarea.
- Only the input takes focus, and only when a person clicks it or uses `Cmd+Shift+Space`.
  A click on the rest pill expands it WITHOUT focusing, so a Fit click leaves the keyboard
  with the agent.
- `pillFocused()` is part of `shouldIgnoreKeys`. Cmd+V/C/Z/Shift+Z are menu accelerators, so
  without it a paste aimed at the pill would go into the focused terminal, and Cmd+Z could
  dispose a panel. The pill subscribes to `edit:copy`/`edit:paste`/`edit:undo`/`edit:redo`
  itself and acts only while its input holds `activeElement` (the Palette precedent).
- The root stops keydown/mousedown/wheel propagation, as `NewObjectRow` does.
  `shouldYieldWheel` also yields over `.command-pill`, because a bubble-phase stop cannot
  stop `useViewport`'s capture listener.
- Escape collapses the pill and restores focus to the element that held it when the shortcut
  opened the pill.

## Declined

- Close on a multi-selection. `close` is the dispose and ends processes. A single pill
  button that ends several agents at once is a new destructive gesture no other door offers,
  so Close is enabled for exactly one selected panel, and otherwise disabled with its reason.
