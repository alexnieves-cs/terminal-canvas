import { redactSecrets } from './redact'
import { findService, notConnectedReason, type CredentialMeta } from './credential-schema'
import { parsePresets, parsePrompts, parseTemplates, type Preset, type Prompt } from './layout-schema'
import type { PersistedTemplate } from './templates'

/**
 * M253. A PACK: one discipline's library objects — workflows, saved prompts
 * and object presets — plus the credentials and external tools that work
 * needs, in one file a person was given and reads before anything is added.
 *
 * Its own envelope (`kind: 'pack'`), never a portable kind: were `pack` one
 * of `PORTABLE_KINDS`, Import canvas would accept a pack and make a workspace
 * of it. Each door refuses the other's file by name instead.
 *
 * The rules are M189's, applied to library objects: built field by field and
 * scrubbed with the count on the record; what never travels is NAMED in
 * `omitted`; and the manifest names a credential by service and FIELD, with no
 * key a value could occupy.
 *
 * Pure: no DOM, no node. Plain-node checked in `verify:file pack.*`.
 */

export const PACK_VERSION = 1
export const PACK_CONTENT_KINDS = ['workflow', 'prompt', 'preset'] as const
export type PackContentKind = (typeof PACK_CONTENT_KINDS)[number]

/** A plain command word — a PATH probe of anything else would be a shell line. */
const TOOL_COMMAND = /^[A-Za-z0-9._-]+$/
const SEMVER = /^\d+\.\d+\.\d+$/
const MANIFEST_KEYS: ReadonlySet<string> = new Set(['name', 'version', 'description', 'contents', 'credentials', 'tools'])

export interface PackContent { kind: PackContentKind; id: string; name: string }
export interface PackCredentialField { id: string; label: string }
export interface PackCredential { service: string; fields: PackCredentialField[] }
export interface PackTool { command: string; why?: string }

export interface PackManifest {
  name: string
  version: string
  description?: string
  contents: PackContent[]
  credentials?: PackCredential[]
  tools?: PackTool[]
}

export interface PackFile {
  version: number
  kind: 'pack'
  createdAt: number
  app: string
  manifest: PackManifest
  templates: PersistedTemplate[]
  prompts: Prompt[]
  presets: Preset[]
  omitted: { what: string; why: string }[]
  redacted: number
}

function scrub(text: string, tally: { n: number }): string {
  const { text: clean, count } = redactSecrets(text)
  tally.n += count
  return clean
}

/**
 * A preset, field by field. `env` is the one field deliberately left behind:
 * it holds values set on THIS machine (M147's overrides are where a token
 * would sit), and a scrub that matched none of them would still ship them.
 */
function packPreset(p: Preset, tally: { n: number }): Preset {
  return {
    id: p.id,
    name: scrub(p.name, tally),
    cwd: scrub(p.cwd, tally),
    args: p.args.map((a) => scrub(a, tally)),
    ...(p.command === undefined ? {} : { command: scrub(p.command, tally) }),
    ...(p.w === undefined ? {} : { w: p.w }),
    ...(p.h === undefined ? {} : { h: p.h }),
    ...(p.agent === undefined ? {} : { agent: p.agent }),
    ...(p.agentOptions === undefined ? {} : { agentOptions: p.agentOptions }),
    ...(p.worktree === true ? { worktree: true } : {})
  }
}

interface BuildInput {
  manifest: { name: string; version: string; description?: string; credentials?: readonly PackCredential[]; tools?: readonly PackTool[] }
  templates: readonly PersistedTemplate[]
  prompts: readonly Prompt[]
  presets: readonly Preset[]
  app: string
  now: number
  hasRoutines?: boolean
}

