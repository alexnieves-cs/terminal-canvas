import { useEffect } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { isWatcherPanel } from '@renderer/panels/panels'
import { handoffFires, type HandoffEvent } from '@shared/handoff'
import { clearWatch, getWatch, setWatch } from './watcher-store'

/**
 * M84. The renderer's side of a watcher's two lifetimes.
 *
 * Main owns the RUNS; this renderer owns the rect. The subscription is
 * module-level and installed once, like the chat's: a per-panel listener
 * would stack on every remount of a node the tiering re-renders freely.
 *
 * DISPOSAL IS EXPLICIT, never a diff of the visible list — a workspace
 * switch changes `panels` to another workspace's and must not disarm a
 * watcher that is still watching. The panel-removing sites call
 * `disposeWatcher` beside their `registry.dispose`, the rule every store
 * since M12 follows.
 */

let subscribed = false

/**
 * M133. A WORKFLOW trigger is a watcher, so its fire arrives here like every
 * other. What it must do — mint the template's panels — is the RENDERER's
 * and only Canvas can do it, so Canvas registers one handler and this module
 * calls it on the transition into `running`. No second scheduler, no second
 * subscription: the same event, handed on.
 */
let onFired: ((id: string) => void) | null = null
export function setWatcherFiredHandler(fn: ((id: string) => void) | null): void { onFired = fn }

function ensureSubscribed(): void {
  if (subscribed) return
  subscribed = true
  window.canvas.watcher.onState((event) => {
    const { id, ...state } = event
    // The TRANSITION into running is the fire; a second `running` event for
    // the same run (a tail update) must not mint the shape twice.
    const wasRunning = getWatch(id).status === 'running'
    setWatch(id, state)
    if (state.status === 'running' && !wasRunning) onFired?.(id)
  })
  // SEED from main's own list. A renderer reload leaves main's watchers armed
  // and their last runs known, and without this the restored nodes all read
  // `not started` — a wrong answer about a watcher that passed thirty seconds
  // ago, and the reason `watcher:list` exists.
  void window.canvas.watcher.list().then((rows) => {
    for (const row of rows) {
      const { id, ...state } = row
      setWatch(id, state)
    }
  })
}

export function disposeWatcher(id: string): void {
  clearWatch(id)
  void window.canvas.watcher.dispose(id)
}

/**
 * A panel ENDED, and every watcher waiting on it asks the ONE table.
 *
 * This is the renderer's arm of the trigger union, and it is here rather
 * than in main because this is the side that already learns every exit and
 * every turn's end — it draws the handoff edges from exactly these events.
 * `handoffFires` is the same table those edges ask, so a watcher and an edge
 * watching the same source can never disagree about whether it fired.
 */
export function fireWatchersFor(panels: readonly Panel[], sourceId: string, event: HandoffEvent): void {
  for (const panel of panels) {
    if (!isWatcherPanel(panel)) continue
    const trigger = panel.watch.trigger
    if (trigger.kind !== 'panel' || trigger.sourceId !== sourceId) continue
    if (handoffFires(trigger.on, event)) void window.canvas.watcher.run(panel.rect.id)
  }
}

export function useWatchers(): void {
  useEffect(() => { ensureSubscribed() }, [])
}
