/* `npm run collab` — builds server/collab/main.ts with esbuild and runs it.
   A plain Node process: no Electron, nothing from src/main. The server shares
   src/shared/canvas-ops.ts and canvas-doc.ts with the app, so the role table
   it enforces is the app's, byte for byte. */
'use strict'
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const root = join(__dirname, '..')
const out = (name) => join(root, 'out/collab', `${name}.cjs`)
// M347. Three entry points share one build: the server, the backup CLI its
// daily timer runs, and the health step its minute timer runs.
for (const [name, entry] of [['main', 'main.ts'], ['backup', 'backup-main.ts'], ['health', 'health-main.ts']]) {
  buildSync({
    entryPoints: [join(root, 'server/collab', entry)],
    outfile: out(name), bundle: true, platform: 'node', format: 'cjs', target: 'node20', logLevel: 'error',
    // M346. node-postgres names an OPTIONAL native binding it never needs here.
    external: ['pg-native'],
    // M346. Hocuspocus 4's bundled crossws calls createRequire(import.meta.url),
    // which a CJS bundle leaves undefined — so `npm run collab` threw at load
    // from M333 on, unseen: verify:canvas-sync keeps packages external and never
    // bundles the server. The banner gives import.meta.url a real file URL.
    banner: { js: "const __tcImportMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
    define: { 'import.meta.url': '__tcImportMetaUrl' }
  })
}
// `--build-only`: the deploy (server/collab/deploy/deploy.sh) copies the bundles to the VM.
if (!process.argv.includes('--build-only')) require(out('main'))
