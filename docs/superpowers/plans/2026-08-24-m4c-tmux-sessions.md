# M4c: tmux-Backed Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a running agent survive a renderer teardown — `Cmd+R`, `Cmd+W`, or a renderer crash lands back in the still-running process instead of killing it.

**Architecture:** A private tmux server (`-L terminal-canvas`) owns one session per panel. `tmux new-session -A` attaches if the session exists and creates it if it does not, so "create" and "reattach" are the same call and the renderer's `session-registry.ts` never learns reattachment exists. (Post-review correction: it needed exactly one change — `dispose()`/`disposeAll()` had to stop skipping `pty.kill` for a never-spawned panel, which under tmux can still own a surviving session. `lod.ts` really did need none.) A `SessionBackend` interface injected into `PtyManager` has two implementations — `TmuxBackend` and a `DirectBackend` that restores today's exact behaviour when tmux is unusable. The single `killAll()` that serves every teardown path today splits into three operations that no longer mean the same thing: **detach** (renderer gone, sessions live), **destroy** (panel closed, session dies), **shutdown** (quit, server dies).

**Tech Stack:** Electron 43, TypeScript, `node-pty` 1.1.0, tmux ≥ 3.0, esbuild (verify bundles only). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-m4c-tmux-sessions-design.md`

## Global Constraints

- **tmux socket name is `terminal-canvas`**, always passed as `-L terminal-canvas`. Never touch the default socket — the user's own tmux sessions must be invisible to this app, and `kill-server` must only ever reach ours.
- **Minimum tmux version is 3.0.** Below it, or unparseable, or absent → `DirectBackend`.
- **The tmux binary is always invoked by absolute path**, resolved via `whichFromEnv('tmux', env)` against the login-shell environment. A launchd-launched GUI app has a bare PATH and will not find `/opt/homebrew/bin/tmux` by name. This is the same defect `shell-env.ts` exists to fix.
- **`panelId` is safe to interpolate into shell strings** — `ID_PATTERN` in `src/shared/layout-schema.ts` restricts it to `[A-Za-z0-9_-]+`. Do not add escaping; do not remove the pattern.
- **The generated tmux config must contain `prefix None`, `status off`, `default-terminal "xterm-256color"`, `terminal-features ",xterm-256color:RGB"`, `remain-on-exit on`, and the `pane-died` hook. It must NOT contain `mouse on`.** Each is load-bearing and fails silently; see the spec's config section for the reason attached to each.
- **Every new comment explains *why*, not *what*.** `CLAUDE.md`: "a non-obvious line without a reason attached will be 'fixed' by someone later."
- **`npm run verify` must be green before any task is claimed done.** There is no unit-test runner and no linter; the verify suites are the whole verification story.
- **Commits use conventional format scoped to the milestone:** `feat(m4c): ...`, `fix(m4c): ...`, `test(m4c): ...`, `docs(m4c): ...`.

## Deliberate deviation from the spec

The spec's "Files" section puts the pure builders inside `src/main/session-backend.ts`. **That is not implementable.** `session-backend.ts` must import `node-pty`, a native module compiled against Electron's ABI that will not load under plain `node` — so a plain-node `verify:tmux` could not import the builders from there, defeating the reason the spec demanded they be pure in the first place.

The builders therefore live in **`src/main/tmux-args.ts`**, which imports nothing native and nothing from Electron. `session-backend.ts` imports *from* it. Everything else in the spec's file list stands.

## File structure

| File | Responsibility |
|---|---|
| `src/main/tmux-args.ts` (new) | **Pure.** Argv construction, config text, version parsing, list-output parsing, exit-file paths. No `node-pty`, no `electron`, no `fs`. This is the plain-node testable core. |
| `src/main/session-backend.ts` (new) | The `SessionBackend` interface, `createDirectBackend`, `createTmuxBackend`. Impure: spawns, reads files, runs tmux. |
| `src/main/tmux-probe.ts` (new) | `chooseBackend` (pure) and `probeTmux` (impure startup probe). Separate from the backend for the same reason `shell-env.ts` is separate from `pty-manager.ts`. |
| `src/main/pty-manager.ts` | Unchanged responsibilities. Gains a backend getter; three call sites change. |
| `src/main/window-lifecycle.ts` | Detaches instead of killing. Comment rewritten — it currently describes M4c in the future tense. |
| `src/main/index.ts` | Probe at startup, own the backend, `shutdown()` on quit, orphan reconciliation. |
| `src/main/ipc.ts`, `src/shared/ipc-contract.ts`, `src/preload/index.ts` | The `session:backend` channel. |
| `src/renderer/main.tsx` | Boot reconciliation: `pty.list()` decides dormancy. |
| `src/renderer/App.tsx`, `src/renderer/canvas/Canvas.tsx` | Thread the live-session set and backend kind through. |
| `src/renderer/canvas/CanvasHud.tsx` | The direct-backend indicator. |
| `scripts/tmux-entry.cjs`, `scripts/verify-tmux.cjs` (new) | The plain-node suite. |

---

### Task 1: The pure tmux core and its plain-node suite

**Files:**
- Create: `src/main/tmux-args.ts`
- Create: `scripts/tmux-entry.cjs`
- Create: `scripts/verify-tmux.cjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: everything below is imported by Tasks 2–4.

```ts
export const TMUX_SOCKET = 'terminal-canvas'
export const MIN_TMUX_MAJOR = 3
export interface TmuxVersion { major: number; minor: number; raw: string }
export interface TmuxListEntry { panelId: string; pid: number; command: string; cwd: string }
export function parseTmuxVersion(raw: string): TmuxVersion | null
export function isSupportedTmuxVersion(v: TmuxVersion | null): boolean
export function exitFilePath(exitDir: string, panelId: string): string
export function buildTmuxConf(exitDir: string): string
export function buildTmuxArgs(o: { confPath: string; panelId: string; cols: number; rows: number; command: string; args: string[] }): string[]
export function buildListArgs(): string[]
export function buildKillSessionArgs(panelId: string): string[]
export function buildKillServerArgs(): string[]
export function parseListOutput(stdout: string): TmuxListEntry[]
```

- [ ] **Step 1: Write the failing suite**

Create `scripts/tmux-entry.cjs`:

```js
/* esbuild entry for the tmux suite. tmux-args.ts is pure — no node-pty, no
   electron, no fs — which is what keeps this suite in the cheap plain-node
   tier. If this entry ever needs `external: ['node-pty']`, something impure
   has leaked into tmux-args.ts and belongs in session-backend.ts instead. */
module.exports = {
  ...require('../src/main/tmux-args')
}
```

Create `scripts/verify-tmux.cjs`:

```js
/* Verifies the pure tmux core: argv construction, config text, version
   parsing, and list parsing.
   Run with: npm run verify:tmux

   Plain node, no tmux server, no Electron. Every check here guards a failure
   that is SILENT in a running app: a missing config line that degrades colour
   or steals Ctrl+B, or a list that reports a dead pane as live. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'tmux.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'tmux-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  // Same alias the other plain-node bundles gained in M4b. A value import from
  // @shared fails to resolve without it, and type-only imports hide the gap.
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const T = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

// 1. Version strings tmux actually emits, including suffixed and prefixed forms.
{
  const cases = [
    ['tmux 3.7c', 3, 7],
    ['tmux 3.0', 3, 0],
    ['tmux 2.9a', 2, 9],
    ['tmux next-3.4', 3, 4],
    ['tmux 3.5\n', 3, 5]
  ]
  let bad = null
  for (const [raw, major, minor] of cases) {
    const v = T.parseTmuxVersion(raw)
    if (!v || v.major !== major || v.minor !== minor) bad = `${raw} -> ${JSON.stringify(v)}`
  }
  ok('1 real tmux version strings parse', bad === null, bad ?? 'all 5 parsed')
}

// 2. Unparseable input yields null rather than a wrong number. A version we
// cannot read must send us to the fallback, never to an optimistic guess.
{
  const bad = ['', 'tmux', 'not a version', 'tmux abc'].filter((r) => T.parseTmuxVersion(r) !== null)
  ok('2 unreadable version output is null, not a guess', bad.length === 0, `leaked=${JSON.stringify(bad)}`)
}

// 3. The >= 3.0 gate, including the null case.
{
  const v = (major, minor) => ({ major, minor, raw: 'x' })
  const pass =
    T.isSupportedTmuxVersion(v(3, 0)) === true &&
    T.isSupportedTmuxVersion(v(3, 7)) === true &&
    T.isSupportedTmuxVersion(v(4, 0)) === true &&
    T.isSupportedTmuxVersion(v(2, 9)) === false &&
    T.isSupportedTmuxVersion(null) === false
  ok('3 the >= 3.0 gate accepts 3.0+ and rejects 2.9 and null', pass)
}

// 4. Every load-bearing config line is present. Each of these fails SILENTLY:
// a missing prefix line steals Ctrl+B from the agent, a missing :RGB line
// downsamples 24-bit colour, a missing hook hangs the panel on exit.
{
  const conf = T.buildTmuxConf('/tmp/exits')
  const required = [
    'status off',
    'prefix None',
    'default-terminal "xterm-256color"',
    'terminal-features ",xterm-256color:RGB"',
    'remain-on-exit on',
    'pane-died'
  ]
  const missing = required.filter((line) => !conf.includes(line))
  ok('4 the generated config carries every load-bearing line', missing.length === 0,
    `missing=${JSON.stringify(missing)}`)
}

// 5. mouse must stay OFF. `mouse on` makes tmux capture mouse reporting
// instead of passing it to the application, which would silently defeat all of
// M4a's pointer correction from one process further down.
{
  const conf = T.buildTmuxConf('/tmp/exits')
  ok('5 the config never enables tmux mouse capture', !/mouse\s+on/.test(conf),
    JSON.stringify(conf.match(/.*mouse.*/g) ?? []))
}

// 6. The hook writes the exit file BEFORE killing the session. That ordering is
// what lets main read the real exit code inside the onExit handler it already
// has, with no watcher and no polling. Reverse them and the file is racing.
{
  const conf = T.buildTmuxConf('/tmp/exits')
  const hook = (conf.match(/set-hook -g pane-died .*/) ?? [''])[0]
  const writeAt = hook.indexOf('pane_dead_status')
  const killAt = hook.indexOf('kill-session')
  ok('6 the pane-died hook writes the exit file before killing the session',
    writeAt !== -1 && killAt !== -1 && writeAt < killAt,
    `write@${writeAt} kill@${killAt}`)
}

// 7. The spawn argv: private socket, create-or-attach, explicit size, and the
// command after `--`.
{
  const args = T.buildTmuxArgs({
    confPath: '/tmp/tc.conf', panelId: 'n5', cols: 100, rows: 30,
    command: '/bin/zsh', args: ['-l']
  })
  const j = args.join(' ')
  const pass =
    j.includes('-L terminal-canvas') &&
    j.includes('-f /tmp/tc.conf') &&
    j.includes('new-session -A -s n5') &&
    j.includes('-x 100') && j.includes('-y 30') &&
    args[args.indexOf('--') + 1] === '/bin/zsh' &&
    args[args.indexOf('--') + 2] === '-l'
  ok('7 the spawn argv creates-or-attaches on the private socket at a real size', pass, j)
}

// 8. `--` must precede the command, or a command starting with `-` is eaten as
// a tmux flag rather than run.
{
  const args = T.buildTmuxArgs({
    confPath: '/tmp/tc.conf', panelId: 'p1', cols: 80, rows: 24,
    command: '-weird', args: []
  })
  ok('8 a command starting with a dash survives as the command', args[args.indexOf('--') + 1] === '-weird',
    args.join(' '))
}

// 9. Every subcommand targets the private socket. A missing -L here reaches
// the user's real tmux server, and kill-server would destroy their work.
{
  const all = [T.buildListArgs(), T.buildKillSessionArgs('p1'), T.buildKillServerArgs()]
  const bad = all.filter((a) => !(a[0] === '-L' && a[1] === T.TMUX_SOCKET))
  ok('9 list, kill-session and kill-server all target the private socket',
    bad.length === 0, `offenders=${JSON.stringify(bad)}`)
}

// 10. list parsing keeps live panes and DROPS dead ones. Under
// remain-on-exit on, a session whose command has exited still EXISTS until the
// hook kills it; reporting it live would restore that panel non-dormant and
// attach a client to a corpse.
{
  const stdout = [
    'alpha\t0\t111\t/bin/zsh\t/Users/x',
    'beta\t1\t222\t/bin/zsh\t/Users/y',
    'gamma\t0\t333\tclaude\t/Users/z'
  ].join('\n')
  const entries = T.parseListOutput(stdout)
  const ids = entries.map((e) => e.panelId)
  ok('10 a dead pane is not reported as a live session',
    ids.length === 2 && ids.includes('alpha') && ids.includes('gamma') && !ids.includes('beta'),
    JSON.stringify(ids))
}

// 11. Parsed fields land in the right place, and pid is a number rather than a
// string — PtyCreateResult.pid is typed number and the renderer prints it.
{
  const entries = T.parseListOutput('alpha\t0\t4242\tclaude\t/Users/x/proj')
  const e = entries[0]
  ok('11 list fields map to PtyCreateResult shape with a numeric pid',
    e.panelId === 'alpha' && e.pid === 4242 && e.command === 'claude' && e.cwd === '/Users/x/proj',
    JSON.stringify(e))
}

// 12. Empty and ragged output never throws. tmux prints nothing at all when no
// server is running, and that is the NORMAL first-run case, not an error.
{
  let threw = null
  for (const raw of ['', '\n', 'garbage', 'a\tb']) {
    try { T.parseListOutput(raw) } catch (e) { threw = `${raw}: ${e.message}` }
  }
  ok('12 empty or ragged list output yields no sessions and never throws',
    threw === null && T.parseListOutput('').length === 0, threw ?? 'ok')
}

// 13. The exit-file path is derived from the panel id, which ID_PATTERN
// already constrains to [A-Za-z0-9_-]+ — so it can never escape exitDir.
{
  const p = T.exitFilePath('/tmp/exits', 'n5')
  ok('13 the exit file lives under exitDir, named by panel id',
    p === '/tmp/exits/n5.exit', p)
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run verify:tmux
```

Expected: **failure**, because `package.json` has no `verify:tmux` script yet. Add it first (Step 3), re-run, and expect the build to fail with `Could not resolve "../src/main/tmux-args"`. That is the failure you want to see before implementing — the module genuinely does not exist.

- [ ] **Step 3: Add the script**

In `package.json` `scripts`, after `"verify:layout"`:

```json
"verify:tmux": "node scripts/verify-tmux.cjs",
```

And in the `verify` chain, insert it after `verify:layout`:

```json
"verify": "npm run verify:viewport && npm run verify:registry && npm run verify:layout && npm run verify:tmux && npm run verify:pty && npm run verify:pty-manager && npm run verify:window && npm run verify:ipc && npm run build && npm run verify:canvas && npm run verify:xterm && npm run verify:panels"
```

- [ ] **Step 4: Implement `src/main/tmux-args.ts`**

```ts
/**
 * The pure half of the tmux backend: argv, config text, and output parsing.
 *
 * Deliberately free of node-pty, electron, and fs. node-pty is a native module
 * built against Electron's ABI and will not load under plain node, so anything
 * that imports it cannot be verified in the cheap plain-node tier. Keeping
 * these functions here is what lets verify:tmux assert the flags and the config
 * without a tmux server or an Electron runtime. Impure work belongs in
 * session-backend.ts.
 */

/**
 * A socket of our own. The app must never see, list, resize, or kill the
 * user's own tmux sessions — and shutdown() calls kill-server, which would
 * destroy their real work if it ever reached the default socket.
 */
export const TMUX_SOCKET = 'terminal-canvas'

/**
 * set-hook and #{pane_dead_status} both predate 3.0 comfortably; 3.0 is the
 * floor because it is old enough to be everywhere and new enough that we are
 * not guessing about behaviour we never tested.
 */
export const MIN_TMUX_MAJOR = 3

export interface TmuxVersion {
  major: number
  minor: number
  raw: string
}

export interface TmuxListEntry {
  panelId: string
  pid: number
  command: string
  cwd: string
}

/**
 * `tmux -V` prints things like "tmux 3.7c", "tmux 2.9a", and "tmux next-3.4".
 * Returns null rather than a guess when it cannot read the version: an
 * unreadable version must send us to the direct backend, and an optimistic
 * default would instead send us to a tmux we know nothing about.
 */
export function parseTmuxVersion(raw: string): TmuxVersion | null {
  const match = /(\d+)\.(\d+)/.exec(raw)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), raw: raw.trim() }
}

export function isSupportedTmuxVersion(v: TmuxVersion | null): boolean {
  if (!v) return false
  return v.major >= MIN_TMUX_MAJOR
}

/**
 * Safe to build by concatenation: ID_PATTERN in shared/layout-schema.ts
 * restricts a panel id to [A-Za-z0-9_-]+, which is exactly why that pattern
 * was chosen during M4b while it was still free rather than a migration of
 * everyone's saved file.
 */
export function exitFilePath(exitDir: string, panelId: string): string {
  return `${exitDir}/${panelId}.exit`
}

/**
 * The app's own tmux config. Passed with -f so a user's ~/.tmux.conf — custom
 * prefix, status line, plugins, mouse mode — cannot reshape a panel. Same class
 * of decision as shell-env.ts probing the login shell: take the user's
 * environment where it is the point, refuse it where it is not.
 *
 * Every line here fails SILENTLY if dropped. Do not trim this.
 */
export function buildTmuxConf(exitDir: string): string {
  return [
    // The canvas draws its own panel chrome; a tmux status line would eat a
    // row and read as a rendering bug.
    'set -g status off',
    // CRITICAL. Ctrl+B must reach the agent untouched. This is the same split
    // the app already draws twice: Cmd+C is ours and Ctrl+C is the PTY's,
    // Cmd+Z is ours and Ctrl+Z is the PTY's. A tmux prefix would be the first
    // bare control key the app ever stole, and useViewport.ts requires Cmd on
    // every canvas shortcut precisely because agent TUIs claim every bare key.
    'set -g prefix None',
    'set -g escape-time 0',
    // Matches the `name` pty-manager.ts already passes, so TERM is unchanged
    // from the agent's point of view.
    'set -g default-terminal "xterm-256color"',
    // Agent CLIs emit 24-bit colour and tmux downsamples to 256 without this.
    // The panel still WORKS; it just looks subtly wrong, with no error anywhere.
    'set -as terminal-features ",xterm-256color:RGB"',
    // Keeps the pane alive after its command exits so #{pane_dead_status} can
    // still be read. The hook below is what actually ends the session.
    'set -g remain-on-exit on',
    // The exit-code channel. These two commands run sequentially in one shell,
    // so the file is on disk BEFORE the session is killed — and killing the
    // session is what makes the client exit, which fires node-pty's onExit,
    // which is the callback PtyManager already uses to send pty:exit. Main
    // therefore reads the file in a handler it already has: no watcher, no
    // polling, no new IPC. Reversing these two is a race.
    `set-hook -g pane-died 'run-shell "echo #{pane_dead_status} > ${exitDir}/#{session_name}.exit; tmux kill-session -t #{session_name}"'`,
    // NOTE: `mouse` is deliberately absent, i.e. left off. `mouse on` makes
    // TMUX capture mouse reporting instead of passing it to the application,
    // which would silently defeat all of M4a's pointer correction from one
    // process further down. This is the mirror image of the :RGB line above.
    ''
  ].join('\n')
}

/**
 * The spawn argv. `new-session -A` attaches if the session exists and creates
 * it if it does not — which is the entire reload-survival feature, and why
 * pty:create keeps its exact current meaning and session-registry.ts needs no
 * change at all.
 */
export function buildTmuxArgs(o: {
  confPath: string
  panelId: string
  cols: number
  rows: number
  command: string
  args: string[]
}): string[] {
  return [
    '-L', TMUX_SOCKET,
    '-f', o.confPath,
    'new-session',
    '-A',
    '-s', o.panelId,
    // Preserves "fit before spawn": the renderer has already fitted, and
    // spawning at 80x24 then resizing makes agent TUIs draw their frame twice.
    // Only meaningful at creation; on reattach the client negotiates its own.
    '-x', String(o.cols),
    '-y', String(o.rows),
    // Everything after `--` is the command, so a command starting with `-` is
    // run rather than eaten as a tmux flag.
    '--',
    o.command,
    ...o.args
  ]
}

/** Tab-separated so a cwd containing spaces survives the split. */
const LIST_FORMAT =
  '#{session_name}\t#{pane_dead}\t#{pane_pid}\t#{pane_start_command}\t#{pane_current_path}'

export function buildListArgs(): string[] {
  return ['-L', TMUX_SOCKET, 'list-panes', '-a', '-F', LIST_FORMAT]
}

export function buildKillSessionArgs(panelId: string): string[] {
  return ['-L', TMUX_SOCKET, 'kill-session', '-t', panelId]
}

export function buildKillServerArgs(): string[] {
  return ['-L', TMUX_SOCKET, 'kill-server']
}

/**
 * Live sessions only.
 *
 * The #{pane_dead} filter is load-bearing and is the one place the
 * remain-on-exit decision leaks outside the exit path: a session whose command
 * has exited still EXISTS until the hook kills it, so an unfiltered list would
 * report a finished process as live. Boot reconciliation would then restore
 * that panel non-dormant, attach a client to a corpse, and show the user a
 * panel that can never produce another byte.
 *
 * Never throws. tmux prints nothing at all when no server is running, and that
 * is the normal first-run case rather than an error.
 */
export function parseListOutput(stdout: string): TmuxListEntry[] {
  const entries: TmuxListEntry[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const [panelId, dead, pid, command, cwd] = line.split('\t')
    if (!panelId || dead === undefined) continue
    if (dead !== '0') continue
    entries.push({
      panelId,
      pid: Number(pid) || 0,
      command: command || '',
      cwd: cwd || ''
    })
  }
  return entries
}
```

