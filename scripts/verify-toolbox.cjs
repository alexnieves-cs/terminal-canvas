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
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } = require('node:fs')
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

  /* ------------------------------------------------------- report ----- */
  console.log('')
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  rmSync(DIR, { recursive: true, force: true })
  process.exit(failed.length === 0 ? 0 : 1)
})()
