/* Verifies M96's verb table, plan and outward gate, and M97's auto modes as
   plans. Run with: npm run verify:verbs

   Plain node. Every check here guards a property that has no runtime symptom
   when it breaks: an action reachable through no declared verb, a plan that
   raises its own ceiling, a token leaving through a "read", a carriage
   return typed into a shell, a destructive step run without the confirmation
   the table said it owed. The closure check is the one that pays long-term:
   a member a later milestone appends to PaletteActions fails this build until
   it is either a verb or an excluded name with a reason. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync, readFileSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')

const OUT = join(__dirname, '..', 'out', 'verify', 'verbs.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'verbs-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const M = require(OUT)
const V = M.verbs, P = M.plan, O = M.outward, A = M.auto, S = M.settings

const { ok, results } = require('./lib/checks.cjs').createChecks()

/* The facts every plan below is built against: a shell, a claude terminal, a
   chat, a review node, a file — the kinds a `type` must tell apart. */
const FACTS = {
  panels: [
    { id: 'sh1', kind: 'terminal', state: 'idle' },
    { id: 'ag1', kind: 'terminal', agent: 'claude-code', state: 'busy' },
    { id: 'ch1', kind: 'chat', state: 'idle' },
    { id: 'rv1', kind: 'review', state: 'idle' },
    { id: 'f1', kind: 'file', state: 'idle' }
  ],
  presets: [{ id: 'shell' }, { id: 'claude' }],
  templates: [{ id: 't1' }],
  worktrees: [{ id: 'w1' }]
}

