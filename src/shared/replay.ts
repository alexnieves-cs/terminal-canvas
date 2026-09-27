import type { TranscriptTurn } from './transcript'

/**
 * M381. A NODE'S REPLAY — Arc 2's "rewind any node, compare two nodes' runs
 * side by side, the virtual filesystem at any timestamp", built from the
 * record this app already keeps: the durable transcript (M73), which holds
 * every turn with its time, every Write with its whole content, every Edit
 * with its two strings, and every tool's result.
 *
 * `replayAt(turns, t)` is the node AS IT STOOD at `t`: the conversation up to
 * then, and each file the agent had changed by then. A file's state is one of
 * two, and collapsing them would be the plausible-wrong answer this
 * repository refuses everywhere else:
 *
 * - `exact` — the replay KNOWS the content: a Write gave it whole, or a
 *   whole-file Read gave the base the later edits were applied to.
 * - `partial` — the agent edited a file whose base the transcript never
 *   showed (or an edit's old string was not in what the replay held, so the
 *   file had moved under it). The edits are listed; the content is not
 *   invented.
 *
 * A change counts from its RESULT, never its request: an Edit the person
 * denied, one that failed, and one still waiting at `t` changed nothing.
 * A shell command can change files the transcript cannot see, so every
 * frame counts the ones that had run — "3 shell commands ran by then" is
 * the replay saying what it cannot know, rather than hiding it.
 *
 * Pure. `verify:agent-session replay.*`.
 */

export type ReplayFile =
  | { path: string; state: 'exact'; content: string; changes: number; lastAt: number }
  | { path: string; state: 'partial'; edits: ReplayEdit[]; changes: number; lastAt: number; why: string }

export interface ReplayEdit { at: number; oldText: string; newText: string }

export interface ReplayFrame {
  at: number
  /** The conversation as it stood: every turn stored at or before `at`. */
  turns: TranscriptTurn[]
  /** Every file the agent changed by then, by path. */
  files: ReplayFile[]
  /** Shell commands that had finished by then — what may have changed files the replay cannot see. */
  shellRuns: number
  /** Tool calls that had a result by then. */
  toolRuns: number
}

/** A Read's result past this many lines may have been cut by the CLI (its default limit), so it is never a base. */
export const READ_BASE_MAX_LINES = 2000

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])
const SHELL_TOOLS = new Set(['Bash'])

/**
 * A whole-file Read's text, or undefined. Numbered lines (`12\tline`, or the
 * older `    12→line`) must run 1, 2, 3… with no gap; a Read with an offset or
 * a limit is a slice, and one that reached READ_BASE_MAX_LINES may have
 * been cut, so neither is a base.
 */
export function readBase(input: Record<string, unknown>, content: string): string | undefined {
  if (input['offset'] !== undefined || input['limit'] !== undefined) return undefined
  const lines: string[] = []
  for (const raw of content.split('\n')) {
    const m = /^\s*(\d+)[\t→](.*)$/.exec(raw)
    if (m === null) break
    if (Number(m[1]) !== lines.length + 1) return undefined
    lines.push(m[2] as string)
  }
  if (lines.length === 0 || lines.length >= READ_BASE_MAX_LINES) return undefined
  return lines.join('\n')
}

/** The distinct moments a slider stops at: each turn's time, oldest first. */
export function replayMoments(turns: readonly TranscriptTurn[]): number[] {
  return [...new Set(turns.map((t) => t.at))].sort((a, b) => a - b)
}

interface Use { name: string; input: Record<string, unknown>; at: number }

