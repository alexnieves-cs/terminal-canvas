import { decodeFrame, encodeFrame, remoteError, type ClientFrame, type HostFrame, type MenuKey } from '../host/wire'

/**
 * Lane Q (M591). `ipcRenderer`, carried over the host's WebSocket.
 *
 * The app's preload (src/preload/index.ts) runs in the page UNEDITED: the
 * host build aliases its `electron` import to `electron-renderer.ts`, which
 * hands it this object. So every one of the bridge's doors is the preload's
 * own line — `ipcRenderer.invoke(IPC.X, …)` — and a door added to the
 * preload is a door in the hosted version on the next build, with nothing
 * to write twice. That is the point of reusing it rather than generating a
 * second bridge: lane N's fake bridge has to keep step with the contract;
 * this one cannot fall out of step, because it is the same file.
 *
 * Frames sent before the socket opens are queued, because the preload and
 * main.tsx call doors at module scope, before any await could have waited.
 */

type Listener = (event: { sender: unknown }, ...args: unknown[]) => void

export interface HostLink {
  /** Marks the page ready: the host's `did-finish-load`. */
  ready(): void
  /** Delivers an event to this page's own listeners, as if main had sent it (the edit keys, M591). */
  emitLocal(channel: string, ...args: unknown[]): void
  onAsk(handler: (kind: string, payload: unknown) => Promise<unknown>): void
  onMenu(handler: (items: MenuKey[]) => void): void
  menu(id: string): void
  onLost(handler: (why: 'replaced' | 'closed') => void): void
}

const listeners = new Map<string, Set<Listener>>()
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; channel: string }>()
const queue: string[] = []
let nextId = 1
let open = false
let askHandler: ((kind: string, payload: unknown) => Promise<unknown>) | null = null
let menuHandler: ((items: MenuKey[]) => void) | null = null
let lostHandler: ((why: 'replaced' | 'closed') => void) | null = null
let lost: 'replaced' | 'closed' | null = null

const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/__tc/ws`
const socket = new WebSocket(url)

function post(frame: ClientFrame): void {
  const text = encodeFrame(frame)
  if (open) socket.send(text)
  else queue.push(text)
}

function deliver(channel: string, args: unknown[]): void {
  const event = { sender: ipcRenderer }
  for (const listener of [...(listeners.get(channel) ?? [])]) {
    try { listener(event, ...args) } catch (error) { console.error(`[host] listener for ${channel} threw`, error) }
  }
}

function goneWith(why: 'replaced' | 'closed'): void {
  if (lost !== null) return
  lost = why
  for (const [, p] of pending) p.reject(remoteError(p.channel, 'the host connection closed'))
  pending.clear()
  lostHandler?.(why)
}

socket.addEventListener('open', () => {
  open = true
  for (const text of queue.splice(0, queue.length)) socket.send(text)
})
socket.addEventListener('close', () => goneWith('closed'))
socket.addEventListener('message', (message) => {
  const frame = decodeFrame<HostFrame>(String(message.data))
  if (frame === null) return
  switch (frame.t) {
    case 'event': deliver(frame.channel, frame.args); return
    case 'result': {
      const p = pending.get(frame.id)
      pending.delete(frame.id)
      if (p === undefined) return
      if (frame.ok) p.resolve(frame.value)
      else p.reject(new Error(frame.message))
      return
    }
    case 'ask': {
      const id = frame.id
      const answer = askHandler === null ? Promise.resolve(undefined) : askHandler(frame.kind, frame.payload)
      answer.then((value) => post({ t: 'answer', id, value }), () => post({ t: 'answer', id, value: undefined }))
      return
    }
    case 'menu': menuHandler?.(frame.items); return
    case 'replaced': goneWith('replaced'); return
  }
})

interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: Listener): IpcRendererLike
  once(channel: string, listener: Listener): IpcRendererLike
  removeListener(channel: string, listener: Listener): IpcRendererLike
  off(channel: string, listener: Listener): IpcRendererLike
  removeAllListeners(channel: string): IpcRendererLike
}

export const ipcRenderer: IpcRendererLike = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (lost !== null) return Promise.reject(remoteError(channel, 'the host connection closed'))
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, channel })
      post({ t: 'invoke', id, channel, args })
    })
  },
  send(channel: string, ...args: unknown[]): void {
    if (lost === null) post({ t: 'send', channel, args })
  },
  on(channel: string, listener: Listener): IpcRendererLike {
    const set = listeners.get(channel) ?? new Set<Listener>()
    set.add(listener)
    listeners.set(channel, set)
    return ipcRenderer
  },
  once(channel: string, listener: Listener): IpcRendererLike {
    const once: Listener = (event, ...args) => { ipcRenderer.removeListener(channel, once); listener(event, ...args) }
    return ipcRenderer.on(channel, once)
  },
  removeListener(channel: string, listener: Listener): IpcRendererLike {
    listeners.get(channel)?.delete(listener)
    return ipcRenderer
  },
  off(channel: string, listener: Listener): IpcRendererLike { return ipcRenderer.removeListener(channel, listener) },
  removeAllListeners(channel: string): IpcRendererLike {
    listeners.delete(channel)
    return ipcRenderer
  }
}

export const hostLink: HostLink = {
  ready: () => post({ t: 'ready' }),
  emitLocal: (channel, ...args) => deliver(channel, args),
  onAsk(handler) { askHandler = handler },
  onMenu(handler) { menuHandler = handler },
  menu: (id) => post({ t: 'menu', id }),
  onLost(handler) {
    lostHandler = handler
    if (lost !== null) handler(lost)
  }
}
