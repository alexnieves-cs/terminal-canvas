/**
 * M93. ANNOTATIONS — labels in the canvas's margins, pure over the workspace.
 *
 * Two anchors and nothing else: a WORLD point (the note stays where the
 * canvas is) and a PANEL offset (the note moves with its panel and dies with
 * it). A note is layout, never session state: `registry.version()` carries
 * nothing of it, and the record rules are the workspace's — absent on every
 * pre-M93 file, a malformed entry dropped by name, an orphaned panel anchor
 * dropped with the rest kept, the cap keeping the NEWEST.
 */

export interface WorldAnchor { kind: 'world'; x: number; y: number }
export interface PanelAnchor { kind: 'panel'; panelId: string; dx: number; dy: number }
export type AnnotationAnchor = WorldAnchor | PanelAnchor

export interface Annotation {
  id: string
  text: string
  anchor: AnnotationAnchor
  /**
   * M155. INK: a freehand stroke. Points are RELATIVE to the ANCHOR POINT —
   * what `annotationPoint` answers (a world anchor's own x,y; a panel anchor's
   * rect + dx,dy) — so the painter adds the point and nothing else, and a
   * panel-anchored stroke follows its panel through `annotationPoint`
   * unchanged. (The first cut said "the panel's top-left" here and stored
   * points from it, so the painter added dx,dy TWICE and every stroke drawn
   * on a panel sat offset by its own start — the M155 critic; the golden
   * showed it.) At most INK_POINTS_MAX points; over the cap the record is
   * dropped by name. `width` is a WORLD width — ink thins as the
   * camera pulls back (#15's own recommendation, chosen). Absent on every
   * M93 label; `text` is '' for ink (one record shape, one parser).
   */
  ink?: { points: Array<[number, number]>; width: number }
}

/** M155. One world width for this milestone; a palette of widths is #15's next slice. */
export const INK_WIDTH = 3
/** M155. Points per stroke: a minute of scribble at a far zoom is thousands, and two hundred such strokes is a layout file read on every launch. */
export const INK_POINTS_MAX = 2000

/** Newest kept. Two hundred is more than a canvas can read and fewer than a runaway loop writes. */
export const ANNOTATIONS_MAX = 200

interface RectLike { rect: { id: string; x: number; y: number; w: number; h: number } }

/** Where a note is drawn, in world units; null when its panel is gone. */
export function annotationPoint(a: Annotation, panels: readonly RectLike[]): { x: number; y: number } | null {
  const anchor = a.anchor
  if (anchor.kind === 'world') return { x: anchor.x, y: anchor.y }
  const panel = panels.find((p) => p.rect.id === anchor.panelId)
  if (!panel) return null
  return { x: panel.rect.x + anchor.dx, y: panel.rect.y + anchor.dy }
}

/**
 * A point inside a panel becomes a panel anchor (offset from the panel's
 * corner), so a note placed ON a panel follows it; anywhere else is a world
 * anchor. The topmost panel wins when rects overlap — the caller hands them
 * in paint order, and the LAST hit is the topmost.
 */
export function resolveAnchor(point: { x: number; y: number }, panels: readonly RectLike[]): AnnotationAnchor {
  let hit: RectLike | undefined
  for (const p of panels) {
    const r = p.rect
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) hit = p
  }
  if (hit === undefined) return { kind: 'world', x: point.x, y: point.y }
  return { kind: 'panel', panelId: hit.rect.id, dx: point.x - hit.rect.x, dy: point.y - hit.rect.y }
}

/**
 * M395. AN EMPTY LABEL IS NO LABEL. A label is kept only once it says
 * something; the one whose editor is open (`editing`) is the single exception,
 * because a person is still typing it. Ink keeps `text: ''` by design (one
 * record shape) and is never dropped here. The live audit found seven "…"
 * labels left behind after Done: each press on the annotate strip had dropped
 * a fresh label whose editor was then unmounted without a blur, so the "an
 * empty FRESH note removes itself" rule (on blur) never ran for it.
 */
export function dropEmptyLabels(list: readonly Annotation[], editing: string | null): Annotation[] {
  return list.filter((a) => a.ink !== undefined || a.text !== '' || a.id === editing)
}

/** Drops a panel-anchored note whose panel is gone; keeps everything else in order. */
export function pruneAnnotations(list: readonly Annotation[], panelIds: ReadonlySet<string>): Annotation[] {
  return list.filter((a) => a.anchor.kind === 'world' || panelIds.has(a.anchor.panelId))
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * The parser: absent → absent (the caller spreads nothing); a non-array
 * warns once and is dropped; each entry is validated by name; an orphaned
 * panel anchor is dropped against `surviving`; the newest ANNOTATIONS_MAX kept.
 */
export function parseAnnotations(raw: unknown, surviving: ReadonlySet<string>, warnings: string[], scope: string): Annotation[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    warnings.push(`${scope}: annotations was not an array; dropped`)
    return undefined
  }
  const out: Annotation[] = []
  const seen = new Set<string>()
  raw.forEach((entry, i) => {
    if (!isRecord(entry)) { warnings.push(`${scope}: dropped annotation #${i}: not an object`); return }
    const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : null
    if (id === null || seen.has(id)) { warnings.push(`${scope}: dropped annotation #${i}: ${id === null ? 'no id' : 'duplicate id ' + id}`); return }
    if (typeof entry.text !== 'string') { warnings.push(`${scope}: dropped annotation ${id}: text was not a string`); return }
    const anchor = entry.anchor
    let parsed: AnnotationAnchor | null = null
    if (isRecord(anchor) && anchor.kind === 'world' && num(anchor.x) && num(anchor.y)) parsed = { kind: 'world', x: anchor.x, y: anchor.y }
    else if (isRecord(anchor) && anchor.kind === 'panel' && typeof anchor.panelId === 'string' && num(anchor.dx) && num(anchor.dy)) {
      if (!surviving.has(anchor.panelId)) { warnings.push(`${scope}: dropped annotation ${id}: its panel ${anchor.panelId} is gone`); return }
      parsed = { kind: 'panel', panelId: anchor.panelId, dx: anchor.dx, dy: anchor.dy }
    }
    if (parsed === null) { warnings.push(`${scope}: dropped annotation ${id}: anchor is not a world point or a panel offset`); return }
    // M155. `ink` absent is a label; present-but-malformed drops THIS
    // annotation by name (its neighbours stay), never coerced.
    let ink: Annotation['ink'] | undefined
    if (entry.ink !== undefined) {
      const raw = entry.ink
      const okPoints = isRecord(raw) && Array.isArray(raw.points) && raw.points.length <= INK_POINTS_MAX && raw.points.every((pt) => Array.isArray(pt) && pt.length === 2 && num(pt[0]) && num(pt[1]))
      const okWidth = isRecord(raw) && num(raw.width) && raw.width > 0
      if (!okPoints || !okWidth) { warnings.push(`${scope}: dropped annotation ${id}: ink is not a list of at most ${INK_POINTS_MAX} points with a positive width`); return }
      ink = { points: (raw.points as Array<[number, number]>).map((pt) => [pt[0], pt[1]]), width: raw.width as number }
    }
    seen.add(id)
    out.push({ id, text: entry.text, anchor: parsed, ...(ink === undefined ? {} : { ink }) })
  })
  return out.length > ANNOTATIONS_MAX ? out.slice(out.length - ANNOTATIONS_MAX) : out
}
