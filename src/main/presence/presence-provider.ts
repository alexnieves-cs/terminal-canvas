/**
 * The ONE importer of @hocuspocus/provider — presence-hub.ts's production
 * `connect`. Kept apart so the hub stays drivable under plain node with no
 * socket, and so the library has a single door, the renderer's rule for its
 * own libraries (src/renderer/CLAUDE.md) applied to main.
 *
 * One socket per document: a handful of workspaces is a handful of sockets,
 * and it keeps each room's reconnect and auth independent. Electron's Node
 * has a global WebSocket, which the provider picks up on its own.
 */
import { HocuspocusProvider } from '@hocuspocus/provider'
import type { PresenceHubDeps } from './presence-hub'

export const hocuspocusConnect: PresenceHubDeps['connect'] = ({ url, name, document, awareness, token, onStatus }) => {
  const provider = new HocuspocusProvider({
    url,
    name,
    document,
    awareness,
    // Called on every (re)connect, so a refreshed Supabase session is what the
    // server sees after an hour-long disconnect, never the expired one.
    token,
    onStatus: ({ status }) => onStatus(status as 'connecting' | 'connected' | 'disconnected'),
    // A rejected token is a disconnected room, said once; the provider keeps
    // retrying, and a later sign-in is picked up through `token`.
    onAuthenticationFailed: ({ reason }) => { console.warn(`[presence] ${name}: authentication failed — ${reason}`); onStatus('disconnected') }
  })
  return { destroy: () => provider.destroy() }
}
