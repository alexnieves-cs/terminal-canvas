import { CREATABLE_OBJECTS, creationReason } from '@shared/verb-table'
import type { Command } from '../palette-model'
import type { PaletteActions } from '../commands'
import { hiddenAtRestIf, withReason } from './with-reason'

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
    ...(REST_NOTE[entry.id] === undefined ? {} : { subtitle: REST_NOTE[entry.id] }),
    // M409 (C5). Two decisions, row by row. A folder-bound object with no
    // folder selected rests in search (its subject is missing, not its
    // state). And two rows were near-twins of a row a person already knows:
    // `New Note` beside `New note…`, `New Terminal` beside `Login shell` (⌘N)
    // and `New panel…` — they stay in search, each with a subtitle that says
    // how it differs, and leave the resting list to the row people use.
    ...hiddenAtRestIf(entry.id === 'note' || entry.id === 'terminal' || (entry.requires === 'folder' && ctx.noteRoot === null)),
    group: 'spawn', run: () => { void ctx.actions.createObject(entry.id) }
  }, creationReason(entry, ctx)))
}

/** M409. What tells a creation row from its near-twin, when search shows both. */
const REST_NOTE: Readonly<Record<string, string>> = {
  note: 'at once, named by the time — New note… asks for the filename',
  terminal: 'a shell in the selected panel\'s folder, else home'
}