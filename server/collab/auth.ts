/**
 * Who is connecting, and what they may do in the room they asked for — the
 * collab server's onAuthenticate, as a function that takes `fetch` so
 * verify:canvas-sync drives it with no Supabase.
 *
 * Two questions, both asked AS THE CONNECTING PERSON with their own token:
 *
 *   GET  /auth/v1/user               is the token a live Supabase session?
 *   POST /rest/v1/rpc/workspace_role what is their role in this share?
 *
 * No service key lives here. The role is RLS's answer
 * (supabase/migrations/20260924140000_workspace_shares.sql), so this server
 * holds nothing that could answer for someone else.
 *
 * Document names:
 *   tc:workspace:<uuid>      a SHARED workspace — members only, role from the share;
 *   tc:workspace:<local id>  an unshared workspace's presence room (presence-hub.ts):
 *                            any signed-in person, role null — awareness flows, and
 *                            the only doc write allowed is their own Team snapshot.
 */
import { parseWorkspaceRole, type WorkspaceRole } from '../../src/shared/canvas-ops'

export interface CollabContext {
  userId: string
  /** Null in an unshared presence room. */
  role: WorkspaceRole | null
  shareId: string | null
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) =>
  Promise<{ status: number; text(): Promise<string> }>

export interface CollabAuthConfig { supabaseUrl: string; anonKey: string; fetch: Fetch }

const SHARE_DOC = /^tc:workspace:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/
const LOCAL_DOC = /^tc:workspace:[A-Za-z0-9_-]{1,64}$/

/** Hocuspocus answers a thrown `{ reason }` with permission-denied and that reason. */
export class Refused extends Error {
  readonly reason: string
  constructor(reason: string) { super(reason); this.reason = reason }
}

export function createCollabAuth(config: CollabAuthConfig): (token: string, documentName: string) => Promise<CollabContext> {
  const base = config.supabaseUrl.replace(/\/+$/, '')
  const headers = (token: string): Record<string, string> => ({ apikey: config.anonKey, authorization: `Bearer ${token}` })
  const json = async (res: { text(): Promise<string> }): Promise<unknown> => {
    try { return JSON.parse(await res.text()) as unknown } catch { return undefined }
  }
  return async (token, documentName) => {
    const share = SHARE_DOC.exec(documentName)
    if (share === null && !LOCAL_DOC.test(documentName)) throw new Refused('not a Terminal Canvas room')
    if (typeof token !== 'string' || token === '') throw new Refused('sign in first')
    let user: { status: number; text(): Promise<string> }
    try {
      user = await config.fetch(`${base}/auth/v1/user`, { method: 'GET', headers: headers(token) })
    } catch {
      throw new Refused('the account server could not be reached')
    }
    if (user.status !== 200) throw new Refused('the session is not valid')
    const body = await json(user)
    const userId = typeof body === 'object' && body !== null ? (body as { id?: unknown }).id : undefined
    if (typeof userId !== 'string') throw new Refused('the session names no user')
    if (share === null) return { userId, role: null, shareId: null }
    const shareId = share[1]!
    let r: { status: number; text(): Promise<string> }
    try {
      r = await config.fetch(`${base}/rest/v1/rpc/workspace_role`, {
        method: 'POST', headers: { ...headers(token), 'content-type': 'application/json' }, body: JSON.stringify({ p_share: shareId })
      })
    } catch {
      throw new Refused('the account server could not be reached')
    }
    const role = r.status === 200 ? parseWorkspaceRole(await json(r)) : undefined
    if (role === undefined) throw new Refused('you are not a member of this workspace')
    return { userId, role, shareId }
  }
}
