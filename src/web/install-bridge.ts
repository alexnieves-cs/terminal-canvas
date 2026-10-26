import cast from '../../scripts/fixtures/rd-steward/workspace.json'
import { createDemoBridge } from './fake-bridge'
import { installDemoChrome } from './demo-chrome'
import type { Cast } from './demo-layout'

/**
 * Lane N (M565). Puts the fake bridge where preload would have put the real
 * one. The cast is the rd-steward fixture's JSON, imported from its own
 * directory so the sample names stay there (its README).
 */
const chrome = installDemoChrome()
const demo = createDemoBridge({ cast: cast as Cast, notice: chrome.notice, appVersion: __TC_VERSION__ })
window.canvas = demo.bridge
// Read-only, for scripts/demo-smoke.cjs: what each terminal was sent.
;(window as unknown as { tcDemo: { transcript(panelId: string): string } }).tcDemo = { transcript: demo.transcript }
