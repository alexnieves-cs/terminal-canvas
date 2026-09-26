import { carryWorkItem } from '../shared/work-items'
import { carryStarter } from '../shared/starter'
import { carryOrchestrate } from '../shared/orchestrate-prefs'
import type { TemplateSaveResult } from '../shared/templates'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import {
  DEFAULT_PRESET_ID,
  defaultSnapshot,
  defaultWorkspace,
  parseLayout,
  serialiseLayout,
  type CanvasState,
  type LayoutSnapshot,
  type PersistedPanel,
  type Preset,
  type Prompt,
  type RestoreSettings,
  type Workspace,
  type WorkspaceShare,
  type WorktreeRecord, RECENT_DIRECTORIES_CAP, TEMPLATES_MAX, type PersistedTemplate } from '../shared/layout-schema'
import { resolveSetting, settingDef, type SettingValue } from '../shared/settings-schema'
import { TEAMMATES_MAX, carryTeammate, type PersistedTeammate } from '../shared/teammates'
import { SHELF_COLUMNS_MAX, carryShelf, type Shelf } from '../shared/skills'
import { ROUTINES_MAX, carryRoutine, type PersistedRoutine } from '../shared/routines'
import type { ActivateResult, MergedWorkspace, WorkspaceRow } from '../shared/ipc-contract'
import type { ReviewBaseline } from '../shared/review'
import { GROUP_COLOURS, type GroupColour } from '../shared/groups'

/**
 * Owns layout.json.
 *
 * In MAIN rather than the renderer, and the deciding argument is the quit
 * flush. It has to happen at before-quit, main-side. If the renderer owned the
 * debounce, main would have to ask the renderer for a snapshot at exactly the
 * moment the renderer might already be destroyed — which is precisely the
 * failure window-lifecycle.ts exists to handle, where Cmd+R and Cmd+W tear
 * down the page without running any React cleanup. Holding the snapshot here
 * makes the flush a writeFileSync with nobody to ask.
 *
 * `filePath` is a parameter rather than an app.getPath('userData') call inside,
 * the same move session-registry.ts makes with its bridge and factory. It is
 * not ceremony: an electron import here would force verify:layout out of the
 * plain-node tier and into Electron-as-node, where every check costs a process
 * spawn and a native-module load.
 */

export const WRITE_DEBOUNCE_MS = 500

export type Cancel = () => void

export interface LayoutStoreDeps {
  filePath: string
  /**
   * Injected so verify:layout can drive the debounce explicitly instead of
   * waiting on a real clock — which would make the coalescing check both slow
   * and timing-flaky.
   */
  schedule?: (fn: () => void, ms: number) => Cancel
  onWarning?: (message: string) => void
  /** M93. Handed the bytes of every SUCCESSFUL write — the snapshot ring. Absent records nothing. */
  onWritten?: (bytes: string) => void
}

