/* Lane W4 (M452). Focus and act. Plain node. Ids stay scoped.
   rd-w4.0 stays: the seam is still the registration proof.

   Watched red before world-select grew the focus slot: esbuild failed to
   export engageFocus, so the suite exited on the bundle and rd-w4.focus.1
   never passed. Restored by adding the slot the checks call. */
'use strict'
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

const css = read('src/renderer/styles.css')
const contracts = read('src/shared/redesign-contracts.ts')
const own = JSON.parse(read('docs/redesign/ownership.json') || '{}')
const open = '/* ── rd:W4 ── */'
const close = '/* ── /rd:W4 ── */'
ok('rd-w4.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['W4']) && own.lanes['W4'].some((g) => g.endsWith('verify-rd-w4.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const OUT = join(ROOT, 'out', 'verify', 'rd-w4.cjs')
buildSync({
  stdin: {
    contents: `export { engageFocus, clearFocus, focusedAgent, selectedAgent, selectAgent, focusPrimary, replyRoute, replyControl, focusQuestion, focusCrumb, diffPreview, focusSteps, FOCUS_SHEET_PX, SHELL_REPLY_REASON, setFocusPreview, focusPreview } from '../src/renderer/world/world-select'`,
    resolveDir: __dirname,
    sourcefile: 'rd-w4-entry.ts'
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: OUT,
  external: ['electron'],
  logLevel: 'silent'
})
const SEL = require(OUT)

SEL.selectAgent(null)
SEL.clearFocus()
SEL.setFocusPreview(null)
SEL.engageFocus('codex')
ok('rd-w4.focus.1 a focus selects that robot and names it followed; clearing drops both, and the slot is not persisted',
  SEL.selectedAgent() === 'codex' && SEL.focusedAgent() === 'codex' &&
  (SEL.clearFocus(), SEL.focusedAgent() === null && SEL.selectedAgent() === null) &&
  !/localStorage/.test(read('src/renderer/world/world-select.ts')))

ok('rd-w4.primary.1 one control is filled: Approve while a request is pending, Open in Canvas when nothing is',
  SEL.focusPrimary(true) === 'approve' && SEL.focusPrimary(false) === 'open')

const send = SEL.replyControl(SEL.replyRoute({ canSend: true, agentTerminal: false }), false)
const paste = SEL.replyControl(SEL.replyRoute({ canSend: false, agentTerminal: true }), true)
const pasteClosed = SEL.replyControl(SEL.replyRoute({ canSend: false, agentTerminal: true }), false)
const shell = SEL.replyControl(SEL.replyRoute({ canSend: false, agentTerminal: false }), false)
const replySheet = read('src/renderer/world/WorldFocusSheet.tsx')
const replyCanvas = read('src/renderer/canvas/Canvas.tsx')
const replyPub = read('src/renderer/world/useWorldContextPublisher.ts')
const shellCard = replySheet.slice(replySheet.indexOf('function ShellConsoleCard'), replySheet.indexOf('export function WorldFocusSheet'))
ok('rd-w4.reply.2 an agent terminal reply pastes and submits from the sheet; a plain shell is refused and the shell card has no reply field',
  /agentTerminal: actions\?\.agentTerminal\(id\)/.test(replySheet) &&
  /actions\.pasteReply\(id, text\)/.test(replySheet) &&
  /handle\.paste\(text\)/.test(replyCanvas) && /handle\.write\('\\r'\)/.test(replyCanvas) &&
  /SHELL_REPLY_REASON/.test(replyPub) && /panel\.spec\.agent !== undefined/.test(replyPub) &&
  !/<textarea/.test(shellCard))

ok('rd-w4.reply.1 a chat sends, an agent terminal pastes once a door exists, and a plain shell stays closed with one reason',
  send.enabled === true && send.reason === null &&
  paste.enabled === true && paste.reason === null &&
  pasteClosed.enabled === false &&
  shell.enabled === false && shell.reason === SEL.SHELL_REPLY_REASON && SEL.SHELL_REPLY_REASON === 'answer in its terminal')

const pending = SEL.focusQuestion(null, 'a', { argument: 'rm -rf build', description: 'remove the build', requestId: 'r1' }, null)
const quiet = SEL.focusQuestion(null, 'a', undefined, 'Waiting on you')
const preview = { agentId: 'a', question: 'from the shot', diff: 'shot diff', requestId: 'shot', taskTitle: 'Export', steps: [] }
ok('rd-w4.ask.1 the question is the approval, else the ask line, and a shot preview wins for that robot only',
  pending.question === 'remove the build' && pending.diff === 'rm -rf build' && pending.requestId === 'r1' &&
  SEL.focusPrimary(pending.requestId !== null) === 'approve' &&
  quiet.requestId === null && quiet.question === 'Waiting on you' && SEL.focusPrimary(false) === 'open' &&
  SEL.focusQuestion(preview, 'a', undefined, null).question === 'from the shot' &&
  SEL.focusQuestion(preview, 'b', { argument: 'x', requestId: 'r' }, null).requestId === 'r' &&
  SEL.focusQuestion(null, 'a', { argument: 'rm -rf build', requestId: 'r2' }, 'Waiting on you').question === 'Waiting on you')

const many = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n')
ok('rd-w4.diff.1 Full diff is the whole argument; the folded view keeps the first lines',
  SEL.diffPreview(many, false).split('\n').length === 8 && SEL.diffPreview(many, true) === many &&
  SEL.diffPreview('one', false) === 'one')

ok('rd-w4.crumb.1 the breadcrumb is World, the task, then the agent, and a missing task is the room',
  SEL.focusCrumb('Ledger CSV export', 'Codex').join(' › ') === 'World › Ledger CSV export › Codex' &&
  SEL.focusCrumb(null, 'Codex')[1] === 'Room' && SEL.focusCrumb('  ', 'Codex')[1] === 'Room')

const steps = [{ id: '1', title: 'Read the schema', word: 'Finished — not verified', tone: 'done' }]
ok('rd-w4.steps.1 plan steps come from the task, and the shot preview replaces them for that robot',
  SEL.focusSteps(null, 'a', steps).length === 1 && SEL.focusSteps(null, 'a', steps)[0].tone === 'done' &&
  SEL.focusSteps({ ...preview, steps: [{ id: 's', title: 'Shot', word: 'Working', tone: 'kind' }] }, 'a', steps)[0].title === 'Shot' &&
  SEL.focusSteps(preview, 'b', steps)[0].title === 'Read the schema')

ok('rd-w4.sheet.1 the sheet is 400px of plain DOM: no three, no bridge, and the width is the one constant',
  SEL.FOCUS_SHEET_PX === 400 &&
  !/from '(?:three|@react-three\/fiber|@react-three\/drei)/.test(read('src/renderer/world/WorldFocusSheet.tsx')) &&
  !/window\.canvas/.test(read('src/renderer/world/WorldFocusSheet.tsx')) &&
  !/agentSession/.test(read('src/renderer/world/WorldFocusSheet.tsx')) &&
  /actions\.answer\(/.test(read('src/renderer/world/WorldFocusSheet.tsx')) &&
  /actions\.send\(/.test(read('src/renderer/world/WorldFocusSheet.tsx')) &&
  /actions\?\.open\(/.test(read('src/renderer/world/WorldFocusSheet.tsx')) &&
  /shortcutById\('allow'\)/.test(read('src/renderer/world/WorldFocusSheet.tsx')) &&
  /shortcutById\('step-in'\)/.test(read('src/renderer/world/WorldFocusSheet.tsx')) &&
  /data-world-focus-sheet/.test(read('src/renderer/world/WorldFocusSheet.tsx')) &&
  /role="dialog"/.test(read('src/renderer/world/WorldFocusSheet.tsx')))

const span = css.slice(css.indexOf(open), css.indexOf(close))
ok('rd-w4.css.1 the sheet width and the diff face live in the W4 span, with no state hex',
  /width:\s*400px/.test(span) && /\.world-focus__diff code\s*\{[^}]*font-family:\s*var\(--font-mono\)/.test(span) &&
  !/#[0-9a-fA-F]{3,8}/.test(span))

const chrome = read('src/renderer/world/WorldChrome.tsx')
const view = read('src/renderer/world/WorldView.tsx')
ok('rd-w4.camera.1 the glide is useWorldCamera().follow, Esc fits the room, and ⌘Esc sets the plan tier',
  /useWorldCamera\(camera\)/.test(chrome) && /\.follow\(\)/.test(chrome) && /\.fit\(\)/.test(chrome) &&
  /setTier\('plan'\)/.test(chrome) && /chord\?\.id === 'step-out'/.test(chrome) &&
  /chord\?\.id === 'step-in'/.test(chrome) && /door!\.open\(id\)/.test(chrome) &&
  /engageFocus\(id\)/.test(chrome) && /data-world-crumb/.test(chrome) &&
  /data-world-focus=/.test(view) && !/new THREE\.PerspectiveCamera/.test(view))

const card = read('src/renderer/world/WorldCard.tsx') + read('src/renderer/world/WorldCardBody.tsx')
ok('rd-w4.chip.1 the focused robot\'s ask chip approves through the same answer door',
  /data-world-ask-approve/.test(card) && /actions\.answer\(agentId, asked\.requestId, true\)/.test(card))

SEL.setFocusPreview(preview)
ok('rd-w4.preview.1 the shot preview is a slot on the same store, cleared by null, and not persisted',
  SEL.focusPreview().question === 'from the shot' && (SEL.setFocusPreview(null), SEL.focusPreview() === null))

const chat = read('src/renderer/chat/ChatConversation.tsx')
const chatNode = read('src/renderer/chat/ChatNode.tsx')
const presets = read('src/renderer/canvas/palette-actions/presets.ts')
const publisher = read('src/renderer/world/useWorldContextPublisher.ts')
const answerFn = chat.slice(chat.indexOf('export function answerRequest'), chat.indexOf('export function ChatConversation'))
const chatCall = 'answerRequest(id, snapshot, props.teammateName ?? BACKENDS[backend].label, requestId, allow, scope)'
ok('rd-w4.history.1 a World answer files the permission row only when it names the tool; a chat answer does not, and the palette uses the same writer',
  /recordPermissionAnswer\(/.test(answerFn) && /accepted === true && history !== undefined/.test(answerFn) &&
  /answerRequest\(agentId, getChat\(agentId\)\.snapshot/.test(publisher) &&
  /toolName: asked\.toolName/.test(publisher) && /argument: asked\.argument/.test(publisher) &&
  /recordPermissionAnswer\(/.test(presets) && !/recordOrchEvent\(/.test(presets) &&
  chat.includes(chatCall) && chatNode.includes(chatCall) && !chatNode.includes('history'),
  'history')

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
