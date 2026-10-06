/* W0 (M448). The night studio at the Plan tier, fed by the steward cast.
   `{ name:` stays on one line so verify:meta visual.1 sees `run`.
   A missing golden is expected until Phase 4. Never UPDATE_GOLDENS. */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = [
  { name: 'rd-world-night', reference: ['docs/redesign/mockups/11-world-main.png'], intent: 'The World at Plan tier in the night studio, state colour only, agents at their tasks.',
    run: async (k) => {
      process.env.TC_FIXTURE = 'rd-steward'
      await k.loadMain()
      // The harness preference is light. The night studio is the dark concept.
      await k.theme('dark')
      await k.zoom(0.34)
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
        const ready = await k.js(`!!document.querySelector('.world-view canvas')`)
        if (ready) break
        await sleep(150)
      }
      await sleep(900)
      await k.shot('rd-world-night')
    }
  }
]
