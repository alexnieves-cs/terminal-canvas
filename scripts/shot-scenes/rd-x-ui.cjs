/* Lane U (M600–M609), the UI gaps audit. Named rd-x-* so it sorts after every
   redesign file: the last scene resizes the window, and nothing paints after it.
   Each scene is listed in verify/visual/pending-goldens.json until a person has
   looked at its capture; no golden is written here. The references are the
   redesign mockups each page belongs beside (the Review page is a page in the
   Sessions shell; the top bar is the workspace's). */
const settle = (k, ms) => k.js(`new Promise((resolve) => setTimeout(resolve, ${ms}))`)

module.exports = [
  { name: 'ui-review', reference: ['docs/redesign/mockups/07-sessions.png'], intent: 'M605. The Review page, which was an empty mount point: its To review tab lists the tasks whose work came back (finished with changes, or a failed check), each with Review changes or See checks, or says there is nothing to review with a New task button.',
    run: async (k) => {
      await k.loadMain()
      await k.theme('dark')
      if (!(await k.click('[data-seg="review"]'))) throw new Error('review segment missing')
      await settle(k, 700)
      if (!(await k.js(`!!document.querySelector('[data-review-host] [data-review-tab="queue"]')`))) throw new Error('review page did not render its tabs')
      await k.shot('ui-review')
    } },
  { name: 'ui-lessons', reference: ['docs/redesign/mockups/07-sessions.png'], intent: 'M605. Lessons as the Review page\'s second tab, with Review still lit in the top bar; with no lessons yet, the sentence that says how one is kept and a button back to what is ready to review.',
    run: async (k) => {
      if (!(await k.click('[data-review-tab="lessons"]'))) throw new Error('lessons tab missing')
      await settle(k, 900)
      await k.shot('ui-lessons')
      await k.click('[data-seg="canvas"]')
      await settle(k, 400)
    } },
  { name: 'ui-settings', reference: ['docs/redesign/mockups/08-settings-keyboard.png'], intent: 'M600. Settings on General with its way out first in the nav (Back to canvas), and the secondary text at the 4.5:1 --fg-4.',
    run: async (k) => {
      const opened = await k.js(`(() => { if (typeof window.__tcOpenSettings !== 'function') return false; window.__tcOpenSettings('general'); return true })()`)
      if (!opened) throw new Error('settings host did not install')
      await settle(k, 400)
      if (!(await k.js(`!!document.querySelector('[data-settings-back]')`))) throw new Error('Back to canvas missing')
      await k.shot('ui-settings')
      await k.click('[data-settings-back]')
      await settle(k, 300)
    } },
  { name: 'ui-topbar-1024', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'M601. The top bar at 1024px: the page switch sits in the flow between the location and the right cluster, the session count has stepped aside and search is its icon, so nothing overlaps.', size: [1024, 720],
    run: async (k) => {
      await k.loadMain()
      await k.theme('dark')
      await settle(k, 600)
      await k.shot('ui-topbar-1024')
    } }
]
