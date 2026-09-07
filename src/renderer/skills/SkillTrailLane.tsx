import { useEffect, useState, type JSX } from 'react'
import type { Trail } from '@shared/skill-trail'
import { placement, skillKey, type Shelf } from '@shared/skills'
import type { NamedToolEntry, ToolInventoryResult, ToolScope } from '@shared/toolbox'
import type { Panel } from '@renderer/panels/panels'
import { useTrailFor } from './skill-trail-store'

/**
 * M130. THE TRAIL'S LANE: what an agent actually did, beside the panel that
 * did it.
 *
 * Every card here is a plain element in the world layer, NOT a panel — the
 * rule M79's run frames and M114's anchored card already established, and the
 * consequences are the reason: forty skill uses cost zero LOD budget and zero
 * records, closing the host takes its trail with it and needs no pruning
 * pass, and `Cmd+Z` cannot orphan one because there is nothing in history to
 * undo. The lane's geometry is DERIVED from the host's rect on every render
 * and never written back, so a move of the host moves the lane and the
 * layout file learns nothing.
 */

/** A single column at a fixed offset to the host's right. */
export const LANE_GAP = 28
export const LANE_W = 208
export const CARD_GAP = 8

export interface SkillTrailLaneProps {
  panel: Panel
  /**
   * Whether this host is the SELECTED panel, and the reason it is a prop.
   *
   * `none` and `unreadable` are real answers and each has its own sentence —
   * but painting "no skills used" beside all forty panels on a canvas is
   * exactly the noise the lane exists to cut, and most terminals are shells
   * that never ran an agent at all. So the two note arms belong to the panel
   * the user is looking at; a trail WITH entries paints wherever it is.
   */
  selected: boolean
  /** The host's directory, or null for a kind that has none — its inventory cannot be read. */
  cwd: string | null
  shelf: Shelf
  /** M128's door. The world point is the card's own, so the panel opens beside its card. */
  onOpenSkill: (scope: ToolScope, name: string, world: { x: number; y: number }) => void
}

/**
 * The outcomes of resolving a trail entry BY NAME. Spec §6.3 names three;
 * the fourth is the one the spec's table assumes away.
 *
 * `unknown` is NOT a fourth flavour of `none`, and collapsing the two is the
 * bug this repo bans by name: `not installed here` is a statement about the
 * user's MACHINE, and printing it when the inventory could not be read at
 * all — the panel has no directory, main refused, the invoke rejected —
 * tells the user to install something they already have. Three-state
 * results, never two: nothing to show, asked but unanswered, and a real
 * answer.
 */
type Resolved =
  | { kind: 'one'; scope: ToolScope; description: string; column: string }
  | { kind: 'several'; count: number }
  | { kind: 'none' }
  /** The inventory could not be read; `why` is the reader's own reason. */
  | { kind: 'unknown'; why: string }
  /** The inventory has not answered yet: neither a match nor a refusal. */
  | { kind: 'asking' }

/**
 * What the lane holds while it waits, plus the arm `ToolInventoryResult` has
 * no room for: an invoke that REJECTED. Main's type is two arms and neither
 * of them is "the read threw", so the refusal is carried here rather than
 * laundered into `no-cwd`, which would read as a panel with no directory.
 */
type LaneInventory = ToolInventoryResult | { kind: 'refused'; why: string }

/**
 * An IPC rejection's message arrives prefixed with the channel and the
 * remote stack (`Error invoking remote method 'toolbox:read': Error: …`); the
 * card has one line, and the reader's own sentence is the useful half.
 */
function lastLineOfMessage(message: string): string {
  const tail = message.split('Error: ').pop() ?? message
  return tail.trim() === '' ? 'the read did not answer' : tail.trim()
}

function isSkill(entry: { kind: string }): entry is NamedToolEntry {
  return entry.kind === 'skill'
}

/**
 * The word the shelf shows over this skill's column — the user's own title
 * for a column they made, and the derived name otherwise. Read from the SAME
 * `placement` the Skills pane places cards with, never a second rule, or the
 * card would name a column the pane does not put it in.
 */
function columnWord(shelf: Shelf, scope: ToolScope, name: string): string {
  const { columnId } = placement(skillKey(scope, name), shelf, scope, name)
  const placed = shelf.columns.find((c) => c.id === columnId)
  if (placed !== undefined) return placed.title
  if (columnId.startsWith('plugin:')) return columnId.slice('plugin:'.length)
  if (columnId.startsWith('scope:')) return columnId.slice('scope:'.length)
  return columnId
}

