import type { HandoffTrigger } from '@shared/handoff'

/**
 * M78. The closed vocabulary of the five triggers — the edge's label on the
 * line, the pane's select and the strip share it verbatim (one phrasing per
 * fact, the critic's rule). Its own module so the pane does not import Canvas.
 */
export const TRIGGER_WORDS: Record<HandoffTrigger, string> = {
  exit: 'on exit',
  idle: 'after a turn',
  'exit-ok': 'on exit 0',
  'exit-fail': 'on a failing exit',
  always: 'always'
}
