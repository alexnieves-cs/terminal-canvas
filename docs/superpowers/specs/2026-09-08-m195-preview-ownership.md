# M195 — D03: bind previews to the work they preview

The guide's [D03](../../product-development-guide-2026-09-08.md#d03--bind-previews-to-the-work-they-preview),
mapped to **M195** in [the v10 ledger](../../build-log/m193-m224-ledger.md). The finding it closes
is D01's §3.2, which is narrower and more precise than the audit's description of it.

## 1. The problem, as read at HEAD

- **read** `src/renderer/browser/BrowserNode.tsx:169-183` — the reload effect is
  `window.canvas.file.onChanged(() => { … })`. **The callback takes no parameter**: the event is
  never read. The only filter is the GUEST's own hostname (`127.0.0.1`, `localhost`, `[::1]`,
  `::1` — M186's finding 7), then a 300 ms coalesced `reload()`.
- **read** `src/shared/ipc-contract.ts:1016-1019` — `FileChangedEvent = { panelId, result }`.
- **read** `src/shared/file-panel.ts:53-72` — `FileResult` carries no path.
- **read** `src/main/ipc.ts:834-843` — `FILE_CHANGED` is sent from exactly one place: the watch
  `FILE_READ` registers per open FILE PANEL, for that panel's one path.

So the failure is precisely: **any open file panel's change reloads every loopback browser pane on
the canvas.** Two local projects reload one another's previews; an unrelated Markdown note open in
a file panel reloads both. A person mid-form, scrolled deep, or looking at a page they navigated to
by hand loses it for a change with no relationship to what they are looking at.

**What is NOT wrong, and must survive.** The loopback gate is correct and stays: a pane showing a
remote page is not a preview of this machine's work, and reloading it on a local edit is the
failure M186 already fixed. This milestone ADDS a condition; it removes none.

## 2. Two corrections to the audit that shape the design

1. The trigger is narrower than "any watched file change" — a repository an agent edits with no
   file panel open on the edited file reloads nothing. **This milestone does not widen it.**
   Widening the signal (a recursive watch over a bound root) is a different, larger feature with
   its own cost, and D03's acceptance is about the FILTER, not the reach. The narrowness is
   recorded in the ledger as a standing bound, not fixed here.
2. The event carries no path but **needs no IPC change**: it carries `panelId`, and the renderer
   holds that file panel's `source.path`. The association is resolved from facts that already
   exist. The shared contract is untouched; both IPC diagrams stay as they are.

## 3. What a preview's source IS

An **association**, and provenance only:

```ts
interface PreviewBinding {
  root: string              // absolute, normalised; the directory whose changes reload this pane
  sourcePanelId?: string    // the panel it was taken from, when there was one
}
```

**It grants nothing.** It is consulted by exactly one decision — "does this file-change event
belong to this pane" — and by the sentences that explain that decision. It never reaches a Places
gate, a teammate's brief, a spawn, a credential or a read. `root` is a filter, not a permission,
and this spec's own acceptance forbids any other reader.

**`root` is persisted because it cannot be reconstructed.** A pane's url is
`http://127.0.0.1:5173/`; nothing on disk relates that to a project. `sourcePanelId` is persisted
too — a panel id survives a relaunch in `layout.json` — but it is the half that may DANGLE, and
that is rendered rather than repaired: a closed source panel keeps its still-valid root (the
guide's own rule) and the inspector says the panel is closed.

**Absent is unbound, and unbound is every pre-M195 record.** It warns nothing and is a real state
with its own sentence, never an error.

## 4. The reload rule

One pure function every door asks (`shared/preview.ts`, and it is the ONLY place the rule lives):

```
previewReloadDecision({ binding, changedPath, liveUrl })
  → { kind: 'reload' }
  | { kind: 'skip'; why: 'unbound' | 'outside' | 'not-local' | 'no-path' }
```

- `unbound` — the pane has no binding. **It does not reload.** This is the behaviour change, and
  it is deliberate: the old rule IS the defect, and a record with no binding cannot distinguish
  "follow project X" from "happens to be on localhost". The ordinary path never loses reload,
  because a pane opened through discovery is bound at open; a hand-typed address is unbound and
  says so, with the Bind control one click away.
- `not-local` — the guest's live url is not loopback (M186's rule, unchanged and now named).
- `no-path` — the changed panel could not be resolved to a path (it closed between the write and
  the event). Skipped, and distinguished from `outside` because they are different facts.
