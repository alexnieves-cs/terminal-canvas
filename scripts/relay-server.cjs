/* `npm run relay` — builds server/relay/main.ts into out/relay/main.cjs and
   runs it; `--build-only` stops after the build (deploy.sh ships the file).
   node-pty and ws stay EXTERNAL: on the VM they come from server/relay's own
   package.json, and node-pty must be compiled there for that node and arch —
   the copy in this repo's node_modules is rebuilt for Electron's ABI and would
   not load under plain node anyway. Shares src/shared/relay-protocol.ts with
   the app, so both ends parse the same protocol. */
'use strict'
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const root = join(__dirname, '..')
const outfile = join(root, 'out/relay/main.cjs')
buildSync({
  entryPoints: [join(root, 'server/relay/main.ts')],
  outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node20', logLevel: 'error',
  external: ['node-pty', 'ws', 'bufferutil', 'utf-8-validate']
})
if (!process.argv.includes('--build-only')) require(outfile)
