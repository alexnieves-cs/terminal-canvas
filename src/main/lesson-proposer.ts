import type { AgentRunner } from './agent-runner'
import type { Lesson } from '../shared/lessons'
import { PROPOSAL_SCHEMA, PROPOSAL_SYSTEM_PROMPT, lessonsToSend, parseProposalReply, proposalPrompt, type RuleDraft } from '../shared/lesson-proposal'

/**
 * M571 (lane O). The ONE headless agent run that drafts a rule from related
 * lessons — M252's tool generator's contract, not an agent session:
 *
 *   claude -p --output-format json --tools "" --json-schema <schema>
 *          --append-system-prompt <how to answer> -- <the fenced lessons>
 *
 * No tools: it cannot read, write or run anything, so the only thing it can
 * do is answer. Its cwd is the repository, so the CLI loads that
 * repository's CLAUDE.md and the agent sees the rules already there. The
 * answer is a draft and nothing more: this module writes nothing.
 *
 * Over an injected `AgentRunner`, so `verify:learn` counts spawns, kills and
 * argv with a fake; the real `claudeCliRunner` is wired in bootstrap.
 */

export const PROPOSE_TIMEOUT_MS = 180_000

/** How long a killed run may take to exit before the next press is allowed anyway. */
export const PROPOSE_KILL_GRACE_MS = 10_000

/**
 * `--strict-mcp-config` with no `--mcp-config`: `--tools ""` empties the
 * BUILT-IN set, and MCP servers from the person's config or the repository's
 * `.mcp.json` would otherwise still load — with lessons as input, an allowed
 * MCP tool is a door out (M571's critic). Measured against the real CLI by
 * hand only; listed as manual-only in bold.md's O decisions.
 */
export function proposeArgs(lessons: readonly Lesson[]): string[] {
  return ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--json-schema', JSON.stringify(PROPOSAL_SCHEMA), '--append-system-prompt', PROPOSAL_SYSTEM_PROMPT, '--', proposalPrompt(lessonsToSend(lessons))]
}

export interface LessonProposerDeps {
  runner: AgentRunner
  /** The resolved `claude` binary — the SAME `claudePath` sessions use. */
  command: () => string
  env: () => Record<string, string>
  timeoutMs?: number
}

export type ProposeOutcome = { kind: 'draft'; draft: RuleDraft } | { kind: 'refused'; reason: string }

export function createLessonProposer(deps: LessonProposerDeps): (root: string, lessons: readonly Lesson[]) => Promise<ProposeOutcome> {
  const timeoutMs = deps.timeoutMs ?? PROPOSE_TIMEOUT_MS
  return async (root, lessons) => {
    if (lessons.length === 0) return { kind: 'refused', reason: 'there are no lessons to draft a rule from' }
    const answered = await new Promise<{ kind: 'answered'; stdout: string } | { kind: 'refused'; reason: string }>((settle) => {
      let stdout = ''
      let done = false
      const finish = (v: { kind: 'answered'; stdout: string } | { kind: 'refused'; reason: string }): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        settle(v)
      }
      let proc: ReturnType<AgentRunner>
      try {
        proc = deps.runner({ command: deps.command(), args: proposeArgs(lessons), cwd: root, env: deps.env(), closeStdin: true })
      } catch (error) {
        settle({ kind: 'refused', reason: `the agent could not start: ${error instanceof Error ? error.message : String(error)}` })
        return
      }
      // The refusal is settled BEFORE the kill: a runner may report the
      // killed process's exit synchronously, and that exit must not be what
      // the person reads ("exited with SIGTERM" says nothing about a hang).
      // On a timeout the answer waits for the killed process to EXIT (or a
      // grace period): the caller's one-at-a-time lock is released when this
      // resolves, and a press before the old run is gone would be two bills.
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        const refusal = { kind: 'refused' as const, reason: `the agent took longer than ${Math.round(timeoutMs / 1000)}s — it was stopped and nothing was drafted` }
        const grace = setTimeout(() => finish(refusal), PROPOSE_KILL_GRACE_MS)
        proc.onExit(() => { clearTimeout(grace); finish(refusal) })
        proc.kill()
      }, timeoutMs)
      proc.onData((chunk) => { stdout += chunk })
      proc.onExit((info) => {
        if (timedOut) return
        if (info.code === 0) finish({ kind: 'answered', stdout })
        else finish({ kind: 'refused', reason: `the agent could not draft a rule: ${info.stderr?.trim() || `it exited with ${info.code ?? info.signal ?? 'no code'}`}` })
      })
    })
    if (answered.kind === 'refused') return answered
    return parseProposalReply(answered.stdout)
  }
}
