import { parseCsv, serializeCsv, type CsvDoc } from './csv'
import { setCells as applyEdits, type CellEdit } from './sheet-model'
import { readXlsx, writeXlsx, type XlsxBook } from './sheet-xlsx'
import { base64ToBytes, bytesToBase64, type SheetFormat, type SheetView } from './sheet'
import type { Grid } from './sheet-formula'
import type { FileResult, FileWriteResult } from './file-panel'
import { contentHash, discard, keep, rebase, stage, type DraftOutcome } from './draft-review'
import { applyDraftItems, cellValue, type SheetDraft } from './sheet-draft'
import { refName } from './sheet-formula'

export interface SheetIO {
  /** The file's name, for sentences that name what changed. */
  name: string
  read(): Promise<FileResult>
  write(base64: string, baseMtimeMs: number): Promise<FileWriteResult>
  changed(view: SheetView): void
}
export interface SheetState {
  view: SheetView
  grid?: Grid
  disk?: FileResult
  /** The disk moved away from what this sheet last read or wrote. Editing stops until Reload. */
  stale: boolean
  losses: string[]
  busy: boolean
  error?: string
  /** M246. A successful operation's sentence worth reading (what a rebase dropped). Not an error. */
  note?: string
  undo: number
  redo: number
}

/** What the session last read or wrote, exactly. Undo writes these BYTES back, never a re-serialization. */
interface Loaded { bytes: string; grid: string[][]; csv?: CsvDoc; book?: XlsxBook }

/**
 * M245. A sheet's file life, modelled on checklist-session.ts.
 *
 * Every write — an edit, an undo, a redo — reads the disk again first and
 * refuses unless it still holds the bytes this sheet last saw, then writes
 * through main's compare-and-swap. There is no force door. An external change
 * is reported BY NAME and editing stops; Reload is the only way forward, and
 * it adopts the disk rather than overwriting it.
 */
