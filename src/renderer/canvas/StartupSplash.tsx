import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { JSX } from 'react'
import { noteRestoreFailure } from '../session/boot-issues'
import type { Viewport } from './viewport'
import { worldToScreen } from './viewport'
import {
  type SplashMode, FIELD_MS, GHOST_MS, SKIP_FADE_MS,
  clamp, lerp, easeOut, easeInOut, seg, hash, filingAngle,
  ghostLayout, restoreLines, splashShouldLeave, RESTORE_SKIP_HINT, RESTORE_TAGLINE,
  type GhostRect, type RestoreFacts
} from './splash'
import { Onboarding, type OnboardingProps } from '../onboarding/Onboarding'
import { BlankCanvas } from '../shell/EmptyState'

/* The startup splash: one <canvas>, one rAF loop, gone in under three seconds.

   TWO LIFETIMES STILL HOLD. This draws over the canvas and touches nothing
   under it — no panel, no session, no camera — so an early unmount (a skip,
   a workspace switch) can cost a frame of motion and never a process.

   Input is watched in CAPTURE. A pointer or wheel skip passes through, but a
   plain key is CONSUMED for as long as the splash is up (the fade included):
   the first keystroke is almost always "get me past this", and forwarding it
   typed a stray character into the first-run launcher's field underneath.
   A chord (Cmd/Ctrl/Alt) still passes, so Cmd+Q or the palette never go dead. */

interface Rect { x: number; y: number; w: number; h: number }
interface Colors { ground: string; surface: string; fg: string; fg3: string; fg4: string; line: string; lineS: string; iris: string; blue: string }

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
      const pw = Math.round(r.width * dpr), ph = Math.round(r.height * dpr)
      w = r.width; h = r.height
      // Assigning width/height CLEARS the bitmap even at the same size, and
      // the observer's first callback lands after the first draw — once the
      // CSS ground has gone transparent — so an unconditional reset showed
      // the app for one frame before the splash.
      if (cv.width === pw && cv.height === ph) return
      cv.width = pw; cv.height = ph
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    const skip = (): void => { if (skipAt === null) skipAt = performance.now() }
    const skipKey = (e: KeyboardEvent): void => {
      skip()
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    const opts = { capture: true, passive: true } as const
    const keyOpts = { capture: true } as const
    window.addEventListener('keydown', skipKey, keyOpts)
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
      if (frame === 3) cv.style.background = 'transparent'
      if (fade <= 0 || now - t0 >= dur) { done = true; start.current.onDone(); return }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      done = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', skipKey, keyOpts)
      window.removeEventListener('pointerdown', skip, opts)
      window.removeEventListener('wheel', skip, opts)
    }
  }, [mode])

  // PORTALLED to <body> and fixed to the window: mounted inside the canvas
  // host it covered only the canvas region, so the title bar and rails were
  // on screen before the splash and APEX centred on the canvas, not the window.
  return createPortal(
    <canvas ref={ref} className="startup-splash" data-screen-control="" aria-hidden="true"
      // An opaque ground until the first rAF draw: a transparent canvas would
      // show the very canvas it covers for a frame — possibly the ready-to-show one.
      style={{ pointerEvents: mode === 'field' ? 'auto' : 'none', background: 'var(--s-0)' }} />,
    document.body
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

// ---- Field Lines: the filing lattice magnetises into the word APEX, then lets go. ----
// The word is rasterised once per size into a coarse mask. Its BLURRED copy is
// a soft potential: the gradient points across a stroke, so a filing turned 90°
// from it lies ALONG the stroke inside a letter and wraps the letter outside
// it, the way iron filings trace a magnet's contour.
const WORD = 'APEX'
const DS = 4 // mask cell, px — coarse enough to build in a frame, fine enough for 12px filings

interface WordMap { w: number; h: number; mw: number; mh: number; ink: Float32Array; soft: Float32Array; left: number; right: number }
let wordCache: WordMap | null = null

function wordMap(w: number, h: number): WordMap | null {
  if (wordCache && wordCache.w === w && wordCache.h === h) return wordCache
  const mw = Math.max(1, Math.ceil(w / DS)), mh = Math.max(1, Math.ceil(h / DS))
  const oc = document.createElement('canvas')
  oc.width = mw; oc.height = mh
  const o = oc.getContext('2d', { willReadFrequently: true })
  if (!o) return null
  let size = Math.min(h * 0.3, 260) / DS
  o.font = `800 ${size}px ${UI}`
  const fit = (w * 0.62 / DS) / Math.max(1, o.measureText(WORD).width)
  if (fit < 1) { size *= fit; o.font = `800 ${size}px ${UI}` }
  o.textAlign = 'center'; o.textBaseline = 'middle'
  const tw = o.measureText(WORD).width
  const draw = (blur: number): Float32Array => {
    o.clearRect(0, 0, mw, mh)
    o.filter = blur > 0 ? `blur(${blur}px)` : 'none'
    o.fillStyle = '#fff'
    o.fillText(WORD, mw / 2, mh / 2)
    const d = o.getImageData(0, 0, mw, mh).data, out = new Float32Array(mw * mh)
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] / 255
    return out
  }
  const ink = draw(0), soft = draw(Math.max(2, size * 0.09))
  wordCache = { w, h, mw, mh, ink, soft, left: (mw / 2 - tw / 2) * DS, right: (mw / 2 + tw / 2) * DS }
  return wordCache
}

