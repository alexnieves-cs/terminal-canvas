import type { WorkspaceRow } from '@shared/ipc-contract'
import { waitingCount } from '@renderer/shell/rail-sections'

/**
 * The nav grid's cell arithmetic (backlog #1, M11).
 *
 * Pure: no React, no DOM, and its only value import is waitingCount. That is
 * what keeps it in the plain-node verify tier, bundled through
 * scripts/rail-entry.cjs rather than a suite of its own.
 */

export const GRID_COLS = 3
export const GRID_CELLS = 9
/**
 * Cell 8 is ALWAYS the overflow door, never a workspace. It is not conditional
 * on a 9th workspace existing: a cell that appears only sometimes is a cell
 * whose position is not stable, and stable position is the entire reason to
 * prefer a hold-to-reveal gesture over Cmd+K.
 */
export const MORE_INDEX = 8
/** Workspaces occupy cells 0..7 — eight, not nine, because of MORE_INDEX. */
export const GRID_WORKSPACE_SLOTS = MORE_INDEX

export type GridCell =
  | {
      kind: 'workspace'
      workspaceId: string
      name: string
      panels: number
      /**
       * A NUMBER, and the view composes the text. Command.waiting and
       * RailRow.waiting already obey this: a count baked into a label reaches
       * the palette's fuzzy haystack, and a count is transient state rather
       * than a name.
       */
      waiting: number
      active: boolean
    }
  | { kind: 'more' }
  | { kind: 'empty' }

/**
 * Nine cells, always. Stored order, so a workspace keeps its cell as others
 * are added — success criterion 2.
 */
export function buildGrid(
  workspaces: readonly WorkspaceRow[],
  attentionIds: readonly string[]
): GridCell[] {
  const cells: GridCell[] = []
  for (let i = 0; i < GRID_WORKSPACE_SLOTS; i++) {
    const w = workspaces[i]
    if (!w) {
      cells.push({ kind: 'empty' })
      continue
    }
    cells.push({
      kind: 'workspace',
      workspaceId: w.id,
      name: w.name,
      panels: w.panelIds.length,
      // rail-sections' own function, never a second intersection here: "one
      // waiting count, and the rail is a view over it". Two derivations agree
      // the day they are written and drift the first time one is wrong.
      waiting: waitingCount(w.panelIds, attentionIds),
      active: w.active
    })
  }
  cells.push({ kind: 'more' })
  return cells
}

/**
 * Where the cursor opens: the ACTIVE workspace's own cell, so a release with
 * no arrow pressed changes nothing. The gesture must be abandonable by doing
 * nothing — that is what makes it safe to summon speculatively, and it is how
 * Cmd+Tab behaves.
 *
 * When the active workspace is past cell 7 it has no cell, and the answer is
 * MORE_INDEX rather than 0: cell 8 is still "you are here" in the only sense
 * this grid can express, while seeding 0 would make a no-arrow release jump to
 * a workspace the user never pointed at.
 */
export function initialCursor(cells: readonly GridCell[]): number {
  const active = cells.findIndex((c) => c.kind === 'workspace' && c.active)
  return active === -1 ? MORE_INDEX : active
}

/**
 * Move the cursor one step. Two rules, and each fails silently on its own.
 *
 * It SKIPS `empty` cells, for stepRunnable's reason: a cursor that cannot be
 * committed is a dead key.
 *
 * It does NOT WRAP. Wrapping in two dimensions means an arrow at the right
 * edge teleports the cursor to the far left of the row, which reads as a
 * mis-fire rather than as navigation. An out-of-bounds step, or a step whose
 * every candidate is empty, returns the index unchanged.
 *
 * Two inputs would otherwise hang the loop forever rather than obeying that
 * "returns the index unchanged" promise, and Task 2 wires real keyboard
 * input directly onto this function, so both are reachable in production,
 * not merely in a fuzzer: a zero vector (`dx === 0 && dy === 0`, the
 * idiomatic no-op default for an unrecognised key) never moves `col`/`row`,
 * so the bounds check below never trips and the loop spins on the SAME cell
 * forever; a non-finite `index` (e.g. `NaN`, from a caller's own arithmetic
 * bug) makes every comparison against `col`/`row` `false` — `NaN` is never
 * `< 0` or `>= GRID_COLS` — so the escape hatch never fires either, and
 * `cells[NaN]` stays `undefined` forever. This is a single-threaded
 * renderer, so either one is a hung UI, not an exception. The zero-vector
 * case gets its own early return because it is the common one (Task 2's
 * default); the loop is ALSO bounded by a step counter rather than trusting
 * the bounds check alone, because that is what closes the non-finite case
 * without a second special case for `NaN` specifically — the grid can never
 * legitimately need more than `GRID_COLS + rows` hops in one direction
 * before running off an edge, so that many iterations is already more than
 * any genuine input would use.
 */
export function stepCell(
  cells: readonly GridCell[],
  index: number,
  dx: number,
  dy: number
): number {
  if (dx === 0 && dy === 0) return index

  let col = index % GRID_COLS
  let row = Math.floor(index / GRID_COLS)
  const rows = Math.ceil(GRID_CELLS / GRID_COLS)
  const maxSteps = GRID_COLS + rows
  for (let step = 0; step < maxSteps; step++) {
    col += dx
    row += dy
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= rows) return index
    const next = row * GRID_COLS + col
    if (cells[next] && cells[next].kind !== 'empty') return next
    // Otherwise keep travelling in the same direction past the empty cell,
    // rather than stopping on it or giving up: a lone gap in the middle of a
    // row must not become a wall.
  }
  return index
}
