/* verify:panels:agents — one of the five parts of the old scripts/verify-panels.cjs (M135).
   Run with: npm run build && npm run verify:panels:agents
   The harness (scripts/panels-harness.cjs) boots the renderer; this file holds the
   checks the old file held at lines 14042–17397, moved verbatim, ids unchanged. */
// A throw while the harness LOADS (a bad require, a failed esbuild) never
// reaches runPanelsSuite's watchdog: Electron prints "App threw an error
// during load" and idles, which read as a 30-minute hang on 2026-09-14.
let runPanelsSuite
try { ({ runPanelsSuite } = require('./panels-harness.cjs')) } catch (error) { console.error('FAIL  harness failed to load:', error); process.exit(1) }

const WATCHDOG_MS = 113000 // measured 2026-09-07 alone in the Electron tier after M177 (tools.3, agent-card.1, firstrun.4 joined; the 109 s pin tripped once in a chained run), two green runs: 90.37 s, 90.15 s; 1.25x the slower, to the next second

runPanelsSuite('agents', WATCHDOG_MS, async (ctx) => {
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
  // check the M40 broadcast block's `createDirectBackend` (kinds) had made the DIRECT backend current, so that is what is current.
  {
    const TMUX = findTmux()
    if (TMUX) {
      const tmuxDir = mkdtempSync(join(tmpdir(), 'tc panels tmux '))
      const exitDir = join(tmuxDir, 'exit codes')
      mkdirSync(exitDir, { recursive: true })
      const confPath = join(tmuxDir, 'tmux.conf')
      writeFileSync(confPath, buildTmuxConf(exitDir, PANELS_SOCKET))
      state.tmuxBackend = createTmuxBackend({ tmuxPath: TMUX, exitDir, confPath, reason: 'verify: tmux', socket: PANELS_SOCKET })
      // the direct backend stays current
    }
  }

  {
    // M41 — handoff edges. Scoped ids. A seeded layout of four terminal
    // panels with two handoff rules on disk, reloaded so the rules arrive
    // through the durable door; the sessions are woken by real card clicks,
    // the source is driven to exit through its own PTY, and the observable
    // is the TARGET's M39 log — a bracketed paste that reached a PTY echoes
    // there, and nothing else in the renderer can say "this PTY received
    // these bytes".
    // -------------------------------------------------------------------
    {
      const rendererLog41 = []
      const onConsole41 = (_e, level, message) => { if (level >= 2) rendererLog41.push(String(message).slice(0, 220)) }
      const onGone41 = (_e, d) => rendererLog41.push('RENDER-GONE ' + JSON.stringify(d))
      wc.on('console-message', onConsole41)
      wc.on('render-process-gone', onGone41)
      try {
        state.backend = createDirectBackend('verify: direct (m41 handoff)')
        const home = require('node:os').homedir()
        const hPanel = (id, x, y, links) => ({
          kind: 'terminal', rect: { id, x, y, w: 320, h: 220 }, z: 1,
          spec: { panelId: id, cwd: home, command: '/bin/sh', args: [] },
          ...(links ? { links } : {})
        })
        const rule = (to) => [{ to, automation: { kind: 'handoff', enabled: true, trigger: 'exit' } }]
        // hA/hB/hC kept in the first ~800px so their cards are clickable (x:840
        // was off-screen in the first draft and cUp came back false); hD far off
        // screen, so its wake cannot spawn until the camera is framed onto it —
        // the "queued" arm made deterministic.
        layoutStore.save({
          panels: fromPanels([hPanel('hA', 60, 60, rule('hB')), hPanel('hB', 60, 340), hPanel('hC', 440, 60, rule('hD')), hPanel('hD', 6000, 60)]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const reloaded41 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded41
        const seeded = await waitUntil(async () => wc.executeJavaScript(
          `['hA', 'hB', 'hC', 'hD'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        const cardPoint = async (id) => wc.executeJavaScript(`(() => {
          const host = document.querySelector('.canvas'); const b = host.getBoundingClientRect()
          const p = document.querySelector('.panel[data-panel-id="${id}"] .panel__card')
          if (!p) return null
          const r = p.getBoundingClientRect()
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
          if (x < b.left + 2 || x > b.right - 2 || y < b.top + 2 || y > b.bottom - 2) return null
          return { x, y }
        })()`)
        // Wake a dormant card with a real click and wait for its PTY to exist —
        // no focus needed: typing goes through ptyManager.write(id, …), the same
        // deterministic path check "first" uses, so a missed body-click cannot
        // silently send the keystrokes nowhere.
        const wakeDiag41 = {}
        const wake41 = async (id) => {
          const pt = await cardPoint(id)
          wakeDiag41[id] = pt
          if (pt) {
            wc.sendInputEvent({ type: 'mouseDown', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
            wc.sendInputEvent({ type: 'mouseUp', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
          } else {
            // M135. In this part the inspector `showSentences` opens narrows
            // the canvas host, and hC's card can sit outside it; the rail
            // row's own start control is the production wake gesture (check
            // 85), used here only when the card is not clickable.
            wakeDiag41[id + ':rail'] = await wc.executeJavaScript(`(() => {
              const b = document.querySelector('.rail-row[data-rail-row="${id}"] .rail-row__start'); if (!b) return false
              b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
          }
          await settle()
          return await waitUntil(async () => (await sessionMap(wc)).has(id), 10000)
        }
        // The automation sentence renders in the inspector's automation LIST,
        // which shows every rule when ANY panel is selected. Select a live
        // panel through its rail row (goToPanel — never wakes) and open the
        // inspector, then read the result span by its data-automation-result.
        const showSentences = async (selectId) => {
          await wc.executeJavaScript(`(() => {
            const row = document.querySelector('.rail-row[data-rail-row="${selectId}"] .rail-row__main')
            if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            return !!row })()`)
          await settle()
          // Local: the M13 block's ensureInspectorOpen is out of scope here.
          // check 80 drives ⇧⌘\\ and never restores the inspector, so it may
          // be collapsed — a collapsed region still renders the automation
          // list but with a zero-sized rect, so open it before reading.
          const collapsed = await wc.executeJavaScript(
            `document.querySelector('.shell').className.includes('inspector-collapsed')`)
          if (collapsed) {
            await wc.executeJavaScript(`(() => {
              const b = document.querySelector('.shell__inspector-toggle')
              if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
              return true })()`)
            await settle()
          }
        }
        const resultOf = (key) => wc.executeJavaScript(
          `(() => { const el = document.querySelector('[data-automation-result="${key}"]'); return el ? el.textContent : null })()`)
        const logHas41 = async (id, token) => (await scrollbackLog.tail(id, 80)).some((l) => l.includes(token))

        // handoff.1. Both live. A prints a token and exits; B's log carries the
        //      token (the bracketed paste reached B's PTY) and a header naming
        //      the source, and the rule's row reads "handed off N lines after
        //      exit 0". ptyManager.write types into A's PTY directly — the
        //      observable throughout is the durable log, not a renderer hook.
        const bUp = seeded ? await wake41('hB') : false
        const aUp = seeded ? await wake41('hA') : false
        if (aUp) ptyManager.write('hA', 'echo HANDOFF-TOKEN-4411\rexit\r')
        const sourceRan = aUp ? await waitUntil(async () => logHas41('hA', 'HANDOFF-TOKEN-4411'), 10000) : false
        const delivered = await waitUntil(async () => (await logHas41('hB', 'HANDOFF-TOKEN-4411')) ? true : false, 12000)
        const header1 = await logHas41('hB', 'handoff from')
        await showSentences('hB')
        const row1 = await waitUntil(async () => { const t = await resultOf('hA:hB'); return t && /handed off \d+ lines after exit 0/.test(t) ? t : false }, 5000)
        ok('handoff.1 a handoff on exit pastes the source\'s recorded tail into the live target, and the row says how much',
          seeded === true && bUp === true && aUp === true && sourceRan === true &&
            delivered === true && header1 === true && typeof row1 === 'string',
          JSON.stringify({ seeded, bUp, aUp, sourceRan, delivered, header1, row1, renderer: rendererLog41.slice(-4) }))

        // M233 — edge.paint.1. THE FLOW GRAMMAR, AS PIXELS, AND WHY IT IS
        // HERE RATHER THAN IN A GOLDEN.
        //
        // The two new scenes (`edge-firing`, `edge-waiting`) exist so a critic
        // can LOOK at the states. They cannot be the regression signal: a gate
        // critic measured the pair and found they differ by 42 pixels (the
        // packet) while carrying ~400 pixels of antialias drift on a panel's
        // rounded corners between captures. A budget loose enough to tolerate
        // the drift cannot see the packet. Goldens are for looking; this is
        // for knowing.
        //
        // It runs HERE, on hA -> hB, because flow is a property of RULED
        // edges: every signal behind it comes from useHandoff, which walks
        // enabled handoff rules and nothing else. A plain link never fires,
        // and two earlier homes for this check (the core and shell fixtures)
        // reported `no-edge` and `rest` for exactly that reason — which is
        // itself worth knowing, and is why the failure said which.
        //
        // It covers the two failures this milestone actually hit, BOTH of
        // which left the DOM perfectly correct:
        //   * the packet painted, positioned and invisible — once behind
        //     three panels, once behind the navigator rail;
        //   * the whole grammar culled at the wrong tier, so nothing animated
        //     at 100% and everything animated at 8%.
        {
          const line = () => wc.executeJavaScript(`(() => {
            const l = document.querySelector('.link-layer__line[data-link="hA hB"]')
            return l === null ? null : { stroke: getComputedStyle(l).stroke, act: l.getAttribute('data-edge-activity') } })()`)
          // Driven through the store's own door at a frozen instant, not by
          // waiting on the real handoff above: the real fire is real (and it
          // did light this edge — the first run of this check caught it
          // mid-flight) but its timing against this check is uncontrolled,
          // and a check that depends on landing inside a 900 ms window is a
          // flake waiting for a slower machine.
          await wc.executeJavaScript(`(() => { const n = Date.now(); window.__m233Flow('fired', 'hA', 'hB'); window.__m233Freeze(n + 450); return true })()`)
          await settle(); await sleep(250)
          const lit = await line()
          const packet = await wc.executeJavaScript(`(() => {
            const p = document.querySelector('.link-layer__packet')
            if (p === null) return null
            const r = p.getBoundingClientRect()
            const host = document.querySelector('.canvas').getBoundingClientRect()
            const el = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2))
            // WHO OWNS THE PIXEL. The packet's own hit stroke sitting over it
            // is fine — it is transparent and exists only to take a pointer.
            // A PANEL over it is not: that is the failure this arm exists for,
            // and a rect-inside-the-host test alone reports it as a pass.
            const covered = el !== null && el.closest('.panel') !== null
            return { w: Math.round(r.width), fill: getComputedStyle(p).fill, covered,
              inHost: r.x > host.left && r.right < host.right && r.y > host.top && r.bottom < host.bottom } })()`)
          await wc.executeJavaScript(`(() => { window.__m233Flow('thaw', '', ''); return true })()`)
          // Past EDGE_FIRE_MS, so the fire lapses on the store's own timer
          // rather than because anything told it to. A fire that never ended
          // would leave a packet parked on the edge for the life of the run.
          // EXPIRY IS NOT ASSERTED HERE, and the reason is worth writing
          // down rather than leaving as an absence.
          //
          // A fire lapsing back to whatever the edge otherwise is, is a
          // property of the MODEL, and `edge.flow.4` in verify:viewport
          // already proves it against a frozen clock: a stale fire reads
          // `armed`. Re-asserting it in a real-Electron fixture measured the
          // edge still `firing` four seconds after the thaw. The likeliest
          // explanation is that this fixture's source is `/bin/sh` with no
          // arguments — it exits at once, and an exit is what fires a
          // handoff — so the edge may simply be firing again and again; that
          // was NOT confirmed, and it is recorded as a hypothesis rather
          // than a finding.
          //
          // Either way the arm was buying nothing: the model already covers
          // expiry, and this check exists for the thing the model cannot
          // see, which is whether the packet reaches the screen.
          ok('edge.paint.1 a fire lifts the ruled edge\'s computed stroke and paints a packet with a real size, inside the canvas host and NOT under a panel — the two failures this milestone hit (a packet under a panel, and the grammar culled at the wrong tier) both left the DOM correct; expiry is edge.flow.4\'s job',
            lit !== null && lit.act === 'firing' && packet !== null && packet.w >= 4 &&
              packet.inHost === true && packet.covered === false,
            JSON.stringify({ lit, packet }))
        }

        // handoff.2. The target is dormant AND off screen. After the exit the
        //      row reads "queued", the target is woken but NOT spawned (no
        //      fitted terminal — the fit-before-spawn rule), and framing it
        //      through its rail row promotes, spawns and delivers the queue.
        const cUp = seeded ? await wake41('hC') : false
        if (cUp) ptyManager.write('hC', 'echo HANDOFF-TOKEN-4412\rexit\r')
        const sourceRan2 = cUp ? await waitUntil(async () => logHas41('hC', 'HANDOFF-TOKEN-4412'), 10000) : false
        await showSentences('hC')
        const queued = await waitUntil(async () => { const t = await resultOf('hC:hD'); return t && /queued/.test(t) ? t : false }, 12000)
        const dState = (await wc.executeJavaScript(`window.__m4aSessions()`)).find((x) => x.id === 'hD') || null
        const framed = await wc.executeJavaScript(`(() => {
          const row = document.querySelector('.rail-row[data-rail-row="hD"] .rail-row__main'); if (!row) return false
          row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
        const dUp = framed ? await waitUntil(async () => (await sessionMap(wc)).has('hD'), 15000) : false
        const delivered2 = await waitUntil(async () => (await logHas41('hD', 'HANDOFF-TOKEN-4412')) ? true : false, 15000)
        await showSentences('hC')
        const row2 = await waitUntil(async () => { const t = await resultOf('hC:hD'); return t && /handed off \d+ lines after exit 0/.test(t) ? t : false }, 5000)
        ok('handoff.2 an off-screen dormant target is woken but not spawned, the row says queued, and framing it delivers',
          cUp === true && sourceRan2 === true && typeof queued === 'string' && dState !== null && dState.dormant === false && dState.spawned === false &&
            framed === true && dUp === true && delivered2 === true && typeof row2 === 'string',
          JSON.stringify({ cUp, sourceRan2, queued, dState, framed, dUp, delivered2, row2, wakeDiag41, renderer: rendererLog41.slice(-4) }))
      } catch (handoffErr) {
        ok('handoff.1 a handoff on exit pastes the source\'s recorded tail into the live target, and the row says how much',
          false, 'threw: ' + String(handoffErr && handoffErr.message || handoffErr) + ' | renderer: ' + (rendererLog41.slice(-8).join(' || ') || '(none)'))
        ok('handoff.2 an off-screen dormant target is woken but not spawned, the row says queued, and framing it delivers',
          false, 'threw (see handoff.1)')
      } finally {
        wc.removeListener('console-message', onConsole41)
        wc.removeListener('render-process-gone', onGone41)
      }
    }

    // -------------------------------------------------------------------
    // M42 — search across every panel, over the durable log. Scoped id.
    // Two seeded panels print two different sentinels; Cmd+F, type one, the
    // matching row appears, Enter frames THAT panel (camera moved, selection
    // set) and wakes nothing.
    // -------------------------------------------------------------------
    {
      const sLog = []
      const onS = (_e, level, message) => { if (level >= 2) sLog.push(String(message).slice(0, 200)) }
      wc.on('console-message', onS)
      try {
        // keyboard.1's race, one block earlier: handoff.2 ends by FRAMING its
        // target, a camera flight that saves every frame, and a late frame
        // overwrote the seed below (seededS=false). Seed once the camera is still.
        {
          let last = null
          await waitUntil(async () => {
            const now = JSON.stringify(await wc.executeJavaScript(`window.__m4aViewport()`))
            const still = now === last
            last = now
            return still
          }, 4000, 150)
          await settle()
        }
        state.backend = createDirectBackend('verify: direct (m42 search)')
        const home = require('node:os').homedir()
        const sPanel = (id, x) => ({
          kind: 'terminal', rect: { id, x, y: 60, w: 320, h: 220 }, z: 1,
          spec: { panelId: id, cwd: home, command: '/bin/sh', args: [] }
        })
        layoutStore.save({ panels: fromPanels([sPanel('sX', 60), sPanel('sY', 440)]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reloadedS = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reloadedS
        const seededS = await waitUntil(async () => wc.executeJavaScript(
          `['sX', 'sY'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        const cardPtS = async (id) => wc.executeJavaScript(`(() => {
          const host = document.querySelector('.canvas'); const b = host.getBoundingClientRect()
          const p = document.querySelector('.panel[data-panel-id="${id}"] .panel__card'); if (!p) return null
          const r = p.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
          if (x < b.left + 2 || x > b.right - 2 || y < b.top + 2 || y > b.bottom - 2) return null
          return { x, y } })()`)
        const wakeS = async (id) => {
          const pt = await cardPtS(id)
          if (pt) { wc.sendInputEvent({ type: 'mouseDown', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
                    wc.sendInputEvent({ type: 'mouseUp', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }) }
          await settle()
          return await waitUntil(async () => (await sessionMap(wc)).has(id), 10000)
        }
        const xUp = seededS ? await wakeS('sX') : false
        const yUp = seededS ? await wakeS('sY') : false
        // Two DIFFERENT sentinels, each printed by its own panel.
        if (xUp) ptyManager.write('sX', 'echo SEARCH-ONLY-IN-XX-8801\r')
        if (yUp) ptyManager.write('sY', 'echo SEARCH-ONLY-IN-YY-8802\r')
        const xLogged = xUp ? await waitUntil(async () => (await scrollbackLog.tail('sX', 20)).some((l) => l.includes('SEARCH-ONLY-IN-XX-8801')), 10000) : false
        const yLogged = yUp ? await waitUntil(async () => (await scrollbackLog.tail('sY', 20)).some((l) => l.includes('SEARCH-ONLY-IN-YY-8802')), 10000) : false
        // Cmd+F opens the search scope; type the X sentinel; the row appears.
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', metaKey: true, bubbles: true }))`)
        const paletteUp = await waitUntil(async () => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 4000)
        const chip = await wc.executeJavaScript(`(() => { const c = document.querySelector('.palette__scope, .palette__chip'); return c ? c.textContent : null })()`)
        // React's controlled <input> ignores a plain value assignment and a raw
        // char event: the native setter plus a dispatched 'input' is what makes
        // the query reach React (the rename check's own rule, ~line 2871).
        await wc.executeJavaScript(`(() => {
          const input = document.querySelector('.palette__input'); if (!input) return false
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'SEARCH-ONLY-IN-XX-8801')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return true })()`)
        // A hit row for sX appears (its id encodes the panel), and NOT for sY.
        const rowSel = `.palette [data-command-id^="search.hit.sX."]`
        const hitRow = await waitUntil(async () => wc.executeJavaScript(`document.querySelector('${rowSel}') !== null`), 6000)
        const noSY = await wc.executeJavaScript(`document.querySelector('.palette [data-command-id^="search.hit.sY."]') === null`)
        // Selection + camera before, to prove Enter MOVED the camera onto sX.
        const camBefore = await wc.executeJavaScript(`window.__m4aViewport()`)
        // Enter runs the highlighted row (goToPanel sX).
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
        const closed = await waitUntil(async () => wc.executeJavaScript(`document.querySelector('.palette') === null`), 4000)
        const selectedX = await waitUntil(async () => wc.executeJavaScript(`document.querySelector('.panel--selected')?.dataset.panelId === 'sX'`), 4000)
        const camAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
        const moved = camBefore && camAfter && (camBefore.x !== camAfter.x || camBefore.y !== camAfter.y)
        ok('search.1 Cmd+F opens the search scope, a typed sentinel surfaces its panel\'s row, and Enter frames and selects that panel',
          seededS === true && xUp === true && yUp === true && xLogged === true && yLogged === true &&
            paletteUp === true && hitRow === true && noSY === true && closed === true && selectedX === true && moved === true,
          JSON.stringify({ seededS, xUp, yUp, xLogged, yLogged, paletteUp, chip, hitRow, noSY, closed, selectedX, moved, cam: [camBefore, camAfter], renderer: sLog.slice(-4) }))
      } catch (searchErr) {
        ok('search.1 Cmd+F opens the search scope, a typed sentinel surfaces its panel\'s row, and Enter frames and selects that panel',
          false, 'threw: ' + String(searchErr && searchErr.message || searchErr) + ' | renderer: ' + (sLog.slice(-6).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onS)
      }
    }

    // -------------------------------------------------------------------
    // M43 — attention beyond the window. Scoped id. The ONE renderer path
    // that actually works across the design: a clicked OS notification (main
    // sends ATTENTION_JUMP) frames its panel through goToPanel — the Cmd+J
    // path, which NEVER wakes. tmux-free and reload-free: the flawed snapshot
    // (decision 5, overruled) is not tested because detachAll empties main's
    // map on reload, so it is inert in production and would only pass here.
    // -------------------------------------------------------------------
    {
      const jLog = []
      const onJ = (_e, level, message) => { if (level >= 2) jLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onJ)
      try {
        state.backend = createDirectBackend('verify: direct (m43 attention)')
        const home = require('node:os').homedir()
        const jP = (id, x) => ({ kind: 'terminal', rect: { id, x, y: 60, w: 320, h: 220 }, z: 1,
          spec: { panelId: id, cwd: home, command: '/bin/sh', args: [] } })
        // jHere on screen, jFar far off — the jump must move the camera onto jFar.
        layoutStore.save({ panels: fromPanels([jP('jHere', 60), jP('jFar', 9000)]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reJ = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reJ
        const seededJ = await waitUntil(async () => wc.executeJavaScript(
          `['jHere', 'jFar'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        const camBefore = await wc.executeJavaScript(`window.__m4aViewport()`)
        const farLiveBefore = (await wc.executeJavaScript(`window.__m4aSessions()`)).some((x) => x.id === 'jFar' && x.spawned)
        // Main's notification click: send ATTENTION_JUMP for the off-screen panel.
        wc.send(IPC_EVENTS.ATTENTION_JUMP, 'jFar')
        const selectedFar = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.panel--selected')?.dataset.panelId === 'jFar'`), 4000)
        const camAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
        const moved = camBefore && camAfter && (camBefore.x !== camAfter.x || camBefore.y !== camAfter.y)
        await settle()
        const farLiveAfter = (await wc.executeJavaScript(`window.__m4aSessions()`)).some((x) => x.id === 'jFar' && x.spawned)
        const farHasPty = (await sessionMap(wc)).has('jFar')
        ok('attention.1 a clicked notification (ATTENTION_JUMP) frames its panel and selects it, and never wakes it',
          seededJ === true && selectedFar === true && moved === true &&
            farLiveBefore === false && farLiveAfter === false && farHasPty === false,
          JSON.stringify({ seededJ, selectedFar, moved, farLiveBefore, farLiveAfter, farHasPty, cam: [camBefore, camAfter], renderer: jLog.slice(-4) }))
      } catch (jErr) {
        ok('attention.1 a clicked notification (ATTENTION_JUMP) frames its panel and selects it, and never wakes it',
          false, 'threw: ' + String(jErr && jErr.message || jErr) + ' | renderer: ' + (jLog.slice(-6).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onJ)
      }
    }

    // -------------------------------------------------------------------
    // M44 — a keyboard-first canvas. Scoped ids. Two panels side by side;
    // Cmd+Arrow traverses selection (never wakes), Cmd+Enter wakes+focuses,
    // Cmd+Escape leaves the terminal, and every panel names itself to a
    // screen reader.
    // -------------------------------------------------------------------
    {
      const kLog = []
      const onK = (_e, level, message) => { if (level >= 2) kLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onK)
      try {
        // attention.1 ends on ATTENTION_JUMP, a camera FLIGHT, and the page
        // saves its layout on every frame of it. main's save() merges into the
        // active workspace last-write-wins, so a frame arriving after the seed
        // below restored jHere/jFar and the reload never showed kA/kB
        // (seededK=false, and keyboard.1–4 red with it). Seed once the old
        // page's camera has stopped moving.
        {
          let last = null
          await waitUntil(async () => {
            const now = JSON.stringify(await wc.executeJavaScript(`window.__m4aViewport()`))
            const still = now === last
            last = now
            return still
          }, 4000, 150)
          await settle()
        }
        state.backend = createDirectBackend('verify: direct (m44 keyboard)')
        const home = require('node:os').homedir()
        const kP = (id, x) => ({ kind: 'terminal', rect: { id, x, y: 60, w: 300, h: 220 }, z: 1,
          spec: { panelId: id, cwd: home, command: '/bin/sh', args: [] } })
        // kA left, kB to its right, both on screen.
        layoutStore.save({ panels: fromPanels([kP('kA', 60), kP('kB', 460)]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reK = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reK
        const seededK = await waitUntil(async () => wc.executeJavaScript(
          `['kA', 'kB'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        const selectedNow = () => wc.executeJavaScript(`document.querySelector('.panel--selected')?.dataset.panelId ?? null`)
        // Select kA through its rail row (goToPanel — selects without waking).
        await wc.executeJavaScript(`(() => {
          const row = document.querySelector('.rail-row[data-rail-row="kA"] .rail-row__main')
          if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
        await settle()
        const selA = await selectedNow()

        // keyboard.1. Cmd+Right selects kB (to the right of kA) and spawns
        //      NOTHING — traversal frames and raises, never wakes.
        const bLiveBefore = (await sessionMap(wc)).has('kB')
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', metaKey: true, bubbles: true }))`)
        const selB = await waitUntil(async () => (await selectedNow()) === 'kB', 4000)
        await settle()
        const bLiveAfter = (await sessionMap(wc)).has('kB')
        ok('keyboard.1 Cmd+Right moves the selection to the panel on the right and wakes nothing',
          seededK === true && selA === 'kA' && selB === true && bLiveBefore === false && bLiveAfter === false,
          JSON.stringify({ seededK, selA, selB, bLiveBefore, bLiveAfter }))

        // keyboard.2. Cmd+Enter on the selection (kB) wakes AND focuses it —
        //      the deliberate second key. kB now spawns a PTY.
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', metaKey: true, bubbles: true }))`)
        const bWoke = await waitUntil(async () => (await sessionMap(wc)).has('kB'), 8000)
        ok('keyboard.2 Cmd+Enter wakes and focuses the selection',
          bWoke === true, JSON.stringify({ bWoke }))

        // keyboard.3. Cmd+Escape leaves the terminal: DOM focus moves OFF
        //      xterm's hidden textarea and onto the canvas host (role
        //      application), so Tab from there walks the chrome.
        // Focus kB's terminal body with a real click first.
        const bodyPt = await wc.executeJavaScript(`(() => {
          const host = document.querySelector('.canvas'); const b = host.getBoundingClientRect()
          const el = document.querySelector('.panel[data-panel-id="kB"] .panel__slot'); if (!el) return null
          const r = el.getBoundingClientRect(); const x = Math.round(r.left + r.width/2), y = Math.round(r.top + r.height/2)
          if (x < b.left+2 || x > b.right-2 || y < b.top+2 || y > b.bottom-2) return null
          return { x, y } })()`)
        if (bodyPt) { wc.sendInputEvent({ type: 'mouseDown', x: bodyPt.x, y: bodyPt.y, button: 'left', clickCount: 1 })
                      wc.sendInputEvent({ type: 'mouseUp', x: bodyPt.x, y: bodyPt.y, button: 'left', clickCount: 1 }); await settle() }
        const onTextareaBefore = await wc.executeJavaScript(`!!(document.activeElement && document.activeElement.classList.contains('xterm-helper-textarea'))`)
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', metaKey: true, bubbles: true }))`)
        const leftTerminal = await waitUntil(async () => wc.executeJavaScript(
          `!(document.activeElement && document.activeElement.classList.contains('xterm-helper-textarea'))`), 3000)
        const onHost = await wc.executeJavaScript(`document.activeElement === document.querySelector('.canvas[role="application"]')`)
        ok('keyboard.3 Cmd+Escape moves DOM focus off xterm and onto the canvas host',
          bodyPt !== null && onTextareaBefore === true && leftTerminal === true && onHost === true,
          JSON.stringify({ onTextareaBefore, leftTerminal, onHost }))

        // keyboard.4. Names for a screen reader: every panel is a role=group
        //      with an aria-label, and the rail's Attention list is aria-live.
        const roles = await wc.executeJavaScript(`(() => {
          const p = document.querySelector('.panel[data-panel-id="kA"]')
          // M46: Attention is a dock badge plus a popover; the always-mounted
          // live region is the badge.
          const att = document.querySelector('[data-dock-badge]')
          const host = document.querySelector('.canvas[role="application"]')
          return {
            role: p && p.getAttribute('role'),
            label: p && p.getAttribute('aria-label'),
            live: att && att.getAttribute('aria-live'),
            hostLabel: host && host.getAttribute('aria-label'),
            hostDesc: host && host.getAttribute('aria-roledescription')
          } })()`)
        ok('keyboard.4 panels are role=group with an aria-label, the Attention list is aria-live, and the host is a named application',
          roles.role === 'group' && typeof roles.label === 'string' && /terminal/.test(roles.label) &&
            roles.live === 'polite' && roles.hostLabel === 'Canvas' && typeof roles.hostDesc === 'string' && roles.hostDesc.length > 0,
          JSON.stringify(roles))
      } catch (kErr) {
        for (const id of ['keyboard.1 Cmd+Right moves the selection to the panel on the right and wakes nothing',
          'keyboard.2 Cmd+Enter wakes and focuses the selection',
          'keyboard.3 Cmd+Escape moves DOM focus off xterm and onto the canvas host',
          'keyboard.4 panels are role=group with an aria-label, the Attention list is aria-live, and the host is a named application'])
          ok(id, false, 'threw: ' + String(kErr && kErr.message || kErr) + ' | renderer: ' + (kLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onK)
      }
    }

    // -------------------------------------------------------------------
    // M45 — the visual language. theme.1: switching the setting to dark
    // stamps data-theme on <html>, the xterm option theme changes on a LIVE
    // and a DETACHED session, and the card's slot background is the theme's
    // --well. targets.1: every icon control measures >= 24x24 (WCAG 2.5.8).
    // reveal.1: a rail row's close control is invisible at rest and visible
    // on :focus-within, and the dormant start control is visible at rest.
    // -------------------------------------------------------------------
    {
      const vLog = []
      const onV = (_e, level, message) => { if (level >= 2) vLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onV)
      const IDS = [
        'theme.1 switching to dark stamps data-theme, retunes the xterm theme on a live AND a detached session, and the card slot follows',
        'targets.1 every icon control measures at least 24x24',
        'reveal.1 a rail row\'s close and start controls are hidden at rest and revealed on :focus-within (the rest rule, M171)'
      ]
      try {
        state.backend = createDirectBackend('verify: direct (m45 visual)')
        const home = require('node:os').homedir()
        const vP = (id, x) => ({ kind: 'terminal', rect: { id, x, y: 60, w: 300, h: 220 }, z: 1,
          spec: { panelId: id, cwd: home, command: '/bin/sh', args: [] } })
        // vA on screen (goes live when focused); vB 40,000 world units away —
        // never on screen, so it stays a card and its terminal stays
        // detached. Both start DORMANT (nothing spawns until clicked).
        layoutStore.save({ panels: fromPanels([vP('vA', 60), vP('vB', 40000)]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        // Start from LIGHT, not `system`: the harness machine may be in dark
        // mode, in which case `system` already resolves to dark and a switch
        // to dark would change nothing — the check would pass or fail for the
        // OS's reason rather than the app's.
        layoutStore.setPreference('appearance.theme', 'light')
        layoutStore.flushSync()
        const reV = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reV
        await waitUntil(async () => wc.executeJavaScript(
          `['vA', 'vB'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        // Wake vA so it has a LIVE terminal: click its card.
        // The mousedown carries the card's CENTRE: a dispatched event with no
        // clientX/Y reaches Canvas's hit test at screen (0,0) and wakes
        // nothing — which is how this block's first cut ran with vA never
        // live and its "live AND detached" clause half-vacuous.
        await wc.executeJavaScript(`(() => {
          const card = document.querySelector('.panel[data-panel-id="vA"] .panel__card')
          if (!card) return false
          const r = card.getBoundingClientRect()
          card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        const vAWoke = await waitUntil(async () => (await sessionMap(wc)).has('vA'), 10000)
        await settle()
        const themeOf = (id) => wc.executeJavaScript(`window.__m45TerminalTheme ? window.__m45TerminalTheme(${JSON.stringify(id)}) : null`)
        // The CARD's own ground (a card has no .panel__slot — that is the live
        // tier's element), against the probe of the token it should equal.
        const cardBg = () => wc.executeJavaScript(`(() => {
          const panel = document.querySelector('.panel[data-panel-id="vB"]')
          const probe = document.createElement('div'); probe.style.color = 'var(--panel-bg)'; document.body.appendChild(probe)
          const want = getComputedStyle(probe).color; probe.remove()
          return { got: panel ? getComputedStyle(panel).backgroundColor : null, want } })()`)
        const before = {
          attr: await wc.executeJavaScript(`document.documentElement.dataset.theme ?? null`),
          a: await themeOf('vA'), b: await themeOf('vB'), card: await cardBg()
        }
        // The switch, through the same invoke the palette row and the menu
        // use — NOT a direct DOM stamp, which would prove nothing about the
        // path a user's click takes.
        await wc.executeJavaScript(`window.canvas.settings.set('appearance.theme', 'dark')`)
        const stamped = await waitUntil(async () => wc.executeJavaScript(`document.documentElement.dataset.theme === 'dark'`), 5000)
        await settle()
        const after = {
          attr: await wc.executeJavaScript(`document.documentElement.dataset.theme ?? null`),
          a: await themeOf('vA'), b: await themeOf('vB'), card: await cardBg()
        }
        ok(IDS[0],
          vAWoke === true && stamped && after.attr === 'dark' && before.attr === 'light' &&
            // M109: the Obsidian well; themes.ts and --well move together. M279 re-valued it navy.
            before.a === '#ffffff' && after.a === '#0a0e19' &&
            before.b === '#ffffff' && after.b === '#0a0e19' &&
            before.card.got === before.card.want && after.card.got === after.card.want &&
            before.card.got !== after.card.got,
          JSON.stringify({ before, after }))

        // targets.1. Measured, not declared: getBoundingClientRect on every
        //      icon control present, at camera scale 1. .rail-row__start is
        //      present because vB is dormant.
        // M46: two passes, because the navigator shows ONE pane — the
        // dormant start control lives in Panels, the rename and add controls
        // in Workspaces.
        const measure = (sel) => wc.executeJavaScript(`(() => {
          const sel = ${JSON.stringify(sel)}
          const out = []
          for (const s of sel) {
            // A 0x0 rect is an element display:none'd by a collapsed column
            // (the tree is closed by default), not a small target; skip it,
            // but every selector must still have at least one RENDERED match.
            const els = [...document.querySelectorAll(s)]
              .map((el) => el.getBoundingClientRect())
              .filter((r) => r.width > 0 || r.height > 0)
            if (els.length === 0) { out.push({ s, missing: true }); continue }
            for (const r of els) out.push({ s, w: Math.round(r.width), h: Math.round(r.height) })
          }
          return out })()`)
        const dockClickT = (name) => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="' + ${JSON.stringify(name)} + '"]'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
        await wc.executeJavaScript(`document.querySelector('.shell__view-trigger')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`); await settle()
        const targetsA = await measure(['.rail-row__start', '.rail-row__close', '.panel__close',
          '.shell__settings', '[data-hud-zoom-in]', '[data-hud-zoom-out]',
          '[data-dock]', '.shell__rail-toggle', '.shell__inspector-toggle', '.shell__merge'])
        await wc.executeJavaScript(`document.querySelector('.shell__view-trigger')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`); await settle()
        await dockClickT('workspaces'); await settle()
        const targetsB = await measure(['.rail-row__rename', '.shell__region-add'])
        await dockClickT('panels'); await settle()
        const targets = [...targetsA, ...targetsB]
        const small = targets.filter((t) => t.missing || t.w < 24 || t.h < 24)
        ok(IDS[1], targets.length > 0 && small.length === 0, JSON.stringify(small.slice(0, 8)))

        // reveal.1. Computed opacity, which is what a person sees. Focus is
        //      put on the control itself so :focus-within on the row applies;
        //      the window is focused first, because :focus needs a focused
        //      frame to match.
        wc.focus()
        const reveal = await wc.executeJavaScript(`(() => {
          const rowA = document.querySelector('.rail-row[data-rail-row="vA"]')
          const rowB = document.querySelector('.rail-row[data-rail-row="vB"]')
          const closeA = rowA && rowA.querySelector('.rail-row__close')
          const startB = rowB && rowB.querySelector('.rail-row__start')
          const rest = { close: closeA ? getComputedStyle(closeA).opacity : null, start: startB ? getComputedStyle(startB).opacity : null }
          if (closeA) closeA.focus()
          return { rest, active: document.activeElement === closeA } })()`)
        // Read AFTER the --dur-1 opacity transition, not in the same tick as
        // focus(): a computed opacity mid-transition is still 0.
        await settle()
        const revealed = await wc.executeJavaScript(`(() => {
          const closeA = document.querySelector('.rail-row[data-rail-row="vA"] .rail-row__close')
          return closeA ? getComputedStyle(closeA).opacity : null })()`)
        reveal.focused = { close: revealed, active: reveal.active }
        // M171. The rest rule reached the rail: `start` rests at 0 like the close
        //     and reveals with it on :focus-within (it was pinned at 1 at rest
        //     from M66 to M170 — a dormant row's only stated verb).
        const startB = await wc.executeJavaScript(`(() => { const s = document.querySelector('.rail-row[data-rail-row="vB"] .rail-row__start'); if (!s) return null; s.focus(); return true })()`)
        await settle()
        reveal.startFocused = startB ? await wc.executeJavaScript(`(() => { const s = document.querySelector('.rail-row[data-rail-row="vB"] .rail-row__start'); return s ? getComputedStyle(s).opacity : null })()`) : null
        ok(IDS[2],
          reveal.rest.close === '0' && reveal.rest.start === '0' && reveal.focused.active && reveal.focused.close === '1' && reveal.startFocused === '1',
          JSON.stringify(reveal))
        // Restore the setting so later checks (and the next run) start light.
        await wc.executeJavaScript(`window.canvas.settings.set('appearance.theme', 'system')`)
        await settle()
      } catch (vErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(vErr && vErr.message || vErr) + ' | renderer: ' + (vLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onV)
      }
    }

    // -------------------------------------------------------------------
    // M46 — the interface architecture: dock | one navigator | canvas |
    // context. shell.1: at the Standard breakpoint, with nothing persisted,
    // the canvas is the window less the dock and one pane, and a panel is
    // still promoted. shell.2: switching navigator panes spawns nothing,
    // through REAL clicks that move no focus, and the Attention icon carries
    // the waiting count. drawer.1: below Compact the navigator is a drawer
    // dismissed by Escape and by an outside click, and a wheel over it moves
    // no camera. ctx.1/ctx.2: the context pane's pinned header with every
    // tab, and the gated Close. hud.1: the zoom cluster in the HUD. empty.1:
    // the Panels pane's empty state.
    // -------------------------------------------------------------------
    {
      const sLog = []
      const onS = (_e, level, message) => { if (level >= 2) sLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onS)
      const IDS = [
        'shell.1 at Standard with nothing persisted the canvas is the window less the dock and one navigator pane, and a panel is still promoted',
        'shell.2 switching navigator panes through real clicks spawns nothing and moves no focus, and the Attention icon carries the waiting count',
        'drawer.1 below Compact the navigator is a drawer: opened from the dock, dismissed by Escape and by an outside click, and a wheel over it moves no camera',
        'ctx.1 the identity header is on screen with each of the three tabs active, and inactive tabs stay rendered but hidden',
        'ctx.2 Close in the context pane is destructive and gated: one click arms, the second closes, read back from the panel list',
        'hud.1 the zoom cluster lives in the HUD, a wheel over it moves no camera, and Merged is an icon toggle with aria-pressed',
        'empty.1 the Panels pane with no panels says so rather than rendering nothing'
      ]
      const dockClick = (name) => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="' + ${JSON.stringify(name)} + '"]'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
      // Block-scoped, like every other block's: the one at ~4133 is not
      // reachable here.
      const panelIds = () => wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-id]')].map((p) => p.dataset.panelId)`)
      const frame = () => wc.executeJavaScript(`(() => {
        const g = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().width : null }
        return { window: window.innerWidth, bp: document.querySelector('.shell')?.dataset.bp ?? null,
          dock: g('.shell__dock'), nav: g('.shell__rail'), ctx: g('.shell__inspector'), canvas: g('.canvas'),
          live: document.querySelectorAll('.panel .xterm').length } })()`)
      try {
        state.backend = createDirectBackend('verify: direct (m46 shell)')
        const home = require('node:os').homedir()
        const sP = (id, x) => ({ kind: 'terminal', rect: { id, x, y: 60, w: 300, h: 220 }, z: 1,
          spec: { panelId: id, cwd: home, command: '/bin/sh', args: [] } })
        layoutStore.save({ panels: fromPanels([sP('sA', 60), sP('sB', 460)]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        // NOTHING persisted for the shell: "absent means the breakpoint
        // decides" is the claim, so the store must not carry what earlier
        // checks toggled.
        for (const id of ['shell.railOpen', 'shell.inspectorOpen', 'shell.navigator', 'shell.contextTab', 'files.treeOpen']) layoutStore.clearPreference(id)
        layoutStore.flushSync()
        const reS = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reS
        const seeded = await waitUntil(async () => wc.executeJavaScript(
          `['sA', 'sB'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        // Wake sA so a LIVE panel sits under the reclaimed width.
        const carded = await wc.executeJavaScript(`(() => {
          const card = document.querySelector('.panel[data-panel-id="sA"] .panel__card')
          if (!card) return false
          const r = card.getBoundingClientRect()
          card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        const woke = await waitUntil(async () => (await sessionMap(wc)).has('sA'), 10000)
        await settle()
        const f1 = await frame()
        const diag = await wc.executeJavaScript(`({ ids: [...document.querySelectorAll('.panel[data-panel-id]')].map((p) => p.dataset.panelId), sessions: window.__m4aSessions ? window.__m4aSessions() : null })`)
        ok(IDS[0],
          seeded === true && f1.bp === 'standard' && f1.dock !== null && Math.abs(f1.dock - 48) <= 1 &&
            f1.nav !== null && Math.abs(f1.nav - 300) <= 1 && f1.ctx === 0 &&
            Math.abs(f1.canvas - (f1.window - f1.dock - f1.nav)) <= 1 && f1.live > 0,
          JSON.stringify({ seeded, carded, woke, f1, diag }))

        // shell.2. Real clicks on the dock (sendInputEvent, the only kind that
        //          can move DOM focus), the session map scoped to the two
        //          fixture ids, and the badge after a bell.
        const focusProbe = () => wc.executeJavaScript(`!!(document.activeElement && document.activeElement.closest('.panel'))`)
        // A REAL click: DOM focus is a browser default action, which a
        // dispatched event never performs (check 75c's reason).
        const slotPt = await wc.executeJavaScript(`(() => {
          const slot = document.querySelector('.panel[data-panel-id="sA"] .panel__slot')
          if (!slot) return null
          const r = slot.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (slotPt) {
          wc.sendInputEvent({ type: 'mouseDown', x: slotPt.x, y: slotPt.y, button: 'left', clickCount: 1 })
          wc.sendInputEvent({ type: 'mouseUp', x: slotPt.x, y: slotPt.y, button: 'left', clickCount: 1 })
        }
        await settle()
        const focusBefore = await focusProbe()
        const sessionsBefore = await sessionMap(wc)
        const realDock = async (name) => {
          const r = await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="' + ${JSON.stringify(name)} + '"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
          if (!r) return false
          wc.sendInputEvent({ type: 'mouseDown', x: Math.round(r.x), y: Math.round(r.y), button: 'left', clickCount: 1 })
          wc.sendInputEvent({ type: 'mouseUp', x: Math.round(r.x), y: Math.round(r.y), button: 'left', clickCount: 1 })
          await settle()
          return true
        }
        const pressed = async () => wc.executeJavaScript(`[...document.querySelectorAll('[data-dock]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.dock)`)
        await realDock('workspaces'); const p1 = await pressed()
        await realDock('files'); const p2 = await pressed()
        await realDock('panels'); const p3 = await pressed()
        const focusAfter = await focusProbe()
        const sessionsAfter = await settledSessionMap(wc, 3000)
        ptyManager.write('sA', "printf '\\007'\n")
        const badge = await waitUntil(async () => {
          const t = await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock-badge]'); return b ? b.textContent.trim() : null })()`)
          return t === '1' ? t : false
        }, 6000)
        ok(IDS[1],
          focusBefore === true && focusAfter === true &&
            JSON.stringify(p1) === '["workspaces"]' && JSON.stringify(p2) === '["files"]' && JSON.stringify(p3) === '["panels"]' &&
            sessionsBefore.has('sA') && sessionsAfter.has('sA') && !sessionsBefore.has('sB') && !sessionsAfter.has('sB') &&
            badge === '1',
          JSON.stringify({ focusBefore, focusAfter, p1, p2, p3, sA: sessionsAfter.has('sA'), sB: sessionsAfter.has('sB'), badge }))

        // drawer.1. Compact by RESIZING THE WINDOW — the one thing the
        //           renderer must never measure directly; the shell measures
        //           itself. The drawer overlays the canvas (its rect intersects
        //           the canvas rect), a wheel over it leaves the camera alone,
        //           Escape closes it, an outside mousedown closes it.
        const bw = wc.getOwnerBrowserWindow()
        bw.setSize(1000, 900)
        const compact = await waitUntil(async () => (await frame()).bp === 'compact', 5000)
        await settle()
        const closedAtCompact = await frame()
        await dockClick('panels'); await settle()
        const open = await wc.executeJavaScript(`(() => {
          const shell = document.querySelector('.shell'); const rail = document.querySelector('.shell__rail'); const canvas = document.querySelector('.canvas')
          if (!rail || !canvas) return null
          const r = rail.getBoundingClientRect(), c = canvas.getBoundingClientRect()
          return { drawer: shell.classList.contains('shell--nav-drawer'), width: r.width, overlaps: r.left < c.right && r.right > c.left && r.width > 100 } })()`)
        const vpBefore = await wc.executeJavaScript(`window.__m4aViewport()`)
        await wc.executeJavaScript(`(() => { const list = document.querySelector('.shell__rail .rail-list'); if (!list) return false
          return list.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })) })()`)
        await settle()
        const vpAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`)
        await settle()
        const afterEscape = await wc.executeJavaScript(`document.querySelector('.shell').classList.contains('shell--nav-drawer')`)
        await dockClick('panels'); await settle()
        const reopened = await wc.executeJavaScript(`document.querySelector('.shell').classList.contains('shell--nav-drawer')`)
        await wc.executeJavaScript(`(() => { const c = document.querySelector('.canvas'); c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: c.getBoundingClientRect().right - 10, clientY: c.getBoundingClientRect().bottom - 10 })); return true })()`)
        await settle()
        const afterOutside = await wc.executeJavaScript(`document.querySelector('.shell').classList.contains('shell--nav-drawer')`)
        bw.setSize(1400, 900)
        await waitUntil(async () => (await frame()).bp === 'standard', 5000)
        await settle()
        ok(IDS[2],
          compact === true && closedAtCompact.nav === 0 && Math.abs(closedAtCompact.canvas - (closedAtCompact.window - closedAtCompact.dock)) <= 1 &&
            open !== null && open.drawer === true && open.overlaps === true &&
            vpAfter.x === vpBefore.x && vpAfter.y === vpBefore.y && vpAfter.scale === vpBefore.scale &&
            afterEscape === false && reopened === true && afterOutside === false,
          JSON.stringify({ compact, closedAtCompact, open, vpBefore, vpAfter, afterEscape, reopened, afterOutside }))

        // ctx.1. Select sA through the rail, pin the context open through the
        //        top bar's toggle, then every tab.
        await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row="sA"] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
        await settle()
        const ctxHidden = (await frame()).ctx === 0
        if (ctxHidden) { await wc.executeJavaScript(`(() => { const b = document.querySelector('.shell__inspector-toggle'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`); await settle() }
        const tabs = {}
        for (const tab of ['detail', 'work', 'tools']) {
          await wc.executeJavaScript(`(() => { const t = document.querySelector('[data-context-tab="' + ${JSON.stringify(tab)} + '"]'); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!t })()`)
          await settle()
          tabs[tab] = await wc.executeJavaScript(`(() => {
            const pane = document.querySelector('.shell__inspector'); const h = document.querySelector('[data-inspector-heading]')
            const t = document.querySelector('[data-context-tab="' + ${JSON.stringify(tab)} + '"]')
            if (!pane || !h || !t) return null
            const p = pane.getBoundingClientRect(), r = h.getBoundingClientRect()
            const panels = [...document.querySelectorAll('[data-context-panel]')].map((el) => ({ id: el.dataset.contextPanel, hidden: el.hidden }))
            return { selected: t.getAttribute('aria-selected'), headingVisible: r.height > 0 && r.top >= p.top - 1 && r.bottom <= p.bottom + 1, panels } })()`)
        }
        const tabOk = (t) => tabs[t] && tabs[t].selected === 'true' && tabs[t].headingVisible &&
          tabs[t].panels.length === 3 && tabs[t].panels.every((p) => p.hidden === (p.id !== t))
        ok(IDS[3], tabOk('detail') && tabOk('work') && tabOk('tools'), JSON.stringify(tabs))

        // ctx.2. Close sB (dormant, so nothing dies) from the pinned bar.
        await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row="sB"] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
        await settle()
        const idsBefore = await panelIds()
        const closeClick = () => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-inspector-action="close"]'); if (!b) return null; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
        // Read the armed attribute AFTER React has rendered it, not in the
        // click's own tick.
        const armedNow = () => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-inspector-action="close"]'); return b ? { armed: b.hasAttribute('data-close-armed') } : null })()`)
        await closeClick(); await settle()
        const first = await armedNow()
        const idsArmed = await panelIds()
        const second = (await closeClick()) === true ? first : null; await settle()
        const idsAfter = await waitUntil(async () => { const ids = await panelIds(); return ids.includes('sB') ? false : ids }, 5000)
        ok(IDS[4],
          idsBefore.includes('sB') && first !== null && first.armed === true && idsArmed.length === idsBefore.length &&
            second !== null && idsAfter !== false && !idsAfter.includes('sB') && idsAfter.length === idsBefore.length - 1,
          JSON.stringify({ idsBefore, first, idsArmed, second, idsAfter }))

        // hud.1.
        const hud = await wc.executeJavaScript(`(() => ({
          inTopBar: document.querySelectorAll('.shell__top .shell__zoom-in, .shell__top .shell__zoom-out, .shell__top .shell__fit, .shell__top [data-hud-zoom-in]').length,
          inHud: !!document.querySelector('.canvas-hud [data-hud-zoom-in]') && !!document.querySelector('.canvas-hud [data-hud-zoom-out]') && !!document.querySelector('.canvas-hud [data-hud-fit]'),
          mergePressed: document.querySelector('.shell__merge')?.getAttribute('aria-pressed') ?? null,
          mergeText: (document.querySelector('.shell__merge')?.textContent ?? 'x').trim() }))()`)
        const scaleBefore = await wc.executeJavaScript(`window.__m4aScale()`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-hud-zoom-in]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await sleep(150)
        const scaleAfter = await wc.executeJavaScript(`window.__m4aScale()`)
        const vpH1 = await wc.executeJavaScript(`window.__m4aViewport()`)
        await wc.executeJavaScript(`(() => { const h = document.querySelector('.canvas-hud [data-hud-zoom-in]'); return h.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })) })()`)
        await settle()
        const vpH2 = await wc.executeJavaScript(`window.__m4aViewport()`)
        ok(IDS[5],
          hud.inTopBar === 0 && hud.inHud === true && scaleAfter > scaleBefore &&
            vpH1.x === vpH2.x && vpH1.y === vpH2.y && vpH1.scale === vpH2.scale &&
            hud.mergePressed === 'false' && hud.mergeText.includes('Merged view'),
          JSON.stringify({ hud, scaleBefore, scaleAfter, vpH1, vpH2 }))

        // empty.1. Close the last panel through the rail; the pane must say so.
        await dockClick('panels'); await settle()
        for (let i = 0; i < 4; i++) {
          const closed = await wc.executeJavaScript(`(() => { const b = document.querySelector('.rail-list--panels .rail-row .rail-row__close'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
          if (!closed) break
          await settle()
        }
        const emptyText = await waitUntil(async () => {
          const t = await wc.executeJavaScript(`(() => { const rows = document.querySelectorAll('.rail-list--panels .rail-row').length; const e = document.querySelector('.rail-list--panels .rail-empty'); return rows === 0 && e ? e.textContent : null })()`)
          return t === null ? false : t
        }, 5000)
        ok(IDS[6], typeof emptyText === 'string' && /no panels/.test(emptyText) && /⌘N/.test(emptyText), JSON.stringify(emptyText))
      } catch (sErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(sErr && sErr.message || sErr) + ' | renderer: ' + (sLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onS)
        try { wc.getOwnerBrowserWindow().setSize(1400, 900) } catch {}
      }
    }

    // -------------------------------------------------------------------
    // M47 — one panel frame. frame.1: every kind on the canvas renders
    // through `.pf` (the frame's own class beside the `.panel` alias every
    // earlier check selects on). frame.2: `.pf__body` is NEVER transformed —
    // as source text, and at a scale ≠ 1 through __m4aCellToScreen, which
    // is the arithmetic pointer-correct.ts compensates for and the one
    // failure with no visible symptom.
    // -------------------------------------------------------------------
    {
      const fLog = []
      const onF = (_e, level, message) => { if (level >= 2) fLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onF)
      const IDS = [
        'frame.1 every panel kind on the canvas renders through the one frame',
        'frame.2 the frame body is never transformed: no rule transforms .pf__body, and a cell maps to the screen at scale 0.5 exactly as the unscaled arithmetic predicts'
      ]
      try {
        state.backend = createDirectBackend('verify: direct (m47 frame)')
        const home = require('node:os').homedir()
        const fixtureDir = mkdtempSync(join(realpathSync(tmpdir()), 'tc panels frame '))
        writeFileSync(join(fixtureDir, 'note.txt'), 'alpha beta gamma\n')
        const term = (id, x) => ({ kind: 'terminal', rect: { id, x, y: 60, w: 300, h: 220 }, z: 1,
          spec: { panelId: id, cwd: home, command: '/bin/sh', args: [] } })
        // One of each sessionless kind, placed to the right so nothing
        // overlaps the terminal that frame.2 focuses.
        const kinds = [
          { kind: 'review', rect: { id: 'fR', x: 60, y: 320, w: 300, h: 200 }, z: 2, subject: { subjectId: 'fA', label: 'fA', repoRoot: fixtureDir, baselineSha: '0000000000000000000000000000000000000000' } },
          { kind: 'file', rect: { id: 'fF', x: 400, y: 320, w: 300, h: 200 }, z: 3, source: { path: join(fixtureDir, 'note.txt') } },
          { kind: 'toolbox', rect: { id: 'fT', x: 740, y: 320, w: 300, h: 200 }, z: 4, source: { cwd: fixtureDir, label: 'frame' } },
          { kind: 'jira', rect: { id: 'fJ', x: 60, y: 560, w: 300, h: 200 }, z: 5 }
        ]
        layoutStore.save({ panels: fromPanels([term('fA', 60), ...kinds]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reF = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reF
        const seeded = await waitUntil(async () => wc.executeJavaScript(
          `['fA', 'fR', 'fF', 'fT', 'fJ'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        const frames = await wc.executeJavaScript(`(() => {
          const out = {}
          for (const id of ['fA', 'fR', 'fF', 'fT', 'fJ']) {
            const p = document.querySelector('.panel[data-panel-id="' + id + '"]')
            out[id] = p ? { pf: p.classList.contains('pf'), kind: p.dataset.panelKind, chrome: !!p.querySelector('.pf__chrome.panel__chrome'), title: !!p.querySelector('.pf__title.panel__title'), body: !!p.querySelector('.pf__body') } : null
          }
          return out })()`)
        const allFramed = seeded === true && ['fA', 'fR', 'fF', 'fT', 'fJ'].every((id) => frames[id] && frames[id].pf && frames[id].chrome && frames[id].title && frames[id].body)
        ok(IDS[0], allFramed, JSON.stringify({ seeded, frames }))

        // frame.2. Source text first: the built stylesheet has no rule that
        //          both selects .pf__body and sets a transform.
        const cssText = readFileSync(join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
        const bodyRules = [...cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.pf__body/.test(m[1]))
        const transformed = bodyRules.filter((m) => /(^|[^-])transform\s*:/.test(m[2])).map((m) => m[1].trim())
        // Then the arithmetic. Wake fA, focus it, write a marker, zoom OUT
        // once, and compare __m4aCellToScreen with a prediction built from
        // the host rect and the UNSCALED cell size times the scale — which is
        // exactly what a transform on the body would break, because the
        // host rect would then be scaled twice.
        await wc.executeJavaScript(`(() => {
          const card = document.querySelector('.panel[data-panel-id="fA"] .panel__card')
          if (!card) return false
          const r = card.getBoundingClientRect()
          card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        const woke = await waitUntil(async () => (await sessionMap(wc)).has('fA'), 10000)
        await settle()
        const slotPt = await wc.executeJavaScript(`(() => {
          const slot = document.querySelector('.panel[data-panel-id="fA"] .panel__slot')
          if (!slot) return null
          const r = slot.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (slotPt) {
          wc.sendInputEvent({ type: 'mouseDown', x: slotPt.x, y: slotPt.y, button: 'left', clickCount: 1 })
          wc.sendInputEvent({ type: 'mouseUp', x: slotPt.x, y: slotPt.y, button: 'left', clickCount: 1 })
        }
        await settle()
        await wc.executeJavaScript(`window.__m4aWrite ? window.__m4aWrite('echo FRAMEMARK\\n') : null`)
        const marked = await waitUntil(async () => wc.executeJavaScript(`window.__m4aCellToScreen('FRAMEMARK') !== null`), 8000)
        await zoomTo(wc, '-'); await zoomTo(wc, '-')
        await settle()
        const probe = await wc.executeJavaScript(`(() => {
          const vp = window.__m4aViewport()
          const got = window.__m4aCellToScreen('FRAMEMARK')
          const p = document.querySelector('.panel[data-panel-id="fA"]')
          const body = p && p.querySelector('.pf__body')
          const bodyTransform = body ? getComputedStyle(body).transform : null
          return { scale: vp.scale, got, bodyTransform } })()`)
        ok(IDS[1],
          transformed.length === 0 && woke === true && marked === true && probe.scale < 0.9 &&
            probe.got !== null && (probe.bodyTransform === 'none' || probe.bodyTransform === null),
          JSON.stringify({ transformed, woke, marked, probe }))
        await zoomTo(wc, '0')
      } catch (fErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(fErr && fErr.message || fErr) + ' | renderer: ' + (fLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onF)
      }
    }

    // M75 — composer.1 / composer.2 / composer.3. THE COMPOSER, END TO END.
    //     composer.1: typing `@ser` opens the file list from the panel's
    //     directory, Enter inserts the reference, and a query that matches
    //     nothing says so rather than vanishing. composer.2: a png dropped on
    //     the chat panel (through the real drop verb, by screen point) becomes
    //     an attachment chip, and the send carries a base64 image block with
    //     the file's bytes while the stored turn carries only a placeholder;
    //     a dropped text file inserts a `@` reference instead. composer.3: `/`
    //     lists the directory's project prompt and the saved library; a saved
    //     prompt with holes opens the fill step and inserts the filled body; a
    //     project prompt is inserted verbatim, its holes untouched.
    {
      const IDS = [
        'composer.1 typing @ser lists the directory and Enter inserts the reference; a query with no match says so rather than vanishing',
        'composer.2 a png dropped on the chat becomes an attachment chip and goes on the wire as a base64 image block, never into the transcript; a text file dropped becomes a @ reference',
        'composer.3 / lists the project prompt and the saved one; a saved prompt with holes is filled before insertion; a project prompt is inserted verbatim',
        'composer.4 the palette\'s Insert prompt row fills a two-hole saved prompt through two text lines in a row and delivers it to the captured chat\'s composer'
      ]
      const cLog2 = []
      const onC2 = (_e, _l, m) => { cLog2.push(String(m)) }
      wc.on('console-message', onC2)
      try {
        const kDir = mkdtempSync(join(tmpdir(), 'tc panels composer-'))
        mkdirSync(join(kDir, 'src'))
        mkdirSync(join(kDir, '.claude', 'commands'), { recursive: true })
        writeFileSync(join(kDir, 'server.ts'), 'export const x = 1\n')
        writeFileSync(join(kDir, 'src', 'health.ts'), 'export const ok = () => true\n')
        writeFileSync(join(kDir, 'notes.txt'), 'hello\n')
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
        writeFileSync(join(kDir, 'pic.png'), pngBytes)
        writeFileSync(join(kDir, '.claude', 'commands', 'deploy.md'), 'Deploy {{target}} carefully\n')
        layoutStore.addPreset({ id: 'composer-claude', name: 'Claude (composer)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
        // The harness fences project prompts to known directories and stubs
        // the bridge's save: this block joins the fence and saves through the
        // store, which is what the real handlers do.
        PROMPT_DIRS.add(kDir); PROMPT_DIRS.add(realpathSync(kDir))
        layoutStore.addPrompt({ id: 'p-hole', name: 'review-with-hole', body: 'Review {{file}} for {{what}}' })
        flushLayoutStore()
        const reK = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reK
        await settle()
        const minted = await wc.executeJavaScript(`window.__m73Chat(${JSON.stringify(kDir)})`)
        const chatId = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')]; const p = ps[ps.length - 1]; return p ? p.getAttribute('data-panel-id') : false })()`), 5000)
        const sel = (q) => `document.querySelector('.panel[data-panel-id="${chatId}"] ${q}')`
        const typeInto = (text) => wc.executeJavaScript(`(() => {
          const ta = ${sel('[data-chat-input]')}; if (!ta || ta.disabled) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, ${JSON.stringify(text)}); ta.setSelectionRange(${JSON.stringify(text)}.length, ${JSON.stringify(text)}.length); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return true })()`)
        const key = (k) => wc.executeJavaScript(`(() => { const ta = ${sel('[data-chat-input]')}; if (!ta) return false; ta.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })); return true })()`)
        // composer.1
        const typed = await waitUntil(() => typeInto('look at @ser'), 5000)
        const listed = await waitUntil(() => wc.executeJavaScript(`(() => { const rows = [...document.querySelectorAll('.panel[data-panel-id="${chatId}"] [data-chat-completion]')].map((r) => r.getAttribute('data-chat-completion')); return rows.includes('server.ts') ? rows : false })()`), 5000)
        await key('Enter')
        const inserted = await waitUntil(() => wc.executeJavaScript(`(() => { const ta = ${sel('[data-chat-input]')}; return ta && ta.value === 'look at @server.ts ' ? ta.value : false })()`), 4000)
        await typeInto('look at @zzz')
        // Waited for the SETTLED state: the note reads `listing … ` while the
        // fs:list is in flight (three states), and only `no matches` after.
        const emptyNote = await waitUntil(() => wc.executeJavaScript(`(() => { const t = ${sel('[data-chat-popup-empty]')}?.textContent; return t && /no matches/.test(t) ? t : false })()`), 4000)
        await key('Escape')
        const closed = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-popup]')} === null`), 3000)
        ok(IDS[0],
          minted && minted.kind === 'spawned' && typed === true && Array.isArray(listed) && listed[0] === 'server.ts' && inserted === 'look at @server.ts ' &&
            typeof emptyNote === 'string' && /no matches/.test(emptyNote) && closed === true,
          JSON.stringify({ minted, typed, listed, inserted, emptyNote, closed, log: cLog2.slice(-3) }))

        // composer.2 — the real drop verb, at the panel's centre.
        await typeInto('')
        const centre = await wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="${chatId}"]'); const host = document.querySelector('.canvas').getBoundingClientRect(); const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2 - host.left, y: r.top + r.height / 2 - host.top } })()`)
        const dropped = await wc.executeJavaScript(`window.__m59Drop(${JSON.stringify(join(kDir, 'pic.png'))}, ${centre.x}, ${centre.y})`)
        const chip = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-attachment="pic.png"]')} !== null`), 4000)
        const droppedText = await wc.executeJavaScript(`window.__m59Drop(${JSON.stringify(join(kDir, 'notes.txt'))}, ${centre.x}, ${centre.y})`)
        const refText = await waitUntil(() => wc.executeJavaScript(`(() => { const ta = ${sel('[data-chat-input]')}; return ta && ta.value.includes('@notes.txt') ? ta.value : false })()`), 4000)
        const spawnsBefore2 = chatSpawns.length
        await typeInto('see this ')
        await wc.executeJavaScript(`(() => { const b = ${sel('[data-chat-send]')}; if (!b || b.disabled) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const sentWithImage = await waitUntil(async () => chatSpawns.length > spawnsBefore2 && chatSpawns[chatSpawns.length - 1].proc.stdin.length > 0, 5000)
        const wire = sentWithImage ? JSON.parse(chatSpawns[chatSpawns.length - 1].proc.stdin[0]) : null
        const imageBlock = wire && wire.message.content.find((c) => c.type === 'image')
        const stored = agentTranscripts.read(chatId).turns.find((t) => t.role === 'user' && t.blocks.some((b) => b.type === 'image'))
        const chipGone = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-attachments]')} === null`), 4000)
        ok(IDS[1],
          dropped === 'pasted' && chip === true && droppedText === 'pasted' && typeof refText === 'string' &&
            sentWithImage === true && imageBlock && imageBlock.source.type === 'base64' && imageBlock.source.media_type === 'image/png' && imageBlock.source.data === pngBytes.toString('base64') &&
            stored && stored.blocks.some((b) => b.type === 'image' && b.mediaType === 'image/png' && b.size === pngBytes.length) && !JSON.stringify(agentTranscripts.read(chatId)).includes(pngBytes.toString('base64')) &&
            chipGone === true,
          JSON.stringify({ dropped, chip, droppedText, refText, sentWithImage, imageBlock: imageBlock && imageBlock.source.media_type, stored: stored && stored.blocks.map((b) => b.type), chipGone, log: cLog2.slice(-3) }))

        // composer.3 — wait for the turn to end so the composer is enabled again.
        await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent === 'idle' || false`), 8000)
        await waitUntil(() => typeInto('/'), 5000)
        const promptRows = await waitUntil(() => wc.executeJavaScript(`(() => { const rows = [...document.querySelectorAll('.panel[data-panel-id="${chatId}"] [data-chat-prompt]')].map((r) => r.textContent); return rows.some((r) => r.includes('deploy')) && rows.some((r) => r.includes('review-with-hole')) ? rows : false })()`), 5000)
        await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.panel[data-panel-id="${chatId}"] [data-chat-prompt]')].find((r) => r.textContent.includes('review-with-hole')); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const fillShown = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-fill]')} !== null`), 4000)
        const popupState = await wc.executeJavaScript(`(() => { const p = ${sel('[data-chat-popup]')}; return p ? { kind: p.getAttribute('data-chat-popup'), text: p.textContent.slice(0, 160) } : 'no-popup' })()`)
        // Guarded: a missing input reads as a red assertion, never an Illegal
        // invocation that takes the block down.
        const filledIn = await wc.executeJavaScript(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          const a = ${sel('[data-chat-fill-input="file"]')}; const b = ${sel('[data-chat-fill-input="what"]')}; if (!a || !b) return false
          set.call(a, 'server.ts'); a.dispatchEvent(new Event('input', { bubbles: true }))
          set.call(b, 'bugs'); b.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const b = ${sel('[data-chat-fill-insert]')}; if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const filled = await waitUntil(() => wc.executeJavaScript(`(() => { const ta = ${sel('[data-chat-input]')}; return ta && ta.value === 'Review server.ts for bugs' ? ta.value : false })()`), 4000)
        await typeInto('/dep')
        await waitUntil(() => wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-id="${chatId}"] [data-chat-prompt]')].some((r) => r.textContent.includes('deploy'))`), 4000)
        await key('Enter')
        const verbatim = await waitUntil(() => wc.executeJavaScript(`(() => { const ta = ${sel('[data-chat-input]')}; return ta && ta.value.includes('{{target}}') ? ta.value : false })()`), 4000)
        ok(IDS[2],
          Array.isArray(promptRows) && promptRows.some((r) => r.includes('project')) && promptRows.some((r) => r.includes('saved')) &&
            fillShown === true && filled === 'Review server.ts for bugs' && typeof verbatim === 'string' && /^Deploy \{\{target\}\} carefully/.test(verbatim),
          JSON.stringify({ promptRows, fillShown, popupState, filledIn, filled, verbatim, log: cLog2.slice(-3) }))
        // composer.4 — the palette's chain. The chat is FOCUSED by a mousedown
        // on its frame (the palette captures focusedId at open), the row is
        // run with Enter, and each hole is a text line submitted with Enter:
        // Palette.tsx closes before submit, so the second line exists only if
        // the chain reopens the palette for every hole.
        await typeInto('')
        // On the BODY, not the textarea: the textarea stops its own mousedown
        // (a click into it must not start a panel drag), so a mousedown there
        // never reaches the body's focus handler and the palette would
        // capture whichever panel was focused before.
        const focusedChat = await wc.executeJavaScript(`(() => { const body = ${sel('.chat__body')}; if (body) body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return !!body })()`)
        await settle()
        await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 3000)
        const paletteLine = (value, expectLabel) => wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input'); if (!input) return 'no palette input'
          // The text line's label is the input's placeholder.
          const label = input.placeholder || ''
          if (!label.includes(${JSON.stringify(expectLabel)})) return 'label: ' + label.slice(0, 120)
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        const chainRow = await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'insert prompt review-with-hole'); input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const selected = document.querySelector('.palette__row--selected')
          if (!selected || !selected.textContent.includes('review-with-hole')) return selected ? selected.textContent : 'no row'
          if (selected.className.includes('palette__row--disabled')) return 'disabled: ' + selected.title
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__list') === null && document.querySelector('.palette__input') !== null`), 3000)
        const hole1 = await paletteLine('server.ts', 'file (1 of 2)')
        const secondLine = await waitUntil(() => wc.executeJavaScript(`((document.querySelector('.palette__input') || {}).placeholder || '').includes('what (2 of 2)')`), 3000)
        const hole2 = secondLine === true ? await paletteLine('bugs', 'what (2 of 2)') : 'no second line'
        const delivered = await waitUntil(() => wc.executeJavaScript(`(() => { const ta = ${sel('[data-chat-input]')}; return ta && ta.value === 'Review server.ts for bugs' ? ta.value : false })()`), 4000)
        const paletteShut = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 3000)
        ok(IDS[3],
          chainRow === true && hole1 === true && secondLine === true && hole2 === true && delivered === 'Review server.ts for bugs' && paletteShut === true,
          JSON.stringify({ focusedChat, chainRow, hole1, secondLine, hole2, delivered, paletteShut, log: cLog2.slice(-3) }))
        await clickPanelClose(wc, chatId)
        await settle()
        try { rmSync(kDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (kErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(kErr && kErr.message || kErr) + ' | renderer: ' + (cLog2.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onC2)
      }
    }

    // -------------------------------------------------------------------
    // M80 — template.1. TEMPLATES. The palette's `New from review this
    //     repository` row opens the spawn sheet on that template; the sheet
    //     asks for its ONE parameter and its preview counts the shape; Create
    //     mints both panels with the edge between them, in ONE history entry
    //     (a single undo takes the whole shape away); the chat's first message
    //     is in its composer, NOT sent. Then a selection is saved as a
    //     template and comes back from main's store with its edge.
    // -------------------------------------------------------------------
    {
      const IDS = ['template.1 a template row opens the sheet (where and title hidden, the preview naming the shape), its parameter is asked, Create mints both panels and the edge in ONE history entry with the chat\'s message in its composer and unsent, and the palette\'s save verb writes a startable template back']
      const mLog = []
      const onM = (_e, level, m) => { if (level >= 2) mLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onM)
      try {
        const tDir = mkdtempSync(join(tmpdir(), 'tc panels template-'))
        layoutStore.addPreset({ id: 'template-claude', name: 'Claude (template)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reT = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reT
        await settle()
        const before = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
        // The palette row for the built-in template.
        await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 3000)
        const rowRan = await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'new from review this repository'); input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          const selected = document.querySelector('.palette__row--selected')
          if (!selected || !/review this repository/.test(selected.textContent)) return selected ? selected.textContent : 'no row'
          if (selected.className.includes('palette__row--disabled')) return 'disabled: ' + selected.title
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        const sheet = await waitUntil(() => wc.executeJavaScript(`(() => { const s = document.querySelector('[data-spawn-sheet]'); if (!s) return false; const hole = s.querySelector('[data-sheet-hole="repository"]'); return hole ? { preview: s.querySelector('[data-sheet-preview]')?.textContent ?? null, what: s.querySelector('[data-sheet-what]')?.value ?? null, where: s.querySelector('[data-sheet-where]') !== null, title: s.querySelector('[data-sheet-title]') !== null } : false })()`), 5000)
        await wc.executeJavaScript(`(() => { const i = document.querySelector('[data-sheet-hole="repository"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify('')} + ${JSON.stringify(tDir)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        await wc.executeJavaScript(`(() => { const s = document.querySelector('[data-spawn-sheet]'); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true })()`)
        // The message arrives on the store's own seeding, a poll after the
        // panels land — waited for, never read once (the full chain is slower).
        const made = await waitUntil(() => wc.executeJavaScript(`(() => {
          const panels = [...document.querySelectorAll('.panel')]
          const chat = panels.find((p) => p.getAttribute('data-panel-kind') === 'chat')
          const term = panels.find((p) => p.getAttribute('data-panel-kind') !== 'chat')
          if (panels.length < ${before} + 2 || !chat || !term) return false
          const chatId = chat.getAttribute('data-panel-id'); const termId = term.getAttribute('data-panel-id')
          const line = document.querySelector('[data-link-hit="' + chatId + ':' + termId + '"]')
          const composer = chat.querySelector('[data-chat-input]')
          if (!line) return false
          if (!composer || composer.value === '') return false
          return { chatId, termId, message: composer.value, sent: chat.getAttribute('data-chat-turns'), label: document.querySelector('[data-link-label="' + chatId + ':' + termId + '"]')?.textContent ?? null } })()`), 15000)
        // ONE history entry: a single undo removes the whole shape.
        wc.send('edit:undo')
        const undone = await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('.panel').length === ${before}`), 5000)
        wc.send('edit:redo')
        await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('.panel').length === ${before} + 2`), 5000)
        // Save the two panels as a template of the user's own.
        await settle()
        const saved = await wc.executeJavaScript(`(async () => {
          const ids = [...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))
          window.__m4aSelect ? window.__m4aSelect(ids) : null
          return ids })()`)
        // The SAVE VERB itself, through the palette: the two panels of the
        // template just made are selected and saved, and the record comes back
        // from main's store with a startable node for each.
        // Select both panels first — the row is disabled without a selection,
        // and the instantiate's own selection did not survive the undo/redo.
        await wc.executeJavaScript(`(() => {
          const chrome = (id) => document.querySelector('.panel[data-panel-id="' + id + '"] .pf__chrome')
          const a = chrome(${JSON.stringify(made.chatId)}); const b = chrome(${JSON.stringify(made.termId)})
          if (a) a.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }))
          return !!(a && b) })()`)
        await settle()
        await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 3000)
        const saveRan = await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'save selection as template'); input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 200))
          const row = [...document.querySelectorAll('.palette__row')].find((r) => /Save selection as template/.test(r.textContent))
          if (!row) return 'no row: ' + [...document.querySelectorAll('.palette__row')].map((r) => r.textContent).slice(0, 4).join(' | ')
          if (row.className.includes('palette__row--disabled')) return 'disabled: ' + row.title
          row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 250))
          const field = document.querySelector('.palette__input')
          if (!field) return 'no name field'
          setter.call(field, 'my shape'); field.dispatchEvent(new Event('input', { bubbles: true }))
          field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          return true })()`)
        const listed = await waitUntil(() => wc.executeJavaScript(`window.canvas.template.list().then((rows) => rows.some((t) => t.name === 'my shape') ? rows : false)`), 5000)
        const mine = Array.isArray(listed) ? listed.find((t) => t.name === 'my shape') : undefined
        const builtInDelete = await wc.executeJavaScript(`window.canvas.template.remove('builtin-review-repo')`)
        ok(IDS[0],
          rowRan === true && sheet && /chat \+ terminal/.test(String(sheet.preview)) && /after a turn/.test(String(sheet.preview)) &&
            sheet.where === false && sheet.title === false &&
            made && typeof made.chatId === 'string' && /Review the working tree/.test(String(made.message)) && made.sent === '0' &&
            /after a turn/.test(String(made.label)) && undone === true &&
            saveRan === true && mine && mine.nodes.length === 2 && mine.edges.length === 1 && mine.edges[0].trigger === 'idle' &&
            mine.nodes.every((n) => n.kind === 'chat' || n.presetId !== undefined || (n.command ?? '') !== '') &&
            builtInDelete === false,
          JSON.stringify({ rowRan, sheet, made, undone, saveRan, mine, builtInDelete, saved: Array.isArray(saved), log: mLog.slice(-3) }))
        try { rmSync(tDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (mErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(mErr && mErr.message || mErr) + ' | renderer: ' + (mLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onM)
      }
    }

    // -------------------------------------------------------------------
    // M79 — run.1. RUNS. A two-panel handoff (rA → rB on exit 0) fires and
    //     becomes a run: the Workspaces pane lists it (2 panels, a duration,
    //     the outcome word done — rB reads one line of the paste and exits 0,
    //     so the sink ENDS and the run seals), the layout store carries the record with
    //     two entries and an outcome, the Work tab of a member names it, a
    //     frame with the run's name wraps both; Run again restarts the root
    //     (a new pid) and, after its exit, a second run is listed.
    // -------------------------------------------------------------------
    {
      const IDS = ['run.1 a fired handoff becomes a run: listed with its panels, duration and outcome; stored with two entries; named on a member\'s Work tab; framed; Run again restarts the root and records a second run']
      const rLog = []
      const onRr = (_e, level, m) => { if (level >= 2) rLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onRr)
      try {
        state.backend = createDirectBackend('verify: direct (m79 runs)')
        const home = require('node:os').homedir()
        const rPanel = (id, x, y, links, command = '/bin/sh', args = []) => ({ kind: 'terminal', rect: { id, x, y, w: 320, h: 220 }, z: 1, spec: { panelId: id, cwd: home, command, args }, ...(links ? { links } : {}) })
        layoutStore.save({
          panels: fromPanels([rPanel('rA', 60, 60, [{ to: 'rB', automation: { kind: 'handoff', enabled: true, trigger: 'exit-ok' } }]), rPanel('rB', 440, 60, undefined, '/bin/sh', ['-c', 'echo ready; read x; exit 0'])]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const reR = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reR
        await settle()
        const seeded = await waitUntil(() => wc.executeJavaScript(`['rA', 'rB'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        const cardPoint = (id) => wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="${id}"]'); if (!p) return null; const r = p.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        const wakeR = async (id) => {
          const pt = await cardPoint(id); if (!pt) return false
          wc.sendInputEvent({ type: 'mouseDown', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
          return waitUntil(async () => (await sessionMap(wc)).has(id), 10000)
        }
        const logHas = async (id, token) => (await scrollbackLog.tail(id, 120)).some((l) => l.includes(token))
        const bUp = seeded ? await wakeR('rB') : false
        const aUp = seeded ? await wakeR('rA') : false
        await sleep(400)
        const pidBefore = ptyManager.list().find((s) => s.panelId === 'rA')?.pid ?? null
        if (aUp) ptyManager.write('rA', 'echo RUN-TOKEN-1\r')
        await waitUntil(async () => logHas('rA', 'RUN-TOKEN-1'), 10000)
        if (aUp) ptyManager.write('rA', 'exit 0\r')
        const delivered = await waitUntil(async () => logHas('rB', 'RUN-TOKEN-1'), 12000)
        // The Workspaces pane lists the run.
        await wc.executeJavaScript(`window.canvas.settings.set('shell.railOpen', true)`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="workspaces"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        const row = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-rail-run]'); if (!r) return false; const o = r.getAttribute('data-run-outcome'); return o === 'run ended' ? { id: r.getAttribute('data-rail-run'), outcome: o, text: r.textContent, again: !document.querySelector('[data-rail-run-again]')?.disabled } : false })()`), 10000)
        // The ACTIVE workspace's state as the store would hand a fresh renderer (check 17's door).
        const stored = await waitUntil(async () => { layoutStore.flushSync(); const runs = (layoutStore.initial().runs) || []; const run = runs.find((r) => r.panelIds.includes('rA')); return run && run.endedAt !== undefined && run.entries.length === 2 ? run : false }, 6000)
        // The frame must WRAP both panels, not merely exist: its rect contains theirs.
        const frame = await wc.executeJavaScript(`(() => {
          const g = [...document.querySelectorAll('.canvas-group')].find((el) => /^run \\d/.test(el.querySelector('.canvas-group__label')?.textContent ?? ''))
          if (!g) return null
          const gr = g.getBoundingClientRect()
          const inside = (id) => { const p = document.querySelector('.panel[data-panel-id="' + id + '"]'); if (!p) return false; const r = p.getBoundingClientRect(); return r.left >= gr.left - 2 && r.right <= gr.right + 2 && r.top >= gr.top - 2 && r.bottom <= gr.bottom + 2 }
          return { label: g.querySelector('.canvas-group__label').textContent, wraps: inside('rA') && inside('rB') } })()`)
        // The Work tab of a member names the run.
        await wc.executeJavaScript(`window.canvas.settings.set('shell.inspectorOpen', true)`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row="rA"] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
        await wc.executeJavaScript(`(() => { const t = document.querySelector('[data-context-tab="work"]'); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) } return !!t })()`)
        const workLine = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('[data-work-run]'); return p && /^run \\d/.test(p.textContent) && p.querySelector('[data-work-run-again]') ? p.textContent : false })()`), 5000)
        // Run again: the root restarts (a new pid), exits, and a second run is listed.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="workspaces"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        const clickedAgain = await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-rail-run-again]'); if (!b || b.disabled) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const note = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-rail-run-note]')?.textContent ?? false`), 5000)
        const pidAfter = await waitUntil(() => { const s = ptyManager.list().find((x) => x.panelId === 'rA'); return s && s.pid !== pidBefore ? s.pid : false }, 10000)
        // The restarted root must be up before it is typed into, and rB must be
        // alive again to receive: the first run's rB read one line and exited.
        await waitUntil(async () => (await sessionMap(wc)).has('rA'), 10000)
        await sleep(900)
        await wakeR('rB')
        await sleep(400)
        ptyManager.write('rA', 'echo RUN-TOKEN-2\r')
        const token2 = await waitUntil(async () => logHas('rA', 'RUN-TOKEN-2'), 10000)
        ptyManager.write('rA', 'exit 0\r')
        const exited2 = await waitUntil(() => { const s = ptyManager.list().find((x) => x.panelId === 'rA'); return s === undefined || s.pid !== pidAfter }, 12000)
        const secondRun = await waitUntil(() => wc.executeJavaScript(`(() => { const ids = [...document.querySelectorAll('[data-rail-run]')].map((r) => r.getAttribute('data-rail-run')); return ids.length >= 2 ? ids : false })()`), 12000)
        // Back to the Panels pane and the Detail tab: later blocks select through rail
        // rows that exist only there, and one of them (osc133.1) relies on the Work tab
        // FLIPPING to refetch the ledger.
        await wc.executeJavaScript(`(() => { const t = document.querySelector('[data-context-tab="detail"]'); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) } return !!t })()`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        ok(IDS[0],
          seeded === true && bUp && aUp && delivered === true && row && /2 panels/.test(row.text) && row.again === true &&
            stored && stored.entries.every((e) => e.outcome !== undefined) && stored.costUsd === 0 &&
            frame && frame.wraps === true && typeof workLine === 'string' && /run ended/.test(workLine) && /2 panels/.test(workLine) &&
            clickedAgain === true && /1 root restarted/.test(String(note)) && typeof pidAfter === 'number' &&
            Array.isArray(secondRun) && secondRun.length >= 2 && secondRun.includes(row.id) && secondRun.some((id) => id !== row.id),
          JSON.stringify({ seeded, bUp, aUp, delivered, token2, exited2, row, stored: stored && { entries: stored.entries, cost: stored.costUsd, name: stored.name }, frame, workLine, clickedAgain, note, pidBefore, pidAfter, secondRun, log: rLog.slice(-3) }))
      } catch (rErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(rErr && rErr.message || rErr) + ' | renderer: ' + (rLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onRr)
      }
    }

    // -------------------------------------------------------------------
    // M78 — graph.1 / graph.2 / graph.3. THE TASK GRAPH. graph.1: a JOIN —
    //     two terminals hand off into one on exit 0 — fires ONCE after both
    //     sources, the target's log carrying both tokens, and a fourth edge
    //     conditioned on a failing exit records `skipped` by name when the
    //     source exits 0. graph.2: an edge is selected by its midpoint badge,
    //     the pane shows it, its select sets the rule, Delete removes it and
    //     one undo restores it. graph.3: a chat's turn end hands its answer
    //     to a terminal; a terminal's exit hands its tail into a chat's send.
    // -------------------------------------------------------------------
    {
      const IDS = [
        'graph.1 a join fires once after both sources (both tokens in the target\'s log, the rows say joined), and an exit-fail edge records skipped by name on exit 0',
        'graph.2 an edge is selected by a click on it, the pane shows it and its select sets the rule, Delete removes it, one undo restores it',
        'graph.3 a chat\'s turn end hands its answer to a terminal, and a terminal\'s exit hands its tail into a chat\'s send'
      ]
      const gLog = []
      const onG = (_e, level, m) => { if (level >= 2) gLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onG)
      try {
        state.backend = createDirectBackend('verify: direct (m78 graph)')
        const home = require('node:os').homedir()
        const gPanel = (id, x, y, links, command = '/bin/sh', args = []) => ({ kind: 'terminal', rect: { id, x, y, w: 320, h: 220 }, z: 1, spec: { panelId: id, cwd: home, command, args }, ...(links ? { links } : {}) })
        const edge = (to, trigger) => ({ to, automation: { kind: 'handoff', enabled: true, trigger } })
        const gDir = mkdtempSync(join(tmpdir(), 'tc panels graph-'))
        layoutStore.addPreset({ id: 'graph-claude', name: 'Claude (graph)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
        layoutStore.save({
          panels: [
            ...fromPanels([
              gPanel('gA', 60, 60, [edge('gC', 'exit-ok'), edge('gD', 'exit-fail')]), gPanel('gB', 60, 340, [edge('gC', 'exit-ok')]),
              // The join TARGET prints once and sleeps: the tty echoes the pasted
              // payloads into its log without a shell executing them — a shell
              // ran A's transcript line by line and its `exit` line ended the
              // target before B's part arrived (the first run); a bare `cat`
              // never leaves `starting` and is never receivable (the second).
              gPanel('gC', 440, 60, undefined, '/bin/sh', ['-c', 'echo ready; sleep 600']), gPanel('gD', 440, 340),
              gPanel('gT', 820, 340), gPanel('gS', 820, 60, [edge('gK', 'exit')])
            ]),
            { id: 'gH', kind: 'chat', x: 1200, y: 60, w: 340, h: 260, z: 1, chat: { cwd: gDir, sessionId: '88888888-8888-4888-8888-888888888888' }, links: [edge('gT', 'idle')] },
            { id: 'gK', kind: 'chat', x: 1200, y: 340, w: 340, h: 260, z: 1, chat: { cwd: gDir, sessionId: '99999999-9999-4999-8999-999999999999' } }
          ],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const reG = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reG
        await settle()
        // The rail collapsed: gT and gS sit at x 820 and a real click on their
        // cards must land inside the window whatever the previous block left.
        await wc.executeJavaScript(`window.canvas.settings.set('shell.railOpen', false)`)
        // And the context pane closed: open, it covers the right 260px, where gT
        // and gS's card centres land (the previous block opens it).
        await wc.executeJavaScript(`window.canvas.settings.set('shell.inspectorOpen', false)`)
        await settle()
        const seeded = await waitUntil(() => wc.executeJavaScript(`['gA', 'gB', 'gC', 'gD', 'gT', 'gS', 'gH', 'gK'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        // M258. The first point of the panel that is actually ITS topmost pixel — the centre, else a quarter point: on a wide window the navigation cluster (minimap over the zoom pill) owns the bottom-right corner, and a real click there lands on the map.
        const cardPoint = (id) => wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="${id}"]'); if (!p) return null; const r = p.getBoundingClientRect(); for (const [fx, fy] of [[.5, .5], [.25, .5], [.5, .25], [.25, .25], [.75, .5]]) { const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy); const top = document.elementFromPoint(x, y); if (top && p.contains(top)) return { x, y } } return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        const wakeG = async (id) => {
          const pt = await cardPoint(id); if (!pt) return false
          wc.sendInputEvent({ type: 'mouseDown', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
          return waitUntil(async () => (await sessionMap(wc)).has(id), 10000)
        }
        const logHas = async (id, token) => (await scrollbackLog.tail(id, 120)).some((l) => l.includes(token))
        const resultOf = (key) => wc.executeJavaScript(`(() => { const el = document.querySelector('[data-automation-result="${key}"]'); return el ? el.textContent : null })()`)
        const showList = async (id) => {
          await wc.executeJavaScript(`window.canvas.settings.set('shell.inspectorOpen', true)`)
          await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row="${id}"] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
          await settle()
        }
        // graph.1 — the join, and the failed condition.
        const cUp = seeded ? await wakeG('gC') : false
        const dUp = seeded ? await wakeG('gD') : false
        const aUp = seeded ? await wakeG('gA') : false
        const bUp = seeded ? await wakeG('gB') : false
        await sleep(400)
        // The token is in the log BEFORE the exit: the handoff reads the tail at
        // exit time, and an echo still in flight would be a race, not a finding.
        if (aUp) ptyManager.write('gA', 'echo JOIN-TOKEN-A\r')
        await waitUntil(async () => logHas('gA', 'JOIN-TOKEN-A'), 10000)
        if (aUp) ptyManager.write('gA', 'exit 0\r')
        await showList('gC')
        const waiting = await waitUntil(async () => { const t = await resultOf('gA:gC'); return t && /waiting for/.test(t) ? t : false }, 8000)
        const skippedFail = await waitUntil(async () => { const t = await resultOf('gA:gD'); return t && /skipped/.test(t) ? t : false }, 8000)
        const cUntouched = !(await logHas('gC', 'JOIN-TOKEN-A'))
        if (bUp) ptyManager.write('gB', 'echo JOIN-TOKEN-B\r')
        await waitUntil(async () => logHas('gB', 'JOIN-TOKEN-B'), 10000)
        if (bUp) ptyManager.write('gB', 'exit 0\r')
        const joinedA = await waitUntil(async () => logHas('gC', 'JOIN-TOKEN-A'), 12000)
        // Waited for too: one bracketed paste, but the PTY echoes and the log flushes in its own time.
        const joinedB = await waitUntil(async () => logHas('gC', 'JOIN-TOKEN-B'), 12000)
        await settle()
        const rowA = await waitUntil(async () => { const t = await resultOf('gA:gC'); return t && /joined|handed off/.test(t) ? t : false }, 8000)
        const rowB = await resultOf('gB:gC')
        const dUntouched = !(await logHas('gD', 'JOIN-TOKEN-A'))
        const tailC = await scrollbackLog.tail('gC', 400)
        const headers = tailC.filter((l) => l.includes('handoff from')).length
        const aFirst = tailC.findIndex((l) => l.includes('JOIN-TOKEN-A')) < tailC.findIndex((l) => l.includes('JOIN-TOKEN-B'))
        ok(IDS[0],
          seeded === true && cUp && dUp && aUp && bUp && typeof waiting === 'string' && cUntouched === true &&
            typeof skippedFail === 'string' && /exit 0 is not a failing exit/.test(skippedFail) && dUntouched === true &&
            joinedA === true && joinedB === true && headers === 2 && aFirst === true && typeof rowA === 'string' && /joined/.test(rowA) && typeof rowB === 'string' && /joined|handed off/.test(rowB),
          JSON.stringify({ seeded, up: [cUp, dUp, aUp, bUp], waiting, skippedFail, cUntouched, joinedA, joinedB, headers, rowA, rowB, dUntouched, tailC: tailC.slice(-14).map((l) => l.slice(0, 90)), log: gLog.slice(-3) }))

        // graph.2 — selection, the pane's select, Delete, undo. The edge gS→gK.
        const hoverKey = 'gS:gK'
        // A click on the edge's hit stroke selects it (mousedown is the background's).
        const badge = await waitUntil(() => wc.executeJavaScript(`(() => { const hit = document.querySelector('[data-link-hit="${hoverKey}"]'); if (!hit) return false; hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 4000)
        // `data-link` is M13's `from to` key; the M78 attributes are `from:to`. The line follows its hit stroke.
        const selected = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-link-hit="${hoverKey}"]')?.nextElementSibling?.getAttribute('data-link-selected') === 'true'`), 4000)
        const paneEdge = await waitUntil(() => wc.executeJavaScript(`(() => { const e = document.querySelector('[data-inspector-edge="${hoverKey}"]'); const sel = e && e.querySelector('[data-edge-trigger]'); return sel ? { value: sel.value, ends: e.querySelector('[data-edge-ends]')?.textContent ?? null } : false })()`), 4000)
        await wc.executeJavaScript(`(() => { const sel = document.querySelector('[data-edge-trigger]'); if (!sel) return false; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, 'exit-ok'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
        const ruleSet = await waitUntil(() => wc.executeJavaScript(`(() => { const t = document.querySelector('[data-link-label="${hoverKey}"]'); return t && /exit 0/.test(t.textContent) ? t.textContent : false })()`), 4000)
        const stored = await waitUntil(async () => { layoutStore.flushSync(); const ps = layoutStore.mergedWorkspaces().flatMap((w) => w.panels); const src = ps.find((p) => p.id === 'gS'); const l = src && (src.links || []).find((x) => x.to === 'gK'); return l && l.automation && l.automation.trigger === 'exit-ok' ? l.automation : false }, 4000)
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))`)
        const removed = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-link-hit="${hoverKey}"]') === null`), 4000)
        // The menu's undo, as the app delivers it.
        wc.send('edit:undo')
        const restored = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-link-hit="${hoverKey}"]') !== null`), 4000)
        ok(IDS[1],
          badge === true && selected === true && paneEdge && paneEdge.value === 'exit' && /gS|claude|sh/.test(String(paneEdge.ends)) &&
            typeof ruleSet === 'string' && stored && stored.trigger === 'exit-ok' && removed === true && restored === true,
          JSON.stringify({ badge, selected, paneEdge, ruleSet, stored, removed, restored, log: gLog.slice(-3) }))

        // graph.3 — chat source (gH → gT on idle), terminal source into a chat (gS → gK on exit).
        const tUp = await wakeG('gT')
        const chatSpawnsBefore = chatSpawns.length
        const sent = await waitUntil(() => wc.executeJavaScript(`(() => {
          const ta = document.querySelector('.panel[data-panel-id="gH"] [data-chat-input]'); if (!ta || ta.disabled) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, 'Reply with exactly the word: pong'); ta.dispatchEvent(new Event('input', { bubbles: true }))
          const b = document.querySelector('.panel[data-panel-id="gH"] [data-chat-send]'); if (!b || b.disabled) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 8000)
        const chatToTerminal = await waitUntil(async () => logHas('gT', 'pong'), 12000)
        const headerT = await logHas('gT', 'handoff from')
        await showList('gT')
        const rowH = await waitUntil(async () => { const t = await resultOf('gH:gT'); return t && /handed off/.test(t) ? t : false }, 6000)
        const sUp = await wakeG('gS')
        if (sUp) ptyManager.write('gS', 'echo INTO-CHAT-TOKEN\r')
        await waitUntil(async () => logHas('gS', 'INTO-CHAT-TOKEN'), 10000)
        if (sUp) ptyManager.write('gS', 'exit 0\r')
        const chatGotSend = await waitUntil(() => {
          const spawn = chatSpawns.slice(chatSpawnsBefore).find((sp) => sp.cwd === gDir && sp.args.some((a) => String(a).includes('99999999')))
          if (!spawn) return false
          const line = spawn.proc.stdin.map((l) => { try { return JSON.parse(l) } catch { return null } }).find((p) => p && p.type === 'user' && JSON.stringify(p).includes('INTO-CHAT-TOKEN'))
          return line ? true : false
        }, 12000)
        const rowS = await waitUntil(async () => { const t = await resultOf('gS:gK'); return t && /handed off/.test(t) ? t : false }, 6000)
        ok(IDS[2],
          tUp && sent === true && chatToTerminal === true && headerT === true && typeof rowH === 'string' &&
            sUp && chatGotSend === true && typeof rowS === 'string',
          JSON.stringify({ tUp, sent, chatToTerminal, headerT, rowH, sUp, chatGotSend, rowS, log: gLog.slice(-3) }))
        try { rmSync(gDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (gErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(gErr && gErr.message || gErr) + ' | renderer: ' + (gLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onG)
      }
    }

    // -------------------------------------------------------------------
    // M77 — tools.1 / tools.2. TOOL CALLS AS INSPECTABLE OBJECTS. A chat panel
    //     RESTORED in a real repository with a seeded transcript (an Edit on
    //     seed.txt, a Read on other.txt); agent:create captures its baseline
    //     BEFORE the harness edits seed.txt on disk. tools.1: the context
    //     pane's Changes section answers for the chat (one file), Open review
    //     is enabled and mints a node whose row says `1 tool call` and lists
    //     the Edit when expanded. tools.2: the Edit row's `diff` verb shows
    //     the added line in place; the Read row's says unchanged — the honest
    //     answer, not an error.
    // -------------------------------------------------------------------
    {
      const IDS = [
        'tools.1 a restored chat in a repository has a baseline from agent:create: Changes lists the edited file, Open review is enabled, and the node\'s row counts and lists the tool call that touched it',
        'tools.2 a tool row naming a changed file shows its diff in place; one naming an unchanged file says unchanged; a Bash row has no diff verb; closing the chat drops its baseline'
      ]
      const tLog = []
      const onT = (_e, level, m) => { if (level >= 2) tLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onT)
      let GIT_T = true
      try { execFileSync('git', ['--version'], { stdio: 'ignore' }) } catch { GIT_T = false }
      if (!GIT_T) {
        for (const id of IDS) ok(id, true, 'skipped: no git on this machine')
      } else try {
        // The previous block's renderer is still auto-saving its own layout (a
        // handoff's last events land after its last check); a save of ours that
        // lands BEFORE that debounced one is overwritten and the reload shows the
        // old panels (M79's chain saw exactly that). Let it land first.
        await settle(); await sleep(900)
        const trepo = mkdtempSync(join(tmpdir(), 'tc panels tools-'))
        const tgit = (...args) => execFileSync('git', ['-C', trepo, ...args], { encoding: 'utf8' })
        tgit('init', '-q', '.'); tgit('config', 'user.email', 'v@example.com'); tgit('config', 'user.name', 'v')
        writeFileSync(join(trepo, 'seed.txt'), 'seed\n'); writeFileSync(join(trepo, 'other.txt'), 'other\n')
        tgit('add', '-A'); tgit('commit', '-qm', 'init')
        const chatId = 'c-tools'
        const at = Date.now() - 60000
        agentTranscripts.appendTurn(chatId, { id: 'u-t1', role: 'user', blocks: [{ type: 'text', text: 'add a line' }], at })
        agentTranscripts.appendTurn(chatId, { id: 'm-t1', role: 'assistant', blocks: [
          { type: 'tool_use', id: 'tu-read', name: 'Read', input: { file_path: join(trepo, 'other.txt') } },
          { type: 'tool_use', id: 'tu-edit', name: 'Edit', input: { file_path: join(trepo, 'seed.txt'), old_string: 'seed', new_string: 'seed\nadded by the agent' } },
          { type: 'tool_use', id: 'tu-bash', name: 'Bash', input: { command: `cat ${join(trepo, 'seed.txt')}` } }
        ], at: at + 1000 })
        agentTranscripts.appendTurn(chatId, { id: 'm-t2', role: 'assistant', blocks: [{ type: 'text', text: 'done' }], at: at + 2000 })
        agentTranscripts.appendMeta(chatId, { usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 }, turns: 1 })
        layoutStore.addPreset({ id: 'tools-claude', name: 'Claude (tools)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
        layoutStore.save({
          panels: [{ id: chatId, kind: 'chat', x: 80, y: 80, w: 520, h: 360, z: 1, chat: { cwd: trepo, sessionId: '77777777-7777-4777-8777-777777777777' } }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reT = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reT
        await settle()
        const restored = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${chatId}"]') !== null`), 8000)
        const restoreState = restored === true ? null : await wc.executeJavaScript(`(() => ({ panels: [...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id')), launcher: !!document.querySelector('[data-launcher]'), title: document.title }))()`)
        // The baseline lands asynchronously after agent:create (git in a subprocess).
        const baseline = await waitUntil(() => wc.executeJavaScript(`window.canvas.review.baseline(${JSON.stringify(chatId)}).then((b) => b && b.sha ? b : false)`), 8000)
        // NOW the edit on disk, after the baseline.
        writeFileSync(join(trepo, 'seed.txt'), 'seed\nadded by the agent\n')
        await wc.executeJavaScript(`window.canvas.settings.set('shell.inspectorOpen', true)`)
        // A real click on the chrome selects (the inspector follows selectedId).
        const box = await wc.executeJavaScript(`(() => { const c = document.querySelector('.panel[data-panel-id="${chatId}"] .pf__chrome'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) } })()`)
        if (box) { wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 }) }
        const changes = await waitUntil(() => wc.executeJavaScript(`(() => { const f = [...document.querySelectorAll('[data-review-file]')].map((e) => e.getAttribute('data-review-file')); return f.includes('seed.txt') ? f : false })()`), 10000)
        const reviewBtn = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-inspector-action="review"]'); return b && !b.disabled ? { title: b.title } : false })()`), 5000)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-inspector-action="review"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const nodeRow = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.review-node'); if (!n) return false; const f = n.querySelector('[data-review-node-file="seed.txt"]'); if (!f) return false; const t = f.querySelector('[data-review-node-touches]'); return { id: n.getAttribute('data-panel-id'), touches: t ? t.getAttribute('data-review-node-touches') : null, text: t ? t.textContent : null, other: !!n.querySelector('[data-review-node-file="other.txt"]') } })()`), 10000)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.review-node [data-review-node-file="seed.txt"] .review-node__file-button'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const touchList = await waitUntil(() => wc.executeJavaScript(`(() => { const l = document.querySelector('.review-node [data-review-node-touch-list]'); return l ? l.textContent : false })()`), 5000)
        ok(IDS[0],
          restored === true && baseline && typeof baseline.sha === 'string' && Array.isArray(changes) && changes.includes('seed.txt') && !changes.includes('other.txt') &&
            reviewBtn && /review node/.test(reviewBtn.title) && nodeRow && nodeRow.touches === '1' && /1 tool call/.test(nodeRow.text) && nodeRow.other === false &&
            typeof touchList === 'string' && /Edit/.test(touchList) && !/Read/.test(touchList),
          JSON.stringify({ restored, restoreState, baseline: baseline && baseline.sha, changes, reviewBtn, nodeRow, touchList, log: tLog.slice(-3) }))

        // tools.2 — the chat's own tool rows.
        const sel = (q) => `document.querySelector('.panel[data-panel-id="${chatId}"] ${q}')`
        const clickDiff = (tool) => wc.executeJavaScript(`(() => { const row = ${sel(`[data-chat-tool="${tool}"]`)}; const b = row && row.querySelector('[data-chat-tool-diff]'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const stateOf = (tool, want) => waitUntil(() => wc.executeJavaScript(`(() => { const row = ${sel(`[data-chat-tool="${tool}"]`)}; const b = row && row.querySelector('[data-chat-tool-diff-body]'); if (!b) return false; const s = b.getAttribute('data-chat-tool-diff-state'); return s === ${JSON.stringify(want)} ? { state: s, text: b.textContent.slice(0, 200), adds: b.querySelectorAll('.review-node__line--add').length } : false })()`), 8000)
        const verbs = await wc.executeJavaScript(`(() => { const rows = [...document.querySelectorAll('.panel[data-panel-id="${chatId}"] [data-chat-row="tool"]')]; return Object.fromEntries(rows.map((r) => [r.getAttribute('data-chat-tool'), !!r.querySelector('[data-chat-tool-diff]')])) })()`)
        // Declared before the assertion that reads it; measured after the close below.
        let baselineGone = false
        // M168 — tools.3. A GROUP: the chat's two consecutive tool rows sit
        //     under one header, collapsed by default (the rows are in the DOM,
        //     display none); a dispatched click on the hidden Edit row's diff
        //     verb REVEALS the group before the diff opens — a script and a
        //     person land on the same state.
        const groupBefore = await wc.executeJavaScript(`(() => { const g = ${sel('[data-chat-tools]')}; if (!g) return null; const row = g.querySelector('[data-chat-tool="Edit"]'); return { tools: g.getAttribute('data-chat-tools'), open: g.getAttribute('data-chat-tools-open'), head: (g.querySelector('[data-chat-tools-toggle]')?.textContent ?? '').trim(), rowDisplay: row ? getComputedStyle(row).display : null } })()`)
        const clickedEdit = await clickDiff('Edit')
        const editDiff = await stateOf('Edit', 'diff')
        const groupAfter = await wc.executeJavaScript(`(() => { const g = ${sel('[data-chat-tools]')}; if (!g) return null; const row = g.querySelector('[data-chat-tool="Edit"]'); return { open: g.getAttribute('data-chat-tools-open'), rowDisplay: row ? getComputedStyle(row).display : null } })()`)
        // M260. The header names WHAT ran, not how many rows: Read/other.txt,
        // Edit/seed.txt and Bash all land in one group, so the label reads
        // "Read 1 file · Edited 1 file · Ran 1 command" — a meaningful
        // summary, never the bare "3 tools" this check used to require.
        ok('tools.3 consecutive tool rows fold under one header collapsed by default (the rows in the DOM, hidden), its label names what ran, and a dispatched click on a hidden row\'s diff verb reveals the group before the diff opens',
          groupBefore !== null && Number(groupBefore.tools) >= 2 && groupBefore.open === 'false' &&
            /Read 1 file/.test(groupBefore.head) && /Edited 1 file/.test(groupBefore.head) && /Ran 1 command/.test(groupBefore.head) && groupBefore.rowDisplay === 'none' &&
            groupAfter !== null && groupAfter.open === 'true' && groupAfter.rowDisplay !== 'none',
          JSON.stringify({ groupBefore, groupAfter }))
        const clickedRead = await clickDiff('Read')
        const readDiff = await stateOf('Read', 'unchanged')
        await clickPanelClose(wc, chatId)
        await settle()
        // Closing a chat drops its baseline (a Design claim with no row in the table).
        baselineGone = await waitUntil(() => wc.executeJavaScript(`window.canvas.review.baseline(${JSON.stringify(chatId)}).then((b) => b === null)`), 5000)
        ok(IDS[1],
          clickedEdit === true && editDiff && editDiff.adds >= 1 && /added by the agent/.test(editDiff.text) &&
            clickedRead === true && readDiff && /unchanged/.test(readDiff.text) && verbs && verbs.Edit === true && verbs.Read === true && verbs.Bash === false && baselineGone === true,
          JSON.stringify({ clickedEdit, editDiff, clickedRead, readDiff, verbs, baselineGone, log: tLog.slice(-3) }))
        try { rmSync(trepo, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (tErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(tErr && tErr.message || tErr) + ' | renderer: ' + (tLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onT)
      }
    }

    // -------------------------------------------------------------------
    // M76 — approve.1 / approve.2. THE QUESTION ANSWERED FROM AFAR. The fake
    //     runner answers an `ask:` message with a permission request.
    //     approve.1: the request puts the chat in `needs you` on the pill, the
    //     rail row and the dock badge (main's tracker, the terminal's own
    //     channel), the popover row carries the tool and the argument, and
    //     Allow there answers on the wire WITHOUT moving the camera; the
    //     card and the row clear when main's event lands. approve.2: the
    //     palette's `Deny Bash` row puts a deny with a message on the wire;
    //     the context pane's Allow leads its action bar, answers, and reads
    //     disabled by name after.
    // -------------------------------------------------------------------
    {
      const IDS = [
        'approve.1 a permission request puts the chat in needs you on the pill, the rail row and the dock badge; the popover row names the tool and argument; Allow there answers on the wire without moving the camera, and every surface clears',
        'approve.2 the palette\'s Deny row puts a deny with a message on the wire; focusing the chat does not clear its needs-you; the context pane\'s Allow leads the action bar, answers, and is disabled by name after'
      ]
      const aLog = []
      const onA = (_e, level, m) => { if (level >= 2) aLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onA)
      try {
        const aDir = mkdtempSync(join(tmpdir(), 'tc panels approve-'))
        layoutStore.addPreset({ id: 'approve-claude', name: 'Claude (approve)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
        flushLayoutStore()
        const reA = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reA
        await settle()
        await wc.executeJavaScript(`window.canvas.settings.set('shell.railOpen', true)`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        const spawnsBefore = chatSpawns.length
        const minted = await wc.executeJavaScript(`window.__m73Chat(${JSON.stringify(aDir)})`)
        const chatId = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')]; const p = ps[ps.length - 1]; return p ? p.getAttribute('data-panel-id') : false })()`), 5000)
        const sel = (q) => `document.querySelector('.panel[data-panel-id="${chatId}"] ${q}')`
        const sendText = (text) => waitUntil(() => wc.executeJavaScript(`(() => {
          const ta = ${sel('[data-chat-input]')}; if (!ta || ta.disabled) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true }))
          const b = ${sel('[data-chat-send]')}; if (!b || b.disabled) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 8000)
        const pendingIs = (n) => waitUntil(() => wc.executeJavaScript(`${sel('')}?.getAttribute('data-chat-pending') === ${JSON.stringify(String(n))}`), 8000)
        const wireResponses = () => { const spawn = chatSpawns[spawnsBefore]; return spawn ? spawn.proc.stdin.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter((p) => p && p.type === 'control_response') : [] }

        // approve.1
        const sent1 = await sendText('ask: list the directory')
        const pending1 = await pendingIs(1)
        const pill = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent === 'needs you' || false`), 4000)
        const railWord = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-rail-row="${chatId}"]'); return r && r.textContent.includes('needs you') ? true : false })()`), 4000)
        const badge = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock-badge]'); return b && !b.hidden && b.textContent === '1' ? b.textContent : false })()`), 4000)
        const inQueue = await wc.executeJavaScript(`window.__m4aAttention ? window.__m4aAttention() : 'no-hook'`)
        const vpBefore = await wc.executeJavaScript(`window.__m4aViewport()`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="attention"]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        const popRow = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-rail-attention="${chatId}"]'); if (!r) return false; const a = r.querySelector('[data-rail-allow]'); return a ? { allow: a.textContent, title: a.title, arg: r.querySelector('.rail-attention__argument')?.textContent ?? null, deny: !!r.querySelector('[data-rail-deny]') } : false })()`), 4000)
        // M149 — popover.paint.1 (audit F.14). The popover must be the element
        // under its own title's centre — PAINTED over the navigator, not merely
        // in the DOM: M109's glass blur made the dock a stacking context that the
        // rail's z-index 900 covered, and every DOM read here stayed green while
        // a person saw a badge and nothing else.
        const popPaint = await wc.executeJavaScript(`(() => { const t = document.querySelector('.dock__popover .shell__region-title'); if (!t) return 'no popover title'
          const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          const cs = (sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); const b = e.getBoundingClientRect(); return { pos: c.position, z: c.zIndex, filter: c.backdropFilter, rect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] } }
          const hit = top ? (top.closest('.dock__popover') !== null ? true : (top.className || top.tagName)) : 'nothing'
          return hit === true ? true : { hit, at: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)], popover: cs('.dock__popover'), dock: cs('.shell__dock'), rail: cs('.shell__rail'), attention: cs('.dock__attention'), navigator: cs('.navigator') } })()`)
        ok('popover.paint.1 the attention popover, open, is the element under its own title\'s centre — painted above the navigator column, not merely present in the DOM', popPaint === true, JSON.stringify({ popPaint }))
        await wc.executeJavaScript(`(() => { const a = document.querySelector('[data-rail-attention="${chatId}"] [data-rail-allow]'); if (a) a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!a })()`)
        const cleared = await pendingIs(0)
        const rowGone = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-rail-attention="${chatId}"]') === null`), 4000)
        const badgeGone = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock-badge]'); return b ? b.hidden : false })()`), 4000)
        const vpAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
        const idleAgain = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent === 'idle' || false`), 8000)
        const wire1 = wireResponses()
        ok(IDS[0],
          minted && minted.kind === 'spawned' && sent1 === true && pending1 === true && pill === true && railWord === true && badge === '1' &&
            popRow && /Allow Bash/.test(popRow.allow) && popRow.arg === 'ls -la' && popRow.deny === true &&
            wire1.length === 1 && /allow/.test(JSON.stringify(wire1[0])) && !/deny/.test(JSON.stringify(wire1[0])) &&
            cleared === true && rowGone === true && badgeGone === true && idleAgain === true &&
            vpBefore.x === vpAfter.x && vpBefore.y === vpAfter.y && vpBefore.scale === vpAfter.scale,
          JSON.stringify({ minted, sent1, pending1, pill, railWord, badge, inQueue, popRow, wire1, cleared, rowGone, badgeGone, idleAgain, vpBefore, vpAfter, log: aLog.slice(-3) }))
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="attention"]'); if (b && b.getAttribute('aria-pressed') === 'true') b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)

        // approve.2 — the palette's Deny, then the pane's Allow.
        const sent2 = await sendText('ask: again')
        const pending2 = await pendingIs(1)
        await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 3000)
        const denyRow = await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'deny bash'); input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const selected = document.querySelector('.palette__row--selected')
          if (!selected || !/Deny Bash/.test(selected.textContent)) return selected ? selected.textContent : 'no row'
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return selected.textContent })()`)
        const denied = await pendingIs(0)
        const wire2 = wireResponses()
        const idle2 = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent === 'idle' || false`), 8000)
        const sent3 = await sendText('ask: third')
        const pending3 = await pendingIs(1)
        // Select the chat so the context pane shows it; the pane may be hidden by an earlier check.
        await wc.executeJavaScript(`window.canvas.settings.set('shell.inspectorOpen', true)`)
        await wc.executeJavaScript(`(() => { const body = ${sel('.chat__body')}; if (body) body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return !!body })()`)
        await settle()
        // Focus is the terminal's acknowledgement; a chat's needs-you is a
        // question, not a bell, and the badge must still say one.
        const badgeAfterFocus = await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock-badge]'); return b && !b.hidden ? b.textContent : 'hidden' })()`)
        const paneAllow = await waitUntil(() => wc.executeJavaScript(`(() => { const a = document.querySelector('[data-inspector-action="allow"]'); const acts = [...document.querySelectorAll('[data-inspector-action]')].map((b) => b.getAttribute('data-inspector-action')); return a && !a.disabled ? { text: a.textContent, title: a.title, first: acts[0], deny: !!document.querySelector('[data-inspector-action="deny"]') } : false })()`), 5000)
        await wc.executeJavaScript(`(() => { const a = document.querySelector('[data-inspector-action="allow"]'); if (a) a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!a })()`)
        const cleared3 = await pendingIs(0)
        const paneAfter = await waitUntil(() => wc.executeJavaScript(`(() => { const a = document.querySelector('[data-inspector-action="allow"]'); return a && a.disabled ? { text: a.textContent, title: a.title } : false })()`), 5000)
        const wire3 = wireResponses()
        ok(IDS[1],
          sent2 === true && pending2 === true && /Deny Bash/.test(String(denyRow)) && denied === true &&
            wire2.length === 2 && /deny/.test(JSON.stringify(wire2[1])) && /denied from the canvas/.test(JSON.stringify(wire2[1])) && idle2 === true &&
            sent3 === true && pending3 === true && paneAllow && /Allow Bash/.test(paneAllow.text) && paneAllow.first === 'allow' && paneAllow.deny === true &&
            badgeAfterFocus === '1' && cleared3 === true && paneAfter && /nothing is waiting/.test(paneAfter.title) && wire3.length === 3 && /allow/.test(JSON.stringify(wire3[2])),
          JSON.stringify({ sent2, pending2, denyRow, denied, wire2: wire2.slice(1), idle2, sent3, pending3, badgeAfterFocus, paneAllow, cleared3, paneAfter, wire3: wire3.slice(2), log: aLog.slice(-3) }))
        await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent === 'idle' || false`), 8000)
        await clickPanelClose(wc, chatId)
        await settle()
        try { rmSync(aDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (aErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(aErr && aErr.message || aErr) + ' | renderer: ' + (aLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onA)
      }
    }

    // -------------------------------------------------------------------
    // M82 — budget.1. THE CEILING, END TO END. With the budget set below the
    //     canvas's reported spend, a send from a chat is REFUSED in the
    //     composer with the ceiling and the fix named, and nothing is added to
    //     the transcript; raising the ceiling lets the same send through.
    // -------------------------------------------------------------------
    {
      const IDS = ['budget.1 a send over the canvas budget is refused in the composer with the ceiling and the fix named, adds no turn, and goes through once the ceiling is raised']
      const bLog = []
      const onB = (_e, level, m) => { if (level >= 2) bLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onB)
      try {
        const bDir = mkdtempSync(join(tmpdir(), 'tc panels budget-'))
        layoutStore.addPreset({ id: 'budget-claude', name: 'Claude (budget)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
        flushLayoutStore()
        const reB = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reB
        await settle()
        await wc.executeJavaScript(`window.__m73Chat(${JSON.stringify(bDir)})`)
        const chatId = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')]; const p = ps[ps.length - 1]; return p ? p.getAttribute('data-panel-id') : false })()`), 8000)
        const sel = (q) => `document.querySelector('.panel[data-panel-id="${chatId}"] ${q}')`
        const sendText = (text) => waitUntil(() => wc.executeJavaScript(`(() => {
          const ta = ${sel('[data-chat-input]')}; if (!ta || ta.disabled) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true }))
          const b = ${sel('[data-chat-send]')}; if (!b || b.disabled) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 8000)
        await sendText('first')
        await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent === 'idle' || false`), 10000)
        const turnsBefore = await wc.executeJavaScript(`${sel('')}?.getAttribute('data-chat-turns') ?? null`)
        await wc.executeJavaScript(`window.canvas.settings.set('agents.budgetUsd', 0.0001)`)
        await settle()
        const sentOver = await sendText('over the ceiling')
        // The COMPOSER's own refusal (M75's `data-chat-send-refusal`); the
        // store's `data-chat-refusal` is the create's, a different fact.
        const refusal = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-send-refusal]')}?.textContent ?? false`), 6000)
        const turnsAfter = await wc.executeJavaScript(`${sel('')}?.getAttribute('data-chat-turns') ?? null`)
        await wc.executeJavaScript(`window.canvas.settings.set('agents.budgetUsd', 0)`)
        await settle()
        const sentAgain = await sendText('after raising it')
        const throughAgain = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-send-refusal]')} === null`), 6000)
        ok(IDS[0],
          typeof chatId === 'string' && turnsBefore === '1' && sentOver === true &&
            typeof refusal === 'string' && /budget for this canvas/.test(refusal) && /raise it in settings/.test(refusal) &&
            turnsAfter === turnsBefore && sentAgain === true && throughAgain === true,
          JSON.stringify({ chatId, turnsBefore, sentOver, refusal, turnsAfter, sentAgain, throughAgain, log: bLog.slice(-3) }))
        await clickPanelClose(wc, chatId)
        await settle()
        try { rmSync(bDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (bErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(bErr && bErr.message || bErr) + ' | renderer: ' + (bLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onB)
      }
    }

    // -------------------------------------------------------------------
    // M83 — memory.1. THE PROJECT MEMORY, END TO END. A memory node opened
    //     on a real repository reads EMPTY by name, an added memory appears
    //     with its kind, a secret typed into one is scrubbed before it is
    //     stored, and closing the node sends NO pty.kill for its id while a
    //     terminal closed in the same window IS recorded (the sessionless
    //     kinds' own non-vacuity shape, reached by a seventh kind).
    // -------------------------------------------------------------------
    {
      const IDS = ['memory.1 a memory node reads its repository empty by name, an added memory appears with its kind and is scrubbed of secrets, and closing the node sends no pty.kill while a terminal close in the same window is recorded']
      const yLog = []
      const onY = (_e, level, m) => { if (level >= 2) yLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onY)
      try {
        const yRepo = mkdtempSync(join(tmpdir(), 'tc panels memory-'))
        layoutStore.save({
          panels: [{ id: 'mem1', kind: 'memory', x: 80, y: 80, w: 460, h: 420, z: 1, source: { root: yRepo } },
            ...fromPanels([{ kind: 'terminal', rect: { id: 'yT', x: 620, y: 80, w: 320, h: 220 }, z: 2, spec: { panelId: 'yT', cwd: require('node:os').homedir(), command: '/bin/sh', args: ['-c', 'sleep 600'] } }])],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reY = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reY
        await settle()
        const emptyArm = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="mem1"] [data-memory-arm="empty"]')?.textContent ?? false`), 8000)
        // No session for a document kind, and no xterm.
        const hasSession = await wc.executeJavaScript(`Object.prototype.hasOwnProperty.call(window.__m4aSessions(), 'mem1')`)
        const added = await wc.executeJavaScript(`(async () => {
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          const input = document.querySelector('.panel[data-panel-id="mem1"] [data-memory-text]')
          if (!input) return 'no input'
          set.call(input, 'we chose tmux; the token is ghp_0123456789012345678901234567890123456789')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          const save = document.querySelector('.panel[data-panel-id="mem1"] [data-memory-save]')
          if (!save) return 'no save'
          // shellControl runs on CLICK (its mousedown only preventDefaults).
          save.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
          return true })()`)
        const entry = await waitUntil(() => wc.executeJavaScript(`(() => { const e = document.querySelector('.panel[data-panel-id="mem1"] [data-memory-entry]'); return e ? { kind: e.getAttribute('data-memory-entry'), text: e.querySelector('.memory-node__text')?.textContent ?? '' } : false })()`), 6000)
        // The store's own file: the secret is not in it.
        const onDisk = (() => { try { return require('node:fs').readFileSync(memoryStore.fileOf(yRepo), 'utf8') } catch (e) { return `ERR ${String(e && e.message)}` } })()
        const killsBefore = killedPanelIds.length
        await clickPanelClose(wc, 'mem1')
        await settle()
        const killsAfterNode = killedPanelIds.length
        await clickPanelClose(wc, 'yT')
        await settle()
        const killsAfterTerminal = killedPanelIds.length
        ok(IDS[0],
          typeof emptyArm === 'string' && /nothing remembered/.test(emptyArm) && hasSession === false &&
            added === true && entry && entry.kind === 'decided' && /we chose tmux/.test(entry.text) && !/ghp_0123/.test(entry.text) &&
            typeof onDisk === 'string' && !/ghp_0123/.test(onDisk) && /we chose tmux/.test(onDisk) &&
            killsAfterNode === killsBefore && killsAfterTerminal > killsAfterNode,
          JSON.stringify({ emptyArm, hasSession, added, entry, onDisk: String(onDisk).slice(0, 160), killsBefore, killsAfterNode, killsAfterTerminal, log: yLog.slice(-3) }))
        try { rmSync(yRepo, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (yErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(yErr && yErr.message || yErr) + ' | renderer: ' + (yLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onY)
      }
    }

    // -------------------------------------------------------------------
    // M83 — memory.2. THE STATED CONTEXT. A chat opened in a repository that
    //     has memories SAYS how many will go with its first message, and the
    //     first message on the wire carries exactly those, ahead of the
    //     user's text. Both halves in one check on purpose: a note with no
    //     context is a lie, and context with no note is the failure this
    //     milestone's spec names — "memories the panel never said it would".
    //     After the first turn the note is gone, because the claim is only
    //     true of the first message.
    // -------------------------------------------------------------------
    {
      const IDS = ['memory.2 a chat states how many memories go with its first message and the wire carries exactly those, ahead of the text — a memory added after the note rendered does not ride along; the note leaves after the first turn']
      const zLog = []
      const onZ = (_e, _l, m) => { zLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onZ)
      try {
        const zRepo = mkdtempSync(join(tmpdir(), 'tc panels memctx-'))
        memoryStore.add({ root: zRepo, kind: 'decided', text: 'sessions live in tmux' })
        memoryStore.add({ root: zRepo, kind: 'failed', text: 'parsing the pretty output' })
        const reZ = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reZ
        await settle()
        const mintedZ = await wc.executeJavaScript(`window.__m73Chat(${JSON.stringify(zRepo)})`)
        const zChat = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')]; const p = ps[ps.length - 1]; return p ? p.getAttribute('data-panel-id') : false })()`), 5000)
        const zSel = (q) => `document.querySelector('.panel[data-panel-id="${zChat}"] ${q}')`
        const note = await waitUntil(() => wc.executeJavaScript(`(() => { const n = ${zSel('[data-chat-memory-note]')}; return n ? n.textContent : false })()`), 6000)
        // The note has rendered. A memory added NOW must NOT ride along: the
        // panel announced two, and a message carrying three would be exactly
        // the disclosure failure the note exists to prevent (M83's verifier).
        memoryStore.add({ root: zRepo, kind: 'note', text: 'added after the note rendered' })
        const spawnsBeforeZ = chatSpawns.length
        await wc.executeJavaScript(`(() => {
          const ta = ${zSel('[data-chat-input]')}; if (!ta || ta.disabled) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, 'what did we decide?'); ta.dispatchEvent(new Event('input', { bubbles: true }))
          const b = ${zSel('[data-chat-send]')}; if (!b || b.disabled) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const sentZ = await waitUntil(async () => chatSpawns.length > spawnsBeforeZ && chatSpawns[chatSpawns.length - 1].proc.stdin.length > 0, 6000)
        const wireZ = sentZ ? JSON.parse(chatSpawns[chatSpawns.length - 1].proc.stdin[0]) : null
        const textZ = wireZ ? (wireZ.message.content.find((c) => c.type === 'text') || {}).text || '' : ''
        const noteGone = await waitUntil(() => wc.executeJavaScript(`${zSel('[data-chat-memory-note]')} === null`), 8000)
        ok(IDS[0],
          mintedZ && mintedZ.kind === 'spawned' && typeof note === 'string' && /2 memories/.test(note) && /first message/.test(note) &&
            sentZ === true && /sessions live in tmux/.test(textZ) && /parsing the pretty output/.test(textZ) &&
            !/added after the note rendered/.test(textZ) && /— 2 memories\]/.test(textZ) &&
            textZ.indexOf('sessions live in tmux') < textZ.indexOf('what did we decide?') && noteGone === true,
          JSON.stringify({ mintedZ, note, sentZ, textZ: textZ.slice(0, 200), noteGone, log: zLog.slice(-3) }))
        try { rmSync(zRepo, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (zErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(zErr && zErr.message || zErr) + ' | renderer: ' + (zLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onZ)
      }
    }

    // -------------------------------------------------------------------
    // M48 — first run. firstrun.1: a canvas booted with ZERO panels shows the
    // launcher, its preset control spawns through preset:spawn-by-id (the
    // harness's real handler), and the launcher leaves. firstrun.2: a canvas
    // restored with one DORMANT panel shows no launcher — keyed on
    // panels.length, never on activity. firstrun.3: a hint fades after its
    // gesture and stays faded across a reload. env.1: a report with a failed
    // probe renders the banner, and the Environment scope names the cause.
    // -------------------------------------------------------------------
    {
      const rLog = []
      const onR = (_e, level, message) => { if (level >= 2) rLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onR)
      const IDS = [
        'firstrun.1 a canvas with zero panels shows the launcher, whose preset control spawns through preset:spawn-by-id, and the launcher leaves',
        'firstrun.2 a canvas restored with one dormant panel shows no launcher',
        'firstrun.3 no gesture hint at rest; one appears ALONE after its attempt (M262), fades after its gesture, and stays faded across a reload',
        'env.1 a failed shell probe renders the banner, and the Environment scope names the cause'
      ]
      const reloadWith = async (panels) => {
        layoutStore.save({ panels: fromPanels(panels), camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const re = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await re
        await settle()
      }
      const launcherUp = () => wc.executeJavaScript(`!!document.querySelector('[data-launcher]')`)
      try {
        state.backend = createDirectBackend('verify: direct (m48 first run)')
        const home = require('node:os').homedir()
        layoutStore.clearPreference('hints.seen')
        await reloadWith([])
        const zero = await waitUntil(async () => wc.executeJavaScript(`document.querySelectorAll('.panel').length === 0`), 5000)
        const up = await launcherUp()
        const presetControls = await wc.executeJavaScript(`[...document.querySelectorAll('[data-launcher-preset]')].map((b) => ({ id: b.dataset.launcherPreset, disabled: b.disabled, title: b.title }))`)
        // The login shell preset is always available; spawn through it.
        const shellControl = presetControls.find((c) => !c.disabled)
        const sessionsBefore = await sessionMap(wc)
        if (shellControl) await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-launcher-preset="' + ${JSON.stringify(shellControl.id)} + '"]'); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
        const spawned = await waitUntil(async () => wc.executeJavaScript(`document.querySelectorAll('.panel').length === 1`), 8000)
        await settle()
        const gone = !(await launcherUp())
        const live = await waitUntil(async () => (await sessionMap(wc)).size > sessionsBefore.size, 8000)
        ok(IDS[0],
          zero === true && up === true && presetControls.length > 0 && shellControl !== undefined &&
            spawned === true && gone === true && live === true,
          JSON.stringify({ zero, up, presetControls, spawned, gone, live }))

        // firstrun.2. One DORMANT panel: no launcher. The hints list is
        //             cleared first: firstrun.1's spawn legitimately used the
        //             ⌘N gesture, and firstrun.3 wants all four hints at rest.
        layoutStore.clearPreference('hints.seen')
        await reloadWith([{ kind: 'terminal', rect: { id: 'dA', x: 60, y: 60, w: 300, h: 220 }, z: 1, spec: { panelId: 'dA', cwd: home, command: '/bin/sh', args: [] } }])
        const dormant = await wc.executeJavaScript(`(window.__m4aSessions ? window.__m4aSessions() : []).find((s) => s.id === 'dA') ?? null`)
        const upDormant = await launcherUp()
        ok(IDS[1], dormant !== null && dormant.dormant === true && dormant.spawned === false && upDormant === false,
          JSON.stringify({ dormant, upDormant }))

        // firstrun.3 (M173). THE HINTS IN THE EMPTY STATE: on an EMPTY canvas the
        //             rail's empty state carries the four gesture hints; opening
        //             the palette fades the ⌘K hint; the fade survives a reload.
        //             (The strip that carried them over a panel is gone — with a
        //             panel on the canvas there is no hint to read, on purpose.)
        // M262. TAUGHT AFTER AN ATTEMPT: nothing at rest; typing into nothing
        //       (the launcher's field blurred — it takes focus on mount) is a
        //       reach for the palette, and its hint appears ALONE.
        await reloadWith([])
        const hintList = `[...document.querySelectorAll('.rail-empty [data-hint]')].map((h) => h.dataset.hint)`
        const hintsAtRest = await wc.executeJavaScript(hintList)
        await wc.executeJavaScript(`(() => { document.activeElement?.blur?.(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true })); return true })()`)
        const afterAttempt = await waitUntil(async () => { const h = await wc.executeJavaScript(hintList); return h.length > 0 ? h : false }, 4000)
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }))`)
        await settle()
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
        const faded = await waitUntil(async () => wc.executeJavaScript(`!document.querySelector('[data-hint="palette"]')`), 4000)
        const seen = await waitUntil(async () => {
          const v = await wc.executeJavaScript(`window.canvas.settings.list().then((rows) => rows.find((r) => r.id === 'hints.seen')?.value ?? null)`)
          return Array.isArray(v) && v.includes('palette') ? v : false
        }, 4000)
        await reloadWith([])
        // After the reload: the seen palette hint does not come back on a second
        // reach, and a mouse wheel over the empty canvas teaches zoom alone.
        await wc.executeJavaScript(`(() => { document.activeElement?.blur?.(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true })); return true })()`)
        await settle()
        const afterReload = await wc.executeJavaScript(hintList)
        await wc.executeJavaScript(`(() => { const c = document.querySelector('.canvas'); c.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, bubbles: true, cancelable: true })); return true })()`)
        const zoomTaught = await waitUntil(async () => { const h = await wc.executeJavaScript(hintList); return h.length > 0 ? h : false }, 4000)
        ok(IDS[2],
          hintsAtRest.length === 0 && Array.isArray(afterAttempt) && afterAttempt.join() === 'palette' &&
            faded === true && seen !== false && afterReload.length === 0 && Array.isArray(zoomTaught) && zoomTaught.join() === 'zoom',
          JSON.stringify({ hintsAtRest, afterAttempt, faded, seen, afterReload, zoomTaught }))

        // firstrun.4 (M173). THE TMUX NOTICE AS A FIRST-RUN BANNER: the harness
        //             runs the direct backend, so the launcher shows the banner;
        //             `Got it` dismisses it into hints.seen and it stays gone
        //             across a reload; the HUD no longer carries the sentence.
        const bannerAtRest = await wc.executeJavaScript(`document.querySelector('[data-launcher-tmux]') !== null`)
        const hudWarn = await wc.executeJavaScript(`document.querySelector('.canvas-hud')?.textContent ?? ''`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-launcher-tmux-dismiss]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`) // a shellControl acts on CLICK (menu.1's lesson)
        const bannerGone = await waitUntil(async () => wc.executeJavaScript(`document.querySelector('[data-launcher-tmux]') === null`), 4000)
        const tmuxSeen = await waitUntil(async () => {
          const v = await wc.executeJavaScript(`window.canvas.settings.list().then((rows) => rows.find((r) => r.id === 'hints.seen')?.value ?? null)`)
          return Array.isArray(v) && v.includes('tmux') ? v : false
        }, 4000)
        await reloadWith([])
        const bannerAfterReload = await wc.executeJavaScript(`document.querySelector('[data-launcher-tmux]') !== null`)
        ok('firstrun.4 the tmux notice is a dismissible first-run banner in the launcher — present on the direct backend, gone on Got it and across a reload — and the HUD pill no longer says it',
          bannerAtRest === true && !/no tmux/.test(hudWarn) && bannerGone === true && tmuxSeen !== false && bannerAfterReload === false,
          JSON.stringify({ bannerAtRest, hudWarn, bannerGone, tmuxSeen, bannerAfterReload }))
        await reloadWith([{ kind: 'terminal', rect: { id: 'dA', x: 60, y: 60, w: 300, h: 220 }, z: 1, spec: { panelId: 'dA', cwd: home, command: '/bin/sh', args: [] } }])

        // env.1. Swap in a failed probe, reload, read the banner and the scope.
        const good = state.harnessEnvReport
        state.harnessEnvReport = { ...good, shell: { path: '/bin/zsh', ok: false, reason: 'login shell produced no PATH' } }
        await reloadWith([])
        const banner = await waitUntil(async () => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-env-banner]'); return b ? b.textContent : null })()`), 5000)
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }))`)
        await settle()
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (!i) return false
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Environment'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return true })()`)
        await settle()
        const scopeRows = await wc.executeJavaScript(`[...document.querySelectorAll('.palette__row')].map((r) => r.textContent).slice(0, 12)`)
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (i) { i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } return true })()`)
        state.harnessEnvReport = good
        ok(IDS[3],
          typeof banner === 'string' && /login shell/i.test(banner) && /no PATH/.test(banner) &&
            scopeRows.some((t) => /could not be read/i.test(t) && /no PATH/.test(t)),
          JSON.stringify({ banner, scopeRows: scopeRows.slice(0, 4) }))
      } catch (rErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(rErr && rErr.message || rErr) + ' | renderer: ' + (rLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onR)
      }
    }

    // -------------------------------------------------------------------
    // M49 — panel typography. type.1: the global setting grows a live
    // terminal's cell, and a REAL click on a marker cell still reaches xterm
    // afterwards — the pointer corrector read the new metrics rather than a
    // cached pair. type.2: a per-panel override persists across a reload and
    // wins over the global.
    // -------------------------------------------------------------------
    {
      const tLog = []
      const onT = (_e, level, message) => { if (level >= 2) tLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onT)
      const IDS = [
        'type.1 setting terminal.fontSize grows a live terminal\'s cell and a real click on a marker cell still reaches xterm at the new metrics',
        'type.2 a per-panel font override persists across a reload and wins over the global size'
      ]
      // The session's OWN cell metrics — the pair the pointer corrector reads —
      // never a DOM row count, which the WebGL renderer does not produce.
      const cellOf = (id) => wc.executeJavaScript(`(() => { const c = window.__m49CellSize ? window.__m49CellSize(${JSON.stringify(id)}) : null; return c ? { h: c.height, w: c.width } : null })()`)
      try {
        state.backend = createDirectBackend('verify: direct (m49 typography)')
        const home = require('node:os').homedir()
        layoutStore.setPreference('terminal.fontSize', 13)
        layoutStore.save({ panels: fromPanels([
          // M257's two-line resting creation row owns the top of the canvas;
          // keep this pointer-metrics fixture below that chrome.
          { kind: 'terminal', rect: { id: 'tA', x: 60, y: 160, w: 520, h: 320 }, z: 1, spec: { panelId: 'tA', cwd: home, command: '/bin/sh', args: [] } },
          { kind: 'terminal', rect: { id: 'tB', x: 640, y: 160, w: 520, h: 320 }, z: 2, spec: { panelId: 'tB', cwd: home, command: '/bin/sh', args: [] }, fontSize: 20 }
        ]), camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reT = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reT
        await waitUntil(async () => wc.executeJavaScript(`['tA', 'tB'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        const wake = async (id) => {
          await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(id)} + '"] .panel__card'); if (!card) return false
            const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
          return waitUntil(async () => (await sessionMap(wc)).has(id), 10000)
        }
        const wokeA = await wake('tA')
        await settle()
        // Focus tA for real (DOM focus is a default action) and print a marker.
        const slotA = await wc.executeJavaScript(`(() => { const s = document.querySelector('.panel[data-panel-id="tA"] .panel__slot'); if (!s) return null; const r = s.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (slotA) { wc.sendInputEvent({ type: 'mouseDown', x: slotA.x, y: slotA.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: slotA.x, y: slotA.y, button: 'left', clickCount: 1 }) }
        await settle()
        await wc.executeJavaScript(`window.__m4aWrite ? window.__m4aWrite('echo TYPEMARK\\n') : null`)
        const marked = await waitUntil(async () => wc.executeJavaScript(`window.__m4aCellToScreen('TYPEMARK') !== null`), 8000)
        const cellBefore = await cellOf('tA')
        // The commit: the setting, through the same invoke the palette row uses.
        await wc.executeJavaScript(`window.canvas.settings.set('terminal.fontSize', 18)`)
        const grew = await waitUntil(async () => { const c = await cellOf('tA'); return c && cellBefore && c.h > cellBefore.h + 2 ? c : false }, 6000)
        await settle()
        // A real click on the marker's cell, then ask xterm where it thinks the
        // click landed: the corrector must have read the NEW cell size.
        const target = await wc.executeJavaScript(`window.__m4aCellToScreen('TYPEMARK')`)
        let reached = null
        if (target) {
          wc.sendInputEvent({ type: 'mouseDown', x: Math.round(target.x), y: Math.round(target.y), button: 'left', clickCount: 1 })
          wc.sendInputEvent({ type: 'mouseUp', x: Math.round(target.x), y: Math.round(target.y), button: 'left', clickCount: 1 })
          await settle()
          reached = await wc.executeJavaScript(`(() => { const el = document.elementFromPoint(${Math.round(target.x)}, ${Math.round(target.y)}); return !!(el && el.closest('.panel[data-panel-id="tA"] .xterm')) })()`)
        }
        ok(IDS[0],
          wokeA === true && marked === true && cellBefore !== null && grew !== false && target !== null && reached === true,
          JSON.stringify({ wokeA, marked, cellBefore, grew, target, reached }))

        // type.2. tB carries fontSize 20; wake it; its cell is larger than tA's
        //         (18) — the override wins — and it survived the reload above.
        const wokeB = await wake('tB')
        await settle()
        const cellA = await cellOf('tA'), cellB = await cellOf('tB')
        const persisted = layoutStore.initial().panels.find((p) => p.id === 'tB')
        const field = await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row="tB"] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
        await settle()
        const detail = await wc.executeJavaScript(`(() => { const el = document.querySelector('[data-inspector-field="font-size"] dd'); return el ? el.textContent : null })()`)
        ok(IDS[1],
          wokeB === true && cellA !== null && cellB !== null && cellB.h > cellA.h + 1 &&
            persisted !== undefined && persisted.fontSize === 20 && field === true && typeof detail === 'string' && /20/.test(detail),
          JSON.stringify({ wokeB, cellA, cellB, persisted: persisted && persisted.fontSize, detail }))
        await wc.executeJavaScript(`window.canvas.settings.set('terminal.fontSize', 13)`)
      } catch (tErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(tErr && tErr.message || tErr) + ' | renderer: ' + (tLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onT)
      }
    }

    // -------------------------------------------------------------------
    // M50 — placement. snap.1: a REAL drag ending 5 screen px short of
    // another panel's left edge lands its right edge exactly ON it, and a
    // guide was in the DOM mid-drag. tidy.1: the palette's Tidy arranges the
    // selection in ONE undoable step.
    // -------------------------------------------------------------------
    {
      const pLog = []
      const onP = (_e, level, message) => { if (level >= 2) pLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onP)
      const IDS = [
        'snap.1 a real drag ending within the threshold of another panel\'s edge lands on it, with a guide drawn mid-drag',
        'tidy.1 the palette\'s Tidy arranges the selection compactly in one undoable step'
      ]
      const rectOf = (id) => wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(id)} + '"]'); return p ? { x: Number(p.style.left.replace('px', '')), y: Number(p.style.top.replace('px', '')), w: Number(p.style.width.replace('px', '')), h: Number(p.style.height.replace('px', '')) } : null })()`)
      try {
        state.backend = createDirectBackend('verify: direct (m50 placement)')
        const home = require('node:os').homedir()
        layoutStore.setPreference('placement.snap', true)
        const P = (id, x, y) => ({ kind: 'terminal', rect: { id, x, y, w: 300, h: 200 }, z: 1, spec: { panelId: id, cwd: home, command: '/bin/sh', args: [] } })
        // pA at x 100 (right edge 400); pB at x 620 — a 220px gap. pC/pD for tidy.
        layoutStore.save({ panels: fromPanels([P('pA', 100, 100), P('pB', 620, 100), P('pC', 100, 500), P('pD', 700, 560)]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reP = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reP
        await waitUntil(async () => wc.executeJavaScript(`['pA', 'pB', 'pC', 'pD'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]') !== null)`), 10000)
        await settle()
        // Drag pB's chrome LEFT so its left edge ends 5px right of pA's right
        // edge (world 405): dx = 405 - 620 = -215 at scale 1.
        const chrome = await wc.executeJavaScript(`(() => { const c = document.querySelector('.panel[data-panel-id="pB"] .panel__chrome'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) } })()`)
        let guideSeen = false
        if (chrome) {
          const to = { x: chrome.x - 215, y: chrome.y }
          wc.sendInputEvent({ type: 'mouseDown', x: chrome.x, y: chrome.y, button: 'left', clickCount: 1 })
          for (let i = 1; i <= 6; i++) {
            // leftButtonDown, or the drag hook reads buttons === 0 as a release.
            wc.sendInputEvent({ type: 'mouseMove', x: Math.round(chrome.x + (to.x - chrome.x) * i / 6), y: chrome.y, button: 'left', modifiers: ['leftButtonDown'] })
            await sleep(40)
          }
          await sleep(120)
          guideSeen = await wc.executeJavaScript(`document.querySelectorAll('[data-snap-guide]').length > 0`)
          wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
        }
        await settle()
        const after = await rectOf('pB')
        const guideGone = await wc.executeJavaScript(`document.querySelectorAll('[data-snap-guide]').length === 0`)
        ok(IDS[0], chrome !== null && after !== null && after.x === 400 && guideSeen === true && guideGone === true,
          JSON.stringify({ chrome, after, guideSeen, guideGone }))

        // tidy.1. Select pC and pD (rail click then shift-click on chrome is
        //         the M18 gesture; the harness's marquee is heavier) through
        //         the test hook, open the palette, run Tidy, read the rects,
        //         then ONE undo restores both.
        const before = { c: await rectOf('pC'), d: await rectOf('pD') }
        await wc.executeJavaScript(`window.__m50Select ? window.__m50Select(['pC', 'pD']) : null`)
        await settle()
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }))`)
        await settle()
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (!i) return false
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Tidy the selection'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        await settle()
        const rowTitle = await wc.executeJavaScript(`document.querySelector('.palette__row--selected .palette__title')?.textContent ?? null`)
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        await settle()
        const tidied = { c: await rectOf('pC'), d: await rectOf('pD') }
        await wc.executeJavaScript(`window.__m4bUndo()`)
        await settle()
        const undone = { c: await rectOf('pC'), d: await rectOf('pD') }
        ok(IDS[1],
          typeof rowTitle === 'string' && /Tidy the selection/.test(rowTitle) &&
            tidied.c.x === 100 && tidied.c.y === 500 && tidied.d.x === 100 + 300 + 24 && tidied.d.y === 500 &&
            undone.c.x === before.c.x && undone.d.x === before.d.x && undone.d.y === before.d.y,
          JSON.stringify({ rowTitle, before, tidied, undone }))
      } catch (pErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(pErr && pErr.message || pErr) + ' | renderer: ' + (pLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onP)
        layoutStore.setPreference('placement.snap', false)
      }
    }

    // -------------------------------------------------------------------
    // M51 — Cmd-click a path or URL. hover.1: at 50% zoom a REAL mouse move
    // over a link's cell reports that link through the provider's hover —
    // the corrected hover; an uncorrected one lands cells away and reports
    // nothing. links.1: a REAL Cmd-click on it reaches main's link:open with
    // the text and the panel id, a plain click does not, and the window did
    // not navigate.
    // -------------------------------------------------------------------
    {
      const lLog = []
      const onL = (_e, level, message) => { if (level >= 2) lLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onL)
      const IDS = [
        'hover.1 at 50% zoom a real mouse move over a link\'s cell reports that link through the corrected hover',
        'links.1 a real Cmd-click on a link reaches main\'s link:open with its text, a plain click does not, and the window did not navigate'
      ]
      try {
        state.backend = createDirectBackend('verify: direct (m51 links)')
        const home = require('node:os').homedir()
        layoutStore.save({ panels: fromPanels([{ kind: 'terminal', rect: { id: 'lA', x: 60, y: 60, w: 640, h: 400 }, z: 1, spec: { panelId: 'lA', cwd: home, command: '/bin/sh', args: [] } }]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reL = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reL
        await waitUntil(async () => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="lA"]') !== null`), 10000)
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="lA"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        const woke = await waitUntil(async () => (await sessionMap(wc)).has('lA'), 10000)
        await settle()
        const slotPt = await wc.executeJavaScript(`(() => { const s = document.querySelector('.panel[data-panel-id="lA"] .panel__slot'); if (!s) return null; const r = s.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (slotPt) { wc.sendInputEvent({ type: 'mouseDown', x: slotPt.x, y: slotPt.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: slotPt.x, y: slotPt.y, button: 'left', clickCount: 1 }) }
        await settle()
        // Known content through the session handle: a URL on its own line,
        // six blank rows down (M149): at ~48% the M144 chrome overhangs the
        // body's top rows and, painted above them (menu.stack.1), owns the
        // pointer there — the link must sit below the overhang to be hovered
        // or clicked, exactly as a person would find it.
        await wc.executeJavaScript(`window.__m4aWrite('\\r\\n\\r\\n\\r\\n\\r\\n\\r\\n\\r\\nopen http://localhost:5173/ok now\\r\\n')`)
        const marked = await waitUntil(async () => wc.executeJavaScript(`window.__m4aCellToScreen('localhost') !== null`), 8000)
        // Zoom out to ~48% through the canvas's own path.
        for (let i = 0; i < 4; i++) await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))`)
        await settle()
        const scale = await wc.executeJavaScript(`window.__m4aScale()`)
        const target = await wc.executeJavaScript(`window.__m4aCellToScreen('localhost')`)
        const hoverOf = () => wc.executeJavaScript(`(() => { const h = document.querySelector('.panel[data-panel-id="lA"] .panel__terminal'); return h ? (h.dataset.linkHover ?? null) : null })()`)
        let hovered = null
        if (target) {
          // A real hover: two moves, the second on the cell, no button held.
          wc.sendInputEvent({ type: 'mouseMove', x: Math.round(target.x) - 30, y: Math.round(target.y) })
          await sleep(60)
          wc.sendInputEvent({ type: 'mouseMove', x: Math.round(target.x), y: Math.round(target.y) })
          hovered = await waitUntil(async () => { const h = await hoverOf(); return h ? h : false }, 3000)
        }
        ok(IDS[0], woke === true && marked === true && scale < 0.6 && target !== null && hovered === 'http://localhost:5173/ok',
          JSON.stringify({ woke, marked, scale, target, hovered }))

        // links.1. Plain click first (nothing recorded), then Cmd-click.
        const before = linkOpens.length
        const urlBefore = wc.getURL()
        if (target) {
          wc.sendInputEvent({ type: 'mouseDown', x: Math.round(target.x), y: Math.round(target.y), button: 'left', clickCount: 1 })
          wc.sendInputEvent({ type: 'mouseUp', x: Math.round(target.x), y: Math.round(target.y), button: 'left', clickCount: 1 })
          await settle()
        }
        const afterPlain = linkOpens.length
        if (target) {
          wc.sendInputEvent({ type: 'mouseDown', x: Math.round(target.x), y: Math.round(target.y), button: 'left', clickCount: 1, modifiers: ['meta'] })
          wc.sendInputEvent({ type: 'mouseUp', x: Math.round(target.x), y: Math.round(target.y), button: 'left', clickCount: 1, modifiers: ['meta'] })
        }
        const opened = await waitUntil(async () => (linkOpens.length > afterPlain ? linkOpens[linkOpens.length - 1] : false), 4000)
        await settle()
        const urlAfter = wc.getURL()
        ok(IDS[1],
          afterPlain === before && opened !== false && opened.target === 'http://localhost:5173/ok' && opened.panelId === 'lA' && urlAfter === urlBefore,
          JSON.stringify({ before, afterPlain, opened, navigated: urlAfter !== urlBefore }))
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', metaKey: true }))`)
      } catch (lErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(lErr && lErr.message || lErr) + ' | renderer: ' + (lLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onL)
      }
    }

    // -------------------------------------------------------------------
    // drop.1 (M59). The drop door, hit-tested: a path dropped OVER a live
    //   terminal panel is PASTED into it (bracketed, the same door Jira
    //   context uses) and opens no file panel; the same path over empty
    //   canvas opens a file panel; a drop with the palette open does
    //   neither. Through __m59Drop, the same function the real handler
    //   calls, because a real drop cannot be synthesised (File.path is gone
    //   and webUtils needs a real file). Red first: no hook, no hit test.
    {
      const dropDir = mkdtempSync(join(tmpdir(), 'tc panels drop '))
      const dropped = join(dropDir, 'notes file.md')
      writeFileSync(dropped, '# dropped\n')
      const liveId = await wc.executeJavaScript(`((window.__m4aSessions ? window.__m4aSessions() : []).find((s) => s.spawned) || {}).id || null`)
      const box = liveId ? await wc.executeJavaScript(`(() => {
        const el = document.querySelector('.panel[data-panel-id="${liveId}"] .panel__slot')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } })()`) : null
      // The paste is observed at the MANAGER's write — the renderer's pty:write
      // lands here — rather than in the log tail, where a prompt line without
      // its newline is not yet a line.
      const writes = []
      const origWrite = ptyManager.write.bind(ptyManager)
      ptyManager.write = (id, data) => { if (id === liveId) writes.push(data); return origWrite(id, data) }
      const off = () => { ptyManager.write = origWrite }
      const filesBefore = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind="file"]').length`)
      const overPanel = box ? await wc.executeJavaScript(`typeof window.__m59Drop === 'function' ? window.__m59Drop(${JSON.stringify(dropped)}, ${box.x}, ${box.y}) : null`) : null
      // The paste reaches the PTY as bracketed text; the shell echoes it.
      const pasted = liveId ? await waitUntil(async () => writes.some((d) => d.includes('notes file.md')), 6000) : false
      const filesAfterPanel = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind="file"]').length`)
      // Empty canvas: the top-left corner of the host is below the toolbar and
      // outside every panel after Cmd+0 (panels sit at the seed rects).
      const overCanvas = await wc.executeJavaScript(`typeof window.__m59Drop === 'function' ? window.__m59Drop(${JSON.stringify(dropped)}, 8, 8) : null`)
      const fileOpened = await waitUntil(async () => (await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind="file"]').length`)) > filesAfterPanel, 4000)
      const filesAfterCanvas = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind="file"]').length`)
      await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const withPalette = await wc.executeJavaScript(`typeof window.__m59Drop === 'function' ? window.__m59Drop(${JSON.stringify(dropped)}, 8, 8) : null`)
      await settle()
      const filesAfterOverlay = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind="file"]').length`)
      await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (i) { i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } })()`)
      if (off) off()
      ok('drop.1 a path dropped over a live terminal is pasted into it and opens no file panel; over empty canvas it opens one; with the palette open it does nothing',
        liveId !== null && box !== null && overPanel === 'pasted' && pasted === true && filesAfterPanel === filesBefore &&
          overCanvas === 'opened' && fileOpened === true && filesAfterCanvas === filesBefore + 1 &&
          withPalette === 'ignored' && filesAfterOverlay === filesAfterCanvas,
        JSON.stringify({ liveId, box, overPanel, pasted, filesBefore, filesAfterPanel, overCanvas, fileOpened, filesAfterCanvas, withPalette, filesAfterOverlay }))
      rmSync(dropDir, { recursive: true, force: true })
    }

    // export.1 (M58). THE DOOR OUT, end to end: a sentinel echoed into a live
    //   panel reaches the durable log, the palette row asks main, main's
    //   exporters (over this harness's scratch "dialog") write a file that
    //   holds the sentinel with no escape bytes; then the PNG row writes a
    //   real PNG of the composited frame. Read off DISK. Red first: the
    //   harness exporters were the inert default, which answers `failed`.
    {
      const exportDir = mkdtempSync(join(tmpdir(), 'tc panels export '))
      // A panel of its own, spawned at the camera centre and therefore live.
      const idsBefore = await wc.executeJavaScript(`(window.__m4aSessions ? window.__m4aSessions() : []).map((s) => s.id)`)
      wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: require('node:os').homedir(), args: ['-l'] })
      const liveId = await waitUntil(async () => {
        const rows = await wc.executeJavaScript(`(window.__m4aSessions ? window.__m4aSessions() : [])`)
        const fresh = rows.find((r) => !idsBefore.includes(r.id) && r.spawned)
        return fresh ? fresh.id : false
      }, 8000) || null
      const focused = liveId ? await wc.executeJavaScript(`(() => {
        const el = document.querySelector('.panel[data-panel-id="${liveId}"] .xterm-screen') || document.querySelector('.panel[data-panel-id="${liveId}"] .panel__slot')
        if (!el) return false
        const r = el.getBoundingClientRect()
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1 }))
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }))
        return true })()`) : false
      if (liveId) ptyManager.write(liveId, 'echo EXPORT_SENTINEL_7781\r')
      const logged = liveId ? await waitUntil(async () => (await scrollbackLog.tail(liveId, 8)).some((l) => /EXPORT_SENTINEL_7781/.test(l)), 8000) : false
      const openP = async () => {
        await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      }
      const runRow = async (rowId) => {
        const opened = await openP()
        if (opened !== true) return 'no palette'
        return wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-command-id=' + JSON.stringify(${JSON.stringify(rowId)}) + ']')
          if (!el) return 'no row'
          if (el.className.includes('palette__row--disabled')) return 'disabled: ' + (el.getAttribute('title') || el.textContent)
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
          return true })()`)
      }
      state.exportTarget = join(exportDir, 'panel.txt')
      const ranText = await runRow('panel.export-text')
      const textWritten = await waitUntil(async () => existsSync(state.exportTarget) && /EXPORT_SENTINEL_7781/.test(readFileSync(state.exportTarget, 'utf8')), 6000)
      const text = existsSync(state.exportTarget) ? readFileSync(state.exportTarget, 'utf8') : ''
      state.exportTarget = join(exportDir, 'canvas.png')
      const ranPng = await runRow('canvas.export-png')
      const pngWritten = await waitUntil(async () => existsSync(state.exportTarget) && readFileSync(state.exportTarget).length > 8, 8000)
      const magic = existsSync(state.exportTarget) ? readFileSync(state.exportTarget).subarray(1, 4).toString('latin1') : ''
      state.exportTarget = null
      ok('export.1 the palette writes a panel\'s scrubbed text (holding what it printed, no escape bytes) and a real PNG of the frame, through main',
        liveId !== null && focused === true && logged === true && ranText === true && textWritten === true && !text.includes('\u001b[') &&
          ranPng === true && pngWritten === true && magic === 'PNG',
        JSON.stringify({ liveId, focused, logged, ranText, textWritten, textTail: text.slice(-120), ranPng, pngWritten, magic }))
      rmSync(exportDir, { recursive: true, force: true })
    }

    // export.2 (M112). THE SECOND SOURCE, end to end: persistence OFF, a live
    //   panel prints a sentinel and a token, the palette row exports, and the
    //   file holds the sentinel with the token scrubbed — written from the
    //   xterm buffer the renderer serialized, since the log was never fed.
    //   Red first: before M112 this answered `off` and wrote nothing.
    {
      const exportDir = mkdtempSync(join(tmpdir(), 'tc panels export2 '))
      // M112 (review round 1, minor 6). Capture whatever this run's ACTUAL
      // current value is (the schema default, absent an earlier check that
      // changed it) rather than assuming and hardcoding `true` — a comment
      // claiming "the real default" beside a literal was exactly last
      // round's inconsistency.
      const persistBefore = await wc.executeJavaScript(`window.canvas.settings.list().then((rows) => rows.find((r) => r.id === 'scrollback.persist').value)`)
      await wc.executeJavaScript(`window.canvas.settings.set('scrollback.persist', false)`)
      const idsBefore = await wc.executeJavaScript(`(window.__m4aSessions ? window.__m4aSessions() : []).map((s) => s.id)`)
      wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: require('node:os').homedir(), args: ['-l'] })
      const liveId = await waitUntil(async () => {
        const rows = await wc.executeJavaScript(`(window.__m4aSessions ? window.__m4aSessions() : [])`)
        const fresh = rows.find((r) => !idsBefore.includes(r.id) && r.spawned)
        return fresh ? fresh.id : false
      }, 8000) || null
      const focused = liveId ? await wc.executeJavaScript(`(() => {
        const el = document.querySelector('.panel[data-panel-id="${liveId}"] .xterm-screen') || document.querySelector('.panel[data-panel-id="${liveId}"] .panel__slot')
        if (!el) return false
        const r = el.getBoundingClientRect()
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1 }))
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }))
        return true })()`) : false
      if (liveId) ptyManager.write(liveId, 'echo BUFFER_SENTINEL_2291 sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij\r')
      // M112 (review round 1, minor 5). The brief's original had the FIRST
      // executeJavaScript un-awaited, so `&&` was testing a Promise object
      // (always truthy) rather than its resolved value — the check measured
      // only the DOM half, not the session half. Await both.
      const onScreen = liveId ? await waitUntil(async () => {
        const hasSession = await wc.executeJavaScript(`(() => { const s = window.__m4aSessions().find((r) => r.id === ${JSON.stringify(liveId)}); return !!s })()`)
        const inDom = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${liveId}"]') !== null`)
        return hasSession && inDom
      }, 4000) : false
      await new Promise((r) => setTimeout(r, 600))
      state.exportTarget = join(exportDir, 'panel.txt')
      const opened = await (async () => {
        await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      })()
      // M112 (review round 1, CRITICAL 2). The palette's settings reload is
      // async (toggleSetting re-fetches the row list after main answers, it
      // does not update optimistically — see usePaletteActions.ts's own
      // comment on that), so the row can still read disabled for a moment
      // after `spawned` went true. Poll for the row to actually clear
      // `palette__row--disabled` before clicking it — a click landing on a
      // stale-disabled reading proves nothing about whether the door is
      // open, only that the race happened to land on the enabled frame.
      const enabled = opened === true ? await waitUntil(() => wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-command-id="panel.export-text"]')
          return !!el && !el.className.includes('palette__row--disabled')
        })()`), 4000) : false
      const ran = enabled === true ? await wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-command-id="panel.export-text"]')
          if (!el) return 'no row'
          if (el.className.includes('palette__row--disabled')) return 'disabled: ' + (el.getAttribute('title') || el.textContent)
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
          return true })()`) : (opened === true ? 'still disabled' : 'no palette')
      const written = await waitUntil(async () => existsSync(state.exportTarget) && /BUFFER_SENTINEL_2291/.test(readFileSync(state.exportTarget, 'utf8')), 6000)
      const text = existsSync(state.exportTarget) ? readFileSync(state.exportTarget, 'utf8') : ''
      state.exportTarget = null
      // Restore whatever this run's ACTUAL value was before this check
      // touched it (captured above), not an assumed default.
      await wc.executeJavaScript(`window.canvas.settings.set('scrollback.persist', ${JSON.stringify(persistBefore)})`)
      // "no escape bytes" checks for raw ANSI (the ESC-`[` pair), not a
      // literal bracket — the redaction placeholder itself reads
      // `[redacted api key]`, so a bare '[' check would fail on every scrub.
      //
      // M112 (review round 1, CRITICAL 1). Checking only the PREFIX is
      // exactly the half that a terminal-width wrap does NOT split — the
      // token is long enough to wrap inside a normal-width panel, and the
      // original defect left an unredacted TAIL fragment sitting on its own
      // row. `abcdefghijklmnopqrstuvwxyz` sits well inside the token (not
      // at either edge), so its absence proves the WHOLE run was scrubbed,
      // not just whichever half happened to carry the `sk-` prefix.
      //
      // M112 (review round 2, CRITICAL 1 — reopened). TWO earlier attempts
      // at a fix each over-corrected here: a blanket text-based join
      // (round 1) and a pattern-straddle probe (round 2's first attempt)
      // both erased the real breaks between the echoed command, its own
      // output, and the following shell prompt — three distinct real
      // lines — because each one ran through the unrelated sentinel word
      // immediately after a real newline. The actual fix moved upstream
      // entirely: `SessionHandle.serialize()` (session-factory.ts) builds
      // the buffer text off xterm's own `isWrapped`, at the SOURCE, so
      // main never receives a secret split by a wrap and does no
      // wrap-related processing of its own at all. Assert at least one
      // real break SURVIVES between two distinct output lines; a fix that
      // closes every gap (by whatever mechanism, wherever it lives) fails
      // this exactly as it fails verify:file export.6's Arm B.
      ok('export.2 with persistence off the palette exports a live panel from its serialized buffer — the sentinel is in the file, the whole token is not (prefix and an interior run alike), a real line break survives between distinct output lines (the fix is not a blanket join), the door was actually enabled, no escape bytes',
        liveId !== null && focused === true && onScreen === true && enabled === true && ran === true && written === true &&
          !text.includes('sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ') && !text.includes('abcdefghijklmnopqrstuvwxyz') && !text.includes('\x1b[') &&
          /\r\n|\n/.test(text),
        JSON.stringify({ liveId, focused, onScreen, enabled, ran, written, hasBreak: /\r\n|\n/.test(text), tail: text.slice(-200) }))
      rmSync(exportDir, { recursive: true, force: true })
    }

    // telemetry.4 (M112). OFF BY DEFAULT, OBSERVABLY. The harness passes no
    //   --tc-telemetry flag (main's plan is no-dsn), so the bridge field is
    //   false and the MAIN WORLD never loaded the SDK: no __SENTRY__ global.
    //   Fix round 1 (review, MINOR 2): this observes the renderer's own
    //   main-world init() only — it says nothing about the preload's
    //   isolated world, which since fix round 1 calls hookupIpc() (not
    //   init()) and so was never claimed to install a __SENTRY__ global
    //   there either. Red first: the field did not exist.
    {
      const t = await wc.executeJavaScript(`({ field: window.canvas && window.canvas.telemetry ? window.canvas.telemetry.enabled : 'absent', sentry: typeof window.__SENTRY__ })`)
      ok('telemetry.4 with no DSN the bridge says telemetry is off and the renderer has no Sentry global',
        t.field === false && t.sentry === 'undefined', JSON.stringify(t))
    }

    // detail.1 (M57). Semantic zoom read off the DOM: every card is `tail`
    //   at the default zoom, `summary` (naming its panel) once the camera is
    //   pulled to ~0.2, `block` at ~0.08, and `tail` again after Cmd+0 — with
    //   the idle text byte-identical throughout, since three checks above
    //   read it. Zoom by the keyboard stepper rather than a wheel so the
    //   path is the one a user has. Red by fault: thresholds pinned so the
    //   tier never leaves `tail`.
    {
      const cmd = (key) => wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, metaKey: true, bubbles: true }))`)
      const scale = () => wc.executeJavaScript(`window.__m4aViewport().scale`)
      const details = () => wc.executeJavaScript(`[...document.querySelectorAll('.panel__card')].map((c) => c.getAttribute('data-card-detail'))`)
      const idleText = () => wc.executeJavaScript(`[...document.querySelectorAll('.panel__card-idle')].map((c) => c.textContent)`)
      const zoomBelow = async (target) => {
        for (let i = 0; i < 60; i += 1) {
          if ((await scale()) < target) return true
          await cmd('-')
          await sleep(20)
        }
        return false
      }
      // Three terminal panels of its own: the canvas at this point in the
      // run may hold one non-terminal node, and a node has no card.
      for (let i = 0; i < 3; i += 1) wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '~', args: ['-l'] })
      await settle()
      await cmd('0'); await settle()
      const s0 = await scale()
      const d0 = await details()
      const idle0 = await idleText()
      const z1 = await zoomBelow(0.24); await settle()
      const s1 = await scale()
      const d1 = await details()
      const titled = await wc.executeJavaScript(`[...document.querySelectorAll('.panel__card [data-card-summary] .panel__card-summary-title')].every((t) => t.textContent.trim().length > 0)`)
      const z2 = await zoomBelow(0.11); await settle()
      const s2 = await scale()
      const d2 = await details()
      await cmd('0'); await settle()
      const d3 = await details()
      const idle3 = await idleText()
      const all = (list, v) => list.length > 0 && list.every((x) => x === v)
      // At 1.0 three panels are all LIVE, so there are no cards to read: the
      // `tail` tier at that zoom is what the two hundred checks above already
      // exercise, and the idle text under the SUMMARY tier is what checks
      // 13-15 read (they fit-all first, which lands in the summary band).
      ok('detail.1 every card is summary with a title near 0.2 and block near 0.08, and no card claims another tier at 1.0',
        s0 === 1 && d0.every((x) => x === 'tail') && z1 === true && s1 < 0.26 && all(d1, 'summary') && titled === true &&
          z2 === true && s2 < 0.11 && all(d2, 'block') && d3.every((x) => x === 'tail'),
        JSON.stringify({ s0, d0, s1, d1, titled, s2, d2, d3, idle0, idle3 }))
    }

    // flight.1 / trail.1 / bookmark.1 (M56). The camera's discrete jumps
    //   are FLIGHTS unless reduced motion says otherwise; the trail steps
    //   back to exactly where the camera was; a bookmark saved through the
    //   palette reaches the store and `Go to` lands on it. The reduced-motion
    //   answer comes through the __m56ReducedMotion override because the
    //   harness cannot set the OS preference and needs both answers in one
    //   run. Red for flight.1 is by fault (flightDuration forced to 0: every
    //   jump lands in one frame and the mid-flight sample equals the target).
    {
      const vp = () => wc.executeJavaScript(`JSON.stringify(window.__m4aViewport())`).then((t) => JSON.parse(t))
      const same = (a, b) => a.x === b.x && a.y === b.y && a.scale === b.scale
      const cmd = (key, code) => wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, metaKey: true, bubbles: true }))`)
      const clickRow = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-rail-row=' + JSON.stringify(${JSON.stringify(id)}) + '] .rail-row__main')
        if (!el) return false
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true })()`)
      const firstRow = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-rail-row]')
        return el ? el.getAttribute('data-rail-row') : null })()`)
      await wc.executeJavaScript(`window.__m56ReducedMotion(true)`)
      await cmd('0', 'Digit0')
      await settle()
      // Pan away so the target is never where the camera already is.
      await wc.executeJavaScript(`document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', { deltaX: 420, deltaY: 310, deltaMode: 0, bubbles: true, cancelable: true }))`)
      await settle()
      const start = await vp()
      const clicked = firstRow ? await clickRow(firstRow) : false
      await settle()
      const target = await vp()
      await cmd('[', 'BracketLeft')
      await settle()
      const back = await vp()
      ok('trail.1 Cmd+[ returns the camera exactly to where it was before the jump',
        clicked === true && !same(start, target) && same(back, start), JSON.stringify({ firstRow, start, target, back }))
      await wc.executeJavaScript(`window.__m56ReducedMotion(false)`)
      await clickRow(firstRow)
      await sleep(60)
      const mid = await vp()
      const landed = await waitUntil(async () => same(await vp(), target), 3000)
      ok('flight.1 the same jump without reduced motion is a multi-frame flight that lands on the identical target',
        clicked === true && !same(mid, start) && !same(mid, target) && landed === true,
        JSON.stringify({ start, mid, target, landed }))
      await wc.executeJavaScript(`window.__m56ReducedMotion(true)`)
      // bookmark: save HERE (the target), move away, come back by name.
      const openP = async () => {
        await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      }
      const runRow = async (rowId) => {
        const opened = await openP()
        if (opened !== true) return 'no palette'
        return wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-command-id=' + JSON.stringify(${JSON.stringify(rowId)}) + ']')
          if (!el) return 'no row'
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
          return true })()`)
      }
      const added = await runRow('bookmark.add')
      await settle()
      const stored = await waitUntil(async () => {
        const b = layoutStore.initial().bookmarks || []
        return b.length > 0 ? b : false
      }, 3000)
      const bookmarkId = stored && stored[0] ? stored[0].id : null
      await cmd('0', 'Digit0')
      await settle()
      const away = await vp()
      const went = bookmarkId ? await runRow(`bookmark.go.${bookmarkId}`) : 'no id'
      await settle()
      const arrived = await vp()
      ok('bookmark.1 Bookmark this view reaches the store with the camera, and Go to lands on it after the camera moved',
        added === true && stored && stored.length === 1 && stored[0].name === 'View 1' && same(stored[0].camera, target) &&
          !same(away, target) && went === true && same(arrived, target),
        JSON.stringify({ added, stored, away, went, arrived, target }))
      await wc.executeJavaScript(`window.__m56ReducedMotion(true)`)
    }

    // recover.1 (M55). A session that exists in NO layout — spawned straight
    //   through the manager under an id the renderer never minted — then
    //   main's `session:recover` sent to the renderer, as a Restore answer
    //   would. The panel must appear under the session's OWN id, go live by
    //   reattaching rather than by a second spawn (the manager still lists
    //   exactly one session under that id), and a preset spawn afterwards
    //   must mint an id PAST the adopted one — the duplicate-id defect
    //   through recovery's door. Red first: nothing subscribed.
    {
      const orphanId = 'n9990'
      let created = null
      try { created = await ptyManager.create({ panelId: orphanId, cwd: tmpdir(), command: '/bin/sh', args: ['-c', 'sleep 60'] }) } catch (e) { created = { error: String(e) } }
      const rowsBefore = ptyManager.list().filter((r) => r.panelId === orphanId).length
      const before = await panelCount(wc)
      wc.send(IPC_EVENTS.SESSION_RECOVER, [{ panelId: orphanId, pid: created && created.pid ? created.pid : 0, command: '/bin/sh', cwd: tmpdir() }])
      const appeared = await waitUntil(async () => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${orphanId}"]') !== null`), 6000)
      // Wake it: a recovered panel is placed at the camera centre, so a click
      // on its card (with real coordinates — see the M45 lesson) promotes it.
      const live = appeared === true
        ? await waitUntil(async () => wc.executeJavaScript(`(() => {
            const s = (window.__m4aSessions ? window.__m4aSessions() : []).find((x) => x.id === '${orphanId}')
            return !!(s && s.spawned) })()`), 8000)
        : false
      const rowsAfter = ptyManager.list().filter((r) => r.panelId === orphanId).length
      const countAfter = await panelCount(wc)
      const presets = layoutStore.presets()
      if (presets[0]) wc.send(IPC_EVENTS.PRESET_SPAWN, templateOf(presets[0]))
      const grew = await waitUntil(async () => (await panelCount(wc)) === countAfter + 1, 6000)
      const newest = await wc.executeJavaScript(`(() => {
        const ids = (window.__m4aSessions ? window.__m4aSessions() : []).map((s) => s.id)
        return ids.filter((id) => /^n\\d+$/.test(id)).map((id) => Number(id.slice(1))).sort((a, b) => b - a)[0] || 0 })()`)
      ok('recover.1 a session in no layout becomes a panel under its own id, goes live by reattaching (one session, not two), and the next spawn mints past it',
        created && !created.error && rowsBefore === 1 && appeared === true && live === true && rowsAfter === 1 &&
          countAfter === before + 1 && grew === true && Number(newest) > 9990,
        JSON.stringify({ created: created && (created.error ?? created.panelId), rowsBefore, before, appeared, live, rowsAfter, countAfter, grew, newest }))
    }

    // control.1 (M54). THE DOOR, end to end: a real Unix socket in a scratch
    //   dir, the same handler index.ts wires (over this harness's store,
    //   templateOf and a PRESET_SPAWN send), a client speaking one JSON line
    //   — and the canvas gains a panel. Then a bad preset adds nothing and
    //   says why, `list` answers, and `focus` reaches the renderer. Counted
    //   off the DOM, never off the reply: a reply of ok with no panel is the
    //   silent failure a main-only check could not see. Watched red by
    //   FAULT_NO_SPAWN (the handler answered ok, the canvas did not grow).
    {
      const sockDir = mkdtempSync(join(tmpdir(), 'tc panels control '))
      const sockPath = join(sockDir, 'control.sock')
      const FAULT_NO_SPAWN = false
      const handler = createControlHandler({
        presets: () => layoutStore.presets(),
        defaultId: () => layoutStore.defaultPresetId(),
        spawn: (preset, cwd) => {
          if (FAULT_NO_SPAWN) return
          const template = templateOf(preset)
          if (cwd !== undefined) template.cwd = cwd
          wc.send(IPC_EVENTS.PRESET_SPAWN, template)
        },
        list: () => ptyManager.list().map((r) => ({ panelId: r.panelId, pid: r.pid, cwd: r.cwd, command: r.command })),
        focus: (id) => { wc.send(IPC_EVENTS.ATTENTION_JUMP, id); return true },
        // M81. The renderer's own model, over the same ephemeral reply channel
        // main uses — the real path, not a stub.
        canvas: () => requestFromRenderer(wc, IPC_EVENTS.CANVAS_MODEL, null, 2000)
      })
      const server = await createControlServer({ path: sockPath, handle: handler })
      const ask = (line) => new Promise((resolve) => {
        const sock = require('node:net').createConnection(sockPath)
        let buf = ''
        sock.setEncoding('utf8')
        sock.on('data', (d) => { buf += d })
        sock.on('end', () => resolve(buf.trim()))
        sock.on('error', (e) => resolve(`ERR ${e.code}`))
        sock.write(`${line}\n`)
      })
      const presets = layoutStore.presets()
      const presetName = presets[0] ? presets[0].name : null
      const before = await panelCount(wc)
      const opened = presetName ? await ask(JSON.stringify({ verb: 'open', preset: presetName, cwd: tmpdir() })) : ''
      const grew = await waitUntil(async () => (await panelCount(wc)) === before + 1, 6000)
      const after = await panelCount(wc)
      const bad = await ask(JSON.stringify({ verb: 'open', preset: 'no-such-preset-zz' }))
      await settle()
      const stillAfter = await panelCount(wc)
      const listed = await ask('{"verb":"list"}')
      const target = await wc.executeJavaScript(`(window.__m4aSessions ? window.__m4aSessions() : []).map((s) => s.id)[0] || null`)
      const focused = target ? await ask(JSON.stringify({ verb: 'focus', id: target })) : ''
      await settle()
      // M81 — supervisor.1. `tc status` over the SAME socket: the canvas model
      // in the canvas's own words, counted against the DOM (a reply that
      // agrees with itself and not with the canvas is the failure a
      // main-only check cannot see); and the sheet offers ONE supervisor,
      // whose first question sits in its composer unsent.
      const statusText = await ask('{"verb":"status"}')
      const status = (() => { try { return JSON.parse(statusText || '{}') } catch { return {} } })()
      const domPanels = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => ({ id: p.getAttribute('data-panel-id'), word: p.querySelector('[data-state-word]')?.textContent ?? null }))`)
      const withCommand = await ask(JSON.stringify({ verb: 'status', command: 'rm -rf /' }))
      const beforeSup = await panelCount(wc)
      // The sheet's supervisor row, then its second offer.
      const supervisorMade = await wc.executeJavaScript(`window.__m81Supervisor ? window.__m81Supervisor() : 'no hook'`)
      const supervisorState = await waitUntil(() => wc.executeJavaScript(`(() => {
        const chats = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')]
        const sup = chats[chats.length - 1]
        if (!sup) return false
        const composer = sup.querySelector('[data-chat-input]')
        if (!composer || composer.value === '') return false
        return { message: composer.value, turns: sup.getAttribute('data-chat-turns'), title: sup.querySelector('.pf__title, .panel__title')?.textContent ?? null } })()`), 8000)
      // The SHEET's own row, in the DOM — not the predicate behind it (M81's
      // verifier: re-running the predicate is a tautology).
      await wc.executeJavaScript(`window.canvas.settings.set('shell.railOpen', true)`)
      const sheetOption = await waitUntil(() => wc.executeJavaScript(`(async () => {
        if (document.querySelector('[data-spawn-sheet]') === null) {
          // Through the palette's own row — the harness has no menu accelerator.
          if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          await new Promise((r) => setTimeout(r, 200))
          const input = document.querySelector('.palette__input')
          if (!input) return false
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'new panel'); input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 200))
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          await new Promise((r) => setTimeout(r, 600))
        }
        const opt = [...document.querySelectorAll('[data-sheet-what] option')].find((o) => /supervisor/.test(o.textContent))
        return opt ? { disabled: opt.disabled, text: opt.textContent } : false })()`), 6000)
      await wc.executeJavaScript(`(() => { const s = document.querySelector('[data-spawn-sheet]'); if (s) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return !!s })()`)
      // And the create path refuses a second one even when the row is bypassed.
      const secondCreate = await wc.executeJavaScript(`window.__m81Supervisor()`)
      // The durable door: the flag survives a save and a reload.
      layoutStore.flushSync()
      // The flag lives on the chat SOURCE, where copyChatSource writes it.
      const storedFlag = (layoutStore.initial().panels || []).some((p) => p.kind === 'chat' && p.chat && p.chat.supervisor === true)
      const secondOffer = await wc.executeJavaScript(`window.__m81SupervisorOffered ? window.__m81SupervisorOffered() : 'no hook'`)
      await server.close()
      const parse = (t) => { try { return JSON.parse(t || '{}') } catch { return {} } }
      ok('control.1 an open over the real socket adds a panel to the canvas, a bad preset adds nothing and says why, list answers, and focus reaches the renderer',
        presetName !== null && parse(opened).ok === true && grew === true && after === before + 1 &&
          parse(bad).ok === false && /no-such-preset-zz/.test(parse(bad).error || '') && stillAfter === after &&
          parse(listed).ok === true && Array.isArray(parse(listed).sessions) && parse(focused).ok === true,
        JSON.stringify({ presetName, opened, before, after, grew, bad, stillAfter, listed: (listed || '').slice(0, 120), target, focused }))
      ok('supervisor.1 tc status answers over the real socket with the canvas model in the canvas\'s own words, refuses a command key; ONE supervisor per canvas — the sheet\'s row disabled by name AND the create path refusing — its first question unsent, and its flag on disk',
        status.ok === true && Array.isArray(status.canvas?.panels) && status.canvas.panels.length === domPanels.length &&
          status.canvas.panels.every((p) => typeof p.state === 'string' && p.state !== '') &&
          domPanels.filter((d) => d.word !== null).every((d) => status.canvas.panels.some((p) => p.id === d.id && p.state === d.word)) &&
          Array.isArray(status.canvas.edges) && Array.isArray(status.canvas.runs) &&
          (() => { try { const r = JSON.parse(withCommand); return r.ok === false && /command/.test(r.error || '') } catch { return false } })() &&
          supervisorMade === true && supervisorState && /What is this canvas doing\\?/.test(supervisorState.message) && supervisorState.turns === '0' &&
          // Non-vacuity: at least one panel in the DOM carries a state word, so
          // the word comparison above is asserting something.
          domPanels.some((d) => d.word !== null) &&
          sheetOption && sheetOption.disabled === true && /already has one/.test(sheetOption.text) &&
          secondCreate === false && storedFlag === true &&
          secondOffer === false && (await panelCount(wc)) === beforeSup + 1,
        JSON.stringify({ status: { ok: status.ok, panels: status.canvas?.panels, edges: status.canvas?.edges?.length, runs: status.canvas?.runs?.length }, domPanels, withCommand, supervisorMade, supervisorState, sheetOption, secondCreate, storedFlag, secondOffer }))
      rmSync(sockDir, { recursive: true, force: true })
    }

    // M52 — OSC 133 and the run ledger, end to end. A LOGIN-SHELL panel
    // (command absent) is decorated by main; true and false produce a gutter
    // mark each with the shell's exit status; the Work tab lists the runs;
    // Previous prompt scrolls the viewport back to an earlier mark.
    // -------------------------------------------------------------------
    {
      const oLog = []
      const onO = (_e, level, message) => { if (level >= 2) oLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onO)
      const IDS = [
        'osc133.1 a decorated login shell paints a gutter mark per command with the shell\'s exit status, and the Work tab lists the runs',
        'osc133.2 Previous prompt scrolls the viewport back to an earlier prompt mark'
      ]
      try {
        state.backend = createDirectBackend('verify: direct (m52 osc133)')
        const home = require('node:os').homedir()
        // No command: the login shell, which is what main decorates.
        layoutStore.save({ panels: fromPanels([{ kind: 'terminal', rect: { id: 'oA', x: 60, y: 60, w: 640, h: 360 }, z: 1, spec: { panelId: 'oA', cwd: home, args: ['-l'] } }]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reO = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reO
        await waitUntil(async () => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="oA"]') !== null`), 10000)
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="oA"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        const woke = await waitUntil(async () => (await sessionMap(wc)).has('oA'), 10000)
        const marks = (exit) => wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-id="oA"] .cmd-mark[data-cmd-exit="' + ${JSON.stringify(exit)} + '"]').length`)
        // Wait for the first prompt mark before typing, so the shell is up.
        await sleep(1500)
        ptyManager.write('oA', 'true\r')
        const ok0 = await waitUntil(async () => (await marks('0')) > 0, 10000)
        ptyManager.write('oA', 'false\r')
        const ok1 = await waitUntil(async () => (await marks('1')) > 0, 10000)
        // The Work tab: select through the rail (on the PANELS pane — an earlier
        // block may have left the dock elsewhere), pin the context open, switch.
        await wc.executeJavaScript(`window.canvas.settings.set('shell.railOpen', true)`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row="oA"] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
        await settle()
        const ctxHidden = await wc.executeJavaScript(`(document.querySelector('.shell__inspector')?.getBoundingClientRect().width ?? 0) === 0`)
        if (ctxHidden) { await wc.executeJavaScript(`(() => { const b = document.querySelector('.shell__inspector-toggle'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`); await settle() }
        // Detail first, THEN Work: RunsSection fetches the ledger when its tab
        // becomes active, and a tab already on Work (left by an earlier block)
        // would never refetch after the commands ran.
        await wc.executeJavaScript(`(() => { const t = document.querySelector('[data-context-tab="detail"]'); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!t })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const t = document.querySelector('[data-context-tab="work"]'); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!t })()`)
        const runs = await waitUntil(async () => {
          const r = await wc.executeJavaScript(`[...document.querySelectorAll('[data-run-row]')].map((el) => ({ exit: el.dataset.runExit, text: el.textContent }))`)
          return r.length >= 2 ? r : false
        }, 6000)
        // Diagnostic (M79): what the Work tab holds when the rows are missing.
        const workState = runs === false ? await wc.executeJavaScript(`(() => ({ tab: document.querySelector('[data-context-tab="work"]')?.getAttribute('aria-selected'), runLine: document.querySelector('[data-work-run]')?.textContent ?? null, runsArm: document.querySelector('[data-work-arm="runs"]')?.textContent ?? null, rows: document.querySelectorAll('[data-run-row]').length, selected: document.querySelector('.inspector__title, [data-inspector-heading]')?.textContent ?? null, kind: document.querySelector('[data-inspector-kind]')?.getAttribute('data-inspector-kind') ?? null }))()`) : null
        ok(IDS[0],
          woke === true && ok0 === true && ok1 === true && runs !== false &&
            runs.some((r) => /false/.test(r.text) && r.exit === '1') && runs.some((r) => /true/.test(r.text) && r.exit === '0'),
          JSON.stringify({ woke, ok0, ok1, runs, workState }))

        // osc133.2. Enough output to scroll, then Previous prompt from the
        //           palette: viewportY moves back to an earlier mark's line.
        ptyManager.write('oA', 'seq 1 120\r')
        await sleep(1500)
        const yBefore = await wc.executeJavaScript(`window.__m4aScrollY('oA')`)
        // Focus the panel so the row targets it.
        await wc.executeJavaScript(`(() => { const s = document.querySelector('.panel[data-panel-id="oA"] .panel__slot'); if (s) s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); return !!s })()`)
        await settle()
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }))`)
        await settle()
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (!i) return false
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Previous prompt'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        await settle()
        const rowTitle = await wc.executeJavaScript(`document.querySelector('.palette__row--selected .palette__title')?.textContent ?? null`)
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        await settle()
        const yAfter = await wc.executeJavaScript(`window.__m4aScrollY('oA')`)
        ok(IDS[1], typeof rowTitle === 'string' && /Previous prompt/.test(rowTitle) && typeof yBefore === 'number' && typeof yAfter === 'number' && yAfter < yBefore,
          JSON.stringify({ rowTitle, yBefore, yAfter }))
      } catch (oErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(oErr && oErr.message || oErr) + ' | renderer: ' + (oLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onO)
      }
    }

    // -------------------------------------------------------------------
    // M61 — group-keys.1. THE GROUP'S TWO BUTTONS ANSWER A CLICK. Before M61
    // both ran from onMouseDown alone, so a dispatched `click` — the event
    // Enter and Space produce on a focused button — did nothing, and no
    // keyboard could card or remove a group. A seeded group around two
    // panels, one woken live: "card" must card the LIVE member (its slot
    // goes, its session does not), "expand" must uncollapse, and "remove"
    // must drop the frame and leave both panels and the PTY standing.
    // -------------------------------------------------------------------
    {
      const gLog = []
      const onG = (_e, level, message) => { if (level >= 2) gLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onG)
      const ID = 'group-keys.1 card, expand and remove on a group answer a click — the live member is carded, nothing is closed'
      try {
        layoutStore.save({
          panels: fromPanels([
            { kind: 'terminal', rect: { id: 'gA', x: 60, y: 60, w: 420, h: 280 }, z: 1, spec: { panelId: 'gA', cwd: '/tmp', command: '/bin/cat', args: [] } },
            { kind: 'terminal', rect: { id: 'gB', x: 520, y: 60, w: 420, h: 280 }, z: 2, spec: { panelId: 'gB', cwd: '/tmp', command: '/bin/cat', args: [] } }
          ]),
          groups: [{ id: 'g1', label: 'pair', colour: 'blue', panelIds: ['gA', 'gB'] }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const reG = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reG
        await settle()
        const framed = await wc.executeJavaScript(`document.querySelector('.canvas-group[data-group-id="g1"]') !== null`)
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="gA"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        const live = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="gA"] .panel__slot') !== null`), 6000)
        const click = (sel) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true })()`)
        const t1 = await click('.canvas-group[data-group-id="g1"] .canvas-group__toggle')
        await settle()
        const carded = await wc.executeJavaScript(`document.querySelector('.canvas-group[data-group-id="g1"]').classList.contains('canvas-group--collapsed') && document.querySelector('.panel[data-panel-id="gA"] .panel__slot') === null`)
        const t2 = await click('.canvas-group[data-group-id="g1"] .canvas-group__toggle')
        await settle()
        const expanded = await wc.executeJavaScript(`!document.querySelector('.canvas-group[data-group-id="g1"]').classList.contains('canvas-group--collapsed')`)
        // M67 — frame.2b. The group's remove control is a labelled WORD, like
        // `card`/`expand` beside it, not the panel-close × (a group is not
        // closed; its panels stay).
        const removeWord = await wc.executeJavaScript(`(document.querySelector('.canvas-group[data-group-id="g1"] .canvas-group__remove')?.textContent ?? '').trim()`)
        ok('frame.2b the group header\'s remove control reads "remove"', removeWord === 'remove', JSON.stringify({ removeWord }))
        const r1 = await click('.canvas-group[data-group-id="g1"] .canvas-group__remove')
        await settle()
        const removed = await wc.executeJavaScript(`document.querySelector('.canvas-group') === null && document.querySelectorAll('.panel[data-panel-id]').length === 2`)
        const ptyStill = ptyManager.list().some((s) => s.panelId === 'gA')
        ok(ID, framed && live === true && t1 && carded && t2 && expanded && r1 && removed && ptyStill,
          JSON.stringify({ framed, live, t1, carded, t2, expanded, r1, removed, ptyStill, log: gLog.slice(-3) }))
      } catch (gErr) {
        ok(ID, false, 'threw: ' + String(gErr && gErr.message || gErr) + ' | renderer: ' + (gLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onG)
      }
    }

    // -------------------------------------------------------------------
    // M63 — state-edge.1 / state-word.1 / state-popover.1. ONE VOCABULARY, ONE
    // MARK. The frame's left edge is the tone's colour at every tier (a bell
    // paints it amber, a restored-unstarted panel paints it dashed); the
    // pill, the rail row and the inspector's pinned label read the SAME word
    // for the same panel in three states; the attention popover's row names
    // the state and carries a visible jump. Before M63 one panel read
    // `dormant`, `idle` and `click to start` in one screenshot.
    // -------------------------------------------------------------------
    {
      const sLog = []
      const onS = (_e, level, message) => { if (level >= 2) sLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onS)
      const IDS = [
        'state-edge.1 the frame edge is the tone: amber after a bell, solid grey while asleep',
        'state-word.1 pill, rail row and inspector label read one word per panel across asleep, working and needs-you',
        'state-popover.1 the attention popover row names the state and carries a jump'
      ]
      try {
        layoutStore.save({
          panels: fromPanels([
            // cat: echoes what is written, so a line is "working" and a BEL byte is the bell.
            { kind: 'terminal', rect: { id: 'svA', x: 60, y: 60, w: 420, h: 280 }, z: 1, spec: { panelId: 'svA', cwd: '/tmp', command: '/bin/cat', args: [] } },
            { kind: 'terminal', rect: { id: 'svB', x: 520, y: 60, w: 420, h: 280 }, z: 2, spec: { panelId: 'svB', cwd: '/tmp', command: '/bin/cat', args: [] } }
          ]),
          groups: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const reS = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reS
        await settle()
        const words = (id) => wc.executeJavaScript(`(() => {
          const pf = document.querySelector('.panel[data-panel-id="${id}"]')
          const rail = document.querySelector('.rail-row[data-rail-row="${id}"] .rail-row__tail')
          const pill = pf && pf.querySelector('[data-state-word]')
          const card = pf && pf.querySelector('.panel__card-state')
          // The edge is the frame's left BORDER (a border, not an overlay,
          // so the terminal's first cell is never painted over).
          const edge = pf && getComputedStyle(pf)
          return { tone: pf && pf.getAttribute('data-tone'), rail: rail && rail.textContent, pill: pill && pill.textContent, card: card && card.textContent,
            edgeBg: edge && edge.borderLeftColor, edgeImg: edge && edge.borderLeftStyle, edgeW: edge && edge.borderLeftWidth,
            amber: getComputedStyle(document.documentElement).getPropertyValue('--amber').trim(),
            lineStrong: getComputedStyle(document.documentElement).getPropertyValue('--line-strong').trim() }
        })()`)
        const asleep = await words('svA')
        // Wake svA, select it through the rail so the inspector pins it, and
        // let the detector settle into idle.
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="svA"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="svA"] .panel__slot') !== null`), 6000)
        await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row="svA"] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
        await settle()
        const ctxHidden = await wc.executeJavaScript(`(document.querySelector('.shell__inspector')?.getBoundingClientRect().width ?? 0) === 0`)
        if (ctxHidden) { await wc.executeJavaScript(`(() => { const b = document.querySelector('.shell__inspector-toggle'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`); await settle() }
        // Working: the shell is printing right now.
        ptyManager.write('svA', 'seq 1 2000\r')
        const working = await waitUntil(async () => { const w = await words('svA'); return w.rail === 'working' ? w : false }, 4000)
        const inspectorWorking = await wc.executeJavaScript(`document.querySelector('.inspector__state-label')?.textContent ?? null`)
        // Needs you: the bell. Focus svB first so svA's bell is not acknowledged.
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="svB"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="svB"] .panel__slot') !== null`), 6000)
        await wc.executeJavaScript(`(() => { const s = document.querySelector('.panel[data-panel-id="svB"] .panel__slot'); if (!s) return false
          const r = s.getBoundingClientRect(); s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await settle()
        ptyManager.write('svA', String.fromCharCode(7) + String.fromCharCode(13))
        const needsFirst = await waitUntil(async () => { const w = await words('svA'); return w.rail === 'needs you' ? w : false }, 6000)
        // The frame's border-color eases over --dur-2; read the edge after
        // the transition has landed, not mid-tween.
        await sleep(400)
        const needs = needsFirst === false ? false : await words('svA')
        // Re-select svA so the inspector's label is read for the same panel.
        await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row="svA"] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
        await settle()
        const inspectorNeeds = await wc.executeJavaScript(`document.querySelector('.inspector__state-label')?.textContent ?? null`)
        const toRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }

        ok(IDS[0],
          asleep !== null && asleep.tone === 'asleep' && asleep.edgeW === '3px' && asleep.edgeBg === toRgb(asleep.lineStrong) &&
            working !== false && working.edgeBg !== asleep.edgeBg &&
            needs !== false && needs.tone === 'needs-you' && needs.edgeBg === toRgb(needs.amber),
          JSON.stringify({ asleep, needs }))
        ok(IDS[1],
          asleep !== null && asleep.rail === 'asleep' && asleep.pill === 'asleep' &&
            working !== false && working.rail === 'working' && working.pill === 'working' && inspectorWorking === 'working' &&
            needs !== false && needs.rail === 'needs you' && needs.pill === 'needs you' && inspectorNeeds === 'needs you',
          JSON.stringify({ asleep, working, inspectorWorking, needs, inspectorNeeds }))

        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="attention"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        const pop = await wc.executeJavaScript(`(() => {
          const row = document.querySelector('.dock__popover .rail-row[data-rail-attention="svA"]')
          if (!row) return null
          const main = row.querySelector('.rail-row__main')
          return { word: row.querySelector('.rail-row__tail')?.textContent ?? null, go: row.querySelector('.rail-row__go')?.textContent === 'jump', title: main?.getAttribute('title') ?? null }
        })()`)
        ok(IDS[2], pop !== null && pop.word === 'needs you' && pop.go === true && /^Go to /.test(pop.title || ''), JSON.stringify({ pop, log: sLog.slice(-3) }))
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      } catch (sErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(sErr && sErr.message || sErr) + ' | renderer: ' + (sLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onS)
      }
    }

    // -------------------------------------------------------------------
    // M64 — find.5. A NEW QUERY STARTS AT THE TOP, and a search hit leads
    // with the panel's name. The list kept the previous query's scroll
    // offset, so the best match of the next query sat under the sticky
    // section header (M61's critic, finding 7). The search hit's title used
    // to be the path-and-id label.
    // -------------------------------------------------------------------
    {
      const fLog = []
      const onF = (_e, level, message) => { if (level >= 2) fLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onF)
      const ID = 'find.5 a new palette query scrolls the list to the top, and a search hit row leads with the panel\'s name'
      try {
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
        await settle()
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }))`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__list') !== null`), 2000)
        // A query with many rows first ('a' matches nearly everything), so
        // the list is long enough to scroll; then a second query.
        const scrolled = await wc.executeJavaScript(`(async () => {
          const list = document.querySelector('.palette__list')
          const i0 = document.querySelector('.palette__input')
          const set0 = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          set0.call(i0, 'a'); i0.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          list.scrollTop = list.scrollHeight
          await new Promise((r) => setTimeout(r, 50))
          const before = list.scrollTop
          const i = document.querySelector('.palette__input')
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          set.call(i, 'go'); i.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          const sel = document.querySelector('.palette__row--selected')
          const lb = list.getBoundingClientRect(), sb = sel ? sel.getBoundingClientRect() : null
          return { before, after: list.scrollTop, selectedVisible: sb !== null && sb.top >= lb.top - 1 && sb.bottom <= lb.bottom + 1 }
        })()`)
        // A marker svA (cat) echoes into its log, then a search for it.
        ptyManager.write('svA', 'zzfindmarker\r')
        await sleep(700)
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
        await settle()
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', metaKey: true, bubbles: true }))`)
        await settle()
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'zzfindmarker'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        const hit = await waitUntil(async () => {
          const r = await wc.executeJavaScript(`(() => { const row = [...document.querySelectorAll('.palette__row')].find((r) => (r.getAttribute('data-command-id') || '').startsWith('search.hit.svA')); return row ? { title: row.querySelector('.palette__title').textContent, hint: row.querySelector('.palette__hint').textContent } : null })()`)
          return r || false
        }, 5000)
        // The new query starts at the top and then shows its best match:
        // the list moved back (never kept the old offset) and the selected
        // row is inside the list's visible box.
        ok(ID,
          scrolled.before > 0 && scrolled.after < scrolled.before && scrolled.selectedVisible === true && hit !== false && !/\//.test(hit.title) && !/svA/.test(hit.title) && /zzfindmarker/.test(hit.hint),
          JSON.stringify({ scrolled, hit, log: fLog.slice(-3) }))
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (i) { i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } return true })()`)
      } catch (fErr) {
        ok(ID, false, 'threw: ' + String(fErr && fErr.message || fErr) + ' | renderer: ' + (fLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onF)
      }
    }

    // -------------------------------------------------------------------
    // M65 — sheet.3 / sheet.4. STARTING A PANEL. ⌘⇧N (the menu's event) opens
    // the sheet; a typed command and Enter spawns a LIVE, FOCUSED panel
    // titled with the command whose pill later reads `exited 0` — a task
    // panel, spawned through focus rather than through any "spawn at a
    // stated grid" door (sheet.3). The `where` field's first suggestion is
    // the focused panel's live directory, and a chosen suggestion is the
    // spawned panel's cwd (sheet.4). A directory that is not there is
    // refused in the sheet with a reason, not spawned into.
    // -------------------------------------------------------------------
    {
      const hLog = []
      const onH = (_e, level, message) => { if (level >= 2) hLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onH)
      const IDS = [
        'sheet.3 the sheet spawns a typed command as a live, focused task panel titled with it, whose pill reads exited 0 when it ends',
        'sheet.4 the where field suggests the focused panel\'s live directory first, a chosen suggestion becomes the cwd, and a missing directory is refused in the sheet'
      ]
      try {
        const dirA = mkdtempSync(join(tmpdir(), 'tc panels sheet-a '))
        layoutStore.save({
          panels: fromPanels([{ kind: 'terminal', rect: { id: 'shA', x: 60, y: 60, w: 420, h: 280 }, z: 1, spec: { panelId: 'shA', cwd: dirA, command: '/bin/cat', args: [] } }]),
          groups: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const reH = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reH
        await settle()
        // Wake and focus shA so its live directory is what the sheet offers.
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="shA"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="shA"] .panel__slot') !== null`), 6000)
        await wc.executeJavaScript(`(() => { const s = document.querySelector('.panel[data-panel-id="shA"] .panel__slot'); const r = s.getBoundingClientRect(); s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await settle()
        // ⌘⇧N arrives from the menu as an event.
        win.webContents.send(IPC_EVENTS.SPAWN_OPEN_SHEET)
        const opened = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-spawn-sheet]') !== null`), 4000)
        const steps = []
        const present = async (label) => { steps.push([label, await wc.executeJavaScript(`[document.querySelector('[data-spawn-sheet]') !== null, document.querySelector('.palette') !== null, document.activeElement && document.activeElement.className]`)]) }
        const set = (sel, value) => wc.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false
          const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
          el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true })()`)
        // Focus the field, then let React render the list before reading it.
        await wc.executeJavaScript(`(() => { const w = document.querySelector('[data-sheet-where]'); if (w) w.focus(); return !!w })()`)
        await settle()
        const firstSuggestion = await wc.executeJavaScript(`(() => { const w = document.querySelector('[data-sheet-where]'); if (!w) return null
          const first = document.querySelector('[data-sheet-suggestions] .sheet__suggestion .sheet__suggestion-path'); return { value: w.value, first: first ? first.getAttribute('title') : null, why: first ? first.nextElementSibling?.textContent : null, when: first ? first.nextElementSibling?.hasAttribute('data-sheet-suggestion-when') === true : null } })()`)
        await present('after suggestions')
        // A directory that is not there: refused, in the sheet.
        await set('[data-sheet-what]', '__command__')
        await present('after what')
        await set('[data-sheet-command]', 'echo hello-from-a-task')
        await present('after command')
        await set('[data-sheet-where]', '/definitely/not/a/directory')
        await present('after where')
        await wc.executeJavaScript(`(() => { const w = document.querySelector('[data-sheet-where]'); if (!w) return false; w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        const refused = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-sheet-refusal]')?.textContent ?? false`), 3000)
        // Now the real directory, and spawn.
        const countBefore = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-id]').length`)
        await set('[data-sheet-where]', dirA)
        await wc.executeJavaScript(`(() => { const w = document.querySelector('[data-sheet-where]'); if (!w) return false; w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        const spawned = await waitUntil(() => wc.executeJavaScript(`(() => { const panels = [...document.querySelectorAll('.panel[data-panel-id]')]; if (panels.length !== ${countBefore + 1}) return false
          const p = panels.find((el) => el.querySelector('.pf__title')?.textContent === 'echo hello-from-a-task'); return p ? p.getAttribute('data-panel-id') : false })()`), 6000)
        const live = spawned === false ? false : await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${spawned}"] .panel__slot') !== null`), 6000)
        // Read the cwd NOW, while the task's process is alive — it exits in
        // milliseconds and leaves the PTY list.
        const spawnedCwd = spawned === false ? null : (ptyManager.list().find((s) => s.panelId === spawned) || { cwd: null }).cwd
        const focused = spawned === false ? false : await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${spawned}"]').classList.contains('panel--selected')`)
        const exited = spawned === false ? false : await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${spawned}"] [data-state-word]')?.textContent === 'exited 0'`), 8000)
        const cwdOk = spawnedCwd !== null && (spawnedCwd === dirA || spawnedCwd === realpathSync(dirA))
        ok(IDS[0], opened === true && spawned !== false && live === true && focused === true && exited === true,
          JSON.stringify({ opened, spawned, live, focused, exited, steps, pill: spawned === false ? null : await wc.executeJavaScript(`(document.querySelector('.panel[data-panel-id="${spawned}"] .pf__pill, .panel[data-panel-id="${spawned}"] [data-panel-state]') || {}).textContent ?? null`), state: spawned === false ? null : await wc.executeJavaScript(`(document.querySelector('.panel[data-panel-id="${spawned}"]') || {}).getAttribute?.('data-agent-state') ?? null`), pty: spawned === false ? null : (ptyManager.list().find((s) => s.panelId === spawned) || null), log: hLog.slice(-3) }))
        ok(IDS[1], firstSuggestion !== null && firstSuggestion.first !== null && (firstSuggestion.first === dirA || firstSuggestion.first === realpathSync(dirA)) && (firstSuggestion.why === 'focused panel' || firstSuggestion.when === true /* SpawnSheet.tsx: a recently used directory shows its age in the reason's place */) && typeof refused === 'string' && /no such directory/.test(refused) && cwdOk,
          JSON.stringify({ firstSuggestion, refused, dirA, spawnedCwd }))
      } catch (hErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(hErr && hErr.message || hErr) + ' | renderer: ' + (hLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onH)
      }
    }

    // -------------------------------------------------------------------
    // M66/M257 — labels.3 / labels.4. EVERY CONTROL SAYS WHAT IT IS. The merged
    // view names itself in View while it is on and its lane headers
    // are chrome-sized screen-space elements naming the workspace (labels.3);
    // an attention pip carries a chip naming its panel and the state word
    // (labels.4) — an amber wedge at the canvas edge with no name was M61's
    // finding 21, and lane names at 4px its finding 4.
    // -------------------------------------------------------------------
    {
      const lLog = []
      const onL = (_e, level, message) => { if (level >= 2) lLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onL)
      const IDS = [
        'labels.3 the merged view names itself in View and its lane headers are chrome-sized and name the workspace',
        'labels.4 an off-screen panel that needs you gets a pip with a chip naming it and its state word'
      ]
      try {
        layoutStore.save({
          panels: fromPanels([
            { kind: 'terminal', rect: { id: 'lbA', x: 6000, y: 6000, w: 420, h: 280 }, z: 1, spec: { panelId: 'lbA', cwd: '/tmp', command: '/bin/cat', args: [] }, title: 'far away' },
            { kind: 'terminal', rect: { id: 'lbB', x: 60, y: 60, w: 420, h: 280 }, z: 2, spec: { panelId: 'lbB', cwd: '/tmp', command: '/bin/cat', args: [] }, title: 'bell ringer' }
          ]),
          groups: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const reL = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reL
        await settle()
        // Merged view: the mounted View-menu button, then its pressed label and the headers.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.shell__merge'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        const merged = await wc.executeJavaScript(`(() => {
          const label = document.querySelector('.shell__view-menu .shell__merge')
          const headers = [...document.querySelectorAll('[data-lane-header]')].map((h) => ({ name: h.querySelector('.lane-header__name')?.textContent, size: getComputedStyle(h.querySelector('.lane-header__name')).fontSize, inWorld: h.closest('.world') !== null }))
          return { label: label ? label.textContent.trim() : null, pressed: label?.getAttribute('aria-pressed') ?? null, headers }
        })()`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.shell__merge'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        ok(IDS[0], merged.label === 'Merged view' && merged.pressed === 'true' && merged.headers.length >= 1 && merged.headers.every((h) => typeof h.name === 'string' && h.name.length > 0 && !h.inWorld && parseFloat(h.size) >= 11),
          JSON.stringify({ merged, log: lLog.slice(-3) }))

        // The near panel wakes (a dormant off-screen panel is never spawned,
        // so a far one cannot ring), rings, and THEN the camera leaves it
        // through the palette's Go-to for the far panel — a pip is what an
        // off-screen bell looks like.
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="lbB"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="lbB"] .panel__slot') !== null`), 6000)
        ptyManager.write('lbB', String.fromCharCode(7) + String.fromCharCode(13))
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.rail-row[data-rail-row="lbB"] .rail-row__tail')?.textContent === 'needs you'`), 6000)
        await wc.executeJavaScript(`window.__m56ReducedMotion(true); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }))`)
        await settle()
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'far away'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        await sleep(800)
        const chip = await waitUntil(async () => {
          const c = await wc.executeJavaScript(`(() => { const el = document.querySelector('[data-edge-label="lbB"]'); return el ? { name: el.querySelector('.edge-indicator__name')?.textContent, word: el.querySelector('.edge-indicator__word')?.textContent } : null })()`)
          return c || false
        }, 6000)
        ok(IDS[1], chip !== false && chip.name === 'bell ringer' && chip.word === 'needs you', JSON.stringify({ chip, log: lLog.slice(-3) }))
      } catch (lErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(lErr && lErr.message || lErr) + ' | renderer: ' + (lLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onL)
      }
    }

    // -------------------------------------------------------------------
    // M68 — context.2 / context.3 / context.4. THE CONTEXT PANE FINISHED.
    // Work shows three headings each with a first-arm line for a plain shell
    // in a non-repository (context.2); the Jira panel's no-credential note
    // offers a Connect verb that opens the palette's Credentials scope
    // (context.3); the Files pane names its root panel and the Workspaces
    // pane's merged row toggles the merged view and reads pressed (context.4).
    // -------------------------------------------------------------------
    {
      const cLog = []
      const onC = (_e, level, message) => { if (level >= 2) cLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onC)
      const IDS = [
        'context.2 the Work tab renders Changes, Run and Cost with a first-arm line each for a plain shell outside a repository, and Commands stays absent — an empty section is not actionable',
        'context.3 the Jira panel with no credential offers Connect Jira…, which opens the palette in its Credentials scope',
        'context.4 the Files pane names the panel its root belongs to, and the Workspaces pane\'s merged row toggles the merged view'
      ]
      try {
        const { mkdtempSync } = require('node:fs')
        const plainDir = mkdtempSync(join(tmpdir(), 'tc panels plain-'))
        layoutStore.save({
          panels: fromPanels([
            { kind: 'terminal', rect: { id: 'cxA', x: 60, y: 60, w: 420, h: 280 }, z: 1, spec: { panelId: 'cxA', cwd: plainDir, command: '/bin/cat', args: [] }, title: 'plain shell' },
            { kind: 'jira', rect: { id: 'cxJ', x: 520, y: 60, w: 320, h: 220 }, z: 2 }
          ]),
          groups: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const reC = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reC
        await settle()
        // Wake and select the shell, open the context pane on Work.
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="cxA"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="cxA"] .panel__slot') !== null`), 6000)
        // Spawned, not merely promoted: the Changes query answers "no session
        // yet" for a panel whose PTY has not arrived, and that is a true arm
        // of a different question than this check asks.
        await waitUntil(async () => ptyManager.list().some((s) => s.panelId === 'cxA'), 6000)
        await settle()
        await wc.executeJavaScript(`(() => { const row = document.querySelector('.rail-row[data-rail-row="cxA"] .rail-row__main'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!row })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const open = document.querySelector('.shell__inspector')?.getBoundingClientRect().width > 0; if (!open) document.querySelector('.shell__inspector-toggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const t = document.querySelector('[data-context-tab="work"]'); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!t })()`)
        let work = null
        for (let i = 0; i < 60; i++) {
          work = await wc.executeJavaScript(`(() => { const arm = (k) => document.querySelector('[data-work-arm="' + k + '"]')?.textContent ?? null
            const heads = [...document.querySelectorAll('[data-context-panel="work"] .inspector__section-heading')].map((h) => h.textContent)
            return { heads, changes: arm('changes'), runs: arm('runs'), run: document.querySelector('[data-work-run]')?.textContent ?? null, cost: arm('cost'), heading: document.querySelector('[data-inspector-heading]')?.textContent ?? null, tab: document.querySelector('.context__tab--on')?.textContent ?? null, summary: document.querySelector('[data-review-summary]')?.textContent ?? null } })()`)
          // (this redesign) Commands is now HIDDEN rather than a heading over "no
          // commands yet" — an absent section is not actionable, and #17's
          // brief names this exact pattern — so `work.runs` never resolves;
          // the wait no longer gates on it.
          if (work && work.changes !== null && work.cost !== null) break
          await sleep(100)
        }
        ok(IDS[0], work !== null && work.changes !== null && work.run !== null && work.cost !== null && work.runs === null && JSON.stringify(work.heads) === JSON.stringify(['Changes', 'Run', 'Cost']) && /not a repository/.test(work.changes) && /no agent on this panel/.test(work.cost),
          JSON.stringify({ work, log: cLog.slice(-3) }))

        // The Jira panel: the verb, then the scope it opens.
        const connect = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="cxJ"] [data-jira-connect]'); return b ? b.textContent.trim() : false })()`), 6000)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="cxJ"] [data-jira-connect]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await settle()
        const scope = await wc.executeJavaScript(`(() => ({ open: document.querySelector('.palette') !== null, scope: document.querySelector('.palette__scope')?.textContent ?? null }))()`)
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
        await settle()
        ok(IDS[1], connect === 'Connect Jira…' && scope.open === true && scope.scope === 'Credentials', JSON.stringify({ connect, scope, log: cLog.slice(-3) }))

        // Files names its panel; Workspaces has the door.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="files"]') || document.querySelector('.dock__button[data-navigator="files"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        const files = await wc.executeJavaScript(`(() => ({ root: document.querySelector('.shell__tree-root')?.textContent ?? null, panel: document.querySelector('[data-tree-panel]')?.textContent ?? null }))()`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="workspaces"]') || document.querySelector('.dock__button[data-navigator="workspaces"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        const doorBefore = await wc.executeJavaScript(`document.querySelector('[data-rail-merged] .rail-row__main')?.getAttribute('aria-pressed') ?? null`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-rail-merged] .rail-row__main'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        const doorOn = await wc.executeJavaScript(`(() => ({ pressed: document.querySelector('[data-rail-merged] .rail-row__main')?.getAttribute('aria-pressed') ?? null, merged: document.querySelector('.shell__merge--on') !== null }))()`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-rail-merged] .rail-row__main'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        const doorOff = await wc.executeJavaScript(`document.querySelector('.shell__merge--on') !== null`)
        ok(IDS[2], files.root !== null && files.panel !== null && /plain shell/.test(files.panel) && doorBefore === 'false' && doorOn.pressed === 'true' && doorOn.merged === true && doorOff === false,
          JSON.stringify({ files, doorBefore, doorOn, doorOff, log: cLog.slice(-3) }))
      } catch (cErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(cErr && cErr.message || cErr) + ' | renderer: ' + (cLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onC)
      }
    }

    // M74 — front.1 / front.2. SAME AGENT, TWO FRONT-ENDS, end to end.
    //     front.1: a dormant terminal pinned to a fixture session whose CLI
    //     transcript sits in the harness's fenced store is opened as chat
    //     through the real verb: the chat panel takes its rect and renders the
    //     imported turns (a typed prompt, a tool call, the answer), the
    //     terminal is gone, and a LIVE terminal asked the same is refused by
    //     name with nothing minted. front.2: the chat opened in a terminal
    //     spawns with `--resume <its session id>` and no --session-id, the
    //     terminal's pin EQUALS that id (M17's cost reads the right file), and
    //     the chat is gone.
    {
      const IDS = [
        'front.1 a claude terminal with no live process opens as chat: the imported turns render, the terminal is gone, a live one is refused by name, and the first send resumes the session',
        'front.2 a chat opens in a terminal spawned with --resume its session id and the knobs, the pin follows the resume, and the chat is gone'
      ]
      const fLog = []
      const onF = (_e, _l, m) => { fLog.push(String(m)) }
      wc.on('console-message', onF)
      try {
        const fDir = mkdtempSync(join(tmpdir(), 'tc panels front-'))
        const sessionId = 'front-11111111-2222-4333-8444-555555555555'
        const transcript = [
          JSON.stringify({ type: 'user', isSidechain: false, message: { role: 'user', content: 'What does health.ts export?' } }),
          JSON.stringify({ type: 'assistant', isSidechain: false, message: { id: 'fm1', model: 'claude-x', role: 'assistant', content: [{ type: 'tool_use', id: 'ft1', name: 'Read', input: { file_path: join(fDir, 'health.ts') } }], usage: { input_tokens: 3, output_tokens: 9 } } }),
          JSON.stringify({ type: 'user', isSidechain: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'ft1', content: 'export const ok = () => true', is_error: false }] } }),
          JSON.stringify({ type: 'assistant', isSidechain: false, message: { id: 'fm2', model: 'claude-x', role: 'assistant', content: [{ type: 'text', text: 'front-fixture: it exports ok()' }], usage: { input_tokens: 2, output_tokens: 8 } } })
        ].join('\n') + '\n'
        const transcriptPath = join(fDir, 'session.jsonl')
        writeFileSync(transcriptPath, transcript)
        frontTranscripts.set(sessionId, transcriptPath)
        // A dormant claude terminal, restored from disk, pinned in the store.
        // The composer's gate (`claudeAvailable`) reads the preset rows, so
        // this block seeds its own claude-kind preset over /bin/sh — the chat
        // block's reason — rather than depending on that block's leftovers.
        layoutStore.addPreset({ id: 'front-claude', name: 'Claude (front)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
        flushLayoutStore()
        const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const wsF = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
        const maxZ = wsF.panels.reduce((m, p) => Math.max(m, p.z), 0)
        wsF.panels.push({ id: 'frontT', x: 200, y: 200, w: 500, h: 360, z: maxZ + 1, cwd: fDir, command: 'claude', args: [], agent: 'claude-code', agentOptions: { effort: 'high' }, title: 'front terminal' })
        writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
        layoutStore.load()
        layoutStore.setSession('frontT', sessionId)
        const reF = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reF
        await settle()
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="frontT"]') !== null`), 5000)
        // M170 — agent-card.1. THE AGENT CARD WHEN IT IS A TERMINAL: frontT
        //     (a dormant terminal whose spec names claude) wears the chat's
        //     glyph beside its state dot and the chat's header line (folder ·
        //     engine, from the one builder); the fixture's plain shells wear
        //     neither. (Written beside M170's code — not watched red; the
        //     rail's header.3 was.)
        const agentCard = await wc.executeJavaScript(`(() => {
          const f = document.querySelector('.panel[data-panel-id="frontT"]')
          const shells = [...document.querySelectorAll('.panel[data-panel-kind="terminal"]')].filter((p) => p !== f)
          return { glyph: f ? f.querySelector('[data-agent-glyph]') !== null : null, line: f ? (f.querySelector('[data-agent-header]')?.textContent ?? null) : null,
            shells: shells.length, shellsDressed: shells.filter((p) => p.querySelector('[data-agent-glyph]') || p.querySelector('[data-agent-header]')).length } })()`)
        ok('agent-card.1 a claude terminal wears the chat\'s glyph and the folder · engine header line; a plain shell wears neither',
          agentCard.glyph === true && / · claude$/.test(agentCard.line || '') && agentCard.shells >= 1 && agentCard.shellsDressed === 0,
          JSON.stringify(agentCard))
        // A LIVE terminal is refused by name.
        const liveId = await (async () => {
          const before = new Set(await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
          wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: fDir, command: '/bin/sh', args: ['-c', 'sleep 30'], agent: 'claude-code', w: 400, h: 300 })
          const ids = await waitUntil(async () => { const now = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`); return now.length > before.size ? now : false }, 5000)
          return ids ? (ids.find((id) => !before.has(id)) ?? null) : null
        })()
        if (liveId !== null) await waitUntil(async () => (await sessionMap(wc)).has(liveId), 6000)
        const refusedLive = liveId === null ? null : await wc.executeJavaScript(`window.__m74OpenAsChat(${JSON.stringify(liveId)})`)
        // The refusal opened the palette's text line; close it through the
        // element holding focus (the text mode's own input), then the window.
        for (let i = 0; i < 3; i += 1) {
          await wc.executeJavaScript(`(() => { const t = document.activeElement; if (t) t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return true })()`)
          await settle()
          if (await wc.executeJavaScript(`document.querySelector('.palette') === null`)) break
        }
        const paletteClosed = await wc.executeJavaScript(`document.querySelector('.palette') === null`)
        const panelsBefore = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind="chat"]').length`)
        const opened = await wc.executeJavaScript(`window.__m74OpenAsChat('frontT')`)
        const chatId = await waitUntil(() => wc.executeJavaScript(`(() => { const p = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')].find((el) => el.textContent.includes('front-fixture')); return p ? p.getAttribute('data-panel-id') : false })()`), 6000)
        const terminalGone = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="frontT"]') === null`), 4000)
        const chatRect = chatId ? await wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="${chatId}"]'); return p ? { w: p.style.width, h: p.style.height, title: p.querySelector('.pf__title')?.textContent, tools: p.querySelectorAll('[data-chat-row="tool"]').length, word: p.querySelector('[data-chat-state]')?.textContent } : null })()`) : null
        const chatCount = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind="chat"]').length`)
        // The imported chat's FIRST send resumes the terminal's session: the
        // fake runner's argv says --resume <the pinned id>, never --session-id.
        const chatSpawnsBefore = chatSpawns.length
        const sentIntoImport = chatId ? await waitUntil(() => wc.executeJavaScript(`(() => {
          const ta = document.querySelector('.panel[data-panel-id="${chatId}"] [data-chat-input]'); if (!ta || ta.disabled) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, 'continue'); ta.dispatchEvent(new Event('input', { bubbles: true }))
          const b = document.querySelector('.panel[data-panel-id="${chatId}"] [data-chat-send]'); if (!b || b.disabled) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 5000) : false
        const presetDiag = await wc.executeJavaScript(`window.canvas.preset.list().then((rows) => rows.map((r) => [r.id, r.agent ?? null, r.available]))`)
        const composerDiag = chatId ? await wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="${chatId}"]'); if (!p) return 'no-panel'; const ta = p.querySelector('[data-chat-input]'); const b = p.querySelector('[data-chat-send]'); return { hasInput: !!ta, inputDisabled: ta ? ta.disabled : null, placeholder: ta ? ta.placeholder : null, hasSend: !!b, sendDisabled: b ? b.disabled : null, refusal: p.querySelector('[data-chat-refusal]')?.textContent ?? null, palette: document.querySelector('.palette') !== null } })()`) : null
        const resumed = await waitUntil(async () => chatSpawns.length > chatSpawnsBefore, 4000)
        const resumeArgs = resumed ? chatSpawns[chatSpawns.length - 1].args : null
        const answered = chatId ? await waitUntil(() => wc.executeJavaScript(`${JSON.stringify(chatId)} && document.querySelector('.panel[data-panel-id="${chatId}"] [data-chat-state]')?.textContent === 'idle'`), 8000) : false
        ok(IDS[0],
          liveId !== null && refusedLive && refusedLive.kind === 'refused' && /stop the terminal/.test(refusedLive.reason) &&
            opened && opened.kind === 'opened' && typeof chatId === 'string' && terminalGone === true &&
            chatRect && chatRect.w === '500px' && chatRect.h === '360px' && chatRect.title === 'front terminal' && chatRect.tools === 1 && chatRect.word === 'asleep' &&
            chatCount === panelsBefore + 1 &&
            sentIntoImport === true && resumeArgs !== null && resumeArgs.includes('--resume') && resumeArgs[resumeArgs.indexOf('--resume') + 1] === sessionId && !resumeArgs.includes('--session-id') && answered === true,
          JSON.stringify({ liveId, refusedLive, liveSpec: liveId ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(liveId)})`) : null, livePin: liveId ? layoutStore.session(liveId) : null, opened, chatId, terminalGone, chatRect, chatCount, panelsBefore, paletteClosed, presetDiag, composerDiag, sentIntoImport, resumeArgs, answered, log: fLog.slice(-3) }))

        // front.2. Back to a terminal.
        const ptyBefore2 = ptyManager.list().length
        const back = chatId ? await wc.executeJavaScript(`window.__m74OpenInTerminal(${JSON.stringify(chatId)})`) : null
        const tid = back && back.kind === 'opened' ? back.reason : null
        const spawned = tid ? await waitUntil(async () => (await sessionMap(wc)).has(tid), 8000) : false
        const chatGone = chatId ? await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${chatId}"]') === null`), 4000) : false
        const spec = tid ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(tid)})`) : null
        const pin = tid ? layoutStore.session(tid) : undefined
        const live = tid ? ptyManager.list().find((s) => s.panelId === tid) : undefined
        ok(IDS[1],
          back && back.kind === 'opened' && spawned === true && chatGone === true &&
            spec && spec.spec.args.includes('--resume') && spec.spec.args[spec.spec.args.indexOf('--resume') + 1] === sessionId && spec.spec.agent === 'claude-code' && spec.spec.command === 'claude' &&
            pin === sessionId && live !== undefined && ptyManager.list().length === ptyBefore2 + 1 &&
            spec.spec.agentOptions && spec.spec.agentOptions.effort === 'high',
          JSON.stringify({ back, spawned, chatGone, args: spec && spec.spec.args, knobs: spec && spec.spec.agentOptions, pin: pin ?? null, live: live ?? null, ptyBefore2, ptyNow: ptyManager.list().length, spec: spec && spec.spec, log: fLog.slice(-3) }))
        if (tid) await clickPanelClose(wc, tid)
        if (liveId) await clickPanelClose(wc, liveId)
        await settle()
        try { rmSync(fDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (fErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(fErr && fErr.message || fErr) + ' | renderer: ' + (fLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onF)
      }
    }

    // -------------------------------------------------------------------
    // M69 — overview.1 / overview.2. THE FAR VIEW FOR EVERY KIND, AND THE
    // MINIMAP. Below BLOCK_ENTER a sessionless kind's frame is a block in the
    // kind tone with its title; below SUMMARY_ENTER a summary with the kind's
    // word (overview.1). The minimap draws one block per panel in its tone, a
    // click flies the camera to the clicked world point, and `canvas.minimap`
    // off removes it (overview.2).
    // -------------------------------------------------------------------
    {
      const oLog = []
      const onO = (_e, level, message) => { if (level >= 2) oLog.push(String(message).slice(0, 180)) }
      wc.on('console-message', onO)
      const IDS = [
        'overview.1 below BLOCK_ENTER every sessionless kind is a block in the kind tone with its title, and below SUMMARY_ENTER a summary with the kind word',
        'overview.2 the minimap draws one block per panel in its tone, a click flies the camera to that world point, and canvas.minimap off removes it'
      ]
      try {
        const { mkdtempSync, writeFileSync } = require('node:fs')
        const oDir = mkdtempSync(join(tmpdir(), 'tc panels overview-'))
        writeFileSync(join(oDir, 'note.txt'), 'hello\n')
        writeFileSync(join(oDir, 'plan.md'), '# plan\n')
        layoutStore.save({
          panels: fromPanels([
            { kind: 'terminal', rect: { id: 'ovA', x: 60, y: 60, w: 420, h: 280 }, z: 1, spec: { panelId: 'ovA', cwd: oDir, command: '/bin/cat', args: [] }, title: 'ringer' },
            { kind: 'file', rect: { id: 'ovF', x: 540, y: 60, w: 300, h: 200 }, z: 2, source: { path: join(oDir, 'note.txt') } },
            { kind: 'toolbox', rect: { id: 'ovT', x: 900, y: 60, w: 300, h: 200 }, z: 3, source: { cwd: oDir, label: 'overview' } },
            { kind: 'jira', rect: { id: 'ovJ', x: 60, y: 400, w: 300, h: 200 }, z: 4 },
            { kind: 'file', rect: { id: 'ovN', x: 400, y: 400, w: 300, h: 200 }, z: 6, source: { path: join(oDir, 'plan.md'), prose: true } },
            { kind: 'terminal', rect: { id: 'ovB', x: 3000, y: 1800, w: 420, h: 280 }, z: 5, spec: { panelId: 'ovB', cwd: oDir, command: '/bin/cat', args: [] }, title: 'far' }
          ]),
          groups: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const reO = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reO
        await settle()
        await wc.executeJavaScript(`window.__m56ReducedMotion(true)`)
        const cmd = (key) => wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, metaKey: true, bubbles: true }))`)
        const scale = () => wc.executeJavaScript(`window.__m4aViewport().scale`)
        const zoomBelow = async (target) => { for (let i = 0; i < 80; i += 1) { if ((await scale()) < target) return true; await cmd('-'); await sleep(20) } return false }
        const readFar = () => wc.executeJavaScript(`(() => { const out = {}
          for (const id of ['ovF', 'ovT', 'ovJ', 'ovN']) { const p = document.querySelector('.panel[data-panel-id="' + id + '"]')
            out[id] = p ? { block: p.querySelector('[data-card-block]')?.getAttribute('data-tone') ?? null, blockTitle: p.querySelector('[data-card-block] .panel__card-block-title')?.textContent ?? null, summary: p.querySelector('[data-card-summary] .panel__card-summary-state')?.textContent ?? null } : null }
          return out })()`)
        const atSummary = await zoomBelow(0.24); await settle()
        const summary = await readFar()
        // MIN_SCALE is 0.1; block band is 0.16–0.20; cluster is below 0.12.
        const atBlock = await zoomBelow(0.155); await settle()
        const block = await readFar()
        await cmd('0'); await settle()
        const words = { ovF: 'file', ovT: 'toolbox', ovJ: 'Jira', ovN: 'note' }
        ok(IDS[0], atSummary && atBlock &&
          ['ovF', 'ovT', 'ovJ', 'ovN'].every((id) => summary[id] && summary[id].summary === words[id] && summary[id].block === null) &&
          ['ovF', 'ovT', 'ovJ', 'ovN'].every((id) => block[id] && block[id].block === 'kind' && typeof block[id].blockTitle === 'string' && block[id].blockTitle.length > 0),
          JSON.stringify({ atSummary, atBlock, summary, block, log: oLog.slice(-3) }))

        // The minimap: five blocks, the ringer's turning amber, a click that lands.
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="ovA"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await waitUntil(async () => ptyManager.list().some((s) => s.panelId === 'ovA'), 6000)
        // Focus elsewhere (the file panel's body), then ring.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="ovF"] .pf__body'); if (b) { const r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + 10, clientY: r.top + 10 })) } return !!b })()`)
        await settle()
        ptyManager.write('ovA', String.fromCharCode(7) + String.fromCharCode(13))
        const amber = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-minimap-block="ovA"]')?.getAttribute('data-tone') === 'needs-you'`), 6000)
        const blocks = await wc.executeJavaScript(`[...document.querySelectorAll('[data-minimap-block]')].map((b) => [b.getAttribute('data-minimap-block'), b.getAttribute('data-tone')])`)
        // Click the far panel's block: the camera's centre lands near it.
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-minimap-block="ovB"]'); if (!b) return false; const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2
          const m = document.querySelector('[data-minimap]'); m.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: x, clientY: y })); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: x, clientY: y })); return true })()`)
        await sleep(600)
        const after = await wc.executeJavaScript(`(() => { const v = window.__m4aViewport(); const host = document.querySelector('.canvas').getBoundingClientRect()
          return { v, centre: { x: (host.width / 2 - v.x) / v.scale, y: (host.height / 2 - v.y) / v.scale } } })()`)
        const nearFar = Math.abs(after.centre.x - 3210) < 120 && Math.abs(after.centre.y - 1940) < 120 && after.v.scale === before.scale
        await wc.executeJavaScript(`window.canvas.settings.set('canvas.minimap', false)`)
        await settle()
        const gone = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-minimap]') === null`), 4000)
        await wc.executeJavaScript(`window.canvas.settings.set('canvas.minimap', true)`)
        await settle()
        const tones = Object.fromEntries(blocks)
        const tonesRight = tones.ovA === 'needs-you' && tones.ovF === 'kind' && tones.ovT === 'kind' && tones.ovJ === 'kind' && tones.ovN === 'kind' && tones.ovB === 'asleep'
        ok(IDS[1], amber === true && blocks.length === 6 && tonesRight && nearFar && gone === true,
          JSON.stringify({ amber, blocks, before, after, nearFar, gone, log: oLog.slice(-3) }))
      } catch (oErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(oErr && oErr.message || oErr) + ' | renderer: ' + (oLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onO)
      }
    }

  }
})
