# M6a: Panel Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a panel a name the user chose and a label main can vouch for, so a wall of identical rectangles becomes a wall of distinguishable ones.

**Architecture:** Two independent halves that meet in one line of JSX. The *user* half adds `Panel.title`, persists it through `layout-adapt.ts`, and sets it from the palette's existing rename input mode. The *honest* half stops the renderer discarding the resolved `command` and `cwd` that `pty:create` has carried since M4, and adds the one genuinely missing fact — whether the spawn reattached to a surviving tmux session — which costs a `has-session` probe because `new-session -A` deliberately erases that distinction.

**Tech Stack:** TypeScript, Electron, React 18 (no StrictMode), xterm 5.5, tmux, esbuild-bundled plain-node verify suites.

**Spec:** `docs/superpowers/specs/2026-08-26-m6-panel-legibility-design.md`

## Global Constraints

Every task's requirements implicitly include these. Each is copied from the spec or from `CLAUDE.md`, and each fails **silently** if broken.

- **The resolved command is a `PanelStatus` fact and is NEVER written back into `PanelSpec`.** M5a's absent-`command` rule survives four layers because nothing ever fills the absence in. Backfilling `spec.command` would make this a fifth, and every command-less preset would spawn a hardcoded shell instead of the user's login shell.
- **Absent stays absent.** Optional fields are added by conditional field-by-field rebuild (`...(x === undefined ? {} : { x })`), never by spreading an object, because a spread carries `x: undefined` across the IPC structured clone where `'x' in obj` then reads `true`.
- **Nothing here may add a new reason to bump `registry.version()`.** Title and resolved-command change at spawn, at reattach and at rename — all of which are status/panel-list changes the existing counter already covers.
- **M6a adds no new IPC channels.** It widens one existing type. If a task finds itself adding a channel, stop: that is a design change, not an implementation detail.
- **Every tmux session target uses exact match `=`.** A prefix-colliding target hitting the wrong session is the defect `verify:tmux` 19 exists for.
- **`npm run verify` must be green before any task is called done.** It is the whole verification story and it chains typecheck and build in the middle.
- **Commits:** conventional format scoped by milestone — `feat(m6a):`, `fix(m6a):`, `docs(m6a):`.
- **Comments explain *why*.** A non-obvious line without a reason attached will be "fixed" by someone later.

---

### Task 1: `Panel.title` round-trips through the layout format

The read half already exists and the write half does not, which is why a title set today would appear to work and be gone after relaunch. `layout-schema.ts:239` already parses `title` into `PersistedPanel`; `layout-adapt.ts` drops it in both directions.

**Files:**
- Modify: `src/renderer/panels/panels.ts` — add `title?` to `Panel`
- Modify: `src/renderer/panels/layout-adapt.ts:18-46` — carry it both ways
- Test: `scripts/verify-layout.cjs` (append checks 58–60)

**Interfaces:**
- Consumes: `PersistedPanel.title?: string` (already exists in `src/shared/layout-schema.ts`)
- Produces: `Panel.title?: string`, and `toPanels`/`fromPanels` preserving it. Tasks 6 and 7 read `Panel.title`; Task 5 renders it.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, immediately before the `console.log('\n' + '='.repeat(60))` summary block:

```js
// 58-60 — M6a. PersistedPanel.title has been PARSED since M4b and dropped on
//     the way out ever since: layout-adapt.fromPanels rebuilt the record field
//     by field and simply never mentioned it. A title would therefore survive
//     being typed, survive a save, and be gone after relaunch — the shape of
//     bug that reads as a working feature in review.
{
  const [panel] = L.toPanels([{
    id: 'p1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: ['-l'], title: 'auth refactor'
  }])
  ok('58 toPanels carries title in', panel.title === 'auth refactor')
}
{
  const [out] = L.fromPanels([{
    rect: { id: 'p1', x: 0, y: 0, w: 720, h: 460 },
    spec: { panelId: 'p1', cwd: '~', args: ['-l'] },
    z: 1,
    title: 'flaky test hunt'
  }])
  ok('59 fromPanels carries title out', out.title === 'flaky test hunt')
}
{
  // Absent must stay ABSENT, not become an explicit undefined. The same rule
  // `command` obeys two lines above it in the same function: a spread would
  // put `title: undefined` in layout.json, where `'title' in panel` reads true
  // and a later "does this panel have a name" test answers yes for a panel
  // with no name.
  const [out] = L.fromPanels([{
    rect: { id: 'p1', x: 0, y: 0, w: 720, h: 460 },
    spec: { panelId: 'p1', cwd: '~', args: ['-l'] },
    z: 1
  }])
  ok('60 an untitled panel writes no title key at all', !('title' in out))
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:layout`
Expected: FAIL on 58, 59 and 60 — 58 and 59 because `title` is `undefined`, 60 because `fromPanels` does not yet mention `title` and so *accidentally* passes. **60 passing at this point is expected and is not evidence of anything**; it becomes meaningful only once 59 forces the field to be written. Confirm 58 and 59 fail before proceeding.

