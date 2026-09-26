import { useEffect, useState, type JSX } from 'react'
import type { ShareMemberRow, WorkspaceShareRow } from '@shared/account'
import type { WorkspaceRole } from '@shared/canvas-ops'
import type { TeamOrg } from '@shared/team'
import type { WorkspaceRow } from '@shared/ipc-contract'
import { Dialog, DialogContent, DialogClose } from '@renderer/primitives'
import { notify } from '../shell/toast'
import { SHARE_SENDS, roleChoices, roleLabel, roleSentence } from './account-model'
import { closeShareDialog, onShareDialog, shareDialogRequest, type ShareDialogRequest } from './share-dialog-store'
import type { Accounts } from './useAccounts'

/**
 * M337. Share the active workspace, open a share here, and set who is in —
 * the UI over `workspace:share`, `workspace:shares`, `workspace:open-share`,
 * `workspace:share-members` and `workspace:share-member`.
 *
 * Every write is a person's click in this dialog. A verb that arrived through
 * a door (share-dialog-store.ts) only prefilled it.
 */
export interface ShareDialogProps {
  accounts: Accounts
  workspaces: WorkspaceRow[]
  /** An opened share is a new local workspace; the canvas switches to it. */
  onOpened: (workspaceId: string) => void
  /** A share or an open changed the workspace rows (the rail's mark, the crumb). */
  onWorkspacesChanged: () => void
}

type Load<T> = { kind: 'loading' } | { kind: 'ok'; value: T } | { kind: 'error'; reason: string }

export function ShareDialog(props: ShareDialogProps): JSX.Element {
  const [request, setRequest] = useState<ShareDialogRequest | null>(shareDialogRequest())
  useEffect(() => onShareDialog(setRequest), [])
  const open = request !== null
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) closeShareDialog() }} modal>
      {/* The class goes on DialogContent's ONE child: MotionSurface renders that
          child's props, so a className on DialogContent itself never reaches the DOM. */}
      <DialogContent aria-label={request?.mode === 'open' ? 'Open a shared workspace' : 'Share this workspace'}>
        <div className="share-dialog" data-share-mode={request?.mode ?? 'closed'}>
        <div className="share-dialog__card">
          {request === null ? null
            : props.accounts.sessions[0] === undefined ? <SignedOut accounts={props.accounts} />
            : request.mode === 'open' ? <OpenShare {...props} request={request} />
            : <Manage {...props} request={request} />}
          <div className="share-dialog__foot">
            <DialogClose className="share-dialog__btn">Done</DialogClose>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SignedOut({ accounts }: { accounts: Accounts }): JSX.Element {
  return (
    <>
      <h2 className="share-dialog__title">Sign in to share</h2>
      <p className="share-dialog__lede">
        {accounts.status !== null && !accounts.status.configured ? accounts.status.reason : 'Sharing puts a workspace in one of your organizations, so you need to be signed in.'}
      </p>
      {accounts.status?.configured === true &&
        <button type="button" className="share-dialog__btn share-dialog__btn--primary" disabled={accounts.pending} onClick={accounts.signIn}>
          {accounts.pending ? 'Waiting for the browser…' : 'Sign in with GitHub'}
        </button>}
    </>
  )
}

function Manage(props: ShareDialogProps & { request: Extract<ShareDialogRequest, { mode: 'manage' }> }): JSX.Element {
  const active = props.workspaces.find((w) => w.active)
  if (active === undefined) return <p className="share-dialog__lede">No workspace is open.</p>
  return active.share === undefined
    ? <ShareNew {...props} workspace={active} />
    : <Members {...props} workspace={active} share={active.share} />
}

