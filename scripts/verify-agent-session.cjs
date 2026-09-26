/* Verifies M71's agent-session runtime: the shared transcript schema and
   its line parser, the headless argv builder, and AgentSessionManager
   driven through a FAKE process runner that replays streams recorded from
   the real `claude` CLI (2.1.259, 2026-09-03) in chunks the suite chooses.
   Run with: npm run verify:agent-session

   Plain node, no Electron, no network, no real CLI. Every check here guards
   a failure that is SILENT in a running app: a record split across two reads
   parsed twice (a turn counted twice) or never (a turn that vanished); a dead
   process's last line landing in a session recreated at its id (M61's PTY
   bug, reached by a second layer with the same shape); a truncated stream
   leaving a session "streaming" with nothing to stream; a permission request
   nobody can answer; a cost summed across turns when the CLI already
   reports it cumulatively.

   The fixtures under scripts/fixtures/agent-session/ are scrubbed recordings
   — paths, hook outputs, tool lists and memory paths removed, session and
   message ids kept stable — and every record type the spec names is in at
   least one of them. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync, readFileSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'agent-session.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'agent-session-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  // A REAL value crosses the boundary here (agent-session-args.ts imports
  // AGENT_CAPABILITIES through main/agent-args.ts), so this alias is
  // load-bearing, not pre-emptive: without it the build throws at module
  // scope and the suite has zero checks to report.
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const M = require(OUT)
const T = M.transcript
const S = M.session
const A = M.args
const Q = M.quit
const LOG = M.log || {}
const IMP = M.importer || {}
const { mkdtempSync, rmSync, readdirSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')

const { ok, results } = require('./lib/checks.cjs').createChecks()

const FIX = join(__dirname, 'fixtures', 'agent-session')
const fixture = (name) =>
  readFileSync(join(FIX, name), 'utf8').split('\n').filter((l) => l.trim() !== '')
const tick = (ms) => new Promise((r) => setTimeout(r, ms))
const A_MARK = () => (M.auto && M.auto.AUTO_DONE_MARKER) || 'AUTO-DONE'
const has = (events, pred) => events.some(pred)
const count = (events, pred) => events.filter(pred).length

/* ------------------------------------------------------------------------ */
/* The parser                                                                */
/* ------------------------------------------------------------------------ */

{
  const events = fixture('turn.jsonl').map(T.parseStreamLine)
  const session = events.find((e) => e.type === 'session')
  const delta = events.find((e) => e.type === 'block-delta' && e.delta === 'text')
  const assistant = events.find((e) => e.type === 'assistant')
  const result = events.find((e) => e.type === 'result')
  ok('transcript.1 a one-word turn parses to session, deltas, a merged assistant record and a priced result',
    session !== undefined && session.sessionId === '11111111-1111-4111-8111-111111111111' &&
      session.model === 'claude-haiku-4-5-20251001' && session.version === '2.1.259' &&
      delta !== undefined && delta.text === 'pong' && delta.index === 1 &&
      assistant !== undefined && assistant.messageId === 'msg_011Ceh8AxCyGv82ek6GgUTAs' &&
      result !== undefined && result.ok === true && result.subtype === 'success' &&
      result.stopReason === 'end_turn' && result.usage !== undefined &&
      result.usage.input === 9 && result.usage.output === 45 &&
      result.usage.cacheWrite === 66763 && result.usage.cacheRead === 0 &&
      Math.abs(result.costUsd - 0.13376) < 1e-9 && result.text === 'pong' &&
      count(events, (e) => e.type === 'malformed') === 0 &&
      count(events, (e) => e.type === 'unknown') === 0,
    JSON.stringify({ session, delta, result: result && { ok: result.ok, usage: result.usage, cost: result.costUsd } }))
}

{
  const events = fixture('tool-turn.jsonl').map(T.parseStreamLine)
  const toolUse = events.find((e) => e.type === 'assistant' && e.blocks.some((b) => b.type === 'tool_use'))
  const block = toolUse && toolUse.blocks.find((b) => b.type === 'tool_use')
  const user = events.find((e) => e.type === 'user')
  const resultBlock = user && user.blocks[0]
  const inputDeltas = events.filter((e) => e.type === 'block-delta' && e.delta === 'input-json')
  ok('transcript.2 a tool call is a tool_use block with its input, the tool result a user event, and its input streamed as input-json deltas',
    block !== undefined && block.name === 'Bash' && block.id === 'toolu_01XzdSn1CpPP18YaYBidsAFC' &&
      block.input.command === 'echo tc-fixture-42' &&
      user !== undefined && user.replay === false && resultBlock !== undefined &&
      resultBlock.type === 'tool_result' && resultBlock.toolUseId === block.id &&
      resultBlock.content === 'tc-fixture-42' && resultBlock.isError === false &&
      inputDeltas.length === 4 && inputDeltas.map((d) => d.text).join('').includes('echo tc-fixture-42'),
    JSON.stringify({ block, resultBlock, deltas: inputDeltas.length }))
}

{
  const events = fixture('permission.jsonl').map(T.parseStreamLine)
  const req = events.find((e) => e.type === 'permission-request')
  const init = events.find((e) => e.type === 'control-response')
  ok('transcript.3 a can_use_tool control request is a permission-request carrying the tool, its input and the tool_use id; a control response carries its request id',
    req !== undefined && req.requestId === '0dd6eeca-c65d-47a5-86b3-b5f6ea9dcd60' &&
      req.toolName === 'Bash' && req.input.command === 'cat /etc/hosts | head -2' &&
      req.toolUseId === 'toolu_01L6rSjQyu2WJQa9nsuthzxr' &&
      typeof req.description === 'string' &&
      init !== undefined && init.requestId === 'init-1' && init.ok === true,
    JSON.stringify({ req, init }))
}

{
  // The carry rule. A read can land mid-record; the split point here is
  // inside the JSON so neither half parses on its own.
  const lines = fixture('turn.jsonl')
  const whole = lines.join('\n') + '\n'
  const cut = whole.indexOf('"text_delta"') + 5
  const first = T.parseStreamChunk(whole.slice(0, cut), '')
  const second = T.parseStreamChunk(whole.slice(cut), first.carry)
  const all = [...first.events, ...second.events]
  const deltas = all.filter((e) => e.type === 'block-delta' && e.delta === 'text')
  const clean = T.parseStreamChunk(lines[0] + '\n', '')
  ok('transcript.carry a record split across two chunks lands exactly once, and a chunk ending on a newline carries nothing',
    first.carry.length > 0 && !first.carry.endsWith('\n') &&
      deltas.length === 1 && deltas[0].text === 'pong' &&
      all.length === lines.length &&
      count(all, (e) => e.type === 'malformed') === 0 &&
      clean.carry === '' && clean.events.length === 1,
    JSON.stringify({ carryLen: first.carry.length, total: all.length, expected: lines.length }))
}

{
  const bad = ['{not json', '[1,2]', 'null', '"a string"', '42'].map(T.parseStreamLine)
  ok('transcript.malformed a line that is not a JSON object is a malformed event with a bounded preview, never a throw',
    bad.every((e) => e.type === 'malformed' && typeof e.preview === 'string' && e.preview.length <= 80),
    JSON.stringify(bad))
  const long = T.parseStreamLine('{' + 'x'.repeat(500))
  ok('transcript.malformed.b the preview is capped so a 500-byte garbage line does not become a 500-byte log line',
    long.type === 'malformed' && long.preview.length <= 80, String(long.preview.length))
}

{
  const unknownTop = T.parseStreamLine('{"type":"telepathy","x":1}')
  const unknownSys = T.parseStreamLine('{"type":"system","subtype":"weather"}')
  const progress = T.parseStreamLine('{"type":"tool_progress","tool":"x"}')
  const status = T.parseStreamLine('{"type":"system","subtype":"status","status":"requesting"}')
  const noType = T.parseStreamLine('{"subtype":"init"}')
  ok('transcript.unknown an unseen top-level type or system subtype is reported as unknown with its kind; a known-but-useless record is ignored with its kind; a missing type is malformed',
    unknownTop.type === 'unknown' && unknownTop.kind === 'telepathy' &&
      unknownSys.type === 'unknown' && unknownSys.kind === 'system/weather' &&
      progress.type === 'ignored' && progress.kind === 'tool_progress' &&
      status.type === 'ignored' && status.kind === 'system/status' &&
      noType.type === 'malformed',
    JSON.stringify({ unknownTop, unknownSys, progress, status, noType }))
}

{
  // rate_limit_event is live usage state, not IGNORED_TOP: a depleted window
  // must not look like a stuck agent, and the gauge needs both windows.
  const rate = T.parseStreamLine(fixture('turn.jsonl').find((l) => l.includes('"rate_limit_event"')))
  const limited = T.parseStreamLine(JSON.stringify({
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'rejected',
      resetsAt: 1788480000,
      rateLimitType: 'five_hour',
      isUsingOverage: true,
      unifiedWindows: {
        five_hour: { utilization: 1, resetsAt: 1788480000 },
        seven_day: { utilization: 0.9, resetsAt: 1788685200 }
      }
    }
  }))
  const absent = T.parseStreamLine('{"type":"rate_limit_event"}')
  const badWin = T.parseStreamLine(JSON.stringify({
    type: 'rate_limit_event',
    rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 'x', resetsAt: null } } }
  }))
  ok('rate-limit.1 rate_limit_event parses to a typed event with status, overage, and each window\'s utilization and resetsAt; an absent info is malformed; a present-but-malformed window is dropped, never coerced',
    rate.type === 'rate-limit' && rate.status === 'allowed' && rate.overage === false &&
      rate.windows.five_hour && rate.windows.five_hour.utilization === 0.02 && rate.windows.five_hour.resetsAt === 1788480000 &&
      rate.windows.seven_day && rate.windows.seven_day.utilization === 0.46 && rate.windows.seven_day.resetsAt === 1788685200 &&
      limited.type === 'rate-limit' && limited.status === 'rejected' && limited.overage === true &&
      limited.windows.five_hour && limited.windows.five_hour.utilization === 1 &&
      absent.type === 'malformed' &&
      badWin.type === 'rate-limit' && badWin.windows.five_hour === undefined,
    JSON.stringify({ rate, limited, absent, badWin }))
}

{
  // Three states, never two: none / allowed / limited-until-T. Collapsing
  // "no event" with "allowed at 0%" is how a depleted window looked stuck.
  const RL = M.rateLimit
  const none = RL.RATE_LIMIT_NONE
  const allowedEvt = T.parseStreamLine(fixture('turn.jsonl').find((l) => l.includes('"rate_limit_event"')))
  const allowed = RL.foldRateLimit(none, allowedEvt)
  const limitedEvt = {
    type: 'rate-limit',
    status: 'rejected',
    resetsAt: 1788480000,
    overage: false,
    windows: { five_hour: { utilization: 1, resetsAt: 1788480000 }, seven_day: { utilization: 0.5, resetsAt: 1788685200 } }
  }
  const limited = RL.foldRateLimit(allowed, limitedEvt, 1_700_000_000_000)
  const utilNone = RL.windowUtilization(none)
  const utilAllowed = RL.windowUtilization(allowed)
  const utilLimited = RL.windowUtilization(limited)
  const crossUsd = RL.budgetCrossing({ budgetUsd: 1, budgetWindowPercent: 80, spentUsd: 1.5, windowUtil: 0.1 })
  const crossWin = RL.budgetCrossing({ budgetUsd: 0, budgetWindowPercent: 80, spentUsd: 0, windowUtil: 0.85 })
  const crossMax = RL.budgetCrossing({ budgetUsd: 0, budgetWindowPercent: 80, spentUsd: 0, windowUtil: 0.5 })
  const crossNone = RL.budgetCrossing({ budgetUsd: 0, budgetWindowPercent: 80, spentUsd: 0, windowUtil: undefined })
  ok('rate-limit.2 fold keeps none / allowed / limited-until-T distinct; windowUtilization is the max of named windows; budgetCrossing reuses one path for USD and for window percent (whichever window is higher)',
    none.kind === 'none' && allowed.kind === 'allowed' && limited.kind === 'limited' && limited.until === 1788480000 &&
      utilNone === undefined && Math.abs(utilAllowed - 0.46) < 1e-9 && utilLimited === 1 &&
      crossUsd && crossUsd.unit === 'usd' && crossUsd.limit === 1 &&
      crossWin && crossWin.unit === 'window' && crossWin.limit === 0.8 &&
      crossMax === null && crossNone === null,
    JSON.stringify({ none, allowed, limited, utilNone, utilAllowed, utilLimited, crossUsd, crossWin, crossMax, crossNone }))
}

{
  const noUsage = T.parseStreamLine('{"type":"result","subtype":"success","is_error":false,"session_id":"s"}')
  const strUsage = T.parseStreamLine('{"type":"result","subtype":"success","is_error":false,"usage":{"input_tokens":"9","output_tokens":45,"cache_creation_input_tokens":null},"total_cost_usd":"x"}')
  const errored = T.parseStreamLine('{"type":"result","subtype":"error_during_execution","is_error":true,"errors":["boom"]}')
  ok('transcript.absent an absent usage is undefined not zero; a non-numeric class is 0 and its siblings survive; a non-numeric cost is absent; an error result is not ok and keeps its subtype',
    noUsage.type === 'result' && noUsage.usage === undefined && noUsage.stopReason === undefined &&
      noUsage.costUsd === undefined && noUsage.ok === true &&
      strUsage.type === 'result' && strUsage.usage !== undefined &&
      strUsage.usage.input === 0 && strUsage.usage.output === 45 &&
      strUsage.usage.cacheWrite === 0 && strUsage.usage.cacheRead === 0 &&
      strUsage.costUsd === undefined &&
      errored.type === 'result' && errored.ok === false && errored.subtype === 'error_during_execution' &&
      typeof errored.error === 'string' && errored.error.includes('boom'),
    JSON.stringify({ noUsage, strUsage, errored }))
}

{
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      id: 'm1', model: 'x', role: 'assistant',
      content: [
        { type: 'text', text: 'hi' },
        { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: {} },
        { type: 'tool_use', id: 't1', name: 'Read', input: 'not an object' },
        { type: 'thinking', thinking: 'why', signature: 'sig' },
        'garbage'
      ]
    }
  })
  const e = T.parseStreamLine(line)
  const kinds = e.type === 'assistant' ? e.blocks.map((b) => b.type) : []
  ok('transcript.blocks an unknown block type is KEPT as an unknown placeholder with its kind, a malformed input is an empty object, a non-object block is dropped',
    e.type === 'assistant' && kinds.join(',') === 'text,unknown,tool_use,thinking' &&
      e.blocks[1].kind === 'server_tool_use' &&
      JSON.stringify(e.blocks[2].input) === '{}' &&
      e.blocks[3].text === 'why',
    JSON.stringify(kinds))
}

{
  const line = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'a' }, { type: 'image', source: {} }, { type: 'text', text: 'b' }], is_error: true },
      { type: 'tool_result', tool_use_id: 't2' }
    ] }
  })
  const e = T.parseStreamLine(line)
  ok('transcript.tool-result an array-form tool result joins its text parts, marks an image, honours is_error, and an absent content is an empty string',
    e.type === 'user' && e.blocks.length === 2 &&
      e.blocks[0].type === 'tool_result' && e.blocks[0].content === 'a\n[image]\nb' && e.blocks[0].isError === true &&
      e.blocks[1].content === '' && e.blocks[1].isError === false,
    JSON.stringify(e.blocks))
}

{
  const replay = T.parseStreamLine(fixture('multi-turn.jsonl').find((l) => l.includes('"isReplay":true')))
  ok('transcript.replay an echoed user message is a user event flagged replay with a text block',
    replay.type === 'user' && replay.replay === true && replay.blocks[0].type === 'text' &&
      replay.blocks[0].text === 'Reply with exactly: one',
    JSON.stringify(replay))
}

{
  const user = JSON.parse(T.userMessageLine('hello\nworld'))
  const intr = JSON.parse(T.interruptLine('r1'))
  const allow = JSON.parse(T.permissionResponseLine('r2', { command: 'ls' }, { allow: true }))
  const deny = JSON.parse(T.permissionResponseLine('r3', { command: 'ls' }, { allow: false, message: 'no' }))
  ok('transcript.encode the stdin encoders produce the wire shapes measured: a user message, an interrupt control request, allow with updatedInput, deny with a message',
    user.type === 'user' && user.message.role === 'user' && user.message.content[0].text === 'hello\nworld' &&
      intr.type === 'control_request' && intr.request_id === 'r1' && intr.request.subtype === 'interrupt' &&
      allow.type === 'control_response' && allow.response.request_id === 'r2' &&
      allow.response.subtype === 'success' && allow.response.response.behavior === 'allow' &&
      allow.response.response.updatedInput.command === 'ls' &&
      deny.response.response.behavior === 'deny' && deny.response.response.message === 'no' &&
      !T.userMessageLine('x').includes('\n') && !T.interruptLine('x').includes('\n'),
    JSON.stringify({ user, intr, allow, deny }))
}

/* ------------------------------------------------------------------------ */
/* The argv builder                                                          */
/* ------------------------------------------------------------------------ */

