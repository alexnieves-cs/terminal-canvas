import { useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { ImagePanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { displayPath } from '@shared/display-path'
import type { ImageResult } from '@shared/starter'
import { missingImageSentence } from '@shared/assets'
import { shellControl } from '@renderer/shell/shell-control'

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
 * M186. REPLACE, on every arm that is not a picture: the brief's "missing
 * bytes leave an OBJECT with a Replace action" — an object a person can
 * repair, never a hole. It is present on the chrome at every arm (a picture
 * that reads fine can still be pointed at other bytes) and it opens the
 * SYSTEM's own chooser through main, so this app invents no file browser and
 * sees no path the person did not point at. Equal to a panel in selection, drag,
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
  /** M186. Point this picture at other bytes; no path opens the system's chooser. */
  onReplace: (panelId: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /**
   * M186. Bumped when this panel's BYTES may have changed while its path did
   * not. The store is content-addressed, so replacing a picture whose file was
   * deleted with the same picture writes the same path back — and an effect
   * keyed on the path alone would never re-read, leaving `missing` on screen
   * over a file that is now there. Found by `image.2`.
   */
  reloadKey?: number
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
  }, [path, props.reloadKey])
  const arm = result === null ? 'reading' : result.kind
  const [said, setSaid] = useState<string | null>(null)
  const sayTimer = useRef(0)
  useEffect(() => () => { window.clearTimeout(sayTimer.current) }, [])
  const say = (text: string): void => { setSaid(text); window.clearTimeout(sayTimer.current); sayTimer.current = window.setTimeout(() => setSaid((v) => (v === text ? null : v)), 4000) }
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
      chrome={props.readOnly === true ? undefined : (
        <button type="button" className="pf__verb pf__verb--word" data-image-replace
          title="Choose different bytes for this picture"
          {...shellControl(() => { void props.onReplace(panel.rect.id).then((r) => { if (r.kind === 'refused') say(r.reason) }) })}>Replace</button>
      )}
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
          <div className="image-node__gone">
            <p className="pf__note image-node__note" data-image-note title={path}>{imageArmSentence(result, path)}</p>
            <p className="pf__note image-node__note">{missingImageSentence(result.kind, result.kind === 'too-large' ? { bytes: result.bytes, cap: result.cap } : undefined)}</p>
          </div>
        )}
        {said !== null && <p className="pf__note image-node__note" data-image-said role="status">{said}</p>}
      </div>
    </PanelFrame>
  )
}
