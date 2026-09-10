import { editChecklist, remapChecklistRuns, type ChecklistEdit, type ChecklistView, type ChecklistRun } from './checklist'
import type { FileResult, FileWriteResult } from './file-panel'

export interface ChecklistIO {
  read(): Promise<FileResult>
  write(content: string, mtimeMs: number): Promise<FileWriteResult>
  changed(view: ChecklistView): void
}
export interface ChecklistState { view: ChecklistView; disk?: FileResult; busy: boolean; error?: string; undo: number; redo: number }

/** File history is deliberately separate from canvas geometry history. Every write,
 * including undo, reads again and uses main's CAS token; no force-write door exists. */
export function createChecklistSession(initial: ChecklistView, io: ChecklistIO) {
  let state: ChecklistState = { view: initial, busy: false, undo: 0, redo: 0 }
  const past: ChecklistView[] = [], future: ChecklistView[] = [], listeners = new Set<() => void>()
  const publish = (patch: Partial<ChecklistState>): void => { state = { ...state, ...patch, undo: past.length, redo: future.length }; listeners.forEach((fn) => fn()) }
  const adopt = (view: ChecklistView): void => { publish({ view }); io.changed(view) }
  const usable = (disk: FileResult): disk is Extract<FileResult, { kind: 'text' }> => disk.kind === 'text' && disk.truncatedLines === 0
  const error = (reason: string): false => { publish({ error: reason }); return false }
  const guarded = async (work: () => Promise<boolean>): Promise<boolean> => {
    if (state.busy) return false
    publish({ busy: true, error: undefined })
    try { return await work() } catch (e) { return error(String(e)) }
    finally { publish({ busy: false }) }
  }
  const save = async (view: ChecklistView): Promise<boolean> => {
    const disk = await io.read()
    publish({ disk })
    if (!usable(disk)) return error('The file is missing, unreadable or truncated — refresh before editing.')
    if (state.view.accepted === undefined || disk.content !== state.view.accepted) return error('Review the changed file before editing or undoing.')
    if (view.accepted === undefined) return error('Read the file before editing.')
    const result = await io.write(view.accepted, disk.mtimeMs)
    if (result.kind !== 'written') { publish({ disk: await io.read() }); return error(result.detail) }
    adopt(view)
    // Adopt the returned timestamp even if a byte-identical save emits no watch event.
    publish({ disk: { ...disk, content: view.accepted, mtimeMs: result.mtimeMs, bytes: result.bytes } })
    return true
  }
  return {
    snapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    observe: (disk: FileResult) => publish({ disk }),
    refresh: () => guarded(async () => { publish({ disk: await io.read() }); return true }),
    accept: () => guarded(async () => {
      const reviewed = state.disk, disk = await io.read()
      publish({ disk })
      if (!usable(disk)) return error('Only a complete, readable text file can be accepted.')
      if (!reviewed || !usable(reviewed) || reviewed.content !== disk.content) return error('The draft changed again — read the latest version first.')
      const runs = remapChecklistRuns(state.view.accepted ?? '', disk.content, state.view.runs)
      past.length = 0; future.length = 0
      adopt({ accepted: disk.content, ...(runs ? { runs } : {}) })
      return true
    }),
    edit: (edit: ChecklistEdit) => guarded(async () => {
      if (state.view.accepted === undefined) return error('Review this file before editing.')
      const result = editChecklist(state.view.accepted, edit)
      if (result.kind === 'refused') return error(result.reason)
      const previous = state.view, runs = remapChecklistRuns(previous.accepted!, result.content, previous.runs)
      if (!await save({ accepted: result.content, ...(runs ? { runs } : {}) })) return false
      past.push(previous); if (past.length > 100) past.shift(); future.length = 0; publish({})
      return true
    }),
    undo: () => guarded(async () => {
      const target = past.at(-1)
      if (!target) return false
      const previous = state.view
      if (!await save(target)) return false
      past.pop(); future.push(previous); publish({}); return true
    }),
    redo: () => guarded(async () => {
      const target = future.at(-1)
      if (!target) return false
      const previous = state.view
      if (!await save(target)) return false
      future.pop(); past.push(previous); publish({}); return true
    }),
    link: (line: number, run: ChecklistRun) => {
      adopt({ ...state.view, runs: { ...state.view.runs, [line]: run } })
    }
  }
}
