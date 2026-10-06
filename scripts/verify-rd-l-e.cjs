/* Phase 0 seam for lane L-E. The lane replaces the body. This check only
   proves the seam is present, so the suite is registered before any feature
   code. Ids stay scoped: keep rd-l-e.0 green when you add the real checks. */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
const contracts = readFileSync(join(ROOT, 'src', 'shared', 'redesign-contracts.ts'), 'utf8')
const own = JSON.parse(readFileSync(join(ROOT, 'docs', 'redesign', 'ownership.json'), 'utf8'))
const open = '/* ── rd:L-E ── */'
const close = '/* ── /rd:L-E ── */'
ok('rd-l-e.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['L-E']) && own.lanes['L-E'].some((g) => g.endsWith('verify-rd-l-e.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
