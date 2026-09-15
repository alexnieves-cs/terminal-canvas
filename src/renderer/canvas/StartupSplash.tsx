import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { Viewport } from './viewport'
import { worldToScreen } from './viewport'
import {
  type SplashMode, type Pole, FIELD_MS, GHOST_MS, SKIP_FADE_MS,
  clamp, lerp, easeOut, easeInOut, seg, hash, fieldAt, filingAngle
} from './splash'

/* The startup splash: one <canvas>, one rAF loop, gone in under three seconds.

   TWO LIFETIMES STILL HOLD. This draws over the canvas and touches nothing
   under it — no panel, no session, no camera — so an early unmount (a skip,
   a workspace switch) can cost a frame of motion and never a process.

   Input is watched in CAPTURE and never prevented or stopped: a key pressed
   during the splash both ends it and reaches whatever it was aimed at. */

interface Rect { x: number; y: number; w: number; h: number }
interface Colors { ground: string; surface: string; fg: string; fg3: string; fg4: string; line: string; lineS: string; iris: string; blue: string }

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
const UI = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
const GHOST_CAP = 60

function readColors(el: Element): Colors {
  const s = getComputedStyle(el), g = (n: string): string => s.getPropertyValue(n).trim()
  return { ground: g('--s-0'), surface: g('--s-1'), fg: g('--fg'), fg3: g('--fg-3'), fg4: g('--fg-4'),
    line: g('--line'), lineS: g('--line-strong'), iris: g('--iris'), blue: g('--blue') || g('--iris') }
}

export function StartupSplash({ mode, rects, viewport, onDone }: {
  mode: Exclude<SplashMode, 'none'>
  /** The restored panels, world space. Read once at mount: the ghost traces the layout you LEFT. */
  rects: readonly Rect[]
  viewport: Viewport
  onDone: () => void
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  // Mount-time snapshots: a pan during the 0.8 s ghost must not re-trace.
  const start = useRef({ rects, viewport, onDone })
  start.current.onDone = onDone

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) { start.current.onDone(); return }
    const dur = mode === 'field' ? FIELD_MS : GHOST_MS
    let w = 0, h = 0, raf = 0, frame = 0, skipAt: number | null = null, done = false
    let col = readColors(cv)
    const t0 = performance.now()
    const resize = (): void => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
      w = r.width; h = r.height; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    const skip = (): void => { if (skipAt === null) skipAt = performance.now() }
    const opts = { capture: true, passive: true } as const
    window.addEventListener('keydown', skip, opts)
    window.addEventListener('pointerdown', skip, opts)
    window.addEventListener('wheel', skip, opts)

    const loop = (now: number): void => {
      if (done) return
      // The theme is stamped in an effect after first render (useTheme), so
      // the first frames re-read rather than caching the pre-theme tokens.
      if (frame++ < 10 || frame % 20 === 0) col = readColors(cv)
      const t = (now - t0) / 1000
      const fade = skipAt === null ? 1 : 1 - clamp((now - skipAt) / SKIP_FADE_MS)
      ctx.clearRect(0, 0, w, h)
      ctx.globalAlpha = 1
      if (mode === 'field') drawField(ctx, t, w, h, col, fade)
      else drawGhost(ctx, t, w, h, col, fade, start.current.rects, start.current.viewport)
      // The inline ground covered the frames before this one; the scene paints its own from here.
      if (frame === 1) cv.style.background = 'transparent'
      if (fade <= 0 || now - t0 >= dur) { done = true; start.current.onDone(); return }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      done = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', skip, opts)
      window.removeEventListener('pointerdown', skip, opts)
      window.removeEventListener('wheel', skip, opts)
    }
  }, [mode])

  return (
    <canvas ref={ref} className="startup-splash" aria-hidden="true"
      // An opaque ground until the first rAF draw: a transparent canvas would
      // show the very canvas it covers for a frame — possibly the ready-to-show one.
      style={{ pointerEvents: mode === 'field' ? 'auto' : 'none', background: 'var(--s-0)' }} />
  )
}