- [ ] **Step 3: Add `title` to `Panel`**

In `src/renderer/panels/panels.ts`, inside `export interface Panel`, after `spec`:

```ts
  /**
   * A name the user typed. Optional because most panels never get one, and
   * because the fallback chain below it (resolved command, then "login shell")
   * is what an unnamed panel is supposed to show — see TerminalPanel's header.
   *
   * It lives on Panel rather than PanelSession because it is layout, not
   * session state: it survives a relaunch, it belongs to the id rather than to
   * the process, and a panel that has never spawned can still have one.
   */
  title?: string
```

- [ ] **Step 4: Carry it through both directions**

In `src/renderer/panels/layout-adapt.ts`, in `toPanels`, after `z: p.z`:

```ts
    z: p.z,
    ...(p.title === undefined ? {} : { title: p.title })
```

and in `fromPanels`, after the `command` line:

```ts
    ...(panel.spec.command === undefined ? {} : { command: panel.spec.command }),
    // Same absent-stays-absent rule as `command` directly above, and for the
    // same reason: a spread would write `title: undefined` into layout.json.
    ...(panel.title === undefined ? {} : { title: panel.title }),
    args: [...panel.spec.args]
```

- [ ] **Step 5: Run the checks and watch them pass**

Run: `npm run verify:layout`
Expected: PASS — 60/60.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/panels/panels.ts src/renderer/panels/layout-adapt.ts scripts/verify-layout.cjs
git commit -m "feat(m6a): the title M4b reserved finally survives a save"
```

---

### Task 2: `buildHasSessionArgs` — the argv that tells create from reattach

`new-session -A` attaches if the session exists and creates it if it does not. That one flag is the entire M4c reload-survival feature, and it is exactly what makes create and reattach indistinguishable. Asking first is the only way to tell them apart.

**Files:**
- Modify: `src/main/tmux-args.ts` (add `buildHasSessionArgs` beside `buildKillSessionArgs:245`)
- Test: `scripts/verify-tmux.cjs` (append check 26)

**Interfaces:**
- Consumes: `TmuxSocket`, `TMUX_SOCKET` (already exported from the same file)
- Produces: `buildHasSessionArgs(panelId: string, socket?: TmuxSocket): string[]` — consumed by Task 3.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-tmux.cjs`, before its summary block:

```js
// 26 — M6a. The exact-match `=` is the same rule check 19 pins for every kill
//     target, and it matters more here, not less: has-session without `=`
//     matches by PREFIX, so a panel `n1` would report a surviving session
//     whenever `n12` was running, and every fresh `n1` would claim to have
//     reattached to a session that was never its own.
{
  const args = T.buildHasSessionArgs('n1')
  ok('26 has-session targets the socket and matches exactly',
    args.includes('-L') &&
    args[args.indexOf('-L') + 1] === T.TMUX_SOCKET &&
    args.includes('has-session') &&
    args[args.indexOf('-t') + 1] === '=n1')
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run verify:tmux`
Expected: FAIL with `T.buildHasSessionArgs is not a function`.

- [ ] **Step 3: Implement it**

In `src/main/tmux-args.ts`, immediately after `buildKillSessionArgs`:

```ts
/**
 * Does this panel already own a running session?
 *
 * Needed only because `new-session -A` collapses create and reattach into one
 * call — the flag that made M4c cheap is the flag that erases the distinction
 * M6a wants to report. Asking costs one exec on a user-initiated spawn.
 *
 * The `=` is not decoration. Without it tmux matches by prefix, so panel `n1`
 * would report a surviving session whenever `n12` happened to be running, and
 * the chrome would claim a reattach that never occurred. Same rule as every
 * kill target in this file; see verify:tmux 19 and 26.
 */
export function buildHasSessionArgs(panelId: string, socket: TmuxSocket = TMUX_SOCKET): string[] {
  return ['-L', socket, 'has-session', '-t', `=${panelId}`]
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm run verify:tmux`
Expected: PASS — 27/27.

