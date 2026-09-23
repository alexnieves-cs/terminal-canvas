/**
 * M304. The Watch lens's model: what the sessions of this workspace are DOING,
 * read from the tool calls their transcripts already hold, as a list of files
 * (towers) and a list of keyed events (reads, writes, runs) the scene animates.
 *
 * Pure and plain-node testable, like the rest of `orchestration-*.ts`; the
 * view hands it the blocks, the scene draws what comes back. Three rules, each
 * of which fails silently if broken:
 *
 *   - AN EVENT IS KEYED BY ITS TOOL CALL'S ID, never by its position. The scene
 *     animates only keys it has not seen; a positional key re-fires every event
 *     after a transcript reloads or a turn is spliced in, and the scene replays
 *     the whole session as if it had just happened.
 *   - THE TOKEN A WRITE CARRIES IS AGENT OUTPUT. It crosses the caller's scrub
 *     (OrchestrationView passes `outward`) before it is a string in the model,
 *     because the scene paints it onto a texture where no later reader can
 *     redact it — the same reason every HUD reader crosses the gate (orch.gate.2).
 *   - A TOWER'S HEIGHT IS THE LINES THE SESSIONS WROTE, and its label says the
 *     number. It is not a hidden score (the platforms' rule, M291): a person
 *     reading `+12 −2` beside a tower is reading what the tower's height means.
 *     It is NOT git's count — the workbench's Changes tab is that — and the
 *     scene's caption says "as written by sessions" so the two are never
 *     mistaken for each other.
 */

import type { ContentBlock } from '@shared/transcript'
import { TONE_NEEDS_YOU, TONE_WORKING } from '@renderer/panels/panel-state'
import { relativeToCheckout } from '@shared/combine'

export type OrchLiveKind = 'read' | 'write' | 'run' | 'other'

export interface OrchLiveTool {
  kind: OrchLiveKind
  /** The file a read or write touched, as the tool named it. */
  path?: string
  added: number
  removed: number
  /** The raw first line a write carried, BEFORE the scrub — buildOrchLive scrubs it. */
  rawToken?: string
  /** A run's command line, raw. */
  command?: string
}

/** The panel-state tones (state.2: the words live in panel-state.ts), narrowed to the four Watch draws. */
export type OrchLiveState = typeof TONE_WORKING | 'needs-you' | 'idle' | 'exited'
export const ORCH_LIVE_NEEDS_YOU = TONE_NEEDS_YOU as 'needs-you'

export interface OrchLiveSessionInput {
  id: string
  title: string
  state: OrchLiveState
  /** The island (task) this session belongs to, or null when it is in none. */
  islandId: string | null
  /** Every block of every turn, oldest first — tool_use and tool_result are the ones read. */
  blocks: readonly ContentBlock[]
  /** A terminal's live command line (no blocks): one run event per distinct command. */
  command?: string
  /**
   * M311. The checkout the session works in (its cwd — a lane's worktree).
   * A file is keyed by checkout + repo-relative path, so two lanes editing
   * `src/api.ts` in their OWN worktrees are one file changed in separate
   * checkouts (`alsoIn`), never `contended`; two sessions in ONE checkout
   * are. Absent keeps the old key (the raw path) — one unnamed checkout.
   */
  checkout?: string
}

export interface OrchLiveEvent {
  /** `${sessionId}:${toolUseId}` — stable across reloads (this file's header). */
  key: string
  sessionId: string
  kind: OrchLiveKind
  path?: string
  /** Scrubbed, at most ORCH_LIVE_TOKEN_MAX characters. */
  token?: string
  command?: string
  /** A run's outcome from its tool_result; null while it runs or when nothing says. */
  ok: boolean | null
  added: number
  removed: number
  /** A present-tense sentence: `Writing src/health.ts`. */
  say: string
}

export interface OrchLiveFile {
  path: string
  /** The last path segment, for the label. */
  name: string
  added: number
  removed: number
  reads: number
  /** Session ids that WROTE it, first writer first. */
  writers: string[]
  /** The island most of its writes came from (or its readers', for a file only read). */
  islandId: string | null
  /** Two or more sessions wrote it IN THE SAME CHECKOUT: nobody can be named as its author. */
  contended: boolean
  /** M311. The checkout this tower is in, when the sessions said. */
  checkout?: string
  /**
   * M311. How many OTHER checkouts wrote the same repo-relative path — the
   * separate-lane overlap that meets at integration (Combine), as distinct
   * from `contended`, which is a hazard now.
   */
  alsoIn: number
}

