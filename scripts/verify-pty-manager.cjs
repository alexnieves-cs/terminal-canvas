/* Unit-verifies the real PtyManager class under Electron's exact ABI.
   Run with: npm run verify:pty-manager

   Unlike verify-pty.cjs, which exercises node-pty directly, this bundles
   src/main/pty-manager.ts and drives the actual shipped class. Session
   lifecycle is where the subtle bugs live: an OS process exits milliseconds
   after we asked it to, and by then the panel may have been recreated. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync, realpathSync } = require('node:fs')
const { tmpdir } = require('node:os')

/* THE FENCE, at MODULE SCOPE and not inside any one check.

   Every PtyManager this suite constructs resolves its Claude Code projects
   root ONCE, synchronously, in its own field initializer
   (`subagentWatch = new SubagentWatch(createFsWatchDeps())`), and
   resolveProjectsRoot() falls back to homedir()/.claude/projects when
   TC_CLAUDE_PROJECTS is unset. This suite's default `spec()` uses
   os.homedir() as the panel cwd, so with no override every manager here —
   including check 25's, whose whole subject is "this panel has NO Claude Code
   session" — polls the running developer's REAL ~/.claude/projects every two
   seconds and slugs straight to a directory that, on the machine this repo is
   developed on, genuinely exists.

   Two failures, and the loud one is not the worse one. A real session
   directory CREATED DURING THE RUN (this repo is developed with `claude` open
   in the very directory these fixture panels point at) post-dates the panel's
   spawn, so chooseSession accepts it, the claim confirms against a cwd that
   really does match, and check 25 goes red reporting subagents that belong to
   the developer's own conversation — a failure nothing in the suite explains
   and which does not reproduce on a machine without one. Quietly, and always,
   it is a per-tick read into a directory this repo does not own: the rule
   M9a's git fence and the prompt fence each cost a fix round to learn, and
   which panels-entry.cjs already states in full for the Electron tier.

   Checks 26 and 27 still set their own roots and restore what they found;
   what they restore to is now this fenced default rather than the real home.
   The path carries a SPACE for the reason every fixture path in this repo
   does — see the `pane-died` redirect bug. */
if (!process.env.TC_CLAUDE_PROJECTS || process.env.TC_CLAUDE_PROJECTS.trim() === '') {
  process.env.TC_CLAUDE_PROJECTS = mkdtempSync(join(tmpdir(), 'tc claude projects '))
}
console.log(`[verify:pty-manager] claude projects root: ${process.env.TC_CLAUDE_PROJECTS}`)

/** Absolute path or null. A GUI app has a bare PATH, so never rely on the name. */
function findTmux() {
  for (const p of ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux']) {
    if (existsSync(p)) return p
  }
  return null
}

