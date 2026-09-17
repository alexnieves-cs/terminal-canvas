import type { JSX, ReactNode } from 'react'
import { shellControl } from '@renderer/shell/shell-control'

export interface SegmentedOption<T extends string> {
  id: T
  label: ReactNode
  title?: string
  /** Extra class on the option's button — callers keep their own hooks (`.shell__center-btn`). */
  className?: string
}

export interface SegmentedControlProps<T extends string> {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (id: T) => void
  label: string
  className?: string
}

/**
 * M279. A SEGMENTED CONTROL: two to four mutually exclusive places, one of
 * them pressed. `role="group"` with `aria-pressed` on each option rather than
 * a radio group: the options are VERBS (show the canvas, show orchestration),
 * and a pressed button is what a screen reader expects a place-switch to be.
 *
 * Every option mounts `shellControl()` so focus never leaves the terminal —
 * the same promise every top-bar control keeps. The look is `.seg` / `.seg__btn`
 * (styles.css); a caller composes its own class beside those for the checks
 * that read it.
 */
export function SegmentedControl<T extends string>({ value, options, onChange, label, className }: SegmentedControlProps<T>): JSX.Element {
  return (
    <div className={`seg${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            className={`seg__btn${on ? ' seg__btn--on' : ''}${o.className ? ` ${o.className}${on ? ` ${o.className}--on` : ''}` : ''}`}
            aria-pressed={on}
            title={o.title}
            {...shellControl(() => onChange(o.id))}
          >{o.label}</button>
        )
      })}
    </div>
  )
}
