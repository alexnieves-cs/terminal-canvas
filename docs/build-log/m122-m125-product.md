# M122–M125 — The product: build log

Branch `m122-product`, base `main@d57403e` (Act II merged). One spec
(`docs/superpowers/specs/2026-09-06-m122-m125-product-design.md`), one plan
(`docs/superpowers/plans/2026-09-06-m122-m125-product.md`), two tracks on the one branch:
Track A (M122 search → M124 audit and hand checks) in the main session, Track B (M123 the
update notice) as a fresh-context subagent in a worktree. The red check is its own commit
before its feat commit, as in Act II.

## M122 — Find in panels…

One scope over the two durable logs — the scrollback log (M39) and the chat transcript log
(M73) — for the ACTIVE workspace's panels, built in MAIN by `main/panel-search.ts`, pure
over injected readers (`verify:file psearch.1` drives it over two real logs under plain
node). Three rules, each a silent failure without it: every line leaves through
`redactSecrets` — the outward gate's fourth named caller (`verify:verbs gate.2` names it
rather than loosening the count) — and the result carries the count; the cap is STATED on
the result (`capped`, `cap`), never silent; a dormant panel's log answers like a live one,
which is the point of the durable log. The existing `scrollback:search` invoke was WIDENED,
not duplicated: its answer is `PanelSearchResult` now, the renderer's `searchResults`
holds the whole answer, and the palette's scope shows the cap row and the redaction row
FIRST (`the first 50 matches — narrow the search`, `2 secrets redacted from these lines`),
then the hits — a transcript hit flying to its chat and to its turn through the chat
store's `scrollToTurn` bus (the panel scrolls the row whose id is the turn's). Persistence
off is no longer the whole answer: the reason reads `terminal output is not being kept —
turn on Keep output; chats still answer`, and the transcript hits stay beneath it. Both
harnesses wrap their scrollback search into the new shape; five older palette fixtures
moved to it.

## M123 — the update notice (Track B)

Track B's own log is `docs/build-log/m123-update-notice.md` (`verify:meta milestones.1`
wants a log per row, so the pair exists twice; this section is the act's summary and points
there). `main/update-check.ts` is pure over an injected fetcher — no `https` in the module,
the real `https.get` (10 s deadline, `User-Agent: terminal-canvas`, no redirects) lives in
`index.ts` and is called by no suite (`verify:meta update.1` greps for it). One GET of the
releases LIST, the newest NON-prerelease compared by a small numeric semver (`3.10.0 >
3.9.1`, a string compare says the opposite), three states and never two: `current`, `newer`
with the url, `could-not-check` with the reason. Two things the critic added after the
merge: an EMPTY feed (this repository today) is `could not check — no releases are published
for <repo>`, not `up to date`; and a `newer` answer reaches a user WITH panels through the
status strip (`3.1.0 is out`, a link), where the launcher's footer only reaches an empty
canvas. The setting `update.checkOnLaunch` is off by default, in the Updates category,
never `planWritable`; `Check for updates…` is a canvas row never disabled offline (the third
state is the answer) and disabled `checking…` while in flight; the environment rows carry
`not checked` as the rest state. Auto-swap is declined by name in the launcher's own
sentence (`the app does not install it — download from the release page`).

## M124 — the third audit, and the owed hand checks

The CI red of Act 0, fixed at its cause: `verify:review`'s across fixture made a bare
origin whose HEAD named the runner's default branch (`master`), so the second clone checked
out an unborn branch, its commit started a second root, and `push HEAD:main` was
non-fast-forward — locally green only because this machine's default branch is `main`.
`git symbolic-ref HEAD refs/heads/main` on the bare repo (every git has it) and an explicit
`checkout main` in the second clone. CI is read again after M125's push.

`docs/dead-end-audit.md` gained the M113–M123 section: every surface the two acts added,
walked from every state with the sentence it shows. `verify:panels reach.2` tabs through the
Board pane's rows (the uncarded row's `Show on canvas` in order) and the card's enabled verbs
with a REAL Tab.

**The hand checks, on this machine:**

Each of these needs a person at the app or an account's outward action, and this run's
session had neither; they are RESTATED as owed, with the exact steps, never claimed:
- **A real https site in the webview guest with a `target=_blank` link (M103).** `npm run
  dev`, `Open a page…` on `https://developer.mozilla.org`, click a `_blank` link: the
  guest's `setWindowOpenHandler` must deny and the pane must not navigate. Owed.
