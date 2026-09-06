import { useEffect, useRef, useState, type JSX } from 'react'
import type { WorkItem, WorkItemTransition } from '@shared/work-item'

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

  const runTransition = (transitionId: string): void => {
    if (busy !== null) return
    setBusy('transition')
    void window.canvas.jira.transition({ itemId: item.id, transitionId })
      .then((result) => {
        setOutcome(result.kind === 'done' ? 'ticket moved' : result.reason)
        setTransitions(null)
        // Re-read rather than patching the row in place: the rendered state
        // comes from Jira, so the screen cannot claim a state the server
        // never confirmed.
        if (result.kind === 'done') props.onWritten()
      })
      .catch(() => setOutcome('the transition could not be sent'))
      .finally(() => setBusy(null))
  }

  const stop = (event: { stopPropagation(): void; preventDefault(): void }): void => {
    event.stopPropagation(); event.preventDefault()
  }

  return <article className="jira-node__item" data-jira-ticket={item.id}>
    <strong>{item.id}: {item.title}</strong>
    <small>{item.state ?? 'No state'}{item.assignee ? ` · ${item.assignee}` : ''}</small>
    <p>{item.description || 'No description.'}</p>

    <div className="jira-node__actions">
      <button type="button" onMouseDown={(e) => { stop(e); props.onSpawn(item) }}>Start session</button>
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
          onMouseDown={(e) => { stop(e); runTransition(t.id) }}
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
