import { closeSync, constants as fsc, fstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute } from 'node:path'
import { outward as outwardGate } from '../shared/outward'
import {
  SHAPE_FILLS, SHAPE_INKS, SHAPE_SIZE, SHAPE_STROKES, isEnds, isRoute, isShapeForm, parseConnectors, parseShapeRecord,
  type FlowDirection, type FlowEdge, type FlowGraph, type FlowGroup, type FlowNode
} from '../shared/flowchart'
import { serializeMermaid } from '../shared/flowchart-mermaid'
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
const MAX_SHAPES = 2000
const MAX_CONNECTORS = 6000
const MAX_GROUPS = 500
/** A route's points: an elbow route simplifies to a handful; a curve is four. */
const MAX_ROUTE_POINTS = 64
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e7
const boxOf = (b: unknown): { x: number; y: number; w: number; h: number } | null => {
  const o = b as Record<string, unknown> | null
  return o !== null && typeof o === 'object' && finite(o.x) && finite(o.y) && finite(o.w) && finite(o.h) && o.w >= 0 && o.h >= 0 && o.w < 1e6 && o.h < 1e6 ? { x: o.x, y: o.y, w: o.w, h: o.h } : null
}
const pointsOf = (raw: unknown, route: unknown): { x: number; y: number }[] | null => {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_ROUTE_POINTS) return null
  if (route === 'curved' && raw.length !== 4) return null
  const out: { x: number; y: number }[] = []
  for (const p of raw) {
    const o = p as Record<string, unknown> | null
    if (o === null || typeof o !== 'object' || !finite(o.x) || !finite(o.y)) return null
    out.push({ x: o.x, y: o.y })
  }
  return out
}

/**
 * The words a request carries — ONLY the fields a builder reads (a shape's or
 * node's text, an arrow's label, a group's name, a live object's title),
 * measured BEFORE any is scrubbed: the scrub is a set of regexes over whole
 * strings, so a request past the export's own cap is refused before main
 * spends that time — and never "fixed" by cutting the strings first (a cut
 * can split a secret the scrubber would have matched: the boundary confirm's
 * finding C). Fields no builder reads are never walked, so a payload padded
 * with them costs nothing to measure.
 */
const strLen = (v: unknown): number => (typeof v === 'string' ? v.length : 0)
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const field = (v: unknown, key: string): unknown => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>)[key] : undefined)
function wordsLength(parts: ReadonlyArray<readonly [list: unknown, read: (item: unknown) => unknown]>): number {
  let n = 0
  for (const [list, read] of parts) {
    for (const item of listOf(list)) {
      n += strLen(read(item))
      if (n > FLOWCHART_EXPORT_MAX_CHARS) return n
    }
  }
  return n
}
const tooBig = (): { kind: 'refused'; reason: string } => ({ kind: 'refused', reason: `the diagram holds over ${(FLOWCHART_EXPORT_MAX_CHARS / 1_000_000).toFixed(0)} million characters of words — over what this app exports; split it into smaller diagrams` })

/**
 * The Mermaid, built in MAIN from the graph: each shape's words, each arrow's
 * label and each group's name cross `outward` WHOLE, then the shared
 * serializer (which encodes a newline as `<br/>` — after the gate, never
 * before). Ids are main's own (`n1`, `g1`), so nothing the renderer named
 * reaches the file but the scrubbed words.
 */
