/**
 * Everything that reads ONE panel record: `parsePanel`, the per-kind source
 * parsers it dispatches to, and `parseWatch`.
 *
 * The rules that make this file long are the ones that cannot be shortened —
 * absent is not malformed, a present-but-unknown `kind` is DROPPED rather than
 * guessed, and a bad field costs the field by name rather than the panel. They
 * are written per kind on purpose: the day one kind's rule is factored into a
 * table is the day a kind that needed a different rule gets the table's.
 *
 * Reads ./fields and ./types. Read by ./workspaces, which owns the panel LIST.
 */

import { RELAY_PROGRAM, RELAY_SESSION_ID } from '../relay-protocol'
import { MIN_PANEL_H, MIN_PANEL_W } from '../panel-geometry'
import { parseChecklistView } from '../checklist'
import { parseImportedNote } from '../imported-note'
import { parseDeckView } from '../deck'
import { parseSheetView } from '../sheet'
import { isReadableUrl } from '../browser-panel'
import {
  DEVICE_WIDTHS,
  isDeviceWidthId,
  type DeviceWidthId,
  normalisePreviewPath,
  type PreviewBinding
} from '../preview'
import { isAssetId } from '../assets'
import { parseAgentCaps } from '../agent-session'
import { parseArtifactReference } from '../artifact-reference'
import { NOTE_FORMS, NOTE_TINTS, isNoteForm, isNoteTint, normaliseNoteText, type NoteTint } from '../notes'
import type { ReviewSubject } from '../review'
import type { FileSource } from '../file-panel'
import type { ToolboxSource } from '../toolbox'
import type { ChatSource } from '../chat-panel'
import { parseSwarmMark } from '../swarm'
import { HANDOFF_TRIGGERS, type HandoffTrigger, type LinkAutomation } from '../handoff'
import { WATCH_TIMER_MIN_MS, type WatchTrigger } from '../watch-trigger'
import { AGENT_KINDS, type AgentKind } from '../cost'
import {
  isNum,
  isRecord,
  isStr,
  parseAgentOptions,
  parseEnvMap,
  parseFlag,
  parseMaximised,
  parseTemplateBinding,
  parseWorktreeFlag
} from './fields'
import type { PersistedPanel, PersistedPanelBase, PersistedTerminalPanel } from './types'
import { ID_PATTERN } from './types'

/**
 * M84. The watcher's trigger, parsed here and nowhere else.
 *
 * A trigger from a LATER version of this app is DROPPED with its panel, never
 * coerced: every other kind's parser can fall back to a default because the
 * worst case is a node that shows the wrong thing, but a coerced trigger runs
 * a real command on a schedule nobody asked for. The timer floor is checked
 * for the same reason — a stored `everyMs: 5` is a busy loop with a UI.
 */