{
  const fresh = A.headlessArgs({ sessionId: 'u-1', resume: false, agentOptions: { permissionMode: 'plan', effort: 'high', model: 'opus' } })
  const base = ['-p', '--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-prompt-tool', 'stdio']
  const flag = (args, f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
  ok('args.1 a fresh session carries the headless base flags, pins its session id, and the agent knobs through the capability table',
    base.every((f) => fresh.includes(f)) && flag(fresh, '--session-id') === 'u-1' &&
      !fresh.includes('--resume') && flag(fresh, '--permission-mode') === 'plan' &&
      flag(fresh, '--effort') === 'high' && flag(fresh, '--model') === 'opus',
    fresh.join(' '))
  const resumed = A.headlessArgs({ sessionId: 'u-1', resume: true, agentOptions: { model: 'opus' } })
  ok('args.2 a resumed session says --resume and never --session-id, and still carries its knobs',
    flag(resumed, '--resume') === 'u-1' && !resumed.includes('--session-id') && flag(resumed, '--model') === 'opus' &&
      base.every((f) => resumed.includes(f)),
    resumed.join(' '))
  const foreign = A.headlessArgs({ sessionId: 'u-2', resume: false, agentOptions: { sandbox: 'read-only', approvalPolicy: 'never' } })
  ok('args.3 a Codex-only option is inert in claude argv rather than emitted under a foreign spelling',
    !foreign.includes('--sandbox') && !foreign.includes('--ask-for-approval') && !foreign.includes('read-only'),
    foreign.join(' '))
  ok('args.4 the base list is exported so the real runner and the suite read one spelling',
    Array.isArray(A.CLAUDE_HEADLESS_ARGS) && A.CLAUDE_HEADLESS_ARGS.includes('--permission-prompt-tool'),
    A.CLAUDE_HEADLESS_ARGS.join(' '))
}

/* ------------------------------------------------------------------------ */
/* The fake runner                                                           */
/* ------------------------------------------------------------------------ */

/* A process the suite drives by hand. `emit` delivers stdout chunks (the
   suite chooses where lines break), `exit` ends it, and `kill()` only
   RECORDS the kill — the OS process would exit some milliseconds later, and
   whether the suite lets it keep talking in between is the whole point of
   the identity check. */
function fakeProcess(pid) {
  const proc = {
    pid,
    stdin: [],
    killed: 0,
    dataCbs: [],
    exitCbs: [],
    write(line) { proc.stdin.push(line) },
    onData(cb) { proc.dataCbs.push(cb) },
    onExit(cb) { proc.exitCbs.push(cb) },
    kill() { proc.killed += 1 },
    emit(chunk) { for (const cb of proc.dataCbs) cb(chunk) },
    emitLines(lines) { proc.emit(lines.join('\n') + '\n') },
    exit(code, signal, stderr) { for (const cb of proc.exitCbs) cb({ code, signal, stderr }) }
  }
  return proc
}

function makeManager(overrides = {}) {
  const spawns = []
  let nextPid = 1000
  let nextId = 0
  const runner = (spawn) => {
    const proc = fakeProcess(++nextPid)
    spawns.push({ ...spawn, proc })
    return proc
  }
  const events = []
  const manager = new S.AgentSessionManager({
    runner,
    command: '/fake/bin/claude',
    env: { PATH: '/fake/bin', HOME: '/fake/home' },
    newSessionId: () => `uuid-${++nextId}`,
    interruptGraceMs: 30,
    coalesceMs: 5,
    ...overrides
  })
  const unsubscribe = manager.subscribe((e) => events.push(e))
  return { manager, spawns, events, unsubscribe, last: () => spawns[spawns.length - 1] }
}

/* The fixture's lines up to and including the first line matching `pred`. */
function upTo(lines, pred) {
  const i = lines.findIndex(pred)
  return i < 0 ? lines : lines.slice(0, i + 1)
}
const isInit = (l) => l.includes('"subtype":"init"')
// `type` is NOT the first key of a result record (the CLI writes
// duration_api_ms first), so these test membership, never a prefix.
const isResult = (l) => l.includes('"type":"result"')

/* ------------------------------------------------------------------------ */
/* The manager                                                               */
/* ------------------------------------------------------------------------ */

;(async () => {
  // session.create
  {
    const { manager, spawns } = makeManager()
    const snap = manager.create({ id: 'p1', cwd: '/repo' })
    const again = manager.create({ id: 'p1', cwd: '/elsewhere' })
    ok('session.create create is synchronous, spawns nothing, mints the CLI session id, and is idempotent at an id',
      snap.status === 'not-started' && snap.sessionId === 'uuid-1' && snap.cwd === '/repo' &&
        spawns.length === 0 && again.sessionId === 'uuid-1' && again.cwd === '/repo' &&
        manager.list().length === 1 && manager.get('p1').turns === 0 &&
        manager.get('p1').usage.input === 0 && manager.get('p1').costUsd === undefined,
      JSON.stringify(snap))
    const resumed = manager.create({ id: 'p2', cwd: '/repo', resume: 'old-uuid' })
    ok('session.create.b a session created with `resume` adopts that CLI session id instead of minting one',
      resumed.sessionId === 'old-uuid' && resumed.status === 'not-started',
      JSON.stringify(resumed))
  }

  // session.send
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo', agentOptions: { model: 'opus' } })
    const r = manager.send('p1', 'hello there')
    const sp = spawns[0]
    const written = sp && sp.proc.stdin.map((l) => JSON.parse(l))
    ok('session.send the first send spawns the runner with the resolved command, cwd and env, headless argv pinning the session id, writes the user line, and the status is starting',
      r === 'sent' && spawns.length === 1 && sp.command === '/fake/bin/claude' && sp.cwd === '/repo' &&
        sp.env.PATH === '/fake/bin' && sp.args.includes('--session-id') && sp.args.includes('uuid-1') &&
        sp.args.includes('--model') && !sp.args.includes('--resume') &&
        written.length === 1 && written[0].type === 'user' && written[0].message.content[0].text === 'hello there' &&
        manager.get('p1').status === 'starting' && manager.get('p1').pid === 1001 &&
        has(events, (e) => e.id === 'p1' && e.type === 'status' && e.status === 'starting'),
      JSON.stringify({ r, args: sp && sp.args, status: manager.get('p1').status }))
    const turns = manager.transcript('p1')
    ok('session.send.b the user turn is on the transcript the moment it is sent, before the CLI has echoed anything',
      turns.length === 1 && turns[0].role === 'user' && turns[0].blocks[0].type === 'text' && turns[0].blocks[0].text === 'hello there',
      JSON.stringify(turns))
    ok('session.send.c a send to an unknown id is refused by name',
      manager.send('nope', 'x') === 'no-session', '')
  }

  // session.stream — a whole recorded turn
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'Reply with exactly the word: pong')
    const proc = spawns[0].proc
    const lines = fixture('turn.jsonl')
    proc.emitLines(upTo(lines, isInit))
    const afterInit = manager.get('p1').status
    proc.emitLines(lines.slice(lines.findIndex(isInit) + 1))
    await tick(20)
    const snap = manager.get('p1')
    const turns = manager.transcript('p1')
    const assistant = turns.find((t) => t.role === 'assistant')
    const result = events.find((e) => e.id === 'p1' && e.type === 'result')
    ok('session.stream init moves starting to streaming (a turn is in flight); the deltas reach subscribers; the assistant turn is stored from the complete record; the result prices the turn and returns the session to ready',
      afterInit === 'streaming' &&
        has(events, (e) => e.id === 'p1' && e.type === 'block-delta' && e.text === 'pong') &&
        assistant !== undefined && assistant.blocks.some((b) => b.type === 'text' && b.text === 'pong') &&
        assistant.model === 'claude-haiku-4-5-20251001' &&
        result !== undefined && result.ok === true && result.interrupted === false &&
        snap.status === 'ready' && snap.turns === 1 &&
        snap.usage.input === 9 && snap.usage.output === 45 && snap.usage.cacheWrite === 66763 &&
        Math.abs(snap.costUsd - 0.13376) < 1e-9 && snap.sessionId === 'uuid-1',
      JSON.stringify({ afterInit, status: snap.status, usage: snap.usage, cost: snap.costUsd, turns: turns.map((t) => t.role) }))
    ok('session.stream.b thinking blocks are stored as thinking, in order, ahead of the text',
      assistant !== undefined && assistant.blocks[0].type === 'thinking' && assistant.blocks[1].type === 'text',
      JSON.stringify(assistant && assistant.blocks.map((b) => b.type)))
    ok('session.stream.c a session event stamps the CLI-reported session id and model on the snapshot',
      snap.model === 'claude-haiku-4-5-20251001' && snap.counters.unknown === 0 && snap.counters.malformed === 0 && snap.counters.ignored > 0,
      JSON.stringify(snap.counters))
  }

  // session.merge — two assistant records with one message id are one turn; usage never summed from them
  {
    const { manager, spawns } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'run it')
    const proc = spawns[0].proc
    proc.emitLines(fixture('tool-turn.jsonl'))
    await tick(20)
    const turns = manager.transcript('p1')
    const assistantTurns = turns.filter((t) => t.role === 'assistant')
    const first = assistantTurns[0]
    const toolResult = turns.find((t) => t.role === 'user' && t.blocks[0].type === 'tool_result')
    const snap = manager.get('p1')
    ok('session.merge assistant records sharing a message id merge into ONE turn with both blocks; the tool result is its own user turn; usage comes from the result alone, never from the repeated per-block usage',
      assistantTurns.length === 2 && first.blocks.length === 2 &&
        first.blocks[0].type === 'thinking' && first.blocks[1].type === 'tool_use' &&
        toolResult !== undefined && toolResult.blocks[0].content === 'tc-fixture-42' &&
        turns.map((t) => t.role).join(',') === 'user,assistant,user,assistant' &&
        snap.usage.output === 206 && snap.usage.cacheRead === 72131 && snap.turns === 1,
      JSON.stringify({ roles: turns.map((t) => t.role), blocks: first && first.blocks.map((b) => b.type), usage: snap.usage }))
  }

  // session.coalesce
  {
    const { manager, spawns, events } = makeManager({ coalesceMs: 20 })
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    const proc = spawns[0].proc
    const lines = fixture('turn.jsonl')
    proc.emitLines(upTo(lines, isInit))
    const delta = (t) => JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: t } } })
    proc.emitLines([JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } } })])
    for (const t of ['a', 'b', 'c', 'd']) proc.emitLines([delta(t)])
    proc.emitLines([delta('e')])
    await tick(60)
    const deltas = events.filter((e) => e.id === 'p1' && e.type === 'block-delta')
    ok('session.coalesce five text deltas for one block arriving inside the window reach subscribers as ONE event carrying the joined text, in order',
      deltas.length === 1 && deltas[0].text === 'abcde' && deltas[0].index === 1,
      JSON.stringify(deltas))
    // A block-stop must not be reordered ahead of the deltas it follows.
    proc.emitLines([delta('f'), JSON.stringify({ type: 'stream_event', event: { type: 'content_block_stop', index: 1 } })])
    await tick(60)
    const tail = events.filter((e) => e.id === 'p1' && (e.type === 'block-delta' || e.type === 'block-stop')).slice(-2)
    ok('session.coalesce.b a block-stop arriving after a delta is delivered AFTER it, never reordered by the batch',
      tail.length === 2 && tail[0].type === 'block-delta' && tail[0].text === 'f' && tail[1].type === 'block-stop',
      JSON.stringify(tail))
  }

  // session.queue
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'first')
    const proc = spawns[0].proc
    const lines = fixture('turn.jsonl')
    proc.emitLines(upTo(lines, isInit))
    const r2 = manager.send('p1', 'second')
    const writtenBefore = proc.stdin.length
    const queuedSnap = manager.get('p1').queued
    proc.emitLines(lines.slice(lines.findIndex(isInit) + 1))
    await tick(20)
    const written = proc.stdin.map((l) => JSON.parse(l))
    ok('session.queue a send during a turn is queued (not written, not lost) and written the moment the result lands, so the session is streaming again',
      r2 === 'queued' && writtenBefore === 1 && queuedSnap === 1 &&
        written.length === 2 && written[1].message.content[0].text === 'second' &&
        manager.get('p1').status === 'streaming' && manager.get('p1').queued === 0 &&
        has(events, (e) => e.id === 'p1' && e.type === 'queued' && e.text === 'second') &&
        manager.transcript('p1').filter((t) => t.role === 'user').length === 2,
      JSON.stringify({ r2, writtenBefore, queuedSnap, status: manager.get('p1').status }))
  }

  // session.truncated — the process dies mid-turn with no result
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    const proc = spawns[0].proc
    const lines = fixture('turn.jsonl')
    proc.emitLines(upTo(lines, (l) => l.includes('"text_delta"')))
    proc.exit(0, null)
    await tick(20)
    const snap = manager.get('p1')
    const aborted = events.find((e) => e.id === 'p1' && e.type === 'turn-aborted')
    // The fixture's first assistant record (the thinking block) precedes the
    // text delta, so the partial assistant turn IS on the transcript: that is
    // "keeps what was streamed", and a transcript of one would mean the
    // exit had thrown the turn away.
    ok('session.truncated an exit with no result marks the session exited (code 0), aborts the turn by name, keeps what was streamed, and drops the pid',
      snap.status === 'exited' && snap.exitCode === 0 && snap.pid === undefined &&
        aborted !== undefined && aborted.reason === 'exited' &&
        has(events, (e) => e.id === 'p1' && e.type === 'block-delta' && e.text === 'pong') &&
        snap.turns === 0 && manager.transcript('p1').length === 2 &&
        manager.transcript('p1')[1].role === 'assistant',
      JSON.stringify({ status: snap.status, code: snap.exitCode, aborted }))
  }

  // session.exit-code
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    spawns[0].proc.exit(1, null, 'Error: not logged in\n')
    await tick(5)
    const snap = manager.get('p1')
    const st = events.find((e) => e.id === 'p1' && e.type === 'status' && e.status === 'exited')
    ok('session.exit-code a non-zero exit is exited with its code and its stderr tail, never a clean turn',
      snap.status === 'exited' && snap.exitCode === 1 && snap.turns === 0 &&
        st !== undefined && st.exitCode === 1 && typeof st.stderr === 'string' && st.stderr.includes('not logged in'),
      JSON.stringify(st))
    const r = manager.send('p1', 'again')
    const sp = spawns[1]
    ok('session.resume a send after an exit respawns with --resume <the same CLI session id> and no --session-id, and writes the message',
      r === 'sent' && spawns.length === 2 && sp.args.includes('--resume') && sp.args[sp.args.indexOf('--resume') + 1] === 'uuid-1' &&
        !sp.args.includes('--session-id') && sp.proc.stdin.length === 1 && manager.get('p1').status === 'starting' &&
        manager.get('p1').exitCode === undefined,
      JSON.stringify({ r, args: sp && sp.args }))
    const signalled = makeManager()
    signalled.manager.create({ id: 'q', cwd: '/r' })
    signalled.manager.send('q', 'x')
    signalled.spawns[0].proc.exit(null, 'SIGKILL')
    ok('session.exit-code.b an exit by signal is exited with a null code and the signal named',
      signalled.manager.get('q').status === 'exited' && signalled.manager.get('q').exitCode === null &&
        signalled.manager.get('q').exitSignal === 'SIGKILL',
      JSON.stringify(signalled.manager.get('q')))
  }

  // session.interrupt
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    ok('session.interrupt.a an interrupt with no turn in flight is a no-op that returns false and writes nothing',
      manager.interrupt('p1') === false && spawns.length === 0, '')
    manager.send('p1', 'count to forty')
    const proc = spawns[0].proc
    const lines = fixture('multi-turn.jsonl')
    proc.emitLines(upTo(lines, (l) => l.includes('"text_delta"')))
    const r = manager.interrupt('p1')
    const written = proc.stdin.map((l) => JSON.parse(l))
    const req = written.find((l) => l.type === 'control_request')
    ok('session.interrupt an interrupt mid-turn writes the control request to stdin and returns true',
      r === true && req !== undefined && req.request.subtype === 'interrupt' && typeof req.request_id === 'string' &&
        manager.get('p1').status === 'streaming',
      JSON.stringify(req))
    // The CLI answers, then the turn's result arrives.
    const ctrl = lines.find((l) => l.includes('"control_response"')).replace('req-1', req.request_id)
    proc.emitLines([ctrl, lines.find(isResult)])
    await tick(20)
    const result = events.find((e) => e.id === 'p1' && e.type === 'result')
    ok('session.interrupt.b the control response and the result return the session to ready, and the result is flagged interrupted from the session\'s own state',
      manager.get('p1').status === 'ready' && result !== undefined && result.interrupted === true &&
        proc.killed === 0 && has(events, (e) => e.id === 'p1' && e.type === 'control-response' && e.requestId === req.request_id),
      JSON.stringify({ status: manager.get('p1').status, interrupted: result && result.interrupted, killed: proc.killed }))
    await tick(50)
    ok('session.interrupt.c the grace timer is disarmed by the result — nothing is killed afterwards',
      proc.killed === 0, String(proc.killed))
  }

  // session.interrupt-timeout
  {
    const { manager, spawns, events } = makeManager({ interruptGraceMs: 30 })
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    const proc = spawns[0].proc
    proc.emitLines(upTo(fixture('turn.jsonl'), isInit))
    manager.interrupt('p1')
    await tick(60)
    const killedAt = proc.killed
    const beforeExit = manager.get('p1').status
    proc.exit(null, 'SIGTERM')
    await tick(5)
    ok('session.interrupt-timeout a turn that ignores the interrupt for the grace period is killed; the session is exited once the process goes, and the turn is aborted by name',
      killedAt === 1 && beforeExit === 'streaming' && manager.get('p1').status === 'exited' &&
        has(events, (e) => e.id === 'p1' && e.type === 'turn-aborted' && e.reason === 'interrupt-timeout'),
      JSON.stringify({ killedAt, beforeExit, status: manager.get('p1').status }))
  }

  // session.identity — the M61 rule, second layer
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    const old = spawns[0].proc
    old.emitLines(upTo(fixture('turn.jsonl'), isInit))
    manager.dispose('p1')
    const goneAfterDispose = manager.get('p1') === undefined
    manager.create({ id: 'p1', cwd: '/repo2' })
    manager.send('p1', 'y')
    const fresh = spawns[1].proc
    const before = events.length
    // The OS process we killed keeps talking, then exits, milliseconds later.
    old.emitLines(fixture('turn.jsonl').slice(fixture('turn.jsonl').findIndex(isInit) + 1))
    old.exit(0, null)
    await tick(20)
    const leaked = events.slice(before).filter((e) => e.id === 'p1' && (e.type === 'block-delta' || e.type === 'result' || e.type === 'status'))
    const snap = manager.get('p1')
    ok('session.identity a disposed session\'s process talking and exiting late changes NOTHING on the session recreated at its id: no events, still starting, its own pid, no exit code',
      goneAfterDispose && old.killed === 1 && leaked.length === 0 &&
        snap.status === 'starting' && snap.pid === fresh.pid && snap.exitCode === undefined &&
        snap.sessionId === 'uuid-2' && snap.turns === 0 && manager.transcript('p1').length === 1,
      JSON.stringify({ leaked, status: snap.status, pid: snap.pid, sessionId: snap.sessionId }))
    // And the fresh one still works.
    fresh.emitLines(fixture('turn.jsonl'))
    await tick(20)
    ok('session.identity.b the recreated session streams and prices its own turn normally',
      manager.get('p1').status === 'ready' && manager.get('p1').turns === 1, manager.get('p1').status)
  }

  // session.dispose
  {
    const { manager, spawns, events, unsubscribe } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    manager.send('p1', 'queued one')
    manager.dispose('p1')
    const st = events.filter((e) => e.id === 'p1' && e.type === 'status').pop()
    ok('session.dispose dispose kills the process, announces disposed, drops the queue and removes the session from the list; a never-started session disposes with nothing to kill',
      spawns[0].proc.killed === 1 && st !== undefined && st.status === 'disposed' && manager.list().length === 0 &&
        manager.get('p1') === undefined && manager.dispose('nope') === undefined,
      JSON.stringify(st))
    manager.create({ id: 'p2', cwd: '/repo' })
    manager.dispose('p2')
    ok('session.dispose.b disposing a never-started session spawns nothing and kills nothing',
      spawns.length === 1 && manager.list().length === 0, String(spawns.length))
    unsubscribe()
    const n = events.length
    manager.create({ id: 'p3', cwd: '/repo' })
    manager.send('p3', 'x')
    ok('session.dispose.c subscribe returns its own unsubscribe, and nothing arrives after it',
      events.length === n, `${events.length} vs ${n}`)
  }

  // session.permission
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'cat hosts')
    const proc = spawns[0].proc
    const lines = fixture('permission.jsonl')
    proc.emitLines(upTo(lines, (l) => l.includes('"can_use_tool"')))
    await tick(5)
    const req = events.find((e) => e.id === 'p1' && e.type === 'permission-request')
    const pending = manager.get('p1').pending
    ok('session.permission a can_use_tool request is an event and sits on the snapshot as pending, with the tool and its input',
      req !== undefined && pending.length === 1 && pending[0].requestId === req.requestId &&
        pending[0].toolName === 'Bash' && pending[0].input.command === 'cat /etc/hosts | head -2',
      JSON.stringify(pending))
    ok('session.permission.b answering an unknown request id is refused',
      manager.answerPermission('p1', 'nope', { allow: true }) === false, '')
    const answered = manager.answerPermission('p1', req.requestId, { allow: true })
    const line = proc.stdin.map((l) => JSON.parse(l)).find((l) => l.type === 'control_response')
    ok('session.permission.c an allow writes the control response with the request id and the input echoed as updatedInput, and clears pending',
      answered === true && line !== undefined && line.response.request_id === req.requestId &&
        line.response.response.behavior === 'allow' && line.response.response.updatedInput.command === 'cat /etc/hosts | head -2' &&
        manager.get('p1').pending.length === 0 &&
        has(events, (e) => e.id === 'p1' && e.type === 'permission-answered' && e.requestId === req.requestId && e.allow === true),
      JSON.stringify(line))
    proc.emitLines(lines.slice(lines.findIndex((l) => l.includes('"can_use_tool"')) + 1))
    await tick(20)
    ok('session.permission.d the turn completes after the answer and the tool result is on the transcript',
      manager.get('p1').status === 'ready' && manager.transcript('p1').some((t) => t.role === 'user' && t.blocks[0].type === 'tool_result'),
      manager.get('p1').status)
  }

  // session.permission-dropped
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    const proc = spawns[0].proc
    proc.emitLines(upTo(fixture('permission.jsonl'), (l) => l.includes('"can_use_tool"')))
    await tick(5)
    proc.exit(1, null)
    await tick(5)
    ok('session.permission-dropped a pending request is dropped by name when its process exits, so nothing can show a question nobody can answer',
      manager.get('p1').pending.length === 0 &&
        has(events, (e) => e.id === 'p1' && e.type === 'permission-dropped' && e.requestId === '0dd6eeca-c65d-47a5-86b3-b5f6ea9dcd60') &&
        manager.answerPermission('p1', '0dd6eeca-c65d-47a5-86b3-b5f6ea9dcd60', { allow: true }) === false,
      JSON.stringify(manager.get('p1').pending))
  }

  // session.multi — three real turns: usage summed, cost latest
  {
    const { manager, spawns } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    const lines = fixture('multi-turn.jsonl')
    const resultIdx = lines.map((l, i) => (isResult(l) ? i : -1)).filter((i) => i >= 0)
    manager.send('p1', 'one')
    const proc = spawns[0].proc
    proc.emitLines(lines.slice(0, resultIdx[0] + 1))
    await tick(10)
    const after1 = manager.get('p1')
    manager.send('p1', 'two')
    proc.emitLines(lines.slice(resultIdx[0] + 1, resultIdx[1] + 1))
    await tick(10)
    const after2 = manager.get('p1')
    ok('session.accounting across two turns of one process usage is SUMMED per turn while cost is the CLI\'s cumulative figure taken as-is, never summed',
      after1.turns === 1 && Math.abs(after1.costUsd - 0.0215191) < 1e-9 && after1.usage.output === 166 &&
        after2.turns === 2 && Math.abs(after2.costUsd - 0.1608801) < 1e-9 && after2.usage.output === 166 + 135 &&
        after2.status === 'ready' && spawns.length === 1,
      JSON.stringify({ t1: [after1.turns, after1.costUsd, after1.usage.output], t2: [after2.turns, after2.costUsd, after2.usage.output] }))
    ok('session.accounting.b the replayed echo of our own message is not stored a second time — two sends, two user turns',
      manager.transcript('p1').filter((t) => t.role === 'user').length === 2,
      String(manager.transcript('p1').filter((t) => t.role === 'user').length))
  }

  // session.counters — malformed and unknown lines mid-stream cost nothing else
  {
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    const proc = spawns[0].proc
    const lines = fixture('turn.jsonl')
    const i = lines.findIndex((l) => l.includes('"text_delta"'))
    proc.emitLines([...lines.slice(0, i), '{"type":"stream_event","event":{"type":"content_block_delta"', '{"type":"future_thing","v":2}', ...lines.slice(i)])
    await tick(20)
    const snap = manager.get('p1')
    ok('session.malformed a malformed line and an unknown record mid-stream are counted, and the turn still streams and prices',
      snap.counters.malformed === 1 && snap.counters.unknown === 1 && snap.status === 'ready' && snap.turns === 1 &&
        has(events, (e) => e.id === 'p1' && e.type === 'block-delta' && e.text === 'pong') &&
        has(events, (e) => e.id === 'p1' && e.type === 'unknown' && e.kind === 'future_thing'),
      JSON.stringify(snap.counters))
  }

  // session.split — a chunk boundary inside a record, through the manager
  {
    const { manager, spawns } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    const proc = spawns[0].proc
    const whole = fixture('turn.jsonl').join('\n') + '\n'
    const cut = whole.indexOf('"total_cost_usd"') + 4
    proc.emit(whole.slice(0, cut))
    const mid = manager.get('p1').status
    proc.emit(whole.slice(cut))
    await tick(20)
    ok('session.split a result record split across two reads is streaming until the second half lands, then priced exactly once',
      mid === 'streaming' && manager.get('p1').status === 'ready' && manager.get('p1').turns === 1 &&
        Math.abs(manager.get('p1').costUsd - 0.13376) < 1e-9,
      JSON.stringify({ mid, turns: manager.get('p1').turns }))
  }

  // session.disposeAll
  {
    const { manager, spawns } = makeManager()
    manager.create({ id: 'a', cwd: '/r' })
    manager.create({ id: 'b', cwd: '/r' })
    manager.create({ id: 'c', cwd: '/r' })
    manager.send('a', 'x')
    manager.send('b', 'y')
    manager.disposeAll()
    ok('session.disposeAll every live process is killed, and the list is empty',
      spawns.length === 2 && spawns.every((s) => s.proc.killed === 1) && manager.list().length === 0, String(spawns.length))
  }

  // session.exists — M73. Whether the FIRST spawn says --session-id or
  // --resume is decided by an injected probe for the CLI's own transcript,
  // never by a persisted flag: a restored panel that has had a turn resumes,
  // one that never did pins, and a `sessionId` given at create is the id to
  // pin (distinct from `resume`, which asserts the conversation exists).
  {
    const seen = []
    const { manager, spawns } = makeManager({ transcriptExists: (id) => { seen.push(id); return id === 'u-old' } })
    manager.create({ id: 'fresh', cwd: '/r', sessionId: 'u-new' })
    manager.create({ id: 'old', cwd: '/r', sessionId: 'u-old' })
    manager.send('fresh', 'x')
    manager.send('old', 'y')
    const a = spawns[0], b = spawns[1]
    ok('session.exists a caller-supplied sessionId is pinned when the CLI has no transcript for it, and resumed when it has — decided by the injected probe at spawn',
      manager.get('fresh').sessionId === 'u-new' && manager.get('old').sessionId === 'u-old' &&
        a && a.args.includes('--session-id') && a.args[a.args.indexOf('--session-id') + 1] === 'u-new' && !a.args.includes('--resume') &&
        b && b.args.includes('--resume') && b.args[b.args.indexOf('--resume') + 1] === 'u-old' && !b.args.includes('--session-id') &&
        seen.includes('u-new') && seen.includes('u-old'),
      JSON.stringify({ a: a && a.args, b: b && b.args, seen }))
  }

  // log.1–.3 — M73. The durable per-panel transcript: an append stream (the
  // scrollback log's shape, never layout-store's rename) that a restored
  // panel reads before any process exists.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc agent log '))
    const log = typeof LOG.createAgentTranscriptLog === 'function' ? LOG.createAgentTranscriptLog({ dir }) : null
    const turnA = { id: 'm1', role: 'assistant', blocks: [{ type: 'thinking', text: '' }], model: 'haiku', at: 1 }
    const turnA2 = { id: 'm1', role: 'assistant', blocks: [{ type: 'thinking', text: '' }, { type: 'text', text: 'pong' }], model: 'haiku', at: 1 }
    const user = { id: 'u-1', role: 'user', blocks: [{ type: 'text', text: 'hi' }], at: 0 }
    if (log) {
      log.appendTurn('p1', user)
      log.appendTurn('p1', turnA)
      log.appendTurn('p1', turnA2)
      log.appendMeta('p1', { usage: { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 }, costUsd: 0.5, turns: 1 })
      log.appendMeta('p1', { usage: { input: 2, output: 4, cacheWrite: 6, cacheRead: 8 }, costUsd: 0.9, turns: 2 })
    }
    const read = log ? log.read('p1') : null
    ok('log.1 a merged turn re-written whole replaces its earlier line (last per turn id wins, order kept), and the meta line is the latest',
      read !== null && read.turns.length === 2 && read.turns[0].id === 'u-1' && read.turns[1].id === 'm1' &&
        read.turns[1].blocks.length === 2 && read.turns[1].blocks[1].text === 'pong' &&
        read.meta !== undefined && read.meta.turns === 2 && read.meta.costUsd === 0.9 && read.meta.usage.output === 4,
      JSON.stringify(read))
    // A file with a torn last line (the app died mid-append) and a garbage
    // line costs those lines, never the file — parseLayout's rule again.
    if (log) {
      const file = readdirSync(dir).find((f) => f.startsWith('p1'))
      require('node:fs').appendFileSync(join(dir, file), 'not json\n{"t":"turn","turn":{"id":"m2","role":"assistant","blocks":[],"at":2}}\n{"t":"tu')
    }
    const torn = log ? log.read('p1') : null
    ok('log.2 a garbage line and a torn tail cost only themselves; the turns before and between them survive',
      torn !== null && torn.turns.length === 3 && torn.turns[2].id === 'm2' && torn.meta.turns === 2,
      JSON.stringify(torn && torn.turns.map((t) => t.id)))
    const missing = log ? log.read('never') : null
    if (log) log.drop('p1')
    ok('log.3 an unknown panel reads as empty (not an error), drop removes the file, and a dropped panel reads as empty again',
      missing !== null && missing.turns.length === 0 && missing.meta === undefined &&
        log !== null && readdirSync(dir).every((f) => !f.startsWith('p1')) && log.read('p1').turns.length === 0,
      JSON.stringify({ missing, files: log ? readdirSync(dir) : null }))
    rmSync(dir, { recursive: true, force: true })
  }

  // args.5 — M74. A resumed terminal must not be pinned to a SECOND id beside
  // its --resume: `claude` would refuse the pair, and the pin would name a
  // transcript that never exists while the real one grows.
  {
    const fresh = A.headlessArgs({ sessionId: 'u-1', resume: false })
    const agentArgs = M.agentArgs && M.agentArgs.agentArgs
    const viaTui = agentArgs ? agentArgs({ agent: 'claude-code', args: ['--resume', 'u-9'], agentOptions: { effort: 'high' } }, 'u-fresh') : null
    ok('args.5 agentArgs skips the --session-id pin when the args already carry --resume, and still carries the knobs',
      fresh.includes('--session-id') && viaTui !== null && !viaTui.includes('--session-id') && viaTui.includes('--resume') && viaTui[viaTui.indexOf('--effort') + 1] === 'high',
      JSON.stringify({ viaTui }))
  }

  // import.1–.3 — M74. The CLI's own transcript, read for a terminal's session
  // being opened as chat. Records are the stream's shapes plus the file's own
  // wrapper; a subagent's records (isSidechain) and the CLI's meta records
  // (isMeta) are not this conversation's turns; a typed prompt is a STRING.
  {
    const imp = typeof IMP.importClaudeTranscript === 'function' ? IMP.importClaudeTranscript : () => null
    const msg = (id, blocks, usage) => ({ type: 'assistant', isSidechain: false, message: { id, model: 'claude-x', role: 'assistant', content: blocks, usage } })
    const lines = [
      JSON.stringify({ type: 'file-history-snapshot', snapshot: {} }),
      JSON.stringify({ type: 'user', isSidechain: false, message: { role: 'user', content: 'hello there' } }),
      JSON.stringify({ type: 'user', isSidechain: false, isMeta: true, message: { role: 'user', content: '[Image: original 2880x1730]' } }),
      JSON.stringify(msg('m1', [{ type: 'thinking', thinking: '', signature: 's' }], { input_tokens: 2, output_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 7 })),
      JSON.stringify(msg('m1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }], { input_tokens: 2, output_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 7 })),
      JSON.stringify({ type: 'user', isSidechain: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'a\nb', is_error: false }] } }),
      JSON.stringify({ type: 'assistant', isSidechain: true, message: { id: 'side1', role: 'assistant', content: [{ type: 'text', text: 'SUBAGENT' }], usage: { input_tokens: 999, output_tokens: 999 } } }),
      JSON.stringify({ type: 'user', isSidechain: true, message: { role: 'user', content: 'subagent prompt' } }),
      '{not json',
      JSON.stringify({ type: 'attachment', attachment: {} }),
      JSON.stringify(msg('m2', [{ type: 'text', text: 'done' }], { input_tokens: 1, output_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 9 })),
      JSON.stringify({ type: 'user', isSidechain: false, message: { role: 'user', content: [{ type: 'text', text: 'thanks' }] } })
    ]
    const r = imp(lines.join('\n') + '\n')
    const roles = r ? r.turns.map((t) => t.role + ':' + t.blocks.map((b) => b.type).join('+')).join(',') : 'none'
    ok('import.1 a typed prompt (string content) is a text turn, a meta record and every sidechain record are skipped, tool results are user turns, order is kept',
      r !== null && roles === 'user:text,assistant:thinking+tool_use,user:tool_result,assistant:text,user:text' &&
        r.turns[0].blocks[0].text === 'hello there' && !JSON.stringify(r.turns).includes('SUBAGENT'),
      roles)
    ok('import.2 assistant records sharing a message id are ONE turn, their repeated usage counted once, and meta counts user text turns',
      r !== null && r.turns.filter((t) => t.role === 'assistant').length === 2 &&
        r.meta.usage.input === 3 && r.meta.usage.output === 13 && r.meta.usage.cacheWrite === 5 && r.meta.usage.cacheRead === 16 &&
        r.meta.turns === 2 && r.meta.costUsd === undefined && r.turns[1].model === 'claude-x',
      JSON.stringify(r && r.meta))
    ok('import.3 a garbage line and an unknown record type cost themselves, never the import; an empty file is an empty import',
      r !== null && r.skipped.malformed === 1 && r.skipped.ignored >= 2 && imp('').turns.length === 0,
      JSON.stringify(r && r.skipped))
  }

  // attach.1 — M75. An image travels as a base64 block on the wire and as a
  // PLACEHOLDER in the stored turn: the transcript file must never carry the
  // bytes (a screenshot is a megabyte, a conversation is many), and the
  // renderer renders "image · 12 KB", not the picture.
  {
    const { manager, spawns } = makeManager()
    manager.create({ id: 'p1', cwd: '/repo' })
    const png = Buffer.from('fake-png-bytes').toString('base64')
    const r = typeof manager.send === 'function' ? manager.send('p1', 'look at this', [{ mediaType: 'image/png', base64: png, name: 'shot.png' }]) : null
    const line = spawns[0] && spawns[0].proc.stdin[0] ? JSON.parse(spawns[0].proc.stdin[0]) : null
    const content = line && line.message && line.message.content
    const turn = manager.transcript('p1')[0]
    ok('attach.1 an image goes on the wire as a base64 image block after the text, and the stored user turn carries a placeholder with the media type and size, never the bytes',
      r === 'sent' && Array.isArray(content) && content.length === 2 && content[0].type === 'text' && content[0].text === 'look at this' &&
        content[1].type === 'image' && content[1].source && content[1].source.type === 'base64' && content[1].source.media_type === 'image/png' && content[1].source.data === png &&
        turn && turn.blocks.length === 2 && turn.blocks[1].type === 'image' && turn.blocks[1].mediaType === 'image/png' && turn.blocks[1].size === Buffer.byteLength('fake-png-bytes') &&
        !JSON.stringify(turn).includes(png),
      JSON.stringify({ r, content: content && content.map((c) => c.type), turn: turn && turn.blocks }))
    const encoded = JSON.parse(T.userMessageLine('hi'))
    const imageOnly = JSON.parse(T.userMessageLine('', [{ mediaType: 'image/png', base64: png }]))
    ok('attach.1b a message with no image is still a one-block text message (the M71 wire shape, unchanged), and an image-only message carries no empty text block',
      Array.isArray(encoded.message.content) && encoded.message.content.length === 1 && encoded.message.content[0].type === 'text' &&
        imageOnly.message.content.length === 1 && imageOnly.message.content[0].type === 'image', JSON.stringify({ encoded, imageOnly: imageOnly.message.content.map((c) => c.type) }))
  }

  // attach.2 — M75. The pure attachment resolver: a non-image path is refused
  // by name (the answer names the fix — reference it by path), a file over
  // the cap is refused with the cap, a missing file is refused, and an image
  // under the cap is decoded with its media type.
  {
    const ATT = M.attachments || {}
    const resolve = typeof ATT.resolveAttachment === 'function' ? ATT.resolveAttachment : () => null
    const dir = mkdtempSync(join(tmpdir(), 'tc attach '))
    const fs = require('node:fs')
    fs.writeFileSync(join(dir, 'ok.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    fs.writeFileSync(join(dir, 'big.jpg'), Buffer.alloc(300))
    fs.writeFileSync(join(dir, 'notes.txt'), 'hello')
    const okImg = resolve({ kind: 'path', path: join(dir, 'ok.png') }, 200)
    const big = resolve({ kind: 'path', path: join(dir, 'big.jpg') }, 200)
    const txt = resolve({ kind: 'path', path: join(dir, 'notes.txt') }, 200)
    const gone = resolve({ kind: 'path', path: join(dir, 'nope.png') }, 200)
    const data = resolve({ kind: 'data', mediaType: 'image/jpeg', base64: Buffer.from('abc').toString('base64'), name: 'pasted' }, 200)
    const dataBig = resolve({ kind: 'data', mediaType: 'image/jpeg', base64: Buffer.alloc(300).toString('base64'), name: 'pasted' }, 200)
    rmSync(dir, { recursive: true, force: true })
    ok('attach.2 an image under the cap decodes with its media type; a non-image, an oversize file (path or data) and a missing file are refused by name',
      okImg && okImg.kind === 'image' && okImg.mediaType === 'image/png' && okImg.base64 === Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') && okImg.name === 'ok.png' &&
        big && big.kind === 'refused' && /200/.test(big.reason) &&
        txt && txt.kind === 'refused' && /path/.test(txt.reason) &&
        gone && gone.kind === 'refused' && data && data.kind === 'image' && data.name === 'pasted' &&
        dataBig && dataBig.kind === 'refused',
      JSON.stringify({ okImg: okImg && okImg.kind, big, txt, gone, data: data && data.kind, dataBig }))
  }

  // M76 — approve.1–.3. MAIN OWNS PENDING AND SAYS SO ONCE. The tracker is
  //     driven by the manager's own events and emits the terminal's state
  //     word on the terminal's channel — so every attention surface lights
  //     with no code of its own — and drives the M43 sink exactly as
  //     PtyManager.syncAttention does: on ENTRY only. approve.2 is the badge
  //     union: two authors of one number, one writer.
  {
    const P = M.approvals
    const calls = []
    const sink = {
      notify: (id, label, count, body) => calls.push(['notify', id, label, count, body]),
      badge: (n) => calls.push(['badge', n]),
      beep: () => calls.push(['beep']),
      windowFocused: () => false, notifyEnabled: () => true, soundEnabled: () => true
    }
    const states = []
    const tracker = P.createApprovalTracker({ sink, emitState: (id, state) => states.push([id, state]), label: (id) => `dir-${id}` })
    const req = (id, requestId, toolName = 'Bash') => ({ id, type: 'permission-request', requestId, toolName, input: { command: 'ls' } })
    tracker.apply(req('c1', 'r1'))
    tracker.apply(req('c1', 'r2', 'Edit'))
    const afterTwo = { states: states.slice(), calls: calls.slice() }
    tracker.apply({ id: 'c1', type: 'permission-answered', requestId: 'r1', allow: true })
    const afterOne = states.slice()
    tracker.apply({ id: 'c1', type: 'permission-dropped', requestId: 'r2' })
    const afterNone = states.slice()
    tracker.apply(req('c2', 'r9'))
    tracker.apply({ id: 'c2', type: 'status', status: 'disposed' })
    ok('approve.1 a panel entering needs-you emits wants-you ONCE and notifies once naming the tool; a second request re-notifies nothing; one answer of two keeps it; the last answer emits idle; a dispose drops the panel and emits nothing',
      afterTwo.states.length === 1 && afterTwo.states[0][0] === 'c1' && afterTwo.states[0][1] === 'wants-you' &&
        afterTwo.calls.filter((c) => c[0] === 'notify').length === 1 && /Bash/.test(afterTwo.calls.find((c) => c[0] === 'notify')[2]) && /dir-c1/.test(afterTwo.calls.find((c) => c[0] === 'notify')[4]) &&
        afterTwo.calls.filter((c) => c[0] === 'beep').length === 1 && afterTwo.calls.some((c) => c[0] === 'badge' && c[1] === 1) &&
        afterOne.length === 1 && afterNone.length === 2 && afterNone[1][1] === 'idle' &&
        states.length === 3 && states[2][0] === 'c2' && states[2][1] === 'wants-you' && tracker.pendingIds().length === 0 && calls[calls.length - 1][0] === 'badge' && calls[calls.length - 1][1] === 0,
      JSON.stringify({ afterTwo, afterOne, afterNone, states, tail: calls.slice(-3), pending: tracker.pendingIds() }))

    const real = []
    const union = P.createAttentionUnion({ ...sink, badge: (n) => real.push(n), notify: (...a) => real.push(['n', ...a]), beep: () => real.push('beep') })
    union.forPty.badge(2)
    union.forAgents.badge(1)
    union.forPty.badge(0)
    union.forAgents.notify('c1', 'claude asks to run Bash', 1, 'api needs you')
    ok('approve.2 the badge is the SUM of both authors and each child sink otherwise passes straight through',
      real[0] === 2 && real[1] === 3 && real[2] === 1 && Array.isArray(real[3]) && real[3][2] === 'claude asks to run Bash' && real[3][4] === 'api needs you' &&
        union.forPty.windowFocused() === false && union.forAgents.notifyEnabled() === true,
      JSON.stringify(real))

    const quiet = []
    const focusedTracker = P.createApprovalTracker({
      sink: { ...sink, notify: (...a) => quiet.push(['notify', ...a]), beep: () => quiet.push(['beep']), badge: () => {}, windowFocused: () => true, soundEnabled: () => false },
      emitState: () => {}, label: () => 'x'
    })
    focusedTracker.apply(req('c3', 'r1'))
    const offTracker = P.createApprovalTracker({
      sink: { ...sink, notify: (...a) => quiet.push(['notify-off', ...a]), beep: () => {}, badge: () => {}, windowFocused: () => false, notifyEnabled: () => false },
      emitState: () => {}, label: () => 'x'
    })
    offTracker.apply(req('c4', 'r1'))
    ok('approve.3 no notification while the window is focused or with the setting off, and no beep with sound off',
      quiet.length === 0, JSON.stringify(quiet))

    // approve.4 — the REAL manager's order on an exit with a question open:
    // permission-dropped BEFORE status exited, so the tracker says idle and
    // the panel (which stays on the canvas) is not a phantom needs-you; and
    // resync says wants-you again only while something pends.
    const { manager, spawns } = makeManager()
    const exitStates = []
    const exitTracker = P.createApprovalTracker({ sink: { ...sink, notify() {}, beep() {}, badge() {} }, emitState: (id, state) => exitStates.push([id, state]), label: () => 'x' })
    manager.subscribe((e) => exitTracker.apply(e))
    manager.create({ id: 'p1', cwd: '/repo' })
    manager.send('p1', 'x')
    spawns[0].proc.emitLines(upTo(fixture('permission.jsonl'), (l) => l.includes('"can_use_tool"')))
    await tick(5)
    const beforeExit = exitStates.slice()
    exitTracker.resync('p1')
    const resynced = exitStates.slice()
    spawns[0].proc.exit(1, null)
    await tick(5)
    exitTracker.resync('p1')
    ok('approve.4 an exit with a question open reaches the tracker as dropped-then-exited, so it emits idle for a panel that stays on the canvas; resync repeats wants-you only while pending',
      beforeExit.length === 1 && beforeExit[0][1] === 'wants-you' && resynced.length === 2 && resynced[1][1] === 'wants-you' &&
        exitStates.length === 3 && exitStates[2][1] === 'idle' && exitTracker.pendingIds().length === 0,
      JSON.stringify(exitStates))

    // M355 — hold.attention.1. A HOLD IS A NEEDS-YOU TOO. A panel is waiting
    // while it is pending OR held: entry to either says wants-you once and
    // notifies once in the hold's own words; an answered question on a held
    // agent keeps it waiting; a release says idle; an exit (the panel stays)
    // says idle and a dispose says nothing; the badge counts panels, not
    // reasons. And the REAL manager says a hold carried at create (M354), so
    // a relaunched held agent reaches the queue with no send.
    {
      const hCalls = []
      const hStates = []
      const hSink = { ...sink, notify: (id, label, count) => hCalls.push(['notify', id, label, count]), badge: (n) => hCalls.push(['badge', n]), beep() {} }
      const t = P.createApprovalTracker({ sink: hSink, emitState: (id, state) => hStates.push([id, state]), label: (id) => id })
      const meter = (id, held) => ({ id, type: 'meter', meter: held === undefined ? { spentUsd: 1 } : { spentUsd: held.spent, held } })
      const hold = { unit: 'usd', spent: 2.1, limit: 2 }
      t.apply(meter('h1', hold))
      t.apply(meter('h1', { ...hold, spent: 2.2 }))
      t.apply(req('h1', 'r1'))
      const whileBoth = { states: hStates.slice(), badge: hCalls.filter((c) => c[0] === 'badge').pop() }
      t.apply({ id: 'h1', type: 'permission-answered', requestId: 'r1', allow: true })
      const afterAnswer = hStates.slice()
      t.apply(meter('h1', undefined))
      const afterRelease = hStates.slice()
      t.apply(meter('h2', { unit: 'context', spent: 160000, limit: 150000, own: true }))
      t.apply({ id: 'h2', type: 'status', status: 'exited' })
      t.apply(meter('h3', hold))
      t.apply({ id: 'h3', type: 'status', status: 'disposed' })
      const notes = hCalls.filter((c) => c[0] === 'notify').map((c) => c[2])
      const lastBadge = hCalls.filter((c) => c[0] === 'badge').pop()

      const carriedStates = []
      const ct = P.createApprovalTracker({ sink: { ...sink, notify() {}, beep() {}, badge() {} }, emitState: (id, state) => carriedStates.push([id, state]), label: () => 'x' })
      const r = makeManager({ caps: () => ({ usd: 2, context: 0 }), carried: (id) => (id === 'held' ? { spentUsd: 2.5 } : undefined) })
      r.manager.subscribe((e) => ct.apply(e))
      r.manager.create({ id: 'held', cwd: '/r' })
      r.manager.create({ id: 'fine', cwd: '/r' })
      ct.resync('held')
      ok('hold.attention.1 a hold is a needs-you: entry says wants-you and notifies once in its own words, an answered question keeps a held agent waiting, a release or an exit says idle, a dispose says nothing, the badge counts panels, and a hold carried at create is said',
        whileBoth.states.length === 1 && whileBoth.states[0][1] === 'wants-you' && whileBoth.badge[1] === 1 &&
          afterAnswer.length === 1 && afterRelease.length === 2 && afterRelease[1][1] === 'idle' &&
          hStates.length === 5 && hStates[2].join() === 'h2,wants-you' && hStates[3].join() === 'h2,idle' && hStates[4].join() === 'h3,wants-you' &&
          notes.length === 3 && notes[0] === 'claude is held at its $2.00 spend cap ($2.10 reported)' &&
          notes[1] === 'claude is held at its own 150k-token context cap (160k in the conversation)' &&
          lastBadge[1] === 0 && t.heldIds().length === 0 &&
          carriedStates.length === 2 && carriedStates.every((s) => s[0] === 'held' && s[1] === 'wants-you'),
        JSON.stringify({ hStates, notes, lastBadge, whileBoth, carriedStates }))
    }
  }

  // M81 — supervisor.1. The system-prompt append: a chat can be created with
  //      one, it rides `--append-system-prompt <text>` on the FRESH spawn, and
  //      a resumed session carries it too (the CLI keeps no record of it) —
  //      but an absent one adds no flag at all.
  {
    const withPrompt = A.headlessArgs({ sessionId: 'u-1', resume: false, agentOptions: {}, appendSystemPrompt: 'you supervise this canvas' })
    const resumed = A.headlessArgs({ sessionId: 'u-1', resume: true, agentOptions: {}, appendSystemPrompt: 'you supervise this canvas' })
    const without = A.headlessArgs({ sessionId: 'u-1', resume: false, agentOptions: {} })
    const at = withPrompt.indexOf('--append-system-prompt')
    // …and through the MANAGER to the runner\'s argv: the flag was written into
    // `counters` in the first cut, which typechecks and means no real spawn
    // ever carried it (M81's verifier). This is the check that sees that.
    const { manager: supMgr, spawns: supSpawns } = makeManager()
    supMgr.create({ id: 's1', cwd: '/repo', appendSystemPrompt: 'you supervise this canvas' })
    supMgr.send('s1', 'hello')
    const supArgs = supSpawns[0]?.args ?? []
    const supAt = supArgs.indexOf('--append-system-prompt')
    const { manager: plainMgr, spawns: plainSpawns } = makeManager()
    plainMgr.create({ id: 'p9', cwd: '/repo' })
    plainMgr.send('p9', 'hello')
    ok('supervisor.1 an append-system-prompt rides the fresh and the resumed spawn as one flag and its text, REACHES the runner\'s argv through the manager, and an absent one adds no flag',
      at >= 0 && withPrompt[at + 1] === 'you supervise this canvas' && withPrompt.filter((a) => a === '--append-system-prompt').length === 1 &&
        resumed.includes('--append-system-prompt') && resumed.includes('--resume') &&
        !without.includes('--append-system-prompt') &&
        supAt >= 0 && supArgs[supAt + 1] === 'you supervise this canvas' &&
        !(plainSpawns[0]?.args ?? []).includes('--append-system-prompt'),
      JSON.stringify({ withPrompt, resumed, without, supArgs, plainArgs: plainSpawns[0]?.args }))
  }

  // no-publish.1. "Never push, never merge" is enforced, not only asked: a
  //      prompt carrying NO_PUBLISH_SENTENCE also denies the push/merge/PR
  //      commands on fresh AND resumed spawns; the supervisor's does not. The
  //      sentence must stay verbatim in DISPATCH_PROMPT and the swarm briefs,
  //      or the deny list silently stops riding them.
  {
    const DISPATCH = M.sharedSession.DISPATCH_PROMPT
    const swarmSrc = readFileSync(join(__dirname, '..', 'src', 'shared', 'swarm.ts'), 'utf8')
    const denyOf = (args) => { const i = args.indexOf('--disallowed-tools'); return i < 0 ? [] : args.slice(i + 1, i + 1 + A.NO_PUBLISH_TOOLS.length) }
    const fresh = A.headlessArgs({ sessionId: 'u-1', resume: false, agentOptions: {}, appendSystemPrompt: DISPATCH })
    const resumed = A.headlessArgs({ sessionId: 'u-1', resume: true, agentOptions: {}, appendSystemPrompt: DISPATCH })
    const sup = A.headlessArgs({ sessionId: 'u-1', resume: false, agentOptions: {}, appendSystemPrompt: M.sharedSession.SUPERVISOR_PROMPT })
    ok('no-publish.1 a dispatch prompt denies git push/merge and gh pr create/merge on fresh and resumed spawns, the supervisor\'s denies nothing, and the swarm briefs still carry the sentence',
      DISPATCH.includes(A.NO_PUBLISH_SENTENCE) && JSON.stringify(denyOf(fresh)) === JSON.stringify(A.NO_PUBLISH_TOOLS) &&
        JSON.stringify(denyOf(resumed)) === JSON.stringify(A.NO_PUBLISH_TOOLS) && !sup.includes('--disallowed-tools') &&
        swarmSrc.split(A.NO_PUBLISH_SENTENCE).length - 1 >= 2,
      JSON.stringify({ fresh, sup }))
  }

  // M82 — budget.1 / budget.2. TWO CEILINGS THE CANVAS ENFORCES. budget.1:
  //      a ceiling of 0 refuses nothing (every pre-M82 fixture); a send over
  //      the budget is REFUSED and stores no turn (a refused message is not a
  //      turn); a send under a reached concurrency ceiling is QUEUED with its
  //      own reason even though this session is free. budget.2: crossing the
  //      budget INTERRUPTS every turn in flight (never kills) and says so
  //      ONCE per crossing, not once per result.
  {
    const limits = { maxConcurrent: 0, budgetUsd: 0 }
    const { manager, spawns, events } = makeManager({ limits: () => limits })
    manager.create({ id: 'b1', cwd: '/r' })
    manager.create({ id: 'b2', cwd: '/r' })
    const freely = manager.send('b1', 'one')
    // A ceiling of one, with b1's turn in flight: b2 queues for CONCURRENCY.
    limits.maxConcurrent = 1
    const queued = manager.send('b2', 'two')
    const queuedEvent = events.filter((e) => e.type === 'queued').pop()
    const b2Turns = manager.transcript('b2').filter((t) => t.role === 'user').length
    // Over budget: refused, and nothing stored.
    limits.maxConcurrent = 0
    limits.budgetUsd = 0.01
    const proc1 = spawns[0].proc
    proc1.emitLines([JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.5, usage: { input_tokens: 1, output_tokens: 1 } })])
    await tick(5)
    const refused = manager.send('b2', 'three')
    const storedAfterRefusal = manager.transcript('b2').filter((t) => t.role === 'user').length
    ok('budget.1 a ceiling of 0 refuses nothing; a send past a reached concurrency ceiling queues with its own reason; a send over the budget is refused and stores no turn',
      freely === 'sent' && queued === 'queued' && queuedEvent && queuedEvent.reason === 'concurrency' && b2Turns === 1 &&
        refused === 'refused-budget' && storedAfterRefusal === b2Turns,
      JSON.stringify({ freely, queued, queuedEvent, b2Turns, refused, storedAfterRefusal }))

    const l2 = { maxConcurrent: 0, budgetUsd: 1 }
    const two = makeManager({ limits: () => l2 })
    two.manager.create({ id: 'c1', cwd: '/r' })
    two.manager.create({ id: 'c2', cwd: '/r' })
    two.manager.send('c1', 'x')
    two.manager.send('c2', 'y')
    const before = two.spawns.map((s) => s.proc.killed)
    // c1's result carries the whole budget: both turns in flight are interrupted.
    two.spawns[0].proc.emitLines([JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 2, usage: { input_tokens: 1, output_tokens: 1 } })])
    await tick(10)
    const budgetEvents = two.events.filter((e) => e.type === 'budget')
    const interrupts = two.spawns.map((s) => s.proc.stdin.filter((l) => l.includes('interrupt')).length)
    // A second result must not say it again.
    two.spawns[1].proc.emitLines([JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.1, usage: { input_tokens: 1, output_tokens: 1 } })])
    await tick(10)
    const afterSecond = two.events.filter((e) => e.type === 'budget').length
    ok('budget.2 crossing the budget interrupts every turn in flight and never kills, and says so once per crossing rather than once per result',
      budgetEvents.length === 1 && typeof budgetEvents[0].spent === 'number' && budgetEvents[0].limit === 1 &&
        interrupts.some((n) => n > 0) && two.spawns.every((s) => s.proc.killed === 0) && before.every((k) => k === 0) &&
        afterSecond === 1,
      JSON.stringify({ budgetEvents, interrupts, killed: two.spawns.map((s) => s.proc.killed), afterSecond }))
  }

  // M350 — cap.*. EACH NODE'S OWN CAPS, enforced by main outside the agent
  //      loop. cap.meter.1: a node's spend is CARRIED across its processes
  //      (the CLI's figure restarts at 0 in a new one) while `costUsd` keeps
  //      its M82 meaning, and the canvas budget now sums the carried figure.
  //      cap.context.1: context is measured per message, set (never summed)
  //      and said once. cap.hold.1: a message that crosses the context cap
  //      INTERRUPTS its own turn (never kills), holds the node, keeps what was
  //      queued unsent, and refuses a send storing nothing. cap.release.1: a
  //      cap raised above the figure releases the node at the next send, and
  //      the held message goes FIRST. cap.usd.1: the spend cap holds at the
  //      result, stops an auto run with its own reason, and the canvas budget
  //      is not what refused.
  {
    const result = (usd) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: usd, usage: { input_tokens: 1, output_tokens: 1 } })
    const assistant = (id, usage) => JSON.stringify({ type: 'assistant', isSidechain: false, message: { id, model: 'claude-x', role: 'assistant', content: [{ type: 'text', text: 'hi' }], usage } })
    const meters = (evs, id) => evs.filter((e) => e.id === id && e.type === 'meter').map((e) => e.meter)

    const limits = { maxConcurrent: 0, budgetUsd: 0 }
    const a = makeManager({ limits: () => limits })
    a.manager.create({ id: 'm1', cwd: '/r' })
    a.manager.create({ id: 'm0', cwd: '/r' })
    a.manager.send('m1', 'one')
    a.spawns[0].proc.emitLines([result(0.5)])
    await tick(5)
    a.spawns[0].proc.exit(1, null)
    await tick(5)
    a.manager.send('m1', 'two')
    a.spawns[1].proc.emitLines([result(0.2)])
    await tick(5)
    const snap = a.manager.get('m1')
    limits.budgetUsd = 0.6
    const overBudget = a.manager.send('m1', 'three')
    ok('cap.meter.1 a node\'s spend is carried across its processes (0.5 then a new process\'s 0.2 is 0.7, never 0.2), costUsd keeps the current process\'s figure, an unpriced node has no meter, and the canvas budget sums the carried figure',
      a.spawns.length === 2 && snap.meter && Math.abs(snap.meter.spentUsd - 0.7) < 1e-9 && snap.costUsd === 0.2 &&
        a.manager.get('m0').meter === undefined && overBudget === 'refused-budget',
      JSON.stringify({ meter: snap.meter, costUsd: snap.costUsd, m0: a.manager.get('m0').meter, overBudget }))

    const b = makeManager()
    b.manager.create({ id: 'c1', cwd: '/r' })
    b.manager.send('c1', 'go')
    const usage = { input_tokens: 1000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 2000, output_tokens: 500 }
    b.spawns[0].proc.emitLines([assistant('msg1', usage), assistant('msg1', usage), assistant('msg1', usage)])
    await tick(5)
    const said = meters(b.events, 'c1')
    ok('cap.context.1 context is measured on each message as every input class plus what it wrote, set rather than summed, and a message\'s repeated blocks say the meter once',
      said.length === 1 && said[0].context === 53500 && b.manager.get('c1').meter.context === 53500,
      JSON.stringify(said))

    const caps = { usd: 0, context: 50000 }
    const c = makeManager({ caps: () => caps })
    c.manager.create({ id: 'h1', cwd: '/r' })
    c.manager.send('h1', 'long task')
    const queued = c.manager.send('h1', 'and then this')
    const proc = c.spawns[0].proc
    proc.emitLines([assistant('big', usage)])
    await tick(5)
    const interruptsWritten = proc.stdin.filter((l) => l.includes('interrupt')).length
    const heldMeter = c.manager.get('h1').meter
    proc.emitLines([JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, total_cost_usd: 0.1, usage: { input_tokens: 1, output_tokens: 1 } })])
    await tick(5)
    const afterResult = c.manager.get('h1')
    const userTurnsBefore = c.manager.transcript('h1').filter((t) => t.role === 'user').length
    const refused = c.manager.send('h1', 'please continue')
    const userTurnsAfter = c.manager.transcript('h1').filter((t) => t.role === 'user').length
    // Transitions INTO a hold: the meter is said again while held (the result's spend), which is not a second hold.
    const holds = meters(c.events, 'h1').filter((m, i, all) => m.held !== undefined && (i === 0 || all[i - 1].held === undefined)).length
    ok('cap.hold.1 a message that crosses the context cap interrupts its own turn (never kills), holds the node once, keeps the queued message unsent, and refuses a send storing nothing',
      queued === 'queued' && interruptsWritten === 1 && proc.killed === 0 && heldMeter.held && heldMeter.held.unit === 'context' &&
        heldMeter.held.spent === 53500 && heldMeter.held.limit === 50000 && afterResult.queued === 1 &&
        !c.events.some((e) => e.id === 'h1' && e.type === 'dequeued') && refused === 'refused-cap' && userTurnsAfter === userTurnsBefore && holds === 1,
      JSON.stringify({ queued, interruptsWritten, killed: proc.killed, heldMeter, queuedNow: afterResult.queued, refused, userTurnsBefore, userTurnsAfter, holds }))

    caps.context = 100000
    const writesBefore = proc.stdin.length
    const released = c.manager.send('h1', 'carry on')
    const served = proc.stdin.slice(writesBefore).map((l) => { try { return JSON.parse(l).message.content } catch { return null } })
    const dq = c.events.filter((e) => e.id === 'h1' && e.type === 'dequeued').map((e) => e.text)
    const releasedMeter = c.manager.get('h1').meter
    ok('cap.release.1 a cap raised above the figure releases the node at the next send, the message it held goes first, and the new one queues behind it',
      released === 'queued' && dq.length === 1 && dq[0] === 'and then this' && JSON.stringify(served).includes('and then this') &&
        !JSON.stringify(served).includes('carry on') && releasedMeter.held === undefined && c.manager.get('h1').queued === 1,
      JSON.stringify({ released, dq, served, releasedMeter, queued: c.manager.get('h1').queued }))

    const ucaps = { usd: 1, context: 0 }
    const d = makeManager({ caps: () => ucaps, limits: () => ({ maxConcurrent: 0, budgetUsd: 0 }) })
    d.manager.create({ id: 'u1', cwd: '/r' })
    const started = d.manager.startAuto('u1', { mode: 'complete', task: 'finish it' })
    d.spawns[0].proc.emitLines([result(1.25)])
    await tick(10)
    const uSnap = d.manager.get('u1')
    const autoEvents = d.events.filter((e) => e.id === 'u1' && e.type === 'auto')
    const lastAuto = autoEvents[autoEvents.length - 1]
    const uRefused = d.manager.send('u1', 'more')
    ok('cap.usd.1 the spend cap holds the node at the result that crosses it (nothing to interrupt), stops an auto run stuck with its own reason, and it is the cap that refuses — not the canvas budget',
      started.kind === 'started' && uSnap.meter.held && uSnap.meter.held.unit === 'usd' && uSnap.meter.held.limit === 1 &&
        d.spawns[0].proc.stdin.filter((l) => l.includes('interrupt')).length === 0 &&
        lastAuto && lastAuto.state === 'stuck' && lastAuto.reason === 'cap' && uRefused === 'refused-cap' && d.spawns.length === 1,
      JSON.stringify({ started, meter: uSnap.meter, lastAuto, uRefused, spawns: d.spawns.length }))
    // M351 — cap.own.1 / cap.changed.1. An agent's OWN caps over Settings,
    //      and a change re-read at once. cap.own.1: effectiveCaps takes the
    //      agent's figure wherever it has one (0 = no cap for this agent even
    //      over a Settings cap), in thousands for context, and says whose.
    //      cap.changed.1: capsChanged (main calls it on a layout save and a cap
    //      setting) releases a held node AT ONCE and serves what it held; a cap
    //      lowered under an idle node's figure holds it without an interrupt;
    //      one lowered under a turn in flight interrupts it; and the meter
    //      carries the caps in force with their owner.
    {
      const SS = M.sharedSession
      const both = SS.effectiveCaps({ usd: 0, contextK: 150 }, { usd: 5, context: 80000 })
      const none = SS.effectiveCaps(undefined, { usd: 5, context: 80000 })
      const half = SS.effectiveCaps({ usd: 2 }, { usd: 5, context: 80000 })
      ok('cap.own.1 an agent\'s own caps stand over Settings figure by figure (0 is no cap for this agent), context in thousands, and whose each is',
        both.usd === 0 && both.context === 150000 && both.ownUsd && both.ownContext &&
          none.usd === 5 && none.context === 80000 && !none.ownUsd && !none.ownContext &&
          half.usd === 2 && half.ownUsd && half.context === 80000 && !half.ownContext &&
          SS.parseAgentCaps({ usd: 3, contextK: 2001 }).contextK === undefined && SS.parseAgentCaps('x') === undefined,
        JSON.stringify({ both, none, half }))

      const own = new Map()
      const capsOf = (id) => SS.effectiveCaps(own.get(id), { usd: 0, context: 50000 })
      const e = makeManager({ caps: capsOf })
      e.manager.create({ id: 'k1', cwd: '/r' })
      e.manager.create({ id: 'k2', cwd: '/r' })
      e.manager.send('k1', 'first')
      e.manager.send('k1', 'waiting behind it')
      const p1 = e.spawns[0].proc
      p1.emitLines([assistant('k1m', usage)])
      await tick(5)
      p1.emitLines([JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, total_cost_usd: 0.3, usage: { input_tokens: 1, output_tokens: 1 } })])
      await tick(5)
      const heldBefore = e.manager.get('k1').meter.held
      const writes = p1.stdin.length
      own.set('k1', { contextK: 100 })
      e.manager.capsChanged()
      const servedNow = p1.stdin.slice(writes).some((l) => l.includes('waiting behind it'))
      const k1Meter = e.manager.get('k1').meter
      // Lower k1's spend cap under its figure while it works on the served message: that turn is interrupted.
      const writes2 = p1.stdin.length
      own.set('k1', { contextK: 100, usd: 0.2 })
      e.manager.capsChanged()
      const interruptedMidTurn = p1.stdin.slice(writes2).some((l) => l.includes('interrupt'))
      // k2 is idle and unpriced; a context of its own is lowered under nothing measured — no hold.
      own.set('k2', { contextK: 1 })
      e.manager.capsChanged()
      const k2 = e.manager.get('k2').meter
      ok('cap.changed.1 capsChanged releases a held node at once and serves what it held; a cap lowered under a turn in flight interrupts it; an unmeasured node is never held; the meter says the caps in force and whose they are',
        heldBefore && heldBefore.unit === 'context' && servedNow && k1Meter.held === undefined &&
          k1Meter.caps && k1Meter.caps.context === 100000 && k1Meter.caps.ownContext === true && k1Meter.caps.ownUsd === false &&
          interruptedMidTurn && e.manager.get('k1').meter.held && e.manager.get('k1').meter.held.unit === 'usd' &&
          k2 && k2.held === undefined && k2.caps.context === 1000 && k2.caps.ownContext === true,
        JSON.stringify({ heldBefore, servedNow, k1Meter, interruptedMidTurn, k1Now: e.manager.get('k1').meter, k2 }))
    }
    // M352 — cap.plan.1. `cap-agent`'s value against an agent's own caps, and
    //      WHO may make the change. A person may set, clear or remove any cap;
    //      a door (an agent's plan, a workflow node) may only LOWER one — never
    //      raise it, never 0, none, default or a per-figure reset — or the cap
    //      binds only while the agent agrees to it.
    {
      const P = M.sharedSession.planCapChange
      const cur = { usd: 5, context: 200000 }
      const both = P(undefined, '3usd,150k', 'person', cur)
      const dollar = P({ contextK: 100 }, '$4', 'person', cur)
      const raise = P(undefined, '9usd', 'person', cur)
      const lower = P({ usd: 5 }, '3usd', 'door', cur)
      const doorUp = P({ usd: 5 }, '9usd', 'door', cur)
      const doorZero = P(undefined, '0usd', 'door', cur)
      const doorNone = P(undefined, 'none', 'door', cur)
      const doorDefault = P({ usd: 1 }, 'default', 'door', cur)
      const doorReset = P({ usd: 1 }, 'default-usd', 'door', cur)
      const doorUncapped = P(undefined, '100k', 'door', { usd: 0, context: 0 })
      const none = P({ usd: 3 }, 'none', 'person', cur)
      const clear = P({ usd: 3 }, 'default', 'person', cur)
      const resetOne = P({ usd: 3, contextK: 90 }, 'default-usd', 'person', cur)
      const bad = P(undefined, 'lots', 'person', cur)
      const tooBig = P(undefined, '5000usd', 'person', cur)
      const twice = P(undefined, '1usd,2usd', 'person', cur)
      const clash = P({ usd: 1 }, '2usd,default-usd', 'person', cur)
      const refusedByWho = [doorUp, doorZero, doorNone, doorDefault, doorReset].every((r) => r.kind === 'refused' && r.reason === M.sharedSession.CAP_DOOR_REASON)
      ok('cap.plan.1 a person may set, raise, clear and remove an agent\'s caps; a door may only lower one (never raise, 0, none, default or a reset), may cap an uncapped agent, and every bad value is refused by name',
        both.kind === 'set' && both.caps.usd === 3 && both.caps.contextK === 150 && dollar.kind === 'set' && dollar.caps.usd === 4 && dollar.caps.contextK === 100 &&
          raise.kind === 'set' && raise.caps.usd === 9 && lower.kind === 'set' && lower.caps.usd === 3 && refusedByWho &&
          doorUncapped.kind === 'set' && doorUncapped.caps.contextK === 100 &&
          none.kind === 'set' && none.caps.usd === 0 && none.caps.contextK === 0 && clear.kind === 'set' && clear.caps === undefined &&
          resetOne.kind === 'set' && resetOne.caps.usd === undefined && resetOne.caps.contextK === 90 &&
          bad.kind === 'refused' && /lots is not a cap/.test(bad.reason) && tooBig.kind === 'refused' && twice.kind === 'refused' && clash.kind === 'refused',
        JSON.stringify({ both, dollar, raise, lower, doorUp, doorZero, doorNone, doorUncapped, none, clear, resetOne, bad, tooBig, twice, clash }))
    }
    // M354 — cap.carry.1. A relaunch re-creates every chat by id, and its
    //      meter picks up from the panel's own log through a REAL file round
    //      trip. The spend is the runtime's carried field, never `costUsd`
    //      (an import writes that one for spend made outside the app); the
    //      context is the last assistant message's that reported usage; a
    //      carried figure past its cap is held at rest; the next process's
    //      spend adds to what was carried.
    {
      const dir = mkdtempSync(join(tmpdir(), 'tc carry '))
      const log = LOG.createAgentTranscriptLog({ dir })
      const totals = { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 }
      log.appendTurn('p1', { id: 'u-1', role: 'user', blocks: [{ type: 'text', text: 'go' }], at: 0 })
      log.appendTurn('p1', { id: 'a1', role: 'assistant', blocks: [], at: 1, usage: { input: 10, output: 5, cacheWrite: 0, cacheRead: 100 } })
      log.appendTurn('p1', { id: 'a2', role: 'assistant', blocks: [], at: 2, usage: { input: 1000, output: 500, cacheWrite: 2000, cacheRead: 116500 } })
      log.appendTurn('p1', { id: 'a3', role: 'assistant', blocks: [], at: 3 })
      log.appendMeta('p1', { usage: totals, costUsd: 0.4, spentUsd: 1.7, turns: 1 })
      log.appendMeta('p1', { usage: totals, costUsd: 0.4, spentUsd: 2.1, turns: 2 })
      log.appendMeta('imp', { usage: totals, costUsd: 3, turns: 1 })
      const carried = LOG.carriedMeter(log.read('p1'))
      const imported = LOG.carriedMeter(log.read('imp'))
      const never = LOG.carriedMeter(log.read('none'))
      const caps = { usd: 2, context: 0 }
      const r = makeManager({ caps: () => caps, carried: (id) => LOG.carriedMeter(log.read(id)) })
      const snap = r.manager.create({ id: 'p1', cwd: '/r' })
      const fresh = r.manager.create({ id: 'imp', cwd: '/r' })
      const refused = r.manager.send('p1', 'more')
      const spawnsWhileHeld = r.spawns.length
      caps.usd = 5
      const sent = r.manager.send('p1', 'more')
      r.spawns[0].proc.emitLines([result(0.3)])
      await tick(5)
      const after = r.manager.get('p1')
      rmSync(dir, { recursive: true, force: true })
      ok('cap.carry.1 a relaunched chat\'s meter picks up from its own log: the carried spend (never costUsd, so an import carries nothing) and the last reporting message\'s context, held at rest when past its cap, and the next process adds to it',
        carried.spentUsd === 2.1 && carried.context === 120000 && Object.keys(imported).length === 0 && Object.keys(never).length === 0 &&
          snap.meter && snap.meter.spentUsd === 2.1 && snap.meter.context === 120000 && snap.meter.held && snap.meter.held.unit === 'usd' &&
          fresh.meter && fresh.meter.spentUsd === undefined && fresh.meter.held === undefined &&
          refused === 'refused-cap' && spawnsWhileHeld === 0 && sent === 'sent' &&
          Math.abs(after.meter.spentUsd - 2.4) < 1e-9 && after.costUsd === 0.3 && after.meter.held === undefined,
        JSON.stringify({ carried, imported, never, snap: snap.meter, fresh: fresh.meter, refused, spawnsWhileHeld, sent, after: after.meter, costUsd: after.costUsd }))
    }
    const S2 = M.sharedSession
    const words = [S2.capSentence({ unit: 'usd', spent: 1.25, limit: 1 }), S2.capSentence({ unit: 'context', spent: 53500, limit: 50000 })]
    ok('cap.words.1 a hold is refused in its own figures and names the setting that releases it, and the bare word has a sentence too',
      words[0].includes('$1.00 spend cap') && words[0].includes('$1.25') && words[0].includes('agents.nodeCapUsd') &&
        words[1].includes('50k-token cap') && words[1].includes('54k') && words[1].includes('agents.nodeCapContextK') &&
        typeof S2.sendRefusalSentence('refused-cap') === 'string',
      JSON.stringify(words))
  }

  {
    // Live rate-limit state on the manager: emit the event, keep none/allowed/
    // limited, and stop at N% of the binding window through the SAME budget path.
    const limits = { maxConcurrent: 0, budgetUsd: 0, budgetWindowPercent: 0 }
    const { manager, spawns, events } = makeManager({ limits: () => limits })
    manager.create({ id: 'rl1', cwd: '/r' })
    ok('rate-limit.3a before any event the manager\'s rate-limit state is none',
      manager.rateLimit().kind === 'none', JSON.stringify(manager.rateLimit()))
    manager.send('rl1', 'go')
    const rateLine = fixture('turn.jsonl').find((l) => l.includes('"rate_limit_event"'))
    spawns[0].proc.emitLines([rateLine])
    await tick(5)
    const emitted = events.filter((e) => e.type === 'rate-limit')
    ok('rate-limit.3b a rate_limit_event is emitted (not ignored) and the manager folds it to allowed with both windows',
      emitted.length === 1 && emitted[0].status === 'allowed' && manager.rateLimit().kind === 'allowed' &&
        manager.rateLimit().windows.five_hour && manager.rateLimit().windows.seven_day,
      JSON.stringify({ emitted, state: manager.rateLimit() }))

    // End the first turn so the next send is a fresh ceiling check, not an in-flight queue.
    spawns[0].proc.emitLines([JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01, usage: { input_tokens: 1, output_tokens: 1 } })])
    await tick(5)
    limits.budgetWindowPercent = 80
    const under = manager.send('rl1', 'still ok')
    spawns[0].proc.emitLines([JSON.stringify({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed',
        isUsingOverage: false,
        unifiedWindows: {
          five_hour: { utilization: 0.85, resetsAt: 1788480000 },
          seven_day: { utilization: 0.1, resetsAt: 1788685200 }
        }
      }
    }), JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.02, usage: { input_tokens: 1, output_tokens: 1 } })])
    await tick(5)
    const turnsBefore = manager.transcript('rl1').filter((t) => t.role === 'user').length
    const refused = manager.send('rl1', 'too much')
    const afterRefuse = manager.transcript('rl1').filter((t) => t.role === 'user').length
    ok('rate-limit.3c budgetWindowPercent refuses a send when max(window) crosses the threshold, stores no turn, and leaves budgetUsd alone for API-key users',
      under === 'sent' && refused === 'refused-budget' && afterRefuse === turnsBefore,
      JSON.stringify({ under, refused, turnsBefore, afterRefuse, state: manager.rateLimit() }))

    // Interrupt path: a result that lands a window crossing stops in-flight turns.
    const w = { maxConcurrent: 0, budgetUsd: 0, budgetWindowPercent: 50 }
    const two = makeManager({ limits: () => w })
    two.manager.create({ id: 'w1', cwd: '/r' })
    two.manager.create({ id: 'w2', cwd: '/r' })
    two.manager.send('w1', 'a')
    two.manager.send('w2', 'b')
    two.spawns[0].proc.emitLines([JSON.stringify({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed',
        isUsingOverage: false,
        unifiedWindows: { five_hour: { utilization: 0.6, resetsAt: 1 }, seven_day: { utilization: 0.1, resetsAt: 2 } }
      }
    }), JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01, usage: { input_tokens: 1, output_tokens: 1 } })])
    await tick(10)
    const budgetEvents = two.events.filter((e) => e.type === 'budget')
    const interrupts = two.spawns.map((s) => s.proc.stdin.filter((l) => l.includes('interrupt')).length)
    ok('rate-limit.3d a window crossing interrupts in-flight turns once through enforceBudget (spent/limit are window fractions)',
      budgetEvents.length === 1 && budgetEvents[0].unit === 'window' && budgetEvents[0].limit === 0.5 &&
        interrupts.some((n) => n > 0) && two.spawns.every((s) => s.proc.killed === 0),
      JSON.stringify({ budgetEvents, interrupts }))
  }

  // quit — the optional agents dependency
  {
    const order = []
    const deps = {
      keep: false,
      manager: { killAll() { order.push('killAll') }, detachAll() { order.push('detachAll') } },
      backend: { shutdown() { order.push('shutdown') } },
      flush() { order.push('flush') },
      agents: { disposeAll() { order.push('agents') } }
    }
    Q.runQuit(deps)
    const end = order.join(',')
    order.length = 0
    Q.runQuit({ ...deps, keep: true })
    const keep = order.join(',')
    order.length = 0
    Q.runQuit({ ...deps, agents: undefined })
    ok('quit.1 the quit sequence disposes agent sessions in BOTH arms, before the flush, and an absent agents dependency changes nothing',
      end === 'killAll,agents,flush,shutdown' && keep === 'detachAll,agents,flush' && order.join(',') === 'killAll,flush,shutdown',
      JSON.stringify({ end, keep, absent: order.join(',') }))
    order.length = 0
    Q.runQuit({ ...deps, agents: { disposeAll() { throw new Error('boom') } } })
    ok('quit.2 a throw while disposing agents never skips the flush',
      order.includes('flush') && order.includes('shutdown'), order.join(','))
  }

