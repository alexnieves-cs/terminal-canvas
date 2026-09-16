import { type CredentialMeta, type CredentialService } from '@shared/credential-schema'
import type { Command } from '../palette-model'
import type { PaletteActions } from '../commands'

/**
 * One row per declared service (an ADD row) or two (VERIFY and DELETE),
 * standalone and testable without going through buildCommands — the same
 * split waitingCount already earns for a shared derivation. A service absent
 * from `stored` renders its add row; a service WITH a stored credential
 * never renders that row again, which is what makes "paste a token" and
 * "manage the one you already pasted" two different questions the palette
 * never conflates.
 *
 * A service that vanished from this list entirely — rather than rendering an
 * add row with no credential — would be indistinguishable from a service
 * this app does not support at all: verify:palette 31's rule, stated there
 * for the four preset/prompt admin row kinds, applies here unchanged.
 *
 * Every row is hiddenAtRest and scoped to 'credentials': a resting palette
 * with one row per declared service is exactly the kind of growth M6p sized
 * the resting list against, and the always-visible door into this scope is
 * `manage.credentials` below.
 */
export function buildCredentialRows(
  stored: readonly CredentialMeta[],
  services: readonly CredentialService[],
  actions: Pick<PaletteActions, 'beginSetCredential' | 'verifyCredential' | 'beginDeleteCredential'>
): Command[] {
  return services.flatMap((svc): Command[] => {
    const meta = stored.find((m) => m.service === svc.id)
    const base = { group: 'credential' as const, scope: 'credentials' as const, hiddenAtRest: true as const }
    if (!meta) {
      return [{
        ...base,
        id: `credential.set.${svc.id}`,
        title: `Add ${svc.label} token…`,
        searchText: `credential token sign in ${svc.label}`,
        run: () => actions.beginSetCredential(svc.id)
      }]
    }
    return [
      {
        ...base,
        id: `credential.verify.${svc.id}`,
        // The LABEL — what the remote service says the account is called, or
        // the service's own label before a first successful verify — never
        // anything derived from the token. See CredentialMeta's own comment.
        title: `Verify ${svc.label} (${meta.label})`,
        searchText: `credential check ${svc.label}`,
        run: () => actions.verifyCredential(svc.id)
      },
      {
        ...base,
        id: `credential.delete.${svc.id}`,
        title: `Delete ${svc.label} token`,
        destructive: true,
        searchText: `credential remove ${svc.label}`,
        run: () => actions.beginDeleteCredential(svc.id)
      }
    ]
  })
}