# M5c Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an unsigned `Terminal Canvas.app` and `.dmg` for arm64 that opens by double-click, keeps its state and its tmux server separate from the dev build, and is verified both cheaply (config-as-a-function) and honestly (a real packaged binary, really launched).

**Architecture:** electron-builder's configuration is written as a *pure function* in `build/builder-config.cjs` rather than a static blob, so the cheapest verify tier can assert on it — the same "pure builder here, impure spawn there" split `tmux-args.ts` / `session-backend.ts` already uses. Socket isolation is a pure resolver in `tmux-args.ts` keyed off `app.isPackaged`, so the builder config never mentions tmux and the socket name has exactly one home. A second, slow suite packages for real and launches the binary with a stripped `PATH` to exercise the two launchd conditions `npm run dev` has never been able to produce.

**Tech Stack:** electron-builder, Electron 43, plain-CJS verify suites under `node`, esbuild for the plain-node bundles.

**Spec:** `docs/superpowers/specs/2026-08-26-m5c-packaging-design.md`

## Global Constraints

- **No signing, no notarization.** `identity` must be explicitly `null`, never merely absent. No Apple Developer account, no keychain dependency, no network beyond electron-builder's own cache.
- **Target:** macOS, `arm64` only. Artifacts `dir` and `dmg`. Output directory `release/` (already in `.gitignore`).
- **`appId`:** `com.alexnieves.terminal-canvas`. **`productName`:** `Terminal Canvas`. Both exact.
- **Dev socket stays `'terminal-canvas'`.** `TMUX_SOCKET` keeps that value and keeps being the default of every argv builder. **`verify:tmux` check 9 must pass unmodified** — this milestone adds checks and never relaxes one. Packaged socket is `'terminal-canvas-app'`.
- **`TC_TMUX_SOCKET`** is a developer-only env override, honoured *only* inside `resolveSocket`. No UI, no persistence, no settings entry.
- **`verify:package`** joins the `npm run verify` chain. **`verify:packaged`** must NOT join it.
- **No verify suite may touch the production socket or the real `layout.json`.** `verify:packaged` uses its own socket and its own `--user-data-dir`.
- Comments explain *why*, matching the density of the surrounding code. Commits are conventional and scoped: `feat(m5c):`, `fix(m5c):`, `test(m5c):`, `docs(m5c):`.
- `npm run verify` must be green before any task is called done.

---

### Task 1: The socket resolver

Pure, no packaging yet. This is the change that makes a packaged app and a dev app unable to destroy each other's agents, and it is testable entirely in the plain-node tier.

**Files:**
- Modify: `src/main/tmux-args.ts` (append after the existing `TMUX_SOCKET` / `TmuxSocket` declarations, around line 17–27)
- Test: `scripts/verify-tmux.cjs` (append checks 20–23 before the summary block at the end)

**Interfaces:**
- Consumes: `TMUX_SOCKET`, `type TmuxSocket` — both already exported from `src/main/tmux-args.ts`.
- Produces:
  - `export const TMUX_SOCKET_PACKAGED: string` — the value `'terminal-canvas-app'`.
  - `export function resolveSocket(o: { packaged: boolean; override?: string | null | undefined }): TmuxSocket`

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-tmux.cjs`, immediately *before* the `console.log('\n' + '='.repeat(60))` summary block at the end of the file:

```js
// 20. Dev and packaged builds must land on DIFFERENT tmux servers. before-quit
// calls shutdown(), which is kill-server: sharing a socket means quitting
// either build destroys the other's running agents, which is precisely the
// outcome M4c exists to prevent. M5c is the first thing that makes two
// simultaneous instances plausible, so this is where the split is made.
{
  const dev = T.resolveSocket({ packaged: false })
  const packaged = T.resolveSocket({ packaged: true })
  ok('20 dev and packaged resolve to different sockets',
    dev === T.TMUX_SOCKET && packaged === T.TMUX_SOCKET_PACKAGED && dev !== packaged,
    `dev=${dev} packaged=${packaged}`)
}

// 21. The dev value is unchanged. Every argv builder still defaults to
// TMUX_SOCKET, so check 9 keeps its meaning; M5c adds a socket, it does not
// move one.
{
  ok('21 the dev socket is still the historic production value',
    T.resolveSocket({ packaged: false }) === 'terminal-canvas',
    T.resolveSocket({ packaged: false }))
}

// 22. The developer override. verify:packaged launches a REAL packaged binary,
// and must be able to point it at a scratch server: without this it would
// spawn sessions on — and could kill-server — the socket a real packaged app
// is using. Same rule as "the verify suites must never touch the production
// socket", one level up.
{
  ok('22 an explicit override beats both defaults',
    T.resolveSocket({ packaged: true, override: 'tc-scratch' }) === 'tc-scratch' &&
      T.resolveSocket({ packaged: false, override: 'tc-scratch' }) === 'tc-scratch')
}

