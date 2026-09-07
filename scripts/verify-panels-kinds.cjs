/* verify:panels:kinds — one of the five parts of the old scripts/verify-panels.cjs (M135).
   Run with: npm run build && npm run verify:panels:kinds
   The harness (scripts/panels-harness.cjs) boots the renderer; this file holds the
   checks the old file held at lines 10552–14041, moved verbatim, ids unchanged. */
const { runPanelsSuite } = require('./panels-harness.cjs')

const WATCHDOG_MS = 600000 // provisional: re-measured after Act II's checks, see the M140–M147 build log

runPanelsSuite('kinds', WATCHDOG_MS, async (ctx) => {
  const { harnessAttachmentsDir, AgentSessionManager, BOOT_DEFAULT_PRESET, BrowserWindow, CASCADE_STEP, DEFAULT_CAMERA, ECHO_PRESET, ENTRY_OUT, FILE_MAX_LINES, FileWatchers, IPC, IPC_EVENTS, LAYOUT_PATH, LIVE_AT_BOOT, NEVER_RENDERED_PANEL_ID, NEVER_RENDERED_WORKSPACE_ID, NEVER_WOKEN_ID, PANELS_SOCKET, PLUGIN_DETAILS_TEXT, PLUGIN_DIR, PLUGIN_ID, PROJECT_DIR, PROJECT_PROMPT_BODY, PROJECT_PROMPT_NAME, PROMPT_DIRS, PtyManager, RENAMABLE_PRESET, REVIEW_FENCES, SEEDED_PROMPT, SEED_PANELS, ToolboxCache, WORKTREES_DIR, activeWorkspaceId, agentHandlers, agentSessions, agentTranscripts, allPresets, allTemplates, app, appendFileSync, approvalTracker, attachPtyLifecycle, backgroundPoint, baselineCapture, bootDefault, brokerAuditForChecks, buildSync, buildTmuxConf, cardCount, cardTexts, chatFixture, chatRunner, chatSpawns, clickEmptyCanvas, clickPanelAt, clickPanelBody, clickPanelClose, clickRail, closeSync, commitIndexDir, commitIndexSeq, createAgentTranscriptLog, createApprovalTracker, createBaselineCapture, createBoardLane, createBrokerAudit, createBrowserHandlers, createControlHandler, createControlServer, createDirectBackend, createExporters, createGitRunner, createLayoutSnapshots, createLayoutStore, createMemoryStore, createPlacesGate, createReviewCommitter, createReviewDiscarder, createReviewEngine, createRunLedger, createScrollbackLog, createTmuxBackend, createWatchRunner, createWorktreeManager, credentialDir, credentialStore, dockTo, execFileSync, existsSync, expandTilde, fencedGitRunner, findTmux, flushLayoutStore, fromPanels, frontTranscripts, gitPath, gridState, harnessCredentialDir, harnessGrants, importClaudeTranscript, ipcMain, isBuiltInTemplate, join, killedPanelIds, knownUsageSessionIds, lastPanelCentreInWorld, layoutSnapshots, layoutStore, linkOpens, listGithubWorkItems, listSessions, liveCount, loginEnv, memoryDir, memoryStore, mergePrompts, mkdirSync, mkdtempSync, nodeBox, nodeCount, ok, openSync, panelCount, parseLayout, parseShelf, pidsPreserved, presetFromCapture, presetRows, pressArrow, pressChord, pressPlain, ptyManager, pushDefaultPreset, railAgentState, railPan, readFileSync, readFrom, readProjectPrompts, readSync, readVault, readdirSync, realGitRunner, realIpcMainHandle, realpathSync, registerIpcHandlers, registeredHandlers, releaseMeta, renameSync, requestFromRenderer, resolveAttachment, resolveAvailability, resolveCwd, resolveShellEnv, resolveSpawnRequest, restoreFromSnapshot, results, reviewCommit, reviewEngine, rmSync, runLedger, scrollbackLog, sessionMap, settle, settledSessionMap, skillTrashCalls, skillWriteHandlers, sleep, snapshotDir, statSync, templateOf, tmpdir, toolboxCache, trailFor, unlinkSync, usageFixtureDir, usageFixtureFile, verifySocket, viewCentreInWorld, waitUntil, watchDirWatchers, watchFileWatchers, watchRunner, watchTimers, watcherHandlers, wc, webContents, whichFromEnv, whichHere, win, worktreeManager, writeFileSync, zoomTo, state } = ctx
  // M135. In the un-split file, check 26 (now in `core`) installed the
  // window lifecycle — `attachPtyLifecycle(win, () => ptyManager.detachAll())`
  // — and every check after it ran with a renderer reload DETACHING every
  // session, exactly as main/index.ts wires it. Without it a reload here
  // reattaches every PTY and a fixture that expects a dormant panel after a
  // reload finds it live (scrollback.1 was the first to say so). Installed
  // once, at this part's start, before any check reloads.
  attachPtyLifecycle(win, () => ptyManager.detachAll())
  // M135. Check 26 (core) also created the suite's TMUX backend on
  // PANELS_SOCKET, and every later check that reads `state.tmuxBackend`
  // (91, 107, the M35 link block, scrollback.1 …) took its tmux arm because
  // it existed. Created here the way 26 creates it; at this part's first
  // check the M35 link block's `backend = tmuxBackend` (shell) had made the TMUX backend current, so that is what is current.
  {
    const TMUX = findTmux()
    if (TMUX) {
      const tmuxDir = mkdtempSync(join(tmpdir(), 'tc panels tmux '))
      const exitDir = join(tmuxDir, 'exit codes')
      mkdirSync(exitDir, { recursive: true })
      const confPath = join(tmuxDir, 'tmux.conf')
      writeFileSync(confPath, buildTmuxConf(exitDir, PANELS_SOCKET))
      state.tmuxBackend = createTmuxBackend({ tmuxPath: TMUX, exitDir, confPath, reason: 'verify: tmux', socket: PANELS_SOCKET })
      state.backend = state.tmuxBackend
    }
  }

  {
    // M46: the tree block above leaves the Files pane showing, and the
    // navigator shows ONE pane — so every [data-rail-row] read below would
    // find nothing. Back to Panels, the way a user would: the dock icon.
    await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
    await settle()

    // ---------------------------------------------------------------------
    // 142-144. M18: THE RUBBER-BAND MARQUEE, in a real renderer.
    //
    //          Every drag here is a REAL wc.sendInputEvent mouseDown/
    //          mouseMove/mouseUp sequence, never a dispatched MouseEvent. A
    //          dispatched event is untrusted and Blink runs no default action
    //          for one — the limit checks 47 and 75c each record from their
    //          own side — and check 140's whole subject is a default action:
    //          where DOM focus ends up after a press on the background.
    {
      // The fixture is built rather than inherited: a camera left wherever
      // the preceding block (check 129) stopped would make 138's count
      // depend on which panels happened to be in view. Cmd+1 (fit all) is deliberately NOT the way
      // to build it — check 84's rail-dormant panel is parked at world
      // 60000,60000, so a fit clamps to MIN_SCALE and STILL cannot frame the
      // spread: every panel near the origin ends up off screen and the first
      // draft of this block measured `expected 0`, which reads as a broken
      // marquee and is a broken fixture.
      //
      // So: reset the camera to INITIAL, spawn three panels (they cascade, so
      // they are near the view centre and near each other), then step the
      // zoom out twice — still above LIVE_MIN_SCALE, and wide enough that
      // several panels and some genuine background share the canvas.
      await zoomTo(wc, '0')
      for (let i = 0; i < 3; i++) {
        await zoomTo(wc, 'n')
        await sleep(200)
      }
      await zoomTo(wc, '-')
      await zoomTo(wc, '-')
      await sleep(400)

      // Reads MID-DRAG, between the last move and the mouseup. The marquee
      // element is removed on mouseup, so "is a marquee on screen" asked
      // AFTERWARDS is answered `no` by every implementation including a
      // correct one — check 139's claim would be vacuous and 138 would have
      // no positive evidence that anything was ever drawn.
      const marqueeState = () => wc.executeJavaScript(`(() => ({
        marquees: document.querySelectorAll('.canvas-marquee').length,
        selected: document.querySelectorAll('.panel--selected').length
      }))()`)

      const dragFromTo = async (from, to, expectBand = false) => {
        wc.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
        // Four moves rather than one jump: the gesture's listeners live on
        // `document` precisely because the cursor leaves the element it
        // started in, and a single synthetic hop would exercise neither the
        // tracking nor the listener lifetime a real drag produces.
        for (let i = 1; i <= 4; i++) {
          wc.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(from.x + ((to.x - from.x) * i) / 4),
            y: Math.round(from.y + ((to.y - from.y) * i) / 4),
            // `leftButtonDown` is what makes MouseEvent.buttons read 1 in the
            // renderer, which is what a REAL drag looks like — Chromium
            // derives `buttons` from the modifier bitfield, not from the
            // `button` field, the same spelling trap the auto-repeat note
            // records for `isAutoRepeat`. The gesture ends itself on a move
            // with no button held (a press whose mouseup never arrived), so
            // without this every drag here would end on its first move.
            button: 'left',
            modifiers: ['leftButtonDown']
          })
        }
        // The mid-drag sample is POLLED, not taken once after a fixed sleep.
        // A single 200ms read is a race against the renderer, and it lost:
        // this same fixture reported `during=1` on one run and `during=0` on
        // the next with the selection correct (16 of 16) both times — the
        // gesture had worked and only the observation missed. `expectBand`
        // says which way to wait, because the two callers want opposite
        // things: check 142 needs the band to EXIST and can stop the moment
        // it does, while check 143 asserts a band never appears at all and
        // must keep sampling for the whole window to be worth anything.
        const deadline = Date.now() + 1500
        let during = await marqueeState()
        while (expectBand && during.marquees === 0 && Date.now() < deadline) {
          await sleep(50)
          during = await marqueeState()
        }
        if (!expectBand) {
          await sleep(200)
          during = await marqueeState()
        }
        wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
        await sleep(200)
        return during
      }

      // 142. A marquee selects SEVERAL panels in one gesture. Asserted as a
      //      COUNT, because a marquee that kept only the last panel it
      //      touched still leaves one selected and looks almost right on
      //      screen — and so does one that selected nothing but left the
      //      previous selection standing.
      //
      //      The expected count is DERIVED from the panels' own screen rects
      //      under marqueeSelection's strict-inequality rule, never written
      //      here as a literal: a literal would be true of exactly one
      //      fixture and would go stale the first time anything above this
      //      block spawns or closes a panel.
      const plan = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas')
        if (!host) return null
        const b = host.getBoundingClientRect()
        // A start point the marquee is ALLOWED to begin at. The background
        // handler is not "empty space" — a carded panel's click falls through
        // to it — so the start has to be a point with no .panel under it at
        // all, which is what hitTest returning null means in the DOM.
        let from = null
        for (let dy = 6; dy < b.height - 6 && !from; dy += 8) {
          for (let dx = 6; dx < b.width - 6; dx += 8) {
            const x = Math.round(b.left + dx), y = Math.round(b.top + dy)
            const el = document.elementFromPoint(x, y)
            if (el && host.contains(el) && !el.closest('.panel') && !el.closest('.canvas-hud')) {
              from = { x, y }
              break
            }
          }
        }
        if (!from) return null
        const to = { x: Math.round(b.right - 4), y: Math.round(b.bottom - 4) }
        const l = Math.min(from.x, to.x), t = Math.min(from.y, to.y)
        const r = Math.max(from.x, to.x), bo = Math.max(from.y, to.y)
        // Screen space answers the same question world space does here: the
        // world transform is a uniform positive scale plus a translation, so
        // it preserves intersection exactly.
        const expected = [...document.querySelectorAll('.panel')].filter((el) => {
          const p = el.getBoundingClientRect()
          return p.left < r && p.right > l && p.top < bo && p.bottom > t
        }).length
        return { from, to, expected }
      })()`)
      if (!plan) throw new Error('138: found no background point on the canvas to start a marquee at')

      const during118 = await dragFromTo(plan.from, plan.to, true)
      const after118 = await marqueeState()
      ok('142 a marquee selects every panel it sweeps, in one gesture',
        plan.expected >= 2 && during118.marquees === 1 &&
          after118.selected === plan.expected && after118.marquees === 0,
        `expected ${plan.expected} panels, selected ${after118.selected}; ` +
          `marquees during=${during118.marquees} after=${after118.marquees}`)

      // 143. A drag starting ON A CARDED PANEL selects that panel and draws
      //      NO marquee. This is the rule most likely to catch a real
      //      regression: the background onMouseDown is not "empty space" — a
      //      carded panel has no chrome handler of its own, so its click
      //      falls through here and is resolved by hitTest. A marquee started
      //      on ANY background mousedown would rubber-band instead of
      //      selecting, every time a user clicked a card — and cards are most
      //      of the canvas once LIVE_BUDGET is spent.
      // Two more zoom steps take the scale below LIVE_MIN_SCALE (0.5), which
      // makes EVERY panel a card — the tier this check is about, and the one
      // most of a real canvas is in once LIVE_BUDGET is spent.
      await zoomTo(wc, '-')
      await zoomTo(wc, '-')
      await sleep(400)
      // The selection 142 built is CLEARED first, and not as tidying up. M26
      // made a press on an already-selected member KEEP the selection, so a
      // completed marquee can begin a group drag — so with 142's nineteen
      // panels still selected, the card press below would (correctly) keep
      // all nineteen and this check would fail while both features behaved.
      // That is exactly how main carried a red 143 for three merges: 142 and
      // M26 were each green alone, and nobody ran them in sequence. Clearing
      // here makes the check assert its own claim — a press on an UNSELECTED
      // card selects it and draws no marquee — rather than a rule M26 replaced.
      const cleared143 = await clickEmptyCanvas(wc)
      if (!cleared143) throw new Error('143: found no background point to clear the selection at')
      await sleep(100)
      const card = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas')
        if (!host) return null
        const b = host.getBoundingClientRect()
        for (const el of document.querySelectorAll('.panel')) {
          // A CARD specifically, not any panel: a live panel's slot would
          // hand the mousedown to xterm and prove nothing about this branch.
          if (!el.querySelector('.panel__card')) continue
          const r = el.getBoundingClientRect()
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
          if (x < b.left + 2 || x > b.right - 2 || y < b.top + 2 || y > b.bottom - 2) continue
          // The centre must really resolve to this panel — an overlapping
          // neighbour on top would make the check assert about the wrong one.
          const hit = document.elementFromPoint(x, y)
          if (!hit || hit.closest('.panel') !== el) continue
          return { id: el.dataset.panelId, x, y }
        }
        return null
      })()`)
      if (!card) throw new Error('139: no carded panel was reachable on screen')

      const during119 = await dragFromTo({ x: card.x, y: card.y }, { x: card.x + 220, y: card.y + 160 })
      const after119 = await wc.executeJavaScript(`(() => ({
        marquees: document.querySelectorAll('.canvas-marquee').length,
        selected: [...document.querySelectorAll('.panel--selected')].map((el) => el.dataset.panelId)
      }))()`)
      ok('143 a drag from a carded panel selects it and starts no marquee',
        during119.marquees === 0 && after119.selected.length === 1 &&
          after119.selected[0] === card.id,
        `marquees during=${during119.marquees}, selected ${JSON.stringify(after119.selected)} ` +
          `(card ${card.id})`)

      // 144. A marquee still RELEASES FOCUS — the job the background handler
      //      already had before the marquee joined it. assignTiers pins the
      //      focused panel live UNCONDITIONALLY, so a gesture that forgot
      //      this holds a WebGL context and a LIVE_BUDGET slot for the rest
      //      of the run, however far the user pans away, and keeps routing
      //      Cmd+C to a panel whose textarea the browser blurred long ago.
      //
      //      Two reads, because neither alone is the whole claim.
      //      activeElement is the DOM half and is a browser DEFAULT ACTION,
      //      which is why the drag above it has to be real input. __m4aGrid()
      //      is the app half: it answers non-null only for a focusedId naming
      //      a LIVE session, so it is the one observable that moves when
      //      setFocusedId(null) is deleted — DOM focus leaves the textarea on
      //      any background mousedown whether or not React was told.
      await zoomTo(wc, '0')
      await waitUntil(async () => (await liveCount(wc)) > 0, 4000)
      // The focus target is CHOSEN by hit test, never taken as "the first
      // .panel__slot in the document". DOM order is the panels array and paint
      // order is Panel.z — deliberately different things, as the note on
      // Panel.z says — so the first slot in the document is routinely painted
      // UNDERNEATH an overlapping panel. clickPanelBody would then land on the
      // neighbour, reach no .xterm, focus nothing, and this check would fail
      // reporting `before=false` with the marquee entirely innocent. That is
      // not hypothetical: it is what happened the first time a block was
      // inserted between this one and the panels it inherited, which moved the
      // z-order out from under an assumption nothing here had ever stated.
      //
      // So: walk the slots, keep the first whose own centre is on screen AND
      // hit-tests back to itself, and address it by panel id.
      const focusTarget144 = await wc.executeJavaScript(`(() => {
        // Sample a GRID inside each slot, not just its centre. Panels overlap
        // heavily by this point in the run and a large panel can be covered
        // dead-centre while most of it is still exposed, so a centre-only
        // test finds nothing and reports "no panel is clickable" about a
        // canvas full of clickable panels.
        const pts = [0.5, 0.25, 0.75]
        for (const s of document.querySelectorAll('.panel__slot')) {
          const r = s.getBoundingClientRect()
          if (r.width < 8 || r.height < 8) continue
          for (const fx of pts) {
            for (const fy of pts) {
              const x = Math.round(r.left + r.width * fx)
              const y = Math.round(r.top + r.height * fy)
              if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue
              const el = document.elementFromPoint(x, y)
              if (el && el.closest('.panel__slot') === s) {
                const p = s.closest('.panel')
                if (p) return { id: p.getAttribute('data-panel-id'), x, y }
              }
            }
          }
        }
        return null
      })()`)
      // Falls back rather than THROWING. A throw here ends the process and
      // every check below never runs — the trap this file documents at
      // length — so an unfindable target degrades into clicking the first
      // slot, which lets this check fail on its own terms with its own
      // message instead of taking the rest of the suite down with it.
      // M46: the shell changed the canvas's width and so the tiering
      // fixture underneath this check — with no live slot on screen, WAKE a
      // visible card with a real click (the hit test needs real coordinates)
      // and look again. The claim is about focus release; the fixture just
      // has to put a live, focusable panel under the cursor first.
      let target144 = focusTarget144
      let framed144 = null
      if (!target144) {
        // M46: the shell's width changed which panels the cull region holds,
        // and with LIVE_BUDGET already spent on live panels just off screen
        // a card clicked here is woken but never promoted (its slot never
        // appears — watched, not assumed). So FRAME a panel that is already
        // live, through its rail row (goToPanel: frame, select, raise, never
        // wake), and look again. The claim is about focus release; the
        // fixture only has to put a live, focusable panel under the cursor.
        const liveIds = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].filter((p) => p.querySelector('.xterm')).map((p) => p.dataset.panelId)`)
        for (const id of liveIds) {
          const rowed = await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row=' + ${JSON.stringify(JSON.stringify(id))} + '] .rail-row__main'); if (!row) return false; row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
          if (!rowed) continue
          await settle()
          target144 = await wc.executeJavaScript(`(() => {
            const s = document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(id))} + '] .panel__slot')
            if (!s) return null
            const r = s.getBoundingClientRect()
            const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
            const el = document.elementFromPoint(x, y)
            return el && el.closest('.panel__slot') === s ? { id: ${JSON.stringify(id)}, x, y, framed: true } : null })()`)
          if (target144) { framed144 = id; break }
        }
      }
      const diag144 = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas'); const b = host.getBoundingClientRect()
        const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2)
        const el = document.elementFromPoint(cx, cy)
        return { scale: window.__m4aScale(), slots: document.querySelectorAll('.panel__slot').length,
          cards: document.querySelectorAll('.panel__card').length, xterms: document.querySelectorAll('.panel .xterm').length,
          centre: el ? (el.tagName + '.' + String(el.className).slice(0, 40)) : null, canvas: { l: b.left, t: b.top, w: b.width, h: b.height },
          shell: document.querySelector('.shell').className, overlays: [...document.querySelectorAll('.palette, .navgrid, .diagnostics-overlay, .dock__popover')].map((o) => o.className) } })()`)
      const focusedBefore = target144
        ? await clickPanelAt(target144.x, target144.y)
        : await clickPanelBody('.panel__slot')
      const insideBefore = await wc.executeJavaScript(
        `!!(document.activeElement && document.activeElement.closest('.panel'))`)
      const plan120 = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas')
        const b = host.getBoundingClientRect()
        for (let dy = 6; dy < b.height - 6; dy += 8) {
          for (let dx = 6; dx < b.width - 6; dx += 8) {
            const x = Math.round(b.left + dx), y = Math.round(b.top + dy)
            const el = document.elementFromPoint(x, y)
            if (el && host.contains(el) && !el.closest('.panel') && !el.closest('.canvas-hud')) {
              return { from: { x, y }, to: { x: Math.min(x + 200, Math.round(b.right - 4)),
                                             y: Math.min(y + 140, Math.round(b.bottom - 4)) } }
            }
          }
        }
        return null
      })()`)
      if (!plan120) throw new Error('140: found no background point to marquee from')
      await dragFromTo(plan120.from, plan120.to)
      const released = await wc.executeJavaScript(`(() => ({
        inPanel: !!(document.activeElement && document.activeElement.closest('.panel')),
        grid: typeof window.__m4aGrid === 'function' ? window.__m4aGrid() : 'missing'
      }))()`)
      ok('144 a marquee releases focus, the job the background click already had',
        insideBefore === true && released.inPanel === false && released.grid === null,
        `focused before=${insideBefore} (${focusedBefore.active}, reachedXterm=${focusedBefore.reachedXterm}, ` +
          `target=${JSON.stringify(target144)} framed=${framed144} diag=${JSON.stringify(diag144)}), after inPanel=${released.inPanel} ` +
          `grid=${JSON.stringify(released.grid)}`)
    }

    // 144b. Shift-click adds a second panel, then an ordinary chrome drag of
    // either selected member moves BOTH. The final undo is deliberately one
    // step: it catches an implementation that commits once per member even if
    // its geometry happens to look correct on screen.
    {
      await zoomTo(wc, '0')
      const empty144b = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas')
        if (!host) return null
        const b = host.getBoundingClientRect()
        for (let y = b.top + 6; y < b.bottom - 6; y += 8) {
          for (let x = b.left + 6; x < b.right - 6; x += 8) {
            const el = document.elementFromPoint(x, y)
            if (el && host.contains(el) && !el.closest('.panel') && !el.closest('.canvas-hud')) return { x, y }
          }
        }
        return null
      })()`)
      // A background click first makes this fixture independent of the
      // marquee check immediately above it.
      if (empty144b) {
        wc.sendInputEvent({ type: 'mouseDown', x: empty144b.x, y: empty144b.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: empty144b.x, y: empty144b.y, button: 'left', clickCount: 1 })
      }
      await sleep(150)
      // Two fresh panels, so this check OWNS its fixture rather than inheriting
      // whatever geometry the checks above happened to leave. Until M36 it
      // did inherit: 143 (pre-repair) kept a nineteen-panel selection through
      // its card press, so its drag moved all nineteen together, and the
      // exposed-chrome search below found a second panel only because of
      // where that drag left everything. The moment 143 was repaired to
      // select the card alone, no second chrome was exposed, `second144b`
      // came back null, and this check went red for a change that touched
      // nothing it asserts. Cmd+N cascades each new panel 48 world units
      // down-right of the last and paints it topmost, which leaves the
      // previous one's whole chrome bar uncovered — so two presses guarantee
      // two exposed chromes regardless of the canvas underneath.
      const panelIds144b = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      const idsBefore144b = await panelIds144b()
      // Two fresh SMALL panels, spawned through main's own PRESET_SPAWN push
      // (the path Cmd+N takes), so this check OWNS its fixture rather than
      // inheriting whatever geometry the checks above happened to leave.
      // Until M36 it did inherit: 143 (pre-repair) kept a nineteen-panel
      // selection through its card press, its drag moved all nineteen, and an
      // exposed-chrome search over the whole document only found a second
      // panel because of where that drag left everything. Small, because the
      // canvas here is ~680px wide with the tree, rail and inspector all open,
      // and two default-size panels cannot both have an exposed chrome in it.
      for (let i = 0; i < 2; i++) {
        wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: require("node:os").homedir(), command: "/bin/sh", args: [], w: 300, h: 200 })
        await sleep(400)
      }
      await settle()
      const fresh144b = (await panelIds144b()).filter((id) => !idsBefore144b.includes(id))
      // Addressed BY ID, never by "the first exposed chrome in the document":
      // the two panels this check just made are the two it acts on. Four
      // sample points along the chrome, and the detail records what
      // elementFromPoint actually hit when none is usable, so a red here says
      // which element was in the way rather than merely "null".
      const chromePoint = async (id) => wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas')
        const panel = document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(id))} + ']')
        const chrome = panel && panel.querySelector('.panel__chrome')
        if (!host || !chrome) return { id: ${JSON.stringify(id)}, missing: true }
        const b = host.getBoundingClientRect()
        const r = chrome.getBoundingClientRect()
        const hits = []
        for (const fx of [0.15, 0.35, 0.65, 0.85]) {
          const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height / 2)
          if (x < b.left + 2 || x > b.right - 2 || y < b.top + 2 || y > b.bottom - 2) { hits.push('offscreen'); continue }
          const hit = document.elementFromPoint(x, y)
          if (hit && hit.closest('.panel__chrome') === chrome && !hit.closest('button')) {
            return { id: ${JSON.stringify(id)}, x, y }
          }
          hits.push(hit ? (hit.className || hit.tagName) + '@' + (hit.closest('.panel') ? hit.closest('.panel').dataset.panelId : '-') : 'none')
        }
        return { id: ${JSON.stringify(id)}, hits }
      })()`)
      // cascadeCentre steps down-right only while a slot is free and WRAPS
      // otherwise, so on a crowded canvas the second panel can land up-left
      // of the first, covering its chrome. The second panel is topmost and
      // therefore exposed by construction; if it overlaps the first's chrome
      // row, drag it down until its top clears that row — a real drag, on
      // the machinery the rest of this check already trusts.
      if (fresh144b.length === 2) {
        const rects = await wc.executeJavaScript(`(() => {
          const get = (id) => {
            const p = document.querySelector('.panel[data-panel-id=' + JSON.stringify(id) + ']')
            const c = p && p.querySelector('.panel__chrome')
            return p && c ? { p: p.getBoundingClientRect().toJSON(), c: c.getBoundingClientRect().toJSON() } : null
          }
          return { a: get(${JSON.stringify(fresh144b[0])}), b: get(${JSON.stringify(fresh144b[1])}) }
        })()`)
        if (rects.a && rects.b) {
          const overlapsX = rects.b.p.left < rects.a.c.right && rects.b.p.right > rects.a.c.left
          const overlapsY = rects.b.p.top < rects.a.c.bottom && rects.b.p.bottom > rects.a.c.top
          if (overlapsX && overlapsY) {
            const grab = await chromePoint(fresh144b[1])
            if (grab.x !== undefined) {
              const dy = Math.round(rects.a.c.bottom + 12 - rects.b.p.top)
              const to = { x: grab.x, y: grab.y + dy }
              wc.sendInputEvent({ type: 'mouseDown', x: grab.x, y: grab.y, button: 'left', clickCount: 1 })
              for (let i = 1; i <= 4; i++) {
                wc.sendInputEvent({ type: 'mouseMove', x: grab.x, y: Math.round(grab.y + dy * i / 4), button: 'left', modifiers: ['leftButtonDown'] })
              }
              wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
              await settle()
            }
          }
        }
      }
      // The NEWER panel first (it is on top, so its chrome is exposed), then
      // shift-click the older one: raising the newer covers everything of
      // the older except its chrome row, which is what the second probe
      // needs. The other order leaves the older panel covering the newer's
      // chrome, whose right half is off the canvas at this width (M46).
      const firstProbe = fresh144b.length === 2 ? await chromePoint(fresh144b[1]) : { missing: true }
      const first144b = firstProbe.x !== undefined ? firstProbe : null
      const clickChrome = async (point, shift = false) => {
        const modifiers = shift ? ['shift'] : []
        wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1, modifiers })
        wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1, modifiers })
        await sleep(150)
      }
      if (first144b) await clickChrome(first144b)
      // Probed AFTER the first click: selecting raises, so the first panel
      // now covers part of the second's chrome, and chromePoint hit-tests
      // for an exposed point at probe time — probed before, it found one the
      // raise then covered (M46, when a narrower canvas moved the cascade).
      const secondProbe = fresh144b.length === 2 ? await chromePoint(fresh144b[0]) : { missing: true }
      const second144b = first144b && secondProbe.x !== undefined ? secondProbe : null
      if (second144b) await clickChrome(second144b, true)
      const selected144b = await wc.executeJavaScript(
        `Array.from(document.querySelectorAll('.panel--selected')).map((p) => p.dataset.panelId)`)
      const under144b = second144b ? await wc.executeJavaScript(`(() => {
        const el = document.elementFromPoint(${second144b.x}, ${second144b.y})
        return el ? (el.tagName + '.' + String(el.className).slice(0, 40) + ' in ' + (el.closest('.panel')?.dataset.panelId ?? '-')) : null })()`) : null
      const selectionReady144b = first144b !== null && second144b !== null &&
        selected144b.includes(first144b.id) && selected144b.includes(second144b.id) && selected144b.length === 2

      const before144b = selectionReady144b ? await wc.executeJavaScript(`(() => {
        const ids = ${JSON.stringify([first144b && first144b.id, second144b && second144b.id])}
        return Object.fromEntries(ids.map((id) => {
          const panel = document.querySelector('.panel[data-panel-id=' + JSON.stringify(id) + ']')
          return [id, { x: Number(panel.style.left.replace('px', '')), y: Number(panel.style.top.replace('px', '')) }]
        }))
      })()`) : null
      // The second press is non-shifted on purpose. Selection must survive it
      // long enough for onBeginDrag to snapshot BOTH origin rects.
      if (selectionReady144b) {
        const dragPoint = await chromePoint(second144b.id)
        if (dragPoint && dragPoint.x !== undefined) {
          const to = { x: dragPoint.x + 96, y: dragPoint.y - 64 }
          wc.sendInputEvent({ type: 'mouseDown', x: dragPoint.x, y: dragPoint.y, button: 'left', clickCount: 1 })
          for (let i = 1; i <= 4; i++) {
            wc.sendInputEvent({ type: 'mouseMove', x: Math.round(dragPoint.x + (to.x - dragPoint.x) * i / 4), y: Math.round(dragPoint.y + (to.y - dragPoint.y) * i / 4), button: 'left', modifiers: ['leftButtonDown'] })
          }
          wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
        }
      }
      await sleep(250)
      const after144b = before144b ? await wc.executeJavaScript(`(() => {
        const ids = Object.keys(${JSON.stringify(before144b)})
        return Object.fromEntries(ids.map((id) => {
          const panel = document.querySelector('.panel[data-panel-id=' + JSON.stringify(id) + ']')
          return [id, { x: Number(panel.style.left.replace('px', '')), y: Number(panel.style.top.replace('px', '')) }]
        }))
      })()`) : null
      const movedTogether144b = before144b !== null && after144b !== null &&
        Object.keys(before144b).every((id) => {
          const dx = after144b[id].x - before144b[id].x
          const dy = after144b[id].y - before144b[id].y
          const first = first144b.id
          return Math.abs(dx - (after144b[first].x - before144b[first].x)) < 1 &&
            Math.abs(dy - (after144b[first].y - before144b[first].y)) < 1 && (Math.abs(dx) > 1 || Math.abs(dy) > 1)
        })
      if (movedTogether144b) await wc.executeJavaScript(`window.__m4bUndo()`)
      const undone144b = movedTogether144b && await waitUntil(async () => {
        const now = await wc.executeJavaScript(`(() => {
          const before = ${JSON.stringify(before144b)}
          return Object.entries(before).every(([id, rect]) => {
            const panel = document.querySelector('.panel[data-panel-id=' + JSON.stringify(id) + ']')
            return panel && Math.abs(Number(panel.style.left.replace('px', '')) - rect.x) < 1 &&
              Math.abs(Number(panel.style.top.replace('px', '')) - rect.y) < 1
          })
        })()`)
        return now ? true : false
      }, 3000)
      ok('144b shift-click adds selection; one group drag moves and one undo restores both',
        selectionReady144b && movedTogether144b && undone144b === true,
        `fresh=${JSON.stringify(fresh144b)} first=${JSON.stringify(firstProbe)} second=${JSON.stringify(secondProbe)} ` +
          `selected=${JSON.stringify(selected144b)} under=${JSON.stringify(under144b)} moved=${movedTogether144b} undone=${undone144b}`)
    }

    // ---------------------------------------------------------------------
    // 145-147 — M18. Filing a selection into another workspace.
    //
    //     The move is a RECORD edit and nothing else: main rewrites which
    //     workspace owns the panel, and this renderer drops it from its local
    //     panels array. Every session on both sides is untouched — a moved
    //     panel becomes a hidden workspace's panel with a running tmux
    //     session, which is exactly the state a workspace SWITCH already
    //     produces ("demote, not dispose"). Nothing cheaper than a real
    //     renderer holding a real PanelSession can see the difference, which
    //     is check 64's argument reaching a third door.
    //
    //     Its own fixture — a fresh workspace, one fresh panel, a fresh
    //     target — rather than whatever the blocks above left behind: by this
    //     point the canvas has been reset, reloaded, marqueed and panned
    //     several times, and a check that moved "whichever panel happens to
    //     be here" could not name the pid it is asserting about.
    // ---------------------------------------------------------------------
    {
      // Guarded rather than called bare. A missing hook rejects
      // executeJavaScript, which THROWS, which ends the whole run here and
      // takes 142's RED down with it — the trap CLAUDE.md records for
      // test-first checks in these single-script suites.
      const hasMoveHook = await wc.executeJavaScript(
        `typeof window.__m7aWorkspace === 'function' &&
         typeof window.__m7aWorkspace().movePanels === 'function'`)

      if (!hasMoveHook) {
        ok('145 a moved panel keeps its pid', false, 'no __m7aWorkspace().movePanels hook')
        ok('146 Cmd+Z right after a move changes nothing', false,
          'no __m7aWorkspace().movePanels hook')
      } else {
        // createAndSwitch, not create: the panel about to be spawned has to
        // live in the workspace this check is moving FROM, and the id is
        // captured rather than guessed for the reason check 64 records —
        // nextWorkspaceId() mints over whatever already exists, and a wrong
        // literal fails silently because an unknown id changes nothing.
        const homeId = await wc.executeJavaScript(
          `window.__m7aWorkspace().createAndSwitch('movers')`)
        await settle()
        // The camera has been zoomed and panned repeatedly above; a spawn
        // outside the cull region is never promoted and therefore never
        // spawns a PTY at all, which would leave this check asserting pid
        // identity about a panel that has no pid.
        await zoomTo(wc, '0')
        await settle()
        await zoomTo(wc, 'n')
        const movedId = await waitUntil(async () => {
          const ids = await wc.executeJavaScript(
            `Array.from(document.querySelectorAll('.panel[data-panel-id]')).map((e) => e.dataset.panelId)`)
          return ids.length === 1 ? ids[0] : null
        }, 6000)
        if (!movedId) throw new Error('141: the fresh workspace never rendered exactly one panel')
        // MAIN's own pty:list, not the DOM: a panel is on screen well before
        // its session exists, and a move issued in that window would be
        // asserting pid identity against `undefined` on both sides — which
        // passes, vacuously, against an implementation that kills everything.
        const spawned = await waitUntil(async () => (await sessionMap(wc)).has(movedId), 15000)
        if (!spawned) throw new Error(`141: ${movedId} never reached pty:list`)

        // create, NOT createAndSwitch: the target must stay hidden, because
        // "the session survived while its panel was filed somewhere the user
        // is not looking" is the whole claim.
        const targetId = await wc.executeJavaScript(`window.canvas.workspace.create('filed')`)
        const before = await settledSessionMap(wc)

        await wc.executeJavaScript(
          `window.__m7aWorkspace().movePanels(${JSON.stringify([movedId])}, ` +
          `{ workspaceId: ${JSON.stringify(targetId)} })`)
        await settle()

        const gone = await wc.executeJavaScript(
          `document.querySelectorAll('.panel[data-panel-id=${JSON.stringify(movedId)}]').length === 0`)
        const after = await sessionMap(wc)

        // 145. THE CHECK THIS TASK EXISTS FOR: the moved panel's pid is
        //      UNCHANGED. Every other observable in this milestone stays
        //      correct against a move that quietly disposed and respawned —
        //      the panel leaves this canvas either way, main's record is
        //      right either way, the rail is right either way — and only the
        //      pid separates them.
        //
        //      Three clauses, and the first two are not redundant with the
        //      third. `gone` is the non-vacuity guard: a move that did
        //      NOTHING AT ALL preserves every pid perfectly, so without it
        //      this check is green against a stub. `listed` is the other
        //      direction: a dispose with no respawn leaves the id absent
        //      from pty:list, and `after.get(id) === before.get(id)` reads
        //      undefined === undefined as agreement if before was empty too
        //      — which the spawned wait above already rules out, but the
        //      clause states it rather than relying on a wait staying put.
        const listed = after.has(movedId)
        ok('145 a moved panel keeps the SAME pid, and is still running',
          gone === true && listed &&
            before.get(movedId) !== undefined &&
            after.get(movedId) === before.get(movedId),
          `home=${homeId} target=${targetId} ${movedId}: ` +
            `${before.get(movedId)} -> ${after.get(movedId) ?? 'MISSING'} gone=${gone}`)

        // 146. Cmd+Z immediately after a move is INERT. history is ONE stack
        //      over ONE Panel[], and applyHistory disposes any panel the
        //      undone state no longer contains — which reaches pty.kill. An
        //      undo here would either resurrect a panel main's record no
        //      longer lists in this workspace, or kill a session that now
        //      belongs to another workspace. Doing nothing is the honest
        //      failure; doing something kills another workspace's agents.
        //
        //      Driven through __m4bUndo() rather than a synthetic 'z'
        //      keydown, for the reason check 67 records at length: Cmd+Z is
        //      a main-process menu accelerator and this harness has no menu,
        //      so a keydown would assert a no-op against a path that could
        //      never have run.
        const panelsBeforeUndo = await wc.executeJavaScript(
          `document.querySelectorAll('.panel[data-panel-id]').length`)
        await wc.executeJavaScript(`window.__m4bUndo()`)
        await settle()
        const panelsAfterUndo = await wc.executeJavaScript(
          `document.querySelectorAll('.panel[data-panel-id]').length`)
        const afterUndo = await sessionMap(wc)
        const { ok: undoPreserved, changed: undoChanged } = pidsPreserved(after, afterUndo)
        ok('146 Cmd+Z right after a move changes nothing, and kills nothing',
          panelsBeforeUndo === panelsAfterUndo && undoPreserved,
          `panels ${panelsBeforeUndo} -> ${panelsAfterUndo} changed=[${undoChanged.join(', ')}]`)
      }
    }

    // ---------------------------------------------------------------------
    // 147. The OTHER half of the verb: into a workspace that does not
    //     exist yet.
    //
    //     Check 141 covers the `{ workspaceId }` target end to end, and
    //     verify:layout 120-122 cover it at the store; verify:palette 80
    //     covers the row -> begin* hop. So what was left uncovered is
    //     everything between them: the submit handler (trim, empty-as-cancel,
    //     one composed call)
    //     and the `{ newName }` target shape crossing preload and IPC. Three
    //     lines and a marshalling assumption — and half of what the feature
    //     promises. Its failure is the quietest shape this palette can
    //     produce: the user types a name, the overlay closes, nothing is
    //     created, and the row reads as a feature that was never built.
    //
    //     Driven through the REAL row rather than the __m7aWorkspace hook —
    //     the hook is aimed at movePanelsToWorkspace and would skip the
    //     begin*/input-mode/submit path that is the entire uncovered
    //     surface. The row is located by its own rendered text, which is a
    //     second assertion wearing a locator's clothes: only move-new reads
    //     "to a new workspace", and the "1 panel" in it is the selection
    //     having actually reached buildCommands.
    //
    //     The name is typed with LEADING AND TRAILING SPACE and asserted
    //     TRIMMED — a workspace named "  x  " is one no row can ever match.
    //     Be honest about what that clause can and cannot see: Palette.tsx
    //     ALREADY trims before it calls an input mode's submit, so this does
    //     not discriminate the submit's own trim (measured — injecting an
    //     untrimmed `value` there left this check green, because the trim had
    //     already happened one layer up). What it pins is the end-to-end
    //     fact: whatever the user types arrives at the record trimmed, from
    //     whichever layer keeps doing it.
    // ---------------------------------------------------------------------
    {
      const CANCELLED = 'never minted'
      const MINTED = 'filed by hand'

      // Its own fixture, for check 141's reason: by this point 141 has moved
      // its own panel away and this workspace is empty.
      await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('handmovers')`)
      await settle()
      await zoomTo(wc, '0')
      await settle()
      await zoomTo(wc, 'n')
      const subject = await waitUntil(async () => {
        const ids = await wc.executeJavaScript(
          `Array.from(document.querySelectorAll('.panel[data-panel-id]')).map((e) => e.dataset.panelId)`)
        return ids.length === 1 ? ids[0] : null
      }, 6000)
      if (!subject) throw new Error('143: the fresh workspace never rendered exactly one panel')
      const running = await waitUntil(async () => (await sessionMap(wc)).has(subject), 15000)
      if (!running) throw new Error(`143: ${subject} never reached pty:list`)

      // SELECTED explicitly, by a real click on its header. onSpawn
      // deliberately does not select what it spawns (its own comment says so),
      // and check 142 cleared the selection on its way out — so without this
      // the palette renders "Move 0 panels…" and the row this check is about
      // is disabled. A real sendInputEvent rather than a dispatched
      // MouseEvent, the rule check 75c records: an untrusted event runs no
      // browser default action, and this click has to move DOM focus off the
      // background the same way a user's would. The header strip (top + 24),
      // never the body — a click into a live panel's slot belongs to xterm.
      const header = await wc.executeJavaScript(`(() => {
        const p = document.querySelector('.panel[data-panel-id=${JSON.stringify(subject)}]')
        if (!p) return null
        const r = p.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 24) }
      })()`)
      if (!header) throw new Error(`143: ${subject} has no rect to click`)
      wc.sendInputEvent({ type: 'mouseDown', x: header.x, y: header.y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x: header.x, y: header.y, button: 'left', clickCount: 1 })
      await settle()
      const selected = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel--selected')].map((e) => e.dataset.panelId)`)

      const before = await settledSessionMap(wc)
      const namesBefore = (await wc.executeJavaScript(`window.canvas.workspace.list()`))
        .map((w) => w.name)

      /**
       * Opens the palette, surfaces the move-new row by query, and runs it —
       * leaving the palette in INPUT mode with the name field focused.
       * Returns a diagnostic string on any failure rather than throwing, so a
       * broken step reports itself instead of aborting the run and taking the
       * rest of this check's assertions with it.
       *
       * A mousedown on the row rather than Enter on the selection, the same
       * route check 38 uses: the fuzzy matcher decides which row Enter runs,
       * and this check has no business asserting about that ranking.
       */
      const openMoveNewDraft = () => wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set
          setter.call(input, v)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        await new Promise((r) => setTimeout(r, 120))
        const input = document.querySelector('.palette__input')
        if (!input) return 'the palette did not open'
        nativeSet(input, 'move new workspace')
        await new Promise((r) => setTimeout(r, 80))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Move 1 panel to a new workspace'))
        if (!row) return 'no move-to-new row for a one-panel selection'
        if (row.className.includes('palette__row--disabled')) return 'the move-new row was disabled'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 120))
        const draft = document.querySelector('.palette__input')
        if (!draft) return 'the palette closed instead of entering input mode'
        if (document.querySelector('.palette__list')) return 'still in command mode'
        return 'ok'
      })()`)

      /** Types into whatever input is open and sends one plain key to it. */
      const submitDraft = (value, key) => wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        // Guarded: a native setter .call'd on null throws "Illegal
        // invocation", which reports as an infrastructure crash and buries
        // whichever assertion actually went wrong.
        if (!input) return 'no input to submit'
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(value)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))
        await new Promise((r) => setTimeout(r, 300))
        return 'ok'
      })()`)

      /** Leaves the overlay shut whatever state the previous step left. */
      const closePalette = () => wc.executeJavaScript(`(async () => {
        for (let i = 0; i < 3 && document.querySelector('.palette'); i++) {
          const target = document.activeElement || document.body
          target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await new Promise((r) => setTimeout(r, 80))
        }
        return document.querySelector('.palette') === null
      })()`)

      // (d) FIRST, on its own name: Escape must mint NOTHING. Sequenced ahead
      //     of the successful move because the move consumes the selection —
      //     after it there is no one-panel selection left to open the row
      //     with. Read back out of workspace.list(), never off the overlay,
      //     the rule check 50 states for the palette's confirm: a cancel that
      //     cancels unconditionally is as invisible as one that does not.
      const cancelOpened = await openMoveNewDraft()
      const cancelSubmitted = cancelOpened === 'ok'
        ? await submitDraft(CANCELLED, 'Escape')
        : 'skipped'
      await closePalette()
      const namesAfterCancel = (await wc.executeJavaScript(`window.canvas.workspace.list()`))
        .map((w) => w.name)

      // (a)-(c): the real thing.
      const mintOpened = await openMoveNewDraft()
      const mintSubmitted = mintOpened === 'ok'
        ? await submitDraft(`  ${MINTED}  `, 'Enter')
        : 'skipped'
      await settle()
      const rowsAfter = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      const after = await sessionMap(wc)
      const minted = rowsAfter.find((w) => w.name === MINTED)
      const gone = await wc.executeJavaScript(
        `document.querySelectorAll('.panel[data-panel-id=${JSON.stringify(subject)}]').length === 0`)

      ok('147 a move into a NEW workspace mints it, files the panel, and keeps the pid',
        // (a) the workspace exists NOW and did not before — trimmed, which is
        //     what fails if the submit passes `value` through untouched.
        !namesBefore.includes(MINTED) && minted !== undefined &&
          // (b) it actually holds the panel. A mint that filed nothing leaves
          //     an empty workspace and a panel stranded in the old one.
          minted.panelIds.includes(subject) &&
          // Non-vacuity: this canvas really did lose it. Without this, a move
          // that changed only main's record satisfies (b) while the renderer
          // goes on rendering a panel no workspace here owns.
          gone === true &&
          // (c) check 141's clause on the second branch, and the one that
          //     makes this more than a plumbing test: minting a workspace is
          //     no excuse to restart what gets filed into it.
          before.get(subject) !== undefined && after.get(subject) === before.get(subject) &&
          // (d) Escape minted nothing at all.
          !namesAfterCancel.includes(CANCELLED) &&
          !rowsAfter.some((w) => w.name === CANCELLED),
        `selected=${JSON.stringify(selected)} ` +
          `open=[${cancelOpened}, ${mintOpened}] submit=[${cancelSubmitted}, ${mintSubmitted}] ` +
          `${subject}: ${before.get(subject)} -> ${after.get(subject) ?? 'MISSING'} gone=${gone} ` +
          `minted=${minted ? minted.panelIds.join('|') : 'ABSENT'} ` +
          `cancelled=${rowsAfter.some((w) => w.name === CANCELLED)} ` +
          `names=${rowsAfter.map((w) => w.name).join(',')}`)
    }

    // ---------------------------------------------------------------------
    // 148-151 — M18. THE MERGED VIEW: every workspace at once, geometry
    //     read-only.
    //
    //     ONE fixture serves all four, and it is built rather than inherited
    //     for the reason check 138's block states: by this point the suite
    //     has created, filled and deleted several workspaces, and a check
    //     that depended on whatever 143 left active would assert about a
    //     canvas nobody chose.
    //
    //     The ACTIVE workspace here is deliberately EMPTY, and that is lane
    //     geometry rather than laziness. mergedLayout puts the active
    //     workspace's lane FIRST and gives an empty one LANE_MIN_WIDTH (800)
    //     plus LANE_GUTTER (400), so the foreign lane's leftmost panel always
    //     lands at world x = 1200 whatever the active workspace holds. An
    //     empty active lane is what makes the FOREIGN panels the only thing
    //     on the merged canvas, which is what lets check 144 position the
    //     camera over them precisely (see its own comment) instead of
    //     depending on a fit whose scale would be decided by check 39's
    //     never-woken panel parked at world 50000,50000 — a fit there lands
    //     far below LIVE_MIN_SCALE, where NOTHING is promoted and check 144
    //     would be green against every implementation including a broken one.
    // ---------------------------------------------------------------------
    {
      const MERGED_WS_ID = 'w40'
      const MERGED_WS_NAME = 'never merged'
      const FOREIGN_A = 'w40p1'
      const FOREIGN_B = 'w40p2'

      await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('mergehome')`)
      await settle()
      // THE CAMERA IS THE FIXTURE, and it is set BEFORE the view is entered.
      //
      // The defect check 144 exists to catch only spawns while dormantIds is
      // stale — a few milliseconds — so the foreign panels have to be inside
      // the cull region at the moment the merged array commits, or a broken
      // build promotes nothing and the check is green against it. An earlier
      // draft positioned the camera from INSIDE the view (enter, navigate by
      // rail row, leave, re-enter); that stopped working the moment leaving
      // began restoring the pre-merge camera, which is correct behaviour and
      // exactly why the positioning now happens out here where the restore
      // preserves it rather than undoing it.
      //
      // Cmd+0 puts the camera at INITIAL (x 120, y 120, scale 1) and three
      // zoom-out steps take it to 1/1.2³ = 0.579 — still above
      // LIVE_MIN_SCALE (0.5), where a broken build WOULD promote, and wide
      // enough that the foreign lane at world x 1200 is inside the
      // CULL_MARGIN-expanded viewport. Both halves matter: one step fewer and
      // the lane is outside the margin, one step more and the scale is below
      // the threshold where nothing is promoted at all. The `inCullRegion`
      // clause below is what makes that arithmetic self-checking rather than
      // a comment that can quietly stop being true.
      await zoomTo(wc, '0')
      await settle()
      for (let i = 0; i < 3; i++) await zoomTo(wc, '-')
      await settle()

      // The workspace under test is seeded ON DISK and never rendered by this
      // renderer, exactly the way check 68's w9 fixture is and for the same
      // reason: registry.ensure only ever runs against panels this canvas has
      // shown, so a workspace reached for the FIRST time is the only place
      // the mass-spawn bug can live. It cannot be seeded into the BOOT layout
      // the way w9 is, because check 71 deletes every other workspace on its
      // way to the only-workspace case — this injection has to happen after
      // that, which is why it is written here rather than beside LAYOUT_PATH.
      //
      // Its own persisted focusedId names FOREIGN_A, matching check 68's
      // fixture. Be honest about what that buys HERE, though: entering the
      // merged view deliberately does NOT restore any workspace's focusedId
      // (there is no workspace being switched to), so unlike check 68 this
      // field pins nothing on its own — the forcing is the camera placement
      // below. It stays because a future merged view that DID adopt a lane's
      // focus would spawn from this fixture rather than from a bug report.
      //
      // w40: nextWorkspaceId derives from the maximum existing `w<n>`, so a
      // number well above anything this run has minted cannot collide with a
      // workspace some earlier check created.
      flushLayoutStore()
      const onDisk124 = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
      // UNSHIFT, not push, and the position is load-bearing. mergedLayout
      // sorts the active workspace's lane first and keeps every other
      // workspace in INPUT ORDER, and each lane is as wide as its own
      // bounding box — so a lane appended last starts after the sum of every
      // preceding lane's width. Measured: check 39's never-woken panel is
      // parked at world 50000,50000 and check 84's at 60000,60000, both in
      // workspaces that precede this one, which put an appended fixture lane
      // at world x ≈ 70000 — far outside any camera this check can reach, and
      // therefore outside the cull region, where a BROKEN build promotes
      // nothing and check 144 is green against it. First among the non-active
      // workspaces puts it at LANE_MIN_WIDTH + LANE_GUTTER = 1200, which is
      // the number the camera fixture above is built against.
      onDisk124.workspaces.unshift({
        id: MERGED_WS_ID,
        name: MERGED_WS_NAME,
        // Small boxes, close together: the whole lane has to fit on screen at
        // scale 1 once the camera is centred on it, or the panels this check
        // is about are outside the cull region and nothing would be promoted
        // under a broken implementation either.
        panels: [
          { id: FOREIGN_A, x: 0, y: 0, w: 300, h: 200, z: 1, cwd: '/tmp', command: '/bin/cat', args: [] },
          { id: FOREIGN_B, x: 0, y: 240, w: 300, h: 200, z: 2, cwd: '/tmp', command: '/bin/cat', args: [] }
        ],
        camera: { ...DEFAULT_CAMERA },
        selectedId: FOREIGN_A,
        focusedId: FOREIGN_A
      })
      writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk124, null, 2), 'utf8')
      // layout:load and workspace:merged both answer from layoutStore's
      // in-memory snapshot, never a fresh disk read — without this the
      // injection above would be invisible to the renderer.
      layoutStore.load()

      /** Clicks the top bar's merged toggle. Returns false if it is absent. */
      const clickMerged = () => wc.executeJavaScript(`(() => {
        const b = document.querySelector('.shell__merge')
        if (!b) return false
        b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)

      /** One DOM read of everything the four checks below assert about. */
      const mergedDom = () => wc.executeJavaScript(`(() => {
        const panels = [...document.querySelectorAll('.panel[data-panel-id]')]
        return {
          on: document.querySelector('.shell__merge--on') !== null,
          ids: panels.map((e) => e.dataset.panelId),
          lanes: [...document.querySelectorAll('.merged-lane')].map((e) => ({
            id: e.dataset.laneId,
            name: (e.querySelector('.merged-lane__name') || {}).textContent || ''
          })),
          closes: document.querySelectorAll('.panel__close').length,
          resizes: document.querySelectorAll('.panel__resize').length,
          rects: Object.fromEntries(panels.map((e) => {
            const r = e.getBoundingClientRect()
            return [e.dataset.panelId, { x: Math.round(r.left), y: Math.round(r.top) }]
          }))
        }
      })()`)

      /** Every workspace's stored rects, keyed by workspace then panel id. */
      const storedRects = async () => {
        const rows = await wc.executeJavaScript(`window.canvas.workspace.merged()`)
        const out = {}
        for (const w of rows) {
          out[w.id] = {}
          for (const p of w.panels) out[w.id][p.id] = `${p.x},${p.y},${p.w},${p.h}`
        }
        return out
      }

      /**
       * Compares two storedRects() reads, and compares the panel-id SETS as
       * well as the rects of ids both reads share.
       *
       * The set half is not belt-and-braces, it is the half that catches the
       * failure this check is named for. A save effect written
       * `fromPanels(displayPanels)` would stuff every workspace's lane-offset
       * panels into the ACTIVE workspace's record while merged — every one of
       * them an ADDED id, none of them a changed rect for an id that was
       * already there — so a comparison that only walked the ids present
       * BEFORE would see nothing at all and report a canvas that had just
       * been corrupted as untouched.
       */
      const rectDrift = (before, after, when) => {
        const out = []
        for (const [wsId, was] of Object.entries(before)) {
          const now = after[wsId]
          if (!now) { out.push(`${when} ${wsId}: workspace gone`); continue }
          for (const [panelId, rect] of Object.entries(was)) {
            if (now[panelId] !== rect) {
              out.push(`${when} ${wsId}/${panelId}: ${rect} -> ${now[panelId] ?? 'MISSING'}`)
            }
          }
          for (const panelId of Object.keys(now)) {
            if (was[panelId] === undefined) out.push(`${when} ${wsId}/${panelId}: ADDED ${now[panelId]}`)
          }
        }
        for (const wsId of Object.keys(after)) {
          if (before[wsId] === undefined) out.push(`${when} ${wsId}: workspace ADDED`)
        }
        return out
      }

      const sessionsBefore = await settledSessionMap(wc, 4000)
      const storedBefore = await storedRects()

      const opened = await clickMerged()
      await settle()
      const entered = await mergedDom()

      // The forcing guard, and it is a CLAUSE rather than a diagnostic on
      // purpose: everything check 144 asserts is a NEGATIVE (nothing spawned),
      // and a negative is satisfied perfectly by a fixture that put the panels
      // somewhere nothing would ever be promoted from. This reproduces
      // assignTiers' own question in screen space — does the panel intersect
      // the canvas expanded by CULL_MARGIN_PX — so a future change to the
      // camera, the lane arithmetic or the window size turns the check RED
      // instead of quietly turning it into a check that cannot fail.
      const inCullRegion = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas')
        const p = document.querySelector('.panel[data-panel-id=${JSON.stringify(FOREIGN_A)}]')
        if (!host || !p) return null
        const M = 240 // CULL_MARGIN_PX
        const h = host.getBoundingClientRect(), r = p.getBoundingClientRect()
        return {
          hit: r.left < h.right + M && r.right > h.left - M &&
               r.top < h.bottom + M && r.bottom > h.top - M,
          scale: window.__m4aScale ? window.__m4aScale() : null,
          panel: { x: Math.round(r.left), y: Math.round(r.top) }
        }
      })()`)

      // Waits for the FAILURE condition rather than reading absence at once,
      // the rule check 68 states: a spawn is several IPC round trips deep, so
      // an instant read could pass because it was early rather than correct.
      const spawned = await waitUntil(async () => {
        const live = await sessionMap(wc)
        return live.has(FOREIGN_A) || live.has(FOREIGN_B)
      }, 3000)
      const sessionsAfter = await sessionMap(wc)
      // Scoped to the two ids this check is about — see the clause's own
      // comment below for why the whole-canvas count was not evidence.
      const foreignCount = (m) => [FOREIGN_A, FOREIGN_B].filter((id) => m.has(id)).length
      const foreignBefore = foreignCount(sessionsBefore)
      const foreignAfter = foreignCount(sessionsAfter)
      const registry124 = await wc.executeJavaScript(`window.__m4aSessions()`)
      const regA = registry124.find((s) => s.id === FOREIGN_A)
      const regB = registry124.find((s) => s.id === FOREIGN_B)

      // 148. ENTERING THE MERGED VIEW SPAWNS NOTHING. The milestone's most
      //      dangerous line: registry.ensure early-returns for a session that
      //      already exists, so a dormantIds correction arriving one render
      //      after the merged array can never repair a session created
      //      non-dormant — lod.ts promotes it because dormantIds does not yet
      //      contain it, the registry's own dormancy guard passes because
      //      session.dormant is already false, and attachSlot spawns. Up to
      //      LIVE_BUDGET agent CLIs, from a view toggle with no gesture.
      //
      //      The mass-spawn power is entirely in the ID-SCOPED clauses: the
      //      `spawned` waitUntil over FOREIGN_A/B, and regA/regB reading
      //      dormant:true spawned:false. Those are exactly what the ordering
      //      injection flips (dormant:false spawned:true), and check 145 is
      //      what stops all of it passing against a view that renders nothing.
      //
      //      The session count is scoped to THOSE TWO IDS and no longer to
      //      the whole canvas. A whole-canvas count measures sessions this
      //      check does not control: a spawn still in flight from an earlier
      //      check lands inside the 3s window and inflates it with the merged
      //      view entirely innocent — observed as `sessions 27 -> 28` with
      //      both foreign panels correctly `dormant:true spawned:false` — and
      //      its baseline is not stable between runs either (0, 26 and 27
      //      have all been seen), which is the tell. sessionsBefore is
      //      already a settledSessionMap(wc, 4000), so settling harder is not
      //      the fix. What the narrowing gives up is a spawn under some OTHER
      //      lane's panel id; that was never evidence here, because this
      //      check's own camera fixture deliberately puts every other lane
      //      far outside the cull region, where nothing is promoted under a
      //      broken build either.
      ok('148 entering the merged view spawns nothing',
        opened === true && spawned !== true &&
          // The forcing guard: without it every clause below is a negative a
          // badly-placed camera satisfies for free.
          inCullRegion !== null && inCullRegion.hit === true &&
          typeof inCullRegion.scale === 'number' && inCullRegion.scale >= 0.5 &&
          foreignAfter === foreignBefore &&
          regA !== undefined && regA.dormant === true && regA.spawned === false &&
          regB !== undefined && regB.dormant === true && regB.spawned === false,
        `opened=${opened} promotable=${JSON.stringify(inCullRegion)} spawned=${spawned} ` +
          `foreign sessions ${foreignBefore} -> ${foreignAfter} ` +
          `A=${JSON.stringify(regA)} B=${JSON.stringify(regB)}`)

      // 149. Foreign panels are RENDERED and addressable, and their lane says
      //      whose they are. Without this, 144 is green against a merged view
      //      that renders nothing at all — which is exactly what a toggle
      //      wired to nothing produces.
      ok('149 the merged view renders foreign panels under a named lane',
        entered.on === true &&
          entered.ids.includes(FOREIGN_A) && entered.ids.includes(FOREIGN_B) &&
          entered.lanes.some((l) => l.id === MERGED_WS_ID && l.name.includes(MERGED_WS_NAME)),
        `on=${entered.on} ids=${entered.ids.join(',')} lanes=${JSON.stringify(entered.lanes)}`)

      // 150. NOTHING IS DRAGGABLE. A real sendInputEvent drag on the foreign
      //      panel's chrome — the gesture that moves a panel everywhere else
      //      in this app — must leave it exactly where it was, and no close
      //      button may be rendered on any merged panel. A dispatched
      //      MouseEvent would not do: check 75c's rule, and this gesture is
      //      only a gesture because the browser tracks the button down.
      //
      //      Asserted on the SCREEN rect rather than the stored one, because
      //      a drag that moved the panel would move it visibly first; check
      //      147 is the stored half.
      const chrome126 = await wc.executeJavaScript(`(() => {
        const p = document.querySelector('.panel[data-panel-id=${JSON.stringify(FOREIGN_A)}]')
        if (!p) return null
        const r = p.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 8) }
      })()`)
      let dragged126 = null
      if (chrome126) {
        wc.sendInputEvent({ type: 'mouseDown', x: chrome126.x, y: chrome126.y, button: 'left', clickCount: 1 })
        for (let i = 1; i <= 4; i++) {
          wc.sendInputEvent({
            type: 'mouseMove',
            x: chrome126.x + i * 20,
            y: chrome126.y + i * 15,
            button: 'left',
            modifiers: ['leftButtonDown']
          })
        }
        wc.sendInputEvent({
          type: 'mouseUp', x: chrome126.x + 80, y: chrome126.y + 60, button: 'left', clickCount: 1
        })
        await settle()
        dragged126 = await mergedDom()
      }
      ok('150 a merged panel cannot be dragged, resized or closed',
        chrome126 !== null && dragged126 !== null &&
          dragged126.rects[FOREIGN_A] !== undefined &&
          entered.rects[FOREIGN_A] !== undefined &&
          dragged126.rects[FOREIGN_A].x === entered.rects[FOREIGN_A].x &&
          dragged126.rects[FOREIGN_A].y === entered.rects[FOREIGN_A].y &&
          dragged126.closes === 0 && dragged126.resizes === 0,
        `chrome=${JSON.stringify(chrome126)} ` +
          `before=${JSON.stringify(entered.rects[FOREIGN_A])} ` +
          `after=${dragged126 ? JSON.stringify(dragged126.rects[FOREIGN_A]) : 'null'} ` +
          `closes=${dragged126 && dragged126.closes} resizes=${dragged126 && dragged126.resizes}`)

      // 151. EVERY workspace's STORED rects are byte-identical after a merged
      //      session — enter, pan, select, leave. This is the check for the
      //      failure the read-only design exists to prevent: `panels` stays
      //      the active workspace's real array and remains the only thing the
      //      layout.save effect writes, so a lane-offset rect can never be
      //      un-offset wrongly into another workspace's record. That failure
      //      is a well-formed layout.json with wrong coordinates in it, found
      //      launches later with nothing to blame — so it is asserted over
      //      EVERY workspace, not only the one under test.
      const zoomedOut = await zoomTo(wc, '-')
      await settle()
      const selected127 = await wc.executeJavaScript(`(() => {
        const p = document.querySelector('.panel[data-panel-id=${JSON.stringify(FOREIGN_B)}]')
        if (!p) return false
        const chrome = p.querySelector('.panel__chrome')
        if (!chrome) return false
        chrome.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        return true
      })()`)
      await settle()
      // Read WHILE STILL MERGED, and this read is the one with teeth. Leaving
      // re-derives dormancy, restores the camera and issues a fresh save from
      // the true `panels` — so a record corrupted while merged is RESTORED on
      // the way out, and a check that only looked afterwards would watch the
      // damage be repaired and call it absence. The flush is what makes the
      // read describe main's own snapshot rather than a debounce window.
      flushLayoutStore()
      const storedDuring = await storedRects()
      await clickMerged() // leave
      await settle()
      // The save is coalesced at 500ms in main, so the write this check reads
      // back has to be forced rather than waited on — the same flush check 19
      // uses before reading layout.json.
      flushLayoutStore()
      const storedAfter = await storedRects()
      const drifted = [
        ...rectDrift(storedBefore, storedDuring, 'during'),
        ...rectDrift(storedBefore, storedAfter, 'after')
      ]
      const leftMerged = await mergedDom()
      ok('151 a merged session writes no rect into any workspace',
        drifted.length === 0 && leftMerged.on === false && leftMerged.lanes.length === 0,
        `zoomed=${zoomedOut} selected=${selected127} on=${leftMerged.on} ` +
          `lanes=${leftMerged.lanes.length} drifted=[${drifted.join('; ')}]`)
    }

    // ---------------------------------------------------------------------
    // 152-155 — M18. THE THREE CHORDS: Cmd+Shift+[ / Cmd+Shift+] step the
    //     workspace, Cmd+Shift+A toggles the merged view.
    //
    //     Every chord here is DELIVERED THE WAY macOS DELIVERS IT: Shift
    //     rewrites the printed character, so Cmd+Shift+] arrives carrying
    //     key '}' and code 'BracketRight'. Both fields are supplied — the
    //     established shape for a chord check in this suite, and check 80's
    //     precedent — so a handler matching on `key === ']'` is dead on
    //     arrival while one matching on `key === '}'` is correct on a US
    //     layout and wrong everywhere else. Check 148's own note says what
    //     that costs it.
    //
    //     They run last and inherit the merged block's fixture: 'mergehome'
    //     is active, w40 exists on disk, and the merged view is off. 148
    //     parks the canvas on the LAST row deliberately and leaves it on the
    //     first; 149 puts it back where 148 left it, and 150 moves no
    //     workspace at all — so those two leave the active workspace where
    //     they found it. 151 does NOT, and nothing follows it.
    // ---------------------------------------------------------------------
    {
      /**
       * One chord press. `repeat` is supplied BY HAND — see check 149 for
       * what that does and does not prove.
       */
      const chord = (code, key, repeat = false) => wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', {` +
        ` key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)},` +
        ` metaKey: true, shiftKey: true, repeat: ${repeat}, bubbles: true })), true`)
      const NEXT = () => chord('BracketRight', '}')
      const PREV = () => chord('BracketLeft', '{')
      const MERGE = () => chord('KeyA', 'A')

      const wsRows = () => wc.executeJavaScript(`window.canvas.workspace.list()`)
      const activeId = async () => {
        const rows = await wsRows()
        const row = rows.find((w) => w.active)
        return row ? row.id : null
      }
      /** The class the top bar's merged toggle carries while the view is on. */
      const mergedOn = () => wc.executeJavaScript(
        `document.querySelector('.shell__merge--on') !== null`)
      /** One workspace's STORED camera, forced past main's 500ms coalescing. */
      const cameraOf = (wsId) => {
        flushLayoutStore()
        const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const w = (disk.workspaces || []).find((x) => x.id === wsId)
        return w && w.camera ? w.camera : null
      }
      const sameCamera = (a, b) =>
        a !== null && a !== undefined && b !== null && b !== undefined &&
        Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 &&
        Math.abs(a.scale - b.scale) < 0.001

      const rows128 = await wsRows()
      const ids128 = rows128.map((w) => w.id)
      const first128 = ids128[0]
      const last128 = ids128[ids128.length - 1]

      // 152. Cmd+Shift+] switches to the NEXT workspace and Cmd+Shift+[ comes
      //      back, WRAPPING. The wrap is not left to whatever this run
      //      happens to have made active: the canvas is parked on the LAST
      //      row first, so the forward press wraps by construction and the
      //      backward press wraps straight back — two presses, both of them
      //      the case a naive `rows[at + delta]` returns undefined for.
      //
      //      THE THIRD PRESS IS THE ONE THAT HOLDS THE `code` RULE, and it is
      //      worth knowing why it exists. Two presses catch a `key === ']'`
      //      implementation, which is dead on arrival — no such key is ever
      //      delivered under Shift — and catch NOTHING about a `key === '}'`
      //      one, which is right on the US layout the first two presses are
      //      modelled on and silently wrong on every layout that prints '}'
      //      somewhere else. That second bug is the WORSE of the two, because
      //      it works for whoever wrote it.
      //
      //      An earlier draft of this check concluded the gap was unclosable —
      //      "the layout lives below the DOM" — and that reasoning was wrong
      //      in this suite's favour. THE HARNESS CONSTRUCTS THE EVENT, so it
      //      can hand over any `key` it likes: a German layout delivers the
      //      physical BracketRight key as '*', so one press of
      //      { key: '*', code: 'BracketRight' } is exactly as synthetic as
      //      the two above and turns a `key === '}'` implementation RED while
      //      leaving a `code`-matching one green. Measured both ways — see the
      //      task report. Do not delete it as a duplicate of the first press:
      //      it is the only assertion here that any `key`-based match fails.
      let stepped128 = null
      let back128 = null
      let foreign128 = null
      if (ids128.length >= 2) {
        await wc.executeJavaScript(
          `window.__m7aWorkspace().switchTo(${JSON.stringify(last128)})`)
        await settle()
        const parked = await activeId()
        await NEXT()
        await waitUntil(async () => (await activeId()) === first128, 2500)
        stepped128 = await activeId()
        await PREV()
        await waitUntil(async () => (await activeId()) === last128, 2500)
        back128 = await activeId()
        // The same physical key a German keyboard prints as '*'. It has to
        // wrap forward again from `last128`, which is where the PREV above
        // has just put the canvas, so this clause asserts the same movement
        // the first press did and separates a different implementation.
        await chord('BracketRight', '*')
        await waitUntil(async () => (await activeId()) === first128, 2500)
        foreign128 = await activeId()
        // Non-vacuity: starting anywhere but the last row would make this a
        // plain step wearing a wrap's name.
        if (parked !== last128) stepped128 = `PARKED ${parked}`
      }
      ok('152 the workspace chords step forward and back, wrapping',
        ids128.length >= 2 && stepped128 === first128 && back128 === last128 &&
          foreign128 === first128,
        `n=${ids128.length} ids=${ids128.join(',')} last=${last128} ` +
          `next=${stepped128} prev=${back128} foreignLayout=${foreign128}`)

      // 153. HELD, they move exactly ONE step. Neither chord joins
      //      REPEATABLE_KEYS: a held switch steps through every canvas at the
      //      OS repeat rate and lands wherever the stream happened to stop
      //      rather than where the user meant to look — the argument Cmd+J
      //      already carries.
      //
      //      Like checks 7b, 33b and 75b it supplies `repeat: true` BY HAND,
      //      so it proves the guard READS the flag and says NOTHING about who
      //      SETS it: whether macOS marks a physically held Cmd-modified key
      //      as a repeat is checked by a hand on the keyboard, not here.
      //
      //      The repeats are SPACED rather than fired as one burst, and that
      //      is what makes the count mean anything. stepWorkspace reads the
      //      ACTIVE row, so a burst delivered before the first switch lands
      //      would have every press compute the same destination — six steps
      //      and one step would be indistinguishable and the check green
      //      against an implementation with no repeat bail at all.
      //
      //      The number of presses is DERIVED for the neighbouring reason:
      //      with P presses a bail-less implementation lands P steps along,
      //      and P % n === 1 puts it exactly where a correct one lands. The
      //      first P that cannot collide with this fixture's workspace count
      //      is the one used.
      let held129 = null
      let presses129 = 0
      if (ids128.length >= 2) {
        const n = ids128.length
        presses129 = [6, 7, 8].find((p) => p % n !== 1 % n)
        const from = await activeId()
        const at = ids128.indexOf(from)
        await NEXT()
        for (let i = 1; i < presses129; i++) {
          await sleep(200)
          await chord('BracketRight', '}', true)
        }
        const expected = ids128[(at + 1) % n]
        await waitUntil(async () => (await activeId()) === expected, 2500)
        await settle()
        held129 = { at: from, now: await activeId(), expected }
        // Put the fixture back where 148 left it, so 150 and 151 start from a
        // known workspace rather than wherever a failure landed.
        await wc.executeJavaScript(
          `window.__m7aWorkspace().switchTo(${JSON.stringify(from)})`)
        await settle()
      }
      ok('153 a held workspace chord moves exactly one step',
        held129 !== null && held129.now === held129.expected,
        `presses=${presses129} ` +
          (held129
            ? `${held129.at} -> ${held129.now} (expected ${held129.expected})`
            : 'SKIPPED'))

      // 154. Cmd+Shift+A toggles the merged view, and pressing it twice
      //      returns to the active workspace's own canvas WITH ITS CAMERA
      //      RESTORED. The camera clause is not decoration: a merged camera
      //      is in LANE SPACE, so leaving without the restore drops the user
      //      in front of empty space with nothing on screen explaining why.
      //      The pan happens WHILE MERGED — without it the restore is
      //      asserted against a camera that never moved, which an
      //      implementation restoring nothing satisfies for free.
      await zoomTo(wc, '0')
      await settle()
      const camera130 = await wc.executeJavaScript(`window.__m4aViewport()`)
      await MERGE()
      await settle()
      const on130 = await mergedOn()
      await zoomTo(wc, '-')
      await zoomTo(wc, '-')
      await settle()
      const laneCamera130 = await wc.executeJavaScript(`window.__m4aViewport()`)
      await MERGE()
      await settle()
      const off130 = await mergedOn()
      const restored130 = await wc.executeJavaScript(`window.__m4aViewport()`)
      ok('154 the merged chord enters the merged view and leaves it, camera restored',
        on130 === true && off130 === false &&
          !sameCamera(laneCamera130, camera130) &&
          sameCamera(restored130, camera130),
        `on=${on130} off=${off130} before=${JSON.stringify(camera130)} ` +
          `lane=${JSON.stringify(laneCamera130)} after=${JSON.stringify(restored130)}`)

      // 155. A SWITCH WHILE MERGED LEAVES THE MERGED VIEW FIRST. This is the
      //      chords' own hazard: before them, switching from inside the
      //      merged view needed a rail click or a palette row; now it is one
      //      keystroke.
      //
      //      Both halves of the corruption are asserted, because each is
      //      silent on its own and each has its own fix. The OUTGOING
      //      workspace's record must keep its PRE-MERGE camera rather than
      //      the lane-space one the user panned to — otherwise it is a
      //      well-formed layout.json full of coordinates that mean nothing
      //      outside the lane arrangement they came from. And the canvas must
      //      end on the INCOMING workspace's OWN stored camera, which is what
      //      says preMergeRef did not survive pointing at a workspace that is
      //      no longer active: a surviving snapshot is written into the
      //      incoming record by every save after the switch, and restored
      //      over the switch's own camera the next time the view is left.
      const outgoing131 = await activeId()
      // The pre-merge camera is deliberately moved OFF the incoming
      // workspace's own stored one. Cmd+0 alone put both at INITIAL, and the
      // last clause below then could not tell "landed on the incoming
      // workspace's camera" from "kept the outgoing one's pre-merge camera"
      // — the exact defect it exists to catch. Two zoom steps make the three
      // cameras this check compares three distinct values, which the
      // non-vacuity clause holds it to.
      await zoomTo(wc, '0')
      await zoomTo(wc, '-')
      await zoomTo(wc, '-')
      await settle()
      const preMerge131 = await wc.executeJavaScript(`window.__m4aViewport()`)
      await MERGE()
      await settle()
      const merged131 = await mergedOn()
      await zoomTo(wc, '-')
      await zoomTo(wc, '-')
      await zoomTo(wc, '-')
      await settle()
      const laneCamera131 = await wc.executeJavaScript(`window.__m4aViewport()`)
      const expected131 = ids128[(ids128.indexOf(outgoing131) + 1) % ids128.length]
      const incomingCamera131 = cameraOf(expected131)
      await NEXT()
      await waitUntil(async () => (await activeId()) === expected131, 2500)
      await settle()
      const landed131 = await activeId()
      const stillMerged131 = await mergedOn()
      const camera131 = await wc.executeJavaScript(`window.__m4aViewport()`)
      const outgoingStored131 = cameraOf(outgoing131)
      ok('155 a switch while merged leaves the merged view and writes no lane camera',
        merged131 === true && stillMerged131 === false &&
          landed131 === expected131 &&
          // Non-vacuity, twice, and check 150 already carries the second of
          // them. The two cameras the last clause separates must actually
          // differ, or it separates nothing. And the LANE camera must differ
          // from the pre-merge one, or `sameCamera(outgoingStored, preMerge)`
          // is satisfied by an implementation that wrote the lane camera —
          // which is the corruption this whole check exists for. If the zooms
          // above ever stop moving the camera (a clamp, or a merged entry
          // that refits), this goes RED rather than quietly passing.
          !sameCamera(preMerge131, incomingCamera131) &&
          !sameCamera(laneCamera131, preMerge131) &&
          sameCamera(outgoingStored131, preMerge131) &&
          sameCamera(camera131, incomingCamera131),
        `merged=${merged131} -> ${stillMerged131} ${outgoing131} -> ${landed131} ` +
          `(expected ${expected131}) preMerge=${JSON.stringify(preMerge131)} ` +
          `lane=${JSON.stringify(laneCamera131)} ` +
          `outgoingStored=${JSON.stringify(outgoingStored131)} ` +
          `incomingStored=${JSON.stringify(incomingCamera131)} ` +
          `camera=${JSON.stringify(camera131)}`)
    }

    // ---------------------------------------------------------------------
    // Hand the canvas back with a FREE LIVE BUDGET. Not a check — a cleanup,
    // and it exists because leaving it out broke somebody else's checks.
    //
    // This block ends with the camera parked over a workspace holding a
    // dozen panels, and framing them promotes them: measured, it left the
    // canvas at exactly LIVE_BUDGET (8 live xterms). Under lazy spawn a
    // panel that cannot promote never spawns a PTY at all, so the NEXT
    // block's fixture panel — M15's subagent fan-out, which needs its
    // subject live long enough for the watcher to claim its session — came
    // up carded and its nodes never rendered. 131/132/133 all went red
    // reporting an empty fixture (`states=`, `nodes=0`, `parent=null`),
    // pointing nowhere near the block that actually caused it.
    //
    // Measured both ways: main alone is 157/157 with subjectLive=true and 5
    // live xterms at that point; this branch merged, without this cleanup,
    // is 168/171 with subjectLive=false and 8. The budget is the whole
    // difference.
    //
    // A fresh EMPTY workspace rather than a camera pan: switching demotes
    // without disposing (the "demote, not dispose" rule every workspace
    // switch already obeys), so every session this suite still needs stays
    // alive and reattachable, while nothing is left on screen to hold a
    // slot. A pan would work too and is worse — it depends on
    // DEMOTE_DELAY_MS having elapsed, which is a race a later edit can lose
    // silently.
    //
    // The standing obligation this block inherited from check 147 — "leaves
    // the active workspace MOVED, and whoever appends the next check
    // inherits that" — is DISCHARGED here rather than passed on: the next
    // author gets an empty canvas and a spent budget freed, not a puzzle.
    // ---------------------------------------------------------------------
    await wc.executeJavaScript(
      `window.__m7aWorkspace().createAndSwitch('after workspace extras')`)
    await settle()


    // 130. The whole boundary in one window: a token entered through the
    //      REAL palette input mode is stored and listed back, and is NOT
    //      readable through any member of the bridge. Both halves are
    //      required — the negative alone passes before the feature exists,
    //      which is the vacuity trap this suite already records for checks
    //      111/111b.
    //
    //      Deliberately OUTSIDE the GIT_OK gate above, even though it sits
    //      right after it: this check touches no git at all, only the
    //      palette and the credential store, so gating it behind a git
    //      probe would silently drop the one check that proves M14's whole
    //      boundary claim on any machine with no git binary — the SKIP line
    //      above names 99-101, 113-115 and 116-117 precisely because each of
    //      those genuinely needs git (or, for 116-117, reuses that block's
    //      spawnAt/sessionMap helpers); this check needs neither and must
    //      run unconditionally, the same "skipped LOUDLY, never silently"
    //      rule CLAUDE.md states for verify:review 61-63 and the
    //      verify:pty-manager tmux block — which cuts the other way here,
    //      since the correct fix for a check with no such dependency is not
    //      to skip it loudly but to not gate it at all.
    {
      await zoomTo(wc, 'k')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)

      // Probed BEFORE the palette flow below ever stores anything.
      // verifyCredential's very FIRST guard (credential-verify.ts) is
      //   const token = deps.store.read(service)
      //   if (token === undefined) return { ok: false, reason: 'no stored credential to verify' }
      // which returns before the fetcher is ever constructed or called — so
      // calling verify() here, while the store is still empty, reaches a
      // real refusal payload with ZERO network traffic. This is deliberate
      // ordering, not a mock: `npm run verify` is this repo's single
      // green-or-not signal and CLAUDE.md requires it stay "fast and
      // offline" (the stated reason verify:packaged is kept out of the
      // default chain) — a live request to api.github.com would make a
      // green run depend on a resource this repo does not own, the same
      // rule as "the verify suites must never touch the production socket"
      // one layer out. Calling verify() AFTER the token is stored would
      // route past this guard and into a real HTTPS request, so order is
      // everything here.
      const preVerify = await wc.executeJavaScript(`(async () => {
        const res = await window.canvas.credential.verify('github')
        return { res, str: JSON.stringify(res) }
      })()`)

      // React's controlled <input> ignores a plain input.value = x — the
      // native setter plus a dispatched 'input' is what makes the change
      // reach React's state, the same nativeSet dance checks 38/45/60 use.
      const entry = await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, v)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        // The row is hiddenAtRest (commands.ts's buildCredentialRows), so
        // it only appears once a query surfaces it.
        nativeSet(document.querySelector('.palette__input'), 'add github token')
        await new Promise((r) => setTimeout(r, 50))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((el) => el.textContent.includes('Add GitHub token'))
        if (!row) return { error: 'no add-github-token row' }
        if (row.className.includes('palette__row--disabled')) return { error: 'row was disabled' }
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        // Still an input, and now in secret input mode: beginSetCredential
        // reopens the palette into inputMode rather than leaving it shut.
        const input2 = document.querySelector('.palette__input')
        if (!input2) return { error: 'palette closed instead of entering secret mode' }
        // The masking claim, captured here because it is cheap here and
        // checkable nowhere else — Palette.tsx renders type="password"
        // ONLY for InputMode.kind === 'secret'.
        const masked = input2.type
        nativeSet(input2, 'ghp_e2e_token_value')
        input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await new Promise((r) => setTimeout(r, 200))
        return { masked }
      })()`)
      await settle()

      const probe = await wc.executeJavaScript(`(async () => {
        const list = await window.canvas.credential.list()
        const keys = list.length ? Object.keys(list[0]) : []
        // Every bridge member, walked: none may hand back the token.
        const serialised = JSON.stringify(list)

        // list()'s payload is not the only leak path: set() also RESOLVES to
        // a value of its own, and it is not probed above. Called again here
        // — idempotent, the service is already stored from the palette flow
        // above — so its resolved value is directly in hand rather than
        // merely assumed from the UI call that ran it the first time.
        // (verify()'s resolved value is probed separately, BEFORE this
        // block runs, back when the store was still empty — see preVerify
        // above and its comment for why the ordering matters.)
        const setResult = await window.canvas.credential.set({ service: 'github', token: 'ghp_e2e_token_value' })
        const setStr = JSON.stringify(setResult)
        const carriesToken = (obj, str) =>
          str.includes('ghp_e2e_token_value') ||
          Object.keys(obj || {}).some((k) => k === 'cipher' || k === 'token')

        return {
          stored: list.some((m) => m.service === 'github'),
          leaked: serialised.includes('ghp_e2e_token_value') ||
                  keys.includes('cipher') || keys.includes('token'),
          hasGet: typeof window.canvas.credential.get === 'function',
          setLeaked: carriesToken(setResult, setStr)
        }
      })()`)

      // preVerify's refusal reason is asserted by NAME, not merely by
      // ok === false: this is the cheapest available proof that the call
      // took the early-return path rather than a real network round trip —
      // any answer FROM GitHub (a 401 rejection, or the generic "the
      // request to GitHub failed" a genuine network error produces) would
      // read as a DIFFERENT reason string, so this clause would catch a
      // future edit that reordered the flow and let this leak back onto
      // the network.
      const preVerifyRefused = preVerify.res && preVerify.res.ok === false &&
        /no stored credential/i.test(preVerify.res.reason || '')
      const preVerifyLeaked = preVerify.str.includes('ghp_e2e_token_value') ||
        Object.keys(preVerify.res || {}).some((k) => k === 'cipher' || k === 'token')

      ok(130, entry.masked === 'password' && probe.stored === true &&
          probe.leaked === false && probe.hasGet === false &&
          probe.setLeaked === false && preVerifyRefused === true && preVerifyLeaked === false,
        `entry=${JSON.stringify(entry)} stored=${probe.stored} leaked=${probe.leaked} ` +
        `hasGet=${probe.hasGet} setLeaked=${probe.setLeaked} ` +
        `preVerify=${JSON.stringify(preVerify.res)}`)
    }

    // Check 130 is the first thing that ever writes through
    // panels-entry.cjs's credential store, so this is the first run where
    // this directory holds anything worth removing — a trivially
    // reversible 'enc:' + token fixture otherwise left in $TMPDIR forever.
    // Unlike crepo/repo/notRepo above, this one runs UNCONDITIONALLY — the
    // directory is minted at module load in panels-entry.cjs regardless of
    // GIT_OK, since check 130 itself needs no git binary and must not be
    // skipped on a machine without one (see the check's own comment).
    // Same best-effort shape as those three: a failure here must never turn
    // a green suite red.
    try { rmSync(credentialDir, { recursive: true, force: true }) } catch { /* best effort */ }


    // ---------------------------------------------------------------------
    // M15, checks 131-133. One fixture serves all three: a fake ~/.claude
    // projects root, fenced in panels-entry.cjs (never homedir(), and set
    // BEFORE the PtyManager above was constructed — see that file's own
    // comment) so this suite can never read the running developer's real
    // transcripts, seeded with one session directory holding two subagents —
    // one still running, one already completed by a tool_result in the
    // parent transcript, so 118 can assert the two STATES rather than only a
    // count.
    //
    // Deliberately OUTSIDE the GIT_OK-gated block above: subagent detection
    // is filesystem-only and needs no git binary, so gating it the same way
    // would skip real coverage on a machine that has git but transiently
    // fails the version probe, for no reason connected to this feature.

    {
      // The already-fenced root. process.env.TC_CLAUDE_PROJECTS was set at
      // module load in panels-entry.cjs — long before the PtyManager above
      // was constructed — and resolveProjectsRoot() reads it exactly once,
      // inside that constructor's own field initializer, baking the value in
      // for the rest of this run. A fresh mkdtempSync here would create a
      // directory the already-built SubagentWatch can never see: this is
      // the trap the task brief names explicitly, one door further in than
      // the post-spawn ordering trap below. Reusing this value is what makes
      // the fixture below visible to the watcher at all.
      const SA_ROOT = process.env.TC_CLAUDE_PROJECTS

      // The panel whose subagents these are, spawned at a cwd minted just
      // for this block so its slug cannot collide with any of the dozens of
      // panels already open elsewhere in this long-running suite. Through
      // the SAME PRESET_SPAWN event checks 99-101 use above — copied rather
      // than reused, because their own `spawnAt` is declared inside the
      // GIT_OK block and out of reach down here.
      const saCwd = mkdtempSync(join(tmpdir(), 'tc sa cwd '))
      const spawnFixturePanel = async (cwd) => {
        const before = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd, command: '/bin/sh', args: [], w: 400, h: 300 })
        const ids = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.length > before.size ? now : false
        }, 3000)
        return ids ? ids.find((id) => !before.has(id)) : undefined
      }

      const xtermsBefore = await liveCount(wc)
      const saPanelId = await spawnFixturePanel(saCwd)

      // THE TRAP the task brief names by name: chooseSession (subagent-
      // scan.ts) only accepts a session directory created ON OR AFTER the
      // panel's own spawnedAt — the post-spawn filter that stops a shell in
      // a directory somebody used yesterday from adopting a stranger's
      // session. spawnedAt is stamped inside PtyManager.create(), which is
      // exactly what waiting on sessionMap confirms has already run, so the
      // directory created only AFTER this resolves is guaranteed to postdate
      // it. Creating the directory before the spawn (or before confirming it
      // landed) makes the claim silently never happen: the failure then
      // surfaces as 118 timing out on nodeCount, which reads exactly like a
      // broken renderer and points nowhere near the real cause — the same
      // race checks 99 and 101 already guard against for captureBaseline.
      if (saPanelId) await waitUntil(async () => (await sessionMap(wc)).has(saPanelId), 8000)

      // The BEFORE half of check 119's real registry clause, captured here
      // rather than any later point: the subject panel's own session
      // already exists (the wait above just confirmed it), and no subagent
      // fixture file exists yet — seedSession runs below — so no node can
      // possibly have rendered. Whatever __m4aSessions().length reads here
      // is the count check 119 must still see once the nodes exist.
      const sessionsBeforeNodes = await wc.executeJavaScript(
        `(window.__m4aSessions ? window.__m4aSessions() : []).length`)

      // Seeds one session directory plus its parent transcript under a given
      // slug. Called for BOTH spellings of saCwd below — see that call's own
      // comment for why one alone is not enough.
      const seedSession = (cwdForSlug) => {
        const slug = cwdForSlug.replace(/[^A-Za-z0-9]/g, '-')
        const sessionDir = join(SA_ROOT, slug, 'S1')
        mkdirSync(join(sessionDir, 'subagents'), { recursive: true })
        const meta = (t, d) => JSON.stringify({
          agentType: 'general-purpose', description: d, toolUseId: t, spawnDepth: 1, model: 'sonnet'
        })
        writeFileSync(join(sessionDir, 'subagents', 'agent-a1.meta.json'), meta('toolu_01A', 'still going'))
        writeFileSync(join(sessionDir, 'subagents', 'agent-a2.meta.json'), meta('toolu_01B', 'already done'))
        // The parent transcript. Its FIRST line is the confirmation read —
        // cwdOf must find our cwd here or the session is not claimed at all
        // — and the second line is what completes a2 while a1 stays running.
        writeFileSync(join(SA_ROOT, slug, 'S1.jsonl'),
          JSON.stringify({ type: 'user', cwd: cwdForSlug, sessionId: 'S1' }) + '\n' +
          JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_01B' }] } }) + '\n')
      }
      // Two spellings, the standing rule this suite's git fence and prompt
      // fence already carry: macOS tmpdir() answers /var/folders/… while a
      // REAL live cwd — tmux's own pane_current_path, live only if checks
      // 116-117 above found tmux and swapped `backend` onto it — answers the
      // resolved /private/var/folders/…, and the DIRECT backend by contrast
      // never resolves the spawn cwd at all (pollLive's liveCwd map is empty
      // by contract there, so PanelSpec.cwd — our literal saCwd — flows
      // straight through to subagentWatch.poll unresolved). Seeding only one
      // spelling makes this check's result depend on which backend happens
      // to be active on the machine running it, for a reason that has
      // nothing to do with the scanner under test.
      const realSaCwd = realpathSync(saCwd)
      seedSession(saCwd)
      if (realSaCwd !== saCwd) seedSession(realSaCwd)

      // 118. WAITS on a live tick rather than sleeping: a fixed sleep against
      // a 2s poll is a flake, not a bound. This is the first thing to
      // exercise the watcher, the one canvas-wide subscription and the store
      // TOGETHER — verify:subagent proves the scanner and says nothing about
      // the wiring between it and a painted node.
      const appeared = await waitUntil(async () => (await nodeCount(wc)) >= 2, 12000, 250)
      const states = await wc.executeJavaScript(`
        Array.from(document.querySelectorAll('[data-subagent-id]'))
          .map((n) => n.getAttribute('data-subagent-state')).sort().join(',')
      `)
      // Both STATES, not just a count: a layer that rendered every record as
      // running would satisfy a count perfectly, and "done" is half the
      // feature.
      ok('131 a seeded subagents/ dir paints one node per subagent, with its real state',
        appeared && states === 'done,running', `states=${states}`)

      // 119. The check the milestone's central claim rests on. Two
      // INDEPENDENT clauses, not one restated two ways — a review found the
      // first draft's comment overclaimed what the second one actually
      // proves, and this is the corrected pair.
      //
      // heldByRegistry tests whether a subagent record's own id
      // (`agent-a1`, derived from a `.meta.json` filename) collides with a
      // PanelId key in __m4aSessions(). Those are DISJOINT namespaces BY
      // DESIGN — nothing threads a record id into registry.ensure(), and
      // SubagentLayer's own architecture comment says so — so this clause
      // can only ever go red for ONE narrow regression: literally reusing a
      // record id as a panel id. It does NOT establish "no node holds a
      // PanelSession" the way it looks like it does, and the way the
      // identically-shaped clause genuinely does for a review node in check
      // 103 — a review node's id IS a PanelId, minted from the very same
      // `nextIdRef` counter every terminal panel's is (see "Panel ids are
      // one sequence with two prefixes" in CLAUDE.md). A subagent record's
      // id is never minted from that counter at all, so the two checks only
      // LOOK alike.
      //
      // sessionsAfterNodes is the clause that actually proves the claim:
      // the registry's session COUNT, unchanged across the whole fan-out.
      // sessionsBeforeNodes (captured above, before any subagent fixture
      // file existed) already includes the subject panel's own session, so
      // that session cancels out of the comparison — what is left is
      // "the nodes arrived and minted nothing", independent of what a node
      // might be keyed by. This is the clause a future regression that gave
      // subagent nodes their own PanelSession would actually trip.
      //
      // Kept both: heldByRegistry is cheap and still catches the id-reuse
      // case it always could; sessionsAfterNodes is what earns the "no
      // PanelSession" wording in the ok() title below.
      const nodeIds = await wc.executeJavaScript(`
        Array.from(document.querySelectorAll('[data-subagent-id]'))
          .map((n) => n.getAttribute('data-subagent-id'))
      `)
      // __m4aSessions() answers an ARRAY of {id, dormant, spawned} — not a
      // Set/Map — the same shape check 103 already reads for the identical
      // question about a review node's id.
      const heldByRegistry = await wc.executeJavaScript(
        `(() => {
           const ids = new Set((window.__m4aSessions ? window.__m4aSessions() : []).map((s) => s.id))
           return (${JSON.stringify(nodeIds)}).some((id) => ids.has(id))
         })()`
      )
      const sessionsAfterNodes = await wc.executeJavaScript(
        `(window.__m4aSessions ? window.__m4aSessions() : []).length`)
      const xtermsAfter = await liveCount(wc)
      // NOT a bare "+1". By this point roughly 117 checks' worth of panels
      // have spawned across this suite and LIVE_BUDGET (8) is a real
      // constraint none of the earlier fixtures clear away, so whether THIS
      // panel wins a live slot is genuinely undetermined rather than
      // assumed. The check's real substance survives that uncertainty
      // unchanged: whatever the subject panel's own liveness turns out to
      // be, the fan-out itself must explain nothing beyond it — no node may
      // cost some OTHER panel its terminal, and no node may mint one of its
      // own. subjectLive is read from the same sessionMap 99-101 already
      // trust for "is this panel's PTY up".
      const subjectLive = saPanelId ? (await sessionMap(wc)).has(saPanelId) : false
      const expectedXterms = xtermsBefore + (subjectLive ? 1 : 0)
      // nodeIds.length > 0 is the non-vacuity guard: without it, a feature
      // that silently rendered NO nodes at all would satisfy every other
      // clause here (an empty array collides with nothing, the session
      // count is trivially unchanged, and the xterm delta is explained by
      // the subject panel alone) — checks 102/103 carry the identical guard
      // for a review node, and 119 should not have to lean on 118 next door
      // to mean anything on its own.
      ok('132 no node holds a PanelSession — the session count is unchanged by the fan-out — and the live xterm count moves only by the subject panel\'s own liveness',
        nodeIds.length > 0 && heldByRegistry === false &&
          sessionsAfterNodes === sessionsBeforeNodes && xtermsAfter === expectedXterms,
        `nodes=${nodeIds.length} held=${heldByRegistry} sessions ${sessionsBeforeNodes} -> ${sessionsAfterNodes} ` +
        `xterms before=${xtermsBefore} after=${xtermsAfter} subjectLive=${subjectLive}`)
      // +0 or +1, never anything else: a bare inequality against `before`
      // would also pass against an implementation that quietly demoted one
      // panel to promote another while adding a node's worth of nothing —
      // two changes cancelling out. Pinning the exact expected value, backed
      // by an independent read of the one thing that's allowed to move it,
      // is what a bare "unchanged or +1" cannot rule out.

      // 120. The node follows a dragged parent. The failure it guards is a
      // node placed against a stale rect — it detaches and floats — and it
      // is invisible until something moves, because a node placed once at
      // mount looks entirely correct. Dragged through the panel's own
      // chrome, the same route check 9 uses, rather than by moving the
      // camera: a camera move would translate the whole .world and pass
      // against a node welded to the wrong panel.
      //
      // The parent panel id is read back OUT OF THE DOM — a node's own
      // data-panel-id attribute — rather than assumed to be saPanelId: the
      // two happen to agree here, but the DOM is the fact a real drag has to
      // act on, and the brief's own note ("read it back out of the DOM
      // rather than assuming it") is asking for exactly this.
      const domParentId = nodeIds.length > 0 ? await wc.executeJavaScript(`(() => {
        const n = document.querySelector('[data-subagent-id="' + ${JSON.stringify(nodeIds[0])} + '"]')
        return n ? n.getAttribute('data-panel-id') : null
      })()`) : null

      const beforeBox = nodeIds.length > 0 ? await nodeBox(wc, nodeIds[0]) : null
      let afterBox = null
      if (domParentId) {
        await wc.executeJavaScript(`(() => {
          const panel = document.querySelector('[data-panel-id="' + ${JSON.stringify(domParentId)} + '"] .panel__chrome')
          if (!panel) return false
          const r = panel.getBoundingClientRect()
          const opts = { bubbles: true, button: 0, buttons: 1,
            clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
          panel.dispatchEvent(new MouseEvent('mousedown', opts))
          document.dispatchEvent(new MouseEvent('mousemove', { ...opts, clientX: opts.clientX + 120 }))
          document.dispatchEvent(new MouseEvent('mouseup', { ...opts, clientX: opts.clientX + 120, buttons: 0 }))
          return true
        })()`)
        await settle()
        afterBox = await nodeBox(wc, nodeIds[0])
      }
      ok('133 a node follows its parent through a drag',
        domParentId !== null && beforeBox !== null && afterBox !== null &&
          Math.abs(afterBox.x - beforeBox.x - 120) < 4,
        `parent=${domParentId} before=${JSON.stringify(beforeBox)} after=${JSON.stringify(afterBox)}`)

      // Best-effort, the rule every other fixture root in this file
      // already follows (`repo`, `notRepo`, `crepo` above are all
      // explicitly rmSync'd): a failure to clean up must never turn a
      // green suite red. SA_ROOT is removed WHOLESALE rather than only its
      // two slug subdirectories — this is the last block in the run to
      // touch it, so there is nothing left for the watcher to poll against
      // it for, and leaving it behind would be a fixture directory this
      // suite minted and never removed, the exact thing this comment exists
      // to call out for the peers beside it.
      try { rmSync(SA_ROOT, { recursive: true, force: true }) } catch { /* best effort */ }
      try { rmSync(saCwd, { recursive: true, force: true }) } catch { /* best effort */ }
    }

    // ---------------------------------------------------------------------
    // M16: file panels — a local file, minted as a read-only, live-watched
    // node on the canvas. A fixture file in a SPACED temp directory, the
    // rule this repo learned from the pane-died redirect bug shipping
    // through eight reviews on space-free fixtures.
    //
    // Originally numbered 125-128 under this branch's own M13, which
    // collided with main's own DIFFERENT M13 — "links between panels" —
    // which independently claimed 125-129 here, and with M14/M15's own
    // renumbered ranges (130, 131-133). See the milestone-wide renumbering
    // commit for the full story.
    // ---------------------------------------------------------------------
    {
      const FILE_DIR = mkdtempSync(join(tmpdir(), 'tc filepanel '))
      const FIXTURE = join(FILE_DIR, 'notes.md')
      writeFileSync(FIXTURE, 'first line\nsecond line\n')

      // 134 — the panel renders the file's REAL content, minted through the
      //       real openFilePanel path via the __m13Open test hook. Asserted
      //       on the content rather than on the panel existing: a panel that
      //       mounted and rendered nothing satisfies "a panel exists"
      //       completely.
      const xtermsBefore = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
      await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(FIXTURE)})`)
      const rendered = await waitUntil(async () => {
        const t = await wc.executeJavaScript(
          `(() => { const b = document.querySelector('[data-panel-kind="file"] [data-scroll-host]'); return b ? b.textContent : null })()`)
        return t && t.includes('second line') ? t : null
      }, 5000)
      ok('134 a file panel renders the real content of the file it names',
        rendered !== null,
        `content=${JSON.stringify(String(rendered).slice(0, 40))}`)

      // 135 — THE LIVENESS CHECK, and the whole reason this milestone's
      //       watcher is directory-based rather than a plain path watch: it
      //       is driven by an ATOMIC write (temp file, then rename over the
      //       target), because that is what an agent actually does and it is
      //       the exact case a bare fs.watch(path) misses — the inode the
      //       original watch pinned is gone the instant the rename lands.
      //       WAITED on, never slept on: a fixed sleep against a watcher is
      //       a flake and not a bound.
      writeFileSync(join(FILE_DIR, 'notes.tmp'), 'rewritten by an agent\n')
      renameSync(join(FILE_DIR, 'notes.tmp'), FIXTURE)
      const updated = await waitUntil(async () => {
        const t = await wc.executeJavaScript(
          `(() => { const b = document.querySelector('[data-panel-kind="file"] [data-scroll-host]'); return b ? b.textContent : null })()`)
        return t && t.includes('rewritten by an agent') ? t : null
      }, 5000)
      ok('135 an atomic external rename-over-target reaches the live panel',
        updated !== null,
        updated === null ? 'never arrived' : 'arrived')

      // 136 — it costs no session and no WebGL context, and BOTH clauses are
      //       required. The second is what rejects an implementation that
      //       quietly demoted some other panel to pay for this one — "the
      //       file panel has no xterm" is satisfied perfectly by that alone.
      const fileId = await wc.executeJavaScript(
        `document.querySelector('[data-panel-kind="file"]').getAttribute('data-panel-id')`)
      const hasSession = await wc.executeJavaScript(
        `Boolean(window.__m4aSessions()[${JSON.stringify(fileId)}])`)
      const xtermsAfter = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
      ok('136 a file panel holds no PanelSession and costs no WebGL context',
        hasSession === false && xtermsAfter === xtermsBefore,
        `session=${hasSession} xterms ${xtermsBefore}->${xtermsAfter}`)

      // 137 — closing it sends NO pty.kill for its id. A negative against a
      //       recording mechanism is vacuous if the recorder has stopped
      //       recording, so this ALSO closes a real terminal panel in the
      //       same window and asserts THAT id IS recorded — the same
      //       non-vacuity shape checks 111/111b already established for
      //       review nodes. A kill aimed at an id naming no session is
      //       swallowed at every layer below the IPC door (the direct
      //       backend's destroy() is a no-op, tmux's cli() eats a non-zero
      //       exit, dropBaseline for an unknown id drops nothing), so
      //       without the recorder every renderer-visible fact would stay
      //       identical with the !isTerminalPanel guard removed — the exact
      //       trap checks 111/111b were built to close.
      const killsBefore = killedPanelIds.length
      await clickPanelClose(wc, fileId)
      const termId = await wc.executeJavaScript(
        `document.querySelector('.panel[data-panel-kind="terminal"]').getAttribute('data-panel-id')`)
      await clickPanelClose(wc, termId)
      await settle()
      const killsSince = killedPanelIds.slice(killsBefore)
      ok('137 closing a file panel sends no pty.kill, while a terminal close still does',
        !killsSince.includes(fileId) && killsSince.includes(termId),
        `kills=${JSON.stringify(killsSince)}`)

      try { rmSync(FILE_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
    }

    /* ============== M21: the toolbox node, end to end ================== */
    {
      // Its own fixture tree, in a directory whose path contains a SPACE —
      // this repo's costliest silent bug shipped through eight reviews on
      // space-free fixtures. It is a PROJECT scope only: the USER scope is
      // fenced onto an empty temp home by panels-entry.cjs, deliberately, so
      // this check can never read the running developer's real ~/.claude.
      const TB_DIR = mkdtempSync(join(tmpdir(), 'tc toolbox panel '))
      mkdirSync(join(TB_DIR, '.claude', 'skills', 'fixture-skill'), { recursive: true })
      writeFileSync(
        join(TB_DIR, '.claude', 'skills', 'fixture-skill', 'SKILL.md'),
        '---\nname: fixture-skill\ndescription: A skill this fixture owns.\n---\n'
      )
      writeFileSync(
        join(TB_DIR, '.claude', 'settings.json'),
        JSON.stringify({
          permissions: { allow: ['Bash(ls)', 'Bash(cat)'] },
          hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node /h/guard.js --token=SHOULD-NOT-CROSS' }] }] }
        })
      )

      const xtermsBefore = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
      await wc.executeJavaScript(
        `window.__m20Toolbox(${JSON.stringify(TB_DIR)}, ${JSON.stringify('fixture')})`)

      // 162 is the check the whole milestone exists for, and it is the FIRST
      //     thing to exercise the reader, the invoke, the store, the model and
      //     the component together — verify:toolbox proves the reader and
      //     verify:rail proves the models, and nothing between either of them
      //     and a painted node is covered by those. Asserted on the REAL
      //     content, never on the panel existing: a node that mounted and
      //     rendered nothing satisfies "a panel exists" completely.
      const body = async () => wc.executeJavaScript(
        `(() => { const b = document.querySelector('[data-panel-kind="toolbox"] [data-scroll-host]'); return b ? b.textContent : null })()`)
      const rendered = await waitUntil(async () => {
        const t = await body()
        return t && t.includes('fixture-skill') ? t : null
      }, 8000)
      ok('162 a toolbox node renders the real skills of the directory it names',
        rendered !== null,
        `body=${JSON.stringify(String(rendered).slice(0, 80))}`)

      // 163 is the projection observed at the LAST possible surface — the
      //     rendered DOM of a real node, in a real renderer, reading a real
      //     file. verify:toolbox 15 pins hookProgram and verify:rail 92 pins
      //     the row, and neither can see whether something between them and
      //     the screen put the token back. The positive clause is what stops
      //     it being vacuous: the hook's PROGRAM must be on screen, so a node
      //     that rendered no hooks at all cannot pass by rendering nothing.
      const shown = String(rendered ?? '')
      ok('163 the hook PROGRAM reaches the node and its command string does not',
        shown.includes('guard.js') && !shown.includes('SHOULD-NOT-CROSS')
          && !shown.includes('--token'),
        `program=${shown.includes('guard.js')} token=${shown.includes('SHOULD-NOT-CROSS')}`)

      // 164 is verify:panels 103's argument applied to a FIFTH kind: the node
      //     holds no PanelSession AND the xterm count is unchanged from before
      //     it existed. The second clause is what rejects an implementation
      //     that quietly demoted some other panel to pay for this one — "no
      //     xterm of its own" is satisfied by that regression too.
      const tbId = await wc.executeJavaScript(
        `document.querySelector('.panel[data-panel-kind="toolbox"]').getAttribute('data-panel-id')`)
      const hasSession = await wc.executeJavaScript(
        `Object.prototype.hasOwnProperty.call(window.__m4aSessions(), ${JSON.stringify(tbId)})`)
      const xtermsAfter = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
      ok('164 a toolbox node holds no PanelSession and costs no WebGL context',
        hasSession === false && xtermsAfter === xtermsBefore,
        `session=${hasSession} xterms ${xtermsBefore}->${xtermsAfter}`)

      // 165 — closing it sends NO pty.kill for its id, and the same window
      //     closes a real terminal panel and asserts THAT id IS recorded. A
      //     negative against a recording mechanism is vacuous if the recorder
      //     has stopped recording, which is the trap checks 111/111b and 137
      //     were each built to close: a kill aimed at an id naming no session
      //     is swallowed at every layer below the IPC door, so without the
      //     positive half every renderer-visible fact would be identical with
      //     the !isTerminalPanel guard removed entirely.
      //     Its OWN terminal panel, spawned here rather than borrowed from the
      //     canvas: this block runs last, and by now M18's move and delete
      //     checks have left the active workspace with no terminal panel at
      //     all — the first draft of this check read `terminal=null kills=[]`
      //     and failed for a fixture reason rather than a behavioural one.
      //     Check 83 already sets the precedent of spawning what a check
      //     needs instead of assuming the canvas still holds it.
      const killsBefore = killedPanelIds.length
      const termId2 = await (async () => {
        const before = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: TB_DIR, command: '/bin/sh', args: [], w: 400, h: 300 })
        const ids = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.length > before.size ? now : false
        }, 5000)
        return ids ? (ids.find((id) => !before.has(id)) ?? null) : null
      })()
      // Waited on, so the close below cannot race the spawn: a kill for a
      // panel whose session has not landed yet is swallowed at the IPC door
      // and the positive clause would report a false negative.
      if (termId2 !== null) {
        await waitUntil(async () => (await sessionMap(wc)).has(termId2), 6000)
      }
      await clickPanelClose(wc, tbId)
      if (termId2 !== null) await clickPanelClose(wc, termId2)
      await settle()
      const killsSince = killedPanelIds.slice(killsBefore)
      ok('165 closing a toolbox node sends no pty.kill, while a terminal close still does',
        termId2 !== null && !killsSince.includes(tbId) && killsSince.includes(termId2),
        `toolbox=${tbId} terminal=${String(termId2)} kills=${JSON.stringify(killsSince)}`)

      try { rmSync(TB_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
    }

    // ---------------------------------------------------------------------
    // M22: the editable file panel, end to end through a real renderer.
    // Tasks 1-5 built the write verb, the file:write channel, the
    // editability gate and the edit-mode UI in isolation; this is the
    // milestone's only proof those pieces are actually wired to each other.
    // No production code here — a red check below is a wiring defect in one
    // of those tasks, fixed there rather than loosened here. A fixture
    // directory with a SPACE, the same rule the M16 block above states: this
    // repo's most expensive silent bug shipped through eight reviews on
    // space-free fixtures. Numbered 169-171. They were 138-140 on the
    // branch, against a base whose last check was 137; main had meanwhile
    // taken this suite to 165 through milestones that never saw this one, so
    // they were renumbered at the merge rather than colliding silently — the
    // same thing this repo has now done to a milestone's checks four times.
    // ---------------------------------------------------------------------
    {
      const M22_DIR = mkdtempSync(join(tmpdir(), 'tc panels m22 '))

      // 138 — type and save, read back OFF DISK. Reading the panel back
      //       would only prove the textarea holds what was typed into it;
      //       the bytes on disk are the actual claim this milestone makes.
      //       The value is set through the NATIVE textarea setter plus a
      //       bubbling `input` event, because assigning `.value` directly
      //       leaves React's controlled state untouched and the save would
      //       go out carrying the SEEDED content — the identical trap check
      //       113 already records for the review node's own commit message.
      //       The edit button's own `waitUntil` waits for it to be present
      //       AND ENABLED (`:not([disabled])`) rather than merely present:
      //       the button renders — disabled — the instant the panel mounts,
      //       before file:read resolves (buildFileNodeModel's `editable`
      //       defaults to false while `result === undefined`), so a bare
      //       presence check races the read and dispatches a mousedown the
      //       handler's own `!model.editable` guard silently swallows.
      {
        const FIXTURE = join(M22_DIR, 'edit me.txt')
        writeFileSync(FIXTURE, 'before\n')
        await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(FIXTURE)})`)
        await waitUntil(() => wc.executeJavaScript(
          `!!document.querySelector('[data-panel-kind="file"] [data-file-node-edit]:not([disabled])')`), 5000)
        await wc.executeJavaScript(`
          document.querySelector('[data-panel-kind="file"] [data-file-node-edit]')
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        `)
        await waitUntil(() => wc.executeJavaScript(
          `!!document.querySelector('[data-file-node-editor]')`), 5000)
        // M67 — frame.2a. Save lives in the CHROME row beside the toggle,
        // never over the body (brief, The panel frame): a Save at the foot of
        // the body was the one control the frame rule did not cover.
        const saveInChrome = await wc.executeJavaScript(`(() => { const n = document.querySelector('[data-panel-kind="file"] [data-file-node-editor]')?.closest('.panel'); if (!n) return 'no panel'
          const s = n.querySelector('[data-file-node-save]'); return s ? (s.closest('.pf__chrome') !== null ? true : 'in body') : 'absent' })()`)
        ok('frame.2a the file panel\'s Save sits in the chrome row while a draft is open', saveInChrome === true, JSON.stringify({ saveInChrome }))
        await wc.executeJavaScript(`
          (() => {
            const ta = document.querySelector('[data-file-node-editor]')
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype, 'value').set
            setter.call(ta, 'after my edit\\n')
            ta.dispatchEvent(new Event('input', { bubbles: true }))
            ta.dispatchEvent(new KeyboardEvent('keydown',
              { key: 's', metaKey: true, bubbles: true }))
          })()
        `)
        await waitUntil(async () => readFileSync(FIXTURE, 'utf8') === 'after my edit\n', 4000)
        const disk138 = readFileSync(FIXTURE, 'utf8')
        ok('169 typing then Cmd+S writes the edited bytes to disk',
          disk138 === 'after my edit\n',
          `disk=${JSON.stringify(disk138)}`)
      }

      // 139 — an external write while the draft is DIRTY. Both clauses are
      //       required and neither implies the other: the draft surviving
      //       alone is satisfied by a panel that never received the watcher
      //       push at all, and the banner alone is satisfied by a panel
      //       that raised it and clobbered the user's draft anyway. Waited
      //       on the banner APPEARING, never slept on: WATCH_DEBOUNCE_MS is
      //       an upper bound, not a duration to sleep for.
      {
        const FIXTURE = join(M22_DIR, 'raced.txt')
        writeFileSync(FIXTURE, 'v1\n')
        await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(FIXTURE)})`)
        // Check 138 above exits edit mode on a successful save (closeDraft
        // runs), so ordinarily only one file panel is mid-edit at once — but
        // target the NEWEST file panel explicitly rather than trust that,
        // since a bare unscoped query could silently match a stale panel if
        // that assumption ever stops holding. Scoped to the newest panel's
        // OWN edit button for the same reason 138's wait is scoped to
        // `:not([disabled])`: an unscoped wait would resolve the instant
        // check 138's now-idle panel's own (already-enabled) edit button
        // matched, before this second panel's file:read ever resolved.
        await waitUntil(() => wc.executeJavaScript(`
          (() => {
            const nodes = [...document.querySelectorAll('[data-panel-kind="file"]')]
            const last = nodes[nodes.length - 1]
            const btn = last && last.querySelector('[data-file-node-edit]')
            return !!(btn && !btn.disabled)
          })()
        `), 5000)
        await wc.executeJavaScript(`
          (() => {
            const nodes = [...document.querySelectorAll('[data-panel-kind="file"]')]
            nodes[nodes.length - 1].querySelector('[data-file-node-edit]')
              .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          })()
        `)
        await waitUntil(() => wc.executeJavaScript(
          `!!document.querySelector('[data-file-node-editor]')`), 5000)
        await wc.executeJavaScript(`
          (() => {
            const ta = document.querySelector('[data-file-node-editor]')
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype, 'value').set
            setter.call(ta, 'my unsaved work\\n')
            ta.dispatchEvent(new Event('input', { bubbles: true }))
          })()
        `)
        // "The agent" writes, from outside the app entirely.
        writeFileSync(FIXTURE, 'the agent wrote this\n')
        await waitUntil(() => wc.executeJavaScript(
          `!!document.querySelector('[data-file-node-conflict]')`), 5000)
        const state139 = await wc.executeJavaScript(`
          ({
            draft: document.querySelector('[data-file-node-editor]')?.value ?? null,
            banner: !!document.querySelector('[data-file-node-conflict]')
          })
        `)
        ok('170 a write under a dirty draft raises the conflict banner and does not clobber the draft',
          state139.draft === 'my unsaved work\n' && state139.banner === true,
          `draft=${JSON.stringify(state139.draft)} banner=${state139.banner}`)
      }

      // 140 — THE TRUNCATION BYPASS. buildFileNodeModel refuses to mark a
      //       truncated result editable precisely so a truncated buffer can
      //       never be saved back — saving one deletes every line past
      //       FILE_MAX_LINES — but until the final review that gate stood
      //       only on the EDIT BUTTON. verify:rail 81 proves the MODEL
      //       computes the flag; nothing anywhere proved the SAVE PATH obeys
      //       it, and it did not: the reseed effect's only conflict test was
      //       `kind !== 'text'`, so a truncated text result reseeded the
      //       draft AND advanced baseMtimeMs, after which the CAS passed and
      //       the write went through reporting success.
      //
      //       Driven as the ordinary sequence it is, rather than as an
      //       exotic one — this app's whole premise is an agent writing
      //       files beside you: open a small file, press edit, do not type
      //       yet, let the file grow, then type and save. The claim is
      //       asserted ON DISK, because the panel is exactly what would lie
      //       about it: a clobbered file renders as a perfectly ordinary
      //       10,000-line view with no banner.
      //
      //       The edit wait is `:not([disabled])` and the typing goes
      //       through the NATIVE setter plus a bubbling `input` event, for
      //       the two reasons checks 138/139 above already record.
      {
        const FIXTURE = join(M22_DIR, 'grows past the cap.txt')
        writeFileSync(FIXTURE, 'line 1\n')
        await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(FIXTURE)})`)
        // Scoped to the NEWEST file panel and to an ENABLED button, for
        // check 139's stated reason: an unscoped wait resolves instantly
        // against an earlier panel's already-enabled control, before this
        // panel's own file:read has landed.
        const newestEnabledEdit = `
          (() => {
            const nodes = [...document.querySelectorAll('[data-panel-kind="file"]')]
            const last = nodes[nodes.length - 1]
            const btn = last && last.querySelector('[data-file-node-edit]')
            return !!(btn && !btn.disabled)
          })()
        `
        await waitUntil(() => wc.executeJavaScript(newestEnabledEdit), 5000)
        await wc.executeJavaScript(`
          (() => {
            const nodes = [...document.querySelectorAll('[data-panel-kind="file"]')]
            nodes[nodes.length - 1].querySelector('[data-file-node-edit]')
              .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          })()
        `)
        // EVERY query below is scoped to the NEWEST file panel, and that is
        // not caution — check 139 above deliberately leaves ITS panel in edit
        // mode with a conflict banner up (it asserts the draft survives and
        // never closes it). A bare document.querySelector for an editor or a
        // banner therefore matches 139's panel, so the first draft of this
        // check typed into the wrong textarea and satisfied its banner wait
        // instantly against a banner raised two checks earlier — passing while
        // exercising nothing. It was caught by `saveError=null` in the detail
        // line: the guard under test sets a save error, and its absence said
        // the keystroke never reached this panel at all.
        const NEWEST = `[...document.querySelectorAll('[data-panel-kind="file"]')].pop()`
        await waitUntil(() => wc.executeJavaScript(
          `!!${NEWEST}.querySelector('[data-file-node-editor]')`), 5000)

        // "The agent" appends a generated file's worth of lines. Past the
        // cap read from the SOURCE OF TRUTH, never a literal — a hardcoded
        // 10000 would agree with itself while the app truncated elsewhere.
        const total = FILE_MAX_LINES + 5000
        const grown = Array.from({ length: total }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
        writeFileSync(FIXTURE, grown)

        // The draft is NOT dirty at this point — nothing has been typed —
        // which is exactly the state the old reseed arm treated as "nothing
        // is lost, reseed". The banner appearing is what says it no longer
        // does. Waited on, never slept on: WATCH_DEBOUNCE_MS is an upper
        // bound rather than a duration.
        await waitUntil(() => wc.executeJavaScript(
          `!!${NEWEST}.querySelector('[data-file-node-conflict]')`), 8000)

        // Now the user types their edit and presses Cmd+S, exactly as they
        // would have before the file grew.
        await wc.executeJavaScript(`
          (() => {
            const node = [...document.querySelectorAll('[data-panel-kind="file"]')].pop()
            const ta = node.querySelector('[data-file-node-editor]')
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype, 'value').set
            setter.call(ta, 'my one line edit\\n')
            ta.dispatchEvent(new Event('input', { bubbles: true }))
            ta.dispatchEvent(new KeyboardEvent('keydown',
              { key: 's', metaKey: true, bubbles: true }))
          })()
        `)
        // A write, if one escaped, is a synchronous main-side rename behind
        // one IPC round trip, so this window is generous rather than tight.
        await new Promise((r) => setTimeout(r, 1500))

        const diskLines = readFileSync(FIXTURE, 'utf8').split('\n').filter((l) => l !== '').length
        const armed = await wc.executeJavaScript(`
          (() => {
            const node = [...document.querySelectorAll('[data-panel-kind="file"]')].pop()
            return {
              banner: !!node.querySelector('[data-file-node-conflict]'),
              saveError: node.querySelector('[data-file-node-save-error]')?.textContent ?? null
            }
          })()
        `)
        // The disk clause is the claim. The other two are non-vacuity
        // guards, and both are load-bearing: a panel that never received the
        // push would also leave the file intact (banner), and a Cmd+S that
        // never reached this panel's own textarea would too (saveError — the
        // save-time gate's visible refusal, which is the ONLY evidence the
        // write path was actually asked to run and said no).
        ok('171 a file that grows past the render cap under an open draft cannot be saved back over it',
          diskLines === total && armed.banner === true && armed.saveError !== null,
          `diskLines=${diskLines} expected=${total} banner=${armed.banner} saveError=${JSON.stringify(armed.saveError)}`)
      }

      try { rmSync(M22_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
    }

    // -----------------------------------------------------------------------
    // Backlog #68: middle-drag and space-drag pan, end to end. `dragBy`
    // mirrors dragFromTo's own reason for four intermediate moves — the
    // gesture's listeners live on `document`, and a single jump would
    // exercise neither the tracking nor the listener lifetime a real drag
    // produces — and carries the matching *ButtonDown modifier on every
    // move, since Chromium derives MouseEvent.buttons from the modifier
    // bitfield rather than from the button field, the exact trap
    // `dragFromTo`'s own comment records for isAutoRepeat.
    {
      const dragBy = async (from, dx, dy, button, downMod) => {
        wc.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button, clickCount: 1 })
        for (let i = 1; i <= 4; i++) {
          wc.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(from.x + (dx * i) / 4),
            y: Math.round(from.y + (dy * i) / 4),
            button,
            modifiers: [downMod]
          })
        }
        wc.sendInputEvent({
          type: 'mouseUp', x: from.x + dx, y: from.y + dy, button, clickCount: 1
        })
      }

      // 174. Middle-drag over the background pans the camera by the EXACT
      // delta and spawns/selects/focuses nothing — the "free half" the
      // backlog names, since no terminal treats a bare middle-click as
      // meaningful input.
      {
        const before = await panelCount(wc)
        const start = await backgroundPoint(wc)
        const vpBefore = start ? await wc.executeJavaScript(`window.__m4aViewport()`) : null
        let vpAfter = null
        if (start) {
          await dragBy(start, 130, -70, 'middle', 'middleButtonDown')
          await settle()
          vpAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
        }
        const after = await panelCount(wc)
        const dx = vpAfter && vpBefore ? Math.round(vpAfter.x - vpBefore.x) : null
        const dy = vpAfter && vpBefore ? Math.round(vpAfter.y - vpBefore.y) : null
        ok('174 a middle-button drag over the background pans the camera by the exact delta, spawning nothing',
          start !== null && dx === 130 && dy === -70 && vpAfter.scale === vpBefore.scale && after === before,
          `start=${JSON.stringify(start)} before=${JSON.stringify(vpBefore)} after=${JSON.stringify(vpAfter)} panels ${before} -> ${after}`)
      }

      // 175. Middle-drag STARTING ON A LIVE PANEL's chrome also pans the
      // camera, and the panel itself is neither selected, focused, dragged
      // nor resized — the check that proves the capture-phase intercept
      // wins over panel chrome, since no panel handler in this codebase
      // checks event.button and would otherwise start a PANEL drag.
      {
        const rect = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.panel')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { id: el.getAttribute('data-panel-id'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) }
        })()`)
        const before = rect ? await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.panel[data-panel-id="${rect.id}"]')
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.left), y: Math.round(r.top), selected: el.classList.contains('panel--selected') }
        })()`) : null
        const vpBefore = rect ? await wc.executeJavaScript(`window.__m4aViewport()`) : null
        let vpAfter = null
        let afterRect = null
        if (rect) {
          await dragBy({ x: rect.x, y: rect.y }, 90, 40, 'middle', 'middleButtonDown')
          await settle()
          vpAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
          afterRect = await wc.executeJavaScript(`(() => {
            const el = document.querySelector('.panel[data-panel-id="${rect.id}"]')
            const r = el.getBoundingClientRect()
            return { x: Math.round(r.left), y: Math.round(r.top), selected: el.classList.contains('panel--selected') }
          })()`)
        }
        const dx = vpAfter && vpBefore ? Math.round(vpAfter.x - vpBefore.x) : null
        // The panel's own WORLD rect never moved (this is a camera pan, not
        // a panel drag), so its SCREEN rect must have shifted by exactly the
        // camera's own delta — screen = world * scale + vp, and scale is
        // unchanged. A panel that had instead been DRAGGED would show some
        // other delta (or none, if the drag never started).
        const panelRectUnchanged = before && afterRect && dx !== null &&
          Math.abs((afterRect.x - before.x) - dx) <= 1
        ok('175 a middle-drag starting on a live panel pans the camera and neither selects nor drags the panel',
          rect !== null && dx === 90 && before.selected === false && afterRect.selected === false && panelRectUnchanged,
          `panel=${rect && rect.id} before=${JSON.stringify(before)} after=${JSON.stringify(afterRect)} vp ${JSON.stringify(vpBefore)} -> ${JSON.stringify(vpAfter)}`)
      }

      // 176. Space + left-drag pans the background ONLY while nothing is
      // focused — the backlog's central constraint, exercised rather than
      // only argued. A bare key reaches the agent, so the keydown is
      // dispatched with code 'Space' (the repeat-guard checks' own idiom),
      // and the guard's real behaviour turns on document.activeElement,
      // which a background click already puts at <body>.
      {
        const bg = await backgroundPoint(wc)
        wc.sendInputEvent({ type: 'mouseDown', x: bg.x, y: bg.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: bg.x, y: bg.y, button: 'left', clickCount: 1 })
        await settle()

        await wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))`)
        const start = await backgroundPoint(wc)
        const vpBefore = start ? await wc.executeJavaScript(`window.__m4aViewport()`) : null
        let vpAfter = null
        if (start) {
          await dragBy(start, -60, 55, 'left', 'leftButtonDown')
          await settle()
          vpAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
        }
        await wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))`)
        const dx = vpAfter && vpBefore ? Math.round(vpAfter.x - vpBefore.x) : null
        const dy = vpAfter && vpBefore ? Math.round(vpAfter.y - vpBefore.y) : null
        ok('176 space-held left-drag over the background pans the camera when nothing is focused',
          start !== null && dx === -60 && dy === 55,
          `start=${JSON.stringify(start)} before=${JSON.stringify(vpBefore)} after=${JSON.stringify(vpAfter)}`)
      }

      // 177. The same space+left-drag over a panel's own chrome (rather than
      // the background) does NOT pan — "over the background" is
      // load-bearing, not incidental, per the backlog's own text.
      {
        const rect = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.panel')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { id: el.getAttribute('data-panel-id'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) }
        })()`)
        await wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))`)
        const vpBefore = rect ? await wc.executeJavaScript(`window.__m4aViewport()`) : null
        let vpAfter = null
        if (rect) {
          await dragBy({ x: rect.x, y: rect.y }, 70, 30, 'left', 'leftButtonDown')
          await settle()
          vpAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
        }
        await wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))`)
        ok('177 space-held left-drag over a PANEL never pans the camera',
          rect !== null && vpAfter.x === vpBefore.x && vpAfter.y === vpBefore.y,
          `panel=${rect && rect.id} before=${JSON.stringify(vpBefore)} after=${JSON.stringify(vpAfter)}`)
      }
    }

    // M24's Jira-comment check arrived numbered 174 — the same integer backlog
    // #68's pan checks above had independently taken. Renumbered to a scoped id
    // on merge, per CLAUDE.md's convention; verify-meta's own check 22 flags
    // exactly this collision, so leaving it would have turned the suite red for
    // a reason unrelated to either milestone.
    // jira-comment.1. The comment draft end to end in a real renderer: the ONLY check that
    //      exercises the input, the send, and the outcome together. verify:jira
    //      proves the CLIENT and says nothing about whether a keystroke reaches
    //      it.
    //
    //      window.canvas.jira CANNOT be reassigned from a renderer-side
    //      script, and that was learned by measurement rather than assumed:
    //      contextBridge deep-freezes the whole exposed api tree in the
    //      page's main world (window.canvas and window.canvas.jira both
    //      report writable:false, configurable:false, Object.isFrozen:true),
    //      which is the bridge doing exactly the tampering-resistance job it
    //      exists for. A plain `window.canvas.jira = stub` there is not an
    //      error — it is a silent no-op (non-strict [[Set]] on a
    //      non-writable property returns false and nothing throws) — so the
    //      obvious stub reads as though it worked and never actually swaps
    //      anything; the real `jira:list` handler still ran and answered
    //      "Connect Jira before loading tickets."
    //
    //      The fake sits one hop further in instead: this Node process IS
    //      the main process for this harness (registerIpcHandlers ran right
    //      here, above), so the four JIRA_* ipcMain handlers are swapped for
    //      fakes that never touch the real credential store or the network —
    //      the standing "npm run verify stays offline" rule, satisfied from
    //      the main-process side of the boundary the renderer-side stub
    //      could never reach.
    //
    //      Its non-vacuity clause is load-bearing: asserting only "no error
    //      appeared" passes before the feature exists at all, so it also
    //      demands the outcome element carry the SENT text back, and the
    //      fake JIRA_COMMENT handler's own captured payload is the proof of
    //      what actually crossed the IPC boundary.
    {
      const jiraSent = []
      // The four real closures, exactly as registerIpcHandlers bound them
      // above — captured by the ipcMain.handle wrapper around that call,
      // never re-derived. Restoring an approximation (a second call to
      // registerIpcHandlers, a hand-written passthrough) would risk drifting
      // from what check 173 and everything before it actually ran against.
      const realJiraList = registeredHandlers.get(IPC.JIRA_LIST)
      const realJiraTransitions = registeredHandlers.get(IPC.JIRA_TRANSITIONS)
      const realJiraComment = registeredHandlers.get(IPC.JIRA_COMMENT)
      const realJiraTransition = registeredHandlers.get(IPC.JIRA_TRANSITION)

      try {
        ipcMain.removeHandler(IPC.JIRA_LIST)
        ipcMain.removeHandler(IPC.JIRA_TRANSITIONS)
        ipcMain.removeHandler(IPC.JIRA_COMMENT)
        ipcMain.removeHandler(IPC.JIRA_TRANSITION)
        ipcMain.handle(IPC.JIRA_LIST, async () => ({
          kind: 'items', items: [{
            id: 'TC-12', title: 'Ship Jira writes', description: 'body',
            assignee: 'Ada Lovelace', state: 'In Progress',
            url: 'https://acme.atlassian.net/browse/TC-12'
          }]
        }))
        ipcMain.handle(IPC.JIRA_TRANSITIONS, async () => ({ kind: 'transitions', transitions: [] }))
        ipcMain.handle(IPC.JIRA_COMMENT, async (_event, req) => { jiraSent.push(req); return { kind: 'done' } })
        ipcMain.handle(IPC.JIRA_TRANSITION, async () => ({ kind: 'done' }))

        // Mint the panel through the app's own gesture, never by hand-writing a
        // panel record: a check that bypasses the mint proves nothing about it.
        var minted = await wc.executeJavaScript(`(() => typeof window.__m24Jira === 'function' && (window.__m24Jira(), true))()`)
        var row = await waitUntil(
          () => wc.executeJavaScript(`document.querySelector('[data-jira-ticket="TC-12"]') !== null`), 8000)

        if (row) {
          await wc.executeJavaScript(`(() => {
            const r = document.querySelector('[data-jira-ticket="TC-12"]')
            r.querySelector('[data-jira-comment-open]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
            return true
          })()`)
          await waitUntil(
            () => wc.executeJavaScript(`document.querySelector('[data-jira-comment-input]') !== null`), 4000)

          // The native value setter plus an input event: assigning .value alone
          // leaves React's state untouched, and the send would go out empty. The
          // same trap verify:panels 113 records for the commit draft.
          await wc.executeJavaScript(`(() => {
            const input = document.querySelector('[data-jira-comment-input]')
            const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
            set.call(input, 'agent finished the refactor')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
            return true
          })()`)
        }

        // Only waited on when the row actually appeared — with no row, the
        // comment-open button and the input were never reached, and waiting on
        // an outcome node that can never appear would just burn the timeout.
        var outcome = row
          ? await waitUntil(
              () => wc.executeJavaScript(`(document.querySelector('[data-jira-outcome]') || {}).textContent || ''`), 6000)
          : ''
      } finally {
        // Restored unconditionally, including on a throw from anything
        // above: a fake left installed here is exactly the trap
        // verify:pty-manager check 20's own comment documents for its
        // kill-server obligation, and CLAUDE.md records this repo already
        // being burned once by an inherited obligation nobody wrote down
        // (a later run attaching to a stale server, one check reporting the
        // wrong number while looking entirely correct). When this was
        // written check 174 was the LAST check in this file, so leaving the
        // fakes installed would have been silently harmless — but that is
        // exactly the condition under which an obligation gets forgotten,
        // not a reason to skip writing it down. It has since stopped being
        // harmless: M35's link-drawing merge appended link-draw.1-6 AFTER
        // this block, and they run against production Jira behaviour
        // exactly as 173 did precisely because this block restores the real
        // JIRA_* handlers before it returns control — nothing to check on
        // your end, which is the promise this comment made in advance and
        // is the reason the merge needed no edit here beyond this note. If a future edit ever needs the fakes to
        // survive past this block's own return, it must say so in a comment
        // right here, at the point the restore would otherwise happen.
        ipcMain.removeHandler(IPC.JIRA_LIST)
        ipcMain.removeHandler(IPC.JIRA_TRANSITIONS)
        ipcMain.removeHandler(IPC.JIRA_COMMENT)
        ipcMain.removeHandler(IPC.JIRA_TRANSITION)
        ipcMain.handle(IPC.JIRA_LIST, realJiraList)
        ipcMain.handle(IPC.JIRA_TRANSITIONS, realJiraTransitions)
        ipcMain.handle(IPC.JIRA_COMMENT, realJiraComment)
        ipcMain.handle(IPC.JIRA_TRANSITION, realJiraTransition)
      }

      ok('jira-comment.1 a Jira comment typed into a real draft reaches the adapter',
        minted === true && row === true && jiraSent.length === 1 &&
          jiraSent[0].itemId === 'TC-12' && jiraSent[0].body === 'agent finished the refactor' &&
          // EXACT, never /comment/i: the failure text on a rejected invoke
          // is 'the comment could not be sent', which matches that regex
          // just as well as the success text does — a clause that cannot
          // separate success from failure. The conjunction above happens to
          // make it unreachable today, which is precisely the state in which
          // a loose assertion survives into a future where it is reachable.
          outcome === 'comment added',
        `minted=${minted} row=${row} sent=${JSON.stringify(jiraSent)} outcome=${outcome}`)
}
    // M35. Drawing a link by dragging from a port handle. This is the
    // enclosing block for the WHOLE milestone, not just this task's two
    // checks: tasks 5, 6 and 7 append further checks INSIDE these braces so
    // they can see the consts declared here (portBox, dragPortTo, m24Links,
    // the four fixture ids) — a sibling block would not see them and a
    // ReferenceError there ends the whole suite run.
    {
      const M24_A = 'm24A'
      const M24_B = 'm24B'
      const M24_C = 'm24C'
      const M24_DORMANT = 'm24-dormant'

      // Seeded through the layout file and a reload rather than through
      // spawns, because check link-draw.2 needs a panel that has GENUINELY never been
      // promoted, and the only way to get one is a panel restored from disk
      // that no camera has ever framed.
      //
      // A, B and C are 260 world units apart, which is what lets a rail click
      // on one leave the others on screen: .canvas is ~700px wide here, so
      // framing B puts A's centre ~260px left of centre, comfortably inside.
      // Check 125's own first draft parked its pair 600 apart and failed with
      // the target's rect off the window entirely.
      //
      // M24_DORMANT's coordinate is a DEVIATION from the task brief, which
      // parked it at (80000,80000) by the same pattern check 39's
      // (50000,50000), check 84's (60000,60000) and check 125's (70000,70000)
      // already use. That pattern is right for THOSE checks, which reach
      // their dormant panel only by its own rail row — but check link-draw.2 also
      // needs to DRAG from M24_A's port, in ONE continuous on-screen gesture,
      // to wherever `railGoTo(M24_DORMANT)` frames. At (80000,80000) that
      // framing puts M24_A's port around screen x=-81600 — the port element
      // exists (portBox reports it non-null, non-zero) but is nowhere near
      // the visible window, so the drag silently lands nowhere. Reproduced
      // by running the check with the brief's own coordinate: 174 passes,
      // 175 fails with `links` unchanged, and a one-off diagnostic (removed
      // once this was understood) showed the port's actual screen position.
      // Cmd+1 (fit all) cannot rescue it either — the SAME limit check
      // 142-144's own comment states for check 84's 60000,60000 fixture:
      // fitAll clamps at MIN_SCALE (0.1) and still cannot bring a panel this
      // far from the origin into the same frame as one near it, and
      // PORT_MIN_SCALE (0.4) is above MIN_SCALE regardless, so the ports
      // would not even render at a fit-all scale.
      //
      // "Genuinely never promoted" only requires that NOTHING before this
      // block's own railGoTo(M24_DORMANT) has framed it — proximity to
      // M24_A/B/C carries no risk of that, since nothing else in this suite
      // addresses a row by this id. So M24_DORMANT completes the 2x2 grid
      // A/B/C already forms (260 apart on each axis, the same spacing that
      // lets framing one leave its neighbours on screen), placed at the
      // fourth corner — distinct from A, B and C's own rects, and distinct
      // from every other fixture's dormant coordinate (50000/60000/70000).
      //
      // Seeded HERE rather than borrowed from the M13 link block. By this
      // point in the run M18's move and delete checks have left the active
      // workspace with no terminal panel at all — check 165's own first draft
      // reported `terminal=null` and failed for a fixture reason rather than a
      // behavioural one.
      flushLayoutStore()
      {
        const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const ws = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
        const maxZ = ws.panels.reduce((m, p) => Math.max(m, p.z), 0)
        ws.panels.push(
          { id: M24_A, x: -2400, y: -2000, w: 200, h: 160, z: maxZ + 1, cwd: '~', args: ['-l'] },
          { id: M24_B, x: -2140, y: -2000, w: 200, h: 160, z: maxZ + 2, cwd: '~', args: ['-l'] },
          { id: M24_C, x: -2400, y: -1740, w: 200, h: 160, z: maxZ + 3, cwd: '~', args: ['-l'] },
          { id: M24_DORMANT, x: -2140, y: -1740, w: 200, h: 160, z: maxZ + 4, cwd: '~', args: ['-l'] }
        )
        writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
        layoutStore.load()
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        await waitUntil(async () =>
          (await wc.executeJavaScript(
            `!!document.querySelector('[data-rail-row="${M24_A}"]')`)) || false,
          6000)
        await settle()
      }

      // These two are re-declared locally rather than reused from the M13
      // block above: panelBox and railGoTo there are scoped inside that
      // block's own braces and are out of scope here.
      const panelBox = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-panel-id="${id}"]')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height,
                 cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
      })()`)

      const railGoTo = async (id) => {
        const clicked = await wc.executeJavaScript(`(() => {
          const row = document.querySelector('[data-rail-row="${id}"] .rail-row__main')
          if (!row) return false
          row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`)
        await settle()
        return clicked
      }

      const portBox = (id, side) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-panel-id="${id}"] [data-port="${side}"]')
        if (!el) return null
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return { zero: true }
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
      })()`)

      // A REAL drag: sendInputEvent, four intermediate moves, and the
      // `leftButtonDown` modifier. All three matter and none is padding.
      // sendInputEvent because a dispatched MouseEvent is isTrusted:false and
      // performs no default action (check 75c's limit). Four moves because the
      // gesture's listeners live on `document` precisely so they survive the
      // cursor leaving the port, and one synthetic hop exercises neither the
      // tracking nor the listener lifetime. `leftButtonDown` because Chromium
      // derives MouseEvent.buttons from the MODIFIER bitfield rather than the
      // `button` field — the same spelling trap the isAutoRepeat note records
      // — and the gesture ends itself on a move with no button held, so
      // without it every drag here would end on its first move.
      //
      // Split into three (fix round 1) so a check can read the DOM MID-GESTURE
      // — after the press and the move, before the release — which
      // `dragPortTo` alone cannot do: it presses, moves and releases inside
      // one call with nothing to observe in between. `settle()` sends no
      // input events, so a read taken here cannot disturb the gesture —
      // `onMove` (useLinkDraw.ts) only ends a draw on a BUTTONLESS move, and
      // none is sent by reading the DOM. `dragPortTo` below is recomposed
      // from these three with IDENTICAL timing to the original single
      // function (settle() still runs exactly once, after the release), so
      // checks 174/175/176 are unaffected.
      const pressPort = (from) => {
        wc.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
      }

      const movePortTo = (from, to) => {
        for (let i = 1; i <= 4; i++) {
          wc.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(from.x + ((to.x - from.x) * i) / 4),
            y: Math.round(from.y + ((to.y - from.y) * i) / 4),
            button: 'left',
            modifiers: ['leftButtonDown']
          })
        }
      }

      const releasePort = async (to) => {
        wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
        await settle()
      }

      const dragPortTo = async (from, to) => {
        pressPort(from)
        movePortTo(from, to)
        await releasePort(to)
      }

      const m24Links = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.link-layer [data-link]')].map((e) => e.getAttribute('data-link'))`)

      // Re-declared locally: the M13 block's own clickAt (line ~8767) is
      // scoped inside THAT block's braces and is out of scope here.
      const clickAt = async (x, y) => {
        wc.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
        await settle()
      }

      // 174. A link drawn by the REAL gesture: press a port, drag, release on
      //      a panel. Asserted by the data-link key carrying BOTH IDS IN ORDER
      //      rather than by "a path exists" — an empty layer satisfies a count,
      //      and a key built from an unordered pair satisfies "a link appeared"
      //      while collapsing a->b and b->a into one.
      //
      //      The port must have a NON-ZERO box, which portBox reports
      //      separately: ports are opacity-0 at rest and a zero-sized element
      //      would make every coordinate here land on the panel beneath,
      //      turning this into a check about panel drag with a green result.
      {
        const src = M24_A
        const dst = M24_B
        await railGoTo(dst)                    // frame the target
        const port = await portBox(src, 'e')
        const box = await panelBox(dst)
        if (port && !port.zero && box) await dragPortTo(port, { x: Math.round(box.cx), y: Math.round(box.cy) })
        const links = await m24Links()
        ok('link-draw.1 a port drag draws a link, keyed with both ids in order',
          port !== null && port.zero !== true && box !== null &&
            links.includes(src + ' ' + dst),
          `port=${JSON.stringify(port)} box=${JSON.stringify(box)} links=${JSON.stringify(links)}`)
      }

      // 175. The drop must NOT WAKE the target. Check 126's argument through a
      //      new door: 126 covers the completing CLICK of the armed mode, and
      //      nothing in it can see a drag.
      //
      //      Holds by construction here rather than by a guard — waking hangs
      //      off onSelectPanel, which fires from MOUSEDOWN, and our mousedown
      //      was consumed by the port while the mouseup lands on a panel that
      //      has no mouseup handler at all. "Holds by construction" is exactly
      //      the claim a later refactor breaks silently, which is why it is
      //      checked rather than argued.
      //
      //      SPAWNED, never "absent from __m4aSessions()". The registry mints a
      //      PanelSession for every rendered panel including a dormant one —
      //      that is the whole of "two lifetimes, not one" — so the absence
      //      form fails against CORRECT code, which is how check 126's own
      //      first draft failed.
      {
        const src = M24_A
        await railGoTo(M24_DORMANT)
        const port = await portBox(src, 'e')
        const box = await panelBox(M24_DORMANT)
        if (port && !port.zero && box) await dragPortTo(port, { x: Math.round(box.cx), y: Math.round(box.cy) })
        const target = (await wc.executeJavaScript(
          `(window.__m4aSessions ? window.__m4aSessions() : [])`))
          .find((x) => x.id === M24_DORMANT)
        const links = await m24Links()
        ok('link-draw.2 a port drag links a dormant panel WITHOUT waking it',
          port !== null && port.zero !== true && box !== null &&
            links.includes(src + ' ' + M24_DORMANT) &&
            target !== undefined && target.spawned === false && target.dormant === true,
          `target=${JSON.stringify(target)} links=${JSON.stringify(links)}`)
      }

      // 176. A release in genuinely empty space, outside the snap radius,
      //      creates NOTHING — and the same fixture's in-radius release DOES
      //      create a link.
      //
      //      The second half is the non-vacuity guard and is not optional. The
      //      "creates nothing" clause alone passes perfectly against a gesture
      //      that never worked at all, which is the trap check 100 records for
      //      its own negative and the reason it is described there as evidence
      //      only once its positive neighbour has been watched red.
      //
      //      Distances are in SCREEN pixels because SNAP_RADIUS_PX is: the
      //      far drop is 6x the radius away, comfortably outside it at any
      //      scale this fixture runs at.
      //
      //      HONESTY NOTE (fix round 1): this check is about SNAPPING, not
      //      the drop preview Task 5 adds — it names `m24Links()`, never the
      //      ghost path or the target ring, and it was watched PASS before
      //      either existed (Tasks 3-4 already deliver the underlying
      //      resolve-on-release). Its title reads like a drop-feedback check
      //      and is not one; check link-draw.4, below, is where the ghost and the
      //      ring actually earn coverage.
      {
        const src = M24_C
        const dst = M24_B
        await railGoTo(dst)
        const box = await panelBox(dst)
        const port = await portBox(src, 'e')
        let farLinks = null
        let nearLinks = null
        if (port && !port.zero && box) {
          const before = await m24Links()
          // Far: well outside the radius, in empty canvas.
          await dragPortTo(port, { x: Math.round(box.cx) + 540, y: Math.round(box.cy) + 540 })
          farLinks = await m24Links()
          // Near: just outside the panel's own border, inside the radius.
          const port2 = await portBox(src, 'e')
          if (port2 && !port2.zero) {
            await dragPortTo(port2, { x: Math.round(box.x) - 20, y: Math.round(box.cy) })
          }
          nearLinks = await m24Links()
          farLinks = { before, after: farLinks }
        }
        const key = src + ' ' + dst
        ok('link-draw.3 a drop outside the radius creates nothing; a near-miss still snaps',
          farLinks !== null && nearLinks !== null &&
            farLinks.after.length === farLinks.before.length &&
            !farLinks.after.includes(key) &&
            nearLinks.includes(key),
          `far=${JSON.stringify(farLinks)} near=${JSON.stringify(nearLinks)}`)
      }

      // 177. The ghost curve exists MID-GESTURE and is gone the instant the
      //      gesture ends — that pairing is its own non-vacuity guard, the
      //      same shape check 100's own comment states for a negative read
      //      alone — AND the target ring lands on the DESTINATION panel
      //      SPECIFICALLY, matched by its own data-panel-id rather than by
      //      "some element carries data-link-target somewhere". Check 58's
      //      rule: a ring on the wrong panel still renders a ring, and an
      //      assertion that only asked "does [data-link-target] exist
      //      anywhere" would pass against that regression identically.
      //
      //      Uses pressPort/movePortTo/releasePort (fix round 1's split of
      //      dragPortTo) to read the DOM BETWEEN the move and the release —
      //      settle() sends no input events, so this cannot disturb the
      //      gesture in progress (onMove only ends a draw on a BUTTONLESS
      //      move, and none is sent here).
      {
        const src = M24_C
        const dst = M24_B
        await railGoTo(dst)
        const box = await panelBox(dst)
        const port = await portBox(src, 'e')
        let midGhost = null
        let midTarget = null
        let afterGhost = null
        if (port && !port.zero && box) {
          pressPort(port)
          // Onto the destination panel's own centre — containment, the
          // strongest of nearestLinkTarget's cases — so the target resolves
          // unambiguously rather than depending on the radius arithmetic
          // check link-draw.3 already covers.
          movePortTo(port, { x: Math.round(box.cx), y: Math.round(box.cy) })
          await settle()
          midGhost = await wc.executeJavaScript(
            `document.querySelector('.link-layer__ghost') !== null`)
          midTarget = await wc.executeJavaScript(
            `document.querySelector('[data-panel-id="${dst}"][data-link-target]') !== null`)
          await releasePort({ x: Math.round(box.cx), y: Math.round(box.cy) })
          afterGhost = await wc.executeJavaScript(
            `document.querySelector('.link-layer__ghost') !== null`)
        }
        ok('link-draw.4 the ghost curve paints mid-gesture and clears on release, and the target ring names the destination panel',
          midGhost === true && midTarget === true && afterGhost === false,
          `midGhost=${midGhost} midTarget=${midTarget} afterGhost=${afterGhost}`)
      }

      // 178. Hovering a link reveals a badge that removes it, and ONE Cmd+Z
      //      restores it.
      //
      //      The one-press clause is check 128's argument inherited: a removal
      //      committed in more than one history entry satisfies "the link came
      //      back" after two presses and looks entirely correct in every other
      //      read, while the user's second press then undoes something else.
      //
      //      Driven through __m4bUndo, NEVER a dispatched Cmd+Z: undo is a
      //      main-process MENU accelerator delivered as IPC, so a synthetic
      //      KeyboardEvent reaches nothing at all. Check 128's first draft
      //      fell into exactly this.
      //
      //      The hover is a real sendInputEvent mouseMove rather than a
      //      dispatched mouseover, because the badge's visibility is driven by
      //      React state set from onMouseEnter and an untrusted event would
      //      prove the handler works while proving nothing about the pointer.
      //
      //      Fix round 1 adds the hover-highlight clause: the hovered link's
      //      computed stroke must differ from an UN-HOVERED sibling link's
      //      computed stroke, read inside this SAME hover window (before the
      //      removal, while `key`'s hit stroke is still genuinely hovered).
      //      Compared against a real sibling's colour rather than a
      //      hardcoded rgb() literal, because a hardcoded value would turn
      //      this check red on a retheme — a copy reason, not a behavioural
      //      one — the same discipline verify:styles' own theme-token rules
      //      already enforce for the stylesheet itself. m24A -> m24-dormant
      //      is the sibling, seeded by check link-draw.2 and never removed by
      //      anything before this point.
      {
        const key = M24_A + ' ' + M24_B
        const siblingKey = M24_A + ' ' + M24_DORMANT
        await railGoTo(M24_B)
        const mid = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.link-layer [data-link="${key}"]')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
        })()`)
        let badge = null
        let hoverColors = null
        let afterRemove = null
        let afterUndo = null
        if (mid) {
          wc.sendInputEvent({ type: 'mouseMove', x: mid.x, y: mid.y })
          await settle()
          badge = await wc.executeJavaScript(`(() => {
            const b = document.querySelector('[data-link-remove="${key}"]')
            if (!b) return null
            const r = b.getBoundingClientRect()
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
          })()`)
          hoverColors = await wc.executeJavaScript(`(() => {
            const hovered = document.querySelector('.link-layer [data-link="${key}"]')
            const sibling = document.querySelector('.link-layer [data-link="${siblingKey}"]')
            if (!hovered || !sibling) return null
            return { hovered: getComputedStyle(hovered).stroke, sibling: getComputedStyle(sibling).stroke }
          })()`)
          if (badge) {
            await clickAt(badge.x, badge.y)
            afterRemove = await m24Links()
            await wc.executeJavaScript(`window.__m4bUndo && window.__m4bUndo()`)
            await settle()
            afterUndo = await m24Links()
          }
        }
        ok('link-draw.5 the hover badge removes a link, and ONE undo restores it, and the hover highlight actually changes the line\'s colour',
          mid !== null && badge !== null &&
            hoverColors !== null && hoverColors.hovered !== hoverColors.sibling &&
            afterRemove !== null && !afterRemove.includes(key) &&
            afterUndo !== null && afterUndo.includes(key),
          `mid=${JSON.stringify(mid)} badge=${JSON.stringify(badge)} hoverColors=${JSON.stringify(hoverColors)} ` +
          `afterRemove=${JSON.stringify(afterRemove)} afterUndo=${JSON.stringify(afterUndo)}`)
      }

      // 179. Ports render on a NON-TERMINAL kind, and are ABSENT in the merged
      //      view — asserted in one read, because "no ports anywhere" passes
      //      the absence half perfectly while deleting the feature. The same
      //      both-directions rule check 106 states for `editable`.
      //
      //      `links` lives on PanelBase and verify:viewport 88 pins that the
      //      geometry never asks a panel its kind, so every kind is already a
      //      valid ENDPOINT — this is the half that makes the GESTURE as
      //      kind-agnostic as the arithmetic.
      //
      //      A FILE panel is the fixture, not a review node. Both are equally
      //      valid non-terminal kinds for this claim, and a file panel is
      //      minted by one call to the __m13Open test hook with no git binary
      //      anywhere in earshot — where a review node needs a real repository
      //      fixture, and checks 99-101 already have to SKIP LOUDLY on a
      //      machine with no git. Gating this check on git would make the
      //      milestone's kind-agnostic claim untested on exactly the machines
      //      least able to notice.
      //
      //      Numbered 179 here rather than the task brief's 178: this suite's
      //      178 was already claimed by the hover-badge/removal check above.
      //
      //      This check's brief called for threading a `scale` prop into
      //      each of the four kinds and gating on `scale >= PORT_MIN_SCALE`
      //      inline. That is stale against this branch's own fix round
      //      (c148fbd, "port visibility is a canvas-host class, never a
      //      scale prop"): TerminalPanel carries NO `scale` prop at all, and
      //      the PORT_MIN_SCALE cutoff is enforced by the `.canvas--ports-
      //      hidden` class on the canvas host, in CSS, so a memoized panel
      //      is never handed a prop that changes on every zoom frame. This
      //      check therefore drives no zoom — that geometry is already
      //      covered, kind-agnostically, by the CSS rule and by
      //      PanelPorts.tsx's own scale threshold, which has no per-kind
      //      branch to regress. What this check pins is the fact that IS a
      //      per-call-site wiring decision and could plausibly be gotten
      //      wrong per kind: presence on a mounted non-terminal kind, and
      //      absence under `readOnly` (the merged view).
      //
      //      A file this suite already owns is not reused here — every
      //      earlier FIXTURE constant (checks 134-137, 169-171) is declared
      //      inside its OWN nested block and is out of scope this far down
      //      the file. Ruling P7: hoisting one out would couple two
      //      unrelated fixtures, this suite's most common check failure. A
      //      one-line file is written into its own spaced temp directory.
      //
      //      FIX ROUND 1 extends this check with the ring clause below
      //      (`midFileTarget`) rather than adding a new check, per the
      //      coordinator's ruling: the original body proved presence and
      //      merged-view absence only, and said nothing about whether
      //      `linkTarget`/`data-link-target` — the RING — is ever wired for
      //      a non-terminal kind. It was not: `onBeginLink` being required
      //      on all four protected nothing there, because a prop a
      //      component never declares has nothing to omit.
      {
        const m24PortsDir = mkdtempSync(join(tmpdir(), 'tc panels m24 ports '))
        const m24PortsFixture = join(m24PortsDir, 'ports.md')
        writeFileSync(m24PortsFixture, '# m24 ports fixture\n', 'utf8')

        // The merged chord, re-declared: M18's own `chord`/`MERGE` helpers
        // are scoped to that block. `code: 'KeyA'` and not `key`, for check
        // 152's reason — Shift rewrites the printed character, so a
        // key-based test is correct on one keyboard layout and silently
        // dead on every other.
        const MERGE_M24 = () => wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', {` +
          ` key: 'A', code: 'KeyA', metaKey: true, shiftKey: true, bubbles: true })), true`)

        const before = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(m24PortsFixture)})`)
        const fileId = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          const fresh = now.find((id) => !before.has(id))
          return fresh || false
        }, 5000)

        const onFile = fileId ? await portBox(fileId, 'e') : null
        const onTerminal = await portBox(M24_A, 'e')

        // Fix round 1's finding: onBeginLink being required on all four kinds
        // says nothing about whether the RING (`linkTarget`) is ever wired,
        // because a component that never DECLARES a prop has nothing to omit
        // for requiredness to catch — `onBeginLink` was protected by
        // `<PanelPorts>` not compiling without it, `linkTarget` had no such
        // forcing function anywhere in the four. So this drags for REAL from
        // the terminal panel's own port toward the file panel just minted,
        // and reads the DOM mid-gesture (pressPort/movePortTo/releasePort,
        // check link-draw.4's split of dragPortTo) for the target's OWN
        // data-panel-id — check 58's rule: a ring on the wrong panel still
        // renders A ring, so "does [data-link-target] exist anywhere" would
        // pass against exactly the regression this clause exists to catch.
        // Released cleanly afterward (readOnly is false throughout this
        // sub-block, so the drop actually resolves and completes rather than
        // leaving a draw in flight for the merged-view read below).
        //
        // A file panel opens at the CURRENT viewport's world centre
        // (__m13Open -> worldCentre()), which after the M13 block's own
        // railGoTo(M24_B) is right on top of the whole tight 260-unit M35
        // A/B/C/dormant cluster — and the file panel's default size (640x520
        // here) is large enough to cover all four of them entirely. Minted
        // AFTER them, it also paints ABOVE them, so a raw mousedown at
        // M24_A's port screen coordinate lands on the FILE PANEL's own body,
        // not on the port underneath it — confirmed by a debug read during
        // this fix: pressing there produced no ghost and no `canvas--linking`
        // class at all, i.e. the gesture never began, before this
        // railGoTo(M24_A) was added. `railGoTo` selects AND raises (the same
        // selectAndRaise every rail click already uses), which puts M24_A's
        // whole DOM subtree — port included — back on top of the file panel
        // in paint order, so the port genuinely receives the mousedown. Both
        // boxes are recomputed AFTER this call: the raise does not move
        // anything, but it is still a fresh read rather than reusing values
        // captured before the click, on the same discipline check link-draw.3's
        // `port2` re-read after its own far drag already applies.
        await railGoTo(M24_A)
        const onTerminalRaised = await portBox(M24_A, 'e')
        const fileBox = fileId ? await panelBox(fileId) : null
        let midGhost = null
        let midFileTarget = null
        if (onTerminalRaised && onTerminalRaised.zero !== true && fileBox) {
          pressPort(onTerminalRaised)
          movePortTo(onTerminalRaised, { x: Math.round(fileBox.cx), y: Math.round(fileBox.cy) })
          await settle()
          // The non-vacuity pairing check link-draw.4 already establishes: a ghost
          // that genuinely never painted (a gesture that silently failed to
          // begin) would satisfy "no ring on the file panel" for a reason
          // that has nothing to do with the ring's own wiring.
          midGhost = await wc.executeJavaScript(
            `document.querySelector('.link-layer__ghost') !== null`)
          midFileTarget = await wc.executeJavaScript(
            `document.querySelector('[data-panel-id="${fileId}"][data-link-target]') !== null`)
          await releasePort({ x: Math.round(fileBox.cx), y: Math.round(fileBox.cy) })
        }

        // Enter the merged view; ports must vanish on BOTH, because geometry
        // and links are read-only there and addLink would write to a
        // workspace record this canvas does not own.
        await MERGE_M24()
        await settle()
        const mergedFile = fileId ? await portBox(fileId, 'e') : null
        const mergedTerminal = await portBox(M24_A, 'e')
        await MERGE_M24()
        await settle()
        // WHOEVER APPENDS CHECK 180 INHERITS THIS: the drag above is released
        // over the file panel and COMMITS, so this block leaves a real link on
        // the canvas and a history entry behind it — the same standing
        // obligation check 20 hands down in verify-pty-manager.cjs. A later
        // check that counts links, or presses Cmd+Z expecting to undo its own
        // gesture, has to account for both.
        ok('link-draw.6 ports render on a file panel and vanish in the merged view, and the target ring lands on the file panel by id',
          Boolean(fileId) && onFile !== null && onFile.zero !== true &&
            onTerminal !== null && onTerminal.zero !== true &&
            midGhost === true && midFileTarget === true &&
            mergedFile === null && mergedTerminal === null,
          `fileId=${fileId} onFile=${JSON.stringify(onFile)} onTerminal=${JSON.stringify(onTerminal)} ` +
          `fileBox=${JSON.stringify(fileBox)} midGhost=${midGhost} midFileTarget=${midFileTarget} ` +
          `mergedFile=${JSON.stringify(mergedFile)} mergedTerminal=${JSON.stringify(mergedTerminal)}`)
      }
    }

    // -------------------------------------------------------------------
    // M37 — a git worktree per panel, end to end. Scoped id.
    // -------------------------------------------------------------------

    // worktree.1. A user preset flagged `worktree: true` spawns, through the
    //      real preset:spawn-by-id path, a panel whose inspector names a tc/
    //      branch and a path that exists on disk; closing the panel leaves
    //      the directory in place and worktree:list reports the record
    //      DETACHED. Three claims, one gesture each. Gated on git, loudly.
    {
      let gitHere = true
      try { execFileSync('git', ['--version'], { stdio: 'ignore' }) } catch { gitHere = false }
      if (!gitHere) {
        ok('worktree.1 a worktree preset spawns into a tc/ branch, and closing leaves it detached (SKIPPED — no git)', true, 'install git')
      } else {
        const repo = mkdtempSync(join(tmpdir(), 'tc panels wt repo '))
        const g = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
        g('init', '-q', '.'); g('config', 'user.email', 'v@e.com'); g('config', 'user.name', 'v')
        writeFileSync(join(repo, 'a.txt'), 'a\n'); g('add', '-A'); g('commit', '-qm', 'init')
        layoutStore.addPreset({ id: 'u-wt', name: 'wt preset', cwd: repo, command: '/bin/sh', args: [], worktree: true })
        const idsBefore = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        await wc.executeJavaScript(`window.canvas.preset.spawnById('u-wt')`)
        const fresh = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          const diff = now.filter((id) => !idsBefore.includes(id))
          return diff.length === 1 ? diff[0] : false
        }, 8000)
        const spawned = fresh ? await waitUntil(async () => (await sessionMap(wc)).has(fresh), 8000) : false
        // Select it with a real click on its chrome, so the inspector follows.
        let branch = null, path = null, rawField = null
        if (spawned) {
          const box = await wc.executeJavaScript(`(() => {
            const p = document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(fresh))} + '] .panel__chrome')
            if (!p) return null
            const r = p.getBoundingClientRect()
            return { x: Math.round(r.left + r.width * 0.3), y: Math.round(r.top + r.height / 2) }
          })()`)
          if (box) {
            wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
            wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
          }
          // M68: a path field is left-truncated on screen and carries the
          // whole path in its title — read that, since the check needs the
          // path on disk, not what a 260px column shows.
          const read = (k) => wc.executeJavaScript(
            `(() => { const el = document.querySelector('[data-inspector-field="${k}"] .inspector__value'); return el ? (el.getAttribute('title') || el.textContent) : null })()`)
          branch = await waitUntil(async () => { const v = await read('worktree'); return v && v.startsWith('tc/') ? v : false }, 6000)
          path = await read('worktree-path')
          rawField = await read('worktree')
        }
        const dirExisted = typeof path === 'string' && existsSync(path)
        // Close it through the rail row's own close control, the gesture
        // check 86 already trusts, and wait for the panel to leave the DOM.
        if (fresh) {
          await wc.executeJavaScript(`(() => {
            const b = document.querySelector('.rail-row[data-rail-row=' + ${JSON.stringify(JSON.stringify(fresh))} + '] .rail-row__close')
            if (b) { b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.dispatchEvent(new MouseEvent('click', { bubbles: true })) }
            return b !== null
          })()`)
          await waitUntil(async () => !(await wc.executeJavaScript(
            `document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(fresh))} + ']') !== null`)), 6000)
        }
        // worktree:list's `attached` reads the layout through
        // mergedWorkspaces(); flushing makes the read deterministic rather
        // than a race against the store's 500ms debounce.
        layoutStore.flushSync()
        const listed = await wc.executeJavaScript(`window.canvas.worktree.list()`)
        const record = Array.isArray(listed) ? listed.find((w) => w.panelId === fresh) : undefined
        const dirSurvived = typeof path === 'string' && existsSync(path)
        ok('worktree.1 a worktree preset spawns into a tc/ branch, and closing leaves it detached with the directory intact',
          typeof fresh === 'string' && spawned === true && typeof branch === 'string' && branch.startsWith('tc/' + fresh + '-') &&
            dirExisted && record !== undefined && record.attached === false && record.branch === branch && dirSurvived,
          `fresh=${fresh} spawned=${spawned} branch=${branch} rawField=${JSON.stringify(rawField)} path=${path} dirExisted=${dirExisted} ` +
            `record=${JSON.stringify(record)} listed=${JSON.stringify(listed)} dirSurvived=${dirSurvived}`)
        try { rmSync(repo, { recursive: true, force: true }) } catch { /* best effort */ }
      }
    }

    // -------------------------------------------------------------------
    // M39 — durable scrollback, end to end. Scoped id.
    // -------------------------------------------------------------------

    // scrollback.1. A panel prints a sentinel; the renderer reloads on the
    //      DIRECT backend, so the process dies and the panel restores DORMANT
    //      — the state every panel is in the moment the app relaunches — and
    //      the dormant card shows the sentinel from the log. Before M39 that
    //      card read "click to start" and nothing else; a restored canvas was
    //      twelve blank cards.
    {
      state.backend = createDirectBackend('verify: direct (m39 scrollback)')
      const idsBefore = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      wc.send(IPC_EVENTS.PRESET_SPAWN, {
        cwd: require('node:os').homedir(), command: '/bin/sh',
        args: ['-c', 'echo SCROLLBACK-SENTINEL-4471; exec sleep 30'], w: 400, h: 300
      })
      const fresh = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        const diff = now.filter((id) => !idsBefore.includes(id))
        return diff.length === 1 ? diff[0] : false
      }, 8000)
      // Let the sentinel reach the log: one flush, one append, one queued write.
      const logged = fresh
        ? await waitUntil(async () => (await scrollbackLog.tail(fresh, 3)).some((l) => l.includes('SCROLLBACK-SENTINEL-4471')), 8000)
        : false
      // Persist the layout so the reload restores this panel, then reload.
      layoutStore.flushSync()
      const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload()
      await reloaded
      const restored = fresh ? await waitUntil(async () => wc.executeJavaScript(
        `document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(fresh))} + '] .panel__card') !== null`), 10000) : false
      const card = fresh ? await waitUntil(async () => {
        const text = await wc.executeJavaScript(
          `(() => { const c = document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(fresh))} + '] .panel__card'); return c ? c.textContent : null })()`)
        return text && text.includes('SCROLLBACK-SENTINEL-4471') ? text : false
      }, 6000) : false
      const dormant = fresh ? await wc.executeJavaScript(
        `(window.__m4aSessions().find((s) => s.id === ${JSON.stringify(fresh)}) || {}).dormant === true`) : false
      ok('scrollback.1 after a reload on the direct backend, the dormant card shows the sentinel the panel printed',
        typeof fresh === 'string' && logged === true && restored === true && dormant === true &&
          typeof card === 'string' && card.includes('click to start'),
        `fresh=${fresh} logged=${logged} restored=${restored} dormant=${dormant} card=${JSON.stringify(card)} diag=${JSON.stringify({ inPtyList: (await sessionMap(wc)).has(fresh), session: await wc.executeJavaScript(`window.__m4aSessions().find((s) => s.id === ${JSON.stringify(fresh)}) || null`), liveXterm: await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(fresh))} + '] .xterm') !== null`), panels: await wc.executeJavaScript(`document.querySelectorAll('.panel').length`) })}`)
    }

    // -------------------------------------------------------------------
    // M40 — broadcast input: the exit and the chord. Scoped ids.
    // -------------------------------------------------------------------
    {
      state.backend = createDirectBackend('verify: direct (m40 broadcast)')
      const ids0 = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      // Two interactive shells, small, spawned through main's own push.
      for (let i = 0; i < 2; i++) {
        wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: require('node:os').homedir(), command: '/bin/sh', args: [], w: 300, h: 200 })
        await sleep(400)
      }
      const pair = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        const diff = now.filter((id) => !ids0.includes(id))
        return diff.length === 2 ? diff : false
      }, 8000)
      const [A, B] = pair || [null, null]
      const running = A && B ? await waitUntil(async () => { const m = await sessionMap(wc); return m.has(A) && m.has(B) }, 8000) : false
      // Chrome points by id (144b's shape), and a body point for focus.
      const pointIn = async (id, part) => wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas'); const b = host.getBoundingClientRect()
        const p = document.querySelector('.panel[data-panel-id=' + ${JSON.stringify(JSON.stringify(id))} + '] ' + ${JSON.stringify(part)})
        if (!p) return null
        const r = p.getBoundingClientRect()
        for (const f of [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.85, 0.5]]) {
          const x = Math.round(r.left + r.width * f[0]), y = Math.round(r.top + r.height * f[1])
          if (x < b.left + 2 || x > b.right - 2 || y < b.top + 2 || y > b.bottom - 2) continue
          const hit = document.elementFromPoint(x, y)
          if (hit && hit.closest(${JSON.stringify(part)}) === p && !hit.closest('button')) return { x, y }
        }
        return null
      })()`)
      const realClick = async (pt, modifiers = []) => {
        wc.sendInputEvent({ type: 'mouseDown', x: pt.x, y: pt.y, button: 'left', clickCount: 1, modifiers })
        wc.sendInputEvent({ type: 'mouseUp', x: pt.x, y: pt.y, button: 'left', clickCount: 1, modifiers })
        await sleep(200)
      }
      // B is topmost (spawned last) and may cover A's chrome; move B down out
      // of the way first, exactly as 144b does.
      if (running) {
        const bChrome = await pointIn(B, '.panel__chrome')
        if (bChrome) {
          wc.sendInputEvent({ type: 'mouseDown', x: bChrome.x, y: bChrome.y, button: 'left', clickCount: 1 })
          for (let i = 1; i <= 4; i++) wc.sendInputEvent({ type: 'mouseMove', x: bChrome.x, y: bChrome.y + 60 * i, button: 'left', modifiers: ['leftButtonDown'] })
          wc.sendInputEvent({ type: 'mouseUp', x: bChrome.x, y: bChrome.y + 240, button: 'left', clickCount: 1 })
          await settle()
        }
      }
      const aChrome = running ? await pointIn(A, '.panel__chrome') : null
      const bChrome2 = running ? await pointIn(B, '.panel__chrome') : null
      if (aChrome) await realClick(aChrome)
      if (bChrome2) await realClick(bChrome2, ['shift'])
      const selected = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel--selected')].map((p) => p.dataset.panelId)`)
      const aBody = running ? await pointIn(A, '.panel__slot') : null
      if (aBody) await realClick(aBody)
      const typeLine = async (text) => {
        for (const ch of text) wc.sendInputEvent({ type: 'char', keyCode: ch })
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
        wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      }
      const bannerText = () => wc.executeJavaScript(
        `(() => { const b = document.querySelector('.link-banner'); return b ? b.textContent : null })()`)
      const logsHave = async (token) => ({
        a: A ? (await scrollbackLog.tail(A, 12)).some((l) => l.includes(token)) : false,
        b: B ? (await scrollbackLog.tail(B, 12)).some((l) => l.includes(token)) : false
      })

      // broadcast.1. Armed through the palette the way a user does — ⌘K,
      //      "broadcast", Enter — a keystroke into the FOCUSED member reaches
      //      BOTH logs; the banner's own Stop control (a real click) ends the
      //      mode, and the next keystroke reaches ONE. The M39 log is the
      //      observable: every flush of every panel lands there, which is a
      //      cleaner reading than any renderer hook.
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await sleep(300)
      for (const ch of 'broadcast') wc.sendInputEvent({ type: 'char', keyCode: ch })
      await sleep(300)
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      const armed = await waitUntil(async () => { const t = await bannerText(); return t && t.includes('Broadcasting') ? t : false }, 4000)
      await typeLine('echo BCAST-ONE-7731')
      const both = await waitUntil(async () => { const h = await logsHave('BCAST-ONE-7731'); return h.a && h.b ? h : false }, 8000)
      const stopPt = await wc.executeJavaScript(`(() => {
        const s = document.querySelector('.link-banner__stop'); if (!s) return null
        const r = s.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
      if (stopPt) await realClick(stopPt)
      const stopped = await waitUntil(async () => (await bannerText()) === null, 3000)
      await typeLine('echo BCAST-TWO-7731')
      const oneA = await waitUntil(async () => (await logsHave('BCAST-TWO-7731')).a, 8000)
      await sleep(1500)
      const two = await logsHave('BCAST-TWO-7731')
      ok('broadcast.1 armed from the palette a keystroke reaches both logs; the banner\'s Stop ends the mode and the next reaches one',
        running === true && selected.length === 2 && typeof armed === 'string' && both !== false &&
          stopPt !== null && stopped === true && oneA === true && two.a === true && two.b === false,
        `selected=${JSON.stringify(selected)} armed=${JSON.stringify(armed)} both=${JSON.stringify(both)} stop=${JSON.stringify(stopPt)} ` +
          `stopped=${stopped} two=${JSON.stringify(two)}`)

      // broadcast.2. The chord: ⌘⇧I arms and disarms, matched on event.code
      //      (Shift rewrites the printed character). Dispatched, like every
      //      chord check here — what it proves is the listener, and .1 above
      //      proves the mode behind it.
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', key: 'I', metaKey: true, shiftKey: true, bubbles: true }))`)
      const chordOn = await waitUntil(async () => { const t = await bannerText(); return t && t.includes('Broadcasting') }, 3000)
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', key: 'I', metaKey: true, shiftKey: true, bubbles: true }))`)
      const chordOff = await waitUntil(async () => (await bannerText()) === null, 3000)
      ok('broadcast.2 Cmd+Shift+I arms the mode and again disarms it',
        chordOn === true && chordOff === true, `on=${chordOn} off=${chordOff}`)

      // broadcast.3. The two guards the M40 verifier found unpinned, the
      //      shape checks 34 and 7b/33b establish for every toggle chord: a
      //      HELD key (repeat:true) must not re-toggle, and the chord stands
      //      down while the palette owns the keyboard. The two-panel
      //      selection from broadcast.1 is still intact, so an ungated chord
      //      WOULD arm — that is what makes each assertion non-vacuous.
      //      Deleting `if (event.repeat) return` or `if (paletteIsOpen())
      //      return` from useBroadcastChord turns this red.
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', key: 'I', metaKey: true, shiftKey: true, repeat: true, bubbles: true }))`)
      await sleep(400)
      const repeatArmed = await bannerText()
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      const paletteUp = await waitUntil(async () => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 3000)
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', key: 'I', metaKey: true, shiftKey: true, bubbles: true }))`)
      await sleep(400)
      const gatedArmed = await bannerText()
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await waitUntil(async () => wc.executeJavaScript(`document.querySelector('.palette') === null`), 3000)
      ok('broadcast.3 the chord ignores auto-repeat and stands down while the palette is open',
        repeatArmed === null && paletteUp === true && gatedArmed === null,
        JSON.stringify({ repeatArmed, paletteUp, gatedArmed }))
    }

    // -------------------------------------------------------------------

    // M142 — cost.history.1 (backlog #19's history half). A panel with usage
    // that is CLOSED leaves one usage row in the run ledger (main's, at kill),
    // and the no-selection summary's `this week` line reads it back through
    // `ledger:usage` — three states on screen, the priced one here. The usage
    // comes from the harness's transcript fixture (the same file M17's cost
    // checks read), so the figure is the fixture's, never a number typed here.
    {
      const beforeRows = await runLedger.usage(0)
      // The fixture transcript every pinned session resolves to: one assistant
      // record with usage (the shell part's M17 block writes the same shape),
      // so the panel's Cost is the fixture's figure and never a number typed here.
      writeFileSync(usageFixtureFile, JSON.stringify({ type: 'assistant', cwd: '/tmp/x', sessionId: 's1', timestamp: '2026-08-30T00:00:00.000Z', isSidechain: false,
        message: { model: 'claude-opus-5', usage: { input_tokens: 2, output_tokens: 1095, cache_creation_input_tokens: 1491, cache_read_input_tokens: 120118 } } }) + '\n')
      // `sh -c 'sleep 120'`, never `cat`: pty-manager appends `--session-id
      // <uuid>` to an agent panel's args, and cat reads that as a file name,
      // exits 1 at once, and takes the pin — and every usage this check
      // exists to observe — with it (the shell part's M17 helper's reason).
      const spec = { cwd: '/tmp', command: '/bin/sh', args: ['-c', 'sleep 120'], agent: 'claude-code', w: 400, h: 300 }
      const idsBefore = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      wc.send(IPC_EVENTS.PRESET_SPAWN, spec)
      const chId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !idsBefore.includes(id)) ?? false
      }, 8000)
      if (typeof chId === 'string') await waitUntil(async () => (await sessionMap(wc)).has(chId), 8000)
      // The usage fixture: the harness maps every pinned session id to its fixture transcript.
      if (typeof chId === 'string') {
        await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-list--panels .rail-row[data-rail-row=' + ${JSON.stringify(JSON.stringify(chId))} + '] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
        await settle()
      }
      const usageSeen = typeof chId === 'string' ? await waitUntil(() => wc.executeJavaScript(`(() => { const u = window.__m17Usage ? window.__m17Usage(${JSON.stringify(chId)}) : 'no hook'; if (u === 'no hook') return 'no hook'; const el = document.querySelector('[data-usage-output]'); return u && u.totals && u.totals.input > 0 ? u.totals : (el ? 'section without store' : false) })()`), 12000) : false
      const ledgerProbe = await wc.executeJavaScript(`Promise.race([window.canvas.ledger.usage(0).then((r) => ({ ok: Array.isArray(r), n: r.length }), (e) => ({ error: String(e) })), new Promise((r) => setTimeout(() => r('timeout'), 3000))])`)
      if (typeof chId === 'string') await clickPanelClose(wc, chId)
      const rowsAfter = await waitUntil(async () => { const rows = await runLedger.usage(0); return rows.length > beforeRows.length ? rows : false }, 6000)
      const row = Array.isArray(rowsAfter) ? rowsAfter.find((r) => r.panelId === chId) : undefined
      await wc.executeJavaScript(`(() => { const host = document.querySelector('.canvas'); if (host) host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 })); return true })()`)
      await settle()
      const weekLine = await waitUntil(() => wc.executeJavaScript(`(document.querySelector('[data-summary="history"]') || {}).textContent ?? false`), 6000)
      ok('cost.history.1 closing a panel with usage appends one usage row to the run ledger, and the no-selection summary reads this week\'s history back as a priced figure with its session count',
        typeof chId === 'string' && usageSeen !== false && row !== undefined && row.kind === 'usage' && typeof row.turns === 'number' && Object.keys(row.byModel).length >= 1 &&
          typeof weekLine === 'string' && /\$/.test(weekLine) && /session/.test(weekLine),
        JSON.stringify({ chId, usageSeen, ledgerProbe, row, weekLine }))
    }
  }
})
