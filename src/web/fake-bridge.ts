import type { CanvasBridge, SettingRow, WorkspaceRow } from '@shared/ipc-contract'
import type { AgentEvent, WorldConnection } from '@shared/world-events'
import type { AgentStateUpdate, PtyCreateResult, PtyDataChunk, PtyExitInfo } from '@shared/types'
import { EMPTY_MACHINE_COST } from '@shared/machine-cost'
import { SETTINGS, resolveSetting, type SettingValue } from '@shared/settings-schema'
import { startWorldSimulation, type WorldSim } from '../main/world-sim'
import { demoCanvas, type Cast, type CastPanel } from './demo-layout'
import { demoAgents, panelStateOf, recordingOpener, terminalLine } from './demo-script'
import { stubNamespace, DEMO_REFUSAL, type DoorShapes, type Notice } from './stub-door'

/**
 * Lane N (M565–M567). `window.canvas` for a page with no main process.
 *
 * TYPED where the demo answers: every door below is checked against
 * `CanvasBridge` (a `Partial` of each namespace), so a contract change that
 * renames or reshapes one of them is a type error here, not a blank demo.
 * Every door the demo does NOT answer comes from `stubNamespace`, which
 * answers in the shape the contract declares (stub-door.ts says how).
 *
 * The world is `world-sim` itself, the module `SIMULATE_AGENTS=true` runs in
 * main, given scripts keyed by the cast's panel ids: the same events reach
 * the World store (`world.onEvents`), the panel's state word
 * (`agent.onState`), and its terminal (`pty.onData`, as a recording).
 */

type Listener<T> = (value: T) => void

