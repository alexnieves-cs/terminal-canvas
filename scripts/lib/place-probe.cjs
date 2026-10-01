/* M402 (B4). Measuring placement in a real renderer: every panel's OCCUPIED
   world rect (its store rect, read from the panel's own left/top/width/height
   inside the one transformed world layer, plus a live terminal's rim strip
   above it — panels.ts's TERMINAL_RIM, measured here from the strip itself
   rather than copied), an overlap test, and "wholly on screen" against the
   canvas host. Shared by the parts that check the one placement rule. */

/** Every panel's occupied world rect; `newest` marks the highest z. */
async function occupiedWorld(wc) {
  return wc.executeJavaScript(`(() => {
    const all = [...document.querySelectorAll('.world > .panel, .world .panel[data-panel-id]')]
    const seen = new Set()
    const out = []
    let topZ = -Infinity
    for (const p of all) {
      const id = p.getAttribute('data-panel-id')
      if (!id || seen.has(id)) continue
      seen.add(id)
      const x = parseFloat(p.style.left), y = parseFloat(p.style.top), w = parseFloat(p.style.width), h = parseFloat(p.style.height)
      if (![x, y, w, h].every(Number.isFinite)) continue
      // The rim: a terminal's name strip, in world units (its layout height,
      // before M144's counter-scale), whether or not it is live right now.
      const rim = p.classList.contains('pf--kind-terminal') ? 16 : 0
      const z = Number(p.style.zIndex) || 0
      topZ = Math.max(topZ, z)
      out.push({ id, x, y: y - rim, w, h: h + rim, z })
    }
    return out.map((r) => ({ ...r, newest: r.z === topZ }))
  })()`)
}

function overlapsRect(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** The panel's frame lies wholly inside the canvas host, on screen. */
async function onScreen(wc, id) {
  return wc.executeJavaScript(`(() => {
    const host = document.querySelector('.canvas')
    const p = document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(id))} + ']')
    if (!host || !p) return false
    const h = host.getBoundingClientRect(), r = p.getBoundingClientRect()
    return r.left >= h.left - 1 && r.top >= h.top - 1 && r.right <= h.right + 1 && r.bottom <= h.bottom + 1
  })()`)
}

/** Waits until the world layer's transform holds still (a camera flight has landed). */
async function cameraStill(wc, timeoutMs = 3000) {
  const read = () => wc.executeJavaScript(`getComputedStyle(document.querySelector('.world')).transform`)
  const until = Date.now() + timeoutMs
  let last = await read()
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 120))
    const now = await read()
    if (now === last) return true
    last = now
  }
  return false
}

/**
 * M402 follow-up. Wheel-zooms (pinch: ctrlKey) at the host's centre in small
 * steps until the scale lies in [lo, hi] — the harness's zoomToScale allows
 * 4% either way, which at a target of 0.5 can land under the near tier's
 * floor, where a terminal is a card and has no rim. Returns the scale.
 */
