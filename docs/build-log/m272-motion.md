# M272 — Motion & transitions (Wave 3)

## Intent

Canvas stays mounted when Orchestrate is showing. Transitions are paint-only.
`prefers-reduced-motion` snaps.

## What landed

- Canvas host no longer uses HTML `hidden` for the swap; `.canvas--behind-orch`
  fades and ignores pointer events. `.shell__orch--on` enters. Reduced motion
  drops transform/animation.
- Spawn still uses `panel-enter`. A single panel flipping dormant/awake gets
  `panel-demote` / `panel-wake` on the motion wrapper (not `.panel`, so
  viewport matrix checks and xterm refit stay untouched). A workspace switch
  replacing the whole dormant set is not choreographed.
- Attention pip and dock badge: finite `attention-pip` while
  `data-attention-new` is set; gone when the badge is hidden (acknowledged /
  empty queue).
- Palette already entered with M267 material; the Task|Panel sheet uses the
  same enter. Keyboard reach unchanged (`<details>`, sheet fields, palette
  input).
- Orchestration graph edges travel with `edge-current` only when a real
  agent transition fires (`ORCH_EDGE_FIRE_MS`), not because endpoints are live.
