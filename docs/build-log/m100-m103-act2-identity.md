# Act II — identity and scope (M100–M103): build log

Branch `m100-teammates`, 2026-09-05. Spec: `docs/superpowers/specs/2026-09-05-act2-design.md`.
Plan: `docs/superpowers/plans/2026-09-05-act2.md`. One log for the act; two tracks (A: M100 →
M102 → M101 in the main checkout; B: M103 in a worktree subagent), integrated at the gate.

## M100 — Teammates, and Places

### Red first

`scripts/verify-teammates.cjs` (new suite, wired after `verify:verbs`): `places.1–.4`, `gate.1`,
`record.1` — red at bundle time. `verify:layout teammate.1–.2`, `verify:palette teammate.1` red;
`verify:file memory.3` (two stores, two files) was green on its first run — the store was
already generic over its directory, and the check pins the AXIS rather than proving new code.

### Shape decisions worth recording

- **A place is CHOSEN, never typed.** The pane's `add a place…` is the OS folder dialog
  (`teammate:choose-place`), so the record only ever holds an absolute, real folder; the parser
  drops a relative place by name anyway, and `verify:layout teammate.1` pins that.
- **The gate runs on the EXPANDED path, before `resolveCwd`.** `resolveCwd` falls back to home
  for a folder that does not exist; gating after it would turn a refused folder into an allowed
  home silently. Both spawn sites (`agent:create`, `spawn:sheet`) ask first.
- **The brief is main's.** A teammate's chat carries `teammateId` on its create; MAIN appends
  `You are <name>. <brief>` from its own roster on EVERY spawn (the M81 supervisor rule reached
  for an identity) — the renderer never carries the brief, and a relaunch's re-create gets it
  again with no record needed on the chat.
- **A teammate with no places may spawn nothing** — the sheet's row is disabled naming the
  fix, and the gate refuses anyway (`places.4`). Never "everything".
- **Two memories, two axes.** A teammate's memory is a second `createMemoryStore` over
  `memory/teammates`, asked by a `teammate:<id>` root the memory handlers route; the chat's
  first message carries BOTH blocks, each bounded, and says so.
- **The honest limit, stated.** Places bound what THIS APP does on a teammate's behalf — the
  cwd it spawns into, the memory it reads. The CLI's own tool calls (a `Read` of `~/.ssh`)
  are governed by the CLI's permission system, which the app cannot see into; the brief says
  where the teammate may work, and M102's card is the only gate on what it spends.

### What the checks caught

- `verify:layout shell.1` pinned the navigator's enum list; it follows the schema with
  `teammates` now. `verify:meta 22` caught `memory.2` reused from M83 — `memory.3`.
- `verify:styles 2` caught three tokens that do not exist (`--ink-3`, `--t-s`, `--mono`).

## M102 — Service scope per teammate, and the spend card

### Red first

`verify:credentials scope.1` (the grant by CODE before the store is read; a GET uninterrupted; a
POST asking with service, account, action, target and cost; a `false` refused by code and never
fetched; the row naming the teammate), `verify:agent-session external.1`.

### Shape decisions worth recording

- **The teammate is never the CLI's claim.** `tc api` carries no teammate field; the control
  handler derives it from the PANEL that asked (a chat's `teammateId` in main's own records).
  An agent cannot name an identity it is not.
- **The grant is checked before `store.read`**, so the store's three readers stay three
  (`verify:meta readers.1` untouched) and a refused attempt is an audit row with no token
  behind it.
- **`READ_ONLY_METHODS` is data** (`GET`, `HEAD`, `OPTIONS`); everything else asks.
- **The card is an EXTERNAL question on the teammate's chat** — `askExternal` on the manager
  puts it on the session's pending set and resolves the answer; `answerPermission` resolves it
  without writing to the process; M98's grant (`Allow for session`) answers it before any
  event; a dispose answers `false`. One door, every surface. A teammate with no live chat
  cannot be asked, so its write is refused by name (`not-answered`) — a write nobody can
  approve is not performed.
- **OAuth is the missing half**, said in the spec: a token pasted through Connect is the only
  connection; no suite reaches a real provider.

## M101 — Routines

M0 said the timer path was live; it was, and M101 is ONE runner plus one tick. The runner arms
an interval per unpaused routine in main (a paused one is KNOWN — `Run now` still works — but
has no interval); the tick is `routine:fire` to the renderer, which mints the fresh chat as
the teammate, SENDS the prompt (a routine is scheduled work; the send is the point, and the
design rule rides its system prompt verbatim: *routines gather, analyze, draft and prepare;
irreversible actions stay behind confirmation*), inserts the plan line into the composer for
the record, and reports the run through the one save door so the row says what happened.