/* ------------------------------------------------------------------------ */
/* M90. The second headless backend: codex exec --json                       */
/* ------------------------------------------------------------------------ */

{
  /* codex.1 — the adapter over three streams recorded from codex-cli 0.153.4. */
  const C = M.codex
  const codexFixture = (name) => readFileSync(join(__dirname, 'fixtures', 'agent-session', 'codex', name), 'utf8').split('\n').filter((l) => l.trim() !== '')
  const pong = C.parseCodexLines(codexFixture('pong.jsonl'))
  const session = pong.find((e) => e.type === 'session')
  const assistant = pong.filter((e) => e.type === 'assistant')
  const result = pong.find((e) => e.type === 'result')
  ok('codex.1 thread.started is the session (the thread id is the session id), a completed agent_message is one assistant text block, and turn.completed is a result carrying usage in the app\'s totals and NO cost',
    session !== undefined && /^[0-9a-f-]{36}$/.test(session.sessionId) &&
      assistant.length === 1 && assistant[0].blocks.length === 1 && assistant[0].blocks[0].type === 'text' && /pong/i.test(assistant[0].blocks[0].text) &&
      result !== undefined && result.usage !== undefined && result.usage.input > 0 && result.usage.output > 0 && result.costUsd === undefined &&
      pong.every((e) => e.type !== 'malformed' && e.type !== 'unknown'),
    JSON.stringify({ session, assistant, result, kinds: pong.map((e) => e.type) }))

  const command = C.parseCodexLines(codexFixture('command.jsonl'))
  const uses = command.flatMap((e) => (e.type === 'assistant' ? e.blocks.filter((b) => b.type === 'tool_use') : []))
  const results = command.flatMap((e) => (e.type === 'user' ? e.blocks.filter((b) => b.type === 'tool_result') : []))
  ok('codex.1.b a completed command_execution is a tool_use block (Bash, the command as input) paired with a tool_result block carrying its output under the SAME id, so the panel\'s existing tool rows render it; item.started is ignored, never unknown',
    uses.length >= 1 && results.length === uses.length &&
      uses.every((u) => u.name === 'Bash' && typeof u.input.command === 'string') &&
      results.every((r, i) => r.toolUseId === uses[i].id && typeof r.content === 'string') &&
      command.some((e) => e.type === 'ignored') && command.every((e) => e.type !== 'unknown' && e.type !== 'malformed'),
    JSON.stringify({ uses, results, kinds: command.map((e) => e.type) }))

  const resumed = C.parseCodexLines(codexFixture('resume.jsonl'))
  const resumedSession = resumed.find((e) => e.type === 'session')
  ok('codex.1.c a resumed stream repeats thread.started with the SAME thread id, and its result still carries usage',
    resumedSession !== undefined && resumedSession.sessionId === session.sessionId &&
      resumed.some((e) => e.type === 'result' && e.usage !== undefined),
    JSON.stringify({ resumedSession }))

  const bad = ['{not json', '{"type":"telepathy"}', '{"type":"item.completed","item":{"type":"reasoning"}}'].flatMap(C.parseCodexLine)
  ok('codex.1.d a broken line is malformed, an unknown top-level type is unknown BY KIND, and an item kind this app does not render is ignored by kind — never a throw',
    bad[0].type === 'malformed' && bad[1].type === 'unknown' && bad[1].kind === 'telepathy' && bad[2].type === 'ignored' && bad[2].kind === 'item:reasoning',
    JSON.stringify(bad))

  const first = C.codexArgs({ cwd: '/w', text: 'hello there', resume: false, sessionId: '', agentOptions: { sandbox: 'workspace-write', model: 'o4' } })
  const later = C.codexArgs({ cwd: '/w', text: 'again', resume: true, sessionId: 'thread-1' })
  ok('codex.1.e the first turn is `exec --json -C <cwd> --skip-git-repo-check` with the knobs and the prompt as the LAST argument; a later turn is `exec resume <id> <prompt> --json`; the prompt is never on stdin',
    first[0] === 'exec' && first.includes('--json') && first[first.indexOf('-C') + 1] === '/w' && first.includes('--skip-git-repo-check') &&
      first[first.indexOf('--sandbox') + 1] === 'workspace-write' && first[first.indexOf('--model') + 1] === 'o4' && first[first.length - 1] === 'hello there' &&
      later[0] === 'exec' && later[1] === 'resume' && later[2] === 'thread-1' && later[3] === 'again' && later.includes('--json'),
    JSON.stringify({ first, later }))
}

