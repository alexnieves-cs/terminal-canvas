import { redactSecrets } from './redact'
import type { PersistedPanel } from './layout-schema'
import type { PersistedTemplate } from './templates'

/**
 * M189. ONE PORTABLE FILE, and the parts it deliberately does not have.
 *
 * The record is built FIELD BY FIELD from each panel, never spread — the same
 * structural trick `credential-store.ts`'s `list()` and the diagnostics bundle
 * use, and for the same reason: a terminal's resolved environment, a chat's
 * transcript and session id, a pid and a live cwd have nowhere to go in this
 * shape, so a field added to a panel later cannot leak through the way it
 * would through a spread. Everything that travels passes `redactSecrets` and
 * the count rides on the record; what could not travel is NAMED in `omitted`
 * with its reason, because a thing that silently vanished reads as a thing the
 * app lost.
 *
 * Pure: no DOM, no node. Plain-node checked in `verify:file portable.1`.
 */

export const PORTABLE_VERSION = 1
export const PORTABLE_KINDS = ['canvas', 'workflow'] as const
export type PortableKind = (typeof PORTABLE_KINDS)[number]

export interface PortableAsset { id: string; mediaType: string; base64: string }

export interface PortableFile {
  version: number
  kind: PortableKind
  createdAt: number
  app: string
  workspace: { name: string; panels: PersistedPanel[] }
  templates: PersistedTemplate[]
  assets: PortableAsset[]
  /** One entry per thing that could not travel, with the reason a person can act on. */
  omitted: { what: string; why: string }[]
  /** How many secrets `redactSecrets` replaced across everything in this file. */
  redacted: number
}

/**
 * The kinds that cannot travel, and why. Each reason is what would HAPPEN on
 * the other machine, not a category name — "it names a repository that is not
 * there" tells a person what to do; "unsupported" does not.
 */
const CANNOT_TRAVEL: Readonly<Record<string, string>> = {
  watcher: 'a watcher would arm itself on the other machine and run its command there',
  review: 'a review names a repository and a baseline the other machine does not have',
  browser: 'a browser pane names a page (often a port on this machine) that is someone else\'s',
  work: 'a work card belongs to a board and an issue tracker, not to a canvas file',
  skill: 'a skill panel names a file in this machine\'s own .claude directory',
  github: 'a GitHub panel reads through this machine\'s own credential',
  jira: 'a Jira panel reads through this machine\'s own credential',
  memory: 'a memory panel reads this machine\'s own project memory',
  toolbox: 'a toolbox panel reads this machine\'s own permissions'
}

/**
 * The kinds this file KNOWS HOW TO WRITE. An allowlist, not the absence of a
 * denylist (M190's critic, 7): a sixteenth kind added later would otherwise
 * travel by default AND be written by the terminal arm below — shipping
 * whatever its record holds, typed as something it is not. A kind on neither
 * list is omitted by name, which is the honest answer for a shape this
 * version of the format cannot carry.
 */
const TRAVELS: ReadonlySet<string> = new Set(['terminal', 'chat', 'file', 'note', 'image', 'workflow'])

export function travels(kind: string | undefined): boolean {
  return TRAVELS.has(kind ?? 'terminal')
}

interface BuildInput {
  kind: PortableKind
  workspaceName: string
  panels: readonly PersistedPanel[]
  templates: readonly PersistedTemplate[]
  app: string
  now: number
  /** The bytes of the images the person chose to include; absent = no pixels travel. */
  images?: readonly PortableAsset[]
  hasRoutines?: boolean
}

/** Scrub a string and count what was replaced. */
function scrub(text: string, tally: { n: number }): string {
  const { text: clean, count } = redactSecrets(text)
  tally.n += count
  return clean
}

/**
 * A panel, field by field. Only the fields a shape needs cross; everything
 * that is a live connection to THIS machine is dropped here rather than
 * filtered later, which is what makes the omission structural.
 */
