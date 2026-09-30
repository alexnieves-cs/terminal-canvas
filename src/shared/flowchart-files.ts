/**
 * The flowchart's two file doors, as the renderer and main both see them:
 * `export:flowchart` (a diagram's text out, through the outward gate) and
 * `flowchart:read` (a Mermaid file in). Declared HERE, not in main, for the
 * reason `imported-note.ts` is: the bridge in `ipc-contract.ts` and the
 * renderer import types, and a type import from `main/` drags main's imports
 * into a renderer bundle that must not hold them.
 *
 * Pure and dependency-free; the arms and their sentences are checked in plain
 * node by `verify:flowchart flowchart.files.*`.
 */

/** What the renderer serialised: Mermaid text, or SVG built as TEXT by the app. */
export type FlowchartExportFormat = 'mermaid' | 'svg'

export interface FlowchartExportRequest {
  format: FlowchartExportFormat
  text: string
  /** A name to open the save sheet on. Main sanitises it and fixes the extension. */
  suggestedName: string
}

/**
 * Three arms, never a boolean. `refused` carries a sentence naming the fix — it
 * is also what a failed write answers, because a person's next act is the same
 * (choose somewhere else) and a fourth arm would be one more thing to forget.
 * `redacted` is the outward gate's count: an export that scrubbed something says so.
 */
export type FlowchartExportResult =
  | { kind: 'written'; path: string; redacted: number }
  | { kind: 'cancelled' }
  | { kind: 'refused'; reason: string }

/** No `path` opens the system's own chooser; a path is an agent's or a recent file's. */
export interface FlowchartReadRequest { path?: string }

export type FlowchartReadResult =
  /** `name` is the file's basename WITHOUT its extension — the diagram's title candidate. */
  | { kind: 'ok'; text: string; name: string; path: string }
  | { kind: 'cancelled' }
  | { kind: 'refused'; reason: string }

/** Refused before the outward gate runs: nothing this large is a diagram a person drew. */
export const FLOWCHART_EXPORT_MAX_CHARS = 2_000_000

/** Refused before a byte is read. A Mermaid file is a few kilobytes; 200 KB is a paste of something else. */
export const FLOWCHART_READ_MAX_BYTES = 200_000

/** The extensions `flowchart:read` accepts, lower-case with the dot. */
export const FLOWCHART_READ_EXTENSIONS: readonly string[] = ['.mmd', '.mermaid', '.md', '.txt']

/** The extension each export format is written with. */
export const FLOWCHART_EXPORT_EXTENSION: Record<FlowchartExportFormat, string> = { mermaid: '.mmd', svg: '.svg' }

/** The save sheet's filter per format, and the open sheet's one filter. */
export const FLOWCHART_SAVE_FILTERS: Record<FlowchartExportFormat, { name: string; extensions: string[] }[]> = {
  mermaid: [{ name: 'Mermaid', extensions: ['mmd'] }],
  svg: [{ name: 'SVG', extensions: ['svg'] }]
}
export const FLOWCHART_OPEN_FILTERS: { name: string; extensions: string[] }[] = [
  { name: 'Mermaid', extensions: ['mmd', 'mermaid', 'md', 'txt'] }
]

/**
 * What an SVG this app writes must never carry. The SVG is BUILT AS TEXT by the
 * app, so none of these should ever appear — which makes them a tripwire, not
 * a sanitiser: a hit means something upstream put active content or embedded
 * pixels into the file, and the export refuses rather than strips.
 *
 * The canvas PNG is the ONE binary export (docs/load-bearing.md); an SVG that
 * embedded a picture (`data:`) or fetched one (`href`) would be a second, and
 * one the outward gate — which reads TEXT — could not see into. `on*=` are the
 * event-handler attributes, which run script without a `<script>` tag.
 *
 * Deliberately blunt: a node whose label says `data:` is refused too, and the
 * sentence names the marker so the fix (reword the label) is one edit.
 */
const SVG_ACTIVE: ReadonlyArray<{ marker: string; pattern: RegExp }> = [
  { marker: '<script', pattern: /<script/i },
  { marker: '<foreignObject', pattern: /<foreignobject/i },
  { marker: 'javascript:', pattern: /javascript:/i },
  { marker: 'xlink:href', pattern: /xlink:href/i },
  { marker: 'href=', pattern: /\bhref\s*=/i },
  { marker: 'data:', pattern: /data:/i },
  { marker: '<iframe', pattern: /<iframe/i },
  { marker: '<embed', pattern: /<embed/i },
  { marker: '<object', pattern: /<object/i },
  { marker: '<image', pattern: /<image/i },
  { marker: 'an on…= event handler', pattern: /[\s"'/]on[a-z]+\s*=/i }
]

/** The first active-content marker an SVG's text contains, or null when it is clean. */
export function svgActiveContent(text: string): string | null {
  // MARKUP ONLY. Character data between tags is a person's label — escaped
  // by the builder (flowchart-svg.ts escapeXml), so `<` in it is `&lt;` and
  // it cannot open a tag — and a label that reads "Fetch data: rows" must
  // not refuse the export. What can ACT in an SVG lives in tags and their
  // attributes, so the scan reads only those.
  const markup = text.replace(/>[^<]*</g, '><')
  for (const { marker, pattern } of SVG_ACTIVE) if (pattern.test(markup)) return marker
  return null
}

/**
 * The file name the save sheet opens on: the suggestion with path separators,
 * control and shell-hostile characters removed, any known diagram extension
 * dropped, and the format's own extension put on — `Order flow?` → `Order flow.mmd`.
 * Never empty; never a dotfile; never longer than 80 characters before the extension.
 */
export function flowchartFileName(suggested: unknown, format: FlowchartExportFormat): string {
  const raw = typeof suggested === 'string' ? suggested : ''
  // Basename only: a suggestion carrying `../` or `/etc/` names a place, not a file.
  const tail = raw.split(/[\\/]/).pop() ?? ''
  let stem = tail.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, ' ').replace(/\s+/g, ' ').trim()
  stem = stem.replace(/\.(?:mmd|mermaid|svg|md|txt)$/i, '').replace(/^\.+/, '').replace(/[. ]+$/, '').trim()
  if (stem.length > 80) stem = stem.slice(0, 80).trim()
  if (stem === '') stem = 'flowchart'
  return `${stem}${FLOWCHART_EXPORT_EXTENSION[format]}`
}
