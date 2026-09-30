/**
 * A workspace and its parts — camera, groups, runs, bookmarks — and the two
 * doors the whole file exists for: `parseLayout` and `serialiseLayout`.
 *
 * This is the top of the stack: it is the only module here that reads every
 * other one, and `parseLayout` is the single function that turns a string off
 * disk into a LayoutSnapshot. It NEVER throws. A corrupt or hand-edited file
 * must open a working app, not a dead one, so every failure degrades to a
 * default and names itself in `warnings` instead of propagating.
 *
 * `serialiseLayout` is the one place "an empty record is absent on disk" is
 * decided — see docs/load-bearing.md, which pins that to this function and to
 * main/layout-store.ts.
 */

import { parseAnnotations } from '../annotations'
import { parseStarter } from '../starter'
import { parseOrchestrate } from '../orchestrate-prefs'
import { parseWorkItems } from '../work-items'
import { parseRetainedOutcomes } from '../retained-outcomes'
import { GROUP_COLOURS, type PersistedGroup } from '../groups'
import { RUNS_MAX, type PersistedRun, type RunEntry } from '../runs'
import { parseShelf, type Shelf } from '../skills'
import { isNum, isRecord, isStr } from './fields'
import { parseWorkspaceRole } from '../canvas-ops'
import type {
  LayoutSnapshot,
  PersistedBookmark,
  PersistedCamera,
  PersistedPanel,
  PersistedTerminalPanel,
  RestoreSettings,
  Workspace
} from './types'
import {
  DEFAULT_CAMERA,
  DEFAULT_PRESET_ID,
  ID_PATTERN,
  LAYOUT_VERSION,
  defaultSnapshot,
  defaultWorkspace
} from './types'
import { parsePanel } from './panels'
import {
  parseBaselines,
  parsePreferences,
  parsePresets,
  parsePrompts,
  parseRecentDirectories,
  parseRecentDirectoryUsed,
  parseRoutines,
  parseSessions,
  parseTeammates,
  parseTemplates,
  parseWorktrees
} from './catalogues'

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

/**
 * A group with a missing panel is repaired, not dropped: closing a panel is a
 * normal action and a group containing three surviving members still says
 * something useful. The all-missing case is dropped because an empty region
 * has no spatial anchor and would become an uncloseable floating label.
 */
function parseGroups(raw: unknown, panelIds: ReadonlySet<string>, warnings: string[]): PersistedGroup[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a groups field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const groups: PersistedGroup[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || !isStr(entry.id) || !ID_PATTERN.test(entry.id) || seen.has(entry.id)) {
      warnings.push('dropped a group with an unusable or duplicate id')
      continue
    }
    if (!isStr(entry.label) || entry.label.trim() === '') {
      warnings.push(`dropped group ${entry.id}: label was unusable`)
      continue
    }
    if (!(GROUP_COLOURS as readonly string[]).includes(entry.colour as string)) {
      warnings.push(`dropped group ${entry.id}: colour was unusable`)
      continue
    }
    if (!Array.isArray(entry.panelIds) || !entry.panelIds.every(isStr)) {
      warnings.push(`dropped group ${entry.id}: panel ids were unusable`)
      continue
    }
    const members = [...new Set(entry.panelIds)].filter((id) => panelIds.has(id))
    if (members.length === 0) {
      warnings.push(`dropped group ${entry.id}: it had no surviving panels`)
      continue
    }
    if (members.length !== entry.panelIds.length) {
      warnings.push(`dropped missing or duplicate members from group ${entry.id}`)
    }
    seen.add(entry.id)
    groups.push({
      id: entry.id,
      label: entry.label,
      colour: entry.colour as PersistedGroup['colour'],
      panelIds: members,
      ...(typeof entry.collapsed === 'boolean' && entry.collapsed ? { collapsed: true } : {})
    })
  }
  return groups
}

/**
 * M79. Runs. Absent is every pre-M79 file and warns nothing; a run that is
 * not an object, has no usable id or name, or no array of panel ids is
 * dropped by name; an entry naming a panel the workspace no longer has is
 * dropped and the run kept; a run with no surviving panel is dropped; the
 * newest RUNS_MAX are kept.
 */
