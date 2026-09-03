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
