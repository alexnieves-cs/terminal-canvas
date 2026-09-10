/* verify:panels:product — one of the five parts of the old scripts/verify-panels.cjs (M135).
   Run with: npm run build && npm run verify:panels:product
   The harness (scripts/panels-harness.cjs) boots the renderer; this file holds the
   checks the old file held at lines 17398–19778, moved verbatim, ids unchanged. */
const { runPanelsSuite } = require('./panels-harness.cjs')

const WATCHDOG_MS = 230000 // measured 2026-09-10 after M203/M204 (D08) added task.show.1, task.related.1, task.far.1 and task.arrange.1 (a real linked worktree, two reloads, a far-zoom walk): 167.5 s green, 88% of the old 190000 and so two points under headroom.1's 90% line. Headroom above 1.35x on purpose — a watchdog kill reads as a HANG and not as a red check (M135). Was 190000 against 125 s after M202. Re-measure when a milestone adds checks

runPanelsSuite('product', WATCHDOG_MS, async (ctx) => {
  const { harnessAttachmentsDir, harnessStarterDir, prepareStarter, STARTER_OBJECTS, AgentSessionManager, BOOT_DEFAULT_PRESET, BrowserWindow, CASCADE_STEP, DEFAULT_CAMERA, ECHO_PRESET, ENTRY_OUT, FILE_MAX_LINES, FileWatchers, IPC, IPC_EVENTS, LAYOUT_PATH, LIVE_AT_BOOT, NEVER_RENDERED_PANEL_ID, NEVER_RENDERED_WORKSPACE_ID, NEVER_WOKEN_ID, PANELS_SOCKET, PLUGIN_DETAILS_TEXT, PLUGIN_DIR, PLUGIN_ID, PROJECT_DIR, PROJECT_PROMPT_BODY, PROJECT_PROMPT_NAME, PROMPT_DIRS, PtyManager, RENAMABLE_PRESET, REVIEW_FENCES, SEEDED_PROMPT, SEED_PANELS, ToolboxCache, WORKTREES_DIR, activeWorkspaceId, agentHandlers, agentSessions, agentTranscripts, allPresets, allTemplates, app, appendFileSync, approvalTracker, attachPtyLifecycle, backgroundPoint, baselineCapture, bootDefault, brokerAuditForChecks, buildSync, buildTmuxConf, cardCount, cardTexts, chatFixture, chatRunner, chatSpawns, clickEmptyCanvas, clickPanelAt, clickPanelBody, clickPanelClose, clickRail, closeSync, commitIndexDir, commitIndexSeq, createAgentTranscriptLog, createApprovalTracker, createBaselineCapture, createBoardLane, createBrokerAudit, createBrowserHandlers, createControlHandler, createControlServer, createDirectBackend, createExporters, createGitRunner, createLayoutSnapshots, createLayoutStore, createMemoryStore, createPlacesGate, createReviewCommitter, createReviewDiscarder, createReviewEngine, createRunLedger, createScrollbackLog, createTmuxBackend, createWatchRunner, createWorktreeManager, credentialDir, credentialStore, dockTo, execFileSync, existsSync, expandTilde, fencedGitRunner, findTmux, flushLayoutStore, fromPanels, frontTranscripts, gitPath, gridState, harnessCredentialDir, harnessGrants, importClaudeTranscript, ipcMain, isBuiltInTemplate, join, killedPanelIds, knownUsageSessionIds, lastPanelCentreInWorld, layoutSnapshots, layoutStore, linkOpens, listGithubWorkItems, listSessions, liveCount, loginEnv, memoryDir, memoryStore, mergePrompts, mkdirSync, mkdtempSync, nodeBox, nodeCount, ok, openSync, panelCount, parseLayout, parseShelf, pidsPreserved, presetFromCapture, presetRows, pressArrow, pressChord, pressPlain, ptyManager, pushDefaultPreset, railAgentState, railPan, readFileSync, readFrom, readProjectPrompts, readSync, readVault, readdirSync, realGitRunner, realIpcMainHandle, realpathSync, registerIpcHandlers, registeredHandlers, releaseMeta, renameSync, requestFromRenderer, resolveAttachment, resolveAvailability, resolveCwd, resolveShellEnv, resolveSpawnRequest, restoreFromSnapshot, results, reviewCommit, reviewEngine, rmSync, runLedger, scrollbackLog, sessionMap, settle, settledSessionMap, skillTrashCalls, skillWriteHandlers, sleep, snapshotDir, statSync, templateOf, tmpdir, toolboxCache, trailFor, unlinkSync, usageFixtureDir, usageFixtureFile, verifySocket, viewCentreInWorld, waitUntil, watchDirWatchers, watchFileWatchers, watchRunner, watchTimers, watcherHandlers, wc, webContents, whichFromEnv, whichHere, win, worktreeManager, writeFileSync, zoomTo, state } = ctx
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
  // check the M52 OSC 133 block's `createDirectBackend` (agents) had made the DIRECT backend current, so that is what is current.
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
    // M194. Selection is inspection, not execution. Real IPC readers with
    // deliberately held replies expose both stale rendering and A→B→A reuse.
    await settle(); flushLayoutStore()
    // current() is the store's live object; a saved reference mutates under
    // save() and would restore THIS fixture into all the later checks.
    const snapshot = JSON.parse(JSON.stringify(layoutStore.current()))
    const preferences = layoutStore.preferences()
    const saved = snapshot.workspaces.find((w) => w.id === snapshot.activeWorkspaceId)
    const dir = mkdtempSync(join(tmpdir(), 'tc selected context '))
    const a = join(dir, 'A'), b = join(dir, 'B'), missing = join(dir, 'missing')
    for (const [cwd, name] of [[a, 'context-alpha'], [b, 'context-beta']]) {
      mkdirSync(join(cwd, '.claude', 'commands'), { recursive: true })
      writeFileSync(join(cwd, '.claude', 'commands', name + '.md'), 'A fixture command.\n')
      writeFileSync(join(cwd, name + '.txt'), 'A fixture file.\n')
    }
    const original = new Map([IPC.FS_LIST, IPC.TOOLBOX_READ].map((c) => [c, registeredHandlers.get(c)]))
    const held = []
    let hold = false
    let refuse = false
    const install = () => {
      for (const [channel, handler] of original) {
        ipcMain.removeHandler(channel)
        ipcMain.handle(channel, (event, request) => {
          const cwd = channel === IPC.FS_LIST ? request : request.cwd
          if (refuse && cwd === a) throw new Error('Fixture inspection read failed')
          if (hold && (cwd === a || cwd === b)) return new Promise((resolve) => held.push({ channel, cwd, resolve, run: () => handler(event, request) }))
          return handler(event, request)
        })
      }
    }
    const reload = async () => { const ready = new Promise((r) => wc.once('did-finish-load', r)); wc.reload(); await ready; await settle() }
    const select = async (id) => {
      await dockTo('panels')
      await clickRail(`[data-rail-row="${id}"] .rail-row__main`)
      await dockTo('files')
      await settle()
    }
    const read = () => wc.executeJavaScript(`({ root: document.querySelector('.shell__tree-root')?.title,
      files: document.querySelector('[data-file-tree]')?.textContent ?? '',
      tools: document.querySelector('[data-context-panel="tools"]')?.textContent ?? '',
      rows: [...document.querySelectorAll('[data-context-panel="tools"] [data-toolbox-row]')].map((n) => n.getAttribute('data-toolbox-row')) })`)
    try {
      install()
      const chat = (id, cwd, extra = {}) => ({ id, kind: 'chat', x: 40, y: 40, w: 480, h: 360, z: 1,
        title: id, chat: { cwd, sessionId: '00000000-0000-4000-8000-' + id.slice(-1).charCodeAt(0).toString().padStart(12, '0'), ...extra } })
      layoutStore.save({ panels: [chat('ctxA', a), chat('ctxB', b), chat('ctxS', a, { sandbox: true }), chat('ctxM', missing),
        { id: 'ctxF', kind: 'file', x: 40, y: 440, w: 480, h: 300, z: 1, source: { path: join(a, 'context-alpha.txt') } },
        { id: 'ctxT', x: 560, y: 40, w: 440, h: 300, z: 2, cwd: b, command: '/bin/cat', args: ['-v'], title: 'context paste target' }],
        camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore(); await reload()
      const lifecycle = () => ({ chat: chatSpawns.length, sessions: agentSessions.list().map((s) => s.id).sort(), pty: ptyManager.list().map((p) => p.id).sort(), killed: killedPanelIds.length })
      // `useChatSessions` fires agent:create for every chat on MOUNT. Taken a
      // fixed sleep after the reload, `before` could miss one and this check
      // would go red for a reason that has nothing to do with inspection.
      await waitUntil(() => agentSessions.list().filter((s) => s.id.startsWith('ctx')).length >= 3, 3000)
      const before = lifecycle()
      await select('ctxA')
      const alpha = await waitUntil(async () => { const v = await read(); return v.rows.includes('context-alpha') && v.files.includes('context-alpha.txt') ? v : false }, 2000)
      ok('context.chat.1 selected repository chat supplies Files and Tools without a terminal proxy', alpha && alpha.root === a, JSON.stringify(alpha))

      hold = true
      await select('ctxB')
      const pendingB = await read()
      // Counted, never a literal. One selection issues one read per CONSUMER —
      // the tree, the Skills pane and the inspector — and a hard `2` here
      // resolved the Skills pane's obsolete reply instead of the inspector's,
      // leaving the inspector's held and its half of this check true by
      // construction. M194 added the third consumer, which is how that was
      // found; a fourth would break the literal the same silent way.
      const perSelection = held.length
      await select('ctxA')
      await select('ctxB')
      const obsolete = held.splice(0, perSelection)
      for (const reply of obsolete) reply.resolve(reply.channel === IPC.FS_LIST
        ? { kind: 'ok', entries: [{ name: 'obsolete-context.txt', kind: 'file' }], truncated: 0 }
        : await reply.run())
      await settle()
      const afterLate = await read()
      ok('context.chat.2 subject changes clear rows immediately and obsolete same-directory replies stay ignored',
        pendingB.rows.length === 0 && !pendingB.files.includes('context-alpha.txt') &&
        afterLate.rows.length === 0 && !afterLate.files.includes('obsolete-context.txt') && /reading/.test(afterLate.files) &&
        perSelection === 3 && obsolete.length === 3,
        JSON.stringify({ pendingB, afterLate, perSelection, held: held.length }))
      hold = false
      for (const reply of held.splice(0)) reply.resolve(await reply.run())
      await settle()
      const beta = await read()
      ok('context.chat.3 current replies land after older selection replies', beta.rows.includes('context-beta') && beta.files.includes('context-beta.txt') && !beta.rows.includes('context-alpha'), JSON.stringify(beta))

      refuse = true
      await select('ctxA'); const failedRead = await read()
      refuse = false
      await select('ctxB'); await select('ctxA'); const retried = await read()
      ok('context.chat.8 a rejected read says it did not answer — never `no directory`, never a silent empty inventory — and changing selection back retries it',
        /did not answer/.test(failedRead.files) && /did not answer/.test(failedRead.tools) &&
        !/no directory/.test(failedRead.files) && !/no directory/.test(failedRead.tools) && failedRead.rows.length === 0 &&
        retried.files.includes('context-alpha.txt') && retried.rows.includes('context-alpha'), JSON.stringify({ failedRead, retried }))

      await select('ctxS'); const sandbox = await read()
      await select('ctxF'); const file = await read()
      await select('ctxM'); const gone = await read()
      ok('context.chat.4 sandbox, non-directory object and unavailable directory stay distinct, and the object with none is NAMED rather than described generically',
        /sandbox/i.test(sandbox.files) && /sandbox/i.test(sandbox.tools) && sandbox.rows.length === 0 &&
        // M48 §5, restored: the pane names the PANEL it is empty about. The
        // policy answers `no-directory` with no sentence precisely so this
        // one — which knows the panel's own label — is the one that renders.
        /no directory/.test(file.files) && file.files.includes('ctxF') && /no directory/.test(file.tools) &&
        /gone/i.test(gone.files) && /no longer there/i.test(gone.tools) &&
        // The three silences are three sentences, not one worn three times.
        new Set([sandbox.tools, file.tools, gone.tools]).size === 3,
        JSON.stringify({ sandbox, file, gone }))
      const after = lifecycle()
      ok('context.chat.5 inspecting subjects changes no execution lifecycle', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }))

      await dockTo('panels')
      await clickRail('[data-rail-row="ctxT"] .rail-row__start')
      const terminalReady = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="ctxT"] .xterm') !== null`), 4000)
      if (terminalReady) { wc.focus(); await clickPanelBody('.panel[data-panel-id="ctxT"] .panel__slot') }
      await select('ctxA')
      const focusedBefore = await wc.executeJavaScript('window.__m4aFocusedId()')
      const path = join(a, 'context-alpha.txt')
      const point = await wc.executeJavaScript(`(() => { const n = document.querySelector('[data-file-path=' + ${JSON.stringify(JSON.stringify(path))} + ']'); if (!n) return null; const r = n.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); return n.contains(document.elementFromPoint(x, y)) ? { x, y } : null })()`)
      if (point) {
        wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
      }
      const pasted = await waitUntil(async () => (await scrollbackLog.tail('ctxT', 20)).join('\n').includes("'" + path + "'"), 2000)
      const focusedAfter = await wc.executeJavaScript('window.__m4aFocusedId()')
      ok('context.chat.7 a real file click with chat selected preserves terminal focus and pastes the absolute shell-quoted path',
        focusedBefore === 'ctxT' && focusedAfter === 'ctxT' && point !== null && pasted === true,
        JSON.stringify({ focusedBefore, focusedAfter, point, pasted }))
      // M194. The same gesture with NO terminal in the picture — D02's own
      // acceptance sentence. Before the chat arm this was a control that did
      // nothing: `registry.get(<chat id>)` is undefined, so the paste was
      // `undefined?.handle.paste` and every row in the pane was inert with
      // nothing on screen saying why.
      await dockTo('panels')
      await clickRail('[data-rail-row="ctxA"] .rail-row__main')
      // A REAL click on the chat's body — `.chat__body`'s own mousedown is
      // what calls onFocusPanel, so this is the gesture a person makes.
      wc.focus(); await clickPanelBody('.panel[data-panel-id="ctxA"] .chat__body')
      await dockTo('files')
      await settle()
      const chatFocused = await wc.executeJavaScript('window.__m4aFocusedId()')
      const chatPoint = await wc.executeJavaScript(`(() => { const n = document.querySelector('[data-file-path=' + ${JSON.stringify(JSON.stringify(path))} + ']'); if (!n) return null; const r = n.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); return n.contains(document.elementFromPoint(x, y)) ? { x, y } : null })()`)
      if (chatPoint) {
        wc.sendInputEvent({ type: 'mouseDown', ...chatPoint, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', ...chatPoint, button: 'left', clickCount: 1 })
      }
      const composed = await waitUntil(() => wc.executeJavaScript(`(document.querySelector('.panel[data-panel-id="ctxA"] [data-chat-input]')?.value ?? '')`).then((v) => v.includes('@context-alpha.txt') ? v : false), 2000)
      ok('context.chat.9 a file click with a CHAT focused and no terminal anywhere reaches its composer as an @ reference — never a control that silently does nothing',
        chatFocused === 'ctxA' && chatPoint !== null && composed !== false,
        JSON.stringify({ chatFocused, chatPoint, composed }))

      await select('ctxA')
      await clickRail('[data-context-tab="tools"]')
      await clickRail('[data-context-panel="tools"] [data-toolbox-open]')
      const opened = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-kind="toolbox"]'); return p?.querySelector('[data-toolbox-directory]')?.title === ${JSON.stringify(a)} && p.querySelector('[data-toolbox-row="context-alpha"]') !== null })()`), 2000)
      ok('context.chat.6 Open toolbox from the selected chat reaches its directory inventory', opened === true, String(opened))
    } finally {
      // ORDER IS THE POINT. An `executeJavaScript` inside the block can reject,
      // and then this runs with the wrapper handlers still installed. The two
      // steps that would poison every later check in this part — the swapped
      // IPC handlers and the fixture workspace — go FIRST and touch nothing
      // that can throw, and every awaited step after them is guarded on its
      // own. An earlier version emptied `held` by re-running the real handler
      // first: one rejection there lost the remaining entries, left the
      // renderer's promises pending for ever, and skipped the restore
      // entirely.
      hold = false
      refuse = false
      for (const [channel, handler] of original) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler) }
      for (const key of ['shell.navigator', 'files.treeOpen', 'shell.contextTab', 'shell.railOpen', 'shell.inspectorOpen']) {
        if (key in preferences) layoutStore.setPreference(key, preferences[key])
        else layoutStore.clearPreference(key)
      }
      // A static answer, never `run()`: this only has to let the renderer's
      // pending promises settle, and re-reading the real filesystem here is
      // one more thing that can reject on the path where something already has.
      for (const reply of held.splice(0)) reply.resolve(reply.channel === IPC.FS_LIST ? { kind: 'gone' } : { kind: 'no-cwd' })
      try { await clickPanelClose(wc, 'ctxT') } catch { /* the panel may never have opened */ }
      layoutStore.save(saved); flushLayoutStore()
      try { await reload() } catch { /* the restore is on disk either way */ }
      for (const id of ['ctxA', 'ctxB', 'ctxS', 'ctxM']) agentSessions.dispose(id)
      rmSync(dir, { recursive: true, force: true })
    }
  }

  {
    // M180. A beginner reaches a real composer by the visible primary door,
    // then types a sentence and presses Send. No test hook mints the chat.
    // The CLI report and availability preset are fixtures, the runtime is
    // the harness's real manager, and its fake runner records the user line.
    const id = 'onboarding.start.1 the first-launch primary opens a conversation and a typed message receives the recorded reply without a terminal'
    const savedReport = state.harnessEnvReport
    await settle()
    flushLayoutStore()
    const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    const savedWorkspace = disk.workspaces.find((w) => w.id === disk.activeWorkspaceId) || disk.workspaces[0]
    let openedId = null
    const reload = async () => {
      const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await loaded; await settle()
    }
    // Real input plus a hit-test: an off-screen/covered button is not a door.
    const clickVisible = async (selector) => {
      const point = await wc.executeJavaScript(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)}); if (!node || node.disabled) return null
        const r = node.getBoundingClientRect(), x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
        return node.contains(document.elementFromPoint(x, y)) ? { x, y } : null
      })()`)
      if (!point) return false
      wc.focus()
      wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
      return true
    }
    // M181. The renderer's own words while the journey runs: a thrown render
    // (a blank canvas) explains itself here rather than as `openedId: false`.
    const journeyLog = []
    const onJourney = (_e, _level, message) => { journeyLog.push(String(message).slice(0, 200)) }
    wc.on('console-message', onJourney)
    try {
      state.harnessEnvReport = { ...savedReport, clis: [
        { name: 'claude', path: '/fake/claude' }, { name: 'codex', path: null }, { name: 'git', path: '/usr/bin/git' }
      ] }
      layoutStore.addPreset({ id: 'onboarding-claude', name: 'Claude (first-launch fixture)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
      layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore()
      await reload()
      const primary = await waitUntil(() => wc.executeJavaScript(`(() => {
        const b = document.querySelector('[data-onboarding-start]')
        return b && !b.disabled && b.textContent.includes('Start a conversation') ? true : false
      })()`), 1500)
      const before = { spawns: chatSpawns.length, ptys: ptyManager.list().length }
      const started = primary === true && await clickVisible('[data-onboarding-start]')
      // M181. 8 s, not 4: the primary now lays the starter out too, and one run
      // under a slow `browser.1` saw the chat land after the four-second mark.
      if (started) openedId = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-kind="chat"]')?.getAttribute('data-panel-id') ?? false`), 8000)
      let typed = false
      let sent = false
      let reply = false
      let noTerminal = false
      if (typeof openedId === 'string') {
        const panelSelector = `.panel[data-panel-id="${openedId}"]`
        const inputSelector = `${panelSelector} [data-chat-input]`
        await waitUntil(() => wc.executeJavaScript(`document.querySelector(${JSON.stringify(inputSelector)})?.disabled === false`), 3000)
        typed = await clickVisible(inputSelector)
        if (typed) {
          // M181. The click is queued native input; insertText lands in the
          // element that is focused WHEN IT RUNS. Wait for the composer to hold
          // focus (a real condition, not a delay) — under the starter's render
          // burst the text went nowhere one run in three and Send stayed disabled.
          typed = await waitUntil(() => wc.executeJavaScript(`document.activeElement === document.querySelector(${JSON.stringify(inputSelector)})`), 3000)
          await wc.insertText('Reply with exactly the word: pong')
          await waitUntil(() => wc.executeJavaScript(`document.querySelector(${JSON.stringify(panelSelector + ' [data-chat-send]')})?.disabled === false`), 2000)
          // M181. What the Send click would land on, recorded before it: a
          // `sent: false` alone says nothing about a covering element.
          journeyLog.push(await wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(panelSelector + ' [data-chat-send]')}); if (!b) return 'no send'; const r = b.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); const e = document.elementFromPoint(x, y); const i = document.querySelector(${JSON.stringify(inputSelector)}); return 'send ' + JSON.stringify({ disabled: b.disabled, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], under: e ? e.tagName + '.' + String(e.className).slice(0, 60) : null, value: i ? String(i.value).slice(0, 40) : null, active: document.activeElement ? document.activeElement.tagName + '.' + String(document.activeElement.className).slice(0, 40) : null }) })()`))
          sent = await clickVisible(panelSelector + ' [data-chat-send]')
        }
        if (sent) reply = await waitUntil(() => wc.executeJavaScript(`(() => {
          const text = [...document.querySelectorAll(${JSON.stringify(panelSelector + ' [data-chat-assistant-text]')})].map((n) => n.textContent).join(' ')
          return text.includes('pong') ? text : false
        })()`), 5000)
        // M181. The first run lays the starter out too, and its terminal EXAMPLE is a
        // dormant card: the property is that no LIVE terminal was needed to converse.
        noTerminal = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length === 0 && document.querySelectorAll('.panel[data-panel-kind="terminal"] .xterm').length === 0`)
      }
      const spawn = chatSpawns[before.spawns]
      const userLine = spawn?.proc.stdin.some((line) => {
        try { const value = JSON.parse(line); return value.type === 'user' && JSON.stringify(value.message).includes('Reply with exactly the word: pong') } catch { return false }
      }) === true
      ok(id, primary === true && started && typed && sent && typeof reply === 'string' && userLine &&
        noTerminal && ptyManager.list().length === before.ptys && chatSpawns.length === before.spawns + 1,
      JSON.stringify({ primary, started, openedId, typed, sent, reply, userLine, noTerminal, spawns: [before.spawns, chatSpawns.length], renderer: journeyLog.slice(-6) }))
      const agentId = 'onboarding.agent.1 the agent plan bridge returns readiness through main, preload and the renderer, and refuses a close needing human confirmation with the conversation kept'
      try {
        // The envelope main sends: the line and the resolved caller (absent here — a person's own shell).
        const readinessReply = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: 'check-readiness' }, null, 3000)
        const closeReply = typeof openedId === 'string'
          ? await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: 'close ' + openedId }, null, 3000)
          : null
        const kept = typeof openedId === 'string' && await wc.executeJavaScript(`document.querySelector(${JSON.stringify('.panel[data-panel-id="' + openedId + '"]')}) !== null`)
        ok(agentId, readinessReply?.kind === 'ran' && /installed/.test(readinessReply.summary) && /sign-in/.test(readinessReply.summary) &&
          closeReply?.kind === 'refused' && /human confirmation/.test(closeReply.reason) && kept === true,
        JSON.stringify({ readinessReply, closeReply, openedId, kept }))
      } catch (error) {
        ok(agentId, false, String(error && error.message || error))
      }
    } catch (error) {
      ok(id, false, String(error && error.message || error))
    } finally {
      wc.removeListener('console-message', onJourney)
      if (typeof openedId === 'string') await clickPanelClose(wc, openedId)
      await settle()
      state.harnessEnvReport = savedReport
      layoutStore.deletePreset('onboarding-claude')
      layoutStore.save(savedWorkspace)
      flushLayoutStore()
      await reload()
    }
  }

  {
    // M181 — starter.1. THE STARTER CANVAS through the visible primary on a
    // first run: the conversation AND one captioned example of each kind
    // (a dormant terminal, a note, a workflow, an image) in a named group,
    // NOTHING spawned (no PTY, no chat process), the record on disk, and a
    // second application refused by name through the agent door. The
    // examples are minted through the ordinary paths — a check that found
    // five panels but a spawned shell would be the fleet the brief forbids.
    const id = 'starter.1 the first-launch primary lays the starter canvas around the conversation — four captioned examples in a named group, nothing spawned, the record on disk, a second application refused by name'
    const savedReport = state.harnessEnvReport
    await settle()
    flushLayoutStore()
    const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    const savedWorkspace = disk.workspaces.find((w) => w.id === disk.activeWorkspaceId) || disk.workspaces[0]
    let chatId = null
    const reload = async () => { const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await loaded; await settle() }
    const clickVisible = async (selector) => {
      const point = await wc.executeJavaScript(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node || node.disabled) return null; const r = node.getBoundingClientRect(), x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); return node.contains(document.elementFromPoint(x, y)) ? { x, y } : null })()`)
      if (!point) return false
      wc.focus(); wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
      return true
    }
    try {
      state.harnessEnvReport = { ...savedReport, clis: [{ name: 'claude', path: '/fake/claude' }, { name: 'codex', path: null }, { name: 'git', path: '/usr/bin/git' }] }
      layoutStore.addPreset({ id: 'starter-claude', name: 'Claude (starter fixture)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
      // A first run: no panels and NO starter record on the workspace.
      layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore()
      await reload()
      const before = { spawns: chatSpawns.length, ptys: ptyManager.list().length }
      const primary = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-onboarding-start]'); return b && !b.disabled ? b.getAttribute('data-onboarding-starter') === 'first-run' : false })()`), 1500)
      const started = primary === true && await clickVisible('[data-onboarding-start]')
      const kinds = started ? await waitUntil(() => wc.executeJavaScript(`(() => { const k = [...document.querySelectorAll('.panel[data-panel-kind]')].map((p) => p.getAttribute('data-panel-kind')).sort(); return k.length >= 5 ? k.join(',') : false })()`), 6000) : false
      chatId = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-kind="chat"]')?.getAttribute('data-panel-id') ?? null`)
      const captions = await waitUntil(() => wc.executeJavaScript(`(() => { const t = [...document.querySelectorAll('[data-annotation][data-annotation-kind="panel"] [data-annotation-label]')].map((n) => n.textContent).sort(); return t.length >= 4 ? t : false })()`), 3000)
      const expected = STARTER_OBJECTS.map((o) => o.caption).sort()
      const group = await wc.executeJavaScript(`(() => { const g = document.querySelector('[data-group-id]'); return g ? g.textContent : null })()`)
      // Geometry, not just presence: no example may overlap the conversation
      // (the M181 critic — a column placed from a guessed origin covered the composer).
      const overlap = await wc.executeJavaScript(`(() => { const rect = (el) => el.getBoundingClientRect(); const chat = document.querySelector('.panel[data-panel-kind="chat"]'); if (!chat) return 'no chat'; const c = rect(chat); const hits = [...document.querySelectorAll('.panel[data-panel-kind]')].filter((p) => p !== chat).map(rect).filter((r) => r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom); return hits.length })()`)
      const image = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('[data-image-node]'); return n ? n.getAttribute('data-image-arm') : false })()`), 4000)
      const note = await wc.executeJavaScript(`(() => { const f = document.querySelector('.panel[data-panel-kind="file"]'); return f ? f.textContent.includes('Welcome') : false })()`)
      await settle(); flushLayoutStore()
      const after = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
      const ws = after.workspaces.find((w) => w.id === after.activeWorkspaceId)
      const record = ws && ws.starter
      const again = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: 'starter' }, null, 3000)
      const panelsAfterAgain = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind]').length`)
      ok(id, primary === true && started && kinds === 'chat,file,image,terminal,workflow' &&
        Array.isArray(captions) && JSON.stringify(captions) === JSON.stringify(expected) &&
        typeof group === 'string' && /Examples/.test(group) && image === 'data' && note === true && overlap === 0 &&
        record && record.version === 1 && [...record.keys].sort().join(',') === 'agent,image,note,terminal,workflow' &&
        again && again.kind === 'refused' && /already/.test(again.reason) && panelsAfterAgain === 5 &&
        ptyManager.list().length === before.ptys && chatSpawns.length === before.spawns,
      JSON.stringify({ primary, started, kinds, captions, expected, group, overlap, image, note, record, again, panelsAfterAgain, ptys: [before.ptys, ptyManager.list().length], spawns: [before.spawns, chatSpawns.length] }))
    } catch (error) {
      ok(id, false, String(error && error.message || error))
    } finally {
      if (typeof chatId === 'string') await clickPanelClose(wc, chatId)
      await settle()
      state.harnessEnvReport = savedReport
      layoutStore.deletePreset('starter-claude')
      layoutStore.save(savedWorkspace)
      flushLayoutStore()
      await reload()
    }
  }

  {
    // M181 — image.1. THE IMAGE PANEL paints main's pixels (the real PNG the
    // starter writes, 240x150, through image:read as a data URL) and says
    // `missing` for a file that is gone — the three-state rule: a blank
    // picture panel is indistinguishable from a broken one.
    const id = 'image.1 an image panel paints the real pixels main read (240x150) and a panel whose file is gone says missing by name'
    await settle(); flushLayoutStore()
    const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    const savedWorkspace = disk.workspaces.find((w) => w.id === disk.activeWorkspaceId) || disk.workspaces[0]
    const reload = async () => { const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await loaded; await settle() }
    try {
      const files = prepareStarter(harnessStarterDir)
      layoutStore.save({ panels: [
        { id: 'img1', kind: 'image', x: 100, y: 100, w: 480, h: 360, z: 1, image: { path: files.imagePath } },
        { id: 'img2', kind: 'image', x: 700, y: 100, w: 480, h: 360, z: 2, image: { path: join(harnessStarterDir, 'gone.png') } }
      ], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore()
      await reload()
      const painted = await waitUntil(() => wc.executeJavaScript(`(() => { const img = document.querySelector('.panel[data-panel-id="img1"] img[data-image-pixels]'); return img && img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight, arm: img.closest('[data-image-node]').getAttribute('data-image-arm') } : false })()`), 4000)
      const gone = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="img2"][data-image-node]'); const arm = n && n.getAttribute('data-image-arm'); return arm === 'missing' ? { arm, note: n.querySelector('[data-image-note]')?.textContent } : false })()`), 4000)
      const rail = await wc.executeJavaScript(`[...document.querySelectorAll('[data-rail-row]')].map((r) => r.textContent).filter((t) => /image/.test(t)).length`)
      ok(id, painted && painted.w === 240 && painted.h === 150 && painted.arm === 'data' &&
        gone && gone.arm === 'missing' && /not there any more/.test(gone.note || '') && rail >= 2,
      JSON.stringify({ painted, gone, rail }))
    } catch (error) {
      ok(id, false, String(error && error.message || error))
    } finally {
      layoutStore.save(savedWorkspace); flushLayoutStore(); await reload()
    }
  }

  {
    // M182 — workflow.edit.1. THE DIAGRAM IS AN EDITOR: a real drag on a block
    // moves the DRAFT (the diagram follows, the panel says dirty) and the
    // saved record is untouched until Save (M184); Delete on the selected
    // block removes it from the draft, the record still whole on disk.
    const id = 'workflow.edit.1 a real drag on a diagram block moves the draft — the block follows, the panel reads dirty, the saved record is unchanged — and Delete removes the selected block from the draft only'
    await settle(); flushLayoutStore()
    const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    const savedWorkspace = disk.workspaces.find((w) => w.id === disk.activeWorkspaceId) || disk.workspaces[0]
    const reload = async () => { const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await loaded; await settle() }
    const TPL = 'tpl-edit-1'
    try {
      layoutStore.saveTemplate({ id: TPL, name: 'edit me', nodes: [
        { key: 'n1', kind: 'terminal', cwd: '/tmp', dx: 0, dy: 0 }, { key: 'n2', kind: 'chat', cwd: '/tmp', dx: 300, dy: 0 }
      ], edges: [{ from: 'n1', to: 'n2', trigger: 'exit' }] })
      layoutStore.save({ panels: [{ id: 'wfe', kind: 'workflow', x: 40, y: 40, w: 640, h: 460, z: 1, title: 'edit me', workflow: { templateId: TPL } }], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore(); await reload()
      // Screen for the drag's start; SVG units (the rect's own x/y) for the
      // comparison — the diagram rescales when its extent grows (M183's library
      // sits beside it), so a screen delta is not the authored one.
      const rectOf = (key) => wc.executeJavaScript(`(() => { const g = document.querySelector('[data-workflow-block="${key}"] rect'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, ax: Number(g.getAttribute('x')), ay: Number(g.getAttribute('y')) } })()`)
      const before = await waitUntil(() => rectOf('n2'), 4000)
      const drag = async (from, dx, dy) => {
        const x = Math.round(from.x + from.w / 2), y = Math.round(from.y + from.h / 2)
        wc.focus()
        wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await settle()
        for (let i = 1; i <= 4; i++) { wc.sendInputEvent({ type: 'mouseMove', x: x + Math.round(dx * i / 4), y: y + Math.round(dy * i / 4), button: 'left', buttons: 1 }); await settle() }
        wc.sendInputEvent({ type: 'mouseUp', x: x + dx, y: y + dy, button: 'left', clickCount: 1 }); await settle()
      }
      if (before) await drag(before, 80, 60)
      const after = await rectOf('n2')
      const dirty = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="wfe"]')?.getAttribute('data-workflow-dirty')`)
      flushLayoutStore()
      const onDisk = layoutStore.current().templates.find((t) => t.id === TPL)
      const diskN2 = onDisk && onDisk.nodes.find((n) => n.key === 'n2')
      // Delete on the selected block: the drag selected it; Delete removes it from the draft.
      const selected = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="wfe"]')?.getAttribute('data-workflow-selected')`)
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' }); await settle()
      const gone = await wc.executeJavaScript(`document.querySelector('[data-workflow-block="n2"]') === null && document.querySelector('[data-workflow-block="n1"]') !== null && document.querySelectorAll('[data-workflow-edge]').length === 0`)
      const wholeOnDisk = layoutStore.current().templates.find((t) => t.id === TPL)
      ok(id, before && after && after.ax > before.ax + 40 && after.ay > before.ay + 30 && dirty === 'true' &&
        diskN2 && diskN2.dx === 300 && selected === 'n2' && gone === true && wholeOnDisk && wholeOnDisk.nodes.length === 2 && wholeOnDisk.edges.length === 1,
      JSON.stringify({ before, after, dirty, diskN2, selected, gone, diskNodes: wholeOnDisk && wholeOnDisk.nodes.length }))
    } catch (error) {
      ok(id, false, String(error && error.message || error))
    } finally {
      layoutStore.deleteTemplate(TPL)
      layoutStore.save(savedWorkspace); flushLayoutStore(); await reload()
    }
  }

  {
    // M182 — workflow.edit.2. THE AGENT DOOR edits the same draft through the
    // same operations: `workflow-set` renames a node's title, `workflow-add`
    // mints a node with a fresh key, `workflow-remove` of a missing key is
    // refused by name, `workflow-edge` closing a cycle is refused with the word.
    const id = 'workflow.edit.2 the agent door edits the draft through the shared operations — set, add, a refused remove, a refused cycle — and the diagram shows the result'
    await settle(); flushLayoutStore()
    const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    const savedWorkspace = disk.workspaces.find((w) => w.id === disk.activeWorkspaceId) || disk.workspaces[0]
    const reload = async () => { const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await loaded; await settle() }
    const TPL = 'tpl-edit-2'
    try {
      layoutStore.saveTemplate({ id: TPL, name: 'agent edits', nodes: [
        { key: 'n1', kind: 'terminal', cwd: '/tmp', dx: 0, dy: 0 }, { key: 'n2', kind: 'chat', cwd: '/tmp', dx: 300, dy: 0 }
      ], edges: [{ from: 'n1', to: 'n2', trigger: 'exit' }] })
      layoutStore.save({ panels: [{ id: 'wfa', kind: 'workflow', x: 40, y: 40, w: 640, h: 460, z: 1, title: 'agent edits', workflow: { templateId: TPL } }], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore(); await reload()
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-workflow-block="n2"]') !== null`), 4000)
      const plan = (line) => ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line }, null, 3000)
      const set = await plan(`workflow-set ${TPL} n2 title renamed`)
      const add = await plan(`workflow-add ${TPL} terminal`)
      const removeMissing = await plan(`workflow-remove ${TPL} n9`)
      const cycle = await plan(`workflow-edge ${TPL} n2 n1 exit`)
      await settle()
      const blocks = await wc.executeJavaScript(`[...document.querySelectorAll('[data-workflow-block]')].map((g) => g.getAttribute('data-workflow-block')).sort().join(',')`)
      const label = await wc.executeJavaScript(`document.querySelector('[data-workflow-block="n2"] .workflow-node__block-label')?.textContent`)
      const dirty = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="wfa"]')?.getAttribute('data-workflow-dirty')`)
      ok(id, set?.kind === 'ran' && add?.kind === 'ran' && removeMissing?.kind === 'refused' && /n9/.test(removeMissing.reason) &&
        cycle?.kind === 'refused' && /cycle/.test(cycle.reason) && blocks === 'n1,n2,n3' && label === 'renamed' && dirty === 'true',
      JSON.stringify({ set, add, removeMissing, cycle, blocks, label, dirty }))
    } catch (error) {
      ok(id, false, String(error && error.message || error))
    } finally {
      layoutStore.deleteTemplate(TPL)
      layoutStore.save(savedWorkspace); flushLayoutStore(); await reload()
    }
  }

  {
    // M182 — workflow.edit.3. THE CANVAS BINDING'S UPDATE round trip: two
    // terminal panels bound to a template's nodes, moved apart on the canvas,
    // saved back through the one member — the SAME id at revision + 1, the
    // pool node the selection never held kept with its fields; a second
    // Update expects the reloaded revision and succeeds; an expectation that
    // is stale (the record bumped underneath) is refused with the record kept.
    const id = 'workflow.edit.3 Update over bound panels saves the same record at revision + 1 through the operations, keeps the unselected pool node, succeeds again after the reload, and a stale expectation is refused'
    await settle(); flushLayoutStore()
    const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    const savedWorkspace = disk.workspaces.find((w) => w.id === disk.activeWorkspaceId) || disk.workspaces[0]
    const reload = async () => { const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await loaded; await settle() }
    const TPL = 'tpl-bound-3'
    try {
      layoutStore.saveTemplate({ id: TPL, name: 'bound shape', nodes: [
        { key: 'n1', kind: 'terminal', cwd: '/tmp', dx: -100, dy: 0 }, { key: 'n2', kind: 'terminal', cwd: '/tmp', dx: 100, dy: 0 },
        { key: 'n3', kind: 'pool', width: 3, list: '/tmp/items.txt', prompt: 'work', cwd: '/tmp', dx: 0, dy: 200 }
      ], edges: [{ from: 'n1', to: 'n2', trigger: 'exit' }] })
      layoutStore.save({ panels: [
        { id: 'b1', x: 100, y: 100, w: 300, h: 200, z: 1, cwd: '/tmp', command: '/bin/sh', args: [], title: 'left', templateBinding: { templateId: TPL, key: 'n1' } },
        { id: 'b2', x: 900, y: 100, w: 300, h: 200, z: 2, cwd: '/tmp', command: '/bin/sh', args: [], title: 'right', templateBinding: { templateId: TPL, key: 'n2' } }
      ], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore(); await reload()
      await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-id="b1"], .panel[data-panel-id="b2"]').length === 2`), 4000)
      const first = await wc.executeJavaScript(`window.__m182Update(['b1', 'b2'])`)
      flushLayoutStore()
      const afterFirst = layoutStore.current().templates.find((t) => t.id === TPL)
      const n1 = afterFirst && afterFirst.nodes.find((n) => n.key === 'n1'), n2 = afterFirst && afterFirst.nodes.find((n) => n.key === 'n2'), n3 = afterFirst && afterFirst.nodes.find((n) => n.key === 'n3')
      await settle()
      const second = await wc.executeJavaScript(`window.__m182Update(['b1', 'b2'])`)
      flushLayoutStore()
      const afterSecond = layoutStore.current().templates.find((t) => t.id === TPL)
      // Bump the record underneath the renderer's rows: the next Update is stale.
      layoutStore.saveTemplate({ ...afterSecond, name: 'bound shape' })
      const stale = await wc.executeJavaScript(`window.__m182Update(['b1', 'b2'])`)
      flushLayoutStore()
      const afterStale = layoutStore.current().templates.find((t) => t.id === TPL)
      ok(id, first && first.kind === 'ran' && afterFirst && afterFirst.revision === 1 && afterFirst.nodes.length === 3 && afterFirst.edges.length === 1 &&
        n1 && n2 && n2.dx - n1.dx === 800 && n1.title === 'left' && n2.title === 'right' && n3 && n3.kind === 'pool' && n3.width === 3 && n3.list === '/tmp/items.txt' &&
        second && second.kind === 'ran' && afterSecond && afterSecond.revision === 2 &&
        stale && stale.kind === 'refused' && /revision/.test(stale.reason) && afterStale && afterStale.revision === 3,
      JSON.stringify({ first, revision1: afterFirst && afterFirst.revision, n1, n2, n3, second, revision2: afterSecond && afterSecond.revision, stale, revision3: afterStale && afterStale.revision }))
    } catch (error) {
      ok(id, false, String(error && error.message || error))
    } finally {
      layoutStore.deleteTemplate(TPL)
      layoutStore.save(savedWorkspace); flushLayoutStore(); await reload()
    }
  }

  {
    // M183 — workflow.lib.1 / workflow.wire.1 / workflow.inspect.1. THE THREE
    // GESTURES: a real drag from the library to the diagram adds a block at
    // the drop point and the Add control adds one at the placement point; a
    // real drag from a block's port to another block wires an edge, and a
    // second drag that would close a cycle shows the refusal and adds nothing;
    // selecting a block shows its fields in the inspector, editing `title`
    // renames the block, and a bad `width` keeps the value with the reason.
    const ids = ['workflow.lib.1 a real drag from the library adds a block at the drop point and Add adds one at the placement point — both in the draft only', 'workflow.wire.1 a real port drag wires an edge with the default trigger; a drag that would close a cycle shows the refusal by name and adds nothing', 'workflow.inspect.1 selecting a block shows its kind\'s fields in the inspector; Enter on title renames the block; a bad width keeps the typed value and shows the reason']
    await settle(); flushLayoutStore()
    const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    const savedWorkspace = disk.workspaces.find((w) => w.id === disk.activeWorkspaceId) || disk.workspaces[0]
    const reload = async () => { const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await loaded; await settle() }
    const TPL = 'tpl-lib-1'
    const centreOf = async (selector) => wc.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height } })()`)
    const dragTo = async (from, to) => {
      wc.focus()
      wc.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 }); await settle()
      for (let i = 1; i <= 5; i++) { wc.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * i / 5), y: Math.round(from.y + (to.y - from.y) * i / 5), button: 'left', buttons: 1 }); await settle() }
      wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 }); await settle()
    }
    try {
      layoutStore.saveTemplate({ id: TPL, name: 'library shape', nodes: [
        { key: 'n1', kind: 'terminal', cwd: '/tmp', dx: 0, dy: 0 }, { key: 'n2', kind: 'pool', width: 2, list: '/tmp/l.txt', prompt: 'p', cwd: '/tmp', dx: 0, dy: 160 }
      ], edges: [] })
      layoutStore.save({ panels: [{ id: 'wfl', kind: 'workflow', x: 40, y: 40, w: 760, h: 560, z: 1, title: 'library shape', workflow: { templateId: TPL } }], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'wfl', focusedId: 'wfl' })
      flushLayoutStore(); await reload()
      // M183. The library is a disclosure: open it the way a person does.
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-workflow-library-toggle]') !== null && document.querySelector('[data-workflow-block="n1"]') !== null`), 4000)
      await wc.executeJavaScript(`(() => { const t = document.querySelector('[data-workflow-library-toggle]'); if (t && t.getAttribute('aria-pressed') !== 'true') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-workflow-library-kind="chat"]') !== null`), 3000)
      // lib.1: drag the chat entry onto the diagram, well right of the blocks.
      const entry = await centreOf('[data-workflow-library-kind="chat"]')
      // The drop point: to the right of n1's block, inside the SVG's drop room.
      const n1Before = await centreOf('[data-workflow-block="n1"] rect')
      const svgBox = n1Before ? { x: Math.round(n1Before.x + n1Before.w / 2 + 150), y: Math.round(n1Before.y) } : null
      if (entry && svgBox) await dragTo(entry, svgBox)
      const afterDrop = await waitUntil(() => wc.executeJavaScript(`(() => { const g = document.querySelector('[data-workflow-block="n3"]'); if (!g) return false; const r = g.querySelector('rect').getBoundingClientRect(); return { x: r.left, y: r.top, kind: g.getAttribute('data-workflow-block-kind') } })()`), 3000)
      const n1Box = await centreOf('[data-workflow-block="n1"] rect')
      // Add through the keyboard-reachable control on the terminal entry.
      await wc.executeJavaScript(`document.querySelector('[data-workflow-library-kind="terminal"] [data-workflow-library-add]').click(); true`)
      // The placement, not just the presence: a regression to dx 0 would stack the new block on an existing one, which is what placementFor exists to prevent.
      const added = await waitUntil(() => wc.executeJavaScript(`(() => { const g = document.querySelector('[data-workflow-block="n4"] rect'); if (!g) return false; const others = [...document.querySelectorAll('[data-workflow-block] rect')].filter((r) => r !== g).map((r) => Number(r.getAttribute('x')) + Number(r.getAttribute('width'))); return { ax: Number(g.getAttribute('x')), rightmost: Math.max(...others) } })()`), 3000)
      const dirty = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="wfl"]')?.getAttribute('data-workflow-dirty')`)
      flushLayoutStore()
      const onDisk = layoutStore.current().templates.find((t) => t.id === TPL)
      ok(ids[0], afterDrop && afterDrop.kind === 'chat' && n1Box && afterDrop.x > n1Box.x + 100 && added && added.ax >= added.rightmost && dirty === 'true' && onDisk && onDisk.nodes.length === 2,
        JSON.stringify({ entry, svgBox, afterDrop, n1Box, added, dirty, diskNodes: onDisk && onDisk.nodes.length }))
      // wire.1: port of n1 → block n2 wires n1 → n2; then n2's port → n1 would close a cycle.
      const port1 = await centreOf('[data-workflow-block="n1"] [data-workflow-port]')
      const block2 = await centreOf('[data-workflow-block="n2"] rect')
      if (port1 && block2) await dragTo(port1, block2)
      const wired = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-workflow-edge="n1>n2"]') !== null`), 3000)
      const edgeWord = await wc.executeJavaScript(`document.querySelector('[data-workflow-edge="n1>n2"] .workflow-node__edge-word')?.textContent`)
      const port2 = await centreOf('[data-workflow-block="n2"] [data-workflow-port]')
      const block1 = await centreOf('[data-workflow-block="n1"] rect')
      if (port2 && block1) await dragTo(port2, block1)
      const refusal = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-workflow-refusal]')?.textContent || false`), 3000)
      const edgesNow = await wc.executeJavaScript(`document.querySelectorAll('[data-workflow-edge]').length`)
      ok(ids[1], wired === true && typeof edgeWord === 'string' && edgeWord.length > 0 && typeof refusal === 'string' && /cycle/.test(refusal) && edgesNow === 1,
        JSON.stringify({ port1, block2, wired, edgeWord, refusal, edgesNow }))
      // inspect.1: click n2 (the pool) → the inspector shows its fields; rename via title? a pool has no title — use n1 (terminal): click it, edit title.
      // The context pane may be CLOSED here (it sits just past the window's right edge then): open it through the top bar's own toggle, the way a person does.
      await wc.executeJavaScript(`(() => { const t = document.querySelector('.shell__inspector-toggle'); if (t && t.getAttribute('aria-pressed') !== 'true') { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })) } return true })()`); await settle()
      // The node editor lives in the Detail tab; the pane may be resting on another (M180's runs left it on Tools).
      await wc.executeJavaScript(`(() => { const t = document.querySelector('[data-context-tab="detail"]'); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })) } return true })()`); await settle()
      const b1 = await centreOf('[data-workflow-block="n1"] rect')
      wc.sendInputEvent({ type: 'mouseDown', x: b1.x, y: b1.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: b1.x, y: b1.y, button: 'left', clickCount: 1 }); await settle()
      let journeyNote = null
      const fields = await waitUntil(() => wc.executeJavaScript(`(() => { const f = [...document.querySelectorAll('[data-inspector-node-field]')].map((n) => n.getAttribute('data-inspector-node-field')); return f.length > 0 ? f : false })()`), 3000)
      const titleInput = await centreOf('input[data-inspector-node-field="title"]')
      if (titleInput) {
        wc.sendInputEvent({ type: 'mouseDown', x: titleInput.x, y: titleInput.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: titleInput.x, y: titleInput.y, button: 'left', clickCount: 1 }); await settle()
        await waitUntil(() => wc.executeJavaScript(`document.activeElement === document.querySelector('input[data-inspector-node-field="title"]')`), 2000)
        await wc.insertText('renamed by inspector')
        await settle()
        journeyNote = await wc.executeJavaScript(`(() => { const i = document.querySelector('input[data-inspector-node-field="title"]'); return { active: document.activeElement === i, value: i && i.value } })()`)
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); await settle()
      }
      const label = await waitUntil(() => wc.executeJavaScript(`(() => { const t = document.querySelector('[data-workflow-block="n1"] .workflow-node__block-label')?.textContent; return t === 'renamed by inspector' ? t : false })()`), 3000)
      // The pool: a bad width keeps the typed value and shows the reason.
      const b2 = await centreOf('[data-workflow-block="n2"] rect')
      wc.sendInputEvent({ type: 'mouseDown', x: b2.x, y: b2.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: b2.x, y: b2.y, button: 'left', clickCount: 1 }); await settle()
      const widthInput = await waitUntil(() => centreOf('input[data-inspector-node-field="width"]'), 3000)
      let widthReason = false, widthValue = null
      if (widthInput) {
        wc.sendInputEvent({ type: 'mouseDown', x: widthInput.x, y: widthInput.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: widthInput.x, y: widthInput.y, button: 'left', clickCount: 1 }); await settle()
        await waitUntil(() => wc.executeJavaScript(`document.activeElement === document.querySelector('input[data-inspector-node-field="width"]')`), 2000)
        await wc.executeJavaScript(`(() => { const i = document.querySelector('input[data-inspector-node-field="width"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '999'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); await settle()
        widthReason = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-inspector-node-reason="width"]')?.textContent || false`), 3000)
        widthValue = await wc.executeJavaScript(`document.querySelector('input[data-inspector-node-field="width"]')?.value`)
      }
      ok(ids[2], Array.isArray(fields) && fields.includes('title') && label === 'renamed by inspector' && typeof widthReason === 'string' && /width/.test(widthReason) && widthValue === '999',
        JSON.stringify({ fields, journeyNote, label, widthReason, widthValue }))
    } catch (error) {
      for (const id of ids) ok(id, false, String(error && error.message || error))
    } finally {
      layoutStore.deleteTemplate(TPL)
      layoutStore.save(savedWorkspace); flushLayoutStore(); await reload()
    }
  }

  {
    // M184 — workflow.save.1. SAVE ON THE DIAGRAM: an edit makes the panel
    // dirty and enables Save; Save writes revision + 1 and the panel reads
    // clean; a record bumped underneath makes the next Save STALE with its
    // reason and two verbs, the draft kept; Reload takes the record and the
    // draft is clean again.
    const id = 'workflow.save.1 an edit enables Save, Save writes revision + 1 and cleans the panel, a bumped record makes the next Save stale with the draft kept, and Reload takes the record as it stands'
    await settle(); flushLayoutStore()
    const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    const savedWorkspace = disk.workspaces.find((w) => w.id === disk.activeWorkspaceId) || disk.workspaces[0]
    const reload = async () => { const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await loaded; await settle() }
    const TPL = 'tpl-save-1'
    try {
      layoutStore.saveTemplate({ id: TPL, name: 'save me', nodes: [
        { key: 'n1', kind: 'terminal', cwd: '/tmp', dx: 0, dy: 0 }, { key: 'n2', kind: 'chat', cwd: '/tmp', dx: 300, dy: 0 }
      ], edges: [] })
      layoutStore.save({ panels: [{ id: 'wfs', kind: 'workflow', x: 40, y: 40, w: 760, h: 560, z: 1, title: 'save me', workflow: { templateId: TPL } }], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'wfs', focusedId: 'wfs' })
      flushLayoutStore(); await reload()
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-workflow-block="n2"]') !== null`), 4000)
      // M184 (the critic, finding 9). The REASON is read, not a ternary whose
      // branches are both '' — the spec's own sentence was asserted nowhere.
      // The frame writes a disabled verb's reason into `title` and repeats it
      // under the row (`workflow-node__why-line`), so both are captured.
      const saveState = () => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-workflow-verb="save"]'); const p = document.querySelector('.panel[data-panel-id="wfs"]'); const lines = [...document.querySelectorAll('.panel[data-panel-id="wfs"] .workflow-node__why-line')].map((n) => n.textContent).join(' | '); return { label: b && b.textContent, reason: b && b.getAttribute('title'), lines, disabled: b ? b.disabled : null, dirty: p && p.getAttribute('data-workflow-dirty') } })()`)
      const atRest = await saveState()
      // One edit through the agent door — the same operations the diagram's drag uses.
      const edited = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `workflow-move ${TPL} n2 500 40` }, null, 3000)
      await settle()
      const whenDirty = await saveState()
      const click = async (sel) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b || b.disabled) return false; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
      const pressed = await click('[data-workflow-verb="save"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="wfs"]')?.getAttribute('data-workflow-dirty') === 'false'`), 3000)
      flushLayoutStore()
      const afterSave = layoutStore.current().templates.find((t) => t.id === TPL)
      const n2 = afterSave && afterSave.nodes.find((n) => n.key === 'n2')
      // Bump the record underneath the panel, edit again, save: stale.
      layoutStore.saveTemplate({ ...afterSave, name: 'save me' })
      await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `workflow-move ${TPL} n2 600 60` }, null, 3000)
      await settle()
      await click('[data-workflow-verb="save"]')
      const staleStrip = await waitUntil(() => wc.executeJavaScript(`(() => { const s = document.querySelector('[data-workflow-stale]'); return s ? { text: s.textContent, reload: !!s.querySelector('[data-workflow-verb="reload"]'), copy: !!s.querySelector('[data-workflow-verb="save-copy"]') } : false })()`), 3000)
      flushLayoutStore()
      const afterStale = layoutStore.current().templates.find((t) => t.id === TPL)
      const stillDirty = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="wfs"]')?.getAttribute('data-workflow-dirty')`)
      // Reload takes the record as it stands: the draft is clean and the block is back where the record has it.
      await click('[data-workflow-verb="reload"]')
      const afterReload = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="wfs"]'); const g = document.querySelector('[data-workflow-block="n2"] rect'); return p && p.getAttribute('data-workflow-dirty') === 'false' && g ? { dirty: p.getAttribute('data-workflow-dirty') } : false })()`), 3000)
      ok(id, atRest && atRest.disabled === true && atRest.dirty === 'false' &&
        /nothing to save — the diagram matches the template/.test(String(atRest.reason)) &&
        /nothing to save — the diagram matches the template/.test(String(atRest.lines)) &&
        edited && edited.kind === 'ran' && whenDirty && whenDirty.disabled === false && whenDirty.dirty === 'true' &&
        pressed === true && afterSave && afterSave.revision === 1 && n2 && n2.dx === 500 && n2.dy === 40 &&
        staleStrip && /revision/.test(staleStrip.text) && staleStrip.reload && staleStrip.copy &&
        afterStale && afterStale.revision === 2 && stillDirty === 'true' && afterReload !== false,
      JSON.stringify({ atRest, edited, whenDirty, pressed, revision1: afterSave && afterSave.revision, n2, staleStrip, revision2: afterStale && afterStale.revision, stillDirty, afterReload }))
    } catch (error) {
      ok(id, false, String(error && error.message || error))
    } finally {
      layoutStore.deleteTemplate(TPL)
      layoutStore.save(savedWorkspace); flushLayoutStore(); await reload()
    }
  }

  {
    // M184 (the critic, findings 1 and 15f) — workflow.door.1. THE AGENT DOOR
    //     ANSWERS THE TRUTH. `runWorkflow` returns `undefined` on success and
    //     a SENTENCE on refusal; the adapter read those backwards, so the one
    //     door with nobody watching answered `refused` for every run that
    //     started and `ran` for every one that did not — a defect no check
    //     could see, because nothing drove the door. Here a run of a template
    //     that is not saved is refused IN ITS OWN WORDS, and `workflow-copy`
    //     (the only save a built-in has) writes a second record through the
    //     same door and names it.
    const id = 'workflow.door.1 through tc plan: workflow-run on a template that is not saved is REFUSED with its own sentence (never reported as ran), and workflow-copy writes a second record under a new name and says which'
    await settle(); flushLayoutStore()
    const disk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    const savedWorkspace = disk.workspaces.find((w) => w.id === disk.activeWorkspaceId) || disk.workspaces[0]
    const reload = async () => { const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await loaded; await settle() }
    const TPL = 'tpl-door-1'
    const BAD = 'tpl-door-bad'
    let copyId
    try {
      layoutStore.saveTemplate({ id: TPL, name: 'door me', nodes: [{ key: 'n1', kind: 'terminal', cwd: '/tmp', dx: 0, dy: 0 }], edges: [] })
      // Saved BEFORE the reload: the renderer reads its template rows once at
      // load, so a record written after it is not bindable and the plan is
      // refused at the binding — which would pass whichever way round the
      // adapter read its answer, which is exactly what this check exists for.
      layoutStore.saveTemplate({ id: BAD, name: 'cannot run', nodes: [{ key: 'n1', kind: 'terminal', cwd: '/tmp', dx: 0, dy: 0 }], edges: [] })
      layoutStore.save({ panels: [{ id: 'wfd', kind: 'workflow', x: 40, y: 40, w: 760, h: 560, z: 1, title: 'door me', workflow: { templateId: TPL } }], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'wfd', focusedId: 'wfd' })
      flushLayoutStore(); await reload()
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-workflow-block="n1"]') !== null`), 4000)
      // The refusal has to be RUNWORKFLOW'S OWN — a name buildPlan cannot bind
      // is refused before the adapter is ever called, and would pass whichever
      // way round the adapter read its answer. This template is saved and
      // bindable, and cannot run: its node names neither a preset nor a
      // command, which is the sentence Run's door shows.
      const gone = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `workflow-run ${BAD}` }, null, 3000)
      const copied = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `workflow-copy ${TPL}` }, null, 3000)
      await settle(); flushLayoutStore()
      const all = layoutStore.current().templates
      const copy = all.find((t) => t.id !== TPL && t.name === 'door me (copy)')
      copyId = copy && copy.id
      ok(id,
        gone && gone.kind === 'refused' && /names neither a preset nor a command/.test(String(gone.reason)) &&
          copied && copied.kind === 'ran' && /door me \(copy\)/.test(String(copied.summary)) &&
          copy !== undefined && copy.revision === 0 && copy.nodes.length === 1 && copy.nodes[0].key === 'n1',
        JSON.stringify({ gone, copied, copy }))
    } catch (error) {
      ok(id, false, String(error && error.message || error))
    } finally {
      layoutStore.deleteTemplate(TPL)
      layoutStore.deleteTemplate(BAD)
      if (copyId) layoutStore.deleteTemplate(copyId)
      layoutStore.save(savedWorkspace); flushLayoutStore(); await reload()
    }
  }

  {
    // M73 — chat.1 / chat.2 / chat.3 / chat.4. THE CHAT PANEL, END TO END, in
    //     a real renderer over a REAL AgentSessionManager and a FAKE process
    //     runner replaying a stream recorded from claude (the harness's
    //     chatRunner). chat.1: minting through the SAME beginNewChat the
    //     palette row calls spawns NO PTY and takes NO xterm (checks 103/164's
    //     argument reaching a sixth kind — the FIRST process kind that is not
    //     a terminal, so "no PtyManager session" is the clause that matters),
    //     a missing directory is refused BY NAME with no panel minted, and a
    //     send through the composer streams the recorded `pong` into the
    //     transcript. chat.2: the one vocabulary — the frame's pill reads
    //     `working` while the turn streams and `idle` after, the rail row
    //     agrees, and the chrome counts the turn. chat.3: a RESTORE renders
    //     the durable file — main's session is disposed to stand in for a
    //     relaunch, the renderer reloads, and the panel shows yesterday's
    //     `pong` with `not started` for a state, before any process exists.
    //     chat.4: closing it sends NO pty.kill for its id while a terminal
    //     closed in the same window IS recorded (165's non-vacuity shape),
    //     and the session and its file are gone.
    {
      const IDS = [
        'chat.1 a chat panel minted through the real verb spawns no PTY and no xterm, a missing directory is refused by name, and a send streams the recorded answer',
        'chat.2 the pill reads working while the turn streams and idle after, the rail row agrees, and the chrome counts one turn',
        'chat.3 a restored chat panel renders the durable transcript with no process — asleep, one turn, yesterday\'s answer',
        'chat.4 closing a chat panel sends no pty.kill and drops its session and its file, while a terminal close in the same window is recorded',
        'chat.5 the menu\'s paste reaches the focused composer and not a terminal — the fifth text surface serves itself'
      ]
      const cLog = []
      const onC = (_e, _l, m) => { cLog.push(String(m)) }
      wc.on('console-message', onC)
      try {
        const cDir = mkdtempSync(join(tmpdir(), 'tc panels chat-'))
        // `claudeAvailable` is derived from the preset rows' own availability
        // (a claude-kind preset whose command resolves), and this harness's
        // PATH need not carry a real `claude`: a user preset of that kind
        // over /bin/sh makes the composer's gate answer the way it does on a
        // machine with the CLI, through the real availability path. Added
        // here rather than at setup so no earlier preset-count check moves;
        // the renderer reloads so its rows pick it up.
        layoutStore.addPreset({ id: 'chat-claude', name: 'Claude (harness)', cwd: '~', command: '/bin/sh', args: [], agent: 'claude-code' })
        flushLayoutStore()
        const reP = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reP
        await settle()
        const xtermsBefore = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
        const spawnsBefore = chatSpawns.length
        const ptyBefore = ptyManager.list().length
        const refused = await wc.executeJavaScript(`window.__m73Chat('/nope/never/here/' + Date.now())`)
        const minted = await wc.executeJavaScript(`window.__m73Chat(${JSON.stringify(cDir)})`)
        const chatId = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-kind="chat"]')?.getAttribute('data-panel-id') ?? false`), 5000)
        const sel = (q) => `document.querySelector('.panel[data-panel-id="${chatId}"] ${q}')`
        // The composer: a React-controlled textarea, so the value goes through
        // the prototype setter and an input event; then the labelled Send.
        const sent = await waitUntil(() => wc.executeJavaScript(`(() => {
          const ta = ${sel('[data-chat-input]')}; if (!ta || ta.disabled) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, 'Reply with exactly the word: pong'); ta.dispatchEvent(new Event('input', { bubbles: true }))
          const b = ${sel('[data-chat-send]')}; if (!b || b.disabled) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 5000)
        const working = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent === 'working' || false`), 4000)
        const pong = await waitUntil(() => wc.executeJavaScript(`(() => { const t = [...document.querySelectorAll('.panel[data-panel-id="${chatId}"] [data-chat-assistant-text]')].map((e) => e.textContent).join('|'); return t.includes('pong') ? t : false })()`), 6000)
        const idle = await waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent === 'idle' || false`), 6000)
        const hasSession = await wc.executeJavaScript(`Object.prototype.hasOwnProperty.call(window.__m4aSessions(), ${JSON.stringify(chatId)})`)
        const xtermsAfter = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
        const spawn = chatSpawns[spawnsBefore]
        const noPty = ptyManager.list().length === ptyBefore && ptyManager.list().every((s) => s.panelId !== chatId)
        ok(IDS[0],
          refused && refused.kind === 'refused' && /no such directory/.test(String(refused.reason)) &&
            minted && minted.kind === 'spawned' && typeof chatId === 'string' && sent === true &&
            typeof pong === 'string' && hasSession === false && xtermsAfter === xtermsBefore && noPty &&
            chatSpawns.length === spawnsBefore + 1 && spawn.cwd === cDir && spawn.args.includes('--session-id') && spawn.args.includes('--permission-prompt-tool'),
          JSON.stringify({ refused, minted, chatId, sent, pong: String(pong).slice(0, 40), hasSession, xterms: [xtermsBefore, xtermsAfter], noPty, args: spawn && spawn.args, log: cLog.slice(-3) }))

        // The rail may be collapsed by an earlier check; its row is what the
        // vocabulary is being read from, so open it through the real setting.
        await wc.executeJavaScript(`window.canvas.settings.set('shell.railOpen', true)`)
        // And the dock on the Panels pane — an earlier check may have left it
        // on Files or Workspaces, where no panel row exists at all.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await settle()
        const railWord = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-rail-row="${chatId}"]'); return r && r.textContent.includes('idle') ? r.textContent : false })()`), 4000)
        const railRow = await wc.executeJavaScript(`(() => { const r = document.querySelector('[data-rail-row="${chatId}"]'); return r ? r.textContent : 'no-row' })()`)
        const turns = await wc.executeJavaScript(`${sel('')}?.getAttribute('data-chat-turns') ?? null`)
        const tone = await wc.executeJavaScript(`${sel('')}?.getAttribute('data-tone') ?? null`)
        ok(IDS[1], working === true && idle === true && typeof railWord === 'string' && turns === '1' && tone === 'idle',
          JSON.stringify({ working, idle, railWord: String(railWord).slice(0, 60), railRow: String(railRow).slice(0, 80), turns, tone, log: cLog.slice(-3) }))

        // chat.3. Stand in for a relaunch: the layout on disk holds the chat
        // panel (committed at the mint), main's session is disposed WITHOUT
        // dropping the file, the renderer reloads.
        flushLayoutStore()
        const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const wsNow = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
        const persisted = wsNow.panels.find((p) => p.id === chatId)
        agentSessions.dispose(chatId)
        const fileTurns = agentTranscripts.read(chatId).turns.length
        const reC = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reC
        await settle()
        const restoredPong = await waitUntil(() => wc.executeJavaScript(`(() => { const t = [...document.querySelectorAll('.panel[data-panel-id="${chatId}"] [data-chat-assistant-text]')].map((e) => e.textContent).join('|'); return t.includes('pong') ? t : false })()`), 8000)
        const restoredWord = await wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent ?? null`)
        const restoredTurns = await wc.executeJavaScript(`${sel('')}?.getAttribute('data-chat-turns') ?? null`)
        const restoredSpawns = chatSpawns.length
        ok(IDS[2],
          persisted && persisted.kind === 'chat' && persisted.chat && persisted.chat.cwd === cDir && typeof persisted.chat.sessionId === 'string' &&
            fileTurns >= 2 && typeof restoredPong === 'string' && restoredWord === 'asleep' && restoredTurns === '1' &&
            restoredSpawns === spawnsBefore + 1,
          JSON.stringify({ persisted, fileTurns, restoredPong: String(restoredPong).slice(0, 40), restoredWord, restoredTurns, spawns: [spawnsBefore, restoredSpawns], log: cLog.slice(-3) }))

        // chat.5. The menu's Cmd+V arrives as edit:paste over IPC (check 35's
        // shape for the palette): with the composer focused, the text lands in
        // it; the canvas-level route to a terminal finds none for a chat id.
        await wc.executeJavaScript(`(() => { const ta = ${sel('[data-chat-input]')}; if (ta) ta.focus(); return !!ta })()`)
        wc.send(IPC_EVENTS.EDIT_PASTE, 'pasted-into-chat')
        const pasted = await waitUntil(() => wc.executeJavaScript(`(() => { const ta = ${sel('[data-chat-input]')}; return ta && ta.value.includes('pasted-into-chat') ? ta.value : false })()`), 3000)
        ok(IDS[4], typeof pasted === 'string', JSON.stringify({ pasted }))

        // chat.4. 165's shape: its own terminal, so the positive clause is real.
        const killsBefore = killedPanelIds.length
        const termId3 = await (async () => {
          const before = new Set(await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
          wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: cDir, command: '/bin/sh', args: [], w: 400, h: 300 })
          const ids = await waitUntil(async () => {
            const now = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
            return now.length > before.size ? now : false
          }, 5000)
          return ids ? (ids.find((id) => !before.has(id)) ?? null) : null
        })()
        if (termId3 !== null) await waitUntil(async () => (await sessionMap(wc)).has(termId3), 6000)
        await clickPanelClose(wc, chatId)
        if (termId3 !== null) await clickPanelClose(wc, termId3)
        await settle()
        const killsSince = killedPanelIds.slice(killsBefore)
        const goneFromDom = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${chatId}"]') === null`), 4000)
        const sessionGone = await waitUntil(async () => agentSessions.get(chatId) === undefined, 4000)
        const fileGone = await waitUntil(async () => agentTranscripts.read(chatId).turns.length === 0, 4000)
        ok(IDS[3],
          termId3 !== null && !killsSince.includes(chatId) && killsSince.includes(termId3) && goneFromDom === true && sessionGone === true && fileGone === true,
          JSON.stringify({ chatId, termId3, killsSince, goneFromDom, sessionGone, fileGone, log: cLog.slice(-3) }))
        try { rmSync(cDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (cErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(cErr && cErr.message || cErr) + ' | renderer: ' + (cLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onC)
      }
    }

    // -------------------------------------------------------------------
    // M83 — memory.3. THE TWO DOORS. The Files pane's memory control and the
    //     palette's row are enabled from the SELECTED panel's directory, and
    //     the node they open must be rooted on THAT directory. The first
    //     version opened the captured-or-focused panel's instead, so a
    //     selected file node lit the control and clicking it did nothing, and
    //     a terminal focused in another repository opened the wrong memory
    //     under this repository's tree — both silent (M83's verifier). With
    //     nothing selected the control is DISABLED and says why, never gone.
    // -------------------------------------------------------------------
    {
      const IDS = ['memory.3 the Files pane memory control is disabled with its named reason when nothing is selected, and with a FILE panel selected it opens a memory node rooted on that panel\'s directory, not on the focused terminal\'s']
      const dLog = []
      const onD = (_e, _l, m) => { dLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onD)
      try {
        const dirA = mkdtempSync(join(tmpdir(), 'tc panels doorA-'))
        const dirB = mkdtempSync(join(tmpdir(), 'tc panels doorB-'))
        writeFileSync(join(dirA, 'plan.md'), '# plan\n')
        layoutStore.save({
          panels: [{ id: 'fdoor', kind: 'file', x: 80, y: 80, w: 360, h: 260, z: 1, source: { path: join(dirA, 'plan.md') } },
            ...fromPanels([{ kind: 'terminal', rect: { id: 'tdoor', x: 520, y: 80, w: 320, h: 220 }, z: 2, spec: { panelId: 'tdoor', cwd: dirB, command: '/bin/sh', args: ['-c', 'sleep 600'] } }])],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reD = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reD
        await settle()
        // The Files pane, with NOTHING selected.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="files"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const closed = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-tree-memory]'); return b ? { disabled: b.disabled, title: b.title } : false })()`), 5000)
        // Select the FILE panel; focus the terminal in the OTHER directory.
        await wc.executeJavaScript(`window.__m50Select(['fdoor'])`)
        await settle()
        const armed = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-tree-memory]'); return b && b.disabled === false ? { title: b.title } : false })()`), 5000)
        const before = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind="memory"]').length`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-tree-memory]'); b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const opened = await waitUntil(() => wc.executeJavaScript(`(() => { const ns = [...document.querySelectorAll('.panel[data-panel-kind="memory"]')]; return ns.length > ${before} ? ns[ns.length - 1].querySelector('[data-memory-node]')?.getAttribute('data-memory-node') ?? ns[ns.length - 1].getAttribute('data-memory-node') : false })()`), 6000)
        ok(IDS[0],
          closed && closed.disabled === true && /repository/.test(closed.title) &&
            armed !== false && typeof opened === 'string' && opened === dirA && opened !== dirB,
          JSON.stringify({ closed, armed, opened, dirA, dirB, log: dLog.slice(-3) }))
        // Leave the canvas as this block found it: the terminal this block
        // spawned is closed (its session would otherwise outlive the block and
        // be counted by the recovery checks below), and the layout is cleared.
        await clickPanelClose(wc, 'tdoor')
        await settle()
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reDone = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reDone
        await settle()
        try { rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (dErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(dErr && dErr.message || dErr) + ' | renderer: ' + (dLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onD)
      }
    }



    // -------------------------------------------------------------------
    // M84 — watch.1 / watch.2. THE WATCHER, END TO END, against a real child
    //     process and a real directory watch.
    //     watch.1: a restored watcher arms itself, a real WRITE under its
    //     watched path runs its command, the state flips through the ONE
    //     vocabulary (working, then idle for a pass and `exited 2` for a
    //     fail), the body shows the run's tail, a ledger row lands with no
    //     output in it, and closing the node sends NO pty.kill while a
    //     terminal closed in the same window IS recorded.
    //     watch.2: a watcher's PASS fires a handoff edge — a watcher is a
    //     source on the graph like any other node, through the same table.
    // -------------------------------------------------------------------
    {
      const IDS = [
        'watch.1 a restored watcher arms itself, a real write under its path runs its command, the state reads idle for a pass and exited 2 for a fail with the tail in the body, a ledger row lands with no output, and closing it sends no pty.kill while a terminal close in the same window is recorded',
        'watch.2 a watcher that passes fires its handoff edge into a live terminal, through the same table an ordinary source asks',
        'watch.3 a watcher whose watched path is gone says so in its body rather than sitting silent, and Disarm is a persisted pause: the trigger stops firing, the node says it is not watching, and Run now still runs it'
      ]
      const wLog = []
      const onW = (_e, _l, m) => { wLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onW)
      try {
        const wDir = mkdtempSync(join(tmpdir(), 'tc panels watcher-'))
        mkdirSync(join(wDir, 'src'))
        writeFileSync(join(wDir, 'src', 'a.txt'), 'one\n')
        // A command whose exit code the FIXTURE decides: it reads a file the
        // check writes, so one watcher can be made to pass and then fail
        // without re-creating it.
        writeFileSync(join(wDir, 'run.sh'), '#!/bin/sh\necho "ran with $(cat code.txt)"\nexit $(cat code.txt)\n')
        writeFileSync(join(wDir, 'code.txt'), '0')
        layoutStore.save({
          panels: [{ id: 'w1', kind: 'watcher', x: 80, y: 80, w: 520, h: 340, z: 1,
            watch: { cwd: wDir, command: '/bin/sh', args: ['run.sh'], trigger: { kind: 'path', path: join(wDir, 'src') } } },
            ...fromPanels([{ kind: 'terminal', rect: { id: 'wT', x: 680, y: 80, w: 320, h: 220 }, z: 2, spec: { panelId: 'wT', cwd: wDir, command: '/bin/sh', args: ['-c', 'sleep 600'] } }])],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reW = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reW
        await settle()
        // The navigator remembers its pane across reloads, and an earlier
        // block left it on Files — the rail clauses below read the Panels
        // pane, so choose it rather than assuming.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await settle()
        const armed = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="w1"]'); return n ? { status: n.getAttribute('data-watcher-status'), when: n.querySelector('[data-watcher-when]')?.textContent ?? null } : false })()`), 6000)
        // No session and no xterm: a process node without a PTY.
        const hasSession = await wc.executeJavaScript(`Object.prototype.hasOwnProperty.call(window.__m4aSessions(), 'w1')`)
        const ledgerBefore = (await runLedger.list('w1', 50)).length
        // A REAL write under the watched directory.
        writeFileSync(join(wDir, 'src', 'a.txt'), 'two\n')
        const passed = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="w1"]'); if (!n || n.getAttribute('data-watcher-status') !== 'passed') return false; return { tail: n.querySelector('[data-watcher-tail]')?.textContent ?? '', word: n.querySelector('[data-state-word]')?.textContent ?? null, last: n.querySelector('[data-watcher-last]')?.textContent ?? null } })()`), 15000)
        // The RAIL's own word for the same fact — the vocabulary reaching a
        // second surface with no code of its own is the milestone's claim.
        const railWord = await wc.executeJavaScript(`(() => { const r = document.querySelector('.rail-list--panels .rail-row[data-rail-row="w1"]'); return r ? { label: r.querySelector('.rail-row__label')?.textContent ?? null, tail: r.querySelector('.rail-row__tail')?.textContent ?? null } : null })()`)
        // Now make it FAIL, and trigger again.
        writeFileSync(join(wDir, 'code.txt'), '2')
        writeFileSync(join(wDir, 'src', 'a.txt'), 'three\n')
        const failed = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="w1"]'); if (!n || n.getAttribute('data-watcher-status') !== 'exited') return false; return { last: n.querySelector('[data-watcher-last]')?.textContent ?? null, tone: n.getAttribute('data-tone') } })()`), 15000)
        const rows = await runLedger.list('w1', 50)
        const killsBefore = killedPanelIds.length
        await clickPanelClose(wc, 'w1')
        await settle()
        const killsAfterNode = killedPanelIds.length
        await clickPanelClose(wc, 'wT')
        await settle()
        const killsAfterTerminal = killedPanelIds.length
        ok(IDS[0],
          armed && armed.status === 'not-started' && /a change in src/.test(armed.when ?? '') && hasSession === false &&
            passed && /ran with 0/.test(passed.tail) && passed.word === 'idle' && /last run passed/.test(passed.last ?? '') &&
            railWord && /watcher/.test(railWord.label ?? '') && railWord.tail === 'idle' &&
            failed && /last run failed — exit 2/.test(failed.last ?? '') && failed.tone === 'exited' &&
            rows.length >= ledgerBefore + 2 && rows.every((r) => !('output' in r) && !('tail' in r)) &&
            rows.some((r) => r.exitCode === 0) && rows.some((r) => r.exitCode === 2) &&
            killsAfterNode === killsBefore && killsAfterTerminal > killsAfterNode,
          JSON.stringify({ armed, hasSession, passed, railWord, failed, rows: rows.slice(0, 3), killsBefore, killsAfterNode, killsAfterTerminal, log: wLog.slice(-3) }))

        // watch.2 — a watcher's pass fires a handoff edge into a live terminal.
        writeFileSync(join(wDir, 'code.txt'), '0')
        layoutStore.save({
          panels: [{ id: 'w2', kind: 'watcher', x: 80, y: 80, w: 520, h: 340, z: 1,
            watch: { cwd: wDir, command: '/bin/sh', args: ['run.sh'], trigger: { kind: 'panel', sourceId: 'wS', on: 'exit-ok' } } },
            ...fromPanels([{ kind: 'terminal', rect: { id: 'wS', x: 680, y: 80, w: 320, h: 220 }, z: 2, spec: { panelId: 'wS', cwd: wDir, command: '/bin/sh', args: ['-c', 'echo starting; sleep 1; exit 0'] } }])],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reW2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reW2
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await settle()
        // A restored terminal is DORMANT until a gesture starts it — the
        // rail's own start control, which is the gesture a person would use.
        await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('.rail-list--panels .rail-row[data-rail-row="wS"] .rail-row__start'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 6000)
        const ranAfterExit = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="w2"]'); if (!n) return false; const s = n.getAttribute('data-watcher-status'); return s === 'passed' ? s : false })()`), 20000)
        // ONE run, not two. A source's ending reaches the fire path by more
        // than one route (an exit and, for a chat, a turn's end), and a
        // watcher that ran twice per ending would satisfy any check that only
        // asked whether it ran (M84's verifier).
        await settle()
        const runsForW2 = (await runLedger.list('w2', 50)).length
        ok(IDS[1],
          ranAfterExit === 'passed' && runsForW2 === 1,
          JSON.stringify({ ranAfterExit, runsForW2, log: wLog.slice(-3) }))
        // watch.3 — the ARMING REFUSAL, and the Arm/Disarm toggle.
        //   A watcher whose watched path is gone is disarmed in MAIN, and the
        //   node must say so: the first version discarded `create`'s answer,
        //   so the node sat at `not started` forever, still runnable by hand,
        //   with nothing anywhere explaining why it never triggered (M84's
        //   verifier). The toggle beside it is the pause a person needs that
        //   is not a delete — persisted, so it survives a reload.
        layoutStore.save({
          panels: [{ id: 'w3', kind: 'watcher', x: 80, y: 80, w: 520, h: 340, z: 1,
            watch: { cwd: wDir, command: '/bin/sh', args: ['run.sh'], trigger: { kind: 'path', path: join(wDir, 'not-there') } } }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reW3 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reW3
        await settle()
        const refused = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="w3"] [data-watcher-disarmed]'); return p ? p.textContent : false })()`), 8000)
        // Disarm, then reload: the pause is a persisted fact.
        layoutStore.save({
          panels: [{ id: 'w4', kind: 'watcher', x: 80, y: 80, w: 520, h: 340, z: 1,
            watch: { cwd: wDir, command: '/bin/sh', args: ['run.sh'], trigger: { kind: 'path', path: join(wDir, 'src') } } }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reW4 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reW4
        await settle()
        const armLabel = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="w4"] [data-watcher-arm]'); return b ? b.textContent : false })()`), 6000)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="w4"] [data-watcher-arm]'); b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const disarmedLabel = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="w4"] [data-watcher-arm]'); const w = document.querySelector('.panel[data-panel-id="w4"] [data-watcher-when]'); return b && b.textContent === 'Arm' ? { arm: b.textContent, when: w ? w.textContent : null } : false })()`), 6000)
        await settle()
        const persistedDisarm = await waitUntil(async () => {
          const rows = layoutStore.mergedWorkspaces().flatMap((w) => w.panels).filter((p) => p.id === 'w4')
          return rows.length === 1 && rows[0].watch.armed === false ? true : false
        }, 6000)
        // A disarmed watcher does not run when its path changes.
        const ledgerBeforeDisarm = (await runLedger.list('w4', 50)).length
        writeFileSync(join(wDir, 'src', 'a.txt'), 'four\n')
        await settle()
        await settle()
        const ledgerAfterDisarm = (await runLedger.list('w4', 50)).length
        // And Run now still works on it: disarmed is a pause, not a delete.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="w4"] [data-watcher-run]'); if (!b || b.disabled) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const ranByHand = await waitUntil(async () => (await runLedger.list('w4', 50)).length > ledgerAfterDisarm, 10000)
        ok(IDS[2],
          typeof refused === 'string' && /nothing to watch/.test(refused) &&
            armLabel === 'Disarm' && disarmedLabel && disarmedLabel.when === 'not watching' &&
            persistedDisarm === true && ledgerAfterDisarm === ledgerBeforeDisarm && ranByHand === true,
          JSON.stringify({ refused, armLabel, disarmedLabel, persistedDisarm, ledgerBeforeDisarm, ledgerAfterDisarm, ranByHand, log: wLog.slice(-3) }))

        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reDoneW = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reDoneW
        await settle()
        try { rmSync(wDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (wErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(wErr && wErr.message || wErr) + ' | renderer: ' + (wLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onW)
      }
    }


    // -------------------------------------------------------------------
    // M85 — vault.1. THE VAULT, END TO END, over a real folder of markdown.
    //     The pane lists every note by TITLE and opens one as a prose panel;
    //     a `[[link]]` inside that note is a CONTROL that opens the note it
    //     names; an UNRESOLVED link is still a link (marked, and offering to
    //     create) rather than silently reading as text — the failure this
    //     whole feature would have shipped with; and the Backlinks section
    //     names the note that points here, with its line. With no vault set
    //     the pane says so and offers the verb, rather than rendering an
    //     empty list that reads like a folder with nothing in it.
    // -------------------------------------------------------------------
    {
      const IDS = ['vault.1 with no vault set the pane names the setting and offers its verb; with one set it lists notes by title and marks the open one, a click opens a note as prose, a [[link]] opens the note it names, an unresolved link is marked rather than read as text, and Backlinks names the note pointing here with its line — or says no note does']
      const vLog = []
      const onV = (_e, _l, m) => { vLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onV)
      try {
        const vaultDir = mkdtempSync(join(tmpdir(), 'tc panels my vault-'))
        mkdirSync(join(vaultDir, 'meetings'), { recursive: true })
        writeFileSync(join(vaultDir, 'design.md'), '# The design\nit follows [[api notes]] and [[nothing here]]\n')
        writeFileSync(join(vaultDir, 'api notes.md'), '# API notes\nback to [[design]]\n')
        writeFileSync(join(vaultDir, 'meetings', '2026-09-04.md'), '# Standup\nnothing\n')
        layoutStore.setPreference('vault.root', '')
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reV = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reV
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="vault"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const unset = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('[data-vault-arm="unset"]'); return p ? { text: p.textContent, verb: !!p.querySelector('[data-vault-choose]') } : false })()`), 6000)
        // Now set the root through the SAME store the setting writes to.
        // Set through the store and RELOAD: the settings push is main's own
        // event and this harness does not own the menu that sends it, so the
        // reload is the honest way to reach the same state a user would.
        layoutStore.setPreference('vault.root', vaultDir)
        flushLayoutStore()
        const reV2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reV2
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="vault"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const listed = await waitUntil(() => wc.executeJavaScript(`(() => { const rows = [...document.querySelectorAll('[data-vault-note]')].map((r) => ({ path: r.getAttribute('data-vault-note'), title: r.querySelector('[data-vault-title]')?.textContent ?? '' })); return rows.length === 3 ? rows : false })()`), 8000)
        // Open `design.md` from the pane.
        // Guarded: a missing target reads as a red assertion, never a throw
        // that takes the block down (the harness doc's rule).
        const clickedNote = await wc.executeJavaScript(`(() => { const r = document.querySelector('[data-vault-note="design.md"] .rail-row__main'); if (!r) return { ok: false, panes: document.querySelector('[data-vault-pane]') ? 'vault pane up' : 'no vault pane', arm: document.querySelector('[data-vault-arm]')?.getAttribute('data-vault-arm') ?? null }; r.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return { ok: true } })()`)
        const opened = await waitUntil(() => wc.executeJavaScript(`(() => { const p = [...document.querySelectorAll('.panel[data-panel-kind="file"]')].pop(); if (!p) return false; const links = [...p.querySelectorAll('[data-wikilink]')].map((l) => ({ name: l.getAttribute('data-wikilink'), resolved: l.getAttribute('data-wikilink-resolved'), text: l.textContent })); return links.length === 2 ? { id: p.getAttribute('data-panel-id'), links } : false })()`), 8000)
        // Click the RESOLVED link: it opens the note it names.
        const clickedLink = await wc.executeJavaScript(`(() => { const l = document.querySelector('[data-wikilink="api notes"]'); if (!l) return false; l.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const followed = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="file"]')]; const p = ps[ps.length - 1]; const t = p ? p.querySelector('.pf__title')?.textContent ?? '' : ''; return /api notes/.test(t) ? { title: t, panels: ps.length } : false })()`), 8000)
        // That note's Backlinks name design.md, with its line.
        const backlinks = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="file"]')]; const p = ps[ps.length - 1]; const rows = p ? [...p.querySelectorAll('[data-file-backlink]')].map((b) => ({ path: b.getAttribute('data-file-backlink'), line: b.parentElement?.querySelector('.file-node__backlink-line')?.textContent ?? '' })) : []; return rows.length === 1 ? rows : false })()`), 8000)
        // The EMPTY arm of Backlinks (M85's critic: the scene proved only the
        // answered state): a note nobody points at says so rather than showing
        // a heading over nothing. And the pane marks the OPEN note's row.
        await wc.executeJavaScript(`(() => { const r = document.querySelector('[data-vault-note="meetings/2026-09-04.md"] .rail-row__main'); if (r) r.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!r })()`)
        const noneArm = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="file"]')]; const p = ps[ps.length - 1]; const a = p ? p.querySelector('[data-file-backlinks-arm="none"]') : null; return a ? a.textContent : false })()`), 8000)
        const markedRow = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-vault-note="meetings/2026-09-04.md"]'); return r && r.classList.contains('rail-row--selected') ? true : false })()`), 6000)
        ok(IDS[0],
          unset && /no vault folder yet/.test(unset.text) && unset.verb === true &&
            typeof noneArm === 'string' && /no note points here/.test(noneArm) && markedRow === true &&
            Array.isArray(listed) && listed.some((r) => r.path === 'design.md' && r.title === 'The design') && clickedNote.ok === true && clickedLink === true &&
            listed.some((r) => r.path === 'meetings/2026-09-04.md' && r.title === 'Standup') &&
            opened && opened.links.some((l) => l.name === 'api notes' && l.resolved === 'true') &&
            opened.links.some((l) => l.name === 'nothing here' && l.resolved === 'false') &&
            followed && followed.panels === 2 &&
            Array.isArray(backlinks) && backlinks[0].path === 'design.md' && /line 2/.test(backlinks[0].line),
          JSON.stringify({ unset, listed, clickedNote, opened, clickedLink, followed, backlinks, noneArm, markedRow, log: vLog.slice(-3) }))
        // M150 — vault.tags.1. TAGS: the pane's TAGS section lists each tag
        // with its count (by count, then name); pressing a row filters the
        // notes to that tag and writes `#name` into the search field; Escape
        // clears; the note panel's chip does the same from the other side.
        writeFileSync(join(vaultDir, 'design.md'), '# The design\nit follows [[api notes]] and [[nothing here]]\n#todo #design\n')
        writeFileSync(join(vaultDir, 'api notes.md'), '# API notes\nback to [[design]]\n#todo\n')
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-vault-refresh]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const tagRows = await waitUntil(() => wc.executeJavaScript(`(() => { const rows = [...document.querySelectorAll('[data-vault-tag]')].map((r) => ({ tag: r.getAttribute('data-vault-tag'), count: r.querySelector('[data-vault-tag-count]')?.textContent })); return rows.length === 2 ? rows : false })()`), 6000)
        // The row's BUTTON, not the row: the verb is a shellControl on `.rail-row__main`.
        await wc.executeJavaScript(`(() => { const r = document.querySelector('[data-vault-tag="todo"] .rail-row__main'); if (r) r.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!r })()`)
        const filtered = await waitUntil(() => wc.executeJavaScript(`(() => { const notes = [...document.querySelectorAll('[data-vault-note]')].map((r) => r.getAttribute('data-vault-note')); const q = document.querySelector('[data-vault-filter]')?.value; return q === '#todo' && notes.length === 2 ? { notes, q } : false })()`), 4000)
        await wc.executeJavaScript(`(() => { const i = document.querySelector('[data-vault-filter]'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return !!i })()`)
        const cleared = await waitUntil(() => wc.executeJavaScript(`(() => { const notes = [...document.querySelectorAll('[data-vault-note]')]; const q = document.querySelector('[data-vault-filter]')?.value; return q === '' && notes.length === 3 })()`), 4000)
        // The chip in the note panel: open design.md and press its #design chip.
        await wc.executeJavaScript(`(() => { const r = document.querySelector('[data-vault-note="design.md"] .rail-row__main'); if (r) r.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!r })()`)
        const chip = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="file"]')]; const p = ps[ps.length - 1]; const c = p ? p.querySelector('[data-file-tag="design"]') : null; if (!c) return false; c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 6000)
        const chipFiltered = await waitUntil(() => wc.executeJavaScript(`(() => { const notes = [...document.querySelectorAll('[data-vault-note]')].map((r) => r.getAttribute('data-vault-note')); const q = document.querySelector('[data-vault-filter]')?.value; return q === '#design' && notes.length === 1 && notes[0] === 'design.md' ? notes : false })()`), 4000)
        // The pane is OPEN after the chip (the M150 critic: chooseNavigator is a
        // toggle, and the first cut closed the pane the user was reading from —
        // the navigator is always mounted, so the rows read fine from a
        // collapsed rail) and the tag's row is marked.
        const paneOpen = await wc.executeJavaScript(`(() => { const sh = document.querySelector('.shell'); return sh ? { collapsed: sh.classList.contains('shell--rail-collapsed'), vault: document.querySelector('[data-vault-pane]') !== null, marked: document.querySelector('[data-vault-tag="design"]')?.classList.contains('rail-row--selected') === true } : null })()`)
        ok('vault.tags.1 the Vault pane lists each tag with its count, a tag row filters the notes and writes #name into the search, Escape clears, and a note\'s tag chip filters from the other side',
          Array.isArray(tagRows) && tagRows[0].tag === 'todo' && tagRows[0].count === '2' && tagRows[1].tag === 'design' && tagRows[1].count === '1' &&
            filtered !== false && cleared === true && chip === true && chipFiltered !== false && paneOpen !== null && paneOpen.collapsed === false && paneOpen.vault === true && paneOpen.marked === true,
          JSON.stringify({ tagRows, filtered, cleared, chip, chipFiltered, paneOpen }))
        layoutStore.setPreference('vault.root', '')
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reVDone = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reVDone
        await settle()
        try { rmSync(vaultDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (vErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(vErr && vErr.message || vErr) + ' | renderer: ' + (vLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onV)
      }
    }


    // -------------------------------------------------------------------
    // M86 — across.1. A CROSS-WORKTREE REVIEW NODE over a real repository
    //     with two worktrees this "app" created (records in the harness's
    //     own store, trees made by real git). The node renders ONE SECTION
    //     PER TREE — the main tree first — never one flat list; the changed
    //     worktree's section names its file and the untouched one reads
    //     `no changes`; commit and discard are BLOCKED BY NAME, not absent;
    //     and the context pane's Changes section for a panel in that
    //     repository carries the branch line and the identity line names
    //     the repository.
    // -------------------------------------------------------------------
    {
      const IDS = ['across.1 a cross-worktree review node asked from INSIDE a worktree renders the repository\'s sections — the main tree first, the changed worktree naming its file, the untouched one clean — with commit blocked by name; and the context pane for that worktree panel names the repository, not the worktree, and its branch against the tracking ref']
      const xLog = []
      const onX = (_e, _l, m) => { xLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onX)
      try {
        const { execFileSync } = require('node:child_process')
        const xBase = mkdtempSync(join(tmpdir(), 'tc panels across-'))
        const xRepo = join(xBase, 'repo here')
        const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
        mkdirSync(xRepo)
        g(xRepo, 'init', '-q', '.'); g(xRepo, 'config', 'user.email', 'v@e.com'); g(xRepo, 'config', 'user.name', 'v')
        g(xRepo, 'checkout', '-q', '-b', 'main')
        writeFileSync(join(xRepo, 'a.txt'), 'base\n'); g(xRepo, 'add', '-A'); g(xRepo, 'commit', '-qm', 'init')
        const xRoot = g(xRepo, 'rev-parse', '--show-toplevel').trim()
        const wtA = join(xBase, 'wt a'); const wtB = join(xBase, 'wt b')
        g(xRepo, 'worktree', 'add', '-q', '-b', 'tc/xa-1', wtA, 'HEAD')
        g(xRepo, 'worktree', 'add', '-q', '-b', 'tc/xb-1', wtB, 'HEAD')
        writeFileSync(join(wtA, 'a.txt'), 'changed in a\n')
        // The records, as the manager would have written them.
        layoutStore.addWorktree({ id: 'xwa', root: xRoot, path: wtA, branch: 'tc/xa-1', createdAt: 1, panelId: 'xA' })
        layoutStore.addWorktree({ id: 'xwb', root: xRoot, path: wtB, branch: 'tc/xb-1', createdAt: 2, panelId: 'xB' })
        REVIEW_FENCES.push(xBase)
        layoutStore.save({
          panels: [
            { id: 'xr', kind: 'review', x: 80, y: 80, w: 520, h: 420, z: 1, subject: { subjectId: 'xT', repoRoot: wtA, baselineSha: g(xRepo, 'rev-parse', 'HEAD').trim(), label: 'every worktree', across: true } },
            // The subject sits INSIDE worktree A: its root resolves to the worktree,
            // and the node and the identity line must still answer for the REPOSITORY.
            ...fromPanels([{ kind: 'terminal', rect: { id: 'xT', x: 660, y: 80, w: 320, h: 220 }, z: 2, spec: { panelId: 'xT', cwd: wtA, command: '/bin/sh', args: ['-c', 'sleep 600'] } }])
          ],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reX = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reX
        await settle()
        const sections = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="xr"]'); if (!n) return false; const secs = [...n.querySelectorAll('[data-review-section]')].map((s) => ({ branch: s.getAttribute('data-review-section'), count: s.querySelector('.review-node__section-count')?.textContent ?? '', files: [...s.querySelectorAll('[data-review-node-file]')].map((f) => f.getAttribute('data-review-node-file')) })); return secs.length === 3 ? { secs, blocked: n.querySelector('[data-review-node-commit-blocked]')?.textContent ?? null, summary: n.querySelector('[data-review-node-summary]')?.textContent ?? null } : false })()`), 15000)
        // The terminal: start it, select it, read the context pane.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await settle()
        await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('.rail-list--panels .rail-row[data-rail-row="xT"] .rail-row__start'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 6000)
        await wc.executeJavaScript(`window.__m50Select(['xT'])`)
        const pane = await waitUntil(() => wc.executeJavaScript(`(() => { const rep = document.querySelector('[data-inspector-repository]'); const line = document.querySelector('[data-branch-line]'); return rep && line ? { repository: rep.textContent, line: line.textContent } : false })()`), 15000)
        ok(IDS[0],
          sections && sections.secs[0].branch === 'main' && /no changes/.test(sections.secs[0].count) &&
            sections.secs[1].branch === 'tc/xa-1' && sections.secs[1].files.includes('tc/xa-1:a.txt') &&
            sections.secs[2].branch === 'tc/xb-1' && /no changes/.test(sections.secs[2].count) &&
            typeof sections.blocked === 'string' && /one worktree at a time/.test(sections.blocked) && /3 worktrees/.test(sections.summary ?? '') &&
            pane && /repo here/.test(pane.repository) && !/wt a/.test(pane.repository) && /tc\/xa-1 · no upstream/.test(pane.line),
          JSON.stringify({ sections, pane, log: xLog.slice(-3) }))
        await clickPanelClose(wc, 'xT')
        await settle()
        layoutStore.dropWorktree('xwa'); layoutStore.dropWorktree('xwb')
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reXDone = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reXDone
        await settle()
        try { rmSync(xBase, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (xErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(xErr && xErr.message || xErr) + ' | renderer: ' + (xLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onX)
      }
    }


    // -------------------------------------------------------------------
    // M88 — github.1. THE GITHUB WORK PANEL, END TO END, over a recorded
    //     client injected the way main injects the real one. Three states:
    //     with no credential the node says so and offers Connect GitHub…;
    //     with one it lists the recorded items by id and title; a Start
    //     session on an item spawns a terminal whose title is the item's and
    //     whose opening context carries the item's body — Jira's own flow
    //     reached by a second kind through ONE verb. Closing the node sends
    //     no pty.kill (the sessionless non-vacuity shape).
    // -------------------------------------------------------------------
    {
      const IDS = ['github.1 the GitHub work node names the missing credential and offers Connect GitHub…, lists the recorded items once one exists, Start session spawns a panel titled by the item with its body as opening context, and closing the node sends no pty.kill while a terminal close is recorded']
      const gLog = []
      const onG = (_e, _l, m) => { gLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onG)
      try {
        state.githubCredentialPresent = false
        layoutStore.save({
          panels: [{ id: 'gh1', kind: 'github', x: 80, y: 80, w: 460, h: 420, z: 1 }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reG = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reG
        await settle()
        const noCred = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="gh1"]'); if (!n) return false; const note = n.querySelector('.github-node__note'); const connect = n.querySelector('[data-github-connect]'); return note && connect ? { note: note.textContent, connect: connect.textContent } : false })()`), 8000)
        state.githubCredentialPresent = true
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="gh1"] [data-github-refresh]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const listed = await waitUntil(() => wc.executeJavaScript(`(() => { const rows = [...document.querySelectorAll('.panel[data-panel-id="gh1"] [data-github-item]')].map((r) => ({ id: r.getAttribute('data-github-item'), title: r.querySelector('.github-item__title')?.textContent ?? '' })); return rows.length === 2 ? rows : false })()`), 8000)
        const sessionsBeforeG = (await sessionMap(wc)).size
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="gh1"] [data-github-item="acme/canvas#12"] [data-github-start]'); if (!b) return false; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const spawned = await waitUntil(async () => (await sessionMap(wc)).size > sessionsBeforeG, 10000)
        const spawnedTitle = await waitUntil(() => wc.executeJavaScript(`(() => { const p = [...document.querySelectorAll('.panel[data-panel-kind="terminal"], .panel:not([data-panel-kind])')].find((x) => /acme\\/canvas#12/.test(x.querySelector('.pf__title')?.textContent ?? '')); return p ? p.querySelector('.pf__title').textContent : false })()`), 8000)
        const killsBeforeG = killedPanelIds.length
        await clickPanelClose(wc, 'gh1')
        await settle()
        const killsAfterNode = killedPanelIds.length
        ok(IDS[0],
          noCred && /not connected/.test(noCred.note) && /Connect GitHub/.test(noCred.connect) &&
            Array.isArray(listed) && listed.some((r) => r.id === 'acme/canvas#12' && /Flaky watchdog/.test(r.title)) && listed.some((r) => r.id === 'acme/canvas#77') &&
            spawned === true && typeof spawnedTitle === 'string' && /Flaky watchdog/.test(spawnedTitle) &&
            killsAfterNode === killsBeforeG,
          JSON.stringify({ noCred, listed, spawned, spawnedTitle, killsBeforeG, killsAfterNode, log: gLog.slice(-3) }))
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reGDone = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reGDone
        await settle()
      } catch (gErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(gErr && gErr.message || gErr) + ' | renderer: ' + (gLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onG)
      }
    }


    // -------------------------------------------------------------------
    // M89 — integrations.1. THE INTEGRATIONS PANE, END TO END: one section
    //     per declared service; with nothing stored each reads `not
    //     connected` with a Connect… verb that opens the palette's
    //     Credentials scope; a stored, verified github credential reads
    //     `connected as <label>` with Verify; the audit rows under it come
    //     from the harness's own broker audit, newest first, and an EMPTY
    //     audit is a sentence, never nothing.
    // -------------------------------------------------------------------
    {
      // An earlier block removes the credential fixture directory; this one
      // needs the store to write, so the directory is recreated first.
      mkdirSync(harnessCredentialDir, { recursive: true })
      // Earlier blocks leave credentials in the shared store; the bare arm
      // needs NONE, or the reload flips the verb to Verify under the click.
      credentialStore.delete('github'); credentialStore.delete('jira')
      const IDS = ['integrations.1 the Integrations pane lists every declared service — not connected with Connect… opening the Credentials scope when nothing is stored, connected as its label with Verify when one is — and shows the broker audit rows under a service newest first, an empty audit as a sentence']
      const iLog = []
      const onI = (_e, _l, m) => { iLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onI)
      try {
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reI = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reI
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="integrations"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await settle()
        const bare = await waitUntil(() => wc.executeJavaScript(`(() => { const secs = [...document.querySelectorAll('[data-integration]')].map((s) => ({ id: s.getAttribute('data-integration'), state: s.getAttribute('data-integration-state'), sentence: s.querySelector('[data-integration-sentence]')?.textContent ?? '', verb: s.querySelector('[data-integration-verb]')?.textContent ?? '', empty: s.querySelector('[data-integration-audit-arm="empty"]')?.textContent ?? null })); return secs.length >= 2 ? secs : false })()`), 8000)
        // Connect… opens the palette in its Credentials scope.
        const clickedConnect = await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-integration="github"] [data-integration-verb]'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        // A timeline rather than one read: whether the chip ever appears, and when it leaves.
        const scope = await wc.executeJavaScript(`new Promise((resolve) => { const seen = []; let n = 0; const t = setInterval(() => { seen.push([document.querySelector('.palette') !== null, document.querySelector('.palette__scope')?.textContent ?? null, document.activeElement?.className ?? null]); if (++n >= 12) { clearInterval(t); resolve({ open: seen[seen.length - 1][0], chip: seen.find((x) => x[1] !== null)?.[1] ?? null, seen }) } }, 150) })`)
        await wc.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
        // A stored, verified credential and two audit rows.
        credentialStore.set('github', 'ghp_integrations_token_0000000000000000000000')
        credentialStore.setLabel('github', 'octocat')
        brokerAuditForChecks.append({ at: 1000, service: 'github', method: 'GET', path: '/user', status: 200, bytes: 12, panelId: 'n1' })
        brokerAuditForChecks.append({ at: 2000, service: 'github', method: 'POST', path: '/repos/o/r/issues', status: 0, bytes: 0, panelId: 'n1', reason: 'refused' })
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-integrations-refresh]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const auditSeen = await wc.executeJavaScript(`window.canvas.broker.audit(50).then((a) => ({ n: a.rows.length, first: a.rows[0] })).catch((e) => 'ERR ' + String(e))`)
        const connected = await waitUntil(() => wc.executeJavaScript(`(() => { const s = document.querySelector('[data-integration="github"]'); if (!s || s.getAttribute('data-integration-state') !== 'connected' || s.querySelectorAll('[data-integration-row]').length < 2) return false; return { sentence: s.querySelector('[data-integration-sentence]')?.textContent ?? '', verb: s.querySelector('[data-integration-verb]')?.textContent ?? '', rows: [...s.querySelectorAll('[data-integration-row]')].map((r) => r.getAttribute('data-integration-row')) } })()`), 8000)
        credentialStore.delete('github')
        ok(IDS[0],
          Array.isArray(bare) && bare.some((s) => s.id === 'github' && s.state === 'not-connected' && /not connected/.test(s.sentence) && /Connect/.test(s.verb) && typeof s.empty === 'string' && /no calls/.test(s.empty)) && bare.some((s) => s.id === 'jira') &&
            clickedConnect === true && scope && scope.open === true && scope.chip === 'Credentials' &&
            connected && /connected as octocat/.test(connected.sentence) && /Verify/.test(connected.verb) && connected.rows.length === 2 && /POST/.test(connected.rows[0]) && /GET/.test(connected.rows[1]),
          JSON.stringify({ bare, scope, connected, auditSeen, log: iLog.slice(-3) }))
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await settle()
      } catch (iErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(iErr && iErr.message || iErr) + ' | renderer: ' + (iLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onI)
      }
    }

    /* ---------------------------------------------------------------- */
    /* M198. Start work recovery — one item, one lane, one conversation  */
    /* ---------------------------------------------------------------- */
    {
      const IDS = [
        'start.recovery.1 simultaneous starts join one attempt, and starting the completed item again returns the same conversation without a second lane, chat or first send',
        'start.recovery.2 a worktree-created/chat-refused attempt records its reserved conversation and lane; retry reuses both and creates the missing conversation',
        'start.recovery.3 a refused first send keeps one visible conversation and lane; retry sends through that conversation and creates no duplicate'
      ]
      const repo = mkdtempSync(join(tmpdir(), 'tc panels recovery repo '))
      const originalCreate = registeredHandlers.get(IPC.AGENT_CREATE)
      const originalSend = registeredHandlers.get(IPC.AGENT_SEND)
      let refuseCreate = false, refuseSend = false, createCalls = 0, sendCalls = 0
      const restore = () => {
        ipcMain.removeHandler(IPC.AGENT_CREATE); ipcMain.handle(IPC.AGENT_CREATE, originalCreate)
        ipcMain.removeHandler(IPC.AGENT_SEND); ipcMain.handle(IPC.AGENT_SEND, originalSend)
      }
      try {
        const g = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
        g('init', '-q', '.'); g('config', 'user.email', 'v@e.com'); g('config', 'user.name', 'v')
        writeFileSync(join(repo, 'a.txt'), 'a\n'); g('add', '-A'); g('commit', '-qm', 'init')
        layoutStore.saveTeammate({ id: 'tm-recovery', name: 'recovery', brief: '', places: [repo], services: [], skills: [], memory: 'recovery', chats: [], messaging: false, scheduling: false })
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const ready = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await ready; await settle()
        ipcMain.removeHandler(IPC.AGENT_CREATE)
        ipcMain.handle(IPC.AGENT_CREATE, (event, request) => { createCalls += 1; return refuseCreate ? { kind: 'refused', reason: 'fixture refused conversation' } : originalCreate(event, request) })
        ipcMain.removeHandler(IPC.AGENT_SEND)
        ipcMain.handle(IPC.AGENT_SEND, (event, request) => { sendCalls += 1; if (refuseSend) { refuseSend = false; return 'refused-budget' } return originalSend(event, request) })
        const add = (title) => wc.executeJavaScript(`window.__m113.add({ source: 'typed', title: ${JSON.stringify(title)} })`)
        const dispatch = (id) => wc.executeJavaScript(`window.__m113.dispatch(${JSON.stringify(id)}, 'tm-recovery', ${JSON.stringify(repo)})`)
        const item = (id) => wc.executeJavaScript(`window.__m113.items().find((i) => i.id === ${JSON.stringify(id)})`)
        const counts = () => ({ lanes: layoutStore.worktrees().filter((w) => realpathSync(w.root) === realpathSync(repo)).length, createCalls, sendCalls })

        const firstId = await add('simultaneous recovery')
        const beforeFirst = counts()
        const simultaneous = await wc.executeJavaScript(`Promise.all([window.__m113.dispatch(${JSON.stringify(firstId)}, 'tm-recovery', ${JSON.stringify(repo)}), window.__m113.dispatch(${JSON.stringify(firstId)}, 'tm-recovery', ${JSON.stringify(repo)})])`)
        const firstRecord = await item(firstId)
        const afterPair = counts()
        const repeated = await dispatch(firstId)
        const afterRepeated = counts()
        ok(IDS[0], simultaneous[0]?.kind === 'started' && simultaneous[1]?.kind === 'started' && simultaneous[0].panelId === simultaneous[1].panelId && repeated?.kind === 'started' && repeated.panelId === firstRecord?.panelId && afterPair.lanes - beforeFirst.lanes === 1 && afterPair.createCalls - beforeFirst.createCalls === 2 && afterPair.sendCalls - beforeFirst.sendCalls === 1 && JSON.stringify(afterRepeated) === JSON.stringify(afterPair), JSON.stringify({ simultaneous, firstRecord, beforeFirst, afterPair, repeated, afterRepeated }))

        const createId = await add('create recovery')
        refuseCreate = true
        const createRefused = await dispatch(createId)
        refuseCreate = false
        const afterCreateRefusal = await item(createId)
        const laneAfterCreateRefusal = afterCreateRefusal?.worktreeId
        const createRetried = await dispatch(createId)
        const afterCreateRetry = await item(createId)
        ok(IDS[1], createRefused?.kind === 'refused' && /fixture refused/.test(createRefused.reason) && typeof afterCreateRefusal?.panelId === 'string' && typeof laneAfterCreateRefusal === 'string' && createRetried?.kind === 'started' && createRetried.panelId === afterCreateRefusal.panelId && afterCreateRetry?.worktreeId === laneAfterCreateRefusal && layoutStore.worktrees().filter((w) => w.panelId === afterCreateRefusal.panelId).length === 1, JSON.stringify({ createRefused, afterCreateRefusal, createRetried, afterCreateRetry }))

        const sendId = await add('send recovery')
        refuseSend = true
        const sendRefused = await dispatch(sendId)
        const afterSendRefusal = await item(sendId)
        const beforeSendRetry = counts()
        const sendRetried = await dispatch(sendId)
        const afterSendRetry = await item(sendId)
        const afterSendCounts = counts()
        ok(IDS[2], sendRefused?.kind === 'refused' && typeof afterSendRefusal?.panelId === 'string' && typeof afterSendRefusal?.worktreeId === 'string' && /first message was refused/.test(afterSendRefusal?.note ?? '') && sendRetried?.kind === 'started' && sendRetried.panelId === afterSendRefusal.panelId && afterSendRetry?.worktreeId === afterSendRefusal.worktreeId && afterSendCounts.lanes === beforeSendRetry.lanes && afterSendCounts.createCalls === beforeSendRetry.createCalls && afterSendCounts.sendCalls === beforeSendRetry.sendCalls + 1, JSON.stringify({ sendRefused, afterSendRefusal, sendRetried, afterSendRetry, beforeSendRetry, afterSendCounts }))
      } catch (e) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(e && e.message || e))
      } finally {
        restore()
        for (const lane of layoutStore.worktrees().filter((w) => realpathSync(w.root) === realpathSync(repo))) { try { await worktreeManager.remove(lane.id) } catch {} }
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        try { layoutStore.deleteTeammate('tm-recovery') } catch {}
        try { rmSync(repo, { recursive: true, force: true }) } catch {}
      }
    }

    /* ---------------------------------------------------------------- */
    /* M90. The second headless backend: the sheet's row and the panel   */
    /* ---------------------------------------------------------------- */
    {
      const IDS = ['codex.1 the sheet offers `chat with codex` beside claude (disabled BY NAME when codex is absent), a chat minted from it paints `codex` as its kind word with Interrupt disabled by codex\'s own reason and the terminal door refused by name, its record carries backend: codex on disk, and a claude chat\'s record carries no backend key at all']
      const cLog = []
      const onC = (_e, _l, m) => { cLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onC)
      const dirC = mkdtempSync(join(tmpdir(), 'tc panels codex-'))
      try {
        // The harness PATH holds no codex; a user preset naming the codex
        // agent over a command that exists is what makes the row available —
        // the same door the composer-claude preset uses for claude.
        layoutStore.addPreset({ id: 'codex-sheet', name: 'Codex (sheet)', cwd: '~', command: '/bin/sh', args: [], agent: 'codex' })
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reC = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reC
        await settle()
        const codexOnPath = await wc.executeJavaScript(`window.canvas.preset.list().then((rows) => rows.some((r) => r.agent === 'codex' && r.available))`)
        const set = (sel, value) => wc.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false
          const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
          el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true })()`)
        const submitSheet = () => wc.executeJavaScript(`(() => { const w = document.querySelector('[data-sheet-where]'); if (!w) return false; w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        const chatCount = () => wc.executeJavaScript(`document.querySelectorAll('.panel[data-chat-status]').length`)
        win.webContents.send(IPC_EVENTS.SPAWN_OPEN_SHEET)
        const option = await waitUntil(() => wc.executeJavaScript(`(() => { const o = document.querySelector('[data-sheet-what] option[data-sheet-codex]'); return o ? { text: o.textContent, disabled: o.disabled, value: o.value } : false })()`), 4000)
        let minted = false
        if (option && option.disabled === false) {
          await set('[data-sheet-what]', option.value)
          await set('[data-sheet-where]', dirC)
          await submitSheet()
          minted = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-chat-status]'); if (!p) return false
            const word = p.querySelector('[data-chat-backend]'); const interrupt = p.querySelector('[data-chat-interrupt]'); const door = p.querySelector('[data-open-in-terminal]')
            return { id: p.getAttribute('data-panel-id'), backend: word ? word.getAttribute('data-chat-backend') : null, wordText: word ? word.textContent : null, interruptDisabled: interrupt ? interrupt.disabled : null, interruptTitle: interrupt ? interrupt.title : null, doorDisabled: door ? door.disabled : null, doorTitle: door ? door.title : null, empty: p.querySelector('[data-chat-empty]')?.textContent ?? null, refusal: p.querySelector('[data-chat-refusal]')?.textContent ?? null, bodyText: (p.querySelector('.chat__transcript')?.textContent ?? '').slice(0, 160) } })()`), 6000)
        } else {
          await wc.executeJavaScript(`(() => { const s = document.querySelector('[data-spawn-sheet]'); if (s) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return !!s })()`)
        }
        await settle()
        // A claude chat beside it through the SAME sheet, so the two records can be compared on disk.
        const before = await chatCount()
        win.webContents.send(IPC_EVENTS.SPAWN_OPEN_SHEET)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-spawn-sheet]') !== null`), 4000)
        await set('[data-sheet-what]', '__chat__')
        await set('[data-sheet-where]', dirC)
        await submitSheet()
        const claudeMinted = await waitUntil(async () => (await chatCount()) === before + 1, 6000)
        await settle()
        layoutStore.flushSync()
        const stored = (layoutStore.initial().panels || []).filter((p) => p.kind === 'chat').map((p) => ({ id: p.id, backend: p.chat && p.chat.backend, hasKey: !!(p.chat && Object.prototype.hasOwnProperty.call(p.chat, 'backend')) }))
        const codexStored = minted === false ? null : stored.find((p) => p.id === minted.id)
        const claudeStored = stored.find((p) => p.backend === undefined)
        // The sheet's row is the assertion on EVERY machine; the minted half only where codex is installed.
        const rowOk = option && /chat with codex/.test(option.text) && option.disabled === !codexOnPath && (codexOnPath || /not on PATH/.test(option.text))
        const mintedOk = !codexOnPath || (minted && minted.backend === 'codex' && minted.wordText === 'codex' && minted.interruptDisabled === true && /nothing is in flight/.test(minted.interruptTitle || '') && minted.doorDisabled === true && /codex/.test(minted.doorTitle || '') &&
          codexStored && codexStored.backend === 'codex')
        ok(IDS[0], rowOk && mintedOk && claudeMinted === true && claudeStored !== undefined && claudeStored.hasKey === false,
          JSON.stringify({ codexOnPath, option, minted, stored, claudeMinted, log: cLog.slice(-3) }))
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reC2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reC2
        await settle()
        try { layoutStore.deletePreset('codex-sheet') } catch {}
      } catch (cErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(cErr && cErr.message || cErr) + ' | renderer: ' + (cLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onC)
        try { rmSync(dirC, { recursive: true, force: true }) } catch {}
      }
    }

    /* ---------------------------------------------------------------- */
    /* M114. Dispatch — the one verb, end to end through the fake runner  */
    /* ---------------------------------------------------------------- */
    {
      const IDS = ['dispatch.1 a GitHub item dispatched to a teammate whose place holds a clone of its repository mints a REAL worktree lane (the record names the chat and the worktree, the chat\'s record carries dispatch: true on disk and its cwd is the lane), the chat paints its backend word, the item reads working after the fake runner\'s first turn — never from the click — and closing the lane chat leaves the state working with the note `lane closed` and the panel id kept, never silently back to todo']
      const cLog = []
      const onC = (_e, _l, m) => { cLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onC)
      const repoD = mkdtempSync(join(tmpdir(), 'tc panels board repo '))
      try {
        const g = (...args) => execFileSync('git', ['-C', repoD, ...args], { encoding: 'utf8' })
        g('init', '-q', '.'); g('config', 'user.email', 'v@e.com'); g('config', 'user.name', 'v')
        writeFileSync(join(repoD, 'a.txt'), 'a\n'); g('add', '-A'); g('commit', '-qm', 'init')
        g('remote', 'add', 'origin', 'git@github.com:Acme/Canvas.git')
        layoutStore.saveTeammate({ id: 'tm-ada', name: 'ada', brief: 'You are ada.', places: [repoD], services: [], skills: [], memory: 'ada', chats: [], messaging: false, scheduling: false })
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reD = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reD
        await settle()
        const chatCount = () => wc.executeJavaScript(`document.querySelectorAll('.panel[data-chat-status]').length`)
        const before = await chatCount()
        const itemId = await wc.executeJavaScript(`window.__m113 ? window.__m113.add({ source: 'github', key: 'acme/canvas#1', title: 'Fix the thing', url: 'https://github.com/acme/canvas/issues/1', description: 'do it' }) : null`)
        const stateAtClick = await wc.executeJavaScript(`window.__m113 ? (window.__m113.items().find((i) => i.id === ${JSON.stringify(itemId)}) || {}).state : null`)
        // The card on the canvas FIRST, so the dispatch has a source for its edge.
        await wc.executeJavaScript(`window.__m113 ? window.__m113.show(${JSON.stringify(itemId)}) : null`)
        const cardId = await waitUntil(() => wc.executeJavaScript(`(() => { const c = document.querySelector('.panel[data-panel-kind="work"]'); return c ? c.getAttribute('data-panel-id') : false })()`), 4000)
        await wc.executeJavaScript(`window.__m113 ? window.__m113.dispatch(${JSON.stringify(itemId)}, 'tm-ada') : null`)
        const chat = await waitUntil(async () => {
          if ((await chatCount()) !== before + 1) return false
          return wc.executeJavaScript(`(() => { const p = [...document.querySelectorAll('.panel[data-chat-status]')].pop(); if (!p) return false
            const word = p.querySelector('[data-chat-backend]'); return { id: p.getAttribute('data-panel-id'), backend: word ? word.getAttribute('data-chat-backend') : null } })()`)
        }, 8000)
        // The record, on disk: the chat and the worktree named; the lane's record in the worktree list.
        const recorded = await waitUntil(() => {
          layoutStore.flushSync()
          const it = (layoutStore.initial().workItems || []).find((i) => i.id === itemId)
          return it && it.panelId && it.worktreeId ? it : false
        }, 6000)
        const lane = chat ? layoutStore.worktrees().find((w) => w.panelId === chat.id) : undefined
        // The edge: card → chat, labelled `dispatched`, with NO automation — a statement, not a trigger.
        const cardStored = cardId ? (layoutStore.initial().panels || []).find((p) => p.id === cardId) : undefined
        const edge = cardStored && Array.isArray(cardStored.links) ? cardStored.links.find((l) => chat && l.to === chat.id) : undefined
        const anchored = recorded && recorded.anchor && chat && recorded.anchor.panelId === chat.id
        const storedChat = chat ? (layoutStore.initial().panels || []).find((p) => p.id === chat.id) : undefined
        // `working` comes from the runtime: the fake runner answers the first send, and the first message-start flips the word.
        const working = await waitUntil(() => {
          layoutStore.flushSync()
          const it = (layoutStore.initial().workItems || []).find((i) => i.id === itemId)
          return it && it.state === 'working' ? it : false
        }, 8000)
        // Close the lane chat through the ordinary close path.
        if (chat) await wc.executeJavaScript(`window.__m113.close(${JSON.stringify(chat.id)})`)
        const closed = await waitUntil(() => {
          layoutStore.flushSync()
          const it = (layoutStore.initial().workItems || []).find((i) => i.id === itemId)
          return it && it.note ? it : false
        }, 6000)
        // done is the user's: the verb, then the word.
        await wc.executeJavaScript(`window.__m113.done(${JSON.stringify(itemId)})`)
        const done = await waitUntil(() => { layoutStore.flushSync(); const it = (layoutStore.initial().workItems || []).find((i) => i.id === itemId); return it && it.state === 'done' ? it : false }, 4000)
        ok(IDS[0],
          typeof itemId === 'string' && stateAtClick === 'todo' && typeof cardId === 'string' && chat && chat.backend === 'claude' &&
            edge && edge.label === 'dispatched' && edge.automation === undefined && anchored &&
            recorded && recorded.panelId === chat.id && recorded.teammateId === 'tm-ada' && lane !== undefined && recorded.worktreeId === lane.id && realpathSync(lane.root) === realpathSync(repoD) &&
            storedChat && storedChat.kind === 'chat' && storedChat.chat.dispatch === true && storedChat.chat.teammateId === 'tm-ada' && storedChat.chat.cwd === lane.path &&
            working && working.state === 'working' &&
            closed && closed.note === 'lane closed' && closed.state === 'working' && closed.panelId === chat.id && closed.anchor === undefined &&
            done && done.state === 'done',
          JSON.stringify({ itemId, stateAtClick, cardId, edge, anchored, done: done && done.state, chat, recorded, lane: lane && { id: lane.id, root: lane.root, path: lane.path }, storedChat: storedChat && storedChat.chat, working: working && working.state, closed, log: cLog.slice(-4) }))
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        try { layoutStore.deleteTeammate('tm-ada') } catch {}
        const reD2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reD2
        await settle()
      } catch (dErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(dErr && dErr.message || dErr) + ' | renderer: ' + (cLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onC)
        try { rmSync(repoD, { recursive: true, force: true }) } catch {}
      }
    }

    /* ---------------------------------------------------------------- */
    /* M197 (D05). Start work — one action, and the typed door reaches a  */
    /* lane at all for the first time                                     */
    /* ---------------------------------------------------------------- */
    {
      const IDS = [
        'start.door.1 the palette\'s Start work… row opens the sheet with nothing pre-filled, the agent field offers every teammate with a placeless one DISABLED by name (a grant, never widened from here), and choosing a teammate reads the repositories under its places from main — the same bounded walk the lane makes',
        'start.door.2 a TYPED item — which names no repository, and which board:lane refused with a sentence naming a door that did not exist — reaches a REAL worktree lane through the sheet\'s repository choice: the record carries the chat and the worktree, and the lane\'s root is the chosen repository',
        'start.answer.1 a start whose repository the teammate may not touch is REFUSED IN THE SHEET by name and mints nothing, and the agent door\'s dispatch verb answers `refused` with the same sentence rather than reporting `ran` before the work could fail'
      ]
      const sLog = []
      const onS = (_e, _l, m) => { sLog.push(String(m).slice(0, 220)) }
      wc.on('console-message', onS)
      const repoS = mkdtempSync(join(tmpdir(), 'tc panels start repo '))
      const outside = mkdtempSync(join(tmpdir(), 'tc panels start outside '))
      try {
        const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
        for (const d of [repoS, outside]) {
          g(d, 'init', '-q', '.'); g(d, 'config', 'user.email', 'v@e.com'); g(d, 'config', 'user.name', 'v')
          writeFileSync(join(d, 'a.txt'), 'a\n'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'init')
        }
        layoutStore.saveTeammate({ id: 'tm-sw', name: 'sam', brief: 'You are sam.', places: [repoS], services: [], skills: [], memory: 'sam', chats: [], messaging: false, scheduling: false })
        layoutStore.saveTeammate({ id: 'tm-none', name: 'nell', brief: '', places: [], services: [], skills: [], memory: 'nell', chats: [], messaging: false, scheduling: false })
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reS = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reS
        await settle()

        // ---- start.door.1: the palette row, the sheet, the agent field ----
        await wc.executeJavaScript(`window.__m113 ? window.__m113.start() : null`)
        const sheetUp = await waitUntil(() => wc.executeJavaScript(`(() => { const s = document.querySelector('[data-start-sheet]'); if (!s) return false
          const task = s.querySelector('[data-start-task]'); const agent = s.querySelector('[data-start-agent]')
          return { task: task ? (task.value !== undefined ? task.value : task.textContent) : null,
                   fixed: !!s.querySelector('[data-start-task-fixed]'),
                   rows: [...agent.options].map((o) => ({ v: o.value, t: o.textContent, d: o.disabled })),
                   repoDisabled: s.querySelector('[data-start-repo]').disabled } })()`), 5000)
        // Choosing the teammate reads main's answer; the repository field then
        // offers the clone under its place.
        await wc.executeJavaScript(`(() => { const sel = document.querySelector('[data-start-agent]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
          set.call(sel, 'tm-sw'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
        const repoRows = await waitUntil(() => wc.executeJavaScript(`(() => { const o = [...document.querySelectorAll('[data-start-repo] option[data-start-repo-row]')]
          return o.length > 0 ? o.map((x) => x.getAttribute('data-start-repo-row')) : false })()`), 6000)
        ok(IDS[0],
          sheetUp && sheetUp.task === '' && sheetUp.fixed === false && sheetUp.repoDisabled === true &&
            sheetUp.rows.some((r) => r.v === 'tm-sw' && !r.d) &&
            sheetUp.rows.some((r) => r.v === 'tm-none' && r.d && /no places/.test(r.t)) &&
            Array.isArray(repoRows) && repoRows.some((p) => realpathSync(p) === realpathSync(repoS)),
          JSON.stringify({ sheetUp, repoRows, log: sLog.slice(-3) }))

        // ---- start.door.2: the typed item reaches a lane ----
        const chatCountS = () => wc.executeJavaScript(`document.querySelectorAll('.panel[data-chat-status]').length`)
        const beforeS = await chatCountS()
        await wc.executeJavaScript(`(() => { const s = document.querySelector('[data-start-sheet]'); const t = s.querySelector('[data-start-task]')
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          set.call(t, 'try the new parser'); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        const chosen = repoRows && repoRows.find((p) => realpathSync(p) === realpathSync(repoS))
        await wc.executeJavaScript(`(() => { const sel = document.querySelector('[data-start-repo]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
          set.call(sel, ${JSON.stringify(chosen)}); sel.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
        await wc.executeJavaScript(`(() => { const s = document.querySelector('[data-start-sheet]'); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true })()`)
        const startedChat = await waitUntil(async () => {
          if ((await chatCountS()) !== beforeS + 1) return false
          return wc.executeJavaScript(`(() => { const p = [...document.querySelectorAll('.panel[data-chat-status]')].pop(); return p ? p.getAttribute('data-panel-id') : false })()`)
        }, 10000)
        const typedRec = await waitUntil(() => {
          layoutStore.flushSync()
          const it = (layoutStore.initial().workItems || []).find((i) => i.source === 'typed' && i.title === 'try the new parser')
          return it && it.panelId && it.worktreeId ? it : false
        }, 8000)
        const typedLane = typedRec ? layoutStore.worktrees().find((w) => w.id === typedRec.worktreeId) : undefined
        ok(IDS[1],
          typeof startedChat === 'string' && typedRec && typedRec.panelId === startedChat && typedRec.teammateId === 'tm-sw' &&
            typedLane !== undefined && realpathSync(typedLane.root) === realpathSync(repoS),
          JSON.stringify({ startedChat, typedRec, typedLane: typedLane && { id: typedLane.id, root: typedLane.root, path: typedLane.path }, log: sLog.slice(-4) }))

        // ---- start.answer.1: a refusal is SAID, in the sheet and to the agent ----
        // The Places gate refuses a root outside every place; the sheet shows
        // the sentence and nothing is minted, and the agent's own door
        // answers `refused` rather than `ran`.
        const beforeRefused = await chatCountS()
        const sheetRefusal = await wc.executeJavaScript(`(async () => {
          const r = await window.canvas.board.lane({ itemId: 'x', chatPanelId: 'probe-no-mint', teammateId: 'tm-sw', root: ${JSON.stringify(outside)} })
          return r })()`)
        // The AGENT door, through `canvas:plan` — the same executor the
        // palette takes (M180). Before M197 this arm called the void verb and
        // answered `ran` in the same breath, so every refusal below happened
        // after the answer had already been given.
        // `nell` BINDS (the roster holds her) and then the start FAILS: she
        // has no places, so a typed item names no repository she could work
        // it in. That refusal happens inside the awaited executor — which is
        // precisely the ground the verb used to answer `ran` over, before the
        // work could fail. A refusal that binding alone could produce would
        // not test this; `nobody-at-all` was one, and is not what runs here.
        const startedItemId = typedRec ? typedRec.id : ''
        const planAnswer = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `dispatch ${startedItemId} nell` }, null, 8000)
        const afterRefused = await chatCountS()
        ok(IDS[2],
          sheetRefusal && sheetRefusal.kind === 'refused' && /may not|place/i.test(sheetRefusal.reason) &&
            planAnswer && planAnswer.kind === 'refused' && /nell/.test(planAnswer.reason) && /which place|no places/i.test(planAnswer.reason) &&
            afterRefused === beforeRefused,
          JSON.stringify({ sheetRefusal, planAnswer, beforeRefused, afterRefused, log: sLog.slice(-4) }))

        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        try { layoutStore.deleteTeammate('tm-sw') } catch {}
        try { layoutStore.deleteTeammate('tm-none') } catch {}
        const reS2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reS2
        await settle()
      } catch (sErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(sErr && sErr.message || sErr) + ' | renderer: ' + (sLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onS)
        for (const d of [repoS, outside]) { try { rmSync(d, { recursive: true, force: true }) } catch {} }
      }
    }

    /* ---------------------------------------------------------------- */
    /* M118. The sheet's copilot and acp rows, from the registry          */
    /* ---------------------------------------------------------------- */
    {
      const IDS = ['copilot.1 the sheet offers `chat with copilot` and `chat with copilot (acp)` beside claude and codex, each disabled BY NAME (`— not on PATH`) when the binary is absent from the harness PATH, and never dropped']
      try {
        win.webContents.send(IPC_EVENTS.SPAWN_OPEN_SHEET)
        const rows = await waitUntil(() => wc.executeJavaScript(`(() => { const o = [...document.querySelectorAll('[data-sheet-what] option[data-sheet-backend]')]; return o.length >= 4 ? o.map((x) => ({ id: x.getAttribute('data-sheet-backend'), text: x.textContent, disabled: x.disabled })) : false })()`), 4000)
        const cp = rows && rows.find((r) => r.id === 'copilot'), acp = rows && rows.find((r) => r.id === 'acp')
        ok(IDS[0], rows && rows.map((r) => r.id).join(',') === 'claude,codex,copilot,acp' && cp && /chat with copilot/.test(cp.text) && cp.disabled === true && /PATH/.test(cp.text) && acp && /copilot \(acp\)/.test(acp.text) && acp.disabled === true,
          JSON.stringify({ rows }))
        await wc.executeJavaScript(`(() => { const s = document.querySelector('[data-spawn-sheet]'); if (s) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return !!s })()`)
        await settle()
      } catch (e) { for (const id of IDS) ok(id, false, 'threw: ' + String(e && e.message || e)) }
    }

    /* ---------------------------------------------------------------- */
    /* M124 — reach.2. A real Tab through the Board pane and the card    */
    /* ---------------------------------------------------------------- */
    {
      const IDS = ['reach.2 a real Tab from the Board pane\'s first row (the todo column\'s) visits its Show on canvas and then the working row, and from the card\'s first verb visits every ENABLED verb in order (a disabled Open PR is skipped, which is right) — the surfaces M113–M116 added are in the tab order, not click-only']
      try {
        const now = Date.now()
        layoutStore.save({
          panels: [{ id: 'rk2', kind: 'work', x: 200, y: 200, w: 420, h: 200, z: 1, title: 'Fix the flush gate', work: { itemId: 'wi-r1' } }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
          workItems: [
            { id: 'wi-r1', source: 'github', key: 'acme/canvas#7', title: 'Fix the flush gate', url: 'https://github.com/acme/canvas/issues/7', state: 'working', teammateId: 'tm-r', panelId: 'gone', worktreeId: 'wt-r', createdAt: now, updatedAt: now },
            { id: 'wi-r2', source: 'typed', title: 'Write the release notes', state: 'todo', createdAt: now - 1, updatedAt: now - 1 }
          ]
        })
        flushLayoutStore()
        const reR2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reR2
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="board"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('[data-board-row]').length === 2`), 6000)
        const tabWalk2 = async (startSel, identity, max) => {
          const started = await wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(startSel)}); if (!b) return 'no control'; if (b.disabled) return 'disabled'; b.focus(); return document.activeElement === b })()`)
          if (started !== true) return { started, visited: [] }
          const read = () => wc.executeJavaScript(`(() => { const el = document.activeElement; if (!el) return null; const id = (() => { ${identity} })(); return id ?? ('#' + (el.className || el.tagName)) })()`)
          const visited = [await read()]
          for (let i = 0; i < max; i++) {
            wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
            await sleep(60)
            const at = await read()
            if (at === visited[0]) break
            visited.push(at)
          }
          return { started, visited }
        }
        const identity = `const row = el.closest('[data-board-row]'); if (row && el.classList.contains('rail-row__main')) return 'row:' + row.getAttribute('data-board-row'); if (el.hasAttribute('data-board-show')) return 'show:' + (row ? row.getAttribute('data-board-row') : '?'); if (el.hasAttribute('data-work-verb')) return 'verb:' + el.getAttribute('data-work-verb'); return null`
        // The FIRST row in DOM order: the todo column comes first, and Tab walks forward — starting at the working row would leave the pane at once.
        const pane = await tabWalk2('[data-board-row="wi-r2"] .rail-row__main', identity, 10)
        const card = await tabWalk2('[data-work-verb="assign"]', identity, 10)
        const enabledVerbs = await wc.executeJavaScript(`[...document.querySelectorAll('[data-work-verb]')].filter((b) => !b.disabled).map((b) => 'verb:' + b.getAttribute('data-work-verb'))`)
        ok(IDS[0], pane.started === true && pane.visited[0] === 'row:wi-r2' && pane.visited.includes('show:wi-r2') && pane.visited.includes('row:wi-r1') && pane.visited.indexOf('show:wi-r2') < pane.visited.indexOf('row:wi-r1') &&
          // The floor moved from 3 to 2 at M202 (D07), deliberately: `Review`
          // used to be enabled whenever the item had a lane, and is now
          // enabled only when there is something SETTLED to review — this
          // fixture's card has no worktree, so it reads `not started` and
          // refuses by name. The subject of this check is the TAB ORDER,
          // which is unchanged and still asserted in full below.
          card.started === true && Array.isArray(enabledVerbs) && enabledVerbs.length >= 2 && enabledVerbs.every((v) => card.visited.includes(v)) && enabledVerbs.map((v) => card.visited.indexOf(v)).every((idx, i, arr) => i === 0 || idx > arr[i - 1]),
          JSON.stringify({ pane, card, enabledVerbs }))
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
        const reR3 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reR3
        await settle()
      } catch (e) { for (const id of IDS) ok(id, false, 'threw: ' + String(e && e.message || e)) }
    }

    /* ---------------------------------------------------------------- */
    /* M91. The launcher's verbs as invitations, and the codex door       */
    /* ---------------------------------------------------------------- */
    {
      const IDS = ['launcher-codex.1 on an empty canvas every launcher preset verb reads as an invitation (`Start …`), and the `Chat with codex…` door is PRESENT and disabled by name when codex is absent']
      try {
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reL = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reL
        await settle()
        const seen = await waitUntil(() => wc.executeJavaScript(`(() => { const l = document.querySelector('[data-launcher]'); if (!l) return false
          const presets = [...l.querySelectorAll('[data-launcher-preset] .launcher__verb-name')].map((n) => n.textContent)
          const codex = l.querySelector('[data-launcher-new-codex]')
          return { presets, codex: codex ? { disabled: codex.disabled, title: codex.title, hint: codex.querySelector('.launcher__verb-hint')?.textContent ?? '' } : null } })()`), 6000)
        ok(IDS[0], seen && seen.presets.length > 0 && seen.presets.every((t) => /^Start .+…$/.test(t)) &&
          seen.codex !== null && seen.codex.disabled === true && /codex/.test(seen.codex.title) && /PATH/.test(seen.codex.hint),
          JSON.stringify(seen))
      } catch (lErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(lErr && lErr.message || lErr))
      }
    }

    /* ---------------------------------------------------------------- */
    /* M92. Lock, pin and maximise through the real surfaces             */
    /* ---------------------------------------------------------------- */
    {
      const IDS = ['lockpin.1 a locked panel does not move under a real chrome drag while its handles and close stay; a pinned panel carries its mark and stays live; maximise fills the host inset by the margin with a restore rect, the chrome control reads restore, Restore puts it back, and both are single undo entries; every row and mark names its state']
      const lLog = []
      const onL = (_e, _l, m) => { lLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onL)
      try {
        layoutStore.save({ panels: [
          { id: 'lkA', x: 200, y: 200, w: 520, h: 340, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'] },
          { id: 'lkB', x: 900, y: 200, w: 520, h: 340, z: 2, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'] }
        ], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'lkA', focusedId: 'lkA' })
        flushLayoutStore()
        const reL = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reL
        await settle()
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="lkA"] .panel__slot') !== null`), 8000)
        const openP = async () => {
          await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
          return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        }
        const closeP = () => wc.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
        const rowState = async (rowId) => {
          const opened = await openP()
          if (opened !== true) return 'no palette'
          const r = await wc.executeJavaScript(`(() => { const el = document.querySelector('[data-command-id=' + JSON.stringify(${JSON.stringify(rowId)}) + ']'); if (!el) return 'no row'; return el.className.includes('palette__row--disabled') ? 'disabled: ' + (el.getAttribute('title') || el.textContent || '') : 'enabled' })()`)
          await closeP(); await settle()
          return r
        }
        const runRow = async (rowId) => {
          const opened = await openP()
          if (opened !== true) return 'no palette'
          const r = await wc.executeJavaScript(`(() => {
            const el = document.querySelector('[data-command-id=' + JSON.stringify(${JSON.stringify(rowId)}) + ']')
            if (!el) return 'no row'
            if (el.className.includes('palette__row--disabled')) return 'disabled: ' + (el.getAttribute('title') || el.textContent)
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
            return true })()`)
          await settle()
          return r
        }
        const rectOf = (id) => wc.executeJavaScript(`(() => { const el = document.querySelector('.panel[data-panel-id="${id}"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
        const chromeOf = (id) => wc.executeJavaScript(`(() => { const el = document.querySelector('.panel[data-panel-id="${id}"] .pf__chrome'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } })()`)
        // Focus lkA by a real click on its chrome so the palette captures it.
        const c0 = await chromeOf('lkA')
        wc.sendInputEvent({ type: 'mouseDown', x: c0.x, y: c0.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: c0.x, y: c0.y, button: 'left', clickCount: 1 })
        await settle()
        const unlockBefore = await rowState('panel.unlock')
        const locked = await runRow('panel.lock')
        const mark = await waitUntil(() => wc.executeJavaScript(`(() => { const m = document.querySelector('.panel[data-panel-id="lkA"] [data-panel-locked]'); return m ? { title: m.title, handles: document.querySelectorAll('.panel[data-panel-id="lkA"] .pf__handle, .panel[data-panel-id="lkA"] .panel__handle').length, close: document.querySelector('.panel[data-panel-id="lkA"] .pf__close') !== null } : false })()`), 4000)
        const before = await rectOf('lkA')
        const c1 = await chromeOf('lkA')
        wc.sendInputEvent({ type: 'mouseDown', x: c1.x, y: c1.y, button: 'left', clickCount: 1 })
        // leftButtonDown, or the drag hook reads the move as a release (the harness's own lesson).
        for (let i = 1; i <= 6; i++) { wc.sendInputEvent({ type: 'mouseMove', x: c1.x + i * 25, y: c1.y + i * 15, button: 'left', modifiers: ['leftButtonDown'] }); await sleep(40) }
        wc.sendInputEvent({ type: 'mouseUp', x: c1.x + 150, y: c1.y + 90, button: 'left', clickCount: 1 })
        await settle()
        const after = await rectOf('lkA')
        const lockAgain = await rowState('panel.lock')
        // Pin.
        const pinned = await runRow('panel.pin')
        const pinMark = await waitUntil(() => wc.executeJavaScript(`(() => { const m = document.querySelector('.panel[data-panel-id="lkA"] [data-panel-pinned]'); return m ? { title: m.title } : false })()`), 4000)
        layoutStore.flushSync()
        const stored = (layoutStore.initial().panels || []).find((p) => p.id === 'lkA')
        // Maximise, through the chrome control, and Restore through the row.
        const host = await wc.executeJavaScript(`(() => { const h = document.querySelector('.canvas'); const r = h.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
        const clickedFill = await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="lkA"] [data-panel-maximise="maximise"]'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        await settle()
        const maxRect = await rectOf('lkA')
        const control = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="lkA"] [data-panel-maximise]')?.getAttribute('data-panel-maximise') ?? null`)
        const restored = await runRow('panel.restore')
        const backRect = await rectOf('lkA')
        // Undo: one entry for restore, one for maximise.
        wc.send('edit:undo'); await settle()
        const undoOnce = await rectOf('lkA')
        wc.send('edit:undo'); await settle()
        const undoTwice = await rectOf('lkA')
        const near = (a, b, tol = 2) => a !== null && b !== null && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol
        const fills = maxRect !== null && Math.abs(maxRect.x - (host.x + 16)) <= 2 && Math.abs(maxRect.y - (host.y + 16)) <= 2 && Math.abs(maxRect.w - (host.w - 32)) <= 2 && Math.abs(maxRect.h - (host.h - 32)) <= 2
        ok(IDS[0],
          /not locked/.test(unlockBefore) && locked === true && mark && /Unlock/.test(mark.title) && mark.close === true &&
            near(before, after) && /already locked/.test(lockAgain) &&
            pinned === true && pinMark && /Unpin/.test(pinMark.title) && stored && stored.locked === true && stored.pinned === true &&
            clickedFill === true && fills && control === 'restore' && restored === true && near(backRect, before) &&
            near(undoOnce, maxRect) && near(undoTwice, before),
          JSON.stringify({ unlockBefore, locked, mark, before, after, lockAgain, pinned, pinMark, stored: stored && { locked: stored.locked, pinned: stored.pinned }, host, clickedFill, maxRect, control, restored, backRect, undoOnce, undoTwice, log: lLog.slice(-3) }))
        await wc.executeJavaScript(`window.__m4aSessions ? null : null`)
        for (const id of ['lkA', 'lkB']) { try { await ptyManager.kill(id) } catch {} }
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reL2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reL2
        await settle()
      } catch (lErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(lErr && lErr.message || lErr) + ' | renderer: ' + (lLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onL)
      }
    }

    /* ---------------------------------------------------------------- */
    /* M93. The canvas as a document: annotations and the time machine    */
    /* ---------------------------------------------------------------- */
    {
      const IDS = [
        'annot.1 Annotate… enters a loud mode with its exit on the strip; a real click on the ground places a world note and one on a panel places a panel note, each typed in place and saved on disk with its anchor; the panel note follows a drag; Delete removes the selected note; the mode is refused by name while merged',
        'history.1 the Workspaces pane lists the snapshots the ring kept (three states), and Restore mints a NEW workspace beside the current one with re-minted ids, switches to it, and leaves the original workspace untouched'
      ]
      const aLog = []
      const onA = (_e, _l, m) => { aLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onA)
      try {
        layoutStore.save({ panels: [
          { id: 'anA', x: 300, y: 300, w: 520, h: 340, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'] }
        ], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'anA', focusedId: 'anA' })
        flushLayoutStore()
        const reA = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reA
        await settle()
        // Live, so the drag half drags a panel and not a card that wakes on mousedown.
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="anA"] .panel__slot') !== null`), 8000)
        const openP = async () => {
          await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
          return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        }
        const runRow = async (rowId) => {
          const opened = await openP()
          if (opened !== true) return 'no palette'
          const r = await wc.executeJavaScript(`(() => {
            const el = document.querySelector('[data-command-id=' + JSON.stringify(${JSON.stringify(rowId)}) + ']')
            if (!el) return 'no row'
            if (el.className.includes('palette__row--disabled')) return 'disabled: ' + (el.getAttribute('title') || el.textContent)
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
            return true })()`)
          await settle()
          return r
        }
        const entered = await runRow('canvas.annotate')
        const strip = await waitUntil(() => wc.executeJavaScript(`(() => { const s = document.querySelector('[data-annotate-strip]'); return s ? { text: s.textContent, done: s.querySelector('[data-annotate-done]') !== null, cursor: getComputedStyle(document.querySelector('.canvas')).cursor } : false })()`), 3000)
        const host = await wc.executeJavaScript(`(() => { const c = document.querySelector('.canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left, y: r.top } })()`)
        if (host === null) throw new Error('stage host: no .canvas')
        // A world note: a real click on empty ground, then type and Enter.
        wc.sendInputEvent({ type: 'mouseDown', x: host.x + 60, y: host.y + 60, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: host.x + 60, y: host.y + 60, button: 'left', clickCount: 1 })
        const editor1 = await waitUntil(() => wc.executeJavaScript(`document.activeElement && document.activeElement.hasAttribute('data-annotation-editor')`), 3000)
        for (const ch of 'first note') wc.sendInputEvent({ type: 'char', keyCode: ch })
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
        const world = await waitUntil(() => wc.executeJavaScript(`(() => { const g = document.querySelector('[data-annotation][data-annotation-kind="world"]'); return g ? g.querySelector('[data-annotation-label]')?.textContent ?? null : false })()`), 3000)
        // A panel note: a click inside the panel's slot.
        // The restored panel is a CARD (dormant); the note lands on its frame, below the chrome.
        const slot = await wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="anA"]'); if (!p) return null; const r = p.getBoundingClientRect(); return { x: r.left + 60, y: r.top + 80 } })()`)
        if (slot === null) throw new Error('stage slot: panel anA gone; panels=' + JSON.stringify(await wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-id]')].map((p) => p.getAttribute('data-panel-id'))`)))
        wc.sendInputEvent({ type: 'mouseDown', x: slot.x, y: slot.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: slot.x, y: slot.y, button: 'left', clickCount: 1 })
        await waitUntil(() => wc.executeJavaScript(`document.activeElement && document.activeElement.hasAttribute('data-annotation-editor')`), 3000)
        for (const ch of 'on the panel') wc.sendInputEvent({ type: 'char', keyCode: ch })
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
        // M180. Return is queued input: the annotation group exists while its
        // editor is still mounted. Wait for the label, not just its group;
        // throwing here skips history.1 and lets the pending note save replace
        // the following ink fixture. Keep the first read in the diagnostic.
        const panelNoteReadiness = await wc.executeJavaScript(`(() => { const g = document.querySelector('[data-annotation][data-annotation-kind="panel"]'); return { group: !!g, editor: !!g?.querySelector('[data-annotation-editor]'), label: !!g?.querySelector('[data-annotation-label]') } })()`)
        const panelNote = await waitUntil(() => wc.executeJavaScript(`(() => { const g = document.querySelector('[data-annotation][data-annotation-kind="panel"]'); const label = g?.querySelector('[data-annotation-label]'); if (!label) return false; const r = label.getBoundingClientRect(); return { text: label.textContent, x: r.left, y: r.top, leader: g.querySelector('.annotation__leader') !== null } })()`), 3000)
        // Leave the mode, drag the panel, and the panel note follows.
        await wc.executeJavaScript(`document.querySelector('[data-annotate-done]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); true`)
        await settle()
        const stripGone = await wc.executeJavaScript(`document.querySelector('[data-annotate-strip]') === null`)
        const chrome = await wc.executeJavaScript(`(() => { const c = document.querySelector('.panel[data-panel-id="anA"] .pf__chrome'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } })()`)
        if (chrome === null) throw new Error('stage chrome: panel anA gone; panels=' + JSON.stringify(await wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-id]')].map((p) => p.getAttribute('data-panel-id'))`)))
        const panelBefore = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="anA"]').getBoundingClientRect().left`)
        wc.sendInputEvent({ type: 'mouseDown', x: chrome.x, y: chrome.y, button: 'left', clickCount: 1 })
        for (let i = 1; i <= 5; i++) { wc.sendInputEvent({ type: 'mouseMove', x: chrome.x + i * 30, y: chrome.y, button: 'left', modifiers: ['leftButtonDown'] }); await sleep(40) }
        wc.sendInputEvent({ type: 'mouseUp', x: chrome.x + 150, y: chrome.y, button: 'left', clickCount: 1 })
        await settle()
        const panelNoteAfter = await wc.executeJavaScript(`(() => { const g = document.querySelector('[data-annotation][data-annotation-kind="panel"]'); if (!g) return null; const r = g.querySelector('[data-annotation-label]').getBoundingClientRect(); return { x: r.left, y: r.top, panelMoved: document.querySelector('.panel[data-panel-id="anA"]').getBoundingClientRect().left - ${panelBefore} } })()`)
        layoutStore.flushSync()
        const stored = (layoutStore.initial().annotations || []).map((a) => ({ text: a.text, kind: a.anchor.kind }))
        // Select the world note and Delete it.
        await wc.executeJavaScript(`document.querySelector('[data-annotation][data-annotation-kind="world"] [data-annotation-label]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); true`)
        await settle()
        const selected = await wc.executeJavaScript(`document.querySelector('.annotation--selected') !== null`)
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' })
        const deleted = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-annotation][data-annotation-kind="world"]') === null`), 3000)
        const remaining = await wc.executeJavaScript(`document.querySelectorAll('[data-annotation]').length`)
        // Merged: the row is disabled by name.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="workspaces"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await settle()
        const mergedRow = await (async () => {
          const on = await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-rail-merged] button'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
          if (on !== true) return 'no merged door'
          await waitUntil(() => wc.executeJavaScript(`document.querySelector('.shell--merged, [data-merged="true"], .canvas--merged') !== null || document.querySelector('[data-rail-merged] button[aria-pressed="true"]') !== null`), 4000)
          const r = await runRow('canvas.annotate')
          await wc.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`)
          await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-rail-merged] button'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
          await settle()
          return r
        })()
        ok(IDS[0],
          entered === true && strip && /Annotating/.test(strip.text) && strip.done === true && strip.cursor === 'crosshair' &&
            editor1 === true && world === 'first note' &&
            panelNote && panelNote.text === 'on the panel' && panelNote.leader === true &&
            stripGone === true && panelNoteAfter !== null && Math.abs((panelNoteAfter.x - panelNote.x) - 150) <= 3 && Math.abs(panelNoteAfter.y - panelNote.y) <= 2 &&
            stored.length === 2 && stored.some((s) => s.kind === 'world' && s.text === 'first note') && stored.some((s) => s.kind === 'panel' && s.text === 'on the panel') &&
            selected === true && deleted === true && remaining === 1 &&
            typeof mergedRow === 'string' && /disabled/.test(mergedRow) && /merged/.test(mergedRow),
          JSON.stringify({ entered, strip, editor1, world, panelNoteReadiness, panelNote, stripGone, panelNoteAfter, stored, selected, deleted, remaining, mergedRow, log: aLog.slice(-4) }))

        // ---- history.1
        // Two distinct saves so the ring holds two snapshots (uncoalesced here).
        const wsBefore = layoutStore.initial()
        layoutStore.save({ panels: [{ id: 'snA', x: 100, y: 100, w: 520, h: 340, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'from the past' }], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        // The snapshot of THAT save, by stamp: the harness saves constantly and the ring is full of its own history.
        const pastAt = layoutSnapshots.list()[0].at
        layoutStore.save({ panels: [{ id: 'snA', x: 100, y: 100, w: 520, h: 340, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'from the past' }, { id: 'snB', x: 900, y: 100, w: 520, h: 340, z: 2, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'] }], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const ringBefore = layoutSnapshots.list().length
        const reS = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reS
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="workspaces"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const rows = await waitUntil(() => wc.executeJavaScript(`(() => { const rows = [...document.querySelectorAll('[data-rail-snapshot]')]; return rows.length >= 2 ? rows.map((r) => ({ at: r.getAttribute('data-rail-snapshot'), label: r.querySelector('.rail-row__label')?.textContent ?? '', restore: r.querySelector('[data-rail-snapshot-restore]') !== null })) : false })()`), 6000)
        const workspacesBefore = layoutStore.initial() ? (await wc.executeJavaScript(`document.querySelectorAll('[data-rail-workspace]').length`)) : 0
        const activeBefore = layoutStore.current().activeWorkspaceId
        // Restore the OLDER snapshot (one panel): a new workspace with one panel, re-minted.
        const oldest = rows && rows.some((r) => Number(r.at) === pastAt) ? String(pastAt) : null
        const clicked = oldest === null ? false : await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-rail-snapshot="${oldest}"] [data-rail-snapshot-restore]'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const switched = await waitUntil(async () => {
          const a = layoutStore.current().activeWorkspaceId
          return a !== activeBefore ? a : false
        }, 8000)
        await settle()
        const restoredPanels = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-id]')]; return ps.length === 1 ? ps.map((p) => ({ id: p.getAttribute('data-panel-id'), title: p.querySelector('.pf__title')?.textContent ?? '' })) : false })()`), 6000)
        layoutStore.flushSync()
        const all = layoutStore.current().workspaces
        const original = all.find((w) => w.id === activeBefore)
        const added = all.find((w) => w.id === switched)
        ok(IDS[1],
          ringBefore >= 2 && rows && rows.length >= 2 && rows.every((r) => r.restore === true && /panel/.test(r.label)) &&
            clicked === true && typeof switched === 'string' && restoredPanels && restoredPanels[0].title === 'from the past' && restoredPanels[0].id !== 'snA' &&
            original !== undefined && original.panels.length === 2 && added !== undefined && /@/.test(added.name) && added.panels.length === 1 && added.panels[0].id === restoredPanels[0].id,
          JSON.stringify({ ringBefore, rows, activeBefore, clicked, switched, restoredPanels, original: original && original.panels.map((p) => p.id), added: added && { name: added.name, panels: added.panels.map((p) => p.id) }, log: aLog.slice(-4) }))
        // Back to the original workspace and clean up.
        if (typeof switched === 'string' && activeBefore) {
          await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-rail-workspace="${activeBefore}"] button, [data-rail-workspace="${activeBefore}"] .rail-row__main'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
          await settle()
          layoutStore.deleteWorkspace(switched)
        }
        for (const id of ['anA', 'snA', 'snB']) { try { await ptyManager.kill(id) } catch {} }
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reA2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reA2
        await settle()
      } catch (aErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(aErr && aErr.message || aErr) + ' | renderer: ' + (aLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onA)
      }
    }

    // M155 — ink.3. INK: in annotate mode the DRAW tool turns a real drag on
    // the ground into one stroke (a path on the annotation layer, world-
    // anchored) and a drag that starts on a panel into a panel-anchored
    // stroke that MOVES with the panel; Delete removes the selected stroke;
    // the layout file carries `ink` and a reload paints it again. A click
    // without movement is still M93's label.
    {
      const iLog = []
      const onI = (_e, _l, m) => { iLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onI)
      try {
        layoutStore.save({ panels: [
          { id: 'inkA', x: 700, y: 300, w: 400, h: 300, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'] }
        ], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reI = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reI
        await settle()
        await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        const entered = await wc.executeJavaScript(`(() => { const el = document.querySelector('[data-command-id="canvas.annotate"]'); if (!el) return 'no row'; el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true })()`)
        await settle()
        const tool = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-annotate-tool="draw"]'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 3000)
        const armed = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-annotate-tool="draw"]')?.getAttribute('aria-pressed') === 'true'`), 2000)
        const host = await wc.executeJavaScript(`(() => { const c = document.querySelector('.canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left, y: r.top } })()`)
        if (host === null) throw new Error('stage host: no .canvas')
        // Paced: moves sent back to back COALESCE into one (the gesture saw a
        // single move at the end point), so each waits a frame.
        const drag = async (from, to, steps) => {
          wc.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
          // `leftButtonDown` on every move: without the modifier the DOM event's
          // `buttons` is 0 and the gesture ends on its first move as a released
          // press (the M4a harness lesson, reached again).
          for (let i = 1; i <= steps; i++) { wc.sendInputEvent({ type: 'mouseMove', x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, button: 'left', modifiers: ['leftButtonDown'] }); await sleep(20) }
          wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1, modifiers: ['leftButtonDown'] })
        }
        // A stroke on the ground: a bent path, so simplification keeps a corner.
        await drag({ x: host.x + 80, y: host.y + 80 }, { x: host.x + 260, y: host.y + 90 }, 12)
        const ground = await waitUntil(() => wc.executeJavaScript(`(() => { const g = document.querySelector('[data-annotation][data-annotation-ink="true"][data-annotation-kind="world"] path'); return g ? g.getAttribute('d') : false })()`), 3000)
        const afterGround = await wc.executeJavaScript(`(() => ({ annotations: [...document.querySelectorAll('[data-annotation]')].map((g) => ({ id: g.getAttribute('data-annotation'), kind: g.getAttribute('data-annotation-kind'), ink: g.getAttribute('data-annotation-ink') })), editor: !!(document.activeElement && document.activeElement.hasAttribute('data-annotation-editor')), sheet: document.querySelector('[data-annotate-sheet]') !== null, strip: (document.querySelector('[data-annotate-strip]') || {}).textContent }))()`)
        // A stroke that STARTS on the panel: panel-anchored.
        const pr = await wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="inkA"]'); if (!p) return null; const r = p.getBoundingClientRect(); return { x: r.left + 60, y: r.top + 120 } })()`)
        if (pr === null) throw new Error('stage: panel inkA gone')
        await drag(pr, { x: pr.x + 120, y: pr.y + 40 }, 10)
        const onPanel = await waitUntil(() => wc.executeJavaScript(`(() => { const g = document.querySelector('[data-annotation][data-annotation-ink="true"][data-annotation-kind="panel"] path'); if (!g) return false; const r = g.getBoundingClientRect(); return { x: r.left, y: r.top, d: g.getAttribute('d') } })()`), 3000)
        // Leave the mode first (Done), as a person would before moving a
        // panel: the sheet owns every drag while annotating. Then move the
        // panel through its chrome (a dispatched drag on the frame): the
        // stroke follows.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-annotate-done]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await settle()
        // A REAL drag on the chrome (annot.1's own method): the frame's move
        // reads the pointer's buttons, which a dispatched event does not carry.
        const chromeAt = await wc.executeJavaScript(`(() => { const c = document.querySelector('.panel[data-panel-id="inkA"] .pf__chrome'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } })()`)
        if (chromeAt === null) throw new Error('stage chrome: panel inkA gone')
        wc.sendInputEvent({ type: 'mouseDown', x: chromeAt.x, y: chromeAt.y, button: 'left', clickCount: 1 })
        for (let i = 1; i <= 5; i++) { wc.sendInputEvent({ type: 'mouseMove', x: chromeAt.x + i * 18, y: chromeAt.y + i * 10, button: 'left', modifiers: ['leftButtonDown'] }); await sleep(40) }
        wc.sendInputEvent({ type: 'mouseUp', x: chromeAt.x + 90, y: chromeAt.y + 50, button: 'left', clickCount: 1 })
        await settle()
        const moved = await waitUntil(() => wc.executeJavaScript(`(() => { const g = document.querySelector('[data-annotation][data-annotation-ink="true"][data-annotation-kind="panel"] path'); if (!g) return false; const r = g.getBoundingClientRect(); return { x: r.left, y: r.top } })()`), 3000)
        const followed = onPanel && moved && Math.abs(moved.x - onPanel.x - 90) < 6 && Math.abs(moved.y - onPanel.y - 50) < 6
        // The stroke is painted WHERE it was drawn: its box starts within a
        // hit-stroke's half-width of the drag's start (the M155 critic — the
        // first cut added the panel anchor's offset twice and the golden
        // showed a stroke a panel-width away from the hand).
        const placed = onPanel && Math.abs(onPanel.x - pr.x) <= 8 && Math.abs(onPanel.y - pr.y) <= 8
        // Select the ground stroke by a click on it, Delete removes it.
        const gp = await wc.executeJavaScript(`(() => { const g = document.querySelector('[data-annotation][data-annotation-ink="true"][data-annotation-kind="world"] path'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
        await wc.executeJavaScript(`(() => { const g = document.querySelector('[data-annotation][data-annotation-ink="true"][data-annotation-kind="world"] [data-annotation-hit]'); if (!g) return false; g.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); g.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const selected = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-annotation][data-annotation-ink="true"][data-annotation-kind="world"].annotation--selected') !== null`), 2000)
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))`)
        const removed = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-annotation][data-annotation-ink="true"][data-annotation-kind="world"]') === null`), 2000)
        await settle(); flushLayoutStore()
        const onDisk = ((JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces || []).find((w) => (w.panels || []).some((p) => p.id === 'inkA')) || { annotations: [] }).annotations || []
        const inkRows = onDisk.filter((a) => a.ink !== undefined)
        const reI2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reI2
        await settle()
        const repainted = await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('[data-annotation][data-annotation-ink="true"]').length`), 6000)
        ok('ink.3 in annotate mode the draw tool turns a real drag into one stroke on the layer (world-anchored on the ground, panel-anchored from a panel, painted where it was drawn, which follows the panel), a click on a stroke selects it and Delete removes it, the file carries ink and a reload paints it',
          entered === true && tool === true && armed === true && typeof ground === 'string' && /^M/.test(ground) && onPanel !== false && placed === true && followed === true && selected === true && removed === true &&
            inkRows.length === 1 && inkRows[0].anchor.kind === 'panel' && Array.isArray(inkRows[0].ink.points) && inkRows[0].ink.points.length >= 2 && repainted === 1,
          JSON.stringify({ entered, tool, armed, ground: ground && ground.slice(0, 40), afterGround, onPanel, pr, placed, moved, followed, gp, selected, removed, inkRows: inkRows.length, repainted, log: iLog.slice(-3) }))
      } finally {
        wc.removeListener('console-message', onI)
      }
    }

    /* ---------------------------------------------------------------- */
    /* M94. Keyboard reach: every control this run added that a click     */
    /* check drives is also reached by a REAL Tab                          */
    /* ---------------------------------------------------------------- */
    {
      const IDS = ['reach.1 a real Tab from the context pane\'s first enabled action visits every action the pane offers (restart, lock, pin, fill, front-end, rename, save-preset, link, close) in the bar\'s order, and from the launcher\'s first verb visits every launcher verb — the controls M71–M93 added are in the tab order, not click-only']
      try {
        // A terminal focused, so the pane's action bar is the full one.
        layoutStore.save({ panels: [{ id: 'rkA', x: 200, y: 200, w: 520, h: 340, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'] }], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'rkA', focusedId: 'rkA' })
        flushLayoutStore()
        const reR = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reR
        await settle()
        await wc.executeJavaScript(`window.canvas.settings.set('shell.inspectorOpen', true)`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('[data-inspector-action]').length >= 4`), 6000)
        // `identity` is a JS expression over `el` naming the focused control; a
        // repeat of the FIRST identity means the walk wrapped, and stops it.
        const tabWalk = async (startSel, identity, max) => {
          const started = await wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(startSel)}); if (!b) return 'no control'; if (b.disabled) return 'disabled'; b.focus(); return document.activeElement === b })()`)
          if (started !== true) return { started, visited: [] }
          const read = () => wc.executeJavaScript(`(() => { const el = document.activeElement; if (!el) return null; const id = (() => { ${identity} })(); return id ?? ('#' + (el.className || el.tagName)) })()`)
          const visited = [await read()]
          for (let i = 0; i < max; i++) {
            wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
            await sleep(60)
            const at = await read()
            if (at === visited[0]) break
            visited.push(at)
          }
          return { started, visited }
        }
        // From the bar's FIRST enabled action: the walk proves the order, not a start point.
        const firstAction = await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('[data-inspector-action]')].find((x) => !x.disabled); return b ? b.getAttribute('data-inspector-action') : null })()`)
        const pane = await tabWalk('[data-inspector-action="' + firstAction + '"]', `return el.getAttribute('data-inspector-action')`, 16)
        // Every ENABLED action, in DOM order: a disabled one (restart on a panel that has not
        // started, the front-end verb on a plain shell) is skipped by Tab, and that is right.
        const wanted = await wc.executeJavaScript(`[...document.querySelectorAll('[data-inspector-action]')].filter((b) => !b.disabled).map((b) => b.getAttribute('data-inspector-action'))`)
        const paneOk = pane.started === true && wanted.length >= 6 && wanted.every((w) => pane.visited.includes(w)) &&
          wanted.map((w) => pane.visited.indexOf(w)).every((idx, i, arr) => i === 0 || idx > arr[i - 1]) && ['lock', 'pin', 'maximise'].every((w) => wanted.includes(w))
        // The launcher: an empty canvas.
        for (const id of ['rkA']) { try { await ptyManager.kill(id) } catch {} }
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reR2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reR2
        await settle()
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-launcher]') !== null`), 6000)
        const launcher = await tabWalk('[data-launcher-sheet]', `const n = el.querySelector && el.querySelector('.launcher__verb-name'); return n ? 'verb:' + n.textContent : null`, 30)
        const verbsInOrder = launcher.visited.filter((v) => typeof v === 'string' && v.startsWith('verb:')).length
        const verbCount = await wc.executeJavaScript(`document.querySelectorAll('[data-launcher] .launcher__verb:not([disabled])').length`)
        ok(IDS[0], paneOk && launcher.started === true && verbsInOrder >= verbCount,
          JSON.stringify({ pane, launcher: { started: launcher.started, verbsInOrder, verbCount, visited: launcher.visited } }))
      } catch (rErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(rErr && rErr.message || rErr))
      }
    }

    // M96 — verbs.1. THE VERB LINE END TO END in the real renderer: the
    // palette row enters text mode, a typed step is refused BY NAME with its
    // fix on the palette's own feedback line (the line kept for correction),
    // and a correct step reaches the panel through the executor — `lock`
    // paints the frame's lock mark. Nothing here reaches into React state.
    {
      const IDS = ['verbs.1 Run a verb… enters text mode; `close zz9` is refused naming zz9 with the fix on the feedback line and the line kept; `lock vbA` locks the panel and the report reads `ran lock vbA · 1 step`; a destructive step opens confirm mode naming the verb']
      try {
        for (const id of ['rkA']) { try { await ptyManager.kill(id) } catch {} }
        layoutStore.save({ panels: [{ id: 'vbA', x: 200, y: 200, w: 520, h: 340, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'] }], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'vbA', focusedId: 'vbA' })
        flushLayoutStore()
        const reV = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reV
        await settle()
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="vbA"]') !== null`), 6000)
        const openV = async () => {
          await wc.executeJavaScript(`if (document.querySelector('.palette') === null) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
          return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        }
        const typeV = (text) => wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (!i) return false
          const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        const enterV = () => wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (!i) return false; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
        const escV = () => wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })()`)
        const feedback = () => wc.executeJavaScript(`(() => { const i = document.querySelector('.palette__input'); const f = document.querySelector('.palette__number-error'); const c = document.querySelector('.palette__confirm'); return { placeholder: i ? i.placeholder : null, value: i ? i.value : null, feedback: f ? f.textContent : null, confirm: c ? c.textContent : null } })()`)
        await openV()
        await typeV('run a verb'); await sleep(150)
        const rowV = await wc.executeJavaScript(`(() => { const r = [...document.querySelectorAll('.palette__row')].find((x) => x.textContent.includes('Run a verb')); return r ? { disabled: r.getAttribute('aria-disabled') } : null })()`)
        await enterV(); await sleep(200)
        const mode = await feedback()
        await typeV('close zz9'); await enterV(); await sleep(400)
        const refused = await feedback()
        await typeV('lock vbA'); await enterV(); await sleep(500)
        const locked = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="vbA"] [data-panel-locked]') !== null`)
        const report = await feedback()
        await typeV('close vbA'); await enterV(); await sleep(300)
        const confirm = await feedback()
        await escV(); await sleep(100); await escV(); await sleep(100); await escV(); await sleep(200)
        const stillThere = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="vbA"]') !== null`)
        const refusedText = (refused.feedback || refused.placeholder || '')
        const reportText = (report.feedback || report.placeholder || '')
        const confirmText = (confirm.confirm || confirm.feedback || confirm.placeholder || '')
        ok(IDS[0], rowV !== null && rowV.disabled !== 'true' && /verb/.test(mode.placeholder || '') &&
            /zz9/.test(refusedText) && /name a panel/.test(refusedText) && refused.value === 'close zz9' &&
            locked === true && /ran lock vbA/.test(reportText) && /1 step/.test(reportText) &&
            /close vbA/.test(confirmText) && /run it\?/.test(confirmText) && stillThere === true,
          JSON.stringify({ rowV, mode, refused, locked, report, confirm, stillThere }))
      } catch (vErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(vErr && vErr.message || vErr))
      }
    }

    // M103 — browser.1. THE BROWSER PANE END TO END, against a page that
    // LIES: a local http server whose page rewrites `document.title` to a
    // bank's sign-in and `history.replaceState`s itself to another path. The
    // frame's readout must be the guest's own `getURL()` — the replaced path
    // is fine (that IS a navigation, and it is what main reads too), the
    // title must appear nowhere on the frame. `browser:read` over the bridge
    // hands back the page's body text with a planted token scrubbed and a
    // note naming a remote page; the main window's own id is refused by
    // name; and a second record at file:///etc/hosts never becomes a panel —
    // dropped at parse, by id, with the rest of the layout intact.
    {
      const IDS = ['browser.1 a browser panel opens a local page whose script rewrites its title and history; the readout is the guest\'s real getURL() (http://127.0.0.1:…/elsewhere, the title nowhere on the frame); browser:read over the bridge returns the body text, scrubbed, from that same url, and refuses the window\'s own id; a file:///etc/hosts record is dropped at parse by name']
      let server = null
      try {
        const http = require('node:http')
        const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        server = http.createServer((_req, res) => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<!doctype html><html><head><title>honest title</title></head><body><h1>Hello from the fixture server</h1><p>GITHUB_TOKEN=${token}</p><script>document.title = 'bank.example — Sign in'; history.replaceState(null, '', '/elsewhere');</script></body></html>`)
        })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        const port = server.address().port
        for (const id of ['vbA']) { try { await ptyManager.kill(id) } catch {} }
        layoutStore.save({ panels: [
          { id: 'bA', kind: 'browser', x: 80, y: 80, w: 640, h: 480, z: 1, url: `http://127.0.0.1:${port}/start` },
          { id: 'bB', kind: 'browser', x: 800, y: 80, w: 640, h: 480, z: 2, url: 'file:///etc/hosts' }
        ], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        // The parser's own answer over the file just written: the file: record
        // is dropped BY NAME and its neighbour survives.
        const parsed = parseLayout(readFileSync(LAYOUT_PATH, 'utf8'))
        const parsedIds = parsed.snapshot.workspaces.flatMap((w) => w.panels.map((p) => p.id))
        const reB = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reB
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        // Live: the guest attached (its id on the frame) and the readout ends
        // at the path the page moved itself to.
        const live = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="bA"]'); if (!n || n.getAttribute('data-browser-live') !== 'yes') return false
          const wcId = n.getAttribute('data-browser-wc'); const url = n.querySelector('[data-browser-url]')?.textContent ?? ''; if (!wcId || !url.endsWith('/elsewhere')) return false
          return { url, wc: Number(wcId), address: n.querySelector('[data-browser-address]')?.value ?? null, guest: n.querySelector('webview[data-browser-guest]') !== null, leak: n.textContent.includes('bank.example') || n.textContent.includes('honest title') } })()`), 20000)
        const read = live ? await wc.executeJavaScript(`window.canvas.browser.read({ panelId: 'bA', webContentsId: ${live.wc} })`) : null
        const bogus = await wc.executeJavaScript(`window.canvas.browser.read({ panelId: 'bA', webContentsId: ${wc.id} })`)
        // Browser panels only: the verb-line block before this one leaves its own panel on the canvas.
        const droppedFacts = await wc.executeJavaScript(`({ bB: document.querySelector('.panel[data-panel-id="bB"]') === null, browsers: document.querySelectorAll('.panel[data-panel-kind="browser"]').length, guests: document.querySelectorAll('webview[data-browser-guest]').length, all: document.querySelectorAll('.panel[data-panel-id]').length })`)
        // The pinned fact is the PARSE dropping bB by name (the door a file on
        // disk takes). The harness's in-memory store hands the renderer the raw
        // seed unparsed, so the DOM still shows bB here — reported, not asserted.
        const dropped = Array.isArray(parsed.warnings) && parsed.warnings.some((w) => /bB/.test(w) && /http/.test(w))
        const rail = await wc.executeJavaScript(`(() => { const r = document.querySelector('.rail-list--panels .rail-row[data-rail-row="bA"]'); return r ? { label: r.querySelector('.rail-row__label')?.textContent ?? null } : null })()`)
        const expectUrl = `http://127.0.0.1:${port}/elsewhere`
        ok(IDS[0],
          live && live.guest === true && live.url === expectUrl && live.address === expectUrl && live.leak === false &&
            read && read.kind === 'read' && read.url === expectUrl && /Hello from the fixture server/.test(read.text) && !read.text.includes(token) &&
            /remote page at 127\.0\.0\.1/.test(read.note) && /redacted/.test(read.note) &&
            bogus && bogus.kind === 'refused' && /not a page in a browser panel/.test(bogus.reason) &&
            // The store carries every earlier block's panels: presence and absence by id, never the whole list.
            dropped === true && parsedIds.includes('bA') && !parsedIds.includes('bB') && parsed.warnings.some((w) => w.includes('bB') && /file:/.test(w)) &&
            rail && /127\.0\.0\.1/.test(rail.label ?? ''),
          JSON.stringify({ live, read: read && { kind: read.kind, url: read.url, note: read.note, head: (read.text || '').slice(0, 80) }, bogus, dropped, droppedFacts, parsedIds, warnings: parsed.warnings, rail }))
      } catch (bErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(bErr && bErr.message || bErr))
      } finally {
        if (server) server.close()
      }
    }

    // M185 — preview.1. THE PREVIEW IN THE REAL RENDERER, over a real local
    //     page. Three claims, each one a silent failure if undone:
    //     (a) a named width LAYS OUT the guest (390 css pixels, centred) —
    //         never a transform, which would report the pane's viewport to the
    //         page and make every media query answer for the wrong device —
    //         and `full` REMOVES the key rather than writing `device: 'full'`,
    //         so the record and the parser keep one spelling of the default;
    //     (b) Capture writes a REAL PNG (its magic number read off disk) under
    //         the app's own directory and places an ORDINARY image object whose
    //         title names the page, so a capture's provenance is on screen;
    //     (c) discovery through main's own handler reads the project's
    //         package.json and answers the three-state sentence — and starts
    //         NOTHING: the dev script is named, and the panel count is the same
    //         after the question as before it.
    {
      const IDS = ['preview.1 a device width lays the guest out at 390px centred and writes device on the record, and full removes the key; Capture writes a real PNG under userData/captures and places an image panel titled by the page; discovery names the project and its dev script, answers not-asked for a panel with no process, starts nothing, and mints no panel']
      let server = null
      try {
        const http = require('node:http')
        const { existsSync: ex, readFileSync: rf } = require('node:fs')
        server = http.createServer((_req, res) => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<!doctype html><html><head><title>preview</title></head><body style="background:#123456"><h1>a page to look at</h1></body></html>')
        })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        const port = server.address().port
        // A real project directory with a real package.json: main's own
        // handler reads it, so the fixture proves the path and not a fake.
        const projectDir = mkdtempSync(join(tmpdir(), 'tc preview project '))
        writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'the shop', scripts: { build: 'tsc', dev: 'vite' } }), 'utf8')
        layoutStore.save({ panels: [
          { id: 'pv1', kind: 'browser', x: 60, y: 60, w: 720, h: 520, z: 1, url: `http://127.0.0.1:${port}/` }
        ], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'pv1', focusedId: 'pv1' })
        flushLayoutStore()
        const rePv = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await rePv
        await settle()
        const attached = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="pv1"]'); return n && n.getAttribute('data-browser-live') === 'yes' ? { wc: Number(n.getAttribute('data-browser-wc')) } : false })()`), 20000)
        const chips = await wc.executeJavaScript(`[...document.querySelectorAll('[data-preview-device]')].map((b) => b.getAttribute('data-preview-device')).join(',')`)
        // A shell control acts on CLICK (`shellControl` preventDefaults the
        // mousedown so focus never leaves the terminal's textarea), so a
        // mousedown alone presses nothing — the first cut of this check
        // dispatched one and read a pane that had not moved.
        const press = async (sel) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b || b.disabled) return false; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        await press('[data-preview-device="phone"]')
        const atPhone = await waitUntil(() => wc.executeJavaScript(`(() => { const h = document.querySelector('.panel[data-panel-id="pv1"] .browser-node__host'); if (!h || h.getAttribute('data-preview-width') !== 'phone') return false
          const r = h.getBoundingClientRect(); const b = document.querySelector('.panel[data-panel-id="pv1"] .pf__body').getBoundingClientRect()
          return { width: Math.round(r.width), centred: Math.abs((r.left - b.left) - (b.right - r.right)) < 4, transform: getComputedStyle(h).transform } })()`), 4000)
        await settle(); flushLayoutStore()
        const savedPhone = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces.flatMap((w) => w.panels).find((p) => p.id === 'pv1')
        await press('[data-preview-device="full"]')
        await settle(); flushLayoutStore()
        const savedFull = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces.flatMap((w) => w.panels).find((p) => p.id === 'pv1')
        // (b) Capture, through the pane's own control.
        const before = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-id]').length`)
        await press('[data-preview-capture]')
        const image = await waitUntil(() => wc.executeJavaScript(`(() => { const n = [...document.querySelectorAll('.panel[data-panel-kind="image"]')].pop(); return n ? { title: n.querySelector('.pf__title')?.textContent ?? '', id: n.getAttribute('data-panel-id') } : false })()`), 15000)
        await settle(); flushLayoutStore()
        const imageRecord = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces.flatMap((w) => w.panels).find((p) => p.id === (image && image.id))
        const png = imageRecord && ex(imageRecord.image.path) ? rf(imageRecord.image.path) : null
        // (c) Discovery through main's own handler, over a real package.json.
        const found = await wc.executeJavaScript(`window.canvas.preview.discover({ pids: [], cwd: ${JSON.stringify(projectDir)} })`)
        const after = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-id]').length`)
        ok(IDS[0],
          attached !== false && chips === 'phone,tablet,laptop,full' &&
            atPhone !== false && atPhone.width === 390 && atPhone.centred === true && (atPhone.transform === 'none' || atPhone.transform === '') &&
            savedPhone && savedPhone.device === 'phone' &&
            savedFull && !('device' in savedFull) &&
            image !== false && /^capture · 127\.0\.0\.1:/.test(image.title) &&
            imageRecord && typeof imageRecord.image.path === 'string' && /\/captures\//.test(imageRecord.image.path) &&
            png !== null && png.length > 0 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47 &&
            found && found.kind === 'not-asked' && found.project === 'the shop' && found.scripts.map((x) => x.name).join(',') === 'dev' && /nothing to ask/.test(found.note) &&
            after === before + 1,
          JSON.stringify({ attached, chips, atPhone, savedPhone, savedFull, image, imagePath: imageRecord && imageRecord.image.path, pngBytes: png && png.length, found, before, after }))
      } catch (pErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(pErr && pErr.message || pErr))
      } finally {
        if (server) server.close()
      }
    }

    // M195 (D03) — preview.bind.1. WHICH PREVIEW A CHANGE BELONGS TO, in the
    //     real renderer, over four real servers. Before this, the reload
    //     effect's callback took no parameter: every loopback pane reloaded on
    //     every open file panel's change, so two local projects reloaded one
    //     another and a person mid-form on the second one lost it.
    //     A RELOAD IS COUNTED AT THE SERVER, never inferred from the DOM: the
    //     guest reloads in its own process and the host has nothing to observe
    //     but the request that arrives. Only `/` is counted — a guest also asks
    //     for `/favicon.ico`, and counting that would make a pane look reloaded
    //     because it painted a tab icon.
    //     A NEGATIVE IS FENCED, never slept on. `fence()` writes to a fourth
    //     pane's own root and waits for THAT pane to reload, which proves the
    //     whole pipeline — fs.watch, main's 100 ms debounce, the event, the
    //     renderer's own coalesce — has drained past the writes under test. A
    //     fixed sleep would be a guessed clock, and a late reload arriving
    //     after the read would turn a red into a green.
    //     Four claims: (a) a change under root A reloads only pane A; (b) two
    //     projects changing in ONE window reload BOTH — the coalesce is per
    //     pane, and one shared timer would drop one of them; (c) a burst under
    //     one root is ONE reload (spaced past main's own debounce, which
    //     otherwise collapses the burst before the renderer ever sees it and
    //     would make this claim untestable); (d) a change under a folder no
    //     pane is bound to reloads nothing, while the fence proves an event
    //     for a file panel opened the same way does fire.
    {
      const IDS = ['preview.bind.1 a file change under a preview\'s bound root reloads THAT pane and no other: a second project\'s pane and an unbound pane are untouched; two bound projects changing in one window BOTH reload (the coalesce is per pane); a burst of writes under one root is a single reload; and a change under a folder no pane is bound to reloads nothing, fenced by a sentinel pane that does']
      const servers = []
      const dirs = []
      try {
        const http = require('node:http')
        const mkServer = async () => {
          const state = { loads: 0 }
          const server = http.createServer((req, res) => {
            if ((req.url || '/').split('?')[0] === '/') state.loads += 1
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end('<!doctype html><html><head><title>p</title></head><body>a page</body></html>')
          })
          await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
          servers.push(server)
          return { state, url: `http://127.0.0.1:${server.address().port}/` }
        }
        const A = await mkServer(); const B = await mkServer(); const U = await mkServer(); const S = await mkServer()
        // realpathSync so a fixture path is the same string a live session and a
        // file panel would each produce (macOS's /var is a symlink); see the
        // note in preview.bind.2.
        const mkDir = (name) => { const d = realpathSync(mkdtempSync(join(tmpdir(), name))); dirs.push(d); return d }
        const rootA = mkDir('tc preview A '); const rootB = mkDir('tc preview B ')
        const rootS = mkDir('tc preview S '); const stray = mkDir('tc preview stray ')
        const fileA = join(rootA, 'a.txt'); const fileB = join(rootB, 'b.txt')
        const fileS = join(rootS, 's.txt'); const fileStray = join(stray, 'notes.md')
        for (const f of [fileA, fileB, fileS, fileStray]) writeFileSync(f, 'v0\n')
        layoutStore.save({ panels: [
          { id: 'pvA', kind: 'browser', x: 40, y: 40, w: 420, h: 300, z: 1, url: A.url, preview: { root: rootA } },
          { id: 'pvB', kind: 'browser', x: 500, y: 40, w: 420, h: 300, z: 2, url: B.url, preview: { root: rootB } },
          { id: 'pvU', kind: 'browser', x: 40, y: 380, w: 420, h: 300, z: 3, url: U.url },
          { id: 'pvS', kind: 'browser', x: 500, y: 380, w: 420, h: 300, z: 4, url: S.url, preview: { root: rootS } }
        ], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'pvA', focusedId: 'pvA' })
        flushLayoutStore()
        const reB = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reB
        await settle()
        const live = await waitUntil(() => wc.executeJavaScript(`(() => ['pvA','pvB','pvU','pvS'].every((id) => document.querySelector('.panel[data-panel-id="' + id + '"]')?.getAttribute('data-browser-live') === 'yes'))()`), 20000)
        const opened = { A: A.state.loads, B: B.state.loads, U: U.state.loads, S: S.state.loads }
        // The event main sends names the FILE PANEL; the renderer resolves that
        // id to its path against the panel array, which is the whole reason no
        // IPC channel changed here.
        for (const f of [fileA, fileB, fileS, fileStray]) {
          const had = await wc.executeJavaScript(`document.querySelectorAll('[data-panel-kind="file"]').length`)
          await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(f)})`)
          await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('[data-panel-kind="file"]').length > ${had}`), 8000)
        }
        await settle()
        let fenceN = 0
        // The fence: a write the SENTINEL pane must reload for. Its content
        // changes every time, because main dedupes on a hash of the read and an
        // identical write is not an event.
        const fence = async () => {
          const was = S.state.loads
          fenceN += 1
          writeFileSync(fileS, `fence ${fenceN}\n`)
          return waitUntil(() => (S.state.loads > was ? S.state.loads : false), 10000)
        }
        const counts = () => ({ A: A.state.loads, B: B.state.loads, U: U.state.loads })
        // (a) + (c). A burst under A alone. The writes are spaced past main's
        // own WATCH_DEBOUNCE_MS (100 ms) on purpose: closer together, main
        // collapses them into one event and the renderer's coalesce — the thing
        // this claim is about — is never exercised at all.
        const beforeBurst = counts()
        writeFileSync(fileA, 'v1\n'); await sleep(170)
        writeFileSync(fileA, 'v2\n'); await sleep(170)
        writeFileSync(fileA, 'v3\n')
        const burstFence = await fence()
        const afterBurst = counts()
        // (b) Two projects in ONE window. A shared timer would let the second
        // write cancel the first pane's reload; per-pane timers reload both.
        const beforeBoth = counts()
        writeFileSync(fileA, 'both A\n'); writeFileSync(fileB, 'both B\n')
        const bothFence = await fence()
        const afterBoth = counts()
        // (d) A change under a folder no pane is bound to — an ordinary note.
        const beforeStray = counts()
        writeFileSync(fileStray, 'edited\n')
        const strayFence = await fence()
        const afterStray = counts()
        ok(IDS[0],
          live !== false &&
            opened.A === 1 && opened.B === 1 && opened.U === 1 && opened.S === 1 &&
            burstFence !== false && bothFence !== false && strayFence !== false &&
            afterBurst.A === beforeBurst.A + 1 && afterBurst.B === beforeBurst.B && afterBurst.U === beforeBurst.U &&
            afterBoth.A === beforeBoth.A + 1 && afterBoth.B === beforeBoth.B + 1 && afterBoth.U === beforeBoth.U &&
            afterStray.A === beforeStray.A && afterStray.B === beforeStray.B && afterStray.U === beforeStray.U,
          JSON.stringify({ live, opened, beforeBurst, afterBurst, beforeBoth, afterBoth, beforeStray, afterStray, fences: { burstFence, bothFence, strayFence } }))
      } catch (bErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(bErr && bErr.message || bErr))
      } finally {
        // The file panels' watches live in MAIN and outlive this check, so the
        // layout goes back to empty FIRST (which unmounts them and closes each
        // watch through the ordinary door) before the fixtures are removed —
        // otherwise every later check in the part runs with four watchers armed
        // on directories that no longer exist.
        try { layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }); flushLayoutStore() } catch { /* the next check saves its own */ }
        try { const re = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await re; await settle() } catch { /* nothing to drain */ }
        for (const server of servers) { try { server.close(); server.closeAllConnections?.() } catch { /* already closed */ } }
        for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }) } catch { /* gone */ } }
      }
    }

    // M195 (D03) — preview.bind.2. THE CANVAS DOOR, PRESSED WITH REAL INPUT.
    //     Binding needs TWO panels at once — the pane it acts on and the panel
    //     whose folder it takes — so this drives the real division: the
    //     terminal's own slot is clicked (which focuses it), the pane's chrome
    //     is mousedowned (which selects and never focuses), and then the
    //     control is pressed.
    //     THE PRESS IS TWO TASKS, never one, and that is the whole reason
    //     this check has teeth. A mousedown and a click dispatched from ONE
    //     `executeJavaScript`
    //     runs both handlers inside a single task, so React has not flushed
    //     the state update the mousedown queued — and `focusedIdRef` (assigned
    //     during RENDER) still holds the terminal while `selectedIdsRef`
    //     (assigned EAGERLY) already holds the pane. Both refs read correctly
    //     and the check passes. A real user's mousedown and click are separate
    //     tasks with a flush between them, so a control whose press moves focus
    //     to its own pane reads a subject that is the pane itself — which is
    //     neither a terminal nor a chat — and refuses. That defect was live in
    //     this pane's `Find the project` and `Start dev` controls from M185
    //     until this milestone; the fix is one line in the body's own focus
    //     handler (`event.defaultPrevented`) and this is the check that can
    //     see it: with the line removed, the press focuses the pane and the
    //     verb refuses with `select the terminal your project runs in`.
    {
      const IDS = ['preview.bind.2 Bind source, pressed as a person presses it (mousedown and click in separate tasks) on a pane whose own body focuses on mousedown, takes the subject panel\'s folder and writes it with the source panel onto the record, leaves the pane selected and reads Change source afterwards — and the pane, which ignored the same file before, now reloads for a change under that folder']
      const servers = []
      const dirs = []
      try {
        const http = require('node:http')
        const state = { loads: 0 }
        const server = http.createServer((req, res) => {
          if ((req.url || '/').split('?')[0] === '/') state.loads += 1
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<!doctype html><html><body>bind</body></html>')
        })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        servers.push(server)
        const url = `http://127.0.0.1:${server.address().port}/`
        // realpathSync, because macOS's /var is a symlink to /private/var: the
        // live session answers the resolved form and a file panel answers the
        // form it was opened with, and the fixture must not spend its evidence
        // on which of the two this machine happened to produce. (That mismatch
        // is real and is recorded as a bound of the feature, not hidden here:
        // the renderer has no realpath, and this is provenance, not a gate.)
        const rootC = realpathSync(mkdtempSync(join(tmpdir(), 'tc preview C ')))
        dirs.push(rootC)
        const fileC = join(rootC, 'c.txt')
        writeFileSync(fileC, 'v0\n')
        // The subject is a CHAT, not a terminal, and the reason is the
        // harness's own rule: `LIVE_AT_BOOT` promotes exactly `s01`, so any
        // other terminal boots DORMANT and renders a card with no
        // `.panel__slot` to click (the second cut of this check threw on
        // exactly that). A conversation needs no process to have a folder —
        // `previewSubject` accepts one by name — so it is the honest subject
        // for a check about binding rather than about spawning.
        layoutStore.save({ panels: [
          // `sessionId` is REQUIRED — `parseChatSource` drops a chat record
          // without one, and a dropped panel is a missing `.pf__body` the
          // click helper reports as "no element matched" rather than as a
          // malformed fixture (this cost a run).
          { id: 'ch1', kind: 'chat', x: 40, y: 40, w: 520, h: 320, z: 1, chat: { cwd: rootC, sessionId: 'm195-bind-session' } },
          { id: 'pvC', x: 620, y: 40, w: 520, h: 380, z: 2, kind: 'browser', url }
        ], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'ch1', focusedId: null })
        flushLayoutStore()
        const reC = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reC
        await settle()
        const live = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="pvC"]')?.getAttribute('data-browser-live') === 'yes'`), 20000)
        // Every renderer read answers DATA rather than throwing: a null node
        // inside `executeJavaScript` comes back as "Script failed to execute"
        // with the actual cause only in the renderer's own console, which this
        // harness does not forward — so the check would report a mystery.
        const readPane = () => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="pvC"]')
          if (n === null) return { missing: true, panels: [...document.querySelectorAll('.panel[data-panel-id]')].map((p) => p.getAttribute('data-panel-id')) }
          return { readout: n.querySelector('[data-preview-source]')?.textContent ?? '', attr: n.querySelector('[data-preview-source]')?.getAttribute('data-preview-source'), verb: n.querySelector('[data-preview-bind]')?.textContent ?? '', disabled: n.querySelector('[data-preview-bind]')?.disabled === true, selected: n.classList.contains('panel--selected') } })()`)
        const before = await readPane()
        // The conversation is FOCUSED by a click in its body, which is where
        // `ChatNode`'s focus handler lives.
        await clickPanelBody('.panel[data-panel-id="ch1"] .pf__body')
        // The pane is SELECTED by a mousedown on its chrome, which selects and
        // starts a move that never moves. Both are what a person does.
        const selectedPane = await wc.executeJavaScript(`(() => { const c = document.querySelector('.panel[data-panel-id="pvC"] .pf__chrome'); if (c === null) return false
          c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        await settle()
        const focus = await wc.executeJavaScript(`typeof window.__m4aFocusedId === 'function' ? window.__m4aFocusedId() : 'no hook'`)
        // THE PRESS IS TWO TASKS WITH A FLUSH BETWEEN THEM, and that is the
        // whole reason this check has teeth. A `mousedown` and a `click`
        // dispatched from ONE `executeJavaScript` run inside a single task, so
        // React has not flushed the state update the mousedown queued: at
        // click time `focusedIdRef` (assigned during RENDER) still holds the
        // conversation while `selectedIdsRef` (assigned EAGERLY) already holds
        // the pane, both refs read correctly, and a control whose press steals
        // focus passes anyway. A person's mousedown and click are separate
        // tasks, so the flush has happened and the subject rule reads whatever
        // the mousedown focused.
        // (`sendInputEvent` down+up was tried first and is NOT usable here: it
        // moved the selection, so the input arrived, but no `click` reached the
        // control and the handler never ran — `said` empty, the record
        // untouched. A shell control acts on CLICK, `preview.1`'s own note.)
        const box = await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="pvC"] [data-preview-bind]'); if (!b || b.disabled) return null
          b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
          return true })()`)
        await sleep(120)
        const focusAfterDown = await wc.executeJavaScript(`typeof window.__m4aFocusedId === 'function' ? window.__m4aFocusedId() : 'no hook'`)
        const pressed = await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="pvC"] [data-preview-bind]'); if (!b || b.disabled) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        await settle(); flushLayoutStore()
        const saved = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces.flatMap((w) => w.panels).find((p) => p.id === 'pvC')
        const after = await readPane()
        const said = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="pvC"] [data-preview-said]')?.textContent ?? ''`)
        // The effect. A file panel inside the bound folder, then a write.
        await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(fileC)})`)
        await waitUntil(() => wc.executeJavaScript(`!!document.querySelector('[data-panel-kind="file"]')`), 8000)
        await settle()
        const loadsBefore = state.loads
        writeFileSync(fileC, 'v1\n')
        const reloaded = await waitUntil(() => (state.loads > loadsBefore ? state.loads : false), 10000)
        ok(IDS[0],
          live !== false && selectedPane === true &&
            before.attr === 'none' && before.disabled === false && /Bind source/.test(before.verb) &&
            focus === 'ch1' && box === true && pressed === true &&
            // The press did not move focus off the subject — the one line that
            // makes this control (and M185's three beside it) work at all.
            focusAfterDown === 'ch1' &&
            saved && saved.preview && saved.preview.root === rootC && saved.preview.sourcePanelId === 'ch1' &&
            after.attr === rootC && /source · /.test(after.readout) && /Change source/.test(after.verb) &&
            after.selected === true &&
            reloaded !== false,
          JSON.stringify({ live, selectedPane, before, focus, focusAfterDown, box, pressed, saved: saved && saved.preview, after, said, rootC, loadsBefore, loads: state.loads }))
      } catch (cErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(cErr && cErr.message || cErr))
      } finally {
        try { layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }); flushLayoutStore() } catch { /* the next check saves its own */ }
        try { const re = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await re; await settle() } catch { /* nothing to drain */ }
        for (const server of servers) { try { server.close(); server.closeAllConnections?.() } catch { /* already closed */ } }
        for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }) } catch { /* gone */ } }
      }
    }

    // M186 — image.2. A PICTURE INTO THE STORE, THROUGH THE REAL DOORS.
    //     The agent door takes a real PNG in a fixture directory: the store
    //     writes it under `userData/assets` named by the sha-256 of its own
    //     bytes, the panel names that id, and the SAME file added twice is one
    //     file and one id (the second call reports `wrote: false`) — which is
    //     what makes the id portable rather than a fact about this disk.
    //     Then Replace, through the node's own control against a planted
    //     chooser answer, repoints a picture whose bytes are gone: the panel
    //     SURVIVES the missing arm with Replace on it (the brief's "missing
    //     bytes leave an object with a Replace action"), and after the repair
    //     it paints. A non-image is refused by its first bytes and mints
    //     nothing.
    const IMAGE_IDS = ['image.2 image-add stores a picture content-addressed under userData/assets and the panel carries the id; the same file twice is one asset; a non-image is refused by its first bytes and mints no panel; a picture whose file is gone keeps its panel with the missing sentence and a Replace control, and Replace through the system chooser repoints it and paints']
    try {
      const { writeFileSync: wf, mkdirSync: mk, unlinkSync: ul, readdirSync: rd } = require('node:fs')
      // NO SPACES in the fixture path: the verb line splits on whitespace, so
      // a path with a space in it is two arguments and the door answers
      // `that file is not there any more` about half a path. (The gesture
      // doors take a path directly and are unaffected; this is the agent
      // line's own bound, and it is worth knowing.)
      const src = mkdtempSync(join(tmpdir(), 'tc-image-src-'))
      mk(src, { recursive: true })
      // A real 1x1 PNG, so the renderer paints real pixels rather than a fixture shape.
      const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      const one = join(src, 'one.png')
      const two = join(src, 'two.png')
      const notPicture = join(src, 'notes.png')
      wf(one, PNG_1x1); wf(two, PNG_1x1); wf(notPicture, Buffer.from('not a picture at all', 'utf8'))
      layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore()
      const reI = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await reI
      await settle()
      // THE STORE IS CONTENT-ADDRESSED, WHICH MEANS IT OUTLIVES THIS RUN.
      // Two of this check's arms are about a FIRST write — the note says
      // "already in this canvas's pictures" only on the second add, and
      // `stored.length === 1` — and both are true only if the store does not
      // already hold this fixture's bytes. The fixture is a fixed 1x1 PNG, so
      // its hash is the same on every run this repo will ever do: the first
      // run after a clean userData passed and every run after it failed, with
      // the check's own leftovers as the cause. That read as an image-add
      // regression when it is a check that was never self-contained.
      // Emptying its own scratch store is the whole fix; the directory holds
      // nothing but assets these suites put there.
      const assetsDirBefore = join(app.getPath('userData'), 'assets')
      if (existsSync(assetsDirBefore)) for (const n of rd(assetsDirBefore).filter((n) => n.endsWith('.png'))) ul(join(assetsDirBefore, n))
      const added = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `image-add ${one}` }, null, 5000)
      // The same bytes under a different name: one asset, and the note says so.
      const again = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `image-add ${two}` }, null, 5000)
      const refusedAdd = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `image-add ${notPicture}` }, null, 5000)
      await settle(); flushLayoutStore()
      const images = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces.flatMap((w) => w.panels).filter((p) => p.kind === 'image')
      const assetsDir = join(app.getPath('userData'), 'assets')
      const stored = existsSync(assetsDir) ? rd(assetsDir).filter((n) => n.endsWith('.png')) : []
      // The bytes are gone: the panel stays, says so, and offers Replace.
      const victim = images[0]
      if (victim) ul(victim.image.path)
      const reJ = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await reJ
      await settle()
      const gone = victim ? await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id=${JSON.stringify(victim.id)}]'); if (!n) return false
        const arm = n.getAttribute('data-image-arm'); if (arm !== 'missing') return false
        return { arm, note: n.querySelector('[data-image-note]')?.textContent ?? '', replace: n.querySelector('[data-image-replace]') !== null } })()`), 6000) : false
      // Replace, through the node's own control, with the chooser answering a real file.
      state.assetChoice = two
      const pressed = victim ? await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id=${JSON.stringify(victim.id)}] [data-image-replace]'); if (!b) return false; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`) : false
      const repaired = victim ? await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id=${JSON.stringify(victim.id)}]'); return n && n.getAttribute('data-image-arm') === 'data' && n.querySelector('[data-image-pixels]') !== null ? { arm: n.getAttribute('data-image-arm') } : false })()`), 8000) : false
      state.assetChoice = undefined
      ok(IMAGE_IDS[0],
        added && added.kind === 'ran' && again && again.kind === 'ran' && /already in this canvas/.test(String(again.summary)) &&
          refusedAdd && refusedAdd.kind === 'refused' && /first bytes/.test(String(refusedAdd.reason)) &&
          images.length === 2 && images.every((p) => /^[0-9a-f]{64}$/.test(p.image.asset ?? '')) &&
          images[0].image.asset === images[1].image.asset && stored.length === 1 &&
          gone !== false && gone.replace === true && /not there any more/.test(gone.note) &&
          pressed === true && repaired !== false,
        JSON.stringify({ added, again, refusedAdd, images, stored, gone, pressed, repaired }))
    } catch (iErr) {
      for (const id of IMAGE_IDS) ok(id, false, 'threw: ' + String(iErr && iErr.message || iErr))
    }

    // M187 — note.1. THE NOTE KIND IN THE REAL RENDERER. Three claims:
    //     (a) the agent door mints each form, the record carries it, and a
    //         FRAME goes BEHIND everything (a region drawn over what it
    //         encloses is a region a person must immediately send backwards);
    //     (b) typing in the note's own editor and blurring it commits ONE
    //         history entry with the text on the record — the canvas's keys
    //         are stopped at the field, so the letters do not reach the
    //         canvas's own shortcuts;
    //     (c) a frame's INTERIOR takes no gesture: `elementFromPoint` in the
    //         middle of a frame laid over a terminal panel answers the
    //         TERMINAL, which is the brief's requirement and the one thing a
    //         DOM read (not a screenshot) can prove.
    const NOTE_IDS = ['note.1 note-add mints each form with its record (a frame behind everything and larger), the note editor commits its text on blur with the canvas keys stopped at the field, and a frame laid over a panel takes no gesture in its interior — elementFromPoint in its middle answers the panel underneath']
    try {
      // The frame is SEEDED exactly over the terminal (a record on disk, the
      // ordinary door), because what is being proved is a property of the
      // rendered frame and not of where the mint happens to place one.
      layoutStore.save({ panels: [
        { id: 'ntTerm', x: 200, y: 200, w: 400, h: 300, z: 2, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'under the frame' },
        { id: 'ntOver', kind: 'note', x: 180, y: 180, w: 440, h: 340, z: 1, note: { form: 'frame', text: 'release work' } }
      ], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore()
      const reN = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await reN
      await settle()
      const sticky = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: 'note-add sticky' }, null, 4000)
      const freeText = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: 'note-add text' }, null, 4000)
      const frame = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: 'note-add frame' }, null, 4000)
      await settle(); flushLayoutStore()
      const notes = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces.flatMap((w) => w.panels).filter((p) => p.kind === 'note')
      const frameRecord = notes.find((p) => p.note.form === 'frame' && p.id !== 'ntOver')
      const stickyRecord = notes.find((p) => p.note.form === 'sticky')
      const termRecord = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces.flatMap((w) => w.panels).find((p) => p.id === 'ntTerm')
      // (b) Type into the sticky's own field and blur it.
      const typed = stickyRecord ? await wc.executeJavaScript(`(async () => {
        const f = document.querySelector('.panel[data-panel-id=${JSON.stringify(stickyRecord.id)}] [data-note-field]')
        if (!f) return false
        f.focus()
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(f, 'a thought worth keeping')
        f.dispatchEvent(new Event('input', { bubbles: true }))
        f.blur()
        return true })()`) : false
      await settle(); flushLayoutStore()
      const afterType = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces.flatMap((w) => w.panels).find((p) => p.id === (stickyRecord && stickyRecord.id))
      // (c) The SEEDED frame lies over the terminal: what does a click in its
      // middle hit? A DOM read, not a picture — the paint could look right
      // while the frame still swallowed every gesture.
      const hit = await wc.executeJavaScript(`(() => {
        const f = document.querySelector('.panel[data-panel-id="ntOver"]')
        const t = document.querySelector('.panel[data-panel-id="ntTerm"]')
        if (!f || !t) return false
        const r = f.getBoundingClientRect()
        const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
        return { inTerminal: t.contains(el), inFrame: f.contains(el), tag: el ? el.className.toString().slice(0, 40) : null } })()`)
      ok(NOTE_IDS[0],
        sticky && sticky.kind === 'ran' && freeText && freeText.kind === 'ran' && frame && frame.kind === 'ran' &&
          notes.length === 4 && notes.filter((p) => p.id !== 'ntOver').map((p) => p.note.form).sort().join(',') === 'frame,sticky,text' &&
          frameRecord && stickyRecord && termRecord &&
          frameRecord.z < termRecord.z && frameRecord.w > stickyRecord.w &&
          typed === true && afterType && afterType.note.text === 'a thought worth keeping' &&
          hit !== false && hit.inTerminal === true && hit.inFrame === false,
        JSON.stringify({ sticky, freeText, frame, notes, termZ: termRecord && termRecord.z, typed, afterType: afterType && afterType.note, hit }))
    } catch (nErr) {
      for (const id of NOTE_IDS) ok(id, false, 'threw: ' + String(nErr && nErr.message || nErr))
    }

    // M190 — feedback.1. THE DRAFT DOOR, and the claim that matters: this app
    //     SUBMITS NOTHING. The `link:open` calls are recorded by the harness,
    //     so the check reads the exact url the door opened: it is the
    //     repository's issues/new, it carries a title and a body, and a token
    //     planted in what the person typed is NOT in it. No credential is
    //     read and no request is made — the only outward thing is a link.
    const FB_IDS = ['feedback.1 the feedback door opens the repository\'s issues/new with a title and a body in the person\'s own browser, a planted token scrubbed out of it, and submits nothing itself']
    try {
      const opensBefore = linkOpens.length
      const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      const asked = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `feedback it broke and my token is ${token}` }, null, 6000)
      await settle()
      const opened = linkOpens.slice(opensBefore)
      const url = opened[0] && (opened[0].target || opened[0])
      ok(FB_IDS[0],
        asked && asked.kind === 'ran' && /nothing was sent/.test(String(asked.summary)) &&
          opened.length === 1 && typeof url === 'string' &&
          url.startsWith('https://github.com/') && url.includes('/issues/new?title=') && url.includes('&body=') &&
          !url.includes(token) && !decodeURIComponent(url).includes(token) &&
          /Nothing has been sent/.test(decodeURIComponent(url)),
        JSON.stringify({ asked, openedCount: opened.length, urlHead: typeof url === 'string' ? url.slice(0, 80) : url, hasToken: typeof url === 'string' && decodeURIComponent(url).includes(token) }))
    } catch (fbErr) {
      for (const id of FB_IDS) ok(id, false, 'threw: ' + String(fbErr && fbErr.message || fbErr))
    }

    // M189 — portable.1. EXPORT AND IMPORT, END TO END IN THE REAL RENDERER.
    //     The canvas holds a terminal (never started), a sticky note and a
    //     watcher. Export writes one file: the terminal and the note travel,
    //     the WATCHER does not (it would arm itself on the other machine) and
    //     the file says so by name. Import then makes a SEPARATE workspace
    //     with new ids for everything — and the claim that matters, counted
    //     across the whole import: NO pty is spawned. An import that started
    //     what it read would be the one failure this feature cannot have.
    const PORT_IDS = ['portable.1 export writes one file with the objects that travel, the watcher omitted BY NAME with what it would do, and secrets scrubbed with a count; import makes a separate workspace with every id remapped, every imported template marked UNREVIEWED so its action node is refused until a person reads it, and spawns NO pty at all']
    try {
      const { readFileSync: rf2 } = require('node:fs')
      const filePath = join(mkdtempSync(join(tmpdir(), 'tc-portable-')), 'canvas.tccanvas')
      let before = null
      // A template with an ACTION node — the shape that makes an imported file
      // code somebody else wrote (M190's critic, 2).
      layoutStore.saveTemplate({ id: 'tpl-portable-1', name: 'theirs', nodes: [{ key: 'a1', kind: 'action', line: 'note-add sticky', cwd: '/tmp', dx: 0, dy: 0 }], edges: [] })
      state.portablePath = filePath
      layoutStore.save({ panels: [
        { id: 'pt1', x: 200, y: 200, w: 400, h: 300, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'a terminal ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' },
        { id: 'pt2', kind: 'note', x: 700, y: 200, w: 320, h: 220, z: 2, note: { form: 'sticky', text: 'remember this' } },
        // A WATCHER, whose whole point here is that it cannot travel: the file
        // must name it and say what it would do on the other machine.
        { id: 'pt3', kind: 'watcher', x: 200, y: 600, w: 400, h: 300, z: 3, watch: { cwd: '~', command: '/usr/bin/true', args: [], trigger: { kind: 'timer', everyMs: 60000 } } }
      ], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore()
      const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
      const diskIds = onDisk.workspaces.map((w) => `${w.id}${w.id === onDisk.activeWorkspaceId ? '*' : ''}:${w.panels.map((p) => p.id).join('|')}`).join(' ; ')
      const rePt = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await rePt
      await settle()
      const spawnsBefore = (await listSessions(wc)).length
      // The workspace this check leaves the app in is EVERY later check's
      // problem: the import makes a new one and switches to it, and a suite
      // that walked on from there would fail six checks with no idea why (it
      // did, once — the harness's own "checks share state" rule).
      before = await wc.executeJavaScript(`window.canvas.workspace.list().then((ws) => (ws.find((w) => w.active) || {}).id || null)`)
      // WAIT for the seeded canvas: `settle()` is not a mount guarantee, and
      // a plan sent before the canvas mounts reaches no listener at all — the
      // request then times out and reads as a refusal that never happened.
      const seeded = await waitUntil(() => wc.executeJavaScript(`(() => { const ids = [...document.querySelectorAll('.panel[data-panel-id]')].map((p) => p.getAttribute('data-panel-id')); return ids.includes('pt1') ? ids.join(',') : false })()`), 20000)
      // M190's critic (3). Export is DESTRUCTIVE now — a named path skips the
      // save dialog and writes it — so the agent door refuses it outright and
      // the person's door is the palette. Both are asserted: the refusal is
      // the guarantee, and the palette row is how the export actually happens
      // (the harness's chooser answers `state.portablePath`).
      const refusedAtDoor = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `export-canvas ${filePath}` }, null, 8000)
      const openPalette = async () => {
        await wc.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); true`)
        return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 3000)
      }
      const clickRow = async (rowId) => {
        if ((await openPalette()) !== true) return 'no palette'
        const r = await wc.executeJavaScript(`(() => { const el = document.querySelector('[data-command-id=' + JSON.stringify(${JSON.stringify('ROW')}) + ']'); if (!el) return 'no row'; el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true })()`.replace('ROW', rowId))
        await settle()
        return r
      }
      const exported = await clickRow('portable.export')
      await waitUntil(() => existsSync(filePath), 8000)
      const written = existsSync(filePath) ? JSON.parse(rf2(filePath, 'utf8')) : null
      const imported = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `import-canvas ${filePath}` }, null, 10000)
      await settle()
      await settle()
      const spawnsAfter = (await listSessions(wc)).length
      const shown = await wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-id]')].map((p) => p.getAttribute('data-panel-id')).join(',')`)
      // The imported template is UNREVIEWED, and running it is refused by name
      // with its line quoted — the import is inert, and so is the first Run.
      flushLayoutStore()
      const importedTemplate = layoutStore.current().templates.find((t) => t.reviewed === false)
      const ranImported = importedTemplate === undefined ? null : await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `workflow-run ${importedTemplate.id}` }, null, 6000)
      await settle()
      const notesAfterRun = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-kind="note"]').length`)
      ok(PORT_IDS[0],
        refusedAtDoor && refusedAtDoor.kind === 'refused' && /human confirmation/.test(String(refusedAtDoor.reason)) &&
          exported === true &&
          written && written.version === 1 && written.workspace.panels.length === 2 &&
          written.workspace.panels.map((p) => p.id).join(',') === 'pt1,pt2' &&
          !JSON.stringify(written).includes('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') && written.redacted >= 1 &&
          written.omitted.some((o) => /watcher/.test(o.what) && /arm itself/.test(o.why)) &&
          written.assets.length === 0 &&
          imported && imported.kind === 'ran' && /nothing was started/.test(String(imported.summary)) &&
          // Every id is new: neither of the exported ids is on the canvas now.
          !shown.split(',').includes('pt1') && !shown.split(',').includes('pt2') && shown.split(',').filter((x) => x !== '').length === 2 &&
          spawnsAfter === spawnsBefore &&
          // The imported template travelled, is marked unreviewed, and its Run
          // is refused by name — the sticky note its action node would make is
          // not on the canvas.
          importedTemplate !== undefined && importedTemplate.name === 'theirs' && importedTemplate.id !== 'tpl-portable-1' &&
          ranImported !== null && ranImported.kind === 'ran' && notesAfterRun === 1,
        JSON.stringify({ refusedAtDoor, importedTemplate: importedTemplate && { id: importedTemplate.id, reviewed: importedTemplate.reviewed }, ranImported, notesAfterRun, diskIds, seeded, exported, written: written && { version: written.version, panels: written.workspace.panels.map((p) => p.id), omitted: written.omitted, redacted: written.redacted }, imported, shown, spawnsBefore, spawnsAfter }))
      state.portablePath = undefined
      layoutStore.deleteTemplate('tpl-portable-1')
    } catch (ptErr) {
      for (const id of PORT_IDS) ok(id, false, 'threw: ' + String(ptErr && ptErr.stack || ptErr))
    } finally {
      // Back to the workspace this check found, and the imported one removed,
      // whatever happened above.
      try {
        const after = await wc.executeJavaScript(`window.canvas.workspace.list().then((ws) => (ws.find((w) => w.active) || {}).id || null)`)
        if (before && after && after !== before) {
          await wc.executeJavaScript(`window.canvas.workspace.activate(${JSON.stringify(before)})`)
          await settle()
          await wc.executeJavaScript(`window.canvas.workspace.remove(${JSON.stringify(after)})`)
          const reBack = new Promise((resolve) => wc.once('did-finish-load', resolve))
          wc.reload(); await reBack
          await settle()
        }
      } catch { /* the checks below will say so */ }
    }

    // M188 — node.1. THE WORKFLOW DOOR, AND TEST THIS NODE.
    //     (a) An `action` node holds a verb LINE, and running the workflow
    //         runs it through the same executor the palette and the agent door
    //         take — which is the workflow door every v9 verb's V9_DOORS row
    //         has owed since M180. Running a template whose action node says
    //         `note-add sticky` puts a sticky note on the canvas.
    //     (b) Test this node runs ONE node: the fetch node's POST is refused
    //         by name (the method as written, not silently rewritten), the
    //         GET answers with its body through the outward gate, and NEITHER
    //         starts a neighbour — the panel count is the same before and
    //         after, and no run is recorded.
    const NODE_IDS = ['node.1 an action node runs its verb line through the one executor when the workflow runs (the workflow door), and Test this node runs one block on its own: a fetch node\'s POST is refused naming the method, its GET answers through the outward gate, and neither starts a neighbour or records a run']
    try {
      const TPL = 'tpl-nodes-1'
      layoutStore.saveTemplate({ id: TPL, name: 'nodes', nodes: [
        { key: 'a1', kind: 'action', line: 'note-add sticky', cwd: '/tmp', dx: 0, dy: 0 },
        { key: 'h1', kind: 'http', url: 'https://example.com/thing', method: 'GET', cwd: '/tmp', dx: 200, dy: 0 },
        { key: 'h2', kind: 'http', url: 'https://example.com/thing', method: 'POST', cwd: '/tmp', dx: 400, dy: 0 }
      ], edges: [] })
      layoutStore.save({ panels: [{ id: 'wfn', kind: 'workflow', x: 40, y: 40, w: 760, h: 520, z: 1, title: 'nodes', workflow: { templateId: TPL } }], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'wfn', focusedId: 'wfn' })
      flushLayoutStore()
      const reNd = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await reNd
      await settle()
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-workflow-block="a1"]') !== null`), 5000)
      const before = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-id]').length`)
      // (b) first, so the panel count is unchanged by anything but the run.
      const post = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `node-test ${TPL} h2` }, null, 5000)
      const get = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `node-test ${TPL} h1` }, null, 5000)
      const missing = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `node-test ${TPL} nope` }, null, 5000)
      await settle()
      const afterTests = await wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-id]').length`)
      // (a) The workflow door: Run the template and look for the sticky note.
      const ran = await ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line: `workflow-run ${TPL}` }, null, 8000)
      const sticky = await waitUntil(() => wc.executeJavaScript(`(() => { const n = [...document.querySelectorAll('.panel[data-panel-kind="note"]')].pop(); return n ? { form: n.getAttribute('data-note-form') } : false })()`), 8000)
      await settle(); flushLayoutStore()
      const runs = (JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')).workspaces.flatMap((w) => w.runs || [])).length
      ok(NODE_IDS[0],
        post && post.kind === 'refused' && /POST is a write/.test(String(post.reason)) && /h2/.test(String(post.reason)) &&
          get && get.kind === 'ran' && /200/.test(String(get.summary)) && /h1/.test(String(get.summary)) &&
          missing && missing.kind === 'refused' && /no node is called nope/.test(String(missing.reason)) &&
          afterTests === before &&
          ran && ran.kind === 'ran' && sticky !== false && sticky.form === 'sticky' &&
          runs === 0,
        JSON.stringify({ before, post, get, missing, afterTests, ran, sticky, runs }))
      layoutStore.deleteTemplate(TPL)
    } catch (ndErr) {
      for (const id of NODE_IDS) ok(id, false, 'threw: ' + String(ndErr && ndErr.message || ndErr))
    }

    // M106 — header.1 / flip.1. HEADER DISCIPLINE in the real renderer: a
    // narrow frame with a long title keeps every chrome control inside its
    // box and carries the full title in `title`; FLIP turns every terminal to
    // its far-view summary and back through the menu's own event.
    {
      const IDS = ['header.1 a 320px frame with a long title keeps every chrome control visible inside the frame, the title is ellipsised (narrower than its text) and the full title lives in its title attribute', 'flip.1 canvas:flip turns every terminal — a LIVE one included, not only the carded — to the far-view summary (the title large, the state beneath), a second flip turns them back, and (M121) a flipped canvas is UNFLIPPED by a workspace switch: the host loses data-flipped on the way out and the panels come back unflipped on the way back', 'menu.1 the ⋯ menu opens on its button, stays open on a mousedown inside itself, and closes on a mousedown anywhere outside it (the canvas host) — without a click on its own close verb']
      try {
        layoutStore.save({ panels: [{ id: 'hdA', x: 100, y: 100, w: 320, h: 240, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'review: a very long title that would truncate to Revie in a narrow frame' }, { id: 'hdB', x: 500, y: 100, w: 520, h: 340, z: 2, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'worker b' }], camera: { x: 0, y: 0, scale: 1 }, selectedId: 'hdA', focusedId: 'hdA' })
        flushLayoutStore()
        const reH = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reH
        await settle()
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="hdA"] .pf__title') !== null`), 6000)
        const header = await wc.executeJavaScript(`(() => {
          const p = document.querySelector('.panel[data-panel-id="hdA"]'); if (!p) return null
          const frame = p.getBoundingClientRect()
          const t = p.querySelector('.pf__title')
          const controls = [...p.querySelectorAll('.pf__chrome .pf__verb, .pf__chrome .pf__close, .pf__chrome .pf__menu-open')]
          const inside = controls.map((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.right <= frame.right + 1 && r.left >= frame.left - 1 })
          return { title: t ? t.getAttribute('title') : null, clipped: t ? t.scrollWidth > t.clientWidth : null, controls: controls.length, inside: inside.every(Boolean), text: t ? t.textContent : null }
        })()`)
        ok(IDS[0], header !== null && typeof header.title === 'string' && /Revie in a narrow frame$/.test(header.title) && header.clipped === true && header.controls >= 2 && header.inside === true,
          JSON.stringify(header))
        // M121 — menu.1. THE OUTSIDE CLICK. The menu closed only on its own
        // `close menu` verb or Escape; a mousedown anywhere else left it open
        // over whatever the user did next. The button is a shellControl (its
        // mousedown preventDefaults, its click runs), so the menu opens on a
        // CLICK; the outside gesture is a MOUSEDOWN on the canvas host — the
        // same event that starts a pan — and a mousedown inside the menu must
        // not close it (the menu's own verbs are mousedown-then-click).
        const menuOpened = await wc.executeJavaScript(`(() => {
          const b = document.querySelector('.panel[data-panel-id="hdA"] [data-panel-more]'); if (!b) return 'no button'
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
          return true
        })()`)
        // The click's state update lands on React's next render, never synchronously.
        const menuOpenedNow = menuOpened === true && await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="hdA"] [data-panel-menu]') !== null`), 3000)
        const menuInside = await wc.executeJavaScript(`(() => {
          const t = document.querySelector('.panel[data-panel-id="hdA"] [data-panel-menu-title]'); if (!t) return 'no title'
          const r = t.getBoundingClientRect()
          t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 2, clientY: r.top + 2 }))
          return document.querySelector('.panel[data-panel-id="hdA"] [data-panel-menu]') !== null
        })()`)
        await wc.executeJavaScript(`(() => { const c = document.querySelector('.canvas'); if (!c) return false
          c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 600 }))
          c.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 600 })); return true })()`)
        const menuClosed = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="hdA"] [data-panel-menu]') === null`), 3000)
        ok(IDS[2], menuOpenedNow === true && menuInside === true && menuClosed === true, JSON.stringify({ menuOpened, menuInside, menuClosed }))
        // Wake hdB so the flip is measured on a LIVE panel: the first version of
        // this check passed on two dormant (carded) panels while a running
        // terminal did not turn over at all.
        await wc.executeJavaScript(`(() => { const card = document.querySelector('.panel[data-panel-id="hdB"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        const liveB = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="hdB"] .panel__slot') !== null`), 10000)
        // M149 — menu.paint.1 (audit F.12). The menu must be ON TOP of a LIVE
        // terminal's body, not merely in the DOM: M144's transform made the
        // chrome a stacking context that painted under the positioned slot
        // after it, so the open menu was invisible — menu.1 above, reading
        // the DOM, stayed green through it. elementFromPoint at the menu
        // title's centre is the pixel-level question.
        const menuPaint = liveB !== false ? await (async () => {
          await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="hdB"] [data-panel-more]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
          const open = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="hdB"] [data-panel-menu]') !== null`), 3000)
          const onTop = await wc.executeJavaScript(`(() => { const t = document.querySelector('.panel[data-panel-id="hdB"] [data-panel-menu-title]'); if (!t) return 'no title'
            const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            return top ? (top.closest('[data-panel-menu]') !== null ? true : (top.className || top.tagName)) : 'nothing' })()`)
          await wc.executeJavaScript(`(() => { const c = document.querySelector('.canvas'); if (!c) return false
            c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 600 }))
            c.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 600 })); return true })()`)
          await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="hdB"] [data-panel-menu]') === null`), 3000)
          return { open, onTop }
        })() : { open: false, onTop: 'hdB never woke' }
        ok('menu.paint.1 the ⋯ menu opened on a LIVE terminal is the element under its own title\'s centre — painted above the body, not merely present in the DOM', menuPaint.open === true && menuPaint.onTop === true, JSON.stringify(menuPaint))
        win.webContents.send(IPC_EVENTS.CANVAS_FLIP)
        const flipped = await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('.panel[data-panel-id="hdA"] [data-card-summary], .panel[data-panel-id="hdB"] [data-card-summary]').length === 2`), 3000)
        const summaryTitle = await wc.executeJavaScript(`(() => { const s = document.querySelector('.panel[data-panel-id="hdB"] .panel__card-summary-title'); return s ? s.textContent : null })()`)
        win.webContents.send(IPC_EVENTS.CANVAS_FLIP)
        const back = await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('[data-card-summary]').length === 0`), 3000)
        const slotBack = await wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="hdB"] .panel__slot') !== null`)
        // M121. Flip is a VIEW state and a workspace switch is a new view: a
        // flipped canvas that stayed flipped across a switch showed the incoming
        // workspace's panels as summaries with nothing on screen saying why
        // (verifier 12). The host stamps data-flipped so the state is readable
        // as a fact, not inferred from what happens to be rendered.
        win.webContents.send(IPC_EVENTS.CANVAS_FLIP)
        const flippedAgain = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.canvas') !== null && document.querySelector('.canvas').hasAttribute('data-flipped') && document.querySelectorAll('[data-card-summary]').length === 2`), 3000)
        // The seeded panels live in whatever workspace is ACTIVE here (earlier blocks create and delete workspaces), never in a literal `w1`.
        const homeWs = await activeWorkspaceId(wc)
        const flipWs = await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('flip-away')`)
        await settle()
        const unflippedAway = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.canvas') !== null && !document.querySelector('.canvas').hasAttribute('data-flipped')`), 3000)
        await wc.executeJavaScript(`window.__m7aWorkspace().switchTo(${JSON.stringify(homeWs)})`)
        await settle()
        const backUnflipped = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="hdB"]') !== null && !document.querySelector('.canvas').hasAttribute('data-flipped')`), 6000)
        ok(IDS[1], liveB === true && flipped === true && summaryTitle === 'worker b' && back === true && slotBack === true && flippedAgain === true && typeof flipWs === 'string' && unflippedAway === true && backUnflipped === true,
          JSON.stringify({ liveB, flipped, summaryTitle, back, slotBack, flippedAgain, flipWs, unflippedAway, backUnflipped }))
      } catch (hErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(hErr && hErr.message || hErr))
      }
    }

    // M116 — board.1. THE BOARD PANE END TO END: seeded records become the
    // pane's rows (by title); exactly two columns carry `data-board-drop` and
    // they are the FIRST and the LAST of the four (todo and done — the
    // user's, read structurally so this file spells no state word); a card
    // on the canvas carries its item's state in `data-work-state` and the
    // frame's state pill; a row click moves the CAMERA and leaves the focus
    // exactly where it was (the minimap's rule — navigating is not
    // interacting); the item with no card offers Show on canvas.
    {
      const IDS = ['board.1 the Board pane lists every seeded item under its state column, marks exactly the first and last columns droppable, a working card carries data-work-state and the state pill, a row click flies the camera without moving the focus, and an uncarded item offers Show on canvas']
      try {
        const WORKING = 'working', TODO = 'todo'
        layoutStore.save({
          panels: [
            { id: 'bdT', x: 100, y: 100, w: 400, h: 240, z: 1, cwd: '~', command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'lane' },
            { id: 'bdA', kind: 'work', x: 2400, y: 2400, w: 640, h: 180, z: 2, title: 'Fix the flush gate', work: { itemId: 'wi-a' } }
          ],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: 'bdT',
          workItems: [
            { id: 'wi-a', source: 'github', key: 'acme/canvas#7', title: 'Fix the flush gate', url: 'https://github.com/acme/canvas/issues/7', state: WORKING, teammateId: 'nobody', panelId: 'bdT', createdAt: 10, updatedAt: 20 },
            { id: 'wi-b', source: 'typed', title: 'Write the release note', state: TODO, createdAt: 5, updatedAt: 6 }
          ]
        })
        flushLayoutStore()
        const reB = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reB
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="board"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const pane = await waitUntil(() => wc.executeJavaScript(`(() => {
          const p = document.querySelector('[data-board-pane]'); if (!p) return false
          const cols = [...p.querySelectorAll('[data-board-column]')]
          if (cols.length !== 4) return false
          const rowOf = (id) => p.querySelector('[data-board-row="' + id + '"]')
          const a = rowOf('wi-a'), b = rowOf('wi-b'); if (!a || !b) return false
          return {
            columns: cols.map((c) => c.getAttribute('data-board-column')),
            drops: cols.map((c) => c.hasAttribute('data-board-drop')),
            aColumn: a.closest('[data-board-column]').getAttribute('data-board-column'),
            bColumn: b.closest('[data-board-column]').getAttribute('data-board-column'),
            aLabel: a.querySelector('.rail-row__label')?.textContent ?? null,
            aTail: a.querySelector('.board-row__facts')?.textContent ?? null,
            aShow: a.querySelector('[data-board-show]') !== null,
            bShow: b.querySelector('[data-board-show]') !== null
          }
        })()`), 6000)
        const card = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.panel[data-panel-id="bdA"]'); if (!n) return null
          return { kind: n.getAttribute('data-panel-kind'), state: n.getAttribute('data-work-state'), word: n.querySelector('[data-work-word]')?.textContent ?? null, verbs: [...n.querySelectorAll('[data-work-verb]')].map((v) => [v.getAttribute('data-work-verb'), v.disabled, v.getAttribute('title')]) }
        })()`)
        const before = await wc.executeJavaScript(`({ vp: window.__m4aViewport(), focus: window.__m4aFocusedId() })`)
        await wc.executeJavaScript(`(() => { const r = document.querySelector('[data-board-row="wi-a"] .rail-row__main'); if (r) r.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!r })()`)
        const moved = await waitUntil(() => wc.executeJavaScript(`(() => { const v = window.__m4aViewport(); return (Math.abs(v.x - ${before ? before.vp.x : 0}) > 1 || Math.abs(v.y - ${before ? before.vp.y : 0}) > 1) ? v : false })()`), 3000)
        const after = await wc.executeJavaScript(`({ vp: window.__m4aViewport(), focus: window.__m4aFocusedId() })`)
        ok(IDS[0],
          pane && pane.columns.length === 4 && new Set(pane.columns).size === 4 &&
            pane.drops.join(',') === 'true,false,false,true' && pane.columns[0] === TODO && pane.columns[1] === WORKING &&
            pane.aColumn === WORKING && pane.bColumn === TODO && pane.aLabel === 'Fix the flush gate' && /acme\/canvas#7/.test(pane.aTail ?? '') && /lane/.test(pane.aTail ?? '') &&
            pane.aShow === false && pane.bShow === true &&
            // M202 (D07) added a FIFTH verb, `resume`, beside the four — an addition,
            // never a rename: the DOM aliases the other four wear are what roughly
            // two hundred checks select on. The count is asserted rather than
            // loosened so a sixth cannot arrive unnoticed. M203 (D08) IS that
            // sixth, on purpose: `show`, the card's door onto Show this task —
            // an addition beside the five, never a rename of one.
            card && card.kind === 'work' && card.state === WORKING && (card.word ?? '').startsWith(WORKING) && card.verbs.length === 6 && card.verbs.every((v) => v[1] === false || (v[2] ?? '') !== '') &&
            moved !== false && before && after && before.focus === 'bdT' && after.focus === 'bdT',
          JSON.stringify({ pane, card, before, after, moved }))
      } catch (bdErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(bdErr && bdErr.message || bdErr))
      }
    }

    /* ========== M201–M202 (D07): the review handoff ===================== */
    // The card answers "what should I do with this result?" from FACTS — a
    // real fork diff in a real linked worktree — and the review it opens
    // carries the task beside the diff. Every failure this guards is silent:
    // a card reading `ready to review` while its agent is still writing, a
    // review mark that never goes stale so a second look is never offered,
    // or a task section over a lane that is not there.
    {
      const IDS = [
        'work.action.1 a card with a real lane reads its readiness from the lane\'s FORK diff — `ready to review`, the review verb enabled, the board disposition pill unchanged beside it, and the fact-chosen next action marked on exactly one verb — while a card with no lane says `not started`, refuses Review by name, and points at Start work instead',
        'review.task.2 the card\'s Review opens a review carrying the task id and paints the handoff word; the evidence list renders one row per command run IN THE LANE, failures first, each with the exit code this canvas read and the words saying who watched it exit, with a command from outside the lane excluded; marking writes the signature to the item and the word becomes `reviewed`; a change in the lane makes it `changed since you reviewed`; and the route back to the agent is refused BY NAME over a lane that is not a conversation'
      ]
      const repoD = mkdtempSync(join(tmpdir(), 'tc panels d07 repo '))
      const laneD = mkdtempSync(join(tmpdir(), 'tc panels d07 lane '))
      try {
        const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
        g(repoD, 'init', '-q', '.'); g(repoD, 'config', 'user.email', 'v@e.com'); g(repoD, 'config', 'user.name', 'v')
        writeFileSync(join(repoD, 'a.txt'), 'a\n'); g(repoD, 'add', '-A'); g(repoD, 'commit', '-qm', 'init')
        // A REAL linked worktree, so `review:across` computes a real fork
        // point. A fake directory would answer `baseline-lost` and the check
        // would pass for the wrong reason.
        const lanePath = join(laneD, 'work')
        g(repoD, 'worktree', 'add', '-q', '-b', 'tc/d07', lanePath)
        // One uncommitted change in the lane: the diff the card must see.
        writeFileSync(join(lanePath, 'b.txt'), 'b\n')
        // A REAL run-ledger row for a command that ran IN THE LANE and
        // exited non-zero, so the evidence list has an `observed` row to
        // render — the half of the attribution only this app can produce, and
        // the half no pure check can reach. Written through the harness's own
        // ledger, which is the same writer PtyManager appends through.
        await runLedger.append({ panelId: 'd07T', command: 'npm run verify', cwd: realpathSync(lanePath), startedAt: 1, endedAt: 2, exitCode: 1 })
        await runLedger.append({ panelId: 'd07T', command: 'echo hello', cwd: realpathSync(lanePath), startedAt: 3, endedAt: 4, exitCode: 0 })
        // A row from OUTSIDE the lane, which must not appear.
        await runLedger.append({ panelId: 'd07T', command: 'ls /elsewhere', cwd: realpathSync(repoD), startedAt: 5, endedAt: 6, exitCode: 0 })

        layoutStore.addWorktree({ id: 'wt-d07', root: realpathSync(repoD), path: realpathSync(lanePath), branch: 'tc/d07', createdAt: 1, panelId: 'd07T' })
        layoutStore.save({
          panels: [
            { id: 'd07T', x: 100, y: 100, w: 400, h: 240, z: 1, cwd: realpathSync(lanePath), command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'lane' },
            { id: 'd07A', kind: 'work', x: 900, y: 100, w: 640, h: 220, z: 2, title: 'Fix the flush gate', work: { itemId: 'wi-d07' } },
            { id: 'd07B', kind: 'work', x: 900, y: 500, w: 640, h: 220, z: 3, title: 'Not started yet', work: { itemId: 'wi-none' } }
          ],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
          workItems: [
            { id: 'wi-d07', source: 'typed', title: 'Fix the flush gate', state: 'working', teammateId: 'nobody', panelId: 'd07T', worktreeId: 'wt-d07', createdAt: 10, updatedAt: 20 },
            { id: 'wi-none', source: 'typed', title: 'Not started yet', state: 'todo', createdAt: 5, updatedAt: 6 }
          ]
        })
        flushLayoutStore()
        const reD = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reD
        await settle()

        const cardState = (id) => wc.executeJavaScript(`(() => {
          const n = document.querySelector('.panel[data-panel-id="${id}"]'); if (!n) return false
          const r = n.querySelector('[data-work-readiness]')
          const verb = n.querySelector('[data-work-verb="review"]')
          if (!r) return false
          return {
            readiness: r.getAttribute('data-work-readiness'), standing: r.getAttribute('data-work-standing'), word: r.textContent,
            disposition: n.getAttribute('data-work-state'), pill: n.querySelector('[data-work-word]') ? n.querySelector('[data-work-word]').textContent : null,
            verbLabel: verb ? verb.textContent : null, verbDisabled: verb ? verb.disabled : null, verbTitle: verb ? verb.getAttribute('title') : null,
            resume: !!n.querySelector('[data-work-verb="resume"]'),
            next: (n.querySelector('[data-work-next]') || {}).getAttribute ? n.querySelector('[data-work-next]').getAttribute('data-work-next') : null,
            nextVerb: (n.querySelector('[data-work-next]') || {}).getAttribute ? n.querySelector('[data-work-next]').getAttribute('data-work-verb') : null,
            nextCount: n.querySelectorAll('[data-work-next]').length
          }
        })()`)
        // The readiness line appears only once the fork diff has been read —
        // the third state: before that the card says nothing about review.
        const ready = await waitUntil(async () => { const c = await cardState('d07A'); return c && c.readiness === 'ready' ? c : false }, 15000)
        const none = await waitUntil(async () => { const c = await cardState('d07B'); return c && c.readiness === 'no-lane' ? c : false }, 8000)

        // ---- review.task.2: the card's Review, pressed as a person does ----
        // mousedown and click in SEPARATE tasks (M195's lesson: a handler
        // that focuses on mousedown and then refuses cannot be seen by a
        // check that dispatches both in one task).
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="d07A"] [data-work-verb="review"]'); if (!b) return false
          b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="d07A"] [data-work-verb="review"]'); if (!b) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)

        const taskSection = () => wc.executeJavaScript(`(() => {
          const t = document.querySelector('[data-review-task]'); if (!t) return false
          const w = t.querySelector('[data-review-task-word]')
          const ev = t.querySelector('[data-review-evidence]')
          const mark = t.querySelector('[data-review-task-verb="mark"]')
          const cont = t.querySelector('[data-review-task-verb="continue"]')
          return {
            itemId: t.getAttribute('data-review-task'),
            state: w ? w.getAttribute('data-review-task-word') : null, standing: w ? w.getAttribute('data-review-task-standing') : null, word: w ? w.textContent : null,
            detail: (t.querySelector('[data-review-task-detail]') || {}).textContent || null,
            evidence: ev ? ev.getAttribute('data-review-evidence') : null, evidenceText: ev ? ev.textContent : null,
            rows: [...t.querySelectorAll('[data-review-evidence-row]')].map((r) => ({
              who: r.getAttribute('data-review-evidence-row'), outcome: r.getAttribute('data-review-evidence-outcome'),
              label: (r.querySelector('.review-node__evidence-outcome') || {}).textContent || null,
              command: (r.querySelector('.review-node__evidence-command') || {}).textContent || null,
              says: (r.querySelector('.review-node__evidence-who') || {}).textContent || null
            })),
            markDisabled: mark ? mark.disabled : null, markLabel: mark ? mark.textContent : null,
            contDisabled: cont ? cont.disabled : null, contTitle: cont ? cont.getAttribute('title') : null,
            panelId: t.closest('.panel').getAttribute('data-panel-id')
          }
        })()`)
        const opened = await waitUntil(async () => { const t = await taskSection(); return t && t.state === 'ready' && t.evidence !== 'reading' && t.rows.length > 0 ? t : false }, 15000)
        const subjectSaved = await waitUntil(() => {
          layoutStore.flushSync()
          const p = (layoutStore.initial().panels || []).find((q) => q.kind === 'review')
          return p && p.subject && p.subject.workItemId === 'wi-d07' ? p.subject : false
        }, 6000)

        // ---- Mark reviewed: the one persisted fact ----
        await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-review-task-verb="mark"]'); if (!b || b.disabled) return false
          b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const marked = await waitUntil(() => {
          layoutStore.flushSync()
          const it = (layoutStore.initial().workItems || []).find((i) => i.id === 'wi-d07')
          return it && it.reviewed ? it.reviewed : false
        }, 8000)
        const afterMark = await waitUntil(async () => { const c = await cardState('d07A'); return c && c.standing === 'current' ? c : false }, 8000)

        // ---- and it goes STALE when the lane moves ----
        writeFileSync(join(lanePath, 'c.txt'), 'c\n')
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.review-node__refresh'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        // The card reads on a chat turn ending or a root-set change, so the
        // refresh here is the node's; the card is re-read by remounting it.
        const reD2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reD2
        await settle()
        const stale = await waitUntil(async () => { const c = await cardState('d07A'); return c && c.standing === 'stale' ? c : false }, 15000)

        // ---- Continue the conversation INSERTS and sends nothing ----
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="d07A"] [data-work-verb="review"]'); if (!b) return false
          b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="d07A"] [data-work-verb="review"]'); if (!b) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const reopened = await waitUntil(async () => { const t = await taskSection(); return t && t.evidence !== 'reading' ? t : false }, 15000)
        // The lane here is a TERMINAL, not a chat, so the route back is
        // refused BY NAME rather than silently absent — the honest arm, and
        // the one the card's own `resume` refusal shares.
        ok(IDS[0],
          ready !== false && none !== false &&
            ready.readiness === 'ready' && ready.standing === 'none' && /ready to review/.test(ready.word) &&
            ready.verbDisabled === false && /Review/.test(ready.verbLabel) &&
            // The board disposition is untouched by any of it.
            ready.disposition === 'working' && (ready.pill || '').indexOf('working') === 0 &&
            ready.resume === true &&
            // The one action the facts chose, marked on the verb that
            // performs it — and marked exactly once, so "the card offers one
            // action" is a property of the DOM and not of the prose.
            ready.next === 'review' && ready.nextVerb === 'review' && ready.nextCount === 1 &&
            none.readiness === 'no-lane' && none.verbDisabled === true && (none.verbTitle || '').length > 20 &&
            none.disposition === 'todo' &&
            none.next === 'start' && none.nextVerb === 'assign' && none.nextCount === 1,
          JSON.stringify({ ready, none }))
        ok(IDS[1],
          opened !== false && subjectSaved !== false && marked !== false && afterMark !== false && stale !== false && reopened !== false &&
            opened.itemId === 'wi-d07' && opened.state === 'ready' && opened.standing === 'none' &&
            (opened.detail || '').length > 20 &&
            // The evidence rows, rendered. Two commands ran in the lane and a
            // third ran outside it; only the two are here, the FAILURE sorts
            // first, each row carries its exit code and says in words who
            // watched it exit. This is the DOM half that no pure check can
            // reach, and it is the whole point of the attribution.
            opened.evidence === '2' && opened.rows.length === 2 &&
            opened.rows.every((r) => r.who === 'observed' && /this canvas ran it/.test(r.says || '')) &&
            opened.rows[0].outcome === 'failed' && opened.rows[0].command === 'npm run verify' && opened.rows[0].label === 'exit 1' &&
            opened.rows[1].outcome === 'passed' && opened.rows[1].command === 'echo hello' && opened.rows[1].label === 'exit 0' &&
            opened.rows.every((r) => r.command !== 'ls /elsewhere') &&
            opened.markDisabled === false && /Mark reviewed/.test(opened.markLabel) &&
            // The lane here is a TERMINAL. `insertIntoComposer` is a no-op
            // for anything but a chat, so the route back is refused BY NAME
            // rather than left enabled and silently doing nothing — which is
            // what it did until this check was written.
            opened.contDisabled === true && (opened.contTitle || '').length > 20 &&
            typeof marked.signature === 'string' && marked.signature.length === 8 && marked.files === 1 && typeof marked.at === 'number' &&
            afterMark.standing === 'current' && /reviewed/.test(afterMark.word) &&
            stale.standing === 'stale' && /changed since/.test(stale.word) &&
            reopened.standing === 'stale' && /Mark reviewed again/.test(reopened.markLabel) &&
            reopened.rows.length === 2,
          JSON.stringify({ opened, subjectSaved, marked, afterMark, stale, reopened }))
      } catch (d07Err) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(d07Err && d07Err.message || d07Err))
      } finally {
        try { layoutStore.dropWorktree('wt-d07') } catch { /* nothing recorded */ }
        try { layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }); flushLayoutStore() } catch { /* the next check saves its own */ }
        try { const re = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await re; await settle() } catch { /* nothing to drain */ }
        for (const d of [repoD, laneD]) { try { rmSync(d, { recursive: true, force: true }) } catch { /* gone */ } }
      }
    }

    /* ========== M203 (D08): Show this task ============================== */
    // A task is FRAMED from facts, never from position: the card, the
    // terminal the item names as its conversation, and a terminal working
    // inside the lane's real directory are shown; a terminal TOUCHING the card
    // with nothing in common is not a member, and a far unrelated one stays
    // out of frame. Every door is a camera move and nothing else — the saved
    // rects and the live PTYs are compared before and after — and the move
    // goes on the TRAIL, so Cmd+[ returns the person to where they were.
    {
      const IDS = [
        'task.show.1 a card\'s Show, pressed as a person does, frames the card, its conversation and a terminal in the lane while a far unrelated panel stays out of frame; Cmd+[ returns the camera to where it was; the agent door shows the same task from a MEMBER and says how many panels it framed, and refuses by name for a panel touching the card that is in no task; no rect moved and no PTY ended'
      ]
      const laneD = mkdtempSync(join(tmpdir(), 'tc panels d08 lane '))
      const elseD = mkdtempSync(join(tmpdir(), 'tc panels d08 else '))
      try {
        const lane = realpathSync(laneD)
        const other = realpathSync(elseD)
        layoutStore.addWorktree({ id: 'wt-d08', root: other, path: lane, branch: 'tc/d08', createdAt: 1, panelId: 't8C' })
        const term = (id, x, y, cwd, z) => ({ id, x, y, w: 400, h: 240, z, cwd, command: '/bin/sh', args: ['-c', 'sleep 600'], title: id })
        const saved = [
          term('t8C', 100, 100, lane, 1),
          term('t8X', 100, 1600, lane, 2),
          // Touching the card's left edge, in another directory, linked to nothing.
          term('t8U', 500, 100, other, 3),
          term('t8F', 7000, 7000, other, 4),
          { id: 'd8A', kind: 'work', x: 900, y: 100, w: 640, h: 220, z: 5, title: 'Frame the task', work: { itemId: 'wi-d08' } }
        ]
        layoutStore.save({
          panels: saved,
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
          workItems: [{ id: 'wi-d08', source: 'typed', title: 'Frame the task', state: 'working', teammateId: 'nobody', panelId: 't8C', worktreeId: 'wt-d08', createdAt: 10, updatedAt: 20 }]
        })
        flushLayoutStore()
        const reD = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reD
        await settle()
        const plan = (line) => ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line }, null, 3000)
        // Restored panels are DORMANT. Wake the conversation so a real PTY is
        // there to protect; leave t8X asleep ON PURPOSE — a dormant terminal
        // has no live cwd and no registry session, and it is still in the
        // lane (the defect this check's first run found).
        const woke = await plan('start t8C')
        await waitUntil(() => ptyManager.list().some((p) => p.id === 't8C'), 15000)
        await settle()
        const sessions = () => wc.executeJavaScript(`JSON.stringify(window.__m4aSessions().filter((s) => ['t8C', 't8X', 't8U', 't8F'].includes(s.id)).sort((a, b) => a.id < b.id ? -1 : 1))`)
        const paletteOpen = () => wc.executeJavaScript(`!!document.querySelector('[data-palette], .palette')`)
        const sessionsBefore = await sessions()

        const vp = () => wc.executeJavaScript('window.__m4aViewport()')
        const same = (a, b) => a && b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.scale - b.scale) < 0.001
        // A flight ends when two reads a frame apart agree and differ from where it started.
        const landed = async (from) => waitUntil(async () => {
          const a = await vp(); await new Promise((r) => setTimeout(r, 120)); const b = await vp()
          return same(a, b) && !same(a, from) ? b : false
        }, 6000)
        const framing = () => wc.executeJavaScript(`(() => {
          const W = window.innerWidth, H = window.innerHeight, out = {}
          for (const id of ['t8C', 't8X', 't8U', 't8F', 'd8A']) {
            const n = document.querySelector('.panel[data-panel-id="' + id + '"]'); if (!n) { out[id] = 'absent'; continue }
            const r = n.getBoundingClientRect()
            out[id] = r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H ? 'outside'
              : r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= H + 1 ? 'inside' : 'partial'
          }
          return out })()`)
        const ptysBefore = ptyManager.list().map((p) => p.id).sort().join(',')
        const vp0 = await vp()

        // ---- the card's Show, in two tasks (M195's lesson) ----
        const pressShow = async (type) => wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="d8A"] [data-work-verb="show"]'); if (!b) return false
          b.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, button: 0 })); return true })()`)
        const pressedDown = await pressShow('mousedown')
        await settle()
        await pressShow('click')
        const vp1 = await landed(vp0)
        const framed = await framing()
        // The WHOLE task was framed, so the card says nothing: no palette sits over what was just shown.
        const paletteAfterShow = await paletteOpen()

        // ---- Camera Back, as a keyboard does ----
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', code: 'BracketLeft', metaKey: true, bubbles: true }))`)
        const back = await landed(vp1)

        // ---- the agent door, from a MEMBER, and a refusal for a neighbour ----
        const fromMember = await plan('show-task t8X')
        const vp2 = await landed(back || vp0)
        const neighbour = await plan('show-task t8U')
        await settle()
        const vp3 = await vp()

        layoutStore.flushSync()
        const after = (layoutStore.initial().panels || []).filter((p) => saved.some((q) => q.id === p.id))
        const unmoved = saved.every((q) => { const a = after.find((p) => p.id === q.id); return a && a.x === q.x && a.y === q.y && a.w === q.w && a.h === q.h })
        const ptysAfter = ptyManager.list().map((p) => p.id).sort().join(',')
        const sessionsAfter = await sessions()
        ok(IDS[0],
          woke?.kind === 'ran' && pressedDown === true && paletteAfterShow === false &&
            // Framing woke nothing and ended nothing: the dormant terminals it brought on screen stay asleep.
            sessionsAfter === sessionsBefore && vp1 !== false && back !== false && vp2 !== false &&
            framed.d8A === 'inside' && framed.t8C === 'inside' && framed.t8X === 'inside' && framed.t8F !== 'inside' &&
            same(back, vp0) &&
            fromMember?.kind === 'ran' && /showing 3 panels of Frame the task/.test(JSON.stringify(fromMember)) && same(vp2, vp1) &&
            neighbour?.kind === 'refused' && /not part of any task/.test(neighbour.reason) && same(vp3, vp2) &&
            // The sessions are tmux-backed here, so ptyManager's list is empty on
            // both sides; the registry's session list above is the process fact.
            unmoved && ptysAfter === ptysBefore && /"t8C","dormant":false,"spawned":true/.test(sessionsAfter),
          JSON.stringify({ woke, pressedDown, paletteAfterShow, vp0, vp1, framed, back, fromMember, vp2, neighbour, vp3, unmoved, ptysBefore, ptysAfter, sessionsBefore, sessionsAfter }))
      } catch (d08Err) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(d08Err && d08Err.message || d08Err))
      } finally {
        try { layoutStore.dropWorktree('wt-d08') } catch { /* nothing recorded */ }
        try { layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }); flushLayoutStore() } catch { /* the next check saves its own */ }
        try { const re = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await re; await settle() } catch { /* nothing to drain */ }
        for (const d of [laneD, elseD]) { try { rmSync(d, { recursive: true, force: true }) } catch { /* gone */ } }
      }
    }

    /* ========== M204 (D08): Show related, the far overview, Arrange ====== */
    // The lens is PAINT: the task's panels are ringed, the rest dimmed, and no
    // rect, no screen box and no session changes. At far zoom the card shows
    // the task, not a transcript — read off a REAL fork diff, because a fake
    // directory would answer `baseline-lost` and the overview would pass for
    // the wrong reason. Arrange moves the task clear of an unrelated panel,
    // leaves a locked member where it is, and one undo puts every rect back.
    {
      const IDS = [
        'task.related.1 show-related rings every member (the card, the conversation, a DORMANT terminal in the lane, a locked one) and dims the unrelated panel, with the lens bar counting them; no screen box, rect or session changes; the ⋯ menu of the unrelated panel has no task section, a member\'s reads `Stop showing related`, and pressing it turns the lens off everywhere',
        'task.far.1 at far zoom the card\'s summary carries the task overview — the readiness word read from the lane\'s real fork diff and the key evidence (`1 file changed`) — under its title',
        'task.arrange.1 arrange-task from a member moves the task\'s unlocked panels clear of an unrelated panel and a locked member, keeps every size, leaves the unrelated and the locked panel where they were, and carries the DISPATCHED card with its conversation without ever writing the card or its anchor; the camera follows the arrangement; no session ends; ONE undo restores every rect; and the merged view refuses by name'
      ]
      const repoD = mkdtempSync(join(tmpdir(), 'tc panels d08b repo '))
      const laneD = mkdtempSync(join(tmpdir(), 'tc panels d08b lane '))
      const elseD = mkdtempSync(join(tmpdir(), 'tc panels d08b else '))
      try {
        const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
        g(repoD, 'init', '-q', '.'); g(repoD, 'config', 'user.email', 'v@e.com'); g(repoD, 'config', 'user.name', 'v')
        writeFileSync(join(repoD, 'a.txt'), 'a\n'); g(repoD, 'add', '-A'); g(repoD, 'commit', '-qm', 'init')
        const lanePath = join(laneD, 'work')
        g(repoD, 'worktree', 'add', '-q', '-b', 'tc/d08b', lanePath)
        writeFileSync(join(lanePath, 'b.txt'), 'b\n')
        const lane = realpathSync(lanePath)
        const other = realpathSync(elseD)
        layoutStore.addWorktree({ id: 'wt-d08b', root: realpathSync(repoD), path: lane, branch: 'tc/d08b', createdAt: 1, panelId: 't9C' })
        const term = (id, x, y, cwd, z, extra = {}) => ({ id, x, y, w: 400, h: 240, z, cwd, command: '/bin/sh', args: ['-c', 'sleep 600'], title: id, ...extra })
        const IDS9 = ['t9C', 't9X', 't9U', 't9L', 'd9A']
        const saved = [
          term('t9C', 100, 100, lane, 1),
          term('t9X', 100, 1600, lane, 2),
          // Unrelated, and exactly where plain compaction would put t9X.
          term('t9U', 520, 400, other, 3),
          term('t9L', 2000, 1600, lane, 4, { locked: true }),
          { id: 'd9A', kind: 'work', x: 900, y: 100, w: 640, h: 220, z: 5, title: 'Light the task', work: { itemId: 'wi-d08b' } }
        ]
        layoutStore.save({
          panels: saved,
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
          // The card is ANCHORED to its conversation (M114), so Arrange's follower path runs for real.
          workItems: [{ id: 'wi-d08b', source: 'typed', title: 'Light the task', state: 'working', teammateId: 'nobody', panelId: 't9C', worktreeId: 'wt-d08b', anchor: { panelId: 't9C', dx: 800, dy: 0 }, createdAt: 10, updatedAt: 20 }]
        })
        flushLayoutStore()
        const reD = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reD
        await settle()
        const plan = (line) => ctx.requestFromRendererWith(wc, IPC_EVENTS.CANVAS_PLAN, { line }, null, 3000)
        await plan('start t9C')
        await waitUntil(() => wc.executeJavaScript(`window.__m4aSessions().some((s) => s.id === 't9C' && s.spawned)`), 15000)
        await settle()
        const sessions = () => wc.executeJavaScript(`JSON.stringify(window.__m4aSessions().filter((s) => ${JSON.stringify(IDS9)}.includes(s.id)).sort((a, b) => a.id < b.id ? -1 : 1))`)
        const sizes = () => wc.executeJavaScript(`JSON.stringify(${JSON.stringify(IDS9)}.map((id) => { const n = document.querySelector('.panel[data-panel-id="' + id + '"]'); if (!n) return null; const r = n.getBoundingClientRect(); return [id, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }))`)
        const lensAttrs = () => wc.executeJavaScript(`(() => { const o = {}; for (const id of ${JSON.stringify(IDS9)}) { const n = document.querySelector('.panel[data-panel-id="' + id + '"]'); o[id] = n ? n.getAttribute('data-task-lens') : 'absent' }
          const bar = document.querySelector('[data-task-lens-bar]'); o.bar = bar ? (bar.querySelector('[data-task-lens-count]') || {}).textContent || '' : null; return o })()`)
        // Every control here is a shellControl: pressed in TWO tasks (M195).
        const press = async (selector) => {
          let found = false
          for (const type of ['mousedown', 'click']) {
            found = await wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return false; b.dispatchEvent(new MouseEvent('${type}', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
            await settle()
          }
          return found
        }
        const menuOf = (id) => wc.executeJavaScript(`(() => { const m = document.querySelector('.panel[data-panel-id="${id}"] [data-panel-menu]'); if (!m) return { open: false }
          const t = m.querySelector('[data-panel-menu-task]'); const rel = m.querySelector('[data-panel-menu-task-verb="related"]')
          return { open: true, task: t ? t.getAttribute('data-panel-menu-task') : null, related: rel ? rel.textContent : null } })()`)
        const sessionsBefore = await sessions()
        const sizesBefore = await sizes()
        const lensBefore = await lensAttrs()

        // ---- task.related.1 ----
        const on = await plan('show-related d9A')
        await settle()
        const lit = await lensAttrs()
        const sizesLit = await sizes()
        // Compared HERE, before any ⋯ press: opening a frame's ⋯ menu on a
        // dormant terminal wakes it (a press on the frame's chrome selects the
        // panel, since M106) — the menu's behaviour, not the lens's. The lens
        // itself must wake and end nothing.
        const sessionsLens = await sessions()
        await press('.panel[data-panel-id="t9U"] [data-panel-more]')
        const menuU = await menuOf('t9U')
        await press('.panel[data-panel-id="t9U"] [data-panel-menu-close]')
        await press('.panel[data-panel-id="t9X"] [data-panel-more]')
        const menuX = await menuOf('t9X')
        await press('.panel[data-panel-id="t9X"] [data-panel-menu-task-verb="related"]')
        const off = await lensAttrs()
        const noLens = (o) => IDS9.every((id) => o[id] === null) && o.bar === null
        ok(IDS[0],
          on?.kind === 'ran' && noLens(lensBefore) &&
            lit.d9A === 'member' && lit.t9C === 'member' && lit.t9X === 'member' && lit.t9L === 'member' && lit.t9U === 'other' &&
            /^4 related$/.test(lit.bar || '') &&
            sizesLit === sizesBefore &&
            menuU.open === true && menuU.task === null &&
            menuX.open === true && menuX.task === 'one' && /Stop showing related/.test(menuX.related || '') &&
            noLens(off) && sessionsLens === sessionsBefore,
          JSON.stringify({ on, lensBefore, lit, sizesBefore, sizesLit, menuU, menuX, off, sessionsBefore, sessionsLens }))

        // ---- task.far.1 ----
        const readiness = () => wc.executeJavaScript(`(() => { const r = document.querySelector('.panel[data-panel-id="d9A"] [data-work-readiness]'); return r ? r.getAttribute('data-work-readiness') : null })()`)
        const ready = await waitUntil(async () => (await readiness()) === 'ready', 15000)
        const cmd = (key, code) => wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, metaKey: true, bubbles: true }))`)
        const scale = () => wc.executeJavaScript('window.__m4aViewport().scale')
        for (let i = 0; i < 40 && (await scale()) >= 0.22; i += 1) await cmd('-', 'Minus')
        await settle()
        const farScale = await scale()
        const far = await waitUntil(() => wc.executeJavaScript(`(() => { const n = document.querySelector('.panel[data-panel-id="d9A"]'); if (!n || !n.querySelector('[data-card-summary]')) return false
          const f = n.querySelector('[data-work-far]'); if (!f) return false
          const t = (sel) => { const e = f.querySelector(sel); return e ? e.textContent : null }
          return { title: (n.querySelector('.panel__card-summary-title') || {}).textContent || null, readiness: t('[data-work-far-readiness]'), evidence: t('[data-work-far-evidence]') } })()`), 6000)
        await cmd('0', 'Digit0')
        await settle()
        ok(IDS[1],
          ready !== false && farScale < 0.22 && farScale > 0.11 && far !== false &&
            far.title === 'Light the task' && /ready to review/.test(far.readiness || '') && far.evidence === '1 file changed',
          JSON.stringify({ ready, farScale, far }))

        // ---- task.arrange.1 ----
        const sessionsPreArrange = await sessions()
        const vpPreArrange = await wc.executeJavaScript('window.__m4aViewport()')
        const arranged = await plan('arrange-task t9X')
        await settle()
        const rectsOf = () => wc.executeJavaScript(`Object.fromEntries(${JSON.stringify(IDS9)}.map((id) => { const n = document.querySelector('.panel[data-panel-id="' + id + '"]'); if (!n) return [id, null]
          const px = (v) => Math.round(parseFloat(v)); return [id, { x: px(n.style.left), y: px(n.style.top), w: px(n.style.width), h: px(n.style.height) }] }))`)
        const hits = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        // The renderer's save is COALESCED: wait for the store to hold a moved rect rather than reading it after one settle.
        const movedOf = (r) => saved.filter((q) => r[q.id] && (r[q.id].x !== q.x || r[q.id].y !== q.y)).map((q) => q.id)
        const after = (await waitUntil(async () => { const r = await rectsOf(); return movedOf(r).length > 0 ? r : false }, 8000)) || await rectsOf()
        // The card MOVES on screen (it follows) — what must not happen is a WRITE to its record, asserted through the anchor and the stored rect below.
        const movedIds = saved.filter((q) => after[q.id] && (after[q.id].x !== q.x || after[q.id].y !== q.y)).map((q) => q.id)
        const followed = after.d9A && after.t9C && after.d9A.x === after.t9C.x + 800 && after.d9A.y === after.t9C.y
        layoutStore.flushSync()
        const storedCard = (layoutStore.initial().panels || []).find((q) => q.id === 'd9A')
        // The card's stored rect is never written; where it SHOWS is its conversation's rect plus the anchor.
        const cardShown = after.d9A
        const clear = [after.t9C, after.t9X, cardShown].every((r) => r && !hits(r, after.t9U) && !hits(r, after.t9L)) && !hits(cardShown, after.t9X)
        layoutStore.flushSync()
        const anchorKept = ((layoutStore.initial().workItems || []).find((i) => i.id === 'wi-d08b') || {}).anchor
        const vpArranged = await wc.executeJavaScript('window.__m4aViewport()')
        const sizesKept = saved.every((q) => after[q.id] && after[q.id].w === q.w && after[q.id].h === q.h)
        const sessionsArranged = await sessions()
        await wc.executeJavaScript('window.__m4bUndo()')
        await settle()
        const undone = (await waitUntil(async () => { const r = await rectsOf(); return movedOf(r).length === 0 ? r : false }, 8000)) || await rectsOf()
        const restored = saved.every((q) => undone[q.id] && undone[q.id].x === q.x && undone[q.id].y === q.y)
        // ---- the merged view refuses by name ----
        const MERGE = () => wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', code: 'KeyA', metaKey: true, shiftKey: true, bubbles: true })), true`)
        await MERGE()
        const mergedRefusal = await waitUntil(async () => { const r = await plan('arrange-task t9X'); return r?.kind === 'refused' && /merged/.test(r.reason) ? r : false }, 8000)
        await MERGE()
        await settle()
        ok(IDS[2],
          arranged?.kind === 'ran' && /arranged 2 panels of Light the task/.test(JSON.stringify(arranged)) &&
            movedIds.includes('t9C') && movedIds.includes('t9X') && followed && !movedIds.includes('t9L') && !movedIds.includes('t9U') &&
            storedCard && storedCard.x === 900 && storedCard.y === 100 &&
            anchorKept && anchorKept.panelId === 't9C' && anchorKept.dx === 800 && anchorKept.dy === 0 &&
            vpArranged && vpPreArrange && (vpArranged.x !== vpPreArrange.x || vpArranged.y !== vpPreArrange.y || vpArranged.scale !== vpPreArrange.scale) &&
            clear && sizesKept && restored && sessionsArranged === sessionsPreArrange && mergedRefusal !== false,
          JSON.stringify({ arranged, after, movedIds, followed, storedCard, anchorKept, vpPreArrange, vpArranged, clear, sizesKept, undone, restored, sessionsPreArrange, sessionsArranged, mergedRefusal }))
      } catch (d08bErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(d08bErr && d08bErr.message || d08bErr))
      } finally {
        try { layoutStore.dropWorktree('wt-d08b') } catch { /* nothing recorded */ }
        try { layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }); flushLayoutStore() } catch { /* the next check saves its own */ }
        try { const re = new Promise((resolve) => wc.once('did-finish-load', resolve)); wc.reload(); await re; await settle() } catch { /* nothing to drain */ }
        for (const d of [repoD, laneD, elseD]) { try { rmSync(d, { recursive: true, force: true }) } catch { /* gone */ } }
      }
    }

    /* ========== M128: the skill panel, the thirteenth kind ============== */
    //
    // Driven through the DROP door the Skills pane already uses (M127's own
    // MIME on a real DragEvent), never through a mint written here: the
    // panel must be reachable by the gesture, not only constructible.
    // Fixtures: a project skill ALSO defined in the fenced user home (so
    // `alsoDefinedIn` is real rather than asserted about a hand-built entry)
    // and a plugin skill behind the recorded `claude plugin details` text.
    {
      const IDS = [
        'skill.panel.1a a dropped skill card mints a kind=skill panel whose record holds exactly {scope,name} and no copied description, body, resource count or token figure',
        'skill.panel.1b a skill panel is sessionless — no PanelSession, no WebGL context, and closing it sends no pty.kill',
        'skill.panel.1c the body names which OPEN panels can see this skill',
        'skill.panel.1d a name defined in two scopes states the link and picks NO winner',
        'skill.panel.1e a plugin skill renders `claude plugin details` VERBATIM, with a readAt and a refresh'
      ]
      try {
        state.pluginFixtureOn = true
        // A path with a SPACE in it, this suite's standing fixture rule.
        const SK_DIR = mkdtempSync(join(tmpdir(), 'tc skill panel '))
        mkdirSync(join(SK_DIR, '.claude', 'skills', 'shared-name', 'references'), { recursive: true })
        writeFileSync(join(SK_DIR, '.claude', 'skills', 'shared-name', 'SKILL.md'),
          '---\nname: shared-name\ndescription: The project copy of a contested name.\n---\n\nProject body text.\n')
        writeFileSync(join(SK_DIR, '.claude', 'skills', 'shared-name', 'references', 'a.md'), 'ref\n')
        // The USER copy, in the temp home panels-entry.cjs fences this suite
        // onto — never the developer's real ~/.claude.
        const USER_HOME = process.env.TC_TOOLBOX_HOME
        mkdirSync(join(USER_HOME, '.claude', 'skills', 'shared-name'), { recursive: true })
        writeFileSync(join(USER_HOME, '.claude', 'skills', 'shared-name', 'SKILL.md'),
          '---\nname: shared-name\ndescription: The user copy of a contested name.\n---\n')

        // One terminal panel in SK_DIR: it is the cwd whose inventory the
        // panel reads AND the answer 1c is about.
        layoutStore.save({
          panels: [{ id: 'skT', x: 100, y: 100, w: 400, h: 240, z: 1, cwd: SK_DIR, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'skill host' }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: 'skT', focusedId: 'skT'
        })
        flushLayoutStore()
        const reS = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reS
        await settle()
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="skT"]') !== null`), 8000)

        const xtermsBefore = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
        const drop = async (key) => wc.executeJavaScript(`(() => {
          const host = document.querySelector('[role="application"]'); if (!host) return false
          const r = host.getBoundingClientRect()
          const dt = new DataTransfer(); dt.setData('application/x-tc-skill', ${JSON.stringify(key)})
          return host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 200, clientY: r.top + 400 })) || true
        })()`)
        await drop(JSON.stringify(['project', 'shared-name']))
        const projId = await waitUntil(() => wc.executeJavaScript(
          `(() => { const n = document.querySelector('.panel[data-panel-kind="skill"]'); return n ? n.getAttribute('data-panel-id') : false })()`), 8000)

        // 1a — the RECORD, read off the store the renderer actually wrote,
        // not off the DOM: a panel that painted the right thing while
        // persisting a copied description would pass a DOM-only assertion.
        await settle()
        flushLayoutStore()
        const onDiskSk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const wsSk = onDiskSk.workspaces.find((w) => w.id === onDiskSk.activeWorkspaceId) || onDiskSk.workspaces[0]
        const rec = wsSk.panels.find((p) => p.kind === 'skill')
        ok(IDS[0],
          typeof projId === 'string' && rec !== undefined && rec.skill !== undefined &&
            Object.keys(rec.skill).sort().join(',') === 'name,scope' &&
            rec.skill.scope === 'project' && rec.skill.name === 'shared-name' &&
            !('cwd' in rec) && !('args' in rec) && !('description' in rec) && !('resources' in rec),
          JSON.stringify({ projId, rec }))

        const body = async (id) => wc.executeJavaScript(
          `(() => { const b = document.querySelector('.panel[data-panel-id=${JSON.stringify(id)}] [data-scroll-host]'); return b ? b.textContent : null })()`)
        const text = await waitUntil(async () => {
          const t = await body(projId)
          return t && /skill host/.test(t) ? t : null
        }, 10000)

        // 1c — the cross-panel answer, backlog #26's whole original argument.
        ok(IDS[2], text !== null && /can see|available in/i.test(String(text)) && /skill host/.test(String(text)),
          JSON.stringify(String(text).slice(0, 300)))
        // 1d — the link, and NO winner. The negative is the milestone: M21
        // refused to name one and this panel may not re-decide it.
        ok(IDS[3], text !== null && /defined in/i.test(String(text)) && !/wins|shadows|overrides/i.test(String(text)),
          JSON.stringify(String(text).slice(0, 300)))

        // 1e — the plugin skill, verbatim. Compared byte for byte against the
        // recorded string: there is no --json, so a parser here would be a
        // differential nobody could see going wrong.
        await drop(JSON.stringify(['user', 'plugged-skill']))
        const plugId = await waitUntil(() => wc.executeJavaScript(
          `(() => { const ns = [...document.querySelectorAll('.panel[data-panel-kind="skill"]')].filter((n) => n.getAttribute('data-panel-id') !== ${JSON.stringify(projId)}); return ns[0] ? ns[0].getAttribute('data-panel-id') : false })()`), 8000)
        const plug = await waitUntil(async () => wc.executeJavaScript(`(() => {
          const n = document.querySelector('.panel[data-panel-id=${JSON.stringify(plugId)}]'); if (!n) return false
          const v = n.querySelector('[data-skill-plugin-verbatim]'); if (!v) return false
          return { verbatim: v.textContent, readAt: n.querySelector('[data-skill-read-at]') !== null, refresh: n.querySelector('[data-skill-door="plugin-refresh"]') !== null,
                   notPlugin: (document.querySelector('.panel[data-panel-id=${JSON.stringify(projId)}] [data-skill-section="plugin"]') || {}).textContent || null }
        })()`), 10000)
        ok(IDS[4],
          plug !== false && plug.verbatim === PLUGIN_DETAILS_TEXT && plug.readAt === true && plug.refresh === true &&
            typeof plug.notPlugin === 'string' && /not a plugin skill/i.test(plug.notPlugin),
          JSON.stringify(plug))

        // 1b — sessionless, and the close proves it against a live recorder:
        // a negative on a recorder that stopped recording is vacuous, so a
        // real terminal is closed in the same breath and MUST be recorded.
        const hasSession = await wc.executeJavaScript(
          `Object.prototype.hasOwnProperty.call(window.__m4aSessions(), ${JSON.stringify(projId)})`)
        const xtermsAfter = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
        const killsBefore = killedPanelIds.length
        await clickPanelClose(wc, projId)
        await clickPanelClose(wc, 'skT')
        await settle()
        const killsSince = killedPanelIds.slice(killsBefore)
        ok(IDS[1],
          typeof projId === 'string' && hasSession === false && xtermsAfter === xtermsBefore &&
            !killsSince.includes(projId) && killsSince.includes('skT'),
          JSON.stringify({ hasSession, xtermsBefore, xtermsAfter, killsSince }))

        try { rmSync(SK_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (skErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(skErr && skErr.message || skErr))
      } finally {
        state.pluginFixtureOn = false
      }
    }

    /* ========== M129: the editor's three-state editability ============== */
    //
    // The frontmatter round-trip is verify:toolbox's (edit.1). What is only
    // observable HERE is the consequence §5.2 draws from it: a block the
    // small grammar cannot read makes the METADATA fields read-only WITH the
    // reason on screen while the body stays editable — rather than a dead
    // Save button that explains nothing, which is the shape this repo has
    // refused at every other disabled control.
    {
      const IDS = [
        'editor.1a an ungrammatical frontmatter block renders the metadata fields read-only WITH the reason on screen',
        'editor.1b the BODY stays editable under the same block — three-state editability, never all-or-nothing',
        'editor.1c Save is disabled with a NAMED reason, never silently, and becomes live once the body changes',
        'editor.1d a menu paste with an editor field focused reaches the editor and NOT the focused terminal\'s agent — and the same paste with the editor blurred DOES reach it'
      ]
      try {
        const ED_DIR = mkdtempSync(join(tmpdir(), 'tc skill editor '))
        mkdirSync(join(ED_DIR, '.claude', 'skills', 'hostile-fm'), { recursive: true })
        // The same hostile block verify:toolbox edit.1 plants: a comment, a
        // block scalar and an anchor, none of which parseFrontmatter reads.
        writeFileSync(join(ED_DIR, '.claude', 'skills', 'hostile-fm', 'SKILL.md'),
          '---\nname: hostile-fm\n# a comment the grammar does not read\ndescription: before\nbody: |\n  a block scalar\nanchor: &a value\n---\n\nold body\n')

        layoutStore.save({
          // `cat -v` rather than a sleep: the negative half of editor.1d is
          // "the paste did not reach the agent", and a shell that echoes
          // nothing would satisfy that with no guard in place at all.
          panels: [{ id: 'edT', x: 100, y: 100, w: 400, h: 240, z: 1, cwd: ED_DIR, command: '/bin/cat', args: ['-v'], title: 'editor host' }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: 'edT', focusedId: 'edT'
        })
        flushLayoutStore()
        const reE = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reE
        await settle()
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="edT"]') !== null`), 8000)

        await wc.executeJavaScript(`(() => {
          const host = document.querySelector('[role="application"]'); if (!host) return false
          const r = host.getBoundingClientRect()
          const dt = new DataTransfer(); dt.setData('application/x-tc-skill', ${JSON.stringify(JSON.stringify(['project', 'hostile-fm']))})
          return host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 200, clientY: r.top + 400 })) || true
        })()`)
        const edId = await waitUntil(() => wc.executeJavaScript(
          `(() => { const n = document.querySelector('.panel[data-panel-kind="skill"]'); return n ? n.getAttribute('data-panel-id') : false })()`), 8000)
        const sel = `.panel[data-panel-id=${JSON.stringify(edId)}]`

        // Into the Edit tab, through the control rather than a state poke:
        // the tab must be REACHABLE, not merely renderable.
        await waitUntil(() => wc.executeJavaScript(
          // MOUSEDOWN, not click: every control in this panel arms on
          // mousedown (PanelFrame's own rule, so a press cannot be lost to a
          // drag), and `.click()` dispatches no mousedown at all — the check
          // would then time out against a perfectly working tab.
          `(() => { const b = document.querySelector('${sel} [data-skill-tab="edit"]'); if (!b || b.disabled) return false; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true })()`), 10000)

        const snap = await waitUntil(async () => wc.executeJavaScript(`(() => {
          const n = document.querySelector('${sel}'); if (!n) return false
          const desc = n.querySelector('[data-skill-edit-field="description"]')
          const body = n.querySelector('[data-skill-edit-body]')
          const save = n.querySelector('[data-skill-edit-save]')
          const why = n.querySelector('[data-skill-edit-meta-why]')
          if (!desc || !body || !save) return false
          if (body.value === '') return false
          return { descRO: desc.readOnly === true || desc.disabled === true,
                   why: why ? why.textContent : null,
                   bodyRO: body.readOnly === true || body.disabled === true,
                   bodyValue: body.value,
                   saveDisabled: save.disabled === true, saveTitle: save.getAttribute('title') }
        })()`), 12000)

        ok(IDS[0], snap !== false && snap.descRO === true && typeof snap.why === 'string' && snap.why.length > 10,
          JSON.stringify(snap))
        ok(IDS[1], snap !== false && snap.bodyRO === false && /old body/.test(String(snap.bodyValue)),
          JSON.stringify(snap && snap.bodyValue))

        const after = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('${sel}')
          const body = n.querySelector('[data-skill-edit-body]')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(body, 'a body the user typed')
          body.dispatchEvent(new Event('input', { bubbles: true }))
          const save = n.querySelector('[data-skill-edit-save]')
          return { saveDisabled: save.disabled === true, saveTitle: save.getAttribute('title') }
        })()`)
        ok(IDS[2],
          snap !== false && snap.saveDisabled === true && typeof snap.saveTitle === 'string' && snap.saveTitle.length > 10 &&
            after.saveDisabled === false,
          JSON.stringify({ before: snap && { d: snap.saveDisabled, t: snap.saveTitle }, after }))

        // 1d — the clipboard hazard, at the fifth surface to inherit it.
        // main's menu accelerator sends edit:paste unconditionally and
        // Canvas routes it into registry.get(focusedId) — the RUNNING AGENT
        // — gated only on shouldIgnoreKeys(). The POSITIVE control at the
        // end is what keeps the negative from being vacuous: the same paste
        // with the editor blurred must actually reach the terminal, which
        // proves focusedId names it and the echo is observable.
        const MARK = 'M128EDITORMARK'
        const CONTROL = 'M128CONTROLMARK'
        // The paste target has to be a LIVE terminal, and `edT` is not one:
        // a panel restored from layout is DORMANT until something wakes it,
        // so `registry.get(focusedId)` is undefined and both halves of this
        // check would pass against nothing at all (measured — the first cut
        // of this check reported focus: 'edT', session: false). Cmd+N spawns
        // one, which is the same door check 35's terminal came through.
        const panelsBefore = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        await wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
        const liveId = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.find((id) => !panelsBefore.includes(id)) ?? false
        }, 8000)
        if (typeof liveId !== 'string') throw new Error('editor.1d: Cmd+N spawned no panel to paste into')
        const liveSel = `.panel[data-panel-id=${JSON.stringify(liveId)}]`
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('${liveSel} .xterm') !== null`), 8000)
        const liveBox = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('${liveSel} .panel__slot') || document.querySelector('${liveSel}')
          if (!n) return null
          const r = n.getBoundingClientRect()
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (liveBox !== null) await clickPanelAt(liveBox.x, liveBox.y)
        const focusedBefore = await waitUntil(async () => {
          const id = await wc.executeJavaScript(`window.__m4aFocusedId()`)
          return id === liveId ? id : false
        }, 8000)
        await settle()
        // DOM focus into the editor while focusedId still names the terminal:
        // that is the hazard exactly, not a contrived arrangement.
        // M135. A REAL click on the body, not `b.focus()`: in a part that boots
        // its own window, a programmatic focus moved `activeElement` without
        // firing the focus event React's onFocus reads (the window had never
        // been focused by a real gesture), so the editor's keyboard flag never
        // armed and the check reported a guard that was never asked. The
        // harness rule for `focusedId` (a synthesised event moves nothing;
        // sendInputEvent does) reaches the editor's flag too.
        {
          // The web contents must be FOCUSED for a click to raise a focus
          // event at all: a hidden window's page is unfocused until told,
          // `activeElement` still moves, and React's onFocus never fires.
          wc.focus()
          await sleep(100)
          const bodyBox = await wc.executeJavaScript(`(() => { const b = document.querySelector('${sel} [data-skill-edit-body]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + Math.min(40, r.width / 2)), y: Math.round(r.top + Math.min(20, r.height / 2)) } })()`)
          if (bodyBox !== null) {
            wc.sendInputEvent({ type: 'mouseDown', x: bodyBox.x, y: bodyBox.y, button: 'left', clickCount: 1 })
            wc.sendInputEvent({ type: 'mouseUp', x: bodyBox.x, y: bodyBox.y, button: 'left', clickCount: 1 })
            await sleep(150)
          }
        }
        await wc.executeJavaScript(`(() => { const b = document.querySelector('${sel} [data-skill-edit-body]'); if (b && document.activeElement !== b) b.focus(); return document.activeElement === b })()`)
        wc.send(IPC_EVENTS.EDIT_PASTE, MARK)
        await waitUntil(() => wc.executeJavaScript(
          `(() => { const b = document.querySelector('${sel} [data-skill-edit-body]'); return b !== null && b.value.includes(${JSON.stringify(MARK)}) })()`), 4000)
        // Settle before the negative read: reading immediately would find the
        // terminal clean because no echo could have arrived yet, guard or no
        // guard — check 35's own recorded lesson.
        await sleep(600)
        const guarded = await wc.executeJavaScript(`(() => ({
          inEditor: (document.querySelector('${sel} [data-skill-edit-body]') || {}).value?.includes(${JSON.stringify(MARK)}) === true,
          inTerminal: window.__m4aCellToScreen(${JSON.stringify(MARK)}) !== null,
          active: document.activeElement ? document.activeElement.tagName + '.' + document.activeElement.className : null,
          flag: typeof window.__m129EditorFocused === 'function' ? window.__m129EditorFocused() : 'no hook',
          pageFocused: document.hasFocus(),
          editors: document.querySelectorAll('[data-skill-editor]').length,
          focused: window.__m4aFocusedId(),
          liveTerminals: [...document.querySelectorAll('.panel .xterm')].map((x) => x.closest('.panel').getAttribute('data-panel-id'))
        }))()`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('${sel} [data-skill-edit-body]'); if (b) b.blur(); return true })()`)
        await settle()
        wc.send(IPC_EVENTS.EDIT_PASTE, CONTROL)
        await waitUntil(() => wc.executeJavaScript(
          `window.__m4aCellToScreen(${JSON.stringify(CONTROL)}) !== null`), 4000)
        await sleep(300)
        const control = await wc.executeJavaScript(`window.__m4aCellToScreen(${JSON.stringify(CONTROL)}) !== null`)
        ok(IDS[3],
          typeof focusedBefore === 'string' && guarded.inEditor === true &&
            guarded.inTerminal === false && control === true,
          JSON.stringify({ liveId, focusedBefore, guarded, control }))

        await clickPanelClose(wc, edId)
        await clickPanelClose(wc, 'edT')
        await settle()
        try { rmSync(ED_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (edErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(edErr && edErr.message || edErr))
      }
    }

    /* ========== M245: the sheet owns its own Cmd+V / Cmd+Z ================ */
    //
    // The hazard is NOT "click the sheet, then paste": a sheet mousedown runs
    // onFocusPanel, which moves focusedId to the sheet, so the canvas would
    // route that paste nowhere with or without the guard — a vacuous check.
    // The hazard is DOM focus in the sheet while focusedId still names a LIVE
    // terminal (keyboard or programmatic focus): unguarded, the menu's
    // edit:paste goes into the agent, and edit:undo ALSO runs the canvas undo,
    // whose top entry here is the terminal's own spawn. So this arranges
    // exactly that, and the positive control (sheet blurred, same paste)
    // proves focusedId names the terminal and its echo is observable.
    {
      const IDS = [
        'sheet-clip.1 a menu paste with a sheet focused lands in the sheet FILE and not in the focused terminal — and the same paste with the sheet blurred does reach the terminal',
        'sheet-clip.2 a menu undo with a sheet focused restores the sheet file through its own write and does NOT run the canvas undo (the terminal it spawned survives)'
      ]
      try {
        const SH_DIR = mkdtempSync(join(tmpdir(), 'tc sheet clip '))
        const SH_FILE = join(SH_DIR, 'data.csv')
        const ORIGINAL = 'a,b\n1,2\n'
        writeFileSync(SH_FILE, ORIGINAL)
        layoutStore.save({
          panels: [{ id: 'shF', kind: 'file', x: 520, y: 80, w: 420, h: 280, z: 1, source: { path: SH_FILE, sheet: {} } }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reS = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reS
        await settle()
        const shSel = '.panel[data-panel-id="shF"]'
        await waitUntil(() => wc.executeJavaScript(
          `(() => { const c = document.querySelector('${shSel} [data-cell="A1"]'); return c !== null && c.textContent === 'a' })()`), 10000)

        // A LIVE terminal, through Cmd+N — a restored one is dormant (editor.1d's measured lesson).
        const before = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
        const liveId = await waitUntil(async () => {
          const now = await wc.executeJavaScript(`[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.find((id) => !before.includes(id)) ?? false
        }, 8000)
        if (typeof liveId !== 'string') throw new Error('sheet-clip: Cmd+N spawned no panel')
        const liveSel = `.panel[data-panel-id=${JSON.stringify(liveId)}]`
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('${liveSel} .xterm') !== null`), 8000)
        const liveBox = await wc.executeJavaScript(`(() => { const n = document.querySelector('${liveSel} .panel__slot') || document.querySelector('${liveSel}'); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (liveBox !== null) await clickPanelAt(liveBox.x, liveBox.y)
        const focusedBefore = await waitUntil(async () => { const id = await wc.executeJavaScript(`window.__m4aFocusedId()`); return id === liveId ? id : false }, 8000)
        await settle()

        // DOM focus into the sheet body WITHOUT a mousedown, so focusedId stays on the terminal.
        wc.focus(); await sleep(100)
        const armed = await wc.executeJavaScript(`(() => { const b = document.querySelector('${shSel} [data-sheet-body]'); if (!b) return null; b.focus(); return { inSheet: document.activeElement === b, focused: window.__m4aFocusedId() } })()`)
        const MARK = 'M245SHEETMARK'
        const CONTROL = 'M245CONTROLMARK'
        wc.send(IPC_EVENTS.EDIT_PASTE, MARK)
        const landed = await waitUntil(() => { try { return readFileSync(SH_FILE, 'utf8').includes(MARK) } catch { return false } }, 5000)
        await sleep(600)
        const pasted = await wc.executeJavaScript(`(() => ({ inTerminal: window.__m4aCellToScreen(${JSON.stringify(MARK)}) !== null, focused: window.__m4aFocusedId() }))()`)
        const fileAfterPaste = readFileSync(SH_FILE, 'utf8')

        // sheet-clip.2 — undo, still in the same arrangement.
        wc.send('edit:undo')
        await waitUntil(() => readFileSync(SH_FILE, 'utf8') === ORIGINAL, 5000)
        await sleep(400)
        const undone = await wc.executeJavaScript(`(() => ({
          terminalStillThere: document.querySelector('${liveSel}') !== null,
          panels: document.querySelectorAll('.panel').length
        }))()`)
        const fileAfterUndo = readFileSync(SH_FILE, 'utf8')

        // The positive control: blur the sheet, the same menu paste reaches the terminal.
        await wc.executeJavaScript(`(() => { const b = document.querySelector('${shSel} [data-sheet-body]'); if (b) b.blur(); return true })()`)
        await settle()
        wc.send(IPC_EVENTS.EDIT_PASTE, CONTROL)
        await waitUntil(() => wc.executeJavaScript(`window.__m4aCellToScreen(${JSON.stringify(CONTROL)}) !== null`), 4000)
        const control = await wc.executeJavaScript(`window.__m4aCellToScreen(${JSON.stringify(CONTROL)}) !== null`)

        ok(IDS[0],
          typeof focusedBefore === 'string' && armed !== null && armed.inSheet === true && armed.focused === liveId &&
            landed === true && fileAfterPaste === `${MARK},b\n1,2\n` && pasted.inTerminal === false && control === true,
          JSON.stringify({ liveId, armed, landed, fileAfterPaste, pasted, control }))
        ok(IDS[1], fileAfterUndo === ORIGINAL && undone.terminalStillThere === true,
          JSON.stringify({ fileAfterUndo, undone }))

        await clickPanelClose(wc, liveId)
        await clickPanelClose(wc, 'shF')
        await settle()
        try { rmSync(SH_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (shErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(shErr && shErr.message || shErr))
      }
    }


    /* ========== M129 fix: the three write doors, WIRED ================== */
    //
    // `skill:create`, `skill:rename` and `skill:delete` shipped with NO
    // renderer caller at all — three channels, their refusals and
    // `renameInShelf` itself, all unreachable from the app. Nothing in this
    // suite could have caught that, because every check drove main directly.
    // These three do it the only way that proves the wiring: through the real
    // controls, against the real writers (fenced to TC_TOOLBOX_HOME, with a
    // RECORDING trash), reading the answer off disk and off the flushed
    // layout.
    {
      const IDS = [
        'editor.2a New skill on the Skills pane reaches skill:create — a SKILL.md lands under the fixture root and the pane grows the card',
        'editor.2b Rename carries the SHELF SLOT: the flushed shelf holds the new scope:name key and no longer holds the old one',
        'editor.2c Delete asks main to trash the skill\'s DIRECTORY, and its confirm NAMES the resource count'
      ]
      // Electron answers a throwing executeJavaScript with one generic
      // sentence and no inner error, which is useless for a check that
      // splices ids and JSON keys into page scripts. `nsJs` wraps every
      // source in an in-page try/catch and rethrows the REAL message here.
      const nsJs = async (src) => {
        const r = await wc.executeJavaScript(`(() => { try { return (${src}) } catch (e) { return { __nsErr: String(e && e.stack || e) } } })()`)
        if (r !== null && typeof r === 'object' && typeof r.__nsErr === 'string') throw new Error('in page: ' + r.__nsErr)
        return r
      }
      try {
        const NS_DIR = mkdtempSync(join(tmpdir(), 'tc skill doors '))
        const NS_ROOT = join(NS_DIR, '.claude', 'skills')
        mkdirSync(join(NS_ROOT, 'renameable', 'references'), { recursive: true })
        writeFileSync(join(NS_ROOT, 'renameable', 'SKILL.md'),
          '---\nname: renameable\ndescription: A skill these doors move.\n---\n\nbody\n')
        for (const r of ['a.md', 'b.md', 'c.md']) writeFileSync(join(NS_ROOT, 'renameable', 'references', r), 'ref\n')

        layoutStore.save({
          panels: [{ id: 'nsT', x: 100, y: 100, w: 400, h: 240, z: 1, cwd: NS_DIR, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'doors host' }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: 'nsT', focusedId: 'nsT'
        })
        layoutStore.saveShelf({ columns: [{ id: 'doors-col', title: 'doors', keys: [JSON.stringify(['project', 'renameable'])] }] })
        flushLayoutStore()
        const reN = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reN
        await settle()
        await waitUntil(() => nsJs(`document.querySelector('.panel[data-panel-id="nsT"]') !== null`), 8000)

        // Into the Skills pane through the dock's own button — the pane must
        // be REACHABLE, not merely renderable.
        await waitUntil(() => nsJs(
          `(() => { const b = document.querySelector('[data-dock="skills"]'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`), 8000)
        await waitUntil(() => nsJs(`document.querySelector('[data-skills-pane]') !== null`), 8000)

        // 2a — New skill, at project scope, through the real controls.
        // CLICK, not mousedown: every pane control mounts `shellControl`,
        // whose mousedown only calls preventDefault (it keeps focus off the
        // button) and whose CLICK is what runs the verb — the panel's own
        // doors are the opposite, and mixing the two presses nothing.
        // Pressed exactly ONCE, then awaited separately: a waitUntil that
        // re-dispatches would toggle this draft open and shut for ever,
        // and the next script would read a null input.
        await waitUntil(() => nsJs(`document.querySelector('[data-skills-new-skill]') !== null`), 8000)
        await nsJs(`(() => { document.querySelector('[data-skills-new-skill]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true })()`)
        await waitUntil(() => nsJs(`document.querySelector('[data-skills-new-skill-draft]') !== null`), 8000)
        const scoped = await nsJs(`(() => {
          const scope = document.querySelector('[data-skills-new-skill-scope="project"]')
          if (!scope || scope.disabled) return false
          scope.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
          return true
        })()`)
        if (scoped !== true) throw new Error('editor.2a: the project scope was absent or disabled — the fixture panel has a directory, so it should be neither')
        await nsJs(`(() => {
          const input = document.querySelector('[data-skills-new-skill-name]')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'minted-here')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`)
        // The Create button is disabled until the name lands, so wait for it
        // to go live rather than pressing into a disabled control.
        await waitUntil(() => nsJs(
          `(() => { const b = document.querySelector('[data-skills-new-skill-create]'); return b !== null && b.disabled === false })()`), 8000)
        await nsJs(
          `(() => { document.querySelector('[data-skills-new-skill-create]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true })()`)
        const madeOnDisk = await waitUntil(() => {
          try { return readFileSync(join(NS_ROOT, 'minted-here', 'SKILL.md'), 'utf8').startsWith('---\n') } catch { return false }
        }, 10000)
        // The key is compared as an ATTRIBUTE VALUE, never spliced into a
        // CSS selector: `["project","minted-here"]` carries quotes and
        // brackets, and a selector built from it throws rather than missing.
        const cardShown = await waitUntil(() => nsJs(
          `[...document.querySelectorAll('[data-skill-card]')].some((n) => n.getAttribute('data-skill-card') === ${JSON.stringify(JSON.stringify(['project', 'minted-here']))})`), 12000)
        ok(IDS[0], madeOnDisk === true && cardShown === true,
          JSON.stringify({ madeOnDisk, cardShown }))

        // 2b/2c — the panel's own two folder doors. Drop the card that has
        // the resources so the confirm has a count to name.
        await nsJs(`(() => {
          const host = document.querySelector('[role="application"]'); if (!host) return false
          const r = host.getBoundingClientRect()
          const dt = new DataTransfer(); dt.setData('application/x-tc-skill', ${JSON.stringify(JSON.stringify(['project', 'renameable']))})
          return host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 220, clientY: r.top + 420 })) || true
        })()`)
        const nsId = await waitUntil(() => nsJs(
          `(() => { const n = document.querySelector('.panel[data-panel-kind="skill"]'); return n ? n.getAttribute('data-panel-id') : false })()`), 10000)
        const nsSel = `.panel[data-panel-id=${JSON.stringify(nsId)}]`
        // MOUSEDOWN here: every control INSIDE a panel arms on mousedown
        // (PanelFrame's rule, so a press cannot be lost to a drag) — the
        // opposite of the pane's shellControl above. Pressed once.
        await waitUntil(() => nsJs(
          `(() => { const b = document.querySelector('${nsSel} [data-skill-tab="edit"]'); return b !== null && b.disabled === false })()`), 12000)
        await nsJs(`(() => { document.querySelector('${nsSel} [data-skill-tab="edit"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true })()`)
        await waitUntil(() => nsJs(`document.querySelector('${nsSel} [data-skill-folder-doors]') !== null`), 12000)

        // 2c's confirm FIRST, while the skill still exists: arm the delete,
        // read the sentence, then disarm by re-reading (the second press is
        // what commits, and it happens below).
        await waitUntil(() => nsJs(
          `(() => { const b = document.querySelector('${nsSel} [data-skill-door="delete"]'); return b !== null && b.disabled === false })()`), 8000)
        await nsJs(`(() => { document.querySelector('${nsSel} [data-skill-door="delete"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true })()`)
        const confirmText = await waitUntil(() => nsJs(
          `(() => { const n = document.querySelector('${nsSel} [data-skill-delete-confirm]'); return n ? n.textContent : false })()`), 8000)

        // 2b — rename, then the SHELF: the key is `scope:name`, so a rename
        // that could not carry the slot leaves the old key rendering `not
        // installed here`, which reads as a skill that was never installed.
        await nsJs(`(() => {
          const input = document.querySelector('${nsSel} [data-skill-rename-name]')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'renamed-away')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`)
        await waitUntil(() => nsJs(
          `(() => { const b = document.querySelector('${nsSel} [data-skill-door="rename"]'); return b !== null && b.disabled === false })()`), 8000)
        await nsJs(
          `(() => { document.querySelector('${nsSel} [data-skill-door="rename"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true })()`)
        const movedOnDisk = await waitUntil(() => {
          try { return readdirSync(NS_ROOT).includes('renamed-away') && !readdirSync(NS_ROOT).includes('renameable') } catch { return false }
        }, 10000)
        const shelfCarried = await waitUntil(() => {
          flushLayoutStore()
          const keys = layoutStore.shelf().columns.flatMap((c) => c.keys)
          return keys.includes(JSON.stringify(['project', 'renamed-away'])) && !keys.includes(JSON.stringify(['project', 'renameable']))
        }, 10000)
        ok(IDS[1], movedOnDisk === true && shelfCarried === true,
          JSON.stringify({ movedOnDisk, shelf: layoutStore.shelf() }))

        // The delete, committed: two presses, and main is asked to trash the
        // DIRECTORY. The harness's trash records rather than moves.
        // The door is STILL armed from the confirm read above (nothing
        // disarms it), so exactly ONE more press commits — a second would
        // re-arm it and trash nothing, which is the two-step working.
        const before = skillTrashCalls.length
        await nsJs(
          `(() => { const b = document.querySelector('${nsSel} [data-skill-door="delete"]'); if (!b) return false; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true })()`)
        await settle()
        const trashed = await waitUntil(() => (skillTrashCalls.length > before ? skillTrashCalls[skillTrashCalls.length - 1] : false), 10000)
        ok(IDS[2],
          typeof confirmText === 'string' && /3 resources/.test(confirmText) &&
            typeof trashed === 'string' && trashed === join(NS_ROOT, 'renamed-away'),
          JSON.stringify({ confirmText, trashed, calls: skillTrashCalls }))

        await clickPanelClose(wc, 'nsT')
        await settle()
        layoutStore.saveShelf({ columns: [] })
        flushLayoutStore()
        try { rmSync(NS_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (nsErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(nsErr && nsErr.message || nsErr))
      }
    }

    /* ========== M130: the trail's anchored lane ========================= */
    //
    // The lane is DERIVED — beside M114's anchored work card and M79's run
    // frames — so its cards are not panels, cost no LOD budget and no
    // records, and vanish with their host. The read is the REAL trailFor
    // over a fixture JSONL wired above, so what these checks see is the same
    // byte-offset tail production runs.
    {
      const IDS = [
        'trail.lane.1a NO trail entry is in the panel array — the cards are derived, cost no LOD budget and write no record',
        'trail.lane.1b the lane re-derives from its host on a move',
        'trail.lane.1c the collapse mark SURVIVES a reload — a layout mark like pinned, not a view state like flipped',
        'trail.lane.1d collapsed shows one capsule that never disappears, and its words are words',
        'trail.lane.1e a host drawn as a card (the far tiers) paints no trail',
        'trail.lane.1f order on screen matches transcript order',
        'trail.lane.1g a name defined in two scopes picks NO winner',
        'trail.lane.1h a name the inventory does not know says `not installed here`',
        'trail.lane.1i an inventory that could not be READ says so and never `not installed here` — a refusal is not a claim about the user\'s machine'
      ]
      try {
        // A path with a SPACE in it, this suite's standing fixture rule.
        const TR_DIR = mkdtempSync(join(tmpdir(), 'tc skill trail '))
        for (const [name, desc] of [['deploy', 'Ship the build to staging.'], ['shared-trail', 'The project copy of a contested name.']]) {
          mkdirSync(join(TR_DIR, '.claude', 'skills', name), { recursive: true })
          writeFileSync(join(TR_DIR, '.claude', 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n`)
        }
        // The USER copy of ONE of the two names, in the fenced temp home: 1g
        // needs `defined in 2 scopes` to be a real inventory fact.
        const TR_HOME = process.env.TC_TOOLBOX_HOME
        mkdirSync(join(TR_HOME, '.claude', 'skills', 'shared-trail'), { recursive: true })
        writeFileSync(join(TR_HOME, '.claude', 'skills', 'shared-trail', 'SKILL.md'),
          '---\nname: shared-trail\ndescription: The user copy of a contested name.\n---\n')

        // The transcript, in the CLI's own shape. `ghost-skill` is installed
        // nowhere: 1h's answer is the useful one after a session used a
        // plugin skill this project cannot see.
        const TR_LOG = join(TR_DIR, 'transcript.jsonl')
        const rec = (at, skill) => JSON.stringify({ type: 'assistant', timestamp: at, message: { content: [{ type: 'tool_use', id: `tu-${skill}`, name: 'Skill', input: { skill } }] } })
        writeFileSync(TR_LOG, [
          rec('2026-09-06T10:00:00.000Z', 'deploy'),
          rec('2026-09-06T10:01:00.000Z', 'shared-trail'),
          rec('2026-09-06T10:02:00.000Z', 'ghost-skill')
        ].join('\n') + '\n')
        // 1i's host: the same trail, over a directory whose toolbox read main
        // REFUSES. Its cards can say nothing about what is installed, and
        // saying `not installed here` would be a false statement about the
        // user's machine — the two-into-three-state collapse this repo bans.
        const TR_BAD = realpathSync(mkdtempSync(join(tmpdir(), 'tc skill trail refused ')))
        state.toolboxRefusedCwd = TR_BAD
        state.trailFixture = { panelIds: ['trT', 'trU'], path: TR_LOG }

        layoutStore.save({
          panels: [
            { id: 'trT', x: 160, y: 140, w: 420, h: 260, z: 1, cwd: TR_DIR, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'trail host' },
            { id: 'trU', x: 160, y: 900, w: 420, h: 260, z: 2, cwd: TR_BAD, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'refused host' }
          ],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: 'trT', focusedId: 'trT'
        })
        flushLayoutStore()
        const reT = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reT
        await settle()
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="trT"]') !== null`), 8000)

        const lane = await waitUntil(() => wc.executeJavaScript(`(() => {
          const l = document.querySelector('[data-skill-trail-lane="trT"]'); if (!l) return false
          const cards = [...l.querySelectorAll('[data-skill-trail-card]')]
          if (cards.length < 3) return false
          return {
            names: cards.map((c) => c.getAttribute('data-skill-trail-name')),
            texts: cards.map((c) => c.textContent),
            inPanel: cards.some((c) => c.closest('.panel') !== null),
            isPanel: cards.some((c) => c.hasAttribute('data-panel-id')),
            panels: [...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id')),
            left: parseFloat(l.style.left), top: parseFloat(l.style.top),
            host: (() => { const p = document.querySelector('.panel[data-panel-id="trT"]'); return { x: parseFloat(p.style.left), y: parseFloat(p.style.top), w: p.getBoundingClientRect().width } })()
          }
        })()`), 12000)

        // One id must report ONCE: a partial run that then throws would push
        // a second ok() under an id already recorded (verify:meta 22's rule).
        if (lane === false) throw new Error('no trail lane painted for trT')

        // 1a — the record too, not only the DOM: a lane that painted right
        // while persisting a panel would pass a DOM-only assertion.
        await settle()
        flushLayoutStore()
        const onDiskTr = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const wsTr = onDiskTr.workspaces.find((w) => w.id === onDiskTr.activeWorkspaceId) || onDiskTr.workspaces[0]
        ok(IDS[0],
          lane !== false && lane.panels.join(',') === 'trT,trU' &&
            lane.inPanel === false && lane.isPanel === false &&
            wsTr !== undefined && wsTr.panels.map((p) => p.id).join(',') === 'trT,trU',
          JSON.stringify({ lane: lane && { names: lane.names, panels: lane.panels, inPanel: lane.inPanel, isPanel: lane.isPanel }, onDisk: wsTr && wsTr.panels.map((p) => p.id) }))

        // 1f — transcript order, top to bottom.
        ok(IDS[5], lane !== false && lane.names.join(',') === 'deploy,shared-trail,ghost-skill',
          JSON.stringify(lane && lane.names))

        // 1g/1h — the two refusals, by name against the inventory.
        const textOf = (name) => (lane === false ? '' : String(lane.texts[lane.names.indexOf(name)] ?? ''))
        ok(IDS[6], /defined in 2 scopes/.test(textOf('shared-trail')) && !/wins|shadows|overrides/.test(textOf('shared-trail')),
          JSON.stringify(textOf('shared-trail')))
        ok(IDS[7], /not installed here/.test(textOf('ghost-skill')), JSON.stringify(textOf('ghost-skill')))

        // 1i — the refused read, on the second host. Its cards carry the same
        // three names and NONE of them may claim anything about what is
        // installed.
        const refused = await waitUntil(() => wc.executeJavaScript(`(() => {
          const l = document.querySelector('[data-skill-trail-lane="trU"]'); if (!l) return false
          const cards = [...l.querySelectorAll('[data-skill-trail-card]')]
          if (cards.length < 3) return false
          const texts = cards.map((c) => c.textContent)
          if (texts.some((t) => /reading the inventory/.test(t))) return false
          return { texts, glyphs: texts.some((t) => /[‹›»«▶◀]/.test(t)) }
        })()`), 12000)
        ok(IDS[8],
          refused !== false && refused.glyphs === false &&
            refused.texts.every((t) => /cannot read/.test(t)) &&
            refused.texts.every((t) => !/not installed here/.test(t)),
          JSON.stringify(refused))

        // 1b — a move of the host moves the lane by the same world delta,
        // re-derived rather than stored: the record must not gain a rect.
        const moved = await wc.executeJavaScript(`(async () => {
          const chrome = document.querySelector('.panel[data-panel-id="trT"] .panel__chrome')
          if (!chrome) return { error: 'no host' }
          const l0 = document.querySelector('[data-skill-trail-lane="trT"]')
          const before = { lane: parseFloat(l0.style.left), host: parseFloat(document.querySelector('.panel[data-panel-id="trT"]').style.left) }
          const r = chrome.getBoundingClientRect()
          const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
          const DX = 120, DY = 30
          const opts = (x, y, buttons) => ({ bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons, detail: 1 })
          chrome.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
          document.dispatchEvent(new MouseEvent('mousemove', opts(start.x + DX, start.y + DY, 1)))
          await new Promise((res) => setTimeout(res, 20))
          document.dispatchEvent(new MouseEvent('mouseup', opts(start.x + DX, start.y + DY, 0)))
          await new Promise((res) => setTimeout(res, 200))
          const l1 = document.querySelector('[data-skill-trail-lane="trT"]')
          const after = { lane: l1 ? parseFloat(l1.style.left) : null, host: parseFloat(document.querySelector('.panel[data-panel-id="trT"]').style.left) }
          return { before, after, scale: window.__m4aViewport().scale }
        })()`)
        ok(IDS[1],
          moved && !moved.error && moved.after.lane !== null &&
            Math.abs((moved.after.host - moved.before.host)) > 1 &&
            Math.abs((moved.after.lane - moved.before.lane) - (moved.after.host - moved.before.host)) < 0.5,
          JSON.stringify(moved))

        // 1e — zoomed out to the far tiers the host is a card, and a card
        // paints no trail. The panel itself must still be on screen, or the
        // assertion would be about culling rather than about the tier.
        for (let i = 0; i < 12; i++) await zoomTo(wc, '-')
        await settle()
        const far = await wc.executeJavaScript(`(() => ({
          scale: window.__m4aViewport().scale,
          detail: (document.querySelector('.world') || {}).getAttribute ? document.querySelector('.world').getAttribute('data-detail') : null,
          host: document.querySelector('.panel[data-panel-id="trT"]') !== null,
          cards: document.querySelectorAll('[data-skill-trail-card]').length
        }))()`)
        ok(IDS[4], far.scale < 0.26 && far.host === true && far.cards === 0, JSON.stringify(far))
        await zoomTo(wc, '0')
        await settle()

        // 1d — the capsule, in BOTH states: a control that disappears when
        // its thing is off reads as a feature that was never built.
        const capsule = await waitUntil(() => wc.executeJavaScript(`(() => {
          const b = document.querySelector('.panel[data-panel-id="trT"] [data-skill-trail-toggle]'); if (!b) return false
          return { expandedText: b.textContent, expandedState: b.getAttribute('data-skill-trail-toggle') }
        })()`), 8000)
        // mousedown THEN click: `shellControl` takes DOM focus away from
        // xterm on the mousedown and runs the verb on the click, so a
        // mousedown alone toggles nothing (measured — the first cut of this
        // check read `expanded` back after pressing a working capsule).
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="trT"] [data-skill-trail-toggle]'); if (!b) return false
          const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1 }
          b.dispatchEvent(new MouseEvent('mousedown', opts))
          b.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }))
          b.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }))
          return true })()`)
        await settle()
        const collapsed = await wc.executeJavaScript(`(() => {
          const b = document.querySelector('.panel[data-panel-id="trT"] [data-skill-trail-toggle]')
          return { present: b !== null, text: b ? b.textContent : null, state: b ? b.getAttribute('data-skill-trail-toggle') : null,
                   // trT's OWN lane: the second host's lane is still up, and
                   // counting every card on the canvas would read as a
                   // collapse that did nothing.
                   cards: document.querySelectorAll('[data-skill-trail-lane="trT"] [data-skill-trail-card]').length,
                   glyphs: b ? /[‹›»«▶◀]/.test(b.textContent) : true }
        })()`)
        ok(IDS[3],
          capsule !== false && collapsed.present === true && collapsed.cards === 0 &&
            /\d+ skills?/.test(String(capsule.expandedText)) && /\d+ skills?/.test(String(collapsed.text)) &&
            capsule.expandedState !== collapsed.state && collapsed.glyphs === false,
          JSON.stringify({ capsule, collapsed }))

        // 1c — the ONE stored fact, read off disk and then off a reload.
        await settle()
        flushLayoutStore()
        const onDiskMark = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const wsMark = onDiskMark.workspaces.find((w) => w.id === onDiskMark.activeWorkspaceId) || onDiskMark.workspaces[0]
        const recMark = wsMark && wsMark.panels.find((p) => p.id === 'trT')
        const reT2 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reT2
        await settle()
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="trT"]') !== null`), 8000)
        const afterReload = await wc.executeJavaScript(`(() => ({
          cards: document.querySelectorAll('[data-skill-trail-lane="trT"] [data-skill-trail-card]').length,
          toggle: (document.querySelector('.panel[data-panel-id="trT"] [data-skill-trail-toggle]') || {}).getAttribute ? document.querySelector('.panel[data-panel-id="trT"] [data-skill-trail-toggle]').getAttribute('data-skill-trail-toggle') : null
        }))()`)
        ok(IDS[2],
          recMark !== undefined && recMark.skillTrail === 'collapsed' &&
            afterReload.cards === 0 && afterReload.toggle === 'collapsed',
          JSON.stringify({ recMark, afterReload }))

        await clickPanelClose(wc, 'trT')
        await clickPanelClose(wc, 'trU')
        await settle()
        try { rmSync(TR_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
        try { rmSync(TR_BAD, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (trErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(trErr && trErr.message || trErr))
      } finally {
        state.trailFixture = null
        state.toolboxRefusedCwd = null
      }
    }

    // -------------------------------------------------------------------
    // M133 — workflow.panel.1e. The workflow panel's Run reaches M80's OWN
    //     instantiation exactly once — never a second copy of it. The pure
    //     half of this milestone (the diagram as a projection, the header
    //     count, the Runs filter, the trigger round trip) is
    //     `verify:layout workflow.panel.1a-d`; only this needs the renderer.
    // -------------------------------------------------------------------
    {
      const IDS = [
        'workflow.panel.1e a template carrying a workflow BLOCK opens with its diagram and its Run is ENABLED (M138: the blocks run), and a press mints the shape — M132 landed the schema, not the runtime, so a run would mint a partial shape silently',
        'workflow.panel.1g Run reaches M80 instantiation, not a second copy — a blocks-free workflow mints its shape through instantiateTemplate exactly once',
        'workflow.run.1 Run on a pool template mints one chat worker per item through the renderer, each sent the prompt with its item, the Runs tab lists the items with their states, the block reads done when every item finished, and Stop is present and disabled by name once nothing runs'
      ]
      const wfLog = []
      const onWf = (_e, level, m) => { if (level >= 2) wfLog.push(String(m).slice(0, 200)) }
      wc.on('console-message', onWf)
      try {
        const wfDir = mkdtempSync(join(tmpdir(), 'tc panels workflow-'))
        // M138. The pool's work list: three items and a comment line.
        writeFileSync(join(wfDir, 'list.txt'), '# the sweep\nalpha\nbeta\ngamma\n')
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reW0 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reW0
        await settle()
        // A template with NO parameters, so Run mints without a sheet.
        await wc.executeJavaScript(`window.canvas.template.save({ id: 'wf1', name: 'nightly sweep', nodes: [
          { key: 'sweep', kind: 'terminal', cwd: ${JSON.stringify(wfDir)}, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'sweep', dx: -200, dy: 0 },
          { key: 'pool', kind: 'pool', cwd: ${JSON.stringify(wfDir)}, width: 6, list: ${JSON.stringify(join(wfDir, 'list.txt'))}, prompt: 'work an item', dx: 200, dy: 0 }
        ], edges: [{ from: 'sweep', to: 'pool', trigger: 'exit-ok' }] })`)
        layoutStore.save({
          panels: [{ id: 'wfA', kind: 'workflow', x: 200, y: 200, w: 640, h: 460, z: 1, title: 'nightly sweep', workflow: { templateId: 'wf1' } }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reW = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reW
        await settle()
        const opened = await waitUntil(() => wc.executeJavaScript(`(() => {
          const n = document.querySelector('.panel[data-panel-id="wfA"]'); if (!n) return false
          const blocks = [...n.querySelectorAll('[data-workflow-block]')]
          if (blocks.length !== 2) return false
          return {
            kind: n.getAttribute('data-panel-kind'),
            template: n.getAttribute('data-workflow-template'),
            count: n.querySelector('[data-workflow-count]')?.textContent ?? null,
            blocks: blocks.map((b) => b.getAttribute('data-workflow-block')),
            sublabels: blocks.map((b) => b.textContent ?? ''),
            edges: [...n.querySelectorAll('[data-workflow-edge]')].map((e) => e.getAttribute('data-workflow-edge')),
            tabs: [...n.querySelectorAll('[data-workflow-tab]')].map((t) => t.getAttribute('data-workflow-tab')),
            verbs: [...n.querySelectorAll('[data-workflow-verb]')].map((v) => [v.getAttribute('data-workflow-verb'), v.disabled, v.getAttribute('title')])
          }
        })()`), 8000)
        const before = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
        // Fix wave: this template carries a `pool` block, so Run must be
        // DISABLED with the block's own sentence and a press must mint
        // nothing — never a partial shape (the terminal, none of the blocks)
        // committed as a history entry with no word said.
        const runVerb = await wc.executeJavaScript(`(() => {
          const b = document.querySelector('.panel[data-panel-id="wfA"] [data-workflow-verb="run"]'); if (!b) return false
          return { disabled: b.disabled, title: b.getAttribute('title') ?? '' } })()`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="wfA"] [data-workflow-verb="run"]'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await settle()
        await sleep(600)
        const afterPress = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
        const blockedCalls = await wc.executeJavaScript(`window.__m132Instantiations ? window.__m132Instantiations() : null`)
        // The Runs tab exists and, with nothing recorded for this template
        // yet, says so rather than rendering an empty box.
        await wc.executeJavaScript(`(() => { const t = document.querySelector('.panel[data-panel-id="wfA"] [data-workflow-tab="runs"]'); if (t) t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return !!t })()`)
        const runsTab = await waitUntil(() => wc.executeJavaScript(`(() => {
          const p = document.querySelector('.panel[data-panel-id="wfA"] [data-workflow-panel="runs"]')
          return p && !p.hasAttribute('hidden') ? (p.textContent ?? '') : false })()`), 4000)
        ok(IDS[0],
          opened && opened.kind === 'workflow' && opened.template === 'wf1' &&
            /2 blocks/.test(String(opened.count)) &&
            opened.blocks.join(',') === 'sweep,pool' &&
            opened.sublabels.every((s) => !/›/.test(s)) && opened.sublabels.some((s) => /6 AT A TIME/i.test(s)) &&
            opened.edges.join(',') === 'sweep>pool' &&
            opened.tabs.join(',') === 'definition,runs' &&
            opened.verbs.length >= 5 && opened.verbs.every((v) => v[1] === false || (v[2] ?? '') !== '') &&
            runVerb !== false && runVerb.disabled === false &&
            afterPress > before && blockedCalls === 1 &&
            runsTab !== false && String(runsTab).trim() !== '',
          JSON.stringify({ opened, before, runVerb, afterPress, blockedCalls, runsTab, log: wfLog.slice(-3) }))

        // M138 — workflow.run.1. THE POOL'S PRODUCTION CALLER, END TO END: the
        // press above started the pool over the real list file; main asked the
        // renderer for a worker per item (no ceiling is set, so all three), each
        // a CHAT panel minted here and sent the block's prompt with its item
        // through the ordinary send (the fake runner spawned once per worker);
        // the Runs tab lists the block's items with their states, and Stop —
        // present only while a pool is live — interrupts the workers and the
        // rows read stopped. Every worker is an ordinary chat: it has a panel,
        // a session and a transcript, and closing the app would resume it.
        const workers = await waitUntil(() => wc.executeJavaScript(`(() => {
          const chats = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')].map((p) => p.getAttribute('data-panel-id'))
          return chats.length >= 3 ? chats : false })()`), 12000)
        const spawnedForWorkers = await waitUntil(() => (chatSpawns.length >= 3 ? chatSpawns.length : false), 8000)
        const poolRows = await waitUntil(() => wc.executeJavaScript(`(() => {
          const rows = [...document.querySelectorAll('.panel[data-panel-id="wfA"] [data-workflow-pool-item]')]
          if (rows.length < 3) return false
          return rows.map((r) => [r.getAttribute('data-workflow-pool-item'), r.getAttribute('data-workflow-pool-state')]) })()`), 8000)
        // Stop is read AFTER the pool has run its course: the fake runner
        // answers each worker in milliseconds, so no instant of this run
        // has a pool live to stop — Stop's live arm (interrupt every worker,
        // `stopped — by hand`) is pool.2c's, over the fake agents seam. What
        // this end-to-end run can see is Stop PRESENT and disabled by name
        // once nothing runs, which is the arm a person meets most.
        const stopVerb = await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="wfA"] [data-workflow-verb="stop"]'); return b ? { disabled: b.disabled, title: b.getAttribute('title') } : null })()`)
        const workerTitles = await wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-kind="chat"] .pf__title')].map((t) => t.textContent)`)
        const workerTranscript = workers ? await wc.executeJavaScript(`window.canvas.agentSession.transcript(${JSON.stringify(workers[0])}).then((t) => JSON.stringify(t).slice(0, 400))`) : null
        const stoppedRow = await waitUntil(() => wc.executeJavaScript(`(() => {
          const s = document.querySelector('.panel[data-panel-id="wfA"] [data-workflow-pool-stopped]'); return s ? s.textContent : false })()`), 8000)
        const stopAfter = await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="wfA"] [data-workflow-verb="stop"]'); return b ? { disabled: b.disabled, title: b.getAttribute('title') } : null })()`)
        ok(IDS[2],
          workers !== false && workers.length === 3 && spawnedForWorkers !== false &&
            Array.isArray(poolRows) && poolRows.map((r) => r[0]).sort().join(',') === 'alpha,beta,gamma' && poolRows.every((r) => r[1] === 'started' || r[1] === 'finished') &&
            (typeof stoppedRow !== 'string' || !/every item finished/.test(stoppedRow) || (await wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-id="wfA"] [data-workflow-pool-item]')].every((r) => r.getAttribute('data-workflow-pool-state') === 'finished')`)) === true) &&
            stopVerb !== null &&
            Array.isArray(workerTitles) && workerTitles.some((t) => /alpha/.test(String(t))) &&
            typeof workerTranscript === 'string' && /work an item/.test(workerTranscript) && /alpha|beta|gamma/.test(workerTranscript) &&
            typeof stoppedRow === 'string' && /every item finished/.test(stoppedRow) &&
            stopAfter !== null && stopAfter.disabled === true && /nothing of this workflow is running/.test(String(stopAfter.title)),
          JSON.stringify({ workers, spawnedForWorkers, poolRows, stopVerb, workerTitles, transcript: workerTranscript, stoppedRow, stopAfter, log: wfLog.slice(-4) }))

        // workflow.panel.1g — the same door on a template with NO blocks:
        // one press, one instantiateTemplate call, the shape minted. This is
        // the half of the old 1e the block refusal took away, kept whole.
        await wc.executeJavaScript(`window.canvas.template.save({ id: 'wf1g', name: 'plain nightly', nodes: [
          { key: 'sweep', kind: 'terminal', cwd: ${JSON.stringify(wfDir)}, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'sweep', dx: -200, dy: 0 },
          { key: 'tail', kind: 'terminal', cwd: ${JSON.stringify(wfDir)}, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'tail', dx: 200, dy: 0 }
        ], edges: [{ from: 'sweep', to: 'tail', trigger: 'exit-ok' }] })`)
        layoutStore.save({
          panels: [{ id: 'wfB', kind: 'workflow', x: 200, y: 200, w: 640, h: 460, z: 1, title: 'plain nightly', workflow: { templateId: 'wf1g' } }],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reG = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reG
        await settle()
        const gReady = await waitUntil(() => wc.executeJavaScript(`(() => {
          const b = document.querySelector('.panel[data-panel-id="wfB"] [data-workflow-verb="run"]'); if (!b) return false
          return { disabled: b.disabled } })()`), 8000)
        const gBefore = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id="wfB"] [data-workflow-verb="run"]'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        const gMinted = await waitUntil(() => wc.executeJavaScript(`(() => {
          const n = document.querySelectorAll('.panel').length
          return n > ${gBefore} ? { panels: n, calls: window.__m132Instantiations ? window.__m132Instantiations() : null } : false
        })()`), 10000)
        await settle()
        const gCalls = await wc.executeJavaScript(`window.__m132Instantiations ? window.__m132Instantiations() : null`)
        ok(IDS[1],
          gReady !== false && gReady.disabled === false && gMinted !== false && gCalls === 1,
          JSON.stringify({ gReady, gBefore, gMinted, gCalls, log: wfLog.slice(-3) }))

        // M139 — reach.3. THE FOURTH AUDIT'S REAL TAB, through the two surfaces
        // the M126–M138 acts added verbs to: the workflow panel's verb row and
        // the Skills pane's top controls. A real Tab (sendInputEvent), never a
        // dispatched event, from the first enabled verb; every enabled verb is
        // visited in the row's order and a disabled one (Stop with no pool,
        // Save with no editor) is skipped — present, titled, not a stop.
        {
          wc.focus()
          const tabWalk3 = async (startSel, identity, max) => {
            const started = await wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(startSel)}); if (!b) return 'no control'; if (b.disabled) return 'disabled'; b.focus(); return document.activeElement === b })()`)
            if (started !== true) return { started, visited: [] }
            const read = () => wc.executeJavaScript(`(() => { const el = document.activeElement; if (!el) return null; const id = (() => { ${identity} })(); return id ?? ('other:' + el.tagName) })()`)
            const visited = [await read()]
            for (let i = 0; i < max; i++) {
              wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
              await sleep(60)
              const at = await read()
              if (at === visited[0]) break
              visited.push(at)
            }
            return { started, visited }
          }
          const wfIdentity = `const v = el.closest('[data-workflow-verb]'); if (v) return 'verb:' + v.getAttribute('data-workflow-verb'); const t = el.closest('[data-workflow-tab]'); if (t) return 'tab:' + t.getAttribute('data-workflow-tab'); return null`
          const wfWalk = await tabWalk3('.panel[data-panel-id="wfB"] [data-workflow-verb="run"]', wfIdentity, 12)
          const wfVerbs = await wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-id="wfB"] [data-workflow-verb]')].map((b) => [b.getAttribute('data-workflow-verb'), b.disabled, b.getAttribute('title')])`)
          const enabledVerbs = wfVerbs.filter((v) => v[1] === false).map((v) => 'verb:' + v[0])
          const disabledVerbs = wfVerbs.filter((v) => v[1] === true)
          await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="skills"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
          await settle()
          const skIdentity = `const k = el.closest('[data-skills-tab]'); if (k) return 'tab:' + k.getAttribute('data-skills-tab'); if (el.hasAttribute('data-skills-search')) return 'search'; if (el.hasAttribute('data-skills-new-skill-name')) return 'new-name'; const sc = el.closest('[data-skills-new-skill-scope]'); if (sc) return 'scope:' + sc.getAttribute('data-skills-new-skill-scope'); if (el.hasAttribute('data-skills-new-skill-create')) return 'create'; if (el.hasAttribute('data-skills-new-column')) return 'new-column'; return null`
          const skStart = await wc.executeJavaScript(`(() => { const first = document.querySelector('[data-skills-pane] [data-skills-tab], [data-skills-pane] [data-skills-search]'); return first ? (first.hasAttribute('data-skills-tab') ? '[data-skills-pane] [data-skills-tab]' : '[data-skills-pane] [data-skills-search]') : null })()`)
          const skWalk = skStart === null ? { started: 'no pane', visited: [] } : await tabWalk3(skStart, skIdentity, 16)
          const skControls = await wc.executeJavaScript(`[...document.querySelectorAll('[data-skills-pane] button, [data-skills-pane] input, [data-skills-pane] select')].map((b) => [b.getAttribute('data-skills-tab') ?? b.getAttribute('data-skills-new-skill-scope') ?? (b.hasAttribute('data-skills-search') ? 'search' : b.hasAttribute('data-skills-new-skill-name') ? 'new-name' : b.hasAttribute('data-skills-new-skill-create') ? 'create' : b.hasAttribute('data-skills-new-column') ? 'new-column' : 'other'), b.disabled, b.getAttribute('title') ?? b.getAttribute('aria-label')])`)
          const skEnabledNamed = skControls.filter((c) => c[1] === false && c[0] !== 'other').length
          const skVisitedNamed = skWalk.visited.filter((v) => typeof v === 'string' && !v.startsWith('other:')).length
          ok('reach.3 a real Tab from the workflow panel\'s Run visits every enabled verb in the row\'s order and skips the disabled ones (each present and titled), and a real Tab through the Skills pane\'s top controls reaches every enabled named control with every disabled one titled',
            wfWalk.started === true && enabledVerbs.every((v) => wfWalk.visited.includes(v)) &&
              enabledVerbs.map((v) => wfWalk.visited.indexOf(v)).every((at, i, arr) => i === 0 || at > arr[i - 1]) &&
              disabledVerbs.length >= 2 && disabledVerbs.every((v) => typeof v[2] === 'string' && v[2] !== '') && disabledVerbs.every((v) => !wfWalk.visited.includes('verb:' + v[0])) &&
              skWalk.started === true && skVisitedNamed >= Math.min(skEnabledNamed, 3) &&
              skControls.filter((c) => c[1] === true).every((c) => typeof c[2] === 'string' && c[2] !== ''),
            JSON.stringify({ wfWalk, wfVerbs, skStart, skWalk, skControls }))
          await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
          await settle()
        }
        // M138 (critic C1) — orchestrator.resume.1. A RESTORED orchestrator's
        // first spawn carries `--append-system-prompt <its prompt>`: the CLI
        // keeps no record of the flag, and a draft had the prompt nested inside
        // the teammate arm, so every template-minted orchestrator (no teammate)
        // resumed as an ordinary chat — M81's failure, one block kind later.
        // Read off the fake runner's own argv, never a renderer word.
        {
          layoutStore.save({
            panels: [{ id: 'orc1', kind: 'chat', x: 60, y: 60, w: 500, h: 360, z: 1, title: 'lead', chat: { cwd: wfDir, sessionId: 'orc-11111111-2222-4333-8444-555555555555', orchestrator: 'You lead the sweep and never edit files.' } }],
            camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
          })
          flushLayoutStore()
          const reO = new Promise((resolve) => wc.once('did-finish-load', resolve))
          wc.reload(); await reO
          await settle()
          const spawnsBefore = chatSpawns.length
          const sent = await wc.executeJavaScript(`window.canvas.agentSession.send('orc1', 'who are you?')`)
          const spawned = await waitUntil(() => (chatSpawns.length > spawnsBefore ? chatSpawns[chatSpawns.length - 1] : false), 6000)
          const argv = spawned ? spawned.args : []
          const at = argv.indexOf('--append-system-prompt')
          ok('orchestrator.resume.1 a restored orchestrator chat spawns with --append-system-prompt carrying its own prompt and its session id pinned (--session-id first, --resume after), with no teammate on the record',
            spawned !== false && at !== -1 && /never edit files/.test(String(argv[at + 1])) &&
              (argv[argv.indexOf('--session-id') + 1] === 'orc-11111111-2222-4333-8444-555555555555' || argv[argv.indexOf('--resume') + 1] === 'orc-11111111-2222-4333-8444-555555555555'),
            JSON.stringify({ sent, argv, log: wfLog.slice(-2) }))
        }

        try { rmSync(wfDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (wfErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(wfErr && wfErr.message || wfErr) + ' | renderer: ' + (wfLog.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onWf)
      }
    }

    // -------------------------------------------------------------------
    // M133 — workflow.panel.1f. THE FIRE PATH, driven end to end: a
    //     `watcher:state` event for a workflow watcher (which is what main's
    //     runner sends on every run) reaches setWatcherFiredHandler, the
    //     Canvas handler reads the record's templateId, and ONE instantiation
    //     happens — a second event that is still `running` (a tail update) is
    //     the same run and must mint nothing. And a workflow with PARAMETERS
    //     is refused by name on the fire path and mints nothing at all, where
    //     a click would have opened the sheet.
    //
    //     In verify:panels rather than a plain-node suite because the whole
    //     claim is a chain across three modules that only exist in a live
    //     renderer: the IPC subscription, the module-level store's
    //     transition, and Canvas's own panel lookup.
    // -------------------------------------------------------------------
    {
      const IDS = ['workflow.panel.1f a workflow watcher\'s fire instantiates ONCE — a second running event with a new tail is the same run and mints nothing — and a parameterised workflow is refused by name on the fire path, minting nothing']
      const wfLog2 = []
      const onWf2 = (_e, level, m) => { if (level >= 2) wfLog2.push(String(m).slice(0, 200)) }
      wc.on('console-message', onWf2)
      try {
        const fireDir = mkdtempSync(join(tmpdir(), 'tc panels wffire-'))
        layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        flushLayoutStore()
        const reF0 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reF0
        await settle()
        await wc.executeJavaScript(`window.canvas.template.save({ id: 'wf2', name: 'plain sweep', nodes: [
          { key: 'sweep', kind: 'terminal', cwd: ${JSON.stringify(fireDir)}, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'sweep', dx: 0, dy: 0 }
        ], edges: [] })`)
        await wc.executeJavaScript(`window.canvas.template.save({ id: 'wf3', name: 'asks first', nodes: [
          { key: 'sweep', kind: 'terminal', cwd: '{{repository}}', command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'sweep', dx: 0, dy: 0 }
        ], edges: [] })`)
        // Two workflow watchers: one on the parameterless template, one on the
        // template that asks. Both armed=false, so MAIN never runs them — this
        // check drives the fire path, not the arming.
        layoutStore.save({
          panels: [
            { id: 'wfW', kind: 'watcher', x: 100, y: 100, w: 460, h: 220, z: 1, watch: { cwd: fireDir, command: '/usr/bin/true', args: [], armed: false, templateId: 'wf2', trigger: { kind: 'git-ref', root: fireDir } } },
            { id: 'wfP', kind: 'watcher', x: 700, y: 100, w: 460, h: 220, z: 2, watch: { cwd: fireDir, command: '/usr/bin/true', args: [], armed: false, templateId: 'wf3', trigger: { kind: 'git-ref', root: fireDir } } },
            // Fix wave: a watcher whose template was DELETED under it. Three
            // arms, not two — `undefined` (asked, no such template) must not
            // be collapsed into `null` (nobody asked) on the way into the
            // panel, or the sentence becomes unreachable from this surface.
            { id: 'wfG', kind: 'watcher', x: 100, y: 400, w: 460, h: 220, z: 3, watch: { cwd: fireDir, command: '/usr/bin/true', args: [], armed: false, templateId: 'wf-deleted', trigger: { kind: 'git-ref', root: fireDir } } }
          ],
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        flushLayoutStore()
        const reF = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await reF
        await settle()
        // The readouts read the MARK, never `/usr/bin/true` (fix round 1, #2).
        const readouts = await waitUntil(() => wc.executeJavaScript(`(() => {
          const n = document.querySelector('.panel[data-panel-id="wfW"]'); if (!n) return false
          const cmd = n.querySelector('.watcher-node__command'); if (!cmd) return false
          const title = n.querySelector('.pf__title')?.textContent ?? null
          if (title === null) return false
          return { title, command: cmd.textContent ?? '' }
        })()`), 6000)
        const goneReadout = await waitUntil(() => wc.executeJavaScript(`(() => {
          const n = document.querySelector('.panel[data-panel-id="wfG"]'); if (!n) return false
          const cmd = n.querySelector('.watcher-node__command'); if (!cmd) return false
          return cmd.textContent ?? '' })()`), 6000)
        const before = await wc.executeJavaScript(`window.__m132Instantiations()`)
        const panelsBefore = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
        // The event main's runner sends on every run, twice: the transition
        // into running IS the fire; a second running event with a new tail is
        // the same run still going.
        wc.send(IPC_EVENTS.WATCHER_STATE, { id: 'wfW', status: 'running', tail: '', pending: false, startedAt: Date.now() })
        const once = await waitUntil(() => wc.executeJavaScript(`window.__m132Instantiations() > ${before} ? window.__m132Instantiations() : false`), 8000)
        wc.send(IPC_EVENTS.WATCHER_STATE, { id: 'wfW', status: 'running', tail: 'still going\n', pending: false, startedAt: Date.now() })
        await settle()
        await sleep(600)
        const afterTail = await wc.executeJavaScript(`window.__m132Instantiations()`)
        // The parameterised one: refused BY NAME on the watcher's own body,
        // and nothing minted.
        const panelsMid = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
        wc.send(IPC_EVENTS.WATCHER_STATE, { id: 'wfP', status: 'running', tail: '', pending: false, startedAt: Date.now() })
        const refused = await waitUntil(() => wc.executeJavaScript(`(() => {
          const n = document.querySelector('.panel[data-panel-id="wfP"]'); if (!n) return false
          const t = n.textContent ?? ''
          return /not run: this workflow has parameters/.test(t) ? t.slice(0, 400) : false })()`), 8000)
        await settle()
        const finalCalls = await wc.executeJavaScript(`window.__m132Instantiations()`)
        const panelsAfter = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
        const sheet = await wc.executeJavaScript(`document.querySelector('[data-spawn-sheet]') !== null`)
        ok(IDS[0],
          readouts && /plain sweep/.test(String(readouts.title)) && !/true/.test(String(readouts.title)) &&
            /runs the workflow plain sweep/.test(String(readouts.command)) && !/usr\/bin\/true/.test(String(readouts.command)) &&
            goneReadout !== false && /no longer exists/.test(String(goneReadout)) &&
            once !== false && once === before + 1 && afterTail === before + 1 &&
            refused !== false && finalCalls === before + 1 && panelsAfter === panelsMid && panelsMid > panelsBefore && sheet === false,
          JSON.stringify({ readouts, goneReadout, before, once, afterTail, panelsBefore, panelsMid, panelsAfter, finalCalls, sheet, refused, log: wfLog2.slice(-3) }))
        try { rmSync(fireDir, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (fErr) {
        for (const id of IDS) ok(id, false, 'threw: ' + String(fErr && fErr.message || fErr) + ' | renderer: ' + (wfLog2.slice(-4).join(' || ') || '(none)'))
      } finally {
        wc.removeListener('console-message', onWf2)
      }
    }


    // M140 — editor.cmd.1 (backlog #26's write half beyond skills). A toolbox
    // node's COMMAND row has an Open door that opens the command's own file in
    // the file panel — M22's editor, the one write door every `.claude` file
    // already had — and a save there lands on disk. A project command is a
    // file someone will commit: the editor is where that deliberate edit
    // happens, never a one-click toggle (hooks, permissions and MCP servers
    // get the same door and no toggle, by the entry's own argument).
    {
      const cmdLog = []
      const onCmd = (_e, level, m) => { if (level >= 2) cmdLog.push(String(m).slice(0, 240)) }
      wc.on('console-message', onCmd)
      try {
      const CMD_DIR = mkdtempSync(join(tmpdir(), 'tc panels cmd-editor '))
      mkdirSync(join(CMD_DIR, '.claude', 'commands'), { recursive: true })
      const cmdFile = join(CMD_DIR, '.claude', 'commands', 'greet.md')
      writeFileSync(cmdFile, 'Say hello to the user.\n')
      await wc.executeJavaScript(`window.__m20Toolbox(${JSON.stringify(CMD_DIR)}, ${JSON.stringify('cmd fixture')})`)
      const opened = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-toolbox-open="greet"]'); return b ? true : false })()`), 8000)
      await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-toolbox-open="greet"]'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      const fileId = await waitUntil(() => wc.executeJavaScript(`(() => { const p = [...document.querySelectorAll('.panel[data-panel-kind="file"]')].find((el) => (el.getAttribute('data-file-path') || el.textContent || '').includes('greet.md')); return p ? p.getAttribute('data-panel-id') : false })()`), 8000)
      const editOpened = fileId ? await (async () => {
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id=${JSON.stringify(fileId)}] [data-file-node-edit]'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        return waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id=${JSON.stringify(fileId)}] [data-file-node-editor]') !== null`), 6000)
      })() : false
      // The typed text goes through JSON.stringify: a `\n` written inside
      // this template literal reaches the renderer as a REAL newline inside
      // a quoted string, and `executeJavaScript` threw `Invalid or unexpected
      // token` — the whole check reading as a failed Open door.
      const saved = editOpened ? await (async () => {
        await wc.executeJavaScript(`(() => { const t = document.querySelector('.panel[data-panel-id=${JSON.stringify(fileId)}] [data-file-node-editor]'); if (!t) return false
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(t, ${JSON.stringify('Say hello to the user, warmly.\n')}); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        await settle()
        await wc.executeJavaScript(`(() => { const b = document.querySelector('.panel[data-panel-id=${JSON.stringify(fileId)}] [data-file-node-save]'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        return waitUntil(() => readFileSync(cmdFile, 'utf8').includes('warmly'), 6000)
      })() : false
      ok('editor.cmd.1 a toolbox node\'s command row opens its own file in the file panel through the Open door, and a save in that editor lands on disk',
        opened === true && typeof fileId === 'string' && editOpened === true && saved === true,
        JSON.stringify({ opened, fileId, editOpened, saved, onDisk: readFileSync(cmdFile, 'utf8') }))
      if (typeof fileId === 'string') await clickPanelClose(wc, fileId)
      try { rmSync(CMD_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
      } catch (cmdErr) {
        ok('editor.cmd.1 a toolbox node\'s command row opens its own file in the file panel through the Open door, and a save in that editor lands on disk', false, 'threw: ' + String(cmdErr && cmdErr.message || cmdErr) + ' | renderer: ' + (cmdLog.slice(-4).join(' || ') || '(nothing)'))
      } finally {
        wc.removeListener('console-message', onCmd)
      }
    }
  }
})
