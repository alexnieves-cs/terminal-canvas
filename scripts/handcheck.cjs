/* `npm run handcheck` (M136). Walks the eleven owed hand checks in
   scripts/handcheck-steps.cjs: runs the automated arms against the REAL
   machine (a real `claude`, the real Trash, a real createSkill under a
   fenced temp HOME) and prints the human steps for the rest.

   NOT in `npm run verify`, for the same reason verify:packaged is not: it
   reaches outside the repository. Three line shapes, never two —
     AUTO PASS/FAIL <n> <title> — <evidence>
     SKIP <n> <title> — <what is missing>
     HAND <n> <title>  (followed by the numbered steps)
   — and the exit code is non-zero on an AUTO FAIL only. A HAND line is not
   a pass: it is a statement that a person has not done it yet. */
'use strict'
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { existsSync } = require('node:fs')
const { execFile, execFileSync } = require('node:child_process')

const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'out', 'verify', 'handcheck-entry.cjs')
buildSync({
  entryPoints: [join(__dirname, 'handcheck-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node:fs', 'node:path', 'node:os', 'electron'],
  alias: { '@shared': join(ROOT, 'src', 'shared'), '@renderer': join(ROOT, 'src', 'renderer') }
})
const entry = require(OUT)
const { STEPS } = require('./handcheck-steps.cjs')

const which = (name) => {
  try {
    const out = execFileSync('/bin/zsh', ['-lc', `command -v ${name}`], { encoding: 'utf8', timeout: 15000 }).trim()
    return out.startsWith('/') ? out : null
  } catch { return null }
}
const exec = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
})
const electronNode = async (script) => {
  const bin = join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  if (!existsSync(bin)) return null
  return new Promise((resolve) => {
    // A REAL Electron process, not node mode: `require('electron').shell` is
    // undefined under ELECTRON_RUN_AS_NODE (the module is the binary's path
    // there), which the first run of this arm reported as a failure of the
    // Trash rather than of the runner. No window is opened.
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    execFile(bin, [script], { encoding: 'utf8', timeout: 30000, env }, (err, stdout, stderr) => resolve(err ? String(stdout || '') + String(stderr || '') : String(stdout)))
  })
}
const ctx = { ...entry, which, exec, electronNode }

;(async () => {
  let failed = 0, passed = 0, skipped = 0, hand = 0
  for (const step of STEPS) {
    if (step.arm === 'auto') {
      let r
      try { r = await step.run(ctx) } catch (e) { r = { pass: false, detail: 'threw: ' + String(e && e.stack || e) } }
      if (r.skip) { skipped++; console.log(`SKIP  ${step.n} ${step.title} — ${r.detail}`) }
      else if (r.pass) { passed++; console.log(`AUTO PASS  ${step.n} ${step.title} — ${r.detail}`) }
      else { failed++; console.log(`AUTO FAIL  ${step.n} ${step.title} — ${r.detail}`) }
    } else {
      hand++
      console.log(`HAND  ${step.n} ${step.title}`)
      step.steps.forEach((s, i) => console.log(`        ${i + 1}. ${s}`))
    }
  }
  console.log('\n' + '='.repeat(60))
  console.log(`${passed} automated passed, ${failed} failed, ${skipped} skipped, ${hand} for a person — ${STEPS.length} owed in all`)
  process.exit(failed ? 1 : 0)
})()
