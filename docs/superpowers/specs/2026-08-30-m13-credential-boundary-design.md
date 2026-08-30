# M13: The credential boundary — Design

**Status:** designed, not yet implemented.
**Predecessor:** `2026-08-29-m12-live-cwd-design.md` by number; by DEPENDENCY,
none. M12 touches `tmux-args.ts`, `pty-manager.ts` and the inspector; this
milestone adds a new main-process module, a fourth palette input kind, and four
IPC channels, and shares exactly one file with M12 — `ipc-contract.ts`, where
both only append. The number records claim order, not a build order.
**Backlog entries:** #9 (app and service integrations — the agentic super app),
specifically the constraint it names as a prerequisite: *"every integration is
a new trust boundary in an app whose entire security posture today is 'the
renderer has no network and no fs, and main owns everything.' Tokens for N
services, stored somewhere, reachable by agents that run arbitrary commands.
That deserves its own design pass before the first integration ships, not the
fifth."* This is that design pass, plus the smallest store and consumer that
keep it from being a customer-free abstraction. Also #31 (secrets in agent
output), whose standing rule this milestone is the first to inherit
deliberately rather than by accident, and #28 (accounts), which its own text
says "shares #9's trust-boundary design".

## Goal

Decide, once and in code, **who in this app may hold a service credential** —
and make the answer structural rather than remembered.

Backlog #9 lists four tiers of integration and warns the trust boundary deserves a
pass before the first one ships. The reason is specific to this app rather than
general security hygiene: **this is an app whose entire purpose is running
arbitrary LLM-driven CLIs as the user.** A credential that reaches a panel
reaches a process that can `curl` anywhere, read any file, and print anything
to a buffer that #30, #16, #39 and #28 all propose moving somewhere else. There
is no meaningful "least privilege" story for a token handed to an agent; the
only durable control is whether it is handed over at all.

## The measurement that frames everything

`grep -rn "https\|node:http\|fetch(" src/main/` returns **nothing**. There are
31 invoke channels and not one of them reaches the network. The renderer's CSP
is `default-src 'self'`, the renderer has no fs, and main owns every process.

That posture is not an accident and #31 says plainly that it "is doing a lot of
work, and it makes the first feature that widens it disproportionately
expensive." **This milestone is that first feature.** It should be read as
spending a budget, not as adding a module — which is why the consumer in scope
is deliberately one HTTP GET rather than a GitHub panel.

## The decision

**A stored credential never reaches an agent's process.** Not in the
environment, not in argv, not in a file the agent can read, not via a broker.

Three alternatives were considered and rejected:

- **Opt-in per panel, per service** — main injects a chosen token into one
  PTY's env. The grant is then the entire control: once injected, the token is
  wholly in the agent's hands, and the app's own attention/scrollback features
  (#30, #16, #39) are all disclosure surfaces for it. Rejected because the
  control it offers is one-shot and irrevocable, which is the weakest shape a
  control can have.
- **A broker** — agents reach a loopback socket or CLI that holds no secret and
  proxies authorised calls, so main can scope, log and revoke. Genuinely the
  strongest design and the only one that survives an agent pasting its
  environment into a log. Rejected for *this* milestone on size alone; it is a
  milestone of its own, and it is strictly easier to build later on top of a
  store that never leaked than to retrofit onto one that did.
- **Defer the question to the first integration** — rejected because that is
  exactly the sequencing #9 warns against, and because "we will decide when it
  matters" reliably resolves to "whatever was easiest that week."

### Why this rule is stricter than the app's existing behaviour

It has to be stated, because a reader will notice the inconsistency and
"correct" it otherwise.

`shell-env.ts` captures the user's entire login environment once at startup and
**every PTY inherits it** (#31 names this: "the app holds a process-wide object
full of exported tokens"). So agents already receive secrets today, and this
milestone does not change that.

The distinction is not about the secrets' sensitivity, it is about **whose
decision it was**:

- The environment is the *user's own* pre-existing configuration, exported by
  their own dotfiles, and the agent needs it to function at all — `claude`
  finds its API key there. Withholding it would break the app's premise.
- A credential in this store is one **this app obtained**, through a UI this
  app built, for a purpose this app performs. Handing it to an agent is a
  choice the app would be making gratuitously, on the user's behalf, for no
  functional gain.

Undoing rule 2 below therefore does not make the app "consistent". It converts
a decision the app made into a decision the app leaked.

## Scope

In:

- **`src/main/credential-store.ts`** — encrypted at rest, injected crypto,
  plain-node testable.
- **`userData/credentials.json`** — a new file, deliberately not `layout.json`.
- **Four IPC channels** — `credential:list`, `credential:set`,
  `credential:delete`, `credential:verify`. 31 -> 35.
- **A fourth `InputMode.kind`, `'secret'`** — masked entry through the palette.
- **One consumer** — `credential:verify('github')`, a single
  `GET https://api.github.com/user`, storing the returned `login` as the
  credential's display label.
- **Inspector / palette surfacing** of credential *metadata* only.
- **A new plain-node suite, `verify:credentials`**, plus a source-text
  structural check in the spirit of `verify:panels` 94.

Out, deliberately:

- **OAuth of any kind.** The user pastes a Personal Access Token. A device flow
  is real work (polling, expiry, refresh) and buys nothing this milestone
  needs; it is where the *GitHub* milestone starts, not this one.
- **A GitHub panel kind.** #9's tier-1/tier-2 reference implementations are
  sequenced *behind* this pass on purpose.
- **A broker.** See above.
- **Token refresh, expiry handling, rate limiting, scope negotiation.** A PAT
  that stops working reports that it stopped working.
- **Any second service.** The store is keyed by service and one service is
  registered. Two concrete consumers is #9's own bar for generalising, and this
  milestone deliberately does not reach it — the store is a store, not an
  integration surface.
- **Redaction of agent output (#31's own subject).** Untouched; this milestone
  inherits the rule rather than implementing it.

## Design

### 1. The store

```ts
export interface CredentialCrypto {
  /** False when the OS keychain is unavailable — see "refuses, never falls back". */
  available(): boolean
  encrypt(plaintext: string): Buffer
  decrypt(blob: Buffer): string
}

export interface CredentialStoreDeps {
  filePath: string
  crypto: CredentialCrypto
  onWarning?: (message: string) => void
}

export function createCredentialStore(deps: CredentialStoreDeps): CredentialStore
```

Production passes Electron's `safeStorage`; `verify:credentials` passes a fake.
This is the same dependency-injection trade `layout-store.ts` makes with
`filePath`/`schedule`, `review-engine.ts` makes with `GitRunner`, and
`presets.ts` makes with `which` — and it is what keeps the whole store in the
cheapest, fastest verify tier the repo has rather than needing a real Electron
window to exercise a file format.

On disk:

```json
{
  "version": 1,
  "credentials": {
    "github": {
      "label": "octocat",
      "cipher": "<base64 of safeStorage.encryptString>",
      "addedAt": "2026-08-30T12:00:00.000Z",
      "verifiedAt": "2026-08-30T12:00:04.000Z"
    }
  }
}
```

`cipher` is the only secret field. Everything else is metadata the renderer is
allowed to see, and the split is what makes `CredentialMeta` (below) a
projection rather than a filter someone has to remember to apply.

**Services are declared, not free-form.** A `SERVICES` array in
`shared/credential-schema.ts` holds one entry per supported service — id,
label, and the help text naming what kind of token to paste — exactly the shape
`SETTINGS` already has in `settings-schema.ts`, and for the same three
payoffs: `set()` can reject an id the schema does not declare, the palette rows
are generated from the array rather than hand-written, and an unrecognised id
read from a hand-edited file is dropped with a warning rather than carried
forward as a permanent typo (`verify:layout` 67's rule, applied to a second
map). M13 declares exactly one entry, `github`.

### 2. The boundary, as three rules

**Rule 1 — no IPC channel returns a secret.** `credential:list` returns
`CredentialMeta[]`: service, label, addedAt, verifiedAt, present. There is
deliberately **no `credential:get`**, and its absence is the design rather than
an omission. A `get` would put the plaintext in the renderer — the process that
also holds every byte of agent output, an undo stack, and a DOM.

**Rule 2 — no secret reaches a PTY.** `credential-store.ts` is never imported
by `shell-env.ts` or `pty-manager.ts`, and nothing writes a credential into
`PanelSpec` or the env object.

**Rule 3 — the secret leaves main only as an effect.** It is used to *make a
request*, never returned as a value, and the only thing that crosses back is
what the remote service said.

### 3. Refuses, never falls back

If `crypto.available()` is false, `set()` **fails with a stated reason and
stores nothing.**

The tempting alternative — write the token in plaintext and warn — is the worst
outcome available here, because it is indistinguishable from success at every
surface: the credential lists, the verify call works, the label appears. The
user learns their token was on disk in the clear only from someone else. A
refusal is visible, recoverable and honest.

### 4. A separate file, and why

`credentials.json`, not a key inside `layout.json`. Three reasons, each a
silent failure in the other direction:

1. **`layout.json` is rewritten in full on a 500ms coalescing debounce.** A
   secret should be written once, immediately, at a moment the user caused —
   not folded into a write triggered by dragging a panel.
2. **CLAUDE.md documents hand-editing `layout.json` as a supported path** —
   `verify:layout` 80b exists specifically for a hand-edited, out-of-range
   `agent.idleAfterMs`. A file the project invites people to open, edit and
   back up must not contain a credential.
3. **`parseLayout` copies a future-version file to `.bak`.** That is correct
   behaviour for a canvas and wrong for a secret: it silently duplicates the
   ciphertext into a second file with a different lifetime, which nothing later
   cleans up.

### 5. Entry: a fourth input kind

`InputMode.kind` gains `'secret'`. It is `'text'` with three differences, and
each of them exists against a specific failure:

- Rendered `type="password"`, so a token is not on screen in an app whose users
  screen-share and screenshot canvases.
- `initial` is always `''` — a secret field never pre-seeds.
- **A refusal never re-seeds the typed value.** This is where it diverges from
  `'number'`, which deliberately *does* re-seed so the user can correct what
  they typed (see `InputMode.feedback`'s own comment). For a secret there is
  nothing to correct by reading — the field is masked — so re-seeding only
  extends how long the plaintext lives in renderer state, for no benefit.

It inherits all four of `usePalette`'s focus rules by being the same input,
which is the same argument `'number'` and `'confirm'` already make and the
reason this app still has no modal.

### 6. The consumer

`credential:verify(service)` — main decrypts, issues one
`GET https://api.github.com/user` with the token, and on success stores the
returned `login` as the credential's `label` and stamps `verifiedAt`. It
returns `CredentialMeta`, never the token and never the raw response.

Why this is the right consumer rather than a bigger one:

- It is a **real** use of the secret, so the store has a customer. CLAUDE.md's
  standing rule (citing backlog #11) is that a customer-free abstraction is the
  failure mode, and a credential store with nothing storing credentials is the
  purest instance of it available.
- It produces a **visible, checkable fact** — the authenticated login appears
  in the inspector — so `verify:panels` has something to assert end to end that
  a fake could not have produced.
- It is honest about the actual cost. The line this milestone crosses is not
  "we now have a store", it is **"main now makes an outbound request"**, and
  the smallest possible request is the clearest way to write that down.

The request has an explicit timeout, the same bound and the same reasoning as
`GIT_TIMEOUT_MS`: a call with no ceiling is a promise that never resolves and a
UI that waits forever, and neither caller has anyone to time it out on its
behalf.

## Load-bearing details

Collected so the implementation plan can cite them, in the form CLAUDE.md uses:
each is something whose naive version fails *silently*.

- **A plaintext fallback is invisible.** See §3.
- **A `credential:get` channel is a one-line change that deletes the
  milestone.** Rule 1 has no runtime symptom when broken — everything keeps
  working, better in fact — which is why §"Verification" pins it structurally
  rather than behaviourally.
- **`label` must never be derived from the token.** The obvious cheap label
  ("ghp_…4f2a", last four characters) is a partial secret disclosure that would
  then flow into the inspector, the rail, and anything that serialises app
  state for diagnostics — which #31 explicitly warns about for
  `shell-env.ts`'s captured environment. The label is what GitHub said the
  account is called, or the service name, and nothing else.
- **The verify response must not be stored wholesale.** `GET /user` returns
  email addresses and profile data this app has no use for; storing the whole
  body would put personal data in a file whose stated purpose is one token.
  Only `login` is read out.
- **Deleting a credential must delete it, not blank it.** Writing `cipher: ""`
  leaves the previous ciphertext in the file's `.bak` lineage and in whatever
  editor undo history touched it; the entry is removed and the file rewritten.
- **The store's error paths must not include the plaintext.** A thrown
  `Error` message, a `console.error`, or a warning string that interpolates the
  token puts it in a log — which is the one place #31 says a secret must never
  reach.

## Verification

Following the repo's tiering: everything that can be plain node is plain node.

**`verify:credentials` (new, plain node).** The store against a fake crypto:

1. Round trip — set, then `list()` reports the service with its metadata.
2. **`list()` never returns a `cipher` field**, asserted on the object's own
   keys rather than on a value, so a spread that carried it through fails.
3. Unavailable crypto **refuses** and writes no file — the §3 rule.
4. An unknown service id is rejected rather than stored.
5. A malformed file warns and resolves to empty, rather than throwing — the
   absent-vs-malformed line `parsePresets` and `parseLayout`'s `baselines`
   already draw.
6. Delete removes the entry entirely, and a re-read does not find it.
7. **A refusal's error message does not contain the submitted token** — the
   last load-bearing detail above, which is otherwise defended by prose.

**`verify:ipc`.** 31 -> 35 channels.

**`verify:panels`.** A token entered through the real palette in the real
renderer, and then **not readable back through any member of the bridge** —
the positive and the negative in one window, since the negative alone passes
before the feature exists.

**A structural source-text check**, in the spirit of `verify:panels` 94 (which
counts `pty.kill` callers and `dispose` call sites by regex, deliberately,
because no runtime behaviour can observe them):

- `credential-store.ts` has **zero importers** among `shell-env.ts`,
  `pty-manager.ts` and `session-backend.ts`.
- No `ipcMain.handle` for a `credential:*` channel returns an object literal
  containing `cipher`.

Rule 2 is a claim about *what does not exist*, and this file has a written
history of prose-defended invariants going stale — the `dispose` call-site
count went stale inside the very commit that recorded it. A check is the only
durable form.

**What none of this proves, stated so a green run is not over-read:**

- `safeStorage`'s actual protection is an **OS** property (a macOS Keychain ACL
  bound to the app), and no check in this repo observes it. The suites prove
  the store calls the crypto and refuses without it; they say nothing about
  whether another binary on the machine could read the key. That needs a hand
  on a real machine once, and must not be written down as checked until
  somebody has done it — the same honesty this repo already applies to the
  auto-repeat flag and to `verify:panels` 32.
- The network call is exercised against the real GitHub API in no automated
  suite. `verify:credentials` drives the verify path against a fake fetcher;
  the real request is checked by hand.

## Success criteria

1. A token can be entered, stored encrypted, listed by metadata, verified
   against GitHub, and deleted — through real UI, in a real renderer.
2. **No IPC channel, in any code path, returns a stored secret**, pinned
   structurally rather than argued.
3. **No PTY's environment or argv contains a stored secret**, pinned the same
   way.
4. With the OS keychain unavailable, entry **fails visibly** and no plaintext
   token is written anywhere.
5. `npm run verify` is green, including the new suite.

## Open questions

- **Is `safeStorage` usable before `app.whenReady()`?** If not, the store
  constructs lazily on first use. An implementation detail, but it decides
  where the store is instantiated in `main/index.ts`.
- **Where does the credential UI live** — a palette scope (`credentials`,
  alongside `presets`/`prompts`/`settings`) or an inspector section? The
  palette scope is the closer fit to existing precedent and is the assumption
  the plan should proceed on unless the implementation finds otherwise.
- **Should `verify` run automatically at startup for a stored credential?** It
  would keep the label fresh and detect a revoked token, at the cost of an
  outbound request on every launch — which is precisely the posture change this
  spec is being careful about. Default: **no**, verification is user-initiated.
