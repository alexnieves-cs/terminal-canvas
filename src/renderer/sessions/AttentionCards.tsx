import type { JSX } from 'react'
import type { AttentionItem } from '@shared/redesign-contracts'
import { shellControl } from '@renderer/shell/shell-control'
import { cardActions, cardTone, type CardAction } from './sessions-model'

/**
 * M445. The queue, in the order it was given, with the queue's own sentence.
 * Buttons only. A shell prompt has Open and Snooze, and no field an Enter
 * could submit — the reply box's rule, on the card that is most likely to
 * be answered by a stray key.
 */
export function AttentionCards({ items, names, onAction }: {
  items: readonly AttentionItem[]
  names: ReadonlyMap<string, string>
  onAction: (item: AttentionItem, action: CardAction['id']) => void
}): JSX.Element | null {
  if (items.length === 0) return null
  return (
    <div className="sessions-cards" data-sessions-cards>
      {items.map((item) => {
        const name = names.get(item.panelId) ?? ''
        const actions = cardActions(item.kind)
        return (
          <article key={item.id} className="sessions-card" data-tone={cardTone(item.kind)} data-attention-kind={item.kind} data-attention-id={item.id}>
            <p className="sessions-card__sentence">{item.sentence}</p>
            {name !== '' && <p className="sessions-card__name">{name}</p>}
            <div className="sessions-card__verbs">
              {actions.actions.map((action) => (
                <button key={action.id} type="button" data-attention-action={action.id} {...shellControl(() => onAction(item, action.id))}>{action.label}</button>
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
}
