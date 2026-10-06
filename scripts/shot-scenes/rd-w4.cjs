/* W4 (M452). Close-up: Codex picked, a request pending, the sheet open.
   `{ name:` stays on one line so verify:meta visual.1 sees `run`.
   A missing golden is expected until Phase 4. Never UPDATE_GOLDENS.
   The WebGL layer reads back blank on this host (R-053). The sheet is DOM. */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = [
  { name: 'rd-world-focus', reference: ['docs/redesign/mockups/12-world-focus.png'], intent: 'A picked agent, camera in, focus sheet open on a pending request.',
    run: async (k) => {
      process.env.TC_FIXTURE = 'rd-steward'
      await k.loadMain()
      await k.zoom(0.18)
      const cast = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'rd-steward', 'workspace.json'), 'utf8'))
      const now = Date.now()
      const events = []
      let pending = null
      let taskTitle = ''
      let steps = []
      for (const task of cast.tasks) {
        for (const panel of task.panels) {
          if (!panel.agent || typeof panel.world !== 'string') continue
          events.push({ agentId: panel.id, seq: 1, ts: now - 30 * 60_000, type: 'status', payload: panel.world, name: panel.name })
          if (typeof panel.line === 'string' && panel.line !== '') {
            events.push({ agentId: panel.id, seq: 2, ts: now - 20 * 60_000, type: 'message', payload: { text: panel.line }, name: panel.name })
          }
          if (panel.world === 'waiting_approval' && pending === null) {
            pending = panel
            taskTitle = task.title
            steps = (task.criteria ?? []).map((item, index) => ({
              id: String(index),
              title: item.text,
              word: item.done ? 'Finished — not verified' : 'Working',
              tone: item.done ? 'done' : 'working'
            }))
          }
        }
      }
      k.wc.send(k.shared.events.WORLD_EVENTS, events)
      for (let i = 0; i < 20; i++) {
        const clicked = await k.click('.shell__world-toggle')
        if (clicked) break
        await sleep(150)
      }
      const name = pending?.name ?? ''
      for (let i = 0; i < 40; i++) {
        const ready = await k.js(`!!document.querySelector('.world-view canvas, .world-flat') && !!window.__rdW4 && document.body.innerText.includes(${JSON.stringify(name)})`)
        if (ready) break
        await sleep(150)
      }
      const preview = pending === null ? null : {
        agentId: pending.id,
        question: pending.line,
        diff: 'export function streamCsv(rows) {\n  return rows.join("\\n")\n}',
        requestId: 'rd-w4',
        taskTitle,
        steps,
        facts: {
          ...(typeof pending.model === 'string' ? { model: pending.model } : {}),
          ...(typeof pending.branch === 'string' ? { branch: pending.branch } : {})
        }
      }
      const opened = await k.js(`(() => {
        const door = window.__rdW4
        if (!door) return false
        const preview = ${JSON.stringify(preview)}
        if (preview) door.show(preview)
        door.focus(${JSON.stringify(pending?.id ?? '')})
        return !!document.querySelector('[data-world-focus-sheet]')
      })()`)
      if (!opened) {
        for (let i = 0; i < 20; i++) {
          const sheet = await k.js(`!!document.querySelector('[data-world-focus-sheet]')`)
          if (sheet) break
          await sleep(100)
        }
      }
      await sleep(400)
      await k.shot('rd-world-focus')
    }
  }
]
