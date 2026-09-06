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
}

const guests = new Map<string, LiveGuest>()

export function registerBrowser(id: string, guest: LiveGuest): void {
  guests.set(id, guest)
}

export function clearBrowser(id: string): void {
  guests.delete(id)
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
