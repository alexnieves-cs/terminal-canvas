/* Verifies terminals on the canvas in a real renderer.
   Run with: npm run build && npm run verify:panels

   Check 4 is the reason this file exists: culling must not kill a PTY. That
   failure is silent in a running app — the panel returns looking like a fresh
   terminal — so it has to be caught mechanically. pty:list makes it possible. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { app, BrowserWindow } = require('electron')

// This script is its own Electron entry point (not out/main/index.js), so
// nothing has registered ipcMain handlers for the pty:* channels the built
// renderer calls. Bundle and wire up the same pieces main/index.ts wires up
// at real startup, mirroring the pattern verify-ipc-surface.cjs and
// verify-window-lifecycle.cjs already use for this exact problem.
const ENTRY_OUT = join(__dirname, '..', 'out', 'verify', 'panels-entry.cjs')
buildSync({
  entryPoints: [join(__dirname, 'panels-entry.cjs')],
  outfile: ENTRY_OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
const { registerIpcHandlers, PtyManager, resolveShellEnv } = require(ENTRY_OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Polls `fn` until it returns a truthy value or `timeoutMs` elapses, then
 * returns whatever the last call produced (truthy or not). Lets a check wait
 * on the actual condition it cares about instead of a guessed clock delay —
 * the delay only has to be a safe UPPER bound, not a measured value.
 */
const waitUntil = async (fn, timeoutMs, intervalMs = 50) => {
  const start = Date.now()
  let value = await fn()
  while (!value && Date.now() - start < timeoutMs) {
    await sleep(intervalMs)
    value = await fn()
  }
  return value
}

const liveCount = (wc) =>
  wc.executeJavaScript(`document.querySelectorAll('.panel__slot .xterm').length`)
const cardCount = (wc) =>
  wc.executeJavaScript(`document.querySelectorAll('.panel__card').length`)
// pty:list's full records, not just a count — check 4/5 need pid identity,
// not a number that a kill-and-respawn could still satisfy.
const listSessions = (wc) => wc.executeJavaScript(`window.canvas.pty.list()`)
const sessionMap = async (wc) => new Map((await listSessions(wc)).map((s) => [s.panelId, s.pid]))
/**
 * Waits until pty:list has the SAME length on two consecutive reads before
 * returning it. Snapshotting after the first live terminal appears is not
 * enough: seed panels spawn concurrently, so `sessionsBefore` could hold one
 * of four sessions and a later kill of the other three would pass check 4
 * silently — the exact failure this suite's central check exists to catch.
 */
const settledSessionMap = async (wc, timeoutMs = 10000, intervalMs = 200) => {
  const start = Date.now()
  let previous = -1
  let map = await sessionMap(wc)
  while (Date.now() - start < timeoutMs) {
    if (map.size > 0 && map.size === previous) return map
    previous = map.size
    await sleep(intervalMs)
    map = await sessionMap(wc)
  }
  return map
}

const zoomTo = (wc, key) =>
  wc.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', metaKey: true })), true`
  )

/**
 * True only if every panelId present in `before` is still present in `after`
 * with the IDENTICAL pid — i.e. that session was never killed, even briefly.
 * `after` may have MORE entries than `before` (new panels scrolling into
 * view legitimately spawn their own first session); it must never have
 * fewer, and never a changed pid for an id both maps share.
 */
const pidsPreserved = (before, after) => {
  const changed = []
  for (const [panelId, pid] of before) {
    const now = after.get(panelId)
    if (now !== pid) changed.push(`${panelId}: ${pid} -> ${now ?? 'MISSING'}`)
  }
  return { ok: changed.length === 0, changed }
}

app.on('window-all-closed', () => {})

