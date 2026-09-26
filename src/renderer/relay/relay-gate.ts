/**
 * The relay terminal's decisions, as pure functions over a RelayView — no
 * xterm, no DOM — so verify:relay pins them under plain node.
 *
 * Three gates, one per direction a terminal talks:
 *   input   keystrokes leave only while this person is the controller and the
 *           socket is open. The relay re-checks every frame (server/relay);
 *           this gate is what keeps a viewer's typing from even being sent,
 *           and xterm's `disableStdin` from echoing a cursor it cannot move.
 *   grid    the controller's terminal fits its box and TELLS the pty; everyone
 *           else renders at the controller's cols×rows, because a pty has one
 *           size and a TUI drawn for 120 columns is garbage reflowed into 80.
 *   actions what the control strip offers, derived from the role — a button
 *           the relay would refuse is never drawn.
 */
import type { RelayView } from '@shared/ipc-contract'
import type { RelayOpen } from './relay-terminal'

export const relayMayType = (view: RelayView | null): boolean => view !== null && view.canType

export interface RelayGrid { cols: number; rows: number; tellPty: boolean }

/** `proposed` is what fits the box (FitAddon's proposal), or null before layout. */
export function relayGrid(view: RelayView | null, proposed: { cols: number; rows: number } | null): RelayGrid | null {
  if (view === null || view.control === null) return proposed === null ? null : { ...proposed, tellPty: false }
  if (view.canType) return proposed === null ? null : { cols: Math.max(2, proposed.cols), rows: Math.max(1, proposed.rows), tellPty: true }
  return { cols: view.control.cols, rows: view.control.rows, tellPty: false }
}

export type RelayAction =
  | { kind: 'request' } | { kind: 'requested' } | { kind: 'release' } | { kind: 'revoke' }
  | { kind: 'grant'; userId: string } | { kind: 'deny'; userId: string } | { kind: 'kill' }

export function relayActions(view: RelayView | null): RelayAction[] {
  if (view === null || view.control === null || view.userId === null || view.connection !== 'open' || view.exited) return []
  const me = view.userId
  const c = view.control
  const owner = c.ownerId === me
  const controller = c.controllerId === me
  const out: RelayAction[] = []
  if (owner || controller) for (const u of c.requests) out.push({ kind: 'grant', userId: u }, { kind: 'deny', userId: u })
  if (controller && !owner) out.push({ kind: 'release' })
  if (owner && !controller) out.push({ kind: c.controllerId === null ? 'request' : 'revoke' })
  if (!owner && !controller && view.canRequest) out.push(c.requests.includes(me) ? { kind: 'requested' } : { kind: 'request' })
  if (owner) out.push({ kind: 'kill' })
  return out
}

/**
 * M344. A person's name for the strip: the presence roster's, else the first
 * eight characters of the id — which is what every name was before M344, and
 * is still what a person not in this workspace's roster reads as.
 */
export function relayNameOf(names: ReadonlyMap<string, string>, userId: string): string {
  const name = names.get(userId)
  return name !== undefined && name.trim() !== '' ? name : userId.slice(0, 8)
}

/** The one line the strip says about control. `nameOf` maps a user id to a person's name when presence knows it. */
export function relayControlLine(view: RelayView | null, nameOf: (userId: string) => string): string {
  if (view === null) return 'Not connected'
  if (view.connection === 'closed') return view.reason ?? 'Disconnected'
  if (view.connection === 'connecting') return 'Connecting…'
  if (view.exited) return 'Session ended'
  const c = view.control
  if (c === null) return 'Attaching…'
  const reconnecting = view.connection === 'reconnecting' ? ' · reconnecting…' : ''
  if (c.controllerId === null) return `Nobody is in control${reconnecting}`
  if (c.controllerId === view.userId) return `You are in control${reconnecting}`
  return `${nameOf(c.controllerId)} is in control${reconnecting}`
}

/**
 * M338. How a relay PANEL opens: a recorded session is ATTACHED — a relaunch
 * must never start a second process — and only a panel with none spawns its
 * program, bound to its share when it has one.
 */
export function relayOpenOf(panel: { relay: { program: string; sessionId?: string; shareId?: string } }): RelayOpen {
  return panel.relay.sessionId !== undefined
    ? { kind: 'attach', sessionId: panel.relay.sessionId }
    : { kind: 'spawn', program: panel.relay.program, ...(panel.relay.shareId === undefined ? {} : { shareId: panel.relay.shareId }) }
}

/** M338. Whether the header offers a fresh session: the old one ended, or the relay refused the attach by name. */
export function relayMayRestart(view: RelayView | null): boolean {
  return view !== null && (view.exited || (view.connection === 'closed' && view.reason !== null))
}