function buildScrubbedMermaid(rawGraph: unknown, gate: (text: string, source: string) => { text: string; redacted: number }): { kind: 'ok'; text: string; redacted: number } | { kind: 'refused'; reason: string } {
  const g = (typeof rawGraph === 'object' && rawGraph !== null ? rawGraph : {}) as { direction?: unknown; nodes?: unknown; edges?: unknown; groups?: unknown }
  if (!Array.isArray(g.nodes) || g.nodes.length === 0) return { kind: 'refused', reason: 'the diagram is empty — add a shape, then export it' }
  if (g.nodes.length > MAX_SHAPES || (Array.isArray(g.edges) && g.edges.length > MAX_CONNECTORS) || (Array.isArray(g.groups) && g.groups.length > MAX_GROUPS)) {
    return { kind: 'refused', reason: 'the diagram is too large to export — split it into smaller diagrams' }
  }
  if (wordsLength([[g.nodes, (n) => field(n, 'text')], [g.edges, (e) => field(e, 'label')], [g.groups, (x) => field(x, 'label')]]) > FLOWCHART_EXPORT_MAX_CHARS) return tooBig()
  let redacted = 0
  const clean = (text: string): string => { const out = gate(text, 'flowchart'); redacted += out.redacted; return out.text }
  const idOf = new Map<string, string>()
  const nodes: FlowNode[] = []
  for (const raw of g.nodes) {
    const n = raw as { id?: unknown; form?: unknown; text?: unknown }
    if (typeof n.id !== 'string' || idOf.has(n.id) || !isShapeForm(n.form)) continue
    const id = `n${nodes.length + 1}`
    idOf.set(n.id, id)
    nodes.push({ id, form: n.form, text: typeof n.text === 'string' ? clean(n.text) : '', w: SHAPE_SIZE[n.form].w, h: SHAPE_SIZE[n.form].h })
  }
  if (nodes.length === 0) return { kind: 'refused', reason: 'the diagram is empty — add a shape, then export it' }
  const edges: FlowEdge[] = []
  for (const raw of Array.isArray(g.edges) ? g.edges : []) {
    const e = raw as { from?: unknown; to?: unknown; label?: unknown; ends?: unknown; dashed?: unknown; route?: unknown }
    const from = typeof e.from === 'string' ? idOf.get(e.from) : undefined
    const to = typeof e.to === 'string' ? idOf.get(e.to) : undefined
    if (from === undefined || to === undefined) continue
    edges.push({
      from, to,
      ...(typeof e.label === 'string' && e.label !== '' ? { label: clean(e.label) } : {}),
      ...(isEnds(e.ends) ? { ends: e.ends } : {}),
      ...(e.dashed === true ? { dashed: true } : {}),
      ...(isRoute(e.route) ? { route: e.route } : {})
    })
  }
  const groups: FlowGroup[] = []
  for (const raw of Array.isArray(g.groups) ? g.groups : []) {
    const gr = raw as { label?: unknown; nodes?: unknown }
    const members = (Array.isArray(gr.nodes) ? gr.nodes : []).flatMap((id) => (typeof id === 'string' && idOf.has(id) ? [idOf.get(id) as string] : []))
    if (members.length === 0) continue
    groups.push({ id: `g${groups.length + 1}`, label: typeof gr.label === 'string' ? clean(gr.label) : '', nodes: members })
  }
  const direction: FlowDirection = g.direction === 'BT' || g.direction === 'LR' || g.direction === 'RL' ? g.direction : 'TB'
  const graph: FlowGraph = { direction, nodes, edges, ...(groups.length > 0 ? { groups } : {}) }
  return { kind: 'ok', text: serializeMermaid(graph), redacted }
}

/**
 * M391 (the boundary critic's finding 1). The SVG, built in MAIN from the
 * renderer's model: every shape's words, every connector's label and every
 * live object's title cross `outward` WHOLE first (the count summed) — before
 * any reader caps them — the records are re-read through the layout's own
 * readers, the colours must be literal colours, each route is the POINTS the
 * canvas routed (main never searches: the boundary confirm measured an A* per
 * connector here blocking every PTY for seconds), then the pure builder.
 */
