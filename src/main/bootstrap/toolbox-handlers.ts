import { existsSync, realpathSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { shell } from 'electron'
import { expandTilde, resolveCwd } from '../pty-manager'
import { resolveToolboxHome } from '../toolbox-read'
import { skillWriteHandlers } from '../skill-write'
import { listPlugins, PLUGIN_LIST_TIMEOUT_MS, type PluginRunner } from '../plugin-list'
import { describePlugin } from '../plugin-details'
import type { Places } from './places'
import type { MainState } from './context'

/**
 * M126/M128. The two real `PluginRunner`s: `claude plugin list --json` and
 * `claude plugin details <id>` over `child_process`, resolved through the SAME
 * `claudePath` the startup probe already found (or the bare name, which
 * `listPlugins` turns into `unknown` on the resulting ENOENT — never a throw).
 *
 * Kept to the shape `listPlugins` needs (stdout + exit code) rather than the
 * full `AgentProcess` streaming shape agent-runner.ts defines: these are
 * call-and-done, not a conversation. `details` takes a zero-argument runner
 * (the id rides in the closure) so the timeout race in `plugin-list.ts` can be
 * shared byte for byte.
 */
export function createToolboxHandlers(state: MainState, places: Places) {
  const runClaudePluginList: PluginRunner = () =>
    new Promise((resolve) => {
      execFile(state.claudePath ?? 'claude', ['plugin', 'list', '--json'], { env: state.loginEnv, timeout: PLUGIN_LIST_TIMEOUT_MS }, (error, stdout) => {
        // Absent binary (ENOENT), a non-zero exit, or any other spawn failure
        // all read the same way here: `listPlugins` only asks whether the code
        // was zero, so any error becomes a non-zero code rather than a thrown
        // rejection this Promise never produces.
        if (error !== null) {
          resolve({ stdout: '', code: 1 })
          return
        }
        resolve({ stdout, code: 0 })
      })
    })

  // Built the same way and deliberately NOT folded into the list runner:
  // `describePlugin` takes a zero-argument runner (the id rides in this
  // closure) so the timeout race in `plugin-list.ts` is shared byte for byte.
  const runClaudePluginDetails = (id: string): PluginRunner => () =>
    new Promise((resolve) => {
      execFile(state.claudePath ?? 'claude', ['plugin', 'details', id], { env: state.loginEnv, timeout: PLUGIN_LIST_TIMEOUT_MS }, (error, stdout) => {
        if (error !== null) {
          resolve({ stdout: '', code: 1 })
          return
        }
        resolve({ stdout, code: 0 })
      })
    })

  const listAll = (): ReturnType<typeof listPlugins> => listPlugins(runClaudePluginList)

  /**
   * The id is CHECKED against the list first, and never passed through from
   * the renderer as given: the runner builds an argv for a real binary, and
   * the only ids this app has any business asking about are the ones
   * `listPlugins` just answered with. `unknown` with a why is the same
   * three-state shape every other arm returns, so an id that is not on the
   * list reads as "we could not look this up" rather than as a plugin that
   * ships nothing.
   */
  const pluginDetails = async (id: string) => {
    const listed = await listAll()
    if (listed.kind === 'ok' && !listed.plugins.some((p) => p.id === id)) {
      return { kind: 'unknown' as const, why: 'not an enabled plugin' }
    }
    return describePlugin(runClaudePluginDetails(id), id)
  }

  /**
   * M129. The four writers, with every dependency resolved HERE and none of
   * them nameable by the renderer: the writable roots are derived from the
   * asking panel's own cwd (through `resolveCwd`, the same expansion a spawn
   * gets) and the home the toolbox reads, the plugin paths are the CLI's own
   * answer, and `trash` is `shell.trashItem` so a delete is recoverable in the
   * Finder rather than gone.
   */
  const skillWrite = skillWriteHandlers({
    resolveCwd,
    /**
     * M196 (D04). D02's inherited item, closed — and NARROWED to the door it
     * is about after the critic found the first cut had closed three others.
     *
     * A DISPATCHED chat's cwd is a worktree LANE, so a project skill CREATED
     * from one landed in `userData/worktrees/…/.claude/skills` and went with
     * the lane, having never been in the repository the person meant. This
     * names where a NEW project skill goes and nothing else.
     *
     * The first cut wrapped `resolveCwd` instead, which also moved
     * `skillRoots` — the CONTAINMENT list every verb is judged against — so
     * `write`, `rename` and `remove` were refused for a project skill opened
     * from a lane, saying it was "outside every skills folder this app may
     * write" about a file sitting in the repository's own checkout. A door
     * that worked before the milestone, closed by it, with a sentence that
     * was actively wrong. `skillRoots` therefore keeps the asking cwd's own
     * project root as well (`depsFor` below), so nothing that was writable
     * stopped being writable.
     *
     * `existsSync` is the second half of that narrowing. `resolveCwd` falls
     * back to the HOME directory for a path that does not exist — its own
     * comment calls that a spawn-safety fallback that must not be reused —
     * so a lane whose repository has since been moved or deleted (records
     * outlive their panels by design) would have written a *project* skill
     * into `~/.claude/skills`, indistinguishable from a user one, silently.
     */
    projectRootOf: (cwd) => { const root = places.laneRootOf(expandTilde(cwd)); return root !== undefined && existsSync(root) ? root : undefined },
    home: resolveToolboxHome,
    realpath: realpathSync,
    plugins: async () => {
      const listed = await listAll()
      // `unknown` reads as NO plugin paths, which only ever makes the
      // plugin refusal miss — never a write into a plugin's folder that
      // the containment check would then have to be trusted to catch, so
      // the roots below are what actually bound this.
      return listed.kind === 'ok' ? listed.plugins : []
    },
    trash: (path) => shell.trashItem(path)
  })

  return { listPlugins: listAll, pluginDetails, skillWrite }
}
