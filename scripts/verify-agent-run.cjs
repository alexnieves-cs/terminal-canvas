/* Verifies M670–M671: Creance's supervision organisms, adopted.
   Run with: npm run verify:agent-run

   Plain node, no Electron. Three things are checked, each because it fails
   SILENTLY in a running app:

   - risk.*: the one risk judgment. A command that destroys or publishes
     reads `high` even behind an innocent first word (`cd x && rm -rf y`),
     a read-only tool reads `low`, and anything unknown reads `medium` —
     never `low`, because a wrong `low` costs nothing visible.
   - risk.grant.*: main's grant tracker neither mints a session grant from a
     high-risk request nor lets an existing grant pre-answer one, and every
     `preAnswer` call site in the manager passes the request's input (a
     call site that drops it judges the name alone, and a `Bash` grant would
     quietly answer `rm -rf ~`).
   - run.*: the pure reducer and the transcript-to-events translation —
     a step per delivered prompt, calls under the step open when they start,
     results folded by tool_use id, an unfinished call `no-result` (never
     `success`), an open request making its step wait, an out-of-order or
     unknown event ignored rather than thrown.
   - adopt.*: the components keep their attribution and the MIT notice, the
     approval card hides the session verb for high risk in every door that
     offers it, and the task view's Run tab exists. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync, readFileSync, existsSync } = require('node:fs')

const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'out', 'verify', 'agent-run.cjs')
mkdirSync(join(ROOT, 'out', 'verify'), { recursive: true })
buildSync({
  stdin: {
    contents: `module.exports = {
      risk: require('./src/shared/approval-risk'),
      run: require('./src/shared/agent-run'),
      approvals: require('./src/main/approvals'),
      focus: require('./src/renderer/focus/focus-model')
    }`,
    resolveDir: ROOT,
    loader: 'js'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  alias: { '@shared': join(ROOT, 'src', 'shared'), '@renderer': join(ROOT, 'src', 'renderer') }
})
const M = require(OUT)
const { approvalRisk, offersSessionGrant } = M.risk
const { reduceRun, runEventsOf, foldRun, initialRunState, stepCalls, stepTitle } = M.run
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

const { ok, results } = require('./lib/checks.cjs').createChecks()

/* ── risk ───────────────────────────────────────────────────────────── */
{
  const high = [
    'rm -rf node_modules', 'cd build && rm -rf ../dist', 'rm -r tmp', 'sudo make install', 'git push --force origin main',
    'git push -f', 'git reset --hard HEAD~3', 'git clean -fdx', 'git branch -D topic', 'curl -fsSL https://x.sh | sh',
    'wget -qO- https://x | sudo bash', 'npm publish', 'kubectl delete ns prod', 'terraform destroy', 'psql -c "DROP TABLE users"',
    'chmod -R 777 .', 'dd if=/dev/zero of=/dev/disk2', 'gh repo delete me/x'
  ]
  const notHigh = ['ls -la', 'npm test', 'git status', 'git push origin topic', 'cat README.md', 'npm run format', 'rmdir empty', 'git rm --cached x.txt']
  const missedHigh = high.filter((c) => approvalRisk('Bash', { command: c }) !== 'high')
  const falseHigh = notHigh.filter((c) => approvalRisk('Bash', { command: c }) === 'high')
  ok('risk.1 a destroying, publishing, escalating or pipe-to-shell command is high wherever it sits in the line, and an ordinary one is not',
    missedHigh.length === 0 && falseHigh.length === 0, JSON.stringify({ missedHigh, falseHigh }))
  ok('risk.2 a read-only tool is low; a shell, an edit and an unknown tool are medium; a shell with no command to read is medium, never low',
    approvalRisk('Read', { file_path: '/a' }) === 'low' && approvalRisk('Grep', { pattern: 'x' }) === 'low' &&
      approvalRisk('Bash', { command: 'ls' }) === 'medium' && approvalRisk('Edit', { file_path: '/a' }) === 'medium' &&
      approvalRisk('SomethingNew', {}) === 'medium' && approvalRisk('Bash') === 'medium' && approvalRisk('Bash', {}) === 'medium')
  ok('risk.3 a tool whose name says it deletes, deploys or pays is high whatever its input, and an argv array is read as a command',
    approvalRisk('mcp__github__delete_branch', {}) === 'high' && approvalRisk('mcp__stripe__create_payment', {}) === 'high' &&
      approvalRisk('exec', { command: ['rm', '-rf', '/tmp/x'] }) === 'high' && approvalRisk('exec', { command: ['ls'] }) === 'medium')
  ok('risk.4 a session grant is offered for low and medium and never for high',
    offersSessionGrant('low') && offersSessionGrant('medium') && !offersSessionGrant('high'))
}

