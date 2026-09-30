import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn as spawnChild } from 'node:child_process'
import { BrowserWindow, app, shell, webContents } from 'electron'
import { createExporters } from '../export'
import { createDeckExporter } from '../deck-export'
import { createDeckPdf, createPdfRenderer } from '../deck-pdf'
import { createFlowchartFiles } from '../flowchart-files'
import { FLOWCHART_OPEN_FILTERS, FLOWCHART_SAVE_FILTERS } from '../../shared/flowchart-files'
import { readFile } from '../file-read'
import { readImage } from '../image-read'
import { searchPanels } from '../panel-search'
import { SEARCH_MAX_HITS, SEARCH_MAX_PER_PANEL } from '../scrollback-log'
import { resolveLinkOpen } from '../link-open'
import { buildEnvReport, type CliName } from '../env-report'
import { shellProbeOutcome, shellProbeFacts, reprobeShellEnv, whichFromEnv } from '../shell-env'
import { discoverPreview } from '../preview-discover'
import { capturePreview } from '../preview-capture'
import { descendantsOf } from '../machine-cost'
import { trailFor } from '../skill-trail-read'
import { resolveTranscript, readFrom as readTranscriptFrom } from '../transcript-reader'
import { askOpenFile, askSave, inDownloads, liveWindow } from './dialogs'
import type { Stores } from './stores'
import type { MainState } from './context'
import type { EditorOpenResult, EditorTarget } from '../../shared/editor-open'

/**
 * M37. The worktree verbs. A reveal is `shell.showItemInFolder`, which is the
 * only "here it is" the palette can show for a directory it did not open.
 */
export function createWorktreeHandlers(stores: Stores) {
  const { layoutStore, worktreeManager } = stores
  return {
    list: () => layoutStore.worktrees(),
    remove: (id: string) => worktreeManager.remove(id),
    reveal: (id: string) => {
      const found = layoutStore.worktrees().find((w) => w.id === id)
      if (found === undefined) return false
      shell.showItemInFolder(found.path)
      return true
    }
  }
}

/**
 * M39/M122. The durable logs' read verbs.
 *
 * The tail answers [] when persistence is off, so a card never shows lines
 * from a log the user has asked not to keep — even one written before the
 * toggle. Search is gated on the SAME setting because it reads the same
 * files; the TRANSCRIPT half is a chat's own durable file and answers
 * regardless, and the palette's off reason says so.
 */
export function createScrollbackHandlers(stores: Stores) {
  const { layoutStore, scrollbackLog, agentTranscripts } = stores
  return {
    tail: (panelId: string, lines: number) =>
      layoutStore.getSetting('scrollback.persist') === true ? scrollbackLog.tail(panelId, lines) : Promise.resolve([]),
    clear: () => scrollbackLog.clearAll(),
    search: (panelIds: string[], query: string) => {
      const kinds = new Map((layoutStore.mergedWorkspaces().find((w) => w.active)?.panels ?? []).map((p) => [p.id, p.kind ?? 'terminal'] as const))
      const panels = panelIds.map((id) => ({ id, kind: kinds.get(id) ?? 'terminal' }))
      return searchPanels(query, panels, {
        scrollback: (ids, q, caps) => layoutStore.getSetting('scrollback.persist') === true ? scrollbackLog.search(ids, q, caps) : Promise.resolve([]),
        transcript: (id) => agentTranscripts.read(id).turns
      }, { maxHits: SEARCH_MAX_HITS, maxPerPanel: SEARCH_MAX_PER_PANEL })
    }
  }
}

/**
 * M48. The environment report, built on demand from facts main already holds:
 * the probe's outcome, the login env, the same `which` the presets use, the
 * backend the probe chose, the layout file.
 *
 * M107. Check again: ask the login shell once more and REPORT what it found.
 * The app's own environment (the presets' which, the PTYs' env) applies on
 * relaunch — said on the row, so a green re-probe does not read as a fixed spawn.
 */
export function createEnvReporter(state: MainState, stores: Stores, which: (command: string) => string | null) {
  return async (again: boolean) => {
    const env2 = again ? await reprobeShellEnv() : state.loginEnv
    const which2 = again ? (name: CliName) => whichFromEnv(name, env2) : which
    return buildEnvReport({
      env: env2,
      shell: shellProbeOutcome(),
      which: which2,
      backend: { kind: state.backend.kind, reason: state.backend.reason, tmuxPath: state.backend.kind === 'tmux' ? (which('tmux') ?? null) : null },
      layoutPath: join(app.getPath('userData'), 'layout.json'),
      backupWritten: stores.layoutStore.backupWritten(),
      now: again ? Date.now() : state.probedAt,
      control: { socket: stores.controlSocketPath, cliPath: join(stores.launcherDir, 'tc') },
      // M107. Which shells were asked and whether one answered — the third state.
      probe: shellProbeFacts()
    })
  }
}

