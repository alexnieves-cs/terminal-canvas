import type { Panel } from '@renderer/panels/panels'
import type { PanelStatus } from '@renderer/session/panel-session'

/**
 * What the rail's Panels section renders, as plain data.
 *
 * Pure by construction — no React, no DOM, no registry reference — for the
 * same reason palette/commands.ts is: it puts the two pieces of this milestone
 * most able to be subtly wrong (the honest chain and the signature) in the
 * cheapest verify tier the repo has, and it means the rail's row logic can be
 * asserted without mounting anything.
 */

export interface RailRow {
  id: string
  /** The honest chain's answer. See railLabel. */
  label: string
  /** `pid 48213` / `dormant` / `exited 1` / `starting…`. See railTail. */
  tail: string
  /** Drives the start control, which is the ONLY way the rail wakes a panel. */
  dormant: boolean
}

/**
 * The same four links TerminalPanel's header walks, most specific first.
 *
 * The second link is the one that matters and the one that is easy to drop:
 * `status.command` is what main ACTUALLY spawned, and for a login-shell panel
 * `spec.command` is ABSENT — only main can name the user's shell — so without
 * it every default panel in the rail would read "login shell" while the panel's
 * own header reads `/bin/zsh`. Two labels for one panel, differing only in the
 * common case.
 *
 * The resolved command is deliberately NOT copied back into PanelSpec. Doing so
 * would make this a fifth place M5a's absent-command rule can be lost, and
 * every command-less preset would start spawning a hardcoded shell.
 */
export function railLabel(panel: Panel, status: PanelStatus | undefined): string {
  return panel.title
    ?? (status?.kind === 'running' ? status.command : undefined)
    ?? panel.spec.command
    ?? 'login shell'
}

/**
 * The row's right-hand tail.
 *
 * `dormant` is tested FIRST and outranks the status kind. A dormant panel's
 * status is {kind:'idle'}, so a status-first implementation would render
 * "not started" — true, and useless: "dormant" is the word the panel's own card
 * uses, and it is what tells the user the start control on this row exists.
 *
 * The exited case is a template rather than a truthiness test on purpose.
 * `code` is 0 for a successful exit, the single most common exit there is, and
 * `code || ...` would print the wrong tail for exactly it.
 */
export function railTail(status: PanelStatus | undefined, dormant: boolean): string {
  if (dormant) return 'dormant'
  if (status === undefined) return 'not started'
  switch (status.kind) {
    case 'running': return `pid ${status.pid}`
    case 'starting': return 'starting…'
    case 'exited': return `exited ${status.code}`
    case 'error': return status.message
    case 'idle': return 'not started'
  }
}

/**
 * Array order, never Panel.z. Stacking is z and the array's order is
 * deliberately not (panels.ts says why); there is no reason for the rail to
 * invent a second answer to what order means, and sorting here would also make
 * every raise reorder a keyed list.
 *
 * The object literal's KEY ORDER is load-bearing, because railSignature below
 * serialises these rows: JSON.stringify preserves insertion order, so building
 * a row's fields in a different order in a later edit would change every
 * signature at once. Harmless in itself — the rows rebuild — but it means this
 * literal is not free to be reshuffled for tidiness.
 */
export function buildRailRows(
  panels: readonly Panel[],
  statusOf: (id: string) => PanelStatus | undefined,
  dormantIds: ReadonlySet<string>
): RailRow[] {
  return panels.map((panel) => {
    const id = panel.rect.id
    const status = statusOf(id)
    const dormant = dormantIds.has(id)
    return { id, label: railLabel(panel, status), tail: railTail(status, dormant), dormant }
  })
}

/**
 * The whole reason this module is not just a `.map()` in Canvas.tsx.
 *
 * `panels` is a fresh array on every setPanelRect — i.e. every frame of a drag
 * — and the palette's escape hatch for exactly this (key the memo on
 * `palette.open`, read out of panelsRef) has no equivalent here. Note the
 * reason, because the obvious one is wrong: the rail DOES collapse
 * (shell.railOpen, Cmd+\, the 22px strip). But Canvas renders <SideRail>
 * unconditionally and the collapse is a CSS class — .shell--rail-collapsed
 * narrows the region and display:none's .rail-list — so every row stays
 * mounted and reconciled while the user cannot see one, and a memo keyed on
 * railOpen would be keyed on a value that changes nothing about what React
 * has to build. So Canvas rebuilds the rows every render and freezes their
 * ARRAY IDENTITY on this string: a drag moves rects, the signature is
 * byte-identical, and memo'd SideRail/RailPanelRow re-render nothing.
 *
 * It is JSON.stringify over the ROWS rather than a hand-rolled concatenation
 * of their inputs, and both halves of that matter. Over the rows, so "the
 * signature covers exactly what a row renders" is structurally true rather
 * than dependent on someone remembering to add a field. And JSON rather than
 * `a + '|' + b`, because a label is USER TEXT: with an ordinary separator a
 * title containing it could forge a field boundary and make two genuinely
 * different lists produce one string, freezing the rail on stale rows for the
 * users whose titles happen to contain that character and nobody else. JSON
 * escapes quotes and needs no separator to be chosen at all.
 *
 * Agent state is deliberately absent from RailRow and therefore from this
 * signature: each row subscribes useAgentState(id) individually, so a bell on
 * n3 re-renders one row rather than moving a signature that rebuilds the list.
 */
export function railSignature(rows: readonly RailRow[]): string {
  return JSON.stringify(rows)
}
