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
/**
 * M37/M39. Does this branch exist? `rev-parse --verify --quiet` exits 1 and
 * prints nothing for a missing ref, so the runner's `ok` is the answer.
 * Probed before `worktree add -b`, because a branch a hand-deleted worktree
 * left behind — or a same-minute recycle of a panel id — makes `-b` refuse,
 * and the refusal must become a suffixed name rather than no worktree.
 */
export function buildBranchExistsArgs(root: string, branch: string): string[] {
  return ['-C', root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]
}

export function buildWorktreeRemoveArgs(root: string, path: string): string[] {
  return ['-C', root, 'worktree', 'remove', path]
}

/**
 * M86. The branch and its tracking ref, read from what the repository already
 * knows. NO FETCH is built anywhere in this file: the numbers are as fresh as
 * the user's last fetch, and the pane says so beside them. `verify:review
 * git.1` asserts the absence as text over this file, because no fake runner
 * can prove a call was never made.
 */
export function buildBranchArgs(root: string): string[] {
  return ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']
}

/** Exits non-zero when the branch has no upstream — the `null` arm, not an error. */
export function buildUpstreamArgs(root: string): string[] {
  return ['-C', root, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']
}

export function buildAheadBehindArgs(root: string): string[] {
  return ['-C', root, 'rev-list', '--left-right', '--count', 'HEAD...@{u}']
}

/**
 * `rev-list --left-right --count` prints `AHEAD<TAB>BEHIND`. Split on any
 * whitespace and demand exactly two integers: a parser that split on spaces
 * read the whole line as one field and answered null for every real answer.
 */
export function parseAheadBehind(stdout: string): { ahead: number; behind: number } | null {
  const parts = stdout.trim().split(/\s+/)
  if (parts.length !== 2) return null
  const ahead = Number(parts[0])
  const behind = Number(parts[1])
  if (!Number.isInteger(ahead) || !Number.isInteger(behind) || ahead < 0 || behind < 0) return null
  return { ahead, behind }
}

/**
 * M115. A dispatched lane's branch has no upstream until it is pushed, so
 * `HEAD...@{u}` is null for exactly the branch the card asks about. Ask the
 * lane how far it is past the ROOT's branch instead. Still NO FETCH.
 */
export function buildAheadOfArgs(path: string, base: string): string[] {
  return ['-C', path, 'rev-list', '--left-right', '--count', `${base}...HEAD`]
}

/** `<base>...HEAD` prints `BEHIND<TAB>AHEAD` — left is the base's side — so the arms are the mirror of parseAheadBehind's. */
export function parseAheadOf(stdout: string): { ahead: number; behind: number } | null {
  const parsed = parseAheadBehind(stdout)
  return parsed === null ? null : { ahead: parsed.behind, behind: parsed.ahead }
}

/**
 * M115. The ONE push this app builds: the lane's branch to origin, with the
 * user's own git credentials (the app holds none for git and passes nothing).
 * Not a fetch — git.1's rule is about reads that look passive.
 */
export function buildPushArgs(path: string, branch: string): string[] {
  return ['-C', path, 'push', '-u', 'origin', branch]
}

export function buildWorktreeListArgs(root: string): string[] {
  return ['-C', root, 'worktree', 'list', '--porcelain']
}

export interface WorktreeListEntry {
  path: string
  head: string
  /** `null` for a detached worktree — never a branch called HEAD. */
  branch: string | null
}

/** `worktree list --porcelain`: stanzas separated by a blank line. */
export function parseWorktreeList(stdout: string): WorktreeListEntry[] {
  const out: WorktreeListEntry[] = []
  for (const stanza of stdout.split(/\n\s*\n/)) {
    let path: string | null = null
    let head = ''
    let branch: string | null = null
    for (const line of stanza.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length).trim()
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
    }
    if (path !== null) out.push({ path, head, branch })
  }
  return out
}

/**
 * The repository every worktree of a repository shares: `--git-common-dir`
 * is the main tree's `.git`, absolute. A panel spawned INTO a worktree
 * resolves `--show-toplevel` to the worktree, and asking for "every worktree
 * of this root" there found none (M86's verifier).
 */
export function buildCommonDirArgs(root: string): string[] {
  return ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir']
}

/** `/repo/.git` → `/repo`; a bare or odd layout answers null. */
export function parseCommonRoot(stdout: string): string | null {
  const dir = stdout.trim()
  if (dir === '') return null
  return dir.endsWith('/.git') ? dir.slice(0, -'/.git'.length) : null
}