export function buildPack(input: BuildInput): PackFile {
  const tally = { n: 0 }
  const templates = input.templates.map((t) => JSON.parse(scrub(JSON.stringify(t), tally)) as PersistedTemplate)
  const prompts = input.prompts.map((q) => ({ id: q.id, name: scrub(q.name, tally), body: scrub(q.body, tally) }))
  const presets = input.presets.map((p) => packPreset(p, tally))
  // Derived from the payload, never typed by the exporter: the list a person
  // reads before agreeing is the list of what will be added.
  const contents: PackContent[] = [
    ...templates.map((t) => ({ kind: 'workflow' as const, id: t.id, name: t.name })),
    ...prompts.map((q) => ({ kind: 'prompt' as const, id: q.id, name: q.name })),
    ...presets.map((p) => ({ kind: 'preset' as const, id: p.id, name: p.name }))
  ]
  const m = input.manifest
  const manifest: PackManifest = {
    name: m.name,
    version: m.version,
    ...(m.description === undefined ? {} : { description: scrub(m.description, tally) }),
    contents,
    // Service and field, rebuilt by name: a caller that handed a value in has
    // nowhere for it to land.
    ...(m.credentials === undefined ? {} : { credentials: m.credentials.map((c) => ({ service: c.service, fields: c.fields.map((f) => ({ id: f.id, label: f.label })) })) }),
    ...(m.tools === undefined ? {} : { tools: m.tools.map((t) => ({ command: t.command, ...(t.why === undefined ? {} : { why: scrub(t.why, tally) }) })) })
  }
  const omitted: { what: string; why: string }[] = []
  if (input.presets.some((p) => p.env !== undefined)) omitted.push({ what: 'every preset\'s environment overrides', why: 'they hold values set on this machine, and a scrub that matched none of them would still send them' })
  if (input.hasRoutines === true) omitted.push({ what: 'every routine', why: 'a routine would schedule itself on the other machine and send messages there' })
  omitted.push({ what: 'every skill', why: 'every agent reads a skill, so writing one is not inert — a pack names the tools it needs and installs none' })
  omitted.push({ what: 'every credential', why: 'this app\'s credentials never leave its own encrypted store — the manifest names which ones the pack needs, never a value' })
  return { version: PACK_VERSION, kind: 'pack', createdAt: input.now, app: input.app, manifest, templates, prompts, presets, omitted, redacted: tally.n }
}

export type PackParse =
  | { kind: 'pack'; pack: PackFile; warnings: string[] }
  | { kind: 'not-a-pack'; reason: string }
  | { kind: 'unknown-version'; found: number; known: number; reason: string }

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function parseContents(raw: unknown, warnings: string[]): PackContent[] {
  if (!Array.isArray(raw)) { warnings.push('the manifest\'s contents were not a list — nothing it names can be shown, so nothing unlisted will be added'); return [] }
  const out: PackContent[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || !isText(entry.id) || !isText(entry.name) || !isText(entry.kind)) { warnings.push('a contents entry was unreadable — left out'); continue }
    // UNKNOWN costs the entry, never the list: a kind a later version carries.
    if (!(PACK_CONTENT_KINDS as readonly string[]).includes(entry.kind)) { warnings.push(`the manifest lists a ${entry.kind} "${entry.name}", which a pack from this version cannot carry — left out`); continue }
    out.push({ kind: entry.kind as PackContentKind, id: entry.id, name: entry.name })
  }
  return out
}

/**
 * A service this app does not know is KEPT: `packRequirements` answers it
 * `unknown-service`. Dropping it here would hide a requirement, and a row that
 * disappears reads as a pack that needs nothing.
 */
function parseCredentials(raw: unknown, warnings: string[]): PackCredential[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warnings.push('the manifest\'s credentials were not a list — none are named'); return undefined }
  const out: PackCredential[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || !isText(entry.service)) { warnings.push('a credential requirement was not an object naming its service — dropped'); continue }
    const fields: PackCredentialField[] = []
    if (!Array.isArray(entry.fields)) warnings.push(`credential ${entry.service}: its fields were not a list`)
    else for (const f of entry.fields) {
      if (!isRecord(f) || !isText(f.id) || !isText(f.label)) { warnings.push(`credential ${entry.service}: a field with no id or label was dropped`); continue }
      fields.push({ id: f.id, label: f.label })
    }
    if (fields.length === 0) { warnings.push(`credential ${entry.service}: no readable field, so it cannot be named — dropped`); continue }
    out.push({ service: entry.service, fields })
  }
  return out
}

function parseTools(raw: unknown, warnings: string[]): PackTool[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warnings.push('the manifest\'s tools were not a list — none are named'); return undefined }
  const out: PackTool[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.command !== 'string') { warnings.push('a tool requirement named no command — dropped'); continue }
    if (!TOOL_COMMAND.test(entry.command)) { warnings.push(`tool "${entry.command}" is not a plain command name — dropped`); continue }
    if (entry.why !== undefined && typeof entry.why !== 'string') warnings.push(`tool ${entry.command}: why was not text — dropped`)
    out.push({ command: entry.command, ...(typeof entry.why === 'string' ? { why: entry.why } : {}) })
  }
  return out
}

