/* Lane L-C. Both scenes require TC_FIXTURE=rd-steward.
   `{ name:` stays on one line so verify:meta visual.1 sees `run`.
   Giving them `run` lists missing goldens. Never set UPDATE_GOLDENS. */
'use strict'

module.exports = [
  { name: 'rd-plan-palette', reference: ['docs/redesign/mockups/06-navigate-palette.png'], intent: 'Plan tier at 34 percent with the palette open, grouped, on a task query.',
    run: async (kit) => {
      if (process.env.TC_FIXTURE !== 'rd-steward') {
        throw new Error('rd-plan-palette requires TC_FIXTURE=rd-steward')
      }
      await kit.loadMain()
      await kit.theme('dark')
      await kit.zoom(0.34)
      await kit.press('k', { metaKey: true })
      await kit.type('plaid')
      await kit.shot('rd-plan-palette')
    } },
  { name: 'rd-map', reference: ['docs/redesign/mockups/06-navigate-palette.png'], intent: 'Map tier: task territories and state dots. The same mockup, read for the tier not the palette.',
    run: async (kit) => {
      if (process.env.TC_FIXTURE !== 'rd-steward') {
        throw new Error('rd-map requires TC_FIXTURE=rd-steward')
      }
      await kit.loadMain()
      await kit.theme('dark')
      await kit.zoom(0.18)
      await kit.shot('rd-map')
    } }
]
