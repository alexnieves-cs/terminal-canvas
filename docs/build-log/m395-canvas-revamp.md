# M395 — The canvas, remade

The revamp half of the canvas run (prompt:
`docs/superpowers/specs/2026-09-29-canvas-revamp-flowchart-prompt-opus55.md`; state, ranking and
decisions in [m388-m396-ledger.md](m388-m396-ledger.md)). What was changed was chosen by
EVIDENCE, not by taste: a fresh critic's review of the shipped scenes (25/40, "half specific"),
the impeccable detector's findings, and a live-app audit that used the real renderer as a
first-timer and as a daily user (112 screenshots). Ranked impact × reach ÷ risk; the reasons for
every item taken and every item declined are in the ledger.

Built in two worktrees at once, merged here: part A "objects and input" (`m395-revamp-objects`),
part B "chrome and reading" (`m395-revamp-chrome`).

## A — Objects and input

- **A frame no longer traps what is inside it** (the audit's P0). It is never raised by a
  selection, its middle passes every press to the ground (only its label band and a thin ring
  take the pointer), no backdrop blur, and dragging it by the label carries every object wholly
  inside it — computed at the gesture, never stored (D12). `revamp.frame.*`.
- **Annotate mode's own strip works** — it took the pointer under a full-world sheet and dropped
  an empty label per press; empty labels are never kept. `revamp.annotate.*`.
- **Ink is a curve** — Catmull–Rom through the stored points, render only. `revamp.ink.*`.
- **⌘ chords reach the canvas from any text field** (`draft-focus.ts fieldKeepsKey`): a note,
  a shape's label, a connector's label, a margin label — bare keys stay in the field, and so do
  the ⌘ chords that edit or move within the text. `revamp.keys.*`.
- **The sticky's × is reachable** — the tint chips moved to the foot. `revamp.tint.*`.
- **Snapping:** ⌘ bypasses it for that frame of a gesture; the guide paints above panels at a
  readable weight; every member of a moved selection takes one delta. `revamp.snap.*`.
- **A marquee selects no page text.** `revamp.marquee.*`.

## B — Chrome and reading

- **The host never scrolls.** Typing into an editor past the canvas's edge scrolled the
  `overflow: hidden` host, and every later Fit landed displaced (the lead's repro: a chart framed
  under the navigator rail). Reset the moment it happens. `revamp.fit.app.1`.
- **Framing inside a safe area** (`viewport.ts clearFraming`, `safe-area.ts`): every Fit, jump
  and flight lands clear of the HUD, the minimap, the pill and any drawer. `revamp.fit.*`.
- **The minimap yields**: tucks aside while a person works in a panel it covers, hides when
  everything is already in view. `revamp.minimap.*`.
- **Create lives on the HUD** — one door, never on a panel's corner or under the top bar.
- **The pill yields to an open menu.** `revamp.pill.1`.
- **Reading from afar:** at the summary tier a card's name holds a readable screen size across
  two lines, the agent prefix truncated before the part that tells cards apart; margin labels
  never outsize names. `revamp.far.*`.
- **New authored objects take the nearest free spot** (`placement.ts freeSpot`) — stickies,
  shapes, pictures, files, workflows, browsers; terminals and chats keep the spawn cascade the
  Cmd+N entry argues for. `revamp.place.*`.
- **Tidy packs to the view's shape** instead of a strip readable only at 11%; the agent door's
  `tidy`, a no-op that reported `ran` since M204, now tidies. `revamp.tidy.*`.
- **Motion decelerates** — no overshoot, no animated blur; reduced-motion rules for the settle
  and the beacon. `revamp.motion.1`.
- **Launcher copy says what it does** — "Choose how to start", a disabled Start that says
  "Describe the task first", a Create line that matches its sheet, no Fit verbs over nothing.

## Declined (reasons in the ledger)

Headers printing over a terminal's first row (a refit — the frame rule), the six signals for one
waiting panel and the work card's verbs at rest (the attention system and a panel kind, not the
canvas page), a no-overlap layout for panels (a different product), a visible grid (`ground.1`),
a presentation path through frames (not a daily verb; evaluated, not built).