{
  /* codex.2 — the manager over a fake runner with backend codex. */
  const codexFixture = (name) => readFileSync(join(__dirname, 'fixtures', 'agent-session', 'codex', name), 'utf8').split('\n').filter((l) => l.trim() !== '')
  const { manager, spawns, events } = makeManager({ codex: { command: '/fake/bin/codex' } })
  manager.create({ id: 'cx', cwd: '/w', backend: 'codex' })
  const before = manager.get('cx')
  const r1 = manager.send('cx', 'ping')
  const s1 = spawns[0]
  ok('codex.2 a codex session spawns the codex command per send with the text as an argument, `exec` first, nothing written to stdin, and the snapshot names its backend',
    r1 === 'sent' && spawns.length === 1 && s1.command === '/fake/bin/codex' && s1.args[0] === 'exec' && s1.args[1] !== 'resume' &&
      s1.args[s1.args.length - 1] === 'ping' && s1.proc.stdin.length === 0 && s1.cwd === '/w' &&
      before.backend === 'codex' && before.status === 'not-started' && manager.get('cx').status === 'starting',
    JSON.stringify({ r1, args: s1.args, stdin: s1.proc.stdin, snap: manager.get('cx') }))

  s1.proc.emitLines(codexFixture('pong.jsonl'))
  const afterResult = manager.get('cx')
  s1.proc.exit(0, null)
  const afterExit = manager.get('cx')
  const threadId = codexFixture('pong.jsonl').map((l) => JSON.parse(l)).find((r) => r.type === 'thread.started').thread_id
  ok('codex.2.b the thread id from thread.started is adopted as the session id; the process exiting 0 after turn.completed is the turn\'s normal END, so the session reads ready with one turn — never exited, never turn-aborted',
    afterResult.sessionId === threadId && afterResult.turns === 1 && afterResult.usage.input > 0 && afterResult.costUsd === undefined &&
      afterExit.status === 'ready' && afterExit.exitCode === undefined && afterExit.pid === undefined &&
      !events.some((e) => e.id === 'cx' && e.type === 'turn-aborted') &&
      !events.some((e) => e.id === 'cx' && e.type === 'status' && e.status === 'exited'),
    JSON.stringify({ afterResult, afterExit, kinds: events.filter((e) => e.id === 'cx').map((e) => e.type) }))

  const r2 = manager.send('cx', 'again')
  const s2 = spawns[1]
  ok('codex.2.c the second send spawns a NEW process with `exec resume <thread id> <prompt>`',
    r2 === 'sent' && spawns.length === 2 && s2.args[0] === 'exec' && s2.args[1] === 'resume' && s2.args[2] === threadId && s2.args[3] === 'again' && s2.args.includes('--json') &&
      manager.get('cx').status === 'streaming',
    JSON.stringify({ r2, args: s2 && s2.args, status: manager.get('cx').status }))

  const interrupted = manager.interrupt('cx')
  const r3 = manager.send('cx', 'queued one')
  ok('codex.2.d interrupt on a codex session answers false and writes nothing (there is no interrupt door), and a send mid-turn QUEUES exactly as claude\'s does',
    interrupted === false && s2.proc.stdin.length === 0 && s2.proc.killed === 0 && r3 === 'queued' && manager.get('cx').queued === 1,
    JSON.stringify({ interrupted, r3, snap: manager.get('cx') }))

  s2.proc.emitLines(codexFixture('resume.jsonl'))
  s2.proc.exit(0, null)
  ok('codex.2.e when the turn\'s process ends, the queued message spawns the next process (resume again) and the queue is never dropped as an exit would drop it',
    spawns.length === 3 && spawns[2].args[1] === 'resume' && spawns[2].args[3] === 'queued one' && manager.get('cx').queued === 0 && manager.get('cx').turns === 2 &&
      !events.some((e) => e.id === 'cx' && e.type === 'queue-dropped'),
    JSON.stringify({ n: spawns.length, args: spawns[2] && spawns[2].args, snap: manager.get('cx') }))

  spawns[2].proc.exit(1, null, 'boom')
  const failed = manager.get('cx')
  ok('codex.2.f a process that exits BEFORE turn.completed is a real exit: the turn is aborted and the session reads exited with the code and the stderr',
    failed.status === 'exited' && failed.exitCode === 1 && events.some((e) => e.id === 'cx' && e.type === 'turn-aborted') &&
      events.some((e) => e.id === 'cx' && e.type === 'status' && e.status === 'exited' && e.stderr === 'boom'),
    JSON.stringify({ failed }))

  {
    // The verifier's window: codex flushes its result line BEFORE exiting. A
    // send in between must queue, never answer `sent` while spawning nothing.
    const w = makeManager({ codex: { command: '/fake/bin/codex' } })
    w.manager.create({ id: 'win', cwd: '/w', backend: 'codex' })
    w.manager.send('win', 'one')
    w.spawns[0].proc.emitLines(codexFixture('pong.jsonl'))
    const between = w.manager.send('win', 'two')
    const spawnedEarly = w.spawns.length
    w.spawns[0].proc.exit(0, null)
    ok('codex.2.i a send between turn.completed and the process\'s exit QUEUES (the thread is still held) and is served by the exit — never answered sent with nothing spawned',
      between === 'queued' && spawnedEarly === 1 && w.spawns.length === 2 && w.spawns[1].args[1] === 'resume' && w.spawns[1].args[3] === 'two',
      JSON.stringify({ between, spawnedEarly, n: w.spawns.length, args: w.spawns[1] && w.spawns[1].args }))
  }
  {
    // A budget crossing: codex has no interrupt, so the stop is a KILL named budget.
    let budget = 0
    const b = makeManager({ codex: { command: '/fake/bin/codex' }, limits: () => ({ maxConcurrent: 0, budgetUsd: budget }) })
    b.manager.create({ id: 'cl', cwd: '/w' })
    b.manager.create({ id: 'cx', cwd: '/w', backend: 'codex' })
    b.manager.send('cx', 'go')
    b.manager.send('cl', 'go')
    budget = 0.5
    b.spawns[1].proc.emitLines(upTo(fixture('turn.jsonl'), isResult).map((l) => l.replace(/"total_cost_usd":[0-9.]+/, '"total_cost_usd":0.75')))
    const cxKilled = b.spawns[0].proc.killed
    b.spawns[0].proc.exit(null, 'SIGTERM')
    const aborted = b.events.find((e) => e.id === 'cx' && e.type === 'turn-aborted')
    const budgetEvent = b.events.find((e) => e.type === 'budget')
    ok('codex.2.j when the canvas crosses its budget, a codex turn in flight is KILLED (there is no interrupt door), its turn aborted with reason budget, and the crossing counts it',
      cxKilled === 1 && aborted !== undefined && aborted.reason === 'budget' && budgetEvent !== undefined && budgetEvent.interrupted >= 1,
      JSON.stringify({ cxKilled, aborted, budgetEvent }))
  }
  {
    const im = makeManager({ codex: { command: '/fake/bin/codex' } })
    im.manager.create({ id: 'img', cwd: '/w', backend: 'codex' })
    const r = im.manager.send('img', 'see this', [{ mediaType: 'image/png', base64: 'aGk=' }])
    ok('codex.2.k a send with an image on a codex session is refused BY NAME, stores no turn and spawns nothing',
      r === 'refused-images' && im.spawns.length === 0 && im.manager.transcript('img').length === 0,
      JSON.stringify({ r, n: im.spawns.length, turns: im.manager.transcript('img').length }))
  }
  {
    // A restored codex chat with turns on disk resumes the thread its record names.
    const rs = makeManager({ codex: { command: '/fake/bin/codex' }, hasTurns: (id) => id === 'old' })
    rs.manager.create({ id: 'old', cwd: '/w', backend: 'codex', sessionId: 'thread-from-record' })
    rs.manager.create({ id: 'new', cwd: '/w', backend: 'codex', sessionId: 'minted' })
    rs.manager.send('old', 'again')
    rs.manager.send('new', 'first')
    ok('codex.2.l a codex session whose panel already has turns resumes the thread its record names on its FIRST send; one with none starts a thread',
      rs.spawns[0].args[1] === 'resume' && rs.spawns[0].args[2] === 'thread-from-record' && rs.spawns[1].args[1] !== 'resume',
      JSON.stringify({ old: rs.spawns[0].args, fresh: rs.spawns[1].args }))
  }

  const plain = makeManager()
  plain.manager.create({ id: 'nocx', cwd: '/w', backend: 'codex' })
  const r4 = plain.manager.send('nocx', 'hi')
  ok('codex.2.g with no codex backend configured a codex session\'s send is refused BY NAME and spawns nothing',
    r4 === 'refused-backend' && plain.spawns.length === 0 && plain.manager.get('nocx').status === 'not-started',
    JSON.stringify({ r4, n: plain.spawns.length }))

  const claude = makeManager({ codex: { command: '/fake/bin/codex' } })
  claude.manager.create({ id: 'cl', cwd: '/w' })
  claude.manager.send('cl', 'hi')
  ok('codex.2.h an absent backend is claude: the claude command, the prompt on stdin',
    claude.spawns.length === 1 && claude.spawns[0].command === '/fake/bin/claude' && claude.spawns[0].proc.stdin.length === 1 && claude.manager.get('cl').backend === 'claude',
    JSON.stringify({ spawn: claude.spawns[0] && claude.spawns[0].command, backend: claude.manager.get('cl').backend }))
}

  /* M97 — auto.1–.3. A bounded run: MAIN counts and MAIN stops. The renderer
     never holds a count the manager reads, so nothing on screen can move the
     limit; the check replays more turns than the limit and counts the sends
     that actually left the manager. */
  {
    const withMarker = (lines, text) => lines.map((l) => l.split('"text":"pong"').join(`"text":"${text}"`))
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'a1', cwd: '/repo' })
    const started = manager.startAuto('a1', { mode: 'complete', limit: 2 })
    const proc = spawns[0].proc
    const sentAfterStart = proc.stdin.length
    proc.emitLines(fixture('turn.jsonl'))
    await tick(10)
    const sentAfterOne = proc.stdin.length
    proc.emitLines(fixture('turn.jsonl'))
    await tick(10)
    const sentAfterTwo = proc.stdin.length
    proc.emitLines(fixture('turn.jsonl'))
    await tick(10)
    const autos = events.filter((e) => e.id === 'a1' && e.type === 'auto')
    const last = autos[autos.length - 1]
    ok('auto.1 startAuto sends the opening prompt, a result without the marker sends the continuation, and at the limit NOTHING more is sent whatever arrives after — the run resolves stuck with reason limit and the turn count the manager kept',
      started.kind === 'started' && sentAfterStart === 1 && sentAfterOne === 2 && sentAfterTwo === 2 && proc.stdin.length === 2 &&
        proc.stdin[0].includes(A_MARK()) && autos[0].state === 'running' && autos[0].turn === 0 && autos[0].limit === 2 &&
        // The snapshot KEEPS the resolved run (the chip shows `stuck` until
        // the next start or a dispose); only a live run has state running.
        last.state === 'stuck' && last.reason === 'limit' && last.turn === 2 && manager.get('a1').auto.state === 'stuck',
      JSON.stringify({ started, sentAfterStart, sentAfterOne, sentAfterTwo, stdin: proc.stdin.length, autos }))

    const d = makeManager()
    d.manager.create({ id: 'a2', cwd: '/repo' })
    d.manager.startAuto('a2', { mode: 'review', limit: 4 })
    d.spawns[0].proc.emitLines(withMarker(fixture('turn.jsonl'), 'all read. ' + A_MARK()))
    await tick(10)
    const dAutos = d.events.filter((e) => e.id === 'a2' && e.type === 'auto')
    ok('auto.2 a result whose text carries the done marker ends the run as done before the limit, and no continuation is sent',
      d.spawns[0].proc.stdin.length === 1 && dAutos[dAutos.length - 1].state === 'done' && dAutos[dAutos.length - 1].turn === 1,
      JSON.stringify({ stdin: d.spawns[0].proc.stdin.length, dAutos }))

    // Stuck for a reason a person can act on: a permission nobody answered
    // inside the grace, a non-zero exit, a budget refusal, a stop by hand.
    const p = makeManager({ autoPermissionGraceMs: 20 })
    p.manager.create({ id: 'a3', cwd: '/repo' })
    p.manager.startAuto('a3', { mode: 'harden', limit: 4 })
    p.spawns[0].proc.emitLines(upTo(fixture('permission.jsonl'), (l) => l.includes('"can_use_tool"')))
    await tick(60)
    const pAutos = p.events.filter((e) => e.id === 'a3' && e.type === 'auto')
    const x = makeManager()
    x.manager.create({ id: 'a4', cwd: '/repo' })
    x.manager.startAuto('a4', { mode: 'complete', limit: 4 })
    x.spawns[0].proc.exit(1, null, 'boom')
    await tick(10)
    const xAutos = x.events.filter((e) => e.id === 'a4' && e.type === 'auto')
    const b = makeManager({ limits: () => ({ maxConcurrent: 0, budgetUsd: 0.05 }) })
    b.manager.create({ id: 'a5', cwd: '/repo' })
    b.manager.startAuto('a5', { mode: 'complete', limit: 4 })
    b.spawns[0].proc.emitLines(fixture('turn.jsonl')) // total_cost_usd 0.13 > 0.05
    await tick(10)
    const bAutos = b.events.filter((e) => e.id === 'a5' && e.type === 'auto')
    const st = makeManager()
    st.manager.create({ id: 'a6', cwd: '/repo' })
    st.manager.startAuto('a6', { mode: 'complete', limit: 4 })
    const stopped = st.manager.stopAuto('a6')
    const stAutos = st.events.filter((e) => e.id === 'a6' && e.type === 'auto')
    const twice = st.manager.startAuto('a6', { mode: 'complete', limit: 4 })
    const again = st.manager.startAuto('a6', { mode: 'harden', limit: 4 })
    ok('auto.3 a permission unanswered past the grace is stuck: permission (the question stays pending for the user); a non-zero exit is stuck: exit; a send refused by the budget is stuck: budget; stopAuto resolves stopped and interrupts the turn in flight; a second start while one runs is refused by name',
      pAutos[pAutos.length - 1].state === 'stuck' && pAutos[pAutos.length - 1].reason === 'permission' && p.manager.get('a3').pending.length === 1 &&
        xAutos[xAutos.length - 1].state === 'stuck' && xAutos[xAutos.length - 1].reason === 'exit' &&
        bAutos[bAutos.length - 1].state === 'stuck' && bAutos[bAutos.length - 1].reason === 'budget' && b.spawns[0].proc.stdin.length === 1 &&
        stopped === true && stAutos[stAutos.length - 1].state === 'stopped' && st.spawns[0].proc.stdin.some((l) => l.includes('interrupt')) &&
        twice.kind === 'started' && again.kind === 'refused' && /running/.test(again.reason),
      JSON.stringify({ pAutos, xAutos, bAutos, stAutos, stopped, again }))
  }

  /* auto.4 — the verifier's window. A message the user typed mid-turn queues
     AHEAD of the continuation; the stop must still land, the limit must
     still land, and the run's own continuation must leave with the run. */
  {
    const q = makeManager()
    q.manager.create({ id: 'q1', cwd: '/repo' })
    q.manager.startAuto('q1', { mode: 'complete', limit: 4 })
    const proc = q.spawns[0].proc
    proc.emitLines(fixture('turn.jsonl'))      // turn 1: the continuation goes out
    await tick(10)
    const typed = q.manager.send('q1', 'a question from the user')  // queued behind the turn in flight
    proc.emitLines(fixture('turn.jsonl'))      // turn 2: the user's line is served; the continuation queues behind it
    await tick(10)
    const queuedBefore = q.manager.get('q1').queued
    const stopped = q.manager.stopAuto('q1')
    const writesAtStop = proc.stdin.length
    proc.emitLines(fixture('turn.jsonl'))      // the (interrupted) turn ends: NOTHING of the run's may be served
    await tick(10)
    const later = proc.stdin.slice(writesAtStop)
    const dropped = q.events.filter((e) => e.id === 'q1' && e.type === 'queue-dropped')
    ok('auto.4 a continuation queued behind the user\'s own message is dropped with the run on stopAuto — no write after the stop carries the auto prompt — and the drop is said once',
      typed === 'queued' && queuedBefore === 1 && stopped === true && later.every((l) => !l.includes(A_MARK())) && dropped.length === 1 && dropped[0].count === 1 && q.manager.get('q1').queued === 0,
      JSON.stringify({ typed, queuedBefore, stopped, later, dropped, snap: q.manager.get('q1') }))

    const l = makeManager()
    l.manager.create({ id: 'l1', cwd: '/repo' })
    l.manager.startAuto('l1', { mode: 'complete', limit: 2 })
    const lp = l.spawns[0].proc
    lp.emitLines(fixture('turn.jsonl'))       // turn 1 → continuation sent (turn 2 in flight)
    await tick(10)
    l.manager.send('l1', 'user line')          // queued behind turn 2
    lp.emitLines(fixture('turn.jsonl'))       // turn 2 = the limit: stuck first, THEN the user's line served, and no continuation
    await tick(10)
    const lAutos = l.events.filter((e) => e.id === 'l1' && e.type === 'auto')
    const autoWrites = lp.stdin.filter((w) => w.includes(A_MARK())).length
    ok('auto.4.b at the limit the decision is made BEFORE the queue is served: the user\'s queued line still goes, no third auto prompt ever does, and the chip reads stuck — limit',
      lAutos[lAutos.length - 1].state === 'stuck' && lAutos[lAutos.length - 1].reason === 'limit' && autoWrites === 2 && lp.stdin.length === 3 && lp.stdin[2].includes('user line'),
      JSON.stringify({ lAutos, stdin: lp.stdin.length, autoWrites }))

    const h = makeManager()
    h.manager.create({ id: 'h1', cwd: '/repo' })
    h.manager.startAuto('h1', { mode: 'complete', limit: 4 })
    h.manager.interrupt('h1')
    h.spawns[0].proc.emitLines(fixture('turn.jsonl'))
    await tick(10)
    const hAutos = h.events.filter((e) => e.id === 'h1' && e.type === 'auto')
    ok('auto.4.c an interrupt by hand mid-run resolves the run as stopped — never a chip that spins forever over a turn nobody continues',
      hAutos[hAutos.length - 1].state === 'stopped' && h.spawns[0].proc.stdin.filter((w) => w.includes(A_MARK())).length === 1,
      JSON.stringify({ hAutos }))
  }

  /* M98 — grant.1–.2. Main owns pending, so main owns granted: a grant is
     keyed by session AND tool, lives in the tracker, answers the request
     before the renderer ever sees it, is cleared on dispose, and is written
     NOWHERE. */
  try   {
    const AP = M.approvals
    const sink = { notify() {}, badge() {}, beep() {}, windowFocused: () => true, notifyEnabled: () => false, soundEnabled: () => false }
    const states = []
    const tracker = AP.createApprovalTracker({ sink, emitState: (id, state) => states.push([id, state]), label: () => 'x' })
    // Guarded: before M98 lands the tracker has no grant, and a throw here
    // would abort every check below (verify-suites.md rule 1).
    if (typeof tracker.grant !== 'function') { ok('grant.1 the tracker has grant/granted/grantsOf/revoke', false, 'no grant on the tracker'); throw new Error('skip-grant') }
    const { manager, spawns, events } = makeManager({ preAnswer: (id, tool) => tracker.granted(id, tool) })
    manager.subscribe((e) => tracker.apply(e))
    manager.create({ id: 'g1', cwd: '/repo' })
    tracker.grant('g1', 'Bash')
    manager.send('g1', 'cat hosts')
    const proc = spawns[0].proc
    proc.emitLines(upTo(fixture('permission.jsonl'), (l) => l.includes('"can_use_tool"')))
    await tick(10)
    const autoAllowed = events.find((e) => e.id === 'g1' && e.type === 'permission-auto-allowed')
    const asked = events.find((e) => e.id === 'g1' && e.type === 'permission-request')
    const answered = proc.stdin.find((l) => l.includes('control_response'))
    const otherTool = upTo(fixture('permission.jsonl'), (l) => l.includes('"can_use_tool"')).map((l) => l.split('"tool_name":"Bash"').join('"tool_name":"Edit"').split('"request_id":"0dd6eeca').join('"request_id":"1dd6eeca'))
    proc.emitLines(otherTool.filter((l) => l.includes('"can_use_tool"')))
    await tick(10)
    const editAsked = events.find((e) => e.id === 'g1' && e.type === 'permission-request' && e.toolName === 'Edit')
    ok('grant.1 a granted tool is answered allow by main before any request event reaches the renderer, and the transcript hears it as permission-auto-allowed naming the tool; a different tool still asks; the pending set never held the granted one; attention never lit for it',
      autoAllowed !== undefined && autoAllowed.toolName === 'Bash' && asked === undefined && answered !== undefined && /"allow"/.test(answered) &&
        editAsked !== undefined && manager.get('g1').pending.length === 1 && manager.get('g1').pending[0].toolName === 'Edit' &&
        states.filter(([id]) => id === 'g1').length === 1 && tracker.granted('g1', 'Bash') && !tracker.granted('g1', 'Edit') && !tracker.granted('g2', 'Bash'),
      JSON.stringify({ autoAllowed, asked, editAsked: editAsked && editAsked.toolName, states, stdin: proc.stdin }))

    proc.exit(0, null)
    const afterExit = tracker.granted('g1', 'Bash')
    tracker.grant('g1', 'Edit')
    const listed = tracker.grantsOf('g1')
    tracker.revoke('g1')
    const afterRevoke = tracker.grantsOf('g1')
    tracker.grant('g1', 'Bash')
    manager.dispose('g1')
    await tick(5)
    ok('grant.1.b a grant survives the process exiting (the conversation resumes), grantsOf lists the tools, revoke clears them by name, and dispose clears them — never a relaunch, which no arm here persists',
      afterExit === true && listed.join(',') === 'Bash,Edit' && afterRevoke.length === 0 && tracker.grantsOf('g1').length === 0,
      JSON.stringify({ afterExit, listed, afterRevoke, after: tracker.grantsOf('g1') }))

    const src = (f) => readFileSync(join(__dirname, '..', 'src', f), 'utf8')
    // M278. The layout schema is a DIRECTORY plus its barrel — reading only
    // the barrel would pass this check by reading a file that holds no fields.
    const schemaSrc = () => {
      const dir = join(__dirname, '..', 'src', 'shared', 'layout-schema')
      return src('shared/layout-schema.ts') + readdirSync(dir).map((n) => readFileSync(join(dir, n), 'utf8')).join('')
    }
    const approvalsSrc = src('main/approvals.ts')
    ok('grant.2 grants are never persisted: approvals.ts imports no filesystem and no store, and neither the layout schema, the layout store nor the transcript log mentions a grant',
      !/node:fs|writeFile|layout-store|JSON\.stringify/.test(approvalsSrc) && /grant/.test(approvalsSrc) &&
        !/grant/i.test(schemaSrc()) && !/grant/i.test(src('main/layout-store.ts')) && !/grant/i.test(src('main/agent-transcript-log.ts')),
      '')
  } catch (e) { if (String(e && e.message) !== 'skip-grant') throw e }

  /* M102 — external.1. A question that is OURS (the broker's spend card) on
     the session's pending set: every surface answers it through the one door,
     the process is never written to for it, a grant answers it before the
     renderer sees it, and it dies with the session as false. */
  {
    if (typeof S.AgentSessionManager.prototype.askExternal !== 'function') {
      ok('external.1 the manager has askExternal', false, 'no askExternal')
    } else {
      const granted = new Set()
      const { manager, spawns, events } = makeManager({ preAnswer: (id, tool) => granted.has(`${id}:${tool}`) })
      manager.create({ id: 'x1', cwd: '/repo' })
      manager.send('x1', 'hello')
      const proc = spawns[0].proc
      const writesBefore = proc.stdin.length
      const p1 = manager.askExternal('x1', 'github', { command: 'POST /repos/o/r/issues', account: 'octocat', cost: 'unknown' }, 'POST /repos/o/r/issues as octocat')
      await tick(5)
      const req = events.find((e) => e.id === 'x1' && e.type === 'permission-request' && e.toolName === 'github')
      const pendingNow = manager.get('x1').pending.length
      const answered = manager.answerPermission('x1', req.requestId, { allow: true })
      const r1 = await p1
      const p2 = manager.askExternal('x1', 'github', { command: 'DELETE /x' }, 'DELETE /x')
      await tick(5)
      const req2 = events.filter((e) => e.id === 'x1' && e.type === 'permission-request' && e.toolName === 'github')[1]
      manager.answerPermission('x1', req2.requestId, { allow: false, message: 'no' })
      const r2 = await p2
      granted.add('x1:github')
      const r3 = await manager.askExternal('x1', 'github', { command: 'PATCH /y' }, 'PATCH /y')
      const autoAllowed = events.some((e) => e.id === 'x1' && e.type === 'permission-auto-allowed' && e.toolName === 'github')
      granted.clear()
      const p4 = manager.askExternal('x1', 'github', { command: 'PUT /z' }, 'PUT /z')
      await tick(5)
      manager.dispose('x1')
      const r4 = await p4
      ok('external.1 askExternal puts a question on the pending set (an event the renderer renders as a card), the one answerPermission resolves it true or false and writes NOTHING to the process, a session grant answers it before any event, and a dispose resolves it false',
        req !== undefined && pendingNow === 1 && answered === true && r1 === true && proc.stdin.length === writesBefore && r2 === false && r3 === true && autoAllowed && r4 === false && manager.get('x1') === undefined,
        JSON.stringify({ req: req && req.toolName, pendingNow, answered, r1, r2, r3, autoAllowed, r4, writes: proc.stdin.length - writesBefore }))
    }
  }

