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
  panel, selected, onSelect, onFocus, onBeginDrag, onClose
}: ReviewNodeProps): JSX.Element {
  const { subject } = panel
  const [result, setResult] = useState<ReviewResult | undefined>(undefined)
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [diff, setDiff] = useState<ReviewDiff | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

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
        {/* No arming step, unlike a terminal panel's ×: there is no process
            to lose. Closing a review node throws away a query, and the same
            button reopens it. */}
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

      {(['e', 's', 'se'] as const).map((edge) => (
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
