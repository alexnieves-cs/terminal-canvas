import { MIN_PANEL_H, MIN_PANEL_W } from './panel-geometry'
import { SettingValue, settingDef } from './settings-schema'
import type { ReviewBaseline, ReviewSubject } from './review'
import type { FileSource } from './file-panel'
import type { ToolboxSource } from './toolbox'
import {
  AGENT_KINDS,
  EFFORTS,
  MODEL_PATTERN,
  PERMISSION_MODES,
  type AgentKind,
  type AgentOptions,
  type Effort,
  type PermissionMode
} from './cost'

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

export interface PersistedPanelBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  z: number
  /**
   * User-set panel name, set from the command palette's rename row and
   * persisted here since M6a (`layout-adapt.ts`'s `fromPanels`/`toPanels`).
   * Reserved back in M4b — ideas-backlog item 6 put titles on Panel before any
   * UI could set one — which is why the field predates its own writer.
   * Readers must still tolerate its absence: most panels remain untitled.
   */
  title?: string
  /**
   * Outgoing links, M13 — see PanelLink in renderer/panels/panels.ts, and note
   * the name: backlog #24 calls these edges, the code does not, because
   * EdgeIndicators already means the off-screen attention pip.
   *
   * OPTIONAL, and absent means none — which is every layout.json ever written,
   * so a reader that treated absence as corruption would warn once per panel
   * on every existing file. A PRESENT but malformed value warns and is
   * replaced, the line parsePresets and parseBaselines already draw: a
   * silently vanished field is a user's work gone with nothing said.
   */
  links?: { to: string; label?: string }[]
}

export interface PersistedTerminalPanel extends PersistedPanelBase {
  /**
   * OPTIONAL, and absent means 'terminal'. Every layout.json ever written
   * predates this field, and parsePanel drops entries individually — so a
   * required discriminant would not fail loudly, it would quietly empty
   * every existing canvas the first time a user launched the new build.
   * Writers still EMIT it (fromPanels), so files written from M9b onward are
   * explicit; only readers tolerate its absence.
   */
  kind?: 'terminal'
  cwd: string
  /** Absent means "the user's login shell" — main resolves it. See PanelSpec. */
  command?: string
  // PanelSpec.env has NO counterpart here — deliberate, not an oversight.
  // Nothing sets spec.env today, so nothing is lost by the omission yet; but
  // it is a SILENT exclusion, and a later feature that starts setting env
  // (per-panel environment overrides, say) would have those values vanish on
  // every restore with no warning anywhere in this file.
  args: string[]
  /**
   * Which agent CLI this panel is pinned to, mirroring Preset.agent. OPTIONAL,
   * and absent means "not accounted for" — every layout.json before M17 has no
   * such field, and a required one would drop every existing panel. Without
   * this field surviving a write-then-reopen, main's PtyManager goes on
   * accumulating and sending usage:panel for a panel whose restored
   * spec.agent is undefined, and buildInspectorModel's `pinned` test silently
   * fails — the Cost section vanishes on every restart even though main is
   * still measuring it.
   */
  agent?: AgentKind
  /**
   * The spawn-time knobs for that agent CLI. Absent means the CLI's own
   * defaults, which is every panel and preset written before M20.
   */
  agentOptions?: AgentOptions
}

export interface PersistedReviewPanel extends PersistedPanelBase {
  kind: 'review'
  /**
   * The whole subject, not a panel id. See ReviewSubject in shared/review.ts:
   * a node outlives the panel it reviews, whose baseline main drops on kill.
   */
  subject: ReviewSubject
}

export interface PersistedFilePanel extends PersistedPanelBase {
  kind: 'file'
  /**
   * Always absolute. See FileSource: nothing expands `~` for a file panel's
   * path, so a `~`-prefixed one (e.g. hand-edited into this file) fails
   * safely as `missing` rather than resolving.
   */
  source: FileSource
}
export interface PersistedJiraPanel extends PersistedPanelBase { kind: 'jira' }

/**
 * M21's toolbox node. Like a review node and a file panel, it carries NO cwd
 * and NO args of its own on this record — its `source.cwd` is the directory it
 * describes, which is a different field with a different meaning.
 */
export interface PersistedToolboxPanel extends PersistedPanelBase {
  kind: 'toolbox'
  source: ToolboxSource
}