- **A lineup into real worktrees (M104).** The sheet's `lineup: pair` on a real repository
  with `worktree` on: two agent seats in two lanes under `userData/worktrees`, the shell seat
  in the checkout. Owed.
- **A real routine tick over ten minutes (M101).** A routine at one minute, the app left
  open: a `routine:fire` per minute and a chat minted under `ROUTINE_PROMPT`, the pane's
  `last run` moving. Owed.
- **The OS folder dialog (M100).** Teammates pane → `Add place…` → a real folder chosen and
  appended. Owed.
- **`Cmd+Z` over the fourth text surface (M24/M116).** A Jira comment draft and the card's
  `Assign to…` menu open: `Cmd+Z` must not reach `applyHistory`. Owed — the M24 entry's
  documented hazard stands.
- **Sentry (M112).** No DSN exists. Owed.
- **THE outward check (M114/M115).** A throwaway GitHub repository, a teammate with the
  `github` service and a place holding the clone, `Add to board` an issue, dispatch to a
  real `claude`, `Open PR`: the push with the user's credentials, the POST through the
  broker behind the spend card, the PR url on the card, `review` on the board. Creating a
  repository under the user's account is an outward action this session did not take. Owed,
  and the first thing to do by hand after 3.0.0.

None of the seven was done in this run. `npm run verify` is silent on every one of them, as
the manual-only list says.

## M125 — reconcile and ship 3.0.0

<!-- filled at the ship -->

## The checks

`verify:file psearch.1`, `verify:palette psearch.1`, `verify:verbs gate.2` (widened by
name), Track B's `verify:file update.1` and `verify:meta update.1`, `verify:panels reach.2`,
`verify:review` (the fixture), `verify:ipc` at 112.

## The gate

**The critic** (fresh context) found two blockers and fifteen more; taken, every one but
two. A REAL search defect no check reached: a chat that filled its per-panel cap set
`capped` and broke out of every other chat — five lines from one chat, and the row said
`the first 50 matches`; `psearch.1` now seeds a chat that fills its cap and asserts the
next chat still answers, uncapped. The cap and redaction rows were runnable rows that ran
nothing — information now, disabled with their own sentence so stepping skips them. A
transcript hit and a scrollback hit were the same row — the title carries the kind (`api ·
chat turn 3`, `api · line 120`). An empty releases feed read `up to date` — `could not
check — no releases are published`. A user with panels never saw `newer` — the HUD strip
carries it. Offline, Node's raw `ENOTFOUND` reached the palette — mapped to a sentence in
the fetcher. `Check for updates…` while checking was a silent no-op — `checking…`. `No
matches` was suppressed with persistence off — both rows stand. Three names for one
setting — its label. The README's M125 row read done before the tag — `shipping`.
**Declined:** opening M42's in-panel search at a scrollback hit's line (M42's door was only
ever `goToPanel`; the sentence is struck from the spec and the contract's comment, and
`lineIndex` stays on the wire for the day that door exists), and seeding the shot fixture's
transcript so the `search` scene shows a chat hit (the scene's intent says what the picture
shows).

**The verifier** proved written-first from git for every spec check, the network rule, the
gate's fourth caller by name, the IPC count at 112, the setting's guard, and the CI fix by
REPLAYING the fixture under `init.defaultBranch=master` — and named one real defect the
critic did not: the search handler read `layoutStore.initial()`, which applies
`restore.layout` and answers NO panels with it off, so search went quiet with nothing to say
why; both handler sites read the active row of `mergedWorkspaces()` now, and
`verify:layout search.active.1` pins the store's fact and both sites as text. Recorded and
accepted: the spec's `context` field was dropped (the line is the context); `verify:palette
update.1` landed in its feat commit; no check distinguishes a dormant panel from a live one
in search (true by construction — the reader is a file). `reach.2`'s first run found its own
mistake: the walk started at the working column's row and Tab left the pane at once — it
starts at the todo column's row now, the first in DOM order.

The chain: `npm run verify` alone on the branch tip — `EXIT=0`, 0 `FAIL` lines, 1684 `PASS` lines, `verify:panels` 314/314 (reach.2 among them), `verify:ipc` 1/1 at 112 channels.

## What green does not prove

That `api.github.com` answers the real fetcher (declined by construction in every suite);
that the `.dmg` opens on another Mac past Gatekeeper with the sentence; the five hand checks
and the one outward dispatch — each recorded once by hand, on this machine, above.
