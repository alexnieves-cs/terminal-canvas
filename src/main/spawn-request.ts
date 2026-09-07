import type { PresetTemplate, SpawnRequest, SpawnResult } from '../shared/ipc-contract'
import { templateOf } from './presets'
import type { Preset } from '../shared/layout-schema'

/**
 * M65. THE SPAWN SHEET'S REQUEST, RESOLVED — pure, so `verify:layout`
 * checks it under plain node and so main and the verify harness run the
 * SAME function rather than two copies that drift (the first cut had two,
 * and the harness's refusal string was the harness's own).
 *
 * A preset's template keeps an absent command absent (`templateOf`); the
 * sheet overrides only the directory, the agent options (for an agent
 * preset) and the title. A typed command becomes a task: the login shell
 * runs it (`-l`, so the user's PATH applies as in a terminal they typed it
 * into) and the panel is titled with it. The directory is checked by the
 * injected `isDirectory` — a FILE is refused too, not only a missing path,
 * because a file passes `existsSync` and dies at spawn with an error the
 * user reads as the app's.
 */
export function resolveSpawnRequest(
  req: SpawnRequest,
  presets: readonly Preset[],
  fs: { expand(raw: string): string; isDirectory(path: string): boolean }
): { kind: 'spawned'; template: PresetTemplate } | Extract<SpawnResult, { kind: 'refused' }> {
  const cwd = fs.expand(req.cwd)
  if (!fs.isDirectory(cwd)) return { kind: 'refused', reason: `no such directory: ${req.cwd}` }
  if (req.command !== undefined && req.command.trim() !== '') {
    const command = req.command.trim()
    const title = req.title !== undefined && req.title.trim() !== '' ? req.title.trim() : command
    return { kind: 'spawned', template: { cwd, command: '/bin/sh', args: ['-lc', command], title, focus: true } }
  }
  const found = presets.find((p) => p.id === req.presetId)
  if (found === undefined) return { kind: 'refused', reason: 'that preset no longer exists' }
  const template: PresetTemplate = { ...templateOf(found), cwd, focus: true }
  if (req.agentOptions !== undefined && template.agent !== undefined && Object.keys(req.agentOptions).length > 0) {
    template.agentOptions = { ...(template.agentOptions ?? {}), ...req.agentOptions }
  }
  if (req.worktree !== undefined) template.worktree = req.worktree
  // M147. The sheet's overrides sit over the preset's own; both are merged over the login env at spawn.
  if (req.env !== undefined && Object.keys(req.env).length > 0) template.env = { ...(template.env ?? {}), ...req.env }
  if (req.title !== undefined && req.title.trim() !== '') template.title = req.title.trim()
  return { kind: 'spawned', template }
}
