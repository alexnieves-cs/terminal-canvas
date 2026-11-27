import { STATE_PALETTE, TONE_TO_TOKEN } from '@shared/state-palette'
import type { StateTone } from '@shared/redesign-contracts'
import { LAPSE_BOXES, LAPSE_SIZE, type LapseFrame, type LapseScript } from './fleet-film'
import { baseName, formatDollars, formatTokens } from './fleet-model'

/**
 * M699. Paints one time-lapse frame. Reads the frame and the script, nothing
 * else: every word in them passed `outward` in fleet-film.ts, and this file
 * draws no word of its own beyond the film's fixed chrome (the section
 * titles and the clock). film-paint.ts's discipline, for the second film.
 *
 * State colour is the one palette through the tone. The ground and bodies are
 * film-paint's dark neutrals; the one accent is the dark theme's `--violet`,
 * the chart accent `chart-tokens.ts` allows, so no money mark is ever drawn
 * in a state hue (amber, above all, means "needs you").
 */

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

const GROUND = '#0D1015'
const BODY = '#161B23'
const EDGE = '#262D39'
const INK = '#E6E9EF'
const MUTED = '#9AA1AE'
const FAINT = '#5B6372'
const ACCENT = '#a894f0'
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif'
const MONO = '"SF Mono", Menlo, ui-monospace, monospace'

const toneColour = (tone: StateTone): string => STATE_PALETTE.dark[TONE_TO_TOKEN[tone]]

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function fit(ctx: Ctx, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1)
  return `${s}…`
}

function clock(t: number): string {
  const d = new Date(t)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}

function title(ctx: Ctx, text: string, x: number, y: number): void {
  ctx.font = `600 13px ${FONT}`
  ctx.fillStyle = MUTED
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x, y)
}

function paintTiles(ctx: Ctx, frame: LapseFrame): void {
  const box = LAPSE_BOXES.tiles
  title(ctx, 'Agents', box.x, box.y + 14)
  const n = frame.tiles.length
  if (n === 0) return
  const cols = n > 5 ? 2 : 1
  const rows = Math.ceil(n / cols)
  const gap = 10
  const top = box.y + 26
  const w = (box.w - gap * (cols - 1)) / cols
  const h = Math.min(92, (box.h - 26 - gap * (rows - 1)) / rows)
  frame.tiles.forEach((tile, k) => {
    const x = box.x + (k % cols) * (w + gap)
    const y = top + Math.floor(k / cols) * (h + gap)
    const colour = toneColour(tile.tone)
    roundRect(ctx, x, y, w, h, 10)
    ctx.fillStyle = BODY
    ctx.fill()
    ctx.lineWidth = tile.tone === 'needs-you' ? 2 : 1
    ctx.strokeStyle = tile.tone === 'idle' ? EDGE : colour
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x + 18, y + 22, 5, 0, Math.PI * 2)
    ctx.fillStyle = colour
    ctx.fill()
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.font = `600 12px ${FONT}`
    ctx.fillStyle = colour
    const wordW = ctx.measureText(tile.word).width
    ctx.fillText(tile.word, x + w - 14, y + 22)
    ctx.textAlign = 'left'
    ctx.font = `600 15px ${FONT}`
    ctx.fillStyle = INK
    ctx.fillText(fit(ctx, tile.name, w - 60 - wordW), x + 32, y + 22)
    ctx.font = `12px ${MONO}`
    ctx.fillStyle = MUTED
    ctx.fillText(fit(ctx, tile.line, w - 28), x + 14, y + h / 2 + 8)
    if (tile.money !== null) {
      ctx.font = `600 13px ${FONT}`
      ctx.fillStyle = ACCENT
      ctx.fillText(tile.money, x + 14, y + h - 16)
    }
  })
}

function paintSpend(ctx: Ctx, frame: LapseFrame, script: LapseScript): void {
  const box = LAPSE_BOXES.spend
  title(ctx, 'Spend in this window', box.x, box.y + 14)
  ctx.font = `600 22px ${FONT}`
  ctx.fillStyle = INK
  ctx.textAlign = 'right'
  ctx.fillText(formatDollars(frame.spendNow), box.x + box.w, box.y + 18)
  ctx.font = `12px ${FONT}`
  ctx.fillStyle = MUTED
  ctx.fillText(`${formatTokens(frame.tokensNow)} tokens`, box.x + box.w, box.y + 36)
  ctx.textAlign = 'left'
  const plot = { x: box.x, y: box.y + 48, w: box.w, h: box.h - 56 }
  roundRect(ctx, plot.x, plot.y, plot.w, plot.h, 8)
  ctx.fillStyle = BODY
  ctx.fill()
  const times = script.spend.times
  const max = Math.max(0.01, script.spend.total[script.spend.total.length - 1] ?? 0)
  const xOf = (i: number): number => plot.x + 8 + ((plot.w - 16) * i) / Math.max(1, times.length - 1)
  const yOf = (v: number): number => plot.y + plot.h - 8 - ((plot.h - 16) * v) / max
  const upTo = frame.spendUpTo
  if (upTo < 2) return
  // Stacked bands, biggest spender at the bottom, each a step lighter.
  const lines = script.spend.lines
  let below = new Array<number>(times.length).fill(0)
  lines.forEach((line, k) => {
    const above = below.map((b, i) => b + line.values[i]!)
    ctx.beginPath()
    for (let i = 0; i < upTo; i += 1) { if (i === 0) ctx.moveTo(xOf(i), yOf(above[i]!)); else ctx.lineTo(xOf(i), yOf(above[i]!)) }
    for (let i = upTo - 1; i >= 0; i -= 1) ctx.lineTo(xOf(i), yOf(below[i]!))
    ctx.closePath()
    ctx.globalAlpha = 0.18 + 0.5 * (1 - k / Math.max(1, lines.length))
    ctx.fillStyle = ACCENT
    ctx.fill()
    ctx.globalAlpha = 1
    below = above
  })
  ctx.beginPath()
  for (let i = 0; i < upTo; i += 1) { if (i === 0) ctx.moveTo(xOf(i), yOf(below[i]!)); else ctx.lineTo(xOf(i), yOf(below[i]!)) }
  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 2
  ctx.stroke()
}

