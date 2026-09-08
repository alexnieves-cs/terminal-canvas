/**
 * M103. The renderer's per-panel record of each browser pane's LIVE guest —
 * a module-level store keyed by panel id, `chat-store.ts`'s shape and for
 * its reason: nothing here may ride `registry.version()` (a browser panel is
 * not in the registry at all), and the two readers that need it — the
 * handoff hook's reload and the verb line's `read` — are not React and
 * cannot hold a ref into a node.
 *
 * Two facts per id, both set by the node on `did-attach` and both cleared
 * at every panel-removing site through `clearBrowser` (the same four sites
 * `disposeWatcher` is called from), or a recycled id inherits a dead guest's
 * id and main answers `that id is not a page in a browser panel` for a panel
 * that plainly has one:
 *
 *  - `webContentsId`, the guest's own, which `browser:read` names so main
 *    can resolve the guest and check it IS a webview before reading;
 *  - `reload`, the node's handle on the guest, which an `exit-ok` edge into
 *    the panel calls (`useHandoff.ts`). `reloadBrowser` answers whether a
 *    live guest took it, so the edge's row can say `skipped` by name.
 */

interface LiveGuest {
  webContentsId: number
  reload: () => void
  /**
   * M186 (M185's critic, finding 2). NAVIGATE, which is not reload. The guest's
   * `src` is set once from a ref and the effect is keyed on the panel id
   * alone (rebuilding the guest on every navigation is the failure M103's own
   * comment names), so writing a new url onto the RECORD moves nothing: the
   * pane reloaded the page it already had, `did-navigate` then wrote the old
   * url back over the record, and `preview-open <url>` answered `ran` while
   * the person looked at the old page.
   */
  navigate: (url: string) => void
}

const guests = new Map<string, LiveGuest>()

export function registerBrowser(id: string, guest: LiveGuest): void {
  guests.set(id, guest)
}

export function clearBrowser(id: string): void {
  guests.delete(id)
}

/**
 * M186. Point a live guest at a url, answering whether one took it — so a
 * caller with no guest (a pane whose node has not attached yet) can say so
 * rather than reporting a navigation that did not happen.
 */
export function navigateBrowser(id: string, url: string): boolean {
  const guest = guests.get(id)
  if (guest === undefined) return false
  guest.navigate(url)
  return true
}

/** The guest's webContents id, or undefined before `did-attach` and after the node unmounted. */
export function browserGuestId(id: string): number | undefined {
  return guests.get(id)?.webContentsId
}

/** Reload the live page; false when there is no live guest to reload. */
export function reloadBrowser(id: string): boolean {
  const guest = guests.get(id)
  if (guest === undefined) return false
  guest.reload()
  return true
}
