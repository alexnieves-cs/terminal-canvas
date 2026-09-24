/* verify:panels:core — one of the five parts of the old scripts/verify-panels.cjs (M135).
   Run with: npm run build && npm run verify:panels:core
   The harness (scripts/panels-harness.cjs) boots the renderer; this file holds the
   checks the old file held at lines 1474–5259, moved verbatim, ids unchanged. */
// A throw while the harness LOADS (a bad require, a failed esbuild) never
// reaches runPanelsSuite's watchdog: Electron prints "App threw an error
// during load" and idles, which read as a 30-minute hang on 2026-09-14.
let runPanelsSuite
try { ({ runPanelsSuite } = require('./panels-harness.cjs')) } catch (error) { console.error('FAIL  harness failed to load:', error); process.exit(1) }

const WATCHDOG_MS = 75000 // measured 2026-09-10 in the Electron tier after M234–M237 (the chromeless checks), two green-but-for-headroom runs: 58.4s chained, 59.6s alone; 1.25x the slower, to the next second. Was 63000, which headroom.1 flagged at 93–95% before any watchdog fired

runPanelsSuite('core', WATCHDOG_MS, async (ctx) => {
  const { harnessAttachmentsDir, AgentSessionManager, BOOT_DEFAULT_PRESET, BrowserWindow, CASCADE_STEP, DEFAULT_CAMERA, ECHO_PRESET, ENTRY_OUT, FILE_MAX_LINES, FileWatchers, IPC, IPC_EVENTS, LAYOUT_PATH, LIVE_AT_BOOT, NEVER_RENDERED_PANEL_ID, NEVER_RENDERED_WORKSPACE_ID, NEVER_WOKEN_ID, PANELS_SOCKET, PLUGIN_DETAILS_TEXT, PLUGIN_DIR, PLUGIN_ID, PROJECT_DIR, PROJECT_PROMPT_BODY, PROJECT_PROMPT_NAME, PROMPT_DIRS, PtyManager, RENAMABLE_PRESET, REVIEW_FENCES, SEEDED_PROMPT, SEED_PANELS, ToolboxCache, WORKTREES_DIR, activeWorkspaceId, agentHandlers, agentSessions, agentTranscripts, allPresets, allTemplates, app, appendFileSync, approvalTracker, attachPtyLifecycle, backgroundPoint, baselineCapture, bootDefault, brokerAuditForChecks, buildSync, buildTmuxConf, cardCount, cardTexts, chatFixture, chatRunner, chatSpawns, clickEmptyCanvas, clickPanelAt, clickPanelBody, clickPanelClose, clickRail, closeSync, commitIndexDir, commitIndexSeq, createAgentTranscriptLog, createApprovalTracker, createBaselineCapture, createBoardLane, createBrokerAudit, createBrowserHandlers, createControlHandler, createControlServer, createDirectBackend, createExporters, createGitRunner, createLayoutSnapshots, createLayoutStore, createMemoryStore, createPlacesGate, createReviewCommitter, createReviewDiscarder, createReviewEngine, createRunLedger, createScrollbackLog, createTmuxBackend, createWatchRunner, createWorktreeManager, credentialDir, credentialStore, dockTo, execFileSync, existsSync, expandTilde, fencedGitRunner, findTmux, flushLayoutStore, fromPanels, frontTranscripts, gitPath, gridState, harnessCredentialDir, harnessGrants, importClaudeTranscript, ipcMain, isBuiltInTemplate, join, killedPanelIds, knownUsageSessionIds, lastPanelCentreInWorld, layoutSnapshots, layoutStore, linkOpens, listGithubWorkItems, listSessions, liveCount, loginEnv, memoryDir, memoryStore, mergePrompts, mkdirSync, mkdtempSync, nodeBox, nodeCount, ok, openSync, panelCount, parseLayout, parseShelf, pidsPreserved, presetFromCapture, presetRows, pressArrow, pressChord, pressPlain, ptyManager, pushDefaultPreset, railAgentState, railPan, readFileSync, readFrom, readProjectPrompts, readSync, readVault, readdirSync, realGitRunner, realIpcMainHandle, realpathSync, registerIpcHandlers, registeredHandlers, releaseMeta, renameSync, requestFromRenderer, resolveAttachment, resolveAvailability, resolveCwd, resolveShellEnv, resolveSpawnRequest, restoreFromSnapshot, results, reviewCommit, reviewEngine, rmSync, runLedger, scrollbackLog, sessionMap, settle, settledSessionMap, skillTrashCalls, skillWriteHandlers, sleep, snapshotDir, statSync, templateOf, tmpdir, toolboxCache, trailFor, unlinkSync, usageFixtureDir, usageFixtureFile, verifySocket, viewCentreInWorld, waitUntil, watchDirWatchers, watchFileWatchers, watchRunner, watchTimers, watcherHandlers, wc, webContents, whichFromEnv, whichHere, win, worktreeManager, writeFileSync, zoomTo, zoomToScale, state } = ctx
  {

    // ---------------------------------------------------------------------
    // 18. THE HEADLINE PROMISE of M4b's dormancy work: relaunch a restored
    // canvas, pan across all of it, zero NEW processes spawn beyond what
    // boot reconciliation already reattached. Numbered 18 (after every other
    // check in this file) but it has to RUN here, before the wake-everything
    // step immediately below — checks 1-17 predate dormancy and need every
    // fixture panel already awake (see the comment on that step), so this is
    // the only place in the file where the fixture is still genuinely
    // dormant. Execution order and numbering diverge here on purpose; do not
    // "tidy" this block down next to its number, that would silently delete
    // the only real-renderer coverage of dormancy itself.
    //
    // As of M4c, s01 already has a live tmux session (seeded via
    // ptyManager.create() before the window loaded, above), so boot
    // reconciliation reattaches it — LIVE_AT_BOOT.length live sessions and a
    // live terminal at boot, not zero. "Waking one panel" below now targets
    // s02, a genuinely still-dormant on-screen panel, so this check keeps
    // proving what it always proved: nothing spawns beyond what the user (or
    // an existing session) actually asked for.
    // ---------------------------------------------------------------------
    {
      // registry.ensure() runs synchronously during the initial render (a
      // useMemo), so a session with dormant:false exists immediately — but
      // ATTACHING it (mounting the xterm host, the DOM this reads) happens in
      // TerminalPanel's mount effect, which React runs after the first paint.
      // Reading the DOM before that effect has run is a race with the boot
      // reattach itself, not a check of it — wait for it to settle instead of
      // assuming a synchronous read.
      await waitUntil(async () => (await liveCount(wc)) >= LIVE_AT_BOOT.length, 3000)
      const liveAtBoot = await liveCount(wc)
      const sessionsAtBoot = await listSessions(wc)

      const hasClickToStart = await wc.executeJavaScript(
        `Array.from(document.querySelectorAll('.panel__card-idle'))
          .some((el) => el.textContent === 'click to start')`
      )

      // 24. Boot reconcile: the two restore states asserted AGAINST EACH
      // OTHER, because it is their distinction that is new. A panel with a
      // live session (s01, seeded via ptyManager.create() before the window
      // ever loaded, above) must come back attached; one without must come
      // back dormant. Checking only the first half would pass for an
      // implementation that reattaches everything and re-spawns the whole
      // canvas on launch — exactly the behaviour M4b's dormancy work exists
      // to prevent. Must run HERE, at genuine boot state, before the "wake
      // one" step below clears s02's dormancy and the "wake every panel"
      // step further down clears the rest — either would erase the very
      // distinction this check exists to catch.
      {
        const state = await wc.executeJavaScript(`(() => {
          const sessions = window.__m4aSessions ? window.__m4aSessions() : []
          return JSON.stringify(sessions)
        })()`)
        const sessions = JSON.parse(state)
        const withLive = sessions.filter((s) => LIVE_AT_BOOT.includes(s.id))
        const without = sessions.filter((s) => !LIVE_AT_BOOT.includes(s.id))
        ok('24 a panel with a live session restores non-dormant while one without stays dormant',
          withLive.length > 0 && withLive.every((s) => s.dormant === false) &&
            without.length > 0 && without.every((s) => s.dormant === true),
          `live=${JSON.stringify(withLive)} rest=${without.length} dormant=${without.filter((s) => s.dormant).length}`)
      }

      // Wake exactly one still-dormant panel (its title bar — the real
      // affordance), while the camera is still at its boot position so the
      // clicked panel (s02, at world (800,0) — on screen under
      // DEFAULT_CAMERA same as s01) is actually eligible to promote. Waking
      // only clears dormancy; assignTiers still has to find the panel on
      // screen before it promotes and attachSlot spawns it, exactly like a
      // real click would require the panel to be visible. s01 is
      // deliberately NOT the target here — it is already live at boot (see
      // above), so clicking it would be a dormancy no-op and prove nothing.
      await wc.executeJavaScript(`
        const chrome18 = document.querySelector('[data-panel-id="s02"] .panel__chrome')
        const r18 = chrome18.getBoundingClientRect()
        const opts18 = {
          bubbles: true, button: 0, buttons: 1,
          clientX: r18.left + r18.width / 2, clientY: r18.top + r18.height / 2
        }
        chrome18.dispatchEvent(new MouseEvent('mousedown', opts18))
        document.dispatchEvent(new MouseEvent('mouseup', { ...opts18, buttons: 0 }))
        true
      `)
      const bootCount = sessionsAtBoot.length
      const sessionsAfterWakeOne = await waitUntil(async () => {
        const list = await listSessions(wc)
        return list.length > bootCount ? list : false
      }, 4000)

      // Now pan the camera across the whole fixture — SEED_PANELS spans
      // roughly x: -900..3300, y: -640..1740 — the same background wheel-pan
      // check 12 already uses below, just larger and in both directions. The
      // ten still-dormant panels drift through the viewport during this; if
      // the dormancy guard in assignTiers regressed, THIS is what would
      // catch it — a process count that grows past the two live so far
      // (s01 reattached at boot, s02 woken above).
      // The final dispatch's deltas are chosen so the four sum to zero on
      // each axis: panBy is unclamped (only scale clamps), so the net
      // translation is zero and the camera ends back where checks 1-6 below
      // expect it — this check must not leave the viewport somewhere those
      // checks never anticipated.
      await wc.executeJavaScript(`
        const canvasEl18 = document.querySelector('.canvas')
        const wheelOpts18 = (dx, dy) => ({
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: dx, deltaY: dy, deltaMode: 0
        })
        canvasEl18.dispatchEvent(new WheelEvent('wheel', wheelOpts18(-3000, -2000)))
        canvasEl18.dispatchEvent(new WheelEvent('wheel', wheelOpts18(4500, 3200)))
        canvasEl18.dispatchEvent(new WheelEvent('wheel', wheelOpts18(-1800, 1400)))
        canvasEl18.dispatchEvent(new WheelEvent('wheel', wheelOpts18(300, -2600)))
        true
      `)
      await sleep(400)
      const sessionsAfterPan = await listSessions(wc)

      ok('18 a restored boot reattaches exactly the panels with live sessions, waking one more dormant panel spawns exactly one, and panning past the rest spawns nothing more',
        liveAtBoot === LIVE_AT_BOOT.length && sessionsAtBoot.length === LIVE_AT_BOOT.length &&
          hasClickToStart === true &&
          Array.isArray(sessionsAfterWakeOne) && sessionsAfterWakeOne.length === LIVE_AT_BOOT.length + 1 &&
          sessionsAfterPan.length === LIVE_AT_BOOT.length + 1,
        `liveAtBoot=${liveAtBoot} sessionsAtBoot=${sessionsAtBoot.length} clickToStart=${hasClickToStart} ` +
          `sessionsAfterWakeOne=${JSON.stringify(sessionsAfterWakeOne)} sessionsAfterPan=${sessionsAfterPan.length}`)
    }

    // SEED_PANELS is loaded through the layout store exactly like a real
    // restored canvas, so as of M4b every one of these twelve boots dormant
    // (see lod.ts/session-registry.ts) — none of them would ever promote no
    // matter how long this waited. This suite predates dormancy and uses
    // SEED_PANELS purely as tiering/promotion/budget fixture data (checks
    // 1-6), not as a dormancy test — lod.ts and verify:registry already cover
    // dormancy itself. Click every title bar once, the same affordance a
    // real user has, to wake them all before any tiering assertion runs.
    await wc.executeJavaScript(`
      Array.from(document.querySelectorAll('.panel__chrome')).forEach((chrome) => {
        const r = chrome.getBoundingClientRect()
        const opts = {
          bubbles: true, button: 0, buttons: 1,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
        }
        chrome.dispatchEvent(new MouseEvent('mousedown', opts))
        document.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }))
      })
      true
    `)

    // Shells must actually spawn; wait for the first live terminal rather
    // than guessing how long that takes.
    // M56. Reduced motion ON for the whole run: every check below reads the
    // camera right after a jump, and a flight in the air is a camera that is
    // not there yet. flight.1 turns it off for its one jump and turns it back
    // on. The same choice a user who set the OS preference has made.
    await waitUntil(() => wc.executeJavaScript(`typeof window.__m56ReducedMotion === 'function'`), 6000)
    await wc.executeJavaScript(`window.__m56ReducedMotion(true)`)
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
    // clickPanelBody addresses a panel by SELECTOR and clicks its centre;
    // this one clicks a POINT the caller has already hit-tested. The split
    // matters wherever panels overlap: a selector-addressed click lands on
    // whatever is painted on top at that element's centre, which is not
    // necessarily the element the selector named — paint order is Panel.z,
    // not document order.


    // 7. Cmd+N. An explicit spec scope item ("a panel whose rect is centred on
    // the current viewport in world coordinates") with no coverage anywhere
    // else: without this check the shortcut could do nothing at all, or place
    // panels in screen coordinates, and every other suite would still pass.
    // Check 6 ends by resetting the camera, so this runs at INITIAL — scale 1
    // but translated {x:120,y:120}, which is what keeps the world/screen
    // conversion under test rather than degenerate.
    //
    // A DEPENDENCY this check acquired when spawns started cascading (check 51
    // below): "centred on the view" now holds only while nothing is ALREADY
    // centred there. In this window (1400x900) at INITIAL the view centre in
    // world is (580, 330), and the nearest SEED_PANELS centre is s01's
    // (360, 230) — 220 world px away, some 440x CASCADE_EPSILON. Edit
    // SEED_PANELS or DEFAULT_CAMERA so that a fixture panel lands on that
    // point and this check fails by exactly one CASCADE_STEP, which reads as a
    // centring regression and is not one.
    // Both expectations are read back out of the live DOM — the canvas host's
    // own bounds and the world layer's own transform — rather than duplicating
    // INITIAL/PANEL_W constants out of the source, which would make this pass
    // whenever the test and the code shared a wrong assumption.

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

    // 7b. HOLDING Cmd+N spawns exactly one panel, not one per OS key-repeat.
    //     A held key is one gesture but many keydowns: the OS emits the real
    //     press and then an auto-repeat stream at ~15/sec, and every one of
    //     them reaches useViewport's switch. Unguarded, `case 'n'` turns each
    //     repeat into a panel AND a PTY — two seconds of a held chord is
    //     thirty agents and a canvas past LIVE_BUDGET.
    //
    //     This is the ONLY check in the suite that sets `repeat` at all. Every
    //     other Cmd+N driver goes through zoomTo, whose KeyboardEvent leaves
    //     `repeat` at its false default — which is exactly why the guard could
    //     be added without touching checks 7, 17, 22, 26 or 29, and equally
    //     why none of them would have caught its absence.
    //
    //     It deliberately does NOT then spawn a real panel to prove the
    //     shortcut still works. Panel count is load-bearing state for later
    //     checks, and 17/22/26/29 all drive a plain Cmd+N successfully
    //     downstream — a guard that swallowed real presses too would take
    //     every one of them down with it.
    //
    //     What this canNOT prove: that Chromium SETS `repeat` on macOS for a
    //     Cmd-modified key. The flag is supplied by hand here, so this asserts
    //     the guard READS it. The real-app half is a manual hold test.
    await wc.executeJavaScript(`
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, repeat: true, bubbles: true }))
      }
      true
    `)
    await sleep(300)
    const panelsAfterHeld = await panelCount(wc)
    ok('7b holding Cmd+N spawns nothing further — auto-repeat is one gesture',
      panelsAfterHeld === panelsAfterSpawn,
      `${panelsAfterSpawn} -> ${panelsAfterHeld} after 5 repeat keydowns`)

    // 8. Typing reaches the focused panel's PTY. The whole input path through
    // the real SessionHandle (term.onData -> registry -> pty:write -> shell ->
    // pty:data -> term.write) is otherwise unexercised: wire onInput to the
    // wrong session, or not at all, and every panel becomes a read-only
    // terminal while every other check still passes.
    const MARKER = 'qzxv'

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
    // M166. The TAIL tier (0.4: below LIVE_MIN_SCALE, above SUMMARY_LEAVE) — Cmd+1
    // used to land here by luck of the fixture's extent; since M166 the summary
    // tier carries no scrollback line to read the echo from, on purpose.
    await zoomToScale(wc, 0.4)
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
        // rather than the PTY so no shell prompt or echo can shift it. Six
        // blank rows first (M149): at 50% the M144 chrome counter-scales to
        // twice its world height and overhangs the body's top rows, and since
        // the chrome paints ABOVE the body (menu.stack.1 — the ⋯ menu was
        // invisible under it) a click in those rows reaches the chrome, which
        // is what the user sees there. The word under test sits below the overhang.
        window.__m4aWrite('\\r\\n\\r\\n\\r\\n\\r\\n\\r\\n\\r\\nalpha beta gamma\\r\\n')
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

    // ---------------------------------------------------------------------
    // 12. Wheel ownership. A wheel over the FOCUSED panel scrolls that
    //     terminal and must not move the camera; a wheel anywhere else
    //     (background OR an unfocused panel) pans and must not scroll that
    //     panel's scrollback. Without this, both handlers run on one
    //     gesture: useViewport's listener is on the canvas host and xterm's
    //     bubbles up into it — and a bubble-phase guard narrowed to "only the
    //     focused panel yields" still double-handles every OTHER panel
    //     (camera pans while its scrollback silently moves too), which is
    //     why the guard has to run in capture and stopPropagation before
    //     xterm's own target-phase handler ever sees the event.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const result = await wc.executeJavaScript(`(async () => {
        const read = () => getComputedStyle(document.querySelector('.world')).transform
        const panels = [...document.querySelectorAll('.panel')].filter((p) => p.querySelector('.panel__slot'))
        if (panels.length < 2) return { error: 'need two live panels' }
        const [panelA, panelB] = panels
        const slotA = panelA.querySelector('.panel__slot')
        const slotB = panelB.querySelector('.panel__slot')
        const idB = panelB.getAttribute('data-panel-id')

        // Give panel B enough scrollback that a wheel over it would actually
        // move its viewport if xterm's handler ran — otherwise "scrollY
        // unchanged" would pass trivially on a panel with nothing to scroll.
        // __m4aWrite feeds xterm's parser directly (as pty:data would), so
        // this is 200 real buffer lines, not a shell command — no PTY round
        // trip needed to build scrollback deep enough to matter.
        slotB.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((res) => setTimeout(res, 150))
        const lines = Array.from({ length: 200 }, (_, i) => 'line-' + i).join('\\r\\n') + '\\r\\n'
        window.__m4aWrite(lines)
        await new Promise((res) => setTimeout(res, 300))

        // Now focus panel A for the focused/background halves of the check.
        slotA.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((res) => setTimeout(res, 150))

        const rA = slotA.getBoundingClientRect()
        const before = read()
        slotA.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          clientX: rA.left + rA.width / 2, clientY: rA.top + rA.height / 2,
          deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const overFocused = read()

        // Now the background, which must pan.
        const canvas = document.querySelector('.canvas')
        canvas.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          clientX: 5, clientY: 5, deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const overBackground = read()

        // Now an UNFOCUSED panel (B): must pan the camera AND must not move
        // that panel's own scrollback.
        //
        // xterm's own wheel listener is bound to '.xterm' (a descendant of
        // .panel__slot, which only wraps the host div). Dispatching on the
        // slot itself would make slot the event's target, and a descendant's
        // listener is never on the propagation path for its own ancestor's
        // target — so "scrollY unchanged" would pass vacuously whether or
        // not the guard actually stops it. Dispatching on '.xterm-screen'
        // (a real descendant of '.xterm') puts xterm's listener on the path,
        // the same way a real cursor position over the rendered terminal
        // would.
        const scrollBefore = window.__m4aScrollY(idB)
        const screenB = slotB.querySelector('.xterm-screen')
        if (!screenB) return { error: 'no .xterm-screen on unfocused panel' }
        const rB = screenB.getBoundingClientRect()
        // Negative deltaY (scroll UP): panel B is scrolled to the bottom of
        // 200 lines of scrollback, so a scroll-down gesture would be a no-op
        // there regardless of who owns the wheel. Scrolling up is the only
        // direction that actually moves viewportY, which is what makes
        // "unchanged" a meaningful assertion rather than a vacuous one.
        screenB.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          clientX: rB.left + rB.width / 2, clientY: rB.top + rB.height / 2,
          deltaY: -120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const overUnfocused = read()
        const scrollAfter = window.__m4aScrollY(idB)

        // Cmd+wheel over the FOCUSED panel. canvas-input.ts reads metaKey as a
        // zoom intent exactly as it reads a trackpad pinch's synthetic ctrlKey,
        // and the spec makes a zoom gesture always the camera's — otherwise a
        // mouse user who had clicked into a panel could not zoom the canvas
        // while the cursor was over it, and Cmd, the modifier every other
        // canvas shortcut requires, would be ignored in the one place it is
        // the canvas's own claim. Dispatched LAST, after every measurement
        // above: it changes the scale, and the pan assertions above compare
        // transforms taken at a fixed one.
        const beforeMeta = read()
        slotA.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, metaKey: true,
          clientX: rA.left + rA.width / 2, clientY: rA.top + rA.height / 2,
          deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const afterMeta = read()

        return {
          before, overFocused, overBackground, overUnfocused,
          scrollBefore, scrollAfter, beforeMeta, afterMeta
        }
      })()`)

      ok('12 a wheel over the focused terminal does not move the camera; Cmd+wheel there still zooms; every other wheel pans and does not scroll an unfocused terminal',
        result && !result.error &&
          result.overFocused === result.before &&
          result.overBackground !== result.before &&
          result.overUnfocused !== result.overBackground &&
          typeof result.scrollBefore === 'number' && result.scrollBefore > 0 &&
          result.scrollBefore === result.scrollAfter &&
          result.afterMeta !== result.beforeMeta,
        `before=${result && result.before} focused=${result && result.overFocused} ` +
        `background=${result && result.overBackground} unfocused=${result && result.overUnfocused} ` +
        `scrollBefore=${result && result.scrollBefore} scrollAfter=${result && result.scrollAfter} ` +
        `metaKey over focused: ${result && result.beforeMeta} -> ${result && result.afterMeta}`)
    }

    // ---------------------------------------------------------------------
    // 13. An idle or exited panel closes on the first click. 14. A running
    // panel needs two. 15. Closing one panel does not disturb any other,
    // including a demoted one — check 4's invariant re-asserted against the
    // new dispose(id) path.
    //
    // The setup below is what makes 15 a real NEGATIVE check rather than a
    // restatement of 13/14. dispose(id) is the second caller of pty.kill in
    // the renderer, and the failure it could introduce is killing a session
    // whose React component is not currently mounted as a live slot — exactly
    // the state a carded panel is in. So one panel is focused (assignTiers
    // pins the focused panel live unconditionally, which keeps a running panel
    // available for 14) and the camera is then zoomed out to fit, which drops
    // every other panel below LIVE_MIN_SCALE and cards it WITHOUT disposing
    // its session. Only then is the pid snapshot taken. Without this, every
    // spawned session is live when the closes happen and nothing in the block
    // requires a carded one to survive.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      await waitUntil(async () => (await liveCount(wc)) > 0, 6000)
      await wc.executeJavaScript(`(() => {
        const slot = document.querySelector('.panel__slot')
        if (!slot) return false
        slot.dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))
        return true
      })()`)
      await sleep(200)
      // The ids that are LIVE right now. The demotion assertion below is
      // anchored to this set rather than to "some carded session survived":
      // panels the camera has never visited are carded from the start, and at
      // any given moment one of them has usually spawned at some point, so an
      // unanchored version passes by accident whether or not this block ever
      // demotes anything. Requiring a survivor that was live HERE and is a
      // card THERE is what ties the assertion to the zoom-out below.
      const liveBefore = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')]` +
        `.filter((p) => p.querySelector('.panel__slot'))` +
        `.map((p) => p.getAttribute('data-panel-id'))`
      )
      await zoomTo(wc, '1')
      // Wait on the demotion itself, not a clock: DEMOTE_DELAY_MS holds every
      // demotion back by 250ms, so a fixed sleep here would either be a guess
      // or would snapshot the pre-demotion state.
      await waitUntil(
        async () => (await cardCount(wc)) > 0 && (await liveCount(wc)) <= 1,
        6000
      )
      const before = await settledSessionMap(wc)

      const result = await wc.executeJavaScript(`(async () => {
        const panels = [...document.querySelectorAll('.panel')]
        // A panel that never spawned: its card says "not started".
        const idle = panels.find((p) => p.querySelector('.panel__card-idle'))
        // A panel with a running pty: its badge shows a pid.
        // M63. The pill is the state word; a live one reads working/idle/running/starting.
        const running = panels.find((p) => { const w = p.querySelector('[data-state-word]'); return w && /^(working|idle|running|starting|needs you)$/.test(w.textContent || '') })
        if (!idle || !running) return { error: 'need one idle and one running panel' }

        const idleId = idle.getAttribute('data-panel-id')
        const runningId = running.getAttribute('data-panel-id')
        const click = (el) => el.dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))

        const countBefore = document.querySelectorAll('.panel').length
        click(idle.querySelector('.panel__close'))
        await new Promise((r) => setTimeout(r, 200))
        const afterIdleClose = document.querySelectorAll('.panel').length

        // Re-queried before each click rather than captured once: React keys
        // are stable so today the node survives the idle panel's removal and
        // the re-render, but a click dispatched into a detached node would
        // fail this check for a reason that has nothing to do with arming.
        click(running.querySelector('.panel__close'))
        await new Promise((r) => setTimeout(r, 200))
        const armedText = (running.querySelector('.panel__close').textContent || '').trim()
        const afterFirstClick = document.querySelectorAll('.panel').length
        click(running.querySelector('.panel__close'))
        await new Promise((r) => setTimeout(r, 300))
        const afterSecondClick = document.querySelectorAll('.panel').length

        return {
          idleId, runningId, countBefore, afterIdleClose,
          armedText, afterFirstClick, afterSecondClick
        }
      })()`)

      ok('13 an idle panel closes on the first click',
        result && !result.error && result.afterIdleClose === result.countBefore - 1,
        `${result && result.countBefore} -> ${result && result.afterIdleClose}`)

      ok('14 a running panel arms first and closes on the second click',
        result && !result.error &&
          result.afterFirstClick === result.afterIdleClose &&
          /kill/i.test(result.armedText || '') &&
          result.afterSecondClick === result.afterIdleClose - 1,
        `armed="${result && result.armedText}" ` +
        `${result && result.afterFirstClick} -> ${result && result.afterSecondClick}`)

      const runningId = result && !result.error ? result.runningId : null
      // pty.kill is async IPC, so the close may not have reached pty:list yet.
      // NOT settledSessionMap: that waits for two equal-size reads and would
      // happily settle on the PRE-kill state. Waiting on the specific id fails
      // in the safe direction anyway — an unlanded kill leaves runningId in
      // `after` and turns this check red, so it can never hide a regression.
      if (runningId) await waitUntil(async () => !(await sessionMap(wc)).has(runningId), 2000)
      const after = await sessionMap(wc)
      const survivors = new Map([...before].filter(([id]) => id !== runningId))
      const { ok: preserved, changed } = pidsPreserved(survivors, after)
      // The ids currently rendering a card. Intersected with `liveBefore` and
      // with `survivors` (which comes from pty:list) this can only name a panel
      // that was a live terminal before the zoom-out, is a card now, and still
      // holds its original pid after a sibling was closed — the negative check
      // the spec asks for. A never-started panel cards too, but has no session
      // to lose, and `survivors` excludes it.
      const cardedIds = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')]` +
        `.filter((p) => p.querySelector('.panel__card'))` +
        `.map((p) => p.getAttribute('data-panel-id'))`
      )
      const cardedSurvivor = cardedIds.find(
        (id) => liveBefore.includes(id) && survivors.has(id) && after.has(id)
      )
      // The result/size guards matter: without them an in-page `{ error }`
      // leaves runningId null, `survivors` holds everything, nothing was
      // killed — and this check reports PASS having tested nothing.
      ok('15 closing one panel kills only that panel\'s pty, demoted siblings included',
        result && !result.error && survivors.size > 0 &&
          preserved && !after.has(runningId) && cardedSurvivor !== undefined,
        preserved
          ? `${survivors.size} session(s) unchanged (carded survivor: ${cardedSurvivor ?? 'NONE'}), ` +
            `${runningId} gone`
          : `pid mismatch: ${changed.join('; ')}`)
    }

    // ---------------------------------------------------------------------
    // 16. Selecting a panel raises it above its neighbours, and does so via
    //     zIndex rather than by reordering the DOM. The DOM-order half is the
    //     real assertion: React reconciles a reordered keyed list by MOVING
    //     nodes, which would incidentally detach a live terminal's host.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const result = await wc.executeJavaScript(`(async () => {
        const ids = () => [...document.querySelectorAll('.panel')]
          .map((p) => p.getAttribute('data-panel-id'))
        const panels = [...document.querySelectorAll('.panel')]
        if (panels.length < 2) return { error: 'need two panels' }
        const zOf = (p) => parseInt(getComputedStyle(p).zIndex || '0', 10)
        // Pick the panel with the LOWEST z, so raising it is observable.
        const target = panels.reduce((lo, p) => (zOf(p) < zOf(lo) ? p : lo), panels[0])
        const id = target.getAttribute('data-panel-id')
        const domBefore = ids().join(',')
        const zBefore = zOf(target)
        const maxBefore = Math.max(...panels.map(zOf))

        target.querySelector('.panel__chrome').dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))
        document.dispatchEvent(new MouseEvent('mouseup',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0 }))
        await new Promise((r) => setTimeout(r, 200))

        const raised = document.querySelector('[data-panel-id="' + id + '"]')
        return {
          id, zBefore, maxBefore, zAfter: zOf(raised),
          domBefore, domAfter: ids().join(',')
        }
      })()`)

      ok('16 selecting raises by z-index without reordering the DOM',
        result && !result.error &&
          result.zAfter > result.maxBefore &&
          result.domBefore === result.domAfter,
        `z ${result && result.zBefore} -> ${result && result.zAfter} ` +
        `(max was ${result && result.maxBefore}); dom stable=${
          result && result.domBefore === result.domAfter}`)
    }

    // ---------------------------------------------------------------------
    // 17. Ids stay unique once panels can be REMOVED. A length-derived id
    //     (`n${panels.length + 1}`) was sound while the array only grew;
    //     removePanel breaks it, and every consequence is silent —
    //     registry.ensure returns the EXISTING session for a repeated id, so
    //     the second panel renders the first one's handle.host (which can only
    //     live in one slot), React logs a duplicate-key warning, and
    //     setPanelRect/removePanel then act on both entries at once. Checks
    //     13/14 have already closed two panels by this point, which is exactly
    //     the state that makes the length counter run back over ids it has
    //     already handed out. Three spawns, because with a length counter the
    //     first one lands in the gap the closes opened and only the ones after
    //     it collide.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const countBefore = await wc.executeJavaScript(
        `document.querySelectorAll('.panel').length`
      )
      for (let i = 0; i < 3; i++) {
        await zoomTo(wc, 'n')
        await sleep(250)
      }
      const ids = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
      )
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
      ok('17 spawning after a close never reuses a panel id',
        ids.length === countBefore + 3 && duplicates.length === 0,
        `${countBefore} -> ${ids.length} panels, duplicates=[${duplicates.join(', ')}]`)
    }

    // ---------------------------------------------------------------------
    // 19. A change made in the renderer reaches layout.json. Without this the
    //     whole milestone can look correct in a single session and persist
    //     nothing to disk — every check above exercises panels.ts state, none
    //     of them ever open the file main actually wrote.
    //
    //     Modelled on check 10's drag (chrome mousedown, a couple of moves,
    //     mouseup), but at a fixed zoom rather than across one, since the
    //     point here is the write path, not applyDrag's mid-gesture math. The
    //     panel to drag and its rect are both read from the live DOM right
    //     before the drag, not assumed, because by this point in the file
    //     checks 1-17 have moved, zoomed, closed, and spawned panels — there
    //     is no absolute coordinate left that is still safe to hardcode.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const dragged = await wc.executeJavaScript(`(async () => {
        const chrome = document.querySelector('.panel__chrome')
        if (!chrome) return { error: 'no panel' }
        const panel = chrome.closest('.panel')
        const id = panel.getAttribute('data-panel-id')
        const before = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        const r = chrome.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const DX = 137, DY = 42

        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })
        const scale = window.__m4aViewport().scale
        chrome.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        document.dispatchEvent(new MouseEvent('mousemove', opts(start.x + DX, start.y + DY, 1)))
        await new Promise((res) => setTimeout(res, 20))
        document.dispatchEvent(new MouseEvent('mouseup', opts(start.x + DX, start.y + DY, 0)))
        await new Promise((res) => setTimeout(res, 150))

        const after = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        return { id, before, after, scale, DX, DY }
      })()`)

      let moved = null
      let expectedX = null
      let expectedY = null
      if (dragged && !dragged.error) {
        // No translation term needed: at a fixed scale the viewport's
        // translation cancels out of a SCREEN DELTA the same way it cancels
        // in applyDrag itself (see check 10) — only the scale divides it.
        expectedX = dragged.before.x + dragged.DX / dragged.scale
        expectedY = dragged.before.y + dragged.DY / dragged.scale

        // The store writes on a 500ms debounce; flushSync is what before-quit
        // calls. Polled rather than a single flush immediately after the drag
        // because the renderer's save() effect and the IPC call it makes are
        // both async relative to the executeJavaScript that already resolved
        // above — flushing before that IPC lands would read a stale file once
        // and never retry.
        moved = await waitUntil(async () => {
          flushLayoutStore()
          if (!existsSync(LAYOUT_PATH)) return null
          const saved = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
          const panel = saved.workspaces[0].panels.find((p) => p.id === dragged.id)
          return panel ?? null
        }, 5000)
      }

      ok('19 a panel dragged in the renderer is written to layout.json',
        dragged && !dragged.error && moved !== null &&
          Math.abs(moved.x - expectedX) < 1 && Math.abs(moved.y - expectedY) < 1,
        dragged && !dragged.error
          ? `id=${dragged.id} expected=(${expectedX && expectedX.toFixed(1)},${expectedY && expectedY.toFixed(1)}) saved=${JSON.stringify(moved)}`
          : JSON.stringify(dragged))
    }

    // ---------------------------------------------------------------------
    // 20. ONE undo per gesture, not one per frame. A drag emits ~60 setPanels
    //     calls; if each pushed history, undoing a single drag would take
    //     sixty Cmd+Z presses and the feature would be unusable without ever
    //     failing a check. Modelled on check 19's drag (chrome mousedown, a
    //     move, mouseup) — the panel and its rect are both read from the live
    //     DOM right before the drag, since by this point checks 1-19 have
    //     already moved, zoomed, closed, and spawned panels.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const dragged = await wc.executeJavaScript(`(async () => {
        const chrome = document.querySelector('.panel__chrome')
        if (!chrome) return { error: 'no panel' }
        const panel = chrome.closest('.panel')
        const id = panel.getAttribute('data-panel-id')
        const before = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        const r = chrome.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const DX = 200, DY = 120

        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })
        chrome.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        document.dispatchEvent(new MouseEvent('mousemove', opts(start.x + DX, start.y + DY, 1)))
        await new Promise((res) => setTimeout(res, 20))
        document.dispatchEvent(new MouseEvent('mouseup', opts(start.x + DX, start.y + DY, 0)))
        await new Promise((res) => setTimeout(res, 150))

        const after = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        return { id, before, after }
      })()`)

      await wc.executeJavaScript(`window.__m4bUndo()`)
      await sleep(150)
      const undone = dragged && !dragged.error
        ? await wc.executeJavaScript(`(() => {
            const panel = document.querySelector('[data-panel-id="${dragged.id}"]')
            return panel && { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
          })()`)
        : null

      ok('20 one drag is one undo',
        dragged && !dragged.error && undone &&
          dragged.after.x !== dragged.before.x &&
          Math.abs(undone.x - dragged.before.x) < 1 &&
          Math.abs(undone.y - dragged.before.y) < 1,
        `before=${JSON.stringify(dragged && dragged.before)} ` +
        `after=${JSON.stringify(dragged && dragged.after)} undone=${JSON.stringify(undone)}`)
    }

    // ---------------------------------------------------------------------
    // 21. Undoing a close brings the panel back DORMANT. Its PTY was killed
    //     on the click that closed it and there is nothing to revive, so the
    //     honest restoration is the geometry plus a card that asks before
    //     starting again. Modelled on checks 13-14's close (a mousedown on
    //     .panel__close), but on an IDLE panel specifically — a running panel
    //     needs an arm-then-confirm second click before it closes at all,
    //     which is a different gesture this check is not about.
    // ---------------------------------------------------------------------
    {
      const countBefore = await panelCount(wc)
      const closed = await wc.executeJavaScript(`(() => {
        const panels = [...document.querySelectorAll('.panel')]
        const idle = panels.find((p) => p.querySelector('.panel__card-idle'))
        if (!idle) return { error: 'no idle panel to close' }
        const id = idle.getAttribute('data-panel-id')
        idle.querySelector('.panel__close').dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))
        return { id }
      })()`)
      await sleep(200)
      const countClosed = await panelCount(wc)

      await wc.executeJavaScript(`window.__m4bUndo()`)
      const restored = closed && !closed.error
        ? await waitUntil(
            () => wc.executeJavaScript(
              `(() => { const p = document.querySelector('[data-panel-id="${closed.id}"] .panel__card-idle'); return p && p.textContent })()`
            ), 2000)
        : null
      const countRestored = await panelCount(wc)

      ok('21 undoing a close restores the panel dormant',
        closed && !closed.error &&
          countClosed === countBefore - 1 &&
          countRestored === countBefore &&
          restored === 'click to start',
        `id=${closed && closed.id} ${countBefore} -> ${countClosed} -> ${countRestored} card="${restored}"`)
    }

    // ---------------------------------------------------------------------
    // 22. Undo of a spawn kills the PTY it created. applyHistory used to only
    //     touch React state (setPanels/setDormantIds/setSelectedId/
    //     setFocusedId) and never called registry.dispose — Cmd+N followed by
    //     Cmd+Z removed the panel from the DOM while its real child process
    //     kept running with no panel left to click a close button on, and the
    //     next action clears `future` so redo cannot resurrect it either.
    //     Modelled on check 7's Cmd+N spawn and check 20's undo, but read
    //     through pty:list (sessionMap) rather than the DOM: a leaked PTY is
    //     by construction invisible in the DOM, which is the whole bug.
    // ---------------------------------------------------------------------
    {
      // By this point in the suite, checks 1-21 have already spawned enough
      // panels that LIVE_BUDGET (8) is at or near capacity, and assignTiers
      // breaks ties among equally-never-focused eligible panels by
      // declaration order — a brand-new panel is always LAST in that order,
      // so it can lose the budget race to panels already on screen and never
      // go live at all, which would make this check about promotion timing
      // instead of about the leak. Reset zoom, then pan somewhere far outside
      // every existing panel's coordinates (SEED_PANELS/drags/prior spawns
      // all stay within roughly -1000..5000 on both axes) so the new panel is
      // the ONLY eligible one when it spawns and wins the budget trivially.
      await zoomTo(wc, '0')
      await wc.executeJavaScript(`
        document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: -200000, deltaY: -200000, deltaMode: 0
        }))
        true
      `)
      const idsBefore = new Set(
        await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
        )
      )
      const sessionsBeforeSpawn = await sessionMap(wc)
      await zoomTo(wc, 'n')
      const idsAfter = await waitUntil(async () => {
        const ids = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
        )
        return ids.length > idsBefore.size ? ids : false
      }, 3000)
      const newId = idsAfter ? idsAfter.find((id) => !idsBefore.has(id)) : undefined

      // Cmd+N's panel is centred on the current view, so it is on-screen and
      // therefore live — but the PTY spawns once tiering promotes and attaches
      // it, not synchronously with the keypress, so wait for it to actually
      // reach pty:list before asserting anything about undo.
      const sessionsAfterSpawn = newId
        ? await waitUntil(async () => {
            const map = await sessionMap(wc)
            return map.has(newId) ? map : false
          }, 3000)
        : null
      const newPid = sessionsAfterSpawn ? sessionsAfterSpawn.get(newId) : undefined

      await wc.executeJavaScript(`window.__m4bUndo()`)
      // waitUntil returns whatever the poll function last produced, which on
      // a timeout is the boolean `false` it returns while still waiting — not
      // a Map — so the wait itself only yields a boolean and the final map is
      // read separately for reporting/size comparison.
      const undoRemovedInTime = newId
        ? Boolean(
            await waitUntil(async () => !(await sessionMap(wc)).has(newId), 3000)
          )
        : false
      const sessionsAfterUndo = await sessionMap(wc)

      ok('22 undo of a spawn kills the leaked pty',
        newId !== undefined &&
          sessionsAfterSpawn !== null && typeof newPid === 'number' &&
          undoRemovedInTime &&
          sessionsAfterUndo.size === sessionsBeforeSpawn.size,
        `newId=${newId} pid=${newPid} sessionsBeforeSpawn=${sessionsBeforeSpawn.size} ` +
        `afterSpawn=${sessionsAfterSpawn && sessionsAfterSpawn.size} afterUndo=${sessionsAfterUndo.size}`)
    }

    // ---------------------------------------------------------------------
    // 23. Reset must never leave a blank canvas. layoutStore.reset() only
    //     clears the STORED camera; before this check existed, nothing
    //     exercised the renderer's reset handler at all (the confirmation
    //     dialog cannot be driven headlessly), so a whole-branch review is
    //     what caught it, not a suite. Pan far from the origin first — the
    //     failure mode is exactly a distant camera left behind while
    //     firstRunPanels() places its one panel at world (0,0) — then reset
    //     and assert the camera actually came back, alongside the other two
    //     properties a reset promises: exactly one panel, and every PTY that
    //     existed before the reset is gone.
    //
    //     "No orphaned PTYs" is checked as "none of the PRE-reset session ids
    //     survive", not as "pty:list is empty" — firstRunPanels()'s one panel
    //     is deliberately NOT dormant (see panels-persistence's "Panels that
    //     came from disk start dormant; first-run panels do not"), so once
    //     the camera reset above lands it on screen, it legitimately spawns
    //     its own fresh shell, same as a real first launch. Asserting zero
    //     sessions would fail on that correct behaviour, not catch a bug.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      await wc.executeJavaScript(`
        document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: 5000, deltaY: 3000, deltaMode: 0
        }))
        true
      `)
      const vpBefore = await wc.executeJavaScript(`window.__m4aViewport()`)
      const sessionsBeforeReset = await sessionMap(wc)

      await wc.executeJavaScript(`window.__m4bReset()`)
      await sleep(300) // pty.kill/pty.create are async IPC; let pty:list catch up

      const countAfter = await panelCount(wc)
      const vpAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
      const sessionsAfter = await sessionMap(wc)
      const survivors = [...sessionsBeforeReset.keys()].filter((id) => sessionsAfter.has(id))
      // M48: an empty canvas is a designed state — reset returns NO panel
      // and the launcher, made of the real create verbs, stands in for the
      // placeholder firstRunPanels() used to mint.
      const launcherAfter = await wc.executeJavaScript(`!!document.querySelector('[data-launcher]')`)
      // The quiet first-workspace shell collapses the columns whose prefs were
      // never set, and pans by half of what it closed so INITIAL's picture
      // stays put in the wider host (Canvas.tsx, quietShellRef). The shift is
      // derived from the column widths, never pinned as a number here.
      const quietShift = await wc.executeJavaScript(`window.canvas.settings.list().then((rows) => {
        const v = (id) => rows.find((r) => r.id === id)
        const shell = document.querySelector('.shell')
        if (shell.dataset.bp === 'compact') return 0
        const rail = v('shell.railOpen'), ctx = v('shell.inspectorOpen')
        const nav = rail && rail.persisted ? 0 : v('shell.navWidth').value
        const insp = ctx && ctx.persisted ? 0 : (shell.dataset.bp === 'wide' ? v('shell.inspectorWidth').value : 0)
        return (nav + insp) / 2
      })`)

      ok('23 reset returns an empty canvas with the launcher up, the camera to INITIAL, and kills every pre-reset PTY',
        countAfter === 0 && launcherAfter === true &&
          vpAfter.x === DEFAULT_CAMERA.x + quietShift && vpAfter.y === DEFAULT_CAMERA.y &&
          vpAfter.scale === DEFAULT_CAMERA.scale &&
          survivors.length === 0,
        `vpBefore=${JSON.stringify(vpBefore)} vpAfter=${JSON.stringify(vpAfter)} quietShift=${quietShift} ` +
        `panels=${countAfter} launcher=${launcherAfter} preResetSessions=${sessionsBeforeReset.size} survivors=${survivors.length}`)
    }

    // ---------------------------------------------------------------------
    // 25. session:backend, invoked END TO END through the real bridge.
    //     verify:ipc only asserts that a handler is REGISTERED for every
    //     contract channel; it never calls one. That gap is how a structured
    //     clone failure reached runtime during M4c — the handler returned the
    //     SessionBackend itself, whose spawn() function electron cannot clone,
    //     so the channel threw for every caller while verify:ipc stayed green.
    //     Asserting the SHAPE that comes back is what closes it: a value that
    //     survived the clone and carries the two fields the HUD reads.
    // ---------------------------------------------------------------------
    {
      const info = await wc.executeJavaScript(`window.canvas.session.info()`)
      ok('25 session:backend returns a cloneable { kind, reason } over the real bridge',
        !!info && (info.kind === 'tmux' || info.kind === 'direct') &&
          typeof info.reason === 'string' && info.reason.length > 0,
        JSON.stringify(info))
    }

    // ---------------------------------------------------------------------
    // 26. THE MILESTONE'S HEADLINE PROMISE, end to end: a real renderer
    //     teardown must DETACH the tmux client and leave the session running,
    //     so the next page lands back in the same process.
    //
    //     Nothing else anywhere in the verify suites could catch its loss.
    //     verify:pty-manager 12 calls detachAll() directly on a manager with
    //     no renderer anywhere, so a renderer-side teardown listener never
    //     fires; verify:window 4 installs its own lambda for the same reason.
    //     The defect this check exists for lived exactly in that gap: a
    //     `window.addEventListener('beforeunload', () => registry.disposeAll())`
    //     in Canvas.tsx sent pty:kill for every panel — i.e. `tmux
    //     kill-session` — and it WON the race, arriving before
    //     did-start-navigation's detachAll() ever ran. Every unit-level check
    //     stayed green while Cmd+R destroyed the user's agents.
    //
    //     Runs LAST on purpose: it reloads the page, which destroys the DOM
    //     and every session id the checks above were reasoning about.
    // ---------------------------------------------------------------------
    {
      const TMUX = findTmux()
      if (!TMUX) {
        // Reported, never silent: a suite that quietly covers nothing is
        // worse than one that says so.
        ok('26 tmux reload survival (SKIPPED — no tmux binary found)', true,
          'install tmux to cover this')
      } else {
        // The space in the directory name is deliberate, matching
        // verify:pty-manager: production's exitDir lives under
        // ~/Library/Application Support/..., and a space-free fixture is what
        // hid the unquoted-redirect defect for a whole milestone.
        const tmuxDir = mkdtempSync(join(tmpdir(), 'tc panels tmux '))
        const exitDir = join(tmuxDir, 'exit codes')
        mkdirSync(exitDir, { recursive: true })
        const confPath = join(tmuxDir, 'tmux.conf')
        writeFileSync(confPath, buildTmuxConf(exitDir, PANELS_SOCKET))
        state.tmuxBackend = createTmuxBackend({
          tmuxPath: TMUX, exitDir, confPath, reason: 'verify: tmux', socket: PANELS_SOCKET
        })
        const tmuxCli = (args) => {
          try { return execFileSync(TMUX, args, { encoding: 'utf8' }) } catch { return '' }
        }
        /** session_name -> pane pid, straight from tmux rather than from the app. */
        const socketPanes = () => {
          const out = tmuxCli(['-L', PANELS_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
          return new Map(out.split('\n').filter((l) => l.trim()).map((l) => {
            const [name, pid] = l.trim().split(' ')
            return [name, Number(pid)]
          }))
        }

        // Everything spawned before this point used the direct backend; from
        // here the manager is the real tmux one, so the panel created below
        // becomes an actual tmux session on PANELS_SOCKET.
        state.backend = state.tmuxBackend
        // Installed HERE rather than next to the window: attachPtyLifecycle
        // fires on the FIRST navigation too, and the s01 fixture session is
        // created before win.loadFile() — wiring it up front would detach
        // that fixture during the initial load and take checks 18/24 with it.
        attachPtyLifecycle(win, () => ptyManager.detachAll())

        const idsBefore = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        await zoomTo(wc, 'n')
        const idsAfter = await waitUntil(async () => {
          const ids = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return ids.length > idsBefore.size ? ids : false
        }, 4000)
        const newId = idsAfter ? idsAfter.find((id) => !idsBefore.has(id)) : undefined

        // Wait for tmux ITSELF to report the session — pty:create resolving
        // only means the client was spawned, and the assertion below is about
        // what is on the socket, so that is what has to be observed here too.
        const panesBefore = newId
          ? await waitUntil(async () => {
              const panes = socketPanes()
              return panes.has(newId) ? panes : false
            }, 8000)
          : null
        const pidBefore = panesBefore ? panesBefore.get(newId) : undefined

        // The real thing: a renderer teardown that skips React cleanup,
        // exactly like Cmd+R.
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        // beforeunload's pty:kill would already have landed by now (it is
        // sent before the navigation even starts), but give the kill-session
        // it turns into time to be observable rather than racing the read.
        await sleep(1500)

        const panesAfter = socketPanes()
        const pidAfter = newId ? panesAfter.get(newId) : undefined

        ok('26 a renderer reload detaches the client and leaves the tmux session running the SAME process',
          newId !== undefined && panesBefore !== null && typeof pidBefore === 'number' &&
            pidAfter === pidBefore,
          `newId=${newId} pid ${pidBefore} -> ${pidAfter ?? 'MISSING'} ` +
          `sessions=${JSON.stringify([...panesAfter.keys()])}`)
      }
    }

    // ---------------------------------------------------------------------
    // Check 39's fixture: a still-dormant, never-spawned panel that survives
    // to the very end of the suite.
    //
    // reset() (check 23) always collapses the canvas to firstRunPanels() —
    // one fresh, non-dormant panel — so nothing seeded into the BOOT layout
    // can be that fixture; it has to be seeded AFTER reset, into whatever a
    // later reload restores from. "Dormancy is about spawning, not
    // attaching" (CLAUDE.md): a panel with no live session restores dormant
    // regardless of backend, so this reload deliberately does NOT live inside
    // check 26's `if (!TMUX)` branch — that branch, and its reload, exist
    // for what check 26 itself asserts (a tmux session outliving its
    // client), and skip together on a machine with no tmux binary. Giving
    // check 39 its own reload here, unconditionally, is what keeps it
    // passing on a machine where check 26 SKIPPED — this suite's earlier
    // draft nested this in check 26's tmux branch and check 39 hard-failed
    // wherever check 26 did, for a reason that has nothing to do with the
    // command palette.
    // ---------------------------------------------------------------------
    {
      // flushLayoutStore() lands the renderer's current on-screen state on
      // disk first, so appending below — rather than replacing wholesale via
      // layoutStore.save() — cannot drop whatever panels are actually live.
      flushLayoutStore()
      const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
      const ws = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
      const maxZ = ws.panels.reduce((m, p) => Math.max(m, p.z), 0)
      ws.panels.push({
        id: NEVER_WOKEN_ID,
        // Far outside anything any later check's camera ever frames or
        // clicks, including check 30's unqualified background mousedown.
        // 720x460 matches PANEL_W/PANEL_H — hardcoded rather than imported,
        // since the exact box size is irrelevant here (nothing reads it)
        // and importing it would be one more coupling for no benefit.
        x: 50000, y: 50000, w: 720, h: 460, z: maxZ + 1,
        cwd: '~', args: ['-l']
      })
      writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
      // layout:load answers from layoutStore's in-memory snapshot, not a
      // fresh disk read (see main/ipc.ts) — without re-loading here, the
      // reload below would restore the file as it was before this push.
      layoutStore.load()

      // No live PTY exists (or ever will) for NEVER_WOKEN_ID under EITHER
      // backend, so boot reconciliation after this reload restores it
      // dormant regardless of whether check 26 ran the tmux branch above or
      // skipped it — this reload needs nothing check 26 set up.
      const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload()
      await reloaded
      // Boot reconciliation (pty:list, then registry.ensure for every
      // restored panel) runs after first paint, not synchronously with
      // did-finish-load; wait on the fixture actually showing up rather than
      // a guessed sleep.
      await waitUntil(async () => {
        const sessions = await wc.executeJavaScript(`window.__m4aSessions ? window.__m4aSessions() : []`)
        return sessions.some((s) => s.id === NEVER_WOKEN_ID) || false
      }, 4000)
    }

    /* ---- M5a presets ---- */

    // /bin/cat, not /bin/echo: check 26 swaps the manager onto the real tmux
    // backend WHEN TMUX IS PRESENT, and skips (leaving the direct backend in
    // place) when it is not — so checks 27-31 may run against either. Under
    // EITHER backend a process that exits immediately leaves pty:list before
    // check 28 can watch undo dispose it. cat with no args blocks on stdin
    // and stays alive for the whole suite.
    const CLAUDE_TEMPLATE = { cwd: '/tmp', command: '/bin/cat', args: [], w: 400, h: 300 }

    {
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      const vp = await wc.executeJavaScript(`window.__m4aViewport()`)
      wc.send(IPC_EVENTS.PRESET_SPAWN, CLAUDE_TEMPLATE)
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      const spec = newId ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(newId)})`) : null
      ok('27 PRESET_SPAWN makes a panel with the preset cwd, command and box',
        spec !== null && spec.spec.cwd === '/tmp' && spec.spec.command === '/bin/cat' &&
          spec.spec.panelId === newId && spec.rect.w === 400 && spec.rect.h === 300,
        `spec=${JSON.stringify(spec)} vp=${JSON.stringify(vp)}`)
      // Under the real tmux backend (checks 27-31 run after check 26 has
      // swapped it in), pty:create resolving is not the same moment the new
      // session shows up in `tmux list-sessions` — there is a beat between
      // the client attaching and the socket reflecting it. Check 28 takes its
      // OWN "before" snapshot via sessionMap next, and without waiting here
      // first, that snapshot can race ahead of this session's registration
      // and miss it, then "discover" it only after check 28's own spawn/undo
      // has already run — inflating its "after" count for a reason that has
      // nothing to do with undo/dispose. Settling here, not loosening check
      // 28's assertion, is the fix: it targets the actual race.
      if (newId) await waitUntil(async () => (await sessionMap(wc)).has(newId), 3000)
    }

    {
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      const sessionsBefore = await sessionMap(wc)
      wc.send(IPC_EVENTS.PRESET_SPAWN, CLAUDE_TEMPLATE)
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      const spawned = newId
        ? await waitUntil(async () => (await sessionMap(wc)).has(newId), 3000)
        : false
      await wc.executeJavaScript(`window.__m4bUndo()`)
      const gone = newId
        ? Boolean(await waitUntil(async () => !(await sessionMap(wc)).has(newId), 3000))
        : false
      const after = await sessionMap(wc)
      ok('28 undo of a preset spawn removes the panel AND disposes its session',
        newId !== undefined && spawned && gone && after.size === sessionsBefore.size,
        `newId=${newId} before=${sessionsBefore.size} after=${after.size}`)
    }

    {
      wc.send(IPC_EVENTS.PRESET_DEFAULT, { cwd: '/tmp', command: '/bin/cat', args: ['-u'] })
      // Give the listener a turn before the keypress: the send is asynchronous and
      // Cmd+N reads a ref, not a promise.
      await waitUntil(async () => await wc.executeJavaScript(
        `Boolean(window.__m5aDefaultSpec && window.__m5aDefaultSpec().command === '/bin/cat')`), 3000)
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      await zoomTo(wc, 'n')
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      const spec = newId ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(newId)})`) : null
      ok('29 PRESET_DEFAULT changes what Cmd+N spawns',
        spec !== null && spec.spec.command === '/bin/cat' &&
          spec.spec.args[0] === '-u',
        `spec=${spec && JSON.stringify(spec.spec)}`)
    }

    {
      // Focus a panel by clicking its body, then capture; then clear focus with a
      // background click and capture again. Focus release on a background click is
      // the behaviour check 8 already depends on.
      // A LIVE panel: .panel__slot exists only while tiering has the panel live —
      // a carded one renders PanelCard instead and has no slot to click. The slot's
      // own handler stopPropagation()s and calls onFocus, which is exactly the path
      // a real click takes; the canvas background handler would clear focus instead.
      const targetId = await wc.executeJavaScript(
        `document.querySelector('.panel__slot').closest('.panel').getAttribute('data-panel-id')`)
      await wc.executeJavaScript(`
        document.querySelector('.panel[data-panel-id="${targetId}"] .panel__slot')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 }))
        true
      `)
      // M12: a SYNTHETIC live update for the panel about to be captured, the
      // same route check 90 uses for the inspector's save-panel path — not a
      // real tmux session (`backend` is still DIRECT here, so pollLive's own
      // list() answers null and nothing would arrive on its own). Without
      // this, onCapture's `getLiveSession(...) ?? panel.spec.cwd` fallback
      // (Canvas.tsx, the MENU-driven capture path preset:save reaches through
      // main's Presets menu, distinct from preset:save-panel's inspector
      // path) is indistinguishable from a reverted `panel.spec.cwd` alone:
      // nothing forces the live branch to be the one actually exercised.
      // Check 90 does not cover this — it drives preset:save-panel via the
      // inspector's own action, never PRESET_CAPTURE — so this was the
      // surface a whole-branch review found genuinely uncovered.
      const CAPTURE_LIVE_DIR = mkdtempSync(join(tmpdir(), 'tc panels capture-live '))
      win.webContents.send(IPC_EVENTS.SESSION_LIVE,
        { panelId: targetId, cwd: CAPTURE_LIVE_DIR, currentCommand: 'bash' })
      const focused = await waitUntil(
        async () => {
          const c = await requestFromRenderer(wc, IPC_EVENTS.PRESET_CAPTURE, null)
          return c !== null && c.cwd === CAPTURE_LIVE_DIR ? c : false
        }, 3000)
      await wc.executeJavaScript(`
        document.querySelector('.canvas')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 }))
        true
      `)
      const unfocused = await requestFromRenderer(wc, IPC_EVENTS.PRESET_CAPTURE, null)
      ok('30 PRESET_CAPTURE returns the focused panel\'s LIVE cwd, not merely its spawn one, and null with nothing focused',
        focused !== false && focused !== null && focused.cwd === CAPTURE_LIVE_DIR &&
          Array.isArray(focused.args) && typeof focused.w === 'number' &&
          unfocused === null,
        `focused=${JSON.stringify(focused)} live=${CAPTURE_LIVE_DIR} unfocused=${JSON.stringify(unfocused)}`)
    }

    {
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      // No command at all — the login-shell case, and the one most likely to be
      // broken by a well-meaning default somewhere up the chain.
      wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '~', args: ['-l'] })
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      const spec = newId ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(newId)})`) : null
      // Since M6a (Task 5) the header reads status.command once main's real
      // spawn resolves, not just spec.command — so reading the title right
      // after the panel appears in the DOM (no wait for the backend) is a
      // race, not a fact. Mirror check 44's own fix for the identical race:
      // wait on sessionMap(wc) — MAIN's own pty:list — for backend
      // confirmation, then poll the title until it settles on the resolved
      // path. That keeps this a single deterministic assertion instead of
      // one that accepts two different textual outcomes and so can no
      // longer discriminate a broken resolved-path branch from a lucky race.
      const spawnedOnBackend = newId
        ? await waitUntil(async () => (await sessionMap(wc)).has(newId), 3000)
        : false
      const title = newId
        ? await waitUntil(async () => {
            const text = await wc.executeJavaScript(
              `document.querySelector('.panel[data-panel-id="${newId}"] .panel__title')?.textContent ?? ''`)
            return text.startsWith('/') ? text : false
          }, 3000)
        : false
      // The spec assertion is the load-bearing half, unchanged from before
      // M6a: a command-less PRESET_SPAWN must never get a command INJECTED
      // into the spec by a well-meaning default somewhere up the chain.
      //
      // This check needs the spawned panel actually promoted to LIVE and
      // spawning within the 3s window, and that is safe today only by
      // accident: checks 26 and 39 are reloads, a reload restores every
      // panel DORMANT ("Dormancy is about spawning, not attaching"), and
      // `lod.ts` excludes dormant panels from `eligible` — so they consume
      // no LIVE_BUDGET and leave this panel room to promote. A full budget
      // of eight in-viewport non-dormant panels ahead of it would leave it a
      // card forever and this would time out rather than fail. Checks 44 and
      // 45 spawn the same way via Cmd+N and carry the identical dependency.
      ok('31 a command-less preset stays command-less and reads as the login shell',
        spec !== null && spec.spec.command === undefined &&
          spawnedOnBackend && typeof title === 'string' && title.startsWith('/'),
        `command=${spec && JSON.stringify(spec.spec.command)} spawnedOnBackend=${spawnedOnBackend} title=${title}`)
    }

    {
      // 32. The default preset reaches the renderer AT REAL STARTUP, with the
      // harness sending nothing. Every other preset check drives the channel by
      // hand, which is exactly how the whole feature stayed inert while this
      // suite was green: main pushed at did-finish-load, Canvas.tsx subscribed
      // two awaited IPC round trips later, and the event landed with no
      // listener. Nothing complained, because makePanel's fallback is the same
      // login shell the default usually names — only a NON-shell default, like
      // this fixture's, can tell the two apart.
      ok('32 the configured default preset reaches the renderer at boot, unprompted',
        bootDefault !== null && bootDefault.command === BOOT_DEFAULT_PRESET.command &&
          bootDefault.cwd === BOOT_DEFAULT_PRESET.cwd && bootDefault.args[0] === '-v',
        `bootDefault=${JSON.stringify(bootDefault)}`)
    }

    // Checks 33-36 need a FOCUSED panel: 33's Cmd+K captures focusedId, 35's
    // __m4aCellToScreen reads the focused panel's buffer, and 36 asserts focus
    // comes back to a terminal. Check 30 deliberately ends on a background
    // click, which releases focus, and 31-32 focus nothing — so focus one here,
    // with the same .panel__slot mousedown check 30 uses (the slot's own
    // handler stopPropagation()s and calls onFocus; the canvas background
    // handler would clear focus instead). A LIVE panel, because only a live
    // panel has a .panel__slot and an xterm textarea to hand the keyboard back
    // to in check 36.
    {
      const targetId = await wc.executeJavaScript(
        `document.querySelector('.panel__slot').closest('.panel').getAttribute('data-panel-id')`)
      await wc.executeJavaScript(`
        document.querySelector('.panel[data-panel-id="${targetId}"] .panel__slot')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 }))
        true
      `)
      // Assert the precondition rather than assume it: checks 33-36 that ran
      // against an unfocused canvas would pass for the wrong reason.
      const focusedNow = await waitUntil(
        () => requestFromRenderer(wc, IPC_EVENTS.PRESET_CAPTURE, null), 2000)
      if (focusedNow === null) throw new Error('checks 33-36 precondition: no panel is focused')
    }

    // 33. Cmd+K opens the palette and takes DOM focus OFF the terminal.
    //     This is the whole milestone in one assertion: xterm reads its own
    //     hidden textarea and nothing else, so moving DOM focus to the input is
    //     what stops bare keys reaching the PTY — no global key swallowing
    //     required. Bound as a RENDERER keydown, not a menu accelerator, for the
    //     same reason Cmd+N is: a main-process accelerator would never receive
    //     a dispatched KeyboardEvent, so this check could not exist.
    {
      await wc.executeJavaScript(`
        document.querySelector('.panel__slot .xterm-helper-textarea')?.focus();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      `)
      const read = () => wc.executeJavaScript(`(() => {
        const el = document.activeElement
        return {
          open: document.querySelector('.palette') !== null,
          onInput: el !== null && el.classList.contains('palette__input'),
          onTerminal: el !== null && el.classList.contains('xterm-helper-textarea')
        }
      })()`)
      // waitUntil stops on any TRUTHY value and an object is always truthy, so
      // polling for the snapshot itself would return on the first read and
      // assert against a canvas that has not re-rendered yet. Wait on the
      // condition, then read the snapshot once.
      await waitUntil(async () => (await read()).open, 2000)
      const state = await read()
      ok('33 Cmd+K opens the palette and moves DOM focus off xterm',
        state.open && state.onInput && !state.onTerminal, JSON.stringify(state))

      // 33b. The same auto-repeat gap as 7b, one file over and with a louder
      //      symptom. Cmd+K TOGGLES, so an unguarded held chord flips the
      //      overlay open/closed at the repeat rate — a visible flicker, and
      //      worse, every re-open re-runs setCapturedId(focusedIdRef.current),
      //      so which panel the palette's rows act on ends up depending on
      //      whether the user released on an odd or an even repeat.
      //
      //      Asserted from the OPEN state on purpose: an even number of
      //      unguarded toggles would land back on "open" and read as a pass,
      //      so this sends five — odd — and a broken build closes the palette.
      //      Check 36 already proves a plain Cmd+K still closes it, and
      //      leaving it open here is what check 34 expects to run against.
      await wc.executeJavaScript(`
        for (let i = 0; i < 5; i++) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, repeat: true, bubbles: true }))
        }
        true
      `)
      await sleep(300)
      const stillOpen = await wc.executeJavaScript(`document.querySelector('.palette') !== null`)
      ok('33b holding Cmd+K does not re-toggle the palette', stillOpen, `open=${stillOpen}`)
    }

    // 34. Canvas shortcuts stand down while it is open. Cmd+N typed while
    //     filtering must not ALSO spawn a panel — useViewport's window keydown
    //     listener sees every key regardless of what has DOM focus, so the
    //     palette has to tell it to stand down.
    {
      const before = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))
      `)
      await sleep(300)
      const after = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
      ok('34 Cmd+N does not spawn while the palette is open', before === after, `${before} -> ${after}`)
    }

    // 35. Cmd+V while the palette is open fills the INPUT, not the PTY. main's
    //     menu accelerator sends edit:paste unconditionally, and Canvas routes it
    //     into the focused session — so without a guard the text lands in a
    //     running agent, invisibly, while the user watches an empty text field.
    {
      const MARK = 'M5BPASTEMARK'
      wc.send('edit:paste', MARK)
      const read = () => wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        return { inInput: input !== null && input.value.includes('${MARK}'),
                 inTerminal: window.__m4aCellToScreen('${MARK}') !== null }
      })()`)
      // The negative half is the one that needs the wait, and it is the one an
      // always-truthy poll would silently give away: read immediately and
      // 'inTerminal' is false because no PTY could have echoed yet, guard or no
      // guard. Wait for EITHER destination, then settle before the read that
      // the assertion actually uses, so a slow echo cannot hide behind a poll
      // that already returned.
      await waitUntil(async () => { const s = await read(); return s.inInput || s.inTerminal }, 2000)
      await sleep(500)
      const seen = await read()
      ok('35 a menu paste with the palette open reaches the input, not the PTY',
        seen.inInput && !seen.inTerminal, JSON.stringify(seen))
    }

    // 36. Escape closes and gives the keyboard BACK. Without this the user
    //     presses Escape, types, sees nothing happen, and concludes they
    //     mis-clicked. SessionHandle.focus() exists for exactly this.
    {
      // Read the pre-Escape state and assert it too. Without it this check
      // passes for the wrong reason when the palette never opened at all:
      // check 33 leaves DOM focus on the xterm textarea, so "closed and on a
      // terminal" is exactly what NO palette also looks like. `?.` so a
      // missing input fails this check instead of aborting the whole run.
      const before = await wc.executeJavaScript(`(() => {
        const el = document.activeElement
        return {
          open: document.querySelector('.palette') !== null,
          onInput: el !== null && el.classList.contains('palette__input')
        }
      })()`)
      await wc.executeJavaScript(`
        document.querySelector('.palette__input')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        true
      `)
      const read = () => wc.executeJavaScript(`(() => {
        const el = document.activeElement
        return {
          closed: document.querySelector('.palette') === null,
          onTerminal: el !== null && el.classList.contains('xterm-helper-textarea')
        }
      })()`)
      // Wait on onTerminal, not on the snapshot and not on `closed`: `closed`
      // is also what a palette that never opened looks like, so it cannot be
      // the thing this poll waits for.
      await waitUntil(async () => (await read()).onTerminal, 2000)
      const state = await read()
      ok('36 Escape closes the palette and restores the terminal',
        before.open && before.onInput && state.closed && state.onTerminal,
        `${JSON.stringify(before)} -> ${JSON.stringify(state)}`)
    }

    // 37. Cmd+Z stands down too. Rule 3 is "canvas shortcuts stand down", and
    //     Cmd+Z is a menu accelerator on exactly the same footing as Cmd+V
    //     (main/menu.ts sends edit:undo unconditionally). With the palette open
    //     and a name half-typed, an unguarded edit:undo does not undo the
    //     TYPING: it runs applyHistory, which REMOVES a panel and disposes its
    //     session, behind the overlay, with nothing on screen to explain it —
    //     strictly worse than the paste check 35 covers.
    {
      const ids = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      // Put a known entry on the history stack rather than depending on
      // whatever the preceding checks happened to leave there: a check whose
      // undo had nothing to undo would pass without testing anything.
      const before = new Set(await ids())
      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
      const spawned = await waitUntil(async () => {
        const now = await ids()
        return now.length > before.size ? now : false
      }, 3000)
      const newId = spawned ? spawned.find((id) => !before.has(id)) : undefined

      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)

      wc.send('edit:undo')
      await sleep(400) // nothing to wait FOR: the assertion is that nothing happens
      const survived = newId !== undefined && (await ids()).includes(newId)

      // The other half, and the reason this check cannot pass vacuously: with
      // the palette CLOSED the very same event must still undo the spawn. If
      // it does not, the guard above is not standing down, it is broken.
      await wc.executeJavaScript(`
        document.querySelector('.palette__input')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        true
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
      wc.send('edit:undo')
      const undone = newId !== undefined &&
        Boolean(await waitUntil(async () => !(await ids()).includes(newId), 3000))

      ok('37 Cmd+Z does not undo behind an open palette, and still undoes once it is closed',
        survived && undone, `newId=${newId} survived=${survived} undoneAfterClose=${undone}`)
    }

    // 38. A rename made in the palette reaches the store and comes back in the
    //     next preset:list. This is the debt M5a deferred here by name: it
    //     shipped presets that could be created and picked but not renamed,
    //     because the rename needed a text field and the text field needed the
    //     focus rules that did not exist yet.
    {
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
      // Filter to the rename row for the user preset the layout file seeded,
      // run it, then type the new name and press Enter. React's controlled
      // <input> ignores a plain input.value = x — the native setter plus a
      // dispatched 'input' is what makes the change reach React's state, so
      // do not simplify it into an assignment.
      const renamed = await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, v)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        nativeSet(document.querySelector('.palette__input'), 'rename harness')
        await new Promise((r) => setTimeout(r, 50))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Rename preset harness preset'))
        if (!row) return 'no rename row for the seeded user preset'
        if (row.className.includes('palette__row--disabled')) return 'rename row was disabled'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        // Still an input, and now in rename mode: the row's action must have
        // reopened the palette into inputMode rather than leaving it shut.
        const input2 = document.querySelector('.palette__input')
        if (!input2) return 'palette closed instead of entering rename mode'
        if (document.querySelector('.palette__list')) return 'still in command mode'
        nativeSet(input2, 'renamed by palette')
        input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await new Promise((r) => setTimeout(r, 200))
        const rows = await window.canvas.preset.list()
        return rows.some((r) => r.name === 'renamed by palette')
      })()`)
      ok('38 a rename in the palette reaches the store', renamed === true, String(renamed))

      // The input mode must not outlive the rename. Palette.tsx closes BEFORE
      // calling submit, so nothing in the submit path is still on screen to
      // clear it — an uncleared mode greets the next Cmd+K with a stale text
      // field and no list. The same applies to a rename abandoned with
      // Escape, which is why both are asserted here rather than only the
      // completed one.
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
      const freshAfterSubmit = await wc.executeJavaScript(
        `document.querySelector('.palette__list') !== null &&
         (document.querySelector('.palette__input') || {}).value === ''`)

      // Now enter rename mode again and abandon it with Escape.
      const freshAfterCancel = await wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        // Guarded rather than assumed: a setter .call'd on null throws
        // "Illegal invocation", which reports as an infrastructure crash and
        // buries whichever earlier assertion actually went wrong.
        if (!input) return 'palette was not open'
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        // 'rename renamed', not 'rename harness': the preset just got a new
        // name, and the query has to be a subsequence of the row it means.
        setter.call(input, 'rename renamed')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Rename preset renamed by palette'))
        if (!row) return 'no rename row after the rename'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        document.querySelector('.palette__input')
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        await new Promise((r) => setTimeout(r, 100))
        return document.querySelector('.palette__list') !== null &&
          document.querySelector('.palette__input').value === ''
      })()`)
      ok('38b the palette reopens in command mode after a completed and a cancelled rename',
        freshAfterSubmit === true && freshAfterCancel === true,
        `afterSubmit=${freshAfterSubmit} afterCancel=${freshAfterCancel}`)
    }

    // 39. "Go to <panel>" frames a dormant panel and does NOT start its
    //     process. Waking hangs off SELECT, not focus (onSelectPanel clears
    //     dormantIds and calls registry.wake), so the obvious implementation
    //     — reuse onSelectPanel — would spawn an agent as a side effect of
    //     NAVIGATING. On a restored twelve-panel canvas that is twelve CLIs
    //     launched from a keyboard jump, which is the failure M4b's dormancy
    //     rule exists to prevent. The card still says "click to start", and
    //     it still means it.
    //
    //     Requires a dormant, never-spawned panel to still exist at this
    //     point in the run. Every SEED_PANELS id got woken by the "wake every
    //     panel" step before check 1, and reset (check 23) collapses the
    //     canvas to one fresh, non-dormant panel — so nothing seeded into the
    //     BOOT layout can be the fixture here. NEVER_WOKEN_ID is seeded
    //     instead by its own reload right after check 26 (see the comment
    //     there — deliberately NOT check 26's tmux-only reload, so this
    //     fixture exists whether or not tmux is installed), parked at world
    //     (50000, 50000) — far outside every click any later check makes,
    //     including check 30's unqualified background mousedown, which is
    //     what silently re-wakes the reset panel (p1) and is the reason p1
    //     itself is not this fixture. A null dormantId here means one of
    //     those assumptions broke, and the check fails loudly rather than
    //     silently skipping — a check that passes because it found nothing
    //     to test is worse than one that fails.
    {
      const dormantId = (await wc.executeJavaScript(`
        (window.__m4aSessions().find((s) => s.dormant && !s.spawned) || {}).id || null
      `))
      if (dormantId === null) {
        ok('39 go-to frames a dormant panel without spawning it', false,
          'no dormant, unspawned panel survived to this check — fixture assumption broke')
      } else {
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        // Cmd+K TOGGLES (usePalette.ts) — 38b leaves the palette OPEN in
        // command mode, so a blind Cmd+K here would CLOSE it instead of
        // opening it, and everything below would silently act on a null
        // input. Only dispatch it when the palette is not already open, then
        // wait on the actual DOM state (as check 33 does) instead of a fixed
        // sleep that raced this exact toggle once already.
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          // M64: the id left the row's text; 'go to' lists every panel and
          // the row is picked by its command id below.
          setter.call(input, 'go to')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 50))
          // By TEXT, not by position: the prompt list now includes whatever
          // .claude/commands the focused panel's cwd holds, so "the first
          // row" is no longer a fact this suite controls. A row picked by
          // what it says can only ever run the command the check means.
          // M64: by the row's command id — the id left the row's TEXT when
          // identity started leading (brief, principle 3).
          const row = document.querySelector('.palette__row[data-command-id="panel.goto.${dormantId}"]')
          if (row) row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        })()`)
        await sleep(400)
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        const stillDormant = await wc.executeJavaScript(`
          (window.__m4aSessions().find((s) => s.id === '${dormantId}') || {}).spawned === false
        `)
        // WHERE the camera went, not merely that it moved: a centreOn that
        // framed the wrong panel — or the right one at the wrong scale —
        // also changes x and y, and "the viewport is not where it was" is
        // true of any pan at all. The expectation is viewport.ts's centreOn
        // recomputed here from the panel's own rect and the host's size:
        // the rect's centre lands in the middle of the canvas at the
        // UNCHANGED scale (framing must never re-zoom — verify:viewport
        // 49-50). Recomputed rather than imported because this suite loads
        // the built renderer and has no module to import from.
        const expected = await wc.executeJavaScript(`(() => {
          const rect = window.__m5aSpecOf('${dormantId}').rect
          const host = document.querySelector('.canvas').getBoundingClientRect()
          const vp = window.__m4aViewport()
          return {
            x: host.width / 2 - (rect.x + rect.w / 2) * vp.scale,
            y: host.height / 2 - (rect.y + rect.h / 2) * vp.scale
          }
        })()`)
        // Sub-pixel: the arithmetic is float, and getBoundingClientRect can
        // hand back a fractional width. A wrong-panel framing is off by
        // whole world units, so nothing this tolerance admits is a defect
        // this check could otherwise catch.
        const framed = Math.abs(after.x - expected.x) < 1 && Math.abs(after.y - expected.y) < 1
        ok('39 go-to frames a dormant panel without spawning it',
          framed && after.scale === before.scale && stillDormant === true,
          `${JSON.stringify(before)} -> ${JSON.stringify(after)} expected=${JSON.stringify(expected)} spawned=${!stillDormant}`)
      }
    }

    // 40a/40. Prompts in the palette, and the one thing about them that can
    //     fail silently.
    //
    //     40a spawns a panel by picking a preset row, which is the only
    //     end-to-end exercise of preset:spawn-by-id in this suite: the invoke
    //     has to reach the harness's onSpawnPreset stand-in, the id has to
    //     resolve to ECHO_PRESET and not to some other row the fuzzy matcher
    //     ranked first, and the template has to arrive at makePanel. It is
    //     asserted on the SPEC of the new panel, not on "a panel appeared" —
    //     the wrong preset also makes a panel appear.
    //
    //     40 is the milestone's headline requirement. session-factory.ts
    //     records the failure from Cmd+V: a raw write of a multi-line prompt
    //     into an agent TUI is one submission per newline, i.e. several
    //     partial prompts instead of one. paste() goes through xterm, which
    //     brackets it when the app has enabled mode 2004, so the block
    //     arrives as ONE input — and every prompt is multi-line, so every use
    //     of this feature depends on it.
    //
    //     The discriminator is the bracketed-paste markers. ECHO_PRESET's
    //     program enables 2004 and echoes with `cat -v`, so a paste() puts
    //     "^[[200~" in the buffer and a write() puts the bare body there.
    //     Nothing weaker can tell the two apart, because against an ordinary
    //     shell both put identical bytes on the PTY — which is why this check
    //     must never be relaxed into "the prompt text arrived".
    {
      const idsBefore = await wc.executeJavaScript(
        `window.__m4aSessions().map((s) => s.id)`
      )
      // Cmd+K TOGGLES, and check 39 above ran a row (which closes the
      // palette) — but assert the DOM state rather than trusting that, the
      // same way 39 does after 38b left the palette open.
      await wc.executeJavaScript(`
        if (document.querySelector('.palette') === null) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        }
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const clicked = await wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'new panel from echo')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 80))
        const row = [...document.querySelectorAll('.palette__row')]
          // M6p retitled spawn rows to the preset name alone — the words
          // "New panel from" are the section header now, and live on in the
          // row's searchText so the query above still finds it.
          .find((r) => r.textContent.includes('echo -v'))
        if (!row) return false
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        return true
      })()`)
      const echoId = clicked
        ? await waitUntil(async () => {
            const ids = await wc.executeJavaScript(`window.__m4aSessions().map((s) => s.id)`)
            return ids.find((id) => !idsBefore.includes(id)) || null
          }, 3000)
        : null
      const echoSpec = echoId
        ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(echoId)})`)
        : null
      ok('40a a palette preset pick spawns that preset through preset:spawn-by-id',
        echoSpec !== null && echoSpec.spec.command === '/bin/sh' &&
          echoSpec.spec.args[0] === '-c' && echoSpec.spec.args[1].includes('2004h'),
        `${echoId} ${JSON.stringify(echoSpec && echoSpec.spec)}`)

      if (!echoId) {
        ok('40 a prompt insert arrives as a bracketed paste, not a raw write', false,
          'no panel spawned, so there was nothing to paste into')
      } else {
        // Focus it: the palette captures focusedId at OPEN time (focus is
        // released on a background click, so reading it live would be a
        // different id), and insertPrompt targets that captured panel.
        // Spawning does not focus, so this click is what makes the echo panel
        // the target — and __m4aGrid()/__m4aCellToScreen() both read the
        // focused session, so they are reading this panel from here on.
        const focused = await waitUntil(async () => {
          // Retried, not dispatched once: the panel is spawned by a setPanels
          // in another check's tick and its slot only exists once tiering has
          // promoted it, so the first click can land before there is anything
          // to click.
          await wc.executeJavaScript(`(() => {
            const slot = document.querySelector('[data-panel-id=${JSON.stringify(echoId)}] .panel__slot')
            if (slot) slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          })()`)
          return wc.executeJavaScript(`window.__m4aGrid() !== null`)
        }, 5000, 200)
        // The PTY has to have run the printf before the paste, or mode 2004 is
        // still off and xterm sends the body unbracketed — a false FAIL that
        // would look exactly like a write().
        await waitUntil(async () => await wc.executeJavaScript(
          `(window.__m4aSessions().find((s) => s.id === ${JSON.stringify(echoId)}) || {}).spawned === true`
        ), 5000)
        await sleep(600)

        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        // Run the row with ENTER, not a click. A mousedown on a palette row
        // bubbles to .canvas's background handler, which releases focusedId —
        // the insert still targets the right panel (the palette captured it at
        // open), but __m4aCellToScreen reads the FOCUSED session and would
        // have nothing to read. The keyboard is the palette's primary path
        // anyway. The selected row's text is asserted before Enter, so this
        // cannot pass by running some other row.
        const insertRow = await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'insert prompt two liner')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const selected = document.querySelector('.palette__row--selected')
          // M6p: the title is the prompt's name alone under a PROMPTS header.
          if (!selected || !selected.textContent.includes('two liner')) {
            return selected ? selected.textContent : 'no row'
          }
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          return true
        })()`)
        const bracketed = insertRow === true
          ? await waitUntil(
              () => wc.executeJavaScript(`window.__m4aCellToScreen('200~') !== null`),
              3000
            )
          : false
        ok('40 a prompt insert arrives as a bracketed paste, not a raw write',
          bracketed === true,
          `focused=${focused} row=${insertRow} body=${JSON.stringify(
            await wc.executeJavaScript(`window.__m4aCellToScreen('first line') !== null`)
          )}`)
      }
    }


    // 41. A MOUSE-picked palette row leaves the focused panel focused.
    //
    //     Palette mounts inside .canvas, and .canvas's onMouseDown is the
    //     background handler. Without a stopPropagation on the palette root,
    //     every mousedown in the overlay — a row pick, or a click into the
    //     input to place a caret — reaches it, and it does three things: it
    //     releases focusedId, it hit-tests the click's WORLD point and selects
    //     whatever panel lies under the overlay, and through onSelectPanel it
    //     WAKES that panel if it is dormant. A palette click that spawns a
    //     process is the exact failure M4b's dormancy rule exists to prevent.
    //
    //     Focus is the probe because it is the half that breaks the feature
    //     shipped one check up: with focusedId null, the NEXT Cmd+K captures
    //     nothing and buildCommands disables every "Insert prompt" row with
    //     REASON_NO_FOCUS. __m4aGrid() resolves through focusedIdRef, so a
    //     non-null answer is "the app still believes a live panel is focused"
    //     — which is precisely what check 40 has to route around by driving
    //     its row with Enter instead of a click.
    //
    //     The row picked is "Reset zoom": it must be a real, runnable,
    //     mouse-clicked row (the whole point), and that one touches only the
    //     camera, so nothing about the assertion depends on what it did.
    {
      const focusedBefore = await wc.executeJavaScript(`window.__m4aGrid() !== null`)
      await wc.executeJavaScript(`
        if (document.querySelector('.palette') === null) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        }
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const picked = await wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'reset zoom')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 120))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Reset zoom'))
        if (!row) return false
        // A REAL mousedown, bubbling exactly as a user's does — the propagation
        // is the subject of this check, so nothing here may short-circuit it.
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        return true
      })()`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
      const focusedAfter = await wc.executeJavaScript(`window.__m4aGrid() !== null`)
      ok('41 a mouse-picked palette row does not release the focused panel',
        focusedBefore === true && picked === true && focusedAfter === true,
        `before=${focusedBefore} picked=${picked} after=${focusedAfter}`)
    }

    // 42. A click OUTSIDE the palette closes it — and still does its ordinary
    //     job of focusing the panel it landed on.
    //
    //     The spec's focus rule 4 names three ways out of the palette:
    //     Escape, Enter-after-run, and a click outside. The third was the one
    //     with no code behind it, and its absence is reachable in ONE click:
    //     .palette is a 680px box at top: 12%, not a full-viewport scrim, so a
    //     click anywhere else lands on a panel (or the background) and the
    //     overlay stays up with its input BLURRED — xterm's textarea now has
    //     DOM focus, so bare keys go to the agent while the palette sits there
    //     looking ready to take a query. That is verbatim the failure rule 1
    //     exists to prevent, and Escape cannot even undo it: the key reaches
    //     the PTY, not the palette's onKeyDown.
    //
    //     Panel clicks never reach .canvas's background onMouseDown (every
    //     panel handler stopPropagations), so the close cannot live there —
    //     it has to be a CAPTURE-phase handler that sees the click before the
    //     panel does. Clicking a panel is therefore the discriminating
    //     gesture: a fix written only into the background handler passes a
    //     background-click check and fails this one.
    //
    //     Focus is the second half of the assertion and the reason the target
    //     must be a panel other than the captured one: closePalette() calls
    //     restoreFocus(capturedId), which would take the keyboard straight
    //     back to the PREVIOUSLY focused panel and leave the user typing into
    //     a panel they just clicked away from.
    {
      const capturedId = await wc.executeJavaScript(`(() => {
        const el = document.activeElement && document.activeElement.closest('.panel')
        return el ? el.getAttribute('data-panel-id') : null
      })()`)
      const targetId = await wc.executeJavaScript(`(() => {
        const panel = [...document.querySelectorAll('.panel__slot')]
          .map((slot) => slot.closest('.panel'))
          .find((p) => p && p.getAttribute('data-panel-id') !== ${JSON.stringify(capturedId)})
        return panel ? panel.getAttribute('data-panel-id') : null
      })()`)
      if (capturedId === null || targetId === null) {
        ok('42 a click outside the palette closes it and focuses what it hit', false,
          `fixture assumption broke: captured=${capturedId} target=${targetId} ` +
          '(needs a focused panel and a SECOND live panel to click)')
      } else {
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        // A real, bubbling mousedown on the terminal slot — the propagation
        // path is the subject of the check, so nothing here may short-circuit
        // it, and it is the same gesture check 40 uses to focus a panel.
        await wc.executeJavaScript(`(() => {
          const slot = document.querySelector('[data-panel-id=${JSON.stringify(targetId)}] .panel__slot')
          slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        })()`)
        const closed = await waitUntil(
          () => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
        await sleep(200)
        const focusedAfter = await wc.executeJavaScript(`(() => {
          const el = document.activeElement && document.activeElement.closest('.panel')
          return el ? el.getAttribute('data-panel-id') : null
        })()`)
        ok('42 a click outside the palette closes it and focuses what it hit',
          closed === true && focusedAfter === targetId,
          `captured=${capturedId} target=${targetId} closed=${closed} focused=${focusedAfter}`)
      }
    }

    // 43. The PROJECT half of the prompt list, end to end.
    //
    //     Everything about .claude/commands was proven only as far as
    //     verify:layout 53-57's pure unit checks: the harness's listPrompts
    //     used to answer mergePrompts(saved, []) — a literal empty project
    //     half — so main/index.ts's `readProjectPrompts(resolveCwd(cwd))` was
    //     never called by any check anywhere. A regression there (the cwd of
    //     the wrong panel, a `.claude/commands` path assembled wrongly, a
    //     swapped source label) removes ROWS, and a shorter list looks
    //     exactly like "this project has no commands". Nothing throws and
    //     nothing logs. What this check does NOT cover is resolveCwd's `~`
    //     expansion: PROJECT_DIR is absolute, so resolveCwd is the identity
    //     here — the expansion is verify:pty-manager's ground, and claiming
    //     it here would be a comment the check cannot honour.
    //
    //     The fixture is a real file in a real directory (PROJECT_DIR, with a
    //     space in its path on purpose) that this suite wrote before the
    //     window loaded, and the panel it belongs to is the ECHO panel check
    //     40 spawned — the only panel pointed at that directory. Which makes
    //     the assertion three things at once: the row exists (so the read
    //     happened, under the CAPTURED panel's cwd and not some other
    //     panel's), it is labelled `project` (the source survived the merge),
    //     and its BODY reaches the terminal (so the `proj:` id the palette
    //     holds still resolves to the file's text).
    {
      const echoId = await wc.executeJavaScript(`(() => {
        const dir = ${JSON.stringify(PROJECT_DIR)}
        const found = window.__m4aSessions()
          .map((s) => s.id)
          .find((id) => (window.__m5aSpecOf(id) || { spec: {} }).spec.cwd === dir)
        return found || null
      })()`)
      if (echoId === null) {
        ok('43 a project prompt is listed and inserted from the panel\'s own cwd', false,
          'no panel is running in PROJECT_DIR — check 40a\'s spawn is this check\'s fixture')
      } else {
        // Focus it: the palette captures focusedId at OPEN time and lists the
        // CAPTURED panel's cwd, so this click is what makes PROJECT_DIR the
        // directory read. Retried for the same reason check 40's is.
        const focused = await waitUntil(async () => {
          await wc.executeJavaScript(`(() => {
            const slot = document.querySelector('[data-panel-id=${JSON.stringify(echoId)}] .panel__slot')
            if (slot) slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          })()`)
          return wc.executeJavaScript(`(() => {
            const el = document.activeElement && document.activeElement.closest('.panel')
            return el !== null && el.getAttribute('data-panel-id') === ${JSON.stringify(echoId)}
          })()`)
        }, 5000, 200)
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        // ENTER, not a click, for the same reason check 40 uses it: a mouse
        // pick is fine (check 42 is what proves that now), but the assertion
        // below reads the FOCUSED session through __m4aCellToScreen and the
        // keyboard path leaves focus exactly where it was.
        const insertRow = await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'insert ${PROJECT_PROMPT_NAME}')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const selected = document.querySelector('.palette__row--selected')
          if (!selected) return 'no row'
          const text = selected.textContent
          // Both halves asserted before Enter: the NAME (so this is the
          // project file and not the saved prompt check 40 seeded) and the
          // SOURCE label (a swapped label is the silent half of this defect —
          // the row still runs, it just tells the user the wrong story about
          // where the text they are about to paste came from).
          if (!text.includes('${PROJECT_PROMPT_NAME}') ||
              !text.includes('project — .claude/commands')) return text
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          return true
        })()`)
        const arrived = insertRow === true
          ? await waitUntil(
              () => wc.executeJavaScript(`window.__m4aCellToScreen('zzprojectbody') !== null`),
              3000
            )
          : false
        ok('43 a project prompt is listed and inserted from the panel\'s own cwd',
          arrived === true,
          `focused=${focused} row=${insertRow} arrived=${arrived}`)
      }
    }

    // 44 — M6a. A panel whose SPEC has no command is the default case —
    //     every Cmd+N panel and the built-in login-shell preset — and its
    //     header printed the literal string "login shell" for the whole
    //     life of the app. Main has known the real answer since M4. By this
    //     point in the suite the canvas has been reset (23), reloaded (26,
    //     39) and had panels spawned-and-undone (37), so the first `.panel`
    //     in DOM order is not a known quantity — this check spawns and
    //     identifies its OWN panel rather than trusting a bare first match.
    {
      // Check 29 pointed Cmd+N's default at a fixture command ('/bin/cat
      // -u'), but check 39's renderer reload re-fires did-finish-load, which
      // re-pushes BOOT_DEFAULT_PRESET ('/bin/cat -v') over it — so by the
      // time this check runs, the default in effect is BOOT_DEFAULT_PRESET,
      // not check 29's. Left alone, this check would spawn a panel whose
      // spec ALREADY names a command, and the header would read that command
      // via the existing `spec.command ?? 'login shell'` fallback even
      // before the chain changes — passing for a reason that has nothing to
      // do with what this check tests. Re-point the default at a
      // command-less template, the same shape check 31 uses, so this panel
      // exercises the actual case the header stand-in exists for: an absent
      // spec.command.
      wc.send(IPC_EVENTS.PRESET_DEFAULT, { cwd: '/tmp', args: [] })
      await waitUntil(async () => await wc.executeJavaScript(
        `Boolean(window.__m5aDefaultSpec && window.__m5aDefaultSpec().command === undefined)`), 3000)

      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      // Check 37 already establishes this exact idiom for capturing a
      // Cmd+N panel's id: dispatch the synthetic keydown on window, then
      // diff the id list against the snapshot taken before it.
      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      // A command-less panel spawns only once it goes LIVE ("Lazy spawn"),
      // and even then the header's honest answer is not available until
      // pty:create resolves. sessionMap reads MAIN's own pty:list, so
      // waiting on it is waiting for the actual spawn to have completed on
      // the backend, not a guessed clock delay.
      const spawnedOnBackend = newId
        ? await waitUntil(async () => (await sessionMap(wc)).has(newId), 3000)
        : false
      // The header re-renders off registry.version(), which bumps on the
      // status transition to 'running' — a beat after the backend spawn
      // above, not the same tick. Poll the label itself rather than reading
      // it once right after the backend confirms.
      const label = newId
        ? await waitUntil(async () => {
            const text = await wc.executeJavaScript(
              `document.querySelector('.panel[data-panel-id="${newId}"] .panel__title')?.textContent ?? ''`)
            return text.startsWith('/') ? text : false
          }, 3000)
        : false
      const rawLabel = newId
        ? await wc.executeJavaScript(
            `document.querySelector('.panel[data-panel-id="${newId}"] .panel__title')?.textContent ?? ''`)
        : null
      ok('44 the header names what main resolved, not the stand-in',
        newId !== undefined && spawnedOnBackend && label !== false && label !== 'login shell' &&
          typeof label === 'string' && label.startsWith('/'),
        `newId=${newId} spawnedOnBackend=${spawnedOnBackend} label=${label} rawLabel=${rawLabel}`)

      // Restore what was ACTUALLY in effect before this check's repoint —
      // BOOT_DEFAULT_PRESET ('/bin/cat -v'), the value check 39's reload left
      // behind, not check 29's ('/bin/cat -u'), which that reload already
      // overwrote. This check is not the last one in the file by accident of
      // when it was written — Task 7 appends checks 45-46 right after it,
      // driving the command palette, which plausibly exercises Cmd+N and the
      // default-preset template. Leaving the command-less repoint above in
      // place for the rest of the run would be exactly the silent
      // shared-state leak check 39's design note already warns against
      // (there, isolating a reload from check 26's; here, isolating this
      // check's own repoint from whatever comes after it).
      wc.send(IPC_EVENTS.PRESET_DEFAULT,
        { cwd: BOOT_DEFAULT_PRESET.cwd, command: BOOT_DEFAULT_PRESET.command, args: BOOT_DEFAULT_PRESET.args })
      await waitUntil(async () => await wc.executeJavaScript(
        `Boolean(window.__m5aDefaultSpec && window.__m5aDefaultSpec().command === '${BOOT_DEFAULT_PRESET.command}')`), 3000)
    }

    // 45-46 — M6a. A rename is a COMMITTED gesture, so it pushes exactly one
    //     history entry — the same rule a drag obeys, for the same reason: an
    //     entry per keystroke would make one rename take a dozen Cmd+Z presses
    //     to unwind while every final-state assertion still passed.
    //
    //     By this point in the suite the canvas has been reset (23), reloaded
    //     (26, 39) and had panels spawned-and-undone (37), so the first
    //     `.panel` in DOM order is not a known quantity — check 44's idiom is
    //     reused here: spawn a panel with Cmd+N, diff the id snapshot to find
    //     it, and assert on that id specifically rather than trusting a bare
    //     first match.
    //
    //     Note the nativeSet dance below, copied from check 38 and
    //     load-bearing for the same reason: React's controlled <input>
    //     IGNORES a plain input.value = x. Only the prototype's native setter
    //     plus a dispatched 'input' event reaches React's state, so a check
    //     written the obvious way types into a field the component never
    //     learns about, submits an empty string, and fails for a reason that
    //     has nothing to do with renaming.
    {
      const idsBefore45 = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
      const ids45 = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore45.size ? now : false
      }, 3000)
      const panelId = ids45 ? ids45.find((id) => !idsBefore45.has(id)) : undefined

      // Spawning does not focus (check 40's note): the palette captures
      // focusedId at OPEN time, so without this click the rename row would be
      // aimed at whatever panel was focused before, not the one just spawned.
      if (panelId) {
        await waitUntil(async () => {
          await wc.executeJavaScript(`(() => {
            const slot = document.querySelector('[data-panel-id=${JSON.stringify(panelId)}] .panel__slot')
            if (slot) slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          })()`)
          return wc.executeJavaScript(`window.__m4aGrid() !== null`)
        }, 5000, 200)
      }

      const titleOf = () => panelId
        ? wc.executeJavaScript(
            `document.querySelector('.panel[data-panel-id=${JSON.stringify(panelId)}] .panel__title')?.textContent ?? ''`)
        : Promise.resolve('')
      const panelExists = () => panelId
        ? wc.executeJavaScript(
            `document.querySelector('.panel[data-panel-id=${JSON.stringify(panelId)}]') !== null`)
        : Promise.resolve(false)

      // Captured BEFORE the rename runs, so check 46 has something real to
      // undo back TO. Without this, `titleOf()` returning '' after undo is
      // ambiguous between "the rename reverted" and "the panel is gone" —
      // and an undo that popped check 45's own Cmd+N spawn (e.g. because the
      // rename pushed zero history entries) would produce exactly that ''
      // and read as success.
      //
      // Waited, not read once: the grid being ready (above) only means the
      // terminal is attached, not that pty:create has resolved and bumped
      // registry.version() into 'running' — the same lag check 44 waits out
      // with `label.startsWith('/')`. Capturing too early would freeze in
      // '' or the stand-in, and the real command could still settle in
      // behind the rename before the undo assertion runs, making a correct
      // implementation look like it reverted to the wrong value.
      const preRenameTitle = await waitUntil(async () => {
        const text = await titleOf()
        return text.startsWith('/') ? text : false
      }, 3000) || await titleOf()

      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)

      const ran = panelId ? await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, v)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        nativeSet(document.querySelector('.palette__input'), 'rename panel')
        await new Promise((r) => setTimeout(r, 50))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Rename panel'))
        if (!row) return 'no rename-panel row'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 100))
        const field = document.querySelector('.palette__input')
        if (!field) return 'no input after entering rename mode'
        nativeSet(field, 'auth refactor')
        await new Promise((r) => setTimeout(r, 50))
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        return 'ok'
      })()`) : 'no panel spawned'

      const landed = ran === 'ok' &&
        Boolean(await waitUntil(async () => (await titleOf()) === 'auth refactor', 3000))
      ok('45 a rename from the palette reaches the panel header', landed, `panelId=${panelId} ran=${ran}`)

      wc.send('edit:undo')
      // Asserts the panel is STILL THERE, not merely that its header no
      // longer reads 'auth refactor' — `titleOf()` returns '' for a missing
      // element too, so a zero-history-entry rename that let this Cmd+Z pop
      // check 45's own Cmd+N spawn instead would satisfy a `!== 'auth
      // refactor'` check while asserting the opposite of what it claims. The
      // real assertion is that the header reverted to what it said before
      // the rename ran.
      const revertedTitle = await waitUntil(async () => {
        const text = await titleOf()
        return text === preRenameTitle ? text : false
      }, 3000)
      const stillExists = await panelExists()
      const undone = stillExists && revertedTitle !== false
      ok('46 one Cmd+Z undoes the whole rename', landed && undone,
        `preRenameTitle=${preRenameTitle} stillExists=${stillExists} revertedTitle=${revertedTitle}`)
    }

    // ---------------------------------------------------------------------
    // 47. The palette owns every wheel over itself. .palette mounts INSIDE
    //     .canvas, so useViewport's capture-phase listener sees the event
    //     first; before shouldYieldWheel learned about .palette it called
    //     preventDefault() there, which both panned the camera and killed the
    //     native scrolling of .palette__list (max-height: 46vh, overflow-y:
    //     auto) — the list could only ever be moved by the arrow keys.
    //
    //     WHY THE ASSERTION IS CANCELLATION AND NOT scrollTop: a synthetic
    //     WheelEvent is untrusted, and Chromium performs no default action
    //     for an untrusted event — so .palette__list would NOT scroll here
    //     even against a fully correct implementation, and a scrollTop check
    //     would fail the fix it is meant to prove. dispatchEvent() returns
    //     false iff something called preventDefault(), so "not cancelled" is
    //     precisely "the browser will scroll this", and it is exactly the bit
    //     this change flips. The background control below is what keeps that
    //     from being vacuous: it must still come back cancelled, and must
    //     still move the camera, or a listener that had simply stopped
    //     working would pass the palette halves for the wrong reason.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      if (await wc.executeJavaScript(`document.querySelector('.palette') === null`)) {
        await wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      }
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)

      const result = await wc.executeJavaScript(`(async () => {
        const read = () => getComputedStyle(document.querySelector('.world')).transform
        // Dispatched on a ROW, not on .palette: a row is where a real cursor
        // over the list actually is, and it is a descendant of the scroll
        // container whose default action is the thing being protected. The
        // same lesson check 12 records about .panel__slot vs .xterm-screen.
        const row = document.querySelector('.palette__row')
        if (!row) return { error: 'no .palette__row' }
        if (!document.querySelector('.world')) return { error: 'no .world' }
        const r = row.getBoundingClientRect()
        const wheel = (extra) => new WheelEvent('wheel', Object.assign({
          bubbles: true, cancelable: true,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          deltaY: 120, deltaMode: 0
        }, extra))

        const before = read()
        const plainOverPalette = row.dispatchEvent(wheel({}))
        await new Promise((res) => setTimeout(res, 200))

        // The pinch spelling. Over the palette this must be yielded TOO —
        // rule 1 outranks rule 2 in shouldYieldWheel, because while the
        // palette is open every other canvas gesture stands down. Safe to
        // dispatch before the transform is re-read only because a yielded
        // zoom changes no scale; if it were claimed, this is the wheel that
        // would show up in transformAfter.
        const pinchOverPalette = row.dispatchEvent(wheel({ ctrlKey: true }))
        await new Promise((res) => setTimeout(res, 200))
        const transformAfterPalette = read()

        // Control: the same wheel on the background is still the camera's.
        const canvas = document.querySelector('.canvas')
        const overBackground = canvas.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 5, clientY: 5, deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const transformAfterBackground = read()

        document.querySelector('.palette__input')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return {
          before, plainOverPalette, pinchOverPalette,
          transformAfterPalette, overBackground, transformAfterBackground
        }
      })()`)

      ok('47 a wheel over the open palette is left uncancelled and does not move the camera, pinch included, while the background still pans',
        result && !result.error &&
          result.plainOverPalette === true &&
          result.pinchOverPalette === true &&
          result.transformAfterPalette === result.before &&
          result.overBackground === false &&
          result.transformAfterBackground !== result.before,
        `error=${result && result.error} plain=${result && result.plainOverPalette} ` +
        `pinch=${result && result.pinchOverPalette} background=${result && result.overBackground} ` +
        `transform: ${result && result.before} -> palette ${result && result.transformAfterPalette} ` +
        `-> background ${result && result.transformAfterBackground}`)
      await zoomTo(wc, '0')
    }

    // 48-50. M6p — the palette's structure, end to end. The pure suite proves
    //     the model; these three prove the model reached the screen, which is
    //     the half that has silently failed before in this codebase (check 32
    //     exists because a correct default-preset feature sat inert behind a
    //     subscription that never fired).
    //
    //     Every one of them opens the palette defensively rather than sending
    //     a blind Cmd+K: the chord TOGGLES, and earlier checks do not all
    //     leave it closed — check 39 already had to learn this the hard way.
    {
      const openPalette = async () => {
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      }
      // An IIFE, not a bare `const`. executeJavaScript evaluates each call as
      // a top-level SCRIPT, so a top-level `const` lands in the page's global
      // lexical scope and survives the call — calling this helper twice then
      // throws "Identifier 'i' has already been declared" before the script
      // runs at all, which surfaces as an opaque "Script failed to execute"
      // that aborts the whole suite rather than failing one check.
      const escape = () => wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })()`)
      const closePalette = async () => {
        await escape()
        await sleep(80)
        // Escape is now TWO-STAGE: inside a scope it pops the scope and the
        // palette stays open. One press is therefore not a guaranteed close,
        // and a helper that assumed it was would leave every later check
        // acting on an overlay it thought was gone.
        await escape()
        return sleep(80)
      }

      // 48. Section headers exist in the DOM, appear ONCE each, and are in
      //     SECTIONS order. The old per-row group chip rendered on every row
      //     and was the thing that made a twenty-row list unreadable; a
      //     regression that brought it back — or that emitted a header per row
      //     — looks almost identical in a screenshot and is obvious here.
      {
        await openPalette()
        const headers = await wc.executeJavaScript(`
          [...document.querySelectorAll('.palette__section')].map((h) => h.textContent.trim())
        `)
        // Restates palette-model.ts's SECTIONS (by label) and MUST move with
        // it — this is the same defect class CLAUDE.md records verify:palette
        // check 30 being rewritten to fix: a restated list goes stale the
        // moment a section is added, and the check then fails for a reason
        // that has nothing to do with the section-ordering property it
        // exists to prove. This exact staleness is what happened here: M7
        // added 'workspace' to SECTIONS (between 'prompt' and 'canvas') and
        // an unconditional 'New workspace…' row (group: 'workspace', no
        // hiddenAtRest) that renders its header even with zero workspaces —
        // ORDER did not move with it, and 'Settings' had already been
        // missing since M6b for the same reason, silently harmless only
        // because every settings row is hiddenAtRest and nothing unconditional
        // renders that header at rest. Kept as a restated array rather than
        // importing SECTIONS itself: this suite (unlike verify-palette.cjs)
        // loads the built renderer rather than bundling palette-model.ts, so
        // reaching the real SECTIONS value here would mean adding plumbing
        // this task was told not to add.
        const ORDER = ['Panels', 'New panel', 'Prompts', 'Workspaces', 'Bookmarks', 'Canvas', 'Settings', 'Credentials', 'Manage']
        const unique = headers.length === new Set(headers).size
        const ordered = headers.join(',') ===
          ORDER.filter((label) => headers.includes(label)).join(',')
        ok('48 section headers render once each, in SECTIONS order',
          headers.length >= 3 && unique && ordered, headers.join(','))
        await closePalette()
      }

      // 49. The drill-in, and its exit. Two halves, and the SECOND is the one
      //     worth writing: Escape inside a scope must pop back to the top
      //     level and leave the palette OPEN. If it closed instead, the
      //     drill-in would be a trap the user escapes only by reopening —
      //     and every assertion about narrowing would still pass.
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'manage presets')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 80))
          const door = [...document.querySelectorAll('.palette__row')]
            .find((r) => r.textContent.includes('Manage presets'))
          if (!door) return { error: 'no Manage presets row' }
          door.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const rowsInside = [...document.querySelectorAll('.palette__row')].map((r) => r.textContent)
          const scoped = {
            chip: (document.querySelector('.palette__scope') || {}).textContent || null,
            // Every row inside the presets scope is a preset row. "Go to" is
            // the cheapest proof the filter is real: the panel switcher is
            // always populated at this point in the run.
            leaked: rowsInside.filter((t) => t.includes('Go to')).length,
            // The administration rows the resting list hides are exactly what
            // the user drilled in FOR.
            hasDelete: rowsInside.some((t) => t.includes('Delete preset')),
            count: rowsInside.length
          }
          const input2 = document.querySelector('.palette__input')
          input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          return {
            scoped,
            stillOpen: document.querySelector('.palette') !== null,
            chipGone: document.querySelector('.palette__scope') === null,
            backAtTop: [...document.querySelectorAll('.palette__row')]
              .some((r) => (r.getAttribute('data-command-id') || '').startsWith('panel.goto.'))
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49 a drill-in narrows to its own rows and Escape pops back without closing',
          result && !result.error &&
            result.scoped.leaked === 0 &&
            result.scoped.hasDelete === true &&
            result.scoped.count > 0 &&
            result.stillOpen === true &&
            result.chipGone === true &&
            result.backAtTop === true,
          JSON.stringify(result))
        await closePalette()
      }

      // 49b. The horizontal spelling of the same two moves: ArrowRight opens
      //      the door under the selection, ArrowLeft comes back. It asserts
      //      the same three facts about the SCOPE that 49 does rather than
      //      merely "a chip appeared", so an ArrowRight that opened the wrong
      //      drill-in still fails. Dispatched on .palette__input, never on
      //      window: this handler is the input's own onKeyDown and a window
      //      dispatch never reaches it (the same trap check 70 records).
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          const input = document.querySelector('.palette__input')
          setter.call(input, 'manage presets')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 80))
          // Caret at the end — where typing leaves it — which is the only
          // position ArrowRight is allowed to act from.
          const typed = document.querySelector('.palette__input')
          typed.setSelectionRange(typed.value.length, typed.value.length)
          typed.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const inside = [...document.querySelectorAll('.palette__row')].map((r) => r.textContent)
          const scoped = {
            chip: (document.querySelector('.palette__scope') || {}).textContent || null,
            leaked: inside.filter((t) => t.includes('Go to')).length,
            hasDelete: inside.some((t) => t.includes('Delete preset')),
            count: inside.length
          }
          // Entering a door clears the query, so the caret is at 0 already —
          // which is exactly where ArrowLeft is allowed to pop from.
          const input2 = document.querySelector('.palette__input')
          input2.setSelectionRange(0, 0)
          input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          return {
            scoped,
            stillOpen: document.querySelector('.palette') !== null,
            chipGone: document.querySelector('.palette__scope') === null,
            backAtTop: [...document.querySelectorAll('.palette__row')]
              .some((r) => (r.getAttribute('data-command-id') || '').startsWith('panel.goto.'))
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49b ArrowRight enters a drill-in and ArrowLeft pops back without closing',
          result && !result.error &&
            result.scoped.chip === 'Presets' &&
            result.scoped.leaked === 0 &&
            result.scoped.hasDelete === true &&
            result.scoped.count > 0 &&
            result.stillOpen === true &&
            result.chipGone === true &&
            result.backAtTop === true,
          JSON.stringify(result))
        await closePalette()
      }

      // 49c. The caret gate, both halves — and this is the half that
      //      separates the shipped behaviour from the naive unconditional
      //      one. .palette__input is the only text field in this app the
      //      user cannot tab out of, so arrows that ALWAYS navigate make a
      //      typed query uneditable: there is no other way to move the
      //      caret back into it. 49b passes against that implementation.
      //      So: caret at 0 with text present must NOT enter a scope, and
      //      caret at the end with text present must NOT pop one.
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          const type = async (text) => {
            const el = document.querySelector('.palette__input')
            setter.call(el, text)
            el.dispatchEvent(new Event('input', { bubbles: true }))
            await new Promise((r) => setTimeout(r, 80))
          }
          const press = async (key, caret) => {
            const el = document.querySelector('.palette__input')
            el.setSelectionRange(caret, caret)
            el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
            await new Promise((r) => setTimeout(r, 120))
          }
          // Half one: the door is selected, but the caret is mid-query.
          await type('manage presets')
          await press('ArrowRight', 0)
          const enteredFromCaretZero = document.querySelector('.palette__scope') !== null
          // Now actually enter, from the end, and type inside the scope.
          await press('ArrowRight', 'manage presets'.length)
          const inScope = document.querySelector('.palette__scope') !== null
          await type('del')
          // Half two: caret at the end of a non-empty query must not pop.
          await press('ArrowLeft', 'del'.length)
          const poppedFromCaretEnd = document.querySelector('.palette__scope') === null
          // And the gate is a gate, not a disablement: from caret 0 it pops.
          await press('ArrowLeft', 0)
          return {
            enteredFromCaretZero,
            inScope,
            poppedFromCaretEnd,
            poppedFromCaretZero: document.querySelector('.palette__scope') === null,
            stillOpen: document.querySelector('.palette') !== null
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49c the drill-in arrows are caret-gated in both directions',
          result && !result.error &&
            result.enteredFromCaretZero === false &&
            result.inScope === true &&
            result.poppedFromCaretEnd === false &&
            result.poppedFromCaretZero === true &&
            result.stillOpen === true,
          JSON.stringify(result))
        await closePalette()
      }

      // 49d. POPPING A DRILL-IN RETURNS THE SELECTION TO THE DOOR IT CAME IN
      //      THROUGH. Until this, leaving a scope re-seeded from
      //      bestMatchIndex — and a pop leaves an EMPTY query behind (runRow
      //      cleared it on the way in), so every score ties at 0 and that
      //      degenerates to firstRunnable: the top of the Panels section. The
      //      user walked through a door and came back out somewhere else,
      //      with Enter now pointed at a command they never chose. The
      //      existing follow-the-selection-by-id arm cannot cover this: the
      //      row selected INSIDE the scope is hiddenAtRest, so it is not in
      //      the resting list to be followed back to.
      //
      //      Clauses 1-3 are the anti-tautology half and are not optional.
      //      If ArrowRight silently failed to enter the scope, the query would
      //      still read 'manage settings' and the door would still be the
      //      selected row — so a check asserting only clause 5 passes green
      //      against a completely broken drill-in.
      //
      //      'manage settings' is unambiguous by construction: fuzzyMatch
      //      drops spaces, so this is the single subsequence 'managesettings',
      //      which no other door and no settings label can match.
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          const selectedText = () => {
            const row = document.querySelector('.palette__row--selected')
            return row ? row.textContent : null
          }
          const input = document.querySelector('.palette__input')
          setter.call(input, 'manage settings')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          // (1) The precondition: the door is what the query selected.
          const selectedBefore = selectedText()
          const typed = document.querySelector('.palette__input')
          typed.setSelectionRange(typed.value.length, typed.value.length)
          typed.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          // (2) We really are inside the settings scope.
          const chip = (document.querySelector('.palette__scope') || {}).textContent || null
          // Entering clears the query, so the caret is already at 0 — the one
          // position ArrowLeft is allowed to pop from.
          const input2 = document.querySelector('.palette__input')
          input2.setSelectionRange(0, 0)
          input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          return {
            selectedBefore,
            chip,
            // (3) The pop happened and the overlay survived it.
            stillOpen: document.querySelector('.palette') !== null,
            chipGone: document.querySelector('.palette__scope') === null,
            // (4) There IS a selected row: index -1 renders none at all, and
            //     "no selection" would satisfy any assertion phrased as a
            //     negative about where the selection is NOT.
            hasSelection: document.querySelector('.palette__row--selected') !== null,
            // (5) And it is the door.
            selectedAfter: selectedText()
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49d popping a drill-in returns the selection to the door it was entered through',
          result && !result.error &&
            typeof result.selectedBefore === 'string' &&
            result.selectedBefore.includes('Manage settings') &&
            result.chip === 'Settings' &&
            result.stillOpen === true &&
            result.chipGone === true &&
            result.hasSelection === true &&
            typeof result.selectedAfter === 'string' &&
            result.selectedAfter.includes('Manage settings'),
          JSON.stringify(result))
        await closePalette()
      }

      // 49e. THE SAME LANDING WHEN NO DOOR WAS EVER TRAVERSED. M8a's top-bar
      //      gear opens the palette straight into the settings scope
      //      (openPalette('settings')), so there is no entered row to
      //      remember — and this is the ONLY check that separates the shipped
      //      design, which DERIVES the door from `entersScope`, from the
      //      obvious alternative of stashing the entered row's id in a ref.
      //      That alternative satisfies 49d and cannot satisfy this at all.
      //
      //      Deliberately not folded into check 78, whose subject is "the
      //      button opens IN the scope" and which must keep failing for its
      //      own reason.
      {
        await closePalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          document.querySelector('.shell__settings')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 200))
          const chip = (document.querySelector('.palette__scope') || {}).textContent || null
          const input = document.querySelector('.palette__input')
          if (!input) return { error: 'palette did not open' }
          input.setSelectionRange(0, 0)
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          const row = document.querySelector('.palette__row--selected')
          return {
            chip,
            chipGone: document.querySelector('.palette__scope') === null,
            stillOpen: document.querySelector('.palette') !== null,
            selectedAfter: row ? row.textContent : null
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49e popping a scope the gear opened lands on that scope’s door too',
          result && !result.error &&
            result.chip === 'Settings' &&
            result.chipGone === true &&
            result.stillOpen === true &&
            typeof result.selectedAfter === 'string' &&
            result.selectedAfter.includes('Manage settings'),
          JSON.stringify(result))
        await closePalette()
      }

      // 50. A delete is gated, and Escape CANCELS it. The assertion that
      //     matters is the last one: a confirm step that confirms
      //     unconditionally is invisible — the dialog appears, the user says
      //     no, and the preset is gone anyway. So this reads the store back
      //     through preset.list() rather than trusting the overlay's state.
      //
      //     Targets the seeded user preset (renamed by check 38), because the
      //     built-ins refuse deletion with a reason and would make a disabled
      //     row look like a working confirm gate.
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const before = (await window.canvas.preset.list()).map((p) => p.name)
          const victim = before.find((n) => n.includes('renamed by palette') || n.includes('harness'))
          if (!victim) return { error: 'no user preset to try deleting: ' + before.join('|') }
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'delete preset ' + victim)
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 100))
          const row = [...document.querySelectorAll('.palette__row')]
            .find((r) => r.textContent.includes('Delete preset ' + victim))
          if (!row) return { error: 'no delete row for ' + victim }
          const wasRed = row.className.includes('palette__row--destructive')
          row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          // Confirm mode: the palette is still up, the list is gone, and the
          // question names what is about to be destroyed.
          const confirming = document.querySelector('.palette__confirm') !== null &&
            document.querySelector('.palette__list') === null
          const named = confirming &&
            document.querySelector('.palette__confirm').textContent.includes(victim)
          const input2 = document.querySelector('.palette__input')
          if (input2) input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await new Promise((r) => setTimeout(r, 250))
          const after = (await window.canvas.preset.list()).map((p) => p.name)
          return { wasRed, confirming, named, survived: after.includes(victim), victim }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('50 a destructive row is marked, gated by a confirm, and Escape leaves the preset alone',
          result && !result.error &&
            result.wasRed === true &&
            result.confirming === true &&
            result.named === true &&
            result.survived === true,
          JSON.stringify(result))
        await closePalette()
      }
    }

    // 51. A SECOND Cmd+N at the same camera lands one CASCADE_STEP down and
    //     right of the first instead of on top of it. Every path that makes a
    //     panel funnels through Canvas.tsx's onSpawn, which used to hand the
    //     view centre straight to makePanel — so N presses without moving the
    //     camera produced N byte-identical rects. The canvas then LOOKS like
    //     it holds one panel: the buried ones are unreachable (their close
    //     buttons are underneath) while each still holds a WebGL context and a
    //     LIVE_BUDGET slot, and the panel count in the HUD is the only
    //     evidence they exist.
    //
    //     Why this check has to be here and not only in verify:viewport:
    //     cascadeCentre can be perfect and green under plain node while
    //     onSpawn never calls it. Every other Cmd+N driver in this suite (7b,
    //     17, 22, 26, 29) asserts count, ids or spec — none of them would
    //     notice.
    //
    //     Why EXACTLY one step and not merely "somewhere else": a cascade that
    //     jitters by a random amount also un-stacks the panels, but it is
    //     unpredictable to the user and nothing could assert it. The lattice
    //     is what makes the gap-filling behaviour (close one, spawn again,
    //     land back in that hole) possible at all.
    //
    //     And why the live assertion: this is the ONLY place the suite proves
    //     a cascaded panel is still inside the cull region and therefore still
    //     promoted, rather than merely arguing it. A panel walked off screen
    //     is never attached, never spawns a PTY, and Cmd+N appears to do
    //     nothing whatsoever — a quieter failure than the stacking it
    //     replaced. It is also what protects check 22's stated assumption
    //     ("Cmd+N's panel is centred on the current view, so it is on-screen
    //     and therefore live") from a future CASCADE_MAX_STEPS increase.
    {
      // Reset, then pan far outside every panel this run has created, for the
      // same reason check 22 does it: the cascade is decided against the LIVE
      // panel array, so starting over empty world space makes the first press
      // land dead centre deterministically instead of depending on which
      // lattice slots fifty checks of spawning and dragging have filled.
      await zoomTo(wc, '0')
      await wc.executeJavaScript(`
        document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: -300000, deltaY: -300000, deltaMode: 0
        }))
        true
      `)

      const panelIds = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
      )
      // Read by data-panel-id, never "the last .panel in the DOM": array order
      // and paint order are deliberately different things here (see Panel.z),
      // so the newest panel is not necessarily the last element.
      const centreOf = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('.panel[data-panel-id=${JSON.stringify(id)}]')
        if (!el) return null
        return { x: parseFloat(el.style.left) + parseFloat(el.style.width) / 2,
                 y: parseFloat(el.style.top) + parseFloat(el.style.height) / 2 }
      })()`)
      const spawnOne = async () => {
        const before = new Set(await panelIds())
        await zoomTo(wc, 'n')
        const after = await waitUntil(async () => {
          const ids = await panelIds()
          return ids.length > before.size ? ids : false
        }, 3000)
        return after ? after.find((id) => !before.has(id)) : undefined
      }

      // The expectation comes out of the live DOM — the host's own bounds and
      // the world layer's own transform — rather than from INITIAL/PANEL_W,
      // for the reason check 7's comment gives.
      const expectedCentre = await viewCentreInWorld(wc)
      const firstId = await spawnOne()
      const secondId = await spawnOne()
      const first = firstId ? await centreOf(firstId) : null
      const second = secondId ? await centreOf(secondId) : null
      const live = secondId
        ? Boolean(
            await waitUntil(
              () => wc.executeJavaScript(
                `!!document.querySelector('.panel[data-panel-id="${secondId}"] .xterm')`
              ),
              3000
            )
          )
        : false

      const TOL = 1 // same 1px float-rounding slack check 7 allows
      const firstCentred = first &&
        Math.abs(first.x - expectedCentre.x) <= TOL &&
        Math.abs(first.y - expectedCentre.y) <= TOL
      const stepped = first && second &&
        Math.abs(second.x - first.x - CASCADE_STEP) <= TOL &&
        Math.abs(second.y - first.y - CASCADE_STEP) <= TOL
      ok('51 a second Cmd+N at one camera cascades one step instead of stacking, and still goes live',
        Boolean(firstCentred && stepped && live),
        `first=${JSON.stringify(first)} second=${JSON.stringify(second)} ` +
          `viewCentre=${JSON.stringify(expectedCentre)} step=${CASCADE_STEP} live=${live}`)
    }

    // 52-53 — M6b. The end-to-end proof that a palette toggle reaches main's store
    //     and comes back changed. 53 is the half that matters: a toggle that
    //     updates the row but never reaches the store looks identical on screen
    //     until the next relaunch, when the setting is silently back.
    {
      const openPalette = async () => {
        await wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
      }
      const closePalette = async () => {
        await wc.executeJavaScript(`
          document.querySelector('.palette__input')
            ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          true
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
      }

      await openPalette()
      // Type a KEYWORD, not the label — this is check 35's property proven through
      // the real palette rather than against buildCommands in isolation.
      const found = await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, v)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        nativeSet(document.querySelector('.palette__input'), 'viewport')
        await new Promise((r) => setTimeout(r, 100))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Restore camera position'))
        if (!row) return 'not found'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        return 'ok'
      })()`)
      ok('52 a setting is reachable in the palette by a keyword it does not display',
        found === 'ok', String(found))

      const stored = await waitUntil(async () => {
        const v = await wc.executeJavaScript(
          `window.canvas.settings.list().then((s) => s.find((x) => x.id === 'restore.camera').value)`)
        return v === false ? 'off' : false
      }, 3000)
      ok('53 the toggle reached main\'s store, not just the row', stored === 'off')

      await closePalette()
    }

    // ---------------------------------------------------------------------
    // 54-57 — M6c. Agent state, end to end in a real renderer.
    //
    //     Everything under the renderer is already proven in a cheaper tier:
    //     scanForBell and the state machine under plain node, the manager's
    //     wiring under Electron-as-node. What none of those tiers can see is
    //     the SEAM — whether a state main derived reaches the pixels at all,
    //     whether it reaches a CARD, and whether main is the one that clears
    //     it. Every layer can be individually correct and the feature still
    //     be invisible, which is the shape of failure this suite exists for.
    //
    //     The fixture is a panel of this block's own, running a plain
    //     /bin/sh, rather than one of the seed panels. These checks need a
    //     PTY that will EMIT chosen bytes on demand — a real BEL, and a real
    //     OSC window title — and by this point in the run Cmd+N's default is
    //     check 29's `cat`, which only echoes what it is given and can never
    //     produce a control byte of its own. Bytes are put on the PTY with
    //     ptyManager.write, i.e. through the same call pty:write's handler
    //     makes, so the detector sees them exactly as it sees a user typing.
    // ---------------------------------------------------------------------
    {
      // The shell reads these as command lines, so what reaches the detector
      // is printf's OUTPUT — one real BEL byte, and one real OSC title ending
      // in the BEL that is its terminator. The echoed input contains no
      // control bytes at all, which is what keeps the two stimuli distinct.
      const BELL_LINE = "printf '\\007'\n"
      const TITLE_LINE = "printf '\\033]0;a title\\007'\n"

      const panelIds = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
      )
      // Read by data-panel-id, never "the last .panel": array order and paint
      // order are deliberately different here (Panel.z), the same rule check
      // 51 states.
      const agentStateOf = (id) => wc.executeJavaScript(
        `(() => { const el = document.querySelector('[data-panel-id=${JSON.stringify(id)}]')
                  return el ? el.getAttribute('data-agent-state') : null })()`
      )
      const cardClassOf = (id) => wc.executeJavaScript(
        `(() => { const el = document.querySelector('[data-panel-id=${JSON.stringify(id)}] .panel__card')
                  return el ? el.className : null })()`
      )
      const isLive = (id) => wc.executeJavaScript(
        `!!document.querySelector('[data-panel-id=${JSON.stringify(id)}] .panel__slot .xterm')`
      )
      // A wheel on the canvas host, the same gesture check 51 pans with. Two
      // opposite calls restore the camera exactly, which is what lets check 56
      // demote a panel and check 57 bring the SAME one back into reach of a
      // real click.
      const panBy = (dx, dy) => wc.executeJavaScript(`
        document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: ${dx}, deltaY: ${dy}, deltaMode: 0
        }))
        true
      `)
      const clickBackground = async () => {
        const point = await backgroundPoint(wc)
        if (!point) throw new Error('54-57: found no background point on the canvas')
        wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        await sleep(150)
      }

      // Pin this block's fixture to the DIRECT backend. Check 26 swapped the
      // manager onto a real tmux one, and a tmux CLIENT NEVER SEES AN OSC
      // WINDOW TITLE: tmux parses its pane's output stream itself and consumes
      // `ESC ] 0 ; <title> BEL` to set the pane title, forwarding the bell it
      // is made of to no one. Check 55's stimulus therefore never reached
      // main's detector at all while this block ran under tmux — measured, not
      // assumed: with the scanner deliberately broken to count the OSC
      // terminator as a bell, verify:agent-state went red and check 55 stayed
      // GREEN, which is exactly the shape of a check that reads as coverage
      // and proves nothing.
      //
      // Swapping back also makes 54-57 backend-INDEPENDENT: they otherwise ran
      // against a different byte stream on a machine with tmux than on one
      // without, so the four of them would mean two different things depending
      // on who ran the suite.
      //
      // Safe at teardown regardless of whether further blocks run after this
      // one (M7's checks 64-67 now do): DirectBackend.destroy is a no-op,
      // PtyManager.kill still kills each local handle directly (which for the
      // earlier panels is a tmux CLIENT) independent of which backend is
      // currently bound, and the SESSIONS those clients leave behind on
      // PANELS_SOCKET are ended unconditionally by the tmuxBackend.shutdown()
      // in the finally below, which holds its own reference rather than
      // reading this variable.
      state.backend = createDirectBackend('verify: direct (m6c fixture)')

      // Release focus BEFORE panning. shouldYieldWheel gives a wheel over the
      // FOCUSED panel to that terminal, so a pan attempted while some earlier
      // check's panel still holds focus scrolls a terminal and moves no
      // camera — the panel would then never leave the cull region and check 56
      // would fail for a reason that has nothing to do with agent state.
      await clickBackground()
      // Into empty world space, for the same reason check 51 does it: the
      // spawn cascade is decided against the live panel array, so an empty
      // neighbourhood makes this panel land where it asked and keeps it clear
      // of check 51's two, whose rects would otherwise sit under the clicks
      // below.
      await panBy(2000, 2000)

      const idsBefore = new Set(await panelIds())
      // The same event a menu pick sends. Spawning through PRESET_SPAWN rather
      // than Cmd+N is what lets this block choose the command: Cmd+N would use
      // whatever default the run last pushed.
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const idsAfter = await waitUntil(async () => {
        const now = await panelIds()
        return now.length > idsBefore.size ? now : false
      }, 4000)
      const shellId = idsAfter ? idsAfter.find((id) => !idsBefore.has(id)) : null
      if (!shellId) throw new Error('54-57: PRESET_SPAWN produced no new panel')
      // Lazy spawn: the PTY exists only once the panel has gone live and been
      // laid out, so nothing may be written until pty:list admits it.
      const spawned = await waitUntil(async () => (await sessionMap(wc)).has(shellId), 8000)
      if (!spawned) throw new Error(`54-57: panel ${shellId} never got a PTY`)

      // A record of what main actually SENT, taken off the real bridge. Check
      // 57 is the one that needs it (see there); installing it here means it
      // is already listening before the first stimulus, so nothing has to be
      // inferred from a state read after the fact.
      await wc.executeJavaScript(`(() => {
        if (!window.__m6cAgentLog) {
          window.__m6cAgentLog = []
          window.canvas.agent.onState((u) => window.__m6cAgentLog.push(u))
        }
        return true
      })()`)
      const agentLog = () => wc.executeJavaScript(`window.__m6cAgentLog || []`)

      // 54. A real bell, through a real PTY, reaches the panel's DOM.
      //     The attribute is read rather than the class list on purpose: the
      //     class is a styling decision and a restyle may rename it, while
      //     data-agent-state is the panel's stated answer to "what is this
      //     agent doing". The silent failure this catches is the whole chain
      //     being inert — the detector deriving a state that no send, no
      //     store fan-out, or no render ever turns into anything a user could
      //     see, with every unit tier still green.
      {
        ptyManager.write(shellId, BELL_LINE)
        const rang = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'wants-you', 6000)
        ok('54 a real bell reaches the panel in a real renderer',
          rang === true, `${shellId} -> ${await agentStateOf(shellId)}`)
      }

      // 55. THE TRAP, in a real renderer. `ESC ] 0 ; <title> BEL` sets the
      //     window title and ends in a BEL that is a STRING TERMINATOR, not a
      //     bell; Claude Code emits exactly that, so a scanner that counts it
      //     flashes the border on every title change for a reason no user
      //     could diagnose. This is the third and last tier the trap is
      //     checked at — the pure function, the manager's wiring, and now the
      //     pixels — and a regression at any one of them is silent at the
      //     other two.
      //
      //     The wait is on a POSITIVE transition, never a bare sleep: the
      //     panel is first brought to 'idle', and the title's arrival is then
      //     observed as idle -> busy. Without that, "no wants-you appeared"
      //     would be satisfied just as well by bytes that never reached main
      //     at all, which is a check that proves nothing while looking
      //     stronger than the one above it.
      {
        // Acknowledge first, so this starts from a state that is not already
        // the one being asserted against.
        const click = await clickPanelBody(`[data-panel-id="${shellId}"] .panel__slot`)
        const idled = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'idle', 6000)
        const mark = (await agentLog()).length
        ptyManager.write(shellId, TITLE_LINE)
        const busied = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'busy', 6000)
        // The title has landed by now (the transition above is what says so);
        // this bounded settle is for a LATE wants-you — a scanner that only
        // mis-handles the OSC body once it straddles a flush boundary.
        await sleep(800)
        const since = (await agentLog()).slice(mark)
        const rangAnyway = since.some((u) => u.panelId === shellId && u.state === 'wants-you')
        const finalState = await agentStateOf(shellId)
        ok('55 a window title moves nothing in a real renderer',
          idled === true && busied === true && !rangAnyway && finalState !== 'wants-you',
          `active=${click.active} idled=${idled} busied=${busied} ` +
            `updates=${JSON.stringify(since)} final=${finalState}`)
      }

      // 56. THE CARD — the tier this feature exists for. LIVE_BUDGET caps
      //     live panels at eight, so on the twelve-panel canvas M6c is aimed
      //     at, most of what wants you is a card. A check written only
      //     against a live panel would pass an implementation that renders
      //     nothing on cards at all, and the feature would be missing exactly
      //     where it is needed and present exactly where it is not.
      //
      //     Both surfaces are asserted: the panel root still states the
      //     panel's answer, and the card itself carries it. Reading only the
      //     root would pass a PanelCard that ignores its agentState prop.
      {
        ptyManager.write(shellId, BELL_LINE)
        const rang = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'wants-you', 6000)
        // assignTiers pins the FOCUSED panel live unconditionally, so a panel
        // still holding focus cannot be demoted by any amount of panning. The
        // background click releases it and — unlike a click on the panel —
        // acknowledges nothing, so wants-you survives the release.
        await clickBackground()
        await panBy(3000, 0)
        const carded = await waitUntil(async () => (await cardClassOf(shellId)) !== null, 6000)
        const cardClass = await cardClassOf(shellId)
        const rootState = await agentStateOf(shellId)
        ok('56 the wants-you state reaches a demoted panel\'s card, not just a live panel',
          rang === true && carded === true &&
            String(cardClass).includes('panel__card--agent-wants-you') &&
            rootState === 'wants-you',
          `card=${JSON.stringify(cardClass)} root=${rootState} live=${await isLive(shellId)}`)
      }

      // 57. Focus acknowledges — and MAIN is what answers. The renderer never
      //     writes the cleared state itself: it asks over agent:acknowledge,
      //     main runs the machine, and the answer comes back on agent:state.
      //
      //     A check that only re-read the DOM after the click would pass
      //     against a renderer that cleared its own store and left main still
      //     believing this panel wants you — precisely the disagreement the
      //     acknowledge channel exists to prevent, and precisely what M6d
      //     would then fire a notification into. So the assertion is on the
      //     MESSAGE: a recorded agent:state update for this panel, sent after
      //     the click, naming a state that is not wants-you. Only main sends
      //     on that channel, so a locally-cleared renderer produces no such
      //     entry however convincing its DOM looks.
      //
      //     What this does NOT prove: that the renderer *only* takes main's
      //     answer. An implementation that cleared locally AND asked main
      //     would satisfy both halves. Distinguishing those two would need
      //     main to be made to not answer, which is a fault injection this
      //     harness has no seam for — the honest limit, recorded rather than
      //     papered over.
      {
        await panBy(-3000, 0)
        const back = await waitUntil(() => isLive(shellId), 6000)
        const before = await agentStateOf(shellId)
        const mark = (await agentLog()).length
        const click = await clickPanelBody(`[data-panel-id="${shellId}"] .panel__slot`)
        const answered = await waitUntil(async () => {
          const since = (await agentLog()).slice(mark)
          return since.some((u) => u.panelId === shellId && u.state !== 'wants-you')
        }, 6000)
        const cleared = await waitUntil(
          async () => (await agentStateOf(shellId)) !== 'wants-you', 3000)
        ok('57 focus acknowledges, and main is the one that answers',
          back === true && before === 'wants-you' && answered === true && cleared === true,
          `before=${before} active=${click.active} answered=${answered} ` +
            `after=${await agentStateOf(shellId)}`)
      }

      // Where a pip for `id` is actually painted, in canvas-local pixels,
      // read out of the DOM rather than off a data- attribute: an attribute
      // would let a pip rendered in the wrong place — or inside .world, where
      // it pans away with the panel — report the right number.
      const pipAt = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('.edge-indicator[data-panel-id=${JSON.stringify(id)}]')
        if (!el) return null
        const host = document.querySelector('.canvas').getBoundingClientRect()
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2 - host.left, y: r.top + r.height / 2 - host.top }
      })()`)

      // 58. A wants-you panel that is OFF SCREEN gets a pip, at the position
      //     viewport.ts's own arithmetic says. Recomputed here rather than
      //     imported, the way check 39 recomputes centreOn: this suite loads
      //     the built renderer and has no module to import from.
      //
      //     Asserting WHERE and not merely THAT is the whole value of this
      //     check. "A pip exists" is satisfied by a pip pinned to a corner for
      //     every direction, which is exactly what an independent per-axis
      //     clamp produces (verify:viewport 62 pins the same property in the
      //     pure tier) — and a canvas where every arrow points the same way
      //     tells the user nothing while looking entirely functional.
      {
        // Ring the bell first, while the panel is still on screen and its PTY
        // is known live, THEN pan away. The other order races: a panel panned
        // out of the cull region can be demoted before the write lands.
        ptyManager.write(shellId, BELL_LINE)
        const rang = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'wants-you', 6000)
        if (rang !== true) throw new Error('58: the panel never reached wants-you')

        await clickBackground()
        await panBy(-1800, -1200)
        await sleep(400)

        const expected = await wc.executeJavaScript(`(() => {
          const rect = window.__m5aSpecOf(${JSON.stringify(shellId)}).rect
          const host = document.querySelector('.canvas').getBoundingClientRect()
          const vp = window.__m4aViewport()
          const size = { width: host.width, height: host.height }
          const M = 24
          const tl = { x: rect.x * vp.scale + vp.x, y: rect.y * vp.scale + vp.y }
          const br = { x: (rect.x + rect.w) * vp.scale + vp.x, y: (rect.y + rect.h) * vp.scale + vp.y }
          if (br.x > 0 && tl.x < size.width && br.y > 0 && tl.y < size.height) return null
          const cx = size.width / 2, cy = size.height / 2
          const dx = (tl.x + br.x) / 2 - cx, dy = (tl.y + br.y) / 2 - cy
          const t = Math.min(
            dx === 0 ? Infinity : Math.max(0, cx - M) / Math.abs(dx),
            dy === 0 ? Infinity : Math.max(0, cy - M) / Math.abs(dy))
          return { x: cx + dx * t, y: cy + dy * t }
        })()`)
        if (expected === null) throw new Error('58: the panel is still on screen after the pan')
        const at = await pipAt(shellId)
        // Sub-pixel: getBoundingClientRect returns fractional boxes. A pip in
        // the wrong place is off by hundreds of pixels, so nothing this
        // tolerance admits is a defect this check could otherwise catch.
        const placed = at !== null &&
          Math.abs(at.x - expected.x) < 2 && Math.abs(at.y - expected.y) < 2
        ok('58 an off-screen wants-you panel gets a pip where edgeIndicator says',
          placed, `${JSON.stringify(at)} expected=${JSON.stringify(expected)}`)
      }

      // 59. Panning the panel back into view removes its pip, WITHOUT the
      //     state changing. The panel still wants you — nothing acknowledged
      //     it — so this is the visibility half of the rule on its own, and
      //     the pip layer must be recomputing against the live camera rather
      //     than latching a set of arrows when the bell rang.
      {
        await panBy(1800, 1200)
        const gone = await waitUntil(async () => (await pipAt(shellId)) === null, 3000)
        ok('59 a pip disappears when its panel comes back into view, state unchanged',
          gone === true && (await agentStateOf(shellId)) === 'wants-you',
          `pip=${JSON.stringify(await pipAt(shellId))} state=${await agentStateOf(shellId)}`)
      }

      // 60. THE SETTING DOES SOMETHING, driven the way a user drives it.
      //     Toggled through the real palette — found by a KEYWORD it does not
      //     display, then run — because that is the production path: main's
      //     settings:list maps over SETTINGS, so the row is generated and the
      //     thing that can actually be wrong is the RENDERER never reading the
      //     value. A setting that lists, toggles, persists and changes nothing
      //     on screen is the quietest failure this surface has, and it is
      //     invisible to verify:palette, whose settings checks build rows from
      //     hand-written fixtures and never import SETTINGS at all.
      //
      //     This block is also the only place the new def's keywords are
      //     exercised: check 52 proves that property for a different setting,
      //     and a keyword list that never matched anything would leave the
      //     switch reachable only by someone who already knew its label.
      {
        await clickBackground()
        await panBy(-1800, -1200)
        await sleep(300)
        const shown = await waitUntil(async () => (await pipAt(shellId)) !== null, 3000)

        // openPalette/closePalette from the 48-53 block above are out of
        // scope here (that block's `{ ... }` already closed), so this is a
        // local pair rather than a second drift-prone spelling reaching
        // across a closed scope — the bodies are copied verbatim from there.
        const openPalette = async () => {
          await wc.executeJavaScript(`
            if (document.querySelector('.palette') === null) {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
            }
          `)
          return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        }
        const closePalette = async () => {
          await wc.executeJavaScript(`(() => {
            const input = document.querySelector('.palette__input')
            if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          })()`)
          await sleep(80)
          await wc.executeJavaScript(`(() => {
            const input = document.querySelector('.palette__input')
            if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          })()`)
          return sleep(80)
        }
        // closePalette is defined for symmetry with openPalette but never
        // called here: runRow closes the palette BEFORE running a command
        // (see the comment on toggleEdgeIndicators' waitUntil below), so
        // toggling the setting already leaves nothing open to close.

        const toggleEdgeIndicators = async () => {
          await openPalette()
          const picked = await wc.executeJavaScript(`(async () => {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value').set
            const input = document.querySelector('.palette__input')
            setter.call(input, 'off-screen')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            await new Promise((r) => setTimeout(r, 100))
            const row = [...document.querySelectorAll('.palette__row')]
              .find((r) => r.textContent.includes('off-screen panels'))
            if (!row) return 'not found'
            row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
            return 'ok'
          })()`)
          if (picked !== 'ok') throw new Error(`60: the setting row was ${picked}`)
          // Running a row closes the palette (runRow closes BEFORE running),
          // but assert it rather than assuming — a left-open overlay would
          // swallow the next check's keys.
          await waitUntil(() => wc.executeJavaScript(
            `document.querySelector('.palette') === null`), 2000)
        }

        await toggleEdgeIndicators()
        const hidden = await waitUntil(async () => (await pipAt(shellId)) === null, 4000)
        const storedOff = await wc.executeJavaScript(
          `window.canvas.settings.list().then((s) =>
             s.find((x) => x.id === 'agent.edgeIndicators').value)`)
        await toggleEdgeIndicators()
        const back = await waitUntil(async () => (await pipAt(shellId)) !== null, 4000)

        ok('60 the edge-indicator setting is findable by keyword and actually hides the pips',
          shown === true && hidden === true && storedOff === false && back === true,
          `shown=${shown} hidden=${hidden} stored=${storedOff} back=${back}`)
        await panBy(1800, 1200)
        await sleep(300)
      }

      const jump = (shift) => wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown',
          { key: 'j', metaKey: true, shiftKey: ${shift ? 'true' : 'false'}, bubbles: true }))
        true
      `)

      // 61. Cmd+J frames the waiting panel — and frames THAT panel, asserted
      //     as WHERE the camera landed, recomputed from centreOn's own
      //     arithmetic exactly as check 39 does. "The viewport moved" is true
      //     of any pan at all, and a jump key that framed the wrong panel
      //     would satisfy it.
      //
      //     It must also NOT spawn: the jump routes through selectAndRaise,
      //     the half of onSelectPanel factored out precisely so navigation
      //     cannot wake a panel. A wants-you panel has a live PTY and so is
      //     never dormant, but reusing the safe verb is what keeps a future
      //     widening of wants-you from turning a keyboard tour into spawns.
      {
        await clickBackground()
        await panBy(-1800, -1200)
        await sleep(300)
        const spawnedBefore = await wc.executeJavaScript(
          `(window.__m4aSessions().find((s) => s.id === ${JSON.stringify(shellId)}) || {}).spawned`)
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        await jump(false)
        await sleep(400)
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        const expected = await wc.executeJavaScript(`(() => {
          const rect = window.__m5aSpecOf(${JSON.stringify(shellId)}).rect
          const host = document.querySelector('.canvas').getBoundingClientRect()
          const vp = window.__m4aViewport()
          return {
            x: host.width / 2 - (rect.x + rect.w / 2) * vp.scale,
            y: host.height / 2 - (rect.y + rect.h / 2) * vp.scale
          }
        })()`)
        const spawnedAfter = await wc.executeJavaScript(
          `(window.__m4aSessions().find((s) => s.id === ${JSON.stringify(shellId)}) || {}).spawned`)
        const framed = Math.abs(after.x - expected.x) < 1 && Math.abs(after.y - expected.y) < 1
        ok('61 Cmd+J frames the waiting panel, at the same scale, spawning nothing new',
          framed && after.scale === before.scale && spawnedAfter === spawnedBefore,
          `${JSON.stringify(before)} -> ${JSON.stringify(after)} expected=${JSON.stringify(expected)}`)
      }

      // 62. Landing on the panel does NOT acknowledge it, and the amber
      //     survives the selection ring. Two facts, and both are the decision
      //     this milestone made explicitly: the jump does not focus, so main
      //     never hears an acknowledge, so the state stays wants-you; and the
      //     CSS was inverted so .panel--selected no longer paints over it.
      //
      //     The COLOUR is what this reads, not the state — check 61 already
      //     covers the state — because the silent failure here is purely
      //     visual: the user lands on the panel the key promised and sees
      //     nothing telling them why they are there, while the panel is still
      //     in the queue and the next press may jump straight back to it.
      {
        const selected = await wc.executeJavaScript(
          `!!document.querySelector('[data-panel-id=${JSON.stringify(shellId)}].panel--selected')`)
        const state = await agentStateOf(shellId)
        const colour = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-panel-id=${JSON.stringify(shellId)}]')
          if (!el) return null
          const amber = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()
          const probe = document.createElement('div')
          probe.style.color = amber
          document.body.appendChild(probe)
          const want = getComputedStyle(probe).color
          probe.remove()
          /* M69: the state hue is the LEFT EDGE only; selection is iris on the other sides. */ return { border: getComputedStyle(el).borderLeftColor, want }
        })()`)
        ok('62 the jump does not acknowledge, and wants-you outranks the selection ring',
          selected === true && state === 'wants-you' &&
          colour !== null && colour.border === colour.want,
          `selected=${selected} state=${state} ${JSON.stringify(colour)}`)
      }

      // 63. Focus is still what acknowledges — the rule this milestone left
      //     alone — and the pip goes with it. Clicking the panel (now on
      //     screen, because check 61 framed it) sends agent:acknowledge, main
      //     clears the state, the store drops it from the queue, and the pip
      //     layer has nothing left to draw even after panning away again.
      {
        const point = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-panel-id=${JSON.stringify(shellId)}] .panel__slot')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        })()`)
        if (!point) throw new Error('63: the framed panel has no slot to click')
        wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        const cleared = await waitUntil(
          async () => (await agentStateOf(shellId)) !== 'wants-you', 4000)
        await panBy(-1800, -1200)
        await sleep(400)
        ok('63 focus acknowledges, and the pip leaves with the state',
          cleared === true && (await pipAt(shellId)) === null,
          `state=${await agentStateOf(shellId)} pip=${JSON.stringify(await pipAt(shellId))}`)
      }
    }


    // M147 — env.spawn.1 (the Act II critic's Critical). A preset's `env` —
    // and so the sheet's Env field, which main merges into the same template
    // — must REACH the process: `Canvas.onSpawn` builds the PanelSpec field
    // by field, and the first cut copied command, agent, agentOptions and
    // worktree and never `env`, so the form did nothing and no check noticed
    // (`preset.env.1–.2` stop at the parser). The variable is read back off
    // the terminal itself, never off the spec.
    {
      const panelsBefore = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: ['-c', 'echo "ENVMARK=$TC_ENV_PROBE"; sleep 300'], env: { TC_ENV_PROBE: 'pass-4471' }, w: 400, h: 300 })
      const envId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !panelsBefore.includes(id)) ?? false
      }, 8000)
      // __m4aCellToScreen reads the FOCUSED panel's buffer: click into the new
      // one first (the neighbouring checks' shape) — the first cut read the
      // previous panel and reported the variable missing from a process that
      // had it.
      if (typeof envId === 'string') {
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id=${JSON.stringify(envId)}] .xterm') !== null`), 8000)
        await clickPanelBody(`.panel[data-panel-id=${JSON.stringify(envId)}] .panel__slot`)
        await waitUntil(async () => (await wc.executeJavaScript(`window.__m4aFocusedId()`)) === envId, 5000)
      }
      const echoed = typeof envId === 'string' ? await waitUntil(() => wc.executeJavaScript(`window.__m4aCellToScreen('ENVMARK=pass-4471') !== null`), 8000) : false
      const live = typeof envId === 'string' ? ptyManager.list().find((s) => s.panelId === envId) : undefined
      ok('env.spawn.1 a preset\'s env reaches the spawned process — the variable echoes back from the terminal itself',
        typeof envId === 'string' && echoed !== false && live !== undefined,
        JSON.stringify({ envId, echoed, live: live !== undefined }))
      if (typeof envId === 'string') await clickPanelClose(wc, envId)
    }

    // M146 — fit.1. ZOOM TO FIT, named apart from reset and from maximise
    // (backlog #23): with two panels selected by a real shift-click, the
    // palette row `Zoom to fit` flies the camera to frame BOTH — every
    // selected rect lands inside the viewport — while `Reset zoom` returns to
    // the INITIAL camera; nothing spawns and no panel's rect changes (a camera
    // move only). Read through the viewport hook and the DOM, never a word.
    {
      wc.focus()
      // Two FRESH panels, spawned with Cmd+N at the view centre (the second
      // cascades one step), so both are on screen and topmost at their own
      // chrome — a panel the earlier checks left elsewhere may be off screen
      // or under a later one, and a click there selects something else.
      const spawnFit = async () => {
        const before = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
        return waitUntil(async () => {
          const now = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.find((id) => !before.includes(id)) ?? false
        }, 8000)
      }
      const fitA = await spawnFit()
      await sleep(300)
      const fitB = await spawnFit()
      await sleep(300)
      const ids = [fitA, fitB].filter((x) => typeof x === 'string')
      const chromeBox = async (id) => wc.executeJavaScript(`(() => { const c = document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(id))} + '] .panel__chrome'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) } })()`)
      const click = async (box, modifiers) => {
        wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1, modifiers })
        wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1, modifiers })
        await sleep(120)
      }
      const rectsBefore = await wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-id]')].map((p) => p.getAttribute('data-panel-id') + ':' + p.style.transform)`)
      const sessionsBefore = (await sessionMap(wc)).size
      const a = ids.length === 2 ? await chromeBox(ids[0]) : null
      const b = ids.length === 2 ? await chromeBox(ids[1]) : null
      if (a) await click(a, [])
      // The additive select reads `event.shiftKey` on the frame's mousedown
      // (PanelFrame's beginMove): a dispatched event carries the flag where a
      // real one through sendInputEvent did not add to the selection.
      // The id is quoted ONCE into the selector: a JSON string inside a
      // single-quoted JS string unescapes its own quotes, and the first cut
      // (`data-panel-id=""n19""`) was an invalid selector — querySelector
      // THROWS on it, which aborted the whole part as `infrastructure`.
      if (b) await wc.executeJavaScript(`(() => { const c = document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(ids[1]))} + '] .panel__chrome'); if (!c) return false
        const r = c.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, button: 0, clientX: r.left + 20, clientY: r.top + r.height / 2, shiftKey: true }
        c.dispatchEvent(new MouseEvent('mousedown', o)); window.dispatchEvent(new MouseEvent('mouseup', o)); return true })()`)
      await sleep(150)
      const selected = await wc.executeJavaScript(`[...document.querySelectorAll('.panel--selected')].map((p) => p.getAttribute('data-panel-id'))`)
      // The row is run the way a person runs it: Cmd+K, the title typed, the row pressed (check 52's shape).
      const runRow = async (title) => {
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
        const found = await wc.executeJavaScript(`(async () => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          const input = document.querySelector('.palette__input')
          setter.call(input, ${JSON.stringify(title)})
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const row = [...document.querySelectorAll('.palette__row')].find((r) => r.textContent.includes(${JSON.stringify(title)}))
          if (!row) return 'not found'
          row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return 'ok'
        })()`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
        return found
      }
      const ranFit = await runRow('Zoom to fit')
      const framed = await waitUntil(async () => {
        const vp = await wc.executeJavaScript(`window.__m4aViewport()`)
        const inside = await wc.executeJavaScript(`(() => { const host = document.querySelector('.canvas').getBoundingClientRect(); return ${JSON.stringify(ids)}.every((id) => { const p = document.querySelector('.panel[data-panel-id="' + id + '"]'); if (!p) return false; const r = p.getBoundingClientRect(); return r.left >= host.left && r.top >= host.top && r.right <= host.right && r.bottom <= host.bottom }) })()`)
        return inside ? vp : false
      }, 4000)
      const ranReset = await runRow('Reset zoom')
      const reset = await waitUntil(async () => { const vp = await wc.executeJavaScript(`window.__m4aViewport()`); return vp.scale === 1 && vp.x === DEFAULT_CAMERA.x && vp.y === DEFAULT_CAMERA.y ? vp : false }, 4000)
      const rectsAfter = await wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-id]')].map((p) => p.getAttribute('data-panel-id') + ':' + p.style.transform)`)
      const sessionsAfter = (await sessionMap(wc)).size
      ok('fit.1 Zoom to fit frames the two shift-selected panels inside the viewport as a flight and Reset zoom returns to the initial camera, with no panel rect changed and nothing spawned',
        ids.length === 2 && selected.length === 2 && ranFit === 'ok' && framed !== false && ranReset === 'ok' && reset !== false &&
          rectsAfter.join('|') === rectsBefore.join('|') && sessionsAfter === sessionsBefore,
        JSON.stringify({ ids, selected, ranFit, framed, ranReset, reset, sessionsBefore, sessionsAfter }))
      for (const id of ids) await clickPanelClose(wc, id)
    }

    // M144 — frame.3. ZOOM-INDEPENDENT CHROME, measured from both sides: at
    // scale 0.5 a live panel's chrome bar keeps its screen height (the
    // counter-scale) while its `.panel__slot` — the body xterm lives in —
    // is exactly half, and the body's computed transform is `none`. The
    // boundary is the whole feature: a counter-scaled body would move every
    // click onto the wrong cell (pointer-correct.ts), and a reflowed one
    // would SIGWINCH a running agent on every zoom.
    {
      const measure = () => wc.executeJavaScript(`(() => {
        const live = [...document.querySelectorAll('.panel[data-panel-id]')].find((p) => p.querySelector('.xterm'))
        if (!live) return null
        const chrome = live.querySelector('.panel__chrome').getBoundingClientRect()
        const slot = live.querySelector('.panel__slot').getBoundingClientRect()
        const body = live.querySelector('.pf__body')
        return { id: live.getAttribute('data-panel-id'), chromeH: chrome.height, slotH: slot.height, bodyTransform: body ? getComputedStyle(body).transform : null, scaleVar: getComputedStyle(document.querySelector('.world')).getPropertyValue('--chrome-scale').trim() }
      })()`)
      // The camera: Cmd+0 for scale 1, then Cmd+- (the harness's zoomTo takes a
      // KEY) until the scale is at or under 0.6 — the ratios below are read
      // against the ACTUAL scale, never an assumed 0.5.
      await zoomTo(wc, '0')
      await settle()
      const atOne = await measure()
      const scaleOne = (await wc.executeJavaScript(`window.__m4aViewport()`)).scale
      let scaleOut = scaleOne
      for (let i = 0; i < 12 && scaleOut > 0.6; i++) { await zoomTo(wc, '-'); await sleep(80); scaleOut = (await wc.executeJavaScript(`window.__m4aViewport()`)).scale }
      await settle()
      const atOut = await measure()
      await zoomTo(wc, '0')
      await settle()
      const chromeRatio = atOne && atOut ? atOut.chromeH / atOne.chromeH : 0
      const slotRatio = atOne && atOut ? atOut.slotH / atOne.slotH : 0
      const expectedSlot = scaleOut / scaleOne
      ok('frame.3 zoomed out, the chrome bar keeps its screen height (counter-scaled by 1/scale) while the body slot shrinks with the scale and the body carries no transform',
        atOne !== null && atOut !== null && atOne.id === atOut.id && scaleOne === 1 && scaleOut <= 0.6 &&
          chromeRatio >= 0.9 && chromeRatio <= 1.1 &&
          Math.abs(slotRatio - expectedSlot) <= 0.05 && atOut.bodyTransform === 'none' && atOne.scaleVar === '1' && Number(atOut.scaleVar) > 1.5,
        JSON.stringify({ atOne, atOut, scaleOne, scaleOut, chromeRatio, slotRatio, expectedSlot }))
    }

    // M141 — prompt.builtin.1. A SAVED prompt's {{cwd}} and {{panel}} are
    // filled from the target's LIVE cwd (the same read PRESET_CAPTURE makes,
    // never spec.cwd) and its title before the paste, with no question asked
    // for either; the paste is bracketed (check 40's rule). Read off the
    // terminal's own screen: the default panel is `/bin/cat -v`, which echoes
    // what it receives.
    {
      await wc.executeJavaScript(`window.canvas.prompt.save('where am i', 'PBI-cwd={{cwd}} PBI-panel={{panel}}')`)
      // The palette's prompt rows are read at boot and on its own saves; a
      // prompt saved through the bridge needs the reload (check 40's rows are
      // seeded in the layout for the same reason).
      flushLayoutStore()
      const rePB = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await rePB
      await settle()
      const panelsBefore = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
      const pbId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !panelsBefore.includes(id)) ?? false
      }, 8000)
      if (typeof pbId === 'string') {
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id=${JSON.stringify(pbId)}] .xterm') !== null`), 8000)
        await clickPanelBody(`.panel[data-panel-id=${JSON.stringify(pbId)}] .panel__slot`)
        await waitUntil(async () => (await wc.executeJavaScript(`window.__m4aFocusedId()`)) === pbId, 5000)
        await sleep(400)
      }
      const liveCwd = typeof pbId === 'string' ? (ptyManager.list().find((s) => s.panelId === pbId) || { cwd: null }).cwd : null
      const title = typeof pbId === 'string' ? await wc.executeJavaScript(`(document.querySelector('.panel[data-panel-id=${JSON.stringify(pbId)}] .pf__title') || {}).textContent ?? null`) : null
      await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const inserted = await wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'insert prompt where am i')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 150))
        const selected = document.querySelector('.palette__row--selected')
        if (!selected || !selected.textContent.includes('where am i')) return selected ? selected.textContent : 'no row'
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        return true
      })()`)
      // No question may open: the input mode would keep the palette open with a `cwd (1 of 2)` label.
      await sleep(400)
      const asked = await wc.executeJavaScript(`(document.querySelector('.palette__mode-label, .palette__label') || {}).textContent ?? (document.querySelector('.palette') ? 'palette open' : null)`)
      const cwdTail = typeof liveCwd === 'string' ? liveCwd.split('/').filter(Boolean).slice(-1)[0] : null
      const echoedCwd = cwdTail ? await waitUntil(() => wc.executeJavaScript(`window.__m4aCellToScreen('PBI-cwd=') !== null && window.__m4aCellToScreen(${JSON.stringify(cwdTail)}) !== null`), 5000) : false
      const echoedPanel = typeof title === 'string' && title !== '' ? await waitUntil(() => wc.executeJavaScript(`window.__m4aCellToScreen('PBI-panel=' + ${JSON.stringify(title.split(' ')[0])}) !== null`), 3000) : false
      const literal = await wc.executeJavaScript(`window.__m4aCellToScreen('{{cwd}}') !== null || window.__m4aCellToScreen('{{panel}}') !== null`)
      ok('prompt.builtin.1 a saved prompt\'s {{cwd}} and {{panel}} paste the target\'s live cwd and title into the terminal with no question asked, and the literal holes never reach the agent',
        typeof pbId === 'string' && inserted === true && (asked === null || asked === 'palette open' && false || !/1 of/.test(String(asked))) &&
          echoedCwd !== false && echoedPanel !== false && literal === false,
        JSON.stringify({ pbId, liveCwd, title, inserted, asked, cwdTail, echoedCwd, echoedPanel, literal }))
      if (typeof pbId === 'string') await clickPanelClose(wc, pbId)
    }

    // M145 — paste.image.1 (backlog #13's bytes case). With an IMAGE on the
    // clipboard and no text, a menu paste into a spawned terminal hands the
    // agent a PATH: main writes the image under attachments/ and the renderer
    // pastes the shell-quoted path (bracketed, check 40's rule); a text paste
    // is unchanged. The terminal is `/bin/cat -v`, which echoes what it gets.
    {
      const { clipboard, nativeImage } = require('electron')
      const panelsBefore = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      // The ECHO preset's shape, not Cmd+N's default: xterm brackets a paste
      // only for an application that ENABLED mode 2004, and a bare `cat -v`
      // never does — the first cut read `bracketed: false` from a terminal
      // that could not have shown the brackets whatever the renderer did.
      wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: ECHO_PRESET.command, args: ECHO_PRESET.args, w: 400, h: 300 })
      const piId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !panelsBefore.includes(id)) ?? false
      }, 8000)
      if (typeof piId === 'string') {
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id=${JSON.stringify(piId)}] .xterm') !== null`), 8000)
        await clickPanelBody(`.panel[data-panel-id=${JSON.stringify(piId)}] .panel__slot`)
        await waitUntil(async () => (await wc.executeJavaScript(`window.__m4aFocusedId()`)) === piId, 5000)
        await sleep(300)
      }
      // A 2x2 red PNG on the clipboard, and NO text (a text paste wins when both are there).
      const png = nativeImage.createFromBitmap(Buffer.from([0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255]), { width: 2, height: 2 })
      clipboard.clear()
      clipboard.writeImage(png)
      const textOnClipboard = clipboard.readText()
      const imagesBefore = new Set(readdirSync(harnessAttachmentsDir))
      wc.send(IPC_EVENTS.EDIT_PASTE, textOnClipboard)
      // M180. A visible-row search can split "attachments" at the terminal's
      // right edge (78 columns with a repo-local TMPDIR). Read the real PTY
      // echo, as broadcast.1 does: the EXACT newly written path must arrive,
      // shell-quoted and inside BOTH bracket markers, regardless of wrapping.
      let written = []
      let writtenPath = null
      const echoedPath = await waitUntil(async () => {
        written = readdirSync(harnessAttachmentsDir).filter((f) => f.endsWith('.png') && !imagesBefore.has(f))
        if (typeof piId !== 'string' || written.length !== 1) return false
        writtenPath = join(harnessAttachmentsDir, written[0])
        const quotedPath = "'" + writtenPath.replace(/'/g, "'\\''") + "'"
        return (await scrollbackLog.readAll(piId)).includes(`^[[200~${quotedPath}^[[201~`)
      }, 6000)
      const bracketed = await wc.executeJavaScript(`window.__m4aCellToScreen('200~') !== null`)
      clipboard.clear()
      clipboard.writeText('PLAIN-TEXT-PASTE-4471')
      wc.send(IPC_EVENTS.EDIT_PASTE, clipboard.readText())
      const echoedText = await waitUntil(async () => typeof piId === 'string' &&
        (await scrollbackLog.readAll(piId)).includes('^[[200~PLAIN-TEXT-PASTE-4471^[[201~'), 4000)
      ok('paste.image.1 a clipboard image pasted into a spawned terminal lands as a bracketed shell-quoted path to a .png main wrote under attachments/, and a text paste is unchanged',
        typeof piId === 'string' && textOnClipboard === '' && echoedPath !== false && bracketed === true && written.length === 1 && echoedText !== false,
        JSON.stringify({ piId, textOnClipboard, echoedPath, bracketed, written: written.length, writtenPath, echoedText, clipboardHadImage: !clipboard.readImage().isEmpty(), pngEmpty: png.isEmpty() }))
      if (typeof piId === 'string') await clickPanelClose(wc, piId)
    }

    // M163 — rest.1 (the rest rule, on a real frame). A LIVE, unselected panel
    //     with the pointer elsewhere: its ⋯ has computed opacity 0. A REAL
    //     pointer move over its chrome (sendInputEvent — a dispatched mouseover
    //     never matches :hover) reveals it at 1. Then, with the pointer away
    //     again, a script's .click() on the hidden ⋯ opens the menu — hidden at
    //     rest is never unreachable. Read AFTER the --dur-1 transition (settle),
    //     the reveal.1 lesson: a computed opacity mid-transition is still 0.
    {
      await clickEmptyCanvas(wc)
      await settle()
      const away = await backgroundPoint(wc)
      wc.sendInputEvent({ type: 'mouseMove', x: Math.round(away.x), y: Math.round(away.y) })
      await settle()
      const target = await wc.executeJavaScript(`(() => {
        // Any kind's frame, live or carded: the rest rule is the FRAME's. A live one
        // first when there is one; the end of this part may have carded them all.
        const frames = [...document.querySelectorAll('.panel[data-panel-id]')].filter((p) => p.querySelector('[data-panel-more]') && !p.classList.contains('panel--selected') && !p.matches(':hover'))
        const p = frames.find((f) => f.querySelector('.xterm')) ?? frames[0]; if (!p) return null
        const c = p.querySelector('.pf__chrome').getBoundingClientRect()
        const more = p.querySelector('[data-panel-more]')
        return { id: p.getAttribute('data-panel-id'), x: c.left + Math.min(60, c.width / 4), y: c.top + c.height / 2, rest: more ? getComputedStyle(more).opacity : null } })()`)
      let hovered = null; let clicked = null
      if (target) {
        wc.sendInputEvent({ type: 'mouseMove', x: Math.round(target.x), y: Math.round(target.y) })
        await settle(); await sleep(250)
        hovered = await wc.executeJavaScript(`(() => { const m = document.querySelector('.panel[data-panel-id=${JSON.stringify(target.id)}] [data-panel-more]'); return m ? getComputedStyle(m).opacity : null })()`)
        wc.sendInputEvent({ type: 'mouseMove', x: Math.round(away.x), y: Math.round(away.y) })
        await settle(); await sleep(250)
        clicked = await wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id=${JSON.stringify(target.id)}]'); const m = p.querySelector('[data-panel-more]'); const before = getComputedStyle(m).opacity; m.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return { before } })()`)
        // The click's state update lands on React's next render (menu.1's lesson), never synchronously.
        clicked.menu = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id=${JSON.stringify(target.id)}] [data-panel-menu]') !== null`), 3000)
        await wc.executeJavaScript(`(() => { const c = document.querySelector('.panel[data-panel-id=${JSON.stringify(target.id)}] [data-panel-menu-close]'); if (c) c.click() })()`)
        await settle()
      }
      ok('rest.1 an unselected frame hides its ⋯ at rest (opacity 0), a real pointer over its chrome reveals it (1), and a script\'s click on the hidden ⋯ still opens the menu',
        target !== null && target.rest === '0' && hovered === '1' && clicked !== null && clicked.before === '0' && clicked.menu === true,
        JSON.stringify({ target, hovered, clicked }))
    }

    // M166 — far.1 (the status wall, on a real canvas). At a fifth of the
    //     size every card is at the SUMMARY tier: it shows its kind glyph and
    //     its title, and no last line of scrollback and no machine figure —
    //     a wall of lights with names, the same wash the minimap draws.
    {
      await zoomToScale(wc, 0.2)
      await settle(); await sleep(300)
      const read = await wc.executeJavaScript(`(() => {
        const cards = [...document.querySelectorAll('[data-card-summary]')]
        return { cards: cards.length,
          glyphs: cards.filter((c) => c.querySelector('.panel__card-summary-glyph')).length,
          titles: cards.filter((c) => (c.querySelector('.panel__card-summary-title')?.textContent ?? '') !== '').length,
          lines: document.querySelectorAll('.panel__card-summary-line').length,
          costs: document.querySelectorAll('[data-machine-cost]').length,
          washed: cards.filter((c) => { const s = c.querySelector('.panel__card-summary') || c; return getComputedStyle(s).backgroundColor !== 'rgba(0, 0, 0, 0)' }).length } })()`)
      await zoomTo(wc, '0')
      await settle()
      ok('far.1 at a fifth of the size every summary card shows a kind glyph and its title on a tone wash, with no last line and no machine figure',
        read.cards >= 3 && read.glyphs === read.cards && read.titles === read.cards && read.lines === 0 && read.costs === 0 && read.washed === read.cards,
        JSON.stringify(read))
    }

    // M228 — rim.paint.1 / well.paint.1. THE RIM PAIR, AS PIXELS.
    //
    // PAINT checks, because two other instruments cannot see this change and
    // each is blind for its own reason:
    //
    //   * verify:styles reads the stylesheet as TEXT. It proves the rule was
    //     written, never that anything painted — M149 found two surfaces open
    //     in the DOM and invisible for two whole versions, both because a
    //     transform or a blur introduced a stacking context. This run
    //     introduces both.
    //   * verify:visual cannot see a hairline AT ALL, and that is arithmetic,
    //     not luck. A 1px rim contributes ONE row to a halved golden: across a
    //     32px tile that is 32 of 1024 pixels, 3.1%, against a 35% tile
    //     budget, and far under the 0.5% frame budget. Measured on M228's own
    //     run: 60/60 passed with the rim pair on every panel in every scene. A
    //     green visual suite is SILENT about this milestone.
    //
    // BOTH CHECKS ARE DIFFERENTIAL, and that is the whole design. The first
    // two cuts were not, and a mutation test — delete the rim pair, rebuild,
    // re-run — showed both PASSING against a stylesheet with no rim in it.
    // They had been reading structure that was there all along: a lit band at
    // a frame's top edge is also the --frame-line border, and a dark band at a
    // slot's top edge is also the chrome's border-bottom above it. "A band
    // exists" is not evidence; "this edge differs from an edge that should NOT
    // have it" is.
    //
    // So each samples TWO points on the SAME surface and compares them:
    //   rim  — just inside the TOP border (has the rim) against just inside
    //          the RIGHT border at the same fill (has none). The right edge,
    //          not the left: .pf::before hangs a 14px tone glow off the LEFT
    //          edge and would pollute the reference.
    //   well — the slot's first rows (inside the inset) against rows well
    //          below its 4px blur (outside it), on the same --well fill.
    //
    // Every sample point is validated with elementFromPoint before it is
    // captured. A coordinate inside an element's RECT is not necessarily a
    // coordinate where that element PAINTS — an overlapping panel, a drawer
    // or a HUD can own the pixel — and a check that captures blind reports
    // the neighbour's colour with total confidence. That is M149's lesson
    // stated as a procedure rather than a warning.
    {
      // Wake a terminal the way a person does: by this point in the suite
      // every terminal is a card again, and a well needs a live one. A real
      // click with real coordinates, not a dispatched event.
      const woke = (await wc.executeJavaScript(`document.querySelector('.panel__slot') !== null`))
        ? 'already live'
        : await (async () => {
            if (!(await wc.executeJavaScript(`document.querySelector('.panel__card-idle') !== null`))) return 'no card to wake'
            await clickPanelBody('.panel__card-idle')
            await waitUntil(async () => await wc.executeJavaScript(`document.querySelector('.panel__slot') !== null`), 4000)
            await settle(); await sleep(300)
            return 'woken by click'
          })()

      // Ask the RENDERER for points it will actually paint, rather than
      // computing them here and hoping. Each candidate is accepted only if
      // elementFromPoint lands inside the element the sample is about.
      const pts = await wc.executeJavaScript(`(() => {
        const owns = (x, y, sel) => { const el = document.elementFromPoint(x, y); return !!(el && (el.matches(sel) || el.closest(sel))) }
        const out = { frame: null, well: null, woke: null }
        for (const p of [...document.querySelectorAll('.panel')]) {
          const r = p.getBoundingClientRect()
          if (r.width < 160 || r.height < 80) continue
          const cx = Math.round(r.left + r.width / 2)
          const id = p.getAttribute('data-panel-id')
          const sel = '.panel[data-panel-id="' + id + '"]'
          // the top inner edge (rim) and a reference on the right inner edge,
          // both a little way down so they share the chrome's own fill
          const topY = Math.round(r.top) + 1
          const refX = Math.round(r.right) - 2
          const refY = Math.round(r.top) + 14
          if (owns(cx, topY, sel) && owns(refX, refY, sel)) { out.frame = { id, cx, topY, refX, refY }; break }
        }
        for (const slot of [...document.querySelectorAll('.panel__slot')]) {
          const r = slot.getBoundingClientRect()
          if (r.height < 60 || r.width < 80) continue
          const cx = Math.round(r.left + r.width / 2)
          const topY = Math.round(r.top) + 1
          const deepY = Math.round(r.top) + 40
          // .xterm paints INSIDE the slot, so either owning the point is fine
          if (owns(cx, topY, '.panel__slot') && owns(cx, deepY, '.panel__slot')) {
            out.well = { id: (slot.closest('.panel') || {}).getAttribute ? slot.closest('.panel').getAttribute('data-panel-id') : null, cx, topY, deepY }
            break
          }
        }
        return out })()`)

      const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
      // One CSS pixel, captured off the compositor and averaged over the
      // device pixels it covers, so the reading does not depend on dpr.
      const at = async (x, y) => {
        const img = await win.webContents.capturePage({ x, y, width: 1, height: 1 })
        const b = img.getBitmap()
        const n = b.length / 4
        let r = 0, g = 0, bl = 0
        for (let i = 0; i < n; i++) { r += b[i * 4 + 2]; g += b[i * 4 + 1]; bl += b[i * 4] }
        return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)]
      }

      const f = pts.frame
      const fTop = f ? await at(f.cx, f.topY) : null
      const fRef = f ? await at(f.refX, f.refY) : null
      // The lit edge LIGHTENS in both themes: --edge-light is white at .95
      // (light) and .11 (dark). One assertion covers both.
      //
      // AN INVARIANT, NOT A DELTA, and the ledger says so. A mutation test
      // showed this reading 13 with the frame's own --rim-top deleted and 16
      // with it: the lit top edge predates M228, because .pf__chrome has worn
      // inset 0 1px 0 var(--edge-light) since M109 and the chrome sits at the
      // frame's top. What M228 changes is WHOSE property it is — .panel's
      // rather than whichever child happens to be at the top — which is what
      // keeps it when Act III lifts the chrome off the flow. This check is
      // the guard for that: it will still have to pass when the chrome is
      // absolute and can no longer be the thing supplying the light.
      const fLift = f ? lum(fTop) - lum(fRef) : 0
      ok('rim.paint.1 the frame\'s TOP inner edge paints lighter than its own right inner edge — the specular highlight, measured off the compositor against a reference edge that has none (an INVARIANT: Act III must not lose it when the chrome stops sitting at the top)',
        f !== null && fLift >= 3,
        JSON.stringify({ woke, frame: f, top: fTop, ref: fRef, lift: Number(fLift.toFixed(2)) }))

      // well.paint.1 IS RETIRED HERE BY M234, and this note is its headstone
      // rather than a silent deletion.
      //
      // It measured a terminal well sinking below its housing. M234 makes a
      // terminal CHROMELESS: the body starts at the frame's own top edge, so
      // there is no housing seam left to sink below, and a recess drawn
      // there would sit underneath the chrome's scrim where nobody can see
      // it. The frame's own lit rim (rim.paint.1, directly above) does the
      // whole job now, and `.pf--kind-terminal .panel__slot::after` turns the
      // recess off rather than leaving a rule that paints nothing.
      //
      // --rim-inner is NOT retired: it keeps `.launcher__well` and gains the
      // recessed surfaces of Act IV, and `verify:styles rim.1` still fails if
      // no surface wears it. What is gone is the claim that a TERMINAL has a
      // recessed well, which stopped being true in this milestone.
    }

    // M229 — aura.paint.1. THE GROUND ANSWERS, IN PIXELS.
    //
    // aura.1 proves the rules were written and that the effect stays inside
    // one element. It cannot know whether the ground actually changes colour,
    // and this is precisely the shape of change that fails silently: the
    // attribute lands, the rule matches, and a custom property that was never
    // registered transitions to nothing. So drive the state and read the
    // compositor.
    //
    // The sample point is near the canvas CENTRE, because the aura is a
    // radial gradient at 50% 48% and is transparent at the edges — a point
    // chosen by scanning from the top-left (the harness's own backgroundPoint
    // does that, for its own good reasons) would sit where this effect is
    // designed to be invisible and would read no change for the right reason
    // at the wrong place.
    {
      const spot = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas').getBoundingClientRect()
        const cx = Math.round(host.left + host.width / 2)
        const cy = Math.round(host.top + host.height / 2)
        // Spiral out from the centre for a pixel the AURA owns: not a panel,
        // not the HUD, not the minimap.
        for (let r = 0; r < Math.min(host.width, host.height) / 2 - 20; r += 12) {
          for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
            const x = cx + dx, y = cy + dy
            if (x < host.left + 8 || x > host.right - 8 || y < host.top + 8 || y > host.bottom - 8) continue
            const el = document.elementFromPoint(x, y)
            if (el && !el.closest('.panel') && !el.closest('.canvas-hud') && !el.closest('.minimap') && !el.closest('.palette')) return { x, y }
          }
        }
        return null })()`)
      const sample = async () => {
        const img = await win.webContents.capturePage({ x: spot.x, y: spot.y, width: 1, height: 1 })
        const b = img.getBitmap()
        const n = b.length / 4
        let r = 0, g = 0, bl = 0
        for (let i = 0; i < n; i++) { r += b[i * 4 + 2]; g += b[i * 4 + 1]; bl += b[i * 4] }
        return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)]
      }
      const victim = await wc.executeJavaScript(`(() => { const p = document.querySelector('.panel'); return p ? p.getAttribute('data-panel-id') : null })()`)
      const idle = spot === null ? null : await sample()
      if (spot !== null && victim !== null) {
        wc.send(IPC_EVENTS.AGENT_STATE, { panelId: victim, state: 'wants-you' })
        await waitUntil(async () => await wc.executeJavaScript(`document.querySelector('.canvas__aura').getAttribute('data-activity') === 'waiting'`), 3000)
        await sleep(400) // the crossfade is --dur-2; read it settled, not mid-flight
      }
      const waiting = spot === null ? null : await sample()
      // Put the canvas back before anything else reads it.
      if (victim !== null) { wc.send(IPC_EVENTS.AGENT_STATE, { panelId: victim, state: 'idle' }); await sleep(300) }
      const attr = await wc.executeJavaScript(`document.querySelector('.canvas__aura').getAttribute('data-activity')`)
      // Toward AMBER: --aura-wait is the same amber every waiting panel wears,
      // so the red channel must rise against the blue one. Asserting the
      // DIRECTION rather than a value keeps this true in both themes without
      // hard-coding either theme's ground.
      const warm = (idle !== null && waiting !== null) ? (waiting[0] - waiting[2]) - (idle[0] - idle[2]) : 0
      // M328 (restrained system) REVERSED M229's direction on purpose: state is
      // the panel's edge and word, never a tinted ground, so the aura tokens are
      // zero-alpha and the ground must NOT move. The attribute still toggles and
      // releases (aura.1's plumbing stays), so a later direction can bring the
      // light back without re-plumbing — and this check then flips again.
      ok('aura.paint.1 a panel that needs you leaves the canvas ground neutral (M328: no tinted surface explains a state) and the activity attribute still releases — measured off the compositor at the aura\'s centre, not read off the DOM',
        spot !== null && victim !== null && Math.abs(warm) < 2 && attr === null,
        JSON.stringify({ spot, victim, idle, waiting, warm, attrAfterRelease: attr }))
    }


    // M234 — chromeless.resize.1. THE ONE THAT MUST BE RED FIRST.
    //
    // A terminal panel goes chromeless: at rest the controls are gone and the
    // content runs to the edge. There are two ways to do that and only one is
    // safe.
    //
    // The UNSAFE one is to collapse the chrome's BOX on hover — `display:
    // none`, `height: 0`, or dropping it from the flow. The body then grows
    // by the chrome's height, xterm refits, and a SIGWINCH goes into the
    // running agent. On every mouse-over. A resize storm with no visible
    // error, no exception, and no red suite anywhere — the agent just gets
    // told its terminal changed size, repeatedly, by a cursor passing over a
    // panel.
    //
    // The SAFE one is to position the chrome ABSOLUTELY over the body and let
    // the body own the full block size at all times. Then hovering changes
    // opacity and nothing else, and xterm never hears about it.
    //
    // So this check hovers a live terminal and asserts that the xterm grid
    // and the body's measured block size are UNCHANGED across the hover. It
    // is written before the implementation and watched failing against the
    // naive version, because a check written afterwards would be written to
    // pass whatever shipped.
    {
      const geom = await wc.executeJavaScript(`(() => {
        const slot = document.querySelector('.panel__slot')
        if (slot === null) return null
        const panel = slot.closest('.panel')
        const body = panel.querySelector('.pf__body') ?? slot.parentElement
        const chrome = panel.querySelector('.pf__chrome')
        const r = panel.getBoundingClientRect()
        return { id: panel.getAttribute('data-panel-id'),
                 hoverX: Math.round(r.left + r.width / 2), hoverY: Math.round(r.top + r.height / 2),
                 awayX: Math.round(r.left + r.width / 2), awayY: Math.round(r.top) - 40,
                 bodyH: Math.round(body.getBoundingClientRect().height),
                 chromePos: chrome ? getComputedStyle(chrome).position : null } })()`)
      const grid = () => wc.executeJavaScript(`(() => {
        const s = document.querySelector('.panel__slot')
        if (s === null) return null
        const screen = s.querySelector('.xterm-screen')
        const body = s.closest('.panel').querySelector('.pf__body') ?? s.parentElement
        return { rows: s.querySelectorAll('.xterm-rows > div').length,
                 screenH: screen ? Math.round(screen.getBoundingClientRect().height) : null,
                 bodyH: Math.round(body.getBoundingClientRect().height) } })()`)
      let before = null, during = null, after = null
      if (geom !== null) {
        // DESELECT FIRST. The first cut of this check hovered a SELECTED
        // panel, whose chrome is shown at rest anyway — so the hover changed
        // nothing, the sizes matched, and the check passed against the naive
        // collapsing implementation it was written to catch. A check that
        // cannot fail is not a check, and this one proved it twice before it
        // measured anything.
        await clickEmptyCanvas(wc)
        await settle(); await sleep(200)
        // The cursor genuinely away from the panel first, so `before` is a
        // rest reading and not a hover the previous check left behind.
        wc.sendInputEvent({ type: 'mouseMove', x: geom.awayX, y: Math.max(geom.awayY, 4) })
        await settle(); await sleep(200)
        before = await grid()
        wc.sendInputEvent({ type: 'mouseMove', x: geom.hoverX, y: geom.hoverY })
        await settle(); await sleep(350)
        during = await grid()
        wc.sendInputEvent({ type: 'mouseMove', x: geom.awayX, y: Math.max(geom.awayY, 4) })
        await settle(); await sleep(250)
        after = await grid()
      }
      const same = (a, b) => a !== null && b !== null && a.rows === b.rows && a.bodyH === b.bodyH && a.screenH === b.screenH
      // TWO ARMS, because either alone can be satisfied by the wrong thing.
      // The MECHANISM arm (the chrome is out of the flow) is what makes the
      // hazard structurally impossible; the EFFECT arm (nothing resized
      // across a real hover) is what proves the mechanism was actually
      // reached on a live terminal rather than declared in a rule that some
      // other selector overrides.
      const chromeOut = geom !== null && (geom.chromePos === 'absolute' || geom.chromePos === 'fixed')
      // M234 — chromeless.paint.1. THE CHROME IS STILL THERE, AND STILL
      // REACHABLE. M149's lesson, applied to the surface this milestone just
      // lifted out of the flow: an absolutely positioned element over a
      // transformed, blurred subtree is exactly the shape that went invisible
      // for two versions, and a query check stays green through it.
      //
      // Three things, because chromeless must not become CONTROL-less — and
      // the first of them is measured in BOTH states, because the answer is
      // deliberately different in each and the pair is the whole contract:
      //   * ON HOVER, elementFromPoint at the ⋯ button's own centre returns
      //     something inside the chrome — it is on top of the body, not
      //     behind it. This is the arm that catches the invisible-surface
      //     failure M149 named;
      //   * AT REST the SAME point reaches the terminal body instead. That is
      //     not a weaker version of the first arm, it is the chromeless
      //     contract: a control nobody can see must not eat the cell under
      //     it. The first cut of this check asserted `onTop` at rest, which
      //     is exactly the invisible 36px bar `type.1` caught swallowing a
      //     click on the terminal's second row — so the check as first
      //     written could only have been satisfied by the bug. Asserting it
      //     here means the guarantee lives beside the rule, rather than
      //     resting on a check about FONT METRICS noticing it by accident;
      //   * the button is at opacity 0 at rest and 1 on hover, so the panel
      //     is quiet until it is used (the rest rule), and it keeps a real
      //     box and an accessible name at rest, so a scripted click lands and
      //     a keyboard reaches it without hovering (M44's reach rule, which
      //     chromeless must not spend).
      // ONE probe, read twice, so the two states are compared like for like:
      // the same button, the same point, the same query.
      const probeMore = () => wc.executeJavaScript(`(() => {
        const p = document.querySelector('.panel[data-panel-id="${geom.id}"]')
        const b = p === null ? null : p.querySelector('[data-panel-more]')
        if (b === null) return null
        const r = b.getBoundingClientRect()
        const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
        return { opacity: getComputedStyle(b).opacity, w: Math.round(r.width), h: Math.round(r.height),
                 named: (b.getAttribute('aria-label') ?? b.getAttribute('title') ?? '').length > 0,
                 onTop: el !== null && el.closest('.pf__chrome') !== null,
                 hitsBody: el !== null && el.closest('.panel__slot') !== null } })()`)
      const chromeRest = geom === null ? null : await probeMore()
      let chromeHover = null
      if (geom !== null) {
        wc.sendInputEvent({ type: 'mouseMove', x: geom.hoverX, y: geom.hoverY })
        await settle(); await sleep(300)
        chromeHover = await probeMore()
        wc.sendInputEvent({ type: 'mouseMove', x: geom.awayX, y: Math.max(geom.awayY, 4) })
        await settle(); await sleep(150)
      }
      ok('chromeless.paint.1 the lifted chrome PAINTS above the body ON HOVER (elementFromPoint at the ⋯ lands inside it) and is not there for the pointer AT REST (the same point reaches the terminal body, so an unseen control never eats a cell), while the button keeps a real box and an accessible name at rest so a script and a keyboard reach it without hovering',
        chromeRest !== null && chromeRest.opacity === '0' &&
          chromeRest.onTop === false && chromeRest.hitsBody === true &&
          chromeRest.w >= 20 && chromeRest.h >= 20 && chromeRest.named === true &&
          chromeHover !== null && chromeHover.opacity === '1' && chromeHover.onTop === true,
        JSON.stringify({ chromeRest, chromeHover }))

      ok('chromeless.resize.1 a terminal\'s chrome is OUT OF THE FLOW (absolute over the body) and a real hover changes neither the xterm screen nor the body\'s measured block size — a chrome whose box collapses fires a SIGWINCH into the running agent on every mouse-over, with no error and no red suite anywhere else',
        geom !== null && chromeOut && same(before, during) && same(during, after),
        JSON.stringify({ id: geom && geom.id, chromePos: geom && geom.chromePos, chromeOut, before, during, after }))
    }
  }
})
