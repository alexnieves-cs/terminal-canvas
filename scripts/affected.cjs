/* `npm run affected` — only the verify suites your change can reach.
   NOT THE GATE. `npm run verify` is the gate and stays the only thing that
   proves a tree green; this is for the iteration loop in between, where the
   full Electron tier costs minutes per try.

   Run with:  npm run affected                 changes since the merge-base with main
              npm run affected -- --base <ref>  changes since <ref>
              npm run affected -- <file>...      exactly these files
              npm run affected -- --list         say what would run, run nothing

   WHY NOT TC_ONLY. TC_ONLY narrows what a suite REPORTS, never what it runs
   (scripts/lib/checks.cjs says why: checks share state in-process). It cannot
   save time. Choosing fewer SUITES can, because suites share nothing.

   HOW A SUITE'S SOURCES ARE FOUND — derived, never a hand-written table, for
   the reason verify-all.cjs derives its suite list: a table is stale the day a
   suite is added. From the script package.json names, follow:
     - require('./x.cjs'), and join(__dirname, 'x-entry.cjs') esbuild entries,
       recursively through scripts/ (the harness, lib/, the *-entry.cjs files);
     - require('../src/...') and every join(__dirname|ROOT, '..', 'src', ...)
       or 'src/...' literal — a file, or a DIRECTORY that selects everything
       under it (verify:styles walks src/renderer);
     - doc and config literals ('CLAUDE.md', 'package.json') for verify:meta;
   then close every src file over the import graph (relative, @shared,
   @renderer, dynamic import, require, CSS imports, index.html's script src).
   Type-only imports count: a type change can break a bundle's typecheck, and
   over-selecting costs seconds where under-selecting costs a false green.

   THE ELECTRON SUITES THAT BOOT THE BUILD (canvas, xterm, window, the panels
   parts) see the whole app, so any change inside the app's own import
   closure selects them, and they are run after `npm run build` exactly as in
   the gate. A .ts change that selects no build consumer still gets
   `npm run typecheck`.

   THREE STATES, NOT TWO. A changed file that maps to no suite is listed by
   name as UNMAPPED — "nothing ran" must never read as "nothing was affected". */
'use strict'
const { readFileSync, existsSync, statSync, readdirSync } = require('node:fs')
const { join, dirname, relative, posix } = require('node:path')
const { execFileSync } = require('node:child_process')
const runner = require('./verify-all.cjs')

const ROOT = join(__dirname, '..')
const rel = (abs) => relative(ROOT, abs).split('\\').join('/')
const isFile = (r) => { try { return statSync(join(ROOT, r)).isFile() } catch { return false } }
const isDir = (r) => { try { return statSync(join(ROOT, r)).isDirectory() } catch { return false } }
const readRel = (r) => { try { return readFileSync(join(ROOT, r), 'utf8') } catch { return '' } }

/* ---- the src import graph ------------------------------------------------ */

const EXTS = ['', '.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js']
const resolveSpec = (fromRel, spec) => {
  let base
  if (spec.startsWith('@shared/')) base = 'src/shared/' + spec.slice('@shared/'.length)
  else if (spec.startsWith('@renderer/')) base = 'src/renderer/' + spec.slice('@renderer/'.length)
  else if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(fromRel), spec))
  else return null // a package: not ours to track
  for (const e of EXTS) if (isFile(base + e)) return base + e
  return null
}

// `from '…'`, `import('…')`, `require('…')`, and the bare side-effect `import '…'`.
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g
const HTML_RE = /\b(?:src|href)=["']([^"':]+)["']/g

const walk = (dirRel, out = []) => {
  if (!isDir(dirRel)) return out
  for (const name of readdirSync(join(ROOT, dirRel))) {
    const r = `${dirRel}/${name}`
    if (isDir(r)) walk(r, out)
    else out.push(r)
  }
  return out
}

