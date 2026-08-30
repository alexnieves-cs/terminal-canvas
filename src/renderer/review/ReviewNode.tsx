import { memo, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { ReviewPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { ReviewDiff, ReviewResult } from '@shared/review'
import { useAgentState } from '@renderer/session/agent-state-store'
import { buildReviewNodeModel } from './review-node-model'

export interface ReviewNodeProps {
  panel: ReviewPanel
  selected: boolean
  onSelect: (id: string) => void
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
function ReviewNodeImpl({
  panel, selected, onSelect, onFocus, onBeginDrag, onClose, onCommitted,
  restoreFocus, focusedId, readOnly = false
}: ReviewNodeProps): JSX.Element {
  const { subject } = panel
  const [result, setResult] = useState<ReviewResult | undefined>(undefined)
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
  const model = useMemo(
    () => buildReviewNodeModel({ subject, title: panel.title, result, expandedPath }),
    [subject, panel.title, result, expandedPath]
  )
  const { rect, z } = panel

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
    <div
      className={`panel review-node${selected ? ' panel--selected' : ''}`}
      data-panel-id={rect.id}
      data-review-node
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }}
    >
      <header
        className="panel__chrome"
        onMouseDown={(event: ReactMouseEvent) => {
          event.stopPropagation()
          event.preventDefault()
          onSelect(rect.id)
          onBeginDrag({
            panelId: rect.id,
            mode: { kind: 'move' },
            originRect: rect,
            originWorld: { x: event.clientX, y: event.clientY }
          })
        }}
      >
        <span className="panel__title">{model.heading}</span>
        <button
          type="button"
          className="review-node__refresh"
          title="Read this repository again"
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            setRefreshToken((n) => n + 1)
          }}
        >
          ⟳
        </button>
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
            {committing ? 'committing…' : '⌦'}
          </button>
        )}
        {/* No arming step, unlike a terminal panel's ×: there is no process
            to lose. Closing a review node throws away a query, and the same
            button reopens it. */}
        {!readOnly && (
          <button
            type="button"
            className="panel__close"
            title="Close this review"
            onMouseDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
              onClose(rect.id)
            }}
          >
            ×
          </button>
        )}
      </header>

      <div
        className="review-node__body"
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
        <p className="review-node__summary" data-review-node-summary>{model.summary}</p>
        <p className="review-node__root">{model.root}</p>
        {model.note !== undefined && (
          <p className="review-node__note" data-review-node-note>{model.note}</p>
        )}
        <ul className="review-node__files">
          {model.files.map((f) => (
            <li key={f.path} className="review-node__file" data-review-node-file={f.path}>
              <button
                type="button"
                className={`review-node__file-button${f.expanded ? ' review-node__file-button--open' : ''}`}
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
              </button>
              {f.expanded && <Hunks diff={diff} />}
            </li>
          ))}
        </ul>
        {model.more > 0 && <p className="review-node__more">+{model.more} more files</p>}
      </div>

      {(readOnly ? [] : (['e', 's', 'se'] as const)).map((edge) => (
        <div
          key={edge}
          className={`panel__resize panel__resize--${edge}`}
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onSelect(rect.id)
            onBeginDrag({
              panelId: rect.id,
              mode: { kind: 'resize', edge },
              originRect: rect,
              originWorld: { x: event.clientX, y: event.clientY }
            })
          }}
        />
      ))}
    </div>
  )
}

/**
 * `null` is "still reading", which is a different sentence from
 * `unavailable` — and both are different from an empty diff, which this
 * component can never render, because review-engine.ts refuses to produce
 * one (see fileDiff's own comment).
 */
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
