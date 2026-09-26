import { createRelayClient, readRelayConfig, type RelayClient, type SocketCtor } from '../relay/relay-client'
import { IPC_EVENTS } from '../../shared/ipc-contract'
import type { AccountService } from '../account-session'
import { readyContents, type MainState } from './context'

/**
 * The pty relay over the REAL collaborators: Electron's global WebSocket, the
 * signed-in account's token (the same closure presence uses — the relay
 * verifies the same Supabase JWT), and the live window.
 *
 * The config reads `state.loginEnv` AT USE (src/main/CLAUDE.md rule 1): the
 * env probe resolves after this is built. Pushes go through `readyContents`,
 * never `sendToRenderer`: a relay's output is background news and must not
 * pop a closed window back open.
 */
export function createRelayWiring(state: MainState, account: AccountService): RelayClient {
  return createRelayClient({
    config: () => readRelayConfig(process.env, state.loginEnv),
    identity: async () => {
      const id = await account.presenceIdentity()
      return id.kind === 'ok' ? { kind: 'ok', userId: id.userId, token: id.token } : id
    },
    WebSocket: globalThis.WebSocket as unknown as SocketCtor,
    emitView: (view) => { readyContents(state)?.send(IPC_EVENTS.RELAY_STATE, view) },
    emitData: (data) => { readyContents(state)?.send(IPC_EVENTS.RELAY_DATA, data) }
  })
}
