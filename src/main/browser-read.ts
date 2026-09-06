import { outward } from '../shared/outward'
import { BROWSER_READ_MAX_BYTES, browserHost, browserRefusal, isReadableUrl, REASON_NO_LIVE_PAGE, type BrowserReadRequest, type BrowserReadResult } from '../shared/browser-panel'

/**
 * M103. READING THE PANE IS LEAVING THE APP.
 *
 * The browser pane's text — `document.body.innerText` of the guest — goes to
 * a plan's `read` or an agent's context, and both are readers the outward
 * gate (M96) exists for. So the read is main's, in one module, and three
 * things happen here and nowhere else:
 *
 *  1. The SCHEME is checked on the guest's live `getURL()`, not on the
 *     record's url and not only at navigation: a page can redirect itself to
 *     `data:`, and `about:blank` is what a guest reads as between pages. A
 *     `file:`, `data:`, `about:` or `chrome:` page is refused BY NAME before
 *     any script is evaluated (`verify:file browser.1` counts evaluations).
 *  2. The text is CAPPED at `BROWSER_READ_MAX_BYTES` — inside the guest, so
 *     a megabyte never crosses the process boundary — and the cut is
 *     reported as `truncated`, never silent.
 *  3. The text passes `outward(text, 'a remote page at <host>')`, so a token
 *     a page happens to show is scrubbed and the note says the content is a
 *     remote page's, which is what the plan's confirmation reads out.
 *
 * `readBrowserPage` is pure over injected `getUrl`/`evaluate` and is what the
 * plain-node suite drives; `createBrowserHandlers` is the electron adapter
 * over `webContents.fromId`, and is the ONLY place in `src/` that calls
 * `executeJavaScript` (`verify:verbs gate.3` pins that as text).
 */
export interface BrowserReadDeps {
  getUrl: () => string
  evaluate: (code: string) => Promise<unknown>
}

/** The one expression evaluated in a guest. The cap rides INSIDE it so the bytes never cross. */
export const BROWSER_READ_SCRIPT = `(() => { const t = document.body ? document.body.innerText : ''; return { text: t.slice(0, ${BROWSER_READ_MAX_BYTES}), truncated: t.length > ${BROWSER_READ_MAX_BYTES} } })()`

export async function readBrowserPage(deps: BrowserReadDeps): Promise<BrowserReadResult> {
  const url = deps.getUrl()
  if (!isReadableUrl(url)) return { kind: 'refused', reason: browserRefusal(url) }
  let answer: unknown
  try {
    answer = await deps.evaluate(BROWSER_READ_SCRIPT)
  } catch (error) {
    return { kind: 'refused', reason: `the page did not answer: ${error instanceof Error ? error.message : String(error)}` }
  }
  // A guest answers with whatever the page's script left — a page can
  // redefine `document.body`. Anything but the shape asked for is refused,
  // never coerced to `[object Object]`. A bare string is accepted too, so a
  // fixture (or an older guest) that answers with the text alone still reads.
  const shaped = typeof answer === 'string' ? { text: answer, truncated: false } : answer
  if (typeof shaped !== 'object' || shaped === null || typeof (shaped as { text?: unknown }).text !== 'string') {
    return { kind: 'refused', reason: 'the page did not answer with text' }
  }
  const raw = (shaped as { text: string; truncated?: unknown }).text
  // The guest's slice is by UTF-16 units; the cap is bytes. A second cut
  // here, by bytes, is what makes the ceiling a ceiling for a page of CJK —
  // and for a fixture that hands the whole text in without the guest's slice.
  let text = raw
  let truncated = (shaped as { truncated?: unknown }).truncated === true
  if (Buffer.byteLength(text, 'utf8') > BROWSER_READ_MAX_BYTES) {
    text = Buffer.from(text, 'utf8').subarray(0, BROWSER_READ_MAX_BYTES).toString('utf8').replace(/�$/, '')
    truncated = true
  }
  const gate = outward(text, `a remote page at ${browserHost(url)}`)
  return {
    kind: 'read',
    text: gate.text,
    note: truncated ? `${gate.note} · cut at ${Math.round(BROWSER_READ_MAX_BYTES / 1024)} KB` : gate.note,
    url,
    truncated,
    redacted: gate.redacted
  }
}

/** What the adapter needs from a guest: electron's WebContents, structurally. */
export interface GuestContents {
  getURL(): string
  executeJavaScript(code: string): Promise<unknown>
  /** `'webview'` for a guest; anything else is not a page in a browser panel. */
  getType?(): string
  isDestroyed?(): boolean
}

export interface BrowserHandlers {
  read(req: BrowserReadRequest): Promise<BrowserReadResult>
}

/**
 * The electron adapter. `guestOf` is `webContents.fromId` in main; the id is
 * the renderer's hint and is checked to name a live WEBVIEW guest, so a
 * renderer that guessed the main window's own id reads nothing.
 */
export function createBrowserHandlers(deps: { guestOf: (id: number) => GuestContents | null | undefined }): BrowserHandlers {
  return {
    read: async (req) => {
      if (typeof req !== 'object' || req === null || typeof req.webContentsId !== 'number') return { kind: 'refused', reason: REASON_NO_LIVE_PAGE }
      const guest = deps.guestOf(req.webContentsId)
      if (guest === null || guest === undefined || guest.isDestroyed?.() === true) return { kind: 'refused', reason: REASON_NO_LIVE_PAGE }
      if (guest.getType !== undefined && guest.getType() !== 'webview') return { kind: 'refused', reason: 'that id is not a page in a browser panel' }
      return readBrowserPage({ getUrl: () => guest.getURL(), evaluate: (code) => guest.executeJavaScript(code) })
    }
  }
}