/** In the WORKTREE: where its branch forked from the main tree's `sha`. */
export function buildMergeBaseArgs(path: string, sha: string): string[] {
  return ['-C', path, 'merge-base', 'HEAD', sha]
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

/**
 * M285. The bytes the review content identity hashes — see
 * `shared/review-identity.ts` for the policy this argv implements. `--binary`
 * so a changed image is covered by content and not only by its path;
 * `--full-index` so two different blobs cannot share an abbreviated id in the
 * header; `--no-ext-diff` and `--no-color` so a user's diff tool or colour
 * config cannot change the bytes. The `-c` pins are the critic's finding:
 * those two flags leave `diff.renames`, `diff.algorithm`, `diff.context`,
 * `diff.noprefix`/`mnemonicPrefix`, `diff.indentHeuristic` and
 * `diff.ignoreSubmodules` in play, and the SAME tree hashed differently under
 * two configs (the safe direction — a mark went stale — but a false claim of
 * machine-independence). Pinned to git's defaults, spelled out.
 */
export const CONTENT_DIFF_CONFIG: readonly string[] = [
  'diff.renames=true', 'diff.algorithm=myers', 'diff.context=3', 'diff.interHunkContext=0',
  'diff.noprefix=false', 'diff.mnemonicPrefix=false', 'diff.indentHeuristic=true',
  'diff.ignoreSubmodules=none', 'diff.suppressBlankEmpty=false', 'core.quotePath=true'
]
export function buildContentDiffArgs(root: string, baseline: string): string[] {
  return ['-C', root, ...CONTENT_DIFF_CONFIG.flatMap((c) => ['-c', c]), 'diff', '--binary', '--full-index', '--no-ext-diff', '--no-color', baseline]
}

/**
 * M285. The blob id of each untracked file, one per line in argument order,
 * READ without writing: `hash-object` without `-w` stores nothing, where the
 * tempting `add -N` would mutate the index an agent may be mid-commit in
 * (`buildUntrackedArgs`'s reason, one call later).
 */
export function buildHashObjectArgs(root: string, paths: readonly string[]): string[] {
  return ['-C', root, 'hash-object', '--', ...paths]
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
  // M307. The running line numbers, reset by each hunk header. Null until a
  // header parses: a line whose number is not KNOWN carries none.
  let oldNo: number | null = null
  let newNo: number | null = null
  for (const text of raw.slice(0, maxLines)) {
    let kind: DiffLine['kind']
    if (text.startsWith('+++') || text.startsWith('---')) kind = 'meta'
    else if (text.startsWith('@@')) kind = 'hunk'
    else if (text.startsWith('+')) kind = 'add'
    else if (text.startsWith('-')) kind = 'del'
    else if (text.startsWith('\\')) kind = 'meta'
    else if (/^(diff --git|index |new file mode|deleted file mode|old mode|new mode|similarity index|rename (from|to)|Binary files )/.test(text)) kind = 'meta'
    else kind = 'context'
    if (kind === 'hunk') {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text)
      oldNo = m === null ? null : Number(m[1])
      newNo = m === null ? null : Number(m[2])
      lines.push({ kind, text })
    } else if (kind === 'add' && newNo !== null) {
      lines.push({ kind, text, newNo })
      newNo += 1
    } else if (kind === 'del' && oldNo !== null) {
      lines.push({ kind, text, oldNo })
      oldNo += 1
    } else if (kind === 'context' && oldNo !== null && newNo !== null) {
      lines.push({ kind, text, oldNo, newNo })
      oldNo += 1
      newNo += 1
    } else {
      lines.push({ kind, text })
    }
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

/**
 * M53. Which of `paths` the baseline tree holds. Exact-match pathspecs
 * against a TREE, NUL-terminated so a path with a newline survives, and
 * `--name-only` so the parser is `parseNulList`. A path that names a
 * directory at baseline lists its CHILDREN and never itself — which is why
 * the discarder refuses worktree directories per path before this call.
 */
export function buildLsTreeArgs(root: string, baseline: string, paths: string[]): string[] {
  return ['-C', root, 'ls-tree', '-r', '-z', '--name-only', baseline, '--', ...paths]
}

/**
 * M53. `git restore --source=<baseline> --worktree`, and NEVER `--staged`:
 * the repository's own index is not written by a discard, the inverse of the
 * commit path's scratch-index rule and for the same reason — an agent may be
 * mid-write against it. One call over every held path, so a restore that
 * fails does so for the batch and is reported per path by the caller.
 */
export function buildRestoreArgs(root: string, baseline: string, paths: string[]): string[] {
  return ['-C', root, 'restore', `--source=${baseline}`, '--worktree', '--', ...paths]
}
