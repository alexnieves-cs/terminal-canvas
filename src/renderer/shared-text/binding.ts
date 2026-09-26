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
 * Lazily `import()`ed by CodeEditor, never statically: this module pulls yjs
 * and y-monaco, which have no business in the first chunk.
 */
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { CANVAS_FILES } from '@shared/canvas-ops'
import type { SharedTextTarget } from './target'
import { acquire, type ReplicaHandle } from './replica'
import { setLocalTextCursor } from './text-cursor'
import { latestRoster, onRoster } from '../presence/presence-store'

export type SharedTextState = 'local' | 'waiting' | 'live' | 'read-only'

export interface SharedTextBinding {
  dispose(): void
  /** The owner's discard: put the shared text back to `text` (the file on disk), for everyone. */
  revert(text: string): void
}

const toB64 = (bytes: Uint8Array): string => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s) }
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** Replace `ytext`'s content with `next` as ONE minimal edit — common prefix and suffix kept, so peers' carets outside the change stay put. */
function setText(ytext: Y.Text, next: string): void {
  const cur = ytext.toString()
  if (cur === next) return
  let start = 0
  while (start < cur.length && start < next.length && cur[start] === next[start]) start++
  let end = 0
  while (end < cur.length - start && end < next.length - start && cur[cur.length - 1 - end] === next[next.length - 1 - end]) end++
  ytext.doc?.transact(() => {
    ytext.delete(start, cur.length - start - end)
    ytext.insert(start, next.slice(start, next.length - end))
  })
}

export function bindSharedText(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  target: SharedTextTarget,
  onState: (state: SharedTextState) => void
): SharedTextBinding {
  let disposed = false
  /** Everything the CURRENT replica handle owns; torn down on a reset and on dispose. */
  let teardown: Array<() => void> = []
  let current: { handle: ReplicaHandle; ytext: Y.Text | null; fileKey: string } | null = null
  let firstBind = true

  const unbind = (): void => {
    for (const t of teardown.reverse()) { try { t() } catch { /* a half-built binding still lets go */ } }
    teardown = []
    current = null
  }

  const paintCarets = (() => {
    let widgets: Monaco.editor.IContentWidget[] = []
    let decorations: string[] = []
    return (): void => {
      for (const w of widgets) editor.removeContentWidget(w)
      widgets = []
      const model = editor.getModel()
      const c = current
      if (model === null || c === null || c.ytext === null) { decorations = editor.deltaDecorations(decorations, []); return }
      const next: Monaco.editor.IModelDeltaDecoration[] = []
      for (const peer of latestRoster(target.workspaceId)?.peers ?? []) {
        const tc = peer.presence.textCursor
        if (!peer.live || tc === null || tc.file !== c.fileKey) continue
        let anchor: Y.AbsolutePosition | null = null, head: Y.AbsolutePosition | null = null
        try {
          anchor = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(fromB64(tc.anchor)), c.handle.doc)
          head = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(fromB64(tc.head)), c.handle.doc)
        } catch { continue }
        // A position in history this replica has not received yet, or in another file: not ours to paint.
        if (anchor === null || head === null || anchor.type !== c.ytext || head.type !== c.ytext) continue
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
  })()

  const bindText = (handle: ReplicaHandle, ytext: Y.Text, fileKey: string): void => {
    const model = editor.getModel()
    if (model === null || current === null) return
    const viewer = handle.role === 'viewer'
    // The owner's draft wins ONCE, when it holds edits made outside the
    // binding (Rich mode, or a draft reopened dirty); otherwise the doc's text
    // wins, which is how a peer's unsaved edits reach the owner's draft.
    if (firstBind && target.hosted && target.preferLocal() && !viewer) setText(ytext, model.getValue())
    firstBind = false
    current.ytext = ytext
    const binding = new MonacoBinding(ytext, model, new Set([editor]), null)
    teardown.push(() => { binding.destroy() })
    if (viewer) editor.updateOptions({ readOnly: true })
    onState(viewer ? 'read-only' : 'live')

    const report = (): void => {
      const sel = editor.getSelection()
      if (sel === null || !editor.hasTextFocus()) { setLocalTextCursor(null, fileKey); return }
      const at = (p: Monaco.IPosition): string => toB64(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(ytext, model.getOffsetAt(p))))
      setLocalTextCursor({ file: fileKey, anchor: at(sel.getSelectionStart()), head: at(sel.getPosition()) })
    }
    const cursor = editor.onDidChangeCursorSelection(report)
    const focus = editor.onDidFocusEditorText(report)
    const blur = editor.onDidBlurEditorText(() => { setLocalTextCursor(null, fileKey) })
    teardown.push(() => { cursor.dispose(); focus.dispose(); blur.dispose(); setLocalTextCursor(null, fileKey) })
    report()

    ytext.observe(paintCarets)
    teardown.push(() => { ytext.unobserve(paintCarets) })
    const offRoster = onRoster((r) => { if (r.workspaceId === target.workspaceId) paintCarets() })
    teardown.push(offRoster)
    teardown.push(() => { current = null; paintCarets() })
    paintCarets()
  }

  const start = async (): Promise<void> => {
    const handle = await acquire(target.workspaceId)
    if (disposed) { handle?.release(); return }
    if (handle === null) { onState('local'); return }
    const fileKey = target.hosted ? `${handle.host}_${target.panelId}` : target.panelId
    current = { handle, ytext: null, fileKey }
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
      const model = editor.getModel()
      if (model === null) return
      const ytext = new Y.Text()
      handle.doc.transact(() => {
        files.set(fileKey, ytext)
        ytext.insert(0, model.getValue())
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
    }
  }
}
