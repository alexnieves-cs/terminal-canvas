/* Lane L-B (M442, M443). A `run` makes verify:meta visual.1 demand a golden.
   Those goldens are the lead's, after a person has looked. This file does
   not set UPDATE_GOLDENS and does not write under verify/visual/goldens.
   The harness paints the steward fixture only when TC_FIXTURE=rd-steward. */
module.exports = [
  { name: 'rd-workspace', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'The Work-tier canvas: a task region, a needs-you panel, a handoff and the inspector.',
    run: async (kit) => {
      // A filtered shot has no earlier scene to load the layout. The steward
      // cast is what this picture is of, and loadMain writes it only when
      // TC_FIXTURE is rd-steward. The harness preference is light; the mockup
      // is the dark concept.
      await kit.loadMain()
      await kit.theme('dark')
      await kit.context(true)
      await kit.shot('rd-workspace')
    } },
  { name: 'rd-arrange', reference: ['docs/redesign/mockups/05-create-arrange.png'], intent: 'Mid-drag with smart guides, the marquee toolbar up, and the connected spawn menu open.',
    run: async (kit) => {
      await kit.loadMain()
      await kit.theme('dark')
      // M466. The gestures are driven as REAL input (sendInputEvent), in the
      // order a person makes them, because each one is a different handler
      // and a synthetic DOM event reaches none of the document listeners the
      // marquee and the link draw install. The picture freezes the last one
      // mid-drag; the button is released after the capture.
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const mouse = (type, x, y, held) => kit.wc.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, modifiers: held ? ['leftButtonDown'] : [] })
      const glide = async (from, to, steps = 8) => { for (let i = 1; i <= steps; i++) { await mouse('mouseMove', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, true); await sleep(35) } }
      const rect = (id) => kit.js(`(() => { const e = document.querySelector('.panel[data-panel-id="${id}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width } })()`)
      // The mockup has no Panels rail and sits at 82%. The rail comes back
      // after the capture: its open state is a setting the next scene reads.
      await kit.click('.shell__rail-toggle')
      await sleep(500)
      await kit.zoom(0.82)
      const start = await rect('claude-ledger')
      if (start === null) throw new Error('rd-arrange: the steward ledger task is not on the canvas')
      // Wheel without ctrl pans (canvas-input.ts): the ledger task to the
      // left, room on the right for the menu.
      await kit.js(`(() => { const host = document.querySelector('.canvas'); const r = host.getBoundingClientRect(); host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: ${start.l - 140}, deltaY: ${start.t - 150}, deltaMode: 0, clientX: r.left + 40, clientY: r.bottom - 40 })); return true })()`)
      await sleep(500)
      const claude = await rect('claude-ledger'), codex = await rect('codex-ledger')
      // 1. A marquee across the top row's lower edge: Claude and Codex, not
      //    the row beneath (a band selects what it intersects, marquee.ts).
      const from = { x: claude.l + 60, y: claude.b + 20 }, to = { x: codex.l + 80, y: claude.b - 12 }
      await mouse('mouseDown', from.x, from.y); await sleep(60)
      await glide(from, to)
      await mouse('mouseUp', to.x, to.y); await sleep(400)
      // 2. Codex's east port released on empty ground opens the connected menu.
      const port = await kit.js(`(() => { const e = document.querySelector('.panel[data-panel-id="codex-ledger"] [data-port="e"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
      if (port === null) throw new Error('rd-arrange: Codex has no east port')
      const drop = { x: codex.r + 110, y: codex.b - 40 }
      await mouse('mouseDown', port.x, port.y); await sleep(60)
      await glide(port, drop, 10)
      await mouse('mouseUp', drop.x, drop.y); await sleep(600)
      // 3. The selected pair dragged down by the row gap less 24px, so the
      //    gap to the row beneath snaps to 24 and the guides are up.
      const grip = { x: claude.l + claude.w * 0.35, y: claude.t + 14 }
      await mouse('mouseDown', grip.x, grip.y); await sleep(60)
      await glide(grip, { x: grip.x + 3, y: grip.y + 22 })
      // The guides are React state a frame or two behind the last move.
      for (let i = 0; i < 20 && !(await kit.js(`!!document.querySelector('[data-snap-guide], [data-snap-spacing]')`)); i++) await sleep(100)
      const state = await kit.js(`JSON.stringify({ selected: (document.querySelector('.marquee-toolbar__count') || {}).textContent || null, menu: !!document.querySelector('[data-connected-spawn]'), guides: document.querySelectorAll('[data-snap-guide], [data-snap-spacing]').length, gaps: [...document.querySelectorAll('[data-snap-spacing]')].map((e) => e.dataset.snapSpacing) })`)
      console.log(`[shot] rd-arrange: ${state}`)
      try {
        const seen = JSON.parse(state)
        if (!seen.selected || !seen.menu || seen.guides === 0) throw new Error(`rd-arrange: the gestures did not all land ${state}`)
        await kit.shot('rd-arrange')
      } finally {
        await mouse('mouseUp', grip.x + 3, grip.y + 22); await sleep(300)
        await kit.press('Escape')
        await kit.click('.shell__rail-toggle'); await sleep(400)
      }
    } }
]
