/**
 * M126. The enabled plugins, from the CLI's own answer.
 *
 * `docs/ideas-backlog.md` #26 declined plugin skills because
 * `~/.claude/plugins` is 663 MB containing 700 SKILL.md files. This is the
 * answer that makes them affordable: `claude plugin list --json` names each
 * plugin's own `installPath`, so the walk is bounded to the enabled ones
 * rather than being a recursive descent from the cache root.
 *
 * `enabled` is the CLI's answer, not this app's inference from
 * `enabledPlugins` — a disabled plugin's skills are available to no agent, and
 * listing them would answer "what can this agent do" with a lie.
 *
 * The runner is INJECTED (agent-runner.ts's shape, narrowed to what this
 * one-shot call needs), so every check drives a fake and no suite spawns the
 * real CLI.
 */
export interface PluginRecord {
  id: string
  installPath: string
  enabled: boolean
}

export type PluginListResult =
  | { kind: 'ok'; plugins: PluginRecord[] }
  /** Absent CLI, non-zero exit, unparseable output, or a timeout. NEVER `[]`. */
  | { kind: 'unknown'; why: string }

export type PluginRunner = () => Promise<{ stdout: string; code: number }>

export const PLUGIN_LIST_TIMEOUT_MS = 5_000

export async function listPlugins(
  run: PluginRunner,
  timeoutMs: number = PLUGIN_LIST_TIMEOUT_MS
): Promise<PluginListResult> {
  let res: { stdout: string; code: number }
  // NOT unref'd. An unref'd timer is defeated the instant it is the last
  // handle left on the loop — exactly the shape of `verify-file.cjs`'s own
  // IIFE, which exits the moment its event loop empties. A suite hitting
  // this arm read as green with `plugins.1e`, the final tally and the
  // cleanup all silently never having run — a fix round's whole finding.
  // Cleared on whichever side settles first, so the ordinary fast path
  // still leaves no pending handle behind it.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    res = await Promise.race([
      run().finally(() => {
        if (timer !== undefined) clearTimeout(timer)
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), timeoutMs)
      })
    ])
  } catch (e) {
    return { kind: 'unknown', why: String(e instanceof Error ? e.message : e) }
  }
  if (res.code !== 0) return { kind: 'unknown', why: `claude plugin list exited ${res.code}` }
  let parsed: unknown
  try {
    parsed = JSON.parse(res.stdout)
  } catch {
    return { kind: 'unknown', why: 'claude plugin list did not return JSON' }
  }
  if (!Array.isArray(parsed)) return { kind: 'unknown', why: 'plugin list was not an array' }
  const plugins: PluginRecord[] = []
  for (const raw of parsed) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    if (r.enabled !== true) continue
    if (typeof r.id !== 'string' || typeof r.installPath !== 'string') continue
    plugins.push({ id: r.id, installPath: r.installPath, enabled: true })
  }
  return { kind: 'ok', plugins }
}
