import { join } from 'node:path'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { app, ipcMain } from 'electron'
import { IPC, IPC_EVENTS, type CloudDispatchResult, type CloudLaneView, type CloudMergeResult } from '../../shared/ipc-contract'
import type { CloudLane } from '../../shared/cloud-lane'
import { createCloudLanePoller, dispatchCloudLane, mergeCloudLane, parseLanesFile, readCloudFacts, serializeLanes, type CloudBroker } from '../cloud-lanes'
import { repoFromRemote } from '../github-publish'
import { confirm, liveWindow } from './dialogs'
import { readyContents, type MainState } from './context'

/**
 * M543. CLOUD LANES, WIRED — installed from main/index.ts beside
 * registerIpcHandlers, the way `installTmuxAdopt` is, because it needs the
 * broker the control wiring builds and appending a positional parameter for
 * one lane's doors would shift every harness entry (src/main/CLAUDE.md, rule 3).
 *
 * The lanes live in `userData/cloud-lanes.json`, written whole and atomically
 * on every change: a lane is a few hundred bytes and changes at poll speed,
 * so there is nothing to debounce. Every lane read back at launch is watched,
 * and so re-derived at once (cloud-lanes.ts) rather than trusted.
 */
export interface CloudWiringDeps {
  broker: CloudBroker
  /** `git remote get-url origin` in a directory; null when there is none. */
  originOf: (cwd: string) => Promise<string | null>
  /** The file; a parameter so the IPC surface harness never touches userData. */
  file?: string
}

export interface CloudWiring { stop(): void }

export function installCloudLanes(state: MainState, deps: CloudWiringDeps): CloudWiring {
  const file = deps.file ?? join(app.getPath('userData'), 'cloud-lanes.json')
  const read = (): string | null => { try { return readFileSync(file, 'utf8') } catch { return null } }
  const save = (lanes: readonly CloudLane[]): void => {
    try {
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, serializeLanes(lanes), { mode: 0o600 })
      renameSync(tmp, file)
    } catch {
      // A lane that could not be saved is still watched; the next change tries again.
    }
  }

  const view = (lane: CloudLane): CloudLaneView => {
    const stat = poller.statOf(lane.id)
    return { ...lane, reason: poller.reasonOf(lane.id), ...(stat === undefined ? {} : { stat }) }
  }
  const poller = createCloudLanePoller({
    read: (lane) => readCloudFacts(deps.broker, lane),
    now: () => Date.now(),
    // Hidden or minimised: GitHub's rate limit is shared with every other door, and nobody is looking.
    hidden: () => { const w = state.window; return w === null || w.isDestroyed() || !w.isVisible() || w.isMinimized() },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    changed: (lane) => {
      save(poller.lanes())
      readyContents(state)?.send(IPC_EVENTS.CLOUD_CHANGED, view(lane))
    }
  })
  for (const lane of parseLanesFile(read(), Date.now()).lanes) poller.watch(lane)
  const onFocus = (): void => poller.wake()
  app.on('browser-window-focus', onFocus)

  ipcMain.handle(IPC.CLOUD_LIST, () => poller.lanes().map(view))
  ipcMain.handle(IPC.CLOUD_REFRESH, async (_event, id: unknown) => {
    if (typeof id !== 'string') return null
    await poller.pollNow(id)
    const lane = poller.lanes().find((l) => l.id === id)
    return lane === undefined ? null : view(lane)
  })
  ipcMain.handle(IPC.CLOUD_FORGET, (_event, id: unknown) => {
    if (typeof id !== 'string' || !poller.lanes().some((l) => l.id === id)) return false
    poller.forget(id)
    save(poller.lanes())
    return true
  })
  // One merge per lane at a time: a second press while the first is asking
  // would PUT again after a merge and report GitHub's 405 as a refusal.
  const merging = new Set<string>()
  ipcMain.handle(IPC.CLOUD_MERGE, async (_event, id: unknown): Promise<CloudMergeResult> => {
    const lane = typeof id === 'string' ? poller.lanes().find((l) => l.id === id) : undefined
    if (lane === undefined) return { kind: 'refused', reason: 'no such cloud lane' }
    if (merging.has(lane.id)) return { kind: 'refused', reason: 'a merge of this lane is already being asked' }
    merging.add(lane.id)
    try {
      const result = await mergeCloudLane({
        broker: deps.broker,
        now: () => Date.now(),
        confirm: async (ask) => {
          const win = liveWindow(state)
          if (win === null) return false
          return confirm(win, { message: ask.message, detail: ask.detail, verb: 'Merge' })
        }
      }, lane)
      // Read it back at once — merged, refused or unknown — so the card says what GitHub now says.
      if (result.kind !== 'cancelled') await poller.pollNow(lane.id)
      return result
    } finally {
      merging.delete(lane.id)
    }
  })
  ipcMain.handle(IPC.CLOUD_DISPATCH, async (_event, raw: unknown): Promise<CloudDispatchResult> => {
    const r = (raw ?? {}) as Record<string, unknown>
    // The repository: the task's own (`owner/name` from a GitHub key), else
    // the origin remote of the folder it works in — never a guess.
    let repo = typeof r.repo === 'string' ? r.repo : null
    if (repo === null && typeof r.cwd === 'string' && r.cwd.startsWith('/')) {
      const remote = await deps.originOf(r.cwd)
      repo = remote === null ? null : repoFromRemote(remote)
    }
    if (repo === null) return { kind: 'refused', reason: 'this task has no GitHub repository — start it in a folder whose origin is on GitHub, or add it from a GitHub issue' }
    const id = `cl${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
    const result = await dispatchCloudLane({
      broker: deps.broker,
      now: () => Date.now(),
      confirm: async (ask) => {
        const win = liveWindow(state)
        if (win === null) return false
        return confirm(win, { message: ask.message, detail: ask.detail, verb: 'Send to cloud' })
      }
    }, { ...r, id, repo })
    if (result.kind === 'dispatched' || result.kind === 'handoff-failed') {
      poller.watch(result.lane)
      save(poller.lanes())
      return { ...result, lane: { ...result.lane, reason: result.kind === 'handoff-failed' ? result.reason : `waiting for a pull request on issue #${result.lane.issue}` } }
    }
    return result
  })

  return {
    stop() {
      app.removeListener('browser-window-focus', onFocus)
      poller.stop()
    }
  }
}
