import { memo, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { ReviewPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { ReviewAcross, ReviewDiff, ReviewResult } from '@shared/review'
import { useAgentState } from '@renderer/session/agent-state-store'
import { NODE_FILE_CAP, buildReviewNodeModel } from './review-node-model'
import { useChat } from '@renderer/chat/chat-store'
import { indexToolFiles, touchesByPath, type ToolTouch } from '@shared/tool-index'
import { shortPath } from '@renderer/palette/panel-name'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { Refresh } from '@renderer/icons'
import { displayPath } from '@shared/display-path'
import {
  observedCommands, reportedCommands, reviewEvidence,
  type CommandEvidence, type ReviewEvidence, type ReviewHandoff
} from '@shared/review-readiness'
import type { RunRow } from '@shared/run-ledger'

/**
 * Everything the task section needs, resolved by the canvas rather than
 * re-derived here: the node holds a subject, and a subject is a repository
 * and a baseline — it has no way to reach the board, the worktree records or
 * the run ledger, and giving it one would make a review panel a second author
 * of facts the canvas already owns.
 */
export interface ReviewTaskContext {
  itemId: string
  title: string
  /** The lane's worktree path — which section of the across answer is this task's. */
  lanePath: string
  handoff: ReviewHandoff
  /**
   * The changed paths AND the signature the handoff was judged against, from
   * the canvas's one read. The node does not recompute them from its own
   * fetch: the two refresh on different triggers, so a second computation
   * could hand `Mark reviewed` a fingerprint for a diff the card never
   * judged — two authors of one fact.
   */
  paths: readonly string[]
  reviewed?: { at: number; signature: string; files: number }
  /** The agent's own last words, when the lane's conversation is open. Its ACCOUNT, never evidence. */
  account?: string
  /** Ask the canvas to re-read the lane's diff, so the card and this node move together. */
  onRefresh: () => void
  /**
   * The panels whose run-ledger rows may hold commands run in this lane. Only
   * the canvas knows which panels exist; the node filters what comes back by
   * the lane path, so a panel that has since moved contributes nothing.
   */
  ledgerPanelIds: readonly string[]
  /** The lane's conversation, for the agent's own reported commands. Absent when it is closed. */
  chatPanelId?: string
  onMarkReviewed: (itemId: string, signature: string, files: number) => void
  /** Focus the lane's chat and INSERT a message — never send it. */
  onContinue: (itemId: string, paths: readonly string[]) => void
}

export interface ReviewNodeProps {
  panel: ReviewPanel
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  /**
   * The same onFocus a terminal panel's body calls. Focus here buys one
   * thing and costs nothing: shouldYieldWheel's rule 3 gives the wheel to
   * the FOCUSED panel, so an unfocused node would pan the canvas instead of
   * scrolling its diff. It costs nothing because assignTiers never sees this
   * panel at all — a focused id that names no rect consumes no LIVE_BUDGET
   * slot, which is exactly what the partition in Canvas.tsx guarantees.
   */
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  /**
   * Shown inside another workspace's lane in M14's merged view, where
   * geometry is read-only. Suppresses the close button and the resize
   * handles for TerminalPanel's reason: Canvas.tsx gates the verbs
   * themselves, and an affordance that is rendered but refused reads as a
   * broken app where an absent one reads as a read-only view.
   */
  readOnly?: boolean
  /**
   * A commit landed. The node cannot advance its own baseline — `subject`
   * lives in the panel array — so Canvas rewrites it and the new prop
   * re-fires the query below. See Canvas's own comment for why this is not
   * an undo entry.
   */
  onCommitted: (nodeId: string, sha: string) => void
  /** M86. What the canvas calls a section's panel (the honest chain), for a cross-worktree node's headings. */
  sectionLabel?: (panelId: string) => string | undefined
  /**
   * M202 (D07). THE TASK this review belongs to, when it was opened from a
   * work card. Absent for every review opened by any other door, and the
   * whole task section is absent with it — a review of a panel's own changes
   * has no task, and inventing one would be worse than saying nothing.
   */
  task?: ReviewTaskContext
  /**
   * SessionHandle.focus() on a panel id — Canvas's own `restoreFocus`, the one
   * the palette already uses. The commit input is the second surface in this
   * app that takes DOM focus away from xterm, so it inherits usePalette's rule
   * 4: an unmounting input's blur leaves focus on `<body>`, where every
   * subsequent keystroke goes nowhere at all. It is threaded in rather than
   * looked up here because the review layer, like the palette layer,
   * deliberately knows nothing about the registry.
   */
  restoreFocus: (id: string) => void
  /**
   * Which panel had app focus when this node was rendered. Read at the moment
   * the draft OPENS — the capture is this component's own ref below — for the
   * reason usePalette captures rather than clears: `focusedId` still names the
   * terminal panel, because the commit button's preventDefault deliberately
   * never moved it.
   */
  focusedId: string | null
  /**
   * Begins a link drag from one of this node's four port handles (M35,
   * Task 7). Required on TerminalPanel's own `onBeginLink`'s precedent: an
   * optional prop here compiles clean on a missed wiring and produces "the
   * ring never appears for review nodes" — a feature that reads as
   * unbuilt, `PanelRow.agent`'s own lesson.
   */
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  /**
   * Whether an in-flight link draw would land on THIS node if released now
   * (M35, Task 7 fix round 1). Required on TerminalPanel's own `linkTarget`
   * precedent: an optional prop here compiles clean on a missed wiring and
   * produces "the ring never appears for review nodes" — the exact gap a
   * required `onBeginLink` did not itself catch, because a component that
   * never declares a prop at all has nothing to omit.
   */
  linkTarget: boolean
}

/**
 * One review node, in world space.
 *
 * It owns its OWN query, rather than receiving a result from Canvas, for the
 * reason RailPanelRow owns its own agent-state subscription: a canvas can
 * hold several nodes, and lifting their queries into Canvas would make every
 * node's refresh a Canvas re-render — the 60Hz cascade the memo architecture
 * exists to prevent, arriving through a new door.
 *
 * It reuses the `.panel` class deliberately. Drag, resize, selection, the
 * pointer corrector and shouldYieldWheel's `closest('.panel')` all key off
 * that class and `data-panel-id`; a private class name here would mean four
 * surfaces each growing a second case for a panel that is a panel in every
 * way that matters to them.
 */

/**
 * M86. The cross-worktree body: the main tree first, then one section per
 * worktree this app created, each headed by what the user calls it and its
 * branch. Three states — reading, an arm that could not answer (with why),
 * and the sections — and commit and discard are BLOCKED by name rather than
 * absent: a commit across worktrees would be N commits pretending to be one,
 * and a control that disappears is indistinguishable from one never built.
 */
function renderAcross(across: ReviewAcross | undefined, sectionLabel: (panelId: string) => string | undefined): JSX.Element {
  if (across === undefined) {
    return <p className="pf__summary review-node__summary" data-review-node-summary data-review-across="reading">reading every worktree…</p>
  }
  if (across.kind === 'git-missing') {
    return <p className="pf__note review-node__note" data-review-node-note data-review-across="unavailable">no git binary was found</p>
  }
  if (across.kind === 'unreadable') {
    return <p className="pf__note review-node__note" data-review-node-note data-review-across="unavailable">git could not open this repository — {across.detail}</p>
  }
  const changed = across.sections.filter((s) => s.result.kind === 'changes' || s.result.kind === 'shared').length
  return (
    <div className="review-node__across" data-review-across={String(across.sections.length)}>
      <p className="pf__summary review-node__summary" data-review-node-summary>
        {across.sections.length} worktree{across.sections.length === 1 ? '' : 's'} · {changed === 0 ? 'no changes anywhere' : `${changed} with changes`}
      </p>
      {/* No path row: the title names the repository and the context pane's
          identity line names it too — a two-line absolute path was the
          loudest thing in the well (M86's critic). */}
      <p className="pf__note review-node__note" data-review-node-commit-blocked>one worktree at a time — open that worktree's own review to commit or discard</p>
      {across.sections.map((section) => {
        const r = section.result
        const files = r.kind === 'changes' || r.kind === 'shared' ? r.files : []
        // ONE shape per heading (M86's critic): what the user calls it, then
        // its branch in the dim mono slot — for the main tree too — and one
        // count shape for every section with changes. `shared` carries no
        // totals of its own, so they are summed from its files rather than
        // withheld.
        const label = (section.panelId !== undefined ? sectionLabel(section.panelId) : undefined) ?? section.label
        const added = files.reduce((n, f) => n + f.added, 0)
        const removed = files.reduce((n, f) => n + f.removed, 0)
        return (
          <section key={section.path} className="review-node__section" data-review-section={section.branch}>
            <h4 className="review-node__section-head">
              <span className="review-node__section-label">{label}</span>
              <span className="review-node__section-branch">{section.branch}</span>
              <span className="review-node__section-count">
                {r.kind === 'clean' ? 'no changes'
                  : files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} · +${added} −${removed}`
                    : r.kind === 'baseline-lost' ? 'this worktree could not be read'
                      : r.kind}
              </span>
            </h4>
            {section.note !== undefined && <p className="pf__note review-node__note" data-review-section-note>{section.note}</p>}
            {files.length > 0 && (
              <ul className="review-node__files">
                {files.slice(0, NODE_FILE_CAP).map((f) => (
                  <li key={f.path} className="review-node__file" data-review-node-file={`${section.branch}:${f.path}`}>
                    {/* M165. The same card header the single-repository rows wear (the Act I critic). */}
                    <span className="review-node__path">{(() => { const i = f.path.lastIndexOf('/'); return i === -1 ? <span className="review-node__base">{f.path}</span> : <><span className="review-node__dir">{f.path.slice(0, i + 1)}</span><span className="review-node__base">{f.path.slice(i + 1)}</span></> })()}</span>
                    <span className="review-node__counts">{f.untracked ? <span className="review-node__new">new</span> : f.binary ? <span className="review-node__new">binary</span> : <><span className="review-node__add">+{f.added}</span> <span className="review-node__del">−{f.removed}</span></>}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

/**
 * stopPropagation so a press on a control inside the header does not start a
 * DRAG; preventDefault so DOM focus stays where the person left it —
 * shellControl's rule, which every control in this app obeys. Same shape as
 * `WorkNode`'s, spelled here rather than shared because a control helper that
 * travelled between files would be one more thing to keep in step.
 */
const press = (fn: () => void) => (e: ReactMouseEvent): void => { e.stopPropagation(); e.preventDefault(); fn() }

/** How many commands the section shows before it starts counting instead. */
const EVIDENCE_CAP = 8
/**
 * How far back each panel's ledger is read. A bound, and a recorded one: the
 * overflow `more` is counted over what was READ, so a lane with more than
 * this many commands in one panel understates it. Raising it costs a bigger
 * IPC reply on every task review; the number a reviewer needs is the recent
 * one, and the failures sort to the top of what is read.
 */
const LEDGER_ROWS_PER_PANEL = 40

/**
 * M202 (D07). THE TASK SECTION — the answer to "what should I do with this
 * result?", beside the diff that is the result.
 *
 * Three things, in the order a person asks for them: what state the task is
 * in, what was actually RUN and who says so, and the two things to do next.
 *
 * The evidence list is the part with the sharp edge. A command this canvas
 * spawned carries the exit code MAIN read off the PTY; a command from the
 * conversation carries the agent's CLI's word for it and NO code, because
 * there is none to show. They are two different kinds of knowledge and they
 * are labelled as two, every row, every time — a single "checks passed" line
 * over both would be putting this application's name on somebody else's
 * answer. Nothing here decides that a command was a "test": see
 * `review-readiness.ts`'s header for why that guess is not made.
 */
function renderTask(
  task: ReviewTaskContext,
  evidence: ReviewEvidence | undefined,
  paths: readonly string[],
  signature: string | undefined,
  readOnly: boolean,
  press: (run: () => void) => (e: ReactMouseEvent) => void
): JSX.Element {
  const h = task.handoff
  // `shared` is markable too: a person CAN read a shared diff, and the
  // section's own sentence tells them what they are reading. Excluding it
  // would make the module's promise ("still reviewable") false at the
  // surface, which is where it matters.
  const markable = signature !== undefined && (h.state === 'ready' || h.state === 'shared') && !readOnly
  return (
    <section className="review-node__task" data-review-task={task.itemId}>
      <h4 className="review-node__section-head">
        <span className="review-node__section-label">{task.title}</span>
        <span className="review-node__section-count" data-review-task-word={h.state} data-review-task-standing={h.standing} data-tone={h.tone}>{h.word}</span>
      </h4>
      <p className="pf__note review-node__note" data-review-task-detail>{h.detail}</p>

      {/* D07 step 2's "unresolved questions". The blocker is M199's, projected
          by the same table the card and the workflow diagram read, so all
          three name the same question. It is stated and NOT answerable here:
          a permission prompt is answered at the conversation or in Attention,
          which is where the person can see what they are agreeing to. */}
      {h.blocker !== undefined && (
        <p className="pf__note review-node__note" data-review-task-blocker={h.blocker.kind} role="status">
          unresolved: {h.blocker.kind === 'approval' ? `the lane is waiting on you about ${h.blocker.subject}` : `the lane is waiting for you at its keyboard — ${h.blocker.subject}`} — answer it in the conversation, then review
        </p>
      )}

      {/* D07 step 2's "agent explanation", labelled as what it is. It is the
          agent's ACCOUNT of its own work and sits apart from the evidence
          list on purpose: attributing it as a finding would be the exact
          collapse this phase exists to prevent. */}
      {task.account !== undefined && task.account !== '' && (
        <div className="review-node__account" data-review-task-account>
          <span className="review-node__evidence-who">the agent&#39;s own account, not evidence</span>
          <p className="pf__note review-node__note">{task.account}</p>
        </div>
      )}

      {/* Three states, never two: not read yet, read and empty, and a list. */}
      {evidence === undefined ? (
        <p className="pf__note review-node__note" data-review-evidence="reading">reading what was run in this lane…</p>
      ) : evidence.none !== undefined ? (
        <p className="pf__note review-node__note" data-review-evidence="none">{evidence.none}</p>
      ) : (
        <ul className="review-node__evidence" data-review-evidence={String(evidence.commands.length)}>
          {evidence.commands.map((c: CommandEvidence, i) => (
            <li key={`${c.attribution}:${c.command}:${c.at}:${i}`} className="review-node__evidence-row"
              data-review-evidence-row={c.attribution} data-review-evidence-outcome={c.outcome} title={c.source}>
              <span className="review-node__evidence-outcome" data-tone={c.outcome === 'failed' ? 'needs-you' : c.outcome === 'unknown' ? 'none' : 'idle'}>
                {c.outcome === 'failed' ? (c.exitCode === undefined ? 'failed' : `exit ${String(c.exitCode)}`) : c.outcome === 'unknown' ? 'no result' : c.exitCode === undefined ? 'reported ok' : 'exit 0'}
              </span>
              <span className="review-node__evidence-command">{c.command}</span>
              {/* The attribution is on every row, never once at the top: a
                  heading over a mixed list is read once and forgotten. */}
              <span className="review-node__evidence-who">{c.attribution === 'observed' ? 'this canvas ran it' : 'the agent reported it'}</span>
            </li>
          ))}
          {evidence.more > 0 && <li className="review-node__evidence-more" data-review-evidence-more={String(evidence.more)}>{evidence.more} more</li>}
        </ul>
      )}

      {task.reviewed !== undefined && (
        <p className="pf__note review-node__note" data-review-task-mark={h.standing}>
          {h.standing === 'stale'
            ? `you reviewed ${task.reviewed.files} file${task.reviewed.files === 1 ? '' : 's'} here, and the lane has changed since`
            : `you reviewed ${task.reviewed.files} file${task.reviewed.files === 1 ? '' : 's'} here`}
        </p>
      )}

      <div className="review-node__task-verbs">
        {/* Marking a review done is a PERSON's act and has no verb, no palette
            row and no agent line, on purpose: a plan asserting that somebody
            reviewed something is the false claim this whole phase removes. It
            sits beside Commit, which is a node control for the same family of
            reason. Present at rest and disabled by name, never absent. */}
        <button type="button" className="pf__verb pf__verb--word" data-review-task-verb="mark"
          disabled={!markable}
          title={markable ? 'record that you have read these changes' : readOnly ? 'leave merged view to act on this review' : (h.state === 'ready' || h.state === 'shared') ? 'the changes are still being read' : h.detail}
          onMouseDown={markable ? press(() => { task.onMarkReviewed(task.itemId, signature as string, paths.length); task.onRefresh() }) : undefined}>
          {task.reviewed === undefined ? 'Mark reviewed' : 'Mark reviewed again'}
        </button>
        {/* INSERTED into the composer, never sent — M80's rule for every
            template message, and the only version that leaves the person in
            charge of what their agent is told. */}
        <button type="button" className="pf__verb pf__verb--word" data-review-task-verb="continue"
          disabled={readOnly || task.chatPanelId === undefined}
          title={readOnly ? 'leave merged view to act on this review' : task.chatPanelId === undefined ? 'the lane\'s conversation is closed — start work again to open a new one' : 'focus the lane\'s conversation and draft a message about these files; nothing is sent'}
          onMouseDown={readOnly || task.chatPanelId === undefined ? undefined : press(() => task.onContinue(task.itemId, paths))}>
          Continue the conversation
        </button>
      </div>
    </section>
  )
}

function ReviewNodeImpl({
  panel, selected, onSelect, onFocus, onBeginDrag, onClose, onCommitted,
  restoreFocus, focusedId, readOnly = false, onBeginLink, linkTarget, sectionLabel = () => undefined, task
}: ReviewNodeProps): JSX.Element {
  const { subject } = panel
  const [result, setResult] = useState<ReviewResult | undefined>(undefined)
  // M86. The cross-worktree answer, when this node is one. `undefined` is
  // "asked, unanswered" — the third state — never an empty section list.
  const [across, setAcross] = useState<ReviewAcross | undefined>(undefined)
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [diff, setDiff] = useState<ReviewDiff | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  // null = the control is at rest. A string = the input is open, holding the
  // message. Two states in one, so "is the input showing" and "what is in it"
  // cannot disagree.
  const [draft, setDraft] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  // The last commit's own answer. Cleared when a new draft opens, so a refusal
  // from a previous attempt cannot sit under a fresh one.
  const [outcome, setOutcome] = useState<string | null>(null)
  // M53. The row whose discard is ARMED — a presentation state, like the ×'s
  // arming, and cleared by the same things: a second press, a cancel, a
  // refresh. Only one row can be armed, because the sentence is the
  // disclosure and two disclosures on screen at once read as a list.
  const [armedPath, setArmedPath] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState(false)
  // M202. The run-ledger rows for the panels the canvas named, or `null` for
  // "not asked yet" — the third state again, so the evidence list can say
  // `reading…` rather than showing an empty list it has not earned.
  const [ledgerRows, setLedgerRows] = useState<RunRow[] | null>(null)
  // True when the ledger was not actually consulted — the read failed, or
  // there was no panel on this canvas to read one from. Kept apart from a
  // read that came back empty, because "this canvas could not read its own
  // record of what it ran" and "nothing ran" are different facts that lead to
  // different conclusions about the lane.
  const [ledgerUnreadable, setLedgerUnreadable] = useState(false)
  // Captured when the draft opens, exactly as usePalette captures `focusedId`
  // rather than clearing it — and used on BOTH exits below.
  const capturedFocusRef = useRef<string | null>(null)

  /**
   * The one way the message input closes, so both exits restore the keyboard.
   *
   * NO CHECK IN THIS REPO CAN OBSERVE THIS, and that is stated rather than
   * papered over: the panels suite drives the input through a dispatched
   * KeyboardEvent, and DOM focus after an unmount is a browser default action
   * a synthetic event never triggers (the same untrusted-event limit
   * verify:panels 47 and 75c both record from their own sides). Deleting the
   * restoreFocus call leaves every suite green and leaves the user's next
   * keystroke going nowhere — usePalette's rule 4 failure, silently.
   */
  const closeDraft = (): void => {
    setDraft(null)
    const id = capturedFocusRef.current
    capturedFocusRef.current = null
    if (id !== null) restoreFocus(id)
  }

  // review:at, never review:panel: the node asks about a BASELINE it stores,
  // so it keeps answering after main has dropped the subject panel's own
  // baseline on kill. See ReviewSubject in shared/review.ts.
  useEffect(() => {
    let live = true
    // M86. A cross-worktree node asks `review:across` for its ROOT and never
    // `review:at`: the sections are each worktree's diff since its fork,
    // and `result` stays undefined so the ordinary commit and discard arms
    // have nothing to offer — they are blocked by name below.
    if (subject.across === true) {
      void window.canvas.review.across(subject.repoRoot)
        .then((a) => { if (live) setAcross(a) })
        .catch((error: unknown) => { if (live) setAcross({ kind: 'unreadable', detail: String(error) }) })
      return () => { live = false }
    }
    void window.canvas.review.at(subject)
      .then((r) => { if (live) setResult(r) })
      // A rejected invoke must LAND IN AN ARM, never be swallowed. `result`
      // staying undefined leaves the node reading "reading…" for the rest of
      // the run — a permanent spinner, which is the one state this feature's
      // honest-degradation rule forbids: every other failure has a sentence.
      // `repo-unreadable` is the arm that already renders "git could not open
      // this repository — <detail>", which is exactly what an IPC failure at
      // this door means to a user. The `live` guard is repeated rather than
      // shared, because a rejection arriving after unmount must not set state
      // either.
      .catch((error: unknown) => {
        if (live) setResult({ kind: 'repo-unreadable', detail: String(error) })
      })
    return () => { live = false }
  }, [subject, refreshToken])

  // The subject's agent going quiet is the one signal worth re-reading on —
  // the same choice Canvas's inspector query makes, and for the same reason
  // IPC.REVIEW_PANEL's own comment gives: `idle` means "this agent stopped
  // producing output". A COUNTER of arrivals rather than the state itself,
  // so leaving idle does not fire a second round of git processes. The
  // subject may be gone entirely, in which case this is simply never true.
  const subjectState = useAgentState(subject.subjectId)
  // SEEDED from the first observed state, never left at `undefined`. A node
  // mounted beside a subject that is ALREADY idle would otherwise read its
  // first observation as `undefined -> 'idle'`, i.e. as an arrival, and fire a
  // second review:at on top of the one the mount effect above already issued —
  // two rounds of git subprocesses for one mount, on every reload and every
  // switch back to this workspace, which is the commonest way a node is
  // mounted at all. `seen` rather than comparing against a sentinel state,
  // because `undefined` is itself a real value here (a subject that never
  // spawned) and would collide with any string chosen to mean "not yet".
  const prevStateRef = useRef<{ seen: boolean; state: string | undefined }>(
    { seen: false, state: undefined })
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = { seen: true, state: subjectState }
    if (prev.seen && subjectState === 'idle' && prev.state !== 'idle') {
      setRefreshToken((n) => n + 1)
    }
  }, [subjectState])

  // One file at a time. Fetching every file's hunks up front is megabytes of
  // text inside .world for a node the user may only glance at.
  useEffect(() => {
    if (expandedPath === null) { setDiff(null); return }
    const row = result !== undefined && (result.kind === 'changes' || result.kind === 'shared')
      ? result.files.find((f) => f.path === expandedPath)
      : undefined
    let live = true
    setDiff(null)
    void window.canvas.review.diff({
      repoRoot: subject.repoRoot,
      baselineSha: subject.baselineSha,
      path: expandedPath,
      untracked: row?.untracked === true
    })
      .then((d) => { if (live) setDiff(d) })
      // Same rule as the query above, one layer in: `diff` staying null is
      // rendered by Hunks as "reading…", so a rejection here leaves an
      // expanded file spinning forever. `unavailable` is the arm that already
      // says "this diff could not be read".
      .catch(() => { if (live) setDiff({ kind: 'unavailable' }) })
    return () => { live = false }
  }, [expandedPath, subject, result])

  // The BUILD is memoized, keyed on its four inputs — never on a serialized
  // signature of its own output. Canvas hands this component a new `panel`
  // object on every frame of a drag, so the rebuild genuinely has to be
  // skipped; the question is what the key is.
  //
  // The rail cannot key on identity and this can, and the difference is worth
  // stating because the two modules otherwise look like the same problem.
  // `railSignature` exists because `buildRailRows` is fed a freshly-mapped
  // array — `panels.map(...)` produces new objects every render, so no
  // identity there is stable and only the CONTENT can be compared. Here every
  // input already survives a rect change unchanged: `subject` and
  // `panel.title` are carried by reference through `setPanelRect`'s
  // `{ ...p, rect }`, and `result`/`expandedPath` are this component's own
  // state, which a drag does not touch. So React's dependency comparison
  // answers the same question for free.
  //
  // Serializing instead would impose the very cost it was meant to prevent:
  // the signature was `JSON.stringify` over the model AND the diff, so a drag
  // with a large file expanded stringified up to DIFF_MAX_LINES line objects
  // per frame to avoid one object allocation.
  // M77. The tool calls that touched each file, from the SUBJECT chat's
  // transcript through the chat store (a terminal subject has no store entry
  // and reads as empty). Re-derived as turns land; keyed the way a review row
  // spells a path.
  const subjectChat = useChat(subject.subjectId)

  /* ── M202 (D07). The task section's evidence ────────────────────────────
     Read on the same token the diff is read on, so a refresh refreshes both
     and the two can never describe different moments. The panel ids come
     from the canvas; the rows are then filtered by the LANE PATH here, so a
     terminal that has since been moved to another folder contributes
     nothing — and the filter is `insideDirectory`'s, reached through
     `observedCommands`, rather than a prefix test that would let a
     neighbouring lane's commands in.                                       */
  const taskPanelIds = task?.ledgerPanelIds
  const taskPanelKey = taskPanelIds === undefined ? '' : [...taskPanelIds].join(' ')
  useEffect(() => {
    if (task === undefined) { setLedgerRows(null); setLedgerUnreadable(false); return }
    let live = true
    const ids = taskPanelIds ?? []
    setLedgerUnreadable(false)
    // No terminal on this canvas is NOWHERE TO READ FROM, not a ledger read
    // that came back empty. The lane's terminal being closed is the ordinary
    // case, and saying "this canvas ran none in it" over a record nobody
    // consulted is the same overclaim the failed-read arm below fixes.
    if (ids.length === 0) { setLedgerRows([]); setLedgerUnreadable(true); return }
    setLedgerRows(null)
    // allSettled, not all: one panel's ledger rejecting must not discard
    // every other panel's rows. A partial read is still evidence; it is
    // flagged as incomplete rather than thrown away.
    void Promise.allSettled(ids.map((id) => window.canvas.ledger.list(id, LEDGER_ROWS_PER_PANEL)))
      .then((settled) => {
        if (!live) return
        setLedgerRows(settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])))
        setLedgerUnreadable(settled.some((r) => r.status === 'rejected'))
      })
      // A ledger this app could not read is NOT evidence that nothing ran,
      // and the section says which of the two it is. The first cut resolved
      // to an empty list with a comment claiming the distinction did not
      // matter; it does, and this is the module that says so about
      // everything else.
      .catch(() => { if (live) { setLedgerRows([]); setLedgerUnreadable(true) } })
    return () => { live = false }
  }, [taskPanelKey, refreshToken, task === undefined]) // eslint-disable-line react-hooks/exhaustive-deps

  const laneChat = useChat(task?.chatPanelId ?? '')
  // The signature comes from the handoff the canvas built, never from a
  // second read here — see ReviewTaskContext.paths.
  const taskSignature = task?.handoff.changes?.signature
  const taskEvidence = useMemo<ReviewEvidence | undefined>(() => {
    if (task === undefined || ledgerRows === null) return undefined
    return reviewEvidence(
      observedCommands(ledgerRows, task.lanePath),
      task.chatPanelId === undefined ? [] : reportedCommands(laneChat.turns),
      EVIDENCE_CAP,
      // What was actually LOOKED AT, so the empty arm cannot claim nothing
      // ran when the truth is that nobody could look.
      { ledgerRead: !ledgerUnreadable, transcriptRead: task.chatPanelId !== undefined }
    )
  }, [task, ledgerRows, ledgerUnreadable, laneChat.turns])
  const rowPaths = useMemo(() => (result !== undefined && (result.kind === 'changes' || result.kind === 'shared') ? result.files.map((f) => f.path) : []), [result])
  const touchMap = useMemo(() => touchesByPath(indexToolFiles(subjectChat.turns), subject.repoRoot, rowPaths), [subjectChat.turns, subject.repoRoot, rowPaths])
  const touchCounts = useMemo(() => { const out: Record<string, number> = {}; for (const [k, v] of touchMap) out[k] = v.length; return out }, [touchMap])
  const model = useMemo(
    () => buildReviewNodeModel({ subject, title: panel.title, result, expandedPath, touches: touchCounts }),
    [subject, panel.title, result, expandedPath, touchCounts]
  )
  const { rect, z } = panel

  // M53. One path per call — the row's own confirm — and the result is
  // read back by REFRESHING, never by editing the local result: the engine's
  // answer is the only one that can say what the tree looks like now. No
  // history entry is pushed; the armed sentence says so.
  const runDiscard = (path: string): void => {
    if (discarding || model.discard.kind !== 'ready') return
    setDiscarding(true)
    setOutcome(null)
    void window.canvas.review.discard(
      { root: subject.repoRoot, baseline: subject.baselineSha, subjectId: subject.subjectId, paths: [path] }
    )
      .then((r) => {
        setDiscarding(false)
        setArmedPath(null)
        if (r.kind === 'discarded') {
          const parts: string[] = []
          if (r.restored.length > 0) parts.push(`restored ${r.restored.join(', ')}`)
          if (r.removed.length > 0) parts.push(`deleted ${path}`)
          for (const f of r.failed) parts.push(`could not discard ${f.path} — ${f.detail}`)
          setOutcome(parts.join(' · '))
        } else {
          setOutcome(
            r.kind === 'nothing-to-discard' ? 'nothing to discard'
              : r.kind === 'refused' ? `discard refused — ${r.detail}`
              : `could not discard — ${r.detail}`)
        }
        setRefreshToken((n) => n + 1)
      })
      .catch((error: unknown) => {
        setDiscarding(false)
        setArmedPath(null)
        setOutcome(`could not discard — ${String(error)}`)
      })
  }

  const runCommit = (): void => {
    const message = draft?.trim() ?? ''
    // Three guards, and only one of them is silent. `committing` is silent on
    // purpose: the button is already disabled and reads "committing…", so
    // there is nothing left to say. The other two are reachable from the
    // primary path — type a message, press Enter — and must each say why
    // nothing happened, or Enter becomes the inert-button-with-no-explanation
    // failure this file's own rule forbids for every other query in it.
    if (committing) return
    if (message === '') {
      setOutcome('a commit needs a message')
      return
    }
    if (model.commit.kind !== 'ready') {
      // The node re-queries on its own whenever the subject's agent goes
      // idle, so `result` can flip out from under an input the user is still
      // typing into. If it landed on `blocked`, that arm already names the
      // reason (e.g. a shared checkout) — reuse it rather than inventing a
      // second, vaguer sentence for the same fact. Otherwise there is
      // nothing left to commit at all; say so and point at the refresh.
      setOutcome(
        model.commit.kind === 'blocked'
          ? model.commit.reason
          : 'these changes are no longer available to commit — refresh and try again')
      return
    }
    setCommitting(true)
    setOutcome(null)
    void window.canvas.review.commit(
      { root: subject.repoRoot, paths: model.commit.paths, message }
    )
      .then((r) => {
        setCommitting(false)
        if (r.kind === 'committed') {
          closeDraft()
          // Collapse the open file: the list it belonged to is about to be
          // empty, and an expanded body attached to a row that is gone is the
          // state buildReviewNodeModel's `expanded`-on-the-row already guards.
          setExpandedPath(null)
          onCommitted(rect.id, r.sha)
          return
        }
        // Every other arm has a sentence. `nothing-to-commit` is reachable
        // between the query and the click — the agent reverted its own work —
        // and reads as a bug unless it says so.
        setOutcome(
          r.kind === 'refused' ? `refused — ${r.detail}`
            : r.kind === 'failed' ? `could not commit — ${r.detail}`
            // Its own sentence, and it names the fix rather than the fault:
            // the repository gained a commit while this one was being
            // prepared, nothing was written, and the refresh control beside
            // this button is what the user needs next. Folding it into
            // `failed` would send them to look at a git that is working.
            : r.kind === 'head-moved'
              ? 'the repository moved since this was read — refresh and try again'
              : 'nothing to commit — the files changed since this was read')
      })
      // A REJECTED INVOKE MUST LAND IN A VISIBLE STATE. Left to the catch-less
      // version, `committing` stays true forever: the button reads "committing…"
      // for the rest of the run, which is the permanent-spinner state this
      // feature's honest-degradation rule forbids, on the one verb where the
      // user most needs to know whether it happened.
      .catch((error: unknown) => {
        setCommitting(false)
        setOutcome(`could not commit — ${String(error)}`)
      })
  }

  return (
    <PanelFrame
      id={rect.id}
      kind="review"
      rect={rect}
      z={z}
      selected={selected}
      linkTarget={linkTarget}
      readOnly={readOnly}
      className="review-node"
      rootAttrs={{ 'data-review-node': '' }}
      title={model.heading}
      onSelect={onSelect}
      onBeginDrag={onBeginDrag}
      onBeginLink={onBeginLink}
      // No arming step, unlike a terminal panel's ×: there is no process to
      // lose. Closing a review node throws away a query, and the same button
      // reopens it.
      close={readOnly ? null : { armed: false, title: 'Close this review', armedText: '', onMouseDown: (event) => { event.stopPropagation(); event.preventDefault(); onClose(rect.id) } }}
      chrome={<>
        <button
          type="button"
          className="review-node__refresh icon-button"
          title="Read this repository again"
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            setRefreshToken((n) => n + 1)
            // …and the CARD with it. Without this the node could show a moved
            // diff while the card still judged the old one, and `Mark
            // reviewed` — which takes the CARD's signature, deliberately, so
            // there is one author — would record the stale fingerprint.
            task?.onRefresh()
          }}
        >
          <Refresh />
        </button>
        {/* M86. A cross-worktree node keeps the Commit control, DISABLED with
            its reason: a control that disappears is indistinguishable from a
            feature never built (M86's critic). */}
        {subject.across === true && (
          <button type="button" className="review-node__commit" data-review-node-commit disabled
            title="one worktree at a time — open that worktree's own review to commit"
            onMouseDown={(event) => { event.stopPropagation(); event.preventDefault() }}>Commit</button>
        )}
        {model.commit.kind !== 'none' && (
          <button
            type="button"
            className="review-node__commit"
            data-review-node-commit
            disabled={model.commit.kind === 'blocked' || committing}
            title={model.commit.kind === 'blocked' ? model.commit.reason : 'Commit these changes'}
            onMouseDown={(event) => {
              // preventDefault is what keeps DOM focus off this button and on
              // whatever had it — shellControl's rule, which every control in
              // this app obeys. stopPropagation is what stops the header's own
              // handler starting a DRAG from a click on a button inside it.
              event.stopPropagation()
              event.preventDefault()
              if (model.commit.kind !== 'ready' || committing) return
              setOutcome(null)
              // Only on the way IN. Re-pressing the control with a draft
              // already open would otherwise wipe a half-typed message — on
              // the one verb in this app where the text is the point — and
              // the press is far more plausibly a mis-aim than a request to
              // start over.
              if (draft === null) capturedFocusRef.current = focusedId
              setDraft((d) => d ?? '')
            }}
          >
            {committing ? 'committing…' : 'commit'}
          </button>
        )}
      </>}
    >


      <div
        className="pf__body pf__body--text review-node__body"
        // The marker shouldYieldWheel looks for. It is an ATTRIBUTE on the
        // element that actually scrolls, so "does this panel own its wheel"
        // is answered by what the KIND renders rather than by a branch inside
        // the predicate — see Canvas.tsx's rule 3.
        data-scroll-host
        onMouseDown={(event) => {
          event.stopPropagation()
          onFocus(rect.id)
        }}
      >
        {draft !== null && (
          <div className="review-node__commit-form">
            <input
              className="review-node__commit-input"
              data-review-node-commit-input
              autoFocus
              value={draft}
              placeholder={model.commit.kind === 'ready' ? model.commit.label : 'Commit message'}
              onChange={(event) => setDraft(event.target.value)}
              // stopPropagation on EVERY key, not only the two handled below.
              // useViewport's keydown listener is on `window`, above this
              // component's root container in the bubble path, so without this
              // a Cmd+N typed while composing a message spawns a panel behind
              // the node and a Cmd+K opens the palette over it. It is the
              // pointer-half of the same rule usePalette's isOpen() gives the
              // keyboard, reached by containment instead of by a flag.
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') { event.preventDefault(); runCommit() }
                if (event.key === 'Escape') { event.preventDefault(); closeDraft() }
              }}
              onMouseDown={(event) => event.stopPropagation()}
            />
          </div>
        )}
        {outcome !== null && (
          <p className="review-node__commit-outcome" data-review-node-commit-outcome>{outcome}</p>
        )}
        {/* M202 (D07). The task first, then the diff it is about: the
            question a person came with is "what should I do with this?", and
            the file list is the evidence for the answer rather than the
            answer. Absent entirely for a review opened by any other door. */}
        {task !== undefined && renderTask(task, taskEvidence, task.paths, taskSignature, readOnly, press)}
        {subject.across === true ? renderAcross(across, sectionLabel) : (<>
        <p className="pf__summary review-node__summary" data-review-node-summary>{model.summary}</p>
        {/* M164. The path rule: the repository's basename at rest, the full path on hover. */}
        <p className="review-node__root" title={model.root}>{displayPath(model.root, model.root).short}</p>
        </>)}
        {model.note !== undefined && (
          <p className="pf__note review-node__note" data-review-node-note>{model.note}</p>
        )}
        <ul className="review-node__files">
          {model.files.map((f) => (
            <li key={f.path} className="review-node__file" data-review-node-file={f.path}>
              <button
                type="button"
                className={`review-node__file-button${f.expanded ? ' review-node__file-button--open' : ''}`}
                title={f.expanded ? 'Hide the diff' : f.touches !== undefined ? 'Show the diff and the tool calls that touched this file' : 'Show the diff'}
                onMouseDown={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  onFocus(rect.id)
                  setExpandedPath(f.expanded ? null : f.path)
                }}
              >
                {/* M165. The basename leads (the UI face, bold); the directory follows in mono. */}
                <span className="review-node__path">{(() => { const i = f.path.lastIndexOf('/'); return i === -1 ? <span className="review-node__base">{f.path}</span> : <><span className="review-node__dir">{f.path.slice(0, i + 1)}</span><span className="review-node__base">{f.path.slice(i + 1)}</span></> })()}</span>
                <span className="review-node__counts">
                  {f.untracked ? <span className="review-node__new">new</span> : f.binary ? <span className="review-node__new">bin</span> : <><span className="review-node__add">+{f.added}</span> <span className="review-node__del">−{f.removed}</span></>}
                </span>
                {f.touches !== undefined && <span className="review-node__touches" data-review-node-touches={f.touches}>· {f.touches} tool call{f.touches === 1 ? '' : 's'}</span>}
              </button>
              {model.discard.kind !== 'none' && !readOnly && (
                <button
                  type="button"
                  className={`review-node__discard${armedPath === f.path ? ' review-node__discard--armed' : ''}`}
                  data-review-node-discard={f.path}
                  disabled={model.discard.kind === 'blocked' || discarding}
                  title={model.discard.kind === 'blocked' ? model.discard.reason : `Discard the changes to ${f.path}`}
                  onMouseDown={(event) => {
                    event.stopPropagation()
                    event.preventDefault()
                    if (model.discard.kind !== 'ready' || discarding) return
                    onFocus(rect.id)
                    setArmedPath((p) => (p === f.path ? null : f.path))
                  }}
                >
                  {armedPath === f.path ? 'keep' : 'discard'}
                </button>
              )}
              {armedPath === f.path && (
                <div className="review-node__discard-armed" data-review-node-discard-armed={f.path}>
                  <p className="review-node__discard-sentence">
                    {f.untracked
                      ? `${f.path} did not exist at spawn. Delete it? This cannot be undone.`
                      : `Restore ${f.path} to its state at spawn (${subject.baselineSha.slice(0, 7)})? Anything changed by hand since then goes with it. This cannot be undone.`}
                  </p>
                  <button
                    type="button"
                    className="review-node__discard-confirm"
                    data-review-node-discard-confirm={f.path}
                    disabled={discarding}
                    onMouseDown={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                      runDiscard(f.path)
                    }}
                  >
                    {discarding ? 'discarding…' : f.untracked ? 'Delete' : 'Restore'}
                  </button>
                </div>
              )}
              {f.expanded && f.touches !== undefined && <Touches list={touchMap.get(f.path) ?? []} />}
              {f.expanded && <Hunks diff={diff} />}
            </li>
          ))}
        </ul>
        {model.more > 0 && <p className="pf__more review-node__more">+{model.more} more files</p>}
      </div>

    </PanelFrame>
  )
}