function buildScrubbedSvg(rawModel: unknown, rawColours: unknown, gate: (text: string, source: string) => { text: string; redacted: number }): { kind: 'ok'; svg: string; redacted: number } | { kind: 'refused'; reason: string } {
  const m = (typeof rawModel === 'object' && rawModel !== null ? rawModel : {}) as { shapes?: unknown; connectors?: unknown; panels?: unknown }
  if (!Array.isArray(m.shapes) || m.shapes.length === 0) return { kind: 'refused', reason: 'the diagram is empty — add a shape, then export it' }
  if (m.shapes.length > MAX_SHAPES || (Array.isArray(m.connectors) && m.connectors.length > MAX_CONNECTORS) || (Array.isArray(m.panels) && m.panels.length > MAX_SHAPES)) {
    return { kind: 'refused', reason: 'the diagram is too large to export as a picture — export it as Mermaid' }
  }
  if (wordsLength([[m.shapes, (x) => field(field(x, 'shape'), 'text')], [m.connectors, (c) => field(field(c, 'connector'), 'label')], [m.panels, (x) => field(x, 'title')]]) > FLOWCHART_EXPORT_MAX_CHARS) return tooBig()
  let redacted = 0
  const clean = (text: string): string => { const out = gate(text, 'flowchart'); redacted += out.redacted; return out.text }
  const warnings: string[] = []
  const shapes = m.shapes.flatMap((raw, i) => {
    const s = raw as { id?: unknown; box?: unknown; shape?: unknown }
    const box = boxOf(s.box)
    const rec = (typeof s.shape === 'object' && s.shape !== null ? s.shape : null) as Record<string, unknown> | null
    // Scrubbed BEFORE the reader caps it (a cap first could split a secret).
    const shape = rec === null ? null : parseShapeRecord(typeof rec.text === 'string' ? { ...rec, text: clean(rec.text) } : rec, warnings, `shape ${i}`)
    if (box === null || shape === null) return []
    const { step: _step, ...rest } = shape
    void _step
    return [{ id: `s${i}`, box, shape: rest }]
  })
  const connectors = (Array.isArray(m.connectors) ? m.connectors : []).flatMap((raw, i) => {
    const c = raw as { fromBox?: unknown; toBox?: unknown; fromForm?: unknown; toForm?: unknown; connector?: unknown; points?: unknown }
    const fromBox = boxOf(c.fromBox)
    const toBox = boxOf(c.toBox)
    const rec = (typeof c.connector === 'object' && c.connector !== null ? c.connector : null) as Record<string, unknown> | null
    const connector = rec === null ? undefined : parseConnectors([typeof rec.label === 'string' ? { ...rec, label: clean(rec.label) } : rec], warnings, `connector ${i}`)?.[0]
    const points = pointsOf(c.points, connector?.route ?? 'orthogonal')
    if (fromBox === null || toBox === null || connector === undefined || points === null) return []
    return [{ fromBox, toBox, fromForm: isShapeForm(c.fromForm) ? c.fromForm : null, toForm: isShapeForm(c.toForm) ? c.toForm : null, connector, points }]
  })
  const panels = (Array.isArray(m.panels) ? m.panels : []).flatMap((raw) => {
    const p = raw as { box?: unknown; title?: unknown }
    const box = boxOf(p.box)
    // Scrubbed WHOLE, then cut to what a picture's label holds.
    return box === null || typeof p.title !== 'string' ? [] : [{ box, title: clean(p.title).slice(0, 500) }]
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
  const r = (typeof req === 'object' && req !== null ? req : {}) as { format?: unknown; graph?: unknown; model?: unknown; colours?: unknown; suggestedName?: unknown }
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
    // BUILT HERE too, from the graph, after each label crossed the gate whole
    // (the boundary confirm: `encodeLabel` turns a newline into `<br/>`, so
    // "Bearer\n<token>" in one label left the Mermaid door unscrubbed).
    const built = buildScrubbedMermaid(r.graph, gate)
    if (built.kind === 'refused') return built
    scrubbed = built.text
    redacted = built.redacted
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

type Opened =
  | { kind: 'text'; text: string }
  | { kind: 'missing' }
  | { kind: 'error'; error: unknown }
  | { kind: 'dir' }
  | { kind: 'special' }
  | { kind: 'big'; size: number }

const isMissing = (error: unknown): boolean => { const code = (error as { code?: unknown } | null)?.code; return code === 'ENOENT' || code === 'ENOTDIR' }

/**
 * The real read: ONE descriptor, judged and read through itself (the boundary
 * confirm's TOCTOU — a stat and a read by NAME let the file be swapped between
 * them for a FIFO, which blocks main forever, or /dev/zero, which never ends).
 * O_NOFOLLOW refuses a link swapped in after `realpath`; O_NONBLOCK makes a
 * FIFO open without a writer; `fstat` judges THIS file; the read stops one
 * byte past the cap whatever the size said.
 */
function boundedRead(path: string, _deps?: FlowchartFileDeps): Opened {
  void _deps
  let fd: number
  try {
    fd = openSync(path, fsc.O_RDONLY | fsc.O_NOFOLLOW | fsc.O_NONBLOCK)
  } catch (error) {
    return isMissing(error) ? { kind: 'missing' } : { kind: 'error', error }
  }
  try {
    const st = fstatSync(fd)
    if (st.isDirectory()) return { kind: 'dir' }
    if (!st.isFile()) return { kind: 'special' }
    if (st.size > FLOWCHART_READ_MAX_BYTES) return { kind: 'big', size: st.size }
    const buf = Buffer.alloc(FLOWCHART_READ_MAX_BYTES + 1)
    let n = 0
    for (;;) {
      const got = readSync(fd, buf, n, buf.length - n, null)
      if (got === 0) break
      n += got
      if (n > FLOWCHART_READ_MAX_BYTES) return { kind: 'big', size: n }
    }
    return { kind: 'text', text: buf.subarray(0, n).toString('utf8') }
  } catch (error) {
    return { kind: 'error', error }
  } finally {
    closeSync(fd)
  }
}

/** The plain-node tier's read, over its injected stat and text — the same answers, no disk. */
function injectedRead(path: string, deps: FlowchartFileDeps): Opened {
  let st: { isFile(): boolean; isDirectory(): boolean; size: number }
  try {
    if (deps.stat === undefined) throw new Error('no stat injected')
    st = deps.stat(path)
  } catch (error) {
    return isMissing(error) ? { kind: 'missing' } : { kind: 'error', error }
  }
  if (st.isDirectory()) return { kind: 'dir' }
  if (!st.isFile()) return { kind: 'special' }
  if (st.size > FLOWCHART_READ_MAX_BYTES) return { kind: 'big', size: st.size }
  let text: string
  try {
    if (deps.readText === undefined) throw new Error('no read injected')
    text = deps.readText(path)
  } catch (error) {
    return { kind: 'error', error }
  }
  // Held to the cap AFTER the read too (a file can grow between the stat and the read).
  return Buffer.byteLength(text) > FLOWCHART_READ_MAX_BYTES ? { kind: 'big', size: Buffer.byteLength(text) } : { kind: 'text', text }
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
  try {
    real = (deps.realpath ?? realpathSync)(path)
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    return { kind: 'refused', reason: code === 'ENOENT' || code === 'ENOTDIR' ? `there is no file at ${path} — check the path` : `${file} could not be read: ${said(error)}` }
  }
  if (!FLOWCHART_READ_EXTENSIONS.includes(extname(real).toLowerCase())) {
    return { kind: 'refused', reason: `${file} links to a file that is not a Mermaid file — a flowchart is read from ${FLOWCHART_READ_EXTENSIONS.join(', ')}` }
  }
  const got = (deps.stat !== undefined || deps.readText !== undefined ? injectedRead : boundedRead)(real, deps)
  switch (got.kind) {
    case 'missing': return { kind: 'refused', reason: `there is no file at ${path} — check the path` }
    case 'error': return { kind: 'refused', reason: `${file} could not be read: ${said(got.error)}` }
    case 'dir': return { kind: 'refused', reason: `${path} is a folder, not a file — name the .mmd file inside it` }
    case 'special': return { kind: 'refused', reason: `${path} is not a regular file — name a .mmd file` }
    case 'big': return { kind: 'refused', reason: `${file} is ${got.size > FLOWCHART_READ_MAX_BYTES ? `${Math.ceil(got.size / 1000)} KB — ` : ''}over the ${FLOWCHART_READ_MAX_BYTES / 1000} KB a flowchart is read from; split it into smaller diagrams` }
  }
  let text = got.text
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
