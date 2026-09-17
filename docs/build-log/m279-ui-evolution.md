# M279 — the UI evolution: navy material, live status, illumination, an Activity tab

The plan and audit are [docs/ui-evolution-plan.md](../ui-evolution-plan.md). This ledger is
the run's state: what landed per step, the token re-valuations with their reasons, the
gate, and the critic's sentence for every golden that changed.

## Steps

| # | Step | Commit | Verified by |
|---|---|---|---|
| 1 | Tokens: navy dark ramp, cyan-tinted lit edge, blue/cyan aura, `--violet`, `--glow-iris` / `--glow-tone` recipes, `--tone-glow` ramp | `1882767a` | `verify:styles` 75/75, `chart-series` 16/16, `panels:agents theme.1` |
| 2 | Styled primitives (Pill, StatusDot, SegmentedControl, Tabs) + `.seg` / `.pill` / `.tabs` / `.live-status` CSS | `bcc4c141` | `verify:styles`, `panels:shell` 99/99 |
| 3 | Top bar: segmented center toggle, live status cluster, field ring on search; dock active tile glow; inspector tabs on the primitive | `bcc4c141` | same |
| 4 | Resizable navigator (`shell.navWidth`, 300–480) | `bcc4c141` | `verify:layout` 268/268, `verify:palette` 149/149 |
| 5 | Nodes: selection on `--glow-iris`, state edge on `--tone-glow`, workflow agent family violet | `33c8a806` | `verify:styles` |
| 6 | Chat phase word (`chatPhase` / `chatPhaseWord`) beside the state pill | `33c8a806` | `verify:rail` 223/223 |
| 7 | Inspector Activity tab; feed producer lifted to `canvas/useActivityFeed.ts`; canvas-wide feed with nothing selected | `33c8a806` | `verify:layout shell.1`, `verify:orchestration` 53/53 |
| 8 | xterm dark theme aligned with the new `--well` (part of step 1) | `1882767a` | `panels:agents theme.1` |
| 9 | Windowed file tree above 200 rows | (this step) | `verify:styles`, typecheck |
| 10 | Motion: glow transitions on the state edge, feed row arrival (`activity-row-in`) | steps 1, 7 | `verify:styles motion.2` |
| 11 | Goldens + this ledger | (below) | `verify:visual` |

## Token re-valuations (dark block), with the finding each answers

Every value derived against `verify:styles` check 11's ratios by the script the plan
names; light-block values are unchanged except for the new `--violet` pair.

| Token | Was | Now | Why |
|---|---|---|---|
| `--s-0` … `--s-5` | `#070910 … #2c3344` | `#080c16 … #2b3850` | the ground read as black, a hue nobody names; every step moves a few degrees toward blue at the same span |
| `--well` | `#0c0f16` | `#0a0e19` | follows the ramp; `themes.ts` and `panels:agents theme.1` move with it |
| `--fg` … `--fg-4` | `#e9ecf4 … #7a8396` | `#e8edf7 … #7684a0` | the same lightness, the ground's blue in the ink so text sits in the material |
| `--line`, `--line-strong` | `#262c39`, `#3b4356` | `#243047`, `#394764` | a boundary as part of the material, not a grey ruled over it |
| `--blue` | `#7aa2f7` | `#6ea8ff` | electric blue for work, nearest the identity cyan without becoming it |
| `--green` | `#9ece6a` | `#7fdba0` | mint rather than lime beside a navy ground |
| `--amber`, `--red` | `#e0af68`, `#f7768e` | `#e5b467`, `#ff7b8e` | one step of chroma to hold 3:1 on the new `--s-4` |
| `--iris` | `#67e8f9` | `#5fe3ff` | the interface light, a touch more saturated on the bluer ground |
| `--violet` (new) | — | `#b39dff` / light `#6a4fc4` | the family accent: workflow blocks, pools, orchestration structure |
| `--edge-light` | white `.11` | cyan-white `.13` | the top light on every surface says what colour the room's light is |
| `--aura-1`, `--aura-2` | indigo `.22`, teal `.12` | electric blue `.20`, cyan `.11` | the two illumination hues the brief names, at M109's alphas |
| `--glass-0..3`, `--bubble` | grey-black | navy | follow the ramp at the same alphas |

New structural recipes on `:root`: `--glow-iris` (a 1px ring + 18px spill of the interface
light) and `--glow-tone` (the state edge's spill), the tone block widening the latter to
22px/5px for `working` and `needs-you` through `--tone-glow`.

## Backend state: what is used, what is missing

Used, unchanged: `agent:state` (`starting busy idle wants-you exited`), the chat
snapshot's `status` and `pending`, the live message's blocks, `onAgentTransition`,
`onChatTurnEnd`. Derived in the renderer: the chat phase (`thinking` / a tool and its file)
from the last live block. Missing in main, documented and not invented: a per-agent phase
channel, a `blocked` agent state, a `completed` tone distinct from `exited` (`exited 0`
still paints red — backlog).

## Gate

Recorded at the end of the run (below).

## Goldens

Every scene re-captured after step 9; each changed scene's sentence is recorded before
`UPDATE_GOLDENS=1` writes it.
