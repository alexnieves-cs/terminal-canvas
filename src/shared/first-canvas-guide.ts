/**
 * M644 (lane W). THE GUIDED FIRST CANVAS, as data.
 *
 * The first-run card ends by opening the new-task sheet, and from there a new
 * person was on their own: the three moves that make this product different
 * from a terminal multiplexer (several agents side by side, the jump to
 * whoever needs you, the review of what each one changed) were all left to be
 * found. This is a three-step card that names them, in order, and gets out of
 * the way.
 *
 * Rules, each pinned by verify:onboarding guide.*:
 *
 * - **It teaches by watching, never by blocking.** A step is done when the
 *   person DOES the move (a panel exists, the jump chord was pressed, Review
 *   was opened). Nothing is modal, nothing is dimmed, and the canvas under it
 *   takes every click.
 * - **Nobody is ever stuck on a step.** Each one also has Next, because the
 *   world does not always cooperate: no agent may be asking for anything when
 *   step 2 comes up.
 * - **Skippable from every step, and it stays gone.** Finishing or skipping
 *   ends it for good (`guide-store.ts` remembers).
 * - **It starts nothing.** Like the first-run card, it names doors.
 *
 * Imports nothing, so the plain-node suite reads it.
 */

export type GuideStepId = 'spawn' | 'attention' | 'review'

export interface GuideStep {
  id: GuideStepId
  title: string
  /** `{chord}` is replaced with the registry's chord for `shortcut`, so a re-recorded key is the key shown. */
  body: string
  /** The shortcut registry id whose chord the step teaches; absent for a step that is a click. */
  shortcut?: string
  /** What the card says once the move was seen. */
  done: string
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: 'spawn',
    title: 'Start an agent',
    body: 'Describe a task, or press {chord}. Each agent gets its own panel on the canvas, and you can run several side by side.',
    shortcut: 'new-task',
    done: 'There it is. Start as many as the work needs.'
  },
  {
    id: 'attention',
    title: 'Go to whoever needs you',
    body: 'When an agent stops to ask, its frame turns amber and the bell counts it. Press {chord} to fly to the next one that is waiting.',
    shortcut: 'jump',
    done: 'That is the jump. Press it again for the next agent that is waiting.'
  },
  {
    id: 'review',
    title: 'Review what came back',
    body: 'Open Review in the top bar to read what each agent changed, then accept it or send it back.',
    done: 'That is the loop: start, answer, review.'
  }
]

/** What the card has seen the person do. Each is sticky once true. */
export interface GuideSignals {
  /** At least one panel is on the canvas. */
  hasPanel: boolean
  /** The jump chord was pressed since the guide began. */
  jumped: boolean
  /** The Review page was opened since the guide began. */
  reviewed: boolean
}

export function guideStepDone(id: GuideStepId, signals: GuideSignals): boolean {
  return id === 'spawn' ? signals.hasPanel : id === 'attention' ? signals.jumped : signals.reviewed
}

export interface GuideView {
  step: GuideStep
  /** 1-based, for "1 of 3". */
  at: number
  of: number
  done: boolean
  last: boolean
  /** The button that moves on: Next while there is a next step, Done on the last. */
  advance: 'Next' | 'Done'
}

/**
 * The card at `index`. An index past the end is null: the guide is over.
 * `done` is the step's own signal, so a step the person already did before
 * reaching it (a canvas that already has panels) opens already ticked and
 * Next is all that is left.
 */
export function guideView(index: number, signals: GuideSignals): GuideView | null {
  const step = GUIDE_STEPS[index]
  if (step === undefined || index < 0) return null
  const last = index === GUIDE_STEPS.length - 1
  return { step, at: index + 1, of: GUIDE_STEPS.length, done: guideStepDone(step.id, signals), last, advance: last ? 'Done' : 'Next' }
}

/** The step's sentence with its chord filled in. A step with no chord, or a chord nobody could find, loses the placeholder cleanly. */
export function guideBody(step: GuideStep, chordOf: (shortcutId: string) => string | undefined): string {
  const chord = step.shortcut === undefined ? undefined : chordOf(step.shortcut)
  return chord === undefined || chord === '' ? step.body.replace(/,? or press \{chord\}/, '').replace(/Press \{chord\} to fly/, 'The bell flies you') : step.body.replace('{chord}', chord)
}
