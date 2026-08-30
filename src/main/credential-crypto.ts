import { safeStorage } from 'electron'
import type { CredentialCrypto } from './credential-store'

/**
 * The one file that imports electron for this feature, so credential-store.ts
 * stays in the plain-node verify tier — the same deliberate split
 * git-runner.ts keeps from review-engine.ts and session-backend.ts keeps from
 * tmux-args.ts.
 *
 * Every member is called LAZILY. safeStorage is not usable before the app is
 * ready, and the store is constructed at module scope in main/index.ts, so an
 * adapter that probed availability in its own constructor would answer for the
 * wrong moment — and answer `false`, which the store correctly turns into a
 * permanent refusal to store anything.
 */
export function createSafeStorageCrypto(): CredentialCrypto {
  return {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plaintext) => safeStorage.encryptString(plaintext),
    decrypt: (blob) => safeStorage.decryptString(blob)
  }
}
