import type { TranscriptTurn } from './transcript'
import { isRecord } from './guards'

/**
 * M556–M560 (lane K). Fork from any turn — the pure half: how a turn's
 * snapshot is NAMED, which snapshots a capture keeps, where a conversation is
 * CUT, and the sentences the fork says. No node, no git, no electron, so the
 * whole of it runs under plain node in verify:fork; the half that runs git
 * and writes files is main/turn-forks.ts.
 *
 * The decisions that fail silently if undone, in one place:
 *
 *   - A TURN IS A PROMPT. Turn N is "after the agent answered the Nth thing
 *     a person typed", counted from the durable transcript (`promptCount`),
 *     never from the process's own result count — that one restarts with the
 *     process, and a snapshot named by it would point at a different turn
 *     after a relaunch with no error anywhere.
 *   - A SNAPSHOT IS A HIDDEN REF, NEVER A BRANCH. `refs/tc/turns/<panel>/<n>`
 *     is outside `refs/heads`, `refs/tags` and `refs/stash`, so `git branch`,
 *     `git log --all`'s usual readers and the person's stash never see it,
 *     and a push of branches never carries it.
 *   - THE CONVERSATION IS COPIED AND CUT, not resumed with `--fork-session`.
 *     `--fork-session` forks at the END of a conversation, and claude finds a
 *     session by the project folder of its cwd — a fork lives in a new
 *     worktree, so the original id would not resolve there. The copy is cut
 *     before the (N+1)th prompt and written under a new id in the fork's own
 *     project folder, so the first send resumes exactly turn N.
 */

/** Where every turn snapshot lives. Never under refs/heads: a snapshot is not a branch a person made. */
export const TURN_REF_ROOT = 'refs/tc/turns'

/**
 * M560. The most snapshots one panel keeps. Each is a commit whose tree is
 * mostly shared with its neighbour's, so the cost is small; the bound is
 * there so a conversation of a thousand turns does not leave a thousand refs.
 */
export const TURN_SNAPSHOT_CAP = 50

/** Panel ids are app-minted (`c12`, `n3`); anything else is refused rather than escaped into a ref name. */
export function refSafePanelId(panelId: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(panelId)
}

export function turnRefPrefix(panelId: string): string {
  return `${TURN_REF_ROOT}/${panelId}/`
}

export function turnRef(panelId: string, turn: number): string {
  return `${turnRefPrefix(panelId)}${turn}`
}

export interface TurnSnapshotRow {
  /** The turn this snapshot follows: the tree as it stood when the agent finished answering prompt `turn`. */
  turn: number
  commit: string
  /** Wall-clock ms the snapshot was written (the commit's own date). */
  at: number
}

/** The `for-each-ref` format `parseTurnRefs` reads: refname, object, committer date as unix seconds. */
export const TURN_REF_FORMAT = '%(refname) %(objectname) %(committerdate:unix)'

/** `git for-each-ref --format=TURN_REF_FORMAT <prefix>` → rows, turn order. A line that does not parse costs itself. */
export function parseTurnRefs(stdout: string, panelId: string): TurnSnapshotRow[] {
  const prefix = turnRefPrefix(panelId)
  const rows: TurnSnapshotRow[] = []
  for (const line of stdout.split('\n')) {
    const [ref, commit, secs] = line.trim().split(' ')
    if (ref === undefined || commit === undefined || !ref.startsWith(prefix)) continue
    const rest = ref.slice(prefix.length)
    if (!/^[1-9]\d{0,5}$/.test(rest) || !/^[0-9a-f]{40,64}$/.test(commit)) continue
    rows.push({ turn: Number(rest), commit, at: Number(secs) * 1000 || 0 })
  }
  return rows.sort((a, b) => a.turn - b.turn)
}

