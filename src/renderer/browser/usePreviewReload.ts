import { useEffect, type MutableRefObject } from 'react'
import { isBrowserPanel, isFilePanel, type Panel } from '@renderer/panels/panels'
import { previewReloadDecision } from '@shared/preview'
import { liveBrowserUrl, reloadBrowser } from './browser-store'

/**
 * M195 (D03). WHICH PREVIEW A FILE CHANGE BELONGS TO — one subscription for
 * every pane on the canvas.
 *
 * This effect used to live in `BrowserNode.tsx`, subscribed per pane, with a
 * callback that took NO PARAMETER: the event was never read and the only
 * filter was the guest's own hostname, so every loopback pane reloaded on
 * every open file panel's change. Two projects on one canvas reloaded one
 * another, and an unrelated note reloaded both.
 *
 * It is here, and not in the node, for three reasons in this order:
 *
 *  1. The decision needs the PANEL ARRAY. `FileChangedEvent` carries
 *     `{ panelId, result }` and no path (`shared/file-panel.ts` — `FileResult`
 *     has none), but the renderer already holds that file panel's
 *     `source.path`. Resolving it here is what let this milestone close D03
 *     with no IPC change at all; the node has neither the array nor the
 *     bindings of its neighbours.
 *  2. ONE subscription rather than one per pane, reading refs inside the
 *     callback — `useHandoff`'s shape, and for its reason: a canvas holding
 *     several previews should not hold several listeners for one event.
 *  3. The guest is reached through the store's `reloadBrowser`, the door that
 *     already exists for exactly this (an `exit-ok` edge into a pane). The
 *     node keeps owning its guest, so the guest's identity, its history and
 *     its `webContentsId` — which `browser:read` and `preview:capture` resolve
 *     against — are untouched.
 *
 * The panels it reads are the ON-SCREEN ones (`displayPanelsRef`, not
 * `panelsRef`), which is that ref's own documented rule: a reload acts on a
 * live guest a person is looking at, and while the merged view is open the
 * previews on screen belong to other workspaces. Reading the saved array
 * there would have quietly stopped every merged-view preview from reloading —
 * a behaviour the per-node subscription this replaced did have.
 *
 * The coalesce is PER PANE. An editor's save fires several `file:changed`
 * events in a few milliseconds (write, rename, chmod) and a reload per event
 * is a flashing pane and three page loads; one SHARED timer would be worse
 * than either, because two projects reloading at once would cancel each other
 * and one of them would never reload at all.
 */
const COALESCE_MS = 300

export function usePreviewReload(deps: { onScreenPanelsRef: MutableRefObject<Panel[]> }): void {
  const { onScreenPanelsRef } = deps
  useEffect(() => {
    const timers = new Map<string, number>()
    const off = window.canvas.file.onChanged((event) => {
      const panels = onScreenPanelsRef.current
      // The changed file's path, resolved from the panel the event names. A
      // panel closed between the write and the event resolves to nothing,
      // which is `no-path`; a panel that is still there and has no path this
      // canvas can read (a skill panel) is `unknown-source`. Both are skipped
      // and neither is `outside`, because the three lead to different fixes.
      const changed = panels.find((p) => p.rect.id === event.panelId)
      const changedPath = changed !== undefined && isFilePanel(changed) ? changed.source.path : undefined
      for (const panel of panels) {
        if (!isBrowserPanel(panel)) continue
        const id = panel.rect.id
        const decision = previewReloadDecision({
          binding: panel.preview,
          changedPath,
          // A skill panel registers the same watch and carries no path (M128),
          // so it is a LIVE panel this canvas cannot resolve — `unknown-source`
          // rather than `no-path`, which means the panel is gone.
          changedPanelExists: changed !== undefined,
          // The GUEST's own url, never the record's: the record is written by
          // `did-navigate` one render later, so a pane navigated to a remote
          // page a moment ago would still read as loopback here.
          liveUrl: liveBrowserUrl(id)
        })
        if (decision.kind !== 'reload') continue
        window.clearTimeout(timers.get(id))
        timers.set(id, window.setTimeout(() => { timers.delete(id); reloadBrowser(id) }, COALESCE_MS))
      }
    })
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
      off()
    }
  }, [onScreenPanelsRef])
}