- `outside` — the changed path is not inside `root`.
- `reload` — inside, loopback, bound.

Containment is **segment-boundary** string arithmetic on normalised absolute paths: `/a/b` contains
`/a/b/c` and `/a/b` itself, and does NOT contain `/a/bc`. A relative path on either side is refused
(never resolved against a root nobody chose — `shared/places.ts`'s rule, reached from the display
side).

**The normaliser is hand-written and must stay that way.** `@shared/places.ts`'s `normalisePath`
imports `node:path`, which the renderer cannot bundle — `Canvas.tsx:5834` records that in the code
that learned it. `shared/display-path.ts` is the precedent: forward-slash arithmetic, no `path`
module. Reusing `insidePlace` would also require a `realpath` the renderer does not have and would
make a PERMISSION gate answer a display question.

## 5. Where the subscription lives

The subscription moves OUT of `BrowserNode.tsx` and into one hook, `renderer/browser/usePreviewReload.ts`,
called from `Canvas.tsx` beside the other preview verbs. Three reasons, in order of weight:

1. The filter needs the panel array to resolve `panelId → path` and to read each pane's binding.
   The node has neither.
2. ONE subscription for every pane rather than one per pane, reading refs inside the callback —
   the shape `useHandoff` and the test hooks already use.
3. The guest is reached through `browser-store.ts`'s `reloadBrowser(id)`, which is the door that
   already exists for exactly this (`useHandoff`'s `exit-ok` edge) and answers whether a live guest
   took it. The node keeps owning its guest; nothing about the guest's identity, history or
   `webContentsId` changes, which is what `browser:read` and `preview:capture` resolve against.

Coalescing stays at 300 ms and becomes PER PANE (a timer per pane id), because two projects can now
be reloading independently and one shared timer would drop one of them.

## 6. Where a binding is made

- **`openPreview(url?)`** (`Canvas.tsx`) binds the pane it opened or navigated, to
  `previewSubject()` — the SAME subject rule discovery itself uses, which is what makes the binding
  honest rather than a guess. The returned note names the folder, so the binding is never silent.
  No subject → the pane opens unbound and the note says so.
- **`preview-bind`**, a new verb: bind (or re-bind) the selected preview pane to the current
  subject. It takes NO argument — an arbitrary path from an agent would be a directory this app
  never resolved, and the subject rule is the one this feature is built on. Refusals by name: no
  preview pane selected; no subject (`REASON_NO_PREVIEW_SUBJECT`, reused); the subject has no
  directory.
- **There is no `preview-unbind`**, and the omission is recorded: an unbound pane reloads for
  nothing, which is the state a person leaves by binding, not one they need a verb to enter; the
  pane can be closed. If a later milestone finds the need, it is one arm on the same verb.

**Doors** (the four-door rule; `V9_DOORS` gains a row and `closure.v9.1` binds it):
canvas `Bind source` / `Change source` on the pane · palette `preview.bind` ·
agent `tc plan preview-bind` · workflow an `action` node whose line is `preview-bind`.

## 7. What the user sees, by density layer

- **Rest** — unchanged. The frame's chrome keeps the real address and nothing else; no source, no
  path, no metric moves into the header.
- **Contextual** (the pane's own preview controls, beside the width chips and Capture):
  `source · <folder>` when bound, `not bound` when not, each with the full provenance on `title`;
  and one control, `Bind source` when unbound and `Change source` when bound, present-and-disabled
  with its reason when there is no subject.
- **Inspector** (full provenance): `preview source` — the full root, or the sentence that says the
  pane is not bound and what that means; `source panel` — the panel's own label, or that it is
  closed and the folder is still bound.
- **Deep detail** — nothing new. This milestone adds no log, metric or history.

Words are the pane's existing register: lowercase, no full stops, a control named by what it does.

## 8. State ownership and IPC

- The binding is **layout** on the browser panel record, so it undoes, exports, snapshots and
  persists like `device` does. It is not history-exempt: binding is a deliberate act and one
  history entry is right.
- **No IPC channel is added, widened or removed.** `preview:discover` and `preview:capture` are
  untouched; `file:changed` is untouched.
- Main gains nothing. No new filesystem read, no stat, no watcher.
- `carryMarks`-style by-name copies: `layout-adapt.ts`/`panels.ts` rebuild browser panels field by
  field, so the field must be carried at every one of those sites or it silently disappears on a
  workspace move (the absent-stays-absent rule cuts both ways).

## 9. Parsing (`layout-schema.ts`)

| Input | Answer |
|---|---|
| absent | unbound; **no warning** — every pre-M195 record |
| `{ root: '/abs/path' }` | kept, normalised |
| `{ root: '/abs/path', sourcePanelId: 'p1' }` | kept |
| not an object, or `root` absent/not a string/not absolute | the FIELD is dropped with a warning naming the panel; **the panel is kept** (the `device` precedent — a preview that vanished because its binding was misspelled is a worse answer than one that reloads for nothing (and, after the critic, one that reloads for nothing at all)) |
| `sourcePanelId` present but not a string | that KEY is dropped with a warning; the root is kept |

## 10. Risks

1. **A silent behaviour removal.** An existing loopback pane stops auto-reloading until it is
   bound. Mitigated by making the state visible in the pane (`not bound`) and the fix one control
   away — never a pane that quietly stopped working. Recorded in the ledger as the one intended
   regression.
2. **Binding to the wrong subject.** `openPreview` binds to whatever the subject rule answers. The
   note names the folder, and `Change source` is the repair. Never silent.
3. **A dangling `sourcePanelId`.** Rendered, never repaired; the root outlives it.
4. **The narrow trigger.** A bound preview still only reloads when a FILE PANEL's own file changes.
   Unchanged by this milestone, stated in the ledger so a later one does not read D03 as having
   given previews a repository watch.

## 11. Acceptance

1. Two projects on loopback, each with its own preview pane bound to its own root: a change under
   root A reloads pane A and **not** pane B — proven by counting requests at two real servers.
2. An unbound pane reloads for neither, and says `not bound`.
3. A change to a Markdown file outside both roots reloads neither.
4. A pane bound to a root but showing a REMOTE page does not reload.
5. A burst of changes is one reload per pane.
6. The binding survives a relaunch; an absent one warns nothing; a malformed one costs the field
   and keeps the panel.
7. Closing the source panel keeps the binding working and the inspector says the panel is closed.
8. Discovery still starts nothing and mints no panel; capture, navigation, device widths and the
   failure/retry path are unchanged.
9. `preview-bind` binds through all four doors, and `closure.v9.1` says so.
10. Nothing else reads `PreviewBinding.root` — no gate, no spawn, no read.

## 12. Checks (scoped ids, red-first)

| Suite | Id | Claim |
|---|---|---|
| `verify:file` | `preview.bind.1` | the pure rule: normalisation and segment-boundary containment (`/a/b` ∌ `/a/bc`), a relative path refused on either side, and `previewReloadDecision`'s five arms each with its own `why` |
| `verify:file` | `preview.bind.2` | the sentences: bound, unbound and closed-source read differently, and the unbound one says what it means rather than a bare zero |
| `verify:layout` | `browser.preview.1` | absent stays absent through a round trip; a valid binding round-trips; a malformed binding drops the FIELD with a warning and keeps the panel; a malformed `sourcePanelId` costs that key alone |
| `verify:rail` | `preview.source.1` | the inspector's browser fields carry the url AND the source in its three states |
| `verify:verbs` | (existing `closure.v9.1`, `closure.1`) | the new verb's four doors and its action-member listing |
| `verify:panels:product` | `preview.bind.1` | the real renderer, two real servers, two bound panes and one unbound: a write under root A reloads only pane A; a write outside reloads none; the record persists; a burst is one reload |

Every one of them is watched failing first, against an implementation that does not exist or with
the exact regression it claims to catch put back — one at a time, with the suite completing
(`docs/verify-suites.md`'s first rule).
