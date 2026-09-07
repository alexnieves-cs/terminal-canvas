import { memo, useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { BrowserPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { shellControl } from '@renderer/shell/shell-control'
import { browserHost, normaliseTypedUrl } from '@shared/browser-panel'
import { clearBrowser, registerBrowser } from './browser-store'
import { ChevronLeft, ChevronRight, RotateCw } from '@renderer/icons'

/**
 * M103. THE BROWSER PANE — the eleventh kind: a live page in its own guest
 * process, inside the one panel frame, with the app's own chrome above it.
 *
 * Two rules hold the whole thing up, and both are about what a HOSTILE page
 * cannot do:
 *
 *  1. The address readout (`data-browser-url`) and the record's url are set
 *     from the guest's own `getURL()` on `did-navigate` / `did-navigate-in-
 *     page`, and from NOTHING the page can write — not `document.title`, not
 *     a posted message, not the page's own `location` (which lives in the
 *     guest and is the page's word). `verify:panels browser.1` serves a page
 *     that rewrites its title and its history and asserts the readout is the
 *     real address.
 *  2. Reading the pane is main's (`browser:read`), never a message from the
 *     guest: the node only registers the guest's id (`browser-store.ts`) so
 *     main can find it, check it is a webview, check its LIVE scheme, cap
 *     the text and pass it outward.
 *
 * The guest element is created IMPERATIVELY rather than as JSX: `<webview>`
 * is not in React's element table, its listeners must be on before `src` is
 * set (a `did-navigate` fired into an unlistened element is a readout that
 * never updates), and the element must NOT be re-created when the record's
 * url changes — a navigation writes the url back onto the record, and an
 * effect keyed on it would rebuild the guest on every page, navigating it
 * to where it already was. The effect is keyed on the panel id alone; the
 * opening url is read once through a ref.
 */
export interface BrowserNodeProps {
  panel: BrowserPanel
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
  /** The guest navigated: the record follows (Canvas.tsx writes it with no history entry). */
  onNavigated: (id: string, url: string) => void
}

/** The webview tag's surface this node touches, structurally — no electron types in the renderer. */
interface GuestElement extends HTMLElement {
  src: string
  getURL(): string
  reload(): void
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  getWebContentsId(): number
  loadURL(url: string): Promise<void>
}

function BrowserNodeImpl(props: BrowserNodeProps): JSX.Element {
  const { panel } = props
  const id = panel.rect.id
  const hostRef = useRef<HTMLDivElement | null>(null)
  const guestRef = useRef<GuestElement | null>(null)
  const openingUrl = useRef(panel.url)
  // Three states for the readout, never two: no page yet (the guest has not
  // navigated), a page (its real address), and a failure (named). A blank
  // readout under a blank guest would read as a pane that is broken rather
  // than one that is loading.
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [draft, setDraft] = useState(panel.url)
  const [guestId, setGuestId] = useState<number | null>(null)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const navigated = useRef(props.onNavigated)
  navigated.current = props.onNavigated

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const el = document.createElement('webview') as GuestElement
    el.className = 'browser-node__guest'
    el.setAttribute('data-browser-guest', id)
    // The pane's own partition: cookies and storage are the pane's, never
    // the main window's session (which never sees a page), and main's
    // permission handler is registered against this name.
    el.setAttribute('partition', 'persist:tc-browser')
    const readAddress = (): void => {
      let url: string
      try { url = el.getURL() } catch { return }
      setLiveUrl(url)
      setDraft(url)
      setFailure(null)
      try { setCanBack(el.canGoBack()); setCanForward(el.canGoForward()) } catch { /* not attached yet */ }
      navigated.current(id, url)
    }
    const onAttach = (): void => {
      let wc: number
      try { wc = el.getWebContentsId() } catch { return }
      setGuestId(wc)
      registerBrowser(id, { webContentsId: wc, reload: () => { try { el.reload() } catch { /* gone */ } } })
    }
    const onStart = (): void => setLoading(true)
    const onStop = (): void => setLoading(false)
    // -3 is ERR_ABORTED — a navigation superseded by the next one, which is
    // not a failure a person can act on and would flash under every redirect.
    const onFail = (event: Event): void => {
      const e = event as Event & { errorCode?: number; errorDescription?: string; validatedURL?: string; isMainFrame?: boolean }
      if (e.isMainFrame === false || e.errorCode === -3) return
      setLoading(false)
      setFailure(`${e.validatedURL ?? 'the page'} did not load — ${e.errorDescription ?? 'unknown error'} (${e.errorCode ?? '?'})`)
    }
    el.addEventListener('did-attach', onAttach)
    el.addEventListener('did-navigate', readAddress)
    el.addEventListener('did-navigate-in-page', readAddress)
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-fail-load', onFail)
    // src LAST, after every listener: setting it is the navigation.
    el.src = openingUrl.current
    host.appendChild(el)
    guestRef.current = el
    return () => {
      guestRef.current = null
      el.remove()
      clearBrowser(id)
    }
  }, [id])

  const submitAddress = (): void => {
    const normalised = normaliseTypedUrl(draft)
    if (normalised.kind === 'refused') { setFailure(normalised.reason); return }
    setFailure(null)
    const el = guestRef.current
    if (el === null) return
    void el.loadURL(normalised.url).catch(() => { /* did-fail-load names it */ })
  }

  const shown = liveUrl ?? panel.url
  const heading = panel.title ?? `browser · ${browserHost(shown)}`
  const readOnly = props.readOnly === true

  return (
    <PanelFrame
      id={id}
      kind="browser"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={readOnly}
      className="browser-node"
      rootAttrs={{ 'data-browser-node': id, 'data-browser-live': liveUrl === null ? 'no' : 'yes', ...(guestId === null ? {} : { 'data-browser-wc': String(guestId) }) }}
      title={heading}
      // The chrome carries the REAL address — set only by readAddress above —
      // so it is legible at a glance and at the far tiers, beside the one
      // verb that leaves the app. A page's title is deliberately nowhere on
      // this frame: it is the page's word, and a phishing page's first move.
      chrome={<>
        <span className="pf__summary browser-node__live" data-browser-url title={liveUrl ?? 'no page yet'}>
          {liveUrl === null ? (failure === null ? 'opening…' : 'no page') : liveUrl}
        </span>
        {readOnly ? null : (
          <button type="button" className="pf__verb pf__verb--word" data-browser-open
            title={`Open ${shown} in your browser`} aria-label="Open in browser"
            {...shellControl(() => { void window.canvas.links.open({ panelId: id, target: shown }) })}>Open in browser</button>
        )}
      </>}
      close={readOnly ? null : {
        armed: false,
        title: 'Close',
        armedText: 'close?',
        onMouseDown: (e: ReactMouseEvent) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) }
      }}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
    >
      <div className="pf__body browser-node__body" onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}>
        <div className="browser-node__bar">
          {/* M164 (finding 19): three icon controls, each NAMED (aria-label and
              title); every one always here, disabled with its reason rather than
              removed (this repo's rule). */}
          <button type="button" className="pf__verb icon-button" data-browser-back disabled={readOnly || !canBack}
            title={canBack ? 'Back' : 'nothing to go back to'} aria-label="Back"
            {...shellControl(() => { try { guestRef.current?.goBack() } catch { /* not attached */ } })}><ChevronLeft /></button>
          <button type="button" className="pf__verb icon-button" data-browser-forward disabled={readOnly || !canForward}
            title={canForward ? 'Forward' : 'nothing to go forward to'} aria-label="Forward"
            {...shellControl(() => { try { guestRef.current?.goForward() } catch { /* not attached */ } })}><ChevronRight /></button>
          <button type="button" className="pf__verb icon-button" data-browser-reload disabled={readOnly || guestId === null}
            title={guestId === null ? 'the page has not opened yet' : 'Reload'} aria-label="Reload"
            {...shellControl(() => { try { guestRef.current?.reload() } catch { /* not attached */ } })}><RotateCw /></button>
          {/* The DRAFT — what the person is typing — never the readout. Enter
              navigates through normaliseTypedUrl (a bare host gets http://),
              Escape puts the live address back. Mousedown and keydown stop
              here so the canvas neither drags nor hears the letters (the
              memory node's input, same shape). Cmd+C/V/Z from the MENU still
              reach the focused terminal: the fourth-text-surface entry in
              docs/load-bearing.md, inherited, not fixed. */}
          <input className="browser-node__address" data-browser-address value={draft} disabled={readOnly}
            spellCheck={false} placeholder="a URL, or a host like localhost:3000" aria-label="Address"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => { setDraft(e.target.value); if (failure !== null) setFailure(null) }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') { e.preventDefault(); submitAddress() }
              if (e.key === 'Escape') { e.preventDefault(); setDraft(liveUrl ?? panel.url) }
            }} />
          <span className="browser-node__loading" data-browser-loading={loading ? 'yes' : 'no'} aria-live="polite">{loading ? 'loading' : ''}</span>
        </div>
        {failure !== null && (
          <p className="pf__note browser-node__failure" data-browser-failure role="alert">{failure}</p>
        )}
        <div className="browser-node__host" ref={hostRef} />
      </div>
    </PanelFrame>
  )
}

export const BrowserNode = memo(BrowserNodeImpl)
