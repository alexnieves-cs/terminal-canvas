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

/** One panel asked: its id, its name, and the directory the inspector's rule gave it. */
export interface CapabilityAsk { panelId: string; label: string; cwd: string }
export interface CapabilityRow { panelId: string; label: string; answer: CapabilityAnswer }

/**
 * M366. The question asked of every panel at once, by BOTH doors — the
 * palette scope (M365) and `tc toolbox` — so neither groups directories its
 * own way. Each DISTINCT directory is read once (panels in one repository
 * share a toolbox), asked for the first panel naming it. A read that throws
 * is `unknown`, never a missing row: a panel that did not answer is still a
 * panel that was asked. Rows keep the asked order; a door sorts by
 * `CAPABILITY_ORDER` if it wants to.
 */
export async function capabilityAcross(
  query: string,
  asked: readonly CapabilityAsk[],
  read: (panelId: string, cwd: string) => Promise<ToolInventoryResult>
): Promise<CapabilityRow[]> {
  const byCwd = new Map<string, string>()
  for (const a of asked) if (!byCwd.has(a.cwd)) byCwd.set(a.cwd, a.panelId)
  const pairs = await Promise.all([...byCwd].map(async ([cwd, panelId]) => {
    try { return [cwd, await read(panelId, cwd)] as const } catch { return [cwd, { kind: 'unavailable', reason: 'the toolbox read did not answer' } as const] as const }
  }))
  const got = new Map<string, ToolInventoryResult>(pairs)
  return asked.flatMap((a) => {
    const answer = capabilityOf(query, got.get(a.cwd))
    return answer === null ? [] : [{ panelId: a.panelId, label: a.label, answer }]
  })
}