function paintFiles(ctx: Ctx, frame: LapseFrame): void {
  const box = LAPSE_BOXES.files
  title(ctx, 'Files touched', box.x, box.y + 14)
  const max = Math.max(1, ...frame.files.flatMap((f) => f.files.map((t) => t.item.touches)))
  for (const folder of frame.files) {
    const b = folder.box
    roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 6)
    ctx.fillStyle = BODY
    ctx.fill()
    ctx.strokeStyle = EDGE
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.font = `600 11px ${FONT}`
    ctx.fillStyle = MUTED
    ctx.textBaseline = 'middle'
    if (b.w > 40) ctx.fillText(fit(ctx, folder.name, b.w - 12), b.x + 6, b.y + 10)
    for (const { item, box: f } of folder.files) {
      const heat = 0.2 + 0.65 * (item.touches / max)
      // A hot square is light violet, so its words go dark to stay readable.
      const hot = heat > 0.55
      ctx.globalAlpha = heat
      roundRect(ctx, f.x + 1, f.y + 1, f.w - 2, f.h - 2, 4)
      ctx.fillStyle = ACCENT
      ctx.fill()
      ctx.globalAlpha = 1
      if (f.w > 46 && f.h > 18) {
        ctx.font = `11px ${MONO}`
        ctx.fillStyle = hot ? GROUND : INK
        ctx.fillText(fit(ctx, baseName(item.path), f.w - 10), f.x + 5, f.y + 11)
        if (f.h > 32) {
          ctx.fillStyle = hot ? BODY : MUTED
          ctx.fillText(fit(ctx, `${item.touches} touch${item.touches === 1 ? '' : 'es'}${item.edits > 0 ? ` · ${item.edits} edit${item.edits === 1 ? '' : 's'}` : ''}`, f.w - 10), f.x + 5, f.y + 25)
        }
      }
    }
  }
}

function paintLanes(ctx: Ctx, frame: LapseFrame, script: LapseScript): void {
  const box = LAPSE_BOXES.lanes
  title(ctx, 'State over time', box.x, box.y - 6)
  const n = frame.lanes.length
  if (n === 0) return
  const labelW = 150
  const laneH = Math.min(18, box.h / n)
  const xOf = (t: number): number => box.x + labelW + ((box.w - labelW) * (t - script.from)) / Math.max(1, script.to - script.from)
  frame.lanes.forEach((lane, k) => {
    const y = box.y + k * laneH
    ctx.font = `11px ${FONT}`
    ctx.fillStyle = MUTED
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(fit(ctx, lane.name, labelW - 10), box.x, y + laneH / 2)
    ctx.fillStyle = BODY
    ctx.fillRect(box.x + labelW, y + 2, box.w - labelW, laneH - 4)
    for (const seg of lane.segments) {
      ctx.fillStyle = toneColour(seg.tone)
      ctx.globalAlpha = seg.tone === 'idle' ? 0.35 : 0.85
      ctx.fillRect(xOf(seg.from), y + 3, Math.max(1, xOf(seg.to) - xOf(seg.from)), laneH - 6)
      ctx.globalAlpha = 1
    }
    for (const tick of lane.ticks) {
      ctx.fillStyle = tick.kind === 'failed' ? toneColour('exited') : tick.kind === 'edit' ? INK : FAINT
      ctx.fillRect(xOf(tick.at) - 0.5, y + 1, 1.5, laneH - 2)
    }
  })
  const head = xOf(frame.at)
  ctx.fillStyle = INK
  ctx.fillRect(head - 1, box.y - 2, 2, n * laneH + 4)
}

export function paintLapseFrame(ctx: Ctx, frame: LapseFrame, script: LapseScript): void {
  ctx.fillStyle = GROUND
  ctx.fillRect(0, 0, LAPSE_SIZE.w, LAPSE_SIZE.h)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 22px ${FONT}`
  ctx.fillStyle = INK
  ctx.fillText('Fleet wall', 32, 46)
  ctx.font = `13px ${FONT}`
  ctx.fillStyle = MUTED
  ctx.fillText(`time-lapse · ${frame.speed}× · ${clock(script.from)} to ${clock(script.to)}`, 156, 46)
  ctx.textAlign = 'right'
  ctx.font = `600 22px ${MONO}`
  ctx.fillStyle = INK
  ctx.fillText(clock(frame.at), LAPSE_SIZE.w - 32, 46)
  // The progress rule under the header.
  ctx.fillStyle = EDGE
  ctx.fillRect(32, 60, LAPSE_SIZE.w - 64, 2)
  ctx.fillStyle = ACCENT
  ctx.fillRect(32, 60, (LAPSE_SIZE.w - 64) * frame.progress, 2)
  paintTiles(ctx, frame)
  paintSpend(ctx, frame, script)
  paintFiles(ctx, frame)
  paintLanes(ctx, frame, script)
}
