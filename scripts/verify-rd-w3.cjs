/* Phase 0 seam for lane W3. The lane replaces the body. This check only
   proves the seam is present, so the suite is registered before any feature
   code. Ids stay scoped: keep rd-w3.0 green when you add the real checks. */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
const contracts = readFileSync(join(ROOT, 'src', 'shared', 'redesign-contracts.ts'), 'utf8')
const own = JSON.parse(readFileSync(join(ROOT, 'docs', 'redesign', 'ownership.json'), 'utf8'))
const open = '/* ── rd:W3 ── */'
const close = '/* ── /rd:W3 ── */'
ok('rd-w3.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['W3']) && own.lanes['W3'].some((g) => g.endsWith('verify-rd-w3.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
