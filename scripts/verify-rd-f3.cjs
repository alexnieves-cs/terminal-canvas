/* Lane F3 (M438). The shell frame: shortcut registry, focus lock, title bar,
   pill rest line. rd-f3.0 stays the seam check from Phase 0.

   Plain node. Electron suites (verify:panels on .shell__center-toggle,
   .shell__merge and the View menu) are the macOS half and are not run here. */
'use strict'
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

const css = read('src/renderer/styles.css')
const contracts = read('src/shared/redesign-contracts.ts')
const own = JSON.parse(read('docs/redesign/ownership.json') || '{}')
const open = '/* ── rd:F3 ── */'
const close = '/* ── /rd:F3 ── */'
ok('rd-f3.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes?.['F3']) && own.lanes['F3'].some((g) => g.endsWith('verify-rd-f3.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const outDir = join(ROOT, 'out', 'verify')
mkdirSync(outDir, { recursive: true })
const alias = { '@shared': join(ROOT, 'src', 'shared'), '@renderer': join(ROOT, 'src', 'renderer') }
function bundle(entryRel, outfile) {
  const entry = join(ROOT, entryRel)
  if (!existsSync(entry)) return null
  try {
    buildSync({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'cjs', alias })
    return require(outfile)
  } catch (err) {
    console.log(`bundle ${entryRel} failed: ${err && err.message}`)
    return null
  }
}
const S = bundle('src/shared/shortcuts.ts', join(outDir, 'rd-f3-shortcuts.cjs')) || {}
const P = bundle('src/renderer/canvas/command-pill.ts', join(outDir, 'rd-f3-pill.cjs')) || {}

const SHORTCUTS = Array.isArray(S.SHORTCUTS) ? S.SHORTCUTS : []
const byId = (id) => SHORTCUTS.find((s) => s.id === id)
const chord = (id) => byId(id)?.chord

const CONCEPT = [
  ['new-agent', '⌘N', 'canvas', 'create'],
  ['new-shell', '⌘T', 'canvas', 'create'],
  ['spawn-sheet', '⌘⇧N', 'canvas', 'create'],
  ['make-task', '⌘G', 'canvas', 'create'],
  ['palette', '⌘K', 'canvas', 'navigate'],
  ['jump', '⌘J', 'canvas', 'sessions'],
  ['allow', '⌘Y', 'canvas', 'sessions'],
  ['pause', '⌘.', 'canvas', 'sessions'],
  ['fit-all', '⌘0', 'canvas', 'navigate'],
  ['fit-task', '⌘⇧0', 'canvas', 'navigate'],
  ['tier-work', '⌘1', 'canvas', 'navigate'],
  ['tier-plan', '⌘2', 'canvas', 'navigate'],
  ['tier-map', '⌘3', 'canvas', 'navigate'],
  ['move-left', '⌘←', 'canvas', 'navigate'],
  ['move-right', '⌘→', 'canvas', 'navigate'],
  ['move-up', '⌘↑', 'canvas', 'navigate'],
  ['move-down', '⌘↓', 'canvas', 'navigate'],
  ['step-in', '⌘↵', 'canvas', 'navigate'],
  ['step-out', '⌘Esc', 'canvas', 'navigate'],
  ['tidy', '⌘⇧T', 'canvas', 'navigate'],
  ['sessions', '⌘⇧S', 'canvas', 'sessions'],
  ['focus-lock', '⌘⇧L', 'canvas', 'sessions'],
  ['jump-prev', '⌘⇧J', 'canvas', 'sessions'],
  ['world', '⌘⇧W', 'canvas', 'navigate'],
  ['ask', '⌘L', 'canvas', 'sessions'],
  ['spawn-at-cursor', 'double-click', 'mouse', 'mouse'],
  ['spawn-handoff', 'drag from a port', 'mouse', 'mouse'],
  ['pan', 'Space+drag', 'mouse', 'mouse'],
  ['zoom-scroll', '⌘+scroll', 'mouse', 'mouse'],
  ['zoom-pinch', 'pinch', 'mouse', 'mouse']
]
const TODAY = [
  ['spawn-sheet', '⌘⇧N'],
  ['tidy-alias', '⌘⌥T'],
  ['flip', '⌘⌥F'],
  ['broadcast', '⌘⇧I'],
  ['pill', '⌘⇧Space'],
  ['search', '⌘F'],
  ['navigator', '⌘\\'],
  ['context', '⇧⌘\\']
]
const missingConcept = CONCEPT.filter(([id, c, scope, group]) => {
  const row = byId(id)
  return row === undefined || row.chord !== c || row.scope !== scope || row.group !== group || typeof row.label !== 'string' || row.label.trim() === ''
}).map(([id]) => id)
const missingToday = TODAY.filter(([id, c]) => byId(id)?.chord !== c).map(([id]) => id)
const handlers = S.SHORTCUT_HANDLERS && typeof S.SHORTCUT_HANDLERS === 'object' ? S.SHORTCUT_HANDLERS : {}
const missingHandler = SHORTCUTS.filter((s) => typeof handlers[s.id] !== 'string' || handlers[s.id].trim() === '').map((s) => s.id)
ok('rd-keys.list.1 the registry lists every Key interactions chord, today\'s chords, a label and a handler',
  SHORTCUTS.length > 0 && missingConcept.length === 0 && missingToday.length === 0 && missingHandler.length === 0 &&
  byId('tidy-alias')?.aliasOf === 'tidy',
  JSON.stringify({ missingConcept, missingToday, missingHandler, alias: byId('tidy-alias')?.aliasOf ?? null }))

const planted = SHORTCUTS.length === 0 ? [] : S.duplicateChords?.([...SHORTCUTS, { id: 'dup', chord: SHORTCUTS[0].chord, scope: SHORTCUTS[0].scope, group: 'existing', label: 'dup' }])
ok('rd-keys.dup.1 a duplicate chord within a scope fails, and the live registry has none',
  typeof S.duplicateChords === 'function' && Array.isArray(planted) && planted.length > 0 &&
  S.duplicateChords(SHORTCUTS).length === 0 &&
  new Set(SHORTCUTS.map((s) => s.id)).size === SHORTCUTS.length,
  JSON.stringify({ planted, live: typeof S.duplicateChords === 'function' ? S.duplicateChords(SHORTCUTS) : null }))

const conflicts = Array.isArray(S.SHORTCUT_CONFLICTS) ? S.SHORTCUT_CONFLICTS : []
ok('rd-keys.conflict.1 ⌘K is recorded as clear in Claude and macOS terminals',
  conflicts.some((c) => c.chord === '⌘K' && /clear/i.test(`${c.note} ${c.owner}`) && /terminal|claude/i.test(`${c.note} ${c.owner}`)) &&
  byId('terminal-clear')?.chord === '⌘K' && byId('terminal-clear')?.scope === 'panel' &&
  byId('palette')?.scope === 'canvas',
  JSON.stringify(conflicts))

const menu = read('src/main/menu.ts')
const nav = read('src/renderer/canvas/useKeyboardNav.ts')
const HISTORICAL = [
  ['spawn-sheet', 'CmdOrCtrl+Shift+N'],
  ['tidy-alias', 'CmdOrCtrl+Alt+T'],
  ['flip', 'CmdOrCtrl+Alt+F'],
  ['undo', 'CmdOrCtrl+Z'],
  ['redo', 'Shift+CmdOrCtrl+Z'],
  ['copy', 'CmdOrCtrl+C'],
  ['paste', 'CmdOrCtrl+V']
]
const accelMismatch = typeof S.electronAccelerator === 'function'
  ? HISTORICAL.filter(([id, accel]) => S.electronAccelerator(id) !== accel).map(([id, accel]) => `${id}→${S.electronAccelerator(id)} expected ${accel}`)
  : ['no electronAccelerator']
ok('rd-keys.menu.1 menu accelerators come from the registry',
  /electronAccelerator\(/.test(menu) && !/accelerator:\s*['"]/.test(menu) && accelMismatch.length === 0 &&
  /@shared\/shortcuts|shortcuts/.test(nav),
  JSON.stringify({ raw: /accelerator:\s*['"]/.test(menu), accelMismatch, navImports: /shortcuts/.test(nav) }))

function ev(code, mods) {
  return { code, key: '', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, ...mods }
}
function lockHolds() {
  if (typeof S.setFocusLock !== 'function' || typeof S.yieldsToTerminal !== 'function' || typeof S.canvasChordStandsDown !== 'function') return false
  const canvas = SHORTCUTS.filter((s) => s.scope === 'canvas')
  if (canvas.length === 0 || !canvas.some((s) => s.id === 'focus-lock')) return false
  const stood = canvas.every((s) => S.canvasChordStandsDown(s, true) === (s.id !== 'focus-lock'))
  const open = canvas.every((s) => S.canvasChordStandsDown(s, false) === false)
  S.setFocusLock('panel-1')
  const locked = S.yieldsToTerminal(ev('KeyK')) === true &&
    S.yieldsToTerminal(ev('KeyN')) === true &&
    S.yieldsToTerminal(ev('KeyL', { shiftKey: true })) === false &&
    S.focusLocked?.() === true
  S.setFocusLock(null)
  const clear = S.yieldsToTerminal(ev('KeyK')) === false && S.focusLocked?.() === false
  return stood && open && locked && clear
}
ok('rd-keys.lock.1 while focus is locked every canvas chord stands down except ⌘⇧L', lockHolds(), 'predicate')

const top = read('src/renderer/shell/TopBar.tsx')
const chrome = read('src/renderer/shell/useShellChrome.ts')
const f3css = (() => {
  const a = css.indexOf(open)
  const b = css.indexOf(close)
  return a >= 0 && b > a ? css.slice(a, b) : ''
})()
ok('rd-frame.nav.1 CenterView gains sessions and review, and the title bar keeps the class hooks',
  /export type CenterView = [^;\n]*'sessions'/.test(chrome) && /'review'/.test(chrome.match(/export type CenterView = [^\n]+/)?.[0] ?? '') &&
  /shell__center-toggle/.test(top) && /shell__merge/.test(top) && /shell__view-menu/.test(top) &&
  /id: 'sessions'/.test(top) && /id: 'review'/.test(top) && /id: 'canvas'/.test(top) && /id: 'orchestration'/.test(top) &&
  /Find or run anything/.test(top) && /Search panels, files, tasks, commands/.test(top) && /\+ New task/.test(top) &&
  /shell__sessions/.test(top) && !/\$3\.12|today/.test(top) &&
  /data-seg=\{o\.id\}/.test(read('src/renderer/primitives/SegmentedControl.tsx')),
  'title bar source')

ok('rd-frame.count.1 the session count never prints a zero or a dollar, and 7 is "7 sessions"',
  typeof P.sessionCountLabel === 'function' && P.sessionCountLabel(7) === '7 sessions' && P.sessionCountLabel(1) === '1 session' &&
  P.sessionCountLabel(0) === '' && P.sessionCountLabel(-2) === '' && P.sessionCountLabel(Number.NaN) === '' &&
  !/\$/.test(P.sessionCountLabel(7)) &&
  typeof P.sessionsBadgeLabel === 'function' && P.sessionsBadgeLabel(0) === null && P.sessionsBadgeLabel(2) === '2' && P.sessionsBadgeLabel(Number.NaN) === null,
  JSON.stringify({ seven: P.sessionCountLabel?.(7), zero: P.sessionCountLabel?.(0), badge0: P.sessionsBadgeLabel?.(0) }))

const line = P.attentionPillLine?.([
  { id: 'a', kind: 'approval', panelId: 'p', taskId: null, sentence: 'Codex wants to edit ledger.ts', since: 1, verb: 'Allow' },
  { id: 'b', kind: 'question', panelId: 'q', taskId: null, sentence: 'later sentence', since: 2, verb: 'Answer' }
])
ok('rd-pill.line.1 the rest line follows queue order and the mockup sentence, and never shows a zero',
  line === '2 agents need you · Codex wants to edit ledger.ts · Go ⌘J · + New ⌘N' &&
  P.attentionPillLine?.([]) === '' &&
  P.attentionPillLine?.(null) === '' &&
  P.attentionPillLine?.([{ id: 'a', kind: 'failed', panelId: 'p', taskId: null, sentence: '  ', since: 1, verb: 'Open' }]) === '1 agent needs you · Go ⌘J · + New ⌘N' &&
  !/^0\b| · 0\b/.test(line ?? '0') &&
  typeof P.pillRestState === 'function' && P.pillRestState({ attention: 2, running: 0, selected: 0 }).text === '2 panels need you',
  JSON.stringify({ line }))

ok('rd-pill.act.1 the pill acts through the palette executor',
  /beginStartWork/.test(read('src/renderer/canvas/CommandPill.tsx')) && /useAttentionQueue/.test(read('src/renderer/canvas/CommandPill.tsx')) &&
  /useAttentionQueue/.test(read('src/renderer/shell/Dock.tsx')) && /useAttentionQueue/.test(top),
  'import sites')

ok('rd-host.1 Sessions and Review are empty mount points, and Sessions links to Orchestrate',
  /data-sessions-host/.test(read('src/renderer/sessions/SessionsHost.tsx')) &&
  /data-sessions-orchestrate/.test(read('src/renderer/sessions/SessionsHost.tsx')) &&
  /Orchestrate/.test(read('src/renderer/sessions/SessionsHost.tsx')) &&
  /data-review-host/.test(read('src/renderer/review/ReviewHost.tsx')),
  'hosts')

ok('rd-keys.lockmark.1 a locked panel can show a lock mark from the F3 stylesheet',
  /\.panel\[data-focus-lock\]/.test(f3css) && /data-focus-lock/.test(nav),
  'css + stamp')

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
const canvasSrc = read('src/renderer/canvas/Canvas.tsx')
const ignoreAt = canvasSrc.indexOf('const shouldIgnoreKeys = useCallback')
const ignoreBody = ignoreAt >= 0 ? strip(canvasSrc.slice(ignoreAt, ignoreAt + 1600)) : ''
const paletteSrc = strip(read('src/renderer/palette/usePalette.ts'))
const kAt = paletteSrc.indexOf("event.key !== 'k'")
const kBody = kAt >= 0 ? paletteSrc.slice(kAt, kAt + 400) : ''
ok('rd-keys.yield.1 shouldIgnoreKeys and the palette stand down while focus is locked, before ⌘K is swallowed',
  /focusLocked\(\)/.test(ignoreBody) && /from '@shared\/shortcuts'/.test(canvasSrc) &&
  /if \(focusLocked\(\)\) return/.test(kBody) &&
  kBody.indexOf('focusLocked()') < kBody.indexOf('preventDefault'),
  'canvas predicate and palette branch')

ok('rd-host.mount.1 Canvas mounts Sessions and Review and passes the session count; TopBar does not portal them',
  /SessionsHost/.test(canvasSrc) && /ReviewHost/.test(canvasSrc) && /sessionCount=/.test(canvasSrc) &&
  /shell__page/.test(canvasSrc) && !/createPortal/.test(top),
  'mount sites')

const commands = read('src/renderer/palette/commands.ts')
const doorAt = commands.indexOf("id: 'canvas.orchestration'")
const door = doorAt >= 0 ? commands.slice(doorAt, doorAt + 280) : ''
ok('rd-door.orch.1 the palette row says Show Orchestrate and keeps its id',
  /title: 'Show Orchestrate'/.test(door) && /data-view-orchestrate/.test(top),
  door.slice(0, 160))

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
