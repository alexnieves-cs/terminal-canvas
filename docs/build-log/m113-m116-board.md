# M113–M116 — The board that dispatches: build log

Branch `m113-board`, base `main@c17b216` (2.3.0). One spec
(`docs/superpowers/specs/2026-09-06-m113-m116-board-design.md`), one plan
(`docs/superpowers/plans/2026-09-06-m113-m116-board.md`), two tracks on the one branch:
Track A (M113 record → M114 dispatch → M115 return path) in the main session, Track B (M116,
the card kind and the Board pane) as a fresh-context subagent in a worktree off M113's
schema commit, merged at `59c9d73`.

## Act 0, the measurements this act cites

Recorded before a line of the spec was written; the five answers are in the spec's §0 and the
run memory. The two that shaped this act: the baseline was green (`npm run verify` exit 0 on
clean `main`, after killing a stray dev Electron and the verify tmux servers), and 2.3.0 was
pushed and tagged. The CI finding — the macOS runner's `verify:review` across fixture fails
its push `HEAD:main` into its own temp bare origin as non-fast-forward, and the throw aborts
the suite — is recorded for M124. `cursor-agent` is unmeasured (not logged in; only the user
can log in), copilot's two doors are recorded, and there are three `Apple Development`
identities and zero `Developer ID Application`.

## M113 — the record and its doors

