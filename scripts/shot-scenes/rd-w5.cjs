/* W5 (M453). Attention flight: queue strip 2 of 3, the terraform card, the approval toast.
   `{ name:` stays on one line so verify:meta visual.1 sees `run`.
   A missing golden is expected until Phase 4. Never UPDATE_GOLDENS.
   The WebGL layer reads back blank on this host (R-053). Capture after the
   enter chip hides — the 1000ms move was the focus shot's first miss. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = [
  { name: 'rd-world-attention', reference: ['docs/redesign/mockups/13-world-attention.png'], intent: 'Attention flight settled: queue strip 2 of 3, a shell card with no reply field, the approval toast.',
    run: async (k) => {
      process.env.TC_FIXTURE = 'rd-steward'
      await k.loadMain()
      // The harness preference is light. The strip and the card are judged on the dark concept.
      await k.theme('dark')
      await k.zoom(0.18)
      for (let i = 0; i < 20; i++) {
        const clicked = await k.click('.shell__world-toggle')
        if (clicked) break
        await sleep(150)
      }
      for (let i = 0; i < 40; i++) {
        const settled = await k.js(`(() => {
          const chip = document.querySelector('[data-world-cancel]')
          const view = document.querySelector('.world-view')
          const hidden = !chip || chip.hidden
          return hidden && !!view && !!window.__rdW5
        })()`)
        if (settled) break
        await sleep(100)
      }
      const posed = await k.js(`(() => {
        const door = window.__rdW5
        if (!door) return false
        door.pose({
          items: [
            { panelId: 'codex-ledger', kind: 'approval', label: 'Codex' },
            { panelId: 'shell-infra', kind: 'shell-prompt', label: 'terraform plan', shell: {
              agentId: 'shell-infra', title: 'terraform plan', place: 'Infra',
              prompt: 'Do you want to perform these actions?',
              command: 'terraform plan\\naws_instance.api'
            } },
            { panelId: 'codex-pricing', kind: 'failed', label: 'Codex' }
          ],
          cursor: 'shell-infra',
          shell: {
            agentId: 'shell-infra', title: 'terraform plan', place: 'Infra',
            prompt: 'Do you want to perform these actions?',
            command: 'terraform plan\\naws_instance.api'
          },
          from: { x: -4, z: 2 },
          to: { x: 4, z: -1 }
        })
        door.approve({
          agent: 'Codex',
          file: 'ledger.ts',
          panelId: 'codex-ledger',
          discard: { root: '/repo', baseline: 'base', subjectId: 'codex-ledger', paths: ['ledger.ts'] }
        })
        return true
      })()`)
      if (!posed) await sleep(200)
      for (let i = 0; i < 30; i++) {
        const ready = await k.js(`(() => {
          const text = document.body.innerText
          const strip = document.querySelector('[data-world-queue]')
          const card = document.querySelector('[data-world-shell-card]')
          const reply = card ? card.querySelector('textarea, [data-world-focus-reply]') : null
          return !!strip && !!card && !reply &&
            text.includes('2 of 3') &&
            text.includes('A shell prompt is answered in its terminal') &&
            text.includes("Approved Codex's edit to ledger.ts") &&
            text.includes('Undo')
        })()`)
        if (ready) break
        await sleep(100)
      }
      await sleep(400)
      await k.shot('rd-world-attention')
    }
  }
]