function parseRuns(raw: unknown, panelIds: ReadonlySet<string>, warnings: string[]): PersistedRun[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a runs field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const runs: PersistedRun[] = []
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  raw.forEach((entry, i) => {
    if (!isRecord(entry) || !isStr(entry.id) || seen.has(entry.id)) { warnings.push(`dropped run ${i}: not an object or an unusable id`); return }
    if (!isStr(entry.name) || entry.name.trim() === '') { warnings.push(`dropped run ${entry.id}: name was unusable`); return }
    if (!Array.isArray(entry.panelIds) || !entry.panelIds.every(isStr)) { warnings.push(`dropped run ${entry.id}: panel ids were unusable`); return }
    const startedAt = num(entry.startedAt)
    if (startedAt === undefined) { warnings.push(`dropped run ${entry.id}: startedAt was unusable`); return }
    const members = [...new Set(entry.panelIds as string[])].filter((id) => panelIds.has(id))
    if (members.length === 0) { warnings.push(`dropped run ${entry.id}: it had no surviving panels`); return }
    const edges: Array<{ from: string; to: string }> = []
    if (Array.isArray(entry.edges)) for (const e of entry.edges) if (isRecord(e) && isStr(e.from) && isStr(e.to) && panelIds.has(e.from) && panelIds.has(e.to)) edges.push({ from: e.from, to: e.to })
    const entries: RunEntry[] = []
    if (Array.isArray(entry.entries)) for (const e of entry.entries) {
      if (!isRecord(e) || !isStr(e.panelId) || num(e.startedAt) === undefined) continue
      if (!panelIds.has(e.panelId)) { warnings.push(`dropped entry ${e.panelId} from run ${entry.id}: no such panel`); continue }
      const endedAt = num(e.endedAt)
      entries.push({ panelId: e.panelId, startedAt: num(e.startedAt) as number, ...(endedAt === undefined ? {} : { endedAt }), ...(isStr(e.outcome) ? { outcome: e.outcome } : {}) })
    }
    seen.add(entry.id)
    const endedAt = num(entry.endedAt)
    const costUsd = num(entry.costUsd)
    // M133. ABSENT stays absent — never spread as `templateId: undefined`,
    // which survives IPC and reads as present.
    // M137. Present-but-malformed WARNS (parseWatch's rule for the same
    // field); absent stays silent. A mark lost without a line made the Runs
    // tab's "unattributed" arm read as truth about the run rather than the file.
    const templateId = isStr(entry.templateId) && entry.templateId.trim() !== '' ? entry.templateId : undefined
    if (entry.templateId !== undefined && templateId === undefined) warnings.push(`run ${entry.id}: templateId was not a string — the run is kept, its workflow mark dropped`)
    // M184. THE RUN'S SNAPSHOT. Both fields absent on every pre-M184 run and
    // never normalised in; a malformed one costs the FIELD by name, never the
    // run — a run is history, and history is not dropped for a bad annotation.
    // The definition's nodes and edges go through the TEMPLATE parser's own
    // rules (a node it would drop is dropped here, its edges with it), so the
    // snapshot can never hold a shape the app could not draw.
    let definition: PersistedRun['definition']
    if (entry.definition !== undefined) {
      const d = entry.definition as Record<string, unknown>
      const rev = isRecord(d) ? d.revision : undefined
      // `-1` is the UNSAVED mark (M184's critic, finding 5): a run of a dirty
      // draft ran a shape no record holds, and claiming the record's revision
      // would print one number over two different shapes. Anything below it
      // is malformed.
      if (!isRecord(d) || !isStr(d.templateId) || d.templateId.trim() === '' || typeof rev !== 'number' || !Number.isInteger(rev) || rev < -1 || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) {
        warnings.push(`run ${entry.id}: definition was not { templateId, revision, nodes[], edges[] } — the run is kept, its snapshot dropped`)
      } else {
        // M184 (the critic, 13). The template parser's own warnings are
        // FORWARDED rather than thrown away: a snapshot that silently lost a
        // node while the load report said nothing is the exact asymmetry the
        // absent/malformed/unknown rule exists to prevent.
        const inner: string[] = []
        const parsed = parseTemplates([{ id: d.templateId, name: 'snapshot', nodes: d.nodes, edges: d.edges }], inner)
        for (const w of inner) warnings.push(`run ${entry.id}: ${w}`)
        const one = parsed[0]
        if (one === undefined) warnings.push(`run ${entry.id}: definition held no usable node — the run is kept, its snapshot dropped`)
        else definition = { templateId: d.templateId, revision: rev, nodes: one.nodes, edges: one.edges }
      }
    }
    let mapping: Record<string, string> | undefined
    if (entry.mapping !== undefined) {
      if (!isRecord(entry.mapping)) warnings.push(`run ${entry.id}: mapping was not an object — the run is kept, its mapping dropped`)
      else {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(entry.mapping)) if (isStr(v)) out[k] = v
        mapping = out
      }
    }
    // M184 (the critic, 14). The mapping is the DEFINITION's index and cannot
    // outlive it: a mapping kept beside a dropped snapshot names keys nothing
    // will ever look up, and a key the definition does not hold is a block
    // this run could light that its own shape never had.
    if (definition === undefined) mapping = undefined
    else if (mapping !== undefined) {
      const keys = new Set(definition.nodes.map((n) => n.key))
      const pruned = Object.fromEntries(Object.entries(mapping).filter(([k]) => keys.has(k)))
      if (Object.keys(pruned).length !== Object.keys(mapping).length) warnings.push(`run ${entry.id}: mapping named keys the snapshot does not hold — those entries were dropped`)
      mapping = pruned
    }
    runs.push({ id: entry.id, name: entry.name, panelIds: members, edges, startedAt, ...(endedAt === undefined ? {} : { endedAt }), entries, ...(costUsd === undefined ? {} : { costUsd }), ...(templateId === undefined ? {} : { templateId }), ...(definition === undefined ? {} : { definition }), ...(mapping === undefined ? {} : { mapping }) })
  })
  return runs.sort((a, b) => b.startedAt - a.startedAt).slice(0, RUNS_MAX)
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
  // M389. The same on-disk half for connectors: a connector naming a panel
  // that did not survive is dropped, and only it — never the holder's set.
  // And a connector id is unique in the WORKSPACE, not only per holder (the
  // renderer keys its views by id, and remove/patch find the first holder):
  // a second holder's copy of an id — a hand-merged file — is dropped by name.
  const connectorIds = new Set<string>()
  for (const p of panels) {
    if (p.connectors === undefined) continue
    const kept = p.connectors.filter((c) => {
      if (!surviving.has(c.to)) return false
      if (connectorIds.has(c.id)) { warnings.push(`dropped connector ${c.id} on panel ${p.id}: another panel already holds that id`); return false }
      connectorIds.add(c.id)
      return true
    })
    if (kept.length === p.connectors.length) continue
    warnings.push(`dropped ${p.connectors.length - kept.length} connector(s) on panel ${p.id}: no such panel`)
    if (kept.length === 0) delete p.connectors
    else p.connectors = kept
  }

  // #24's functional half is intentionally narrower than decorative links:
  // only terminal panels can emit an exit or accept a restart. A hand-edited
  // rule naming a sessionless node must not turn into a future writer of a
  // PTY when that node is selected, so discard just its action and retain the
  // visible link. Cycles are removed by the same rule the creation helper
  // uses; rate-limiting a loop would only make a malformed file surprising
  // later instead of making it safe at load.
  const byId = new Map(panels.map((p) => [p.id, p]))
  const isTerminal = (p: PersistedPanel): p is PersistedTerminalPanel =>
    p.kind === undefined || p.kind === 'terminal'
  const clearAutomation = (source: PersistedPanel, to: string): void => {
    if (source.links === undefined) return
    source.links = source.links.map((link) => link.to !== to || link.automation === undefined
      ? link
      : { to: link.to, ...(link.label === undefined ? {} : { label: link.label }) })
  }
  for (const source of panels) {
    for (const link of source.links ?? []) {
      if (link.automation === undefined) continue
      const target = byId.get(link.to)
      // M78: a handoff's endpoints are PROCESS kinds — a terminal or a chat
      // (a turn's end is a source; a send is a target). A restart is still
      // the terminal's alone: a chat has no process to restart.
      const isProcess = (p: PersistedPanel): boolean => isTerminal(p) || p.kind === 'chat'
      const allowed = link.automation.kind === 'handoff' ? isProcess : isTerminal
      if (!allowed(source) || target === undefined || !allowed(target)) {
        clearAutomation(source, link.to)
        warnings.push(`dropped automation on link ${source.id} -> ${link.to}: endpoints must be ${link.automation.kind === 'handoff' ? 'terminal or chat panels' : 'terminal panels'}`)
      }
    }
  }
  const reaches = (from: string, sought: string, seen = new Set<string>()): boolean => {
    if (from === sought) return true
    if (seen.has(from)) return false
    seen.add(from)
    const panel = byId.get(from)
    // M41: any ENABLED rule of EITHER kind closes a cycle. A handoff a->b on
    // idle plus a restart b->a is an infinite ping-pong between two
    // interactive agents; a disabled rule fires nothing and closes nothing.
    return (panel?.links ?? []).some((link) =>
      link.automation !== undefined && link.automation.enabled && reaches(link.to, sought, seen)
    )
  }
  for (const source of panels) {
    for (const link of source.links ?? []) {
      const rule = link.automation
      if (rule === undefined || !rule.enabled) continue
      // Temporarily remove this link, otherwise every directed edge trivially
      // reaches its own source through itself.
      clearAutomation(source, link.to)
      if (reaches(link.to, source.id)) {
        warnings.push(`dropped automation on link ${source.id} -> ${link.to}: ${rule.kind === 'handoff' ? 'handoff' : 'restart'} cycle`)
        continue
      }
      // It was safe, so restore the exact durable action.
      source.links = (source.links ?? []).map((candidate) => candidate.to === link.to
        ? { ...candidate, automation: rule }
        : candidate)
    }
  }

  // A selection naming a panel that did not survive validation would leave
  // focus pointing at nothing — and assignTiers pins the focused id live.
  const pick = (v: unknown): string | null => (isStr(v) && seen.has(v) ? v : null)

  return {
    id,
    name,
    panels,
    groups: parseGroups(raw.groups, surviving, warnings),
    camera: parseCamera(raw.camera, warnings),
    selectedId: pick(raw.selectedId),
    focusedId: pick(raw.focusedId),
    bookmarks: parseBookmarks(raw.bookmarks, warnings),
    runs: parseRuns(raw.runs, surviving, warnings),
    ...(() => { const a = parseAnnotations(raw.annotations, surviving, warnings, `workspace ${id}`); return a === undefined ? {} : { annotations: a } })(),
    // M113. Work items are records, not layout: an item naming a panel that
    // did not survive keeps its id (the note says `lane closed`), so the
    // parser takes no panel set — unlike annotations, whose anchor is geometry.
    ...(() => { const w = parseWorkItems(raw.workItems, warnings); return w === undefined ? {} : { workItems: w } })(),
    ...(() => { const o = parseRetainedOutcomes(raw.retainedOutcomes, warnings); return o === undefined ? {} : { retainedOutcomes: o } })(),
    // M181. The starter record: absent stays absent; malformed dropped by name.
    ...(() => { const s = parseStarter(raw.starter, warnings); return s === undefined ? {} : { starter: s } })(),
    // M287. Orchestrate's per-workspace layout: the same rules.
    ...(() => { const o = parseOrchestrate(raw.orchestrate, warnings); return o === undefined ? {} : { orchestrate: o } })(),
    // The shared canvas: absent stays absent; a malformed share is dropped by
    // name, and its doc with it — a doc with no room to belong to is bytes
    // that can only ever be re-seeded from `panels` anyway.
    ...parseShareFields(raw, id, warnings)
  }
}

