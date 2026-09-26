/**
 * A Monaco editor bound to a shared file's Y.Text (canvas-doc.ts
 * `canvas:files`) through y-monaco, on the renderer's replica (replica.ts).
 *
 * The TEXT is the doc's; the CARETS are awareness's. y-monaco can paint carets
 * itself, but only from a y-protocols Awareness in this process, and awareness
 * lives in main's presence hub (the connection, the identity, the token). So
 * MonacoBinding gets no awareness here: the local caret goes out through
 * presence's own report (text-cursor.ts → usePresenceReport), and a peer's comes
 * back on the roster and is painted below as a content widget.
 *
 * Lazily `import()`ed by CodeEditor and by useSharedValue (M339, a note in
 * Rich mode), never statically: this module pulls yjs and y-monaco, which have
 * no business in the first chunk.
 *
 * One replica lifecycle (`bindShared`: acquire, share-or-wait, reset and
 * re-open) serves two ATTACHMENTS: y-monaco on an editor model
 * (`bindSharedText`), and a plain string held by the caller
 * (`bindSharedValue`, value.ts). The lifecycle is the part with the traps, so
 * it exists once.
 */
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { CANVAS_FILES } from '@shared/canvas-ops'
import type { SharedTextTarget } from './target'
import { acquire, type ReplicaHandle } from './replica'
import { setLocalTextCursor } from './text-cursor'
import { bindValue, setText } from './value'
import { latestRoster, onRoster } from '../presence/presence-store'

export type SharedTextState = 'local' | 'waiting' | 'live' | 'read-only'

export interface SharedTextBinding {
  dispose(): void
  /** The owner's discard: put the shared text back to `text` (the file on disk), for everyone. */
  revert(text: string): void
}

const toB64 = (bytes: Uint8Array): string => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s) }
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** What an attachment is handed once the replica holds this file's Y.Text. */
interface Bound {
  handle: ReplicaHandle
  ytext: Y.Text
  fileKey: string
  viewer: boolean
  /** Register a teardown for THIS replica handle (run on a reset and on dispose). */
  own(teardown: () => void): void
}

/**
 * The replica lifecycle both attachments share: acquire the workspace's
 * replica, find (or, on the host, create) this file's Y.Text, wait for a
 * teammate's file to be shared, and re-open from scratch when main discards
 * the replica. `seed()` is the caller's current text (it seeds a new Y.Text,
 * and wins over the doc's once when `target.preferLocal()` says so);
 * `attach` connects the caller's surface to the Y.Text.
 */
