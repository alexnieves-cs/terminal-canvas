import { useCallback, useEffect, useState } from 'react'
import type { AccountSessionMeta, AccountStatus } from '@shared/account'
import { notify } from '../shell/toast'

/**
 * M336. The signed-in accounts as the renderer may see them — metadata, the
 * active one first — kept live by `auth:changed`, which main sends for EVERY
 * change, including a `tc login` typed in a terminal. The menu never has to
 * guess whether it is stale.
 */
export interface Accounts {
  status: AccountStatus | null
  sessions: AccountSessionMeta[]
  /** A sign-in is waiting on the browser: the trigger says so, and a second press is refused by main anyway. */
  pending: boolean
  signIn(): void
  use(githubId: string): void
  signOut(githubId: string): void
}

export function useAccounts(): Accounts {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [sessions, setSessions] = useState<AccountSessionMeta[]>([])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let live = true
    const auth = window.canvas.auth
    void auth.status().then((s) => { if (live) setStatus(s) }, () => {})
    void auth.sessions().then((s) => { if (live) setSessions(s) }, () => {})
    const off = auth.onChanged((s) => setSessions(s))
    return () => { live = false; off() }
  }, [])

  const signIn = useCallback(() => {
    setPending(true)
    void window.canvas.auth.login().then((r) => {
      setPending(false)
      // The success is visible in the trigger itself (auth:changed); only a
      // refusal is news, and it is an outcome, so a toast.
      if (r.kind !== 'signed-in') notify({ outcome: r.kind === 'failed' ? 'failed' : 'refused', sentence: 'Sign-in did not finish', detail: r.reason })
    }, () => setPending(false))
  }, [])

  const use = useCallback((githubId: string) => {
    void window.canvas.auth.use(githubId).then((r) => {
      if (r.kind === 'refused') notify({ outcome: 'refused', sentence: 'Could not switch account', detail: r.reason })
    }, () => {})
  }, [])

  const signOut = useCallback((githubId: string) => {
    void window.canvas.auth.logout(githubId).then((r) => {
      if (r.kind === 'refused') notify({ outcome: 'refused', sentence: 'Could not sign out', detail: r.reason })
    }, () => {})
  }, [])

  return { status, sessions, pending, signIn, use, signOut }
}