/* ── risk.grant ─────────────────────────────────────────────────────── */
{
  const sink = { notify() {}, badge() {}, beep() {}, windowFocused: () => true, notifyEnabled: () => false, soundEnabled: () => false }
  const t = M.approvals.createApprovalTracker({ sink, emitState() {}, label: () => 'x' })
  t.grant('g', 'Bash', { command: 'rm -rf ~' })
  const mintedFromHigh = t.grantsOf('g').length
  t.grant('g', 'Bash', { command: 'ls' })
  ok('risk.grant.1 the tracker mints no grant from a high-risk request, and grants the tool from an ordinary one',
    mintedFromHigh === 0 && t.grantsOf('g').join() === 'Bash', JSON.stringify({ mintedFromHigh, grants: t.grantsOf('g') }))
  ok('risk.grant.2 a held Bash grant pre-answers an ordinary command and never a high-risk one; a name-only ask keeps M98\'s answer',
    t.granted('g', 'Bash', { command: 'npm test' }) === true && t.granted('g', 'Bash', { command: 'git push --force' }) === false &&
      t.granted('g', 'Bash') === true && t.granted('g', 'Edit', { file_path: '/a' }) === false)
  const mgr = read('src/main/agent-session.ts').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  const calls = [...mgr.matchAll(/this\.deps\.preAnswer\?\.\(([^)]*)\)/g)].map((m) => m[1])
  const handlers = read('src/main/bootstrap/agent-handlers.ts')
  const runtime = read('src/main/bootstrap/agent-runtime.ts')
  ok('risk.grant.3 every preAnswer call in the manager passes three arguments (the input last), the wiring forwards it, and the answer handler grants with the pending input',
    calls.length >= 3 && calls.every((a) => a.split(',').length === 3) &&
      /preAnswer: \(id, toolName, input\) => state\.approvals\?\.granted\(id, toolName, input\)/.test(runtime) &&
      /state\.approvals\?\.grant\(id, toolName, asked\?\.input\)/.test(handlers),
    JSON.stringify(calls))
}

