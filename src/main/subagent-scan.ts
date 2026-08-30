/**
 * The pure half of subagent detection: no fs, no electron, no node-pty, which
 * is what puts it in the plain-node verify tier beside git-args.ts.
 *
 * Everything here reads a format this repo does not own and cannot version.
 * The rule throughout is therefore that a surprise costs a NODE, never a
 * throw: this code runs per file, per panel, per 2s tick.
 */

export interface SubagentMeta {
  agentType: string
  description: string
  toolUseId: string
  spawnDepth: number
  model: string
}

/**
 * The project directory Claude Code derives from a cwd.
 *
 * INFERRED, not documented — read off 31 real directory names, every one of
 * which is consistent with "anything outside [A-Za-z0-9] becomes a dash".
 * `/repo/.claude/x` therefore yields `-repo--claude-x`: the double dash is the
 * dot AND the slash, and it is the case a `split('/').join('-')` gets wrong.
 *
 * None of those 31 samples contained an underscore or a space, so those two
 * are genuinely unknown. That is exactly why nothing trusts this answer — see
 * cwdOf: a claimed session is confirmed against its own recorded cwd, so a
 * wrong slug costs the feature rather than misattributing it.
 */
export function slugFor(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-')
}

/** A `.meta.json` sidecar, or null if it cannot be trusted. */
export function parseMeta(text: string): SubagentMeta | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  // toolUseId is REQUIRED and the others are not, because it is the only field
  // completion is keyed on: a record without it could never leave `running`,
  // and a node stuck running forever is worse than no node. The rest are
  // labels, and a missing label is a cosmetic gap.
  if (typeof o.toolUseId !== 'string' || o.toolUseId === '') return null
  return {
    agentType: typeof o.agentType === 'string' ? o.agentType : 'agent',
    description: typeof o.description === 'string' ? o.description : '',
    toolUseId: o.toolUseId,
    spawnDepth: typeof o.spawnDepth === 'number' ? o.spawnDepth : 1,
    model: typeof o.model === 'string' ? o.model : ''
  }
  // Unknown extra fields are ignored by construction: this rebuilds the object
  // field by field rather than spreading, the same rule M5a's absent `command`
  // already forces on four other layers.
}

/**
 * The cwd a transcript line records. This is the CONFIRMATION that makes
 * slugFor's inferred mapping safe to be wrong about.
 */
export function cwdOf(firstLine: string): string | null {
  try {
    const o = JSON.parse(firstLine) as Record<string, unknown>
    return typeof o.cwd === 'string' ? o.cwd : null
  } catch {
    return null
  }
}

/**
 * Which session directory a panel claims: the most recent one created after
 * the panel spawned, or none.
 *
 * The post-spawn filter is not a tidiness rule. Without it a panel running a
 * plain shell in a directory somebody used yesterday adopts that session and
 * renders its finished subagents — a canvas confidently attributing a
 * stranger's work to a panel that has spawned nothing.
 */
export function chooseSession(
  dirs: ReadonlyArray<{ name: string; createdAt: number }>,
  spawnedAt: number
): string | null {
  let best: { name: string; createdAt: number } | null = null
  for (const d of dirs) {
    if (d.createdAt < spawnedAt) continue
    if (!best || d.createdAt > best.createdAt) best = d
  }
  return best ? best.name : null
}

/**
 * Which panels may be attributed at all, given every panel's slug at once.
 *
 * A fact about the CANVAS, not about the filesystem, which is why it is a
 * separate function from chooseSession and takes the whole map: a per-panel
 * signature could not express it. Two panels in one repository is the ordinary
 * case in this app, and nothing on disk can tell "both are running claude"
 * from "one is running a shell" — a shell leaves no trace to rule it out. So
 * the strict direction is the correct one: refuse both.
 *
 * A null slug is a panel with no directory to resolve. It contributes nothing
 * and must not make its neighbours ambiguous, or one shell panel would disable
 * the feature for the whole canvas.
 */
export function attributable(slugs: ReadonlyMap<string, string | null>): Set<string> {
  const count = new Map<string, number>()
  for (const slug of slugs.values()) {
    if (slug === null) continue
    count.set(slug, (count.get(slug) ?? 0) + 1)
  }
  const allowed = new Set<string>()
  for (const [panelId, slug] of slugs) {
    if (slug === null) continue
    if (count.get(slug) === 1) allowed.add(panelId)
  }
  return allowed
}

/**
 * Which of `ids` appear as a COMPLETED tool_result in this chunk.
 *
 * The `tool_result` test is the whole function. Each toolUseId appears twice
 * in a parent transcript — as the tool_use that spawned the subagent and as
 * the tool_result that ended it — so a scan for the bare id marks every
 * subagent finished the instant it starts, and no node is ever seen running.
 */
export function scanForResults(chunk: string, ids: ReadonlySet<string>): Set<string> {
  const done = new Set<string>()
  if (ids.size === 0) return done
  for (const id of ids) {
    // Matched as a tool_use_id VALUE rather than by parsing every line: a
    // chunk is up to a tick's worth of appended transcript and may end
    // mid-line, so JSON.parse per line would drop the tail. The quoted-key
    // form is what keeps this from matching the spawning tool_use, whose id
    // sits under "id" instead.
    if (chunk.includes(`"tool_use_id":"${id}"`)) done.add(id)
  }
  return done
}
