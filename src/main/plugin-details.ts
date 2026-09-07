/**
 * M128. `claude plugin details <id>`, VERBATIM.
 *
 * Measurement 5 of the Act III spec: this command has NO `--json`. It prints
 * a human-formatted table — `Skills (14)  brainstorming, …`, `Always-on: ~688
 * tok`, a per-component always-on / on-invoke listing — and the shape of that
 * table is the CLI's to change without telling anybody. So nothing here
 * parses it: the text crosses the bridge as one string and the panel renders
 * it in a `<pre>`. A parser would be a differential between two versions of
 * the CLI that goes wrong silently, for exactly the users whose plugin
 * happens to print an extra line.
 *
 * The runner is INJECTED and the timeout is `plugin-list.ts`'s, deliberately:
 * these two are one door onto the same CLI, and a details call that outlived
 * a list call would be a second answer to "how long do we wait" that nobody
 * would think to keep in step.
 *
 * Three-state, never two. `unknown` with a WHY covers an absent CLI, a
 * non-zero exit and a timeout alike — an empty string here would read as a
 * plugin that ships nothing, which is `SkillResources`' own refusal.
 */
import { PLUGIN_LIST_TIMEOUT_MS, type PluginRunner } from './plugin-list'
import type { PluginDetailsResult } from '@shared/skills'

export type { PluginDetailsResult }

/** Same shape as `PluginRunner`; the id rides in the caller's closure. */
export type PluginDetailsRunner = PluginRunner

export async function describePlugin(
  run: PluginDetailsRunner,
  id: string,
  timeoutMs: number = PLUGIN_LIST_TIMEOUT_MS
): Promise<PluginDetailsResult> {
  let res: { stdout: string; code: number }
  // NOT unref'd — `plugin-list.ts`'s own note, and the fix round that wrote
  // it: an unref'd timer is defeated the instant it is the last handle on the
  // loop, and a plain-node suite waiting on this arm exits 0 with its tally
  // never printed.
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
  if (res.code !== 0) return { kind: 'unknown', why: `claude plugin details ${id} exited ${res.code}` }
  if (res.stdout.trim() === '') return { kind: 'unknown', why: `claude plugin details ${id} printed nothing` }
  return { kind: 'ok', text: res.stdout }
}
