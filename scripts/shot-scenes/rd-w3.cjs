/* W3 (M451). Map tier, scrubber open, away card open.
   `{ name:` stays on one line so verify:meta visual.1 sees `run`.
   A missing golden is expected until Phase 4. Never UPDATE_GOLDENS. */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = [
  { name: 'rd-world-overview', reference: ['docs/redesign/mockups/14-world-overview.png'], intent: 'Map tier, near top-down, with the camera panel, replay scrubber and away card.',
    run: async (k) => {
      process.env.TC_FIXTURE = 'rd-steward'
      await k.loadMain()
      // The harness preference is light. Map tier is judged on the dark concept.
      await k.theme('dark')
      await k.zoom(0.18)
      const cast = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'rd-steward', 'workspace.json'), 'utf8'))
      const now = Date.now()
      const events = []
      for (const task of cast.tasks) {
        for (const panel of task.panels) {
          if (!panel.agent || typeof panel.world !== 'string') continue
          events.push({ agentId: panel.id, seq: 1, ts: now - 30 * 60_000, type: 'status', payload: panel.world, name: panel.name })
          if (typeof panel.line === 'string' && panel.line !== '') {
            events.push({ agentId: panel.id, seq: 2, ts: now - 20 * 60_000, type: 'message', payload: { text: panel.line }, name: panel.name })
          }
          if (panel.world === 'error') {
            events.push({ agentId: panel.id, seq: 3, ts: now - 10 * 60_000, type: 'error', payload: { message: panel.line || 'stopped' }, name: panel.name })
          }
        }
      }
      k.wc.send(k.shared.events.WORLD_EVENTS, events)
      for (let i = 0; i < 20; i++) {
        const clicked = await k.click('.shell__world-toggle')
        if (clicked) break
        await sleep(150)
      }
      for (let i = 0; i < 40; i++) {
        const ready = await k.js(`!!document.querySelector('.world-view canvas, .world-flat')`)
        if (ready) break
        await sleep(150)
      }
      await k.js(`window.__rdW3 && window.__rdW3.away(40 * 60 * 1000)`)
      await sleep(300)
      await k.click('[data-world-time-open]')
      await sleep(200)
      await k.click('[data-world-tier="map"]')
      await sleep(400)
      await k.shot('rd-world-overview')
    }
  }
]
