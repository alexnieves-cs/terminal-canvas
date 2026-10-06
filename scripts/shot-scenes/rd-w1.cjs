/* W1 (M449). The canvas-to-world move, frozen by the one clock's shot door.
   `{ name:` stays on one line so verify:meta visual.1 sees `run`.
   A missing golden is expected until Phase 4. Never UPDATE_GOLDENS. */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function cast(k) {
  process.env.TC_FIXTURE = 'rd-steward'
  await k.loadMain()
  const layout = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'rd-steward', 'workspace.json'), 'utf8'))
  const now = Date.now()
  const events = []
  for (const task of layout.tasks ?? []) {
    for (const panel of task.panels ?? []) {
      if (!panel.agent || typeof panel.world !== 'string') continue
      events.push({ agentId: panel.id, seq: 1, ts: now, type: 'status', payload: panel.world, name: panel.name })
      if (typeof panel.line === 'string' && panel.line !== '') {
        events.push({ agentId: panel.id, seq: 2, ts: now, type: 'message', payload: { text: panel.line }, name: panel.name })
      }
    }
  }
  if (events.length > 0) k.wc.send(k.shared.events.WORLD_EVENTS, events)
}

async function enter(k, atMs) {
  await k.js(`window.__rdW1 = { atMs: ${atMs} }`)
  for (let i = 0; i < 20; i++) {
    const clicked = await k.click('.shell__world-toggle')
    if (clicked) break
    await sleep(150)
  }
  for (let i = 0; i < 40; i++) {
    const ready = await k.js(`(() => {
      const chip = document.querySelector('[data-world-cancel]')
      const host = document.querySelector('.canvas')
      return !!chip && chip.hidden === false && !!host && host.classList.contains('canvas--behind-world')
    })()`)
    if (ready) return
    await sleep(150)
  }
}

module.exports = [
  { name: 'rd-world-transition', reference: ['docs/redesign/mockups/10-world-transition.png'], intent: 'Canvas to World, frozen at 550ms, with the cancel chip, the filmstrip and the 2D | World lens.',
    run: async (k) => {
      await cast(k)
      await enter(k, 550)
      const host = await k.js(`(() => { const c = document.querySelector('.canvas'); if (!c) return null; return { mounted: c.isConnected, inert: c.inert, panels: document.querySelectorAll('.panel').length } })()`)
      if (host === null || host.mounted !== true || host.panels < 1) throw new Error(`rd-world-transition: the canvas unmounted during the move (${JSON.stringify(host)})`)
      await k.shot('rd-world-transition')
    }
  },
  { name: 'rd-world-transition-rm', reference: ['docs/redesign/mockups/10-world-transition.png'], intent: 'The same move under reduced motion: a 120ms cross-fade, frozen at mid-fade, no dolly.',
    run: async (k) => {
      await cast(k)
      await k.wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      for (let i = 0; i < 20; i++) {
        const on = await k.js(`window.matchMedia('(prefers-reduced-motion: reduce)').matches`)
        if (on) break
        await sleep(50)
      }
      await enter(k, 60)
      const tilt = await k.js(`document.querySelector('.canvas')?.style.transform ?? ''`)
      if (typeof tilt === 'string' && /rotateX\(/.test(tilt)) throw new Error(`rd-world-transition-rm: reduced motion tilted the plan (${tilt})`)
      await k.shot('rd-world-transition-rm')
    }
  }
]