export interface OrchLiveSession {
  id: string
  title: string
  state: OrchLiveState
  islandId: string | null
  /** The session's latest event, if any — the callout's sentence. */
  latest: OrchLiveEvent | null
}

export interface OrchLiveModel {
  sessions: OrchLiveSession[]
  files: OrchLiveFile[]
  /** Files past the tower cap, counted rather than dropped. */
  moreFiles: number
  /** Every event, oldest first. */
  events: OrchLiveEvent[]
}

export const ORCH_LIVE_TOKEN_MAX = 30
/** Towers past this many are counted in `moreFiles`: a hundred towers is a city, not a view. */
export const ORCH_LIVE_TOWER_CAP = 12
/** One slab stands for this many changed lines; the label carries the exact number. */
export const ORCH_LIVE_LINES_PER_SLAB = 4
export const ORCH_LIVE_SLAB_CAP = 24

const READ_TOOLS = new Set(['read', 'view', 'grep', 'glob', 'ls', 'search', 'notebookread', 'find', 'fetch', 'webfetch', 'read_file', 'list_dir'])
const WRITE_TOOLS = new Set(['edit', 'multiedit', 'write', 'notebookedit', 'create', 'str_replace', 'str_replace_editor', 'apply_patch', 'delete', 'move', 'write_file', 'edit_file'])
const RUN_TOOLS = new Set(['bash', 'shell', 'execute', 'exec_command', 'run_terminal_cmd', 'powershell'])

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

function lineCount(text: string | undefined): number {
  if (text === undefined || text === '') return 0
  return text.split('\n').length
}

function firstLine(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  const line = text.split('\n').map((l) => l.trim()).find((l) => l !== '')
  return line
}

/** ACP's `locations: [{ path }]`, claude's `file_path`, copilot's `path`, notebooks' `notebook_path`. */
function pathOf(input: Record<string, unknown>): string | undefined {
  const locations = input['locations']
  if (Array.isArray(locations) && locations.length > 0 && typeof locations[0] === 'object' && locations[0] !== null) {
    const p = str((locations[0] as Record<string, unknown>)['path'])
    if (p !== undefined) return p
  }
  return str(input['file_path']) ?? str(input['notebook_path']) ?? str(input['path']) ?? str(input['target_file'])
}

/**
 * A codex/apply_patch body: `*** Update File: x` / `*** Add File: x` headers, then
 * `+`/`-` lines. The first file is the one the tower grows on; the counts are the
 * whole patch's, since one tool call is one write.
 */
function patchWrite(patch: string): OrchLiveTool {
  const header = /\*\*\* (?:Update|Add|Delete) File: (.+)/.exec(patch)
  let added = 0
  let removed = 0
  let token: string | undefined
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('***')) continue
    if (line.startsWith('+')) { added++; if (token === undefined && line.slice(1).trim() !== '') token = line.slice(1).trim() }
    else if (line.startsWith('-')) removed++
  }
  return { kind: 'write', ...(header?.[1] !== undefined ? { path: header[1].trim() } : {}), added, removed, ...(token !== undefined ? { rawToken: token } : {}) }
}

/**
 * One tool call → what it did. Engine-neutral by NAME (case-insensitive), with
 * the input shape read defensively: an unknown tool is `other`, never dropped —
 * the scene still pulses the session's core for it.
 */
