# M13 Credential Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give this app one place to hold a service credential, encrypted at rest, that no agent process and no IPC reply can ever read back — with one real consumer proving it end to end.

**Architecture:** A new main-process `credential-store.ts` following `layout-store.ts`'s dependency-injection pattern (paths and crypto injected), so the whole store runs in the cheap plain-node verify tier against a fake crypto. Electron's `safeStorage` is a thin adapter wired only in `main/index.ts`. Four invoke channels return metadata only; there is deliberately no channel that returns a secret. The one consumer is a single `GET https://api.github.com/user`.

**Tech Stack:** TypeScript, Electron 43.4.1 (`safeStorage`), Node built-ins only (`node:https`, `node:fs`), esbuild for the plain-node verify bundles. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-30-m13-credential-boundary-design.md`

## Global Constraints

- **No new npm dependency.** The HTTP call uses `node:https`. Adding a fetch library to a repo whose whole security argument is narrowness is not in scope.
- **No IPC channel may return a stored secret.** There is no `credential:get`. Task 7 pins this structurally.
- **`credential-store.ts` must never be imported by `shell-env.ts`, `pty-manager.ts` or `session-backend.ts`.** Task 7 pins this structurally.
- **If `crypto.available()` is false, `set()` refuses and writes nothing.** Never a plaintext fallback.
- **No error message, warning, or log line may contain a submitted token.** Task 2 check 7 pins this.
- **`shared/credential-schema.ts` imports NOTHING** — not electron, not node, not a sibling — exactly as `settings-schema.ts` states in its own header. That is what keeps `verify:credentials` in the plain-node tier.
- **Commit convention:** `feat(m13): …` / `fix(m13): …` / `docs(m13): …`, per CLAUDE.md.
- **`scripts/credentials-entry.cjs` grows exactly ONE spread per task**, as each module comes into existence. Naming a module before the task that creates it makes esbuild fail to resolve the whole bundle, so NO check runs and the suite cannot go green. `scripts/review-entry.cjs`'s own header records this happening to a previous plan's first draft.
- **Every `ok(...)` label is a descriptive string, never a bare number.** CLAUDE.md records six checks in `verify:layout` that shipped with bare numeric labels and print no title at all on failure.

---

## File Structure

**Created:**
- `src/shared/credential-schema.ts` — `SERVICES`, `CredentialMeta`, `CredentialServiceId`. Import-free. Both processes read it; neither owns it.
- `src/main/credential-store.ts` — the store. Injected `filePath` + `crypto`. Pure enough for plain node.
- `src/main/credential-crypto.ts` — the `safeStorage` adapter. The only file that imports `electron` for this feature.
- `src/main/credential-verify.ts` — the GitHub check. Injected `fetcher`, so plain node drives it without network.
- `scripts/credentials-entry.cjs` — esbuild entry for the new suite.
- `scripts/verify-credentials.cjs` — the new plain-node suite.

**Modified:**
- `src/shared/ipc-contract.ts` — four channels + the `credential` bridge sub-object.
- `src/preload/index.ts` — bridge wiring.
- `src/main/ipc.ts` — four handlers.
- `src/main/index.ts` — instantiate the store.
- `src/renderer/palette/Palette.tsx` — `InputMode.kind` gains `'secret'`.
- `src/renderer/palette/palette-model.ts` — a `credentials` scope + section.
- `src/renderer/palette/commands.ts` — credential rows.
- `src/renderer/canvas/Canvas.tsx` — the input-mode wiring.
- `scripts/verify-meta.cjs` — structural checks 20–21.
- `scripts/verify-panels.cjs` — the end-to-end check.
- `package.json` — `verify:credentials` script, chained into `verify`.
- `CLAUDE.md`, `README.md`, `docs/ideas-backlog.md`.

---

### Task 1: The schema and the empty suite

**Files:**
- Create: `src/shared/credential-schema.ts`
- Create: `scripts/credentials-entry.cjs`
- Create: `scripts/verify-credentials.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `SERVICES: readonly CredentialService[]`, `type CredentialServiceId = string`, `interface CredentialMeta { service: string; label: string; addedAt: string; verifiedAt?: string }`, `findService(id: string): CredentialService | undefined`.

- [ ] **Step 1: Write the failing checks**

Create `scripts/verify-credentials.cjs`:

