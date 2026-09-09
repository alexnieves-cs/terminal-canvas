# M195 — D03, binding previews to the work they preview

The guide's [D03](../product-development-guide-2026-09-08.md#d03--bind-previews-to-the-work-they-preview).
The spec is [2026-09-08-m195-preview-ownership.md](../superpowers/specs/2026-09-08-m195-preview-ownership.md)
and the plan is [its plan](../superpowers/plans/2026-09-08-m195-preview-ownership.md). The finding
it closes is D01's
[§3.2](m193-d01-reconcile.md#32-the-preview-reloads-on-locality-not-ownership--confirmed-and-narrower-than-described).

Written under the ledger's evidence rule: every line is **read** (source at a line), **observed**
(a golden looked at), **run** (a command with its exit code and tally) or **inferred** (a
judgement, which is not evidence).

---

## 1. The defect, measured rather than described

**read** `src/renderer/browser/BrowserNode.tsx:169-183` at the parent commit — the reload effect
was `window.canvas.file.onChanged(() => { … })`. **The callback took no parameter.** The event was
never read; the only filter was the guest's own hostname.

The first run of the new product check is the measurement, and it is the whole problem statement in
one line — three loopback panes, a change under the FIRST one's project:

> **run** `npm run verify:panels:product` — `preview.bind.1` **FAIL**, 86/87:
> `{"beforeA":{"A":1,"B":1,"U":1},"afterA":{"A":2,"B":2,"U":2},
> "beforeOut":{"A":2,"B":2,"U":2},"afterOut":{"A":3,"B":3,"U":3}}`

`afterA` is the audit's sentence as a number: a change under project A's root reloaded **all
three** panes. `afterOut` is worse and was not in the audit — editing an ordinary Markdown note
that belongs to no project reloaded all three again.

## 2. What shipped

**The rule is pure and has five arms.** `src/shared/preview.ts` gains `PreviewBinding`,
`normalisePreviewPath`, `pathInsidePreview`, `previewReloadDecision` and `previewSourceLine`.
`previewReloadDecision` answers `reload`, or `skip` with a `why` — `unbound`, `not-local`,
`no-path`, `outside` — because a preview that stopped reloading for a reason nobody can name is
the same defect one level up. `not-local` is M186's finding 7 (only a loopback page is a preview of
this machine's work), unchanged and now named; it covers a remote page and a pane with no page yet,
which are one fact for this decision.

**The normaliser is hand-written, and that is load-bearing.** `@shared/places.ts` already exports
`normalisePath` — and imports `node:path` to get it, which the renderer cannot bundle
(`Canvas.tsx`'s own comment beside `roughlyInside` records that the hard way). `display-path.ts` is
the precedent: forward-slash arithmetic, no `path` module. Reusing `insidePlace` would also need a
`realpath` the renderer does not have and would put a PERMISSION gate in the way of a display
question. Containment is on **segment boundaries**: `/a/b` holds `/a/b` and `/a/b/c` and does not
hold `/a/bc` — a bare `startsWith` would bind a preview to the neighbouring project on disk, a
wrong reload that looks exactly like a right one.

**No IPC change, and the reason is worth keeping.** `FileChangedEvent` carries
`{ panelId, result }` and `FileResult` carries no path — but the renderer already holds that file
panel's `source.path`. D03's step-4 question ("does the existing event carry enough identity?")
answers *not by itself, and it does not need to*. The channel list, both IPC diagrams and main are
untouched; main gained no read, no stat and no watcher.

**One subscription, in a hook, reading what is ON SCREEN.**
`src/renderer/browser/usePreviewReload.ts` replaces the per-node effect. It reads
`displayPanelsRef` rather than `panelsRef` — that ref's own documented rule, *"what anything acting
on WHAT IS ON SCREEN reads"* — because while the merged view is open the previews on screen belong
to other workspaces, and reading the saved array would have quietly stopped every merged-view
preview from reloading, which the per-node subscription did do. The guest is reached through
`browser-store.ts`'s `reloadBrowser`, the door an `exit-ok` edge already takes, so the guest's
identity, history and `webContentsId` — what `browser:read` and `preview:capture` resolve against —
are untouched. The store gained `liveUrl()`: the decision asks the GUEST for its address and never
the record, because the record is written from `did-navigate` one render later and a pane just
navigated to a remote page would still read as loopback.

**The coalesce is now PER PANE.** 300 ms as before, but keyed by pane id. One shared timer would be
worse than no coalescing at all here: two projects reloading at once would cancel each other and
one of them would never reload.

**The binding is layout on the record.** `preview?: { root, sourcePanelId? }` on `BrowserPanel` and
`PersistedBrowserPanel`, carried at both by-name copy sites in `layout-adapt.ts`. It undoes,
persists and moves with the panel like `device` does. `root` is persisted because it cannot be
reconstructed — the url is a port on this machine and nothing on disk relates it to a project.
`sourcePanelId` is provenance that may dangle, and dangling is RENDERED rather than repaired: a
closed source panel keeps its still-valid folder, which is D03's own rule.

**Five parse arms** (`browser.preview.1`): absent is unbound and warns nothing (every pre-M195
record); a usable binding is kept with its root normalised, so the on-disk form and the form the
rule compares are one string; a non-object, a non-string root and a relative root each cost the
FIELD with a warning naming the panel and keep the panel (the `device` precedent — a preview that
vanished because its source was misspelled reads as one the app deleted); a malformed
`sourcePanelId` costs that KEY alone.

**Where a binding is made.** `openPreview` binds the pane it opens or navigates to the SAME subject
rule discovery reads — the folder a preview reloads for is the folder its candidate list was
answered from — and its note names the folder, so a binding is never silent. A lineup's `preview`
seat is born bound to the lineup's own folder, the one place the app mints a pane already knowing
the project. `preview-bind` is the fifth preview verb and the explicit door.

**`preview-bind` takes no argument, deliberately.** A path from an agent would be a folder this app
never resolved and never showed anybody. Its four doors are `Bind source` / `Change source` on the
pane, `preview.bind` in the palette, `tc plan preview-bind`, and an `action` node holding that
line; `closure.v9.1` bound all four with **no edit to the check**, which is the door check doing
its job. There is no `preview-unbind`: an unbound pane reloads for nothing, which is the state a
person leaves by binding rather than one they need a verb to enter. Recorded as a deliberate
omission; if it is ever wanted it is one arm on the same verb.

**Density.** Rest is untouched — the frame's chrome still carries the real address and nothing else.
Contextual: `source · <folder>` or `not bound`, beside a control named for what it does, with the
full path on `title` (the path rule). Inspector: `preview source`, in three sentences.

## 3. The one intended regression, stated plainly

**An unbound pane no longer auto-reloads.** That is the behaviour change, and it is the point: the
old rule IS the defect, and a record with no binding cannot tell "follow project X" from "happens
to be on localhost". The ordinary path never loses reload (a pane opened through discovery is bound
at open), a hand-typed address is unbound and **says so** in the pane, and the fix is one control
away. A pane that quietly stopped working would have been the wrong trade; a pane that says `not
bound` next to `Bind source` is not quiet.

## 4. The checks, and the red each was watched at

Seven checks, all scoped ids. `verify:file` 91 → 93, `verify:layout` 252 → 253, `verify:rail`
201 → 202, `verify:meta` 39 → 40, `verify:panels:product` 86 → 88.

| Suite | Red | Green |
|---|---|---|
| `npm run verify:file` | **91/93** — `preview.bind.1`, `.2` missing their exports | 93/93 |
| `npm run verify:layout` | **252/253** — `browser.preview.1`, the parser ignoring the field | 253/253 |
| `npm run verify:rail` | **201/202** — `preview.source.1`, no `preview-source` field | 202/202 |
| `npm run verify:panels:product` | **86/87** — `preview.bind.1` (§1's measurement) | 88/88 |

`verify:meta preview-readers.1` passed the moment it was written, which is not evidence, so it was
driven red three times — one arm at a time, each with the suite completing at 39/40 and green again
after the revert: a `PreviewBinding` reference planted in `src/main/preview-discover.ts`
(`inMain: ["preview-discover.ts"]`), one in `src/renderer/shell/rail-rows.ts`, and one in
`src/shared/redact.ts`.

Both pure entries were written to MISS AN EXPORT (`if (!has) ok(NAME, false, …)`) rather than call
an undefined function: a `TypeError` would have aborted the run and every check below it would
never have executed, which is `docs/verify-suites.md`'s first rule and the trap M194's log records
paying for.

## 5. Doors

`V9_DOORS` gains one row; `verify:verbs` stayed **23/23** with no edit to `closure.v9.1` or
`closure.1` — the palette id resolves to a real row in `commands.ts`, the agent line binds through
`buildPlan` to the same verb, and the action node's line binds too. `bindPreview` is a listed
`PaletteActions` member, so `closure.1`'s "every member is chosen or excluded by name" still holds.

## 6. Commands

| Command | Exit | Tally | Note |
|---|---|---|---|
| `npm run typecheck` | 0 | both projects | — |
| `npm run verify:file` | 0 | 93/93 | 91 before |
| `npm run verify:layout` | 0 | 253/253 | 252 before |
| `npm run verify:rail` | 0 | 202/202 | 201 before |
| `npm run verify:meta` | 0 | 40/40 | 39 before |
| `npm run verify:verbs` | 0 | 23/23 | unchanged, and that is the door check working |
| `npm run verify:panels:product` | 0 | 88/88 | 86 before; 121.7 s and 121.1 s wall over two runs |
| `npm run verify` | **0** | 38 suite tallies, no FAIL line | — |
| `npm run verify:visual` | **0** | 59/59, `browser` alone rewritten | 174.1 s wall |
| `npm run verify:packaged` | **0** | 12/12 | — |

**The product part's watchdog was re-measured**, as its own comment requires: 140 000 ms → 155 000
ms (two green runs at 121.7 s and 121.1 s, ×1.25 rounded up; it was 104.8 s/106.8 s after
M188–M189). A watchdog kill reads as a HANG and not as a red check, which is M135's whole point.
The first attempt wrote `// re-measured` and `verify:meta panels-split.1` failed it: the check
requires the literal `// measured`.

## 7. The one golden that changed, and the critic's sentence

**`browser`** — and it changed on purpose rather than because a budget forced it. The diff is
**0.139 % of pixels against a 0.5 % budget**, so the suite PASSED it; CLAUDE.md's golden rule is
that a change under the budgets that MATTERS is forced by deleting the golden with its sentence,
and this is the milestone's only visible surface. Deleted and rewritten.

> The preview pane now says what work it is a preview OF. At the right end of its control row —
> pushed there, apart from the controls that act on the page — `source · repo` names the folder
> whose changes reload this pane, with `Change source` beside it. The width chips, `Capture` and
> `Find the project` keep their places and their words, and the first cut of this row (which sat
> the readout between `Capture` and a button, where a plain readout reads as a third chip) is what
> the separation replaced. Nothing else in the frame moved: the header's real address, the ruled
> `on exit 0` edge from the dev server, the rail's `browser · 127.0.0.1:…` row and the page itself
> are pixel-identical. A pane bound to NOTHING shows no readout at all and its control reads `Bind
> source` — the state carried by the control rather than by a `not bound` label, which would be a
> zero-value statement in a row that is always visible.

The fixture itself changed with it (`scripts/shot.cjs`): the pane is now bound to the repository
the dev server beside it runs in, which is what a preview opened through discovery IS. The scene's
intent sentence in the manifest says so.

**The other 58 scenes were NOT re-baselined** and did not change: `verify:visual` is 59/59 with
`browser` alone rewritten, and `UPDATE_GOLDENS=1` keeps a passing golden byte for byte, so the
commit holds one PNG.

## 8. The fresh-context critic and verifier

Two fresh-context agents were run against the working tree, one on the implementation and one on
the CHECKS. Both were asked for findings, not approval; every finding was re-verified against
source before it was accepted or declined.

### The most serious finding, and it PREDATES this milestone

**The pane's canvas-door controls were dead for a real user, and had been since M185.**
`shellControl` deliberately does not `stopPropagation` on mousedown (`shell-control.ts`'s own
comment: the palette's outside-click dismissal is a capture listener, and a shell click should
dismiss an open palette). The controls sit inside `.pf__body`, whose `onMouseDown` focuses the
PANE. So a press focused the browser pane, and one flush later the verb asked
`previewSubject()` which panel the project runs in — and was answered *this browser pane*, which is
neither a terminal nor a chat, so the subject rule skipped it and the verb refused with
`select the terminal your project runs in`. That is `Find the project`, `Start dev`, a candidate in
the discovery list, and M195's own `Bind source`: four controls, present and enabled, doing
nothing.

Nothing caught it because **M185's own product check drives `window.canvas.preview.discover(...)`
over the bridge and never presses the button**, and because a check that dispatches `mousedown` and
`click` from ONE `executeJavaScript` cannot see it: both handlers run in a single task, before
React flushes, so `focusedIdRef` (assigned during RENDER) still holds the subject while
`selectedIdsRef` (assigned EAGERLY) already holds the pane — both refs read correctly and the check
passes.

**The fix is one line**, and it uses the mechanism `shellControl` already has:
`if (e.defaultPrevented) return` in the body's focus handler. `shellControl`'s mousedown calls
`preventDefault()` — its whole purpose, and its comment says *"This also protects `focusedId`"* —
and React hands the same synthetic event up, so a press from any shell control is exactly the set
of events the body must not focus on.

**Watched red, both ways.** With the line removed, `preview.bind.2` reports
`focusAfterDown: "pvC"`, `disabled: true` and `pressed: false` — the control **disables itself
mid-press**, because the subject it needs disappeared when it took focus. With the line in:
`focusAfterDown: "ch1"`, the record gains its binding, and the pane reloads.

### Accepted and fixed

| # | Finding | What it was |
|---|---|---|
| C1 | The dead controls, above | Four canvas doors, one line, M185 to M195 |
| C2 | A pane opened from its own discovery list was never bound | Same cause: `onOpenPreview` reads the subject after the press focused the pane. Fixed by C1's line, which is why that line is load-bearing for the feature's own headline path |
| C3 | **The unbound sentence said the opposite of the truth** | `not bound — a file change reloads this pane for nothing` describes the behaviour this milestone REMOVED. Under M195 an unbound pane does not reload at all, so binding turns reloading ON — told the opposite, a person reads the control as noise reduction. Rewritten, and the two checks that had pinned the wrong claim now require the sentence to say nothing reloads it |
| C4 | `Bind source` was never disabled with its reason | The spec's own §7 promised present-and-disabled. The subject rule is the canvas's to answer, so the reason arrives as a prop computed at render |
| C5 | The control did not name its own pane | `setPreviewWidth`'s recorded rule: with two panes selected it bound the OTHER one and rendered the success note on the pane that had not changed. `onBindSource(paneId)` |
| C9 | `no-path` swallowed a live panel | A SKILL panel registers the same `file:read` watch and carries `{scope, name}` and no path by design (M128), so a `SKILL.md` under a bound root landed in the arm whose documented meaning is "the panel closed". It has its own arm now, `unknown-source`, and the fact is recorded: a skill file under a bound root does not reload the preview |
| C10 | The snapshot restore did not re-mint `preview.sourcePanelId` | It re-mints every panel id and rewrites links, groups, runs, annotations, selection and focus; this was the fifth reference and the only one left behind, so a restored preview called its own source panel closed — or, in the merged view, named another workspace's panel. `verify:meta preview-readers.1` now allows `layout-snapshots.ts` by name, with the reason (it reads the field to REWRITE it) |
| C11 | A rebind through `openPreview` took no history entry | The url write is deliberately history-free (M186); a BINDING is a deliberate change and the two doors would have disagreed about whether it can be undone |
| C13 | The root-only binding had no words | A lineup's preview seat is born with a folder and no source panel, and the field rendered a naked absolute path. Four sentences now, not three |
| — | A binding to `/` was accepted | It would reload for every change on the machine — this milestone's own defect by another road. Refused by name at the bind door |
| V1 | **The burst claim could not go red** | `main/file-watch.ts` is a RESETTING trailing debounce at 100 ms with a hash dedupe, so three writes 60 ms apart were ONE event before the renderer ever saw them: deleting the renderer's coalesce entirely kept the check green. The writes are spaced past 170 ms now |
| V2 | The negative phase had no positive control | `afterOut === beforeOut` is satisfied identically by a correct filter and by an event that never fired. There is a fourth pane now — a SENTINEL bound to its own root — and `fence()` writes to it and waits for IT to reload, which proves the pipeline drained past the writes under test. Both fixed sleeps are gone with it |
| V3 | `preview-readers.1`'s regex missed a field access | `(p as { preview?: { root: string } }).preview?.root` handed to a gate in main would have passed. The pattern includes `\.preview\b` now, which also widened the renderer list to every file that touches a binding |
| V4 | **The per-pane coalesce was asserted nowhere** | The milestone's own stated invariant: replacing the timer map with one timer passed everything. Two projects now change in ONE window and both must reload (`A+1, B+1`) |
| V6 | Two entries could ABORT rather than go red | `verify:layout`'s reparse and `verify:rail`'s three model calls were unguarded, and the rail's sit above the tally — a throw there prints no tally at all. Both wrapped |
| V8 | Precedence, a dead host member, an unfalsifiable register test | Every decision input tripped exactly one guard, so reordering the rule passed: two inputs trip three at once now. `'::1'` was a `LOOPBACK_HOSTS` member no input can produce (`URL.hostname` brackets it) — removed. `l === l.toLowerCase() \|\| !/^[A-Z]/` was true for any lowercase-initial string; the `||` is gone |
| V11 | The watchdog was not re-measured | Done, with both runs recorded |
| V10 | The checks left state installed | Four file-panel watches stayed armed in MAIN on temp directories, and the directories were never removed. Both checks now reset the layout FIRST (which closes each watch through the ordinary door), then drain, then close the servers, then `rmSync` |

### Declined, with the reason

- **The palette row discards its refusal** (`commands.ts`). True, and now wired to `actions.say`
  for this row — but the sibling preview rows still discard theirs. Widening that is a palette-wide
  change with its own checks and is not this milestone's.
- **`browser.preview.1`'s "serialises to no key" assertion is tautological** given that the parser
  never writes an `undefined`-valued key. Kept: it is byte-for-byte the shape
  `preview.device.1` already uses one milestone earlier, and defence in depth against a serialiser
  that starts adding keys is worth four characters. Recorded rather than dressed up.
- **`preview.bind.2` cannot discriminate focused-first from selected-first** in `previewSubject`'s
  candidate list. Correct, and it is not fixable through this door: the pane must be selected or
  focused and the subject must be the other, and a browser pane is skipped by the rule either way,
  so both orderings answer the same panel. The check's id was reworded to claim only what it
  proves.

## 9. Bounds this milestone does NOT close

1. **The trigger is still narrow, and D03 did not widen it.** A bound preview reloads only when an
   open FILE PANEL's own file changes — `FILE_CHANGED` is sent from exactly one place, the watch
   `FILE_READ` registers per panel (**read** `src/main/ipc.ts:834-843`). A repository an agent
   edits with no file panel open on the edited file reloads nothing, before this milestone and
   after it. Giving a preview a watch over its bound root is a different, larger feature; the
   binding this milestone adds is exactly what such a watch would need, and is the right place to
   start from.
2. **A missing bound folder is not DETECTED, only recoverable.** Nothing stats the root: the
   renderer would need a read per pane and the app has no watcher on a preview's root. The recovery
   is the same door as the repair — `Change source` — and the pane names the folder, so a person
   can see it is the wrong one. Recorded rather than fixed.
3. **A binding is not realpath-resolved.** Both sides are normalised absolute paths, but neither is
   symlink-resolved: a root bound from a live session's cwd (which the OS answers resolved) and a
   file panel's path (as it was opened) can disagree through a symlink — macOS's `/var` →
   `/private/var` is the everyday case. The renderer has no `realpath`, and resolving it in main
   would be the IPC change D03 says to make only if needed. The fixture in `preview.bind.2`
   `realpathSync`es its directory so the check measures the code and not the platform.
4. **The consumer list is pinned as text, not the absence of authority itself.**
   `verify:meta preview-readers.1` (added during this write-up, when the gap was noticed and was
   cheap to close rather than record) fails the build if a binding reaches `src/main` — where the
   Places gate, the spawn resolver and every filesystem read live — or if the shared and renderer
   consumers stop being the closed list. It does not and cannot prove that a listed consumer uses
   it honestly; it makes a NEW authority impossible to add quietly, which is the reachable half.
   `BrowserNode.tsx` and `inspector-fields.ts` render `panel.preview` through `previewSourceLine`
   and name neither the type nor the rule, so they are deliberately off the list — stated here so
   the list is not mistaken for "every file that touches a binding".
5. **Every hand check the v9 run left owed is still owed.** Nothing here closes one.
