# M17 — The editable file panel

**Backlog:** `docs/ideas-backlog.md` #14, tier 1 continued.
**Predecessor:** M16 shipped the read-only, live-watched local-file panel
(`main/file-read.ts`, `main/file-watch.ts`, `renderer/file/FileNode.tsx`).

## What this milestone is

#14's stated killer property is **liveness in both directions**: the agent
edits the file on disk and the panel reflects it within a second; the user
edits in the panel and the agent sees the new bytes on its next read. M16
built the first direction and deliberately built it READ-ONLY, specifically so
it would not have to answer the item's own open question — *when the agent and
the user edit the same file at the same moment, who wins?*

This milestone builds the second direction, which means answering that
question. The backlog says it "has to be chosen rather than defaulted into".
The answer chosen here is stated in one line, and the rest of this document is
what it costs:

> **A write that was based on a version of the file that is no longer on disk
> is REFUSED, with a sentence saying so. Nothing is ever overwritten silently,
> in either direction.**

## Non-goals

Stated so nobody reads their absence as an oversight.

- **Not tier 2** (`.xlsx`/CSV grids), **not tier 3** (a web panel in an
  iframe), **not tier 4** (a native app's window — which #14 rules out as a
  "no" item, not a "later" item).
- **No syntax highlighting, no markdown rendering, no code editor.** The
  editing surface is a `<textarea>`. A CodeMirror/Monaco embed is a second
  renderer-side dependency and its own milestone; `dependencies` is one entry
  today and this milestone does not add a second.
- **No "create a new file"** — a file panel is opened on a file that exists.
  Saving to a path that has vanished is a `stale` refusal, not a creation.
- **No undo integration.** `Cmd+Z` on the canvas is the panel-array history;
  the textarea's own native undo is what a draft gets, and the two must not be
  wired together — an undo stack that could remove the panel out from under an
  open draft is worse than no integration.

## 1. The write verb — `src/main/file-write.ts`

A new main module beside `file-read.ts`, in the same plain-node verify tier (it
imports `node:fs` and nothing from `electron` or `node-pty`).

```ts
export type FileWriteResult =
  | { kind: 'written'; mtimeMs: number; bytes: number }
  | { kind: 'stale'; detail: string }
  | { kind: 'failed'; detail: string }
```

`writeFile(path: string, content: string, baseMtimeMs: number | null): FileWriteResult`

**The three arms are a positional split, not a message-parsing one**, and they
are `review-commit.ts`'s `refused`/`failed` distinction applied to a second
verb. `stale` means *the disk moved underneath you* — the fix is to look at
what changed. `failed` means *this write did not run* — the fix is your
filesystem (EACCES, EROFS, a full disk). Collapsing them tells a user with a
read-only file to go and look at somebody else's changes.

`baseMtimeMs === null` means **overwrite regardless**, and it is reachable
only from an explicit control the user presses after seeing a `stale`. It is a
parameter rather than a second exported function so that there is exactly one
write path and the CAS cannot be bypassed by reaching for the other one.

### Mechanics, each with the failure it prevents

**Compare-and-swap on `mtimeMs`.** `statSync` first; if the file's current
`mtimeMs` differs from `baseMtimeMs`, return `stale` and **write nothing**.
`ENOENT` here is also `stale` (the file was deleted underneath the draft),
carrying its own detail. The no-write clause is the half that carries the
milestone — the same shape `verify:credentials` 6 pins for the credential
store's refusal, where asserting only the refusal passes against an
implementation that refused the caller and wrote anyway.

The token is `FileResult.mtimeMs`, which M16 already stamps **after** the read
completes precisely so it describes the content actually in hand rather than
whatever was on disk when the read started. Nothing new has to be invented and
nothing new has to be stored.

**Atomic temp-and-rename, never `writeFileSync` in place.** The whole premise
of this feature is that an agent is reading and writing this same file, so an
in-place write is observably torn: a reader that lands mid-write sees a
truncated file and acts on it. The temp file is written into the SAME
directory as the target (a rename across filesystems is not atomic and would
fall back to a copy) and named `.<base>.tc-<random>.tmp`. It is removed in a
`finally` on every path, including a failed rename — a leftover temp file in a
directory the user is working in is litter this app has no business leaving.

This also drives the exact code path `FileWatchers` was built to survive:
watching `dirname(path)` filtered to `basename(path)`, rather than the file
itself, is the thing M16's own notes call the single most important line in
that milestone, and our own writes now exercise it on every save.

