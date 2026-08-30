import { memo, useEffect, useMemo, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
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
  panel, selected, onSelect, onFocus, onBeginDrag, onClose
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
        {model.note !== undefined ? (
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
