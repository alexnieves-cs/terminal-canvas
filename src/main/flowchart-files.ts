import { mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute } from 'node:path'
import { outward as outwardGate } from '../shared/outward'
import { SHAPE_FILLS, SHAPE_INKS, SHAPE_STROKES, isShapeForm, parseConnectors, parseShapeRecord } from '../shared/flowchart'
import { flowchartSvg } from '../shared/flowchart-svg'
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
 * one: Mermaid arrives as text and is gated whole; an SVG arrives as its MODEL
 * and is BUILT HERE after each label crossed the gate whole (a wrapped label
 * splits a token — `buildScrubbedSvg`). The tripwire (`svgActiveContent`) then
 * reads what this process built: an SVG that embedded pixels or ran script
 * would be the second binary export that precedent warns about. This file never calls `redactSecrets` itself
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
  /** Injected so the plain-node tier can model a link; the default is `realpathSync`. */
  realpath?: (path: string) => string
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

/** A colour an exported SVG may carry: a hex, an rgb()/rgba(), or none/transparent — nothing that could close an attribute or fetch. */
const COLOUR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)|none|transparent)$/i
const MAX_SVG_SHAPES = 2000
const MAX_SVG_CONNECTORS = 6000
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const boxOf = (b: unknown): { x: number; y: number; w: number; h: number } | null => {
  const o = b as Record<string, unknown> | null
  return o !== null && typeof o === 'object' && finite(o.x) && finite(o.y) && finite(o.w) && finite(o.h) && o.w >= 0 && o.h >= 0 && o.w < 1e6 && o.h < 1e6 ? { x: o.x, y: o.y, w: o.w, h: o.h } : null
}

/**
 * M391 (the boundary critic's finding 1). The SVG, built in MAIN from the
 * renderer's model: every shape's words, every connector's label and every
 * live object's title cross `outward` WHOLE first (the count summed), the
 * records are re-read through the layout's own readers, the colours must be
 * literal colours — then the pure builder the canvas's own routes come from.
 */
function buildScrubbedSvg(rawModel: unknown, rawColours: unknown, gate: (text: string, source: string) => { text: string; redacted: number }): { kind: 'ok'; svg: string; redacted: number } | { kind: 'refused'; reason: string } {
  const m = (typeof rawModel === 'object' && rawModel !== null ? rawModel : {}) as { shapes?: unknown; connectors?: unknown; panels?: unknown }
  if (!Array.isArray(m.shapes) || m.shapes.length === 0) return { kind: 'refused', reason: 'the diagram is empty — add a shape, then export it' }
  if (m.shapes.length > MAX_SVG_SHAPES || (Array.isArray(m.connectors) && m.connectors.length > MAX_SVG_CONNECTORS)) return { kind: 'refused', reason: 'the diagram is too large to export as a picture — export it as Mermaid' }
  let redacted = 0
  const clean = (text: string): string => { const out = gate(text, 'flowchart'); redacted += out.redacted; return out.text }
  const warnings: string[] = []
  const shapes = m.shapes.flatMap((raw, i) => {
    const s = raw as { id?: unknown; box?: unknown; shape?: unknown }
    const box = boxOf(s.box)
    const shape = parseShapeRecord(s.shape, warnings, `shape ${i}`)
    if (box === null || shape === null) return []
    const { step: _step, ...rest } = shape
    void _step
    return [{ id: typeof s.id === 'string' ? s.id.slice(0, 64) : `s${i}`, box, shape: { ...rest, text: clean(rest.text) } }]
  })
  const connectors = (Array.isArray(m.connectors) ? m.connectors : []).flatMap((raw, i) => {
    const c = raw as { fromBox?: unknown; toBox?: unknown; fromForm?: unknown; toForm?: unknown; connector?: unknown; obstacles?: unknown }
    const fromBox = boxOf(c.fromBox)
    const toBox = boxOf(c.toBox)
    const parsed = parseConnectors([c.connector], warnings, `connector ${i}`)
    const connector = parsed?.[0]
    if (fromBox === null || toBox === null || connector === undefined) return []
    const obstacles = (Array.isArray(c.obstacles) ? c.obstacles : []).slice(0, MAX_SVG_SHAPES).map(boxOf).filter((b): b is NonNullable<typeof b> => b !== null)
    return [{
      fromBox, toBox,
      fromForm: isShapeForm(c.fromForm) ? c.fromForm : null,
      toForm: isShapeForm(c.toForm) ? c.toForm : null,
      connector: { ...connector, ...(connector.label === undefined ? {} : { label: clean(connector.label) }) },
      obstacles
    }]
  })
  const panels = (Array.isArray(m.panels) ? m.panels : []).slice(0, MAX_SVG_SHAPES).flatMap((raw) => {
    const p = raw as { box?: unknown; title?: unknown }
    const box = boxOf(p.box)
    return box === null || typeof p.title !== 'string' ? [] : [{ box, title: clean(p.title.slice(0, 500)) }]
  })
  const cr = (typeof rawColours === 'object' && rawColours !== null ? rawColours : {}) as Record<string, unknown>
  const pick = <K extends string>(group: unknown, keys: readonly K[]): Record<K, string> | null => {
    const g = (typeof group === 'object' && group !== null ? group : {}) as Record<string, unknown>
    const out = {} as Record<K, string>
    for (const k of keys) { const v = g[k]; if (typeof v !== 'string' || !COLOUR.test(v.trim())) return null; out[k] = v.trim() }
    return out
  }
  const fill = pick(cr.fill, SHAPE_FILLS)
  const stroke = pick(cr.stroke, SHAPE_STROKES)
  const ink = pick(cr.ink, SHAPE_INKS)
  const single = (v: unknown): string | null => (typeof v === 'string' && COLOUR.test(v.trim()) ? v.trim() : null)
  const background = single(cr.background)
  const line = single(cr.line)
  if (fill === null || stroke === null || ink === null || background === null || line === null) return { kind: 'refused', reason: 'the theme\'s colours could not be read as colours — export as Mermaid, or switch theme and try again' }
  const svg = flowchartSvg({ shapes, connectors, panels }, { fill, stroke, ink, background, line })
  return { kind: 'ok', svg, redacted }
}