export function orchLiveTool(name: string, input: Record<string, unknown>): OrchLiveTool {
  const n = name.toLowerCase()
  if (RUN_TOOLS.has(n)) {
    const command = str(input['command']) ?? (Array.isArray(input['command']) ? (input['command'] as unknown[]).map(String).join(' ') : undefined) ?? str(input['cmd'])
    return { kind: 'run', added: 0, removed: 0, ...(command !== undefined ? { command } : {}) }
  }
  if (n === 'apply_patch' && (str(input['patch']) ?? str(input['input'])) !== undefined) return patchWrite((str(input['patch']) ?? str(input['input']))!)
  if (WRITE_TOOLS.has(n)) {
    const path = pathOf(input)
    let added = 0
    let removed = 0
    let token: string | undefined
    const edits = Array.isArray(input['edits']) ? (input['edits'] as unknown[]).filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null) : null
    if (edits !== null) {
      for (const e of edits) { added += lineCount(str(e['new_string'])); removed += lineCount(str(e['old_string'])); token ??= firstLine(str(e['new_string'])) }
    } else {
      const next = str(input['new_string']) ?? str(input['content']) ?? str(input['new_source']) ?? str(input['file_text']) ?? str(input['new_str'])
      added = lineCount(next)
      removed = lineCount(str(input['old_string']) ?? str(input['old_str']))
      token = firstLine(next)
    }
    if (n === 'delete') { removed = Math.max(removed, 1); added = 0 }
    return { kind: 'write', ...(path !== undefined ? { path } : {}), added, removed, ...(token !== undefined ? { rawToken: token } : {}) }
  }
  if (READ_TOOLS.has(n)) {
    const path = pathOf(input)
    return { kind: 'read', ...(path !== undefined ? { path } : {}), added: 0, removed: 0 }
  }
  return { kind: 'other', added: 0, removed: 0 }
}

function baseName(path: string): string {
  const parts = path.split('/').filter((p) => p !== '')
  return parts[parts.length - 1] ?? path
}

