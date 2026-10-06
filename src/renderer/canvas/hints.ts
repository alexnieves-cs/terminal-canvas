/**
 * M173. THE HINTS AS DATA. M48's four gesture hints and the tmux notice are
 * one list: each an id (persisted under `hints.seen` once a person has used
 * the gesture or dismissed the notice) and a SENTENCE. The fixed hint strip
 * that carried them was a strip that itself needed explaining (the brief,
 * finding 5); they live where a person needs them — the rail's empty state
 * (the gestures) and the launcher (the tmux notice, a first-run banner) — and
 * a seen id never comes back. Pure; `verify:rail hints.1`.
 */
export type HintId = 'pan' | 'zoom' | 'palette' | 'new-panel' | 'tmux' | 'starter' | 'first-task'
export interface Hint { id: HintId; text: string; where: 'rail' | 'launcher' }

export const HINTS: ReadonlyArray<Hint> = [
  { id: 'pan', text: 'A two-finger drag pans the canvas.', where: 'rail' },
  { id: 'zoom', text: 'A pinch, or ⌘= and ⌘−, zooms it.', where: 'rail' },
  { id: 'palette', text: '⌘K opens the palette with every verb.', where: 'rail' },
  { id: 'new-panel', text: '⌘N starts a panel where the camera is.', where: 'rail' },
  // The launcher's "Keep agents running between sessions" row states the
  // benefit; this is its "How" disclosure, so the mechanism is named here.
  { id: 'tmux', text: 'Sessions stay alive across a reload or relaunch when tmux is installed — without it, each one ends with the app. Install tmux (for example, brew install tmux), then relaunch.', where: 'launcher' },
  // M205 critic 2.4: the starter canvas lives inside the closed "More ways to
  // start" disclosure on purpose (D09's header — a tour is not the primary),
  // but that leaves it with no door a first-time person would ever open. One
  // sentence, pointing at exactly where it is, shown until dismissed like the
  // tmux notice beside it.
  // M399 (A5): the banner now carries the door itself, so the sentence no
  // longer sends a person looking for it.
  { id: 'starter', text: 'New to terminal canvas? A starter canvas walks through one example of every kind of object.', where: 'launcher' }
]

/** `where` narrows to one surface's hints; both surfaces read this one list (the Act III critic: two readers of one list had drifted). */
export function hintsLeft(seen: ReadonlySet<string>, where?: Hint['where']): Hint[] {
  return HINTS.filter((h) => !seen.has(h.id) && (where === undefined || h.where === where))
}

/** The tmux notice's own sentence, the launcher's banner text. A dismissal outlives an install: the Environment report still states the backend, and a notice that came back after every relaunch would be a strip again. */
export const TMUX_HINT: Hint = HINTS[4]
/** The starter-canvas discoverability line, the same "shown until dismissed" shape as `TMUX_HINT`. */
export const STARTER_HINT: Hint = HINTS[5]

/**
 * M441. The empty canvas's two gestures, in the words the mockup uses.
 * Not members of HINTS: `hints.1` pins that list's ids, and these sentences
 * are the empty canvas's, not the rail's.
 */
export const EMPTY_CANVAS_GESTURES = [
  { id: 'pan', text: 'Space + drag to pan' },
  { id: 'zoom', text: '⌘ + scroll to zoom' }
] as const

/**
 * M262. TAUGHT AFTER AN ATTEMPT, ONE AT A TIME. Four sentences at rest were
 * four instructions before a person had tried anything — the review's
 * complaint. The rail now carries a hint only once the person has reached
 * for its gesture the wrong way (Canvas.tsx's attempt listener: a mouse drag
 * on the empty canvas is a reach for pan, a mouse wheel for zoom, typing into
 * nothing for the palette), and only that
 * one. A seen id still never comes back.
 */
export function contextualHint(seen: ReadonlySet<string>, attempted: HintId | null): Hint[] {
  if (attempted === null) return []
  return hintsLeft(seen, 'rail').filter((h) => h.id === attempted)
}

