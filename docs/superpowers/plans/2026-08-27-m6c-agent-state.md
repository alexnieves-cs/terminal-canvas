# M6c — Agent State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive each panel's agent state — `starting`/`busy`/`idle`/`wants-you`/`exited` — from two signals main already sees (the terminal bell and the absence of PTY output), and render it as a border on the live panel *and* on the card.

**Architecture:** Every byte from every PTY in this app already passes through one function, `PtyManager.enqueue`. Two pure functions in `src/main/agent-state.ts` — an OSC/DCS-aware incremental BEL scanner and a state machine — sit at that choke point. Their output reaches the renderer on its own IPC event, lands in its own module-level store, and is subscribed **per panel id**, so `registry.version()` is never involved and a chatty agent cannot re-render the canvas at 60Hz.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React 18 (`useSyncExternalStore`), node-pty, esbuild-bundled plain-node verify suites.

**Spec:** `docs/superpowers/specs/2026-08-26-m6-panel-legibility-design.md` (section "M6c — Agent state", plus "The central insight", "Failure modes" and "Verification"). Read it alongside this plan; the plan argues from it.

## Global Constraints

Copied verbatim from the spec and from `CLAUDE.md`. Every task's requirements implicitly include this section.

- **`src/main/agent-state.ts` imports neither `electron` nor `node-pty`.** That is what keeps it in the cheap plain-node verify tier alongside `tmux-args.ts` and `presets.ts`. If it ever needs either, the impure part belongs in `pty-manager.ts` instead.
- **A bell cannot be found with `indexOf(0x07)`.** `ESC ] 0 ; <title> BEL` sets the window title and Claude Code emits exactly that. The scanner must skip `ESC ] … (BEL | ST)` bodies and `ESC P … ST` (DCS) bodies. Success criterion 5: *"Setting a window title produces **no** state change of any kind."*
- **A sequence can be split across a 16ms flush.** Scanner state is carried between calls; a per-chunk function is wrong by construction.
- **Agent state must never bump `registry.version()`.** Separate channel, separate store, per-id subscription. Success criterion 11.
- **Idleness needs a separate slow tick, one per manager, not per session.** The existing flush timer only runs when there *is* pending data, so it structurally cannot observe the absence of data.
- **`wants-you` is sticky and is cleared only by the user acting on that panel** — typing into it (main already sees this on `pty:write`) or focusing it (a renderer fact, hence `agent:acknowledge`). Never by time, and never by more agent output.
- **`exited` here is not a second source of truth about exit codes.** `PanelStatus.exited` remains authoritative for *how* a process ended. Nothing reads an exit code off the agent state.
- **The indicator set derives from `PtyManager`'s map, which has no dormant entries.** A dormant panel cannot produce a state; the bug is unreachable rather than defended against.
- **Comments explain *why*.** Match the density of the surrounding code — a non-obvious line without a reason attached will be "fixed" by someone later.
- **`npm run verify` must be green before any task is claimed done**, and it is the whole verification story: there is no unit-test runner and no linter.
- Commits use conventional format scoped by milestone: `feat(m6c): …`, `fix(m6c): …`, `test(m6c): …`, `docs(m6c): …`.
- `tsconfig.node.json` / `tsconfig.web.json` set `noUnusedLocals` and `noUnusedParameters` — prefix intentionally-unused params with `_`.

## Two decisions taken before writing this plan

Both were open in the spec; both were put to the user and answered.

1. **The idleness threshold is measured, not guessed.** Task 1 builds an instrumented capture script; the user runs it against a real `claude` session and the measured number becomes the default of the `agent.idleAfterMs` setting in Task 4. **Task 2 onward do not start until Task 1's number exists** — write it into this file's Task 4 where the placeholder says so.
2. **The threshold is a real `number` setting AND the palette grows a number input mode** (Task 6), rather than a number setting with no row. This is the one place M6c exceeds the spec's letter, and it is deliberate: a setting nobody can reach from `Cmd+K` fails success criterion 9, and the palette's existing `InputMode` — built for `preset:rename` in M5b and reused for M6p's confirm — is the modal problem already solved.

## File structure

**New:**

| File | Responsibility |
|---|---|
| `scripts/measure-idleness.cjs` | Task 1 only. Wraps a PTY, records inter-chunk gaps, prints a percentile table. Never imported by the app; not part of `npm run verify`. |
| `src/main/agent-state.ts` | The BEL scanner and the state machine. Pure. No `electron`, no `node-pty`, no `fs`. |
| `scripts/agent-state-entry.cjs` | esbuild entry for the new suite, mirroring `scripts/tmux-entry.cjs`. |
| `scripts/verify-agent-state.cjs` | The new plain-node suite. Joins `npm run verify`. |
| `src/renderer/session/agent-state-store.ts` | Module-level per-id store outside React, plus its `useSyncExternalStore` hook. |

**Modified:**

| File | Change |
|---|---|
| `src/shared/types.ts` | `AgentState`, `AgentStateUpdate` |
| `src/shared/ipc-contract.ts` | `IPC.AGENT_ACKNOWLEDGE`, `IPC_EVENTS.AGENT_STATE`, `CanvasBridge.agent` |
| `src/shared/settings-schema.ts` | `agent.glow`, `agent.bell`, `agent.idleAfterMs`; optional `min`/`max` on `SettingDef` |
| `src/main/layout-store.ts` | `setPreference` honours `min`/`max` |
| `src/main/pty-manager.ts` | Scanner at `enqueue`; the idle tick; acknowledge on `write`; emit on change |
| `src/main/ipc.ts` | The `AGENT_ACKNOWLEDGE` handler |
| `src/preload/index.ts` | `agent.onState` / `agent.acknowledge` |
| `src/renderer/canvas/Canvas.tsx` | The agent-state subscription; acknowledge on focus; the glow setting as a prop |
| `src/renderer/components/TerminalPanel.tsx` | Per-id subscription; the class on `.panel` and on `.panel__card` |
| `src/renderer/styles.css` | The four state colours, on panel and card |
| `src/renderer/palette/commands.ts` | A row for `number` settings |
| `src/renderer/palette/Palette.tsx` | `InputMode` gains `kind: 'number'` |
| `package.json` | `verify:agent-state`, and it in the `verify` chain |
| `scripts/verify-layout.cjs`, `verify-palette.cjs`, `verify-panels.cjs` | New checks |
| `README.md`, `CLAUDE.md` | Milestone table, the verify table, the new load-bearing details |

---

### Task 1: Measure the idleness threshold

**Files:**
- Create: `scripts/measure-idleness.cjs`

**Interfaces:**
- Consumes: nothing.
- Produces: one number, in milliseconds, written into Task 4's `agent.idleAfterMs` default. Nothing imports this script.

This is the one number in M6 that cannot be chosen on paper. Too low and every pause between tokens reads as "finished"; too high and the border turns idle after you have already looked. The script measures the distribution of **gaps between PTY reads** during real work, so the threshold can be set above the p99 of within-turn gaps and below the time a finished turn sits silent.

- [ ] **Step 1: Write the script**

```js
/* Measures the distribution of gaps between PTY reads for a real agent CLI,
   so M6c's idleness threshold is a measured number rather than a guess.

   Run with:
     ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
       scripts/measure-idleness.cjs claude

   Under Electron-as-node, not plain node, for the same reason verify:pty is:
   node-pty is a native module rebuilt against Electron's ABI by postinstall.

   Drive a REAL session: ask a question that makes the agent think, wait for it
   to finish, ask another. Ctrl+D (or the agent's own exit) prints the table.
   The gaps that matter are the ones DURING a turn — the threshold has to sit
   above them, or a pause mid-thought paints the panel idle. */
const pty = require('node-pty')
const os = require('node:os')

const command = process.argv[2] || process.env.SHELL || '/bin/zsh'
const gaps = []
let last = Date.now()

const proc = pty.spawn(command, process.argv.slice(3), {
  name: 'xterm-256color',
  cols: process.stdout.columns || 120,
  rows: process.stdout.rows || 40,
  cwd: process.cwd(),
  env: process.env
})

proc.onData((data) => {
  const now = Date.now()
  gaps.push(now - last)
  last = now
  process.stdout.write(data)
})

// Raw mode, so keystrokes reach the agent rather than being line-buffered by
// this process — without it you cannot drive an interactive TUI at all.
if (process.stdin.isTTY) process.stdin.setRawMode(true)
process.stdin.on('data', (d) => proc.write(d.toString()))

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]
}

function report() {
  const sorted = [...gaps].sort((a, b) => a - b)
  console.log('\n\n--- inter-chunk gaps (ms), %d reads on %s ---', gaps.length, os.platform())
  for (const p of [50, 75, 90, 95, 99, 99.9]) {
    console.log('  p%s\t%d', String(p).padEnd(5), percentile(sorted, p))
  }
  console.log('  max  \t%d', sorted[sorted.length - 1] ?? 0)
  console.log('\nGaps over 1s (these are the turn boundaries, not within-turn pauses):')
  console.log('  ' + sorted.filter((g) => g > 1000).join(', '))
  console.log(
    '\nPick agent.idleAfterMs comfortably ABOVE p99 of the within-turn gaps\n' +
      'and BELOW the smallest turn-boundary gap you care about noticing.'
  )
}

proc.onExit(() => { report(); process.exit(0) })
process.on('SIGINT', () => { report(); process.exit(0) })
```

- [ ] **Step 2: Run it against a real `claude` session**

Run:
```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  scripts/measure-idleness.cjs claude
```
Ask it two or three questions that take real work (e.g. "read this repo's CLAUDE.md and summarise the wheel-ownership rule"). Let each finish. Then exit the agent.

