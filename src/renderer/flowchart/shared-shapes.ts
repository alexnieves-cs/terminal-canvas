import { SHAPE_MIN, parseConnectors, parseShapeRecord, type Connector } from '@shared/flowchart'
import { colorOf } from '@shared/presence'
import type { SharedPanel } from '@shared/canvas-ops'
import type { ShapePanel } from '@renderer/panels/panels'
import type { RoutablePanel } from './connector-model'

/**
 * M392. A TEAMMATE'S FLOWCHART, as this canvas draws it — pure, so what a
 * peer's shape and arrows become here is checked without a browser
 * (verify:flowchart flowchart.shared.*).
 *
 * The shared canvas hands the renderer PLACEHOLDERS (canvas-ops.ts's
 * SharedPanel): a teammate's panels, inert, at the doc's rects. Since M392 a
 * placeholder may carry a shape's record and the arrows its panel holds.
 * This turns that list into what the canvas's two flowchart layers already
 * draw: a shape placeholder with a drawable record becomes a ShapePanel for
 * the ShapeLayer (drawn READ-ONLY there — no handles, no ports, no label
 * editor — with its owner's colour); every placeholder becomes an arrow END
 * for buildConnectorViews, and its arrows are drawn read-only beside ours.
 * Whatever is not drawn as a shape stays a card in SharedPlaceholderLayer.
 *
 * INERT. What crossed from a teammate's machine is re-read here through the
 * same per-field readers the layout file uses (parseShapeRecord,
 * parseConnectors), whatever main already checked: a shape is a form, words
 * and three style words; an arrow is a line between two objects with a label.
 * Nothing a placeholder carries can name a command, a path or anything that
 * runs, and nothing here makes one — drawing a teammate's diagram starts
 * nothing on this machine.
 *
 * NOT A PANEL. A placeholder is never added to `panels`: it is outside undo,
 * persistence, tiering and the registry, as it always was. The ShapePanel
 * made here exists only to be drawn.
 */

/** A drawn peer shape's owner fact — the frame rule's "whose is it", kept without a header. */
export interface PeerShapeMark {
  /** `colorOf(owner)`: the colour the placeholder header and the roster use for them. */
  colour: string
  /** Their name from presence, else "a teammate" — never a user id. */
  who: string
}

export interface PeerFlow {
  /** Placeholders the ShapeLayer draws as their real shapes, read-only. */
  shapes: ShapePanel[]
  /** Each drawn shape's owner, by placeholder id. */
  marks: ReadonlyMap<string, PeerShapeMark>
  /** Every placeholder as an arrow's end, holding its own arrows (ids namespaced, marked peer). */
  endpoints: RoutablePanel[]
  /** The placeholders SharedPlaceholderLayer still draws as cards: everything not drawn as a shape. */
  cards: SharedPanel[]
}

/**
 * A teammate's shape placeholder as a drawable ShapePanel, or null when it is
 * not one — another kind, or a shape whose record did not survive the wire
 * (it stays a card, named by its title: the label's summary). The rect is
 * floored at SHAPE_MIN, a shape's own floor.
 */
export function peerShapeOf(p: SharedPanel): ShapePanel | null {
  if (p.kind !== 'shape' || p.shape === undefined) return null
  const shape = parseShapeRecord(p.shape, [], p.id)
  if (shape === null) return null
  return { kind: 'shape', rect: { id: p.id, x: p.x, y: p.y, w: Math.max(SHAPE_MIN.w, p.w), h: Math.max(SHAPE_MIN.h, p.h) }, z: p.z, shape }
}

/**
 * A placeholder's arrows as this canvas draws them. Ids are NAMESPACED by the
 * holder (`<placeholder id>/<id>`): connector ids are minted per machine
 * (`cx<n>`), so a teammate's `cx3` and ours would otherwise be one view.
 */
export function peerConnectorsOf(p: SharedPanel): Connector[] | undefined {
  const list = parseConnectors(p.connectors, [], p.id)
  if (list === undefined || list.length === 0) return undefined
  return list.map((c) => ({ ...c, id: `${p.id}/${c.id}` }))
}

const sameShapePanel = (a: ShapePanel, b: ShapePanel): boolean =>
  a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h && a.z === b.z &&
  a.shape.form === b.shape.form && a.shape.text === b.shape.text && a.shape.fill === b.shape.fill && a.shape.stroke === b.shape.stroke && a.shape.ink === b.shape.ink

const sameEnd = (a: RoutablePanel, b: RoutablePanel): boolean =>
  a.kind === b.kind && a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h &&
  a.shape?.form === b.shape?.form && JSON.stringify(a.connectors ?? null) === JSON.stringify(b.connectors ?? null)

/**
 * The placeholders as the flowchart layers draw them. `previous` is the last
 * result: a shape or an end whose inputs did not change is handed back as the
 * SAME object, so ShapeLayer's per-shape memo and the connector route cache
 * hold across a view that moved one placeholder — a view replaces every
 * placeholder object, even the ones nothing changed.
 */
export function buildPeerFlow(placeholders: readonly SharedPanel[], nameOf: (userId: string) => string | undefined, previous: PeerFlow | null): PeerFlow {
  const priorShape = new Map((previous?.shapes ?? []).map((s) => [s.rect.id, s]))
  const priorEnd = new Map((previous?.endpoints ?? []).map((e) => [e.rect.id, e]))
  const shapes: ShapePanel[] = []
  const marks = new Map<string, PeerShapeMark>()
  const endpoints: RoutablePanel[] = []
  const cards: SharedPanel[] = []
  for (const p of placeholders) {
    const made = peerShapeOf(p)
    let drawn: ShapePanel | null = null
    if (made === null) cards.push(p)
    else {
      const prior = priorShape.get(p.id)
      drawn = prior !== undefined && sameShapePanel(prior, made) ? prior : made
      shapes.push(drawn)
      marks.set(p.id, { colour: colorOf(p.owner), who: nameOf(p.owner) ?? 'a teammate' })
    }
    const connectors = peerConnectorsOf(p)
    const end: RoutablePanel = {
      kind: p.kind,
      rect: drawn?.rect ?? { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h },
      ...(drawn === null ? {} : { shape: drawn.shape }),
      ...(connectors === undefined ? {} : { connectors }),
      peer: true
    }
    const prior = priorEnd.get(p.id)
    endpoints.push(prior !== undefined && sameEnd(prior, end) ? prior : end)
  }
  return { shapes, marks, endpoints, cards }
}
