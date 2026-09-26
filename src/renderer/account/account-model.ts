/**
 * M336–M337. What the account menu and the share dialog SAY, as pure
 * functions over the bridge's metadata — no DOM, no window — so verify:account
 * pins them under plain node.
 *
 * Imports types only: the renderer's account surfaces read the same
 * AccountSessionMeta the `tc` verbs print, and never a token (account.ts).
 */
import type { AccountSessionMeta, AccountStatus, ShareMemberRow } from '@shared/account'
import type { WorkspaceRole } from '@shared/canvas-ops'

/**
 * The top bar's account control. `hidden` when accounts are not configured
 * AND nobody is signed in: a door that can only refuse is noise at rest, and
 * the palette's Account row still says why (the rest layer never states a
 * zero value).
 */
export type AccountTrigger =
  | { kind: 'hidden' }
  | { kind: 'sign-in' }
  | { kind: 'account'; login: string; initials: string; others: number }

export function accountTrigger(status: AccountStatus | null, sessions: readonly AccountSessionMeta[]): AccountTrigger {
  const active = sessions[0]
  if (active !== undefined) return { kind: 'account', login: active.githubLogin, initials: initialsOf(active.githubLogin), others: sessions.length - 1 }
  if (status === null || !status.configured) return { kind: 'hidden' }
  return { kind: 'sign-in' }
}

/** Two letters from a GitHub login: `ada-lovelace` → AL, `octocat` → OC. */
export function initialsOf(login: string): string {
  const parts = login.split(/[-_.\s]+/).filter((p) => p !== '')
  const two = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : login.slice(0, 2)
  return two.toUpperCase()
}

/** The one sentence the dialog says about what sharing sends, so the promise and the code never drift apart. */
export const SHARE_SENDS = 'Teammates see each panel as a card: its place, its kind, a scrubbed title and who owns it. No command, folder or transcript leaves this Mac.'

/** What a role lets a person do on a shared canvas, in the words the picker uses. */
export function roleSentence(role: WorkspaceRole): string {
  switch (role) {
    case 'owner': return 'arranges everything and decides who is in'
    case 'editor': return 'moves any card, adds and removes their own'
    case 'viewer': return 'watches; cannot move anything'
  }
}

/**
 * The choices the owner's picker offers for one person. The owner's own row
 * offers nothing (set_workspace_member refuses it), and ownership is never
 * handed out here — the server refuses that too, so the picker never offers it.
 */
export function roleChoices(viewer: WorkspaceRole | null, row: ShareMemberRow): Array<WorkspaceRole | null> {
  if (viewer !== 'owner' || row.me || row.role === 'owner') return []
  return ['editor', 'viewer', null]
}

/** The label a choice carries: null is "not in", which removes them when they were. */
export function roleLabel(role: WorkspaceRole | null): string {
  return role === null ? 'Not in' : role[0]!.toUpperCase() + role.slice(1)
}
