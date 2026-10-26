import { join } from 'node:path'
import type { GitRunner } from './review-engine'
import type { AgentRunner } from './agent-runner'
import type { Lesson } from '../shared/lessons'
import type { RuleDraft } from '../shared/lesson-proposal'
import { PROOF_TAIL_MAX, applyRule, changedFromNameStatus, failedProof, judgeProof, replayBaseline, ruleFilePath, ruleFileSteps, type ProofRecord } from '../shared/lesson-proof'
import { CONTENT_DIFF_CONFIG } from './git-args'

/**
 * M573–M575 (lane O). The replay: the earlier task, run again by an agent in
 * a THROWAWAY worktree at the lesson's baseline, with the drafted rule
 * written where the agent reads standing instructions, then the task's
 * check, then the diff — judged by `judgeProof` (shared/lesson-proof.ts).
 *
 * WHAT IT TOUCHES, and nothing else:
 *
 * - a detached worktree under `userData/worktrees/proof-*` — never a branch
 *   (nothing to clean up in the person's refs), never the person's checkout,
 *   index or stash. It is removed with `--force` on every way out (the one
 *   place this app passes --force to `worktree remove`: the tree is ours,
 *   made a minute ago, and its changes are the replay's, not anyone's work).
 * - the repository's SAVED setup, run in the worktree first (`prepare`), so a
 *   check like `npm test` has its dependencies. A draft setup never runs.
 * - one headless agent that can read and edit files and nothing else:
 *   `--tools` names the file tools only, so no shell exists for an allow
 *   rule in anyone's settings to open (`acceptEdits` alone was not enough —
 *   M573's critic); `disableAllHooks` so a repository's hooks run no
 *   command either; `--strict-mcp-config` loads no MCP server
 *   (lesson-proposer.ts says why). Bounded in turns and time, and killed on
 *   quit (`stop`). The person turned this on (`learn.agents`) and pressed Prove.
 *
 * The rule is written, the setup run, and THAT tree recorded (`write-tree`,
 * which makes no ref) before the agent starts; the judge reads the diff
 * against it. So neither the rule nor an `npm install`'s lockfile reads as
 * the agent's work, and a change to the rule's own file is the agent
 * editing the rule. The rule is never written through a symlink: a linked
 * CLAUDE.md or `.claude/skills` would carry it out of the scratch tree into
 * the person's real file.
 *
 * Pure over injected deps; `verify:learn learn.proof.*` drives every branch
 * with fakes. Real git, claude and the shell are wired in bootstrap.
 */

export const PROOF_AGENT_TIMEOUT_MS = 20 * 60_000
export const PROOF_CHECK_TIMEOUT_MS = 15 * 60_000
export const PROOF_MAX_TURNS = 40

export const REPLAY_SYSTEM_PROMPT = [
  'You are replaying a task in a scratch copy of the repository, to test whether a standing rule works.',
  'Do the task as you normally would. Follow the repository\'s CLAUDE.md and skills. Do not ask questions: nobody will answer.'
].join('\n')

/**
 * The file tools, and only those: the AGENT can run no command. The check
 * that follows runs whatever the tree then holds — a `package.json` script
 * the agent rewrote included — so the verdict names the check's own files
 * when the replay changed them (`judgeProof`), for the person to look at
 * before Accept.
 */
export const REPLAY_TOOLS = 'Read,Edit,Write,Glob,Grep'

export function replayArgs(brief: string): string[] {
  return [
    '-p', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--tools', REPLAY_TOOLS,
    '--settings', JSON.stringify({ disableAllHooks: true }), '--strict-mcp-config',
    '--max-turns', String(PROOF_MAX_TURNS), '--append-system-prompt', REPLAY_SYSTEM_PROMPT, '--', brief
  ]
}

/** git's porcelain defaults pinned, renames off (a moved file is its old path deleted and its new one added). */
const pinned = (cwd: string, args: readonly string[]): string[] => ['-C', cwd, ...CONTENT_DIFF_CONFIG.flatMap((c) => ['-c', c]), ...args]

