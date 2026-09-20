/* verify:panels:orchestrate — the Orchestrate page's Electron checks (M288), split out of
   `agents` so Phase C's checks do not push that part's 168 s watchdog over the headroom line.
   Run with: npm run build && npm run verify:panels:orchestrate
   Phase A's `orch-task.*` and Phase B's `orch-bench.*` blocks moved here verbatim, ids
   unchanged; Phase C's `orch-islands.app.*`, `orch-dep.app.*` and `orch-limits.app.*` follow. */
// A throw while the harness LOADS (a bad require, a failed esbuild) never
// reaches runPanelsSuite's watchdog: Electron prints "App threw an error
// during load" and idles, which read as a 30-minute hang on 2026-09-14.
let runPanelsSuite
try { ({ runPanelsSuite } = require('./panels-harness.cjs')) } catch (error) { console.error('FAIL  harness failed to load:', error); process.exit(1) }

const WATCHDOG_MS = 137000 // measured 2026-09-20 with Phase D's blocks in (orch-3d.app.1–.2, orch-zoom.app.1–.2 — four fixture reloads of 1/6/25/100 sessions with eight measurements — and orch-parity.app.1–.4, beside Phase A–C's): green runs 103.5 s, 106.4 s and 109.2 s at load 20–26 (three other sessions on the machine); 1.25x the slowest, to the next second. Phase C's pin was 116000 (81.9–92.1 s at load 7–11).