Expected: a percentile table. **Record the numbers in this file, under Task 4**, replacing the `MEASURED:` placeholder.

- [ ] **Step 3: Choose the number and write it down**

The rule: `idleAfterMs` sits above p99 of the within-turn gaps and below the smallest gap you would want reported as "finished". If p99 is ~400ms and turn boundaries are seconds, 1200–1500ms is the band. Write the chosen value and the p-numbers that justified it into Task 4.

- [ ] **Step 4: Commit**

```sh
git add scripts/measure-idleness.cjs docs/superpowers/plans/2026-08-27-m6c-agent-state.md
git commit -m "chore(m6c): measure PTY idleness against a real claude session"
```

---

### Task 2: The BEL scanner

**Files:**
- Create: `src/main/agent-state.ts`
- Create: `scripts/agent-state-entry.cjs`
- Create: `scripts/verify-agent-state.cjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ScanState = 'text' | 'esc' | 'osc' | 'osc-esc' | 'dcs' | 'dcs-esc'`
  - `const INITIAL_SCAN: ScanState`
  - `function scanForBell(state: ScanState, chunk: string): { state: ScanState; bells: number }`

- [ ] **Step 1: Write the failing checks**

Create `scripts/agent-state-entry.cjs`:

```js
/* esbuild entry for the agent-state suite. agent-state.ts is pure — no
   node-pty, no electron, no fs — which is what keeps this suite in the cheap
   plain-node tier. If this entry ever needs `external: ['node-pty']`,
   something impure has leaked into agent-state.ts and belongs in
   pty-manager.ts instead. */
module.exports = require('../src/main/agent-state')
```

Create `scripts/verify-agent-state.cjs`:

```js
/* Verifies the pure agent-state core: the OSC/DCS-aware BEL scanner and the
   state machine.
   Run with: npm run verify:agent-state

   Plain node, no PTY, no Electron. Every check here guards a failure that is
   SILENT in a running app: a bell found inside a window-title sequence makes
   the border flash on every title change for a reason no user could diagnose
   and no log would explain, and a sequence split across a 16ms flush makes
   that happen intermittently and unreproducibly. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'agent-state.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'agent-state-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  // Carried pre-emptively, exactly as verify-palette.cjs carries it: nothing
  // in this bundle imports a VALUE from @shared today (AgentState is a type,
  // which esbuild erases), and "needs no alias yet" is precisely the state
  // verify-viewport.cjs was in right up until the day it broke.
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const A = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const BEL = '\x07'
const ESC = '\x1b'
const ST = ESC + '\\'

/* Feeds a string through the scanner as ONE chunk. */
function scanWhole(text) {
  return A.scanForBell(A.INITIAL_SCAN, text)
}

/* Feeds a string through the scanner ONE BYTE AT A TIME, which is what a
   16ms flush boundary can do to any sequence. A scanner that is correct only
   on whole chunks passes every check above this one and fails in production
   intermittently. */
function scanSplit(text) {
  let state = A.INITIAL_SCAN
  let bells = 0
  for (const ch of text) {
    const r = A.scanForBell(state, ch)
    state = r.state
    bells += r.bells
  }
  return { state, bells }
}

// 1. A bare BEL in ordinary text is a bell.
ok(1, scanWhole('hello' + BEL + 'world').bells === 1, 'bare BEL rings once')

// 2. THE TRAP. `ESC ] 0 ; title BEL` sets the window title. Claude Code emits
//    exactly this, and a naive indexOf(0x07) reports a bell every time the
//    title changes — a border that flashes constantly with no cause.
ok(2, scanWhole(ESC + ']0;my title' + BEL).bells === 0, 'OSC title rings zero bells')

// 3. The ST-terminated spelling of the same thing.
ok(3, scanWhole(ESC + ']0;my title' + ST).bells === 0, 'ST-terminated OSC rings zero')

// 4. A real bell AFTER an OSC body — the scanner must leave OSC state, or
//    every bell following a title change is swallowed.
ok(4, scanWhole(ESC + ']0;t' + BEL + 'after' + BEL).bells === 1, 'bell after OSC still rings')

// 5. DCS bodies are skipped too, and are terminated ONLY by ST.
ok(5, scanWhole(ESC + 'Psomething' + BEL + 'more' + ST).bells === 0, 'DCS body swallows BEL')

// 6. Split one byte at a time: the trap must still not ring.
ok(6, scanSplit(ESC + ']0;my title' + BEL).bells === 0, 'split OSC rings zero')

// 7. Split one byte at a time: a real bell must still ring.
ok(7, scanSplit('hi' + BEL).bells === 1, 'split bare BEL rings once')

// 8. The exact production shape: a title set in one flush, its terminator and
//    a real bell in the next.
{
  const a = A.scanForBell(A.INITIAL_SCAN, ESC + ']0;half a ti')
  const b = A.scanForBell(a.state, 'tle' + BEL + 'now' + BEL)
  ok(8, a.bells === 0 && b.bells === 1, 'OSC straddling a flush: one real bell')
}

// 9. CSI sequences are ordinary and must not swallow a following bell.
ok(9, scanWhole(ESC + '[1;31m' + BEL).bells === 1, 'CSI does not swallow a bell')

// 10. Several bells in one chunk are several bells: the scanner counts, it
//     does not merely detect. The state machine dedupes, not this.
ok(10, scanWhole(BEL + BEL + BEL).bells === 3, 'counts every bell')

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
```

Add to `package.json` `scripts`:

```json
"verify:agent-state": "node scripts/verify-agent-state.cjs",
```

and insert `&& npm run verify:agent-state` into the `verify` chain immediately after `npm run verify:tmux`.

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:agent-state`
Expected: FAIL — esbuild cannot resolve `../src/main/agent-state`. This is the point: the module does not exist yet.

- [ ] **Step 3: Write the scanner**

Create `src/main/agent-state.ts`:

```ts
/**
 * The agent-state detector: a BEL scanner and a state machine, both pure.
 *
 * This module imports NOTHING — not electron, not node-pty, not node:fs. That
 * is deliberate and load-bearing: it is what puts the two pieces most able to
 * be subtly wrong into the cheapest, fastest verify tier the repo has, next to
 * tmux-args.ts and presets.ts. If this file ever needs a PTY or a window, the
 * impure part belongs in pty-manager.ts.
 */

/**
 * Where the scanner is in the escape grammar. It has to be carried BETWEEN
 * calls: output is flushed every 16ms, so an OSC body can straddle two
 * chunks, and a per-chunk function would re-enter the tail of a window title
 * as ordinary text and ring a bell on a title change — intermittently, and
 * only under load, which is the worst shape a bug can have.
 */
export type ScanState = 'text' | 'esc' | 'osc' | 'osc-esc' | 'dcs' | 'dcs-esc'

export const INITIAL_SCAN: ScanState = 'text'

const BEL = 0x07
const ESC = 0x1b

/**
 * Counts genuine terminal bells in `chunk`, skipping the ones that are merely
 * an OSC or DCS string terminator.
 *
 * `ESC ] 0 ; <title> BEL` sets the window title, and Claude Code emits exactly
 * that. A plain `indexOf('\x07')` therefore reports a bell on every title
 * change: the panel's border flashes constantly, for a reason no user could
 * diagnose and no log would explain. This is the one piece of real work the
 * spec's "put the detector at the choke point" decision costs.
 *
 * Returns the count, not a boolean, because the caller may want to know that
 * output was noisy; deduping into a single state change is the state
 * machine's job, not this function's.
 */
export function scanForBell(
  state: ScanState,
  chunk: string
): { state: ScanState; bells: number } {
  let bells = 0
  let s = state
  for (let i = 0; i < chunk.length; i += 1) {
    const c = chunk.charCodeAt(i)
    switch (s) {
      case 'text':
        if (c === ESC) s = 'esc'
        else if (c === BEL) bells += 1
        break
      case 'esc':
        // ESC ] opens an OSC string; ESC P (DCS), ESC X (SOS), ESC ^ (PM) and
        // ESC _ (APC) all open string bodies terminated only by ST. Everything
        // else — CSI included — is a short sequence that cannot contain a BEL,
        // so returning to text is both correct and the safe direction.
        if (c === 0x5d) s = 'osc'
        else if (c === 0x50 || c === 0x58 || c === 0x5e || c === 0x5f) s = 'dcs'
        else if (c === ESC) s = 'esc'
        else s = 'text'
        break
      case 'osc':
        // An OSC string is terminated by BEL *or* by ST. This BEL is the
        // terminator, not a bell — it is the whole trap.
        if (c === BEL) s = 'text'
        else if (c === ESC) s = 'osc-esc'
        break
      case 'osc-esc':
        if (c === 0x5c) s = 'text' // ST
        else if (c === ESC) s = 'osc-esc'
        else s = 'osc'
        break
      case 'dcs':
        // DCS is terminated ONLY by ST. A BEL inside one is body content and
        // is ignored — the safe direction: a missed bell is quiet, a spurious
        // one is a flashing border.
        if (c === ESC) s = 'dcs-esc'
        break
      case 'dcs-esc':
        if (c === 0x5c) s = 'text'
        else if (c === ESC) s = 'dcs-esc'
        else s = 'dcs'
        break
    }
  }
  return { state: s, bells }
}
```

- [ ] **Step 4: Run the checks and watch them pass**

Run: `npm run verify:agent-state`
Expected: `10/10 passed`, exit 0.

- [ ] **Step 5: Commit**

```sh
git add src/main/agent-state.ts scripts/agent-state-entry.cjs scripts/verify-agent-state.cjs package.json
git commit -m "feat(m6c): an OSC-aware bell scanner, because a title is not a bell"
```

---

### Task 3: The state machine

**Files:**
- Modify: `src/main/agent-state.ts`
- Modify: `src/shared/types.ts`
- Modify: `scripts/verify-agent-state.cjs` (checks 11–24)

**Interfaces:**
- Consumes: `ScanState`, `INITIAL_SCAN` from Task 2.
- Produces:
  - In `src/shared/types.ts`: `type AgentState = 'starting' | 'busy' | 'idle' | 'wants-you' | 'exited'` and `interface AgentStateUpdate { panelId: PanelId; state: AgentState }`
  - In `src/main/agent-state.ts`:
    - `interface Detector { state: AgentState; lastOutputAt: number; scan: ScanState }`
    - `type AgentEvent = { kind: 'output' } | { kind: 'bell' } | { kind: 'tick' } | { kind: 'acknowledge' } | { kind: 'exit' }`
    - `function initialDetector(now: number): Detector`
    - `function nextState(prev: Detector, event: AgentEvent, now: number, idleAfterMs: number): Detector`

**One deliberate deviation from the spec's signature.** The spec writes
`nextState(prev, event, now) -> AgentState`. A function of that shape cannot
decide idleness: "no bytes for `idleAfterMs`" is a statement about *when the
last byte arrived*, which a bare `AgentState` does not carry. So the machine
takes and returns a `Detector` record holding `lastOutputAt` alongside the
state, and `idleAfterMs` is a parameter rather than a captured constant
(Task 4 makes it a setting). Everything else — the transitions, the stickiness,
the clearing rule — is exactly as specified.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-agent-state.cjs`, before the tail:

