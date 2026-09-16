import { join } from 'node:path'
import { statSync, readFileSync, realpathSync, watch as fsWatch, type FSWatcher } from 'node:fs'
import { app } from 'electron'
import { expandTilde, resolveCwd } from '../pty-manager'
import { allPresets, mintPromptId, presetFromCapture, presetRows, resolveAvailability, templateOf, unreviewedPresetReason } from '../presets'
import { mergePrompts, readProjectPrompts } from '../prompts'
import { resolveSpawnRequest } from '../spawn-request'
import { restoreFromSnapshot } from '../layout-snapshots'
import { readVault } from '../vault-read'
import { readImage } from '../image-read'
import { prepareStarter } from '../starter-prepare'
import { createRoutineRunner } from '../routine-runner'
import { routineRefusal, ROUTINE_MIN_MS } from '../../shared/routines'
import { parseTeammates, parseRoutines } from '../../shared/layout-schema'
import { parseShelf } from '../../shared/skills'
import { allTemplates, isBuiltInTemplate } from '../../shared/templates'
import { listAssignedWorkItems as listGithubWorkItems } from '../github-client'
import { fsRealpath } from '../places'
import { repoRootForBrief, notVisibleFor } from '../skill-assign'
import { IPC_EVENTS } from '../../shared/ipc-contract'
import type { PaletteHandlers } from '../ipc'
import { askOpenDirectory } from './dialogs'
import { readyContents } from './context'
import { TEAMMATE_ROOT, teammateSlug, type Places } from './places'
import type { MenuActions } from './menu-actions'
import type { ControlWiring } from './control-wiring'
import type { Stores } from './stores'
import type { MainState } from './context'

export interface PaletteWiring {
  handlers: PaletteHandlers
  /**
   * M101. Arm every routine the layout holds. Called once at startup with
   * `true` — a tick that fell while the app was closed is marked MISSED at
   * arm, never fired — and again from every save and delete.
   */
  armRoutines(startup?: boolean): string[]
}

/**
 * The palette's own surface: presets, prompts, templates, the roster,
 * routines, the vault, memory and the snapshot ring. One object because
 * `registerIpcHandlers` takes it as ONE positional parameter (`PaletteHandlers`)
 * — its members are not free to become separate arguments without shifting
 * every positional call site, `scripts/panels-entry.cjs` included.
 */
