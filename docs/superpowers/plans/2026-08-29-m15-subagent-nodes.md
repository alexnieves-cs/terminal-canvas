# M15: Subagent nodes on the canvas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an agent's subagents as live nodes on the canvas, beside the panel that spawned them, read from Claude Code's own per-session `subagents/` directory.

**Architecture:** Main polls each panel's Claude Code session directory on the existing 2s live tick, dedupes, and sends one `subagent:state` event. The renderer holds the result in a module-level store subscribed per parent panel id, and a new `SubagentLayer` inside `.world` draws a node per subagent with an edge to its parent. Nodes are **derived, never persisted** — they are not `Panel`s and never reach tiering, so they cannot hold a PTY, a WebGL context or a `LIVE_BUDGET` slot.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React 18, esbuild for the plain-node verify tier. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-m15-subagent-nodes-design.md` — read it before Task 1. The plan argues from it and does not restate its reasoning.

## Global Constraints

Copied verbatim from the spec and from `CLAUDE.md`. Every task's requirements implicitly include these.

- **Never bump `registry.version()`** from anything in this milestone. That counter moves only on tier/status/focus/exit; a 2s-tick fact riding it re-renders every panel on every other panel's fan-out.
- **`verify:ipc` stays at 31.** `subagent:state` is an `IPC_EVENTS` member, handled by nobody. `verify:ipc` asserts over `Object.values(IPC)` — invoke channels only. Do not add an invoke, and do not "fix" the count.
- **`verify:meta` 14 requires every channel in the README's architecture diagram**, and it is scoped to the single fenced block containing `--invoke-->`. Adding `subagent:state` to `ipc-contract.ts` without adding it to that fence turns `verify:meta` red.
- **`verify:meta` 19 requires every `verify:*` npm script to be in the `verify` chain** (except `verify:packaged`). Adding `verify:subagent` without adding it to the chain turns `verify:meta` red.
- **Fixtures live in a directory whose path contains a space** (`mkdtempSync(join(tmpdir(), 'tc subagent '))`). Standing rule since the `pane-died` quoting bug.
- **Fixtures must be fenced to their own fake `~/.claude` root.** No suite may read the running developer's real transcripts. This is M9a's git-fence lesson, which cost that milestone a fix round.
- **No `process.env` reads in renderer code.** electron-vite compiles it to `{}`.
- **Comments explain *why*.** Match the density of the surrounding file; a non-obvious line with no reason attached gets "fixed" later.
- **Every parse failure is an absent node, never a thrown error.** This is a format the repo does not own.
- **Commits:** conventional, scoped `feat(m15):` / `fix(m15):` / `docs(m15):`, ending with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `src/main/subagent-scan.ts` | **Create.** Pure. Slug derivation, `.meta.json` parsing, session choice, cross-panel ambiguity, `tool_result` scanning. No `fs`, no `electron`. |
| `src/main/subagent-watch.ts` | **Create.** Per-panel state (claimed dir, known records, transcript byte offset). Takes its filesystem reads as injected deps. |
| `src/shared/types.ts` | **Modify.** `SubagentRecord`, `SubagentUpdate`. |
| `src/shared/ipc-contract.ts` | **Modify.** `IPC_EVENTS.SUBAGENT_STATE`, bridge type member. |
| `src/preload/index.ts` | **Modify.** `session.onSubagents`. |
| `src/main/pty-manager.ts` | **Modify.** Construct the watcher; call it from `pollLive`; clear per panel alongside `lastLive`. |
| `src/renderer/session/subagent-store.ts` | **Create.** Module-level store, per parent panel id, cached snapshot. |
| `src/renderer/canvas/SubagentLayer.tsx` | **Create.** The layer inside `.world`. |
| `src/renderer/canvas/Canvas.tsx` | **Modify.** One subscription, three clears, one render site. |
| `src/renderer/styles.css` | **Modify.** Node and edge styling, from existing tokens only. |
| `scripts/subagent-entry.cjs`, `scripts/verify-subagent.cjs` | **Create.** New plain-node suite. |
| `scripts/verify-pty-manager.cjs`, `scripts/verify-panels.cjs` | **Modify.** One check each. |
| `package.json` | **Modify.** `verify:subagent` script + chain. |
| `README.md`, `CLAUDE.md`, `docs/ideas-backlog.md` | **Modify.** Diagram, suite table, milestone row, delete #7. |

---

### Task 1: The pure scanner

**Files:**
- Create: `src/main/subagent-scan.ts`
- Create: `scripts/subagent-entry.cjs`
- Create: `scripts/verify-subagent.cjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface SubagentMeta {
    agentType: string
    description: string
    toolUseId: string
    spawnDepth: number
    model: string
  }
  export function slugFor(cwd: string): string
  export function parseMeta(text: string): SubagentMeta | null
  export function cwdOf(firstLine: string): string | null
  export function chooseSession(
    dirs: ReadonlyArray<{ name: string; createdAt: number }>,
    spawnedAt: number
  ): string | null
  export function attributable(slugs: ReadonlyMap<string, string | null>): Set<string>
  export function scanForResults(chunk: string, ids: ReadonlySet<string>): Set<string>
  ```

- [ ] **Step 1: Write the failing suite**

Create `scripts/subagent-entry.cjs`:

```js
/* Bundle entry for the pure subagent scanner. No fs, no electron, no node-pty,
   so the suite runs under plain node — the same tier git-args.ts and
   tmux-args.ts already sit in, and for the same reason. */
module.exports = {
  ...require('../src/main/subagent-scan')
}
```

Create `scripts/verify-subagent.cjs`:

```js
/* Verifies the pure half of M15's subagent detection.
   Run with: npm run verify:subagent

   Plain node: subagent-scan.ts imports nothing at all, so the milestone's
   most easily-wrong piece — a slug mapping inferred from directory names, and
   a refusal that must not refuse everything — sits in the fastest tier. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'out', 'verify', 'subagent.cjs')
buildSync({
  entryPoints: [join(__dirname, 'subagent-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Nothing in this bundle imports from @shared today. Carried pre-emptively
  // for the reason CLAUDE.md records about verify-palette.cjs: needing no
  // alias YET is exactly the state verify-viewport.cjs was in until it broke.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const S = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

// 1-3. The slug. Every expectation here is a REAL directory name observed
// under ~/.claude/projects, not a guess about the rule — the rule was inferred
// from them, so restating them is what keeps the inference honest.
ok('1 a plain path slugs to its dashed form',
  S.slugFor('/Users/me/Documents/terminal-canvas') === '-Users-me-Documents-terminal-canvas',
  S.slugFor('/Users/me/Documents/terminal-canvas'))

// A dot becomes a dash, which is why a worktree path yields a DOUBLE dash at
// `/.claude`. This is the case a naive `split('/').join('-')` gets wrong, and
// it is the common one in this repo: every worktree lives under `.claude`.
ok('2 a dot becomes a dash, so /.claude yields a double dash',
  S.slugFor('/Users/me/tc/.claude/worktrees/m15') === '-Users-me-tc--claude-worktrees-m15',
  S.slugFor('/Users/me/tc/.claude/worktrees/m15'))

ok('3 digits survive, so a numbered path is not mangled',
  S.slugFor('/private/tmp/claude-501/x') === '-private-tmp-claude-501-x',
  S.slugFor('/private/tmp/claude-501/x'))

// 4-6. parseMeta. The format belongs to Claude Code, not to this repo, so
// tolerance is the requirement and not defensiveness.
{
  const good = JSON.stringify({
    agentType: 'general-purpose', description: 'Review Task 5',
    toolUseId: 'toolu_01A', spawnDepth: 1, model: 'sonnet'
  })
  const m = S.parseMeta(good)
  ok('4 a well-formed meta parses to every field',
    m !== null && m.agentType === 'general-purpose' && m.description === 'Review Task 5' &&
      m.toolUseId === 'toolu_01A' && m.spawnDepth === 1 && m.model === 'sonnet',
    JSON.stringify(m))
}

// An UNKNOWN extra field must be ignored rather than rejected. This is the
// forward-compatibility half: Claude Code will add fields, and a parser that
// refused an unfamiliar one would turn every future release into "the feature
// stopped working" with nothing saying why.
{
  const m = S.parseMeta(JSON.stringify({
    agentType: 'explore', description: 'd', toolUseId: 't', spawnDepth: 2,
    model: 'haiku', somethingNew: { nested: true }
  }))
  ok('5 an unknown extra field is ignored, not rejected',
    m !== null && m.agentType === 'explore' && m.spawnDepth === 2, JSON.stringify(m))
}

// The other direction, and the one that matters on disk: a meta MISSING the
// toolUseId cannot ever be completed, so it is dropped rather than carried as
// a node that would say `running` forever. Non-JSON is dropped for the same
// reason. Neither may throw — this runs per file per tick.
ok('6 a meta with no toolUseId is dropped, and malformed JSON is dropped, without throwing',
  S.parseMeta(JSON.stringify({ agentType: 'a', description: 'd' })) === null &&
    S.parseMeta('{not json') === null && S.parseMeta('') === null)

// 7. cwdOf — the confirmation read. The slug is a HINT derived from an
// undocumented mapping; this is what makes being wrong about it harmless.
ok('7 cwdOf reads the cwd off a transcript line, and answers null for a line without one',
  S.cwdOf(JSON.stringify({ type: 'user', cwd: '/repo/x', sessionId: 's' })) === '/repo/x' &&
    S.cwdOf(JSON.stringify({ type: 'summary' })) === null &&
    S.cwdOf('garbage') === null)

// 8-10. chooseSession.
{
  const dirs = [
    { name: 'old-session', createdAt: 100 },
    { name: 'new-session', createdAt: 300 },
    { name: 'newest-session', createdAt: 400 }
  ]
  ok('8 the most recent session that post-dates the spawn wins',
    S.chooseSession(dirs, 200) === 'newest-session', S.chooseSession(dirs, 200))

  // The pre-spawn exclusion is the half that stops a panel adopting the
  // session of whatever ran in that directory yesterday — which would attach
  // a stranger's finished subagents to a panel that has spawned nothing.
  ok('9 a session created BEFORE the panel spawned is never claimed',
    S.chooseSession([{ name: 'old-session', createdAt: 100 }], 200) === null)

  ok('10 no directories at all is null, not a throw',
    S.chooseSession([], 200) === null)
}

// 11-12. attributable — the refusal, and the guard against over-correcting.
// The map is panelId -> slug; a null slug is a panel with no directory to
// resolve (a plain shell), which must not make its neighbours ambiguous.
{
  const two = new Map([['n1', '-repo'], ['n2', '-repo'], ['n3', '-other']])
  const allowed = S.attributable(two)
  ok('11 two panels in one repository attribute to NEITHER, while a third elsewhere is unaffected',
    !allowed.has('n1') && !allowed.has('n2') && allowed.has('n3'),
    [...allowed].join(','))
}

// THE OVER-CORRECTION GUARD, and the reason 11 is not enough on its own: an
// implementation that refuses everything satisfies 11 perfectly and ships a
// feature that never once produces a node. Same shape as verify:review 37b.
{
  const one = new Map([['n1', '-repo'], ['n2', null], ['n3', null]])
  const allowed = S.attributable(one)
  ok('12 a single panel in a repository IS attributed — the refusal must not refuse everything',
    allowed.has('n1') && allowed.size === 1, [...allowed].join(','))
}

// 13-14. scanForResults. The discriminating clause is that a tool_use is NOT
// a completion: the same toolUseId appears twice in a parent transcript, once
// when the subagent is spawned and once when it ends, so a scanner matching
// the bare id would mark every subagent done the instant it started — a node
// that is never once seen running, which is the whole feature.
{
  const ids = new Set(['toolu_01A', 'toolu_01B'])
  const spawnLine = JSON.stringify({
    message: { content: [{ type: 'tool_use', id: 'toolu_01A', name: 'Task' }] }
  })
  ok('13 a tool_use carrying the id is NOT a completion',
    S.scanForResults(spawnLine, ids).size === 0)

  const resultLine = JSON.stringify({
    message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_01A' }] }
  })
  const found = S.scanForResults(spawnLine + '\n' + resultLine, ids)
  ok('14 a tool_result completes exactly its own id and no other',
    found.has('toolu_01A') && !found.has('toolu_01B'), [...found].join(','))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
```

Add to `package.json` `"scripts"`, after `"verify:review"`:

```json
"verify:subagent": "node scripts/verify-subagent.cjs",
```

and insert `npm run verify:subagent && ` into the `"verify"` chain immediately after `npm run verify:review && ` (required by `verify:meta` 19).

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run verify:subagent`
Expected: FAIL — esbuild cannot resolve `../src/main/subagent-scan`. That is a build error, not an assertion failure, so **no check runs at all**. Note that: a thrown error aborts the whole script, so this run proves nothing about individual checks. After Step 3 you will see them fail individually.

- [ ] **Step 3: Create the module with every function returning a wrong answer**

Create `src/main/subagent-scan.ts` with the exact signatures from **Interfaces** above, each body `throw new Error('not implemented')` replaced by a trivially wrong constant (`return null`, `return new Set()`, `return ''`). Do **not** implement yet.

- [ ] **Step 4: Run and confirm each check fails individually**

Run: `npm run verify:subagent`
Expected: `0/14 passed`, with all fourteen listed. **Record the count.** If any check passes here it is asserting nothing and must be rewritten before you continue.

- [ ] **Step 5: Implement**

```ts
/**
 * The pure half of subagent detection: no fs, no electron, no node-pty, which
 * is what puts it in the plain-node verify tier beside git-args.ts.
 *
 * Everything here reads a format this repo does not own and cannot version.
 * The rule throughout is therefore that a surprise costs a NODE, never a
 * throw: this code runs per file, per panel, per 2s tick.
 */

export interface SubagentMeta {
  agentType: string
  description: string
  toolUseId: string
  spawnDepth: number
  model: string
}