export type PersistedPanel =
  | PersistedTerminalPanel
  | PersistedReviewPanel
  | PersistedFilePanel
  | PersistedJiraPanel
  | PersistedToolboxPanel

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
  /** Which agent CLI this launches, when this app can account for it. */
  agent?: AgentKind
  /**
   * The spawn-time knobs for that agent CLI. Absent means the CLI's own
   * defaults, which is every panel and preset written before M20.
   */
  agentOptions?: AgentOptions
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
  /**
   * LEGACY READ PATH ONLY. Populated by parseLayout from a pre-M6b file's
   * `settings` key so that upgrade migrates it into `preferences` once — it is
   * never written by this app again (layout-store.ts's writeNow strips it
   * before serialising) and is never the source of truth for anything.
   * `preferences`, via settings-schema.ts's `resolveSetting`, is the real
   * answer; reading this field directly gets you the stale pre-migration
   * value.
   */
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
  /**
   * Per-panel review baselines, keyed by PanelId.
   *
   * A SIBLING of `workspaces` rather than a member of one, because PanelId is
   * global rather than per-workspace — M7's rule, and for M7's reason: the id
   * doubles as a tmux session name, so one id means one panel across the whole
   * install.
   */
  baselines: Record<string, ReviewBaseline>
  /**
   * Per-panel agent session ids, keyed by PanelId. See parseSessions for why
   * this is persisted rather than re-minted at each spawn.
   */
  sessions: Record<string, string>
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
    preferences: {},
    baselines: {},
    sessions: {}
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function parseReviewSubject(raw: unknown, id: string, warnings: string[]): ReviewSubject | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped review panel ${id}: subject was not an object`)
    return null
  }
  const { subjectId, repoRoot, baselineSha, label } = raw
  // All four are required. A subject missing any one of them cannot ask git
  // its question, and a node that renders a heading over a permanently empty
  // body is worse than a node that was never restored: it looks like the
  // feature is broken rather than like the file was.
  if (!isStr(subjectId) || !ID_PATTERN.test(subjectId)) {
    warnings.push(`dropped review panel ${id}: subject id was unusable`)
    return null
  }
  if (!isStr(repoRoot) || !isStr(baselineSha) || !isStr(label)) {
    warnings.push(`dropped review panel ${id}: subject was incomplete`)
    return null
  }
  return { subjectId, repoRoot, baselineSha, label }
}

/**
 * Entries are dropped INDIVIDUALLY — the per-entry tolerance parseLayout gives
 * a malformed panel. One bad link costs that link, not the panel's whole set.
 *
 * A self-link and a duplicate are both refused at creation by addLink; a
 * hand-edited file is the other door onto them, and each fails visibly badly
 * (a self-link renders nothing at all, since linkAnchors answers null for
 * coincident centres; a duplicate paints two identical overlapping paths, so
 * the canvas looks like it holds one link while holding two). Both are
 * therefore dropped here as well as refused there.
 *
 * This does NOT check that `to` names a real panel — it cannot, because it
 * runs per panel and the surviving set is not known until every panel has
 * parsed. parseWorkspace does that second pass. verify:layout 110, 111.
 */
function parseLinks(
  raw: unknown,
  id: string,
  warnings: string[]
): { to: string; label?: string }[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    warnings.push(`dropped panel ${id}'s links: not an array`)
    return undefined
  }
  const out: { to: string; label?: string }[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!isRecord(entry) || !isStr(entry.to) || !ID_PATTERN.test(entry.to)) {
      warnings.push(`dropped a link on panel ${id}: target was unusable`)
      continue
    }
    if (entry.to === id) {
      warnings.push(`dropped a link on panel ${id}: a panel cannot link to itself`)
      continue
    }
    if (seen.has(entry.to)) {
      warnings.push(`dropped a duplicate link on panel ${id}: ${entry.to}`)
      continue
    }
    seen.add(entry.to)
    out.push({ to: entry.to, ...(isStr(entry.label) ? { label: entry.label } : {}) })
  }
  // Undefined rather than [], so a panel whose links were all dropped
  // serialises identically to one that never had any — the same
  // absence-is-not-emptiness rule pruneLinksTo obeys on the renderer side.
  return out.length === 0 ? undefined : out
}

/**
 * All-or-drop, no defaulting — parseFileSource's rule: a node pointed at a
 * guessed directory is worse than one that was not restored, because it looks
 * like it worked.
 */