const at = (m: WordMap, a: Float32Array, x: number, y: number): number => {
  const i = Math.min(m.mw - 1, Math.max(0, Math.floor(x / DS))), j = Math.min(m.mh - 1, Math.max(0, Math.floor(y / DS)))
  return a[j * m.mw + i]
}

function drawField(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, col: Colors, fade: number): void {
  const m = wordMap(w, h)
  // The canvas is FLAT (M67) — no dot grid — so the scene does not end on one:
  // the ground lifts WITH the filings, and the app is simply what was under it.
  const release = easeInOut(seg(t, 2.05, 2.8))
  ctx.globalAlpha = fade * (1 - release)
  ctx.fillStyle = col.ground
  ctx.fillRect(0, 0, w, h)
  if (!m) return

  const sp = 12
  const settle = 1 - easeOut(seg(t, 0.2, 1.3))
  ctx.lineCap = 'round'
  for (let gx = sp / 2, ix = 0; gx < w; gx += sp, ix++) {
    for (let gy = sp / 2, iy = 0; gy < h; gy += sp, iy++) {
      const s = ix * 13.1 + iy * 7.7
      const x = gx + (hash(s + 1) - 0.5) * 10 * settle, y = gy + (hash(s + 2) - 0.5) * 10 * settle
      const ink = at(m, m.ink, x, y), pot = at(m, m.soft, x, y)
      // Gradient of the soft mask; the filing lies perpendicular to it.
      const gxv = at(m, m.soft, x + DS, y) - at(m, m.soft, x - DS, y)
      const gyv = at(m, m.soft, x, y + DS) - at(m, m.soft, x, y - DS)
      const grad = Math.hypot(gxv, gyv)
      const field = grad > 1e-3 ? Math.atan2(gyv, gxv) + Math.PI / 2 : hash(s) * Math.PI
      // Alignment sweeps out from the word, so the letters read first.
      const dist = Math.hypot(x - w / 2, (y - h / 2) * 1.6) / w
      const d = hash(s + 3)
      const k = easeOut(seg(t, 0.15 + dist * 0.8 + d * 0.1, 0.75 + dist * 0.8 + d * 0.1))
      const a = filingAngle(hash(s) * Math.PI, field, k * (grad > 1e-3 ? 1 : 0))
      // The letters light left to right; everything else stays a quiet field.
      const lit = ink > 0.5 ? easeOut(seg(t, 0.55 + clamp((x - m.left) / Math.max(1, m.right - m.left)) * 0.5, 1.15 + clamp((x - m.left) / Math.max(1, m.right - m.left)) * 0.5)) : 0
      const near = clamp(pot * 1.8) * k
      // On release the letters' filings shorten into points last, so APEX is the final thing seen.
      const out = ink > 0.5 ? easeInOut(seg(t, 2.2, 2.75)) : easeInOut(seg(t, 1.95, 2.45))
      const len = lerp(5, lerp(4 + near * 7, 10, lit), k) * (1 - out)
      if (len < 0.4) continue
      ctx.globalAlpha = fade * (1 - out) * lerp(lerp(0.16, 0.5, near), 1, lit)
      ctx.strokeStyle = lit > 0.35 ? col.iris : col.fg3
      ctx.lineWidth = lerp(1, 1.8, lit)
      const cx = Math.cos(a) * len / 2, cy = Math.sin(a) * len / 2
      ctx.beginPath(); ctx.moveTo(x - cx, y - cy); ctx.lineTo(x + cx, y + cy); ctx.stroke()
    }
  }
}

