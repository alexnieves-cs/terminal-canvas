# M276 — Monaco in the file panel

Built 2026-09-15 on `main`. Round 2 of the editor work: the file panel's draft
surface stops being a plain `<textarea>` and becomes Monaco, with its worker
bundled locally. The brief's three success criteria were `file:read`/`file:write`
round-trip unchanged, the CSP header untouched, and `verify:file` still green —
all three hold, and the work that actually cost something is none of them.

## The three constraints that shaped it

**`verify:file` was never at risk, and saying so is the point.** It is a
plain-node suite over `file-read.ts` / `file-watch.ts` in MAIN. A renderer
editor swap cannot reach it. The criterion that mattered was the one it does
not cover: the five Electron checks that drive a real draft.

**The CSP names no `worker-src`,** so a worker falls back to `default-src
'self'`, and the packaged renderer loads from `file://`. That refuses a `blob:`
worker outright — which is what Vite's `?worker&inline` produces, silently. So
the worker is a real emitted asset (`?worker`), referenced as
`new URL("editor.worker-*.js", import.meta.url)`, resolved beside the app's own
chunks. Verified in the build output, not reasoned about. Monaco's codicon font
lands the same way, as `url(./codicon-*.ttf)` — no `data:` URI, which `img-src
'self' data:` would not have covered for a font anyway.

**`index.html` is untouched.** The CSP header is byte-identical.

## What is imported, and what is not

`editor/edcore.main` (the API plus `editor.all`'s contributions) and
`basic-languages/monaco.contribution` (Monarch highlighting, main-thread).
NOT `language/{typescript,json,css,html}` — four real language services with
four more workers, for diagnostics nobody asked a file panel for. `editor.main`
pulls all four and is the import to avoid. That leaves exactly ONE worker in the
bundle, and `EDITOR_OPTIONS` turns off the features that would summon it.

Monaco is `import()`ed the first time a draft opens, not at module scope: it is
a ~6MB chunk and this app opens on a canvas, not on a file. `editor-registry.ts`
exists so Canvas.tsx can install the harness door without importing Monaco and
quietly undoing that.

## The two defects this found, both silent

**Stopping a keydown on Monaco's `onKeyDown` emitter kills every keybinding
Monaco has.** The draft surface has to swallow keys so a ⌘N does not reach the
`window` listeners and spawn a panel behind the file — the guard the textarea
carried. `editor.onKeyDown(e => e.browserEvent.stopPropagation())` reads like
the same guard and is not: the emitter fires from a handler on the inner
`textarea.inputarea`, while Monaco's keybinding service listens on the editor
container, an ANCESTOR. The guard therefore ran before Monaco decided what the
key meant and cancelled its whole dispatch — ⌘S saved nothing, ⌘F opened no find
widget. Nothing threw. It took an instrumented run to see the key arriving
correctly (`keyCode=49`, `meta=true`) and the command never firing. The guard
belongs on the HOST element. The textarea was safe only by accident of shape.

**A note opens INTO its editor, so a lazily-loaded editor flashed an empty box.**
`starter.1` reads the note panel's `textContent` for the word the starter wrote
and found nothing — the check was right, and the fix is the app's, not the
check's. `CodeEditor` renders a pre-paint: the draft's own text, same face and
metrics, inert and `aria-hidden`, unmounted the moment the editor is up. The
check needed no change.

## The harness, and the alternative that was refused

Five Electron checks typed by calling `HTMLTextAreaElement.prototype.value`'s
setter and dispatching `input`. Monaco has no such surface. **The refused
alternative was a hidden mirror textarea** carrying `data-file-node-editor`, so
those checks kept passing untouched — they would have passed while exercising a
control no user can reach, which is the failure check 140's own header warns
about. The checks drive the real editor instead, through
`__m276Type`/`__m276Text`/`__m276Focus`, which execute real edits on the real
model so `onDidChangeModelContent` fires exactly as it does under a keystroke:
the rule `__m13Open` set.

Three further things the swap forced, each written up beside its check:

- **⌘S is `wc.sendInputEvent`.** A dispatched `KeyboardEvent` cannot carry a
  `keyCode` through Chromium's `KeyboardEventInit` at all, and Monaco's
  keybinding service reads exactly that — the event arrives as keyCode 0. The
  suite's standing rule already said dispatched events are untrusted; this is
  the keyboard half of it.
- **Typing reaches React a tick later.** The old setter trick ran inside React's
  own event handler and flushed before `executeJavaScript` resolved; Monaco's
  model-change event does not. A check that types and immediately presses ⌘S
  saves the text from before the edit. `[data-file-node-dirty]` is React's own
  answer to "have you got it yet", so it is the wait — scoped to the panel under
  test, since 139 leaves its own panel open and dirty.
- **`:not([data-file-node-editor-loading])`.** The host exists a frame before the
  editor behind it does, so a wait on the bare attribute returns too early.

## Verification

- `verify:file` 108/108 — the named criterion, and untouched by design.
- `verify:panels:kinds` 50/50, `headroom.1` included.
- `verify:panels:product` 118/118.
- `verify:styles` 75/75, `verify:meta` 50/50.
- `starter.1` was confirmed green at clean HEAD in a throwaway worktree before
  it was treated as a regression — the failure was real, not inherited.

## Owed

- No fresh-context critic on the new surface yet, and no visual goldens: the
  draft surface is a changed visible surface and `verify:visual` has not been
  re-baselined. A golden changes on purpose or not at all.
- ⌘V/⌘C/⌘Z over an open draft still reach the focused TERMINAL. The file panel's
  source editor is NOT in `shouldIgnoreKeys`' list and was not before this
  change either — Monaco neither fixes nor worsens it. Left as-is deliberately
  (see `docs/load-bearing.md`); adding it is a behaviour change, not a swap.
