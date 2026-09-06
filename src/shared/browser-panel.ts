/**
 * M103. THE BROWSER PANE'S PURE RULES — shared by the layout parser (a url
 * that is not http(s) is a malformed record), the node (the address bar
 * normalises what is typed to the same rule), and main's read path (the
 * scheme is checked AGAIN there, on the page's live `getURL()`, because a
 * navigation gate alone leaves `about:blank` and a page's own `data:`
 * redirect readable). One predicate, three doors, so the doors cannot drift.
 *
 * Pure: no DOM, no node. Plain-node checked in `verify:file browser.1` and
 * `verify:layout browser.1`.
 */

/**
 * The most a read hands back. A page's `innerText` can be megabytes (a log
 * viewer, a long changelog) and the reader is a plan's `read` or an agent's
 * context, neither of which wants a megabyte: the head is what a person
 * would read first, and the cut is REPORTED (`truncated`) rather than
 * silent, the file panel's own rule.
 */
export const BROWSER_READ_MAX_BYTES = 64 * 1024

/**
 * True only for `http:` and `https:`. Spelled as a parse rather than a
 * prefix test so `HTTP://` and a scheme hidden behind whitespace answer the
 * same as their plain forms — and so `javascript:`, `file:`, `data:`,
 * `about:` and `chrome:` are all the one `false`, refused BY NAME by the
 * caller through `browserRefusal`.
 */
export function isReadableUrl(url: string): boolean {
  let parsed: URL
  try { parsed = new URL(url.trim()) } catch { return false }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

/** The host a read is attributed to in the outward note, or the scheme when there is none. */
export function browserHost(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.host !== '' ? parsed.host : parsed.protocol
  } catch { return 'an unknown host' }
}

/**
 * Why a page cannot be read or opened, in a sentence that names the SCHEME.
 * `file:` is the user's disk, `data:` a page nobody can name, `about:` and
 * `chrome:` the browser's own; each gets its own sentence because "not a web
 * page" beside `about:blank` tells a person nothing they can act on.
 */
export function browserRefusal(url: string): string {
  const scheme = (/^\s*([a-z][a-z0-9+.-]*):/i.exec(url)?.[1] ?? '').toLowerCase()
  switch (scheme) {
    case 'file': return 'a file: page is your own disk — this pane reads http(s) pages only'
    case 'data': return 'a data: page has no host to name — this pane reads http(s) pages only'
    case 'about': return `an about: page (${url.trim()}) is the browser's own, not a page — this pane reads http(s) pages only`
    case 'chrome': return 'a chrome: page is the browser\'s own, not a page — this pane reads http(s) pages only'
    case 'javascript': return 'a javascript: url runs script rather than opening a page — refused'
    case '': return url.trim() === '' ? 'no page is open' : `${url.trim()} is not a URL — this pane reads http(s) pages only`
    default: return `a ${scheme}: page is not one this pane opens — http(s) pages only`
  }
}

/**
 * What the address bar turns typed text into: a bare host or host:port gets
 * `http://` (a dev server is the ordinary case, and a person types
 * `localhost:3000`), a full http(s) URL passes, and everything else is
 * refused through `browserRefusal` — never coerced, so `file:///tmp` does not
 * become `http://file:///tmp`.
 */
export function normaliseTypedUrl(text: string): { kind: 'url'; url: string } | { kind: 'refused'; reason: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'refused', reason: 'type a URL or a host' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return isReadableUrl(trimmed) ? { kind: 'url', url: new URL(trimmed).href } : { kind: 'refused', reason: browserRefusal(trimmed) }
  }
  const withScheme = `http://${trimmed}`
  return isReadableUrl(withScheme) ? { kind: 'url', url: new URL(withScheme).href } : { kind: 'refused', reason: `${trimmed} is not a host this pane can open` }
}

/** The sentences every surface says a refusal with. */
export const REASON_NO_LIVE_PAGE = 'the browser panel has no live page yet'

/** M103. `browser:read`'s request: the panel and the guest the renderer registered for it. */
export interface BrowserReadRequest {
  panelId: string
  /**
   * The guest's `getWebContentsId()`, learned by the node on `did-attach`.
   * Main resolves it and checks it IS a webview guest before reading — the
   * id is a hint the renderer supplies, not an authority.
   */
  webContentsId: number
}

/**
 * Three arms, never two: a page read (with the outward note and the REAL url
 * it was read at), or a refusal that names why. `truncated` is reported, not
 * implied by the length.
 */
export type BrowserReadResult =
  | { kind: 'read'; text: string; note: string; url: string; truncated: boolean; redacted: number }
  | { kind: 'refused'; reason: string }