/* ------------------------------------------------------------------------ */
/* M118. The third headless backend: copilot -p --output-format json         */
/* ------------------------------------------------------------------------ */

{
  /* copilot.1 — the adapter over three streams recorded from GitHub Copilot CLI 1.0.83 (2026-09-06). */
  const CP = M.copilot
  const has = CP !== undefined && typeof CP.parseCopilotLines === 'function' && typeof CP.copilotArgs === 'function'
  const cpFixture = (name) => readFileSync(join(__dirname, 'fixtures', 'agent-session', 'copilot', name), 'utf8').split('\n').filter((l) => l.trim() !== '')
  let pong = [], command = [], resumed = [], bad = [], first = [], later = []
  try {
    pong = has ? CP.parseCopilotLines(cpFixture('pong.jsonl'), { sessionId: 'pinned-1' }) : []
    command = has ? CP.parseCopilotLines(cpFixture('command.jsonl'), { sessionId: 'pinned-2' }) : []
    resumed = has ? CP.parseCopilotLines(cpFixture('resume.jsonl'), { sessionId: 'pinned-2' }) : []
    bad = has ? ['{not json', '{"type":"zz.new","data":{}}', '{"type":"session.usage_checkpoint","data":{"totalNanoAiu":1}}'].flatMap((l) => CP.parseCopilotLine(l, { sessionId: 'x' })) : []
    first = has ? CP.copilotArgs({ cwd: '/w', text: 'hello there', resume: false, sessionId: 'uuid-1', agentOptions: { model: 'gpt-5-mini' } }) : []
    later = has ? CP.copilotArgs({ cwd: '/w', text: 'again', resume: true, sessionId: 'uuid-1' }) : []
  } catch (e) { pong = [{ type: 'threw', error: String(e) }] }
  const session = pong.find((e) => e.type === 'session')
  const deltas = pong.filter((e) => e.type === 'block-delta').map((e) => e.text).join('')
  const assistants = pong.filter((e) => e.type === 'assistant')
  const results = pong.filter((e) => e.type === 'result')
  ok('copilot.1 the stream states no session id, so the parser is HANDED the pinned one and puts it on the session event with the model from auto_mode_resolved; message deltas reach the screen as block deltas; the complete assistant.message is ONE assistant text block; result — not assistant.turn_end — is the ONE result, ok, with no usage and no cost (credits are not tokens); usage_checkpoint and the session.* chatter are ignored, never unknown',
    session !== undefined && session.sessionId === 'pinned-1' && session.model === 'claude-haiku-4.5' &&
      pong.filter((e) => e.type === 'message-start').length === 1 && deltas === 'pong' &&
      assistants.length === 1 && assistants[0].blocks.length === 1 && assistants[0].blocks[0].type === 'text' && assistants[0].blocks[0].text === 'pong' &&
      results.length === 1 && results[0].ok === true && results[0].usage === undefined && results[0].costUsd === undefined &&
      pong.every((e) => e.type !== 'malformed' && e.type !== 'unknown'),
    JSON.stringify({ session, deltas, assistants, results, kinds: pong.map((e) => e.type) }))

  const uses = command.flatMap((e) => (e.type === 'assistant' ? e.blocks.filter((b) => b.type === 'tool_use') : []))
  const toolResults = command.flatMap((e) => (e.type === 'user' ? e.blocks.filter((b) => b.type === 'tool_result') : []))
  ok('copilot.1.b a toolRequests entry on assistant.message is a tool_use block (the tool name, the arguments as input) and tool.execution_complete is the tool_result under the SAME call id with the content; two model calls are two message-ends and still ONE result',
    uses.length === 1 && uses[0].name === 'view' && typeof uses[0].input.path === 'string' && uses[0].id.startsWith('call_') &&
      toolResults.length === 1 && toolResults[0].toolUseId === uses[0].id && /hello from probe/.test(toolResults[0].content) && toolResults[0].isError === false &&
      command.filter((e) => e.type === 'message-end').length === 2 && command.filter((e) => e.type === 'result').length === 1 &&
      command.filter((e) => e.type === 'assistant').some((e) => e.blocks.some((b) => b.type === 'text' && b.text === 'hello')),
    JSON.stringify({ uses, toolResults, kinds: command.map((e) => e.type) }))

  ok('copilot.1.c a resumed stream carries the pinned id again and ends in one ok result whose answer is the recalled word',
    resumed.find((e) => e.type === 'session')?.sessionId === 'pinned-2' && resumed.filter((e) => e.type === 'result').length === 1 &&
      resumed.some((e) => e.type === 'assistant' && e.blocks.some((b) => b.type === 'text' && b.text === 'hello')),
    JSON.stringify({ kinds: resumed.map((e) => e.type) }))

  ok('copilot.1.d a broken line is malformed, a type this version has not seen is unknown BY KIND, and a usage checkpoint is ignored by kind — never a throw',
    bad.length === 3 && bad[0].type === 'malformed' && bad[1].type === 'unknown' && bad[1].kind === 'zz.new' && bad[2].type === 'ignored' && bad[2].kind === 'session.usage_checkpoint',
    JSON.stringify(bad))

  ok('copilot.1.e the first turn is `-p <text> --output-format json --allow-all-tools --no-auto-update --session-id <the host\'s id> -C <cwd> [--model m]`; a later turn names `--resume=<id>` instead of pinning; the prompt is never on stdin',
    first[0] === '-p' && first[1] === 'hello there' && first[first.indexOf('--output-format') + 1] === 'json' && first.includes('--allow-all-tools') && first.includes('--no-auto-update') &&
      first[first.indexOf('--session-id') + 1] === 'uuid-1' && first[first.indexOf('-C') + 1] === '/w' && first[first.indexOf('--model') + 1] === 'gpt-5-mini' && !first.some((a) => a.startsWith('--resume')) &&
      later[0] === '-p' && later[1] === 'again' && later.includes('--resume=uuid-1') && !later.includes('--session-id') && later.includes('--no-auto-update'),
    JSON.stringify({ first, later }))
}

{
  /* copilot.2 — the manager over a fake runner with backend copilot: codex's process model with the HOST's id. */
  const cpFixture = (name) => readFileSync(join(__dirname, 'fixtures', 'agent-session', 'copilot', name), 'utf8').split('\n').filter((l) => l.trim() !== '')
  const { manager, spawns, events } = makeManager({ binaries: { copilot: { command: '/fake/bin/copilot' } } })
  let r1, s1, afterResult, afterExit, r2, s2, interrupted, imgRefused, r3, threw = null
  try {
    manager.create({ id: 'cp', cwd: '/w', backend: 'copilot', sessionId: 'pin-1' })
    r1 = manager.send('cp', 'ping')
    s1 = spawns[0]
    if (s1) { s1.proc.emitLines(cpFixture('pong.jsonl')); afterResult = manager.get('cp'); s1.proc.exit(0, null); afterExit = manager.get('cp') }
    r2 = manager.send('cp', 'again')
    s2 = spawns[1]
    interrupted = manager.interrupt('cp')
    imgRefused = manager.send('cp', 'look', [{ mediaType: 'image/png', base64: 'AAAA', name: 'a.png' }])
    if (s2) { s2.proc.emitLines(cpFixture('resume.jsonl')) }
    r3 = manager.send('cp', 'between')
    if (s2) s2.proc.exit(0, null)
  } catch (e) { threw = String(e) }
  ok('copilot.2 a copilot session spawns per send with `-p <text>` and the SPEC\'s id pinned on `--session-id`, stdin closed and nothing written; the exit 0 after `result` is the turn\'s END (ready, one turn, never exited)',
    threw === null && r1 === 'sent' && s1 && s1.command === '/fake/bin/copilot' && s1.args[0] === '-p' && s1.args[1] === 'ping' && s1.args[s1.args.indexOf('--session-id') + 1] === 'pin-1' && s1.closeStdin === true && s1.proc.stdin.length === 0 &&
      afterResult && afterResult.turns === 1 && afterResult.sessionId === 'pin-1' && afterResult.model === 'claude-haiku-4.5' && afterResult.costUsd === undefined &&
      afterExit && afterExit.status === 'ready' && afterExit.exitCode === undefined && !events.some((e) => e.id === 'cp' && e.type === 'turn-aborted'),
    JSON.stringify({ threw, r1, args: s1 && s1.args, closeStdin: s1 && s1.closeStdin, afterResult, afterExit }))
  ok('copilot.2.b the second send spawns a NEW process naming `--resume=<the same id>` and no `--session-id`; interrupt answers false (no door); an image send is refused BY NAME with the row\'s sentence; a send between result and exit QUEUES and the exit serves it',
    r2 === 'sent' && s2 && s2.args.includes('--resume=pin-1') && !s2.args.includes('--session-id') && interrupted === false && imgRefused === 'refused-images' &&
      r3 === 'queued' && spawns.length === 3 && spawns[2].args[1] === 'between' && manager.get('cp').queued === 0,
    JSON.stringify({ r2, args: s2 && s2.args, interrupted, imgRefused, r3, n: spawns.length }))
}

{
  /* M120 — sandbox.1. A chat with NO place spawns on the row's read-only mode: the adapter appends `sandboxArgs`, and a row without them refuses the send by name. */
  let claudeArgs = [], codexArgs = [], copilotArgs = [], acpSend = null, threw = null
  try {
    const AD = M.adapters.BACKEND_ADAPTERS
    claudeArgs = AD.claude.args({ cwd: '/s/c1', text: 'hi', resume: false, sessionId: 'u1', sandbox: true })
    codexArgs = AD.codex.args({ cwd: '/s/c2', text: 'hi', resume: false, sessionId: '', sandbox: true })
    copilotArgs = AD.copilot.args({ cwd: '/s/c3', text: 'hi', resume: false, sessionId: 'u3', sandbox: true })
    const { manager, spawns } = makeManager({ binaries: { acp: { command: '/fake/bin/copilot' } } })
    manager.create({ id: 'sb', cwd: '/s/sb', backend: 'acp', sandbox: true })
    acpSend = { answer: manager.send('sb', 'hi'), spawned: spawns.length }
  } catch (e) { threw = String(e) }
  ok('sandbox.1 with `sandbox` on the input claude gets `--permission-mode plan`, codex `--sandbox read-only`, copilot `--deny-tool shell --deny-tool write`; a row with no sandboxArgs (acp) refuses the send by name and spawns nothing',
    threw === null && claudeArgs.includes('--permission-mode') && claudeArgs[claudeArgs.indexOf('--permission-mode') + 1] === 'plan' &&
      codexArgs[codexArgs.indexOf('--sandbox') + 1] === 'read-only' && copilotArgs.filter((a) => a === '--deny-tool').length === 2 && copilotArgs.includes('shell') && copilotArgs.includes('write') &&
      acpSend && acpSend.answer === 'refused-sandbox' && acpSend.spawned === 0,
    JSON.stringify({ threw, claudeArgs, codexArgs, copilotArgs, acpSend }))
}

