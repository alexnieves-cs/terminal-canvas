# M226 — Obsidian amplified: the brief

**Status:** the Act 0 brief for the v11 visual run (M225–M243). It AMENDS the Obsidian brief
(M109–M111); it does not replace it. Dark stays the flagship, `--iris` stays the accent, glass
over blur, 12px corners, system SF. What changes is **depth and response**, not identity.

Read with: [`docs/product-rules.md`](../../product-rules.md) (the face/rest/path/metrics rules,
unchanged and still spent), [`docs/load-bearing.md`](../../load-bearing.md) (grep it, never
scroll it) and the run prompt
[`2026-09-09-v11-visual-run-prompt.md`](2026-09-09-v11-visual-run-prompt.md).

Every principle below is either implemented in a named milestone or struck through with a
reason. The ledger [`docs/build-log/m225-m243-ledger.md`](../../build-log/m225-m243-ledger.md)
carries the disposition of each.

---

## 1. The elevation scale

Four levels, and the level is the FACT — a surface's material says how far from the ground it
is, and nothing else may say it. Today there are two flat fills used conservatively; the scale
below is what those two become.

| Token | What sits on it | Light | Dark |
|---|---|---|---|
| `--glass-0` | the recessed **well**: a terminal's screen, a code block, an input, a scroll area | `rgba(226, 230, 238, .92)` | `rgba(7, 9, 15, .92)` |
| `--glass-1` | the **panel** surface (`--panel-bg` aliases it; unchanged) | `rgba(255, 255, 255, .80)` | `rgba(18, 22, 31, .88)` |
| `--glass-2` | the **shell chrome**: top bar, rail, inspector (`--chrome-bg` aliases it; unchanged) | `rgba(246, 247, 250, .86)` | `rgba(13, 16, 24, .82)` |
| `--glass-3` | **floating overlays**: the palette, a menu, a popover, a sheet | `rgba(255, 255, 255, .94)` | `rgba(30, 36, 49, .94)` |

`--glass-1` and `--glass-2` keep their M109/M163 values exactly. **The new levels are new
names, never re-spellings** — `verify:panels` parses measured tokens with `toRgb` and skips an
rgba, so a fill that must stay measurable stays six-digit hex under its own name.

**`depth.1` — elevation is monotonic.** A surface may sit on `--glass-N` only if the surface
that contains it sits on a level `< N`. Checked as text over `styles.css`
(`verify:styles depth.1`): for every pair of glass-bearing selectors where one is a descendant
of the other, the descendant's level must be strictly greater. A convention that nothing pins
rots; this is the pin.

The scale is **not** a shadow ramp. `--e-1`…`--e-4` stay what they are (`shadow.1`): `--e-1`
and `--e-2` unused in the body, `--e-3`/`--e-4` overlay-only. `--glass-3` surfaces ARE the
overlay tier, so they keep `--e-3`/`--e-4` and this rule is not widened for them.

## 2. The rim recipe

Depth comes from a **rim pair**, not from stacking shadows — a border plus an inset box-shadow
do not composite, so this stays cheap enough to paint on every panel on a forty-panel canvas.

| Token | Meaning | Light | Dark |
|---|---|---|---|
| `--rim` | the 1px **specular top edge** of a RAISED surface | `rgba(255, 255, 255, .95)` | `rgba(255, 255, 255, .14)` |
| `--rim-inner` | the inset shadow that makes a **well** read as recessed | `inset 0 1px 2px rgba(30, 40, 70, .12)` | `inset 0 1px 3px rgba(0, 0, 0, .55)` |

- **Raised** (panel frame, overlay, card): `--rim` as a 1px inset highlight on the top edge
  only, over the existing `--frame-line` border and the existing `--lift`. `--edge-light` keeps
  its own sites (the palette's top edge, the rail's inner highlight); `--rim` is the token the
  FRAME wears, so the two do not fight over one name.
- **Recessed** (well, input, code block, scroll area): `--rim-inner`, and `--glass-0` as the
  fill. A well never carries `--rim`.
- **A surface wears one or the other, never both.** Both together is the 2008 bevel.

`--amber` stays a literal; `--well` still equals the xterm background for the same theme
(`verify:panels theme.1`). `--glass-0` is the SURFACE tone of a recessed area — it is not a
re-spelling of `--well`, and the terminal's own screen keeps painting `--well` under xterm.

## 3. Edges mean FLOW

An edge animates **only when something crosses it**. At rest it is a quiet line with no motion.
Chosen over a continuously-tinted "health" grammar deliberately: continuous ambient motion
across every edge contradicts the rest rule and has no honest reduced-motion degradation.

