import { memo, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { stepCalls, type RunState } from '@shared/agent-run'
import { toolArgument, toolVerb } from '@renderer/chat/chat-model'
import { shellControl } from '@renderer/shell/shell-control'
import { CALL_TONE, CALL_WORD, STEP_TONE, STEP_WORD, spanWords } from './run-words'

/**
 * M671. ONE AGENT RUN AS A TIMELINE — each prompt a step, each step's tool
 * calls beneath it, a step that waits on the person said so.
 *
 * Adapted from Creance's `RunTimeline` (MIT, © 2026 Amit Shrivastava,
 * commit c8bfae4; `NOTICE.md` beside this file). Kept from it: an ordered
 * list in a focusable, labelled scroll region; FOLLOWING new steps only
 * while the person is at the bottom, and a "Jump to latest" control
 * otherwise (scrolling up to read is never yanked back down); the jump is
 * instant under reduced motion; a failure or a wait is announced once each
 * in a polite live region; calls are selectable so a detail card can show
 * the one picked.
 *
 * Changed for this app: the run is a `RunState` folded from the transcript
 * (`shared/agent-run.ts`), not Creance's props tree; status is a Tone dot
 * through `[data-tone]`; calls read with the chat's own verb and argument;
 * and there are no nested child steps — this app's CLIs do not report a
 * step tree, and a nesting the data never fills would be decoration.
 */

export interface RunTimelineProps {
  run: RunState
  /** Follow new steps as they arrive. Default true. */
  live?: boolean
  label?: string
  selectedCallId?: string
  onSelectCall?(id: string): void
  emptyText?: string
}

/** Distance from the bottom, in px, that still counts as "at the latest" (Creance's own figure). */
const PIN_THRESHOLD = 32

function announcementFor(run: RunState, seen: Set<string>): string | undefined {
  let message: string | undefined
  for (const id of run.stepIds) {
    const s = run.steps[id]
    if (s === undefined) continue
    const key = `${s.id}:${s.status}`
    if ((s.status === 'failed' || s.status === 'waiting') && !seen.has(key)) {
      seen.add(key)
      message = s.status === 'failed' ? `Step failed: ${s.title}. ${s.error ?? ''}` : `Waiting for you: ${s.title}`
    }
    for (const c of stepCalls(run, id)) {
      const callKey = `${c.id}:${c.status}`
      if (c.status === 'error' && !seen.has(callKey)) { seen.add(callKey); message = `Tool call ${c.tool} failed: ${c.error ?? ''}` }
    }
  }
  return message
}

function RunTimelineImpl({ run, live = true, label = 'Run timeline', selectedCallId, onSelectCall, emptyText = 'Nothing has run yet. Send the agent a message and its steps appear here.' }: RunTimelineProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinned = useRef(true)
  const jumping = useRef(false)
  const [hasNew, setHasNew] = useState(false)
  const seen = useRef(new Set<string>())
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const message = announcementFor(run, seen.current)
    if (message !== undefined) setAnnouncement(message)
  }, [run])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el === null || !live) return
    if (pinned.current) el.scrollTop = el.scrollHeight
    else if (el.scrollHeight > el.clientHeight) setHasNew(true)
  }, [run, live])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (el === null) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD
    if (jumping.current) { if (atBottom) jumping.current = false; return }
    pinned.current = atBottom
    if (atBottom) setHasNew(false)
  }

  const jumpToLatest = (): void => {
    const el = scrollRef.current
    if (el === null) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    pinned.current = true
    jumping.current = !reduce
    setHasNew(false)
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <div className="sv-timeline" data-sv-timeline={run.stepIds.length}>
      <div ref={scrollRef} className="sv-timeline__scroll" role="region" aria-label={label} tabIndex={0} onScroll={onScroll} data-scroll-host>
        {run.stepIds.length === 0 ? <p className="sv-timeline__empty" data-sv-timeline-empty>{emptyText}</p> : (
          <ol className="sv-timeline__list">
            {run.stepIds.map((id) => {
              const step = run.steps[id]
              if (step === undefined) return null
              const calls = stepCalls(run, id)
              const span = step.status === 'waiting' ? '' : spanWords(step.startedAt, step.endedAt)
              return (
                <li key={id} className="sv-step" data-sv-step={id} data-sv-status={step.status}>
                  <span className="status-dot sv-step__marker" data-tone={STEP_TONE[step.status]} aria-hidden="true" />
                  <div className="sv-step__body">
                    <div className="sv-step__row">
                      <span className="sv-step__title" title={step.title}>{step.title}</span>
                      <span className="sv-badge" data-tone={STEP_TONE[step.status]}>{STEP_WORD[step.status]}{span === '' ? '' : ` · ${span}`}</span>
                    </div>
                    {step.error !== undefined && <p className="sv-step__error">{step.error}</p>}
                    {calls.length > 0 && (
                      <ul className="sv-step__calls" aria-label={`Tool calls in ${step.title}`}>
                        {calls.map((call) => {
                          const callSpan = spanWords(call.startedAt, call.endedAt)
                          const content = (
                            <>
                              <span className="status-dot" data-tone={CALL_TONE[call.status]} aria-hidden="true" />
                              <span className="sv-call__verb" title={call.tool}>{toolVerb(call.tool)}</span>
                              <code className="sv-call__arg">{toolArgument(call.input)}</code>
                              <span className="sv-call__state">{CALL_WORD[call.status]}{callSpan === '' ? '' : ` · ${callSpan}`}</span>
                            </>
                          )
                          return (
                            <li key={call.id} className="sv-call" data-sv-call={call.id} data-sv-status={call.status}>
                              {onSelectCall !== undefined ? (
                                <button type="button" className="sv-call__button" title={`Show this ${call.tool} call below`} aria-current={selectedCallId === call.id ? 'true' : undefined}
                                  {...shellControl(() => onSelectCall(call.id))}>{content}</button>
                              ) : <div className="sv-call__row">{content}</div>}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
      {hasNew && (
        <button type="button" className="orch__mini sv-timeline__jump" data-sv-jump {...shellControl(jumpToLatest)}>Jump to latest</button>
      )}
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    </div>
  )
}

export const RunTimeline = memo(RunTimelineImpl)
