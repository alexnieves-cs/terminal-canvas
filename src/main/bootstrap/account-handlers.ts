import { shell } from 'electron'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAccountService, type AccountService } from '../account-session'
import { readAccountConfig } from '../account-auth'
import { IPC_EVENTS } from '../../shared/ipc-contract'
import { confirm } from './dialogs'
import { sendToRenderer } from './window'
import type { Stores } from './stores'
import type { MainState } from './context'

/**
 * The Terminal Canvas account over the REAL collaborators: the credential
 * store, Node's fetch, the system browser and the Cancel-default dialog.
 *
 * The config is read at USE from both envs (context.ts's rule): process.env
 * first, for `npm run dev` from a shell that exported it; then the login
 * shell's, for a packaged app launched from Finder with launchd's bare env.
 */
export function createAccountWiring(state: MainState, stores: Stores, userData: string): AccountService {
  const service = createAccountService({
    store: stores.credentialStore,
    config: () => readAccountConfig(process.env, state.loginEnv),
    fetch: (url, init) => fetch(url, init),
    // https only: the authorize URL is built from a checked config, and this
    // guard keeps a later edit from handing the opener anything else.
    openExternal: async (url) => {
      const u = new URL(url)
      const local = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
      if (u.protocol !== 'https:' && !local) throw new Error('refused a non-https sign-in URL')
      await shell.openExternal(url)
    },
    // Parented when there is a window (a sheet), free-floating when there is
    // not — a `tc login` with every window closed must still be answerable.
    confirm: (ask) => confirm(state.window, ask),
    activePointer: activePointerFile(userData)
  })
  /**
   * M336. Whoever changes WHO is signed in — the account menu, `tc login` in a
   * terminal — the rest of main follows here, once: presence reconnects as the
   * new person (its identity is read at start, not per beat), the shared canvas
   * re-pushes its view (a role belongs to a person), and the renderer is told.
   * Wrapping the service rather than each door is what keeps the two doors
   * from disagreeing about it.
   */
  const changed = (): void => {
    state.presence?.stop()
    void state.presence?.start().catch((error: unknown) => console.warn('[presence] could not restart', error))
    state.canvasSync?.activated()
    sendToRenderer(state, stores, IPC_EVENTS.AUTH_CHANGED, service.sessions())
  }
  return {
    ...service,
    async login(opts) {
      const r = await service.login(opts)
      if (r.kind === 'signed-in') changed()
      return r
    },
    async logout(githubId) {
      const r = await service.logout(githubId)
      if (r.kind === 'signed-out' && r.githubIds.length > 0) changed()
      return r
    },
    use(githubId) {
      const before = service.sessions()[0]?.githubId
      const r = service.use(githubId)
      if (r.kind === 'ok' && before !== githubId) changed()
      return r
    }
  }
}

/** The active account's GitHub id, in its own small file: not a secret, and it must outlive a session refresh. */
function activePointerFile(userData: string): { read(): string | undefined; write(githubId: string | undefined): void } {
  const file = join(userData, 'account-active')
  return {
    read() {
      try {
        const v = readFileSync(file, 'utf8').trim()
        // A GitHub id is digits; anything else is not a choice this app wrote.
        return /^\d{1,20}$/.test(v) ? v : undefined
      } catch { return undefined }
    },
    write(githubId) {
      try {
        if (githubId === undefined) rmSync(file, { force: true })
        else writeFileSync(file, githubId, 'utf8')
      } catch { /* read-only userData: the newest sign-in stays active */ }
    }
  }
}
