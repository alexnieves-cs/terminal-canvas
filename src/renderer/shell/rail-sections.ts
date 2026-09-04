import type { WorkspaceRow } from '@shared/ipc-contract'
import type { RailRow } from './rail-rows'

/**
 * The rail's Workspaces and Attention sections, as plain data.
 *
 * Pure by construction — no React, no DOM, no registry reference — for the
 * same reason rail-rows.ts and palette/commands.ts are: it puts the pieces
 * most able to be subtly wrong in the cheapest verify tier the repo has. Both
 * of this file's imports are `import type` and esbuild erases them, so the
 * bundle still resolves no VALUE from @shared.
 *
 * It is a separate file from rail-rows.ts rather than an append to it because
 * that module's stated subject is the Panels section and its signature.
 *
 * One directory-level cycle passes through here and is held open by a single
 * `import type`: shell/TopBar.tsx imports PresetRow from palette/commands.ts,
 * and palette/commands.ts imports waitingCount from this file as a VALUE. The
 * first hop is erased by esbuild, so there is no runtime cycle today — turning
 * that type import into a value one closes it, and the failure of a real ESM
 * cycle is a module-scope binding read before its initialiser has run, i.e. an
 * undefined function at first call rather than a build error. Named so whoever
 * makes that edit knows what they are doing.
 */

/**
 * How many of one workspace's panels are waiting on the user.
 *
 * THE one derivation. palette/commands.ts computed this inline until M8d
 * (`w.panelIds.filter((id) => ctx.attentionIds.includes(id)).length`) and now
 * calls this instead, because two derivations of one number agree the day they
 * are written and drift the first time one is wrong — and the drift here is a
 * count on screen that no log explains. Same trade M8c made with isRunning,
 * which the inspector's summary and main's canvas:counts now share.
 *
 * The intersection is what does the work: an attention id this workspace does
 * not own contributes nothing, which covers a panel waiting in some other
 * canvas and a PHANTOM alike — an id whose panel is gone but whose agent state
 * survived the closure, the orphan reachableQueue drops at the head of the
 * jump queue.
 *
 * One honest limit, recorded so it is not later read as a bug — and note what
 * it is NOT. The 500ms coalescing debounce in layout-store.ts is on the
 * WRITE: doSave mutates w.panels synchronously and workspaces() reads that
 * same in-memory snapshot, so main's answer is fresh when the invoke lands —
 * WITH the exception in the next paragraph. The staleness is on this side.
 * `panelIds` reaches here from Canvas.tsx's workspaceRows, a renderer copy
 * only as current as its last reloadWorkspaces(): every workspace mutation
 * and every workspace switch, plus mount, and — since the M8d fix — every
 * change to the panel COUNT. (Enumerating those occasions individually is how
 * this very comment went stale once; the phrase is deliberately one that
 * cannot.) So the window is one IPC round trip after a spawn or a close, not
 * a debounce, and outside it the count is exact.
 *
 * The exception is `restore.layout`. doSave writes w.panels only inside
 * `if (layout)`, i.e. only while that preference is ON, because a restore
 * setting that is off means "start fresh each launch" and initial() hands the
 * renderer `panels: []` — writing back unconditionally would let any panel
 * move overwrite real stored data with what the fresh-start renderer
 * invented. With it OFF, main's panelIds simply never advances on a spawn, so
 * the reload returns an unchanged count and this row reads whatever was last
 * stored while the setting was on. Not a lag but a freeze, pre-existing store
 * behaviour rather than anything the count does, and NOT closed by the M8d
 * reload. One thing does move it: a workspace switch calls
 * activateWorkspace, whose doSave(outgoing, false) bypasses restore settings
 * entirely, so the stored panels — and this count — catch up there.
 *
 * A round trip is acceptable for a COUNT and would not be for a navigation
 * target — which is exactly why buildAttentionRows below filters against the
 * rendered panel rows instead.
 */
export function waitingCount(
  panelIds: readonly string[],
  attentionIds: readonly string[]
): number {
  const waiting = new Set(attentionIds)
  return panelIds.reduce((n, id) => (waiting.has(id) ? n + 1 : n), 0)
}

/**
 * One row of the Workspaces section.
 *
 * `waiting` is a NUMBER, deliberately, and the view composes it into text.
 * Building the string here would be the same mistake the palette declined when
 * it put the count on `Command.waiting` rather than in the row's title: a count
 * is transient state, not a name, and the moment it is baked into a string it
 * starts reaching things that scan strings.
 */
