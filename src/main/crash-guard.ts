/**
 * M650. THE MAIN PROCESS'S LAST LISTENER.
 *
 * Until M650 nothing in main listened for `uncaughtException` or
 * `unhandledRejection`. What that meant, case by case:
 *
 * - An exception on a timer or a socket callback raised Electron's own modal
 *   ("A JavaScript error occurred in the main process") and the app carried
 *   on behind it — at 3am, with nobody to press OK, on top of every window.
 * - A rejection nobody awaited printed a warning to a stdout a packaged app
 *   does not have, and was gone.
 * - A throw inside `app.whenReady().then(async …)` — the whole boot — became
 *   an unhandled rejection that left the app running with NO WINDOW, forever
 *   (`bootstrap/telemetry-init.ts` names this failure and guards its own
 *   corner of it).
 * - A renderer that crashed left a blank window: the PTYs were detached
 *   (`window-lifecycle.ts`) and nothing ever loaded the page again.
 *
 * And in none of them was anything written down. This module is the
 * decision for each, as pure functions over injected collaborators so
 * `verify:file crash.*` runs it under plain node:
 *
 * 1. **Everything is recorded, scrubbed, on this machine.** One JSON line per
 *    event in `userData/crash-log.jsonl`, ring-trimmed. The words go through
 *    telemetry's own scrubber (userData and home replaced, then
 *    `redactSecrets`), because an error message quotes whatever was in hand
 *    when it was thrown — a path, a command line, a URL with a token in it.
 *    Nothing here SENDS anything: whether a report leaves the machine is
 *    `telemetryPlan`'s decision alone (`telemetry.ts`).
 * 2. **After boot, main keeps running.** The agents in the panels are worth
 *    more than a clean process: on the direct backend, exiting main kills
 *    every one of them, to protect against a state corruption that has not
 *    been shown to exist. This is what Electron's default did too, minus the
 *    modal.
 * 3. **During boot, a failure is fatal and says so.** There is no window to
 *    carry on behind, so the choice is a dialog and an exit, or a process
 *    that looks like an app and is not one.
 * 4. **A crashed renderer is loaded again**, at most `RELOAD_LIMIT` times a
 *    minute — a page that dies on load must not become a loop. On tmux the
 *    sessions reattach; that is what `window-lifecycle.ts`'s detach is for.
 * 5. **A storm writes a bounded log.** A timer that throws every 16 ms would
 *    otherwise be a disk write every 16 ms; past `RECORD_LIMIT` a minute,
 *    events are counted, not written.
 */
import { appendFileSync } from 'node:fs'
import { keepNewestLines } from './atomic-file'
import { scrubText, type ScrubPaths } from './telemetry'

export type CrashKind = 'uncaught-exception' | 'unhandled-rejection' | 'boot-failure' | 'renderer-gone' | 'child-gone'

export interface CrashRecord {
  /** Epoch ms. */
  at: number
  kind: CrashKind
  /** `boot` until the first window exists. */
  phase: 'boot' | 'running'
  name: string
  message: string
  stack: string
  version: string
  /** How many secrets the scrubber replaced across the three strings. */
  redactions: number
}

/** A stack is evidence, not a transcript: enough frames to find the line. */
const STACK_MAX = 4000
const MESSAGE_MAX = 1000
/** What the scrubber is handed at most; the kept strings are cut AFTER it runs. */
const SCRUB_INPUT_MAX = 200_000
/** Records kept on disk; older ones fall off the front. */
export const CRASH_LOG_MAX = 100
/** Records written per minute before a storm is only counted. */
export const RECORD_LIMIT = 20
/** Renderer reloads per minute before a crashing page is left alone. */
export const RELOAD_LIMIT = 3
const WINDOW_MS = 60_000

/**
 * A thrown value is `unknown`: an Error, a string, `undefined`, an object a
 * library rejected with. Each becomes the same three strings, never a throw —
 * the function that records a crash must not be a second one.
 */
export function crashRecord(kind: CrashKind, reason: unknown, ctx: { now: number; version: string; phase: 'boot' | 'running'; paths: ScrubPaths }): CrashRecord {
  let name = 'Error'
  let message = ''
  let stack = ''
  try {
    if (reason instanceof Error) {
      name = typeof reason.name === 'string' && reason.name !== '' ? reason.name : 'Error'
      message = typeof reason.message === 'string' ? reason.message : ''
      stack = typeof reason.stack === 'string' ? reason.stack : ''
    } else if (typeof reason === 'string') {
      name = 'NonError'
      message = reason
    } else {
      name = 'NonError'
      message = reason === undefined ? 'undefined' : JSON.stringify(reason) ?? String(reason)
    }
  } catch {
    // A getter that throws, a cyclic object: say that, and keep the record.
    name = 'NonError'
    message = 'a value that could not be described'
  }
  // SCRUB, THEN CUT — never the other way. A cut first can end inside a key's
  // envelope or halfway through a token, and the half that is left no longer
  // matches the rule that would have removed it. The input is bounded first
  // only against a pathological megabyte message, far above either limit.
  const n = scrubText(name.slice(0, SCRUB_INPUT_MAX), ctx.paths)
  const m = scrubText(message.slice(0, SCRUB_INPUT_MAX), ctx.paths)
  const s = scrubText(stack.slice(0, SCRUB_INPUT_MAX), ctx.paths)
  return { at: ctx.now, kind, phase: ctx.phase, name: n.text.slice(0, 200), message: m.text.slice(0, MESSAGE_MAX), stack: s.text.slice(0, STACK_MAX), version: ctx.version, redactions: n.count + m.count + s.count }
}

