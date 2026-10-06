/* Lane L-D. rd-sessions paints once this file has `run`, so verify:meta
   visual.1 will list a missing golden until the lead writes one.
   Never set UPDATE_GOLDENS from this lane. */
'use strict'

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

function toneOf(state) {
  if (state === 'working') return { tone: 'working', word: 'working' }
  if (state === 'needs-you') return { tone: 'needs-you', word: 'needs you' }
  if (state === 'passed') return { tone: 'done', word: 'idle' }
  if (state === 'failed') return { tone: 'exited', word: 'exited 1' }
  return { tone: 'idle', word: 'idle' }
}

/** The cast, as facts the page already accepts. Sample copy stays in the fixture. */
function factsFromCast(cast, now) {
  const facts = []
  for (const task of cast.tasks || []) {
    for (const panel of task.panels || []) {
      if (panel.engine === 'review') continue
      const spoken = toneOf(panel.state)
      const shell = panel.engine === 'shell'
      const wave = panel.id.length
      facts.push({
        id: panel.id,
        name: panel.name,
        agent: shell ? 'shell' : panel.engine,
        folder: panel.folder,
        branch: panel.branch,
        word: spoken.word,
        tone: spoken.tone,
        activity: [2, 4, 3, 6 + (wave % 3), 5, 7],
        startedAt: now - (12 + wave) * 60 * 1000,
        now,
        costUsd: panel.engine === 'review' ? null : Math.round((0.4 + (wave % 5) * 0.35) * 100) / 100,
        lastLine: panel.line || '',
        taskId: task.id,
        taskTitle: task.title,
        taskTicket: task.ticket,
        shell,
        survives: panel.id === 'claude-ledger' || panel.id === 'shell-infra',
        tokens: panel.engine === 'claude' || panel.engine === 'codex' ? 18400 : null,
        changes: panel.id === 'claude-ledger' ? '4 files' : null,
        canPaste: !shell,
        kind: 'terminal'
      })
    }
  }
  return facts
}

module.exports = [
  { name: 'rd-sessions', reference: ['docs/redesign/mockups/07-sessions.png'], intent: 'Sessions triage: attention cards, a table grouped by task, three rows selected, Claude on ledger-export open.',
    run: async (k) => {
      if (process.env.TC_FIXTURE !== 'rd-steward') {
        throw new Error('rd-sessions requires TC_FIXTURE=rd-steward')
      }
      await k.loadMain()
      await k.theme('dark')
      for (const id of ['codex-ledger', 'claude-plaid', 'shell-infra']) {
        k.wc.send('agent:state', { panelId: id, state: 'wants-you' })
      }
      const opened = await k.click('[data-seg="sessions"]')
      if (!opened) throw new Error('sessions segment missing')
      const cast = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'rd-steward', 'workspace.json'), 'utf8'))
      const facts = factsFromCast(cast, Date.now())
      await k.js(`window.dispatchEvent(new CustomEvent('tc-sessions-feed', { detail: ${JSON.stringify(facts)} }))`)
      const fed = await k.js(`document.querySelectorAll('[data-session-row]').length`)
      if (typeof fed !== 'number' || fed < 3) throw new Error(`rd-sessions feed painted ${fed} rows`)
      for (const id of ['claude-ledger', 'vitest-ledger', 'codex-plaid']) {
        const toggled = await k.js(`(() => { const box = document.querySelector('[data-session-select="${id}"]'); if (!box) return false; box.click(); return true })()`)
        if (!toggled) throw new Error(`rd-sessions could not select ${id}`)
      }
      const detail = await k.click('[data-session-open="claude-ledger"]')
      if (!detail) throw new Error('rd-sessions could not open claude-ledger')
      const selected = await k.js(`document.querySelectorAll('[data-session-row][data-selected]').length`)
      if (selected !== 3) throw new Error(`rd-sessions selected ${selected}, wanted 3`)
      await k.shot('rd-sessions')
    }
  }
]