function portablePanel(panel: PersistedPanel, tally: { n: number }): PersistedPanel {
  const binding = (panel as unknown as { templateBinding?: { templateId: string; key: string } }).templateBinding
  const base = {
    id: panel.id, x: panel.x, y: panel.y, w: panel.w, h: panel.h, z: panel.z,
    ...(panel.title === undefined ? {} : { title: scrub(panel.title, tally) }),
    // M182's canvas binding is a SHAPE fact — which node of which template
    // this panel is — so it travels, remapped with its template. Every other
    // mark (lock, pin, maximise) is this machine's arrangement and is not
    // carried: an imported canvas arrives unlocked and unpinned, which is the
    // state a person can act on.
    ...(binding === undefined ? {} : { templateBinding: { templateId: binding.templateId, key: binding.key } })
  } as PersistedPanel
  const raw = panel as unknown as Record<string, unknown>
  const kind = typeof raw.kind === 'string' ? raw.kind : 'terminal'
  if (kind === 'note') {
    const note = raw.note as { form: string; text: string; tint?: string }
    return { ...base, kind: 'note', note: { form: note.form, text: scrub(note.text, tally), ...(note.tint === undefined ? {} : { tint: note.tint }) } } as PersistedPanel
  }
  if (kind === 'image') {
    const image = raw.image as { path: string; asset?: string }
    // The path travels AS TEXT and will not resolve on another machine — the
    // panel arrives `missing` with Replace beside it, which is the honest
    // arm. The ASSET id is what identifies the picture; the bytes travel only
    // when the person asked for them. (M190's critic, 8: an earlier comment
    // here claimed the path did not travel, which the line below disproves.)
    return { ...base, kind: 'image', image: { path: image.path, ...(image.asset === undefined ? {} : { asset: image.asset }) } } as PersistedPanel
  }
  if (kind === 'workflow') {
    return { ...base, kind: 'workflow', workflow: { templateId: (raw.workflow as { templateId: string }).templateId } } as PersistedPanel
  }
  if (kind === 'chat') {
    // A chat's SHAPE — where it works and what engine — never its session id
    // and never one line of its transcript.
    const chat = raw.chat as { cwd: string; backend?: string }
    return { ...base, kind: 'chat', chat: { cwd: scrub(chat.cwd, tally), ...(chat.backend === undefined ? {} : { backend: chat.backend }) } } as unknown as PersistedPanel
  }
  if (kind === 'file') {
    const file = raw.source as import('./file-panel').FileSource
    // References travel, accepted local text and execution links do not. An imported
    // checklist must be read before it can edit a file on this machine or send a task.
    return { ...base, kind: 'file', source: { path: scrub(file.path, tally), ...(file.prose === true ? { prose: true } : {}), ...(file.checklist === undefined ? {} : { checklist: {} }), ...(file.deck === undefined ? {} : { deck: {} }) } } as unknown as PersistedPanel
  }
  // A terminal: the command it was ASKED for, and nothing the process became.
  const command = typeof raw.command === 'string' ? scrub(raw.command, tally) : undefined
  const args = Array.isArray(raw.args) ? (raw.args as unknown[]).filter((a): a is string => typeof a === 'string').map((a) => scrub(a, tally)) : []
  return {
    ...base,
    cwd: typeof raw.cwd === 'string' ? scrub(raw.cwd, tally) : '~',
    args,
    ...(command === undefined ? {} : { command })
  } as PersistedPanel
}

export function buildPortable(input: BuildInput): PortableFile {
  const tally = { n: 0 }
  const omitted: { what: string; why: string }[] = []
  const kept: PersistedPanel[] = []
  const dropped = new Map<string, number>()
  for (const panel of input.panels) {
    const kind = (panel as unknown as { kind?: string }).kind ?? 'terminal'
    if (!travels(kind)) { dropped.set(kind, (dropped.get(kind) ?? 0) + 1); continue }
    kept.push(portablePanel(panel, tally))
  }
  for (const [kind, count] of dropped) {
    omitted.push({ what: `${count} ${kind} panel${count === 1 ? '' : 's'}`, why: CANNOT_TRAVEL[kind] ?? `this version of the canvas file has no shape for a ${kind} panel` })
  }
  // Said once, plainly: the file carries the DIRECTORIES and file paths of
  // what travelled. They are part of the shape (a terminal without its
  // directory is not the terminal that was exported), they are scrubbed only
  // for things that look like secrets, and a person sending this file to
  // someone else is sending their folder names.
  if (kept.length > 0) omitted.push({ what: 'nothing of the paths', why: 'folder and file paths travel as text — they are part of each object\'s shape, and they name your own directories' })
  const images = input.images ?? []
  const pictures = kept.filter((p) => (p as unknown as { kind?: string }).kind === 'image').length
  if (pictures > 0 && images.length === 0) {
    // NEVER "redacted": a picture cannot be scrubbed, and saying it was would
    // be the most dangerous sentence in this file.
    omitted.push({ what: `the pixels of ${pictures} picture${pictures === 1 ? '' : 's'}`, why: 'a picture cannot be scrubbed by machine — including one is a choice a person makes by looking at it' })
  }
  if (input.hasRoutines === true) omitted.push({ what: 'every routine', why: 'a routine would schedule itself on the other machine and send messages there' })
  omitted.push({ what: 'every credential', why: 'this app\'s credentials never leave its own encrypted store — there is nothing of them in this file' })
  const templates = input.templates.map((t) => JSON.parse(scrub(JSON.stringify(t), tally)) as PersistedTemplate)
  return {
    version: PORTABLE_VERSION,
    kind: input.kind,
    createdAt: input.now,
    app: input.app,
    workspace: { name: input.workspaceName, panels: kept },
    templates,
    assets: [...images],
    omitted,
    redacted: tally.n
  }
}

export type PortableParse =
  | { kind: 'file'; file: PortableFile; warnings: string[] }
  | { kind: 'not-portable'; reason: string }
  | { kind: 'unknown-version'; found: number; known: number; reason: string }

