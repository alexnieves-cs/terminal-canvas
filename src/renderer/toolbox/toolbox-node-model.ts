import type { ToolboxSource } from '@shared/toolbox'
import type { ToolEntry, ToolInventoryResult, ToolScope } from '@shared/toolbox'

/**
 * The toolbox node's own view model: pure, no DOM, no React — which is what
 * puts it in the plain-node verify tier beside `review-node-model.ts` and
 * `file-node-model.ts`, and why it joins `rail-entry.cjs` rather than getting a
 * suite of its own.
 *
 * It is a SECOND reader of `ToolInventoryResult`, deliberately, and it differs
 * from `buildToolboxFields` on exactly one decision — the same divergence
 * `review-node-model.ts` records against `buildReviewFields`, for the same
 * reason. The pane is a strip inside a 260px column that must VANISH when it
 * has nothing to say. A node is a panel the user deliberately opened, placed
 * and dragged, and a panel that renders nothing at all is indistinguishable
 * from a broken one — so every arm here renders a heading and a sentence,
 * including the ones the pane hides.
 */

export interface ToolboxNodeRow {
  id: string
  kind: string
  name: string
  scope: ToolScope
  state: string
  detail: string
  /** True when this entry is NOT active — the row the user came to find. */
  muted: boolean
  /**
   * M140 (backlog #26's write half beyond skills). The FILE this entry came
   * from, carried on the row so the node's Open door names the same file the
   * inventory read — a command, a subagent, a hook's settings file, an MCP
   * server's config — and opens it in the file panel, M22's editor.
   */
  sourcePath: string
}

export interface ToolboxNodeGroup {
  kind: string
  label: string
  rows: ToolboxNodeRow[]
  /** Entries of this kind beyond the cap. Zero when everything fits. */
  more: number
}

export interface ToolboxNodeModel {
  heading: string
  directory: string
  summary: string
  /** The honest arms' explanation. Absent when there is nothing to explain. */
  note?: string
  groups: ToolboxNodeGroup[]
  /** Per-file permission counts, never merged across files. */
  permissions: { path: string; scope: ToolScope; allow: number; deny: number; ask: number }[]
  /** Toggles naming things this app could not read. */
  unresolved: string[]
  /** When main last read disk, or 0 before the first answer. */
  readAt: number
  /** True when a config file this panel's agent reads has changed since it started. */
  stale: boolean
  staleNote?: string
}

/**
 * A node has a whole panel to fill, unlike the 260px pane, so its cap is
 * larger — `REVIEW_NODE_FILE_CAP`'s own argument. Per KIND rather than
 * overall, because a hundred skills must not push every MCP server off the
 * bottom of a list whose whole purpose is answering "can this agent do X".
 */
export const TOOLBOX_NODE_ROW_CAP = 40

const GROUP_ORDER = ['skill', 'command', 'agent', 'mcp', 'hook'] as const
const GROUP_LABEL: Record<string, string> = {
  skill: 'Skills',
  command: 'Slash commands',
  agent: 'Subagents',
  mcp: 'MCP servers',
  hook: 'Hooks'
}

function stateLabel(entry: ToolEntry): { state: string; muted: boolean } {
  const active = entry.active
  if (active.kind === 'active') return { state: '', muted: false }
  if (active.kind === 'disabled') return { state: 'disabled', muted: true }
  if (active.kind === 'needs-approval') return { state: 'needs approval', muted: true }
  return { state: `unknown (${active.why})`, muted: true }
}

function rowOf(entry: ToolEntry): ToolboxNodeRow {
  const { state, muted } = stateLabel(entry)
  if (entry.kind === 'hook') {
    return {
      id: entry.id,
      kind: entry.kind,
      // A hook has no name, so its identity is a COORDINATE and it renders as
      // one. Synthesising a name here is the fix that breaks the feature: a
      // fabricated name in a list starts matching searches it has no business
      // matching.
      name: `${entry.event}${entry.matcher === '' ? '' : ` · ${entry.matcher}`}`,
      scope: entry.scope,
      state,
      // The PROGRAM and the real length, never the command string — see
      // HookToolEntry.program for why the command itself never crosses IPC at
      // all, so there is nothing here to render even if this wanted to.
      detail: `${entry.program} · ${String(entry.commandChars)} chars`,
      muted,
      sourcePath: entry.sourcePath
    }
  }
  if (entry.kind === 'mcp') {
    const env =
      entry.envKeys.length === 0
        ? ''
        : ` · env: ${entry.envKeys.join(', ')}${entry.envKeysOverflow > 0 ? ` +${String(entry.envKeysOverflow)}` : ''}`
    return {
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      scope: entry.scope,
      state,
      // Arg COUNT, never the argv — see McpToolEntry.argCount. The row says it
      // is partial rather than looking whole, which is what makes the omission
      // honest instead of invisible.
      detail: `${entry.transport} · ${entry.command} · ${String(entry.argCount)} args${env}`,
      muted,
      sourcePath: entry.sourcePath
    }
  }
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    scope: entry.scope,
    state,
    // The ellipsis is added HERE rather than at the cap, because the cap is
    // reported as a number the model was handed and never recomputed from the
    // rendered string — file-node-model's `truncatedLines` rule.
    detail: entry.descriptionTruncated ? `${entry.description}…` : entry.description,
    muted,
    sourcePath: entry.sourcePath
  }
}

