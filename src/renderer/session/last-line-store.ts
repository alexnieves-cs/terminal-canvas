import { useSyncExternalStore } from 'react'

/**
 * M105. THE LAST LINE SAID, and the UNREAD mark — per panel, in a module-level
 * store subscribed BY ID (the shape every store since M12 takes), never on
 * `registry.version()`, which carries tier/status/focus/exit and nothing
 * higher-frequency. Set when a chat's turn ends (the transcript's last
 * complete text block), marked unread when that turn ended while the panel
 * was not focused, cleared on focus, and cleared at every panel-removing
 * call site beside `clearAgentState` — or a recycled id inherits a dead
 * panel's last words.
 */
export interface LastLine {
  line: string
  unread: boolean
  at: number
}

const lines = new Map<string, LastLine>()
const listeners = new Map<string, Set<() => void>>()
const EMPTY: LastLine = Object.freeze({ line: '', unread: false, at: 0 }) as LastLine

function notify(id: string): void {
  const set = listeners.get(id)
  if (!set) return
  for (const cb of set) cb()
}

export function setLastLine(id: string, line: string, unread: boolean, at = Date.now()): void {
  const prev = lines.get(id)
  if (prev && prev.line === line && prev.unread === unread) return
  lines.set(id, { line, unread, at })
  notify(id)
}

export function clearUnread(id: string): void {
  const prev = lines.get(id)
  if (!prev || !prev.unread) return
  lines.set(id, { ...prev, unread: false })
  notify(id)
}

export function clearLastLine(id: string): void {
  if (!lines.delete(id)) return
  notify(id)
}

export function getLastLine(id: string): LastLine {
  return lines.get(id) ?? EMPTY
}

export function useLastLine(id: string): LastLine {
  return useSyncExternalStore(
    (cb) => {
      let set = listeners.get(id)
      if (!set) { set = new Set(); listeners.set(id, set) }
      set.add(cb)
      return () => { set?.delete(cb) }
    },
    () => getLastLine(id),
    () => getLastLine(id)
  )
}
