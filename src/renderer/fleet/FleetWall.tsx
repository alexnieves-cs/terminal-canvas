import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import { SegmentedControl, StatusDot } from '@renderer/primitives'
import { shellControl } from '@renderer/shell/shell-control'
import { useUsageHistory } from '@renderer/session/usage-store'
import { getAgent, getJournal, useAgentIds } from '../world/agent-world-store'
import type { AgentRecord } from '@shared/world-events'
import type { NightFilmExportRequest, NightFilmExportResult } from '@shared/export'
import {
  FLEET_WINDOWS, LANE_LEGEND, baseName, fileTreemap, filesTouched, fleetTiles, fleetWindow, fleetWord, formatDollars, formatTokens,
  spendOverTime, stateLanes, toolTicks, usageCost, usageTokens, wordCounts,
  type FileTouch, type FleetTile, type Segment, type Spend, type Tick
} from './fleet-model'
import { exportFleetLapse, lapseWords } from './fleet-export'

/**
 * M699. THE FLEET WALL: every agent on this canvas on one page, live.
 *
 * Four things a person running many agents asks at a glance, in the order the
 * page answers them: who needs me (the tiles, needs-you first), what has this
 * cost (canvas-wide tokens and dollars, and spend over time — backlog #19's
 * open half), what are they touching (a treemap of files, sized by how often a
 * tool named them), and how has the last while gone (each agent's state as a
 * lane, with a tick per tool call). "Export time-lapse" draws the same window
 * as a film (fleet-export.ts).
 *
 * A page, never a second store. It reads the world store (the one subscriber
 * to the feed), the usage store's history (M699) and nothing else, through the
 * pure functions in fleet-model.ts, and re-reads once a second while it is
 * showing — it is unmounted, and costs nothing, on every other page.
 */

export interface FleetWallProps {
  /** A panel's name, for a panel whose usage arrived with no feed record. Undefined for an id that is not a panel here. */
  nameOf: (panelId: string) => string | undefined
  /** Leaves for the canvas and frames the panel. Absent for an id that is not a panel. */
  onShowOnCanvas: (panelId: string) => void
  save: (req: NightFilmExportRequest) => Promise<NightFilmExportResult>
}

/** Ids in the world's own namespace are the room's, not agents (world-palette's rule). */
const OWN_NAMESPACE = 'world:'

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

