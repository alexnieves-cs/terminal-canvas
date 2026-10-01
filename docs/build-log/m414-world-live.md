# M414 — real agents in the World view, performance, polish (prompt 4 of 4)

Replaces the simulation as the only feed with the agent runtime's own events, then makes the
view cheap and honest about where it runs. Local commit, not pushed.

## What it is

| Piece | File | Notes |
|---|---|---|
| The translator | `shared/world-feed.ts` | Pure. `AgentSessionEvent` (+ a terminal agent's `agent:state`) → the `AgentEvent` contract. Scrubs before clipping; speaks only new blocks of a re-sent turn; a pending permission outranks a streaming status. |
| The link | `main/world-feed-link.ts` (+ `bootstrap/world-feed-wiring.ts`) | Host-injected so the harness runs it. Sends on `world:events`; a failure → `lost` on `world:connection`; `retry()` rebuilds above the old seqs and re-asks the runtime and PTY manager. |
| The hooks | `agent-runtime.ts`, `pty-manager.ts`, `index.ts` | One line after the existing `AGENT_EVENT` send; `onAgentState` after the `agent:state` send in a try/catch. Nothing an agent does changed. |
| Connection | store, preload, `ipc.ts` | `world:connection` (push), `world:status`, `world:retry` (invokes). The store keeps the bridge; no view holds it. |
| Perf | `world-perf.ts`, `WorldView.tsx` | DPR clamp `[1, 1.75]` + a down-only governor (3 low half-second windows); nearest 6 agents get full cards, the rest a status dot (re-ranked 4×/s, hysteresis); desktop-width gate (900px) with no scene mounted below it; reduced motion = 0ms snap, no stagger, no arrival grow. |
| Polish | `WorldCard.tsx`, `WorldStage.tsx`, `styles.css` | Card/dot take `data-tone` from the 2D canvas's own `[data-tone]` block (the old iris/violet pair was not its language); empty line "No live agents. Start one from the canvas."; lost banner + Retry. |

## Decisions

- **Terminal agents are status-only** (`busy` → working, `wants-you` → waiting_approval; a booting CLI is `idle`, a plain shell is not an agent). Chat sessions get the full stream.
- **"Relay disconnected" means the feed**, not a socket (M411 made it IPC): main's translator/send failing, or a bridge with no `world` door.
- **The /world route stays, behind the dev flag** it already had (`import.meta.env.DEV`, compiled out of production; the toggle too). The packaged `.glb` fetch under `file://` is still unmeasured, so the toggle is not shipped. `**/*.glb` was already excluded from the `affected` selector (M412).
- **Bloom: NOT added.** Optional, and I did not measure it against 60fps on an M1; the diorama's bloom door (`orchestration-bloom.tsx`, raw `postprocessing`) is the place if someone does.

## Measured (real Electron dev window, CDP, no SIMULATE_AGENTS, a real `claude` 2.1.286 chat)

- Each world update landed in the SAME millisecond as the `agent:event` it came from (tool_use 3749/3749, tool_result 3995/3995, text 4788/4788, ready 4920/4920) — both are sent from the one fan-out.
- Card showed `Bash grep -rn "AgentEvent" src/shared`, blue "working"; 120 fps, 53 calls, 7k tris.
- Retry then a turn: store kept up (seq 19 → epoch-based), connection `live`.
- 700px window: no scene, no WebGL context, the message; widening to 1300 restores it. Reduced-motion emulation: the layer is at rest 120ms after toggle-on (vs opacity 0.007 without it).
- Production first chunk has no `WebGLRenderer`.

## Gate

`verify:world` 52 → 95. `verify:styles/meta/ipc`-adjacent suites green. Electron: canvas, xterm, panels:core/kinds green; baseline reds only (`panels:agents template.1`, `panels:shell 95/95b/95c/96`, `first-run revamp.create.1`).

## Owed

Goldens (none; dev-only), packaged build, a fresh-context critic of the move, no real `waiting_approval` observed (the CLI auto-allowed `echo`; the path is pinned in `world.feed.5`, not watched), a real feed failure (only simulated in `world.link.4`).