/** A diagram's text to a file the person chooses, scrubbed on the way out. */
export async function exportFlowchart(req: unknown, deps: FlowchartFileDeps): Promise<FlowchartExportResult> {
  const r = (typeof req === 'object' && req !== null ? req : {}) as { format?: unknown; text?: unknown; model?: unknown; colours?: unknown; suggestedName?: unknown }
  const format = r.format
  if (format !== 'mermaid' && format !== 'svg') return { kind: 'refused', reason: 'a flowchart exports as mermaid or svg — choose one of those' }
  const gate = deps.outward ?? outwardGate
  let scrubbed: string
  let redacted: number
  if (format === 'svg') {
    // BUILT HERE, from the model, AFTER every label crossed the gate whole
    // (FlowchartExportRequest's header: a wrapped label splits a token).
    const built = buildScrubbedSvg(r.model, r.colours, gate)
    if (built.kind === 'refused') return built
    // The tripwire, on what THIS process built — defence in depth, since the
    // builder writes none of it.
    const active = svgActiveContent(built.svg)
    if (active !== null) return { kind: 'refused', reason: `the SVG contains ${active} — an exported SVG carries no scripts, links or embedded pictures; export as Mermaid` }
    scrubbed = built.svg
    redacted = built.redacted
  } else {
    const text = r.text
    if (typeof text !== 'string') return { kind: 'refused', reason: 'there is no diagram text to export' }
    if (text.trim() === '') return { kind: 'refused', reason: 'the diagram is empty — add a shape, then export it' }
    if (text.length > FLOWCHART_EXPORT_MAX_CHARS) {
      return { kind: 'refused', reason: `the diagram is ${(text.length / 1_000_000).toFixed(1)} million characters — over the ${(FLOWCHART_EXPORT_MAX_CHARS / 1_000_000).toFixed(0)} million this app exports; split it into smaller diagrams` }
    }
    const out = gate(text, 'flowchart')
    scrubbed = out.text
    redacted = out.redacted
  }
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
  if (!FLOWCHART_READ_EXTENSIONS.includes(extname(path).toLowerCase())) {
    return { kind: 'refused', reason: `${file} is not a Mermaid file — a flowchart is read from ${FLOWCHART_READ_EXTENSIONS.join(', ')}` }
  }
  // The REAL file, and its extension checked again (the boundary critic's
  // finding 5): `flow.mmd` linked to `~/.ssh/config` passed the name check and
  // read the key file. An agent's line names this path, so the name it gives
  // is not the file it reaches until the link is resolved.
  let real: string
  let st: ReturnType<NonNullable<FlowchartFileDeps['stat']>>
  try {
    real = (deps.realpath ?? realpathSync)(path)
    st = (deps.stat ?? statSync)(real)
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    return { kind: 'refused', reason: code === 'ENOENT' || code === 'ENOTDIR' ? `there is no file at ${path} — check the path` : `${file} could not be read: ${said(error)}` }
  }
  if (!FLOWCHART_READ_EXTENSIONS.includes(extname(real).toLowerCase())) {
    return { kind: 'refused', reason: `${file} links to a file that is not a Mermaid file — a flowchart is read from ${FLOWCHART_READ_EXTENSIONS.join(', ')}` }
  }
  if (st.isDirectory()) return { kind: 'refused', reason: `${path} is a folder, not a file — name the .mmd file inside it` }
  if (!st.isFile()) return { kind: 'refused', reason: `${path} is not a regular file — name a .mmd file` }
  if (st.size > FLOWCHART_READ_MAX_BYTES) {
    return { kind: 'refused', reason: `${file} is ${Math.ceil(st.size / 1000)} KB — over the ${FLOWCHART_READ_MAX_BYTES / 1000} KB a flowchart is read from; split it into smaller diagrams` }
  }
  let text: string
  try {
    text = (deps.readText ?? ((p: string) => readFileSync(p, 'utf8')))(real)
  } catch (error) {
    return { kind: 'refused', reason: `${file} could not be read: ${said(error)}` }
  }
  // Again after the read: a file that grew between the stat and the read is
  // held to the same cap (a UTF-8 character is at least one byte).
  if (text.length > FLOWCHART_READ_MAX_BYTES) {
    return { kind: 'refused', reason: `${file} is over the ${FLOWCHART_READ_MAX_BYTES / 1000} KB a flowchart is read from; split it into smaller diagrams` }
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
