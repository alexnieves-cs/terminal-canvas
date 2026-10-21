/**
 * M509 (E6, backlog #55). Command panels: `> npm test` in the palette opens a
 * throwaway panel that runs it and shows its real exit code.
 *
 * The palette spawns PRESETS — named, persisted, repeated. This is the
 * sibling with zero ceremony: no sheet, no name, no row saved anywhere. It is
 * not a second spawn path either. The row submits the same SpawnRequest the
 * spawn sheet's typed task does (M65: main runs it as `/bin/sh -lc <command>`
 * in the login env, titles it with itself and asks for focus), so the panel
 * goes through main's resolution and the ordinary onSpawn; focus is what
 * makes it a user-initiated spawn, promoted live now rather than whenever the
 * camera arrives. Its exit is the registry's ordinary one: the process's own
 * code, written into the terminal and read by every state surface.
 *
 * Pure (no DOM, no bridge) so verify:palette cmd.* pins it under plain node.
 */

/** The one row a `>` query shows. */
export const COMMAND_ROW_ID = 'command.run'

/** Why the row is disabled while nothing follows the `>`. */
export const REASON_NO_COMMAND = 'type a command after > — it runs in a new panel'

/**
 * `> npm test` → `npm test`; `>` alone → ``; anything else → null. Only a
 * LEADING `>` counts: a query that merely contains one is a search like any
 * other, so `a > b` still finds rows.
 */
export function parseCommandQuery(query: string): string | null {
  const m = /^\s*>\s*([\s\S]*)$/.exec(query)
  return m === null ? null : m[1].trim()
}

/**
 * Where the command runs: the folder of the terminal the keyboard was in
 * last, because `> npm test` typed while working in a repository means THAT
 * repository; home when no terminal was ever focused. Main expands `~` and
 * refuses a folder that does not exist, by name.
 */
export function commandPanelCwd(
  terminals: ReadonlyArray<{ id: string; cwd: string }>,
  lastFocusedAt: Readonly<Record<string, number>>
): string {
  let best: { cwd: string; at: number } | null = null
  for (const t of terminals) {
    const at = lastFocusedAt[t.id] ?? 0
    if (at > 0 && (best === null || at > best.at)) best = { cwd: t.cwd, at }
  }
  return best?.cwd ?? '~'
}
