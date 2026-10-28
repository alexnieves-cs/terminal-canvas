import { decodeFrame, encodeFrame, remoteError, type ClientFrame, type HostFrame, type MenuKey } from './wire'

/**
 * Lane Q (M590). The host's half of the bridge: one live page, the handlers
 * main registered through `ipcMain`, and the events main sends through a
 * window's `webContents`.
 *
 * ONE TAB AT A TIME. Main was written for one renderer: `state.window` is a
 * single window, `pty:create` for a panel that already has a session means
 * "reattach", and a reload is `did-start-navigation` then `did-finish-load`.
 * A second live tab would make two renderers race to own the same panels, so
 * a new tab takes the session over and the old one is told so (`replaced`),
 * exactly the shape of a Cmd+R in the app: the host emits the old page's
 * navigation (main's `detachAll`, which on the tmux backend leaves every
 * shell running) and then the new page's load. Teammates sharing one canvas
 * is the collab server's job (lane P), not a second tab on one host.
 */

export interface Socket {
  send(text: string): void
  close(code?: number, reason?: string): void
}

export interface IpcEventLike {
  sender: SenderLike
  senderFrame: null
  returnValue?: unknown
  reply(channel: string, ...args: unknown[]): void
}

export interface SenderLike {
  id: number
  send(channel: string, ...args: unknown[]): void
  isDestroyed(): boolean
  isLoading(): boolean
}

type Handler = (event: IpcEventLike, ...args: unknown[]) => unknown
type Listener = (event: IpcEventLike, ...args: unknown[]) => void

export interface HubHooks {
  /** The page is up and subscribed: main's `did-finish-load`. */
  onPageReady(): void
  /** The page went away (closed, reloaded, replaced): main's `did-start-navigation`. */
  onPageGone(): void
  /** A menu accelerator the page matched. */
  onMenu(id: string): void
}

/** Channels whose events a page that connects late still needs (the splash waits on them). */
const STICKY = new Set(['boot:progress'])

export interface Hub {
  handle(channel: string, handler: Handler): void
  removeHandler(channel: string): void
  on(channel: string, listener: Listener): void
  removeListener(channel: string, listener: Listener): void
  /** A send to the page, wherever it is: the main window's `webContents.send`. Dropped when no page is up, as Electron drops a send to a page still loading. */
  broadcast(channel: string, args: unknown[]): void
  /** Asks the page a question (a dialog); resolves `fallback` when no page is up to answer. */
  ask<T>(kind: string, payload: unknown, fallback: T): Promise<T>
  /** Whether a page is connected and has said ready. */
  live(): boolean
  setMenu(items: MenuKey[]): void
  attach(socket: Socket): { message(text: string): void; close(): void }
  setHooks(hooks: HubHooks): void
  /** For the suite: the channels with a handler. */
  channels(): string[]
}

export function createHub(): Hub {
  const handlers = new Map<string, Handler>()
  const listeners = new Map<string, Set<Listener>>()
  const sticky: Array<{ channel: string; args: unknown[] }> = []
  let hooks: HubHooks | null = null
  let menu: MenuKey[] = []
  let current: { socket: Socket; ready: boolean; sender: SenderLike } | null = null
  let nextSender = 1
  let nextAsk = 1
  const asks = new Map<number, (value: unknown) => void>()

  const sendFrame = (socket: Socket, frame: HostFrame): void => {
    try { socket.send(encodeFrame(frame)) } catch (error) { console.warn('[host] a send to the page failed', error) }
  }

  const drop = (reason: 'closed' | 'replaced'): void => {
    const was = current
    if (was === null) return
    current = null
    for (const [, resolve] of asks) resolve(undefined)
    asks.clear()
    if (reason === 'replaced') {
      sendFrame(was.socket, { t: 'replaced' })
      try { was.socket.close(4000, 'replaced') } catch { /* already gone */ }
    }
    if (was.ready) hooks?.onPageGone()
  }

  return {
    handle(channel, handler) {
      // Electron throws on a second handler for one channel; so does this, so a doubled registration is loud here too.
      if (handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`)
      handlers.set(channel, handler)
    },
    removeHandler(channel) { handlers.delete(channel) },
    on(channel, listener) {
      const set = listeners.get(channel) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(channel, set)
    },
    removeListener(channel, listener) { listeners.get(channel)?.delete(listener) },
    broadcast(channel, args) {
      if (STICKY.has(channel)) sticky.push({ channel, args })
      if (current === null || !current.ready) return
      sendFrame(current.socket, { t: 'event', channel, args })
    },
    ask(kind, payload, fallback) {
      if (current === null || !current.ready) return Promise.resolve(fallback)
      const id = nextAsk++
      const socket = current.socket
      return new Promise((resolve) => {
        asks.set(id, (value) => resolve((value === undefined ? fallback : value) as typeof fallback))
        sendFrame(socket, { t: 'ask', id, kind, payload })
      })
    },
    live: () => current !== null && current.ready,
    setMenu(items) {
      menu = items
      if (current !== null && current.ready) sendFrame(current.socket, { t: 'menu', items: menu })
    },
    setHooks(next) { hooks = next },
    channels: () => [...handlers.keys()].sort(),
    attach(socket) {
      if (current !== null) drop('replaced')
      const id = nextSender++
      const entry: { socket: Socket; ready: boolean; sender: SenderLike } = {
        socket,
        ready: false,
        sender: {
          id,
          // `event.sender.send`: this page only, and a no-op once it is gone (a file watch outliving its page).
          send: (channel, ...args) => { if (current === entry && entry.ready) sendFrame(socket, { t: 'event', channel, args }) },
          isDestroyed: () => current !== entry,
          isLoading: () => !entry.ready
        }
      }
      current = entry
      const eventFor = (): IpcEventLike => ({
        sender: entry.sender,
        senderFrame: null,
        reply: (channel, ...args) => entry.sender.send(channel, ...args)
      })
      return {
        message(text) {
          if (current !== entry) return
          const frame = decodeFrame<ClientFrame>(text)
          if (frame === null) return
          switch (frame.t) {
            case 'ready': {
              if (entry.ready) return
              entry.ready = true
              for (const s of sticky) sendFrame(socket, { t: 'event', channel: s.channel, args: s.args })
              sendFrame(socket, { t: 'menu', items: menu })
              hooks?.onPageReady()
              return
            }
            case 'invoke': {
              const handler = handlers.get(frame.channel)
              if (handler === undefined) {
                sendFrame(socket, { t: 'result', id: frame.id, ok: false, message: remoteError(frame.channel, `No handler registered for '${frame.channel}'`).message })
                return
              }
              Promise.resolve()
                .then(() => handler(eventFor(), ...frame.args))
                .then(
                  (value) => sendFrame(socket, { t: 'result', id: frame.id, ok: true, value }),
                  (error: unknown) => sendFrame(socket, {
                    t: 'result', id: frame.id, ok: false,
                    message: remoteError(frame.channel, error instanceof Error ? `${error.name}: ${error.message}` : String(error)).message
                  })
                )
              return
            }
            case 'send': {
              for (const listener of [...(listeners.get(frame.channel) ?? [])]) {
                try { listener(eventFor(), ...frame.args) } catch (error) { console.warn(`[host] listener for ${frame.channel} threw`, error) }
              }
              return
            }
            case 'answer': {
              const resolve = asks.get(frame.id)
              asks.delete(frame.id)
              resolve?.(frame.value)
              return
            }
            case 'menu': {
              if (entry.ready) hooks?.onMenu(frame.id)
              return
            }
          }
        },
        close() { if (current === entry) drop('closed') }
      }
    }
  }
}