const WATCHDOG_MS = 60000

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // main/index.ts resolves and caches the login-shell env before the window
  // (and therefore before any pty:create) exists. Skipping this here let
  // every seed panel's concurrent pty:create race the same uncached probe —
  // each forked its OWN login zsh (visible as N "[shell-env] resolved" log
  // lines instead of one), a path the real app never takes, and it ate into
  // the fixed settle budget below for no reason.
  await resolveShellEnv()

  // Same wiring main/index.ts does at real startup: a PtyManager that reaches
  // this window's webContents, registered against the pty:* channels the
  // renderer's window.canvas.pty bridge calls.
  const ptyManager = new PtyManager(() => win.webContents)
  registerIpcHandlers(ptyManager)

  // A hung infrastructure call (e.g. a renderer crash mid-executeJavaScript)
  // must fail the run, not hang it forever — which is exactly what happened
  // in this file's own RED run, when a rejected pty:list left the async body
  // stuck with no path to app.exit(). This is the backstop for that class of
  // failure, not a substitute for fixing the specific cause when it recurs.
  let watchdogFired = false
  const watchdog = setTimeout(() => {
    watchdogFired = true
    console.error(`\nFAIL  watchdog — run did not finish within ${WATCHDOG_MS}ms`)
    ptyManager.killAll()
    app.exit(1)
  }, WATCHDOG_MS)

  try {
    await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html')).catch(() => {})
    const wc = win.webContents

    // Shells must actually spawn; wait for the first live terminal rather
    // than guessing how long that takes.
    await waitUntil(async () => (await liveCount(wc)) > 0, 6000)

    const live = await liveCount(wc)
    const cards = await cardCount(wc)
    const sessionsBefore = await settledSessionMap(wc)
    ok('1 on-screen panels are live terminals with off-screen panels carded',
      live > 0 && cards > 0, `live=${live} cards=${cards}`)

    ok('2 live panels never exceed the context budget', live <= 8, `live=${live}`)

    // Cmd+1 fits every panel on screen, which drops scale far below
    // LIVE_MIN_SCALE and must demote everything unfocused. Wait on the
    // actual demotion instead of a flat sleep; DEMOTE_DELAY_MS (250ms) is
    // the timer's own delay, so give real headroom above it for the effect
    // and the IPC round-trip that follows.
    await zoomTo(wc, '1')
    const liveAfterZoomOut = await waitUntil(
      async () => {
        const n = await liveCount(wc)
        return n < live ? n : false
      },
      3000
    )
    const cardsAfterZoomOut = await cardCount(wc)
    const sessionsAfterZoomOut = await sessionMap(wc)

    ok('3 zooming out demotes panels to cards',
      liveAfterZoomOut !== false && liveAfterZoomOut < live && cardsAfterZoomOut > cards,
      `live ${live} -> ${liveAfterZoomOut}, cards ${cards} -> ${cardsAfterZoomOut}`)

    {
      const { ok: preserved, changed } = pidsPreserved(sessionsBefore, sessionsAfterZoomOut)
      ok('4 demotion does not kill a single PTY',
        preserved && sessionsBefore.size > 0,
        preserved
          ? `${sessionsBefore.size} session(s) unchanged: ${[...sessionsAfterZoomOut]
              .map(([id, pid]) => `${id}=${pid}`).join(', ')}`
          : `pid mismatch: ${changed.join('; ')}`)
    }

    // Cmd+0 back to 100%: the same sessions must come back, not new ones.
    await zoomTo(wc, '0')
    await waitUntil(async () => (await liveCount(wc)) > 0, 3000)
    const sessionsAfterZoomIn = await sessionMap(wc)
    const { ok: preservedAfterZoomIn, changed: changedAfterZoomIn } =
      pidsPreserved(sessionsBefore, sessionsAfterZoomIn)
    ok('5 promotion reuses the existing sessions rather than spawning new ones',
      preservedAfterZoomIn && (await liveCount(wc)) > 0,
      preservedAfterZoomIn
        ? `${sessionsBefore.size} original session(s) all reused, ${sessionsAfterZoomIn.size} total live=${await liveCount(wc)}`
        : `pid mismatch: ${changedAfterZoomIn.join('; ')}`)

    // 6. A body click focuses the panel and reaches xterm at any zoom.
    //    This replaces M3's gate check: correction means there is no longer a
    //    band inside which mouse input is allowed and outside which it is
    //    suppressed. The focus half is unchanged and still load-bearing —
    //    typing must have somewhere to go after a click.
    {
      const probe = async () => {
        const slot = `document.querySelector('.panel__slot')`
        return wc.executeJavaScript(`(async () => {
          const slot = ${slot}
          if (!slot) return { error: 'no live panel' }
          const r = slot.getBoundingClientRect()
          const opts = {
            bubbles: true, cancelable: true, composed: true, view: window,
            clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
            button: 0, buttons: 1, detail: 1
          }
          slot.dispatchEvent(new MouseEvent('mousedown', opts))
          await new Promise((res) => setTimeout(res, 150))
          return {
            active: document.activeElement && document.activeElement.className,
            blocked: document.querySelectorAll('.panel__slot--blocked').length
          }
        })()`)
      }

      await zoomTo(wc, '0')
      const atOne = await probe()
      await zoomTo(wc, '1')
      const zoomedOut = await probe()
      await zoomTo(wc, '0')

      const focused = (r) => r && String(r.active || '').includes('xterm-helper-textarea')
      ok('6 a body click focuses the panel at any zoom, with no gate left',
        focused(atOne) && focused(zoomedOut) &&
          atOne.blocked === 0 && zoomedOut.blocked === 0,
        `1:1 active=${atOne && atOne.active} zoomed active=${zoomedOut && zoomedOut.active} ` +
        `blocked=${atOne && atOne.blocked}/${zoomedOut && zoomedOut.blocked}`)
    }

    // Used by check 8 below to focus a panel via a real OS-level click
    // (rather than a dispatched DOM event) before typing into it.
    const clickPanelBody = async (selector) => {
      const box = await wc.executeJavaScript(
        `(() => { const s = document.querySelector(${JSON.stringify(selector)});
                  if (!s) return null;
                  const r = s.getBoundingClientRect();
                  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`
      )
      if (!box) throw new Error(`clickPanelBody: no element matched ${selector}`)
      wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
      await sleep(150) // xterm's own focus() and React's state update are synchronous-ish but not instant
      const [reachedXterm, active] = await Promise.all([
        wc.executeJavaScript(
          `(() => { const el = document.elementFromPoint(${box.x}, ${box.y});
                    return !!(el && el.closest('.xterm')) })()`
        ),
        wc.executeJavaScript(`(document.activeElement && document.activeElement.className) || ''`)
      ])
      return { reachedXterm, active }
    }

    // 7. Cmd+N. An explicit spec scope item ("a panel whose rect is centred on
    // the current viewport in world coordinates") with no coverage anywhere
    // else: without this check the shortcut could do nothing at all, or place
    // panels in screen coordinates, and every other suite would still pass.
    // Run at the ~0.69 scale check 6 left behind on purpose — at scale 1 with
    // no translation, screen and world coordinates coincide and the conversion
    // this asserts would be untestable.
    const panelCount = (w) => w.executeJavaScript(`document.querySelectorAll('.panel').length`)
    // Both expectations are read back out of the live DOM — the canvas host's
    // own bounds and the world layer's own transform — rather than duplicating
    // INITIAL/PANEL_W constants out of the source, which would make this pass
    // whenever the test and the code shared a wrong assumption.
    const viewCentreInWorld = (w) => w.executeJavaScript(`(() => {
      const host = document.querySelector('.canvas')
      const world = document.querySelector('.world')
      const b = host.getBoundingClientRect()
      const m = new DOMMatrixReadOnly(getComputedStyle(world).transform)
      return { x: (b.width / 2 - m.e) / m.a, y: (b.height / 2 - m.f) / m.a }
    })()`)
    const lastPanelCentreInWorld = (w) => w.executeJavaScript(`(() => {
      const all = document.querySelectorAll('.panel')
      const el = all[all.length - 1]
      if (!el) return null
      return { x: parseFloat(el.style.left) + parseFloat(el.style.width) / 2,
               y: parseFloat(el.style.top) + parseFloat(el.style.height) / 2 }
    })()`)

    const panelsBeforeSpawn = await panelCount(wc)
    const expectedCentre = await viewCentreInWorld(wc)
    await zoomTo(wc, 'n')
    const panelsAfterSpawn = await waitUntil(
      async () => {
        const n = await panelCount(wc)
        return n > panelsBeforeSpawn ? n : false
      },
      3000
    )
    const spawnedCentre = await lastPanelCentreInWorld(wc)
    // 1px: both sides come from the same getBoundingClientRect and the same
    // computed transform, so the only slack is float rounding in the matrix
    // string and sub-pixel layout. Anything larger is the centring math being
    // wrong, not measurement noise.
    const CENTRE_TOLERANCE_PX = 1
    const centred =
      spawnedCentre &&
      Math.abs(spawnedCentre.x - expectedCentre.x) <= CENTRE_TOLERANCE_PX &&
      Math.abs(spawnedCentre.y - expectedCentre.y) <= CENTRE_TOLERANCE_PX
    ok('7 Cmd+N adds a panel centred on the view in world coordinates',
      panelsAfterSpawn === panelsBeforeSpawn + 1 && centred,
      `panels ${panelsBeforeSpawn} -> ${panelsAfterSpawn}, ` +
        `centre ${JSON.stringify(spawnedCentre)} expected ${JSON.stringify(expectedCentre)}`)

    // 8. Typing reaches the focused panel's PTY. The whole input path through
    // the real SessionHandle (term.onData -> registry -> pty:write -> shell ->
    // pty:data -> term.write) is otherwise unexercised: wire onInput to the
    // wrong session, or not at all, and every panel becomes a read-only
    // terminal while every other check still passes.
    const MARKER = 'qzxv'
    const backgroundPoint = (w) => w.executeJavaScript(`(() => {
      const host = document.querySelector('.canvas')
      const b = host.getBoundingClientRect()
      for (let dy = 4; dy < b.height; dy += 20) {
        for (let dx = 4; dx < b.width; dx += 20) {
          const x = Math.round(b.left + dx), y = Math.round(b.top + dy)
          const el = document.elementFromPoint(x, y)
          if (el && host.contains(el) && !el.closest('.panel') && !el.closest('.canvas-hud')) {
            return { x, y }
          }
        }
      }
      return null
    })()`)
    const cardTexts = (w) =>
      w.executeJavaScript(
        `Array.from(document.querySelectorAll('.panel__card')).map((el) => el.textContent || '')`
      )

    await zoomTo(wc, '0') // back inside the interaction band so the click reaches xterm
    await waitUntil(async () => (await liveCount(wc)) > 0, 3000)
    const focused = await clickPanelBody('.panel__slot')
    for (const ch of MARKER) {
      // A real key event through Chromium's input pipeline, not a synthetic
      // KeyboardEvent: xterm reads typed text off its hidden textarea's input
      // event, which only a real one produces.
      wc.sendInputEvent({ type: 'keyDown', keyCode: ch })
      wc.sendInputEvent({ type: 'char', keyCode: ch })
      wc.sendInputEvent({ type: 'keyUp', keyCode: ch })
    }

    // The observation. A live panel renders through WebGL, so its text is in a
    // canvas and unreadable from the DOM; the card tier renders the SAME
    // terminal's buffer as text via handle.tail(). So: release focus (a
    // background click, which is also the only way an unconditionally-pinned
    // focused panel can ever demote), zoom out below LIVE_MIN_SCALE, and read
    // the echo back out of the card.
    const bg = await backgroundPoint(wc)
    if (!bg) throw new Error('typing check: found no background point on the canvas')
    wc.sendInputEvent({ type: 'mouseDown', x: bg.x, y: bg.y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: bg.x, y: bg.y, button: 'left', clickCount: 1 })
    await zoomTo(wc, '1')
    const echoed = await waitUntil(
      async () => (await cardTexts(wc)).find((text) => text.includes(MARKER)) ?? false,
      6000
    )
    ok('8 keystrokes reach the focused panel\'s PTY and echo back into its buffer',
      echoed !== false,
      echoed !== false
        ? `card shows ${JSON.stringify(echoed.slice(-60))}`
        : `no card contained ${MARKER} (focused activeElement was "${focused.active}")`)

    // ---------------------------------------------------------------------
    // 9. Pointer correction. Proves the corrector (Task 3's
    //    installPointerCorrection / xterm-pointer.ts) puts a click on the
    //    right cell at a zoom far from 1:1 — the exact case the deleted
    //    interaction gate used to avoid entirely by suppressing the click.
    //    This check was made green BEFORE the gate was removed (Task 4),
    //    deliberately: if this check had come after deletion, a broken
    //    corrector would have produced a wrong cell instead of a visible
    //    failure. Now that the gate is gone, this check runs with nothing
    //    masking it, and is the one proof that removal did not just hide a
    //    broken corrector.
    //
    //    The assertion is about xterm's own hit-testing: at scale 0.5 an
    //    UNCORRECTED click reports a column at twice the true offset, so a
    //    double-click lands on the wrong word (or past end-of-line, selecting
    //    nothing). Writing three well-separated words and double-clicking the
    //    middle one turns "the column is off by a factor of k" into a string
    //    comparison.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0') // back to 100% before setting up

      const selection = await wc.executeJavaScript(`(async () => {
        const slot = document.querySelector('.panel__slot')
        if (!slot) return { error: 'no live panel' }

        // Focus this panel FIRST. assignTiers pins the focused panel live
        // unconditionally, which is what keeps it from being demoted to a
        // card when the zoom drops below LIVE_MIN_SCALE below — without this
        // there is no .panel__slot left to click by the time we need one.
        slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 150))

        // Known content at known columns. Written through the session handle
        // rather than the PTY so no shell prompt or echo can shift it.
        window.__m4aWrite('\\r\\nalpha beta gamma\\r\\n')
        await new Promise((r) => setTimeout(r, 300))

        // Zoom to 50% via the canvas's own path, so the real transform is
        // what the corrector sees.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        await new Promise((r) => setTimeout(r, 300))

        const scale = window.__m4aScale()
        const screen = window.__m4aCellToScreen('beta')
        if (!screen) return { error: 'could not locate the word', scale }

        const opts = {
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: screen.x, clientY: screen.y, button: 0, buttons: 1
        }
        const target = document.elementFromPoint(screen.x, screen.y) || slot
        target.dispatchEvent(new MouseEvent('mousedown', { ...opts, detail: 1 }))
        target.dispatchEvent(new MouseEvent('mouseup', { ...opts, detail: 1, buttons: 0 }))
        target.dispatchEvent(new MouseEvent('mousedown', { ...opts, detail: 2 }))
        target.dispatchEvent(new MouseEvent('mouseup', { ...opts, detail: 2, buttons: 0 }))
        await new Promise((r) => setTimeout(r, 200))

        return { scale, text: window.__m4aSelection() }
      })()`)

      ok('9 a double-click selects the right word at 50% zoom',
        selection && selection.text === 'beta',
        `scale=${selection && selection.scale} selection=${JSON.stringify(
          selection && (selection.text ?? selection.error)
        )}`)

      await zoomTo(wc, '0')
    }

    // ---------------------------------------------------------------------
    // 10. Dragging a panel by its chrome moves it by the WORLD delta, not the
    //     screen delta, INCLUDING across a zoom that happens mid-gesture.
    //
    //     Run at a zoom other than 1 on purpose: at 1:1 a screen delta and a
    //     world delta are identical and a screen-delta implementation passes.
    //
    //     The zoom between the second and third move is what discriminates the
    //     accumulate-deltas implementation applyDrag's docstring warns about —
    //     the one that adds (p_i - p_i-1) / scale each frame. Its early
    //     increments were divided by the OLD scale, so once the transform
    //     changes its total no longer matches the origin-derived answer. It is
    //     also the only integration-level coverage of the spec's claim that a
    //     mid-drag zoom is correct by construction, so do not remove the zoom
    //     as incidental.
    //
    //     The expectation is re-derived here from the viewport read back at
    //     each end ((p - t) / s, applied to the two POINTS, never to their
    //     difference) rather than borrowed from screenToWorld, so the check
    //     does not assert production math against itself.
    //
    //     Known limit: a variant that advances BOTH originRect and originWorld
    //     every frame telescopes to exactly the same total — w(p_n) - w(p_0) —
    //     and no black-box assertion on the final rect can separate it from
    //     recompute-from-origin. It differs only in accumulated rounding.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      // Cmd+- four times lands near 0.48, and the mid-drag Cmd+- below takes
      // it lower still; neither number is hardcoded, because the assertion is
      // expressed against the viewports that are read back.
      for (let i = 0; i < 4; i++) await zoomTo(wc, '-')
      await sleep(200)

      const result = await wc.executeJavaScript(`(async () => {
        const chrome = document.querySelector('.panel__chrome')
        if (!chrome) return { error: 'no panel' }
        const panel = chrome.closest('.panel')
        // Copied field by field: a DOMRect's properties are non-enumerable
        // getters and would cross executeJavaScript as an empty object.
        const hostRect = document.querySelector('.canvas').getBoundingClientRect()
        const host = { left: hostRect.left, top: hostRect.top }
        const before = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        const r = chrome.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const SCREEN_DX = 120, SCREEN_DY = 60

        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })
        const vpDown = window.__m4aViewport()
        chrome.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        // Several intermediate moves: a recompute-from-origin implementation
        // and an accumulate-deltas one differ only across multiple frames.
        for (let i = 1; i <= 4; i++) {
          document.dispatchEvent(new MouseEvent('mousemove',
            opts(start.x + (SCREEN_DX * i) / 4, start.y + (SCREEN_DY * i) / 4, 1)))
          await new Promise((res) => setTimeout(res, 20))
          // Zoom out once, mid-gesture, with the button still down.
          if (i === 2) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
            await new Promise((res) => setTimeout(res, 120))
          }
        }
        document.dispatchEvent(new MouseEvent('mouseup',
          opts(start.x + SCREEN_DX, start.y + SCREEN_DY, 0)))
        await new Promise((res) => setTimeout(res, 150))

        const after = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        return {
          before, after, host, start, SCREEN_DX, SCREEN_DY,
          vpDown, vpUp: window.__m4aViewport()
        }
      })()`)

      // (p - t) / s on each endpoint under ITS OWN viewport, then subtract.
      const toWorld = (p, vp, host) => ({
        x: (p.x - host.left - vp.x) / vp.scale,
        y: (p.y - host.top - vp.y) / vp.scale
      })
      let expectedX = null, expectedY = null, gotX = null, gotY = null, zoomed = false
      if (result && !result.error) {
        const from = toWorld(result.start, result.vpDown, result.host)
        const to = toWorld(
          { x: result.start.x + result.SCREEN_DX, y: result.start.y + result.SCREEN_DY },
          result.vpUp, result.host)
        expectedX = to.x - from.x
        expectedY = to.y - from.y
        gotX = result.after.x - result.before.x
        gotY = result.after.y - result.before.y
        zoomed = result.vpDown.scale !== result.vpUp.scale
      }
      ok('10 a chrome drag moves the panel by the world delta, across a mid-drag zoom',
        result && !result.error && zoomed &&
          Math.abs(gotX - expectedX) < 1 && Math.abs(gotY - expectedY) < 1,
        `scale ${result && result.vpDown && result.vpDown.scale} -> ` +
        `${result && result.vpUp && result.vpUp.scale} ` +
        `moved ${gotX},${gotY} expected ${expectedX},${expectedY}`)

      await zoomTo(wc, '0')
    }

    // ---------------------------------------------------------------------
    // 11. A resize commits exactly once, on release. The grid must be
    //     UNCHANGED during the drag and changed after it — one SIGWINCH per
    //     gesture, not one per frame. A full-screen agent TUI repaints on
    //     every SIGWINCH, so this is about the process, not about the pixels.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const result = await wc.executeJavaScript(`(async () => {
        // Pick a panel that IS live rather than whichever one happens to be
        // first: check 10 leaves its target displaced by a couple of hundred
        // world units, and inheriting that displacement would make this check
        // fail as 'panel is not live' the day the drag distance changes.
        const panel = [...document.querySelectorAll('.panel')]
          .find((p) => p.querySelector('.panel__slot') && p.querySelector('.panel__resize--se'))
        if (!panel) return { error: 'no live panel with a resize handle' }
        const handle = panel.querySelector('.panel__resize--se')
        const slot = panel.querySelector('.panel__slot')
        slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((res) => setTimeout(res, 150))

        const gridBefore = window.__m4aGrid()
        const r = handle.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })

        handle.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        for (let i = 1; i <= 4; i++) {
          document.dispatchEvent(new MouseEvent('mousemove',
            opts(start.x + 60 * i, start.y + 40 * i, 1)))
          await new Promise((res) => setTimeout(res, 40))
        }
        const gridDuring = window.__m4aGrid()
        document.dispatchEvent(new MouseEvent('mouseup', opts(start.x + 240, start.y + 160, 0)))
        await new Promise((res) => setTimeout(res, 400))
        const gridAfter = window.__m4aGrid()
        return { gridBefore, gridDuring, gridAfter }
      })()`)

      const same = (a, b) => a && b && a.cols === b.cols && a.rows === b.rows
      ok('11 a resize commits once, on release',
        result && !result.error &&
          same(result.gridBefore, result.gridDuring) &&
          !same(result.gridBefore, result.gridAfter),
        `before=${JSON.stringify(result && result.gridBefore)} ` +
        `during=${JSON.stringify(result && result.gridDuring)} ` +
        `after=${JSON.stringify(result && result.gridAfter)}`)
    }

  } catch (error) {
    // An infrastructure failure (e.g. a missing DOM target, a rejected
    // executeJavaScript) still has to report through the same PASS/FAIL
    // shape and still has to reach the summary below — printing nothing and
    // just crashing is exactly the silent hang this suite exists to avoid.
    console.error('\nFAIL  infrastructure error: ' + (error && error.stack ? error.stack : error))
    results.push({ n: 'infrastructure', pass: false, detail: String(error) })
  } finally {
    if (!watchdogFired) {
      console.log('\n' + '='.repeat(60))
      const failed = results.filter((r) => !r.pass)
      console.log(`${results.length - failed.length}/${results.length} passed`)
      if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
      try {
        ptyManager.killAll() // the seed panels' shells would otherwise outlive this process
      } catch (error) {
        console.error('FAIL  teardown: killAll threw', error)
        results.push({ n: 'teardown', pass: false, detail: String(error) })
      }
      // Disarmed only once teardown is past everything that can throw. Clearing
      // it first meant a throwing killAll() left the run hung with no exit code
      // and the watchdog already disabled — the exact failure class this file's
      // watchdog exists to prevent.
      clearTimeout(watchdog)
      await sleep(300) // let node-pty's native teardown land before app.exit() tears down the process
      app.exit(results.some((r) => !r.pass) ? 1 : 0)
    } else {
      clearTimeout(watchdog)
    }
  }
})
