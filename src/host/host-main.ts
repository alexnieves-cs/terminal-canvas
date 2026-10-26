import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { app } from './electron-shim'
import { appVersion, dataDir, hub } from './runtime'
import { isLoopback, startHost } from './server'

/**
 * Lane Q (M590). The hosted version's entry: `node out/host/host.cjs`.
 *
 * The gate starts FIRST and main second, on purpose: a host that would
 * refuse to listen (no token off loopback) must not have started tmux,
 * written a layout or opened a socket to the collab server before it says
 * so. Main is the app's own composition root, loaded unedited; every
 * `electron` import inside it is `electron-shim.ts` (scripts/build-host.cjs).
 */

const token = process.env['TC_HOST_TOKEN']?.trim() ?? ''
const port = Number(process.env['PORT'] ?? '8080')
// A token says "this is meant to be reached": listen everywhere. No token means this machine only.
const bind = process.env['TC_HOST_BIND']?.trim() || (token !== '' ? '0.0.0.0' : '127.0.0.1')

async function boot(): Promise<void> {
  mkdirSync(dataDir, { recursive: true })
  const host = await startHost({ hub, webRoot: join(__dirname, '..', 'host-web'), port, bind, token, appVersion })
  console.log(`[host] Terminal Canvas ${appVersion} on http://${isLoopback(bind) ? '127.0.0.1' : bind}:${host.port} (data ${dataDir}${token === '' ? ', no sign-in: loopback only' : ''})`)
  // Main's composition root, as the app runs it.
  await import('../main/index')
  const stop = (): void => {
    // Through app.quit, so main's before-quit keeps or kills the tmux sessions as it does on Cmd+Q.
    app.quit()
    void host.close()
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

boot().catch((error: unknown) => {
  console.error(`[host] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
