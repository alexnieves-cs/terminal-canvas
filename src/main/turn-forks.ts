import { join, relative } from 'node:path'
import type { TranscriptTurn } from '../shared/transcript'
import type { WorktreeRecord } from '../shared/layout-schema'
import type { AgentBackend } from '../shared/agent-backends'
import { BACKENDS } from '../shared/agent-backends'
import {
  TURN_REF_FORMAT,
  claudeProjectSlug,
  cutClaudeTranscript,
  cutTurns,
  forkBranch,
  parseTurnRefs,
  prunePlan,
  refSafePanelId,
  snapshotFor,
  turnRef,
  turnRefPrefix,
  type ForkRequest,
  type ForkResult,
  type TurnSnapshotRow
} from '../shared/turn-fork'
import type { GitRunner } from './review-engine'
import { worktreePath } from './worktree'

/**
 * M556–M560 (lane K). The half of "fork from any turn" that runs git and
 * writes files. Every dependency is INJECTED — the runner, the transcripts,
 * claude's folder, the filesystem, the clock — worktree-manager.ts's trade,
 * so verify:fork drives the whole capture → fork → prune story against a
 * real temporary repository under plain node, with no Electron anywhere.
 *
 * The rules that fail silently if undone:
 *
 *   - A CAPTURE NEVER TOUCHES THE PERSON'S STATE. The tree is staged in a
 *     COPY of the index (GIT_INDEX_FILE, its stat cache is why it is a copy
 *     and not an empty one — an empty index rehashes every file), written
 *     with plumbing, and named by a ref outside refs/heads. The branch, the
 *     real index, the stash and the working tree are read, never written:
 *     `fork.capture.2` compares all four before and after.
 *   - PLUMBING, NOT `git commit`. review-commit.ts uses porcelain on purpose
 *     so the person's hooks run on THEIR commit; a snapshot is not their
 *     commit, and a pre-commit hook that formats files or refuses a dirty
 *     tree must not run (or fail) on every turn an agent finishes.
 *   - ONE CAPTURE AT A TIME PER PANEL. Two results close together would
 *     otherwise race on the parent and on the prune; captures chain.
 *   - FIRE AND FORGET. A capture never throws and never delays the event
 *     fan-out it is called from; a failure costs that turn's snapshot and
 *     nothing else, and the fork then says it built on an earlier one.
 */

/** The snapshot's author: not the person, and an address that cannot be mail (RFC 2606). */
const SNAPSHOT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Terminal Canvas',
  GIT_AUTHOR_EMAIL: 'turns@terminal-canvas.invalid',
  GIT_COMMITTER_NAME: 'Terminal Canvas',
  GIT_COMMITTER_EMAIL: 'turns@terminal-canvas.invalid'
}

export interface TurnForkFs {
  readText(path: string): string | undefined
  writeText(path: string, text: string): void
  copy(from: string, to: string): boolean
  remove(path: string): void
  mkdirp(path: string): void
  exists(path: string): boolean
}

export interface TurnForkDeps {
  run: GitRunner
  /** M556's switch, read LIVE: off by default, because a snapshot writes into the person's repository. */
  enabled: () => boolean
  /** `<userData>/worktrees` — the same parent worktree-manager.ts uses, so a fork sits beside its siblings. */
  worktreesDir: string
  addWorktree: (record: WorktreeRecord) => void
  /** The panel's live session: where it runs and which CLI it is. */
  session: (panelId: string) => { cwd: string; sessionId: string; backend: AgentBackend } | undefined
  transcripts: {
    read(panelId: string): { turns: TranscriptTurn[] }
    appendTurn(panelId: string, turn: TranscriptTurn): void
    drop(panelId: string): void
  }
  claude: {
    /** The CLI's transcript for a session id, by glob (transcript-reader.ts). */
    find(sessionId: string): string | undefined
    /** `~/.claude/projects`. */
    projectsDir: string
  }
  fs: TurnForkFs
  /** A directory for the scratch index copies. */
  tmpDir: string
  newSessionId: () => string
  mintId: () => string
  now: () => Date
}

