import type { JSX } from 'react'
import { CREATABLE_OBJECTS } from '@shared/verb-table'
import { creationCommands, type PaletteActions } from '@renderer/palette/commands'
import { KindTerminal, KindChat, KindNote, KindImage, KindWorkflow, KindBrowser, KindDeck, Check, Plus } from '@renderer/icons'

const icons: Record<string, () => JSX.Element> = {
  terminal: () => <KindTerminal />, agent: () => <KindChat />, note: () => <KindNote />,
  image: () => <KindImage />, workflow: () => <KindWorkflow />, browser: () => <KindBrowser />, checklist: () => <Check />, deck: () => <KindDeck />
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