let graphCache = null
const importGraph = () => {
  if (graphCache) return graphCache
  const deps = new Map()
  for (const f of walk('src')) {
    if (!/\.(tsx?|jsx?|cjs|mjs|css|html)$/.test(f)) continue
    const text = readRel(f)
    const found = new Set()
    const re = f.endsWith('.html') ? HTML_RE : IMPORT_RE
    for (const m of text.matchAll(re)) {
      const spec = f.endsWith('.html') ? (m[1].startsWith('.') || m[1].startsWith('/') ? m[1].replace(/^\//, './') : './' + m[1]) : m[2]
      const hit = resolveSpec(f, spec)
      if (hit) found.add(hit)
    }
    deps.set(f, found)
  }
  graphCache = deps
  return deps
}

const closeOver = (seeds) => {
  const graph = importGraph()
  const seen = new Set()
  const stack = [...seeds]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    for (const d of graph.get(f) ?? []) stack.push(d)
  }
  return seen
}

/* ---- what a suite's scripts name ---------------------------------------- */

// join(__dirname|ROOT|root, 'a', 'b') with only string-literal segments.
const JOIN_RE = /\bjoin\(\s*(__dirname|ROOT|root)\s*((?:,\s*(['"])[^'"\n]*\3\s*)+)\)/g
const SEG_RE = /(['"])([^'"\n]*)\1/g
const REQ_RE = /\brequire\(\s*(['"])(\.{1,2}\/[^'"\n]+)\1\s*\)/g
const PATH_LIT_RE = /(['"`])((?:src|docs|build|scripts|verify)\/[^'"`\s${}]+)\1/g
const ROOT_FILE_RE = /(['"])([\w.-]+\.(?:md|json|cjs|ts))\1/g

/* A script's direct dependencies: scripts it pulls in and paths (files or
   directories) under the repository it names. Comments are NOT stripped:
   a path a comment names is almost always a path the code near it reads, and
   over-selecting is the safe error. */
const scriptRefs = (scriptRel) => {
  const text = readRel(scriptRel)
  const dir = posix.dirname(scriptRel)
  const refs = new Set()
  const add = (r) => { if (r && (isFile(r) || isDir(r))) refs.add(r.replace(/\/$/, '')) }
  for (const m of text.matchAll(JOIN_RE)) {
    // An esbuild alias value (`'@shared': join(__dirname, '..', 'src', 'shared')`)
    // is resolver CONFIG, not a read. Counting it made nearly every suite
    // "read" all of src/shared and select on any change at all.
    if (/@\w+['"]?\s*:\s*$/.test(text.slice(Math.max(0, m.index - 40), m.index))) continue
    const base = m[1] === '__dirname' ? dir : ''
    const segs = [...m[2].matchAll(SEG_RE)].map((s) => s[2])
    add(posix.normalize(posix.join(base || '.', ...segs)))
  }
  for (const m of text.matchAll(REQ_RE)) {
    const hit = resolveSpec(scriptRel, m[2])
    if (hit) refs.add(hit)
  }
  for (const m of text.matchAll(PATH_LIT_RE)) add(m[2])
  for (const m of text.matchAll(ROOT_FILE_RE)) if (isFile(m[2])) refs.add(m[2])
  refs.delete(scriptRel)
  refs.delete('.')
  refs.delete('scripts')
  return refs
}

/* Everything a suite depends on: its scripts (recursively), the src files
   and directories they name, and the import closure of those src files. */
const sourcesOf = (body) => {
  const roots = [...String(body).matchAll(/scripts\/[\w.-]+\.cjs/g)].map((m) => m[0])
  const files = new Set()
  const dirs = new Set()
  const stack = [...roots]
  while (stack.length) {
    const r = stack.pop()
    if (files.has(r) || dirs.has(r)) continue
    if (isDir(r)) { dirs.add(r); continue }
    files.add(r)
    if (/^scripts\/.*\.cjs$/.test(r)) for (const d of scriptRefs(r)) stack.push(d)
  }
  for (const f of closeOver([...files].filter((f) => f.startsWith('src/')))) files.add(f)
  // A named DIRECTORY is a text read (verify:styles walks src/renderer, Electronegativity
  // scans src): it selects by prefix in select(), and is deliberately NOT closed over
  // imports — what those files import is not what a text read depends on.
  return { files, dirs }
}

/* ---- the build consumers ------------------------------------------------ */

// The app's own entries, per electron.vite.config.ts.
const APP_ENTRIES = ['src/main/index.ts', 'src/cli/tc-main.ts', 'src/preload/index.ts', 'src/renderer/index.html']
// package.json is deliberately absent: adding an npm script would otherwise select
// every panels part. A dependency bump IS a build change — that is a full-gate
// change, and the suites that read package.json as a literal still select on it.
const BUILD_CONFIG = /^(electron\.vite\.config\.ts|tsconfig[\w.]*\.json)$/
const BOOTS_BUILD = /'out',\s*'(?:main|renderer|preload)'|out\/(?:main|renderer|preload)\/|\bloadFile\(/

const isConsumer = (suite, files) => suite.tier === 'electron' &&
  [...files].some((f) => f.startsWith('scripts/') && BOOTS_BUILD.test(readRel(f)))

/* ---- selection ------------------------------------------------------------ */

const select = (changed, allSuites = runner.suites()) => {
  const app = closeOver(APP_ENTRIES)
  const chosen = new Map() // name -> { suite, why }
  const covered = new Set()
  const consumers = []
  for (const suite of allSuites) {
    const { files, dirs } = sourcesOf(suite.body)
    const consumer = isConsumer(suite, files)
    if (consumer) consumers.push(suite.name)
    for (const c of changed) {
      const direct = files.has(c) || [...dirs].some((d) => c.startsWith(d + '/'))
      const viaBuild = consumer && (app.has(c) || BUILD_CONFIG.test(c))
      if (direct || viaBuild) {
        covered.add(c)
        if (!chosen.has(suite.name)) chosen.set(suite.name, { suite, why: `${c}${direct ? '' : ' (in the app build)'}` })
      }
    }
  }
  const picked = [...chosen.values()]
  const build = picked.some((p) => p.suite.tier !== 'plain')
  const typecheck = !build && changed.some((c) => /\.(tsx?)$/.test(c) || /^tsconfig/.test(c))
  const unmapped = changed.filter((c) => !covered.has(c))
  return { picked, build, typecheck, unmapped, consumers }
}

/* ---- the changed files ---------------------------------------------------- */

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

const changedFiles = (base) => {
  const from = base ?? git('merge-base', 'HEAD', 'main')
  const tracked = git('diff', '--name-only', from).split('\n')
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n')
  // A deleted file still matters: whatever named it is exactly what to rerun.
  return { from, files: [...new Set([...tracked, ...untracked])].filter(Boolean) }
}

/* ---- main ---------------------------------------------------------------- */

const main = async (argv) => {
  const list = argv.includes('--list')
  const bi = argv.indexOf('--base')
  const base = bi >= 0 ? argv[bi + 1] : undefined
  const explicit = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--base')
  const { from, files } = explicit.length ? { from: null, files: explicit } : changedFiles(base)

  console.log('affected — NOT the gate. `npm run verify` is the only proof of green.')
  console.log(explicit.length ? `${files.length} file(s) named` : `${files.length} file(s) changed since ${from.slice(0, 10)}`)
  if (!files.length) { console.log('nothing changed — nothing to run'); return 0 }

  const { picked, build, typecheck, unmapped } = select(files)
  for (const p of picked) console.log(`  ${p.suite.name.padEnd(24)} ${p.suite.tier.padEnd(8)} ← ${p.why}`)
  if (typecheck) console.log(`  ${'typecheck'.padEnd(24)} ${'plain'.padEnd(8)} ← a .ts file changed and no build consumer was picked`)
  if (unmapped.length) {
    console.log(`\nUNMAPPED — ${unmapped.length} changed file(s) no suite reads; only the full gate covers them:`)
    for (const u of unmapped) console.log(`  ${u}`)
  }
  if (!picked.length && !typecheck) { console.log('\nno suite reaches these files'); return unmapped.length ? 1 : 0 }
  if (list) return 0

  const started = Date.now()
  const plain = picked.filter((p) => p.suite.tier === 'plain').map((p) => p.suite)
  const serial = picked.filter((p) => p.suite.tier !== 'plain').map((p) => p.suite)
  const results = []
  const { cpus } = require('node:os')
  if (plain.length) results.push(...await runner.runConcurrently(plain, Math.max(2, Math.min(8, cpus().length))))
  if (results.some((r) => r.status !== 'passed')) return runner.finish(results, started, 'stopped after the plain tier')
  const pkg = JSON.parse(readRel('package.json'))
  if (build || typecheck) {
    const step = build ? 'build' : 'typecheck'
    const r = await runner.runOne(step, pkg.scripts[step])
    runner.report(r)
    results.push(r)
    if (r.status !== 'passed') return runner.finish(results, started, `stopped after ${step}`)
  }
  for (const s of serial) {
    const r = await runner.runOne(s.name, s.body)
    runner.report(r)
    results.push(r)
  }
  return runner.finish(results, started, 'affected suites only — not the gate')
}

module.exports = { select, sourcesOf, closeOver, importGraph, resolveSpec, APP_ENTRIES }

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    if (typeof code === 'number') process.exitCode = code
  }).catch((error) => {
    console.log(`affected.cjs threw: ${(error && error.stack) || error}`)
    process.exit(1)
  })
}