export interface ProofRunnerDeps {
  run: GitRunner
  worktreesDir: string
  readFile: (path: string) => string | null
  /** Creates the parent directories. */
  writeFile: (path: string, text: string) => void
  /** Best-effort recursive removal, for a worktree git could not remove. */
  removeDir: (path: string) => void
  /** Whether this path exists as a symbolic link (lstat, never followed). */
  isLink: (path: string) => boolean
  /** The names in a directory; [] when it is absent. */
  listDir: (dir: string) => string[]
  /** The saved setup's install steps in a lane; `no-setup` is fine. */
  prepare: (lane: string) => Promise<{ kind: 'prepared' | 'no-setup' } | { kind: 'failed' | 'unreadable'; detail: string }>
  runner: AgentRunner
  command: () => string
  env: () => Record<string, string>
  /** The signal is aborted by `stop` (a quit), so a 15-minute check does not outlive the app. */
  runCheck: (spec: { command: string; cwd: string; timeoutMs: number; signal: AbortSignal }) => Promise<{ exitCode: number | null; output: string }>
  now: () => number
  agentTimeoutMs?: number
  checkTimeoutMs?: number
}

export interface ProofRequest {
  root: string
  rule: RuleDraft
  lessons: readonly Lesson[]
  brief: string
  /** Empty when the task has none: the verdict is then `no-check`, never a pass. */
  check: string
}

export interface ProofRunner {
  run: (req: ProofRequest) => Promise<ProofRecord>
  /** Kill the running replay's agent — on quit, so it does not run on, billing, in an orphaned tree. */
  stop: () => void
  /**
   * Remove every `proof-*` tree a crash left behind. Run at the start of each
   * replay, never at boot: main builds this before the single-instance lock
   * is checked, and a second launch must not remove the first one's live tree.
   */
  sweep: () => void
}