;(async () => {
  ok('creation.registry.1 one registry describes every creation pill and its executable four doors',
    Array.isArray(V.CREATABLE_OBJECTS) && ['terminal', 'agent', 'note', 'image', 'workflow', 'browser', 'checklist'].every((id) =>
      V.CREATABLE_OBJECTS.some((entry) => entry.id === id && typeof entry.create === 'function' && entry.icon && V.V9_DOORS[entry.verb])))
  // closure.1 — THE one that matters long-term. The PaletteActions interface
  // (commands.ts) is the authority for what the app can do; every member is
  // either mapped by a verb or named on the excluded list with a reason.
  {
    const src = readFileSync(join(__dirname, '..', 'src', 'renderer', 'palette', 'commands.ts'), 'utf8')
    const start = src.indexOf('export interface PaletteActions {')
    const body = src.slice(start, src.indexOf('\n}\n', start))
    const members = [...body.matchAll(/^  ([a-zA-Z]+)\(/gm)].map((m) => m[1])
    const mapped = new Set(V.VERBS.flatMap((v) => v.actions))
    const excluded = new Set(Object.keys(V.EXCLUDED_ACTIONS))
    const unaccounted = members.filter((m) => !mapped.has(m) && !excluded.has(m))
    const both = members.filter((m) => mapped.has(m) && excluded.has(m))
    const phantom = [...mapped, ...excluded].filter((m) => !members.includes(m))
    ok('closure.1 every PaletteActions member is either mapped by a verb or on the excluded list with a reason — never both, never neither — and neither list names a member that does not exist',
      members.length > 40 && unaccounted.length === 0 && both.length === 0 && phantom.length === 0 &&
        Object.values(V.EXCLUDED_ACTIONS).every((r) => typeof r === 'string' && r.length > 10),
      JSON.stringify({ members: members.length, unaccounted, both, phantom }))
  }

  // table.1 — the destructive flag is DATA on the table, and the five the
  // spec names carry it; a verb's refusals are sentences with a fix.
  {
    const d = (id) => V.verbById(id)?.destructive === true
    // There is deliberately NO `kill`: a process's lifetime is its panel's (the
    // two-lifetimes rule) and pty.kill keeps exactly two callers; `close` is
    // the dispose and `interrupt` is the stop. Asserted absent, so a later
    // hand does not add a third pty.kill caller through a verb.
    ok('table.1 close, reset-canvas, discard and remove-worktree are flagged destructive; focus, type, submit, send, interrupt, read and set-setting are not; there is no kill verb; every verb has a label and args',
      d('close') && V.verbById('kill') === undefined && !d('interrupt') && d('reset-canvas') && d('discard') && d('remove-worktree') &&
        !d('focus') && !d('type') && !d('submit') && !d('send') && !d('read') && !d('set-setting') &&
        V.VERBS.every((v) => typeof v.label === 'string' && Array.isArray(v.args) && typeof v.destructive === 'boolean'),
      JSON.stringify(V.VERBS.map((v) => `${v.id}${v.destructive ? '!' : ''}`)))
  }

  // plan.1 — build, refuse by name, and the confirmation step a destructive
  // verb owes. `parsePlanLine` is the palette's typed line.
  {
    const good = P.buildPlan(P.parsePlanLine('focus ch1; send ch1 hello there'), FACTS)
    const unknown = P.buildPlan(P.parsePlanLine('frobnicate ch1'), FACTS)
    const missing = P.buildPlan(P.parsePlanLine('send ch1'), FACTS)
    const noPanel = P.buildPlan(P.parsePlanLine('focus zz9'), FACTS)
    const destructive = P.buildPlan(P.parsePlanLine('close ch1'), FACTS)
    ok('plan.1 a plan of two steps binds its arguments in order; an unknown verb, a missing argument and an unknown panel refuse BY NAME with a fix; a destructive step is given a confirmation step naming the verb and its target',
      good.kind === 'plan' && good.plan.steps.length === 2 && good.plan.steps[1].args.text === 'hello there' && good.plan.steps.every((s) => s.confirm === undefined) &&
        unknown.kind === 'refused' && /frobnicate/.test(unknown.reason) && typeof unknown.fix === 'string' &&
        missing.kind === 'refused' && /text/.test(missing.reason) &&
        noPanel.kind === 'refused' && /zz9/.test(noPanel.reason) &&
        destructive.kind === 'plan' && destructive.plan.steps[0].confirm !== undefined && /close/.test(destructive.plan.steps[0].confirm.reason) && /ch1/.test(destructive.plan.steps[0].confirm.reason),
      JSON.stringify({ good, unknown, missing, noPanel, destructive }))
  }

  // destructive.1 — the runtime will not skip the confirmation: an
  // unacknowledged destructive step executes nothing and refuses by name;
  // acknowledged, it runs; the non-destructive step before it ran either way.
  {
    const built = P.buildPlan(P.parsePlanLine('focus ch1; close ch1'), FACTS)
    const ran = []
    const exec = (step) => { ran.push(step.verb); return { kind: 'ran' } }
    const refused = await P.runPlan(built.plan, exec, { acknowledged: false })
    const ranBefore = ran.slice()
    const done = await P.runPlan(built.plan, exec, { acknowledged: true })
    ok('destructive.1 a destructive step without its acknowledged confirmation is refused by name and executes nothing, the step before it having run; acknowledged, the whole plan runs and reports each step in the state vocabulary',
      ranBefore.join(',') === 'focus' && refused.steps[1].kind === 'refused' && /confirm/.test(refused.steps[1].reason) &&
        ran.join(',') === 'focus,focus,close' && done.steps.every((s) => s.kind === 'ran') && typeof done.summary === 'string' && /2 steps/.test(done.summary),
      JSON.stringify({ ranBefore, ran, refused, done }))
  }

  // type.1 — control characters never reach a panel through `type`; Enter is
  // `submit`, its own verb. A CR typed into a shell runs whatever preceded it.
  {
    const stripped = V.stripControl('ls -la\r\n\x03\x1b[Arm -rf /\x7f')
    const typed = P.buildPlan(P.parsePlanLine('type ag1 echo hi\r'), FACTS)
    const submit = V.verbById('submit')
    ok('type.1 stripControl removes every C0 byte and DEL (CR, LF, ETX, ESC), a typed step carries the stripped text, and submit is a separate verb that takes only a panel',
      stripped === 'ls -la[Arm -rf /' && typed.kind === 'plan' && typed.plan.steps[0].args.text === 'echo hi' &&
        submit !== undefined && submit.args.length === 1 && submit.args[0].kind === 'panel' && !submit.destructive,
      JSON.stringify({ stripped, typed }))
  }

  // type.2 — WHO may be typed into is decided by the panel's kind through
  // AGENT_CAPABILITIES' keys, never by looking at the command string.
  {
    const shell = P.buildPlan(P.parsePlanLine('type sh1 hello'), FACTS)
    const agent = P.buildPlan(P.parsePlanLine('type ag1 hello'), FACTS)
    const chat = P.buildPlan(P.parsePlanLine('type ch1 hello'), FACTS)
    const review = P.buildPlan(P.parsePlanLine('type rv1 hello'), FACTS)
    const file = P.buildPlan(P.parsePlanLine('type f1 hello'), FACTS)
    ok('type.2 a plain shell, a review node and a file panel refuse `type` by name (the fix names an agent panel); a claude terminal and a chat accept it',
      shell.kind === 'refused' && /sh1/.test(shell.reason) && /agent/.test(shell.fix) &&
        review.kind === 'refused' && file.kind === 'refused' &&
        agent.kind === 'plan' && chat.kind === 'plan',
      JSON.stringify({ shell, agent: agent.kind, chat: chat.kind, review: review.kind, file: file.kind }))
  }

  // settings.1 — the closed list a plan may write. A ceiling a plan can raise
  // is no ceiling; a credential-adjacent key is not a plan's to touch.
  {
    const budget = P.buildPlan(P.parsePlanLine('set-setting agents.budgetUsd 1000'), FACTS)
    const concurrent = P.buildPlan(P.parsePlanLine('set-setting agents.maxConcurrent 99'), FACTS)
    const vault = P.buildPlan(P.parsePlanLine('set-setting vault.root /'), FACTS)
    const unknown = P.buildPlan(P.parsePlanLine('set-setting nope.key 1'), FACTS)
    const theme = P.buildPlan(P.parsePlanLine('set-setting appearance.theme dark'), FACTS)
    const writable = S.SETTINGS.filter((d) => d.planWritable === true).map((d) => d.id)
    ok('settings.1 agents.budgetUsd, agents.maxConcurrent and vault.root refuse by name; an unknown key refuses; appearance.theme is writable; the writable list is short and holds no agents.* or vault.* key',
      budget.kind === 'refused' && /agents\.budgetUsd/.test(budget.reason) && concurrent.kind === 'refused' && vault.kind === 'refused' && unknown.kind === 'refused' &&
        theme.kind === 'plan' && theme.plan.steps[0].args.value === 'dark' &&
        writable.length > 3 && writable.length < 15 && writable.every((id) => !id.startsWith('agents.') && !id.startsWith('vault.') && !id.startsWith('session.')),
      JSON.stringify({ budget: budget.reason, writable }))
  }

  // gate.1 — pane content is redacted before it leaves the app. A token is
  // planted in a REAL scrollback log and read back through the outward gate.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc verbs gate '))
    try {
      const log = M.scrollback.createScrollbackLog({ dir })
      const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      await log.append('p1', `$ cat .env\nGITHUB_TOKEN=${token}\n$ echo done\n`)
      const tail = await log.tail('p1', 50)
      const handed = O.outward(tail.join('\n'), 'panel p1')
      ok('gate.1 a GitHub token planted in a panel\'s scrollback does not appear in what the outward gate hands back; the count says one; the note names the source and the count',
        !handed.text.includes(token) && /redacted github token/.test(handed.text) && handed.redacted === 1 &&
          /panel p1/.test(handed.note) && /1 /.test(handed.note) && handed.text.includes('echo done'),
        JSON.stringify(handed))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // gate.2 — the gate is the only door OUT for a READER of pane/chat text.
  // `redactSecrets` may be called by the gate, by the memory store's write
  // scrub (a store, not a reader) and — as of M112 — by `main/telemetry.ts`'s
  // `scrubEvent`, a third caller on a genuinely different data path: an
  // exception VALUE the Sentry SDK is about to hand to a third-party service,
  // never a panel's tail or a chat's last answer. Widening this allowlist by
  // NAME (rather than loosening the assertion to "at least these two") is the
  // point — a future caller still has to be added here on purpose, the same
  // way EXCLUDED_ACTIONS names a refusal rather than defaulting to open.
  {
    const { readdirSync, statSync } = require('node:fs')
    const root = join(__dirname, '..', 'src')
    const files = []
    const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p) } }
    walk(root)
    const callers = files.filter((f) => /redactSecrets\(/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''))).map((f) => f.slice(root.length + 1)).sort()
    const readers = files.filter((f) => /scrollback\.tail\(|lastAssistantText\(/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1)).sort()
    const unguarded = readers.filter((f) => !/outward\(/.test(readFileSync(join(root, f), 'utf8')) && !/chat-store\.ts$|Canvas\.tsx$|scrollback-store\.ts$|ScrollbackPanel|TerminalPanel|useCanvasTestHooks|search|ipc\.ts$|index\.ts$/.test(f))
    // M189 and M190 add the fifth and SIXTH callers by name, which is what
    // this allowlist is for. `shared/portable.ts` scrubs every string that
    // travels in an export and reports the count on the record; it cannot go
    // through `outward`, which answers one text and one note, because an
    // export is a structure scrubbed field by field whose count is part of the
    // file. `shared/feedback.ts` scrubs a draft whose count is stated IN the
    // draft, so the person can see what was taken out before they send it.
    // M251 adds the SEVENTH: `shared/pack.ts` scrubs a pack's workflows,
    // prompts and presets field by field for the same reason portable.ts
    // does — the count is part of the file.
    ok('gate.2 redactSecrets has exactly seven callers (the outward gate, the memory store\'s write scrub, telemetry\'s event scrubber, M122\'s panel search — pane content leaving through main — M189\'s portable export, which scrubs field by field and reports its count, M190\'s feedback draft, whose count is stated in the draft itself, and M251\'s pack export, scrubbed and counted like the portable file), and every module that reads a panel\'s tail or a chat\'s last answer for another reader calls outward',
      JSON.stringify(callers) === JSON.stringify(['main/memory-store.ts', 'main/panel-search.ts', 'main/telemetry.ts', 'shared/feedback.ts', 'shared/outward.ts', 'shared/pack.ts', 'shared/portable.ts', 'shared/redact.ts']) && unguarded.length === 0,
      JSON.stringify({ callers, readers, unguarded }))
  }

  // routine.1 (M101) — the save-time refusal against M96's table: a
  // destructive verb in the plan line, a teammate that may not be
  // scheduled, an interval under the floor, an empty prompt — each by name.
  {
    const R = M.routines
    const has = R && typeof R.routineRefusal === 'function'
    const ada = { name: 'ada', scheduling: true }
    const base = { id: 'r', name: 'nightly', teammateId: 't1', everyMs: 600000, prompt: 'summarise the day', paused: false }
    const okR = has ? R.routineRefusal(base, ada) : 'no module'
    const destructive = has ? R.routineRefusal({ ...base, plan: 'close ch1' }, ada) : 'no module'
    const benign = has ? R.routineRefusal({ ...base, plan: 'focus ch1' }, ada) : 'no module'
    const unknownVerb = has ? R.routineRefusal({ ...base, plan: 'frobnicate ch1' }, ada) : 'no module'
    const noSchedule = has ? R.routineRefusal(base, { name: 'bo', scheduling: false }) : 'no module'
    const tooFast = has ? R.routineRefusal({ ...base, everyMs: 1000 }, ada) : 'no module'
    const empty = has ? R.routineRefusal({ ...base, prompt: '  ' }, ada) : 'no module'
    const missed = has ? [R.missedAt({ ...base, lastRun: { at: 100, outcome: 'started' } }, 100 + 600000 + 1), R.missedAt({ ...base, lastRun: { at: 100, outcome: 'started' } }, 100 + 10), R.missedAt({ ...base, paused: true, lastRun: { at: 100, outcome: 'started' } }, 1e9), R.missedAt(base, 1e9)] : []
    ok('routine.1 a plain routine saves; a destructive verb in its plan line is refused naming the verb; a benign verb line passes; an unknown verb is refused as itself; a teammate without scheduling is refused naming it; an interval under the floor and an empty prompt are refused by name; missedAt answers the due tick that fell in the past, null when on time, paused, or never run',
      has && okR === null && /close/.test(destructive) && /destructive/.test(destructive) && benign === null && /frobnicate/.test(unknownVerb) &&
        /bo/.test(noSchedule) && /schedul/.test(noSchedule) && /minute/.test(tooFast) && /prompt/.test(empty) &&
        missed[0] === 100 + 600000 && missed[1] === null && missed[2] === null && missed[3] === null && R.ROUTINE_PROMPT.includes('irreversible actions stay behind confirmation'),
      JSON.stringify({ okR, destructive, benign, unknownVerb, noSchedule, tooFast, empty, missed }))
  }

  // gate.3 (M103) — the browser pane's read is a reader too, and the only
  // module that evaluates script in a guest. `executeJavaScript(` appears in
  // exactly one source file, and that file calls `outward(` — so a second
  // reader of a page, added later without the gate, fails this build rather
  // than handing a page's text out unscrubbed with no symptom at all.
  {
    const { readdirSync, statSync } = require('node:fs')
    const root = join(__dirname, '..', 'src')
    const files = []
    const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p) } }
    walk(root)
    const strip = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    const evaluators = files.filter((f) => /executeJavaScript\(/.test(strip(readFileSync(f, 'utf8')))).map((f) => f.slice(root.length + 1)).sort()
    let reader = ''
    try { reader = strip(readFileSync(join(root, 'main', 'browser-read.ts'), 'utf8')) } catch {}
    ok('gate.3 main/browser-read.ts is the only source file that evaluates script in a guest page, and it passes what it reads through outward',
      JSON.stringify(evaluators) === JSON.stringify(['main/browser-read.ts']) && /outward\(/.test(reader) && /innerText/.test(reader),
      JSON.stringify({ evaluators, callsOutward: /outward\(/.test(reader) }))
  }

  // auto.1 (M97) — a mode is a plan with a turn limit; a mode holding a
  // destructive verb without its confirmation is refused by name.
  {
    const modes = Object.keys(A.AUTO_MODES)
    const each = modes.map((m) => A.validateAutoMode(A.AUTO_MODES[m], FACTS))
    const bad = A.validateAutoMode({ ...A.AUTO_MODES.complete, steps: [{ verb: 'close', args: { panel: 'ch1' } }] }, FACTS)
    const custom = A.autoPlanOf('custom', 'ch1', 'fix the flaky test')
    ok('auto.1 the four modes (complete, harden, review, custom) each validate as a plan with a positive turn limit; a mode carrying a destructive verb without its confirmation is refused naming the verb; a custom task rides its opening prompt and every prompt names the done marker',
      modes.join(',') === 'complete,harden,review,custom' && each.every((r) => r.kind === 'ok') &&
        modes.every((m) => A.AUTO_MODES[m].turnLimit > 0) &&
        bad.kind === 'refused' && /close/.test(bad.reason) &&
        /fix the flaky test/.test(custom.opening) && [custom.opening, custom.continuation].every((p) => p.includes(A.AUTO_DONE_MARKER)),
      JSON.stringify({ each, bad, custom }))
  }

  // auto.2 — the chip's words, one function, three resolutions.
  {
    const running = A.autoChipWords({ mode: 'complete', turn: 2, limit: 8, state: 'running' })
    const done = A.autoChipWords({ mode: 'harden', turn: 3, limit: 8, state: 'done' })
    const stuck = A.autoChipWords({ mode: 'review', turn: 4, limit: 4, state: 'stuck', reason: 'limit' })
    const perm = A.autoChipWords({ mode: 'review', turn: 1, limit: 4, state: 'stuck', reason: 'permission' })
    ok('auto.2 the chip reads `auto · <mode> · n/limit` while running, `done` when done, and `stuck — <why>` with a reason a person can act on',
      running === 'auto · complete · 2/8' && done === 'auto · harden · done' && /^auto · review · stuck — limit/.test(stuck) && /permission/.test(perm),
      JSON.stringify({ running, done, stuck, perm }))
  }

  // M149 — executor.1 (the Act II critic). Every verb the table advertises has
  // an ARM in the executor: `closure.1` proves the table covers the interface,
  // and nothing proved the executor covers the table — `workspace-from-template`
  // sat in the table and fell to `has no executor` at run time.
  {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'renderer', 'canvas', 'usePaletteActions.ts'), 'utf8')
    const ids = V.VERBS.map((v) => v.id)
    const registryDispatch = src.includes('CREATABLE_OBJECTS.find((entry) => entry.verb === step.verb)') && src.includes('self.createObject(creation.id, a.value)')
    const missing = ids.filter((id) => !src.includes(`case '${id}'`) && !(registryDispatch && V.CREATABLE_OBJECTS.some((entry) => entry.verb === id && typeof entry.create === 'function')))
    ok('executor.1 every verb has an executor case or an executable creation registry entry routed by the shared dispatcher',
      ids.length > 0 && missing.length === 0, JSON.stringify({ ids: ids.length, missing }))
  }

  // M180. Agent admission checks the entire plan before any operation runs.
  {
    const calls = []
    const facts = { panels: [{ id: 'p1', kind: 'terminal', agent: 'claude' }] }
    const execute = async (step) => { calls.push(step.verb); return { kind: 'ran' } }
    const run = P.runAgentPlan
    const refused = typeof run === 'function' ? await run('focus p1; close p1', facts, execute) : null
    ok('agent-door.1 a destructive later step prevents every earlier side effect',
      refused?.kind === 'refused' && calls.length === 0, JSON.stringify({ refused, calls }))
    const valid = typeof run === 'function' ? await run('focus p1', facts, execute) : null
    ok('agent-door.2 a validated agent plan executes through the supplied shared executor',
      valid?.kind === 'ran' && calls.join(',') === 'focus', JSON.stringify({ valid, calls }))
    calls.length = 0
    const over = typeof run === 'function' ? await run(Array(17).fill('focus p1').join(';'), facts, execute) : null
    ok('agent-door.3 the renderer also refuses an oversized plan before executing',
      over?.kind === 'refused' && calls.length === 0, JSON.stringify({ over, calls }))
  }

  {
    const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const reply = typeof P.runAgentPlan === 'function' ? await P.runAgentPlan(`type p1 ${token}`, { panels: [{ id: 'p1', kind: 'chat' }] }, async () => ({ kind: 'ran', note: token })) : null
    ok('agent-door.4 outgoing summaries and executor notes scrub planted secrets', reply?.kind === 'ran' && !JSON.stringify(reply).includes(token), JSON.stringify(reply))
    // M180 (the critic's finding 1). A terminal agent's permission question
    // is a menu whose default is Yes: `submit` — or `type y; submit` — against
    // a panel in wants-you is the approval M76 keeps human-owned. The agent
    // door refuses it before ANY step runs; the palette's runner (a person
    // typed the line) is untouched.
    const waiting = { panels: [{ id: 'ag1', kind: 'terminal', agent: 'claude-code', state: 'wants-you' }, { id: 'ag2', kind: 'terminal', agent: 'claude-code', state: 'busy' }] }
    const answered = []
    const record = async (step) => { answered.push(step.verb + ' ' + step.args.panel); return { kind: 'ran' } }
    const viaAgent = await P.runAgentPlan('focus ag1; type ag1 y; submit ag1', waiting, record)
    const ranBeforeRefusal = answered.length
    // `interrupt` is the third human-answer verb (Ctrl-C into a prompt is an answer too): refused the same way.
    const viaInterrupt = await P.runAgentPlan('interrupt ag1', waiting, record)
    const ranBeforeInterrupt = answered.length
    const busyOk = await P.runAgentPlan('type ag2 hello; submit ag2', waiting, record)
    const viaPalette = await P.runPlan(P.buildPlan(P.parsePlanLine('submit ag1'), waiting).plan, record, { acknowledged: false })
    ok('agent-door.5 the agent door refuses type, submit and interrupt against a panel waiting for a person, before any step, while the palette runner still answers',
      viaAgent?.kind === 'refused' && /waiting for a person/.test(viaAgent.reason) && ranBeforeRefusal === 0 &&
        viaInterrupt?.kind === 'refused' && /waiting for a person/.test(viaInterrupt.reason) && ranBeforeInterrupt === 0,
      JSON.stringify({ viaAgent, ranBeforeRefusal, viaInterrupt, ranBeforeInterrupt }))
    // The two halves that must still work: a busy panel takes the line, and the palette answers.
    ok('agent-door.5b a busy panel is typed into through the door and the palette answers a waiting one',
      busyOk?.kind === 'ran' && viaPalette.steps.every((s) => s.kind === 'ran') && answered.includes('submit ag1') && answered.includes('type ag2'), JSON.stringify({ busyOk, answered }))

    // M180 (finding 2). A place-bounded teammate reaches this door with its
    // panel's token; the caller rides to the executor and a session-opening
    // verb is refused by name, where a read or a focus still runs.
    answered.length = 0
    const mate = { panelId: 'c9', teammateId: 'ada' }
    const mateChat = await P.runAgentPlan('focus ag2; new-chat', waiting, record, mate)
    const ranBeforeMateRefusal = answered.length
    // A setting is the person's too: refused for a teammate before any step (the `settings.1` writable list is the palette's own gate).
    const mateSetting = await P.runAgentPlan('focus ag2; set-setting appearance.theme dark', waiting, record, mate)
    const ranBeforeSetting = answered.length
    const mateFocus = await P.runAgentPlan('focus ag2', waiting, record, mate)
    const personChat = await P.runAgentPlan('new-chat', waiting, async () => ({ kind: 'ran', note: 'c1' }), { panelId: 'n1' })
    ok('agent-door.6 a teammate caller cannot open sessions or change settings through the door, before any step; a person\'s panel can',
      mateChat?.kind === 'refused' && /teammate/.test(mateChat.reason) && ranBeforeMateRefusal === 0 &&
        mateSetting?.kind === 'refused' && /teammate/.test(mateSetting.reason) && ranBeforeSetting === 0 &&
        mateFocus?.kind === 'ran' && personChat?.kind === 'ran', JSON.stringify({ mateChat, ranBeforeMateRefusal, mateSetting, ranBeforeSetting, mateFocus, personChat }))

    // closure.v9.1 — the doors as FACTS, not declarations (the critic): the
    // palette id must be a row `commands.ts` builds, the agent string must
    // bind through buildPlan, and the workflow omission must carry its owner.
    const doors = V.V9_DOORS
    const legacy = ["focus", "start", "spawn", "type", "submit", "send", "interrupt", "restart", "read", "set-setting", "lock", "unlock", "pin", "unpin", "maximise", "restore", "tidy", "zoom-fit", "workspace-from-template", "zoom-reset", "workspace", "review", "run-template", "close", "reset-canvas", "discard", "remove-worktree", "dispatch", "board"]
    const ids = V.VERBS.map((verb) => verb.id).filter((id) => !legacy.includes(id))
    const commandsSrc = readFileSync(join(__dirname, '..', 'src', 'renderer', 'palette', 'commands.ts'), 'utf8')
    const librarySrc = readFileSync(join(__dirname, '..', 'src', 'shared', 'template-library.ts'), 'utf8')
    // M186. The fixture holds one panel of every kind a v9 door's example
    // line names, because a verb whose first argument is a PANEL cannot bind
    // against an empty canvas — and "the example does not bind" would then be
    // reported for a door that works.
    const facts = { panels: [{ id: 'img1', kind: 'image' }, { id: 'nt1', kind: 'note' }, { id: 'wk1', kind: 'work' }, { id: 'f1', kind: 'file' }, { id: 'ch1', kind: 'chat' }], templates: [{ id: 't1' }] }
    const created = []
    const creationRows = M.commands.creationCommands({ noteRoot: '/tmp', actions: { createObject: async (id) => { created.push(id); return { kind: 'ran' } } } })
    for (const row of creationRows) row.run()
    ok('creation.registry.2 real palette rows execute every registry creation in registry order',
      JSON.stringify(created) === JSON.stringify(V.CREATABLE_OBJECTS.map((entry) => entry.id)) &&
      creationRows.every((row, i) => row.id === V.CREATABLE_OBJECTS[i].palette))
    const verdicts = ids.map((id) => {
      const d = doors?.[id]
      const paletteRow = typeof d?.palette === 'string' && (commandsSrc.includes(`id: '${d.palette}'`) || creationRows.some((row) => row.id === d.palette && typeof row.run === 'function'))
      const agentLine = typeof d?.agent === 'string' && d.agent.startsWith('tc plan ') ? d.agent.slice('tc plan '.length) : null
      const bound = agentLine !== null ? P.buildPlan(P.parsePlanLine(agentLine), facts) : null
      // M188. The workflow door is REAL for every verb but one: an `action`
      // node holds a verb line and runs it through the same executor, so the
      // door is asserted the way the agent door is — the line the row names
      // must BIND — plus the kind must exist in the library a person drags
      // from. `node-test` alone keeps an owed door, and its reason is not the
      // executor's absence but a loop with no stop.
      // A canvas door is a gesture STRING, or an OWED object naming a later milestone — the debt as data (the M182 critic); never an empty label.
      const canvasDoor = typeof d?.canvas === 'string' ? d.canvas.length > 0 : typeof d?.canvas?.reason === 'string' && /^M\d+$/.test(String(d.canvas.due))
      // An action node's line is the part after the colon; it must bind
      // exactly as the agent line does, and `action` must be a kind the
      // library offers (a door nobody can drag is not a door).
      const workflowLine = typeof d?.workflow === 'string' && d.workflow.includes(': ') ? d.workflow.slice(d.workflow.indexOf(': ') + 2) : null
      const workflowBound = workflowLine === null ? null : P.buildPlan(P.parsePlanLine(workflowLine), facts)
      const workflowDoor = typeof d?.workflow === 'string'
        ? workflowBound?.kind === 'plan' && workflowBound.plan.steps[0]?.verb === id && librarySrc.includes("kind: 'action'")
        : typeof d?.workflow?.reason === 'string' && d.workflow.due === V.WORKFLOW_EXECUTOR_DUE
      return { id, paletteRow, agentBinds: bound?.kind === 'plan' && bound.plan.steps[0]?.verb === id, canvas: canvasDoor, canvasOwed: typeof d?.canvas === 'object' ? d.canvas.due : undefined, workflowOwed: workflowDoor }
    })
    ok('closure.v9.1 every v9 verb names a real palette row, an agent line that binds to it, a canvas gesture (or an owed one with its due milestone) and a WORKFLOW door — an action node whose line binds to the same verb, with `action` a kind the library offers — or, for node-test alone, an owned omission with its reason',
      ids.length > 0 && verdicts.every((v) => v.paletteRow && v.agentBinds && v.canvas && v.workflowOwed), JSON.stringify(verdicts))
  }

  // M190 (the Acts V-VII critic, 1 and 3) — agent-door.7. THE ACTION NODE'S