function parseToolboxSource(raw: unknown, id: string, warnings: string[]): ToolboxSource | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped toolbox panel ${id}: source was not an object`)
    return null
  }
  const { cwd, label } = raw
  if (!isStr(cwd) || cwd === '') {
    warnings.push(`dropped toolbox panel ${id}: source cwd was unusable`)
    return null
  }
  return { cwd, label: isStr(label) ? label : cwd }
}

function parseFileSource(raw: unknown, id: string, warnings: string[]): FileSource | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped file panel ${id}: source was not an object`)
    return null
  }
  const { path } = raw
  // All-or-drop, like parseReviewSubject. There is no defaulting a path: a
  // panel pointed at a guessed file is worse than a panel that was not
  // restored, because it looks like it worked.
  if (!isStr(path) || path === '') {
    warnings.push(`dropped file panel ${id}: source path was unusable`)
    return null
  }
  return { path }
}

function parsePanel(
  raw: unknown,
  seen: Set<string>,
  warnings: string[]
): PersistedPanel | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a panel that was not an object')
    return null
  }
  const { id, x, y, w, h, z, cwd, command, args, title, agent, agentOptions } = raw
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
  seen.add(id)

  const base = {
    id,
    x,
    y,
    // Clamped rather than dropped: the geometry is recoverable, and losing the
    // panel is a worse answer than resizing it.
    w: Math.max(MIN_PANEL_W, w),
    h: Math.max(MIN_PANEL_H, h),
    z,
    ...(isStr(title) ? { title } : {}),
    ...(() => {
      const links = parseLinks(raw.links, id, warnings)
      // Absence is PRESERVED, not normalised to an empty array — the same rule
      // the `kind` and `command` reads below obey, and for the same reason.
      return links === undefined ? {} : { links }
    })()
  }

  // ABSENT is terminal — the whole file's compatibility rule. A PRESENT but
  // unrecognised kind is dropped instead, and the difference is deliberate:
  // absence is a historical fact about every file written before M9b, while
  // "kind": "tree" is a file from a LATER version of this app, and reading
  // it as a terminal panel would spawn a process for a node that never
  // asked for one — out of a record that carries no cwd and no args.
  const { kind } = raw
  if (kind === 'review') {
    const subject = parseReviewSubject((raw as Record<string, unknown>).subject, id, warnings)
    if (subject === null) return null
    return { ...base, kind: 'review', subject }
  }
  if (kind === 'file') {
    const source = parseFileSource((raw as Record<string, unknown>).source, id, warnings)
    if (source === null) return null
    return { ...base, kind: 'file', source }
  }
  if (kind === 'jira') return { ...base, kind: 'jira' }
  if (kind === 'toolbox') {
    const source = parseToolboxSource(raw.source, id, warnings)
    if (source === null) return null
    return { ...base, kind: 'toolbox', source }
  }
  if (kind !== undefined && kind !== 'terminal') {
    warnings.push(`dropped panel ${id}: unrecognised kind ${JSON.stringify(kind)}`)
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
  const panel: PersistedTerminalPanel = {
    ...base,
    // Absence is preserved, not normalised: this is a READER, and a file
    // written before M9b never had a `kind` key at all. `fromPanels` is the
    // WRITER that makes it explicit going forward; echoing it back here would
    // make every parsed pre-M9b panel look, to the next reader, as though the
    // key had always been present.
    ...(kind === 'terminal' ? { kind: 'terminal' as const } : {}),
    cwd,
    args: [...args]
  }
  if (isStr(command)) panel.command = command
  // Present but unknown is the same asymmetry parsePreset draws for its own
  // agent field: a later version wrote a value this one has never heard of,
  // and the field is dropped with a warning rather than carried into the map
  // or silently coerced away.
  if (agent !== undefined && !(AGENT_KINDS as readonly string[]).includes(agent as string)) {
    warnings.push(`panel ${id} named an unknown agent; dropped that field`)
  }
  if (isStr(agent) && (AGENT_KINDS as readonly string[]).includes(agent)) {
    panel.agent = agent as AgentKind
  }
  const panelOptions = parseAgentOptions(agentOptions, `panel ${id}`, warnings)
  if (panelOptions !== undefined) panel.agentOptions = panelOptions
  return panel
}

/**
 * The agent knobs a panel or a preset carries, validated per FIELD.
 *
 * ONE function rather than a block pasted into parsePanel and parsePreset,
 * because two parsers for one format agree on the day they are written and
 * drift the first time only one of them is edited — the copy-paste-one-of-two
 * this file's shape invites, and the exact gap M17's fix round found when
 * Preset.agent was guarded and PanelSpec.agent was not.
 *
 * Every arm drops the FIELD and keeps its siblings, never the whole record and
 * never the whole panel: that is `parseLayout`'s individual-drop rule applied
 * one level down, and for mode and effort it also fails SAFE, since the CLI's
 * own default is more restrictive than any value we failed to recognise.
 *
 * Returns undefined when nothing valid survives, so an absent record is never
 * spelled `{}` — `'agentOptions' in preset` has to keep answering false for a
 * preset that never carried one.
 */