const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/
/** 8 MB of doc: far past any canvas's geometry, short of a file that stalls the parse. */
const CRDT_MAX_CHARS = 8 * 1024 * 1024

function parseShareFields(raw: Record<string, unknown>, id: string, warnings: string[]): Pick<Workspace, 'share' | 'crdt'> {
  if (raw.share === undefined) {
    if (raw.crdt !== undefined) warnings.push(`dropped workspace ${id}'s shared canvas state: the workspace is not shared`)
    return {}
  }
  const s = raw.share
  const role = isRecord(s) ? parseWorkspaceRole(s.role) : undefined
  if (!isRecord(s) || !isStr(s.id) || !SHARE_ID.test(s.id) || !isStr(s.orgId) || !SHARE_ID.test(s.orgId) || role === undefined) {
    warnings.push(`dropped workspace ${id}'s share: malformed`)
    return {}
  }
  const share = { id: s.id, orgId: s.orgId, role }
  if (raw.crdt === undefined) return { share }
  if (!isStr(raw.crdt) || raw.crdt.length > CRDT_MAX_CHARS || !BASE64.test(raw.crdt)) {
    warnings.push(`dropped workspace ${id}'s shared canvas state: malformed`)
    return { share }
  }
  return { share, crdt: raw.crdt }
}