/** Cut to the cap on a character boundary; an ellipsis says it was cut. */
export function orchLiveClip(text: string, max = ORCH_LIVE_TOKEN_MAX): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** A path as a sentence shows it: its last two segments, `…/src/health.ts` — the full path is the workbench's. */
export function orchLiveShortPath(path: string): string {
  const parts = path.split('/').filter((p) => p !== '')
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`
}

function sentence(tool: OrchLiveTool, name: string): string {
  if (tool.kind === 'read') return tool.path !== undefined ? `Reading ${orchLiveShortPath(tool.path)}` : `Searching with ${name}`
  if (tool.kind === 'write') {
    if (tool.path === undefined) return `Writing with ${name}`
    return tool.added === 0 && tool.removed > 0 ? `Removing lines from ${orchLiveShortPath(tool.path)}` : `Writing ${orchLiveShortPath(tool.path)}`
  }
  if (tool.kind === 'run') return tool.command !== undefined ? `Running ${orchLiveClip(tool.command, 48)}` : 'Running a command'
  return `Using ${name}`
}

/**
 * The model. `scrub` is the caller's outward gate — it receives every string that
 * came out of an agent (a write's token, a command line) and returns what may be
 * painted. Paths are the tool's own arguments and are shown as the workbench shows
 * them; they cross the scrub too, since a path can carry a token like any string.
 */
export function buildOrchLive(inputs: readonly OrchLiveSessionInput[], scrub: (text: string, sessionId: string) => string): OrchLiveModel {
  const events: OrchLiveEvent[] = []
  const files = new Map<string, OrchLiveFile & { islandVotes: Map<string | null, number> }>()
  const sessions: OrchLiveSession[] = []
  const touch = (raw: string, islandId: string | null, checkout: string | undefined): OrchLiveFile & { islandVotes: Map<string | null, number> } => {
    const path = relativeToCheckout(raw, checkout)
    const key = `${checkout ?? ''}\0${path}`
    let f = files.get(key)
    if (f === undefined) { f = { path, name: baseName(path), added: 0, removed: 0, reads: 0, writers: [], islandId: null, contended: false, ...(checkout === undefined ? {} : { checkout }), alsoIn: 0, islandVotes: new Map() }; files.set(key, f) }
    f.islandVotes.set(islandId, (f.islandVotes.get(islandId) ?? 0) + 1)
    return f
  }
  for (const s of inputs) {
    const results = new Map<string, boolean>()
    for (const b of s.blocks) if (b.type === 'tool_result') results.set(b.toolUseId, !b.isError)
    let latest: OrchLiveEvent | null = null
    for (const b of s.blocks) {
      if (b.type !== 'tool_use') continue
      const tool = orchLiveTool(b.name, b.input)
      const path = tool.path !== undefined ? scrub(tool.path, s.id) : undefined
      const token = tool.rawToken !== undefined ? orchLiveClip(scrub(tool.rawToken, s.id)) : undefined
      const command = tool.command !== undefined ? scrub(tool.command, s.id) : undefined
      const shown: OrchLiveTool = { ...tool, ...(path !== undefined ? { path } : {}), ...(command !== undefined ? { command } : {}) }
      const ev: OrchLiveEvent = {
        key: `${s.id}:${b.id}`,
        sessionId: s.id,
        kind: tool.kind,
        ...(path !== undefined ? { path } : {}),
        ...(token !== undefined ? { token } : {}),
        ...(command !== undefined ? { command } : {}),
        ok: tool.kind === 'run' ? (results.get(b.id) ?? null) : null,
        added: tool.added,
        removed: tool.removed,
        say: sentence(shown, b.name)
      }
      events.push(ev)
      latest = ev
      if (path !== undefined && (tool.kind === 'write' || tool.kind === 'read')) {
        const f = touch(path, s.islandId, s.checkout)
        if (tool.kind === 'read') f.reads++
        else {
          f.added += tool.added
          f.removed += tool.removed
          if (!f.writers.includes(s.id)) f.writers.push(s.id)
          // A write votes twice: a file lives where it is written, not where it is read.
          f.islandVotes.set(s.islandId, (f.islandVotes.get(s.islandId) ?? 0) + 1)
        }
      }
    }
    if (s.command !== undefined && s.command.trim() !== '') {
      const command = scrub(s.command, s.id)
      const ev: OrchLiveEvent = { key: `${s.id}:cmd:${command}`, sessionId: s.id, kind: 'run', command, ok: null, added: 0, removed: 0, say: `Running ${orchLiveClip(command, 48)}` }
      events.push(ev)
      latest = ev
    }
    sessions.push({ id: s.id, title: s.title, state: s.state, islandId: s.islandId, latest })
  }
  const all = [...files.values()].map((f) => {
    let best: string | null = null
    let votes = -1
    for (const [island, n] of f.islandVotes) if (n > votes) { best = island; votes = n }
    const { islandVotes: _votes, ...rest } = f
    return { ...rest, islandId: best, contended: f.writers.length > 1 }
  })
  // M311. The same relative path WRITTEN in other checkouts: overlap, not contention.
  for (const f of all) {
    if (f.writers.length === 0) continue
    f.alsoIn = new Set(all.filter((g) => g !== f && g.path === f.path && g.writers.length > 0 && g.checkout !== f.checkout).map((g) => g.checkout ?? '')).size
  }
  // Written files first (by lines written), then read-only files by reads: the
  // towers a person came to watch are the ones changing.
  all.sort((a, b) => (b.added + b.removed) - (a.added + a.removed) || b.reads - a.reads || a.path.localeCompare(b.path))
  return { sessions, files: all.slice(0, ORCH_LIVE_TOWER_CAP), moreFiles: Math.max(0, all.length - ORCH_LIVE_TOWER_CAP), events }
}

/** Slabs for a file: one per ORCH_LIVE_LINES_PER_SLAB changed lines, at least one once written, capped. */
export function orchLiveSlabs(f: Pick<OrchLiveFile, 'added' | 'removed'>): { added: number; removed: number } {
  const per = ORCH_LIVE_LINES_PER_SLAB
  const added = f.added > 0 ? Math.max(1, Math.ceil(f.added / per)) : 0
  const removed = f.removed > 0 ? Math.max(1, Math.ceil(f.removed / per)) : 0
  const total = added + removed
  if (total <= ORCH_LIVE_SLAB_CAP) return { added, removed }
  const a = Math.round((added / total) * ORCH_LIVE_SLAB_CAP)
  return { added: a, removed: ORCH_LIVE_SLAB_CAP - a }
}

/**
 * The events the scene has not animated yet, in order, and the new seen-set.
 * The FIRST call (seen === null) animates nothing: what happened before the
 * lens opened is history, drawn as towers already standing, never replayed.
 * A burst larger than `max` animates its last `max`; the rest are already in
 * the towers (their heights come from the model, not from the animation).
 */
export function orchLiveFresh(events: readonly OrchLiveEvent[], seen: ReadonlySet<string> | null, max = 8): { fresh: OrchLiveEvent[]; seen: Set<string> } {
  const next = new Set(events.map((e) => e.key))
  if (seen === null) return { fresh: [], seen: next }
  const fresh = events.filter((e) => !seen.has(e.key))
  return { fresh: fresh.slice(-max), seen: next }
}

/** A platform in the Watch scene, world units (x/z on the floor), axis-aligned; the mesh turns it 45°. */
export interface OrchLivePlatform {
  /** The island's id, or null for the sessions no task names. */
  id: string | null
  label: string
  primary: boolean
  x: number
  z: number
  size: number
  sessions: { id: string; x: number; z: number }[]
  files: { path: string; x: number; z: number }[]
}

export const ORCH_LIVE_PLATFORM_CAP = 7
const FILE_PITCH = 2.3

/**
 * Where everything stands. The focused island is the centre platform; the other
 * islands ring it (at most ORCH_LIVE_PLATFORM_CAP platforms — the rest fold into
 * the "Not in a task" plate so no session silently disappears); sessions stand on
 * their island's rim, towers in a grid at its middle. Deterministic from its
 * inputs so a re-render never moves a tower a person is watching.
 */
export function orchLiveLayout(model: OrchLiveModel, islands: readonly { id: string; label: string }[], primaryId: string | null): OrchLivePlatform[] {
  const known = new Set(islands.map((i) => i.id))
  const ordered = [...islands].sort((a, b) => (a.id === primaryId ? -1 : b.id === primaryId ? 1 : 0))
  const shown = ordered.slice(0, ORCH_LIVE_PLATFORM_CAP - 1)
  const shownIds = new Set(shown.map((i) => i.id))
  const home = (islandId: string | null): string | null => (islandId !== null && known.has(islandId) && shownIds.has(islandId) ? islandId : null)
  const groups: { id: string | null; label: string }[] = [...shown]
  const strays = model.sessions.some((s) => home(s.islandId) === null) || model.files.some((f) => home(f.islandId) === null)
  if (strays) groups.push({ id: null, label: 'Not in a task' })
  const plates = groups.map((g, i) => {
    const sessions = model.sessions.filter((s) => home(s.islandId) === g.id)
    const files = model.files.filter((f) => home(f.islandId) === g.id)
    const cols = Math.max(1, Math.ceil(Math.sqrt(files.length)))
    const grid = cols * FILE_PITCH
    const ring = Math.max(sessions.length * 1.25 / Math.PI, 1.6)
    const size = Math.max(i === 0 ? 7 : 4.5, grid + 3, ring * 2 + 1.6)
    return { g, sessions, files, cols, size, primary: i === 0 && g.id !== null && g.id === (primaryId ?? shown[0]?.id) }
  })
  const centre = plates[0]?.size ?? 0
  const others = plates.length - 1
  return plates.map((p, i) => {
    let x = 0
    let z = 0
    if (i > 0) {
      // Ring the centre, starting at the front-left so the first neighbours face the camera.
      const angle = Math.PI * 0.75 + ((i - 1) / Math.max(1, others)) * Math.PI * 2
      const r = centre / 2 + p.size / 2 + 3.2
      x = Math.cos(angle) * r
      z = Math.sin(angle) * r
    }
    const ringR = p.size * 0.5 - 0.9
    const sessions = p.sessions.map((s, k) => {
      const a = Math.PI * 0.8 + (k / Math.max(1, p.sessions.length)) * Math.PI * 2
      return { id: s.id, x: x + Math.cos(a) * ringR, z: z + Math.sin(a) * ringR }
    })
    const start = -((p.cols - 1) * FILE_PITCH) / 2
    const files = p.files.map((f, k) => ({ path: f.path, x: x + start + (k % p.cols) * FILE_PITCH, z: z + start + Math.floor(k / p.cols) * FILE_PITCH }))
    return { id: p.g.id, label: p.g.label, primary: p.primary, x, z, size: p.size, sessions, files }
  })
}

/**
 * Brief #16. A BATCH is what the scene animates and the log says: a run of
 * consecutive fresh events from one session that are the same act on the same
 * thing — five edits to one file are one flight carrying `+14 −3`, a sweep of
 * reads is one "Read 6 files". Without it a burst of forty edits is forty
 * overlapping arcs nobody can read, and the callout's sentence changes faster
 * than it can be read. Commands never merge: each one has its own outcome.
 */
export interface OrchLiveBatch {
  /** The first event's key: stable, so a re-render never re-fires a batch. */
  key: string
  sessionId: string
  kind: OrchLiveKind
  /** Present when every event in the batch touched the same path. */
  path?: string
  /** Every distinct path the batch touched, first first — a read sweep scans each tower. */
  paths: string[]
  count: number
  added: number
  removed: number
  /** The LAST write's token — what the file looks like now. */
  token?: string
  command?: string
  ok: boolean | null
  keys: string[]
}

export function orchLiveBatch(events: readonly OrchLiveEvent[]): OrchLiveBatch[] {
  const out: OrchLiveBatch[] = []
  for (const e of events) {
    const prev = out[out.length - 1]
    const joins = prev !== undefined && prev.sessionId === e.sessionId && prev.kind === e.kind && e.kind !== 'run' &&
      (e.kind === 'read' || e.kind === 'other' || (e.path !== undefined && prev.path === e.path))
    if (joins) {
      prev.count++
      prev.added += e.added
      prev.removed += e.removed
      prev.keys.push(e.key)
      if (e.token !== undefined) prev.token = e.token
      if (e.path !== undefined && !prev.paths.includes(e.path)) prev.paths.push(e.path)
      if (prev.path !== e.path) delete prev.path
      continue
    }
    out.push({
      key: e.key, sessionId: e.sessionId, kind: e.kind,
      ...(e.path !== undefined ? { path: e.path } : {}),
      paths: e.path !== undefined ? [e.path] : [],
      count: 1, added: e.added, removed: e.removed,
      ...(e.token !== undefined ? { token: e.token } : {}),
      ...(e.command !== undefined ? { command: e.command } : {}),
      ok: e.ok, keys: [e.key]
    })
  }
  return out
}

/**
 * Commands that were running and now say how they ended. A run's event is
 * keyed by its tool call, so when its tool_result lands the event is not FRESH
 * (orchLiveFresh would never see it again) — without this the outcome, the one
 * thing worth animating about a command, is never shown. `pending === null`
 * (the lens just opened) resolves nothing: an outcome from before is history.
 */
export function orchLiveOutcomes(events: readonly OrchLiveEvent[], pending: ReadonlySet<string> | null): { resolved: OrchLiveEvent[]; pending: Set<string> } {
  const next = new Set(events.filter((e) => e.kind === 'run' && e.ok === null).map((e) => e.key))
  if (pending === null) return { resolved: [], pending: next }
  return { resolved: events.filter((e) => pending.has(e.key) && e.ok !== null), pending: next }
}

/** A plain-words line for a batch or an outcome — the log reduced motion (and a paused view) reads instead of motion. */
export function orchLiveLogLine(b: OrchLiveBatch | { outcome: OrchLiveEvent }): string {
  if ('outcome' in b) {
    const cmd = b.outcome.command !== undefined ? orchLiveClip(b.outcome.command, 40) : 'A command'
    return `${cmd} ${b.outcome.ok === true ? 'passed' : 'failed'}`
  }
  const lines = b.added + b.removed > 0 ? ` +${b.added}${b.removed > 0 ? ` −${b.removed}` : ''}` : ''
  const edits = b.count > 1 ? ` (${b.count} edits)` : ''
  if (b.kind === 'write') return b.path !== undefined ? `Wrote ${orchLiveShortPath(b.path)}${lines}${edits}` : `Wrote${lines}${edits}`
  if (b.kind === 'read') return b.paths.length > 1 ? `Read ${b.paths.length} files` : b.path !== undefined ? `Read ${orchLiveShortPath(b.path)}` : `Searched ${b.count === 1 ? 'once' : `${b.count} times`}`
  if (b.kind === 'run') {
    const cmd = b.command !== undefined ? orchLiveClip(b.command, 40) : 'a command'
    return b.ok === null ? `Started ${cmd}` : `Ran ${cmd} — ${b.ok ? 'passed' : 'failed'}`
  }
  return b.count > 1 ? `Used ${b.count} tools` : 'Used a tool'
}
