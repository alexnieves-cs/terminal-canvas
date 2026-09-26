# M336–M338 — the account picker, the share UI, and the relay as a panel kind

Built 2026-09-26 on local `main`, on top of M330–M335
([m330-m335-collaboration.md](m330-m335-collaboration.md)), whose "Owed → UI" list this
closes. Operator docs: [docs/accounts.md](../accounts.md) (M336–M337) and
[docs/relay.md](../relay.md) (M338).

## M336 — sign-in and the account picker

**What landed.** The top bar's last control is the account menu: the active account's
initials, or **Sign in**. It is absent when accounts are unconfigured and nobody is signed
in. The menu shows every account on this Mac as a radio set, plus Add another account…,
the two sharing doors, and Sign out. The palette gains *Account: sign in with GitHub…*.
`tc accounts` lists the accounts, and `tc use <login>` switches after a confirm dialog.

**Key files.** `src/main/account-session.ts` (`activePointer`, `use`, `status`),
`src/main/bootstrap/account-handlers.ts` (the pointer file, the change hook),
`src/main/share-control.ts`, `src/renderer/account/{AccountMenu,useAccounts,account-model}.ts*`,
`src/renderer/shell/TopBar.tsx`. Channels: `auth:use`, `auth:status`, and `auth:changed`
(main → renderer).

**Decisions.**
- **The active account is ORDER.** `sessions()[0]` was already "the active one"
  everywhere (the `active()` refresh, `currentUserId`, `useSharedCanvas`). The pointer
  only reorders, so there is still one rule, not two. Signing in makes the new account
  active. Signing out the active one clears the pointer.
- **The pointer is a file** (`userData/account-active`), not a credential-store field. It
  is not a secret, and a refresh re-saving the session must not lose it.
- **One change hook wraps the service**, so the menu and `tc login` cannot disagree. It
  restarts presence, re-pushes the shared view and sends `auth:changed`. Before this,
  presence started only at launch, so a sign-in after launch had no presence until a
  relaunch.

## M337 — share, open a share, set a role

**What landed.** The share dialog (`src/renderer/account/ShareDialog.tsx`) has three
views:
- **Share:** the active workspace into an organization, with one sentence saying what
  crosses and what does not.
- **Members:** the owner's role picker over the share's organization.
- **Open:** the shares you are in, each with Open or Switch to it.

`WorkspaceRow.share` carries the share's id and your role (never the org or the doc). The
verbs `share-workspace`, `open-share` and `share-role` take all four doors. `tc shares`,
`tc share`, `tc open-share` and `tc share-role` are new. Channel:
`workspace:share-members`.

**Decisions.**
- **Every door only OPENS the dialog.** The person's click shares, opens or changes a
  role. The `tc` verbs act, but only after a Cancel-default dialog.
- **The `tc` dialogs NAME what they act on** (the fresh-context critic's boundary
  findings 1–2). `tc share` resolves the organization before asking. `tc share-role`
  names the shared workspace, because the id a terminal passes need not be the one on
  screen. An unknown id is refused before any dialog (`share.control.3`, `.7`).
- **The share dialog's class sits on DialogContent's child.** `MotionSurface` renders
  its one child's props, so a `className` on `DialogContent` never reaches the DOM. The
  first render put the card, unpositioned and with no scrim, at the bottom left.

## M338 — the relay terminal as a panel kind

**What landed.** Panel kind `relay`, built from `RelayNode` (PanelFrame) and the M335
`RelayTerminal`. It is persisted as `relay: { program, sessionId?, shareId? }`, excluded
from `isTerminalPanel`, and wired through every per-kind list: labels, the rail, the
inspector, rename, the kind word, the glyph, the placeholder word and portable export's
`CANNOT_TRAVEL`. The four doors come from `CREATABLE_OBJECTS`. Close detaches. Copy and
paste reach it, and it follows the app theme.

**Decisions.**
- **A recorded session ATTACHES.** The minted session id is written back without an undo
  step (the relay answered; the person did nothing), so a relaunch never starts a second
  process (`relay.panel.1`).
