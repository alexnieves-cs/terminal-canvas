/**
 * The Terminal Canvas account — a Supabase Auth session, signed in through
 * GitHub — as the renderer and the `tc` CLI may see it.
 *
 * Note what is ABSENT from every shape here: no access token, no refresh
 * token, no code verifier. A session's secrets live in the credential store
 * and cross the bridge in neither direction — the same rule as `credential:*`,
 * and for the same reason (CLAUDE.md, "there is no credential:get").
 *
 * Imports nothing, like credential-schema.ts, so main, the renderer and the
 * plain-node verify tier read one declaration.
 */

export interface AccountSessionMeta {
  /** GitHub's numeric user id, as a string — the credential key's tail. */
  githubId: string
  githubLogin: string
  /** The Supabase auth user id (auth.users.id). */
  userId: string
  /** ISO time the access token expires; a refresh token outlives it. */
  expiresAt: string
  addedAt: string
}

export type AccountLoginResult =
  | { kind: 'signed-in'; session: AccountSessionMeta; org?: { id: string; name: string } }
  | { kind: 'declined'; reason: string }
  | { kind: 'refused' | 'failed'; reason: string }

/** M336. Choosing the active account among several signed in on this Mac. */
export type AccountUseResult =
  | { kind: 'ok'; session: AccountSessionMeta }
  | { kind: 'refused'; reason: string }

/** M336. Whether accounts are configured here at all; `reason` names the missing variable. */
export type AccountStatus = { configured: true } | { configured: false; reason: string }

export type AccountLogoutResult =
  | { kind: 'signed-out'; githubIds: string[] }
  | { kind: 'refused'; reason: string }

export type InviteRole = 'member' | 'admin'
export const INVITE_ROLES: readonly InviteRole[] = ['member', 'admin']

export type AccountInviteResult =
  /** `code` is the ONE time the plaintext exists outside the person's hands; only its sha256 is stored. */
  | { kind: 'invited'; code: string; orgId: string; orgName: string; role: InviteRole; expiresAt: string }
  | { kind: 'refused' | 'failed'; reason: string }

export type AccountJoinResult =
  | { kind: 'joined'; orgId: string; orgName: string; role: InviteRole }
  | { kind: 'declined'; reason: string }
  | { kind: 'refused' | 'failed'; reason: string }

/** The one not-signed-in sentence, for every door that needs a session. */
export const NOT_SIGNED_IN = 'not signed in — run `tc login` or sign in from the app first'

/**
 * Shared workspaces (supabase workspace_shares/workspace_members). A share is
 * a room two people's per-machine workspaces meet in; the role is per share,
 * not per org — see canvas-ops.ts's table for what each may do.
 */
/** canvas-ops.ts's WorkspaceRole, spelled out: this file imports nothing. */
export interface WorkspaceShareRow { id: string; orgId: string; name: string; role: 'owner' | 'editor' | 'viewer' }
export type ShareResult =
  | { kind: 'ok'; share: WorkspaceShareRow }
  | { kind: 'refused' | 'failed'; reason: string }
export type ShareListResult =
  | { kind: 'ok'; shares: WorkspaceShareRow[] }
  | { kind: 'refused' | 'failed'; reason: string }
/** M337. One person in the share's organization, and their role in the share (null: not in it). */
export interface ShareMemberRow { userId: string; login: string; role: 'owner' | 'editor' | 'viewer' | null; me: boolean }
export type ShareMembersResult =
  | { kind: 'ok'; orgId: string; members: ShareMemberRow[] }
  | { kind: 'refused' | 'failed'; reason: string }
export type ShareMemberResult =
  | { kind: 'ok' }
  | { kind: 'refused' | 'failed'; reason: string }
