/**
 * Settings, credentials and the environment.
 *
 * The preference store's doors, the credential doors (which never read a
 * token back — there is no `credential:get`, by design), and the two
 * environment answers: readiness and the update check.
 *
 * One slice of `usePaletteActions`. Every body here is the one that lived in
 * that file before the split, moved verbatim — see `./types.ts` for why `ctx.self`
 * is the object under construction rather than a getter.
 */

import { notifyDone } from '../../shell/toast'
import { beginUpdateCheck, getUpdateState, setUpdateResult, updateSentence } from '@renderer/session/update-store'
import { findService } from '@shared/credential-schema'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type SettingsActions = Pick<PaletteActions,
  | 'toggleSetting'
  | 'beginEditSetting'
  | 'beginChooseVault'
  | 'beginEditTextSetting'
  | 'beginSetCredential'
  | 'verifyCredential'
  | 'beginDeleteCredential'
  | 'beginClearScrollback'
  | 'checkForUpdates'
  | 'checkReadiness'
  | 'openStarter'
  | 'setAgentLinks'
>

export function settingsActions(ctx: ActionCtx): SettingsActions {
  const {
    recheckEnvironment, applyStarter, palette, settingRows, reloadSettings, reloadCredentials,
    setInputMode, self
  } = ctx
  return ({
    toggleSetting: (id, value) => {
      // Main owns the store, so the write goes there and the row list is
      // reloaded from the answer rather than updated optimistically: an
      // optimistic row that main refused (an unknown id, a wrong type) would
      // show the new value until the next reload and then flip back.
      void window.canvas.settings.set(id, value).then(reloadSettings)
    },
    beginEditSetting: (id, label, current) => {
      // Read off the row we already loaded, rather than hardcoding 250/60000
      // (or any other bound): the schema is the single source of truth for
      // min/max, and a renderer-side constant would silently drift from it
      // the day a range changes. Absent for a row with no bound.
      const row = settingRows.find((s) => s.id === id)
      const { min, max } = row ?? {}

      // Re-entrant so an out-of-range refusal can reopen the same edit with
      // the bad value still visible, rather than starting over from `current`.
      const openEdit = (initial: string, refused?: string): void => {
        setInputMode({
          kind: 'number',
          label: refused ? `${label} (ms) — ${refused}` : `${label} (ms)…`,
          initial,
          // Set ONLY on the refusal reopen. The ordinary label above is a
          // placeholder-worthy hint ("here's the current value"); this one is
          // an answer to a question nobody asked unless they just typed
          // something wrong, and a placeholder can't show it — see
          // InputMode's `feedback` doc comment in Palette.tsx.
          ...(refused ? { feedback: true as const } : {}),
          submit: (value) => {
            const parsed = Number(value)
            // A non-number is a cancel, not a write of NaN. main's
            // setPreference would refuse NaN anyway, but bouncing it here
            // means a typo does not close the palette and silently change
            // nothing.
            if (!Number.isFinite(parsed)) {
              setInputMode(null)
              return
            }
            // Checked here too, even though main enforces the SAME bound in
            // setPreference. main's check is the last line of defence for a
            // file it did not write; it is not enough on its own, because a
            // refusal that happens only there is INVISIBLE — the palette
            // closes exactly as it does on success, SETTINGS_SET's handler
            // resolves regardless, and reloadSettings() re-fetches the
            // unchanged value with nothing anywhere saying the edit was
            // dropped. Re-opening here is what makes the refusal visible to
            // the user; it does not replace main's check, which still catches
            // a value that reached this process by some other route.
            if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
              openEdit(value, `must be ${min ?? '−∞'}–${max ?? '∞'}, got ${parsed}`)
              return
            }
            void window.canvas.settings.set(id, parsed).then(() => {
              setInputMode(null)
              reloadSettings()
            })
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command (and
        // before calling an input mode's submit), so without this the mode
        // would be set on a palette that is already gone and the
        // clear-on-close effect would wipe it — the same pairing
        // beginRenamePreset and deletePreset both make, and the reason the
        // out-of-range branch above must call openEdit (which reopens) rather
        // than just setInputMode.
        palette.openPalette()
      }

      openEdit(String(current))
    },
    /**
     * M85. A free-text setting — the vault's folder, and the only one so far.
     * The same text line every rename uses, reopened by `openPalette()` for
     * the reason the number edit above states in full. An empty submit CLEARS
     * the setting rather than cancelling: "no vault" is a real answer, and the
     * pane says so.
     */
    // The vault pane's `Choose a folder…` — the SAME text line the setting's
    // palette row opens, so there is one way to answer the question.
    beginChooseVault: () => {
      const current = settingRows.find((r) => r.id === 'vault.root')
      const initial = typeof current?.value === 'string' ? current.value : ''
      setInputMode({
        kind: 'text',
        label: 'Vault folder — a folder; `none` clears it',
        initial,
        submit: (value) => {
          // Blank is CANCEL, as on every other text line in this app; `none`
          // clears the setting on purpose (M85's verifier: an Enter meant to
          // dismiss must not lose a vault).
          const typed = value.trim()
          if (typed === '') { setInputMode(null); return }
          void window.canvas.settings.set('vault.root', typed.toLowerCase() === 'none' ? '' : typed).then(() => {
            setInputMode(null)
            reloadSettings()
          })
        }
      })
      palette.openPalette()
    },
    beginEditTextSetting: (id, label, current) => {
      setInputMode({
        kind: 'text',
        label: `${label} — a folder; \`none\` clears it`,
        initial: current,
        submit: (value) => {
          // Blank is CANCEL, as on every other text line in this app; `none`
          // clears the setting on purpose (M85's verifier: an Enter meant to
          // dismiss must not lose a vault).
          const typed = value.trim()
          if (typed === '') { setInputMode(null); return }
          void window.canvas.settings.set(id, typed.toLowerCase() === 'none' ? '' : typed).then(() => {
            setInputMode(null)
            reloadSettings()
          })
        }
      })
      palette.openPalette()
    },

    /**
     * Masked token entry, gated the same way beginEditSetting's number edit
     * is: RE-ENTRANT, so a refusal from main (an unreachable network, a
     * malformed token) can reopen the same prompt with the reason on screen
     * rather than closing silently. The one deliberate difference from
     * beginEditSetting is `initial`, which stays '' on every call — see
     * InputMode's 'secret' doc comment in Palette.tsx for why a masked field
     * must never be re-seeded with what the user just typed, refusal or not.
     */
    beginSetCredential: (service) => {
      const label = findService(service)?.label ?? service
      const openEntry = (refused?: string): void => {
        setInputMode({
          kind: 'secret',
          label: refused
            ? `${label} token — ${refused}`
            : (findService(service)?.help ?? `Paste the ${label} token…`),
          initial: '',
          ...(refused ? { feedback: true as const } : {}),
          submit: (value) => {
            const jiraLines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
            const token = service === 'jira' && jiraLines.length === 3 ? JSON.stringify({ site: jiraLines[0], email: jiraLines[1], token: jiraLines[2] }) : value
            if (service === 'jira' && jiraLines.length !== 3) { openEntry('enter site URL, email, and API token on three lines'); return }
            void window.canvas.credential.set({ service, token }).then((res) => {
              if (!res.ok) {
                openEntry(res.reason)
                return
              }
              setInputMode(null)
              reloadCredentials()
              // Round 8. A saved credential said NOTHING before this: the
              // palette closed and the row reloaded, which looks identical to
              // a dismissal. The one place in the app where silence is most
              // expensive, because the thing just stored is a secret the
              // person cannot read back to check — there is no
              // `credential:get`, by design.
              //
              // The LABEL only. The token never leaves the process it was
              // typed into, and a toast is a surface that can be screenshotted
              // and shoulder-read.
              notifyDone(`Saved the ${label} credential`)
            })
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command, so
        // without this the mode would be set on a palette that is already
        // gone — the same pairing beginRenamePreset and beginEditSetting both
        // make, for the same reason, including on the refusal reopen.
        palette.openPalette()
      }
      openEntry()
    },
    verifyCredential: (service) => {
      // On SUCCESS, the reload is the only signal: the row's own title
      // already reads "Verify X (label)", and a stored, never-verified
      // credential shows the service's own label until this succeeds and
      // CredentialMeta.label updates to what the remote service actually
      // calls the account — a success dialog on top of that would be a
      // second, noisier way to say what the row itself is about to say.
      //
      // On FAILURE, that same silence is exactly wrong: runRow already
      // closed the palette before this ran, so a rejection reason computed
      // in main — "GitHub rejected the token — it may be revoked or lack
      // scope", the single most useful thing this verb can report — would
      // otherwise cross IPC and be dropped with the overlay already gone.
      // Surfaced the same way beginSetCredential's own refusal path already
      // demonstrates: reopen the palette in an input mode carrying the
      // reason, with feedback: true so it renders as an answer rather than a
      // hint. 'confirm' rather than 'secret' or 'text', because there is
      // nothing to type or correct here — only a fact to acknowledge, the
      // same shape deletePreset's question already reuses this mode for.
      const label = findService(service)?.label ?? service
      void window.canvas.credential.verify(service).then((res) => {
        if (!res.ok) {
          setInputMode({
            kind: 'confirm',
            label: `${label} verification failed — ${res.reason}`,
            initial: '',
            feedback: true,
            submit: () => {}
          })
          palette.openPalette()
          return
        }
        reloadCredentials()
      })
    },
    beginDeleteCredential: (service) => {
      // Gated, not instant — the same reason deletePreset and deleteWorkspace
      // above are: a delete row sat one Enter away from destroying a stored
      // credential, styled identically to every other row until the confirm
      // question is on screen.
      const label = findService(service)?.label ?? service
      setInputMode({
        kind: 'confirm',
        label: `Delete the stored ${label} token?`,
        initial: '',
        submit: () => {
          void window.canvas.credential.remove(service).then(reloadCredentials)
        }
      })
      // Same reason beginRenamePreset/deletePreset both do this.
      palette.openPalette()
    },
    beginClearScrollback: () => {
      // Gated, for deletePreset's reason: a destructive row still runs on one
      // Enter. The question says what goes, because "scrollback" is jargon
      // and the user may have found this row by typing "clear".
      setInputMode({
        kind: 'confirm',
        label: 'Clear every panel’s recorded output from disk? Restored panels will show nothing until they run again.',
        initial: '',
        submit: () => {
          void window.canvas.scrollback.clear()
        }
      })
      palette.openPalette()
    }    ,
    // M123. The by-hand update check. The answer lands on the palette's
    // feedback line (the shape beginSetCredential's refusal already uses:
    // reopen the palette in an input mode carrying the sentence, with
    // feedback so it renders as an answer rather than a hint), and the store
    // remembers it for the environment row and the launcher. On `newer` the
    // line's verb is Enter — `Open release` through links.open, main's own
    // door for a url, never a download: auto-swap is declined by name for
    // an unsigned build. A second ask while one is in flight is a no-op
    // (the store refuses it), so a double-tap on the row is one GET.
    checkForUpdates: () => {
      if (getUpdateState().checking) return
      beginUpdateCheck()
      void window.canvas.update.check().then((result) => {
        setUpdateResult(result)
        const sentence = updateSentence(getUpdateState())
        if (result.kind === 'newer') {
          const url = result.url
          setInputMode({ kind: 'confirm', label: `${sentence} — Open release`, initial: '', feedback: true, submit: () => { void window.canvas.links.open({ panelId: '', target: url }); setInputMode(null) } })
        } else {
          setInputMode({ kind: 'confirm', label: sentence, initial: '', feedback: true, submit: () => setInputMode(null) })
        }
        palette.openPalette()
      }).catch((e: unknown) => {
        // The invoke itself failed (no handler in an old main): the third
        // state, never a hang with the row saying `checking…` forever.
        setUpdateResult({ kind: 'could-not-check', reason: e instanceof Error ? e.message : 'the update check did not answer' })
      })
    },
    checkReadiness: recheckEnvironment,
    openStarter: applyStarter,
    // M247. The toggle is the `canvas.agentLinks` SETTING, so every door writes the
    // same record the HUD button and the settings palette row write.
    setAgentLinks: async (mode) => {
      if (mode !== 'on' && mode !== 'off' && mode !== 'toggle') return { kind: 'refused', reason: 'use agent-links on, off or toggle' }
      const rows = await window.canvas.settings.list()
      const current = rows.find((r) => r.id === 'canvas.agentLinks')?.value !== false
      const next = mode === 'toggle' ? !current : mode === 'on'
      self.toggleSetting('canvas.agentLinks', next)
      return { kind: 'ran', note: next ? 'agent links shown' : 'agent links hidden' }
    }
  })
}
