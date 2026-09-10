/**
 * M248. A deck panel's file state, outside React — a copy of M244's
 * checklist-session.ts shape: every write reads again first and hands main
 * its compare-and-swap token, and there is no force-write door.
 *
 * TWO ORIGINS, TWO OUTCOMES. A PERSON's edit writes the file. An edit that
 * arrives through the agent door or a workflow action node STAGES into the
 * view's draft and leaves the disk byte-identical (`verify:deck
 * deck.session.2`); it reaches the file only through `review('keep', …)`,
 * which only a person's door may call with `keep`.
 */
import { applyKept, discardSlides, proposalText, rebuildDeck, slideDraft, splitDeck, type DeckView } from './deck'
import { draftState, hashText } from './draft-review'
import type { FileResult, FileWriteResult } from './file-panel'

export type DeckOrigin = 'person' | 'door'

export interface DeckIO {
  /** The file's name, for a conflict sentence that says WHICH file changed. */
  name: string
  read(): Promise<FileResult>
  write(content: string, mtimeMs: number): Promise<FileWriteResult>
  changed(view: DeckView): void
}
export interface DeckState { view: DeckView; disk?: FileResult; busy: boolean; error?: string }
type TextDisk = Extract<FileResult, { kind: 'text' }>

export function createDeckSession(initial: DeckView, io: DeckIO) {
  let state: DeckState = { view: initial, busy: false }
  const listeners = new Set<() => void>()
  const publish = (patch: Partial<DeckState>): void => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()) }
  // Conditional, never `draft: undefined` — a spread key survives IPC and reads as present.
  const adopt = (view: DeckView): void => { publish({ view }); io.changed(view) }
  const withDraft = (draft: DeckView['draft'] | null): DeckView => {
    const { draft: _old, ...rest } = state.view
    return draft ? { ...rest, draft } : rest
  }
  const usable = (disk: FileResult): disk is TextDisk => disk.kind === 'text' && disk.truncatedLines === 0
  const error = (reason: string): false => { publish({ error: reason }); return false }
  const guarded = async (work: () => Promise<boolean>): Promise<boolean> => {
    if (state.busy) return error('waiting for the current operation')
    publish({ busy: true, error: undefined })
    try { return await work() } catch (e) { return error(String(e)) } finally { publish({ busy: false }) }
  }
  const readUsable = async (): Promise<TextDisk | null> => {
    const disk = await io.read()
    publish({ disk })
    return usable(disk) ? disk : null
  }
  const write = async (disk: TextDisk, text: string): Promise<boolean> => {
    const result = await io.write(text, disk.mtimeMs)
    if (result.kind !== 'written') { publish({ disk: await io.read() }); return error(result.kind === 'stale' ? `${io.name} changed on disk — reload before saving` : result.detail) }
    publish({ disk: { ...disk, content: text, mtimeMs: result.mtimeMs, bytes: result.bytes } })
    return true
  }
  const unreadable = (): false => error(`${io.name} is missing, unreadable or too long to edit whole — refresh first`)
  /** A door's proposal against the file as it is now: a new draft, or none if it changes nothing. */
  const stage = (disk: TextDisk, proposal: string, by?: string): boolean => {
    adopt(withDraft(slideDraft(disk.content, proposal, by)))
    return true
  }
  /** What a door edits: the pending proposal when there is one on today's file, else the file. */
  const working = (disk: TextDisk, origin: DeckOrigin): string =>
    origin === 'door' && draftState(state.view.draft, hashText(disk.content)) === 'pending' ? proposalText(disk.content, state.view.draft) : disk.content

  return {
    snapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    observe: (disk: FileResult) => publish({ disk }),
    refresh: () => guarded(async () => { publish({ disk: await io.read() }); return true }),
    setSlide: (slide: number) => { if (slide !== (state.view.slide ?? 0)) adopt(slide === 0 ? (({ slide: _s, ...rest }) => rest)(state.view) : { ...state.view, slide }) },
    /** A person's whole-file save from the editor: refused if the file moved under what they were editing. */
    save: (text: string, base: string) => guarded(async () => {
      const disk = await readUsable()
      if (!disk) return unreadable()
      if (disk.content !== base) return error(`${io.name} changed on disk while you were editing — copy your text, reload, and save again`)
      return write(disk, text)
    }),
    /** Replace slide `n` (one-based). */
    editSlide: (n: number, text: string, origin: DeckOrigin, by?: string) => guarded(async () => {
      const disk = await readUsable()
      if (!disk) return unreadable()
      const from = working(disk, origin)
      const doc = splitDeck(from)
      if (!Number.isSafeInteger(n) || n < 1 || n > doc.slides.length) return error(`slide ${n} is not in this deck — it has ${doc.slides.length}`)
      const sources = doc.slides.map((s) => s.source)
      const old = sources[n - 1]
      // Keep the separator on its own line: a replacement without a trailing
      // newline would glue `---` onto the slide's last line.
      sources[n - 1] = old.endsWith('\n') && !text.endsWith('\n') ? text + doc.eol : text
      const next = rebuildDeck(from, sources)
      return origin === 'door' ? stage(disk, next, by) : write(disk, next)
    }),
    /** Replace the whole deck. */
    writeDeck: (text: string, origin: DeckOrigin, by?: string) => guarded(async () => {
      const disk = await readUsable()
      if (!disk) return unreadable()
      return origin === 'door' ? stage(disk, text, by) : write(disk, text)
    }),
    review: (action: 'keep' | 'discard', ids: readonly string[] | 'all') => guarded(async () => {
      const draft = state.view.draft
      if (!draft) return error('nothing is proposed for this deck')
      if (action === 'discard') {
        const result = discardSlides(draft, ids)
        if (result.kind === 'refused') return error(result.reason)
        adopt(withDraft(result.remaining))
        return true
      }
      const disk = await readUsable()
      if (!disk) return unreadable()
      const result = applyKept(disk.content, draft, ids)
      if (result.kind !== 'applied') return error(result.kind === 'conflict' ? `${io.name}: ${result.reason}` : result.reason)
      if (result.text !== disk.content && !await write(disk, result.text)) return false
      adopt(withDraft(result.remaining))
      return true
    })
  }
}
export type DeckSession = ReturnType<typeof createDeckSession>
