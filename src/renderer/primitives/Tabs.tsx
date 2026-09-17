import type { JSX, ReactNode } from 'react'
import { shellControl } from '@renderer/shell/shell-control'

export interface TabOption<T extends string> {
  id: T
  label: ReactNode
  /** A small count beside the label — a fact, never a decoration; omitted when zero. */
  count?: number
  className?: string
}

export interface TabsProps<T extends string> {
  value: T
  tabs: ReadonlyArray<TabOption<T>>
  onSelect: (id: T) => void
  label: string
  className?: string
  /** A data attribute each tab carries (`data-context-tab`), for the suites that click one by name. */
  dataAttr?: string
}

/**
 * M279. A TAB STRIP: `role="tablist"` with `role="tab"` + `aria-selected` on
 * each tab, the pattern the inspector hand-rolled since M46 and now shares.
 * The tab PANELS stay the caller's — rendered and hidden, never unmounted,
 * so a hidden tab's figures are as current as the visible one's (Inspector's
 * own note on why). Look: `.tabs` / `.tab` in styles.css, which the
 * inspector's `.context__tabs` / `.context__tab` alias.
 */
export function Tabs<T extends string>({ value, tabs, onSelect, label, className, dataAttr }: TabsProps<T>): JSX.Element {
  return (
    <div className={`tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const on = t.id === value
        const extra: Record<string, string> = dataAttr ? { [dataAttr]: t.id } : {}
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`tab${on ? ' tab--on' : ''}${t.className ? ` ${t.className}${on ? ` ${t.className}--on` : ''}` : ''}`}
            aria-selected={on}
            {...extra}
            {...shellControl(() => onSelect(t.id))}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="tab__count">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
