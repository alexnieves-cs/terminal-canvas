import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHub } from './hub'

/**
 * Lane Q (M590). The host's process-wide facts, read by the Electron
 * stand-in (`electron-shim.ts`) and the server. One module so the shim, which
 * main imports as `electron`, and the server, which the entry starts, share
 * the SAME hub instance: two copies would be two halves that never meet.
 */

export const hub = createHub()

/** Where the app's userData lives on the host. A volume in the container (`/data`). */
export const dataDir = process.env['TC_HOST_DATA']?.trim() || join(homedir(), '.terminal-canvas-host')

/** The app's version, stamped by the host build (scripts/build-host.cjs). */
declare const __TC_VERSION__: string
export const appVersion = typeof __TC_VERSION__ === 'string' ? __TC_VERSION__ : '0.0.0'

/** The checkout the host was built from: `app.getAppPath()`, which main reads package.json beside. */
export const appRoot = process.env['TC_HOST_APP_ROOT']?.trim() || process.cwd()

/**
 * The two secrets, read ONCE here and then removed from `process.env` by
 * host-main.ts before main loads. Main spreads `process.env` into every PTY
 * (shell-env.ts), so left there they would be one `env` away for any shell
 * or any agent in one, prompt-injected or not (review finding 3).
 */
export const hostToken = process.env['TC_HOST_TOKEN']?.trim() ?? ''
export const hostSecret = process.env['TC_HOST_SECRET']?.trim() ?? ''

export function scrubSecretsFromEnv(): void {
  delete process.env['TC_HOST_TOKEN']
  delete process.env['TC_HOST_SECRET']
}

