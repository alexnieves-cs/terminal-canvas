/**
 * Verifies the agent toolbox: the pure scanner's parsers and projections, and
 * the real-filesystem reader's scope resolution.
 *
 * Run with: npm run verify:toolbox
 *
 * Plain node, like verify:file and verify:review: toolbox-scan.ts imports
 * nothing at all beyond its own shared types, and toolbox-read.ts imports
 * node:fs but neither electron nor node-pty — and node:fs is not what moves a
 * module out of this tier, main/prompts.ts being the standing precedent.
 *
 * The fixture tree is BUILT, never found, and its path contains a SPACE. Two
 * separate rules, both learned the expensive way:
 *
 *   - Spaced, because this repo's costliest silent bug (the pane-died
 *     redirect) shipped through eight reviews on space-free fixtures.
 *   - Synthesised, because this suite's whole subject is a directory the repo
 *     does not own. Reading the running developer's real ~/.claude would make
 *     the suite depend on state nobody controls — the rule M9a's git fence and
 *     the prompt fence each cost a fix round to learn. There is a second
 *     irony worth knowing: this repo GITIGNORES .claude entirely, so it has
 *     almost no project-scoped toolbox of its own to dogfood against even if
 *     that rule did not apply.
 */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, chmodSync } = require('node:fs')
const { tmpdir } = require('node:os')

