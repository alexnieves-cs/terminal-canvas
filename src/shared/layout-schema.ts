import { MIN_PANEL_H, MIN_PANEL_W } from './panel-geometry'
import { SettingValue, settingDef } from './settings-schema'

/**
 * The on-disk layout format, and the one function that reads it.
 *
 * Pure by construction — no fs, no electron, no DOM — which is what lets
 * verify:layout run it under plain node. The store that owns the file lives in
 * main/layout-store.ts and takes its path as a parameter for the same reason.
 *
 * parseLayout NEVER throws. A corrupt or hand-edited file must open a working
 * app, not a dead one, so every failure degrades to a default and names itself
 * in `warnings` instead of propagating.
 */

export const LAYOUT_VERSION = 1

/**
 * PanelId doubles as the tmux session name from M4c (see shared/types.ts), and
 * tmux rejects '.' and ':' in a session name. M4b is where ids first become
 * durable, so this is the last moment the constraint is free rather than a
 * migration of everyone's saved file.
 */
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** Matches useViewport's INITIAL, so "camera restore off" and "fresh app" agree. */
export const DEFAULT_CAMERA = { x: 120, y: 120, scale: 1 }

export const DEFAULT_WORKSPACE_ID = 'w1'

export interface RestoreSettings {
  layout: boolean
  camera: boolean
  focus: boolean
}

export interface PersistedPanel {
  id: string
  x: number
  y: number
  w: number
  h: number
  z: number
  cwd: string
  /** Absent means "the user's login shell" — main resolves it. See PanelSpec. */
  command?: string
  args: string[]
  // PanelSpec.env has NO counterpart here — deliberate, not an oversight.
  // Nothing sets spec.env today, so nothing is lost by the omission yet; but
  // it is a SILENT exclusion, and a later feature that starts setting env
  // (per-panel environment overrides, say) would have those values vanish on
  // every restore with no warning anywhere in this file.
  /**
   * User-set panel name, set from the command palette's rename row and
   * persisted here since M6a (`layout-adapt.ts`'s `fromPanels`/`toPanels`).
   * Reserved back in M4b — ideas-backlog item 6 put titles on Panel before any
   * UI could set one — which is why the field predates its own writer.
   * Readers must still tolerate its absence: most panels remain untitled.
   */
  title?: string
}

/**
 * The id of the built-in login-shell preset, and the fallback whenever a
 * stored defaultPresetId names nothing. Cmd+N doing NOTHING is a worse failure
 * than Cmd+N doing something ordinary, so there is always an answer.
 *
 * The built-in presets themselves are NOT here: they are product defaults, and
 * this file decides what is valid rather than what ships. See main/presets.ts.
 */
export const DEFAULT_PRESET_ID = 'shell'

/**
 * A saved panel definition: everything about a panel that is known before it
 * has a size, plus a name and a default box.
 *
 * `command` is optional for the same reason PanelSpec.command is, and the
 * stakes are higher here because a preset is reused: absent means "the user's
 * login shell", which only main can resolve. Anything that fills it in makes
 * every future spawn from this preset run the wrong program.
 *
 * `w`/`h` are optional because this file must not learn PANEL_W/PANEL_H —
 * those are the renderer's product defaults, and importing them here would
 * drag panel geometry into the format layer.
 */
export interface Preset {
  id: string
  name: string
  cwd: string
  command?: string
  args: string[]
  w?: number
  h?: number
}

/**
 * A saved prompt: text the user pastes into an agent often enough to name.
 *
 * `body` is deliberately unbounded in length — a prompt IS a paragraph — but
 * empty is invalid: a row that pastes nothing looks exactly like a broken
 * insert. Placeholders ({{cwd}} and friends, ideas-backlog #27) are NOT part
 * of this type; they need the read-the-real-cwd machinery #4 owns, and adding
 * the field before the mechanism exists would ship a format promise nothing
 * keeps.
 */
export interface Prompt {
  id: string
  name: string
  body: string
}

export interface PersistedCamera {
  x: number
  y: number
  scale: number
}

/**
 * The flat state the renderer sends and receives. It has no workspace id and
 * no name, because the renderer has no concept of workspaces at all.
 */
export interface CanvasState {
  panels: PersistedPanel[]
  camera: PersistedCamera
  selectedId: string | null
  focusedId: string | null
}

/**
 * One canvas. M4b always has exactly one and never surfaces the concept to the
 * renderer. The dimension exists in the FORMAT only, per ideas-backlog item 2:
 * a file written as one flat record of panels makes named workspaces a
 * migration, and one written as a keyed collection makes them nearly free.
 */
