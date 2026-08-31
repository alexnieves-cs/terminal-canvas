/* Verifies process-tree aggregation without reading this machine's process table.
   Run with: npm run verify:machine-cost */
const { buildSync } = require('esbuild')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'out', 'verify', 'machine-cost.cjs')
buildSync({
  entryPoints: [join(__dirname, '..', 'src', 'main', 'machine-cost.ts')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs'
})
const M = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const rows = M.parseProcessList(`
  100  1  10.0  100
  101  100  20.0  200
  102  101  0.5  50
  200  1  30.0  300
  nope  1  7.0  10
`)

ok('1 ignores malformed ps rows', rows.length === 4)

const twoTrees = M.aggregateMachineCosts([
  { panelId: 'a', pid: 100 },
  { panelId: 'b', pid: 200 }
], rows)
ok('2 recursively includes every child in a panel cost',
  twoTrees.panels[0]?.cpuPercent === 30.5 && twoTrees.panels[0]?.memoryBytes === 350 * 1024)
ok('3 canvas total sums independent process trees',
  twoTrees.total.cpuPercent === 60.5 && twoTrees.total.memoryBytes === 650 * 1024)

const nested = M.aggregateMachineCosts([
  { panelId: 'parent', pid: 100 },
  { panelId: 'child', pid: 101 }
], rows)
ok('4 canvas total counts an overlapping tree once',
  nested.total.cpuPercent === 30.5 && nested.total.memoryBytes === 350 * 1024)

const missing = M.aggregateMachineCosts([{ panelId: 'gone', pid: 999 }], rows)
ok('5 absent roots produce no plausible zero-valued panel', missing.panels.length === 0)

let called = false
void M.sampleMachineCosts([], async () => {
  called = true
  return ''
}).then((snapshot) => {
  ok('6 empty target lists skip ps completely', !called && snapshot.panels.length === 0)
  return M.sampleMachineCosts([{ panelId: 'a', pid: 100 }], async () => {
    throw new Error('ps unavailable')
  })
}).then((snapshot) => {
  ok('7 ps failures return an empty snapshot without rejecting IPC',
    snapshot.panels.length === 0 && snapshot.total.cpuPercent === 0 && snapshot.total.memoryBytes === 0)
  console.log('\n' + '='.repeat(60))
  const failed = results.filter((result) => !result.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('FAILED: ' + failed.map((result) => result.n).join(', '))
    process.exitCode = 1
  }
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
