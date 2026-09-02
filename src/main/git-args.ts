/**
 * Pure git argv construction and output parsing.
 *
 * Imports NOTHING — not electron, not node-pty, not node:child_process — which
 * is what keeps it in the plain-node verify tier, the same line tmux-args.ts
 * draws against session-backend.ts. The module that actually spawns git is
 * git-runner.ts, and it is deliberately out of this file's reach.
 *
 * Every read is -z. Git's default output QUOTES and backslash-escapes paths
 * containing whitespace or non-ASCII bytes, and encodes a rename as a single
 * brace-infixed field. A line/tab parser is therefore correct for exactly the
 * repositories a developer tests against and wrong for the ones users have.
 * This repo has already paid full price for that class of bug once: the
 * unquoted pane-died redirect made EVERY panel report exit code 1, silently,
 * because every fixture used a space-free path.
 */
import type { DiffLine } from '@shared/review'

export interface NumstatEntry {
  path: string
  added: number
  removed: number
  /** Git writes `-` for both counts on a binary file. Not zero, and not NaN. */
  binary: boolean
  /** Present only for a rename; `path` is the destination. */
  renamedFrom?: string
}

export function buildRepoRootArgs(cwd: string): string[] {
  return ['-C', cwd, 'rev-parse', '--show-toplevel']
}

/**
 * `stash create`, never `stash push`. Create writes a commit object
 * representing the current dirty state and prints its sha, WITHOUT modifying
 * the working tree and WITHOUT adding to the stash list — verified against a
 * scratch repo before this was designed. `push` would do both and would be a
 * catastrophic thing to run underneath a working agent.
 *
 * On a CLEAN tree it prints nothing; the caller falls back to HEAD.
 */
export function buildBaselineArgs(root: string): string[] {
  return ['-C', root, 'stash', 'create']
}

/**
 * Three callers, two jobs: reading the new commit's sha back, and the pair of
 * reads that bracket a commit's preparation so a repository that moved
 * underneath it is refused rather than reverted. Deliberately carries no
 * scratch `GIT_INDEX_FILE` at any call site — HEAD is a ref, not an index, and
 * scoping the read to a scratch file would only invite the idea that it
 * describes one.
 */
export function buildHeadArgs(root: string): string[] {
  return ['-C', root, 'rev-parse', 'HEAD']
}

/**
 * The baseline commit is UNREFERENCED, so `git gc --prune=now` in that
 * repository destroys it. This is how the engine tells that apart from a
 * generic git failure and reports `baseline-lost` rather than falling back to
 * HEAD — which would silently start blaming the agent for changes that were
 * already there when it started.
 */
export function buildObjectExistsArgs(root: string, sha: string): string[] {
  return ['-C', root, 'cat-file', '-e', sha]
}

/**
 * M37. A fresh worktree on a NEW branch at the current commit. `-b` rather
 * than an existing branch: two panels asking for the same branch would be two
 * checkouts of one branch, which git refuses anyway, and the point of the
 * feature is that each panel has a branch of its own.
 */
export function buildWorktreeAddArgs(root: string, branch: string, path: string): string[] {
  return ['-C', root, 'worktree', 'add', '-b', branch, path, 'HEAD']
}

/**
 * M37. NO `--force`, for the reason buildCommitArgs carries no `--no-verify`:
 * git refuses to remove a worktree with uncommitted changes, and a tool that
 * quietly discarded an agent's work would be worth less than one that
 * refused. The refusal is reported verbatim and the directory survives.
 */
export function buildWorktreeRemoveArgs(root: string, path: string): string[] {
  return ['-C', root, 'worktree', 'remove', path]
}

export function buildNumstatArgs(root: string, baseline: string): string[] {
  return ['-C', root, 'diff', '--numstat', '-z', baseline]
}

/**
 * Untracked files never appear in `git diff`, and the tempting fix —
 * `git add -N` — MUTATES THE INDEX of a repository an agent may be mid-commit
 * in. `ls-files --others` reads and changes nothing.
 */
export function buildUntrackedArgs(root: string): string[] {
  return ['-C', root, 'ls-files', '-z', '--others', '--exclude-standard']
}

/** Declared here, first called in M9b — the review node renders hunks. */
export function buildFileDiffArgs(root: string, baseline: string, path: string): string[] {
  return ['-C', root, 'diff', baseline, '--', path]
}

/**
 * A patch larger than this is sliced before parsing. Not a correctness
 * bound — a cap on how much text crosses IPC and lands in a DOM node inside
 * .world, where it is also being scaled by the canvas transform.
 */
export const DIFF_MAX_BYTES = 512 * 1024

