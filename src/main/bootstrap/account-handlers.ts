import { shell } from 'electron'
import { createAccountService, type AccountService } from '../account-session'
import { readAccountConfig } from '../account-auth'
import { confirm } from './dialogs'
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
export function createAccountWiring(state: MainState, stores: Stores): AccountService {
  return createAccountService({
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
    confirm: (ask) => confirm(state.window, ask)
  })
}
