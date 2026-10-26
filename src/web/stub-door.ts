/**
 * Lane N (M565). The part of the fake bridge nobody wrote by hand.
 *
 * `CanvasBridge` has a door for every channel main serves, and the demo
 * answers a handful of them for real (fake-bridge.ts). Every other door is a
 * Proxy that answers by the method's NAME, because a renderer module that
 * reaches a missing door throws `undefined is not a function` at the call and
 * the whole page goes blank, and a hand-written stub per channel is a second
 * contract that drifts from the first:
 *
 *   on*           a subscription; returns its unsubscribe and never fires.
 *   a write verb  says "in the app" (the notice) and resolves `undefined`.
 *   anything else a read; resolves `[]` for a list-shaped name, else `null`.
 *
 * `null` rather than `undefined` for a read because the renderer's parsers
 * tell an absent key from a malformed one (CLAUDE.md), and a null answer
 * takes the "nothing there" path where an undefined one sometimes reads as
 * "the bridge is older than this door".
 */

/**
 * A verb that would spawn a process or write outside the page. The lookahead
 * is the camelCase boundary: `use` is a verb and `usage` is a read, `set` and
 * `setDefault` are writes and `settings` is not.
 */
export const WRITE_VERB = /^(write|create|rename|remove|delete|set|spawn|mark|save|reveal|clear|add|choose|run|integrate|merge|start|stop|prepare|open|send|interrupt|cancel|terminate|queue|dispose|answer|import|auto|revoke|pool|restore|export|generate|recover|commit|discard|verify|login|logout|use|share|publish|comment|transition|put|lane$|deck|canvasPng|panelText|flowchart|clipboard|requestReset|movePanels|activate)(?![a-z])/

/** A read whose answer is a collection. `list`, `recent`, `rosters`, `asks`… */
const LIST_READ = /^(list|recent|search|history|timeline|rosters|asks|sessions|shares|members|jobs|receipts|merged|adoptable|repositories|transitions|index|trail|discover)(?![a-z])/

export type Notice = (door: string) => void

/**
 * Silent writes: things the renderer does on its own, not things a person
 * asked for. The layout autosaves, a focused panel is acknowledged, presence
 * reports itself. Telling a visitor "saving runs in the app" every few
 * seconds would bury the one notice that matters.
 */
export const SILENT = new Set([
  'layout.save',
  'settings.set',
  'agent.acknowledge',
  'presence.report',
  'team.observe',
  'sharedCanvas.op',
  'sharedText.open',
  'sharedText.close',
  'sharedText.update',
  'session.recoverJob'
])

export function answerByName(path: string, notice: Notice): (...args: unknown[]) => unknown {
  const name = path.slice(path.lastIndexOf('.') + 1)
  if (/^on[A-Z]/.test(name)) return () => () => undefined
  if (WRITE_VERB.test(name) && !SILENT.has(path)) {
    return () => {
      notice(path)
      return Promise.resolve(undefined)
    }
  }
  if (WRITE_VERB.test(name)) return () => Promise.resolve(undefined)
  return () => Promise.resolve(LIST_READ.test(name) ? [] : null)
}

/**
 * A namespace door (`window.canvas.git`): every property is a method answered
 * by name. Methods given in `real` win. A namespace the contract has and the
 * demo never names still works, because the outer proxy builds one of these
 * for any key it is asked for.
 */
export function stubNamespace<T extends object>(ns: string, real: Partial<T>, notice: Notice): T {
  const cache = new Map<string, unknown>()
  return new Proxy(real as T, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target) return (target as Record<string, unknown>)[key]
      // A Promise-like probe (`await bridge.git`) must not see a `then`.
      if (key === 'then') return undefined
      let door = cache.get(key)
      if (door === undefined) {
        door = answerByName(`${ns}.${key}`, notice)
        cache.set(key, door)
      }
      return door
    }
  })
}
