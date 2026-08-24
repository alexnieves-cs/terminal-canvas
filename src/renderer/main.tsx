import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import type { CanvasState } from '@shared/layout-schema'
import { DEFAULT_CAMERA } from '@shared/layout-schema'
import { App } from './App'
import { installDropGuard } from './drop-guard'

// Installed before React mounts, and never uninstalled: an unhandled file drop
// navigates the renderer, which kills every PTY in the window. Nothing about
// that is React's concern, so it does not live in a component's effect.
installDropGuard()

const container = document.getElementById('root')
if (!container) throw new Error('#root missing from index.html')

// The starting canvas is awaited BEFORE the first render rather than loaded in
// an effect afterwards. useState is synchronous, so an async initial state
// would mean rendering an empty canvas first and running the whole tiering
// pass against it. The window is `show: false` until ready-to-show, so one IPC
// round trip is invisible.
//
// The side benefit outlives the reason: a Canvas that RECEIVES its starting
// state can be mounted by verify:panels against a known layout, instead of
// against whatever a hardcoded constant happens to say.
async function boot(): Promise<void> {
  // A failed load must still open a WORKING canvas. parseLayout never throws
  // and the store's initial() is built not to throw, precisely so a corrupt
  // file degrades instead of failing — but the IPC hop between them had no
  // such guarantee, and a rejection here means React never mounts and the
  // user gets a permanently blank window on the first frame. That is not
  // hypothetical: an unregistered layout:load handler produced exactly this
  // symptom in verify:canvas while M4b was being built.
  let initial: CanvasState
  try {
    initial = await window.canvas.layout.load()
  } catch (error: unknown) {
    console.error('[layout] could not load the saved canvas; opening a fresh one', error)
    // Empty panels, not a constructed fallback: Canvas already knows what an
    // empty canvas means (firstRunPanels()), so this reuses that path instead
    // of inventing a second "what does no data look like" decision.
    initial = { panels: [], camera: { ...DEFAULT_CAMERA }, selectedId: null, focusedId: null }
  }
  // Deliberately NOT wrapped in StrictMode. StrictMode double-invokes effects
  // in development, which for a terminal means spawning a PTY, killing it, and
  // spawning it again on every mount.
  createRoot(container!).render(<App initial={initial} />)
}

void boot()