export interface RailWorkspace {
  id: string
  name: string
  panels: number
  waiting: number
  active: boolean
}

/** A view over main's own list, never a second source for it. */
export function buildWorkspaceRows(
  workspaces: readonly WorkspaceRow[],
  attentionIds: readonly string[]
): RailWorkspace[] {
  return workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    panels: w.panelIds.length,
    waiting: waitingCount(w.panelIds, attentionIds),
    active: w.active
  }))
}

/**
 * The same 60Hz defence railSignature provides, against a different volatile
 * input. There is no rect here; what churns is IDENTITY — reloadWorkspaces()
 * hands Canvas a brand-new array of brand-new objects on mount and on every
 * palette open — so without this the useMemo would hand SideRail a fresh array,
 * defeating its memo, for a reload that changed nothing.
 *
 * JSON.stringify over the ROWS, for both of railSignature's reasons: over the
 * rows, so "the signature covers exactly what a row renders" is structurally
 * true rather than dependent on someone remembering to add a field; and JSON
 * rather than `a + '|' + b`, because a workspace NAME is user text and an
 * ordinary separator is a field boundary a name is free to forge — freezing
 * the rail on stale rows for the users whose names happen to contain that
 * character and nobody else.
 *
 * The object literal in buildWorkspaceRows therefore has a load-bearing KEY
 * ORDER, the same way buildRailRows' does.
 */
export function workspaceSignature(rows: readonly RailWorkspace[]): string {
  return JSON.stringify(rows)
}

/**
 * One row of the Attention section. No agent state field, because every row in
 * this section is `wants-you` by construction — that is what put it here.
 */
export interface RailAttention {
  id: string
  label: string
  /** M76. A chat's OLDEST pending permission request, so the row can answer it. A terminal's row never has one. */
  approval?: PendingApproval
}

/** M76. One pending permission request, as every surface that can answer it reads it. */
export interface PendingApproval {
  id: string
  requestId: string
  toolName: string
  /** `toolArgument(input)` — the transcript's own short form. */
  argument: string
}

/**
 * The wants-you queue, filtered to panels that actually exist on this canvas.
 *
 * It takes the ALREADY-BUILT RailRow[] rather than the panel list, and that is
 * the load-bearing part of the signature: filtering the queue down to ids that
 * have a panel row IS reachableQueue's phantom filter, and reading the label
 * off that same row is what stops the two sections rendering two different
 * names for one panel. One lookup, both guarantees.
 *
 * Iterating the QUEUE and looking up the row — never iterating the rows and
 * testing membership — is what preserves entry order, longest-waiting first.
 * The other direction renders the canvas's order instead and looks entirely
 * correct until two agents ring in the wrong sequence.
 *
 * The phantom it drops is the one agent-state-store can legitimately hold: a
 * closed panel's state survives its closure, and under M6c's session.killed
 * guard nothing ever clears it — so an unfiltered section renders a row that
 * navigates nowhere, on a canvas with nothing to go to.
 *
 * Because it filters against the RENDERED panel rows rather than a reloaded
 * copy of main's panelIds, it is also strictly tighter than waitingCount
 * above, which lags for one reload round trip after a spawn or a close (see
 * that function's own comment for why it is a round trip and not the store's
 * write debounce). A count may lag by a frame; a navigation target may not.
 */
export function buildAttentionRows(
  queue: readonly string[],
  panelRows: readonly RailRow[],
  /**
   * M76. Every pending request on this renderer, in ARRIVAL order per panel;
   * the row takes the first for its id. Optional and defaulted so every
   * pre-M76 caller and check keeps its exact meaning.
   */
  approvals: readonly PendingApproval[] = []
): RailAttention[] {
  const byId = new Map(panelRows.map((row) => [row.id, row]))
  const out: RailAttention[] = []
  for (const id of queue) {
    const row = byId.get(id)
    if (row === undefined) continue
    const approval = approvals.find((a) => a.id === id)
    out.push({ id, label: row.label, ...(approval === undefined ? {} : { approval }) })
  }
  return out
}

/**
 * Same defence, same means, as workspaceSignature above — and ORDER is part of
 * what it covers, because JSON.stringify over an array is order-sensitive and
 * two queues holding the same ids in a different sequence are different lists.
 * A signature blind to order would freeze the section on a stale sequence with
 * every id in it still correct, which is the hardest kind of wrong to see.
 */
export function attentionSignature(rows: readonly RailAttention[]): string {
  return JSON.stringify(rows)
}
