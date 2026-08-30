import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { findService, type CredentialMeta } from '../shared/credential-schema'

/**
 * Injected so verify:credentials can drive the whole store — including the
 * refusal path that must never write plaintext — with no Electron and no OS
 * keychain. Production passes the safeStorage adapter in credential-crypto.ts.
 */
export interface CredentialCrypto {
  available(): boolean
  encrypt(plaintext: string): Buffer
  decrypt(blob: Buffer): string
}

export interface CredentialStoreDeps {
  filePath: string
  crypto: CredentialCrypto
  onWarning?: (message: string) => void
}

export type SetResult = { ok: true; meta: CredentialMeta } | { ok: false; reason: string }

export interface CredentialStore {
  list(): CredentialMeta[]
  set(service: string, token: string): SetResult
  delete(service: string): boolean
  /**
   * The ONE function that returns plaintext, and it is main-internal by
   * construction: no IPC handler may call it, and verify:meta 21 pins that as
   * source text because no runtime behaviour can observe it.
   */
  read(service: string): string | undefined
  setLabel(service: string, label: string): void
}

interface Entry {
  label: string
  cipher: string
  addedAt: string
  verifiedAt?: string
}

const FILE_VERSION = 1

export function createCredentialStore(deps: CredentialStoreDeps): CredentialStore {
  const { filePath, crypto, onWarning } = deps
  const warn = (m: string): void => onWarning?.(m)

  // A malformed file costs the credentials, never the launch. parseLayout
  // draws this same absent-vs-malformed line: no file at all is the ordinary
  // first-run case and warns nothing, while a present but unreadable one warns.
  const load = (): Record<string, Entry> => {
    if (!existsSync(filePath)) return {}
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
      if (typeof raw !== 'object' || raw === null) {
        warn('credentials file is not an object; ignoring it')
        return {}
      }
      const creds = (raw as { credentials?: unknown }).credentials
      if (typeof creds !== 'object' || creds === null) {
        warn('credentials file has no credentials map; ignoring it')
        return {}
      }
      const out: Record<string, Entry> = {}
      for (const [id, value] of Object.entries(creds as Record<string, unknown>)) {
        const e = value as Partial<Entry>
        // An id the schema does not declare is DROPPED with a warning rather
        // than carried forward as a permanent typo — verify:layout 67's rule.
        if (!findService(id)) {
          warn(`dropped credential for unknown service ${JSON.stringify(id)}`)
          continue
        }
        if (typeof e?.cipher !== 'string' || typeof e?.label !== 'string' ||
            typeof e?.addedAt !== 'string') {
          warn(`dropped malformed credential for ${id}`)
          continue
        }
        out[id] = {
          label: e.label,
          cipher: e.cipher,
          addedAt: e.addedAt,
          ...(typeof e.verifiedAt === 'string' ? { verifiedAt: e.verifiedAt } : {})
        }
      }
      return out
    } catch {
      // Deliberately no error detail: a JSON parse error can quote file
      // content, and this file's content is a ciphertext beside a label.
      warn('credentials file could not be read; ignoring it')
      return {}
    }
  }

  let entries = load()

  // Written whole, immediately, and atomically. Not debounced like the layout
  // store: a credential write is rare and user-caused, and coalescing it would
  // mean a token's arrival on disk depended on a timer.
  const flush = (): void => {
    if (Object.keys(entries).length === 0) {
      if (existsSync(filePath)) unlinkSync(filePath)
      return
    }
    const tmp = `${filePath}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: FILE_VERSION, credentials: entries }, null, 2), 'utf8')
    renameSync(tmp, filePath)
  }

  const metaOf = (service: string, e: Entry): CredentialMeta => ({
    service,
    label: e.label,
    addedAt: e.addedAt,
    ...(e.verifiedAt ? { verifiedAt: e.verifiedAt } : {})
  })

  return {
    // Field by field, never a spread of the entry. A spread carries `cipher`
    // across the IPC boundary, and the failure is invisible: everything keeps
    // working, and the renderer simply holds a secret it should never have.
    list: () => Object.entries(entries).map(([service, e]) => metaOf(service, e)),

    set(service, token) {
      const def = findService(service)
      if (!def) return { ok: false, reason: `unknown service ${service}` }
      if (token.trim().length === 0) return { ok: false, reason: 'the token was empty' }
      // Refuses, never falls back. See the spec's §3.
      if (!crypto.available()) {
        return {
          ok: false,
          reason: 'the system keychain is unavailable, so nothing was stored'
        }
      }
      const entry: Entry = {
        label: def.label,
        cipher: crypto.encrypt(token).toString('base64'),
        addedAt: new Date().toISOString()
      }
      entries = { ...entries, [service]: entry }
      flush()
      return { ok: true, meta: metaOf(service, entry) }
    },

    delete(service) {
      if (!entries[service]) return false
      const next = { ...entries }
      delete next[service]
      entries = next
      flush()
      return true
    },

    read(service) {
      const e = entries[service]
      if (!e || !crypto.available()) return undefined
      try {
        return crypto.decrypt(Buffer.from(e.cipher, 'base64'))
      } catch {
        warn(`could not decrypt the stored ${service} credential`)
        return undefined
      }
    },

    setLabel(service, label) {
      const e = entries[service]
      if (!e) return
      entries = { ...entries, [service]: { ...e, label, verifiedAt: new Date().toISOString() } }
      flush()
    }
  }
}
