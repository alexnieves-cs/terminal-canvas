import { CREATABLE_OBJECTS, creationReason } from '@shared/verb-table'
import type { Command } from '../palette-model'
import type { PaletteActions } from '../commands'
import { withReason } from './with-reason'

/**
 * Build the whole list. Section membership — not position — is what orders it:
 * filterCommands sorts by SECTIONS index first, so unlike M5b this function no
 * longer carries the grouping in its construction order. It is still written
 * in display order, because a reader who has to jump around the file to work
 * out what the palette looks like is a reader who will put a row in the wrong
 * section.
 */
export function creationCommands(ctx: { actions: Pick<PaletteActions, 'createObject'>; merged?: boolean; noteRoot: string | null; agentReason?: string }): Command[] {
  return CREATABLE_OBJECTS.map((entry) => withReason({
    id: entry.palette, title: `New ${entry.label}`, searchText: `create add new object ${entry.label}`,
    group: 'spawn', run: () => { void ctx.actions.createObject(entry.id) }
  }, creationReason(entry, ctx)))
}