/** Three answers, never two: not a pack (named), one from a future version, or one to read. */
export function parsePack(text: string): PackParse {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { kind: 'not-a-pack', reason: 'that file is not JSON — a pack is written by Export pack and ends in .tcpack' } }
  if (!isRecord(raw)) return { kind: 'not-a-pack', reason: 'that file holds no pack — it is JSON, but not a pack file' }
  if (raw.kind === 'canvas' || raw.kind === 'workflow') return { kind: 'not-a-pack', reason: 'that is a canvas file, not a pack — use Import canvas' }
  if (raw.kind !== 'pack' || typeof raw.version !== 'number') return { kind: 'not-a-pack', reason: 'that file names no pack version and kind — it was not written by Export pack' }
  if (raw.version > PACK_VERSION) {
    return { kind: 'unknown-version', found: raw.version, known: PACK_VERSION, reason: `that pack was written by a newer version of this app (pack version ${raw.version}, this app reads ${PACK_VERSION}) — update, or ask for it to be exported again` }
  }
  const m = raw.manifest
  if (!isRecord(m)) return { kind: 'not-a-pack', reason: 'that file has no manifest — a pack says what it holds before anything is added' }
  if (!isText(m.name)) return { kind: 'not-a-pack', reason: 'the manifest\'s name is missing or not text — a pack a person cannot name cannot be agreed to' }
  // Never coerced: 3 is not "3.0.0", and guessing a version is how two packs
  // come to claim the same one.
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) return { kind: 'not-a-pack', reason: `the manifest's version must be text like "1.0.0" — found ${JSON.stringify(m.version)}` }

  const warnings: string[] = []
  for (const key of Object.keys(m)) if (!MANIFEST_KEYS.has(key)) warnings.push(`the manifest's "${key}" is not something this version reads — ignored`)
  if (m.description !== undefined && typeof m.description !== 'string') warnings.push('the manifest\'s description was not text — dropped')
  const listed = parseContents(m.contents, warnings)
  const credentials = parseCredentials(m.credentials, warnings)
  const tools = parseTools(m.tools, warnings)

  // The payloads go through the store's OWN parsers, so a pack can hold
  // nothing the layout file would refuse — and a template's M190 mark reads
  // exactly as it does on disk.
  const payload = (key: string): unknown => {
    if (raw.hasOwnProperty(key) && !Array.isArray(raw[key])) { warnings.push(`the file's ${key} were not a list — none were read`); return [] }
    return raw[key] ?? []
  }
  const templates = parseTemplates(payload('templates'), warnings)
  const prompts = parsePrompts(payload('prompts'), warnings)
  const presets = parsePresets(payload('presets'), warnings)

  // Reconcile the list against the payload. The manifest is what a person
  // reads before agreeing, so it may never under-state what will be added:
  // an item it does not list is NOT added, and one it lists with nothing
  // behind it is taken off the list.
  const byKind: Record<PackContentKind, { id: string; name: string }[]> = { workflow: templates, prompt: prompts, preset: presets }
  const contents = listed.filter((c) => {
    const found = byKind[c.kind].some((o) => o.id === c.id)
    if (!found) warnings.push(`the manifest lists ${c.kind} "${c.name}", which is not in the file — taken off the list`)
    return found
  })
  const isListed = (kind: PackContentKind) => (o: { id: string; name: string }): boolean => {
    const yes = contents.some((c) => c.kind === kind && c.id === o.id)
    if (!yes) warnings.push(`the file carries ${kind} "${o.name}" that its manifest does not list — it will not be added`)
    return yes
  }
  const manifest: PackManifest = {
    name: m.name,
    version: m.version,
    ...(typeof m.description === 'string' ? { description: m.description } : {}),
    contents,
    ...(credentials === undefined ? {} : { credentials }),
    ...(tools === undefined ? {} : { tools })
  }
  return {
    kind: 'pack',
    warnings,
    pack: {
      version: raw.version,
      kind: 'pack',
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
      app: typeof raw.app === 'string' ? raw.app : 'unknown',
      manifest,
      templates: templates.filter(isListed('workflow')),
      prompts: prompts.filter(isListed('prompt')),
      presets: presets.filter(isListed('preset')),
      omitted: Array.isArray(raw.omitted) ? (raw.omitted as unknown[]).filter((o): o is { what: string; why: string } => isRecord(o) && typeof o.what === 'string' && typeof o.why === 'string') : [],
      redacted: typeof raw.redacted === 'number' ? raw.redacted : 0
    }
  }
}