/**
 * M51. The only place a Cmd-clicked link opens. The resolution is pure
 * (link-open.ts); this does the two shell calls and turns their outcomes into
 * a result — never a navigation of this window.
 */
export function createLinkHandlers(stores: Stores, editorOpen?: (t: EditorTarget) => Promise<EditorOpenResult>) {
  return {
    open: async (req: { panelId: string; target: string }) => {
      const cwd = stores.ptyManager.list().find((s) => s.panelId === req.panelId)?.cwd ?? homedir()
      const r = resolveLinkOpen({ target: req.target, cwd }, { home: homedir(), exists: existsSync })
      if (r.kind === 'url') { await shell.openExternal(r.url); return { kind: 'opened' as const } }
      // M313. A path WITH a line goes to the person's editor, at that line —
      // the default app is the fallback the opener itself names, not the rule.
      if (r.kind === 'path' && r.line !== undefined && editorOpen !== undefined) {
        const opened = await editorOpen({ path: r.path, line: r.line, ...(r.col === undefined ? {} : { col: r.col }) })
        return opened.kind === 'opened' ? { kind: 'opened' as const, ...(opened.note === undefined ? {} : { reason: opened.note }) } : { kind: 'refused' as const, reason: opened.reason }
      }
      if (r.kind === 'path') {
        const err = await shell.openPath(r.path)
        return err ? { kind: 'refused' as const, reason: err } : (r.note ? { kind: 'opened' as const, reason: r.note } : { kind: 'opened' as const })
      }
      return { kind: 'refused' as const, reason: r.reason }
    }
  }
}

/**
 * M58. The save dialog and the composited frame are main's; the arms and the
 * scrubbing live in export.ts, plain-node tested. A written file is revealed
 * in the Finder, which is the only "done" the palette can show.
 */
