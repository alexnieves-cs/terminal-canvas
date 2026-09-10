# M229 — plan

Spec: [`../specs/2026-09-09-m229-responsive-aura.md`](../specs/2026-09-09-m229-responsive-aura.md).

| # | Task | Check | Evidence |
|---|---|---|---|
| 1 | `--aura-work` / `--aura-wait` in both theme blocks, valued from `--blue` and `--amber` | `theme.1`, 11 | green |
| 2 | Register `--aura-now`; the aura reads it; two `[data-activity]` rules; the crossfade | `aura.1`, `ground.1` | green |
| 3 | Canvas stamps `data-activity` from `useAttentionIds()` and the `runs` array | `typecheck` | exit 0 |
| 4 | Write `aura.1` with its **budget arm** and mutation-test it | `aura.1` | three mutations, three reds: a state buying a filter, an unregistered property, a colour in one theme only |
| 5 | Write `aura.paint.1` — drive the state, read the compositor | `aura.paint.1` | `idle [16,18,36] → waiting [33,30,27]`, warm `+26`, attribute released to `null` |
| 6 | `verify:visual`, gate every moved scene | `verify:visual` | one scene moved |

**Task 4's budget arm is the one that will matter later.** The other two arms guard correctness,
which a reviewer would catch. "This activity state also has a filter" is the change that looks
harmless in a diff, passes every other check, and costs frames on a canvas nobody profiles.

**Task 5 exists because task 4 cannot see paint.** M228 shipped a rule that `verify:styles` was
green on and that painted nothing at all (an inset shadow under xterm's canvas). The same class
of failure is available here — an attribute that lands on an element whose rule never matches,
or a custom property that transitions to nothing because it was never registered.

**Expected golden movement.** Only where bare ground is visible near the frame's centre: in most
scenes the panels cover it. This is why the change is *safe* as well as why it is *subtle* — and
why the one scene that does move is the honest test of whether it is too strong.