function ShareNew(props: ShareDialogProps & { workspace: WorkspaceRow; request: Extract<ShareDialogRequest, { mode: 'manage' }> }): JSX.Element {
  const [orgs, setOrgs] = useState<Load<TeamOrg[]>>({ kind: 'loading' })
  const [orgId, setOrgId] = useState<string>(props.request.orgId ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    void window.canvas.team.list().then((r) => {
      if (!live) return
      if (r.kind !== 'ok') { setOrgs({ kind: 'error', reason: r.reason }); return }
      setOrgs({ kind: 'ok', value: r.orgs })
      setOrgId((id) => (r.orgs.some((o) => o.id === id) ? id : r.orgs[0]?.id ?? ''))
    }, (e: unknown) => { if (live) setOrgs({ kind: 'error', reason: String(e) }) })
    return () => { live = false }
  }, [])

  const share = (): void => {
    setBusy(true)
    void window.canvas.sharedCanvas.share(orgId === '' ? {} : { orgId }).then((r) => {
      setBusy(false)
      if (r.kind !== 'ok') { notify({ outcome: r.kind === 'failed' ? 'failed' : 'refused', sentence: 'The workspace was not shared', detail: r.reason }); return }
      notify({ outcome: 'done', sentence: `Shared ${props.workspace.name}`, detail: `into ${orgs.kind === 'ok' ? orgs.value.find((o) => o.id === r.share.orgId)?.name ?? 'your organization' : 'your organization'}` })
      props.onWorkspacesChanged()
    }, () => setBusy(false))
  }

  return (
    <>
      <h2 className="share-dialog__title">Share “{props.workspace.name}”</h2>
      <p className="share-dialog__lede">{SHARE_SENDS}</p>
      {orgs.kind === 'loading' && <p className="share-dialog__note">Reading your organizations…</p>}
      {orgs.kind === 'error' && <p className="share-dialog__note share-dialog__note--refused">{orgs.reason}</p>}
      {orgs.kind === 'ok' && orgs.value.length > 0 &&
        <label className="share-dialog__field">
          <span>Organization</span>
          <select className="share-dialog__select share-dialog__org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.value.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>}
      <p className="share-dialog__note">You will be its owner. Members of the organization are not in until you add them.</p>
      <button type="button" className="share-dialog__btn share-dialog__btn--primary share-dialog__share"
        disabled={busy || orgs.kind !== 'ok' || orgs.value.length === 0} onClick={share}>
        {busy ? 'Sharing…' : 'Share'}
      </button>
    </>
  )
}

function Members(props: ShareDialogProps & { workspace: WorkspaceRow; share: { id: string; role: WorkspaceRole }; request: Extract<ShareDialogRequest, { mode: 'manage' }> }): JSX.Element {
  const [rows, setRows] = useState<Load<ShareMemberRow[]>>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  const [proposal, setProposal] = useState(props.request.proposal)
  useEffect(() => {
    let live = true
    void window.canvas.sharedCanvas.members(props.share.id).then((r) => {
      if (!live) return
      setRows(r.kind === 'ok' ? { kind: 'ok', value: r.members } : { kind: 'error', reason: r.reason })
    }, (e: unknown) => { if (live) setRows({ kind: 'error', reason: String(e) }) })
    return () => { live = false }
  }, [props.share.id, tick])

  const set = (userId: string, role: WorkspaceRole | null): void => {
    void window.canvas.sharedCanvas.setMember({ shareId: props.share.id, userId, role }).then((r) => {
      if (r.kind !== 'ok') notify({ outcome: r.kind === 'failed' ? 'failed' : 'refused', sentence: 'The role was not changed', detail: r.reason })
      setTick((t) => t + 1)
    }, () => {})
  }
  // A door names a person by id or by login; the proposal resolves only
  // against someone actually in the share's organization.
  const proposed = proposal === undefined || rows.kind !== 'ok' ? undefined
    : rows.value.find((r) => r.userId === proposal.who || r.login.toLowerCase() === proposal.who.toLowerCase())

  return (
    <>
      <h2 className="share-dialog__title">“{props.workspace.name}” is shared</h2>
      <p className="share-dialog__lede">You are {props.share.role}: {roleSentence(props.share.role)}.</p>
      {proposal !== undefined && props.share.role === 'owner' && rows.kind === 'ok' &&
        <div className="share-dialog__proposal" role="status">
          {proposed === undefined || roleChoices(props.share.role, proposed).length === 0
            ? <span>Proposed: {proposal.who} → {roleLabel(proposal.role)}, but {proposed === undefined ? 'nobody by that name is in this organization' : 'that person\'s role is not changed here'}</span>
            : <>
                <span>Proposed: {proposed.login} → {roleLabel(proposal.role)}</span>
                <button type="button" className="share-dialog__btn share-dialog__btn--primary share-dialog__apply" onClick={() => { set(proposed.userId, proposal.role); setProposal(undefined) }}>Apply</button>
              </>}
          <button type="button" className="share-dialog__btn" onClick={() => setProposal(undefined)}>Dismiss</button>
        </div>}
      {rows.kind === 'loading' && <p className="share-dialog__note">Reading who is in…</p>}
      {rows.kind === 'error' && <p className="share-dialog__note share-dialog__note--refused">{rows.reason}</p>}
      {rows.kind === 'ok' &&
        <ul className="share-dialog__members" aria-label="Members">
          {rows.value.map((row) => {
            const choices = roleChoices(props.share.role, row)
            return (
              <li key={row.userId} className="share-dialog__member" data-user-id={row.userId} data-role={row.role ?? 'none'}>
                <span className="share-dialog__login">{row.login}{row.me ? ' (you)' : ''}</span>
                {choices.length === 0
                  ? <span className="share-dialog__role">{roleLabel(row.role)}</span>
                  : <select className="share-dialog__select share-dialog__role-select" aria-label={`${row.login}'s role`}
                      value={row.role ?? 'none'} onChange={(e) => set(row.userId, e.target.value === 'none' ? null : e.target.value as WorkspaceRole)}>
                      {choices.map((c) => <option key={c ?? 'none'} value={c ?? 'none'}>{roleLabel(c)}</option>)}
                    </select>}
              </li>
            )
          })}
        </ul>}
      {props.share.role !== 'owner' && <p className="share-dialog__note">Only the owner changes who is in.</p>}
    </>
  )
}

