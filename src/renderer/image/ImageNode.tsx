import { useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { ImagePanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { displayPath } from '@shared/display-path'
import type { ImageResult } from '@shared/starter'

/**
 * M181. THE IMAGE PANEL — the fifteenth kind, sessionless like the file
 * panel. The record holds a PATH and nothing else; the bytes are main's,
 * asked through `image:read` on mount and again whenever the path changes,
 * and painted as a data URL (the CSP's `img-src 'self' data:` — the
 * renderer never opens a `file:` url, M103's rule). Three states, never two:
 * asked-but-unanswered paints nothing and says so; a real answer paints
 * the picture at its own aspect ratio inside the body; each named arm
 * (`missing`, `too-large`, `not-an-image`) is a sentence that says what to
 * do, with the full path on the frame's title (the path rule). A blank
 * picture panel would be indistinguishable from a broken one.
 *
 * No drop, paste or replace door here — M187 owns ingestion and the asset
 * lifecycle; `Replace` arrives with it. Equal to a panel in selection, drag,
 * resize, marks, grouping, undo and export by construction: PanelFrame and
 * the panel array do all of that, and this component owns nothing.
 */
export interface ImageNodeProps {
  panel: ImagePanel
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
}

/** The sentence per arm — words, not codes (the empty-state rule). */
export function imageArmSentence(result: ImageResult, path: string): string {
  const short = displayPath(path).short
  if (result.kind === 'missing') return `${short} is not there any more — the file was moved or deleted`
  if (result.kind === 'too-large') return `${short} is ${(result.bytes / (1024 * 1024)).toFixed(1)} MB, over the ${Math.round(result.cap / (1024 * 1024))} MB this panel shows`
  if (result.kind === 'not-an-image') return `${short} is not a PNG, JPEG, GIF or WebP file`
  return ''
}

export function ImageNode(props: ImageNodeProps): JSX.Element {
  const { panel } = props
  const path = panel.image.path
  // null: asked, no answer yet — the third state, painted as its own sentence.
  const [result, setResult] = useState<ImageResult | null>(null)
  useEffect(() => {
    let live = true
    setResult(null)
    void window.canvas.image.read(path).then((r) => { if (live) setResult(r) }).catch(() => { if (live) setResult({ kind: 'missing' }) })
    return () => { live = false }
  }, [path])
  const arm = result === null ? 'reading' : result.kind
  const title = panel.title ?? (path.split('/').pop() || 'image')
  return (
    <PanelFrame
      id={panel.rect.id}
      kind="image"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={props.readOnly === true}
      className="image-node"
      // The path rule: the basename in the chrome, the full path on the frame's title.
      rootAttrs={{ 'data-image-node': '', 'data-image-arm': arm, 'data-image-path': path, title: path }}
      title={title}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={props.readOnly === true ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) } }}
    >
      <div className="pf__body image-node__body" onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}>
        {result === null ? (
          <p className="pf__note image-node__note" data-image-note>reading {displayPath(path).short}…</p>
        ) : result.kind === 'data' ? (
          <img className="image-node__img" data-image-pixels src={result.dataUrl} alt={title} draggable={false} />
        ) : (
          <p className="pf__note image-node__note" data-image-note title={path}>{imageArmSentence(result, path)}</p>
        )}
      </div>
    </PanelFrame>
  )
}