export interface TurnForks {
  /** M556. Fire-and-forget: the tree under `cwd` after turn `turn`, as `refs/tc/turns/<panel>/<turn>`. */
  capture(panelId: string, cwd: string, turn: number): Promise<void>
  /** The panel's snapshots, turn order. Empty outside a repository. */
  list(panelId: string, cwd: string): Promise<TurnSnapshotRow[]>
  /** M557. A worktree at turn N's snapshot and the conversation cut at turn N. */
  fork(req: ForkRequest): Promise<ForkResult>
  /** M560. Every snapshot of this panel removed — the panel was closed. */
  drop(panelId: string, cwd: string): Promise<number>
}

/** Git's own sentence: the `fatal:` line when there is one (worktree-manager.ts's rule). */
const reasonLine = (s: string): string => {
  const lines = s.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  return lines.find((l) => /^(fatal|error):/i.test(l)) ?? lines[lines.length - 1] ?? ''
}

export function createTurnForks(deps: TurnForkDeps): TurnForks {
  const chains = new Map<string, Promise<unknown>>()
  const serial = <T>(panelId: string, job: () => Promise<T>): Promise<T> => {
    const prev = chains.get(panelId) ?? Promise.resolve()
    const next = prev.then(job, job)
    chains.set(panelId, next.catch(() => {}))
    return next
  }

  const rootOf = async (cwd: string): Promise<string | null> => {
    const top = await deps.run(['-C', cwd, 'rev-parse', '--show-toplevel'])
    return top.ok ? top.stdout.trim() : null
  }
  const rows = async (root: string, panelId: string): Promise<TurnSnapshotRow[]> => {
    const listed = await deps.run(['-C', root, 'for-each-ref', `--format=${TURN_REF_FORMAT}`, turnRefPrefix(panelId)])
    return listed.ok ? parseTurnRefs(listed.stdout, panelId) : []
  }

  const captureNow = async (panelId: string, cwd: string, turn: number): Promise<void> => {
    if (!deps.enabled() || !refSafePanelId(panelId) || !Number.isInteger(turn) || turn < 1) return
    const root = await rootOf(cwd)
    if (root === null) return
    const scratch = join(deps.tmpDir, `tc-turn-${panelId}-${turn}-${deps.mintId()}.index`)
    try {
      // The index's own path (a linked worktree has its own); copied so the
      // stat cache comes along. No index yet (a fresh repository) is an empty one.
      const indexPath = await deps.run(['-C', root, 'rev-parse', '--path-format=absolute', '--git-path', 'index'])
      if (indexPath.ok) deps.fs.copy(indexPath.stdout.trim(), scratch)
      const env = { env: { GIT_INDEX_FILE: scratch } }
      const added = await deps.run(['-C', root, 'add', '-A', '--', '.'], env)
      if (!added.ok) return
      const tree = await deps.run(['-C', root, 'write-tree'], env)
      if (!tree.ok) return
      const treeSha = tree.stdout.trim()
      const existing = await rows(root, panelId)
      const prev = [...existing].reverse().find((r) => r.turn < turn)
      // An unchanged tree reuses the previous snapshot's commit: a turn that
      // only talked costs a ref, not an object.
      let commit: string | null = null
      if (prev !== undefined) {
        const prevTree = await deps.run(['-C', root, 'rev-parse', `${prev.commit}^{tree}`])
        if (prevTree.ok && prevTree.stdout.trim() === treeSha) commit = prev.commit
      }
      if (commit === null) {
        const head = await deps.run(['-C', root, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}'])
        const parent = prev?.commit ?? (head.ok ? head.stdout.trim() : null)
        const made = await deps.run(
          ['-C', root, 'commit-tree', treeSha, ...(parent === null ? [] : ['-p', parent]), '-m', `turn ${turn} of ${panelId} (Terminal Canvas snapshot)`],
          { env: SNAPSHOT_IDENTITY }
        )
        if (!made.ok) return
        commit = made.stdout.trim()
      }
      const wrote = await deps.run(['-C', root, 'update-ref', turnRef(panelId, turn), commit])
      if (!wrote.ok) return
      const doomed = prunePlan(existing, turn)
      for (const n of doomed) await deps.run(['-C', root, 'update-ref', '-d', turnRef(panelId, n)])
    } finally {
      deps.fs.remove(scratch)
    }
  }

  const forkNow = async (req: ForkRequest): Promise<ForkResult> => {
    const { fromPanelId, toPanelId, turn } = req
    if (!refSafePanelId(fromPanelId)) return { kind: 'refused', reason: 'that panel id cannot name a snapshot' }
    if (!Number.isInteger(turn) || turn < 1) return { kind: 'refused', reason: 'pick a message the agent has answered' }
    const session = deps.session(fromPanelId)
    if (session === undefined) return { kind: 'refused', reason: 'that conversation is not running in this window' }
    const root = await rootOf(session.cwd)
    if (root === null) return { kind: 'refused', reason: `${session.cwd} is not inside a git repository` }
    const picked = snapshotFor(await rows(root, fromPanelId), turn)
    if (picked === null) {
      return {
        kind: 'refused',
        reason: deps.enabled()
          ? `no snapshot was taken at or before message ${turn}`
          : 'turn snapshots are off — turn on "Snapshot each agent turn" in Settings, and turns from then on can be branched'
      }
    }
    const now = deps.now()
    const branch = forkBranch(fromPanelId, turn, now)
    const path = worktreePath(deps.worktreesDir, root, branch)
    try { deps.fs.mkdirp(path.slice(0, path.lastIndexOf('/'))) } catch (error) { return { kind: 'refused', reason: `could not create ${path}: ${String(error)}` } }
    const added = await deps.run(['-C', root, 'worktree', 'add', '-b', branch, path, picked.row.commit])
    if (!added.ok) return { kind: 'refused', reason: added.notFound ? 'git could not be run' : (reasonLine(added.stderr) || 'git worktree add failed') }
    deps.addWorktree({ id: deps.mintId(), root, path, branch, createdAt: now.getTime(), panelId: toPanelId })
    // The session ran in a subfolder of the repository: the fork runs in the same one.
    const rel = relative(root, session.cwd)
    const cwd = rel === '' || rel.startsWith('..') ? path : join(path, rel)

    // The conversation: the panel's own copy, cut at turn N, under the new id.
    const turns = cutTurns(deps.transcripts.read(fromPanelId).turns, turn)
    deps.transcripts.drop(toPanelId)
    for (const t of turns) deps.transcripts.appendTurn(toPanelId, t)

    const sessionId = deps.newSessionId()
    let conversation: 'resumed' | 'tree-only' = 'tree-only'
    if (BACKENDS[session.backend].forksTurns) {
      const source = deps.claude.find(session.sessionId)
      const text = source === undefined ? undefined : deps.fs.readText(source)
      if (text !== undefined) {
        const cut = cutClaudeTranscript(text, turn, sessionId, cwd)
        if (cut.lines > 0) {
          const dir = join(deps.claude.projectsDir, claudeProjectSlug(cwd))
          try {
            deps.fs.mkdirp(dir)
            deps.fs.writeText(join(dir, `${sessionId}.jsonl`), cut.text)
            conversation = 'resumed'
          } catch { conversation = 'tree-only' }
        }
      }
    }
    return { kind: 'forked', cwd, branch, fromTurn: picked.row.turn, exactTree: picked.exact, sessionId, conversation, turns: turns.length }
  }

  return {
    capture: (panelId, cwd, turn) => serial(panelId, () => captureNow(panelId, cwd, turn).catch(() => {})),
    async list(panelId, cwd) {
      if (!refSafePanelId(panelId)) return []
      const root = await rootOf(cwd)
      return root === null ? [] : rows(root, panelId)
    },
    fork: (req) => serial(req.fromPanelId, () => forkNow(req).catch((error: unknown) => ({ kind: 'refused' as const, reason: String(error) }))),
    drop: (panelId, cwd) => serial(panelId, async () => {
      if (!refSafePanelId(panelId)) return 0
      const root = await rootOf(cwd)
      if (root === null) return 0
      const all = await rows(root, panelId)
      let removed = 0
      for (const r of all) if ((await deps.run(['-C', root, 'update-ref', '-d', turnRef(panelId, r.turn)])).ok) removed += 1
      return removed
    }).catch(() => 0)
  }
}