function clock(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function windowLabel(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} hour` : `${minutes} min`
}

export function FleetWall({ nameOf, onShowOnCanvas, save }: FleetWallProps): JSX.Element {
  const now = useNow(1000)
  const ids = useAgentIds()
  const history = useUsageHistory()
  const [minutes, setMinutes] = useState(15)
  const [film, setFilm] = useState<{ progress: number | null; words: string | null }>({ progress: null, words: null })
  const journal = getJournal()
  const { from, to } = fleetWindow(journal, history, now, minutes)
  const records = ids.filter((id) => !id.startsWith(OWN_NAMESPACE)).map(getAgent).filter((r): r is AgentRecord => r !== undefined)
  const spend = spendOverTime(history, from, to, 90)
  const tiles = fleetTiles({ records, journal, history, spend, from, to, nameOf })
  const files = filesTouched(journal, from, to)
  const lanes = stateLanes(journal, from, to)
  const ticks = toolTicks(journal, from, to)
  const names = new Map(tiles.map((t) => [t.agentId, t.name]))
  const nameFor = (id: string): string => names.get(id) ?? nameOf(id) ?? id

  // Canvas-wide totals: every panel's cumulative usage, the figure a person
  // asks "what has today cost" about. Unknown when any model is unpriced.
  let tokens = 0
  let dollars: number | undefined = 0
  for (const points of history.values()) {
    const last = points[points.length - 1]
    if (last === undefined) continue
    tokens += usageTokens(last.usage)
    const c = usageCost(last.usage)
    dollars = c === undefined || dollars === undefined ? undefined : dollars + c
  }
  const windowSpend = spend.total[spend.total.length - 1] ?? 0
  const edits = files.reduce((s, f) => s + f.edits, 0)

  const runExport = (): void => {
    if (film.progress !== null) return
    setFilm({ progress: 0, words: null })
    void exportFleetLapse({ from, to, nameOf: nameFor, save, onProgress: (p) => setFilm({ progress: p, words: null }) })
      .then((r) => setFilm({ progress: null, words: lapseWords(r) }))
  }

  return (
    <div className="fleet" data-fleet-wall>
      <header className="fleet__bar">
        <h2 className="fleet__title">Fleet wall</h2>
        <ul className="fleet__counts" aria-label="Agents by state">
          {wordCounts(tiles).map((c) => (
            <li key={c.word} className="fleet__count" data-tone={c.tone}><StatusDot tone={c.tone} /> {c.count} {c.word}</li>
          ))}
        </ul>
        <div className="fleet__tools">
          <SegmentedControl<string>
            className="fleet__window"
            label="Window"
            value={String(minutes)}
            onChange={(v) => setMinutes(Number(v))}
            options={FLEET_WINDOWS.map((m) => ({ id: String(m), label: windowLabel(m), title: `The last ${windowLabel(m)}` }))}
          />
          <button type="button" className="fleet__export" data-fleet-export disabled={film.progress !== null || tiles.length === 0}
            title="Draw this window as a 24-second film and save it as an MP4"
            {...shellControl(runExport)}>
            {film.progress === null ? 'Export time-lapse' : `Rendering ${Math.round(film.progress * 100)}%`}
          </button>
        </div>
        {film.words !== null && <p className="fleet__film-words" data-fleet-film-words role="status">{film.words}</p>}
      </header>

      <section className="fleet__totals" aria-label="Totals">
        <Stat label="Agents" value={String(tiles.length)} note={`${clock(from)} to ${clock(to)}`} />
        <Stat label="Tokens on this canvas" value={formatTokens(tokens)} note={`${formatTokens(spend.tokens)} in the last ${windowLabel(minutes)}`} />
        <Stat label="Spend on this canvas" value={dollars === undefined ? 'not priced' : formatDollars(dollars)} note={`${formatDollars(windowSpend)} in the last ${windowLabel(minutes)}`} accent />
        <Stat label="Files touched" value={String(files.length)} note={`${edits} edit${edits === 1 ? '' : 's'} in the window`} />
      </section>

      {tiles.length === 0
        ? <p className="fleet__empty">No agent has reported anything yet. Start one from the canvas and its work shows up here.</p>
        : <section className="fleet__tiles" aria-label="Agents">
            {tiles.map((t) => <FleetCard key={t.agentId} tile={t} onOpen={nameOf(t.agentId) !== undefined ? () => onShowOnCanvas(t.agentId) : undefined} />)}
          </section>}

      <div className="fleet__charts">
        <section className="fleet__panel" aria-label="Spend over time">
          <h3 className="fleet__panel-title">Spend over time</h3>
          <SpendChart spend={spend} nameFor={nameFor} from={from} to={to} />
          {spend.unpriced.length > 0 && (
            <p className="fleet__note">{spend.unpriced.length} agent{spend.unpriced.length === 1 ? '' : 's'} spent tokens on a model the price table does not know, so {spend.unpriced.length === 1 ? 'it is' : 'they are'} counted in tokens only.</p>
          )}
        </section>
        <section className="fleet__panel" aria-label="Files touched">
          <h3 className="fleet__panel-title">Files touched</h3>
          <FileMap files={files} nameFor={nameFor} />
        </section>
      </div>

      <section className="fleet__panel fleet__panel--lanes" aria-label="State over time">
        <h3 className="fleet__panel-title">State over time</h3>
        <Lanes order={tiles.map((t) => t.agentId)} lanes={lanes} ticks={ticks} from={from} to={to} nameFor={nameFor} />
      </section>
    </div>
  )
}

function Stat({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }): JSX.Element {
  return (
    <div className={`fleet__stat${accent === true ? ' fleet__stat--accent' : ''}`}>
      <span className="fleet__stat-label">{label}</span>
      <span className="fleet__stat-value">{value}</span>
      <span className="fleet__stat-note">{note}</span>
    </div>
  )
}

function Spark({ values }: { values: readonly number[] }): JSX.Element | null {
  if (values.length < 2) return null
  const max = Math.max(...values)
  if (max <= 0) return null
  const w = 96
  const h = 24
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${((w * i) / (values.length - 1)).toFixed(1)},${(h - 2 - ((h - 4) * v) / max).toFixed(1)}`).join(' ')
  return <svg className="fleet__spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true"><path d={d} /></svg>
}

