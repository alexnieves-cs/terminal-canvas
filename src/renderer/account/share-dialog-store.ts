/**
 * M337. Who asked for the share dialog, and for what. A module-level store
 * rather than a Canvas prop, so the account menu, the palette's rows and a
 * verb arriving through the agent door all reach ONE dialog without a new
 * field threaded through ActionCtx.
 *
 * A request from a door (`tc plan …`, a workflow action node) only PREFILLS
 * the dialog: the person's click is what shares, opens or changes a role —
 * the `tc login` rule (a door an agent can reach proposes; a person commits).
 */
import type { WorkspaceRole } from '@shared/canvas-ops'

export type ShareDialogRequest =
  /**
   * Share the active workspace, or manage its members when it already is.
   * `proposal.who` is a user id or a GitHub login — whatever the door had;
   * the dialog matches it against the share's members.
   */
  | { mode: 'manage'; orgId?: string; proposal?: { who: string; role: WorkspaceRole | null } }
  /** The shares this person is in; Open brings one here as a workspace. */
  | { mode: 'open'; shareId?: string }

type Listener = (request: ShareDialogRequest | null) => void
let current: ShareDialogRequest | null = null
const listeners = new Set<Listener>()

export function openShareDialog(request: ShareDialogRequest): void {
  current = request
  for (const l of listeners) l(current)
}

export function closeShareDialog(): void {
  current = null
  for (const l of listeners) l(null)
}

export function shareDialogRequest(): ShareDialogRequest | null {
  return current
}

export function onShareDialog(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
