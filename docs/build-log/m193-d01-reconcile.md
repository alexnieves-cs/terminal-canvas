# M193 — D01, the reconcile: the baseline and the development contract

The build log for the first milestone of the v10 run, which executes
[the ordered product development guide](../product-development-guide-2026-09-08.md) over
[the product audit](../product-audit-2026-09-08.md). The run's state, its phase → milestone map and
its per-phase status live in [the ledger](m193-m224-ledger.md); this file is the milestone.

**The rule this log is written under.** Every line below is marked with how it was learned:
**read** (source at HEAD, with a file and line), **observed** (a committed golden PNG at HEAD,
looked at), **run** (a command, with its exit code and tally), or **inferred** (a judgement, which
is not evidence). D01 asks for exactly this separation, and the audit it follows was explicit that
it "did not run the application interactively or verification suites". This milestone did run
them; it still did not drive the app by hand, and says so where that matters.

**Kind:** read-only discovery and documentation. No file under `src/` was changed, no store was
added, no process was started.

---

### 1. The baseline, as read

| Fact | Value | How |
|---|---|---|
| Branch | `main`, working tree clean | run (`git status`) |
| HEAD | `d785b7b` — `docs(m192): name the evidence logs precisely` | run (`git log`) |
| Tag at HEAD | `v5.0.0` | run (`git tag`) |
| `package.json` version | `5.0.0` | read |
| Last milestone in the ledger | M192, "the run, closed" | read (`m180-m200-ledger.md:1570,1634`) |
| Last milestone in the README table | M192, `✅ done` | read (`README.md:990`) |
| Milestone rows not `✅ done` | one, M117 `⛔ declined` (cursor-agent, unmeasured) | read (`README.md:923`) |
| Milestone in progress | none | read (the v9 ledger's close section) |
| Goldens committed | 57 PNGs under `verify/visual/goldens/` | run (`ls`) |

**The audit's baseline has aged, exactly as the guide predicted, and in the direction that
matters.** The audit was written against `v9-act4-media` at `85edd91` with `package.json` still
reading 4.1.0, M186 committed and M187 uncommitted. The guide was written against `3455c65`, an
M188 spec commit. At HEAD, M187 through M192 are all merged and shipped, and the repository is
tagged 5.0.0.

### 2. Reconciliation with the audit — what changed under it

Nothing in this run overwrites another milestone's intent: the v9 run is closed, not paused. What
the audit could not have known, and what a reader of it must now discount:

| The audit said | True at HEAD | Consequence for the guide |
|---|---|---|
| `package.json` identifies 4.1.0 | 5.0.0, tagged `v5.0.0` locally | The "strong v5" checkpoint after D10 is a **product** checkpoint, not a version bump. 5.0.0 is spent. Whatever D10 closes is 5.1 or 6.0, and the guide's own warning ("do not claim a version merely because this guide's phases are complete") is the governing line. |
| M187 note/frame work has uncommitted changes | M187 merged; the sixteenth kind ships | The "Notes, text, frames — REWORK language" disposition is now a rename-in-copy problem over shipped code, not a design question about work in flight. See §7. |
| Ten goldens inspected | 57 goldens exist; M191 walked **all** of them | D10's UI finish inherits a third audit that already fixed thirteen findings and **declined twenty-one by name**. Those twenty-one are in `m180-m200-ledger.md:1456`. A D10 milestone that re-opens one must say which, and why the decline no longer holds. |
| Onboarding/workflow/preview/images "exist through M186" | plus M188 executor, M189 portable file, M190 feedback door + `docs/getting-started.md` | D15 (workflow node depth) and D16 (portability) start from shipped code, not from nothing. D16 in particular is largely M189; its remaining work is the *missing-resource states* the guide names, not the file format. |

**Findings from the audit that M191 has already closed** — do not reopen without a reason. From
the M191 section of the v9 ledger: the two permanent refusal lines above the workflow diagram now
reveal with the chrome; the clipped diagram; the squeezed starter workflow; the confident `CPU 0%`;
the second filled primary; sentence-case node metadata; the new kinds' labels and sublabels. The
audit's §6 list and M191's fix list overlap here, and the audit's descriptions are the older ones.

**Findings from the audit that survive M191 and are reproduced below:** all five the guide names
in D01 step 3, plus the launcher's choice load, the rail's category labels, and the starter's
caption scale — each observed at HEAD in §3 and §4.

### 3. The five findings, reproduced at HEAD

The guide's D01 step 3 names five. Each is reproduced here against the current checkout. Four are
**read** at an exact line; two of those are also **observed** in a golden. None required running
the app by hand, and none of them is stated more strongly than its evidence.

#### 3.1 Chat context is not recognised by Files or Tools — CONFIRMED, and visible on screen

- **read** `src/renderer/panels/panels.ts:379` — `isTerminalPanel` excludes `isChatPanel`, among
  fifteen other kinds.
- **read** `src/renderer/canvas/useFileTree.ts:68-78` — `treeRoot` answers for a review panel
  (`subject.repoRoot`) and a terminal panel (`selectedLive?.cwd ?? spec.cwd`), and returns `null`
  for everything else. A chat falls into `null`.
- **read** `src/renderer/canvas/useInspectorDetail.ts:171-177` — `selectedToolboxCwd` answers for
  `isTerminalPanel` and `isToolboxPanel`, and `null` otherwise. A chat falls into `null`.
- **read** `src/shared/chat-panel.ts:26-27` — `ChatSource.cwd: string` is persisted, and its own
  comment says main expands it with `resolveCwd`.
- **observed** `verify/visual/goldens/starter.png` — with the starter's chat selected, the
  inspector's **Tools** tab reads, in full: *"A chat panel has no directory, so there is no
  toolbox to read."* The panel it is describing carries a `cwd`.

**The precise shape of the defect, which matters for D02:** it is not that a chat has no context.
It is that **two of three inspection consumers disagree with the third**. `review:*` already
answers for a chat — `agent:create` fires the same `captureBaseline` that `PtyManager` does, keyed
by the chat's id (`CLAUDE.md`, the M77 entry) — so the **Changes** section works for a selected
chat while **Files** and **Tools** say it has no directory. D02 is closing a three-way
inconsistency, not adding a capability.

**The sentence on screen is the worst part.** It is not a neutral empty state; it is a positive
false claim about the record, in a product whose stated virtue is that it explains uncertainty
honestly. D02 must delete that sentence, not soften it.

#### 3.2 The preview reloads on locality, not ownership — CONFIRMED, and narrower than described

- **read** `src/renderer/browser/BrowserNode.tsx:169-183` — the reload effect subscribes with
  `window.canvas.file.onChanged(() => { … })`. **The callback takes no parameter.** The event is
  not read at all. The only filter is on the *guest's own* hostname: `127.0.0.1`, `localhost`,
  `[::1]`, `::1`, then a 300 ms coalesced `reload()`.
- **read** `src/shared/ipc-contract.ts:1017-1020` — `FileChangedEvent = { panelId, result }`.
- **read** `src/shared/file-panel.ts:53-72` — `FileResult` is `text | missing | too-large |
  binary | unreadable`. **It carries no path.**
- **read** `src/main/ipc.ts:834-843` — `FILE_CHANGED` is sent from exactly one place: the watch
  registered by `FILE_READ`, per open **file panel**, for that panel's one path.

Two corrections to the audit's description, both of which change D03's design:

1. The trigger is narrower than "any watched file change". It fires only when **an open file
   panel's own file** changes. A repository edited by an agent with no file panel open on the
   edited file reloads nothing.
2. **The event does not carry the changed path**, so D03's step-4 question ("does the existing
   file event carry enough identity?") has an answer: *not by itself — but it does not need an IPC
   change either.* It carries `panelId`, and the renderer already holds that file panel's
   `source.path` in the panel array. The association can be resolved renderer-side from facts
   that already exist. D03 should reach for the shared contract only if the *directory* watcher
   path (`fs.watch`, M84's arming) later needs the same treatment.

#### 3.3 A run cannot express a pending approval — CONFIRMED by the module's own comment

- **read** `src/shared/run-outcome.ts:14-16`, verbatim: *"`wants-you` is reserved for the day an
  entry records a pending question; today no entry does, and `outcomeWord` answers for it so the
  day it does the vocabulary is already there."*
- **read** `src/shared/run-outcome.ts:28-38` — `BlockOutcome` includes `'wants-you'`;
  `classifyOutcome` can never return it. It maps `'exit 0' | 'a turn' | 'passed'` → `finished`.
- **observed** `verify/visual/goldens/workflow-edit.png` — a pending approval exists in that scene
  (the rail shows `claude — api (2)` with an attention dot, the dock badge reads 1, and a
  `claude — api (2)  needs you` card is on screen). **The four diagram blocks carry no such
  state.** The approval is visible everywhere except on the graph that is supposedly running.
- **observed** `verify/visual/goldens/runs.png` — the run summary reads `run 1 · 3 panels ·
  2m 0s · idle`, and the inspector's RUN section offers `Run again` and nothing else: no outcome,
  no evidence, no blocker. `idle` is the word a finished run wears.

The audit's second sentence here is the one with teeth and it is confirmed by the mapping above:
`'a turn'` classifies as `finished`. That is right for an execution node and wrong as a claim about
work, and D06 owns the distinction.

#### 3.4 Closing panels erodes the run record — CONFIRMED

- **read** `src/shared/layout-schema.ts:1834` —
  `if (members.length === 0) { warnings.push(\`dropped run ${entry.id}: it had no surviving panels\`); return }`
- **read** `src/shared/layout-schema.ts:1836-1842` — additionally, every `edge` whose endpoints are
  not both surviving panels is dropped, and every `entry` naming a missing panel is dropped **with
  a warning** while the run is kept.

So the erosion is graded, not binary: closing *some* panels of a run silently thins its per-node
outcomes; closing *all* of them deletes the run. `RUNS_MAX` (500 newest, `runs.ts`) is a separate,
intended bound and is not this.

The load-bearing tension for D11: this filter is not a bug in isolation. It is the same rule that
keeps `parseWorkspace` from holding an edge pointing at nothing. D11 cannot simply delete the
line — it must give a run's history somewhere to live that is **not** keyed on canvas membership,
and then the filter stops being the only thing standing between the file and a dangling reference.

#### 3.5 Search presents a reader failure as no matches — CONFIRMED, twice

- **read** `src/main/panel-search.ts:65-69` — the scrollback reader is wrapped in
  `try { … } catch { raw = [] }`. One throw loses **every terminal's** results at once.
- **read** `src/main/panel-search.ts:77-78` — `try { turns = deps.transcript(panel.id) } catch
  { turns = [] }`, per chat, so one unreadable transcript is silently absent from the answer.
- **read** `src/main/panel-search.ts:52` and `:98` — the result shape is
  `{ hits, capped, cap, redacted }`. **There is no field a source failure could be reported in.**

The module's own doc comment (`panel-search.ts:19-22`) states the rule it then breaks: *"The cap is
STATED on the result … never silent: a list that stops at fifty with no word reads as 'fifty
matches', which is a different fact from 'the first fifty'."* A reader that threw is the same
error one level worse — an answer of zero reads as "not here", which sends the user to look
somewhere else. D13's first milestone is therefore a **three-state** result (`hits`, plus which
sources were asked and which failed), matching this repository's own standing rule.

#### 3.6 A sixth finding, not in the audit: `note` is two different things in one type

Found while reconciling the vocabulary for step 7, and recorded here because no suite can see it —
it typechecks perfectly.

- **read** `src/renderer/shell/rail-rows.ts:147-155` — the doc comment says `RailTailKind` is
  "`Panel['kind']` plus M27's `note` — a note is a file panel carrying `source.prose`, so it has
  no `kind` of its own **and never should**". That was true when it was written.
- **read** `src/renderer/panels/panels.ts` — M187 gave it one. `note` is the sixteenth panel kind.
- **read** `src/renderer/shell/rail-rows.ts:201-202` — `tailKind` maps a prose file panel to
  `'note'`; an M187 sticky arrives as `panel.kind === 'note'`. **The two collapse to the same
  string**, and `Panel['kind'] | 'note'` is now a union with a redundant member for one meaning
  and a silently absorbed second meaning.
- **read** `src/renderer/panels/panel-state.ts:24-25` — `StateKind`'s comment carries the same
  stale claim, and its `'note'` member now serves both.
- **read** `src/renderer/shell/rail-rows.ts:317` — `{ id: 'files', label: 'Files', kinds:
  ['file', 'note', 'image'] }`. A sticky, which is not a file and has no path, is filed under
  **Files** in the rail.

Consequence today is small (both produce the same state word, and `railLabel` still tells them
apart by text). Consequence tomorrow is the ordinary one this repository writes entries about: the
first consumer that branches on `railKind === 'note'` will treat a Markdown file on disk and a
sticky in `layout.json` as one thing, and nothing will say so. It is evidence that §7's naming
problem is in the code and not only in the copy.

### 4. The eight journeys, walked

**What this section is and is not.** The guide asks for actual clicks and keystrokes, observed
confusion, and observed recovery. The paths below are **traced** from source (each row's steps are
real, named rows, verbs and controls, cited) and the visual claims are **observed** in committed
goldens at HEAD. **No journey was driven by hand in a running application**, so no claim about
*confusion* is made anywhere below — confusion is a property of a person, and this run has not
watched one. Every such judgement is marked **inferred** and is a hypothesis for D09's and D10's
critics to test, not a finding.

| # | Journey | Traced path (source) | Observed at HEAD | Status |
|---|---|---|---|---|
| 1 | New user | Launcher → `Start a conversation` (the one filled primary) → first message checks sign-in | **observed** `launcher.png`: one primary, then two cards (`New panel…`, `Open a file…`) and seven list rows, of which five are different ways to start a chat or a shell (`Chat with Claude…`, `Start Login shell…`, `Start Claude…`, `Chat with Codex…` (disabled, named reason), `New chat (no folder)…`). `New note…` is disabled: *"start a panel first — a note is saved in its directory"*. **No step asks what the user is trying to do, or in which folder.** | Confirms the audit's D09 premise. The choice count is **observed**; that it is *too many* is **inferred**. |
| 2 | Starting a task | GitHub/Jira panel → Board pane → card → dispatch (teammate + place + repo + lane + chat) → `Open PR` | **read** `main/board-lane.ts` order: teammate, repo under the places, the Places gate on the root, then M37's `ensureForPanel`. The prerequisites (a credential, a teammate with a place, a repository under it) are configured in three different panes. | Confirms D05's premise: the inputs exist and are distributed. |
| 3 | Agent implementation | Create chat → send → tools/review | **observed** `starter.png`: selecting the chat gives Tools *"A chat panel has no directory"*. §3.1. | **Confirmed defect**, not inference. |
| 4 | Multi-agent work | Template → Run → pool/orchestrator/collect → runs tab | **observed** `workflow-edit.png` and `runs.png`: the run reads `idle`; a pending approval appears in the rail, the dock badge and a card, and **not** on the diagram. §3.3. | **Confirmed defect.** |
| 5 | Debugging | Manually: terminal + file + browser + chat + review, each rooted by hand | **read** `useFileTree.ts` roots on the **selected** panel and pastes into the **focused** one; there is no "these five objects are one task" record anywhere in `LayoutSnapshot`. | Confirms D08's premise. |
| 6 | Review | Chat turn ends → `Open review` → diff cards → commit/discard, or Board `Open PR` | **observed** `runs.png`: the inspector shows `CHANGES · main · no upstream · 1 file changed` and, honestly, *"4 panels share this repository, so changes cannot be attributed"*. Turn completion and review readiness are separate facts with no object joining them. | Confirms D07's premise; the attribution refusal is a **strength** to preserve, not a defect. |
| 7 | Returning user | Relaunch → layout, camera, transcripts, dormant cards restore | **read** §3.4: a run whose panels were closed is gone from the file. **observed** `runs.png`: `HISTORY — no snapshots yet — one is kept a minute after each save`. | Confirms D11's premise: objects return, the account of the work does not. |
| 8 | Large workspace | Rail → attention → minimap → fit → groups → merged | **observed** `workflow-edit.png`: the rail's sections are object categories — `AGENTS · 10`, `FILES · 2`, `REVIEWS · 3`, `BOARDS · 3`, `INTEGRATIONS · 4` (browser, watcher, memory, toolbox), `WORKFLOWS · 1`. **observed** `starter.png`: at 55 % the starter captions are at the edge of legibility. **observed** both: a `no skills used` / `no skills` capsule sits beside unrelated work. | Confirms the audit's §6 items that M191 did not close. |

**Three things the walk found that are worth carrying into the phases that own them:**

- The launcher's five start-a-conversation-or-shell rows are five because each names a *real*
  distinction (folder vs no folder, chat vs terminal, engine). D09 must not delete distinctions to
  reduce the count; it must ask for the folder and the intention *first* so most of them stop
  being choices the user has to make at that moment.
- `no skills used` is on screen in a scene where the selected object is a workflow. The audit filed
  it under noise; it is more precisely a **rest-layer violation** of the 4.1 rest rule — a
  zero-value statement painted at rest. D10 owns it.
- The rail's `INTEGRATIONS` group holds a browser, a watcher, a memory node and a toolbox. That
  label describes where the code came from, not what the object does for the task. D10 owns it.

### 5. The phase → milestone map (the roadmap amendment)

In [the ledger](m193-m224-ledger.md), because it is the run's state rather than this milestone's
finding: D02–D20 are assigned M194–M224, with the split point named for every phase that has
one, and with one ordering amendment recorded — D13's reader-failure fix (§3.5) depends on nothing
in D11 or D12 and is landable at any point after M193, which is permission granted rather than
work reordered. The guide's own order table now carries the assigned numbers; `README.md` points
at the ledger rather than holding planned rows, because that table is a record and the guide is
the plan.

### 6. The verification baseline

**run** — `npm run verify` at `d785b7b`, before any file in this milestone was written, so that a
failure found later can be attributed. **Exit code 0. 38 suites, 2056 checks, none failing.**

| Suite | Tally | Suite | Tally | Suite | Tally |
|---|---|---|---|---|---|
| `verify:onboarding` | 14/14 | `verify:meta` | 39/39 | `verify:styles` | 56/56 |
| `verify:viewport` | 141/141 | `verify:groups` | 6/6 | `verify:merged` | 12/12 |
| `verify:registry` | 38/38 | `verify:layout` | 252/252 | `verify:credentials` | 18/18 |
| `verify:jira` | 15/15 | `verify:github` | 7/7 | `verify:palette` | 143/143 |
| `verify:rail` | 194/194 | `verify:review` | 98/98 | `verify:subagent` | 27/27 |
| `verify:file` | 91/91 | `verify:toolbox` | 103/103 | `verify:usage` | 26/26 |
| `verify:machine-cost` | 7/7 | `verify:tmux` | 35/35 | `verify:agent-state` | 27/27 |
| `verify:agent-session` | 141/141 | `verify:verbs` | 23/23 | `verify:teammates` | 25/25 |
| `verify:electron` | 4/4 | `verify:control` | 26/26 | `verify:package` | 13/13 |
| `verify:pty` | 10/10 | `verify:pty-manager` | 63/63 | `verify:window` | 4/4 |
| `verify:ipc` | 1/1 | `verify:canvas` | 6/6 | `verify:xterm` | 11/11 |
| `verify:panels:core` | 78/78 | `verify:panels:shell` | 96/96 | `verify:panels:kinds` | 49/49 |
| `verify:panels:agents` | 80/80 | `verify:panels:product` | 77/77 | | |

The `verify:panels` parts ran at 49.0 s, 72.7 s, 46.9 s, 87.4 s and 108.1 s wall against watchdogs
of 63 s, 96 s, 60 s, 113 s and 140 s — every part comfortably inside its own 1.25× measured
budget, so no watchdog is currently near the edge.

**There are no pre-existing failures to carry.** Any red a later milestone in this run sees is that
milestone's, which is the whole reason this was run before the first documentation edit rather
than after.

**One check went red during this milestone and was fixed here, not deferred.** Adding the M193 row
to the README failed `verify:meta milestones.1` (`missingLogs: [193]`): the check excludes
`*-ledger.md` from the log set **by name**, because the v8 run's Act 0 critic found that counting a
ledger's range would let seventeen rows be invented ahead of the work. That is the check doing
exactly its job — it caught a row whose only evidence was a ledger that spans M193–M224. The fix
is the one the check is asking for: this file. `verify:meta` re-run: **39/39, exit 0.**

**Not run, and not implied by the above:** `npm run verify:visual` and `npm run verify:packaged`
are act-close commands and outside the chain by design; D01 is not an act close. The standing
manual-only gaps are unchanged and inherited, not re-verified — they are at the end of
`docs/load-bearing.md` and, for the v9 run, at `m180-m200-ledger.md`'s "what a person still owes".

### 7. The product contract: entities, density, and the note/sticky/text/frame naming

Adopted as the contract for every phase of this run. Recorded here and summarised in `CLAUDE.md`
so it is resident in a session that has not read this file.

**7.1 The entities, and the three that must not merge.** The audit's map is adopted as written
(`docs/product-audit-2026-09-08.md` §5): workspace, canvas, project, panel, session, teammate,
work item, workflow/template, run, memory, vault, artifact. Two rulings carry into every
milestone:

- **Project, workspace and task stay distinct.** A workspace is a named persisted canvas; it may
  hold several tasks and several repositories. There is no first-class project record in
  `LayoutSnapshot` and this run does not add one until a specific workflow requires it (D04 first
  establishes a *resolution policy*; a durable record is a later decision with its own evidence).
- **An agent identity is a teammate; its conversation is a chat; its execution is a session.**
  These three are already correct in the code and insufficiently legible in the UI. D06 and D10
  make the distinction visible; neither is allowed to collapse it for tidiness.

**7.2 The four density layers**, adopted from the audit's §6 table, as the rule that decides *where*
a fact goes — not merely how it is styled:

| Layer | Content | Existing rule it extends |
|---|---|---|
| Rest | name, kind, one meaningful state | the 4.1 rest rule (`rest.1`) — and a zero-value statement at rest (`no skills used`) violates it |
| Contextual (hover/focus/selection) | next action, related work, current blocker | the reveal rule (`reveal.1`), opacity 0 → 1, never `display` |
| Inspector | configuration, provenance, detailed outcomes | the metrics rule (`metrics.1`) already puts CPU/RAM/tokens/dollars here |
| Deep detail | logs, diagnostics, metrics, historical execution | unchanged |

**7.3 The note / sticky / text / frame naming, resolved.**

The problem is real in the code, not only in the copy: §3.6 shows two different storage models
wearing one word in one type. The resolution is chosen to be honest about storage and cheap in
churn, and it does not rename a single record key or DOM alias.

- **A `note` is a Markdown file.** On disk, at a path, editable, indexed by the vault, reachable by
  `[[links]]`, backlinks and `#tags`, searchable, and survivable independently of any canvas. This
  is M27's prose file panel, and the word is anchored by the vault's whole vocabulary, which users
  already know from elsewhere. **The word `note` is reserved for it in all product language.**
- **A `sticky`, a `text` and a `frame` are canvas objects.** They are M187's sixteenth kind's three
  forms. They live in the workspace record, have no path, are not indexed, and do not survive
  outside the canvas that holds them. **Each is called by its own form name in product language;
  none of them is ever called a note.** Where a collective is genuinely needed, they are *canvas
  objects*, never *canvas notes*.
- **`annotations` keeps its existing meaning** — M93's world- or panel-anchored labels and M155's
  ink, on the annotation layer. It is not a synonym for the above, and the two must not be merged
  in copy.
- **Nothing is renamed in code.** The `note` panel kind, `shared/notes.ts`, `isNotePanel`, the
  `.note-node__*` DOM aliases and the `note` record key are unchanged — CLAUDE.md's rule is that
  aliases are restyled and reworded, never renamed, and roughly two hundred checks select on them.
- **What must change, and where.** Owned by **D10** (the language pass), with two carve-outs owned
  earlier where the phase touches the surface anyway:
  1. Every palette row, launcher line, empty state and inspector heading for the M187 kind stops
     using the word *note*: `Add a sticky note` → the sticky's own word; `Tint this note…` and its
     refusal `select a sticky note first` likewise (`renderer/palette/commands.ts:2290,2294`).
  2. M27's `New note…` keeps its word and gains what distinguishes it — that it is saved as a
     Markdown file, in a named folder (`commands.ts:1303`). Its existing disabled reason already
     says "a note is saved in its directory", which is the right idea in the wrong place: it is
     only visible when the row cannot run.
  3. `RailTailKind` and `StateKind` stop carrying two meanings in one literal, and their two stale
     doc comments ("a note … has no `kind` of its own and never should") are corrected — M187 gave
     it one. The rail's `Files` group stops filing a path-less sticky under Files (`rail-rows.ts:
     155, 202, 317`; `panel-state.ts:24-25`). This is the one item with a **check** attached: a
     scoped id asserting a prose file panel and an M187 note panel do not produce the same display
     kind.

### 8. What D01 did not do, and what a person still owes

Stated so that no line above is mistaken for something it is not.

1. **No journey was driven by hand.** Every journey in §4 is traced from source and observed in
   committed goldens. A person still owes: journey 1 on a **fresh profile** (no `layout.json`, no
   credentials) and journey 2 against a **real** GitHub or Jira tenant. Neither is reachable by any
   suite in this repository, by design.
2. **No claim about confusion is made.** The audit's usability judgements remain hypotheses, and
   this milestone did not upgrade any of them to findings.
3. **`verify:visual` and `verify:packaged` were not run.** They are act-close commands and D01 is
   not an act close. §6 covers `npm run verify` only.
4. **The five reproductions are code and golden evidence, not runtime observation.** Each is exact
   enough to write a red-first check against, which is what D02, D03, D06, D11 and D13 will do.
5. **The v9 hand checks are inherited, not re-verified** (`m180-m200-ledger.md:1597`), including
   `palette-dark`'s light chrome, which M191 declined by name and owed with a hand check.