- [ ] **Step 5: Commit**

```bash
git add src/main/tmux-args.ts scripts/verify-tmux.cjs
git commit -m "feat(m6a): ask tmux whether the session was already there"
```

---

### Task 3: `SessionBackend.hasSession` and `reattached` on `PtyCreateResult`

**Files:**
- Modify: `src/shared/types.ts:46-51` — add `reattached` to `PtyCreateResult`
- Modify: `src/main/session-backend.ts` — `hasSession` on the interface and both backends
- Modify: `src/main/pty-manager.ts:73-144` — probe before spawn, store on `Session`, report in `create` and `list`
- Test: `scripts/verify-pty-manager.cjs` (append check 16)

**Interfaces:**
- Consumes: `buildHasSessionArgs(panelId, socket)` from Task 2
- Produces: `PtyCreateResult.reattached: boolean`; `SessionBackend.hasSession(panelId: PanelId): boolean`. Task 4 reads `reattached` off the create result.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-pty-manager.cjs`, inside the tmux branch that already guards on a found binary, before its summary block:

```js
// 16 — M6a. The first spawn creates; the second, after a detachAll that leaves
//     the tmux session running, must report that it ATTACHED. This is the
//     check that fails if hasSession is probed AFTER the spawn instead of
//     before — `new-session -A` will have created the session by then, so a
//     post-spawn probe answers true every single time and every panel claims
//     to have reattached, including on a cold start.
{
  const first = await mgr.create({ panelId: 'n-reattach', cwd: DIR, args: [], cols: 80, rows: 24 })
  ok('16 a fresh session reports reattached false', first.reattached === false)
  mgr.detachAll()
  const second = await mgr.create({ panelId: 'n-reattach', cwd: DIR, args: [], cols: 80, rows: 24 })
  ok('16b the same panel spawned again reports reattached true', second.reattached === true)
  mgr.kill('n-reattach')
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run verify:pty-manager`
Expected: FAIL on 16b — `reattached` is `undefined`, so `=== false` and `=== true` both fail. If the suite reports "skipped, no tmux binary", install tmux before continuing; this task cannot be verified without it.

- [ ] **Step 3: Widen the result type**

In `src/shared/types.ts`, in `PtyCreateResult`:

```ts
/** Returned by pty:create so the renderer can show what actually got spawned. */
export interface PtyCreateResult {
  panelId: PanelId
  pid: number
  command: string
  cwd: string
  /**
   * True when this attached to a tmux session that was already running rather
   * than creating one. Main's alone to know: `new-session -A` makes create and
   * reattach the same call, so it is answered by a has-session probe taken
   * BEFORE the spawn. Always false on the direct backend, which has no
   * sessions to outlive anything.
   */
  reattached: boolean
}
```

- [ ] **Step 4: Add `hasSession` to the backend interface and both implementations**

In `src/main/session-backend.ts`, on the `SessionBackend` interface, beside `list`:

```ts
  /**
   * Is there already a live session for this panel? Asked before spawn, not
   * after: `new-session -A` would have created it by then and the answer would
   * be true unconditionally.
   */
  hasSession(panelId: PanelId): boolean
```

In the direct backend's returned object:

```ts
    // No sessions outlive this process, so nothing can ever be reattached to.
    // Answering false is honest rather than a degradation — the same posture
    // as list() returning null here.
    hasSession: () => false,
```

In the tmux backend's returned object, beside `list()`:

```ts
    hasSession(panelId: PanelId): boolean {
      // `cli` swallows a non-zero exit and returns '' — which is exactly what
      // has-session does when the session is absent, and also what it does
      // when no server is running at all. Both mean "nothing to reattach to",
      // so the empty string is the correct negative and needs no special case.
      // execFileSync throws on non-zero, so a bare success is the only path
      // that returns a non-throwing result; we distinguish on that.
      try {
        execFileSync(o.tmuxPath, buildHasSessionArgs(panelId, socket), {
          encoding: 'utf8',
          timeout: 5000,
          stdio: 'ignore'
        })
        return true
      } catch {
        return false
      }
    },
```

Add `buildHasSessionArgs` to the existing import from `./tmux-args`.

- [ ] **Step 5: Probe before spawn and report it**

In `src/main/pty-manager.ts`, add `reattached: boolean` to the `Session` interface beside `command` and `cwd`. Then in `create`, between the `resolveCommand` line and the `spawn` line:

```ts
    const command = resolveCommand(spec, loginEnv)

    // BEFORE the spawn, not after. `new-session -A` creates the session if it
    // is missing, so a probe taken afterwards answers true unconditionally and
    // every panel — including one on a cold start — claims to have reattached.
    const reattached = this.getBackend().hasSession(spec.panelId)

    const proc = this.getBackend().spawn(spec, command, cwd, env)
```

Store it on the session (`reattached` beside `command, cwd`), and return it from `create`'s result object.

In `list()`, the local fallback reads it off the session, and the tmux backend's own `list()` sets it true:

```ts
    return [...this.sessions.values()].map((s) => ({
      panelId: s.panelId,
      pid: s.proc.pid,
      command: s.command,
      cwd: s.cwd,
      reattached: s.reattached
    }))
```

and in `session-backend.ts`'s tmux `list()` mapping, add:

```ts
        // Anything list() can see outlived whatever destroyed the last
        // renderer, so from the next renderer's point of view every one of
        // these is a reattach by definition.
        reattached: true
```

- [ ] **Step 6: Run the checks and watch them pass**

Run: `npm run verify:pty-manager`
Expected: PASS — 20/20.

- [ ] **Step 7: Typecheck, because this widened a shared type**

Run: `npm run typecheck`
Expected: PASS. Any error here is a `PtyCreateResult` literal somewhere that now lacks `reattached` — fix each at its source rather than making the field optional; optional would let a caller silently omit the fact and render "spawned" for a reattach.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/session-backend.ts src/main/pty-manager.ts scripts/verify-pty-manager.cjs
git commit -m "feat(m6a): main can finally tell a reattach from a fresh spawn"
```

---

### Task 4: `PanelStatus.running` stops discarding what main already sent

`pty:create` has carried the resolved `command` and `cwd` since M4, with a doc comment saying why — *"so the renderer can show what actually got spawned"* — and `session-registry.ts:137` throws both away on the next line.

**Files:**
- Modify: `src/renderer/session/panel-session.ts:13-18` — widen the `running` variant
- Modify: `src/renderer/session/session-registry.ts:137`
- Test: `scripts/verify-registry.cjs` (append check 20)

**Interfaces:**
- Consumes: `PtyCreateResult.reattached` from Task 3
- Produces: `PanelStatus` `running` variant carrying `pid`, `command`, `cwd`, `reattached`. Task 5 renders it.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-registry.cjs`, before its summary block. The suite drives the registry against a fake bridge, so the fake's `create` is where the resolved values come from:

```js
// 20 — M6a. The registry received the resolved command and cwd from the very
//     first M4 build and stored only the pid, so the header had nothing to
//     render but the SPEC's command — which is absent for every login-shell
//     panel. This is the check that fails if the widening is reverted.
//
//     The fake's create is overridden rather than used as-is on purpose: the
//     default returns `command: spec.command`, so a registry that wrongly read
//     the SPEC instead of the RESULT would pass against it. The resolved value
//     here is deliberately DIFFERENT from the spec's, and the spec's command
//     is absent, which is the real-world case.
{
  const bridge = fakeBridge()
  const factory = fakeFactory()
  bridge.pty.create = async () => ({
    panelId: 'p1',
    pid: 4242,
    command: '/opt/homebrew/bin/fish',
    cwd: '/Users/x/proj',
    reattached: true
  })
  const registry = createRegistry({ bridge, factory })
  registry.ensure('p1', { panelId: 'p1', cwd: '~', args: [] })
  registry.setTier('p1', 'live')
  registry.attachSlot('p1', factory.made.get('p1'))
  await tick()
  await tick()
  const st = registry.get('p1').status
  ok('20 running status carries what main resolved, not what the spec asked for',
    st.kind === 'running' && st.pid === 4242 &&
    st.command === '/opt/homebrew/bin/fish' &&
    st.cwd === '/Users/x/proj' && st.reattached === true,
    JSON.stringify(st))
}
```

> `attachSlot`'s second argument and the number of `tick()`s needed to settle a spawn are whatever the surrounding checks in `verify-registry.cjs` already use — checks 3 and 7 drive the same promote-and-spawn path. Copy their sequence exactly rather than inventing one; `create` is a promise and a single `tick()` may not be enough.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run verify:registry`
Expected: FAIL — `st.command` is `undefined`.

- [ ] **Step 3: Widen the status variant**

In `src/renderer/session/panel-session.ts`:

```ts
export type PanelStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | {
      kind: 'running'
      pid: number
      /**
       * What main ACTUALLY spawned, not what the spec asked for. The spec's
       * command is optional and absent means "the login shell", which only
       * main can name — so for every default panel this is the only honest
       * label that exists anywhere in the renderer.
       *
       * It is deliberately NOT copied back into PanelSpec. Filling in the
       * absence would make this a fifth place M5a's absent-command rule can be
       * lost, and every command-less preset would start spawning a hardcoded
       * shell.
       */
      command: string
      cwd: string
      /** Attached to a session that was already running. See PtyCreateResult. */
      reattached: boolean
    }
  | { kind: 'exited'; code: number }
  | { kind: 'error'; message: string }
```

- [ ] **Step 4: Stop discarding it**

In `src/renderer/session/session-registry.ts`, replace line 137:

```ts
        session.status = {
          kind: 'running',
          pid: result.pid,
          command: result.command,
          cwd: result.cwd,
          reattached: result.reattached
        }
```

- [ ] **Step 5: Run the checks and watch them pass**

Run: `npm run verify:registry`
Expected: PASS — 25/25.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/session/panel-session.ts src/renderer/session/session-registry.ts scripts/verify-registry.cjs
git commit -m "feat(m6a): stop throwing away the answer main already sent"
```

---

### Task 5: The panel header says what actually spawned

**Files:**
- Modify: `src/renderer/components/TerminalPanel.tsx:6-27` (props) and `:126-131` (the label)
- Modify: `src/renderer/canvas/Canvas.tsx` — pass `title` down where `rect`/`z`/`selected` already go
- Test: `scripts/verify-panels.cjs` (append check 44)

**Interfaces:**
- Consumes: `PanelStatus.running.command` from Task 4, `Panel.title` from Task 1
- Produces: a `.panel__title` whose text is `title ?? status.command ?? spec.command ?? 'login shell'`. Task 7's check reads it.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-panels.cjs`, before its summary block:

```js
// 44 — M6a. A panel whose SPEC has no command is the default case — every
//     Cmd+N panel and the built-in login-shell preset — and its header printed
//     the literal string "login shell" for the whole life of the app. Main has
//     known the real answer since M4. This asserts the header shows a resolved
//     absolute path, not the stand-in.
{
  const label = await wc.executeJavaScript(
    `document.querySelector('.panel .panel__title')?.textContent ?? ''`
  )
  ok('44 the header names what main resolved, not the stand-in',
    label !== 'login shell' && label.startsWith('/'))
}
```

> This check must run against a panel that has actually SPAWNED. Place it after an existing check that promotes a panel to live and awaits its status, and reuse that panel rather than seeding a new one.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL — the label reads `login shell`. The build is required: this suite loads `out/renderer/index.html`, so running it against a stale `out/` tests the previous commit.

- [ ] **Step 3: Take the title as a prop**

In `src/renderer/components/TerminalPanel.tsx`, add to `TerminalPanelProps` after `z`:

```ts
  /**
   * The user's name for this panel, if they set one. A prop rather than a
   * field on PanelSession because it is LAYOUT — it belongs to the id, it
   * survives a relaunch, and a panel that never spawned can have one.
   * Passing it as a prop also means memo sees it change; the session is
   * mutated in place and would not.
   */
  title?: string
```

- [ ] **Step 4: Render the chain**

Replace the label and its comment at `:126-131`:

```tsx
        {/* The honest chain, most specific first. `status.command` is what
            main ACTUALLY spawned — the renderer cannot resolve it, because
            electron-vite compiles process.env here down to {} — so for every
            login-shell panel it is the only true answer in the renderer.
            `spec.command` remains as the pre-spawn fallback: a dormant or
            never-promoted panel has no status to read, and showing the
            command it WILL run is better than showing nothing. */}
        <span className="panel__title">
          {title ??
            (session.status.kind === 'running' ? session.status.command : undefined) ??
            session.spec.command ??
            'login shell'}
        </span>
```

- [ ] **Step 5: Pass it down**

In `src/renderer/canvas/Canvas.tsx`, at the `<TerminalPanel .../>` call site, add `title={panel.title}` beside the existing `rect={panel.rect}` / `z={panel.z}`.

- [ ] **Step 6: Run the checks and watch them pass**

Run: `npm run build && npm run verify:panels`
Expected: PASS — 46/46.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/TerminalPanel.tsx src/renderer/canvas/Canvas.tsx scripts/verify-panels.cjs
git commit -m "feat(m6a): the header stops guessing"
```

---

### Task 6: The rename row in the palette's command list

`commands.ts` is pure — rows in, `Command[]` with disabled reasons out — which is what lets this be tested without mounting anything.

**Files:**
- Modify: `src/renderer/palette/commands.ts` — `PanelRow`, `PaletteActions`, a new row, a new reason
- Test: `scripts/verify-palette.cjs` (append checks 31–32)

**Interfaces:**
- Consumes: `PaletteContext`, `Command`, `withReason`, `REASON_NO_FOCUS` (all already in `commands.ts`)
- Produces: `PaletteActions.beginRenamePanel(id: string, currentTitle: string): void`; `PanelRow.title?: string`; a command with id `panel.rename.<id>`. Task 7 implements the action.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-palette.cjs`, before its summary block:

```js
// 31-32 — M6a. The rename row is aimed at capturedId, NOT at the row's own
//     panel: the palette captures focusedId on open and deliberately never
//     clears it, and every panel-acting command targets the panel the user was
//     in. With nothing focused the row must stay VISIBLE with its reason — a
//     row that disappears is indistinguishable from a feature that is missing.
{
  const row = byId(
    P.buildCommands(ctx({ capturedId: null, panels: [{ id: 'p1', label: 'p1' }] })),
    'panel.rename'
  )
  ok('31 rename stays visible with a reason when nothing is focused',
    row !== undefined && row.disabledReason === P.REASON_NO_FOCUS)
}
{
  const c = ctx({
    capturedId: 'p1',
    panels: [{ id: 'p1', label: 'p1', title: 'auth refactor' }]
  })
  const row = byId(P.buildCommands(c), 'panel.rename')
  row.run()
  ok('32 rename is runnable, echoes the current name, and acts on the captured panel',
    row.disabledReason === undefined &&
    row.subtitle.includes('auth refactor') &&
    c.actions.calls[0][0] === 'beginRenamePanel' &&
    c.actions.calls[0][1] === 'p1' &&
    c.actions.calls[0][2] === 'auth refactor')
}
```

`spyActions()` — which `ctx` installs by default — records every call as
`[name, ...args]` in `.calls`, which is how check 6 already asserts
`beginRenamePreset`. It must learn the new action name; add `beginRenamePanel`
to it in the same place its siblings are listed, or `row.run()` throws.

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run verify:palette`
Expected: FAIL on both — `row` is `undefined`.

- [ ] **Step 3: Widen `PanelRow` and `PaletteActions`**

In `src/renderer/palette/commands.ts`:

```ts
export interface PanelRow {
  id: string
  label: string
  /** The user's name for it, if set. Shown so the rename row can echo it. */
  title?: string
}
```

and on `PaletteActions`, beside `beginRenamePreset`:

```ts
  beginRenamePanel(id: string, currentTitle: string): void
```

- [ ] **Step 4: Build the row**

In `buildCommands`, in the Panel group — after the existing `panel.goto.*` loop, so construction order keeps it grouped with the panels (`filterCommands` sorts stably, so construction order *is* the grouping):

```ts
  {
    const target = ctx.panels.find((p) => p.id === ctx.capturedId)
    out.push(
      withReason(
        {
          id: 'panel.rename',
          title: 'Rename panel…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          run: () => actions.beginRenamePanel(ctx.capturedId!, target?.title ?? '')
        },
        // Aimed at the CAPTURED panel, not at a row's own panel: opening the
        // palette moves DOM focus to the input but deliberately leaves
        // focusedId alone, and that captured id is what every panel-acting
        // command targets.
        ctx.capturedId === null ? REASON_NO_FOCUS : undefined
      )
    )
  }
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npm run verify:palette`
Expected: PASS — 32/32.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/palette/commands.ts scripts/verify-palette.cjs
git commit -m "feat(m6a): a rename row aimed at the panel the palette captured"
```

---

### Task 7: Renaming a panel end to end

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx` — implement `beginRenamePanel`, feed `title` into `panelRows`
- Test: `scripts/verify-panels.cjs` (append checks 45–46)

**Interfaces:**
- Consumes: `beginRenamePanel` from Task 6; the existing `setInputMode` machinery at `Canvas.tsx:964-976`; `Panel.title` from Task 1
- Produces: a rename that reaches `setPanels`, pushes one history entry, and persists.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`:

```js
// 45-46 — M6a. A rename is a COMMITTED gesture, so it pushes exactly one
//     history entry — the same rule a drag obeys, for the same reason: an
//     entry per keystroke would make one rename take a dozen Cmd+Z presses to
//     unwind while every final-state assertion still passed.
//
//     Note the nativeSet dance below, copied from check 38 and load-bearing
//     for the same reason: React's controlled <input> IGNORES a plain
//     input.value = x. Only the prototype's native setter plus a dispatched
//     'input' event reaches React's state, so a check written the obvious way
//     types into a field the component never learns about, submits an empty
//     string, and fails for a reason that has nothing to do with renaming.
{
  const titleOf = () => wc.executeJavaScript(
    `document.querySelector('.panel .panel__title')?.textContent ?? ''`)

  await wc.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
  await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)

  const ran = await wc.executeJavaScript(`(async () => {
    const nativeSet = (input, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, v)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    nativeSet(document.querySelector('.palette__input'), 'rename panel')
    await new Promise((r) => setTimeout(r, 50))
    const row = [...document.querySelectorAll('.palette__row')]
      .find((r) => r.textContent.includes('Rename panel'))
    if (!row) return 'no rename-panel row'
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 100))
    const field = document.querySelector('.palette__input')
    if (!field) return 'no input after entering rename mode'
    nativeSet(field, 'auth refactor')
    await new Promise((r) => setTimeout(r, 50))
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    return 'ok'
  })()`)

  const landed = ran === 'ok' &&
    Boolean(await waitUntil(async () => (await titleOf()) === 'auth refactor', 3000))
  ok('45 a rename from the palette reaches the panel header', landed, `ran=${ran}`)

  wc.send('edit:undo')
  const undone = Boolean(await waitUntil(async () => (await titleOf()) !== 'auth refactor', 3000))
  ok('46 one Cmd+Z undoes the whole rename', landed && undone)
}
```

