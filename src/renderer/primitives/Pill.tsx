import type { JSX, ReactNode } from 'react'
import type { Tone } from '@renderer/panels/panel-state'

export interface PillProps {
  /** The tone the pill speaks in; absent is the quiet, kind-neutral pill. */
  tone?: Tone
  /** Paint the dot the `.badge` rule draws before the word. Default true. */
  dot?: boolean
  className?: string
  title?: string
  children: ReactNode
}

/**
 * M279. A PILL: one state word, or one count, in a capsule. The `.badge`
 * rule (styles.css) is the look, and `data-tone` binds the hue through the
 * tone block — so a pill can never spell a colour of its own. Where the word
 * is a STATE it must come from `panel-state.ts` (`verify:rail state.2`
 * forbids the literal); a pill is the container, never the vocabulary.
 */
export function Pill({ tone, dot = true, className, title, children }: PillProps): JSX.Element {
  return (
    <span className={`badge pill${dot ? '' : ' pill--plain'}${className ? ` ${className}` : ''}`} data-tone={tone} title={title}>
      {children}
    </span>
  )
}