export function createSheetSession(initial: SheetView, io: SheetIO, format: SheetFormat) {
  let state: SheetState = { view: initial, stale: false, losses: [], busy: false, undo: 0, redo: 0 }
  let base: Loaded | undefined
  // M246 (critic, finding 2). Each history step carries the DRAFT as it stood,
  // so undoing a write that dropped a drafted cell brings the proposal back,
  // and undoing a write the draft was rebased onto does not read as a conflict.
  interface Step { loaded: Loaded; draft: SheetDraft | undefined }
  const past: Step[] = []
  const future: Step[] = []
  // Ids the person discarded from the current draft: a history step must not resurrect them.
  const discardedIds = new Set<string>()
  const listeners = new Set<() => void>()
  const delimiter = format === 'tsv' ? '\t' : ','
  const publish = (patch: Partial<SheetState>): void => {
    state = { ...state, ...patch, undo: past.length, redo: future.length }
    listeners.forEach((fn) => fn())
  }
  const error = (reason: string): false => { publish({ error: reason }); return false }
  const changedOnDisk = (): string => `${io.name} changed on disk — Reload to see it before editing`
  const describe = (disk: FileResult): string =>
    disk.kind === 'missing' ? `${io.name} is missing`
      : disk.kind === 'too-large' ? `${io.name} is larger than the ${Math.round(disk.cap / 1024 / 1024)} MB limit`
        : disk.kind === 'unreadable' ? disk.detail : `${io.name} could not be read as bytes`

  const decode = (disk: FileResult): Loaded | string => {
    if (disk.kind !== 'bytes') return describe(disk)
    const bytes = base64ToBytes(disk.base64)
    if (format === 'xlsx') {
      const book = readXlsx(bytes)
      return 'error' in book ? `${io.name}: ${book.error}` : { bytes: disk.base64, grid: book.grid, book }
    }
    // ignoreBOM keeps the BOM in the string so the CSV parser can remember it and write it back.
    const csv = parseCsv(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes), delimiter)
    return { bytes: disk.base64, grid: csv.rows, csv }
  }
  const adopt = (loaded: Loaded): void => {
    base = loaded
    publish({ grid: loaded.grid, stale: false, losses: loaded.book?.losses ?? [], error: undefined })
  }
  const encode = (from: Loaded, grid: string[][], structural: boolean): Loaded => {
    if (from.book) {
      const out = writeXlsx(from.book, grid)
      // Re-read what was just produced, so the NEXT write keys its address-carried
      // metadata from this file rather than from the one first opened (the critic's finding 1).
      const book = readXlsx(out)
      if ('error' in book) throw new Error(`${io.name}: the workbook written back could not be read (${book.error}) — nothing was saved`)
      return { bytes: bytesToBase64(out), grid: book.grid, book }
    }
    // A structural edit moves cells, so "which cells were quoted" no longer names the right ones.
    const csv: CsvDoc = { ...from.csv!, rows: grid, quoted: structural ? new Set() : from.csv!.quoted }
    return { bytes: bytesToBase64(new TextEncoder().encode(serializeCsv(csv, delimiter))), grid, csv }
  }
  const lossesAccepted = (): boolean => state.losses.every((l) => state.view.lossAccepted?.includes(l) === true)

  // QUEUED, never dropped. A second Cmd+Z pressed while the first is still
  // re-reading the disk used to return false with no error — the person saw
  // nothing and one undo silently did not happen (the M245 critic's finding 3).
  // Each operation now runs after the one before it, against the state that one left.
  let queue: Promise<unknown> = Promise.resolve()
  let inFlight = 0
  const guarded = (work: () => Promise<boolean>): Promise<boolean> => {
    inFlight += 1
    publish({ busy: true })
    const run = queue.then(async () => {
      publish({ error: undefined, note: undefined })
      try { return await work() } catch (e) { return error(String(e)) } finally {
        inFlight -= 1
        if (inFlight === 0) publish({ busy: false })
      }
    })
    queue = run.catch(() => undefined)
    return run
  }
  const structuralRefusal = (): string =>
    `${io.name}: rows and columns cannot be inserted or deleted in an xlsx here — its merged cells, comments and number formats are keyed by address and would land on the wrong cells`
  const save = async (target: Loaded): Promise<boolean> => {
    const disk = await io.read()
    publish({ disk })
    if (disk.kind !== 'bytes') return error(describe(disk))
    if (!base) return error('Read the file before editing.')
    if (disk.base64 !== base.bytes) { publish({ stale: true }); return error(changedOnDisk()) }
    if (!lossesAccepted()) return error(`Saving ${io.name} drops ${state.losses.join(', ')} — confirm in the header first`)
    const result = await io.write(target.bytes, disk.mtimeMs)
    if (result.kind !== 'written') {
      if (result.kind === 'stale') { publish({ stale: true }); return error(changedOnDisk()) }
      return error(result.detail)
    }
    base = target
    // Adopt the returned timestamp even if a byte-identical save emits no watch event.
    publish({ grid: target.grid, ...(target.book ? { losses: target.book.losses } : {}), disk: { kind: 'bytes', base64: target.bytes, bytes: result.bytes, mtimeMs: result.mtimeMs } })
    return true
  }
  const update = (grid: string[][], structural = false): Promise<boolean> => guarded(async () => {
    if (!base) return error('Read the file before editing.')
    if (state.stale) return error(changedOnDisk())
    if (structural && base.book) return error(structuralRefusal())
    const previous = base
    const draftBefore = state.view.draft
    if (!await save(encode(previous, grid, structural))) return false
    past.push({ loaded: previous, draft: draftBefore })
    if (past.length > 100) past.shift()
    future.length = 0
    // M246. A person's own write moves the file under a pending draft. The items
    // it did not touch still describe the file, so the draft follows the write
    // (rather than reading as a conflict the person caused); an item whose cell
    // they overwrote is dropped and named.
    const b = base
    if (state.view.draft && b) {
      const r = rebase(state.view.draft, contentHash(b.bytes), (id) => cellValue(b.grid, id))
      setDraft(r.draft, r.dropped.length > 0 ? tally(0, r.dropped.length) : undefined)
      if (r.dropped.length > 0) publish({ note: `your edit replaced drafted ${r.dropped.map((i) => i.id).join(', ')} — dropped from the draft` })
    }
    publish({})
    return true
  })
  const setView = (view: SheetView): void => { publish({ view }); io.changed(view) }

  // ── M246: the draft ────────────────────────────────────────────────────
  const tally = (kept: number, discarded: number): DraftOutcome => {
    const o = state.view.draftOutcome
    return { at: Date.now(), kept: (o?.kept ?? 0) + kept, discarded: (o?.discarded ?? 0) + discarded }
  }
  /** `outcome`: undefined leaves it as it is, null removes it. Absent keys stay ABSENT — never `draft: undefined`. */
  const setDraft = (draft: SheetDraft | undefined, outcome: DraftOutcome | null | undefined): void => {
    const { draft: _d, draftOutcome: _o, ...rest } = state.view
    const nextOutcome = outcome === undefined ? state.view.draftOutcome : outcome ?? undefined
    setView({ ...rest, ...(draft ? { draft } : {}), ...(nextOutcome ? { draftOutcome: nextOutcome } : {}) })
  }
  const decodeGrid = (disk: FileResult): Grid | undefined => { const l = decode(disk); return typeof l === 'string' ? undefined : l.grid }
  /** BY NAME: the file, whose draft, and exactly which drafted cells no longer read what the draft replaced. */
  const conflictText = (draft: SheetDraft, grid: Grid | undefined): string => {
    const moved = grid === undefined ? [] : draft.items.filter((i) => cellValue(grid, i.id) !== i.old).map((i) => i.id)
    const whose = draft.by === undefined ? 'the' : `${draft.by}'s`
    return `${io.name} changed on disk after ${whose} draft — ` +
      (moved.length > 0 ? `${moved.join(', ')} no longer read what the draft replaced` : 'the drafted cells still read what it replaced') +
      '; Rebase or Discard before keeping'
  }
  /**
   * After undo/redo moved the file: the draft is the step's recorded draft
   * merged with anything proposed since (current wins), minus what the person
   * discarded, rebased onto the bytes now on disk — so it neither reads as a
   * conflict nor loses an item the undone write had dropped.
   */
  const restoreDraft = (saved: SheetDraft | undefined, loaded: Loaded): void => {
    const current = state.view.draft
    if (saved === undefined && current === undefined) return
    const byId = new Map<string, SheetDraft['items'][number]>()
    for (const i of saved?.items ?? []) byId.set(i.id, i)
    for (const i of current?.items ?? []) byId.set(i.id, i)
    for (const id of discardedIds) byId.delete(id)
    const shell = current ?? saved!
    const merged: SheetDraft | undefined = byId.size === 0 ? undefined : { ...shell, items: [...byId.values()] }
    if (merged === undefined) { setDraft(undefined, undefined); return }
    const r = rebase(merged, contentHash(loaded.bytes), (id) => cellValue(loaded.grid, id))
    setDraft(r.draft, undefined)
  }

  return {
    snapshot: (): SheetState => state,
    subscribe: (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    /** The watcher's view of the disk. A change nobody here wrote marks the sheet stale, by name. */
    observe: (disk: FileResult): void => {
      if (disk.kind === 'bytes' && base && disk.base64 !== base.bytes) { publish({ disk, stale: true, error: changedOnDisk() }); return }
      if (disk.kind === 'bytes' && !base) { const loaded = decode(disk); if (typeof loaded === 'string') publish({ disk, error: loaded }); else { publish({ disk }); adopt(loaded) } return }
      publish({ disk })
    },
    refresh: (): Promise<boolean> => guarded(async () => {
      const disk = await io.read()
      publish({ disk })
      if (!base) { const loaded = decode(disk); if (typeof loaded === 'string') return error(loaded); adopt(loaded); return true }
      if (disk.kind === 'bytes' && disk.base64 !== base.bytes) { publish({ stale: true }); return error(changedOnDisk()) }
      return disk.kind === 'bytes' || error(describe(disk))
    }),
    /** Adopt whatever the disk holds now. History is dropped: it described a file that no longer exists. */
    reload: (): Promise<boolean> => guarded(async () => {
      const disk = await io.read()
      publish({ disk })
      const loaded = decode(disk)
      if (typeof loaded === 'string') return error(loaded)
      past.length = 0
      future.length = 0
      adopt(loaded)
      return true
    }),
    update,
    setCells: (edits: readonly CellEdit[]): Promise<boolean> => update(applyEdits(state.grid ?? [], edits)),
    undo: (): Promise<boolean> => guarded(async () => {
      const target = past.at(-1)
      if (!target || !base) return false
      const previous: Step = { loaded: base, draft: state.view.draft }
      if (!await save(target.loaded)) return false
      past.pop(); future.push(previous); restoreDraft(target.draft, target.loaded); publish({}); return true
    }),
    redo: (): Promise<boolean> => guarded(async () => {
      const target = future.at(-1)
      if (!target || !base) return false
      const previous: Step = { loaded: base, draft: state.view.draft }
      if (!await save(target.loaded)) return false
      future.pop(); past.push(previous); restoreDraft(target.draft, target.loaded); publish({}); return true
    }),
    /**
     * M246. An agent's edit becomes a PROPOSAL: staged in the view, the file untouched.
     * `old` is what the file holds now, so the person compares against the real thing.
     */
    propose: (edits: readonly CellEdit[], by: string): Promise<boolean> => guarded(async () => {
      if (!base) return error('Read the file before proposing.')
      const hash = contentHash(base.bytes)
      let draft = state.view.draft
      if (draft && draft.baseHash !== hash) return error(conflictText(draft, base.grid))
      const fresh = draft === undefined
      if (fresh) discardedIds.clear()
      // Re-proposing an id is the agent asking again: it is no longer a discarded one.
      for (const e of edits) discardedIds.delete(refName(e.r, e.c))
      for (const e of edits) draft = stage(draft, { id: refName(e.r, e.c), old: base.grid[e.r]?.[e.c] ?? '', new: e.value }, hash, by, Date.now())
      // A fresh draft starts a fresh outcome; the last one's "applied" is history now.
      setDraft(draft, fresh ? null : undefined)
      return true
    }),
    /** Apply ONLY the chosen items, in one compare-and-swap write. Refused, by name, if the file moved under the draft. */
    keepDraft: (ids: readonly string[] | 'all'): Promise<boolean> => guarded(async () => {
      const draft = state.view.draft
      if (!draft) return error(`${io.name} has no draft to keep`)
      if (!base) return error('Read the file before keeping.')
      const disk = await io.read()
      publish({ disk })
      if (disk.kind !== 'bytes') return error(describe(disk))
      if (contentHash(disk.base64) !== draft.baseHash) return error(conflictText(draft, decodeGrid(disk)))
      const { apply, remaining } = keep(draft, ids)
      if (apply.length === 0) return error('none of those cells has a pending change')
      const previous = base
      const target = encode(previous, applyDraftItems(previous.grid, apply), false)
      if (!await save(target)) return false
      past.push({ loaded: previous, draft })
      if (past.length > 100) past.shift()
      future.length = 0
      // The rest still describe the file: their cells were not touched by this write.
      setDraft(remaining === undefined ? undefined : { ...remaining, baseHash: contentHash(target.bytes) }, tally(apply.length, 0))
      return true
    }),
    /** Drop the chosen items. Nothing is written, so the file stays byte-identical. */
    discardDraft: (ids: readonly string[] | 'all'): Promise<boolean> => guarded(async () => {
      const draft = state.view.draft
      if (!draft) return error(`${io.name} has no draft to discard`)
      const { dropped, remaining } = discard(draft, ids)
      if (dropped.length === 0) return error('none of those cells has a pending change')
      for (const i of dropped) discardedIds.add(i.id)
      setDraft(remaining, tally(0, dropped.length))
      return true
    }),
    /** After a change underneath: adopt the disk, keep the items it did not touch, and name the ones it did. */
    rebaseDraft: (): Promise<boolean> => guarded(async () => {
      const draft = state.view.draft
      if (!draft) return error(`${io.name} has no draft to rebase`)
      const disk = await io.read()
      publish({ disk })
      const loaded = decode(disk)
      if (typeof loaded === 'string') return error(loaded)
      if (!base || loaded.bytes !== base.bytes) { past.length = 0; future.length = 0; adopt(loaded) }
      const r = rebase(draft, contentHash(loaded.bytes), (id) => cellValue(loaded.grid, id))
      setDraft(r.draft, r.dropped.length > 0 ? tally(0, r.dropped.length) : undefined)
      publish({ note: r.dropped.length > 0 ? `dropped ${r.dropped.map((i) => i.id).join(', ')} from the draft — ${io.name} changed them` : `the draft matches ${io.name} again` })
      return true
    }),
    setWidths: (widths: number[]): void => setView({ ...state.view, widths }),
    /** The person has read the loss list; record exactly what they read, so a longer list asks again. */
    acceptLosses: (): void => setView({ ...state.view, lossAccepted: [...state.losses] }),
    lossesPending: (): boolean => !lossesAccepted()
  }
}
export type SheetSession = ReturnType<typeof createSheetSession>