//      INDIRECTION IS CLOSED. M188's action node runs a verb LINE, so a
//      teammate that may not `new-chat` could otherwise write it into a
//      template (`workflow-add`, `workflow-set`, `workflow-save`) and then
//      `workflow-run` it, with every refusal this door makes reachable one
//      step away. The editing verbs, the run and the two portable verbs now
//      refuse a teammate caller by name. And `export-canvas` is DESTRUCTIVE:
//      a named path skips the save dialog, so `export-canvas ~/.zshrc` would
//      replace a file nobody meant to lose — the agent door refuses a
//      destructive plan outright and the palette confirms it.
{
  const facts = { panels: [{ id: 'p1', kind: 'terminal' }], templates: [{ id: 't1' }] }
  const teammate = { panelId: 'p1', teammateId: 'ada' }
  const refusalOf = (line, caller) => {
    const built = V.buildPlan ? null : null
    const plan = P.buildPlan(P.parsePlanLine(line), facts)
    if (plan.kind !== 'plan') return `unbindable: ${plan.reason}`
    for (const step of plan.plan.steps) {
      const r = P.agentDoorRefusal(step, facts, caller)
      if (r !== null) return r
    }
    return null
  }
  // M251 adds both pack verbs: a teammate chooses neither where this app
  // writes a pack nor what a person is asked to add to their library.
  const editRefusals = ['workflow-add t1 terminal', 'workflow-set t1 n1 title x', 'workflow-save t1', 'workflow-run t1', 'node-test t1', 'export-canvas /tmp/x', 'import-canvas /tmp/x', 'export-pack /tmp/x', 'import-pack /tmp/x']
    .map((line) => ({ line, teammate: refusalOf(line, teammate), person: refusalOf(line, undefined) }))
  const exportVerb = V.VERBS.find((verb) => verb.id === 'export-canvas')
  const destructivePlan = P.buildPlan(P.parsePlanLine('export-canvas /tmp/x'), facts)
  ok('agent-door.7 a teammate\'s plan is refused BY NAME for every workflow-editing verb, for workflow-run and node-test, and for both portable verbs — the action node\'s indirection cannot reach what the door refuses; the same lines are allowed to a person; and export-canvas is destructive, so it carries a confirmation and the agent door refuses it outright',
    editRefusals.every((r) => typeof r.teammate === 'string' && /teammate/.test(r.teammate)) &&
      editRefusals.every((r) => r.person === null) &&
      exportVerb !== undefined && exportVerb.destructive === true &&
      destructivePlan.kind === 'plan' && P.planIsDestructive(destructivePlan.plan) === true,
    JSON.stringify({ editRefusals, destructive: exportVerb && exportVerb.destructive }))
}

const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
