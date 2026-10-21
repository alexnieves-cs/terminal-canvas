import { spawn } from 'node:child_process'
import { checkOutputDisplay, createOutputCapture } from '../shared/check-output'
import type { AutoCheckResult } from '../shared/auto'

/**
 * M475. The production `runCheck` for a gated auto run: one command line,
 * run by the login shell in the session's folder, stdout and stderr
 * interleaved into one bounded capture (M306's head-and-tail, so a chatty
 * test runner costs nothing and its failure summary at the end survives).
 *
 * The command runs in its OWN process group (`detached`) and a timeout or
 * an abort kills the GROUP: `npm test` is a shell, then npm, then the
 * runner, and killing only the shell leaves the runner holding the folder
 * and the result ports after the run said it stopped.
 *
 * It never rejects. Every way a check can go wrong — the shell missing, the
 * folder gone, a signal, the clock — is an `AutoCheckResult` that FAILS,
 * because the manager's rule is that only exit 0 is a pass.
 */
export function runAutoCheck(spec: { command: string; cwd: string; env: Record<string, string>; timeoutMs: number; signal: AbortSignal }): Promise<AutoCheckResult> {
  return new Promise((resolve) => {
    const capture = createOutputCapture()
    let timedOut = false
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    const done = (r: AutoCheckResult): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (onAbort !== undefined) spec.signal.removeEventListener('abort', onAbort)
      resolve(r)
    }
    const output = (): string => checkOutputDisplay(capture.snapshot())
    if (spec.signal.aborted) { done({ exitCode: null, output: '', error: 'the run stopped before the check started' }); return }
    const shell = spec.env['SHELL'] !== undefined && spec.env['SHELL'] !== '' ? spec.env['SHELL'] : '/bin/sh'
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(shell, ['-c', spec.command], { cwd: spec.cwd, env: spec.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      done({ exitCode: null, output: '', error: err instanceof Error ? err.message : String(err) })
      return
    }
    const killGroup = (): void => {
      if (child.pid === undefined) return
      try { process.kill(-child.pid, 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { /* already gone */ } }
    }
    onAbort = (): void => { killGroup() }
    spec.signal.addEventListener('abort', onAbort)
    timer = setTimeout(() => { timedOut = true; killGroup() }, spec.timeoutMs)
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => capture.push(chunk))
    child.stderr?.on('data', (chunk: string) => capture.push(chunk))
    child.on('error', (err) => done({ exitCode: null, output: output(), error: err.message }))
    child.on('close', (code) => done({ exitCode: timedOut ? null : code, output: output(), ...(timedOut ? { timedOut: true } : {}) }))
  })
}
