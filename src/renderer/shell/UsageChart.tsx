import { type JSX } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartColors } from './chart-tokens'
import { usageSeriesWord, type UsageSeries } from './usage-series'

/**
 * Round 7. This week's spend, as a shape rather than a sum.
 *
 * WHY BARS AND NOT A LINE: the x axis is seven discrete days, and a line
 * between Tuesday and Wednesday asserts that something happened at noon on
 * Tuesday-and-a-half. A day is a bucket; buckets are bars.
 *
 * WHY AN UNPRICED DAY IS A DIFFERENT MARK, not a short one: the pricing rule
 * this app has kept since M142 is "never a smaller figure that looks
 * complete", and a bar is the worst possible place to break it — a bar drawn
 * at the priced part of an unpriced day reads as a cheap day, and unlike a
 * figure there is nothing to hover that undoes a shape already seen. So an
 * unpriced day is drawn as a HOLLOW column at full height, which reads as
 * "something is here that cannot be counted", and the caption says so in
 * words underneath.
 *
 * It sits in a 260px pane, so there is no legend and no y-axis label — the
 * caption carries both. The chart is DECORATIVE to a screen reader: every
 * fact in it is already a sentence in the section around it, and a bar chart
 * announced cell by cell is noise on top of an answer.
 */
export interface UsageChartProps {
  series: UsageSeries
  /** Height in px. The pane is narrow; the caller owns the vertical budget. */
  height?: number
}

export function UsageChart (props: UsageChartProps): JSX.Element | null {
  const colors = useChartColors()
  const { series } = props
  // Nothing closed: the section already says so in words. A chart of seven
  // zeroes is a picture of nothing that takes the room of a picture.
  if (series.empty) return null

  const data = series.buckets.map((bucket) => ({
    label: bucket.label,
    dayStart: bucket.dayStart,
    tokens: bucket.tokens,
    costUsd: bucket.costUsd,
    // The value the bar is DRAWN at. An unpriced day is drawn full height and
    // hollow; see the note above on why it may not be drawn short.
    drawn: bucket.costUsd === undefined ? null : bucket.costUsd,
    unpriced: bucket.costUsd === undefined && bucket.sessions > 0
  }))
  const priced = data.map((d) => d.costUsd ?? 0)
  const ceiling = Math.max(...priced, 0)

  return (
    <div className="inspector__chart" data-usage-chart={series.priced ? 'priced' : 'unpriced'} aria-hidden="true">
      <ResponsiveContainer width="100%" height={props.height ?? 96}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={colors['--line']} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} stroke={colors['--fg-4']} interval={0} tick={{ fontSize: 9 }} />
          <YAxis hide domain={[0, ceiling === 0 ? 1 : ceiling]} />
          <Tooltip
            cursor={{ fill: colors['--s-2'] }}
            contentStyle={{ background: colors['--s-2'], border: `1px solid ${colors['--line']}`, borderRadius: 6, fontSize: 11, color: colors['--fg-3'] }}
            labelStyle={{ color: colors['--fg-3'] }}
            formatter={(_value, _name, entry) => {
              const row = entry.payload as (typeof data)[number]
              const tokens = `${row.tokens.toLocaleString()} tokens`
              return [row.costUsd === undefined ? `${tokens} — unpriced` : `$${row.costUsd.toFixed(2)} · ${tokens}`, '']
            }}
          />
          <Bar dataKey="drawn" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.dayStart} fill={row.unpriced ? 'none' : colors['--iris']} stroke={row.unpriced ? colors['--fg-4'] : 'none'} strokeDasharray={row.unpriced ? '2 2' : undefined} />
            ))}
          </Bar>
          {/* The unpriced days, drawn at the ceiling so the hollow column has a
              height to be hollow AT. A separate series rather than a coerced
              value, so `drawn` stays honestly null for them. */}
          <Bar dataKey={(row: (typeof data)[number]) => (row.unpriced ? (ceiling === 0 ? 1 : ceiling) : 0)} radius={[2, 2, 0, 0]} isAnimationActive={false} fill="none" stroke={colors['--fg-4']} strokeDasharray="2 2" legendType="none" />
        </BarChart>
      </ResponsiveContainer>
      <p className="inspector__chart-caption" data-usage-chart-caption>{usageSeriesWord(series)}</p>
    </div>
  )
}