/**
 * The project directory Claude Code derives from a cwd.
 *
 * INFERRED, not documented — read off 31 real directory names, every one of
 * which is consistent with "anything outside [A-Za-z0-9] becomes a dash".
 * `/repo/.claude/x` therefore yields `-repo--claude-x`: the double dash is the
 * dot AND the slash, and it is the case a `split('/').join('-')` gets wrong.
 *
 * None of those 31 samples contained an underscore or a space, so those two
 * are genuinely unknown. That is exactly why nothing trusts this answer — see
 * cwdOf: a claimed session is confirmed against its own recorded cwd, so a
 * wrong slug costs the feature rather than misattributing it.
 */
export function slugFor(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-')
}

/** A `.meta.json` sidecar, or null if it cannot be trusted. */
export function parseMeta(text: string): SubagentMeta | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  // toolUseId is REQUIRED and the others are not, because it is the only field
  // completion is keyed on: a record without it could never leave `running`,
  // and a node stuck running forever is worse than no node. The rest are
  // labels, and a missing label is a cosmetic gap.
  if (typeof o.toolUseId !== 'string' || o.toolUseId === '') return null
  return {
    agentType: typeof o.agentType === 'string' ? o.agentType : 'agent',
    description: typeof o.description === 'string' ? o.description : '',
    toolUseId: o.toolUseId,
    spawnDepth: typeof o.spawnDepth === 'number' ? o.spawnDepth : 1,
    model: typeof o.model === 'string' ? o.model : ''
  }
  // Unknown extra fields are ignored by construction: this rebuilds the object
  // field by field rather than spreading, the same rule M5a's absent `command`
  // already forces on four other layers.
}

/**
 * The cwd a transcript line records. This is the CONFIRMATION that makes
 * slugFor's inferred mapping safe to be wrong about.
 */
export function cwdOf(firstLine: string): string | null {
  try {
    const o = JSON.parse(firstLine) as Record<string, unknown>
    return typeof o.cwd === 'string' ? o.cwd : null
  } catch {
    return null
  }
}

/**
 * Which session directory a panel claims: the most recent one created after
 * the panel spawned, or none.
 *
 * The post-spawn filter is not a tidiness rule. Without it a panel running a
 * plain shell in a directory somebody used yesterday adopts that session and
 * renders its finished subagents — a canvas confidently attributing a
 * stranger's work to a panel that has spawned nothing.
 */
export function chooseSession(
  dirs: ReadonlyArray<{ name: string; createdAt: number }>,
  spawnedAt: number
): string | null {
  let best: { name: string; createdAt: number } | null = null
  for (const d of dirs) {
    if (d.createdAt < spawnedAt) continue
    if (!best || d.createdAt > best.createdAt) best = d
  }
  return best ? best.name : null
}

/**
 * Which panels may be attributed at all, given every panel's slug at once.
 *
 * A fact about the CANVAS, not about the filesystem, which is why it is a
 * separate function from chooseSession and takes the whole map: a per-panel
 * signature could not express it. Two panels in one repository is the ordinary
 * case in this app, and nothing on disk can tell "both are running claude"
 * from "one is running a shell" — a shell leaves no trace to rule it out. So
 * the strict direction is the correct one: refuse both.
 *
 * A null slug is a panel with no directory to resolve. It contributes nothing
 * and must not make its neighbours ambiguous, or one shell panel would disable
 * the feature for the whole canvas.
 */
export function attributable(slugs: ReadonlyMap<string, string | null>): Set<string> {
  const count = new Map<string, number>()
  for (const slug of slugs.values()) {
    if (slug === null) continue
    count.set(slug, (count.get(slug) ?? 0) + 1)
  }
  const allowed = new Set<string>()
  for (const [panelId, slug] of slugs) {
    if (slug === null) continue
    if (count.get(slug) === 1) allowed.add(panelId)
  }
  return allowed
}

/**
 * Which of `ids` appear as a COMPLETED tool_result in this chunk.
 *
 * The `tool_result` test is the whole function. Each toolUseId appears twice
 * in a parent transcript — as the tool_use that spawned the subagent and as
 * the tool_result that ended it — so a scan for the bare id marks every
 * subagent finished the instant it starts, and no node is ever seen running.
 */
export function scanForResults(chunk: string, ids: ReadonlySet<string>): Set<string> {
  const done = new Set<string>()
  if (ids.size === 0) return done
  for (const id of ids) {
    // Matched as a tool_use_id VALUE rather than by parsing every line: a
    // chunk is up to a tick's worth of appended transcript and may end
    // mid-line, so JSON.parse per line would drop the tail. The quoted-key
    // form is what keeps this from matching the spawning tool_use, whose id
    // sits under "id" instead.
    if (chunk.includes(`"tool_use_id":"${id}"`)) done.add(id)
  }
  return done
}
```

- [ ] **Step 6: Run and confirm all pass**

Run: `npm run verify:subagent`
Expected: `14/14 passed`

- [ ] **Step 7: Confirm the meta suite still passes**

Run: `npm run verify:meta`
Expected: all pass. Check 19 is the one at risk — it goes red if `verify:subagent` is not in the chain.

- [ ] **Step 8: Commit**

```bash
git add src/main/subagent-scan.ts scripts/subagent-entry.cjs scripts/verify-subagent.cjs package.json
git commit -m "$(cat <<'EOF'
feat(m15): the pure scanner, and a slug that is a hint rather than an oracle

The mapping from a cwd to a Claude Code project directory is undocumented and
was inferred from 31 real directory names. cwdOf is what makes being wrong
about it harmless: a claimed session is confirmed against its own recorded
cwd, so a bad slug costs the feature instead of misattributing it.

Check 12 is the one worth knowing by number. An `attributable` that refuses
everything satisfies check 11 perfectly and ships a feature that never once
produces a node.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The watcher

**Files:**
- Create: `src/main/subagent-watch.ts`
- Modify: `scripts/subagent-entry.cjs`
- Modify: `scripts/verify-subagent.cjs` (append checks 15–20)

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  ```ts
  export interface SubagentRecordInternal {
    id: string            // the agent file's basename, e.g. 'agent-a39674afc5b8a0f44'
    agentType: string
    description: string
    model: string
    spawnDepth: number
    toolUseId: string
    state: 'running' | 'done'
    startedAt: number
  }
  export interface WatchDeps {
    /** Directory entries with creation times, or null if the directory is absent. */
    listDirs(path: string): Array<{ name: string; createdAt: number }> | null
    /** File names in a directory, or null if absent. */
    listFiles(path: string): string[] | null
    /** Whole-file read, or null on any failure. */
    readText(path: string): string | null
    /** Bytes [from..EOF] plus the new EOF offset, or null on any failure. */
    readFrom(path: string, from: number): { text: string; end: number } | null
    /** File size in bytes, or null if absent. */
    sizeOf(path: string): number | null
    projectsRoot: string
    now(): number
  }
  export const BACK_SCAN_BYTES = 262144
  export class SubagentWatch {
    constructor(deps: WatchDeps)
    /** One tick. Returns only panels whose record list CHANGED. */
    poll(panels: ReadonlyArray<{ panelId: string; cwd: string; spawnedAt: number }>):
      Array<{ panelId: string; records: SubagentRecordInternal[]; ambiguous: boolean }>
    /** A panel is gone: drop its offset, its claimed dir and its records. */
    drop(panelId: string): void
    /** Every panel is gone (a reload). */
    clear(): void
  }
  ```