/**
 * `null` is "still reading", which is a different sentence from
 * `unavailable` — and both are different from an empty diff, which this
 * component can never render, because review-engine.ts refuses to produce
 * one (see fileDiff's own comment).
 */
/** M77. The tool calls that touched an expanded file, in transcript order. */
function Touches({ list }: { list: ToolTouch[] }): JSX.Element {
  const clock = (at: number): string => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  return (
    <ul className="review-node__touch-list" data-review-node-touch-list>
      {/* The chat's own tool-row idiom (`Tool · input`), then the time — one
          vocabulary for what happened to a file (M77's critic). */}
      {list.map((t) => <li key={t.toolUseId} className="review-node__touch"><span className="chat__tool-name">{t.toolName}</span> · <span className="review-node__touch-arg">{shortPath(t.path, 2)}</span> · {clock(t.at)}</li>)}
    </ul>
  )
}

function Hunks({ diff }: { diff: ReviewDiff | null }): JSX.Element {
  if (diff === null) return <p className="review-node__hunk-note">reading…</p>
  if (diff.kind === 'binary') return <p className="review-node__hunk-note">binary file</p>
  if (diff.kind === 'unavailable') return <p className="review-node__hunk-note">this diff could not be read</p>
  return (
    <div className="review-node__hunks" data-review-node-hunks>
      {diff.lines.map((line, i) => (
        <div className={`review-node__line review-node__line--${line.kind}`} key={i}>{line.text}</div>
      ))}
      {diff.truncated > 0 && (
        <div className="review-node__hunk-note">+{diff.truncated} more lines</div>
      )}
    </div>
  )
}

export const ReviewNode = memo(ReviewNodeImpl)