export interface LayoutStore {
  /** Read and parse once at startup. Backs up a future-version file. */
  load(): void
  /** The resolved starting state for the renderer, restore settings applied. */
  initial(): CanvasState
  /** Merge a renderer snapshot into the active workspace and schedule a write. */
  save(incoming: CanvasState): void
  settings(): RestoreSettings
  setSetting(key: keyof RestoreSettings, value: boolean): void
  /**
   * Everything the user has changed, keyed by SettingDef.id. Copied out, like
   * settings() and presets(), so a caller cannot mutate the snapshot the store
   * is about to serialise and have the write silently disagree with it.
   */
  preferences(): Record<string, SettingValue>
  /** Resolved: the persisted value if there is one, else the schema default. */
  getSetting(id: string): SettingValue
  setPreference(id: string, value: SettingValue): void
  /**
   * M46. Forget a preference, so it reads as ABSENT again — which is a
   * different state from "set to the default": the sparse map's absence
   * means "the breakpoint decides" for the shell's regions. Nothing in the
   * palette calls this yet; verify:panels does, to put the store back into
   * the never-touched state its shell checks are about.
   */
  clearPreference(id: string): void
  /** M48. A newer-version layout file was preserved as .bak on this launch. */
  backupWritten(): boolean
  /** User-created presets only; the built-ins live in main/presets.ts. */
  presets(): Preset[]
  /** Append one and schedule a write. Ids are minted by the caller. */
  addPreset(preset: Preset): void
  /** Rename one user preset. False when the id names nothing. */
  renamePreset(id: string, name: string): boolean
  /** M253. A person read an imported preset's command: drop the mark. False when the id names nothing. */
  markPresetReviewed(id: string): boolean
  /**
   * Remove one user preset. False when the id names nothing — including every
   * built-in id, which is not this file's data to remove.
   */
  deletePreset(id: string): boolean
  /** What Cmd+N spawns. Not validated here: only main knows the built-ins. */
  setDefaultPreset(id: string): void
  /** What Cmd+N spawns. May name a built-in, so main resolves it, not this. */
  defaultPresetId(): string
  /** The SAVED prompts only. Project prompts are read live; see main/prompts.ts. */
  prompts(): Prompt[]
  /** M80. Saved templates (the user's; built-ins are code). */
  templates(): PersistedTemplate[]
  /** M182. Saves and answers the record as written, or `stale` with the record that stands when `expectedRevision` does not match it. */
  saveTemplate(template: PersistedTemplate, expectedRevision?: number): TemplateSaveResult
  /**
   * M127. The skill shelf, copied out and written whole.
   *
   * Whole, never per column: the columns are one arrangement, and a
   * per-column write would let a drag that moved a card between two columns
   * persist half of itself.
   */
  shelf(): Shelf
  saveShelf(shelf: Shelf): Shelf
  /** M100. The roster, copied out; saved newest-first at TEAMMATES_MAX; a delete answers whether it held the id. */
  teammates(): PersistedTeammate[]
  saveTeammate(teammate: PersistedTeammate): void
  deleteTeammate(id: string): boolean
  /** M101. Routines, the same shape. */
  routines(): PersistedRoutine[]
  saveRoutine(routine: PersistedRoutine): void
  deleteRoutine(id: string): boolean
  /** False when the id names nothing — including every built-in id. */
  deleteTemplate(id: string): boolean
  addPrompt(prompt: Prompt): void
  /** False when the id names nothing — including any project prompt id. */
  deletePrompt(id: string): boolean
  /** Every workspace, with the active one flagged. Copied out, like presets(). */
  workspaces(): WorkspaceRow[]
  /**
   * Every workspace's WHOLE panels, for a merged cross-workspace view.
   * workspaces() carries panelIds because a rail row only needs a count;
   * this carries full PersistedPanels because a merged lane needs geometry
   * to lay them out. Copied out, like workspaces() and presets(): a caller
   * mutating what it gets back must not reach the snapshot this store is
   * about to serialise.
   */
  mergedWorkspaces(): MergedWorkspace[]
  /**
   * Relocates panels between workspace records. Touches no session — it
   * moves rows in this store only, never pty.kill/backend.destroy/
   * dropBaseline — and mints no PanelId and destroys none, so the full id
   * set (see mergedWorkspaces) is unchanged across a call. Null, and
   * nothing changed, when `target` names an unknown workspace id.
   */
  movePanels(
    panelIds: string[],
    target: { workspaceId: string } | { newName: string }
  ): { workspaceId: string } | null
  /**
   * Mint one and return its id. Does NOT activate it: a create that also
   * switched would move the user somewhere they did not ask to go, and
   * switching is a transaction with its own rules (see activateWorkspace).
   */
  createWorkspace(name: string): string
  /**
   * The shared canvas's store half (presence/canvas-sync.ts). The store stays
   * the one choke point for what reaches disk: a peer's move is written HERE
   * first, whichever workspace is on screen, and the doc's own bytes ride the
   * same atomic write as the panels they describe.
   */
  activeWorkspaceId(): string
  workspaceShare(id: string): WorkspaceShare | undefined
  /** Null unshares: the share AND its doc go, together. False when the id names nothing. */
  setWorkspaceShare(id: string, share: WorkspaceShare | null): boolean
  sharedState(id: string): Uint8Array | null
  setSharedState(id: string, state: Uint8Array): void
  /** Peer geometry for panels hosted here, and the whole group list when a peer changed it. */
  applySharedLayout(id: string, change: { rects: Array<{ id: string; x: number; y: number; w: number; h: number; z: number }>; groups?: Array<{ id: string; label: string; colour: string; panelIds: string[]; collapsed?: boolean }> }): void
  /** M93. The layout as main holds it now — what a restore is computed against. */
  current(): LayoutSnapshot
  /** M93. Adds a fully-formed workspace record beside the others without activating it (the renderer switches, as it does for create). */
  addWorkspaceRecord(workspace: Workspace): void
  /** False when the id names nothing, like renamePreset. */
  renameWorkspace(id: string, name: string): boolean
  /**
   * False when the id names nothing. Deleting the ACTIVE workspace activates
   * a neighbour, and deleting the LAST one installs a fresh default — there
   * is never zero workspaces, which parseLayout guarantees only on load.
   *
   * NOTE: this removes the RECORD. The panels' sessions belong to the
   * renderer's registry and are disposed there, before this is called.
   */
  deleteWorkspace(id: string): boolean
  /**
   * Switch the active workspace, and write the outgoing canvas into the one
   * being left. Null when the id names nothing, having changed nothing.
   *
   * It takes `outgoing` — a parameter it looks like it should not need — for
   * one reason: save() merges into whatever is active AT THE MOMENT IT RUNS,
   * and writes are coalesced on a WRITE_DEBOUNCE_MS timer. A switch that
   * merely flipped the id would leave a window in which the outgoing canvas's
   * next save lands in the INCOMING workspace's record. The file stays
   * well-formed and simply holds the wrong panels, which the user discovers
   * launches later with nothing in any log. This call IS the outgoing
   * canvas's last save.
   */
  activateWorkspace(id: string, outgoing: CanvasState): ActivateResult | null
  /** Return the active workspace to an empty canvas. */
  reset(): void
  /** Write now, synchronously. Never throws. */
  flushSync(): void
  /** The panel's session-start snapshot, or undefined if it never spawned. */
  baseline(panelId: string): ReviewBaseline | undefined
  setBaseline(panelId: string, baseline: ReviewBaseline): void
  dropBaseline(panelId: string): void
  /**
   * Every panel id holding a baseline, across every workspace. The startup
   * sweep needs the whole set — a baseline is keyed by panel id alone, and a
   * hidden workspace's panel is exactly as capable of holding a stale one as
   * the active workspace's. Same reasoning as allPanelIds.
   */
  baselineIds(): string[]
  /**
   * How many OTHER panels hold a baseline in this root. Excluding the asker is
   * the whole point: counting itself would make every single-panel repository
   * report as `shared`, and the feature would never once produce an
   * attributed answer.
   */
  baselinePeers(root: string, exceptPanelId: string): number
  /** The agent session id this panel is pinned to, if it has one. */
  session(panelId: string): string | undefined
  setSession(panelId: string, sessionId: string): void
  dropSession(panelId: string): void
  /** M37. Every worktree this app created. Copied out, like presets(). */
  worktrees(): WorktreeRecord[]
  /** M65. Newest first, capped at twelve. */
  recentDirectories(): string[]
  /** M262. When each CURRENT recent directory was last used, epoch ms; a directory recorded before M262 has no entry. */
  recentDirectoryUsed(): Record<string, number>
  addRecentDirectory(cwd: string, at?: number): void
  /**
   * M37. The record a panel id should spawn into, if one exists for it IN THIS
   * ROOT. The root clause is the whole guard: a recycled id in a different
   * repository must never be spawned into a stranger's branch.
   */
  worktreeForPanel(panelId: string, root: string): WorktreeRecord | undefined
  addWorktree(record: WorktreeRecord): void
  /** By record id, not panel id: a panel's record outlives the panel. */
  dropWorktree(id: string): boolean
  /**
   * M37. Flag a USER preset to spawn in a fresh worktree, or clear it. False
   * for an unknown id — including every built-in, which is code and never on
   * disk. Clearing writes ABSENCE, never `false`.
   */
  setPresetWorktree(id: string, on: boolean): boolean
}