function bindShared(
  target: SharedTextTarget,
  seed: () => string | null,
  attach: (bound: Bound) => void,
  onState: (state: SharedTextState) => void
): { dispose(): void; revert(text: string): void; current(): Bound | null } {
  let disposed = false
  /** Everything the CURRENT replica handle owns; torn down on a reset and on dispose. */
  let teardown: Array<() => void> = []
  let current: { handle: ReplicaHandle; ytext: Y.Text | null; fileKey: string; bound: Bound | null } | null = null
  let firstBind = true

  const unbind = (): void => {
    for (const t of teardown.reverse()) { try { t() } catch { /* a half-built binding still lets go */ } }
    teardown = []
    current = null
  }

  const bindText = (handle: ReplicaHandle, ytext: Y.Text, fileKey: string): void => {
    const local = seed()
    if (local === null || current === null) return
    const viewer = handle.role === 'viewer'
    // The owner's draft wins ONCE, when it holds edits made outside any
    // binding (typed before the chunk loaded, or a draft reopened dirty);
    // otherwise the doc's text wins, which is how a peer's unsaved edits
    // reach the owner's draft.
    if (firstBind && target.hosted && target.preferLocal() && !viewer) setText(ytext, local)
    firstBind = false
    current.ytext = ytext
    const bound: Bound = { handle, ytext, fileKey, viewer, own: (t) => { teardown.push(t) } }
    current.bound = bound
    attach(bound)
    onState(viewer ? 'read-only' : 'live')
  }

  const start = async (): Promise<void> => {
    const handle = await acquire(target.workspaceId)
    if (disposed) { handle?.release(); return }
    if (handle === null) { onState('local'); return }
    const fileKey = target.hosted ? `${handle.host}_${target.panelId}` : target.panelId
    current = { handle, ytext: null, fileKey, bound: null }
    teardown.push(() => { handle.release() })
    teardown.push(handle.onReset(() => {
      // Main discarded this replica: let go of its doc, then open a fresh one.
      unbind()
      if (!disposed) void start()
    }))
    const files = handle.doc.getMap<unknown>(CANVAS_FILES)
    const existing = files.get(fileKey)
    if (existing instanceof Y.Text) { bindText(handle, existing, fileKey); return }
    // A viewer never shares a file, even their own; they edit it here as before.
    if (target.hosted && handle.role !== 'viewer') {
      const text = seed()
      if (text === null) return
      const ytext = new Y.Text()
      handle.doc.transact(() => {
        files.set(fileKey, ytext)
        ytext.insert(0, text)
      })
      bindText(handle, ytext, fileKey)
      return
    }
    if (target.hosted) { onState('local'); return }
    // A teammate's file that is not shared yet: wait for its owner to share it.
    onState('waiting')
    const wait = (): void => {
      const t = files.get(fileKey)
      if (!(t instanceof Y.Text) || current?.handle !== handle || current.ytext !== null) return
      files.unobserve(wait)
      bindText(handle, t, fileKey)
    }
    files.observe(wait)
    teardown.push(() => { files.unobserve(wait) })
  }
  void start()

  return {
    dispose() {
      disposed = true
      unbind()
    },
    revert(text) {
      const c = current
      if (c === null || c.ytext === null || !target.hosted || c.handle.role === 'viewer') return
      setText(c.ytext, text)
    },
    current: () => current?.bound ?? null
  }
}

