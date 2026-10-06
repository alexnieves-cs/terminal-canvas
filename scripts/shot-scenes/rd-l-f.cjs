/* Lane L-F (M447). A `run` makes verify:meta visual.1 demand a golden.
   That golden is the lead's, after a person has looked. This file does not
   set UPDATE_GOLDENS and does not write under verify/visual/goldens.
   The picture is the catalog: host loss, an exit 137, and a skeleton at once.
   One reducer phase is paused or reattaching, not both. */
module.exports = [
  { name: 'rd-recovery', reference: ['docs/redesign/mockups/09-error-disconnected.png'], intent: 'Host loss paused-not-lost, a crashed session with one fix, and reattaching skeletons.',
    size: [1440, 900],
    run: async (k) => {
      await k.theme('dark')
      const fixture = {
        paused: [
          { panelId: 'ledger', pid: 11 },
          { panelId: 'vitest', pid: 22 },
          { panelId: 'codex', pid: 33 },
          { panelId: 'shell', pid: 44 }
        ],
        reattaching: [{ panelId: 'ghost' }],
        crashes: [
          { panelId: 'steward', code: 137, prompt: 'ship the ledger' },
          { panelId: 'other', code: 1, prompt: null }
        ],
        offline: [{ source: 'github', lastUpdated: '7:22 PM' }],
        bootIssue: null,
        retryInMs: 8000
      }
      const ok = await k.js(`Boolean(window.__rdLF && window.__rdLF.mount(${JSON.stringify(fixture)}))`)
      if (ok !== true) throw new Error('rd-recovery: window.__rdLF.mount is absent (JobRecoveryNotice loads the recovery store)')
      await k.shot('rd-recovery')
    } }
]
