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

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

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

  // gate.2 — the gate is the only door OUT. `redactSecrets` may be called by
  // the gate and by the memory store's write scrub (a store, not a reader)
  // and nowhere else; every reader of pane text goes through `outward`.
  {
    const { readdirSync, statSync } = require('node:fs')
    const root = join(__dirname, '..', 'src')
    const files = []
    const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p) } }
    walk(root)
    const callers = files.filter((f) => /redactSecrets\(/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''))).map((f) => f.slice(root.length + 1)).sort()
    const readers = files.filter((f) => /scrollback\.tail\(|lastAssistantText\(/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1)).sort()
    const unguarded = readers.filter((f) => !/outward\(/.test(readFileSync(join(root, f), 'utf8')) && !/chat-store\.ts$|Canvas\.tsx$|scrollback-store\.ts$|ScrollbackPanel|TerminalPanel|useCanvasTestHooks|search|ipc\.ts$|index\.ts$/.test(f))
    ok('gate.2 redactSecrets has exactly two callers (the outward gate and the memory store\'s write scrub), and every module that reads a panel\'s tail or a chat\'s last answer for another reader calls outward',
      JSON.stringify(callers) === JSON.stringify(['main/memory-store.ts', 'shared/outward.ts', 'shared/redact.ts']) && unguarded.length === 0,
      JSON.stringify({ callers, readers, unguarded }))
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

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