| State | The signal, which already exists on the wire | Visual |
|---|---|---|
| `rest` | no signal | today's quiet line, **no motion** |
| `armed` | a run is live and the edge is inside its component (`useRuns`, `run-model.ts`'s `componentOf`) | the line lifts to `--iris-dim`, static |
| `firing` | `useHandoff.ts` records `{ kind: 'fired', … }` for the source | a bright packet travels `t: 0 → 1` along the existing cubic |
| `arrived` | a join arrival (`useHandoff.ts`'s `dispatch`) | the **target's** `.pf::before` rim flashes once |
| `waiting` | `joinAdvance` reports `ready: false` with a non-empty `waitingFor` | armed edges breathe at `--dur-breath`; unarrived edges stay at rest |
| `blocked` | the target's `panelState` word is `needs you` (`panel-state.ts`) | the edge holds `--amber`, no travel |

**The travel is analytic, not measured.** `link-geometry.ts` yields `c1x/c1y/c2x/c2y` and
`LinkLayer` already places its label at `t = 0.5` via `(P0 + 3C1 + 3C2 + P3) / 8` with no
`getPointAtLength` and no laid-out DOM. A packet is that same `bez()` at an animated `t`.
**One shared `requestAnimationFrame` for the whole layer**, never one per edge, and no rAF at
all while nothing is armed. Culled at `cardDetail === 'tail'`: a far-view canvas draws quiet
lines and animates nothing nobody can resolve.

Three-state discipline applies: an edge with **no signal** is `rest`, which is a different fact
from an edge whose **source has exited** and a different fact again from an edge whose target
is **blocked**. Collapsing any two tells the user the wrong fix.

## 4. The chromeless frame rule

At rest a **terminal** panel is: a rounded glass rim, a small state-toned dot, the name at low
emphasis floating over the first row, and terminal content running to the edge. Controls appear
on hover / focus / selection over a gradient scrim so the text underneath stays legible.

This is not a new mechanism — `.note-node[data-note-form="text"]` already fades its whole
`.pf__chrome` on hover. It is that precedent extended, with one difference that matters:

> **The chrome must become absolutely positioned OVER the body, and the body must own the full
> block size.** If the chrome's box collapses on hover instead, xterm refits and fires a
> SIGWINCH into the running agent on every mouse-over — a resize storm with no visible error
> and no red suite. Absolute positioning is the only safe version of chromeless here.

**Which kinds are chromeless, and which keep a header** (M236 writes this into `CLAUDE.md`):

| Kind | Frame at rest | Why |
|---|---|---|
| `terminal` | chromeless | the content IS the panel; a six-control toolbar over live agent output is the single loudest piece of chrome in the app |
| `note` (text, frame forms) | chromeless | already, since M187 |
| `note` (sticky), `image`, `browser` | chromeless | the object is a surface a person looks AT; its controls are not part of it |
| `chat`, `review`, `file`, `toolbox`, `work`, `jira`, `github`, `memory`, `watcher`, `skill`, `workflow` | keeps its header | the header carries a fact the body does not repeat (a state word, a count, a path); removing it would hide information, not chrome |

The exception list is the rule. A rule that is silently per-kind is how the frame drifted before
M47 unified it.

**What chromeless may not spend** (M44's reach rule, unchanged): hiding a control at rest never
removes it from the tab order or its `aria-label`, and a scripted click must land without a
hover. Opacity is 0 or 1 (`verify:styles` check 3); softness comes from the scrim gradient.

## 5. The motion budget

| May move | For how long | Under `prefers-reduced-motion: reduce` |
|---|---|---|
| an edge packet, `t: 0 → 1` | one travel per fire | **does not travel**; the edge highlights for `--dur-2` and releases |
| the target's arrival rim flash | `--dur-2`, once | unchanged — it is a fade, not a translation |
| a waiting edge's breath | `--dur-breath`, while waiting | static at the armed value |
| the aura's activity term | `--dur-2` crossfade on the token | instant |
| chrome reveal on hover | `--dur-1` | instant (the existing reduced-motion arm) |

**Nothing animates forever** (M111's `pulse.1`), and **the event is never lost, only the
animation**: with motion off a fire still REPORTS. The `reduced-motion` golden is the proof.

## 6. Light that responds

`.canvas__aura` follows the camera at 0.12 and answers nothing else. It gains one cheap second
term: **activity**. Armed runs and `wants-you` panels warm the ground fractionally; an idle
canvas is unchanged from today.

Budget: **no per-panel layer, no per-frame layout read, and nothing at all at the far tiers.**
The term is a re-valuation of the ONE gradient already on that ONE element, switched by a data
attribute the canvas already computes. If it cannot be done inside that existing composited
layer, it is declined in writing — a beautiful aura that costs frames during a drag is a net
loss.

## 7. What this run may not spend

- The Obsidian brief is amended, not replaced: a new colour, radius, spacing or blur value is a
  **new token declared in BOTH theme blocks** (`theme.1`), never a re-spelling.
- Every DOM alias survives. `.panel`, `.panel__chrome`, `.panel__title`, `.panel__close`,
  `.panel__slot`, `.panel__card`, `.panel__resize` and every `*-node__*` hook. Restyle the
  classes; never rename them.
- Terminals stay terminals: xterm's cell metrics, the pointer correction, OSC 133, the PTY
  flush gate, dormancy tiers and the WebGL budget are untouched.
- `.pf__body` is never transformed (`frame.2` / `frame.3`).
- One resting shadow: `--lift` (`shadow.1`).
- Blur is paid at the near tiers only (`blur.1`); any new blur site inherits all three arms.
- The face rule, the rest rule, the path rule, the metrics rule and "words, not codes" are
  unchanged and still checked.
- No new runtime dependency; the CSP stays `default-src 'self'`.
- **A DOM read is not a paint check.** This run introduces both a new transform and new blur
  sites — the two things that create a stacking context and made two surfaces invisible for two
  versions in M149. Every new elevated surface gets an `elementFromPoint` paint check.

## 8. The M225 findings and their dispositions

See [the ledger](../../build-log/m225-m243-ledger.md), section "M226 · findings and
dispositions". Each finding from the M225 golden walk carries FIX (in act N) or DECLINE with a
reason; nothing is left without one.
