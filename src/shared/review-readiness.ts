import { insideDirectory } from './work-scope'
import type { ReviewFile, ReviewSection } from './review'
import type { RunNodeSupervision } from './run-outcome'
import type { RunRow } from './run-ledger'
import type { TranscriptTurn } from './transcript'
import { sameReviewIdentity, type ReviewIdentity } from './review-identity'

/**
 * M201 (D07). LOCAL REVIEW READINESS — the answer to "what should I do with
 * this result?", as a pure projection over facts four other modules already
 * own.
 *
 * The board's `review` state means, and keeps meaning, that a PULL REQUEST
 * EXISTS: it is set by exactly one line in the app, on a PR opening, and
 * `USER_SET_STATES` deliberately excludes it. That leaves no word at all for
 * the state a task is in for most of its life — the agent stopped, the lane
 * holds changes, and nobody has looked at them yet. This module names that
 * state rather than widening the one next to it, for D04's reason: a meaning
 * stretched to cover two facts is one that will be read as the wrong one.
 *
 * TWO AXES, KEPT APART. `ReviewHandoffState` is what is true of the task now;
 * `ReviewStanding` is what the person already did about it. A task can be
 * `working` and `stale` at once — the agent went back to work after you
 * reviewed — and a single word cannot say both. This is M199's five-axis rule
 * applied one level out, and `readiness.2` is the check that holds it open.
 *
 * TWO EVIDENCE SOURCES, NEVER MERGED. A command in this app's run ledger was
 * spawned by main, which read its exit code off the PTY itself — `observed`.
 * A command in a conversation's transcript was one this app watched the agent
 * REQUEST; the outcome is the agent's CLI's claim — `reported`. They are
 * different kinds of knowledge and a surface that showed them as one row
 * would be putting this app's name on somebody else's answer.
 *
 * NOTHING IS CLASSIFIED AS A "TEST" OR A "CHECK" BY PATTERN, on purpose. A
 * rule deciding `npm test` is a check while `make ci` is not would hang a
 * confident pass/fail badge on a guess — the exact failure M199/M200 spent
 * two milestones removing from run supervision. The evidence names commands
 * and who witnessed them; the reviewer reads the commands.
 *
 * THE SIGNATURE'S RECORDED BOUND. `reviewSignature` fingerprints the diff's
 * SHAPE — sorted path, counts, binary/untracked/rename flags — and not its
 * content. A change that leaves every path and both counts identical (one
 * line edited and another reverted in the same file) is NOT detected by the
 * signature. Hashing content in the renderer would mean reading every hunk
 * on every card render, which is a cost paid on a surface that is drawn
 * constantly; the bound is written here and pinned by `readiness.3` so a
 * later "fix" fails the check that documents it first.
 *
 * M285 closes that gap from the OTHER side: main computes a content identity
 * (`review-identity.ts`) once per read and sends it inside the result, so
 * `reviewStanding` compares identities and the signature is kept only as
 * the shape the card and the mark describe. A mark with NO identity — every
 * one written before M285 — is `unknown`, never `current`: the signature
 * cannot vouch for what it was never able to see.
 *
 * Pure: no DOM, no React, no electron, nothing injected — it asks for
 * nothing. `verify:review readiness.1–.5`.
 */

/**
 * M401 (B2). The merge record in the words every surface that names a merged
 * task uses — the review's detail, the navigator row, the return notice — so
 * "merged into main as abc1234" is one sentence with one author, never three
 * spellings of the sha.
 */
export function mergedLine(merged: { into: string; sha: string }): string {
  return `merged into ${merged.into} as ${merged.sha.slice(0, 7)}`
}

/** What is true of the task now, in the priority order `reviewHandoff` applies. */
export type ReviewHandoffState =
  | 'no-lane' | 'lane-missing' | 'unreadable' | 'blocked' | 'working' | 'empty' | 'shared' | 'ready'
  /** M315. The person accepted it: the lane was merged into the main tree's branch. */
  | 'accepted'

