/**
 * Single source of truth for the IPC surface.
 *
 * Imported by main, preload, and renderer alike. Adding a channel here and
 * nowhere else should produce a type error in every process that must handle it.
 */
import type {
  AgentStateUpdate,
  LiveSessionUpdate,
  PanelId,
  PanelSpec,
  PtyCreateResult,
  PtyDataChunk,
  PtyExitInfo,
  PtyResizeRequest,
  PtyWriteRequest
} from './types'
import type { CanvasState } from './layout-schema'
import type { SettingDef, SettingValue } from './settings-schema'
import type { ReviewResult, ReviewBaseline, ReviewSubject, ReviewDiff, ReviewDiffRequest, ReviewCommitRequest, ReviewCommitResult } from './review'

/** Renderer -> main, request/response via ipcRenderer.invoke. */
export const IPC = {
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  /** Live sessions, so a fresh renderer can reconcile instead of guessing. */
  PTY_LIST: 'pty:list',
  /**
   * The resolved starting canvas. Main applies the restore settings before
   * answering, so the renderer never learns those settings exist.
   */
  LAYOUT_LOAD: 'layout:load',
  /** A full snapshot on every change; main coalesces and decides when to write. */
  LAYOUT_SAVE: 'layout:save',
  /**
   * Which backend spawns panels, and why. The renderer shows this only when it
   * is 'direct', so the user is never told their sessions are durable when
   * they are not.
   */
  SESSION_BACKEND: 'session:backend',
  /**
   * The preset list as the PALETTE needs it — names, availability, which is
   * default, and which are built-in. Availability is main's alone: it is
   * resolved against the login PATH, which the renderer's compiled-away
   * process.env cannot see.
   */
  PRESET_LIST: 'preset:list',
  /**
   * The three mutations M5a deferred to the palette. These invert M5a's
   * direction — its preset channels are main -> renderer because the MENU is
   * main's; the palette is the renderer's, so the mutations are invokes, which
   * is also why they belong here rather than in IPC_EVENTS.
   */
  PRESET_RENAME: 'preset:rename',
  PRESET_DELETE: 'preset:delete',
  PRESET_SET_DEFAULT: 'preset:set-default',
  /**
   * Spawn from a preset the PALETTE picked. Same main-side path as the menu's
   * pick, and a channel rather than the renderer rebuilding the template from
   * a PresetListRow: only main can resolve an ABSENT command into the user's
   * login shell, so a renderer-side reconstruction would either lose the
   * absence or guess zsh at it.
   */
  PRESET_SPAWN_BY_ID: 'preset:spawn-by-id',
  /**
   * Save a preset from a panel the RENDERER picked, rather than from whichever
   * panel is focused.
   *
   * The distinction is the whole reason this channel exists. PRESET_CAPTURE is
   * a main -> renderer request answered off focusedIdRef, which is right for
   * the menu item (there is no other panel a menu could mean) and wrong for
   * the inspector, which describes the SELECTED panel — an id this app keeps
   * deliberately distinct from the focused one, since a rail row selects
   * without focusing. Reusing capture there would save a different panel than
   * the pane is describing, and the preset it wrote would be well-formed and
   * merely wrong.
   *
   * Main still mints the id and the name (presetFromCapture): the renderer
   * can see neither the built-in ids nor the existing names.
   */
  PRESET_SAVE_PANEL: 'preset:save-panel',
  /**
   * "Reset canvas…" asked for from the palette rather than the menu. Main owns
   * the confirmation dialog and the counts request, so the renderer asks main
   * to run the flow it already has instead of growing a second one.
   */
  CANVAS_REQUEST_RESET: 'canvas:request-reset',
  /**
   * The merged prompt list: the saved store plus .claude/commands under the
   * cwd of the panel the palette captured. Takes a cwd because the project
   * half is per-panel — and main expands it, since `~` is main's to resolve.
   * A null cwd means "saved prompts only", which is what a palette opened with
   * nothing focused should show.
   */
  PROMPT_LIST: 'prompt:list',
  /** Always writes the SAVED store. The project half is read-only. */
  PROMPT_SAVE: 'prompt:save',
  PROMPT_DELETE: 'prompt:delete',
  /**
   * The settings surface. Renderer -> main and invokes, not events, for the
   * same reason M5b's preset mutations are: main owns the store, because the
   * before-quit flush cannot ask a renderer that Cmd+R may already have
   * destroyed. The list carries the schema AND the resolved value together, so
   * the renderer never needs its own copy of the defaults.
   */
  SETTINGS_LIST: 'settings:list',
  SETTINGS_SET: 'settings:set',
  /**
   * "I have looked at this panel." The renderer's half of clearing wants-you.
   *
   * Who clears the state is not symmetric, and that asymmetry is why this
   * channel exists at all. Typing is a fact main already holds — pty:write
   * names the panel — so main clears it there with nothing new. Focus is a
   * RENDERER fact: main has no idea which panel focusedId names. Clearing it
   * renderer-side instead would make the renderer a second author of a state
   * main owns, and the two would disagree the first time M6d fired a
   * notification for a panel the user had already read.
   */
  AGENT_ACKNOWLEDGE: 'agent:acknowledge',
  /**
   * The workspace surface. All five point renderer -> main for the reason
   * M5b's preset mutations do: main owns layout.json, and the palette is the
   * renderer's — so a mutation is an invoke, not an event.
   *
   * There is deliberately NO workspace attention channel. The renderer
   * already receives every agent:state transition for every panel main knows
   * about, so the attention set is folded renderer-side; WORKSPACE_LIST
   * returns panelIds and the renderer intersects. Asking main to recompute a
   * set the renderer already holds would make main a second author of a
   * derived fact — the same reasoning M6d recorded for not adding a channel.
   */
  WORKSPACE_LIST: 'workspace:list',
  /** Takes the outgoing canvas: the switch IS its last save. See the store. */
  WORKSPACE_ACTIVATE: 'workspace:activate',
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_RENAME: 'workspace:rename',
  WORKSPACE_DELETE: 'workspace:delete',
  /**
   * What has changed in this panel's repository since its session started.
   *
   * An invoke, and pull-only: no watcher and no push channel. The renderer
   * already holds every signal that says "now is a good moment to ask" —
   * selection changed, and M6c's agent-state transition to `idle`, which
   * means precisely "this agent stopped producing output". A push channel
   * would make main a second author of a timing decision the renderer
   * already makes correctly, the same call M6d and M7 both made and recorded.
   */
  REVIEW_PANEL: 'review:panel',
  /**
   * This panel's stored baseline, or null. The renderer asks exactly once —
   * when a review node is created — and stores the answer IN the node, so
   * the node can keep asking review:at after main has dropped the panel's
   * baseline on kill. It is deliberately not a general read: nothing else in
   * the renderer has any business knowing a sha.
   */
  REVIEW_BASELINE: 'review:baseline',
  /**
   * The same question review:panel answers, addressed by BASELINE instead of
   * by panel id — which is the entire reason a review node can outlive its
   * subject. Two channels rather than one optional-argument channel, because
   * the two have different lifetimes and different failure arms: review:panel
   * can answer never-started and not-a-repo, and neither is reachable here.
   */
  REVIEW_AT: 'review:at',
  /** One file's hunks. Pull-only, one file at a time — see ReviewDiffRequest. */
  REVIEW_DIFF: 'review:diff',
  /**
   * Turn the work a review node reports into a commit.
   *
   * The app's first irreversible write, and the only channel here that
   * changes anything outside this app's own state. Addressed by repository
   * ROOT rather than by panel id, for the reason REVIEW_AT is: a node outlives
   * its subject, and a commit is a repository operation.
   *
   * Async and slow by design — a pre-commit hook on a real repository is
   * legitimately thirty seconds — so the renderer must render an in-flight
   * state rather than assuming a prompt reply.
   */
  REVIEW_COMMIT: 'review:commit'
} as const