/** How many lines of ONE file's diff a review node renders before "+N more". */
export const DIFF_MAX_LINES = 600

/**
 * An untracked file appears in no diff against a commit, so it is diffed
 * against /dev/null instead. `--no-index` exits 1 whenever it finds
 * differences — which is every successful call here — so the caller must
 * treat a non-zero exit as ordinary. verify:review 48.
 */
export function buildNewFileDiffArgs(root: string, path: string): string[] {
  return ['-C', root, 'diff', '--no-index', '--', '/dev/null', path]
}

/**
 * Unified diff text into classified lines.
 *
 * The ORDER of the tests is the whole function. '+++' and '---' are file
 * headers and must be matched BEFORE the single-character '+' and '-', or
 * every file header in every diff renders as an added or removed source
 * line. The remaining preamble git prints (`diff --git`, `index`, `new file
 * mode`, `similarity index`, `rename from/to`) is meta for the same reason,
 * and so is the '\' no-newline marker, which is a note ABOUT the file rather
 * than a line IN it.
 */
export function parseDiffLines(
  patch: string,
  maxLines: number = DIFF_MAX_LINES
): { lines: DiffLine[]; truncated: number } {
  const source = patch.length > DIFF_MAX_BYTES ? patch.slice(0, DIFF_MAX_BYTES) : patch
  // A trailing newline produces one empty final entry, which is not a line.
  const raw = source.split('\n')
  if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop()
  const lines: DiffLine[] = []
  for (const text of raw.slice(0, maxLines)) {
    let kind: DiffLine['kind']
    if (text.startsWith('+++') || text.startsWith('---')) kind = 'meta'
    else if (text.startsWith('@@')) kind = 'hunk'
    else if (text.startsWith('+')) kind = 'add'
    else if (text.startsWith('-')) kind = 'del'
    else if (text.startsWith('\\')) kind = 'meta'
    else if (/^(diff --git|index |new file mode|deleted file mode|old mode|new mode|similarity index|rename (from|to)|Binary files )/.test(text)) kind = 'meta'
    else kind = 'context'
    lines.push({ kind, text })
  }
  return { lines, truncated: Math.max(0, raw.length - lines.length) }
}

export function parseRepoRoot(stdout: string): string | null {
  const trimmed = stdout.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Git terminates every entry with NUL, including the last, so a plain split
 * produces one trailing '' — and filtering on emptiness drops it along with
 * any other empty field the split produces, not only that trailing one.
 */
export function parseNulList(stdout: string): string[] {
  return stdout.split('\0').filter((s) => s !== '')
}

export function parseNumstat(stdout: string): NumstatEntry[] {
  const records = stdout.split('\0')
  const out: NumstatEntry[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record === '') continue
    const tab = record.indexOf('\t')
    if (tab === -1) continue
    const second = record.indexOf('\t', tab + 1)
    if (second === -1) continue
    const addedRaw = record.slice(0, tab)
    const removedRaw = record.slice(tab + 1, second)
    const path = record.slice(second + 1)
    const binary = addedRaw === '-' && removedRaw === '-'
    const added = binary ? 0 : Number(addedRaw)
    const removed = binary ? 0 : Number(removedRaw)
    if (path === '') {
      // A RENAME. Under -z the path field is empty and the two names follow as
      // their own NUL-terminated records. Consuming both here is what stops
      // every subsequent entry being shifted by one.
      const from = records[i + 1]
      const to = records[i + 2]
      if (from === undefined || to === undefined) continue
      i += 2
      out.push({ path: to, added, removed, binary, renamedFrom: from })
      continue
    }
    out.push({ path, added, removed, binary })
  }
  return out
}

/**
 * One entry of a git index, as `ls-files --stage` prints it.
 *
 * The `sha` is a BLOB, not a commit — it is what the reconcile stages, and
 * staging by sha rather than by re-reading the working tree is what makes the
 * reconcile safe to run underneath an agent that is still editing.
 */
export interface StagedEntry {
  mode: string
  sha: string
  path: string
}

/**
 * Seed the scratch index from HEAD.
 *
 * Without it, `update-index` builds an index containing ONLY the staged paths,
 * and the resulting commit deletes every other file in the repository. That is
 * the worst outcome this milestone can produce — on disk, in history, and the
 * one action in this app Cmd+Z cannot undo.
 */
export function buildReadTreeArgs(root: string): string[] {
  return ['-C', root, 'read-tree', 'HEAD']
}

/**
 * Stage the reviewed paths into the scratch index.
 *
 * `--add` AND `--remove`, because `git diff --numstat` reports a DELETED file
 * exactly as it reports a modified one: the node lists it, so the commit must
 * be able to carry it, and `update-index --add` alone errors on a path it
 * cannot find rather than skipping it — one deleted file would fail the whole
 * commit. `--` terminates options, or a file named `-f` is read as a flag.
 */