export interface CrashLog {
  append(record: CrashRecord): void
}

/** Never throws: a full disk is how some of these crashes start. */
export function createCrashLog(opts: { file: string | (() => string); max?: number }): CrashLog {
  const max = opts.max ?? CRASH_LOG_MAX
  return {
    append(record) {
      try {
        // Resolved per write when given as a function: main retargets
        // userData after the guard is installed (the fixture switch), and a
        // path captured at install would write into the real profile.
        const file = typeof opts.file === 'function' ? opts.file() : opts.file
        appendFileSync(file, `${JSON.stringify(record)}\n`)
        keepNewestLines(file, max)
      } catch { /* the console line the guard prints is the record that remains */ }
    }
  }
}

/** Why a renderer went away, as Electron names it. Only these mean "it broke". */
const RELOAD_REASONS = new Set(['crashed', 'oom', 'launch-failed', 'integrity-failure', 'abnormal-exit'])

export interface CrashGuardDeps {
  /** `process`, narrowed to what is used so a check can hand in an emitter. */
  proc: { on(event: 'uncaughtException' | 'unhandledRejection', listener: (reason: unknown) => void): unknown }
  log: CrashLog
  now(): number
  version: string
  /** Read per event: `app.getPath` is not valid before `ready` on every platform. */
  paths(): ScrubPaths
  /** Has the first window been created? Read per event. */
  booted(): boolean
  /** Tell the person and exit. Called for a boot-phase exception or a failed boot, once. */
  fatal(record: CrashRecord): void
  /** The console, injected so a check can read what was said. */
  say?(line: string): void
}

export interface CrashGuard {
  /** Record one event; returns the record, or null when a storm suppressed it. */
  report(kind: CrashKind, reason: unknown): CrashRecord | null
  /** The whole boot rejected: record it and end the process through `fatal`. */
  bootFailed(reason: unknown): void
  /** A renderer went away for `reason`: should its page be loaded again? Counts the reload it grants. */
  shouldReload(reason: string): boolean
  /** Events dropped by the storm limit since launch. */
  suppressed(): number
}

export function installCrashGuard(deps: CrashGuardDeps): CrashGuard {
  const say = deps.say ?? ((line: string) => console.error(line))
  const written: number[] = []
  const reloads: number[] = []
  let suppressed = 0
  let dead = false

  const within = (times: number[], now: number): number => {
    while (times.length > 0 && now - times[0]! > WINDOW_MS) times.shift()
    return times.length
  }

  // `always` is for the events that END the process: a storm of strays must
  // never be what keeps a fatal failure from being recorded and acted on.
  const report = (kind: CrashKind, reason: unknown, always = false): CrashRecord | null => {
    const now = deps.now()
    if (!always && within(written, now) >= RECORD_LIMIT) {
      suppressed += 1
      return null
    }
    written.push(now)
    let paths: ScrubPaths = { userData: '', home: '' }
    try { paths = deps.paths() } catch { /* before ready: scrubbed for secrets, paths left */ }
    const record = crashRecord(kind, reason, { now, version: deps.version, phase: deps.booted() ? 'running' : 'boot', paths })
    deps.log.append(record)
    say(`[crash] ${record.kind} (${record.phase}): ${record.name}: ${record.message}${record.stack === '' ? '' : `\n${record.stack}`}`)
    return record
  }

  const die = (record: CrashRecord | null): void => {
    if (dead || record === null) return
    dead = true
    deps.fatal(record)
  }

  deps.proc.on('uncaughtException', (reason) => {
    const boot = !deps.booted()
    const record = report('uncaught-exception', reason, boot)
    if (boot) die(record)
  })
  // Never fatal on its own, in either phase: a stray rejection during boot
  // (a probe that timed out, an account refresh) is not the boot failing.
  // The boot's OWN rejection arrives through `bootFailed`, by name.
  deps.proc.on('unhandledRejection', (reason) => { report('unhandled-rejection', reason) })

  return {
    report: (kind, reason) => report(kind, reason),
    // The boot's promise can reject AFTER the window exists (the sequence
    // goes on past it: the launcher, the menu bar, the cloud lanes). That is
    // a degraded app with a window and maybe reattached agents, and rule 2
    // holds: record it and keep running. Only a failure with no window ends
    // the process.
    bootFailed(reason) {
      const boot = !deps.booted()
      const record = report('boot-failure', reason, true)
      if (boot) die(record)
    },
    shouldReload(reason) {
      if (!RELOAD_REASONS.has(reason)) return false
      const now = deps.now()
      if (within(reloads, now) >= RELOAD_LIMIT) return false
      reloads.push(now)
      return true
    },
    suppressed: () => suppressed
  }
}