export function buildToolboxNodeModel(input: {
  source: ToolboxSource
  title: string | undefined
  result: ToolInventoryResult | undefined
}): ToolboxNodeModel {
  // The honest chain's first link, reaching a fifth kind: a user's own title
  // outranks everything derived.
  // M67. The DIRECTORY's basename, the split the rail row already makes:
  // the source panel's label made a heading like `toolbox · claude — api`
  // (or, from the harness, a forty-character path) that named the wrong
  // thing — a toolbox is a directory's, not a panel's. The full directory
  // still leads the body.
  const cwd = input.source.cwd.replace(/\/+$/, '')
  const heading = input.title ?? `toolbox · ${cwd.slice(cwd.lastIndexOf('/') + 1) || cwd}`
  const base = {
    heading,
    directory: input.source.cwd,
    groups: [],
    permissions: [],
    unresolved: [],
    readAt: 0,
    stale: false
  }

  // Every arm below renders a heading and a sentence. A node that rendered
  // nothing would be indistinguishable from a broken one — the whole reason
  // this module exists rather than calling buildToolboxFields.
  if (input.result === undefined) {
    return { ...base, summary: 'reading…' }
  }
  if (input.result.kind === 'no-cwd') {
    return { ...base, summary: 'no directory', note: 'this panel has no directory to read' }
  }

  const inv = input.result.inventory
  const groups: ToolboxNodeGroup[] = []
  for (const kind of GROUP_ORDER) {
    const all = inv.entries.filter((entry) => entry.kind === kind)
    if (all.length === 0) continue
    groups.push({
      kind,
      label: GROUP_LABEL[kind] ?? kind,
      rows: all.slice(0, TOOLBOX_NODE_ROW_CAP).map(rowOf),
      more: Math.max(0, all.length - TOOLBOX_NODE_ROW_CAP)
    })
  }

  const broken = inv.sources.filter(
    (src) => src.status === 'unreadable' || src.status === 'malformed' || src.status === 'too-large'
  )
  const unresolved = [
    ...inv.unresolved.skillOverridesOff.map((n) => `skill off: ${n}`),
    ...inv.unresolved.mcpEnabled.map((n) => `mcp enabled: ${n}`),
    ...inv.unresolved.mcpDisabled.map((n) => `mcp disabled: ${n}`)
  ]

  const total = inv.entries.length
  return {
    ...base,
    summary:
      total === 0
        ? 'nothing installed for this directory'
        : `${String(total)} in ${String(groups.length)} group${groups.length === 1 ? '' : 's'}`,
    ...(broken.length > 0
      ? {
          note: broken
            .map((src) => `${src.what} (${src.scope}): ${src.status}${src.detail === undefined ? '' : ` — ${src.detail}`}`)
            .join('; ')
        }
      : {}),
    groups,
    permissions: inv.permissions.map((p) => ({
      path: p.path,
      scope: p.scope,
      allow: p.allow,
      deny: p.deny,
      ask: p.ask
    })),
    unresolved,
    readAt: inv.readAt,
    // A fact about FILES, never a claim about the running agent. See
    // ConfigFreshness for why the wording is load-bearing: an mtime bump with
    // no semantic change would otherwise read as "your agent is missing X".
    stale: inv.freshness.kind === 'stale',
    ...(inv.freshness.kind === 'stale'
      ? {
          staleNote: `config on disk has changed since this panel started: ${inv.freshness.changedPaths
            .slice(0, 3)
            .map((p) => p.slice(p.lastIndexOf('/') + 1))
            .join(', ')}`
        }
      : {})
  }
}