- [ ] **Step 1: Add the module to the bundle entry**

Modify `scripts/subagent-entry.cjs` to spread `require('../src/main/subagent-watch')` alongside the scanner.

- [ ] **Step 2: Write the failing checks**

Append to `scripts/verify-subagent.cjs`, before the summary block:

```js
// ---------------------------------------------------------------------------
// 15-20. The watcher, against a FAKE filesystem. subagent-watch.ts takes its
// reads as injected deps for the reason review-engine.ts takes its GitRunner:
// the whole state machine is drivable with no real ~/.claude in earshot.

const fakeFs = (tree) => {
  // tree: { 'path': ['file', ...] } for listings, { 'path': 'text' } for files.
  const reads = []
  return {
    reads,
    listDirs: (p) => (tree.dirs[p] ?? null),
    listFiles: (p) => (tree.files[p] ?? null),
    readText: (p) => { reads.push(p); return tree.text[p] ?? null },
    readFrom: (p, from) => {
      const t = tree.text[p]
      if (t === undefined) return null
      reads.push(`${p}@${from}`)
      return { text: t.slice(from), end: t.length }
    },
    sizeOf: (p) => (tree.text[p] === undefined ? null : tree.text[p].length),
    projectsRoot: '/root',
    now: () => 1000
  }
}

const META = (id, tool) => JSON.stringify({
  agentType: 'general-purpose', description: `d-${id}`,
  toolUseId: tool, spawnDepth: 1, model: 'sonnet'
})

const tree1 = () => ({
  dirs: { '/root/-repo': [{ name: 'S1', createdAt: 500 }] },
  files: { '/root/-repo/S1/subagents': ['agent-a1.meta.json', 'agent-a1.jsonl'] },
  text: {
    '/root/-repo/S1/subagents/agent-a1.meta.json': META('a1', 'toolu_01A'),
    '/root/-repo/S1.jsonl': JSON.stringify({ type: 'user', cwd: '/repo' }) + '\n'
  }
})

{
  const w = new S.SubagentWatch(fakeFs(tree1()))
  const out = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('15 a meta file in subagents/ becomes one running record',
    out.length === 1 && out[0].panelId === 'n1' && out[0].records.length === 1 &&
      out[0].records[0].state === 'running' && out[0].records[0].description === 'd-a1',
    JSON.stringify(out))
}

// THE DEDUPE, and it is the design rather than an optimisation. Its failure
// changes no pixel — it shows up as heat — so the only thing that can ever
// notice it is a check that COUNTS. A second poll with nothing changed must
// report nothing at all.
{
  const w = new S.SubagentWatch(fakeFs(tree1()))
  w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  const again = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('16 an unchanged second poll reports NOTHING', again.length === 0, JSON.stringify(again))
}

// The confirmation read. A session whose own transcript records a DIFFERENT
// cwd is not this panel's, however well the slug matched — which is what makes
// slugFor safe to be wrong about.
{
  const t = tree1()
  t.text['/root/-repo/S1.jsonl'] = JSON.stringify({ type: 'user', cwd: '/somewhere/else' }) + '\n'
  const w = new S.SubagentWatch(fakeFs(t))
  const out = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('17 a session whose recorded cwd disagrees is not claimed',
    out.length === 0 || out[0].records.length === 0, JSON.stringify(out))
}

// Completion, through the tail read.
{
  const t = tree1()
  const w = new S.SubagentWatch(fakeFs(t))
  w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  t.text['/root/-repo/S1.jsonl'] +=
    JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_01A' }] } }) + '\n'
  const out = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('18 a tool_result appended to the parent transcript moves the record to done',
    out.length === 1 && out[0].records[0].state === 'done', JSON.stringify(out))
}

// The offset. Re-reading a megabyte every 2s is invisible on screen and shows
// up only as heat, so this asserts the READ ARGUMENT rather than an outcome —
// the one place the cost is observable at all.
{
  const t = tree1()
  const fs = fakeFs(t)
  const w = new S.SubagentWatch(fs)
  w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  const before = t.text['/root/-repo/S1.jsonl'].length
  t.text['/root/-repo/S1.jsonl'] += 'x'
  fs.reads.length = 0
  w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('19 the second read starts at the previous EOF, not at 0',
    fs.reads.some((r) => r === `/root/-repo/S1.jsonl@${before}`) &&
      !fs.reads.some((r) => r === '/root/-repo/S1.jsonl@0'),
    fs.reads.join(' '))
}

// The ambiguity refusal reaching the watcher, and reported as a FLAG rather
// than as silence: an absent feature must not look like a broken one.
{
  const w = new S.SubagentWatch(fakeFs(tree1()))
  const out = w.poll([
    { panelId: 'n1', cwd: '/repo', spawnedAt: 100 },
    { panelId: 'n2', cwd: '/repo', spawnedAt: 100 }
  ])
  ok('20 two panels in one repository each report ambiguous with no records',
    out.length === 2 && out.every((o) => o.ambiguous === true && o.records.length === 0),
    JSON.stringify(out))
}
```

- [ ] **Step 3: Run and confirm the six fail**

Run: `npm run verify:subagent`
Expected: `14/20 passed`, with 15–20 failing. If the run aborts with a `TypeError` instead, `SubagentWatch` does not exist yet — create it as an empty class whose `poll` returns `[]`, then re-run so the six fail *individually*. A throw aborts the process and every check after it, so a run that ends early is not evidence about any of them.

- [ ] **Step 4: Implement `src/main/subagent-watch.ts`**

Per-panel state is `{ sessionDir, offset, records: Map<toolUseId, record>, lastKey }`. `poll` does, for each panel:

1. `slugFor(cwd)`; build the panel→slug map and call `attributable`. A panel not in the returned set reports `{ records: [], ambiguous: true }` and its state is dropped.
2. If no `sessionDir` claimed yet: `listDirs(projectsRoot + '/' + slug)`, `chooseSession(dirs, spawnedAt)`, then **confirm** — `readText(<dir>.jsonl)`, take the first line, `cwdOf`, and require it to equal the panel's cwd. On any failure, claim nothing and return no change.
3. On first claim, set `offset = max(0, sizeOf(parent) - BACK_SCAN_BYTES)` — the bounded back-scan, so a subagent already finished before we attached is settled rather than stuck running.
4. `listFiles(<dir>/subagents)`; for each `*.meta.json` not already known, `readText` + `parseMeta` → a `running` record with `startedAt: now()`.
5. `readFrom(parent, offset)` → `scanForResults(text, runningIds)` → mark done; `offset = end`.
6. Build a dedupe key — `JSON.stringify` of the records, for the reason `railSignature` uses it rather than a join: `description` is model-authored text that may contain any separator. Return the panel only if the key changed.

Every `deps` call may answer `null`; each one is an ordinary state and must `continue`, never throw.

- [ ] **Step 5: Run and confirm all pass**

Run: `npm run verify:subagent`
Expected: `20/20 passed`

- [ ] **Step 6: Commit**

