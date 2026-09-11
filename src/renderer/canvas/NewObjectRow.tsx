import type { JSX } from 'react'
import { CREATABLE_OBJECTS } from '@shared/verb-table'
import { creationCommands, type PaletteActions } from '@renderer/palette/commands'
import { KindTerminal, KindChat, KindNote, KindImage, KindWorkflow, KindBrowser, KindDeck, Check, Plus } from '@renderer/icons'

// M245. A grid, drawn here rather than added to the shared icon set until a second surface needs it.
const SheetGlyph = (): JSX.Element => <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
  <rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M2 6.5h12M2 10h12M6.5 2.5v11" />
</svg>

const icons: Record<string, () => JSX.Element> = {
  terminal: () => <KindTerminal />, agent: () => <KindChat />, note: () => <KindNote />,
  image: () => <KindImage />, workflow: () => <KindWorkflow />, browser: () => <KindBrowser />, checklist: () => <Check />,
  sheet: () => <SheetGlyph />, deck: () => <KindDeck />
}

export function NewObjectRow(props: { actions: Pick<PaletteActions, 'createObject'>; merged?: boolean; noteRoot: string | null; agentReason?: string }): JSX.Element {
  const rows = creationCommands(props)
  return <nav className="new-object-row" aria-label="New object" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    {CREATABLE_OBJECTS.map((entry, index) => {
      const row = rows[index], Icon = icons[entry.icon] ?? Plus
      return <button type="button" key={entry.id} className="new-object-row__pill" data-create-object={entry.id}
        disabled={row.disabledReason !== undefined} title={row.disabledReason ?? `New ${entry.label.toLowerCase()}`} onClick={() => row.run()}>
        <Icon /><span>{entry.label}</span>
      </button>
    })}
  </nav>
}
