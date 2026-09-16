/**
 * Round 7. A SHORT MEMORY OF THE PROCESS TABLE.
 *
 * `machine-cost.ts` says of its snapshot "One slow, whole-canvas sample. No
 * history is retained", and that was right for what the inspector did with it
 * — print `CPU 4% · RAM 812 MB` and print it again two seconds later. It is
 * the wrong shape for the only question a person asks of those two numbers:
 * is this thing settling down or climbing? A single sample cannot answer that
 * however often it is redrawn, because the reader has to hold the previous
 * value in their head and nobody does.
 *
 * So this is a deliberate, BOUNDED reversal of that sentence, and the bound
 * is the point: two minutes of samples per panel, thrown away from the front,
 * never written to disk and never read by anything but a mounted chart. It is
 * a sparkline's memory, not a metrics system — this app has no business
 * growing one of those, and an unbounded array behind a 2-second interval on
 * a canvas that can hold thirty terminals is a leak with no symptom until the
 * session is hours old.
 *
 * Pure: no React, no clock. `verify:machine-series`.
 */

/** One reading, with the moment it was taken — the x value. */
export interface MachineSample {
  at: number
  cpuPercent: number
  memoryBytes: number
}

/**
 * 60 samples. At the renderer's 2-second cadence that is two minutes, which
 * is the window in which "is it climbing?" has an answer; an hour of
 * sparkline would be a flat line with one spike nobody can point at.
 */
export const MACHINE_SERIES_CAP = 60

/**
 * A GAP, not a joined line. Two samples further apart than this did not
 * happen back to back — the panel was not running, `ps` failed, or the app
 * was asleep — and drawing a straight segment across that would invent a
 * smooth ramp between two unrelated readings. The chart breaks the line
 * instead.
 */
export const MACHINE_SERIES_GAP_MS = 6_000

/**
 * Append, dropping the oldest past the cap. Returns a NEW array, always, so a
 * `useSyncExternalStore` snapshot compares by reference and a chart that is
 * not mounted costs nothing.
 *
 * An out-of-order or repeated timestamp is dropped rather than sorted in: the
 * only caller is one interval in one renderer, so a sample that is not newer
 * than the last is a bug somewhere else, and silently re-sorting it would
 * hide that while drawing a line that never happened.
 */
export function appendMachineSample (series: readonly MachineSample[], sample: MachineSample, cap: number = MACHINE_SERIES_CAP): readonly MachineSample[] {
  const last = series[series.length - 1]
  if (last !== undefined && sample.at <= last.at) return series
  const next = [...series, sample]
  return next.length <= cap ? next : next.slice(next.length - cap)
}

/** True when nothing joins these two samples — the chart lifts the pen. */
export function isMachineGap (previous: MachineSample, next: MachineSample, gapMs: number = MACHINE_SERIES_GAP_MS): boolean {
  return next.at - previous.at > gapMs
}

/**
 * The series with a null reading inserted across every gap. Recharts breaks a
 * line on a null `y`, so this is what turns "we stopped looking" into a hole
 * in the line rather than a ramp between two unrelated readings.
 */
export function withMachineGaps (series: readonly MachineSample[], gapMs: number = MACHINE_SERIES_GAP_MS): { at: number; cpuPercent: number | null; memoryBytes: number | null }[] {
  const out: { at: number; cpuPercent: number | null; memoryBytes: number | null }[] = []
  series.forEach((sample, i) => {
    const previous = series[i - 1]
    if (previous !== undefined && isMachineGap(previous, sample, gapMs)) {
      out.push({ at: (previous.at + sample.at) / 2, cpuPercent: null, memoryBytes: null })
    }
    out.push({ at: sample.at, cpuPercent: sample.cpuPercent, memoryBytes: sample.memoryBytes })
  })
  return out
}

/**
 * The tops, for axes that do not rescale on every tick.
 *
 * CPU is NOT clamped to 100: `cpuPercent` is summed across a process tree and
 * legitimately exceeds 100 on more than one core, and an axis pinned at 100
 * would silently flatten exactly the runaway this chart exists to show.
 */
export function machineSeriesPeak (series: readonly MachineSample[]): { cpuPercent: number; memoryBytes: number } {
  return {
    cpuPercent: Math.max(0, ...series.map((s) => s.cpuPercent)),
    memoryBytes: Math.max(0, ...series.map((s) => s.memoryBytes))
  }
}

/**
 * Whether the series says anything yet. One sample is a READING, not a trend
 * — a chart of it is a single dot that reads as a flat line — so the surface
 * keeps showing its figure alone until a second sample lands.
 */
export function machineSeriesReady (series: readonly MachineSample[]): boolean {
  return series.length >= 2
}