```js
const IDLE_MS = 1500

/* Every state-machine check runs against an explicit clock. Nothing here calls
   Date.now(): the machine takes `now` as a parameter precisely so idleness is
   testable without a timer, which is the same reason layout-store.ts takes its
   paths as constructor arguments. */

// 11. A fresh detector is 'starting'. Not 'idle': a panel that has never
//     emitted a byte has not finished anything.
ok(11, A.initialDetector(0).state === 'starting', 'fresh detector starts at starting')

// 12. First bytes move starting -> busy.
{
  const d = A.nextState(A.initialDetector(0), { kind: 'output' }, 10, IDLE_MS)
  ok(12, d.state === 'busy' && d.lastOutputAt === 10, 'first output goes busy')
}

// 13. A tick BEFORE the threshold leaves it busy.
{
  let d = A.nextState(A.initialDetector(0), { kind: 'output' }, 0, IDLE_MS)
  d = A.nextState(d, { kind: 'tick' }, IDLE_MS - 1, IDLE_MS)
  ok(13, d.state === 'busy', 'tick under the threshold stays busy')
}

// 14. A tick AT or past the threshold goes idle.
{
  let d = A.nextState(A.initialDetector(0), { kind: 'output' }, 0, IDLE_MS)
  d = A.nextState(d, { kind: 'tick' }, IDLE_MS, IDLE_MS)
  ok(14, d.state === 'idle', 'tick at the threshold goes idle')
}

// 15. Output while idle goes back to busy.
{
  let d = { state: 'idle', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'output' }, 9000, IDLE_MS)
  ok(15, d.state === 'busy', 'output revives idle to busy')
}

// 16. A bell from busy goes to wants-you.
{
  let d = A.nextState(A.initialDetector(0), { kind: 'output' }, 0, IDLE_MS)
  d = A.nextState(d, { kind: 'bell' }, 100, IDLE_MS)
  ok(16, d.state === 'wants-you', 'bell from busy wants you')
}

// 17. A bell from idle goes to wants-you too — an agent that finished and
//     THEN asked a question is the common case.
{
  const d = A.nextState({ state: 'idle', lastOutputAt: 0, scan: A.INITIAL_SCAN }, { kind: 'bell' }, 5000, IDLE_MS)
  ok(17, d.state === 'wants-you', 'bell from idle wants you')
}

// 18. STICKY. More agent output does NOT clear wants-you. Without this rule a
//     bell followed by one more repaint — which every TUI does — clears the
//     state before the user has looked, and the feature is invisible.
{
  let d = { state: 'wants-you', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'output' }, 100, IDLE_MS)
  ok(18, d.state === 'wants-you', 'output does not clear wants-you')
}

// 19. STICKY over time. A tick does not clear it either — it is cleared by the
//     user acting, never by the clock, or the pips would empty themselves.
{
  let d = { state: 'wants-you', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'tick' }, 60 * 60 * 1000, IDLE_MS)
  ok(19, d.state === 'wants-you', 'an hour of ticks does not clear wants-you')
}

// 20. Acknowledge clears it — to BUSY when output is recent.
{
  let d = { state: 'wants-you', lastOutputAt: 1000, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'acknowledge' }, 1100, IDLE_MS)
  ok(20, d.state === 'busy', 'acknowledge with recent output goes busy')
}

// 21. ...and to IDLE when it is not. The two are not interchangeable: landing
//     on busy for a finished agent would paint it working forever, because
//     nothing further arrives to move it.
{
  let d = { state: 'wants-you', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'acknowledge' }, IDLE_MS + 1, IDLE_MS)
  ok(21, d.state === 'idle', 'acknowledge with stale output goes idle')
}

// 22. Acknowledge on a panel that does not want you changes nothing. It is
//     sent on every focus, so it must be idempotent and cheap.
{
  const d = A.nextState({ state: 'busy', lastOutputAt: 0, scan: A.INITIAL_SCAN }, { kind: 'acknowledge' }, 1, IDLE_MS)
  ok(22, d.state === 'busy', 'acknowledge is a no-op when not wanting you')
}

// 23. Exit wins from anywhere.
{
  const d = A.nextState({ state: 'wants-you', lastOutputAt: 0, scan: A.INITIAL_SCAN }, { kind: 'exit' }, 1, IDLE_MS)
  ok(23, d.state === 'exited', 'exit wins from wants-you')
}

// 24. 'exited' is TERMINAL. A dying process emits its last bytes after the
//     exit is known, and a detector that revived on them would leave a dead
//     panel glowing busy for the rest of the run.
{
  let d = { state: 'exited', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'output' }, 10, IDLE_MS)
  const afterBell = A.nextState(d, { kind: 'bell' }, 20, IDLE_MS)
  ok(24, d.state === 'exited' && afterBell.state === 'exited', 'exited is terminal')
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:agent-state`
Expected: checks 1–10 PASS, 11–24 FAIL with `A.initialDetector is not a function`.

- [ ] **Step 3: Write the machine**

Add to `src/shared/types.ts`:

```ts
/**
 * What a panel's agent is doing, derived in main from bytes and their absence.
 *
 * 'exited' is the detector's terminal state and NOT a second source of truth
 * about how a process ended: PanelStatus.exited stays authoritative for the
 * exit code and the pane-died hook's recovery of it. This exists only so the
 * detector stops emitting and the panel leaves the attention set.
 */
export type AgentState = 'starting' | 'busy' | 'idle' | 'wants-you' | 'exited'

/** What IPC_EVENTS.AGENT_STATE carries. */
export interface AgentStateUpdate {
  panelId: PanelId
  state: AgentState
}
```

Append to `src/main/agent-state.ts`:

```ts
import type { AgentState } from '../shared/types'

/**
 * The detector's whole memory for one panel.
 *
 * `lastOutputAt` is why this is a record rather than the bare AgentState the
 * design sketch named: "no bytes for idleAfterMs" is a claim about WHEN the
 * last byte arrived, and a function handed only the current state cannot make
 * it. Carrying the scanner's position here too means one object per session
 * rather than two parallel maps that can fall out of step.
 */
export interface Detector {
  state: AgentState
  lastOutputAt: number
  scan: ScanState
}

export type AgentEvent =
  | { kind: 'output' }
  | { kind: 'bell' }
  /** The slow tick. Idleness is the absence of output, so only a clock can see it. */
  | { kind: 'tick' }
  /** The user acted on this panel: typed into it, or looked at it. */
  | { kind: 'acknowledge' }
  | { kind: 'exit' }

export function initialDetector(now: number): Detector {
  // 'starting', not 'idle': a panel that has never emitted a byte has not
  // finished anything, and painting it idle at spawn would make the very first
  // thing the user sees a lie.
  return { state: 'starting', lastOutputAt: now, scan: INITIAL_SCAN }
}

/**
 * The state machine:
 *
 *   starting --first bytes--> busy
 *   busy --no bytes for idleAfterMs--> idle
 *   (busy | idle) --bell--> wants-you
 *   wants-you --user input to this panel, or focus--> busy | idle
 *   any --pty exit--> exited
 *
 * Pure, and takes `now` as a parameter, so every transition above is testable
 * under plain node without a timer.
 */
export function nextState(
  prev: Detector,
  event: AgentEvent,
  now: number,
  idleAfterMs: number
): Detector {
  // Terminal. A dying process emits its last bytes AFTER onExit is known —
  // pty-manager flushes the pending buffer before announcing the exit — and a
  // detector that revived on them would leave a dead panel glowing busy for
  // the rest of the run.
  if (prev.state === 'exited') return prev
  if (event.kind === 'exit') return { ...prev, state: 'exited' }

  switch (event.kind) {
    case 'output':
      // wants-you is STICKY: it survives further output. A TUI repaints after
      // asking its question, so clearing on output would clear the state
      // milliseconds after setting it and the feature would never be seen.
      return {
        ...prev,
        lastOutputAt: now,
        state: prev.state === 'wants-you' ? 'wants-you' : 'busy'
      }
    case 'bell':
      // The bell is the only signal that carries INTENT. Idleness cannot tell
      // "finished" from "asked a question"; this can, which is why M6d's
      // notification will be gated on this state and not on idleness.
      return { ...prev, lastOutputAt: now, state: 'wants-you' }
    case 'tick':
      if (prev.state !== 'busy') return prev
      return now - prev.lastOutputAt >= idleAfterMs ? { ...prev, state: 'idle' } : prev
    case 'acknowledge':
      // Cleared by the user acting on the panel, never by the clock — without
      // that rule a bell from an hour ago still glows and the attention set
      // never empties. Which state it lands in is not a detail: landing on
      // busy for an agent that has finished would paint it working forever,
      // since nothing further arrives to move it along.
      if (prev.state !== 'wants-you') return prev
      return {
        ...prev,
        state: now - prev.lastOutputAt >= idleAfterMs ? 'idle' : 'busy'
      }
  }
}
```

