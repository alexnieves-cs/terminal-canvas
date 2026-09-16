#!/usr/bin/env node
/**
 * verify:chart-series (Round 7) — the two shapes the context pane's charts are
 * drawn from, checked without drawing either.
 *
 * Plain node. Both modules are deliberately React-free and clock-free so this
 * tier can reach them: `buildUsageSeries` takes `now` as an argument, and
 * `appendMachineSample` takes the sample. A function that read the wall clock
 * could not be checked against a fixture at all, which is how a bucketing bug
 * survives to production and is then blamed on the chart library.
 *
 * WHAT A CHART MAKES WORSE, and therefore what most of these checks are about:
 * a wrong NUMBER is read once and doubted; a wrong SHAPE is absorbed at a
 * glance and never revisited. So the rules that matter here are the ones about
 * what must NOT be drawn — a short bar for money we could not price, a smooth
 * ramp across minutes nobody sampled, a flat line inferred from one reading.
 */
const { buildSync } = require('esbuild')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
const outDir = join(root, 'out/verify')
mkdirSync(outDir, { recursive: true })

function load (entry, name) {
  const outfile = join(outDir, name)
  buildSync({
    entryPoints: [join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'react'],
    alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
  })
  return require(outfile)
}

const U = load('src/renderer/shell/usage-series.ts', 'usage-series.cjs')
const M = load('src/renderer/session/machine-series.ts', 'machine-series.cjs')

const DAY = 24 * 60 * 60 * 1000
// A fixed local noon, so every bucket boundary in this file is unambiguous and
// the run does not change answer depending on when it happens to be run.
const NOW = new Date(2026, 8, 16, 12, 0, 0).getTime()
const daysAgo = (n, hour = 9) => { const d = new Date(NOW - n * DAY); d.setHours(hour, 0, 0, 0); return d.getTime() }
const totals = (over = {}) => ({ input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0, ...over })
const row = (endedAt, model = 'claude-sonnet-5', over = {}) => ({ kind: 'usage', panelId: 'p', turns: 1, endedAt, byModel: { [model]: totals(over) } })

// ---------------------------------------------------------------------------
// The usage series.
// ---------------------------------------------------------------------------
const week = U.buildUsageSeries([row(daysAgo(0)), row(daysAgo(0)), row(daysAgo(3))], NOW)

ok('useries.window.1 the week is seven buckets, oldest first, and EVERY day is present — a day nobody spent anything is an answer, and dropping it would sit two runs a week apart side by side and read as consecutive',
  week.buckets.length === 7 &&
  week.buckets.every((b, i) => i === 0 || b.dayStart > week.buckets[i - 1].dayStart) &&
  week.buckets.filter((b) => b.sessions === 0).length === 5,
  JSON.stringify(week.buckets.map((b) => ({ d: b.label, s: b.sessions }))))

ok('useries.bucket.1 sessions land in the day they ENDED in, local time, and two in one day sum rather than replace',
  week.buckets[6].sessions === 2 && week.buckets[3].sessions === 1 &&
  week.buckets[6].tokens === 4000 && week.buckets[3].tokens === 2000,
  JSON.stringify({ today: week.buckets[6], three: week.buckets[3] }))

ok('useries.window.2 a row from outside the window is dropped rather than folded into the nearest edge — the window is this function\'s and so is the dropping',
  U.buildUsageSeries([row(daysAgo(30)), row(daysAgo(0))], NOW).buckets.reduce((n, b) => n + b.sessions, 0) === 1)

// THE PRICING RULE. This is the check the whole module exists to keep.
const unpriced = U.buildUsageSeries([row(daysAgo(1), 'some-local-model'), row(daysAgo(1), 'claude-sonnet-5')], NOW)
ok('useries.priced.1 one unpriced model POISONS its day and the series — never a smaller total that looks complete, and a later priced row in the same day cannot restore one',
  unpriced.buckets[5].costUsd === undefined && unpriced.priced === false &&
  unpriced.buckets[5].tokens === 4000,
  JSON.stringify(unpriced.buckets[5]))

ok('useries.priced.2 a wholly priced week says so, and the money is real rather than a token count in disguise',
  week.priced === true && typeof week.buckets[6].costUsd === 'number' && week.buckets[6].costUsd > 0 &&
  Math.abs(week.buckets[6].costUsd - ((2000 * 2 + 2000 * 10) / 1_000_000)) < 1e-9,
  JSON.stringify({ costUsd: week.buckets[6].costUsd }))

ok('useries.empty.1 a week where nothing closed is EMPTY, not a week of seven honest zeroes — the surface draws no chart rather than a picture of nothing',
  U.buildUsageSeries([], NOW).empty === true && week.empty === false &&
  U.buildUsageSeries([], NOW).buckets.length === 7)

