import { isChatPanel, isReviewPanel, isTerminalPanel, isToolboxPanel, type Panel } from '../panels/panels'

/**
 * M194. Which directory a surface is INSPECTING, and nothing more.
 *
 * Not repository identity (D04 owns that), not a permission, not a place. It
 * resolves nothing on disk and grants nothing; main still judges every path it
 * is handed.
 *
 * FOUR arms, because three collapse two different silences into one. The pair
 * that is easy to merge and must not be:
 *
 * - `no-directory` — this KIND has no directory at all, or there is no
 *   selection. It carries NO sentence on purpose: every consumer already had a
 *   better one that names the panel or the kind (`FileTree`'s M48 §5 rule, the
 *   inspector's `KIND_NOUN` line), and a generic sentence invented here would
 *   replace a specific one that was already right.
 * - `absent` — the kind CAN have a directory and this object has none. Only a
 *   sandboxed chat is one today, and it needs its own words: its app-owned
 *   folder under `userData/sandbox` is a real path, and answering it would
 *   present a scratch directory as the user's project in the Files tree, the
 *   Tools inventory and — through `skillsCwd` — the `skill:create` and
 *   teammate-assign doors. The path is deliberately never named, the same
 *   decision `chatHeaderLine` made at M120 (`sandboxed · no folder`).
 * - `unavailable` — it should have one and this one cannot be used.
 *
 * The `surface` discriminator is a seam rather than a smell: the four kinds
 * genuinely answer differently per surface (a terminal's LIVE cwd for Files
 * against its CONFIGURED cwd for Tools; review on Files only; toolbox on Tools
 * only), and the alternative is two near-identical functions that drift.
 */
export type InspectionDirectory =
  | { kind: 'known'; cwd: string }
  | { kind: 'no-directory' }
  | { kind: 'absent'; reason: string }
  | { kind: 'unavailable'; reason: string }

export function inspectionDirectory(panel: Panel | undefined, surface: 'files' | 'tools', liveCwd?: string): InspectionDirectory {
  if (panel === undefined) return { kind: 'no-directory' }
  let cwd: string | undefined
  if (isChatPanel(panel)) {
    if (panel.chat.sandbox) return { kind: 'absent', reason: 'sandboxed — no project folder to read' }
    cwd = panel.chat.cwd
  } else if (isTerminalPanel(panel)) cwd = surface === 'files' ? liveCwd ?? panel.spec.cwd : panel.spec.cwd
  else if (surface === 'files' && isReviewPanel(panel)) cwd = panel.subject.repoRoot
  else if (surface === 'tools' && isToolboxPanel(panel)) cwd = panel.source.cwd
  else return { kind: 'no-directory' }
  if (typeof cwd !== 'string' || cwd.trim() === '') return { kind: 'unavailable', reason: 'its working directory is not recorded' }
  // The SAME test main applies before it reads (`TOOLBOX_READ`), applied here
  // so both surfaces refuse the same string. Without it Files answered `known`
  // for a relative cwd and `fs:list` resolved it against the MAIN process's
  // working directory, painting a plausible basename over whatever that hit,
  // while Tools refused the identical value.
  if (!cwd.startsWith('/') && !cwd.startsWith('~')) return { kind: 'unavailable', reason: `its working directory is not an absolute path (${cwd})` }
  return { kind: 'known', cwd }
}
