/**
 * M136. The ELEVEN owed hand checks from the M126–M133 act
 * (docs/build-log/m126-m133-act3-skills-and-workflows.md §Owed hand checks),
 * in that order, as ONE source: `npm run handcheck` runs the `auto` arms and
 * prints the `hand` ones' steps, and docs/load-bearing.md's manual-only block
 * carries every `hand` title verbatim (verify:meta handcheck.1 pins that).
 *
 * An `auto` arm returns { pass, detail } or { skip, detail }; it receives a
 * ctx with the production functions (bundled by scripts/handcheck.cjs) and
 * a few helpers. A `hand` entry is a title plus the exact numbered steps a
 * person performs and what they must see — a step a script cannot take is
 * written down rather than pretended.
 */
'use strict'
const { mkdtempSync, existsSync, readFileSync, realpathSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { execFile } = require('node:child_process')

const STEPS = [
  {
    n: 1, arm: 'hand',
    title: 'The trail against a real agent (M130)',
    steps: [
      'Open the app and spawn a terminal panel from the Claude preset in a repository that has at least two skills (`ls ~/.claude/skills` or `.claude/skills`).',
      'In the running claude, invoke two skills by name in two prompts (e.g. `/commit` then a second one); wait for each to finish.',
      'Select the panel; in the Skills pane (dock → Skills) the trail lane under the panel lists BOTH skills, in the order invoked, each with its time.',
      'Expected: two cards in order. A lane that stays empty means the CLI changed how it writes the `Skill` tool_use record — the parser reads it as an empty trail, not an error.'
    ]
  },
  {
    n: 2, arm: 'auto',
    title: '`claude plugin list --json` on another machine and another version (M128)',
    run: async (ctx) => {
      const claude = ctx.which('claude')
      if (claude === null) return { skip: true, detail: 'no `claude` on the login shell PATH — install it to cover this' }
      const version = await ctx.exec(claude, ['--version'])
      const res = await ctx.listPlugins(() => ctx.exec(claude, ['plugin', 'list', '--json']).then((out) => ({ stdout: out, code: 0 }), (e) => ({ stdout: String(e), code: 1 })))
      const detail = `claude ${version.trim()} → ${res.kind}${res.kind === 'ok' ? `, ${res.plugins.length} enabled plugin(s)${res.plugins.length ? ': ' + res.plugins.map((p) => p.id).join(', ') : ''}` : ` (${res.why})`}`
      // The `unknown` arm is what protects the pane, so it is NOT a failure —
      // it is the shape reported. A failure here is the parser THROWING or
      // answering neither arm.
      return { pass: res.kind === 'ok' || res.kind === 'unknown', detail }
    }
  },
  {
    n: 3, arm: 'hand',
    title: 'A pool of N against a real budget, and a real AgentSessionManager (M132)',
    steps: [
      'Settings → agents.budgetUsd = 0.05 (deliberately low); agents.maxConcurrent = 2.',
      'Save a template holding a `pool` block of width 4 over a list file with 6 short items; open it as a workflow panel and press Run.',
      'Expected: two workers start, four items read `queued (concurrency)` in the Runs tab; as workers finish, the next items start; when the CLI\'s cumulative cost passes $0.05 every worker in flight is INTERRUPTED (its turn ends, its process is not killed) and the run reads `stopped — budget`; raising the budget clears the latch.',
      'This spends real money by design — the fake runner in `verify:agent-session pool.1/pool.2` cannot.'
    ]
  },
  {
    n: 4, arm: 'hand',
    title: 'A saved SKILL.md still loading in the CLI (M129)',
    steps: [
      'Open a user skill in the skill panel (Skills pane → a card → Open); change its description and one body line; Save.',
      'In a terminal panel running claude, type `/` and confirm the skill is still listed with the NEW description; invoke it and confirm the new body line is what the agent follows.',
      'Expected: the CLI accepts the spliced file. `verify:toolbox edit.1` proves the bytes round-trip; only the CLI can prove it still loads them.'
    ]
  },
  {
    n: 5, arm: 'auto',
    title: '`shell.trashItem` on this machine (M129)',
    run: async (ctx) => {
      const out = await ctx.electronNode(join(__dirname, 'handcheck-trash.cjs'))
      if (out === null) return { skip: true, detail: 'no Electron binary under node_modules — `node node_modules/electron/install.js`' }
      let parsed
      try { parsed = JSON.parse(out.trim().split('\n').pop()) } catch { return { pass: false, detail: 'the trash arm printed no JSON: ' + out.slice(-200) } }
      return { pass: parsed.ok === true, detail: parsed.ok ? `trashed ${parsed.path} — it is in the Trash now; empty it when you like` : String(parsed.error || 'the file did not leave its directory') }
    }
  },
  {
    n: 6, arm: 'hand',
    title: 'The >40-skill truncation notice (M130)',
    steps: [
      'In a terminal panel running claude, invoke more than 40 skills across the session (a loop prompt such as "run /a, then /b, …" over a folder of 41 stub skills is the fastest way).',
      'Select the panel; in the Skills pane the trail lane shows the newest 40 cards and a `… and N more` capsule at its head.',
      'Expected: the capsule names the true excess. No run before the M130 fix wave ever produced one (the scanner pre-sliced at the cap), so the sentence has been seen only in `verify:file trail.more`\'s fixture.'
    ]
  },
  {
    n: 7, arm: 'auto',
    title: 'A first-ever skill on a machine with no ~/.claude/skills (M129)',
    run: async (ctx) => {
      // A genuinely fresh temp HOME, never the real one: `createSkill` takes
      // the skills ROOT it writes under, so the fence is the root itself (no
      // environment variable is involved), and the `mkdir` arm is the one
      // under test.
      const home = mkdtempSync(join(tmpdir(), 'tc handcheck home '))
      const root = join(home, '.claude', 'skills')
      const res = await ctx.createSkill(root, 'first-ever-skill', {
        realpath: (p) => realpathSync(p),
        skillRoots: [root],
        pluginPaths: [],
        trash: async () => {}
      })
      const file = join(root, 'first-ever-skill', 'SKILL.md')
      const landed = (res.kind === 'created' || res.kind === 'written') && existsSync(file) && readFileSync(file, 'utf8').includes('first-ever-skill')
      return { pass: landed, detail: `${res.kind}${res.why ? ' — ' + res.why : ''}; ${file}${landed ? ' exists' : ' missing'} (fresh HOME ${home})` }
    }
  },
  {
    n: 8, arm: 'auto',
    title: 'A rename into an OCCUPIED shelf slot (M129)',
    run: async (ctx) => {
      // Pure, over the shipped `renameInShelf`: the destination key already
      // sits in a column. The rule (decided at the Act I critic's finding): a
      // key is ONE slot per column, so the rename collapses onto the existing
      // slot — the occupied entry stays where it was, the renamed one's old
      // slot goes, order otherwise untouched. Two slots for one key rendered
      // as a phantom card; a refusal would make a rename fail for a reason
      // about the shelf, which the person cannot see from the editor.
      const a = ctx.skillKey('user', 'alpha'), b = ctx.skillKey('user', 'beta'), c = ctx.skillKey('user', 'gamma')
      const shelf = { columns: [{ id: 'k1', title: 'Kept', keys: [a, b, c] }, { id: 'ungrouped', title: 'Ungrouped', keys: [] }] }
      const after = ctx.renameInShelf(shelf, a, b)
      const keys = after.columns[0].keys
      const collapsed = keys.length === 2 && keys[0] === b && keys[1] === c
      const untouched = shelf.columns[0].keys[0] === a && after.columns[1].keys.length === 0
      return { pass: collapsed && untouched, detail: `column after: ${keys.map((k) => JSON.parse(k)[1]).join(', ')} — one slot per key: the occupied slot stays, alpha's old slot goes` }
    }
  },
  {
    n: 9, arm: 'hand',
    title: '`--append-system-prompt` surviving an orchestrator RESUME (M132)',
    steps: [
      'Run a workflow holding an `orchestrator` block; in its chat, send one turn and confirm the reply follows the block\'s prompt (ask it what its instructions are).',
      'Quit the app; relaunch; open the same chat and send a second turn asking the same question.',
      'Expected: the resumed orchestrator still answers with the block\'s prompt. The CLI keeps no record of `--append-system-prompt`, so a resumed spawn that dropped it would stop being an orchestrator with no error (M81\'s supervisor rule for this block kind).'
    ]
  },
  {
    n: 10, arm: 'hand',
    title: 'A `collect` join against real workers (M132)',
    steps: [
      'Run a workflow with a `pool` of 3 feeding a `collect` block whose target is a file path under the repository.',
      'Expected: the collect chat starts ONCE, after the last worker\'s turn ends, with the three payloads in panel order in its first message; the target file holds the joined text. `verify:agent-session pool.2` drives this over the recorded shape only.'
    ]
  },
  {
    n: 11, arm: 'hand',
    title: 'A workflow watcher ARMED for real (M133)',
    steps: [
      'Open a workflow panel; Triggers → every 1 minute; leave the app running for three minutes.',
      'Expected: the workflow instantiates once per minute (three new runs in the Runs tab), and the run ledger (`tc ledger` or the inspector\'s Ledger) shows a row per fire naming `/usr/bin/true` with exit 0 beside it — the recorded cost of a trigger being a watcher whose command is a no-op.'
    ]
  }
]

module.exports = { STEPS }
