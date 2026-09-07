import type { PanelId, PtyCreateResult, PtyDataChunk, PtyExitInfo } from '@shared/types'
import type { AgentKind } from '@shared/cost'
import type { Tier } from '@renderer/canvas/lod'
import type { PanelSession, PanelSpecTemplate, SessionFactory, TerminalOptions } from './panel-session'

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
      /** Which integrated agent CLI this launches. */
      agent?: AgentKind
      /** M147. Overrides over the login environment; absent stays absent. */
      env?: Record<string, string>
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
  /**
   * Route keyboard input from a selected, live terminal to every id in this
   * set. An empty set restores the ordinary one-focused-panel route.
   *
   * This is deliberately ids, not a second PTY API: the registry remains the
   * only renderer owner of pty:write, and dormant or exited sessions are
   * skipped rather than created or revived.
   */
  setInputTargets(ids: readonly PanelId[]): void
  lastFocusedAt(): Record<PanelId, number>
  /**
   * Clear dormancy and, if the slot is already attached, spawn. Called when
   * the user clicks a restored panel — via onSelectPanel, not onFocusPanel: a
   * carded panel has no .panel__slot and therefore no focus handler at all.
   */
  wake(id: PanelId): void
  version(): number
  /**
   * M44. Fan a partial of xterm options across every session's terminal —
   * live and detached — and store it so sessions created later inherit it.
   * The shared mechanism the accessibility screen-reader toggle, M45's theme
   * and M49's font size all use rather than each writing a one-off loop.
   */
  applyTerminalOptions(options: TerminalOptions): void
  /**
   * M49. The global font size and the per-panel overrides, resolved HERE
   * into each session's effective size: a session without an override takes
   * the global, an override survives a global change, a session created
   * later inherits its effective size at creation (so its first fit is the
   * right one — no fit at 13 and then a refit), and each LIVE session is
   * refitted once per call, which sends at most one pty:resize. A font size
   * is a resize wearing a hat: bigger cells mean fewer columns, a SIGWINCH,
   * a full-screen TUI repainting — so this is a commit, never a live stream.
   * ZOOM IS NOT FONT SIZE: the camera's scale is invisible to the fit, and
   * nothing here reaches for it.
   */
  setFontSizes(sizes: { global: number; overrides: Record<string, number> }): void
  /**
   * Advance version() and notify, and do nothing else.
   *
   * Exists for exactly one caller: restart, which calls ensure() from an EVENT
   * HANDLER rather than during render. ensure() deliberately does not bump —
   * see its own comment: it normally runs while Canvas renders, and notifying a
   * useSyncExternalStore subscriber mid-render makes React warn about updating
   * one component while rendering another. Outside render that protection
   * becomes a gap: nothing re-renders, so the new handle's host is never
   * mounted and the restarted panel shows nothing at all, with no error.
   *
   * focus(id) would also bump, and is the tempting one-liner — but it sets
   * lastFocusedAt and calls handle.focus(), moving the keyboard. A shell
   * control that moves focus violates the rule shell-control.ts exists to
   * enforce, and it fails silently: the panel looks right and the user's next
   * keystroke goes somewhere they did not choose.
   */
  bumpVersion(): void
  /**
   * Stamp lastFocusedAt with now(), advance version() and notify — and do
   * nothing else. In particular NOT handle.focus().
   *
   * Three near-identical members now sit here, and the difference between them
   * is the whole point: bumpVersion says "re-render", touch says "this session
   * is recently WANTED", focus says "the keyboard is here now". Restart needs
   * the first two and must not have the third — it is driven from shell
   * controls (the inspector's button, the rail's row), and a shell control that
   * moves DOM focus violates the rule shell-control.ts exists to enforce, and
   * fails silently: the panel looks right and the user's next keystroke goes
   * somewhere they did not choose.
   *
   * Why the stamp matters at all: assignTiers fills its LIVE_BUDGET slots in
   * lastFocusedAt order, and ensure() mints a session at 0 — so a restarted
   * panel joins at the BACK of the eviction queue and is the first candidate
   * denied a slot on a canvas already at budget. attachSlot is the only caller
   * of spawn(), so being denied means the restart killed and never respawned:
   * the panel becomes a card and the Restart control immediately greys out
   * reading "has not started yet", denying the thing the user just did.
   * verify:registry 25.
   */
  touch(id: PanelId): void
  subscribe(listener: () => void): () => void
  /**
   * Observe an actual process exit after the registry has recorded it. #24
   * uses this for auditable automations rather than a second raw bridge
   * subscription, so the action and every rendered status agree on the same
   * event ordering.
   */
  onExit(listener: (info: PtyExitInfo) => void): () => void
  /**
   * Close one panel: free its terminal and kill its process. One of exactly
   * TWO places pty.kill is called in the renderer, the other being disposeAll.
   * Tiering must never reach either.
   *
   * Returns the kill's promise rather than discarding it, and that is M8c's
   * one change here. Restart is dispose-then-ensure at the same id, and under
   * tmux the destroy MUST complete before the respawn or `new-session -A`
   * reattaches to the very session the restart meant to replace. That ordering
   * happens to hold today anyway — ipcMain.handle(PTY_KILL) is synchronous
   * down to an execFileSync — but every link in that chain is incidental to
   * this file, and the failure it guards is completely silent: the restart
   * appears to do nothing at all. Returning the promise makes the ordering a
   * property of the caller that needs it. The four call sites that do not
   * respawn ignore the result, correctly.
   */
  dispose(id: PanelId): Promise<void>
  /**
   * Kill EVERY panel's process. Since M4c this has no production call site:
   * renderer teardown used to call it from a `beforeunload` listener, and
   * that listener is exactly what destroyed every tmux session on Cmd+R (see
   * Canvas.tsx, where the comment now stands in its place). Teardown is
   * main's job — window-lifecycle.ts detaches, before-quit kills. Kept
   * because "kill everything this renderer owns" is still the honest meaning
   * of the second pty.kill call site, and verify:registry 12 still pins it;
   * do not wire it back onto unload.
   */
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
  const exitListeners = new Set<(info: PtyExitInfo) => void>()
  let inputTargets = new Set<PanelId>()
  // M44. The current xterm options, accumulated across applyTerminalOptions
  // calls and applied to every session created afterwards — so the fan-out is
  // a genuine "all terminals, present and future", the shape M45's theme and
  // M49's font size both reuse.
  let terminalOptions: TerminalOptions = {}
  // M49. The resolved font sizes, so ensure() can seed a later session.
  let fontGlobal: number | null = null
  let fontOverrides: Record<string, number> = {}
  const effectiveFont = (id: string): number | null => fontOverrides[id] ?? fontGlobal
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
    for (const listener of exitListeners) listener(info)
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
      // Broadcasting is armed only for a member of its target set. Clicking a
      // different terminal while the mode is visible must return that panel to
      // ordinary, one-recipient typing instead of silently adding a sender.
      const targets = inputTargets.has(session.id) ? inputTargets : new Set([session.id])
      for (const id of targets) {
        const target = sessions.get(id)
        // A broadcast is never a wake/restart mechanism. `spawned` alone is
        // not enough after an exit, and status is the registry's recorded
        // truth rather than a second renderer-side guess.
        if (!target?.spawned || (target.status.kind !== 'starting' && target.status.kind !== 'running')) continue
        void bridge.pty.write({ panelId: id, data })
      }
    })

    // THE FIFTH COPY SITE of the absent-stays-absent rule, built field by
    // field like the four before it (layout-schema, templateOf,
    // presetFromCapture, Canvas's onSpawn) — and the one that had never been
    // pinned. A field the spec carries that this call does not name never
    // reaches main, with no error and a chrome that keeps rendering the spec
    // as though it had: `agentOptions` was missing here from M23 until M37,
    // so a "plan mode" panel wore its chip and spawned in the CLI's default
    // mode. verify:registry worktree.1 and copy-site.1 read this request.
    bridge.pty
      .create({
        panelId: session.id,
        cwd: session.spec.cwd,
        command: session.spec.command,
        args: session.spec.args,
        agent: session.spec.agent,
        ...(session.spec.agentOptions === undefined ? {} : { agentOptions: session.spec.agentOptions }),
        ...(session.spec.worktree === undefined ? {} : { worktree: session.spec.worktree }),
        // M147/M149. The seventh copy site, and the one this comment's own
        // warning describes: `env` was carried by the spec from the sheet
        // through onSpawn and dropped HERE, so the process never saw it
        // (core env.spawn.1; verify:registry env.1 reads this request).
        ...(session.spec.env === undefined ? {} : { env: { ...session.spec.env } }),
        cols,
        rows
      })
      .then((result) => {
        session.status = {
          kind: 'running',
          pid: result.pid,
          command: result.command,
          cwd: result.cwd,
          reattached: result.reattached,
          // M37. Absent stays absent — a spread of `undefined` would read as
          // an outcome to the inspector's three-state row.
          ...(result.worktree === undefined ? {} : { worktree: result.worktree })
        }
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
      const handle = factory.create(id)
      // A session born after applyTerminalOptions inherits the current options.
      if (Object.keys(terminalOptions).length > 0) handle.configure(terminalOptions)
      // M49. And its effective font size, so its first fit is the right one.
      const seededFont = effectiveFont(id)
      if (seededFont !== null) handle.configure({ fontSize: seededFont })
      const session: PanelSession = {
        id,
        spec,
        handle,
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
    setInputTargets(ids) {
      inputTargets = new Set(ids)
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

    applyTerminalOptions(options) {
      Object.assign(terminalOptions, options)
      for (const session of sessions.values()) session.handle.configure(options)
    },

    setFontSizes({ global, overrides }) {
      fontGlobal = global
      fontOverrides = { ...overrides }
      for (const session of sessions.values()) {
        const size = effectiveFont(session.id)
        if (size === null) continue
        const current = session.handle.options().fontSize
        if (current === size) continue
        session.handle.configure({ fontSize: size })
        // One refit per live session per commit; a detached one has no host
        // to measure and settles on its next attach. refit() itself sends
        // at most one pty:resize, and none when the grid did not change.
        if (session.tier === 'live') this.refit(session.id)
      }
    },

    version: () => version,

    bumpVersion: () => bump(),

    touch(id) {
      const session = sessions.get(id)
      if (!session) return
      // Deliberately no handle.focus() — see the interface comment. This is
      // focus()'s first two lines and none of its third.
      session.lastFocusedAt = now()
      bump()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    onExit(listener) {
      exitListeners.add(listener)
      return () => exitListeners.delete(listener)
    },

    async dispose(id) {
      const session = sessions.get(id)
      // Local cleanup only when there is a local session to clean up.
      if (session) {
        session.handle.dispose()
        sessions.delete(id)
      }
      // The kill, by contrast, is sent UNCONDITIONALLY — even when `session`
      // is undefined — and that is deliberate, not a fallthrough. Two
      // reasons stack here, one from M4c and one from M7.
      //
      // M4c: unconditional since then, and the `spawned` guard that used to
      // stand here was a real leak rather than an optimisation. Under
      // node-pty a never-spawned panel genuinely had no process. Under tmux
      // it may own a SURVIVING session — reattachable after a reload but
      // never promoted to live, because it was off-screen or held back by
      // LIVE_BUDGET — and skipping the kill leaves that agent running with
      // no panel able to reach it for the rest of the run.
      //
      // M7: `session` can be undefined for the very same class of reason,
      // one hop further out. A workspace switch never disposes a HIDDEN
      // workspace's sessions on the way out ("demote, not dispose" — see
      // switchWorkspace's own doc comment in Canvas.tsx), so a panel spawned
      // in a workspace this renderer no longer holds a PanelSession for —
      // because it was switched away from and then this renderer reloaded
      // (Cmd+R restores only the ACTIVE workspace's panels), or was never
      // rendered here at all in this run — can still own a surviving tmux
      // session with nothing local to represent it. Returning early here
      // without sending pty.kill would leave that session running forever
      // the moment its WORKSPACE RECORD is deleted: no UI can ever reach it
      // again, and it burns tokens until quit kill-servers the whole socket.
      //
      // Both cases mirror main's OWN PtyManager.kill, which deliberately
      // reaches backend.destroy(panelId) even for an id it holds no local
      // session for either (verify:pty-manager 14c) — this is the
      // renderer-side half of that same rule, not two separate ones. The
      // cost when there really is nothing on either side is one wasted IPC
      // round trip. Still exactly ONE call to pty.kill here, and dispose()
      // is still exactly ONE of the two `pty.kill` call sites in this file
      // (disposeAll is the other); nothing here adds a third caller
      // anywhere else, in particular not in Canvas.tsx.
      //
      // The promise is returned, not discarded, so restart can await it. bump()
      // still runs BEFORE the await: the local teardown above is already
      // done, and subscribers need to hear about it on the same tick they
      // always have — moving the bump behind the await would delay every
      // close by one IPC round trip and make verify:panels' close checks
      // flaky for a reason nothing points at.
      const killed = bridge.pty.kill(id)
      if (session) bump()
      await killed
    },

    disposeAll() {
      // One of two places a PTY is killed; dispose(id) is the other. Tiering
      // is neither, and must never become either. Unguarded on `spawned` for
      // the same reason dispose() is — see there.
      // No production caller since M4c: a renderer teardown must DETACH tmux
      // clients, not kill sessions. See the interface declaration above.
      for (const session of sessions.values()) {
        session.handle.dispose()
        void bridge.pty.kill(session.id)
      }
      sessions.clear()
      bump()
    }
  }
}
