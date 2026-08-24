/**
 * Stops a stray file drop from taking down every running agent.
 *
 * Dropping a file onto an Electron renderer navigates the page to `file://…`
 * by default. `attachPtyLifecycle` (main/window-lifecycle.ts) kills a window's
 * PTYs on `did-start-navigation` — deliberately, so Cmd+R cannot orphan a
 * shell — so the two behaviours compose into a bad one: a file dragged onto
 * the canvas from Finder does not "do nothing", it kills every session and
 * reloads the canvas empty, with no error anywhere explaining why.
 *
 * Both listeners are required and they cancel different things. `dragover` is
 * what tells the browser this is a valid drop target at all; cancel only
 * `drop` and the default navigation still happens. Cancel only `dragover` and
 * the drop fires uncancelled. verify:canvas checks 5 and 6 assert each half
 * separately for exactly that reason.
 *
 * This is a guard, not a feature. When drag-and-drop of images into a session
 * is actually built (see docs/ideas-backlog.md #13), it hangs off these same
 * events — the handlers gain behaviour, but they must keep cancelling.
 */
export function installDropGuard(doc: Document = document): () => void {
  const block = (event: DragEvent): void => event.preventDefault()
  doc.addEventListener('dragover', block)
  doc.addEventListener('drop', block)
  return () => {
    doc.removeEventListener('dragover', block)
    doc.removeEventListener('drop', block)
  }
}