export type CredentialRequirementState = 'connected' | 'rejected' | 'not-connected' | 'unknown-service'
export interface CredentialRequirement { service: string; field: string; label: string; state: CredentialRequirementState; sentence?: string }
export type ToolRequirementState = 'found' | 'missing' | 'unanswered'
export interface ToolRequirement { command: string; state: ToolRequirementState; sentence?: string }
export interface PackRequirements { credentials: CredentialRequirement[]; tools: ToolRequirement[] }

/**
 * One row per credential FIELD, from metadata only — never plaintext, so the
 * store's reader list does not grow. Four states, because "not connected",
 * "connected but rejected" and "this app cannot hold that at all" are three
 * different fixes. Tools answer three ways: a probe that could not run is not
 * a tool that is absent. `connected` and `found` carry no sentence — a
 * zero-value statement is not a rest-layer fact.
 */
export function packRequirements(manifest: PackManifest, metas: readonly CredentialMeta[], tools: Readonly<Record<string, boolean | undefined>>): PackRequirements {
  const credentials: CredentialRequirement[] = []
  for (const c of manifest.credentials ?? []) {
    const service = findService(c.service)
    const meta = metas.find((x) => x.service === c.service)
    for (const f of c.fields) {
      const row = { service: c.service, field: f.id, label: f.label }
      if (service === undefined) credentials.push({ ...row, state: 'unknown-service', sentence: `this app cannot hold a "${c.service}" credential yet — "${f.label}" cannot be connected` })
      else if (meta === undefined) credentials.push({ ...row, state: 'not-connected', sentence: `${service.label} · ${f.label} — ${notConnectedReason(service.label)}` })
      else if (meta.rejectedAt !== undefined) credentials.push({ ...row, state: 'rejected', sentence: `${service.label} · ${f.label} — the stored ${service.label} credential was rejected; replace it in ⌘K › Credentials` })
      else credentials.push({ ...row, state: 'connected' })
    }
  }
  const toolRows: ToolRequirement[] = (manifest.tools ?? []).map((t) => {
    const found = tools[t.command]
    if (found === true) return { command: t.command, state: 'found' }
    if (found === false) return { command: t.command, state: 'missing', sentence: `${t.command} is not on this machine's PATH${t.why === undefined ? '' : ` — the pack uses it because it ${t.why}`}` }
    return { command: t.command, state: 'unanswered', sentence: `could not check for ${t.command} — the probe did not run` }
  })
  return { credentials, tools: toolRows }
}

/**
 * New ids for everything, so adding a pack twice makes two copies rather than
 * one that overwrote the other — and the marks that make an import inert:
 * every workflow AND every preset arrives `reviewed: false`. A prompt is text
 * a person sends by hand, so it carries no mark. `env` is stripped again here
 * because a hand-written pack can carry what our exporter never writes.
 */
export function remapPack(file: PackFile, mint: (prefix: string) => string): PackFile {
  const ids = new Map<string, string>()
  const templates = file.templates.map((t) => { const id = mint('t'); ids.set(`workflow:${t.id}`, id); return { ...t, id, reviewed: false as const } })
  const prompts = file.prompts.map((q) => { const id = mint('q'); ids.set(`prompt:${q.id}`, id); return { id, name: q.name, body: q.body } })
  const presets = file.presets.map((p) => {
    const id = mint('r'); ids.set(`preset:${p.id}`, id)
    const { env: _env, ...rest } = p
    return { ...rest, id, reviewed: false as const }
  })
  const contents = file.manifest.contents.map((c) => ({ ...c, id: ids.get(`${c.kind}:${c.id}`) ?? c.id }))
  return { ...file, manifest: { ...file.manifest, contents }, templates, prompts, presets }
}

/** The sentence an export or an add reports: what is in it, what was scrubbed, what was left. */
export function packSentence(file: PackFile): string {
  const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
  const parts = [count(file.templates.length, 'workflow'), count(file.prompts.length, 'prompt'), count(file.presets.length, 'preset')]
  const scrubbed = file.redacted === 0 ? 'nothing looked like a secret' : `${count(file.redacted, 'secret')} scrubbed`
  return `${file.manifest.name} ${file.manifest.version}: ${parts.join(', ')} · ${scrubbed} · ${count(file.omitted.length, 'thing')} left out (each named in the file)`
}
