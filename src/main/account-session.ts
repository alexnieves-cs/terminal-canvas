/**
 * The Terminal Canvas account: sign in, sign out, sessions, invite, join.
 *
 * ONE service behind both doors — the `auth:*` IPC channels and the `tc`
 * control verbs — so the two never disagree on what `login` means. The
 * difference between the doors is one flag, `askFirst`: a control request can
 * come from an agent in any terminal, so `login` and `join` put a dialog in
 * front of a person before they act (the `tc task` rule: a door an agent can
 * reach PROPOSES; a person commits). A click in the app is already a person.
 *
 * The fourth reader of the credential store (verify:meta readers.1 names it):
 * a session's access token is attached to requests to the account server, and
 * leaves this module in one closure, `presenceIdentity().token`, to main's
 * presence hub for its server handshake. Every RESULT is metadata.
 *
 * No electron import — the browser opener, the dialog and fetch are injected,
 * so verify:account drives the whole flow under plain node.
 */
import { randomBytes } from 'node:crypto'
import {
  accountCredentialKey, accountOfCredentialKey
} from '../shared/credential-schema'
import {
  INVITE_ROLES, NOT_SIGNED_IN,
  type AccountInviteResult, type AccountJoinResult, type AccountLoginResult,
  type AccountLogoutResult, type AccountSessionMeta, type InviteRole,
  type ShareListResult, type ShareMemberResult, type ShareResult
} from '../shared/account'
import type { CredentialStore } from './credential-store'
import { parseTeamRows, type TeamListResult, type TeamOrg, type TeamPresenceStatus } from '../shared/team'
import type { AgentPresenceStatus } from '../shared/presence'
import { parseWorkspaceRole, type WorkspaceRole } from '../shared/canvas-ops'

/** What team-reporter.ts writes. Text fields are already scrubbed by the hub. */
export interface TeamReport {
  status: TeamPresenceStatus
  workspaceId: string | null
  currentTask: string
  agentStatus: AgentPresenceStatus
  activity?: { kind: 'agent' | 'task' | 'presence'; summary: string }
}
import {
  authorizeUrl, createAuthClient, createInviteCode, createPkce, hashInviteCode, INVITE_CODE,
  CALLBACK_PATH, startCallbackServer,
  type AuthClient, type CallbackServer, type ConfigRead, type Fetch, type SupabaseSession
} from './account-auth'

export interface AccountDeps {
  store: CredentialStore
  config: () => ConfigRead
  fetch: Fetch
  openExternal: (url: string) => Promise<void>
  /** A two-button dialog defaulting to Cancel (bootstrap/dialogs.ts's `confirm`). */
  confirm: (ask: { message: string; detail: string; verb: string }) => Promise<boolean>
  now?: () => number
  random?: (n: number) => Buffer
  /** Injected so verify:account can use a free port and a short wait. */
  listen?: (port: number, timeoutMs: number) => Promise<CallbackServer>
  loginTimeoutMs?: number
}

export interface AccountService {
  login(opts?: { askFirst?: boolean }): Promise<AccountLoginResult>
  logout(githubId?: string): Promise<AccountLogoutResult>
  sessions(): AccountSessionMeta[]
  invite(req: { role: InviteRole; orgId?: string }): Promise<AccountInviteResult>
  join(req: { code: string; askFirst?: boolean }): Promise<AccountJoinResult>
  /**
   * Who the presence hub publishes as, and a TOKEN SOURCE for the presence
   * server's handshake. The one function here that hands out an access token
   * — as a closure, to main's presence hub only (bootstrap/presence-wiring.ts),
   * never across the bridge and never in a result. Called per (re)connect, so
   * the token is refreshed rather than captured.
   */
  /**
   * The Team view's rows: the org's members, their presence rows and recent
   * activity. `orgId` picks the org; absent, the first shared (non-personal)
   * org, else the personal one. Metadata only.
   */
  team(orgId?: string): Promise<TeamListResult>
  /**
   * This person's presence row in EVERY org they belong to, and optionally
   * one activity line. Called by team-reporter.ts on its own throttle; a
   * failure is swallowed there — presence is background news.
   */
  reportTeam(report: TeamReport): Promise<{ ok: boolean; reason?: string }>
  presenceIdentity(): Promise<{ kind: 'ok'; userId: string; displayName: string; token: () => Promise<string> } | { kind: 'refused'; reason: string }>
  /**
   * The ACTIVE account's user id with no network and no token — what every
   * agent event is stamped with (agent-runtime.ts), read at the moment of the
   * event. Null when signed out.
   */
  currentUserId(): string | null
  /** Share a workspace into an organization: a new share row, this person its owner. */
  shareWorkspace(req: { name: string; orgId?: string }): Promise<ShareResult>
  /** Every share this person is a member of. */
  listShares(): Promise<ShareListResult>
  /** This person's role in one share now, or null when they have none (or the server could not say). */
  workspaceRole(shareId: string): Promise<WorkspaceRole | null>
  /** An owner sets (or, with null, removes) a member's role. The server refuses anyone else. */
  setShareMember(req: { shareId: string; userId: string; role: WorkspaceRole | null }): Promise<ShareMemberResult>
}