/** What an input on the empty canvas was reaching for, or null. Pure — the listener hands it the facts. */
export function attemptOf(e: { type: string; button?: number; deltaMode?: number; ctrlKey?: boolean; metaKey?: boolean; key?: string }): HintId | null {
  if (e.type === 'mousedown' && e.button === 0) return 'pan'
  if (e.type === 'wheel' && e.ctrlKey !== true && e.deltaMode === 1) return 'zoom'
  // M388. A double-click on the ground is no longer a reach for anything —
  // it places a process step (Canvas.tsx onCanvasDoubleClick), so teaching
  // ⌘N after it would contradict what just happened on screen.
  if (e.type === 'keydown' && e.metaKey !== true && e.ctrlKey !== true && typeof e.key === 'string' && e.key.length === 1) return 'palette'
  return null
}

/**
 * THE FIRST START'S HANDOFF. One dismissible line after the first task is made,
 * worded from the conversation's ACTUAL state rather than a tour's script:
 * what is happening now, and what the person can do next. `sent` is whether
 * the sentence went to the agent (Start task sends it; a conversation-only
 * start inserts it and waits). Null when there is nothing to hand off — the
 * session ended, and the panel says so itself. Not in HINTS: it has no surface
 * of its own before a start, only a `hints.seen` id so it is shown once.
 */
export type FirstTaskStatus = 'not-started' | 'starting' | 'ready' | 'streaming' | 'exited' | 'disposed'
export function firstTaskHint(status: FirstTaskStatus | undefined, turns: number, sent: boolean, needsInput = false): string | null {
  if (status === 'exited' || status === 'disposed') return null
  if (status === undefined || status === 'not-started' || status === 'starting') return 'Your agent is starting.'
  // A pending permission request stops the agent mid-turn: the status still
  // reads `streaming`, so "working on it" would tell a person to wait for an
  // agent that is waiting for THEM. It outranks every other sentence.
  if (needsInput) return 'Your agent needs your input — answer it in the conversation.'
  if (status === 'streaming') return 'Your agent is working on it. Anything you type now is a follow-up.'
  if (turns === 0 && !sent) return 'Send your first message — your sentence is already in the composer.'
  return 'Your agent answered. Read it in the conversation, or type a follow-up.'
}

/**
 * The conversation-only start's rail — Ask, or a folder with no lane — where
 * there is no review to walk to: starting, working (or waiting on the person),
 * answered. Read off the same state as the sentence, so the two never
 * disagree. Null exactly when `firstTaskHint` is.
 */
export type FirstTaskRailStep = 'start' | 'work' | 'answered'
export function firstTaskRail(status: FirstTaskStatus | undefined, turns: number, sent: boolean, needsInput = false): { step: FirstTaskRailStep; label: string; state: 'done' | 'current' | 'todo' }[] | null {
  if (firstTaskHint(status, turns, sent, needsInput) === null) return null
  const at = status === undefined || status === 'not-started' || status === 'starting' ? 0
    : needsInput || status === 'streaming' || (turns === 0 && !sent) ? 1 : 2
  const labels: [FirstTaskRailStep, string][] = [['start', 'Starting'], ['work', needsInput ? 'Needs your input' : 'Working'], ['answered', 'Answered']]
  return labels.map(([step, label], i) => ({ step, label, state: i < at ? 'done' : i === at ? 'current' : 'todo' }))
}

/**
 * M310. THE FLAGSHIP GUIDE — the first task, walked end to end. The first
 * start's hint used to stop at "your agent answered"; the flow it is meant to
 * teach goes on: review what changed, run the lane's checks, open the pull
 * request. This is that walk as five steps, each read off the task's ACTUAL
 * state (the conversation, the review mark's standing, the lane's watchers,
 * the card's PR) — never a script that advances on a timer or a click.
 *
 * `firstTaskHint` above stays the sentence for the first two steps; this adds
 * the rail and the step after. The action is always the REVIEW: that is where
 * checks run and the PR opens, so the guide sends a person to one place.
 */
