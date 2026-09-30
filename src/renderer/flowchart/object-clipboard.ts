import type { Connector } from '@shared/flowchart'
import { isImagePanel, isNotePanel, isShapePanel, type Panel } from '@renderer/panels/panels'

/**
 * M390. COPY, PASTE AND DUPLICATE for the canvas's AUTHORED objects — shapes,
 * sticky/text/frame and pictures: the kinds that ARE their record, with no
 * process behind them. A terminal or a chat is not copied: a copy would be a
 * second process nobody asked to start, and "start another like it" already
 * has its doors (the spawn sheet, a preset).
 *
 * THE CLIPBOARD IS IN THE APP (ledger D9). An object copy never writes its
 * content to the system clipboard — the system clipboard is readable by every
 * other app, and this repo's rule is that nothing leaves without the outward
 * gate. It gets a content-free MARKER instead ("3 objects from terminal
 * canvas"), so a later paste can tell "the person's last copy was ours" from
 * "they copied something else since" by comparing the text. Mermaid is the
 * way a diagram leaves as text, through its gated export.
 *
 * Pure except for the module-level held copy.
 */

export const COPYABLE = (p: Panel): boolean => isShapePanel(p) || isNotePanel(p) || isImagePanel(p)

interface Held { marker: string; objects: Panel[] }
let held: Held | null = null

/** The marker text for a copy of `n` objects. Content-free on purpose — see the header. */
export function clipboardMarker(n: number, nonce: number): string {
  return `${n} object${n === 1 ? '' : 's'} from terminal canvas · ${nonce.toString(36)}`
}

/**
 * The copyable objects in `ids`, deep-copied, each keeping only the
 * connectors whose target is also copied (a connector to something left
 * behind would point at nothing, or at the original, from the copy).
 */
export function collectCopy(panels: readonly Panel[], ids: ReadonlySet<string>): Panel[] {
  const picked = panels.filter((p) => ids.has(p.rect.id) && COPYABLE(p))
  const inSet = new Set(picked.map((p) => p.rect.id))
  return picked.map((p) => {
    const copy = structuredClone(p) as Panel
    const kept = (p.connectors ?? []).filter((c) => inSet.has(c.to)).map((c) => ({ ...c }))
    if (kept.length === 0) delete copy.connectors
    else copy.connectors = kept
    // Links carry meaning (handoff, membership) between live objects; a copy
    // of a sticky does not inherit its original's rules.
    delete copy.links
    // Marks that belong to the original's place, not to its content.
    delete copy.maximised
    delete copy.locked
    delete copy.pinned
    delete copy.templateBinding
    return copy
  })
}

export function holdCopy(objects: Panel[], marker: string): void {
  held = { marker, objects }
}

/** The held copy, if the system clipboard still carries its marker — i.e. the person has not copied anything else since. */
export function heldCopyFor(clipboardText: string | undefined): Panel[] | null {
  if (held === null || clipboardText === undefined || clipboardText.trim() !== held.marker) return null
  return held.objects
}

/** The id prefix each copyable kind mints with — the canvas's own (seedAfter knows them). */
function prefixOf(p: Panel): string {
  if (isShapePanel(p)) return 'sh'
  if (isNotePanel(p)) return 'nt'
  return 'img'
}

/**
 * The copies, placed: every id re-minted (objects AND connectors, with each
 * connector's `to` renamed to its copy), moved by `dx, dy`, and stacked above
 * everything from `zBase` in their original relative order. Returns the new
 * panels and their ids, for the caller to append in one history entry and
 * select.
 */
export function placeCopies(objects: readonly Panel[], mint: () => number, dx: number, dy: number, zBase: number): { panels: Panel[]; ids: string[] } {
  const rename = new Map<string, string>()
  for (const p of objects) rename.set(p.rect.id, `${prefixOf(p)}${mint()}`)
  const order = [...objects].sort((a, b) => a.z - b.z)
  const zOf = new Map(order.map((p, i) => [p.rect.id, zBase + i]))
  const out = objects.map((p) => {
    const id = rename.get(p.rect.id) as string
    const connectors = (p.connectors ?? []).filter((c) => rename.has(c.to)).map((c): Connector => ({ ...c, id: `cx${mint()}`, to: rename.get(c.to) as string }))
    const next = { ...structuredClone(p), rect: { ...p.rect, id, x: p.rect.x + dx, y: p.rect.y + dy }, z: zOf.get(p.rect.id) as number } as Panel
    if (connectors.length === 0) delete next.connectors
    else next.connectors = connectors
    return next
  })
  return { panels: out, ids: out.map((p) => p.rect.id) }
}