export function replayAt(turns: readonly TranscriptTurn[], at: number): ReplayFrame {
  const shown = turns.filter((t) => t.at <= at)
  const uses = new Map<string, Use>()
  const files = new Map<string, ReplayFile>()
  const bases = new Map<string, string>()
  let shellRuns = 0
  let toolRuns = 0

  const edit = (path: string, when: number, pairs: ReadonlyArray<{ oldText: string; newText: string; all: boolean }>): void => {
    const was = files.get(path)
    const changes = (was?.changes ?? 0) + 1
    // The content this edit applies to: what the replay holds for the file,
    // else a whole Read of it the agent made before.
    let content: string | undefined = was === undefined ? bases.get(path) : was.state === 'exact' ? was.content : undefined
    let why = was?.state === 'partial' ? was.why : 'the agent edited it without the transcript ever showing it whole'
    for (const p of pairs) {
      if (content === undefined) break
      if (!content.includes(p.oldText) || p.oldText === '') {
        content = undefined
        why = 'an edit\'s old text was not in what the replay held — the file had changed in a way the transcript does not show'
        break
      }
      content = p.all ? content.split(p.oldText).join(p.newText) : content.replace(p.oldText, () => p.newText)
    }
    if (content !== undefined) { files.set(path, { path, state: 'exact', content, changes, lastAt: when }); return }
    const before = was?.state === 'partial' ? was.edits : []
    files.set(path, { path, state: 'partial', edits: [...before, ...pairs.map((p) => ({ at: when, oldText: p.oldText, newText: p.newText }))], changes, lastAt: when, why })
  }

  for (const turn of shown) {
    for (const b of turn.blocks) {
      if (b.type === 'tool_use') { uses.set(b.id, { name: b.name, input: b.input, at: turn.at }); continue }
      if (b.type !== 'tool_result') continue
      const use = uses.get(b.toolUseId)
      if (use === undefined) continue
      toolRuns++
      if (SHELL_TOOLS.has(use.name)) { shellRuns++; continue }
      const path = typeof use.input['file_path'] === 'string' ? use.input['file_path'] : undefined
      if (path === undefined || b.isError) continue
      if (use.name === 'Read') {
        const base = readBase(use.input, b.content)
        if (base === undefined) continue
        bases.set(path, base)
        // A whole Read is the file as it WAS then: fresher than anything the
        // replay held for it (a shell command may have moved it since), and it
        // makes a partial file exact again. Reading changes nothing, so the
        // file's own count and time stay.
        const known = files.get(path)
        if (known !== undefined) files.set(path, { path, state: 'exact', content: base, changes: known.changes, lastAt: known.lastAt })
        continue
      }
      if (!FILE_TOOLS.has(use.name)) continue
      if (use.name === 'Write' && typeof use.input['content'] === 'string') {
        files.set(path, { path, state: 'exact', content: use.input['content'], changes: (files.get(path)?.changes ?? 0) + 1, lastAt: turn.at })
      } else if (use.name === 'Edit') {
        const o = use.input['old_string'], n = use.input['new_string']
        if (typeof o === 'string' && typeof n === 'string') edit(path, turn.at, [{ oldText: o, newText: n, all: use.input['replace_all'] === true }])
      } else if (use.name === 'MultiEdit' && Array.isArray(use.input['edits'])) {
        const pairs = (use.input['edits'] as unknown[]).flatMap((e) => {
          const r = e as Record<string, unknown>
          return typeof r['old_string'] === 'string' && typeof r['new_string'] === 'string' ? [{ oldText: r['old_string'], newText: r['new_string'], all: r['replace_all'] === true }] : []
        })
        if (pairs.length > 0) edit(path, turn.at, pairs)
      }
    }
  }
  return { at, turns: shown, files: [...files.values()].sort((x, y) => x.path.localeCompare(y.path)), shellRuns, toolRuns }
}

/**
 * Two nodes' frames side by side, file by file: every path either changed,
 * and whether they agree. `same` is null when either side is partial —
 * "cannot tell" is not "different".
 */
export function compareFrames(a: ReplayFrame, b: ReplayFrame): Array<{ path: string; a?: ReplayFile; b?: ReplayFile; same: boolean | null }> {
  const paths = [...new Set([...a.files.map((f) => f.path), ...b.files.map((f) => f.path)])].sort()
  return paths.map((path) => {
    const fa = a.files.find((f) => f.path === path)
    const fb = b.files.find((f) => f.path === path)
    const same = fa === undefined || fb === undefined ? false
      : fa.state === 'exact' && fb.state === 'exact' ? fa.content === fb.content : null
    return { path, ...(fa === undefined ? {} : { a: fa }), ...(fb === undefined ? {} : { b: fb }), same }
  })
}

/** M383. A file's state in one line: whether the replay knows it whole, and how often the agent changed it. */
export function fileStateWords(f: ReplayFile): string {
  const n = `${f.changes} change${f.changes === 1 ? '' : 's'}`
  return f.state === 'exact' ? `known whole · ${n}` : `not known whole · ${n}`
}

/** M383. One compared path in words — "cannot tell" is its own answer, never "different". */
export function compareWords(row: { a?: ReplayFile; b?: ReplayFile; same: boolean | null }, first: string, second: string): string {
  if (row.a === undefined) return `only ${second} changed it`
  if (row.b === undefined) return `only ${first} changed it`
  return row.same === true ? 'the same' : row.same === false ? 'different' : 'cannot tell — one side is not known whole'
}

/** M383. The frame's shell note, or null with none: what may have changed files the replay cannot see. */
export function shellWords(n: number): string | null {
  return n === 0 ? null : `${n} shell command${n === 1 ? '' : 's'} had run by then — they may have changed files this replay cannot see`
}

/** M383. A path under the conversation's folder, shown from it; anything else whole. */
export function replayPath(path: string, cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return path
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`
  return path.startsWith(root) ? path.slice(root.length) : path
}

/**
 * M383. How far into the conversation a moment is — "12m 30s in" — rather
 * than a wall-clock time: a replay is read as a run's own course, and two
 * runs side by side started at different hours.
 */
export function sinceStartWords(at: number, start: number): string {
  const s = Math.max(0, Math.round((at - start) / 1000))
  if (s < 60) return `${s}s in`
  const m = Math.floor(s / 60), rs = s % 60
  if (m < 60) return rs === 0 ? `${m}m in` : `${m}m ${rs}s in`
  const h = Math.floor(m / 60), rm = m % 60
  return `${h}h ${String(rm).padStart(2, '0')}m in`
}