export function bindSharedText(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  target: SharedTextTarget,
  onState: (state: SharedTextState) => void
): SharedTextBinding {
  const paintCarets = (): void => {
    if (closed) return
    const b = shared?.current() ?? null
    for (const w of widgets) editor.removeContentWidget(w)
    widgets = []
    const model = editor.getModel()
    if (model === null || b === null) { decorations = editor.deltaDecorations(decorations, []); return }
    const next: Monaco.editor.IModelDeltaDecoration[] = []
    for (const peer of latestRoster(target.workspaceId)?.peers ?? []) {
      const tc = peer.presence.textCursor
      if (!peer.live || tc === null || tc.file !== b.fileKey) continue
      let anchor: Y.AbsolutePosition | null = null, head: Y.AbsolutePosition | null = null
      try {
        anchor = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(fromB64(tc.anchor)), b.handle.doc)
        head = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(fromB64(tc.head)), b.handle.doc)
      } catch { continue }
      // A position in history this replica has not received yet, or in another file: not ours to paint.
      if (anchor === null || head === null || anchor.type !== b.ytext || head.type !== b.ytext) continue
      const a = model.getPositionAt(anchor.index), h = model.getPositionAt(head.index)
      if (anchor.index !== head.index) {
        const [s, e] = anchor.index < head.index ? [a, h] : [h, a]
        next.push({ range: new monaco.Range(s.lineNumber, s.column, e.lineNumber, e.column), options: { className: 'shared-text__selection' } })
      }
      const node = document.createElement('div')
      node.className = 'shared-text__caret'
      // CSSOM, not a style attribute: the CSP refuses inline style text.
      node.style.setProperty('--peer', peer.presence.color)
      // One line tall, in Monaco's own measure (a number; no token carries it).
      node.style.height = `${editor.getOption(monaco.editor.EditorOption.lineHeight)}px`
      const label = document.createElement('span')
      label.className = 'shared-text__caret-name'
      label.textContent = peer.presence.displayName
      node.appendChild(label)
      const widget: Monaco.editor.IContentWidget = {
        getId: () => `shared-text-caret-${peer.clientId}`,
        getDomNode: () => node,
        getPosition: () => ({ position: h, preference: [monaco.editor.ContentWidgetPositionPreference.EXACT] })
      }
      editor.addContentWidget(widget)
      widgets.push(widget)
    }
    decorations = editor.deltaDecorations(decorations, next)
  }
  let widgets: Monaco.editor.IContentWidget[] = []
  let decorations: string[] = []
  let shared: ReturnType<typeof bindShared> | null = null
  /** Disposed: the editor may already be gone, so nothing paints into it again. */
  let closed = false

  shared = bindShared(target, () => editor.getModel()?.getValue() ?? null, ({ ytext, fileKey, viewer, own }) => {
    const model = editor.getModel()
    if (model === null) return
    const binding = new MonacoBinding(ytext, model, new Set([editor]), null)
    own(() => { binding.destroy() })
    if (viewer) editor.updateOptions({ readOnly: true })

    const report = (): void => {
      const sel = editor.getSelection()
      if (sel === null || !editor.hasTextFocus()) { setLocalTextCursor(null, fileKey); return }
      const at = (p: Monaco.IPosition): string => toB64(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(ytext, model.getOffsetAt(p))))
      setLocalTextCursor({ file: fileKey, anchor: at(sel.getSelectionStart()), head: at(sel.getPosition()) })
    }
    const cursor = editor.onDidChangeCursorSelection(report)
    const focus = editor.onDidFocusEditorText(report)
    const blur = editor.onDidBlurEditorText(() => { setLocalTextCursor(null, fileKey) })
    own(() => { cursor.dispose(); focus.dispose(); blur.dispose(); setLocalTextCursor(null, fileKey) })
    report()

    ytext.observe(paintCarets)
    own(() => { ytext.unobserve(paintCarets) })
    const offRoster = onRoster((r) => { if (r.workspaceId === target.workspaceId) paintCarets() })
    own(offRoster)
    // Runs after the handle's own teardowns are queued, so it clears the
    // carets once `current()` no longer names this Y.Text.
    own(() => { queueMicrotask(paintCarets) })
    paintCarets()
  }, onState)

  return {
    dispose: () => { shared?.dispose(); paintCarets(); closed = true },
    revert: (text) => { shared?.revert(text) }
  }
}

export interface SharedValueBinding extends SharedTextBinding {
  /** A local change to the caller's text (FileNode's Rich commit), computed on `base`; rebased if a peer's change landed since (value.ts). */
  push(next: string, base?: string): void
}

/**
 * M339. A shared file's text bound to a plain string the caller holds — a
 * note's draft in RICH mode. `get` reads the caller's current text (it seeds
 * a new Y.Text, and wins once under `preferLocal`); `set` receives a peer's
 * change as the whole new text. No carets: Rich mode edits block by block,
 * and a Monaco caret has no place there.
 */
export function bindSharedValue(
  target: SharedTextTarget,
  get: () => string,
  set: (text: string) => void,
  onState: (state: SharedTextState) => void
): SharedValueBinding {
  let value: ReturnType<typeof bindValue> | null = null
  const shared = bindShared(target, get, ({ ytext, viewer, own }) => {
    const v = bindValue(ytext, set, viewer)
    value = v
    own(() => { v.dispose(); if (value === v) value = null })
    // The doc's text wins at bind time (unless preferLocal just wrote ours
    // into it): the caller's draft is told what the shared text now says.
    if (ytext.toString() !== get()) set(ytext.toString())
  }, onState)
  return {
    push: (next, base) => { value?.push(next, base) },
    revert: (text) => { shared.revert(text) },
    dispose: () => { shared.dispose() }
  }
}
