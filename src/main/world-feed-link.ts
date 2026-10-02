import { basename } from 'node:path'
import { IPC_EVENTS } from '../shared/ipc-contract'
import type { AgentSessionEvent, AgentSessionStatus } from '../shared/agent-session'
import type { AgentKind } from '../shared/cost'
import type { AgentState } from '../shared/types'
import type { AgentEvent, WorldConnection } from '../shared/world-events'
import { createWorldFeed, type WorldFeed } from '../shared/world-feed'

/**
 * The REAL world feed, linked to the window: every event the agent runtime already fans out,
 * and every state a terminal agent already reports, is also handed to the pure
 * translator in shared/world-feed.ts, and what it says goes to the renderer on
 * WORLD_EVENTS — the channel the simulator uses, so the renderer's store cannot
 * tell them apart.
 *
 * PURELY ADDITIVE. `session()` and `terminal()` are called from the existing
 * emit points AFTER what they already did, and they cannot throw back into
 * them: a failure here is caught, counted and turned into a `lost` connection
 * the world view shows with a retry. An agent never waits on, or learns of,
 * this file — which is why the hooks sit beside the sends and not in front.
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **The window is read at the point of USE** (`host.ready()`, main's
 *     rule 1). A feed built before the window exists and holding the first one
 *     would send into a closed window after a reopen, and say nothing.
 * (2) **A send to a page that is still loading is dropped, with no error**, so
 *     `ready()` — not `live()` — is the target, and a `did-finish-load`
 *     `resend()` re-announces every agent's status. Without it a reload shows an
 *     empty room until each agent happens to change state, which for a long
 *     tool call is minutes.
 * (3) **`retry()` rebuilds the feed, it does not just clear the flag, and the
 *     new feed's seqs start ABOVE the old one's.** The translator's trackers are
 *     what a throw may have left half-updated; a flag cleared over them would
 *     report `live` on a feed that is still wrong. But the renderer's store
 *     drops any event at or below the last seq it holds for an agent, so a
 *     rebuilt feed counting from 0 would be heard by nobody — `live`, and the
 *     room frozen. Each rebuild therefore starts its counters at an epoch no
 *     earlier feed can have reached.
 */
/**
 * What the link needs from main, as functions read AT USE — never captured
 * values (main's rule 1: the window is replaced on a reopen). `bootstrap/
 * world-feed-wiring.ts` builds one from `MainState`; the harness builds one
 * from fakes, which is why this file imports nothing from `bootstrap/`.
 */
export interface WorldFeedHost {
  /** The page, once it has finished loading — a send before then is dropped, silently. Null otherwise. */
  ready(): WorldSender | null
  /** The page whether or not it has loaded (a connection notice and a reload listener need only that it exists). */
  live(): WorldSender | null
  /** A chat's working directory, for its name. */
  cwdOf(id: string): string | undefined
  /** Every chat session now, for a retry to say again. */
  sessions(): Array<{ id: string; status: AgentSessionStatus }>
}

export interface WorldSender {
  send(channel: string, payload: unknown): void
  on(event: 'did-finish-load', listener: () => void): unknown
}

export interface WorldFeedLink {
  session(event: AgentSessionEvent): void
  terminal(update: { panelId: string; state: AgentState }, agent: AgentKind | undefined): void
  status(): WorldConnection
  retry(): WorldConnection
}

const TERMINAL_NAMES: Readonly<Record<AgentKind, string>> = { 'claude-code': 'Claude', codex: 'Codex', copilot: 'Copilot' }

/**
 * `resendTerminals` asks the PTY manager to say every session's agent state
 * again (it already can, for the dock badge — M43), which comes back through
 * `terminal()`; the manager is not on `MainState`, so it is passed in.
 */
export function createWorldFeedLink(host: WorldFeedHost, resendTerminals: () => void): WorldFeedLink {
  let connection: WorldConnection = { state: 'live' }
  let epoch = 0

  const setConnection = (next: WorldConnection): void => {
    if (connection.state === next.state && (next.state === 'live' || (connection.state === 'lost' && connection.reason === next.reason))) return
    connection = next
    host.live()?.send(IPC_EVENTS.WORLD_CONNECTION, next)
  }

  const build = (): WorldFeed => createWorldFeed({
    emit: (events: AgentEvent[]) => {
      const wc = host.ready()
      if (wc) wc.send(IPC_EVENTS.WORLD_EVENTS, events)
    },
    now: Date.now,
    seqStart: epoch,
    cwdOf: (id) => host.cwdOf(id),
    // Read at use: an agent's folder is the name a person gave it by opening it there.
    label: (id, hint) => {
      if (hint !== undefined) return TERMINAL_NAMES[hint as AgentKind] ?? hint
      const cwd = host.cwdOf(id)
      const name = cwd === undefined ? '' : basename(cwd.replace(/\/+$/, ''))
      return name !== '' ? name : id
    }
  })

  let feed = build()
  let failures = 0

  const guard = (run: () => void): void => {
    try {
      run()
    } catch (error) {
      failures += 1
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`[world] the feed failed (${failures}): ${reason}`)
      setConnection({ state: 'lost', reason })
    }
  }

  // Once the page has loaded, and on every reload after it.
  const watching = new WeakSet<object>()
  const watch = (): void => {
    const wc = host.live()
    if (!wc || watching.has(wc)) return
    watching.add(wc)
    wc.on('did-finish-load', () => guard(() => feed.resend()))
  }

  return {
    session(event) {
      watch()
      if (connection.state === 'lost') return
      guard(() => feed.session(event))
    },
    terminal(update, agent) {
      watch()
      if (connection.state === 'lost') return
      guard(() => feed.terminal(update, agent))
    },
    status: () => connection,
    retry() {
      epoch = Math.max(Date.now(), epoch + 1_000_000)
      feed = build()
      failures = 0
      connection = { state: 'live' }
      host.live()?.send(IPC_EVENTS.WORLD_CONNECTION, connection)
      // The agents the old feed knew went with it. The runtime and the PTY
      // manager know them too: ask them, rather than inventing a status here.
      for (const snap of host.sessions()) {
        guard(() => feed.session({ id: snap.id, type: 'status', status: snap.status }))
      }
      guard(resendTerminals)
      return connection
    }
  }
}