/**
 * What the person already did about it — a SECOND axis, never folded into
 * the state. `unknown` (M285) is a mark that exists but carries no content
 * identity: somebody reviewed SOMETHING here, and this app cannot say
 * whether it is what is there now.
 */
export type ReviewStanding = 'none' | 'current' | 'stale' | 'unknown'

/**
 * The one action the card offers.
 *
 * There is deliberately no `locate`. The first cut had one, whose sentences
 * told the person to "locate the lane" — an affordance no surface offers,
 * because re-pointing a task at an arbitrary directory needs main to judge
 * that root through the Places gate and mint a record for it, which is a new
 * grant-adjacent door and its own milestone. Naming a door that does not
 * exist is worse than naming a smaller one that does, so a lost lane routes
 * to `start`, which mints a fresh lane through the gate that already exists.
 */
export type ReviewAction = 'start' | 'resume' | 'answer' | 'review'

/** Present only when the lane actually holds changes; absent for a clean or unreadable lane. */
export interface ReviewChanges {
  files: number
  added: number
  removed: number
  signature: string
  /** M285. What these changes ARE, from main; absent when git could not say. The value `Mark reviewed` records. */
  identity?: ReviewIdentity
  /** Only ever `true`. More than one panel has run in this repository, so the diff is not this task's alone. */
  shared?: true
}

export interface ReviewHandoff {
  state: ReviewHandoffState
  standing: ReviewStanding
  /** The resting word. */
  word: string
  /** From the existing tone vocabulary; this milestone adds no token. */
  tone: string
  /** One sentence: what is true, and what it means for reviewing. */
  detail: string
  action: ReviewAction
  actionLabel: string
  changes?: ReviewChanges
  /**
   * M199's blocker, carried through unchanged so the card, the workflow
   * diagram and the review section all name the SAME question — this module
   * re-derives nothing about it and invents no third vocabulary. Present only
   * in the `blocked` state; absent, never a placeholder.
   */
  blocker?: { kind: 'approval' | 'keyboard' | 'cap'; subject: string }
}

/** The persisted mark's shape, mirrored from `PersistedWorkItem.reviewed`. */
export interface ReviewMark { at: number; signature: string; files: number; identity?: ReviewIdentity }

export interface ReviewHandoffInput {
  item: { panelId?: string; worktreeId?: string; reviewed?: ReviewMark; merged?: { into: string; sha: string } }
  /** The lane's own section from `reviewAcross` — the FORK diff, which survives its chat being closed. */
  section: ReviewSection | undefined
  /** M199's projection of the linked conversation; absent when there is no live session at all. */
  supervision: RunNodeSupervision | undefined
}

const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619

/**
 * The diff's shape as eight hex characters. Order-independent (the rows are
 * sorted first), so two reads of the same diff agree whatever order git
 * listed them in. See the header for what this deliberately does not detect.
 */
