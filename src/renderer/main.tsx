import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import type { CanvasState } from '@shared/layout-schema'
import type { PresetTemplate } from '@shared/ipc-contract'
import { DEFAULT_CAMERA } from '@shared/layout-schema'
import { App } from './App'
import { installDropGuard } from './drop-guard'

// Installed before React mounts, and never uninstalled: an unhandled file drop
// navigates the renderer, which kills every PTY in the window. Nothing about
// that is React's concern, so it does not live in a component's effect.
installDropGuard()

const container = document.getElementById('root')
if (!container) throw new Error('#root missing from index.html')

/**
 * What Cmd+N spawns, pushed by main and caught BEFORE React exists.
 *
 * The subscription is at module scope, ahead of boot()'s first await, and the
 * ordering that makes it work is a guarantee rather than a wider race window:
 * module script evaluation finishes before the page's load event, and main
 * sends PRESET_DEFAULT from did-finish-load, which follows that load event.
 * boot() then awaits TWO IPC round trips (layout.load, pty.list) before the
 * first render, so Canvas.tsx's own subscription — inside an effect, at least
 * two macrotask hops later — does not exist yet when the push arrives. It
 * subscribed, the event landed with no listener, and nothing ever re-pushed:
 * a hand-edited "defaultPresetId": "claude" gave a login shell forever, with
 * nothing in any log, because makePanel's fallback is byte-identical to the
 * built-in shell preset that the default usually is.
 *
 * Never unsubscribed: it lives exactly as long as the page does, and a later
 * re-push (the presets or the default changing at runtime) has to keep
 * arriving. Canvas KEEPS its own subscription for that case — this one only
 * has to win the boot race, and the template it caught reaches Canvas as a
 * prop, the same way `initial` and `liveSessionIds` do.
 */
let defaultTemplate: PresetTemplate | undefined
window.canvas.preset.onDefault((template) => {
  defaultTemplate = template
})

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
  // M112. The renderer's Sentry, gated on the bridge field main stamped. Off
  // (the default) installs nothing — no global handlers, no console patching
  // — so a process that will never send never sees a byte. Inside boot()
  // rather than a top-level await: main.tsx is a module evaluated before
  // React exists, and a top-level await here would delay the Cmd+N
  // subscription above by an unknown amount, reopening the exact race that
  // subscription's own comment documents.
  if (window.canvas.telemetry.enabled) {
    // No `ipcMode` here: it is a main-process-only option (real 7.18.0
    // types put it on `ElectronMainOptions`, not `ElectronRendererOptions`)
    // and main already pinned Classic in its own sentryInit call. What DOES
    // belong on this side of that pairing is `preload/index.ts`'s
    // `hookupIpc()` (fix round 1, CRITICAL): without it `window.__SENTRY_IPC__`
    // is never exposed into this world, and this init() would fall back to
    // fetching `sentry-ipc://…` — refused by the CSP with no error.
    //
    // Fix round 1 (review, CRITICAL, second half): `defaultIntegrations:
    // false` with no `integrations` here installed NOTHING — not even the
    // global error/rejection handlers an error-reporting SDK exists for.
    // `globalHandlersIntegration` is the one this process actually needs;
    // it is a real export of this SDK's renderer entry (confirmed against
    // the installed package, re-exported from `@sentry/browser`).
    const { init, globalHandlersIntegration } = await import('@sentry/electron/renderer')
    init({ defaultIntegrations: false, integrations: [globalHandlersIntegration()], beforeBreadcrumb: () => null })
  }

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
    initial = { panels: [], groups: [], camera: { ...DEFAULT_CAMERA }, selectedId: null, focusedId: null, bookmarks: [], runs: [] }
  }
  // Which panels already have a process behind them.
  //
  // THE RULE THIS SETTLES: dormancy is about SPAWNING, not attaching. A panel
  // with a live tmux session has nothing to spawn, so M4b's "restored panels
  // are dormant" rule does not apply to it — it reattaches when tiering makes
  // it live, exactly as an M3 panel does, and LIVE_BUDGET still caps how many
  // at once. A panel with no live session restores dormant exactly as before.
  //
  //   dormant       — has no process yet; a click is what creates one.
  //   reattachable  — has a process; it only needs a client.
  //
  // This does not disturb lod.ts's "dormancy outranks focus" rule, because a
  // reattachable panel is not dormant and never consults that precedence.
  let liveSessionIds = new Set<string>()
  try {
    const sessions = await window.canvas.pty.list()
    liveSessionIds = new Set(sessions.map((s) => s.panelId))
  } catch (error: unknown) {
    // An empty set means "everything restores dormant" — the M4b behaviour,
    // which is the safe direction to fail in: it spawns nothing.
    console.warn('[boot] could not list live sessions; restoring every panel dormant', error)
  }

  // Every panel id in every workspace, not just the active one.
  //
  // nextIdRef seeds from this. Seeding from `initial.panels` alone was correct
  // while there was exactly one workspace and is a defect the moment there is
  // more than one: PanelId doubles as the tmux session name, so Cmd+N in
  // workspace B could mint an id workspace A is already using, and the second
  // panel to go live would attach to the first one's process — with nothing
  // visibly wrong on either panel. This is the id-collision defect M4a fixed
  // by removing length-derived ids, reachable again through a door M4a could
  // not see.
  let allPanelIds: string[] = initial.panels.map((p) => p.id)
  try {
    const rows = await window.canvas.workspace.list()
    allPanelIds = rows.flatMap((w) => w.panelIds)
  } catch (error: unknown) {
    // Degrades to the active workspace's ids — the M4b behaviour. The failure
    // direction matters: a SHORTER list can collide, so this is logged loudly
    // rather than swallowed.
    console.warn('[boot] could not list workspaces; ids seed from this canvas only', error)
  }

  // Deliberately NOT wrapped in StrictMode. StrictMode double-invokes effects
  // in development, which for a terminal means spawning a PTY, killing it, and
  // spawning it again on every mount.
  // defaultTemplate is read HERE, at render time, not captured earlier: the
  // push may have landed at any point during the three awaits above.
  createRoot(container!).render(
    <App
      initial={initial}
      liveSessionIds={liveSessionIds}
      defaultTemplate={defaultTemplate}
      allPanelIds={allPanelIds}
    />
  )
}

void boot()
