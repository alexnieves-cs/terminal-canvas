import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute } from 'node:path'
import { outward as outwardGate } from '../shared/outward'
import {
  FLOWCHART_EXPORT_MAX_CHARS, FLOWCHART_READ_EXTENSIONS, FLOWCHART_READ_MAX_BYTES,
  flowchartFileName, svgActiveContent,
  type FlowchartExportFormat, type FlowchartExportResult, type FlowchartReadResult
} from '../shared/flowchart-files'

/**
 * The flowchart's two file doors: a diagram's text OUT (`export:flowchart`) and
 * a Mermaid file IN (`flowchart:read`).
 *
 * Main's, for the reason every file door is main's — the renderer names a path
 * or hands over text and never holds a file handle — and run here against
 * INJECTED dialogs and fs so `verify:flowchart flowchart.files.*` drives every
 * arm in plain node, with no Electron and no disk beyond the fake.
 *
 * Export is an OUTWARD door for TEXT: it passes `outward()` and reports how
 * many secrets it scrubbed, exactly as `panelText` does. The canvas PNG is the
 * one door without the gate (docs/load-bearing.md) and this is not a second
 * one — an SVG is built as text, so the gate can read all of it, and the
 * refusal below (`svgActiveContent`) is what keeps it text: an SVG that
 * embedded pixels or ran script would be the second binary export that
 * precedent warns about. This file never calls `redactSecrets` itself
 * (`verify:verbs gate.2` names the callers); `outward` is the door.
 *
 * Read is NOT an outward door — nothing leaves. It answers text, and the
 * renderer parses it; what it refuses are the files no diagram is in.
 */

export interface FlowchartFileDeps {
  /** The save sheet: a path, or null when the person cancelled. The name is already sanitised and carries its extension. */
  askSave(ask: { suggestedName: string; format: FlowchartExportFormat }): Promise<string | null>
  /** The open sheet: a path, or null when the person cancelled. */
  askOpen(): Promise<string | null>
  /** Injected so the plain-node tier can count writes; the default is atomic, mode 0o600. */
  write?: (path: string, data: string) => void
  /** `fs.statSync`'s shape. Throws when there is no such path. */
  stat?: (path: string) => { isFile(): boolean; isDirectory(): boolean; size: number }
  readText?: (path: string) => string
  /** Tests only. Absent, the real gate runs — a wiring that forgets to pass one cannot skip it. */
  outward?: (text: string, source: string) => { text: string; redacted: number }
}

const atomicWrite = (path: string, data: string): void => {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, data, { mode: 0o600 })
    renameSync(tmp, path)
  } catch (error) {
    // A half-written sibling is a file the person did not ask for.
    try { unlinkSync(tmp) } catch { /* nothing was created */ }
    throw error
  }
}

const said = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** A diagram's text to a file the person chooses, scrubbed on the way out. */
export async function exportFlowchart(req: unknown, deps: FlowchartFileDeps): Promise<FlowchartExportResult> {
  const r = (typeof req === 'object' && req !== null ? req : {}) as { format?: unknown; text?: unknown; suggestedName?: unknown }
  const format = r.format
  if (format !== 'mermaid' && format !== 'svg') return { kind: 'refused', reason: 'a flowchart exports as mermaid or svg — choose one of those' }
  const text = r.text
  if (typeof text !== 'string') return { kind: 'refused', reason: 'there is no diagram text to export' }
  if (text.trim() === '') return { kind: 'refused', reason: 'the diagram is empty — add a shape, then export it' }
  if (text.length > FLOWCHART_EXPORT_MAX_CHARS) {
    return { kind: 'refused', reason: `the diagram is ${(text.length / 1_000_000).toFixed(1)} million characters — over the ${(FLOWCHART_EXPORT_MAX_CHARS / 1_000_000).toFixed(0)} million this app exports; split it into smaller diagrams` }
  }
  // Before the gate and before any dialog: a refusal that opened a save sheet
  // first would ask the person to choose a file it was never going to write.
  if (format === 'svg') {
    const active = svgActiveContent(text)
    if (active !== null) {
      return { kind: 'refused', reason: `the SVG contains ${active} — an exported SVG carries no scripts, links or embedded pictures; remove it from the diagram's text, or export as Mermaid` }
    }
  }
  const gate = deps.outward ?? outwardGate
  const { text: scrubbed, redacted } = gate(text, 'flowchart')
  let path: string | null
  try {
    path = await deps.askSave({ suggestedName: flowchartFileName(r.suggestedName, format), format })
  } catch (error) {
    return { kind: 'refused', reason: `the save sheet could not open: ${said(error)}` }
  }
  if (path === null) return { kind: 'cancelled' }
  try {
    (deps.write ?? atomicWrite)(path, scrubbed)
  } catch (error) {
    return { kind: 'refused', reason: `the file could not be written: ${said(error)} — choose another folder` }
  }
  return { kind: 'written', path, redacted }
}

