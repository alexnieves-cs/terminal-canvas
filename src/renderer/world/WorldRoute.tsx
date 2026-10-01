import { Component, lazy, Suspense, useEffect, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import { useAgentIds } from './agent-world-store'

/**
 * The dev-only route to the 3D world view: `#/world`.
 *
 * A hash, not a path: the renderer is one page with no router, and its
 * `index.html` loads `./main.tsx` RELATIVELY, so a served `/world` would ask for
 * `/world/main.tsx` and get the page back as a "module". Open it from a running
 * dev app with `location.hash = '#/world'` in DevTools, or start there with
 * `TC_WORLD=1 npm run dev` (main/bootstrap/window.ts appends the hash).
 *
 * It is an OVERLAY over the canvas, not a replacement for it. Canvas owns every
 * terminal's xterm and PTY, and a view that unmounted it to show a scene would
 * detach them all; the 2D canvas keeps running underneath, covered.
 *
 * App.tsx mounts this only under `import.meta.env.DEV`, and the `lazy()` below
 * is marked pure so a production build drops this module — and the whole
 * three.js chunk behind it — instead of shipping a route nobody can reach.
 * The WorldView import is lazy for the reason CLAUDE.md's library table gives.
 */
const WORLD_HASH = '#/world'

const WorldView = /* @__PURE__ */ lazy(async () => ({ default: (await import('./WorldView')).WorldView }))

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function close(): void {
  // Back to the bare page without leaving a trailing '#' or adding a history entry.
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** A context the browser could not give (no GPU, a lost context) must not blank the app under it. */
class WorldBoundary extends Component<{ children: ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null }
  static getDerivedStateFromError(error: unknown): { failed: string } {
    return { failed: error instanceof Error ? error.message : String(error) }
  }
  render(): ReactNode {
    return this.state.failed === null
      ? this.props.children
      : <p className="world-route__note" role="alert">The world view could not start: {this.state.failed}</p>
  }
}

export function WorldRoute(): JSX.Element | null {
  const open = useSyncExternalStore(subscribeHash, () => window.location.hash === WORLD_HASH, () => false)
  const agents = useAgentIds().length

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return (
    <div className="world-route" role="dialog" aria-label="World view" data-world-route>
      <WorldBoundary>
        <Suspense fallback={<p className="world-route__note">Loading the world…</p>}>
          <WorldView />
        </Suspense>
      </WorldBoundary>
      {agents === 0 ? (
        <p className="world-route__note" data-world-empty>
          No agents yet. Start the app with <code>SIMULATE_AGENTS=true</code> to feed the world a scripted session.
        </p>
      ) : null}
      <button type="button" className="world-route__close" onClick={close} aria-label="Close the world view">Close</button>
    </div>
  )
}