```js
/* Verifies the credential store and its schema. Run: npm run verify:credentials

   Plain node. src/shared/credential-schema.ts imports nothing at all and
   src/main/credential-store.ts takes its crypto and its file path as injected
   dependencies, so the whole store — including the refusal path that must
   never write plaintext — is driven here against fakes, with no Electron and
   no OS keychain anywhere in earshot. This is the same trade layout-store.ts
   makes with `filePath`/`schedule` and review-engine.ts makes with GitRunner. */
'use strict'
const { execFileSync } = require('node:child_process')
const { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const OUT = join(__dirname, '..', 'out', 'verify', 'credentials.cjs')
execFileSync('npx', ['esbuild', join(__dirname, 'credentials-entry.cjs'),
  '--bundle', '--platform=node', '--outfile=' + OUT,
  '--alias:@shared=' + join(__dirname, '..', 'src', 'shared')],
  { stdio: 'inherit' })

const mod = require(OUT)

const results = []
const ok = (label, pass, detail) => {
  results.push({ label, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
}

// 1. One declared service, and it is github. SERVICES is what lets set()
// reject an id the schema never declared, and what the palette builds its
// rows from — the same three payoffs SETTINGS already buys in
// settings-schema.ts. A free-form key would make a typo a permanent, silent
// second credential nobody can see.
ok('1 SERVICES declares github with a label and help text', (() => {
  const s = mod.findService('github')
  return !!s && s.id === 'github' && !!s.label && !!s.help
})())

// 2. An id the schema does not declare is not found. This is the check
// set()'s rejection rests on.
ok('2 an undeclared service id is not found', mod.findService('gitlab') === undefined)

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
```

Create `scripts/credentials-entry.cjs`:

```js
/* esbuild entry for the credential suite. credential-schema.ts imports
   NOTHING and credential-store.ts takes its crypto injected, which is what
   keeps this suite in the cheap plain-node tier.

   It grows ONE spread per task, as each module comes into existence: Task 2
   adds credential-store, Task 4 adds credential-verify. Naming a module before
   the task that creates it makes esbuild fail to resolve the whole bundle, so
   NO check runs and the suite cannot go green — which is exactly what happened
   to the first draft of the M9 plan. See scripts/review-entry.cjs. */
module.exports = {
  ...require('../src/shared/credential-schema'),
}
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add:

```json
"verify:credentials": "node scripts/verify-credentials.cjs"
```

and insert it into the `verify` chain immediately after `verify:layout` (it is a plain-node suite and belongs in the cheap block, before the build):

```
… && npm run verify:layout && npm run verify:credentials && npm run verify:palette && …
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run verify:credentials`
Expected: FAIL — esbuild cannot resolve `../src/shared/credential-schema`.

- [ ] **Step 4: Write the schema**

Create `src/shared/credential-schema.ts`:

```ts
/**
 * Every service this app can hold a credential for, as data.
 *
 * This module imports NOTHING — not electron, not node, not a sibling. That is
 * deliberate and load-bearing, exactly as settings-schema.ts states for the
 * same reason: it is what keeps verify:credentials in the cheap plain-node
 * tier, and what lets main and the renderer read one declaration without
 * either owning it.
 *
 * A service that is not declared here cannot be stored. That is the point: the
 * store is keyed by service id, and a free-form key makes a typo a permanent,
 * invisible second credential — the same failure verify:layout 67 pins for an
 * unknown preference id.
 */

export interface CredentialService {
  /** Stable and persisted — renaming one orphans the user's stored token. */
  id: string
  label: string
  /** Shown at the entry prompt. Says WHICH token to paste, not what a token is. */
  help: string
}

/**
 * M13 declares exactly one. #9's own sequencing advice is that two concrete
 * integrations must exist before anything is generalised from them, and this
 * milestone deliberately does not reach that bar — the store is a store, not
 * an integration surface.
 */
export const SERVICES: readonly CredentialService[] = [
  {
    id: 'github',
    label: 'GitHub',
    help: 'Paste a personal access token (classic or fine-grained) with read access to your account.'
  }
]

/**
 * Metadata the renderer is allowed to see. Note what is ABSENT: there is no
 * token field and no cipher field, and that absence is the design rather than
 * an omission — see the spec's rule 1. A projection, never a filter someone
 * has to remember to apply.
 */
export interface CredentialMeta {
  service: string
  /**
   * What the remote service says the account is called, or the service label
   * before a successful verify. NEVER derived from the token: a "last four
   * characters" label is a partial secret that would then flow into the
   * inspector, the rail, and anything serialising app state for diagnostics —
   * which ideas-backlog #31 warns about explicitly.
   */
  label: string
  addedAt: string
  verifiedAt?: string
}