export function parseWatch(raw: unknown, id: string, warnings: string[]): { cwd: string; command: string; args: string[]; trigger: WatchTrigger; armed?: false; templateId?: string } | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped watcher panel ${id}: it had no watch record`)
    return null
  }
  if (!isStr(raw.cwd) || raw.cwd.trim() === '') {
    warnings.push(`dropped watcher panel ${id}: its directory was unusable`)
    return null
  }
  if (!isStr(raw.command) || raw.command.trim() === '') {
    warnings.push(`dropped watcher panel ${id}: it had no command to run`)
    return null
  }
  // ABSENT args are none — the commonest command has no arguments, and a
  // whole node is not dropped for a key nobody wrote. A PRESENT one that is
  // not an array of strings is malformed and does drop it: the difference
  // between `make` and `make` with something unreadable after it is a
  // different command.
  let args: string[] = []
  if (raw.args !== undefined) {
    if (!Array.isArray(raw.args) || !raw.args.every(isStr)) {
      warnings.push(`dropped watcher panel ${id}: args was not an array of strings`)
      return null
    }
    args = [...raw.args]
  }
  const t = raw.trigger
  if (!isRecord(t)) {
    warnings.push(`dropped watcher panel ${id}: it had no trigger`)
    return null
  }
  // ABSENT stays absent, and only an explicit `false` is carried: `armed:
  // true` written back would make every file differ from the one before it
  // for a field whose absence already means the same thing.
  const armed = raw.armed === false ? { armed: false as const } : {}
  // M133. A WORKFLOW trigger: the same watcher, carrying the template it
  // instantiates. ABSENT is every ordinary watcher and every pre-M133 file,
  // so it must warn nothing; a PRESENT but unusable value is dropped by name
  // and the watcher is KEPT — a watcher that vanished because of a mark
  // would read as a watcher the user never made.
  let templateMark: { templateId?: string } = {}
  if (raw.templateId !== undefined) {
    if (isStr(raw.templateId) && raw.templateId.trim() !== '') templateMark = { templateId: raw.templateId }
    else warnings.push(`watcher panel ${id}: templateId was not a string — the watcher is kept, its workflow mark dropped`)
  }
  if (t.kind === 'path' && isStr(t.path) && t.path.trim() !== '') {
    return { cwd: raw.cwd, command: raw.command, args, ...armed, ...templateMark, trigger: { kind: 'path', path: t.path } }
  }
  if (t.kind === 'git-ref' && isStr(t.root) && t.root.trim() !== '') {
    return { cwd: raw.cwd, command: raw.command, args, ...armed, ...templateMark, trigger: { kind: 'git-ref', root: t.root } }
  }
  if (t.kind === 'timer' && typeof t.everyMs === 'number' && Number.isFinite(t.everyMs)) {
    if (t.everyMs < WATCH_TIMER_MIN_MS) {
      warnings.push(`dropped watcher panel ${id}: its timer asked for every ${t.everyMs}ms, below the ${WATCH_TIMER_MIN_MS}ms floor`)
      return null
    }
    return { cwd: raw.cwd, command: raw.command, args, ...armed, ...templateMark, trigger: { kind: 'timer', everyMs: t.everyMs } }
  }
  if (t.kind === 'panel' && isStr(t.sourceId) && t.sourceId.trim() !== '' && HANDOFF_TRIGGERS.includes(t.on as HandoffTrigger)) {
    return { cwd: raw.cwd, command: raw.command, args, ...armed, ...templateMark, trigger: { kind: 'panel', sourceId: t.sourceId, on: t.on as HandoffTrigger } }
  }
  warnings.push(`dropped watcher panel ${id}: trigger ${JSON.stringify(t.kind)} was unusable`)
  return null
}

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
  // M86. `across` is carried only as a literal `true`. A present value that
  // is anything else is malformed: it warns and the FLAG is dropped, never
  // the node — a review node that lost its flag is an ordinary review of the
  // same subject, which is a smaller wrong than a node that vanished.
  // M201. The task this review belongs to, on the same terms: a present but
  // unusable value costs the FIELD and never the node. A review that lost the
  // name of its task still reviews the right diff — `repoRoot` and `across`
  // decide that — whereas a node that vanished takes the diff with it.
  const workItemId = isStr(raw.workItemId) ? raw.workItemId : undefined
  if (raw.workItemId !== undefined && workItemId === undefined) {
    warnings.push(`dropped review panel ${id}'s work item id: expected a string, got ${JSON.stringify(raw.workItemId)}`)
  }
  const task = workItemId === undefined ? {} : { workItemId }
  const { across } = raw
  if (across !== undefined && across !== true) {
    warnings.push(`dropped review panel ${id}'s across flag: expected true, got ${JSON.stringify(across)}`)
    return { subjectId, repoRoot, baselineSha, label, ...task }
  }
  return { subjectId, repoRoot, baselineSha, label, ...task, ...(across === true ? { across: true as const } : {}) }
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
/**
 * Either automation kind, or 'malformed' for a PRESENT value that is neither —
 * absent stays undefined and warns nothing (every pre-M25 file). A handoff
 * needs a trigger the code knows; an unknown one is malformed rather than
 * defaulted, because a rule that fires on a trigger its owner did not write
 * is exactly the surprise this parser exists to refuse.
 */
function parseLinkAutomation(raw: unknown): LinkAutomation | undefined | 'malformed' {
  if (raw === undefined) return undefined
  if (!isRecord(raw) || typeof raw.enabled !== 'boolean') return 'malformed'
  if (raw.kind === 'restart-on-exit') return { kind: 'restart-on-exit', enabled: raw.enabled }
  // M78: five triggers. HANDOFF_TRIGGERS is the list; an unknown one is still malformed.
  if (raw.kind === 'handoff' && typeof raw.trigger === 'string' && (HANDOFF_TRIGGERS as readonly string[]).includes(raw.trigger)) {
    return { kind: 'handoff', enabled: raw.enabled, trigger: raw.trigger as HandoffTrigger }
  }
  return 'malformed'
}

