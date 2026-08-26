import { basename } from 'node:path'
import { DEFAULT_PRESET_ID, type Preset } from '../shared/layout-schema'

/**
 * The preset helpers, and deliberately NOTHING that touches the disk, the
 * environment, or Electron.
 *
 * `resolveAvailability` takes a `which` function rather than importing
 * shell-env.ts, for the same reason layout-store.ts takes its file path as a
 * parameter: an import of anything impure here would drag verify:layout out of
 * the plain-node tier, where every check costs a process spawn instead of a
 * function call.
 */

/**
 * Built-ins are CODE, not data, and never written to layout.json.
 *
 * Persisting them would mean deleting one brings it back on the next launch —
 * a bug with no good explanation — and it would grow a file that layout-store
 * rewrites in full on every coalesced save.
 *
 * `shell` carries no command on purpose: absent means "the user's login
 * shell", which only main can resolve, and hardcoding /bin/zsh here would give
 * every bash and fish user the wrong program.
 */
export const BUILT_IN_PRESETS: Preset[] = [
  { id: DEFAULT_PRESET_ID, name: 'Login shell', cwd: '~', args: ['-l'] },
  { id: 'claude', name: 'Claude', cwd: '~', command: 'claude', args: [] },
  { id: 'codex', name: 'Codex', cwd: '~', command: 'codex', args: [] }
]

/** Built-ins first, so the menu order is stable as the user adds their own. */
export function allPresets(user: Preset[]): Preset[] {
  return [...BUILT_IN_PRESETS, ...user]
}

/**
 * The format layer only checks that defaultPresetId LOOKS like an id; only
 * here is the built-in list known, so only here can "names nothing" be
 * detected. Falling back rather than returning null because Cmd+N doing
 * nothing at all is the worse failure.
 */
export function resolveDefault(user: Preset[], id: string): Preset {
  return allPresets(user).find((p) => p.id === id) ?? BUILT_IN_PRESETS[0]
}

/** Checked against the built-ins too, so `u`-ids can never shadow `claude`. */
export function mintPresetId(user: Preset[]): string {
  const used = new Set(allPresets(user).map((p) => p.id))
  let n = 1
  while (used.has(`u${n}`)) n += 1
  return `u${n}`
}

/**
 * M5a builds no modal, so a saved preset names itself. `~` becomes "home"
 * because basename('~') is '~', which reads as a typo rather than a place.
 */
export function autoName(
  spec: { command?: string; cwd: string },
  existing: Preset[]
): string {
  const command = spec.command ? basename(spec.command) : 'login shell'
  const where = spec.cwd === '~' ? 'home' : basename(spec.cwd)
  const base = `${command} — ${where}`
  const taken = new Set(existing.map((p) => p.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

export interface PresetAvailability {
  preset: Preset
  available: boolean
}

/**
 * A preset whose command is not on the resolved login PATH must not be
 * spawnable: it would open a panel that dies instantly with "command not
 * found", which reads as the app being broken rather than the CLI being
 * missing. Same loud-fallback posture as shell-env.ts and probeTmux.
 *
 * Cached per command because several presets commonly share one binary, and
 * `which` hits the filesystem once per PATH entry.
 */
export function resolveAvailability(
  presets: Preset[],
  which: (command: string) => string | null
): PresetAvailability[] {
  const cache = new Map<string, boolean>()
  return presets.map((preset) => {
    // No command means the login shell, which always exists.
    if (!preset.command) return { preset, available: true }
    let available = cache.get(preset.command)
    if (available === undefined) {
      available = which(preset.command) !== null
      cache.set(preset.command, available)
    }
    return { preset, available }
  })
}

/** Says WHY it is disabled. A greyed-out row with no reason is a bug report. */
export function menuLabel(entry: PresetAvailability): string {
  return entry.available ? entry.preset.name : `${entry.preset.name} — not found on PATH`
}