Run the row with a dispatched `mousedown` rather than `Enter`, as above:
`verify:panels` 41 established that a mouse-picked row is the path that also
proves the palette's own mousedown guard is intact, and the row's text is a
stable target where the selected index is not.

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL on 45 — `beginRenamePanel` is not implemented, so the row's `run()` throws or does nothing.

- [ ] **Step 3: Implement the action**

In `src/renderer/canvas/Canvas.tsx`, in the same object literal that holds `beginRenamePreset` (around `:964`):

```ts
    beginRenamePanel: (id, currentTitle) => {
      setInputMode({
        label: 'Name this panel…',
        initial: currentTitle,
        submit: (value) => {
          const name = value.trim()
          setPanels((prev) => {
            const next = prev.map((p) =>
              p.rect.id === id
                // Rebuilt field by field rather than spread-with-override so
                // that clearing a name REMOVES the key instead of setting it
                // to undefined — the same absent-stays-absent rule fromPanels
                // obeys, enforced here so the undefined never gets that far.
                ? name === ''
                  ? { rect: p.rect, spec: p.spec, z: p.z }
                  : { rect: p.rect, spec: p.spec, z: p.z, title: name }
                : p
            )
            // One entry for the whole gesture, on commit — the rule a drag
            // already follows. Pushing per keystroke would make one rename
            // take a dozen Cmd+Z presses to unwind.
            commitHistory(next)
            return next
          })
          setInputMode(null)
        }
      })
      // Same reason beginRenamePreset does this: Palette.tsx closes the
      // overlay BEFORE running a row's command, so without reopening, the mode
      // would be set on a palette that is already gone.
      palette.openPalette()
    },
```

