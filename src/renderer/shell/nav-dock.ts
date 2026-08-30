/**
 * The dock's pure model: which entries exist, which is active, and what each
 * one's badge says.
 *
 * Pure by construction — no React, no DOM, and no imports at all — so it joins
 * the plain-node verify:rail bundle beside inspector-fields.ts,
 * rail-sections.ts and the three node models. That is the precedent every view
 * model since M8c has followed, and the reason is cost: a pure function over
 * plain data is checkable in milliseconds, and the same logic inside a
 * component is checkable only from the Electron tier.
 */

export type NavPaneId = 'workspaces' | 'panels' | 'files' | 'attention'

export interface DockEntry {
  id: NavPaneId
  label: string
  /**
   * One or two characters, rendered as TEXT. Never an icon font: a font that
   * fails to load leaves an app whose entire navigation is invisible, and
   * --font-display's own comment records that a silently-wrong fallback "is
   * exactly the kind of failure that ships".
   */
  glyph: string
  /** Undefined means NO badge. Never 0 — see the check that pins this. */
  badge?: number
  active: boolean
}

/**
 * The render order, exported so a check can assert it without restating it.
 * verify:palette 30 was rewritten for exactly this reason: an order written
 * down in two places is an order that drifts, and the copy nobody is looking
 * at is the one that goes stale.
 */
export const DOCK_ORDER: readonly NavPaneId[] = ['workspaces', 'panels', 'files', 'attention']

const LABEL: Record<NavPaneId, string> = {
  workspaces: 'Workspaces',
  panels: 'Panels',
  files: 'Files',
  attention: 'Attention'
}

/**
 * Chosen from blocks this app already proves it can draw where possible — the
 * file tree renders U+25B8/U+25BE and the panel chrome renders U+00D7, so
 * Geometric Shapes and Latin-1 are known-covered in --font-display's fallback
 * chain. The two APL symbols below are NOT in a block this repo has rendered
 * before, and a codepoint the font stack cannot cover renders as tofu — which
 * would leave the dock's whole vocabulary unreadable while every check here
 * stayed green, because a pure model cannot observe a font.
 *
 * They are therefore PROVISIONAL, and the obligation is on the task that first
 * renders them: NavDock's own task must look at real pixels and replace any
 * glyph that does not draw. That is a one-line edit to this table, and no
 * check asserts a specific glyph, deliberately — pinning one would pin the
 * spelling rather than the rule, and the rule is "it must be legible".
 */
const GLYPH: Record<NavPaneId, string> = {
  workspaces: '⌸', // ⌸ APL FUNCTIONAL SYMBOL QUAD EQUAL — provisional
  panels: '▤', //     ▤ SQUARE WITH HORIZONTAL FILL — stacked rows
  files: '⌷', //      ⌷ APL FUNCTIONAL SYMBOL SQUISH QUAD — provisional
  attention: '⚑' //   ⚑ BLACK FLAG
}

export function buildDock(
  activePane: NavPaneId | null,
  counts: { panels: number; workspaces: number; attention: number }
): DockEntry[] {
  return DOCK_ORDER.map((id) => {
    // Only Attention carries a badge, and only when non-zero. It is the one
    // fact that must stay visible when its pane is closed — losing the
    // resident Attention list is this milestone's one real trade (spec §3.3),
    // and the badge is the half of it that must not also be lost.
    const n = id === 'attention' ? counts.attention : 0
    const entry: DockEntry = {
      id,
      label: LABEL[id],
      glyph: GLYPH[id],
      active: activePane === id
    }
    // Assigned CONDITIONALLY rather than as `badge: n || undefined`, so the
    // key is genuinely ABSENT rather than present-and-undefined. The same
    // absent-stays-absent rule `command`, `title` and `agent` already obey in
    // the layout schema, and for the same reason: `'badge' in entry` must read
    // false for an entry that has none.
    if (n > 0) entry.badge = n
    return entry
  })
}
