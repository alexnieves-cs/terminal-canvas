import { ipcMain, dialog, type WebContents, type BrowserWindow } from 'electron'
import { IPC, IPC_EVENTS } from '../shared/ipc-contract'
import type {
  PanelId,
  PanelSpec,
  PtyResizeRequest,
  PtyWriteRequest
} from '../shared/types'
import type { CanvasState } from '../shared/layout-schema'
import type { SessionBackendInfo, PresetListRow, CapturedPanel, MergedWorkspace, FileReadRequest , ToolboxReadRequest, ToolboxPermissionsRequest } from '../shared/ipc-contract'
import type { ReviewSubject, ReviewDiffRequest, ReviewCommitRequest, ReviewCommitResult } from '../shared/review'
import type { PtyManager } from './pty-manager'
import { expandTilde } from './pty-manager'
import type { LayoutStore } from './layout-store'
import type { PromptListRow } from './prompts'
import { SETTINGS, type SettingValue } from '../shared/settings-schema'
import type { ReviewEngine } from './review-engine'
import type { CredentialStore } from './credential-store'
import { verifyCredential, createHttpsFetcher } from './credential-verify'
import { createJiraRequester, listAssignedWorkItems, verifyJiraCredential } from './jira-client'
import type { FileWatchers } from './file-watch'
import { readDir } from './fs-tree'
import type { ToolboxCache } from './toolbox-cache'
import { readPermissionRules, resolveToolboxHome } from './toolbox-read'
import { resolveCwd } from './pty-manager'

/**
 * The preset AND prompt mutations the palette drives, handed in from
 * main/index.ts because they need pieces only that module owns — the
 * availability probe, the menu rebuild, the window to push PRESET_DEFAULT at,
 * and the layout store. Kept as an explicit parameter rather than reached for
 * as module state, the same dependency-injection posture
 * ptyManager/layoutStore/getBackendInfo already take. Named PaletteHandlers,
 * not PresetHandlers, since M5b's prompt library is the same "the palette
 * asks main" surface rather than a fifth constructor argument.
 */
export interface PaletteHandlers {
  list(): PresetListRow[]
  rename(id: string, name: string): boolean
  remove(id: string): boolean
  setDefault(id: string): void
  /**
   * A palette pick. Main answers by sending PRESET_SPAWN, exactly as a menu
   * pick does, so the two cannot drift apart.
   */
  spawn(id: string): void
  /**
   * The inspector's save. Handed in for the same reason `spawn` is: minting a
   * preset needs the layout store and a menu rebuild, both of which are
   * main/index.ts's.
   */
  savePanel(captured: CapturedPanel): void
  requestReset(): void
  listPrompts(cwd: string | null): PromptListRow[]
  savePrompt(name: string, body: string): void
  removePrompt(id: string): boolean
}

