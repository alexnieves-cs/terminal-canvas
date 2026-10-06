import type { JSX } from 'react'
import type { Tone } from '@renderer/panels/panel-state'

export interface StatusDotProps {
  tone: Tone
  /** Mirrors the rail's `[data-agent-state]` hook so the checks that read it keep finding it. */
  agentState?: string
  className?: string
  title?: string
}

/**
 * M279. THE ONE STATUS DOT, as a component. `.status-dot[data-tone]` is the
 * only rule set that colours it (styles.css: "ONE status dot"), so every
 * surface that adopts this reads the same hue for the same fact. Working and
 * starting breathe there; the colour is a `--state-*` token, never a hex in
 * this file. It says nothing a screen reader hears — the word beside it is
 * the announcement — so it is `aria-hidden`.
 */
export function StatusDot({ tone, agentState, className, title }: StatusDotProps): JSX.Element {
  return <span className={`status-dot${className ? ` ${className}` : ''}`} data-tone={tone} data-agent-state={agentState} title={title} aria-hidden="true" />
}
