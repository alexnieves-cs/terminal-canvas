# Act III — the product (M122–M125)

**Status:** design for the `m122-product` branch, the third act of the v6 run (3.0.0).
**Method:** one spec, one plan, one build log, one shot pass, one critic+verifier pair, one
merge; the red check is its own commit before its feat commit; `npm run verify` alone and
green before the merge. M125 is the ONE place after Act 0 that pushes and tags.

## 0. What Act 0 and the two acts settled for this act

Three `Apple Development` identities, zero `Developer ID Application` — signing for
distribution and notarisation are declined by name, and the update story is shaped around
an unsigned build. CI on the macOS runner is red on a locally-green chain (`verify:review`'s
across fixture's `git push HEAD:main` into its own temp bare origin is non-fast-forward
under the runner's git) — an M124 finding. M121 (6) is restated: the stale run row comes
through `useRuns.onAutoEvent` from a seeded `running` auto status. `cursor-agent` stays
unmeasured (backlog #80). Every outward half of the board's return path is unproven until
this act's one hand check.

## 1. M122 · Search across every panel (backlog #16)

**The shape.** One palette scope, `Find in panels…`, whose query runs in MAIN over two
durable logs — the scrollback logs (`scrollback:search` exists per panel, M39) and the chat
transcript logs (`agent-transcript-log.ts`, M73) — across the ACTIVE workspace's panels,
capped and REPORTED, every hit passed through `redactSecrets` with the count carried. A
dormant panel's log answers like a live one: that is the point of the durable log.

- `main/panel-search.ts` — pure over injected readers: `searchPanels(query, panels: {
  id, kind, title }[], deps: { scrollback: (ids, q, caps) => ScrollbackHit[]; transcript:
  (id) => TranscriptTurn[] }, caps: { maxHits, maxPerPanel }) → PanelSearchResult`, where
  `PanelSearchResult = { hits: PanelSearchHit[]; capped: boolean; cap: number; redacted:
  number }` and `PanelSearchHit = { panelId, kind: 'scrollback' | 'transcript', line, lineIndex?,
  turnIndex? }` (a `context` field was designed and dropped: the line is the context). A transcript hit is a text block's line containing the
  query (case-insensitive), `turnIndex` naming the turn. Every `line` and `context` is the
  REDACTED text (`redactSecrets` per line; the counts summed onto `redacted`). The cap is
  stated on the result (`MEMORY_MAX`'s shape), never silent.
- `scrollback:search` is widened, not duplicated: the existing invoke's answer becomes
  `PanelSearchResult` (its hits carry `kind`), the renderer's `searchResults` reads `hits`,
  and the palette's `search` scope shows the cap line and the redaction count as its first
  row when either is non-zero. A click on a transcript hit flies to the chat and scrolls its
  turn into view (`data-chat-turn` index); a scrollback hit keeps M42's door (fly and open
  the in-panel search at that line). The scope is disabled by name when persistence is off
  (`REASON_SCROLLBACK_OFF`, existing) — transcript hits still answer, so the reason says
  `terminal output is not being kept — chats still answer`.
- **Outward gate (`verify:verbs gate.2`):** search results are pane content leaving a panel
  for another reader; `panel-search.ts` imports `redactSecrets` and the renderer's rows carry
  the redacted text only. `outward` is main's here (the results are built in main), so the
  renderer module reading them imports nothing new — `gate.2` widened to accept
  `panel-search.ts` as the gate site.
- `verify:file search.1` (two logs — one scrollback file, one transcript file — one query,
  the cap reported, a planted `ghp_…` token never returns and `redacted` counts it, a
  dormant panel's log answers, case-insensitive); `verify:palette search.1` (the scope's rows:
  the cap/redaction row first, hits by panel, the disabled reason with persistence off
  naming that chats still answer).

## 2. M123 · The update notice (backlog #74, reshaped for an unsigned build)

**Auto-swap is DECLINED by name.** `electron-updater` refuses to install an unsigned update
on macOS, and this machine has no `Developer ID Application` identity, so an auto-update
that downloads and swaps the app is not buildable here; the sentence goes in the spec, the
log and the launcher's notice. What ships is a NOTICE:

- `main/update-check.ts` — pure over an injected fetcher: `checkForUpdate(current: string,
  deps: { fetch: (url) => Promise<{ status: number; body: string }>; repo: string }) →
  UpdateResult`, `UpdateResult = { kind: 'current'; version } | { kind: 'newer'; version;
  url; publishedAt? } | { kind: 'could-not-check'; reason }`. ONE GET of
  `https://api.github.com/repos/<owner>/<repo>/releases` (the list, not `latest`, so a
  prerelease can be SKIPPED by name rather than trusted); the newest non-prerelease
  `tag_name` parsed as `vX.Y.Z` compared to `package.json`'s version by a small semver
  compare (`compareVersions`, pure, pinned); a malformed feed, a non-200, a thrown fetch
  each `could-not-check` with the reason in the credential rows' words. The repository
  comes from `package.json`'s `repository.url` (`repoOf`, pure).
- `update:check` invoke (`+1` channel, both diagrams); a setting `update.checkOnLaunch`
  (boolean, default OFF, category `Updates`, NOT `planWritable` — `verify:meta update.1`
  pins it) read once at launch by main; a palette row `Check for updates…` (canvas group)
  that runs the check and shows the three states as a feedback line; the launcher footer
  gains a second line when the last check said `newer` (`3.1.0 is out — Open release`, a
  `links.open` on the url) and the environment pane a row `update` with the three states.
  The real fetcher is `https.get` in main, called by no suite (`verify:meta update.1` greps
  the suites). The relaunch-with-tmux half of #74 — what a SIGNED 3.1 would do — is written
  into this spec's §2.1 as design only.
- `verify:file update.1` over a fake fetcher (the three states; a malformed feed; a
  prerelease skipped when a newer prerelease sits above the newest release; a `v` prefix
  and a bare tag both parse; equal versions are `current`); `verify:meta update.1`.

### 2.1 What a signed 3.1 would do (design only)

With a `Developer ID Application` identity and notarisation: `electron-updater` over the
same releases feed, `autoDownload: false`, the notice's verb becoming `Install and
relaunch`, and the relaunch going through M36's tmux durability — every panel's session
survives the app process, so `quitAndInstall` is the ordinary quit (`runQuit` with
`keep: true`) followed by the new binary's orphan recovery (M55). Nothing in the notice's
three states changes; only the verb.

## 3. M124 · The third dead-end audit, and the owed hand checks

- `docs/dead-end-audit.md` gains `### The surfaces this run added (M113–M123)`: the board
  (Add to board, the typed door, tc board, dispatch's refusals, the card's four verbs and
  their reasons, the pane's drop targets, lane closed), the engines (the sheet's four rows
  and the how row's disabled knobs, the composer's handshake state, the sandbox door per
  row, the model select), search (the scope's cap row, persistence off), the update notice
  (the three states, the setting neither a plan may write). Each surface walked from every
  state with the reason it shows, in the audit's own format.
- `verify:panels reach.1` extended: a real Tab from the Board pane's first row visits every
  row and each row's verbs (`Show on canvas`), and from the card's first verb visits all
  four.
- The manual-only list re-read entire; the owed hand checks done ON THIS MACHINE and each
  recorded as done or restated: a real https site in the webview guest with a
  `target=_blank` link; a lineup into real worktrees; a real routine tick over ten minutes;
  the OS folder dialog; `Cmd+Z` over the fourth text surface. Sentry stays owed (no DSN).
  **The one outward check of the run:** a dispatch against a real `claude` in a real
  worktree with `Open PR` reaching a THROWAWAY repository, once — said in the log with what
  it proved and what it did not. The CI finding: `verify:review`'s across fixture fixed to
  push into a bare origin initialised with the same default branch (`git init --bare
  --initial-branch=main`, or push `HEAD:refs/heads/main` after `symbolic-ref`), and CI read
  again after M125's push.

## 4. M125 · Reconcile and ship 3.0.0

The version to `3.0.0`; the README table in sequence to M125; both IPC diagrams against the
contract (`verify:meta 19`); `CLAUDE.md` and `docs/load-bearing.md` in agreement; `verify:ipc`'s
count re-derived (112 after M123); both packaging gates run (`npm run package`,
`verify:packaged`) with the numbers in the log; `graphify update .`; then `git tag -a v3.0.0`,
push `main` and the tag, and a GitHub release carrying the `.dmg` from `release/` with the
Gatekeeper sentence in its body (right-click → Open, because the build is unsigned; `xattr
-d com.apple.quarantine` as the alternative). **3.0.0**: the board landed and copilot is the
third engine.

## 5. Tracks

| Track A | Track B |
|---|---|
| M122 search → M124 audit + hand checks | M123 update notice (its files: `main/update-check.ts`, the setting, the palette row, the launcher/env notice) |

M125 is the main session's alone.

## 6. Declared non-goals

Auto-swap of the app (unsigned); signing and notarisation (no identity); search across
OTHER workspaces (the active one only — a second scope later); a search index (the logs
are read on each query, capped); a release built on CI (the `.dmg` is this machine's,
unsigned, said so).

## 7. What green will not prove

That `api.github.com` answers the real fetcher (declined by construction in every suite);
that the `.dmg` opens on another Mac past Gatekeeper with the sentence; the five hand checks
and the one outward dispatch — each recorded once by hand, on this machine, in the log.