function parseLinks(
  raw: unknown,
  id: string,
  warnings: string[]
): PersistedPanelBase['links'] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    warnings.push(`dropped panel ${id}'s links: not an array`)
    return undefined
  }
  const out: NonNullable<PersistedPanelBase['links']> = []
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
    const automation = parseLinkAutomation(entry.automation)
    if (automation === 'malformed') warnings.push(`dropped automation on link ${id} -> ${entry.to}: malformed`)
    out.push({
      to: entry.to,
      ...(isStr(entry.label) ? { label: entry.label } : {}),
      ...(automation === undefined || automation === 'malformed' ? {} : { automation })
    })
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

/**
 * M73. A chat panel's record. `cwd` and `sessionId` are both required — a
 * chat with no session id could only ever start a NEW conversation, silently
 * discarding the one the panel was showing — so either missing drops the
 * panel with a warning. The knobs go through `parseAgentOptions`, the ONE
 * parser for that shape, so an unknown knob costs the knob and never the
 * panel, exactly as it does on a terminal panel or a preset.
 */
function parseChatSource(raw: unknown, id: string, warnings: string[]): ChatSource | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped panel ${id}: chat record was ${raw === undefined ? 'absent' : 'not an object'}`)
    return null
  }
  if (!isStr(raw.cwd)) {
    warnings.push(`dropped panel ${id}: chat cwd was not a string`)
    return null
  }
  if (!isStr(raw.sessionId) || raw.sessionId === '') {
    warnings.push(`dropped panel ${id}: chat sessionId was missing`)
    return null
  }
  const chat: ChatSource = { cwd: raw.cwd, sessionId: raw.sessionId }
  // M81. A supervisor keeps its job across a relaunch: the flag is what makes
  // its next spawn carry the system prompt again (the CLI keeps no record).
  if (raw.supervisor === true) chat.supervisor = true
  // M114. A dispatched lane keeps its prompt across a relaunch, the same way.
  if (raw.dispatch === true) chat.dispatch = true
  // M120. A chat with no place keeps its sandbox across a relaunch, the same way.
  if (raw.sandbox === true) chat.sandbox = true
  // M121. A routine's chat keeps its rule prompt across a relaunch, the same way.
  if (raw.routine === true) chat.routine = true
  // M138. An orchestrator keeps its prompt across a relaunch, the same way,
  // as a string because the prompt is the block's. Present and not a string
  // warns; the chat is kept.
  if (raw.orchestrator !== undefined) {
    if (isStr(raw.orchestrator) && raw.orchestrator.trim() !== '') chat.orchestrator = raw.orchestrator
    else warnings.push(isStr(raw.orchestrator) ? `chat panel ${id}: orchestrator was an empty prompt - the chat is kept, the mark dropped` : `chat panel ${id}: orchestrator was not a string - the chat is kept, its prompt dropped`)
  }
  // M275. The swarm seat keeps its brief across a relaunch, the same way —
  // rebuilt from two strings rather than stored as prose. A malformed mark
  // costs the MARK and not the panel: a chat whose seat cannot be read is
  // still a chat, and it spawns with no appended prompt rather than a guessed
  // one.
  if (raw.swarm !== undefined) {
    const mark = parseSwarmMark(raw.swarm)
    if (mark !== null) chat.swarm = mark
    else warnings.push(`chat panel ${id}: swarm seat ${JSON.stringify(raw.swarm)} is not a { preset, role } this app knows - the chat is kept, the seat dropped`)
  }
  // M90. The backend: absent is claude and stays absent; a present value that
  // is not a known backend warns and is dropped (the panel keeps claude).
  if (raw.backend !== undefined) {
    // The ONE place a literal member is allowed (registry.1): absent-vs-malformed needs it.
    if (raw.backend === 'codex' || raw.backend === 'copilot' || raw.backend === 'acp') chat.backend = raw.backend
    else if (raw.backend !== 'claude') warnings.push(`panel ${id}: chat backend ${JSON.stringify(raw.backend)} is not claude, codex, copilot or acp; using claude`)
  }
  const agentOptions = parseAgentOptions(raw.agentOptions, `panel ${id}`, warnings)
  if (agentOptions !== undefined) chat.agentOptions = agentOptions
  // M100. The identity rides the record; absent stays absent.
  if (isStr(raw.teammateId) && raw.teammateId.trim() !== '') chat.teammateId = raw.teammateId
  // M351. The agent's own caps. A malformed record warns and is dropped, so
  // the Settings caps apply: a guessed cap would bind an agent to a figure
  // nobody set.
  if (raw.caps !== undefined) {
    const caps = parseAgentCaps(raw.caps)
    if (caps !== undefined) chat.caps = caps
    else warnings.push(`chat panel ${id}: caps ${JSON.stringify(raw.caps)} are not { usd?, contextK? } figures - the Settings caps apply`)
  }
  return chat
}

/** Exported for `verify:notes notes.gate.3` — the record's on-disk arms are checked where they are parsed. */
export function parseFileSource(raw: unknown, id: string, warnings: string[]): FileSource | null {
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
  // M27's note flag, and it is deliberately NOT all-or-drop like `path` above.
  // A path is the FACT a file panel is made of; `prose` is a display
  // convenience, so a malformed one drops the FIELD and keeps the panel — the
  // toolbox `label` precedent, and the right trade: a note that reopens as a
  // code view is a wrong view, while a dropped panel is no view at all.
  //
  // Accepted only when it is EXACTLY `true`, never merely truthy: the field is
  // declared `prose?: true`, so absent is the other half of a two-state fact
  // rather than a third state, and coercing `"yes"` would carry a value the
  // type says cannot exist.
  const checklist = parseChecklistView(raw.checklist)
  if (checklist.kind === 'malformed' || ('checklist' in raw && checklist.kind === 'absent')) warnings.push(`file panel ${id}: malformed checklist view dropped`)
  // M250. A malformed import record drops the RECORD and keeps the panel, and
  // is never coerced into a reviewed one — dropping it makes the note an
  // ordinary note, which is the one loss a person can see (the banner is gone)
  // rather than a silent "someone read this".
  const imported = parseImportedNote(raw.imported)
  if (imported.kind === 'malformed') warnings.push(`file panel ${id}: malformed imported-note record dropped`)
  // M248. The same three states; a malformed view costs the VIEW by name, never the panel.
  const deck = parseDeckView(raw.deck)
  if (deck.kind === 'malformed') warnings.push(`file panel ${id}: malformed deck view dropped (${deck.reason})`)
  // M245. The same drop-the-field rule: a malformed sheet view reopens the file as a plain file panel.
  const sheet = parseSheetView(raw.sheet)
  if (sheet.kind === 'malformed' || ('sheet' in raw && sheet.kind === 'absent')) warnings.push(`file panel ${id}: malformed sheet view dropped`)
  if (sheet.kind === 'view' && sheet.dropped !== undefined) warnings.push(`file panel ${id}: malformed sheet ${sheet.dropped.join(' and ')} dropped`)
  return { path, ...(raw.prose === true ? { prose: true as const } : {}), ...(checklist.kind === 'view' ? { checklist: checklist.view } : {}), ...(sheet.kind === 'view' ? { sheet: sheet.view } : {}), ...(imported.kind === 'view' ? { imported: imported.view } : {}), ...(deck.kind === 'view' ? { deck: deck.view } : {}) }
}


/**
 * M195 (D03). A preview's source, off disk. Three answers, and the middle one
 * is the milestone's rule: absent is unbound (every pre-M195 record, warning
 * nothing); a usable binding is kept with its root NORMALISED, so the on-disk
 * form and the form the reload rule compares against are the same string; and
 * anything else costs the FIELD with a warning naming the panel, never the
 * panel itself — a preview that vanished because its source was misspelled
 * reads as one the app deleted, which is `device`'s reason a milestone earlier.
 *
 * `root` must be ABSOLUTE. A relative one would have to be resolved against a
 * root nobody chose (`shared/places.ts`'s rule), and the pane would then follow
 * whatever that guess happened to hit. `sourcePanelId` is provenance that may
 * dangle, so a malformed one costs that KEY alone: the folder is the half that
 * does the work, and dropping it over a bad id would be the field-for-a-field
 * trade this parser exists to refuse.
 */
function parsePreviewBinding(value: unknown, id: string, warnings: string[]): PreviewBinding | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    warnings.push(`browser panel ${id}: preview ${JSON.stringify(value)} is not a source binding — the pane is kept, bound to nothing`)
    return undefined
  }
  const record = value as Record<string, unknown>
  const root = typeof record.root === 'string' ? normalisePreviewPath(record.root) : null
  if (root === null) {
    warnings.push(`browser panel ${id}: preview root ${JSON.stringify(record.root)} is not an absolute folder — the pane is kept, bound to nothing`)
    return undefined
  }
  // M252. `reviewed` FAILS CLOSED, the template rule: `true` normalises to
  // absent, and any other present value keeps the pane unread with a warning
  // — a corrupted flag must never be the thing that starts somebody's code.
  const rawReviewed = record.reviewed
  const unread = rawReviewed !== undefined && rawReviewed !== true
  if (unread && rawReviewed !== false) warnings.push(`browser panel ${id}: preview reviewed ${JSON.stringify(rawReviewed)} is not a boolean — the pane stays unread`)
  // The capability lists are a DISPLAY of what arrived: a malformed one drops
  // the field (the pane still refuses to run until read) rather than the pane.
  const rawTool = record.tool
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
  let tool: PreviewBinding['tool']
  if (rawTool !== undefined) {
    const t = rawTool as Record<string, unknown> | null
    if (t !== null && typeof t === 'object' && strings(t.files) && strings(t.network) && strings(t.commands)) tool = { files: t.files, network: t.network, commands: t.commands }
    else warnings.push(`browser panel ${id}: preview tool capabilities were malformed and dropped`)
  }
  const extra = { ...(unread ? { reviewed: false as const } : {}), ...(tool === undefined ? {} : { tool }) }
  const rawSource = record.sourcePanelId
  if (rawSource !== undefined && (typeof rawSource !== 'string' || rawSource === '')) {
    warnings.push(`browser panel ${id}: preview sourcePanelId ${JSON.stringify(rawSource)} is not a panel id — the folder ${root} is still bound`)
    return { root, ...extra }
  }
  return { root, ...(rawSource === undefined ? {} : { sourcePanelId: rawSource }), ...extra }
}

export function parsePanel(
  raw: unknown,
  seen: Set<string>,
  warnings: string[]
): PersistedPanel | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a panel that was not an object')
    return null
  }
  const { id, x, y, w, h, z, cwd, command, args, title, agent, agentOptions, worktree, fontSize, env } = raw
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
    // M92. Three layout facts, each absent unless set: `true` round-trips, an
    // explicit false is stored as absent, anything else warns by id and costs
    // the field. A restore rect must be four finite numbers or it is dropped.
    ...(parseFlag(raw.locked, 'locked', id, warnings) ? { locked: true as const } : {}),
    ...(parseFlag(raw.pinned, 'pinned', id, warnings) ? { pinned: true as const } : {}),
    ...(parseMaximised(raw.maximised, id, warnings)),
    // M182. The canvas binding: which template's node this panel was minted
    // from. Absent stays absent; a malformed one costs the FIELD by name,
    // never the panel — a binding names an edit route, not the panel's life.
    ...(parseTemplateBinding(raw.templateBinding, id, warnings)),
    // M130. Absent stays absent; the one word round-trips; anything else
    // warns by id and costs the FIELD, never the panel.
    ...(raw.skillTrail === undefined
      ? {}
      : raw.skillTrail === 'collapsed'
        ? { skillTrail: 'collapsed' as const }
        : (warnings.push(`dropped panel ${id}'s skillTrail: ${JSON.stringify(raw.skillTrail)} is not "collapsed"`), {})),
    // M49. Absent stays absent; present-but-unusable costs the FIELD, never
    // the panel — a per-entry failure at one level down.
    ...(fontSize === undefined ? {} : (typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize >= 9 && fontSize <= 24
      ? { fontSize }
      : (warnings.push(`dropped panel ${id}'s fontSize: ${JSON.stringify(fontSize)} is not a number in [9, 24]`), {}))),
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
  if (kind === 'github') return { ...base, kind: 'github' }
  if (kind === 'toolbox') {
    const source = parseToolboxSource(raw.source, id, warnings)
    if (source === null) return null
    return { ...base, kind: 'toolbox', source }
  }
  if (kind === 'memory') {
    // A memory node's source is a repository root and nothing else; an
    // unusable one drops the PANEL by name, like every other kind's source.
    const source = raw.source
    if (!isRecord(source) || !isStr(source.root) || source.root.trim() === '') {
      warnings.push(`dropped memory panel ${id}: source root was unusable`)
      return null
    }
    return { ...base, kind: 'memory', source: { root: source.root } }
  }
  if (kind === 'watcher') {
    const watch = parseWatch((raw as Record<string, unknown>).watch, id, warnings)
    if (watch === null) return null
    return { ...base, kind: 'watcher', watch }
  }
  if (kind === 'chat') {
    const chat = parseChatSource((raw as Record<string, unknown>).chat, id, warnings)
    if (chat === null) return null
    return { ...base, kind: 'chat', chat }
  }
  if (kind === 'browser') {
    // M103. The url is checked HERE, not only when the guest attaches: a
    // record with a file: url would otherwise sit on the canvas as a panel
    // whose guest main refused, blank, with the reason in main's log only.
    const url = (raw as Record<string, unknown>).url
    if (!isStr(url) || !isReadableUrl(url)) {
      warnings.push(`dropped browser panel ${id}: url ${JSON.stringify(url)} is not an http(s) page`)
      return null
    }
    const deviceRaw = (raw as Record<string, unknown>).device
    let device: DeviceWidthId | undefined
    if (deviceRaw !== undefined) {
      if (isDeviceWidthId(deviceRaw)) device = deviceRaw
      else warnings.push(`browser panel ${id}: device ${JSON.stringify(deviceRaw)} is not one of ${DEVICE_WIDTHS.map((d) => d.id).join(', ')} — the panel is kept at full width`)
    }
    const preview = parsePreviewBinding((raw as Record<string, unknown>).preview, id, warnings)
    return { ...base, kind: 'browser', url, ...(device === undefined ? {} : { device }), ...(preview === undefined ? {} : { preview }) }
  }
  if (kind === 'relay') {
    const relay = (raw as Record<string, unknown>).relay as Record<string, unknown> | undefined
    const program = relay?.program
    if (typeof relay !== 'object' || relay === null || !isStr(program) || !RELAY_PROGRAM.test(program)) {
      warnings.push(`dropped relay panel ${id}: relay.program ${JSON.stringify(program)} is not a program name`)
      return null
    }
    let sessionId: string | undefined
    if (relay.sessionId !== undefined) {
      if (isStr(relay.sessionId) && RELAY_SESSION_ID.test(relay.sessionId)) sessionId = relay.sessionId
      else warnings.push(`relay panel ${id}: relay.sessionId is malformed — the panel is kept and starts a new session`)
    }
    let shareId: string | undefined
    if (relay.shareId !== undefined) {
      if (isStr(relay.shareId) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(relay.shareId)) shareId = relay.shareId
      else warnings.push(`relay panel ${id}: relay.shareId is malformed — the panel is kept, unshared`)
    }
    return { ...base, kind: 'relay', relay: { program, ...(sessionId === undefined ? {} : { sessionId }), ...(shareId === undefined ? {} : { shareId }) } }
  }
  if (kind === 'work') {
    // M116. The item id is the card's only identity, so an unusable one
    // drops the PANEL by name: a card naming no record would sit on the
    // canvas saying "no longer on the board" about an item that never was.
    const work = (raw as Record<string, unknown>).work
    if (!isRecord(work) || !isStr(work.itemId) || work.itemId.trim() === '') {
      warnings.push(`dropped work panel ${id}: work.itemId was not a string`)
      return null
    }
    return { ...base, kind: 'work', work: { itemId: work.itemId } }
  }
  if (kind === 'skill') {
    // M128. Both fields are the panel's whole identity, so an unusable one
    // drops the PANEL by name — a skill panel naming no scope could not ask
    // any inventory for an entry and would render six unknown sections
    // about nothing. The scope is checked against the closed set for the
    // reason parseSkillKey checks it: `local` is a scope and `wherever` is
    // not, and coercing would put a panel on the canvas that can never match.
    const skill = (raw as Record<string, unknown>).skill
    if (!isRecord(skill) || !isStr(skill.name) || skill.name.trim() === '') {
      // M137. Two sentences: an absent record and a present record with a bad
      // name are different files, and "skill.name was not a string" about a
      // record that has no `skill` at all sent a reader looking for a field.
      warnings.push(!isRecord(skill) ? `dropped skill panel ${id}: it carried no skill record` : `dropped skill panel ${id}: skill.name was not a string`)
      return null
    }
    if (skill.scope !== 'user' && skill.scope !== 'project' && skill.scope !== 'local') {
      warnings.push(`dropped skill panel ${id}: skill.scope ${JSON.stringify(skill.scope)} is not a scope`)
      return null
    }
    return { ...base, kind: 'skill', skill: { scope: skill.scope, name: skill.name } }
  }
  if (kind === 'workflow') {
    // M133. The template id is the panel's only identity, so an unusable one
    // drops the PANEL by name — the work card's own rule. A panel naming no
    // template would sit on the canvas saying "that template is gone" about
    // one that never existed.
    const workflow = (raw as Record<string, unknown>).workflow
    if (!isRecord(workflow) || !isStr(workflow.templateId) || workflow.templateId.trim() === '') {
      warnings.push(`dropped workflow panel ${id}: workflow.templateId was not a string`)
      return null
    }
    return { ...base, kind: 'workflow', workflow: { templateId: workflow.templateId } }
  }
  if (kind === 'image') {
    // M181. The path is the panel's only identity: absent, not a string or
    // RELATIVE drops the PANEL by name (a picture panel saying `missing`
    // about a file the record never named, or a different file per cwd).
    const image = (raw as Record<string, unknown>).image
    if (!isRecord(image) || !isStr(image.path) || !image.path.startsWith('/')) {
      warnings.push(`dropped image panel ${id}: image.path was not an absolute path`)
      return null
    }
    const assetRaw = image.asset
    let asset: string | undefined
    if (assetRaw !== undefined) {
      if (isAssetId(assetRaw)) asset = assetRaw
      else warnings.push(`image panel ${id}: image.asset ${JSON.stringify(assetRaw)} is not a sha-256 asset id — the picture is kept and its store identity dropped`)
    }
    const artifact = image.artifact === undefined ? undefined : parseArtifactReference(image.artifact)
    if (image.artifact !== undefined && artifact === undefined) warnings.push(`image panel ${id}: malformed artifact provenance dropped`)
    return { ...base, kind: 'image', image: { path: image.path, ...(asset === undefined ? {} : { asset }), ...(artifact === undefined ? {} : { artifact }) } }
  }
  if (kind === 'note') {
    const note = (raw as Record<string, unknown>).note
    if (!isRecord(note) || !isNoteForm(note.form)) {
      warnings.push(`dropped note panel ${id}: note.form was not one of ${NOTE_FORMS.join(', ')}`)
      return null
    }
    const text = isStr(note.text) ? normaliseNoteText(note.text) : ''
    if (note.text !== undefined && !isStr(note.text)) warnings.push(`note panel ${id}: note.text was not a string — the note is kept, empty`)
    let tint: NoteTint | undefined
    if (note.tint !== undefined) {
      if (!isNoteTint(note.tint)) warnings.push(`note panel ${id}: note.tint ${JSON.stringify(note.tint)} is not one of ${NOTE_TINTS.join(', ')} — the note is kept untinted`)
      else if (note.form !== 'sticky') warnings.push(`note panel ${id}: only a sticky note carries a tint — the note is kept untinted`)
      else tint = note.tint
    }
    return { ...base, kind: 'note', note: { form: note.form, text, ...(tint === undefined ? {} : { tint }) } }
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
  if (parseWorktreeFlag(worktree, `panel ${id}`, warnings)) panel.worktree = true
  const panelEnv = parseEnvMap(env, `panel ${id}`, warnings)
  if (panelEnv !== undefined) panel.env = panelEnv
  return panel
}

