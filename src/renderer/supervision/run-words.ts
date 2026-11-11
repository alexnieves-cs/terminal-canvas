import { TONE_NEEDS_YOU, TONE_WORKING, type Tone } from '@renderer/panels/panel-state'
import type { RunCallStatus, RunStepStatus } from '@shared/agent-run'

/**
 * M671. The Run timeline's words and tones. State COLOUR comes only from a
 * Tone drawn through `[data-tone]` (the redesign's rule, `verify:rail`
 * `state.2`, `rd-tone.*`), so a step's status maps onto the closed tone set
 * here, once, and the components never name a hue or a state word.
 */

export const STEP_TONE: Record<RunStepStatus, Tone> = { running: TONE_WORKING, waiting: TONE_NEEDS_YOU, done: 'done', failed: 'exited' }
export const STEP_WORD: Record<RunStepStatus, string> = { running: 'Running', waiting: 'Waiting for you', done: 'Done', failed: 'Failed' }

export const CALL_TONE: Record<RunCallStatus, Tone> = { running: TONE_WORKING, success: 'done', error: 'exited', 'no-result': 'idle' }
export const CALL_WORD: Record<RunCallStatus, string> = { running: 'Running', success: 'Succeeded', error: 'Failed', 'no-result': 'No result' }

/** A span in the fewest words: `0.4s`, `12s`, `3m 05s`. Absent ends read as nothing. */
export function spanWords(start: number | undefined, end: number | undefined): string {
  if (start === undefined || end === undefined || end < start) return ''
  const ms = end - start
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/** A tool's input or output as text: a string as it is, anything else as JSON. */
export function asText(value: unknown): string {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) ?? '' } catch { return String(value) }
}
