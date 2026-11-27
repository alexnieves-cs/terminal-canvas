/* Verifies M701's local event log: the record format, the arithmetic the
   week's numbers come from, the writer's promises (off means nothing on disk;
   on means hashed ids and no content; bounded), the switch, the wiring, and
   the collector's pure parsers.
   Run with: npm run verify:event-log

   Plain node: shared/event-log.ts is pure, main/event-log.ts needs only
   node:fs and node:crypto, and the collector's parsers are plain CJS. */
const { buildSync } = require('esbuild')
const { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'out', 'verify', 'event-log.cjs')
buildSync({
  entryPoints: [join(__dirname, 'event-log-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: { '@shared': join(ROOT, 'src', 'shared'), '@renderer': join(ROOT, 'src', 'renderer') }
})
const E = require(OUT)
const W = require('./lib/week-parse.cjs')
const R = require('./event-report.cjs')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const read = (rel) => { try { return readFileSync(join(ROOT, rel), 'utf8') } catch { return '' } }
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

// A fixed local morning, so day names and day counts do not depend on when
// or where this runs.
const BASE = new Date(2026, 10, 2, 9, 0, 0).getTime()
const at = (s) => BASE + s * 1000
const rec = (s, body) => ({ v: 1, t: at(s), ...body })

// parse.1. Strict: a report counts only what it understands, and says how
// much it skipped rather than guessing.
{
  const text = [
    JSON.stringify(rec(0, { e: 'app', what: 'start', focused: true })),
    'not json',
    JSON.stringify({ v: 2, t: at(1), e: 'focus', on: false }),
    JSON.stringify(rec(2, { e: 'state', panel: 'p', agent: 'claude-code', state: 'thinking' })),
    JSON.stringify(rec(3, { e: 'mystery' })),
    JSON.stringify(rec(4, { e: 'panels', counts: { terminal: 2, 'Bad Key': 1 } })),
    JSON.stringify(rec(5, { e: 'chat', panel: 'p', what: 'ask', req: 'r', tool: 'Bash' })),
    ''
  ].join('\n')
  const { records, skipped } = E.parseEventLog(text)
  ok('parse.1 the parser keeps the two valid records and counts the five it cannot read: junk, a later version, an unknown state, an unknown kind, a bad counts key',
    records.length === 2 && skipped === 5 && records[0].e === 'app' && records[1].e === 'chat' && records[1].tool === 'Bash',
    JSON.stringify({ records, skipped }))
}

// tool.1. A tool's name is kept only when it is a built-in name. An MCP name
// says which services a person uses, so it is a class.
{
  const got = ['Bash', 'WebFetch', 'mcp__github__create_issue', 'mcp_x', 'rm -rf /', 'bash', 123, undefined].map(E.toolClass)
  ok('tool.1 toolClass keeps Bash and WebFetch, reduces both MCP spellings to mcp, and makes a command, a lower-case name, a number and nothing other',
    JSON.stringify(got) === JSON.stringify(['Bash', 'WebFetch', 'mcp', 'mcp', 'other', 'other', 'other', 'other']), JSON.stringify(got))
}

// quantile.1. Nearest rank, the one definition the report and the collector share.
{
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  ok('quantile.1 nearest rank: the median of 1..10 is 5 and its p90 is 9; one value is its own p90; an empty list has none; the collector agrees',
    E.quantile(ten, 0.5) === 5 && E.quantile(ten, 0.9) === 9 && E.quantile([7], 0.9) === 7 && E.quantile([], 0.5) === null &&
      W.quantile(ten, 0.5) === 5 && W.quantile(ten, 0.9) === 9 && W.quantile([], 0.5) === null)
}

// summary.1. A terminal's wait: from wants-you to the next state. An exit
// first is "ended", not an answer; one still waiting at quit is "open".
const terminalDay = [
  rec(0, { e: 'app', what: 'start', focused: true }),
  rec(10, { e: 'state', panel: 'a', agent: 'claude-code', state: 'wants-you' }),
  rec(40, { e: 'state', panel: 'a', agent: 'claude-code', state: 'busy' }),
  rec(50, { e: 'state', panel: 'b', agent: 'codex', state: 'wants-you' }),
  rec(55, { e: 'state', panel: 'b', agent: 'codex', state: 'exited' }),
  rec(60, { e: 'state', panel: 'c', agent: 'shell', state: 'wants-you' }),
  rec(100, { e: 'app', what: 'quit' })
]
{
  const s = E.summarizeEvents(terminalDay)
  ok('summary.1 a 30 s terminal wait is one answer; an exit before an answer is ended; a wait still open at quit is open; the session ran 100 s',
    s.needsYou.total === 3 && s.needsYou.answered.count === 1 && s.needsYou.answered.medianMs === 30_000 &&
      s.needsYou.ended === 1 && s.needsYou.open === 1 && s.sessions === 1 && s.runningMs === 100_000 && s.days === 1,
    JSON.stringify(s.needsYou))
}

// summary.2. A chat's ask pairs with its answer by request, not by order; a
// withdrawn request is dropped; a session grant is counted but never waited on.
{
  const s = E.summarizeEvents([
    rec(0, { e: 'app', what: 'start', focused: true }),
    rec(1, { e: 'chat', panel: 'x', what: 'ask', req: 'r1', tool: 'Bash' }),
    rec(2, { e: 'chat', panel: 'x', what: 'ask', req: 'r2', tool: 'Edit' }),
    rec(4, { e: 'chat', panel: 'x', what: 'dropped', req: 'r2' }),
    rec(6, { e: 'chat', panel: 'x', what: 'answer', req: 'r1', allow: true }),
    rec(7, { e: 'chat', panel: 'x', what: 'auto-allowed', tool: 'Read' }),
    rec(8, { e: 'chat', panel: 'x', what: 'answer', req: 'never-asked', allow: false }),
    rec(9, { e: 'app', what: 'quit' })
  ])
  ok('summary.2 a chat ask answered 5 s later is one answer; the other is dropped; an auto-allow is counted apart; an answer to nothing asked adds nothing; asks are counted by tool',
    s.needsYou.answered.count === 1 && s.needsYou.answered.medianMs === 5_000 && s.needsYou.dropped === 1 &&
      s.needsYou.total === 2 && s.needsYou.autoAllowed === 1 && s.needsYou.byTool.Bash === 1 && s.needsYou.byTool.Edit === 1,
    JSON.stringify(s.needsYou))
}

// summary.3. Focus. A blur is a switch to another app; an ask that arrives
// while away is the "away" bucket, and the share of waiting spent away is
// what the extension work would have to move.
{
  const s = E.summarizeEvents([
    rec(0, { e: 'app', what: 'start', focused: true }),
    rec(100, { e: 'focus', on: false }),
    rec(120, { e: 'state', panel: 'a', agent: 'claude-code', state: 'wants-you' }),
    rec(160, { e: 'focus', on: true }),
    rec(170, { e: 'state', panel: 'a', agent: 'claude-code', state: 'busy' }),
    rec(180, { e: 'focus', on: false }),
    rec(181, { e: 'focus', on: false }),
    rec(200, { e: 'app', what: 'quit' })
  ])
  const away = s.needsYou.answeredWhileAway
  ok('summary.3 two blurs are two switches (a repeated blur is not a third); 60 s plus 20 s away; the ask that came while away waited 50 s, 40 of them away, so 80% of waiting was away',
    s.switches === 2 && s.awayMs === 80_000 && s.focusedMs === 120_000 && away.count === 1 && away.medianMs === 50_000 &&
      s.needsYou.answeredWhileIn.count === 0 && Math.abs(s.needsYou.awayShareOfWait - 0.8) < 1e-9 &&
      Math.abs(s.switchesPerFocusedHour - 2 / (120 / 3600)) < 1e-9,
    JSON.stringify({ switches: s.switches, awayMs: s.awayMs, focusedMs: s.focusedMs, needsYou: s.needsYou }))
}

// summary.4. A crash: a start with no quit before it closes the earlier
// session at its last record, so the night is not counted as time in the app.
{
  const s = E.summarizeEvents([
    rec(0, { e: 'app', what: 'start', focused: true }),
    rec(30, { e: 'state', panel: 'a', agent: 'claude-code', state: 'busy' }),
    rec(8 * 3600, { e: 'app', what: 'start', focused: false }),
    rec(8 * 3600 + 10, { e: 'focus', on: true }),
    rec(8 * 3600 + 20, { e: 'app', what: 'quit' })
  ])
  ok('summary.4 two sessions; the first ends at its last record (30 s), the second runs 20 s and starts unfocused, so 50 s running, 10 s of it away',
    s.sessions === 2 && s.runningMs === 50_000 && s.awayMs === 10_000 && s.focusedMs === 40_000,
    JSON.stringify({ sessions: s.sessions, runningMs: s.runningMs, awayMs: s.awayMs }))
}

// summary.5 / summary.6. A chat's turn ending to the next message; panel counts.
{
  const s = E.summarizeEvents([
    rec(0, { e: 'app', what: 'log-on' }),
    rec(1, { e: 'panels', counts: { terminal: 3, chat: 1 } }),
    rec(2, { e: 'chat', panel: 'x', what: 'done' }),
    rec(14, { e: 'chat', panel: 'x', what: 'sent' }),
    rec(15, { e: 'chat', panel: 'y', what: 'sent' }),
    rec(20, { e: 'panels', counts: { terminal: 5 } }),
    rec(21, { e: 'panels', counts: { terminal: 1, note: 2 } })
  ])
  ok('summary.5 done then sent 12 s later is one next-instruction gap; a sent with no done before it adds nothing',
    s.nextInstruction.count === 1 && s.nextInstruction.medianMs === 12_000, JSON.stringify(s.nextInstruction))
  ok('summary.6 panels: the last save\'s counts, the peak of each kind and the most at once',
    JSON.stringify(s.panels.last) === JSON.stringify({ terminal: 1, note: 2 }) && s.panels.peak.terminal === 5 && s.panels.peak.chat === 1 &&
      s.panels.peak.note === 2 && s.panels.peakTotal === 5, JSON.stringify(s.panels))
}

// summary.7. Order. The quit path flushes synchronously while an earlier
// batch may still be landing, so the file can be out of time order.
{
  const shuffled = [terminalDay[3], terminalDay[0], terminalDay[6], terminalDay[2], terminalDay[5], terminalDay[1], terminalDay[4]]
  ok('summary.7 records out of time order summarise exactly as in order',
    JSON.stringify(E.summarizeEvents(shuffled)) === JSON.stringify(E.summarizeEvents(terminalDay)))
}

// The writer. A clock and a flush the test drives, a fixed salt.
const tmp = () => mkdtempSync(join(tmpdir(), 'tc-event-log-'))
const harness = (over = {}) => {
  const parent = tmp()
  const dir = join(parent, 'event-log')
  let t = BASE
  let enabled = over.enabled ?? true
  let focused = true
  const log = E.createEventLog({
    dir,
    enabled: () => enabled,
    focused: () => focused,
    now: () => t,
    salt: over.salt ?? '0123456789abcdef0123456789abcdef',
    schedule: () => {},
    ...(over.maxBytesPerDay ? { maxBytesPerDay: over.maxBytesPerDay } : {})
  })
  return {
    log, dir, parent,
    tick: (s) => { t += s * 1000 },
    setEnabled: (v) => { enabled = v },
    setFocused: (v) => { focused = v },
    text: () => existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort().map((n) => readFileSync(join(dir, n), 'utf8')).join('') : ''
  }
}

// writer.1. Off means off: no directory, no salt, no file, whatever happens.
{
  const h = harness({ enabled: false })
  h.log.app('start')
  h.log.focus(false)
  h.log.terminal({ panelId: 'p1', state: 'wants-you' }, 'claude-code')
  h.log.session({ id: 'c1', type: 'permission-request', requestId: 'r', toolName: 'Bash' })
  h.log.panels([{ kind: 'terminal' }])
  h.log.app('quit')
  h.log.flushSync()
  ok('writer.1 with the switch off, every kind of record and a quit flush leave nothing on disk: not even the folder',
    !existsSync(h.dir) && readdirSync(h.parent).length === 0, JSON.stringify(readdirSync(h.parent)))
}

// writer.2. On: one file per local day, hashed panels, a repeat is not a
// record, and none of a session event's content reaches the file.
{
  const h = harness()
  h.log.app('start')
  h.tick(1); h.log.terminal({ panelId: 'panel-raw-id-1', state: 'busy' }, 'claude-code')
  h.tick(1); h.log.terminal({ panelId: 'panel-raw-id-1', state: 'busy' }, 'claude-code')
  h.tick(1); h.log.terminal({ panelId: 'panel-raw-id-1', state: 'wants-you' }, 'claude-code')
  h.tick(1); h.log.terminal({ panelId: 'panel-raw-id-2', state: 'idle' }, undefined)
  h.tick(1); h.log.terminal({ panelId: 'panel-raw-id-2', state: 'dancing' }, undefined)
  h.tick(1); h.log.session({ id: 'chat-raw-id', type: 'permission-request', requestId: 'req-raw-1', toolName: 'Bash', input: { command: 'cat ~/secret/token.txt' }, description: '/Users/alex/work' })
  h.tick(1); h.log.session({ id: 'chat-raw-id', type: 'turn', turn: { id: 'u1', role: 'user', blocks: [{ type: 'text', text: 'deploy with key sk-live-123' }] } })
  h.log.flush()
  const text = h.text()
  const { records, skipped } = E.parseEventLog(text)
  const files = readdirSync(h.dir).filter((n) => n.endsWith('.jsonl'))
  const states = records.filter((r) => r.e === 'state')
  const leaks = ['panel-raw-id', 'chat-raw-id', 'req-raw-1', 'secret', 'token', '/Users', 'sk-live', 'deploy', 'cat ']
    .filter((needle) => text.includes(needle))
  ok('writer.2 one day file named for the local date; three state changes from five calls (a repeat and an unknown state are not records); a shell is shell; ids are 12-hex hashes; no raw id, path, command or prompt text is in the file',
    files.length === 1 && files[0] === '2026-11-02.jsonl' && skipped === 0 && states.length === 3 &&
      states[2].agent === 'shell' && states.every((r) => /^[0-9a-f]{12}$/.test(r.panel)) && leaks.length === 0 &&
      records[0].e === 'app' && records[0].what === 'start' && records[0].focused === true,
    JSON.stringify({ files, states, leaks }))
}

// writer.3. The switch is read at every record. Off drops what was buffered
// and forgets per-panel memory; on again opens with log-on and the focus.
{
  const h = harness()
  h.log.app('start')
  h.log.terminal({ panelId: 'p', state: 'busy' }, 'codex')
  h.setEnabled(false)
  h.log.terminal({ panelId: 'p', state: 'idle' }, 'codex')
  h.log.flush()
  const afterOff = h.text()
  h.setEnabled(true)
  h.setFocused(false)
  h.tick(5)
  h.log.terminal({ panelId: 'p', state: 'idle' }, 'codex')
  h.log.flush()
  const { records } = E.parseEventLog(h.text())
  ok('writer.3 turning the switch off drops the unflushed batch; turning it on writes log-on with the app unfocused, then the next state (not forgotten as a repeat)',
    afterOff === '' && records.length === 2 && records[0].e === 'app' && records[0].what === 'log-on' && records[0].focused === false &&
      records[1].e === 'state' && records[1].state === 'idle', JSON.stringify({ afterOff, records }))
}

// writer.4. Chats: an MCP tool is a class; a user turn is "sent" once, never
// while queued; an `auto` event's numeric `turn` is not mistaken for a turn.
{
  const h = harness()
  h.log.app('start')
  h.log.session({ id: 'c', type: 'permission-request', requestId: 'r', toolName: 'mcp__github__create_issue' })
  h.log.session({ id: 'c', type: 'permission-answered', requestId: 'r', allow: true })
  h.log.session({ id: 'c', type: 'permission-auto-allowed', requestId: 'r2', toolName: 'Read' })
  h.log.session({ id: 'c', type: 'turn', turn: { id: 'q1', role: 'user', delivery: 'queued' } })
  h.log.session({ id: 'c', type: 'turn', turn: { id: 'q1', role: 'user' } })
  h.log.session({ id: 'c', type: 'turn', turn: { id: 'q1', role: 'user' } })
  h.log.session({ id: 'c', type: 'turn', turn: { id: 'a1', role: 'assistant' } })
  h.log.session({ id: 'c', type: 'auto', turn: 3 })
  h.log.session({ id: 'c', type: 'result' })
  h.log.session({ id: 'c', type: 'meter' })
  h.log.flush()
  const chat = E.parseEventLog(h.text()).records.filter((r) => r.e === 'chat')
  const whats = chat.map((r) => r.what).join(',')
  ok('writer.4 ask (tool mcp), answer, auto-allowed, one sent for a turn announced queued then twice delivered, done; nothing for the assistant turn, auto or meter; the ask and its answer share a hash',
    whats === 'ask,answer,auto-allowed,sent,done' && chat[0].tool === 'mcp' && chat[0].req === chat[1].req && chat[1].allow === true,
    JSON.stringify(chat))
}

// writer.5. Panel counts: kinds only, an absent kind is a terminal, a
// repeat of the same counts is not a record.
{
  const h = harness()
  h.log.app('start')
  h.log.panels([{ cwd: '/Users/alex/private', title: 'secret plan' }, { kind: 'chat', cwd: '/x' }, { kind: 'Weird Kind' }])
  h.log.panels([{ kind: 'chat' }, { kind: 'other' }, {}])
  h.log.panels([{ kind: 'chat' }, {}, {}])
  h.log.flush()
  const text = h.text()
  const panels = E.parseEventLog(text).records.filter((r) => r.e === 'panels')
  ok('writer.5 two panel records from three saves (the second has the same counts as the first); an absent kind counts as terminal; no cwd or title reaches the file',
    panels.length === 2 && JSON.stringify(panels[0].counts) === JSON.stringify({ terminal: 1, chat: 1, other: 1 }) &&
      JSON.stringify(panels[1].counts) === JSON.stringify({ chat: 1, terminal: 2 }) && !text.includes('private') && !text.includes('secret'),
    JSON.stringify(panels))
}

// writer.6. Bounded: a day's file stops at its cap with one cap record.
{
  const h = harness({ maxBytesPerDay: 600 })
  h.log.app('start')
  for (let i = 0; i < 40; i++) { h.tick(1); h.log.focus(i % 2 === 0) }
  h.log.flush()
  for (let i = 0; i < 5; i++) { h.tick(1); h.log.focus(i % 2 === 0) }
  h.log.flush()
  const file = join(h.dir, '2026-11-02.jsonl')
  const { records } = E.parseEventLog(readFileSync(file, 'utf8'))
  const caps = records.filter((r) => r.e === 'cap').length
  ok('writer.6 a 600-byte day cap: the file stays near the cap, holds exactly one cap record as its last line, and a later batch adds nothing',
    statSync(file).size <= 700 && caps === 1 && records[records.length - 1].e === 'cap' && records.length < 20,
    JSON.stringify({ size: statSync(file).size, caps, count: records.length }))
}

// writer.7. Retention by the file's date name, at the first write of a launch;
// a file that is not a day log is never touched.
{
  const parent = tmp()
  const dir = join(parent, 'event-log')
  mkdirSync(dir)
  writeFileSync(join(dir, '2026-09-01.jsonl'), '')
  writeFileSync(join(dir, '2026-10-20.jsonl'), '')
  writeFileSync(join(dir, 'notes.txt'), 'mine')
  const log = E.createEventLog({ dir, enabled: () => true, focused: () => true, now: () => BASE, salt: 'f'.repeat(32), schedule: () => {} })
  log.app('start')
  log.flush()
  const names = readdirSync(dir).sort()
  ok('writer.7 after the first write, the 62-day-old file is gone, the 13-day-old one and a non-log file stay, and today\'s exists',
    JSON.stringify(names) === JSON.stringify(['2026-10-20.jsonl', '2026-11-02.jsonl', 'notes.txt']), JSON.stringify(names))
}

// writer.8. The salt: made once beside the logs, private, and what makes a
// hash stable across launches and meaningless without it.
{
  const parent = tmp()
  const dir = join(parent, 'event-log')
  const mk = () => E.createEventLog({ dir, enabled: () => true, focused: () => true, now: () => BASE, schedule: () => {} })
  const a = mk()
  a.terminal({ panelId: 'same', state: 'busy' }, 'claude-code')
  a.flush()
  const salt = readFileSync(join(dir, '.salt'), 'utf8').trim()
  const mode = statSync(join(dir, '.salt')).mode & 0o777
  const b = mk()
  b.terminal({ panelId: 'same', state: 'busy' }, 'claude-code')
  b.flush()
  const states = E.parseEventLog(readFileSync(join(dir, '2026-11-02.jsonl'), 'utf8')).records.filter((r) => r.e === 'state')
  const other = harness({ salt: '1'.repeat(32) })
  other.log.terminal({ panelId: 'same', state: 'busy' }, 'claude-code')
  other.log.flush()
  const otherHash = E.parseEventLog(other.text()).records.find((r) => r.e === 'state').panel
  ok('writer.8 the salt is 32 hex in a 0600 file; a second launch reuses it, so the same panel hashes the same; another salt hashes it differently',
    /^[0-9a-f]{32}$/.test(salt) && (process.platform === 'win32' || mode === 0o600) && states.length === 2 &&
      states[0].panel === states[1].panel && otherHash !== states[0].panel, JSON.stringify({ salt: salt.length, mode: mode.toString(8), states, otherHash }))
}

// setting.1. The switch: off by default, never writable by a plan, and its
// description names what is written and what never is.
{
  const def = E.settingDef('telemetry.localEventLog')
  const d = def ? def.description : ''
  ok('setting.1 telemetry.localEventLog is a boolean, off by default, in the telemetry category, not planWritable, and says it never leaves this Mac and that commands, output, prompts, paths and titles are never written',
    def && def.type === 'boolean' && def.default === false && def.category === E.TELEMETRY_CATEGORY && !def.planWritable &&
      /never leaves this Mac/.test(d) && /commands, output, prompts, paths and titles are never written/.test(d) && /30 days/.test(d),
    JSON.stringify(def))
}

// wiring.1. Read at use, and in the right places. Source text, because the
// wiring is Electron's and this tier has none.
{
  const index = stripComments(read('src/main/index.ts'))
  const gate = index.indexOf('if (!hasInstanceLock) return')
  const start = index.indexOf("state.eventLog?.app('start')")
  const load = index.indexOf('stores.layoutStore.load()')
  const quitGate = index.indexOf('if (!hasInstanceLock) return', index.indexOf("app.on('before-quit'"))
  const quit = index.indexOf("state.eventLog?.app('quit')")
  const flushAt = index.indexOf('state.eventLog?.flushSync()')
  const runtime = stripComments(read('src/main/bootstrap/agent-runtime.ts'))
  const ipc = stripComments(read('src/main/ipc.ts'))
  const save = ipc.slice(ipc.indexOf('IPC.LAYOUT_SAVE'), ipc.indexOf('IPC.SESSION_BACKEND'))
  const wiring = stripComments(read('src/main/bootstrap/event-log-wiring.ts'))
  const hooked = /state\.eventLog\?\.terminal\(update, agent\)/.test(index) && /layoutSaved: \(panels\) => state\.eventLog\?\.panels\(panels\)/.test(index)
  ok('wiring.1 start is written after the instance gate and the store load; quit and its sync flush after the quit gate; the runtime fan-out, the agent-state hook and layout:save each reach the log; the switch is read per record',
    gate !== -1 && load > gate && start > load && quitGate !== -1 && quit > quitGate && flushAt > quit && hooked &&
      /state\.eventLog\?\.session\(event\)/.test(runtime) && /presence\.layoutSaved\?\.\(/.test(save) &&
      /enabled: \(\) => stores\.layoutStore\.getSetting\('telemetry\.localEventLog'\) === true/.test(wiring),
    JSON.stringify({ gate, load, start, quitGate, quit, flushAt, hooked }))
}

// wiring.2. Never sent anywhere: neither module imports a network module or
// calls fetch, and neither does the collector or the report.
{
  const net = /['"](node:)?(https?|net|tls|dgram|http2)['"]|\bfetch\(|XMLHttpRequest|WebSocket/
  const files = ['src/shared/event-log.ts', 'src/main/event-log.ts', 'src/main/bootstrap/event-log-wiring.ts', 'scripts/collect-week.cjs', 'scripts/event-report.cjs', 'scripts/lib/week-parse.cjs']
  const offenders = files.filter((f) => read(f) === '' || net.test(stripComments(read(f))))
  ok('wiring.2 the log, its wiring, the report and the collector exist and none imports http, https, net, tls or calls fetch', offenders.length === 0, JSON.stringify(offenders))
}

// week.1 / week.2. Shell history to first words.
{
  const words = ['FOO=1 BAR=2 sudo /usr/bin/git status', 'echo $SECRET_TOKEN', '"quoted thing', '  ', 'time npm test', './node_modules/.bin/vite build'].map(W.firstWord)
  ok('week.1 firstWord skips assignments and sudo/time, reduces a path to its program, keeps no arguments, and makes a quoted start other',
    JSON.stringify(words) === JSON.stringify(['git', 'echo', 'other', null, 'npm', 'vite']), JSON.stringify(words))
  const zsh = [': 1793600000:0;git status', ': 1793600060:0;npm run build \\', '  --watch', ': 1793600120:2;code .', ''].join('\n')
  const bash = ['#1793600200', 'ls -la', 'pwd'].join('\n')
  const entries = [...W.parseShellHistory(zsh), ...W.parseShellHistory(bash)]
  const counted = W.countWords(entries, 1793600050 * 1000)
  ok('week.2 zsh extended lines and a continued command are one entry each; a bash #stamp dates the next line only; the count keeps entries since the cut and reports the undated one',
    entries.length === 5 && entries[1].word === 'npm' && entries[3].t === 1793600200 * 1000 && entries[4].t === null &&
      counted.total === 3 && counted.undated === 1 && counted.top.map((w) => w.word).join(',') === 'code,ls,npm',
    JSON.stringify({ entries, counted }))
}

// week.3. The collector's copy of toolClass agrees with the log's.
{
  const sample = ['Bash', 'Edit', 'TodoWrite', 'mcp__a__b', 'mcp_x', 'x', 'Some Tool', '', null, 'A'.repeat(30)]
  const disagree = sample.filter((s) => W.toolClass(s) !== E.toolClass(s))
  ok('week.3 the collector\'s toolClass and the event log\'s agree on every sample', disagree.length === 0, JSON.stringify(disagree))
}

// week.4. A Claude Code transcript to counts. The record shape is the CLI's
// (verify:usage's fixture names the fields); tool results filed under the
// user role are not prompts.
{
  const line = (o) => JSON.stringify(o)
  const ts = (s) => new Date(BASE + s * 1000).toISOString()
  const text = [
    line({ type: 'user', timestamp: ts(-100), cwd: '/work/app', message: { content: 'old prompt' } }),
    line({ type: 'user', timestamp: ts(0), cwd: '/work/app/src', message: { content: 'fix the build' } }),
    line({ type: 'assistant', timestamp: ts(10), message: { content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }, { type: 'tool_use', name: 'mcp__gh__pr' }] } }),
    line({ type: 'user', timestamp: ts(12), message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'output' }] } }),
    line({ type: 'assistant', timestamp: ts(20), message: { content: [{ type: 'text', text: 'done' }] } }),
    line({ type: 'assistant', timestamp: ts(21), isSidechain: true, message: { content: [] } }),
    line({ type: 'user', timestamp: ts(80), message: { content: [{ type: 'text', text: 'now ship it' }] } }),
    line({ type: 'summary', summary: 'x' }),
    'garbage'
  ].join('\n')
  let asked = null
  const s = W.summarizeTranscript(text, BASE - 1000, (cwd) => { asked = cwd; return cwd.startsWith('/work/app') })
  ok('week.4 two prompts since the cut (a tool result is not one), two replies, one subagent turn apart, Bash and mcp counted, one 60 s gap to the next prompt, the folder answered once and kept as a yes',
    s.prompts === 2 && s.assistantTurns === 2 && s.sidechainTurns === 1 && s.tools.Bash === 1 && s.tools.mcp === 1 &&
      JSON.stringify(s.gapsMs) === JSON.stringify([60_000]) && s.inCanvasFolder === true && asked === '/work/app/src' &&
      !JSON.stringify(s).includes('fix the build') && !JSON.stringify(s).includes('npm test'),
    JSON.stringify(s))
}

