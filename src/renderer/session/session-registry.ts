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
      /** Absent means "the login shell"; main resolves it. See PanelSpec. */
      command?: string
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
  ensure(id: PanelId, spec: PanelSpecTemplate, options?: { dormant?: boolean }): PanelSession
  get(id: PanelId): PanelSession | undefined
  all(): PanelSession[]
  applyTiers(tiers: Record<PanelId, Tier>): void
  /** Called by the view AFTER it puts handle.host into the document. */
  attachSlot(id: PanelId): void
  /** Called by the view's cleanup, before the host leaves the document. */
  detachSlot(id: PanelId): void
  /** Re-fit after the panel's box changed, and send at most one pty:resize. */
  refit(id: PanelId): void
  focus(id: PanelId): void
  lastFocusedAt(): Record<PanelId, number>
  /**
   * Clear dormancy and, if the slot is already attached, spawn. Called when
   * the user clicks a restored panel — via onSelectPanel, not onFocusPanel: a
   * carded panel has no .panel__slot and therefore no focus handler at all.
   */
  wake(id: PanelId): void
  version(): number
  subscribe(listener: () => void): () => void
  /**
   * Close one panel: free its terminal and kill its process. One of exactly
   * TWO places pty.kill is called in the renderer, the other being disposeAll.
   * Tiering must never reach either.
   */
  dispose(id: PanelId): void
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
    session.sentGrid = { cols, rows }
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
    ensure(id, spec, options) {
      const existing = sessions.get(id)
      if (existing) return existing
      const session: PanelSession = {
        id,
        spec,
        handle: factory.create(id),
        status: { kind: 'idle' },
        tier: 'card',
        spawned: false,
        sentGrid: null,
        lastFocusedAt: 0,
        dormant: options?.dormant ?? false
      }
      sessions.set(id, session)
      // Deliberately no bump(): ensure() is called while Canvas renders, and
      // notifying a useSyncExternalStore subscriber mid-render makes React
      // warn about updating a component while rendering another. The panel
      // list living in React state is already what triggers that render.
      return session
    },

    get: (id) => sessions.get(id),
    // Allocates a fresh array every call — fine for one-off reads, but never
    // pass this directly as a useSyncExternalStore getSnapshot: a new
    // reference every render looks like a change on every render and loops
    // forever. version() is the stable scalar for that; snapshot the array
    // only when version() has actually advanced.
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
        // A dormant panel gets its terminal but not its process. Under the
        // tiering rule it should never be live at all; this second guard means
        // "no process starts by itself" does not rest on lod.ts alone.
        if (session.dormant) return
        spawn(session)
        return
      }
      // Already running: the grid MAY have changed while it was carded — but
      // usually it has not, and an unconditional resize sends a SIGWINCH that
      // makes a full-screen agent TUI repaint for nothing. The spec's
      // tier-transition table says "pty.resize only if cols/rows changed", so
      // compare against what was last sent.
      const { cols, rows } = session.handle.size()
      const sent = session.sentGrid
      if (sent && sent.cols === cols && sent.rows === rows) return
      session.sentGrid = { cols, rows }
      void bridge.pty.resize({ panelId: session.id, cols, rows })
    },

    detachSlot(id) {
      const session = sessions.get(id)
      if (!session) return
      // Frees the WebGL context. Never kills: the PTY keeps running and its
      // output keeps arriving, which is the entire reason this registry exists.
      session.handle.detach()
    },

    refit(id) {
      const session = sessions.get(id)
      // A carded panel has no attached host to measure; its grid is settled on
      // the next attachSlot, which already compares against sentGrid.
      if (!session || session.tier !== 'live') return
      session.handle.refit()
      if (!session.spawned) return
      // A process that has already exited has nothing to signal. attachSlot
      // deliberately does NOT carry this guard: its behaviour is M3-proven and
      // a pty:resize for a dead session is a main-side no-op, so the asymmetry
      // is harmless — noted here so it does not read as an oversight.
      if (session.status.kind === 'exited') return
      // At most one pty:resize, and none at all when the new box happens to
      // fit the same grid — the same SIGWINCH economy attachSlot practises.
      const { cols, rows } = session.handle.size()
      const sent = session.sentGrid
      if (sent && sent.cols === cols && sent.rows === rows) return
      session.sentGrid = { cols, rows }
      void bridge.pty.resize({ panelId: id, cols, rows })
    },

    focus(id) {
      const session = sessions.get(id)
      if (!session) return
      session.lastFocusedAt = now()
      if (session.tier === 'live') session.handle.focus()
      bump()
    },

    // Same caveat as all(): a fresh object every call, so it is not a safe
    // useSyncExternalStore getSnapshot on its own — gate a re-read on
    // version() having changed, the same as the panel list.
    lastFocusedAt() {
      const stamps: Record<PanelId, number> = {}
      for (const session of sessions.values()) stamps[session.id] = session.lastFocusedAt
      return stamps
    },

    wake(id) {
      const session = sessions.get(id)
      if (!session || !session.dormant) return
      session.dormant = false
      // Only spawn if the host is actually attached: spawn() reads
      // handle.size(), which needs a fitted terminal. If the panel is still
      // carded, clearing the flag is enough — tiering will promote it and
      // attachSlot will spawn on the way in.
      if (session.tier === 'live' && !session.spawned) spawn(session)
      else bump()
    },

    version: () => version,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose(id) {
      const session = sessions.get(id)
      if (!session) return
      session.handle.dispose()
      // Unconditional since M4c, and the `spawned` guard that used to stand
      // here was a real leak rather than an optimisation. Under node-pty a
      // never-spawned panel genuinely had no process. Under tmux it may own a
      // SURVIVING session — reattachable after a reload but never promoted to
      // live, because it was off-screen or held back by LIVE_BUDGET — and
      // skipping the kill leaves that agent running with no panel able to
      // reach it for the rest of the run. main's PtyManager.kill now reaches
      // backend.destroy() even for an id it has no local session for, which is
      // the other half of the same fix. The cost when there really is nothing
      // is one wasted IPC round trip.
      void bridge.pty.kill(id)
      sessions.delete(id)
      bump()
    },

    disposeAll() {
      // One of two places a PTY is killed; dispose(id) is the other. Tiering
      // is neither, and must never become either. Unguarded on `spawned` for
      // the same reason dispose() is — see there.
      for (const session of sessions.values()) {
        session.handle.dispose()
        void bridge.pty.kill(session.id)
      }
      sessions.clear()
      bump()
    }
  }
}
