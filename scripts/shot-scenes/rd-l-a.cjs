/* Redesign scenes for lane L-A. A scene paints only once it has `run`.
   visual.1 then lists it as missing a golden until the lead writes one.
   Never set UPDATE_GOLDENS. reference paths are repo paths (critic.reference.1). */
module.exports = [
  { name: 'rd-splash', reference: ['docs/redesign/mockups/01-splash.png'], intent: 'Launch restore frozen at reattaching tmux 3 of 5, over the ghosted layout.',
    size: [1600, 1000],
    run: async (k) => {
      await k.theme('dark')
      const fixture = {
        facts: {
          workspace: { name: 'steward', path: '~/code/steward' },
          layout: { tasks: 2, objects: 9 },
          tmux: { done: 3, total: 5 },
          agentsPlanned: ['claude', 'codex']
        },
        rects: [
          { x: 40, y: 80, w: 280, h: 160 },
          { x: 360, y: 60, w: 300, h: 180 },
          { x: 80, y: 280, w: 240, h: 140 },
          { x: 400, y: 300, w: 260, h: 150 }
        ]
      }
      const ok = await k.js(`Boolean(window.__rdLA && window.__rdLA.mount('splash', ${JSON.stringify(fixture)}))`)
      if (ok !== true) throw new Error('rd-splash: window.__rdLA.mount is absent (StartupSplash registers it)')
      await k.shot('rd-splash')
    }
  },
  { name: 'rd-onboarding', reference: ['docs/redesign/mockups/02-onboarding.png'], intent: 'Onboarding step 2, codex found and gemini missing, with the state-colour preview.',
    size: [1600, 1000],
    run: async (k) => {
      await k.theme('dark')
      const fixture = {
        onboard: {
          initialStep: 'agents',
          workspaceName: 'steward',
          probes: [
            { id: 'claude', path: '/opt/homebrew/bin/claude', version: '2.1.19' },
            { id: 'codex', path: '/opt/homebrew/bin/codex', version: '0.98.0' },
            { id: 'gemini', path: null, timedOut: false }
          ],
          enabled: ['claude', 'codex']
        }
      }
      const ok = await k.js(`Boolean(window.__rdLA && window.__rdLA.mount('onboarding', ${JSON.stringify(fixture)}))`)
      if (ok !== true) throw new Error('rd-onboarding: window.__rdLA.mount is absent (StartupSplash registers it)')
      await k.shot('rd-onboarding')
    }
  },
  { name: 'rd-empty', reference: ['docs/redesign/mockups/03-empty-state.png'], intent: 'The empty canvas: one primary verb, quick spawns, three inert starter layouts.',
    size: [1600, 1000],
    run: async (k) => {
      await k.theme('dark')
      const fixture = { empty: { workspace: 'steward', repo: 'steward' } }
      const ok = await k.js(`Boolean(window.__rdLA && window.__rdLA.mount('empty', ${JSON.stringify(fixture)}))`)
      if (ok !== true) throw new Error('rd-empty: window.__rdLA.mount is absent (StartupSplash registers it)')
      await k.shot('rd-empty')
    }
  },
]
