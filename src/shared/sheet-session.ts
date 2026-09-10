import { parseCsv, serializeCsv, type CsvDoc } from './csv'
import { setCells as applyEdits, type CellEdit } from './sheet-model'
import { readXlsx, writeXlsx, type XlsxBook } from './sheet-xlsx'
import { base64ToBytes, bytesToBase64, type SheetFormat, type SheetView } from './sheet'
import type { Grid } from './sheet-formula'
import type { FileResult, FileWriteResult } from './file-panel'

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
  const past: Loaded[] = []
  const future: Loaded[] = []
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
      publish({ error: undefined })
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
    if (!await save(encode(previous, grid, structural))) return false
    past.push(previous)
    if (past.length > 100) past.shift()
    future.length = 0
    publish({})
    return true
  })
  const setView = (view: SheetView): void => { publish({ view }); io.changed(view) }

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
      const previous = base
      if (!await save(target)) return false
      past.pop(); future.push(previous); publish({}); return true
    }),
    redo: (): Promise<boolean> => guarded(async () => {
      const target = future.at(-1)
      if (!target || !base) return false
      const previous = base
      if (!await save(target)) return false
      future.pop(); past.push(previous); publish({}); return true
    }),
    setWidths: (widths: number[]): void => setView({ ...state.view, widths }),
    /** The person has read the loss list; record exactly what they read, so a longer list asks again. */
    acceptLosses: (): void => setView({ ...state.view, lossAccepted: [...state.losses] }),
    lossesPending: (): boolean => !lossesAccepted()
  }
}
export type SheetSession = ReturnType<typeof createSheetSession>