/**
 * M56. Absent for every earlier file and warns nothing; a malformed entry
 * costs that entry with a warning, never the list. The camera goes through
 * parseCamera's own rule — a zero scale is a dead canvas, not a cosmetic
 * defect — but a REPLACED camera here is a dropped bookmark rather than a
 * bookmark at the default: a bookmark that silently points at the origin is
 * a place the user never saved.
 */
function parseBookmarks(raw: unknown, warnings: string[]): PersistedBookmark[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a bookmarks field that was not an array')
    return []
  }
  const out: PersistedBookmark[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!isRecord(entry) || !isStr(entry.id) || !isStr(entry.name) || seen.has(entry.id)) {
      warnings.push('dropped a malformed bookmark')
      continue
    }
    const cameraWarnings: string[] = []
    const camera = parseCamera(entry.camera, cameraWarnings)
    if (cameraWarnings.length > 0) {
      warnings.push(`dropped bookmark ${entry.name}: unusable camera`)
      continue
    }
    seen.add(entry.id)
    out.push({ id: entry.id, name: entry.name, camera })
  }
  return out
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
      templates: parseTemplates(parsed.templates, warnings),
      shelf: parseShelf(parsed.shelf, warnings),
      teammates: parseTeammates(parsed.teammates, warnings),
      routines: parseRoutines(parsed.routines, warnings),
      preferences,
      baselines: parseBaselines(parsed.baselines, warnings),
      sessions: parseSessions(parsed.sessions, warnings),
      worktrees: parseWorktrees(parsed.worktrees, warnings),
      recentDirectories: parseRecentDirectories(parsed.recentDirectories, warnings),
      recentDirectoryUsed: parseRecentDirectoryUsed(parsed.recentDirectoryUsed, warnings)
    },
    warnings,
    futureVersion: false
  }
}

/**
 * M126. The write-side companion to `parseShelf`: an empty shelf is deleted
 * from the record before it is stringified, the same rule M93's annotations
 * and workItems already obey per-workspace — a written `"shelf":{"columns":[]}`
 * is a record claiming to exist, so a fresh file and a file whose shelf was
 * emptied must be byte-identical. Takes the already-settings-stripped record
 * `layout-store.ts`'s `writeNow` is about to write, so this stays the ONE
 * place that decides the on-disk shape of a shelf.
 */
export function serialiseLayout(onDisk: Record<string, unknown>): string {
  const out: Record<string, unknown> = { ...onDisk }
  const shelf = out.shelf as Shelf | undefined
  if (shelf !== undefined && shelf.columns.length === 0) delete out.shelf
  return JSON.stringify(out, null, 2)
}