/** Registers the whole renderer -> main surface. One place, one call. */
export function registerIpcHandlers(
  ptyManager: PtyManager,
  layoutStore: LayoutStore,
  getBackendInfo: () => SessionBackendInfo,
  palette: PaletteHandlers,
  // Its own parameter, not a PaletteHandlers member: SETTINGS_SET needs it to
  // redraw the Restore submenu's checkbox state, the same collaborator
  // getBackendInfo already is rather than something routed through palette.
  rebuildMenu: () => void,
  // Appended last so no existing positional call site shifts. Its own
  // parameter rather than a PaletteHandlers member for the same reason
  // getBackendInfo and rebuildMenu already are: it is main/index.ts's own
  // collaborator, constructed once at module scope, not something the
  // palette surface owns.
  reviewEngine: ReviewEngine,
  /**
   * The write half. A separate parameter from reviewEngine rather than a
   * member of it, because the engine is the read side: a five-call
   * transaction with a cleanup obligation and a non-fatal reconcile step has
   * a different failure model, and folding it in would make every engine
   * fixture carry a filesystem dependency it has no use for.
   */
  reviewCommit: (req: ReviewCommitRequest) => Promise<ReviewCommitResult>,
  // Appended last, for the identical reason reviewEngine and rebuildMenu are:
  // a collaborator main/index.ts constructs once at module scope, not
  // something any existing surface (palette, review) owns, and appending it
  // rather than inserting it keeps every existing positional call site
  // (scripts/panels-entry.cjs included) from having to shift.
  credentialStore: CredentialStore,
  /**
   * Appended last, like reviewEngine and reviewCommit before them, so no
   * existing positional call site shifts.
   */
  fileWatchers: FileWatchers,
  /**
   * Its own parameter rather than reaching for `palette.window`: the dialog
   * needs a parent window, and main/index.ts is the only thing that has one.
   */
  getWindow: () => BrowserWindow | null,
  /**
   * Appended last, like every collaborator before it, so no existing
   * positional call site shifts — scripts/panels-entry.cjs included.
   */
  toolboxCache: ToolboxCache
): void {
  ipcMain.handle(IPC.PTY_CREATE, (_event, spec: PanelSpec) => ptyManager.create(spec))

  ipcMain.handle(IPC.PTY_WRITE, (_event, req: PtyWriteRequest) => {
    ptyManager.write(req.panelId, req.data)
  })

  ipcMain.handle(IPC.PTY_RESIZE, (_event, req: PtyResizeRequest) => {
    ptyManager.resize(req.panelId, req.cols, req.rows)
  })

  ipcMain.handle(IPC.PTY_KILL, (_event, panelId: PanelId) => {
    ptyManager.kill(panelId)
  })

  ipcMain.handle(IPC.PTY_LIST, () => ptyManager.list())

  // The renderer's half of clearing wants-you. Main sees typing (pty:write
  // clears it there) but cannot see FOCUS, which is the other way a user says
  // "I have read this panel" — hence a channel rather than more inference.
  ipcMain.handle(IPC.AGENT_ACKNOWLEDGE, (_event, panelId: PanelId) => {
    ptyManager.acknowledge(panelId)
  })

  ipcMain.handle(IPC.LAYOUT_LOAD, () => layoutStore.initial())

  ipcMain.handle(IPC.LAYOUT_SAVE, (_event, state: CanvasState) => {
    layoutStore.save(state)
  })

  ipcMain.handle(IPC.SESSION_BACKEND, () => getBackendInfo())

  ipcMain.handle(IPC.PRESET_LIST, () => palette.list())
  ipcMain.handle(IPC.PRESET_RENAME, (_event, id: string, name: string) => palette.rename(id, name))
  ipcMain.handle(IPC.PRESET_DELETE, (_event, id: string) => palette.remove(id))
  ipcMain.handle(IPC.PRESET_SET_DEFAULT, (_event, id: string) => palette.setDefault(id))
  ipcMain.handle(IPC.PRESET_SPAWN_BY_ID, (_event, id: string) => palette.spawn(id))
  ipcMain.handle(IPC.PRESET_SAVE_PANEL, (_event, captured: CapturedPanel) => {
    palette.savePanel(captured)
  })
  ipcMain.handle(IPC.CANVAS_REQUEST_RESET, () => palette.requestReset())

  ipcMain.handle(IPC.PROMPT_LIST, (_event, cwd: string | null) => palette.listPrompts(cwd))
  ipcMain.handle(IPC.PROMPT_SAVE, (_event, name: string, body: string) => palette.savePrompt(name, body))
  ipcMain.handle(IPC.PROMPT_DELETE, (_event, id: string) => palette.removePrompt(id))

  // expandTilde, deliberately NOT resolveCwd: `~` expansion is main's job and
  // the renderer has no process.env to do it with — the same boundary
  // readProjectPrompts sits on — but resolveCwd's existence-fallback is a
  // SPAWN-safety behaviour (never fail a shell over a missing cwd) that is
  // wrong here. A directory that vanished under an expanded tree node must
  // reach readDir's own `gone` arm, not silently render $HOME's contents
  // under a heading that still names the deleted directory.
  ipcMain.handle(IPC.FS_LIST, (_event, path: string) =>
    readDir(expandTilde(path), { showHidden: layoutStore.getSetting('files.showHidden') === true })
  )

  ipcMain.handle(IPC.SETTINGS_LIST, () =>
    SETTINGS.map((def) => ({
      id: def.id,
      label: def.label,
      description: def.description,
      keywords: [...def.keywords],
      type: def.type,
      value: layoutStore.getSetting(def.id),
      category: def.category,
      // Passed through so the palette can reject an out-of-range edit before
      // it ever reaches this process's own (silent) range check below.
      min: def.min,
      max: def.max
    }))
  )
  ipcMain.handle(IPC.SETTINGS_SET, (_event, id: string, value: SettingValue) => {
    layoutStore.setPreference(id, value)
    // The Restore submenu renders checkbox state from the same schema, so a
    // toggle made in the palette has to redraw it or the two surfaces disagree
    // until the next unrelated rebuild.
    rebuildMenu()
  })

  // Straight through to the store, with no PaletteHandlers indirection: unlike
  // preset:spawn-by-id (which needs main's command resolution) and
  // canvas:request-reset (which needs main's dialog), nothing here needs a
  // collaborator main/index.ts owns. A handler that just forwards is the right
  // shape when there is genuinely nothing to add.
  ipcMain.handle(IPC.WORKSPACE_LIST, () => layoutStore.workspaces())

  ipcMain.handle(
    IPC.WORKSPACE_ACTIVATE,
    (_event, id: string, outgoing: CanvasState) =>
      layoutStore.activateWorkspace(id, outgoing)
  )

  ipcMain.handle(IPC.WORKSPACE_CREATE, (_event, name: string) =>
    layoutStore.createWorkspace(name)
  )

  ipcMain.handle(IPC.WORKSPACE_RENAME, (_event, id: string, name: string) =>
    layoutStore.renameWorkspace(id, name)
  )

  ipcMain.handle(IPC.WORKSPACE_DELETE, (_event, id: string) =>
    layoutStore.deleteWorkspace(id)
  )

  ipcMain.handle(IPC.WORKSPACE_MERGED, (): MergedWorkspace[] => layoutStore.mergedWorkspaces())

  ipcMain.handle(
    IPC.WORKSPACE_MOVE_PANELS,
    (
      _event,
      panelIds: PanelId[],
      target: { workspaceId: string } | { newName: string }
    ): { workspaceId: string } | null => layoutStore.movePanels(panelIds, target)
  )

  ipcMain.handle(IPC.REVIEW_PANEL, (_event, panelId: PanelId) => reviewEngine.review(panelId))

  // `?? null`, never undefined: an invoke's reply crosses a structured
  // clone, and `undefined` and "no such panel" would be the same value on
  // the far side of it — the absent-vs-present distinction this codebase
  // already guards for `command`.
  ipcMain.handle(IPC.REVIEW_BASELINE, (_event, panelId: PanelId) =>
    layoutStore.baseline(panelId) ?? null)

  // The subject is unpacked HERE rather than in the engine: the engine's
  // question is about a baseline and a subject id, and teaching it the
  // renderer's node shape would make it a second reader of a persisted type.
  ipcMain.handle(IPC.REVIEW_AT, (_event, subject: ReviewSubject) =>
    reviewEngine.reviewAt(
      { root: subject.repoRoot, sha: subject.baselineSha },
      subject.subjectId
    ))

  ipcMain.handle(IPC.REVIEW_DIFF, (_event, req: ReviewDiffRequest) =>
    reviewEngine.fileDiff(req))

  ipcMain.handle(IPC.REVIEW_COMMIT, (_event, req: ReviewCommitRequest) => reviewCommit(req))

  // Metadata only, on every arm. The store's list() already projects field by
  // field; this handler must not re-widen it, and verify:meta 20/21 pin
  // that as source text because no runtime behaviour can observe the
  // difference — everything keeps working, and the renderer simply holds a
  // secret it should never have.
  ipcMain.handle(IPC.CREDENTIAL_LIST, () => credentialStore.list())

  ipcMain.handle(IPC.CREDENTIAL_SET, (_event, req: { service: string; token: string }) => {
    // A malformed payload must refuse like any other rejection, not throw: an
    // uncaught TypeError from `token.trim()` still crosses back as a rejected
    // invoke, but the renderer's `.then` never runs and the prompt hangs open
    // with no feedback. The reason stays generic — it must not echo the
    // payload back.
    if (typeof req?.service !== 'string' || typeof req?.token !== 'string') {
      return { ok: false, reason: 'malformed request' }
    }
    return credentialStore.set(req.service, req.token)
  })

  ipcMain.handle(IPC.CREDENTIAL_DELETE, (_event, service: string) =>
    credentialStore.delete(service))

  // The one caller of credentialStore.read(), and it never returns what it
  // reads: read() supplies the token to a request and verifyCredential
  // answers with what the service said. No handler in this file may call
  // read() directly — that would put a token on the IPC boundary.
  ipcMain.handle(IPC.CREDENTIAL_VERIFY, (_event, service: string) =>
    service === 'jira'
      ? verifyJiraCredential({ store: credentialStore, requester: createJiraRequester() })
      : verifyCredential({ store: credentialStore, fetcher: createHttpsFetcher() }, service))

  ipcMain.handle(IPC.JIRA_LIST, () =>
    listAssignedWorkItems({ store: credentialStore, requester: createJiraRequester() }))

  ipcMain.handle(IPC.FILE_OPEN, async () => {
    const win = getWindow()
    const result = win === null
      ? await dialog.showOpenDialog({ properties: ['openFile'] })
      : await dialog.showOpenDialog(win, { properties: ['openFile'] })
    // ?? null, never undefined: undefined does not survive the structured
    // clone as a distinguishable value, the rule this file already follows.
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.FILE_READ, (event, req: FileReadRequest) => {
    // The watch's callback sends to the SAME webContents that asked. A reload
    // replaces those contents and closeAll() runs on navigation, so a stale
    // sender is never reached — but capturing it here rather than reaching for
    // a module-level window is what makes that true rather than incidental.
    const sender = event.sender
    return fileWatchers.watch(req.panelId, req.path, (result) => {
      if (sender.isDestroyed()) return
      sender.send(IPC_EVENTS.FILE_CHANGED, { panelId: req.panelId, result })
    })
  })

  ipcMain.handle(IPC.FILE_CLOSE, (_event, panelId: PanelId) => {
    fileWatchers.close(panelId)
  })

  ipcMain.handle(IPC.TOOLBOX_READ, (_event, req: ToolboxReadRequest) => {
    // resolveCwd is pty-manager's — the SAME expansion a spawn gets, so the
    // toolbox and the agent can never disagree about which directory they are
    // describing. index.ts already reaches for it this way for prompts.
    return toolboxCache.read({
      cwd: req.cwd === '' ? '' : resolveCwd(req.cwd),
      home: resolveToolboxHome(),
      spawnStamps: ptyManager.configStampsFor(req.panelId)
    })
  })

  ipcMain.handle(IPC.TOOLBOX_PERMISSIONS, (_event, req: ToolboxPermissionsRequest) => {
    return readPermissionRules(req.path, req.bucket)
  })
}

/**
 * A main -> renderer REQUEST, answered on an ephemeral channel invented per
 * call. Two callers now (canvas:counts and preset:capture), which is why it is
 * general rather than a second copy of the same trick.
 *
 * Resolves to `fallback` if the renderer does not answer in time. A dialog
 * that never opens is a worse failure than one that undercounts, and a capture
 * that hangs would wedge the menu.
 *
 * The sequence number matters: two requests inside the same millisecond would
 * otherwise share a reply channel, and the first `once` listener would consume
 * the other's answer.
 */
let replySeq = 0

export function requestFromRenderer<T>(
  webContents: WebContents,
  channel: string,
  fallback: T,
  timeoutMs = 1000
): Promise<T> {
  return new Promise((resolve) => {
    const replyChannel = `${channel}:reply:${Date.now()}:${(replySeq += 1)}`
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      resolve(fallback)
    }, timeoutMs)
    ipcMain.once(replyChannel, (_event, payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
    webContents.send(channel, replyChannel)
  })
}

export function requestCanvasCounts(
  webContents: WebContents
): Promise<{ panels: number; running: number }> {
  return requestFromRenderer(webContents, IPC_EVENTS.CANVAS_COUNTS, { panels: 0, running: 0 })
}