export function parseAgentOptions(
  raw: unknown,
  label: string,
  warnings: string[]
): AgentOptions | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw)) {
    warnings.push(`${label} had a malformed agentOptions; dropped it`)
    return undefined
  }
  const { permissionMode, effort, model } = raw
  const out: AgentOptions = {}

  if (permissionMode !== undefined) {
    if (isStr(permissionMode) && (PERMISSION_MODES as readonly string[]).includes(permissionMode)) {
      out.permissionMode = permissionMode as PermissionMode
    } else {
      warnings.push(`${label} named an unknown permissionMode; dropped that field`)
    }
  }

  if (effort !== undefined) {
    if (isStr(effort) && (EFFORTS as readonly string[]).includes(effort)) {
      out.effort = effort as Effort
    } else {
      warnings.push(`${label} named an unknown effort; dropped that field`)
    }
  }

  if (model !== undefined) {
    if (isStr(model) && MODEL_PATTERN.test(model)) {
      out.model = model
    } else if (isStr(model) && model.startsWith('-')) {
      // Its OWN warning, deliberately not merged into the generic malformed
      // one below. There is no shell on this path, so this is not injection —
      // args reach node-pty as an argv array and tmux execs the multi-argument
      // new-session form directly. The surface is `claude`'s own parser: a
      // leading dash makes the value a FLAG rather than --model's operand, and
      // layout.json and presets are both shareable artifacts. Someone reading
      // a log after a surprising spawn needs to see that distinction.
      warnings.push(
        `${label} gave a model that looks like a flag (${model}); dropped that field`
      )
    } else {
      warnings.push(`${label} gave an unusable model; dropped that field`)
    }
  }

  return out.permissionMode === undefined && out.effort === undefined && out.model === undefined
    ? undefined
    : out
}

function parsePreset(raw: unknown, seen: Set<string>, warnings: string[]): Preset | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a preset that was not an object')
    return null
  }
  const { id, name, cwd, command, args, w, h, agent, agentOptions } = raw
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
  // Present but unknown is check 107's asymmetry: it was written by a
  // version that knew an adapter this one does not, and honouring it means
  // passing a flag to a CLI that has never heard of it — which fails the
  // spawn outright rather than merely failing to account.
  if (agent !== undefined && !(AGENT_KINDS as readonly string[]).includes(agent as string)) {
    warnings.push(`preset ${id} named an unknown agent; dropped that field`)
  }
  if (isStr(agent) && (AGENT_KINDS as readonly string[]).includes(agent)) {
    preset.agent = agent as AgentKind
  }
  const presetOptions = parseAgentOptions(agentOptions, `preset ${id}`, warnings)
  if (presetOptions !== undefined) preset.agentOptions = presetOptions
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
/**
 * M23a. The three region booleans the navigator pane replaces.
 *
 * They are RETIRED rather than deleted, and the difference is the whole reason
 * this array exists: a retired id is one this build RECOGNISES and migrates,
 * so it must not fall into parsePreferences' unknown-id branch, which would
 * warn `dropped an unknown setting` about a value that was in fact carried
 * forward — a message that is not merely noisy but false, and false in the one
 * direction that sends somebody looking for a bug that is not there.
 */
