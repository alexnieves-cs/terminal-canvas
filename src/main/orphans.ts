/**
 * M55 — which sessions are orphans, and how to ask about them.
 *
 * Pure. `findOrphans` is fed by `ptyManager.list()`, whose tmux rows have
 * already been through `parseListOutput`'s dead-pane filter — so a corpse is
 * never a candidate by construction, and this module adds no second filter
 * that could disagree with the first. The known set must be EVERY
 * workspace's ids: a session kept across quit (M38) for a panel in a hidden
 * workspace is not an orphan, and a set built from the active workspace
 * alone kills it at the next launch — the defect verify:tmux orphan.1 pins.
 */
import type { OrphanRow } from '../shared/orphans'

export function findOrphans(
  sessions: readonly { panelId: string; pid: number; command: string; cwd: string }[],
  known: Iterable<string>
): OrphanRow[] {
  const ids = new Set(known)
  return sessions
    .filter((s) => !ids.has(s.panelId))
    .map((s) => ({ panelId: s.panelId, pid: s.pid, command: s.command, cwd: s.cwd }))
}

/** More rows than this and the dialog is taller than the screen. */
export const PROMPT_ROWS_MAX = 12

export function orphanPrompt(rows: readonly OrphanRow[]): { message: string; detail: string; buttons: string[] } {
  const n = rows.length
  const shown = rows.slice(0, PROMPT_ROWS_MAX)
  const lines = shown.map((r) => `${r.panelId}  ${r.command === '' ? 'shell' : r.command}  ${r.cwd}  (pid ${r.pid})`)
  if (n > shown.length) lines.push(`+${n - shown.length} more`)
  return {
    message: n === 1
      ? '1 session from a previous run has no panel. Restore it, or discard it?'
      : `${n} sessions from a previous run have no panel. Restore them, or discard them?`,
    detail:
      `${lines.join('\n')}\n\n` +
      'Restore adopts each session as a panel on this canvas, where it keeps running. ' +
      'Discard ends them now; a discarded session cannot be recovered.',
    buttons: ['Restore', 'Discard']
  }
}
