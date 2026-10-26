import { STATE_PALETTE, TONE_TO_TOKEN } from '@shared/state-palette'
import type { StateTone } from '@shared/redesign-contracts'
import { FILM_CAPTION_BAND, FILM_SIZE, type FilmFrame, type FilmQueueLine, type FilmScript } from '@shared/night-film'

/**
 * M562 (lane L). Paints one film frame onto a 2D context.
 *
 * Everything it draws comes from the frame and the script — a panel's name,
 * a caption, the queue — and every one of those words passed `outward` when
 * the script was built. This file draws no word of its own beyond the
 * film's fixed chrome, and reads nothing from the live canvas, which is what
 * lets a film leave the app without a capture of a terminal in it.
 *
 * State colour is the one palette (`state-palette.ts`), through the tone;
 * the ground and the panel bodies are the dark theme's neutrals.
 */

/** The 2D calls this needs — an OffscreenCanvas's and an HTMLCanvasElement's contexts both fit. */
export type FilmContext = Pick<CanvasRenderingContext2D,
  'fillStyle' | 'strokeStyle' | 'lineWidth' | 'globalAlpha' | 'font' | 'textBaseline' | 'textAlign'
  | 'fillRect' | 'beginPath' | 'moveTo' | 'arcTo' | 'closePath' | 'fill' | 'stroke' | 'fillText' | 'measureText'
  | 'save' | 'restore' | 'arc'>

const GROUND = '#0D1015'
const DOT = '#1A1F28'
const BODY = '#161B23'
const EDGE = '#262D39'
const INK = '#E6E9EF'
const MUTED = '#9AA1AE'
const TRACK = '#4A5262'
const SCRIM = 'rgba(8, 10, 14, 0.82)'
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif'

const toneColour = (tone: StateTone): string => STATE_PALETTE.dark[TONE_TO_TOKEN[tone]]

const QUEUE_TONE: Record<FilmQueueLine['kind'], StateTone> = { failed: 'exited', decision: 'needs-you', checked: 'done', review: 'idle', claimed: 'idle' }

function roundRect(ctx: FilmContext, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** Shortens `text` with an ellipsis until it fits `max` pixels. */
function fitText(ctx: FilmContext, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1)
  return `${s}…`
}

/** Up to `lines` lines of `text` at most `max` pixels wide; the last one ends in an ellipsis when the text runs on. */
function wrap(ctx: FilmContext, text: string, max: number, lines: number): string[] {
  const out: string[] = []
  let line = ''
  const words = text.split(' ')
  for (let i = 0; i < words.length; i += 1) {
    const next = line === '' ? words[i]! : `${line} ${words[i]}`
    if (ctx.measureText(next).width <= max || line === '') { line = next; continue }
    out.push(line)
    line = words[i]!
    if (out.length === lines - 1) { out.push(fitText(ctx, words.slice(i).join(' '), max)); return out }
  }
  if (line !== '') out.push(fitText(ctx, line, max))
  return out
}

function dot(ctx: FilmContext, x: number, y: number, r: number, colour: string): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = colour
  ctx.fill()
}

