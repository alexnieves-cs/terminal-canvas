/* The UX pass after 6.0 (notes/ux-proposals.md): first-run doors that were
   wired to nothing, one name per thing, and the loop after an agent runs.
   Plain node. Pure modules are bundled; the wiring that lives in Canvas.tsx
   is read as text, because a callback that was never passed renders a
   button that does nothing and no other suite would notice. Ids are scoped
   (`ux.<area>.<n>`). */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const OUT = join(ROOT, 'out', 'verify', 'ux.cjs')
buildSync({
  stdin: {
    contents: `
      import { probesFromReport, foundAgentIds, agentRows } from '../src/shared/onboarding'
      import { STARTER_LAYOUTS, LINEUP_IDS } from '../src/shared/lineups'
      import { readyReviews, nextReview, arrivedReviews, reviewNotice } from '../src/renderer/shell/ready-review'
      import { quickAccept, QUICK_ACCEPT_MAX_FILES } from '../src/renderer/review/quick-accept'
      import { taskSeedFromPaste } from '../src/shared/paste-task'
      import { parseAdoptable, adoptCommand, adoptSentence, ADOPT_LIST_ARGS } from '../src/shared/tmux-adopt'
      import { matchShortcut } from '../src/shared/shortcuts'
      import { buildTaskQueue } from '../src/renderer/shell/task-queue'
      import { AUTO_VERDICT_WORDS, autoChipWords } from '../src/shared/auto'
      export { buildTaskQueue, AUTO_VERDICT_WORDS, autoChipWords, probesFromReport, foundAgentIds, agentRows, STARTER_LAYOUTS, LINEUP_IDS, readyReviews, nextReview, arrivedReviews, reviewNotice, quickAccept, QUICK_ACCEPT_MAX_FILES, taskSeedFromPaste, parseAdoptable, adoptCommand, adoptSentence, ADOPT_LIST_ARGS, matchShortcut }
    `,
    resolveDir: __dirname,
    sourcefile: 'ux-entry.ts',
    loader: 'ts'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  alias: {
    '@shared': join(ROOT, 'src/shared'),
    '@renderer': join(ROOT, 'src/renderer')
  }
})
const M = require(OUT)
// M507 (the Canvas.tsx split). The hooks M442 appended now live in
// useShellTail.ts, called at the same position, so the canvas's source is
// Canvas.tsx followed by that hook, and only while Canvas still calls it.
const canvasOwn = read('src/renderer/canvas/Canvas.tsx')
const canvas = canvasOwn + (/= useShellTail\(\{/.test(canvasOwn) ? '\n' + read('src/renderer/canvas/useShellTail.ts') : '')

// ── First run ────────────────────────────────────────────────────────────

{
  const report = (over) => ({
    probedAt: 0, shell: { path: '/bin/zsh', ok: true }, pathEntries: [],
    clis: [{ name: 'claude', path: '/opt/homebrew/bin/claude' }, { name: 'codex', path: null }, { name: 'git', path: '/usr/bin/git' }],
    tmux: { kind: 'tmux', reason: '', path: '/opt/homebrew/bin/tmux' }, layout: { path: '', backupWritten: false }, envKeys: [], control: null,
    ...over
  })
  const answered = M.probesFromReport(report({}))
  const silent = M.probesFromReport(report({ shell: { path: '/bin/zsh', ok: false } }))
  const none = M.probesFromReport(null)
  const view = M.agentRows(answered, M.foundAgentIds(answered))
  ok('ux.onboard.1 the agents step reads the env report: a found CLI starts on and lets Continue through; a shell that did not answer is unknown, never missing',
    answered.find((p) => p.id === 'claude').path === '/opt/homebrew/bin/claude' &&
      answered.find((p) => p.id === 'codex').path === null && answered.find((p) => p.id === 'codex').timedOut === undefined &&
      !answered.some((p) => p.id === 'gemini') &&
      view.canContinue === true && view.rows.find((r) => r.id === 'claude').enabled === true &&
      silent.every((p) => p.timedOut === true) && none.length === 0 &&
      M.foundAgentIds(silent).length === 0,
    JSON.stringify({ answered, silent, ready: view.ready }))
}

{
  const ui = read('src/renderer/onboarding/Onboarding.tsx')
  const mount = canvas.slice(canvas.indexOf('<Onboarding\n'), canvas.indexOf('/>', canvas.indexOf('<Onboarding\n')))
  ok('ux.onboard.2 the card is mounted with probes, an enabled list, Skip and the custom door, and its last step hands back answers',
    /probes=\{onboardingProbes\}/.test(mount) && /enabled=\{foundAgentIds\(onboardingProbes\)\}/.test(mount) &&
      /onSkip=\{finishOnboarding\}/.test(mount) && /onCustom=\{/.test(mount) && /completeOnboarding\(answers\)/.test(mount) &&
      /data-onboard-skip/.test(ui) && /onHandoff\?\.\(FIRST_TASK_HANDOFF, \{ workspaceName:/.test(ui),
    mount.slice(0, 200))
}

{
  const complete = canvas.slice(canvas.indexOf('const completeOnboarding'), canvas.indexOf('const onboardingProbes'))
  ok('ux.onboard.3 finishing saves the answers: the workspace is renamed, the first agent turned on becomes the default, and the new-task sheet opens',
    /workspace\.rename\(active\.id, answers\.workspaceName\)/.test(complete) &&
      /preset\.setDefault\(first\)/.test(complete) && /p\.builtIn/.test(complete) &&
      /beginStartWork\(\)/.test(complete),
    complete.length + ' chars')
}

{
  const at = canvas.indexOf('<BlankCanvas')
  const blank = canvas.slice(canvas.lastIndexOf('{onboardingDone', at), canvas.indexOf('/>', canvas.indexOf('onLayout', at)))
  ok('ux.empty.1 the blank card shows only once the launcher is put away, and every button on it is wired',
    /launcherPutAway && \(/.test(blank) && /onStart=\{/.test(blank) && /onQuick=\{/.test(blank) && /onLayout=\{/.test(blank) &&
      /beginStartWork\(\{ title:/.test(blank) && /importCanvas\(\)/.test(blank) && /lineupWhatId\(layout\.lineup\)/.test(blank),
    blank.slice(0, 160))
}

{
  ok('ux.empty.2 every starter layout is a lineup the panel sheet places, or a single shell',
    M.STARTER_LAYOUTS.length > 0 && M.STARTER_LAYOUTS.every((row) => row.lineup === null || M.LINEUP_IDS.includes(row.lineup)) &&
      /initialWhat\?: string/.test(read('src/renderer/palette/SpawnSheet.tsx')) &&
      /model\.initialWhat \?\?/.test(read('src/renderer/palette/SpawnSheet.tsx')),
    JSON.stringify(M.STARTER_LAYOUTS.map((row) => [row.id, row.lineup])))
}

// ── Small lies the UI told ───────────────────────────────────────────────

{
  const approval = read('src/renderer/shell/ApprovalDetail.tsx')
  const shortcuts = read('src/shared/shortcuts.ts')
  ok('ux.words.1 the inline Allow advertises only the chord that is bound, and double-click is named for what it does',
    !/<kbd>Y<\/kbd>/.test(approval) && /Allow once <kbd>⌘Y<\/kbd>/.test(approval) &&
      /id: 'spawn-at-cursor', chord: 'double-click'[^}]*label: 'Place a flowchart step'/.test(shortcuts) &&
      /flowchart\.addShape\('process'/.test(canvas.slice(canvas.indexOf('const onCanvasDoubleClick'))),
    'inline approval and registry')
}

{
  const open = read('src/renderer/settings/open.ts')
  const view = read('src/renderer/settings/SettingsView.tsx')
  ok('ux.settings.1 Settings opens on General then the last page, and Escape closes it unless a recording took the key',
    /let pane: SettingsPaneId = 'general'/.test(open) && /if \(next !== undefined\) pane = next/.test(open) &&
      /event\.key !== 'Escape' \|\| event\.defaultPrevented/.test(view) && /onClose\(\)/.test(view),
    'open.ts and SettingsView')
}


// ── After an agent runs ──────────────────────────────────────────────────

{
  const group = (itemId, kinds) => ({ itemId, title: 'Task ' + itemId, severity: 'review', why: '', next: { label: '', evidence: { kind: 'review', itemId } }, after: '', affects: [], oldest: 0, history: [],
    decisions: kinds.map((kind) => ({ key: kind + ':' + itemId, kind, text: 'the agent finished with changes (2 files) and nothing is verified yet', since: 0, evidence: { kind: 'review', itemId }, affects: '' })) })
  const list = M.readyReviews([group('a', ['review']), group('b', ['permission']), { ...group('c', ['review']), itemId: null }, group('d', ['check', 'review'])])
  const first = M.nextReview(list, null)
  const second = M.nextReview(list, first.itemId)
  const wrapped = M.nextReview(list, second.itemId)
  const gone = M.nextReview(list, 'answered-already')
  const arrived = M.arrivedReviews(list, new Set(['review:a']))
  const words = M.reviewNotice(list[0])
  ok('ux.review.1 ready-to-review is the task queue\'s review decisions; the walk wraps and a stale cursor restarts at the front; only new revisions arrive',
    list.map((r) => r.itemId).join(',') === 'a,d' && first.itemId === 'a' && second.itemId === 'd' && wrapped.itemId === 'a' && gone.itemId === 'a' &&
      M.nextReview([], null) === null && arrived.map((r) => r.itemId).join(',') === 'd' &&
      words.title === 'Ready to review · Task a' && /^The agent finished/.test(words.body),
    JSON.stringify({ list: list.map((r) => r.key), words }))
}

{
  // M507. The jump moved with the panel gestures; Canvas still calls them.
  const gestures = /= usePanelGestures\(\{/.test(canvas) ? read('src/renderer/canvas/usePanelGestures.ts') : ''
  const jump = gestures.slice(gestures.indexOf('jumpAttentionImplRef.current = '), gestures.indexOf('const pillJump'))
  // M506. The notice moved with the attention models; Canvas still calls them.
  const attention = /= useAttentionModels\(\{/.test(canvas) ? read('src/renderer/canvas/useAttentionModels.tsx') : ''
  const notice = attention.slice(attention.indexOf('const readyToReview = '), attention.indexOf('}, [readyToReview, notifySetting])'))
  ok('ux.review.2 ⌘J opens the next review only when nothing needs you, and a newly ready task notifies once, only unfocused and only with notifications on',
    /if \(id === null\) \{\s*const review = nextReview\(readyReviewRef\.current, reviewCursorRef\.current\)/.test(jump) &&
      /boardVerbsRef\.current\.review\?\.\(review\.itemId\)/.test(jump) &&
      /seen === null \|\| notifySetting !== true \|\| document\.hasFocus\(\)/.test(notice) && /arrivedReviews\(readyToReview, seen\)/.test(notice),
    jump.length + ' / ' + notice.length)
}

{
  const passed = (n) => Array.from({ length: n }, (_, i) => ({ outcome: 'passed', key: String(i) }))
  const yes = M.quickAccept({ files: 2, checks: passed(1) })
  const many = M.quickAccept({ files: M.QUICK_ACCEPT_MAX_FILES + 1, checks: passed(1) })
  const unchecked = M.quickAccept({ files: 1, checks: [] })
  const unknown = M.quickAccept({ files: 1, checks: null })
  const red = M.quickAccept({ files: 1, checks: [...passed(1), { outcome: 'failed', key: 'x' }] })
  const node = read('src/renderer/review/ReviewNode.tsx')
  const verb = node.slice(node.indexOf('data-review-task-verb="quick-accept"') - 400, node.indexOf('Review &amp; accept…'))
  ok('ux.land.1 Review & accept is offered only for a small change whose every check passed, records the review, then arms the same plan (Merge stays a separate press)',
    yes.offer === true && many.offer === false && unchecked.offer === false && unknown.offer === false && red.offer === false &&
      /quickAccept\(\{ files: paths\.length, checks: laneChecks \}\)\.offer/.test(verb) &&
      /task\.onMarkReviewed\([^)]*\); task\.onRefresh\(\); accept\.onArm\(\)/.test(verb),
    JSON.stringify({ many, unchecked, red }))
}

{
  const tier = read('src/renderer/palette/navigate-tier.tsx')
  const css = read('src/renderer/styles.css')
  const mount = canvas.slice(canvas.indexOf('<NavigateTier'), canvas.indexOf('/>', canvas.indexOf('<NavigateTier')))
  const dot = css.slice(css.indexOf('.navigate-dot {'), css.indexOf('}', css.indexOf('.navigate-dot {')))
  ok('ux.tier.1 a waiting Plan card answers with the same two verbs, a Map dot is a door, and the world-scale inline approval hides past Work',
    /data-navigate-allow/.test(tier) && /data-navigate-deny/.test(tier) && /onAnswer\(id, approval\.requestId, true\)/.test(tier) &&
      /<button\s+type="button"\s+className="navigate-dot"/.test(tier) && /onOpen\?\.\(id\)/.test(tier) &&
      /pointer-events: auto/.test(dot) && /\.world\[data-zoom-tier\] \.inline-approval-host \{ visibility: hidden; \}/.test(css) &&
      /approvalOf=\{/.test(mount) && /onAnswer=\{/.test(mount) && /onOpen=\{goToPanelOrRequest\}/.test(mount),
    mount.slice(0, 120))
}

{
  const files = ['src/renderer/shell/Dock.tsx', 'src/renderer/shell/ApprovalDetail.tsx', 'src/renderer/world/WorldCardBody.tsx', 'src/renderer/world/WorldFocusSheet.tsx', 'src/renderer/palette/navigate-tier.tsx']
  const approveWord = files.filter((f) => />\s*Approve\s*(<|$)/m.test(read(f)))
  ok('ux.words.2 a permission request is answered "Allow once" on every surface, never "Allow" in one place and "Approve" in another',
    approveWord.length === 0 && files.every((f) => /Allow once/.test(read(f))),
    JSON.stringify(approveWord))
}

// ── Creation doors and words ─────────────────────────────────────────────

{
  const shortcuts = read('src/shared/shortcuts.ts')
  const menu = read('src/main/menu.ts')
  const actions = read('src/main/bootstrap/menu-actions.ts')
  const preload = read('src/preload/index.ts')
  const fileMenu = menu.slice(menu.indexOf("label: 'File'"), menu.indexOf("label: 'Edit'"))
  ok('ux.door.1 New task is a door of its own: ⌘N in the one registry (the default agent moved to ⌘⌥N), the File menu\'s FIRST row, and the menu\'s ask reaches the start sheet, not the panel sheet',
    /id: 'new-task', chord: '⌘N'/.test(shortcuts) && /'new-task': 'beginStartWork'/.test(shortcuts) && /id: 'new-agent', chord: '⌘⌥N'/.test(shortcuts) &&
      fileMenu.indexOf("'New task…'") !== -1 && fileMenu.indexOf("'New task…'") < fileMenu.indexOf("'New panel…'") && /accel\('new-task'\)/.test(fileMenu) &&
      /onNewTask: \(\) => \{ state\.window\?\.webContents\.send\(IPC_EVENTS\.SPAWN_OPEN_SHEET, 'task'\) \}/.test(actions) &&
      /which === 'task' \? 'task' : undefined/.test(preload) && /if \(which === 'task'\) paletteActionsRef\.current\?\.beginStartWork\(\)/.test(canvas),
    fileMenu.slice(0, 200))
}

{
  const menu = read('src/main/menu.ts')
  const dock = read('src/renderer/shell/Dock.tsx')
  const pane = read('src/renderer/shell/TeammatesPane.tsx')
  const sheet = read('src/renderer/palette/SpawnSheet.tsx')
  ok('ux.words.3 the words on screen: a preset is a saved command, a lineup is an arrangement, an agent identity is an agent profile (code ids unchanged)',
    /'New panel from saved command'/.test(menu) && /'Save panel as command'/.test(menu) && !/from preset|as preset/.test(menu) &&
      /\{ id: 'teammates', label: 'Agent profiles'/.test(dock) && />Agent profiles</.test(pane) && !/>Teammates</.test(pane) &&
      />Saved commands</.test(sheet) && />arrangement: \{LINEUPS/.test(sheet) && !/>lineup: /.test(sheet),
    '')
}

// ── The shell ────────────────────────────────────────────────────────────

{
  const shortcuts = read('src/shared/shortcuts.ts')
  const want = [["files-pane", '⌘B'], ['trail-back', '⌘['], ['trail-forward', '⌘]'], ['workspace-prev', '⌘⇧['], ['workspace-next', '⌘⇧]'], ['merged', '⌘⇧A'], ['decisions', '⌘⌥J'], ['shortcuts', '⌘/']]
  const missing = want.filter(([id, chord]) => !shortcuts.includes(`id: '${id}', chord: '${chord}'`)).map(([id]) => id)
  ok('ux.keys.1 every chord that fires is named in the one registry, and ⌘/ opens Settings › Keyboard (an editor or terminal keeps its own ⌘/)',
    missing.length === 0 && /hit\?\.id === 'shortcuts'/.test(canvas) && /openSettingsPage\('keyboard'\)/.test(canvas) && /\.monaco-editor, \.xterm/.test(canvas),
    JSON.stringify(missing))
}

{
  const menu = read('src/renderer/canvas/useCanvasContextMenu.tsx')
  ok('ux.shell.1 the ground\'s right-click promises only what its sheet makes, with note and picture as rows of their own; the env banner\'s fix is a button',
    /label: 'New panel…'/.test(menu) && !/note, picture…/.test(menu) && /createObject\('note'\)/.test(menu) && /createObject\('image'\)/.test(menu) &&
      /data-env-banner-check \{\.\.\.shellControl\(\(\) => palette\.openPalette\('environment'\)\)\}/.test(canvas) && !/Environment… in ⌘K says what was/.test(canvas),
    '')
}

// ── Beyond the window ────────────────────────────────────────────────────

{
  const bar = read('src/main/menu-bar.ts')
  const stores = read('src/main/bootstrap/stores.ts')
  const index = read('src/main/index.ts')
  ok('ux.reach.2 a menu-bar item shows the dock badge\'s own count and opens New task; a system-wide chord opens it too, yielding when another app holds it',
    /badge: \(count\) => \{ app\.dock\?\.setBadge\([^}]*\); menuBarCount\(count\) \}/.test(stores) &&
      /installMenuBar\(\(\) => state\.window\)/.test(index) &&
      /send\(IPC_EVENTS\.SPAWN_OPEN_SHEET, 'task'\)/.test(bar) && /globalShortcut\.register\(NEW_TASK_GLOBAL_CHORD, newTask\)/.test(bar) &&
      /if \(!ok\) console\.warn/.test(bar) && /n > 0 \? String\(n\) : ''/.test(bar) &&
      /if \(typeof id === 'string'\) attentionJumpRef\.current\(id\)\s*else jumpAttentionImplRef\.current\(1\)/.test(canvas),
    '')
}

{
  const S = M.taskSeedFromPaste
  const issue = S('https://github.com/acme/api/issues/42')
  const pr = S(' https://github.com/acme/api/pull/7 ')
  const ci = S('https://github.com/acme/api/actions/runs/123456')
  const jira = S('https://acme.atlassian.net/browse/PAY-881')
  const js = S("TypeError: Cannot read properties of undefined (reading 'id')\n    at load (src/a.ts:3:9)\n    at main (src/b.ts:1:1)")
  const py = S('Traceback (most recent call last):\n  File "app.py", line 4, in <module>\nKeyError: \'x\'')
  const prose = S('remember to buy milk\nand eggs')
  const other = S('https://example.com/page')
  const clip = read('src/renderer/canvas/useCanvasClipboard.ts')
  ok('ux.paste.1 an issue, PR, CI or ticket link, or an error, pasted on the empty canvas opens New task filled in (never started); prose and other links do not',
    issue.title === 'Resolve acme/api#42' && /issues\/42/.test(issue.brief) && pr.title === 'Review acme/api#7' &&
      ci.title === 'Fix the failing CI run' && jira.title === 'Resolve PAY-881' &&
      /^Fix: TypeError/.test(js.title) && /```/.test(js.brief) && /^Fix: KeyError/.test(py.title) &&
      prose === null && other === null && S('') === null &&
      /if \(seed !== null && start !== null\) \{ start\(seed\); return \}/.test(clip) &&
      /getStartTask: \(\) => \(seed\) => paletteActionsRef\.current\?\.beginStartWork\(seed\)/.test(canvas),
    JSON.stringify({ issue, pr, ci, jira, js: js && js.title, py: py && py.title }))
}

{
  const review = read('src/renderer/review/TaskReviewPanel.tsx')
  ok('ux.recipe.1 Save as a recipe opens by itself once the task is verified',
    /data-task-save-recipe open=\{verification\.stage === 'verified' \|\| undefined\}/.test(review), '')
}

{
  // ⌘N is New task and ⌘⌥N the default agent, both matched above the Alt bail.
  const vp = read('src/renderer/canvas/useViewport.ts')
  const k = (alt) => M.matchShortcut({ metaKey: true, altKey: alt, shiftKey: false, ctrlKey: false, code: 'KeyN' })?.id
  const bail = vp.indexOf('if (event.ctrlKey || event.altKey) return')
  const arm = vp.indexOf("if (hit?.id === 'new-task' || hit?.id === 'new-agent')")
  ok('ux.keys.2 ⌘N opens New task and ⌘⌥N starts the default agent, both taken before useViewport\'s Alt bail; no bare case \'n\' is left',
    k(false) === 'new-task' && k(true) === 'new-agent' && arm !== -1 && bail !== -1 && arm < bail &&
      !/case 'n':/.test(vp) && /onNewTask\?\.\(\)/.test(vp) &&
      /onStepWorkspace, onToggleMerged, openNewTask\n/.test(canvas),
    JSON.stringify({ plain: k(false), alt: k(true), arm, bail }))
}

{
  // ⌘J and ⌘Y pass a focus lock; nothing else does.
  ok('ux.lock.1 ⌘J / ⌘⇧J and ⌘Y pass the focus lock (the predicate without it), and shouldIgnoreKeys still includes the lock for every other chord',
    /\(\) => shouldIgnoreKeysButLock\(\) \|\| focusLocked\(\)/.test(canvas) &&
      /\(hit\?\.id === 'jump' \|\| hit\?\.id === 'jump-prev'\) && focusLocked\(\) && !shouldIgnoreKeysButLock\(\)/.test(canvas) &&
      /if \(hit\?\.id === 'allow' && !shouldIgnoreKeysButLock\(\)\) \{/.test(canvas) &&
      /Amended \(the UX pass/.test(read('docs/redesign/DECISIONS.md')), '')
}

{
  // One welcome-back card holds the four return notices, with one Dismiss all.
  const slot = canvas.slice(canvas.indexOf('<WelcomeBack'), canvas.indexOf('</WelcomeBack>'))
  ok('ux.welcome.1 the briefing, Reopened, Unfinished work and the shell banner are sections of one WelcomeBack card whose Dismiss all presses each one\'s Got it',
    slot.includes('{floatBriefing && resumeBanner}') && slot.includes('<ReopenNotice') && slot.includes('<JobRecoveryNotice') && slot.includes('data-env-banner') &&
      /if \(floatBriefing\) dismissReturn\(\)/.test(slot) && /reopen\.acknowledge\(\)/.test(slot) && /jobRecovery\?\.dismiss\(\)/.test(slot) &&
      (canvas.match(/className="env-banner"/g) || []).length === 1 && (canvas.match(/<ReopenNotice\b/g) || []).length === 1,
    slot.slice(0, 160))
}

{
  // Agents already in the person's tmux: read-only listing, one row per session, attach as a client.
  const out = [
    'work\t0\t0\tclaude\t/Users/a/repo\tclaude',
    'work\t0\t1\tzsh\t/Users/a/repo\t',
    'side\t1\t0\tnode\t/Users/a/other\t/opt/homebrew/bin/codex --full-auto',
    'side\t1\t1\tclaude\t/Users/a/other\tclaude',
    'misc\t0\t0\tvim\t/tmp\tvim',
    'garbage'
  ].join('\n')
  const rows = M.parseAdoptable(out)
  const cmd = M.adoptCommand('/opt/homebrew/bin/tmux', 'work:0.0')
  const main = read('src/main/tmux-adopt.ts')
  ok('ux.adopt.1 claude and codex panes are found once per session, the listing is list-panes and nothing else, and a panel attaches as a client with $TMUX unset',
    rows.length === 2 && rows[0].target === 'work:0.0' && rows[0].agent === 'claude' && rows[1].target === 'side:1.0' && rows[1].agent === 'codex' && rows[1].cwd === '/Users/a/other' &&
      M.ADOPT_LIST_ARGS[0] === 'list-panes' && !M.ADOPT_LIST_ARGS.includes('-L') &&
      cmd.command === '/usr/bin/env' && cmd.args.join(' ') === '-u TMUX /opt/homebrew/bin/tmux attach-session -t work:0.0' &&
      /execFile\(tmuxPath, \[\.\.\.ADOPT_LIST_ARGS\]/.test(main) && (main.match(/execFile\(/g) || []).length === 1 &&
      M.adoptSentence(rows) === '2 agents are already running in your tmux.' &&
      /adopt=\{adoptable === null \? null/.test(canvas),
    JSON.stringify(rows))
}

// ── Checked vs agent says done (M476) ─────────────────────────────────────

{
  const ready = (files) => ({ state: 'ready', standing: 'none', files })
  const task = (itemId, title, auto) => ({ itemId, title, members: [`p-${itemId}`], handoff: ready(2), ...(auto === undefined ? {} : { auto }) })
  const q = M.buildTaskQueue({
    now: 1000, inbox: { items: [], snoozed: [] },
    tasks: [task('a', 'Claimed task', { verdict: 'claimed' }), task('b', 'Plain task'), task('c', 'Checked task', { verdict: 'checked', check: 'npm test' })]
  })
  const textOf = (id) => q.groups.find((g) => g.itemId === id).decisions.find((d) => d.kind === 'review')
  const a = textOf('a'), b = textOf('b'), c = textOf('c')
  ok('ux.verdict.1 a review says how the agent\'s done was reached: a checked one names the check that passed and the word "checked"; a claimed one says "agent says done" and that nothing checked it; one with no auto run keeps "nothing is verified yet"',
    c.verdict === 'checked' && /`npm test` passed \(checked\)/.test(c.text) &&
      a.verdict === 'claimed' && a.text.includes(M.AUTO_VERDICT_WORDS.claimed) && /nothing checked it/.test(a.text) &&
      b.verdict === undefined && /nothing is verified yet/.test(b.text) &&
      M.autoChipWords({ mode: 'complete', turn: 1, limit: 8, state: 'done', verdict: 'claimed' }).endsWith(M.AUTO_VERDICT_WORDS.claimed) &&
      M.autoChipWords({ mode: 'complete', turn: 1, limit: 8, state: 'done', verdict: 'checked' }).endsWith('checked'),
    JSON.stringify({ a: a.text, b: b.text, c: c.text }))
  ok('ux.verdict.2 the review queue sorts by it: checked work first (cheapest to finish), then a review with no auto run, then a bare claim — whatever order the tasks came in',
    q.groups.map((g) => g.itemId).join(',') === 'c,b,a',
    JSON.stringify(q.groups.map((g) => g.itemId)))
  const hook = read('src/renderer/shell/useTaskQueue.ts')
  ok('ux.verdict.3 the queue reads each task\'s verdict from its member chats\' snapshots, re-reading when any chat changes — a verdict never passed in would read every task as unverified',
    /getChat\(id\)\.snapshot\?\.auto/.test(hook) && /autoVerdictOf\(a\)/.test(hook) && /\.\.\.\(auto === undefined \? \{\} : \{ auto \}\)/.test(hook) && /chatsVersion\]\)/.test(hook))
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
