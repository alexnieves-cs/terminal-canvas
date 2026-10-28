/**
 * Lane N (M565). The part of the fake bridge nobody wrote by hand.
 *
 * `CanvasBridge` has a door for every channel main serves, and the demo
 * answers a handful of them for real (fake-bridge.ts). Every other door is a
 * Proxy that answers in the SHAPE the contract declares for it
 * (`scripts/lib/bridge-shapes.cjs` reads the shapes off ipc-contract.ts at
 * build time). A shape is not guessed from the method's name: a `[]` where
 * the renderer expects `{ hits }` throws inside a render and blanks the page.
 *
 *   subscribe  returns its unsubscribe and never fires
 *   list       []          nullable  null       void  undefined
 *   boolean    false       number    0          string ''
 *   refusal    the union's "not here" member (`DEMO_REFUSAL`)
 *   record     no safe default: a read must be answered in fake-bridge.ts
 *              (verify:demo demo.shapes.1); a write rejects
 *
 * The NAME decides one thing only: whether a person reaching the door is
 * told it runs in the app (a write verb), or not (a read).
 */

export type DoorShape = 'subscribe' | 'sync' | 'list' | 'nullable' | 'void' | 'boolean' | 'number' | 'string' | 'refusal' | 'record'
export type DoorShapes = Readonly<Record<string, DoorShape>>

/**
 * A verb that would spawn a process or write outside the page. The lookahead
 * is the camelCase boundary: `use` is a verb and `usage` is a read, `set` and
 * `setDefault` are writes and `settings` is not.
 */
export const WRITE_VERB = /^(write|create|rename|remove|delete|set|spawn|mark|save|reveal|clear|add|choose|run|integrate|merge|start|stop|prepare|open|send|interrupt|cancel|terminate|queue|dispose|answer|import|auto|revoke|pool|restore|export|generate|recover|commit|discard|verify|login|logout|use|share|publish|comment|transition|put|lane$|deck|canvasPng|panelText|flowchart|clipboard|requestReset|movePanels|activate)(?![a-z])/

/** What a refusal-shaped door says. Each union names its discriminant differently, so this carries both, and `refused` for SendAnswer's object form. */
export const DEMO_REASON = 'This runs in the app. The browser demo has no Mac behind it.'
export const DEMO_REFUSAL = Object.freeze({ kind: 'unavailable', ok: false, reason: DEMO_REASON, refused: DEMO_REASON })

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

export function defaultAnswer(shape: DoorShape | undefined): unknown {
  switch (shape) {
    case 'list': return []
    case 'nullable': return null
    case 'boolean': return false
    case 'number': return 0
    case 'string': return ''
    case 'refusal': return { ...DEMO_REFUSAL }
    default: return undefined
  }
}

export function answerByShape(path: string, shape: DoorShape | undefined, notice: Notice): (...args: unknown[]) => unknown {
  const name = path.slice(path.lastIndexOf('.') + 1)
  if (shape === 'subscribe' || /^on[A-Z]/.test(name)) return () => () => undefined
  const write = WRITE_VERB.test(name)
  return () => {
    if (write && !SILENT.has(path)) notice(path)
    // A record has no "nothing here" value to stand in. A write rejects, as an
    // invoke whose handler threw would; a read reaching here is a door
    // demo.shapes.1 says fake-bridge.ts must answer, so it rejects too
    // rather than handing a render an object with none of its fields.
    if (shape === 'record' || shape === 'sync') return Promise.reject(new Error(`${path}: ${DEMO_REASON}`))
    return Promise.resolve(defaultAnswer(shape))
  }
}

/**
 * A namespace door (`window.canvas.git`): every property is a method answered
 * by shape. Methods given in `real` win. A namespace the contract has and the
 * demo never names still works, because the outer proxy builds one of these
 * for any key it is asked for.
 */
export function stubNamespace<T extends object>(ns: string, real: Partial<T>, shapes: DoorShapes, notice: Notice): T {
  const cache = new Map<string, unknown>()
  return new Proxy(real as T, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target) return (target as Record<string, unknown>)[key]
      // A Promise-like probe (`await bridge.git`) must not see a `then`.
      if (key === 'then') return undefined
      let door = cache.get(key)
      if (door === undefined) {
        door = answerByShape(`${ns}.${key}`, shapes[`${ns}.${key}`], notice)
        cache.set(key, door)
      }
      return door
    }
  })
}