/** Three answers, never two: not one of these files, one from a future version, or one to read. */
export function parsePortable(text: string): PortableParse {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { kind: 'not-portable', reason: 'that file is not JSON — a canvas file is written by Export and ends in .tccanvas' } }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'not-portable', reason: 'that file holds no canvas — it is JSON, but not a canvas file' }
  const r = raw as Record<string, unknown>
  if (typeof r.version !== 'number' || !PORTABLE_KINDS.includes(r.kind as PortableKind)) {
    return { kind: 'not-portable', reason: 'that file names no canvas version and kind — it was not written by Export' }
  }
  if (r.version > PORTABLE_VERSION) {
    return { kind: 'unknown-version', found: r.version, known: PORTABLE_VERSION, reason: `that file was written by a newer version of this app (file version ${r.version}, this app reads ${PORTABLE_VERSION}) — update, or ask for it to be exported again` }
  }
  const warnings: string[] = []
  const workspace = r.workspace as { name?: unknown; panels?: unknown } | undefined
  const panels = Array.isArray(workspace?.panels) ? (workspace?.panels as PersistedPanel[]) : []
  if (!Array.isArray(workspace?.panels)) warnings.push('the file names no panels — an empty workspace is what it will make')
  const templates = Array.isArray(r.templates) ? (r.templates as PersistedTemplate[]) : []
  if (r.templates !== undefined && !Array.isArray(r.templates)) warnings.push('the file\'s templates were not a list — none were read')
  const assets = Array.isArray(r.assets) ? (r.assets as PortableAsset[]).filter((a) => a !== null && typeof a === 'object' && typeof a.id === 'string' && typeof a.base64 === 'string') : []
  if (Array.isArray(r.assets) && assets.length !== (r.assets as unknown[]).length) warnings.push('some pictures in the file were unreadable and were left out')
  return {
    kind: 'file',
    warnings,
    file: {
      version: r.version,
      kind: r.kind as PortableKind,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
      app: typeof r.app === 'string' ? r.app : 'unknown',
      workspace: { name: typeof workspace?.name === 'string' && workspace.name.trim() !== '' ? workspace.name : 'imported canvas', panels },
      templates,
      assets,
      omitted: Array.isArray(r.omitted) ? (r.omitted as { what: string; why: string }[]) : [],
      redacted: typeof r.redacted === 'number' ? r.redacted : 0
    }
  }
}

/**
 * New ids for everything, so an import can never collide with what is already
 * on this machine — and so importing the same file twice makes two canvases
 * rather than one that overwrote the other. Every reference is remapped with
 * its target: a workflow panel's `templateId` and a template's own id move
 * together, or the panel would draw a template that is not there.
 */
export function remapPortable(file: PortableFile, mint: (prefix: string) => string): PortableFile {
  const panelIds = new Map<string, string>()
  const templateIds = new Map<string, string>()
  for (const p of file.workspace.panels) panelIds.set(p.id, mint('p'))
  for (const t of file.templates) templateIds.set(t.id, mint('t'))
  const panels = file.workspace.panels.map((p) => {
    const next = { ...p, id: panelIds.get(p.id) as string } as PersistedPanel
    const raw = next as unknown as Record<string, unknown>
    // Import is a gate too: a hand-authored portable file can carry fields our
    // exporter would never write. Strip acceptance and execution links here.
    if (next.kind === 'file' && (next.source?.checklist !== undefined || next.source?.deck !== undefined)) {
      // M248. A deck travels as `deck: {}` — the view, never a staged proposal or the slide on show.
      next.source = { path: next.source.path, ...(next.source.prose === true ? { prose: true } : {}), ...(next.source.checklist !== undefined ? { checklist: {} } : {}), ...(next.source.deck !== undefined ? { deck: {} } : {}) }
    }
    if (raw.kind === 'workflow') {
      const wf = raw.workflow as { templateId: string }
      raw.workflow = { templateId: templateIds.get(wf.templateId) ?? wf.templateId }
    }
    // A binding to a template that travelled moves with it; one to a template
    // that did not is DROPPED rather than left pointing at a stranger's id.
    if (raw.templateBinding !== undefined) {
      const binding = raw.templateBinding as { templateId: string; key: string }
      const moved = templateIds.get(binding.templateId)
      if (moved === undefined) delete raw.templateBinding
      else raw.templateBinding = { templateId: moved, key: binding.key }
    }
    return next
  })
  const templates = file.templates.map((t) => ({ ...t, id: templateIds.get(t.id) as string }))
  return { ...file, workspace: { ...file.workspace, panels }, templates }
}

/** The sentence an export reports: what travelled, what was scrubbed, what was left. */
export function exportSentence(file: PortableFile): string {
  const panels = file.workspace.panels.length
  const parts = [`${panels} object${panels === 1 ? '' : 's'}`]
  if (file.templates.length > 0) parts.push(`${file.templates.length} workflow${file.templates.length === 1 ? '' : 's'}`)
  if (file.assets.length > 0) parts.push(`${file.assets.length} picture${file.assets.length === 1 ? '' : 's'}`)
  const scrubbed = file.redacted === 0 ? 'nothing looked like a secret' : `${file.redacted} secret${file.redacted === 1 ? '' : 's'} scrubbed`
  return `${parts.join(', ')} · ${scrubbed} · ${file.omitted.length} thing${file.omitted.length === 1 ? '' : 's'} left out (each named in the file)`
}