function FleetCard({ tile, onOpen }: { tile: FleetTile; onOpen?: () => void }): JSX.Element {
  const money = tile.tokens === null ? null : tile.cost === undefined ? 'not priced' : formatDollars(tile.cost ?? 0)
  const body = (
    <>
      <div className="fleet__card-head">
        <StatusDot tone={tile.tone} />
        <span className="fleet__card-name">{tile.name}</span>
        <span className="fleet__card-word" data-tone={tile.tone}>{tile.word}</span>
      </div>
      <p className="fleet__card-line">{tile.line === '' ? '—' : tile.line}</p>
      <div className="fleet__card-foot">
        <span className="fleet__card-money">
          {money === null ? <span className="fleet__card-quiet">no usage reported</span> : <>{money} <span className="fleet__card-quiet">· {formatTokens(tile.tokens ?? 0)} tokens</span></>}
        </span>
        <Spark values={tile.spark} />
      </div>
      <div className="fleet__card-facts">{tile.calls} tool call{tile.calls === 1 ? '' : 's'} · {tile.edits} file{tile.edits === 1 ? '' : 's'} edited</div>
    </>
  )
  return onOpen === undefined
    ? <article className="fleet__card" data-tone={tile.tone} data-fleet-card={tile.agentId}>{body}</article>
    : <button type="button" className="fleet__card fleet__card--open" data-tone={tile.tone} data-fleet-card={tile.agentId} title="Show on the canvas" {...shellControl(onOpen)}>{body}</button>
}