**`realpathSync` before writing.** If the panel's path is a symlink, a
temp-and-rename would replace the LINK with a regular file — the user's
symlink silently gone, the real file untouched, and the agent still reading
the old target. Resolving first writes the target and leaves the link intact.
A path that cannot be resolved is `stale` (it no longer exists) rather than a
crash.

**Copy the original's mode onto the temp** before the rename. A fresh temp
file is created at the process umask (typically 0644), so without this every
save silently strips the executable bit off a script and resets any
deliberate permissions the user set. This is the kind of loss that is
discovered days later by something that failed to run.

**A `FILE_MAX_BYTES` guard on the way out**, returning `failed`. The read
refuses a file over the cap, so the write must too, or a panel could grow a
file past the limit it can then never display again.

**Never throws.** Every failure is an arm, the rule `readFile` already states
in its own header: a throw here crosses the IPC boundary as a rejected invoke
and lands in the component's `.catch` as a stringified `Error`, which is the
right arm reached by the wrong road and loses the errno on the way.

## 2. IPC — one new invoke

`file:write` joins `file:open` / `file:read` / `file:close`. **38 invoke
channels becomes 39**, which means three counts move together and all three
must move in the same commit or a suite goes red:

- `verify:ipc` (asserts every `Object.values(IPC)` channel has an
  `ipcMain.handle`),
- the README's IPC diagram (`verify:meta` 14 reads the diagram's own fenced
  block against the real contract),
- CLAUDE.md's channel-count prose.

`file:changed` remains the only push in this feature; nothing about writing
needs a second one, because our own write lands back through the watcher like
any other change.

## 3. The renderer — edit mode in `FileNode.tsx`

### The mode

The panel stays M16's live numbered read view by default. A **pencil control**
in the chrome enters edit mode, which swaps the numbered `<pre>` for a
`<textarea>` seeded from the current `result.content`, and captures that
result's `mtimeMs` as the draft's base token.

A mode rather than an always-live textarea, for three reasons that are each
independently sufficient: the numbered gutter M16 renders cannot exist inside
a textarea; a panel that is not editing needs no dirty-guard at all, so live
updating stays exactly as it is everywhere except the one panel being typed
in; and "am I editing this?" must never be ambiguous when something else is
writing the same file.

### The draft lives in the component, never in the store

`file-store.ts`'s own header says it is "a cache of main's answer, never a
second author of it". A draft is by definition not main's answer, so it is
component state. Watcher pushes continue to land in the store while a draft is
open — the store stays a faithful cache — and it is the COMPONENT that decides
not to reseed the textarea from them.

### The editability gate

Editing is offered only for `kind: 'text'` **with `truncatedLines === 0`**.

A truncated buffer saved back would delete every line past `FILE_MAX_LINES`.
That is the codebase's "half a file is a different file" rule
(`prompts.ts`, `file-read.ts`) in its most destructive available form: the
panel shows 10,000 lines of a 40,000-line file, the user fixes a typo on line
3, presses save, and 30,000 lines are gone with a successful-looking result.

The pencil is therefore **present and disabled with its reason on screen**
rather than absent, which is `verify:palette` 31's standing rule — a control
that disappears is indistinguishable from a feature that was never built, and
this is exactly the case where a user will go looking for it.

`buildFileNodeModel` gains an `editable: boolean` plus an optional
`editableNote: string` so the decision is made in the pure model (testable in
the plain-node tier) rather than as a condition inside JSX.

### The dirty guard, and the two banners

While a draft is open:

- **Not dirty:** an arriving change reseeds the textarea. There is nothing to
  lose, and a panel that went stale while merely open would be a worse version
  of the read view it just came from.
- **Dirty:** the draft is left alone and a banner appears — *"This file
  changed on disk."* — with a **Reload (discard mine)** control. The user is
  told at the moment it happens rather than at the moment they try to save.

A save whose CAS fails returns `stale`, and the banner grows an **Overwrite**
control, which re-invokes with `baseMtimeMs: null`. Both destructive controls
say what they destroy in their own label; neither is the default and neither
is reachable by pressing the save key twice.

### Keys

`Cmd+S` saves. `Escape` leaves edit mode, and when dirty it arms once rather
than discarding immediately — `TerminalPanel`'s close button's own pattern for
a gesture that loses something. `Cmd+S` is confirmed free: no menu accelerator
in `main/menu.ts` claims it, so it reaches the renderer at all. (A menu
accelerator would never have reached a renderer keydown, the trap
`verify:panels` 123 records for the `edit:*` events.)

