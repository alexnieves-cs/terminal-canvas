/**
 * Remote selections and cursors, painted onto ONE 2D canvas in screen space.
 * Pure over its inputs (no DOM reads, no React), so the geometry is the
 * viewport's own world→screen transform and nothing else.
 */
import type { RemotePeer } from '@shared/presence'

export interface PaintRect { id: string; x: number; y: number; w: number; h: number }
export interface PaintViewport { x: number; y: number; scale: number }

const toScreen = (vp: PaintViewport, x: number, y: number): [number, number] => [x * vp.scale + vp.x, y * vp.scale + vp.y]

export function paintPresence(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number; dpr: number },
  peers: readonly RemotePeer[],
  vp: PaintViewport,
  rects: ReadonlyMap<string, PaintRect>,
  font: string
): void {
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  ctx.clearRect(0, 0, size.w, size.h)
  for (const peer of peers) {
    // A peer that left keeps its roster cell until offline, but its selection
    // and cursor are claims about NOW, and a departed peer makes none.
    if (!peer.live) continue
    const { color, selection, cursor, displayName } = peer.presence
    const idle = peer.status === 'idle'
    ctx.globalAlpha = idle ? 0.45 : 1
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.setLineDash(idle ? [4, 4] : [])
    for (const id of selection) {
      const r = rects.get(id)
      if (r === undefined) continue
      const [sx, sy] = toScreen(vp, r.x, r.y)
      ctx.strokeRect(sx - 3, sy - 3, r.w * vp.scale + 6, r.h * vp.scale + 6)
    }
    ctx.setLineDash([])
    if (cursor === null) continue
    const [cx, cy] = toScreen(vp, cursor.x, cursor.y)
    if (cx < -40 || cy < -40 || cx > size.w + 40 || cy > size.h + 40) continue
    // The arrow: the macOS pointer's silhouette, filled in the peer's colour.
    ctx.beginPath()
    ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 16); ctx.lineTo(cx + 4.5, cy + 12); ctx.lineTo(cx + 11, cy + 12); ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(0,0,0,.35)'
    ctx.stroke()
    ctx.font = font
    const label = displayName
    const w = ctx.measureText(label).width + 10
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(cx + 10, cy + 14, w, 18, 4)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, cx + 15, cy + 23)
  }
  ctx.globalAlpha = 1
}
