/* Lane W5 (M453). Attention flight. Plain node. Ids stay scoped.
   rd-w5.0 stays: the seam is still the registration proof.

   Watched red: before world-flight.ts existed, esbuild failed to resolve
   the entry and the suite exited before rd-w5.flight.1. Restored by adding
   the module the checks call. */
'use strict'
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

const css = read('src/renderer/styles.css')
const contracts = read('src/shared/redesign-contracts.ts')
const own = JSON.parse(read('docs/redesign/ownership.json') || '{}')
const open = '/* ── rd:W5 ── */'
const close = '/* ── /rd:W5 ── */'
ok('rd-w5.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['W5']) && own.lanes['W5'].some((g) => g.endsWith('verify-rd-w5.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const OUT = join(ROOT, 'out', 'verify', 'rd-w5.cjs')
buildSync({
  stdin: {
    contents: `
      export {
        flightDuration, flightArc, flightPoint, flightDots, FLIGHT_MIN_MS, FLIGHT_MAX_MS,
        attentionStep, queueStrip, approvalToast, discardReady, shellCard, SHELL_ROOM_SENTENCE,
        fileOf, agentShort
      } from '../src/renderer/world/world-flight'
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-w5-entry.ts'
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: OUT,
  external: ['electron', 'react'],
  logLevel: 'silent'
})
const ATT_OUT = join(ROOT, 'out', 'verify', 'rd-w5-attention.cjs')
buildSync({
  stdin: {
    contents: `export { nextAttentionId } from '../src/renderer/canvas/attention'`,
    resolveDir: __dirname,
    sourcefile: 'rd-w5-attention.ts'
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: ATT_OUT,
  external: ['electron'],
  logLevel: 'silent'
})
const F = require(OUT)
const ATT = require(ATT_OUT)

ok('rd-w5.flight.1 the path is an arc on the floor: it starts at the first point, ends at the second, and the middle leaves the straight chord',
  (() => {
    const arc = F.flightArc({ x: 0, z: 0 }, { x: 10, z: 0 }, 9)
    const mid = arc[4]
    const ends = F.flightPoint(arc, 0).x === 0 && F.flightPoint(arc, 1).x === 10 && F.flightPoint(arc, 1).z === 0
    return arc.length === 9 && arc[0].x === 0 && arc[0].z === 0 && arc[8].x === 10 && arc[8].z === 0 &&
      Math.abs(mid.z) > 0.5 && arc.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)) && ends &&
      F.flightDots(arc, 1).length >= 2
  })())

ok('rd-w5.flight.2 duration follows the distance and a reduced-motion flight is a cut',
  F.FLIGHT_MIN_MS === 600 && F.FLIGHT_MAX_MS === 1200 &&
  F.flightDuration(4, true) === 0 && F.flightDuration(0, true) === 0 &&
  F.flightDuration(0, false) === 600 && F.flightDuration(1, false) === 600 &&
  F.flightDuration(10, false) > 600 && F.flightDuration(10, false) < 1200 &&
  F.flightDuration(10, false) <= F.flightDuration(40, false) &&
  F.flightDuration(40, false) === 1200)

const queues = [
  [[], null, 1],
  [[], 'a', -1],
  [['a'], null, 1],
  [['a'], 'a', 1],
  [['a'], 'a', -1],
  [['a', 'b', 'c'], null, 1],
  [['a', 'b', 'c'], null, -1],
  [['a', 'b', 'c'], 'gone', 1],
  [['a', 'b', 'c'], 'gone', -1],
  [['a', 'b', 'c'], 'a', 1],
  [['a', 'b', 'c'], 'c', 1],
  [['a', 'b', 'c'], 'a', -1],
  [['a', 'b', 'c'], 'b', -1]
]
ok('rd-w5.walk.1 World Cmd+J and the 2D walk pick the same next id — one rule, both directions, including a stale cursor',
  queues.every(([queue, current, direction]) => ATT.nextAttentionId(queue, current, direction) === F.attentionStep(queue, current, direction)))

const flightSrc = read('src/renderer/world/world-flight.ts')
const viewSrc = read('src/renderer/world/WorldView.tsx')
ok('rd-w5.walk.2 the room steps that rule on the published queue and does not sort a second one',
  !/\.sort\(/.test(flightSrc) && /attentionStep\(/.test(flightSrc) && /walkAttention\(/.test(viewSrc) &&
  !/from '@renderer\/canvas\//.test(viewSrc) && !/from 'three'/.test(flightSrc) && !/from 'react'/.test(flightSrc) &&
  !/\bdocument\.|\bwindow\./.test(flightSrc))

const strip = F.queueStrip(['codex', 'shell', 'pricing'], 'shell')
ok('rd-w5.queue.1 the strip reads NEEDS YOU · 2 of 3, with done, current and next chips in that order',
  strip.headline === 'NEEDS YOU · 2 of 3' && strip.index === 2 && strip.total === 3 &&
  strip.chips.join(',') === 'done,current,next' &&
  F.queueStrip([], null).total === 0 && F.queueStrip(['only'], null).chips.join(',') === 'current')

const ready = { root: '/repo', baseline: 'base', subjectId: 'codex-ledger', paths: ['ledger.ts'] }
const emptyOffer = { root: ' ', baseline: 'base', subjectId: 'p', paths: ['a'] }
const yes = F.approvalToast({ agent: 'Codex', file: 'ledger.ts', discard: ready })
const no = F.approvalToast({ agent: 'Codex', file: 'ledger.ts', discard: null })
const blank = F.approvalToast({ agent: 'Codex', file: 'ledger.ts', discard: emptyOffer })
ok('rd-w5.undo.1 Undo is rendered only when review discard is available for that panel; otherwise View diff and the same sentence, with no hold',
  F.discardReady(ready) === true && F.discardReady(null) === false && F.discardReady(emptyOffer) === false &&
  yes.undo === true && yes.viewDiff === false &&
  no.undo === false && no.viewDiff === true &&
  blank.undo === false && blank.viewDiff === true &&
  yes.sentence === "Approved Codex's edit to ledger.ts" && no.sentence === yes.sentence &&
  !Object.prototype.hasOwnProperty.call(yes, 'hold') && !Object.prototype.hasOwnProperty.call(no, 'hold'))

const toast = read('src/renderer/shell/toast.ts')
ok('rd-w5.undo.2 the sonner action is Undo only on that decision, and View diff is the other arm',
  /decision\.undo[\s\S]{0,160}label: 'Undo'[\s\S]{0,200}label: 'View diff'/.test(toast) &&
  /from 'sonner'/.test(toast))

const sheet = read('src/renderer/world/WorldFocusSheet.tsx')
const shellStart = sheet.indexOf('function ShellConsoleCard')
const shellEnd = sheet.indexOf('export function WorldFocusSheet')
const shellBody = shellStart >= 0 && shellEnd > shellStart ? sheet.slice(shellStart, shellEnd) : ''
ok('rd-w5.shell.1 a shell console has the room sentence and no reply field',
  F.shellCard('shell-prompt') === true && F.shellCard('approval') === false &&
  F.SHELL_ROOM_SENTENCE === 'A shell prompt is answered in its terminal, never from the room.' &&
  shellBody.includes('SHELL_ROOM_SENTENCE') && shellBody.includes('Snooze 10m') &&
  shellBody.includes('Open in Canvas') && shellBody.includes('Next</button>') &&
  shellBody.includes('data-world-shell-card') &&
  !shellBody.includes('textarea') && !shellBody.includes('data-world-focus-reply') &&
  sheet.indexOf('actions.answer(') !== -1 && sheet.indexOf('actions.answer(') < sheet.indexOf('emitApproved('))

ok('rd-w5.shell.2 the file in the toast is the one the question names',
  F.fileOf('wants to edit ledger.ts', 'export function streamCsv(rows)') === 'ledger.ts' &&
  F.fileOf('', 'no path here') === 'the file' &&
  F.agentShort('Codex — ledger-export') === 'Codex')

const span = css.slice(css.indexOf(open), css.indexOf(close))
ok('rd-w5.css.1 the strip and the shell card live in the W5 span, with no state hex',
  /\.world-queue\b/.test(span) && /data-world-shell-card/.test(span) &&
  !/#[0-9a-fA-F]{3,8}/.test(span) && /font-family:\s*var\(--font-mono\)/.test(span) &&
  /font-family:\s*var\(--font-ui\)/.test(span))

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) {
  for (const r of results.filter((row) => !row.pass)) console.log('  FAIL ' + r.n + (r.detail ? ' — ' + r.detail : ''))
  process.exitCode = 1
}