- [ ] **Step 5: Run the suite and watch it pass**

```bash
npm run verify:tmux
```

Expected: `13/13 passed`.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck:node
```

Expected: clean. `tsconfig.node.json` sets `noUnusedLocals`/`noUnusedParameters`.

- [ ] **Step 7: Commit**

```bash
git add src/main/tmux-args.ts scripts/tmux-entry.cjs scripts/verify-tmux.cjs package.json
git commit -m "feat(m4c): the pure tmux core — argv, config, version and list parsing

Kept free of node-pty and electron on purpose. node-pty is built against
Electron's ABI and will not load under plain node, so anything importing
it cannot be verified in the cheap tier — which is the whole reason the
spec asked for pure builders.

The two checks worth keeping: the pane-died hook must write the exit file
before killing the session, and parseListOutput must drop dead panes.
Both are silent when wrong."
```

---

### Task 2: The backend seam and DirectBackend

Extract today's spawn into a backend so the tmux one has somewhere to go. **No behaviour changes in this task** — `verify:pty-manager` and `verify:pty` must pass unchanged, which is the point: it proves the extraction was lossless before anything new is built on it.

**Files:**
- Create: `src/main/session-backend.ts`
- Modify: `src/main/pty-manager.ts`
- Modify: `src/main/index.ts`
- Modify: `scripts/verify-pty-manager.cjs`

**Interfaces:**
- Consumes: `TmuxListEntry` from Task 1 (type only, for the shared shape).
- Produces:

```ts
export interface SessionBackend {
  readonly kind: 'tmux' | 'direct'
  readonly reason: string
  spawn(spec: PanelSpec, command: string, cwd: string, env: Record<string, string>): pty.IPty
  list(): PtyCreateResult[] | null
  exitCodeFor(panelId: PanelId): number | null
  destroy(panelId: PanelId): void
  shutdown(): void
}
export function createDirectBackend(reason: string): SessionBackend
```
And on `PtyManager`: `constructor(getTarget: () => WebContents | null, getBackend: () => SessionBackend)`.

- [ ] **Step 1: Write the failing checks**

In `scripts/verify-pty-manager.cjs`, change the harness to inject a backend and add two checks. Replace `makeHarness` with:

```js
/** Stands in for the real WebContents seam and records what main sent. */
function makeHarness(backend) {
  const events = []
  const manager = new PtyManager(
    () => ({ isDestroyed: () => false, send: (channel, payload) => events.push({ channel, payload }) }),
    () => backend ?? DIRECT
  )
  return { manager, events, exits: () => events.filter((e) => e.channel === 'pty:exit') }
}
```

Add near the top, after the `PtyManager` require:

```js
const { createDirectBackend } = require(OUT_BACKEND)
const DIRECT = createDirectBackend('verify: direct by default')
```

and a second esbuild call beside the existing one:

```js
const OUT_BACKEND = join(__dirname, '..', 'out', 'verify', 'session-backend.cjs')
buildSync({
  entryPoints: [join(__dirname, '..', 'src', 'main', 'session-backend.ts')],
  outfile: OUT_BACKEND,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
```

Then append these checks inside the existing IIFE, before its `finish()`:

```js
  // 9. DirectBackend must report null for both "what do you independently
  // know" questions. Those two nulls are what make it a RESTORATION of
  // pre-M4c behaviour rather than a second implementation of it: PtyManager
  // falls back to its own map and to node-pty's own exit code.
  {
    const b = createDirectBackend('test')
    ok('9 the direct backend knows nothing independently of the manager',
      b.list() === null && b.exitCodeFor('anything') === null && b.kind === 'direct',
      `list=${b.list()} exit=${b.exitCodeFor('anything')} kind=${b.kind}`)
  }

  // 10. With a backend that knows nothing, list() must still return the
  // manager's own live sessions — i.e. exactly what M3 did.
  {
    const h = makeHarness(DIRECT)
    await h.manager.create(spec('d1'))
    const listed = h.manager.list().map((r) => r.panelId)
    ok('10 list falls back to the manager map when the backend has no view',
      listed.length === 1 && listed[0] === 'd1', JSON.stringify(listed))
    h.manager.kill('d1')
  }
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run verify:pty-manager
```

Expected: the esbuild step fails with `Could not resolve ".../src/main/session-backend.ts"`. That is the failure you want.

- [ ] **Step 3: Implement `src/main/session-backend.ts`**

```ts
import * as pty from 'node-pty'
import type { PanelId, PanelSpec, PtyCreateResult } from '../shared/types'

/**
 * How a panel's process comes into existence, and who can answer questions
 * about it afterwards.
 *
 * Injected into PtyManager the same way session-registry.ts injects its bridge
 * and terminal factory, and for the same reason: the decision becomes
 * assertable without a real runtime. PtyManager keeps everything it already
 * owns — the session map, the 16ms batcher, the resize economy, the
 * exit-eviction guard — and none of it knows which backend produced the handle.
 */
export interface SessionBackend {
  readonly kind: 'tmux' | 'direct'
  /** Why we are on this backend. Surfaced to the user when kind is 'direct'. */
  readonly reason: string

  spawn(
    spec: PanelSpec,
    command: string,
    cwd: string,
    env: Record<string, string>
  ): pty.IPty

  /**
   * Live sessions from the backend's OWN view of the world, or null when it has
   * none independent of PtyManager's map.
   *
   * Only the tmux backend can know about sessions the map has forgotten — that
   * is the entire point of it. DirectBackend returns null and PtyManager falls
   * back to listing its map, which is exactly pre-M4c behaviour.
   */
  list(): PtyCreateResult[] | null

  /**
   * The command's real exit code, or null when the backend cannot know it.
   *
   * Both nulls in this interface mean the same thing and are worth reading
   * together: THIS BACKEND CANNOT KNOW, so fall back to what the app did before
   * M4c. That is what makes DirectBackend a restoration rather than a rewrite.
   */
  exitCodeFor(panelId: PanelId): number | null

  /** Destroy one session for good. Called when the user closes a panel. */
  destroy(panelId: PanelId): void

  /** Tear down everything this backend owns. Called on before-quit. */
  shutdown(): void
}

/**
 * Pre-M4c behaviour, moved rather than rewritten. A missing tmux must degrade
 * one feature, not the app, and the surest way to guarantee that is for the
 * fallback path to BE the code that was already proven.
 */
export function createDirectBackend(reason: string): SessionBackend {
  return {
    kind: 'direct',
    reason,
    spawn(spec, command, cwd, env) {
      return pty.spawn(command, spec.args, {
        name: 'xterm-256color',
        // Spawn at the size the renderer already fitted to. Spawning at the
        // 80x24 default and resizing afterwards makes agent TUIs draw their
        // frame twice and sometimes leave artifacts.
        cols: spec.cols,
        rows: spec.rows,
        cwd,
        env
      })
    },
    // See the interface: null means "ask the manager", not "nothing is running".
    list: () => null,
    exitCodeFor: () => null,
    // The process IS the session here, so PtyManager's own kill is the whole
    // story and there is nothing extra to destroy or shut down.
    destroy: () => {},
    shutdown: () => {}
  }
}
```

- [ ] **Step 4: Rewire `src/main/pty-manager.ts`**

Change the import block — drop the now-unused direct `pty.spawn` usage but keep the type import:

```ts
import type * as pty from 'node-pty'
import type { SessionBackend } from './session-backend'
```

Change the constructor:

```ts
  constructor(
    private readonly getTarget: () => WebContents | null,
    /**
     * A getter, not a captured reference, for the same reason getTarget is one:
     * the backend is chosen by an async startup probe that has not finished
     * when this manager is constructed at module scope.
     */
    private readonly getBackend: () => SessionBackend
  ) {}
```

In `create()`, replace the `pty.spawn(...)` call with:

```ts
    const proc = this.getBackend().spawn(spec, command, cwd, env)
```

In the `onExit` handler, replace the send with:

```ts
      // An exit we asked for is not news the panel needs to paint.
      if (session.killed) return
      // The tmux CLIENT's exit code carries no information — an inner command
      // exiting 0 and one exiting 42 both produce client exit 1 — so a naive
      // port would make this message present, plausible and wrong. The tmux
      // backend recovers the real code from the pane-died hook's file; the
      // direct backend returns null and node-pty's own code stands.
      const real = this.getBackend().exitCodeFor(spec.panelId)
      this.send(IPC_EVENTS.PTY_EXIT, { panelId: spec.panelId, exitCode: real ?? exitCode, signal })
```

Replace `list()`:

```ts
  /**
   * Every live session. The renderer uses this to reconcile after a reload
   * rather than blindly creating a panel that may already exist.
   *
   * The backend answers first: after a reload this map is EMPTY (navigation
   * killed the clients) while the tmux sessions live on, so the map alone
   * would report nothing and every panel would restore dormant. A backend with
   * no independent view returns null and the map is the answer, as before.
   */
  list(): PtyCreateResult[] {
    const fromBackend = this.getBackend().list()
    if (fromBackend) return fromBackend
    return [...this.sessions.values()].map((s) => ({
      panelId: s.panelId,
      pid: s.proc.pid,
      command: s.command,
      cwd: s.cwd
    }))
  }
```

In `kill()`, after the existing `session.proc.kill()` try/catch and before `this.sessions.delete(panelId)`:

```ts
    // Closing a panel must end the SESSION, not merely detach a client.
    // Without this the tmux session survives with no panel able to reach it.
    this.getBackend().destroy(panelId)
```

- [ ] **Step 5: Update `src/main/index.ts` to supply a backend**

Replace the `ptyManager` construction block:

```ts
/**
 * Which backend spawns panels. Reassigned once by the startup probe; a
 * DirectBackend is the value until then, so a pty:create that somehow arrives
 * before the probe finishes still works rather than throwing.
 */
let backend: SessionBackend = createDirectBackend('startup: tmux not probed yet')

// The manager needs a way to reach the live renderer; a getter rather than a
// captured reference keeps it correct across window reloads. The backend is a
// getter for the same reason — the probe that chooses it is async and has not
// run when this module is evaluated.
const ptyManager = new PtyManager(
  () => mainWindow?.webContents ?? null,
  () => backend
)
```

Add the import:

```ts
import { createDirectBackend, type SessionBackend } from './session-backend'
```

- [ ] **Step 6: Run the suites and watch them pass**

```bash
npm run verify:pty-manager && npm run verify:pty && npm run typecheck:node
```

Expected: `verify:pty-manager` now reports **10/10 passed** (8 existing plus the 2 new). `verify:pty` unchanged. Typecheck clean.

If any pre-existing check regressed, the extraction was not lossless — fix it rather than adjusting the check.

- [ ] **Step 7: Commit**

```bash
git add src/main/session-backend.ts src/main/pty-manager.ts src/main/index.ts scripts/verify-pty-manager.cjs
git commit -m "feat(m4c): a SessionBackend seam, with today's spawn as DirectBackend

No behaviour change on purpose. The existing pty-manager checks passing
untouched is what proves the extraction was lossless before anything new
is built on it.

Both nulls in the interface mean one thing: this backend cannot know, so
fall back to what the app did before M4c. That is what makes the fallback
path a restoration rather than a second implementation."
```

---

### Task 3: TmuxBackend

**Files:**
- Modify: `src/main/session-backend.ts`
- Modify: `scripts/verify-pty-manager.cjs`

**Interfaces:**
- Consumes: everything from Task 1; `SessionBackend` from Task 2.
- Produces:

```ts
export function createTmuxBackend(o: {
  tmuxPath: string
  exitDir: string
  confPath: string
  reason: string
}): SessionBackend
```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-pty-manager.cjs` inside the IIFE, before `finish()`. Add at the top of the file alongside the other requires:

```js
const { createTmuxBackend } = require(OUT_BACKEND)
const { execFileSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')

/** Absolute path or null. A GUI app has a bare PATH, so never rely on the name. */
function findTmux() {
  for (const p of ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux']) {
    if (existsSync(p)) return p
  }
  return null
}
```

Then the checks:

```js
  // 11-15 need a real tmux. Skipping is reported, never silent: a suite that
  // quietly covers nothing is worse than one that says it covered nothing.
  const TMUX = findTmux()
  if (!TMUX) {
    ok('11-15 tmux backend (SKIPPED — no tmux binary found)', true, 'install tmux to cover these')
  } else {
    const dir = mkdtempSync(join(tmpdir(), 'tc-verify-'))
    const exitDir = join(dir, 'exits')
    require('node:fs').mkdirSync(exitDir, { recursive: true })
    const confPath = join(dir, 'tmux.conf')
    const T = require(OUT_TMUX_ARGS)
    writeFileSync(confPath, T.buildTmuxConf(exitDir))
    const tmuxBackend = createTmuxBackend({ tmuxPath: TMUX, exitDir, confPath, reason: 'verify' })
    const tmuxCli = (args) => {
      try { return execFileSync(TMUX, args, { encoding: 'utf8' }) } catch { return '' }
    }

    // h1 is deliberately hoisted out of check 11's block: check 12 must detach
    // THE MANAGER THAT OWNS THE SESSION. Calling detachAll() on a freshly made
    // harness would walk an empty map, do nothing, and pass for the wrong
    // reason — the session would survive because nothing ever touched it.
    let h1 = null

    // 11. A session created through the backend is visible to tmux itself on
    // OUR socket — and therefore invisible on the user's default socket.
    {
      h1 = makeHarness(tmuxBackend)
      await h1.manager.create(spec('t1'))
      await sleep(700)
      const listed = tmuxCli(['-L', T.TMUX_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('11 a panel becomes a tmux session on the private socket',
        listed.includes('t1'), JSON.stringify(listed.trim()))
    }

    // 12. THE MILESTONE. Detach the client the way a renderer teardown does;
    // the session must survive, and a fresh create with the same panelId must
    // reattach rather than start a second process. Comparing the PID is what
    // separates "reattached" from "silently respawned" — a check that only
    // asserted the panel works again would pass for both.
    {
      const before = tmuxCli(['-L', T.TMUX_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const beforePid = (/t1 (\d+)/.exec(before) ?? [])[1]
      h1.manager.detachAll()
      await sleep(500)
      const survived = tmuxCli(['-L', T.TMUX_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      await h2.manager.create(spec('t1'))
      await sleep(700)
      const after = tmuxCli(['-L', T.TMUX_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const afterPid = (/t1 (\d+)/.exec(after) ?? [])[1]
      ok('12 detaching leaves the session alive and create reattaches to the SAME process',
        survived.includes('t1') && beforePid && beforePid === afterPid,
        `pid ${beforePid} -> ${afterPid}`)
    }

    // 13. list() reports sessions the manager's own map has never heard of.
    // This is what makes boot reconciliation possible after a reload.
    {
      const fresh = makeHarness(tmuxBackend)
      const listed = fresh.manager.list().map((r) => r.panelId)
      ok('13 a manager with an empty map still sees the live tmux session',
        listed.includes('t1'), JSON.stringify(listed))
    }

    // 14. EXIT FIDELITY. The tmux client's own exit code is always 1, so a
    // naive port would report every exit as code 1. The pane-died hook's file
    // is what carries the truth.
    {
      const h = makeHarness(tmuxBackend)
      await h.manager.create(spec('t2', '/bin/sh', ['-c', 'exit 7']))
      await sleep(1500)
      const exits = h.exits()
      const code = exits.length ? exits[exits.length - 1].payload.exitCode : null
      ok('14 a command exiting 7 is reported as 7, not the client\'s 1',
        code === 7, `reported=${code} events=${exits.length}`)
    }

    // 15. destroy() ends the session, and shutdown() takes the server with it.
    {
      const h = makeHarness(tmuxBackend)
      await h.manager.create(spec('t3'))
      await sleep(700)
      h.manager.kill('t3')
      await sleep(500)
      const afterKill = tmuxCli(['-L', T.TMUX_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      tmuxBackend.shutdown()
      await sleep(500)
      const afterShutdown = tmuxCli(['-L', T.TMUX_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('15 closing a panel ends its session and shutdown ends the server',
        !afterKill.includes('t3') && afterShutdown.trim() === '',
        `afterKill=${JSON.stringify(afterKill.trim())} afterShutdown=${JSON.stringify(afterShutdown.trim())}`)
    }
  }
```

Add the third esbuild target near the others:

```js
const OUT_TMUX_ARGS = join(__dirname, '..', 'out', 'verify', 'tmux-args.cjs')
buildSync({
  entryPoints: [join(__dirname, '..', 'src', 'main', 'tmux-args.ts')],
  outfile: OUT_TMUX_ARGS,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
```

Note check 12 calls `manager.detachAll()`, which does not exist yet — that is deliberate. It is implemented in Task 5, so **check 12 is expected to fail until Task 5 lands.** If you are executing tasks strictly in order, add `detachAll` as the two-line method in Task 3 Step 3 below and let Task 5 do the wiring.

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run verify:pty-manager
```

Expected: `createTmuxBackend is not a function`.

- [ ] **Step 3: Implement `createTmuxBackend`**

Append to `src/main/session-backend.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, unlinkSync } from 'node:fs'
import {
  buildKillServerArgs,
  buildKillSessionArgs,
  buildListArgs,
  buildTmuxArgs,
  exitFilePath,
  parseListOutput
} from './tmux-args'

/**
 * Sessions that outlive the renderer.
 *
 * The whole feature is one flag: `new-session -A` attaches if the session
 * exists and creates it if it does not, so create and reattach are the same
 * call. pty:create keeps its exact meaning and session-registry.ts never
 * learns reattachment exists.
 */
export function createTmuxBackend(o: {
  tmuxPath: string
  exitDir: string
  confPath: string
  reason: string
}): SessionBackend {
  /**
   * Every tmux invocation that is NOT the panel's own client. Failure is
   * routine rather than exceptional — `list-panes` with no server running exits
   * non-zero, and that is the normal first-run state — so this returns '' and
   * lets the caller decide, instead of throwing into a quit handler.
   */
  const cli = (args: string[]): string => {
    try {
      return execFileSync(o.tmuxPath, args, { encoding: 'utf8', timeout: 5000 })
    } catch {
      return ''
    }
  }

  return {
    kind: 'tmux',
    reason: o.reason,

    spawn(spec, command, cwd, env) {
      // node-pty still owns the transport; what it spawns is a tmux CLIENT
      // rather than the command itself. That is what preserves the entire
      // existing data path — raw bytes, the 16ms batcher, resize, pointer
      // correction — unchanged from M3.
      return pty.spawn(
        o.tmuxPath,
        buildTmuxArgs({
          confPath: o.confPath,
          panelId: spec.panelId,
          cols: spec.cols,
          rows: spec.rows,
          command,
          args: spec.args
        }),
        {
          name: 'xterm-256color',
          cols: spec.cols,
          rows: spec.rows,
          cwd,
          env
        }
      )
    },

    list(): PtyCreateResult[] {
      // parseListOutput drops dead panes. See its comment: under
      // remain-on-exit on, a finished session still exists until the hook
      // kills it, and reporting it live would attach a client to a corpse.
      return parseListOutput(cli(buildListArgs())).map((e) => ({
        panelId: e.panelId,
        pid: e.pid,
        command: e.command,
        cwd: e.cwd
      }))
    },

    exitCodeFor(panelId: PanelId): number | null {
      // Written by the pane-died hook BEFORE it killed the session, so by the
      // time node-pty's onExit brought us here the file is already on disk.
      const path = exitFilePath(o.exitDir, panelId)
      try {
        const code = Number(readFileSync(path, 'utf8').trim())
        unlinkSync(path)
        return Number.isInteger(code) ? code : null
      } catch {
        // Missing or unreadable: fall back to the client's code via `?? `.
        // A wrong-but-present number beats a crash in an exit handler.
        return null
      }
    },

    destroy(panelId: PanelId): void {
      cli(buildKillSessionArgs(panelId))
    },

    shutdown(): void {
      cli(buildKillServerArgs())
      // Per-run directory; nothing in it outlives the app.
      try {
        rmSync(o.exitDir, { recursive: true, force: true })
      } catch {
        /* a leftover temp dir is not worth failing a quit over */
      }
    }
  }
}
```

Also add the two-line `detachAll` to `src/main/pty-manager.ts` now, so check 12 can run (Task 5 rewires its caller):

```ts
  /**
   * The renderer is gone but its processes must not be. Kills the local handle
   * — which, on the tmux backend, is a CLIENT — and forgets the session
   * WITHOUT calling backend.destroy(). That omission is the entire milestone:
   * kill() ends the session, detachAll() lets it keep running.
   */
  detachAll(): void {
    for (const session of [...this.sessions.values()]) {
      session.killed = true
      if (session.flushTimer) clearTimeout(session.flushTimer)
      try {
        session.proc.kill()
      } catch (error) {
        console.warn(`[pty] detach failed for ${session.panelId}`, error)
      }
      this.sessions.delete(session.panelId)
    }
  }
```

- [ ] **Step 4: Run and watch it pass**

```bash
npm run verify:pty-manager && npm run typecheck:node
```

Expected: `15/15 passed` (or 11/11 with the skip line, on a machine without tmux).

- [ ] **Step 5: Confirm the user's own tmux was untouched**

```bash
tmux ls
```

Expected: exactly what it said before you started — the suite's `kill-server` must never have reached the default socket.

- [ ] **Step 6: Commit**

```bash
git add src/main/session-backend.ts src/main/pty-manager.ts scripts/verify-pty-manager.cjs
git commit -m "feat(m4c): TmuxBackend — sessions that outlive their client

node-pty still owns the transport; what it spawns is a tmux client rather
than the command. That is what keeps the whole M3 data path — raw bytes,
the 16ms batcher, resize, pointer correction — unchanged.

Check 14 is the one to keep honest: the tmux client always exits 1, so
without the pane-died hook's file every exit would report code 1."
```

---

### Task 4: The startup probe and backend selection

**Files:**
- Create: `src/main/tmux-probe.ts`
- Modify: `src/main/index.ts`
- Modify: `scripts/tmux-entry.cjs`, `scripts/verify-tmux.cjs`

**Interfaces:**
- Consumes: `parseTmuxVersion`, `isSupportedTmuxVersion` (Task 1); `createDirectBackend`, `createTmuxBackend` (Tasks 2–3); `whichFromEnv` from `src/main/shell-env.ts`.
- Produces:

```ts
export interface BackendChoice {
  kind: 'tmux' | 'direct'
  reason: string
  tmuxPath: string | null
}
export function chooseBackend(i: { tmuxPath: string | null; versionOutput: string | null }): BackendChoice
export async function probeTmux(env: Record<string, string>, userDataDir: string): Promise<SessionBackend>
```

- [ ] **Step 1: Write the failing checks**

Add to `scripts/tmux-entry.cjs`:

```js
module.exports = {
  ...require('../src/main/tmux-args'),
  ...require('../src/main/tmux-probe')
}
```

Add to `scripts/verify-tmux.cjs`, before the summary block:

```js
// 14. No tmux on the resolved PATH -> direct, with a reason that names the
// cause. The reason string is shown to the user, so "unknown" is a bug.
{
  const c = T.chooseBackend({ tmuxPath: null, versionOutput: null })
  ok('14 a missing tmux chooses the direct backend and says why',
    c.kind === 'direct' && /not found/i.test(c.reason), JSON.stringify(c))
}

// 15. Too old -> direct. 2.9 is below the floor even though it is a real,
// working tmux, because we never tested the hook behaviour there.
{
  const c = T.chooseBackend({ tmuxPath: '/usr/bin/tmux', versionOutput: 'tmux 2.9a' })
  ok('15 a tmux below 3.0 chooses the direct backend and names the version',
    c.kind === 'direct' && c.reason.includes('2.9'), JSON.stringify(c))
}

// 16. A version we cannot read is treated as unusable, NOT as good enough.
{
  const c = T.chooseBackend({ tmuxPath: '/usr/bin/tmux', versionOutput: 'weird output' })
  ok('16 an unreadable version falls back rather than guessing',
    c.kind === 'direct', JSON.stringify(c))
}

// 17. A supported tmux is chosen, and the ABSOLUTE path is carried forward.
// A GUI app launched by launchd has a bare PATH; spawning "tmux" by name would
// fail exactly the way `claude` does, which is the defect shell-env.ts exists
// for.
{
  const c = T.chooseBackend({ tmuxPath: '/opt/homebrew/bin/tmux', versionOutput: 'tmux 3.7c' })
  ok('17 a supported tmux is chosen by absolute path',
    c.kind === 'tmux' && c.tmuxPath === '/opt/homebrew/bin/tmux', JSON.stringify(c))
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run verify:tmux
```

Expected: `Could not resolve "../src/main/tmux-probe"`.

- [ ] **Step 3: Implement `src/main/tmux-probe.ts`**

```ts
import { execFile } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createDirectBackend, createTmuxBackend, type SessionBackend } from './session-backend'
import { whichFromEnv } from './shell-env'
import { buildTmuxConf, isSupportedTmuxVersion, parseTmuxVersion } from './tmux-args'

/**
 * Which backend, and why. The `reason` is user-facing when kind is 'direct' —
 * the HUD shows it — so it must name the actual cause rather than say
 * "unavailable".
 */
export interface BackendChoice {
  kind: 'tmux' | 'direct'
  reason: string
  tmuxPath: string | null
}

/**
 * Pure, so verify:tmux can cover every branch without a tmux on the machine.
 *
 * Everything unusable degrades to 'direct' rather than throwing: a missing
 * optional dependency must cost one feature, not the app. The one rule is that
 * uncertainty degrades — an unreadable version is treated as unusable, never as
 * good enough, because the alternative is running against a tmux whose hook
 * behaviour we have never tested and discovering it through a hung panel.
 */
export function chooseBackend(i: {
  tmuxPath: string | null
  versionOutput: string | null
}): BackendChoice {
  if (!i.tmuxPath) {
    return {
      kind: 'direct',
      reason: 'tmux not found on the login shell PATH',
      tmuxPath: null
    }
  }
  const version = parseTmuxVersion(i.versionOutput ?? '')
  if (!version) {
    return {
      kind: 'direct',
      reason: `tmux at ${i.tmuxPath} did not report a readable version`,
      tmuxPath: null
    }
  }
  if (!isSupportedTmuxVersion(version)) {
    return {
      kind: 'direct',
      reason: `tmux ${version.major}.${version.minor} is older than the required 3.0`,
      tmuxPath: null
    }
  }
  return { kind: 'tmux', reason: `tmux ${version.raw}`, tmuxPath: i.tmuxPath }
}

function tmuxVersionOutput(tmuxPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(tmuxPath, ['-V'], { timeout: 5000 }, (error, stdout) => {
      resolve(error && !stdout ? null : stdout)
    })
  })
}

