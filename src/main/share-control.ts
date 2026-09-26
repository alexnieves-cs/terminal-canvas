/**
 * M336–M337. The account-picker and sharing verbs as the `tc` socket sees
 * them: `tc accounts`, `tc use`, `tc shares`, `tc share`, `tc open-share`,
 * `tc share-role`.
 *
 * The rule is `tc login`'s (account-session.ts): any agent in any terminal
 * can reach the socket, so every verb that CHANGES something — who the app
 * acts as, which organization sees a canvas, who is in — puts a
 * Cancel-default dialog in front of a person first. The two lists are
 * read-only and answer at once. The URL door never reaches any of these: its
 * host list is `open` and `task` (control-protocol.ts).
 *
 * No electron import: the dialog, the account and the share doors are
 * injected, so verify:account drives every arm under plain node.
 */
import type { AccountSessionMeta, ShareListResult, ShareMemberResult, ShareMembersResult, ShareResult } from '../shared/account'
import type { WorkspaceRole } from '../shared/canvas-ops'
import type { AccountService } from './account-session'

export interface ShareControlDeps {
  account: Pick<AccountService, 'sessions' | 'use' | 'shareMembers' | 'team'>
  doors: {
    share(req: { orgId?: string }): Promise<ShareResult>
    shares(): Promise<ShareListResult>
    openShare(shareId: string): Promise<{ kind: 'ok'; workspaceId: string } | { kind: 'refused' | 'failed'; reason: string }>
    setShareMember(req: { shareId: string; userId: string; role: WorkspaceRole | null }): Promise<ShareMemberResult>
  }
  /** The active workspace's name, for the dialog's sentence. */
  activeWorkspaceName: () => string
  confirm: (ask: { message: string; detail: string; verb: string }) => Promise<boolean>
}

export type ShareControlReply =
  | { ok: true; [k: string]: unknown }
  | { ok: false; error: string; kind?: string }

const refused = (r: { kind: string; reason: string }): ShareControlReply => ({ ok: false, error: r.reason, kind: r.kind })
const declined = (what: string): ShareControlReply => ({ ok: false, error: `${what} was declined in the app`, kind: 'declined' })

export interface ShareControl {
  accounts(): ShareControlReply
  use(who: string): Promise<ShareControlReply>
  shares(): Promise<ShareControlReply>
  share(orgId?: string): Promise<ShareControlReply>
  openShare(shareId: string): Promise<ShareControlReply>
  shareRole(req: { shareId: string; who: string; role: WorkspaceRole | null }): Promise<ShareControlReply>
}

export function createShareControl(deps: ShareControlDeps): ShareControl {
  /** A login or a numeric id, case-insensitively — what a person would type. */
  const accountOf = (who: string): AccountSessionMeta | undefined =>
    deps.account.sessions().find((s) => s.githubId === who || s.githubLogin.toLowerCase() === who.toLowerCase())

  return {
    accounts() {
      // Metadata only, the active one first: the same rows the menu draws.
      const sessions = deps.account.sessions()
      return { ok: true, active: sessions[0]?.githubLogin ?? null, accounts: sessions.map((s) => ({ githubId: s.githubId, githubLogin: s.githubLogin })) }
    },

    async use(who) {
      const target = accountOf(who)
      if (target === undefined) return { ok: false, error: `no account ${who} is signed in on this Mac — \`tc accounts\` lists them`, kind: 'refused' }
      if (deps.account.sessions()[0]?.githubId === target.githubId) return { ok: true, active: target.githubLogin, changed: false }
      const yes = await deps.confirm({
        message: `Switch to ${target.githubLogin}?`,
        detail: 'A terminal asked to change which account this app acts as. Presence, sharing and the relay will act as this account.',
        verb: `Use ${target.githubLogin}`
      })
      if (!yes) return declined('switching accounts')
      const r = deps.account.use(target.githubId)
      return r.kind === 'ok' ? { ok: true, active: r.session.githubLogin, changed: true } : refused(r)
    },

    async shares() {
      const r = await deps.doors.shares()
      return r.kind === 'ok' ? { ok: true, shares: r.shares } : refused(r)
    },

    async share(orgId) {
      const name = deps.activeWorkspaceName()
      // The dialog NAMES the organization, resolved here the same way the
      // share will resolve it: a person in two orgs must see which one a
      // terminal picked, and an id they are not in is refused before asking.
      const team = await deps.account.team(orgId)
      if (team.kind !== 'ok') return refused(team)
      const yes = await deps.confirm({
        message: `Share “${name}” with ${team.org.name}?`,
        detail: 'A terminal asked to share this workspace. Teammates see each panel as a card — its place, kind, a scrubbed title and owner. No command, folder or transcript leaves this Mac.',
        verb: 'Share'
      })
      if (!yes) return declined('sharing')
      const r = await deps.doors.share({ orgId: team.org.id })
      return r.kind === 'ok' ? { ok: true, share: r.share } : refused(r)
    },

    async openShare(shareId) {
      const list = await deps.doors.shares()
      if (list.kind !== 'ok') return refused(list)
      const row = list.shares.find((s) => s.id === shareId)
      if (row === undefined) return { ok: false, error: 'you are not a member of that shared workspace', kind: 'refused' }
      const yes = await deps.confirm({
        message: `Open “${row.name}” here?`,
        detail: `A terminal asked to add this shared workspace to the app, as ${row.role}. Its panels arrive as cards; nothing starts on this Mac.`,
        verb: 'Open'
      })
      if (!yes) return declined('opening the shared workspace')
      const r = await deps.doors.openShare(shareId)
      return r.kind === 'ok' ? { ok: true, workspaceId: r.workspaceId } : refused(r)
    },

    async shareRole(req) {
      // Named in the dialog, like open-share: the id a terminal passed need
      // not be the workspace on screen.
      const list = await deps.doors.shares()
      if (list.kind !== 'ok') return refused(list)
      const share = list.shares.find((s) => s.id === req.shareId)
      if (share === undefined) return { ok: false, error: 'you are not a member of that shared workspace', kind: 'refused' }
      const members = await deps.account.shareMembers(req.shareId)
      if (members.kind !== 'ok') return refused(members)
      const row = pick(members, req.who)
      if (row === undefined) return { ok: false, error: `nobody called ${req.who} is in this workspace's organization`, kind: 'refused' }
      const label = req.role ?? 'not in'
      const yes = await deps.confirm({
        message: req.role === null ? `Remove ${row.login} from “${share.name}”?` : `Make ${row.login} ${label} of “${share.name}”?`,
        detail: 'A terminal asked to change who is in a shared workspace. Only its owner can; the server refuses anyone else.',
        verb: req.role === null ? 'Remove' : `Make ${label}`
      })
      if (!yes) return declined('the role change')
      const r = await deps.doors.setShareMember({ shareId: req.shareId, userId: row.userId, role: req.role })
      return r.kind === 'ok' ? { ok: true, login: row.login, role: req.role } : refused(r)
    }
  }
}

function pick(members: Extract<ShareMembersResult, { kind: 'ok' }>, who: string) {
  return members.members.find((m) => m.userId === who || m.login.toLowerCase() === who.toLowerCase())
}
