/**
 * One relay terminal: an xterm attached to a relay stream through main
 * (window.canvas.relay), with local input gated by the control state.
 *
 * Managed OUTSIDE React's lifecycle, like every other terminal here: the
 * xterm, its subscriptions and the relay attachment belong to the panel id,
 * and a React remount (a tier change, a StrictMode double-effect) re-mounts
 * the host without re-attaching or losing the screen. `dispose` is the only
 * thing that detaches from the relay.
 *
 * Bytes from main are written as they come; a `reset` push clears first,
 * because a replay onto a screen that already holds newer output paints
 * garbage (relay-protocol.ts, the ring's offsets).
 */
import { attachTerminal, createTerminal, disposeTerminal, type TerminalHandles } from '@renderer/terminal/create-terminal'
import type { RelayView } from '@shared/ipc-contract'
import { relayGrid, relayMayType } from './relay-gate'

type Bridge = Window['canvas']['relay']

export type RelayOpen = { kind: 'spawn'; program: string; shareId?: string } | { kind: 'attach'; sessionId: string }

export interface RelayTerminal {
  readonly panelId: string
  mount(host: HTMLElement): void
  unmount(): void
  view(): RelayView | null
  onView(listener: (view: RelayView | null) => void): () => void
  /** Opens the attachment once; later calls are no-ops, so a remount never spawns twice. */
  open(how: RelayOpen): Promise<{ kind: 'ok' } | { kind: 'refused'; reason: string }>
  dispose(): void
}

export function createRelayTerminal(panelId: string, bridge: Bridge = window.canvas.relay): RelayTerminal {
  const handles: TerminalHandles = createTerminal()
  const term = handles.term
  let host: HTMLElement | null = null
  let observer: ResizeObserver | null = null
  let current: RelayView | null = null
  let opened: Promise<{ kind: 'ok' } | { kind: 'refused'; reason: string }> | null = null
  const listeners = new Set<(view: RelayView | null) => void>()

  /** Apply the grid rule: fit-and-tell for the controller, the controller's size for everyone else. */
  const size = (): void => {
    if (host === null || !handles.opened) return
    const proposed = handles.fitAddon.proposeDimensions()
    const grid = relayGrid(current, proposed === undefined || !Number.isFinite(proposed.cols) ? null : { cols: proposed.cols, rows: proposed.rows })
    if (grid === null) return
    if (grid.cols !== term.cols || grid.rows !== term.rows) term.resize(grid.cols, grid.rows)
    if (grid.tellPty && current !== null && current.control !== null && (current.control.cols !== grid.cols || current.control.rows !== grid.rows)) {
      void bridge.resize({ panelId, cols: grid.cols, rows: grid.rows })
    }
  }

  const apply = (view: RelayView): void => {
    const could = relayMayType(current)
    current = view
    const can = relayMayType(view)
    // Not only a courtesy: with stdin disabled xterm neither emits onData nor
    // draws a live cursor, so a viewer's screen does not pretend to take keys.
    term.options.disableStdin = !can
    term.options.cursorBlink = can
    if (can !== could || view.control !== null) size()
    for (const l of listeners) l(view)
  }

  const offData = bridge.onData((d) => {
    if (d.panelId !== panelId) return
    if (d.reset) term.reset()
    if (d.data.length > 0) term.write(d.data)
  })
  const offState = bridge.onState((v) => { if (v.panelId === panelId) apply(v) })
  const offInput = term.onData((keys) => {
    // The gate at the source: a keystroke typed while a revoke was in flight dies here.
    if (relayMayType(current)) void bridge.input(panelId, keys)
  })
  const offBinary = term.onBinary((keys) => { if (relayMayType(current)) void bridge.input(panelId, keys) })

  // A reloaded renderer: main still holds the attachment. Ask for the view;
  // main pushes a reset and the whole ring right after answering.
  void bridge.view(panelId).then((v) => { if (v !== null) { opened ??= Promise.resolve({ kind: 'ok' }); apply(v) } }, () => {})

  return {
    panelId,
    mount(el) {
      host = el
      attachTerminal(handles, el)
      observer?.disconnect()
      observer = new ResizeObserver(() => size())
      observer.observe(el)
      size()
    },
    unmount() {
      observer?.disconnect()
      observer = null
      host = null
    },
    view: () => current,
    onView(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    open(how) {
      if (opened !== null) return opened
      const dims = { cols: Math.max(2, term.cols), rows: Math.max(1, term.rows) }
      opened = (how.kind === 'spawn'
        ? bridge.spawn({ panelId, program: how.program, ...dims, ...(how.shareId === undefined ? {} : { shareId: how.shareId }) })
        : bridge.attach({ panelId, sessionId: how.sessionId })
      ).then((r) => (r.kind === 'ok' ? { kind: 'ok' as const } : r))
      return opened
    },
    dispose() {
      offData(); offState(); offInput.dispose(); offBinary.dispose()
      observer?.disconnect()
      void bridge.detach(panelId)
      disposeTerminal(handles)
      listeners.clear()
    }
  }
}
