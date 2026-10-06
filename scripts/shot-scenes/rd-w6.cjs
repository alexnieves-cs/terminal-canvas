/* W6 (M454). The flat room, probe forced off.
   `{ name:` stays on one line so verify:meta visual.1 sees `run`.
   A missing golden is expected until Phase 4. Never UPDATE_GOLDENS.
   The probe is stubbed here, not in webgl-probe.ts (R-082). */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = [
  { name: 'rd-world-flat', reference: ['docs/redesign/mockups/11-world-main.png'], intent: 'The flat room with the probe off. Judge the words and the doors, not the 3D picture.',
    run: async (k) => {
      process.env.TC_FIXTURE = 'rd-steward'
      await k.loadMain()
      // A context that does not present still makes the probe say yes (R-082).
      // Returning null for the GL types is the probe's own "no", so the flat
      // room mounts. 2D contexts the terminals already hold are left alone.
      await k.js(`(() => {
        const proto = HTMLCanvasElement.prototype
        const orig = proto.getContext
        proto.getContext = function (type, ...args) {
          if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
          return orig.apply(this, [type, ...args])
        }
      })()`)
      const cast = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'rd-steward', 'workspace.json'), 'utf8'))
      const now = Date.now()
      const events = []
      for (const task of cast.tasks) {
        for (const panel of task.panels) {
          if (!panel.agent || typeof panel.world !== 'string') continue
          events.push({ agentId: panel.id, seq: 1, ts: now, type: 'status', payload: panel.world, name: panel.name })
          if (typeof panel.line === 'string' && panel.line !== '') {
            events.push({ agentId: panel.id, seq: 2, ts: now, type: 'message', payload: { text: panel.line }, name: panel.name })
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
        const ready = await k.js(`!!document.querySelector('[data-world-flat]') && !!document.querySelector('[data-world-no-webgl]')`)
        if (ready) break
        await sleep(150)
      }
      // A non-waiting tile, so Open in Canvas is on screen with the terraces.
      await k.click('[data-world-flat-tile][data-status="idle"] .world-flat__pick, [data-world-flat-tile][data-status="working"] .world-flat__pick')
      // The host fade is WORLD_TRANSITION_MS (1000).
      await sleep(1400)
      await k.shot('rd-world-flat')
    }
  }
]