/** What is encrypted under the account key. Never leaves this module. */
interface StoredSession { v: 1; accessToken: string; refreshToken: string; expiresAt: number; userId: string; githubId: string; githubLogin: string }

const INVITE_TTL_DAYS = 7
/** Refresh this long before expiry, so a request never races the clock. */
const REFRESH_SKEW_S = 60

export function createAccountService(deps: AccountDeps): AccountService {
  const now = deps.now ?? Date.now
  const random = deps.random ?? randomBytes
  const listen = deps.listen ?? startCallbackServer
  const loginTimeoutMs = deps.loginTimeoutMs ?? 5 * 60 * 1000
  let inFlight: Promise<AccountLoginResult> | null = null

  const accountKeys = (): string[] =>
    deps.store.list().map((m) => m.service).filter((s) => accountOfCredentialKey(s) !== undefined)

  const load = (key: string): StoredSession | undefined => {
    const raw = deps.store.read(key)
    if (raw === undefined) return undefined
    try {
      const s = JSON.parse(raw) as Partial<StoredSession>
      if (s.v !== 1 || typeof s.accessToken !== 'string' || typeof s.refreshToken !== 'string' ||
          typeof s.expiresAt !== 'number' || typeof s.userId !== 'string' ||
          typeof s.githubId !== 'string' || typeof s.githubLogin !== 'string') return undefined
      return s as StoredSession
    } catch {
      return undefined
    }
  }

  const save = (s: SupabaseSession): { ok: true } | { ok: false; reason: string } => {
    const key = accountCredentialKey(s.githubId)
    const body: StoredSession = { v: 1, ...s }
    const set = deps.store.set(key, JSON.stringify(body))
    if (!set.ok) return set
    // The label is the GitHub login — what the account is called, never a
    // fragment of the token (credential-schema.ts's CredentialMeta rule).
    deps.store.setLabel(key, s.githubLogin)
    return { ok: true }
  }

  const metaOf = (key: string): AccountSessionMeta | undefined => {
    const s = load(key)
    const m = deps.store.list().find((c) => c.service === key)
    if (s === undefined || m === undefined) return undefined
    return { githubId: s.githubId, githubLogin: s.githubLogin, userId: s.userId, expiresAt: new Date(s.expiresAt * 1000).toISOString(), addedAt: m.addedAt }
  }

  const sessions = (): AccountSessionMeta[] =>
    accountKeys().map(metaOf).filter((m): m is AccountSessionMeta => m !== undefined)
      // Newest first: the ACTIVE account is the one signed in last.
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))

  const clientOr = (): { kind: 'ok'; client: AuthClient } | { kind: 'refused'; reason: string } => {
    const cfg = deps.config()
    if (cfg.kind === 'missing') return { kind: 'refused', reason: cfg.reason }
    return { kind: 'ok', client: createAuthClient(cfg.config, deps.fetch, now) }
  }

  /**
   * The active session, refreshed when it is about to expire. A refresh the
   * server REJECTS (a revoked or reused refresh token) drops the session: it
   * can never work again, and keeping it would make every later verb fail
   * with a server error instead of "not signed in".
   */
  const active = async (client: AuthClient): Promise<{ kind: 'ok'; s: StoredSession } | { kind: 'refused'; reason: string }> => {
    const top = sessions()[0]
    if (top === undefined) return { kind: 'refused', reason: NOT_SIGNED_IN }
    const key = accountCredentialKey(top.githubId)
    const s = load(key)
    if (s === undefined) return { kind: 'refused', reason: NOT_SIGNED_IN }
    if (s.expiresAt - REFRESH_SKEW_S > now() / 1000) return { kind: 'ok', s }
    const r = await client.refresh(s.refreshToken)
    if (!r.ok) {
      if (r.status >= 400 && r.status < 500) {
        deps.store.delete(key)
        return { kind: 'refused', reason: `the session for ${s.githubLogin} has ended — sign in again` }
      }
      return { kind: 'refused', reason: `could not refresh the session: ${r.reason}` }
    }
    const saved = save(r.value)
    if (!saved.ok) return { kind: 'refused', reason: saved.reason }
    return { kind: 'ok', s: { v: 1, ...r.value } }
  }

  const runLogin = async (askFirst: boolean): Promise<AccountLoginResult> => {
    const c = clientOr()
    if (c.kind === 'refused') return c
    const cfg = deps.config()
    if (cfg.kind === 'missing') return { kind: 'refused', reason: cfg.reason }
    if (askFirst) {
      const yes = await deps.confirm({
        message: 'Sign in to Terminal Canvas with GitHub?',
        detail: 'A terminal asked to sign in. Your browser will open GitHub; nothing is signed in until you approve there.',
        verb: 'Sign in with GitHub'
      })
      if (!yes) return { kind: 'declined', reason: 'the sign-in was declined in the app' }
    }
    const pkce = createPkce(random)
    let server: CallbackServer
    try {
      server = await listen(cfg.config.callbackPort, loginTimeoutMs)
    } catch {
      return { kind: 'refused', reason: `port ${cfg.config.callbackPort} is in use, so the sign-in has nowhere to return to — free it or set TC_AUTH_CALLBACK_PORT (and add http://127.0.0.1:<port>${CALLBACK_PATH} to the project's Redirect URLs)` }
    }
    try {
      await deps.openExternal(authorizeUrl(cfg.config, pkce))
    } catch {
      server.close()
      return { kind: 'failed', reason: 'the browser could not be opened' }
    }
    const cb = await server.result
    if (cb.kind === 'timeout') return { kind: 'failed', reason: 'the sign-in was not finished in the browser in time' }
    if (cb.kind === 'error') return { kind: 'failed', reason: `GitHub or the account server said: ${cb.reason}` }
    const ex = await c.client.exchange(cb.code, pkce.verifier)
    if (!ex.ok) return { kind: 'failed', reason: `the sign-in code was not accepted: ${ex.reason}` }
    const saved = save(ex.value)
    if (!saved.ok) return { kind: 'refused', reason: saved.reason }
    // A first sign-in owns a personal organization, so `tc invite` has
    // somewhere to invite into. Idempotent server-side; a failure here is
    // reported beside the sign-in, never instead of it.
    const org = await c.client.rpc(ex.value.accessToken, 'ensure_personal_org', {})
    const orgRow = org.ok && typeof org.value === 'object' && org.value !== null ? org.value as { id?: unknown; name?: unknown } : undefined
    const meta = metaOf(accountCredentialKey(ex.value.githubId))
    if (meta === undefined) return { kind: 'failed', reason: 'the session was stored but could not be read back' }
    return {
      kind: 'signed-in',
      session: meta,
      ...(typeof orgRow?.id === 'string' && typeof orgRow.name === 'string' ? { org: { id: orgRow.id, name: orgRow.name } } : {})
    }
  }

  /** The orgs this person belongs to, personal last. RLS answers only their own rows. */
  const orgsOf = async (client: AuthClient, s: StoredSession): Promise<{ ok: true; orgs: Array<TeamOrg & { personal: boolean }> } | { ok: false; reason: string }> => {
    const r = await client.rest(s.accessToken, 'GET',
      `organization_members?select=org_id,organizations(name,personal)&user_id=eq.${encodeURIComponent(s.userId)}`)
    if (!r.ok) return { ok: false, reason: r.reason }
    const rows = (Array.isArray(r.value) ? r.value : []) as Array<{ org_id?: unknown; organizations?: { name?: unknown; personal?: unknown } | null }>
    const orgs = rows.filter((x) => typeof x.org_id === 'string').map((x) => ({
      id: x.org_id as string,
      name: typeof x.organizations?.name === 'string' ? x.organizations.name : (x.org_id as string),
      personal: x.organizations?.personal === true
    }))
    return { ok: true, orgs: orgs.sort((a, b) => Number(a.personal) - Number(b.personal) || a.name.localeCompare(b.name)) }
  }

  return {
    sessions,

    async team(orgId) {
      const c = clientOr()
      if (c.kind === 'refused') return c
      const a = await active(c.client)
      if (a.kind === 'refused') return a
      const mine = await orgsOf(c.client, a.s)
      if (!mine.ok) return { kind: 'failed', reason: `could not read your organizations: ${mine.reason}` }
      const org = orgId === undefined ? mine.orgs[0] : mine.orgs.find((o) => o.id === orgId)
      if (org === undefined) return { kind: 'refused', reason: orgId === undefined ? 'you are not in any organization yet — `tc join` one, or sign in again to make your own' : `you are not a member of organization ${orgId}` }
      const q = encodeURIComponent(org.id)
      const [members, presence, activity] = await Promise.all([
        c.client.rest(a.s.accessToken, 'GET', `organization_members?select=user_id,role,users(github_login)&org_id=eq.${q}`),
        c.client.rest(a.s.accessToken, 'GET', `presence?select=user_id,status,updated_at,workspace_id,current_task,agent_status&org_id=eq.${q}`),
        c.client.rest(a.s.accessToken, 'GET', `activity_log?select=user_id,kind,summary,created_at&org_id=eq.${q}&order=created_at.desc&limit=200`)
      ])
      if (!members.ok) return { kind: 'failed', reason: `could not read the organization's members: ${members.reason}` }
      // Presence and activity are extras: a project that has not run the
      // team migration yet still shows its members.
      const rows = parseTeamRows({ members: members.value, presence: presence.ok ? presence.value : [], activity: activity.ok ? activity.value : [] })
      return { kind: 'ok', me: a.s.userId, org: { id: org.id, name: org.name }, orgs: mine.orgs.map(({ id, name }) => ({ id, name })), ...rows }
    },

    async reportTeam(report) {
      const c = clientOr()
      if (c.kind === 'refused') return { ok: false, reason: c.reason }
      const a = await active(c.client)
      if (a.kind === 'refused') return { ok: false, reason: a.reason }
      const mine = await orgsOf(c.client, a.s)
      if (!mine.ok) return { ok: false, reason: mine.reason }
      const at = new Date(now()).toISOString()
      for (const org of mine.orgs) {
        // PATCH, then INSERT when no row matched — never an upsert: PostgREST's
        // merge-duplicates rewrites the key columns too, which would need
        // UPDATE on org_id/user_id, a grant the migration withholds on purpose.
        const facts = {
          status: report.status, updated_at: at, workspace_id: report.workspaceId,
          current_task: report.currentTask.slice(0, 140), agent_status: report.agentStatus
        }
        const patch = await c.client.rest(a.s.accessToken, 'PATCH',
          `presence?org_id=eq.${encodeURIComponent(org.id)}&user_id=eq.${encodeURIComponent(a.s.userId)}&select=user_id`, facts, 'return=representation')
        if (!patch.ok) return { ok: false, reason: patch.reason }
        if (!Array.isArray(patch.value) || patch.value.length === 0) {
          const ins = await c.client.rest(a.s.accessToken, 'POST', 'presence', { org_id: org.id, user_id: a.s.userId, ...facts }, 'return=minimal')
          if (!ins.ok) return { ok: false, reason: ins.reason }
        }
        if (report.activity !== undefined) {
          await c.client.rest(a.s.accessToken, 'POST', 'activity_log',
            { org_id: org.id, kind: report.activity.kind, summary: report.activity.summary.slice(0, 200) }, 'return=minimal')
        }
      }
      return { ok: true }
    },

    currentUserId() {
      return sessions()[0]?.userId ?? null
    },

    async shareWorkspace(req) {
      const c = clientOr()
      if (c.kind === 'refused') return c
      const a = await active(c.client)
      if (a.kind === 'refused') return a
      const mine = await orgsOf(c.client, a.s)
      if (!mine.ok) return { kind: 'failed', reason: `could not read your organizations: ${mine.reason}` }
      const org = req.orgId === undefined ? mine.orgs[0] : mine.orgs.find((o) => o.id === req.orgId)
      if (org === undefined) return { kind: 'refused', reason: req.orgId === undefined ? 'you are not in any organization yet' : `you are not a member of organization ${req.orgId}` }
      const name = req.name.trim().slice(0, 100) || 'Canvas'
      const r = await c.client.rpc(a.s.accessToken, 'create_workspace_share', { p_org: org.id, p_name: name })
      if (!r.ok) return { kind: 'failed', reason: `the share was not created: ${r.reason}` }
      if (typeof r.value !== 'string') return { kind: 'failed', reason: 'the account server answered without a share id' }
      return { kind: 'ok', share: { id: r.value, orgId: org.id, name, role: 'owner' } }
    },

    async listShares() {
      const c = clientOr()
      if (c.kind === 'refused') return c
      const a = await active(c.client)
      if (a.kind === 'refused') return a
      const r = await c.client.rest(a.s.accessToken, 'GET',
        `workspace_members?select=share_id,role,workspace_shares(org_id,name)&user_id=eq.${encodeURIComponent(a.s.userId)}`)
      if (!r.ok) return { kind: 'failed', reason: `could not read your shared workspaces: ${r.reason}` }
      const rows = (Array.isArray(r.value) ? r.value : []) as Array<{ share_id?: unknown; role?: unknown; workspace_shares?: { org_id?: unknown; name?: unknown } | null }>
      const shares = rows.flatMap((x) => {
        const role = parseWorkspaceRole(x.role)
        const org = x.workspace_shares?.org_id
        if (typeof x.share_id !== 'string' || role === undefined || typeof org !== 'string') return []
        return [{ id: x.share_id, orgId: org, name: typeof x.workspace_shares?.name === 'string' ? x.workspace_shares.name : 'Canvas', role }]
      })
      return { kind: 'ok', shares }
    },

    async workspaceRole(shareId) {
      const c = clientOr()
      if (c.kind === 'refused') return null
      const a = await active(c.client)
      if (a.kind === 'refused') return null
      const r = await c.client.rpc(a.s.accessToken, 'workspace_role', { p_share: shareId })
      return r.ok ? parseWorkspaceRole(r.value) ?? null : null
    },

    async setShareMember(req) {
      const c = clientOr()
      if (c.kind === 'refused') return c
      const a = await active(c.client)
      if (a.kind === 'refused') return a
      const r = await c.client.rpc(a.s.accessToken, 'set_workspace_member', { p_share: req.shareId, p_user: req.userId, p_role: req.role })
      return r.ok ? { kind: 'ok' } : { kind: 'failed', reason: `the role was not changed: ${r.reason}` }
    },

    async presenceIdentity() {
      const c = clientOr()
      if (c.kind === 'refused') return c
      const a = await active(c.client)
      if (a.kind === 'refused') return a
      return {
        kind: 'ok',
        userId: a.s.userId,
        displayName: a.s.githubLogin,
        token: async () => {
          const again = clientOr()
          if (again.kind === 'refused') throw new Error(again.reason)
          const now = await active(again.client)
          if (now.kind === 'refused') throw new Error(now.reason)
          return now.s.accessToken
        }
      }
    },

    login(opts) {
      // One sign-in at a time: two would race for the one callback port, and
      // the second's refusal would read as a broken port.
      if (inFlight !== null) return Promise.resolve({ kind: 'refused', reason: 'a sign-in is already waiting for the browser' })
      inFlight = runLogin(opts?.askFirst === true).finally(() => { inFlight = null })
      return inFlight
    },

    async logout(githubId) {
      const keys = githubId === undefined ? accountKeys() : [accountCredentialKey(githubId)]
      if (githubId !== undefined && !accountKeys().includes(keys[0]!)) return { kind: 'refused', reason: `no session for GitHub user ${githubId}` }
      const c = clientOr()
      const out: string[] = []
      for (const key of keys) {
        const s = load(key)
        // Revoke server-side when we can; the LOCAL delete happens regardless
        // — a person who asked to sign out is signed out on this Mac even if
        // the server cannot be reached.
        if (s !== undefined && c.kind === 'ok') await c.client.signOut(s.accessToken)
        deps.store.delete(key)
        const id = accountOfCredentialKey(key)
        if (id !== undefined) out.push(id)
      }
      return { kind: 'signed-out', githubIds: out }
    },

    async invite(req) {
      if (!INVITE_ROLES.includes(req.role)) return { kind: 'refused', reason: `role must be ${INVITE_ROLES.join(' or ')}` }
      const c = clientOr()
      if (c.kind === 'refused') return c
      const a = await active(c.client)
      if (a.kind === 'refused') return a
      // The orgs this person may invite into. RLS answers only their own rows.
      const mine = await c.client.rest(a.s.accessToken, 'GET',
        `organization_members?select=org_id,role,organizations(name)&user_id=eq.${encodeURIComponent(a.s.userId)}&role=in.(owner,admin)`)
      if (!mine.ok) return { kind: 'failed', reason: `could not read your organizations: ${mine.reason}` }
      const rows = (Array.isArray(mine.value) ? mine.value : []) as Array<{ org_id?: unknown; role?: unknown; organizations?: { name?: unknown } | null }>
      const orgs = rows.filter((r) => typeof r.org_id === 'string')
        .map((r) => ({ id: r.org_id as string, role: String(r.role), name: typeof r.organizations?.name === 'string' ? r.organizations.name : (r.org_id as string) }))
      const target = req.orgId === undefined ? (orgs.length === 1 ? orgs[0] : undefined) : orgs.find((o) => o.id === req.orgId)
      if (target === undefined) {
        if (req.orgId !== undefined) return { kind: 'refused', reason: `you are not an owner or admin of organization ${req.orgId}` }
        if (orgs.length === 0) return { kind: 'refused', reason: 'you are not an owner or admin of any organization' }
        return { kind: 'refused', reason: `you can invite into more than one organization — pass --org <id>: ${orgs.map((o) => `${o.id} (${o.name})`).join(', ')}` }
      }
      if (req.role === 'admin' && target.role !== 'owner') return { kind: 'refused', reason: 'only an owner can invite an admin' }
      const { code, hash } = createInviteCode(random)
      const expiresAt = new Date(now() + INVITE_TTL_DAYS * 86400_000).toISOString()
      const ins = await c.client.rest(a.s.accessToken, 'POST', 'invites',
        { org_id: target.id, role: req.role, code_hash: hash, expires_at: expiresAt }, 'return=minimal')
      if (!ins.ok) return { kind: 'failed', reason: `the invite was not created: ${ins.reason}` }
      return { kind: 'invited', code, orgId: target.id, orgName: target.name, role: req.role, expiresAt }
    },

    async join(req) {
      const code = req.code.trim()
      if (!INVITE_CODE.test(code)) return { kind: 'refused', reason: 'that is not an invite code — it starts with tcinv_' }
      const c = clientOr()
      if (c.kind === 'refused') return c
      const a = await active(c.client)
      if (a.kind === 'refused') return a
      // Only the HASH leaves this machine: the server compares hashes, so the
      // plaintext code is never written anywhere but the invitee's clipboard.
      const hash = hashInviteCode(code)
      const peek = await c.client.rpc(a.s.accessToken, 'invite_preview', { p_code_hash: hash })
      if (!peek.ok) return { kind: 'failed', reason: `could not read the invite: ${peek.reason}` }
      const preview = (Array.isArray(peek.value) ? peek.value[0] : peek.value) as { org_name?: unknown; role?: unknown } | null | undefined
      if (typeof preview?.org_name !== 'string' || (preview.role !== 'member' && preview.role !== 'admin')) {
        return { kind: 'refused', reason: 'the invite is unknown, already used or expired' }
      }
      if (req.askFirst === true) {
        const yes = await deps.confirm({
          message: `Join ${preview.org_name} as ${preview.role}?`,
          detail: `A terminal asked to join this organization as ${a.s.githubLogin}. Its members will see your GitHub name and presence.`,
          verb: `Join ${preview.org_name}`
        })
        if (!yes) return { kind: 'declined', reason: 'joining was declined in the app' }
      }
      const acc = await c.client.rpc(a.s.accessToken, 'accept_invite', { p_code_hash: hash })
      if (!acc.ok) return { kind: 'failed', reason: `the invite was not accepted: ${acc.reason}` }
      const row = (Array.isArray(acc.value) ? acc.value[0] : acc.value) as { org_id?: unknown; org_name?: unknown; role?: unknown } | null | undefined
      if (typeof row?.org_id !== 'string') return { kind: 'refused', reason: 'the invite is unknown, already used or expired' }
      return { kind: 'joined', orgId: row.org_id, orgName: typeof row.org_name === 'string' ? row.org_name : preview.org_name, role: preview.role }
    }
  }
}