- **Missed, never skipped.** At arm, a routine whose due tick fell while the app was closed is
  marked `missed at <time>` and NOT fired: a run nobody asked for at a time nobody chose is the
  surprise the rule refuses. The row says it; `Run now` is one click away. `verify:file
  routine.1` drives the arm, the tick, the re-arm, the pause and the mark over injected timers.
- **Refused at save, by name, against M96's table**: a destructive verb in the plan line, a
  teammate without `scheduling`, an interval under a minute, an empty prompt. `verify:verbs
  routine.1`. The record rules: `verify:layout routine.1`.
- **In-app only, said on the row** (`runs while the app is open — not while it is closed`).

## M103 — the browser pane (track B, a worktree subagent)

*Reverses `2026-09-03-v2-scope-decision.md` §5, narrowly.* M0 measured the one shape M91 had not:
a `<webview>` guest loads under the shipped CSP with no violation and follows the world's
transform, clip and z-order. The renderer's CSP is NOT relaxed.

### Red first

`verify:meta browser.1` (the guest's five properties as text), `verify:layout browser.1` (the
eleventh kind on disk; a non-http(s) url is malformed, dropped by id), `verify:file browser.1`
(the read refuses `file:`, `data:`, `about:`, `chrome:` by name before evaluating; an https page
is read, capped and passed outward — a planted token gone), `verify:verbs gate.3`
(`browser-read.ts` is the only file that evaluates script in a guest, and it calls `outward`),
`verify:palette browser.1`, `verify:ipc` 98 → 99; then `verify:panels browser.1` against a page
that rewrites its title and history — the readout stays the guest's own `getURL()`.

### Shape decisions worth recording

- **`webviewTag: true` is the setting Electron's docs discourage**, and every property they warn
  about is closed by name in `main/index.ts`: `will-attach-webview` strips `preload`, forces
  nodeIntegration off and contextIsolation on, and refuses a non-http(s) `src`; the
  `persist:tc-browser` partition's permission handler answers `false` to every ask; the attached
  guest's `setWindowOpenHandler` denies every window. `verify:meta browser.1` reads all five.
- **The address readout is set from the guest's `getURL()` on `did-navigate` and
  `did-navigate-in-page`, and from nothing a page can write** — a hostile page cannot paint a
  false address over the pane.
- **Reading the pane is leaving the app**: `browser:read` is MAIN's — the guest resolved by the
  id the node registered and checked to be a webview, the scheme checked on the LIVE url (a
  navigation gate alone leaves `about:blank` and a `data:` redirect readable), the text capped
  inside the guest, then `outward(text, 'a remote page at <host>')`.