- [ ] **Step 4: Run the checks and watch them pass**

Run: `npm run verify:agent-state`
Expected: `24/24 passed`.

Also run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```sh
git add src/main/agent-state.ts src/shared/types.ts scripts/verify-agent-state.cjs
git commit -m "feat(m6c): the state machine, and wants-you is sticky by construction"
```

---

### Task 4: The three settings

**Files:**
- Modify: `src/shared/settings-schema.ts`
- Modify: `src/main/layout-store.ts` (`setPreference` range check)
- Modify: `scripts/verify-layout.cjs` (checks 75–80)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: setting ids `'agent.glow'` (boolean, default `true`), `'agent.bell'` (boolean, default `true`), `'agent.idleAfterMs'` (number, default **MEASURED — Task 1**). `SettingDef` gains optional `min?: number` and `max?: number`.

> **MEASURED (fill in from Task 1):** p50 `___`ms · p99 `___`ms · smallest turn-boundary gap `___`ms → **`agent.idleAfterMs` default = `___`**. Until Task 1 is done this plan uses `1500` as a stand-in; do not ship the stand-in without running the script.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, before its tail (existing last check is 74):

```js
// 75. The three M6c settings exist, with the ids the detector and the renderer
//     both hardcode. An id is the persisted key, so a typo here is a silently
//     lost preference with no migration.
{
  const ids = S.SETTINGS.map((d) => d.id)
  ok(75,
    ids.includes('agent.glow') && ids.includes('agent.bell') && ids.includes('agent.idleAfterMs'),
    'the three agent settings are declared')
}

// 76. The threshold is a NUMBER setting, not a boolean smuggled in as one.
{
  const def = S.settingDef('agent.idleAfterMs')
  ok(76, def.type === 'number' && typeof def.default === 'number', 'idleAfterMs is a number')
}

// 77. An unset threshold resolves to the schema default — the sparse-map rule.
//     A full map written on save would freeze this number at whatever it was
//     the first time the user launched, so tuning it later would reach nobody.
ok(77, S.resolveSetting({}, 'agent.idleAfterMs') === S.settingDef('agent.idleAfterMs').default,
  'unset threshold resolves to the default')

// 78. setPreference refuses a wrong-typed value for the number setting, the
//     same way check 72b covers the boolean case.
{
  const store = freshStore()
  ok(78, store.setPreference('agent.idleAfterMs', true) === false,
    'a boolean is refused for a number setting')
}

// 79. RANGE. A threshold of 0 makes every gap between tokens read as
//     "finished" and the border strobes; one of an hour makes the signal
//     arrive after you have already looked. Both are silent — the app works,
//     it just never says anything useful — so the store refuses out-of-range
//     values rather than storing them.
{
  const store = freshStore()
  const def = S.settingDef('agent.idleAfterMs')
  ok(79,
    store.setPreference('agent.idleAfterMs', def.min - 1) === false &&
    store.setPreference('agent.idleAfterMs', def.max + 1) === false &&
    store.setPreference('agent.idleAfterMs', def.min) === true,
    'out-of-range thresholds are refused, the bounds themselves are not')
}

// 80. A number preference survives a write and a reopen, exactly as check 71
//     proves for a boolean.
{
  const dir = mkdtempSync(join(tmpdir(), 'tc layout '))
  const a = new L.LayoutStore(join(dir, 'layout.json'))
  a.setPreference('agent.idleAfterMs', 2000)
  a.flushSync()
  const b = new L.LayoutStore(join(dir, 'layout.json'))
  ok(80, b.getSetting('agent.idleAfterMs') === 2000, 'a number preference round-trips')
}
```

> The helper names (`freshStore`, `S`, `L`, `mkdtempSync`) are the ones already
> in `scripts/verify-layout.cjs`. Read the file's existing checks 61–74 first
> and match them; if `freshStore` is spelled differently there, use that name.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run verify:layout`
Expected: 1–74 PASS, 75–80 FAIL (`agent.glow` not declared; `def.min` undefined).

- [ ] **Step 3: Add the settings and the range check**

In `src/shared/settings-schema.ts`, extend `SettingDef`:

```ts
  /** Groups rows in the palette and names the menu submenu they came from. */
  category: string
  /**
   * Inclusive bounds for a `number` setting; ignored for booleans.
   *
   * They exist because both ends of the idleness threshold fail SILENTLY: at
   * 0 every pause between tokens reads as "finished" and the border strobes,
   * and at an hour the signal lands long after you have looked. The app keeps
   * working in both cases, which is exactly why the store refuses the value
   * rather than trusting whoever typed it.
   */
  min?: number
  max?: number
