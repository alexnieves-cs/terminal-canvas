import type { JSX } from 'react'
import type { PaletteTheme } from '@shared/state-palette'
import type { StateTone } from '@shared/redesign-contracts'
import { sparkline } from './sessions-model'

/**
 * M445. An inline SVG, not recharts. The recharts door stays on the two
 * shell charts. The stroke is the palette hex for the tone, because a
 * presentation attribute does not resolve a stylesheet variable.
 */
export function Sparkline({ samples, tone, theme }: { samples: readonly number[]; tone: StateTone; theme: PaletteTheme }): JSX.Element | null {
  const path = sparkline(samples, tone, theme)
  if (path.d === '') return null
  return (
    <svg className="sessions-spark" data-tone={tone} viewBox="0 0 64 16" width="64" height="16" aria-hidden="true">
      <path d={path.d} fill="none" stroke={path.stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