// ---- Last-Session Ghost: your layout traces itself, then the veil lifts. ----
function drawGhost(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, col: Colors, fade: number,
  rects: readonly Rect[], vp: Viewport): void {
  ctx.globalAlpha = fade * (1 - easeInOut(seg(t, 0.35, 0.8)))
  ctx.fillStyle = col.ground
  ctx.fillRect(0, 0, w, h)
  const trace = easeOut(seg(t, 0, 0.5))
  const lift = 1 - seg(t, 0.55, 0.8)
  ctx.strokeStyle = col.iris
  ctx.lineWidth = 1.5
  let drawn = 0
  for (const r of rects) {
    if (drawn >= GHOST_CAP) break
    const a = worldToScreen({ x: r.x, y: r.y }, vp)
    const sw = r.w * vp.scale, sh = r.h * vp.scale
    if (a.x > w || a.y > h || a.x + sw < 0 || a.y + sh < 0) continue
    // Stagger by position, left to right, so the layout reads as drawn.
    const k = clamp(trace * 1.6 - (a.x / Math.max(1, w)) * 0.6)
    if (k <= 0) { drawn++; continue }
    const per = 2 * (sw + sh)
    ctx.globalAlpha = fade * lift * 0.9
    ctx.setLineDash([per * k, per])
    ctx.beginPath()
    ctx.roundRect(a.x, a.y, sw, sh, 8 * vp.scale)
    ctx.stroke()
    drawn++
  }
  ctx.setLineDash([])
}

// ---- Field Lines: filings align to two poles that unfold into a connected pair. ----
// Meta words are tool names, never state words: panel-state.ts owns those (verify:rail state.2).
const PANEL_A = { title: 'agent', meta: 'claude', lines: ['> migrate auth to sessions', 'reading src/auth/*.ts', 'planned 4 edits'] }
const PANEL_B = { title: 'terminal', meta: 'zsh', lines: ['$ npm test', '  ✓ 128 passing', '$ git status'] }

function drawField(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, col: Colors, fade: number): void {
  // The canvas is FLAT (M67) — no dot grid — so the scene does not end on
  // one: the ground is laid over the aura and lifts with the release.
  const release = easeInOut(seg(t, 2.1, 2.8))
  ctx.globalAlpha = fade * (1 - release)
  ctx.fillStyle = col.ground
  ctx.fillRect(0, 0, w, h)

  const pw = Math.min(w * 0.26, 360), ph = Math.min(h * 0.34, 240)
  const A: Pole = { x: lerp(-w * 0.15, w * 0.3, easeInOut(seg(t, 0.1, 1.0))), y: h * 0.47, q: 1 }
  const B: Pole = { x: lerp(w * 1.15, w * 0.7, easeInOut(seg(t, 0.2, 1.1))), y: h * 0.53, q: -1 }
  const poles = [A, B]
  const unfold = easeOut(seg(t, 1.2, 1.75))
  const r0 = w * 0.11, sp = 22

  ctx.lineCap = 'round'
  const settle = 1 - easeOut(seg(t, 0.4, 1.6))
  for (let gx = sp / 2, ix = 0; gx < w; gx += sp, ix++) {
    for (let gy = sp / 2, iy = 0; gy < h; gy += sp, iy++) {
      const s = ix * 13.1 + iy * 7.7
      const x = gx + (hash(s + 1) - 0.5) * 14 * settle, y = gy + (hash(s + 2) - 0.5) * 14 * settle
      if (unfold > 0 && (inside(x, y, A, pw * unfold, ph * unfold) || inside(x, y, B, pw * unfold, ph * unfold))) continue
      const f = fieldAt(poles, x, y, r0)
      const mag = Math.hypot(f.x, f.y)
      const dist = Math.hypot(x - w / 2, y - h / 2) / w
      const d = hash(s + 3)
      const k = easeOut(seg(t, 0.25 + dist * 0.7 + d * 0.12, 0.8 + dist * 0.7 + d * 0.12))
      const a = filingAngle(hash(s) * Math.PI, Math.atan2(f.y, f.x), k)
      const len = lerp(6, clamp(3 + mag * 5, 3, 15), k)
      const strength = clamp(mag / 1.4) * k
      ctx.globalAlpha = fade * (1 - release) * lerp(0.28, 0.95, strength)
      ctx.strokeStyle = strength > 0.45 ? col.iris : col.fg3
      ctx.lineWidth = lerp(1, 1.6, strength)
      const cx = Math.cos(a) * len / 2, cy = Math.sin(a) * len / 2
      ctx.beginPath(); ctx.moveTo(x - cx, y - cy); ctx.lineTo(x + cx, y + cy); ctx.stroke()
    }
  }

  // The poles glow until they unfold.
  const glow = (1 - unfold) * easeOut(seg(t, 0.1, 0.6))
  for (const [p, c] of [[A, col.iris], [B, col.blue]] as const) {
    if (glow <= 0) break
    ctx.globalAlpha = fade * glow
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill()
  }

  if (unfold > 0) {
    const panelAlpha = fade * clamp(unfold * 1.4) * (1 - release)
    miniPanel(ctx, A, pw * unfold, ph * unfold, PANEL_A, col, panelAlpha, seg(t, 1.6, 2.2), true)
    miniPanel(ctx, B, pw * unfold, ph * unfold, PANEL_B, col, panelAlpha, seg(t, 1.6, 2.2), false)
    wire(ctx, { x: A.x + pw / 2, y: A.y + 20 }, { x: B.x - pw / 2, y: B.y - 10 },
      easeOut(seg(t, 1.7, 2.05)), seg(t, 1.95, 2.4), col, panelAlpha)
  }
}

