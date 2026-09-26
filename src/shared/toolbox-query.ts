import type { ToolActive, ToolInventoryResult, ToolKind, ToolScope } from './toolbox'

/**
 * M365. THE CROSS-PANEL CAPABILITY QUERY — backlog #26's "which of these
 * agents can actually do X": a capability NAME asked of every agent's
 * toolbox at once, answered per panel.
 *
 * FOUR answers, and collapsing any two is a wrong answer rather than a
 * simplification (`ToolActive`'s rule, one level up):
 *
 * - `has`      — an entry by that name is ACTIVE for this panel's directory.
 * - `inactive` — an entry by that name exists and is disabled, waiting on
 *                approval, or of a state this app cannot decide. Folding it
 *                into `has` sends someone to an agent that will refuse; into
 *                `lacks`, hides the one fix they could make.
 * - `lacks`    — the toolbox was read whole and holds no such name. It still
 *                counts the enabled PLUGINS this app does not enumerate,
 *                because a plugin may supply the name: "no review — 2
 *                plugins not read" is true, "no review" alone may not be.
 * - `unknown`  — no answer to give: not read yet, the read failed, or the
 *                inventory was cut at its cap before every name was seen.
 *
 * Names are the ones a person types: a skill, a command (with or without its
 * namespace or leading `/`), an agent, an MCP server. Hooks have no names.
 * Case does not matter. Pure; `verify:toolbox capability.*`.
 */

export interface CapabilityMatch {
  kind: Exclude<ToolKind, 'hook'>
  name: string
  scope: ToolScope
  active: ToolActive
}

export type CapabilityAnswer =
  | { kind: 'has'; matches: CapabilityMatch[] }
  | { kind: 'inactive'; matches: CapabilityMatch[] }
  | { kind: 'lacks'; pluginsUnread: number }
  | { kind: 'unknown'; why: string }

/** `/review`, `@reviewer`, ` Review ` → `review`. Empty when nothing is left to ask. */
export function normalizeCapability(raw: string): string {
  return raw.trim().replace(/^[/@]+/, '').toLowerCase()
}

/** Whether an entry's name answers the query: exactly, or as a namespaced command's last part (`ns:review`). */
function nameMatches(name: string, q: string): boolean {
  const n = name.toLowerCase()
  return n === q || n.endsWith(`:${q}`)
}

/**
 * One panel's answer. `result` undefined is "not read yet". A `no-cwd` result
 * is not an agent at all and answers null, so a surface lists nothing for it
 * rather than "unknown" beside a panel that has no toolbox to know.
 */
export function capabilityOf(query: string, result: ToolInventoryResult | undefined): CapabilityAnswer | null {
  const q = normalizeCapability(query)
  if (result === undefined) return { kind: 'unknown', why: 'not read yet' }
  if (result.kind === 'no-cwd') return null
  if (result.kind === 'unavailable') return { kind: 'unknown', why: result.reason }
  const inv = result.inventory
  const matches: CapabilityMatch[] = []
  for (const e of inv.entries) {
    if (e.kind === 'hook') continue
    if (nameMatches(e.name, q)) matches.push({ kind: e.kind, name: e.name, scope: e.scope, active: e.active })
  }
  const live = matches.filter((m) => m.active.kind === 'active')
  if (live.length > 0) return { kind: 'has', matches: live }
  if (matches.length > 0) return { kind: 'inactive', matches }
  // A cut inventory cannot say "lacks": the name may be among what was dropped.
  const o = inv.overflow
  const cut = o.skills + o.commands + o.agents + o.mcp + o.total
  if (cut > 0) return { kind: 'unknown', why: `the toolbox was cut at its cap — ${cut} ${cut === 1 ? 'entry' : 'entries'} not read` }
  return { kind: 'lacks', pluginsUnread: inv.pluginsEnabled.length }
}

const ACTIVE_WORDS: Record<ToolActive['kind'], string> = {
  active: 'active',
  disabled: 'disabled',
  'needs-approval': 'needs approval',
  unknown: 'state unknown'
}

/** One line for a row, after the panel's name. */
export function capabilityWords(query: string, answer: CapabilityAnswer): string {
  const q = normalizeCapability(query)
  const first = (a: { matches: CapabilityMatch[] }): string => {
    const m = a.matches[0]
    const more = a.matches.length > 1 ? ` (+${a.matches.length - 1} more)` : ''
    return `${m.kind} ${m.name} · ${m.scope}${more}`
  }
  switch (answer.kind) {
    case 'has': return `has ${first(answer)}`
    case 'inactive': return `${first(answer)} — ${ACTIVE_WORDS[answer.matches[0].active.kind]}`
    case 'lacks': return answer.pluginsUnread === 0 ? `no ${q}` : `no ${q} — ${answer.pluginsUnread} plugin${answer.pluginsUnread === 1 ? '' : 's'} not read may provide it`
    case 'unknown': return `unknown — ${answer.why}`
  }
}

/** Display order: who can, who nearly can, who cannot say, who cannot. */
export const CAPABILITY_ORDER: Record<CapabilityAnswer['kind'], number> = { has: 0, inactive: 1, unknown: 2, lacks: 3 }