/**
 * Run once at startup, next to resolveShellEnv() and for the same reason: the
 * answer cannot change during a run, and every panel needs it.
 *
 * Uses whichFromEnv against the LOGIN env, not process.env. A macOS GUI app is
 * launched by launchd with a bare PATH, so /opt/homebrew/bin/tmux is not on it
 * — the identical defect that makes `claude` "command not found" inside the
 * app. Resolving by absolute path here is what stops M4c inheriting it.
 */
export async function probeTmux(
  env: Record<string, string>,
  userDataDir: string
): Promise<SessionBackend> {
  const found = whichFromEnv('tmux', env)
  const versionOutput = found ? await tmuxVersionOutput(found) : null
  const choice = chooseBackend({ tmuxPath: found, versionOutput })

  if (choice.kind === 'direct' || !choice.tmuxPath) {
    // Loud on purpose, in the same voice shell-env.ts uses for its own
    // fallback. A silent degradation here means the user learns their agent
    // did not survive the reload by losing work.
    console.warn(
      `[tmux] ${choice.reason}. Panels will spawn directly, and their processes ` +
        `will NOT survive a reload (Cmd+R / Cmd+W). Install tmux 3.0+ to enable ` +
        `session persistence.`
    )
    return createDirectBackend(choice.reason)
  }

  // Per-run directory: the hook writes exit codes here and nothing in it
  // outlives the app. Cleared on the way in as well as on shutdown, so a hard
  // crash cannot leave a stale code to be read as a fresh one.
  const exitDir = join(userDataDir, 'tmux-exits')
  rmSync(exitDir, { recursive: true, force: true })
  mkdirSync(exitDir, { recursive: true })

  // Generated rather than shipped: the pane-died hook embeds exitDir, which is
  // unknowable until app.getPath('userData') can be called.
  const confPath = join(userDataDir, 'tmux.conf')
  writeFileSync(confPath, buildTmuxConf(exitDir))

  console.log(`[tmux] ${choice.reason} at ${choice.tmuxPath}; sessions will survive a reload`)
  return createTmuxBackend({
    tmuxPath: choice.tmuxPath,
    exitDir,
    confPath,
    reason: choice.reason
  })
}
```

- [ ] **Step 4: Wire it into `src/main/index.ts`**

Add the import:

```ts
import { probeTmux } from './tmux-probe'
```

In `app.whenReady().then(async () => {` — after the `resolveShellEnv()` block and its `[startup]` logging, before `layoutStore.load()`:

```ts
  // After the env probe, because tmux must be resolved from the LOGIN PATH:
  // launchd gives a GUI app a bare PATH and /opt/homebrew/bin is not on it.
  backend = await probeTmux(env, app.getPath('userData'))
```

Replace the `before-quit` handler:

```ts
app.on('before-quit', () => {
  // Flush BEFORE tearing anything down. killAll can take time and this must
  // not be racing a process teardown; the store already holds the newest
  // snapshot, so this is a synchronous write with nothing to wait for.
  layoutStore.flushSync()
  ptyManager.killAll()
  // Quit is the one teardown where sessions are NOT meant to survive. M4c's
  // scope is reload survival: agents never outlive the app, so there is no
  // process left burning tokens behind a closed window.
  try {
    backend.shutdown()
  } catch (error) {
    // Never throw here. An exception in before-quit can wedge the quit before
    // the window is allowed to close — the same rule layoutStore.flushSync
    // follows.
    console.warn('[tmux] shutdown failed', error)
  }
})
```

- [ ] **Step 5: Run and watch it pass**

```bash
npm run verify:tmux && npm run typecheck:node
```

Expected: `17/17 passed`, typecheck clean.

- [ ] **Step 6: Confirm the real app picks tmux up**

```bash
npm run dev
```

Expected in the console: `[tmux] tmux 3.7c at /opt/homebrew/bin/tmux; sessions will survive a reload`. Quit the app, then:

```bash
tmux -L terminal-canvas ls
```

Expected: `no server running on ...` — `shutdown()` did its job.

- [ ] **Step 7: Commit**

```bash
git add src/main/tmux-probe.ts src/main/index.ts scripts/tmux-entry.cjs scripts/verify-tmux.cjs
git commit -m "feat(m4c): probe tmux at startup and choose a backend

Resolved with whichFromEnv against the LOGIN env, not process.env. A GUI
app launched by launchd has a bare PATH, so /opt/homebrew/bin/tmux is not
on it — the identical defect that makes claude 'command not found' inside
the app, and one M4c would otherwise have inherited.

Uncertainty degrades: an unreadable version goes to the direct backend
rather than being treated as good enough."
```

---

### Task 5: One operation becomes three

The teardown split. `window-lifecycle.ts` and the quit handler currently call the *same function*; separating them is the milestone.

**Files:**
- Modify: `src/main/window-lifecycle.ts`
- Modify: `src/main/index.ts`
- Modify: `scripts/verify-window-lifecycle.cjs`

**Interfaces:**
- Consumes: `PtyManager.detachAll()` (added in Task 3).
- Produces: `attachPtyLifecycle(win, onRendererGone)` — signature unchanged; only the meaning of the callback the caller passes changes.

- [ ] **Step 1: Write the failing check**

`verify:window` currently proves teardown *reaches* the PTY layer. Add a fourth check proving what it reaches now *preserves* the session. Append inside the `whenReady` block before `finish()`:

```js
  // 4. THE MILESTONE, at the wiring level. A renderer teardown must reach a
  // handler that DETACHES rather than one that kills. This suite cannot see
  // tmux, so it asserts the contract that makes tmux survival possible: the
  // callback main installs is detachAll, and detachAll never destroys a
  // backend session. A regression to killAll would keep checks 1-3 green while
  // silently restoring the M3 behaviour M4c exists to remove.
  {
    const calls = []
    const win = new BrowserWindow({ show: false })
    // Mirrors exactly what src/main/index.ts installs.
    attachPtyLifecycle(win, () => calls.push('detach'))
    await win.loadFile(PAGE).catch(() => {})
    calls.length = 0
    win.webContents.reload()
    await sleep(1200)
    ok('4 renderer teardown calls the detach path, never the kill path',
      calls.length > 0 && calls.every((c) => c === 'detach'),
      JSON.stringify(calls))
    win.destroy()
  }
```

- [ ] **Step 2: Run it and watch it pass trivially, then make it meaningful**

```bash
npm run verify:window
```

Expected: `4/4 passed` — but check 4 as written only proves the harness. The *meaningful* assertion is the source change below; make it and confirm by grep that `index.ts` no longer passes `killAll` to `attachPtyLifecycle`.

- [ ] **Step 3: Rewrite `src/main/window-lifecycle.ts`'s comment and intent**

Replace the module docstring:

```ts
/**
 * Ties a window's PTY CLIENTS to the lifetime of the renderer that asked for
 * them — and, since M4c, only the clients.
 *
 * The renderer kills its own PTY on React cleanup, but two everyday paths never
 * run that cleanup: Cmd+R (the View menu ships `reload`) and Cmd+W. Both
 * destroy the page without unmounting, so no `pty:kill` is sent.
 *
 * Before M4c the fix was to kill the process outright, and a reload gave you a
 * fresh shell. Now the callback DETACHES instead: the local handle dies, the
 * tmux session behind it keeps running, and the next page's `pty:create` hits
 * `new-session -A` and lands back in the same process.
 *
 * The stale-session problem this file was written for is unchanged and still
 * handled — main's session map is emptied, so the next `pty:create` finds no
 * conflict and never throws "already has a live PTY".
 */
```

- [ ] **Step 4: Change the caller in `src/main/index.ts`**

```ts
  // Cmd+R and Cmd+W destroy the renderer without running React cleanup, so no
  // pty:kill is ever sent. detachAll — not killAll — frees the local handles
  // and empties the session map while leaving the tmux sessions running, so
  // the next page reattaches instead of getting a fresh shell. On the direct
  // backend there is no session behind the handle and this is exactly the old
  // behaviour.
  attachPtyLifecycle(mainWindow, () => ptyManager.detachAll())
```

- [ ] **Step 5: Verify the split is real**

```bash
grep -n "killAll\|detachAll" src/main/index.ts src/main/pty-manager.ts
```

Expected: `detachAll` in `attachPtyLifecycle`'s callback and defined in `pty-manager.ts`; `killAll` only in the `before-quit` handler and defined in `pty-manager.ts`. If `killAll` still appears in the `attachPtyLifecycle` line, the milestone is not implemented.

- [ ] **Step 6: Run the suites**

```bash
npm run verify:window && npm run verify:pty-manager && npm run typecheck:node
```

Expected: `4/4` and `15/15`. Check 12 in `verify:pty-manager` (detach-then-reattach) is now exercising the real wiring.

- [ ] **Step 7: Commit**

```bash
git add src/main/window-lifecycle.ts src/main/index.ts scripts/verify-window-lifecycle.cjs
git commit -m "feat(m4c): split teardown into detach, destroy and shutdown

window-lifecycle.ts and the quit handler called the same function because
under node-pty those paths genuinely meant the same thing. Under tmux they
do not, and separating the callers IS the milestone.

The file's own comment described this in the future tense; it now
describes what it does."
```

---

### Task 6: The `session:backend` channel and the HUD indicator

**Files:**
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/canvas/CanvasHud.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Produces:

```ts
// shared/ipc-contract.ts
IPC.SESSION_BACKEND = 'session:backend'
export interface SessionBackendInfo { kind: 'tmux' | 'direct'; reason: string }
// on CanvasBridge:
session: { info(): Promise<SessionBackendInfo> }
// CanvasHudProps gains:
backend: SessionBackendInfo | null
```

- [ ] **Step 1: Add the channel to the contract**

In `src/shared/ipc-contract.ts`, inside `IPC`:

```ts
  /**
   * Which backend spawns panels, and why. The renderer shows this only when it
   * is 'direct', so the user is never told their sessions are durable when
   * they are not.
   */
  SESSION_BACKEND: 'session:backend'
```

Add the type near the other shared shapes:

```ts
export interface SessionBackendInfo {
  kind: 'tmux' | 'direct'
  /** Human-readable cause, shown in the HUD when kind is 'direct'. */
  reason: string
}
```

And on `CanvasBridge`:

```ts
  session: {
    info(): Promise<SessionBackendInfo>
  }
```

- [ ] **Step 2: Run verify:ipc and watch it fail**

```bash
npm run build && npm run verify:ipc
```

Expected: FAIL — `session:backend` has no main-process handler. `verify:ipc` walks `IPC` and asserts every channel is handled, so declaring the channel first is what makes the check fail before the handler exists.

- [ ] **Step 3: Handle it in main**

`src/main/ipc.ts` — change the signature and add the handler:

```ts
export function registerIpcHandlers(
  ptyManager: PtyManager,
  layoutStore: LayoutStore,
  getBackendInfo: () => SessionBackendInfo
): void {
```

```ts
  ipcMain.handle(IPC.SESSION_BACKEND, () => getBackendInfo())
```

with the import:

```ts
import type { SessionBackendInfo } from '../shared/ipc-contract'
```

In `src/main/index.ts`:

```ts
  registerIpcHandlers(ptyManager, layoutStore, () => ({
    kind: backend.kind,
    reason: backend.reason
  }))
```

- [ ] **Step 4: Expose it in the preload**

`src/preload/index.ts`, on the `bridge` object:

```ts
  session: {
    info: () => ipcRenderer.invoke(IPC.SESSION_BACKEND)
  },
```

- [ ] **Step 5: Show it in the HUD**

`src/renderer/canvas/CanvasHud.tsx`:

```tsx
import type { JSX } from 'react'
import type { SessionBackendInfo } from '@shared/ipc-contract'
import type { Point, Viewport } from './viewport'

export interface CanvasHudProps {
  viewport: Viewport
  cursor: Point
  selectedId: string | null
  /** null until the one-shot probe answers. */
  backend: SessionBackendInfo | null
}

/**
 * Zoom, world-space cursor position, current selection, and — only when it is
 * bad news — which backend is spawning panels.
 *
 * This is a STATUS, not a toggle, which is why it lives here rather than in a
 * settings surface: ideas-backlog item 11's "anything a user can toggle goes
 * in one organised settings surface" rule does not claim it. It renders
 * nothing at all on the tmux path, so the common case costs a null check.
 */
export function CanvasHud({ viewport, cursor, selectedId, backend }: CanvasHudProps): JSX.Element {
  return (
    <div className="canvas-hud">
      <span>{Math.round(viewport.scale * 100)}%</span>
      <span>
        {Math.round(cursor.x)}, {Math.round(cursor.y)}
      </span>
      <span>{selectedId ?? '—'}</span>
      {backend?.kind === 'direct' && (
        <span className="canvas-hud__warn" title={backend.reason}>
          no tmux — sessions end on reload
        </span>
      )}
    </div>
  )
}
```

In `src/renderer/canvas/Canvas.tsx`, add state and a one-shot effect near the other top-level state, then pass it down:

```tsx
  // One shot: the backend cannot change during a run, so this is not a
  // subscription. A failure leaves it null and the HUD simply says nothing,
  // which is the correct silent case — we only ever speak up for bad news.
  const [backendInfo, setBackendInfo] = useState<SessionBackendInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.canvas.session
      .info()
      .then((info) => {
        if (!cancelled) setBackendInfo(info)
      })
      .catch((error: unknown) => {
        console.warn('[backend] could not read the session backend', error)
      })
    return () => {
      cancelled = true
    }
  }, [])
```

and at the `CanvasHud` call site add `backend={backendInfo}`.

Add the import:

```tsx
import type { SessionBackendInfo } from '@shared/ipc-contract'
```

- [ ] **Step 6: Style it**

Append to `src/renderer/styles.css`:

```css
/* Only ever rendered when tmux is unavailable, so it is allowed to be loud —
   the alternative is a user who believes their sessions are durable. */
.canvas-hud__warn {
  color: #f0b429;
}
```

- [ ] **Step 7: Run the suites**

```bash
npm run typecheck && npm run build && npm run verify:ipc && npm run verify:canvas
```

Expected: `verify:ipc` 1/1 passing again with the new channel covered; `verify:canvas` 6/6 unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/shared/ipc-contract.ts src/main/ipc.ts src/main/index.ts src/preload/index.ts src/renderer/canvas/CanvasHud.tsx src/renderer/canvas/Canvas.tsx src/renderer/styles.css
git commit -m "feat(m4c): session:backend, so a missing tmux is visible

Declared on the contract first, which is what made verify:ipc fail before
the handler existed. The HUD speaks only for bad news: on the tmux path it
renders nothing at all."
```

---

### Task 7: Boot reconciliation

**Files:**
- Modify: `src/renderer/main.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `PtyManager.list()` (Task 2), `registry.ensure(id, spec, { dormant })` (existing).
- Produces: `App` and `Canvas` gain a `liveSessionIds: Set<string>` prop.

- [ ] **Step 1: Reconcile orphans in main, at startup**

In `src/main/index.ts`, after `layoutStore.load()` and after the backend probe:

```ts
  // A tmux session with no panel to reach it is worse than no session: it
  // holds a process and a shell the user cannot see, close, or type into.
  // Possible if a crash landed between a spawn and the store's coalesced save.
  //
  // Killed rather than adopted on purpose. Adopting would mint geometry the
  // user never chose, which is placement work belonging to ideas-backlog item
  // 25. This is a deliberate trade, not an oversight.
  {
    const known = new Set(
      layoutStore.initial().panels.map((p) => p.id)
    )
    for (const session of ptyManager.list()) {
      if (known.has(session.panelId)) continue
      console.warn(
        `[tmux] orphan session ${session.panelId} (pid ${session.pid}) has no saved ` +
          `panel; killing it. A session with no panel cannot be reached, closed, or typed into.`
      )
      backend.destroy(session.panelId)
    }
  }
```

- [ ] **Step 2: Reconcile in the renderer's boot**

In `src/renderer/main.tsx`, inside `boot()` after `initial` is resolved:

```ts
  // Which panels already have a process behind them.
  //
  // THE RULE THIS SETTLES: dormancy is about SPAWNING, not attaching. A panel
  // with a live tmux session has nothing to spawn, so M4b's "restored panels
  // are dormant" rule does not apply to it — it reattaches when tiering makes
  // it live, exactly as an M3 panel does, and LIVE_BUDGET still caps how many
  // at once. A panel with no live session restores dormant exactly as before.
  //
  //   dormant       — has no process yet; a click is what creates one.
  //   reattachable  — has a process; it only needs a client.
  //
  // This does not disturb lod.ts's "dormancy outranks focus" rule, because a
  // reattachable panel is not dormant and never consults that precedence.
  let liveSessionIds = new Set<string>()
  try {
    const sessions = await window.canvas.pty.list()
    liveSessionIds = new Set(sessions.map((s) => s.panelId))
  } catch (error: unknown) {
    // An empty set means "everything restores dormant" — the M4b behaviour,
    // which is the safe direction to fail in: it spawns nothing.
    console.warn('[boot] could not list live sessions; restoring every panel dormant', error)
  }

  createRoot(container!).render(<App initial={initial} liveSessionIds={liveSessionIds} />)
```

and delete the old `createRoot(...).render(<App initial={initial} />)` line.

- [ ] **Step 3: Thread it through `App.tsx` and `Canvas.tsx`**

In `src/renderer/App.tsx`, add to the props interface and pass through:

```tsx
  /** Panels that already have a process; see renderer/main.tsx for the rule. */
  liveSessionIds: Set<string>
```

In `src/renderer/canvas/Canvas.tsx`, add the same prop and use it at the `registry.ensure` call site. Find the existing call that passes `{ dormant: ... }` and change its argument to:

```tsx
        // Dormant only if there is NOTHING to reattach to. A panel with a live
        // session has no process to spawn, so the dormancy rule does not
        // apply to it — see renderer/main.tsx.
        { dormant: restoredIds.has(id) && !liveSessionIds.has(id) }
```

(Keep whatever the existing "was this panel restored from disk" expression is; only the `&& !liveSessionIds.has(id)` clause is new.)

- [ ] **Step 4: Typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: clean. If `verify:panels` mounts `Canvas` or `App` directly, its entry (`scripts/panels-entry.cjs` and the page it loads) must pass the new prop — pass an empty `Set()` there for now; Task 8 gives it a real one.

- [ ] **Step 5: Confirm by hand — the milestone's actual claim**

```bash
npm run dev
```

1. Click a panel to wake it, run `top` (something visibly alive).
2. Press `Cmd+R`.
3. Expected: the panel comes back **running `top`**, not a fresh shell and not a "click to start" card.
4. In another terminal: `tmux -L terminal-canvas ls` shows the session.
5. Quit the app; `tmux -L terminal-canvas ls` reports no server.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/main.tsx src/renderer/App.tsx src/renderer/canvas/Canvas.tsx src/main/index.ts
git commit -m "feat(m4c): boot reconciliation — reattach instead of restoring dormant

Dormancy is about spawning, not attaching. A panel with a live session has
nothing to spawn, so M4b's rule does not apply to it; a panel without one
restores dormant exactly as before. lod.ts is untouched, because a
reattachable panel is not dormant and never consults 'dormancy outranks
focus'.

A failed pty:list degrades to an empty set, which restores everything
dormant — the safe direction, since it spawns nothing."
```

---

### Task 8: The boot-reconcile check, the docs, and the full run

**Files:**
- Modify: `scripts/verify-panels.cjs`, `scripts/panels-entry.cjs`
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-panels.cjs` as check 24:

```js
// 24. Boot reconcile: the two restore states asserted AGAINST EACH OTHER,
// because it is their distinction that is new. A panel with a live session
// must come back attached; one without must come back dormant. Checking only
// the first would pass for an implementation that reattaches everything and
// re-spawns the whole canvas on launch — which is exactly the behaviour M4b's
// dormancy work exists to prevent.
{
  const state = await page.executeJavaScript(`(() => {
    const sessions = window.__m4aSessions ? window.__m4aSessions() : []
    return JSON.stringify(sessions.map((s) => ({ id: s.id, dormant: s.dormant, spawned: s.spawned })))
  })()`)
  const sessions = JSON.parse(state)
  const withLive = sessions.filter((s) => LIVE_AT_BOOT.includes(s.id))
  const without = sessions.filter((s) => !LIVE_AT_BOOT.includes(s.id))
  ok('24 a panel with a live session restores non-dormant while one without stays dormant',
    withLive.length > 0 && withLive.every((s) => s.dormant === false) &&
      without.length > 0 && without.every((s) => s.dormant === true),
    `live=${JSON.stringify(withLive)} rest=${without.length} dormant=${without.filter((s) => s.dormant).length}`)
}
```

This needs one more `window.__m4a*` hook. In `src/renderer/canvas/Canvas.tsx`, beside the existing hook installations, add:

```tsx
  // verify:panels reaches the registry only through these narrow hooks; the
  // registry is a module-level closure by design and executeJavaScript has no
  // other route in. Named by what it answers, per CLAUDE.md.
  ;(window as unknown as Record<string, unknown>).__m4aSessions = () =>
    registry.all().map((s) => ({ id: s.id, dormant: s.dormant, spawned: s.spawned }))
```

and in `scripts/panels-entry.cjs`, seed the page with a known live-session set so `LIVE_AT_BOOT` is deterministic. Define near the top of `verify-panels.cjs`:

```js
/** Panels the entry seeds with a live session, so check 24 has both cases. */
const LIVE_AT_BOOT = ['s01']
```

and have `panels-entry.cjs` pass `new Set(['s01'])` as `liveSessionIds` (it already hand-wires `registerIpcHandlers` and a `PtyManager`; the same place supplies this).

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run build && npm run verify:panels
```

Expected: FAIL on 24 — `__m4aSessions is not a function` until the hook is added, then a real assertion once it is.

- [ ] **Step 3: Make it pass**

Add the hook and the entry seeding from Step 1, rebuild, re-run.

```bash
npm run build && npm run verify:panels
```

Expected: `24/24 passed`.

- [ ] **Step 4: Update `README.md`**

In the milestone table:

```markdown
| M4c | tmux backing: sessions survive the renderer | ✅ done |
```

Add `npm run verify:tmux` to the getting-started list:

```markdown
npm run verify:tmux          # tmux argv, config and version parsing, plain node
```

Replace the "Sessions die with their renderer" paragraph in "Things that are non-obvious":

```markdown
**Sessions survive their renderer, but not the app.** `Cmd+R` and `Cmd+W`
destroy the page without running React cleanup, so the renderer never sends
`pty:kill`. Since M4c each panel's process lives in a tmux session on a private
socket (`-L terminal-canvas`) and what `node-pty` holds is a tmux *client*, so a
renderer teardown detaches rather than kills and the next page's `pty:create`
hits `new-session -A` and lands back in the running agent. Quitting the app
still tears everything down — agents never outlive the app. With no tmux
installed the app falls back to spawning directly, says so in the HUD, and
behaves exactly as it did before M4c.
```

- [ ] **Step 5: Update `CLAUDE.md`**

Three edits, all of which the repo will otherwise drift on:

1. In the suite table, add the row and **correct the stale `verify:panels` count** (it says 22; it is now 24):

```markdown
| `verify:tmux` | plain node | 17 checks: `tmux-args.ts`'s argv, config text, version parsing and list parsing (1–13), and `tmux-probe.ts`'s pure backend selection (14–17) |
```
and change the `verify:panels` row to `24 checks`, ending `..., undo/redo (20–22), reset (23), and boot reconcile (24)`.

2. Add to "Load-bearing details":

```markdown
**One operation became three (`window-lifecycle.ts`, `pty-manager.ts`,
`main/index.ts`).** Before M4c a single `killAll()` served every teardown path,
because under `node-pty` those paths genuinely meant the same thing. Under tmux
they do not: a renderer teardown calls **`detachAll()`** (local handles die, tmux
sessions live), closing a panel calls **`kill(id)`** which also calls
`backend.destroy(id)` (the session dies), and `before-quit` calls
**`shutdown()`** (`kill-server` on our private socket). Reverting
`attachPtyLifecycle`'s callback to `killAll` keeps every check in
`verify:window` green while silently restoring the M3 behaviour M4c exists to
remove — which is why `verify:pty-manager` check 12 asserts the reattached pid
is the *same* pid.

**The tmux client's exit code is always 1 (`session-backend.ts`,
`tmux-args.ts`).** Measured: an inner command exiting 0 and one exiting 42 both
produce client exit 1. `remain-on-exit on` plus a `pane-died` hook recovers the
real `#{pane_dead_status}`; the hook writes the file *before* `kill-session`, and
killing the session is what makes the client exit, so by the time `node-pty`'s
`onExit` fires the file is already on disk and main reads it in the handler it
already had. No watcher, no polling, no new IPC. Reversing those two hook
commands is a race that reports the wrong code intermittently.

**`parseListOutput` must filter `#{pane_dead}`.** The one place `remain-on-exit
on` leaks outside the exit path: a session whose command has exited still
*exists* until the hook kills it, so an unfiltered list reports a finished
process as live, boot reconciliation restores that panel non-dormant, and the
user gets a panel attached to a corpse that can never produce another byte.

**tmux is resolved by absolute path from the login env (`tmux-probe.ts`).** The
same defect `shell-env.ts` exists for: launchd gives a GUI app a bare PATH, so
`/opt/homebrew/bin/tmux` is not on it and spawning `tmux` by name fails exactly
the way `claude` does. `whichFromEnv('tmux', env)` is the fix, and it must run
*after* `resolveShellEnv()`.

**Dormancy is about spawning, not attaching (`renderer/main.tsx`).** A panel
with a live tmux session has nothing to spawn, so M4b's "restored panels are
dormant" rule does not apply to it — it reattaches like any M3 panel and
`LIVE_BUDGET` still caps how many at once. A panel with no live session still
restores dormant. `lod.ts` is untouched: a reattachable panel is not dormant and
never consults "dormancy outranks focus". A failed `pty:list` degrades to the
empty set, which restores everything dormant — the safe direction, because it
spawns nothing.

**The bundled tmux config is generated, not shipped (`tmux-args.ts`'s
`buildTmuxConf`).** The `pane-died` hook embeds `exitDir`, a per-run path under
`userData` that is unknowable until the app is running. Every line in it fails
*silently*: `prefix None` is what keeps `Ctrl+B` reaching the agent (the same
split as `Ctrl+C` and `Ctrl+Z`), `terminal-features ",xterm-256color:RGB"` is
what stops 24-bit agent output being downsampled to 256, and `mouse` must stay
**off** — `mouse on` makes tmux capture mouse reporting instead of passing it
through, silently defeating all of M4a's pointer correction from one process
further down.
```

3. Update the architecture section's IPC diagram to add `session:backend`, and add `verify:tmux` to the plain-node list in the "Why the Electron binary and not `node`" paragraph.

- [ ] **Step 6: Run the whole thing**

```bash
npm run verify
```

Expected: every suite green. This is the gate — `CLAUDE.md` is explicit that `npm run verify` is the whole verification story and must be green before claiming work is done.

- [ ] **Step 7: Walk the spec's success criteria by hand**

None of these is fully covered by a suite. Run `npm run dev` and check each:

1. Start a long-running command, `Cmd+R` — it is still running.
2. `Cmd+W`, reopen — same.
3. Kill the renderer process outright — same.
4. Close a panel; its session is gone from `tmux -L terminal-canvas ls`.
5. Quit; no server on our socket, and `tmux ls` (the user's own) is untouched.
6. A command exiting 7 reports `[process exited with code 7]`.
7. `Ctrl+B` reaches the agent; no tmux status line anywhere.
8. 24-bit colour renders as 24-bit colour.
9. Mouse-reporting TUIs respond correctly at several zoom levels.
10. Temporarily rename the tmux binary: the app opens, panels work, the HUD warns, and a reload confirms sessions ended. **Rename it back.**
11. A full relaunch still restores every panel dormant, spawning nothing.

- [ ] **Step 8: Commit**

```bash
git add scripts/verify-panels.cjs scripts/panels-entry.cjs src/renderer/canvas/Canvas.tsx README.md CLAUDE.md
git commit -m "docs(m4c): record what tmux backing changed

The invariants worth protecting: one operation becoming three, the tmux
client's exit code carrying no information, parseListOutput having to
filter dead panes, and dormancy being about spawning rather than
attaching.

Also corrects the verify:panels count, which said 22 and was 23 before
this milestone added a 24th — the same drift CLAUDE.md's dispose
call-site note was written to warn about."
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: the seam → Task 2; the tmux invocation and config → Task 1 (text) and Task 3 (use); exit fidelity → Tasks 1 and 3; boot reconciliation → Task 7; orphans → Task 7; the probe and fallback → Task 4; the `session:backend` channel and HUD → Task 6; the detach/destroy/shutdown split → Task 5; testing → distributed, with the new suite in Task 1 and the docs in Task 8.

**Deliberate deviation, recorded at the top.** The pure builders live in `src/main/tmux-args.ts`, not `session-backend.ts` as the spec's file list said. `session-backend.ts` imports `node-pty`, which will not load under plain node, so the spec's placement would make `verify:tmux` impossible in the cheap tier — defeating the reason the spec demanded pure builders.

**Ordering dependency worth flagging.** `verify:pty-manager` check 12 calls `detachAll()`, which Task 3 Step 3 adds and Task 5 wires up. Executed in order this is fine; executed out of order, check 12 fails for a reason unrelated to what it tests.

**Things an implementer must not "simplify".**
- The `#{pane_dead}` filter in `parseListOutput` looks like defensive noise and is the difference between a working canvas and panels attached to corpses.
- The hook's command *order* (write, then kill) looks arbitrary and is the entire reason no watcher is needed.
- `whichFromEnv('tmux', env)` looks like over-engineering versus spawning `tmux` — it is the difference between working in Terminal and failing in the shipped app.
- `DirectBackend.list()` returning `null` rather than `[]` looks like sloppy typing; `[]` would mean "nothing is running" and make every panel restore dormant.
- The absent `mouse` line in the config looks like an omission and is a decision.
