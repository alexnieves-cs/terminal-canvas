/* verify:panels:flowchart — the flowchart feature (M388–M393) in the REAL renderer.
   Run with: npm run build && npm run verify:panels:flowchart

   verify:flowchart (plain node) proves the pure modules — geometry, layout,
   Mermaid, the record parsers. What it cannot see is everything between a
   person's hand and those modules: whether a double-click on the ground
   reaches the verb, whether Tab in a label is the chart's key and not the
   browser's focus move, whether ⌘D is still the diagnostics overlay, whether
   a copy leaks a label onto the system clipboard, whether a pasted diagram
   spawns anything, whether a line drawn from a terminal's port turns into a
   PanelLink (task membership, handoff) instead of a diagram arrow. Every one
   of those fails SILENTLY in a running app — the canvas simply does a
   different thing — so each is driven here with real input: sendInputEvent
   for the mouse and keys, insertText for typing, edit:* over IPC for ⌘C/⌘V/
   ⌘Z (the menu's own route), and canvas:plan for the agent's line.

   Scoped ids only (`flowchart.app.<n>`, `flowchart.perf.<n>`). The perf block
   PRINTS its timings (`MEASURE {…}` lines, for the ledger) and asserts only
   structure plus one bound that catches a real hang (p95 < 250 ms) — the
   orchestrate part's precedent: a frame-time assertion on a shared machine
   measures the machine. */
// A throw while the harness LOADS (a bad require, a failed esbuild) never
// reaches runPanelsSuite's watchdog: Electron prints "App threw an error
// during load" and idles, which read as a 30-minute hang on 2026-09-14.
let runPanelsSuite
try { ({ runPanelsSuite } = require('./panels-harness.cjs')) } catch (error) { console.error('FAIL  harness failed to load:', error); process.exit(1) }

const WATCHDOG_MS = 47000 // measured 2026-09-29 alone in the Electron tier, two green runs: 37.6 s, 37.4 s; 1.25x the slower, to the next second — re-measure when a milestone adds checks