export function reviewSignature(files: readonly ReviewFile[]): string {
  const rows = files
    .map((f) => `${f.path}:${f.added}:${f.removed}:${f.binary ? 'b' : '-'}:${f.untracked ? 'u' : '-'}:${f.renamedFrom ?? ''}`)
    .sort()
  let hash = FNV_OFFSET
  const text = rows.join('\n')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Four arms, in this order. No mark is `none`. A mark with no identity is
 * `unknown` (M285): it was recorded by a build that could see only the
 * diff's shape, and the shape cannot tell a same-size edit from no edit —
 * so it is never `current`, whatever the signature says. `signature` absent
 * means the diff could not be read at all, and a recorded review is then
 * `stale` rather than `current`: "I cannot confirm this still matches"
 * points at the safe action (look again), where `current` would point at
 * the unsafe one. Then the identity decides — and when main could not send
 * one for the CURRENT read, that is `stale` for the same reason.
 */
export function reviewStanding(mark: ReviewMark | undefined, signature: string | undefined, identity?: ReviewIdentity): ReviewStanding {
  if (mark === undefined) return 'none'
  if (mark.identity === undefined) return 'unknown'
  if (signature === undefined) return 'stale'
  return sameReviewIdentity(mark.identity, identity) ? 'current' : 'stale'
}

/**
 * The files a section's result holds, `undefined` when it holds no readable
 * diff at all, and — separately — whether the diff is SHARED.
 *
 * `shared` means two or more panels that have run hold this repository, so no
 * per-panel diff is attributable (`review.ts`). Folding it into `changes`
 * would have this module do the one thing its own header forbids: put a
 * confident single word over two different facts. It is the fourth claim D07
 * asks to keep distinguishable, beside observed, reported and unavailable.
 */
function filesOf(result: ReviewSection['result']): { files: ReviewFile[]; shared: boolean; identity?: ReviewIdentity } | undefined {
  if (result.kind === 'changes') return { files: result.files, shared: false, ...(result.identity === undefined ? {} : { identity: result.identity }) }
  if (result.kind === 'shared') return { files: result.files, shared: true, ...(result.identity === undefined ? {} : { identity: result.identity }) }
  if (result.kind === 'clean') return { files: [], shared: false, ...(result.identity === undefined ? {} : { identity: result.identity }) }
  return undefined
}

/**
 * The task's own section out of an `across` result.
 *
 * The LONGEST containing record wins, which is `laneOfPath`'s rule in
 * `work-scope.ts` reached from the other side: `/w/repo` holds every lane
 * under it, so a shortest-match picker would hand every task the MAIN TREE's
 * diff — a plausible, non-empty, completely wrong answer, and the reviewer
 * would be reading somebody else's work with this task's name on it.
 * Containment is `insideDirectory`, so `/w/lanes/tc-p1` cannot claim the
 * neighbouring `/w/lanes/tc-p1-old`.
 *
 * No match is `undefined` and never a fallback: the handoff then reads
 * `lane missing`, which is the honest answer and the one that offers a fix.
 *
 * RECORDED PRECONDITION. `lanePath` must be a worktree ROOT this app
 * recorded. If a lane's own section is absent from the answer while an
 * ancestor repository's section is present, the ancestor wins and the task
 * would be shown the main tree's diff. It is not guarded by demanding an
 * exact path match, because git re-resolves each record path when it builds
 * the answer and macOS spells the same directory `/var/…` and
 * `/private/var/…` — an exact match would make every task review on this
 * platform read `lane missing`, which is a worse and far more likely wrong
 * answer than the one it would prevent. The safe fix, if this ever bites, is
 * to resolve both spellings in MAIN before the comparison, not to tighten
 * the string test here.
 */
export function laneSection(sections: readonly ReviewSection[], lanePath: string | undefined): ReviewSection | undefined {
  if (lanePath === undefined || lanePath === '') return undefined
  let best: ReviewSection | undefined
  for (const section of sections) {
    if (!insideDirectory(section.path, lanePath)) continue
    if (best === undefined || section.path.length > best.path.length) best = section
  }
  return best
}

export function reviewHandoff(input: ReviewHandoffInput): ReviewHandoff {
  const { item, section, supervision } = input
  const read = section === undefined ? undefined : filesOf(section.result)
  const files = read?.files
  const signature = files === undefined ? undefined : reviewSignature(files)
  const standing = reviewStanding(item.reviewed, signature, read?.identity)
  const changes: ReviewChanges | undefined =
    files === undefined || files.length === 0 || signature === undefined
      ? undefined
      : {
          files: files.length,
          added: files.reduce((n, f) => n + f.added, 0),
          removed: files.reduce((n, f) => n + f.removed, 0),
          signature,
          ...(read?.identity === undefined ? {} : { identity: read.identity }),
          ...(read?.shared === true ? { shared: true as const } : {})
        }
  const carry = (rest: Omit<ReviewHandoff, 'standing' | 'changes'>): ReviewHandoff => ({
    ...rest,
    standing,
    ...(changes === undefined ? {} : { changes })
  })

  // Nothing else can be said about a task that has never been started — and
  // it carries no `changes`, whatever section it was handed: a task with no
  // lane has no diff of its own, and a projection that reported one would be
  // attributing somebody else's files to it.
  if (item.panelId === undefined || item.worktreeId === undefined) {
    return { state: 'no-lane', standing, word: 'not started', tone: 'none', action: 'start', actionLabel: 'Start work…', detail: 'this task has no lane yet — starting work gives it a worktree and a conversation' }
  }

  // M401 (B2). An accepted task's `section` is undefined exactly when its
  // lane's record is gone (the caller reads nothing for a lane it has no
  // record of), so the sentence stops promising a lane the person removed.
  // M315. ACCEPTED outranks what the lane's diff now says. After a merge the
  // lane is measured against a main tree that already holds its commits, so
  // its section reads "no changes" and the mark reads "changed since" — the
  // moment of success reported as a warning. The merge record is the fact.
  if (item.merged !== undefined) {
    return carry({ state: 'accepted', word: `merged into ${item.merged.into}`, tone: 'idle', action: 'review', actionLabel: 'Review', detail: `you accepted it — ${mergedLine(item.merged)}; ${section === undefined ? 'its lane has been removed' : 'the lane stays until you remove it'}` })
  }

  // The lane is gone, or was never readable. Never review a DIFFERENT
  // directory to fill the gap: the recovery is to say which one it is.
  if (section === undefined) {
    return carry({ state: 'lane-missing', word: 'lane missing', tone: 'exited', action: 'start', actionLabel: 'Start work again…', detail: 'the worktree this task was started in is not listed any more — starting work again gives it a fresh lane' })
  }
  if (section.result.kind === 'baseline-lost') {
    return carry({ state: 'lane-missing', word: 'lane missing', tone: 'exited', action: 'start', actionLabel: 'Start work again…', detail: section.note ?? 'the lane could not be compared against the main tree — starting work again gives it a fresh lane' })
  }
  if (section.result.kind === 'git-missing') {
    return carry({ state: 'unreadable', word: 'unreadable', tone: 'exited', action: 'start', actionLabel: 'Start work again…', detail: 'git was not found on the login PATH, so this lane’s changes cannot be read — install git, or start work again once it is there' })
  }
  if (section.result.kind === 'repo-unreadable') {
    return carry({ state: 'unreadable', word: 'unreadable', tone: 'exited', action: 'start', actionLabel: 'Start work again…', detail: `this lane’s changes could not be read — ${section.result.detail}` })
  }
  if (section.result.kind === 'not-a-repo' || section.result.kind === 'never-started') {
    return carry({ state: 'unreadable', word: 'unreadable', tone: 'exited', action: 'start', actionLabel: 'Start work again…', detail: 'this lane is not a git worktree any more, so there is no diff to review — starting work again gives it a fresh one' })
  }

  // Execution outranks the diff: an agent still writing means the diff under
  // it is a moving target, and calling that "ready to review" is the lie this
  // milestone exists to remove.
  if (supervision !== undefined && supervision.blocker !== undefined) {
    return carry({
      state: 'blocked', word: 'needs you', tone: 'needs-you', action: 'answer', actionLabel: 'Answer',
      detail: `${supervision.detail} — the lane is not settled until this is answered`,
      blocker: { kind: supervision.blocker.kind, subject: supervision.blocker.subject }
    })
  }
  if (supervision !== undefined && (supervision.execution === 'running' || supervision.execution === 'queued')) {
    return carry({ state: 'working', word: 'working', tone: 'working', action: 'resume', actionLabel: 'Resume', detail: `${supervision.detail} — the changes under it are still moving, so there is nothing settled to review yet` })
  }

  if (files !== undefined && files.length === 0) {
    return carry({ state: 'empty', word: 'no changes', tone: 'idle', action: 'resume', actionLabel: 'Resume', detail: 'the conversation stopped and its lane holds no changes — nothing was written, which is not the same as nothing being wrong' })
  }

  const count = changes === undefined ? 0 : changes.files
  // The fourth attribution. A shared repository's diff holds work this task
  // cannot claim, so it is never called `ready to review` and its own
  // sentence says whose it might be — marking it reviewed is still allowed,
  // because a person CAN read it, but they are told what they are reading.
  if (read?.shared === true) {
    return carry({
      state: 'shared',
      word: standing === 'none' ? 'shared changes' : standing === 'stale' ? 'shared, and changed since you reviewed' : standing === 'unknown' ? 'shared, reviewed once' : 'shared, reviewed',
      tone: 'idle',
      action: 'review',
      actionLabel: standing === 'none' ? 'Review' : 'Review again',
      detail: `more than one panel has run in this repository, so these ${count} changed ${count === 1 ? 'file is' : 'files are'} not attributable to this task alone — read them, but do not read them as this agent's work`
    })
  }
  // M285. `unknown` gets its own words: a review happened, and this app cannot
  // say whether it was of these bytes — so it is neither "reviewed" nor
  // "changed since", and the action is to look again.
  const word = standing === 'current' ? 'reviewed' : standing === 'stale' ? 'changed since you reviewed' : standing === 'unknown' ? 'reviewed once, freshness unknown' : 'ready to review'
  const detail = standing === 'current'
    ? `you reviewed ${count === 1 ? 'this change' : 'these changes'} and the lane has not moved since`
    : standing === 'stale'
      ? `the lane has changed since you reviewed it — ${count} ${count === 1 ? 'file' : 'files'} stand now`
      : standing === 'unknown'
        ? `you reviewed this lane before this canvas recorded what it read, so it cannot say whether these ${count} ${count === 1 ? 'file' : 'files'} are what you saw — review again to make the mark checkable`
        : `the conversation stopped and its lane holds ${count} changed ${count === 1 ? 'file' : 'files'} — reviewing them is what decides the task, not the agent’s own account of them`
  return carry({ state: 'ready', word, tone: 'idle', action: 'review', actionLabel: standing === 'none' ? 'Review' : 'Review again', detail })
}

/* ── Evidence ────────────────────────────────────────────────────────────── */

/** Who witnessed the command end. The two are never merged; see the header. */
export type CheckAttribution = 'observed' | 'reported'

export interface CommandEvidence {
  attribution: CheckAttribution
  command: string
  /** `passed`/`failed`/`unknown`. Never derived from the command's TEXT. */
  outcome: 'passed' | 'failed' | 'unknown'
  /** Present for `observed` only: the code main read. A reported command has no code to show. */
  exitCode?: number | null
  at: number
  /** Who says so, in words, so a surface never has to spell the distinction itself. */
  source: string
}

export interface ReviewEvidence {
  commands: CommandEvidence[]
  /** Past the cap. COUNTED, never pre-sliced — M130's rule: a pre-slice makes `more` unreachable. */
  more: number
  /** Present only when there is nothing: a sentence naming why, never an empty list alone. */
  none?: string
  /**
   * WHICH kind of nothing, for a surface that styles or tests it. Present with
   * `none` and only then. `failed-reader`: a read was attempted and rejected.
   * `unread`: there was nowhere to read from (no terminal on this canvas, or
   * the conversation is closed). `never-ran`: every source was read and none
   * recorded a command. Only the last may be read as "nothing ran".
   */
  noneKind?: 'failed-reader' | 'unread' | 'never-ran'
}

/**
 * The ledger rows this app itself watched exit, narrowed to the lane.
 * Containment is `insideDirectory` — M196's rule reused rather than re-written,
 * so `/w/lane` cannot claim a command run in `/w/lane-old`.
 */
export function observedCommands(rows: readonly RunRow[], lanePath: string): CommandEvidence[] {
  const out: CommandEvidence[] = []
  for (const row of rows) {
    if (row.cwd === '' || !insideDirectory(lanePath, row.cwd)) continue
    // A row with no exit code is a command still running or one whose end was
    // lost. It is `unknown`, never `passed`: a confident green beside a
    // process that never finished is the wrong answer, told confidently.
    const outcome = row.exitCode === null ? 'unknown' : row.exitCode === 0 ? 'passed' : 'failed'
    out.push({
      attribution: 'observed',
      command: row.command,
      outcome,
      exitCode: row.exitCode,
      at: row.endedAt === 0 ? row.startedAt : row.endedAt,
      source: 'this canvas ran it and read its exit code'
    })
  }
  return out
}

/**
 * Commands the agent asked for, from the transcript.
 *
 * A block qualifies by NAMING A COMMAND, never by its tool's name: `Bash`,
 * `shell` and whatever the next backend calls it are all the same fact, and
 * a name list would go quietly wrong on the backend nobody tested. A block
 * with a `file_path` and no `command` names no command and is not one.
 */
export function reportedCommands(turns: readonly TranscriptTurn[]): CommandEvidence[] {
  const results = new Map<string, boolean>()
  for (const turn of turns) {
    for (const block of turn.blocks) {
      if (block.type === 'tool_result') results.set(block.toolUseId, block.isError)
    }
  }
  const out: CommandEvidence[] = []
  for (const turn of turns) {
    for (const block of turn.blocks) {
      if (block.type !== 'tool_use') continue
      const command = block.input.command
      if (typeof command !== 'string' || command.trim() === '') continue
      const isError = results.get(block.id)
      // Unanswered: the app watched the agent ask and never saw an answer.
      const outcome = isError === undefined ? 'unknown' : isError ? 'failed' : 'passed'
      out.push({ attribution: 'reported', command, outcome, at: turn.at, source: 'the agent ran it and its CLI reported the result' })
    }
  }
  return out
}

const RANK: Record<CommandEvidence['outcome'], number> = { failed: 0, unknown: 1, passed: 2 }

export interface EvidenceSources {
  /** False when a ledger read was ATTEMPTED and failed. Nowhere to read from is `ledgerPanels: 0`, not this. */
  ledgerRead: boolean
  /**
   * How many panels' ledgers were asked. Zero is "nowhere to read from" —
   * check-evidence.ts's rule, reused so the review node and Orchestrate's
   * Checks tab name the same silence the same way. Absent = not counted.
   */
  ledgerPanels?: number
  /** False when the lane's conversation is closed, so its commands were never looked for. */
  transcriptRead: boolean
}

/**
 * One list. Failures first — a non-zero exit is the fact a reviewer wants,
 * and burying it under a cap is how a review surface becomes decoration —
 * then unanswered, then passes, newest first within each.
 *
 * The empty arm is a SENTENCE, and which sentence depends on what was
 * actually looked at. "Nothing ran" and "nobody looked" are different facts,
 * and the first cut of this function said the first one in both cases — an
 * overclaim in exactly the module that exists to stop overclaiming. A closed
 * lane is the common case, not a corner: the conversation may have run fifty
 * commands and this app simply has nowhere to read them from.
 */
export function reviewEvidence(
  observed: readonly CommandEvidence[],
  reported: readonly CommandEvidence[],
  cap: number,
  sources: EvidenceSources = { ledgerRead: true, transcriptRead: true }
): ReviewEvidence {
  const all = [...observed, ...reported].sort((a, b) => (RANK[a.outcome] - RANK[b.outcome]) || (b.at - a.at))
  if (all.length === 0) {
    const missing: string[] = []
    // A failed read and an absent reader are kept apart: the first is a fault
    // worth retrying, the second is the ordinary case of a closed terminal.
    if (!sources.ledgerRead) missing.push('this canvas tried to read its own record of what it ran, and the read failed')
    else if (sources.ledgerPanels === 0) missing.push('no terminal on this canvas could have recorded a command in this lane, so there was nowhere to read its runs from')
    if (!sources.transcriptRead) missing.push('the lane\'s conversation is closed, so the commands it asked for were never looked for')
    return {
      commands: [],
      more: 0,
      none: missing.length === 0
        ? 'no commands were recorded for this lane — this canvas ran none in it, and the conversation asked for none'
        : `nothing to show, and not because nothing ran: ${missing.join('; ')}`,
      noneKind: !sources.ledgerRead ? 'failed-reader' : missing.length > 0 ? 'unread' : 'never-ran'
    }
  }
  return { commands: all.slice(0, cap), more: Math.max(0, all.length - cap) }
}