const defaultSchedule = (fn: () => void, ms: number): Cancel => {
  const handle = setTimeout(fn, ms)
  return () => clearTimeout(handle)
}

export function createLayoutStore(deps: LayoutStoreDeps): LayoutStore {
  const { filePath } = deps
  const schedule = deps.schedule ?? defaultSchedule
  const warn = deps.onWarning ?? ((m: string) => console.warn(`[layout] ${m}`))

  let snapshot: LayoutSnapshot = defaultSnapshot()
  let cancelPending: Cancel | null = null
  let dirty = false
  let backupWritten = false

  function activeWorkspace(): Workspace {
    const found = snapshot.workspaces.find((w) => w.id === snapshot.activeWorkspaceId)
    if (found) return found
    // parseLayout guarantees at least one workspace and a resolvable active id,
    // so this only fires for a snapshot built in code. Repair rather than
    // throw: there is no caller that can do anything useful with an exception.
    const fresh = defaultWorkspace()
    snapshot.workspaces = [fresh]
    snapshot.activeWorkspaceId = fresh.id
    return fresh
  }

  // Ids are `w<n>` above the current maximum, the same shape parseWorkspace's
  // own fallback already assumes (`w${index + 1}`). Derived from the existing
  // ids rather than from the count, so deleting w2 out of [w1, w2, w3] cannot
  // mint a second w3.
  function nextWorkspaceId(): string {
    const max = snapshot.workspaces.reduce((n, w) => {
      const match = /^w(\d+)$/.exec(w.id)
      return match ? Math.max(n, Number(match[1])) : n
    }, 0)
    return `w${max + 1}`
  }

  function writeNow(): void {
    // Never throws. flushSync's caller is app.on('before-quit'), where an
    // exception can wedge the quit itself; and a disk that cannot be written
    // is a reason to log, not a reason to refuse to run.
    try {
      const tmp = `${filePath}.tmp`
      // `settings` is deliberately NOT written any more: it is a derived view
      // of three preferences entries, and writing both would create exactly
      // the second storage this milestone removed. parseLayout still reads it,
      // so a pre-M6b file migrates on first load — but once this app has
      // written the file, `preferences` is the only record.
      const { settings: _settings, ...onDisk } = snapshot
      const bytes = serialiseLayout(onDisk)
      writeFileSync(tmp, bytes, 'utf8')
      // rename is atomic on macOS. Writing in place would let a crash
      // mid-write leave a truncated file — parseLayout survives that, but it
      // survives it by discarding the whole canvas.
      renameSync(tmp, filePath)
      dirty = false
      // M93. After the rename, never before: a snapshot of a write that failed
      // would be history that never happened.
      try { deps.onWritten?.(bytes) } catch (error) { warn(`snapshot hook failed: ${String(error)}`) }
    } catch (error: unknown) {
      warn(`could not write ${filePath}: ${String(error)}`)
    }
  }

  // The single place that resolves the three restore.* entries, so initial(),
  // save() and the settings() view can never read them out of step with each
  // other or with setSetting/setPreference, which both write straight into
  // snapshot.preferences.
  function resolvedSettings(): RestoreSettings {
    return {
      layout: resolveSetting(snapshot.preferences, 'restore.layout') as boolean,
      camera: resolveSetting(snapshot.preferences, 'restore.camera') as boolean,
      focus: resolveSetting(snapshot.preferences, 'restore.focus') as boolean
    }
  }

  // Shared by setPreference and setSetting, so neither can write an id the
  // schema does not declare or a value of the wrong type — either would be an
  // entry parsePreferences drops on the very next load: a setting that
  // appears to take and is gone after a relaunch.
  function writePreference(id: string, value: SettingValue): void {
    const def = settingDef(id)
    if (def === undefined) return
    if (def.type === 'list') {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) return
      snapshot.preferences[id] = [...value]
      scheduleWrite()
      return
    }
    // M85. `text` and `enum` are both strings on the wire; the difference is
    // the membership test below, which only an enum has.
    if (typeof value !== (def.type === 'enum' || def.type === 'text' ? 'string' : def.type)) return
    // The enum's membership, for the reason parsePreferences states: the two
    // doors into the map each guard it, or the guard has a hole.
    if (def.type === 'enum' && typeof value === 'string' && !(def.values ?? []).includes(value)) return
    // Range, for the reason SettingDef.min/max records: both ends of the
    // idleness threshold fail silently, so a value outside them is refused
    // here rather than stored and puzzled over later.
    if (def.type === 'number' && typeof value === 'number') {
      if (def.min !== undefined && value < def.min) return
      if (def.max !== undefined && value > def.max) return
    }
    snapshot.preferences[id] = value
    scheduleWrite()
  }

  function scheduleWrite(): void {
    dirty = true
    // Coalescing, not queueing. A drag sends ~60 snapshots a second; only the
    // newest matters, and re-arming would postpone the write for the whole
    // gesture rather than bounding it.
    if (cancelPending) return
    cancelPending = schedule(() => {
      cancelPending = null
      writeNow()
    }, WRITE_DEBOUNCE_MS)
  }

  // Every id in every workspace. The renderer seeds nextIdRef from this, and
  // the reason it must not be the active workspace's ids alone is that
  // PanelId doubles as a tmux session name — see ActivateResult.
  function allPanelIds(): string[] {
    return snapshot.workspaces.flatMap((w) => w.panels.map((p) => p.id))
  }

  // Hoisted out of the returned object literal so activateWorkspace can call
  // both without going through `this` — a method-shorthand call would work
  // (JS binds `this` at call time), but it would break the moment a caller
  // destructures the store (`const { activateWorkspace } = store`), and nowhere
  // else in this file relies on `this`. Both the public save()/initial() below
  // and activateWorkspace call these same two functions, so the restore-
  // settings logic exists in exactly one place — duplicating it here is the
  // same second-storage failure M6b removed for settings.
  // Both restore-settings consumers below take an `applyRestoreSettings` flag
  // so activateWorkspace can opt out without a second copy of this logic.
  // The three `restore.*` preferences answer "what should the app show me
  // when it STARTS" — restore.layout's own schema description says so in
  // those words — and a workspace switch is not a start. Applying them there
  // means turning off restore.layout turns Cmd+K workspace switching into a
  // silent canvas shredder: the outgoing workspace never records the panels
  // it had (their tmux sessions orphan, reachable from no workspace) and the
  // incoming workspace reads back empty regardless of what it holds on disk.
  // Defaulting the flag to true keeps the public save()/initial() members
  // (and every existing caller) behaving exactly as before.
  function doInitial(applyRestoreSettings = true): CanvasState {
    const w = activeWorkspace()
    const { layout, camera, focus } = applyRestoreSettings
      ? resolvedSettings()
      : { layout: true, camera: true, focus: true }
    // Settings are applied HERE so the renderer never learns they exist —
    // the same shape as PanelSpec.command, where main resolves what only
    // main can know and the renderer consumes the answer.
    const panels = layout ? w.panels.map((p) => ({ ...p })) : []
    const groups = layout ? (w.groups ?? []).map((g) => ({ ...g, panelIds: [...g.panelIds] })) : []
    // With no panels there is nothing for a selection to name, so it goes
    // regardless of the focus setting.
    const keepSelection = layout && focus
    return {
      panels,
      groups,
      camera: camera ? { ...w.camera } : { ...defaultWorkspace().camera },
      selectedId: keepSelection ? w.selectedId : null,
      focusedId: keepSelection ? w.focusedId : null,
      // M56. Bookmarks are places, not layout: they survive `restore.layout`
      // off, since a bookmark on an empty canvas still names where to look.
      bookmarks: (w.bookmarks ?? []).map((b) => ({ id: b.id, name: b.name, camera: { ...b.camera } })),
      // M79. Runs are a history, kept whatever the restore settings say.
      runs: (w.runs ?? []).map((r) => ({ ...r, panelIds: [...r.panelIds], edges: r.edges.map((e) => ({ ...e })), entries: r.entries.map((e) => ({ ...e })) })),
      ...(layout && w.annotations !== undefined ? { annotations: w.annotations.map((a) => ({ ...a, anchor: { ...a.anchor } })) } : {}),
      // M113. Records, not layout — kept whatever the restore settings say, like bookmarks and runs.
      ...(w.workItems !== undefined ? { workItems: w.workItems.map(carryWorkItem) } : {}),
      ...(w.retainedOutcomes !== undefined ? { retainedOutcomes: w.retainedOutcomes.map((o) => ({ ...o })) } : {}),
      // M181. The starter record: a record, kept whatever the restore settings say.
      ...carryStarter(w),
      // M287. Orchestrate's layout for this workspace: a record, kept like the starter.
      ...(w.orchestrate === undefined ? {} : { orchestrate: carryOrchestrate(w.orchestrate) })
    }
  }

  function doSave(incoming: CanvasState, applyRestoreSettings = true): void {
    const w = activeWorkspace()
    const { layout, camera, focus } = applyRestoreSettings
      ? resolvedSettings()
      : { layout: true, camera: true, focus: true }
    // Symmetric with initial(): a restore setting that is OFF means "start
    // fresh each launch", not "discard on launch". initial() already hands
    // the renderer nothing for that field, so the renderer's snapshot never
    // reflects the stored value — writing it back unconditionally would let
    // an unrelated save (any panel move, any camera pan) overwrite real data
    // with whatever the fresh-start renderer invented instead. Leaving the
    // field untouched freezes the stored value at whatever it was when the
    // setting was last on; re-checking the box gives it back. Preserving is
    // strictly better than destroying, and it is the only reading under
    // which "restore on launch" is not secretly "discard on launch".
    if (layout) {
      w.panels = incoming.panels.map((p) => ({ ...p }))
      w.groups = (incoming.groups ?? []).map((g) => ({ ...g, panelIds: [...g.panelIds] }))
    }
    // selectedId/focusedId name panels, so they ride with `layout` (whether
    // there is anything to select) as well as `focus` (whether selection
    // itself restores) — either OFF is a reason to leave them alone.
    if (layout && focus) {
      w.selectedId = incoming.selectedId
      w.focusedId = incoming.focusedId
    }
    if (camera) w.camera = { ...incoming.camera }
    // M56. Ungated: a bookmark is a place, kept whatever the restore settings say.
    w.bookmarks = (incoming.bookmarks ?? []).map((b) => ({ id: b.id, name: b.name, camera: { ...b.camera } }))
    w.runs = (incoming.runs ?? []).map((r) => ({ ...r, panelIds: [...r.panelIds], edges: r.edges.map((e) => ({ ...e })), entries: r.entries.map((e) => ({ ...e })) }))
    // M93. Absent stays absent ON DISK: an empty list is no key, so a pre-M93
    // reader (and the layout check that counts keys) sees the file it knew.
    if (incoming.annotations !== undefined && incoming.annotations.length > 0) w.annotations = incoming.annotations.map((a) => ({ ...a, anchor: { ...a.anchor } }))
    else delete w.annotations
    // M113. The same absent-when-empty rule, for the same reader.
    if (incoming.workItems !== undefined && incoming.workItems.length > 0) w.workItems = incoming.workItems.map(carryWorkItem)
    else delete w.workItems
    if (incoming.retainedOutcomes !== undefined && incoming.retainedOutcomes.length > 0) w.retainedOutcomes = incoming.retainedOutcomes.map((o) => ({ ...o }))
    else delete w.retainedOutcomes
    // M181. Absent stays absent on disk: a canvas the starter never touched carries no record.
    if (incoming.starter !== undefined) w.starter = carryStarter(incoming).starter
    else delete w.starter
    // M287. Absent stays absent: a workspace whose Orchestrate page never changed anything carries no record.
    if (incoming.orchestrate !== undefined) w.orchestrate = carryOrchestrate(incoming.orchestrate)
    else delete w.orchestrate
    scheduleWrite()
  }

  // Hoisted out of the returned object literal for the same reason doSave/
  // doInitial are (see the comment above them): movePanels needs to mint a
  // workspace for its `newName` branch, and calling the public
  // createWorkspace() below via `this` would work today but breaks the
  // instant a caller destructures the store — nothing else in this file
  // relies on `this`, and this keeps it that way.
  function doCreateWorkspace(name: string): string {
    const id = nextWorkspaceId()
    // Every field of a Workspace is populated by defaultWorkspace(), so the
    // spread cannot lose an absent-vs-undefined distinction the way
    // spreading a Preset can (see "An absent command must stay absent" in
    // CLAUDE.md). A future optional field on Workspace would make this a
    // hazard and should be set explicitly rather than spread.
    snapshot.workspaces = [...snapshot.workspaces, { ...defaultWorkspace(), id, name }]
    scheduleWrite()
    return id
  }

  return {
    load() {
      if (!existsSync(filePath)) return

      let raw: string
      try {
        raw = readFileSync(filePath, 'utf8')
      } catch (error: unknown) {
        warn(`could not read ${filePath}: ${String(error)}`)
        return
      }

      const { snapshot: parsed, warnings, futureVersion } = parseLayout(raw)
      for (const message of warnings) warn(message)

      if (futureVersion) {
        // Preserve it before the fallback's first write replaces it. Without
        // this, opening an old build once destroys a layout a newer build
        // authored, with no way back.
        try {
          renameSync(filePath, `${filePath}.bak`)
          backupWritten = true
          warn(`preserved the newer layout file as ${filePath}.bak`)
        } catch (error: unknown) {
          warn(`could not back up ${filePath}: ${String(error)}`)
        }
      }

      snapshot = parsed
    },

    initial: doInitial,

    save: doSave,

    // The typed view of the three `restore.*` schema entries. It stays because
    // initial()'s restore logic is written in terms of RestoreSettings and
    // rewriting that buys nothing — but it is a VIEW, not a second storage:
    // both members go through the same preferences map, so a write through
    // either API is visible through the other (verify:layout 73).
    settings: resolvedSettings,

    setSetting(key, value) {
      // Routed through the same guard setPreference uses, rather than writing
      // snapshot.preferences directly — see writePreference's comment.
      writePreference(`restore.${key}`, value)
    },

    preferences: () => ({ ...snapshot.preferences }),
    backupWritten: () => backupWritten,
    clearPreference(id) {
      if (!(id in snapshot.preferences)) return
      delete snapshot.preferences[id]
      scheduleWrite()
    },

    getSetting: (id) => resolveSetting(snapshot.preferences, id),

    setPreference: writePreference,

    // Copied out, like settings(), so a caller cannot mutate the snapshot the
    // store is about to serialise and have the write silently disagree with
    // what addPreset scheduled.
    presets: () => snapshot.presets.map((p) => ({ ...p })),

    addPreset(preset) {
      snapshot.presets = [...snapshot.presets, { ...preset }]
      scheduleWrite()
    },

    renamePreset(id, name) {
      const found = snapshot.presets.find((p) => p.id === id)
      if (!found) return false
      snapshot.presets = snapshot.presets.map((p) => (p.id === id ? { ...p, name } : p))
      scheduleWrite()
      return true
    },

    deletePreset(id) {
      const before = snapshot.presets.length
      snapshot.presets = snapshot.presets.filter((p) => p.id !== id)
      if (snapshot.presets.length === before) return false
      // A defaultPresetId naming a preset that no longer exists is a fact on
      // disk that outlives this run. resolveDefault() recovers at read time,
      // but only here is the moment the preset goes away visible.
      if (snapshot.defaultPresetId === id) snapshot.defaultPresetId = DEFAULT_PRESET_ID
      scheduleWrite()
      return true
    },

    setDefaultPreset(id) {
      snapshot.defaultPresetId = id
      scheduleWrite()
    },

    defaultPresetId: () => snapshot.defaultPresetId,

    // Copied out for the same reason presets() copies: a caller must not be
    // able to mutate the snapshot the store is about to serialise.
    prompts: () => snapshot.prompts.map((p) => ({ ...p })),

    templates: () => snapshot.templates.map((t) => ({ ...t, nodes: t.nodes.map((n) => ({ ...n })), edges: t.edges.map((e) => ({ ...e })) })),

    shelf: () => carryShelf(snapshot.shelf),
    saveShelf(shelf) {
      // Copied on the way IN as well as out, for presets()' own reason: the
      // caller must not hold a reference into the record the store is about
      // to serialise.
      snapshot.shelf = carryShelf({ columns: shelf.columns.slice(0, SHELF_COLUMNS_MAX) })
      scheduleWrite()
      return carryShelf(snapshot.shelf)
    },

    teammates: () => snapshot.teammates.map(carryTeammate),
    routines: () => snapshot.routines.map(carryRoutine),
    saveRoutine(routine) {
      const copy = carryRoutine(routine)
      snapshot.routines = [copy, ...snapshot.routines.filter((r) => r.id !== routine.id)].slice(0, ROUTINES_MAX)
      scheduleWrite()
    },
    deleteRoutine(id) {
      const before = snapshot.routines.length
      snapshot.routines = snapshot.routines.filter((r) => r.id !== id)
      if (snapshot.routines.length === before) return false
      scheduleWrite()
      return true
    },
    saveTeammate(teammate) {
      const copy = carryTeammate(teammate)
      snapshot.teammates = [copy, ...snapshot.teammates.filter((t) => t.id !== teammate.id)].slice(0, TEAMMATES_MAX)
      scheduleWrite()
    },
    deleteTeammate(id) {
      const before = snapshot.teammates.length
      snapshot.teammates = snapshot.teammates.filter((t) => t.id !== id)
      if (snapshot.teammates.length === before) return false
      scheduleWrite()
      return true
    },
    saveTemplate(template, expectedRevision) {
      // M182. The revision is the store's, never the caller's: a matching
      // expectation (absent on disk reads as 0) writes current + 1; a
      // mismatch writes NOTHING and hands the standing record back; no
      // expectation is an unconditional save (the M80 door), still bumped.
      const standing = snapshot.templates.find((t) => t.id === template.id)
      const current = standing?.revision ?? 0
      if (expectedRevision !== undefined && (standing === undefined ? expectedRevision !== 0 : expectedRevision !== current)) {
        // A record read at revision N that no longer exists is not resurrected under its old id (the critic).
        if (standing === undefined) return { kind: 'stale', reason: `${template.name} no longer exists — save yours as a copy` }
        return { kind: 'stale', current: { ...standing, nodes: standing.nodes.map((n) => ({ ...n })), edges: standing.edges.map((e) => ({ ...e })) }, reason: `${standing.name} was saved by someone else at revision ${current} — reload it, or save yours as a copy` }
      }
      const revision = standing === undefined ? 0 : current + 1
      const copy: PersistedTemplate = { ...template, nodes: template.nodes.map((n) => ({ ...n })), edges: template.edges.map((e) => ({ ...e })), revision }
      snapshot.templates = [copy, ...snapshot.templates.filter((t) => t.id !== template.id)].slice(0, TEMPLATES_MAX)
      scheduleWrite()
      return { kind: 'saved', template: { ...copy, nodes: copy.nodes.map((n) => ({ ...n })), edges: copy.edges.map((e) => ({ ...e })) } }
    },

    deleteTemplate(id) {
      const before = snapshot.templates.length
      snapshot.templates = snapshot.templates.filter((t) => t.id !== id)
      if (snapshot.templates.length === before) return false
      scheduleWrite()
      return true
    },

    addPrompt(prompt) {
      snapshot.prompts = [...snapshot.prompts, { ...prompt }]
      scheduleWrite()
    },

    deletePrompt(id) {
      const before = snapshot.prompts.length
      snapshot.prompts = snapshot.prompts.filter((p) => p.id !== id)
      if (snapshot.prompts.length === before) return false
      scheduleWrite()
      return true
    },

    workspaces: () =>
      snapshot.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        // Copied out for the reason presets() copies: a caller must not be
        // able to mutate the snapshot the store is about to serialise.
        panelIds: w.panels.map((p) => p.id),
        active: w.id === snapshot.activeWorkspaceId,
        // M337. The share's id and this person's cached role, for the share
        // dialog and the rail's mark — never the org or the doc's bytes.
        ...(w.share === undefined ? {} : { share: { id: w.share.id, role: w.share.role } })
      })),

    // Every workspace's panels, for the merged view. workspaces() carries
    // panelIds because a rail row only needs a count; this carries whole
    // panels because a merged lane needs geometry to lay them out.
    //
    // The panels are COPIED, not referenced — the same rule workspaces() and
    // presets() already obey, sharper here: the merged view's entire job is
    // to translate these rects into lanes for display, and a shared
    // reference would make that display-only offset the value the next
    // coalesced save serialises — a well-formed layout.json with the wrong
    // rects in it, found launches later, with nothing naming the view that
    // caused it.
    mergedWorkspaces() {
      return snapshot.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        active: w.id === snapshot.activeWorkspaceId,
        panels: w.panels.map((p) => ({ ...p }))
      }))
    },

    /**
     * Relocates panels between workspace records.
     *
     * It mints no PanelId and destroys none — the full id set spanned by
     * mergedWorkspaces() is unchanged across a call (verify:layout 112),
     * which is what stops a later Cmd+N minting an id that is still live in
     * another workspace: PanelId doubles as a tmux session name, and
     * `new-session -A` would attach the new panel to the OLD panel's
     * process. It also touches NO SESSION of its own: a moved panel becomes
     * a hidden workspace's panel with a running tmux session, which is
     * exactly the state a workspace switch already produces ("demote, not
     * dispose" in CLAUDE.md) — process lifecycle belongs to the renderer's
     * registry, and this function never reaches pty.kill, backend.destroy,
     * or dropBaseline.
     *
     * Resolving a workspaceId target BEFORE removing anything from any
     * source is still the rule below — an unknown id has to answer null
     * before a single panel moves, or a half-applied move loses panels
     * whose tmux sessions keep running with no UI able to reach them, the
     * same orphan outcome deleteWorkspace's own design rejects. A newName
     * target is different: it is NOT minted at that point. This function
     * first PLANS the move — which panels leave which of the workspaces
     * that already exist — and mints the new workspace only once that plan
     * is known to be non-empty. Minting up front (the first draft's
     * mistake, found in review) let an empty, named, PERSISTED workspace
     * survive a `moving.length === 0` return: "Move to new workspace..."
     * offered for a panel closed between the palette listing it and the
     * user confirming would return null, correctly report that nothing
     * moved, and leave a workspace called "Spike" on disk and in the rail
     * at the next launch anyway — with nothing naming what created it. With
     * the mint deferred, a null return here means exactly what it says:
     * nothing changed, and nothing was created either.
     */
    movePanels(panelIds, target) {
      const wanted = new Set(panelIds)
      if (wanted.size === 0) return null

      // Resolve WHO the target is without creating anything yet. A
      // discriminated union rather than two loose variables, so TypeScript
      // — not a comment — guarantees the mint below only ever reads `name`
      // on the branch that actually has one.
      type Resolution = { kind: 'known'; id: string } | { kind: 'mint'; name: string }
      let resolution: Resolution
      if ('workspaceId' in target) {
        // An id naming nothing is a stale palette row or a second window —
        // the same "changed nothing" answer activateWorkspace already gives
        // an unknown id, rather than a half-applied transaction.
        if (!snapshot.workspaces.some((w) => w.id === target.workspaceId)) return null
        resolution = { kind: 'known', id: target.workspaceId }
      } else {
        resolution = { kind: 'mint', name: target.newName }
      }
      const knownTargetId = resolution.kind === 'known' ? resolution.id : null

      // Plan the move WITHOUT mutating anything yet: which panels leave
      // which workspace, and what each workspace's panels look like
      // afterward. A newName target does not exist yet, so nothing here
      // needs its id — every existing workspace is a candidate source
      // either way. A panel already sitting in a KNOWN target is left
      // alone: matching `wanted` against the target's own list too would
      // duplicate it there.
      const moving: PersistedPanel[] = []
      const removals: { workspace: Workspace; keep: PersistedPanel[] }[] = []
      for (const w of snapshot.workspaces) {
        if (w.id === knownTargetId) continue
        const keep = w.panels.filter((p) => !wanted.has(p.id))
        if (keep.length !== w.panels.length) {
          moving.push(...w.panels.filter((p) => wanted.has(p.id)))
          removals.push({ workspace: w, keep })
        }
      }
      // None of the requested ids existed anywhere outside the target —
      // asking to move nothing real. This is the function's ONE failure
      // mode, and it is genuinely "nothing changed" now: nothing has been
      // mutated above, and — the whole point of planning before minting —
      // nothing has been created either.
      if (moving.length === 0) return null

      // Only now, with a real move guaranteed, does a newName target get
      // minted — see this function's own doc comment for why the ordering
      // is load-bearing rather than incidental.
      const targetId = resolution.kind === 'known' ? resolution.id : doCreateWorkspace(resolution.name)

      const dest = snapshot.workspaces.find((w) => w.id === targetId)
      // Unreachable: a 'known' id was already validated above, and a 'mint'
      // id is always present in snapshot.workspaces the instant
      // doCreateWorkspace returns it. Kept as a guard rather than an
      // assertion so a future change that breaks the invariant fails softly.
      //
      // It sits ABOVE the removals loop, and that ordering is the whole
      // reason the guard is worth having: the loop is what actually pulls
      // panels out of their source records, so a `return null` taken after it
      // would report failure having already deleted panels from every source
      // and filed them nowhere — the one outcome worse than either a crash or
      // a refusal. Returning here leaves every source record untouched. The
      // one residue it cannot undo is an empty workspace a 'mint' target has
      // already created, which is visible, nameable and harmless.
      if (!dest) return null

      for (const { workspace, keep } of removals) workspace.panels = keep
      // The rect travels unchanged. A moved panel lands where it was, which
      // may collide with something already in the target — visible the next
      // time the user opens that workspace, and honest: cascading it here
      // would move a panel to a position the user never asked for.
      dest.panels = [...dest.panels, ...moving]

      // A moved panel must not stay named as some OTHER workspace's
      // selection or focus: those ids are per-workspace state, and a
      // selectedId naming a panel the record no longer holds would restore,
      // on the next switch, as a selection nothing answers to.
      for (const w of snapshot.workspaces) {
        if (w.id === targetId) continue
        if (w.selectedId !== null && wanted.has(w.selectedId)) w.selectedId = null
        if (w.focusedId !== null && wanted.has(w.focusedId)) w.focusedId = null
      }

      scheduleWrite()
      return { workspaceId: targetId }
    },

    createWorkspace(name) {
      return doCreateWorkspace(name)
    },
    current() {
      return snapshot
    },
    addWorkspaceRecord(workspace) {
      snapshot.workspaces = [...snapshot.workspaces, workspace]
      scheduleWrite()
    },

    activeWorkspaceId() {
      return activeWorkspace().id
    },
    workspaceShare(id) {
      const s = snapshot.workspaces.find((w) => w.id === id)?.share
      return s === undefined ? undefined : { ...s }
    },
    setWorkspaceShare(id, share) {
      const w = snapshot.workspaces.find((x) => x.id === id)
      if (w === undefined) return false
      if (share === null) { delete w.share; delete w.crdt }
      else {
        // A different share is a different room: the old room's doc is not this one's.
        if (w.share !== undefined && w.share.id !== share.id) delete w.crdt
        w.share = { ...share }
      }
      scheduleWrite()
      return true
    },
    sharedState(id) {
      const b64 = snapshot.workspaces.find((w) => w.id === id)?.crdt
      return b64 === undefined ? null : new Uint8Array(Buffer.from(b64, 'base64'))
    },
    setSharedState(id, state) {
      const w = snapshot.workspaces.find((x) => x.id === id)
      // Only beside a share — parseWorkspace drops a doc with no room anyway.
      if (w === undefined || w.share === undefined) return
      w.crdt = Buffer.from(state).toString('base64')
      scheduleWrite()
    },
    applySharedLayout(id, change) {
      const w = snapshot.workspaces.find((x) => x.id === id)
      if (w === undefined) return
      const rects = new Map(change.rects.map((r) => [r.id, r]))
      if (rects.size > 0) {
        w.panels = w.panels.map((p) => {
          const r = rects.get(p.id)
          return r === undefined ? p : { ...p, x: r.x, y: r.y, w: r.w, h: r.h, z: r.z }
        })
      }
      if (change.groups !== undefined) {
        // A colour this build does not know is not a group this build can draw.
        w.groups = change.groups
          .filter((g) => (GROUP_COLOURS as readonly string[]).includes(g.colour))
          .map((g) => ({ id: g.id, label: g.label, colour: g.colour as GroupColour, panelIds: [...g.panelIds], ...(g.collapsed === true ? { collapsed: true } : {}) }))
      }
      scheduleWrite()
    },

    renameWorkspace(id, name) {
      const found = snapshot.workspaces.find((w) => w.id === id)
      if (!found) return false
      snapshot.workspaces = snapshot.workspaces.map((w) =>
        w.id === id ? { ...w, name } : w
      )
      scheduleWrite()
      return true
    },

    deleteWorkspace(id) {
      const before = snapshot.workspaces.length
      snapshot.workspaces = snapshot.workspaces.filter((w) => w.id !== id)
      if (snapshot.workspaces.length === before) return false
      // NEVER ZERO. parseLayout guarantees at least one workspace on LOAD, but
      // that is the read path; this is a write path that did not exist when it
      // was written. With an empty array, activeWorkspace()'s repair branch —
      // documented as unreachable from a parsed file — fires on the next save
      // and repairs by discarding whatever the caller had.
      if (snapshot.workspaces.length === 0) {
        snapshot.workspaces = [defaultWorkspace()]
      }
      // An activeWorkspaceId naming a record that is gone is the same class of
      // fact-on-disk-that-outlives-this-run as a defaultPresetId naming a
      // deleted preset: recoverable at read time, but only HERE is the moment
      // the workspace goes away visible.
      if (snapshot.activeWorkspaceId === id) {
        snapshot.activeWorkspaceId = snapshot.workspaces[0].id
      }
      scheduleWrite()
      return true
    },

    activateWorkspace(id, outgoing) {
      const target = snapshot.workspaces.find((w) => w.id === id)
      // Nothing is written for an unknown id. A half-applied transaction — the
      // outgoing state saved, the switch refused — is strictly worse than a
      // no-op, because the caller has no way to tell it happened.
      if (!target) return null

      // 1. Write the outgoing canvas into the workspace being LEFT. Calling
      //    the same function save() itself calls is exactly right here: it
      //    merges into activeWorkspace(), which is still the OLD one at this
      //    point in the function. Ordering is the whole mechanism — moving
      //    this below the flip is the save race. It does NOT obey the three
      //    restore.* settings (applyRestoreSettings: false) — those answer
      //    "what should the app show at launch", and a switch is not a
      //    launch. With restore.layout off, applying them here would skip
      //    `w.panels = …` and leave the workspace's panels un-recorded while
      //    their tmux sessions keep running — reachable from no workspace,
      //    the orphan outcome the delete design explicitly rejects.
      doSave(outgoing, false)

      // 2. Flip.
      snapshot.activeWorkspaceId = id
      scheduleWrite()

      // 3. Hand back the incoming canvas exactly as initial() would IN
      //    ORDERING (await pty:list before committing panels stays load-
      //    bearing — see the caller), but also restore-settings-free: the
      //    read side must match the write side above, or a switch lands on
      //    an empty canvas whose panels are sitting untouched on disk.
      return { state: doInitial(false), allPanelIds: allPanelIds() }
    },

    reset() {
      const w = activeWorkspace()
      const fresh = defaultWorkspace()
      w.panels = []
      w.camera = { ...fresh.camera }
      w.selectedId = null
      w.focusedId = null
      delete w.annotations
      delete w.workItems
      delete w.retainedOutcomes
      // M181. A reset is a first run again: the starter may lay itself out once more.
      delete w.starter
      scheduleWrite()
    },

    flushSync() {
      if (cancelPending) {
        cancelPending()
        cancelPending = null
      }
      if (dirty) writeNow()
    },

    baseline(panelId) {
      return snapshot.baselines[panelId]
    },
    setBaseline(panelId, baseline) {
      snapshot.baselines[panelId] = baseline
      scheduleWrite()
    },
    dropBaseline(panelId) {
      if (snapshot.baselines[panelId] === undefined) return
      delete snapshot.baselines[panelId]
      scheduleWrite()
    },
    baselineIds() {
      return Object.keys(snapshot.baselines)
    },
    baselinePeers(root, exceptPanelId) {
      return Object.entries(snapshot.baselines)
        .filter(([id, b]) => id !== exceptPanelId && b.root === root).length
    },
    session(panelId) {
      return snapshot.sessions[panelId]
    },
    setSession(panelId, sessionId) {
      snapshot.sessions[panelId] = sessionId
      scheduleWrite()
    },
    dropSession(panelId) {
      if (snapshot.sessions[panelId] === undefined) return
      delete snapshot.sessions[panelId]
      scheduleWrite()
    },
    recentDirectories() {
      return [...snapshot.recentDirectories]
    },
    recentDirectoryUsed() {
      // Only the directories still on the list: a time for one that fell off
      // the cap would be a row nobody can see.
      const out: Record<string, number> = {}
      for (const d of snapshot.recentDirectories) { const at = snapshot.recentDirectoryUsed[d]; if (at !== undefined) out[d] = at }
      return out
    },
    addRecentDirectory(cwd, at = Date.now()) {
      if (cwd === '') return
      snapshot.recentDirectories = [cwd, ...snapshot.recentDirectories.filter((d) => d !== cwd)].slice(0, RECENT_DIRECTORIES_CAP)
      const used: Record<string, number> = {}
      for (const d of snapshot.recentDirectories) { const t = d === cwd ? at : snapshot.recentDirectoryUsed[d]; if (t !== undefined) used[d] = t }
      snapshot.recentDirectoryUsed = used
      scheduleWrite()
    },
    worktrees() {
      return snapshot.worktrees.map((w) => ({ ...w }))
    },
    worktreeForPanel(panelId, root) {
      const found = snapshot.worktrees.find((w) => w.panelId === panelId && w.root === root)
      return found === undefined ? undefined : { ...found }
    },
    addWorktree(record) {
      snapshot.worktrees = [...snapshot.worktrees.filter((w) => w.id !== record.id), { ...record }]
      scheduleWrite()
    },
    dropWorktree(id) {
      const before = snapshot.worktrees.length
      snapshot.worktrees = snapshot.worktrees.filter((w) => w.id !== id)
      if (snapshot.worktrees.length === before) return false
      scheduleWrite()
      return true
    },
    markPresetReviewed(id) {
      const found = snapshot.presets.find((p) => p.id === id)
      if (!found) return false
      // Rebuilt without the key, setPresetWorktree's rule: reviewed is ABSENT,
      // never `true` on disk.
      snapshot.presets = snapshot.presets.map((p) => {
        if (p.id !== id) return p
        const { reviewed: _read, ...rest } = p
        return rest
      })
      scheduleWrite()
      return true
    },
    setPresetWorktree(id, on) {
      const found = snapshot.presets.find((p) => p.id === id)
      if (!found) return false
      snapshot.presets = snapshot.presets.map((p) => {
        if (p.id !== id) return p
        // Rebuilt without the key rather than assigned `false`: absence is
        // what every reader tests with `in`, and `false` on disk is a
        // well-formed "no" that every parser would then have to keep
        // normalising forever.
        const { worktree: _dropped, ...rest } = p
        return on ? { ...rest, worktree: true } : rest
      })
      scheduleWrite()
      return true
    }
  }
}