function inside(x: number, y: number, c: Pole, pw: number, ph: number): boolean {
  return Math.abs(x - c.x) < pw / 2 + 8 && Math.abs(y - c.y) < ph / 2 + 8
}

function miniPanel(ctx: CanvasRenderingContext2D, c: Pole, pw: number, ph: number,
  p: { title: string; meta: string; lines: string[] }, col: Colors, alpha: number, type: number, working: boolean): void {
  if (alpha <= 0 || pw < 4) return
  const x = c.x - pw / 2, y = c.y - ph / 2, hh = 26
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.roundRect(x, y, pw, ph, 9)
  ctx.fillStyle = col.surface; ctx.fill()
  ctx.lineWidth = 1; ctx.strokeStyle = col.lineS; ctx.stroke()
  if (ph < hh + 10) return
  ctx.beginPath(); ctx.moveTo(x, y + hh); ctx.lineTo(x + pw, y + hh); ctx.strokeStyle = col.line; ctx.stroke()
  ctx.fillStyle = working ? col.iris : col.fg4
  ctx.beginPath(); ctx.arc(x + 13, y + hh / 2, 3.5, 0, Math.PI * 2); ctx.fill()
  if (pw < 150) return
  ctx.textBaseline = 'middle'
  ctx.font = `600 11.5px ${UI}`; ctx.fillStyle = col.fg; ctx.fillText(p.title, x + 24, y + hh / 2)
  ctx.font = `11px ${MONO}`; ctx.fillStyle = col.fg4; ctx.textAlign = 'right'
  ctx.fillText(p.meta, x + pw - 10, y + hh / 2); ctx.textAlign = 'left'
  ctx.font = `11.5px ${MONO}`
  p.lines.forEach((line, i) => {
    const reveal = clamp(type * p.lines.length - i)
    const ly = y + hh + 16 + i * 17
    if (reveal <= 0 || ly > y + ph - 8) return
    ctx.fillStyle = /^[>$]/.test(line) ? col.fg : col.fg3
    ctx.fillText(line.slice(0, Math.ceil(line.length * reveal)), x + 12, ly)
  })
}

function wire(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number },
  k: number, pulse: number, col: Colors, alpha: number): void {
  if (k <= 0 || alpha <= 0) return
  const mx = (a.x + b.x) / 2
  const at = (u: number): [number, number] => {
    const iu = 1 - u
    return [iu * iu * iu * a.x + 3 * iu * iu * u * mx + 3 * iu * u * u * mx + u * u * u * b.x,
      iu * iu * iu * a.y + 3 * iu * iu * u * a.y + 3 * iu * u * u * b.y + u * u * u * b.y]
  }
  ctx.globalAlpha = alpha
  ctx.strokeStyle = col.iris; ctx.lineWidth = 2; ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i <= 40; i++) { const [x, y] = at((i / 40) * k); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) }
  ctx.stroke()
  if (pulse > 0 && pulse < 1) {
    const [x, y] = at(pulse)
    ctx.fillStyle = col.iris
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill()
  }
}
