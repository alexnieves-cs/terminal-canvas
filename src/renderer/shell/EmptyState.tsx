import type { JSX, ReactNode } from 'react'
import { emptyState } from '@shared/empty-states'
import { shellControl } from './shell-control'

/**
 * M177. ONE SHAPE for every empty state: the kind's glyph, the sentence from
 * `EMPTY_STATES` (a check pins the words), one verb where the surface has a
 * door. Centred, the UI face. `attrs` carries the data attribute the surface's
 * checks read; `fill` substitutes a `{name}` in the sentence (the chat's
 * engine). The verb is a `shellControl` — it acts on click and never starts a
 * drag beneath a pane.
 */
export function EmptyState({ id, glyph, onVerb, fill, attrs, children }: {
  id: string
  glyph?: ReactNode
  onVerb?: () => void
  fill?: Record<string, string>
  attrs?: Record<string, string | undefined>
  children?: ReactNode
}): JSX.Element {
  const state = emptyState(id)
  const sentence = fill === undefined ? state.sentence : state.sentence.replace(/\{(\w+)\}/g, (m, k: string) => fill[k] ?? m)
  return (
    <div className="empty-state" data-empty-state={id} {...(attrs ?? {})}>
      {glyph !== undefined && <span className="empty-state__glyph" aria-hidden="true">{glyph}</span>}
      <p className="empty-state__sentence">{sentence}</p>
      {state.verb !== undefined && onVerb !== undefined && (
        <button type="button" className="empty-state__verb pf__verb pf__verb--word" data-empty-state-verb title={state.verb} {...shellControl(onVerb)}>{state.verb}</button>
      )}
      {children}
    </div>
  )
}