runPanelsSuite('flowchart', WATCHDOG_MS, async (ctx) => {
  const { IPC_EVENTS, app, attachPtyLifecycle, chatSpawns, fromPanels, flushLayoutStore, join, killedPanelIds, layoutStore, listSessions, mkdtempSync, ok, ptyManager, requestFromRendererWith, sessionMap, settle, sleep, tmpdir, waitUntil, wc, win, writeFileSync, zoomToScale, state } = ctx
  const { clipboard } = require('electron')
  // A renderer reload must DETACH every session, exactly as main/index.ts
  // wires it (the other parts' first line, for the same reason).
  attachPtyLifecycle(win, () => ptyManager.detachAll())

  // Every pty:create main is asked for, by panel id — the Mermaid paste's
  // "starts nothing" is a NEGATIVE, and a negative read off pty:list alone
  // passes against a create that failed. An own property shadowing the
  // prototype method, read by the pty:create handler at call time (the same
  // shape as the harness's killedPanelIds).
  const createdPanelIds = []
  {
    const realCreate = ptyManager.create.bind(ptyManager)
    ptyManager.create = (spec) => { createdPanelIds.push(spec && spec.panelId); return realCreate(spec) }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const js = (code) => wc.executeJavaScript(code)
  const reload = async () => { const loaded = new Promise((r) => wc.once('did-finish-load', r)); wc.reload(); await loaded; await settle() }
  const press = async (x, y, modifiers = []) => {
    wc.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, modifiers })
    wc.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, modifiers })
    await sleep(150)
  }
  const dbl = async (x, y) => {
    x = Math.round(x); y = Math.round(y)
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    await sleep(60)
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 2 })
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 2 })
    await sleep(350)
  }
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await sleep(200)
  }
  const typeText = async (text) => { wc.insertText(text); await sleep(150) }
  // A REAL drag: `leftButtonDown` because Chromium derives `buttons` from the
  // modifier bitfield (a move without it ENDS every gesture here), several
  // moves because the gestures track on `document`.
  const drag = async (from, to, steps = 6) => {
    wc.sendInputEvent({ type: 'mouseDown', x: Math.round(from.x), y: Math.round(from.y), button: 'left', clickCount: 1 })
    for (let i = 1; i <= steps; i++) {
      wc.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + ((to.x - from.x) * i) / steps), y: Math.round(from.y + ((to.y - from.y) * i) / steps), button: 'left', modifiers: ['leftButtonDown'] })
      await sleep(16)
    }
    wc.sendInputEvent({ type: 'mouseUp', x: Math.round(to.x), y: Math.round(to.y), button: 'left', clickCount: 1 })
    await settle()
  }
  const shapes = () => js(`[...document.querySelectorAll('.shape[data-panel-id]')].map((e) => {
    const r = e.getBoundingClientRect()
    const lbl = e.querySelector('.shape__label:not(.shape__label--editing)')
    const editing = e.classList.contains('shape--editing')
    return { id: e.getAttribute('data-panel-id'), form: e.getAttribute('data-shape-form'), fill: e.getAttribute('data-fill'), stroke: e.getAttribute('data-stroke'), ink: e.getAttribute('data-ink'),
      text: editing ? null : (lbl ? lbl.textContent : ''), x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), h: parseFloat(e.style.height),
      cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), selected: e.classList.contains('shape--selected'), editing }
  })`)
  const connectorsDom = () => js(`[...document.querySelectorAll('.connector-layer [data-connector-id]')].map((g) => {
    const id = g.getAttribute('data-connector-id')
    const label = document.querySelector('[data-connector-label="' + id + '"]')
    return { id, from: g.getAttribute('data-connector-from'), to: g.getAttribute('data-connector-to'), d: (g.querySelector('.connector__line') || { getAttribute: () => '' }).getAttribute('d') || '',
      stroke: g.getAttribute('data-stroke'), dashed: g.hasAttribute('data-dashed'), heads: g.querySelectorAll('.connector__head').length, label: label ? label.textContent : null }
  })`)
  const byId = (list, id) => list.find((s) => s.id === id)
  const editorOf = () => js(`(() => { const a = document.activeElement; if (!a || !a.classList.contains('shape__editor')) return null; const s = a.closest('.shape'); return s ? s.getAttribute('data-panel-id') : '?' })()`)
  const focusedId = () => js(`window.__m4aFocusedId ? window.__m4aFocusedId() : 'no hook'`)
  const panelRect = (id) => js(`(() => { const e = document.querySelector('.panel[data-panel-id="${id}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, selected: e.classList.contains('panel--selected') } })()`)
  const portCentre = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return { zero: true }; const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); const hit = document.elementFromPoint(x, y); return { x, y, hitsPort: hit === e } })()`)
  // Empty ground near a screen point, with room around it for a new shape:
  // the host itself, the world layer or the aura under the cursor, and no
  // panel, shape or HUD within the margin (a new process step is minted
  // CENTRED on the point, 160x72 at scale 1).
  const groundNear = (px, py, mx = 110, my = 70) => js(`(() => {
    const host = document.querySelector('.canvas'); const b = host.getBoundingClientRect()
    const boxes = [...document.querySelectorAll('.panel, .shape')].map((e) => e.getBoundingClientRect())
    const ground = (el) => el === host || (el !== null && (el.classList.contains('world') || el.classList.contains('canvas__aura')))
    for (let ring = 0; ring < 50; ring++) {
      const n = ring === 0 ? 1 : ring * 8
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2
        const x = Math.round(${px} + Math.cos(a) * ring * 16), y = Math.round(${py} + Math.sin(a) * ring * 16)
        if (x < b.left + ${mx} || x > b.right - ${mx} || y < b.top + ${my} || y > b.bottom - ${my}) continue
        if (!ground(document.elementFromPoint(x, y))) continue
        if (boxes.some((r) => x > r.left - ${mx} && x < r.right + ${mx} && y > r.top - ${my} && y < r.bottom + ${my})) continue
        return { x, y }
      }
    }
    return null })()`)
  const hostBox = () => js(`(() => { const r = document.querySelector('.canvas').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } })()`)
  /** The active workspace as the STORE holds it — after the renderer's save has landed. */
  const savedWs = () => {
    flushLayoutStore()
    const snap = layoutStore.current()
    return snap.workspaces.find((w) => w.id === snap.activeWorkspaceId) || snap.workspaces[0]
  }
  const savedWhen = (pred, ms = 4000) => waitUntil(() => { const ws = savedWs(); return pred(ws) ? ws : false }, ms, 100)
  const toasts = () => js(`[...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent || '')`)
  const plan = (line, caller) => requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line, ...(caller === undefined ? {} : { caller }) }, null, 5000)
  // Every keydown the window sees, with its code — a check that reads "⌘D did
  // nothing" must be able to say whether the key ARRIVED at all.
  const installKeyProbe = () => js(`(() => { if (!window.__fcKeys) { window.__fcKeys = []; window.addEventListener('keydown', (e) => { window.__fcKeys.push({ key: e.key, code: e.code, meta: e.metaKey, alt: e.altKey, target: (document.activeElement && document.activeElement.className) || '' }) }, true) } window.__fcKeys.length = 0; return true })()`)
  const keyProbe = () => js(`(window.__fcKeys || []).slice(-6)`)

  // ── The fixture ───────────────────────────────────────────────────────────
  // Two quiet terminals (`/bin/cat` blocks on stdin and prints nothing, so no
  // detector state races the ones a check sends) on the right; the left of
  // the view is ground for the chart. Snapping stays OFF (the harness's).
  const T1 = 'fct1'
  const T2 = 'fct2'
  const term = (id, x, y) => ({ kind: 'terminal', rect: { id, x, y, w: 240, h: 180 }, z: 1, spec: { panelId: id, cwd: '/tmp', command: '/bin/cat', args: [] } })
  layoutStore.save({ panels: fromPanels([term(T1, 520, 20), term(T2, 520, 280)]), camera: { x: 40, y: 80, scale: 1 }, selectedId: null, focusedId: null })
  flushLayoutStore()
  await reload()
  // The rail's Panels pane, where the living flowchart's word is read beside.
  await js(`(() => { if (document.querySelector('.rail-list--panels')) return true; const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
  await settle()
  // A restored terminal comes back ASLEEP (nothing starts by itself); each is
  // woken the way a person does it, with a real click on its rail row's
  // `start` — then the keyboard is handed back to the ground.
  for (const id of [T1, T2]) {
    const at = await js(`(() => { const b = document.querySelector('.rail-row[data-rail-row="${id}"] .rail-row__start:not(.rail-row__start--empty)'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    if (at) await press(at.x, at.y)
  }
  const woke = await waitUntil(async () => { const m = await sessionMap(wc); return m.has(T1) && m.has(T2) && (await js(`document.querySelectorAll('.panel[data-panel-id="${T1}"] .xterm, .panel[data-panel-id="${T2}"] .xterm').length`)) === 2 }, 10000)
  console.log(`[flowchart] fixture terminals running: ${woke}`)
  await settle()
  const host = await hostBox()
  console.log(`[flowchart] host ${JSON.stringify(host)}`)

  // Ids carried between checks.
  let S1 = null
  let S2 = null
  let S3 = null
  let S4 = null

  // ---------------------------------------------------------------------
  // flowchart.app.1 — THE KEYBOARD BUILDS A CHART. Silent failure prevented:
  // a building gesture that reaches nothing (the double-click read as a
  // marquee, Tab moving DOM focus to the next control, ⌥→ eaten by a
  // terminal) or a next step minted UNCONNECTED or on top of its source —
  // every one of which leaves a canvas that looks fine and a chart that
  // never got built.
  // flowchart.app.2 — ONE ⌘Z TAKES BACK A TAB-MADE STEP WHOLE. Silent
  // failure prevented: the step and its connector landing as two history
  // entries, so the person's ⌘Z leaves an unconnected box (or an arrow to
  // nothing) behind — the defect the ledger's checkpoint records fixing.
  // ---------------------------------------------------------------------
  {
    const ID1 = 'flowchart.app.1 a double-click on empty ground makes a process step with its label editor focused; typed text + Tab commits the label and adds the NEXT step BELOW, connected from the first, its label open; ⌥→ from a selected step adds a connected step to its RIGHT'
    const ID2 = 'flowchart.app.2 one ⌘Z after a Tab-made step removes BOTH the step and its connector (one history entry); ⌘⇧Z brings both back'
    let reported2 = false
    try {
      const g = await groundNear(host.left + 200, host.top + 150)
      const before = await shapes()
      if (g) await dbl(g.x, g.y)
      const afterDbl = await waitUntil(async () => { const s = await shapes(); return s.length === before.length + 1 ? s : false }, 3000)
      const made = afterDbl ? afterDbl.find((s) => !before.some((b) => b.id === s.id)) : null
      S1 = made ? made.id : null
      const editor1 = await waitUntil(editorOf, 2000)
      await typeText('Alpha')
      await key('Tab')
      // The next step's label opens on the frame after React has it.
      const afterTab = await waitUntil(async () => { const s = await shapes(); return s.length === before.length + 2 ? s : false }, 3000)
      const second = afterTab ? afterTab.find((s) => s.id !== S1 && !before.some((b) => b.id === s.id)) : null
      S2 = second ? second.id : null
      const editor2 = await waitUntil(async () => { const e = await editorOf(); return e === S2 ? e : false }, 2000)
      const conns2 = await connectorsDom()
      const first = afterTab ? byId(afterTab, S1) : null
      const link12 = conns2.filter((c) => c.from === S1 && c.to === S2)
      const below = first && second && second.y > first.y + first.h && Math.abs((second.x + second.w / 2) - (first.x + first.w / 2)) < 4
      // Escape with nothing typed: the empty label commits (no history entry), the host takes the keyboard back.
      await key('Escape')
      await settle()
      // ── .2: ONE undo, then redo. edit:undo is the menu's own route for ⌘Z.
      const beforeUndo = { shapes: (await shapes()).map((s) => s.id), conns: (await connectorsDom()).map((c) => c.id) }
      wc.send('edit:undo')
      await settle()
      const afterUndo = { shapes: await shapes(), conns: await connectorsDom() }
      wc.send('edit:redo')
      await settle()
      const afterRedo = { shapes: await shapes(), conns: await connectorsDom() }
      const undone = !afterUndo.shapes.some((s) => s.id === S2) && !afterUndo.conns.some((c) => c.to === S2 || c.from === S2) &&
        afterUndo.shapes.some((s) => s.id === S1 && s.text === 'Alpha') && afterUndo.shapes.length === beforeUndo.shapes.length - 1 && afterUndo.conns.length === beforeUndo.conns.length - 1
      const redone = afterRedo.shapes.some((s) => s.id === S2) && afterRedo.conns.some((c) => c.from === S1 && c.to === S2) &&
        afterRedo.shapes.length === beforeUndo.shapes.length && afterRedo.conns.length === beforeUndo.conns.length
      reported2 = true
      ok(ID2, typeof S2 === 'string' && undone && redone,
        JSON.stringify({ S1, S2, beforeUndo, afterUndo: { shapes: afterUndo.shapes.map((s) => s.id + ':' + s.text), conns: afterUndo.conns.map((c) => c.from + '>' + c.to) }, afterRedo: { shapes: afterRedo.shapes.map((s) => s.id), conns: afterRedo.conns.map((c) => c.from + '>' + c.to) } }))
      // ── .1's branch: press S2's body (the keyboard comes with the selection), ⌥→.
      const s2now = byId(await shapes(), S2)
      if (s2now) await press(s2now.cx, s2now.cy)
      const selectedS2 = byId(await shapes(), S2)
      const beforeAlt = await shapes()
      await key('Right', ['alt'])
      const afterAlt = await waitUntil(async () => { const s = await shapes(); return s.length === beforeAlt.length + 1 ? s : false }, 3000)
      const third = afterAlt ? afterAlt.find((s) => !beforeAlt.some((b) => b.id === s.id)) : null
      S3 = third ? third.id : null
      const editor3 = await waitUntil(async () => { const e = await editorOf(); return e === S3 ? e : false }, 2000)
      await typeText('Gamma')
      await key('Escape')
      await settle()
      const conns3 = await connectorsDom()
      const s2 = afterAlt ? byId(afterAlt, S2) : null
      const right = s2 && third && third.x > s2.x + s2.w && Math.abs((third.y + third.h / 2) - (s2.y + s2.h / 2)) < 4
      const finalShapes = await shapes()
      ok(ID1,
        g !== null && made !== null && made.form === 'process' && editor1 === S1 &&
          first !== null && first.text === 'Alpha' && second !== null && second.form === 'process' && below && link12.length === 1 && editor2 === S2 &&
          selectedS2 && selectedS2.selected && third !== null && right && conns3.some((c) => c.from === S2 && c.to === S3) && editor3 === S3 &&
          byId(finalShapes, S3) && byId(finalShapes, S3).text === 'Gamma',
        JSON.stringify({ ground: g, made, editor1, first, second, below, link12, editor2, selectedS2: selectedS2 && selectedS2.selected, third, right, editor3, S3text: byId(finalShapes, S3) && byId(finalShapes, S3).text }))
    } catch (error) {
      ok(ID1, false, `threw: ${error && error.stack ? error.stack : error}`)
      if (!reported2) ok(ID2, false, 'not reached — the block threw first')
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.3 — DELETE. Silent failure prevented: a deleted shape whose
  // incoming connector survives on its SOURCE (it would be pruned at the next
  // load with a warning, but it is drawn to nothing and saved to disk until
  // then); and a bare key that reaches a live terminal through the diagram's
  // scoped keys — the one exception to "every canvas chord is ⌘" (D3) must
  // never delete a process.
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.3 Delete on a selected shape removes it AND every connector touching it (none in the DOM, none dangling in the saved layout); Delete with a TERMINAL selected leaves the terminal, its session and its pid alone'
    try {
      const s2 = byId(await shapes(), S2)
      if (s2) await press(s2.cx, s2.cy)
      const touchingBefore = (await connectorsDom()).filter((c) => c.from === S2 || c.to === S2).map((c) => c.id)
      await key('Delete')
      await settle()
      const domAfter = { shapes: await shapes(), conns: await connectorsDom() }
      const ws = await savedWhen((w) => !w.panels.some((p) => p.id === S2))
      const ids = ws ? new Set(ws.panels.map((p) => p.id)) : new Set()
      const dangling = ws ? ws.panels.flatMap((p) => (p.connectors || []).filter((c) => !ids.has(c.to)).map((c) => `${p.id}>${c.to}`)) : ['no save']
      const toS2 = ws ? ws.panels.flatMap((p) => (p.connectors || []).filter((c) => c.to === S2).map((c) => c.id)) : ['no save']
      const shapeGone = !domAfter.shapes.some((s) => s.id === S2) && !domAfter.conns.some((c) => c.from === S2 || c.to === S2) && ws !== false && !ws.panels.some((p) => p.id === S2)
      // ── The terminal half. Selected by a MARQUEE (a real drag on the ground
      // that clips T1's corner), which selects without handing the keyboard
      // to the terminal — the case where the canvas itself would take the key.
      const t1 = await panelRect(T1)
      const pidBefore = (await sessionMap(wc)).get(T1)
      const killsBefore = killedPanelIds.length
      let selectedOnlyT1 = false
      let focusAfterMarquee = null
      if (t1) {
        const start = await groundNear(t1.left - 30, t1.bottom + 25, 8, 8)
        if (start) await drag(start, { x: t1.left + 24, y: t1.bottom - 24 })
        selectedOnlyT1 = await js(`(() => { const sel = [...document.querySelectorAll('.panel--selected, .shape--selected')].map((e) => e.getAttribute('data-panel-id')); return sel.length === 1 && sel[0] === '${T1}' })()`)
        focusAfterMarquee = await focusedId()
      }
      await key('Delete')
      await key('Backspace')
      await settle()
      const t1After = await panelRect(T1)
      const pidAfter = (await sessionMap(wc)).get(T1)
      const ws2 = savedWs()
      const termKept = t1After !== null && pidBefore !== undefined && pidAfter === pidBefore && ws2.panels.some((p) => p.id === T1) && !killedPanelIds.slice(killsBefore).includes(T1)
      ok(ID, touchingBefore.length === 2 && shapeGone && dangling.length === 0 && toS2.length === 0 && selectedOnlyT1 === true && focusAfterMarquee === null && termKept,
        JSON.stringify({ S2, touchingBefore, shapeGone, dangling, toS2, selectedOnlyT1, focusAfterMarquee, pidBefore, pidAfter, t1Present: t1After !== null, kills: killedPanelIds.slice(killsBefore) }))
      { const g = await groundNear(host.left + 120, host.bottom - 120, 12, 12); if (g) await press(g.x, g.y) }
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.4 — ⌘D IS DUPLICATE (D4). Silent failure prevented: the
  // chord still toggling the developer overlay (the pre-M390 binding, pinned
  // by nothing), or a duplicate that reuses the original's id (dropped as a
  // duplicate at the next load, lb :357) or lands exactly on top of it.
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.4 ⌘D duplicates a selected shape (a new sh… id, offset down-right, same form and label) and does NOT open the diagnostics overlay; ⌘⌥D opens it'
    try {
      await installKeyProbe()
      const s1 = byId(await shapes(), S1)
      if (s1) await press(s1.cx, s1.cy)
      const before = await shapes()
      await key('D', ['meta'])
      const after = await waitUntil(async () => { const s = await shapes(); return s.length === before.length + 1 ? s : false }, 2500)
      const copy = after ? after.find((s) => !before.some((b) => b.id === s.id)) : null
      const orig = byId(before, S1)
      const overlayAfterD = await js(`document.querySelector('.diagnostics-overlay') !== null`)
      const probeD = await keyProbe()
      await installKeyProbe()
      await key('D', ['meta', 'alt'])
      const overlayAfterAltD = await waitUntil(() => js(`document.querySelector('.diagnostics-overlay') !== null`), 1500)
      const probeAltD = await keyProbe()
      // Close it again (the same chord toggles), and take the copy away.
      if (overlayAfterAltD) await key('D', ['meta', 'alt'])
      const overlayClosed = await js(`document.querySelector('.diagnostics-overlay') === null`)
      if (copy) { const c = byId(await shapes(), copy.id); if (c) { await press(c.cx, c.cy); await key('Delete') } }
      ok(ID,
        copy !== null && orig !== undefined && /^sh\d+$/.test(copy.id) && copy.id !== S1 && copy.form === orig.form && copy.text === orig.text &&
          copy.x > orig.x && copy.y > orig.y && copy.w === orig.w && copy.h === orig.h && overlayAfterD === false && overlayAfterAltD === true && overlayClosed,
        JSON.stringify({ orig, copy, overlayAfterD, overlayAfterAltD, overlayClosed, probeD, probeAltD }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.8 — A CONNECTOR FROM A SHAPE'S PORT. Silent failure
  // prevented: the port drag making a PanelLink (a link means task
  // membership and handoff — a diagram arrow must never, D2), and a release
  // on empty ground cancelling silently instead of making the next step (D11).
  // Run before .5 so the copy has a connected pair to carry.
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.8 a drag from a shape\'s port onto another shape makes a CONNECTOR (the source\'s saved links stay empty); released on empty ground it makes a new step there, connected from the source'
    try {
      const all = await shapes()
      const s3 = byId(all, S3)
      const port = await portCentre(`.shape[data-panel-id="${S1}"] [data-shape-port="e"]`)
      const connsBefore = await connectorsDom()
      if (port && !port.zero && s3) await drag(port, { x: s3.cx, y: s3.cy })
      const connsAfter = await waitUntil(async () => { const c = await connectorsDom(); return c.length === connsBefore.length + 1 ? c : false }, 2000)
      const made = connsAfter ? connsAfter.find((c) => !connsBefore.some((b) => b.id === c.id)) : null
      const ws = await savedWhen((w) => { const p = w.panels.find((q) => q.id === S1); return p !== undefined && (p.connectors || []).some((c) => c.to === S3) })
      const saved1 = ws ? ws.panels.find((p) => p.id === S1) : null
      const links = ws ? ws.panels.flatMap((p) => (p.links || []).map((l) => `${p.id}>${l.to}`)) : ['no save']
      const domLinks = await js(`[...document.querySelectorAll('.link-layer [data-link]')].map((e) => e.getAttribute('data-link'))`)
      // ── Into empty ground: from S3's south port to a clear spot below it.
      const s3now = byId(await shapes(), S3)
      const port2 = await portCentre(`.shape[data-panel-id="${S3}"] [data-shape-port="s"]`)
      const drop = s3now ? await groundNear(s3now.cx, s3now.cy + 150, 100, 60) : null
      const beforeShapes = await shapes()
      if (port2 && !port2.zero && drop) await drag(port2, drop)
      const afterShapes = await waitUntil(async () => { const s = await shapes(); return s.length === beforeShapes.length + 1 ? s : false }, 2500)
      const fresh = afterShapes ? afterShapes.find((s) => !beforeShapes.some((b) => b.id === s.id)) : null
      S4 = fresh ? fresh.id : null
      const editor4 = await waitUntil(async () => { const e = await editorOf(); return e === S4 ? e : false }, 2000)
      await key('Escape')
      await settle()
      const conns4 = await connectorsDom()
      ok(ID,
        port !== null && port.hitsPort === true && made !== null && made.from === S1 && made.to === S3 && saved1 !== null && (saved1.links || []).length === 0 && links.length === 0 && domLinks.length === 0 &&
          (saved1.connectors || []).some((c) => c.to === S3 && c.from === 'e') &&
          fresh !== null && fresh.form === 'process' && fresh.y > s3now.y + s3now.h && conns4.some((c) => c.from === S3 && c.to === S4) && editor4 === S4,
        JSON.stringify({ port, made, saved1, links, domLinks, port2, drop, fresh, editor4 }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.5 — OBJECT COPY IS IN THE APP (D9). Silent failure
  // prevented: a label leaving through the system clipboard — readable by
  // every other app, an ungated outward door — and a paste whose copied
  // connector still points at the ORIGINAL (a copy wired into the old chart).
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.5 with two connected shapes selected, edit:copy puts a content-free marker on the system clipboard (neither label on it) and edit:paste lands two new shapes with a connector between the COPIES'
    try {
      clipboard.writeText('stale text from another app')
      const s1 = byId(await shapes(), S1)
      const s3 = byId(await shapes(), S3)
      if (s1) await press(s1.cx, s1.cy)
      if (s3) await press(s3.cx, s3.cy, ['shift'])
      const selected = (await shapes()).filter((s) => s.selected).map((s) => s.id).sort()
      const focus = await focusedId()
      // navigator.clipboard.writeText refuses a document without focus; a
      // person's ⌘C always has it. The hidden harness window is given it the
      // way a click on the window would.
      wc.focus()
      const hasFocus = await js('document.hasFocus()')
      wc.send('edit:copy')
      const text = await waitUntil(() => { const t = clipboard.readText(); return t !== 'stale text from another app' ? t : false }, 3000)
      const marker = typeof text === 'string' ? text : clipboard.readText()
      const beforeShapes = await shapes()
      const beforeConns = await connectorsDom()
      wc.send(IPC_EVENTS.EDIT_PASTE, marker)
      const afterShapes = await waitUntil(async () => { const s = await shapes(); return s.length === beforeShapes.length + 2 ? s : false }, 3000)
      const copies = afterShapes ? afterShapes.filter((s) => !beforeShapes.some((b) => b.id === s.id)) : []
      const afterConns = await connectorsDom()
      const newConns = afterConns.filter((c) => !beforeConns.some((b) => b.id === c.id))
      const copyIds = new Set(copies.map((c) => c.id))
      const texts = copies.map((c) => c.text).sort()
      // The copies are the selection after a paste: take them away again.
      if (copies.length === 2) await key('Delete')
      ok(ID,
        selected.length === 2 && selected.includes(S1) && selected.includes(S3) && focus === null &&
          typeof text === 'string' && /^2 objects from terminal canvas · [0-9a-z]+$/.test(marker) && !/Alpha|Gamma/.test(marker) &&
          copies.length === 2 && copies.every((c) => /^sh\d+$/.test(c.id)) && JSON.stringify(texts) === JSON.stringify(['Alpha', 'Gamma']) &&
          newConns.length === 1 && copyIds.has(newConns[0].from) && copyIds.has(newConns[0].to),
        JSON.stringify({ selected, focus, hasFocus, marker, copies: copies.map((c) => c.id + ':' + c.text), newConns }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.9 — MIXED EDGES FROM A LIVE OBJECT'S PORT (D11). Silent
  // failure prevented: a terminal-to-shape drag making a LINK (the shape
  // would join the terminal's task, and an arrow in a diagram would carry
  // handoff), and the D11 change breaking the link between two terminals
  // that every task and handoff rests on.
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.9 a drag from a TERMINAL\'s port onto a shape makes a CONNECTOR, not a link; from a terminal onto a terminal it still makes the link it always did'
    try {
      const s3 = byId(await shapes(), S3)
      const port = await portCentre(`.panel[data-panel-id="${T1}"] [data-port="w"]`)
      const beforeConns = await connectorsDom()
      if (port && !port.zero && s3) await drag(port, { x: s3.cx, y: s3.cy })
      const afterConns = await waitUntil(async () => { const c = await connectorsDom(); return c.length === beforeConns.length + 1 ? c : false }, 2000)
      const made = afterConns ? afterConns.find((c) => !beforeConns.some((b) => b.id === c.id)) : null
      const ws = await savedWhen((w) => { const p = w.panels.find((q) => q.id === T1); return p !== undefined && (p.connectors || []).some((c) => c.to === S3) })
      const t1Saved = ws ? ws.panels.find((p) => p.id === T1) : null
      const linksAfterShape = await js(`[...document.querySelectorAll('.link-layer [data-link]')].map((e) => e.getAttribute('data-link'))`)
      // ── Terminal to terminal: T1's south port onto T2.
      const port2 = await portCentre(`.panel[data-panel-id="${T1}"] [data-port="s"]`)
      const t2 = await panelRect(T2)
      const connsBeforeLink = await connectorsDom()
      if (port2 && !port2.zero && t2) await drag(port2, { x: t2.cx, y: t2.cy })
      const linked = await waitUntil(async () => { const l = await js(`[...document.querySelectorAll('.link-layer [data-link]')].map((e) => e.getAttribute('data-link'))`); return l.includes(`${T1} ${T2}`) ? l : false }, 2000)
      const connsAfterLink = await connectorsDom()
      const ws2 = await savedWhen((w) => { const p = w.panels.find((q) => q.id === T1); return p !== undefined && (p.links || []).some((l) => l.to === T2) })
      const t1Saved2 = ws2 ? ws2.panels.find((p) => p.id === T1) : null
      ok(ID,
        port !== null && port.hitsPort === true && made !== null && made.from === T1 && made.to === S3 && t1Saved !== null && (t1Saved.links || []).length === 0 && !linksAfterShape.some((l) => l.includes(S3)) &&
          linked !== false && connsAfterLink.length === connsBeforeLink.length && t1Saved2 !== null && (t1Saved2.links || []).some((l) => l.to === T2) && !(t1Saved2.connectors || []).some((c) => c.to === T2),
        JSON.stringify({ port, made, t1Saved: t1Saved && { links: t1Saved.links, connectors: t1Saved.connectors }, linksAfterShape, port2, linked, t1Saved2: t1Saved2 && { links: t1Saved2.links, connectors: t1Saved2.connectors } }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.12 — THE LIVING FLOWCHART (M393). Silent failure
  // prevented: a shape wired to an agent that says a DIFFERENT word from the
  // rail (two vocabularies for one state), or one that never updates — a
  // dashboard frozen at the state it had when it was drawn.
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.12 a shape connected to a terminal shows a live chip whose word is the terminal\'s rail word, and it follows the agent: agent:state wants-you → both read "needs you"'
    try {
      const read = () => js(`(() => {
        const chip = document.querySelector('.shape[data-panel-id="${S3}"] [data-shape-live]')
        const tail = document.querySelector('[data-rail-row="${T1}"] .rail-row__tail')
        return { chip: chip ? chip.textContent : null, chipFor: chip ? chip.getAttribute('data-shape-live') : null, tone: chip ? chip.getAttribute('data-tone') : null, rail: tail ? tail.textContent : null }
      })()`)
      const first = await waitUntil(async () => { const r = await read(); return r.chip !== null && r.rail !== null ? r : false }, 4000) || await read()
      wc.send('agent:state', { panelId: T1, state: 'wants-you' })
      const second = await waitUntil(async () => { const r = await read(); return r.chip === 'needs you' && r.rail === 'needs you' ? r : false }, 3000) || await read()
      wc.send('agent:state', { panelId: T1, state: 'idle' })
      const third = await waitUntil(async () => { const r = await read(); return r.chip !== 'needs you' ? r : false }, 3000) || await read()
      ok(ID,
        first.chip !== null && first.chipFor === T1 && first.chip === first.rail && first.chip !== '' &&
          second.chip === 'needs you' && second.rail === 'needs you' && second.tone === 'needs-you' && third.chip === third.rail && third.chip !== 'needs you',
        JSON.stringify({ first, second, third }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.13 — QUICK-CONNECT LANDS WHERE IT WAS RELEASED, with the
  // camera panned AND zoomed. Silent failure prevented: a release point
  // converted to world space with the drag-math mistake (screenToWorld of a
  // DIFFERENCE, or a host offset dropped) — right at the origin and scale 1,
  // wrong by the pan everywhere else, so the new step appears somewhere the
  // person did not put it (a shot run saw one ~158px off). The placement
  // RULE differs by source, and both halves are asserted as designed
  // (useConnectors.extend): from a SHAPE's port the new step's FACING port
  // lands on the release point (pulled down from a south port it hangs below
  // the cursor, its top-centre on it); from a panel's port — which has no
  // port side — its CENTRE does.
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.13 with the camera panned and zoomed, a port drag released on empty ground inside the host makes the new step exactly there: from a shape\'s south port its top-centre (the facing port) is within 12px of the release, from a terminal\'s port its centre is'
    try {
      await zoomToScale(wc, 0.8)
      await js(`(() => { const h = document.querySelector('.canvas'); const r = h.getBoundingClientRect(); h.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaMode: 0, deltaX: 90, deltaY: 50, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
      await settle()
      const vp = await js('window.__m4aViewport()')
      const hb = await hostBox()
      const inside = (p) => p !== null && p.x > hb.left && p.x < hb.right && p.y > hb.top && p.y < hb.bottom
      const land = async (portSel, near, mx, my) => {
        const port = await portCentre(portSel)
        const drop = near ? await groundNear(near.x, near.y, mx, my) : null
        const before = await shapes()
        if (port && !port.zero && drop) await drag(port, drop)
        const after = await waitUntil(async () => { const s = await shapes(); return s.length === before.length + 1 ? s : false }, 2500)
        const fresh = after ? after.find((x) => !before.some((b) => b.id === x.id)) : null
        const box = fresh ? await js(`(() => { const r = document.querySelector('.shape[data-panel-id="${fresh.id}"]').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, top: r.top } })()`) : null
        if (fresh) { await key('Escape'); await settle() }
        return { port, drop, fresh: fresh && fresh.id, box,
          centreOff: box && drop ? Math.round(Math.hypot(box.cx - drop.x, box.cy - drop.y) * 10) / 10 : null,
          facingOff: box && drop ? Math.round(Math.hypot(box.cx - drop.x, box.top - drop.y) * 10) / 10 : null }
      }
      const s4 = byId(await shapes(), S4)
      const fromShape = await land(`.shape[data-panel-id="${S4}"] [data-shape-port="s"]`, s4 ? { x: s4.cx, y: s4.cy + 140 } : null, 110, 80)
      const shapeConn = fromShape.fresh ? (await connectorsDom()).some((c) => c.from === S4 && c.to === fromShape.fresh) : false
      // A panel's port lands on anything within a LINK's reach (90px), so the
      // release is taken with room around it.
      const t2 = await panelRect(T2)
      const fromTerm = await land(`.panel[data-panel-id="${T2}"] [data-port="s"]`, t2 ? { x: t2.cx, y: t2.bottom + 150 } : null, 130, 110)
      const termConn = fromTerm.fresh ? (await connectorsDom()).some((c) => c.from === T2 && c.to === fromTerm.fresh) : false
      ok(ID,
        Math.abs(vp.scale - 0.8) < 0.04 && vp.x !== 0 && vp.y !== 0 &&
          inside(fromShape.drop) && fromShape.fresh !== null && shapeConn && fromShape.facingOff !== null && fromShape.facingOff <= 12 &&
          inside(fromTerm.drop) && fromTerm.fresh !== null && termConn && fromTerm.centreOff !== null && fromTerm.centreOff <= 12,
        JSON.stringify({ vp, host: hb, fromShape, shapeConn, fromTerm, termConn }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.6 — A PASTED DIAGRAM IS INERT (the third product rule).
  // Silent failure prevented: pasted text starting a process or carrying a
  // `click … callback` into anything that can act; a chart that lands as loose
  // shapes instead of one group; and a line the parser dropped that nobody is
  // told about — the import sentence is the only place a person learns the
  // diagram they pasted is not the diagram they got.
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.6 edit:paste of Mermaid text with no panel focused makes 3 shapes (process, decision, terminator) and 2 connectors (one labelled yes) in ONE group, starts NOTHING (no pty:create, no chat, the session list unchanged), and says a line was left out'
    try {
      const g = await groundNear(host.left + 120, host.bottom - 100, 20, 20)
      if (g) await press(g.x, g.y)
      const focus = await focusedId()
      const creates0 = createdPanelIds.length
      const chats0 = chatSpawns.length
      const sessions0 = (await listSessions(wc)).length
      const registry0 = await js(`window.__m4aSessions().length`)
      const groups0 = (savedWs().groups || []).length
      const beforeShapes = await shapes()
      const beforeConns = await connectorsDom()
      const text = 'flowchart TD\n A[Build] --> B{Ok?}\n B -->|yes| C([Done])\n click A callback'
      wc.send(IPC_EVENTS.EDIT_PASTE, text)
      const afterShapes = await waitUntil(async () => { const s = await shapes(); return s.length === beforeShapes.length + 3 ? s : false }, 3000)
      // Read while it is up (a done toast lives 3.2 s).
      const sentence = await waitUntil(async () => (await toasts()).find((t) => /left out/.test(t)) || false, 2000)
      const toastsSeen = await toasts()
      await sleep(600) // a NEGATIVE follows: give any spawn the chance to happen
      const made = afterShapes ? afterShapes.filter((s) => !beforeShapes.some((b) => b.id === s.id)) : []
      const byText = (t) => made.find((s) => s.text === t)
      const afterConns = await connectorsDom()
      const newConns = afterConns.filter((c) => !beforeConns.some((b) => b.id === c.id))
      const madeIds = new Set(made.map((s) => s.id))
      const ws = await savedWhen((w) => (w.groups || []).length > groups0)
      const group = ws ? (ws.groups || []).find((gr) => gr.panelIds.length === 3 && gr.panelIds.every((id) => madeIds.has(id))) : null
      const creates = createdPanelIds.slice(creates0)
      const sessions1 = (await listSessions(wc)).length
      const registry1 = await js(`window.__m4aSessions().length`)
      ok(ID,
        focus === null && made.length === 3 && byText('Build')?.form === 'process' && byText('Ok?')?.form === 'decision' && byText('Done')?.form === 'terminator' &&
          newConns.length === 2 && newConns.every((c) => madeIds.has(c.from) && madeIds.has(c.to)) && newConns.filter((c) => c.label === 'yes').length === 1 &&
          group !== null && group !== undefined && creates.length === 0 && chatSpawns.length === chats0 && sessions1 === sessions0 && registry1 === registry0 &&
          typeof sentence === 'string' && /1 line left out/.test(sentence),
        JSON.stringify({ focus, made: made.map((s) => `${s.id}:${s.form}:${s.text}`), newConns: newConns.map((c) => `${c.from}>${c.to}:${c.label}`), group, creates, chats: chatSpawns.length - chats0, sessions0, sessions1, registry0, registry1, sentence, toasts: toastsSeen }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.7 — THE AGENT'S DOOR. Silent failure prevented: a verb
  // that answers `ran` and changes nothing (the M203 `tidy` shape the ledger
  // records), and a teammate's chat reading a file the person never chose —
  // `flowchart-import` is on TEAMMATE_REFUSED_VERBS, and the SAME line from
  // the person's own shell runs, so the refusal is the rule, not a dead door.
  // ---------------------------------------------------------------------
  let D = null
  {
    const ID = 'flowchart.app.7 canvas:plan `shape-add decision …`, `connect`, and `flowchart-layout down` each answer ran and change the canvas; `flowchart-import` from a teammate\'s chat is refused by name while the same line from the person imports'
    try {
      const before = await shapes()
      const added = await plan('shape-add decision Is it valid')
      const afterAdd = await waitUntil(async () => { const s = await shapes(); return s.length === before.length + 1 ? s : false }, 2000)
      const dec = afterAdd ? afterAdd.find((s) => !before.some((b) => b.id === s.id)) : null
      D = dec ? dec.id : null
      const connsBefore = await connectorsDom()
      const connected = await plan(`connect ${D} ${S1}`)
      const connsAfter = await waitUntil(async () => { const c = await connectorsDom(); return c.some((x) => x.from === D && x.to === S1) ? c : false }, 2000)
      const chart = [D, S1, S3, S4]
      const rectsBefore = Object.fromEntries((await shapes()).filter((s) => chart.includes(s.id)).map((s) => [s.id, { x: s.x, y: s.y }]))
      const laid = await plan(`flowchart-layout down ${D}`)
      await sleep(700) // the layout animates (a camera-tier move, ≤ 320 ms), then commits once
      const rectsAfter = Object.fromEntries((await shapes()).filter((s) => chart.includes(s.id)).map((s) => [s.id, { x: s.x, y: s.y }]))
      const moved = chart.filter((id) => rectsBefore[id] && rectsAfter[id] && (rectsBefore[id].x !== rectsAfter[id].x || rectsBefore[id].y !== rectsAfter[id].y))
      // Down: each step of D → S1 → S3 → S4 sits below the one before it.
      const ranked = chart.every((id, i) => i === 0 || (rectsAfter[id] && rectsAfter[chart[i - 1]] && rectsAfter[id].y > rectsAfter[chart[i - 1]].y))
      // ── The teammate refusal, and its non-vacuity.
      const dir = mkdtempSync(join(tmpdir(), 'tc panels flowchart '))
      const file = join(dir, 'teammate-flow.mmd')
      writeFileSync(file, 'flowchart LR\n P[Plan] --> Q[Ship]\n')
      const beforeImport = (await shapes()).length
      const byTeammate = await plan(`flowchart-import ${file}`, { panelId: T2, teammateId: 'tm-flow' })
      await settle()
      const afterTeammate = (await shapes()).length
      const byPerson = await plan(`flowchart-import ${file}`)
      const afterPerson = await waitUntil(async () => { const n = (await shapes()).length; return n === beforeImport + 2 ? n : false }, 3000) || (await shapes()).length
      // Two imported shapes are now the selection; take them away.
      if (afterPerson === beforeImport + 2) await key('Delete')
      ok(ID,
        added?.kind === 'ran' && dec !== null && dec.form === 'decision' && dec.text === 'Is it valid' &&
          connected?.kind === 'ran' && connsAfter !== false && connsAfter.length === connsBefore.length + 1 &&
          laid?.kind === 'ran' && moved.length > 0 && ranked &&
          byTeammate?.kind === 'refused' && /teammate/.test(byTeammate.reason) && afterTeammate === beforeImport &&
          byPerson?.kind === 'ran' && afterPerson === beforeImport + 2,
        JSON.stringify({ added, D, dec, connected, laid, moved, ranked, rectsAfter, byTeammate, afterTeammate, byPerson, beforeImport, afterPerson }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.10 — A CHART SURVIVES A RELOAD EXACTLY. Silent failure
  // prevented: a field the writer forgets (fromPanels copies field by field —
  // a dropped key is legal TypeScript) or the reader drops as malformed,
  // which costs a restyled shape its colour or a line its label on the next
  // launch with nothing red anywhere.
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.10 after a flush and a reload every shape (form, label, fill, line, text colour, rect) and every connector (ends, route as drawn, arrowheads, line, dash, label) is exactly what it was'
    try {
      const cx = (await connectorsDom()).find((c) => c.from === D && c.to === S1)
      const replies = []
      if (D !== null) {
        for (const line of [`shape-style ${D} fill yellow`, `shape-style ${D} line violet`, `shape-style ${D} text muted`]) replies.push(await plan(line))
      }
      if (cx) {
        for (const line of [`connector-style ${cx.id} route curved`, `connector-style ${cx.id} arrows both`, `connector-style ${cx.id} dashed on`, `connector-style ${cx.id} label maybe`]) replies.push(await plan(line))
      }
      await settle()
      const snapshot = async () => {
        const s = (await shapes()).map(({ cx: _a, cy: _b, selected: _c, editing: _d, ...rest }) => rest).sort((a, b) => a.id.localeCompare(b.id))
        const c = (await connectorsDom()).sort((a, b) => a.id.localeCompare(b.id))
        return { s, c }
      }
      const before = await snapshot()
      const styled = before.s.find((x) => x.id === D)
      const styledC = cx ? before.c.find((x) => x.id === cx.id) : null
      // The renderer's save must have reached the store before the flush.
      await savedWhen((w) => { const p = w.panels.find((q) => q.id === D); const h = w.panels.find((q) => (q.connectors || []).some((k) => cx && k.id === cx.id)); return p !== undefined && p.shape && p.shape.fill === 'yellow' && h !== undefined && h.connectors.find((k) => k.id === cx.id).label === 'maybe' })
      const storedBefore = JSON.stringify(savedWs().panels.filter((p) => p.kind === 'shape' || p.connectors).map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, w: p.w, h: p.h, shape: p.shape, connectors: p.connectors })))
      flushLayoutStore()
      await reload()
      await waitUntil(async () => (await shapes()).length === before.s.length && (await connectorsDom()).length === before.c.length, 8000)
      await settle()
      const after = await snapshot()
      const storedAfter = JSON.stringify(savedWs().panels.filter((p) => p.kind === 'shape' || p.connectors).map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, w: p.w, h: p.h, shape: p.shape, connectors: p.connectors })))
      const diff = []
      for (const a of before.s) { const b = after.s.find((x) => x.id === a.id); if (JSON.stringify(a) !== JSON.stringify(b)) diff.push({ was: a, now: b }) }
      for (const a of before.c) { const b = after.c.find((x) => x.id === a.id); if (JSON.stringify(a) !== JSON.stringify(b)) diff.push({ was: a, now: b }) }
      ok(ID,
        replies.length === 7 && replies.every((r) => r?.kind === 'ran') && styled && styled.fill === 'yellow' && styled.stroke === 'violet' && styled.ink === 'muted' &&
          styledC && styledC.dashed === true && styledC.heads === 2 && styledC.label === 'maybe' && /C/.test(styledC.d) &&
          before.s.length >= 5 && before.c.length >= 4 && after.s.length === before.s.length && after.c.length === before.c.length && diff.length === 0 && storedAfter === storedBefore,
        JSON.stringify({ replies, styled, styledC, shapes: before.s.length, conns: before.c.length, diff: diff.slice(0, 3), storedSame: storedAfter === storedBefore }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.app.11 — THE FAR TIER KEEPS THE SILHOUETTE. Silent failure
  // prevented: shapes routed through a path that turns every non-terminal
  // body into a glyph card at far zoom (PanelFrame.renderFar, the reason D1
  // gave them their own layer) — a diamond read from across the canvas as a
  // card, or not painted at all; and labels drawn at a size nobody can read.
  // ---------------------------------------------------------------------
  {
    const ID = 'flowchart.app.11 zoomed out to ~0.12 every shape is still drawn (its outline has a path and a painted box) and every label is hidden; at a reading zoom (≥ 0.5) the same labels were visible'
    try {
      const read = () => js(`(() => {
        const world = document.querySelector('.world')
        const list = [...document.querySelectorAll('.shape')].map((e) => {
          const o = e.querySelector('.shape__outline'); const r = o ? o.getBoundingClientRect() : { width: 0, height: 0 }
          const l = e.querySelector('.shape__label')
          return { id: e.getAttribute('data-panel-id'), d: o ? (o.getAttribute('d') || '') : '', w: r.width, h: r.height, label: l ? getComputedStyle(l).visibility : 'none' }
        })
        return { detail: world ? world.getAttribute('data-detail') : null, scale: window.__m4aScale(), list }
      })()`)
      await zoomToScale(wc, 1)
      const near = await read()
      await zoomToScale(wc, 0.12)
      const far = await read()
      await zoomToScale(wc, 1)
      const labelled = near.list.filter((s) => s.label !== 'none')
      ok(ID,
        near.scale >= 0.5 && far.list.length >= 5 && far.list.length === near.list.length && far.scale >= 0.1 && far.scale <= 0.14 && (far.detail === 'block' || far.detail === 'cluster') &&
          far.list.every((s) => s.d.length > 4 && s.w > 0 && s.h > 0) && far.list.filter((s) => s.label !== 'none').every((s) => s.label === 'hidden') &&
          labelled.length >= 3 && labelled.every((s) => s.label === 'visible'),
        JSON.stringify({ near: { detail: near.detail, scale: near.scale, labels: labelled.map((s) => s.label) }, far: { detail: far.detail, scale: far.scale, sample: far.list.slice(0, 4) } }))
    } catch (error) {
      ok(ID, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // flowchart.perf.* — 200 SHAPES, 260 CONNECTORS, THROUGH THE REAL STORE.
  // The shape layer exists because 200 PanelFrames would re-render ~4k nodes
  // every camera frame (D1); the connector cache exists because an
  // orthogonal route searches around the shapes between its ends. Neither is
  // visible in a plain-node check. Seeded as orchestrate's fixtures are
  // (save + flushSync + reload), measured over 90 rAF frames each, printed
  // as MEASURE lines. Asserted: structure, the drags moving what they should
  // (and re-routing their lines), and p95 < 250 ms — a hang, not a budget.
  // ---------------------------------------------------------------------
  {
    const ID1 = 'flowchart.perf.1 a 200-shape grid with 260 connectors seeded through the real store renders every shape (200 .shape) and every connector (260 [data-connector-id])'
    let reportedP1 = false
    const ID2 = 'flowchart.perf.2 panning, pinch-zooming, dragging one shape and dragging a 40-shape selection over the 200-shape chart each complete 90 measured frames with p95 under 250 ms; each drag moves exactly its selection and re-routes the lines it carries'
    try {
      const COLS = 20
      const ROWS = 10
      const DX = 240
      const DY = 150
      const sid = (r, c) => `sh${1000 + r * COLS + c}`
      let cxn = 5000
      const panels = []
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const connectors = []
          // Every shape to its right neighbour (190); down on every third
          // column (7 × 9 = 63); seven long hops (two rows down, five
          // across) that route around the boxes between — 260 in all.
          if (c < COLS - 1) connectors.push({ id: `cx${cxn++}`, to: sid(r, c + 1) })
          if (r < ROWS - 1 && c % 3 === 0) connectors.push({ id: `cx${cxn++}`, to: sid(r + 1, c) })
          if (r === 1 && c < 14 && c % 2 === 0) connectors.push({ id: `cx${cxn++}`, to: sid(r + 2, c + 5), route: 'orthogonal' })
          panels.push({ kind: 'shape', rect: { id: sid(r, c), x: c * DX, y: r * DY, w: 160, h: 72 }, z: 1 + r * COLS + c, shape: { form: (r + c) % 7 === 3 ? 'decision' : 'process', text: `Step ${r}.${c}` }, ...(connectors.length === 0 ? {} : { connectors }) })
        }
      }
      const connectorTotal = panels.reduce((n, p) => n + (p.connectors ? p.connectors.length : 0), 0)
      // Centre the middle of the grid in the host at 0.5 — above the summary
      // tier, where every shape is drawn at full detail.
      const SCALE = 0.5
      const mid = { x: (COLS * DX) / 2, y: (ROWS * DY) / 2 }
      const camera = { x: Math.round(host.width / 2 - mid.x * SCALE), y: Math.round(host.height / 2 - mid.y * SCALE), scale: SCALE }
      layoutStore.save({ panels: fromPanels(panels), camera, selectedId: null, focusedId: null })
      flushLayoutStore()
      await reload()
      const counts = await waitUntil(async () => { const n = await js(`({ shapes: document.querySelectorAll('.shape').length, connectors: document.querySelectorAll('.connector-layer [data-connector-id]').length })`); return n.shapes === 200 && n.connectors === connectorTotal ? n : false }, 15000) ||
        await js(`({ shapes: document.querySelectorAll('.shape').length, connectors: document.querySelectorAll('.connector-layer [data-connector-id]').length })`)
      await settle()
      reportedP1 = true
      ok(ID1, connectorTotal === 260 && counts.shapes === 200 && counts.connectors === 260, JSON.stringify({ connectorTotal, counts, camera, host }))

      const summarise = (label, frames, extra = {}) => {
        const sorted = [...frames].sort((a, b) => a - b)
        const mean = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length)
        const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
        const row = { label, frames: frames.length, meanMs: Math.round(mean * 10) / 10, p95Ms: Math.round((p95 ?? NaN) * 10) / 10, ...extra }
        console.log(`MEASURE ${JSON.stringify(row)}`)
        return row
      }
      const heapMB = () => js(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null`)
      // (a) and (b): the camera driven by a wheel event on the host every frame.
      const wheelFrames = (pinch) => js(`new Promise((resolve) => {
        const host = document.querySelector('.canvas'); const r = host.getBoundingClientRect()
        const dts = []; let last = performance.now(); let i = 0
        const step = (now) => { dts.push(now - last); last = now; i += 1
          const sign = i % 30 < 15 ? 1 : -1
          host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaMode: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
            ctrlKey: ${pinch ? 'true' : 'false'}, deltaX: ${pinch ? '0' : 'sign * 24'}, deltaY: ${pinch ? 'sign * 8' : 'sign * 12'} }))
          if (i < 91) requestAnimationFrame(step); else resolve(dts.slice(1)) }
        requestAnimationFrame(step) })`)
      const rows = []
      rows.push(summarise('200 shapes · pan (wheel every frame)', await wheelFrames(false), { heapMB: await heapMB() }))
      rows.push(summarise('200 shapes · pinch-zoom (ctrl-wheel every frame)', await wheelFrames(true), { heapMB: await heapMB() }))
      // Back to the seeded camera, so the drags start where the grid is.
      await reload()
      await waitUntil(async () => (await js(`document.querySelectorAll('.shape').length`)) === 200, 10000)
      await settle()
      // (c) and (d): a real drag — sendInputEvent moves, one per rendered
      // frame (main waits for the renderer's next rAF before each), while a
      // recorder in the renderer times every frame.
      const dragFrames = async (id, label) => {
        const at = await js(`(() => { const e = document.querySelector('.shape[data-panel-id="${id}"] .shape__outline'); if (!e) return null; const r = e.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); return { x, y, hit: document.elementFromPoint(x, y) === e } })()`)
        if (!at) return null
        await js(`(() => { window.__fcRec = { dts: [], stop: false }; let last = performance.now(); const step = (now) => { const r = window.__fcRec; r.dts.push(now - last); last = now; if (!r.stop) requestAnimationFrame(step) }; requestAnimationFrame(step); return true })()`)
        wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 })
        for (let i = 1; i <= 90; i++) {
          await js('new Promise((r) => requestAnimationFrame(() => r(true)))')
          wc.sendInputEvent({ type: 'mouseMove', x: at.x + i * 2, y: at.y + i, button: 'left', modifiers: ['leftButtonDown'] })
        }
        await js('new Promise((r) => requestAnimationFrame(() => r(true)))')
        wc.sendInputEvent({ type: 'mouseUp', x: at.x + 180, y: at.y + 90, button: 'left', clickCount: 1 })
        const frames = await js(`(() => { window.__fcRec.stop = true; return window.__fcRec.dts.slice(1) })()`)
        await settle()
        return { at, row: summarise(label, frames, { heapMB: await heapMB() }) }
      }
      const rectOf = async (ids) => Object.fromEntries((await shapes()).filter((s) => ids.includes(s.id)).map((s) => [s.id, { x: s.x, y: s.y }]))
      const routesOf = async (id) => Object.fromEntries((await connectorsDom()).filter((c) => c.from === id || c.to === id).map((c) => [c.id, c.d]))
      // (c) one shape in the middle of the grid.
      // (5, 9): a column with down-lines, so four lines meet it (left, right, up, down).
      const one = sid(5, 9)
      const oneBefore = await rectOf([one])
      const routesBefore = await routesOf(one)
      const single = await dragFrames(one, '200 shapes · drag one shape (its lines re-route)')
      const oneAfter = await rectOf([one])
      const routesAfter = await routesOf(one)
      const scaleNow = await js('window.__m4aScale()')
      const expectDx = 180 / scaleNow
      const expectDy = 90 / scaleNow
      const singleMoved = oneBefore[one] && oneAfter[one] && Math.abs(oneAfter[one].x - oneBefore[one].x - expectDx) < 2 && Math.abs(oneAfter[one].y - oneBefore[one].y - expectDy) < 2
      const rerouted = Object.keys(routesBefore).length >= 3 && Object.keys(routesBefore).every((k) => routesAfter[k] !== undefined && routesAfter[k] !== routesBefore[k])
      // (d) the same drag with 40 shapes selected: the 40 on screen nearest the
      // dragged one, taken with ⇧-presses (real input), then a plain press on
      // a member keeps the selection and moves all 40.
      const lead = sid(4, 10)
      const hb = await hostBox()
      const visible = (await shapes()).filter((s) => s.cx > hb.left + 20 && s.cx < hb.right - 20 && s.cy > hb.top + 20 && s.cy < hb.bottom - 20)
      const leadNow = byId(visible, lead)
      const pick = leadNow ? [...visible].sort((a, b) => Math.hypot(a.cx - leadNow.cx, a.cy - leadNow.cy) - Math.hypot(b.cx - leadNow.cx, b.cy - leadNow.cy)).slice(0, 40) : []
      { const g = await groundNear(hb.left + hb.width / 2, hb.top + hb.height / 2, 4, 4); if (g) await press(g.x, g.y) } // clear the selection on the ground
      for (const [i, s] of pick.entries()) await press(s.cx, s.cy, i === 0 ? [] : ['shift'])
      const selectedIds = (await shapes()).filter((s) => s.selected).map((s) => s.id)
      const manyBefore = await rectOf(pick.map((s) => s.id))
      const many = await dragFrames(lead, '200 shapes · drag a 40-shape selection (multi-move)')
      const manyAfter = await rectOf(pick.map((s) => s.id))
      const deltas = pick.map((s) => manyBefore[s.id] && manyAfter[s.id] ? `${Math.round(manyAfter[s.id].x - manyBefore[s.id].x)},${Math.round(manyAfter[s.id].y - manyBefore[s.id].y)}` : 'missing')
      const oneDelta = new Set(deltas)
      const unselectedStill = (await shapes()).filter((s) => !pick.some((p) => p.id === s.id)).length
      const measured = [...rows, single && single.row, many && many.row].filter(Boolean)
      ok(ID2,
        measured.length === 4 && measured.every((r) => r.frames >= 60 && Number.isFinite(r.meanMs) && Number.isFinite(r.p95Ms) && r.p95Ms < 250) &&
          single && single.at.hit && singleMoved && rerouted &&
          pick.length === 40 && selectedIds.length === 40 && oneDelta.size === 1 && !oneDelta.has('missing') && !oneDelta.has('0,0') && unselectedStill === 160,
        JSON.stringify({ measured, single: single && single.at, singleMoved, oneBefore, oneAfter, expectDx, expectDy, rerouted, routes: Object.keys(routesBefore).length, picked: pick.length, selected: selectedIds.length, deltas: [...oneDelta] }))
    } catch (error) {
      if (!reportedP1) ok(ID1, false, `threw: ${error && error.stack ? error.stack : error}`)
      ok(ID2, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }
  // app.getAppMetrics is read by nothing here; kept out of the destructure's way.
  void app
})
