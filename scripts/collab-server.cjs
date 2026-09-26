/* `npm run collab` — builds server/collab/main.ts with esbuild and runs it.
   A plain Node process: no Electron, nothing from src/main. The server shares
   src/shared/canvas-ops.ts and canvas-doc.ts with the app, so the role table
   it enforces is the app's, byte for byte. */
'use strict'
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const root = join(__dirname, '..')
const outfile = join(root, 'out/collab/main.cjs')
buildSync({
  entryPoints: [join(root, 'server/collab/main.ts')],
  outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node20', logLevel: 'error'
})
require(outfile)
