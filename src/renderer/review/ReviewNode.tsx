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
                    <span className="review-node__path">{f.path}</span>
                    <span className="review-node__counts">{f.untracked ? 'new' : f.binary ? 'binary' : `+${f.added} −${f.removed}`}</span>
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

function ReviewNodeImpl({
  panel, selected, onSelect, onFocus, onBeginDrag, onClose, onCommitted,
  restoreFocus, focusedId, readOnly = false, onBeginLink, linkTarget, sectionLabel = () => undefined
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
                <span className="review-node__path">{f.path}</span>
                <span className="review-node__counts">
                  {f.untracked ? 'new' : f.binary ? 'bin' : `+${f.added} −${f.removed}`}
                </span>
                {f.touches !== undefined && <span className="review-node__touches" data-review-node-touches={f.touches}>· {f.touches} tool call{f.touches === 1 ? '' : 's'}</span>}
              </button>
              {model.discard.kind !== 'none' && !readOnly && (
                <button
                  type="button"
                  className="review-node__discard"
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