`commitHistory` is `Canvas.tsx`'s existing `useCallback` wrapper around
`setHistory((h) => pushHistory(h, next))`. Calling it from inside a `setPanels`
updater is not an invention here — it is exactly what the drag's `onCommit`
does (`Canvas.tsx:633-636`), and for the same reason: it reads the settled
array out of the updater rather than closing over a stale `panels` from
render. Do **not** add a second history path.

Heed the standing warning above `commitHistory`'s definition while you are
here: this whole call chain is safe *only* because the app runs without
`StrictMode`, which would double-invoke the updater and push twice.

- [ ] **Step 4: Feed `title` into the palette's panel rows**

Find the `panelRows` memo — it is keyed on `palette.open` and reads out of `panelsRef`, deliberately, so a drag behind an open palette does not re-seat the selection at 60Hz. Add `title` to each row it builds, and change nothing else about its dependencies.

- [ ] **Step 5: Run them and watch them pass**

Run: `npm run build && npm run verify:panels`
Expected: PASS — 48/48.

- [ ] **Step 6: Confirm it persists**

Run: `npm run dev`, rename a panel, quit with `Cmd+Q`, relaunch.
Expected: the name is still there. Then check the file directly:

```bash
grep -o '"title":"[^"]*"' ~/Library/Application\ Support/terminal-canvas/layout.json
```