/** Main -> renderer, fire-and-forget via webContents.send. */
export const IPC_EVENTS = {
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
  /** Menu-driven clipboard actions; the renderer owns xterm's selection. */
  EDIT_COPY: 'edit:copy',
  EDIT_PASTE: 'edit:paste',
  /**
   * Cmd+Z / Cmd+Shift+Z, forwarded from the main-process menu exactly as
   * EDIT_COPY/EDIT_PASTE are. Ctrl+Z is deliberately untouched and reaches the
   * PTY as SIGTSTP — the same split as Cmd+C (copy) versus Ctrl+C (SIGINT).
   */
  EDIT_UNDO: 'edit:undo',
  EDIT_REDO: 'edit:redo',
  /**
   * What a Reset canvas… confirmation has to name. Main owns the dialog but
   * only the renderer knows the live session statuses, so it asks over this
   * channel — a main->renderer request/reply, not a handled invoke, which is
   * why it lives here and not in IPC (verify:ipc only walks IPC).
   */
  CANVAS_COUNTS: 'canvas:counts',
  /** Confirmed reset: drop every panel and return to the first-run canvas. */
  CANVAS_RESET: 'canvas:reset',
  /**
   * Spawn a panel from a preset the user picked in the menu. Main → renderer
   * because the MENU is main's, and the renderer is the only side that can
   * mint a panel id (nextIdRef) and know where the camera is looking.
   */
  PRESET_SPAWN: 'preset:spawn',
  /**
   * The template Cmd+N should use from now on. Pushed after load and whenever
   * the presets or the default change.
   *
   * Cmd+N stays a renderer keybinding rather than a menu accelerator because
   * verify:panels presses it with a dispatched KeyboardEvent, which a
   * main-process accelerator would never receive — moving it would rewrite
   * checks 7, 20 and 22 into IPC sends that prove strictly less.
   */
  PRESET_DEFAULT: 'preset:default',
  /**
   * "Save panel as preset": main owns the menu but only the renderer knows
   * which panel has focus, so main asks. Answered on an ephemeral reply
   * channel, exactly as CANVAS_COUNTS is, which is why this lives here rather
   * than in IPC — verify:ipc only walks IPC.
   */
  PRESET_CAPTURE: 'preset:capture',
  /**
   * What a panel's agent is doing. Main -> renderer, fire-and-forget, like
   * PTY_DATA — which is why it lives here rather than in IPC.
   *
   * Its own channel, deliberately: routing this through anything that bumps
   * registry.version() would re-render the whole canvas on agent output and
   * undo the memo that exists to block the 60Hz pan/zoom cascade. Main sends
   * only on an actual CHANGE of state, so a panel printing a megabyte
   * produces one message, not thousands.
   */
  AGENT_STATE: 'agent:state',
  /**
   * Where a panel is and what it is running, pushed when either CHANGES.
   *
   * An IPC_EVENTS member and not an IPC one, which decides a number: verify:ipc
   * asserts over Object.values(IPC) — invoke channels, each needing an
   * ipcMain.handle — and is unmoved by this. M6d hit the same boundary and
   * recorded it.
   *
   * Deduped in main for the reason AGENT_STATE is: this rides a 2s tick, and an
   * unconditional send would be thirty messages a minute per panel describing a
   * fact that changes when a human types `cd`.
   */
  SESSION_LIVE: 'session:live'
} as const

