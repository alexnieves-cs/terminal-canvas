/* Lane W (M640–M649), the first ten minutes. Named rd-y-* so it sorts after
   rd-x-ui, whose last scene narrows the window: this one names its own size.
   The scene is listed in verify/visual/pending-goldens.json until a person has
   looked at its capture; no golden is written here. The doctor's install line
   is already in frame in rd-onboarding (gemini is missing there), and the
   Simple/Full choice in ui-settings, so neither gets a second scene. */
const settle = (k, ms) => k.js(`new Promise((resolve) => setTimeout(resolve, ${ms}))`)

module.exports = [
  { name: 'first-guide', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'M644. The guided first canvas on its first step, over the steward workspace: a small card in the corner, never a modal, with three dots, "1 of 3", Skip tour, the move to make and a Next button; the canvas under it stays live.', size: [1440, 900],
    run: async (k) => {
      // The store reads its key once at load, so the key goes in before the reload.
      await k.js(`window.localStorage.setItem('tc.guide', 'on:0')`)
      await k.loadMain()
      // The card sits at the foot of the canvas, and a reload drops the
      // harness's pinned metrics: without this the capture stops short of it.
      await k.resize(1440, 900)
      await k.theme('dark')
      await settle(k, 700)
      if (!(await k.js(`!!document.querySelector('[data-guide]')`))) throw new Error('the guide did not mount')
      await k.shot('first-guide')
      // Skip is the way out a person has, and it leaves the key at done for whatever runs next.
      if (!(await k.click('[data-guide-skip]'))) throw new Error('Skip tour missing')
      await settle(k, 300)
      if (await k.js(`!!document.querySelector('[data-guide]')`)) throw new Error('Skip tour left the guide up')
    } }
]
