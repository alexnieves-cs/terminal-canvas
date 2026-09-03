import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import type { AgentProcess, AgentRunner } from './agent-runner'

/**
 * M71. The real `AgentRunner`: a headless `claude` over `child_process`.
 *
 * Imports neither `electron` nor `node-pty`, so it can be driven under plain
 * node against the real CLI by hand (the M71 build log records one such
 * run); it is NOT bundled into verify:agent-session, which stays offline.
 *
 * Three details, each with a silent failure behind it:
 *
 * - stdout goes through a StringDecoder, one per process. A read lands at
 *   any byte offset, so a multibyte codepoint routinely straddles two reads;
 *   decoding each chunk independently turns it into a replacement character
 *   on BOTH sides and the JSON line it sat in fails to parse — a delta
 *   silently dropped, or a result that never prices its turn (M17's lesson,
 *   `verify:pty-manager` 31).
 * - stderr is kept as a bounded tail and handed over on exit. The CLI's
 *   explanation for a non-zero exit ("not logged in", a bad flag) is there
 *   and nowhere else; without it an exited session says only "exited 1".
 * - `kill()` sends SIGTERM and never waits. The exit arrives through
 *   `onExit` like any other, which is what lets the manager's identity guard
 *   treat a killed process's farewell exactly like a crashed one's.
 */

const STDERR_TAIL_MAX = 4096

export const claudeCliRunner: AgentRunner = ({ command, args, cwd, env }): AgentProcess => {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    // Its own group, so a kill() reaches the CLI and nothing it spawned is
    // left holding our pipes open (a tool subprocess would otherwise keep
    // stdout alive and the exit from ever arriving).
    detached: false
  })
  const decoder = new StringDecoder('utf8')
  let stderrTail = ''
  const dataCbs: Array<(chunk: string) => void> = []
  const exitCbs: Array<(info: { code: number | null; signal: string | null; stderr?: string }) => void> = []
  let exited = false

  child.stdout.on('data', (buf: Buffer) => {
    const text = decoder.write(buf)
    if (text.length === 0) return
    for (const cb of dataCbs) cb(text)
  })
  child.stderr.on('data', (buf: Buffer) => {
    stderrTail = (stderrTail + buf.toString('utf8')).slice(-STDERR_TAIL_MAX)
  })
  const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
    if (exited) return
    exited = true
    const rest = decoder.end()
    if (rest.length > 0) for (const cb of dataCbs) cb(rest)
    const info = { code, signal, stderr: stderrTail.length > 0 ? stderrTail : undefined }
    for (const cb of exitCbs) cb(info)
  }
  child.on('exit', finish)
  // A spawn failure (ENOENT on a binary that vanished since the probe) never
  // emits 'exit'; it is an error with no code, reported as a signal-less exit
  // carrying the message so the session reads as exited, not as starting
  // forever.
  child.on('error', (error) => {
    stderrTail = (stderrTail + String(error.message)).slice(-STDERR_TAIL_MAX)
    finish(null, null)
  })
  child.stdin.on('error', () => {
    // EPIPE after the CLI exited; the exit callback carries the fact.
  })

  return {
    pid: child.pid,
    write(line) {
      if (exited || child.stdin.destroyed) return
      child.stdin.write(line + '\n')
    },
    onData(cb) {
      dataCbs.push(cb)
    },
    onExit(cb) {
      exitCbs.push(cb)
    },
    kill() {
      if (exited) return
      try {
        child.kill('SIGTERM')
      } catch {
        // Already gone; the exit callback is on its way.
      }
    }
  }
}
