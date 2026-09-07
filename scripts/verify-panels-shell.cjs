/* verify:panels:shell — one of the five parts of the old scripts/verify-panels.cjs (M135).
   Run with: npm run build && npm run verify:panels:shell
   The harness (scripts/panels-harness.cjs) boots the renderer; this file holds the
   checks the old file held at lines 5260–10551, moved verbatim, ids unchanged. */
const { runPanelsSuite } = require('./panels-harness.cjs')

const WATCHDOG_MS = 95000 // measured 2026-09-07: 75.8s, 75.4s green alone on this machine; 1.25x the slower, to the next 5 s

runPanelsSuite('shell', WATCHDOG_MS, async (ctx) => {
  const { AgentSessionManager, BOOT_DEFAULT_PRESET, BrowserWindow, CASCADE_STEP, DEFAULT_CAMERA, ECHO_PRESET, ENTRY_OUT, FILE_MAX_LINES, FileWatchers, IPC, IPC_EVENTS, LAYOUT_PATH, LIVE_AT_BOOT, NEVER_RENDERED_PANEL_ID, NEVER_RENDERED_WORKSPACE_ID, NEVER_WOKEN_ID, PANELS_SOCKET, PLUGIN_DETAILS_TEXT, PLUGIN_DIR, PLUGIN_ID, PROJECT_DIR, PROJECT_PROMPT_BODY, PROJECT_PROMPT_NAME, PROMPT_DIRS, PtyManager, RENAMABLE_PRESET, REVIEW_FENCES, SEEDED_PROMPT, SEED_PANELS, ToolboxCache, WORKTREES_DIR, activeWorkspaceId, agentHandlers, agentSessions, agentTranscripts, allPresets, allTemplates, app, appendFileSync, approvalTracker, attachPtyLifecycle, backgroundPoint, baselineCapture, bootDefault, brokerAuditForChecks, buildSync, buildTmuxConf, cardCount, cardTexts, chatFixture, chatRunner, chatSpawns, clickEmptyCanvas, clickPanelAt, clickPanelBody, clickPanelClose, clickRail, closeSync, commitIndexDir, commitIndexSeq, createAgentTranscriptLog, createApprovalTracker, createBaselineCapture, createBoardLane, createBrokerAudit, createBrowserHandlers, createControlHandler, createControlServer, createDirectBackend, createExporters, createGitRunner, createLayoutSnapshots, createLayoutStore, createMemoryStore, createPlacesGate, createReviewCommitter, createReviewDiscarder, createReviewEngine, createRunLedger, createScrollbackLog, createTmuxBackend, createWatchRunner, createWorktreeManager, credentialDir, credentialStore, dockTo, execFileSync, existsSync, expandTilde, fencedGitRunner, findTmux, flushLayoutStore, fromPanels, frontTranscripts, gitPath, gridState, harnessCredentialDir, harnessGrants, importClaudeTranscript, ipcMain, isBuiltInTemplate, join, killedPanelIds, knownUsageSessionIds, lastPanelCentreInWorld, layoutSnapshots, layoutStore, linkOpens, listGithubWorkItems, listSessions, liveCount, loginEnv, memoryDir, memoryStore, mergePrompts, mkdirSync, mkdtempSync, nodeBox, nodeCount, ok, openSync, panelCount, parseLayout, parseShelf, pidsPreserved, presetFromCapture, presetRows, pressArrow, pressChord, pressPlain, ptyManager, pushDefaultPreset, railAgentState, railPan, readFileSync, readFrom, readProjectPrompts, readSync, readVault, readdirSync, realGitRunner, realIpcMainHandle, realpathSync, registerIpcHandlers, registeredHandlers, releaseMeta, renameSync, requestFromRenderer, resolveAttachment, resolveAvailability, resolveCwd, resolveShellEnv, resolveSpawnRequest, restoreFromSnapshot, results, reviewCommit, reviewEngine, rmSync, runLedger, scrollbackLog, sessionMap, settle, settledSessionMap, skillTrashCalls, skillWriteHandlers, sleep, snapshotDir, statSync, templateOf, tmpdir, toolboxCache, trailFor, unlinkSync, usageFixtureDir, usageFixtureFile, verifySocket, viewCentreInWorld, waitUntil, watchDirWatchers, watchFileWatchers, watchRunner, watchTimers, watcherHandlers, wc, webContents, whichFromEnv, whichHere, win, worktreeManager, writeFileSync, zoomTo, state } = ctx
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
  // check check 54's `backend = createDirectBackend(...)` (core) had made the DIRECT backend current, so that is what is current.
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
    // ---------------------------------------------------------------------
    // 64-67 — M7. Workspace switching, end to end in a real renderer.
    //
    //     Everything else in this milestone is provable in plain node: the
    //     store's transaction, the IPC surface, the palette rows. The one
    //     property that actually matters — the SAME PROCESS is there when you
    //     come back — is unprovable anywhere cheaper, because it requires a
    //     real registry holding a real PanelSession across a real switch.
    //     __m7aWorkspace() is this suite's route into switchWorkspace, the
    //     same reason every other __m4a*/__m5a*/__m6* hook exists.
    // ---------------------------------------------------------------------
    {
      // 64. THE PID CHECK. Switch away from the boot workspace (w1, holding
      //     the SEED_PANELS fixture) and back, and every session that
      //     survived must be the SAME PROCESS — not merely the same count.
      //     Every other check in this milestone stays green against an
      //     implementation that disposes on switch: the panels come back,
      //     the layout is right, the file is right, and the agents are dead.
      //     Same argument verify:pty-manager 12 makes for asserting the
      //     reattached pid rather than merely that a session exists.
      //
      //     Reads main's OWN answer (pty:list, via settledSessionMap/
      //     pidsPreserved — the exact helpers checks 4/5 and the M6a block
      //     already use) rather than __m4aSessions(), which the registry hook
      //     exposes with no pid field at all (id/dormant/spawned only) — main
      //     is the authority on pids, and asking it is strictly better than
      //     widening a hook that is deliberately kept narrow.
      const before = await settledSessionMap(wc)
      // Captured, never hardcoded: nextWorkspaceId() mints w<max+1> over
      // whatever ids already exist, so a literal 'w2' here would be a guess
      // this suite has no business making — and a WRONG guess fails
      // silently, since activate() on an unknown id returns null and simply
      // changes nothing (Task 2's own contract), so a check built on one
      // would report a switch that never happened as a passing one.
      const schoolId = await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('school')`)
      await settle()
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w1')`)
      await settle()
      const after = await settledSessionMap(wc)
      const { ok: preserved, changed } = pidsPreserved(before, after)
      ok('64 a switch away and back keeps the SAME pid for every session',
        before.size > 0 && preserved,
        `before=${before.size} sessions changed=[${changed.join(', ')}]`)

      // 65. A hidden workspace's panel is out of the DOM while its session is
      //     still in the registry. This is "demote, not dispose" stated as
      //     two facts that must BOTH hold — the DOM half alone passes against
      //     a dispose, and the registry half alone passes against a switch
      //     that never rendered. Switches to `schoolId`, the id check 64
      //     actually captured back from createAndSwitch — not a literal
      //     'w2' — because that is the one workspace this run guarantees is
      //     both real and still empty.
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo(${JSON.stringify(schoolId)})`)
      await settle()
      const hidden = await wc.executeJavaScript(`
        ({
          panelsInDom: document.querySelectorAll('.panel').length,
          sessionsInRegistry: window.__m4aSessions().length
        })
      `)
      ok('65 a hidden workspace keeps its sessions and loses its DOM',
        hidden.panelsInDom === 0 && hidden.sessionsInRegistry > 0,
        JSON.stringify(hidden))

      // 66. Cmd+N in the second (still empty, still active) workspace does
      //     not mint an id any OTHER workspace is using. PanelId doubles as
      //     the tmux session name, so a collision is two panels naming one
      //     session — the second to go live attaches to the first one's
      //     process, and neither panel shows anything wrong.
      //
      //     otherIds excludes the ACTIVE workspace deliberately:
      //     allPanelIds() spans EVERY workspace by design (Task 2), so
      //     intersecting the panel this very Cmd+N is about to mint against
      //     the unfiltered set would report a collision with itself the
      //     instant it renders.
      const workspaceRows = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      const otherIds = workspaceRows
        .filter((w) => !w.active)
        .flatMap((w) => w.panelIds)
      zoomTo(wc, 'n')
      await settle()
      // `.panel[data-panel-id]`, not the bare attribute selector: a panel's
      // OWN root and its slot/card children can each carry the attribute
      // (TerminalPanel places it on more than one element), so the bare
      // selector double-counts every panel — visible in an earlier run's
      // `minted=p1,p1,n6,n6,...` output. The panel ROOT is the one place the
      // id is authoritative.
      const minted = await wc.executeJavaScript(`
        Array.from(document.querySelectorAll('.panel[data-panel-id]')).map((e) => e.dataset.panelId)
      `)
      const collision = minted.filter((id) => otherIds.includes(id))
      ok('66 a spawn in another workspace mints no colliding id',
        collision.length === 0, `minted=${minted.join()} otherIds=${otherIds.join()} collision=${collision.join()}`)

      // 67. Cmd+Z immediately after a switch is INERT. history is one stack
      //     over one Panel[], and applyHistory calls registry.dispose for any
      //     panel the undone state no longer contains — so an uncleared stack
      //     would apply the OTHER workspace's array here and kill this
      //     workspace's agents. Doing nothing is the honest failure; doing
      //     something is the dangerous one.
      //
      //     Driven through window.__m4bUndo(), NOT a raw 'z' keydown: Cmd+Z is
      //     a main-process MENU ACCELERATOR (src/main/menu.ts), not a
      //     renderer keybinding the way Cmd+N is (see CLAUDE.md's "Cmd+N
      //     stays a renderer keybinding, not a menu accelerator") — and this
      //     harness is its own Electron entry point with no application menu
      //     (the same reason scripts/panels-entry.cjs passes registerIpcHandlers
      //     a no-op rebuildMenu). A synthetic keydown for 'z' therefore
      //     reaches no listener at all: useViewport's keydown switch has no
      //     'z' case, so zoomTo(wc, 'z') would silently assert a no-op against
      //     a harness that could never have exercised the real path either
      //     way. __m4bUndo() is the hook every other undo-driven check in this
      //     file already uses for exactly this reason (checks 22, 38, 45/46,
      //     50) — it drives the SAME setHistory(h => { undoHistory; applyHistory })
      //     call Cmd+Z's real 'edit:undo' handler runs.
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w1')`)
      await settle()
      const beforeUndo = await wc.executeJavaScript(`
        ({ panels: document.querySelectorAll('.panel').length,
           sessions: window.__m4aSessions().length })
      `)
      await wc.executeJavaScript(`window.__m4bUndo()`)
      await settle()
      const afterUndo = await wc.executeJavaScript(`
        ({ panels: document.querySelectorAll('.panel').length,
           sessions: window.__m4aSessions().length })
      `)
      ok('67 Cmd+Z right after a switch changes nothing',
        beforeUndo.panels === afterUndo.panels && beforeUndo.sessions === afterUndo.sessions,
        `${JSON.stringify(beforeUndo)} -> ${JSON.stringify(afterUndo)}`)

      // 68. THE MASS-SPAWN CHECK. Checks 64-67 all switch between workspaces
      //     this renderer has ALREADY rendered at least once — w1 at boot,
      //     'school'/w2 by creating it live — so registry.ensure already has
      //     (or trivially gets, for an empty workspace) a settled session for
      //     every panel involved, and dormantIds being briefly wrong on the
      //     wrong render is invisible against that fixture. w9/w9p1 close
      //     that gap: seeded on DISK before the window ever loaded (see the
      //     LAYOUT_PATH fixture above), never rendered by this process before
      //     this moment, and its own persisted focusedId names w9p1 —
      //     assignTiers pins a focused panel live UNCONDITIONALLY, so if
      //     dormantIds is wrong on the very first render after the switch
      //     (committing `next` before `pty.list()` resolves, the exact bug
      //     this check exists to catch), this fixture forces it into a spawn
      //     rather than merely hoping a camera/cull coincidence produces one.
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('${NEVER_RENDERED_WORKSPACE_ID}')`)
      await settle()
      // Waits for the FAILURE condition (a live session appearing) rather
      // than reading absence immediately: the spawn path is a few IPC round
      // trips deep (fit-before-spawn, then pty:create), so an instant read
      // could pass for a reason that has nothing to do with correctness — the
      // spawn simply had not landed yet. Other checks in this suite wait
      // 3-8s for a GENUINE spawn to land, so 3s of silence here is well past
      // that budget before the negative is trusted.
      const spawned = await waitUntil(
        async () => (await sessionMap(wc)).has(NEVER_RENDERED_PANEL_ID), 3000)
      const sessions68 = await wc.executeJavaScript(`window.__m4aSessions()`)
      const registered = sessions68.find((s) => s.id === NEVER_RENDERED_PANEL_ID)
      ok('68 a workspace switched to for the first time spawns nothing, even focused',
        spawned !== true && registered !== undefined &&
          registered.dormant === true && registered.spawned === false,
        `spawned=${spawned} registered=${JSON.stringify(registered)}`)
      // This block leaves NEVER_RENDERED_WORKSPACE_ID active when it ends —
      // there is no switch back to whatever was active before. Checks 69+
      // run against whatever workspace this one left active, not against a
      // known starting point.
    }

    // 69-70 — Task 6. Create/rename/delete from the palette, and the fourth
    //     registry.dispose call site. __m7aWorkspace().deleteWorkspace(id)
    //     drives the SAME gated action a real "Delete workspace…" row does
    //     (paletteActions.deleteWorkspace) rather than a bypass, which is
    //     what lets these two checks tell a real confirm gate apart from a
    //     delete function that runs unconditionally.
    {
      // 69. Deleting a workspace disposes its panels' sessions. Not detach —
      //     the record is going, so a surviving session is one no UI can
      //     ever reach or stop: backlog #61 (recover an orphan session) does
      //     not exist, so it would burn tokens invisibly until quit
      //     kill-servers the socket.
      //
      //     The plan's own check for this omitted the confirm step
      //     entirely — it called deleteWorkspace(id) and expected the
      //     session gone after a plain settle(), which only holds if the
      //     confirm gate does nothing, i.e. against a BROKEN implementation.
      //     Against the real gated action nothing is disposed until the
      //     question is answered, so this check answers it with a real
      //     Enter on the reopened palette's own input before reading
      //     anything back — the same reason check 50 clicks a real row
      //     rather than calling a store method directly.
      await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('doomed')`)
      await settle()
      await zoomTo(wc, 'n') // one panel in 'doomed', which goes live and spawns
      await settle()
      const before = await wc.executeJavaScript(`window.__m4aSessions().length`)
      const doomed = await wc.executeJavaScript(`
        window.canvas.workspace.list().then((r) => (r.find((w) => w.name === 'doomed') || {}).id)
      `)
      await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(doomed)})`)
      await settle()
      await pressPlain(wc, 'Enter') // answers the confirm; see this block's own comment
      await settle()
      const after = await wc.executeJavaScript(`window.__m4aSessions().length`)
      const rows69 = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      ok('69 deleting a workspace disposes its sessions and its record',
        after < before && !rows69.some((w) => w.name === 'doomed'),
        `sessions ${before} -> ${after} rows=${rows69.length}`)

      // 70. The confirm is a real gate: Escape leaves the workspace
      //     UNDELETED, read back out of workspace.list() rather than off the
      //     overlay. A confirm step that confirms unconditionally is
      //     invisible — the same reason check 50 reads preset.list()
      //     instead of the DOM.
      //
      //     The plan's own check dispatched Escape on `window`, which never
      //     reaches Palette.tsx's onKeyDown at all — that handler is bound
      //     to the palette's own `<input>`, and a window-targeted dispatch
      //     only reaches window's own listeners, never a descendant's
      //     (bubbling runs from the EVENT'S TARGET upward, and window has no
      //     ancestors to bubble past its own target in the first place —
      //     see CLAUDE.md's ".panel__slot never reaches xterm's listeners"
      //     for the same shape of mistake). pressPlain instead dispatches on
      //     `document.activeElement`, which the confirm input holds because
      //     opening the palette always focuses it (rule 1 in Canvas.tsx's
      //     "who owns the keyboard").
      const keepId = await wc.executeJavaScript(`window.canvas.workspace.create('keepme')`)
      await settle()
      await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(keepId)})`)
      await settle()
      await pressPlain(wc, 'Escape')
      await settle()
      const rows70 = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      ok('70 Escape at the confirm leaves the workspace undeleted',
        rows70.some((w) => w.id === keepId), `rows=${rows70.map((w) => w.name).join()}`)
    }

    // 70b — Task 7. M6d's premise applied to the strongest case of "an agent
    //     you cannot see": a wants-you panel whose whole CANVAS is hidden,
    //     not merely off screen. The count on its workspace row is read off
    //     a real rendered palette row, through main's real store — the same
    //     end-to-end shape checks 54-63 already used for the pip layer.
    //
    //     A fresh workspace, never hardcoded: createAndSwitch mints its own
    //     id the way checks 64-68 insist on, and this check reads it back
    //     rather than guessing a literal.
    {
      const BELL_LINE = "printf '\\007'\n"
      await wc.executeJavaScript(
        `window.__m7aWorkspace().createAndSwitch('waitroom')`)
      await settle()
      // A real shell, not Cmd+N's default `cat`: cat only ECHOES what it is
      // given, so writing BELL_LINE's literal backslash-escaped text to one
      // produces no actual 0x07 byte at all — the same reason checks 54-63
      // spawn through PRESET_SPAWN with an explicit /bin/sh rather than
      // using zoomTo(wc, 'n'). PRESET_SPAWN lands in whichever workspace is
      // currently active, which 'waitroom' now is.
      const idsBefore70b = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const panelId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !idsBefore70b.includes(id)) || false
      }, 4000)
      if (!panelId) throw new Error('70b: PRESET_SPAWN produced no new panel')
      // Lazy spawn: the PTY exists only once the panel has gone live and been
      // laid out, so nothing may be written to it until pty:list admits it.
      const spawned = await waitUntil(
        async () => (await settledSessionMap(wc)).has(panelId), 8000)
      if (!spawned) throw new Error(`70b: panel ${panelId} never got a PTY`)

      // Ring a real bell while the panel is still on screen and known live,
      // THEN leave — the same ordering check 58 uses and for the same
      // reason: switching away first would demote/unmount the panel before
      // the write could land.
      ptyManager.write(panelId, BELL_LINE)
      const rang = await waitUntil(async () => wc.executeJavaScript(`
        document.querySelector('.panel[data-panel-id=${JSON.stringify(panelId)}]')
          ?.dataset.agentState
      `).then((s) => s === 'wants-you'), 6000)
      if (rang !== true) throw new Error('70b: the panel never reached wants-you')

      // Leave — 'waitroom' is now hidden, its panel gone from the DOM, its
      // session and its agent state both still alive underneath.
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w1')`)
      await settle()

      await zoomTo(wc, 'k') // open the palette
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
      const titles70b = await wc.executeJavaScript(`
        Array.from(document.querySelectorAll('.palette__row')).map((e) => e.textContent)
      `)
      ok('70b a hidden workspace with a waiting panel says so on its row',
        titles70b.some((t) => t.includes('waiting')), titles70b.join(' | '))

      await pressPlain(wc, 'Escape')
      await settle()
    }

    // 71 — fix round 1, finding #1/#2. Deleting the workspace you are IN when
    //     it is the ONLY one left must not resurrect its disposed panels in
    //     the fresh replacement main installs. Checks 69/70 only ever
    //     exercise the "a neighbour already exists" branch of deleteWorkspace
    //     — this drives the other one, which is unreachable unless every
    //     OTHER workspace is gone first. There is no way to get there without
    //     actually deleting them: this suite has accumulated several by this
    //     point (the boot workspace, 'never rendered', 'school', 'keepme'),
    //     and none of that is special setup — it is what "exactly one
    //     workspace" actually requires, deleted through the same real gate
    //     69/70 already proved correct so this check is free to trust it.
    {
      const soleId = await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('sole')`)
      await settle()
      await zoomTo(wc, 'n') // one panel in 'sole', which goes live and spawns
      await settle()
      const solePanelId = await wc.executeJavaScript(`
        window.canvas.workspace.list().then((r) =>
          (r.find((w) => w.id === ${JSON.stringify(soleId)}) || { panelIds: [] }).panelIds[0])
      `)

      // Delete every OTHER workspace. None of them is active, so each is a
      // plain dispose+remove with no switch involved — the loop's own
      // correctness rests entirely on 69/70, not on anything new here.
      const others = (await wc.executeJavaScript(`window.canvas.workspace.list()`))
        .filter((w) => w.id !== soleId)
      for (const w of others) {
        await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(w.id)})`)
        await settle()
        await pressPlain(wc, 'Enter')
        await settle()
      }
      const onlyOneLeft = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      const before71 = await wc.executeJavaScript(`window.__m4aSessions().length`)

      // Now delete the LAST remaining workspace — the branch under test.
      await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(soleId)})`)
      await settle()
      await pressPlain(wc, 'Enter')
      await settle()
      const after71 = await wc.executeJavaScript(`window.__m4aSessions().length`)
      const rowsFinal = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      const freshActive = rowsFinal.find((w) => w.active)
      ok('71 deleting the only remaining workspace disposes its sessions ' +
         'and does not resurrect them in the fresh replacement',
        onlyOneLeft.length === 1 && onlyOneLeft[0].id === soleId &&
          after71 < before71 &&
          rowsFinal.length === 1 && !rowsFinal.some((w) => w.id === soleId) &&
          freshActive !== undefined && !freshActive.panelIds.includes(solePanelId),
        `onlyOneLeft=${onlyOneLeft.length} sessions ${before71}->${after71} ` +
        `rowsFinal=${JSON.stringify(rowsFinal)} solePanelId=${solePanelId}`)
      // This must remain the LAST workspace check in the suite: it deletes
      // every fixture workspace, including the sole survivor, so anything
      // appended after it inherits a one-workspace, zero-panel world with
      // none of the earlier fixtures (w1, w2/'school', w9/w9p1) still around.
    }

    // 72. Hovering a palette row moves the SELECTION, and the two things that
    //     must not move it.
    //
    //     Until this landed, .palette__row had no :hover rule anywhere and no
    //     pointer handler but onMouseDown — so the mouse could not tell the
    //     user which row Enter was pointed at until the click had already run
    //     something. Hover now drives the same `index` the arrow keys drive,
    //     which is why there is no second highlight class to assert on: the
    //     probe is .palette__row--selected, exactly as it is for the keyboard.
    //
    //     This has to live in verify:panels rather than verify:palette: the
    //     plain-node suite has no DOM and cannot dispatch a mouse event at all.
    //
    //     72c is the one that separates the shipped implementation from the
    //     obvious one. Blink re-dispatches a mousemove at the UNCHANGED cursor
    //     position after a scroll, to refresh :hover — so without the
    //     coordinate check in Palette.tsx's lastPointerRef, an ArrowDown that
    //     scrolls the list "hovers" whichever row slid under a stationary
    //     cursor and drags the selection straight back, making the arrow keys
    //     useless whenever the pointer happens to rest over the list. That is
    //     a real scroll, which no synthetic WheelEvent can produce here (the
    //     limit check 47 already records) — so this check reproduces the
    //     SIGNAL instead: a second mousemove at coordinates identical to the
    //     previous one, on a different row, must change nothing.
    {
      await wc.executeJavaScript(`
        if (document.querySelector('.palette') === null) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        }
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const hover = await wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        // "preset" is chosen because it reliably yields BOTH kinds of row with
        // no fixture setup: "Manage presets…" is always runnable, and the
        // rename/delete rows for the three built-ins are always disabled
        // (REASON_BUILT_IN_RENAME). Neither depends on panels or workspaces,
        // which check 71 has just left at zero.
        setter.call(input, 'preset')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 120))

        const all = () => [...document.querySelectorAll('.palette__row')]
        const selectedText = () => {
          const el = document.querySelector('.palette__row--selected')
          return el ? el.textContent : null
        }
        const isDisabled = (el) => el.className.includes('palette__row--disabled')
        const move = (el, x, y) =>
          el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }))
        const settleFrame = () => new Promise((r) => setTimeout(r, 60))

        const rows = all()
        const before = selectedText()
        // A runnable row that is NOT already selected, or the hover would have
        // nothing to prove.
        const target = rows.find((r) => !isDisabled(r) && r.textContent !== before)
        const disabled = rows.find((r) => isDisabled(r))
        // A SECOND runnable row, distinct from target, for the 72c probe.
        const other = rows.find((r) => !isDisabled(r) && r !== target && r.textContent !== before)
        if (!target || !disabled || !other) {
          return { error: 'fixture: rows=' + rows.length +
            ' target=' + !!target + ' disabled=' + !!disabled + ' other=' + !!other }
        }
        const targetText = target.textContent
        const disabledText = disabled.textContent

        // 72: a real move over a runnable row selects it.
        move(target, 100, 100)
        await settleFrame()
        const afterHover = selectedText()

        // 72b: a real move over a DISABLED row leaves the selection alone —
        // the same rule stepRunnable states for the arrow keys.
        move(disabled, 100, 200)
        await settleFrame()
        const afterDisabled = selectedText()

        // 72c: an IDENTICAL-coordinate move on a different row is the
        // post-scroll synthetic, and must change nothing. (The disabled move
        // above is what left lastPointerRef at 100,200 — the handler records
        // the position before it bails on disabledReason.)
        move(other, 100, 200)
        await settleFrame()
        const afterSynthetic = selectedText()

        return { before, targetText, disabledText, afterHover, afterDisabled, afterSynthetic }
      })()`)
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      `)
      await settle()
      ok('72 hovering a runnable palette row selects it',
        hover.error === undefined && hover.afterHover === hover.targetText &&
          hover.afterHover !== hover.before,
        JSON.stringify(hover))
      ok('72b hovering a DISABLED palette row leaves the selection where it was',
        hover.error === undefined && hover.afterDisabled === hover.targetText &&
          hover.afterDisabled !== hover.disabledText,
        JSON.stringify(hover))
      ok("72c a mousemove at the previous move's exact coordinates is the " +
         'post-scroll synthetic and moves nothing',
        hover.error === undefined && hover.afterSynthetic === hover.targetText,
        JSON.stringify(hover))
    }

    // 73. THE FRAME INSETS THE CANVAS, and the canvas survives being inset.
    //
    //     Two assertions, and the second is the one worth having. That the
    //     canvas got narrower is nearly tautological once a grid exists. That a
    //     panel is STILL PROMOTED afterwards is not: a narrower canvas host is a
    //     smaller cull region, assignTiers legitimately demotes on it, and a
    //     frame that quietly demoted the panel the user was looking at would
    //     render as a card with no error anywhere. The .xterm probe is the same
    //     "is it still live" proof check 51 makes for the spawn cascade.
    //
    //     The Cmd+N is not decoration: check 71 above deletes every fixture
    //     workspace and leaves a one-workspace, ZERO-panel world behind (its
    //     own closing comment says so), so this check has to mint the panel
    //     whose promotion it is about to assert. Spawning it here also makes
    //     the promotion claim stronger than inheriting a survivor would: the
    //     panel is created at the camera's centre on the ALREADY-inset canvas.
    {
      await zoomTo(wc, 'n')
      await settle()
      const geom = await wc.executeJavaScript(`(() => {
        const shell = document.querySelector('.shell')
        const canvas = document.querySelector('.canvas')
        // M46: dock | navigator | canvas | context. The identity is still
        // the clause that discriminates — an element pushed out of view
        // reports its width exactly as a visible one does, so every looser
        // bound survives the min-width:auto failure this check exists for.
        const dock = document.querySelector('.shell__dock')
        const rail = document.querySelector('.shell__rail')
        const inspector = document.querySelector('.shell__inspector')
        if (!shell || !canvas || !dock || !rail || !inspector) return null
        const c = canvas.getBoundingClientRect()
        return {
          canvasWidth: c.width,
          windowWidth: window.innerWidth,
          dockWidth: dock.getBoundingClientRect().width,
          railWidth: rail.getBoundingClientRect().width,
          inspectorWidth: inspector.getBoundingClientRect().width,
          canvasLeft: c.left
        }
      })()`)
      const live = await wc.executeJavaScript(
        `document.querySelectorAll('.panel .xterm').length`)
      ok('73 the shell frame insets the canvas and leaves a panel promoted',
        geom !== null && geom.dockWidth > 40 && geom.railWidth > 40 &&
          geom.canvasWidth < geom.windowWidth - 80 &&
          geom.canvasLeft >= geom.dockWidth + geom.railWidth - 1 &&
          // The EXACT inset, and it is the clause that does the discriminating.
          // Every bound above it is loose enough to survive the one CSS failure
          // the frame's own comment names: drop `min-width: 0` from the canvas
          // cell and the grid item refuses to shrink, so the canvas overflows
          // and shoves the inspector off screen — yet getBoundingClientRect()
          // reports width for an element pushed out of view exactly as it does
          // for a visible one, so treeWidth is still 22 (collapsed by default —
          // see below), railWidth is still 240, inspectorWidth is still 260,
          // canvasLeft is still treeWidth + 240, and an overflowing canvasWidth
          // is still comfortably under windowWidth - 80. All six loose clauses
          // pass under that regression. Only the identity — the four columns
          // summing to the window — fails, because an overflowing middle cell is
          // precisely a canvas WIDER than the space the other three leave it.
          // ±1 for fractional device pixels, not for slack in the claim.
          //
          // The tree is COLLAPSED here (files.treeOpen defaults false, and
          // nothing before this check has touched it), so treeWidth is the
          // 22px strip rather than the full 220px column — measured, not
          // assumed, the same rule check 125 states for its own open read.
          Math.abs(geom.canvasWidth -
            (geom.windowWidth - geom.dockWidth - geom.railWidth - geom.inspectorWidth)) <= 1 &&
          live > 0,
        JSON.stringify(geom) + ` live=${live}`)
      // The state this check LEAVES BEHIND, in the same spirit as 71's own
      // closing note, because this is a top-to-bottom suite and 74 onward will
      // be appended directly below: the zero-panel world 71 describes ends
      // here. Check 73 spawns one panel via Cmd+N at the camera's centre and
      // lets it go live, so anything appended after this inherits a
      // one-workspace world holding ONE panel with a live PTY — not an empty
      // one. A later check that counts panels, counts sessions, or presses
      // Cmd+Z expecting nothing to undo must account for it.
    }

    // 74. THE PALETTE'S THIRD EXIT STILL WORKS FROM THE SHELL.
    //
    //     Task 2 made the shell a SIBLING of .canvas, and the outside-click
    //     dismissal is a capture listener on .canvas — so without this it never
    //     runs for a shell click and the overlay stays up with DOM focus on a
    //     button. That is the fourth, un-audited exit "Three ways out of the
    //     palette" exists to remove, and Escape cannot undo it because the key no
    //     longer reaches the palette's own onKeyDown.
    //
    //     Check 42 already pins the canvas case and must stay green: this is an
    //     ADDITIONAL door, not a replacement one.
    {
      await wc.executeJavaScript(`
        if (document.querySelector('.palette') === null) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        }
      `)
      const opened = await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const dismissed = await wc.executeJavaScript(`(async () => {
        const rail = document.querySelector('.shell__rail')
        rail.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 300 }))
        await new Promise((r) => setTimeout(r, 120))
        return document.querySelector('.palette') === null
      })()`)
      ok('74 a mousedown on the shell dismisses the open palette',
        opened === true && dismissed === true,
        `opened=${opened} dismissed=${dismissed}`)
    }

    // 75. COLLAPSE IS REAL LAYOUT, IT PERSISTS TO MAIN'S STORE, AND IT DEMOTES
    //     NOTHING.
    //     Read back through settings:list rather than off the shell's own class,
    //     for the same reason check 53 does: a toggle that only flips a local
    //     boolean looks identical on screen and is gone on the next launch.
    //
    //     The `stillLive` clause is the spec's own conjunction, which until now
    //     shipped as two checks that never met: check 73 asserts `.xterm` but
    //     collapses nothing, and this check collapsed but never looked at
    //     promotion, so success criterion 3 ("no panel that was live before the
    //     collapse is demoted by it") was asserted nowhere.
    //
    //     BE HONEST ABOUT ITS POWER TODAY: the clause is close to tautological.
    //     Nothing in the renderer observes the canvas host's SIZE — the tiering
    //     effect depends on [rects, viewport, focusedId, version, dormantIds]
    //     and reads getBoundingClientRect() only when one of those changes, and
    //     the single ResizeObserver in the renderer belongs to EdgeIndicators
    //     and re-renders the pip layer alone. So a collapse does not re-run
    //     assignTiers at all and nothing could demote here. The clause exists
    //     for the future in which that stops being true: the moment anything
    //     makes a width change re-tier (a ResizeObserver on the host, a window
    //     size in Canvas state), a collapse becomes able to demote the panel
    //     the user was looking at into a card with nothing in any log, and this
    //     is the check that would go red. It is cheap insurance on a real
    //     criterion, not a proof of one.
    {
      const before = await wc.executeJavaScript(
        `document.querySelector('.canvas').getBoundingClientRect().width`)
      const liveBefore = await wc.executeJavaScript(
        `document.querySelectorAll('.panel .xterm').length`)
      await wc.executeJavaScript(`
        document.querySelector('.shell__rail-toggle').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      // Longer than the 150ms this used to wait: DEMOTE_DELAY_MS is 250, so a
      // demotion triggered by the collapse would be APPLIED after the old
      // wait, not before it, and the .xterm probe would read the pre-demotion
      // DOM and pass against exactly the future regression it is here for.
      await sleep(500)
      const after = await wc.executeJavaScript(
        `document.querySelector('.canvas').getBoundingClientRect().width`)
      const liveAfter = await wc.executeJavaScript(
        `document.querySelectorAll('.panel .xterm').length`)
      const stored = await wc.executeJavaScript(
        `window.canvas.settings.list().then((rows) =>
           rows.find((r) => r.id === 'shell.railOpen').value)`)
      ok('75 collapsing the rail widens the canvas, reaches main\'s store, and demotes nothing',
        after > before + 100 && stored === false &&
          liveBefore > 0 && liveAfter >= liveBefore,
        `before=${before} after=${after} stored=${stored} ` +
          `live ${liveBefore} -> ${liveAfter}`)
    }

    // 75b. AUTO-REPEAT IS ONE GESTURE. A held Cmd+\ toggles once, not fifteen
    //      times — the Cmd+K defect, which for a toggle means the rail's final
    //      state depends on whether the user released on an odd or even repeat.
    //      Like checks 7b and 33b this supplies repeat:true by hand, so it proves
    //      the guard READS the flag and says nothing about who sets it.
    {
      // Named for what it ANSWERS. It was `open()` and returned whether the
      // rail is COLLAPSED, so the detail string below read backwards: a
      // passing run printed start=true for a rail that was shut.
      const collapsed = () => wc.executeJavaScript(
        `document.querySelector('.shell').classList.contains('shell--rail-collapsed')`)
      const start = await collapsed()
      await wc.executeJavaScript(`
        for (let i = 0; i < 5; i++) {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: '\\\\', code: 'Backslash', metaKey: true, repeat: true, bubbles: true }))
        }
      `)
      await sleep(200)
      const afterRepeats = await collapsed()
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: '\\\\', code: 'Backslash', metaKey: true, repeat: false, bubbles: true }))
      `)
      await sleep(200)
      const afterReal = await collapsed()
      ok('75b a held Cmd+\\ toggles the rail once, not once per repeat',
        afterRepeats === start && afterReal !== start,
        `collapsed: start=${start} afterRepeats=${afterRepeats} afterReal=${afterReal}`)
    }

    // 75c. A SHELL CONTROL NEVER TAKES THE KEYBOARD.
    //      The quietest failure this surface has: click a button, and the next
    //      keystroke goes nowhere because DOM focus is on the button rather than
    //      xterm's hidden textarea. focusedId ALSO has to survive — assignTiers
    //      pins the focused panel live, and it is the Cmd+C target.
    //
    //      Two deliberate departures from the brief's draft of this check, both
    //      forced by what the renderer actually exposes.
    //
    //      (1) There is NO route from this suite to `focusedId` itself.
    //      `__m4aSelection()` — the draft's read — returns xterm's SELECTED TEXT
    //      (a string), so `.focusedId` on it is `undefined` at both ends and the
    //      draft's equality would have compared undefined to a panel id, failing
    //      for a reason that has nothing to do with shell controls.
    //      PRESET_CAPTURE is no substitute either: it answers with the focused
    //      panel's SPEC (cwd/args/w/h), never its id — check 30 pins exactly
    //      that shape. So the two halves are probed the way the suite already
    //      probes them, with no new renderer hook minted for one check:
    //        - the exact IDENTITY, from `document.activeElement.closest('.panel')`,
    //          which is where a stolen keyboard shows up and is the same read
    //          check 6 uses for "a body click focuses the panel";
    //        - `focusedId` NOT BEING RELEASED, from `__m4aGrid() !== null`,
    //          which resolves through focusedIdRef — check 41's own probe, and
    //          its comment explains why a non-null answer means "the app still
    //          believes a live panel is focused".
    //      What that pair cannot distinguish, stated rather than implied: a
    //      control that swapped focusedId to a DIFFERENT live panel while DOM
    //      focus stayed put would satisfy both. No such swap is reachable from a
    //      button that never calls onSelectPanel, and closing the gap would mean
    //      a new __m8a* hook for a fact nothing else needs.
    //
    //      (2) There is no top-level `clickPanel(id)` helper in this file. The
    //      real-OS-click idiom is copied in locally below, and NOT because the
    //      original is out of reach: `clickPanelBody` (~line 761) is declared in
    //      the same enclosing try block and is perfectly in scope here. The copy
    //      is deliberate, and what it buys is narrowness — this check needs a
    //      click at the centre of an arbitrary SELECTOR (it clicks a shell
    //      button, which is not a panel body at all), and widening
    //      `clickPanelBody` to serve that would put a second caller with
    //      different needs on a helper a dozen earlier checks depend on. The
    //      duplication is four lines of sendInputEvent; the alternative is a
    //      shared helper that goes wrong for checks nobody was editing.
    //      A DISPATCHED mousedown would not serve: it sets focusedId, but the
    //      browser moves no DOM focus for a synthetic event, so `insideBefore`
    //      would be false and the check would prove nothing about the half it
    //      exists for.
    {
      // The real-click focus idiom, copied from clickPanelBody (~line 761) and
      // narrowed to what this check needs: sendInputEvent, not a dispatched
      // MouseEvent, because only a real OS-level click moves DOM focus into
      // xterm's hidden textarea — which is exactly what a shell control must
      // not steal.
      const realClick = async (selector) => {
        const box = await wc.executeJavaScript(
          `(() => { const s = document.querySelector(${JSON.stringify(selector)});
                    if (!s) return null;
                    const r = s.getBoundingClientRect();
                    return { x: Math.round(r.left + r.width / 2),
                             y: Math.round(r.top + r.height / 2) } })()`)
        if (!box) throw new Error(`75c: no element matched ${selector}`)
        wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        await sleep(150)
      }
      const id = await wc.executeJavaScript(
        `document.querySelector('.panel__slot').closest('.panel').getAttribute('data-panel-id')`)
      await realClick(`.panel[data-panel-id="${id}"] .panel__slot`)
      // Both halves in one read, so they describe the same instant.
      const probe = () => wc.executeJavaScript(`(() => {
        const host = document.activeElement && document.activeElement.closest('.panel')
        return {
          inside: host !== null && host !== undefined,
          id: host ? host.getAttribute('data-panel-id') : null,
          focusedLive: window.__m4aGrid() !== null
        }
      })()`)
      const before = await probe()
      // A REAL click on the toggle, not the draft's dispatched pair. This is
      // what makes the check capable of failing at all: a synthetic MouseEvent
      // is untrusted, and Chromium runs no default action for one — so it
      // never moves DOM focus to the button whether or not onMouseDown calls
      // preventDefault(), and a dispatched-event version of this check passes
      // identically against the very regression it exists to catch. Confirmed
      // by deleting the preventDefault and watching this go red.
      await realClick('.shell__rail-toggle')
      const after = await probe()
      ok('75c a shell control takes neither focusedId nor DOM focus',
        before.inside === true && after.inside === true &&
          before.id === id && after.id === id &&
          before.focusedLive === true && after.focusedLive === true,
        `panel=${id} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      // What 75/75b/75c LEAVE BEHIND, in the spirit of 73's own closing note:
      // the one-panel, one-workspace world is unchanged, but the rail is now
      // COLLAPSED and `shell.railOpen` is false in main's store (75 collapsed
      // it, 75b's one real chord reopened it, 75c's button click collapsed it
      // again). The inspector is untouched and still open. Anything appended
      // below that measures the canvas's width — or clicks at a screen point
      // captured before this block — must account for the narrower rail.
    }

    // 76. THE SPAWN BUTTON OPENS THE SHEET, AND THE SHEET SPAWNS EXACTLY ONE
    //     PANEL, THROUGH MAIN (M65). Exactly one is half the check: a button
    //     that also let its click reach the canvas background would spawn
    //     once and select something else, and a double-fire looks identical
    //     to a slow machine. Enter in the sheet with its defaults (the default
    //     preset, the focused panel's or the preset's directory) is the spawn.
    {
      const before = await wc.executeJavaScript(`window.__m4aSessions().length`)
      await wc.executeJavaScript(`
        document.querySelector('.shell__spawn').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      const sheetShown = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-spawn-sheet]') !== null`), 3000)
      await wc.executeJavaScript(`(() => { const w = document.querySelector('[data-sheet-where]'); if (w) w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return !!w })()`)
      await sleep(600)
      const after = await wc.executeJavaScript(`window.__m4aSessions().length`)
      ok('76 the New panel button opens the sheet, and Enter in it spawns exactly one panel',
        sheetShown === true && after === before + 1, `sheet=${sheetShown} ${before} -> ${after}`)
    }

    // 77. THE ZOOM CLUSTER MOVES THE CAMERA THROUGH NAMED VERBS.
    //     Reads __m4aScale rather than a CSS transform so it is the same number
    //     viewport.ts computes. Fit is asserted separately from the steppers
    //     because they are different verbs and a wiring that pointed both at
    //     resetViewport would still change the scale.
    //
    //     The Fit half is THREE clauses, and it takes all three. The obvious
    //     one — `fitted > 0` — is satisfied by any non-zero scale at all, so
    //     it passes against a Fit button wired to resetViewport, wired to
    //     zoomBy, and, worst, wired to NOTHING (the scale simply stays where
    //     the steppers left it). Each clause below kills one of those.
    //
    //     (a) |fitted - backOut| > 0.001 kills "wired to nothing", and NOTHING
    //         ELSE. It is emphatically NOT sufficient on its own, and the
    //         numbers are worth writing down because they are close enough to
    //         look like coverage: TopBar's ZOOM_STEP is 1.2 and this fixture's
    //         real fit is ~1.194, so a Fit button carrying a copy-pasted
    //         zoom-in handler (onZoomBy(ZOOM_STEP) — the easiest real mistake
    //         on this bar) lands 1.2 against the correct 1.194. |1.2 - 1| =
    //         0.2 and |1.194 - 1| = 0.194: both clear this bound just as
    //         easily, and clause (a) cannot tell them apart.
    //
    //     (b) |fitTwice - fitted| < 0.001 is what separates a FIT from a
    //         STEPPER, and it is the clause that actually kills the zoomBy
    //         mis-wiring. fitAll is idempotent — fitting an unchanged world
    //         twice lands the same scale — while zoomBy COMPOUNDS: 1.2 then
    //         1.44. Clicking Fit a second time and demanding the scale did not
    //         move is therefore a property of "this is a fit", and it needs
    //         zero knowledge of what fitTo computes internally.
    //
    //         That is deliberately chosen over recomputing fitTo's expected
    //         scale from __m4aViewport() and asserting equality. Recomputing
    //         means restating fitTo's padding and clamp arithmetic here — a
    //         second copy of math verify:viewport already pins purely, and one
    //         that goes silently wrong the first time the real one changes.
    //         The harness must never grow that copy.
    //
    //     (c) |fitted - 1| > 0.001 kills resetViewport DELIBERATELY rather
    //         than by coincidence. INITIAL.scale is 1, and clause (a) only
    //         happened to exclude a reset because backOut is also 1 in this
    //         run's world — a coincidence of the fixture, not a property.
    //
    //         CLAUSE (c) IS FIXTURE-DEPENDENT and must not be "fixed" by
    //         loosening its tolerance. It assumes this world's panels do not
    //         happen to fit at exactly scale 1.0. A later task that changes
    //         the world — panel count, sizes, positions, or the canvas's own
    //         size, which the collapsed rail already affects — can make the
    //         true fit land on 1.0, and this clause then goes red for a reason
    //         that has nothing whatever to do with the Fit button. The right
    //         response to that failure is to change the FIXTURE (or to state
    //         the new expected scale), never to widen the bound: widening it
    //         hands resetViewport back its free pass.
    {
      const start = await wc.executeJavaScript(`window.__m4aScale()`)
      await wc.executeJavaScript(`
        document.querySelector('[data-hud-zoom-in]')?.dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(120)
      const zoomedIn = await wc.executeJavaScript(`window.__m4aScale()`)
      await wc.executeJavaScript(`
        document.querySelector('[data-hud-zoom-out]')?.dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(120)
      const backOut = await wc.executeJavaScript(`window.__m4aScale()`)
      await wc.executeJavaScript(`
        document.querySelector('[data-hud-fit]')?.dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(200)
      const fitted = await wc.executeJavaScript(`window.__m4aScale()`)
      // The second Fit, for clause (b). Nothing about the world changes
      // between the two clicks, so a real fitAll must land on exactly the
      // scale it just landed on — and a stepper cannot.
      await wc.executeJavaScript(`
        document.querySelector('[data-hud-fit]')?.dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(200)
      const fitTwice = await wc.executeJavaScript(`window.__m4aScale()`)
      ok('77 the zoom cluster steps in, steps out, and fits',
        zoomedIn > start + 0.01 && Math.abs(backOut - start) < 0.001 &&
          Math.abs(fitted - backOut) > 0.001 &&
          Math.abs(fitTwice - fitted) < 0.001 &&
          Math.abs(fitted - 1) > 0.001,
        `start=${start} in=${zoomedIn} out=${backOut} fit=${fitted} fitTwice=${fitTwice}`)
    }

    // 78. SEARCH AND SETTINGS OPEN THE PALETTE, AND SETTINGS ARRIVES IN ITS SCOPE.
    //     The scope is the half that matters: an M6b setting is hiddenAtRest, so a
    //     settings button that merely opened the palette would land the user on a
    //     list with no settings visible at all — a feature that reads as missing.
    {
      await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })()`)
      await sleep(120)
      await wc.executeJavaScript(`
        document.querySelector('.shell__search').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      const searchOpened = await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      // Read the chip here too, not only after the gear. See the note on the
      // ok() below for what this second read is the only thing that can catch.
      const searchChip = await wc.executeJavaScript(`(() => {
        const chip = document.querySelector('.palette__scope')
        return chip ? chip.textContent.trim() : null
      })()`)
      await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })()`)
      await sleep(120)
      await wc.executeJavaScript(`
        document.querySelector('.shell__settings').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      await sleep(150)
      const inScope = await wc.executeJavaScript(`(() => {
        const chip = document.querySelector('.palette__scope')
        const rows = [...document.querySelectorAll('.palette__row')]
        return {
          chip: chip ? chip.textContent.trim() : null,
          sawASetting: rows.some((r) => r.textContent.includes('Idle after'))
        }
      })()`)
      // The chip is now ASSERTED at BOTH clicks, not collected into the detail
      // string and left out of the condition.
      //
      // `inScope.chip === 'Settings'` is the gear's half. `sawASetting` alone
      // does not pin it: a gear that opened the palette with the query
      // pre-filled — a plausible alternative implementation — would surface a
      // setting row with no scope at all, and the scope is what makes the
      // button honest, because a scope survives the user clearing the query
      // while a pre-filled search does not.
      //
      // `searchChip === null` is Search's half, and it is the ONLY clause that
      // can fail against a Search button mis-wired to openSettingsScope. Note
      // what the gear-side read cannot do here: it is taken after the GEAR was
      // clicked, so it reads 'Settings' whether or not Search is also
      // scope-opening. The two reads are at two different moments on purpose.
      ok('78 search opens the palette unscoped and settings opens it in the settings scope',
        searchOpened === true && searchChip === null &&
          inScope.sawASetting === true && inScope.chip === 'Settings',
        `search=${searchOpened} searchChip=${searchChip} scope=${JSON.stringify(inScope)}`)
      // What 76/77/78 LEAVE BEHIND, in the spirit of 73's and 75c's closing
      // notes. The world now holds TWO live panels, not one: check 76's spawn
      // is real and is never undone. The camera is wherever `Fit` put it (a
      // fitTo over both panels), NOT at INITIAL — anything appended below that
      // reuses a screen coordinate captured earlier in this file is measuring
      // against a camera that has moved. Check 77 clicks Fit TWICE, and the
      // second click is asserted to leave the camera's scale exactly where the
      // first put it (clause (b)), so "wherever Fit put it" is one place, not
      // two — that idempotence is checked, not assumed. The rail is still collapsed and the
      // inspector still open, both untouched here. The palette is closed: the
      // two Escapes below pop the settings scope and then close the overlay,
      // because Escape inside a drill-in deliberately pops rather than closes
      // (Palette.tsx's two-stage rule), so ONE Escape would leave the overlay
      // up and swallow the next check's keyboard.
      for (let i = 0; i < 2; i++) {
        await wc.executeJavaScript(`(() => {
          const input = document.querySelector('.palette__input')
          if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        })()`)
        await sleep(120)
      }
    }

    // 79. A PALETTE TOGGLE OF THE RAIL REACHES THE SCREEN, not only the store.
    //
    //     `shell.railOpen` is an ordinary boolean SettingDef, so main's
    //     settings:list AUTO-GENERATES a runnable palette row for it — nobody
    //     wrote that row, and nobody wired it to the shell. Running it writes
    //     through settings:set and reloads settingRows, which is everything
    //     check 53 asks of a setting and is NOT enough here: useShellChrome
    //     holds the rail's visibility in its own React state, and a read effect
    //     that never re-runs leaves the frame exactly where it was. The failure
    //     is total and silent — the setting persists, the rail does not move,
    //     and the row's own title (which renders which way the toggle currently
    //     sits) then reads "Off" beside a visibly open rail. Main and the
    //     renderer disagree, which is the two-authorities drift "One map, and a
    //     typed view over it" exists to prevent.
    //
    //     This is the palette -> SCREEN direction, and nothing else covers it.
    //     Check 53 is palette -> store and check 75 is button -> store; both
    //     stay green against this defect, because neither ever looks at the
    //     frame after a PALETTE-driven write. So the assertion that
    //     discriminates is `moved` — the canvas host actually got narrower —
    //     and `storedAfter` sits beside it as the non-vacuity guard: without
    //     it, a run where the row was never found or never ran would report the
    //     same "the rail did not move" as the real regression.
    //
    //     Watched failing against the empty-dep-array read effect before the
    //     fix: stored=true (main took the write) with the canvas width
    //     unchanged and shell--rail-collapsed still on the root.
    //
    //     World state inherited from 78: two live panels, camera wherever Fit
    //     put it, RAIL COLLAPSED (shell.railOpen === false in main's store),
    //     inspector open, palette closed. So the toggle below opens the rail,
    //     and the canvas gets NARROWER — the opposite direction from 75's.
    {
      const openPalette = async () => {
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        return waitUntil(
          () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      }
      const canvasWidth = () => wc.executeJavaScript(
        `document.querySelector('.canvas').getBoundingClientRect().width`)
      const railStored = () => wc.executeJavaScript(
        `window.canvas.settings.list().then((rows) =>
           rows.find((r) => r.id === 'shell.railOpen').value)`)

      const storedBefore = await railStored()
      const before = await canvasWidth()
      await openPalette()
      // By a keyword-ish query against the row's own label, the way check 52
      // reaches a setting: the row is hiddenAtRest, so it is only in the list
      // at all because something was typed.
      const picked = await wc.executeJavaScript(`(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value').set
        const input = document.querySelector('.palette__input')
        setter.call(input, 'side rail')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 100))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Show the side rail'))
        if (!row) return 'not found'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        return 'ok'
      })()`)
      if (picked !== 'ok') throw new Error(`79: the rail setting row was ${picked}`)
      // runRow closes the overlay BEFORE running the command, so this is an
      // assertion rather than a wait for something optional — a left-open
      // palette would swallow check 80's chord.
      await waitUntil(() => wc.executeJavaScript(
        `document.querySelector('.palette') === null`), 2000)

      const storedAfter = await waitUntil(async () =>
        (await railStored()) === true ? true : false, 3000)
      const moved = await waitUntil(async () =>
        (await canvasWidth()) < before - 100 ? true : false, 3000)
      const after = await canvasWidth()
      const collapsed = await wc.executeJavaScript(
        `document.querySelector('.shell').classList.contains('shell--rail-collapsed')`)
      ok('79 a palette toggle of the rail moves the rail, not only the store',
        storedBefore === false && storedAfter === true &&
          moved === true && collapsed === false,
        `storedBefore=${storedBefore} storedAfter=${storedAfter} ` +
          `width ${before} -> ${after} collapsed=${collapsed}`)
      // What 79 LEAVES BEHIND, in the spirit of 73's, 75c's and 78's closing
      // notes: the world's two live panels and the camera are untouched, the
      // palette is closed, and the RAIL IS NOW OPEN — `shell.railOpen` is true
      // in main's store and the canvas is back to its narrower, three-column
      // width. The inspector is still open and still untouched. Anything
      // appended below that measures the canvas must account for the rail
      // having reopened.
    }

    // 80. THE INSPECTOR CHORD, AS macOS ACTUALLY DELIVERS IT.
    //
    //     One check, three regressions, and none of them is reachable from any
    //     other check in this file.
    //
    //     (a) `event.code`, not `event.key`. Check 75b dispatches
    //         { key: '\\', code: 'Backslash' } — BOTH matching — so reverting
    //         useShellChrome's `event.code === 'Backslash'` to an `event.key`
    //         test passes it unchanged. With Shift held macOS reports
    //         key '|' and code 'Backslash', which is what this check sends, so
    //         a key-based test sees no chord at all and the inspector never
    //         moves.
    //     (b) The Shift BRANCH. Nothing else in the suite has ever sent
    //         shiftKey with this chord, so `toggleRail()` written into both
    //         branches — the easiest real mistake in that if/else — was
    //         invisible to all of the checks before this one.
    //     (c) The `shell--inspector-collapsed` class. The rail's class is
    //         asserted by 75b; the inspector's was asserted nowhere, so a
    //         class name typed wrong in Canvas.tsx's template literal would
    //         render an inspector that never collapses with nothing red.
    //
    //     The rail clause is what makes (b) fail rather than merely look odd:
    //     both-branches-rail flips shell--rail-collapsed and leaves
    //     shell--inspector-collapsed alone, which is exactly the pair this
    //     check forbids.
    {
      const classes = () => wc.executeJavaScript(`(() => {
        const shell = document.querySelector('.shell')
        return {
          rail: shell.classList.contains('shell--rail-collapsed'),
          inspector: shell.classList.contains('shell--inspector-collapsed')
        }
      })()`)
      const before = await classes()
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: '|', code: 'Backslash', metaKey: true, shiftKey: true,
          repeat: false, bubbles: true }))
      `)
      await sleep(250)
      const after = await classes()
      ok('80 the inspector chord toggles the inspector and leaves the rail alone',
        after.inspector !== before.inspector && after.rail === before.rail,
        `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      // What 80 LEAVES BEHIND: the inspector is now COLLAPSED (it was open on
      // entry, from 79's note) and `shell.inspectorOpen` is false in main's
      // store; the rail stays open, the two panels and the camera are
      // untouched, and the palette is closed.
    }

    /* ---- M8b: the panel outline rail ---- */

    // World state inherited from 80: the RAIL IS OPEN (79 reopened it), the
    // inspector is collapsed, two live panels, palette closed. The rail being
    // open is a precondition for everything below — a collapsed rail hides the
    // list — so it is asserted rather than assumed.

    // 81. A ROW PER PANEL, WITH THE HONEST LABEL AND A REAL PID.
    //     The pid half is what makes this more than a count: a row rendering
    //     the panel id, or a hardcoded stand-in, would satisfy "there are N
    //     rows" while telling the user nothing main actually resolved. And a
    //     label of '' — the shape a dropped honest chain produces — is checked
    //     explicitly, because an empty row is indistinguishable from a styling
    //     bug at a glance.
    {
      const railOpen = await wc.executeJavaScript(
        `!document.querySelector('.shell').classList.contains('shell--rail-collapsed')`)
      // Scoped to .rail-list--panels: M8d's Workspaces section (Task 3) rows
      // share the bare .rail-row class for its layout rules, and an unscoped
      // query here would pick up the workspace list's row too.
      const rows = await wc.executeJavaScript(`
        [...document.querySelectorAll('.rail-list--panels .rail-row')].map((r) => ({
          id: r.getAttribute('data-rail-row'),
          label: r.querySelector('.rail-row__label').textContent,
          tail: r.querySelector('.rail-row__tail').textContent
        }))`)
      const panelIdsNow = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      const sameSet = rows.length === panelIdsNow.length &&
        panelIdsNow.every((id) => rows.some((r) => r.id === id))
      const labelled = rows.every((r) => typeof r.label === 'string' && r.label.length > 0)
      // M63. The rail's word column, not a pid: every row here is live.
      const pidTail = rows.every((r) => /^(working|idle|running|starting|needs you)$/.test(r.tail))
      ok('81 the rail renders one labelled row per panel, with a live state word',
        railOpen === true && sameSet && labelled && pidTail,
        `railOpen=${railOpen} rows=${JSON.stringify(rows)} panels=${JSON.stringify(panelIdsNow)}`)
    }

    // 82. ONE TITLE SOURCE, NOT TWO. A rename typed into the palette has to
    //     reach the rail row, because the rail reads Panel.title through the
    //     same honest chain the header does. The failure this catches is a rail
    //     that snapshotted its labels once and froze — a LIVE hazard here and
    //     nowhere else, since railRows is deliberately frozen on a signature:
    //     get that signature's fields wrong and the rows never rebuild, with
    //     nothing throwing and the panel's own header still correct beside a
    //     stale row.
    //
    //     Spawns its own panel with Cmd+N rather than renaming one of 81's,
    //     because the rename row targets `capturedId` — focusedId as it was
    //     when the palette opened. Spawning does not focus (check 40's note),
    //     so the panel is clicked first, the same step check 45 takes and for
    //     the same reason. Check 86 closes this panel again through the rail's
    //     own close control.
    {
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      await zoomTo(wc, 'n')
      const idsAfter = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 4000)
      state.renamedId = idsAfter ? idsAfter.find((id) => !idsBefore.has(id)) : null
      if (!state.renamedId) throw new Error('82: Cmd+N produced no new panel')

      // Spawning does not focus (check 40's note): the palette captures
      // focusedId at OPEN time, so without this click the rename row would be
      // aimed at whatever panel was focused before, not the one just spawned.
      await waitUntil(async () => {
        await wc.executeJavaScript(`(() => {
          const slot = document.querySelector('[data-panel-id=${JSON.stringify(state.renamedId)}] .panel__slot')
          if (slot) slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        })()`)
        return wc.executeJavaScript(`window.__m4aGrid() !== null`)
      }, 5000, 200)

      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await waitUntil(() => wc.executeJavaScript(
        `document.querySelector('.palette__input') !== null`), 2000)
      const ran = await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set
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
        nativeSet(field, 'outline probe')
        await new Promise((r) => setTimeout(r, 50))
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        return 'ok'
      })()`)
      const rowLabel = () => wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row=${JSON.stringify(state.renamedId)}]')
        return row ? row.querySelector('.rail-row__label').textContent : null
      })()`)
      const landed = ran === 'ok' &&
        Boolean(await waitUntil(async () => (await rowLabel()) === 'outline probe', 3000))
      ok('82 a rename typed into the palette reaches the rail row',
        landed, `ran=${ran} id=${state.renamedId} label=${await rowLabel()}`)
      // What 82 LEAVES BEHIND: a THIRD panel, titled "outline probe", focused
      // and selected; the palette is closed. Check 86 closes it again.
    }

    // 83. A REAL BELL MOVES ONE ROW'S DOT, AND THE OTHERS STAY REAL.
    //     What this proves: a real bell, through a real PTY, moves the
    //     TARGET row's dot to 'wants-you'; the other rows' dots do not move
    //     with it; and AT LEAST ONE of those other dots is carrying a real
    //     per-panel agent state (e.g. 'starting') rather than every one
    //     reading a degenerate stand-in — not merely holding still at some
    //     arbitrary placeholder. Check 54
    //     already proves a bell reaches the PANEL; this is the half only the
    //     rail can be wrong about, because every row here is fed from one
    //     `rows` array.
    //
    //     What this does NOT prove: that each row subscribes to agent state
    //     INDIVIDUALLY, the property `RailPanelRowImpl`'s own doc comment
    //     claims. That was the plan going in, and fault injection found it
    //     false — see the report for the fix that produced this comment.
    //     Rerouting `RailPanelRow` to take `state` as a prop and having
    //     `SideRail` derive it from one list-level `useAttentionIds()` read
    //     paints IDENTICAL attributes to the correct per-row subscription in
    //     every case this check can observe: both are reactive, so both
    //     recompute correctly on the relevant change, and a DOM snapshot
    //     cannot tell "one subscription drives N re-renders" apart from "N
    //     subscriptions drive one re-render each" when the painted values
    //     agree. The only thing that COULD tell them apart is a render
    //     counter inside `RailPanelRowImpl` — a side effect during render,
    //     the exact impurity `Canvas.tsx`'s own `commitHistory` comment warns
    //     against, added to production code whose only consumer would be a
    //     check. That trade was declined; the gap is recorded in CLAUDE.md
    //     instead, the same way this file already names what check 32 and
    //     the auto-repeat checks (7b/33b) do not prove.
    //
    //     The non-vacuity clause below (`othersAreReal`) catches exactly one
    //     shape of that undiscriminated fault, not every one: an
    //     attention-set-only derivation, which only knows "is this panel
    //     waiting" and so collapses every non-waiting row to a single
    //     placeholder value. It does NOT catch a list-level subscription that
    //     reads the full per-id state map and passes the real value down —
    //     that hypothetical still paints 'starting' on the other rows and
    //     would pass this check too. Do not read a green 83 as proof of
    //     subscription shape in general.
    //
    //     The attribute, not the class: a class is a styling decision a
    //     restyle may rename, the same split check 54 draws for the panel.
    //
    //     Deviation from the brief's literal source: the brief's draft rings
    //     the bell on `renamedId`, check 82's Cmd+N spawn. Cmd+N's default
    //     here is BOOT_DEFAULT_PRESET, `/bin/cat -v` (checks 44 and 70b's own
    //     comment both document this) — cat only ECHOES the literal bytes
    //     `printf '\007'\n` it is handed, so no actual 0x07 ever reaches its
    //     output and the check could never pass, on correct rail code or
    //     broken. Confirmed empirically: run against the brief's literal
    //     source first and it failed with `after=false` even though
    //     `RailPanelRow` subscribes correctly. So this spawns a REAL shell
    //     through PRESET_SPAWN instead — the exact substitution checks 54-63
    //     and 70b already make for the identical reason — and rings the bell
    //     there, while still reading every row's dot (cat panels, `renamedId`
    //     included) to prove the others never moved.
    {
      const BELL_LINE = "printf '\\007'\n"
      // Scoped to .rail-list--panels for the same reason check 81 is: the
      // Workspaces section's row shares the bare .rail-row class and has no
      // .rail-row__dot, so an unscoped query throws on that row's null lookup.
      const dots = () => wc.executeJavaScript(`
        Object.fromEntries([...document.querySelectorAll('.rail-list--panels .rail-row')].map((r) => [
          r.getAttribute('data-rail-row'),
          r.querySelector('.rail-row__dot').getAttribute('data-agent-state')
        ]))`)
      const idsBefore83 = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const idsAfter83 = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore83.size ? now : false
      }, 4000)
      const target = idsAfter83 ? idsAfter83.find((id) => !idsBefore83.has(id)) : null
      if (!target) throw new Error('83: PRESET_SPAWN produced no new panel')
      const hasPty = await waitUntil(async () => (await sessionMap(wc)).has(target), 8000)
      if (!hasPty) throw new Error(`83: panel ${target} never got a PTY`)
      const before = await dots()
      ptyManager.write(target, BELL_LINE)
      const rang = await waitUntil(async () => {
        const now = await dots()
        return now[target] === 'wants-you' ? now : false
      }, 6000)
      const others = rang
        ? Object.keys(rang).filter((id) => id !== target)
            .every((id) => rang[id] === before[id])
        : false
      // Non-vacuity: at least one non-target row must carry a REAL agent
      // state (i.e. something other than 'none') rather than a degenerate
      // placeholder every row could share regardless of what is actually
      // happening. This is the same shape verify:pty-manager check 18 already
      // uses — its first clause must keep naming 'busy' because "no
      // wants-you" is satisfied just as well by bytes that never arrived.
      const othersAreReal = rang
        ? Object.keys(rang).filter((id) => id !== target).some((id) => rang[id] !== 'none')
        : false
      ok('83 a real bell changes that panel\'s row dot, no other, and the others stay real',
        rang !== false && others === true && othersAreReal === true,
        `target=${target} before=${JSON.stringify(before)} after=${JSON.stringify(rang)} ` +
          `others=${others} othersAreReal=${othersAreReal}`)
      // What 83 LEAVES BEHIND: an extra sh panel in wants-you, in main's
      // store and on its row, alongside renamedId (still 'starting', untouched
      // by this check). Nothing below acknowledges either; check 86 closes
      // renamedId through the rail's own close control, which is unaffected
      // by this check's own leftover panel.
    }

    // 84-85. THE DORMANCY PAIR, on a fixture seeded for it.
    //     Check 39's NEVER_WOKEN_ID does not survive M7's workspace churn —
    //     check 71 deletes the last workspace and installs a fresh one — so a
    //     dormant panel has to be seeded again here. The mechanism is the one
    //     check 39's own seeding uses, and its comment explains each step:
    //     append to the on-disk layout, re-load the store (layout:load answers
    //     from the in-memory snapshot, not a fresh disk read), and reload the
    //     renderer. A panel with no live session restores dormant under EITHER
    //     backend, so this needs nothing tmux set up.
    //
    //     Parked at world (60000, 60000): far outside anything any check above
    //     frames or clicks, and distinct from check 39's (50000, 50000) so a
    //     stale fixture cannot be mistaken for this one.
    const RAIL_DORMANT_ID = 'rail-dormant'
    {
      flushLayoutStore()
      const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
      const ws = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
      const maxZ = ws.panels.reduce((m, p) => Math.max(m, p.z), 0)
      ws.panels.push({
        id: RAIL_DORMANT_ID,
        x: 60000, y: 60000, w: 720, h: 460, z: maxZ + 1,
        cwd: '~', args: ['-l']
      })
      writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
      layoutStore.load()
      const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload()
      await reloaded
      await waitUntil(async () => {
        const sessions = await wc.executeJavaScript(
          `window.__m4aSessions ? window.__m4aSessions() : []`)
        return sessions.some((s) => s.id === RAIL_DORMANT_ID) || false
      }, 4000)
    }

    // 84. CLICKING A ROW FRAMES ITS PANEL AND DOES NOT START IT.
    //     Rule 1 of the spec, and the one failure a screenshot cannot show: on
    //     a restored twelve-panel canvas, a row that wakes on click is twelve
    //     agent CLIs launched by browsing a list. Both clauses are required,
    //     and for two different reasons — neither is a restatement of the
    //     other.
    //
    //     The CAMERA clause rejects a row wired to nothing at all (no
    //     onClick, or a dead handler): the no-spawn clause alone passes
    //     against that implementation, because a panel nobody touched is
    //     indeed still dormant.
    //
    //     The DORMANCY clause is the one that matters, because it is the only
    //     clause that would catch a row wired to CENTRE AND WAKE — the
    //     genuinely dangerous shape, since the camera moves exactly as this
    //     check expects and the row looks completely correct on screen while
    //     quietly launching a process.
    //
    //     A row wired to `onSelectPanel` as this codebase actually defines it
    //     (Canvas.tsx: selectAndRaise + clear dormant id + registry.wake, and
    //     no centreOn anywhere in it) fails BOTH clauses at once — it never
    //     frames, so the camera clause fails on its own, independent of the
    //     wake. Don't read that combination as proof either clause is
    //     load-bearing alone; it is a coincidence of what onSelectPanel
    //     happens to do today, not a property either half of this check
    //     relies on. The centre-and-wake shape above is the one the dormancy
    //     clause exists for.
    {
      const rowState = () => wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}]')
        return row ? {
          tail: row.querySelector('.rail-row__tail').textContent,
          hasStart: row.querySelector('.rail-row__start') !== null
        } : null
      })()`)
      const seeded = await waitUntil(async () => {
        const s = await rowState()
        return s && s.tail === 'asleep' ? s : false
      }, 4000)
      const before = await wc.executeJavaScript(`window.__m4aViewport()`)
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}] .rail-row__main')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await sleep(400)
      const after = await wc.executeJavaScript(`window.__m4aViewport()`)
      const sessions = await wc.executeJavaScript(`window.__m4aSessions()`)
      const still = sessions.find((s) => s.id === RAIL_DORMANT_ID)
      ok('84 a rail row frames its panel and leaves a dormant one dormant',
        seeded !== false && seeded.hasStart === true &&
          (after.x !== before.x || after.y !== before.y) &&
          still !== undefined && still.dormant === true && still.spawned === false,
        `seeded=${JSON.stringify(seeded)} camera ${JSON.stringify(before)} -> ` +
          `${JSON.stringify(after)} session=${JSON.stringify(still)}`)
    }

    // 85. THE START CONTROL IS THE ONLY THING THAT WAKES.
    //     The other half of 84, and it has to be asserted or "never wakes"
    //     would be satisfied just as well by a rail that CANNOT wake — a
    //     dormant panel reachable from the rail but unstartable from it, with
    //     the arrow rendered and inert.
    {
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}] .rail-row__start')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      const woke = await waitUntil(async () => {
        const sessions = await wc.executeJavaScript(`window.__m4aSessions()`)
        const s = sessions.find((x) => x.id === RAIL_DORMANT_ID)
        return s && s.dormant === false ? s : false
      }, 6000)
      const tail = await wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}]')
        return row ? row.querySelector('.rail-row__tail').textContent : null
      })()`)
      ok('85 the start control wakes the panel the row click would not',
        woke !== false && tail !== 'asleep',
        `session=${JSON.stringify(woke)} tail=${tail}`)
    }

    // 86. THE ROW'S CLOSE CONTROL CLOSES THE PANEL.
    //     Asserted through THREE reads, because each alone passes against a
    //     different wrong implementation: the row going is satisfied by a rail
    //     that filtered its own list locally, the .panel going is satisfied by
    //     a close that left the session running, and the session going is what
    //     proves the control reached onClosePanel — the one call site that
    //     disposes. Together they pin that the rail added no fourth way to
    //     remove a panel.
    //
    //     Note on this fixture: the reload in the 84/85 seeding block restores
    //     renamedId from disk along with everything else, so it is still
    //     present here — but under the DIRECT backend it comes back dormant,
    //     with no session. If the three-clause read is ever seen failing only
    //     on `session`, check which backend the run took before assuming a
    //     regression: `!state.session` is trivially true for a panel that
    //     never respawned, and the clause that carries the weight there is the
    //     row and the `.panel` both going.
    {
      const target = state.renamedId
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row=${JSON.stringify(target)}] .rail-row__close')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      const gone = await waitUntil(async () => {
        const state = await wc.executeJavaScript(`(() => ({
          row: document.querySelector('.rail-row[data-rail-row=${JSON.stringify(target)}]') !== null,
          panel: document.querySelector('.panel[data-panel-id=${JSON.stringify(target)}]') !== null,
          session: window.__m4aSessions().some((s) => s.id === ${JSON.stringify(target)})
        }))()`)
        return (!state.row && !state.panel && !state.session) ? state : false
      }, 6000)
      ok('86 the row\'s close control closes the panel, its DOM and its session',
        gone !== false, `target=${target} state=${JSON.stringify(gone)}`)
    }

    // 87. THE READ HALF, AND THE CRITERION IT CLOSES.
    //     The inspector must show what MAIN RESOLVED, not what the spec asked
    //     for. For a login-shell panel spec.command is ABSENT — only main can
    //     name the user's shell — so a pane that read the spec would render the
    //     stand-in 'login shell' for every default panel and look entirely
    //     plausible doing it. Asserting `command` is an absolute path is what
    //     separates the two; asserting merely that it is non-empty does not.
    //
    //     The SECOND clause is the pane's stated reason to exist: the spec link
    //     is shown SEPARATELY, so "why does this say login shell" is answerable.
    //     A merged single-command implementation passes the first clause alone.
    {
      const sessions = await settledSessionMap(wc)
      // M135. In the un-split file the first pty:list key was a panel core's
      // wake-everything step had made live; this part boots its own renderer,
      // so pick a session whose panel is LIVE in the DOM (an xterm inside it)
      // rather than the map's first key, which may be a hidden workspace's.
      const liveInDom = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel[data-panel-id] .xterm')].map((x) => x.closest('.panel').getAttribute('data-panel-id'))`)
      const targetId = [...sessions.keys()].find((id) => liveInDom.includes(id)) ?? [...sessions.keys()][0]
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      const read = await wc.executeJavaScript(`(() => {
        const f = (k) => document.querySelector('[data-inspector-field="' + k + '"] .inspector__value')
        const g = (k) => { const el = f(k); return el ? el.textContent : null }
        // M68: the pid is the pinned header's, not a field's — the field is filtered out.
        return { command: g('command'), spec: g('spec-command'), cwd: g('cwd'), pid: (document.querySelector('.inspector__pid')?.textContent ?? '').replace('pid', '').trim() || null, pidField: g('pid') }
      })()`)
      ok('87 the inspector shows the RESOLVED command and the spec link separately, and the pid once (in the header)',
        read.command !== null && read.command.startsWith('/') &&
          read.spec !== null && read.spec !== read.command &&
          read.pid === String(sessions.get(targetId)) && read.pidField === null,
        JSON.stringify(read) + ` expected pid ${sessions.get(targetId)}`)
    }

    // 88. The empty state. Nothing selected is not "nothing to show": it is the
    //     canvas's own summary, and it is the state the app launches in and
    //     returns to on every background click.
    //
    //     The running count is read back out of pty:list rather than restated,
    //     because a hardcoded number here would go stale the first time a fixture
    //     panel is added — the same staleness CLAUDE.md records for verify:panels
    //     48's ORDER array.
    {
      const clicked = await clickEmptyCanvas(wc)
      await settle()
      const summary = await wc.executeJavaScript(`(() => {
        const root = document.querySelector('[data-inspector-summary]')
        if (!root) return null
        const g = (k) => { const el = root.querySelector('[data-summary="' + k + '"]'); return el ? el.textContent : null }
        return { panels: g('panels'), running: g('running'), waiting: g('waiting'),
                 fields: document.querySelectorAll('[data-inspector-field]').length }
      })()`)
      const panelCount = await wc.executeJavaScript(`window.__m4aSessions().length`)
      // CONTROLLER RULING (pre-flight CONFLICT-2): derived, never hardcoded to '0'.
      // Checks 54/57/63 ring and acknowledge real bells earlier in this same run,
      // so whether the attention set is empty here depends on their cleanup, which
      // nothing guarantees. A hardcoded 0 fails as "0 !== 1" and points nowhere.
      const waitingNow = await wc.executeJavaScript(
        `String(document.querySelectorAll('.panel[data-agent-state="wants-you"]').length)`)
      ok('88 with nothing selected the inspector summarises the canvas instead',
        clicked !== null && summary !== null &&
          summary.panels === String(panelCount) &&
          summary.waiting === waitingNow &&
          summary.fields === 0,
        `clicked=${JSON.stringify(clicked)} summary=${JSON.stringify(summary)} panels=${panelCount} waiting=${waitingNow}`)
    }

    // 89. ONE TITLE SOURCE, THREE VIEWS.
    //     The inspector's rename must reach the palette's InputMode — the shell
    //     owns no modality — and the name it commits must appear in the panel's
    //     own header, its rail row AND the inspector's heading. Asserting only
    //     the inspector would pass against a pane holding a private copy of the
    //     title, which is the drift the honest chain exists to prevent, and it
    //     would show up as two names for one panel sitting side by side on
    //     screen.
    {
      const sessions = await settledSessionMap(wc)
      // M135. In the un-split file the first pty:list key was a panel core's
      // wake-everything step had made live; this part boots its own renderer,
      // so pick a session whose panel is LIVE in the DOM (an xterm inside it)
      // rather than the map's first key, which may be a hidden workspace's.
      const liveInDom = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel[data-panel-id] .xterm')].map((x) => x.closest('.panel').getAttribute('data-panel-id'))`)
      const targetId = [...sessions.keys()].find((id) => liveInDom.includes(id)) ?? [...sessions.keys()][0]
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      await wc.executeJavaScript(`
        document.querySelector('[data-inspector-action="rename"]')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      const opened = await wc.executeJavaScript(
        `document.querySelectorAll('.palette').length === 1 &&
         document.activeElement === document.querySelector('.palette__input')`)
      await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'inspector rename')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      await pressPlain(wc, 'Enter')
      await settle()
      const names = await wc.executeJavaScript(`(() => {
        const id = ${JSON.stringify(targetId)}
        const header = document.querySelector('.panel[data-panel-id="' + id + '"] .panel__title')
        const rail = document.querySelector('.rail-row[data-rail-row="' + id + '"] .rail-row__label')
        const heading = document.querySelector('[data-inspector-heading]')
        return {
          header: header ? header.textContent : null,
          rail: rail ? rail.textContent : null,
          heading: heading ? heading.textContent : null
        }
      })()`)
      ok('89 an inspector rename opens the palette and reaches all three views',
        opened === true && names.header === 'inspector rename' &&
          names.rail === 'inspector rename' && names.heading === 'inspector rename',
        `opened=${opened} ${JSON.stringify(names)}`)
    }

    // 90. SAVES THE SELECTED PANEL, NOT THE FOCUSED ONE.
    //     Driven with the two ids DELIBERATELY DIFFERENT, which is the entire
    //     check: taken with them equal it passes against the defect this channel
    //     exists to remove — main's own preset:capture path, which answers off
    //     focusedIdRef and would have saved the wrong panel every time the user
    //     reached the inspector by clicking a rail row (the one gesture that
    //     selects without focusing).
    //
    //     Every panel still alive at this point in the run shares one cwd
    //     ('/tmp' — check 73's Cmd+N spawn, off the boot default template, is
    //     the sole survivor of check 71's full workspace wipe). A same-cwd pair
    //     cannot discriminate the SELECTED preset's subtitle from the FOCUSED
    //     one's, so this check spawns a second panel at a DISTINCT, spaced cwd
    //     — a feature and not an accident, per CLAUDE.md's tmux exitDir note —
    //     rather than adding a third panel to the SEED_PANELS fixture every
    //     earlier count-based check would then have to account for.
    //
    //     Both ids are read out of PRODUCTION MARKUP rather than through a test
    //     hook, because neither hook answers this: __m4aSelection() returns the
    //     focused terminal's TEXT selection (not an id, despite the name) and
    //     __m4aSessions() reports {id, dormant, spawned} and no cwd. Widening
    //     either one for this check would be adding a hook to observe something
    //     the DOM already states — .panel--selected IS the selection, and DOM
    //     focus living inside a panel IS that panel being focused.
    //
    //     The preset's subtitle carries its full cwd (presetRows builds it as
    //     `command — cwd`), and the cwd is read off the inspector's own field
    //     BEFORE saving. That field is already pinned by check 87, so it is a
    //     legitimate source here rather than a second derivation.
    //
    //     M12: the subtitle this check now asserts against is a SYNTHETIC
    //     live cwd, sent directly at this point in the run rather than a
    //     real one — `backend` is still the DIRECT one the M6c fixture block
    //     installed here, so no real SESSION_LIVE would ever arrive and the
    //     saved cwd would equal the spawn cwd by pure fallback, which proves
    //     nothing about which one savePanelAsPreset actually reaches for.
    //     Forcing a live answer to exist turns "the saved cwd happens to
    //     equal the spawn cwd" into an assertion that FAILS if the consumer
    //     is ever reverted to `panel.spec.cwd` alone.
    {
      const SAVE_PRESET_DIR = mkdtempSync(join(tmpdir(), 'tc panels save-preset '))
      const idsBefore90 = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: SAVE_PRESET_DIR, command: '/bin/cat', args: [] })
      const idsAfter90 = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore90.size ? now : false
      }, 4000)
      const newId = idsAfter90 ? idsAfter90.find((id) => !idsBefore90.has(id)) : null
      if (!newId) throw new Error('90: PRESET_SPAWN produced no new panel')
      const hasPty90 = await waitUntil(async () => (await sessionMap(wc)).has(newId), 8000)
      if (!hasPty90) throw new Error(`90: panel ${newId} never got a PTY`)

      const ids = await waitUntil(async () => {
        const live = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].filter((p) => p.querySelector('.xterm')).map((p) => p.dataset.panelId)`)
        return live.includes(newId) ? live : false
      }, 8000)
      if (!ids || ids.length < 2) throw new Error(`90: fewer than two live panels — ${JSON.stringify(ids)}`)
      const focusId = ids.find((id) => id !== newId)
      const selectId = newId

      const before = await wc.executeJavaScript(`window.canvas.preset.list()`)
      // Focus one panel by clicking into its terminal, the way a user does.
      // Dispatched on .xterm-screen, never on .panel__slot: xterm binds its
      // listeners on .xterm, one level BELOW the slot, and capture-toward-target
      // traversal never visits a target's own descendants — the mistake CLAUDE.md
      // records as costing two fix rounds during M4a.
      await wc.executeJavaScript(`
        document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(focusId)} + '"] .xterm-screen')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
      await settle()
      // Select the DIFFERENT, distinct-cwd one from the rail — selects and
      // raises, never focuses.
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(selectId)} + '"] .rail-row__main')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      // M12: a SYNTHETIC live update, sent the identical way this check
      // already sends PRESET_SPAWN by hand — not a real tmux session. At
      // this point in the run `backend` is still the DIRECT one the M6c
      // fixture block installed (never reset to tmux until check 91), so
      // pollLive's own list() answers null and no real SESSION_LIVE would
      // ever arrive for this panel; without this send, LIVE_PRESET_DIR and
      // observed.cwd below would be indistinguishable — savePanelAsPreset's
      // `getLiveSession(...) ?? spec.cwd` and a reverted `spec.cwd` alone
      // would save the identical string, and the assertion at the bottom
      // would pass against either. Sending it directly is what turns "the
      // saved cwd happens to equal the spawn cwd" into an actual claim
      // about which one savePanelAsPreset reaches for.
      const LIVE_PRESET_DIR = mkdtempSync(join(tmpdir(), 'tc panels save-preset live '))
      win.webContents.send(IPC_EVENTS.SESSION_LIVE,
        { panelId: selectId, cwd: LIVE_PRESET_DIR, currentCommand: 'bash' })
      await waitUntil(async () => {
        const v = await wc.executeJavaScript(
          `(() => { const el = document.querySelector('[data-inspector-field="live-cwd"] .inspector__value'); return el ? el.textContent : null })()`)
        return v === LIVE_PRESET_DIR
      }, 5000)
      const observed = await wc.executeJavaScript(`(() => {
        const focusedEl = document.activeElement
        const focusedPanel = focusedEl && focusedEl.closest ? focusedEl.closest('.panel') : null
        const selectedPanel = document.querySelector('.panel--selected')
        const cwdEl = document.querySelector('[data-inspector-field="cwd"] .inspector__value')
        return {
          focused: focusedPanel ? focusedPanel.dataset.panelId : null,
          selected: selectedPanel ? selectedPanel.dataset.panelId : null,
          cwd: cwdEl ? cwdEl.textContent : null
        }
      })()`)
      await wc.executeJavaScript(`
        document.querySelector('[data-inspector-action="save-preset"]')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      const after = await wc.executeJavaScript(`window.canvas.preset.list()`)
      const added = after.filter((p) => !before.some((b) => b.id === p.id))
      // The cwd clause reads LIVE_PRESET_DIR now, not observed.cwd (the
      // SPAWN field) — M12's savePanelAsPreset saves where the SELECTED
      // panel IS, falling back to where it was spawned only absent a live
      // answer, and this check now forces a live answer to exist so the
      // fallback is not what is being measured. LIVE_PRESET_DIR !==
      // observed.cwd is asserted explicitly so a future reader can see the
      // two are deliberately different values, not a typo.
      ok('90 the inspector saves the SELECTED panel, with focus deliberately elsewhere',
        observed.focused === focusId && observed.selected === selectId &&
          observed.focused !== observed.selected &&
          added.length === 1 && observed.cwd !== null &&
          LIVE_PRESET_DIR !== observed.cwd &&
          added[0].subtitle.endsWith(LIVE_PRESET_DIR),
        `${JSON.stringify(observed)} live=${LIVE_PRESET_DIR} added=${JSON.stringify(added)}`)
    }

    // ---------------------------------------------------------------------
    // M8c's restart block (91-94). Check 91 RELOADS the renderer, so
    // everything below it reasons about the RESTORED canvas rather than the
    // one checks 87-90 built — the same "runs last on purpose" caution check
    // 26 carries further up this file. 92 and 93 therefore spawn or find
    // their own targets rather than inheriting an id from above.
    // ---------------------------------------------------------------------

    // 91. THE REATTACHED BADGE — M6a's outstanding success criterion, met.
    //     CLAUDE.md records PanelStatus.running.reattached as a live field
    //     with ZERO readers, and the spec's "a reattached panel visibly says
    //     so" criterion as deliberately unmet. Task 2 shipped the reader; this
    //     is the check that observes it end to end, through a real reload of a
    //     real tmux-backed session.
    //
    //     It runs its OWN reload rather than borrowing check 26's, for the
    //     reason check 39's comment gives about the same temptation: coupling
    //     to another check's setup makes this one fail for reasons that have
    //     nothing to do with the badge. It also has to put the manager BACK on
    //     the tmux backend — the M6c fixture block (checks 54-57) deliberately
    //     swapped it to the direct one, and DirectBackend.hasSession() answers
    //     false unconditionally by design, so reattachment is not merely
    //     unlikely there but unreachable.
    //
    //     Skipped LOUDLY without tmux, never silently: the direct backend has
    //     no reattachment to display at all, so a green here on a tmux-free
    //     machine would be a lie about coverage.
    //
    //     The badge and the pid are both needed, and neither implies the
    //     other. The badge alone is satisfied by a pane that hardcodes it; the
    //     SAME PANE PID either side of the reload is what says the session
    //     genuinely outlived its client rather than being silently respawned —
    //     the identical discriminator check 64 relies on for a workspace
    //     switch. The badge is read together with WHICH panel is selected,
    //     because the inspector renders one panel at a time and a count of 1
    //     taken alone could belong to a stale selection.
    {
      const TMUX_91 = findTmux()
      if (!TMUX_91 || !state.tmuxBackend) {
        ok('91 the reattached badge (SKIPPED — no tmux binary found)', true,
          'install tmux to cover this')
      } else {
        // Back onto the real tmux backend. Every session spawned since the
        // M6c fixture block is a plain node-pty process and stays one; those
        // die with the reload below and their panels simply restore dormant,
        // which is exactly what check 93 then needs.
        state.backend = state.tmuxBackend
        const idsBefore91 = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        // A REAL shell through PRESET_SPAWN, the same substitution checks
        // 54-63 and 83 make: Cmd+N's default here is `/bin/cat -v`, which is
        // not a session worth reattaching to and rings no bell for 92 either.
        win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
        const idsAfter91 = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.length > idsBefore91.size ? now : false
        }, 4000)
        const targetId = idsAfter91 ? idsAfter91.find((id) => !idsBefore91.has(id)) : null
        if (!targetId) throw new Error('91: PRESET_SPAWN produced no new panel')
        // tmux's OWN answer, not pty:create resolving: the assertion below is
        // about what survives on the socket, so that is what has to be waited
        // on here too.
        const before = await waitUntil(async () => {
          const m = await sessionMap(wc)
          return m.has(targetId) ? m : false
        }, 10000)
        if (!before) throw new Error(`91: panel ${targetId} never reached pty:list`)

        // The panel has to be ON DISK before the reload, or the restored
        // canvas has no panel to reattach and this fails as "no badge" with
        // nothing pointing at the 500ms save debounce.
        flushLayoutStore()
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        // Restored, promoted, and spawned again — the reattach itself. The
        // xterm is the signal that attachSlot ran, which is what calls
        // pty:create and therefore what asks main the has-session question.
        // The rail row FIRST, and it is not merely a way to open the inspector
        // on this panel — it is what brings the panel back into the cull
        // region. A restored panel is only promoted (and therefore only
        // reattached) once it is somewhere the camera can see, and this one
        // lands off screen: PRESET_SPAWN cascades away from the panel check 90
        // left centred, far enough that the restored camera does not cover it.
        // Waiting for the reattach BEFORE framing it waits forever, and reads
        // as a broken reattach rather than as a carded panel — which is what
        // an earlier draft of this check did.
        //
        // Clicking it is also the honest user story: reload the app, click the
        // panel in the rail, and the inspector says the session survived.
        // goToPanel centres and selects without WAKING, so a genuinely dormant
        // panel would stay dormant here — this one is reattachable, not
        // dormant, which is exactly the distinction CLAUDE.md's "Dormancy is
        // about spawning, not attaching" draws.
        const rowClicked = await waitUntil(async () => await wc.executeJavaScript(`(() => {
          const row = document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
          if (!row) return false
          row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`), 15000)
        // The REATTACH ITSELF: the panel promoted and spawning again, which is
        // the only thing that asks main the has-session question the badge
        // reports. Guarded on the hook EXISTING — it is installed by a Canvas
        // effect, so for the first moments after did-finish-load a bare call
        // throws, which in this suite aborts the whole run rather than failing
        // one check.
        const spawnedAgain = await waitUntil(async () => await wc.executeJavaScript(
          `((window.__m4aSessions ? window.__m4aSessions() : []).find(
             (s) => s.id === ${JSON.stringify(targetId)}) || {}).spawned === true`),
          20000)
        await settle()
        // The SELECTED panel is read alongside the badge, never the badge
        // alone. The inspector renders whichever panel is selected, so a
        // count of 1 taken by itself would be satisfied by a stale selection
        // left over from check 90 — the badge would be real and would be
        // about a different panel entirely.
        const shown = await wc.executeJavaScript(`(() => {
          const sel = document.querySelector('.panel--selected')
          return {
            selected: sel ? sel.dataset.panelId : null,
            badge: document.querySelectorAll('[data-inspector-badge="reattached"]').length
          }
        })()`)
        const after = await sessionMap(wc)
        ok('91 a panel whose session survived a reload says so in the inspector',
          rowClicked === true && spawnedAgain === true &&
            shown.selected === targetId && shown.badge === 1 &&
            after.get(targetId) !== undefined && after.get(targetId) === before.get(targetId),
          `target=${targetId} row=${rowClicked} spawned=${spawnedAgain} ` +
            `shown=${JSON.stringify(shown)} pid ${before.get(targetId)} -> ${after.get(targetId)}`)
      }
    }

    // 92. RESTART: A DIFFERENT PROCESS, AND NO INHERITED QUESTION.
    //     Both halves in one read, because each alone passes against a real
    //     bug. The pid alone is satisfied by a restart that leaves the old
    //     amber border in place — a fresh agent wearing a dead one's question,
    //     which is exactly what clearAgentState is there to prevent, since
    //     agent state survives a panel's closure BY DESIGN. The cleared state
    //     alone is satisfied by a "restart" that only calls clearAgentState
    //     and never touches the process at all.
    //
    //     The third clause is the respawn: an .xterm back under the panel.
    //     Restart mints a NEW handle at the same id, so React tears the old
    //     host out and mounts the new one — and nothing in the verb itself
    //     re-renders except bumpVersion(). Without that bump the panel shows
    //     literally nothing, with no error anywhere; the pid clause cannot
    //     see it, because the pid changes whether or not anyone rendered.
    //
    //     Spawns its OWN /bin/sh through PRESET_SPAWN rather than reusing a
    //     panel the run already has, for the reason check 83's comment
    //     records at length: the boot default here is `/bin/cat -v`, which
    //     echoes the literal bytes `printf '\007'\n` and never emits a 0x07,
    //     so the bell could never ring and the check could never pass —
    //     against correct code or broken. The bell mechanism itself is check
    //     54's, unchanged; inventing a second one would let a bell that never
    //     reaches main make this check green for a reason that has nothing to
    //     do with restart.
    //
    //     Runs on whichever backend check 91 left installed — the TMUX one on
    //     any machine that has tmux, which is the configuration that matters
    //     most here: `new-session -A` attaches rather than creates, so a
    //     restart that respawned before the kill landed would come back with
    //     the same pane pid and this check's own pid clause is what would say
    //     so. On a tmux-free machine 91 skips, the direct backend stays, and
    //     this still covers the dispose-then-ensure sequence — just not the
    //     ordering hazard that only tmux has.
    {
      const BELL_LINE_92 = "printf '\\007'\n"
      const idsBefore92 = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const idsAfter92 = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore92.size ? now : false
      }, 4000)
      const targetId = idsAfter92 ? idsAfter92.find((id) => !idsBefore92.has(id)) : null
      if (!targetId) throw new Error('92: PRESET_SPAWN produced no new panel')
      // LIVE, and asserted rather than assumed: LIVE_BUDGET caps live panels
      // at eight while this canvas is larger, so "the newest session" is not
      // by itself "a panel with an .xterm under it" — and a restart driven
      // against a carded panel would prove nothing about the respawn.
      const live92 = await waitUntil(async () => await wc.executeJavaScript(
        `document.querySelectorAll('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"] .xterm').length === 1`),
        10000)
      const hasPty92 = await waitUntil(async () => (await sessionMap(wc)).has(targetId), 10000)
      // The rail row selects and raises WITHOUT focusing or acknowledging
      // (rule 1), so the inspector points at this panel while the wants-you
      // rung below survives — a click into the terminal would acknowledge it.
      await wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
        if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return row !== null
      })()`)
      await settle()
      ptyManager.write(targetId, BELL_LINE_92)
      const waiting = await waitUntil(async () => await wc.executeJavaScript(
        `(() => {
          const p = document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"]')
          return p !== null && p.getAttribute('data-agent-state') === 'wants-you'
        })()`), 8000)
      const pidBefore = (await sessionMap(wc)).get(targetId)
      // Guarded rather than a bare dispatch: an ABSENT control must fail this
      // check, not throw. A throw in this single-script suite aborts the run,
      // and checks 93 and 94 below would never execute at all.
      const clicked = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-inspector-action="restart"]')
        if (!el) return false
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)
      // READ IMMEDIATELY, with nothing awaited in between — this is the clause
      // that makes clearAgentState observable at all, and it was added after a
      // fault injection showed the settled read below is NOT discriminating:
      // delete clearAgentState(id) and the settled state is still 'busy',
      // because main's `create` sends `starting` directly at spawn and
      // re-seeds the entry a moment later. The end states are identical; only
      // the WINDOW differs, and the window is the whole point — a panel
      // restarted out of wants-you must not keep its amber border while the
      // new process is coming up.
      //
      // The margin is wide rather than tight. clearAgentState notifies the
      // store inside the click handler, so React has flushed before this next
      // IPC round trip arrives. Without it the state can only change once the
      // kill has resolved, ensure has run, a render has mounted a slot,
      // attachSlot has issued pty:create and main has answered with
      // `starting` — four more round trips, one of them a tmux spawn.
      const immediate = await wc.executeJavaScript(`(() => {
        const p = document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"]')
        return p === null ? 'MISSING' : p.getAttribute('data-agent-state')
      })()`)
      const respawned = await waitUntil(async () => {
        const pid = (await sessionMap(wc)).get(targetId)
        return pid !== undefined && pid !== pidBefore ? pid : false
      }, 15000)
      await settle()
      const state = await wc.executeJavaScript(`(() => {
        const p = document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"]')
        return p === null ? 'MISSING' : p.getAttribute('data-agent-state')
      })()`)
      const relive = await wc.executeJavaScript(
        `document.querySelectorAll('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"] .xterm').length`)
      ok('92 restart replaces the process and does not inherit the old wants-you',
        live92 === true && hasPty92 === true && waiting === true && clicked === true &&
          respawned !== false && respawned !== pidBefore &&
          immediate !== 'wants-you' && state !== 'wants-you' && relive === 1,
        `target=${targetId} live=${live92} waiting=${waiting} clicked=${clicked} ` +
          `pid ${pidBefore} -> ${respawned} immediate=${immediate} state=${state} xterm=${relive}`)
    }

    // 93. DISABLED, NOT ABSENT, ON A PANEL THAT NEVER STARTED. A restart
    //     control that vanished would read as a feature that is missing — the
    //     rule verify:palette 31 states — and one that RAN would end a process
    //     that does not exist and then re-ensure a session the user never
    //     asked to start, waking a panel from a verb whose name says the
    //     opposite.
    //
    //     The target is FOUND at run time, never named. The obvious fixture is
    //     the dormant panel check 84 seeds — but check 85 immediately clicks
    //     its start control and asserts it wakes, so by the time this runs it
    //     is spawned and `restartable` is legitimately true; the check would
    //     fail against a fixture that no longer describes it and read as a
    //     broken disabled-gate. Asserting the panel was FOUND is half the
    //     check: without it, a null id flows into the selector and the failure
    //     says nothing at all.
    {
      // M135. The un-split file found a dormant fixture left by core's checks;
      // this part has none by now (84 seeds one and 85 wakes it), so seed one
      // the same way 84 does — on disk, re-loaded, reloaded — when none is left.
      const anyDormant = await wc.executeJavaScript(
        `(window.__m4aSessions().find((s) => s.dormant === true) || {}).id || null`)
      if (anyDormant === null) {
        flushLayoutStore()
        const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const ws = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
        const maxZ = ws.panels.reduce((m, p) => Math.max(m, p.z), 0)
        ws.panels.push({ id: 'never-started-93', x: 61000, y: 61000, w: 720, h: 460, z: maxZ + 1, cwd: '~', args: ['-l'] })
        writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
        layoutStore.load()
        const reloaded93 = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded93
        await settle()
      }
      // `dormant === true` first: a `spawned === false` panel can also be a
      // fresh mint waiting on its lazy spawn, whose restart is legitimately
      // enabled, and this part mints several before this check runs.
      const dormantId = await wc.executeJavaScript(
        `((window.__m4aSessions().find((s) => s.dormant === true) || window.__m4aSessions().find((s) => s.spawned === false)) || {}).id || null`)
      const selected = await wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(dormantId)} + '"] .rail-row__main')
        if (!row) return false
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)
      await settle()
      const control = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-inspector-action="restart"]')
        return el ? { present: true, disabled: el.disabled } : { present: false }
      })()`)
      ok('93 restart is present and disabled for a panel that never started',
        dormantId !== null && selected === true &&
          control.present === true && control.disabled === true,
        `dormantId=${dormantId} selected=${selected} control=${JSON.stringify(control)}`)
    }

    // 94. THE TWO COUNTS THIS MILESTONE MOVES, RE-DERIVED RATHER THAN TRUSTED.
    //     CLAUDE.md records that the dispose call-site count went stale once
    //     already — it said two while the reset handler had made it three —
    //     so M8c pins both numbers in a check instead of in prose alone.
    //     Reading the SOURCE is the point, not a shortcut: no runtime
    //     behaviour can observe how many callers a function has, and the
    //     invariant ("pty.kill has exactly two callers, both inside
    //     session-registry.ts") is a fact about the source text.
    //
    //     When a later milestone legitimately adds a dispose call site this
    //     goes red, and the number is then updated DELIBERATELY with the
    //     reason in the commit message. That is the whole mechanism.
    //
    //     The dispose half reads the whole canvas DIRECTORY, not Canvas.tsx
    //     alone. M28 split that file along its hook seams and carried the
    //     workspace-delete call site out into usePaletteActions.ts; scoping
    //     the count to one filename would have turned a pure code move into a
    //     RED, and — worse — a later split could have quietly moved a site
    //     into a file this check never reads, dropping the count to four and
    //     passing for the wrong reason the moment somebody "fixed" the
    //     literal. The invariant was never "Canvas.tsx contains five"; it is
    //     "the canvas layer performs exactly five disposes, and every one of
    //     them routes through registry.dispose rather than pty.kill".
    {
      const registrySrc = readFileSync(
        join(__dirname, '..', 'src', 'renderer', 'session', 'session-registry.ts'), 'utf8')
      const canvasDir = join(__dirname, '..', 'src', 'renderer', 'canvas')
      const canvasSrc = readdirSync(canvasDir)
        .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
        .map((name) => readFileSync(join(canvasDir, name), 'utf8'))
        .join('\n')
      const kills = (registrySrc.match(/bridge\.pty\.kill\(/g) ?? []).length
      const disposes = (canvasSrc.match(/registry\.dispose\(/g) ?? []).length
      ok('94 pty.kill still has exactly two callers, and the canvas layer has five dispose sites',
        kills === 2 && disposes === 5, `kills=${kills} disposes=${disposes}`)
    }

    // memo-stable.1. TWO CALLBACKS WHOSE IDENTITY DEFEATS A MEMO, pinned as
    //     source text because the failure has no runtime symptom: nothing
    //     throws, nothing looks wrong, the app just gets heavy while a panel
    //     is dragged. `onContextPasted` was an inline arrow on every
    //     TerminalPanel — a new function identity on every Canvas render,
    //     and Canvas renders on every mousemove — so every terminal panel's
    //     memo re-rendered at 60Hz regardless of `version`, `title`, `glow`
    //     and M35's `onBeginLink`/`linkTarget` discipline, all of which
    //     exist to protect that memo. LinkLayer's `onRemove` was
    //     `paletteActions.removeLink`, whose identity follows the palette's
    //     captured id, so the layer re-rendered on every palette open
    //     despite its own comment naming that as a case the memo stops.
    //     Asserted on the JSX: the prop values must be bare identifiers.
    {
      const canvasSrc = readFileSync(join(__dirname, '..', 'src', 'renderer', 'canvas', 'Canvas.tsx'), 'utf8')
      const pasted = canvasSrc.match(/onContextPasted=\{([^}]*)\}/)
      const pastedStable = pasted !== null && /^\s*[A-Za-z_$][\w$]*\s*$/.test(pasted[1])
      const layer = canvasSrc.match(/<LinkLayer[\s\S]*?onRemove=\{([^}]*)\}/)
      const layerValue = layer ? layer[1] : ''
      // A bare identifier, or the merged-view gate around one — never an arrow,
      // never a member read of paletteActions (whose identity follows the
      // palette's captured id), never a call.
      const layerStable = layer !== null && /^\s*(?:merged\s*\?\s*undefined\s*:\s*)?[A-Za-z_$][\w$]*\s*$/.test(layerValue)
      ok('memo-stable.1 onContextPasted and LinkLayer onRemove are passed as stable identifiers',
        pastedStable && layerStable,
        `onContextPasted=${JSON.stringify(pasted && pasted[1])} onRemove=${JSON.stringify(layerValue)}`)
    }

    // ---------------------------------------------------------------------
    // M8d — the rail's Workspaces and Attention sections.
    // ---------------------------------------------------------------------

    // Local helpers: panBy and agentStateOf are block-scoped to the M6c/M6d
    // block far above and are not reachable here.

    // M46: the navigator shows ONE pane, and these four checks read the
    // Workspaces list — so show it, the way a user would, and put Panels back
    // after 96 for everything below.
    await dockTo('workspaces'); await settle()

    // 95. SWITCHING FROM THE RAIL IS THE SAME SWITCH, WITH THE SAME PIDS.
    //     Check 64 makes this claim for the palette's switcher and explains
    //     why the pid is the only observable that can make it: every other
    //     read — panel counts, the layout, the file on disk — stays green
    //     against an implementation that quietly disposes and respawns on
    //     switch, because a respawned agent is indistinguishable from a
    //     reattached one in anything that only counts. The rail is a SECOND
    //     door onto the same action, so it inherits the same obligation, and
    //     the spec's "the shell adds no second switching path" is precisely
    //     the claim this check tests.
    //
    //     The workspace ids are captured, never hardcoded: nextWorkspaceId()
    //     mints w<max+1> over whatever already exists and this suite has
    //     created and deleted several by now, so a literal here would be a
    //     guess.
    //
    //     What a wrong guess COSTS differs from check 64's, and the two
    //     comments differ for that reason rather than by accident. 64 switches
    //     programmatically and asserts only on pids, so a wrong id there is
    //     genuinely SILENT: activate() returns null, nothing changes, and the
    //     pid comparison passes vacuously. This switch goes through a real DOM
    //     click, which gives it something to fail on — clickRail matches no
    //     row and returns false, and the clicked === true clause below goes
    //     red. Capture the id either way; here it is what keeps the check
    //     RUNNABLE, there it is what keeps it from lying.
    const homeWorkspaceId = await activeWorkspaceId()
    {
      const before = await settledSessionMap(wc)
      await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('rail-away')`)
      await settle()
      const clicked = await clickRail(
        `.rail-row[data-rail-workspace=${JSON.stringify(homeWorkspaceId)}] .rail-row__main`)
      await settle()
      const landedOn = await activeWorkspaceId()
      const after = await settledSessionMap(wc)
      const { ok: preserved, changed } = pidsPreserved(before, after)
      ok('95 clicking a rail workspace row switches, keeping every pid',
        clicked === true && landedOn === homeWorkspaceId &&
          before.size > 0 && preserved,
        `clicked=${clicked} landed=${landedOn} before=${before.size} changed=[${changed.join(', ')}]`)
    }

    // 95b. The ACTIVE workspace's row is present and DISABLED, never absent.
    //      The rule verify:palette 60 already pins for the palette's own
    //      switch row, and it is the same argument check 31 makes there: a
    //      row that disappears is indistinguishable from a feature that is
    //      missing, and here it would also make the rail's list silently
    //      disagree with its own count of how many workspaces exist.
    {
      const state = await wc.executeJavaScript(`(() => {
        const row = document.querySelector(
          '.rail-row[data-rail-workspace=${JSON.stringify(homeWorkspaceId)}]')
        if (!row) return null
        const main = row.querySelector('.rail-row__main')
        return {
          present: true,
          disabled: main.disabled === true,
          canRename: row.querySelector('.rail-row__rename') !== null,
          canDelete: row.querySelector('.rail-row__close') !== null,
          tail: row.querySelector('.rail-row__tail').textContent
        }
      })()`)
      ok('95b the active workspace row is disabled, not absent, and still admin-able',
        state !== null && state.disabled === true &&
          state.canRename === true && state.canDelete === true &&
          /\d+ panel/.test(state.tail),
        JSON.stringify(state))
    }

    // 95c. THE RENAME CONTROL IS A DOOR, AND IT OPENS FOR THE RIGHT WORKSPACE.
    //      95b proves the ✎ and × ELEMENTS exist; nothing until now proved
    //      either of them does anything. A missing {...shellControl(...)}
    //      spread on one of those buttons leaves every other check in this
    //      milestone green — the element is still rendered, still titled,
    //      still counted by 95b — while the spec's central claim, that the row
    //      is a second door onto an action that already exists rather than a
    //      second implementation of it, goes unproven for that door.
    //
    //      The VALUE clause is what makes this more than "something happened".
    //      Asserting only that the palette opened in text mode passes against
    //      a row that hands over a hardcoded id, or the ACTIVE workspace's id
    //      instead of its own — both of which open a perfectly real rename
    //      prompt aimed at the wrong workspace, and the user's next Enter
    //      renames a canvas they were not looking at. So the target here is
    //      deliberately a NON-active row (rail-away, created by check 95),
    //      read out of workspace.list() rather than named literally: with the
    //      active row as the target, the id-swap this clause exists to catch
    //      would be indistinguishable from correct.
    //
    //      It stops at the door and does not drive the rename home:
    //      beginRenameWorkspace's submit path is the palette's own, already
    //      covered there, and re-proving it here would only add a rename this
    //      suite's later checks would have to know about.
    //
    //      + and × stay unchecked, deliberately: create is reachable only
    //      through the same input mode this check already opens, and delete
    //      would leave a destroyed workspace behind for checks 96-98b, which
    //      spawn panels and ring bells against the fixture as it stands.
    {
      const target = await wc.executeJavaScript(
        `window.canvas.workspace.list().then((rows) => {
           const w = rows.find((r) => !r.active)
           return w ? { id: w.id, name: w.name } : null
         })`)
      const clicked = target !== null && await clickRail(
        `.rail-row[data-rail-workspace=${JSON.stringify(target && target.id)}] .rail-row__rename`)
      // Polled, not slept. Every other palette-opening check in this file waits
      // on the input existing rather than on a flat settle(), and the reason is
      // that a fixed sleep is only ever correct on the machine it was tuned on
      // — a slower one turns this into an intermittent red against a codebase
      // that is fine, which costs someone a debugging session pointed at
      // nothing. The false branch is asserted below, not thrown on, so a door
      // that genuinely never opens still reports as 95c failing.
      await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      // Guarded reads throughout. An uncaught exception here ends the run and
      // every check below it — 96, 97, 98, 98b — is never reached, so their
      // absence would read as a suite that shrank rather than one that broke.
      const mode = await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        return {
          open: document.querySelector('.palette') !== null,
          value: input ? input.value : null,
          // Absent while inputMode is set — the palette is a text prompt here,
          // not a command list.
          list: document.querySelector('.palette__list') !== null
        }
      })()`)
      ok('95c the rail rename control opens the palette in text mode for THAT workspace',
        clicked === true && mode.open === true && mode.list === false &&
          target !== null && mode.value === target.name,
        `target=${JSON.stringify(target)} clicked=${clicked} mode=${JSON.stringify(mode)}`)

      // Leave the app as 96-98b expect to find it: no overlay, no input mode.
      //
      // Wrapped in an IIFE, like the ~twenty other `const input` bodies in this
      // file and unlike the one block that suffixes its names instead
      // (chrome18/opts18). Either fix works; the IIFE is the majority form and
      // needs no name discipline from the next author. A top-level `const` in
      // an executeJavaScript string is a lexical binding that PERSISTS in the
      // frame's global scope, so the second unwrapped block to pick the same
      // name throws a SyntaxError — which aborts the run and takes every check
      // below it with it, the failure mode this file's own header warns about.
      await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return true
      })()`)
      await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
    }

    // 96. A HIDDEN WORKSPACE WITH A WAITING PANEL SAYS SO ON ITS RAIL ROW.
    //     70b's fixture reached from the new surface, and the strongest form
    //     of M6d's premise: an agent you cannot see because its whole CANVAS
    //     is hidden, not merely because it is off screen. It is also the one
    //     check that proves the two sections divide the question the way the
    //     spec says they do — Attention cannot name this panel (it is not on
    //     this canvas, and a row that navigates nowhere is worse than none),
    //     so the workspace row's count is the ONLY place the fact surfaces.
    {
      const BELL_LINE = "printf '\\007'\n"
      const waitroomId = await wc.executeJavaScript(
        `window.__m7aWorkspace().createAndSwitch('rail-waitroom')`)
      await settle()
      // A real shell, not Cmd+N's default `cat -v`: cat only ECHOES what it is
      // handed, so the escaped text never becomes a 0x07 byte and the check
      // could not pass against correct code. Same substitution 54-63, 70b and
      // 83 all make.
      const idsBefore = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const panelId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !idsBefore.includes(id)) || false
      }, 4000)
      if (!panelId) throw new Error('96: PRESET_SPAWN produced no new panel')
      const spawned = await waitUntil(
        async () => (await settledSessionMap(wc)).has(panelId), 8000)
      if (!spawned) throw new Error(`96: panel ${panelId} never got a PTY`)
      ptyManager.write(panelId, BELL_LINE)
      const rang = await waitUntil(
        async () => (await railAgentState(panelId)) === 'wants-you', 6000)
      if (rang !== true) throw new Error('96: the panel never reached wants-you')

      await wc.executeJavaScript(
        `window.__m7aWorkspace().switchTo(${JSON.stringify(homeWorkspaceId)})`)
      await settle()
      const tail = await wc.executeJavaScript(`(() => {
        const row = document.querySelector(
          '.rail-row[data-rail-workspace=${JSON.stringify(waitroomId)}]')
        return row ? row.querySelector('.rail-row__tail').textContent : null
      })()`)
      ok('96 a hidden workspace with a waiting panel says so on its rail row',
        tail !== null && tail.includes('1 waiting'), `tail=${JSON.stringify(tail)}`)
    }
    await dockTo('panels'); await settle()

    // 97. A WAITING PANEL APPEARS IN THE QUEUE, AND CLICKING IT NAVIGATES
    //     WITHOUT ACKNOWLEDGING.
    //     Three facts in one read, and each alone passes against a different
    //     wrong rail. The ROW existing is satisfied by a section that lists
    //     every panel rather than the queue. The CAMERA moving is satisfied by
    //     a row wired to onSelectPanel — which would also wake a dormant panel
    //     and is the exact shape check 84 exists to reject. And the amber
    //     surviving is the one that pins the spec's rule that the shell never
    //     acknowledges: focus is the renderer's single acknowledgement
    //     trigger and main is the sole author of the state, so a row that
    //     cleared it locally would make the renderer a second author of a
    //     fact main owns.
    //
    //     The COLOUR is read, not the state, for check 62's reason: the
    //     failure this guards is purely visual. Main can hold wants-you
    //     perfectly while .panel--selected paints over it in blue, and a check
    //     asking only "is the state still wants-you" passes against exactly
    //     that regression.
    {
      const BELL_LINE = "printf '\\007'\n"
      const idsBefore = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      state.attentionPanelId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !idsBefore.includes(id)) || false
      }, 4000)
      if (!state.attentionPanelId) throw new Error('97: PRESET_SPAWN produced no new panel')
      const spawned = await waitUntil(
        async () => (await settledSessionMap(wc)).has(state.attentionPanelId), 8000)
      if (!spawned) throw new Error(`97: panel ${state.attentionPanelId} never got a PTY`)
      ptyManager.write(state.attentionPanelId, BELL_LINE)
      const rang = await waitUntil(
        async () => (await railAgentState(state.attentionPanelId)) === 'wants-you', 6000)
      if (rang !== true) throw new Error('97: the panel never reached wants-you')

      // Built once rather than quoted inline at each use. Threading a
      // selector through two template layers is how a check ends up matching
      // nothing and reporting a pass; 98 builds its own for the same reason,
      // since this one is block-scoped to check 97.
      const attentionRowSel =
        `.rail-attention[data-rail-attention=${JSON.stringify(state.attentionPanelId)}]`
      // M46: the rows are in the dock's Attention popover, opened by its icon.
      await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="attention"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      await settle()
      const rowAppeared = await waitUntil(() => wc.executeJavaScript(
        `document.querySelector(${JSON.stringify(attentionRowSel)}) !== null`), 4000)

      // Pan the panel away first, so "the click framed it" is a claim the
      // camera can actually falsify. Clicking a row for a panel already
      // centred moves nothing and would pass against a row wired to nothing.
      await railPan(-1800, -1200)
      await settle()
      const before97 = await wc.executeJavaScript(`window.__m4aViewport()`)
      const clicked = await clickRail(`${attentionRowSel} .rail-row__main`)
      await settle()
      const after97 = await wc.executeJavaScript(`window.__m4aViewport()`)
      const colour = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-panel-id=${JSON.stringify(state.attentionPanelId)}]')
        if (!el) return null
        const amber = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()
        const probe = document.createElement('div')
        probe.style.color = amber
        document.body.appendChild(probe)
        const want = getComputedStyle(probe).color
        probe.remove()
        /* M69: the state hue is the LEFT EDGE only; selection is iris on the other sides. */ return { border: getComputedStyle(el).borderLeftColor, want }
      })()`)
      ok('97 the attention row navigates to its panel and leaves it amber',
        rowAppeared === true && clicked === true &&
          (after97.x !== before97.x || after97.y !== before97.y) &&
          after97.scale === before97.scale &&
          colour !== null && colour.border === colour.want,
        `row=${rowAppeared} clicked=${clicked} ` +
          `${JSON.stringify(before97)} -> ${JSON.stringify(after97)} ${JSON.stringify(colour)}`)
    }

    // 98. FOCUS IS STILL WHAT ACKNOWLEDGES, AND THE ROW LEAVES WITH THE STATE.
    //     The other half of 97, and the half that proves the section is a VIEW
    //     over the attention set rather than a list with a life of its own: a
    //     row that survived the state clearing would navigate to a panel with
    //     nothing to say, and the queue would only ever grow.
    //
    //     Clicking the PANEL (now on screen, because 97 framed it) is the
    //     gesture — not a rail control, which by design takes neither DOM
    //     focus nor focusedId and therefore acknowledges nothing.
    {
      const point = await wc.executeJavaScript(`(() => {
        const el = document.querySelector(
          '[data-panel-id=${JSON.stringify(state.attentionPanelId)}] .panel__slot')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)
      // NOT a throw, unlike 96/97's fixture guards. At the RED step 97's
      // click does nothing, so the panel is still off screen and may be a
      // card with no .panel__slot at all — and a throw here would end the run
      // and take 98b's RED with it. A missing slot is a real failure of this
      // check, so it is reported as one.
      if (!point) {
        ok('98 focusing the panel clears the state and its attention row',
          false, 'no .panel__slot to click — the panel was never framed')
      } else {
      wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
      // One selector string, built once. Nesting JSON.stringify inside a
      // template inside executeJavaScript is exactly the kind of quoting that
      // silently matches nothing and reports a pass.
      const rowSel = JSON.stringify(
        `.rail-attention[data-rail-attention=${JSON.stringify(state.attentionPanelId)}]`)
      const panelSel = JSON.stringify(`[data-panel-id=${JSON.stringify(state.attentionPanelId)}]`)
      const gone = await waitUntil(async () => {
        const state = await wc.executeJavaScript(`(() => {
          const panel = document.querySelector(${panelSel})
          return {
            agent: panel ? panel.getAttribute('data-agent-state') : null,
            row: document.querySelector(${rowSel}) !== null
          }
        })()`)
        return (state.agent !== 'wants-you' && state.row === false) ? state : false
      }, 6000)
      ok('98 focusing the panel clears the state and its attention row',
        gone !== false, `state=${JSON.stringify(gone)}`)
      }
    }

    // The empty state, read once now that 98 has emptied the queue. It is the
    // state this section is in nearly all the time, which is exactly why it is
    // the one most likely to have been left rendering nothing at all — and a
    // section header with a void under it reads as a broken list rather than
    // as "nobody needs you".
    {
      // M46: open the Attention popover first — it is where the list lives —
      // and close it again with Escape so nothing below finds it up.
      await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="attention"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      await settle()
      const empty = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('.rail-list--attention .rail-empty')
        return el ? el.textContent : null
      })()`)
      await wc.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`)
      await settle()
      ok('98b an empty attention queue says so rather than rendering nothing',
        typeof empty === 'string' && empty.trim().length > 0, `empty=${JSON.stringify(empty)}`)
    }

    // 99-101 share one fixture repository and one block. This is the only
    // place in the milestone where a real panel, in a real renderer, is
    // driven against a real git repository — everything in verify:review is
    // argued against a fake runner, and everything else in this suite never
    // touches git at all.
    //
    // Skipped LOUDLY on a machine with no git, never silently, and never by
    // hard-failing: without this guard the execFileSync below throws into
    // this suite's outer try, is recorded as an `infrastructure` failure and
    // takes `npm run verify` red for a reason that has nothing to do with the
    // code under test. The same guard verify:review already carries for its
    // own real-git block, and the rule CLAUDE.md states for the tmux block.
    if (!state.GIT_OK) {
      // 116-117 do not touch git at all, but they are nested inside this
      // block purely to reuse its spawnAt/sessionMap helpers — so a machine
      // with no git binary skips them too, and this message says so rather
      // than leaving them unexplained. M20's file-tree checks (156-160, and
      // the final-review fix wave's 161) — numbered 125-129/130 under this
      // branch's own original M13, renumbered on merge; see the file-tree
      // block's own comment for the full collision story — are nested here
      // for the identical reason (reusing spawnAt/sessionMap/settle rather
      // than a second copy of that plumbing) and would otherwise vanish from
      // the summary with nothing printed at all on a git-less machine — the
      // exact silent-skip shape this whole guard exists to avoid. Check 73's
      // own widened four-column assertion lives OUTSIDE this block (it runs
      // long before this GIT_OK probe) and does not belong in this message.
      console.log('SKIP  99-101, 113-115, 116-117, 156-160 and 161 — no git binary found (loudly, not silently)')
    } else {
      const repo = mkdtempSync(join(tmpdir(), 'tc panels review '))
      // A directory that is definitely NOT a repository, for check 100.
      // Deliberately its own mkdtemp rather than "any panel that is not
      // first": the other fixture panels are `~`, and a developer who keeps
      // dotfiles in a git checkout at $HOME — a common setup — would get a
      // red 100 with a misleading message about a genuine repository.
      const notRepo = mkdtempSync(join(tmpdir(), 'tc panels notrepo '))
      const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
      git('init', '-q', '.')
      git('config', 'user.email', 'v@example.com')
      git('config', 'user.name', 'v')
      writeFileSync(join(repo, 'seed.txt'), 'seed\n')
      git('add', '-A')
      git('commit', '-qm', 'init')

      /* Spawns through the SAME PRESET_SPAWN event check 27 uses, and returns
         the id that appeared. /bin/sh rather than the default: this block
         writes real shell commands, and Cmd+N's default here is
         `/bin/cat -v`, which ECHOES bytes rather than interpreting them — the
         substitution checks 54-63 and 83 already make for the same reason. */
      const spawnAt = async (cwd) => {
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

      /* A real sendInputEvent click, not a dispatched MouseEvent: check 75c
         records why a synthetic one proves nothing about focus, and selection
         here has to be the real thing for the inspector to follow it. */
      const selectPanel = async (id, opts = {}) => {
        const box = await wc.executeJavaScript(
          `(() => { const p = document.querySelector('[data-panel-id=' + ${JSON.stringify(JSON.stringify(id))} + ']');
                    if (!p) return null;
                    const r = p.getBoundingClientRect();
                    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 24) } })()`)
        if (!box) return false
        wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        // Skippable for 100b alone: settle() is long enough for the review
        // invoke to resolve, which CLOSES the very window that check is about.
        if (opts.settle !== false) await settle()
        return true
      }

      const first = await spawnAt(repo)
      // The write must not overtake the spawn: a panel's PTY does not exist
      // until it goes live and the registry's lazy spawn actually creates it
      // (see "Lazy spawn" in CLAUDE.md), so a write issued right after
      // PRESET_SPAWN can land before there is a session, do nothing, and
      // leave the repository clean — a failure that looks like a broken
      // engine rather than a racing fixture. sessionMap is the same wait
      // check 83 uses for the identical reason.
      if (first) await waitUntil(async () => (await sessionMap(wc)).has(first), 8000)
      // Through the REAL PTY, not from node. A file main wrote itself would
      // prove the engine works and say nothing about whether the PANEL'S cwd
      // is what got reviewed, which is the one thing this check exists for.
      if (first) ptyManager.write(first, "printf 'x' > agent.txt\n")
      await settle()
      const selected = first ? await selectPanel(first) : false

      const summary = await waitUntil(async () => {
        const text = await wc.executeJavaScript(
          `(document.querySelector('[data-review-summary]') || {}).textContent || null`)
        return text && text.includes('file') ? text : false
      }, 5000)
      const files = await wc.executeJavaScript(
        `[...document.querySelectorAll('[data-review-file]')].map((e) => e.getAttribute('data-review-file'))`)
      ok('99 the inspector names the file the panel\'s own agent wrote',
        selected && typeof summary === 'string' && summary.includes('1 file') &&
          files.includes('agent.txt'),
        `summary=${summary} files=${JSON.stringify(files)}`)

      // 100. A panel whose cwd is NOT a repository renders no section at all
      //      — asserted as the element being ABSENT, not as empty text,
      //      because an empty-but-present section is a visible blank gap in
      //      a 260px pane. Weak on its own: it passes vacuously before the
      //      section exists, so it is evidence only once 99 has been watched
      //      red.
      const homePanel = await spawnAt(notRepo)
      // 100b. I1: the OUTGOING panel's file list must not render under the
      //       INCOMING panel's heading. Until this fix the effect cleared
      //       `review` only when the selection went to NULL, so selecting B
      //       kept A's model — a real file list, with real counts, under B's
      //       name — for an IPC round trip plus up to four git subprocesses,
      //       which is plainly visible on a real repository. The `live` flag
      //       prevents the stale WRITE; nothing prevented the stale RENDER.
      //
      //       Detected POSITIVELY, as a single consistent DOM read pairing
      //       "which panel is selected" with "is a review summary on screen":
      //       the two commit together, so seeing the incoming panel selected
      //       WITH a summary still present is the defect itself, not a race.
      //       Asserting only "the summary is absent" cannot work — it is
      //       satisfied before React has even processed the click — and the
      //       click deliberately skips settle(), which is long enough for the
      //       invoke to resolve and therefore closes the window entirely
      //       (confirmed: the first draft of this check passed against the
      //       unfixed renderer for exactly that reason).
      // Settled FIRST, on its own, so its final answer (no section at all) is
      // already on screen: a spawn selects the new panel, and a capture is
      // fire-and-forget, so a panel read too early reports its own transient
      // `never-started` — which the detection loop below would pick up as a
      // stale summary that has nothing to do with panel A.
      if (homePanel) await selectPanel(homePanel)
      await waitUntil(async () =>
        await wc.executeJavaScript(`document.querySelector('[data-review-summary]') !== null`)
          ? false : true, 5000)
      // Back to panel A, whose summary is a real file list, and then to B
      // again WITHOUT settling — the window this check is about.
      await selectPanel(first)
      await waitUntil(async () => {
        const t = await wc.executeJavaScript(
          `(document.querySelector('[data-review-summary]') || {}).textContent || null`)
        return t && t.includes('file') ? true : false
      }, 5000)
      /* Selected through the RAIL row, not by clicking the panel: cascaded
         spawns overlap, and selecting panel A raises it, so a coordinate
         click aimed at B's header lands on A instead — which is how the
         first draft of this check went green while the selection never
         moved at all (last={id:A, summary:A's}). The rail row is a real
         production gesture (goToPanel -> selectAndRaise), immune to z-order,
         and it does not settle. */
      const selectFromRail = (id) => wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-list--panels .rail-row[data-rail-row=' +
          ${JSON.stringify(JSON.stringify(id))} + '] .rail-row__main')
        if (!row) return false
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true })()`)
      const clickedB = homePanel ? await selectFromRail(homePanel) : false
      let lastSeen = null
      const staleSeen = await (async () => {
        const deadline = Date.now() + 4000
        while (Date.now() < deadline) {
          const r = await wc.executeJavaScript(`(() => {
            const sel = document.querySelector('.panel--selected');
            const s = document.querySelector('[data-review-summary]');
            return { id: sel ? sel.getAttribute('data-panel-id') : null,
                     summary: s ? s.textContent : null } })()`)
          // Only once the click has actually landed is the read meaningful:
          // until then `.panel--selected` is still the OUTGOING panel and a
          // present summary is correct rather than stale.
          lastSeen = r
          if (r.id === homePanel) return r.summary
        }
        return null
      })()
      ok('100b selecting a panel does not render the previous panel\'s files',
        homePanel !== null && clickedB === true && staleSeen === null,
        `staleSeen=${JSON.stringify(staleSeen)} clickedB=${clickedB} last=${JSON.stringify(lastSeen)}`)
      // waitUntil, not one immediate read: Canvas's review query is async
      // (an IPC round trip plus a real git process), and the previous
      // selection's model is still the frozen prop until that resolves — a
      // bare read right after the click can catch the OUTGOING panel's
      // section still on screen and fail for a reason that has nothing to
      // do with whether this panel's own answer is correctly hidden.
      //
      // Named `absent`, true once the element is gone: an earlier draft
      // named this `present` while polling for its OPPOSITE (absence), which
      // is a naming defect worth heeding even though the check passed either
      // way — a later reader "simplifying" this to a bare, unwaited read
      // would silently invert what the identifier already claimed to hold,
      // and an inverted end-to-end check is one that passes against the very
      // regression it exists to catch.
      const absent = await waitUntil(async () =>
        await wc.executeJavaScript(`document.querySelector('[data-review-summary]') !== null`)
          ? false // still present: keep polling
          : true, // absent: the state this check wants
        5000)
      ok('100 no section for a panel outside a repository', homePanel !== null && absent === true)

      // 101. Two panels in ONE repository report shared rather than a
      //      confident wrong attribution — the only place the mixed-checkout
      //      rule is proven against a real store, a real engine and real git
      //      rather than a fake.
      const second = await spawnAt(repo)
      // Two races stacked here, not one. sessionMap alone (first's fix,
      // above) only proves the PTY exists — captureBaseline is ITSELF
      // fire-and-forget on top of that (a spawn must never be delayed by a
      // git process), so a query issued right after the session appears can
      // still land before the baseline write and read back never-started,
      // which looks like a broken shared-repo detector and is actually a
      // fixture racing its own spawn. Poll review:panel directly rather than
      // sessionMap a second time: the baseline is the fact this block
      // actually needs settled, and sessionMap cannot see it.
      if (second) {
        await waitUntil(async () => (await sessionMap(wc)).has(second), 8000)
        await waitUntil(async () => {
          const kind = await wc.executeJavaScript(
            `window.canvas.review.panel(${JSON.stringify(second)}).then((r) => r.kind)`)
          return kind !== 'never-started' ? kind : false
        }, 8000)
        await selectPanel(second)
      }
      const note = await waitUntil(async () => {
        const text = await wc.executeJavaScript(
          `(document.querySelector('[data-review-note]') || {}).textContent || null`)
        return text ? text : false
      }, 5000)
      const diag101 = await wc.executeJavaScript(`(() => ({ focused: window.__m4aFocusedId(), selected: (document.querySelector('.panel--selected') || {}).getAttribute ? document.querySelector('.panel--selected').getAttribute('data-panel-id') : null, second: window.__m4aSessions().find((s) => s.id === ${JSON.stringify(second)}) || null, live: [...document.querySelectorAll('.panel .xterm')].length }))()`)
      ok('101 two panels in one repo are reported as unattributable',
        typeof note === 'string' && note.includes('cannot be attributed'), `note=${note} second=${second} diag=${JSON.stringify(diag101)}`)


      /* A review node is seeded through DISK + RELOAD rather than through a
         gesture, and deliberately: the creation gesture is Task 9's subject,
         and a node that can only exist because a button worked would make
         these three checks fail for that button's reasons. The route is the
         one checks 39 and 84 already use for a dormant panel — append to the
         saved canvas, reload, read what came back. It needs a REAL baseline
         sha, so it asks main for the subject panel's own. */
      const seedReviewNode = async (subjectId, nodeId) => {
        const baseline = await wc.executeJavaScript(
          `window.canvas.review.baseline(${JSON.stringify(subjectId)})`)
        if (!baseline) return null
        const saved = layoutStore.initial()
        const panels = saved.panels.concat([{
          id: nodeId, x: 60000, y: 0, w: 640, h: 520, z: 99, kind: 'review',
          subject: { subjectId, repoRoot: baseline.root, baselineSha: baseline.sha, label: 'claude' }
        }])
        // The camera is set for legibility if anyone ever watches this run,
        // and for nothing else: a review node is never CULLED, because
        // culling is tiering and Canvas.tsx keeps nodes out of the array
        // assignTiers is given, so React renders it wherever it sits. Check
        // 104's own output says so — it reads the node at screen x 60360,
        // some 60,000px off screen, and still finds it in the DOM.
        layoutStore.save({ panels, camera: { x: -60000 + 200, y: 100, scale: 1 },
          selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        // waitUntil on the DOM rather than a guessed sleep: boot awaits two
        // IPC round trips (layout:load, then pty:list) before the first
        // render, and the node's own review:at query resolves after that.
        const appeared = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="${nodeId}"]') !== null`), 10000)
        return appeared === true ? nodeId : null
      }
      const xtermCount = () => wc.executeJavaScript(
        `document.querySelectorAll('.xterm').length`)
      const beforeXterms = await xtermCount()
      const node = first ? await seedReviewNode(first, 'r90') : null

      // 102. The node renders REAL content — the file its subject's agent
      //      actually wrote, read through review:at with no panel id
      //      involved — and there is no terminal machinery underneath it.
      //      Both halves in one read: a node that rendered a file list AND
      //      an empty xterm host would satisfy either half alone, and the
      //      empty host is precisely what a copy-pasted TerminalPanel gives.
      {
        // The summary starts at "reading…" and becomes "1 file changed" one
        // IPC round trip later, so the file rows are what this waits on —
        // reading immediately would fail against a correct implementation.
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]').length > 0`),
        8000)
        const body = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id="r90"]')
          if (!n) return null
          return {
            summary: (n.querySelector('[data-review-node-summary]') || {}).textContent || '',
            files: [...n.querySelectorAll('[data-review-node-file]')]
              .map((e) => e.getAttribute('data-review-node-file')),
            slots: n.querySelectorAll('.panel__slot').length,
            xterms: n.querySelectorAll('.xterm').length
          } })()`)
        ok('102 a review node renders its subject\'s files and no terminal',
          node !== null && body !== null && body.files.includes('agent.txt') &&
            body.summary.includes('file') && body.slots === 0 && body.xterms === 0,
          JSON.stringify(body))
      }

      // 103. THE ONE TO KNOW BY NUMBER — success criterion 4's teeth. The
      //      node holds no PanelSession and consumes no WebGL context, and
      //      both are asserted against the registry and the DOM rather than
      //      argued from the code. The xterm count is compared to the count
      //      BEFORE the node existed, because "the node has no xterm" (102)
      //      is satisfied by an implementation that quietly promoted some
      //      OTHER panel to pay for it.
      {
        // __m4aSessions, not sessionMap: the claim is about the RENDERER's
        // registry — "no PanelSession was minted for this id" — and main's
        // pty:list would answer `false` for a node that had a session and
        // simply had not spawned yet.
        const sessions = await wc.executeJavaScript(
          `(window.__m4aSessions ? window.__m4aSessions() : []).map((s) => s.id)`)
        const afterXterms = await xtermCount()
        ok('103 a review node has no session and costs no WebGL context',
          node !== null && sessions.includes('r90') === false && afterXterms <= beforeXterms,
          `xterms ${beforeXterms} -> ${afterXterms} sessions=${JSON.stringify(sessions)}`)
      }

      // 104. It is a child of .world, which is what makes semantic zoom free
      //      rather than a feature: it pans and zooms with the panel it
      //      reviews. Asserted as a real camera move changing its screen
      //      position, not merely as a CSS ancestor — a node re-parented to
      //      the screen-space chrome layer would still match a selector and
      //      would sit still while the canvas moved under it.
      {
        // Its own pan helper: the panBy in the M6c/M6d blocks above is a
        // block-local of theirs and is not in scope here.
        const panReview = (dx, dy) => wc.executeJavaScript(`
          document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
            bubbles: true, cancelable: true, clientX: 700, clientY: 450,
            deltaX: ${dx}, deltaY: ${dy}, deltaMode: 0
          }))
          true
        `)
        const boxOf = () => wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id="r90"]')
          return n ? n.getBoundingClientRect().left : null })()`)
        const inWorld = await wc.executeJavaScript(
          `document.querySelector('.world .review-node[data-panel-id="r90"]') !== null`)
        const before = await boxOf()
        await panReview(120, 0)
        await settle()
        const after = await boxOf()
        ok('104 the node lives in .world and moves with the camera',
          inWorld === true && before !== null && after !== null && Math.abs(after - before) > 50,
          `${before} -> ${after}`)
      }

      // 105. A wheel over a FOCUSED review node's body is left uncancelled
      //      (the browser scrolls the diff) and moves no camera, while the
      //      same wheel over the canvas background still pans — the two
      //      halves check 47 already pins for the palette, on a second
      //      surface. Cancellation, not scrollTop: a synthetic WheelEvent is
      //      untrusted and Chromium performs no default action for one, so a
      //      scrollTop assertion would fail the correct implementation. The
      //      camera clause is what makes it more than a tautology.
      {
        const focused = await wc.executeJavaScript(`(() => {
          const body = document.querySelector('.review-node[data-panel-id="r90"] .review-node__body')
          if (!body) return null
          body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        await settle()
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        const cancelled = await wc.executeJavaScript(`(() => {
          const body = document.querySelector('.review-node[data-panel-id="r90"] .review-node__body')
          const e = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
          return body.dispatchEvent(e) === false })()`)
        await settle()
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        ok('105 a wheel over a focused review node is the node\'s, not the camera\'s',
          focused === true && cancelled === false && after.x === before.x && after.y === before.y,
          `cancelled=${cancelled} ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
      }

      // Local to this block: neither exists anywhere else in this file. A
      // review node reuses the `.panel` class (ReviewNode.tsx's own comment
      // explains why), so this counts both kinds the same way spawnAt does.
      const panelIds = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      const clickShell = (selector) => wc.executeJavaScript(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return false
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true })()`)

      // 106. The inspector's button makes a real node beside a real panel,
      //      through main's real baseline. Three clauses, and the id prefix
      //      is one of them: `r` is what tells a reader of layout.json (and
      //      of a tmux session list) which panels can possibly own a
      //      session.
      {
        const beforeIds = await panelIds()
        // M135. The rail row, not a coordinate click: 104/105's review node
        // r90 sits over `first` in this part's canvas and took the click
        // (100b's own finding), so the production gesture that is immune to
        // z-order is the one to use.
        await wc.executeJavaScript(`(() => {
          const row = document.querySelector('.rail-list--panels .rail-row[data-rail-row=' + ${JSON.stringify(JSON.stringify(first))} + '] .rail-row__main')
          if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return !!row })()`)
        await settle()
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('[data-inspector-action="review"]') !== null`), 5000)
        await clickShell('[data-inspector-action="review"]')
        const node = await waitUntil(async () => {
          const ids = await panelIds()
          const fresh = ids.filter((id) => !beforeIds.includes(id))
          return fresh.length === 1 ? fresh[0] : false
        }, 8000)
        const heading = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id=' +
            ${JSON.stringify(JSON.stringify(node))} + ']')
          return n ? n.querySelector('.panel__title').textContent : null })()`)
        const sessions = await sessionMap(wc)
        ok('106 the inspector opens a review node for the selected panel',
          typeof node === 'string' && node.startsWith('r') &&
            typeof heading === 'string' && heading.includes('review') &&
            sessions.has(node) === false,
          `node=${node} heading=${heading} diag=${JSON.stringify(await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-inspector-action="review"]'); return { first: ${JSON.stringify(first)}, focused: window.__m4aFocusedId(), selected: (document.querySelector('.panel--selected') || { getAttribute: () => null }).getAttribute('data-panel-id'), review: b ? { disabled: b.disabled, title: b.title, text: b.textContent } : null, reason: (document.querySelector('[data-inspector-reason]') || {}).textContent || null } })()`))}`)
      }

      // 107. THE ID CHECK, RETARGETED after fix round 1. `n6` and `r6`
      //      cannot collide — they are different strings, and only
      //      SAME-PREFIX ids collide as tmux session names — so comparing
      //      bare numbers across prefixes (the original form of this check)
      //      flagged n34/r34 coexisting as though it were a defect, and it
      //      passed identically under either regex besides: the reload below
      //      seeds the counter from an n-max nowhere near the seeded r-node's
      //      own number, so neither regex ever had a reason to disagree.
      //
      //      The REAL hazard is review node versus review node. A persisted
      //      `r<N>` is invisible to a NARROW seeding regex, so a later
      //      review gesture can mint that exact id a SECOND time — a literal
      //      duplicate panel id, which parseLayout drops silently on the
      //      next load and which React keys collide on today. This seeds a
      //      review node whose number is exactly the NEXT one a narrow
      //      reseed would compute (today's n-max plus one), reloads so the
      //      reseed actually runs, then opens a review on that SAME subject
      //      through the real gesture — the first id-minting action after
      //      the reload — and asserts the minted id collides with nothing
      //      the canvas already holds, across every workspace.
      // Session survival across wc.reload() is a TMUX property — the
      // direct backend kills the process outright on reload, so the subject
      // would never reattach, `minted` would stay null, and a tmux-free
      // machine would see a RED that has nothing to do with the id-collision
      // defect this check exists to prove. Skipped LOUDLY, never silently,
      // the same shape and wording as check 91 — and gating BEFORE the
      // spawn/seed/reload, not merely around the assertion, so a skip leaves
      // no half-built fixture (an extra subject panel, a seeded collide-id
      // node on disk) for anything appended after this block to trip over.
      const TMUX_107 = findTmux()
      if (!TMUX_107 || !state.tmuxBackend) {
        ok('107 a review node cannot mint an id a persisted node already owns (SKIPPED — no tmux binary found)',
          true, 'install tmux to cover this')
      } else {
        state.backend = state.tmuxBackend
        const subjectPanel = first ? await spawnAt(repo) : null
        if (subjectPanel) {
          await waitUntil(async () => (await sessionMap(wc)).has(subjectPanel), 8000)
        }
        const idsForSeed = subjectPanel
          ? await wc.executeJavaScript(
              `window.canvas.workspace.list().then((ws) => ws.flatMap((w) => w.panelIds))`)
          : []
        const maxN = idsForSeed.reduce((max, id) => {
          const m = /^n(\d+)$/.exec(id)
          return m ? Math.max(max, Number(m[1])) : max
        }, 0)
        // Exactly the id a NARROW regex's reseed would hand out next: it
        // never sees this r-node at all, so it recomputes the same
        // n-max-plus-one it would have without this node existing.
        const collideId = `r${maxN + 1}`
        // review.baseline shells out to git; under full-chain load it has
        // returned null once (baseline=no) where standalone it never does.
        // Retry a few times rather than let one git race fail an unrelated
        // id-collision check — the same reasoning as the 45s reattach window.
        const seedBaseline = subjectPanel
          ? await waitUntil(async () => {
              const b = await wc.executeJavaScript(
                `window.canvas.review.baseline(${JSON.stringify(subjectPanel)})`)
              return b && b.sha ? b : false
            }, 20000)
          : null
        let minted = null
        let idsAfterReload = null
        // Carried into the detail line: `minted=null` alone cannot say which
        // of the two 15s windows below closed — the subject's tmux reattach
        // after the reload, or the review gesture's mint — and the M40 chain
        // run flaked here once with exactly that ambiguity.
        let reattached107 = null
        let action107 = null
        if (seedBaseline) {
          const saved = layoutStore.initial()
          const seededPanels = saved.panels.concat([{
            id: collideId, x: 60000, y: 0, w: 640, h: 520, z: 99, kind: 'review',
            subject: {
              subjectId: subjectPanel, repoRoot: seedBaseline.root,
              baselineSha: seedBaseline.sha, label: 'claude'
            }
          }])
          // Camera near the ORIGIN, deliberately unlike seedReviewNode's own
          // far-off one above: this check has to click the SUBJECT panel
          // after the reload through a real sendInputEvent, which needs real
          // screen coordinates — not a panel 60,000 world units from
          // wherever the camera happens to sit.
          layoutStore.save({ panels: seededPanels, camera: { x: 0, y: 0, scale: 1 },
            selectedId: null, focusedId: null })
          layoutStore.flushSync()
          const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
          wc.reload()
          await reloaded
          await waitUntil(async () => wc.executeJavaScript(
            `document.querySelector('.review-node[data-panel-id="${collideId}"]') !== null`),
          10000)
          idsAfterReload = await wc.executeJavaScript(
            `window.canvas.workspace.list().then((ws) => ws.flatMap((w) => w.panelIds))`)
          // The subject's own session reattaching (tmux) is what keeps its
          // baseline alive in main, exactly the mechanism check 91 already
          // proves for the inspector's reattached badge.
          // 30s, raised from 15s in M42: reattach after a reload waits on the
          // store load, pty:list and the tier pass, and 15s flaked on the
          // reattach (reattached=null) in EVERY M40-M42 full-chain run, where
          // 20+ prior suites leave the machine warm and the socket crowded —
          // never standalone. Raising the CEILING costs nothing on the common
          // fast path and only adds time in the rare slow one; a check that
          // reports a hang that isn't there destroys the real result, which is
          // strictly worse (verify:panels' own watchdog note).
          const reattached = await waitUntil(
            async () => (await sessionMap(wc)).has(subjectPanel), 45000)
          reattached107 = reattached
          if (reattached) {
            await selectPanel(subjectPanel)
            action107 = await waitUntil(async () => wc.executeJavaScript(
              `document.querySelector('[data-inspector-action="review"]') !== null`), 5000)
            await clickShell('[data-inspector-action="review"]')
            await settle()
            minted = await waitUntil(async () => {
              const ids = await wc.executeJavaScript(
                `window.canvas.workspace.list().then((ws) => ws.flatMap((w) => w.panelIds))`)
              const fresh = ids.filter((id) => !idsAfterReload.includes(id))
              return fresh.length === 1 ? fresh[0] : false
            }, 30000)
          }
        }
        const finalIds = await wc.executeJavaScript(
          `window.canvas.workspace.list().then((ws) => ws.flatMap((w) => w.panelIds))`)
        ok('107 a review node cannot mint an id a persisted node already owns',
          subjectPanel !== null && seedBaseline !== null && typeof minted === 'string' &&
            minted !== collideId && new Set(finalIds).size === finalIds.length,
          `subject=${subjectPanel} baseline=${seedBaseline ? 'yes' : 'no'} afterReload=${idsAfterReload ? idsAfterReload.length : 'null'} collideId=${collideId} minted=${minted} reattached=${reattached107} action=${action107} ids=${JSON.stringify(finalIds)}`)
      }

      // 108. The node is in the rail, and its row NAVIGATES — the rule
      //      M8b's rows already obey. The camera clause is what rejects a
      //      row wired to nothing; the session clause is what rejects a row
      //      that reached onSelectPanel, whose wake path has no meaning here
      //      and whose real cost is that it is the app's spawn gesture.
      {
        const panBy108 = (dx, dy) => wc.executeJavaScript(`
          document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
            bubbles: true, cancelable: true, clientX: 700, clientY: 450,
            deltaX: ${dx}, deltaY: ${dy}, deltaMode: 0
          }))
          true
        `)
        const clickRail108 = (id) => wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-rail-row=${JSON.stringify(id)}] .rail-row__main')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`)
        await panBy108(900, 600)
        await settle()
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        const clicked = node !== null ? await clickRail108('r90') : false
        await settle()
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        const sessions = await sessionMap(wc)
        ok('108 the rail lists a review node and its row frames it',
          node !== null && clicked === true && (after.x !== before.x || after.y !== before.y) &&
            sessions.has('r90') === false)
      }

      // 109. Success criterion 4's last clause: a review node survives a
      //      relaunch. Driven through a REAL reload rather than a parse
      //      check — Task 2 already pins the on-disk format, and what this
      //      adds is that the restored node still ANSWERS. Its subject's
      //      session is gone on the direct backend and merely detached under
      //      tmux, and the node must not care either way: it asks review:at
      //      with the baseline it carries, so the only thing that has to
      //      have survived the reload is the node's own `subject` record.
      {
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        const back = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="r90"]') !== null`), 10000)
        // waitUntil on the FILE ROWS, not on the node: boot awaits two IPC
        // round trips before its first render and the node's own query
        // resolves after that, so the summary reads "reading…" for a moment
        // on a perfectly healthy restore. An immediate read would fail
        // against correct code.
        const files = await waitUntil(async () => {
          const f = await wc.executeJavaScript(
            `[...document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]')]
               .map((e) => e.getAttribute('data-review-node-file'))`)
          return f.length > 0 ? f : false
        }, 10000)
        ok('109 a review node survives a reload and still reports its files',
          back === true && Array.isArray(files) && files.includes('agent.txt'),
          `back=${back} files=${JSON.stringify(files)}`)
      }

      // 110. SUCCESS CRITERION 5, and the check the node's whole design
      //      exists for. Closing the subject panel drops its baseline in
      //      main (PtyManager.kill -> dropBaseline, on every close) — so a
      //      node that had asked review:panel(subjectId) would go blank
      //      exactly here, at the moment a review of finished work is most
      //      useful. This node keeps answering because it carries the
      //      baseline itself and asks review:at.
      //
      //      It cannot be watched failing against correct code, and was
      //      proven by FAULT INJECTION instead: swapping ReviewNode's query
      //      to window.canvas.review.panel(subject.subjectId) turns this
      //      RED while check 102 — the same node, rendering the same files,
      //      with its subject still alive — stays GREEN. That contrast is
      //      the whole point of this check: 102 proves the node renders,
      //      and only 110 proves it OUTLIVES.
      {
        // The rail's close control, not the panel's own ×: a terminal panel
        // running a process ARMS on the first × click and needs a second
        // one, so a single dispatched mousedown there would leave the panel
        // open and this check would pass for the wrong reason (a subject
        // that was never closed cannot demonstrate outliving anything).
        // The rail row closes outright — check 86's own gesture.
        const closed = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.rail-row[data-rail-row=' +
            ${JSON.stringify(JSON.stringify(first))} + '] .rail-row__close')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true })()`)
        const subjectGone = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.panel[data-panel-id=' +
             ${JSON.stringify(JSON.stringify(first))} + ']') === null`), 8000)
        const stillThere = await waitUntil(async () => {
          const f = await wc.executeJavaScript(
            `[...document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]')]
               .map((e) => e.getAttribute('data-review-node-file'))`)
          return f.includes('agent.txt') ? f : false
        }, 8000)
        // Re-QUERIED, not merely still painted. The clause above is
        // satisfied by a DOM left over from before the close, which is
        // exactly what a broken node would show for as long as nobody asked
        // it anything; the refresh control sends a fresh review:at through
        // main, and only an answer to THAT proves the node can still read
        // its repository with its subject gone.
        const requeried = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id="r90"] .review-node__refresh')
          if (!n) return false
          n.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        // A SUSTAINED hold, never a waitUntil, and this is the one thing
        // about check 110 that had to be learned the hard way. The node does
        // not clear `result` while a refresh is in flight (it would flicker
        // the file list on every re-read), so there is no DOM state meaning
        // "re-querying" — which makes a waitUntil here satisfied INSTANTLY
        // by the rows that were already painted, long before the new answer
        // lands. The first draft was exactly that, and it passed against the
        // fault-injected node roughly half the time: whether the check saw
        // the defect depended on which of two promises won a race. Holding
        // the condition for two seconds instead is what makes a
        // never-started answer arriving mid-window turn this red rather than
        // slipping in behind a green assertion.
        const after = await (async () => {
          const deadline = Date.now() + 2000
          let last = null
          while (Date.now() < deadline) {
            last = await wc.executeJavaScript(
              `[...document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]')]
                 .map((e) => e.getAttribute('data-review-node-file'))`)
            if (!last.includes('agent.txt')) return false
            await sleep(100)
          }
          return last
        })()
        ok('110 a review node outlives the panel it reviews',
          closed === true && subjectGone === true && stillThere !== false &&
            requeried === true && after !== false,
          `closed=${closed} gone=${subjectGone} still=${JSON.stringify(stillThere)} after=${JSON.stringify(after)}`)
      }

      // 111. Closing the NODE kills nothing. onClosePanel branches on the
      //      kind before it disposes, and this is the only check that can
      //      see the branch: dispose(id) sends pty.kill even for an id this
      //      renderer holds no session for, so routing a node through it
      //      would send a tmux kill-session named after a panel that never
      //      had one — and drop the baseline of whatever panel later
      //      recycles that id.
      {
        const before = await sessionMap(wc)
        const killsBefore = killedPanelIds.length
        const closed = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.review-node[data-panel-id="r90"] .panel__close')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        const gone = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="r90"]') === null`), 6000)
        // THE NON-VACUITY HALF, and it is not optional. Everything this check
        // asserts about `kills` is a NEGATIVE, against a recording mechanism
        // nothing else proves is still recording: lose the shadow — the
        // harness rewired, registerIpcHandlers binding the prototype method,
        // PtyManager.kill refactored behind another entry point — and
        // `killedPanelIds` is empty forever, both this check and 111b stay
        // green, and the only coverage the three dispose guards have
        // disappears with no signal at all. That is the shape CLAUDE.md
        // already names for verify:pty-manager 18: "no wants-you" is
        // satisfied just as well by bytes that never reached main.
        //
        // So a REAL terminal panel is closed inside the SAME window, through
        // the rail (which closes outright, no arming step), and the slice
        // must contain it. In-window rather than leaning on check 110's
        // close one screenful up: a cumulative read would prove the probe was
        // alive earlier in the run, and "earlier" is exactly the assumption a
        // liveness clause must not make. homePanel is check 100's
        // outside-a-repository panel and nothing after this point uses it.
        const closedReal = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.rail-row[data-rail-row=' +
            ${JSON.stringify(JSON.stringify(homePanel))} + '] .rail-row__close')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true })()`)
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.panel[data-panel-id=' +
             ${JSON.stringify(JSON.stringify(homePanel))} + ']') === null`), 6000)
        await settle()
        const after = await sessionMap(wc)
        // Compared against `before` MINUS the panel this check deliberately
        // closed: the liveness close is a real one and really does end a
        // session, so the pid comparison has to be told about it or it would
        // report the check's own fixture as a regression.
        const expected = new Map([...before].filter(([id]) => id !== homePanel))
        const preserved = pidsPreserved(expected, after)
        // THE CLAUSE THAT DISCRIMINATES. The pid and DOM clauses are worth
        // having and cannot fail on their own: a stray kill for an id that
        // names no session changes no pid and removes no row, so an unguarded
        // close is invisible from the renderer. `kills` is read at main's own
        // door, where it is the only place the mistake exists at all.
        const kills = killedPanelIds.slice(killsBefore)
        ok('111 closing a review node ends no session',
          closed === true && gone === true && preserved.ok &&
            closedReal === true && kills.includes(homePanel) === true &&
            kills.includes('r90') === false,
          `sessions ${before.size} -> ${after.size} changed=${JSON.stringify(preserved.changed)} kills=${JSON.stringify(kills)}`)
      }

      // 111b. The UNDO path, which Task 9's creation gesture made reachable:
      //       applyHistory's dispose loop removes whatever the undone state
      //       no longer contains, and until this milestone's guard it made
      //       no exception for a kind that owns no session. Cmd+N then
      //       Cmd+Z is one gesture away from being how most nodes are
      //       closed, so the loop needs the same branch onClosePanel has.
      //
      //       Its `kills` clause is the one that discriminates, for the
      //       reason check 111 states above: with the guard removed, every
      //       renderer-visible fact here is unchanged — the node still
      //       leaves the DOM (applyHistory removes it either way) and every
      //       pid is still preserved (a kill aimed at an id naming no
      //       session is swallowed at every layer). Confirmed by injection:
      //       both guards deleted, both checks green, until the kill probe
      //       existed. The DOM and pid clauses stay because each rejects a
      //       different wrong undo — one that disposes the SUBJECT, one that
      //       leaves the node on screen.
      //
      //       It carries its OWN non-vacuity clause rather than borrowing
      //       111's, for the reason 111's own comment gives: a positive
      //       recorded in an earlier window proves the probe was alive
      //       EARLIER, which is precisely the assumption a liveness clause
      //       must not make. Its subject panel is spawned by this check and
      //       used by nothing after it, so closing it here — after the undo
      //       has been read — is a real kill inside this check's own window
      //       and costs no other fixture.
      {
        const subject = await spawnAt(repo)
        // The baseline, not merely the session: captureBaseline is
        // fire-and-forget on top of the spawn (a spawn must never wait on a
        // git process), so the inspector's review button is present-but-
        // useless for a moment after the panel appears, and openReview
        // returns early on a null baseline — a node that never gets minted,
        // read here as a check that fails for a racing fixture rather than
        // for a defect. Check 101 above states the same two-stacked-races
        // problem in full.
        if (subject) {
          await waitUntil(async () => (await sessionMap(wc)).has(subject), 8000)
          await waitUntil(async () => wc.executeJavaScript(
            `window.canvas.review.baseline(${JSON.stringify(subject)}).then((b) => b !== null)`), 8000)
          await selectPanel(subject)
        }
        const beforeIds = await panelIds()
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('[data-inspector-action="review"]') !== null`), 5000)
        await clickShell('[data-inspector-action="review"]')
        const node = await waitUntil(async () => {
          const ids = await panelIds()
          const fresh = ids.filter((id) => !beforeIds.includes(id))
          return fresh.length === 1 ? fresh[0] : false
        }, 8000)
        // Captured with the node ON SCREEN, so `after` is compared against
        // the state the undo actually acted on rather than against a
        // snapshot from before the subject panel even spawned.
        const before = await sessionMap(wc)
        const killsBefore = killedPanelIds.length
        // __m4bUndo(), not a 'z' keydown: Cmd+Z is a main-process menu
        // accelerator and this harness has no menu — check 67's comment
        // states it in full.
        await wc.executeJavaScript(`window.__m4bUndo()`)
        const gone = typeof node === 'string'
          ? await waitUntil(async () => wc.executeJavaScript(
              `document.querySelector('[data-panel-id=' +
                 ${JSON.stringify(JSON.stringify(node))} + ']') === null`), 6000)
          : false
        await settle()
        const afterUndo = await sessionMap(wc)
        const preserved = pidsPreserved(before, afterUndo)
        // The liveness close, AFTER the undo has been read back — so the
        // negative above is about the undo alone and this is about the
        // probe.
        const closedReal = typeof subject === 'string'
          ? await wc.executeJavaScript(`(() => {
              const el = document.querySelector('.rail-row[data-rail-row=' +
                ${JSON.stringify(JSON.stringify(subject))} + '] .rail-row__close')
              if (!el) return false
              el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
              return true })()`)
          : false
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.panel[data-panel-id=' +
             ${JSON.stringify(JSON.stringify(subject))} + ']') === null`), 6000)
        await settle()
        const after = await sessionMap(wc)
        const kills = killedPanelIds.slice(killsBefore)
        ok('111b undoing a review node ends no session',
          typeof node === 'string' && gone === true && preserved.ok &&
            closedReal === true && kills.includes(subject) === true &&
            kills.includes(node) === false,
          `node=${node} sessions ${before.size} -> ${after.size} changed=${JSON.stringify(preserved.changed)} kills=${JSON.stringify(kills)}`)
      }

      // 112. A selected review NODE renders no Changes section at all, and
      //      therefore no review button. The effect that feeds the section
      //      fired review:panel(selectedId) for WHATEVER was selected, and
      //      main holds no baseline for a node's own id — so the engine
      //      answered `never-started`, buildReviewFields returned
      //      `hidden: false`, and the pane rendered the note "this panel has
      //      no session yet" under a heading for a panel that will never have
      //      a session, above an "Open review" button whose handler refuses a
      //      review node as a subject and returns immediately. A control that
      //      can never do anything is worse than an absent one: it is a
      //      promise the app cannot keep, and the note beside it is a
      //      confidently wrong sentence about what the selected thing IS.
      //
      //      THE NON-VACUITY CLAUSE IS THE WHOLE REASON THIS CAN FAIL
      //      HONESTLY. Both assertions are negatives, and the inspector's
      //      EMPTY state — exactly what a selection that never landed
      //      produces — satisfies both of them completely. So the read also
      //      demands the node's own `reviews` field, which only
      //      buildInspectorModel's review arm emits, in the SAME read.
      //
      //      It is selected through the RAIL ROW rather than by clicking the
      //      node, because goToPanel centres before it selects: this block
      //      has panned the camera several times by now, and where
      //      cascadeCentre put the node relative to it is not something this
      //      check should have to know. Check 108 already pins that the row
      //      frames and selects.
      {
        const subject = await spawnAt(repo)
        if (subject) {
          await waitUntil(async () => (await sessionMap(wc)).has(subject), 8000)
          // The baseline, not merely the session — check 111b's comment
          // states the two-stacked-races problem in full: openReview returns
          // early on a null baseline, so a racing fixture would mint no node
          // and this check would fail for the fixture rather than the defect.
          await waitUntil(async () => wc.executeJavaScript(
            `window.canvas.review.baseline(${JSON.stringify(subject)}).then((b) => b !== null)`), 8000)
          await selectPanel(subject)
        }
        const beforeIds = await panelIds()
        // 15s, not 5s: the button appears once review:panel has ANSWERED, and
        // that is a git call — under the full chain, with the panels suite
        // last on a loaded machine, it took longer than 5s three runs out of
        // four (M59's diagnostic below saw the button null at 5s and present
        // a moment later). The same rule check 113 records for its own wait.
        const armed = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('[data-inspector-action="review"]') !== null`), 15000)
        // Diagnostic (M59): the button's own state before the click, and what
        // appeared after it, so a failure names its cause.
        const reviewButtonState = await wc.executeJavaScript(`(() => {
          const b = document.querySelector('[data-inspector-action="review"]')
          return b ? { disabled: b.disabled, title: b.getAttribute('title') } : null })()`)
        // Clicked INSIDE the wait, and re-clicked while nothing has been minted:
        // the Changes section re-asks review:panel while a baseline lands, and
        // each re-ask unmounts the section (and this button) for a round trip,
        // so a single click can land on nothing (M78's chain, twice in a row).
        let lastFresh = []
        let clicks = 0
        let lastClickAt = 0
        const nodeId = armed
          ? await waitUntil(async () => {
              const ids = await panelIds()
              const fresh = ids.filter((id) => !beforeIds.includes(id))
              lastFresh = fresh
              if (fresh.length === 1) return fresh[0]
              // One click per 1.5 s: two clicks landing on two answered invokes would mint two nodes.
              if (clicks < 6 && Date.now() - lastClickAt > 1500) {
                const clickable = await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-inspector-action="review"]'); return !!b && !b.disabled })()`)
                if (clickable) { clicks += 1; lastClickAt = Date.now(); await clickShell('[data-inspector-action="review"]') }
              }
              return false
            }, 12000, 400)
          : false
        // Guarded rather than built bare: an absent row would make this a
        // TypeError, which ends the whole script and takes every later
        // check's result with it.
        const selected = typeof nodeId === 'string'
          ? await wc.executeJavaScript(`(() => {
              const el = document.querySelector('.rail-row[data-rail-row=' +
                ${JSON.stringify(JSON.stringify(nodeId))} + '] .rail-row__main')
              if (!el) return false
              el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
              return true })()`)
          : false
        await settle()
        const pane = await wc.executeJavaScript(`(() => ({
          reviews: document.querySelector('[data-inspector-field="reviews"]') !== null,
          reviewButton: document.querySelector('[data-inspector-action="review"]') !== null,
          note: document.querySelector('[data-review-note]') !== null
        }))()`)
        ok('112 a selected review node gets no Changes section and no dead review button',
          typeof nodeId === 'string' && selected === true && pane !== null &&
            pane.reviews === true && pane.reviewButton === false && pane.note === false,
          `node=${nodeId} selected=${selected} pane=${JSON.stringify(pane)} button=${JSON.stringify(reviewButtonState)} fresh=${JSON.stringify(lastFresh)}`)
      }

      // 113-115. THE WRITE VERB, END TO END: a real repository, a real agent
      //          writing through a real PTY, a real node, and a real commit
      //          read back out of `git log`. Everything in verify:review is
      //          argued against a fake runner or against a repository no
      //          renderer ever saw; nothing above this line can tell whether
      //          the control, the input and the baseline advance are wired to
      //          each other at all.
      //
      //          Its own repository, deliberately. By check 112 the `repo`
      //          fixture's subject panel has been closed (110) and its node
      //          closed and undone (111/111b), so reusing it would make these
      //          checks depend on the exact end state of five earlier ones.
      const crepo = mkdtempSync(join(tmpdir(), 'tc panels commit '))
      const cgit = (...args) => execFileSync('git', ['-C', crepo, ...args], { encoding: 'utf8' })
      cgit('init', '-q', '.')
      cgit('config', 'user.email', 'v@example.com')
      cgit('config', 'user.name', 'v')
      writeFileSync(join(crepo, 'seed.txt'), 'seed\n')
      cgit('add', '-A')
      cgit('commit', '-qm', 'init')
      const headCount = () => cgit('rev-list', '--count', 'HEAD').trim()

      const subject = await spawnAt(crepo)
      // The same two stacked races checks 99 and 101 guard, for the same two
      // reasons: a panel's PTY does not exist until lazy spawn creates it, and
      // captureBaseline is fire-and-forget ON TOP of that — so sessionMap
      // alone cannot see a baseline that has not landed yet.
      if (subject) await waitUntil(async () => (await sessionMap(wc)).has(subject), 8000)
      if (subject) ptyManager.write(subject, "printf 'agent\\n' > work.txt\n")
      if (subject) {
        await waitUntil(async () => {
          const kind = await wc.executeJavaScript(
            `window.canvas.review.panel(${JSON.stringify(subject)}).then((r) => r.kind)`)
          return kind === 'changes' ? kind : false
        }, 10000)
      }
      // 'rcommit' rather than the brief's literal 'r91': by this point in the
      // run, check 106's own real "Open review" gesture has already minted a
      // node id of exactly 'r91' through nextIdRef against the checks 99-112
      // fixture repository, and that node is never closed. seedReviewNode
      // APPENDS to the saved panel array rather than replacing, so a second
      // entry sharing that id is a genuine duplicate-id collision — the one
      // parseLayout's own comment calls "the one failure with no visible
      // symptom" — and React silently renders the FIRST 'r91' (subject: the
      // OTHER repository) under the second one's DOM position, which is why
      // this looked like a false 'shared' verdict rather than a missing
      // element. 'rcommit' does not match nextIdRef's own `^[nr](\d+)$`
      // reseed regex, so no future mint in this run can ever collide with it.
      const cnode = subject ? await seedReviewNode(subject, 'rcommit') : null
      // seedReviewNode parks every node 60,000 world units off screen — check
      // 104's own comment records that the camera it writes into layout.json
      // never actually takes effect on the reload that follows, because the
      // restore.camera preference defaults off, so the node comes back at
      // DEFAULT_CAMERA rather than at the position seedReviewNode requested.
      // Every earlier check that touches a seeded node's OWN controls reaches
      // them by framing it first, through the same rail-row click check 108
      // drives (goToPanel -> centreOn) — never by trusting the node to
      // already be on screen. This suite's own typeCommit does a REAL
      // sendInputEvent click at the button's real screen coordinates, so
      // without this the button sits 60,000px off the window and the click
      // lands on nothing.
      const clickRailRow = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-rail-row=${JSON.stringify(id)}] .rail-row__main')
        if (!el) return false
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)
      if (cnode) { await clickRailRow('rcommit'); await settle() }

      // Both captured for check 124, which comes back to this node from
      // inside the M11 block, hundreds of lines below.
      //
      // The workspace id, because a review node exists in the DOM only while
      // the workspace holding it is the active one, and the M11 block creates
      // and switches workspaces before 124 runs — so 124 has to switch back
      // by id rather than hope.
      //
      // The peer id, because check 115 spawns a panel into this same
      // repository to reach the `shared` arm, and `shared` DISABLES the
      // commit control: no draft can be opened at all while that peer holds a
      // baseline, so 124 closes it first.
      const commitWorkspaceId = await activeWorkspaceId(wc)
      let commitPeer = null

      /* Drives the node's OWN control and OWN input, never window.canvas.
         review.commit from executeJavaScript: the disabled gate, the Enter
         handler and the baseline advance are the three things this milestone
         added, and an invoke driven by hand exercises none of them.

         The click is a real sendInputEvent for check 75c's reason. The typing
         is the native value setter plus an `input` event, which is what React
         listens for — assigning .value alone updates the DOM and leaves
         React's state untouched, so the commit would go out with an empty
         message and the check would fail for a reason that has nothing to do
         with the code under test. */
      const typeCommit = async (nodeId, message, finishKey) => {
        const box = await wc.executeJavaScript(`(() => {
          const b = document.querySelector('.review-node[data-panel-id="${nodeId}"] [data-review-node-commit]')
          if (!b || b.disabled) return null
          const r = b.getBoundingClientRect()
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (!box) return false
        wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        const opened = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="${nodeId}"] [data-review-node-commit-input]') !== null`),
        3000)
        if (opened !== true) return false
        return wc.executeJavaScript(`(() => {
          const el = document.querySelector('.review-node[data-panel-id="${nodeId}"] [data-review-node-commit-input]')
          if (!el) return false
          const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          set.call(el, ${JSON.stringify(message)})
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new KeyboardEvent('keydown',
            { key: ${JSON.stringify(finishKey)}, bubbles: true }))
          return true })()`)
      }

      // 113. THE HEADLINE. Three clauses in one read, and each alone passes
      //      against a different real bug: HEAD advancing is satisfied by a
      //      commit containing the wrong paths; the committed path being
      //      right is satisfied by a node that never advanced its baseline
      //      and will re-commit the same content on the next press; and the
      //      node reading `clean` is satisfied by a node that lost its result
      //      entirely and renders nothing.
      {
        const before = headCount()
        const typed = cnode ? await typeCommit('rcommit', 'agent work', 'Enter') : false
        // Waits on the node's own summary rather than sleeping: a pre-commit
        // hook is legitimately slow, and a fixed sleep here is a flake on a
        // loaded machine rather than a bound on anything.
        const clean = typed === true
          ? await waitUntil(async () => {
              const text = await wc.executeJavaScript(
                `((document.querySelector('.review-node[data-panel-id="rcommit"] [data-review-node-summary]') || {}).textContent) || ''`)
              return /no changes|clean/i.test(text) ? text : false
            }, 15000)
          : false
        const after = headCount()
        const committed = Number(after) > Number(before)
          ? cgit('show', '--stat', '--name-only', '--format=', 'HEAD')
          : ''
        // A FOURTH clause, and the only one about what the commit does NOT
        // contain: `seed.txt` is sitting in this repository untouched, and a
        // commit built from an unseeded scratch index would carry it as a
        // deletion — the outcome buildReadTreeArgs' own comment calls the
        // worst this milestone can produce. The three clauses above are all
        // satisfied by exactly that commit.
        ok('113 a review node\'s files become a real commit, and the node then reads clean',
          typed === true && Number(after) === Number(before) + 1 &&
            committed.includes('work.txt') && !committed.includes('seed.txt') &&
            typeof clean === 'string',
          `before=${before} after=${after} committed=${JSON.stringify(committed)} clean=${clean}`)
      }

      // discard.1 (M53). THE OTHER WRITE VERB, end to end, against the same
      //   repository and node 113 just committed through — which now reads
      //   clean against a baseline onCommitted advanced. Two files written
      //   from the harness (the baseline is the node's, so anything written
      //   now is a change): one tracked and modified, one brand new. Each is
      //   discarded through the ROW's own control and confirm, never through
      //   window.canvas.review.discard by hand — the arming, the sentence and
      //   the re-read are the three things this milestone adds. Read back
      //   off DISK and out of `git status`, never off the node: a node that
      //   says "no changes" is satisfied by a node that lost its result.
      //   `--porcelain` empty at the end is also the index clause — a discard
      //   that wrote the index (`--staged`, or `git rm`) would leave a staged
      //   deletion or a phantom entry behind.
      {
        const modified = join(crepo, 'seed.txt')
        const fresh = join(crepo, 'brand-new.txt')
        writeFileSync(modified, 'changed by hand\n')
        writeFileSync(fresh, 'new\n')
        const q = (sel) => `document.querySelector('.review-node[data-panel-id="rcommit"] ${sel}')`
        const press = (sel) => wc.executeJavaScript(`(() => {
          const el = ${q(sel)}
          if (!el || el.disabled) return false
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
          return true })()`)
        const text = (sel) => wc.executeJavaScript(`((${q(sel)} || {}).textContent) || ''`)
        const rowReady = (path) => waitUntil(async () => wc.executeJavaScript(
          `(() => { const el = ${q(`[data-review-node-discard="${path}"]`)}; return el !== null && !el.disabled })()`), 8000)
        const refreshed = cnode ? await press('.review-node__refresh') : false
        const row1 = refreshed === true ? await rowReady('seed.txt') : false
        const armed1 = row1 === true ? await press('[data-review-node-discard="seed.txt"]') : false
        await settle()
        const sentence1 = armed1 === true ? await text('[data-review-node-discard-armed="seed.txt"]') : ''
        const confirmed1 = armed1 === true ? await press('[data-review-node-discard-confirm="seed.txt"]') : false
        const restored = confirmed1 === true
          ? await waitUntil(async () => readFileSync(modified, 'utf8') === 'seed\n', 8000)
          : false
        const outcome1 = await text('[data-review-node-commit-outcome]')
        const row2 = restored === true ? await rowReady('brand-new.txt') : false
        const armed2 = row2 === true ? await press('[data-review-node-discard="brand-new.txt"]') : false
        await settle()
        const sentence2 = armed2 === true ? await text('[data-review-node-discard-armed="brand-new.txt"]') : ''
        const confirmed2 = armed2 === true ? await press('[data-review-node-discard-confirm="brand-new.txt"]') : false
        const gone = confirmed2 === true ? await waitUntil(async () => !existsSync(fresh), 8000) : false
        const clean = gone === true
          ? await waitUntil(async () => {
              const t = await text('[data-review-node-summary]')
              return /no changes|clean/i.test(t) ? t : false
            }, 8000)
          : false
        const status = cgit('status', '--porcelain').trim()
        ok('discard.1 a modified file is restored and a new one deleted through the row\'s own confirm, the index untouched, and the node re-reads clean',
          restored === true && /^Restore seed\.txt .*cannot be undone/.test(sentence1) &&
            gone === true && /did not exist at spawn/.test(sentence2) &&
            typeof clean === 'string' && status === '',
          JSON.stringify({ refreshed, row1, armed1, sentence1, confirmed1, restored, outcome1, row2, sentence2, gone, clean, status }))
      }

      // 114. Escape cancels, and NOTHING is committed — read back out of
      //      `git log` rather than off the overlay, the rule check 50 already
      //      states for the palette's confirm: a cancel that cancels
      //      unconditionally is invisible, and so is one that does not. It
      //      needs new work to have something to cancel, since 113 left the
      //      node clean.
      {
        if (subject) ptyManager.write(subject, "printf 'more\\n' > second.txt\n")
        await settle()
        const armed = await waitUntil(async () => wc.executeJavaScript(
          `(() => { const b = document.querySelector('.review-node[data-panel-id="rcommit"] [data-review-node-commit]')
                    return b !== null && !b.disabled })()`), 15000)
        const before = headCount()
        const typed = armed === true ? await typeCommit('rcommit', 'should not land', 'Escape') : false
        await settle()
        const gone = await wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="rcommit"] [data-review-node-commit-input]') === null`)
        ok('114 Escape closes the message and commits nothing',
          typed === true && gone === true && headCount() === before,
          `armed=${armed} before=${before} after=${headCount()}`)
      }

      // 115. The BLOCKED arm, reached honestly rather than by a fixture flag:
      //      a second panel spawned into the same repository makes the node
      //      read `shared`. Present AND disabled asserted in ONE condition,
      //      because asserting only `disabled` passes against a control that
      //      is missing entirely — which is the very failure verify:palette
      //      31's rule is about — and asserting only presence passes against
      //      one that would happily commit another agent's work.
      {
        const peer = await spawnAt(crepo)
        commitPeer = peer // check 124 closes it again; see its declaration
        if (peer) {
          await waitUntil(async () => (await sessionMap(wc)).has(peer), 8000)
          await waitUntil(async () => {
            const kind = await wc.executeJavaScript(
              `window.canvas.review.panel(${JSON.stringify(peer)}).then((r) => r.kind)`)
            return kind !== 'never-started' ? kind : false
          }, 10000)
        }
        // The node re-reads on its own only when its subject goes idle, which
        // may already have happened — so the refresh control is what makes
        // this deterministic rather than a race against an agent's timing.
        await wc.executeJavaScript(`(() => {
          const b = document.querySelector('.review-node[data-panel-id="rcommit"] .review-node__refresh')
          if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        const state = await waitUntil(async () => {
          const s = await wc.executeJavaScript(`(() => {
            const n = document.querySelector('.review-node[data-panel-id="rcommit"]')
            if (!n) return null
            const b = n.querySelector('[data-review-node-commit]')
            return {
              note: (n.querySelector('[data-review-node-note]') || {}).textContent || '',
              present: b !== null,
              disabled: b !== null && b.disabled === true
            } })()`)
          return s && /share|attribut/i.test(s.note) ? s : false
        }, 15000)
        ok('115 a shared checkout leaves the commit control present and disabled',
          state !== false && state.present === true && state.disabled === true,
          JSON.stringify(state))
      }

      // 116-117. M12: THE TWO CONSUMERS, END TO END. A live cwd does not
      //          exist on the direct backend at all — pollLive's own comment
      //          says so, backend.list() answers null there — so both checks
      //          need tmux and are gated the same way check 91/107 are:
      //          findTmux() plus the tmuxBackend this run may or may not have
      //          built, a loud SKIP naming both checks rather than a silent
      //          one, and the gate BEFORE anything is spawned or seeded so a
      //          skip leaves no half-built fixture behind for whatever the
      //          next task appends.
      const TMUX_116 = findTmux()
      if (!TMUX_116 || !state.tmuxBackend) {
        ok('116-117 the panel\'s live cwd, and prompts read from it (SKIPPED — no tmux binary found)',
          true, 'install tmux to cover this')
      } else {
        state.backend = state.tmuxBackend
        // No top-level `clickPanel(id)` helper exists in this file — the same
        // fact check 75c's comment records about `clickPanelBody`. Narrowed
        // locally to a real click on a panel's body: onFocusPanel is what a
        // body click reaches (TerminalPanel.tsx), and it both SELECTS (which
        // the inspector's fields follow) and FOCUSES (which is what the
        // palette captures on open, rule 2 of "who owns the keyboard") in one
        // gesture — exactly what both checks below need.
        const clickPanel = (id) => clickPanelBody(`[data-panel-id="${id}"] .panel__slot`)

        // 116. THE DISPLAY HALF, in a real renderer. verify:rail 61 proves the
        //      model carries both rows; nothing between that builder and a
        //      painted pane is covered by it — the hook could be reading the
        //      wrong id, the subscription could be missing, the store could be
        //      empty. This is success criterion 1, and the SPAWN clause is half
        //      of it: a merged implementation shows the new directory and looks
        //      completely correct, which is the whole reason the pane keeps
        //      both.
        {
          const home = tmpdir()
          const id = await spawnAt(home)
          if (!id) throw new Error('116: spawnAt produced no panel')
          // The PTY must exist before the write, or `cd` lands on nothing and
          // the panel stays where it started — check 99's trap, and it looks
          // exactly like a broken feature.
          await waitUntil(async () => (await sessionMap(wc)).has(id), 8000)
          const moved = mkdtempSync(join(tmpdir(), 'tc panels cd '))
          // Quoted, not concatenated bare: every fixture directory in this
          // suite has a deliberate space in it (the tmux exitDir quoting note
          // in CLAUDE.md is the same class of bug), and an unquoted `cd` here
          // splits into extra shell words, errors, and leaves the panel
          // exactly where it started — a failure indistinguishable from a
          // broken feature that cost real time to tell apart from one.
          ptyManager.write(id, "cd '" + moved + "'\n")
          await clickPanel(id)
          // The poll is a 2s tick, so this WAITS rather than sleeping: a fixed
          // sleep here is a flake, not a bound.
          const read = await waitUntil(async () => {
            const r = await wc.executeJavaScript(`(() => {
              const f = (k) => {
                const el = document.querySelector('[data-inspector-field="' + k + '"] .inspector__value')
                return el ? el.textContent : null
              }
              return { live: f('live-cwd'), spawn: f('cwd'), running: f('live-command') }
            })()`)
            return r.live && r.live.includes('tc panels cd') ? r : false
          }, 15000)
          ok('116 the inspector shows where the panel IS, with where it started still beside it',
            read !== false && read.spawn !== null && read.spawn !== read.live &&
              read.running !== null && read.running.length > 0,
            JSON.stringify(read))
          rmSync(moved, { recursive: true, force: true })
        }

        // 117. THE CONSUMER HALF, end to end and through a real `cd`. A panel is
        //      spawned in one directory, cd's into a second that has its own
        //      .claude/commands, and the palette must list THAT project's
        //      prompts. It is the only check that proves the consumer is WIRED
        //      rather than merely present — verify:rail 61-63 stop at the model,
        //      and nothing between there and prompt:list is covered by them. The
        //      failure it catches is a row that never appears, indistinguishable
        //      from "this project has no commands", which is the same silent
        //      shape check 43 exists for.
        {
          const moved = mkdtempSync(join(tmpdir(), 'tc panels moved '))
          mkdirSync(join(moved, '.claude', 'commands'), { recursive: true })
          writeFileSync(join(moved, '.claude', 'commands', 'moved-prompt.md'), 'from the new cwd\n')
          // Both spellings, for PROMPT_DIRS' own reason above: this check's
          // whole point is a live cwd read straight from tmux, which is the
          // resolved /private/... form — the raw form is added too only so
          // the fence stays consistent with itself, not because this check
          // relies on it.
          PROMPT_DIRS.add(moved)
          PROMPT_DIRS.add(realpathSync(moved))

          const id = await spawnAt(tmpdir())
          if (!id) throw new Error('117: spawnAt produced no panel')
          await waitUntil(async () => (await sessionMap(wc)).has(id), 8000)
          // Quoted for the reason check 116's identical write is.
          ptyManager.write(id, "cd '" + moved + "'\n")
          // Focus it, so the palette CAPTURES this panel — a prompt row is aimed
          // at the captured id, and opening the palette deliberately leaves
          // focusedId alone (rule 2 of "who owns the keyboard").
          await clickPanel(id)
          // Wait for the live cwd to land BEFORE opening the palette: prompts
          // are read once per open, so an early open reads the spawn directory
          // and the check fails for a timing reason rather than a wiring one.
          await waitUntil(async () => {
            const cwd = await wc.executeJavaScript(
              `(() => { const el = document.querySelector('[data-inspector-field="live-cwd"] .inspector__value'); return el ? el.textContent : null })()`)
            return cwd !== null && cwd.includes('tc panels moved')
          }, 15000)
          await zoomTo(wc, 'k')
          const listed = await waitUntil(async () => {
            const rows = await wc.executeJavaScript(
              `[...document.querySelectorAll('.palette__row')].map((r) => r.textContent)`)
            return rows.some((t) => t.includes('moved-prompt')) ? rows : false
          }, 5000)
          ok('117 project prompts are read from where the panel IS, not where it started',
            listed !== false, JSON.stringify(listed))
          // On .palette__input, the file's own convention (lines 2528, 2583,
          // 2670, 3391, 3438, 3518) — React binds Escape's handler on the
          // overlay's root container, a DESCENDANT of document, so a
          // document-targeted dispatch never reaches it and this cleanup was
          // inert. Harmless while nothing follows but rmSync, and a real trap
          // for whoever appends a check after this one into a run with the
          // palette still open.
          await wc.executeJavaScript(`
            document.querySelector('.palette__input')
              ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            true
          `)
          rmSync(moved, { recursive: true, force: true })
        }
      }

      // ---- M11: the Cmd-held navigation grid (118-122) ----
      {
        await zoomTo(wc, '0')
        await settle()

        // Two workspaces at minimum, or a release has nowhere to go and check
        // 122 would pass vacuously against a commit that did nothing. The
        // ACTIVE one is then pinned to cell 0 — buildGrid lays the list out in
        // stored order and initialCursor seeds on the active cell, so from
        // cell 0 a single ArrowRight always lands on cell 1, which is a
        // workspace whenever two exist. Every other seat depends on how many
        // workspaces the run happens to have left behind, and from the last
        // one ArrowRight walks off the edge and stepCell correctly refuses to
        // move — a check that then reads as a broken cursor.
        await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('navgrid-b')`)
        await settle()
        const wsRows = await wc.executeJavaScript(`window.canvas.workspace.list()`)
        const firstId = wsRows[0] && wsRows[0].id
        await wc.executeJavaScript(
          `window.__m7aWorkspace().switchTo(${JSON.stringify(firstId)})`)
        await settle()
        const activeBeforeGrid = await activeWorkspaceId(wc)
        // The fixture premise rides as CLAUSES of check 118 rather than as a
        // check of its own: if it did not land where it meant to, 118's cursor
        // move is measuring the wrong grid, and a green 118 beside a red
        // fixture check would be the more confusing of the two reports.
        const fixtureOk = wsRows.length >= 2 && activeBeforeGrid === firstId

        // 118. Cmd+G reveals, an arrow moves the cursor, and the TAIL of a
        //      held chord does not re-reveal a grid the user has dismissed.
        //      The repeat clause is asserted AFTER an Escape deliberately:
        //      while the overlay is up every key is swallowed by the open
        //      branch, so a repeat pressed there leaves it open under an
        //      implementation with no `event.repeat` guard at all — the
        //      obvious placement is the one that cannot fail. Closed, the
        //      repeat stream is exactly the flicker the guard exists for.
        await pressChord(wc, 'g')
        const revealed = await gridState(wc)
        const before = revealed.cursor
        await pressArrow(wc, 'ArrowRight')
        const moved = await gridState(wc)
        await pressPlain(wc, 'Escape')
        for (let i = 0; i < 4; i++) await pressChord(wc, 'g', { repeat: true })
        const afterRepeat = await gridState(wc)
        ok(118, fixtureOk && revealed.open === true && moved.open === true
            && moved.cursor !== before && moved.cursor >= 0
            && afterRepeat.open === false,
          `fixture=${fixtureOk} (${wsRows.length} workspaces, active=${activeBeforeGrid}) ` +
          `open=${revealed.open} ${before} -> ${moved.cursor}, repeatOpen=${afterRepeat.open}`)

        // 119. Cmd+N while the grid is open spawns NOTHING. Success criterion
        //      5, and the reason navGrid.isOpen has to compose into
        //      useViewport's shouldIgnoreKeys rather than the overlay merely
        //      being painted on top. Note WHICH fact makes this check able to
        //      fail, because it is narrower than it looks: useViewport's
        //      keydown listener is on `window` too, and the press below is a
        //      window.dispatchEvent — a SAME-TARGET dispatch, which invokes
        //      every listener on that target regardless of phase, so the
        //      grid's own stopPropagation cannot help there and only the
        //      shared predicate can. A REAL keypress takes a different path
        //      (the capture-phase stopPropagation at `window` does suppress
        //      bubble-phase listeners on `window`), so this check covers the
        //      predicate rather than the whole production story.
        // This suite has no shared panel-count helper — line ~1039 defines a
        // local `panelCount` inside another block. Define one here rather than
        // reaching into that scope.
        const countPanels = () => wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
        await pressChord(wc, 'g')
        const panelsBefore = await countPanels()
        await zoomTo(wc, 'n')
        await settle()
        const panelsAfter = await countPanels()
        ok(119, panelsAfter === panelsBefore, `${panelsBefore} -> ${panelsAfter}`)

        // 120. Escape commits NOTHING, read back out of workspace.list()
        //      rather than off the overlay — check 50's rule for the palette's
        //      confirm, that a cancel which cancels unconditionally is
        //      invisible and so is one that does not. The arrow first is what
        //      makes it a cancel rather than a no-op: the cursor is on a
        //      DIFFERENT workspace when Escape lands.
        await pressArrow(wc, 'ArrowRight')
        const escapeTarget = await gridState(wc)
        await pressPlain(wc, 'Escape')
        await settle()
        const afterEscape = await gridState(wc)
        const activeAfterEscape = await activeWorkspaceId(wc)
        ok(120, afterEscape.open === false && escapeTarget.cursor > 0
            && activeAfterEscape === activeBeforeGrid,
          `cursor=${escapeTarget.cursor} open=${afterEscape.open} active=${activeAfterEscape} (was ${activeBeforeGrid})`)

        // 121. A window blur DISMISSES and commits nothing. This is success
        //      criterion 4 and it is not a formality: Cmd+Tab delivers the
        //      keyup for Cmd to the OTHER application, so a keyup-only design
        //      leaves the overlay up over a canvas whose shortcuts have stood
        //      down, with no key left that dismisses it and no recovery short
        //      of Cmd+R. The cursor is moved off the active cell first, so the
        //      "commits nothing" half is a claim about the handler rather than
        //      about the already-active guard one layer down.
        await pressChord(wc, 'g')
        await pressArrow(wc, 'ArrowRight')
        const beforeBlur = await gridState(wc)
        await wc.executeJavaScript(`window.dispatchEvent(new Event('blur')), true`)
        await settle()
        const afterBlur = await gridState(wc)
        const activeAfterBlur = await activeWorkspaceId(wc)
        ok(121, beforeBlur.open === true && beforeBlur.cursor > 0
            && afterBlur.open === false && activeAfterBlur === activeBeforeGrid,
          `open ${beforeBlur.open} -> ${afterBlur.open}, active=${activeAfterBlur}`)

        // 122. Release SWITCHES, and every pid is PRESERVED. The pid clause is
        //      the whole check, on check 64's argument: a dispose-and-respawn
        //      satisfies every count, every layout read and the file on disk,
        //      and only the pid separates it from the demote this milestone
        //      requires. pty:list is main's GLOBAL session list, so it spans
        //      the workspace being left as well as the one being entered.
        //      Success criterion 3.
        const pidsBefore = await settledSessionMap(wc)
        await pressChord(wc, 'g')
        await pressArrow(wc, 'ArrowRight')
        const target = await gridState(wc)
        await releaseMeta(wc)
        await settle()
        const activeAfterRelease = await activeWorkspaceId(wc)
        const closed = await gridState(wc)
        const pidsAfter = await settledSessionMap(wc)
        const pids = pidsPreserved(pidsBefore, pidsAfter)
        ok(122, closed.open === false && activeAfterRelease !== activeBeforeGrid
            && activeAfterRelease !== undefined && target.cursor > 0 && pids.ok,
          `active ${activeBeforeGrid} -> ${activeAfterRelease}; pids ${pids.changed.join(', ') || 'preserved'}`)

        // 122b. Hover MOVES the cursor and does NOT commit, and hovering an
        //       EMPTY cell moves nothing. Both clauses in one read: asserting
        //       only the move passes against a cell that also switches on
        //       mouseover, and asserting only the no-commit passes against a
        //       dead handler. The active-workspace clause is what proves
        //       nothing was committed — read back out of workspace.list(), not
        //       off the overlay.
        //
        //       It also carries the MOUSEDOWN guard, which needs panels on
        //       screen to be able to fail at all — check 122 has just landed
        //       on a freshly created and therefore empty workspace, so this
        //       switches back to the one the block started in first. That
        //       switch also re-aims the no-commit clause at activeBeforeGrid,
        //       which is the same claim read from the same place.
        await wc.executeJavaScript(
          `window.__m7aWorkspace().switchTo(${JSON.stringify(firstId)})`)
        await settle()
        await pressChord(wc, 'g')
        const hoverStart = await gridState(wc)
        const hoverable = await wc.executeJavaScript(`(() => {
          const cells = [...document.querySelectorAll('.navgrid__cell')]
          const target = cells.find((c) => !c.classList.contains('navgrid__cell--empty')
            && !c.classList.contains('navgrid__cell--cursor'))
          if (target) target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
          return !!target
        })()`)
        const hovered = await gridState(wc)
        await wc.executeJavaScript(`(() => {
          const empty = [...document.querySelectorAll('.navgrid__cell--empty')][0]
          if (empty) empty.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
          return true
        })()`)
        const afterEmptyHover = await gridState(wc)
        // A CLICK on the overlay must reach nothing underneath it. .navgrid is
        // a child of .canvas, whose onMouseDown hit-tests the click's WORLD
        // point and hands it to onSelectPanel — select, raise, clear-dormant,
        // registry.wake — so an unguarded mousedown on a cell spawns an agent
        // behind an opaque overlay. The rule "The palette swallows its own
        // mousedowns" already states, and verify:panels 41 already pins, for
        // the same overlay in the same parent.
        //
        // The coordinates are what make this able to fail: they are a real
        // panel's own screen centre, so an unguarded click has something to
        // hit. A bare `new MouseEvent('mousedown', { bubbles: true })` is at
        // client 0,0 — a world point with no panel under it — where the
        // background path only re-clears an already-null selection and the
        // clause is green against a missing guard. The aim is an UNSELECTED
        // panel for the same reason: clicking the one already selected changes
        // nothing observable either.
        //
        // What is asserted is that the selection did not MOVE, not that it did
        // not move to the panel aimed at. Those are different claims and the
        // second one does not discriminate: panels overlap, hitTest answers
        // with the top of the z-order at that point, so the first draft of
        // this clause aimed at n22 and watched the unguarded build select n97
        // — a wrong panel woken, and a green check.
        const selectedBeforeClick = await wc.executeJavaScript(
          `(document.querySelector('.panel--selected') || {}).dataset?.panelId ?? null`)
        const clickProbe = await wc.executeJavaScript(`(() => {
          const cell = document.querySelector('.navgrid__cell')
          const panel = [...document.querySelectorAll('.panel')]
            .find((p) => !p.classList.contains('panel--selected'))
          if (!cell || !panel) return null
          const box = panel.getBoundingClientRect()
          cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true,
            clientX: Math.round(box.left + box.width / 2),
            clientY: Math.round(box.top + box.height / 2) }))
          return { target: panel.dataset.panelId }
        })()`)
        const afterClick = await gridState(wc)
        const selectedAfterClick = await wc.executeJavaScript(
          `(document.querySelector('.panel--selected') || {}).dataset?.panelId ?? null`)
        const activeAfterHover = await activeWorkspaceId(wc)
        ok('122b', hoverable === true && hovered.cursor !== hoverStart.cursor
            && afterEmptyHover.cursor === hovered.cursor
            && clickProbe !== null && afterClick.open === true
            && selectedAfterClick === selectedBeforeClick
            && activeAfterHover === activeBeforeGrid,
          `${hoverStart.cursor} -> ${hovered.cursor}, empty left it ${afterEmptyHover.cursor}, ` +
          `click aimed at ${clickProbe && clickProbe.target} left open=${afterClick.open} ` +
          `selected ${selectedBeforeClick} -> ${selectedAfterClick}, active=${activeAfterHover}`)

        // 122c. A wheel over the open grid moves NO camera. shouldYieldWheel's
        //       rule 0. Asserted as the camera being unmoved rather than as
        //       cancellation, because unlike the palette (check 47) and the
        //       review node (105) there is nothing here that scrolls — the
        //       grid yields the gesture by standing the camera down, not by
        //       handing it to a scroll host. A ctrlKey wheel is deliberately
        //       the fixture: it is the one gesture rule 2 would otherwise
        //       claim outright for the camera.
        const scaleBefore = await wc.executeJavaScript(`window.__m4aScale()`)
        await wc.executeJavaScript(`(() => {
          const host = document.querySelector('.canvas')
          host.dispatchEvent(new WheelEvent('wheel',
            { deltaY: 240, ctrlKey: true, bubbles: true, cancelable: true }))
          return true
        })()`)
        await settle()
        const scaleAfter = await wc.executeJavaScript(`window.__m4aScale()`)
        ok('122c', scaleAfter === scaleBefore, `${scaleBefore} -> ${scaleAfter}`)

        await pressPlain(wc, 'Escape')
        await settle()

        // 123. Cmd+Z is INERT while the grid is up, and still undoes once it
        //      is dismissed. Check 37's shape aimed at the second overlay,
        //      and it covers the one keyboard path the grid CANNOT reach on
        //      its own: edit:undo is a main-process MENU accelerator
        //      delivered as an IPC event, so it passes through no renderer
        //      keydown at all — neither the grid's capture-phase
        //      stopPropagation nor useViewport's shouldIgnoreKeys is anywhere
        //      near it, and until M11's fix wave all four edit:* guards read
        //      palette.isOpen() alone. Unguarded, Cmd+Z runs applyHistory,
        //      which removes a panel and calls registry.dispose — killing a
        //      running agent behind an OPAQUE overlay revealed by a chord the
        //      user is still holding Cmd for, with nothing on screen changing
        //      to say so, and the switch on release then carries the evidence
        //      away. Strictly worse than the paste check 35 covers, for the
        //      same reason check 37 says so about the palette.
        {
          const ids = () => wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          // A KNOWN entry on the history stack rather than whatever the
          // preceding checks happened to leave there — check 37's rule: an
          // undo with nothing to undo passes without testing anything. The
          // spawn is before the reveal on purpose, since check 119 has just
          // pinned that a Cmd+N inside the grid spawns nothing at all.
          const before = new Set(await ids())
          await zoomTo(wc, 'n')
          const spawned = await waitUntil(async () => {
            const now = await ids()
            return now.length > before.size ? now : false
          }, 5000)
          const newId = spawned ? spawned.find((id) => !before.has(id)) : undefined

          await pressChord(wc, 'g')
          const gridUp = await gridState(wc)
          wc.send('edit:undo')
          await sleep(400) // nothing to wait FOR: the assertion is that nothing happens
          const survived = newId !== undefined && (await ids()).includes(newId)

          // The half that stops this passing vacuously, check 37's own: with
          // the grid CLOSED the very same event must still undo the spawn. If
          // it does not, the guard above is not standing down — it is broken,
          // or edit:undo never reached this renderer in the first place.
          await pressPlain(wc, 'Escape')
          await waitUntil(async () => (await gridState(wc)).open === false, 3000)
          wc.send('edit:undo')
          const undone = newId !== undefined &&
            Boolean(await waitUntil(async () => !(await ids()).includes(newId), 5000))

          ok(123, gridUp.open === true && survived && undone,
            `gridOpen=${gridUp.open} newId=${newId} survived=${survived} undoneAfterClose=${undone}`)
        }

        // 124. Cmd+G typed into a review node's OPEN COMMIT DRAFT reveals
        //      nothing, and the SAME chord aimed one element away still does.
        //      That commit input is the second surface in this app that takes
        //      DOM focus off xterm, and it defends itself by
        //      stopPropagation-ing every key in the BUBBLE phase — enough for
        //      usePalette and useViewport, both bubble-phase on `window`, and
        //      useless against useNavGrid, which is capture-phase on `window`
        //      and has already run. Unguarded, the grid reveals over the
        //      node, every further keystroke is swallowed by the open
        //      branch's `default:` arm so the field goes dead, and releasing
        //      Cmd switches workspace and unmounts the node with the typed
        //      message unsaved.
        //
        //      The second clause is what makes this a claim about SCOPE
        //      rather than about elements: the same chord dispatched on the
        //      node's own summary, with the draft still open, must reveal the
        //      grid — so a guard that bailed for any element target, or for
        //      the whole review node, fails here while the first clause alone
        //      would report it as correct.
        {
          await wc.executeJavaScript(
            `window.__m7aWorkspace().switchTo(${JSON.stringify(commitWorkspaceId)})`)
          await settle()
          const sel = '.review-node[data-panel-id="rcommit"]'
          // Un-share first. Check 115 left a peer panel in this node's
          // repository, and the `shared` arm renders the commit control
          // DISABLED — so there is no draft to open until that peer's
          // baseline is gone. Closed through the rail's own close control
          // (shellControl runs on click, not mousedown), which is a real
          // gesture rather than a reach into the registry.
          const closedPeer = commitPeer === null ? false : await wc.executeJavaScript(`(() => {
            const el = document.querySelector('[data-rail-row=${JSON.stringify(commitPeer)}] .rail-row__close')
            if (!el) return false
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            return true })()`)
          await settle()
          // The node re-reads on its own only when its subject goes idle,
          // which may already have happened — so its refresh control is
          // driven on every poll, the same determinism check 115 buys the
          // same way. Polled rather than pressed once because the peer's
          // dropBaseline and this re-read are two independent round trips.
          const armed = closedPeer !== true ? false : await waitUntil(async () => {
            await wc.executeJavaScript(`(() => {
              const b = document.querySelector('${sel} .review-node__refresh')
              if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
              return true })()`)
            return wc.executeJavaScript(`(() => {
              const b = document.querySelector('${sel} [data-review-node-commit]')
              return b !== null && b.disabled === false })()`)
          }, 20000, 1000)

          const pressed = armed === true && await wc.executeJavaScript(`(() => {
            const b = document.querySelector('${sel} [data-review-node-commit]')
            if (!b || b.disabled) return false
            b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
            return true })()`) === true
          const draftOpen = pressed && await waitUntil(() => wc.executeJavaScript(
            `document.querySelector('${sel} [data-review-node-commit-input]') !== null`), 3000) === true

          // Dispatched ON the input, with bubbles, so the capture phase runs
          // window -> ... -> input and useNavGrid sees the input as
          // event.target — which is the only fact its guard reads. DOM focus
          // is deliberately irrelevant to it: xterm's own helper is a
          // <textarea>, so an activeElement test would disable Cmd+G over
          // every ordinary terminal panel, i.e. over the whole app.
          const chordAt = (selector) => wc.executeJavaScript(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)})
            if (!el) return false
            el.dispatchEvent(new KeyboardEvent('keydown',
              { key: 'g', metaKey: true, bubbles: true }))
            return true })()`)

          const aimedAtInput = draftOpen
            ? await chordAt(`${sel} [data-review-node-commit-input]`) : false
          await settle()
          const duringDraft = await gridState(wc)

          const aimedAtSummary = draftOpen
            ? await chordAt(`${sel} [data-review-node-summary]`) : false
          await settle()
          const elsewhere = await gridState(wc)

          await pressPlain(wc, 'Escape')          // dismiss the grid
          await settle()
          await wc.executeJavaScript(`(() => {
            const el = document.querySelector('${sel} [data-review-node-commit-input]')
            if (el) el.dispatchEvent(new KeyboardEvent('keydown',
              { key: 'Escape', bubbles: true }))
            return true })()`)                    // and then the draft
          await settle()

          ok(124, draftOpen === true && aimedAtInput === true
              && duringDraft.open === false
              && aimedAtSummary === true && elsewhere.open === true,
            `closedPeer=${closedPeer} armed=${armed} draftOpen=${draftOpen} ` +
            `inDraft=${duringDraft.open} elsewhere=${elsewhere.open}`)
        }
      }

    // -----------------------------------------------------------------------
    // M13. Links between panels, end to end. `link`, never `edge` — see
    // panels.ts. Everything below runs on its OWN panels, seeded here, because
    // by this point in the run earlier blocks have closed panels, deleted
    // workspaces and switched canvases several times.
    {
      const LINK_A = 'linkA'
      const LINK_B = 'linkB'
      const LINK_DORMANT = 'link-dormant'

      // Seeded through the layout file and a reload — the route checks 39 and
      // 84 already use — rather than through spawns, because check 126 needs a
      // panel that has GENUINELY never been promoted, and the only way to get
      // one is a panel restored from disk that no camera has ever framed.
      //
      // A and B are placed 260 world units apart, which is what lets a rail
      // click on one leave the OTHER on screen: .canvas is ~700px wide here,
      // so framing A puts B's centre ~260px right of centre, comfortably
      // inside. An earlier draft parked them 600 apart and check 125 failed
      // with B's rect at x=1209 — off the window entirely, so the completing
      // click could never land. LINK_DORMANT is parked at (70000,70000):
      // distinct from check 39's (50000,50000) and check 84's (60000,60000),
      // so a stale fixture cannot be mistaken for this one.
      flushLayoutStore()
      {
        const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const ws = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
        const maxZ = ws.panels.reduce((m, p) => Math.max(m, p.z), 0)
        ws.panels.push(
          { id: LINK_A, x: -1330, y: -1200, w: 200, h: 160, z: maxZ + 1, cwd: '~', args: ['-l'] },
          { id: LINK_B, x: -1070, y: -1200, w: 200, h: 160, z: maxZ + 2, cwd: '~', args: ['-l'] },
          { id: LINK_DORMANT, x: 70000, y: 70000, w: 200, h: 160, z: maxZ + 3, cwd: '~', args: ['-l'] }
        )
        writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
        layoutStore.load()
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        await waitUntil(async () =>
          (await wc.executeJavaScript(
            `!!document.querySelector('[data-rail-row="${LINK_A}"]')`)) || false,
          6000)
        await settle()
      }

      // The inspector may be COLLAPSED: check 80 drives ⇧⌘\ and never puts it
      // back. A collapsed region still renders its controls, so the Link
      // button is FOUND but its rect is zero-sized, and a click computed from
      // that rect lands at (0,0) — which is how the first draft of this block
      // failed, with `armed=false` and no indication why.
      const ensureInspectorOpen = async () => {
        const collapsed = await wc.executeJavaScript(
          `document.querySelector('.shell').className.includes('inspector-collapsed')`)
        if (collapsed) {
          await wc.executeJavaScript(`(() => {
            const b = document.querySelector('.shell__inspector-toggle')
            if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            return true })()`)
          await settle()
        }
        return await wc.executeJavaScript(
          `!document.querySelector('.shell').className.includes('inspector-collapsed')`)
      }

      const panelBox = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-panel-id="${id}"]')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height,
                 cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
      })()`)

      const clickAt = async (x, y) => {
        wc.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
        await settle()
      }

      // Clicking a rail row is goToPanel: it FRAMES the panel and selects it
      // without waking it (check 84). That is what puts a panel under a
      // clickable coordinate, and it is also a navigation a user could
      // perform — the rail is outside .canvas, so it never resolves an armed
      // link mode itself.
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

      const linkPaths = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.link-layer [data-link]')].map((e) => e.getAttribute('data-link'))`)

      // Arms the mode through the INSPECTOR's own control, with a real
      // sendInputEvent rather than a dispatched MouseEvent — check 75c's
      // reason. Returns a DIAGNOSTIC rather than a bare boolean, so a failure
      // says which step broke instead of only `armed=false`.
      const armLinkFrom = async (id) => {
        const opened = await ensureInspectorOpen()
        const selected = await railGoTo(id)
        const box = await wc.executeJavaScript(`(() => {
          const b = document.querySelector('[data-inspector-action="link"]')
          if (!b) return null
          const r = b.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return { zero: true }
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
        })()`)
        if (box && !box.zero) await clickAt(box.x, box.y)
        const armed = await wc.executeJavaScript(`!!document.querySelector('.link-banner')`)
        return { opened, selected, box, armed }
      }

      // 125. The link is created by the REAL gesture and rendered. Asserted by
      //      the data-link key carrying BOTH ids rather than by "an svg
      //      exists", which an empty layer satisfies.
      {
        const arm = await armLinkFrom(LINK_A)
        await railGoTo(LINK_B)                       // frame B so a click can land
        const box = await panelBox(LINK_B)
        if (arm.armed && box) await clickAt(box.cx, box.cy)
        const paths = await linkPaths()
        ok('125 a link is created by the real gesture and rendered in the layer',
          arm.armed === true && box !== null &&
            paths.includes(LINK_A + ' ' + LINK_B),
          `arm=${JSON.stringify(arm)} box=${JSON.stringify(box)} paths=${JSON.stringify(paths)}`)
      }

      // 126. THE ONE WORTH KNOWING BY NUMBER. The completing click must NOT
      //      WAKE the target. A check that only asserts "a link appeared"
      //      passes against an implementation that also spawned an agent —
      //      the completing click reaching onSelectPanel is exactly the defect
      //      the capture-phase interception exists to prevent, and on a
      //      restored canvas that is one agent CLI per link the user draws.
      //
      //      It needs a GENUINELY dormant target, which is why LINK_DORMANT is
      //      restored from disk far away and reached only by a rail click —
      //      goToPanel frames without waking (check 84), so the panel is under
      //      the cursor and still dormant when the completing click lands.
      //
      //      Both clauses are required. The no-session clause alone passes
      //      against a wake that failed to spawn for an unrelated reason (over
      //      budget, off screen); the link clause alone is check 125 again.
      {
        const arm = await armLinkFrom(LINK_A)
        await railGoTo(LINK_DORMANT)
        const box = await panelBox(LINK_DORMANT)
        if (arm.armed && box) await clickAt(box.cx, box.cy)
        // SPAWNED, not "has a session". The registry mints a PanelSession for
        // every rendered panel including a dormant one — that is the whole of
        // "two lifetimes, not one" — so a check asserting the id is ABSENT
        // from __m4aSessions() fails against correct code, which is how the
        // first draft of this check failed. What a wake would produce is a
        // PROCESS, and `spawned` is the flag that says so.
        const target = (await wc.executeJavaScript(
          `(window.__m4aSessions ? window.__m4aSessions() : [])`))
          .find((x) => x.id === LINK_DORMANT)
        const paths = await linkPaths()
        ok('126 the completing click links WITHOUT waking the target',
          arm.armed === true && box !== null &&
            paths.includes(LINK_A + ' ' + LINK_DORMANT) &&
            target !== undefined && target.spawned === false && target.dormant === true,
          `arm=${JSON.stringify(arm)} target=${JSON.stringify(target)} ` +
          `paths=${JSON.stringify(paths)}`)
      }

      // 127. A click on a link still behaves exactly as a click on bare
      //      canvas. REWRITTEN in M35, and the rewrite is a strengthening
      //      rather than a relaxation.
      //
      //      It used to assert elementFromPoint at a link's midpoint returns
      //      the CANVAS — a structural read of `.link-layer { pointer-events:
      //      none }`. M35 gives each link a transparent hit stroke so it can
      //      be hovered, so that read is now false by design and says nothing
      //      about whether anything broke.
      //
      //      What the check was ALWAYS really making is the behavioural claim,
      //      and it survives the change intact: Canvas's background
      //      onMouseDown computes its hit from clientX/clientY through toWorld
      //      and hitTest, and never reads event.target — so a mousedown on the
      //      hit stroke bubbles to it and clears the selection exactly as a
      //      click on empty canvas does.
      //
      //      This is the check that fails if a stray stopPropagation ever
      //      lands on the hit path. That is the whole of what M35 traded away:
      //      the invariant moved from "nothing in this layer can be hit" (one
      //      CSS declaration, impossible to violate by accident) to "things
      //      that can be hit do not consume", which looks entirely reasonable
      //      to break in review. The failure it produces is a panel pinned
      //      live for the rest of the run with nothing on screen to explain it.
      //
      //      Driven with a REAL sendInputEvent for check 75c's reason: a
      //      dispatched MouseEvent is isTrusted:false and performs no default
      //      action, so it would pass identically against the regression.
      //
      //      NOT __m4aSelection, which is the focused terminal's TEXT
      //      selection and answers '' whatever the click did — the trap this
      //      check's own first draft fell into.
      //
      //      Fix round 1 restores the one structural fact the rewrite
      //      dropped, cheaply: `.link-layer` ITSELF still computes
      //      `pointer-events: none`. This is the one class of regression the
      //      behavioural clause alone cannot see — reverting the LAYER's own
      //      declaration to `auto` leaves the behavioural half green, because
      //      the topmost element at `mid` becomes `.link-layer__line`, which
      //      carries no handler, so the mousedown still bubbles unchanged.
      //      Every production reader of target identity is a containment
      //      test a link element already fails identically to the canvas
      //      element (there is no elementFromPoint anywhere in src/), so that
      //      specific regression is inert today — but it is still worth
      //      pinning, since "inert today" is not "inert forever". This
      //      restores the STRUCTURAL claim without restoring the part M35
      //      makes false by design (that NOTHING in the layer is hit-testable
      //      — two descendants now are, on purpose).
      //
      //      Fix round 2 (M35 final review) adds the `focusedId` clause
      //      success criterion 4 always named and this check never asserted:
      //      "a plain click on a link behaves exactly as a click on bare
      //      canvas: selection clears, focusedId clears, a marquee begins."
      //      An uncleared focusedId is the dangerous half — assignTiers pins
      //      the focused panel live UNCONDITIONALLY, so a stray link click
      //      that left it standing would hold a WebGL context and a
      //      LIVE_BUDGET slot for the rest of the run with nothing on screen
      //      wrong, the identical failure check 144 exists to catch for the
      //      marquee. `__m4aGrid()` is the app-level read rather than a DOM
      //      one, for check 144's own reason: it resolves through
      //      focusedIdRef and answers non-null only for a focusedId naming a
      //      LIVE session, where `document.activeElement.closest('.panel')`
      //      is a browser DEFAULT ACTION that stays green under exactly the
      //      regression this clause exists to catch (`setFocusedId(null)`
      //      deleted from the background handler).
      //
      //      LINK_A is still DORMANT here — check 125/126's port-driven
      //      gestures never wake it, because a port's own mousedown stops
      //      propagation before it ever reaches the background hit test that
      //      calls onSelectPanel (see PanelPorts.tsx) — so establishing a
      //      GENUINE focus needs two real clicks, not one: the first lands on
      //      the card and only WAKES it (onSelectPanel, no focus — a carded
      //      panel has no .panel__slot mousedown handler of its own to call
      //      onFocusPanel), the second lands on the now-live .panel__slot and
      //      actually focuses it. Skipping the wait between them, or reading
      //      __m4aGrid() only once, is exactly how check 144 once reported a
      //      VACUOUS "focused before=false" in a flaky run — the clause below
      //      has to observe a genuine true before it can mean anything about
      //      the false after.
      {
        await railGoTo(LINK_A)
        const boxWake = await panelBox(LINK_A)
        if (boxWake) await clickAt(boxWake.cx, boxWake.cy)
        await waitUntil(async () => !!(await wc.executeJavaScript(
          `!!document.querySelector('[data-panel-id="${LINK_A}"] .panel__slot')`)), 4000)
        const boxFocus = await panelBox(LINK_A)
        if (boxFocus) await clickAt(boxFocus.cx, boxFocus.cy)
        const focusedBefore127 = await wc.executeJavaScript(`window.__m4aGrid() !== null`)
        const mid = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.link-layer [data-link]')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
        })()`)
        const layerPointerEvents = await wc.executeJavaScript(`(() => {
          const layer = document.querySelector('.link-layer')
          return layer ? getComputedStyle(layer).pointerEvents : null
        })()`)
        // The SELECTED PANEL, read from production markup. NOT __m4aSelection,
        // which is the focused terminal's TEXT selection and answers '' here
        // whatever the click did — the wrong hook, and the first draft's bug.
        // Re-declared LOCALLY: it is not in scope from a sibling block.
        const selectedId = () => wc.executeJavaScript(`(() => {
          const el = document.querySelector('.panel--selected')
          return el ? el.getAttribute('data-panel-id') : null
        })()`)
        let before = null
        let after = null
        let focusedAfter127 = null
        if (mid) {
          before = await selectedId()
          await clickAt(mid.x, mid.y)
          after = await selectedId()
          focusedAfter127 = await wc.executeJavaScript(`window.__m4aGrid() !== null`)
        }
        ok('127 a click on a link still reaches the background handler beneath it, releases focusedId, and .link-layer itself still takes no pointer events',
          mid !== null && before !== null && after === null && layerPointerEvents === 'none' &&
            focusedBefore127 === true && focusedAfter127 === false,
          `mid=${JSON.stringify(mid)} selected ${JSON.stringify(before)} -> ${JSON.stringify(after)} ` +
          `layerPointerEvents=${JSON.stringify(layerPointerEvents)} ` +
          `focused ${focusedBefore127} -> ${focusedAfter127}`)
      }

      // 128. THE SECOND ONE WORTH KNOWING BY NUMBER. Closing the target
      //      removes the link, and ONE Cmd+Z restores the panel AND the link
      //      together.
      //
      //      The one-press clause is the whole check. An implementation that
      //      pruned the links in a SEPARATE commit satisfies "the link came
      //      back" after TWO presses and looks entirely correct in every other
      //      read — and the user's second press then undoes something else.
      {
        const key = LINK_A + ' ' + LINK_B
        const before = await linkPaths()
        const closed = await wc.executeJavaScript(`(() => {
          const btn = document.querySelector('[data-rail-row="${LINK_B}"] .rail-row__close')
          if (!btn) return false
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true })()`)
        await settle()
        const afterClose = await linkPaths()
        // __m4bUndo, not a dispatched Cmd+Z. Undo is a MAIN-PROCESS menu
        // accelerator delivered as an edit:undo IPC event, so it passes
        // through no renderer keydown at all and a dispatched KeyboardEvent
        // reaches nothing — which is why this hook exists. ONE call.
        await wc.executeJavaScript(`window.__m4bUndo(), true`)
        await settle()
        const afterUndo = await linkPaths()
        const panelBack = await wc.executeJavaScript(
          `!!document.querySelector('[data-rail-row="${LINK_B}"]')`)
        ok('128 closing a panel drops its links, and ONE Cmd+Z restores both',
          closed === true && before.includes(key) && !afterClose.includes(key) &&
            panelBack === true && afterUndo.includes(key),
          `closed=${closed} before=${JSON.stringify(before)} ` +
          `afterClose=${JSON.stringify(afterClose)} panelBack=${panelBack} ` +
          `afterUndo=${JSON.stringify(afterUndo)}`)
      }

      // 129. Links survive a real renderer reload, and are on disk. This is
      //      the persistence claim end to end: it needs the field to have been
      //      written by fromPanels, parsed by parsePanel and survived
      //      parseWorkspace's second pass, none of which a plain-node check
      //      can see together.
      {
        flushLayoutStore()
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        await settle()
        await settle()
        const paths = await linkPaths()
        const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const stored = onDisk.workspaces
          .flatMap((w) => w.panels)
          .filter((p) => Array.isArray(p.links) && p.links.length > 0)
          .map((p) => p.id + '->' + p.links.map((l) => l.to).join(','))
        ok('129 links survive a real renderer reload, and are on disk',
          stored.length > 0 && paths.length > 0,
          `stored=${JSON.stringify(stored)} rendered=${JSON.stringify(paths)}`)
      }
    }

    // -----------------------------------------------------------------------
    // M17: the cost readout end to end (138-140). Reuses spawnAt/sessionMap
    // from checks 99-101/116-117 above — this is where they live, and usage
    // accounting has no git dependency of its own; it is nested here purely
    // for the helper reuse, the same trade 116-117's own comment states.
    {
      // An assistant record as Claude Code actually writes one. The field
      // names are copied verbatim from verify-usage.cjs's own rec() helper —
      // "another program's format, not ours" — with one difference: `over`
      // sets the OUTPUT token count directly, since every check below only
      // ever varies that one figure.
      const assistantRecord = (over = {}) => JSON.stringify({
        type: 'assistant',
        cwd: '/tmp/x',
        sessionId: 's1',
        timestamp: '2026-08-30T00:00:00.000Z',
        isSidechain: false,
        message: {
          model: 'claude-opus-5',
          usage: {
            input_tokens: 2,
            output_tokens: over.output ?? 1095,
            cache_creation_input_tokens: 1491,
            cache_read_input_tokens: 120118
          }
        }
      })

      // The same PRESET_SPAWN spawnAt (above) already uses, with one field
      // added: a panel whose preset declares agent: 'claude-code' is what
      // makes PtyManager.create() mint and pin a session id at all
      // (pty-manager.ts's "Pin an agent session id" comment) — spawnAt's own
      // fixture never sets this, and every other check in this file relies on
      // it staying a plain shell, so a second, near-identical helper is the
      // smaller change.
      const spawnAgentPanel = async (cwd) => {
        const before = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        // `-c 'sleep N'`, never bare '/bin/sh' with empty args: pty-manager.ts
        // appends `--session-id <uuid>` to spec.args whenever agent is
        // 'claude-code', unconditionally — it is written for the real
        // `claude` CLI, which accepts that flag, not for a plain shell.
        // `sh --session-id <uuid>` with no `-c` treats `--session-id` as an
        // invalid OPTION and exits 2 immediately (confirmed by hand), and
        // pty-manager's own onExit handler deletes the session the instant
        // that happens — which silently kills the very pin this check exists
        // to observe, with nothing pointing at the cause. `-c 'sleep N'`
        // sidesteps this: everything appended after the `-c` command string
        // becomes ordinary POSITIONAL PARAMETERS ($0, $1, ...) that the
        // script never references, so the shell runs exactly as asked and
        // outlives the whole check.
        wc.send(IPC_EVENTS.PRESET_SPAWN,
          { cwd, command: '/bin/sh', args: ['-c', 'sleep 120'], w: 400, h: 300, agent: 'claude-code' })
        const ids = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.length > before.size ? now : false
        }, 3000)
        return ids ? ids.find((id) => !before.has(id)) : undefined
      }

      // A real rail-row click — goToPanel: frame + select, no wake — the
      // same gesture check 100's selectFromRail and M13's railGoTo already
      // use, immune to z-order the way a coordinate click aimed at a
      // cascaded spawn is not (check 100b's own recorded lesson).
      const selectPanelViaRailRow = async (id) => {
        const clicked = await wc.executeJavaScript(`(() => {
          const row = document.querySelector('[data-rail-row="${id}"] .rail-row__main')
          if (!row) return false
          row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`)
        await settle()
        return clicked
      }

      // ---------------------------------------------------------------
      // M23 — the agent knobs, end to end (ideas-backlog #8 part 1).
      // ---------------------------------------------------------------

      // Same shape as spawnAgentPanel above, with the knobs on the template.
      // The `-c 'sleep N'` trick that helper documents is what makes this work
      // at all: pty-manager appends --permission-mode/--effort/--model after
      // the -c command string, where they become ordinary positional
      // parameters the script never references, so the shell runs as asked
      // instead of exiting 2 on an option it does not know.
      let m20ChipPanel
      const spawnWithMode = async (cwd, agentOptions) => {
        const before = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        wc.send(IPC_EVENTS.PRESET_SPAWN, {
          cwd, command: '/bin/sh', args: ['-c', 'sleep 120'], w: 400, h: 300,
          agent: 'claude-code', agentOptions
        })
        const ids = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.length > before.size ? now : false
        }, 3000)
        return ids ? ids.find((id) => !before.has(id)) : undefined
      }

      // 172. A PresetTemplate carrying agentOptions reaches the spawned
      //      panel's SPEC, and the chip renders it.
      //
      //      This is the highest-value check in the milestone, and `tsc`
      //      cannot see the bug it catches: Canvas's template -> spec copy is
      //      field-by-field, so a dropped key there is legal TypeScript and
      //      silently produces a panel with no knobs — which looks exactly
      //      like a user who did not ask for any. The chip clause is what
      //      makes it end-to-end rather than a spec read: it goes through
      //      session.spec, the component, and the CSS attribute together.
      {
        const id = await spawnWithMode(usageFixtureDir, { permissionMode: 'plan' })
        const chip = id ? await wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-panel-id="${id}"] .panel__mode')
          return el ? el.getAttribute('data-permission-mode') : null
        })()`) : null
        // Read through the INSPECTOR too, not through a spec hook. __m4aSessions
        // exposes only {id, dormant, spawned} by design ("keep the set narrow"),
        // and widening it to carry a spec would be a worse trade than this:
        // the chip and the inspector row are two independent components
        // rendering the same session.spec, so both agreeing is stronger
        // evidence than one raw read of the value they share.
        const railed = id ? await selectPanelViaRailRow(id) : false
        const field = id ? await wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-inspector-field="agent-mode"] dd')
          return el ? el.textContent : null
        })()`) : null
        ok('172 a template\'s agentOptions reach the spawned panel, the chip and the pane',
          id !== undefined && chip === 'plan' && railed === true && field === 'plan',
          `id=${id} chip=${chip} railed=${railed} field=${field}`)
        // Left ALIVE deliberately, and closed at the end of 157 instead: 157
        // asserts that a panel with a chip still exists while a panel without
        // one shows none, which is what stops "no chip anywhere" passing as
        // success. Closing it here would make 157 vacuous.
        m20ChipPanel = id
      }

      // 173. A panel with NO knobs renders NO chip.
      //
      //      Asserted as the element being ABSENT rather than as empty text,
      //      because an empty-but-present chip is a visible gap in a 36px
      //      header. It is a NEGATIVE and therefore passes vacuously before
      //      the feature exists — it is a regression guard, trustworthy only
      //      now that 156 has been watched green, which is why the same read
      //      also demands 156's panel still HAS its chip: the pair in one
      //      window is what stops "no chip anywhere" passing as success.
      {
        const bare = await spawnAgentPanel(usageFixtureDir)
        const bareChip = bare ? await wc.executeJavaScript(
          `document.querySelector('[data-panel-id="${bare}"] .panel__mode') !== null`) : null
        const anyChip = await wc.executeJavaScript(
          `document.querySelectorAll('.panel__mode').length`)
        ok('173 a panel with no knobs renders no chip, while a panel with one still does',
          bare !== undefined && bareChip === false && anyChip >= 1,
          `bare=${bare} bareChip=${bareChip} chipsOnCanvas=${anyChip}`)

        // CLEAN UP AFTER OURSELVES, and this is not tidiness. These two panels
        // outlive the block otherwise, and every panel on the canvas is
        // LIVE_BUDGET pressure: check 144 clicks a panel body to take focus,
        // and a panel demoted to a card has no `.panel__slot` to click, so it
        // failed with `focused before=false` for a reason that had nothing to
        // do with marquees. Watched exactly that way. Any check appended here
        // that spawns inherits this obligation.
        if (bare) await clickPanelClose(wc, bare)
        if (m20ChipPanel) await clickPanelClose(wc, m20ChipPanel)
      }

      const usageOutputText = () => wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-usage-output]')
        return el ? el.textContent : null
      })()`)

      // 138. The number reaches the pane, end to end. The FIRST thing to
      //      exercise the pin, the tick, the reader, the store and the
      //      section together: verify:rail's own buildUsageFields checks
      //      prove the MODEL and nothing between that builder and a painted
      //      pane is covered by them — the hook could read the wrong id, the
      //      subscription could be missing, the store could be empty.
      //
      //      The transcript is SYNTHESISED by the harness and reached
      //      through the substituted deps above, never through the real
      //      ~/.claude/projects: the rule the git fence and the prompt fence
      //      both obey, since a suite must not read state this repo does not
      //      own, and on a developer's machine that directory holds their
      //      actual work.
      //
      //      It WAITS on the value rather than sleeping: a fixed sleep
      //      against a 2s poll is a flake, not a bound.
      writeFileSync(usageFixtureFile, assistantRecord({ output: 1095 }) + '\n')
      const agentId = await spawnAgentPanel(usageFixtureDir)
      // The PTY must exist before the poll can find it in this manager's own
      // session map — check 99's trap, reached through a new door.
      if (agentId) await waitUntil(async () => (await sessionMap(wc)).has(agentId), 8000)
      await selectPanelViaRailRow(agentId)
      const shown = await waitUntil(async () => {
        const text = await usageOutputText()
        return text !== null && /1,?095/.test(text) ? text : false
      }, 10000)
      ok('166 the panel\'s token total reaches the inspector',
        agentId !== undefined && shown !== false, `id=${agentId} shown=${JSON.stringify(shown)}`)

      // 139. The total GROWS as the agent works, which is what makes this a
      //      live readout rather than a one-shot read. The discriminating
      //      half: an implementation that read the file once at spawn and
      //      cached it satisfies 138 completely and is not the feature.
      appendFileSync(usageFixtureFile, assistantRecord({ output: 5 }) + '\n')
      const grown = await waitUntil(async () => {
        const text = await usageOutputText()
        return text !== null && /1,?100/.test(text) ? text : false
      }, 10000)
      ok('167 the total grows as the transcript grows', grown !== false, String(grown))

      // 140. A panel with NO pin renders NO Cost section — not an empty one,
      //      and not "$0.00". Asserted as the element being ABSENT rather
      //      than as empty text, because an empty-but-present section is a
      //      visible blank gap in a 260px pane. Deliberately weak on its
      //      own: it passes vacuously before the section exists at all, so
      //      it is only evidence once 138 has been watched red first.
      const plainId = await spawnAt(usageFixtureDir)
      await selectPanelViaRailRow(plainId)
      const state = await wc.executeJavaScript(`(() => ({
        selected: (document.querySelector('.panel--selected') || {}).dataset?.panelId,
        section: !!document.querySelector('[data-usage-section]')
      }))()`)
      ok('168 an unpinned panel renders no Cost section at all',
        state.selected === plainId && state.section === false, JSON.stringify(state))

      // 141. Final-review fix. PersistedTerminalPanel carried no `agent`
      //      field at all, and fromPanels/toPanels never mentioned one, so a
      //      restart silently dropped a restored panel's pin — pinned went
      //      false, and the Cost section vanished PERMANENTLY, even though
      //      main's PtyManager kept accumulating and sending usage:panel for
      //      a session layout.json's own record no longer named at all. This
      //      is the check that could not have passed against the unfixed
      //      schema: it proves the pin on the REAL persisted panel record,
      //      through a real save and a real reload, not merely in main's
      //      separate session-id map (checks 117-118 already cover that map
      //      and would stay green regardless of this defect).
      {
        flushLayoutStore()
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        await waitUntil(async () =>
          (await wc.executeJavaScript(
            `!!document.querySelector('[data-rail-row="${agentId}"]')`)) || false,
          8000)
        await settle()
        const clicked = await selectPanelViaRailRow(agentId)
        const section = await wc.executeJavaScript(
          `!!document.querySelector('[data-usage-section]')`)
        ok('141 a panel\'s agent pin survives a real reload, and the Cost section still renders',
          agentId !== undefined && clicked === true && section === true,
          `id=${agentId} clicked=${clicked} section=${section}`)
      }

      try { rmSync(usageFixtureDir, { recursive: true, force: true }) } catch { /* best effort */ }
    }

      // Best-effort, like the two below it and for the same reason: a throw
      // here is caught by the outer try, reports as an `infrastructure`
      // failure, and takes the other two cleanups with it on the way out.
      try { rmSync(crepo, { recursive: true, force: true }) } catch { /* best effort */ }

      // Fixture repositories are not free — a git repo per run accumulated in
      // $TMPDIR for the life of the machine. Best-effort: a failure to clean
      // up must never turn a green suite red.
      try { rmSync(repo, { recursive: true, force: true }) } catch { /* best effort */ }
      try { rmSync(notRepo, { recursive: true, force: true }) } catch { /* best effort */ }

      // ---- M20: the file tree (156-161) ------------------------------
      //
      // Nested inside this same GIT_OK block for the reason 116-117 already
      // state in their own comment: none of these six checks touch git, but
      // spawnAt/sessionMap/settle/wc are all in scope here and reusable, and
      // a second copy of that plumbing to avoid one shared `if` would be the
      // worse trade.
      //
      // Originally numbered 125-130 under this branch's own M13, which
      // collided with main's own DIFFERENT M13 — "links between panels" —
      // which independently claimed 125-129 here, and with M14's credential
      // check (130). 156 is the first number past every milestone's real
      // maximum in the merged file, re-derived directly rather than assumed.
      {
        // A directory holding one real FILE, not only sub-directories — check
        // 126 needs a leaf row to click, and every other fixture directory in
        // this suite has already been rmSync'd above by the time this block
        // runs.
        const treeDir = mkdtempSync(join(tmpdir(), 'tc panels tree '))
        writeFileSync(join(treeDir, 'note.txt'), 'hello\n')
        mkdirSync(join(treeDir, 'sub'))
        // A second, distinct directory for check 127's re-root, so "the tree
        // now shows a different root" has an unambiguous expected answer
        // rather than depending on whatever an earlier check's fixture
        // happens to still be pointed at.
        const treeDir2 = mkdtempSync(join(tmpdir(), 'tc panels tree2 '))
        writeFileSync(join(treeDir2, 'other.txt'), 'hi\n')
        // Both spellings, the same fence check 43/117's prompt reads and
        // check 91/107's ids already carry: macOS tmpdir() is
        // /var/folders/... while a resolved read can answer
        // /private/var/folders/... for the identical directory.
        const treeDir2Real = (() => { try { return realpathSync(treeDir2) } catch { return treeDir2 } })()

        const readTreeCollapsed = () => wc.executeJavaScript(
          `document.querySelector('.shell').classList.contains('shell--tree-collapsed')`)

        // A plain dispatched click, the same shape clickRail (~line 6567)
        // already uses: shellControl's onClick fires for any 'click' event
        // regardless of isTrusted, so this is exactly as good as a real one
        // for every button below that is not itself under test for stealing
        // focus — only check 126's file row needs the real thing.
        const dispatchClick = (selector) => wc.executeJavaScript(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return false
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`)

        // The real-click idiom, copied from check 75c (~line 5247) and
        // narrowed the same way, for the same stated reason: only a real
        // OS-level click moves DOM focus, so a dispatched MouseEvent cannot
        // test a control that must not take it. Copied rather than hoisted —
        // 75c's own comment argues that widening a helper a dozen checks
        // depend on is the worse trade. Returns false rather than throwing
        // when nothing matches, so a missing element is a clean FAIL in
        // whichever check called it rather than an infrastructure abort that
        // takes every later check down with it.
        const realClick = async (selector) => {
          const box = await wc.executeJavaScript(
            `(() => { const s = document.querySelector(${JSON.stringify(selector)});
                      if (!s) return null;
                      const r = s.getBoundingClientRect();
                      return { x: Math.round(r.left + r.width / 2),
                               y: Math.round(r.top + r.height / 2) } })()`)
          if (!box) return false
          wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
          wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
          await sleep(150)
          return true
        }

        // Open the column. It defaults CLOSED (files.treeOpen's schema
        // default), so every check below needs this, and check 73's own
        // collapsed measurement ran long before this block and is unaffected.
        // M46: the tree is the Files NAVIGATOR pane; its dock icon shows it.
        if (await readTreeCollapsed()) { await dispatchClick('[data-dock="files"]'); await settle() }

        // 156. The exact FOUR-column inset, tree OPEN this time — check 73's
        //      argument with a third region, complementing its collapsed
        //      measurement with this one's open measurement. Every looser
        //      bound survives the min-width:auto failure, because an element
        //      pushed out of view reports its width exactly as a visible one
        //      does, and only the IDENTITY fails — an overflowing middle cell
        //      is precisely a canvas wider than the space the other three
        //      leave it.
        {
          const m = await wc.executeJavaScript(`(() => {
            const canvas = document.querySelector('.canvas')
            const tree = document.querySelector('.shell__tree')
            const dock = document.querySelector('.shell__dock')
            const rail = document.querySelector('.shell__rail')
            const inspector = document.querySelector('.shell__inspector')
            if (!canvas || !tree || !dock || !rail || !inspector) return null
            return {
              canvasWidth: canvas.getBoundingClientRect().width,
              windowWidth: window.innerWidth,
              treeWidth: tree.getBoundingClientRect().width,
              dockWidth: dock.getBoundingClientRect().width,
              railWidth: rail.getBoundingClientRect().width,
              inspectorWidth: inspector.getBoundingClientRect().width
            }
          })()`)
          // M46: the tree is INSIDE the navigator column, so it is not a
          // fourth term — dock + navigator + context is the whole inset.
          const expected = m ? m.windowWidth - m.dockWidth - m.railWidth - m.inspectorWidth : NaN
          // The xterm clause is not tautological the way "the canvas got
          // narrower" is: a smaller canvas is a smaller cull region, and a
          // frame that quietly demoted the panel the user was looking at
          // renders a card with no error anywhere.
          const live = await wc.executeJavaScript(
            `document.querySelectorAll('.panel .xterm').length`)
          ok('156 the four-column frame insets the canvas exactly, panel still promoted',
            m !== null && Math.abs(m.canvasWidth - expected) <= 1 && m.treeWidth > 100 && live > 0,
            m ? `canvas=${m.canvasWidth} expected=${expected} tree=${m.treeWidth} xterm=${live}` : 'no frame')
        }

        // 157. THE ONE THAT MATTERS, and the only one in this milestone that
        //      cannot be written with a dispatched event.
        //
        //      A synthetic MouseEvent is isTrusted:false and Blink runs no
        //      default action for one, so it moves no DOM focus whether or
        //      not shellControl called preventDefault — a dispatched version
        //      of this check passes identically against the very regression
        //      it exists to catch. That is check 75c's recorded limit,
        //      inherited here where it matters more: for every other shell
        //      control losing focus is merely bad, and for this one it is
        //      fatal, because the click's whole job is to paste into the
        //      focused panel.
        //
        //      BOTH halves in one read. "Focus did not move" alone passes
        //      against a row wired to nothing at all; "the bytes arrived"
        //      alone passes against a row that stole focus and happened to
        //      paste anyway on the way past.
        {
          const id = await spawnAt(treeDir)
          if (id) await waitUntil(async () => (await sessionMap(wc)).has(id), 8000)
          // Retried, not dispatched once — check 40's own reason: the panel
          // is spawned by a setPanels update this tick, and .panel__slot only
          // exists once tiering has promoted it to LIVE, which is a render or
          // two later. A bare realClick here can fire before there is
          // anything to click, land on nothing, and leave focus wherever the
          // previous check left it.
          //
          // Waited on .xterm specifically, not .panel__slot: the slot div
          // itself mounts a render before attachSlot has actually appended
          // xterm's own host (and its focusable helper textarea) inside it,
          // and a real click on an empty slot moves no DOM focus at all —
          // the app-level focusedId still flips (onFocus fires regardless of
          // children), but this check reads BROWSER focus, so that race
          // reads as "focus did not move" for a reason that has nothing to
          // do with the control under test.
          const slotUp = id ? await waitUntil(() => wc.executeJavaScript(
            `document.querySelector('.panel[data-panel-id="${id}"] .xterm') !== null`),
            5000) : false
          // By this point in the suite the camera can be anywhere — a
          // hundred-odd earlier checks have panned, framed and switched
          // workspaces repeatedly — and cascadeCentre's placement is relative
          // to whatever that camera's world centre was AT SPAWN, which is not
          // necessarily where the camera is now, so a fresh spawn is not
          // reliably on screen.
          //
          // A large pan is not merely inconvenient here, it is actively
          // destructive: assignTiers re-runs on every viewport change and
          // fills LIVE_BUDGET (8) by priority, so panning far enough to bring
          // this never-focused, just-spawned panel into view can just as
          // easily walk every OTHER live panel out of the cull region and
          // this one never makes the cut — watched directly: a wheel pan
          // computed to centre this panel exactly left `.panel__slot` GONE
          // (demoted to a card) once DEMOTE_DELAY_MS's hold expired, because
          // dormancy/tiering does not know this is the panel under test.
          //
          // The fix is to PIN it live first, the same way `assignTiers`
          // itself is pinned — "assignTiers pins the focused panel live
          // unconditionally" — by dispatching a mousedown on the slot before
          // panning. TerminalPanel's own onMouseDown calls onFocus(id)
          // directly and does not care whether the event is trusted, so this
          // sets focusedId (and therefore wins the tiering budget) without
          // yet claiming to have moved DOM focus — that claim is reserved for
          // the REAL click below, which is what the check actually tests.
          if (slotUp) {
            await wc.executeJavaScript(`(() => {
              const slot = document.querySelector('.panel[data-panel-id="${id}"] .panel__slot')
              if (slot) slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
            })()`)
            await settle()
            // Now safe to pan: the panel is pinned live regardless of where
            // the camera lands. A wheel pan by the EXACT screen-pixel delta
            // between the panel's own rect and the canvas host's centre is
            // the same mechanism panBy108 already uses two thousand lines up,
            // computed rather than guessed — panBy applies its dx/dy to the
            // viewport translation directly (canvas-input.ts's
            // normalizeWheel, scale-independent since a CSS translate sits
            // outside the scale in `.world`'s transform).
            await wc.executeJavaScript(`(() => {
              const canvas = document.querySelector('.canvas')
              const slot = document.querySelector('.panel[data-panel-id="${id}"] .panel__slot')
              if (!canvas || !slot) return false
              const c = canvas.getBoundingClientRect()
              const s = slot.getBoundingClientRect()
              const dx = (c.left + c.width / 2) - (s.left + s.width / 2)
              const dy = (c.top + c.height / 2) - (s.top + s.height / 2)
              canvas.dispatchEvent(new WheelEvent('wheel', {
                bubbles: true, cancelable: true,
                clientX: c.left + c.width / 2, clientY: c.top + c.height / 2,
                deltaX: -dx, deltaY: -dy, deltaMode: 0
              }))
              return true
            })()`)
            await settle()
          }
          // The REAL click check 75c's own idiom exists for: only a real
          // OS-level click moves DOM focus into xterm's hidden textarea,
          // which is what makes `before` below a genuine baseline rather
          // than an assumption. This is what the file-row click's own
          // real-vs-synthetic distinction is measured against.
          if (slotUp) await realClick(`.panel[data-panel-id="${id}"] .panel__slot`)

          const probe = () => wc.executeJavaScript(`(() => {
            const host = document.activeElement && document.activeElement.closest('.panel')
            return { id: host ? host.getAttribute('data-panel-id') : null }
          })()`)
          // Waited, not read once: this is the SAME focus round trip check
          // 75c already needs a settle for, and reading before that lands
          // would capture whatever panel focus was left on by the check that
          // ran before this one.
          const focused = slotUp
            ? await waitUntil(async () => (await probe()).id === id ? true : false, 3000)
            : false
          const before = await probe()

          // The tree re-roots and re-reads its directory over an async IPC
          // round trip (files.list), so wait for actual file rows rather
          // than just the heading updating. Scoped to .shell__tree so a
          // false positive can only come from the tree itself, never from
          // some other part of the page that happens to reuse the class name.
          if (focused) {
            await waitUntil(() => wc.executeJavaScript(
              `document.querySelectorAll('.shell__tree .file-row [data-file-path]').length > 0`), 5000)
          }

          // The first FILE row — a directory row toggles instead of
          // inserting, and its twist glyph (▸/▾) is what tells the two apart.
          const filePath = focused ? await wc.executeJavaScript(`(() => {
            const rows = [...document.querySelectorAll('.shell__tree .file-row [data-file-path]')]
            const file = rows.find((r) => {
              const twist = r.querySelector('.file-row__twist')
              return twist !== null && twist.textContent === ''
            })
            return file ? file.getAttribute('data-file-path') : null
          })()`) : null
          const clicked = filePath
            ? await realClick(`.shell__tree [data-file-path="${filePath}"]`)
            : false
          await settle()

          const after = await probe()
          const base = filePath ? filePath.split('/').pop() : ''
          // __m4aCellToScreen reads the FOCUSED session's xterm buffer for a
          // substring — the same hook check 40 already uses to prove a paste
          // landed, rather than a made-up read into a handle shape this
          // renderer does not expose (__m4aSessions() answers only
          // {id, dormant, spawned} — see its own comment in Canvas.tsx).
          const echoed = base
            ? await waitUntil(() => wc.executeJavaScript(
                `window.__m4aCellToScreen(${JSON.stringify(base)}) !== null`), 3000)
            : false

          ok('157 a file click pastes into the focused panel and never takes focus',
            id !== undefined && focused === true && filePath !== null && clicked === true &&
              before.id === id && after.id === id && echoed === true,
            `panel=${id} slotUp=${slotUp} focused=${focused} before=${before.id} ` +
            `after=${after.id} file=${base} echoed=${echoed}`)
        }

        // 158. Re-rooting, asserted POSITIVELY in ONE DOM read pairing "which
        //      panel is selected" with "which root the heading shows" — check
        //      100b's rule, because "the old root is absent" is satisfied
        //      before React has even processed the click. It selects through
        //      the RAIL ROW rather than a coordinate click, for 100b's other
        //      reason: cascaded spawns overlap, so a click aimed at a panel's
        //      body can land on whichever panel is top of the z-order there.
        //
        //      A dedicated second fixture directory rather than "any other
        //      panel already on the canvas": this suite is 8000+ lines deep
        //      by the time this check runs, and an arbitrary survivor could
        //      be a review node (no cwd to root on) or a dormant panel (no
        //      live session) — a fresh, known second directory is the only
        //      way the expected root is unambiguous.
        {
          const id2 = await spawnAt(treeDir2)
          if (id2) await waitUntil(async () => (await sessionMap(wc)).has(id2), 8000)
          // M46: the rail rows are the Panels pane's; Files is showing. Select
          // through Panels and come back — the one-pane cost, paid where the
          // user would pay it.
          const viaPanels = async (fn) => {
            await dispatchClick('[data-dock="panels"]'); await settle()
            const r = await fn()
            await dispatchClick('[data-dock="files"]'); await settle()
            return r
          }
          const switched = id2 ? await viaPanels(() => dispatchClick(`[data-rail-row="${id2}"] .rail-row__main`)) : false
          await settle()
          const read = await wc.executeJavaScript(`(() => {
            const sel = document.querySelector('.panel--selected')
            const root = document.querySelector('.shell__tree-root')
            return {
              selected: sel ? sel.getAttribute('data-panel-id') : null,
              root: root ? root.getAttribute('title') : null
            }
          })()`)
          ok('158 the tree re-roots on the selected panel',
            switched === true && id2 !== undefined && read.selected === id2 &&
              (read.root === treeDir2 || read.root === treeDir2Real),
            `selected=${read.selected} root=${read.root} expected=${treeDir2}`)
        }

        // 159. The palette -> SCREEN direction, and the only check that
        //      covers it. files.treeOpen is an ordinary boolean SettingDef,
        //      so main's settings:list AUTO-GENERATES a row nobody wrote;
        //      running it must MOVE THE FRAME rather than only persist. Read
        //      off .shell's class list, never off main's store: a toggle that
        //      writes to main and leaves the frame where it was reads "Off"
        //      beside a visibly open column. Found by a keyword ("explorer")
        //      the row's own label never displays — check 52's rule.
        {
          const openPalette = async () => {
            await wc.executeJavaScript(`
              if (document.querySelector('.palette') === null) {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
              }
            `)
            return waitUntil(
              () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
          }
          // Runs the row with a dispatched mousedown, the same idiom check
          // 79 uses for the rail setting: runRow fires on mousedown, not on
          // click or Enter, so this is the row's real execution path rather
          // than a shortcut around it.
          const runByKeyword = async (keyword, textMatch) => wc.executeJavaScript(`(async () => {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value').set
            const input = document.querySelector('.palette__input')
            setter.call(input, ${JSON.stringify(keyword)})
            input.dispatchEvent(new Event('input', { bubbles: true }))
            await new Promise((r) => setTimeout(r, 120))
            const row = [...document.querySelectorAll('.palette__row')]
              .find((r) => r.textContent.includes(${JSON.stringify(textMatch)}))
            if (!row) return 'not found'
            row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
            return 'ok'
          })()`)

          const before = await readTreeCollapsed()
          await openPalette()
          const picked = await runByKeyword('explorer', 'file tree')
          await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
          // The auto-generated row's run() is `settings:set` over IPC, not a
          // call into useShellChrome's local toggleTree — main's store write
          // and the round trip back through settingsSignal's reload is what
          // actually flips treeOpen, so a bare read right after the palette
          // closes can catch the class before that lands. Polled for CHANGE
          // (a boolean, always truthy once satisfied — waitUntil treats a
          // falsy return as "not yet", so returning the raw class value
          // would hang the whole 3s out whenever the true answer is `false`,
          // i.e. whenever this toggle opens the tree rather than closes it),
          // the same shape check 79 already needs for the rail's own palette
          // toggle.
          const changed = await waitUntil(async () => (await readTreeCollapsed()) !== before, 3000)
          const after = await readTreeCollapsed()
          ok('159 the auto-generated palette row moves the frame, not just the store',
            picked === 'ok' && changed === true && before !== after,
            `picked=${picked} ${before} -> ${after}`)
          // Put it back for check 129's baseline, in the spirit of 73's own
          // closing note: leave the tree exactly as this block found it.
          if (after !== before) {
            await openPalette()
            await runByKeyword('explorer', 'file tree')
            await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
            await waitUntil(async () => (await readTreeCollapsed()) === before ? true : false, 3000)
          }
        }

        // 160. Cmd+B toggles, and a held chord does not re-toggle. Like 7b,
        //      33b and 75b this supplies repeat:true BY HAND, so it proves
        //      the guard READS the flag and says nothing about who SETS it —
        //      that link was checked once, separately, with sendInputEvent's
        //      'isAutoRepeat' modifier, and is recorded in CLAUDE.md.
        {
          const before = await readTreeCollapsed()
          await wc.executeJavaScript(
            `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', metaKey: true, bubbles: true }))`)
          await settle()
          const once = await readTreeCollapsed()
          for (let i = 0; i < 5; i++) {
            await wc.executeJavaScript(
              `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', metaKey: true, repeat: true, bubbles: true }))`)
          }
          await settle()
          const held = await readTreeCollapsed()
          ok('160 Cmd+B toggles the tree once, and auto-repeat does not re-toggle',
            before !== once && held === once, `${before} -> ${once} -> ${held}`)
        }

        // 161. The final-review fix: resolveCwd's spawn-safety fallback
        //      (substitute $HOME for a gone directory — correct for never
        //      failing a shell spawn) must never leak into a directory
        //      LISTING. A panel's whole root cwd vanishing (an agent
        //      `rm -rf`'d it) has to reach readDir's own `gone` arm; the
        //      pre-fix handler called resolveCwd itself, which silently
        //      substituted homedir() and rendered $HOME's own contents under
        //      a heading that still named the deleted directory — a click on
        //      one of those rows then pastes a path that resolves to
        //      nowhere. The ROOT is deliberately what this check deletes,
        //      not a child under it: buildFileRows' depth-0 suppression
        //      (the "loading" gap Finding 2 fixes) applies only to the `loading`
        //      arm, never to `note` — a non-ok root answer still pushes a
        //      real note row at depth 0 — so deleting a CHILD directory
        //      would instead just drop its row from the parent's own
        //      re-listing and never reach readDir's `gone` arm at all: the
        //      parent's readdir simply would not name it anymore. No git
        //      needed; nested here purely to reuse spawnAt/sessionMap/settle,
        //      the same reason 116-117 and 156-160 are.
        {
          const treeDir3 = mkdtempSync(join(tmpdir(), 'tc panels tree3 '))
          writeFileSync(join(treeDir3, 'stub.txt'), 'x\n')
          // Both spellings, the same fence checks 43/117/127 already carry:
          // macOS tmpdir() answers /var/folders/..., a resolved read answers
          // /private/var/folders/... for the identical directory, and this
          // fixture's own delay before the delete+refresh (waiting up to
          // 8000ms for the session, then a settle, then the disk ops) is
          // comfortably past M12's 2s live-cwd tick — so by the time the row
          // renders, treeRoot may already have moved onto the RESOLVED
          // spelling tmux reports, and a single-spelling selector goes red on
          // a real machine even though the fix under test is correct. This
          // was found failing on an uncontended, clean full-suite run.
          const treeDir3Real = (() => { try { return realpathSync(treeDir3) } catch { return treeDir3 } })()

          const id3 = await spawnAt(treeDir3)
          if (id3) await waitUntil(async () => (await sessionMap(wc)).has(id3), 8000)
          const switched3 = id3
            ? await (async () => {
                await dispatchClick('[data-dock="panels"]'); await settle()
                const r = await dispatchClick(`[data-rail-row="${id3}"] .rail-row__main`)
                await dispatchClick('[data-dock="files"]'); await settle()
                return r })()
            : false
          await settle()
          if (switched3) {
            await waitUntil(() => wc.executeJavaScript(
              `document.querySelectorAll('.shell__tree .file-row [data-file-path]').length > 0`), 5000)
          }
          // Delete the whole root from disk — the fixture setup for the
          // failure this check exists to catch, not a teardown.
          try { rmSync(treeDir3, { recursive: true, force: true }) } catch { /* setup, not teardown */ }
          // The refresh control, scoped to .shell__tree so this cannot
          // accidentally hit SideRail's own shell__region-add.
          const refreshed = switched3
            ? await dispatchClick('.shell__tree .shell__region-add')
            : false
          // Both spellings tried, in order — the same OR check 127 already
          // makes on `read.root`: treeRoot may have moved to the RESOLVED
          // spelling by the time this row rendered, so a query keyed on only
          // the raw fixture path finds nothing (querySelector on an
          // attribute value that no longer matches returns null, exactly the
          // false-red this produced), and this is a query-selector match, not
          // a Set membership test, so both spellings have to be tried as
          // actual selectors rather than compared afterward.
          const noteText = refreshed
            ? await waitUntil(() => wc.executeJavaScript(`(() => {
                const byRaw = document.querySelector('.shell__tree [data-file-note="${treeDir3}"]')
                const byReal = document.querySelector('.shell__tree [data-file-note="${treeDir3Real}"]')
                const el = byRaw || byReal
                return el ? el.textContent : null
              })()`), 5000)
            : null
          // noteText itself is the whole assertion, both directions at once:
          // a fallback that substituted $HOME would answer 'ok' with real
          // entries instead of the 'note' state, so the root's own note
          // element would either be absent (noteText stays null, because the
          // query above finds nothing to read a note off) or carry different
          // text — either way this equality fails, which is what would catch
          // $HOME's contents rendering under a heading that still names the
          // deleted directory.
          ok('161 a panel whose root cwd is deleted reads gone, never $HOME\'s contents',
            id3 !== undefined && switched3 === true && refreshed === true &&
              noteText === 'this directory is gone',
            `panel=${id3} switched=${switched3} refreshed=${refreshed} note=${noteText}`)

          // Already gone; nothing left to clean up.
        }

        try { rmSync(treeDir, { recursive: true, force: true }) } catch { /* best effort */ }
        try { rmSync(treeDir2, { recursive: true, force: true }) } catch { /* best effort */ }
      }
    }

  }
})
