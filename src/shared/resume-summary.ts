import { retainedNextAction, type RetainedOutcome } from './retained-outcomes'
import type { WorkItemState } from './work-items'

/**
 * M270 (D11). RESUME WORK — facts already on the board, the retained
 * outcome and the live supervision, never a written narrative.
 *
 * A reopen summary that invented "the agent finished the refactor" would
 * pass every visual check and still lie. Every field here is copied or
 * derived from a named source; an absent fact is omitted, never guessed.
 */

export interface ResumeSummary {
  itemId: string
  title: string
  /** The item's own description, first line only — omitted when none was given. */
  purpose?: string
  /** Last recorded execution or board disposition, as those modules already spell it. */
  lastOutcome?: string
  /** Open blocker from live supervision, review readiness, or the item's own note. */
  blocker?: string
  /** One next action, derived — never a plan. */
  nextAction: string
  /**
   * M315. What Continue DOES, when the handoff decided the next action: open
   * the review, go to the question, resume the conversation, or start work.
   * Absent when the action came from anywhere else — Continue then frames.
   */
  action?: 'review' | 'answer' | 'resume' | 'start'
  /** Which facts produced this summary, so a surface can say so. */
  sources: readonly string[]
}

export interface ResumeSummaryInput {
  item: {
    id: string
    title: string
    description?: string
    state: WorkItemState
    note?: string
  }
  retained?: Pick<RetainedOutcome, 'execution' | 'state' | 'refs'>
  execution?: { word: string; detail: string; blocker?: { kind: string; subject: string } }
  handoff?: { actionLabel: string; detail: string; blocker?: { kind: string; subject: string }; word?: string; action?: 'review' | 'answer' | 'resume' | 'start' }
}

function firstLine(text: string): string {
  const line = text.split('\n').map((s) => s.trim()).find((s) => s.length > 0)
  return line ?? ''
}

/** Prefer the live in-progress or review item, else the newest retained fact. */
export function pickResumeSubject(
  items: readonly ResumeSummaryInput['item'][],
  retained: readonly (Pick<RetainedOutcome, 'itemId' | 'capturedAt'> & ResumeSummaryInput['retained'])[]
): { itemId: string; via: 'working' | 'review' | 'retained' } | null {
  const working = items.find((i) => i.state === 'working')
  if (working !== undefined) return { itemId: working.id, via: 'working' }
  const review = items.find((i) => i.state === 'review')
  if (review !== undefined) return { itemId: review.id, via: 'review' }
  // M401 (B2). A DONE task is not a resume, whatever it retained: closing a
  // merged task's conversation (its review's Close task) retains an outcome,
  // and the next launch offered "Resume work … open blocker — lane closed"
  // for work that had already landed.
  const done = new Set(items.filter((i) => i.state === 'done').map((i) => i.id))
  const newest = [...retained].filter((r) => !done.has(r.itemId)).sort((a, b) => b.capturedAt - a.capturedAt)[0]
  if (newest !== undefined) return { itemId: newest.itemId, via: 'retained' }
  const todo = items.find((i) => i.state === 'todo')
  if (todo !== undefined) return { itemId: todo.id, via: 'working' }
  return null
}

/**
 * Build a resume summary from facts. Returns null when there is no item —
 * an empty canvas with no board is not a resume.
 */
export function buildResumeSummary(input: ResumeSummaryInput): ResumeSummary {
  const { item, retained, execution, handoff } = input
  const sources: string[] = ['title']
  const purpose = item.description !== undefined ? firstLine(item.description) : ''
  if (purpose !== '') sources.push('description')

  let lastOutcome: string | undefined
  if (retained !== undefined) {
    lastOutcome = retained.execution.replace(/-/g, ' ')
    sources.push('retained-outcome')
  } else if (execution !== undefined && !(execution.word === 'not started' && handoff?.word !== undefined)) {
    lastOutcome = execution.word
    sources.push('execution')
  } else if (handoff?.word !== undefined) {
    // M315. A session that is not running in THIS process (the app was
    // closed) reads "not started" — a fact about the process, not the task.
    // The lane's own word ("ready to review") is what happened to the work.
    lastOutcome = handoff.word
    sources.push('review-word')
  } else {
    lastOutcome = item.state
    sources.push('board-state')
  }

  let blocker: string | undefined
  if (execution?.blocker !== undefined) {
    blocker = execution.detail
    sources.push('execution-blocker')
  } else if (handoff?.blocker !== undefined) {
    blocker = handoff.detail
    sources.push('review-blocker')
  } else if (item.note !== undefined && item.note.trim() !== '') {
    blocker = item.note.trim()
    sources.push('item-note')
  }

  let nextAction: string
  let action: ResumeSummary['action']
  if (handoff !== undefined && handoff.actionLabel.trim() !== '') {
    nextAction = handoff.actionLabel
    sources.push('review-action')
    if (handoff.action !== undefined) action = handoff.action
  } else if (retained !== undefined) {
    nextAction = retainedNextAction(retained)
    sources.push('retained-next')
  } else if (item.state === 'review') {
    nextAction = 'review the lane changes'
    sources.push('board-state')
  } else if (item.state === 'done') {
    nextAction = 'review the retained evidence before closing history'
    sources.push('board-state')
  } else if (item.state === 'working') {
    nextAction = 'open the lane and continue'
    sources.push('board-state')
  } else {
    nextAction = 'start work when you are ready'
    sources.push('board-state')
  }

  return {
    itemId: item.id,
    title: item.title,
    ...(purpose !== '' ? { purpose } : {}),
    ...(lastOutcome !== undefined ? { lastOutcome } : {}),
    ...(blocker !== undefined ? { blocker } : {}),
    nextAction,
    ...(action === undefined ? {} : { action }),
    sources
  }
}