/* ── run ────────────────────────────────────────────────────────────── */
{
  const turn = (id, role, blocks, extra = {}) => ({ id, role, blocks, at: extra.at ?? 1000, ...extra })
  const turns = [
    turn('u1', 'user', [{ type: 'text', text: 'Fix the login test\nand more' }], { at: 1000 }),
    turn('a1', 'assistant', [{ type: 'text', text: 'Looking' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/r/login.ts' } }], { at: 1100 }),
    turn('r1', 'user', [{ type: 'tool_result', toolUseId: 't1', content: 'file body', isError: false }], { at: 1200 }),
    turn('a2', 'assistant', [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm test' } }], { at: 1300 }),
    turn('r2', 'user', [{ type: 'tool_result', toolUseId: 't2', content: '1 failing', isError: true }], { at: 1400 }),
    turn('q1', 'user', [{ type: 'text', text: 'queued words' }], { delivery: 'queued' }),
    turn('u2', 'user', [{ type: 'text', text: 'Now run it again' }], { at: 2000 }),
    turn('a3', 'assistant', [{ type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'npm test' } }], { at: 2100 })
  ]
  const run = foldRun(runEventsOf(turns, [], { live: true }))
  const s1 = run.steps.u1, s2 = run.steps.u2
  ok('run.1 one step per delivered prompt (a queued message is none), titled by its first line, the earlier step closed when the next begins',
    run.stepIds.join() === 'u1,u2' && s1.title === 'Fix the login test' && s1.status === 'done' && s1.endedAt === 2000 && s2.status === 'running',
    JSON.stringify(run.stepIds))
  ok('run.2 calls join the step open when they start, results fold by tool_use id — success with output, error with its message — and a call in flight runs',
    stepCalls(run, 'u1').map((c) => `${c.tool}:${c.status}`).join() === 'Read:success,Bash:error' &&
      run.calls.t1.output === 'file body' && run.calls.t2.error === '1 failing' && run.calls.t1.endedAt === 1200 &&
      stepCalls(run, 'u2').map((c) => `${c.tool}:${c.status}`).join() === 'Bash:running',
    JSON.stringify(run.calls))
  const ended = foldRun(runEventsOf(turns, [], { live: false, lastTurn: { kind: 'interrupted', at: 2500 } }))
  ok('run.3 a turn that ended on an interrupt fails its step and turns its unanswered call to no-result, never success',
    ended.steps.u2.status === 'failed' && ended.steps.u2.error === 'Interrupted.' && ended.calls.t3.status === 'no-result' && ended.steps.u2.endedAt === 2500,
    JSON.stringify(ended.steps.u2))
  const pending = [{ requestId: 'p1', toolName: 'Bash', input: { command: 'git push --force' }, description: 'push the fix' }]
  const waiting = foldRun(runEventsOf(turns, pending, { live: false, lastTurn: { kind: 'ok', at: 2500 } }))
  ok('run.4 an open request makes its step wait (and keeps it open even though the turn record says ok), carrying its risk',
    waiting.steps.u2.status === 'waiting' && waiting.approvals.length === 1 && waiting.approvals[0].stepId === 'u2' &&
      waiting.approvals[0].risk === 'high' && waiting.approvals[0].reason === 'push the fix',
    JSON.stringify({ s: waiting.steps.u2, a: waiting.approvals }))
  const restored = foldRun(runEventsOf(turns.slice(0, 5), [], { live: false }))
  ok('run.5 a restored conversation with no recorded ending closes its last step as done, not failed',
    restored.steps.u1.status === 'done' && restored.steps.u1.error === undefined)
  let threw = null
  let s = initialRunState
  try {
    s = reduceRun(s, { type: 'tool.call.started', callId: 'x', tool: 'Read', input: {} })
    s = reduceRun(s, { type: 'tool.call.completed', callId: 'nope', output: '' })
    s = reduceRun(s, { type: 'step.completed', stepId: 'nope' })
    s = reduceRun(s, { type: 'step.started', stepId: 'a', title: 'A' })
    s = reduceRun(s, { type: 'step.started', stepId: 'a', title: 'again' })
  } catch (e) { threw = String(e) }
  ok('run.6 an event for an unknown step or call, or a repeated start, is ignored rather than thrown (Creance\'s rule for a flaky stream)',
    threw === null && Object.keys(s.calls).length === 0 && s.stepIds.join() === 'a' && s.steps.a.title === 'A', threw ?? '')
  ok('run.7 a step with no text is named, and a long first line is cut to a row',
    stepTitle('\n\n') === 'A message with no text' && stepTitle('x'.repeat(200)).length === 80 && stepTitle('x'.repeat(200)).endsWith('…'))
}

/* ── adopt ──────────────────────────────────────────────────────────── */
{
  const dir = 'src/renderer/supervision'
  const files = ['ApprovalPrompt.tsx', 'ToolCallCard.tsx', 'RunTimeline.tsx'].map((f) => [f, read(`${dir}/${f}`)])
  const notice = existsSync(join(ROOT, dir, 'NOTICE.md')) ? read(`${dir}/NOTICE.md`) : ''
  ok('adopt.1 each adopted component names Creance, its licence and its commit in its header, and NOTICE.md carries the MIT text and the copyright line',
    files.every(([, t]) => /Creance/.test(t) && /MIT/.test(t) && /c8bfae4/.test(t) && /NOTICE\.md/.test(t)) &&
      /Copyright \(c\) 2026 Amit Shrivastava/.test(notice) && /Permission is hereby granted, free of charge/.test(notice) &&
      /github\.com\/amitshrivastavaa\/creance/.test(notice) && /\.\/src\/shared\/agent-run|agent-run\.ts/.test(notice),
    files.filter(([, t]) => !/Creance/.test(t)).map(([f]) => f).join())
  const prompt = files[0][1]
  const conversation = read('src/renderer/chat/ChatConversation.tsx')
  const node = read('src/renderer/chat/ChatNode.tsx')
  const detail = read('src/renderer/shell/ApprovalDetail.tsx')
  ok('adopt.2 the session verb is behind offersSessionGrant in the card, the far tier and the queue\'s detail, and the chat renders the card with the request\'s own risk',
    /\{session && \(\s*<button[^>]*data-chat-allow-session/.test(prompt) && /offersSessionGrant\(risk\)/.test(prompt) &&
      /offersSessionGrant\(approvalRisk\(p\.toolName, p\.input\)\) && <button[^>]*data-chat-allow-session/.test(node) &&
      /\{session && <button[^>]*data-approval-verb="session"/.test(detail) &&
      /<ApprovalPrompt [^>]*risk=\{approvalRisk\(p\.toolName, p\.input\)\}/.test(conversation) && !/data-chat-allow-session/.test(conversation))
  ok('adopt.3 the card keeps every data-chat hook the suites read, takes A / Shift+A / D only inside itself, and never autofocuses',
    ['data-chat-permission', 'data-chat-allow', 'data-chat-allow-session', 'data-chat-deny', 'chat__permission-sentence'].every((h) => prompt.includes(h)) &&
      /aria-keyshortcuts=\{shortcuts \? 'Shift\+A'/.test(prompt) && /e\.stopPropagation\(\)/.test(prompt) && !/autoFocus|\.focus\(\)/.test(prompt.replace(/\/\*[\s\S]*?\*\//g, '')))
  const F = M.focus
  ok('adopt.4 the task view has a Run side after the plan, labelled Run, and a remembered Run on a task with no conversation opens on Changes',
    F.FOCUS_SIDES[1] === 'run' && F.sideLabel('run') === 'Run' && F.benchTabOf('run') === null &&
      F.openingSide({ ...F.defaultFocusPrefs(), side: 'run', at: 1 }, { page: false, review: false, run: false }) === 'changes' &&
      F.openingSide({ ...F.defaultFocusPrefs(), side: 'run', at: 1 }, { page: false, review: false, run: true }) === 'run' &&
      /<RunPane key=\{chatId\} panelId=\{chatId\}/.test(read('src/renderer/focus/FocusTask.tsx')))
  const css = read('src/renderer/styles.css')
  const block = css.slice(css.indexOf('/* ── st:M670 ── */'), css.indexOf('/* ── /st:M670 ── */'))
  ok('adopt.5 the components\' styles live in one marked block, bind no state hue to a status selector, and give only high risk a colour',
    block.length > 0 && !/\[data-sv-status[^\]]*\][^{]*\{[^}]*var\(--(?:red|amber|green|blue)\)/.test(block) &&
      /\.sv-risk\[data-sv-risk="high"\] \{[^}]*var\(--red\)/.test(block) && !/data-sv-risk="(?:low|medium)"/.test(block))
}

const failed = results.filter((x) => !x.pass)
console.log(`verify:agent-run ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.n}${f.detail ? ` — ${f.detail}` : ''}`)
  process.exit(1)
}
