import { existsSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { WorktreeRecord } from '../shared/layout-schema'
import type { WorktreeOutcome } from '../shared/types'
import { buildBranchExistsArgs, buildWorktreeAddArgs, buildWorktreeRemoveArgs } from './git-args'
import type { GitRunner, RepoAnswer } from './review-engine'
import { worktreeBranch, worktreePath } from './worktree'

/**
 * M37. The half of "a git worktree per panel" that runs git and keeps records.
 *
 * Every dependency is INJECTED — the runner, the repo resolver, the record
 * store, the clock — for the trade review-engine.ts and credential-store.ts
 * make: the whole create/reuse/refuse/remove story is then driven under plain
 * node in verify:review against a real temporary repository, with no
 * Electron and no real userData anywhere in earshot. node:fs is a builtin
 * and does not move a module out of that tier (prompts.ts, file-read.ts).
 */
export interface WorktreeRecords {
  forPanel(panelId: string, root: string): WorktreeRecord | undefined
  add(record: WorktreeRecord): void
  drop(id: string): boolean
  list(): WorktreeRecord[]
}

export interface WorktreeManagerDeps {
  run: GitRunner
  resolveRepo: (cwd: string) => Promise<RepoAnswer>
  /** `<userData>/worktrees`. Created on first use. */
  worktreesDir: string
  records: WorktreeRecords
  now?: () => Date
  mintId?: () => string
}

export type WorktreeRemoveResult =
  | { kind: 'removed' }
  /** Git declined — a dirty tree, most often. Its own sentence, verbatim. */
  | { kind: 'refused'; reason: string }
  /** Git could not run at all. A different fix from `refused`. */
  | { kind: 'failed'; reason: string }
  | { kind: 'unknown' }

export interface WorktreeManager {
  /**
   * The worktree a panel should spawn in. Reuses this panel's own record in
   * this root when it exists and its directory is still there; otherwise
   * creates one. Never throws: a panel that asked and cannot be given one
   * gets the `refused` arm and spawns in its requested cwd, which is the
   * caller's job to do — and to SAY.
   */
  ensureForPanel(panelId: string, cwd: string): Promise<WorktreeOutcome>
  remove(id: string): Promise<WorktreeRemoveResult>
}

/**
 * Git's own sentence, and the RIGHT one: `worktree add` prints "Preparing
 * worktree ..." to stderr before it fails, so the first non-empty line is
 * progress, not the reason. Prefer a `fatal:`/`error:` line; fall back to the
 * last non-empty one.
 */
const reasonLine = (s: string): string => {
  const lines = s.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  return lines.find((l) => /^(fatal|error):/i.test(l)) ?? lines[lines.length - 1] ?? ''
}

export function createWorktreeManager(deps: WorktreeManagerDeps): WorktreeManager {
  const now = deps.now ?? (() => new Date())
  const mintId = deps.mintId ?? (() => `wt-${randomUUID().slice(0, 8)}`)

  return {
    async ensureForPanel(panelId, cwd) {
      const answer = await deps.resolveRepo(cwd)
      if (answer.kind === 'not-a-repo') {
        return { kind: 'refused', reason: `${cwd} is not inside a git repository` }
      }
      if (answer.kind !== 'root') {
        return { kind: 'refused', reason: answer.detail || 'git could not open the repository' }
      }
      const root = answer.root
      // Reuse BY PANEL AND ROOT. The root clause is what stops a recycled
      // panel id in a different repository from being spawned into a
      // stranger's branch; the same id in the same repository is the same
      // identity (a reload, a restart, an undone close) and gets its own
      // worktree back.
      const existing = deps.records.forPanel(panelId, root)
      if (existing !== undefined) {
        if (existsSync(existing.path)) {
          return { kind: 'active', branch: existing.branch, path: existing.path, root }
        }
        // The directory is gone (the user removed it by hand). The record is
        // stale and a fresh one is minted below; dropping it here rather than
        // leaving a second record for the same panel is what keeps forPanel
        // answering one thing.
        deps.records.drop(existing.id)
      }
      // The stamp is per minute, so a same-minute recycle of a panel id — or
      // the branch a hand-deleted worktree left behind — would make `-b`
      // refuse. Probe, and suffix rather than fail: a panel that asked for a
      // worktree and could have had one must not be refused over a name.
      const base = worktreeBranch(panelId, now())
      let branch = base
      for (let n = 2; n < 10; n += 1) {
        const exists = await deps.run(buildBranchExistsArgs(root, branch))
        if (!exists.ok) break
        branch = `${base}-${n}`
      }
      const path = worktreePath(deps.worktreesDir, root, branch)
      try {
        mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true })
      } catch (error) {
        return { kind: 'refused', reason: `could not create ${path}: ${String(error)}` }
      }
      const added = await deps.run(buildWorktreeAddArgs(root, branch, path))
      if (!added.ok) {
        return {
          kind: 'refused',
          reason: added.notFound ? 'git could not be run' : (reasonLine(added.stderr) || 'git worktree add failed')
        }
      }
      deps.records.add({ id: mintId(), root, path, branch, createdAt: now().getTime(), panelId })
      return { kind: 'active', branch, path, root }
    },

    async remove(id) {
      const record = deps.records.list().find((w) => w.id === id)
      if (record === undefined) return { kind: 'unknown' }
      // No --force, ever — see buildWorktreeRemoveArgs. A directory already
      // gone is a worktree git will happily prune, and the record has nothing
      // left to describe; that is the one case removal skips git.
      if (existsSync(record.path)) {
        const result = await deps.run(buildWorktreeRemoveArgs(record.root, record.path))
        if (!result.ok) {
          if (result.notFound) return { kind: 'failed', reason: 'git could not be run' }
          return { kind: 'refused', reason: reasonLine(result.stderr) || 'git refused to remove the worktree' }
        }
      }
      deps.records.drop(id)
      return { kind: 'removed' }
    }
  }
}