const OUT = join(__dirname, '..', 'out', 'verify', 'toolbox.cjs')
buildSync({
  entryPoints: [join(__dirname, 'toolbox-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node:fs', 'node:path', 'node:os'],
  // Both aliases, for the reason CLAUDE.md records against verify-viewport,
  // verify-panels and verify-canvas: every @shared import reachable from here
  // is a real VALUE import (the caps), so @shared is mandatory rather than
  // pre-emptive, and @renderer is carried because "needs no alias yet" is
  // precisely the state verify-viewport.cjs was in the day before it broke.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const T = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const DIR = mkdtempSync(join(tmpdir(), 'tc toolbox '))
const p = (...parts) => join(DIR, ...parts)
const write = (rel, text) => {
  const full = join(DIR, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, text)
  return full
}

;(async () => {
  /* ------------------------------------------------ frontmatter (1-5) -- */

  // 1 is the ordinary case and the shape of every real SKILL.md measured on
  // this machine: a fenced block with a bare name and a quoted description.
  {
    const fm = T.parseFrontmatter('---\nname: graphify\ndescription: "Turns files into a graph."\n---\n\n# body\n')
    ok(1, fm.name === 'graphify' && fm.description === 'Turns files into a graph.',
      `1 — ordinary frontmatter: name=${fm.name} desc=${JSON.stringify(fm.description)}`)
  }

  // 2 — a file with NO frontmatter yields nulls rather than reading its first
  // markdown heading as a name. A skill directory whose SKILL.md is plain
  // prose is an ordinary thing to find, and inventing `# Overview` as a name
  // would put a fabricated row in a searchable list.
  {
    const fm = T.parseFrontmatter('# Overview\n\nname: not-really\n')
    ok(2, fm.name === null && fm.description === null,
      `2 — no frontmatter yields nulls: ${JSON.stringify(fm)}`)
  }

  // 3 — the block-scalar refusal, and it is the check that keeps the
  // hand-rolled parser honest rather than merely small. `description: >` is a
  // promise about the NEXT lines, which this parser does not read; answering
  // '' is correct and answering '>' would put a punctuation mark on screen
  // where a sentence belongs.
  {
    const fm = T.parseFrontmatter('---\nname: x\ndescription: >\n  folded text here\n---\n')
    ok(3, fm.name === 'x' && fm.description === null,
      `3 — block scalar yields null, never the indicator: ${JSON.stringify(fm.description)}`)
  }

  // 4 — an unclosed fence must not swallow the file. `---` at the top of a
  // document that never closes it is a real markdown shape (a horizontal
  // rule), and a parser that scanned to EOF would read a whole document as
  // frontmatter and cap-truncate something arbitrary out of it.
  {
    const fm = T.parseFrontmatter('---\nname: x\n\nno close fence here\n')
    ok(4, fm.name === null && fm.description === null,
      `4 — unclosed fence yields nulls: ${JSON.stringify(fm)}`)
  }

  // 5 — forward compatibility, the rule parseMeta already states: an unknown
  // extra key is IGNORED rather than rejecting the file. Claude Code will add
  // fields, and a parser that refused an unfamiliar one turns every future
  // release into "the toolbox stopped working" with nothing saying why.
  {
    const fm = T.parseFrontmatter('---\nname: x\nallowed-tools: Bash, Read\ndescription: d\nmodel: opus\n---\n')
    ok(5, fm.name === 'x' && fm.description === 'd',
      `5 — unknown keys ignored, known keys still read: ${JSON.stringify(fm)}`)
  }

  /* -------------------------------------------- description cap (6-7) -- */

  // 6 pins BOTH ends of the bound in one read, because a cap written with the
  // wrong comparison (`>` for `>=`) passes a one-sided test.
  {
    const max = T.TOOL_DESCRIPTION_MAX
    const at = T.capDescription('a'.repeat(max))
    const over = T.capDescription('a'.repeat(max + 1))
    ok(6, at.description.length === max && at.descriptionTruncated === false
        && over.description.length === max && over.descriptionTruncated === true,
      `6 — description cap at ${max}: at=${at.descriptionTruncated} over=${over.descriptionTruncated}`)
  }

  // 7 — the flag is the whole point, and it is why this does not just reuse
  // subagent-scan's silent slice. Measured longest description on this
  // machine: 952 chars, so truncation is the ordinary case for real skills,
  // and a sentence that stops mid-word without saying so is a list lying about
  // being complete.
  {
    const r = T.capDescription(null)
    ok(7, r.description === '' && r.descriptionTruncated === false,
      `7 — an absent description is '' and NOT flagged as truncated`)
  }

  /* ------------------------------------------- command naming (8-10) -- */

  // 8/9 are the measured naming rule. `commands/paul/plan.md` carries
  // `name: paul:plan` in its OWN frontmatter, so this is confirmed against the
  // format rather than inferred from it.
  ok(8, T.commandName(['plan.md']) === 'plan', `8 — top-level command: ${T.commandName(['plan.md'])}`)
  ok(9, T.commandName(['paul', 'plan.md']) === 'paul:plan',
    `9 — namespaced command: ${T.commandName(['paul', 'plan.md'])}`)

  // 10 — three levels is refused rather than flattened. prompts.ts's
  // one-level rule would have missed 27 of this machine's 28 commands, so two
  // levels is a deliberate widening; an unbounded walk over a directory this
  // app does not control is the promise nobody here has made.
  ok(10, T.commandName(['a', 'b', 'c.md']) === null && T.commandName(['x.txt']) === null,
    `10 — three levels and non-.md both refused`)

  /* ------------------------------------- THE PROJECTION: mcp (11-14) -- */

  // 11 is the check this whole milestone's boundary rests on, and it asserts
  // on the returned object's OWN KEYS rather than on a value — verify:
  // credentials 4's shape, and for its reason: a spread that carried the
  // secret straight through satisfies any assertion phrased about the value.
  {
    const e = T.projectMcpServer('vendor', {
      command: 'npx',
      args: ['-y', '@vendor/mcp', '--api-key=sk-live-SECRET'],
      env: { GITHUB_TOKEN: 'ghp_SECRET', OTHER: 'x' },
      type: 'stdio'
    }, 'user', '/tmp/x/.claude.json', { kind: 'active' })
    const keys = Object.keys(e)
    const serialised = JSON.stringify(e)
    ok(11,
      !keys.includes('env') && !keys.includes('args') && !keys.includes('url')
        && !serialised.includes('sk-live-SECRET') && !serialised.includes('ghp_SECRET'),
      `11 — no env/args keys and no secret anywhere in the payload: keys=${keys.join(',')}`)
  }

  // 12 — the positive half, which is what stops 11 being satisfied by a
  // projection that returned nothing at all. Env KEY NAMES are the useful
  // fact ("this server wants GITHUB_TOKEN") and must survive; the count of
  // args must survive; the launcher must survive.
  {
    const e = T.projectMcpServer('vendor', {
      command: 'npx', args: ['-y', '@vendor/mcp'], env: { GITHUB_TOKEN: 'x', ALPHA: 'y' }
    }, 'user', '/tmp/x', { kind: 'active' })
    ok(12,
      e.command === 'npx' && e.argCount === 2
        && e.envKeys.length === 2 && e.envKeys[0] === 'ALPHA' && e.envKeys[1] === 'GITHUB_TOKEN'
        && e.envKeysOverflow === 0,
      `12 — launcher, arg COUNT and sorted env KEY NAMES all survive: ${JSON.stringify({ c: e.command, n: e.argCount, k: e.envKeys })}`)
  }

  // 13 — a record that can never launch anything is not a row. A server with
  // neither a command nor a url would render as a capability the agent does
  // not have.
  ok(13, T.projectMcpServer('x', { type: 'stdio' }, 'user', '/p', { kind: 'active' }) === null
      && T.projectMcpServer('x', 'not-an-object', 'user', '/p', { kind: 'active' }) === null,
    `13 — a launchless or malformed server is dropped, never rendered`)

  // 14 — the env-key cap reports its overflow rather than silently stopping,
  // the +N more rule REVIEW_FILE_CAP already states.
  {
    const env = {}
    for (let i = 0; i < T.MCP_ENV_KEYS_MAX + 5; i += 1) env[`K${String(i).padStart(3, '0')}`] = 'v'
    const e = T.projectMcpServer('x', { command: 'node', env }, 'user', '/p', { kind: 'active' })
    ok(14, e.envKeys.length === T.MCP_ENV_KEYS_MAX && e.envKeysOverflow === 5,
      `14 — env keys capped at ${T.MCP_ENV_KEYS_MAX} with overflow reported: ${e.envKeys.length}+${e.envKeysOverflow}`)
  }

  /* ------------------------------ THE PROJECTION: hooks (15-17) ------- */

  // 15 — a hook command is free text the user typed and an inline bearer
  // token is an entirely plausible hook. Only the PROGRAM crosses, and the
  // real length is reported so the row is visibly partial rather than looking
  // whole.
  {
    const hooks = T.parseHooks({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
        { type: 'command', command: 'curl -H "Authorization: Bearer sk-live-SECRET" https://x' }
      ] }] }
    }, 'user', '/tmp/s.json')
    const s = JSON.stringify(hooks)
    ok(15, hooks.length === 1 && !s.includes('sk-live-SECRET') && !s.includes('Authorization')
        && hooks[0].program === 'curl' && hooks[0].commandChars > 40,
      `15 — only the program crosses: program=${hooks[0] && hooks[0].program} chars=${hooks[0] && hooks[0].commandChars}`)
  }

  // 16 — the second token is shown only when it is plainly a PATH. This is
  // what makes the row useful (`node guard.js` rather than a bare `node`)
  // without the rule ever having to recognise a secret, which is a rule that
  // cannot be written correctly.
  ok(16, T.hookProgram('node "/Users/me/.claude/hooks/guard.js"') === 'node guard.js'
      && T.hookProgram('node --api-key=sk-SECRET') === 'node'
      && T.hookProgram('') === '',
    `16 — path-shaped second token shown, flag-shaped one dropped: ${T.hookProgram('node --api-key=sk-SECRET')}`)

  // 17 — two textually IDENTICAL hooks on one event are two hooks that both
  // run, so they must be two rows with two ids. Deduping them would report
  // half the configured work as all of it.
  {
    const hooks = T.parseHooks({
      hooks: { Stop: [{ matcher: '', hooks: [
        { type: 'command', command: 'echo same' },
        { type: 'command', command: 'echo same' }
      ] }] }
    }, 'user', '/tmp/s.json')
    ok(17, hooks.length === 2 && hooks[0].id !== hooks[1].id && hooks[0].index === 0 && hooks[1].index === 1,
      `17 — identical hooks are two rows with distinct ids: n=${hooks.length}`)
  }

  /* ------------------------------------------- mcp resolution (18-21) -- */

  // 18 — needs-approval is its OWN arm. A .mcp.json server named in neither
  // list is a definite state with a definite meaning (the CLI asks at
  // startup); folding it into `active` sends someone to a panel whose agent
  // will refuse, and folding it into `unknown` throws away the one arm whose
  // remedy the user can act on.
  {
    const a = T.mcpJsonActive('srv', [], [], '/c.json')
    ok(18, a.kind === 'needs-approval', `18 — .mcp.json server in neither list: ${a.kind}`)
  }

  // 19 — and the direct pair's absent case is `active`, NOT needs-approval: a
  // server the user configured in their own file needs no approval prompt.
  // Asserted beside 18 because the two look alike and are opposite.
  {
    const a = T.mcpDirectActive('srv', [], [], '/c.json')
    ok(19, a.kind === 'active', `19 — user-scope server in neither list is active, not needs-approval: ${a.kind}`)
  }

  // 20 — disabled carries the PATH of the file that decided, never a friendly
  // name: "disabled by settings.local.json" is ambiguous across three scopes,
  // and the path is also the escape hatch to reading it.
  {
    const a = T.mcpJsonActive('srv', [], ['srv'], '/home/.claude.json')
    ok(20, a.kind === 'disabled' && a.by === '/home/.claude.json',
      `20 — disabled names the deciding file by absolute path: ${JSON.stringify(a)}`)
  }

  // 21 — named in BOTH lists is unknown/contradictory-config rather than a
  // guess. Disk contradicts itself and this app has no basis to pick a winner;
  // picking one would be a confident wrong answer in a feature whose entire
  // value is being believed.
  {
    const a = T.mcpJsonActive('srv', ['srv'], ['srv'], '/c.json')
    const b = T.mcpDirectActive('srv', ['srv'], ['srv'], '/c.json')
    ok(21, a.kind === 'unknown' && a.why === 'contradictory-config'
        && b.kind === 'unknown' && b.why === 'contradictory-config',
      `21 — contradictory config is unknown on BOTH pairs: ${a.kind}/${b.kind}`)
  }

  /* ------------------------------ THE ALLOWLIST: claude.json (22-23) -- */

  // 22 is the allowlist, and it is the check whose ARGUMENT is a measurement:
  // projects[*].history was observed PRESENT on one machine and ABSENT across
  // all 12 projects on another, so a denylist written against either is
  // silently wrong on the other and the failure is invisible — the payload
  // merely gets bigger. Four paths in, everything else refused, including
  // every OTHER project's entry (the user's whole working layout).
  {
    const v = T.readClaudeJson({
      mcpServers: { user1: { command: 'a' } },
      oauthAccount: { emailAddress: 'me@example.com' },
      userID: 'SECRET-USER-ID',
      projects: {
        '/my/cwd': {
          mcpServers: { local1: { command: 'b' } },
          enabledMcpjsonServers: ['e'],
          disabledMcpjsonServers: ['d'],
          enabledMcpServers: ['E'],
          disabledMcpServers: ['D'],
          history: [{ display: 'my secret prompt' }]
        },
        '/some/other/repo': { mcpServers: { other: { command: 'c' } }, history: [{ display: 'other' }] }
      }
    }, '/my/cwd')
    const s = JSON.stringify(v)
    ok(22,
      Object.keys(v.userServers).join() === 'user1'
        && Object.keys(v.localServers).join() === 'local1'
        && v.enabledMcpjson.join() === 'e' && v.disabledMcpjson.join() === 'd'
        && v.enabledMcp.join() === 'E' && v.disabledMcp.join() === 'D'
        && !s.includes('my secret prompt') && !s.includes('SECRET-USER-ID')
        && !s.includes('me@example.com') && !s.includes('/some/other/repo') && !s.includes('other'),
      `22 — exactly four paths cross; history, identity and OTHER projects do not`)
  }

  // 23 — a malformed or absent file yields empty lists rather than throwing.
  // ~/.claude.json is written by another program while this one reads it, so
  // catching it mid-write is ordinary rather than exotic.
  {
    const v = T.readClaudeJson(null, '/my/cwd')
    const w = T.readClaudeJson({ projects: 'not-an-object' }, '/my/cwd')
    ok(23, Object.keys(v.userServers).length === 0 && v.enabledMcp.length === 0
        && Object.keys(w.localServers).length === 0,
      `23 — malformed claude.json reads as empty, never throws`)
  }

  /* ---------------------------------------- skills + plugins (24-26) -- */

  // 24 — the measured matching rule: an override key containing ':' names a
  // PLUGIN skill and can never match a filesystem directory, so it belongs in
  // `unresolved` rather than as a fabricated entry pointing at a file that
  // does not exist. 26 such keys were measured on this machine.
  {
    const ov = { graphify: 'off', 'paul:add-phase': 'off', 'other:x': 'on', keep: 'on' }
    ok(24, T.skillOverrideOff('graphify', ov) === true
        && T.skillOverrideOff('keep', ov) === false
        && T.unresolvableOverrides(ov).join() === 'paul:add-phase',
      `24 — bare keys match directories, namespaced keys go to unresolved: ${T.unresolvableOverrides(ov).join()}`)
  }

  // 25 — permission COUNTS, per file, never merged. Measured 628 rules in one
  // file and 718 in another, so this is the number that keeps the inventory
  // payload small enough to fetch on every selection change.
  {
    const c = T.parsePermissionCounts({
      permissions: { allow: ['a', 'b', 'c'], deny: ['d'], additionalDirectories: ['x'] }
    }, 'user', '/s.json')
    ok(25, c.allow === 3 && c.deny === 1 && c.ask === 0 && c.additionalDirectories === 1 && c.scope === 'user',
      `25 — per-file permission counts: allow=${c.allow} deny=${c.deny} ask=${c.ask}`)
  }

  // 26 — the rules themselves report a TRUE total beside a capped list, so a
  // count on screen is always the real count even when the list is cut. A
  // total derived from the truncated array is the wrong answer that
  // slugSharing's one-derivation rule exists to prevent.
  {
    const many = []
    for (let i = 0; i < T.PERMISSION_RULES_MAX + 7; i += 1) many.push(`Bash(cmd${i})`)
    const r = T.parsePermissionRules({ permissions: { allow: many } }, 'allow')
    ok(26, r.total === T.PERMISSION_RULES_MAX + 7 && r.rules.length === many.length
        && r.rules[0] === 'Bash(cmd0)',
      `26 — capped rule STRINGS with a true total: total=${r.total}`)
  }


  /* ========================= THE READER, on a real fixture tree ======== */

  // The fixture is two roots: a fake HOME and a fake project cwd. Built,
  // never found — see this file's header for the two separate rules that
  // forces, and note that `DIR` already contains a space, so every path below
  // inherits the spaced-fixture rule for free.
  const HOME = p('home')
  const CWD = p('proj')
  mkdirSync(HOME, { recursive: true })
  mkdirSync(CWD, { recursive: true })

  write('home/.claude/skills/graphify/SKILL.md',
    '---\nname: graphify\ndescription: Build a knowledge graph.\n---\n# body\n')
  write('home/.claude/skills/turnedoff/SKILL.md',
    '---\nname: turnedoff\ndescription: Should read as disabled.\n---\n')
  write('home/.claude/commands/plan.md', '---\ndescription: Plan it.\n---\n')
  write('home/.claude/commands/paul/plan.md', '---\nname: paul:plan\ndescription: Namespaced.\n---\n')
  write('home/.claude/settings.json', JSON.stringify({
    skillOverrides: { turnedoff: 'off', 'plugin:thing': 'off' },
    enabledPlugins: { alpha: true, beta: false },
    permissions: { allow: ['Bash(ls)', 'Bash(cat)'], deny: ['Bash(rm)'] },
    env: { ANTHROPIC_API_KEY: 'sk-SHOULD-NEVER-CROSS' },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node /h/guard.js' }] }] }
  }))
  write('home/.claude.json', JSON.stringify({
    mcpServers: { railway: { command: 'npx', args: ['-y', 'railway'], env: { RAILWAY_TOKEN: 'SECRET' } } },
    userID: 'SECRET-ID',
    projects: {
      [CWD]: {
        mcpServers: { simctl: { command: 'node', args: ['a'] } },
        enabledMcpjsonServers: ['approved'],
        disabledMcpServers: ['ghost-connector'],
        history: [{ display: 'a private prompt' }]
      }
    }
  }))
  write('proj/.claude/skills/graphify/SKILL.md', '---\nname: graphify\ndescription: Project copy.\n---\n')
  write('proj/.claude/agents/reviewer.md', '---\nname: reviewer\ndescription: Reviews things.\n---\n')

  // M125: resources fixtures — a skill with two sibling files, a skill with
  // none, and a skill whose OWN directory cannot be listed but whose
  // SKILL.md can still be read (execute-only: traversal survives, readdir
  // does not — chmod 0o000 would also fail the SKILL.md read itself, which
  // would drop the entry entirely rather than exercise the `unknown` arm).
  write('proj/.claude/skills/has-resources/SKILL.md',
    '---\nname: has-resources\ndescription: Ships two files.\n---\n')
  write('proj/.claude/skills/has-resources/references/one.md', '# one\n')
  write('proj/.claude/skills/has-resources/scripts/run.sh', '#!/bin/sh\n')
  write('proj/.claude/skills/bare/SKILL.md',
    '---\nname: bare\ndescription: Ships nothing beside itself.\n---\n')
  write('proj/.claude/skills/locked/SKILL.md',
    '---\nname: locked\ndescription: Its own directory cannot be listed.\n---\n')
  chmodSync(join(CWD, '.claude', 'skills', 'locked'), 0o100)
  write('proj/.mcp.json', JSON.stringify({
    mcpServers: { approved: { command: 'node' }, unapproved: { command: 'node' } }
  }))

  const read = T.readToolbox({ cwd: CWD, home: HOME })
  const inv = read.kind === 'inventory' ? read.inventory : null
  const named = (kind, name, scope) =>
    inv && inv.entries.find((e) => e.kind === kind && e.name === name && e.scope === scope)

  // 27 — the whole read, end to end, across BOTH scopes. Asserts real content
  // rather than a count: a reader that produced the right number of empty
  // rows would satisfy a count completely.
  {
    const g = named('skill', 'graphify', 'user')
    const c = named('command', 'paul:plan', 'user')
    const a = named('agent', 'reviewer', 'project')
    ok(27,
      !!g && g.description === 'Build a knowledge graph.'
        && !!c && c.description === 'Namespaced.'
        && !!a && a.description === 'Reviews things.',
      `27 — user skills, namespaced commands and project agents all read with real descriptions`)
  }

  // 28 is the THREE-ANSWERS rule, and it is the check the section's whole
  // hiding policy rests on: a source that was read and was empty, a source
  // that is ABSENT, and a source that could not be read are three different
  // sentences with three different fixes. Collapsing absent into unreadable
  // would put a red row on most panels most of the time; collapsing
  // unreadable into absent means the user never goes to look.
  {
    const byWhat = (what, scope) =>
      inv && inv.sources.find((s) => s.what === what && s.scope === scope)
    const projAgents = byWhat('agents', 'project')
    const userAgents = byWhat('agents', 'user')
    ok(28,
      !!projAgents && projAgents.status === 'read'
        && !!userAgents && userAgents.status === 'absent',
      `28 — read vs absent are distinct source statuses: proj=${projAgents && projAgents.status} user=${userAgents && userAgents.status}`)
  }

  // 29 — the projection holds through the REAL reader, not just the pure
  // scanner. Check 11 proves projectMcpServer; this proves nothing downstream
  // of it puts the secret back, and it walks the ENTIRE serialised inventory
  // rather than one entry, because settings.json's own `env`, ~/.claude.json's
  // identity fields and the project history all had to survive being read
  // without being carried.
  {
    const s = JSON.stringify(inv)
    ok(29,
      !s.includes('sk-SHOULD-NEVER-CROSS') && !s.includes('SECRET-ID')
        && !s.includes('a private prompt') && !s.includes('RAILWAY_TOKEN=')
        && !s.includes('"SECRET"') && !s.includes('/h/guard.js'),
      `29 — no settings env value, no identity, no history and no hook command in the whole payload`)
  }

  // 30 — the positive half of 29, without which 29 is satisfied by a reader
  // that returned nothing. The env KEY NAME survives, the hook's PROGRAM
  // survives, and the plugin list survives.
  {
    const railway = inv && inv.entries.find((e) => e.kind === 'mcp' && e.name === 'railway')
    const hook = inv && inv.entries.find((e) => e.kind === 'hook')
    ok(30,
      !!railway && railway.envKeys.join() === 'RAILWAY_TOKEN' && railway.argCount === 2
        && !!hook && hook.program === 'node guard.js' && hook.event === 'PreToolUse'
        && !!inv && inv.pluginsEnabled.join() === 'alpha' && inv.pluginsDisabledCount === 1,
      `30 — env key names, hook program and plugin state all survive the read`)
  }

  // 31 — the skillOverrides split, measured. A BARE key names a filesystem
  // skill and disables it, naming the deciding FILE; a NAMESPACED key can
  // never match a directory this app read and goes to `unresolved` rather
  // than being invented as a row pointing at a file that does not exist.
  {
    const off = named('skill', 'turnedoff', 'user')
    ok(31,
      !!off && off.active.kind === 'disabled' && off.active.by.endsWith('settings.json')
        && !!inv && inv.unresolved.skillOverridesOff.join() === 'plugin:thing',
      `31 — bare override disables and names its file; namespaced override goes unresolved`)
  }

  // 32 — the three MCP scopes, and `local` is the one that is forced by disk
  // rather than invented: ~/.claude.json's projects[cwd].mcpServers is a
  // server configured for exactly this directory and stored in the user's
  // GLOBAL file. Calling it `user` prints a path beside a wrong scope; calling
  // it `project` claims a file the repository cannot commit.
  {
    const scopeOf = (n) => {
      const e = inv && inv.entries.find((x) => x.kind === 'mcp' && x.name === n)
      return e ? e.scope : null
    }
    ok(32, scopeOf('railway') === 'user' && scopeOf('simctl') === 'local'
        && scopeOf('approved') === 'project',
      `32 — three MCP scopes: railway=${scopeOf('railway')} simctl=${scopeOf('simctl')} approved=${scopeOf('approved')}`)
  }

  // 33 — needs-approval reaches the real reader as its own arm, beside an
  // approved sibling from the SAME file. Asserting both in one read is what
  // makes it a distinction rather than a constant.
  {
    const a = inv && inv.entries.find((e) => e.kind === 'mcp' && e.name === 'approved')
    const u = inv && inv.entries.find((e) => e.kind === 'mcp' && e.name === 'unapproved')
    ok(33, !!a && a.active.kind === 'active' && !!u && u.active.kind === 'needs-approval',
      `33 — approved=${a && a.active.kind} unapproved=${u && u.active.kind}`)
  }

  // 34 — a toggle naming a server this app never read is reported as a NAME.
  // Measured: disabledMcpServers names a connector that appears in no
  // mcpServers map anywhere on this machine.
  ok(34, !!inv && inv.unresolved.mcpDisabled.join() === 'ghost-connector',
    `34 — a toggle for an unreadable server is a name, never a fabricated row`)

  // 35 — alsoDefinedIn reports the LINKS and never a shadowing claim. Both
  // rows stay ACTIVE and each names the other's scope, because this app
  // cannot verify how the CLI resolves the collision and marking one inactive
  // would hide a capability the agent actually has.
  {
    const u = named('skill', 'graphify', 'user')
    const pr = named('skill', 'graphify', 'project')
    ok(35,
      !!u && !!pr && u.active.kind === 'active' && pr.active.kind === 'active'
        && u.alsoDefinedIn.join() === 'project' && pr.alsoDefinedIn.join() === 'user',
      `35 — a name in two scopes is two active rows that name each other`)
  }

  /* ------------------------------------------ caps on the real reader -- */

  // 36 is the MEASURED trap, and it is the one cap in this repo that must not
  // be inherited: ~/.claude/settings.json is 64,152 bytes on this machine and
  // MAX_PROMPT_BYTES is 65,536, so copying prompts.ts's cap would put the most
  // important file in the feature 1,384 bytes from being refused — and the
  // refusal reads exactly like "you have no hooks and no permissions".
  ok(36, T.SETTINGS_MAX_BYTES > 64 * 1024 && T.SETTINGS_MAX_BYTES >= 1024 * 1024
      && T.CLAUDE_JSON_MAX_BYTES > T.SETTINGS_MAX_BYTES,
    `36 — settings cap ${T.SETTINGS_MAX_BYTES} clears the measured 64152-byte file`)

  // 37 — a settings file over the cap REFUSES rather than truncating, and
  // says so as its own status. A partial parse of a config file is a
  // different config file, which is why bytes refuse and only counts truncate.
  {
    const BIG = p('big')
    mkdirSync(join(BIG, '.claude'), { recursive: true })
    writeFileSync(join(BIG, '.claude', 'settings.json'),
      '{"x":"' + 'a'.repeat(T.SETTINGS_MAX_BYTES + 16) + '"}')
    const r = T.readToolbox({ cwd: BIG, home: HOME })
    const src = r.inventory.sources.find((s) => s.what === 'settings' && s.scope === 'project')
    ok(37, src.status === 'too-large' && src.bytes > T.SETTINGS_MAX_BYTES && src.cap === T.SETTINGS_MAX_BYTES
        && r.inventory.entries.length > 0,
      `37 — an over-cap settings file is refused and reported, and the REST of the inventory still answers`)
  }

  // 38 — an unreadable source is its own status, distinct from absent. This
  // is the arm that tells a user to go and look, so collapsing it into
  // `absent` makes a real problem indistinguishable from the ordinary case.
  {
    const NOPERM = p('noperm')
    mkdirSync(join(NOPERM, '.claude', 'skills'), { recursive: true })
    chmodSync(join(NOPERM, '.claude', 'skills'), 0o000)
    const r = T.readToolbox({ cwd: NOPERM, home: HOME })
    const src = r.inventory.sources.find((s) => s.what === 'skills' && s.scope === 'project')
    chmodSync(join(NOPERM, '.claude', 'skills'), 0o755)
    ok(38, src.status === 'unreadable' && typeof src.detail === 'string' && src.detail !== '',
      `38 — an unreadable directory is 'unreadable' with an errno, not 'absent': ${src.status}/${src.detail}`)
  }

  /* --------------------------------------- stamps and freshness (39-42) */

  // 39 is the subtle one and the reason configStamps stamps files as well as
  // directories: a directory's mtime does NOT move when a file inside a
  // SUBDIRECTORY changes. Stamping only the directories yields a cache that
  // is correct for every ADDED skill and permanently stale for every EDITED
  // one, with nothing on screen wrong.
  {
    const before = T.configStamps(CWD, HOME)
    const skillFile = join(HOME, '.claude', 'skills', 'graphify', 'SKILL.md')
    ok(39, before.has(skillFile),
      `39 — the stamp vector reaches nested SKILL.md files, not only their directories`)
  }

  // 40 — and editing that nested file is actually DETECTED. 39 alone passes
  // against a stamp map that contains the path with a constant value.
  {
    const before = T.configStamps(CWD, HOME)
    const skillFile = join(HOME, '.claude', 'skills', 'graphify', 'SKILL.md')
    writeFileSync(skillFile, '---\nname: graphify\ndescription: Edited in place, longer now.\n---\n')
    const after = T.configStamps(CWD, HOME)
    const changed = T.changedSince(before, after)
    ok(40, !T.stampsEqual(before, after) && changed.includes(skillFile),
      `40 — an in-place edit to a nested skill file moves the stamps and is named: ${changed.length} changed`)
  }

  // 41 — freshness is THREE arms, and `unknown` is not a defensive branch: it
  // is what a panel that never spawned answers, and what a panel reattached
  // after a full app relaunch answers, both ordinary.
  {
    const noStamp = T.readToolbox({ cwd: CWD, home: HOME })
    const stamps = T.configStamps(CWD, HOME)
    const fresh = T.readToolbox({ cwd: CWD, home: HOME, spawnStamps: stamps })
    writeFileSync(join(HOME, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }))
    const stale = T.readToolbox({ cwd: CWD, home: HOME, spawnStamps: stamps })
    ok(41,
      noStamp.inventory.freshness.kind === 'unknown'
        && fresh.inventory.freshness.kind === 'fresh'
        && stale.inventory.freshness.kind === 'stale'
        && stale.inventory.freshness.changedPaths.some((x) => x.endsWith('settings.json')),
      `41 — unknown / fresh / stale are three arms: ${noStamp.inventory.freshness.kind}, ${fresh.inventory.freshness.kind}, ${stale.inventory.freshness.kind}`)
  }

  // 42 — no-cwd is a FIRST-CLASS arm, not a degenerate inventory. A review
  // node, a file panel and a Jira panel have no directory at all, and the
  // section must render nothing for them: "0 skills" beside a panel that is
  // not an agent is the confident wrong answer that trains a user to stop
  // believing the section — buildUsageFields' own rule.
  ok(42, T.readToolbox({ cwd: '', home: HOME }).kind === 'no-cwd',
    `42 — a panel with no cwd answers no-cwd, never an empty inventory`)

  // 43 — the permission split: COUNTS ride the inventory, RULES ride a second
  // explicit read. Measured 628 and 718 rules in two real files, so carrying
  // them by default would be ~240 KB per panel per selection change for data
  // almost nobody expands — review:diff's pull-only shape, for review:diff's
  // reason.
  {
    const counts = inv.permissions.find((c) => c.scope === 'user')
    const s = JSON.stringify(inv)
    const rules = T.readPermissionRules(join(HOME, '.claude', 'settings.json'), 'allow')
    ok(43,
      !!counts && counts.allow === 2 && counts.deny === 1
        && !s.includes('Bash(cat)')
        && rules.status === 'read' && rules.rules.includes('Bash(ls)'),
      `43 — counts ride the inventory, rule STRINGS do not, and a second read returns them`)
  }

  /* ---- M125: the shelf ---- */
  try {
    const { skillKey, parseSkillKey, placement, pluginPrefixOf, parseShelf, carryShelf,
            renameInShelf, UNGROUPED_COLUMN_ID } = T

    // shelf.1 — the key is a stringified coordinate, never a bare name, and round-trips.
    {
      const a = skillKey('user', 'brainstorming')
      const b = skillKey('project', 'brainstorming')
      const rt = parseSkillKey(a)
      ok('shelf.1a two scopes, one name, two keys', a !== b, `${a} vs ${b}`)
      ok('shelf.1b the key round-trips', rt && rt.scope === 'user' && rt.name === 'brainstorming',
         JSON.stringify(rt))
      ok('shelf.1c a name containing the delimiter does not collide',
         skillKey('user', 'a:b') !== skillKey('user', 'a') + ':b', 'stringified, not joined')
      ok('shelf.1d a malformed key yields null, never a guess', parseSkillKey('nonsense') === null, '')
    }

    // shelf.2 — placement: placed outranks derived, and every answer carries its why.
    {
      const shelf = { columns: [{ id: 'c1', title: 'mobile', keys: [skillKey('user', 'swiftui')] }] }
      const placed = placement(skillKey('user', 'swiftui'), shelf, 'user', 'swiftui')
      const byPlugin = placement(skillKey('user', 'superpowers:brainstorming'), shelf, 'user',
                                 'superpowers:brainstorming')
      const byScope = placement(skillKey('project', 'audit'), shelf, 'project', 'audit')
      ok('shelf.2a placed wins and says so',
         placed.columnId === 'c1' && placed.why === 'placed', JSON.stringify(placed))
      ok('shelf.2b a plugin prefix is the derived column',
         byPlugin.columnId === 'plugin:superpowers' && byPlugin.why === 'by-plugin',
         JSON.stringify(byPlugin))
      ok('shelf.2c no prefix falls back to scope',
         byScope.columnId === 'scope:project' && byScope.why === 'by-scope', JSON.stringify(byScope))
      ok('shelf.2d pluginPrefixOf reads only the FIRST colon',
         pluginPrefixOf('a:b:c') === 'a' && pluginPrefixOf('plain') === null, '')
    }

    // shelf.3 — the record rules: absent, malformed, per-entry drop, and carry.
    {
      const w1 = []
      ok('shelf.3a absent is every pre-M125 file, silently',
         parseShelf(undefined, w1).columns.length === 0 && w1.length === 0, w1.join('|'))
      const w2 = []
      ok('shelf.3b a malformed shelf warns and yields empty',
         parseShelf(42, w2).columns.length === 0 && w2.length === 1, w2.join('|'))
      const w3 = []
      const mixed = parseShelf({ columns: [
        { id: 'good', title: 'ok', keys: [skillKey('user', 'x')] },
        { id: 'bad', title: 7, keys: [] }
      ] }, w3)
      ok('shelf.3c one bad column costs that column, never the shelf',
         mixed.columns.length === 1 && mixed.columns[0].id === 'good' && w3.length === 1, w3.join('|'))
      const carried = carryShelf({ columns: [{ id: 'c', title: 't', keys: [] }] })
      ok('shelf.3d carryShelf writes no undefined key',
         !Object.values(carried.columns[0]).includes(undefined) &&
         Object.keys(carried.columns[0]).sort().join(',') === 'id,keys,title',
         Object.keys(carried.columns[0]).join(','))
    }

    // shelf.4 — a rename carries the slot; a key whose skill is gone KEEPS its slot.
    {
      const from = skillKey('user', 'old'), to = skillKey('user', 'new')
      const before = { columns: [{ id: 'c', title: 't', keys: [from, skillKey('user', 'other')] }] }
      const after = renameInShelf(before, from, to)
      ok('shelf.4a rename replaces in place, preserving order',
         after.columns[0].keys[0] === to && after.columns[0].keys.length === 2,
         JSON.stringify(after.columns[0].keys))
      ok('shelf.4b a rename of an absent key changes nothing',
         JSON.stringify(renameInShelf(before, skillKey('user', 'ghost'), to)) === JSON.stringify(before), '')
      ok('shelf.4c UNGROUPED is a real, reserved id',
         typeof UNGROUPED_COLUMN_ID === 'string' && UNGROUPED_COLUMN_ID.length > 0, UNGROUPED_COLUMN_ID)
    }
  } catch (e) {
    ok('shelf.1 (threw)', false, String(e))
  }

  /* ---- M125: resources, counted at the boundary ---- */
  try {
    const skills = inv.entries.filter((e) => e.kind === 'skill')
    const withRes = skills.find((e) => e.name === 'has-resources')
    const bare = skills.find((e) => e.name === 'bare')
    const locked = skills.find((e) => e.name === 'locked')
    ok('skill.1a a skill with siblings counts them',
       withRes.resources.kind === 'some' && withRes.resources.n === 2,
       JSON.stringify(withRes.resources))
    ok('skill.1b SKILL.md alone is `none`, not `some: 0`',
       bare.resources.kind === 'none', JSON.stringify(bare.resources))
    ok('skill.1c an unlistable directory is `unknown`, NEVER 0',
       locked.resources.kind === 'unknown' && typeof locked.resources.why === 'string',
       JSON.stringify(locked.resources))
    ok('skill.1d the count is capped at the boundary',
       skills.every((e) => e.resources.kind !== 'some' || e.resources.n <= T.RESOURCES_MAX), '')
    ok('skill.1e only skills carry resources',
       inv.entries.filter((e) => e.kind !== 'skill').every((e) => e.resources === undefined),
       'a command has no resources folder')
  } catch (e) {
    ok('skill.1 (threw)', false, String(e))
  } finally {
    // Restore listability before cleanup — an execute-only directory refuses
    // rmSync's own recursive readdir just as it refused ours.
    chmodSync(join(CWD, '.claude', 'skills', 'locked'), 0o755)
  }

  /* ---- M125: a plugin's skills, walked from installPath, total capped ---- */
  try {
    const pluginRoot = p('plugin-demo')
    write(join('plugin-demo', 'skills', '0-from-plugin', 'SKILL.md'),
      '---\nname: 0-from-plugin\ndescription: Ships with the plugin.\n---\n')
    // Enough sibling skill directories to push the TOTAL (user + project +
    // plugin) past SKILLS_MAX, so a cap that were per-source rather than
    // shared would pass this by accident.
    for (let i = 0; i < T.SKILLS_MAX + 10; i++) {
      write(join('plugin-demo', 'skills', `filler-${i}`, 'SKILL.md'),
        `---\nname: filler-${i}\ndescription: Filler.\n---\n`)
    }
    const plugins = [{ id: 'demo-plugin@marketplace', installPath: pluginRoot, enabled: true }]
    const withPlugins = T.readToolbox({ cwd: CWD, home: HOME, plugins })
    const pinv = withPlugins.kind === 'inventory' ? withPlugins.inventory : null
    const skills2 = pinv ? pinv.entries.filter((e) => e.kind === 'skill') : []
    const fromPlugin = skills2.find((e) => e.name === '0-from-plugin')
    ok('skill.2a a plugin skill is stamped with its pluginId and scope user',
       !!fromPlugin && fromPlugin.pluginId === 'demo-plugin@marketplace' && fromPlugin.scope === 'user',
       JSON.stringify(fromPlugin))
    ok('skill.2b a non-plugin skill carries no pluginId key at all',
       skills2.filter((e) => e.name !== '0-from-plugin' && !e.name.startsWith('filler-'))
         .every((e) => !('pluginId' in e)),
       'absent, never pluginId: undefined')
    ok('skill.2c SKILLS_MAX is the TOTAL across scopes and plugins, not per source',
       skills2.length <= T.SKILLS_MAX, `${skills2.length} skills, cap ${T.SKILLS_MAX}`)
  } catch (e) {
    ok('skill.2 (threw)', false, String(e))
  }


  /* ================= M128: the editor ================================== */
  //
  // Every block is wrapped in its own try/catch that records a FAILING ok()
  // rather than letting the throw abort the IIFE. A suite that dies at the
  // first `applySkillEdit is not a function` prints no tally, and its silence
  // is not evidence about the checks below it — this suite's own
  // `skill.1 (threw)` arm is the standing shape.

  /* ---- M128: the frontmatter round-trip. THE check of this milestone. ---- */
  try {
    const { applySkillEdit, frontmatterGrammatical } = T
    const HOSTILE = [
      '---',
      'name: demo',
      '# a comment the grammar does not read',
      'description: before',
      'body: |',
      '  a block scalar',
      '  the small grammar returns null for',
      'anchor: &a value',
      '---',
      '',
      'old body'
    ].join('\n')

    const res = applySkillEdit(HOSTILE, { meta: { description: 'after' }, body: 'new body' })
    ok('edit.1a the save succeeds even though the block is ungrammatical', res.kind === 'ok', res.why)
    const out = res.text
    ok('edit.1b the understood line is rewritten', /^description: after$/m.test(out), out)
    ok('edit.1c the COMMENT survives byte for byte',
       out.includes('# a comment the grammar does not read'), out)
    ok('edit.1d the BLOCK SCALAR survives byte for byte',
       out.includes('body: |\n  a block scalar\n  the small grammar returns null for'), out)
    ok('edit.1e the ANCHOR survives byte for byte', out.includes('anchor: &a value'), out)
    ok('edit.1f ordering is preserved',
       out.indexOf('name: demo') < out.indexOf('description: after') &&
       out.indexOf('description: after') < out.indexOf('anchor:'), out)
    ok('edit.1g the body below the fence is replaced wholesale',
       out.endsWith('new body') && !out.includes('old body'), out)
    ok('edit.1h an ungrammatical block makes METADATA read-only, body still editable',
       frontmatterGrammatical(HOSTILE) === false, 'the three-state rule, applied to editability')
    // A key the block does not carry is APPENDED just above the closing
    // fence — never prepended, which would reorder a block somebody authored.
    const added = applySkillEdit('---\nname: demo\n---\n\nbody\n', { meta: { description: 'new' } })
    ok('edit.1i a missing key is appended above the closing fence, never at the top',
       added.kind === 'ok' && /^---\nname: demo\ndescription: new\n---/.test(added.text),
       added.kind === 'ok' ? JSON.stringify(added.text) : added.why)
    ok('edit.1j a wholly grammatical block is editable',
       frontmatterGrammatical('---\nname: demo\ndescription: x\n---\n\nbody\n') === true, '')
  } catch (e) {
    ok('edit.1 (threw)', false, String(e && e.stack || e))
  }

  /* ---- M128: atomic — no partial SKILL.md after a failed rename ---- */
  try {
    const { writeSkill } = T
    const ORIGINAL = '---\nname: atomic\ndescription: before\n---\n\nbefore body\n'
    const file = write(join('edit', '.claude', 'skills', 'atomic', 'SKILL.md'), ORIGINAL)
    const dir = join(DIR, 'edit', '.claude', 'skills', 'atomic')
    const st = statSync(file)
    const deps = {
      realpath: (x) => x,
      skillRoots: [join(DIR, 'edit', '.claude', 'skills')],
      pluginPaths: [],
      trash: async () => {},
      // The rename is the LAST step, so a failure here is the only way to
      // reach the half-written state this check is about.
      rename: () => { throw new Error('EIO simulated') }
    }
    const r = await writeSkill(file, '---\nname: atomic\ndescription: after\n---\n\nafter body\n', { mtimeMs: st.mtimeMs, size: st.size }, deps)
    ok('edit.2a a failed rename is a named failure, never a silent success',
       r.kind === 'failed' && typeof r.why === 'string' && r.why.length > 0, JSON.stringify(r))
    ok('edit.2b the user\'s file still holds every byte it held before',
       readFileSync(file, 'utf8') === ORIGINAL, JSON.stringify(readFileSync(file, 'utf8')))
    ok('edit.2c no temp file is left beside it',
       readdirSync(dir).join(',') === 'SKILL.md', readdirSync(dir).join(','))
    // And the ordinary path writes, atomically, answering the NEW stamp so
    // the panel's next save is not instantly stale against its own write.
    const r2 = await writeSkill(file, '---\nname: atomic\ndescription: after\n---\n\nafter body\n',
      { mtimeMs: st.mtimeMs, size: st.size }, { ...deps, rename: undefined })
    ok('edit.2d the ordinary write lands and answers the new stamp',
       r2.kind === 'written' && readFileSync(file, 'utf8').includes('after body') &&
       typeof r2.stamp.mtimeMs === 'number' && r2.stamp.size === Buffer.byteLength(readFileSync(file, 'utf8')),
       JSON.stringify(r2))
  } catch (e) {
    ok('edit.2 (threw)', false, String(e && e.stack || e))
  }

  /* ---- M128: containment, over a FAKE realpath ---- */
  try {
    const { writeSkill } = T
    const ROOT = '/roots/user/.claude/skills'
    // Identity except for the one symlink, which points OUT of the root: the
    // real path decides, which is `insidePlace`'s own rule (places.2), reused
    // here rather than re-implemented at a second security boundary.
    const realpath = (x) => x.startsWith('/roots/user/.claude/skills/evil')
      ? x.replace('/roots/user/.claude/skills/evil', '/elsewhere/evil')
      : x
    const deps = { realpath, skillRoots: [ROOT], pluginPaths: [{ id: 'superpowers', installPath: '/plugins/superpowers' }], trash: async () => {} }
    const stamp = { mtimeMs: 1, size: 1 }
    const dots = await writeSkill(`${ROOT}/../../../etc/skills/x/SKILL.md`, 'x', stamp, deps)
    ok('edit.3a `..` walking out of a root that looked right is refused',
       dots.kind === 'refused' && /outside/i.test(dots.why), JSON.stringify(dots))
    const link = await writeSkill(`${ROOT}/evil/SKILL.md`, 'x', stamp, deps)
    ok('edit.3b a symlink inside the root pointing OUT is refused on the real path',
       link.kind === 'refused' && /outside/i.test(link.why), JSON.stringify(link))
    const rel = await writeSkill('skills/x/SKILL.md', 'x', stamp, deps)
    ok('edit.3c a relative path is refused outright, never resolved against a guess',
       rel.kind === 'refused' && /absolute/i.test(rel.why), JSON.stringify(rel))
    const plug = await writeSkill('/plugins/superpowers/skills/foo/SKILL.md', 'x', stamp, deps)
    ok('edit.3d a target under a plugin installPath is refused NAMING the plugin',
       plug.kind === 'refused' && plug.why.includes('superpowers') && /upgrade|install/i.test(plug.why),
       JSON.stringify(plug))
    const agent = await writeSkill(`${ROOT}/../agents/reviewer.md`, 'x', stamp, deps)
    ok('edit.3e only a SKILL.md is writable — an agent file is refused by name',
       agent.kind === 'refused', JSON.stringify(agent))
  } catch (e) {
    ok('edit.3 (threw)', false, String(e && e.stack || e))
  }

  /* ---- M128: the stale write ---- */
  try {
    const { writeSkill, staleRefusal } = T
    const file = write(join('edit', '.claude', 'skills', 'stale', 'SKILL.md'), '---\nname: stale\n---\n\nas read\n')
    const readStamp = { mtimeMs: statSync(file).mtimeMs, size: statSync(file).size }
    // The ordinary case in this application, not an edge case: `Help me
    // write` is an agent editing this very file while the panel holds it.
    writeFileSync(file, '---\nname: stale\n---\n\nthe agent wrote this\n')
    const r = await writeSkill(file, '---\nname: stale\n---\n\nthe user typed this\n', readStamp, {
      realpath: (x) => x, skillRoots: [join(DIR, 'edit', '.claude', 'skills')], pluginPaths: [], trash: async () => {}
    })
    ok('edit.4a a write whose stamp no longer matches disk is REFUSED',
       r.kind === 'refused', JSON.stringify(r))
    ok('edit.4b the refusal names the fix and says the text is still there',
       r.kind === 'refused' && r.why === staleRefusal() && /reload/i.test(r.why) && /still here/i.test(r.why),
       r.kind === 'refused' ? r.why : '')
    ok('edit.4c never last-write-wins: the agent\'s bytes are untouched',
       readFileSync(file, 'utf8').includes('the agent wrote this'), readFileSync(file, 'utf8'))
  } catch (e) {
    ok('edit.4 (threw)', false, String(e && e.stack || e))
  }

  /* ---- M128: create, rename, delete ---- */
  try {
    const { createSkill, renameSkill, deleteSkill, renameInShelf, skillKey } = T
    const root = join(DIR, 'edit', '.claude', 'skills')
    const trashed = []
    const deps = { realpath: (x) => x, skillRoots: [root], pluginPaths: [], trash: async (path) => { trashed.push(path) } }

    const made = await createSkill(root, 'fresh-one', deps)
    ok('edit.5a create scaffolds <root>/<name>/SKILL.md with a frontmatter stub',
       made.kind === 'created' && readFileSync(join(root, 'fresh-one', 'SKILL.md'), 'utf8').startsWith('---\n'),
       JSON.stringify(made))
    const again = await createSkill(root, 'fresh-one', deps)
    ok('edit.5b an existing name is refused BY THAT NAME, never overwritten',
       again.kind === 'refused' && again.why.includes('fresh-one'), JSON.stringify(again))

    const moved = await renameSkill(join(root, 'fresh-one'), join(root, 'fresh-two'), deps)
    ok('edit.5c rename moves the directory', moved.kind === 'renamed' &&
       readdirSync(root).includes('fresh-two') && !readdirSync(root).includes('fresh-one'), JSON.stringify(moved))
    await createSkill(root, 'occupied', deps)
    const collide = await renameSkill(join(root, 'fresh-two'), join(root, 'occupied'), deps)
    ok('edit.5d a rename onto an existing name is REFUSED, never an overwrite',
       collide.kind === 'refused' && readdirSync(root).includes('fresh-two'), JSON.stringify(collide))

    // The shelf key is `scope:name`, so the rename changes it; a rename that
    // could not be carried leaves the old key rendering `not installed here`.
    const before = { columns: [{ id: 'c', title: 't', keys: [skillKey('user', 'fresh-one')] }] }
    const after = renameInShelf(before, skillKey('user', 'fresh-one'), skillKey('user', 'fresh-two'))
    ok('edit.5e renameInShelf carries the slot rather than dropping the entry',
       after.columns[0].keys.length === 1 && after.columns[0].keys[0] === skillKey('user', 'fresh-two'),
       JSON.stringify(after.columns[0].keys))

    const gone = await deleteSkill(join(root, 'fresh-two'), deps)
    ok('edit.5f delete calls the injected trash on the skill\'s DIRECTORY',
       gone.kind === 'deleted' && trashed.length === 1 && trashed[0] === join(root, 'fresh-two'),
       JSON.stringify({ gone, trashed }))
    // Pinned as TEXT: the Finder is the undo, and an unlink would remove that
    // recovery path with nothing on screen saying it had.
    const src = readFileSync(join(__dirname, '..', 'src', 'main', 'skill-write.ts'), 'utf8')
    ok('edit.5g skill-write.ts never unlinks — the trash is the only removal',
       !/unlink/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), 'unlink found in source')
  } catch (e) {
    ok('edit.5 (threw)', false, String(e && e.stack || e))
  }

  /* ------------------------------------------------------- report ----- */
  console.log('')
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  rmSync(DIR, { recursive: true, force: true })
  process.exit(failed.length === 0 ? 0 : 1)
})()