export interface Workspace extends CanvasState {
  id: string
  name: string
}

export interface LayoutSnapshot {
  version: number
  activeWorkspaceId: string
  workspaces: Workspace[]
  settings: RestoreSettings
  /** User-created presets only. The built-ins are code; see main/presets.ts. */
  presets: Preset[]
  /** What Cmd+N spawns. May name a built-in or a user preset. */
  defaultPresetId: string
  /**
   * The saved store only; `.claude/commands` is read live, never persisted
   * here — see main/prompts.ts.
   */
  prompts: Prompt[]
  /**
   * Every setting the user has actually CHANGED, keyed by SettingDef.id.
   * Sparse on purpose: an absent id means "still at the schema default", which
   * is what stops this map growing an entry per toggle per user and what lets
   * a default be changed later without rewriting anyone's file.
   */
  preferences: Record<string, SettingValue>
}

export function defaultSettings(): RestoreSettings {
  return { layout: true, camera: true, focus: true }
}

export function defaultWorkspace(): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Canvas',
    panels: [],
    camera: { ...DEFAULT_CAMERA },
    selectedId: null,
    focusedId: null
  }
}

/**
 * An EMPTY canvas, not a first-run one. The format layer decides what is
 * VALID; it does not decide product defaults, which would drag PANEL_W/PANEL_H
 * into shared/ behind it. The renderer supplies firstRunPanels() when it
 * receives no panels.
 */
export function defaultSnapshot(): LayoutSnapshot {
  return {
    version: LAYOUT_VERSION,
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaces: [defaultWorkspace()],
    settings: defaultSettings(),
    presets: [],
    defaultPresetId: DEFAULT_PRESET_ID,
    prompts: [],
    // Empty means "everything at its schema default" — exactly what a default
    // snapshot is.
    preferences: {}
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function parsePanel(
  raw: unknown,
  seen: Set<string>,
  warnings: string[]
): PersistedPanel | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a panel that was not an object')
    return null
  }
  const { id, x, y, w, h, z, cwd, command, args, title } = raw
  if (!isStr(id) || !ID_PATTERN.test(id)) {
    warnings.push(`dropped a panel with an unusable id: ${JSON.stringify(id)}`)
    return null
  }
  if (seen.has(id)) {
    // Two panels sharing an id is the only failure in this file with NO
    // visible symptom: registry.ensure returns the existing session, so both
    // render one handle.host, which can live in exactly one slot.
    warnings.push(`dropped a duplicate panel id: ${id}`)
    return null
  }
  if (!isNum(x) || !isNum(y) || !isNum(w) || !isNum(h) || !isNum(z)) {
    warnings.push(`dropped panel ${id}: a coordinate was not a finite number`)
    return null
  }
  if (!isStr(cwd)) {
    warnings.push(`dropped panel ${id}: cwd was not a string`)
    return null
  }
  if (!Array.isArray(args) || !args.every(isStr)) {
    warnings.push(`dropped panel ${id}: args was not an array of strings`)
    return null
  }
  seen.add(id)
  const panel: PersistedPanel = {
    id,
    x,
    y,
    // Clamped rather than dropped: the geometry is recoverable, and losing the
    // panel is a worse answer than resizing it.
    w: Math.max(MIN_PANEL_W, w),
    h: Math.max(MIN_PANEL_H, h),
    z,
    cwd,
    args: [...args]
  }
  if (isStr(command)) panel.command = command
  if (isStr(title)) panel.title = title
  return panel
}

function parsePreset(raw: unknown, seen: Set<string>, warnings: string[]): Preset | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a preset that was not an object')
    return null
  }
  const { id, name, cwd, command, args, w, h } = raw
  if (!isStr(id) || !ID_PATTERN.test(id)) {
    warnings.push(`dropped a preset with an unusable id: ${JSON.stringify(id)}`)
    return null
  }
  if (seen.has(id)) {
    warnings.push(`dropped a duplicate preset id: ${id}`)
    return null
  }
  if (!isStr(cwd)) {
    warnings.push(`dropped preset ${id}: cwd was not a string`)
    return null
  }
  if (!Array.isArray(args) || !args.every(isStr)) {
    warnings.push(`dropped preset ${id}: args was not an array of strings`)
    return null
  }
  seen.add(id)
  // Name falls back to the id rather than dropping the entry: an unnamed
  // preset is usable, and losing a saved spawn over a missing label is not.
  const preset: Preset = { id, name: isStr(name) ? name : id, cwd, args: [...args] }
  // Absent stays absent. Assigning a default here is the single most damaging
  // change anyone could make to this file — see the note on Preset.command.
  if (isStr(command)) preset.command = command
  // Clamped rather than dropped, the same trade parsePanel makes: the geometry
  // is recoverable and losing the preset is the worse answer.
  if (isNum(w)) preset.w = Math.max(MIN_PANEL_W, w)
  if (isNum(h)) preset.h = Math.max(MIN_PANEL_H, h)
  return preset
}