export function findService(id: string): CredentialService | undefined {
  return SERVICES.find((s) => s.id === id)
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run verify:credentials`
Expected: PASS, `2/2 passed`.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/credential-schema.ts scripts/credentials-entry.cjs scripts/verify-credentials.cjs package.json
git commit -m "feat(m13): declare credential services as data, and the suite that reads them"
```

---

### Task 2: The store

**Files:**
- Create: `src/main/credential-store.ts`
- Modify: `scripts/credentials-entry.cjs`, `scripts/verify-credentials.cjs`

**Interfaces:**
- Consumes: `findService`, `CredentialMeta` from Task 1.
- Produces:
  - `interface CredentialCrypto { available(): boolean; encrypt(plaintext: string): Buffer; decrypt(blob: Buffer): string }`
  - `interface CredentialStoreDeps { filePath: string; crypto: CredentialCrypto; onWarning?: (message: string) => void }`
  - `interface CredentialStore { list(): CredentialMeta[]; set(service: string, token: string): SetResult; delete(service: string): boolean; read(service: string): string | undefined; setLabel(service: string, label: string): void }`
  - `type SetResult = { ok: true; meta: CredentialMeta } | { ok: false; reason: string }`
  - `function createCredentialStore(deps: CredentialStoreDeps): CredentialStore`

`read()` is main-internal and is the one function that returns plaintext. It is deliberately NOT reachable from any IPC handler; Task 7 pins that structurally.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-credentials.cjs`, before the summary block:

```js
// A fake crypto. Reversible and obviously not encryption — the point is that
// the store CALLS it, not that this suite tests cryptography.
const fakeCrypto = (available = true) => ({
  available: () => available,
  encrypt: (s) => Buffer.from('enc:' + s, 'utf8'),
  decrypt: (b) => b.toString('utf8').replace(/^enc:/, '')
})

const dir = mkdtempSync(join(tmpdir(), 'tc credentials '))
const filePath = join(dir, 'credentials.json')
const TOKEN = 'ghp_supersecrettokenvalue123456'

// 3. Round trip: a set is listed back as metadata.
{
  const store = mod.createCredentialStore({ filePath, crypto: fakeCrypto() })
  const res = store.set('github', TOKEN)
  const list = store.list()
  ok('3 a stored credential is listed back as metadata',
    res.ok === true && list.length === 1 && list[0].service === 'github' && !!list[0].addedAt)
}

// 4. THE CHECK RULE 1 RESTS ON. list() must not carry the ciphertext, asserted
// on the object's own KEYS rather than on a value — a spread that carried
// `cipher` through would satisfy any assertion phrased about the token itself,
// since the token is encrypted and would not match anyway.
{
  const store = mod.createCredentialStore({ filePath, crypto: fakeCrypto() })
  const keys = Object.keys(store.list()[0])
  ok('4 list() exposes no cipher and no token key',
    !keys.includes('cipher') && !keys.includes('token'), keys.join(','))
}

// 5. The plaintext is genuinely on disk only in encrypted form.
{
  const raw = readFileSync(filePath, 'utf8')
  ok('5 the raw file does not contain the plaintext token', !raw.includes(TOKEN))
}

// 6. REFUSES, NEVER FALLS BACK. With the keychain unavailable, set() fails and
// writes NOTHING. A plaintext fallback is indistinguishable from success at
// every surface — the credential lists, the label appears — so the user learns
// their token was in the clear from somebody else.
{
  const p2 = join(dir, 'unavailable.json')
  const store = mod.createCredentialStore({ filePath: p2, crypto: fakeCrypto(false) })
  const res = store.set('github', TOKEN)
  ok('6 unavailable crypto refuses and writes no file',
    res.ok === false && !existsSync(p2), res.ok === false ? res.reason : 'stored anyway')
}

// 7. The refusal must not quote the token back. A reason string interpolating
// the plaintext puts it in a log, which is the one place #31 says a secret
// must never reach. Checked on BOTH the refusal above and a warning.
{
  const p3 = join(dir, 'noleak.json')
  const warnings = []
  const store = mod.createCredentialStore({
    filePath: p3, crypto: fakeCrypto(false), onWarning: (m) => warnings.push(m)
  })
  const res = store.set('github', TOKEN)
  const leaked = (res.ok === false && res.reason.includes(TOKEN)) ||
    warnings.some((w) => w.includes(TOKEN))
  ok('7 no refusal reason or warning contains the token', !leaked)
}

// 8. An undeclared service is rejected rather than stored — Task 1 check 2's
// fact, reached through the write path.
{
  const p4 = join(dir, 'unknown.json')
  const store = mod.createCredentialStore({ filePath: p4, crypto: fakeCrypto() })
  const res = store.set('gitlab', TOKEN)
  ok('8 an undeclared service id is refused', res.ok === false && store.list().length === 0)
}

// 9. A malformed file warns and resolves to EMPTY rather than throwing — the
// absent-vs-malformed line parseLayout already draws everywhere else. Throwing
// here would take the whole app's startup down for one bad file.
{
  const p5 = join(dir, 'malformed.json')
  writeFileSync(p5, '{ not json at all', 'utf8')
  const warnings = []
  const store = mod.createCredentialStore({
    filePath: p5, crypto: fakeCrypto(), onWarning: (m) => warnings.push(m)
  })
  ok('9 a malformed file warns and reads as empty',
    store.list().length === 0 && warnings.length === 1)
}

// 10. Delete REMOVES the entry rather than blanking it. Writing cipher:"" would
// leave the previous ciphertext in whatever backup or editor history touched
// the file.
{
  const store = mod.createCredentialStore({ filePath, crypto: fakeCrypto() })
  const gone = store.delete('github')
  const reread = mod.createCredentialStore({ filePath, crypto: fakeCrypto() })
  const raw = readFileSync(filePath, 'utf8')
  ok('10 delete removes the entry entirely',
    gone === true && reread.list().length === 0 && !raw.includes('cipher'))
}

rmSync(dir, { recursive: true, force: true })
```

- [ ] **Step 2: Add the spread**

In `scripts/credentials-entry.cjs`, add exactly one line:

```js
  ...require('../src/main/credential-store'),
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run verify:credentials`
Expected: FAIL — esbuild cannot resolve `../src/main/credential-store`.

- [ ] **Step 4: Write the store**

Create `src/main/credential-store.ts`:

```ts
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run verify:credentials`
Expected: PASS, `10/10 passed`.

- [ ] **Step 6: Fault-inject check 4, then restore**

Temporarily change `list` to `Object.entries(entries).map(([service, e]) => ({ service, ...e }))`.
Run: `npm run verify:credentials`
Expected: check 4 FAILS naming `cipher`. Restore the field-by-field version and confirm `10/10`.

This is the one check the whole boundary rests on; watching it fail is what proves it can.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/main/credential-store.ts scripts/credentials-entry.cjs scripts/verify-credentials.cjs
git commit -m "feat(m13): the credential store, refusing rather than falling back to plaintext"
```

---

### Task 3: The safeStorage adapter and main wiring

**Files:**
- Create: `src/main/credential-crypto.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `CredentialCrypto`, `createCredentialStore` from Task 2.
- Produces: `createSafeStorageCrypto(): CredentialCrypto`; a module-scope `credentialStore` in `main/index.ts` available to Task 5's handlers.

This task has no new verify check: it is the Electron-only seam, and its behaviour under a real keychain is exactly what the spec records as unverifiable by any suite here.

- [ ] **Step 1: Write the adapter**

Create `src/main/credential-crypto.ts`:

```ts
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
```

- [ ] **Step 2: Wire it in main**

In `src/main/index.ts`, beside the existing layout store construction, add:

```ts
import { join } from 'node:path'
import { createCredentialStore } from './credential-store'
import { createSafeStorageCrypto } from './credential-crypto'

// Its own file, deliberately not a key in layout.json. That file is rewritten
// in full on a 500ms debounce, CLAUDE.md documents hand-editing it as a
// supported path, and parseLayout copies a future-version one to .bak — which
// is correct for a canvas and would silently duplicate a ciphertext.
const credentialStore = createCredentialStore({
  filePath: join(app.getPath('userData'), 'credentials.json'),
  crypto: createSafeStorageCrypto(),
  onWarning: (m) => console.warn('[credentials]', m)
})
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/main/credential-crypto.ts src/main/index.ts
git commit -m "feat(m13): wire the store to safeStorage, lazily"
```

---

### Task 4: The consumer

**Files:**
- Create: `src/main/credential-verify.ts`
- Modify: `scripts/credentials-entry.cjs`, `scripts/verify-credentials.cjs`

**Interfaces:**
- Consumes: `CredentialStore` from Task 2.
- Produces:
  - `type Fetcher = (url: string, token: string, timeoutMs: number) => Promise<{ status: number; body: string }>`
  - `interface VerifyDeps { store: CredentialStore; fetcher: Fetcher }`
  - `type VerifyResult = { ok: true; meta: CredentialMeta } | { ok: false; reason: string }`
  - `function verifyCredential(deps: VerifyDeps, service: string): Promise<VerifyResult>`
  - `function createHttpsFetcher(): Fetcher`
  - `const VERIFY_TIMEOUT_MS = 15000`

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-credentials.cjs`, before `rmSync`:

```js
// 11. The happy path: the login GitHub reports becomes the stored label, and
// the token is never returned. The fetcher is fake — the real request is
// checked by hand, and the spec says so.
{
  const p = join(dir, 'verify.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  store.set('github', TOKEN)
  let sawToken = null
  const fetcher = async (_url, token) => {
    sawToken = token
    return { status: 200, body: JSON.stringify({ login: 'octocat', email: 'o@example.com' }) }
  }
  const res = await mod.verifyCredential({ store, fetcher }, 'github')
  const keys = res.ok ? Object.keys(res.meta) : []
  ok('11 a successful verify stores the login as the label and returns no token',
    res.ok === true && res.meta.label === 'octocat' && !!res.meta.verifiedAt &&
    !keys.includes('token') && !keys.includes('cipher') && sawToken === TOKEN)
}

// 12. Only `login` is read out. GET /user returns email and profile data this
// app has no use for; storing the body wholesale would put personal data in a
// file whose stated purpose is one token.
{
  const p = join(dir, 'verify2.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  store.set('github', TOKEN)
  const fetcher = async () => ({
    status: 200, body: JSON.stringify({ login: 'octocat', email: 'o@example.com' })
  })
  await mod.verifyCredential({ store, fetcher }, 'github')
  ok('12 the verify response is not stored wholesale',
    !readFileSync(p, 'utf8').includes('o@example.com'))
}

// 13. A 401 is a REFUSAL with a stated reason, not a throw and not a silent
// failure. A revoked token is the ordinary case here, not an exotic one.
{
  const p = join(dir, 'verify3.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  store.set('github', TOKEN)
  const fetcher = async () => ({ status: 401, body: '{"message":"Bad credentials"}' })
  const res = await mod.verifyCredential({ store, fetcher }, 'github')
  ok('13 a rejected token reports why and does not throw',
    res.ok === false && res.reason.length > 0 && !res.reason.includes(TOKEN))
}

// 14. Verifying a service with nothing stored is a refusal, not a request.
// Without this the app issues an outbound call carrying `undefined`.
{
  const p = join(dir, 'verify4.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  let called = false
  const fetcher = async () => { called = true; return { status: 200, body: '{}' } }
  const res = await mod.verifyCredential({ store, fetcher }, 'github')
  ok('14 verifying an absent credential makes no request', res.ok === false && called === false)
}
```

Wrap the appended block in an `async` IIFE if the suite is not already async — change the file's tail so checks 11–14 and the summary run inside `void (async () => { … })()`.

- [ ] **Step 2: Add the spread**

In `scripts/credentials-entry.cjs`:

```js
  ...require('../src/main/credential-verify'),
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run verify:credentials`
Expected: FAIL — cannot resolve `../src/main/credential-verify`.

- [ ] **Step 4: Write the consumer**

Create `src/main/credential-verify.ts`:

```ts
import { request } from 'node:https'
import type { CredentialMeta } from '../shared/credential-schema'
import type { CredentialStore } from './credential-store'

/**
 * 15s, and the ceiling matters for the reason GIT_TIMEOUT_MS's does: neither
 * caller has anyone to time it out on its behalf, so a call with no ceiling is
 * an invoke whose reply simply never arrives and a UI that waits forever.
 */
export const VERIFY_TIMEOUT_MS = 15000

export type Fetcher = (
  url: string,
  token: string,
  timeoutMs: number
) => Promise<{ status: number; body: string }>

export interface VerifyDeps {
  store: CredentialStore
  fetcher: Fetcher
}

export type VerifyResult = { ok: true; meta: CredentialMeta } | { ok: false; reason: string }

const USER_URL = 'https://api.github.com/user'

/**
 * The only place a stored secret is used, and it is used to make a REQUEST —
 * never returned as a value. What crosses back is what GitHub said.
 */
export async function verifyCredential(deps: VerifyDeps, service: string): Promise<VerifyResult> {
  if (service !== 'github') return { ok: false, reason: `cannot verify ${service}` }
  const token = deps.store.read(service)
  // Refuse before making a request rather than sending `undefined` upstream.
  if (token === undefined) return { ok: false, reason: 'no stored credential to verify' }

  let res: { status: number; body: string }
  try {
    res = await deps.fetcher(USER_URL, token, VERIFY_TIMEOUT_MS)
  } catch (err) {
    // The message is OURS, never the thrown one: a network error can quote the
    // request it was making, and this request carries an Authorization header.
    return { ok: false, reason: 'the request to GitHub failed' }
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'GitHub rejected the token — it may be revoked or lack scope' }
  }
  if (res.status !== 200) {
    return { ok: false, reason: `GitHub answered ${res.status}` }
  }

  let login: unknown
  try {
    login = (JSON.parse(res.body) as { login?: unknown }).login
  } catch {
    return { ok: false, reason: 'GitHub returned a response this app could not read' }
  }
  if (typeof login !== 'string' || login.length === 0) {
    return { ok: false, reason: 'GitHub returned no account name' }
  }

  // Only `login`. The rest of GET /user is profile data this app has no use
  // for, and storing it wholesale would put personal data in a file whose
  // stated purpose is one token.
  deps.store.setLabel(service, login)
  const meta = deps.store.list().find((m) => m.service === service)
  return meta ? { ok: true, meta } : { ok: false, reason: 'the credential vanished mid-verify' }
}

/** node:https rather than a dependency — see the plan's global constraints. */
export function createHttpsFetcher(): Fetcher {
  return (url, token, timeoutMs) =>
    new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'terminal-canvas'
          },
          timeout: timeoutMs
        },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (c: string) => { body += c })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
        }
      )
      req.on('timeout', () => { req.destroy(new Error('timeout')) })
      req.on('error', reject)
      req.end()
    })
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run verify:credentials`
Expected: PASS, `14/14 passed`.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/main/credential-verify.ts scripts/credentials-entry.cjs scripts/verify-credentials.cjs
git commit -m "feat(m13): verify a token against GitHub, the app's first outbound request"
```

---

### Task 5: The four channels

**Files:**
- Modify: `src/shared/ipc-contract.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/index.ts`

**Interfaces:**
- Consumes: `CredentialStore` (Task 2), `verifyCredential`/`createHttpsFetcher` (Task 4), `CredentialMeta` (Task 1).
- Produces: `window.canvas.credential.{ list, set, remove, verify }`.

- [ ] **Step 1: Run verify:ipc to see the current count**

Run: `npm run verify:ipc`
Expected: PASS, reporting 31 channels.

- [ ] **Step 2: Add the channels and the bridge type**

In `src/shared/ipc-contract.ts`, inside `IPC`, after `REVIEW_COMMIT`:

```ts
  ,
  /** Metadata only. There is deliberately no credential:get — see CLAUDE.md. */
  CREDENTIAL_LIST: 'credential:list',
  CREDENTIAL_SET: 'credential:set',
  CREDENTIAL_DELETE: 'credential:delete',
  /** Uses the token to make one request; returns what the service said. */
  CREDENTIAL_VERIFY: 'credential:verify'
```

And on `CanvasBridge`, beside `review`:

```ts
  credential: {
    list(): Promise<CredentialMeta[]>
    set(req: { service: string; token: string }): Promise<CredentialSetResult>
    remove(service: string): Promise<boolean>
    verify(service: string): Promise<CredentialSetResult>
  }
```

with, near the other exported result types:

```ts
export type CredentialSetResult =
  | { ok: true; meta: CredentialMeta }
  | { ok: false; reason: string }
```

and `import type { CredentialMeta } from './credential-schema'`.

- [ ] **Step 3: Wire the preload**

In `src/preload/index.ts`, add to `bridge`:

```ts
  credential: {
    list: () => ipcRenderer.invoke(IPC.CREDENTIAL_LIST),
    set: (req) => ipcRenderer.invoke(IPC.CREDENTIAL_SET, req),
    remove: (service: string) => ipcRenderer.invoke(IPC.CREDENTIAL_DELETE, service),
    verify: (service: string) => ipcRenderer.invoke(IPC.CREDENTIAL_VERIFY, service)
  },
```

- [ ] **Step 4: Wire the handlers**

In `src/main/ipc.ts`, add a `credentialStore` to the existing deps object and register:

```ts
  // Metadata only, on every arm. The store's list() already projects field by
  // field; this handler must not re-widen it, and verify:meta 20 pins that as
  // source text because no runtime behaviour can observe the difference.
  ipcMain.handle(IPC.CREDENTIAL_LIST, () => deps.credentialStore.list())

  ipcMain.handle(IPC.CREDENTIAL_SET, (_e, req: { service: string; token: string }) =>
    deps.credentialStore.set(req.service, req.token))

  ipcMain.handle(IPC.CREDENTIAL_DELETE, (_e, service: string) =>
    deps.credentialStore.delete(service))

  ipcMain.handle(IPC.CREDENTIAL_VERIFY, (_e, service: string) =>
    verifyCredential({ store: deps.credentialStore, fetcher: createHttpsFetcher() }, service))
```

Pass `credentialStore` from `main/index.ts` into `registerIpcHandlers`.

- [ ] **Step 5: Run verify:ipc**

Run: `npm run typecheck && npm run verify:ipc`
Expected: PASS, reporting **35** channels.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-contract.ts src/preload/index.ts src/main/ipc.ts src/main/index.ts
git commit -m "feat(m13): four credential channels, none of which returns a secret"
```

---

### Task 6: Masked entry through the palette

**Files:**
- Modify: `src/renderer/palette/Palette.tsx`, `src/renderer/palette/palette-model.ts`, `src/renderer/palette/commands.ts`, `src/renderer/canvas/Canvas.tsx`
- Modify: `scripts/verify-palette.cjs`

**Interfaces:**
- Consumes: `window.canvas.credential` (Task 5), `SERVICES` (Task 1).
- Produces: `InputMode.kind` includes `'secret'`; a `credentials` `PaletteScope` and `SECTIONS` entry; `buildCredentialRows` in `commands.ts`.

- [ ] **Step 1: Write the failing palette checks**

Append to `scripts/verify-palette.cjs`, continuing its numbering (the current last number is 69):

```js
// 70. A declared service with no stored credential renders an ADD row, and one
// with a credential renders verify and delete rows. A service that vanishes
// from the list when it has no credential is indistinguishable from a service
// this app does not support — verify:palette 31's rule.
{
  const rows = buildCredentialRows([], SERVICES)
  ok(70, rows.some((r) => r.id === 'credential.set.github' && !r.disabledReason))
}

// 71. Credential rows are hiddenAtRest and live in the credentials scope, the
// rule every settings row already obeys — M6p sized the resting list to about
// eight rows deliberately.
{
  const rows = buildCredentialRows([], SERVICES)
  const r = rows.find((x) => x.id === 'credential.set.github')
  ok(71, r.hiddenAtRest === true && r.scope === 'credentials')
}

// 72. The delete row is destructive, and the row for a stored credential shows
// the LABEL rather than anything derived from the token.
{
  const meta = [{ service: 'github', label: 'octocat', addedAt: 'x' }]
  const rows = buildCredentialRows(meta, SERVICES)
  const del = rows.find((r) => r.id === 'credential.delete.github')
  const verify = rows.find((r) => r.id === 'credential.verify.github')
  ok(72, del.destructive === true && verify.title.includes('octocat'))
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:palette`
Expected: FAIL — `buildCredentialRows` is not a function.

- [ ] **Step 3: Add the scope, section and rows**

In `palette-model.ts`, add `'credentials'` to `PaletteScope`, `SCOPE_LABEL`, and a `SECTIONS` entry `{ id: 'credential', label: 'Credentials' }` placed immediately before `manage`.

In `commands.ts`, add:

```ts
export function buildCredentialRows(
  stored: readonly CredentialMeta[],
  services: readonly CredentialService[]
): Command[] {
  return services.flatMap((svc) => {
    const meta = stored.find((m) => m.service === svc.id)
    const base = { section: 'credential' as const, scope: 'credentials' as const, hiddenAtRest: true }
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
        // The LABEL, never anything derived from the token.
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
```

- [ ] **Step 4: Add the `'secret'` input kind**

In `Palette.tsx`, widen `InputMode['kind']` to `'text' | 'confirm' | 'number' | 'secret'`, with this comment above it:

```ts
  /**
   * 'secret' is 'text' with three differences, each against a specific
   * failure: it renders type="password", so a token is not on screen in an app
   * whose users screenshot canvases; `initial` is always '' so a secret field
   * never pre-seeds; and unlike 'number' a REFUSAL never re-seeds the typed
   * value. 'number' re-seeds deliberately, so the user can see and correct
   * what they typed — but a secret field is masked, so there is nothing to
   * correct by reading, and re-seeding only extends how long the plaintext
   * lives in renderer state for no benefit.
   */
```

and render the input as `type={inputMode.kind === 'secret' ? 'password' : 'text'}`.

- [ ] **Step 5: Wire Canvas**

In `Canvas.tsx`, add `beginSetCredential`, `verifyCredential` and `beginDeleteCredential` to the palette actions, following `beginRenamePreset`'s two-step shape exactly. `beginSetCredential` sets:

```ts
setInputMode({
  kind: 'secret',
  label: findService(id)?.help ?? 'Paste the token',
  initial: '',
  submit: (value) => {
    void window.canvas.credential.set({ service: id, token: value }).then((res) => {
      setInputMode(null)
      void reloadCredentials()
      if (!res.ok) { /* re-prompt with feedback, and NOT with the typed value */ }
    })
  }
})
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm run typecheck && npm run verify:palette`
Expected: PASS, three more checks than before.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/palette src/renderer/canvas/Canvas.tsx scripts/verify-palette.cjs
git commit -m "feat(m13): masked credential entry, reusing input mode rather than a modal"
```

---

### Task 7: The structural checks

**Files:**
- Modify: `scripts/verify-meta.cjs`

These are the checks success criteria 2 and 3 rest on. Both are claims about **what does not exist**, which no runtime behaviour can observe — the same reasoning `verify:panels` 94 runs on.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-meta.cjs` (its current last number is 19):

```js
// 20. RULE 1, AS SOURCE TEXT. No credential IPC handler may return a cipher,
// and there must be no credential:get channel at all. This has NO runtime
// symptom when broken — everything keeps working, better in fact — so a
// behavioural check cannot exist. The absence of `get` IS the design.
{
  const contract = read('src/shared/ipc-contract.ts') ?? ''
  const ipc = read('src/main/ipc.ts') ?? ''
  const noGet = !/credential:get/.test(contract) && !/CREDENTIAL_GET/.test(contract)
  const noCipher = !/cipher/.test(ipc)
  ok('20 no credential:get channel exists and no handler names a cipher',
    noGet && noCipher, `noGet=${noGet} noCipher=${noCipher}`)
}

// 21. RULE 2, AS SOURCE TEXT. A stored credential must never reach a PTY, so
// the three modules that build a process environment must not import the
// store. Prose alone has already lost this kind of invariant in this repo:
// CLAUDE.md's dispose call-site count went stale inside the commit recording
// it. Also pins that store.read() — the one function returning plaintext — has
// no caller in the IPC layer.
{
  const offenders = ['src/main/shell-env.ts', 'src/main/pty-manager.ts', 'src/main/session-backend.ts']
    .filter((f) => /credential-store/.test(read(f) ?? ''))
  const ipc = read('src/main/ipc.ts') ?? ''
  const readsPlaintext = /credentialStore\.read\(/.test(ipc)
  ok('21 no env-building module imports the credential store, and no handler calls read()',
    offenders.length === 0 && !readsPlaintext,
    offenders.length ? offenders.join(',') : `readsPlaintext=${readsPlaintext}`)
}
```

- [ ] **Step 2: Run**

Run: `npm run verify:meta`
Expected: PASS, `21/21`.

- [ ] **Step 3: Fault-inject BOTH, then restore**

Add `CREDENTIAL_GET: 'credential:get'` to the contract; run `npm run verify:meta`; expect 20 to FAIL reporting `noGet=false`. Remove it.

Add `import { createCredentialStore } from './credential-store'` to `src/main/shell-env.ts`; run again; expect 21 to FAIL naming that file. Remove it.

A structural check that has never been watched failing is a regex nobody has proven matches anything.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-meta.cjs
git commit -m "feat(m13): pin the two boundary rules as source text, since neither has a runtime symptom"
```

---

### Task 8: End to end in a real renderer

**Files:**
- Modify: `scripts/verify-panels.cjs`

**Interfaces:**
- Consumes: everything above. The harness must pass a `credentialStore` into `registerIpcHandlers`, built with a fake crypto and a temp `filePath`, the way it already hand-wires `PtyManager` and a no-op `rebuildMenu`.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-panels.cjs`, continuing its numbering (current last is 124):

```js
// 125. The whole boundary in one window: a token entered through the REAL
// palette input mode is stored and listed back, and is NOT readable through
// any member of the bridge. Both halves are required — the negative alone
// passes before the feature exists, which is the vacuity trap this suite
// already records for checks 111/111b.
{
  await zoomTo(wc, 'k')                       // open the palette
  await type(wc, 'add github token')
  await press(wc, 'Enter')                    // enters secret input mode
  const masked = await wc.executeJavaScript(
    `document.querySelector('.palette__input')?.type`)
  await type(wc, 'ghp_e2e_token_value')
  await press(wc, 'Enter')
  await settle()

  const probe = await wc.executeJavaScript(`(async () => {
    const list = await window.canvas.credential.list()
    const keys = list.length ? Object.keys(list[0]) : []
    // Every bridge member, walked: none may hand back the token.
    const serialised = JSON.stringify(list)
    return {
      stored: list.some((m) => m.service === 'github'),
      leaked: serialised.includes('ghp_e2e_token_value') ||
              keys.includes('cipher') || keys.includes('token'),
      hasGet: typeof window.canvas.credential.get === 'function'
    }
  })()`)

  ok(125, masked === 'password' && probe.stored && !probe.leaked && !probe.hasGet,
    `masked=${masked} stored=${probe.stored} leaked=${probe.leaked} hasGet=${probe.hasGet}`)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build && npm run verify:panels`
Expected: FAIL — the palette row does not exist yet in the built renderer if Task 6 was not built; otherwise it should pass. If it passes on the first run, rebuild after temporarily removing the `type="password"` branch and confirm `masked` reports `text`, so the mask clause is known to discriminate.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-panels.cjs
git commit -m "feat(m13): prove the boundary end to end in a real renderer"
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/ideas-backlog.md`

- [ ] **Step 1: Add the load-bearing entries to CLAUDE.md**

Add to `## Load-bearing details`, in the file's established voice (each entry names the *silent* failure):

- **A credential never reaches a PTY, and that is stricter than `shell-env.ts` on purpose.** State the axis: not sensitivity but whose decision it was. Without this paragraph the next reader "harmonises" the two and the milestone evaporates.
- **The store refuses rather than falling back to plaintext.** Name why a fallback is invisible at every surface.
- **`credentials.json` is its own file.** The three reasons: the 500ms full rewrite, hand-editing being a documented path, and `parseLayout`'s `.bak` copy duplicating a ciphertext.
- **There is no `credential:get`, and its absence is the design.** Point at `verify:meta` 20/21 as the only durable form of the claim.

- [ ] **Step 2: Update the verify table**

Add a `verify:credentials` row (14 checks; call out 4, 6 and 7 by number as the ones worth knowing) and update the `verify:ipc` row from 31 to **35 channels**, naming the four and why none returns a secret. Update `verify:meta` to 21 and `verify:panels` to its new count.

- [ ] **Step 3: Update the IPC diagram**

In the `## Architecture` block add:

```
renderer --invoke--> credential:list / credential:set / credential:delete   --> main
renderer --invoke--> credential:verify                                      --> main
```

- [ ] **Step 4: Update the backlog**

In `docs/ideas-backlog.md` #9, note that the trust-boundary design pass it names as a prerequisite has landed, name the spec path, record the decision (no credential reaches an agent) and the deferred broker, and note that tier-1/tier-2 reference implementations are now unblocked.

- [ ] **Step 5: Full verify and commit**

```bash
npm run verify
git add CLAUDE.md README.md docs/ideas-backlog.md
git commit -m "docs(m13): record the credential boundary and retire #9's prerequisite"
```

---

## Self-Review

**Spec coverage:** §1 store → Task 2; §2 rule 1 → Tasks 2/5/7; rule 2 → Task 7; rule 3 → Task 4; §3 refuses → Task 2 check 6; §4 separate file → Task 3; §5 secret input → Task 6; §6 consumer → Task 4; services declaration → Task 1; all five success criteria → Tasks 2, 7, 7, 2, 9.

**Known gap, deliberate:** the spec's "what none of this proves" — `safeStorage`'s real OS-level protection, and the real network call — is covered by no task, because no automated check in this repo can reach either. Both are recorded in the spec and must be exercised by hand once before this branch merges.

**Type consistency:** `CredentialMeta` (Task 1) is the return of `list()` (Task 2), the payload of `CredentialSetResult` (Task 5), and the input to `buildCredentialRows` (Task 6). `SetResult` (Task 2) and `VerifyResult` (Task 4) are structurally identical and both surface as `CredentialSetResult` at the bridge — deliberate, so the palette has one result shape to handle.
