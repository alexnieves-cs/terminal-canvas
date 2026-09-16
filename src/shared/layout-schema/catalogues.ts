/**
 * The top-level lists a snapshot carries BESIDE its workspaces: presets,
 * preferences, baselines, sessions, recent directories, worktrees, prompts,
 * templates, teammates and routines.
 *
 * What they have in common is the shape of their failure, not their contents:
 * each is an array or map read with the same drop-individually rule, so a
 * single bad entry costs that entry and warns, never the list and never the
 * load. `parseTemplates` in particular stays a HAND-WRITTEN reader — the zod
 * adoption in shared/workflow-graph-schema.ts was for boundaries that had no
 * reader at all, and was deliberately not a retrofit of this one.
 *
 * Reads ./fields and ./types, and nothing from ./panels — a preset is not a
 * panel, and the only mention of `parsePanel` here is a comment comparing the
 * clamp-rather-than-drop trade the two make.
 */

import { MIN_PANEL_H, MIN_PANEL_W } from '../panel-geometry'
import { SettingValue, settingDef } from '../settings-schema'
import type { ReviewBaseline } from '../review'
import { HANDOFF_TRIGGERS, type HandoffTrigger } from '../handoff'
import { TEMPLATES_MAX, type PersistedTemplate, type TemplateEdge, type TemplateNode } from '../templates'
import { parseWorkflowNode } from '../workflow-nodes'
import { TEAMMATES_MAX, type PersistedTeammate } from '../teammates'
import { ROUTINES_MAX, ROUTINE_MIN_MS, type PersistedRoutine } from '../routines'
import { AGENT_KINDS, type AgentKind } from '../cost'
import { isNum, isRecord, isStr, parseAgentOptions, parseEnvMap, parseWorktreeFlag } from './fields'
import type { Preset, Prompt, WorktreeRecord } from './types'
import { ID_PATTERN } from './types'

function parsePreset(raw: unknown, seen: Set<string>, warnings: string[]): Preset | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a preset that was not an object')
    return null
  }
  const { id, name, cwd, command, args, w, h, agent, agentOptions, worktree, env, reviewed } = raw
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
  if (parseWorktreeFlag(worktree, `preset ${id}`, warnings)) preset.worktree = true
  const presetEnv = parseEnvMap(env, `preset ${id}`, warnings)
  if (presetEnv !== undefined) preset.env = presetEnv
  // M253. The template rule (M190): anything present that is not `true`
  // costs the FIELD and fails SAFE — an unreadable mark reads as "not read",
  // because the other failure spawns a stranger's command.
  if (reviewed !== undefined && reviewed !== true && reviewed !== false) warnings.push(`preset ${id}: reviewed was not a boolean — the preset is kept and treated as unreviewed`)
  if (reviewed !== undefined && reviewed !== true) preset.reviewed = false
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
    // `boolean`/`number` track what `typeof` can answer; an `enum` is a
    // string, checked against its values below.
    // A list is checked below rather than by typeof, which answers 'object'.
    if (def.type === 'list') {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        warnings.push(`dropped setting ${id}: expected a list of strings`)
        continue
      }
      out[id] = [...value]
      continue
    }
    // M85. Both `enum` and `text` are strings here; only an enum is then
    // checked against a list of values.
    const expected = def.type === 'enum' || def.type === 'text' ? 'string' : def.type
    if (typeof value !== expected) {
      warnings.push(`dropped setting ${id}: expected ${expected}, got ${typeof value}`)
      continue
    }
    // The enum's membership test is this loader's OWN door, like the range
    // check below: a hand-edited or synced layout.json never passes through
    // setPreference. Dropping with a warning, never coercing to the default —
    // a value that silently became `system` is a preference the user set
    // that stopped applying, with nothing anywhere saying why.
    if (def.type === 'enum' && typeof value === 'string' && !(def.values ?? []).includes(value)) {
      warnings.push(`dropped setting ${id}: ${JSON.stringify(value)} is not one of ${(def.values ?? []).join('|')}`)
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
    out[id] = value as SettingValue
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

/**
 * M37. Every worktree this app created. Absent on every file written before
 * M37 and read as [] with no warning, for the reason parseSessions gives; a
 * malformed entry costs that entry, never its siblings.
 */
export const RECENT_DIRECTORIES_CAP = 12

/**
 * M65. Absent is every layout written before M65 and warns nothing; a
 * non-array warns and is dropped; a non-string or empty entry costs that
 * entry; duplicates keep their first (newest) position; capped so the spawn
 * sheet never scrolls a list of temp directories.
 */
/**
 * M262. Absent is every layout before M262 and warns nothing; a non-object
 * warns and is dropped; an entry whose key is empty or whose value is not a
 * finite positive number costs that entry only.
 */
export function parseRecentDirectoryUsed(raw: unknown, warnings: string[]): Record<string, number> {
  if (raw === undefined) return {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('recentDirectoryUsed was not an object; ignoring it')
    return {}
  }
  const out: Record<string, number> = {}
  for (const [dir, at] of Object.entries(raw as Record<string, unknown>)) {
    if (dir === '' || typeof at !== 'number' || !Number.isFinite(at) || at <= 0) {
      warnings.push(`dropped a recent-directory time that was not a time: ${JSON.stringify(dir)}`)
      continue
    }
    out[dir] = at
  }
  return out
}

export function parseRecentDirectories(raw: unknown, warnings: string[]): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('recentDirectories was not an array; ignoring it')
    return []
  }
  const out: string[] = []
  for (const entry of raw) {
    if (!isStr(entry) || entry === '') {
      warnings.push(`dropped a recent directory that was not a path: ${JSON.stringify(entry)}`)
      continue
    }
    if (out.includes(entry)) continue
    out.push(entry)
    if (out.length === RECENT_DIRECTORIES_CAP) break
  }
  return out
}