// week.5 / week.6. The layout file and git numstat.
{
  const k = W.layoutKinds({ workspaces: [{ panels: [{ cwd: '~/a' }, { kind: 'terminal', cwd: '~/b' }, { kind: 'chat', cwd: '~/a' }] }, { panels: [{ kind: 'note' }] }] })
  ok('week.5 layoutKinds counts across workspaces, an absent kind as terminal, and collects the distinct folders',
    k.workspaces === 2 && JSON.stringify(k.total) === JSON.stringify({ terminal: 2, chat: 1, note: 1 }) && k.cwds.size === 2, JSON.stringify({ ...k, cwds: [...k.cwds] }))
  const g = W.parseGitNumstat(['@1793600000', '', '10\t2\tsrc/a.ts', '-\t-\tlogo.png', '@1793686400', '', '1\t0\tREADME.md', ''].join('\n'))
  ok('week.6 parseGitNumstat: two commits on two days, three files, 11 added and 2 removed (a binary file has no lines)',
    g.commits === 2 && g.files === 3 && g.added === 11 && g.removed === 2 && g.activeDays === 2, JSON.stringify(g))
}

// report.1. The report reads the same summary and prints readable words.
{
  const text = R.report(E, E.summarizeEvents(terminalDay), { dir: '/tmp/x', files: 1, skipped: 0 })
  ok('report.1 the printed report states the answer median in seconds, the ended and open counts, and no em dash',
    /Time to answer: median 30 s, p90 30 s/.test(text) && /panel ended first 1/.test(text) && /still waiting at close 1/.test(text) && !/—/.test(text), text)
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