function resolve(name: string, inventory: LaneInventory | undefined, shelf: Shelf): Resolved {
  if (inventory === undefined) return { kind: 'asking' }
  if (inventory.kind === 'refused') return { kind: 'unknown', why: inventory.why }
  if (inventory.kind === 'no-cwd') return { kind: 'unknown', why: 'this panel has no directory' }
  if (inventory.kind !== 'inventory') return { kind: 'unknown', why: 'the inventory came back in a shape this version does not know' }
  const matches = inventory.inventory.entries.filter((e) => isSkill(e) && (e as NamedToolEntry).name === name) as NamedToolEntry[]
  if (matches.length === 0) return { kind: 'none' }
  // M21's refusal, reused verbatim: several scopes define this name and this
  // app cannot verify which one the CLI resolved, so it names NO winner.
  if (matches.length > 1) return { kind: 'several', count: matches.length }
  const one = matches[0]
  return { kind: 'one', scope: one.scope, description: one.description, column: columnWord(shelf, one.scope, one.name) }
}

export function SkillTrailLane({ panel, selected, cwd, shelf, onOpenSkill }: SkillTrailLaneProps): JSX.Element | null {
  const trail = useTrailFor(panel.rect.id, panel.kind)
  const [inventory, setInventory] = useState<LaneInventory | undefined>(undefined)

  // ONE read per cwd, asked only once the trail has something to resolve: a
  // panel that used no skills must not spend a toolbox read to say so. The
  // cache in main is keyed by resolved cwd, so twelve panels in one
  // repository still cost one parse.
  const wants = trail.kind === 'entries'
  useEffect(() => {
    if (!wants) { setInventory(undefined); return }
    // M137. A panel with NO directory resolves at once to the reader's own
    // `no-cwd` arm — the card then says "this panel has no directory" — where
    // it used to sit at `reading the inventory…` forever, an ask nobody made.
    if (cwd === null) { setInventory({ kind: 'no-cwd' }); return }
    let live = true
    void window.canvas.toolbox.read({ panelId: panel.rect.id, cwd })
      .then((r) => { if (live) setInventory(r) })
      // The reader's own words, never `no-cwd`: an invoke that rejected is
      // not a panel without a directory, and the card says which.
      .catch((error: unknown) => { if (live) setInventory({ kind: 'refused', why: error instanceof Error ? lastLineOfMessage(error.message) : 'the read did not answer' }) })
    return () => { live = false }
  }, [wants, cwd, panel.rect.id])

  const style = { left: panel.rect.x + panel.rect.w + LANE_GAP, top: panel.rect.y, width: LANE_W, zIndex: panel.z }

  // Three renderings, never two: "no skills used" and "we cannot see this
  // session's skills" are different sentences, and printing the first for the
  // second lies about what the agent did.
  if (trail.kind !== 'entries') {
    if (!selected) return null
    return (
      <div className="trail-lane" data-skill-trail-lane={panel.rect.id} style={style} aria-hidden="true">
        <div className="trail-lane__note" data-skill-trail-note={trail.kind}>
          {trail.kind === 'none' ? 'no skills used' : trail.why}
        </div>
      </div>
    )
  }

  return (
    <div className="trail-lane" data-skill-trail-lane={panel.rect.id} style={style}>
      {trail.entries.map((entry, i) => {
        const r = resolve(entry.name, inventory, shelf)
        const world = { x: panel.rect.x + panel.rect.w + LANE_GAP, y: panel.rect.y + i * (CARD_GAP + 44) }
        const openable = r.kind === 'one'
        return (
          <div
            key={`${entry.at}:${entry.name}:${i}`}
            className={`trail-card${openable ? ' trail-card--openable' : ''}`}
            data-skill-trail-card=""
            data-skill-trail-name={entry.name}
            role={openable ? 'button' : undefined}
            tabIndex={openable ? 0 : undefined}
            title={openable ? `Open the skill panel for ${entry.name}` : entry.name}
            onMouseDown={(event) => {
              // mousedown, not click: every control on this canvas arms on
              // mousedown so a press cannot be lost to a drag, and stopping
              // propagation keeps the background's own mousedown from
              // reading this as a deselect.
              event.stopPropagation()
              event.preventDefault()
              if (r.kind === 'one') onOpenSkill(r.scope, entry.name, world)
            }}
          >
            <div className="trail-card__name">{entry.name}</div>
            <div className="trail-card__note" data-skill-trail-outcome={r.kind}>
              {r.kind === 'one'
                ? (r.description === '' ? r.column : `${r.description}`)
                : r.kind === 'several'
                  ? `defined in ${r.count} scopes`
                  : r.kind === 'none'
                    ? 'not installed here'
                    : r.kind === 'unknown'
                      ? `cannot read this project's skills: ${r.why}`
                      : 'reading the inventory…'}
            </div>
            {r.kind === 'one' && <div className="trail-card__column" data-skill-trail-column={r.column}>{r.column}</div>}
          </div>
        )
      })}
      {trail.more > 0 && (
        // Counted, never dropped silently: a truncation with nothing saying
        // so is a lie about the order the skills ran in.
        <div className="trail-lane__note" data-skill-trail-more={trail.more}>{`${trail.more} older, not shown`}</div>
      )}
    </div>
  )
}

/** True when this trail is worth a capsule — a count exists to show. */
export function trailCount(trail: Trail): number {
  return trail.kind === 'entries' ? trail.entries.length : 0
}