ok('useries.word.1 the caption names the window and says when spend is incomplete — the one fact the shape itself cannot carry',
  U.usageSeriesWord(U.buildUsageSeries([], NOW)) === 'nothing closed this week' &&
  U.usageSeriesWord(unpriced).includes('incomplete') && U.usageSeriesWord(unpriced).includes('list price') &&
  U.usageSeriesWord(week).includes('by day'),
  JSON.stringify([U.usageSeriesWord(unpriced), U.usageSeriesWord(week)]))

ok('useries.peak.1 the peak is the tallest token day, so an axis is sized without walking the buckets twice',
  week.peakTokens === 4000 && U.buildUsageSeries([], NOW).peakTokens === 0)

// ---------------------------------------------------------------------------
// The machine series.
// ---------------------------------------------------------------------------
const sample = (at, cpu = 10, mem = 1000) => ({ at, cpuPercent: cpu, memoryBytes: mem })

let ring = []
for (let i = 0; i < M.MACHINE_SERIES_CAP + 25; i += 1) ring = M.appendMachineSample(ring, sample(i * 2000, i))
ok('mseries.cap.1 the ring is BOUNDED and drops from the front — an unbounded array behind a 2-second poll is a leak with no symptom until the session is hours old',
  ring.length === M.MACHINE_SERIES_CAP && ring[ring.length - 1].cpuPercent === M.MACHINE_SERIES_CAP + 24 &&
  ring[0].cpuPercent === 25,
  JSON.stringify({ length: ring.length, first: ring[0].cpuPercent, last: ring[ring.length - 1].cpuPercent }))

ok('mseries.append.1 every append returns a NEW array and a no-op returns the SAME one — useSyncExternalStore compares by reference, and a fresh array per read tears',
  (() => {
    const base = M.appendMachineSample([], sample(1000))
    const grown = M.appendMachineSample(base, sample(2000))
    const stale = M.appendMachineSample(grown, sample(2000))
    const backwards = M.appendMachineSample(grown, sample(500))
    return grown !== base && stale === grown && backwards === grown && grown.length === 2
  })())

ok('mseries.flat.1 a reading identical to the last is still recorded — a flat two minutes is a real answer, and skipping it would draw the flattest case as a gap',
  M.appendMachineSample(M.appendMachineSample([], sample(1000, 7)), sample(3000, 7)).length === 2)

// THE GAP RULE.
const gapped = [sample(0, 10), sample(2000, 12), sample(60_000, 90), sample(62_000, 92)]
const drawn = M.withMachineGaps(gapped)
ok('mseries.gap.1 a break in sampling is drawn as a HOLE, never a ramp — a straight segment across a minute nobody looked at invents a smooth climb between two unrelated readings',
  drawn.length === 5 && drawn[2].cpuPercent === null && drawn[2].memoryBytes === null &&
  drawn[2].at > gapped[1].at && drawn[2].at < gapped[2].at &&
  drawn.filter((d) => d.cpuPercent === null).length === 1,
  JSON.stringify(drawn.map((d) => [d.at, d.cpuPercent])))

ok('mseries.gap.2 consecutive samples at the polling cadence are NOT a gap — the threshold sits above the interval, not on it',
  M.withMachineGaps([sample(0), sample(2000), sample(4000)]).length === 3 &&
  M.isMachineGap(sample(0), sample(2000)) === false &&
  M.isMachineGap(sample(0), sample(60_000)) === true)

ok('mseries.peak.1 the CPU peak is NOT clamped to 100 — cpuPercent is summed across a process tree, and an axis pinned at 100 flattens the runaway this chart exists to show into the same picture as a busy-but-fine 95%',
  M.machineSeriesPeak([sample(0, 340, 10), sample(2000, 95, 20)]).cpuPercent === 340 &&
  M.machineSeriesPeak([sample(0, 340, 10), sample(2000, 95, 20)]).memoryBytes === 20 &&
  M.machineSeriesPeak([]).cpuPercent === 0)

ok('mseries.ready.1 one sample is a READING, not a trend: the chart stays absent until a second lands, because a single dot draws as a flat line and asserts a steadiness nobody measured',
  M.machineSeriesReady([]) === false && M.machineSeriesReady([sample(0)]) === false &&
  M.machineSeriesReady([sample(0), sample(2000)]) === true)

ok('mseries.cadence.1 the cap is two minutes at the renderer\'s own 2-second cadence — the window in which "is it climbing?" has an answer',
  M.MACHINE_SERIES_CAP * 2000 === 120_000 && M.MACHINE_SERIES_GAP_MS > 2000,
  JSON.stringify({ cap: M.MACHINE_SERIES_CAP, gapMs: M.MACHINE_SERIES_GAP_MS }))

const failed = results.filter((x) => !x.pass)
console.log(`verify:chart-series ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.n}${f.detail ? ` — ${f.detail}` : ''}`)
  process.exit(1)
}