// 23. THE SILENT ONE. `TC_TMUX_SOCKET=` in a shell yields '', not undefined,
// and an empty -L argument does not mean "no socket" — tmux falls back to its
// DEFAULT socket, i.e. the user's own tmux server, the one shutdown()'s
// kill-server would then destroy. A whitespace-only value is the same shape.
// Blank must be indistinguishable from unset.
{
  const cases = [undefined, null, '', '   ', '\t\n']
  const bad = cases.filter((o) => T.resolveSocket({ packaged: false, override: o }) !== 'terminal-canvas')
  ok('23 a blank or whitespace override is ignored, never passed through',
    bad.length === 0, `leaked=${JSON.stringify(bad)}`)
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:tmux`
Expected: checks 1–19 PASS, checks 20–23 FAIL. The failure will be a `TypeError: T.resolveSocket is not a function` thrown out of check 20 — which aborts the file rather than printing four FAIL lines. That is the correct "watched failing" state for a not-yet-existing export; if instead you see 23/23 PASS, the module already has the function and you are testing nothing.

- [ ] **Step 3: Write the minimal implementation**

In `src/main/tmux-args.ts`, directly after the `export type TmuxSocket = string` declaration and its comment block:

```ts
/**
 * The packaged app's socket. A packaged build and a dev build are two separate
 * installations of the same program, and they must not share a tmux server:
 * before-quit calls shutdown(), which is kill-server, so a shared socket means
 * quitting either one destroys the other's running agents — the exact outcome
 * M4c exists to prevent. Nothing before M5c made two simultaneous instances
 * plausible, which is why this arrives with packaging rather than with tmux.
 */
export const TMUX_SOCKET_PACKAGED: TmuxSocket = 'terminal-canvas-app'

/**
 * Which socket this run uses. Pure, so the whole rule is covered by verify:tmux
 * without an Electron runtime; main calls it once with app.isPackaged.
 *
 * `override` is a DEVELOPER flag (TC_TMUX_SOCKET), with no UI, no persistence
 * and no settings entry — the separation ideas-backlog #72 asks for. It exists
 * so verify:packaged can launch a real packaged binary against a scratch server
 * instead of the one a real packaged app is using.
 *
 * A blank override is treated as unset, and that is load-bearing rather than
 * tidy: `TC_TMUX_SOCKET=` in a shell produces '', and tmux given an empty -L
 * does not error — it falls back to the DEFAULT socket, i.e. the user's own
 * tmux server, which shutdown() would then kill-server. Blank has to be
 * indistinguishable from unset or the failure is silent and other people's work
 * is what it costs.
 */
export function resolveSocket(o: {
  packaged: boolean
  override?: string | null | undefined
}): TmuxSocket {
  const override = o.override?.trim()
  if (override) return override
  return o.packaged ? TMUX_SOCKET_PACKAGED : TMUX_SOCKET
}
```

- [ ] **Step 4: Run the checks and watch them pass**

Run: `npm run verify:tmux`
Expected: `23/23 passed`, and no `FAILED:` line.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 with no output. (`tsconfig.node.json` sets `noUnusedLocals`; nothing here is unused, but a stray import would fail here rather than at build.)

- [ ] **Step 6: Commit**

```bash
git add src/main/tmux-args.ts scripts/verify-tmux.cjs
git commit -m "feat(m5c): a socket resolver, so two builds cannot kill-server each other"
```

---

### Task 2: Thread the resolved socket through the probe

`resolveSocket` is inert until something calls it. Threading it reveals a pre-existing gap: `tmux-probe.ts:87` builds its `start-server` argv **by hand**, inline, and is the only tmux argv in the codebase not built by `tmux-args.ts` — which is exactly why `verify:tmux` check 9's list ("list, kill-session, kill-server, and the hook") does not include it. Extracting it is what makes the socket change visible to a check.

**Files:**
- Modify: `src/main/tmux-args.ts` (add `buildStartServerArgs`, next to `buildListArgs` around line 183)
- Modify: `src/main/tmux-probe.ts` (`tmuxServerStarts` and `probeTmux` take the socket; use the new builder; pass the socket to `createTmuxBackend`)
- Modify: `src/main/index.ts` (call `resolveSocket` once; pass it to `probeTmux`)
- Test: `scripts/verify-tmux.cjs` (append checks 24–25)

**Interfaces:**
- Consumes: `resolveSocket`, `TMUX_SOCKET_PACKAGED` (Task 1). Existing: `createTmuxBackend(o: { tmuxPath, exitDir, confPath, reason, socket? })` from `src/main/session-backend.ts` — the optional `socket` member already exists and is what this task finally supplies in production.
- Produces:
  - `export function buildStartServerArgs(confPath: string, socket?: TmuxSocket): string[]`
  - `probeTmux(env: Record<string, string>, userDataDir: string, socket?: TmuxSocket): Promise<SessionBackend>` — third parameter is new and defaults to `TMUX_SOCKET`, so every existing caller keeps compiling and keeps its current behaviour.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-tmux.cjs`, before the summary block:

```js
// 24. start-server was the ONE tmux argv in this codebase built by hand,
// inline in tmux-probe.ts, which is why check 9's list of socket-targeting
// argvs does not mention it. Socket isolation is worthless if the probe starts
// a server on a different socket than the panels then attach to — and the
// symptom would be a working app that quietly runs two tmux servers.
{
  const args = T.buildStartServerArgs('/tmp/tc verify/tmux.conf')
  const pass =
    args[0] === '-L' && args[1] === T.TMUX_SOCKET &&
    args[args.indexOf('-f') + 1] === '/tmp/tc verify/tmux.conf' &&
    args[args.length - 1] === 'start-server'
  ok('24 start-server is built, not hand-rolled, and defaults to the private socket',
    pass, JSON.stringify(args))
}

// 25. And it threads a custom socket, like every other builder in this file.
{
  const args = T.buildStartServerArgs('/tmp/c.conf', T.TMUX_SOCKET_PACKAGED)
  ok('25 start-server threads an explicit socket',
    args[1] === 'terminal-canvas-app', JSON.stringify(args))
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:tmux`
Expected: 1–23 PASS, then a `TypeError: T.buildStartServerArgs is not a function` out of check 24.

- [ ] **Step 3: Add the builder**

In `src/main/tmux-args.ts`, immediately after `buildListArgs`:

```ts
/**
 * Starting the server is a probe, not a session: tmux-probe.ts runs it to find
 * out whether a server can come up AT ALL on our socket with our config, which
 * `tmux -V` cannot answer. It lived inline in that file until M5c, and was
 * therefore the one argv check 9 could not see — the gap that mattered the
 * moment the socket stopped being a constant.
 */
export function buildStartServerArgs(
  confPath: string,
  socket: TmuxSocket = TMUX_SOCKET
): string[] {
  return ['-L', socket, '-f', confPath, 'start-server']
}
```

- [ ] **Step 4: Run the checks and watch them pass**

Run: `npm run verify:tmux`
Expected: `25/25 passed`.

- [ ] **Step 5: Thread the socket through the probe**

In `src/main/tmux-probe.ts`:

Change the import line to add the new names:

```ts
import {
  buildStartServerArgs,
  buildTmuxConf,
  isSupportedTmuxVersion,
  parseTmuxVersion,
  TMUX_SOCKET,
  type TmuxSocket
} from './tmux-args'
```

Replace the body of `tmuxServerStarts` so it takes and uses the socket:

```ts
function tmuxServerStarts(
  tmuxPath: string,
  confPath: string,
  socket: TmuxSocket
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      tmuxPath,
      buildStartServerArgs(confPath, socket),
      { timeout: 5000 },
      (error, _stdout, stderr) => {
        if (!error) return resolve(null)
        const detail = (stderr || error.message || '').trim().split('\n')[0]
        resolve(detail || 'unknown error')
      }
    )
  })
}
```

Change `probeTmux`'s signature and its two use sites. The signature:

```ts
export async function probeTmux(
  env: Record<string, string>,
  userDataDir: string,
  // Defaulted so every existing caller keeps compiling AND keeps its current
  // behaviour; main is the one caller that passes a resolved value.
  socket: TmuxSocket = TMUX_SOCKET
): Promise<SessionBackend> {
```

The server check inside it becomes:

```ts
    const failure = await tmuxServerStarts(choice.tmuxPath, confPath, socket)
```

And the successful return must hand the socket to the backend — **this is the load-bearing half**, because `createTmuxBackend` otherwise falls back to `TMUX_SOCKET` and the app would probe one socket and spawn on another:

```ts
  console.log(`[tmux] ${choice.reason} at ${choice.tmuxPath}; sessions will survive a reload`)
  return createTmuxBackend({
    tmuxPath: choice.tmuxPath,
    exitDir,
    confPath,
    reason: choice.reason,
    socket
  })
```

- [ ] **Step 6: Call the resolver once, in main**

In `src/main/index.ts`, add `resolveSocket` to the existing `./tmux-probe`-adjacent imports by importing it from `./tmux-args`:

```ts
import { resolveSocket } from './tmux-args'
```

Then inside `app.whenReady().then(async () => { ... })`, replace the single `backend = await probeTmux(...)` line with:

```ts
  // After the env probe, because tmux must be resolved from the LOGIN PATH:
  // launchd gives a GUI app a bare PATH and /opt/homebrew/bin is not on it.
  //
  // The socket is resolved from app.isPackaged so a packaged build and a dev
  // build never share a tmux server: before-quit calls shutdown(), which is
  // kill-server, and a shared socket would mean quitting either one destroys
  // the other's agents. TC_TMUX_SOCKET is a developer override with no UI.
  const tmuxSocket = resolveSocket({
    packaged: app.isPackaged,
    override: process.env['TC_TMUX_SOCKET']
  })
  backend = await probeTmux(env, app.getPath('userData'), tmuxSocket)
```

- [ ] **Step 7: Typecheck, then run the full chain**

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run verify`
Expected: every suite green, ending with `verify:panels`. Pay attention to `verify:pty-manager` — it drives the real `TmuxBackend` on its own socket (`terminal-canvas-verify`) and check 12 asserts a reattach lands on the *same pid*. If that check now fails, the socket is not being threaded consistently between probe and backend.

- [ ] **Step 8: Commit**

```bash
git add src/main/tmux-args.ts src/main/tmux-probe.ts src/main/index.ts scripts/verify-tmux.cjs
git commit -m "feat(m5c): resolve the socket from app.isPackaged, and build start-server like every other argv"
```

---

### Task 3: The config builder, and the cheap suite that reads it

**Files:**
- Create: `build/builder-config.cjs`
- Create: `electron-builder.config.cjs`
- Create: `scripts/verify-package.cjs`
- Modify: `package.json` (devDependency, three scripts, the `verify` chain)

**Interfaces:**
- Consumes: nothing from earlier tasks. This file is deliberately import-free.
- Produces: `module.exports = { buildConfig }` where `buildConfig(opts?: { arch?: string }) => object` — the electron-builder configuration. `scripts/verify-package.cjs` and `electron-builder.config.cjs` are its only consumers.

- [ ] **Step 1: Install electron-builder**

Run: `npm install --save-dev electron-builder`
Expected: it lands in `devDependencies`. It must NOT go in `dependencies` — `dependencies` is for things that ship inside the app (`node-pty`), and a bundler in there would be packaged into the `.app`.

- [ ] **Step 2: Write the failing suite**

Create `scripts/verify-package.cjs`:

```js
/* Verifies the packaging configuration as a VALUE, not as a file.
   Run with: npm run verify:package

   Plain node, no esbuild entry, no electron, no build. build/builder-config.cjs
   is import-free plain CJS precisely so this suite can require it directly —
   the cheapest tier in the repo.

   Every check here guards a failure that is SILENT until late: an app that
   launches, renders its canvas, shows its first panel, and dies at the first
   pty:create because a .node binary cannot be required out of an asar. */
const { buildConfig } = require('../build/builder-config.cjs')

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const config = buildConfig()

// 1. THE ONE THAT MATTERS MOST. node-pty is a native module; a .node binary
// cannot be required out of an asar archive. Without this the app launches
// normally and dies at the first pty:create — the latest, quietest failure
// this milestone can produce.
{
  const patterns = config.asarUnpack ?? []
  ok('1 node-pty is unpacked from the asar',
    patterns.some((p) => p.includes('node-pty')), JSON.stringify(patterns))
}

// 2. ...and it must still match if npm hoists node-pty to a nested depth. A
// pattern anchored at the root ('node_modules/node-pty/**') silently stops
// matching the day a transitive dependency pulls its own copy, and the symptom
// is check 1's failure arriving months later with no code change to blame.
{
  const patterns = config.asarUnpack ?? []
  const nodePty = patterns.filter((p) => p.includes('node-pty'))
  ok('2 the unpack pattern is depth-independent',
    nodePty.length > 0 && nodePty.every((p) => p.startsWith('**/')),
    JSON.stringify(nodePty))
}

// 3. asarUnpack is meaningless with asar off, and asar off is a different
// (much slower to start, far larger) app. Assert the pairing, not just the key.
{
  ok('3 asar is on, which is what makes asarUnpack mean anything',
    config.asar === true, String(config.asar))
}

// 4. The built renderer and main are what ship. `out/` is produced by
// electron-vite build; forgetting it produces an app with no code in it.
{
  const files = config.files ?? []
  ok('4 the build output is included', files.some((f) => f.startsWith('out/')),
    JSON.stringify(files))
}

// 5. Source, the verify suites, and the docs are not the product. This is size
// and hygiene rather than correctness — but scripts/ contains suites that
// kill-server, and shipping them inside the app is not a thing to do by
// accident.
{
  const files = config.files ?? []
  const excluded = ['src', 'scripts', 'docs']
  const missing = excluded.filter((d) => !files.some((f) => f === `!${d}/**`))
  ok('5 src, scripts and docs are excluded', missing.length === 0,
    `missing=${JSON.stringify(missing)} files=${JSON.stringify(files)}`)
}

// 6. Identity. productName is NOT cosmetic: app.getPath('userData') derives
// from it, so this string is what separates the packaged app's layout.json,
// presets, prompts and tmux-exits dir from the dev build's.
{
  ok('6 the app identity is exact',
    config.appId === 'com.alexnieves.terminal-canvas' &&
      config.productName === 'Terminal Canvas',
    `${config.appId} / ${config.productName}`)
}

// 7. release/ is already gitignored. Defaulting to dist/ would work and would
// also start committing build output the day someone's ignore file differs.
{
  ok('7 output goes to release/', config.directories?.output === 'release',
    JSON.stringify(config.directories))
}

// 8. THE ABSENT-vs-NULL CHECK. Omitted, electron-builder may DISCOVER a signing
// identity in whichever keychain the build runs against, producing a
// differently-signed app on a different machine. Explicit null is what makes
// the build hermetic — so this asserts the KEY IS PRESENT, not merely that the
// value is falsy. Same distinction parsePresets draws between ABSENT and
// MALFORMED, and for the same reason: they are different facts.
{
  const mac = config.mac ?? {}
  ok('8 signing is explicitly disabled, not merely unmentioned',
    Object.prototype.hasOwnProperty.call(mac, 'identity') && mac.identity === null,
    `present=${Object.prototype.hasOwnProperty.call(mac, 'identity')} value=${String(mac.identity)}`)
}

// 9. Both artifacts, one architecture. `dir` is the plain .app verify:packaged
// launches; dmg is the one worth keeping.
{
  const targets = config.mac?.target ?? []
  const names = targets.map((t) => (typeof t === 'string' ? t : t.target))
  const arches = targets.flatMap((t) => (typeof t === 'string' ? [] : t.arch ?? []))
  ok('9 dir and dmg are built, for arm64',
    names.includes('dir') && names.includes('dmg') &&
      arches.length > 0 && arches.every((a) => a === 'arm64'),
    JSON.stringify(targets))
}

// 10. The arch is a parameter rather than a constant, so widening to universal
// later is a call site rather than an edit to a shipped default.
{
  const targets = buildConfig({ arch: 'universal' }).mac.target
  const arches = targets.flatMap((t) => t.arch ?? [])
  ok('10 the architecture is a parameter',
    arches.length > 0 && arches.every((a) => a === 'universal'), JSON.stringify(arches))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
```

- [ ] **Step 3: Wire the scripts, then run the suite and watch it fail**

In `package.json`, add three scripts. Put `verify:package` next to the other plain-node suites, and add it to the `verify` chain in the plain-node group (before `verify:pty`):

```json
    "package": "npm run build && electron-builder --config electron-builder.config.cjs",
    "verify:package": "node scripts/verify-package.cjs",
```

and change the `verify` script to insert `verify:package` after `verify:tmux`:

```json
    "verify": "npm run verify:viewport && npm run verify:registry && npm run verify:layout && npm run verify:palette && npm run verify:tmux && npm run verify:package && npm run verify:pty && npm run verify:pty-manager && npm run verify:window && npm run verify:ipc && npm run build && npm run verify:canvas && npm run verify:xterm && npm run verify:panels"
```

Run: `npm run verify:package`
Expected: FAIL — `Cannot find module '../build/builder-config.cjs'`. This is the watched-failing state; the module does not exist yet.

- [ ] **Step 4: Write the config builder**

Create `build/builder-config.cjs`:

```js
/* The electron-builder configuration, as a FUNCTION.
 *
 * Normally this is a static blob — a "build" key in package.json, or an
 * electron-builder.yml. This repo cannot test a blob: every quality claim here
 * rests on npm run verify, and the pattern that makes each suite possible is
 * always the same one — put the pure part in a module that computes a value
 * from plain data, and keep the impure part elsewhere. tmux-args.ts builds argv
 * while session-backend.ts spawns; layout-store.ts takes a path rather than
 * calling app.getPath; presets.ts takes `which` rather than importing
 * shell-env.ts. A blob has no function in it, so any check written against one
 * would read JSON and compare it to itself.
 *
 * Plain CJS rather than TypeScript, deliberately, in a TypeScript-first repo:
 * electron-builder loads this itself, at build time, in a process this repo
 * does not control and cannot put esbuild in front of. A .ts config would need
 * a bundling step whose only consumer is the bundling step. The payoff is that
 * verify-package.cjs needs no esbuild entry at all, unlike every other
 * plain-node suite here, because there is nothing to resolve.
 *
 * It is import-free on purpose. Requiring anything from src/ would drag the
 * TypeScript build into the config load, and requiring anything from
 * node_modules would make the cheapest suite in the repo depend on an install.
 */
'use strict'

function buildConfig(opts) {
  const arch = (opts && opts.arch) || 'arm64'

  return {
    appId: 'com.alexnieves.terminal-canvas',

    // NOT cosmetic. app.getPath('userData') derives from the app's name, so
    // this string is what gives the packaged app its own layout.json, presets,
    // prompts and tmux-exits directory, separate from the dev build's
    // ~/Library/Application Support/terminal-canvas. The consequence is that
    // the packaged app opens on firstRunPanels() — one centred placeholder —
    // rather than on the dev canvas. That is intended: the two are separate
    // installations of the same program.
    productName: 'Terminal Canvas',

    directories: {
      // Already in .gitignore, unlike the dist/ default on some setups.
      output: 'release',
      buildResources: 'build'
    },

    // What electron-vite produced, and nothing that produced it. Production
    // dependencies (node-pty) are resolved by electron-builder itself from
    // package.json rather than by these globs.
    files: [
      'out/**',
      'package.json',
      '!**/*.tsbuildinfo',
      '!src/**',
      '!scripts/**',
      '!docs/**'
    ],

    asar: true,

    // THE LOAD-BEARING LINE. node-pty is a native module and a .node binary
    // cannot be required out of an asar archive. Without this the app launches,
    // renders the canvas, shows its first panel, and dies at the first
    // pty:create.
    //
    // Anchored with '**/' rather than at the root so it keeps matching if npm
    // ever hoists node-pty to a nested depth — a root-anchored pattern would
    // stop matching silently, months later, with no code change to blame.
    asarUnpack: ['**/node_modules/node-pty/**'],

    mac: {
      category: 'public.app-category.developer-tools',
      target: [
        { target: 'dir', arch: [arch] },
        { target: 'dmg', arch: [arch] }
      ],

      // EXPLICIT, not omitted, and the difference is the whole point. Omitted,
      // electron-builder may discover a Developer ID in whichever keychain the
      // build runs against and produce a differently-signed app on a different
      // machine. Explicit null is what makes this build hermetic and offline.
      // M5c ships unsigned by decision, not by accident: another Mac will show
      // Gatekeeper's unidentified-developer block, which is the accepted cost.
      identity: null
    }
  }
}

module.exports = { buildConfig }
```

Create `electron-builder.config.cjs`:

```js
/* electron-builder's entry point into the config. Three lines on purpose: all
   of the decisions, and all of the comments explaining them, live in
   build/builder-config.cjs, which verify:package requires directly. */
'use strict'
const { buildConfig } = require('./build/builder-config.cjs')
module.exports = buildConfig()
```

- [ ] **Step 5: Run the suite and watch it pass**

Run: `npm run verify:package`
Expected: `10/10 passed`.

- [ ] **Step 6: Confirm electron-builder can actually load the config**

Run: `npx electron-builder --config electron-builder.config.cjs --dir --mac 2>&1 | tail -30`
Expected: a build that completes and writes `release/mac-arm64/Terminal Canvas.app`. If it fails, read the error before changing anything — the two likely causes are a `files` glob that excluded something needed, and the signing behaviour named as a risk in the spec's §4. **Do not fix the signing risk here**; Task 5 is where it is diagnosed against a launched binary. Record what you saw and continue.

- [ ] **Step 7: Commit**

```bash
git add build/builder-config.cjs electron-builder.config.cjs scripts/verify-package.cjs package.json package-lock.json
git commit -m "feat(m5c): the packaging config as a function, and the suite that reads it"
```

---

### Task 4: The startup diagnostic

`verify:packaged` observes a packaged app from outside. It has no IPC into it, no renderer hook, and — unlike every other real-Electron suite here — **no custom entry point**: `scripts/panels-entry.cjs` works by *being* the Electron entry, and a packaged app runs its own `main` by definition. Its own stdout is the only channel.

**Files:**
- Modify: `src/main/index.ts` (one log line in `app.whenReady`, after the backend probe) — **this is the only production change in this task**

**Interfaces:**
- Consumes: `tmuxSocket` (Task 2's local in `app.whenReady`), `backend.kind` / `backend.reason` (existing `SessionBackend` members).
- Produces: one new stdout line, with a stable prefix Task 5 greps for:
  - `[startup] packaged=<bool> userData=<path> socket=<name> backend=<kind> (<reason>) PATH=<resolved>`

**The spawn signal already exists — do not add one.** `PtyManager.create` has logged
`[pty] spawned <command> pid=<n> panel=<id> <cols>x<rows> cwd=<path>` since M1
(`src/main/pty-manager.ts:118`). Task 5 greps *that* line. An earlier draft of this plan
added a second, near-identical log; it was cut on review. A log line whose only consumer is
a check, sitting beside one that already says the same thing, is duplication that drifts —
and this repo has exactly one sanctioned duplication (`verify:pty`) with a written reason.

- [ ] **Step 1: Add the startup line**

In `src/main/index.ts`, immediately after the `backend = await probeTmux(...)` line added in Task 2:

```ts
  // One line naming everything an outside observer needs, because for a
  // PACKAGED app stdout is the only channel there is: no IPC into a test
  // harness, no renderer hook, and — unlike every other Electron suite here —
  // no custom entry point, since scripts/panels-entry.cjs works by BEING the
  // entry and a packaged app runs its own main.
  //
  // Reaching this line is itself the evidence that node-pty loaded: session-
  // backend.ts imports it at module scope, so a .node binary trapped inside the
  // asar throws during import and the app never gets here.
  //
  // The resolved PATH is included because it is the only way to tell a
  // recovered login environment from launchd's bare one — and shell-env.ts's
  // entire reason for existing has never been observable under npm run dev,
  // where the app inherits the developer's own terminal environment.
  console.log(
    `[startup] packaged=${app.isPackaged} userData=${app.getPath('userData')} ` +
      `socket=${tmuxSocket} backend=${backend.kind} (${backend.reason}) ` +
      `PATH=${env['PATH'] ?? '<none>'}`
  )
```

- [ ] **Step 2: Confirm the spawn line you are relying on**

Run: `sed -n '115,125p' src/main/pty-manager.ts`
Expected: the existing `console.log` emitting ``[pty] spawned ${command} pid=${proc.pid} panel=${spec.panelId} ...``. Change nothing here. This step exists so the next task's grep is written against a line you have actually read, rather than one you assumed.

- [ ] **Step 3: Verify both lines appear under dev**

Run: `npm run dev`
Expected: within a few seconds of the window appearing, stdout carries a `[startup] packaged=false ... socket=terminal-canvas ...` line, and once the first panel goes live, the pre-existing `[pty] spawned <command> pid=<number> panel=n1 ...` line. Quit the app with `Cmd+Q`.

This step is a manual observation on purpose: it is the cheapest possible check that Task 5's greps will have something to match, and getting it wrong there costs a multi-minute packaging run per attempt.

- [ ] **Step 4: Run the full chain**

Run: `npm run verify`
Expected: every suite green. The one new log line is additive and should disturb nothing.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(m5c): say which build, which socket, which backend, and which PATH"
```

---

### Task 5: The suite that really packages and really launches

This is the only check in the repo that exercises launchd's bare PATH and the asar boundary. It is slow and it reaches electron-builder's cache, so it stays **out of** `npm run verify` — and that is a decision that has to be written down, because a suite outside the chain is a suite that silently stops being run.

**Files:**
- Create: `scripts/verify-packaged.cjs`
- Modify: `package.json` (the `verify:packaged` script only — NOT the `verify` chain)

**Interfaces:**
- Consumes: Task 4's `[startup] ...` line, `PtyManager.create`'s pre-existing `[pty] spawned ... pid=<n> ...` line, and `buildConfig` from Task 3 (for the output directory and productName, so the binary path is derived rather than hardcoded twice).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Add the script entry**

In `package.json`, beside the other verify scripts — and deliberately **not** in the `verify` chain:

```json
    "verify:packaged": "unset ELECTRON_RUN_AS_NODE && node scripts/verify-packaged.cjs",
```

`unset ELECTRON_RUN_AS_NODE` matters for the same reason it does in `dev`: this suite launches a real app bundle, and that variable makes the Electron binary boot as plain Node with no `app` object.

- [ ] **Step 2: Write the suite**

Create `scripts/verify-packaged.cjs`:

```js
/* Packages the app for real and launches the produced binary for real.
   Run with: npm run verify:packaged

   NOT part of npm run verify, on purpose. It runs electron-builder, which
   rebuilds native modules and reaches its own download cache — minutes, and a
   network dependency. Making the repo's one green-or-not signal slow and
   flaky would cost more than this check is worth on every run. It is the
   PRE-RELEASE gate, and CLAUDE.md's suite table says so with that reason
   attached.

   It exists because two of this codebase's load-bearing workarounds are for
   conditions npm run dev CANNOT produce:

     - shell-env.ts opens with "macOS GUI apps are launched by launchd, so they
       inherit a bare PATH and no dotfile exports". Under npm run dev the app
       inherits the DEVELOPER'S terminal environment, where claude is already on
       PATH. That branch has never actually been taken.
     - node-pty is a native module and a .node binary cannot be required out of
       an asar archive. There is no asar under npm run dev.

   Three deliberate distortions, each guarding something:
     1. A stripped PATH, emulating launchd. Without it the check proves nothing.
     2. A throwaway --user-data-dir, so this can never read or write the real
        layout.json. Same rule as "the verify suites must never touch the
        production socket".
     3. TC_TMUX_SOCKET pointed at a scratch socket, so a smoke run cannot spawn
        sessions on — or kill-server — the socket a real packaged app uses. */
const { execFileSync, spawn } = require('node:child_process')
const { mkdtempSync, rmSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { buildConfig } = require('../build/builder-config.cjs')

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const ROOT = join(__dirname, '..')
const config = buildConfig()

/* Deliberately contains a SPACE, like every real macOS userData path
   (~/Library/Application Support/...). The pane-died hook's redirect target
   shipped unquoted through eight task reviews because every fixture used a
   space-free path. */
const USER_DATA = mkdtempSync(join(tmpdir(), 'tc packaged '))
const SOCKET = 'terminal-canvas-verify-packaged'

let child = null
function cleanup() {
  if (child && child.exitCode === null) {
    try { child.kill('SIGKILL') } catch { /* already gone */ }
  }
  // SIGKILL means before-quit never ran, so no shutdown() and no kill-server.
  // Tear the scratch server down by hand instead of leaving it running.
  try {
    execFileSync('tmux', ['-L', SOCKET, 'kill-server'], { stdio: 'ignore', timeout: 5000 })
  } catch { /* no tmux, or no server on that socket — both fine */ }
  rmSync(USER_DATA, { recursive: true, force: true })
}
process.on('exit', cleanup)

;(async () => {
  // ---- Build --------------------------------------------------------------
  console.log('building (this takes minutes) ...')
  let built = true
  let buildError = ''
  try {
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
    execFileSync(
      'npx',
      ['electron-builder', '--config', 'electron-builder.config.cjs', '--dir', '--mac'],
      { cwd: ROOT, stdio: 'inherit' }
    )
  } catch (error) {
    built = false
    buildError = String((error && error.message) || error)
  }
  ok('1 electron-builder produces a bundle', built, buildError)
  if (!built) return finish()

  // The binary path is DERIVED from the same config the builder used, so
  // productName lives in exactly one place. macOS puts the executable at
  // Contents/MacOS/<productName>.
  const appPath = join(ROOT, config.directories.output, 'mac-arm64', `${config.productName}.app`)
  const binary = join(appPath, 'Contents', 'MacOS', config.productName)
  ok('2 the .app bundle is where the config says it is', existsSync(binary), binary)
  if (!existsSync(binary)) return finish()

  // ---- Launch -------------------------------------------------------------
  // A PATH with nothing on it that a login shell would have added. This is the
  // launchd condition, and the whole reason shell-env.ts exists.
  const STRIPPED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
  child = spawn(binary, [`--user-data-dir=${USER_DATA}`], {
    cwd: ROOT,
    env: {
      HOME: process.env.HOME,
      SHELL: process.env.SHELL,
      USER: process.env.USER,
      PATH: STRIPPED_PATH,
      TC_TMUX_SOCKET: SOCKET
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let out = ''
  child.stdout.on('data', (b) => { out += b.toString() })
  child.stderr.on('data', (b) => { out += b.toString() })

  let exitedEarly = null
  child.on('exit', (code) => { exitedEarly = code })

  // Wait for both signals, or 60s. A packaged first launch does real work —
  // resolveShellEnv runs $SHELL -ilc env, probeTmux starts a server, and the
  // renderer has to boot and put a panel live before anything spawns.
  const deadline = Date.now() + 60_000
  const seen = () => /\[startup\] /.test(out) && /\[pty\] spawned /.test(out)
  while (Date.now() < deadline && !seen() && exitedEarly === null) {
    await new Promise((r) => setTimeout(r, 500))
  }

  // 3. THE ASAR CHECK, in its bluntest form. session-backend.ts imports
  // node-pty at module scope, so a .node binary trapped inside the archive
  // throws during import and the app dies before it ever renders.
  ok('3 the packaged app stays up long enough to report',
    exitedEarly === null, `exited early with code ${exitedEarly}\n${out.slice(-2000)}`)

  const startup = (out.match(/\[startup\] .*/) || [''])[0]

  // 4. It knows it is packaged. A false here means the suite launched the dev
  // build or an unpackaged directory, and every check below would be measuring
  // the wrong app.
  ok('4 the launched app reports itself packaged', /packaged=true/.test(startup), startup)

  // 5. LAUNCHD'S BARE PATH, RECOVERED. The stripped PATH above contains only
  // system directories; a resolved PATH that adds nothing to it means
  // resolveShellEnv fell back rather than succeeding, and every agent CLI in
  // the app would be "command not found" — the exact defect that module was
  // written for, observable here for the first time.
  {
    const match = /PATH=(.*)$/.exec(startup)
    const resolved = match ? match[1].split(':').filter(Boolean) : []
    const stripped = new Set(STRIPPED_PATH.split(':'))
    const gained = resolved.filter((p) => !stripped.has(p))
    ok('5 the login-shell probe recovered a PATH launchd never gave it',
      gained.length > 0, `gained=${JSON.stringify(gained.slice(0, 5))} startup=${startup}`)
  }

  // 6. The socket override reached the resolver, which is what kept this run
  // off the real packaged app's server.
  ok('6 the packaged app used the scratch socket',
    startup.includes(`socket=${SOCKET}`), startup)

  // 7. A backend was chosen and NAMED. Either kind is a pass — tmux is
  // optional and its absence is a documented degradation — but a missing
  // reason is the silent fallback the loud warning exists to prevent.
  {
    const match = /backend=(tmux|direct) \(([^)]+)\)/.exec(startup)
    ok('7 a backend was chosen and says why',
      match !== null && match[2].trim().length > 0, startup)
  }

  // 8. THE END-TO-END PROOF. A real PTY, spawned by a real packaged app, with
  // node-pty's native binding loaded out of the UNPACKED asar. Everything
  // above can pass with a broken pty layer; this cannot.
  // Greps PtyManager.create's OWN log line, which has existed since M1 rather
  // than being added for this suite — so a regression that stops PTYs spawning
  // fails here even if nobody remembers this check exists.
  {
    const match = /\[pty\] spawned .*pid=(\d+)/.exec(out)
    ok('8 a PTY spawned in the packaged app',
      match !== null && Number(match[1]) > 0,
      match ? match[0] : out.slice(-2000))
  }

  finish()
})()

function finish() {
  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  cleanup()
  process.exit(failed.length ? 1 : 0)
}
```

- [ ] **Step 3: Run it, and expect to learn something**

Run: `npm run verify:packaged`
Expected on the first attempt: **not necessarily green.** This is the task where the spec's named risk gets settled. Read the failure before editing:

- **Check 3 fails with an early exit and a code-signature error** — this is the arm64 ad-hoc-signing risk from the spec's §4. Apple Silicon refuses to execute a binary carrying no signature at all. The fix is to give electron-builder an ad-hoc identity rather than none: in `build/builder-config.cjs`, replace `identity: null` with `identity: '-'` and add a comment recording that arm64 requires *a* signature, that `-` is ad-hoc, and that this is still unsigned in the Gatekeeper sense and still needs no account. Then update `verify:package` check 8 to assert the key is present and the value is one of `null` or `'-'`, keeping the absent-vs-present assertion intact — the point of that check is that signing is *decided*, not that it is disabled.
- **Check 3 fails with `Cannot find module 'node-pty'` or a `.node` load error** — the `files` globs excluded the production dependency. Add `'node_modules/**'` to `files` in the config and add a `verify:package` check asserting it.
- **Check 8 fails but 3–7 pass** — the app is up but no panel spawned. The likeliest cause is that 60s was not enough on a cold first launch, or that `firstRunPanels()` did not put a panel live. Raise the deadline once; if it still fails, run the binary by hand with the same env and watch stdout. Note that a *restored* panel would be dormant and would never spawn — but a throwaway `--user-data-dir` has no `layout.json`, so first run gives `firstRunPanels()`, which is not dormant. If that ever changes, this check needs a click, and it is the check that will tell you.

Whatever you find, fix it, re-run, and record the cause in the commit message. **Do not weaken a check to make it pass.**

- [ ] **Step 4: Confirm the default chain is unaffected**

Run: `npm run verify`
Expected: green, and it must **not** run `verify:packaged` — confirm by watching the output for the "building (this takes minutes)" line, which should never appear.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-packaged.cjs package.json build/builder-config.cjs
git commit -m "test(m5c): package for real, launch with a bare PATH, and watch a PTY spawn"
```

---

### Task 6: The documentation the next person needs

Three of these are load-bearing rather than descriptive: a suite outside the chain silently stops being run, the empty-canvas-on-first-launch surprise reads as data loss, and `CLAUDE.md`'s load-bearing-details section is where this repo records failures that are otherwise invisible.

**Files:**
- Modify: `README.md` (the M5c milestone row; the verify script list; the socket note)
- Modify: `CLAUDE.md` (the suite table; three new load-bearing details; the commands block)
- Modify: `docs/ideas-backlog.md` (the deferred app-icon note)

**Interfaces:**
- Consumes: everything Tasks 1–5 produced.
- Produces: nothing code depends on.

- [ ] **Step 1: README**

Change the M5c row's status cell to `✅ done`. Add to the verify script list:

```
npm run package             # the unsigned .app and .dmg, into release/
npm run verify:package      # the packaging config, as a value, plain node
npm run verify:packaged     # packages for real and launches it — NOT in verify
```

And add a paragraph to "Things that are non-obvious":

> **A packaged build is a separate installation.** `productName` is `Terminal Canvas`, and `app.getPath('userData')` derives from the app's name — so the packaged app has its own `layout.json`, its own presets and prompts, and its own tmux socket (`terminal-canvas-app`), none of which the `npm run dev` build can see. The first launch therefore opens on one fresh panel rather than on your dev canvas; that is the two installations being separate, not data loss. The socket half is not cosmetic: `before-quit` calls `shutdown()`, which is `kill-server`, so a shared socket would mean quitting either build destroyed the other build's running agents.

- [ ] **Step 2: CLAUDE.md — the suite table**

Add two rows in the same voice as the existing ones:

| Script | Runtime | Covers |
|---|---|---|
| `verify:package` | plain node | 10 checks against `build/builder-config.cjs`'s returned value: `node-pty` unpacked from the asar and the pattern depth-independent (1–2), `asar` actually on (3), the `files` globs (4–5), app identity and output dir (6–7), signing explicitly *decided* rather than unmentioned (8), targets and architecture (9), and the arch being a parameter rather than a constant (10) |
| `verify:packaged` | real Electron, **not in `npm run verify`** | 8 checks: packages with `electron-builder --dir` and launches the produced binary with a stripped `PATH`, a throwaway `--user-data-dir` and a scratch `TC_TMUX_SOCKET`. Asserts the app survives startup (3 — the asar/`node-pty` proof), reports itself packaged (4), recovered a PATH launchd never gave it (5 — the first time `shell-env.ts`'s reason for existing has ever been observed), used the scratch socket (6), named a backend and a reason (7), and actually spawned a PTY (8). Kept out of the default chain because it rebuilds native modules and reaches electron-builder's cache — minutes, plus a network dependency — and the repo's one green-or-not signal must stay fast and offline. It is the **pre-release gate**; run it before cutting a build |

Also add `npm run package` to the Commands block at the top.

- [ ] **Step 3: CLAUDE.md — three load-bearing details**

Add to the "Load-bearing details" section:

> **The packaging config is a function, not a blob (`build/builder-config.cjs`).** A `"build"` key in `package.json` or an `electron-builder.yml` has no *function* in it, so any check written against one reads JSON and compares it to itself. `buildConfig(opts)` returns the config, which is what lets `verify:package` assert "`node-pty` is unpacked" as a property of a computation in the cheapest tier the repo has. It is plain CJS in a TypeScript-first repo on purpose: electron-builder loads it itself, at build time, in a process nothing here can put esbuild in front of — and the payoff is that `verify-package.cjs` is the one plain-node suite needing no esbuild entry, because the module is import-free. Keep it import-free; requiring anything from `src/` drags the TypeScript build into the config load.

> **`asarUnpack` is the difference between an app and a demo (`build/builder-config.cjs`).** `node-pty` is a native module, and a `.node` binary cannot be `require`d out of an asar archive. Get it wrong and the app launches, renders the canvas, shows its first panel, and dies at the first `pty:create` — the latest and quietest failure this codebase can produce. The pattern is anchored `**/node_modules/node-pty/**` rather than at the root so it keeps matching if npm hoists `node-pty` to a nested depth; a root-anchored pattern stops matching silently, months later, with no code change to blame. `verify:package` 1–2 pin both halves and `verify:packaged` 8 is the end-to-end proof.

> **A packaged build must not share a tmux server with a dev build (`tmux-args.ts`'s `resolveSocket`, `main/index.ts`).** `before-quit` calls `shutdown()`, which is `kill-server` on the private socket, so a shared socket means quitting either build destroys the other's running agents — the exact outcome M4c exists to prevent, arriving through a door M4c could not see, because nothing before M5c made two simultaneous instances plausible. `TMUX_SOCKET` stays `'terminal-canvas'` and stays every builder's default, so `verify:tmux` check 9 is untouched; packaged resolves to `'terminal-canvas-app'`. The `TC_TMUX_SOCKET` override is a developer flag with no UI, and `verify:packaged` is why it exists. **A blank override must be treated as unset** (`verify:tmux` 23): `TC_TMUX_SOCKET=` in a shell is `''`, and tmux given an empty `-L` does not error — it falls back to the *default* socket, i.e. the user's own tmux server, which `shutdown()` would then `kill-server`. M5c also moved `start-server`'s argv out of `tmux-probe.ts` and into `buildStartServerArgs`: it was the one tmux argv in the codebase built by hand, which is exactly why check 9's list of socket-targeting argvs never mentioned it.

- [ ] **Step 4: The backlog note**

Add to `docs/ideas-backlog.md`, in the same voice as the surrounding entries:

> ## 76. An app icon
>
> M5c ships with Electron's default icon. That is a deliberate deferral, not an oversight:
> choosing an app icon is a design pass, and acquiring one as a side effect of "make it
> package" is how a placeholder becomes permanent.
>
> - **Cheap and self-contained:** an `.icns` under `build/`, which electron-builder picks up
>   from `directories.buildResources` with no config change at all.
> - **Constraint: it is the first visual asset this repo would own,** and there is currently
>   no place for one — every pixel in the app today is CSS or xterm.
> - **Nearest existing entry: none.** Distribution is absent from the original backlog; #74
>   is the only other M5c-adjacent entry and it covers updates, not appearance.

- [ ] **Step 5: Re-derive the counts you just wrote down**

`CLAUDE.md` warns twice about trusting stale numbers in its own prose, so check them rather than trusting the drafts above:

```bash
grep -c "^  ok(\|^{\?\s*ok(" scripts/verify-package.cjs
npm run verify:package | tail -3
npm run verify:tmux | tail -3
```
Expected: the suite table's "10 checks" and "8 checks" match what the suites actually print, and `verify:tmux` reports 25. Correct the table to whatever is true.

- [ ] **Step 6: Final full verification**

Run: `npm run verify`
Expected: every suite green.

Run: `npm run verify:packaged`
Expected: `8/8 passed`.

Run: `npm run package`
Expected: `release/Terminal Canvas-0.1.0-arm64.dmg` (or similarly named) exists.

- [ ] **Step 7: Commit**

```bash
git add README.md CLAUDE.md docs/ideas-backlog.md
git commit -m "docs(m5c): the two conditions dev cannot produce, and the suite that is not in the chain"
```