function OpenShare(props: ShareDialogProps & { request: Extract<ShareDialogRequest, { mode: 'open' }> }): JSX.Element {
  const [shares, setShares] = useState<Load<WorkspaceShareRow[]>>({ kind: 'loading' })
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void window.canvas.sharedCanvas.shares().then((r) => {
      if (live) setShares(r.kind === 'ok' ? { kind: 'ok', value: r.shares } : { kind: 'error', reason: r.reason })
    }, (e: unknown) => { if (live) setShares({ kind: 'error', reason: String(e) }) })
    return () => { live = false }
  }, [])

  const here = (shareId: string): WorkspaceRow | undefined => props.workspaces.find((w) => w.share?.id === shareId)
  const openOne = (shareId: string): void => {
    setBusy(shareId)
    void window.canvas.sharedCanvas.open(shareId).then((r) => {
      setBusy(null)
      if (r.kind !== 'ok') { notify({ outcome: r.kind === 'failed' ? 'failed' : 'refused', sentence: 'The shared workspace was not opened', detail: r.reason }); return }
      props.onWorkspacesChanged()
      props.onOpened(r.workspaceId)
      closeShareDialog()
    }, () => setBusy(null))
  }

  return (
    <>
      <h2 className="share-dialog__title">Open a shared workspace</h2>
      <p className="share-dialog__lede">Opening one adds it here as a workspace. Its panels arrive as cards; nothing starts on this Mac.</p>
      {shares.kind === 'loading' && <p className="share-dialog__note">Reading your shared workspaces…</p>}
      {shares.kind === 'error' && <p className="share-dialog__note share-dialog__note--refused">{shares.reason}</p>}
      {shares.kind === 'ok' && shares.value.length === 0 && <p className="share-dialog__note">Nobody has shared a workspace with you yet.</p>}
      {shares.kind === 'ok' && shares.value.length > 0 &&
        <ul className="share-dialog__members" aria-label="Shared workspaces">
          {shares.value.map((s) => {
            const local = here(s.id)
            return (
              <li key={s.id} className={`share-dialog__member${props.request.shareId === s.id ? ' share-dialog__member--proposed' : ''}`} data-share-id={s.id}>
                <span className="share-dialog__login">{s.name}</span>
                <span className="share-dialog__role">{roleLabel(s.role)}</span>
                <button type="button" className="share-dialog__btn share-dialog__open" disabled={busy !== null || local?.active === true}
                  onClick={() => { if (local !== undefined) { props.onOpened(local.id); closeShareDialog() } else openOne(s.id) }}>
                  {local !== undefined ? (local.active ? 'Showing' : 'Switch to it') : busy === s.id ? 'Opening…' : 'Open'}
                </button>
              </li>
            )
          })}
        </ul>}
    </>
  )
}