- The node creates the guest IMPERATIVELY, keyed on the panel id alone — an effect keyed on the
  record's url would rebuild the guest on every navigation. `browser-store.ts` is the per-panel
  guest record (id and reload), cleared at the panel-removing sites; an `exit-ok` edge into the
  pane RELOADS it (M78's table, no new trigger), with a named skip when no guest is live.
- The palette's `Open a page…` door takes a URL or a bare host (`localhost:3000` gets `http://`)
  in text mode and refuses a non-http(s) scheme on the feedback line.
- **The iOS Simulator pane is declined by name** in the act's spec: no seam, a screen-scrape,
  unbounded scope.

## Findings (critic and verifier, two parallel fresh-context subagents)

### The critic — twenty-six findings; eight taken, the rest declined or deferred by name

**Taken.** (1) The roster row's tail truncated exactly at the permission word (`1 place · 1
service · s…`): the nouns are short now (`svc`) and the permission word survives. (2) A granted
service read only `not connected`, the grant implied by the verb alone: the row says
`GitHub — granted · not connected`. (6) The pane's scrollbar overlaid and clipped the right edge
(`grant`, `every 10m`, `Add routine`): `scrollbar-gutter: stable` on the detail. (8) The missed
tick was body text in the same grey as `last run`: it is in the attention tone now. (16) The
`granted to…` line rendered at heading size above the service name: sized as the sentence beside
`connected as`. (17) The shot fixture's refused audit row carried two reasons, the first false for
its own path: one reason. (9) The routine form's fields have labels (`prompt`, `verb line`).
(3) `Chat as <name>` sits beside the record's heading, not below the fold.

**Deferred, by name.** (13) The address painted twice and the kind word three times on the
browser pane, and (21/24) the minimap and status pill covering a chat's verbs — M106's header
discipline (Act III). (20) The approval card absent from `auto.png` — the Act I record stands
(the harness's fake agent reuses one request id).

**Declined.** (11) The `on exit 0` label sits on the part of the edge the navigator hides — the
fixture's framing; M78's checks pin the label. (12) `asleep` beside `listening` is the fixture's
composition. (22) `not started` (never ran) vs `asleep` (ran, restored) is M63's deliberate
distinction. (7, 14) A disabled verb's reason is its title, the app's rule for every control.
(23) `Deny` vs `Deny Bash` is pre-existing wording. (18) `Reconnect…` opens the palette's secret
mode; `Verify` acts — the ellipsis is right.

### The verifier — fourteen findings; eleven taken, one declined, two deferred by name

**Taken.**
1. **(blocker) The spend card was opt-in for the agent and a panel id could be borrowed**: a
   headless chat's environment carried no `TC_PANEL_ID` and no socket, so `tc api` from a
   teammate's chat was "a request with no teammate" — the pre-M102 broker — and `--panel
   <another chat>` borrowed that chat's grants. Now every headless session's environment is its
   own (`envFor`: the door, `TC_PANEL_ID`, a per-session `TC_PANEL_TOKEN`, `tc` on PATH — the
   block PtyManager already gives a terminal), `tc` forwards the token, and the control handler
   maps a token to the panel main minted it for, IGNORING a claimed panelId beside it; a token
   this window never minted is refused by name. `verify:control token.1`.
2. **(blocker) The routine tick sent its prompt into "the newest chat"** — read from `panelsRef`
   before React had rendered the mint, so a user's own chat got the routine's prompt, or nothing
   was sent and the row said `last run` anyway. `beginNewChat` answers its minted id now
   (`SpawnResult.id`), and the tick uses it.
3. **(blocker) Every `routine:save` re-armed every routine**, resetting each interval's phase — a
   one-minute routine's saves starved a five-minute one forever. `arm` keeps the timer of a
   routine whose schedule is unchanged; the missed mark is computed only at STARTUP, so a
   resume after a long pause is never "the app was closed" (findings 3 and 8; `verify:file
   routine.2`).
4. A relaunch re-created a teammate's chat without its `teammateId` — no brief, no gate.
   `useChatSessions` carries it.
5. The spec said the file verbs were gated; they are the user's own panels and were not. The
   spec is amended at the gate, the suite header too, and the honest limit stands as written.
6. The spend card could land on another chat of the same teammate: the asking panel rides
   `SpendApproval` and is preferred.
7. `saveTeammate` replaced an unparseable record with an EMPTY one — places and services gone
   silently. It refuses by name now.
9. The tick's report merged onto main's stale fire payload: it merges onto the LATEST record.
10. The control door's memory verbs ignored the `teammate:` prefix (a nonsense repo file);
    routed like the IPC door.
11. The card says `cost: … (as stated by the caller)`.
13. `routineRefusal` refuses a teammate with no places; `placeRefusal` names `(no folder)` for an
    empty cwd instead of an empty string.
14. `setPermissionCheckHandler` set beside the request handler on the guest partition.

**Declined.** (12) The card's tool name is the service (`github`), not `broker:github` — the
spec's prefix was a namespace no other tool shares; the spec is amended.

**Deferred, by name.** (4b) A routine's `ROUTINE_PROMPT` is not on the chat's record, so a
relaunch resumes that chat without it — the teammate's brief returns, the routine rule does
not. (10b) `tc memory add --teammate`, and the pane's memory, skills and chats lists: the
memory store and routing exist; the surfaces are not built this act.

## Verification

`npm run verify` alone on `m100-teammates` at the gate: every suite green, `verify:panels
305/305 passed`, exit 0 (1607 PASS lines). Four chain runs went red on the way, each on ONE
clause of a new check reading state at the wrong moment or against the wrong door — the
control suite's call count read after the next call; the browser check counting every panel
an earlier block left, then asserting the harness's in-memory store had dropped a record only
the PARSE drops (the door a file on disk takes) — each fixed by pinning the fact the check
meant. `npm run shot`: 45 scenes including `teammate`, `routine`, `browser` and the updated
`integrations`.

**Unproven, by design or by this run:** the OS folder dialog, a real tick over minutes, a real
broker write with a card, a real remote site in the guest (the manual-only list); the file
verbs are NOT gated (amended in the spec); a routine chat's rule prompt does not survive a
relaunch; `tc memory add --teammate` and the pane's memory/skills/chats lists are not built.
