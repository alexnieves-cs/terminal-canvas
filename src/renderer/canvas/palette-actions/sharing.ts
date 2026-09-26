/**
 * M336–M337. The account and sharing verbs.
 *
 * None of these acts. Each OPENS the share dialog (share-dialog-store.ts),
 * prefilled with what was asked, and the person's click in it shares, opens
 * or changes a role. That is what lets the verbs take all four doors safely:
 * `tc plan share-workspace` from an agent and an action node in a workflow
 * reach exactly the surface the palette does, and none of them can put a
 * canvas into an organization on its own — the `tc login` rule (a door an
 * agent can reach proposes; a person commits).
 *
 * One slice of `usePaletteActions` (see ./types.ts).
 */

import { openShareDialog } from '@renderer/account/share-dialog-store'
import { notify } from '../../shell/toast'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type SharingActions = Pick<PaletteActions,
  | 'shareWorkspace'
  | 'openSharedWorkspace'
  | 'proposeShareRole'
  | 'signIn'
>

const PROPOSED = 'the share dialog is open — the person decides there'
const ROLES = ['editor', 'viewer', 'none'] as const

export function sharingActions(_ctx: ActionCtx): SharingActions {
  return ({
    shareWorkspace: async (org) => {
      openShareDialog({ mode: 'manage', ...(org === undefined || org === '' ? {} : { orgId: org }) })
      return { kind: 'ran', note: PROPOSED }
    },
    openSharedWorkspace: async (share) => {
      openShareDialog({ mode: 'open', ...(share === undefined || share === '' ? {} : { shareId: share }) })
      return { kind: 'ran', note: PROPOSED }
    },
    proposeShareRole: async (who, role) => {
      if (who === undefined || who === '') {
        openShareDialog({ mode: 'manage' })
        return { kind: 'ran', note: PROPOSED }
      }
      const r = (role ?? '').toLowerCase()
      if (!(ROLES as readonly string[]).includes(r)) return { kind: 'refused', reason: `a role is ${ROLES.join(', ')}` }
      openShareDialog({ mode: 'manage', proposal: { who, role: r === 'none' ? null : r as 'editor' | 'viewer' } })
      return { kind: 'ran', note: PROPOSED }
    },
    signIn: async () => {
      const status = await window.canvas.auth.status()
      if (!status.configured) {
        notify({ outcome: 'refused', sentence: 'Accounts are not set up here', detail: status.reason })
        return { kind: 'refused', reason: status.reason }
      }
      const r = await window.canvas.auth.login()
      if (r.kind === 'signed-in') return { kind: 'ran', note: `signed in as ${r.session.githubLogin}` }
      notify({ outcome: r.kind === 'failed' ? 'failed' : 'refused', sentence: 'Sign-in did not finish', detail: r.reason })
      return { kind: 'refused', reason: r.reason }
    }
  })
}