/** A Mermaid file as text — the system's chooser with no path, else the path an agent or a recent list named. */
export async function readFlowchart(req: unknown, deps: FlowchartFileDeps): Promise<FlowchartReadResult> {
  const named = (typeof req === 'object' && req !== null ? req : {}) as { path?: unknown }
  if (named.path !== undefined && typeof named.path !== 'string') return { kind: 'refused', reason: 'a flowchart path is text — name the file as an absolute path' }
  let path: string
  if (typeof named.path === 'string' && named.path.trim() !== '') {
    path = named.path.trim()
  } else {
    let chosen: string | null
    try {
      chosen = await deps.askOpen()
    } catch (error) {
      return { kind: 'refused', reason: `the open sheet could not open: ${said(error)}` }
    }
    if (chosen === null) return { kind: 'cancelled' }
    path = chosen
  }
  if (!isAbsolute(path)) return { kind: 'refused', reason: `${path} is not an absolute path — name the file from the top, like /Users/you/flow.mmd` }
  const file = basename(path)
  const ext = extname(path).toLowerCase()
  if (!FLOWCHART_READ_EXTENSIONS.includes(ext)) {
    return { kind: 'refused', reason: `${file} is not a Mermaid file — a flowchart is read from ${FLOWCHART_READ_EXTENSIONS.join(', ')}` }
  }
  let st: ReturnType<NonNullable<FlowchartFileDeps['stat']>>
  try {
    st = (deps.stat ?? statSync)(path)
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    return { kind: 'refused', reason: code === 'ENOENT' || code === 'ENOTDIR' ? `there is no file at ${path} — check the path` : `${file} could not be read: ${said(error)}` }
  }
  if (st.isDirectory()) return { kind: 'refused', reason: `${path} is a folder, not a file — name the .mmd file inside it` }
  if (!st.isFile()) return { kind: 'refused', reason: `${path} is not a regular file — name a .mmd file` }
  if (st.size > FLOWCHART_READ_MAX_BYTES) {
    return { kind: 'refused', reason: `${file} is ${Math.ceil(st.size / 1000)} KB — over the ${FLOWCHART_READ_MAX_BYTES / 1000} KB a flowchart is read from; split it into smaller diagrams` }
  }
  let text: string
  try {
    text = (deps.readText ?? ((p: string) => readFileSync(p, 'utf8')))(path)
  } catch (error) {
    return { kind: 'refused', reason: `${file} could not be read: ${said(error)}` }
  }
  // A .txt that is really a binary decodes to text with NULs in it, and Mermaid
  // parsed from that is noise the person would have to debug by eye.
  if (text.includes('\u0000')) return { kind: 'refused', reason: `${file} is not text — a flowchart is read from a plain-text Mermaid file` }
  // A BOM is the editor's, not the diagram's, and the parser's first line is `flowchart`.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return { kind: 'ok', text, name: basename(path, extname(path)), path }
}

/** Both doors over one set of deps — what `bootstrap/panel-handlers.ts` builds and `ipc.ts` registers. */
export function createFlowchartFiles(deps: FlowchartFileDeps) {
  return {
    export: (req: unknown) => exportFlowchart(req, deps),
    read: (req: unknown) => readFlowchart(req, deps)
  }
}