Expected: the title you typed. If the key is absent, Task 1's `fromPanels` half did not land.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/canvas/Canvas.tsx scripts/verify-panels.cjs
git commit -m "feat(m6a): name a panel, and have it still be named tomorrow"
```

---

### Task 8: Documentation catches up

`CLAUDE.md` is the file a future session reads instead of re-deriving the invariants, and it is wrong the moment a milestone lands without it.

**Files:**
- Modify: `README.md:187-198` — the milestone table
- Modify: `CLAUDE.md` — the verify table, the architecture notes, one new load-bearing detail

- [ ] **Step 1: Add M6a to the milestone table**

In `README.md`, after the M5c row:

```markdown
| M6a | Panel identity: user titles, and chrome that says what main resolved | ✅ done |
```

- [ ] **Step 2: Update the verify suite counts**

In `CLAUDE.md`'s suite table, update the counts this milestone changed, re-deriving each from the suite's own output rather than from arithmetic on the old number:

```bash
npm run verify:layout | tail -3
npm run verify:tmux | tail -3
npm run verify:palette | tail -3
npm run verify:registry | tail -3
npm run verify:pty-manager | tail -3
npm run verify:panels | tail -3
```

- [ ] **Step 3: Add the load-bearing detail**

In `CLAUDE.md`'s "Load-bearing details", add:

```markdown
**`reattached` costs a probe because `-A` erased the question
(`tmux-args.ts`'s `buildHasSessionArgs`, `pty-manager.ts`'s `create`).** M4c's
entire reload-survival feature is one flag: `new-session -A` attaches if the
session exists and creates it if it does not, so create and reattach are the
same call and `session-backend.ts` says outright that "the renderer never
learns reattachment exists". M6a wants to say so in the chrome, which means
asking `has-session` **before** the spawn — after it, `-A` has already created
the session and the answer is `true` for every panel including a cold start,
so the chrome would claim a reattach that never happened, on every launch,
with nothing in any log. `verify:pty-manager` 16/16b are the two halves, and
they only separate the two implementations because 16 runs on a *fresh*
session. The `=` on the target is the same exact-match rule every kill target
obeys; without it panel `n1` reports a surviving session whenever `n12` is
running.

