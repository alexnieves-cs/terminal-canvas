# M231–M233 — Act II: reactive edges

The v11 visual run's second act. Resumable state:
[`m225-m243-ledger.md`](m225-m243-ledger.md); this log is the narrative, and where the two
disagree the ledger is right. Branch `m225-visual-baseline`. Nothing pushed.

The pure model is M230 ([`m230-pure-red-evidence.md`](m230-pure-red-evidence.md)); this log
covers the three milestones that spend it.

---

## What shipped

| # | What landed |
|---|---|
| M231 | `renderer/canvas/useEdgeActivity.ts` — a module-level store keyed by edge, subscribed per edge, cleared at every panel-removing call site; `useHandoff` marks fired / arrived / waiting at the three moments it already knows them; Canvas pushes the three facts the store cannot observe |
| M232 | `LinkLayer` renders the six states — one shared rAF, none while nothing moves, the packet at the analytic `t`, culled at the far tiers |
| M233 | the arrival flash on `.pf::before`, the blocked amber, the reduced-motion arm, and the `edge-firing` / `edge-waiting` scenes |

## The act's lesson: three defects, all found by looking

Every check written in this act was green before these were found. None of them is a bug a
reviewer would have spotted in a diff either.

### 1. The far-tier cull was inverted

The run prompt says to cull flow at `cardDetail === 'tail'`. In `card-detail.ts`, **`tail` is
the NEAREST tier** — the names say what a card SHOWS (its scrollback tail), not how far away it
is; `summary` is mid and `block` is farthest.

Implemented literally, the grammar was **disabled at 100% and left animating across a hundred
cards at 8%** — the exact inversion of the budget the rule exists to protect.

It is silent by construction: a feature that never animates looks identical to a feature that
is merely idle. The only reason it surfaced is that M233 built a scene whose whole subject is a
moving packet, and the scene came back empty.

### 2. The packet was painted, correct, and invisible — twice

- **Behind three panels.** Links paint BENEATH panels by design (M13: a line over a terminal
  hides the agent output the app exists to show). The first scene fired the chat's edge, whose
  entire path runs under the memory, GitHub and review panels.
- **Behind the navigator rail.** At `t = 0.4` the packet's painted rect was at `client x = 268`,
  outside the canvas host.

Both times the DOM was right: one `.link-layer__packet`, correct `cx`/`cy`, correct fill. A
query check passes both. The scene's diagnostic now logs the packet's **painted rect** rather
than its presence — M149's lesson arriving from a direction M149 did not anticipate.

### 3. A grey arrowhead on a lit line

An SVG marker does not inherit its referencing path's stroke — the same fact that forced
`link-arrow-selected` to exist back in M78, met again. A third marker rather than reusing the
selected one: `selected` means "the user is pointing at this" and `flow` means "something is
crossing it", and one id standing for both would make the DOM lie about which.

## Two decisions worth keeping

**The waiting breath is finite.** The first cut was `infinite`; `verify:styles motion.2` stopped
it, and it was right to. M111's `pulse.1` had already settled the question for the wants-you
pulse — a signal that never ends on something that waits an hour is one the eye learns to skip
— so this reuses that shape rather than re-arguing it: three breaths, then rest on a static
stroke brighter than `armed`'s. The static value is also what a reduced-motion user sees, which
is why it is not redundant with the keyframes.

**Reduced motion removes the travel, not the report.** The packet is hidden rather than frozen:
a dot parked mid-edge is not a quieter version of a moving one, it is a different and wrong
statement. Every state's stroke survives. This is the entire argument for choosing a discrete
flow grammar over a continuous "health" tint, so it is checked (`edge.flow.css.1`) rather than
just written down.

## The disclosed compromise

`edge-firing` **freezes the clock**. A packet's position is a function of elapsed time, so a
live capture would place the dot tens of pixels apart between runs — a permanently flaky
golden, and M225 spent real effort removing one such region from these images. The freeze fakes
exactly one thing, **when it is**; the real reducer computes the real `t` and the real `bez()`
places the real dot on the real curve. It is disclosed in the scene's intent line, in the
store's own header, and here.

`edge-waiting` needs no freeze: it is captured after the finite breath has ended, so its
resting state is what any capture would find.

## The near-miss

The first rebaseline of the two new scenes **rewrote 28 goldens** and reported `61/61 passed`.
In `UPDATE_GOLDENS=1` mode "passed" means "written", not "correct".

The cause: a `the join` bookmark added to the shot fixture to frame the scenes. Bookmarks appear
in the palette's Go-to rows, so every scene listing them changed. **A scene must not change the
fixture other scenes are shot against.**

Reverted, the bookmark dropped, the framing done with an existing panel and a zoom; the
rebaseline then wrote exactly two files.

Nothing caught this except counting the writes and noticing the number was wrong. The ledger's
golden-gate procedure now names that count as a step.