runPanelsSuite('orchestrate', WATCHDOG_MS, async (ctx) => {
  const { app, attachPtyLifecycle, chatSpawns, clickPanelClose, createDirectBackend, execFileSync, flushLayoutStore, fromPanels, join, layoutStore, mkdirSync, mkdtempSync, ok, ptyManager, readFileSync, realpathSync, reviewEngine, rmSync, runLedger, sessionMap, settle, sleep, tmpdir, waitUntil, wc, win, writeFileSync, state } = ctx
  // As in `agents`: a renderer reload must DETACH every session, exactly as
  // main/index.ts wires it, or a fixture that expects a dormant panel after a
  // reload finds it live. Installed once, at this part's start.
  attachPtyLifecycle(win, () => ptyManager.detachAll())

  // ---------------------------------------------------------------------
  // M284 — Orchestrate Phase A: one real task island and its actions
  // (orch-task.*). A REAL chat (the fake runner under a real
  // AgentSessionManager) in a REAL git repository is the island; every step
  // is driven through Orchestrate's own controls — the list, the inspector,
  // Needs attention, Output, Review, Open on canvas — and the permission's
  // answer is read off the WIRE (the control_response main wrote), not off
  // the page. Nothing here seeds the view model directly.
  // ---------------------------------------------------------------------
  {
    const oLog = []
    const onO = (_e, level, m) => { if (level >= 2) oLog.push(String(m).slice(0, 200)) }
    wc.on('console-message', onO)
    const click = (q) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(q)}); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
    const orchShown = () => wc.executeJavaScript(`document.querySelector('.shell__orch[data-center-view="orchestration"]') !== null`)
    // Opt-in captures of the REAL window for the ledger's exit demo; never read by a check.
    const demo = async (name) => {
      if (!process.env.TC_DEMO_SHOTS) return
      mkdirSync(process.env.TC_DEMO_SHOTS, { recursive: true })
      writeFileSync(join(process.env.TC_DEMO_SHOTS, `${name}.png`), (await wc.capturePage()).toPNG())
    }
    const IDS = [
      'orch-task.1 Orchestrate shows ONE task island built from a real session, labelled with its goal, its repository and where its files live',
      'orch-task.2 selecting in the List syncs the scene\'s selection and the inspector (identity, state, next action)',
      'orch-task.3 a real pending permission appears in Needs attention and Allow there answers on the wire exactly once, even clicked twice; the row leaves',
      'orch-task.4 a permission answered ELSEWHERE (the Dock) leaves Orchestrate\'s queue, with exactly one answer for it on the wire',
      'orch-task.5 Output mirrors the selected session read-only, and Review shows its changed file and diff through the review executors',
      'orch-task.6 Open on canvas is a separate labelled action: it switches page and selects the existing object',
      'orch-task.7 the List is reachable by keyboard: Tab lands on a row, ArrowDown moves the selection and the focus with it'
    ]
    try {
      const repo = mkdtempSync(join(tmpdir(), 'tc panels orch task-'))
      const g = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
      g('init', '-q', '.'); g('config', 'user.email', 'v@example.com'); g('config', 'user.name', 'v')
      writeFileSync(join(repo, 'app.txt'), 'first\n'); g('add', '-A'); g('commit', '-qm', 'init')
      const minted = await wc.executeJavaScript(`window.__m73Chat(${JSON.stringify(repo)})`)
      const chatId = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')]; const p = ps[ps.length - 1]; return p ? p.getAttribute('data-panel-id') : false })()`), 5000)
      const sel = (q) => `document.querySelector('.panel[data-panel-id="${chatId}"] ${q}')`
      const sendText = (text) => waitUntil(() => wc.executeJavaScript(`(() => {
        const ta = ${sel('[data-chat-input]')}; if (!ta || ta.disabled) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true }))
        const b = ${sel('[data-chat-send]')}; if (!b || b.disabled) return false
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 8000)
      const idle = () => waitUntil(() => wc.executeJavaScript(`${sel('[data-chat-state]')}?.textContent === 'idle' || false`), 8000)
      // Every control_response main wrote to ANY fake process — the chat may be respawned,
      // so a fixed index into chatSpawns reads the wrong one; each assertion then keys on
      // the request id it is about.
      const wire = () => chatSpawns.flatMap((sp) => sp.proc.stdin.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter((x) => x && x.type === 'control_response'))
      await sendText('start the task')
      await idle()
      const baseline = await waitUntil(() => wc.executeJavaScript(`window.canvas.review.baseline(${JSON.stringify(chatId)}).then((b) => b && b.sha ? b.sha : false)`), 8000)
      writeFileSync(join(repo, 'app.txt'), 'first\nchanged by the task\n')
      const chatTitle = await wc.executeJavaScript(`document.querySelector('[data-rail-row="${chatId}"]')?.textContent ?? null`)

      // Onto the Orchestrate page, through the Dock.
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await settle()
      const islandRead = () => wc.executeJavaScript(`(() => { const i = document.querySelector('[data-orch-island]'); return i ? { id: i.getAttribute('data-orch-island'), source: i.getAttribute('data-orch-island-source'), goal: i.querySelector('[data-orch-island-goal]')?.textContent ?? null, place: i.querySelector('[data-orch-island-place]')?.textContent ?? null, count: document.querySelectorAll('[data-orch-island]').length } : null })()`)
      const island = await waitUntil(islandRead, 4000)
      await demo('m284-1-island')
      const repoName = repo.split('/').filter(Boolean).pop()
      // The island is the canvas's focused TASK when an earlier check left one working
      // or in review; otherwise it is this session. Either way it is real and single.
      ok(IDS[0],
        minted && minted.kind === 'spawned' && typeof baseline === 'string' && island && island.count === 1 && typeof island.goal === 'string' && island.goal !== '' &&
          (island.source === 'work-item' || (island.source === 'session' && island.id === chatId && island.place.startsWith(repoName) && /shared directory/.test(island.place))),
        JSON.stringify({ minted, baseline, island, repoName, chatTitle, log: oLog.slice(-3) }))

      // The List lens, then select the chat there.
      await click('[data-orch-lens="list"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-list-row="${chatId}"] button') !== null`), 3000)
      await click(`[data-orch-list-row="${chatId}"] button`)
      const inspected = await waitUntil(() => wc.executeJavaScript(`(() => { const i = document.querySelector('[data-orch-inspector="${chatId}"]'); if (!i) return false; return { title: i.querySelector('[data-orch-inspector-title]')?.textContent ?? null, state: i.querySelector('[data-orch-inspector-state]')?.textContent ?? null, next: i.querySelector('[data-orch-next]')?.getAttribute('data-orch-next') ?? null, open: i.querySelector('[data-orch-open]')?.textContent ?? null, rowOn: document.querySelector('[data-orch-list-row="${chatId}"]')?.hasAttribute('data-selected') === true, rosterOn: [...document.querySelectorAll('.orch__roster-row--on')].length } })()`), 3000)
      await demo('m284-2-list-inspector')
      ok(IDS[1],
        inspected && typeof inspected.title === 'string' && inspected.title !== '' && inspected.state === 'idle' && inspected.next === 'review' && inspected.open === 'Open on canvas' && inspected.rowOn === true && inspected.rosterOn === 1,
        JSON.stringify({ inspected }))

      // A real permission, answered here — twice-clicked, once on the wire.
      // The chat's composer lives on the covered canvas: sent through its own API, the
      // way the canvas would, with the page left on Orchestrate.
      await wc.executeJavaScript(`window.canvas.agentSession.send(${JSON.stringify(chatId)}, 'ask: list the repository')`).catch(() => null)
      const row = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-orch-needs-row="${chatId}"][data-orch-request]'); return r ? { request: r.getAttribute('data-orch-request'), ask: r.querySelector('.orch__needs-ask')?.textContent ?? null, allow: !!r.querySelector('[data-orch-allow]') } : false })()`), 8000)
      await demo('m284-3-needs-attention')
      const nextWhilePending = await wc.executeJavaScript(`document.querySelector('[data-orch-inspector="${chatId}"] [data-orch-next]')?.getAttribute('data-orch-next') ?? null`)
      await wc.executeJavaScript(`(() => { const a = document.querySelector('[data-orch-needs-row="${chatId}"] [data-orch-allow]'); if (!a) return false; a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
      const rowGone = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-needs-row="${chatId}"][data-orch-request]') === null`), 6000)
      await idle()
      const wire1 = wire()
      const stillOrch = await orchShown()
      ok(IDS[2],
        row && /Bash/.test(row.ask) && /ls -la/.test(row.ask) && row.allow === true && nextWhilePending === 'answer' &&
          rowGone === true && wire1.filter((w) => JSON.stringify(w).includes(row.request)).length === 1 && /allow/.test(JSON.stringify(wire1.find((w) => JSON.stringify(w).includes(row.request)))) && stillOrch === true,
        JSON.stringify({ row, nextWhilePending, rowGone, wire1, stillOrch, log: oLog.slice(-3) }))

      // Answered elsewhere: the Dock's attention popover, beside the Orchestrate page.
      await wc.executeJavaScript(`window.canvas.agentSession.send(${JSON.stringify(chatId)}, 'ask: again')`).catch(() => null)
      const row2 = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-needs-row="${chatId}"][data-orch-request]')?.getAttribute('data-orch-request') ?? false`), 8000)
      await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="attention"]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-rail-attention="${chatId}"] [data-rail-allow]') !== null`), 4000)
      await click(`[data-rail-attention="${chatId}"] [data-rail-allow]`)
      const row2Gone = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-needs-row="${chatId}"][data-orch-request]') === null`), 6000)
      await idle()
      const wire2 = wire()
      await wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="attention"]'); if (b && b.getAttribute('aria-pressed') === 'true') b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      ok(IDS[3],
        typeof row2 === 'string' && row2Gone === true && wire2.filter((w) => JSON.stringify(w).includes(row2)).length === 1,
        JSON.stringify({ row2, row2Gone, wire2 }))

      // Output, then Review — through the inspector's own Review changes button.
      await wc.executeJavaScript(`(() => { const t = [...document.querySelectorAll('.orch__tabs [role="tab"]')].find((b) => b.textContent.trim() === 'Output'); t?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return !!t })()`)
      const output = await waitUntil(() => wc.executeJavaScript(`(() => { const l = document.querySelector('.orch__term-log'); return l && l.textContent.trim() !== '' && !/No recorded output/.test(l.textContent) ? l.textContent.slice(0, 120) : false })()`), 4000)
      await click(`[data-orch-inspector="${chatId}"] [data-orch-review-open]`)
      const files = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-orch-review="${chatId}"]'); if (!r) return false; const k = r.querySelector('[data-orch-review-kind]')?.getAttribute('data-orch-review-kind'); const f = [...r.querySelectorAll('[data-orch-review-file]')].map((e) => e.getAttribute('data-orch-review-file')); return k && f.length > 0 ? { kind: k, files: f } : false })()`), 8000)
      await click(`[data-orch-review="${chatId}"] [data-orch-review-file="app.txt"]`)
      const diff = await waitUntil(() => wc.executeJavaScript(`(() => { const d = document.querySelector('[data-orch-diff]'); return d && /changed by the task/.test(d.textContent) ? { adds: d.querySelectorAll('.orch__diff-line--add').length } : false })()`), 6000)
      await demo('m284-4-review-diff')
      ok(IDS[4],
        typeof output === 'string' && files && (files.kind === 'changes' || files.kind === 'shared') && files.files.includes('app.txt') && diff && diff.adds >= 1,
        JSON.stringify({ output, files, diff, log: oLog.slice(-3) }))

      // Keyboard in the List: Tab to a row, ArrowDown moves selection and focus.
      await click('[data-orch-lens="list"]')
      const kb = await wc.executeJavaScript(`(async () => {
        const btns = [...document.querySelectorAll('[data-orch-list-row] button')]
        if (btns.length < 2) return { rows: btns.length }
        btns[0].focus()
        return { rows: btns.length, first: btns[0].closest('[data-orch-list-row]').getAttribute('data-orch-list-row') }
      })()`)
      let kbAfter = null
      if (kb.rows >= 2) {
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Down' })
        kbAfter = await waitUntil(() => wc.executeJavaScript(`(() => { const f = document.activeElement?.closest('[data-orch-list-row]')?.getAttribute('data-orch-list-row'); const s = document.querySelector('[data-orch-list-row][data-selected]')?.getAttribute('data-orch-list-row'); return f && f !== ${JSON.stringify(kb.first)} && f === s ? { focused: f, selected: s } : false })()`), 3000)
      }
      const tabbable = await wc.executeJavaScript(`[...document.querySelectorAll('[data-orch-list-row] button')].every((b) => b.tabIndex >= 0 && !b.disabled)`)
      ok(IDS[6], kb.rows >= 2 && kbAfter !== false && kbAfter !== null && tabbable === true, JSON.stringify({ kb, kbAfter, tabbable }))

      // Open on canvas: re-select the chat, then the inspector's labelled action.
      await click(`[data-orch-list-row="${chatId}"] button`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-inspector="${chatId}"] [data-orch-open]') !== null`), 3000)
      await click(`[data-orch-inspector="${chatId}"] [data-orch-open]`)
      const leftOrch = await waitUntil(async () => !(await orchShown()), 3000)
      await settle()
      const selected = await wc.executeJavaScript(`(() => { const p = document.querySelector('.panel[data-panel-id="${chatId}"]'); return p ? p.className : null })()`)
      const selectedId = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel--selected')?.getAttribute('data-panel-id') ?? false`), 3000)
      await demo('m284-5-open-on-canvas')
      ok(IDS[5], leftOrch === true && selectedId === chatId, JSON.stringify({ leftOrch, selectedId, selected }))

      await clickPanelClose(wc, chatId)
      try { rmSync(repo, { recursive: true, force: true }) } catch { /* best effort */ }
    } catch (oErr) {
      for (const id of IDS) ok(id, false, 'threw: ' + String(oErr && oErr.message || oErr) + ' | renderer: ' + (oLog.slice(-4).join(' || ') || '(none)'))
    } finally {
      wc.removeListener('console-message', onO)
      if (await orchShown()) await click('[data-dock="orchestration"][aria-pressed="true"]')
    }
  }

  // ---------------------------------------------------------------------
  // M287 — THE EVIDENCE WORKBENCH, END TO END (orch-bench.*), and Phase B's
  // exit criterion driven in the real app: a REAL task dispatched to a real
  // lane (a git worktree main minted) with a real chat under the fake
  // runner; every step is through Orchestrate's own controls, and every fact
  // is read back from the DOM or from the layout on disk. The one disclosed
  // fake is the agent CLI; git, the review engine, the ledger, the watcher
  // runner and the identity hashing are main's real code (the harness
  // mirrors stores.ts's wiring for them).
  // ---------------------------------------------------------------------
  {
    const bLog = []
    const onB = (_e, level, m) => { if (level >= 2) bLog.push(String(m).slice(0, 200)) }
    wc.on('console-message', onB)
    const click = (q) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(q)}); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
    const orchShown = () => wc.executeJavaScript(`document.querySelector('.shell__orch[data-center-view="orchestration"]') !== null`)
    const demo = async (name) => {
      if (!process.env.TC_DEMO_SHOTS) return
      mkdirSync(process.env.TC_DEMO_SHOTS, { recursive: true })
      writeFileSync(join(process.env.TC_DEMO_SHOTS, `${name}.png`), (await wc.capturePage()).toPNG())
    }
    const onDisk = (id) => { layoutStore.flushSync(); return (layoutStore.initial().workItems || []).find((i) => i.id === id) }
    const typeInto = (q, text) => wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(q)}); if (!el) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return true })()`)
    const IDS = [
      'orch-bench.1 the workbench is ONE strip with exactly Changes · Checks · Output, bound to the selection by name, pinnable and unpinnable by name, and resizable by its top edge with the height and the tab persisted per workspace on disk',
      'orch-bench.2 a task with a real lane: Changes shows the lane\'s fork diff (a file tree and a readable diff), and a brief and criteria typed in the inspector persist on the work item and show beside the changes — launching nothing (no new chat, no new lane)',
      'orch-bench.3 a SAME-SIZE edit invalidates the prior review: Mark reviewed reads current and writes the identity on disk; one line replaced by another of the same length leaves the shape signature identical, and after Refresh the mark reads stale because the content identity moved',
      'orch-bench.4 a changed revision makes check evidence stale, and unavailable data is explicit: a watcher run in the lane reads exit 0 with the identity it tested; an edit to the lane makes it stale after Refresh; a failed run reads exit 1 and opens its command, context and output; a session in a plain folder says it is not in a git repository and that no checks have run'
    ]
    let repo = null, plain = null, itemId = null, chatId = null, plainChatId = null
    try {
      repo = mkdtempSync(join(tmpdir(), 'tc panels orch bench-'))
      const g = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
      g('init', '-q', '.'); g('config', 'user.email', 'v@example.com'); g('config', 'user.name', 'v')
      writeFileSync(join(repo, 'app.txt'), 'one\ntwo\nthree\n'); writeFileSync(join(repo, 'code.txt'), '0\n')
      g('add', '-A'); g('commit', '-qm', 'init')
      layoutStore.saveTeammate({ id: 'tm-bench', name: 'bench', brief: 'You are bench.', places: [repo], services: [], skills: [], memory: 'bench', chats: [], messaging: false, scheduling: false })
      layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore()
      // The renderer reads the roster at load: a teammate saved behind its back is one it
      // refuses by name (the product suite's recipe, kept).
      const reB = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await reB
      await settle()
      const spawnsBefore = chatSpawns.length
      const lanesBefore = layoutStore.worktrees().length
      itemId = await wc.executeJavaScript(`window.__m113.add({ source: 'typed', title: 'Make two loud' })`)
      // A typed item names no repository, so the root is chosen here — the sheet's own third argument.
      const dispatched = await wc.executeJavaScript(`window.__m113.dispatch(${JSON.stringify(itemId)}, 'tm-bench', ${JSON.stringify(repo)})`)
      const recorded = await waitUntil(() => { const it = onDisk(itemId); return it && it.panelId && it.worktreeId ? it : false }, 10000)
      if (!recorded) throw new Error('orch-bench: the dispatch minted no lane — ' + JSON.stringify({ dispatched, item: onDisk(itemId) }))
      chatId = recorded.panelId
      // The record lands through main's worktree manager; read it until it is there.
      const lane = await waitUntil(() => layoutStore.worktrees().find((w) => w.id === recorded.worktreeId || w.panelId === recorded.panelId) || false, 8000)
      if (!lane) throw new Error('orch-bench: the dispatch minted no lane record — ' + JSON.stringify({ recorded, worktrees: layoutStore.worktrees().map((w) => ({ id: w.id, panelId: w.panelId, path: w.path })) }))
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${chatId}"] [data-chat-state]')?.textContent === 'idle' || false`), 10000)
      // The agent's "work": one line changed in the LANE (+1 −1), the fork diff.
      writeFileSync(join(lane.path, 'app.txt'), 'one\ntwo!\nthree\n')
      const spawnsAfterDispatch = chatSpawns.length
      const lanesAfterDispatch = layoutStore.worktrees().length

      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await settle()
      const benchRead = () => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-orch-workbench]'); if (!b) return null
        return { tabs: [...b.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()), tab: b.getAttribute('data-orch-bench-tab'), subject: b.getAttribute('data-orch-bench-subject'),
          bound: b.querySelector('[data-orch-bench-bound]')?.textContent ?? null, boundKind: b.querySelector('[data-orch-bench-bound]')?.getAttribute('data-orch-bench-bound') ?? null,
          height: b.getBoundingClientRect().height, open: b.hasAttribute('data-orch-bench-open'), benches: document.querySelectorAll('[data-orch-workbench]').length } })()`)
      const island = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-island="${itemId}"]') !== null`), 6000)
      // Closed at rest: the tab bar alone. The inspector's Review changes opens it on Changes.
      const closedRead = await waitUntil(async () => { const b = await benchRead(); return b && b.subject.startsWith('task:' + itemId) ? b : false }, 6000)
      await click('[data-orch-inspector] [data-orch-review-open]')
      const b0 = await waitUntil(async () => { const b = await benchRead(); return b && b.open === true ? b : false }, 6000)
      // Changes: the lane's fork diff, a tree with app.txt, and the diff's added line.
      const files = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-orch-workbench] [data-orch-review]'); if (!r) return false; const k = r.querySelector('[data-orch-review-kind]')?.getAttribute('data-orch-review-kind'); const f = [...r.querySelectorAll('[data-orch-review-file]')].map((e) => e.getAttribute('data-orch-review-file')); return k === 'changes' && f.length > 0 ? { kind: k, files: f, fresh: r.querySelector('[data-orch-fresh]')?.getAttribute('data-orch-fresh') ?? null, freshWords: r.querySelector('[data-orch-fresh]')?.textContent ?? null } : false })()`), 8000)
      await click('[data-orch-workbench] [data-orch-review-file="app.txt"]')
      const diff = await waitUntil(() => wc.executeJavaScript(`(() => { const d = document.querySelector('[data-orch-workbench] [data-orch-diff]'); return d && /two!/.test(d.textContent) ? { adds: d.querySelectorAll('.orch__diff-line--add').length, dels: d.querySelectorAll('.orch__diff-line--del').length, width: d.getBoundingClientRect().width } : false })()`), 8000)
      await demo('m287-1-changes')
      // The brief, in the inspector; then read beside the changes and on disk.
      const typedBrief = await typeInto(`[data-orch-brief-editor="${itemId}"] [data-orch-brief]`, 'Make the second line loud, nothing else.')
      const typedCriteria = await typeInto(`[data-orch-brief-editor="${itemId}"] [data-orch-criteria]`, 'line two ends with a bang\nno other line changes')
      const briefOnDisk = await waitUntil(() => { const it = onDisk(itemId); return it && it.brief && it.criteria && it.criteria.length === 2 ? { brief: it.brief, criteria: it.criteria } : false }, 6000)
      const briefShown = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-orch-workbench] [data-orch-bench-brief]'); return b && /loud, nothing else/.test(b.textContent) && /ends with a bang/.test(b.textContent) ? b.textContent.slice(0, 160) : false })()`), 6000)
      await demo('m287-2-brief')
      ok(IDS[1],
        recorded && typeof chatId === 'string' && lane !== undefined && island === true && files && files.files.includes('app.txt') && files.fresh === 'none' &&
          diff && diff.adds === 1 && diff.dels === 1 && diff.width > 300 &&
          typedBrief === true && typedCriteria === true && briefOnDisk && briefOnDisk.brief === 'Make the second line loud, nothing else.' && briefOnDisk.criteria[0] === 'line two ends with a bang' &&
          typeof briefShown === 'string' &&
          // Editing the brief launched nothing.
          chatSpawns.length === spawnsAfterDispatch && layoutStore.worktrees().length === lanesAfterDispatch && spawnsAfterDispatch === spawnsBefore + 1 && lanesAfterDispatch === lanesBefore + 1,
        JSON.stringify({ recorded: { panelId: recorded.panelId, worktreeId: recorded.worktreeId }, lane: lane && lane.path, files, diff, typedBrief, typedCriteria, briefOnDisk, briefShown, spawns: [spawnsBefore, spawnsAfterDispatch, chatSpawns.length], lanes: [lanesBefore, lanesAfterDispatch, layoutStore.worktrees().length], log: bLog.slice(-3) }))

      // orch-bench.3 — the exit criterion's first sentence.
      await click('[data-orch-workbench] [data-orch-bench-mark]')
      const current = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-workbench] [data-orch-fresh]')?.getAttribute('data-orch-fresh') === 'current' ? document.querySelector('[data-orch-workbench] [data-orch-fresh]').textContent : false`), 8000)
      const markOnDisk = await waitUntil(() => { const it = onDisk(itemId); return it && it.reviewed && it.reviewed.identity ? it.reviewed : false }, 6000)
      await demo('m287-3-reviewed-current')
      const sectionOf = async () => { const a = await reviewEngine.reviewAcross(lane.root); const s = a.kind === 'across' ? a.sections.find((x) => x.path === lane.path || realpathSync(x.path) === realpathSync(lane.path)) : undefined; return s && s.result }
      const beforeEdit = await sectionOf()
      // THE SAME-SIZE EDIT: `two!` → `two?`. Same line count, same +1 −1, same path.
      writeFileSync(join(lane.path, 'app.txt'), 'one\ntwo?\nthree\n')
      const afterEdit = await sectionOf()
      await click('[data-orch-workbench] [data-orch-bench-refresh]')
      const stale = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-workbench] [data-orch-fresh]')?.getAttribute('data-orch-fresh') === 'stale' ? document.querySelector('[data-orch-workbench] [data-orch-fresh]').textContent : false`), 8000)
      await demo('m287-4-reviewed-stale-same-size')
      const shapeSame = beforeEdit && afterEdit && beforeEdit.kind === 'changes' && afterEdit.kind === 'changes' &&
        JSON.stringify(beforeEdit.files.map((f) => [f.path, f.added, f.removed])) === JSON.stringify(afterEdit.files.map((f) => [f.path, f.added, f.removed]))
      ok(IDS[2],
        typeof current === 'string' && /current/.test(current) &&
          markOnDisk && /^[0-9a-f]+$/.test(markOnDisk.identity.base) && /^[0-9a-f]{32}$/.test(markOnDisk.identity.content) && markOnDisk.files === 1 &&
          shapeSame && beforeEdit.identity && afterEdit.identity && beforeEdit.identity.base === afterEdit.identity.base && beforeEdit.identity.content !== afterEdit.identity.content &&
          markOnDisk.identity.content === beforeEdit.identity.content &&
          typeof stale === 'string' && /stale/.test(stale),
        JSON.stringify({ current, markOnDisk, before: beforeEdit && { files: beforeEdit.files, identity: beforeEdit.identity }, after: afterEdit && { files: afterEdit.files, identity: afterEdit.identity }, stale, log: bLog.slice(-3) }))

      // orch-bench.4 — the second and third sentences. A watcher in the lane,
      // run by hand: its exit lands with the identity it tested.
      await click('[data-dock="orchestration"][aria-pressed="true"]')
      await waitUntil(async () => !(await orchShown()), 3000)
      const watcherId = await wc.executeJavaScript(`window.__m287Watcher(${JSON.stringify(lane.path)}, '/bin/sh', ['-c', 'cat app.txt; exit $(cat code.txt)'])`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${watcherId}"] [data-watcher-run]') !== null`), 6000)
      await wc.executeJavaScript(`window.canvas.watcher.run(${JSON.stringify(watcherId)})`)
      const ranOnce = await waitUntil(async () => { const rows = await runLedger.list(watcherId, 5); return rows.length === 1 && rows[0].exitCode === 0 ? rows[0] : false }, 8000)
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await settle()
      // Back on the task (the island), then Checks.
      await click(`[data-orch-island="${itemId}"]`)
      await click('[data-orch-workbench] [data-orch-bench-tab-button="checks"]')
      const checkSel = `[data-orch-workbench] [data-orch-check="watcher:${watcherId}:${ranOnce.startedAt}"]`
      const passed = await waitUntil(() => wc.executeJavaScript(`(() => { const c = document.querySelector(${JSON.stringify(checkSel)}); if (!c) return false; const o = c.getAttribute('data-orch-check-outcome'); return o === 'passed' ? { outcome: o, word: c.querySelector('.orch__check-outcome')?.textContent ?? null, noteless: !/stale|unknown/.test(c.textContent) } : false })()`), 10000)
      const noVerdict = await wc.executeJavaScript(`!/tests passed|all tests/i.test(document.querySelector('[data-orch-workbench]').textContent)`)
      await demo('m287-5-check-fresh')
      // The revision moves: an edit in the lane. The watcher's exit 0 is now about an earlier tree.
      writeFileSync(join(lane.path, 'app.txt'), 'one\ntwo?\nthree\nfour\n')
      await click('[data-orch-workbench] [data-orch-bench-refresh]')
      const staleCheck = await waitUntil(() => wc.executeJavaScript(`(() => { const c = document.querySelector(${JSON.stringify(checkSel)}); if (!c) return false; const o = c.getAttribute('data-orch-check-outcome'); return o === 'stale' ? { outcome: o, word: c.querySelector('.orch__check-outcome')?.textContent ?? null } : false })()`), 10000)
      await demo('m287-6-check-stale')
      // A failed run opens its command, context and output.
      writeFileSync(join(lane.path, 'code.txt'), '3\n')
      await wc.executeJavaScript(`window.canvas.watcher.run(${JSON.stringify(watcherId)})`)
      const ranTwice = await waitUntil(async () => { const rows = await runLedger.list(watcherId, 5); return rows.length === 2 && rows[0].exitCode === 3 ? rows[0] : false }, 8000)
      await click('[data-orch-workbench] [data-orch-bench-refresh]')
      const failSel = `[data-orch-workbench] [data-orch-check="watcher:${watcherId}:${ranTwice.startedAt}"]`
      const failed = await waitUntil(() => wc.executeJavaScript(`document.querySelector(${JSON.stringify(failSel)})?.getAttribute('data-orch-check-outcome') === 'failed' ? document.querySelector(${JSON.stringify(failSel)} + ' .orch__check-outcome').textContent : false`), 10000)
      await click(`${failSel} button`)
      const detail = await waitUntil(() => wc.executeJavaScript(`(() => { const d = document.querySelector(${JSON.stringify(failSel)} + ' [data-orch-check-detail]'); if (!d) return false; const t = d.textContent; return /cat app\.txt; exit/.test(t) && /two\?/.test(t) ? { text: t.slice(0, 300), worktree: /worktree/.test(t) } : false })()`), 8000)
      await demo('m287-7-check-failed-detail')
      // Unavailable data, said: a session in a plain folder.
      plain = mkdtempSync(join(tmpdir(), 'tc panels orch plain-'))
      await click('[data-dock="orchestration"][aria-pressed="true"]')
      await waitUntil(async () => !(await orchShown()), 3000)
      await wc.executeJavaScript(`window.__m73Chat(${JSON.stringify(plain)})`)
      plainChatId = await waitUntil(() => wc.executeJavaScript(`(() => { const ps = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')]; const p = ps[ps.length - 1]; return p && p.getAttribute('data-panel-id') !== ${JSON.stringify(chatId)} ? p.getAttribute('data-panel-id') : false })()`), 8000)
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      // The task frame hides non-members from the scene and the List: show the whole ring first.
      await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      await click('[data-orch-lens="list"]')
      const plainRow = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-list-row="${plainChatId}"] button') !== null`), 6000)
      if (!plainRow) throw new Error('orch-bench: the plain-folder chat never appeared in the List')
      await click(`[data-orch-list-row="${plainChatId}"] button`)
      await click('[data-orch-workbench] [data-orch-bench-tab-button="changes"]')
      const notRepo = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-orch-workbench] [data-orch-review="${plainChatId}"] [data-orch-review-kind]'); return r ? { kind: r.getAttribute('data-orch-review-kind'), words: r.textContent } : false })()`), 8000)
      await click('[data-orch-workbench] [data-orch-bench-tab-button="checks"]')
      const noChecks = await waitUntil(() => wc.executeJavaScript(`(() => { const u = document.querySelector('[data-orch-workbench] [data-orch-checks="${plainChatId}"] [data-orch-checks-unavailable]'); return u ? u.textContent : false })()`), 8000)
      await demo('m287-8-unavailable')
      ok(IDS[3],
        typeof watcherId === 'string' && ranOnce && ranOnce.tested && /^[0-9a-f]{32}$/.test(ranOnce.tested.content) &&
          passed && passed.word === 'exit 0' && noVerdict === true &&
          staleCheck && /stale/.test(staleCheck.word) && /exit 0/.test(staleCheck.word) &&
          ranTwice && ranTwice.exitCode === 3 && failed === 'exit 3' && detail && detail.worktree === true &&
          notRepo && notRepo.kind === 'not-a-repo' && /not in a git repository/i.test(notRepo.words) &&
          typeof noChecks === 'string' && /no checks have run/.test(noChecks),
        JSON.stringify({ watcherId, ranOnce, passed, noVerdict, staleCheck, ranTwice, failed, detail, notRepo, noChecks, log: bLog.slice(-3) }))

      // orch-bench.1 — the strip itself: tabs, binding, pin, resize, persistence.
      const boundToChat = await benchRead()
      await click('[data-orch-workbench] [data-orch-bench-pin="on"]')
      const pinnedRead = await waitUntil(async () => { const b = await benchRead(); return b && b.boundKind === 'pinned' ? b : false }, 4000)
      await click(`[data-orch-island="${itemId}"]`)
      await settle()
      const stillPinned = await benchRead()
      await click('[data-orch-workbench] [data-orch-bench-pin="off"]')
      const unpinned = await waitUntil(async () => { const b = await benchRead(); return b && b.boundKind === 'selection' && b.subject.startsWith('task:') ? b : false }, 4000)
      // Resize by the top edge: 100px up.
      const heightBefore = unpinned.height
      const dragged = await wc.executeJavaScript(`(() => { const h = document.querySelector('[data-orch-bench-handle]'); if (!h) return false
        const r = h.getBoundingClientRect(); const y = r.top + 4
        const ev = (type, cy) => h.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX: r.left + 40, clientY: cy }))
        ev('pointerdown', y); ev('pointermove', y - 50); ev('pointermove', y - 100); ev('pointerup', y - 100); return true })()`)
      const resized = await waitUntil(async () => { const b = await benchRead(); return b && Math.abs(b.height - (heightBefore + 100)) < 3 ? b : false }, 4000)
      const persisted = await waitUntil(() => { layoutStore.flushSync(); const ws = layoutStore.initial(); return ws.orchestrate && ws.orchestrate.workbench && Math.abs(ws.orchestrate.workbench.height - (heightBefore + 100)) < 3 ? ws.orchestrate : false }, 6000)
      await demo('m287-9-workbench-resized')
      ok(IDS[0],
        closedRead && closedRead.open === false && closedRead.height < 80 &&
          b0 && b0.open === true && b0.height >= 200 && b0.benches === 1 && b0.tabs.join(',') === 'Changes,Checks,Output' && b0.boundKind === 'selection' && /Bound to the selection · Make two loud/.test(b0.bound) &&
          boundToChat && boundToChat.boundKind === 'selection' && boundToChat.subject === 'session:' + plainChatId &&
          pinnedRead && /^Pinned to /.test(pinnedRead.bound) && pinnedRead.subject === 'session:' + plainChatId &&
          stillPinned && stillPinned.boundKind === 'pinned' && stillPinned.subject === 'session:' + plainChatId &&
          unpinned && /Make two loud/.test(unpinned.bound) &&
          dragged === true && resized && persisted && persisted.workbench.tab === 'checks' && persisted.workbench.open === true && persisted.lens === 'list',
        JSON.stringify({ closedRead, b0, boundToChat, pinnedRead, stillPinned, unpinned, heightBefore, dragged, resized: resized && resized.height, persisted }))
    } catch (bErr) {
      for (const id of IDS) ok(id, false, 'threw: ' + String(bErr && bErr.message || bErr) + ' | renderer: ' + (bLog.slice(-4).join(' || ') || '(none)'))
    } finally {
      wc.removeListener('console-message', onB)
      if (await orchShown()) await click('[data-dock="orchestration"][aria-pressed="true"]')
      if (plainChatId) { try { await clickPanelClose(wc, plainChatId) } catch { /* best effort */ } }
      if (chatId) { try { await wc.executeJavaScript(`window.__m113.close(${JSON.stringify(chatId)})`) } catch { /* best effort */ } }
      try { layoutStore.deleteTeammate('tm-bench') } catch { /* best effort */ }
      try { if (repo) rmSync(repo, { recursive: true, force: true }) } catch { /* best effort */ }
      try { if (plain) rmSync(plain, { recursive: true, force: true }) } catch { /* best effort */ }
    }
  }
  // ---------------------------------------------------------------------
  // M289 — THE DEPENDENCY LENS IN THE REAL APP (orch-dep.app.1). Two real
  // terminals with a real `exit-ok` handoff rule, the source driven to exit 1
  // through its own PTY; the canvas records `skipped — exit 1 is not exit 0`
  // and Orchestrate reads that sentence back as the downstream's named
  // blocker. Nothing on the page decides; it quotes.
  // ---------------------------------------------------------------------
  {
    const dLog = []
    const onD = (_e, level, m) => { if (level >= 2) dLog.push(String(m).slice(0, 200)) }
    wc.on('console-message', onD)
    const click = (q) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(q)}); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
    const orchShown = () => wc.executeJavaScript(`document.querySelector('.shell__orch[data-center-view="orchestration"]') !== null`)
    const demo = async (name) => {
      if (!process.env.TC_DEMO_SHOTS) return
      mkdirSync(process.env.TC_DEMO_SHOTS, { recursive: true })
      writeFileSync(join(process.env.TC_DEMO_SHOTS, `${name}.png`), (await wc.capturePage()).toPNG())
    }
    const ID = 'orch-dep.app.1 a dependency failure blocks downstream with a NAMED reason: a real exit-ok handoff whose source exited 1 reads on the downstream\'s inspector as Blocked with the canvas\'s own recorded sentence, its prerequisite row says skipped with the exact condition, the lens says it is read-only, and Focus dependencies dims the rest, labels the edge with its trigger and the synthetic centre as grouping — not a supervisor'
    try {
      state.backend = createDirectBackend('verify: direct (m289 dep)')
      const home = require('node:os').homedir()
      const hPanel = (id, x, y, links) => ({ kind: 'terminal', rect: { id, x, y, w: 320, h: 220 }, z: 1, spec: { panelId: id, cwd: home, command: '/bin/sh', args: [] }, ...(links ? { links } : {}) })
      layoutStore.save({
        panels: fromPanels([hPanel('dA', 60, 60, [{ to: 'dB', automation: { kind: 'handoff', enabled: true, trigger: 'exit-ok' } }]), hPanel('dB', 60, 340)]),
        camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
      })
      layoutStore.flushSync()
      const re = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await re
      await settle()
      // Wake dA through the rail's own start control, then exit 1 through its PTY.
      const woke = await wc.executeJavaScript(`(() => { const b = document.querySelector('.rail-row[data-rail-row="dA"] .rail-row__start'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
      const live = await waitUntil(async () => (await sessionMap(wc)).has('dA'), 10000)
      if (live) ptyManager.write('dA', 'exit 1\r')
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await settle()
      // Every object, then dB in the List.
      await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      await click('[data-orch-lens="list"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-list-row="dB"] button') !== null`), 6000)
      await click('[data-orch-list-row="dB"] button')
      const blocked = await waitUntil(() => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-orch-inspector="dB"] [data-orch-dep-blocked]'); return b && /skipped — exit 1 is not exit 0/.test(b.textContent) ? b.textContent : false })()`), 12000)
      const prereq = await wc.executeJavaScript(`(() => { const r = document.querySelector('[data-orch-deps="dB"] [data-orch-dep-prereqs] [data-orch-dep-edge="dA:dB"]'); return r ? { status: r.getAttribute('data-orch-dep-status'), text: r.textContent } : null })()`)
      const readonly = await wc.executeJavaScript(`document.querySelector('[data-orch-deps="dB"] [data-orch-dep-readonly]')?.textContent ?? null`)
      await demo('m289-1-blocked')
      // dA's side: dB is its dependent, skipped.
      await click('[data-orch-list-row="dA"] button')
      const dependent = await waitUntil(() => wc.executeJavaScript(`(() => { const r = document.querySelector('[data-orch-deps="dA"] [data-orch-dep-dependents] [data-orch-dep-edge="dA:dB"]'); return r ? { status: r.getAttribute('data-orch-dep-status'), text: r.textContent.slice(0, 200) } : false })()`), 6000)
      // Focus, then the scene: the edge says its trigger, the centre says grouping.
      await click('[data-orch-deps="dA"] [data-orch-dep-focus]')
      await click('[data-orch-lens="scene"]')
      const scene = await waitUntil(() => wc.executeJavaScript(`(() => { const s = document.querySelector('.orch__graph-scene'); if (!s || s.getAttribute('data-lens') !== 'true') return false
        const label = document.querySelector('[data-orch-edge-label="dA:dB"]')?.textContent ?? null
        const grouping = document.querySelector('.orch__graph-scene [data-orch-grouping]')?.textContent ?? null
        const spokes = [...document.querySelectorAll('.orch__edge[data-orch-edge="grouping"]')]
        const dep = document.querySelector('.orch__edge[data-orch-edge="dependency"]')
        return label ? { label, grouping, spokes: spokes.length, spokesMarked: spokes.every((e) => e.classList.contains('orch__edge--grouping')), depMarked: !!dep && !dep.classList.contains('orch__edge--grouping'), lensed: document.querySelectorAll('.orch__callout-host[data-lensed]').length } : false })()`), 8000)
      await demo('m289-2-lens')
      const spawnsAfter = chatSpawns.length
      ok(ID,
        woke === true && live === true && typeof blocked === 'string' && /^Blocked — /.test(blocked) &&
          prereq && prereq.status === 'skipped' && /fires only when the source exits with code 0/.test(prereq.text) && /skipped — exit 1 is not exit 0/.test(prereq.text) &&
          typeof readonly === 'string' && /read-only/.test(readonly) && /canvas/.test(readonly) &&
          dependent && dependent.status === 'skipped' &&
          scene && scene.label === 'on exit 0' && /not a supervisor/.test(String(scene.grouping)) && scene.spokes >= 1 && scene.spokesMarked === true && scene.depMarked === true,
        JSON.stringify({ woke, live, blocked, prereq, readonly, dependent, scene, spawnsAfter, log: dLog.slice(-3) }))
      // Off, for the blocks after: the lens and the page.
      await click('[data-orch-lens="list"]')
      await click('[data-orch-deps="dA"] [data-orch-dep-focus][aria-pressed="true"]')
    } catch (dErr) {
      ok(ID, false, 'threw: ' + String(dErr && dErr.message || dErr) + ' | renderer: ' + (dLog.slice(-4).join(' || ') || '(none)'))
    } finally {
      wc.removeListener('console-message', onD)
      if (await orchShown()) await click('[data-dock="orchestration"][aria-pressed="true"]')
    }
  }

  // ---------------------------------------------------------------------
  // M288 / M290 — PHASE C'S EXIT DEMO IN THE REAL APP. Two typed tasks
  // dispatched into two REAL worktrees of one repository (main's worktree
  // manager), each with its own edit; two plain chats sharing a third
  // directory; every fact read off the DOM or the disk. The one disclosed
  // fake is the agent CLI.
  // ---------------------------------------------------------------------
  {
    const cLog = []
    const onC = (_e, level, m) => { if (level >= 2) cLog.push(String(m).slice(0, 200)) }
    wc.on('console-message', onC)
    const click = (q) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(q)}); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
    const clickAll = (qs) => wc.executeJavaScript(`(() => ${JSON.stringify(qs)}.map((q) => { const b = document.querySelector(q); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b }))()`)
    const orchShown = () => wc.executeJavaScript(`document.querySelector('.shell__orch[data-center-view="orchestration"]') !== null`)
    const demo = async (name) => {
      if (!process.env.TC_DEMO_SHOTS) return
      mkdirSync(process.env.TC_DEMO_SHOTS, { recursive: true })
      writeFileSync(join(process.env.TC_DEMO_SHOTS, `${name}.png`), (await wc.capturePage()).toPNG())
    }
    const onDisk = (id) => { layoutStore.flushSync(); return (layoutStore.initial().workItems || []).find((i) => i.id === id) }
    const setInput = (q, text) => wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(q)}); if (!el) return false
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    const benchRead = () => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-orch-workbench]'); if (!b) return null
      const r = b.querySelector('[data-orch-review]')
      return { subject: b.getAttribute('data-orch-bench-subject'), open: b.hasAttribute('data-orch-bench-open'), review: r ? r.getAttribute('data-orch-review') : null,
        kind: r?.querySelector('[data-orch-review-kind]')?.getAttribute('data-orch-review-kind') ?? null, words: r?.querySelector('[data-orch-review-kind]')?.textContent ?? null,
        files: r ? [...r.querySelectorAll('[data-orch-review-file]')].map((e) => e.getAttribute('data-orch-review-file')) : [],
        controls: r?.querySelector('[data-orch-controls-subject]')?.getAttribute('data-orch-controls-subject') ?? null,
        diffSubject: r?.querySelector('[data-orch-diff-subject]')?.getAttribute('data-orch-diff-subject') ?? null,
        diffKey: r?.querySelector('[data-orch-diff]')?.getAttribute('data-orch-diff-key') ?? null,
        diffText: r?.querySelector('[data-orch-diff]')?.textContent ?? null, text: b.textContent } })()`)
    const consistent = (b) => b !== null && b.controls === b.subject && b.diffSubject === b.subject && (b.diffKey === null || b.diffKey.startsWith(b.subject + ':'))
    const sends = () => chatSpawns.reduce((n, sp) => n + sp.proc.stdin.filter((l) => { try { return JSON.parse(l).type === 'user' } catch { return false } }).length, 0)
    const IDS = [
      'orch-islands.app.1 two isolated write tasks in two REAL worktrees of one repository are two islands (in the scene each is a platform whose plate is its card, and the column rests folded to a toggle — M291) grouped under that repository (labelled grouping, not a supervisor), each with its own branch, count and context label, and each with its OWN review subject: A\'s Changes lists only A\'s file and diff, B\'s only B\'s, and the diff pane, the controls and the strip name the same subject at every read',
      'orch-islands.app.2 rapid selection (A → B → A in one tick) and out-of-order answers (a diff still in flight when the subject changes; Refresh twice in one tick) never put one task\'s diff under another task\'s controls: sampled through the flips, the strip, the controls and the diff pane always name one subject, and the late answers are dropped',
      'orch-islands.app.3 shared-directory ambiguity is shown, not guessed: two chats in one directory are one island marked ambiguous, its label counts the sessions that write there, the inspector says a change cannot be attributed to the task alone, and Changes reads the review engine\'s `shared` arm with commit and discard blocked by name',
      'orch-dep.app.2 a visual layout change dispatches nothing and is undoable: moving an island in the column changes only the presentation order (persisted to the workspace record), leaves spawns, sends, lanes and PTY sessions untouched, Undo move restores the previous order, and a new island appends without re-arranging the others',
      'orch-limits.app.1 controls appear only where the runtime supports them and say what they affect: an idle claude chat offers neither Interrupt nor Retry and names the four absent controls with reasons; waiting on a permission it offers Interrupt whose words promise no rollback, no process end and no checkpoint; after an interrupt the CLI ignored (main\'s kill) the standing reads interrupted, not stopped; Retry then PREVIEWS the last prompt for that named target and its exit puts the text in the canvas composer UNSENT',
      'orch-limits.app.2 limits and standings: four limit rows each labelled enforced or advisory with coverage, the concurrency row turning enforced with the ceiling the moment agents.maxConcurrent is set; a session that has reported nothing reads spend Unknown with its reason while one that has reads a dollar figure; a killed session reads stopped — three distinguishable answers',
      'orch-limits.app.3 commit and discard from the workbench go through the review executors with the M285 re-check: a discard while HEAD stands at the fork restores the lane to the committed content; a commit lands in the lane and is on git\'s log; a commit prepared before the tree moved is refused as moved with nothing written; once HEAD has moved past the review\'s base a discard is refused by name rather than undoing committed work'
    ]
    let repo = null, shared = null, itemA = null, itemB = null, itemC = null, chatA = null, chatB = null, sharedIds = [], plainId = null
    try {
      repo = mkdtempSync(join(tmpdir(), 'tc panels orch c-'))
      const g = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
      g('init', '-q', '.'); g('config', 'user.email', 'v@example.com'); g('config', 'user.name', 'v')
      writeFileSync(join(repo, 'a.txt'), 'a\n'); writeFileSync(join(repo, 'b.txt'), 'b\n'); writeFileSync(join(repo, 'c.txt'), 'c\n')
      g('add', '-A'); g('commit', '-qm', 'init')
      layoutStore.saveTeammate({ id: 'tm-c', name: 'phase-c', brief: 'You are phase-c.', places: [repo], services: [], skills: [], memory: 'phase-c', chats: [], messaging: false, scheduling: false })
      layoutStore.save({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
      flushLayoutStore()
      const re = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await re
      await settle()
      // Earlier blocks' items would be islands too and would take the primary pick: done, by the board's own verb.
      const leftovers = await wc.executeJavaScript(`(() => { const items = window.__m113.items().filter((i) => i.state === 'working' || i.state === 'review'); for (const i of items) window.__m113.done(i.id); return items.map((i) => i.id) })()`)
      const dispatchLane = async (title) => {
        const id = await wc.executeJavaScript(`window.__m113.add({ source: 'typed', title: ${JSON.stringify(title)} })`)
        const outcome = await wc.executeJavaScript(`window.__m113.dispatch(${JSON.stringify(id)}, 'tm-c', ${JSON.stringify(repo)})`)
        const rec = await waitUntil(() => { const it = onDisk(id); return it && it.panelId && it.worktreeId ? it : false }, 12000)
        if (!rec) throw new Error(`phase-c: ${title} minted no lane — ${JSON.stringify({ outcome, item: onDisk(id) })}`)
        const lane = await waitUntil(() => layoutStore.worktrees().find((w) => w.id === rec.worktreeId) || false, 8000)
        if (!lane) throw new Error(`phase-c: ${title} has no lane record`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${rec.panelId}"] [data-chat-state]')?.textContent === 'idle' || false`), 12000)
        return { id, chatId: rec.panelId, lane }
      }
      const A = await dispatchLane('Edit a')
      const B = await dispatchLane('Edit b')
      itemA = A.id; itemB = B.id; chatA = A.chatId; chatB = B.chatId
      writeFileSync(join(A.lane.path, 'a.txt'), 'A changed\n')
      writeFileSync(join(B.lane.path, 'b.txt'), 'B changed\n')
      const keyA = `task:${itemA}:${A.lane.id}:${chatA}`
      const keyB = `task:${itemB}:${B.lane.id}:${chatB}`
      const spawns0 = chatSpawns.length, lanes0 = layoutStore.worktrees().length, sends0 = sends(), ptys0 = (await sessionMap(wc)).size

      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await settle()
      // The scene's column rests folded (the focused card + a toggle); every read below wants it open.
      const openIslands = () => wc.executeJavaScript(`(() => { const t = document.querySelector('[data-orch-islands-toggle][aria-expanded="false"]'); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!t })()`)
      const islandsRead = async () => { await openIslands(); return wc.executeJavaScript(`(() => { const col = document.querySelector('[data-orch-islands]'); if (!col) return null
        return { order: col.getAttribute('data-orch-island-order'), cards: [...col.querySelectorAll('[data-orch-island-id]')].map((c) => ({ id: c.getAttribute('data-orch-island-id'), place: c.querySelector('[data-orch-island-place]')?.textContent ?? null, state: c.querySelector('.orch__float-state')?.textContent ?? null, ambiguous: c.hasAttribute('data-orch-island-ambiguous') })),
          groups: [...col.querySelectorAll('[data-orch-island-group]')].map((gr) => ({ key: gr.getAttribute('data-orch-island-group'), label: gr.querySelector('.orch__island-group-label')?.textContent ?? null, n: gr.querySelectorAll('[data-orch-island-id]').length })), grouping: col.querySelector('[data-orch-grouping]')?.textContent ?? null } })()`) }
      // Folded at rest IN THE SCENE (the List shows the column whole; an earlier block may have left the lens there).
      await click('[data-orch-lens="scene"]')
      const folded = await waitUntil(() => wc.executeJavaScript(`(() => { const col = document.querySelector('[data-orch-islands]'); if (!col) return false; return { open: col.hasAttribute('data-orch-islands-open'), cards: col.querySelectorAll('[data-orch-island-id]').length, toggle: col.querySelector('[data-orch-islands-toggle]')?.textContent ?? null } })()`), 8000)
      // M291. The scene's platform plates carry the island ids the column's cards do.
      const plates = await wc.executeJavaScript(`[...document.querySelectorAll('.orch__graph-scene [data-orch-platform-plate][data-orch-island-id]')].map((e) => e.getAttribute('data-orch-island-id'))`)
      const isl1 = await waitUntil(async () => { const r = await islandsRead(); return r && r.cards.some((c) => c.id === itemA) && r.cards.some((c) => c.id === itemB) ? r : false }, 8000)
      await demo('m288-1-two-islands')
      // A: its own subject, its own file, its own diff.
      await click(`[data-orch-island-id="${itemA}"]`)
      await click('[data-orch-inspector] [data-orch-review-open]')
      const a1 = await waitUntil(async () => { const b = await benchRead(); return b && b.subject === keyA && b.kind === 'changes' && b.files.length > 0 ? b : false }, 10000)
      await click('[data-orch-workbench] [data-orch-review-file="a.txt"]')
      const a2 = await waitUntil(async () => { const b = await benchRead(); return b && b.diffText && /A changed/.test(b.diffText) ? b : false }, 8000)
      await demo('m288-2-island-a-diff')
      // B: nothing of A's survives the switch.
      await click(`[data-orch-island-id="${itemB}"]`)
      const b1 = await waitUntil(async () => { const b = await benchRead(); return b && b.subject === keyB && b.kind === 'changes' && b.files.length > 0 ? b : false }, 10000)
      await settle()
      const b2 = await benchRead()
      await demo('m288-3-island-b-no-a')
      const cardA = isl1.cards.find((c) => c.id === itemA), cardB = isl1.cards.find((c) => c.id === itemB)
      const repoName = repo.split('/').filter(Boolean).pop()
      ok(IDS[0],
        folded && folded.open === false && folded.cards === 0 && /2 islands/.test(String(folded.toggle)) && plates.includes(itemA) && plates.includes(itemB) &&
          isl1 && isl1.cards.length >= 2 && cardA && cardB && /own worktree/.test(cardA.place) && /own worktree/.test(cardB.place) && cardA.place !== cardB.place &&
          new RegExp(`^${A.lane.branch === undefined ? '' : ''}`).test('') && cardA.place.includes(A.lane.branch) && cardB.place.includes(B.lane.branch) && /1 session/.test(cardA.state) &&
          isl1.groups.length === 1 && isl1.groups[0].n >= 2 && isl1.groups[0].label.startsWith(repoName) && /not a supervisor/.test(String(isl1.grouping)) &&
          a1 && a1.files.join() === 'a.txt' && consistent(a1) && a2 && consistent(a2) && a2.diffKey === `${keyA}:a.txt` &&
          b1 && b1.files.join() === 'b.txt' && consistent(b1) && b2 && consistent(b2) && b2.subject === keyB && !/A changed/.test(b2.text) && b2.diffKey === null,
        JSON.stringify({ folded, plates, isl1, a1: a1 && { subject: a1.subject, files: a1.files, controls: a1.controls, diffSubject: a1.diffSubject }, a2: a2 && { diffKey: a2.diffKey }, b1: b1 && { subject: b1.subject, files: b1.files }, b2: b2 && { subject: b2.subject, diffKey: b2.diffKey, hasA: /A changed/.test(b2.text) }, log: cLog.slice(-3) }))

      // orch-islands.app.2 — rapid selection and out-of-order answers, sampled.
      const samples = []
      const sample = async (n, ms) => { for (let i = 0; i < n; i += 1) { samples.push(await benchRead()); await sleep(ms) } }
      await clickAll([`[data-orch-island-id="${itemA}"]`, `[data-orch-island-id="${itemB}"]`, `[data-orch-island-id="${itemA}"]`])
      await sample(12, 25)
      const rapid = await waitUntil(async () => { const b = await benchRead(); return b && b.subject === keyA && b.kind === 'changes' && b.files.join() === 'a.txt' ? b : false }, 10000)
      // A diff in flight when the subject moves: open a.txt and switch to B in one tick.
      await clickAll([`[data-orch-workbench] [data-orch-review-file="a.txt"]`, `[data-orch-island-id="${itemB}"]`])
      await sample(12, 25)
      const late = await waitUntil(async () => { const b = await benchRead(); return b && b.subject === keyB && b.kind === 'changes' && b.files.join() === 'b.txt' ? b : false }, 10000)
      await settle()
      const lateAfter = await benchRead()
      // Two refreshes in one tick on B.
      await clickAll(['[data-orch-workbench] [data-orch-bench-refresh]', '[data-orch-workbench] [data-orch-bench-refresh]'])
      await sample(8, 25)
      const twice = await waitUntil(async () => { const b = await benchRead(); return b && b.subject === keyB && b.kind === 'changes' && b.files.join() === 'b.txt' ? b : false }, 10000)
      await demo('m288-4-after-rapid')
      const mismatches = samples.filter((b) => !consistent(b) || (b && b.subject === keyB && /A changed|a\.txt/.test(b.text)) || (b && b.subject === keyA && /B changed|b\.txt/.test(b.text)))
      ok(IDS[1],
        rapid && consistent(rapid) && late && consistent(late) && lateAfter && lateAfter.subject === keyB && lateAfter.diffKey === null && !/A changed/.test(lateAfter.text) &&
          twice && consistent(twice) && samples.length >= 30 && mismatches.length === 0,
        JSON.stringify({ samples: samples.length, mismatches: mismatches.slice(0, 3).map((b) => b && { subject: b.subject, controls: b.controls, diffSubject: b.diffSubject, diffKey: b.diffKey }), lateAfter: lateAfter && { subject: lateAfter.subject, diffKey: lateAfter.diffKey } }))

      // orch-islands.app.3 — the shared directory.
      shared = mkdtempSync(join(tmpdir(), 'tc panels orch shared-'))
      const gs = (...args) => execFileSync('git', ['-C', shared, ...args], { encoding: 'utf8' })
      gs('init', '-q', '.'); gs('config', 'user.email', 'v@example.com'); gs('config', 'user.name', 'v')
      writeFileSync(join(shared, 's.txt'), 's\n'); gs('add', '-A'); gs('commit', '-qm', 'init')
      await click('[data-dock="orchestration"][aria-pressed="true"]')
      await waitUntil(async () => !(await orchShown()), 3000)
      const mintChat = async (cwd) => {
        const before = await wc.executeJavaScript(`[...document.querySelectorAll('.panel[data-panel-kind="chat"]')].map((p) => p.getAttribute('data-panel-id'))`)
        await wc.executeJavaScript(`window.__m73Chat(${JSON.stringify(cwd)})`)
        return waitUntil(() => wc.executeJavaScript(`(() => { const ids = [...document.querySelectorAll('.panel[data-panel-kind="chat"]')].map((p) => p.getAttribute('data-panel-id')); const n = ids.find((id) => !${JSON.stringify(before)}.includes(id)); return n ?? false })()`), 8000)
      }
      const sendIn = async (id, text) => {
        await waitUntil(() => wc.executeJavaScript(`(() => { const ta = document.querySelector('.panel[data-panel-id="${id}"] [data-chat-input]'); if (!ta || ta.disabled) return false
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true }))
          const b = document.querySelector('.panel[data-panel-id="${id}"] [data-chat-send]'); if (!b || b.disabled) return false
          b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`), 8000)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.panel[data-panel-id="${id}"] [data-chat-state]')?.textContent === 'idle' || false`), 12000)
      }
      const s1 = await mintChat(shared); const s2 = await mintChat(shared)
      sharedIds = [s1, s2]
      await sendIn(s1, 'first writer'); await sendIn(s2, 'second writer')
      writeFileSync(join(shared, 's.txt'), 's changed by someone\n')
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await settle()
      const sharedIslandId = `dir:${shared}`
      const sharedCard = await waitUntil(async () => { const r = await islandsRead(); const c = r && r.cards.find((x) => x.id === sharedIslandId); return c || false }, 8000)
      await click(`[data-orch-island-id="${sharedIslandId}"]`)
      const ambiguity = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('[data-orch-inspector="task"] [data-orch-island-ambiguity]'); return p ? { writers: p.getAttribute('data-orch-island-ambiguity'), text: p.textContent } : false })()`), 6000)
      await click('[data-orch-inspector] [data-orch-review-open]')
      const sharedRead = await waitUntil(async () => { const b = await benchRead(); return b && b.subject === `session:${s1}` && b.kind === 'shared' ? b : false }, 12000)
      const blockedWrite = await wc.executeJavaScript(`document.querySelector('[data-orch-workbench] [data-orch-write-blocked]')?.textContent ?? null`)
      const noWriteButtons = await wc.executeJavaScript(`document.querySelectorAll('[data-orch-workbench] [data-orch-bench-commit], [data-orch-workbench] [data-orch-bench-discard]').length`)
      await demo('m288-5-shared-directory')
      ok(IDS[2],
        sharedCard && sharedCard.ambiguous === true && /2 sessions write here/.test(sharedCard.place) && /shared directory/.test(sharedCard.place) &&
          ambiguity && ambiguity.writers === '2' && /cannot be attributed to this task alone/.test(ambiguity.text) &&
          sharedRead && /authorship is ambiguous/.test(sharedRead.words) && consistent(sharedRead) &&
          typeof blockedWrite === 'string' && /blocked here by name/.test(blockedWrite) && noWriteButtons === 0,
        JSON.stringify({ sharedCard, ambiguity, words: sharedRead && sharedRead.words, blockedWrite, noWriteButtons, log: cLog.slice(-3) }))

      // orch-dep.app.2 — a presentation move dispatches nothing, and is undoable.
      const before = await islandsRead()
      const spawns1 = chatSpawns.length, lanes1 = layoutStore.worktrees().length, sends1 = sends(), ptys1 = (await sessionMap(wc)).size
      // The board lists newest first, so which task island sits second is the board's
      // choice, not this check's: move whichever of A/B is at index 1 up one place.
      const beforeList = before.order.split(' ')
      const mover = beforeList.indexOf(itemB) === 1 ? itemB : itemA
      const idxB = beforeList.indexOf(mover)
      await click(`[data-orch-island-move="up"][data-orch-island-of="${mover}"]`)
      const moved = await waitUntil(async () => { const r = await islandsRead(); return r && r.order !== before.order ? r : false }, 4000)
      const persistedOrder = await waitUntil(() => { layoutStore.flushSync(); const o = layoutStore.initial().orchestrate; return o && Array.isArray(o.islands) && o.islands.join(' ') === moved.order ? o.islands : false }, 6000)
      await settle()
      const spawns2 = chatSpawns.length, lanes2 = layoutStore.worktrees().length, sends2 = sends(), ptys2 = (await sessionMap(wc)).size
      await click('[data-orch-islands] [data-orch-island-undo]')
      const undone = await waitUntil(async () => { const r = await islandsRead(); return r && r.order === before.order ? r : false }, 4000)
      // A new island appends; the others keep their place.
      await click('[data-dock="orchestration"][aria-pressed="true"]')
      await waitUntil(async () => !(await orchShown()), 3000)
      const C = await dispatchLane('Edit c')
      itemC = C.id
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      const appended = await waitUntil(async () => { const r = await islandsRead(); return r && r.order.split(' ').includes(itemC) ? r : false }, 8000)
      await demo('m289-3-moved-and-appended')
      const beforeIds = before.order.split(' ')
      const appendedIds = appended.order.split(' ')
      ok(IDS[3],
        idxB === 1 && moved && moved.order.split(' ').indexOf(mover) === 0 && persistedOrder &&
          spawns2 === spawns1 && lanes2 === lanes1 && sends2 === sends1 && ptys2 === ptys1 &&
          undone && appendedIds[appendedIds.length - 1] === itemC && appendedIds.slice(0, -1).join(' ') === beforeIds.join(' '),
        JSON.stringify({ before: before.order, moved: moved && moved.order, persistedOrder, counts: [[spawns1, spawns2], [lanes1, lanes2], [sends1, sends2], [ptys1, ptys2]], undone: undone && undone.order, appended: appended && appended.order }))

      // orch-limits.app.1 — controls, capability by capability.
      await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      await click('[data-orch-lens="list"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-list-row="${chatA}"] button') !== null`), 6000)
      await click(`[data-orch-list-row="${chatA}"] button`)
      const ctlRead = () => wc.executeJavaScript(`(() => { const i = document.querySelector('[data-orch-inspector="${chatA}"]'); if (!i) return null
        return { controls: [...i.querySelectorAll('[data-orch-control]')].map((b) => ({ id: b.getAttribute('data-orch-control'), title: b.getAttribute('title') })), absent: i.querySelector('[data-orch-control-absent]')?.getAttribute('data-orch-control-absent') ?? null, absentText: i.querySelector('[data-orch-control-absent]')?.textContent ?? null,
          standing: i.querySelector('[data-orch-standing]')?.getAttribute('data-orch-standing') ?? null, standingWord: i.querySelector('[data-orch-standing]')?.textContent ?? null, spend: i.querySelector('[data-orch-spend]')?.getAttribute('data-orch-spend') ?? null, spendWord: i.querySelector('[data-orch-spend]')?.textContent ?? null } })()`)
      const idle = await waitUntil(async () => { const r = await ctlRead(); return r && r.standing === 'idle' ? r : false }, 6000)
      // A permission request: the turn is in flight, waiting on the person.
      await wc.executeJavaScript(`window.canvas.agentSession.send(${JSON.stringify(chatA)}, 'ask: list it')`).catch(() => null)
      const waiting = await waitUntil(async () => { const r = await ctlRead(); return r && r.controls.some((c) => c.id === 'interrupt') ? r : false }, 10000)
      await demo('m290-1-interrupt-offered')
      const sendsBeforeInterrupt = sends()
      await click(`[data-orch-inspector="${chatA}"] [data-orch-control="interrupt"]`)
      const cut = await waitUntil(async () => { const r = await ctlRead(); return r && r.standing === 'interrupted' ? r : false }, 10000)
      const retryOffered = await waitUntil(async () => { const r = await ctlRead(); return r && r.controls.some((c) => c.id === 'retry') ? r : false }, 6000)
      await click(`[data-orch-inspector="${chatA}"] [data-orch-control="retry"]`)
      const preview = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('[data-orch-retry-preview="${chatA}"]'); if (!p) return false; return { target: p.querySelector('[data-orch-retry-target]')?.textContent ?? null, prompt: p.querySelector('.orch__retry-prompt')?.textContent ?? null, note: p.textContent } })()`), 6000)
      await demo('m290-2-retry-preview')
      const chatTitle = await wc.executeJavaScript(`document.querySelector('[data-orch-inspector="${chatA}"] [data-orch-inspector-title]')?.textContent ?? null`)
      const sendsBeforeRetry = sends()
      await click(`[data-orch-retry-preview="${chatA}"] [data-orch-retry-go]`)
      const leftForRetry = await waitUntil(async () => !(await orchShown()), 4000)
      const composer = await waitUntil(() => wc.executeJavaScript(`(() => { const ta = document.querySelector('.panel[data-panel-id="${chatA}"] [data-chat-input]'); return ta && ta.value === 'ask: list it' ? ta.value : false })()`), 6000)
      await settle()
      const sendsAfterRetry = sends()
      ok(IDS[4],
        idle && idle.controls.length === 0 && idle.absent === 'interrupt retry reassign stop' && /reassign — no runtime here can move/.test(idle.absentText) && /stop — /.test(idle.absentText) &&
          waiting && waiting.controls.length === 1 && waiting.controls[0].id === 'interrupt' && /no resumable checkpoint/.test(waiting.controls[0].title) && /process stays up/.test(waiting.controls[0].title) && /rolled back/.test(waiting.controls[0].title) &&
          cut && /cut short/.test(cut.standingWord) && cut.standing !== 'stopped' &&
          retryOffered && retryOffered.controls.some((c) => c.id === 'retry' && /sends nothing/.test(c.title) && /not assumed safe to repeat/.test(c.title)) && !retryOffered.controls.some((c) => c.id === 'interrupt') &&
          preview && preview.target === chatTitle && preview.prompt === 'ask: list it' && /nothing sent/i.test(preview.note) &&
          leftForRetry === true && composer === 'ask: list it' && sendsAfterRetry === sendsBeforeRetry && sends() === sendsBeforeInterrupt,
        JSON.stringify({ idle, waiting, cut, retryOffered, preview: preview && { target: preview.target, prompt: preview.prompt }, chatTitle, leftForRetry, composer, sends: [sendsBeforeInterrupt, sendsBeforeRetry, sendsAfterRetry], log: cLog.slice(-3) }))

      // orch-limits.app.2 — limits and the three answers.
      plainId = await mintChat(repo) // never sent: spend Unknown with its reason
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await settle()
      // The frame is back on the task after a remount: every object again.
      await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      const settingRows = await wc.executeJavaScript(`window.canvas.settings.list()`)
      const maxBefore = settingRows.find((r) => r.id === 'agents.maxConcurrent')?.value ?? 0
      const limitsRead = () => wc.executeJavaScript(`[...document.querySelectorAll('[data-orch-limits] [data-orch-limit]')].map((l) => ({ id: l.getAttribute('data-orch-limit'), kind: l.getAttribute('data-orch-limit-kind'), value: l.querySelector('.orch__limit-value')?.textContent ?? null, coverage: l.getAttribute('title') }))`)
      const lim0 = await waitUntil(async () => { const r = await limitsRead(); return r.length === 4 ? r : false }, 6000)
      await wc.executeJavaScript(`window.canvas.settings.set('agents.maxConcurrent', 2)`)
      const lim1 = await waitUntil(async () => { const r = await limitsRead(); const c = r.find((x) => x.id === 'concurrency'); return c && c.kind === 'enforced' && /of 2 turns/.test(c.value) ? r : false }, 8000)
      await wc.executeJavaScript(`window.canvas.settings.set('agents.maxConcurrent', ${JSON.stringify(Number(maxBefore) || 0)})`)
      await demo('m290-3-limits')
      await click('[data-orch-lens="list"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-list-row="${plainId}"] button') !== null`), 6000)
      await click(`[data-orch-list-row="${plainId}"] button`)
      const unknownSpend = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('[data-orch-inspector="${plainId}"] [data-orch-spend]'); return p ? { kind: p.getAttribute('data-orch-spend'), word: p.textContent } : false })()`), 6000)
      await click(`[data-orch-list-row="${chatB}"] button`)
      const knownSpend = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('[data-orch-inspector="${chatB}"] [data-orch-spend]'); return p && p.getAttribute('data-orch-spend') === 'known' ? { kind: 'known', word: p.textContent } : false })()`), 6000)
      // A killed session: stopped, and said as such.
      const same = (a, b) => { try { return realpathSync(a) === realpathSync(b) } catch { return false } }
      const spB = [...chatSpawns].reverse().find((sp) => sp.cwd === B.lane.path || (sp.cwd && same(sp.cwd, B.lane.path)))
      if (spB) spB.proc.kill()
      const stopped = await waitUntil(() => wc.executeJavaScript(`(() => { const p = document.querySelector('[data-orch-inspector="${chatB}"] [data-orch-standing]'); return p && p.getAttribute('data-orch-standing') === 'stopped' ? p.textContent : false })()`), 10000)
      await demo('m290-4-standings')
      const kindRule = (rows, settings) => rows.every((r) => r.id === 'time' ? r.kind === 'advisory' : true)
      ok(IDS[5],
        lim0 && lim0.map((l) => l.id).join() === 'concurrency,spend,window,time' && lim0.every((l) => (l.kind === 'enforced' || l.kind === 'advisory') && typeof l.coverage === 'string' && l.coverage.length > 20) && kindRule(lim0) &&
          lim0.find((l) => l.id === 'time').value === 'no time limit' && /no runtime here enforces/.test(lim0.find((l) => l.id === 'time').coverage) &&
          lim1 && /terminals and watchers are not counted/.test(lim1.find((l) => l.id === 'concurrency').coverage) &&
          unknownSpend && unknownSpend.kind === 'unknown' && /^Spend: Unknown — /.test(unknownSpend.word) &&
          knownSpend && /^Spend: \$\d/.test(knownSpend.word) && /reported by claude/.test(knownSpend.word) &&
          !!spB && typeof stopped === 'string' && /^stopped — the session exited/.test(stopped),
        JSON.stringify({ lim0, lim1: lim1 && lim1.find((l) => l.id === 'concurrency'), unknownSpend, knownSpend, stopped, log: cLog.slice(-3) }))

      // orch-limits.app.3 — commit and discard, re-checked.
      const gl = (...args) => execFileSync('git', ['-C', A.lane.path, ...args], { encoding: 'utf8' })
      const commits = () => gl('rev-list', '--count', 'HEAD').trim()
      const c0 = commits()
      const outcomeOf = (kind, re) => waitUntil(() => wc.executeJavaScript(`(() => { const o = document.querySelector('[data-orch-workbench] [data-orch-write-outcome]'); return o && o.getAttribute('data-orch-write-outcome') === ${JSON.stringify(kind)} && ${re}.test(o.textContent) ? o.textContent : false })()`), 12000)
      const laneRead = () => waitUntil(async () => { const b = await benchRead(); return b && b.subject === keyA && b.kind === 'changes' && b.files.join() === 'a.txt' }, 10000)
      await click(`[data-orch-island-id="${itemA}"]`)
      await click('[data-orch-workbench] [data-orch-bench-tab-button="changes"]')
      await laneRead()
      // Discard while HEAD still stands at the fork: the lane returns to the committed content.
      await click('[data-orch-workbench] [data-orch-bench-discard]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-workbench] [data-orch-write-go="discard"]:not([disabled])') !== null`), 8000)
      await click('[data-orch-workbench] [data-orch-write-go="discard"]')
      const discarded = await outcomeOf('done', '/restored 1/')
      const aAfterDiscard = readFileSync(join(A.lane.path, 'a.txt'), 'utf8')
      await demo('m290-5-discarded')
      // Commit: lands in the lane, on git's log.
      writeFileSync(join(A.lane.path, 'a.txt'), 'A changed\n')
      await click('[data-orch-workbench] [data-orch-bench-refresh]')
      await laneRead()
      await click('[data-orch-workbench] [data-orch-bench-commit]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-workbench] [data-orch-write-message]') !== null`), 4000)
      await setInput('[data-orch-workbench] [data-orch-write-message]', 'edit a from the workbench')
      await click('[data-orch-workbench] [data-orch-write-go="commit"]')
      const committed = await outcomeOf('done', '/^committed /')
      const c1 = commits()
      const logTop = gl('log', '-1', '--pretty=%s').trim()
      await demo('m290-6-committed')
      // Prepared, then the tree moves under it: refused as moved, nothing written.
      writeFileSync(join(A.lane.path, 'a.txt'), 'A again\n')
      await click('[data-orch-workbench] [data-orch-bench-refresh]')
      await laneRead()
      await click('[data-orch-workbench] [data-orch-bench-commit]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-workbench] [data-orch-write-message]') !== null`), 4000)
      await setInput('[data-orch-workbench] [data-orch-write-message]', 'this must not land')
      writeFileSync(join(A.lane.path, 'a.txt'), 'A moved\n')
      await click('[data-orch-workbench] [data-orch-write-go="commit"]')
      const movedOut = await outcomeOf('moved', '/nothing was committed/')
      const c2 = commits()
      await demo('m290-7-subject-moved')
      // HEAD is past the fork now: a discard to the fork point would undo the commit, so it is refused by name.
      await laneRead()
      await click('[data-orch-workbench] [data-orch-bench-discard]')
      const gated = await outcomeOf('refused', '/HEAD has moved past the point this review compares against/')
      const aNow = readFileSync(join(A.lane.path, 'a.txt'), 'utf8')
      await demo('m290-8-discard-gated')
      ok(IDS[6],
        typeof discarded === 'string' && aAfterDiscard === 'a\n' &&
          typeof committed === 'string' && /^committed [0-9a-f]{10}$/.test(committed) && Number(c1) === Number(c0) + 1 && logTop === 'edit a from the workbench' &&
          typeof movedOut === 'string' && c2 === c1 &&
          typeof gated === 'string' && aNow === 'A moved\n' && commits() === c1,
        JSON.stringify({ discarded, aAfterDiscard, committed, c0, c1, c2, logTop, movedOut, gated, aNow, log: cLog.slice(-3) }))
    } catch (cErr) {
      for (const id of IDS) ok(id, false, 'threw: ' + String(cErr && cErr.message || cErr) + ' | renderer: ' + (cLog.slice(-4).join(' || ') || '(none)'))
    } finally {
      wc.removeListener('console-message', onC)
      if (await orchShown()) await click('[data-dock="orchestration"][aria-pressed="true"]')
      for (const id of [plainId, ...sharedIds]) { if (id) { try { await clickPanelClose(wc, id) } catch { /* best effort */ } } }
      for (const id of [chatA, chatB]) { if (id) { try { await wc.executeJavaScript(`window.__m113.close(${JSON.stringify(id)})`) } catch { /* best effort */ } } }
      try { layoutStore.deleteTeammate('tm-c') } catch { /* best effort */ }
      try { if (repo) rmSync(repo, { recursive: true, force: true }) } catch { /* best effort */ }
      try { if (shared) rmSync(shared, { recursive: true, force: true }) } catch { /* best effort */ }
    }
  }
  // ---------------------------------------------------------------------
  // M291 — the platform scene in the REAL renderer (orch-3d.app.*): hit
  // targets read through document.elementFromPoint at three zooms, and stable
  // placement when a new island lands while the page is open.
  // ---------------------------------------------------------------------
  {
    const click = (q) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(q)}); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
    const orchShown = () => wc.executeJavaScript(`document.querySelector('.shell__orch[data-center-view="orchestration"]') !== null`)
    const demo = async (name) => {
      if (!process.env.TC_DEMO_SHOTS) return
      mkdirSync(process.env.TC_DEMO_SHOTS, { recursive: true })
      writeFileSync(join(process.env.TC_DEMO_SHOTS, `${name}.png`), (await wc.capturePage()).toPNG())
    }
    const IDS = [
      'orch-3d.app.1 every platform, station, checkpoint and artifact is what document.elementFromPoint answers at the centre of its own hit-target, at the resting zoom and after zooming out and in; where a station stands over its plate the station wins, and a checkpoint and an artifact are distinct objects (their own shape word) beside the stations',
      'orch-3d.app.2 placement is stable under a live update: a session minted in a NEW directory while the page is open lands on a new platform in the next cell, every existing platform keeps its cell and (with nothing off-stage) its exact hit-target, and the persisted island order only appends'
    ]
    try {
      state.backend = createDirectBackend('verify: direct (m291 platforms)')
      const home = require('node:os').homedir()
      const repo = mkdtempSync(join(tmpdir(), 'tc panels orch 3d-'))
      const g = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
      g('init', '-q', '.'); g('config', 'user.email', 'v@example.com'); g('config', 'user.name', 'v')
      writeFileSync(join(repo, 'a.txt'), 'a\n'); g('add', '-A'); g('commit', '-qm', 'init')
      // Two agent terminals in the repository (an island of one directory), a
      // watcher there (a checkpoint), a file panel there (an artifact), and one
      // plain terminal at home (the workspace plate). All off the viewport so
      // nothing spawns at boot.
      const term = (id, cwd, agent) => ({ kind: 'terminal', rect: { id, x: 6000, y: 6000, w: 320, h: 220 }, z: 1, spec: { panelId: id, cwd, command: '/bin/sh', args: [], ...(agent ? { agent: 'claude-code' } : {}) } })
      layoutStore.save({
        panels: fromPanels([
          term('pA', repo, true), term('pB', repo, true), term('pH', home, false),
          { kind: 'watcher', rect: { id: 'pW', x: 6000, y: 6400, w: 320, h: 220 }, z: 1, watch: { cwd: repo, command: '/bin/sh', args: ['-c', 'true'], trigger: { kind: 'timer', everyMs: 3600000 } } },
          { kind: 'file', rect: { id: 'pF', x: 6400, y: 6400, w: 320, h: 220 }, z: 1, source: { path: join(repo, 'a.txt') } }
        ]),
        camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
      })
      layoutStore.flushSync()
      const re = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await re
      await settle()
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await click('[data-orch-lens="scene"]')
      await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('.orch__graph-scene [data-orch-platform]').length >= 2 && document.querySelector('.orch__graph-scene [data-node="pW"]') !== null`), 8000)
      await settle()
      // Every hit-target's centre, asked of the DOM: the element there must belong to the same object.
      const HIT_READ = `(() => {
        const out = []
        // Only targets ON the stage: a zoom can carry an object past the scene's
        // clipped box, where the element under its centre is whatever pane sits there.
        const stage = document.querySelector('.orch__graph--ground').getBoundingClientRect()
        const on = (c) => c.x > stage.left + 2 && c.x < stage.right - 2 && c.y > stage.top + 2 && c.y < stage.bottom - 2
        const own = (el) => { const o = el && el.closest('[data-node]'); if (o) return { kind: 'object', id: o.getAttribute('data-node') }; const p = el && el.closest('[data-orch-platform]'); return p ? { kind: 'platform', id: p.getAttribute('data-orch-platform') } : { kind: 'none', id: el ? el.className.baseVal || el.className : null } }
        for (const el of document.querySelectorAll('.orch__graph-scene [data-orch-platform-hit]')) {
          const r = el.getBoundingClientRect(); const c = { x: r.left + r.width / 2, y: r.top + r.height * 0.8 }
          if (on(c)) out.push({ want: { kind: 'platform', id: el.getAttribute('data-orch-platform-hit') }, got: own(document.elementFromPoint(c.x, c.y)), w: r.width })
        }
        for (const el of document.querySelectorAll('.orch__graph-scene [data-node] .orch__cube-hit')) {
          const r = el.getBoundingClientRect(); const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
          const cube = el.closest('[data-node]')
          if (on(c)) out.push({ want: { kind: 'object', id: cube.getAttribute('data-node'), object: cube.getAttribute('data-orch-object') }, got: own(document.elementFromPoint(c.x, c.y)) })
        }
        return out
      })()`
      const wheel = (dy, n) => wc.executeJavaScript(`(() => { const s = document.querySelector('.orch__graph--ground'); const r = s.getBoundingClientRect(); for (let i = 0; i < ${n}; i++) s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: ${dy}, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
      const rest = await wc.executeJavaScript(HIT_READ)
      await demo('m291-1-platforms-rest')
      await wheel(100, 6); await settle()
      const out = await wc.executeJavaScript(HIT_READ)
      const zoomOut = await wc.executeJavaScript(`[...document.querySelectorAll('.orch__graph-scene [data-orch-platform]')].map((e) => e.getAttribute('data-orch-platform-zoom'))`)
      await demo('m291-2-platforms-zoomed-out')
      await wheel(-100, 12); await settle()
      const inn = await wc.executeJavaScript(HIT_READ)
      await demo('m291-3-platforms-zoomed-in')
      await wheel(100, 6); await settle()
      const same = (r) => r.got.kind === r.want.kind && r.got.id === r.want.id
      const kinds = await wc.executeJavaScript(`(() => { const k = (id) => { const c = document.querySelector('.orch__graph-scene [data-node="' + id + '"]'); return c ? { object: c.getAttribute('data-orch-object'), plate: c.querySelector('.orch__cube-role')?.textContent ?? null } : null }; return { pA: k('pA'), pW: k('pW'), pF: k('pF'), pH: k('pH') } })()`)
      const cells = await wc.executeJavaScript(`[...document.querySelectorAll('.orch__graph-scene [data-orch-platform]')].map((e) => ({ id: e.getAttribute('data-orch-platform'), cell: e.getAttribute('data-orch-platform-cell') }))`)
      ok(IDS[0],
        rest.length >= 6 && rest.every(same) && out.length >= 3 && out.every(same) && inn.length >= 1 && inn.every(same) && rest.some((r) => r.want.kind === 'platform') && rest.some((r) => r.want.object === 'station') &&
          kinds.pA && kinds.pA.object === 'station' && kinds.pW && kinds.pW.object === 'checkpoint' && /^check · /.test(String(kinds.pW.plate)) && kinds.pF && kinds.pF.object === 'artifact' && kinds.pF.plate === 'file' &&
          kinds.pH && kinds.pH.object === 'station' && cells.length >= 2,
        JSON.stringify({ rest, out: out.filter((r) => !same(r)), inn: inn.filter((r) => !same(r)), zoomOut, kinds, cells }))

      // orch-3d.app.2 — a new island lands while the page is open.
      const before = await wc.executeJavaScript(`[...document.querySelectorAll('.orch__graph-scene [data-orch-platform]')].map((e) => { const r = e.querySelector('[data-orch-platform-hit]').getBoundingClientRect(); return { id: e.getAttribute('data-orch-platform'), cell: e.getAttribute('data-orch-platform-cell'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) } })`)
      const orderBefore = await wc.executeJavaScript(`document.querySelector('.orch__graph-wrap')?.getAttribute('data-orch-island-order') ?? ''`)
      const camBefore = await wc.executeJavaScript(`(() => { const v = document.querySelector('.orch__minimap-view'); return v ? v.getAttribute('x') + ',' + v.getAttribute('width') : null })()`)
      const repo2 = mkdtempSync(join(tmpdir(), 'tc panels orch 3d-two-'))
      const minted = await wc.executeJavaScript(`window.__m73Chat(${JSON.stringify(repo2)})`)
      const after = await waitUntil(() => wc.executeJavaScript(`(() => { const list = [...document.querySelectorAll('.orch__graph-scene [data-orch-platform]')]; if (list.length !== ${before.length} + 1) return false; return list.map((e) => { const r = e.querySelector('[data-orch-platform-hit]').getBoundingClientRect(); return { id: e.getAttribute('data-orch-platform'), cell: e.getAttribute('data-orch-platform-cell'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) } }) })()`), 8000)
      await settle()
      const orderAfter = await wc.executeJavaScript(`document.querySelector('.orch__graph-wrap')?.getAttribute('data-orch-island-order') ?? ''`)
      const camAfter = await wc.executeJavaScript(`(() => { const v = document.querySelector('.orch__minimap-view'); return v ? v.getAttribute('x') + ',' + v.getAttribute('width') : null })()`)
      await demo('m291-4-new-island-appended')
      const kept = after ? before.every((b) => { const a = after.find((x) => x.id === b.id); return a && a.cell === b.cell }) : false
      const newOne = after ? after.find((a) => !before.some((b) => b.id === a.id)) : null
      const lastCell = before.map((b) => b.cell.split(',').map(Number)).sort((p, q) => (p[1] * 3 + p[0]) - (q[1] * 3 + q[0])).pop()
      const nextIndex = lastCell[1] * 3 + lastCell[0] + 1
      // The camera moves ONLY when the new platform landed off-stage (then the
      // minimap's viewport changed); when it did not move, every rect is exact.
      const camMoved = camBefore !== camAfter
      const rectsKept = after ? before.every((b) => { const a = after.find((x) => x.id === b.id); return a && a.x === b.x && a.y === b.y && a.w === b.w }) : false
      ok(IDS[1],
        minted && minted.kind === 'spawned' && after && kept && newOne && newOne.cell === `${nextIndex % 3},${Math.floor(nextIndex / 3)}` && (rectsKept || camMoved) &&
          orderAfter.startsWith(orderBefore) && orderAfter.length > orderBefore.length && orderAfter.includes(repo2.split('/').pop()),
        JSON.stringify({ minted, before, after, orderBefore, orderAfter, rectsKept, camMoved }))
      await click('[data-dock="orchestration"][aria-pressed="true"]')
      try { rmSync(repo, { recursive: true, force: true }); rmSync(repo2, { recursive: true, force: true }) } catch { /* scratch */ }
    } catch (error) {
      for (const id of IDS) ok(id, false, `threw: ${error && error.stack ? error.stack : error}`)
    }
  }

  // ---------------------------------------------------------------------
  // M292 — semantic zoom, the minimap, Fit / Back, and the MEASURED fixtures
  // (orch-zoom.app.*). The fixtures are 1, 6, 25 and 100 agent sessions spread
  // over directories (one island per ten sessions), seeded through the real
  // store and reloaded; frame time is read off requestAnimationFrame while the
  // camera is driven by wheel events every frame, memory off the renderer's
  // JS heap and its process working set. The numbers go to the console as
  // MEASURE lines for the ledger; the check asserts what must hold at every
  // size: every waiting station is drawn, and the honest overflow count.
  // ---------------------------------------------------------------------
  {
    const click = (q) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(q)}); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
    const orchShown = () => wc.executeJavaScript(`document.querySelector('.shell__orch[data-center-view="orchestration"]') !== null`)
    const demo = async (name) => {
      if (!process.env.TC_DEMO_SHOTS) return
      mkdirSync(process.env.TC_DEMO_SHOTS, { recursive: true })
      writeFileSync(join(process.env.TC_DEMO_SHOTS, `${name}.png`), (await wc.capturePage()).toPNG())
    }
    const IDS = [
      'orch-zoom.app.1 semantic zoom: zoomed out every platform is at task summary (its plate says the state and the counts, idle stations are not drawn, a WAITING station still is); zoomed in the platform shows its stations, then its evidence; Fit all brings every platform on stage, Fit selected frames the focused island, Back returns the previous camera, the breadcrumb names All work › island › object, and the minimap draws every platform with the viewport over them',
      'orch-zoom.app.2 fixtures of 1, 6, 25 and 100 sessions all render: every waiting station is drawn at every size (never behind an overflow), a platform past the cap says +N more with an honest count, a focused platform expands to seat them all, the quality tier is one of full / lean / flat and never stalls the page (the measurement loop completes), and frame time and memory were recorded for the ledger'
    ]
    const dirs = []
    try {
      state.backend = createDirectBackend('verify: direct (m292 zoom)')
      const seed = async (n) => {
        const groups = Math.max(1, Math.ceil(n / 10))
        while (dirs.length < groups) dirs.push(mkdtempSync(join(tmpdir(), `tc panels orch fx${dirs.length}-`)))
        const panels = []
        for (let i = 0; i < n; i++) panels.push({ kind: 'terminal', rect: { id: `fx${i}`, x: 6000 + i * 10, y: 6000, w: 320, h: 220 }, z: 1, spec: { panelId: `fx${i}`, cwd: dirs[i % groups], command: '/bin/sh', args: [], agent: 'claude-code' } })
        layoutStore.save({ panels: fromPanels(panels), camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const re = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await re
        await settle()
        await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
        await waitUntil(orchShown, 3000)
        await click('[data-orch-lens="scene"]')
        await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        // A fifth working, a tenth waiting on a person — the tiers the scene is for.
        const waiting = []
        for (let i = 0; i < n; i++) {
          if (i % 10 === 3) { wc.send('agent:state', { panelId: `fx${i}`, state: 'wants-you' }); waiting.push(`fx${i}`) }
          else if (i % 5 === 1) wc.send('agent:state', { panelId: `fx${i}`, state: 'busy' })
        }
        await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('.orch__graph-scene [data-orch-platform]').length >= ${groups} && !!document.querySelector('.orch__cube-canvas canvas')`), 15000)
        await settle()
        return { groups, waiting }
      }
      const measure = async (label) => {
        // 90 frames, the camera zoomed a notch every frame so every frame is a
        // real repaint (demand mode would otherwise paint nothing, honestly).
        const frames = await wc.executeJavaScript(`new Promise((resolve) => {
          const s = document.querySelector('.orch__graph--ground'); const r = s.getBoundingClientRect()
          const dts = []; let last = performance.now(); let i = 0
          const step = (now) => { dts.push(now - last); last = now; i += 1
            s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: i % 30 < 15 ? 60 : -60, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
            if (i < 90) requestAnimationFrame(step); else resolve(dts.slice(1)) }
          requestAnimationFrame(step) })`)
        const sorted = [...frames].sort((a, b) => a - b)
        const mean = frames.reduce((a, b) => a + b, 0) / frames.length
        const p95 = sorted[Math.floor(sorted.length * 0.95)]
        const heap = await wc.executeJavaScript(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null`)
        const pid = wc.getOSProcessId()
        const metrics = app.getAppMetrics()
        const renderer = metrics.find((m) => m.pid === pid)
        const gpu = metrics.find((m) => m.type === 'GPU')
        const quality = await wc.executeJavaScript(`document.querySelector('.orch__graph-scene')?.getAttribute('data-orch-quality') ?? null`)
        const counts = await wc.executeJavaScript(`({ platforms: document.querySelectorAll('.orch__graph-scene [data-orch-platform]').length, objects: document.querySelectorAll('.orch__graph-scene [data-node]').length, plates: document.querySelectorAll('.orch__graph-scene .orch__plate').length })`)
        const row = { label, meanMs: Math.round(mean * 10) / 10, p95Ms: Math.round(p95 * 10) / 10, heapMB: heap, rendererWorkingSetMB: renderer ? Math.round(renderer.memory.workingSetSize / 1024) : null, gpuWorkingSetMB: gpu ? Math.round(gpu.memory.workingSetSize / 1024) : null, quality, ...counts }
        console.log(`MEASURE ${JSON.stringify(row)}`)
        return row
      }
      const rows = []
      const facts = []
      for (const n of [1, 6, 25, 100]) {
        const { groups, waiting } = await seed(n)
        // BEFORE the quality work: the tier pinned to full (composer, shadows, pools, every plate).
        await wc.executeJavaScript(`window.__tcOrchQuality = 'full'`)
        await sleep(600)
        rows.push(await measure(`${n} sessions · pinned full`))
        // AFTER: adaptive — the tier follows the measured frame.
        await wc.executeJavaScript(`delete window.__tcOrchQuality`)
        await sleep(1200)
        rows.push(await measure(`${n} sessions · adaptive`))
        await click('[data-orch-fit="all"]'); await settle()
        const fact = await wc.executeJavaScript(`(() => {
          const waitingDrawn = [...document.querySelectorAll('.orch__graph-scene [data-node][data-tone="needs-you"]')].map((e) => e.getAttribute('data-node'))
          const more = [...document.querySelectorAll('.orch__graph-scene [data-orch-platform-more]')].map((e) => ({ n: Number(e.getAttribute('data-orch-platform-more')), text: e.querySelector('text')?.textContent ?? '' }))
          return { waitingDrawn, more, platforms: document.querySelectorAll('.orch__graph-scene [data-orch-platform]').length, quality: document.querySelector('.orch__graph-scene')?.getAttribute('data-orch-quality') ?? null }
        })()`)
        facts.push({ n, groups, waiting, ...fact })
        await demo(`m292-fixture-${n}`)
        if (n === 100) {
          // Focus a capped platform: it expands and seats every station.
          const plate = await wc.executeJavaScript(`document.querySelector('.orch__graph-scene [data-orch-platform-more]')?.closest('[data-orch-platform]')?.getAttribute('data-orch-platform') ?? null`)
          if (plate !== null) {
            await wc.executeJavaScript(`(() => { const h = document.querySelector('.orch__graph-scene [data-orch-platform="${plate}"] [data-orch-platform-hit]'); h.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
            await settle()
            const expanded = await wc.executeJavaScript(`(() => { const h = document.querySelector('.orch__graph-scene [data-orch-platform="${plate}"]'); return h ? { expanded: h.hasAttribute('data-orch-platform-expanded'), stations: h.parentElement.querySelectorAll('[data-orch-object="station"]').length, more: h.querySelector('[data-orch-platform-more]') !== null } : null })()`)
            facts[facts.length - 1].expanded = expanded
            await demo('m292-fixture-100-focused')
          }
        }
        await click('[data-dock="orchestration"][aria-pressed="true"]')
        for (let i = 0; i < n; i++) wc.send('agent:state', { panelId: `fx${i}`, state: 'idle' })
      }
      const okFacts = facts.every((f) => f.waiting.every((id) => f.waitingDrawn.includes(id)) && f.platforms >= f.groups && ['full', 'lean', 'flat'].includes(f.quality))
      const big = facts.find((f) => f.n === 100)
      ok(IDS[1],
        okFacts && rows.length === 8 && rows.every((r) => Number.isFinite(r.meanMs)) && big && big.more.length > 0 && big.more.every((m) => /^\+\d+ more · (none|\d+) need you$/.test(m.text)) &&
          big.expanded && big.expanded.expanded === true && big.expanded.more === false && big.expanded.stations >= 10,
        JSON.stringify({ rows, facts: facts.map((f) => ({ n: f.n, groups: f.groups, platforms: f.platforms, waiting: f.waiting.length, drawn: f.waitingDrawn.length, more: f.more, quality: f.quality, expanded: f.expanded })) }))

      // orch-zoom.app.1 — on the 6-session fixture: levels, fit, back, breadcrumb, minimap.
      const { waiting } = await seed(6)
      const wheel = (dy, n) => wc.executeJavaScript(`(() => { const s = document.querySelector('.orch__graph--ground'); const r = s.getBoundingClientRect(); for (let i = 0; i < ${n}; i++) s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: ${dy}, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
      const readLevels = () => wc.executeJavaScript(`(() => ({ levels: [...document.querySelectorAll('.orch__graph-scene [data-orch-platform]')].map((e) => e.getAttribute('data-orch-platform-zoom')), objects: document.querySelectorAll('.orch__graph-scene [data-node]').length, waiting: [...document.querySelectorAll('.orch__graph-scene [data-node][data-tone="needs-you"]')].map((e) => e.getAttribute('data-node')), counts: [...document.querySelectorAll('.orch__graph-scene [data-orch-platform-counts]')].map((e) => e.textContent), view: document.querySelector('.orch__minimap-view')?.getAttribute('width'), plates: document.querySelectorAll('.orch__minimap-plate').length }))()`)
      await wheel(120, 14); await settle()
      const far = await readLevels()
      await demo('m292-1-summary')
      await wheel(-120, 8); await settle()
      const mid = await readLevels()
      await wheel(-120, 14); await settle()
      const near = await readLevels()
      await demo('m292-2-evidence')
      await click('[data-orch-fit="all"]'); await settle()
      const fitted = await wc.executeJavaScript(`(() => { const s = document.querySelector('.orch__graph--ground').getBoundingClientRect(); return [...document.querySelectorAll('.orch__graph-scene [data-orch-platform-hit]')].every((h) => { const r = h.getBoundingClientRect(); return r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1 }) })()`)
      const viewAfterFit = await wc.executeJavaScript(`document.querySelector('.orch__minimap-view')?.getAttribute('width')`)
      await click('.orch__graph-scene [data-orch-platform-plate]'); await settle()
      await click('[data-orch-fit="selected"]'); await settle()
      const viewAfterSel = await wc.executeJavaScript(`document.querySelector('.orch__minimap-view')?.getAttribute('width')`)
      const crumbsSel = await wc.executeJavaScript(`[...document.querySelectorAll('[data-orch-crumb]')].map((e) => e.getAttribute('data-orch-crumb') + ':' + e.textContent)`)
      await click('.orch__graph-scene [data-node="fx0"]'); await settle()
      const crumbsObj = await wc.executeJavaScript(`[...document.querySelectorAll('[data-orch-crumb]')].map((e) => e.getAttribute('data-orch-crumb') + ':' + e.textContent)`)
      await click('[data-orch-camera-back]'); await settle()
      const viewAfterBack = await wc.executeJavaScript(`document.querySelector('.orch__minimap-view')?.getAttribute('width')`)
      await demo('m292-3-breadcrumb-minimap')
      ok(IDS[0],
        far.levels.length >= 1 && far.levels.every((l) => l === 'summary') && far.counts.length >= 1 && far.counts.some((c) => /station/.test(c)) && far.counts.every((c) => c !== '') && waiting.every((id) => far.waiting.includes(id)) && far.objects === far.waiting.length &&
          mid.levels.some((l) => l === 'stations' || l === 'evidence') && mid.objects > far.objects && near.levels.some((l) => l === 'evidence') &&
          fitted === true && far.plates >= 1 && viewAfterFit !== null && viewAfterSel !== null && Number(viewAfterSel) < Number(viewAfterFit) && viewAfterBack === viewAfterFit &&
          crumbsSel.some((c) => c.startsWith('all:All work')) && crumbsSel.some((c) => c.startsWith('platform:')) && crumbsObj.some((c) => /^object:.*station$/.test(c)),
        JSON.stringify({ far, mid: { levels: mid.levels, objects: mid.objects }, near: { levels: near.levels }, fitted, viewAfterFit, viewAfterSel, viewAfterBack, crumbsSel, crumbsObj }))
      await click('[data-dock="orchestration"][aria-pressed="true"]')
      for (let i = 0; i < 6; i++) wc.send('agent:state', { panelId: `fx${i}`, state: 'idle' })
    } catch (error) {
      for (const id of IDS) ok(id, false, `threw: ${error && error.stack ? error.stack : error}`)
    } finally {
      for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }) } catch { /* scratch */ } }
    }
  }

  // ---------------------------------------------------------------------
  // M293 — parity and fallback (orch-parity.app.*): the List holds every scene
  // object with the same actions and sorts; the keyboard walks the scene; the
  // WebGL context is actually DENIED and every essential action survives;
  // reduced motion, a narrow window and the dark theme keep them reachable.
  // ---------------------------------------------------------------------
  {
    const click = (q) => wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(q)}); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
    const orchShown = () => wc.executeJavaScript(`document.querySelector('.shell__orch[data-center-view="orchestration"]') !== null`)
    const demo = async (name) => {
      if (!process.env.TC_DEMO_SHOTS) return
      mkdirSync(process.env.TC_DEMO_SHOTS, { recursive: true })
      writeFileSync(join(process.env.TC_DEMO_SHOTS, `${name}.png`), (await wc.capturePage()).toPNG())
    }
    const IDS = [
      'orch-parity.app.1 the List is the scene\'s equal: every station, checkpoint and artifact the scene draws is a row with its kind, state and island, sortable by each column (ascending, descending, back to scene order), selection syncs both ways, a row\'s double-click and the inspector\'s Open on canvas are the same labelled action, and Enter in the List inspects rather than leaves',
      'orch-parity.app.2 the keyboard reaches every object without a precision click: in the scene the arrow keys step to the nearest object in that direction across platforms, focus follows the selection, Enter hands the keyboard to the inspector\'s Open on canvas, and a double-click on a platform focuses that island and frames it',
      'orch-parity.app.3 with WebGL actually DENIED (getContext returns null for every webgl kind before the page opens) the scene says so, mounts no island, paints flat plates and objects with their words, and a click, the inspector and Open on canvas all still work; under prefers-reduced-motion nothing in the scene animates and the same actions stand',
      'orch-parity.app.4 a narrow window (980px) and the dark theme keep the essential actions on screen and reachable: Scene | List, Fit all, the Needs attention door, the inspector\'s Open on canvas and the workbench tabs all have a visible box inside the viewport'
    ]
    const dirs = []
    const [w0, h0] = win.getSize()
    try {
      state.backend = createDirectBackend('verify: direct (m293 parity)')
      const home = require('node:os').homedir()
      const repo = mkdtempSync(join(tmpdir(), 'tc panels orch parity-')); dirs.push(repo)
      writeFileSync(join(repo, 'notes.txt'), 'n\n')
      const term = (id, cwd, agent, x) => ({ kind: 'terminal', rect: { id, x, y: 6000, w: 320, h: 220 }, z: 1, spec: { panelId: id, cwd, command: '/bin/sh', args: [], ...(agent ? { agent: 'claude-code' } : {}) } })
      const seed = async () => {
        layoutStore.save({
          panels: fromPanels([
            term('qA', repo, true, 6000), term('qB', repo, true, 6400), term('qH', home, false, 6800),
            { kind: 'watcher', rect: { id: 'qW', x: 6000, y: 6400, w: 320, h: 220 }, z: 1, watch: { cwd: repo, command: '/bin/sh', args: ['-c', 'true'], trigger: { kind: 'timer', everyMs: 3600000 } } },
            { kind: 'file', rect: { id: 'qF', x: 6400, y: 6400, w: 320, h: 220 }, z: 1, source: { path: join(repo, 'notes.txt') } }
          ]),
          camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
        })
        layoutStore.flushSync()
        const re = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload(); await re
        await settle()
        await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
        await waitUntil(orchShown, 3000)
        await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      }
      await seed()
      await click('[data-orch-lens="scene"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('.orch__graph-scene [data-node]').length >= 5`), 8000)
      const sceneIds = await wc.executeJavaScript(`[...document.querySelectorAll('.orch__graph-scene [data-node]')].map((e) => e.getAttribute('data-node') + ':' + e.getAttribute('data-orch-object')).sort()`)
      // The List: every scene object, with kind, state and island.
      await click('[data-orch-lens="list"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('[data-orch-list-row]').length >= 5`), 6000)
      const readRows = () => wc.executeJavaScript(`[...document.querySelectorAll('[data-orch-list-row]')].map((r) => ({ id: r.getAttribute('data-orch-list-row'), kind: r.getAttribute('data-orch-list-kind'), cells: [...r.querySelectorAll('td')].map((c) => c.textContent.trim()), selected: r.hasAttribute('data-selected') }))`)
      const rows0 = await readRows()
      const listIds = rows0.map((r) => `${r.id}:${r.kind}`).sort()
      // Titles without the `in task` tag; a tie keeps scene order in both directions.
      const titles = (rows) => rows.map((r) => r.cells[0].replace(/in task$/, ''))
      await click('[data-orch-list-sort-by="name"]'); const asc = titles(await readRows())
      await click('[data-orch-list-sort-by="name"]'); const desc = titles(await readRows())
      await click('[data-orch-list-sort-by="name"]'); const back = (await readRows()).map((r) => r.id)
      const sorts = await wc.executeJavaScript(`[...document.querySelectorAll('.orch__list-table th')].map((t) => t.getAttribute('aria-sort'))`)
      await click('[data-orch-list-sort-by="kind"]'); const byKind = (await readRows()).map((r) => r.kind)
      await click('[data-orch-list-sort-by="kind"]'); await click('[data-orch-list-sort-by="kind"]')
      // Selection syncs: the artifact row selects, the inspector shows it with Open on canvas; then the scene shows the same selection.
      await click('[data-orch-list-row="qF"] button')
      const artifactInspector = await waitUntil(() => wc.executeJavaScript(`(() => { const i = document.querySelector('[data-orch-inspector="qF"]'); return i ? { title: i.querySelector('[data-orch-inspector-title]')?.textContent, state: i.querySelector('[data-orch-inspector-state]')?.textContent, open: i.querySelector('[data-orch-open]')?.textContent, rowOn: document.querySelector('[data-orch-list-row="qF"]')?.hasAttribute('data-selected') } : false })()`), 4000)
      await click('[data-orch-lens="scene"]')
      const sceneOn = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.orch__graph-scene [data-node="qF"]')?.classList.contains('orch__cube--on') || false`), 4000)
      await demo('m293-1-list-parity')
      // Enter on a List row (its button) selects it — the inspector follows the
      // selection, so that IS inspecting — and stays on this page (Phase A's model).
      await click('[data-orch-lens="list"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-list-row="qA"] button') !== null`), 4000)
      wc.focus()
      await wc.executeJavaScript(`(() => { document.querySelector('[data-orch-list-row="qA"] button').focus(); return true })()`)
      // A button's Enter activation rides the keypress: the `char` event is what makes one.
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'char', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      const afterEnter = await waitUntil(() => wc.executeJavaScript(`(() => { const i = document.querySelector('[data-orch-inspector="qA"] [data-orch-open]'); return i ? { focused: 'open', still: document.querySelector('.shell__orch[data-center-view="orchestration"]') !== null } : false })()`), 4000)
      ok(IDS[0],
        sceneIds.length >= 5 && listIds.join() === sceneIds.join() && rows0.some((r) => r.kind === 'checkpoint' && /^checkpoint · watcher/.test(r.cells[1])) && rows0.some((r) => r.kind === 'artifact' && r.cells[2] === 'file') &&
          rows0.every((r) => r.cells[3] !== '') && asc.join() === [...asc].sort((a, b) => a.localeCompare(b)).join() && desc.every((t, i) => i === 0 || desc[i - 1].localeCompare(t) >= 0) && back.join() === rows0.map((r) => r.id).join() &&
          sorts.every((x) => x === 'none' || x === null) && byKind.join() === [...byKind].sort().join() &&
          artifactInspector && artifactInspector.state === 'artifact' && artifactInspector.open === 'Open on canvas' && artifactInspector.rowOn === true && sceneOn === true &&
          afterEnter && afterEnter.focused === 'open' && afterEnter.still === true,
        JSON.stringify({ sceneIds, listIds, rows0: rows0.slice(0, 6), asc, desc, back, sorts, byKind, artifactInspector, sceneOn, afterEnter }))

      // orch-parity.app.2 — the keyboard in the scene.
      await click('[data-orch-lens="scene"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('.orch__graph-scene [data-node]').length >= 5`), 6000)
      await click('[data-orch-fit="all"]'); await settle()
      await click('.orch__graph-scene [data-node="qW"]'); await settle()
      const pos = await wc.executeJavaScript(`Object.fromEntries([...document.querySelectorAll('.orch__graph-scene [data-node]')].map((e) => { const r = e.querySelector('.orch__cube-hit').getBoundingClientRect(); return [e.getAttribute('data-node'), { x: r.left + r.width / 2, y: r.top + r.height / 2 }] }))`)
      wc.focus()
      await wc.executeJavaScript(`document.querySelector('.orch__graph-scene [data-node="qW"]').parentElement.focus()`)
      const press = async (code) => { wc.sendInputEvent({ type: 'keyDown', keyCode: code }); wc.sendInputEvent({ type: 'keyUp', keyCode: code }); await sleep(120) }
      await press('Right')
      const afterRight = await waitUntil(() => wc.executeJavaScript(`(() => { const on = document.querySelector('.orch__graph-scene .orch__cube--on'); if (!on || on.getAttribute('data-node') === 'qW') return false; return { id: on.getAttribute('data-node'), focused: document.activeElement?.querySelector('[data-node]')?.getAttribute('data-node') ?? null } })()`), 3000)
      const walk = [afterRight && afterRight.id]
      for (let i = 0; i < 6 && walk.length < 6; i++) { await press('Right'); const id = await wc.executeJavaScript(`document.querySelector('.orch__graph-scene .orch__cube--on')?.getAttribute('data-node') ?? null`); if (id && !walk.includes(id)) walk.push(id) }
      for (let i = 0; i < 6; i++) { await press('Down'); await press('Left'); const id = await wc.executeJavaScript(`document.querySelector('.orch__graph-scene .orch__cube--on')?.getAttribute('data-node') ?? null`); if (id && !walk.includes(id)) walk.push(id) }
      const rightIsRight = afterRight && pos[afterRight.id] && pos.qW && pos[afterRight.id].x > pos.qW.x
      await press('Return')
      const enterScene = await waitUntil(() => wc.executeJavaScript(`document.activeElement?.hasAttribute('data-orch-open') || false`), 3000)
      // A platform's double-click focuses the island and frames it.
      const viewBefore = await wc.executeJavaScript(`document.querySelector('.orch__minimap-view')?.getAttribute('width')`)
      const plateId = await wc.executeJavaScript(`document.querySelector('.orch__graph-scene [data-orch-platform-plate][data-orch-island-id]')?.getAttribute('data-orch-platform-plate') ?? null`)
      await wc.executeJavaScript(`(() => { const h = document.querySelector('.orch__graph-scene [data-orch-platform="${plateId}"] [data-orch-platform-hit]'); h.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
      await settle()
      const focusedPlate = await wc.executeJavaScript(`(() => ({ on: document.querySelector('.orch__graph-scene [data-orch-platform="${plateId}"]')?.classList.contains('orch__platform-host--on'), view: document.querySelector('.orch__minimap-view')?.getAttribute('width'), crumb: [...document.querySelectorAll('[data-orch-crumb="platform"]')].map((e) => e.textContent).join(), inspector: document.querySelector('[data-orch-inspector]')?.getAttribute('data-orch-inspector') }))()`)
      await demo('m293-2-keyboard-walk')
      ok(IDS[1],
        afterRight && rightIsRight && afterRight.focused === afterRight.id && new Set(walk).size >= 3 && enterScene === true &&
          focusedPlate.on === true && focusedPlate.view !== null && Number(focusedPlate.view) < Number(viewBefore) && focusedPlate.crumb !== '' && focusedPlate.inspector === 'task',
        JSON.stringify({ afterRight, walk, pos, enterScene, viewBefore, focusedPlate }))

      // orch-parity.app.3 — WebGL denied for real, then reduced motion.
      await click('[data-dock="orchestration"][aria-pressed="true"]')
      await wc.executeJavaScript(`(() => { const orig = HTMLCanvasElement.prototype.getContext; window.__tcOrigGetContext = orig; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return /webgl/i.test(String(kind)) ? null : orig.call(this, kind, ...rest) }; return true })()`)
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await click('[data-orch-lens="scene"]')
      const denied = await waitUntil(() => wc.executeJavaScript(`(() => { const s = document.querySelector('.orch__graph-scene'); if (!s || s.getAttribute('data-orch-webgl') !== 'unavailable') return false; return { webgl: s.getAttribute('data-orch-webgl'), canvases: s.querySelectorAll('canvas').length, flatPlates: s.querySelectorAll('[data-orch-flat="platform"]').length, flatObjects: s.querySelectorAll('[data-orch-flat]:not([data-orch-flat="platform"])').length, plates: s.querySelectorAll('[data-orch-platform-plate]').length, words: [...s.querySelectorAll('.orch__cube-role')].map((e) => e.textContent), notice: document.querySelector('[data-orch-webgl-notice]')?.textContent ?? null } })()`), 8000)
      await click('.orch__graph-scene [data-node="qA"]')
      const deniedInspector = await waitUntil(() => wc.executeJavaScript(`(() => { const i = document.querySelector('[data-orch-inspector="qA"]'); return i ? { open: i.querySelector('[data-orch-open]')?.textContent ?? null, on: document.querySelector('.orch__graph-scene [data-node="qA"]')?.classList.contains('orch__cube--on') } : false })()`), 4000)
      await demo('m293-3-webgl-denied')
      await click('[data-orch-inspector="qA"] [data-orch-open]')
      const jumped = await waitUntil(() => wc.executeJavaScript(`document.querySelector('.shell__orch[data-center-view="orchestration"]') === null && document.querySelector('.panel[data-panel-id="qA"]') !== null`), 4000)
      await wc.executeJavaScript(`(() => { HTMLCanvasElement.prototype.getContext = window.__tcOrigGetContext; delete window.__tcOrigGetContext; return true })()`)
      // Reduced motion: the emulated media, then every orch animation must be stood down and the actions stand.
      try { wc.debugger.attach('1.3') } catch { /* attached */ }
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      await click('[data-dock="orchestration"]:not([aria-pressed="true"])')
      await waitUntil(orchShown, 3000)
      await click('[data-orch-lens="scene"]')
      await waitUntil(() => wc.executeJavaScript(`document.querySelectorAll('.orch__graph-scene [data-node]').length >= 5`), 8000)
      wc.send('agent:state', { panelId: 'qB', state: 'wants-you' })
      await settle()
      const reduced = await wc.executeJavaScript(`(() => { const s = document.querySelector('.orch__graph-scene'); const animated = document.getAnimations().filter((a) => a.effect && a.effect.target && s.contains(a.effect.target) && a.playState === 'running').map((a) => (a.animationName || a.constructor.name) + ':' + (a.effect.target.className.baseVal || a.effect.target.className)); return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, animated, webgl: s.getAttribute('data-orch-webgl'), beacon: s.querySelector('[data-node="qB"] .orch__cube-beacon') !== null, fit: !!document.querySelector('[data-orch-fit="all"]'), list: !!document.querySelector('[data-orch-lens="list"]') } })()`)
      await click('.orch__graph-scene [data-node="qB"]')
      const reducedInspector = await waitUntil(() => wc.executeJavaScript(`document.querySelector('[data-orch-inspector="qB"] [data-orch-open]')?.textContent ?? false`), 4000)
      await demo('m293-4-reduced-motion')
      wc.send('agent:state', { panelId: 'qB', state: 'idle' })
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
      ok(IDS[2],
        denied && denied.webgl === 'unavailable' && denied.canvases === 0 && denied.flatPlates >= 2 && denied.flatObjects >= 5 && denied.plates >= 2 && denied.words.some((w) => /^check · /.test(w)) && denied.words.includes('file') && typeof denied.notice === 'string' && /3D|WebGL/i.test(denied.notice) &&
          deniedInspector && deniedInspector.open === 'Open on canvas' && deniedInspector.on === true && jumped === true &&
          reduced.matches === true && reduced.animated.length === 0 && reduced.webgl === 'ready' && reduced.beacon === true && reduced.fit && reduced.list && reducedInspector === 'Open on canvas',
        JSON.stringify({ denied, deniedInspector, jumped, reduced, reducedInspector }))

      // orch-parity.app.4 — narrow and dark.
      win.setSize(980, 700)
      await settle()
      await wc.executeJavaScript(`document.documentElement.setAttribute('data-theme', 'dark')`)
      await click('.orch__graph-scene [data-node="qA"]'); await settle()
      await click('[data-orch-workbench] [role="tab"]').catch(() => null)
      const narrow = await wc.executeJavaScript(`(() => {
        const inside = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }
        return { w: innerWidth, h: innerHeight, theme: document.documentElement.getAttribute('data-theme'),
          lens: inside(document.querySelector('[data-orch-lens="list"]')), fit: inside(document.querySelector('[data-orch-fit="all"]')), attention: inside(document.querySelector('[data-dock="attention"]')) ?? inside(document.querySelector('[data-orch-needs]')),
          open: inside(document.querySelector('[data-orch-inspector] [data-orch-open]')), tabs: inside(document.querySelector('.orch__workbench [role="tab"], [data-orch-workbench] [role="tab"]')), minimap: inside(document.querySelector('[data-orch-minimap]')) }
      })()`)
      await demo('m293-5-narrow-dark')
      await wc.executeJavaScript(`document.documentElement.setAttribute('data-theme', 'light')`)
      win.setSize(w0, h0)
      await settle()
      ok(IDS[3],
        narrow.w <= 990 && narrow.theme === 'dark' && narrow.lens === true && narrow.fit === true && narrow.attention === true && narrow.open === true && narrow.tabs === true && narrow.minimap === true,
        JSON.stringify(narrow))
      await click('[data-dock="orchestration"][aria-pressed="true"]')
    } catch (error) {
      for (const id of IDS) ok(id, false, `threw: ${error && error.stack ? error.stack : error}`)
    } finally {
      try { win.setSize(w0, h0) } catch { /* closed */ }
      try { await wc.executeJavaScript(`(() => { if (window.__tcOrigGetContext) { HTMLCanvasElement.prototype.getContext = window.__tcOrigGetContext; delete window.__tcOrigGetContext } document.documentElement.setAttribute('data-theme', 'light'); return true })()`) } catch { /* reloaded */ }
      try { wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] }) } catch { /* detached */ }
      for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }) } catch { /* scratch */ } }
    }
  }

})
