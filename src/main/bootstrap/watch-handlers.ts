import { statSync } from 'node:fs'
import { spawn as spawnChild } from 'node:child_process'
import { watch as fsWatch, type FSWatcher } from 'node:fs'
import { resolveCwd } from '../pty-manager'
import { FileWatchers } from '../file-watch'
import { createWatchRunner, type WatchSpawnSpec, type WatchHandlers } from '../watch-runner'
import { TIMER_MAX_MS, TIMER_MAX_WORD, WATCH_TIMER_MIN_MS, type WatchTrigger } from '../../shared/watch-trigger'
import { watchGitHead, type GitHeadWatch } from '../git-head-watch'
import { IPC_EVENTS } from '../../shared/ipc-contract'
import type { WatcherHandlers } from '../ipc'
import { readyContents } from './context'
import type { Stores } from './stores'
import type { MainState } from './context'

/**
 * M84. THE WATCHER RUNTIME'S ARMING, which is main's alone.
 *
 * `watch-runner.ts` answers "run it and tell me how it went"; the four kinds
 * of trigger are armed here, and all four call the SAME `fire`. A second path
 * into a run would be a watcher that runs twice for one save.
 *
 * Nothing here allocates a pty: a watcher's process is an ordinary
 * `child_process.spawn` with its output read as bytes and kept only as a
 * capped tail. That is what lets a canvas hold twenty watchers.
 *
 * A `panel` trigger is armed by the RENDERER, not here: it is the side that
 * already learns every exit and every turn's end (it draws the handoff edges
 * from exactly those events), and it decides with `handoffFires` — the same
 * one table — before calling `watcher:run`. Arming it here would need main to
 * learn panel endings a second way, and the two paths would disagree only in
 * the cases nobody tests.
 */
export interface WatchWiring {
  handlers: WatcherHandlers
  /** Read by the quit sequence: a watcher's child is an ordinary process nothing else reaches. */
  runner: { disposeAll(): void }
}

