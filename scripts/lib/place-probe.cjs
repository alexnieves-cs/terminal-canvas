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

module.exports = { occupiedWorld, overlapsRect, onScreen, cameraStill }
