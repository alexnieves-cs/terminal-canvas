import { useEffect, useRef, useState, type JSX } from 'react'
import type { WorkItem, WorkItemTransition } from '@shared/work-item'
import { providerState } from '@renderer/panels/panel-state'

/**
 * One ticket, and the two writes aimed at it. It is its own component rather
 * than more JSX inside JiraNode's .map() for a structural reason: each row
 * needs its OWN draft, its OWN fetched transition list and its OWN in-flight
 * flag, and per-row state means per-row hooks, which cannot live in a loop.
 */
export function JiraTicket(props: {
  item: WorkItem
  focusedId: string | null
  restoreFocus: (id: string) => void
  onSpawn(item: WorkItem): void
  /** M113. Add to board — an upsert by the issue key. */
  onAddToBoard(item: WorkItem): void
  boardKeys?: ReadonlySet<string>
  onWritten(): void
}): JSX.Element {
  const { item } = props
  const [added, setAdded] = useState(false)
  useEffect(() => { if (!added) return; const t = setTimeout(() => setAdded(false), 2000); return () => clearTimeout(t) }, [added])
  const [draft, setDraft] = useState<string | null>(null)
  const [transitions, setTransitions] = useState<WorkItemTransition[] | null>(null)
  /**
   * WHICH verb is in flight, never a bare boolean. One shared boolean made
   * every control read as busy, so sending a COMMENT relabelled the Move
   * button "Loading…" — a label claiming a transition fetch that was not
   * happening. Two booleans would desync; one value that names the verb
   * cannot. Every control still disables on any in-flight write, which is
   * correct: the row has one row's worth of state to keep consistent.
   */
  const [busy, setBusy] = useState<null | 'comment' | 'transitions' | 'transition'>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  /**
   * M259. AN OPTIMISTIC MOVE. The ticket shows where it is GOING the moment
   * the move is pressed — marked pending, never as Jira's answer — and then
   * one of two compact states: `moved` once the re-read confirms it, or a
   * rollback that puts the old state back and says why. The screen still
   * never claims a state the server has not confirmed: pending is its own
   * visual, and the confirmed state is the re-read's (the rule below).
   */
  const [move, setMove] = useState<null | { to: string; from: string | null; phase: 'pending' | 'moved' | 'rolled-back'; reason?: string }>(null)
  // The confirmation arrives as a NEW item.state from the re-read: that is when pending becomes moved.
  useEffect(() => {
    if (move === null || move.phase !== 'pending') return
    if (item.state !== move.from) setMove({ ...move, phase: 'moved' })
  }, [item.state])
  // The compact result steps back after a few seconds; the ticket's own state carries the fact from then on.
  useEffect(() => {
    if (move === null || move.phase === 'pending') return
    const t = setTimeout(() => setMove(null), 4000)
    return () => clearTimeout(t)
  }, [move])
  const [expanded, setExpanded] = useState(false)

  /**
   * The panel that had the keyboard when the draft opened. Captured rather
   * than read at close time, for usePalette's reason: by the time the input
   * unmounts, focus has already left.
   */
  const capturedFocusRef = useRef<string | null>(null)

  /**
   * The one way the draft closes, so BOTH exits give the keyboard back.
   *
   * NO CHECK IN THIS REPO CAN OBSERVE THIS, and that is stated rather than
   * papered over: DOM focus after an unmount is a browser default action a
   * dispatched event never performs (verify:panels 47 and 75c record the same
   * limit from their own sides). Delete this and every suite stays green
   * while the user's next keystroke goes nowhere — usePalette's rule 4.
   */
  const closeDraft = (): void => {
    setDraft(null)
    const id = capturedFocusRef.current
    capturedFocusRef.current = null
    if (id !== null) props.restoreFocus(id)
  }

  const sendComment = (): void => {
    const body = draft?.trim() ?? ''
    // `busy` is the silent guard: the button already reads "sending…", so
    // there is nothing left to say. The empty case is reachable from the
    // primary path — press Enter on an empty field — and must say why, or
    // Enter becomes an inert key with no explanation.
    if (busy !== null) return
    if (body === '') { setOutcome('a comment needs a body'); return }
    setBusy('comment')
    void window.canvas.jira.comment({ itemId: item.id, body })
      .then((result) => {
        setOutcome(result.kind === 'done' ? 'comment added' : result.reason)
        if (result.kind === 'done') closeDraft()
      })
      // A rejected invoke must LAND IN AN ARM, never be swallowed: an
      // unresolved promise leaves the row reading "sending…" forever.
      .catch(() => setOutcome('the comment could not be sent'))
      .finally(() => setBusy(null))
  }

  /** The FETCH is the arm. It is also where "you cannot transition this" is
   *  discovered, before a button that would fail is ever offered. */
  const armTransition = (): void => {
    if (busy !== null) return
    setBusy('transitions')
    void window.canvas.jira.transitions(item.id)
      .then((result) => {
        if (result.kind === 'transitions') {
          setTransitions(result.transitions)
          if (result.transitions.length === 0) setOutcome('no transitions available')
        } else setOutcome(result.reason)
      })
      .catch(() => setOutcome('transitions could not be read'))
      .finally(() => setBusy(null))
  }

  const runTransition = (t: WorkItemTransition): void => {
    if (busy !== null) return
    setBusy('transition')
    const to = t.toState ?? t.name
    setMove({ to, from: item.state, phase: 'pending' })
    setTransitions(null)
    void window.canvas.jira.transition({ itemId: item.id, transitionId: t.id })
      .then((result) => {
        setOutcome(result.kind === 'done' ? 'ticket moved' : result.reason)
        // Re-read rather than patching the row in place: the rendered state
        // comes from Jira, so the screen cannot claim a state the server
        // never confirmed. The pending mark holds until that re-read lands.
        if (result.kind === 'done') {
          props.onWritten()
          // Jira ACCEPTED the move; if the re-read never shows a new status
          // (a transition onto the same-named status), pending must not stick.
          setTimeout(() => setMove((m) => (m !== null && m.phase === 'pending' ? { ...m, phase: 'moved' } : m)), 8000)
        } else setMove({ to, from: item.state, phase: 'rolled-back', reason: result.reason })
      })
      .catch(() => { setOutcome('the transition could not be sent'); setMove({ to, from: item.state, phase: 'rolled-back', reason: 'the transition could not be sent' }) })
      .finally(() => setBusy(null))
  }

  const stop = (event: { stopPropagation(): void; preventDefault(): void }): void => {
    event.stopPropagation(); event.preventDefault()
  }

  // M259. STATUS FIRST, in the board's words; Jira's own status rides the title.
  const shown = move !== null && move.phase === 'pending' ? move.to : item.state
  const st = providerState('jira', shown)
  const long = item.description.length > 160 || item.description.includes('\n')
  return <article className="jira-node__item" data-jira-ticket={item.id} data-jira-move={move?.phase}>
    <div className="jira-node__head">
      <span className="jira-node__pill" data-tone={st.tone} data-jira-state={st.word} data-pending={move?.phase === 'pending' ? 'true' : undefined}
        title={move?.phase === 'pending' ? `Moving to ${move.to} — waiting for Jira to confirm` : shown === null ? 'Jira gave no status' : `Jira says ${shown}`}>{move?.phase === 'pending' ? `moving to ${move.to}…` : st.word}</span>
      <span className="jira-node__assignee" data-jira-assignee>{item.assignee ?? 'unassigned'}</span>
      <span className="jira-node__key">{item.id}</span>
    </div>
    <strong className="jira-node__title">{item.title}</strong>
    {move !== null && move.phase !== 'pending' && (
      <p className="jira-node__move" data-jira-move-result={move.phase} role="status">
        {move.phase === 'moved' ? `Moved to ${move.to}` : `Couldn't move to ${move.to} — still ${move.from ?? 'without a status'}${move.reason === undefined ? '' : `: ${move.reason}`}`}
      </p>
    )}
    {/* The description is the deep-detail layer: two lines at rest, the rest on request. */}
    <p className={`jira-node__description${expanded ? ' jira-node__description--open' : ''}`}>{item.description || 'No description.'}</p>
    {long && <button type="button" className="jira-node__expand" aria-expanded={expanded} onMouseDown={(e) => { stop(e); setExpanded((v) => !v) }}>{expanded ? 'Show less' : 'Show more'}</button>}

    <div className="jira-node__actions">
      <button type="button" className="is-primary" onMouseDown={(e) => { stop(e); props.onSpawn(item) }}>Start session</button>
      <button type="button" data-work-add={item.id} title={`Put ${item.id} on the board — a second press updates it`} onMouseDown={(e) => { stop(e); props.onAddToBoard(item); setAdded(true) }}>{added ? 'Added' : props.boardKeys?.has(item.id) ? 'On board' : 'Add to board'}</button>
      <button
        type="button"
        data-jira-comment-open
        disabled={busy !== null}
        onMouseDown={(e) => {
          stop(e)
          if (draft === null) { capturedFocusRef.current = props.focusedId; setDraft('') }
          else closeDraft()
        }}
      >Comment</button>
      <button type="button" disabled={busy !== null} onMouseDown={(e) => { stop(e); armTransition() }}>
        {busy === 'transitions' ? 'Loading…' : 'Move…'}
      </button>
    </div>

    {transitions !== null && transitions.length > 0 && (
      <div className="jira-node__transitions">
        {transitions.map((t) => <button
          key={t.id} type="button" disabled={busy !== null}
          onMouseDown={(e) => { stop(e); runTransition(t) }}
        >{t.name}{t.toState !== null && t.toState !== t.name ? ` → ${t.toState}` : ''}</button>)}
      </div>
    )}

    {draft !== null && (
      <div className="jira-node__comment-form">
        <textarea
          className="jira-node__comment-input"
          data-jira-comment-input
          autoFocus
          value={draft}
          placeholder="Comment on this ticket"
          onChange={(event) => setDraft(event.target.value)}
          // stopPropagation on EVERY key, not only the two handled below.
          // useViewport's keydown listener is on `window`, above this
          // component in the bubble path, so without this a Cmd+N typed
          // while composing spawns a panel behind the node and a Cmd+K
          // opens the palette over it.
          //
          // This is NOT enough on its own: useNavGrid's listener is
          // CAPTURE-phase on window and has already run by the time this
          // fires, which is why .jira-node__comment-form is named in that
          // hook's own target test.
          onKeyDown={(event) => {
            event.stopPropagation()
            // Enter sends; Shift+Enter is a newline, because a comment is
            // prose and a multi-paragraph one must be typeable.
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendComment() }
            if (event.key === 'Escape') { event.preventDefault(); closeDraft() }
          }}
          onMouseDown={(event) => event.stopPropagation()}
        />
        <button type="button" disabled={busy !== null} onMouseDown={(e) => { stop(e); sendComment() }}>
          {busy === 'comment' ? 'Sending…' : 'Send'}
        </button>
      </div>
    )}

    {outcome !== null && <p className="jira-node__outcome" data-jira-outcome>{outcome}</p>}
  </article>
}
