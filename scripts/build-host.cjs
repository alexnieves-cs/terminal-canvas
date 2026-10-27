#!/usr/bin/env node
/**
 * Lane Q (M590–M591). `npm run build:host`: the hosted version, in two halves.
 *
 *   out/host/host.cjs  — main's composition root under plain Node, every
 *                        `electron` import aliased to src/host/electron-shim.ts.
 *   out/host-web/      — the renderer as a page, its bridge the app's own
 *                        preload over a WebSocket (vite.host.config.ts).
 *
 * Only node-pty stays outside the bundle: it is a native binary, and the
 * image builds it for the Node it runs on (Dockerfile). Everything else is
 * inlined, so the image needs one package beside the bundle, not the
 * app's whole node_modules. `@sentry/electron/main` is aliased away too:
 * it requires the REAL electron at load, and telemetry is off on a host.
 *
 * `--server-only` skips the page (verify:host builds just what it drives).
 */
const { build } = require('esbuild')
const { execFileSync } = require('node:child_process')
const { resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const { version } = require(resolve(ROOT, 'package.json'))

async function buildServer() {
  await build({
    entryPoints: [resolve(ROOT, 'src/host/host-main.ts')],
    outfile: resolve(ROOT, 'out/host/host.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: true,
    logLevel: 'warning',
    external: ['node-pty'],
    alias: {
      electron: resolve(ROOT, 'src/host/electron-shim.ts'),
      '@sentry/electron/main': resolve(ROOT, 'src/host/sentry-off.ts'),
      '@shared': resolve(ROOT, 'src/shared')
    },
    define: { __TC_VERSION__: JSON.stringify(version) }
  })
}

async function main() {
  await buildServer()
  if (!process.argv.includes('--server-only')) {
    execFileSync(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '-c', 'vite.host.config.ts'], { cwd: ROOT, stdio: 'inherit' })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
