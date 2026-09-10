# M229 — light that responds

**Act I of the v11 visual run.** Brief: [`2026-09-09-m226-obsidian-amplified-brief.md`](2026-09-09-m226-obsidian-amplified-brief.md) §6.

## What this milestone is

`.canvas__aura` follows the camera at 0.12 and answers nothing else. It gains **one** second
term: activity. A run in flight warms the ground toward the working blue; a panel that needs you
warms it toward amber; **an idle canvas is byte-identical to before M229.**

## Three states, not two

| Canvas | `data-activity` | Ground |
|---|---|---|
| a panel is `wants-you` | `waiting` | `--aura-wait` (the same amber every waiting panel wears) |
| a run is open, nobody is asked | `working` | `--aura-work` (the same blue every busy panel wears) |
| neither | *absent* | `--aura-1`, exactly as before |

`waiting` outranks `working` — the order `STATE_PRIORITY` already gives them. A canvas where
someone is being **asked** something outranks one merely busy.

The third state is the common one and it is a distinct fact: "nothing running" and "running
quietly" are not the same, and only the first leaves the ground alone.

**No new hues.** `--aura-work` and `--aura-wait` are `--blue` and `--amber` at the aura's own
low alpha. A third colour here would be a third vocabulary for a fact the panels already state.

## The budget IS the design

- **No second layer.** No per-panel element, no filter, no animation on any activity state.
- **No layout read on any frame.** Canvas stamps one attribute from two facts it already holds
  — `useAttentionIds()` (which it renders the bell from) and the `runs` array it already
  persists. No new subscription, no new store.
- **Nothing at the far tiers** beyond what the one gradient already costs, because there is no
  additional element to cost anything.

A beautiful aura that costs frames during a drag is a net loss. If it could not be done inside
the one existing composited layer, the brief required declining it in writing; it could.

## The crossfade needs `@property`, and that is not incidental

A gradient cannot be transitioned. **Neither can an unregistered custom property.** A plain
`transition: background` on this element does *exactly nothing*, silently, and would read as
correct in review. `--aura-now` is therefore registered:

```css
@property --aura-now { syntax: "<color>"; inherits: false; initial-value: transparent; }
```

Under `prefers-reduced-motion: reduce` the global block already forces
`transition-duration: .01ms`, so the swap becomes instant with no second rule. The *event is
never lost, only the animation* — the ground still reports.

## Checks

- **`aura.1` (new).** Both colours in both theme blocks; `--aura-now` registered with
  `syntax: "<color>"`; the crossfade declared at `--dur-2`; exactly two activity states; and
  **no activity state buying a layer, a filter or an animation** — the budget arm. Proven able
  to fail by three mutations.
- **`aura.paint.1` (new, `verify:panels:core`).** Drive a panel to `wants-you`, sample the
  compositor at the aura's **centre**, and assert the ground warms toward amber and then
  **releases**. The sample point is found by spiralling out from the canvas centre, because the
  aura is a radial at `50% 48%` and is transparent at the edges — the harness's own
  `backgroundPoint` scans from the top-left and would sample where this effect is designed to
  be invisible, reading "no change" for the right reason at the wrong place.
- **`ground.1`** stays green: `--aura-1` is still what a resting canvas resolves to, one
  indirection later.

## Acceptance

`verify:styles` green including `aura.1`; `aura.paint.1` measuring a real warm shift and a
release; every moved golden through the gate with a critic's sentence.