/**
 * M560. The refs a capture of `wrote` deletes. Two kinds:
 *  - every snapshot PAST the turn just written. A capture of turn 3 when
 *    turn 7 exists means this panel id now holds a different conversation (a
 *    recycled id, a cleared chat): the old 4–7 describe a future that did not
 *    happen, and a fork from "turn 5" would build on a stranger's tree.
 *  - the oldest beyond the cap, so the newest `cap` survive.
 */
export function prunePlan(rows: readonly TurnSnapshotRow[], wrote: number, cap = TURN_SNAPSHOT_CAP): number[] {
  const past = rows.filter((r) => r.turn > wrote).map((r) => r.turn)
  const kept = [...new Set([...rows.filter((r) => r.turn < wrote).map((r) => r.turn), wrote])].sort((a, b) => a - b)
  const over = kept.length > cap ? kept.slice(0, kept.length - cap) : []
  return [...over, ...past].sort((a, b) => a - b)
}

/** A user turn a person typed and the agent was handed: text, and not queued or dropped. */
function isPrompt(t: TranscriptTurn): boolean {
  return t.role === 'user' && t.delivery === undefined && t.blocks.some((b) => b.type === 'text')
}

/** How many prompts this conversation has answered or is answering — the number a snapshot is named by. */
export function promptCount(turns: readonly TranscriptTurn[]): number {
  return turns.filter(isPrompt).length
}

/** The conversation as it stood after turn `n`: every turn before the (n+1)th prompt, and nothing queued. */
export function cutTurns(turns: readonly TranscriptTurn[], n: number): TranscriptTurn[] {
  const out: TranscriptTurn[] = []
  let prompts = 0
  for (const t of turns) {
    if (t.delivery !== undefined) continue
    if (isPrompt(t)) {
      prompts += 1
      if (prompts > n) break
    }
    out.push(t)
  }
  return out
}

/**
 * The turn a Replay frame stands at: the prompts it has shown. A frame that
 * stops between a prompt and its answer is still that prompt's turn — the
 * snapshot is taken when the answer ends, and that is the tree a fork gets.
 */
export function frameTurn(frameTurns: readonly TranscriptTurn[]): number {
  return promptCount(frameTurns)
}

/**
 * The snapshot a fork at turn `n` builds on. `exact` when turn `n` itself was
 * captured; otherwise the latest one before it (snapshots were off for a
 * while, or a capture failed), which the fork must SAY, never pass off as n.
 */
export function snapshotFor(rows: readonly TurnSnapshotRow[], n: number): { row: TurnSnapshotRow; exact: boolean } | null {
  const hit = rows.find((r) => r.turn === n)
  if (hit !== undefined) return { row: hit, exact: true }
  const before = rows.filter((r) => r.turn < n)
  const last = before[before.length - 1]
  return last === undefined ? null : { row: last, exact: false }
}

/**
 * A record in claude's own transcript that is a PROMPT a person typed — the
 * import's rule (main/claude-transcript-import.ts): a `user` record that is not
 * a subagent's (`isSidechain`) or the CLI's own note (`isMeta`), whose content
 * is a bare string or carries a text block. A user record of tool results is
 * the agent's turn continuing, never a new prompt.
 */
function isClaudePrompt(raw: Record<string, unknown>): boolean {
  if (raw.type !== 'user' || raw.isSidechain === true || raw.isMeta === true) return false
  const message = raw.message
  if (!isRecord(message)) return false
  const content = message.content
  if (typeof content === 'string') return content.trim() !== ''
  if (!Array.isArray(content)) return false
  const blocks = content.filter(isRecord)
  if (blocks.some((b) => b.type === 'tool_result')) return false
  return blocks.some((b) => b.type === 'text')
}

export interface CutTranscript {
  text: string
  /** Prompts kept — `n` unless the file had fewer. */
  prompts: number
  /** Lines carried over. */
  lines: number
}