export function createProofRunner(deps: ProofRunnerDeps): ProofRunner {
  const agentTimeout = deps.agentTimeoutMs ?? PROOF_AGENT_TIMEOUT_MS
  const checkTimeout = deps.checkTimeoutMs ?? PROOF_CHECK_TIMEOUT_MS
  let live: ReturnType<AgentRunner> | null = null
  let abort: AbortController | null = null

  const replay = (cwd: string, brief: string): Promise<{ ok: true } | { ok: false; reason: string }> => new Promise((settle) => {
    let done = false
    const finish = (v: { ok: true } | { ok: false; reason: string }): void => { if (!done) { done = true; clearTimeout(timer); settle(v) } }
    let proc: ReturnType<AgentRunner>
    try {
      proc = deps.runner({ command: deps.command(), args: replayArgs(brief), cwd, env: deps.env(), closeStdin: true })
    } catch (error) {
      settle({ ok: false, reason: `the agent could not start: ${error instanceof Error ? error.message : String(error)}` })
      return
    }
    // Settled before the kill, so the hang is what the person reads (lesson-proposer.ts's rule).
    const timer = setTimeout(() => { finish({ ok: false, reason: `the replay took longer than ${Math.round(agentTimeout / 60000)} minutes and was stopped` }); proc.kill() }, agentTimeout)
    live = proc
    proc.onData(() => { /* the answer is the worktree, not the text */ })
    proc.onExit((info) => {
      if (live === proc) live = null
      // A run that hit its turn limit exits non-zero but may have done the
      // work; the diff and the check are the judge, so only a process that
      // never ran is a failed replay.
      if (info.code === null && info.signal !== null) finish({ ok: false, reason: `the replay was stopped (${info.signal})` })
      else finish({ ok: true })
    })
  })

  const sweep = (): void => {
    for (const name of deps.listDir(deps.worktreesDir)) if (/^proof-[0-9a-z]+$/.test(name)) deps.removeDir(join(deps.worktreesDir, name))
  }

  const run = async (req: ProofRequest): Promise<ProofRecord> => {
    const started = deps.now()
    const took = (): number => deps.now() - started
    const base = replayBaseline(req.lessons)
    if (base === null) return failedProof(req.rule, '', 'none of these lessons kept the commit its work was made on, so there is nothing to replay from', deps.now(), 0)
    if (req.brief.trim() === '') return failedProof(req.rule, base.sha, 'the replay needs the task it repeats — write the brief first', deps.now(), 0)

    const path = join(deps.worktreesDir, `proof-${started.toString(36)}`)
    const controller = new AbortController()
    abort = controller
    // One replay at a time in this process (learn.ts's lock), so any proof tree
    // still on disk is a crash's: removed, and its git record pruned.
    sweep()
    await deps.run(['-C', req.root, 'worktree', 'prune']).catch(() => null)
    const added = await deps.run(['-C', req.root, 'worktree', 'add', '--detach', path, base.sha])
    if (!added.ok) return failedProof(req.rule, base.sha, `the replay's worktree could not be made: ${(added.stderr || 'git refused').trim().split('\n')[0]}`, deps.now(), took())
    try {
      const linked = ruleFileSteps(req.rule).find((step) => deps.isLink(join(path, step)))
      if (linked !== undefined) return failedProof(req.rule, base.sha, `${linked} is a link in this repository, so the trial rule would be written outside the scratch copy — the replay was not run`, deps.now(), took())
      const file = join(path, ruleFilePath(req.rule))
      deps.writeFile(file, applyRule(req.rule, deps.readFile(file)))

      const prepared = await deps.prepare(path)
      if (prepared.kind === 'failed' || prepared.kind === 'unreadable') return failedProof(req.rule, base.sha, `the repository's setup failed in the replay: ${prepared.detail}`, deps.now(), took())

      // The tree the agent starts from: rule written, setup run. Staged in
      // the throwaway tree's own index, so new files are in it — and the
      // rule's file forced in, because `.claude/` is often gitignored and an
      // ignored rule file would let the agent edit it unseen (M576's critic).
      const ruleRel = ruleFilePath(req.rule)
      const stage = async (): Promise<void> => {
        await deps.run(['-C', path, 'add', '-A'])
        await deps.run(['-C', path, 'add', '-f', '--', ruleRel])
      }
      await stage()
      const start = await deps.run(['-C', path, 'write-tree'])
      const tree = start.stdout.trim()
      if (!start.ok || !/^[0-9a-f]{40,64}$/.test(tree)) return failedProof(req.rule, base.sha, 'the scratch copy could not be recorded before the replay', deps.now(), took())

      // The worktree's `.git` is a FILE naming its git directory. An agent
      // with Write could point it at the person's repository, and the
      // `add -A` below would then stage the scratch tree into their index:
      // read it now, and refuse to run git there if it changed.
      const gitLink = deps.readFile(join(path, '.git'))

      const ran = await replay(path, req.brief)
      if (!ran.ok) return failedProof(req.rule, base.sha, ran.reason, deps.now(), took())
      if (deps.readFile(join(path, '.git')) !== gitLink) return failedProof(req.rule, base.sha, 'the replay changed the scratch copy\'s .git link, so its work was not read — prove it again', deps.now(), took())

      await stage()
      const names = await deps.run(pinned(path, ['diff-index', '--cached', '--name-status', '-z', '--no-renames', tree]))
      const diff = await deps.run(pinned(path, ['diff-index', '--cached', '-p', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', tree]))
      if (!names.ok || !diff.ok) return failedProof(req.rule, base.sha, 'the replay\'s changes could not be read', deps.now(), took())

      const command = req.check.trim()
      if (controller.signal.aborted) return failedProof(req.rule, base.sha, 'the replay was stopped when the app quit', deps.now(), took())
      const check = command === '' ? null : await deps.runCheck({ command, cwd: path, timeoutMs: checkTimeout, signal: controller.signal })
        .then((r) => ({ command, exitCode: r.exitCode, tail: r.output.slice(-PROOF_TAIL_MAX) }))
      return judgeProof({ lessons: req.lessons, rule: req.rule, baseline: base.sha, diff: diff.stdout, changed: changedFromNameStatus(names.stdout), check, at: deps.now(), durationMs: took() })
    } catch (error) {
      return failedProof(req.rule, base.sha, `the replay stopped on an error: ${error instanceof Error ? error.message : String(error)}`, deps.now(), took())
    } finally {
      if (abort === controller) abort = null
      const removed = await deps.run(['-C', req.root, 'worktree', 'remove', '--force', path]).catch(() => null)
      if (removed === null || !removed.ok) {
        deps.removeDir(path)
        await deps.run(['-C', req.root, 'worktree', 'prune']).catch(() => null)
      }
    }
  }

  return { run, stop: () => { abort?.abort(); live?.kill() }, sweep }
}
