# M188 — sticky notes, free text, and frames that name a region

The second milestone of Act IV, and the one that makes the canvas a place to think rather
than only a place to run things. Three more objects, each equal to a panel in selection,
movement, marks, grouping, undo and export — and none of them a process.

## The three kinds

`note` (a sticky): `{ kind: 'note', note: { text: string; tint: 'yellow' | 'blue' | 'green' |
'rose' | 'plain' } }`. The text is the record's; it is edited IN PLACE (click to edit, Escape
or a click outside to commit, one history entry per commit) and rendered in the UI face at a
readable measure. A tint is a token pair per theme, never a literal.

`text` (free type on the canvas): `{ kind: 'text', text: { text: string; size: 'm' | 'l' |
'xl' } }` — no frame, no chrome at rest: the words sit on the canvas and the selection
treatment is the only box. This is the object a person titles a region with.

`frame` (a named region): `{ kind: 'frame', frame: { label: string; colour: GroupColour } }`.
A frame is a RECT with a name, drawn behind everything, and it owns NOTHING — it is not a
group and it does not adopt the panels inside it (a frame that owned its children would be a
second author of the geometry the panels already have, the rule `groupRect` states). Its
label sits above its top-left corner; a click on its label selects the frame, a click inside
it falls through to whatever is there.

## What they inherit, and what they must not

Each is a sessionless panel kind: `isTerminalPanel`'s exclusion list grows by three, so none
of them reaches `assignTiers` with no spec or costs a WebGL slot. Each takes the M92 marks
(`carryMarks`), each is in `fromPanels`/`toPanels` field by field, each has a `KIND_WORD`, a
`KIND_NOUN`, a `KIND_GLYPH`, a rail label, an inspector arm and a far-view summary. Semantic
zoom: a note and a text show their own words at the card tier (they ARE their content); a
frame shows its label.

## Doors

Canvas: `Note`, `Text` and `Frame` on the canvas's context gesture (the annotate strip gains
three tools beside the label and draw ones, M155's shape) — a drag places a frame, a click
places a note or text. Palette: `Add a sticky note`, `Add text`, `Frame a region`. Agent:
`note <text>`, `text <text>`, `frame <label>` through M180's door, placed by the existing
placement policy (the brief's fourth amendment). Workflow: the M189 omission.

## Not here

Rich text, images inside notes, or a frame that moves its contents (recorded: a frame drag
moving what it encloses is the "second author" failure; if a later act wants it, it takes the
group's own membership rules).