const RETIRED_REGION_IDS: readonly string[] = [
  'shell.railOpen',
  'shell.inspectorOpen',
  'files.treeOpen'
]

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
  const legacy: Record<string, boolean> = {}
  for (const [id, value] of Object.entries(raw)) {
    // M23a. Retired ids are recognised and set aside for the migration below,
    // BEFORE the unknown-id branch can warn about them. A non-boolean value
    // for one of these is simply not carried: there is nothing to migrate,
    // and the id is gone from the schema, so there is no def to complain on
    // behalf of.
    if (RETIRED_REGION_IDS.includes(id)) {
      if (typeof value === 'boolean') legacy[id] = value
      continue
    }
    const def = settingDef(id)
    if (def === undefined) {
      // A setting this build does not know about. Dropping it is right —
      // carrying it forward would let a typo persist forever — but it MUST
      // warn, because this is also what a renamed id looks like.
      warnings.push(`dropped an unknown setting: ${id}`)
      continue
    }
    // SettingDef['type'] tracks what `typeof` can actually answer, so this
    // comparison is meaningful for every declared type.
    if (typeof value !== def.type) {
      warnings.push(`dropped setting ${id}: expected ${def.type}, got ${typeof value}`)
      continue
    }
    // The write path (layout-store.ts's setPreference) enforces min/max, but
    // this file is the OTHER door into the same map — a hand-edited
    // layout.json, one synced from another machine, or plain corruption never
    // goes through setPreference at all. A guard on one door only is a guard
    // with a hole in it: an out-of-range agent.idleAfterMs loaded here would
    // reach resolveSetting and the feature exactly as if setPreference had
    // approved it. Dropping with a warning — never clamping — is the same
    // rule the type check above already enforces, for the same reason: a
    // silently-coerced value is a preference the user (or their sync) set
    // that stopped applying, with nothing anywhere saying why.
    if (def.type === 'number' && typeof value === 'number') {
      if ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max)) {
        warnings.push(`dropped setting ${id}: ${value} is outside [${def.min}, ${def.max}]`)
        continue
      }
    }
    // M23a. The same rule one type across: a `string` def declares its
    // permitted values, and a value outside them is DROPPED with a warning
    // rather than coerced to the default — for the reason the block above
    // states at length, and which applies here unchanged.
    //
    // The warning names the PERMITTED VALUES rather than only the id, and that
    // is load-bearing rather than friendly: an unknown id is dropped four
    // lines up with a warning that also names the id, so a message carrying
    // only the id cannot distinguish "this build has never heard of this
    // setting" from "this build knows it and refused this value" — two facts
    // with two different fixes. It is also the only thing that lets a check
    // tell the two branches apart (verify:layout 152).
    if (def.type === 'string' && typeof value === 'string') {
      if (def.values !== undefined && !def.values.includes(value)) {
        warnings.push(`dropped setting ${id}: ${value} is not one of ${def.values.join('/')}`)
        continue
      }
    }
    out[id] = value as SettingValue
  }

  // M23a MIGRATION. The three region booleans collapse onto shell.navigatorPane
  // and shell.contextOpen. Seeded here rather than dropped, because a stored
  // preference that vanishes is one the user set that stopped applying with
  // nothing saying why — the same argument the pre-M6b settings->preferences
  // migration in parseLayout makes, and the same guard: seeded ONLY where a
  // legacy key was actually PRESENT.
  //
  // That guard is the whole mechanism and not a tidiness measure. The
  // preferences map is sparse ON PURPOSE — an absent id means "still at the
  // schema default", which is what lets a default change later and reach
  // people — so writing a value for a file that held no choice to preserve
  // makes every fresh install explicit on its first launch and freezes these
  // two defaults in place forever. parseLayout's own migration records having
  // to deviate from a literal reading for exactly this reason.
  //
  // A value already present under the NEW id always wins: once written, the
  // new key is the answer and the legacy one is history.
  if (out['shell.navigatorPane'] === undefined) {
    // Precedence is the order the old shell rendered in, left to right. A user
    // with BOTH the tree and the rail open had two resident columns and now
    // gets one, and the leftmost is the one they would look for first.
    if (legacy['files.treeOpen'] === true) out['shell.navigatorPane'] = 'files'
    else if (legacy['shell.railOpen'] === true) out['shell.navigatorPane'] = 'panels'
    // Deliberately closed, rather than never touched. This branch is NOT in
    // the plan and is the difference between migrating a preference and
    // migrating only the convenient half of one: a user who explicitly closed
    // the rail and never opened the tree gets 'none', where falling through to
    // absent would resolve to the 'panels' default and re-open a column they
    // had shut. `=== false` and not `!== true`, so an ABSENT key still falls
    // through to absent and the sparse rule above holds.
    else if (legacy['shell.railOpen'] === false) out['shell.navigatorPane'] = 'none'
  }
  if (out['shell.contextOpen'] === undefined && legacy['shell.inspectorOpen'] !== undefined) {
    out['shell.contextOpen'] = legacy['shell.inspectorOpen']
  }

  return out
}

/**
 * The same ABSENT-vs-MALFORMED line parsePresets and parsePreferences draw.
 *
 * Baselines are keyed by PanelId GLOBALLY (a sibling of `workspaces` rather
 * than a member of one — see LayoutSnapshot.baselines), so each entry is
 * dropped INDIVIDUALLY rather than the whole map failing together: one panel
 * with a malformed baseline costs that panel's review history, not
 * everyone's.
 */
