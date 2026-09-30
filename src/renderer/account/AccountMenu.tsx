import { useState, type JSX } from 'react'
import { Check } from '@renderer/icons'
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem } from '@renderer/primitives'
import { accountTrigger } from './account-model'
import { openShareDialog } from './share-dialog-store'
import type { Accounts } from './useAccounts'

/**
 * M336. The top bar's account control: who is signed in, which of several is
 * ACTIVE, and the doors that need an account (M337's sharing).
 *
 * Built on the View menu's pattern (TopBar.tsx) for the same reasons:
 * forceMount + hidden, so a suite can address a closed row; Radix's Menu for
 * the keyboard. The rows are commands, so this is a Menu, not a Popover.
 *
 * At rest the trigger says one fact — the active account's initials — or
 * "Sign in" when accounts are configured and nobody is. Unconfigured and
 * signed out, it is absent: a door that can only refuse is noise at rest, and
 * the palette's Account row still names the missing variables.
 */
export function AccountMenu({ accounts }: { accounts: Accounts }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const { status, sessions, pending, signIn, use, signOut } = accounts
  const trigger = accountTrigger(status, sessions)
  if (trigger.kind === 'hidden') return null
  const active = sessions[0]

  return (
    <div className="shell__account" data-account-state={trigger.kind}>
      <Menu open={open} onOpenChange={setOpen}>
        <MenuTrigger
          className="shell__account-trigger"
          title={trigger.kind === 'account'
            ? `Signed in as ${trigger.login}${trigger.others > 0 ? ` · ${trigger.others} more account${trigger.others === 1 ? '' : 's'} on this Mac` : ''}`
            : 'Sign in with GitHub to share workspaces and see who in your organization is working'}
        >
          {trigger.kind === 'account'
            ? <span className="shell__account-avatar" aria-label={trigger.login}>{trigger.initials}</span>
            : <span>{pending ? 'Signing in…' : 'Sign in'}</span>}
        </MenuTrigger>
        <MenuContent forceMount>
          <div className="shell__view-menu shell__account-menu" role="menu" aria-label="Account" hidden={!open}>
            {active === undefined
              ? <MenuItem className="shell__account-signin" disabled={pending} onSelect={signIn}>{pending ? 'Waiting for the browser…' : 'Sign in with GitHub'}</MenuItem>
              : <>
                  <div className="shell__view-heading">{sessions.length > 1 ? 'Active account' : 'Signed in'}</div>
                  {/* One of a set, so a real radio group: the ACTIVE account is
                      the one every door acts as (presence, sharing, the relay). */}
                  <MenuRadioGroup value={active.githubId} onValueChange={use}>
                    {sessions.map((s) => (
                      <MenuRadioItem key={s.githubId} value={s.githubId} className="shell__account-row" data-github-id={s.githubId} title={`Act as ${s.githubLogin}`}>
                        <span className="shell__view-check">{s.githubId === active.githubId && <Check />}</span>{s.githubLogin}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                  <MenuItem className="shell__account-add" disabled={pending} onSelect={signIn}>
                    <span className="shell__view-check" />{pending ? 'Waiting for the browser…' : 'Add another account…'}
                  </MenuItem>
                  <div className="shell__view-heading shell__account-section">Sharing</div>
                  <MenuItem className="shell__account-share" onSelect={() => openShareDialog({ mode: 'manage' })}>
                    <span className="shell__view-check" />Share this workspace…
                  </MenuItem>
                  <MenuItem className="shell__account-open-share" onSelect={() => openShareDialog({ mode: 'open' })}>
                    <span className="shell__view-check" />Open a shared workspace…
                  </MenuItem>
                  <div className="shell__view-heading" />
                  <MenuItem className="shell__account-signout" onSelect={() => signOut(active.githubId)}>
                    <span className="shell__view-check" />Sign out {active.githubLogin}
                  </MenuItem>
                </>}
          </div>
        </MenuContent>
      </Menu>
    </div>
  )
}
