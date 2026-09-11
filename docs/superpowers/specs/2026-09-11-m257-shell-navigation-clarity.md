# M257 — shell and navigator clarity

The shell should name the workspace and task before it exposes implementation details. The top
bar has one creation verb, one global retrieval field, and one View menu. Navigation is grouped
by the user's mental model, becomes a labeled rail at Wide, and keeps names plus shortcuts in
tooltips at every width.

## Top bar

- `+ Create` opens the existing creation sheet. The sheet and palette keep their established
  names; only the top-level verb stops calling every object a panel.
- The active workspace is always named. When the selected object belongs to exactly one task,
  the title is `workspace / task`.
- Search says what it retrieves: panels, files, tasks and commands.
- View owns theme, navigator visibility, context visibility and merged view. The old standalone
  merge and context icon buttons remain as DOM aliases on their menu rows so automation and
  keyboard reach do not fork.

## Dock and navigator

- Destinations are grouped as Work, Content, Connections and System. Existing navigator ids do
  not change: Canvas maps to `panels`, Tasks to `board`, Notes to `vault`, and Integrations to
  `integrations`.
- At Compact and Standard the dock remains icon-sized, with a named tooltip carrying the
  shortcut when one exists. At Wide it is a 156px labeled rail with group headings.
- The product mark is a canvas orbit rather than another four-square grid.
- The Panels navigator has All, Running, Needs you, Changed and Asleep filters. Filtering is a
  view over each row's live state, not another central subscription.
- Section headings use direct title case (`Agents 10`) and are collapsible. Collapsed group ids
  persist in `shell.collapsedRailGroups`.
- Lock and pin marks are contextual, revealed on row hover/focus. A needs-you row has an amber
  wash in addition to its state dot.

No panel, session, IPC or canvas geometry semantics change.