export function parseWorktrees(raw: unknown, warnings: string[]): WorktreeRecord[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('worktrees was not an array; ignoring it')
    return []
  }
  const out: WorktreeRecord[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!isRecord(entry)) {
      warnings.push('dropped a worktree record that was not an object')
      continue
    }
    const { id, root, path, branch, createdAt, panelId } = entry
    if (!isStr(id) || !ID_PATTERN.test(id) || seen.has(id)) {
      warnings.push(`dropped a worktree record with an unusable or duplicate id: ${JSON.stringify(id)}`)
      continue
    }
    if (!isStr(root) || !isStr(path) || !isStr(branch) || !isNum(createdAt) || !isStr(panelId) || !ID_PATTERN.test(panelId)) {
      warnings.push(`dropped worktree record ${id}: a field was missing or malformed`)
      continue
    }
    seen.add(id)
    out.push({ id, root, path, branch, createdAt, panelId })
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

/**
 * M80. Templates. Absent is every pre-M80 file and warns nothing. A template
 * that is not an object, has no usable id or name, or has no surviving node
 * is dropped BY NAME; a node with an unusable key or kind is dropped and the
 * template kept; an edge naming a key that did not survive goes with it, and
 * the template stays — an edge is a relation between nodes, and a relation
 * with one end missing is not a smaller template, it is a broken one.
 */
