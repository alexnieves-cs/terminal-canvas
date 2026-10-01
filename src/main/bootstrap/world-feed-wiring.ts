import type { MainState } from './context'
import { liveContents, readyContents } from './context'
import { createWorldFeedLink, type WorldFeedLink } from '../world-feed-link'

/**
 * Builds the world feed's link to the window from `MainState` (see
 * main/world-feed-link.ts for what it does and the three rules it keeps). Every
 * read below is a closure over `state`, evaluated at use, never a captured
 * window or manager — `state.window` is replaced on a reopen and `state.agents`
 * does not exist until the env probe has run (main's rule 1).
 *
 * `resendTerminals` asks the PTY manager to say every session's agent state
 * again (it already can, for the dock badge — M43), which comes back through
 * `terminal()`; the manager is not on `MainState`, so it is passed in.
 */
export function createWorldFeedWiring(state: MainState, resendTerminals: () => void): WorldFeedLink {
  return createWorldFeedLink({
    ready: () => readyContents(state),
    live: () => liveContents(state),
    cwdOf: (id) => state.agents?.get(id)?.cwd,
    sessions: () => state.agents?.list() ?? []
  }, resendTerminals)
}