```

Append to `SETTINGS`, after the three `restore.*` entries:

```ts
  {
    id: 'agent.glow',
    label: 'Show agent state on panels',
    description: 'Colour a panel’s border by what its agent is doing.',
    keywords: ['glow', 'border', 'colour', 'color', 'status', 'busy', 'idle', 'state', 'highlight'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  },
  {
    id: 'agent.bell',
    label: 'Detect the terminal bell',
    description:
      'Treat a bell as “this panel wants you”. Your CLI must be set to ring it — Claude Code’s notification channel defaults to auto.',
    keywords: ['bell', 'alert', 'notify', 'notification', 'attention', 'ping', 'sound'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  },
  {
    id: 'agent.idleAfterMs',
    label: 'Idle after',
    description: 'Milliseconds of silence before a working panel is called idle.',
    keywords: ['idle', 'timeout', 'threshold', 'delay', 'quiet', 'silence', 'milliseconds'],
    type: 'number',
    // MEASURED against a real claude session — see the M6c plan, Task 1. It is
    // not a round number chosen for looking reasonable: it sits above the p99
    // of within-turn gaps and below the shortest turn boundary worth noticing.
    default: 1500,
    min: 250,
    max: 60000,
    category: AGENT_CATEGORY
  }
```

and above `SETTINGS`, beside `RESTORE_CATEGORY`:

```ts
/** Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const AGENT_CATEGORY = 'Agent state'
```

The `agent.bell` description is where the spec's precondition 1 gets said out
loud — *"the bell only rings if the user's CLI is configured to ring it"* — and
the spec names this row as the cheapest place to say it. Do not trim it.

In `src/main/layout-store.ts`, inside `setPreference`, after the existing
type check and before the write:

```ts
    // Range, for the reason SettingDef.min/max records: both ends of the
    // idleness threshold fail silently, so a value outside them is refused
    // here rather than stored and puzzled over later.
    if (def.type === 'number' && typeof value === 'number') {
      if (def.min !== undefined && value < def.min) return false
      if (def.max !== undefined && value > def.max) return false
    }
```

> Read `setPreference` first: it already returns `false` for an unknown id and
> for a wrong-typed value (checks 72 and 72b). Match its existing return style.

- [ ] **Step 4: Run and watch them pass**

Run: `npm run verify:layout && npm run verify:palette && npm run typecheck`
Expected: layout `80/80`; palette still green — the two new booleans add rows
and `verify:palette`'s settings checks 51–54 are written against specific ids,
so if any of them counts rows, fix the count there and note why.

- [ ] **Step 5: Commit**

```sh
git add src/shared/settings-schema.ts src/main/layout-store.ts scripts/verify-layout.cjs
git commit -m "feat(m6c): three agent settings, and a range the store enforces"
```

---

### Task 5: The IPC surface

**Files:**
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc.ts`

**Interfaces:**
- Consumes: `AgentState`, `AgentStateUpdate` (Task 3).
- Produces:
  - `IPC.AGENT_ACKNOWLEDGE = 'agent:acknowledge'`
  - `IPC_EVENTS.AGENT_STATE = 'agent:state'`
  - `CanvasBridge.agent = { onState(listener: (u: AgentStateUpdate) => void): () => void; acknowledge(panelId: PanelId): Promise<void> }`
  - Nothing in `src/main/ipc.ts`. The handler is written in Task 7, beside the `PtyManager.acknowledge` it calls — splitting them would mean landing a handler that calls a method which does not exist, and no stub is worth that. This task ends with `verify:ipc` RED on purpose, and Task 7 is what turns it green.

`verify:ipc` walks `IPC` and fails on a channel with no handler, so adding
`AGENT_ACKNOWLEDGE` to `IPC` without a handler **is the failing check** — it
needs no new assertion written by hand. `AGENT_STATE` belongs in `IPC_EVENTS`,
not `IPC`, because it is fire-and-forget from main exactly as `PTY_DATA` is,
and `verify:ipc` deliberately does not walk `IPC_EVENTS`.

- [ ] **Step 1: Add the channel and watch verify:ipc fail**

In `src/shared/ipc-contract.ts`, inside `IPC`:

```ts
  /**
   * "I have looked at this panel." The renderer's half of clearing wants-you.
   *
   * Who clears the state is not symmetric, and that asymmetry is why this
   * channel exists at all. Typing is a fact main already holds — pty:write
   * names the panel — so main clears it there with nothing new. Focus is a
   * RENDERER fact: main has no idea which panel focusedId names. Clearing it
   * renderer-side instead would make the renderer a second author of a state
   * main owns, and the two would disagree the first time M6d fired a
   * notification for a panel the user had already read.
   */
  AGENT_ACKNOWLEDGE: 'agent:acknowledge'
```

In `IPC_EVENTS`:

```ts
  /**
   * What a panel's agent is doing. Main -> renderer, fire-and-forget, like
   * PTY_DATA — which is why it lives here rather than in IPC.
   *
   * Its own channel, deliberately: routing this through anything that bumps
   * registry.version() would re-render the whole canvas on agent output and
   * undo the memo that exists to block the 60Hz pan/zoom cascade. Main sends
   * only on an actual CHANGE of state, so a panel printing a megabyte
   * produces one message, not thousands.
   */
  AGENT_STATE: 'agent:state'
```

Extend `CanvasBridge`:

```ts
  agent: {
    /** Per-panel state updates. Each subscribe returns its own unsubscribe. */
    onState(listener: (update: AgentStateUpdate) => void): () => void
    /** Focus counts as reading it. See IPC.AGENT_ACKNOWLEDGE. */
    acknowledge(panelId: PanelId): Promise<void>
  }
```

and add `AgentStateUpdate` to the `import type` block from `./types`.

Run: `npm run verify:ipc`
Expected: FAIL — `agent:acknowledge` has no handler. That is the check.

- [ ] **Step 2: Add the preload bridge**

In `src/preload/index.ts`, add to the `bridge` object:

```ts
  agent: {
    onState: (listener) => subscribe<AgentStateUpdate>(IPC_EVENTS.AGENT_STATE, listener),
    acknowledge: (panelId: PanelId) => ipcRenderer.invoke(IPC.AGENT_ACKNOWLEDGE, panelId)
  },
```

and add `AgentStateUpdate` to the `import type` block from `../shared/types`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean. `verify:ipc` still fails, on purpose — Task 7 closes it.

- [ ] **Step 4: Commit**

```sh
git add src/shared/ipc-contract.ts src/preload/index.ts
git commit -m "feat(m6c): declare the agent-state channel and its acknowledge"
```

---

### Task 6: A number setting reaches the palette

**Files:**
- Modify: `src/renderer/palette/Palette.tsx` (`InputMode`)
- Modify: `src/renderer/palette/commands.ts`
- Modify: `src/renderer/canvas/Canvas.tsx` (`paletteActions`)
- Modify: `scripts/verify-palette.cjs` (checks 55–58)

**Interfaces:**
- Consumes: `SettingRow` (existing), the `agent.idleAfterMs` id (Task 4).
- Produces:
  - `InputMode` gains `'number'` to its `kind` union.
  - `PaletteActions` gains `beginEditSetting(id: string, label: string, current: number): void`.
  - `buildCommands` emits one row per `number` setting, `id: 'setting.<settingId>'`, `entersScope`-free, `scope: 'settings'`, `hiddenAtRest: true`, whose `run()` calls `actions.beginEditSetting`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-palette.cjs` (existing last check is 54):

```js
// 55. A NUMBER setting produces a row. Before M6c the loop `continue`d past
//     every non-boolean, so the idleness threshold would have been reachable
//     only by hand-editing layout.json — which fails success criterion 9,
//     "every one of those switches is found by typing a synonym into Cmd+K".
{
  const rows = C.buildCommands(ctxWith({
    settings: [{
      id: 'agent.idleAfterMs', label: 'Idle after', description: 'ms of silence',
      keywords: ['timeout'], type: 'number', value: 1500, category: 'Agent state'
    }]
  }), actions)
  ok(55, rows.some((r) => r.id === 'setting.agent.idleAfterMs'), 'a number setting gets a row')
}

// 56. The row's TITLE names the current value. A toggle row says which way it
//     sits (check 54); a number row that did not would leave the user editing
//     a value they cannot see.
{
  const row = buildOne({ id: 'agent.idleAfterMs', type: 'number', value: 1500 })
  ok(56, row.title.includes('1500'), 'a number row shows its current value')
}

// 57. Running it does NOT toggle anything — it opens an edit. Reusing
//     toggleSetting here would send `!1500` === false to a number setting and
//     the store would refuse it, silently, with the row unchanged.
{
  const calls = []
  const row = buildOne({ id: 'agent.idleAfterMs', type: 'number', value: 1500 },
    { ...actions, beginEditSetting: (...a) => calls.push(a),
      toggleSetting: () => calls.push(['TOGGLE']) })
  row.run()
  ok(57, calls.length === 1 && calls[0][0] === 'agent.idleAfterMs' && calls[0][2] === 1500,
    'a number row begins an edit, never a toggle')
}

// 58. Number rows obey the same hiddenAtRest rule as every other setting row:
//     M6p sized the resting list to about eight rows on purpose.
{
  const row = buildOne({ id: 'agent.idleAfterMs', type: 'number', value: 1500 })
  ok(58, row.hiddenAtRest === true && row.scope === 'settings',
    'a number row is hidden at rest and lives in the settings scope')
}
```

> `ctxWith`, `buildOne` and `actions` are this suite's existing helpers — read
> checks 51–54 and reuse exactly what is there. If `buildOne` does not exist,
> write it as a two-line wrapper over `buildCommands` beside the others rather
> than inlining `buildCommands` four times.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run verify:palette`
Expected: 1–54 PASS, 55–58 FAIL — `buildCommands` `continue`s past every
non-boolean, so no row exists.

- [ ] **Step 3: Emit the row**

In `src/renderer/palette/commands.ts`, replace the `if (setting.type !== 'boolean') continue` guard with a branch. Keep the boolean arm byte-identical to what is there now; add:

```ts
    if (setting.type === 'number') {
      const current = typeof setting.value === 'number' ? setting.value : 0
      out.push({
        id: `setting.${setting.id}`,
        // The value is in the TITLE, not only in the input it opens: a row
        // that said just "Idle after" would put the user in an edit field
        // with no idea what they are changing it from.
        title: `${setting.label}: ${current}`,
        subtitle: setting.description,
        searchText: setting.keywords.join(' '),
        group: 'setting',
        scope: 'settings',
        hiddenAtRest: true,
        // NOT toggleSetting. `!1500` is `false`, which a number setting's
        // store refuses — silently, leaving the row unchanged and the user
        // with no idea why pressing Enter did nothing.
        run: () => actions.beginEditSetting(setting.id, setting.label, current)
      })
      continue
    }
```

Extend `PaletteActions`:

```ts
  /**
   * Open the palette's input mode on a number setting. Required, not optional,
   * for the same reason toggleSetting is: an optional member is a compile-time
   * hole a half-finished wiring passes straight through.
   */
  beginEditSetting(id: string, label: string, current: number): void
```

The `manage.settings` door counts `ctx.settings.filter((s) => s.type === 'boolean')` today. Change it to count every setting that produces a row:

```ts
    // Booleans AND numbers now produce rows, so the count is the length again
    // — but derive it from the same predicate the loop uses rather than from
    // ctx.settings.length, so a future type that produces no row cannot make
    // this door claim a setting the scope does not show.
    const settingCount = ctx.settings.filter(
      (s) => s.type === 'boolean' || s.type === 'number'
    ).length
```

- [ ] **Step 4: Add the number input mode**

In `src/renderer/palette/Palette.tsx`, widen `InputMode`:

```ts
export interface InputMode {
  /**
   * 'number' is 'text' with a parse and a range on the way out. It is not a
   * new focus story: it inherits all four of usePalette's rules by being the
   * same input, which is exactly why M5a's "a modal would fight xterm for
   * keyboard focus" objection does not apply.
   */
  kind: 'text' | 'confirm' | 'number'
  label: string
  initial: string
  submit(value: string): void
}
```

In the `Enter` case, the existing branch is `if (inputMode.kind === 'confirm') … else if (value) inputMode.submit(value)`. A `'number'` mode falls into the `else if (value)` arm unchanged — an empty field is a cancel, exactly as an empty rename is. **No change is needed there**; the parse belongs in the submit callback, where the range and the setting id are both in scope.

The footer already reads `'↵ save · esc cancel'` for any non-confirm mode. Leave it.

- [ ] **Step 5: Wire the action**

In `src/renderer/canvas/Canvas.tsx`, add to `paletteActions`:

```ts
    beginEditSetting: (id, label, current) => {
      setInputMode({
        kind: 'number',
        label: `${label} (ms)\u2026`,
        initial: String(current),
        submit: (value) => {
          const parsed = Number(value)
          // A non-number is a cancel, not a write of NaN. main's setPreference
          // would refuse NaN anyway — it is the range check that makes this
          // safe — but bouncing it here means the palette does not close on a
          // typo and then silently change nothing.
          if (!Number.isFinite(parsed)) {
            setInputMode(null)
            return
          }
          void window.canvas.settings.set(id, parsed).then(() => {
            setInputMode(null)
            reloadSettings()
          })
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // and the clear-on-close effect would wipe it — the same pairing
      // beginRenamePreset and deletePreset both make.
      palette.openPalette()
    },
```

Add `reloadSettings` to that `useMemo`'s dependency array if it is not already there.

- [ ] **Step 6: Run and watch them pass**

Run: `npm run verify:palette && npm run typecheck`
Expected: `58/58 passed`, typecheck clean.

- [ ] **Step 7: Commit**

```sh
git add src/renderer/palette/commands.ts src/renderer/palette/Palette.tsx src/renderer/canvas/Canvas.tsx scripts/verify-palette.cjs
git commit -m "feat(m6c): a number setting is editable from the palette"
```

---

### Task 7: The detector at the choke point

**Files:**
- Modify: `src/main/pty-manager.ts`
- Modify: `src/main/ipc.ts`
- Modify: `scripts/verify-pty-manager.cjs` (checks 17–19)

**Interfaces:**
- Consumes: `scanForBell`, `INITIAL_SCAN`, `initialDetector`, `nextState`, `Detector` (Tasks 2–3); `IPC_EVENTS.AGENT_STATE`, `IPC.AGENT_ACKNOWLEDGE` (Task 5); `resolveSetting`, `SETTINGS` (Task 4).
- Produces:
  - `PtyManager` constructor gains a fourth argument: `getIdleAfterMs: () => number`, and a fifth: `getBellEnabled: () => boolean`.
  - `PtyManager.acknowledge(panelId: PanelId): void`
  - `Session` gains `detector: Detector`.

**Why getters and not values.** The same reason `getTarget` and `getBackend`
are getters: the manager is constructed at module scope, before the layout
store has resolved anything, and a captured number would also freeze the
setting at its boot value so changing it in the palette would reach nobody
until a relaunch.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-pty-manager.cjs` (existing last checks are 16/16b):

```js
// 17. A panel that prints something reaches 'busy', and the state arrives on
//     AGENT_STATE — not on PTY_DATA, and not by bumping anything the renderer
//     already subscribes to.
{
  const states = []
  const manager = makeManager({
    onSend: (channel, payload) => {
      if (channel === 'agent:state') states.push(payload)
    },
    idleAfterMs: 200
  })
  await manager.create(specFor('a1', `printf hello; sleep 5`))
  await waitFor(() => states.some((s) => s.panelId === 'a1' && s.state === 'busy'))
  ok(17, true, 'output produces a busy state on agent:state')
  manager.kill('a1')
}

// 18. THE TRAP, end to end. A window-title sequence must produce no
//     wants-you. This is the only check in the repo that proves the scanner
//     is actually wired to the byte stream rather than merely correct in
//     isolation — verify:agent-state 2 proves the function, this proves the
//     wiring.
{
  const states = []
  const manager = makeManager({
    onSend: (channel, payload) => {
      if (channel === 'agent:state') states.push(payload)
    },
    idleAfterMs: 200
  })
  await manager.create(specFor('a2', `printf '\\033]0;a title\\007'; sleep 5`))
  await delay(600)
  ok(18, !states.some((s) => s.panelId === 'a2' && s.state === 'wants-you'),
    'a window title produces no wants-you')
  manager.kill('a2')
}

// 19. A REAL bell does produce wants-you, and typing into the panel clears
//     it. Both halves matter: without the first the feature is inert, and
//     without the second the state is sticky forever and M6d's queue never
//     empties.
{
  const states = []
  const manager = makeManager({
    onSend: (channel, payload) => {
      if (channel === 'agent:state') states.push(payload)
    },
    idleAfterMs: 200
  })
  await manager.create(specFor('a3', `printf '\\007'; cat`))
  await waitFor(() => states.some((s) => s.panelId === 'a3' && s.state === 'wants-you'))
  const before = states.length
  manager.write('a3', 'x')
  await waitFor(() => states.length > before &&
    states[states.length - 1].state !== 'wants-you')
  ok(19, true, 'a real bell wants you, and typing clears it')
  manager.kill('a3')
}
```

> `makeManager`, `specFor`, `waitFor` and `delay` are this suite's existing
> helpers — read checks 1–16b and reuse them. `makeManager` will need its new
> `idleAfterMs`/`onSend` options threaded through to the constructor; add them
> there rather than constructing `PtyManager` inline four times.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run verify:pty-manager`
Expected: 1–16b PASS, 17–19 FAIL (nothing ever sends `agent:state`).

- [ ] **Step 3: Wire the detector**

In `src/main/pty-manager.ts`:

```ts
import { initialDetector, nextState, scanForBell, type Detector } from './agent-state'
import type { AgentState, PanelId, PanelSpec, PtyCreateResult } from '../shared/types'
```

Add the tick constant beside `FLUSH_INTERVAL_MS`:

```ts
/**
 * The idleness tick. A SEPARATE timer from the flush, and one per manager
 * rather than per session, because the flush timer only runs when there IS
 * pending data — it structurally cannot observe the absence of data, which is
 * the entire signal idleness is made of.
 *
 * 500ms is the resolution of "idle", not its threshold: the threshold is the
 * agent.idleAfterMs setting, and this only bounds how late the transition can
 * be reported. One timer for the whole app at 2Hz costs nothing.
 */
const IDLE_TICK_MS = 500
```

Add `detector: Detector` to the `Session` interface, and a field to the class:

```ts
  private idleTimer: NodeJS.Timeout | null = null
```

Extend the constructor:

```ts
    private readonly getBackend: () => SessionBackend,
    /**
     * Getters for the same reason getTarget and getBackend are: this manager
     * is constructed at module scope, before the layout store has resolved
     * anything — and a captured value would also freeze the setting at its
     * boot value, so a change made in the palette would reach nothing until a
     * relaunch.
     */
    private readonly getIdleAfterMs: () => number = () => 1500,
    private readonly getBellEnabled: () => boolean = () => true
```

In `create`, initialise the detector when building the `Session` literal:

```ts
      reattached,
      detector: initialDetector(Date.now())
```

and start the tick after `this.sessions.set(...)`:

```ts
    this.startIdleTick()
```

In the `onExit` handler, after the flush and before the send, drive the machine to its terminal state and stop the tick if nothing is left:

```ts
      this.applyEvent(session, { kind: 'exit' })
      if (this.sessions.size === 0) this.stopIdleTick()
```

In `write`, clear `wants-you` — main already knows the panel:

```ts
    session.proc.write(data)
    // Typing into a panel is reading it. Main holds this fact already, which
    // is why only the FOCUS half needed a new channel.
    this.applyEvent(session, { kind: 'acknowledge' })
    return true
```

Add the public acknowledge and the private machinery:

```ts
  /** The renderer's half of clearing wants-you. See IPC.AGENT_ACKNOWLEDGE. */
  acknowledge(panelId: PanelId): void {
    const session = this.sessions.get(panelId)
    if (!session) return
    this.applyEvent(session, { kind: 'acknowledge' })
  }

  private startIdleTick(): void {
    if (this.idleTimer) return
    this.idleTimer = setInterval(() => {
      for (const session of this.sessions.values()) {
        this.applyEvent(session, { kind: 'tick' })
      }
    }, IDLE_TICK_MS)
    // Do not hold the process open for a 2Hz timer nothing is waiting on.
    this.idleTimer.unref?.()
  }

  private stopIdleTick(): void {
    if (!this.idleTimer) return
    clearInterval(this.idleTimer)
    this.idleTimer = null
  }

  /**
   * Runs one event through the state machine and sends ONLY on an actual
   * change. That dedupe is the throttle the design asks for: a panel printing
   * a megabyte produces one 'busy' message rather than one per 16ms flush, so
   * this channel cannot become the 60Hz cascade the renderer's memo exists to
   * block.
   */
  private applyEvent(session: Session, event: Parameters<typeof nextState>[1]): void {
    const before = session.detector.state
    session.detector = nextState(session.detector, event, Date.now(), this.getIdleAfterMs())
    if (session.detector.state === before) return
    this.send(IPC_EVENTS.AGENT_STATE, {
      panelId: session.panelId,
      state: session.detector.state satisfies AgentState
    })
  }
```

In `enqueue`, run the scanner **before** the buffering, so a bell is seen even
when the flush is still pending:

```ts
  private enqueue(session: Session, data: string): void {
    // The choke point. Every byte from every PTY in this app passes here, so
    // the detector sits at the one place both of its signals exist — and a
    // dormant panel, which has no entry in this map at all, cannot produce a
    // state. The bug where a restored canvas draws indicators for processes
    // that do not exist is unreachable rather than defended against.
    const scanned = scanForBell(session.detector.scan, data)
    session.detector = { ...session.detector, scan: scanned.state }
    this.applyEvent(session, { kind: 'output' })
    // Bells are counted, not merely detected, but the state machine treats
    // any positive count as one event: two bells in one flush are one request
    // for attention.
    if (scanned.bells > 0 && this.getBellEnabled()) {
      this.applyEvent(session, { kind: 'bell' })
    }

    session.buffer.push(data)
    if (session.flushTimer) return
    session.flushTimer = setTimeout(() => this.flush(session), FLUSH_INTERVAL_MS)
  }
```

In `kill`, `killAll` and `detachAll`, stop the tick once the map empties:

```ts
    this.sessions.delete(panelId)
    if (this.sessions.size === 0) this.stopIdleTick()
```

(`detachAll` ends its loop with `this.sessions.delete(session.panelId)`; add the same line after the loop.)

- [ ] **Step 4: Handle the acknowledge invoke**

In `src/main/ipc.ts`, beside the other handlers:

```ts
  ipcMain.handle(IPC.AGENT_ACKNOWLEDGE, (_event, panelId: PanelId) => {
    ptyManager.acknowledge(panelId)
  })
```

- [ ] **Step 5: Pass the getters at construction**

In `src/main/index.ts`, where `new PtyManager(...)` is built, add:

```ts
  () => Number(layoutStore.getSetting('agent.idleAfterMs')),
  () => layoutStore.getSetting('agent.bell') === true
```

> Read the surrounding lines first — `layoutStore` may be constructed after the
> manager. If it is, thread it the same way `getBackend` is threaded: a getter
> closing over the variable, not the value.

- [ ] **Step 6: Run everything**

Run: `npm run verify:agent-state && npm run verify:pty-manager && npm run verify:ipc && npm run typecheck`
Expected: agent-state `24/24`; pty-manager `19` checks green (skipped loudly if no tmux, as before); `verify:ipc` now green at 20 channels; typecheck clean.

- [ ] **Step 7: Commit**

```sh
git add src/main/pty-manager.ts src/main/ipc.ts src/main/index.ts scripts/verify-pty-manager.cjs
git commit -m "feat(m6c): the detector rides the one function every byte passes through"
```

---

### Task 8: The renderer store

**Files:**
- Create: `src/renderer/session/agent-state-store.ts`
- Modify: `src/renderer/canvas/Canvas.tsx` (one subscription)

**Interfaces:**
- Consumes: `AgentState`, `AgentStateUpdate` (Task 3); `window.canvas.agent.onState` (Task 5).
- Produces:
  - `function applyAgentState(panelId: PanelId, state: AgentState): void`
  - `function clearAgentState(panelId: PanelId): void`
  - `function getAgentState(panelId: PanelId): AgentState | undefined`
  - `function useAgentState(panelId: PanelId): AgentState | undefined`

- [ ] **Step 1: Write the store**

Create `src/renderer/session/agent-state-store.ts`:

```ts
import { useSyncExternalStore } from 'react'
import type { AgentState, PanelId } from '@shared/types'

/**
 * What each panel's agent is doing, as told by main.
 *
 * Module-level and outside React, like session-registry.ts — but subscribed
 * PER PANEL ID rather than through one version counter, and that difference is
 * the whole point. registry.version() deliberately ignores 16ms-batched PTY
 * data so a chatty agent cannot re-render the canvas at 60Hz; routing agent
 * state through it would put exactly that traffic back. Here a state change
 * notifies the one panel it is about and nothing else.
 *
 * This store is a CACHE of main's state, never a second author of it. Nothing
 * in the renderer writes a state it decided for itself — focus goes out over
 * agent:acknowledge and comes back as an update, so main stays the only place
 * the machine runs. See IPC.AGENT_ACKNOWLEDGE for why that asymmetry exists.
 */

const states = new Map<PanelId, AgentState>()
const listeners = new Map<PanelId, Set<() => void>>()

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (!set) return
  for (const listener of set) listener()
}

/** Called by the one IPC subscription in Canvas.tsx. */
export function applyAgentState(panelId: PanelId, state: AgentState): void {
  if (states.get(panelId) === state) return
  states.set(panelId, state)
  notify(panelId)
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Without
 * this the map grows for the life of the renderer and a recycled panel id
 * would inherit a dead panel's border.
 */
export function clearAgentState(panelId: PanelId): void {
  if (!states.has(panelId)) return
  states.delete(panelId)
  notify(panelId)
}

export function getAgentState(panelId: PanelId): AgentState | undefined {
  return states.get(panelId)
}

function subscribe(panelId: PanelId, listener: () => void): () => void {
  let set = listeners.get(panelId)
  if (!set) {
    set = new Set()
    listeners.set(panelId, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(panelId)
  }
}

/**
 * The snapshot is a string or undefined — a primitive, so useSyncExternalStore
 * can compare it by identity without a cache. Returning the map, or an object
 * built per call, would make React see a new value every render and loop.
 */
export function useAgentState(panelId: PanelId): AgentState | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => states.get(panelId),
    () => states.get(panelId)
  )
}
```

- [ ] **Step 2: Subscribe once, in Canvas**

In `src/renderer/canvas/Canvas.tsx`, alongside the other `window.canvas` subscriptions:

```ts
  // ONE subscription for the whole canvas, not one per panel: the payload
  // names its own panel, and the store fans it out to exactly the panel that
  // subscribed to that id. A per-panel subscription would mean every panel
  // receiving and discarding every other panel's updates — the same argument
  // the single Cmd+C/Cmd+V subscription makes.
  useEffect(() => window.canvas.agent.onState((update) => {
    applyAgentState(update.panelId, update.state)
  }), [])
```

At each of the three `registry.dispose(id)` call sites — the close button, undo/redo removing a panel, and the reset handler — add `clearAgentState(id)` beside it. (Re-derive the sites with `grep -n "registry.dispose" src/renderer/canvas/Canvas.tsx`; `CLAUDE.md` records that this count has been stale before.)

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean. Nothing renders the state yet — that is Task 9.

- [ ] **Step 4: Commit**

```sh
git add src/renderer/session/agent-state-store.ts src/renderer/canvas/Canvas.tsx
git commit -m "feat(m6c): a per-id agent-state store that never touches version()"
```

---

### Task 9: The glow, on the panel and on the card

**Files:**
- Modify: `src/renderer/components/TerminalPanel.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/canvas/Canvas.tsx` (the glow setting as a prop; acknowledge on focus)

**Interfaces:**
- Consumes: `useAgentState` (Task 8); `agent.glow` (Task 4); `window.canvas.agent.acknowledge` (Task 5).
- Produces: `TerminalPanelProps` gains `glow: boolean`. `.panel` and `.panel__card` gain `data-agent-state` and the `panel--agent-*` classes.

- [ ] **Step 1: Subscribe in the panel**

In `src/renderer/components/TerminalPanel.tsx`, add to `TerminalPanelProps`:

```ts
  /**
   * Whether the agent.glow setting is on. A prop rather than a read inside
   * this component, because memo's shallow compare has to SEE it change —
   * the same reason `version` and `title` are props.
   */
  glow: boolean
```

In the component body:

```ts
  // Subscribed per id, so an agent's state change re-renders this panel and
  // no other. Deliberately NOT routed through registry.version(), which
  // ignores PTY data on purpose so a chatty agent cannot drive the canvas at
  // 60Hz — see agent-state-store.ts.
  const agentState = useAgentState(session.id)
  const agentClass = glow && agentState ? ` panel--agent-${agentState}` : ''
```

Put it on the root:

```tsx
    <div
      className={`panel${selected ? ' panel--selected' : ''}${agentClass}`}
      data-panel-id={session.id}
      data-agent-state={glow ? agentState : undefined}
```

and pass it into the card, which is **not** an afterthought — it is the tier you are looking at when you have enough panels for this feature to matter:

```tsx
        <PanelCard session={session} agentState={glow ? agentState : undefined} />
```

```tsx
function PanelCard({ session, agentState }: {
  session: PanelSession
  agentState?: AgentState
}): JSX.Element {
  const lines = session.spawned ? session.handle.tail(CARD_LINES) : []
  return (
    <div
      // The card carries the state too. A glow that reached only live panels
      // would be invisible exactly when it matters: LIVE_BUDGET caps live
      // panels at eight, so on the twelve-panel canvas this feature exists
      // for, most of what wants you is a card.
      className={`panel__card${agentState ? ` panel__card--agent-${agentState}` : ''}`}
    >
```

Import `useAgentState` and the `AgentState` type at the top.

- [ ] **Step 2: Style it**

In `src/renderer/styles.css`, after `.panel--selected`:

```css
/* Agent state, M6c. A BORDER rather than a fill: the panel's body is a
   terminal, and tinting it would fight the agent's own colours — which
   tmux-args.ts goes out of its way to pass through at 24-bit. */
.panel--agent-busy { border-color: var(--blue); }
.panel--agent-idle { border-color: var(--border); }
.panel--agent-wants-you {
  border-color: var(--amber);
  /* The one state with a second visual channel. wants-you is the only signal
     that carries INTENT — idleness cannot tell "finished" from "asked you a
     question" — so it is the only one worth making findable across a canvas. */
  box-shadow: 0 0 0 2px var(--amber);
}
.panel--agent-exited { border-color: var(--red); }

/* .panel--selected must still win: selection is where the USER is, and a
   border that stopped tracking the click would make the canvas feel broken
   in a way no colour is worth. Declared after, so it does. */
.panel--selected,
.panel--selected.panel--agent-busy,
.panel--selected.panel--agent-idle,
.panel--selected.panel--agent-wants-you,
.panel--selected.panel--agent-exited {
  border-color: var(--blue);
  box-shadow: 0 0 0 1px var(--blue);
}

/* The card's own left rule. The card sits inside .panel, so it already gets
   the border above — this is what makes the state legible at the zoom where
   a 1px border is a hairline. */
.panel__card--agent-busy { border-left: 3px solid var(--blue); }
.panel__card--agent-wants-you { border-left: 3px solid var(--amber); }
.panel__card--agent-exited { border-left: 3px solid var(--red); }
.panel__card--agent-idle { border-left: 3px solid var(--border); }
```

> Check the `:root` block at the top of `styles.css` for the variable names it
> actually declares. If `--amber` and `--red` are not there, add them beside
> the existing `--blue`; do not hardcode hex values in the rules above.

- [ ] **Step 3: Pass the setting down, and acknowledge on focus**

In `src/renderer/canvas/Canvas.tsx`:

```ts
  // Read once at mount and again whenever a setting changes, so toggling the
  // glow off takes effect without a relaunch. settingRows is loaded only when
  // the palette OPENS, so it cannot be the source here — a panel must know
  // this whether or not the palette has ever been opened.
  const [glowEnabled, setGlowEnabled] = useState(true)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'agent.glow')
      if (row) setGlowEnabled(row.value === true)
    })
  }, [settingRows])
```

Pass `glow={glowEnabled}` to `<TerminalPanel …>`.

In `onFocusPanel`:

```ts
  const onFocusPanel = useCallback((id: string) => {
    onSelectPanel(id)
    setFocusedId(id)
    registry.focus(id)
    // Looking at a panel is reading it. Sent unconditionally rather than only
    // when this panel is in wants-you: main is the only author of that state,
    // and a renderer that decided when to bother telling it would be deciding
    // the state itself — the exact second-author problem the acknowledge
    // channel exists to avoid. The handler is a map lookup and a no-op for
    // any panel that does not want you.
    void window.canvas.agent.acknowledge(id)
  }, [onSelectPanel])
```

- [ ] **Step 4: Build and look at it**

Run: `npm run build && npm run dev`

By hand: open a panel, run `sleep 5; printf '\a'` in it. Expected: the border
goes blue while output flows, settles to the idle colour, and turns amber on
the bell. Click another panel, then click back: the amber clears. Zoom out
until the panel becomes a card and repeat — the card's left rule must show the
same state (success criterion 6). Then run `printf '\033]0;hi\007'` and confirm
**nothing changes at all** (success criterion 5).

- [ ] **Step 5: Commit**

```sh
git add src/renderer/components/TerminalPanel.tsx src/renderer/styles.css src/renderer/canvas/Canvas.tsx
git commit -m "feat(m6c): the state reaches the border, and the card is not an afterthought"
```

---

### Task 10: End-to-end checks in a real renderer

**Files:**
- Modify: `scripts/verify-panels.cjs` (checks 54–57)
- Modify: `scripts/panels-entry.cjs` if the manager's new constructor arguments need supplying there

**Interfaces:**
- Consumes: everything above.
- Produces: no source changes — this task exists to prove the wiring the unit tiers cannot see.

The unit tiers prove the scanner, the machine, and the manager separately.
None of them proves a state reaching a **card**, which is the tier the feature
exists for, or the acknowledge round trip through a real renderer.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs` (existing last check is 53):

```js
// 54. A bell in a REAL renderer reaches the panel's DOM. Read off the
//     data-agent-state attribute rather than a class list, so the assertion
//     survives a restyle.
{
  await zoomTo(wc, 'n')                       // a fresh panel, live
  const id = await lastPanelId(wc)
  await write(wc, id, "printf '\\007'\r")
  await waitForJS(wc, `document.querySelector('[data-panel-id="${id}"]')
    ?.getAttribute('data-agent-state') === 'wants-you'`)
  ok(54, true, 'a real bell reaches the panel in a real renderer')
}

// 55. THE TRAP, in a real renderer. A window title must move nothing. This is
//     the third and last place the trap is checked, and deliberately so: the
//     function (verify:agent-state 2), the wiring (verify:pty-manager 18), and
//     the pixels. A regression at any one of the three is silent at the other
//     two.
{
  const id = await lastPanelId(wc)
  await clickPanel(wc, id)                    // acknowledge, so we start clean
  await write(wc, id, "printf '\\033]0;a title\\007'\r")
  await delay(800)
  const state = await wc.executeJavaScript(`document.querySelector(
    '[data-panel-id="${id}"]')?.getAttribute('data-agent-state')`)
  ok(55, state !== 'wants-you', 'a window title moves nothing in a real renderer')
}

// 56. THE CARD. The glow must reach the tier this feature exists for:
//     LIVE_BUDGET caps live panels at eight, so on the twelve-panel canvas
//     M6c is for, most of what wants you is a card. A check written only
//     against a live panel would pass against an implementation that renders
//     nothing on cards at all.
{
  const id = await lastPanelId(wc)
  await write(wc, id, "printf '\\007'\r")
  await waitForJS(wc, `document.querySelector('[data-panel-id="${id}"]')
    ?.getAttribute('data-agent-state') === 'wants-you'`)
  // Demote it: pan far enough that the panel leaves the cull region.
  await panBy(wc, -4000, 0)
  await waitForJS(wc, `!!document.querySelector('[data-panel-id="${id}"] .panel__card')`)
  const cardClass = await wc.executeJavaScript(`document.querySelector(
    '[data-panel-id="${id}"] .panel__card')?.className`)
  ok(56, cardClass.includes('panel__card--agent-wants-you'), 'the glow reaches a card')
}

// 57. Focusing a panel clears wants-you — the acknowledge round trip, through
//     a real renderer and a real main. The renderer never writes the cleared
//     state itself: it asks, main runs the machine, and the answer comes back
//     on agent:state. A check that only read the DOM after a click would pass
//     against a renderer that cleared it locally and left main still
//     believing the panel wants you, which is precisely the disagreement M6d
//     would then fire a notification into.
{
  await panBy(wc, 4000, 0)                    // bring it back
  const id = await lastPanelId(wc)
  await clickPanel(wc, id)
  await waitForJS(wc, `document.querySelector('[data-panel-id="${id}"]')
    ?.getAttribute('data-agent-state') !== 'wants-you'`)
  ok(57, true, 'focus acknowledges, and main is the one that answers')
}
```

> `zoomTo`, `write`, `waitForJS`, `clickPanel`, `panBy`, `lastPanelId` and
> `delay` are this suite's existing helpers under whatever names it already
> uses — read the file and match them exactly rather than introducing new ones.
> If `lastPanelId` does not exist, note `CLAUDE.md`'s warning on check 51: read
> panels by `data-panel-id`, never "the last `.panel`", since array order and
> paint order are deliberately different here.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: 1–53 PASS, 54–57 FAIL if any wiring from Tasks 7–9 is missing. If they
all pass on the first run, **check they are actually running** — a helper name
typo makes an `await` reject and can take the suite down in a way that reads
like something else.

- [ ] **Step 3: Fix what they catch, then run everything**

Run: `npm run verify`
Expected: every suite green, including the new `verify:agent-state`.

- [ ] **Step 4: Commit**

```sh
git add scripts/verify-panels.cjs scripts/panels-entry.cjs
git commit -m "test(m6c): the glow on a card, and the acknowledge round trip"
```

---

### Task 11: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

`CLAUDE.md` is the contract the next reader works from, and its verify table is
the place check counts live. Every entry below records a failure that is
**silent** without it — that is the standard this file holds.

- [ ] **Step 1: Update the verify table in `CLAUDE.md`**

Add a `verify:agent-state` row (plain node, 24 checks, describing the OSC trap
and the split-chunk case as the two that matter). Update the counts and the
descriptions for `verify:layout` (→ 80), `verify:palette` (→ 58 with the number
row), `verify:pty-manager` (→ 19 with the wiring proof), `verify:ipc` (→ 20
channels), and `verify:panels` (→ 61 checks, last number 57).

Add `verify:agent-state` to the plain-node justification paragraph: it gets
there by importing neither `electron` nor `node-pty`, exactly as `tmux-args.ts`
does.

- [ ] **Step 2: Add the load-bearing details**

Add these entries under "Load-bearing details", each with its *why*:

- **A title is not a bell (`agent-state.ts`'s `scanForBell`).** Why an
  `indexOf(0x07)` is wrong, what `ESC ] 0 ; … BEL` is, why the state is carried
  between calls, and that the trap is checked in three tiers because a
  regression at any one is silent at the other two.
- **`wants-you` is sticky, and who clears it is asymmetric.** Typing is main's
  fact; focus is the renderer's; hence `agent:acknowledge`, and why clearing
  renderer-side would make the renderer a second author of a state main owns.
- **The idleness tick is a second timer on purpose.** The flush timer only runs
  when there is pending data, so it cannot observe the absence of data.
- **The agent-state channel must never bump `registry.version()`.** Separate
  channel, separate store, per-id subscription, and main sends only on change.
- **The glow reaches the card.** `LIVE_BUDGET` is 8, so on the canvas this
  feature exists for most of what wants you is a card.
- **`exited` here is not an exit code.** `PanelStatus.exited` stays
  authoritative; this exists only so the detector stops emitting.
- **`agent.idleAfterMs` is measured, and bounded.** Record the number from Task
  1 and the percentile that justified it. Both ends of the range fail silently.

- [ ] **Step 3: Update `README.md`**

Add `| M6c | Agent state: a border that says what each panel is doing | ✅ done |`
to the milestone table, add `verify:agent-state` to the script list, add the
two new channels to the architecture diagram, and add a "Things that are
non-obvious" paragraph on the bell — including the honest precondition that it
only rings if the user's CLI is configured to ring it.

- [ ] **Step 4: Refresh the knowledge graph**

Run: `graphify update .`
Then, because this task changed prose and `update` is AST-only: `graphify .`

- [ ] **Step 5: Final verification and commit**

Run: `npm run verify`
Expected: every suite green. Paste the output rather than describing it.

```sh
git add CLAUDE.md README.md graphify-out
git commit -m "docs(m6c): CLAUDE.md catches up to the agent-state detector"
```

---

## What this plan deliberately does not do

- **No edge indicators, no jump key, no notification, no dock badge, no sound.**
  All five are M6d. M6c stops at "the panel says what it is doing"; M6d is
  "and you are told when you are not looking at it". The backlog's constraint —
  *"a status colour nobody sees is not a status system"* — is what makes M6d
  non-optional, not what makes it part of M6c.
- **No transcript watching.** Out of scope per the spec: Claude-Code-specific,
  needs panel-to-session-file correlation, and moves agent output to a new
  reader.
- **No restart-in-place for an exited panel.** Backlog #29; adding a third
  `pty.kill` caller is a deliberate act that deserves its own milestone.
- **No semantic zoom.** The glow renders on the card as the card exists today.