```bash
git add src/main/subagent-watch.ts scripts/subagent-entry.cjs scripts/verify-subagent.cjs
git commit -m "$(cat <<'EOF'
feat(m15): the watcher — a claimed session, a byte offset, and a dedupe

Check 16 is the dedupe and check 19 is the offset, and neither failure is
visible on screen: both show up as heat. They are the only two things in the
repo that would ever notice, which is why both assert a COUNT or a read
ARGUMENT rather than an outcome.

Check 17 is the confirmation that makes an inferred slug safe: a session whose
own transcript records a different cwd is not this panel's, however well the
directory name matched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The channel

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/preload/index.ts`
- Modify: `README.md` (the architecture diagram fence)

**Interfaces:**
- Consumes: `SubagentRecordInternal` shape from Task 2.
- Produces:
  ```ts
  export interface SubagentRecord {
    id: string
    agentType: string
    description: string
    model: string
    spawnDepth: number
    state: 'running' | 'done'
    startedAt: number
  }
  export interface SubagentUpdate {
    panelId: PanelId
    records: SubagentRecord[]
    ambiguous: boolean
  }
  // ipc-contract: IPC_EVENTS.SUBAGENT_STATE = 'subagent:state'
  // bridge:      session.onSubagents(listener: (u: SubagentUpdate) => void): () => void
  ```
  `toolUseId` is deliberately **not** on the wire type: it is main's completion key and means nothing to the renderer.

- [ ] **Step 1: Add the types**

In `src/shared/types.ts`, after `LiveSessionUpdate`, add `SubagentRecord` and `SubagentUpdate` exactly as above, with a doc comment recording that `records` is main's whole current answer for that panel — a replace, never a delta — because a delta protocol would need ordering guarantees a 2s poll does not have.

- [ ] **Step 2: Add the channel**

In `src/shared/ipc-contract.ts`, add to `IPC_EVENTS` after `SESSION_LIVE`:

```ts
  ,
  /**
   * Which subagents a panel's agent has running, pushed when the set CHANGES.
   *
   * An IPC_EVENTS member and not an IPC one, which decides a number:
   * verify:ipc asserts over Object.values(IPC) — invoke channels, each needing
   * an ipcMain.handle — and is unmoved by this. It stays at 31. M6d hit this
   * boundary and correctly added no channel; a draft of M12's spec said
   * "31 to 32" and would have made a task fail the suite by fixing a correct
   * count. This is the third time it has been reachable.
   */
  SUBAGENT_STATE: 'subagent:state'
```

Add `onSubagents` to the bridge type's `session` member beside `onLive`.

- [ ] **Step 3: Add the preload subscription**

In `src/preload/index.ts`, in the `session` member:

```ts
    onSubagents: (listener) => subscribe<SubagentUpdate>(IPC_EVENTS.SUBAGENT_STATE, listener)
```

and add `SubagentUpdate` to the type import from `./types`.

- [ ] **Step 4: Add the channel to the README diagram**

In `README.md`, inside the **single fenced block containing `--invoke-->`**, add beside the `session:live` line:

```
main     --send-->   subagent:state                                          --> renderer
```

This is mandatory: `verify:meta` 14 fails otherwise, and it is scoped to that one fence, so putting the name in prose does not satisfy it.

- [ ] **Step 5: Verify the two counts did not move**