export function parseBaselines(
  raw: unknown,
  warnings: string[]
): Record<string, ReviewBaseline> {
  // Every file written before M9a has no baselines key. Warning about those
  // would make the first launch after an upgrade shout about a file that is
  // perfectly fine — the same reason parsePresets/parsePreferences return
  // empty silently here.
  if (raw === undefined) return {}
  if (!isRecord(raw)) {
    // Present but wrong warns rather than vanishing: a silently dropped map
    // is a user's whole review history gone with nothing said.
    warnings.push('baselines was not an object; ignoring it')
    return {}
  }
  const out: Record<string, ReviewBaseline> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id)) {
      warnings.push(`baseline for ${id} has an unusable panel id; dropped`)
      continue
    }
    if (!isRecord(value) || !isStr(value.root) || !isStr(value.sha)) {
      warnings.push(`baseline for ${id} was malformed; dropped`)
      continue
    }
    out[id] = { root: value.root, sha: value.sha }
  }
  return out
}

/**
 * Which agent session id each panel is pinned to, keyed by PanelId.
 *
 * A sibling of `workspaces` rather than a member of one, and keyed GLOBALLY,
 * for the reason baselines is: PanelId is global (it doubles as a tmux session
 * name), and a hidden workspace's panel holds a pin exactly as the active
 * workspace's does.
 *
 * This map exists because create() runs again for EVERY panel on a Cmd+R
 * reload, and tmux's `new-session -A` reattaches without re-running the
 * command — so a re-minted uuid there would name a transcript that does not
 * exist while the real one went on growing, and the panel's cost would freeze
 * with nothing in any log. See "`reattached` costs a probe".
 */
export function parseSessions(
  raw: unknown,
  warnings: string[]
): Record<string, string> {
  // Every file written before M15 has no sessions key. Warning about those
  // would make the first launch after an upgrade shout about a file that is
  // perfectly fine — the same line parseBaselines draws one function up.
  if (raw === undefined) return {}
  if (!isRecord(raw)) {
    warnings.push('sessions was not an object; ignoring it')
    return {}
  }
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id)) {
      warnings.push(`session for ${id} has an unusable panel id; dropped`)
      continue
    }
    if (!isStr(value)) {
      warnings.push(`session for ${id} was malformed; dropped`)
      continue
    }
    out[id] = value
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

  // M13's second pass, and the only place it can happen: a link naming a panel
  // that did not SURVIVE validation has to be dropped, and only this scope
  // knows the whole surviving set.
  //
  // It is derived from `panels` and NOT from `seen`, which is the trap here
  // and cost a red check to find. `seen` looks like the surviving set and is
  // not one: parsePanel calls seen.add(id) immediately after the COORDINATE
  // check and before the cwd and args checks, because its job is rejecting a
  // duplicate id rather than recording a success — so a panel dropped for a
  // missing cwd is still in `seen`, and a link naming it would have resolved
  // to a panel that is not on the canvas. That is precisely the dangling link
  // this pass exists to remove, so reusing `seen` would have made the pass
  // agree with itself and do nothing.
  //
  // (The same subtlety applies to `pick` below, which does filter through
  // `seen`: a selectedId naming a panel dropped for a bad cwd survives as a
  // selection of a panel that is not there. It is harmless — assignTiers
  // simply finds no such panel — and predates this milestone, so it is left
  // alone rather than changed underneath the checks that cover it.)
  //
  // This is the ON-DISK half of the dangling-link stance. removePanel is the
  // in-memory half, and a canvas needs both, because a file can be hand-edited
  // between two launches. Dropping only the unresolvable links, rather than a
  // panel's whole set, is the over-correction guard. verify:layout 111.
  const surviving = new Set(panels.map((p) => p.id))
  for (const p of panels) {
    if (p.links === undefined) continue
    const kept = p.links.filter((l) => surviving.has(l.to))
    if (kept.length === p.links.length) continue
    warnings.push(
      `dropped ${p.links.length - kept.length} link(s) on panel ${p.id}: no such panel`
    )
    if (kept.length === 0) delete p.links
    else p.links = kept
  }

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
      preferences,
      baselines: parseBaselines(parsed.baselines, warnings),
      sessions: parseSessions(parsed.sessions, warnings)
    },
    warnings,
    futureVersion: false
  }
}