`shared/work-items.ts`: four states as data, two the runtime's and two the user's
(`USER_SET_STATES` is what every drop target and verb reads). The dedupe is by key, and
`upsertWorkItem` keeps what the runtime set — the check seeds a `working` item with a lane
and asserts a second `Add to board` leaves it working. `carryWorkItem` writes exactly the six
required keys for a bare item (`work.3` counts them). The record lives on the workspace beside
annotations and is absent on disk when empty; it is NOT in history — records like runs and
bookmarks, not layout, and `Cmd+Z` undoes panels, never a board. Three doors: `Add to board`
on a GitHub or Jira row (an `Added` acknowledgement in a `useState`, never a store), `New
work item…` in the palette's `canvas` group, and `tc board add <title>` / `tc board done <id>`
— read-write, so the URL door refuses it like `status`, and MAIN WRITES NOTHING: the
renderer owns the workspace it renders and would overwrite a main-side append on its next
coalesced save, so the handler asks the renderer over the ephemeral reply channel
`canvas:model` uses, with the request riding beside the channel through a sibling
`requestFromRendererWith` (the two existing callers' bare-string wire shape untouched). A
window that does not answer in two seconds is a named refusal.

## M114 — dispatch, the one verb

In order, each step refusing by name into the record's `note` and minting nothing when it
does: `board:lane` (main) finds the item's repository under the teammate's places — a place
itself, then its immediate children, by the origin url normalised to `owner/repo`; one level
and no deeper, or a dispatch is a filesystem crawl — asks the Places gate on that ROOT, then
mints M37's worktree for the chat's id. **The gate's one new rule:** a lane lives under
`userData/worktrees`, outside every place by construction, so `createPlacesGate` gained a
`worktreeRootOf` dep and judges a known lane by its record's root, naming the root in a
refusal — "add /Library/…/worktrees/lane to ada's places" is a fix nobody should apply
(`verify:teammates dispatch.1` asserts the lane path is absent from the sentence). The chat
is minted through the ordinary `agent:create` as the teammate under `DISPATCH_PROMPT`
(never push, never merge, never open a PR — the return path is the person's), which rides
every spawn from `ChatSource.dispatch` (M81's rule; `carryChatMarks` at both copy sites); the
first message is SENT (a dispatch is a hand-off, not a draft). A plain M78 edge card → chat
labelled `dispatched` with no automation — `handoffFires` unchanged. `working` from the
chat's first `message-start` (`chat-store`'s new `onChatTurnStart`), never the click. The
card FOLLOWS its lane: `anchoredPanels` re-derives the card's rect from the chat's every
render and never writes it back; a move of the card drops the anchor; closing the lane
prunes it, keeps `panelId`, keeps `working`, and sets `note: 'lane closed'`. Doors: a drop
onto a Teammates-pane row (the board's own MIME, nothing else), `Assign to…` on the card.

The `Dispatch…` palette row and the "which place" sheet for a typed or Jira item are
**deferred by name**: `dispatchWorkItem(itemId, teammateId, root?)` takes the root, and the
card's `Assign to…` lists the teammates; a typed item dispatched to a teammate with several
places is refused with main's sentence naming the choice, and the sheet that asks is owed.

## M115 — the return path

`board:lane-status` asks `rev-list --left-right --count <base>...HEAD` in the LANE, base being
the root's branch — a lane's branch has no upstream until pushed, so `status`'s `@{u}` count
is null for exactly the branch the card asks about; the parser's arms are swapped on purpose
(left is base). No fetch: `git.1`'s text rule covers the new builder by construction.
`Open PR` refuses by name through `prRefusal`, the ONE list (no lane; nothing ahead of
`<base>`; not a GitHub item; not connected, in the credential rows' sentence; the teammate
without the `github` service; a lane that could not be read), BEFORE main is asked. Main
then does two outward things behind one spend card: `git push -u origin <branch>` in the
lane with the user's own git credentials (the app holds none for git and passes nothing;
`buildPushArgs` is the one push this app builds), then the POST through the broker — never
the credential store, whose readers stay three — with the teammate riding so the broker's
own write gate asks M102's card on the teammate's chat before the token is read. GitHub's
422 "already exists" is a PR the card should know: one GET by head finds it, and `exists` and
`opened` alike set `pr` and the state `review`. `done` is the user's; on a GitHub item with a
PR the comment on the issue is offered as a second confirm and declining it still marks done.

**Deferred by name (M115):** the Jira `done` transition list (the card marks done; the ticket
row's `Move…` is where the Jira write lives, unchanged), and `Review` flying to the lane's
SECTION of the across-worktrees node (it opens the node for the lane's repository; the
section scroll is owed).

## M116 — the Board pane and the card (Track B)

The twelfth kind, `work`, sessionless like Jira's, `work: { itemId }` its only identity (the
record lives on the workspace, never the panel), one appended arm per fan-out file, its
state word from `panel-state.ts`'s arm and its tone on existing `--tone-*` names (no new
token, every measured colour still hex). The Board pane: four columns over the records,
`data-board-drop` on the `USER_SET_STATES` columns only, rows naming teammate and lane, a
click flying with `goToViewport` alone. Track B's report named what it left for Track A —
the `Open board` palette member, the card's four verb props, `settings-schema.ts`'s
`shell.navigator` enum — and each was wired at the merge. Two spec strings were reworded
because `verify:styles icons.1` bans `›` in renderer text.

The merge's one lesson: a keep-both resolution of two suite blocks appended at the same
marker dropped the closing brace of the first — `verify:layout` read `Unexpected end of
input` — and the fix was one `}`. Run every plain-node suite a merge touched.

## The checks

`verify:layout work.1–.5`, `verify:control board.1`, `verify:teammates dispatch.1`,
`verify:file lane.1`, `verify:agent-session dispatch.1`, `verify:review lane.1`,
`verify:github pr.1`, `verify:rail board.1`, `verify:panels dispatch.1` and `board.1`,
`verify:verbs closure.1` (the six new members: `dispatch` and `board` verbs, three
exclusions with reasons, `openBoard` a view), `verify:ipc` at 111 channels. Each written
first and watched failing for the right reason — `dispatch.1`'s red run was the build
without the verb.

## The gate

<!-- filled at the gate: shot scenes read, critic and verifier findings and triage, the chain's exit line -->

## What green does not prove

Every outward half (the spec's §9): that the push reaches a remote with the user's
credentials; that the POST opens a real PR; that the comment lands. `npm run verify` reaches
no network; the suites drive a fake broker and, for the PR door, a fake handler in the panels
harness. M124 owes ONE dispatch against a real `claude` in a real worktree with `Open PR`
reaching a throwaway repository. Unproven, all of it, until then.
