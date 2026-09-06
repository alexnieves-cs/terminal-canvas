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

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

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
  const rate = T.parseStreamLine(fixture('turn.jsonl').find((l) => l.includes('"rate_limit_event"')))
  const status = T.parseStreamLine('{"type":"system","subtype":"status","status":"requesting"}')
  const noType = T.parseStreamLine('{"subtype":"init"}')
  ok('transcript.unknown an unseen top-level type or system subtype is reported as unknown with its kind; a known-but-useless record is ignored with its kind; a missing type is malformed',
    unknownTop.type === 'unknown' && unknownTop.kind === 'telepathy' &&
      unknownSys.type === 'unknown' && unknownSys.kind === 'system/weather' &&
      rate.type === 'ignored' && rate.kind === 'rate_limit_event' &&
      status.type === 'ignored' && status.kind === 'system/status' &&
      noType.type === 'malformed',
    JSON.stringify({ unknownTop, unknownSys, rate, status, noType }))
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
    const approvalsSrc = src('main/approvals.ts')
    ok('grant.2 grants are never persisted: approvals.ts imports no filesystem and no store, and neither the layout schema, the layout store nor the transcript log mentions a grant',
      !/node:fs|writeFile|layout-store|JSON\.stringify/.test(approvalsSrc) && /grant/.test(approvalsSrc) &&
        !/grant/i.test(src('shared/layout-schema.ts')) && !/grant/i.test(src('main/layout-store.ts')) && !/grant/i.test(src('main/agent-transcript-log.ts')),
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

  /* M99 — registry.1–.2. A backend is a ROW; no consumer switches on the
     name. The grep is the check that makes a fourth backend cheap. */
  {
    const { readdirSync, statSync } = require('node:fs')
    const root = join(__dirname, '..', 'src')
    const files = []
    const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p) } }
    walk(root)
    const pattern = /backend\s*[!=]==\s*'(?:claude|codex)'|case '(?:claude|codex)':/
    const hits = files.filter((f) => pattern.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1)).sort()
    const expected = ['shared/layout-schema.ts']
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
    ok('dispatch.1 DISPATCH_PROMPT says the branch is the lane\'s and never to push, merge or open a PR; carryChatMarks writes no key for an absent dispatch and `dispatch: true` for a set one',
      typeof prompt === 'string' && /branch/.test(prompt) && /[Nn]ever push/.test(prompt) && /pull request/.test(prompt) &&
        M.chatPanel && Object.keys(M.chatPanel.carryChatMarks({})).length === 0 && M.chatPanel.carryChatMarks({ dispatch: true }).dispatch === true && Object.keys(M.chatPanel.carryChatMarks({ dispatch: true })).length === 1,
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
