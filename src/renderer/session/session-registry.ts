import type { PanelId, PtyCreateResult, PtyDataChunk, PtyExitInfo } from '@shared/types'
import type { Tier } from '@renderer/canvas/lod'
import type { PanelSession, PanelSpecTemplate, SessionFactory } from './panel-session'

/**
 * Owns every panel's session for the lifetime of the renderer.
 *
 * Deliberately free of React and of window/document: the bridge and the
 * terminal factory are injected, which is what lets verify:registry drive the
 * whole lifecycle under plain node with fakes.
 */

export interface Bridge {
  pty: {
    create(spec: {
      panelId: PanelId
      cwd: string
      command: string
      args: string[]
      cols: number
      rows: number
    }): Promise<PtyCreateResult>
    write(req: { panelId: PanelId; data: string }): Promise<void>
    resize(req: { panelId: PanelId; cols: number; rows: number }): Promise<void>
    kill(panelId: PanelId): Promise<void>
    onData(listener: (chunk: PtyDataChunk) => void): () => void
    onExit(listener: (info: PtyExitInfo) => void): () => void
  }
}

export interface Registry {
  ensure(id: PanelId, spec: PanelSpecTemplate): PanelSession
  get(id: PanelId): PanelSession | undefined
  all(): PanelSession[]
  applyTiers(tiers: Record<PanelId, Tier>): void
  /** Called by the view AFTER it puts handle.host into the document. */
  attachSlot(id: PanelId): void
  /** Called by the view's cleanup, before the host leaves the document. */
  detachSlot(id: PanelId): void
  focus(id: PanelId): void
  lastFocusedAt(): Record<PanelId, number>
  version(): number
  subscribe(listener: () => void): () => void
  disposeAll(): void
}

export interface RegistryDeps {
  bridge: Bridge
  factory: SessionFactory
  now?: () => number
}

export function createRegistry(deps: RegistryDeps): Registry {
  const { bridge, factory } = deps
  const now = deps.now ?? (() => Date.now())

  const sessions = new Map<PanelId, PanelSession>()
  const listeners = new Set<() => void>()
  let version = 0

  /**
   * One subscription for the whole canvas. One per panel would make every
   * chunk cross N listeners and be discarded N-1 times — twenty times the work
   * to deliver the same bytes with twenty panels open.
   */
  bridge.pty.onData((chunk: PtyDataChunk) => {
    // Written straight through to xterm, never into React state: 16ms-batched
    // output through setState would re-render the canvas at 60Hz for content
    // React does not draw.
    sessions.get(chunk.panelId)?.handle.write(chunk.data)
  })

  bridge.pty.onExit((info: PtyExitInfo) => {
    const session = sessions.get(info.panelId)
    if (!session) return
    session.status = { kind: 'exited', code: info.exitCode }
    session.handle.write(
      `\r\n\x1b[38;5;244m[process exited with code ${info.exitCode}]\x1b[0m\r\n`
    )
    bump()
  })

  function bump(): void {
    version += 1
    for (const listener of listeners) listener()
  }

  function spawn(session: PanelSession): void {
    // Attach first: cols/rows must come from a fitted terminal so the shell's
    // first TIOCGWINSZ is correct. Spawning at 80x24 and resizing after makes
    // agent TUIs draw their frame twice.
    const { cols, rows } = session.handle.size()
    session.spawned = true
    session.status = { kind: 'starting' }
    bump()

    session.handle.onInput((data) => {
      void bridge.pty.write({ panelId: session.id, data })
    })

    bridge.pty
      .create({
        panelId: session.id,
        cwd: session.spec.cwd,
        command: session.spec.command,
        args: session.spec.args,
        cols,
        rows
      })
      .then((result) => {
        session.status = { kind: 'running', pid: result.pid }
        bump()
      })
      .catch((error: unknown) => {
        session.status = { kind: 'error', message: String(error) }
        bump()
      })
  }

  /**
   * Tier changes only flip a flag and notify. Attachment cannot happen here:
   * attach() calls term.open(), which measures a laid-out node, and the host
   * is not in the document until React has rendered a slot for it — which it
   * only does once the tier says 'live'. So the view calls attachSlot() back
   * once the host is actually mounted.
   */
  function setTier(session: PanelSession, tier: Tier): void {
    session.tier = tier
    bump()
  }

  return {
    ensure(id, spec) {
      const existing = sessions.get(id)
      if (existing) return existing
      const session: PanelSession = {
        id,
        spec,
        handle: factory.create(id),
        status: { kind: 'idle' },
        tier: 'card',
        spawned: false,
        lastFocusedAt: 0
      }
      sessions.set(id, session)
      // Deliberately no bump(): ensure() is called while Canvas renders, and
      // notifying a useSyncExternalStore subscriber mid-render makes React
      // warn about updating a component while rendering another. The panel
      // list living in React state is already what triggers that render.
      return session
    },

    get: (id) => sessions.get(id),
    all: () => [...sessions.values()],

    applyTiers(tiers) {
      for (const session of sessions.values()) {
        const next = tiers[session.id] ?? 'card'
        if (next !== session.tier) setTier(session, next)
      }
    },

    attachSlot(id) {
      const session = sessions.get(id)
      if (!session) return
      // The host is in the document now, so open() can measure it.
      session.handle.attach()
      if (!session.spawned) {
        spawn(session)
        return
      }
      // Already running: the grid may have changed while it was carded.
      const { cols, rows } = session.handle.size()
      void bridge.pty.resize({ panelId: session.id, cols, rows })
    },

    detachSlot(id) {
      const session = sessions.get(id)
      if (!session) return
      // Frees the WebGL context. Never kills: the PTY keeps running and its
      // output keeps arriving, which is the entire reason this registry exists.
      session.handle.detach()
    },

    focus(id) {
      const session = sessions.get(id)
      if (!session) return
      session.lastFocusedAt = now()
      if (session.tier === 'live') session.handle.focus()
      bump()
    },

    lastFocusedAt() {
      const stamps: Record<PanelId, number> = {}
      for (const session of sessions.values()) stamps[session.id] = session.lastFocusedAt
      return stamps
    },

    version: () => version,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    disposeAll() {
      // The only place a PTY is killed.
      for (const session of sessions.values()) {
        session.handle.dispose()
        if (session.spawned) void bridge.pty.kill(session.id)
      }
      sessions.clear()
      bump()
    }
  }
}