export function createWatchWiring(state: MainState, stores: Stores): WatchWiring {
  const { layoutStore, runLedger } = stores
  const watchFileWatchers = new FileWatchers()
  const watchDirWatchers = new Map<string, FSWatcher>()
  const watchTimers = new Map<string, NodeJS.Timeout>()
  const watchGitWatchers = new Map<string, GitHeadWatch>()
  const watchTriggers = new Map<string, WatchTrigger>()

  const watchRunner = createWatchRunner({
    spawn: (spec: WatchSpawnSpec, handlers: WatchHandlers) => {
      const child = spawnChild(spec.command, [...spec.args], { cwd: spec.cwd, env: state.loginEnv, shell: false })
      // stdout and stderr into ONE tail, in arrival order: a failing command
      // says why on stderr and what it was doing on stdout, and two separate
      // streams in a 340px body would interleave wrongly anyway.
      // M660. Decoded per stream, so a character split across two reads
      // arrives whole instead of as two replacement marks.
      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => handlers.onData(chunk))
      child.stderr?.on('data', (chunk: string) => handlers.onData(chunk))
      // `error` is a spawn failure (ENOENT for a command that is not there),
      // which must reach the same exit arm rather than vanishing: a watcher
      // that shows `working` forever because its command does not exist is
      // this milestone's worst silent failure. M660: it did vanish — a
      // failed spawn emits `error` and never `exit`, so the message landed
      // and the state stayed `running` for good. A spawn that never started
      // (no pid) now exits 127, the shell's own "command not found".
      let exited = false
      const exit = (code: number | null, signal: NodeJS.Signals | null): void => {
        if (exited) return
        exited = true
        handlers.onExit(code, signal)
      }
      child.on('error', (error: Error) => {
        handlers.onData(`${error.message}\n`)
        if (child.pid === undefined) exit(127, null)
      })
      child.on('exit', exit)
      return { kill: (sig?: string) => { try { child.kill((sig ?? 'SIGTERM') as NodeJS.Signals) } catch { /* already gone */ } } }
    },
    now: () => Date.now(),
    ledger: { append: (row) => runLedger.append(row) },
    // M286. What the run tested: the tree at the watcher's cwd against its HEAD.
    identityOf: (cwd) => stores.reviewEngine.identityAtHead(cwd),
    // M306. Each run's exact output, whole, as it ends — mirrored in panels-harness.cjs.
    outputs: stores.checkOutputs,
    onState: (id, watchState) => {
      // sendToRenderer OPENS a window when there is none (macOS's closed-window
      // state), so a timer watcher's tick would pop the app back open while
      // nobody is looking (M84's verifier). A state event is news for a window
      // that exists; there is no window to tell otherwise.
      readyContents(state)?.send(IPC_EVENTS.WATCHER_STATE, { id, ...watchState })
    }
  })

  const disarmWatch = (id: string): void => {
    watchFileWatchers.close(id)
    const dir = watchDirWatchers.get(id)
    if (dir !== undefined) { dir.close(); watchDirWatchers.delete(id) }
    const git = watchGitWatchers.get(id)
    if (git !== undefined) { git.close(); watchGitWatchers.delete(id) }
    const timer = watchTimers.get(id)
    if (timer !== undefined) { clearInterval(timer); watchTimers.delete(id) }
    watchTriggers.delete(id)
  }

  /**
   * M84. Watchers main is still arming for panels that no longer exist.
   *
   * Arming is the renderer's gesture and disarming is too, so any path that
   * removes a panel WITHOUT passing through close, undo, reset or workspace
   * delete — a reload, a crash and reopen — leaves main holding an interval
   * and a recursive watch that go on RUNNING THE COMMAND for a node nobody
   * can see or stop. Main reconciles against its own layout store, which is
   * the only place that knows every workspace's panels.
   */
  const reconcileWatchers = (): void => {
    const known = new Set<string>()
    // mergedWorkspaces() is the one reader that carries every workspace's
    // whole panels — a rail row's panelIds would do here too, but this is the
    // API that already exists and it copies what it returns.
    for (const workspace of layoutStore.mergedWorkspaces()) {
      for (const panel of workspace.panels) if (panel.kind === 'watcher') known.add(panel.id)
    }
    for (const id of watchRunner.ids()) {
      if (!known.has(id)) { disarmWatch(id); watchRunner.remove(id) }
    }
  }

  const handlers: WatcherHandlers = {
    create: (req) => {
      reconcileWatchers()
      const cwd = resolveCwd(req.cwd)
      let isDir = false
      try { isDir = statSync(cwd).isDirectory() } catch { isDir = false }
      if (!isDir) return { ok: false, reason: `no such directory: ${req.cwd}` }
      if (req.command.trim() === '') return { ok: false, reason: 'a watcher needs a command to run' }
      // M660. Checked BEFORE the runner learns the watcher: a refusal that
      // came after `add` left a watcher the canvas was told does not exist.
      if (req.armed !== false && req.trigger.kind === 'timer') {
        if (req.trigger.everyMs < WATCH_TIMER_MIN_MS) return { ok: false, reason: `the shortest interval is ${WATCH_TIMER_MIN_MS / 1000}s` }
        if (req.trigger.everyMs > TIMER_MAX_MS) return { ok: false, reason: TIMER_MAX_WORD }
      }
      // Idempotent at an id: a restored canvas re-creates every watcher it
      // holds, and a second arm on the same id would double every trigger —
      // one save, two runs, forever, with nothing on screen saying why.
      disarmWatch(req.id)
      watchRunner.add({ id: req.id, cwd, command: req.command, args: req.args, trigger: req.trigger })
      watchTriggers.set(req.id, req.trigger)
      // Disarmed on purpose: the watcher is KNOWN (it can still be run by
      // hand, and its last run is still its state) and nothing is armed. This
      // is a pause, not a delete — the node says which it is.
      if (req.armed === false) return { ok: true }
      const trigger = req.trigger
      if (trigger.kind === 'git-ref') {
        // M660. The commit HEAD names, watched through the git dir — see
        // git-head-watch.ts for why `.git/HEAD`'s own text never moved on a
        // commit, and why a linked worktree had no `.git/HEAD` to watch.
        const root = resolveCwd(trigger.root)
        let w: GitHeadWatch | null
        try {
          w = watchGitHead(root, () => watchRunner.fire(req.id), (error) => {
            disarmWatch(req.id)
            readyContents(state)?.send(IPC_EVENTS.WATCHER_STATE, { id: req.id, ...(watchRunner.stateOf(req.id) ?? { status: 'not-started' as const, tail: '', pending: false }), disarmed: `stopped watching ${root}: ${error.message}` })
          })
        } catch (error) {
          disarmWatch(req.id)
          return { ok: false, reason: `could not watch ${root}: ${String(error)}` }
        }
        if (w === null) {
          disarmWatch(req.id)
          return { ok: false, reason: `${root} is not a git working tree — nothing to watch` }
        }
        watchGitWatchers.set(req.id, w)
      } else if (trigger.kind === 'path') {
        // A file and a DIRECTORY are watched differently, and getting this
        // wrong is silent: `FileWatchers` watches a file by watching its
        // parent and filtering on its basename (M22's atomic-rename rule,
        // which is how every editor and every agent writes a file), and
        // handed a directory it reads it as a file and refuses. A directory
        // is watched recursively instead — the commonest trigger of all is
        // "anything under src".

        const target = resolveCwd(trigger.path)
        let isDirTarget = false
        try { isDirTarget = statSync(target).isDirectory() } catch { isDirTarget = false }
        if (isDirTarget) {
          try {
            // Coalesced by the runner itself (one run at a time, one pending),
            // so a save that touches forty files is one run.
            const w = fsWatch(target, { persistent: false, recursive: true }, () => watchRunner.fire(req.id))
            // An FSWatcher is an EventEmitter, and an unhandled `error` event
            // THROWS in the main process — deleting or unmounting a watched
            // directory is an ordinary thing to do, and without this arm it
            // takes the whole app down (M84's verifier).
            w.on('error', (error: Error) => {
              disarmWatch(req.id)
              readyContents(state)?.send(IPC_EVENTS.WATCHER_STATE, { id: req.id, ...(watchRunner.stateOf(req.id) ?? { status: 'not-started' as const, tail: '', pending: false }), disarmed: `stopped watching ${target}: ${error.message}` })
            })
            watchDirWatchers.set(req.id, w)
          } catch (error) {
            disarmWatch(req.id)
            return { ok: false, reason: `could not watch ${target}: ${String(error)}` }
          }
        } else {
          const first = watchFileWatchers.watch(req.id, target, () => watchRunner.fire(req.id))
          if (first.kind === 'missing' || first.kind === 'unreadable') {
            disarmWatch(req.id)
            return { ok: false, reason: `nothing to watch at ${target}` }
          }
        }
      } else if (trigger.kind === 'timer') {
        const timer = setInterval(() => watchRunner.fire(req.id), trigger.everyMs)
        // Never keep the app alive for a watcher: quitting with a timer armed
        // must exit, not wait for the next tick.
        timer.unref?.()
        watchTimers.set(req.id, timer)
      }
      return { ok: true }
    },
    run: (id) => watchRunner.fire(id),
    stop: (id) => watchRunner.stop(id),
    dispose: (id) => { disarmWatch(id); watchRunner.remove(id) },
    list: () => watchRunner.ids().map((id) => ({ id, ...(watchRunner.stateOf(id) ?? { status: 'not-started' as const, tail: '', pending: false }) }))
  }

  return { handlers, runner: watchRunner }
}