The body already `stopPropagation`s every key, which stands `useViewport` and
`usePalette` down — both are bubble-phase on `window`. It does **not** stand
`useNavGrid` down, which is CAPTURE-phase on `window` and has already run: so
`.file-node__editor` joins `.review-node__commit-form` in that guard's target
test, or `Cmd+G` typed into a draft reveals the nav grid, the open branch's
`default:` arm swallows every further keystroke, and releasing `Cmd` switches
workspace and unmounts the panel with the draft unsaved. This is a known,
already-diagnosed failure being inherited by a second surface, not a new one.

Both exits restore focus to the captured panel id, `ReviewNode`'s `closeDraft`
rule. **No automated check can observe this** — DOM focus after an unmount is
a browser default action an untrusted event never performs — and it is
recorded here for the same reason it is recorded there.

## 4. Verification

### `verify:file` (plain node, spaced fixture directory)

The weight sits here, because this is where a wrong answer destroys data. Each
check names the failure it rejects:

1. **Happy path** — write, then read the bytes back off disk and compare.
   Asserts the returned `mtimeMs` matches a fresh `statSync`, since that value
   becomes the next save's token.
2. **CAS refusal writes NOTHING** — move the file's mtime, save with the old
   token, assert `kind === 'stale'` **and the bytes on disk are
   byte-identical**. The second clause is the check; asserting only the
   refusal passes against an implementation that refused and wrote anyway.
3. **Deleted underneath** — `stale`, with a detail, not a crash and not a
   silent re-creation.
4. **Over the byte cap** — `failed`, and the file on disk unchanged.
5. **No temp file left behind** — the fixture directory holds exactly the
   expected entries after a success AND after a refusal. A refusal is the path
   most likely to leak one, because it returns early.
6. **Mode preserved** — `chmod 0755`, save, assert the mode is still 0755.
7. **Symlink resolved** — a link pointing at a file in the fixture: save
   through the link, assert the TARGET's bytes changed and the link is still a
   symlink.
8. **Force overwrite** — `baseMtimeMs: null` writes even against a moved
   mtime. The over-correction guard for check 2: a CAS that refuses
   unconditionally satisfies 2 perfectly and makes the feature unusable.

### `verify:rail` (the pure model)

`buildFileNodeModel` gains checks that **truncated text is not editable and
untruncated text is** — both directions in one read, because an `editable`
that is always `false` satisfies the first half and deletes the milestone.

### `verify:panels` (real Electron, real renderer, spaced fixture)

Two end-to-end checks:

- **Type and save.** Open a file panel through the existing `__m13Open` hook,
  enter edit mode, set the textarea's value through the native setter plus an
  `input` event (assigning `.value` alone leaves React's state untouched — the
  trap `verify:panels` 113 already records), press `Cmd+S`, and read the bytes
  back **off disk**, not off the panel.
- **External write while dirty.** With a dirty draft, write the file from the
  harness, wait past `WATCH_DEBOUNCE_MS`, and assert the textarea still holds
  the user's text AND the banner is on screen. Both clauses: the draft
  surviving alone is satisfied by a panel that never received the push, and
  the banner alone is satisfied by a panel that clobbered the draft.

### Counts that move

`verify:ipc` 38 → 39, and the README diagram plus CLAUDE.md's prose in the
same commit.

## 5. Known limitations, stated rather than discovered

- **The CAS window is not zero.** `statSync` and the `rename` are two
  syscalls, so a write landing between them is not caught. Closing that needs
  file locking, which is not portable and not worth it here; the window is
  microseconds against a debounce of 100ms and a human typing.
- **A file that grows past `FILE_MAX_LINES` while a draft is open** becomes
  un-savable, and the panel says so rather than saving a truncated buffer.
  This is the gate working, but it is an abrupt experience and is worth
  knowing about.
- **Nothing merges.** The choice is reload-and-lose-mine or overwrite-theirs.
  A three-way merge needs a common ancestor this design does not keep.
- **Encoding is UTF-8, always.** M16's reader already assumes it; a file in
  another encoding round-trips through UTF-8 and is corrupted on save. It
  reads as mojibake in the panel first, so the user has a warning — but the
  save is the moment the corruption becomes permanent, and that is new.