export interface SessionBackendInfo {
  kind: 'tmux' | 'direct'
  /** Human-readable cause, shown in the HUD when kind is 'direct'. */
  reason: string
}

/**
 * A preset as the renderer needs it. NO panelId: the renderer mints that from
 * nextIdRef, and a main-minted id would collide with the `n` sequence Cmd+N
 * uses — the same duplicate-id defect M4a fixed and M4b nearly resurrected.
 *
 * `command` absent still means the login shell, all the way down to
 * pty-manager's resolveCommand. Nothing on this journey may fill it in.
 */
export interface PresetTemplate {
  cwd: string
  command?: string
  args: string[]
  w?: number
  h?: number
}

/** What the renderer answers PRESET_CAPTURE with: the focused panel, or null. */
export interface CapturedPanel {
  cwd: string
  command?: string
  args: string[]
  w: number
  h: number
}

/** One row of the palette's prompt list. Mirrors PromptListRow in main. */
export interface PromptBridgeRow {
  id: string
  name: string
  source: 'saved' | 'project'
  body: string
}

/**
 * One workspace as the palette needs it.
 *
 * An IPC payload shape, not an on-disk one — the same split PresetListRow
 * draws against Preset, and it matters for the same reason: layout-schema.ts
 * decides what is VALID on disk, and a field that exists only to render a row
 * has no business in the format.
 *
 * `panelIds` rather than a waiting count. Main does not know which panels are
 * in wants-you in a form the renderer should trust it for, and the renderer
 * already receives every agent:state transition — so shipping a count here
 * would put the derivation in the wrong process to no benefit. See M6d's
 * "M7 added no IPC channel" reasoning, which this follows.
 */
export interface WorkspaceRow {
  id: string
  name: string
  panelIds: string[]
  active: boolean
}

/**
 * What a switch hands back. A workspace switch is a SECOND BOOT — the same
 * two facts boot() awaits, in one round trip instead of two.
 *
 * `allPanelIds` spans every workspace, deliberately. The renderer seeds
 * nextIdRef from it, and PanelId doubles as the tmux session name: seeding
 * from the ACTIVE workspace's ids alone would let Cmd+N in one workspace mint
 * an id another workspace is already using, and the second panel to go live
 * would attach to the first one's process.
 */
export interface ActivateResult {
  state: CanvasState
  allPanelIds: string[]
}

/** One row of the palette's preset list. Mirrors PresetRow in the renderer. */
export interface PresetListRow {
  id: string
  name: string
  available: boolean
  builtIn: boolean
  isDefault: boolean
  subtitle: string
}

/** A setting as the palette needs it: its declaration plus its current value. */
export interface SettingRow {
  id: string
  label: string
  description: string
  keywords: string[]
  /** Derived from SettingDef so the two type unions cannot drift apart. */
  type: SettingDef['type']
  value: SettingValue
  category: string
  /**
   * Inclusive bounds for a `number` setting, mirrored from `SettingDef`.
   * Absent for a boolean. The palette needs these to reject an out-of-range
   * edit BEFORE sending it — main's own range check in `setPreference` is the
   * last line of defence for a file it did not write, but a refusal that
   * happens only there is invisible: the palette closes as if the write
   * succeeded, and nothing tells the user their edit was silently dropped.
   */
  min?: number
  max?: number
}