function SpendChart({ spend, nameFor, from, to }: { spend: Spend; nameFor: (id: string) => string; from: number; to: number }): JSX.Element {
  const [ref, width] = useWidth<HTMLDivElement>()
  const h = 240
  const pad = { l: 48, r: 190, t: 10, b: 22 }
  const w = Math.max(320, width)
  const plotW = w - pad.l - pad.r
  const plotH = h - pad.t - pad.b
  const max = Math.max(0.01, spend.total[spend.total.length - 1] ?? 0) * 1.08
  const xOf = (i: number): number => pad.l + (plotW * i) / Math.max(1, spend.times.length - 1)
  const yOf = (v: number): number => pad.t + plotH - (plotH * v) / max
  const bands = useMemo(() => {
    let below = new Array<number>(spend.times.length).fill(0)
    return spend.lines.map((line) => {
      const above = below.map((b, i) => b + line.values[i]!)
      const top = above.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
      const back = below.map((v, i) => `L${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).reverse().join(' ')
      const mid = (above[above.length - 1]! + below[below.length - 1]!) / 2
      const band = { agentId: line.agentId, d: `${top} ${back} Z`, mid, value: line.values[line.values.length - 1]! }
      below = above
      return band
    })
    // xOf/yOf close over the measured width; the spend object is the input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spend, w])
  if (spend.lines.length === 0) {
    return <div ref={ref} className="fleet__chart-empty">No priced spend in this window yet. Agents whose transcripts this app reads report tokens as they work.</div>
  }
  // Direct labels at the right end, nudged apart so two thin bands do not print on top of each other.
  const labels = bands.map((b) => ({ ...b, y: yOf(b.mid) })).sort((a, b) => b.y - a.y)
  for (let i = 1; i < labels.length; i += 1) if (labels[i - 1]!.y - labels[i]!.y < 14) labels[i]!.y = labels[i - 1]!.y - 14
  const totalPath = spend.total.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
  return (
    <div ref={ref} className="fleet__chart">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Spend over time, ${formatDollars(spend.total[spend.total.length - 1] ?? 0)} in the window`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="fleet__grid" x1={pad.l} x2={pad.l + plotW} y1={yOf(max * f / 1.08)} y2={yOf(max * f / 1.08)} />
            <text className="fleet__axis" x={pad.l - 6} y={yOf(max * f / 1.08) + 4} textAnchor="end">{formatDollars(max * f / 1.08)}</text>
          </g>
        ))}
        {bands.map((b, k) => <path key={b.agentId} className="fleet__band" d={b.d} fillOpacity={0.22 + 0.55 * (1 - k / Math.max(1, bands.length))} />)}
        <path className="fleet__total" d={totalPath} />
        {labels.map((l) => (
          <text key={l.agentId} className="fleet__band-label" x={pad.l + plotW + 8} y={l.y + 4}>
            {nameFor(l.agentId).slice(0, 24)} <tspan className="fleet__band-value">{formatDollars(l.value)}</tspan>
          </text>
        ))}
        <text className="fleet__axis" x={pad.l} y={h - 6}>{clock(from)}</text>
        <text className="fleet__axis" x={pad.l + plotW} y={h - 6} textAnchor="end">{clock(to)}</text>
      </svg>
    </div>
  )
}

function FileMap({ files, nameFor }: { files: readonly FileTouch[]; nameFor: (id: string) => string }): JSX.Element {
  const [ref, width] = useWidth<HTMLDivElement>()
  const h = 262
  if (files.length === 0) return <div ref={ref} className="fleet__chart-empty">No file tool has run in this window yet.</div>
  const folders = fileTreemap(files, { x: 0, y: 0, w: Math.max(200, width), h }, 20, 3)
  const max = Math.max(...files.map((f) => f.touches))
  return (
    <div ref={ref} className="fleet__map" style={{ height: h }}>
      {folders.map((folder) => (
        <div key={folder.name} className="fleet__folder" style={{ left: folder.box.x, top: folder.box.y, width: folder.box.w, height: folder.box.h }}>
          <span className="fleet__folder-name">{folder.name}</span>
          {folder.files.map(({ item, box }) => { const heat = Math.round(12 + 68 * (item.touches / max) ** 1.4); return (
            <div key={item.path} className="fleet__file" data-hot={heat >= 50 ? '' : undefined} title={`${item.path}: ${item.touches} touch${item.touches === 1 ? '' : 'es'}, ${item.edits} edit${item.edits === 1 ? '' : 's'}, mostly ${nameFor(item.topAgent)}`}
              style={{
                left: box.x - folder.box.x, top: box.y - folder.box.y, width: box.w, height: box.h,
                background: `color-mix(in srgb, var(--violet) ${heat}%, var(--s-1))`
              }}>
              {box.w > 54 && box.h > 22 && <span className="fleet__file-name">{baseName(item.path)}</span>}
              {box.w > 70 && box.h > 40 && <span className="fleet__file-facts">{item.touches} touch{item.touches === 1 ? '' : 'es'}{item.edits > 0 ? ` · ${item.edits} edit${item.edits === 1 ? '' : 's'}` : ''}</span>}
            </div>
          ) })}
        </div>
      ))}
    </div>
  )
}


function Lanes({ order, lanes, ticks, from, to, nameFor }: { order: readonly string[]; lanes: ReadonlyMap<string, Segment[]>; ticks: readonly Tick[]; from: number; to: number; nameFor: (id: string) => string }): JSX.Element {
  const [ref, width] = useWidth<HTMLDivElement>()
  const ids = order.filter((id) => lanes.has(id))
  const labelW = 200
  const laneH = 22
  const w = Math.max(400, width)
  const plotW = w - labelW - 8
  const h = ids.length * laneH + 26
  const xOf = (t: number): number => labelW + (plotW * (t - from)) / Math.max(1, to - from)
  const byAgent = new Map<string, Tick[]>()
  for (const t of ticks) byAgent.set(t.agentId, [...(byAgent.get(t.agentId) ?? []), t])
  return (
    <div ref={ref} className="fleet__chart">
      {ids.length === 0
        ? <div className="fleet__chart-empty">No agent has changed state in this window.</div>
        : <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="Each agent's state over the window">
            {ids.map((id, k) => {
              const y = k * laneH
              return (
                <g key={id}>
                  <text className="fleet__lane-name" x={0} y={y + laneH / 2 + 4}>{nameFor(id).slice(0, 26)}</text>
                  <rect className="fleet__lane-track" x={labelW} y={y + 3} width={plotW} height={laneH - 6} rx={3} />
                  {(lanes.get(id) ?? []).map((seg, i) => (
                    <rect key={i} className="fleet__seg" data-tone={fleetWord(seg.status).tone} x={xOf(seg.from)} y={y + 4} width={Math.max(1, xOf(seg.to) - xOf(seg.from))} height={laneH - 8} rx={2} />
                  ))}
                  {(byAgent.get(id) ?? []).map((t, i) => (
                    <rect key={`t${i}`} className={`fleet__tick fleet__tick--${t.kind}`} x={xOf(t.at) - 0.75} y={y + 2} width={1.5} height={laneH - 4} />
                  ))}
                </g>
              )
            })}
            <text className="fleet__axis" x={labelW} y={h - 6}>{clock(from)}</text>
            <text className="fleet__axis" x={labelW + plotW} y={h - 6} textAnchor="end">{clock(to)}</text>
          </svg>}
      <ul className="fleet__legend" aria-label="Legend">
        {LANE_LEGEND.map((s) => { const { word, tone } = fleetWord(s); return <li key={s}><StatusDot tone={tone} /> {word}</li> })}
        <li><span className="fleet__legend-tick fleet__tick--edit" /> edit</li>
        <li><span className="fleet__legend-tick fleet__tick--read" /> read</li>
        <li><span className="fleet__legend-tick fleet__tick--run" /> run</li>
        <li><span className="fleet__legend-tick fleet__tick--failed" /> failed tool</li>
      </ul>
    </div>
  )
}
