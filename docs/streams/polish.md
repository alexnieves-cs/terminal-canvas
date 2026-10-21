# Lane F — visual and motion polish (M510–M519)

Opened 2026-10-21 at the owner's request: a visual, UI and UX upgrade that makes
state readable at a glance and moves smoothly, without touching what the checks
select on. The audit and the direction, with live specimens, were posted to the
owner as an artifact; this file is the part a fresh session needs.

| Milestone | What |
|---|---|
| M510 | Lane F: this file, `ownership.json`, the `st:F` fence, the ledger section |
| M511 | Layout collisions: top-bar tabs over the search field, the empty canvas's illustration over its cards, the notice over the zoom bar |
| M512 | Motion tokens: a state speed for tone changes and a spring for confirmations, beside `--dur-1`/`--dur-2`; `motion.ts` mirrors them |
| M513 | State at a glance: each frame's tone edge, a live sign on the state chip, an asleep panel's resting body |
| M514 | Sessions page: no empty columns at rest, toned chips and needs-you cards, the inspector's empty state |
| M515 | Inspector: the path rule (short form in the body, full path on `title`), section rhythm, the tab indicator |
| M516 | Overlays and notices: popovers grow from their trigger, notices stack clear of controls |
| M517 | Onboarding and settings: real switches, one button size, a way out of Settings |
| M518 | World labels: contrast and collision spacing |
| M519 | Goldens: a before/after gallery from the Mac runner for the owner, then the `shots` workflow's `goldens` input |

## Rules this lane keeps

- CSS goes only between the `st:F` markers in `styles.css`; an older rule is overridden from there.
- State colour comes only from the Tone (`[data-tone]`, `state-palette.ts`). No new state hex.
- Restyle the classes the checks select on, never rename them.
- Every effect is opacity, transform or colour. Drag and resize track the input; a terminal's size is never animated.
- Every new animation has a `prefers-reduced-motion: reduce` branch, and `verify:polish` checks it.
- `Canvas.tsx` is lane E's to split; touch it only additively, after telling E.
- No golden is written before the owner has looked at the gallery (B's `shots` workflow, `goldens: true`).