/**
 * claude's JSONL cut before the (n+1)th prompt, every record re-addressed to
 * the fork: `sessionId` to the new id and `cwd` to the fork's worktree, so the
 * CLI reads one conversation in one place. A line that does not parse is
 * carried as it is (another program's file: dropping a line we cannot read
 * would break its parent chain); one that parses is rewritten field by field.
 */
export function cutClaudeTranscript(text: string, n: number, sessionId: string, cwd: string): CutTranscript {
  const out: string[] = []
  let prompts = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let raw: unknown
    try { raw = JSON.parse(line) } catch { out.push(line); continue }
    if (!isRecord(raw)) { out.push(line); continue }
    if (isClaudePrompt(raw)) {
      prompts += 1
      if (prompts > n) { prompts -= 1; break }
    }
    const next: Record<string, unknown> = { ...raw }
    if (typeof next.sessionId === 'string') next.sessionId = sessionId
    if (typeof next.cwd === 'string') next.cwd = cwd
    out.push(JSON.stringify(next))
  }
  return { text: out.length === 0 ? '' : `${out.join('\n')}\n`, prompts, lines: out.length }
}

/**
 * claude's project folder name for a cwd: every character that is not a
 * letter or a digit becomes `-` (measured: `/Users/a/my.repo` →
 * `-Users-a-my-repo`). Another program's rule, so it is used ONLY to write a
 * fork's copy where the CLI will look — reading always globs by session id
 * (transcript-reader.ts), which needs no rule at all. A wrong rule shows as a
 * fork whose first send starts a new conversation and says so (M319's
 * `resumeLost`), never as a silent wrong answer; docs/load-bearing.md lists it
 * among the facts confirmed by hand.
 */
export function claudeProjectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-')
}

/** `tc/fork-<panel>-t<n>-<yyyymmdd-HHMM>`: legible in `git branch`, and the stamp keeps a second fork of one turn apart. */
export function forkBranch(panelId: string, n: number, now: Date): string {
  const pad = (v: number): string => String(v).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `tc/fork-${panelId}-t${n}-${stamp}`
}

export interface ForkRequest {
  fromPanelId: string
  /** The renderer mints the id, as it does every panel id; main never invents one. */
  toPanelId: string
  /** The turn to branch from, as `frameTurn` counts it. */
  turn: number
}

export type ForkResult =
  | {
      kind: 'forked'
      /** The fork's worktree. */
      cwd: string
      branch: string
      /** The snapshot the tree came from, and whether it was turn `turn` itself. */
      fromTurn: number
      exactTree: boolean
      /** The fork's own CLI session id: `resumed` means its first send continues turn `turn`. */
      sessionId: string
      conversation: 'resumed' | 'tree-only'
      /** Turns written to the fork's own transcript (what its panel shows). */
      turns: number
    }
  | { kind: 'refused'; reason: string }

/**
 * A person reads a turn as "the Nth thing I said": the sheet's own counter
 * ("turn 6 of 10") counts every stored turn, both sides, so the fork's words
 * name MESSAGES, never turns, and the two numbers are never read as one.
 */
export function messageWords(n: number): string {
  return `message ${n}`
}

/** The one sentence a fork says, on the palette line and in the Replay sheet. */
export function forkWords(r: ForkResult, turn: number): string {
  if (r.kind === 'refused') return `Could not branch: ${r.reason}`
  const tree = r.exactTree ? `its files as they were after ${messageWords(turn)}` : `its files from after ${messageWords(r.fromTurn)}, the nearest snapshot before ${messageWords(turn)}`
  const talk = r.conversation === 'resumed' ? `the conversation continues from ${messageWords(turn)}` : 'the conversation starts fresh — this agent cannot resume a cut conversation'
  return `Branched on ${r.branch}: ${tree}, and ${talk}.`
}

/** M559. The words for a fork beside its original in Replay's compare view. */
export function forkedFromWords(fromLabel: string, turn: number): string {
  return `branched from ${fromLabel} after ${messageWords(turn)}`
}