/** Never throws; drops entries individually, like every other parser here. */
export function parsePresets(raw: unknown, warnings: string[]): Preset[] {
  // ABSENT is not corruption — every file written before M5a has no presets
  // key, and warning about those would make the first launch after an upgrade
  // shout about a file that is perfectly fine (verify:layout 32).
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    // PRESENT but unusable is corruption, and the silent version of this line
    // is the exact failure parseLayout's design note exists to prevent: a
    // hand-edited `"presets": {}` drops every saved preset, and the user's
    // only evidence is that the Presets menu got shorter.
    warnings.push('replaced a presets field that was not an array')
    return []
  }
  const seen = new Set<string>()
  return raw
    .map((p) => parsePreset(p, seen, warnings))
    .filter((p): p is Preset => p !== null)
}

/**
 * The same ABSENT-vs-MALFORMED line parsePresets draws.
 *
 * A dropped entry costs that setting and nothing else — the same
 * drop-individually rule the rest of this file obeys — and every drop warns,
 * because the silent version of this function is a preference the user
 * deliberately set that quietly stopped applying, with nothing anywhere
 * saying why.
 */
export function parsePreferences(
  raw: unknown,
  warnings: string[]
): Record<string, SettingValue> {
  // Every file written before M6b has no preferences key. Warning about those
  // would make the first launch after an upgrade shout about a file that is
  // perfectly fine — the same reason parsePresets returns [] silently here.
  if (raw === undefined) return {}
  if (!isRecord(raw)) {
    warnings.push('replaced a preferences field that was not an object')
    return {}
  }
  const out: Record<string, SettingValue> = {}
  for (const [id, value] of Object.entries(raw)) {
    const def = settingDef(id)
    if (def === undefined) {
      // A setting this build does not know about. Dropping it is right —
      // carrying it forward would let a typo persist forever — but it MUST
      // warn, because this is also what a renamed id looks like.
      warnings.push(`dropped an unknown setting: ${id}`)
      continue
    }
    if (typeof value !== def.type) {
      warnings.push(`dropped setting ${id}: expected ${def.type}, got ${typeof value}`)
      continue
    }
    out[id] = value as SettingValue
  }
  return out
}

function parsePrompt(raw: unknown, seen: Set<string>, warnings: string[]): Prompt | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a prompt that was not an object')
    return null
  }
  const { id, name, body } = raw
  if (!isStr(id) || !ID_PATTERN.test(id)) {
    warnings.push(`dropped a prompt with an unusable id: ${JSON.stringify(id)}`)
    return null
  }
  if (seen.has(id)) {
    warnings.push(`dropped a duplicate prompt id: ${id}`)
    return null
  }
  if (!isStr(body) || body === '') {
    warnings.push(`dropped prompt ${id}: body was empty or not a string`)
    return null
  }
  seen.add(id)
  // Name falls back to the id, the same trade parsePreset makes: an unnamed
  // prompt is usable, and losing saved text over a missing label is not.
  return { id, name: isStr(name) ? name : id, body }
}

/** Never throws; drops entries individually, like every other parser here. */
export function parsePrompts(raw: unknown, warnings: string[]): Prompt[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a prompts field that was not an array')
    return []
  }
  const seen = new Set<string>()
  return raw
    .map((p) => parsePrompt(p, seen, warnings))
    .filter((p): p is Prompt => p !== null)
}

function parseCamera(raw: unknown, warnings: string[]): PersistedCamera {
  if (!isRecord(raw) || !isNum(raw.x) || !isNum(raw.y) || !isNum(raw.scale) || raw.scale <= 0) {
    // A zero or negative scale is not cosmetic: screenToWorld divides by it,
    // so every coordinate becomes Infinity or NaN and the canvas is dead with
    // no error raised anywhere.
    warnings.push('replaced an unusable camera')
    return { ...DEFAULT_CAMERA }
  }
  return { x: raw.x, y: raw.y, scale: raw.scale }
}