export function parseTemplates(raw: unknown, warnings: string[]): PersistedTemplate[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a templates field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const out: PersistedTemplate[] = []
  raw.forEach((entry, i) => {
    if (!isRecord(entry) || !isStr(entry.id) || seen.has(entry.id)) { warnings.push(`dropped template ${i}: not an object or an unusable id`); return }
    if (!isStr(entry.name) || entry.name.trim() === '') { warnings.push(`dropped template ${entry.id}: name was unusable`); return }
    const nodes: TemplateNode[] = []
    if (Array.isArray(entry.nodes)) for (const n of entry.nodes) {
      if (!isRecord(n) || !isStr(n.key) || n.key.trim() === '' || nodes.some((x) => x.key === n.key)) { warnings.push(`dropped a node with an unusable key from template ${entry.id}`); continue }
      // M132: the three workflow kinds route through their own parser, which
      // reports its own reason; the arm below stays exactly as it is for
      // whatever comes after these three.
      // M188. The two executable kinds join the workflow-node arm; the list
      // is here because the terminal/chat arm below is the DEFAULT, and a kind
      // it does not know must reach `parseWorkflowNode` rather than being read
      // as a terminal with no command.
      if (n.kind === 'pool' || n.kind === 'orchestrator' || n.kind === 'collect' || n.kind === 'action' || n.kind === 'http') {
        const wfWarnings: string[] = []
        const wf = parseWorkflowNode(n, wfWarnings)
        if (!wf) { warnings.push(`dropped node ${n.key} from template ${entry.id}: ${wfWarnings[0] ?? 'unusable'}`); continue }
        nodes.push({ key: n.key, ...wf })
        continue
      }
      if (n.kind !== 'terminal' && n.kind !== 'chat') { warnings.push(`dropped node ${n.key} from template ${entry.id}: kind was unusable`); continue }
      if (!isStr(n.cwd)) { warnings.push(`dropped node ${n.key} from template ${entry.id}: cwd was unusable`); continue }
      nodes.push({
        key: n.key, kind: n.kind, cwd: n.cwd,
        dx: isNum(n.dx) ? n.dx : 0, dy: isNum(n.dy) ? n.dy : 0,
        ...(isStr(n.presetId) ? { presetId: n.presetId } : {}),
        ...(isStr(n.command) ? { command: n.command } : {}),
        ...(Array.isArray(n.args) && n.args.every(isStr) ? { args: n.args as string[] } : {}),
        ...(isStr(n.title) ? { title: n.title } : {}),
        ...(isStr(n.message) ? { message: n.message } : {}),
        ...(isNum(n.w) ? { w: n.w } : {}),
        ...(isNum(n.h) ? { h: n.h } : {})
      })
    }
    if (nodes.length === 0) { warnings.push(`dropped template ${entry.id}: it had no usable node`); return }
    // M182. Two counters, each absent on a pre-M182 record and NEVER normalised
    // in: a written `revision: 0` would claim a save that never happened. A
    // present value that is not a whole number ≥ 0 drops the template by name.
    const counter = (name: 'revision' | 'nextKey'): { ok: boolean; value?: number } => {
      const v = entry[name]
      if (v === undefined) return { ok: true }
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return { ok: false }
      return { ok: true, value: v }
    }
    const revision = counter('revision'), nextKey = counter('nextKey')
    if (!revision.ok || !nextKey.ok) { warnings.push(`dropped template ${entry.id}: ${!revision.ok ? 'revision' : 'nextKey'} was not a whole number`); return }
    const keys = new Set(nodes.map((n) => n.key))
    const edges: TemplateEdge[] = []
    if (Array.isArray(entry.edges)) for (const e of entry.edges) {
      if (!isRecord(e) || !isStr(e.from) || !isStr(e.to)) continue
      if (!keys.has(e.from) || !keys.has(e.to)) { warnings.push(`dropped an edge naming a missing node from template ${entry.id}`); continue }
      // A trigger this code does not know is MALFORMED, never defaulted: a
      // rule that fires on a trigger its author did not write is exactly the
      // surprise `parseLinkAutomation` refuses one field away.
      if (!isStr(e.trigger) || !(HANDOFF_TRIGGERS as readonly string[]).includes(e.trigger)) { warnings.push(`dropped an edge with an unusable trigger from template ${entry.id}`); continue }
      edges.push({ from: e.from, to: e.to, trigger: e.trigger as HandoffTrigger })
    }
    seen.add(entry.id)
    // M190. `reviewed: false` is the only value this field takes: absent means
    // reviewed (every template this canvas made itself, and every pre-M190
    // record). Anything else present is malformed and costs the FIELD, which
    // fails SAFE — an unreadable mark reads as "not reviewed".
    const unreviewed = entry.reviewed === false || (entry.reviewed !== undefined && entry.reviewed !== true)
    if (entry.reviewed !== undefined && entry.reviewed !== true && entry.reviewed !== false) warnings.push(`template ${entry.id}: reviewed was not a boolean — the template is kept and treated as unreviewed`)
    out.push({ id: entry.id, name: entry.name, ...(isStr(entry.description) ? { description: entry.description } : {}), nodes, edges, ...(unreviewed ? { reviewed: false as const } : {}), ...(revision.value === undefined ? {} : { revision: revision.value }), ...(nextKey.value === undefined ? {} : { nextKey: nextKey.value }) })
  })
  return out.slice(0, TEMPLATES_MAX)
}

/**
 * M100. The roster, with the record rules: absent is every pre-existing
 * file (no warning); a record whose lists are not lists, whose name is empty
 * or whose id repeats is dropped BY NAME; inside a good record a place that
 * is not absolute is dropped (a relative place would be resolved against a
 * root nobody chose — `shared/places.ts`) and a flag that is not a boolean
 * falls to false, the teammate kept.
 */