/**
 * M439. The restore card. It leaves in the same effect that sees `settled`,
 * with no timer: a minimum display time would report progress that had
 * already finished. Option skips the remaining reattaches; the model marks
 * those panes asleep and the caller (the composition root, R-019) applies it.
 */
export function RestoreSplash({ facts, rects, onDone, onSkip }: {
  facts: RestoreFacts
  rects?: readonly GhostRect[]
  onDone?: () => void
  onSkip?: () => void
}): JSX.Element {
  const view = restoreLines(facts)
  const ghosts = ghostLayout(rects)
  const noted = useRef(false)
  useEffect(() => {
    if (!view.failed || noted.current) return
    const sentence = view.lines.find((line) => line.phase === 'failed')?.detail
    if (sentence === undefined) return
    noted.current = true
    noteRestoreFailure(sentence)
  }, [view.failed, view.lines])
  useEffect(() => {
    if (splashShouldLeave({ settled: view.settled, shownForMs: 0 })) onDone?.()
  }, [view.settled, onDone])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.altKey) onSkip?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])
  return createPortal(
    <div className="rd-splash" data-rd-splash="" data-breathing={view.breathing ? 'true' : 'false'} data-settled={view.settled ? 'true' : 'false'} role="status" aria-live="polite">
      <div className="rd-splash__ghosts" aria-hidden="true">
        {ghosts.map((box, i) => (
          <span key={i} className="rd-splash__ghost" style={{ left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />
        ))}
      </div>
      <div className="rd-splash__card">
        <div className="rd-splash__brand">
          <span className="rd-splash__grid" aria-hidden="true" />
          <span>Terminal Canvas</span>
        </div>
        <p className="rd-splash__tagline">{RESTORE_TAGLINE}</p>
        <ol className="rd-splash__lines">
          {view.lines.map((line) => (
            <li key={line.id} data-restore-line={line.id} data-phase={line.phase}>
              <span className="rd-splash__mark" data-phase={line.phase} aria-hidden="true" />
              <span className="rd-splash__label">
                {line.label}
                {line.name !== undefined && <span className="rd-splash__name"> · {line.name}</span>}
              </span>
              {line.detail !== undefined && <span className="rd-splash__detail">{line.detail}</span>}
            </li>
          ))}
        </ol>
        <p className="rd-splash__hint">{RESTORE_SKIP_HINT}</p>
      </div>
    </div>,
    document.body
  )
}

/* The shot door. Canvas already imports this module, so the three screens
   can paint before Canvas itself mounts them (R-021). Later milestones add
   keys; an unknown scene returns false rather than painting a stand-in. */
const rdScenes: Record<string, (fixture: RdFixture) => JSX.Element> = {
  splash: (fixture) => <RestoreSplash facts={fixture.facts ?? {}} rects={fixture.rects} />,
  onboarding: (fixture) => <Onboarding {...(fixture.onboard ?? {})} />,
  empty: (fixture) => <BlankCanvas workspace={fixture.empty?.workspace ?? ''} repo={fixture.empty?.repo} />
}

let shotRoot: Root | null = null

export interface RdFixture {
  facts?: RestoreFacts
  rects?: GhostRect[]
  onboard?: OnboardingProps
  empty?: { workspace: string; repo?: string | null }
}

export function mountRdScene(scene: string, fixture: RdFixture): boolean {
  const render = rdScenes[scene]
  if (render === undefined || typeof document === 'undefined') return false
  let host = document.getElementById('rd-la-shot')
  if (host === null) {
    host = document.createElement('div')
    host.id = 'rd-la-shot'
    document.body.appendChild(host)
  }
  if (shotRoot === null) shotRoot = createRoot(host)
  shotRoot.render(render(fixture))
  return true
}

if (typeof window !== 'undefined') {
  const w = window as unknown as { __rdLA?: { mount: typeof mountRdScene } }
  w.__rdLA = { mount: mountRdScene }
}
