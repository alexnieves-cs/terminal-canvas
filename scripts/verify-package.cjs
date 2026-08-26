/* Verifies the packaging configuration as a VALUE, not as a file.
   Run with: npm run verify:package

   Plain node, no esbuild entry, no electron, no build. build/builder-config.cjs
   is import-free plain CJS precisely so this suite can require it directly —
   the cheapest tier in the repo.

   Every check here guards a failure that is SILENT until late: an app that
   launches, renders its canvas, shows its first panel, and dies at the first
   pty:create because a .node binary cannot be required out of an asar. */
const { buildConfig } = require('../build/builder-config.cjs')

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const config = buildConfig()

// 1. THE ONE THAT MATTERS MOST. node-pty is a native module; a .node binary
// cannot be required out of an asar archive. Without this the app launches
// normally and dies at the first pty:create — the latest, quietest failure
// this milestone can produce.
{
  const patterns = config.asarUnpack ?? []
  ok('1 node-pty is unpacked from the asar',
    patterns.some((p) => p.includes('node-pty')), JSON.stringify(patterns))
}

// 2. ...and it must still match if npm hoists node-pty to a nested depth. A
// pattern anchored at the root ('node_modules/node-pty/**') silently stops
// matching the day a transitive dependency pulls its own copy, and the symptom
// is check 1's failure arriving months later with no code change to blame.
{
  const patterns = config.asarUnpack ?? []
  const nodePty = patterns.filter((p) => p.includes('node-pty'))
  ok('2 the unpack pattern is depth-independent',
    nodePty.length > 0 && nodePty.every((p) => p.startsWith('**/')),
    JSON.stringify(nodePty))
}

// 3. asarUnpack is meaningless with asar off, and asar off is a different
// (much slower to start, far larger) app. Assert the pairing, not just the key.
{
  ok('3 asar is on, which is what makes asarUnpack mean anything',
    config.asar === true, String(config.asar))
}

// 4. The built renderer and main are what ship. `out/` is produced by
// electron-vite build; forgetting it produces an app with no code in it.
{
  const files = config.files ?? []
  ok('4 the build output is included', files.some((f) => f.startsWith('out/')),
    JSON.stringify(files))
}

// 5. Source, the verify suites, and the docs are not the product. This is size
// and hygiene rather than correctness — but scripts/ contains suites that
// kill-server, and shipping them inside the app is not a thing to do by
// accident.
{
  const files = config.files ?? []
  const excluded = ['src', 'scripts', 'docs']
  const missing = excluded.filter((d) => !files.some((f) => f === `!${d}/**`))
  ok('5 src, scripts and docs are excluded', missing.length === 0,
    `missing=${JSON.stringify(missing)} files=${JSON.stringify(files)}`)
}

// 6. Identity. productName is NOT cosmetic: app.getPath('userData') derives
// from it, so this string is what separates the packaged app's layout.json,
// presets, prompts and tmux-exits dir from the dev build's.
{
  ok('6 the app identity is exact',
    config.appId === 'com.alexnieves.terminal-canvas' &&
      config.productName === 'Terminal Canvas',
    `${config.appId} / ${config.productName}`)
}

// 7. release/ is already gitignored. Defaulting to dist/ would work and would
// also start committing build output the day someone's ignore file differs.
{
  ok('7 output goes to release/', config.directories?.output === 'release',
    JSON.stringify(config.directories))
}

// 8. THE ABSENT-vs-NULL CHECK. Omitted, electron-builder may DISCOVER a signing
// identity in whichever keychain the build runs against, producing a
// differently-signed app on a different machine. Explicit null is what makes
// the build hermetic — so this asserts the KEY IS PRESENT, not merely that the
// value is falsy. Same distinction parsePresets draws between ABSENT and
// MALFORMED, and for the same reason: they are different facts.
{
  const mac = config.mac ?? {}
  ok('8 signing is explicitly disabled, not merely unmentioned',
    Object.prototype.hasOwnProperty.call(mac, 'identity') && mac.identity === null,
    `present=${Object.prototype.hasOwnProperty.call(mac, 'identity')} value=${String(mac.identity)}`)
}

// 9. Both artifacts, one architecture. `dir` is the plain .app verify:packaged
// launches; dmg is the one worth keeping.
{
  const targets = config.mac?.target ?? []
  const names = targets.map((t) => (typeof t === 'string' ? t : t.target))
  const arches = targets.flatMap((t) => (typeof t === 'string' ? [] : t.arch ?? []))
  ok('9 dir and dmg are built, for arm64',
    names.includes('dir') && names.includes('dmg') &&
      arches.length > 0 && arches.every((a) => a === 'arm64'),
    JSON.stringify(targets))
}

// 10. The arch is a parameter rather than a constant, so widening to universal
// later is a call site rather than an edit to a shipped default.
{
  const targets = buildConfig({ arch: 'universal' }).mac.target
  const arches = targets.flatMap((t) => t.arch ?? [])
  ok('10 the architecture is a parameter',
    arches.length > 0 && arches.every((a) => a === 'universal'), JSON.stringify(arches))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