/** Shape of the bridge the preload exposes on window.canvas. */
export interface CanvasBridge {
  pty: {
    create(spec: PanelSpec): Promise<PtyCreateResult>
    write(req: PtyWriteRequest): Promise<void>
    resize(req: PtyResizeRequest): Promise<void>
    kill(panelId: PanelId): Promise<void>
    /**
     * Sessions that survived whatever destroyed the previous renderer. A page
     * reload does not run React cleanup, so the renderer cannot assume its
     * panels are fresh.
     */
    list(): Promise<PtyCreateResult[]>
    /** Each subscribe returns its own unsubscribe, so React effects clean up. */
    onData(listener: (chunk: PtyDataChunk) => void): () => void
    onExit(listener: (info: PtyExitInfo) => void): () => void
  }
  edit: {
    onCopy(listener: () => void): () => void
    onPaste(listener: (text: string) => void): () => void
    onUndo(listener: () => void): () => void
    onRedo(listener: () => void): () => void
  }
  layout: {
    /** Called ONCE, before React mounts. See renderer/main.tsx. */
    load(): Promise<CanvasState>
    save(state: CanvasState): Promise<void>
  }
  canvas: {
    /** Registers the answer to canvas:counts. Returns its own unsubscribe. */
    onCounts(provide: () => { panels: number; running: number }): () => void
    onReset(listener: () => void): () => void
    /** Runs main's existing confirm-then-reset flow. */
    requestReset(): Promise<void>
  }
  preset: {
    /** A menu pick: spawn one panel from this template, now. */
    onSpawn(listener: (template: PresetTemplate) => void): () => void
    /** What Cmd+N should spawn from now on. */
    onDefault(listener: (template: PresetTemplate) => void): () => void
    /**
     * Registers a PROVIDER, not a listener — main asks, the renderer answers.
     * Mirrors canvas.onCounts; returns null when nothing is focused.
     */
    onCapture(provide: () => CapturedPanel | null): () => void
    list(): Promise<PresetListRow[]>
    rename(id: string, name: string): Promise<boolean>
    /** `remove`, not `delete`: `delete` is a reserved word as a method name. */
    remove(id: string): Promise<boolean>
    setDefault(id: string): Promise<void>
    /**
     * Ask main to spawn from this preset. It answers by sending PRESET_SPAWN,
     * the same event a menu pick produces — which is what gives a palette
     * spawn the ordinary undo behaviour rather than a second spawn path.
     */
    spawnById(id: string): Promise<void>
    /** Save THIS panel as a preset. See PRESET_SAVE_PANEL. */
    savePanel(captured: CapturedPanel): Promise<void>
  }
  prompt: {
    list(cwd: string | null): Promise<PromptBridgeRow[]>
    save(name: string, body: string): Promise<void>
    /** False for an id the saved store does not hold — every project id, for one. */
    remove(id: string): Promise<boolean>
  }
  session: {
    info(): Promise<SessionBackendInfo>
    /**
     * Live cwd/command updates. Each subscribe returns its own unsubscribe, so
     * a React effect can clean up without stacking listeners.
     */
    onLive(listener: (update: LiveSessionUpdate) => void): () => void
  }
  settings: {
    list(): Promise<SettingRow[]>
    set(id: string, value: SettingValue): Promise<void>
  }
  agent: {
    /** Per-panel state updates. Each subscribe returns its own unsubscribe. */
    onState(listener: (update: AgentStateUpdate) => void): () => void
    /** Focus counts as reading it. See IPC.AGENT_ACKNOWLEDGE. */
    acknowledge(panelId: PanelId): Promise<void>
  }
  workspace: {
    list(): Promise<WorkspaceRow[]>
    /**
     * `outgoing` is the canvas being left. Resolves null when the id names
     * nothing, having changed nothing.
     */
    activate(id: string, outgoing: CanvasState): Promise<ActivateResult | null>
    create(name: string): Promise<string>
    rename(id: string, name: string): Promise<boolean>
    /** `remove`, not `delete`: `delete` is reserved, as PresetBridge already found. */
    remove(id: string): Promise<boolean>
  }
  review: {
    panel(panelId: PanelId): Promise<ReviewResult>
    baseline(panelId: PanelId): Promise<ReviewBaseline | null>
    at(subject: ReviewSubject): Promise<ReviewResult>
    diff(req: ReviewDiffRequest): Promise<ReviewDiff>
    commit(req: ReviewCommitRequest): Promise<ReviewCommitResult>
  }
  platform: NodeJS.Platform
}