export function parseTeammates(raw: unknown, warnings: string[]): PersistedTeammate[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a teammates field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const out: PersistedTeammate[] = []
  const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every(isStr) ? (v as string[]) : null)
  raw.forEach((entry, i) => {
    if (!isRecord(entry) || !isStr(entry.id) || entry.id.trim() === '' || seen.has(entry.id)) { warnings.push(`dropped teammate ${i}: not an object or an unusable id`); return }
    if (!isStr(entry.name) || entry.name.trim() === '') { warnings.push(`dropped teammate ${entry.id}: name was unusable`); return }
    const places = strList(entry.places), services = strList(entry.services), chats = strList(entry.chats)
    if (places === null || services === null || chats === null) { warnings.push(`dropped teammate ${entry.id}: a list field was not a list of strings`); return }
    const absolute = places.filter((p) => { const keep = p.startsWith('/'); if (!keep) warnings.push(`teammate ${entry.id}: dropped place ${p} — a place must be an absolute folder`); return keep })
    // M131. `skills` is OPTIONAL — absent is every pre-M131 record and every
    // teammate nobody has assigned a skill to. Present-but-malformed drops
    // just this field with a warning; the teammate is kept (the record
    // rule: a per-field failure never costs the whole entry).
    let skills: string[] | undefined
    if (entry.skills !== undefined) {
      const parsed = strList(entry.skills)
      if (parsed === null) { warnings.push(`teammate ${entry.id}: dropped skills — not a list of strings`); skills = undefined }
      else skills = parsed
    }
    seen.add(entry.id)
    out.push({
      id: entry.id,
      name: entry.name,
      brief: isStr(entry.brief) ? entry.brief : '',
      places: absolute,
      services,
      ...(skills !== undefined ? { skills } : {}),
      memory: isStr(entry.memory) && entry.memory.trim() !== '' ? entry.memory : entry.id,
      chats,
      messaging: entry.messaging === true,
      scheduling: entry.scheduling === true
    })
  })
  return out.slice(0, TEAMMATES_MAX)
}

/**
 * M101. Routines, with the record rules. The interval floor is enforced
 * here too (a file edited by hand must not arm a busy loop); `lastRun` and
 * `missed` are rebuilt by name so an absent optional stays absent.
 */
export function parseRoutines(raw: unknown, warnings: string[]): PersistedRoutine[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a routines field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const out: PersistedRoutine[] = []
  raw.forEach((entry, i) => {
    if (!isRecord(entry) || !isStr(entry.id) || entry.id.trim() === '' || seen.has(entry.id)) { warnings.push(`dropped routine ${i}: not an object or an unusable id`); return }
    if (!isStr(entry.name) || entry.name.trim() === '') { warnings.push(`dropped routine ${entry.id}: name was unusable`); return }
    if (!isStr(entry.teammateId) || entry.teammateId.trim() === '') { warnings.push(`dropped routine ${entry.id}: it names no teammate`); return }
    if (!isNum(entry.everyMs) || entry.everyMs < ROUTINE_MIN_MS) { warnings.push(`dropped routine ${entry.id}: the interval was under ${ROUTINE_MIN_MS / 1000}s or not a number`); return }
    if (!isStr(entry.prompt)) { warnings.push(`dropped routine ${entry.id}: prompt was unusable`); return }
    const r: PersistedRoutine = { id: entry.id, name: entry.name, teammateId: entry.teammateId, everyMs: entry.everyMs, prompt: entry.prompt, paused: entry.paused === true }
    if (isStr(entry.plan) && entry.plan.trim() !== '') r.plan = entry.plan
    if (isRecord(entry.lastRun) && isNum(entry.lastRun.at) && (entry.lastRun.outcome === 'started' || entry.lastRun.outcome === 'refused')) {
      r.lastRun = { at: entry.lastRun.at, outcome: entry.lastRun.outcome, ...(isStr(entry.lastRun.panelId) ? { panelId: entry.lastRun.panelId } : {}), ...(isStr(entry.lastRun.error) ? { error: entry.lastRun.error } : {}) }
    }
    if (isRecord(entry.missed) && isNum(entry.missed.at)) r.missed = { at: entry.missed.at }
    seen.add(entry.id)
    out.push(r)
  })
  return out.slice(0, ROUTINES_MAX)
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

