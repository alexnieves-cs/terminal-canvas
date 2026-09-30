import type { Connector, Port, ShapeForm } from '@shared/flowchart'
import { pickPorts, routeConnector, type ConnectorPath } from '@shared/flowchart-geometry'
import { isShapePanel, type Panel } from '@renderer/panels/panels'

/**
 * M389. From panels to drawable connectors — pure, so the cache discipline
 * that keeps a 200-shape drag at frame rate is testable without a browser.
 *
 * A connector is held by its SOURCE panel (ledger D2); here each one becomes
 * a `ConnectorView`: its two boxes and forms, the ports chosen (a fixed port
 * kept, an absent one picked from the geometry every time), and the routed
 * path. Routing is the expensive part (an orthogonal route searches around
 * the shapes between the two ends), so `buildConnectorViews` takes the last
 * frame's views and REUSES a route whose inputs did not change: the two boxes,
 * the ports, the route kind and the obstacles near it. During a drag that is
 * every connector not touching the moved shapes.
 */

export interface ConnectorView {
  id: string
  from: string
  to: string
  connector: Connector
  fromPort: Port
  toPort: Port
  path: ConnectorPath
  /** The route's inputs, serialised — the cache key. */
  key: string
}

interface Box { x: number; y: number; w: number; h: number }

const boxOf = (p: Panel): Box => ({ x: p.rect.x, y: p.rect.y, w: p.rect.w, h: p.rect.h })
const formOf = (p: Panel): ShapeForm | null => (isShapePanel(p) ? p.shape.form : null)
const k = (b: Box): string => `${Math.round(b.x * 10)},${Math.round(b.y * 10)},${Math.round(b.w * 10)},${Math.round(b.h * 10)}`

/** Whether two boxes overlap, inflated by `m`. */
function near(a: Box, b: Box, m: number): boolean {
  return a.x - m < b.x + b.w && b.x - m < a.x + a.w && a.y - m < b.y + b.h && b.y - m < a.y + a.h
}

export function buildConnectorViews(panels: readonly Panel[], previous: ReadonlyMap<string, ConnectorView>): Map<string, ConnectorView> {
  const byId = new Map<string, Panel>()
  for (const p of panels) byId.set(p.rect.id, p)
  // Obstacles are SHAPES only: a connector to a terminal routes around the
  // diagram's boxes, never around every panel on the canvas (a terminal is
  // an endpoint or it is somewhere else entirely).
  const obstacles: { id: string; box: Box }[] = []
  for (const p of panels) if (isShapePanel(p) && p.shape.form !== 'text') obstacles.push({ id: p.rect.id, box: boxOf(p) })
  const out = new Map<string, ConnectorView>()
  for (const holder of panels) {
    const list = holder.connectors
    if (list === undefined) continue
    for (const c of list) {
      const target = byId.get(c.to)
      if (target === undefined) continue
      const fromBox = boxOf(holder)
      const toBox = boxOf(target)
      const fromForm = formOf(holder)
      const toForm = formOf(target)
      const ports = pickPorts({ box: fromBox, form: fromForm, ...(c.from === undefined ? {} : { port: c.from }) }, { box: toBox, form: toForm, ...(c.toPort === undefined ? {} : { port: c.toPort }) })
      const route = c.route ?? 'orthogonal'
      // The span the route could use: both boxes, inflated. Only obstacles
      // touching it can change the route, so only they are in the key.
      const span = { x: Math.min(fromBox.x, toBox.x), y: Math.min(fromBox.y, toBox.y), w: 0, h: 0 }
      span.w = Math.max(fromBox.x + fromBox.w, toBox.x + toBox.w) - span.x
      span.h = Math.max(fromBox.y + fromBox.h, toBox.y + toBox.h) - span.y
      const local = route === 'orthogonal' ? obstacles.filter((o) => o.id !== holder.rect.id && o.id !== target.rect.id && near(o.box, span, 48)) : []
      const ends = c.ends ?? 'end'
      const key = `${route}|${ends}|${ports.from}${ports.to}|${fromForm}|${toForm}|${k(fromBox)}|${k(toBox)}|${local.map((o) => `${o.id}:${k(o.box)}`).join(';')}`
      const prior = previous.get(c.id)
      if (prior !== undefined && prior.key === key) {
        out.set(c.id, prior.connector === c ? prior : { ...prior, connector: c })
        continue
      }
      const path = routeConnector({
        from: { box: fromBox, form: fromForm, port: ports.from },
        to: { box: toBox, form: toForm, port: ports.to },
        route,
        obstacles: local.map((o) => o.box),
        // The stroke stops short under an arrowhead (the geometry's own trim),
        // so the line never pokes through the head's tip.
        ends
      })
      out.set(c.id, { id: c.id, from: holder.rect.id, to: c.to, connector: c, fromPort: ports.from, toPort: ports.to, path, key })
    }
  }
  return out
}