function channel<T>(): { on(listener: Listener<T>): () => void; emit(value: T): void; size(): number } {
  const listeners = new Set<Listener<T>>()
  return {
    on(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    emit(value) { for (const listener of [...listeners]) listener(value) },
    size: () => listeners.size
  }
}

/** A terminal keeps this many unread chunks while nothing is attached. */
const BACKLOG = 400

export interface DemoBridgeOptions {
  cast: Cast
  /** Says "in the app" for a door that would spawn or write. */
  notice: Notice
  /** Each door's declared return shape (scripts/lib/bridge-shapes.cjs), for the doors answered by stub. */
  shapes: DoorShapes
  home?: string
  appVersion?: string
  /** Injected so verify:demo runs the world in fake time. */
  timers?: Pick<Parameters<typeof startWorldSimulation>[0], 'now' | 'setTimeout' | 'clearTimeout' | 'random'>
}

export interface DemoBridge {
  bridge: CanvasBridge
  /** Starts on the first world subscriber (main.tsx subscribes at module scope). */
  stop(): void
  /**
   * Everything a panel's terminal has been sent, attached or not. xterm draws
   * to a canvas, so the page has no text to read back; this is what the smoke
   * test and verify:demo read instead.
   */
  transcript(panelId: string): string
}

export function createDemoBridge(options: DemoBridgeOptions): DemoBridge {
  const home = options.home ?? '/Users/you'
  const cwd = `${home}/steward`
  const { canvas, name } = demoCanvas(options.cast, cwd)
  const castPanels = new Map<string, CastPanel>()
  for (const task of options.cast.tasks) for (const panel of task.panels) castPanels.set(panel.id, panel)

  const data = channel<PtyDataChunk>()
  const exit = channel<PtyExitInfo>()
  const worldEvents = channel<unknown[]>()
  const worldConnection = channel<WorldConnection>()
  const agentState = channel<AgentStateUpdate>()
  const settingsChanged = channel<string>()
  const preferences: Record<string, SettingValue> = {}

  // A recording per panel. A chunk that lands before the terminal attaches
  // waits here, so a panel the camera reaches late still shows its history.
  const attached = new Set<string>()
  const backlog = new Map<string, string[]>()
  const sent = new Map<string, string>()
  const write = (panelId: string, text: string): void => {
    if (text === '') return
    sent.set(panelId, ((sent.get(panelId) ?? '') + text).slice(-20000))
    if (attached.has(panelId)) { data.emit({ panelId, data: text }); return }
    const queue = backlog.get(panelId) ?? []
    queue.push(text)
    if (queue.length > BACKLOG) queue.splice(0, queue.length - BACKLOG)
    backlog.set(panelId, queue)
  }
  for (const panel of castPanels.values()) write(panel.id, recordingOpener(panel))

  let sim: WorldSim | null = null
  const startWorld = (): void => {
    if (sim !== null) return
    const timers = options.timers ?? {
      now: Date.now,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      random: Math.random
    }
    sim = startWorldSimulation({
      ...timers,
      emit: (events: AgentEvent[]) => {
        worldEvents.emit(events)
        for (const event of events) {
          if (event.type === 'status') agentState.emit({ panelId: event.agentId, state: panelStateOf(event.payload) })
          write(event.agentId, terminalLine(event))
        }
      }
    }, demoAgents(options.cast))
  }

  const ptyRow = (panelId: string): PtyCreateResult => ({
    panelId,
    pid: 1000 + [...castPanels.keys()].indexOf(panelId),
    command: '/bin/sh',
    cwd: castPanels.get(panelId)?.folder ? `${cwd}/${castPanels.get(panelId)?.folder}` : cwd,
    reattached: true
  })

  const pty: Partial<CanvasBridge['pty']> = {
    // A cast panel "reattaches" to its recording. A panel the visitor makes
    // has no recording and nothing to run, so it says so in its own terminal.
    async create(spec) {
      attached.add(spec.panelId)
      if (!castPanels.has(spec.panelId)) {
        options.notice('pty.create')
        queueMicrotask(() => data.emit({ panelId: spec.panelId, data: 'A new terminal runs a shell in the app. This page is a demo, so there is no shell here.\r\n' }))
        return { ...ptyRow(spec.panelId), pid: 0, reattached: false }
      }
      const queued = backlog.get(spec.panelId) ?? []
      backlog.delete(spec.panelId)
      if (queued.length > 0) queueMicrotask(() => data.emit({ panelId: spec.panelId, data: queued.join('') }))
      return ptyRow(spec.panelId)
    },
    async write() { options.notice('pty.write') },
    async resize() { /* a recording has no size to change */ },
    async kill(panelId) { attached.delete(panelId) },
    // Every cast panel has a "session", so it restores reattachable rather than dormant.
    async list() { return [...castPanels.keys()].map(ptyRow) },
    onData: data.on,
    onExit: exit.on
  }

  const workspaceRow: WorkspaceRow = { id: 'w1', name, panelIds: canvas.panels.map((p) => p.id), active: true }

  const settingRows = (): SettingRow[] => SETTINGS.map((def) => ({
    id: def.id,
    label: def.label,
    description: def.description,
    keywords: [...def.keywords],
    type: def.type,
    value: resolveSetting(preferences, def.id),
    persisted: def.id in preferences,
    category: def.category,
    min: def.min,
    max: def.max,
    ...(def.values ? { values: [...def.values] } : {})
  }) as SettingRow)

  const real: { [K in keyof CanvasBridge]?: Partial<CanvasBridge[K]> } = {
    pty,
    layout: {
      async load() { return structuredClone(canvas) },
      async save() { /* the demo forgets on reload, by design */ }
    },
    workspace: {
      async list() { return [workspaceRow] }
    },
    settings: {
      async list() { return settingRows() },
      async set(id, value) {
        preferences[id] = value
        settingsChanged.emit(id)
      },
      onChanged: settingsChanged.on
    },
    agent: {
      onState: agentState.on,
      async acknowledge() { /* nothing to tell */ }
    },
    world: {
      onEvents(listener) {
        const off = worldEvents.on(listener)
        startWorld()
        return off
      },
      onConnection: worldConnection.on,
      async status() { return { state: 'live' } },
      async retry() { return { state: 'live' } }
    },
    // The reads the canvas makes on its own at boot whose answer is a
    // union, not a list. Each says the honest thing for a page with no disk,
    // no git and no account, in the union's own words, so the renderer takes
    // the path it already has for "not here" rather than meeting a null.
    git: {
      async status(root) {
        const panel = [...castPanels.values()].find((p) => p.folder !== undefined && root.endsWith(`/${p.folder}`)) as (CastPanel & { branch?: string }) | undefined
        if (panel?.branch === undefined) return { kind: 'unreadable', detail: 'The browser demo has no repository.' }
        return { kind: 'status', root, repository: root, branch: panel.branch, upstream: { name: `origin/${panel.branch}`, ahead: 2, behind: 0 } }
      }
    },
    ledger: {
      async timeline() { return { entries: [], reachedStart: true } },
      async usage() { return [] }
    },
    // A recording uses no CPU; zero is the true answer, not a missing one.
    machine: {
      async sample(targets) {
        return { panels: targets.map((t) => ({ panelId: t.panelId, ...EMPTY_MACHINE_COST })), total: { ...EMPTY_MACHINE_COST } }
      }
    },
    session: {
      async info() { return { kind: 'direct', reason: 'The browser demo has no tmux.' } },
      async lastExit() { return null }
    },
    skill: {
      async trail() { return { kind: 'none' } }
    },
    auth: {
      async status() { return { configured: false, reason: 'The browser demo has no account.' } }
    },
    env: {
      async adoptable() { return { tmuxPath: null, sessions: [] } },
      async report() {
        return {
          probedAt: 0,
          // `ok: true`: a false here raises the app's "login shell could not be read" banner, which is about a Mac, not this page.
          shell: { path: '/bin/zsh', ok: true },
          pathEntries: [],
          clis: [],
          tmux: { kind: 'direct', reason: 'The browser demo has no tmux.', path: null },
          layout: { path: '', backupWritten: false },
          envKeys: [],
          control: null
        }
      }
    },
    update: {
      async check() { return { kind: 'current', version: options.appVersion ?? '' } }
    },
    files: {
      list: async () => ({ kind: 'unreadable', detail: 'The browser demo has no disk.' })
    },
    // The record-shaped reads (demo.shapes.1): each has no "nothing here"
    // value a stub could stand in with, so each is the empty record, written out.
    scrollback: {
      async search() { return { hits: [], capped: false, cap: 0, redacted: 0, searched: { terminals: 0, chats: 0 } } }
    },
    memory: {
      async list(root) { return { root, entries: [], skipped: 0, unresolved: 'The browser demo has no memory files.' } }
    },
    lane: {
      async radar() { return { at: 0, collisions: [], unread: [] } }
    },
    cloud: {
      async radar() { return { at: 0, collisions: [], unread: [] } }
    },
    vm: {
      async lanes() { return { lanes: [], egress: [] } }
    },
    learn: {
      async read() { return { repos: [], agents: false } }
    },
    team: {
      async flow() { return { handoffs: [], reviews: [], mine: [], stewards: [], held: [], teammates: [] } }
    },
    setup: {
      async preflight(req) { return { tools: Object.fromEntries(req.tools.map((t) => [t, false])), ports: null } }
    },
    agentSession: {
      async transcript() { return { turns: [], snapshot: null } }
    },
    vault: {
      async read(root) { return { root, notes: [], skipped: 0, reason: 'The browser demo has no disk.' } }
    },
    spawn: {
      async recentUsed() { return {} }
    },
    tasks: {
      async evidence() { return { events: [], commands: [], checks: {}, files: {}, receipts: [], captures: [], reachedStart: true } }
    },
    diagnostics: {
      async sample() { return { ipcMessagesPerSecond: 0 } }
    },
    broker: {
      async audit() { return { rows: [], skipped: 0 } }
    },
    preview: {
      async discover() { return { kind: 'not-asked', candidates: [], scripts: [], note: 'The browser demo runs no processes.' } }
    },
    links: {
      // A web link opens in a new tab, which is what a visitor expects. A
      // file or folder target names a Mac that is not here.
      async open(req) {
        if (/^https?:\/\//.test(req.target)) {
          window.open(req.target, '_blank', 'noopener')
          return { kind: 'opened' }
        }
        options.notice('links.open')
        return { kind: 'refused', reason: DEMO_REFUSAL.reason }
      }
    },
    shelf: {
      async list() { return { columns: [] } }
    },
    toolbox: {
      async read() { return { kind: 'unavailable', reason: 'The browser demo has no tools.' } },
      async permissions() { return { rules: [], total: 0, status: 'The browser demo has no settings files.' } }
    },
    file: {
      // Synchronous in the contract (webUtils.getPathForFile in preload). A
      // dropped file has no path in a browser; '' is the "not a file on disk" answer.
      pathForFile: () => {
        options.notice('file.pathForFile')
        return ''
      }
    },
    review: {
      async panel() { return { kind: 'never-started' } }
    },
    dialog: {
      // A confirmation is asked before something destructive, which in the demo would do nothing.
      async confirm() {
        options.notice('dialog.confirm')
        return false
      }
    }
  }

  const scalars = {
    platform: 'darwin' as NodeJS.Platform,
    telemetry: { enabled: false },
    appVersion: options.appVersion ?? '',
    home,
    boot: undefined
  }

  const namespaces = new Map<string, unknown>()
  const bridge = new Proxy({} as CanvasBridge, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined
      if (key in scalars) return scalars[key as keyof typeof scalars]
      if (key === 'then') return undefined
      let door = namespaces.get(key)
      if (door === undefined) {
        door = stubNamespace(key, (real as Record<string, object | undefined>)[key] ?? {}, options.shapes, options.notice)
        namespaces.set(key, door)
      }
      return door
    }
  })

  return {
    bridge,
    stop() {
      sim?.stop()
      sim = null
    },
    transcript: (panelId) => sent.get(panelId) ?? ''
  }
}