export function createExportHandlers(state: MainState, stores: Stores) {
  return {
    ...createExporters({
      log: stores.scrollbackLog,
      persistOn: () => stores.layoutStore.getSetting('scrollback.persist') === true,
      askPath: async (suggested: string) => askSave(liveWindow(state), { defaultPath: inDownloads(suggested) }),
      capture: async () => {
        const win = liveWindow(state)
        if (win === null) throw new Error('no window to capture')
        return (await win.webContents.capturePage()).toPNG()
      },
      // M251. The same dialog, filtered to .pptx; the arms, the scrub and the
      // report live in deck-export.ts, plain-node tested by verify:deck.
      deck: createDeckExporter({
        askPath: async (suggested: string) => askSave(liveWindow(state), {
          title: 'Export deck', defaultPath: inDownloads(suggested), filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
        })
      })
    }),
    // M248. A deck to PDF: main reads the file, a hidden sandboxed window prints it.
    deckPdf: createDeckPdf({
      readText: async (path: string) => readFile(path),
      readImage: (path: string) => readImage(path),
      render: createPdfRenderer(BrowserWindow, app.getPath('temp')),
      askPath: async (suggested: string) => askSave(liveWindow(state), {
        defaultPath: inDownloads(suggested), filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
    })
  }
}

/**
 * A flowchart's two file doors, wired to the system's own sheets. The arms, the
 * outward gate and the SVG refusal are main/flowchart-files.ts, plain-node
 * tested by `verify:flowchart flowchart.files.*`; only the dialogs are here.
 * The save sheet opens under ~/Downloads like the canvas PNG does, filtered to
 * the format's own extension; the open sheet is parented to the window so it is
 * a sheet on the canvas being read into, not an app-modal panel that floats free.
 */
export function createFlowchartHandlers(state: MainState) {
  return createFlowchartFiles({
    askSave: async ({ suggestedName, format }) => askSave(liveWindow(state), {
      title: 'Export flowchart', defaultPath: inDownloads(suggestedName), filters: FLOWCHART_SAVE_FILTERS[format]
    }),
    askOpen: async () => askOpenFile(liveWindow(state), { title: 'Open a Mermaid file', filters: FLOWCHART_OPEN_FILTERS })
  })
}

/**
 * M185/M186. The preview: discovery READS (one lsof over the pids the
 * renderer already holds, one package.json at the directory it named) and
 * starts nothing; capture writes one PNG under `userData/captures` and answers
 * with the page it is a picture of. The guest is resolved by the id the node
 * learned on did-attach, and checked to be a webview, exactly as the read path
 * does — one rule, two doors.
 */
export function createPreviewHandlers() {
  return {
    discover: (req: { pids?: number[]; cwd?: string } | undefined) => discoverPreview({
      // M186. The tree, from ONE `ps` snapshot: the socket is held by a
      // descendant of the panel's shell, never by the shell.
      descendants: async (roots: readonly number[]) => {
        try {
          const out = await new Promise((resolve) => {
            const child = spawnChild('ps', ['-Ao', 'pid=,ppid='], { stdio: ['ignore', 'pipe', 'ignore'] })
            let text = ''
            child.stdout && child.stdout.on('data', (c) => { text += c.toString('utf8') })
            child.on('error', () => resolve(''))
            child.on('close', () => resolve(text))
          })
          const rows = String(out).split('\n').map((line) => line.trim().split(/\s+/).map(Number)).filter((f) => f.length === 2 && Number.isInteger(f[0]) && Number.isInteger(f[1])).map(([pid, ppid]) => ({ pid, ppid }))
          return descendantsOf([...roots], rows)
        } catch { return [...roots] }
      },
      pids: Array.isArray(req?.pids) ? req.pids.filter((n) => Number.isInteger(n) && n > 0) : [],
      cwd: typeof req?.cwd === 'string' && req.cwd.trim() !== '' ? req.cwd : app.getPath('home'),
      run: async (command: string, args: readonly string[]) => {
        const out = await new Promise<{ code: number; stdout: string }>((resolve) => {
          const child = spawnChild(command, [...args], { stdio: ['ignore', 'pipe', 'ignore'] })
          let stdout = ''
          // M186 (M185's critic, 3). A DEADLINE, and deliberately not
          // unref'd: lsof blocks indefinitely on a stale network mount and
          // the invoke would never settle — the pane would say `looking…`
          // for ever. M128 recorded the same lesson for the same reason.
          const deadline = setTimeout(() => { try { child.kill() } catch { /* already gone */ } finally { resolve({ code: 1, stdout: '' }) } }, 3000)
          child.stdout?.on('data', (c: Buffer) => { stdout += c.toString('utf8') })
          child.on('error', () => { clearTimeout(deadline); resolve({ code: 1, stdout: '' }) })
          child.on('close', (code: number | null) => { clearTimeout(deadline); resolve({ code: code ?? 0, stdout }) })
        })
        return out
      },
      readText: async (path: string) => { try { return readFileSync(path, 'utf8') } catch { return undefined } }
    }),
    capture: async (req: { webContentsId?: number } | undefined) => {
      const guest = typeof req?.webContentsId === 'number' ? webContents.fromId(req.webContentsId) : null
      if (guest === null || guest === undefined || guest.isDestroyed()) return { kind: 'refused' as const, reason: 'no page is open in this pane — open one, then capture it' }
      if (guest.getType() !== 'webview') return { kind: 'refused' as const, reason: 'that id is not a page in a browser panel' }
      const dir = join(app.getPath('userData'), 'captures')
      try { mkdirSync(dir, { recursive: true }) } catch { /* the write below names the failure */ }
      return capturePreview({
        getUrl: () => guest.getURL(),
        capture: () => guest.capturePage(),
        write: async (path: string, data: Uint8Array) => { writeFileSync(path, data) },
        dir,
        now: () => Date.now()
      })
    }
  }
}

/**
 * M130. A chat panel's trail is derived in the renderer from events already in
 * memory (Task 8) and never asks main — `agents.get` is keyed by exactly the
 * chat panels the manager tracks, so its presence is the same fact the chat
 * store itself reads. A terminal panel here only ever runs claude
 * (`codex.terminalDoor` is false — §6.1's `codex` refusal has no way to be
 * reached from a terminal in this app today, and nothing here pretends
 * otherwise): the only question is whether it has a pinned agent session at all.
 */
export function createTrailReader(state: MainState, stores: Stores) {
  return async (panelId: string) => {
    if (state.agents?.get(panelId) != null) {
      return { kind: 'unreadable' as const, why: 'this is a chat; its trail is in memory' }
    }
    const sessionId = stores.layoutStore.session(panelId)
    return trailFor({
      backend: 'claude',
      panelId,
      pinnedSession: () => sessionId,
      resolveTranscript,
      // Raw bytes + the file's current size — trailFor owns the decoder
      // and the shrink check itself now (see skill-trail-read.ts), so this
      // is the same shape transcript-reader.ts's readFrom already returns.
      readDelta: readTranscriptFrom
    })
  }
}