const OUT = join(__dirname, '..', 'out', 'verify', 'pty-manager.cjs')
buildSync({
  // M18: pty-manager now transitively imports a real VALUE from @shared
  // (agent-args.ts's AGENT_FLAGS), where every main/* import from there used
  // to be an `import type` esbuild erased before resolving anything. See
  // CLAUDE.md's "The plain-node verify bundles now configure a @shared alias".
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') },
  entryPoints: [join(__dirname, '..', 'src', 'main', 'pty-manager.ts')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // node-pty is a native module; electron is only a type import here.
  external: ['node-pty', 'electron']
})
const { PtyManager } = require(OUT)

/* This suite's own tmux socket, never the production one.
   Check 15 calls shutdown(), which is `tmux kill-server`. Run against
   TMUX_SOCKET — as this suite did until a whole-branch review — and
   `npm run verify` with the app open destroys every agent the user has
   running. The socket is a defaulted parameter on every argv builder in
   tmux-args.ts precisely so this can differ here without weakening the
   production default; verify-tmux.cjs check 9 still pins that default. */
const { verifySocket } = require('./verify-socket.cjs')
/* Suffixed by TC_VERIFY_SUFFIX so two checkouts can verify at once without
   kill-server'ing each other's sessions; unset is the historic value, so a
   single checkout is unchanged. See verify-socket.cjs for why it is a suffix
   rather than a whole name. */
const VERIFY_SOCKET = verifySocket('terminal-canvas-verify')
console.log(`[verify:pty-manager] tmux socket: ${VERIFY_SOCKET}`)

const OUT_BACKEND = join(__dirname, '..', 'out', 'verify', 'session-backend.cjs')
buildSync({
  // M18: pty-manager now transitively imports a real VALUE from @shared
  // (agent-args.ts's AGENT_FLAGS), where every main/* import from there used
  // to be an `import type` esbuild erased before resolving anything. See
  // CLAUDE.md's "The plain-node verify bundles now configure a @shared alias".
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') },
  entryPoints: [join(__dirname, '..', 'src', 'main', 'session-backend.ts')],
  outfile: OUT_BACKEND,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
const { createDirectBackend, createTmuxBackend } = require(OUT_BACKEND)
const DIRECT = createDirectBackend('verify: direct by default')

// M17 fix-round checks 32/33 need the REAL readFrom — the function that
// actually carries the shrink-detection bug this fix round closes — against
// a transcript file this harness controls, rather than a real
// ~/.claude/projects this suite must not touch (the same rule the git and
// prompt fences in verify-panels.cjs already state). resolveTranscript is
// still substituted per-check, so the harness never globs a real directory.
const OUT_TRANSCRIPT = join(__dirname, '..', 'out', 'verify', 'transcript-reader.cjs')
buildSync({
  // M18: pty-manager now transitively imports a real VALUE from @shared
  // (agent-args.ts's AGENT_FLAGS), where every main/* import from there used
  // to be an `import type` esbuild erased before resolving anything. See
  // CLAUDE.md's "The plain-node verify bundles now configure a @shared alias".
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') },
  entryPoints: [join(__dirname, '..', 'src', 'main', 'transcript-reader.ts')],
  outfile: OUT_TRANSCRIPT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
const { readFrom: realReadFrom } = require(OUT_TRANSCRIPT)

// M18: agentArgs is the args assembly lifted out of create() so the argv can
// be checked in a cheap tier with no real `claude` anywhere — the same trade
// tmux-args.ts makes, and the reason it imports neither node-pty nor electron.
const OUT_AGENT_ARGS = join(__dirname, '..', 'out', 'verify', 'agent-args.cjs')
buildSync({
  entryPoints: [join(__dirname, '..', 'src', 'main', 'agent-args.ts')],
  outfile: OUT_AGENT_ARGS,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron'],
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})

const OUT_TMUX_ARGS = join(__dirname, '..', 'out', 'verify', 'tmux-args.cjs')
buildSync({
  // M18: pty-manager now transitively imports a real VALUE from @shared
  // (agent-args.ts's AGENT_FLAGS), where every main/* import from there used
  // to be an `import type` esbuild erased before resolving anything. See
  // CLAUDE.md's "The plain-node verify bundles now configure a @shared alias".
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') },
  entryPoints: [join(__dirname, '..', 'src', 'main', 'tmux-args.ts')],
  outfile: OUT_TMUX_ARGS,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* One full idleness tick plus margin. Check 17 counts `busy` sends only after
   this has elapsed past the idle transition, so an implementation that emitted
   per tick rather than per change has had at least one more chance to do so
   before the count is read. Mirrors pty-manager.ts's IDLE_TICK_MS (500) —
   deliberately restated rather than imported, since the bundle exports only
   the class. */
const IDLE_TICK_SETTLE_MS = 700

/**
 * Polls until predicate() is true, or gives up. Returns whether it became
 * true rather than throwing, so a failure is reported as a FAIL line with the
 * observed states attached rather than as a stack trace that says nothing
 * about what the detector actually did.
 *
 * The M6c checks need this instead of a fixed sleep because the two signals
 * they wait on have different latencies — a bell rides the next PTY read,
 * while an idle transition waits on a 500ms tick — and a sleep long enough
 * for the slower one makes the suite slower for no gain.
 */
async function waitFor(predicate, timeoutMs = 4000, stepMs = 25) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(stepMs)
  }
  return predicate()
}

/**
 * Stands in for the real WebContents seam and records what main sent.
 *
 * `options` threads M6c's two constructor getters through rather than letting
 * each check construct a PtyManager inline: the getters exist precisely so a
 * setting can change under a running manager, and three hand-rolled
 * constructions would be three places to forget one.
 */
function makeHarness(backend, options = {}) {
  const events = []
  const baseBackend = backend ?? DIRECT
  // Check 27's observation point: this suite's fake backend cannot see argv
  // any other way, since PtyManager hands the spec straight to
  // SessionBackend.spawn. Wrapping rather than adding a hook to PtyManager
  // itself keeps the seam here, where every other test-only hook in this
  // harness already lives.
  const effectiveBackend = options.onSpawnArgs
    ? {
        ...baseBackend,
        spawn: (spec, command, cwd, env) => {
          options.onSpawnArgs(spec.args)
          return baseBackend.spawn(spec, command, cwd, env)
        }
      }
    : baseBackend
  const manager = new PtyManager(
    () => ({
      isDestroyed: () => false,
      send: (channel, payload) => {
        events.push({ channel, payload })
        if (options.onSend) options.onSend(channel, payload)
      }
    }),
    () => effectiveBackend,
    () => options.idleAfterMs ?? 1500,
    () => options.bellEnabled ?? true,
    (panelId) => { if (options.onCaptureBaseline) options.onCaptureBaseline(panelId) },
    (panelId) => { if (options.onDropBaseline) options.onDropBaseline(panelId) },
    (panelId) => (options.pinnedSession ? options.pinnedSession(panelId) : undefined),
    (panelId, sessionId) => { if (options.setPinnedSession) options.setPinnedSession(panelId, sessionId) },
    (panelId) => { if (options.onDropPinnedSession) options.onDropPinnedSession(panelId) },
    // Undefined falls through to the constructor's own default (the real
    // implementations), exactly as every other optional dep above does —
    // only checks 32/33 substitute these, to drive pollUsage against a
    // transcript this harness controls rather than a real ~/.claude/projects.
    options.resolveTranscript,
    options.readFrom,
    // The flush byte cap. Undefined falls through to FLUSH_MAX_BYTES; only
    // backpressure.1/.2 force it low, so the elision they assert on is
    // deterministic rather than a race between the shell and the flush timer.
    options.flushMaxBytes,
    // M37. The worktree resolver; undefined means "no worktrees", as in a
    // harness that never asks. Only worktree.1-.3 pass one.
    options.worktreeFor
  )
  return { manager, events, exits: () => events.filter((e) => e.channel === 'pty:exit') }
}

const spec = (panelId, command = '/bin/sh', args = ['-c', 'sleep 30'], agent = undefined) => ({
  panelId,
  cwd: os.homedir(),
  command,
  args,
  agent,
  cols: 80,
  rows: 24
})

;(async () => {
  // 1. THE RACE: kill() deletes synchronously, but the OS process's onExit
  // lands milliseconds later. If the panel was recreated in that window, the
  // dead process's exit callback must not evict the live session.
  {
    const { manager } = makeHarness()
    await manager.create(spec('panel-a'))
    manager.kill('panel-a')
    const recreated = await manager.create(spec('panel-a'))
    await sleep(500) // let the first process's onExit land
    const live = manager.list()
    ok(
      '1 stale onExit does not evict a recreated session',
      live.length === 1 && live[0].panelId === 'panel-a' && live[0].pid === recreated.pid,
      `live=${JSON.stringify(live.map((s) => s.pid))} expected=[${recreated.pid}]`
    )
    manager.killAll()
  }

  // 2. A session evicted by a stale exit is unreachable: write/resize are
  // optional-chained no-ops, so the PTY is orphaned in silence.
  {
    const { manager } = makeHarness()
    await manager.create(spec('panel-b'))
    manager.kill('panel-b')
    await manager.create(spec('panel-b', '/bin/sh', ['-c', 'cat']))
    await sleep(500)
    const reachable = manager.write('panel-b', 'ping\n')
    ok('2 recreated session is still reachable by write', reachable === true, `write returned ${reachable}`)
    manager.killAll()
  }

  // 3. An intentional kill is not a process exit the panel should paint
  // "[process exited]" for. Only unrequested exits get reported.
  {
    const states = []
    const { manager, exits } = makeHarness(DIRECT, {
      onSend: (channel, payload) => {
        if (channel === 'agent:state') states.push(payload)
      }
    })
    await manager.create(spec('panel-c'))
    manager.kill('panel-c')
    await sleep(500)
    ok('3 kill() emits no spurious pty:exit', exits().length === 0, `${exits().length} exit event(s)`)
    // 3b. The agent-state 'exited' obeys the SAME guard, and until a
    //     whole-branch review it did not — it was sent from above the
    //     `if (session.killed) return`. The failure it produced is not an
    //     asymmetry anyone would notice locally: the renderer runs
    //     clearAgentState(id) at every dispose site, this send lands
    //     milliseconds LATER, and so it re-adds the entry after the cleanup —
    //     which onReset then hands to the brand-new panel, whose id is the
    //     constant FIRST_RUN_ID, as a red 'exited' border on a panel that has
    //     never run anything. Asserted as "no 'exited' for this panel", not
    //     "no agent:state at all", because 'starting' is legitimately sent at
    //     spawn and is not what the guard is about.
    ok('3b kill() emits no agent-state exit either',
      !states.some((s) => s.panelId === 'panel-c' && s.state === 'exited'),
      JSON.stringify(states))
  }

  // 4. Regression guard: a real, unrequested exit must still be reported
  // exactly once, and must still remove the session.
  {
    const { manager, exits } = makeHarness()
    await manager.create(spec('panel-d', '/bin/sh', ['-c', 'exit 7']))
    await sleep(600)
    const e = exits()
    ok(
      '4 unrequested exit reported exactly once with its code',
      e.length === 1 && e[0].payload.panelId === 'panel-d' && e[0].payload.exitCode === 7,
      JSON.stringify(e.map((x) => x.payload))
    )
    ok('4b exited session is removed from the map', manager.list().length === 0, `${manager.list().length} left`)
  }

  // 5. Regression guard: the last lines of output must be flushed before the
  // exit event, otherwise the error explaining the exit is dropped.
  {
    const { manager, events } = makeHarness()
    await manager.create(spec('panel-e', '/bin/sh', ['-c', 'echo LAST-LINE-42; exit 1']))
    await sleep(600)
    const dataIdx = events.findIndex((e) => e.channel === 'pty:data' && e.payload.data.includes('LAST-LINE-42'))
    const exitIdx = events.findIndex((e) => e.channel === 'pty:exit')
    ok('5 final output flushes before exit is announced', dataIdx !== -1 && exitIdx !== -1 && dataIdx < exitIdx,
      `data@${dataIdx} exit@${exitIdx}`)
  }

  // 6. Reload recovery: after killAll() the ids are free, so a fresh renderer
  // can create the same panelId instead of hitting "already has a live PTY".
  {
    const { manager } = makeHarness()
    await manager.create(spec('panel-f'))
    await manager.create(spec('panel-g'))
    manager.killAll()
    ok('6a killAll empties the session map', manager.list().length === 0, `${manager.list().length} left`)
    let recreateError = null
    try {
      await manager.create(spec('panel-f'))
    } catch (error) {
      recreateError = error
    }
    ok('6b same panelId can be recreated after killAll', recreateError === null, String(recreateError ?? 'no error'))
    manager.killAll()
  }

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

  // ---------------------------------------------------------------------
  // M6c: the detector at the choke point. These three need no tmux — they
  // are about PtyManager.enqueue, which every backend funnels through — so
  // they sit ABOVE the `if (!TMUX)` split rather than inside its else, the
  // same reasoning verify:panels 39 records for its own unconditional block:
  // a check that skips for a reason unrelated to what it covers is a check
  // that covers nothing on most machines.
  // ---------------------------------------------------------------------

  // 17. A panel that prints something reaches 'busy', and the state arrives on
  //     AGENT_STATE — not on PTY_DATA, and not by bumping anything the renderer
  //     already subscribes to.
  //
  //     And it arrives EXACTLY ONCE. That half is the one worth the extra
  //     wait: applyEvent's send-only-on-change dedupe IS the throttle the
  //     design rests on, and `states.some(... 'busy')` — which is all this
  //     check asserted until a whole-branch review — passes just as happily
  //     against an implementation that emitted on every 16ms flush and every
  //     500ms tick, i.e. against the 60Hz cascade the dedupe exists to
  //     prevent. A count is the only assertion that separates them.
  //
  //     The FIXTURE is what makes that count mean anything, and the obvious
  //     one does not: a single `printf hello` produces one PTY read, so an
  //     implementation with the dedupe deleted still emits exactly one busy
  //     and the check passes against the very thing it exists to catch (this
  //     was confirmed by deleting the dedupe and watching 17 stay green). So
  //     the fixture prints forty lines with a gap between each, comfortably
  //     more than one per 16ms flush: with the dedupe, that whole burst is
  //     ONE busy; without it, it is one per read plus one per tick.
  //
  //     The gap (20ms) stays well under idleAfterMs (200ms), so no legitimate
  //     busy -> idle -> busy round trip happens mid-burst for the count to
  //     mistake for a dedupe failure. And the count is taken only after the
  //     stream has demonstrably SETTLED — the check waits for the idle
  //     transition, which can only arrive once a full tick has found no
  //     output for idleAfterMs, and then waits one further tick.
  {
    const states = []
    const h = makeHarness(DIRECT, {
      onSend: (channel, payload) => {
        if (channel === 'agent:state') states.push(payload)
      },
      idleAfterMs: 200
    })
    await h.manager.create(spec('a1', '/bin/sh', [
      '-c',
      'i=0; while [ $i -lt 40 ]; do printf "line$i\n"; i=$((i+1)); sleep 0.02; done; sleep 5'
    ]))
    const seen = await waitFor(() => states.some((s) => s.panelId === 'a1' && s.state === 'busy'))
    // The settle: idle can only follow a tick that observed the absence of
    // output, so reaching it proves the stream is over rather than merely
    // paused between two reads of it.
    const settled = await waitFor(() => states.some((s) => s.panelId === 'a1' && s.state === 'idle'))
    await sleep(IDLE_TICK_SETTLE_MS)
    const busies = states.filter((s) => s.panelId === 'a1' && s.state === 'busy').length
    ok('17 output produces exactly one busy state on agent:state',
      seen && settled && busies === 1,
      `busies=${busies} ${JSON.stringify(states)}`)
    h.manager.kill('a1')
  }

  // 18. THE TRAP, end to end. A window-title sequence must produce no
  //     wants-you. This is the only check in the repo that proves the scanner
  //     is actually wired to the byte stream rather than merely correct in
  //     isolation — verify:agent-state 2 proves the function, this proves the
  //     wiring.
  {
    const states = []
    const h = makeHarness(DIRECT, {
      onSend: (channel, payload) => {
        if (channel === 'agent:state') states.push(payload)
      },
      idleAfterMs: 200
    })
    await h.manager.create(spec('a2', '/bin/sh', ['-c', "printf '\\033]0;a title\\007'; sleep 5"]))
    await sleep(600)
    // The first clause is the NON-VACUITY guard, and it has to name 'busy'
    // specifically. "no wants-you" is satisfied just as well by bytes that
    // never reached main at all, so this check is only worth anything if it
    // first proves the stream got here — and 'busy' is the one state in this
    // fixture that ONLY enqueue can produce. A bare `some(panelId === 'a2')`
    // stopped meaning that the moment create() began sending 'starting'
    // directly at spawn: that send happens before a single byte flows, so it
    // would satisfy the guard against a manager whose enqueue never ran.
    ok('18 a window title produces no wants-you',
      states.some((s) => s.panelId === 'a2' && s.state === 'busy') &&
        !states.some((s) => s.panelId === 'a2' && s.state === 'wants-you'),
      JSON.stringify(states))
    h.manager.kill('a2')
  }

  // 19. A REAL bell does produce wants-you, and typing into the panel clears
  //     it. Both halves matter: without the first the feature is inert, and
  //     without the second the state is sticky forever and M6d's queue never
  //     empties.
  {
    const states = []
    const h = makeHarness(DIRECT, {
      onSend: (channel, payload) => {
        if (channel === 'agent:state') states.push(payload)
      },
      idleAfterMs: 200
    })
    await h.manager.create(spec('a3', '/bin/sh', ['-c', "printf '\\007'; cat"]))
    const rang = await waitFor(() => states.some((s) => s.panelId === 'a3' && s.state === 'wants-you'))
    const before = states.length
    h.manager.write('a3', 'x')
    const cleared = await waitFor(
      () => states.length > before && states[states.length - 1].state !== 'wants-you'
    )
    ok('19 a real bell wants you, and typing clears it', rang && cleared,
      JSON.stringify(states))
    h.manager.kill('a3')
  }

  // ---------------------------------------------------------------------
  // M18 — the agent flag argv (ideas-backlog #8 part 1).
  //
  // These drive the PURE `agentArgs`, extracted out of create()'s own args
  // assembly for the reason tmux-args.ts is pure: an argv builder is testable
  // without a real `claude` on PATH, and a check that shelled out to one would
  // skip on every machine without it and quietly stop existing.
  // ---------------------------------------------------------------------
  {
    const A = require(OUT_AGENT_ARGS)

    // 35. Every knob is spelled correctly and the session id still leads.
    //     Spelling is the whole risk here: a flag `claude` has never heard of
    //     fails the spawn OUTRIGHT rather than being ignored, which is why
    //     pty-manager refuses to append flags to a command the user typed.
    const full = A.agentArgs(
      { agent: 'claude-code', args: [], agentOptions: { permissionMode: 'plan', effort: 'high', model: 'opus' } },
      'sess-1'
    )
    ok('35 every agent knob reaches the argv with its measured flag spelling',
      full.join(' ') === '--session-id sess-1 --permission-mode plan --effort high --model opus',
      JSON.stringify(full))

    // 36. A user-supplied flag wins, PER FLAG. One `includes` check covering
    //     all three (or none) is the plausible wrong implementation, and it is
    //     invisible: a duplicated flag makes the CLI reject the invocation
    //     outright, so the panel simply never starts — the same failure the
    //     --session-id guard beside it was written to prevent. The effort
    //     clause is what proves the suppression is per-flag rather than
    //     all-or-nothing.
    const userWins = A.agentArgs(
      {
        agent: 'claude-code',
        args: ['--permission-mode', 'acceptEdits'],
        agentOptions: { permissionMode: 'plan', effort: 'high' }
      },
      'sess-2'
    )
    const modes = userWins.filter((a) => a === '--permission-mode')
    ok('36 a user-supplied flag suppresses ours, per flag, without duplicating',
      modes.length === 1 &&
        userWins[userWins.indexOf('--permission-mode') + 1] === 'acceptEdits' &&
        userWins.includes('--effort') && userWins.includes('high'),
      JSON.stringify(userWins))

    // 37. Knobs present, `agent` ABSENT -> nothing emitted at all, not even
    //     the session id. This is the check that pins the gate on spec.agent
    //     rather than on the knob: gating on the knob would append flags to
    //     whatever command the user typed, which is precisely the move
    //     resolveCommand deliberately refuses one function up. A login shell
    //     with a stray agentOptions must spawn exactly as it always did.
    const notAnAgent = A.agentArgs(
      { args: ['-l'], agentOptions: { permissionMode: 'bypassPermissions' } },
      'sess-3'
    )
    ok('37 knobs with no agent emit nothing — the gate is spec.agent, not the knob',
      notAnAgent.length === 1 && notAnAgent[0] === '-l',
      JSON.stringify(notAnAgent))

    // 38. Codex uses a different argv contract and has no create-session
    // flag. A Claude-only option in a shared layout must remain inert rather
    // than causing Codex to reject a foreign flag at launch.
    const codex = A.agentArgs(
      {
        agent: 'codex',
        args: [],
        agentOptions: {
          permissionMode: 'plan',
          model: 'gpt-5.6',
          sandbox: 'workspace-write',
          approvalPolicy: 'on-request'
        }
      },
      'not-a-codex-session'
    )
    ok('38 Codex receives only its supported flags and no synthetic session id',
      codex.join(' ') === '--model gpt-5.6 --sandbox workspace-write --ask-for-approval on-request',
      JSON.stringify(codex))
  }

  // 11-15 need a real tmux. Skipping is reported, never silent: a suite that
  // quietly covers nothing is worse than one that says it covered nothing.
  // backpressure.1/.2. THE FLUSH IS CAPPED BY BYTES, AND THE CAP KEEPS THE
  //     TAIL. Batching (FLUSH_INTERVAL_MS) solved message COUNT and did
  //     nothing about message SIZE: an uncapped buffer joined every 16ms
  //     turns `yes` or a `cat` of a large file into multi-megabyte strings
  //     crossing IPC every frame, and the renderer stalls in exactly the way
  //     the batcher exists to prevent. The cap is forced LOW here so the
  //     elision is deterministic rather than a timing accident — a real
  //     256 KB cap against a 180 KB fixture would elide nothing on a fast
  //     read and everything on a slow one.
  //
  //     Two checks because each clause guards a different silent failure.
  //     .1 is the cap and the MARKER: an elision the user is not told about
  //     is missing output with no explanation anywhere. .2 is the TAIL: the
  //     flush-before-exit rule exists so the last lines a dying process
  //     prints — usually the error — are not lost, and a head-preserving
  //     truncation drops precisely those. A sentinel printed LAST must reach
  //     the renderer in the LAST payload.
  {
    const CAP = 4096
    const h = makeHarness(undefined, { flushMaxBytes: CAP })
    const script =
      'i=0; while [ $i -lt 4000 ]; do echo "line $i padding padding padding padding"; i=$((i+1)); done; echo TC-END'
    await h.manager.create(spec('bp1', '/bin/sh', ['-c', script]))
    await waitFor(() => h.exits().some((e) => e.payload.panelId === 'bp1'), 15000)
    const payloads = h.events.filter((e) => e.channel === 'pty:data' && e.payload.panelId === 'bp1')
      .map((e) => e.payload.data)
    // One marker line at most per flush, and its text is bounded.
    const MARKER_MAX = 96
    const largest = payloads.reduce((m, d) => Math.max(m, d.length), 0)
    const marked = payloads.filter((d) => d.includes('[terminal-canvas:')).length
    const total = payloads.reduce((n, d) => n + d.length, 0)
    ok('backpressure.1 no pty:data payload exceeds the cap plus one marker, and elision is announced in the stream',
      payloads.length > 0 && largest <= CAP + MARKER_MAX && marked >= 1,
      `payloads=${payloads.length} largest=${largest} cap=${CAP} marked=${marked} totalDelivered=${total}`)
    const last = payloads[payloads.length - 1] ?? ''
    ok('backpressure.2 the tail survives — the sentinel printed last reaches the last payload',
      last.includes('TC-END'),
      `last=${JSON.stringify(last.slice(-80))}`)
    h.manager.killAll()
  }

  // M37 — worktree.1-.3. The manager's part is small and injected: it asks
  //     `worktreeFor` ONLY when the spec says so, spawns in the answer's path
  //     when the answer is `active`, spawns in the requested cwd when it is
  //     `refused`, and carries the outcome on the result either way. The
  //     git-running half is verify:review's; this is the seam.
  {
    const wt = mkdtempSync(join(tmpdir(), 'tc wt dir '))
    const asked = []
    const h = makeHarness(undefined, {
      worktreeFor: async (panelId, cwd) => {
        asked.push({ panelId, cwd })
        return panelId === 'wt-yes'
          ? { kind: 'active', branch: 'tc/wt-yes-20260901-1432', path: wt, root: '/r' }
          : { kind: 'refused', reason: 'not inside a git repository' }
      }
    })
    const yes = await h.manager.create({ ...spec('wt-yes'), worktree: true })
    const no = await h.manager.create({ ...spec('wt-no'), worktree: true })
    const plain = await h.manager.create(spec('wt-plain'))
    const realWt = realpathSync(wt)
    ok('worktree.1 a spec asking for a worktree spawns in the path the resolver answers, and the result says so',
      asked.some((a) => a.panelId === 'wt-yes') && realpathSync(yes.cwd) === realWt &&
        yes.worktree !== undefined && yes.worktree.kind === 'active' && yes.worktree.branch === 'tc/wt-yes-20260901-1432',
      JSON.stringify({ cwd: yes.cwd, worktree: yes.worktree }))
    ok('worktree.2 a refused worktree spawns in the requested cwd AND carries the refusal',
      asked.some((a) => a.panelId === 'wt-no') && realpathSync(no.cwd) === realpathSync(os.homedir()) &&
        no.worktree !== undefined && no.worktree.kind === 'refused' && /repository/.test(no.worktree.reason),
      JSON.stringify({ cwd: no.cwd, worktree: no.worktree }))
    ok('worktree.3 a spec that never asked never consults the resolver and carries no outcome',
      !asked.some((a) => a.panelId === 'wt-plain') && plain.worktree === undefined,
      JSON.stringify({ asked, worktree: plain.worktree }))
    h.manager.killAll()
  }

  const TMUX = findTmux()
  if (!TMUX) {
    ok('11-15 tmux backend (SKIPPED — no tmux binary found)', true, 'install tmux to cover these')
  } else {
    // The space is deliberate and load-bearing. Production's exitDir is
    // ~/Library/Application Support/terminal-canvas/tmux-exits, so a spaced
    // path is the only shape that ever ships — and the pane-died hook's
    // redirect target was unquoted for the whole milestone because every
    // fixture (this one included, as 'tc-verify-' under /var/folders) was
    // space-free. Check 14 below is what actually catches it: with an
    // unquoted redirect no exit file is written, exitCodeFor returns null,
    // and the client's own code 1 is reported instead of 7.
    const dir = mkdtempSync(join(tmpdir(), 'tc verify '))
    const exitDir = join(dir, 'exit codes')
    mkdirSync(exitDir, { recursive: true })
    const confPath = join(dir, 'tmux.conf')
    const T = require(OUT_TMUX_ARGS)
    writeFileSync(confPath, T.buildTmuxConf(exitDir, VERIFY_SOCKET))
    const tmuxBackend = createTmuxBackend({ tmuxPath: TMUX, exitDir, confPath, reason: 'verify', socket: VERIFY_SOCKET })
    const tmuxCli = (args) => {
      try { return execFileSync(TMUX, args, { encoding: 'utf8' }) } catch { return '' }
    }

    // h1 is deliberately hoisted out of check 11's block: check 12 must detach
    // THE MANAGER THAT OWNS THE SESSION. Calling detachAll() on a freshly made
    // harness would walk an empty map, do nothing, and pass for the wrong
    // reason — the session would survive because nothing ever touched it.
    let h1 = null

    // 11. A session created through the backend is visible to tmux itself on
    // the socket we asked for — and therefore invisible on both the user's
    // default socket and the app's production one.
    {
      h1 = makeHarness(tmuxBackend)
      await h1.manager.create(spec('t1'))
      await sleep(700)
      const listed = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('11 a panel becomes a tmux session on the private socket',
        listed.includes('t1'), JSON.stringify(listed.trim()))
    }

    // 12. THE MILESTONE. Detach the client the way a renderer teardown does;
    // the session must survive, and a fresh create with the same panelId must
    // reattach rather than start a second process.
    //
    // Two assertions, catching two different bugs:
    //   - PID equality rules out a silent RESPAWN: a respawned command runs
    //     in a brand-new pane with a brand-new pid, so a fresh pid here would
    //     expose a naive re-implementation that just started a second process.
    //   - The client-count sequence (1 -> 0 -> 1) rules out detachAll() being
    //     a no-op. tmux allows MULTIPLE clients on one session at once, and
    //     attaching a second client never changes the pane's pid — so PID
    //     equality alone holds whether or not h1 ever actually detached. If a
    //     future edit dropped `session.proc.kill()` from detachAll(), h1's
    //     client would linger attached, h2's create would just add a SECOND
    //     client, and the pid-only version of this check would still print
    //     green while reload survival was silently broken. The 0 in the
    //     middle is the only thing that proves the local client actually
    //     died rather than lingering.
    //
    // h2 is a SEPARATE harness from h1 (an empty session map of its own) so a
    // successful reattach can only be explained by tmux itself, not by h1
    // still holding the panelId in its map.
    {
      const clientCount = () => {
        const out = tmuxCli(['-L', VERIFY_SOCKET, 'list-clients', '-t', 't1', '-F', '#{client_pid}'])
        return out.split('\n').filter((l) => l.trim()).length
      }
      const before = tmuxCli(['-L', VERIFY_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const beforePid = (/t1 (\d+)/.exec(before) ?? [])[1]
      const clientsBefore = clientCount()
      h1.manager.detachAll()
      await sleep(500)
      const survived = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      const clientsAfterDetach = clientCount()
      const h2 = makeHarness(tmuxBackend)
      await h2.manager.create(spec('t1'))
      await sleep(700)
      const after = tmuxCli(['-L', VERIFY_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const afterPid = (/t1 (\d+)/.exec(after) ?? [])[1]
      const clientsAfterReattach = clientCount()
      ok('12 detaching leaves the session alive, drops its client to zero, and create reattaches the SAME process',
        survived.includes('t1') && beforePid && beforePid === afterPid &&
          clientsBefore === 1 && clientsAfterDetach === 0 && clientsAfterReattach === 1,
        `pid ${beforePid} -> ${afterPid}, clients ${clientsBefore} -> ${clientsAfterDetach} -> ${clientsAfterReattach}`)
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

    // 14b. Number('') is 0, not NaN. A file that exists but is empty (a
    // truncated write; the hook's echo ran but the redirect had not yet
    // flushed) must fall back to null — never a fabricated 0, which via
    // `real ?? exitCode` would report a crashed process as a CLEAN exit, the
    // exact failure exitCodeFor exists to prevent. Written by hand rather
    // than through a real hook race, since the race itself is not
    // reproducible on demand.
    {
      writeFileSync(T.exitFilePath(exitDir, 'empty-exit-panel'), '')
      const code = tmuxBackend.exitCodeFor('empty-exit-panel')
      ok('14b an empty exit file yields null, never a fabricated 0',
        code === null, `exitCodeFor returned ${code}`)
    }

    // 14c. kill() must reach backend.destroy() even for a panelId this manager
    // has NO local session for. Under node-pty "no session" meant "no process"
    // and the early return was free; under tmux a panel can be reattachable —
    // its session survived a reload — while this manager never spawned a
    // client for it, because the panel was off-screen or held back by
    // LIVE_BUDGET and never went live. Closing it then left an agent running
    // with nothing able to reach, close, or type into it for the rest of the
    // run. Built here by starting a session through one manager and killing it
    // through a SECOND, empty one, which is exactly the post-reload shape.
    {
      const owner = makeHarness(tmuxBackend)
      await owner.manager.create(spec('t4'))
      await sleep(700)
      owner.manager.detachAll()
      await sleep(400)
      const stranger = makeHarness(tmuxBackend)
      const beforeKill = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      stranger.manager.kill('t4')
      await sleep(500)
      const afterKill = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('14c killing a panel with no local session still ends its surviving tmux session',
        beforeKill.includes('t4') && !afterKill.includes('t4'),
        `before=${JSON.stringify(beforeKill.trim())} after=${JSON.stringify(afterKill.trim())}`)
    }

    // 14d. TARGET PREFIX MATCHING, the defect 14c made reachable. tmux
    // resolves a -t target that is not an exact session name by unique
    // PREFIX: with only `n10` alive, `kill-session -t n1` kills n10 and exits
    // 0 (reproduced on tmux 3.7c). Panel ids are n1..n12, so closing a
    // dormant, never-spawned n1 — which 14c above deliberately routes into
    // backend.destroy() even with no local session — silently destroyed the
    // agent running in n10. 14c's own t4/t1 pair cannot collide, so it can
    // never catch this; a DELIBERATELY colliding pair is the whole point of
    // this check. The `=` in buildKillSessionArgs is what makes it pass, and
    // a string assertion on that `=` (verify:tmux 19) is not a substitute for
    // watching n10 survive a real kill.
    {
      const owner = makeHarness(tmuxBackend)
      await owner.manager.create(spec('n10'))
      await sleep(700)
      const before = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      // A manager that has never heard of n1, exactly like the post-reload
      // shape 14c builds — kill() therefore goes straight to destroy(), and
      // there is no n1 session on the socket for it to find.
      const stranger = makeHarness(tmuxBackend)
      stranger.manager.kill('n1')
      await sleep(500)
      const after = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('14d killing n1 while only n10 exists leaves n10 alive',
        before.includes('n10') && after.includes('n10'),
        `before=${JSON.stringify(before.trim())} after=${JSON.stringify(after.trim())}`)
      owner.manager.kill('n10')
      await sleep(300)
    }

    // 16 — M6a. The first spawn creates; the second, after a detachAll that
    // leaves the tmux session running, must report that it ATTACHED. This is
    // the check that fails if hasSession is probed AFTER the spawn instead of
    // before — `new-session -A` will have created the session by then, so a
    // post-spawn probe answers true every single time and every panel claims
    // to have reattached, including on a cold start.
    {
      const h1 = makeHarness(tmuxBackend)
      const first = await h1.manager.create(spec('n-reattach'))
      await sleep(700)
      ok('16 a fresh session reports reattached false', first.reattached === false,
        `reattached=${first.reattached}`)
      h1.manager.detachAll()
      await sleep(500)
      const h2 = makeHarness(tmuxBackend)
      const second = await h2.manager.create(spec('n-reattach'))
      await sleep(700)
      ok('16b the same panel spawned again reports reattached true', second.reattached === true,
        `reattached=${second.reattached}`)
      h2.manager.kill('n-reattach')
      await sleep(300)
    }

    // 15. destroy() ends the session, and shutdown() takes the server with it.
    {
      const h = makeHarness(tmuxBackend)
      await h.manager.create(spec('t3'))
      await sleep(700)
      h.manager.kill('t3')
      await sleep(500)
      const afterKill = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      tmuxBackend.shutdown()
      await sleep(500)
      const afterShutdown = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('15 closing a panel ends its session and shutdown ends the server',
        !afterKill.includes('t3') && afterShutdown.trim() === '',
        `afterKill=${JSON.stringify(afterKill.trim())} afterShutdown=${JSON.stringify(afterShutdown.trim())}`)
    }

    // 20. THE MIRROR OF CHECK 12, and the single assertion that separates a
    //     real restart from a reattach.
    //
    //     Check 12 pins that detach-then-create is the SAME pid — that is the
    //     whole of M4c's reload survival. Restart is the opposite claim about
    //     the same two calls with kill() in the middle instead of detachAll(),
    //     and every OTHER observable is identical between the two: the session
    //     name is the same, the client count returns to 1, list() reports one
    //     session either way. Only the pane pid tells them apart.
    //
    //     Without this check, a restart that forgot backend.destroy would show
    //     `new-session -A` reattaching to the surviving session — the user
    //     presses Restart, the agent keeps running, and nothing anywhere says
    //     the verb did not happen.
    //
    //     This is a CHARACTERISATION check: it pins behaviour PtyManager.kill
    //     has had since M4c (its has-a-local-session branch already calls
    //     backend.destroy), which Task 6's restart-in-place is about to
    //     depend on. It passes on first write and was never red in normal
    //     development — it earns its place by fault injection (commenting
    //     out that destroy() call reproduces the same pid and a session
    //     still present between kill and create), not by having failed on
    //     its own.
    {
      const h = makeHarness(tmuxBackend)
      await h.manager.create(spec('r1'))
      await sleep(700)
      const before = tmuxCli(['-L', VERIFY_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const beforePid = (/r1 (\d+)/.exec(before) ?? [])[1]

      h.manager.kill('r1')
      await sleep(500)
      const between = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])

      await h.manager.create(spec('r1'))
      await sleep(700)
      const after = tmuxCli(['-L', VERIFY_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const afterPid = (/r1 (\d+)/.exec(after) ?? [])[1]

      ok('20 restarting kills the session and respawns a DIFFERENT process at the same panel id',
        beforePid && afterPid && beforePid !== afterPid &&
          between.includes('r1') === false &&
          after.includes('r1'),
        `pid ${beforePid} -> ${afterPid}, session between: ${JSON.stringify(between.trim())}`)
      h.manager.kill('r1')
      // Check 15, the previous last action in this block, always ended with
      // shutdown() — a definite kill-server, so every run left the socket
      // with no server at all. kill('r1') only ends the SESSION, not the
      // server, and that call has moved to the end of check 22 below: the
      // obligation to leave this block ending in a definite kill-server is
      // inherited there now, not here. See check 22's own comment.
    }

    // 21. The baseline is captured ONCE. A second create() at the same id —
    //     which is exactly what a Cmd+R reload does for every restored
    //     panel, and which under tmux REATTACHES to a session that may have
    //     worked for an hour — must not recapture. Recapturing reports "no
    //     changes" for an agent that rewrote the repository: a wrong answer
    //     shaped exactly like a right one, and the single failure this
    //     whole milestone turns on.
    {
      const captures = []
      const { manager } = makeHarness(tmuxBackend, { onCaptureBaseline: (id) => captures.push(id) })
      await manager.create(spec('r2'))
      manager.detachAll()
      await manager.create(spec('r2'))
      ok('21 the baseline is captured ONCE across a reattach', captures.length === 1, `captured ${captures.length}x`)
      manager.kill('r2')
    }

    // 22. kill drops the baseline, so the map does not grow for the life of
    //     the install and a recycled id cannot inherit a dead panel's
    //     snapshot.
    {
      const dropped = []
      const { manager } = makeHarness(tmuxBackend, { onDropBaseline: (id) => dropped.push(id) })
      await manager.create(spec('r3'))
      manager.kill('r3')
      ok('22 kill drops the baseline', dropped.includes('r3'))
    }

    // 22b. Finding 2 (task-6 review): kill() drops the baseline on the
    //      NO-LOCAL-SESSION branch too, not only the ordinary one 22 covers.
    //      That branch is the same one verify:pty-manager 14c already
    //      proves reaches backend.destroy() for an id this manager never
    //      spawned — a hidden workspace's panel, reattachable after a
    //      reload but never promoted, per "dispose(id) sends pty.kill even
    //      when this renderer holds no local session for that id" in
    //      CLAUDE.md. Before this check the baseline half of that same
    //      branch was defended by prose alone, exactly the gap 14c itself
    //      was added to close for backend.destroy() — a branch asserted by
    //      nothing is one a later editor deletes as dead code.
    {
      const dropped = []
      const { manager } = makeHarness(tmuxBackend, { onDropBaseline: (id) => dropped.push(id) })
      manager.kill('r4') // never created locally — no session in this manager's map
      ok('22b kill drops the baseline even with no local session', dropped.includes('r4'))
      // Check 20's obligation, inherited: this block must still end in a
      // definite kill-server, never in a session kill that leaves a stale
      // server for the NEXT run to attach to (see check 20's own comment for
      // why that matters — a later run reattaches to a server still wired to
      // THIS run's now-deleted exitDir and check 14 silently reports the
      // wrong exit code). Whoever appends check 23 inherits this obligation
      // next — and check 23 is next, so the shutdown moves below it.
    }

    // 23. THE DEDUPE, which is this milestone's whole cost story and is
    // invisible on screen when it breaks — it shows up as heat, not as a
    // wrong pixel. A panel that has not moved must produce NO further
    // session:live traffic after its first value, and a `cd` must produce
    // exactly one more.
    //
    // The fixture has to span SEVERAL ticks or it proves nothing: an
    // implementation with no dedupe at all emits once per tick, so a check
    // that samples a single tick's worth sees one message either way and is
    // green against the defect. This is check 17's trap in reverse — there
    // the danger was too little output to distinguish, here it is too short
    // a window.
    {
      const h = makeHarness(tmuxBackend)
      const liveOf = () => h.events
        .filter((m) => m.channel === 'session:live' && m.payload.panelId === 'L1')
        .map((m) => m.payload)

      // A real directory, owned by this run alone — not os.homedir(). A
      // login shell (-l) sources the running developer's own .zprofile/
      // .zshrc, and a dotfile that cd's on startup would shift settled[0]'s
      // cwd or falsify after[1] !== after[0] on one machine and not another,
      // which is exactly the kind of state this repo's suites are written
      // not to depend on (see CLAUDE.md on why verify:panels fences its
      // project-prompt read to its own fixture directory). A plain /bin/sh
      // with no args is a non-login, non-interactive-rc shell: nothing it
      // reads is outside this repo's control.
      const liveDir = mkdtempSync(join(tmpdir(), 'tc pty-manager live '))
      await h.manager.create({ panelId: 'L1', cwd: liveDir, command: '/bin/sh', args: [], cols: 80, rows: 24 })
      // Long enough for at least three ticks at LIVE_TICK_MS (2000ms).
      await sleep(7000)
      const settled = liveOf()

      h.manager.write('L1', 'cd /tmp\n')
      await sleep(7000)
      const after = liveOf()

      ok('23 live cwd is sent once, then only when it CHANGES',
        settled.length === 1 &&
          typeof settled[0].cwd === 'string' && settled[0].cwd.length > 0 &&
          after.length === 2 && after[1].cwd !== after[0].cwd,
        `settled=${settled.length} total=${after.length} ${JSON.stringify(after)}`)
      h.manager.kill('L1')
      try { rmSync(liveDir, { recursive: true, force: true }) } catch { /* best effort */ }
    }

    // 24. detachAll() must clear lastLive too, not only kill(). This is the
    // branch's SUBTLEST fix and nothing else in this suite would notice its
    // removal: check 23 above never reloads, and the panels suite's reload
    // checks (26, 91) read nothing live at all. A reload's fresh PtyManager
    // would start with an empty lastLive by construction — but THIS manager
    // survives a detach and keeps running, with its map intact, so without the
    // clear pollLive dedupes the reattached panel's first post-detach poll
    // against its stale PRE-detach value and sends nothing until the cwd
    // actually changes again, which may be never. On screen that is a
    // reattached panel — a real, live, running tmux session — whose inspector
    // goes on showing wherever it was a run ago: the milestone's own thesis (a
    // present-tense label showing a stale value is worse than none) failing
    // silently, through detachAll() rather than through the render path FR1
    // covers.
    //
    // detachAll() only DETACHES the local client; the tmux session it leaves
    // running is exactly what lets a plain create() at the same id reattach a
    // moment later, so this reuses the same cwd/command on both sides of the
    // detach on purpose — the dedupe key must be able to tell "the panel
    // reattached with an unchanged cwd" apart from "the panel is still being
    // polled without having reattached at all", and only a SECOND emitted
    // value proves the former.
    {
      const h = makeHarness(tmuxBackend)
      const liveOf = () => h.events
        .filter((m) => m.channel === 'session:live' && m.payload.panelId === 'L2')
        .map((m) => m.payload)
      const detachLiveDir = mkdtempSync(join(tmpdir(), 'tc pty-manager detach-live '))
      const spawnArgs = { panelId: 'L2', cwd: detachLiveDir, command: '/bin/sh', args: [], cols: 80, rows: 24 }

      await h.manager.create(spawnArgs)
      await waitFor(() => liveOf().length >= 1, 5000, 100)
      const beforeDetach = liveOf().length

      h.manager.detachAll()
      await h.manager.create(spawnArgs)
      // Two ticks' margin, the same allowance check 23 gives its own dedupe
      // assertion, so a poll that merely landed slow does not read as "never
      // cleared".
      await waitFor(() => liveOf().length >= beforeDetach + 1, 2 * 2000 + 1000, 100)
      const afterReattach = liveOf()

      ok('24 detachAll() clears lastLive, so a reattach at an unchanged cwd still produces a second live answer',
        afterReattach.length >= beforeDetach + 1,
        `beforeDetach=${beforeDetach} afterReattach=${afterReattach.length} events=${JSON.stringify(afterReattach)}`)

      h.manager.kill('L2')
      try { rmSync(detachLiveDir, { recursive: true, force: true }) } catch { /* best effort */ }

      // Check 20's obligation, inherited via 22b and 23: this block must end
      // in a definite kill-server, never a session kill that leaves a stale
      // server for the next run — see check 20's own comment for why (a later
      // run's client would reattach to a server still wired to THIS run's
      // now-deleted exitDir, and check 14 would silently report the wrong
      // exit code). Check 25 is next, so the shutdown moves below it.
    }

    // 25. The subagent poll wired to a real filesystem, for a panel with NO
    // Claude Code session directory at all — the ordinary case for most
    // panels, since most panels never run Claude Code. Main's poll must stay
    // SILENT rather than announcing an empty state; that silence is success
    // criterion 6.
    //
    // This is precise about what it does NOT prove, because the honest
    // reading matters more than a reassuring one: it CANNOT test the dedupe.
    // With nothing to claim, there is nothing that could change between
    // ticks either — zero messages is exactly what a correct implementation
    // and a completely undeduped one both produce here, since neither ever
    // has anything to send in the first place. The dedupe itself — an
    // unchanged claim reporting once and then falling silent — is proven
    // where it can actually be exercised: verify:subagent 16 (an unchanged
    // poll reports nothing) and 21 (an unbroken run of ambiguous ticks
    // reports once, not on every poll), both against a fake filesystem that
    // can hold something to be silent ABOUT. Check 26 below is where the
    // dedupe is proven against a REAL one.
    //
    // This is a CHARACTERISATION check, in the shape check 20 already names:
    // it pins that the real fs wiring this milestone adds does not
    // manufacture output where the pure watcher has nothing to report, and it
    // earns its place by fault injection — point createFsWatchDeps at a
    // TC_CLAUDE_PROJECTS root that does not exist and confirm nothing throws
    // and nothing sends — not by ever having failed on its own. The WINDOW
    // still matters for a reason that is not the dedupe: 7s is long enough
    // that a future change which made the poll invent a message per tick for
    // an unclaimed panel would be caught here too.
    {
      const seen = []
      const { manager } = makeHarness(tmuxBackend, {
        onSend: (channel, payload) => { if (channel === 'subagent:state') seen.push(payload) }
      })
      const subagentDir = mkdtempSync(join(tmpdir(), 'tc pty-manager subagent '))
      await manager.create({ panelId: 'sa1', cwd: subagentDir, command: '/bin/sh', args: [], cols: 80, rows: 24 })
      await sleep(7000) // comfortably more than three LIVE_TICK_MS ticks
      ok('25 no subagent:state for a panel with no Claude Code session dir',
        seen.length === 0, `expected no subagent:state, got ${seen.length}`)
      manager.kill('sa1')
      try { rmSync(subagentDir, { recursive: true, force: true }) } catch { /* best effort */ }
    }

    // 26. THE POSITIVE PATH, and the only place anywhere — this suite or
    // verify:subagent — that proves the dedupe survives contact with a REAL
    // filesystem read through a REAL PtyManager. verify:subagent 16 and 21
    // pin the dedupe against a FAKE fs; this is what proves createFsWatchDeps
    // itself (real readdirSync/readFileSync/statSync, reached through
    // TC_CLAUDE_PROJECTS — see R2) doesn't silently break that guarantee on
    // the way from a fake dependency to a real disk.
    //
    // TC_CLAUDE_PROJECTS is read ONCE, inside createFsWatchDeps(), at
    // PtyManager CONSTRUCTION — so it has to be set before makeHarness() is
    // called, not merely before the panel spawns, or this manager's
    // subagentWatch would be pointed at whatever root an earlier check left
    // behind (or the real default, ~/.claude/projects).
    //
    // The seeded session directory is created AFTER manager.create()
    // resolves, deliberately: chooseSession requires the directory's own
    // createdAt to be >= the panel's spawnedAt, which create() stamps before
    // this fixture writes anything — seed it first and the fixture would
    // defeat its own claim, the identical post-spawn filter verify:subagent 9
    // pins for chooseSession in isolation.
    //
    // Both temp roots are REALPATH'd before use, not left as mkdtempSync
    // hands them back. This manager is on the TMUX backend, so by the first
    // tick pollLive's own SESSION_LIVE half has already asked tmux for this
    // panel's live cwd and handed the RESOLVED spelling
    // (/private/var/folders/... on macOS) to the subagent half as the cwd to
    // poll with — CLAUDE.md's own "one cosmetic consequence" note. Building
    // the slug and the transcript's confirmation line from the UNRESOLVED
    // /var/folders/... spelling would make claim()'s own recordedCwd check
    // fail against the resolved cwd tmux actually reports, and the panel
    // would never be claimed at all — the same two-spelling trap
    // verify:panels' prompt fence exists to close, reached through a new
    // door.
    //
    // The WINDOW is what makes "exactly one, then nothing" mean anything, and
    // a future editor must not shrink it below 7s for check 25's own stated
    // reason: an implementation with no dedupe emits once per LIVE_TICK_MS
    // tick, so a sample spanning a single tick sees one message either way.
    {
      const seen = []
      const projectsRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tc pty-manager projects ')))
      const subagentCwd = realpathSync(mkdtempSync(join(tmpdir(), 'tc pty-manager subagent-cwd ')))
      const priorProjectsRoot = process.env.TC_CLAUDE_PROJECTS
      process.env.TC_CLAUDE_PROJECTS = projectsRoot
      try {
        const { manager } = makeHarness(tmuxBackend, {
          onSend: (channel, payload) => { if (channel === 'subagent:state') seen.push(payload) }
        })
        await manager.create({ panelId: 'sa2', cwd: subagentCwd, command: '/bin/sh', args: [], cols: 80, rows: 24 })

        // The ONE rule slugFor states in subagent-scan.ts, restated here
        // rather than imported: this suite bundles pty-manager.ts alone and
        // does not export it, which is why this fixture's directories and
        // files are hand-built instead of driven through the real watcher's
        // own API.
        const slug = subagentCwd.replace(/[^A-Za-z0-9]/g, '-')
        const sessionDir = join(projectsRoot, slug, 'S1')
        mkdirSync(join(sessionDir, 'subagents'), { recursive: true })
        writeFileSync(join(sessionDir, 'subagents', 'agent-x.meta.json'), JSON.stringify({
          agentType: 'general-purpose', description: 'positive path', toolUseId: 'toolu_verify26',
          spawnDepth: 1, model: 'sonnet'
        }))
        // THE CONFIRMATION line: claim() rejects a session whose own first
        // transcript line records a DIFFERENT cwd, however well the slug
        // matched — see the realpath note above for why this must be the
        // RESOLVED cwd tmux will report, not the raw mkdtempSync path.
        writeFileSync(`${sessionDir}.jsonl`, JSON.stringify({ type: 'user', cwd: subagentCwd }) + '\n')

        await sleep(7000) // comfortably more than three LIVE_TICK_MS ticks
        const record = seen[0]?.records?.[0]
        ok('26 a real Claude Code session directory produces exactly one subagent:state carrying one running record, then nothing further',
          seen.length === 1 && seen[0].panelId === 'sa2' && seen[0].ambiguous === false &&
            seen[0].records.length === 1 && record?.id === 'agent-x' && record?.state === 'running' &&
            // Field by field, never a spread (see pollLive's own comment):
            // toolUseId is main's internal completion key and must not reach
            // the wire, where it means nothing and belongs to a format this
            // repo does not own.
            !('toolUseId' in record),
          `seen=${JSON.stringify(seen)}`)

        manager.kill('sa2')
      } finally {
        if (priorProjectsRoot === undefined) delete process.env.TC_CLAUDE_PROJECTS
        else process.env.TC_CLAUDE_PROJECTS = priorProjectsRoot
        try { rmSync(projectsRoot, { recursive: true, force: true }) } catch { /* best effort */ }
        try { rmSync(subagentCwd, { recursive: true, force: true }) } catch { /* best effort */ }
      }

      // Check 20's obligation, inherited via 22b, 23, 24 and 25: this block
      // must end in a definite kill-server, never a session kill that leaves
      // a stale server for the next run — see check 20's own comment for why
      // (a later run's client would reattach to a server still wired to
      // THIS run's now-deleted exitDir, and check 14 would silently report
      // the wrong exit code). Check 27 is next, so the shutdown moves below it.
    }

    // 27. R10: a REATTACHED session must reuse its ORIGINAL spawnedAt, never
    // a fresh Date.now() taken at the moment of reattachment. new-session -A
    // makes "this client just attached" and "this process just started" the
    // same tmux call — M6a's reattached flag exists for the identical
    // ambiguity one layer down — and for a reattached session the agent has
    // been running since BEFORE this attach, so its Claude Code session
    // directory NECESSARILY predates it. Treating the attach moment as the
    // spawn moment makes chooseSession's post-spawn filter
    // (createdAt >= spawnedAt) reject the panel's own, still-valid session
    // directory — permanently, since nothing ever re-derives spawnedAt again
    // for a session this manager keeps alive.
    //
    // This is the sibling door check 26 does not open and R8 alone did not
    // close: a panel reloaded BEFORE its first successful poll, so
    // SubagentWatch never claimed it in the first place. detachAll()'s
    // clearDedupe() (R8) has nothing to preserve for a panel with no claim
    // yet — that property rests entirely on spawnedAt surviving in
    // PtyManager itself, which is what this check is actually pinning. The
    // fixture seeds the session directory and then detaches and reattaches
    // to the SAME session BEFORE the first LIVE_TICK_MS tick can fire —
    // comfortably under LIVE_TICK_MS even with the settle margins checks
    // 16/16b need for a real reattach to happen at all (see below) — so
    // there is no successful poll in between to let R8's own fix quietly
    // cover for this one.
    //
    // Asserted as the actual user-visible property, not as a value read off
    // any internal field (PtyManager exposes no such thing to assert on
    // directly): a session directory created BEFORE the reattach is STILL
    // CLAIMABLE afterwards, producing exactly one subagent:state for it.
    // Under the bug this reports nothing at all, ever — the same silent,
    // unrecoverable failure R8 exists to close, reached through a sibling
    // door.
    {
      const seen = []
      const projectsRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tc pty-manager projects ')))
      const subagentCwd = realpathSync(mkdtempSync(join(tmpdir(), 'tc pty-manager reattach-cwd ')))
      const priorProjectsRoot = process.env.TC_CLAUDE_PROJECTS
      process.env.TC_CLAUDE_PROJECTS = projectsRoot
      try {
        const { manager } = makeHarness(tmuxBackend, {
          onSend: (channel, payload) => { if (channel === 'subagent:state') seen.push(payload) }
        })
        await manager.create({ panelId: 'sa3', cwd: subagentCwd, command: '/bin/sh', args: [], cols: 80, rows: 24 })
        // Let the session settle before touching it, the same margin checks
        // 16/16b give a fresh session before detaching it — new-session -A's
        // local client needs a moment to actually attach before the session
        // is one detachAll() can hand back cleanly; skip this and the
        // "reattach" below silently spawns a SECOND, unrelated session
        // instead (reattached: false), which is a fixture bug, not the one
        // this check exists to find.
        await sleep(700)

        // Seeded after settling, still well before detachAll(): its
        // createdAt postdates the ORIGINAL spawn — the same ordering check
        // 26 needs and for the identical reason (verify:subagent 9's
        // post-spawn filter, restated end to end).
        const slug = subagentCwd.replace(/[^A-Za-z0-9]/g, '-')
        const sessionDir = join(projectsRoot, slug, 'S1')
        mkdirSync(join(sessionDir, 'subagents'), { recursive: true })
        writeFileSync(join(sessionDir, 'subagents', 'agent-y.meta.json'), JSON.stringify({
          agentType: 'general-purpose', description: 'reattach path', toolUseId: 'toolu_verify27',
          spawnDepth: 1, model: 'sonnet'
        }))
        writeFileSync(`${sessionDir}.jsonl`, JSON.stringify({ type: 'user', cwd: subagentCwd }) + '\n')

        // Detach and reattach to the SAME panel id with NO POLL in between:
        // 700ms settle + 500ms post-detach margin (checks 16/16b's own
        // numbers) is comfortably under one LIVE_TICK_MS (2000ms), and this
        // manager's live tick stops outright the instant detachAll() empties
        // its session map — it does not restart until the reattaching
        // create() below runs — so the first tick that could possibly claim
        // this session is the first one AFTER reattachment, exactly the
        // window this check needs to isolate.
        manager.detachAll()
        await sleep(500)
        const reattachResult = await manager.create({ panelId: 'sa3', cwd: subagentCwd, command: '/bin/sh', args: [], cols: 80, rows: 24 })

        await sleep(7000) // comfortably more than three LIVE_TICK_MS ticks
        const record = seen[0]?.records?.[0]
        ok('27 a reattached session reuses its ORIGINAL spawnedAt, so a session directory that predates the reattach is still claimable',
          reattachResult.reattached === true &&
          seen.length === 1 && seen[0].panelId === 'sa3' && seen[0].ambiguous === false &&
            seen[0].records.length === 1 && record?.id === 'agent-y' && record?.state === 'running',
          `seen=${JSON.stringify(seen)}`)

        manager.kill('sa3')
      } finally {
        if (priorProjectsRoot === undefined) delete process.env.TC_CLAUDE_PROJECTS
        else process.env.TC_CLAUDE_PROJECTS = priorProjectsRoot
        try { rmSync(projectsRoot, { recursive: true, force: true }) } catch { /* best effort */ }
        try { rmSync(subagentCwd, { recursive: true, force: true }) } catch { /* best effort */ }
      }

      // Check 20's obligation, inherited via 22b, 23, 24, 25 and 26: this
      // block must end in a definite kill-server, never a session kill that
      // leaves a stale server for the next run — see check 20's own comment
      // for why (a later run's client would reattach to a server still
      // wired to THIS run's now-deleted exitDir, and check 14 would
      // silently report the wrong exit code). Whoever appends check 28
      // inherits it next.
      tmuxBackend.shutdown()
    }

    // 28. The pin is minted ONCE and REUSED on a second create at the same
    //     panel id. That second create is exactly what a Cmd+R reload does
    //     for every restored panel, and under tmux it REATTACHES to a
    //     session that may have been working for an hour — so a re-mint
    //     there names a transcript that does not exist while the real one
    //     goes on growing, and the panel's cost freezes forever with nothing
    //     in any log. This is success criterion 2's mechanism, and it is
    //     check 21's shape (the once-only baseline capture) applied to a
    //     second thing create() must not do twice.
    {
      const pins = new Map()
      const h = makeHarness(undefined, {
        pinnedSession: (id) => pins.get(id),
        setPinnedSession: (id, sid) => pins.set(id, sid)
      })
      await h.manager.create(spec('p9', '/bin/sh', ['-c', 'sleep 30'], 'claude-code'))
      const first = pins.get('p9')
      h.manager.detachAll()
      await h.manager.create(spec('p9', '/bin/sh', ['-c', 'sleep 30'], 'claude-code'))
      ok('28 the pin is minted once and reused on a second create at the same id',
        typeof first === 'string' && first.length > 0 && pins.get('p9') === first,
        `first=${first} second=${pins.get('p9')}`)
      h.manager.killAll()
    }

    // 29. A panel whose preset declares NO agent is never pinned. The whole
    //     honesty rule rests on this: a login shell must reach the PTY
    //     exactly as the user wrote it, and a pin for it would also make the
    //     inspector render a Cost section for a panel that can never have
    //     one.
    {
      const pins = new Map()
      const h = makeHarness(undefined, {
        pinnedSession: (id) => pins.get(id),
        setPinnedSession: (id, sid) => pins.set(id, sid)
      })
      await h.manager.create(spec('p10'))
      ok('29 a panel with no declared agent is never pinned', pins.get('p10') === undefined,
        String(pins.get('p10')))
      h.manager.killAll()
    }

    // 30. The flag actually reaches the spawn's ARGV, carrying the pinned
    //     id. 25 proves the id is stable and says nothing about whether it
    //     is ever passed to anything — a manager that minted, stored and
    //     never spawned with it satisfies 25 completely and accounts for
    //     nothing at all.
    {
      const pins = new Map()
      const seen = []
      const h = makeHarness(undefined, {
        pinnedSession: (id) => pins.get(id),
        setPinnedSession: (id, sid) => pins.set(id, sid),
        onSpawnArgs: (args) => seen.push(args)
      })
      await h.manager.create(spec('p11', '/bin/sh', ['-c', 'sleep 30'], 'claude-code'))
      const args = seen[0] ?? []
      const i = args.indexOf('--session-id')
      ok('30 the flag reaches the spawn argv carrying the pinned id',
        i >= 0 && args[i + 1] === pins.get('p11'),
        `args=${JSON.stringify(args)} pin=${pins.get('p11')}`)
      h.manager.killAll()
    }

    // 31. The usage tick DEDUPES. Its failure changes no pixel — it is heat —
    //     so this counts MESSAGES rather than reading a value, exactly as
    //     check 23 does for session:live. The WINDOW is what makes the count
    //     mean anything and a future editor must not shrink it: an
    //     implementation with no dedupe emits once per USAGE_TICK_MS, so a
    //     sample spanning a single tick sees one message either way and
    //     stays green against the defect. This waits three ticks over a
    //     transcript that does not change.
    //
    //     What this actually asserts: this panel's agent is a fixture shell,
    //     not a real `claude`, so NO transcript is ever written and the
    //     correct number of messages is zero. That makes it a check about the
    //     tick not INVENTING traffic when it has nothing to report — real
    //     accumulation is Task 10's job, end to end, against a transcript the
    //     harness writes itself. A green 28 is not proof that anything is
    //     ever counted; do not read it as that.
    {
      const pins = new Map()
      const h = makeHarness(undefined, {
        pinnedSession: (id) => pins.get(id),
        setPinnedSession: (id, sid) => pins.set(id, sid)
      })
      await h.manager.create(spec('p12', '/bin/sh', ['-c', 'sleep 30'], 'claude-code'))
      await sleep(7000)
      const sent = h.events.filter((e) => e.channel === 'usage:panel' && e.payload.panelId === 'p12')
      ok('31 the usage tick sends no traffic for a panel with no real transcript',
        sent.length === 0, `messages=${sent.length}`)
      h.manager.killAll()
    }

    // An assistant record as Claude Code actually writes one — copied
    // verbatim from verify-usage.cjs's and verify-panels.cjs's own rec()
    // helpers, since it is another program's format and not ours. `over`
    // sets the output token count directly, since checks 32/33 below only
    // ever vary that one figure.
    const usageRec = (over = {}) => JSON.stringify({
      type: 'assistant',
      cwd: '/tmp/x',
      sessionId: 's1',
      timestamp: '2026-08-30T00:00:00.000Z',
      isSidechain: false,
      message: {
        model: 'claude-opus-5',
        usage: {
          input_tokens: 2,
          output_tokens: over.output ?? 100,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        }
      }
    })
    const usageEvents = (h, panelId) =>
      h.events.filter((e) => e.channel === 'usage:panel' && e.payload.panelId === panelId)

    // 32. Fix round: pollUsage's shrink handling was sequenced backwards. A
    //     shrunk/replaced transcript was read at the STALE offset first —
    //     which readFrom short-circuits to an EMPTY read — and only THEN
    //     reset, so applyChunk ran on that empty text, silently set
    //     offset = fileSize having parsed nothing, and the whole replacement
    //     file was skipped forever with no usage:panel correction ever sent.
    //     This drives the REAL sequence end to end against a real file and a
    //     real readFrom (never resetIfShrunk in isolation, which already had
    //     a passing unit check and did not catch this bug), truncates it to
    //     something shorter with different content, and asserts the
    //     accumulated totals reflect ONLY the new file — not stale, not zero.
    {
      const dir = mkdtempSync(join(tmpdir(), 'tc pty-manager usage-shrink '))
      const transcriptPath = join(dir, 'sess.jsonl')
      writeFileSync(transcriptPath, usageRec({ output: 100 }) + '\n')
      const pins = new Map()
      const h = makeHarness(undefined, {
        pinnedSession: (id) => pins.get(id),
        setPinnedSession: (id, sid) => pins.set(id, sid),
        resolveTranscript: () => transcriptPath,
        readFrom: realReadFrom
      })
      await h.manager.create(spec('p13', '/bin/sh', ['-c', 'sleep 30'], 'claude-code'))
      const gotFirst = await waitFor(() => usageEvents(h, 'p13').length > 0, 6000)
      const firstTotal = gotFirst ? usageEvents(h, 'p13').pop().payload.usage.totals.output : undefined
      // Replace with a SHORTER file carrying DIFFERENT content — a real
      // rotation or truncation, not merely an append.
      writeFileSync(transcriptPath, usageRec({ output: 7 }) + '\n')
      const gotSecond = await waitFor(() => {
        const evs = usageEvents(h, 'p13')
        return evs.length > 0 && evs[evs.length - 1].payload.usage.totals.output === 7
      }, 6000)
      const lastTotal = usageEvents(h, 'p13').pop()?.payload.usage.totals.output
      ok('32 a shrunk transcript is re-read from zero, and the correction actually sends',
        gotFirst && firstTotal === 100 && gotSecond && lastTotal === 7,
        `first=${firstTotal} last=${lastTotal}`)
      h.manager.killAll()
    }

    // 33. Fix round: a reload never resent usage totals until the agent's
    //     next turn. detachAll() correctly KEEPS usageState (re-reading from
    //     zero would double-count), but a Cmd+R reload wipes the renderer's
    //     own usage-store, and pollUsage's only send trigger was genuinely
    //     NEW bytes — so a reattached, currently-idle panel showed "no
    //     answer yet" indefinitely despite this manager already holding its
    //     full totals. Simulates a reload with detachAll() + a second
    //     create() at the same id (check 28's own shape), runs a poll tick
    //     with NO new transcript bytes, and asserts a usage:panel message IS
    //     sent carrying the panel's EXISTING totals.
    {
      const dir = mkdtempSync(join(tmpdir(), 'tc pty-manager usage-resend '))
      const transcriptPath = join(dir, 'sess.jsonl')
      writeFileSync(transcriptPath, usageRec({ output: 42 }) + '\n')
      const pins = new Map()
      const h = makeHarness(undefined, {
        pinnedSession: (id) => pins.get(id),
        setPinnedSession: (id, sid) => pins.set(id, sid),
        resolveTranscript: () => transcriptPath,
        readFrom: realReadFrom
      })
      await h.manager.create(spec('p14', '/bin/sh', ['-c', 'sleep 30'], 'claude-code'))
      const gotFirst = await waitFor(() => usageEvents(h, 'p14').length > 0, 6000)
      h.events.splice(0, h.events.length)
      h.manager.detachAll()
      await h.manager.create(spec('p14', '/bin/sh', ['-c', 'sleep 30'], 'claude-code'))
      // The transcript has NOT changed since the first read: no new bytes at
      // all, which is exactly the case applyChunk reports as "nothing
      // changed" and would otherwise hold back forever.
      const resent = await waitFor(() => usageEvents(h, 'p14').length > 0, 6000)
      const resentTotal = resent ? usageEvents(h, 'p14').pop().payload.usage.totals.output : undefined
      ok('33 a reload forces one resend of existing totals with no new bytes',
        gotFirst && resent && resentTotal === 42, `gotFirst=${gotFirst} resent=${resent} total=${resentTotal}`)
      h.manager.killAll()
    }

    // 34. Fix round: a read landing mid-write can split a multibyte UTF-8
    //     codepoint across the boundary, and readFrom used to decode each
    //     independent byte range with .toString('utf8') directly — turning
    //     the split character into a replacement character on BOTH sides of
    //     the split, corrupting the line that straddles it. Reproduces the
    //     exact byte-level split against a REAL file and REAL readFrom (never
    //     a decoder in isolation): the transcript's own `message.model`
    //     carries an em dash (—, three UTF-8 bytes), and the file is written
    //     in two pieces whose boundary lands ONE byte into that three-byte
    //     sequence — the file's own size at the first poll IS the split
    //     point, so no timing guess is needed. Asserts the model name comes
    //     back byte-for-byte correct (not carrying a stray U+FFFD) and the
    //     turn is counted exactly once — never dropped, never duplicated.
    {
      const dir = mkdtempSync(join(tmpdir(), 'tc pty-manager usage-utf8 '))
      const transcriptPath = join(dir, 'sess.jsonl')
      const model = 'claude—5' // U+2014 EM DASH: E2 80 94 in UTF-8
      const line = JSON.stringify({
        type: 'assistant',
        cwd: '/tmp/x',
        sessionId: 's1',
        timestamp: '2026-08-30T00:00:00.000Z',
        isSidechain: false,
        message: {
          model,
          usage: {
            input_tokens: 1,
            output_tokens: 55,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          }
        }
      }) + '\n'
      const dashCharIndex = line.indexOf('—')
      const dashByteOffset = Buffer.byteLength(line.slice(0, dashCharIndex), 'utf8')
      // One byte into the three-byte sequence: the first chunk gets the
      // dash's lead byte with no continuation bytes, and the second chunk
      // gets the two orphaned continuation bytes with no lead byte — the
      // worst-case split for a naive independent decode of each half.
      const splitAt = dashByteOffset + 1
      const fullBytes = Buffer.from(line, 'utf8')
      writeFileSync(transcriptPath, fullBytes.subarray(0, splitAt))
      const pins = new Map()
      const h = makeHarness(undefined, {
        pinnedSession: (id) => pins.get(id),
        setPinnedSession: (id, sid) => pins.set(id, sid),
        resolveTranscript: () => transcriptPath,
        readFrom: realReadFrom
      })
      await h.manager.create(spec('p15', '/bin/sh', ['-c', 'sleep 30'], 'claude-code'))
      // Let at least one tick observe the split-mid-character partial file —
      // this is where the old code corrupted both halves. No newline is on
      // disk yet, so nothing should be reported as a complete turn either way.
      await sleep(2600)
      const midway = usageEvents(h, 'p15').length
      // Append the rest of the line — the file is now byte-identical to a
      // normal write, and the decoder's buffered lead byte must fold with
      // these fresh continuation bytes into the correct character.
      require('node:fs').appendFileSync(transcriptPath, fullBytes.subarray(splitAt))
      const got = await waitFor(() => usageEvents(h, 'p15').length > 0, 6000)
      const last = got ? usageEvents(h, 'p15').pop().payload.usage : undefined
      const models = last ? Object.keys(last.byModel) : []
      ok('34 a multibyte character split across a read boundary reassembles correctly',
        midway === 0 && got === true && models.length === 1 && models[0] === model &&
          last.byModel[model].output === 55 && last.turns === 1,
        `midway=${midway} models=${JSON.stringify(models)} turns=${last?.turns}`)
      h.manager.killAll()
    }

    // Check 20's obligation, inherited via 22b, 23, 24, 28, 29, 30 and 31:
    // this block must end in a definite kill-server, never a session kill
    // that leaves a stale server for the next run — see check 20's own
    // comment for why (a later run's client would reattach to a server still
    // wired to THIS run's now-deleted exitDir, and check 14 would silently
    // report the wrong exit code). Whoever appends check 32 inherits it next.
    tmuxBackend.shutdown()
  }

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
    process.exit(1)
  }
  process.exit(0)
})()
