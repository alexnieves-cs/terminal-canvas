import type { CreationResult } from '@shared/verb-table'
import type { DeckOrigin } from '@shared/deck-session'

/** M248. What the executor reaches a mounted deck through — checklist-controllers.ts's shape. */
export interface DeckController {
  edit(slide: number, text: string, origin: DeckOrigin): Promise<CreationResult>
  write(text: string, origin: DeckOrigin): Promise<CreationResult>
  review(action: string, ids: readonly string[] | 'all', origin: DeckOrigin): Promise<CreationResult>
  present(origin: DeckOrigin): Promise<CreationResult>
  exportPdf(): Promise<CreationResult>
}
const controllers = new Map<string, DeckController>()
export function deckController(id: string): DeckController | undefined { return controllers.get(id) }
export function registerDeck(id: string, controller: DeckController): () => void {
  controllers.set(id, controller)
  return () => { if (controllers.get(id) === controller) controllers.delete(id) }
}
// Specific surface truth, as checklistFocused: xterm also owns a textarea, so
// never guard "any input" — only the deck's editor, body and presenter.
export function deckFocused(): boolean {
  const el = document.activeElement
  return el !== null && el.closest('[data-deck-body], [data-deck-presenter]') !== null
}