async function zoomInto(wc, lo, hi) {
  const scale = () => wc.executeJavaScript('window.__m4aScale()')
  for (let i = 0; i < 300; i++) {
    const s = await scale()
    if (s >= lo && s <= hi) break
    const deltaY = s > hi ? 2 : -2 // 2% a step (ZOOM_SENSITIVITY 0.01), inside any window this is asked for
    await wc.executeJavaScript(`(() => { const host = document.querySelector('.canvas'); const r = host.getBoundingClientRect()
      host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: ${deltaY}, deltaMode: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
    await new Promise((r) => setTimeout(r, 25))
  }
  await cameraStill(wc)
  return scale()
}

/**
 * M402 follow-up (the critic's item 5). WHERE ⌘N SHOULD PUT A PANEL, computed
 * in the harness before the press, so a check can pin the store rect to 1px
 * again rather than "somewhere clear and on screen". Measured from the DOM as
 * the placer measures it (the one-rule inputs, safe-area.ts's placementRoom):
 * the canvas host inset PLACE_EDGE_PX (16) as the world in view; the floating
 * chrome — the minimap while it shows, the HUD, the pill's rest row, a rail or
 * inspector over the host — as world rects; every panel's store rect plus the
 * placement's reserved rim over a terminal; the CANVAS's centre in the world
 * (onSpawn's point — M410: every door mints there, safe-area.ts's viewCentre;
 * the window's centre, which this used to copy, sat right of it with a rail open). Then the pure rule itself (placement.ts's placeNew,
 * bundled into the entry) — the rule is pinned by verify:viewport, and what
 * THIS pins is that the live door feeds it what the canvas shows.
 * Groups and task regions are not read: callers use it where there are none.
 * Two halves: `measurePlacement` before the press, `expectedSpot` after it,
 * once the made panel's size is known.
 */
async function measurePlacement(wc) {
  return wc.executeJavaScript(`(() => {
    const host = document.querySelector('.canvas')
    const hb = host.getBoundingClientRect()
    const t = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.world')).transform)
    const vp = { x: t.e, y: t.f, scale: t.a }
    const local = (r) => ({ x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height })
    const chrome = []
    const map = host.querySelector(':scope > .minimap')
    if (map && map.offsetWidth > 0 && map.getAttribute('data-presence') !== 'hidden') chrome.push(map.offsetParent === host ? { x: map.offsetLeft, y: map.offsetTop, w: map.offsetWidth, h: map.offsetHeight } : local(map.getBoundingClientRect()))
    for (const el of host.querySelectorAll(':scope > .canvas-hud, :scope > .command-pill .command-pill__rest')) { const r = local(el.getBoundingClientRect()); if (r.w > 0 && r.h > 0) chrome.push(r) }
    const shell = host.closest('.shell')
    if (shell) for (const el of shell.querySelectorAll('aside.shell__rail, aside.shell__inspector')) {
      const r = el.getBoundingClientRect()
      const x0 = Math.max(r.left, hb.left), x1 = Math.min(r.right, hb.right), y0 = Math.max(r.top, hb.top), y1 = Math.min(r.bottom, hb.bottom)
      if (x1 - x0 > 1 && y1 - y0 > 1) chrome.push({ x: x0 - hb.left, y: y0 - hb.top, w: x1 - x0, h: y1 - y0 })
    }
    const seen = new Set()
    const panels = [...document.querySelectorAll('.world .panel[data-panel-id]')].filter((p) => { const id = p.getAttribute('data-panel-id'); if (seen.has(id)) return false; seen.add(id); return true }).map((p) => ({ x: parseFloat(p.style.left), y: parseFloat(p.style.top), w: parseFloat(p.style.width), h: parseFloat(p.style.height), terminal: p.classList.contains('pf--kind-terminal') })).filter((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite))
    return { vp, chrome, panels, cw: host.clientWidth, ch: host.clientHeight, centre: { x: (host.clientWidth / 2 - vp.x) / vp.scale, y: (host.clientHeight / 2 - vp.y) / vp.scale } }
  })()`)
}

/** The spot from a `measurePlacement` taken BEFORE the press, for the made panel's `size`. */
function expectedSpot(m, { placeNew, rim }, size) {
  const toWorld = (r) => ({ x: (r.x - m.vp.x) / m.vp.scale, y: (r.y - m.vp.y) / m.vp.scale, w: r.w / m.vp.scale, h: r.h / m.vp.scale })
  const edge = 16
  const within = { x: (edge - m.vp.x) / m.vp.scale, y: (edge - m.vp.y) / m.vp.scale, w: (m.cw - 2 * edge) / m.vp.scale, h: (m.ch - 2 * edge) / m.vp.scale }
  const obstacles = m.panels.map((r) => (r.terminal ? { x: r.x, y: r.y - rim, w: r.w, h: r.h + rim } : { x: r.x, y: r.y, w: r.w, h: r.h }))
  const spot = placeNew({ size: { w: size.w, h: size.h + rim }, centre: { x: m.centre.x, y: m.centre.y - rim / 2 }, obstacles, chrome: m.chrome.map(toWorld), within })
  return spot === null ? null : { x: spot.x - size.w / 2, y: spot.y - (size.h + rim) / 2 + rim, inView: spot.x - size.w / 2 >= within.x && spot.x + size.w / 2 <= within.x + within.w && spot.y - (size.h + rim) / 2 >= within.y && spot.y + (size.h + rim) / 2 <= within.y + within.h, vp: m.vp }
}

/** The store rect (style left/top/width/height) of one panel. */
async function storeRect(wc, id) {
  return wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(id))} + ']'); return p ? { x: parseFloat(p.style.left), y: parseFloat(p.style.top), w: parseFloat(p.style.width), h: parseFloat(p.style.height) } : null })()`)
}

module.exports = { occupiedWorld, overlapsRect, onScreen, cameraStill, zoomInto, measurePlacement, expectedSpot, storeRect }