export function paintFilmFrame(ctx: FilmContext, frame: FilmFrame, script: FilmScript): void {
  const { w: W, h: H } = FILM_SIZE
  const { camera } = frame
  const ox = W / 2
  const oy = (H - FILM_CAPTION_BAND) / 2 + 24
  const sx = (x: number): number => ox + (x - camera.cx) * camera.scale
  const sy = (y: number): number => oy + (y - camera.cy) * camera.scale

  ctx.save()
  ctx.globalAlpha = 1
  ctx.fillStyle = GROUND
  ctx.fillRect(0, 0, W, H)

  // The canvas's dot grid, in world space so it moves with the camera.
  const step = 48 * camera.scale >= 14 ? 48 : 192
  const gx0 = Math.floor((camera.cx - ox / camera.scale) / step) * step
  const gy0 = Math.floor((camera.cy - oy / camera.scale) / step) * step
  ctx.fillStyle = DOT
  for (let gx = gx0; sx(gx) < W; gx += step) {
    for (let gy = gy0; sy(gy) < H; gy += step) ctx.fillRect(sx(gx) - 1, sy(gy) - 1, 2, 2)
  }

  for (const p of frame.panels) {
    if (p.opacity <= 0) continue
    const x = sx(p.rect.x)
    const y = sy(p.rect.y)
    const w = p.rect.w * camera.scale
    const h = p.rect.h * camera.scale
    if (x > W || y > H || x + w < 0 || y + h < 0) continue
    const colour = toneColour(p.tone)
    ctx.globalAlpha = p.opacity
    if (p.focus > 0) {
      ctx.globalAlpha = p.opacity * p.focus * 0.35
      roundRect(ctx, x - 8, y - 8, w + 16, h + 16, 18)
      ctx.fillStyle = colour
      ctx.fill()
      ctx.globalAlpha = p.opacity
    }
    roundRect(ctx, x, y, w, h, 12)
    ctx.fillStyle = BODY
    ctx.fill()
    ctx.lineWidth = p.focus > 0 ? 2 + p.focus * 2 : 1.5
    ctx.strokeStyle = p.tone === 'idle' ? EDGE : colour
    ctx.stroke()
    // The name and kind at a fixed size, the way a zoomed-out card reads.
    if (w > 60 && h > 36) {
      dot(ctx, x + 16, y + 20, 5, colour)
      ctx.font = `600 15px ${FONT}`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillStyle = INK
      ctx.fillText(fitText(ctx, p.label, w - 40), x + 28, y + 20)
      if (h > 60) {
        ctx.font = `400 12px ${FONT}`
        ctx.fillStyle = MUTED
        ctx.fillText(fitText(ctx, p.kind, w - 40), x + 28, y + 40)
      }
      // The last thing said about it, so a card that is not on screen still tells its night.
      if (p.line !== undefined && h > 100) {
        ctx.font = `400 14px ${FONT}`
        ctx.fillStyle = INK
        wrap(ctx, p.line, w - 44, 3).forEach((l, i) => ctx.fillText(l, x + 28, y + 72 + i * 20))
      }
    }
  }
  ctx.globalAlpha = 1

  // The chrome: the film's name, the night's clock, and a progress line.
  ctx.font = `600 14px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = MUTED
  ctx.fillText('Last night', 28, 32)
  ctx.textAlign = 'right'
  ctx.font = `600 22px ${FONT}`
  ctx.fillStyle = INK
  ctx.fillText(frame.clock, W - 28, 34)
  ctx.fillStyle = EDGE
  ctx.fillRect(0, H - 4, W, 4)
  ctx.fillStyle = TRACK
  ctx.fillRect(0, H - 4, W * frame.progress, 4)

  if (frame.caption !== null && frame.caption.alpha > 0) {
    ctx.globalAlpha = frame.caption.alpha
    ctx.font = `500 22px ${FONT}`
    ctx.textAlign = 'left'
    const text = fitText(ctx, frame.caption.text, W - 200)
    const tw = ctx.measureText(text).width
    const bx = (W - tw) / 2 - 36
    const by = H - FILM_CAPTION_BAND + 28
    roundRect(ctx, bx, by, tw + 72, 52, 26)
    ctx.fillStyle = SCRIM
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = toneColour(frame.caption.tone)
    ctx.stroke()
    dot(ctx, bx + 26, by + 26, 6, toneColour(frame.caption.tone))
    ctx.fillStyle = INK
    ctx.fillText(text, bx + 44, by + 27)
    ctx.globalAlpha = 1
  }

  if (frame.card > 0) paintCard(ctx, frame, script)
  ctx.restore()
}

function paintCard(ctx: FilmContext, frame: FilmFrame, script: FilmScript): void {
  const { w: W, h: H } = FILM_SIZE
  ctx.globalAlpha = frame.card
  ctx.fillStyle = SCRIM
  ctx.fillRect(0, 0, W, H - 4)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (frame.scene === 'title') {
    ctx.font = `700 64px ${FONT}`
    ctx.fillStyle = INK
    ctx.fillText(script.title, W / 2, H / 2 - 28)
    ctx.font = `500 24px ${FONT}`
    ctx.fillStyle = MUTED
    ctx.fillText(script.subtitle, W / 2, H / 2 + 34)
  } else if (frame.scene === 'queue') {
    ctx.font = `700 34px ${FONT}`
    ctx.fillStyle = INK
    ctx.fillText(script.queue.length === 0 ? 'Nothing is waiting on you' : 'This morning, in this order', W / 2, 150)
    ctx.textAlign = 'left'
    ctx.font = `500 21px ${FONT}`
    const left = 200
    script.queue.forEach((line, i) => {
      const y = 230 + i * 56
      dot(ctx, left, y, 7, toneColour(QUEUE_TONE[line.kind]))
      ctx.fillStyle = INK
      ctx.fillText(fitText(ctx, `${i + 1}. ${line.text}`, W - left * 2 - 24), left + 24, y + 1)
    })
    if (script.queueMore > 0) {
      ctx.fillStyle = MUTED
      ctx.fillText(`and ${script.queueMore} more`, left + 24, 230 + script.queue.length * 56)
    }
  } else if (frame.scene === 'end') {
    ctx.font = `700 40px ${FONT}`
    ctx.fillStyle = INK
    ctx.fillText('Terminal Canvas', W / 2, H / 2 - 20)
    const notes = [
      `${script.fromWords} – ${script.toWords}`,
      ...(script.dropped === 0 ? [] : [`${script.dropped} more moment${script.dropped === 1 ? '' : 's'} not shown`]),
      ...(script.redacted === 0 ? [] : [`${script.redacted} secret${script.redacted === 1 ? '' : 's'} redacted`])
    ]
    ctx.font = `500 20px ${FONT}`
    ctx.fillStyle = MUTED
    ctx.fillText(notes.join(' · '), W / 2, H / 2 + 30)
  }
  ctx.globalAlpha = 1
}
