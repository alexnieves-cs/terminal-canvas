# M281 — Orchestrate dark HUD polish

Visual thesis: translucent navy surfaces with crisp iris edges frame the existing
blooming diorama. The graph remains the primary workspace; roster and activity
provide support, with task and selected-agent facts in context. Existing edge flow,
callout reveal and selection transitions retain their motion and reduced-motion rules.

Dark-scoped glass covers metrics, roster, side, bottom cards, floats and callouts;
the graph gains a slightly brighter edge and haze. M280 live-edge glow is unchanged.
No dependencies, invented metrics or shell changes. Light material stays unchanged.

The task float retains its real stage ticks and adds a dark-only fill from
`stepIndex / (WORK_ITEM_STATES.length - 1)`, only inside the existing task branch.
It measures stage position, never estimated completion. The selected chat subscribes
to its chat store and shows thinking (label only), a scrubbed last tool name or
scrubbed assistant tail. Empty evidence omits the line. Terminal command/cwd remain.

Implementation complete; the broader verification gate remains red as detailed below.

## Golden critic — inspected before updating

- `orchestration-dark`: iris rims and translucent navy gradients separate the
  roster, metrics and bottom context without competing with the graph; the thin
  one-third stage bar matches Working while retaining all four stage ticks.
- `orchestration-working`: working cubes and the cyan live edge remain the brightest
  elements; the amber needs-input callout retains its distinct border over the
  richer glass, and text remains readable. Existing crowded callout placement is
  unchanged by this material pass.
- `orchestration`: the light capture retains its surfaces, spacing and task ticks;
  the added fill is hidden in light. Keep this golden unless comparison disproves it.

Targeted checks: orchestration 55/55, styles 75/75; build passed.

## Validation limits

`npm run verify` finished 52/54 suites: agent `detail.1` reached zoom 0.1
(cluster) instead of the expected block tier near 0.08; the product suite failed
workflow editing/saving and keyboard-reach checks. These are outside the changed HUD.
The initial sandbox run also hit watcher/socket restrictions; the full result above
is the subsequent unsandboxed run. Logs: `out/m281-verify.log`.

Full visual comparison: 62/66, with orchestration process samples/activity absent
in the late full-run captures (changing layout) and starter failing to paint.
Isolated three-scene comparison confirmed light under budget at 0.076%; dark and
working changed intentionally. Both dark goldens were updated after the critic
review. The updater also rewrote light on a subsequent fluctuating capture; its
original was recovered from the preserved pre-change `tc visual h4MdXH` capture
using the exact harness resize/PNG encoding (356449 bytes). No light restyle was accepted.
A subsequent isolated comparison passed light and working; dark failed a live
memory-chart tile at 512,736 (81% versus 35% budget), not the glass or task bar.
Scoped visual invocations additionally fail the wrapper's whole-scene count and
stray-golden checks; they are not claimed as a green full visual gate.

`npm run verify:packaged`: 12/12 passed. `git diff --check`: passed.

Final isolated rerun with no other Electron suite running: light 0.050% and working
0.010% pass; dark repeats the same memory-chart tile failure. Agent-suite recheck
reproduced `detail.1` (81/82). Final metadata verification: 50/50 passed.
This milestone is implemented, but is not declared fully verified.

## C1 — phase row (2026-09-17)

`orchPhase(blocks, live)` in `orchestration-model.ts` is now the one reader of a chat's phase:
`Thinking…` (live only), `Using · <tool>` (live) vs `Last tool: <tool>` (finished), else idle →
the outward-scrubbed tail. Its input type has no `text`, so thinking contents cannot reach the
HUD. The Selected rail and a LIVE chat's callout work line both use it; the callout reuses its
existing row, so `CALLOUT_H` is unmoved. Terminals keep command/cwd — no thinking channel.
Declined, as no source exists: checklist ticks and a progress %. Pinned by `orch.phase.1–.3`.
Goldens: the fixtures hold no live chat, so no scene changes; `verify:visual` not re-run.

### C1 closeout (2026-09-17)

Re-checked against the goldens written for M282, and the reasoning above holds: none of the three
orchestration scenes contains a LIVE chat, so `orchPhase`'s live branches (`Thinking…`,
`Using · <tool>`) have no capture that can exercise them. What the scenes do show is its finished
and idle branches — the Terminal card's `claude — api idle` in the light and dark pair, and the
same card's empty state in `orchestration-working`. The live branches stay pinned by text, at
`orch.phase.1–.3`, which is the right instrument for them: a golden cannot hold a phase that only
exists while a turn is in flight, and a fixture that faked one would be pinning the fake.

`orch.phase.1–.3` and `orch.gate.1` are green in the 60/60 run recorded in M282's closeout.

**M281's one open failure is now closed there**, and it was never the HUD. The `orchestration-dark`
memory-chart tile at 512,736 (81% against a 35% budget) was a real sample of this machine's
process table landing inside a captured frame — it differed between two runs a minute apart. The
shot mask now covers `.orch__perf-value` and `.orch__perf-card svg`; see M282's closeout for the
reasoning and the disclosure. No material, layout or task-bar change was involved, so nothing in
this milestone's own critic notes above is revised.