{
  /* M120 — copilot.sandbox.1. The deny KINDS, not tool names: `copilot help permissions` (recorded) says --deny-tool takes a pattern `kind(argument)` with kinds `shell(command)` and `write(path)`, and that denial outranks --allow-all-tools. The row's sandboxArgs name those kinds. */
  let help = '', row = []
  try { help = readFileSync(join(__dirname, 'fixtures', 'agent-session', 'copilot', 'permissions.txt'), 'utf8'); row = M.backends.BACKENDS.copilot.sandboxArgs ?? [] } catch (e) { help = String(e) }
  const kinds = row.filter((_, i) => i % 2 === 1)
  ok('copilot.sandbox.1 the copilot row denies by the KINDS the recorded `copilot help permissions` names (shell, write), and the help says denial outranks --allow-all-tools',
    /shell\(command/.test(help) && /write\(path/.test(help) && /Denial rules always take[\s\S]*precedence/.test(help) && kinds.length === 2 && kinds.every((k) => new RegExp('\\n\\s+' + k + '\\(').test(help)),
    JSON.stringify({ kinds, hasShell: /shell\(command/.test(help), hasWrite: /write\(path/.test(help) }))
}

  /* M99 — registry.1–.2. A backend is a ROW; no consumer switches on the
     name. The grep is the check that makes a fourth backend cheap. */
  {
    const { readdirSync, statSync } = require('node:fs')
    const root = join(__dirname, '..', 'src')
    const files = []
    const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p) } }
    walk(root)
    const pattern = /backend\s*[!=]==\s*'(?:claude|codex|copilot|acp)'|case '(?:claude|codex|copilot|acp)':/
    const hits = files.filter((f) => pattern.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1)).sort()
    // M278. The panel parser is where the discriminant lives after the split;
    // the barrel re-exports and decides nothing, so it must not appear here.
    const expected = ['shared/layout-schema/panels.ts']
    ok('registry.1 no file compares a `backend` field to a literal member of the union, and no `case` names one, except the layout parser (absent-vs-malformed needs the literal) — the sheet\'s own `what.kind` vocabulary is outside this grep and is named in the act log',
      JSON.stringify(hits) === JSON.stringify(expected), JSON.stringify(hits))
    const B = M.backends
    const ids = B.BACKEND_IDS
    const rows = ids.map((id) => B.BACKENDS[id])
    ok('registry.2 BACKENDS has a row per member of the union with a label, a binary, every capability the manager reads and every named reason; AGENT_CAPABILITIES.headless is DERIVED from it; codex is one process per turn with stdin closed and adopts its thread id, claude is neither',
      ids.join(',') === 'claude,codex,copilot,acp' && rows.every((r) => typeof r.label === 'string' && typeof r.binary === 'string' &&
        ['resumes', 'interrupts', 'images', 'reportsCost', 'asksPermission', 'terminalDoor', 'oneProcessPerTurn', 'closeStdin', 'adoptsThreadId', 'appendsPrompt', 'handshake'].every((k) => typeof r[k] === 'boolean') &&
        (r.sandboxArgs === undefined || (Array.isArray(r.sandboxArgs) && r.sandboxArgs.length > 0)) && (r.models === undefined || Array.isArray(r.models)) &&
        ['noCli', 'noInterrupt', 'noImages', 'noTerminal', 'noPermissions', 'noPrompt', 'noSandbox'].every((k) => typeof r.reasons[k] === 'string')) &&
        B.BACKENDS.codex.oneProcessPerTurn && B.BACKENDS.codex.closeStdin && B.BACKENDS.codex.adoptsThreadId && !B.BACKENDS.codex.interrupts && !B.BACKENDS.codex.asksPermission &&
        // M118/M119. The two measured rows: copilot is codex's shape with the HOST's id; acp is resident with a handshake and a permission door.
        B.BACKENDS.copilot.oneProcessPerTurn && B.BACKENDS.copilot.closeStdin && !B.BACKENDS.copilot.adoptsThreadId && !B.BACKENDS.copilot.asksPermission && !B.BACKENDS.copilot.appendsPrompt && !B.BACKENDS.copilot.reportsCost && Array.isArray(B.BACKENDS.copilot.models) &&
        B.BACKENDS.acp.handshake && B.BACKENDS.acp.asksPermission && B.BACKENDS.acp.interrupts && B.BACKENDS.acp.adoptsThreadId && !B.BACKENDS.acp.oneProcessPerTurn && !B.BACKENDS.acp.closeStdin && B.BACKENDS.acp.sandboxArgs === undefined &&
        B.BACKENDS.claude.appendsPrompt && !B.BACKENDS.acp.appendsPrompt && !B.BACKENDS.claude.handshake &&
        !B.BACKENDS.claude.oneProcessPerTurn && B.BACKENDS.claude.interrupts && B.BACKENDS.claude.asksPermission &&
        M.cost.AGENT_CAPABILITIES.codex.headless.interrupts === B.BACKENDS.codex.interrupts && M.cost.AGENT_CAPABILITIES['claude-code'].headless.permissions === B.BACKENDS.claude.asksPermission,
      JSON.stringify(rows.map((r) => r.id)))
    // registry.3 — the copy sites' one rule, and M90's names. `carryBackend`
    // writes NOTHING for an absent backend and nothing for the default, so a
    // claude record never grows a key through a by-name rebuild (panels.ts,
    // layout-adapt.ts, useRailModels.ts, Canvas's create all spread it). And
    // the four M90 constants are ALIASES of the registry's rows — pinned as
    // text, the way grant.2 pins the absence of a store — so a check that
    // regexes REASON_CODEX_NO_TERMINAL and a panel reading
    // `reasons.noTerminal` are reading one sentence.
    const carried = [B.carryBackend({}), B.carryBackend({ backend: 'claude' }), B.carryBackend({ backend: 'codex' })]
    const aliasSrc = readFileSync(join(root, 'shared', 'agent-session.ts'), 'utf8')
    ok('registry.3 carryBackend writes no key for an absent or default backend and the member for any other; the M90 reason constants are aliases of the registry rows',
      Object.keys(carried[0]).length === 0 && Object.keys(carried[1]).length === 0 && carried[2].backend === 'codex' &&
        /REASON_NO_CODEX = BACKENDS\.codex\.reasons\.noCli/.test(aliasSrc) && /REASON_CODEX_NO_INTERRUPT = BACKENDS\.codex\.reasons\.noInterrupt/.test(aliasSrc) &&
        /REASON_CODEX_NO_IMAGES = BACKENDS\.codex\.reasons\.noImages/.test(aliasSrc) && /REASON_CODEX_NO_TERMINAL = BACKENDS\.codex\.reasons\.noTerminal/.test(aliasSrc),
      JSON.stringify({ carried }))
  }

  // M114 — dispatch.1. THE DISPATCH PROMPT AND ITS MARK. The prompt rides
  // every spawn from `ChatSource.dispatch` (the M81 supervisor rule: the CLI
  // keeps no record of an appended system prompt, so a resumed lane without
  // it would stop being a lane); the carry writes no key when absent.
  {
    let prompt, marks
    try {
      prompt = M.sharedSession.DISPATCH_PROMPT
      marks = M.chatPanel
    } catch (e) { marks = String(e) }
    // M121. A routine chat carries its mark the same way (its rule prompt
    // must survive a relaunch, the M81 shape): the carry writes `routine: true`
    // for a set one and nothing for an absent one; both marks ride together.
    ok('dispatch.1 DISPATCH_PROMPT says the branch is the lane\'s and never to push, merge or open a PR; carryChatMarks writes no key for an absent dispatch and `dispatch: true` for a set one, and (M121) `routine: true` for a routine chat — both marks at once when both are set',
      typeof prompt === 'string' && /branch/.test(prompt) && /[Nn]ever push/.test(prompt) && /pull request/.test(prompt) &&
        M.chatPanel && Object.keys(M.chatPanel.carryChatMarks({})).length === 0 && M.chatPanel.carryChatMarks({ dispatch: true }).dispatch === true && Object.keys(M.chatPanel.carryChatMarks({ dispatch: true })).length === 1 &&
        M.chatPanel.carryChatMarks({ routine: true }).routine === true && Object.keys(M.chatPanel.carryChatMarks({ routine: true })).length === 1 && Object.keys(M.chatPanel.carryChatMarks({ dispatch: true, routine: true })).length === 2,
      JSON.stringify({ prompt, marks: typeof marks }))
  }

  /* M119 — acp.1. THE ACP CODEC over four streams recorded from `copilot --acp`
     1.0.83 (2026-09-06, scripts/fixtures/agent-session/acp). Each fixture line
     is prefixed `-> ` (what the probe wrote) or `<- ` (what the agent said);
     the check re-makes the probe's requests through OUR encoders, registering
     each in the codec's state the way the adapter will, then feeds every
     `<- ` line through parseAcpLine and reads the events. A response is
     matched to what was ASKED — a prompt's answer and a load's answer are the
     same JSON shape apart from the id, so a codec that guessed by shape would
     read a resumed session's history as a turn. Guarded: before the codec
     lands `M.acp` is undefined, and a throw here would abort every check
     below (verify-suites.md rule 1). */
  {
    const ACP = M.acp
    const acpFixture = (name) => readFileSync(join(FIX, 'acp', name), 'utf8').split('\n').filter((l) => l.trim() !== '' && !l.startsWith('## '))
    const sent = (lines) => lines.filter((l) => l.startsWith('-> ')).map((l) => JSON.parse(l.slice(3)))
    const heard = (lines) => lines.filter((l) => l.startsWith('<- ')).map((l) => l.slice(3))
    const replay = (name, edit = (l) => l) => {
      const lines = acpFixture(name)
      let state = ACP.freshAcpState()
      const ours = []
      for (const r of sent(lines).filter((x) => x.method !== undefined)) {
        let line
        if (r.method === 'initialize') line = ACP.acpInitialize(r.id)
        else if (r.method === 'session/new') line = ACP.acpSessionNew(r.id, r.params.cwd)
        else if (r.method === 'session/load') line = ACP.acpSessionLoad(r.id, r.params.sessionId, r.params.cwd)
        else if (r.method === 'session/prompt') line = ACP.acpPrompt(r.id, r.params.sessionId, r.params.prompt[0].text, [])
        if (line !== undefined) { ours.push({ recorded: r, ours: JSON.parse(line) }); state = ACP.noteRequest(state, r.id, r.method, r.params && r.params.sessionId) }
      }
      const events = []
      for (const l of heard(lines)) { const out = ACP.parseAcpLine(edit(l), state); state = out.state; events.push(...out.events) }
      return { events, ours, state, kinds: events.map((e) => e.type) }
    }
    const sameRequests = (ours) => ours.every(({ recorded, ours: o }) => o.jsonrpc === '2.0' && o.id === recorded.id && o.method === recorded.method &&
      (recorded.method !== 'session/new' || o.params.cwd === recorded.params.cwd) &&
      (recorded.method !== 'session/load' || (o.params.cwd === recorded.params.cwd && o.params.sessionId === recorded.params.sessionId)) &&
      (recorded.method !== 'session/prompt' || (o.params.sessionId === recorded.params.sessionId && JSON.stringify(o.params.prompt) === JSON.stringify(recorded.params.prompt))))
    if (!ACP || typeof ACP.parseAcpLine !== 'function') {
      ok('acp.1 the ACP codec exists (shared/acp-transcript.ts, bundled as M.acp)', false, 'no acp codec in the bundle')
    } else {
      const pong = replay('pong.log')
      const init = pong.events.find((e) => e.type === 'session' && e.negotiated !== undefined)
      const opened = pong.events.find((e) => e.type === 'session' && e.sessionId !== '')
      const start = pong.events.find((e) => e.type === 'block-start')
      const delta = pong.events.find((e) => e.type === 'block-delta')
      const assistant = pong.events.find((e) => e.type === 'assistant')
      const result = pong.events.find((e) => e.type === 'result')
      const k = pong.kinds
      ok('acp.1 pong.log: our three requests match the probe\'s (id, method, cwd, prompt); initialize\'s answer is a session event with sessionId \'\' carrying negotiated { loadSession: true, image: true }; session/new\'s answer is the session with the minted id; the chunk is message-start, block-start text, block-delta; the prompt\'s answer is one assistant turn THEN a result with usage input 13654 / output 5 / cacheRead 1280 and no cost; the four housekeeping updates are ignored, nothing malformed or unknown',
        sameRequests(pong.ours) && init !== undefined && init.sessionId === '' && init.negotiated.loadSession === true && init.negotiated.image === true &&
          opened !== undefined && opened.sessionId === '20d8f012-67af-4c3a-a046-350822466b44' && k.indexOf('session') < k.indexOf('message-start') &&
          k.indexOf('message-start') < k.indexOf('block-start') && k.indexOf('block-start') < k.indexOf('block-delta') &&
          start !== undefined && start.block.type === 'text' && delta !== undefined && delta.delta === 'text' && delta.text === 'pong' &&
          assistant !== undefined && assistant.blocks.length === 1 && assistant.blocks[0].type === 'text' && assistant.blocks[0].text === 'pong' && assistant.replay !== true &&
          k.indexOf('assistant') < k.indexOf('result') &&
          result !== undefined && result.ok === true && result.stopReason === 'end_turn' && result.usage.input === 13654 && result.usage.output === 5 && result.usage.cacheRead === 1280 && result.costUsd === undefined &&
          k.filter((x) => x === 'ignored').length === 4 && k.every((x) => x !== 'malformed' && x !== 'unknown'),
        JSON.stringify({ same: sameRequests(pong.ours), init, opened, kinds: k, start, delta, assistant, result }))

      const read = replay('read.log')
      const use = read.events.find((e) => e.type === 'assistant' && e.blocks.some((b) => b.type === 'tool_use'))
      const useBlock = use && use.blocks.find((b) => b.type === 'tool_use')
      const res = read.events.find((e) => e.type === 'user' && e.blocks.some((b) => b.type === 'tool_result'))
      const resBlock = res && res.blocks.find((b) => b.type === 'tool_result')
      const text = read.events.filter((e) => e.type === 'assistant' && e.blocks.every((b) => b.type === 'text'))
      const rk = read.kinds
      ok('acp.1.b read.log: a tool_call is an assistant turn with a tool_use block { id: the toolCallId, name: the kind (read), input: rawInput with its path }; tool_call_update completed is a user turn with a tool_result under the SAME id whose content is rawOutput.content (`hello from probe`), not an error; the reply text follows as its own assistant turn before the result',
        use !== undefined && useBlock.id === 'call_0TcbrrSahpgOL3pojouLyAp6' && useBlock.name === 'read' && typeof useBlock.input.path === 'string' && useBlock.input.path.endsWith('/note.txt') && use.replay !== true &&
          res !== undefined && res.replay === false && resBlock.toolUseId === useBlock.id && /hello from probe/.test(resBlock.content) && resBlock.isError === false &&
          rk.indexOf('assistant') < rk.indexOf('user') && text.length === 1 && text[0].blocks[0].text === 'hello' && rk.lastIndexOf('assistant') < rk.indexOf('result') &&
          rk.every((x) => x !== 'malformed' && x !== 'unknown'),
        JSON.stringify({ use, res, text, kinds: rk }))

      const term = replay('terminal.log')
      const ask = term.events.find((e) => e.type === 'permission-request')
      const recordedAnswer = acpFixture('terminal.log').find((l) => l.startsWith('-> ') && l.includes('"id":0'))
      const answer = ACP.acpPermissionAnswer('0', 'allow_once')
      const termRes = term.events.find((e) => e.type === 'user' && e.blocks.some((b) => b.type === 'tool_result'))
      const termText = term.events.find((e) => e.type === 'assistant' && e.blocks.every((b) => b.type === 'text'))
      const deltas = term.events.filter((e) => e.type === 'block-delta').map((e) => e.text)
      ok('acp.1.c terminal.log: session/request_permission (JSON-RPC id 0) is a permission-request { requestId: \'0\', toolName: \'execute\', input.command === \'echo probe-ok\', input.__options: [allow_once, allow_always, reject_once], description: the title, toolUseId: the toolCallId }; acpPermissionAnswer(\'0\', \'allow_once\') is byte for byte the line the probe wrote; the two partial tool_call_updates (no status) are ignored and the completed one is the tool_result; two chunks are two deltas and one assistant turn reading probe-ok',
        ask !== undefined && ask.requestId === '0' && ask.toolName === 'execute' && ask.input.command === 'echo probe-ok' && JSON.stringify(ask.input.__options) === JSON.stringify(['allow_once', 'allow_always', 'reject_once']) &&
          typeof ask.description === 'string' && /shell probe/.test(ask.description) && ask.toolUseId === 'call_NaWlKVD9FdBcOk0lNeHJ5t56' &&
          recordedAnswer !== undefined && answer === recordedAnswer.slice(3) &&
          termRes !== undefined && /probe-ok/.test(termRes.blocks[0].content) && term.events.filter((e) => e.type === 'user').length === 1 &&
          deltas.join('|') === 'probe|-ok' && termText !== undefined && termText.blocks[0].text === 'probe-ok' &&
          term.kinds.every((x) => x !== 'malformed' && x !== 'unknown'),
        JSON.stringify({ ask, answer, recordedAnswer, termRes, deltas, termText, kinds: term.kinds }))

      const load = replay('load.log')
      const lk = load.kinds
      const loadDone = load.events.findIndex((e) => e.type === 'session' && e.sessionId !== '')
      const before = load.events.slice(0, loadDone)
      const after = load.events.slice(loadDone + 1)
      const replayed = before.filter((e) => e.type === 'user' || e.type === 'assistant')
      const loadedId = load.events[loadDone] && load.events[loadDone].sessionId
      const fresh = after.find((e) => e.type === 'assistant')
      const loadResult = after.find((e) => e.type === 'result')
      ok('acp.1.d load.log: everything session/load replays before its own answer — the user message, the tool call, its result, the agent\'s text — arrives as user/assistant events marked replay: true and never as deltas; the load\'s answer is the session event naming the LOADED id; the prompt after it streams as a fresh turn (replay absent) with its own result (usage input 13795)',
        loadDone > 0 && loadedId === 'b5a48d7e-2ebc-460b-adb9-379df4779281' && replayed.length === 4 && replayed.every((e) => e.replay === true) &&
          replayed[0].type === 'user' && replayed[0].blocks[0].type === 'text' && /note\.txt/.test(replayed[0].blocks[0].text) &&
          replayed[1].type === 'assistant' && replayed[1].blocks[0].type === 'tool_use' && replayed[2].type === 'user' && replayed[2].blocks[0].type === 'tool_result' &&
          replayed[3].type === 'assistant' && replayed[3].blocks[0].type === 'text' && replayed[3].blocks[0].text === 'hello' &&
          !before.some((e) => e.type === 'block-delta' || e.type === 'message-start' || e.type === 'result') &&
          fresh !== undefined && fresh.replay !== true && fresh.blocks[0].text === 'hello' && after.some((e) => e.type === 'message-start') &&
          loadResult !== undefined && loadResult.ok === true && loadResult.usage.input === 13795 && loadResult.usage.output === 5 &&
          lk.every((x) => x !== 'malformed' && x !== 'unknown'),
        JSON.stringify({ loadDone, loadedId, replayed, fresh, loadResult, kinds: lk }))

      let s = ACP.noteRequest(ACP.freshAcpState(), 3, 'session/prompt')
      const bad = ACP.parseAcpLine('{not json', s)
      const err = ACP.parseAcpLine('{"jsonrpc":"2.0","id":3,"error":{"code":-32000,"message":"boom"}}', s)
      const plan = ACP.parseAcpLine('{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"x","update":{"sessionUpdate":"plan","entries":[]}}}', s)
      const novel = ACP.parseAcpLine('{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"x","update":{"sessionUpdate":"telepathy_update"}}}', s)
      const stray = ACP.parseAcpLine('{"jsonrpc":"2.0","id":99,"result":{}}', s)
      const askedOfUs = ACP.parseAcpLine('{"jsonrpc":"2.0","id":7,"method":"fs/read_text_file","params":{"path":"/x"}}', s)
      ok('acp.1.e a non-JSON line is malformed; an error response to the pending prompt is result { ok: false, error: the message } and clears the pending id; a `plan` update is ignored by kind (declined: no recording); an update kind this version has not seen is unknown BY KIND; a response to an id nobody asked is unknown; a request the client declined the capability for (fs/read_text_file) is unknown by method, never answered',
        bad.events[0].type === 'malformed' && err.events[0].type === 'result' && err.events[0].ok === false && err.events[0].error === 'boom' && err.state.pending[3] === undefined &&
          plan.events[0].type === 'ignored' && /plan/.test(plan.events[0].kind) && novel.events[0].type === 'unknown' && /telepathy_update/.test(novel.events[0].kind) &&
          stray.events[0].type === 'unknown' && askedOfUs.events[0].type === 'unknown' && /fs\/read_text_file/.test(askedOfUs.events[0].kind),
        JSON.stringify({ bad: bad.events, err: err.events, plan: plan.events, novel: novel.events, stray: stray.events, askedOfUs: askedOfUs.events }))
    }
  }

  /* M119 — acp.3–.4. THE MANAGER AS AN ACP CLIENT, over the fake runner. The
     check plays the agent: it answers each handshake step by writing the
     fixture's own `<- ` lines back (our request ids are the probe's — 1, 2,
     3 — so the recordings replay verbatim). What fails silently without
     these: a prompt written before session/new answers is a prompt with no
     session (the agent errors, or worse, ignores it — the panel reads
     `working` forever); an interrupt written as claude's control_request is
     a line ACP does not know; a permission answered with claude's
     control_response never reaches the tool, and the agent waits on an id
     nobody will answer. Guarded like acp.1. */
  {
    const ACP = M.acp
    const acpLines = (name) => readFileSync(join(FIX, 'acp', name), 'utf8').split('\n').filter((l) => l.startsWith('<- ')).map((l) => l.slice(3))
    const answerTo = (name, id) => acpLines(name).find((l) => { try { const j = JSON.parse(l); return j.id === id && j.method === undefined } catch { return false } })
    const updates = (name) => acpLines(name).filter((l) => l.includes('"method":"session/update"'))
    const parsed = (proc) => proc.stdin.map((l) => { try { return JSON.parse(l) } catch { return { raw: l } } })
    const CAPS = { fs: { readTextFile: false, writeTextFile: false }, terminal: false }
    if (!ACP || typeof ACP.parseAcpLine !== 'function') {
      ok('acp.3 the ACP codec exists for the manager to ride', false, 'no acp codec in the bundle')
    } else try {
      let granted = new Set()
      const { manager, spawns, events } = makeManager({ binaries: { acp: { command: '/fake/bin/copilot' } }, preAnswer: (id, tool) => granted.has(`${id}/${tool}`) })
      manager.create({ id: 'ac', cwd: '/w', backend: 'acp' })
      const r1 = manager.send('ac', 'Reply with exactly the word pong.')
      const s1 = spawns[0]
      const afterSend = { n: s1 ? s1.proc.stdin.length : -1, lines: s1 ? parsed(s1.proc) : [], snap: manager.get('ac') }
      if (s1) s1.proc.emitLines([answerTo('pong.log', 1)])
      await tick(10)
      const afterInit = { n: s1 ? s1.proc.stdin.length : -1, lines: s1 ? parsed(s1.proc) : [], snap: manager.get('ac') }
      if (s1) s1.proc.emitLines([answerTo('pong.log', 2)])
      await tick(10)
      const afterNew = { n: s1 ? s1.proc.stdin.length : -1, lines: s1 ? parsed(s1.proc) : [], snap: manager.get('ac') }
      ok('acp.3 an acp send spawns the copilot binary with --acp and writes ONLY initialize (clientCapabilities: both declined); session/new (the session\'s cwd) is written only once initialize answers, and the prompt is HELD — status starting, nothing else on stdin — until session/new answers; then session/prompt names the ADOPTED id with the text, the snapshot carries that id, and the session reads streaming',
        r1 === 'sent' && spawns.length === 1 && s1.command === '/fake/bin/copilot' && JSON.stringify(s1.args) === JSON.stringify(['--acp']) && s1.closeStdin === undefined &&
          afterSend.n === 1 && afterSend.lines[0].method === 'initialize' && afterSend.lines[0].id === 1 && JSON.stringify(afterSend.lines[0].params.clientCapabilities) === JSON.stringify(CAPS) && afterSend.snap.status === 'starting' &&
          afterInit.n === 2 && afterInit.lines[1].method === 'session/new' && afterInit.lines[1].id === 2 && afterInit.lines[1].params.cwd === '/w' && afterInit.snap.status === 'starting' &&
          afterNew.n === 3 && afterNew.lines[2].method === 'session/prompt' && afterNew.lines[2].params.sessionId === '20d8f012-67af-4c3a-a046-350822466b44' && afterNew.lines[2].params.prompt[0].text === 'Reply with exactly the word pong.' &&
          afterNew.snap.sessionId === '20d8f012-67af-4c3a-a046-350822466b44' && afterNew.snap.status === 'streaming' && afterNew.snap.backend === 'acp',
        JSON.stringify({ r1, args: s1 && s1.args, afterSend, afterInit, afterNew }))

      // The turn: the recorded updates and the prompt's answer.
      if (s1) s1.proc.emitLines([...updates('pong.log'), answerTo('pong.log', 3)])
      await tick(10)
      const done = manager.get('ac')
      const turns = manager.transcript('ac')
      const result = events.find((e) => e.id === 'ac' && e.type === 'result')
      ok('acp.3.b the turn ends on session/prompt\'s answer: one result with the usage, the session ready (the process stays — not one per turn), the transcript holding the user turn and the assistant\'s pong, the delta batch delivered before the result',
        done.status === 'ready' && done.turns === 1 && done.usage.input === 13654 && done.costUsd === undefined && done.pid !== undefined &&
          turns.length === 2 && turns[0].role === 'user' && turns[1].role === 'assistant' && turns[1].blocks[0].text === 'pong' &&
          result !== undefined && result.interrupted === false && events.some((e) => e.id === 'ac' && e.type === 'block-delta' && e.text === 'pong') &&
          events.findIndex((e) => e.id === 'ac' && e.type === 'block-delta') < events.findIndex((e) => e.id === 'ac' && e.type === 'result'),
        JSON.stringify({ done, turns, result }))

      // Interrupt: session/cancel, a notification naming the session.
      const r2 = manager.send('ac', 'again')
      const promptLine = s1 && parsed(s1.proc)[3]
      const interrupted = manager.interrupt('ac')
      const cancelLine = s1 && parsed(s1.proc)[4]
      if (s1) s1.proc.emitLines([JSON.stringify({ jsonrpc: '2.0', id: promptLine && promptLine.id, result: { stopReason: 'cancelled' } })])
      await tick(10)
      const cancelled = events.filter((e) => e.id === 'ac' && e.type === 'result')[1]
      ok('acp.3.c a second send is session/prompt with the next id (no handshake again); interrupt writes session/cancel — a notification with no id, naming the session — and answers true; the prompt\'s answer with stopReason cancelled is a result marked interrupted and the session is ready again',
        r2 === 'sent' && promptLine !== undefined && promptLine.method === 'session/prompt' && promptLine.id === 4 && s1.proc.stdin.length === 5 &&
          interrupted === true && cancelLine.method === 'session/cancel' && cancelLine.id === undefined && cancelLine.params.sessionId === '20d8f012-67af-4c3a-a046-350822466b44' &&
          cancelled !== undefined && cancelled.interrupted === true && cancelled.stopReason === 'cancelled' && manager.get('ac').status === 'ready' && s1.proc.killed === 0,
        JSON.stringify({ r2, promptLine, interrupted, cancelLine, cancelled, status: manager.get('ac').status }))

      // Permissions through the one door. The recorded request (JSON-RPC id 0).
      manager.send('ac', 'Run the shell command')
      const askLine = acpLines('terminal.log').find((l) => l.includes('session/request_permission'))
      if (s1) s1.proc.emitLines([askLine])
      await tick(10)
      const pendingBefore = manager.get('ac').pending
      const allowed = manager.answerPermission('ac', '0', { allow: true })
      const allowLine = s1 && parsed(s1.proc)[s1.proc.stdin.length - 1]
      if (s1) s1.proc.emitLines([askLine.replace('"id":0', '"id":5')])
      await tick(10)
      const denied = manager.answerPermission('ac', '5', { allow: false, message: 'no' })
      const denyLine = s1 && parsed(s1.proc)[s1.proc.stdin.length - 1]
      // The card's third verb: main grants FIRST, then answers through the same
      // door (index.ts's order) — so at answer time preAnswer already says yes.
      if (s1) s1.proc.emitLines([askLine.replace('"id":0', '"id":6')])
      await tick(10)
      granted.add('ac/execute')
      const forSession = manager.answerPermission('ac', '6', { allow: true })
      const alwaysLine = s1 && parsed(s1.proc)[s1.proc.stdin.length - 1]
      // And a request that arrives with the grant already held: answered
      // allow_always before it is ever pending, never shown.
      const stdinBefore = s1 ? s1.proc.stdin.length : 0
      if (s1) s1.proc.emitLines([askLine.replace('"id":0', '"id":7')])
      await tick(10)
      const autoLine = s1 && parsed(s1.proc)[s1.proc.stdin.length - 1]
      const autoEvent = events.find((e) => e.id === 'ac' && e.type === 'permission-auto-allowed')
      const askedSeven = events.find((e) => e.id === 'ac' && e.type === 'permission-request' && e.requestId === '7')
      ok('acp.3.d session/request_permission is pending with requestId \'0\' and toolName execute; answerPermission allow writes the JSON-RPC answer { id: 0, result.outcome.optionId: allow_once }, deny writes reject_once, an answer under a session grant (preAnswer true at answer time) writes allow_always, and a request arriving with the grant held is answered allow_always before it is pending (permission-auto-allowed, no permission-request event); no control_response line is ever written',
        pendingBefore.length === 1 && pendingBefore[0].requestId === '0' && pendingBefore[0].toolName === 'execute' && pendingBefore[0].input.command === 'echo probe-ok' &&
          allowed === true && allowLine.id === 0 && allowLine.result.outcome.optionId === 'allow_once' && allowLine.result.outcome.outcome === 'selected' &&
          denied === true && denyLine.id === 5 && denyLine.result.outcome.optionId === 'reject_once' &&
          forSession === true && alwaysLine.id === 6 && alwaysLine.result.outcome.optionId === 'allow_always' &&
          s1.proc.stdin.length === stdinBefore + 1 && autoLine.id === 7 && autoLine.result.outcome.optionId === 'allow_always' && autoEvent !== undefined && autoEvent.toolName === 'execute' && askedSeven === undefined &&
          manager.get('ac').pending.length === 0 && !s1.proc.stdin.some((l) => l.includes('control_response')),
        JSON.stringify({ pendingBefore, allowLine, denyLine, alwaysLine, autoLine, autoEvent, askedSeven, stdin: s1 && s1.proc.stdin.length }))
      granted = new Set()

      // The process dies mid-prompt: the turn is aborted with the reason.
      if (s1) s1.proc.exit(1, null, 'gone')
      await tick(10)
      const aborted = events.find((e) => e.id === 'ac' && e.type === 'turn-aborted')
      const exited = manager.get('ac')
      ok('acp.3.e the process exiting mid-prompt aborts the turn (turn-aborted, reason exited) and the session reads exited with the code and stderr',
        aborted !== undefined && aborted.reason === 'exited' && exited.status === 'exited' && exited.exitCode === 1 && events.some((e) => e.id === 'ac' && e.type === 'status' && e.status === 'exited' && e.stderr === 'gone'),
        JSON.stringify({ aborted, exited }))

      // The second spawn: session/load names the adopted id; its replay stores nothing.
      const storedBefore = manager.transcript('ac').length
      const r3 = manager.send('ac', 'What was the first word?')
      const s2 = spawns[1]
      if (s2) s2.proc.emitLines([answerTo('load.log', 1)])
      await tick(10)
      const loadLine = s2 && parsed(s2.proc)[1]
      const heldStill = s2 ? s2.proc.stdin.length : -1
      const loadReplay = acpLines('load.log').slice(1, 6).map((l) => l.replace(/b5a48d7e-2ebc-460b-adb9-379df4779281/g, '20d8f012-67af-4c3a-a046-350822466b44'))
      if (s2) s2.proc.emitLines(loadReplay)
      await tick(10)
      const promptAfterLoad = s2 && parsed(s2.proc)[2]
      const storedAfter = manager.transcript('ac').length
      ok('acp.3.f a session that has spawned before writes session/load (the adopted id, the cwd) after initialize answers instead of session/new, holds the prompt until the load answers, and the load\'s replayed history stores NO turns (the transcript already holds them); the prompt then goes with the held text',
        r3 === 'sent' && spawns.length === 2 && loadLine !== undefined && loadLine.method === 'session/load' && loadLine.params.sessionId === '20d8f012-67af-4c3a-a046-350822466b44' && loadLine.params.cwd === '/w' && heldStill === 2 &&
          promptAfterLoad !== undefined && promptAfterLoad.method === 'session/prompt' && promptAfterLoad.params.prompt[0].text === 'What was the first word?' && promptAfterLoad.params.sessionId === '20d8f012-67af-4c3a-a046-350822466b44' &&
          storedAfter === storedBefore + 1 && manager.get('ac').status === 'streaming',
        JSON.stringify({ r3, loadLine, heldStill, promptAfterLoad, storedBefore, storedAfter, status: manager.get('ac').status }))
      manager.dispose('ac')

      const src = readFileSync(join(__dirname, '..', 'src', 'shared', 'acp-transcript.ts'), 'utf8')
      // Anchored on the DECLARATION: the header comment names the constant first, and a match there would read prose (the tone.1 lesson).
      const capsBlock = (src.match(/export const ACP_CLIENT_CAPABILITIES[\s\S]*?\n\}\)/) || [''])[0]
      const initLine = JSON.parse(ACP.acpInitialize(1))
      ok('acp.4 clientCapabilities in the initialize line are EXACTLY { fs: { readTextFile: false, writeTextFile: false }, terminal: false } — as text in acp-transcript.ts (the declared object) and as the encoded line; no `true` anywhere in the declaration',
        /readTextFile:\s*false/.test(capsBlock) && /writeTextFile:\s*false/.test(capsBlock) && /terminal:\s*false/.test(capsBlock) && !/true/.test(capsBlock) &&
          JSON.stringify(initLine.params.clientCapabilities) === JSON.stringify(CAPS) && initLine.params.protocolVersion === 1,
        JSON.stringify({ capsBlock, caps: initLine.params.clientCapabilities }))
    } catch (e) {
      // The stub adapter THROWS by name before M119 wires it; a throw here
      // would abort every check below (verify-suites.md rule 1).
      ok('acp.3 the manager drives an acp session without throwing', false, String((e && e.stack) || e).slice(0, 300))
    }
  }

  /* M119 — acp.2. THE ROW IS THE PROMISE, THE HANDSHAKE THE FACT. The row
     says copilot (acp) resumes and takes images; what initialize ANSWERS is
     the measured truth for this process, stored on the snapshot as
     `negotiated`, and it outranks the row: a session/load on an agent that
     answered loadSession: false errors (or worse, silently starts fresh under
     the old id), and an image block to an agent that answered image: false
     is a refused prompt with a stored turn. Guarded like acp.1. */
  {
    const ACP = M.acp
    const SH = M.sharedSession || {}
    const acpLines = (name) => readFileSync(join(FIX, 'acp', name), 'utf8').split('\n').filter((l) => l.startsWith('<- ')).map((l) => l.slice(3))
    const answerTo = (name, id) => acpLines(name).find((l) => { try { const j = JSON.parse(l); return j.id === id && j.method === undefined } catch { return false } })
    const noLoad = (l) => l.replace('"loadSession":true', '"loadSession":false').replace('"image":true', '"image":false')
    const parsed = (proc) => proc.stdin.map((l) => { try { return JSON.parse(l) } catch { return { raw: l } } })
    if (!ACP || typeof ACP.parseAcpLine !== 'function') {
      ok('acp.2 the ACP codec exists for the negotiated rule to ride', false, 'no acp codec in the bundle')
    } else try {
      const { manager, spawns } = makeManager({ binaries: { acp: { command: '/fake/bin/copilot' } } })
      manager.create({ id: 'ng', cwd: '/w', backend: 'acp' })
      manager.send('ng', 'first')
      const s1 = spawns[0]
      s1.proc.emitLines([noLoad(answerTo('pong.log', 1))])
      await tick(10)
      s1.proc.emitLines([answerTo('pong.log', 2)])
      await tick(10)
      const opened = manager.get('ng')
      s1.proc.emitLines([answerTo('pong.log', 3)])
      await tick(10)
      const turnsBeforeRefusal = manager.transcript('ng').length
      const withImage = manager.send('ng', 'see', [{ mediaType: 'image/png', base64: 'aGk=' }])
      const turnsAfterRefusal = manager.transcript('ng').length
      s1.proc.exit(0, null)
      await tick(10)
      manager.send('ng', 'second')
      const s2 = spawns[1]
      s2.proc.emitLines([noLoad(answerTo('pong.log', 1))])
      await tick(10)
      const secondOpen = parsed(s2.proc)[1]
      ok('acp.2 initialize answering loadSession: false / image: false lands on the snapshot as negotiated { loadSession: false, image: false } (the row still says true for both); a send with an image is then refused by name and stores nothing; and the second spawn writes session/new — never session/load — because the negotiated fact outranks the row\'s resumes',
        opened.negotiated !== undefined && opened.negotiated.loadSession === false && opened.negotiated.image === false && M.backends.BACKENDS.acp.resumes === true && M.backends.BACKENDS.acp.images === true &&
          withImage === 'refused-images' && turnsAfterRefusal === turnsBeforeRefusal &&
          spawns.length === 2 && secondOpen !== undefined && secondOpen.method === 'session/new' && secondOpen.params.cwd === '/w' &&
          !s2.proc.stdin.some((l) => l.includes('session/load')),
        JSON.stringify({ negotiated: opened.negotiated, withImage, turnsBeforeRefusal, turnsAfterRefusal, secondOpen, stdin2: s2.proc.stdin }))
      manager.dispose('ng')

      // The pure helper the composer reads: negotiated when present, the row otherwise.
      const B = M.backends.BACKENDS
      const ia = SH.imagesAllowed
      ok('acp.2.b imagesAllowed(snapshot, row) is pure in shared/agent-session.ts: the negotiated image answer when the snapshot carries one (false over a true row; true over a false row), the row\'s images otherwise (a snapshot with no negotiated, or one whose negotiated says nothing about images)',
        typeof ia === 'function' &&
          ia({ negotiated: { image: false } }, B.acp) === false && ia({ negotiated: { image: true } }, B.codex) === true &&
          ia({}, B.acp) === true && ia({}, B.codex) === false && ia({ negotiated: { loadSession: false } }, B.acp) === true && ia(null, B.claude) === true,
        JSON.stringify({ has: typeof ia }))
    } catch (e) {
      ok('acp.2 the negotiated rule runs without throwing', false, String((e && e.stack) || e).slice(0, 300))
  }
}

  // M132 — pool.1. The pool: N workers over a shared list, no ceiling of its
  // own (M82's `agents.maxConcurrent`/`budgetUsd` read LIVE every pump).
  {
    const poolNode = (width) => ({ kind: 'pool', width, list: '/fake/list.txt', prompt: 'do it', cwd: '/repo', dx: 0, dy: 0 })
    const itemsOf = (n) => Array.from({ length: n }, (_, i) => `item-${i}`)

    // pool.1a/1b — width 12 under a ceiling of 4: 4 start, 8 queue with the
    // same 'concurrency' reason M82's own queue uses, and no budget applies.
    {
      const events = []
      let nextId = 0
      M.pool.startPool(poolNode(12), {
        readList: () => ({ kind: 'ok', items: itemsOf(12) }),
        limits: () => ({ maxConcurrent: 4, budgetUsd: 0 }),
        spend: () => 0,
        createWorker: async () => ({ id: `w${++nextId}` }),
        interrupt: () => {},
        onEvent: (e) => events.push(e)
      })
      await tick(20)
      const started = events.filter((e) => e.kind === 'started').length
      const queuedEvents = events.filter((e) => e.kind === 'queued')
      const queued = queuedEvents.length
      ok('pool.1a width is bounded by maxConcurrent READ LIVE, not captured',
        started === 4 && queued === 8,
        'a pool of 12 under a ceiling of 4 — M82 built this queue; the pool gets no ceiling of its own')
      ok('pool.1b a queued worker names WHICH queue it is in',
        queuedEvents.length > 0 && queuedEvents.every((e) => e.reason === 'concurrency'),
        JSON.stringify(queuedEvents[0]))
    }

    // pool.1c — a worker finishing pulls the next item, until the list drains.
    {
      const events = []
      let nextId = 0
      const handle = M.pool.startPool(poolNode(2), {
        readList: () => ({ kind: 'ok', items: itemsOf(5) }),
        limits: () => ({ maxConcurrent: 2, budgetUsd: 0 }),
        spend: () => 0,
        createWorker: async () => ({ id: `w${++nextId}` }),
        interrupt: () => {},
        onEvent: (e) => events.push(e)
      })
      await tick(20)
      let started = events.filter((e) => e.kind === 'started')
      // Drain by finishing the oldest live worker each round until the pool
      // reports empty — this is the loop M97 widened from one agent to N.
      let guard = 0
      while (!events.some((e) => e.kind === 'stopped') && guard < 20) {
        const stillLive = events.filter((e) => e.kind === 'started').map((e) => e.id)
          .filter((id) => !events.some((e) => e.kind === 'finished' && e.id === id))
        if (stillLive.length === 0) break
        handle.finished(stillLive[0])
        await tick(10)
        guard += 1
      }
      const pulls = events.filter((e) => e.kind === 'started').length
      const stopped = events.find((e) => e.kind === 'stopped')
      ok('pool.1c a worker that finishes pulls the next item until the list is empty',
        pulls === 5 && stopped !== undefined && stopped.why === 'empty',
        `M97's loop shape widened from one agent to N — pulls=${pulls}`)
    }

    // pool.1d — an empty list ends the pool without minting a worker.
    {
      const events = []
      M.pool.startPool(poolNode(4), {
        readList: () => ({ kind: 'ok', items: [] }),
        limits: () => ({ maxConcurrent: 4, budgetUsd: 0 }),
        spend: () => 0,
        createWorker: async () => ({ id: 'never' }),
        interrupt: () => {},
        onEvent: (e) => events.push(e)
      })
      await tick(10)
      const minted = events.filter((e) => e.kind === 'started').length
      ok('pool.1d an empty list ends the pool without minting a worker',
        minted === 0 && events.some((e) => e.kind === 'stopped' && e.why === 'empty'),
        JSON.stringify(events))
    }

    // pool.1e — a list that cannot be read refuses BY NAME before any worker
    // is minted.
    {
      const events = []
      M.pool.startPool(poolNode(4), {
        readList: () => ({ kind: 'error', why: 'ENOENT' }),
        limits: () => ({ maxConcurrent: 4, budgetUsd: 0 }),
        spend: () => 0,
        createWorker: async () => ({ id: 'never' }),
        interrupt: () => {},
        onEvent: (e) => events.push(e)
      })
      await tick(10)
      const minted = events.filter((e) => e.kind === 'started').length
      const res = events.find((e) => e.kind === 'refused')
      ok('pool.1e a list that cannot be read refuses BY NAME before any worker is minted',
        res !== undefined && res.kind === 'refused' && minted === 0,
        JSON.stringify(events))
    }

    // pool.1f — a budget crossing interrupts every live worker and kills none.
    // `spend` crosses AFTER the four started, and the caller re-checks live
    // ceilings the same way M82 already does elsewhere (here via `tick()`,
    // driven with none of the four having naturally finished).
    {
      const events = []
      const interrupted = []
      let nextId = 0
      let spendValue = 0
      const deps1f = {
        readList: () => ({ kind: 'ok', items: itemsOf(4) }),
        limits: () => ({ maxConcurrent: 4, budgetUsd: 1 }),
        spend: () => spendValue,
        createWorker: async () => ({ id: `w${++nextId}` }),
        interrupt: (id) => interrupted.push(id),
        onEvent: (e) => events.push(e)
      }
      const handle = M.pool.startPool(poolNode(4), deps1f)
      await tick(10)
      const startedBefore = events.filter((e) => e.kind === 'started').length
      spendValue = 5 // crosses budgetUsd: 1
      handle.tick()
      await tick(10)
      // The module has no kill door at all: the deps object we handed it
      // carries no `kill` field for it to have reached even if it tried,
      // and the source text never calls one — read as text the way
      // registry.1/registry.3 pin their own claims.
      const poolSrc = readFileSync(join(__dirname, '..', 'src', 'main', 'pool-runner.ts'), 'utf8')
      const depsHaveNoKill = !Object.prototype.hasOwnProperty.call(deps1f, 'kill')
      ok('pool.1f a budget crossing INTERRUPTS every worker and never kills one',
        startedBefore === 4 && interrupted.length === 4 && depsHaveNoKill &&
          !/\.kill\(/.test(poolSrc) &&
          events.some((e) => e.kind === 'stopped' && e.why === 'budget'),
        'a killed agent loses its turn, and a budget is a stop — M82, unchanged')
    }

    // pool.1g — a `finished` reacted to re-entrantly from inside an active
    // pump()'s own onEvent delivery (here, off a 'queued' event the fill
    // phase emits — a 'started' event self-heals in this implementation's
    // while loop, which always rechecks its own condition fresh before
    // exiting; it is the CODE AFTER that loop, still inside the same
    // pumping=true call, where a dropped re-pump would otherwise strand
    // freed capacity) still pulls the next pending item rather than
    // stalling until an unrelated finished/tick arrives.
    {
      const events = []
      let nextId = 0
      let reentered = false
      const handle = M.pool.startPool(poolNode(4), {
        readList: () => ({ kind: 'ok', items: itemsOf(4) }),
        limits: () => ({ maxConcurrent: 2, budgetUsd: 0 }),
        spend: () => 0,
        createWorker: async () => ({ id: `w${++nextId}` }),
        interrupt: () => {},
        onEvent: (e) => {
          events.push(e)
          if (e.kind === 'queued' && !reentered) {
            reentered = true
            handle.finished('w1') // re-entrant: pump() is still active here
          }
        }
      })
      await tick(30)
      const started = events.filter((e) => e.kind === 'started').map((e) => e.id)
      ok('pool.1g a finished() reacted to re-entrantly while pump() is still active still pulls the next item, rather than dropping the request and stalling with freed capacity and pending work',
        started.length === 3 && started.includes('w3'),
        JSON.stringify(events))
    }

    // pool.1h — a stop() (or a budget crossing) that lands DURING a pending
    // createWorker must not orphan the worker that await resolves into. The
    // process is already minted at that point; returning without interrupting
    // it leaves an agent running that no pool tracks, no ceiling bounds and
    // no budget can stop — the silent counterpart of pool.1f's guarantee.
    {
      const events = []
      const interrupted = []
      let nextId = 0
      let release = null
      const handle = M.pool.startPool(poolNode(2), {
        readList: () => ({ kind: 'ok', items: itemsOf(2) }),
        limits: () => ({ maxConcurrent: 2, budgetUsd: 0 }),
        spend: () => 0,
        createWorker: () => new Promise((resolve) => { release = () => resolve({ id: `w${++nextId}` }) }),
        interrupt: (id) => interrupted.push(id),
        onEvent: (e) => events.push(e)
      })
      await tick(10)
      handle.stop() // lands while the first createWorker is still pending
      release()
      await tick(20)
      ok('pool.1h a stop() during a pending createWorker INTERRUPTS the worker it resolves into rather than orphaning it',
        interrupted.length === 1 && interrupted[0] === 'w1' &&
          events.filter((e) => e.kind === 'started').length === 0,
        JSON.stringify({ events, interrupted }))
    }
  }

  // M138 — pool.2a–d. THE POOL'S PRODUCTION CALLER. `startPool` (pool.1) is
  // pure over injected deps and had no caller; `createPoolCaller` is main's
  // half between a workflow's Run and that engine: it reads the list, asks
  // the RENDERER to mint each worker (the renderer owns the workspace it
  // renders — M80's rule, board:add's precedent), sends the block's prompt
  // with the item as the worker's first message through the ordinary send,
  // drives `finished` from the manager's OWN events (a worker's `ready` after
  // its turn, or its exit) and `tick` from every budget event, and forwards
  // every pool event with the template and block it belongs to. Driven with
  // a FAKE agents seam and a fake mint: pool.1 already proves the engine.
  {
    const PC = M.poolCaller
    const poolNode = (width) => ({ kind: 'pool', width, list: '/fake/list.txt', prompt: 'do it', cwd: '/repo', dx: 0, dy: 0 })
    const fakeAgents = () => {
      const subs = []
      const a = {
        sends: [], interrupts: [],
        sendWord: 'sent',
        send: (id, text) => { a.sends.push([id, text]); return a.sendWord },
        interrupt: (id) => { a.interrupts.push(id); return true },
        subscribe: (cb) => { subs.push(cb); return () => { subs.splice(subs.indexOf(cb), 1) } },
        emit: (e) => { for (const cb of [...subs]) cb(e) }
      }
      return a
    }
    if (PC === undefined || typeof PC.createPoolCaller !== 'function') {
      for (const id of ['pool.2a', 'pool.2b', 'pool.2c', 'pool.2d']) ok(`${id} main/pool-caller.ts exports createPoolCaller`, false, 'module absent')
    } else {
      try {
        {
          const agents = fakeAgents(); const events = []; const mints = []; let n = 0
          const caller = PC.createPoolCaller({
            agents, mint: async (req) => { mints.push(req); return { kind: 'ok', id: `w${++n}` } },
            readList: () => ({ kind: 'ok', items: ['a', 'b', 'c', 'd', 'e'] }),
            limits: () => ({ maxConcurrent: 2, budgetUsd: 0 }), spend: () => 0,
            emit: (e) => events.push(e)
          })
          const started = caller.start({ templateId: 't1', key: 'p', node: poolNode(3) })
          await tick(20)
          const startedEvents = events.filter((e) => e.event.kind === 'started')
          ok('pool.2a start mints the workers through the renderer (bounded by the live ceiling), sends each the prompt with its item, and every event carries its template and block',
            started.kind === 'started' && mints.length === 2 && mints[0].templateId === 't1' && mints[0].key === 'p' && mints[0].cwd === '/repo' && mints[0].item === 'a' && mints[1].item === 'b' &&
              agents.sends.length === 2 && agents.sends[0][0] === 'w1' && /do it/.test(agents.sends[0][1]) && /\ba\b/.test(agents.sends[0][1]) &&
              startedEvents.length === 2 && events.every((e) => e.templateId === 't1' && e.key === 'p') &&
              events.some((e) => e.event.kind === 'queued' && e.event.reason === 'concurrency'),
            JSON.stringify({ started, mints: mints.map((m) => m.item), sends: agents.sends, kinds: events.map((e) => e.event.kind) }))
          agents.emit({ id: 'w1', type: 'turn', turn: { role: 'assistant', blocks: [] } })
          agents.emit({ id: 'w1', type: 'status', status: 'ready' })
          await tick(20)
          const afterReady = mints.map((m) => m.item)
          agents.emit({ id: 'w2', type: 'status', status: 'exited', exitCode: 0 })
          await tick(20)
          const afterExit = mints.map((m) => m.item)
          agents.emit({ id: 'zzz-not-ours', type: 'status', status: 'ready' })
          await tick(20)
          ok('pool.2b a worker\'s ready after its turn pulls the next item, an exit does too, and a session that is not a worker moves nothing',
            afterReady.join(',') === 'a,b,c' && afterExit.join(',') === 'a,b,c,d' && mints.length === 4 &&
              events.filter((e) => e.event.kind === 'finished').length === 2,
            JSON.stringify({ afterReady, afterExit, finished: events.filter((e) => e.event.kind === 'finished').map((e) => e.event.id) }))
          const again = caller.start({ templateId: 't1', key: 'p', node: poolNode(3) })
          const stopped = caller.stop('t1', 'p')
          await tick(10)
          const stoppedEvent = events.find((e) => e.event.kind === 'stopped')
          ok('pool.2c stop interrupts every live worker (never kills) and says by-hand; a start on a block already running is refused by name; a stop of nothing is false',
            again.kind === 'refused' && /already running/.test(again.reason) && stopped === true &&
              agents.interrupts.sort().join(',') === 'w3,w4' && stoppedEvent !== undefined && stoppedEvent.event.why === 'by-hand' &&
              caller.stop('t1', 'p') === false && caller.list().length === 0,
            JSON.stringify({ again, stopped, interrupts: agents.interrupts, stoppedEvent }))
        }
        {
          const agents = fakeAgents(); const events = []; let mints = 0
          const caller = PC.createPoolCaller({
            agents, mint: async () => { mints += 1; return { kind: 'refused', reason: 'the canvas is still starting' } },
            readList: (path) => (path === '/missing' ? { kind: 'error', why: 'ENOENT' } : { kind: 'ok', items: ['x'] }),
            limits: () => ({ maxConcurrent: 4, budgetUsd: 0 }), spend: () => 0,
            emit: (e) => events.push(e)
          })
          const missing = caller.start({ templateId: 't2', key: 'p', node: { ...poolNode(2), list: '/missing' } })
          const mintsAfterMissing = mints
          const refusedMint = caller.start({ templateId: 't3', key: 'p', node: poolNode(2) })
          await tick(20)
          const refusedEvent = events.find((e) => e.templateId === 't3' && e.event.kind === 'refused')
          ok('pool.2d an unreadable list refuses by name before any mint; a mint the renderer refuses becomes a `refused` event naming the reason, no `stopped` follows it, and that pool is not left running',
            missing.kind === 'refused' && /could not read the work list/.test(missing.reason) && mintsAfterMissing === 0 &&
              refusedMint.kind === 'started' && mints === 1 && refusedEvent !== undefined && /still starting/.test(refusedEvent.event.why) &&
              !events.some((e) => e.templateId === 't3' && e.event.kind === 'stopped') &&
              agents.sends.length === 0 && caller.list().length === 0,
            JSON.stringify({ missing, refusedMint, mints, refusedEvent, kinds: events.map((e) => e.event.kind), live: caller.list() }))
        }
        // 2e. a send the manager refuses ends the pool by name — a worker that will never turn would sit `started` forever.
        {
          const agents = fakeAgents(); agents.sendWord = 'refused-sandbox'; const events = []; let n = 0
          const caller = PC.createPoolCaller({
            agents, mint: async () => ({ kind: 'ok', id: `w${++n}` }),
            readList: () => ({ kind: 'ok', items: ['a', 'b', 'c'] }),
            limits: () => ({ maxConcurrent: 2, budgetUsd: 0 }), spend: () => 0,
            emit: (e) => events.push(e)
          })
          const started = caller.start({ templateId: 't4', key: 'p', node: poolNode(2) })
          await tick(20)
          const refused = events.find((e) => e.event.kind === 'refused')
          ok('pool.2e a worker whose send the manager refuses ends the pool by name with the manager\'s word, interrupting the live workers, never a `by hand`',
            started.kind === 'started' && refused !== undefined && /refused-sandbox/.test(refused.event.why) && /w1/.test(refused.event.why) &&
              agents.interrupts.includes('w1') && !events.some((e) => e.event.kind === 'stopped') && caller.list().length === 0,
            JSON.stringify({ started, kinds: events.map((e) => e.event.kind), refused, interrupts: agents.interrupts }))
        }
        // 2f. a joined pool (an edge into a collect) must run every worker at once, or it is refused by name before any mint.
        {
          const agents = fakeAgents(); const events = []; let mints = 0
          const caller = PC.createPoolCaller({
            agents, mint: async () => { mints += 1; return { kind: 'ok', id: `w${mints}` } },
            readList: () => ({ kind: 'ok', items: ['a', 'b', 'c', 'd', 'e'] }),
            limits: () => ({ maxConcurrent: 2, budgetUsd: 0 }), spend: () => 0,
            emit: (e) => events.push(e)
          })
          const wide = caller.start({ templateId: 't5', key: 'p', node: poolNode(8), joined: true })
          const narrow = caller.start({ templateId: 't6', key: 'p', node: poolNode(8) })
          await tick(20)
          ok('pool.2f a pool that hands off into a collect is refused by name when its items outnumber the workers the live ceiling allows at once; the same pool without the join starts',
            wide.kind === 'refused' && /every worker must run at once/.test(wide.reason) && /5 items/.test(wide.reason) && /2 at a time/.test(wide.reason) &&
              narrow.kind === 'started' && mints === 2,
            JSON.stringify({ wide, narrow, mints }))
        }
      } catch (e) {
        ok('pool.2 the caller runs without throwing', false, String((e && e.stack) || e).slice(0, 400))
      }
    }
  }

  // M145 — backends.imagePath.1. Every row says whether its CLI reads an
  // image path (backlog #13's per-CLI constraint lives beside the per-model
  // configuration, as the entry asked); copilot and acp say `unmeasured`
  // rather than guessing.
  {
    const B = M.backends.BACKENDS
    const rows = Object.keys(B)
    ok('backends.imagePath.1 every backend row carries a pastesImagePath sentence, and the unmeasured rows say so',
      rows.length >= 4 && rows.every((k) => typeof B[k].pastesImagePath === 'string' && B[k].pastesImagePath.length > 10) &&
        /reads/.test(B.claude.pastesImagePath) && /unmeasured/.test(B.copilot.pastesImagePath),
      JSON.stringify(Object.fromEntries(rows.map((k) => [k, B[k].pastesImagePath]))))
  }

  /* ---------------------------------------------------------------------- */
  /* M319. Backend differences made explicit before work starts            */
  /* ---------------------------------------------------------------------- */
  {
    const F = M.fit
    const lane = F.taskRequirements({ lane: true })
    const swarm = F.taskRequirements({ swarm: true, budgetUsd: 5, images: true, readOnly: true })
    const fit = (b, reqs, avail) => F.backendFit(b, reqs, avail)
    const cl = fit('claude', lane), cx = fit('codex', lane), cxSwarm = fit('codex', swarm), clSwarm = fit('claude', swarm), gone = fit('claude', lane, false)
    ok('fit.1 a requirement is REQUIRED or WANTED and only a required one refuses: a solo lane on codex is DEGRADED (its rules ride the first message; no deny list, no interrupt) while an arrangement on codex is REFUSED with the registry\'s own noPrompt sentence; claude fits a lane; a CLI discovery did not find refuses anything',
      cl.verdict === 'fits' && cx.verdict === 'degraded' && cx.refusal === undefined &&
        cx.rows.find((r) => r.id === 'prompt').ok === false && cx.rows.find((r) => r.id === 'prompt').level === 'wanted' &&
        cx.rows.find((r) => r.id === 'no-publish').ok === false && cx.rows.find((r) => r.id === 'interrupt').ok === false &&
        cxSwarm.verdict === 'refused' && cxSwarm.refusal === M.backends.BACKENDS.codex.reasons.noPrompt &&
        gone.verdict === 'refused' && gone.refusal === M.backends.BACKENDS.claude.reasons.noCli,
      JSON.stringify({ cl, cx, cxSwarm, gone }))
    const ids = (r) => r.map((x) => x.id).join()
    ok('fit.2 only the capabilities THIS task touches are listed: a plain chat asks for the CLI alone; a budget adds cost, an image in the brief adds images, a "no edits" brief adds read-only — and a backend that reports no cost says the budget cannot stop it rather than claiming a figure',
      ids(F.taskRequirements({})) === 'cli' && ids(lane) === 'cli,prompt,no-publish,interrupt,resume,permissions' &&
        ['cost', 'images', 'read-only'].every((id) => swarm.some((r) => r.id === id)) &&
        F.briefWantsImages('match the screenshot in the issue') && !F.briefWantsImages('fix the flaky test') &&
        F.briefIsReadOnly('Report findings; do not change the code.') && !F.briefIsReadOnly('change the parser') &&
        /budget cannot stop it/.test(fit('codex', swarm).rows.find((r) => r.id === 'cost').line) && clSwarm.rows.find((r) => r.id === 'cost').ok === true &&
        /can do everything/.test(F.fitSummary(cl)) && /without an appended prompt/.test(F.fitSummary(cx)) && /cannot do this task/.test(F.fitSummary(cxSwarm)),
      JSON.stringify({ lane: ids(lane), swarm: ids(swarm), sum: [F.fitSummary(cl), F.fitSummary(cx), F.fitSummary(cxSwarm)] }))

    const s1 = F.stopOptions('claude', { generating: true, queued: 2 })
    const s2 = F.stopOptions('codex', { generating: true, queued: 0 })
    const s3 = F.stopOptions('claude', { generating: false, queued: 0, processUp: false })
    const by = (opts, k) => opts.find((o) => o.kind === k)
    ok('stop.1 interrupt, cancel and terminate are three acts with three effects: Interrupt keeps the process and the conversation (claude, mid-turn) and is absent on codex with the registry\'s reason; Cancel drops only what is queued and leaves the turn; End process kills the CLI, says the turn is lost mid-turn, says whether the conversation resumes, and names the untracked children',
      by(s1, 'interrupt').available && /stays up/.test(by(s1, 'interrupt').effect) && /conversation continues/.test(by(s1, 'interrupt').effect) &&
        by(s1, 'cancel').available && by(s1, 'cancel').label === 'Cancel 2 queued' && /not touched/.test(by(s1, 'cancel').effect) &&
        by(s1, 'terminate').available && /turn is lost/.test(by(s1, 'terminate').effect) && /same conversation/.test(by(s1, 'terminate').effect) && /may survive/.test(by(s1, 'terminate').effect) &&
        !by(s2, 'interrupt').available && by(s2, 'interrupt').effect === M.backends.BACKENDS.codex.reasons.noInterrupt && !by(s2, 'cancel').available && by(s2, 'terminate').available &&
        !by(s3, 'interrupt').available && !by(s3, 'terminate').available,
      JSON.stringify({ s1, s2, s3 }))

    // stop.2 — the manager's two new doors over the fake runner.
    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'st', cwd: '/w' })
    manager.send('st', 'one')
    manager.send('st', 'two')
    manager.send('st', 'three')
    const queuedBefore = manager.get('st').queued
    const dropped = manager.cancelQueued('st')
    const afterCancel = manager.get('st')
    const p = spawns[0].proc
    p.emitLines(upTo(fixture('turn.jsonl'), (l) => l.includes('"text_delta"')))
    const ended = manager.terminate('st')
    p.exit(null, 'SIGTERM')
    const afterTerm = manager.get('st')
    const aborted = events.find((e) => e.id === 'st' && e.type === 'turn-aborted')
    const again = manager.send('st', 'after')
    ok('stop.2 cancelQueued drops the queued messages and leaves the turn in flight; terminate kills the process and KEEPS the session — the cut turn is aborted as `terminated` (an interrupted turn, told apart from an exit), and the next message respawns on --resume of the same id',
      queuedBefore === 2 && dropped === 2 && afterCancel.queued === 0 && afterCancel.status !== 'exited' && p.killed === 1 && ended === true &&
        aborted !== undefined && aborted.reason === 'terminated' && afterTerm.status === 'exited' && afterTerm.id === 'st' &&
        again === 'sent' && spawns.length === 2 && spawns[1].args.includes('--resume') && manager.terminate('nobody') === false && manager.cancelQueued('st') === 0,
      JSON.stringify({ queuedBefore, dropped, afterTerm, aborted, again, args: spawns[1] && spawns[1].args }))
  }

  {
    // M322 — the waiting messages as a list a person controls. queue.1 is the
    // brief's acceptance case: three queued, the second edited, the third
    // removed, and only the intended messages reach the agent, in order.
    const RESULT = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.1, usage: { input_tokens: 1, output_tokens: 1 } })
    const texts = (proc) => proc.stdin.map((l) => { try { const m = JSON.parse(l); return m.type === 'user' ? m.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('') : null } catch { return null } }).filter((t) => t !== null)
    const userTexts = (manager, id) => manager.transcript(id).filter((t) => t.role === 'user').map((t) => `${t.blocks[0].text}${t.delivery === undefined ? '' : `(${t.delivery})`}`)
    {
      const { manager, spawns, events } = makeManager()
      manager.create({ id: 'q', cwd: '/w' })
      manager.send('q', 'one')
      const p = spawns[0].proc
      p.emitLines(upTo(fixture('turn.jsonl'), isInit))
      const r = ['two', 'three', 'four'].map((t) => manager.send('q', t))
      const listed = manager.get('q').queue.map((x) => x.text)
      const [, second, third] = manager.get('q').queue
      const edited = manager.editQueued('q', second.turnId, 'three, corrected')
      const removed = manager.removeQueued('q', third.turnId)
      const whileWaiting = userTexts(manager, 'q')
      p.emitLines([RESULT])
      await tick(10)
      p.emitLines([RESULT])
      await tick(10)
      p.emitLines([RESULT])
      await tick(10)
      const sent = texts(p)
      const after = userTexts(manager, 'q')
      const lastQueue = events.filter((e) => e.id === 'q' && e.type === 'queue').pop()
      ok('queue.1 three queued, the second edited and the third removed: the agent receives one, two, the EDITED second and nothing else, in that order; the transcript never shows the removed one and ends with every message delivered',
        r.every((x) => x === 'queued') && listed.join('|') === 'two|three|four' && edited === true && removed === true &&
          whileWaiting.join('|') === 'one|two(queued)|three, corrected(queued)' &&
          sent.join('|') === 'one|two|three, corrected' && after.join('|') === 'one|two|three, corrected' &&
          lastQueue !== undefined && lastQueue.queue.length === 0 && manager.get('q').queued === 0 &&
          manager.editQueued('q', second.turnId, 'too late') === false && manager.removeQueued('q', second.turnId) === false,
        JSON.stringify({ r, listed, whileWaiting, sent, after }))
      const delivered = manager.transcript('q').filter((t) => t.role === 'user')
      ok('queue.2 a delivered message is stored again at the END of the transcript — after the answer it waited behind — and a relaunch never reuses a user turn id (the id carries the session stem)',
        delivered.every((t) => /^u-[0-9a-z]+-\d+$/.test(t.id)) && events.some((e) => e.id === 'q' && e.type === 'turn-removed' && e.turnId === second.turnId),
        JSON.stringify(delivered.map((t) => t.id)))
    }
    {
      const { manager, spawns } = makeManager()
      manager.create({ id: 'c', cwd: '/w' })
      manager.send('c', 'build it')
      const p = spawns[0].proc
      p.emitLines(upTo(fixture('turn.jsonl'), isInit))
      manager.send('c', 'later')
      const answer = manager.sendCorrection('c', 'no — use the other file')
      const order = manager.get('c').queue.map((x) => `${x.text}${x.correction ? '*' : ''}`)
      const interruptWritten = p.stdin.some((l) => l.includes('"interrupt"'))
      p.emitLines([RESULT])
      await tick(10)
      p.emitLines([RESULT])
      await tick(10)
      p.emitLines([RESULT])
      await tick(10)
      const idle = manager.sendCorrection('c', 'at rest')
      ok('queue.correct.1 Stop and send puts the correction FIRST and writes the interrupt; when the turn ends the correction is the next input and the earlier waiting message follows; with nothing in flight it is an ordinary send',
        answer.result === 'queued' && answer.interrupted === true && interruptWritten && order.join('|') === 'no — use the other file*|later' &&
          texts(p).join('|') === 'build it|no — use the other file|later|at rest' && idle.result === 'sent' && idle.interrupted === false,
        JSON.stringify({ answer, order, sent: texts(p), idle }))
    }
    {
      const { manager, spawns } = makeManager()
      manager.create({ id: 'x', cwd: '/w' })
      manager.send('x', 'go')
      const p = spawns[0].proc
      p.emitLines(upTo(fixture('turn.jsonl'), isInit))
      manager.send('x', 'and then this')
      p.exit(1, null, '')
      const t = manager.transcript('x').find((u) => u.blocks[0].text === 'and then this')
      const discarded = manager.discardUndelivered('x', t.id)
      const deliveredRefused = manager.discardUndelivered('x', manager.transcript('x')[0].id)
      ok('queue.drop.1 a queue dropped by an exit is NOT withdrawn: each message stays in the transcript marked not-delivered with the sentence why; Discard removes it; a delivered turn cannot be discarded',
        t !== undefined && t.delivery === 'not-delivered' && /never|not delivered/.test(t.deliveryNote) && discarded === true && deliveredRefused === false &&
          !manager.transcript('x').some((u) => u.blocks[0].text === 'and then this'),
        JSON.stringify({ t, discarded, deliveredRefused }))
      manager.send('x', 'one more')
      manager.send('x', 'waits')
      const cancelled = manager.cancelQueued('x')
      ok('queue.drop.2 Cancel withdraws what was waiting (a person chose it), unlike an exit, which leaves it marked',
        cancelled === 1 && !manager.transcript('x').some((u) => u.blocks[0].text === 'waits'), JSON.stringify(userTexts(manager, 'x')))
    }
    if (LOG.createAgentTranscriptLog) {
      const dir = mkdtempSync(join(tmpdir(), 'tc-queue-log-'))
      try {
        const log = LOG.createAgentTranscriptLog({ dir })
        log.appendTurn('p', { id: 'u-a-1', role: 'user', blocks: [{ type: 'text', text: 'waiting' }], at: 1, delivery: 'queued' })
        log.appendTurn('p', { id: 'm1', role: 'assistant', blocks: [{ type: 'text', text: 'answer' }], at: 2 })
        log.appendTurn('p', { id: 'u-a-2', role: 'user', blocks: [{ type: 'text', text: 'removed' }], at: 3, delivery: 'queued' })
        log.removeTurn('p', 'u-a-1')
        log.appendTurn('p', { id: 'u-a-1', role: 'user', blocks: [{ type: 'text', text: 'waiting' }], at: 4 })
        log.removeTurn('p', 'u-a-2')
        log.appendTurn('p', { id: 'u-a-3', role: 'user', blocks: [{ type: 'text', text: 'lost' }], at: 5, delivery: 'not-delivered', deliveryNote: 'why' })
        const read = log.read('p')
        ok('queue.log.1 the transcript log\'s tombstone: a removed turn is gone from every read, one appended again after its removal takes the END position, and delivery and its note survive a read',
          read.turns.map((t) => t.id).join('|') === 'm1|u-a-1|u-a-3' && read.turns[1].delivery === undefined && read.turns[2].delivery === 'not-delivered' && read.turns[2].deliveryNote === 'why',
          JSON.stringify(read.turns))
      } finally { rmSync(dir, { recursive: true, force: true }) }
    }
  }

  {
    // resume-lost.* — recorded 2026-09-23 against claude 2.1.281, codex-cli
    // 0.156.1 and GitHub Copilot CLI 1.0.87, each asked to resume an id it
    // never held (scripts/fixtures/agent-session/{,codex/,copilot/}resume-fail.*).
    const F = M.fit
    const claudeLines = fixture('resume-fail.jsonl')
    const claudeErr = readFileSync(join(FIX, 'resume-fail.stderr'), 'utf8')
    const codexErr = readFileSync(join(FIX, 'codex', 'resume-fail.stderr'), 'utf8')
    const copilotErr = readFileSync(join(FIX, 'copilot', 'resume-fail.stderr'), 'utf8')
    const parsed = claudeLines.map(T.parseStreamLine)
    const result = parsed.find((e) => e.type === 'result')
    ok('resume-lost.1 each CLI\'s measured "no such conversation" is recognised — claude IN-STREAM as a zero-turn error result whose `errors` name the id, codex and copilot on STDERR — and ordinary errors are not mistaken for one',
      result !== undefined && result.ok === false && result.numTurns === 0 &&
        /No conversation found/.test(F.resumeLostDetail('claude', result.error) ?? '') &&
        /No conversation found/.test(F.resumeLostDetail('claude', claudeErr) ?? '') &&
        /no rollout found/.test(F.resumeLostDetail('codex', codexErr) ?? '') && !/^Error:/.test(F.resumeLostDetail('codex', codexErr)) &&
        /No session, task, or name matched/.test(F.resumeLostDetail('copilot', copilotErr) ?? '') &&
        F.resumeLostDetail('claude', 'API Error: 529 overloaded') === null && F.resumeLostDetail('codex', claudeErr) === null && F.resumeLostDetail('acp', codexErr) === null,
      JSON.stringify({ result, claude: F.resumeLostDetail('claude', result && result.error), codex: F.resumeLostDetail('codex', codexErr), copilot: F.resumeLostDetail('copilot', copilotErr) }))

    // claude: a restored panel (spec.resume) whose conversation the CLI pruned.
    const c = makeManager()
    c.manager.create({ id: 'rl', cwd: '/w', sessionId: '7d1f3c2a-0b4e-4c55-9a61-2f8e0d9b1c44', resume: '7d1f3c2a-0b4e-4c55-9a61-2f8e0d9b1c44' })
    c.manager.send('rl', 'hello again')
    const firstArgs = c.spawns[0].args
    c.spawns[0].proc.emitLines(claudeLines)
    c.spawns[0].proc.exit(1, null, claudeErr)
    const lostSnap = c.manager.get('rl')
    const exitEvent = c.events.find((e) => e.id === 'rl' && e.type === 'status' && e.status === 'exited')
    c.manager.send('rl', 'start over')
    const secondArgs = c.spawns[1] && c.spawns[1].args
    ok('resume-lost.2 claude: the failed resume is carried on the exit and the snapshot, counts no turn, and the NEXT message starts a fresh conversation (--session-id, never --resume again) — before M319 every message re-resumed the missing id and failed the same way',
      firstArgs.includes('--resume') && /No conversation found/.test(lostSnap.resumeLost ?? '') && lostSnap.turns === 0 &&
        exitEvent !== undefined && /No conversation found/.test(exitEvent.resumeLost ?? '') &&
        secondArgs !== undefined && !secondArgs.includes('--resume') && secondArgs.includes('--session-id') && c.manager.get('rl').resumeLost === undefined,
      JSON.stringify({ firstArgs, lostSnap, secondArgs }))

    // codex: a thread the CLI no longer holds — stderr, exit 1, no stream.
    const x = makeManager({ codex: { command: '/fake/bin/codex' } })
    x.manager.create({ id: 'xl', cwd: '/w', backend: 'codex', resume: '019a0000-0000-7000-8000-00000000dead' })
    x.manager.send('xl', 'hello again')
    const xFirst = x.spawns[0].args
    x.spawns[0].proc.exit(1, null, codexErr)
    const xSnap = x.manager.get('xl')
    x.manager.send('xl', 'start over')
    const xSecond = x.spawns[1] && x.spawns[1].args
    // copilot: the same, pinned id.
    const y = makeManager({ binaries: { copilot: { command: '/fake/bin/copilot' } } })
    y.manager.create({ id: 'yl', cwd: '/w', backend: 'copilot', sessionId: '7d1f3c2a-0b4e-4c55-9a61-2f8e0d9b1c44', resume: '7d1f3c2a-0b4e-4c55-9a61-2f8e0d9b1c44' })
    y.manager.send('yl', 'hello again')
    const yFirst = y.spawns[0] && y.spawns[0].args
    if (y.spawns[0]) y.spawns[0].proc.exit(1, null, copilotErr)
    const ySnap = y.manager.get('yl')
    y.manager.send('yl', 'start over')
    const ySecond = y.spawns[1] && y.spawns[1].args
    ok('resume-lost.3 codex and copilot: a stderr-only failed resume is recognised at the exit, and the next message is `exec` (codex) / `--session-id` (copilot) — a fresh conversation — instead of the same failing resume',
      xFirst[1] === 'resume' && /no rollout found/.test(xSnap.resumeLost ?? '') && xSecond !== undefined && xSecond[0] === 'exec' && xSecond[1] !== 'resume' &&
        yFirst !== undefined && yFirst.some((a) => a.startsWith('--resume=')) && /No session, task, or name matched/.test(ySnap.resumeLost ?? '') &&
        ySecond !== undefined && !ySecond.some((a) => a.startsWith('--resume=')) && ySecond.includes('--session-id'),
      JSON.stringify({ xFirst, xSnap, xSecond, yFirst, ySnap, ySecond }))
    ok('resume-lost.4 the exit sentence names the backend and promises a resume only where it is true: a failed resume says the next message starts a NEW conversation with nothing from before',
      /^codex could not resume/.test(F.exitSentence('codex', { code: 1, resumeLost: 'no rollout found' })) && /NEW conversation/.test(F.exitSentence('claude', { code: 1, resumeLost: 'x' })) &&
        F.exitSentence('claude', { code: 1 }) === 'claude exited with 1 — the next message resumes the conversation',
      F.exitSentence('codex', { code: 1, resumeLost: 'no rollout found' }))
  }

  {
    // protocol.malformed.* / protocol.interrupted.* — the recorded streams,
    // damaged the way a real pipe damages them: a record cut mid-JSON and a
    // line of non-JSON noise (a CLI printing a warning on stdout), for every
    // backend's parser; and a turn cut off before its result.
    const C = M.codex, CP = M.copilot
    const codexLines = readFileSync(join(FIX, 'codex', 'pong.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '')
    const cpLines = readFileSync(join(FIX, 'copilot', 'pong.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '')
    const damage = (lines) => [lines[0], lines[1].slice(0, Math.floor(lines[1].length / 2)), 'Warning: something printed on stdout', ...lines.slice(2)]
    let claudeEv = [], codexEv = [], cpEv = [], threw = null
    try {
      claudeEv = damage(fixture('turn.jsonl')).map(T.parseStreamLine)
      codexEv = C.parseCodexLines(damage(codexLines))
      cpEv = CP.parseCopilotLines(damage(cpLines), { sessionId: 'p' })
    } catch (e) { threw = String(e) }
    const good = (ev) => ev.filter((e) => e.type === 'malformed').length === 2 && ev.some((e) => e.type === 'result')
    ok('protocol.malformed.1 a record cut mid-JSON and a stray non-JSON line are each `malformed` — never a throw, never an unknown — and every intact record after them still parses to its result, for claude, codex and copilot alike',
      threw === null && good(claudeEv) && good(codexEv) && good(cpEv),
      JSON.stringify({ threw, claude: claudeEv.map((e) => e.type), codex: codexEv.map((e) => e.type), copilot: cpEv.map((e) => e.type) }))

    const { manager, spawns, events } = makeManager()
    manager.create({ id: 'mal', cwd: '/w' })
    manager.send('mal', 'hi')
    spawns[0].proc.emitLines(damage(fixture('turn.jsonl')))
    const snap = manager.get('mal')
    ok('protocol.malformed.2 the manager counts the damaged records on the snapshot and still ends the turn — a session is never left streaming by noise',
      snap.counters.malformed === 2 && snap.turns === 1 && snap.status === 'ready',
      JSON.stringify(snap))

    const cut = makeManager({ codex: { command: '/fake/bin/codex' } })
    cut.manager.create({ id: 'ic', cwd: '/w', backend: 'codex' })
    cut.manager.send('ic', 'ping')
    cut.spawns[0].proc.emitLines(codexLines.filter((l) => !l.includes('turn.completed')))
    cut.spawns[0].proc.exit(null, 'SIGKILL')
    const icSnap = cut.manager.get('ic')
    const icAbort = cut.events.find((e) => e.id === 'ic' && e.type === 'turn-aborted')
    ok('protocol.interrupted.1 a codex turn whose process dies before turn.completed is an ABORTED turn and an exited session — not the normal one-process-per-turn end that an exit 0 after the result is',
      icAbort !== undefined && icAbort.reason === 'exited' && icSnap.status === 'exited' && icSnap.turns === 0 && icSnap.exitSignal === 'SIGKILL',
      JSON.stringify({ icSnap, icAbort }))
  }

  {
    const F = M.fit
    const turns = [
      { role: 'user', text: 'fix the parser' },
      ...Array.from({ length: 8 }, (_, i) => ({ role: i % 2 === 0 ? 'assistant' : 'user', text: `step ${i}` })),
      { role: 'assistant', text: 'the token is sk-ant-api03-' + 'a'.repeat(90) + ' and I set it' }
    ]
    const h = F.backendHandoff({ from: 'claude', to: 'codex', title: 'Fix the parser', brief: 'no crash on empty input', criteria: ['tests pass'], cwd: '/w/lane', turns, changedFiles: ['src/parse.ts'] })
    ok('handoff.1 a cross-backend hand-off is a DRAFT of text only: the task, outcome and criteria, the folder, the changed files and the LAST six messages (the count left out said), secrets scrubbed by the outward gate with the count kept, and what does not carry named — tool history, grants, and each capability the target lacks in the registry\'s own words',
      /continuing a task another agent \(claude\)/.test(h.text) && /Outcome: no crash on empty input/.test(h.text) && /- tests pass/.test(h.text) && /- src\/parse\.ts/.test(h.text) &&
        /the last 6; 4 earlier messages left out/.test(h.text) && !/step 1\b/.test(h.text) && /step 7/.test(h.text) &&
        h.redacted === 1 && !/sk-ant-api03-a{20}/.test(h.text) &&
        h.dropped.some((d) => /tool calls/.test(d)) && h.dropped.some((d) => /permission grants/.test(d)) &&
        h.dropped.some((d) => d.includes(M.backends.BACKENDS.codex.reasons.noPrompt)) && h.dropped.some((d) => d.includes(M.backends.BACKENDS.codex.reasons.noInterrupt)) &&
        h.dropped.some((d) => /known cost/.test(d)),
      JSON.stringify(h))
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => f.n).join('; '))
    process.exit(1)
  }
})().catch((error) => {
  console.error('infrastructure failure', error)
  process.exit(1)
})
