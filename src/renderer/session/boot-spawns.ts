import type { PresetTemplate } from '@shared/ipc-contract'

/**
 * PRESET_SPAWN pushes that land before the canvas exists.
 *
 * Main's sendToRenderer waits for did-finish-load and no longer, but the
 * canvas subscribes to preset.onSpawn inside useHistoryVerbs' effect, which
 * runs only after boot()'s awaits and the first render. A `tc open` (or a
 * Dock-menu spawn) in that window was acknowledged `{ok:true}` by the control
 * socket and then dropped with no listener, so nothing spawned and nothing
 * said so. verify:packaged's "a PTY spawned" check caught it on the CI runner,
 * where the first launch is slow enough to make the window wide.
 *
 * The same race onDefault has in main.tsx, with one difference: a spawn is an
 * EVENT, not a value, so every early one is queued rather than the last kept.
 * Installed at module scope from main.tsx, before boot()'s first await. The
 * canvas subscribes first and then claims the queue in the same task, so a
 * push is either queued here or delivered there, never both and never neither.
 */
let queued: PresetTemplate[] = []
let claimed = false

export function captureBootSpawns(preset: { onSpawn(cb: (template: PresetTemplate) => void): () => void }): void {
  // Never unsubscribed: after the claim it is a no-op, and unsubscribing from
  // inside the claim would tie this module to the canvas's effect lifetime.
  preset.onSpawn((template) => {
    if (!claimed) queued.push(template)
  })
}

/** Hands over the queue once; later calls (an effect re-running) get []. */
export function claimBootSpawns(): PresetTemplate[] {
  claimed = true
  const out = queued
  queued = []
  return out
}