Run: `npm run typecheck && npm run verify:meta && npm run verify:ipc`
Expected: typecheck clean; `verify:meta` all pass (check 14 now sees the new channel in the fence, check 15's parsed/declared counts still agree); `verify:ipc` reports **`1/1`, 31 channels** — unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-contract.ts src/preload/index.ts README.md
git commit -m "$(cat <<'EOF'
feat(m15): subagent:state, an event and not an invoke

verify:ipc stays at 31. It asserts over the INVOKE channels, each of which
needs an ipcMain.handle; a send is handled by nobody and counted by nothing.
This is the third time the wrong number has been reachable — M6d hit it and
added no channel, and a draft of M12's spec said "31 to 32".

verify:meta 14 is the other count, and it moves: every channel must appear in
the README's own architecture fence.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Main wiring

**Files:**
- Modify: `src/main/pty-manager.ts`
- Modify: `scripts/verify-pty-manager.cjs` (append check 25)

**Interfaces:**
- Consumes: `SubagentWatch` (Task 2), `IPC_EVENTS.SUBAGENT_STATE` and `SubagentUpdate` (Task 3).
- Produces: nothing new; the watcher is private to `PtyManager`.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-pty-manager.cjs`'s tmux block, **before** its final `shutdown()`. Check 24's standing obligation is that this block ends in a definite `kill-server`; check 25 inherits it and must hand it on to whoever writes 26.

```js
// 25. The subagent poll's dedupe, and it is the only thing anywhere that
// would notice this milestone's cost story going wrong: the failure changes
// no pixel, it shows up as heat. So this COUNTS messages.
//
// The WINDOW is what makes the count mean anything, and a future editor must
// not shrink it: an implementation with no dedupe emits once per LIVE_TICK_MS
// tick, so a sample spanning a single tick sees one message either way and
// stays green against the defect. Check 23's trap, in the same shape.
//
// The fixture points a panel at a temp cwd with NO Claude Code project
// directory anywhere — the ordinary case for most panels — so the assertion
// is that a canvas with nothing to report reports nothing at all, rather than
// re-announcing an empty list every two seconds.
{
  const seen = []
  const mgr = new PtyManager((channel, payload) => {
    if (channel === 'subagent:state') seen.push(payload)
  }, /* ...the same constructor arguments the block's earlier checks use... */)
  await mgr.create({ panelId: 'sa1', cwd: SPACED_DIR, command: '/bin/sh', args: [], cols: 80, rows: 24 })
  await sleep(7000)  // comfortably more than three LIVE_TICK_MS ticks
  ok(25, seen.length === 0, `expected no subagent:state for a panel with no session dir, got ${seen.length}`)
  mgr.kill('sa1')
  mgr.shutdown()   // check 24's obligation, discharged here and handed to 26
}
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run verify:pty-manager`
Expected: check 25 FAILS (the poll does not exist, so nothing constructs — most likely a `TypeError` that aborts the run). If it aborts, note that no check after it ran.

- [ ] **Step 3: Wire the watcher into `pollLive`**

In `src/main/pty-manager.ts`:

1. Construct a `SubagentWatch` in the constructor with real `node:fs` deps and `projectsRoot = join(homedir(), '.claude', 'projects')`.
2. At the end of `pollLive()`, after the existing `SESSION_LIVE` loop, build the panel list from `this.sessions` — `panelId`, the panel's **live** cwd if `lastLive` has one and the resolved spawn cwd otherwise (M12's consumer-fallback rule), and `spawnedAt` — then call `watch.poll(...)`.

   **The watcher's records are not the wire type, and must be mapped rather than sent.** `SubagentRecordInternal` carries `toolUseId`; `SubagentRecord` deliberately does not, because it is main's completion key and means nothing to the renderer. Build the payload field by field:

   ```ts
   for (const entry of this.subagentWatch.poll(panels)) {
     this.send(IPC_EVENTS.SUBAGENT_STATE, {
       panelId: entry.panelId,
       ambiguous: entry.ambiguous,
       // Field by field, never a spread: spreading would put toolUseId on the
       // wire, where it is both meaningless and the internal key of a format
       // this repo does not own. Same rule M5a's absent `command` forces on
       // four other layers, for the same reason — a structured clone carries
       // whatever the object actually has.
       records: entry.records.map((r) => ({
         id: r.id,
         agentType: r.agentType,
         description: r.description,
         model: r.model,
         spawnDepth: r.spawnDepth,
         state: r.state,
         startedAt: r.startedAt
       }))
     })
   }
   ```

   The watcher already deduped; do not add a second gate here.
3. Record `spawnedAt` on the session when it is created.
4. Call `watch.drop(panelId)` **everywhere `this.lastLive.delete(panelId)` already appears**, and `watch.clear()` where `this.lastLive.clear()` appears in `detachAll()`. Those sites are the existing answer to "a panel is gone" and to "the renderer is new"; a fifth store that does not follow them grows for the life of the process and lets a **recycled panel id inherit a dead panel's subagents**.

`pollLive` returns early when `backend.list()` is null — the direct backend. Put the subagent poll **before** that early return, because unlike the live cwd this does not need tmux at all: it reads the filesystem, and a direct-backend panel has a Claude Code session just the same.

- [ ] **Step 4: Run and confirm it passes**

Run: `npm run verify:pty-manager`
Expected: all pass, `26/26` (the count rises by one from 25; re-derive it from the actual output rather than trusting this number).

- [ ] **Step 5: Commit**

```bash
git add src/main/pty-manager.ts scripts/verify-pty-manager.cjs
git commit -m "$(cat <<'EOF'
feat(m15): the poll rides the existing live tick

Not a third timer. The rule that the idle tick and the live tick stay separate
is about the 500ms tick's RESOLUTION — merging that one would coarsen
agent.idleAfterMs fourfold, silently. Nothing like that is at stake here.

The poll sits BEFORE pollLive's null-backend early return: unlike a live cwd
this needs no tmux, and a direct-backend panel has a Claude Code session just
the same.

drop() follows lastLive.delete and clear() follows lastLive.clear at every
existing site, so a recycled panel id cannot inherit a dead panel's subagents.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The renderer store

**Files:**
- Create: `src/renderer/session/subagent-store.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`

**Interfaces:**
- Consumes: `SubagentUpdate`, `SubagentRecord` (Task 3).
- Produces:
  ```ts
  export function applySubagents(panelId: PanelId, records: SubagentRecord[], ambiguous: boolean): void
  export function clearSubagents(panelId: PanelId): void
  export function getSubagents(panelId: PanelId): { records: SubagentRecord[]; ambiguous: boolean } | undefined
  export function useSubagents(panelId: PanelId): { records: SubagentRecord[]; ambiguous: boolean } | undefined
  ```

- [ ] **Step 1: Create the store**

Model it on `src/renderer/session/live-session-store.ts` exactly — read that file first. Same shape: a module-level `Map`, a `Map` of per-id listener sets, `notify(panelId)`, and `useSyncExternalStore`.

Three things must carry over, and each has its own comment in the source file:

```ts
/**
 * Which subagents each panel's agent is running, as told by main.
 *
 * A FIFTH module-level store beside agent-state-store.ts and
 * live-session-store.ts, subscribed the same way: PER PANEL ID. It must never
 * bump registry.version() — that counter deliberately moves only on
 * tier/status/focus/exit, and a fact that changes when a model decides to fan
 * out would re-render every panel on every OTHER panel's fan-out. This is the
 * fifth entry to record that rule.
 *
 * A CACHE of main's answer, never a second author of it. Nothing here decides
 * that a subagent exists.
 */
```

The snapshot **must be cached**, not rebuilt per read: `useSyncExternalStore` compares snapshots by identity, so returning a fresh object every read makes React believe the store changed every render and loop. The object is replaced only when `applySubagents` sees a real change, which is what lets the hook hand React a stable reference. Dedupe on `JSON.stringify(records) + ambiguous` — a **second** dedupe, not redundant with main's: main's stops the message crossing the process boundary, this one stops a re-render if one ever arrives unchanged.

- [ ] **Step 2: Subscribe, once, for the whole canvas**

In `Canvas.tsx`, immediately after the existing `session.onLive` effect (~line 607):

```tsx
  // One subscription for the whole canvas, like session.onLive above and for
  // the same reason: the store fans out per panel id, so a per-panel
  // subscription here would deliver every panel's update to every panel.
  useEffect(() => window.canvas.session.onSubagents((update) => {
    applySubagents(update.panelId, update.records, update.ambiguous)
  }), [])
```

- [ ] **Step 3: Clear alongside the existing clears**

Add `clearSubagents(id)` beside **every** existing `clearLiveSession(...)` call in `Canvas.tsx`. Find them rather than trusting a line number:

Run: `grep -n "clearLiveSession" src/renderer/canvas/Canvas.tsx`

Every hit gets a `clearSubagents` beside it. This is the renderer half of Task 4 Step 3.4, and the same failure: without it the map grows for the life of the renderer and a recycled panel id inherits a dead panel's subagents.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/session/subagent-store.ts src/renderer/canvas/Canvas.tsx
git commit -m "$(cat <<'EOF'
feat(m15): a fifth store, subscribed per panel id

Never bumps registry.version(), for the reason three stores already record:
a fact that changes when a model fans out would re-render every panel on every
other panel's fan-out.

The snapshot is cached rather than rebuilt per read. useSyncExternalStore
compares by identity, so a fresh object per read makes React believe the store
changed every render, and it loops.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The layer

**Files:**
- Create: `src/renderer/canvas/SubagentLayer.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `useSubagents` (Task 5), `terminalPanels` (already in `Canvas.tsx`, line ~175).
- Produces: `<SubagentLayer panels={terminalPanels} />`

- [ ] **Step 1: Create the component**

```tsx
/**
 * Subagent nodes: one per subagent, beside the panel that spawned it.
 *
 * INSIDE .world, unlike EdgeIndicators — and the contrast is the point. A
 * pip's whole job is to stay pinned to the viewport's physical edge whatever
 * the camera does, which is why it is chrome. A subagent node belongs to a
 * PLACE, beside its parent, so it must pan and zoom with it.
 *
 * These are NOT Panels. Panel is the persisted type, and a panel that had to
 * be filtered out of every save would be a type fighting its own contract; a
 * node is derived from the watcher and rebuilt at every launch. The
 * consequence worth knowing is the good one: a node is not in `panels`, so it
 * never reaches Canvas's kind partition, let alone assignTiers or
 * registry.ensure. There is no code path from here to a PTY or a WebGL
 * context — an invariant rather than a guard someone has to remember.
 */
```

- One `<SubagentNodes>` child per panel, memoised, so a panel with no subagents costs one hook and renders `null`. The store subscription is **per node group**, not one read at the layer level — the same reason `RailPanelRow` subscribes individually rather than taking a prop.
- Placement: stack down the right-hand side of the parent's rect, `NODE_W = 200`, `NODE_H = 56`, `NODE_GAP = 8`, first node at `rect.x + rect.w + REVIEW_GAP`. World units, never divided by `viewport.scale` — nodes scale with the panels, the rule `cascadeCentre`'s step already follows.
- The edge is an absolutely-positioned `<div>` with a 1px border, not an `<svg>`: it is a straight horizontal run from the panel's right edge to the node's left edge, and an SVG layer would need its own coordinate space inside a transformed ancestor.
- `ambiguous` renders **one line instead of nodes**: "2 panels share this repository — subagents unattributed". Visible, never silent: an absent feature is indistinguishable from a broken one.
- `state === 'done'` gets a `--done` class, dimmed. Nothing is removed on completion.

- [ ] **Step 2: Render it**

In `Canvas.tsx`, inside `.world`, immediately after the `{panels.map(...)}` block and before the closing `</div>`:

```tsx
          <SubagentLayer panels={terminalPanels} />
```

- [ ] **Step 3: Style it**

Add to `src/renderer/styles.css`. **`verify:styles` constrains this**, and each of its rules costs a red check if broken:

- No hardcoded colour in any notation outside a theme block (check 1) — use existing `--fg*`, `--s-*`, `--amber` tokens only.
- Every `var(--token)` you write must be declared (check 2).
- No fractional `opacity` (check 3) — dim the done state with a `--fg-dim` token, never `opacity: 0.6`.
- Type sizes, radii and spacing come from the existing scales, zero literals (checks 4–6).

- [ ] **Step 4: Verify styles and build**

Run: `npm run verify:styles && npm run typecheck && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/SubagentLayer.tsx src/renderer/canvas/Canvas.tsx src/renderer/styles.css
git commit -m "$(cat <<'EOF'
feat(m15): nodes on the canvas, inside .world

Inside .world and not beside it, which is the opposite of EdgeIndicators and
for the mirror-image reason: a pip must stay pinned to the viewport's edge, a
node belongs to a place beside its parent.

Not a Panel kind. Nodes are not in `panels`, so there is no code path from one
to assignTiers, registry.ensure, a PTY or a WebGL context — #7 asks for that
as a constraint and this makes it unreachable instead of enforced.

The ambiguous case renders a line rather than nothing: an absent feature is
indistinguishable from a broken one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: End to end in a real renderer

**Files:**
- Modify: `scripts/verify-panels.cjs` (append checks 118–120)
- Modify: `scripts/panels-entry.cjs` (fence the projects root)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Fence the harness**

`scripts/panels-entry.cjs` must point the watcher's `projectsRoot` at a **temp fixture root**, never `homedir()`. Unfenced, the suite reads the running developer's real transcripts — M9a's git fence learned this the expensive way, and its own note records that an unfenced harness ran real work in a repository this repo does not own. Take the root from an env var the harness sets, defaulting to the real path in production.

- [ ] **Step 2: Write the failing checks**

Append to `scripts/verify-panels.cjs`:

```js
// ---------------------------------------------------------------------------
// M15, checks 118-120. One fixture serves all three: a fake ~/.claude projects
// root, fenced (see panels-entry.cjs) so this suite can never read the running
// developer's real transcripts, seeded with one session directory holding two
// subagents — one still running, one already completed by a tool_result in the
// parent transcript, so 118 can assert the two STATES rather than only a count.

const SA_ROOT = mkdtempSync(join(tmpdir(), 'tc subagent '))   // spaced, as always
const nodeCount = (wc) =>
  wc.executeJavaScript(`document.querySelectorAll('[data-subagent-id]').length`)
const nodeBox = (wc, id) => wc.executeJavaScript(`(() => {
  const n = document.querySelector('[data-subagent-id="' + ${JSON.stringify(id)} + '"]')
  if (!n) return null
  const r = n.getBoundingClientRect()
  return { x: r.left, y: r.top }
})()`)

{
  // The panel whose subagents these are. Spawned at a cwd we control, so the
  // slug is ours and no other panel in this suite can collide with it.
  const saCwd = mkdtempSync(join(tmpdir(), 'tc sa cwd '))
  const slug = saCwd.replace(/[^A-Za-z0-9]/g, '-')
  const sessionDir = join(SA_ROOT, slug, 'S1')
  mkdirSync(join(sessionDir, 'subagents'), { recursive: true })
  const meta = (t, d) => JSON.stringify({
    agentType: 'general-purpose', description: d, toolUseId: t, spawnDepth: 1, model: 'sonnet'
  })
  writeFileSync(join(sessionDir, 'subagents', 'agent-a1.meta.json'), meta('toolu_01A', 'still going'))
  writeFileSync(join(sessionDir, 'subagents', 'agent-a2.meta.json'), meta('toolu_01B', 'already done'))
  // The parent transcript. Its FIRST line is the confirmation read — cwdOf
  // must find our cwd here or the session is not claimed at all — and the
  // second line is what completes a2 while a1 stays running.
  writeFileSync(join(SA_ROOT, slug, 'S1.jsonl'),
    JSON.stringify({ type: 'user', cwd: saCwd, sessionId: 'S1' }) + '\n' +
    JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_01B' }] } }) + '\n')

  const xtermsBefore = await liveCount(wc)

  await wc.executeJavaScript(
    `window.canvas.preset.spawnById(${JSON.stringify(JSON.stringify({ cwd: saCwd }))})`
  ) // NOTE: use whichever spawn route the neighbouring checks use (PRESET_SPAWN
    // with an explicit cwd); the requirement is only that the panel's cwd is
    // saCwd, so read the surrounding checks and match them.

  // 118. WAITS on a live tick rather than sleeping: a fixed sleep against a 2s
  // poll is a flake, not a bound. This is the first thing to exercise the
  // watcher, the one canvas-wide subscription and the store TOGETHER —
  // verify:subagent proves the scanner and says nothing about the wiring
  // between it and a painted node.
  const appeared = await waitUntil(async () => (await nodeCount(wc)) >= 2, 12000, 250)
  const states = await wc.executeJavaScript(`
    Array.from(document.querySelectorAll('[data-subagent-id]'))
      .map((n) => n.getAttribute('data-subagent-state')).sort().join(',')
  `)
  // Both STATES, not just a count: a layer that rendered every record as
  // running would satisfy a count perfectly, and "done" is half the feature.
  ok('118 a seeded subagents/ dir paints one node per subagent, with its real state',
    appeared && states === 'done,running', `states=${states}`)

  // 119. The check the milestone's central claim rests on, and it asserts BOTH
  // halves in one read. The registry clause is read from __m4aSessions — the
  // RENDERER's registry, not pty:list — because the claim is about what the
  // renderer minted. The xterm clause is what rejects an implementation that
  // quietly demoted some other panel to pay for the nodes: "the node has no
  // terminal" is satisfied perfectly by that. Check 103's shape.
  const nodeIds = await wc.executeJavaScript(`
    Array.from(document.querySelectorAll('[data-subagent-id]'))
      .map((n) => n.getAttribute('data-subagent-id'))
  `)
  const heldByRegistry = await wc.executeJavaScript(
    `(${JSON.stringify(nodeIds)}).some((id) => window.__m4aSessions().has(id))`
  )
  const xtermsAfter = await liveCount(wc)
  ok('119 no node holds a PanelSession, and the live xterm count is unchanged by the fan-out',
    heldByRegistry === false && xtermsAfter === xtermsBefore + 1,
    `held=${heldByRegistry} before=${xtermsBefore} after=${xtermsAfter}`)
  // +1 and not +0: the PANEL spawned above is a real terminal and must be
  // live. A bare equality here would pass against a spawn that silently
  // failed, which would also produce no nodes and no sessions.

  // 120. The node follows a dragged parent. The failure it guards is a node
  // placed against a stale rect — it detaches and floats — and it is invisible
  // until something moves, because a node placed once at mount looks entirely
  // correct. Dragged through the panel's own chrome, the same route check 9
  // uses, rather than by moving the camera: a camera move would translate the
  // whole .world and pass against a node welded to the wrong panel.
  const beforeBox = await nodeBox(wc, nodeIds[0])
  await wc.executeJavaScript(`(() => {
    const panel = document.querySelector('[data-panel-id="${'${saPanelId}'}"] .panel__chrome')
    const r = panel.getBoundingClientRect()
    const opts = { bubbles: true, button: 0, buttons: 1,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
    panel.dispatchEvent(new MouseEvent('mousedown', opts))
    document.dispatchEvent(new MouseEvent('mousemove', { ...opts, clientX: opts.clientX + 120 }))
    document.dispatchEvent(new MouseEvent('mouseup', { ...opts, clientX: opts.clientX + 120, buttons: 0 }))
    return true
  })()`)
  await settle()
  const afterBox = await nodeBox(wc, nodeIds[0])
  ok('120 a node follows its parent through a drag',
    beforeBox !== null && afterBox !== null && Math.abs(afterBox.x - beforeBox.x - 120) < 4,
    `before=${JSON.stringify(beforeBox)} after=${JSON.stringify(afterBox)}`)

  rmSync(SA_ROOT, { recursive: true, force: true })
  rmSync(saCwd, { recursive: true, force: true })
}
```

Two things to resolve while writing this, by reading the neighbouring checks rather than guessing: the exact spawn route that lets you set a panel's `cwd` (checks 99–101 do this for the git fixture — copy them), and the panel id to substitute for `saPanelId`, which those checks read back out of the DOM rather than assuming. Both are marked in the code above.

**Guard every `querySelector` read**, as written: an absent node returning `null` and then being indexed would throw, abort the process, and take 119's and 120's RED down with it — the rule `CLAUDE.md` records for `verify:palette` 66.

- [ ] **Step 3: Run and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: 118–120 FAIL. Confirm each fails **individually** — if the run aborts on a `querySelector` returning `null`, guard the read (`if (node) ...`) rather than leaving it bare, so a red 118 cannot take 119 and 120's red down with it.

- [ ] **Step 4: Make them pass**

Fix whatever they find. If the implementation is already correct they pass on first write — say so plainly in the commit rather than implying they were watched failing, and note which are characterisation checks.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-panels.cjs scripts/panels-entry.cjs
git commit -m "$(cat <<'EOF'
test(m15): the layer end to end, and the harness fenced to its own root

119 is the one to know by number, and it asserts both halves in one read: no
PanelSession for the node, AND an unchanged .xterm count. Check 103's shape —
"the node has no terminal" is satisfied by an implementation that quietly
demoted some other panel to pay for it.

The fence is not tidiness. Unfenced, this suite reads the running developer's
real Claude Code transcripts.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/ideas-backlog.md`

- [ ] **Step 1: Add the `CLAUDE.md` load-bearing entries**

Under `## Load-bearing details`, add one entry per row of the spec's "What fails silently if undone" table. At minimum:

- **"Subagent nodes are derived, not a `Panel` kind"** — why `Panel` means persisted, and the four panel-removing surfaces a third kind would have needed a guard at.
- **"The slug is a hint; `cwdOf` is what makes it safe"** — inferred from 31 samples, underscore and space unknown, confirmation turns a correctness risk into an availability one.
- **"The subagent poll rides the live tick, and sits before its early return"** — why not a third timer, why not a file watcher, and why it does not need tmux.
- **"A fifth store, and the fifth time the `registry.version()` rule is recorded."**

- [ ] **Step 2: Update the verify table**

Add the `verify:subagent` row, and update the `verify:pty-manager` and `verify:panels` rows with their new checks and **re-derived counts**. Take the counts from a real run's output — this file records that its prose has gone stale before and that the counts are the half that must be re-derived, not trusted.

- [ ] **Step 3: Update `README.md`**

Add the milestone row: `| M15 | Subagent nodes: an agent's fan-out, on the canvas | ✅ done |`. State plainly that this reads Claude Code's own session files and is therefore **absent for other agent CLIs** — the spec forbids implying generality it does not have.

- [ ] **Step 4: Delete backlog entry #7**

Delete the `## 7.` section. Add a row to the "numbers that are gone" table:

```
| #7 subagent nodes on the canvas | M15 | "Subagent nodes are derived, not a `Panel` kind", "The slug is a hint" |
```

The numbers are never reused — #7 is cited elsewhere in the file and from source comments, so the row is what keeps it legible.

- [ ] **Step 5: Full verification**

Run: `npm run verify`
Expected: every suite green. **Paste the real output.** Do not claim completion without it.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md docs/ideas-backlog.md
git commit -m "$(cat <<'EOF'
docs(m15): what the milestone cost, and #7 deleted

Counts in the verify table re-derived from a real run rather than carried
forward, the one habit this file records itself having failed at before.

The README says plainly that this reads Claude Code's own session files and is
absent for other agent CLIs. Claiming generality the feature does not have
would make "no nodes" read as a bug.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

- **Spec coverage.** Every spec section maps to a task: scanner + attribution → 1, watcher/offset/dedupe → 2, IPC → 3, cadence + clears → 4, store → 5, layer + refusal + placement → 6, the three end-to-end criteria → 7, honest-degradation and risk documentation → 8. Success criterion 6 ("one failed `stat` per panel per tick") is covered by `verify:pty-manager` 25, which asserts silence for a panel with no session directory.
- **Type consistency.** The self-review caught one real mismatch: Task 2's `SubagentRecordInternal` carries `toolUseId` and Task 3's wire `SubagentRecord` does not, so Task 4 originally would have sent the watcher's records straight through and leaked main's internal completion key onto the wire. Task 4 Step 3.2 now spells out the field-by-field map. Every other name was cross-checked: `slugFor`, `parseMeta`, `cwdOf`, `chooseSession`, `attributable`, `scanForResults`, `SubagentWatch.poll/drop/clear`, `applySubagents`/`clearSubagents`/`getSubagents`/`useSubagents`.
- **Known soft spot, and it is the only one.** Task 7's checks are written out in full, but two values inside them are marked for the executor to read out of the neighbouring checks rather than guess: the spawn route that sets a panel's `cwd` (checks 99–101 already do this) and the panel id to substitute for `saPanelId`. Both are marked inline. Everything else in the plan is transcription.
- **Counts to re-derive, never trust:** `verify:pty-manager`'s new total (Task 4 Step 4) and every number in Task 8 Step 2.