**The header's honest chain, and the backfill that must never happen
(`TerminalPanel.tsx`).** The label is
`title ?? status.command ?? spec.command ?? 'login shell'`. The second link is
the one that took two milestones to connect: `pty:create` has returned the
resolved command and cwd since M4 — its doc comment says "so the renderer can
show what actually got spawned" — and `session-registry.ts` stored only the
pid, so the header had nothing but the SPEC's command, which is absent for
every login-shell panel. The resolved value lives on `PanelStatus` and is
**never copied back into `PanelSpec`**: doing so would make it a fifth place
M5a's absent-`command` rule can be lost, and every command-less preset would
spawn a hardcoded shell instead of the user's real one. `verify:registry` 20
is the check that fails if the widening is reverted.
```

- [ ] **Step 4: Run the whole suite**

Run: `npm run verify`
Expected: green. This is the gate — do not claim M6a done without it.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs(m6a): CLAUDE.md catches up to M6a landing"
```

---

## What M6a deliberately leaves undone

Recorded here so the next plan does not treat them as oversights:

- **The cwd is resolved at spawn, not live.** A panel that `cd`s elsewhere still reports where it started. That is backlog #41, and it is tmux-only.
- **`reattached` is captured but not yet rendered.** Task 3 carries it to `PanelStatus` and Task 5's chain does not mention it. Surfacing it — a badge, or a header suffix — is a design question about chrome density that belongs beside M6c's glow, where the panel's visual state is being decided anyway.
- **Nothing infers a default title.** Backlog #6's "nice follow-on: default it to something inferred" is deliberately not here: the cwd basename is the obvious candidate and it is exactly the value #41 says is stale.
