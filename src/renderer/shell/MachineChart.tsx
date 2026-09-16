import { type JSX } from 'react'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { useChartColors } from './chart-tokens'
import { machineSeriesPeak, machineSeriesReady, withMachineGaps, type MachineSample } from '../session/machine-series'
import { formatCpu, formatMemory } from '../session/machine-cost-store'

/**
 * Round 7. The last two minutes of one panel's process tree.
 *
 * TWO SPARKLINES, NOT ONE CHART WITH TWO AXES. CPU is a percentage that can
 * pass 100 on several cores and RAM is bytes; sharing a y axis makes one of
 * them a flat line against the other's scale, and a second y axis in a 260px
 * pane is two axis labels and no room for the data. Each line owns its own
 * strip, and each strip's CURRENT value is printed beside it — the shape
 * answers "is it climbing", the figure answers "how much".
 *
 * The y domain is `[0, peak]`, NOT `[0, 100]` for CPU: `cpuPercent` is summed
 * across the tree and a runaway agent reads 340%, which an axis pinned at 100
 * would flatten into exactly the same picture as a busy-but-fine 95%. That is
 * the one reading this chart exists to make visible.
 *
 * Decorative to a screen reader: the figures beside it are the same facts in
 * words, and the inspector's Machine line states them again.
 */
export interface MachineChartProps {
  series: readonly MachineSample[]
  height?: number
}

export function MachineChart (props: MachineChartProps): JSX.Element | null {
  const colors = useChartColors()
  // One sample is a reading, not a trend: a single dot draws as a flat line
  // and asserts a steadiness nobody measured. The section keeps its figure
  // alone until a second sample lands.
  if (!machineSeriesReady(props.series)) return null

  const data = withMachineGaps(props.series)
  const peak = machineSeriesPeak(props.series)
  const latest = props.series[props.series.length - 1]
  const height = props.height ?? 28

  const strip = (
    key: 'cpuPercent' | 'memoryBytes',
    color: string,
    max: number,
    word: string
  ): JSX.Element => (
    <div className="inspector__spark" data-machine-spark={key}>
      <span className="inspector__spark-word">{word}</span>
      <div className="inspector__spark-plot" aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={[0, max === 0 ? 1 : max]} />
            {/* connectNulls stays FALSE: the null rows are the gaps
                `withMachineGaps` inserted, and joining them would draw a
                smooth ramp across a stretch nobody sampled. */}
            <Area type="monotone" dataKey={key} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  return (
    <div className="inspector__sparks" data-machine-chart>
      {strip('cpuPercent', colors['--blue'], peak.cpuPercent, formatCpu(latest.cpuPercent))}
      {strip('memoryBytes', colors['--green'], peak.memoryBytes, formatMemory(latest.memoryBytes))}
    </div>
  )
}

/** Compact orchestration history; never manufacture a trend from one reading. */
export function MachineSparkline({ values, tone = '--blue' }: { values: readonly number[]; tone?: '--blue' | '--green' | '--iris' }): JSX.Element {
  const colors = useChartColors()
  return <div className="orch__spark" aria-hidden="true">
    {values.length >= 2 && <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={values.map(value => ({ value }))} margin={{ top: 3, bottom: 0, left: 0, right: 0 }}>
        <YAxis hide domain={[0, Math.max(1, ...values)]} />
        <Area dataKey="value" type="monotone" stroke={colors[tone]} fill={colors[tone]} fillOpacity={0.16} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
      </AreaChart>
    </ResponsiveContainer>}
  </div>
}