export function createPaletteWiring(
  state: MainState,
  stores: Stores,
  places: Places,
  menu: MenuActions,
  control: ControlWiring,
  which: (command: string) => string | null
): PaletteWiring {
  const { layoutStore, layoutSnapshots, brokerAudit, runLedger, memoryStore, teammateMemory } = stores
  const { rebuildMenu, afterPresetChange, onSpawnPreset, confirmReset } = menu

  /**
   * M85. Main's OWN watch on the vault root, so a note an agent writes into
   * the folder reaches the pane with no gesture. One recursive watch, replaced
   * when the root changes, debounced so a save that touches several files is
   * one event, and never opening a window (the send goes only to one that
   * exists — a vault change is news, not a reason to pop the app open).
   */
  let vaultWatch: { root: string; watcher: FSWatcher } | null = null
  let vaultChangedTimer: NodeJS.Timeout | null = null
  const armVaultWatch = (root: string): void => {
    if (vaultWatch !== null && vaultWatch.root === root) return
    vaultWatch?.watcher.close()
    vaultWatch = null
    let isDir = false
    try { isDir = statSync(root).isDirectory() } catch { isDir = false }
    if (!isDir) return
    try {
      const watcher = fsWatch(root, { persistent: false, recursive: true }, () => {
        if (vaultChangedTimer !== null) clearTimeout(vaultChangedTimer)
        vaultChangedTimer = setTimeout(() => {
          vaultChangedTimer = null
          readyContents(state)?.send(IPC_EVENTS.VAULT_CHANGED)
        }, 250)
        vaultChangedTimer.unref?.()
      })
      watcher.on('error', () => { vaultWatch?.watcher.close(); vaultWatch = null })
      vaultWatch = { root, watcher }
    } catch { /* no watch; the refresh control still works */ }
  }

  // M101. The routine runner: intervals in main, the tick answered by the
  // renderer (only it mints panels). Re-armed on every save and delete; a tick
  // that fell while the app was closed is marked MISSED at arm, never fired.
  const routineRunner = createRoutineRunner({
    now: () => Date.now(),
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); t.unref?.(); return t },
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    fire: (routine) => { state.window?.webContents.send(IPC_EVENTS.ROUTINE_FIRE, routine) },
    save: (routine) => layoutStore.saveRoutine(routine)
  })
  const armRoutines = (startup = false): string[] => routineRunner.arm(layoutStore.routines(), { startup })

  const handlers: PaletteHandlers = {
    list: () =>
      presetRows(
        resolveAvailability(allPresets(layoutStore.presets()), which),
        layoutStore.defaultPresetId()
      ),
    rename: (id, name) => {
      const changed = layoutStore.renamePreset(id, name)
      // The menu lists presets by name, and Cmd+N's template carries none —
      // but a rename can still change what the menu SAYS, so rebuild. Cheap,
      // and the alternative is a menu that disagrees with the palette until
      // relaunch.
      if (changed) afterPresetChange()
      return changed
    },
    remove: (id) => {
      const changed = layoutStore.deletePreset(id)
      if (changed) afterPresetChange()
      return changed
    },
    setDefault: (id) => {
      layoutStore.setDefaultPreset(id)
      afterPresetChange()
    },
    spawn: (id) => onSpawnPreset(id),
    markPresetReviewed: (id) => {
      const changed = layoutStore.markPresetReviewed(id)
      // The menu labels an unread preset and disables it, so it must learn.
      if (changed) afterPresetChange()
      return changed
    },
    spawnWith: (req) => {
      // M100. A teammate's terminal is gated the same way its chat is.
      const place = places.gate.check(req.teammateId, expandTilde(req.cwd))
      if (!place.ok) return { kind: 'refused' as const, reason: place.reason }
      // One pure resolver, shared with the verify harness — see
      // spawn-request.ts for the rules (absent command stays absent, a
      // file is refused like a missing path, a typed command is a task).
      const resolved = resolveSpawnRequest(req, allPresets(layoutStore.presets()), {
        expand: expandTilde,
        isDirectory: (p) => { try { return statSync(p).isDirectory() } catch { return false } }
      })
      if (resolved.kind === 'refused') return resolved
      state.window?.webContents.send(IPC_EVENTS.PRESET_SPAWN, resolved.template)
      return { kind: 'spawned' }
    },
    recentDirectories: () => layoutStore.recentDirectories(),
    recentDirectoryUsed: () => layoutStore.recentDirectoryUsed(),
    savePanel: (captured) => {
      layoutStore.addPreset(presetFromCapture(layoutStore.presets(), captured))
      rebuildMenu()
    },
    setWorktree: (id, on) => {
      const changed = layoutStore.setPresetWorktree(id, on)
      // The template Cmd+N holds carries the flag, so a change has to
      // re-push it — the same reason setDefault goes through afterPresetChange.
      if (changed) afterPresetChange()
      return changed
    },
    requestReset: () => {
      void confirmReset()
    },
    listPrompts: (cwd) =>
      mergePrompts(
        layoutStore.prompts(),
        // resolveCwd is pty-manager's — the same expansion a spawn gets, so
        // the prompts the palette lists come from the directory the panel
        // is actually in, not from a literal '~' that resolves to nothing.
        cwd === null ? [] : readProjectPrompts(resolveCwd(cwd))
      ),
    savePrompt: (name, body) => {
      layoutStore.addPrompt({ id: mintPromptId(layoutStore.prompts()), name, body })
    },
    removePrompt: (id) => layoutStore.deletePrompt(id),
    // M80. Built-ins first, then the user's — the preset list's own rule; a
    // save mints an id when the caller has none; a delete refuses a built-in
    // by returning false, the same answer a project prompt's id gets.
    // M80. The resolved template, never a spawn: only main can turn an
    // absent command into the login shell (M5b), and a template's node
    // needs that answer before it mints anything.
    presetTemplate: (id) => {
      const found = allPresets(layoutStore.presets()).find((p) => p.id === id)
      if (found === undefined) return null
      // M253 (the critic, 1). A workflow node bound to a preset mints a
      // panel straight from this template — the fifth door, and it must
      // refuse an unread pack preset like the other four, by name.
      const unread = unreviewedPresetReason(found)
      return unread === null ? templateOf(found) : { refused: unread }
    },
    // M89. The audit's read half — rows only, metadata by construction.
    brokerAudit: (limit, service) => brokerAudit.list(limit, service),
    // M88. GitHub through the injected requester, over the credential store.
    // Through the BROKER: the client never reads the store, and the panel's
    // reads sit in the audit beside the agents' own calls.
    githubList: (panelId) => listGithubWorkItems({ broker: control.broker, ...(panelId === undefined ? {} : { panelId }) }),
    snapshotList: () => layoutSnapshots.list(),
    // M142. History on #46's ledger; the renderer prices it.
    ledgerUsage: (since) => runLedger.usage(since),
    // M181. Both under userData: the picture bytes never cross as a file path the renderer could open.
    imageRead: (path) => readImage(path),
    starterPrepare: () => prepareStarter(join(app.getPath('userData'), 'starter')),
    snapshotRestore: (at, afterId) => {
      const path = join(app.getPath('userData'), 'layout-snapshots', `${at}.json`)
      let bytes: string
      try { bytes = readFileSync(path, 'utf8') } catch { return { kind: 'refused', reason: 'that snapshot is gone — the ring keeps the newest twenty' } }
      const result = restoreFromSnapshot(layoutStore.current(), bytes, Date.now(), (n) => `n${n}`, afterId)
      if (result.kind === 'refused') return result
      const added = result.layout.workspaces[result.layout.workspaces.length - 1]!
      layoutStore.addWorkspaceRecord(added)
      return { kind: 'restored', workspaceId: added.id }
    },
    // M85. The vault's read, in main for `file-read.ts`'s reason. The root
    // is expanded and realpath'd, NEVER resolveCwd'd: that helper falls back
    // to $HOME for a path that is not there, and a typo'd vault would have
    // walked the user's entire home directory and listed it as the vault
    // (M85's verifier). A missing root is the reader's own "no vault" arm.
    vaultRead: (root) => {
      const expanded = expandTilde(root.trim())
      let real = expanded
      try { real = realpathSync(expanded) } catch { /* the reader answers with its reason */ }
      armVaultWatch(real)
      return readVault(real)
    },
    memoryList: async (root, limit) => {
      if (root.startsWith(TEAMMATE_ROOT)) return teammateMemory.list(teammateSlug(stores, root), limit)
      const resolved = await places.memoryScope(root)
      if (!resolved.ok) return { root, entries: [], skipped: 0, unresolved: resolved.reason }
      return { ...memoryStore.list(resolved.root, limit), ...(resolved.scope === undefined ? {} : { scope: resolved.scope }) }
    },
    memoryAdd: async (req) => {
      if (req.root.startsWith(TEAMMATE_ROOT)) {
        const t = teammateMemory.add({ ...req, root: teammateSlug(stores, req.root) })
        return t.ok ? { ok: true } : { ok: false, reason: t.reason }
      }
      const resolved = await places.memoryScope(req.root)
      if (!resolved.ok) return { ok: false, reason: resolved.reason }
      const r = memoryStore.add({ ...req, root: resolved.root })
      return r.ok ? { ok: true } : { ok: false, reason: r.reason }
    },
    listTemplates: () => allTemplates(layoutStore.templates()),
    // M127. The shelf, whole. Parsed on the way in by the SAME rules the
    // file is, so a malformed column reaching the store from the renderer
    // is dropped by name rather than written back to disk.
    shelf: () => layoutStore.shelf(),
    saveShelf: (shelf) => {
      const warnings: string[] = []
      const parsed = parseShelf(shelf, warnings)
      // M137. Said, never swallowed: a column dropped here is a column the
      // renderer just showed the user, and the only other trace is its
      // absence from the file. Not thrown (saveTeammate's shape) — the
      // shelf is many columns and the good ones still land.
      for (const w of warnings) console.warn(`[shelf] ${w}`)
      return layoutStore.saveShelf(parsed)
    },
    // M100. The roster. A save is an upsert by id; the record is parsed by
    // the same rules the file is (a relative place never lands).
    listTeammates: () => layoutStore.teammates(),
    saveTeammate: (teammate, cwd) => {
      // A record the parser drops is REFUSED, never replaced with an empty one
      // (which would wipe its places and services silently — the verifier).
      const warnings: string[] = []
      const parsed = parseTeammates([teammate], warnings)[0]
      if (parsed === undefined) throw new Error(`the teammate could not be kept — ${warnings.join('; ')}`)
      layoutStore.saveTeammate(parsed)
      // M131 fix round 2. `cwd` arrives only from the assign door; its
      // REAL (symlink-resolved) verdict on every project-scoped key just
      // saved rides back on THIS response — no new channel, and no
      // silent drop the pane could show as a plain success.
      const notVisible = cwd === undefined || cwd === ''
        ? []
        : notVisibleFor(parsed, repoRootForBrief(cwd, places.laneRootOf), fsRealpath)
      return notVisible.length > 0 ? { teammate: parsed, notVisible } : { teammate: parsed }
    },
    removeTeammate: (id) => layoutStore.deleteTeammate(id),
    // M101. A save is refused BY NAME against M96's table and the teammate's
    // schedule permission; a saved or deleted routine re-arms the runner.
    listRoutines: () => layoutStore.routines(),
    saveRoutine: (routine) => {
      const parsed = parseRoutines([routine], [])[0]
      if (parsed === undefined) return { kind: 'refused' as const, reason: `the routine could not be kept — the interval is at least ${ROUTINE_MIN_MS / 60_000} minute and it needs a name, a teammate and a prompt` }
      const mate = layoutStore.teammates().find((t) => t.id === parsed.teammateId)
      const refusal = routineRefusal(parsed, mate === undefined ? undefined : { name: mate.name, scheduling: mate.scheduling, places: mate.places })
      if (refusal !== null) return { kind: 'refused' as const, reason: refusal }
      layoutStore.saveRoutine(parsed)
      armRoutines()
      return { kind: 'saved' as const, routine: parsed }
    },
    removeRoutine: (id) => { const r = layoutStore.deleteRoutine(id); armRoutines(); return r },
    runRoutine: (id) => routineRunner.runNow(id),
    // A place is chosen in the OS dialog: the answer is absolute and real,
    // which is the only kind the record keeps.
    choosePlace: async () => askOpenDirectory(null, { title: 'Choose a folder this teammate may touch' }),
    saveTemplate: (template, expectedRevision) => {
      // A built-in saves as a user COPY with a new id (the built-ins are code, M80).
      const id = template.id !== undefined && template.id !== '' && !isBuiltInTemplate(template.id)
        ? template.id
        : `tpl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
      return layoutStore.saveTemplate({ ...template, id }, expectedRevision)
    },
    removeTemplate: (id) => (isBuiltInTemplate(id) ? false : layoutStore.deleteTemplate(id))
  }

  return { handlers, armRoutines }
}