export function buildStageArgs(root: string, paths: string[]): string[] {
  return ['-C', root, 'update-index', '--add', '--remove', '--', ...paths]
}

/**
 * A real `git commit`, deliberately NOT `commit-tree`.
 *
 * The plumbing recipe the spec originally named — write-tree / commit-tree /
 * update-ref — runs NO HOOKS AT ALL, so it silently delivers the `--no-verify`
 * behaviour the same spec forbids. Porcelain honours GIT_INDEX_FILE, which was
 * measured rather than assumed: the pre-commit hook ran and saw exactly the
 * scratch index, and the user's own .git/index was byte-identical afterwards.
 *
 * The message goes through -m rather than stdin so GitRunner never needs a
 * stdin channel. There is no --no-verify and no flag that could become one.
 */
export function buildCommitArgs(root: string, message: string): string[] {
  return ['-C', root, 'commit', '-m', message]
}

/**
 * What the scratch index holds for these paths, AFTER the commit.
 *
 * After, not before: a pre-commit hook is allowed to change the index — a
 * formatter that runs `git add` is the ordinary case — so entries read before
 * the commit are not necessarily the entries that got committed, and
 * reconciling with those would stage content that exists in no commit.
 */
export function buildStagedEntriesArgs(root: string, paths: string[]): string[] {
  return ['-C', root, 'ls-files', '--stage', '-z', '--', ...paths]
}

/**
 * Bring the REAL index back in step with the new HEAD, for the committed
 * paths only.
 *
 * Never touching the real index sounds like the safe answer and is its own
 * silent failure: once HEAD moves and the index does not, the index still
 * describes the previous tree, so the agent's own `git status` reports a
 * phantom `D` for every file we added and `MM` for every file we modified. An
 * agent reading that will try to "fix" a repository that is fine.
 *
 * `--cacheinfo` stages the exact blob the commit contains, so an edit landing
 * between the commit and this call cannot be staged behind the agent's back —
 * which a working-tree-reading `update-index --add -- <paths>` would do. Per
 * PATH rather than wholesale, so the user's own unrelated staged entries
 * survive. `--replace` because the path may already be in the index at a
 * different sha, which is the ordinary case for a modified file.
 */
export function buildReconcileArgs(root: string, entries: StagedEntry[]): string[] {
  return [
    '-C', root, 'update-index', '--add', '--replace',
    ...entries.flatMap((e) => ['--cacheinfo', `${e.mode},${e.sha},${e.path}`])
  ]
}

/**
 * Drop the REAL index's entries for paths the commit DELETED.
 *
 * `ls-files --stage` prints nothing for a path that is no longer in the tree,
 * so the set of requested paths ABSENT from that read-back is exactly the set
 * the commit deleted — and buildReconcileArgs, which stages by `--cacheinfo`,
 * has no entry to stage for them and leaves the index's stale entry in place.
 * Measured, that reads as `AD <path>` in the agent's own `git status`: the
 * file staged as NEW in a repository whose HEAD just deleted it. It is the
 * mirror of the `D`/`MM` phantom the --cacheinfo half exists to remove, and
 * worse in one respect — an agent that runs `git commit` after reading it
 * re-adds the file it just deleted.
 *
 * `--force-remove` rather than `--remove`, because `--remove` only drops an
 * entry whose file is actually gone from the working tree, and the agent is
 * free to have recreated it in the meantime; the entry we are removing
 * describes a tree that no longer exists either way.
 *
 * THE TRADE, chosen rather than missed: if the user had independently staged
 * one of these paths, this discards that staging. It is still the right call —
 * the `AD` state does not merely confuse, it actively misleads an agent into
 * undoing the deletion — and unlike the --cacheinfo half there is no per-path
 * blob to restore it to, because the commit is the reason the path has none.
 */
export function buildForceRemoveArgs(root: string, paths: string[]): string[] {
  return ['-C', root, 'update-index', '--force-remove', '--', ...paths]
}

/** `<mode> <sha> <stage>\t<path>` records, NUL-separated. */
export function parseStagedEntries(stdout: string): StagedEntry[] {
  const out: StagedEntry[] = []
  for (const record of stdout.split('\0')) {
    // A trailing NUL produces an empty final field, which is not an entry.
    if (record === '') continue
    const tab = record.indexOf('\t')
    if (tab === -1) continue
    const meta = record.slice(0, tab).split(' ')
    if (meta.length < 3) continue
    out.push({ mode: meta[0], sha: meta[1], path: record.slice(tab + 1) })
  }
  return out
}
