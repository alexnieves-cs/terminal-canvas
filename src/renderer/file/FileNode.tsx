import { memo, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { FilePanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { applyFileResult, useFileResult } from '@renderer/session/file-store'
import { buildFileNodeModel } from './file-node-model'

export interface FileNodeProps {
  panel: FilePanel
  selected: boolean
  onSelect: (id: string) => void
  /**
   * The same onFocus a terminal panel's body calls, and it buys exactly what
   * it buys for a review node: shouldYieldWheel's rule 3 gives the wheel to
   * the FOCUSED panel, so an unfocused file panel would pan the canvas
   * instead of scrolling its own text. It costs nothing, because a file panel
   * never reaches assignTiers at all — Canvas partitions it out before
   * tiering, so a focused id naming one consumes no LIVE_BUDGET slot.
   */
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  /**
   * SessionHandle.focus() on a panel id — Canvas's own `restoreFocus`, the
   * one the palette and ReviewNode's commit draft already use. The editor
   * textarea is the third surface in this app that takes DOM focus off
   * xterm, so it inherits usePalette's rule 4: an unmounting input's blur
   * leaves focus on `<body>`, where every subsequent keystroke goes nowhere
   * at all. Threaded in rather than looked up here because this layer, like
   * the review layer, deliberately knows nothing about the registry.
   */
  restoreFocus: (id: string) => void
  /**
   * Which panel had app focus when the draft OPENS — captured into a ref at
   * that moment, for the reason usePalette captures rather than clears:
   * `focusedId` still names the terminal panel the user was in, because the
   * edit button's preventDefault deliberately never moved it.
   */
  focusedId: string | null
}

/**
 * A local file on the canvas.
 *
 * Reuses the `.panel` class and `data-panel-id` DELIBERATELY, exactly as
 * ReviewNode does: drag, resize, selection, the pointer corrector and
 * shouldYieldWheel's `closest('.panel')` all key off them, so a bespoke class
 * would mean reimplementing five behaviours that already work.
 *
 * It owns its OWN read, rather than receiving a result from Canvas, for the
 * reason ReviewNode owns its own query and RailPanelRow owns its own
 * agent-state subscription: a canvas can hold several file panels, and lifting
 * their reads into Canvas would make every file change a Canvas re-render —
 * the 60Hz cascade the memo architecture exists to prevent, arriving through
 * a new door. The store fans main's pushes out per panel id instead.
 */
function FileNodeImpl({
  panel, selected, onSelect, onFocus, onBeginDrag, onClose, restoreFocus, focusedId
}: FileNodeProps): JSX.Element {
  const { rect, z } = panel
  const id = rect.id
  const path = panel.source.path
  const result = useFileResult(id)
  // A refresh is a re-run of the effect below rather than a second read path,
  // so "read" and "re-read" cannot drift: one invoke, one arm-the-watch, one
  // place a rejection lands.
  const [refreshToken, setRefreshToken] = useState(0)

  const model = useMemo(
    // Keyed on the three INPUTS, never on a serialised signature of the
    // output. Canvas hands a new `panel` object on every drag frame, but
    // `source` and `title` are carried by REFERENCE through setPanelRect's
    // `{ ...p, rect }`, and `result` is store state a drag does not touch — so
    // React's identity comparison already answers this. ReviewNode's own
    // comment records what the signature version cost: serialising 600 line
    // objects per frame to avoid one object allocation.
    () => buildFileNodeModel({ source: panel.source, title: panel.title, result }),
    [panel.source, panel.title, result]
  )

  // The draft lives HERE, never in file-store.ts. That store's own header
  // says it is "a cache of main's answer, never a second author of it", and a
  // draft is by definition not main's answer. Watcher pushes keep landing in
  // the store while a draft is open — the store stays a faithful cache — and
  // it is this component that decides not to reseed from them.
  const [draft, setDraft] = useState<string | null>(null)
  // The CAS token: the mtime of the result the draft was seeded from. NOT
  // updated by arriving pushes, which is the entire point — a token that
  // followed the disk would make every save succeed and every conflict
  // silent.
  const [baseMtimeMs, setBaseMtimeMs] = useState<number | null>(null)
  const [conflict, setConflict] = useState<null | 'disk-changed' | 'refused'>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const editing = draft !== null

  // The seed the current draft was built from. A ref, not state: comparing
  // against it must not itself trigger a render, and it has to survive
  // across the reseed effect's own writes to `draft`.
  const seedRef = useRef<string>('')
  // Compared against what was SEEDED, not against the live store value —
  // seedRef is the anchor both `dirty` and the reseed effect below share, so
  // the two cannot disagree about what "unsaved" means.
  const dirty = editing && result?.kind === 'text' && draft !== seedRef.current

  // Captured when the draft OPENS, exactly as ReviewNode's commit draft
  // captures `focusedId` rather than clearing it, and consumed on every exit
  // below — see closeDraft.
  const capturedFocusRef = useRef<string | null>(null)

  /**
   * The one way edit mode closes, so every exit restores the keyboard.
   *
   * NO CHECK IN THIS REPO CAN OBSERVE THIS, exactly as ReviewNode's own
   * closeDraft records: the panels suite drives keys through dispatched
   * events, and DOM focus after an unmount is a browser default action an
   * untrusted synthetic event never performs. Deleting the restoreFocus call
   * leaves every automated suite green and leaves the user's next keystroke
   * going nowhere — usePalette's rule 4 failure, silently.
   */
  const closeDraft = (): void => {
    setDraft(null)
    setConflict(null)
    const fid = capturedFocusRef.current
    capturedFocusRef.current = null
    if (fid !== null) restoreFocus(fid)
  }

  // Read on mount, close on unmount. This is what makes "the renderer is
  // showing this file" and "main is watching it" one statement: a workspace
  // switch unmounts without disposing, so it correctly stops the watch for a
  // canvas nobody is looking at, and re-arms it on the way back.
  useEffect(() => {
    let live = true
    void window.canvas.file
      .read({ panelId: id, path })
      .then((r) => { if (live) applyFileResult(id, r) })
      // MANDATORY. An unhandled rejection leaves a permanent "reading…", which
      // this milestone's honest-degradation rule forbids: every failure must
      // land in a rendered arm with a sentence. `unreadable` is the arm that
      // already says "this file could not be read: <detail>", which is exactly
      // what a failure at this door means to a user.
      .catch((error: unknown) => {
        if (live) applyFileResult(id, { kind: 'unreadable', detail: String(error) })
      })
    return () => {
      live = false
      void window.canvas.file.close(id)
    }
  }, [id, path, refreshToken])

  // An arriving change while a draft is open. NOT DIRTY reseeds: nothing is
  // lost, and a panel that went stale the moment you opened it to edit would
  // be a worse version of the read view you just left. DIRTY does not: the
  // draft is left exactly as typed and the banner says so, at the moment it
  // happens rather than at the moment the user tries to save.
  useEffect(() => {
    if (draft === null || result?.kind !== 'text') return
    if (result.mtimeMs === baseMtimeMs) return
    if (dirty) {
      setConflict('disk-changed')
      return
    }
    seedRef.current = result.content
    setDraft(result.content)
    setBaseMtimeMs(result.mtimeMs)
  }, [result, draft, baseMtimeMs, dirty])

  const save = (force: boolean): void => {
    if (draft === null) return
    setSaveError(null)
    void window.canvas.file
      // No panelId: FileWriteRequest is a plain request/response with
      // nothing to key on the panel that issues it — see its own doc
      // comment in ipc-contract.ts.
      .write({ path, content: draft, baseMtimeMs: force ? null : baseMtimeMs })
      .then((res) => {
        if (res.kind === 'written') {
          // Leave edit mode on success through the same door every other
          // exit uses, so focus comes back exactly once. The watcher's own
          // push will bring the saved content back through the store a
          // moment later, so there is nothing to reseed by hand — one code
          // path for "what does this file say", the same reason the refresh
          // control re-runs the read effect rather than being a second read.
          closeDraft()
          return
        }
        if (res.kind === 'stale') { setConflict('refused'); return }
        setSaveError(res.detail)
      })
      // MANDATORY, the rule the read effect already states: an unhandled
      // rejection leaves a draft that looks saved and is not.
      .catch((error: unknown) => setSaveError(String(error)))
  }

  return (
    <div
      className={`panel${selected ? ' panel--selected' : ''}`}
      data-panel-id={id}
      // The kind, as an attribute rather than as a class the styles happen to
      // use: verify:panels reads it to tell a file panel apart from a terminal
      // one in a canvas where both are just `.panel`. There is no `.file-node`
      // class and no bare `data-file-node` marker beside it — both were
      // redundant with this attribute and neither was read by any CSS rule
      // or selector.
      data-panel-kind="file"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }}
    >
      <header
        className="panel__chrome"
        onMouseDown={(event: ReactMouseEvent) => {
          event.stopPropagation()
          event.preventDefault()
          onSelect(id)
          onBeginDrag({
            panelId: id,
            mode: { kind: 'move' },
            originRect: rect,
            originWorld: { x: event.clientX, y: event.clientY }
          })
        }}
      >
        <span className="panel__title">{model.heading}</span>
        {/* Short by construction ("2 KB · 40 lines", "not found"), so it sits
            in the chrome row. The DIRECTORY is an absolute path and would
            squash the heading out of a one-line header, so it renders at the
            top of the body instead — still its own field rather than spliced
            into the heading, which is the rule the inspector's own file arm
            states. */}
        <span className="file-node__summary" data-file-node-summary>{model.summary}</span>
        {dirty && (
          // Visible unsaved-work marker. An editor that gives no sign of a
          // pending, un-persisted draft is its own defect — the user has no
          // way to tell "I have edits" from "everything is saved" short of
          // pressing Save and hoping. Amber, matching this app's other
          // "something here wants your attention" colour.
          <span className="file-node__dirty" data-file-node-dirty title="Unsaved changes">●</span>
        )}
        <button
          type="button"
          className="file-node__edit"
          data-file-node-edit
          disabled={!model.editable || editing}
          // Present and DISABLED rather than hidden. verify:palette 31's rule:
          // a control that disappears is indistinguishable from a feature that
          // was never built, and a user who wants to edit a 40,000-line log is
          // precisely the person who will go looking for this button.
          title={model.editable ? 'Edit this file' : model.editableNote}
          onMouseDown={(event) => {
            // shellControl's rule, which every control in this app obeys:
            // preventDefault keeps DOM focus off the button, stopPropagation
            // stops the header starting a drag from a click inside it.
            event.stopPropagation()
            event.preventDefault()
            if (!model.editable || result?.kind !== 'text') return
            seedRef.current = result.content
            setDraft(result.content)
            setBaseMtimeMs(result.mtimeMs)
            setConflict(null)
            setSaveError(null)
            capturedFocusRef.current = focusedId
          }}
        >
          ✎
        </button>
        <button
          type="button"
          className="file-node__refresh"
          title="Read this file again"
          onMouseDown={(event) => {
            // preventDefault is what keeps DOM focus off this button and on
            // whatever had it — shellControl's rule, which every control in
            // this app obeys. stopPropagation is what stops the header's own
            // handler starting a DRAG from a click on a button inside it.
            event.stopPropagation()
            event.preventDefault()
            setRefreshToken((n) => n + 1)
          }}
        >
          ⟳
        </button>
        {/* No arming step, unlike a terminal panel's ×: that button arms
            because a mis-click there kills a process. There is nothing to kill
            here, and the same gesture reopens the file. */}
        <button
          type="button"
          className="panel__close"
          title="Close this file"
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onClose(id)
          }}
        >
          ×
        </button>
      </header>

      <div
        className="file-node__body"
        // The marker shouldYieldWheel looks for. It is an ATTRIBUTE on the
        // element that actually scrolls, so "does this panel own its wheel" is
        // answered by what the KIND renders rather than by a branch inside the
        // predicate — see Canvas.tsx's rule 3, which needed no edit for this
        // kind precisely because of that.
        data-scroll-host
        onMouseDown={(event) => {
          event.stopPropagation()
          onFocus(id)
        }}
        // stopPropagation on EVERY key, not only ones handled here (there are
        // none). useViewport's keydown listener is on `window`, above this
        // component in the bubble path, so without this a Cmd+N pressed while
        // reading spawns a panel behind the file and a Cmd+K opens the palette
        // over it.
        onKeyDown={(event) => event.stopPropagation()}
      >
        <p className="file-node__directory" data-file-node-directory>{model.directory}</p>
        {editing ? (
          <>
            {conflict !== null && (
              <div className="file-node__conflict" data-file-node-conflict>
                <span>
                  {conflict === 'refused'
                    ? 'This file changed on disk, so the save was refused.'
                    : 'This file changed on disk.'}
                </span>
                <button
                  type="button"
                  onMouseDown={(event) => { event.stopPropagation(); event.preventDefault(); closeDraft() }}
                >
                  Reload (discard mine)
                </button>
                {conflict === 'refused' && (
                  <button
                    type="button"
                    onMouseDown={(event) => { event.stopPropagation(); event.preventDefault(); save(true) }}
                  >
                    Overwrite theirs
                  </button>
                )}
              </div>
            )}
            {saveError !== null && <p className="file-node__note">{saveError}</p>}
            <textarea
              className="file-node__editor"
              data-file-node-editor
              autoFocus
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Every key, not only the two handled here — useViewport's and
                // usePalette's listeners are on `window`, above this in the
                // bubble path, so without this a Cmd+N typed into a draft
                // spawns a panel behind the file. useNavGrid's listener is
                // CAPTURE-phase on `window` and has already run by the time
                // this stopPropagation could reach it — that guard is widened
                // separately, in useNavGrid.ts itself, to name this class.
                event.stopPropagation()
                if (event.metaKey && event.key === 's') { event.preventDefault(); save(false) }
                if (event.key === 'Escape') { event.preventDefault(); closeDraft() }
              }}
            />
            <button
              type="button"
              className="file-node__save"
              data-file-node-save
              onMouseDown={(event) => { event.stopPropagation(); event.preventDefault(); save(false) }}
            >
              Save
            </button>
          </>
        ) : model.note !== undefined ? (
          <p className="file-node__note" data-file-node-note>{model.note}</p>
        ) : (
          <pre className="file-node__pre" data-file-node-lines>
            {model.lines.map((line) => (
              <div className="file-node__line" key={line.n}>
                {/* The number of the line in the FILE, from the model, never
                    the array index — the two differ the moment anything is
                    dropped ahead of a rendered line. */}
                <span className="file-node__gutter">{line.n}</span>
                <span className="file-node__text">{line.text}</span>
              </div>
            ))}
          </pre>
        )}
        {model.truncatedNote !== undefined && (
          <p className="file-node__more" data-file-node-truncated>{model.truncatedNote}</p>
        )}
      </div>

      {(['e', 's', 'se'] as const).map((edge) => (
        <div
          key={edge}
          className={`panel__resize panel__resize--${edge}`}
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onSelect(id)
            onBeginDrag({
              panelId: id,
              mode: { kind: 'resize', edge },
              originRect: rect,
              originWorld: { x: event.clientX, y: event.clientY }
            })
          }}
        />
      ))}
    </div>
  )
}

export const FileNode = memo(FileNodeImpl)
