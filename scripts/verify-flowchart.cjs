/* M388–M391. The flowchart's pure rules. Run with: npm run verify:flowchart

   Plain node. The record (src/shared/flowchart.ts), Mermaid in and out
   (flowchart-mermaid.ts), the layered auto-layout (flowchart-layout.ts) and
   the geometry — outlines, ports, routing, arrowheads, hit tests
   (flowchart-geometry.ts) — the SVG text (flowchart-svg.ts), the
   arranging math every canvas object shares with a chart: align,
   distribute, equal-spacing guides, grid (renderer/canvas/arrange.ts), and
   (M392) a teammate's shapes and arrows as a shared canvas draws them
   (renderer/flowchart/shared-shapes.ts). Every property here fails SILENTLY when
   broken: a connector that routes through the shape it avoids still draws,
   a layout that overlaps two nodes still returns positions, a Mermaid import
   that dropped a `click` directive without counting it reads as an import
   that worked.

   Each area's checks live in scripts/flowchart-checks/<area>.cjs, one file
   per area, so the areas can be built in parallel without two hands in one
   file. */
const { buildSync } = require('esbuild')
const { mkdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')

mkdirSync(join(root, 'out/verify'), { recursive: true })
// Per-process outfile: several hands run this suite at once while the areas are
// built, and two processes writing one bundle would hand one of them a torn file.
const outfile = join(root, 'out/verify', `flowchart-${process.pid}.cjs`)
buildSync({ entryPoints: [join(__dirname, 'flowchart-entry.cjs')], outfile, bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'node-pty'], alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') } })
const F = require(outfile)
rmSync(outfile, { force: true })

;(async () => {
  // Static requires, one per area: `npm run affected` maps a suite to what
  // its script requires, and a computed path is a file it cannot see.
  await require('./flowchart-checks/record.cjs')(ok, F)
  await require('./flowchart-checks/mermaid.cjs')(ok, F)
  await require('./flowchart-checks/layout.cjs')(ok, F)
  await require('./flowchart-checks/geometry.cjs')(ok, F)
  await require('./flowchart-checks/arrange.cjs')(ok, F)
  await require('./flowchart-checks/files.cjs')(ok, F)
  await require('./flowchart-checks/convert.cjs')(ok, F)
  await require('./flowchart-checks/persist.cjs')(ok, F)
  await require('./flowchart-checks/shared.cjs')(ok, F)
  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((error) => { console.error(error); process.exitCode = 1 })