- **All four doors without a dialog** (critic finding 3, decided): a local terminal is
  already creatable from an agent line, and that is the stronger power. The relay's own
  `TC_RELAY_SPAWNERS` and `programs.json` limit what a spawn can be. The reason sits
  beside the entry in `verb-table.ts`.
- **The well is flush.** The critic asked for a left inset. It was not added: the terminal
  slot's rule (styles.css) says padding breaks clicks at a zoomed-out scale, and local
  terminals are flush too. The light band under the rows *was* fixed, with the well's own
  background.
- **The rail files it under Agents**, beside terminals, which live there too.

## Checks

- `verify:account`: `picker.1–5`, `share.members.1`, `share.control.1–7`, `share.cli.1`,
  `menu.1–3`.
- `verify:layout`: `relay.parse.1–2`.
- `verify:viewport`: `relay.kind.1`.
- `verify:relay`: `relay.panel.1–2`.
- `verify:verbs`: `creation.registry.1` now names `relay`, and `closure.v9.1` covers the
  three share verbs.
- `verify:ipc`: the count is 202.
- `verify:styles shadow.1`: names `.share-dialog__card` as an overlay.

## Goldens (the critic's sentences)

- **account-menu:** "Matches intent: the AL avatar opens a View-menu surface listing
  Active account (ada-lovelace checked, octocat), Add another account…, Sharing (Share
  this workspace…, Open a shared workspace…) and, below a rule, Sign out ada-lovelace,
  with nothing clipped or misaligned." A rule was added above Sharing, as the critic
  suggested.
- **share-dialog:** "The content matches intent … but the dialog surface is see-through."
  Fixed before writing: the card is now `--s-1`, opaque, and 500px wide, so the owner
  note no longer wraps.
- **relay:** "Matches intent: the header is kept (relay glyph, `relay · shell`), the strip
  reads You are in control · `shell` · End session, and the remote screen sits in the
  well." The band was fixed; the inset was declined (above).

The three scenes run after `starter` and turn the harness's account on. Every earlier
scene keeps its top bar exactly as its golden has it.

## Found, not fixed

`scripts/shot.cjs` passes its two run-ledger functions at positions 28–29 (`preview`,
`assets`) instead of 36–37 (`ledgerTimeline`, `ledgerEvent`). The Artifacts and Timeline
scenes therefore photograph an unwired ledger. Correcting it repaints those goldens, so it
belongs to its own change.

## Gate (2026-09-26) — the first Electron-tier run over M330–M338

`npm run verify`: the plain tier went red on four checks that 4408a553 (M331–M335)
committed. All were fixed with no pixel change. `verify:rail state.2`: RosterStrip and
TeamView spelled `'working'`, and TeamView kept its own copy of RosterStrip's tone table.
It now imports the one table, which uses `TONE_WORKING`. `verify:styles 2/6`: the relay
strip used an undeclared `--s-gap` and literal px values; they are now `--sp-*`.
`verify:styles 3`: the relay's watching screen used `opacity: .88`. It is now a
`::after` veil in a declared colour, the M204 lens-veil way. The watching state is in no
scene.

Electron tier: only the known reds (template.1, detail.1, starter.1, workflow.*,
reach.1). Four more reds were measured as flakes by rerunning each part alone:
- `panels:shell`'s ENOENT `seed.txt` infrastructure error: `readFileSync` throws inside
  `waitUntil` before the file exists.
- `onboarding.start.1` and `browser.1`: red once each out of three runs.
- `orch-bench.4`: red once, then clean.

One red was a real harness race, and it is fixed. `watch.1` read the run ledger once, just
after the node showed `exited`. The exit-2 row lands in a separate write, so the read missed
it in 2 of 3 runs. The check now waits for that row. It was green on its next three runs.
One run of the product part hit its 230 s watchdog at a load average of about 23. The next
run finished in 178.6 s.

## Owed

- A real sign-in, share and relay session against live Supabase and the VM (M330–M335's
  owed list stands).
- A teammate's relay placeholder offering Attach. The placeholder carries no session id,
  so today it is `create-relay attach <id>`.
- A Members-view golden (a shared workspace with a role picker) and an Electron DOM check
  that clicks through the menu and dialog.
- Remote names in the relay strip (`nameOf` from the presence roster). It shows
  eight-character ids for other people.
