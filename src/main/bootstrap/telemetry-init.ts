import { app } from 'electron'
import { telemetryPlan, scrubEvent } from '../telemetry'
import type { Stores } from './stores'
import type { MainState } from './context'

/**
 * M112. Telemetry, if and only if a DSN is here. Called AFTER the store loads
 * (the setting lives there) and BEFORE the window exists (the renderer learns
 * the decision as an argv flag, not a channel), and it writes its answer to
 * `state.telemetryOn` for `createWindow` to read. The ~100 ms of boot above
 * this call is uncovered, and that is the trade. The minidump integration —
 * process memory — rides only on its own setting.
 *
 * Fix round 1 (review, IMPORTANT 1): `@sentry/electron/main` pulls in all of
 * `@sentry/node`, and `externalizeDepsPlugin` leaves that as a real
 * `require()` in `out/main/index.js` — a static top-level import would run it
 * on EVERY launch, DSN or not, which is exactly the load the posture ("no
 * process may load or initialise the SDK at all" with no DSN) forbids. The
 * dynamic `import()` below only executes once `plan.on` is true, matching the
 * shape `renderer/main.tsx` already used. Moving this into its own module
 * does NOT weaken that: the import is still inside the branch, and a module
 * that is imported is not a module whose dynamic import has run.
 */
export async function initTelemetry(state: MainState, stores: Stores): Promise<void> {
  const plan = telemetryPlan((id) => stores.layoutStore.getSetting(id))
  if (!plan.on) {
    console.log(`[startup] telemetry=off (${plan.reason})`)
    return
  }
  // Fix round 1 (review, IMPORTANT 2): this runs inside
  // `app.whenReady().then(async () => {…})` with no `.catch` on that chain,
  // and `createWindow()` is called after it. A DSN that passes
  // telemetryPlan's regex but upsets the SDK (or a minidump handler that
  // fails to install) would otherwise throw here, becoming an unhandled
  // rejection that leaves the app permanently window-less — the exact
  // failure mode `renderer/main.tsx`'s own neighbouring comment already
  // names as "not hypothetical", now reachable from an opt-in diagnostics
  // feature nobody asked to depend on for the app to open at all. Caught,
  // logged, and `telemetryOn` stays false: a failed telemetry init must
  // degrade to off, never to a blank window.
  try {
    const { init: sentryInit, IPCMode, onUncaughtExceptionIntegration, onUnhandledRejectionIntegration, electronMinidumpIntegration, linkedErrorsIntegration, functionToStringIntegration } = await import('@sentry/electron/main')
    const paths = { userData: app.getPath('userData'), home: app.getPath('home') }
    const integrations = [onUncaughtExceptionIntegration(), onUnhandledRejectionIntegration(), linkedErrorsIntegration(), functionToStringIntegration()]
    if (plan.nativeCrashes) integrations.push(electronMinidumpIntegration())
    sentryInit({
      dsn: plan.dsn,
      release: `terminal-canvas@${app.getVersion()}`,
      sendDefaultPii: false,
      defaultIntegrations: false,
      integrations,
      // Classic rides Electron IPC to main, which holds the DSN and the
      // scrubber. Protocol mode registers a `sentry-ipc://` handler the
      // renderer CSP (`default-src 'self'`) would refuse with no error —
      // so the mode is named here, never left at the SDK's own default
      // (`Both`). This is a MAIN-only option in the real 7.18.0 types
      // (`ElectronMainOptions`, not `ElectronRendererOptions`): it
      // decides how main LISTENS, so `main.tsx`'s renderer-side
      // `init()` call takes no `ipcMode` at all — passing one there
      // does not typecheck. What DOES need pairing on that side is
      // `preload/index.ts`'s `hookupIpc()` call (fix round 1, CRITICAL):
      // Classic mode with nothing exposing `window.__SENTRY_IPC__`
      // means the renderer falls back to fetching `sentry-ipc://…`,
      // which the CSP refuses with no error — the silent failure this
      // feature exists to avoid.
      ipcMode: IPCMode.Classic,
      // Fix round 1 (review, MINOR 1): `scrubEvent` returns `Dict | null`
      // (`Record<string, unknown> | null`), which is not provably
      // related to Sentry's `Event` type — going through `unknown`
      // makes that widening explicit rather than asserting a direct
      // relationship that does not exist. `scrubEvent` itself is
      // Task 3's and stays unmodified.
      beforeSend: (event) => scrubEvent(event, paths) as unknown as typeof event | null,
      beforeBreadcrumb: () => null
      // M112 review, IMPORTANT 1: `beforeSend` only sees envelopes the SDK
      // resolves to an EVENT (`node_modules/@sentry/electron/main/ipc.js`'s
      // `handleEnvelope`, confirmed against the installed 7.18.0 tree).
      // Profile chunks, span containers and replay envelopes take a
      // different branch of that function straight to
      // `getTransport().send(...)` — `scrubEvent` never runs on them. This
      // is safe TODAY only because `renderer/main.tsx`'s own `init()` call
      // passes `defaultIntegrations: false` plus exactly
      // `globalHandlersIntegration()`, which manufactures error events and
      // nothing else. The natural next edit to that call —
      // `replayIntegration()`, `browserTracingIntegration()`, or the logs
      // integration, any of which starts emitting a type `beforeSend`
      // cannot see — would export renderer data around this allowlist with
      // NO symptom: no failed check, no thrown error, just unscrubbed
      // bytes on the wire. `verify:meta telemetry.5` pins that
      // `globalHandlersIntegration` is *named* in that call; it does not
      // and cannot pin that nothing else is. Whoever adds a second
      // renderer integration must widen `scrubEvent` (or gate the new
      // envelope kind before it reaches the transport) in the same change.
    })
    state.telemetryOn = true
    console.log(`[startup] telemetry=on nativeCrashes=${plan.nativeCrashes}`)
  } catch (error: unknown) {
    console.error('[startup] telemetry failed to initialise; continuing without it', error)
  }
}