// M315. A task with no GitHub issue ends in `accept` — the lane merged into the
// main branch — where it used to end at "ready" with the work still on a side
// branch; a GitHub task keeps `pr`.
export type FlagshipStep = 'start' | 'work' | 'review' | 'checks' | 'pr' | 'accept'
export interface FlagshipGuideFacts {
  status: FirstTaskStatus | undefined
  turns: number
  sent: boolean
  /** The conversation holds a pending permission request — the agent is waiting on the person. */
  needsInput?: boolean
  /** The review mark's standing (M285), undefined before the lane was read. */
  standing?: 'none' | 'current' | 'stale' | 'unknown'
  /** The lane holds changes to review. */
  hasChanges: boolean
  /** A watcher in the lane has passed its last run. */
  checksPassed: boolean
  github: boolean
  pr: boolean
  /** M315. The person accepted the task — its lane was merged. */
  merged?: boolean
}
export interface FlagshipGuide {
  steps: { step: FlagshipStep; label: string; state: 'done' | 'current' | 'todo' }[]
  /** The agent is waiting on the person — the rail's current step says so, in the attention tone. */
  needsInput?: boolean
  sentence: string
  /** The one verb: open the task's review. Absent while the agent still has the turn. */
  action?: string
}
// The rail reads as the sequence a person lives through — starting, working,
// ready to review — in the participle, because each step names what is
// happening NOW, not a menu of stages. `work` is relabelled "Needs your input"
// while the agent waits on the person (flagshipLabel below).
const FLAGSHIP_LABELS: Record<FlagshipStep, string> = { start: 'Starting', work: 'Working', review: 'Ready to review', checks: 'Checks', pr: 'Pull request', accept: 'Accept' }
function flagshipLabel(step: FlagshipStep, needsInput: boolean): string {
  return step === 'work' && needsInput ? 'Needs your input' : FLAGSHIP_LABELS[step]
}
export function flagshipGuide(f: FlagshipGuideFacts): FlagshipGuide | null {
  const needsInput = f.needsInput === true
  const first = firstTaskHint(f.status, f.turns, f.sent, needsInput)
  if (first === null) return null
  const last: FlagshipStep = f.github ? 'pr' : 'accept'
  const order: FlagshipStep[] = ['start', 'work', 'review', 'checks', last]
  if (needsInput && f.status !== undefined && f.status !== 'not-started' && f.status !== 'starting') {
    return { steps: order.map((step, i) => ({ step, label: flagshipLabel(step, true), state: i < 1 ? 'done' : i === 1 ? 'current' : 'todo' })), sentence: first, needsInput: true }
  }
  const answered = f.status !== 'streaming' && f.status !== 'starting' && f.status !== 'not-started' && f.status !== undefined && (f.turns > 0 || f.sent)
  let current: FlagshipStep
  let sentence: string
  let action: string | undefined
  if (f.merged === true) {
    return { steps: order.map((step) => ({ step, label: FLAGSHIP_LABELS[step], state: 'done' as const })), sentence: 'Accepted — the task is merged into your main branch.' }
  }
  if (f.status === undefined || f.status === 'not-started' || f.status === 'starting') { current = 'start'; sentence = first }
  else if (!answered) { current = 'work'; sentence = first }
  else if (!f.hasChanges) { current = 'work'; sentence = 'Your agent answered, and its lane holds no changes yet — reply in the conversation to keep it going.' }
  else if (f.standing !== 'current') { current = 'review'; sentence = f.standing === 'stale' ? 'The changes moved since you reviewed — look again.' : 'Your agent finished a turn. Review what it changed — comment on any line and send the comments back.'; action = 'Review changes' }
  else if (!f.checksPassed) { current = 'checks'; sentence = f.github ? 'Reviewed. Now run the lane\'s checks — each run keeps its own output.' : 'Reviewed. Run the lane\'s checks — or accept it as it is; the review says it is not verified.'; action = 'Run checks' }
  else if (f.github && !f.pr) { current = 'pr'; sentence = 'Reviewed and checked. Open the pull request — its body carries the outcome and the checks.'; action = 'Open pull request' }
  else if (!f.github) { current = 'accept'; sentence = 'Reviewed and checked. Accept it to merge the branch into your main branch — you see the plan first.'; action = 'Accept…' }
  else { return { steps: order.map((step) => ({ step, label: FLAGSHIP_LABELS[step], state: 'done' as const })), sentence: 'The whole flow, done: reviewed, checked and a pull request open.' } }
  const at = order.indexOf(current)
  return {
    steps: order.map((step, i) => ({ step, label: FLAGSHIP_LABELS[step], state: i < at ? 'done' : i === at ? 'current' : 'todo' })),
    sentence,
    ...(action === undefined ? {} : { action })
  }
}