function parseWorkspace(raw: unknown, index: number, warnings: string[]): Workspace | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped workspace ${index}: not an object`)
    return null
  }
  const id = isStr(raw.id) && ID_PATTERN.test(raw.id) ? raw.id : `w${index + 1}`
  const name = isStr(raw.name) ? raw.name : 'Canvas'
  const seen = new Set<string>()
  const panels = (Array.isArray(raw.panels) ? raw.panels : [])
    .map((p) => parsePanel(p, seen, warnings))
    .filter((p): p is PersistedPanel => p !== null)

  // A selection naming a panel that did not survive validation would leave
  // focus pointing at nothing — and assignTiers pins the focused id live.
  const pick = (v: unknown): string | null => (isStr(v) && seen.has(v) ? v : null)

  return {
    id,
    name,
    panels,
    camera: parseCamera(raw.camera, warnings),
    selectedId: pick(raw.selectedId),
    focusedId: pick(raw.focusedId)
  }
}

function parseSettings(raw: unknown): RestoreSettings {
  // Default ON, and coerced: a hand-edited `"yes"` must not become a value the
  // menu renders as some third state.
  const r = isRecord(raw) ? raw : {}
  const flag = (v: unknown): boolean => (typeof v === 'boolean' ? v : true)
  return { layout: flag(r.layout), camera: flag(r.camera), focus: flag(r.focus) }
}

/**
 * `futureVersion` is a third field the design spec does not name. The store
 * has to know whether to back the file up before overwriting it, and the only
 * alternative — string-matching a warning message — would make a log line
 * load-bearing.
 */
export function parseLayout(raw: string): {
  snapshot: LayoutSnapshot
  warnings: string[]
  futureVersion: boolean
} {
  const warnings: string[] = []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    warnings.push('layout file was not valid JSON; starting from defaults')
    return { snapshot: defaultSnapshot(), warnings, futureVersion: false }
  }

  if (!isRecord(parsed)) {
    warnings.push('layout file was not an object; starting from defaults')
    return { snapshot: defaultSnapshot(), warnings, futureVersion: false }
  }

  if (isNum(parsed.version) && parsed.version > LAYOUT_VERSION) {
    warnings.push(
      `layout file is version ${parsed.version}, newer than ${LAYOUT_VERSION}; not read`
    )
    return { snapshot: defaultSnapshot(), warnings, futureVersion: true }
  }

  const workspaces = (Array.isArray(parsed.workspaces) ? parsed.workspaces : [])
    .map((w, i) => parseWorkspace(w, i, warnings))
    .filter((w): w is Workspace => w !== null)

  if (workspaces.length === 0) {
    warnings.push('layout file had no usable workspace; starting from an empty one')
    workspaces.push(defaultWorkspace())
  }

  const requested = parsed.activeWorkspaceId
  const activeWorkspaceId =
    isStr(requested) && workspaces.some((w) => w.id === requested)
      ? requested
      : workspaces[0].id

  const preferences = parsePreferences(parsed.preferences, warnings)
  // MIGRATION. A file written before M6b has `settings` and no `preferences`,
  // and its three booleans are the schema's first three entries. Seeding them
  // here — rather than leaving them to the defaults — is what stops an upgrade
  // silently resetting a user's restore preferences, which would be
  // indistinguishable from the app ignoring them. Only ids the preferences map
  // does not already carry are seeded, so once written the new key wins.
  //
  // Guarded on `parsed.settings !== undefined` (deviating from a literal read
  // of the migration, which would call parseSettings unconditionally):
  // parseSettings applies ITS OWN defaults for a missing `settings` key, so an
  // unconditional seed would write three redundant `true` entries into every
  // file that never had a `settings` key at all — every fresh install, forever
  // — making the map non-sparse and freezing those three defaults in place for
  // files that hold no actual user choice to preserve.
  if (parsed.settings !== undefined) {
    const legacy = parseSettings(parsed.settings)
    for (const [key, id] of [
      ['layout', 'restore.layout'],
      ['camera', 'restore.camera'],
      ['focus', 'restore.focus']
    ] as const) {
      if (!(id in preferences)) preferences[id] = legacy[key]
    }
  }

  return {
    snapshot: {
      version: LAYOUT_VERSION,
      activeWorkspaceId,
      workspaces,
      settings: parseSettings(parsed.settings),
      presets: parsePresets(parsed.presets, warnings),
      // Only the FORMAT is checked here — whether it is a plausible id at all.
      // Whether it names a preset that exists is main's question, because only
      // main knows the built-ins; resolveDefault answers it there.
      defaultPresetId:
        isStr(parsed.defaultPresetId) && ID_PATTERN.test(parsed.defaultPresetId)
          ? parsed.defaultPresetId
          : DEFAULT_PRESET_ID,
      prompts: parsePrompts(parsed.prompts, warnings),
      preferences
    },
    warnings,
    futureVersion: false
  }
}
