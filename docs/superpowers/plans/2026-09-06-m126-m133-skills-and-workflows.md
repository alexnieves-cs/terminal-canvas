# Act III — the shelf and the shape that runs: implementation plan (M126–M133)

> Renumbered M126–M133 on 2026-09-07: Act II's ship took M125 (README's row) after this document was written.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the canvas a library of what an agent *can* do — skills organised by use case,
expandable, editable, and visible beside the session that used them in the order used — and
grow M80's templates into a runnable shape with a worker pool, an orchestrator and a collect.

**Architecture:** Track A layers on `toolbox-read.ts`, which already walks `skills/`,
`commands/` and `agents/` across three scopes with every cap applied at the read boundary. The
shelf is a new top-level layout record; the skill panel is the thirteenth kind through
`PanelFrame`; the trail is derived-and-anchored like a run frame and stored nowhere but its
collapse mark. Track B adds three `TemplateNode` kinds; the pool takes no ceiling of its own,
asking M82's `agents.maxConcurrent` live.

**Tech Stack:** TypeScript, Electron, React, esbuild-bundled plain-node check suites. **No new
runtime dependency** — the only outside adoption is `claude plugin list --json`, a subprocess.

**Spec:** [`docs/superpowers/specs/2026-09-06-m126-m132-skills-and-workflows-design.md`](../specs/2026-09-06-m126-m132-skills-and-workflows-design.md)
— read it alongside this plan; every task cites the section it implements.

## Global Constraints

Copied verbatim from the spec and from `CLAUDE.md`. **Every task's requirements implicitly
include this section.**

- **Checks are written first, watched failing FOR THE RIGHT REASON, and committed in their own
  commit BEFORE the implementation.** Act II's rule. A red check that fails because the module
  does not exist is correct; a red check that fails because the suite threw is not evidence —
  a check that THROWS aborts the run and every check below it never executes.
- **A new check takes a SCOPED id** — `ok('shelf.1 …')`, never the next global integer.
- **Absent vs. malformed vs. unknown, in every parser.** An ABSENT key is every pre-existing
  file and warns nothing; a PRESENT-but-malformed value warns and is dropped, never coerced; a
  per-entry failure costs that entry, never the collection. **An absent optional field must
  stay absent through every copy site** — spreading writes `key: undefined`, which survives IPC
  and reads as present.
- **Three-state results, never two.** "Nothing to show", "asked but unanswered" and "a real
  answer" are three renderings.
- **A row that disappears is indistinguishable from a feature never built.** Disable with a
  distinct named reason; never remove.
- **Two lifetimes, not one.** A panel's session is created once and disposed once in the
  module-level registry. Nothing in this act may reach `pty.kill` or `registry.dispose`.
- **`registry.version()` carries tier/status/focus/exit and nothing higher-frequency.** Every
  store added here is subscribed per panel id, caches its snapshot object, and is cleared at
  every panel-removing call site.
- **No new runtime dependency.** `@xyflow/react`, `js-yaml`, `fuse.js`, `chokidar`,
  `react-window` are each declined by name in spec §11.
- **Caps are applied at the READ boundary**, never at render time.
- **`npm run verify` must be green before any task is claimed done.** No test-name filter
  exists in any suite; each runs everything.
- Commits: `feat(m126): …` / `check(m126): … — red` / `fix(m126): …`.
- `verify:styles icons.1` bans `›` and entity glyphs in renderer text. Use words.

## File structure

**New — Track A**

| File | Responsibility |
|---|---|
| `src/shared/skills.ts` | `SkillKey`, the `Shelf` record, `placement()`, `parseShelf`, `carryShelf`, `renameInShelf`. Pure; no fs, no React. |
| `src/shared/skill-edit.ts` | The frontmatter round-trip (§5.2) and the `ReadStamp`. Pure. |
| `src/shared/skill-trail.ts` | `TrailEntry`, `scanTrailChunk` — the JSONL scan with a carry. Pure. |
| `src/main/plugin-list.ts` | `claude plugin list --json` over the injected runner seam. |
| `src/main/skill-write.ts` | The four writes: atomic write, create, rename, trash. Containment + stale check. |
| `src/main/skill-trail-read.ts` | Byte-offset tail of a panel's CLI transcript. |
| `src/renderer/skills/SkillNode.tsx` | The thirteenth kind's body. |
| `src/renderer/skills/skill-node-model.ts` | Its pure model — the six body sections, each three-state. |
| `src/renderer/skills/SkillEditor.tsx` | The Edit tab: metadata fields + body + Save. |
| `src/renderer/skills/skill-trail-store.ts` | Per-panel trail mirror, cleared at every removing site. |
| `src/renderer/shell/SkillsPane.tsx` | The navigator pane: columns, tabs, search, filters. |
| `src/renderer/shell/skills-pane-model.ts` | Its pure model — columns built, filtered, searched. |

**New — Track B**

| File | Responsibility |
|---|---|
| `src/shared/workflow-nodes.ts` | The three node kinds, their parse arms, `blockCount`. |
| `src/main/pool-runner.ts` | The pool: the shared list file, the workers, the ceiling. |
| `src/renderer/workflow/WorkflowNode.tsx` | The fourteenth kind: Definition + Runs tabs. |
| `src/renderer/workflow/workflow-diagram.ts` | Pure: the record → SVG geometry projection. |

**Modified**

| File | Change |
|---|---|
| `src/shared/toolbox.ts` | `SkillResources` three-state; `RESOURCES_MAX`; `pluginId?` on `NamedToolEntry`. |
| `src/main/toolbox-read.ts` | Count resources at the boundary; walk enabled plugins' `installPath`s. |
| `src/shared/layout-schema.ts` | `shelf` top-level; `skillTrail?` panel mark; `skill`/`workflow` kinds; three template node arms. |
| `src/shared/ipc-contract.ts` | 9 new channels (4 skill writes, `skill:trail`, `plugin:list`, `workflow:run`, `pool:start`, `pool:stop`). |
| `src/renderer/panels/panels.ts` + 12 fan-out files | One appended arm each per new kind (list in Task 5). |
| `scripts/toolbox-entry.cjs` | Add `shared/skills.ts`, `shared/skill-edit.ts`. |
| `scripts/file-entry.cjs` | Add `main/plugin-list.ts`, `main/skill-trail-read.ts`, `shared/skill-trail.ts`. |

**One deliberate deviation from the spec.** §2.6 assigned the placement checks to
`verify:palette shelf.1`. They land in **`verify:toolbox shelf.1`** instead: the palette's
esbuild entry does not bundle `shared/skills.ts`, and adding it would put the shelf module
inside the palette's bundle for no reason. The toolbox entry already carries `shared/toolbox.ts`,
which `skills.ts` imports `ToolScope` from. Same checks, right bundle.

---

## Track A

### Task 1: The skill key and the shelf record (M126, spec §2.1, §2.4, §2.5)

**Files:**
- Create: `src/shared/skills.ts`
- Modify: `src/shared/layout-schema.ts` (top-level `shelf`, `parseShelf` call, `emptyLayout`)
- Modify: `scripts/toolbox-entry.cjs`
- Test: `scripts/verify-toolbox.cjs`, `scripts/verify-layout.cjs`

**Interfaces:**
- Consumes: `ToolScope` from `src/shared/toolbox.ts` (`'user' | 'project' | 'local'`).
- Produces: `skillKey(scope, name): SkillKey`, `parseSkillKey`, `Shelf`, `ShelfColumn`,
  `placement(...)`, `parseShelf(raw, warnings)`, `carryShelf(shelf)`, `renameInShelf`,
  `UNGROUPED_COLUMN_ID`, `SHELF_COLUMNS_MAX`, `pluginPrefixOf`. Tasks 2, 4, 5, 6, 9 use these.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-toolbox.cjs`, inside the IIFE, after the existing checks:

```js
/* ---- M126: the shelf ---- */
const { skillKey, parseSkillKey, placement, pluginPrefixOf, parseShelf, carryShelf,
        renameInShelf, UNGROUPED_COLUMN_ID } = mod

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
  ok('shelf.3a absent is every pre-M126 file, silently',
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
```

Append to `scripts/verify-layout.cjs`:

```js
/* ---- M126: the shelf on disk ---- */
{
  const w = []
  const bare = parseLayout(JSON.stringify({ version: 1, workspaces: [] }), w)
  ok('shelf.disk.1 a pre-M126 file parses with an empty shelf and no warning',
     bare.shelf.columns.length === 0 && !w.some((x) => /shelf/i.test(x)), w.join('|'))
  const round = JSON.parse(serialiseLayout({
    ...bare, shelf: { columns: [{ id: 'c', title: 'mobile', keys: ['["user","swiftui"]'] }] }
  }))
  ok('shelf.disk.2 a shelf round-trips', round.shelf.columns[0].title === 'mobile',
     JSON.stringify(round.shelf))
  const empty = JSON.parse(serialiseLayout(bare))
  ok('shelf.disk.3 an EMPTY shelf is absent on disk, never written as []',
     !('shelf' in empty), Object.keys(empty).join(','))
}
```

- [ ] **Step 2: Run both suites and confirm they fail for the right reason**

```bash
npm run verify:toolbox; npm run verify:layout
```

Expected: `verify:toolbox` fails at `shelf.1a` with a **TypeError on `skillKey` being
undefined** — which means the check THREW, aborting the run. That is not evidence. Wrap the new
blocks in `try { … } catch (e) { ok('shelf.1a', false, String(e)) }` **only if** the throw would
hide later checks; otherwise confirm the abort is the last block in the file so nothing below it
is masked. Expected `verify:layout`: `shelf.disk.1` FAILS on `bare.shelf` being undefined.

**Do not proceed until both reds are read and understood.** A red for "module missing" is
correct; a red for "suite threw before reaching my check" is not.

- [ ] **Step 3: Commit the red checks**

```bash
git add scripts/verify-toolbox.cjs scripts/verify-layout.cjs
git commit -m "check(m126): shelf.1-.4 and shelf.disk.1-.3 — the key, placement, the record rules — red"
```

- [ ] **Step 4: Create `src/shared/skills.ts`**

```ts
import type { ToolScope } from './toolbox'

/**
 * M126. A skill's identity is `scope` AND `name`, never the name alone.
 *
 * M21 measured that two scopes can define one name and REFUSED to name a
 * winner, recording the link in `alsoDefinedIn`. A shelf keyed by bare name
 * would silently pick one of them, and the user would see a skill sitting in
 * a column while the agent used a different file of the same name.
 *
 * Stringified, not `:`-joined, for `ToolEntryBase.id`'s own reason: a plugin
 * skill's name CONTAINS a colon (`superpowers:brainstorming`), so a joined id
 * collides the first time two coordinates differ only across the delimiter.
 */
export type SkillKey = string

export function skillKey(scope: ToolScope, name: string): SkillKey {
  return JSON.stringify([scope, name])
}

export function parseSkillKey(key: SkillKey): { scope: ToolScope; name: string } | null {
  try {
    const v = JSON.parse(key)
    if (!Array.isArray(v) || v.length !== 2) return null
    const [scope, name] = v
    if (scope !== 'user' && scope !== 'project' && scope !== 'local') return null
    if (typeof name !== 'string' || name === '') return null
    return { scope, name }
  } catch {
    // A malformed key is not a guess. parseLayout's rule: drop, never coerce.
    return null
  }
}

export interface ShelfColumn {
  id: string
  title: string
  keys: SkillKey[]
}

export interface Shelf {
  columns: ShelfColumn[]
}

/** The newest kept; a library, not a history. TEMPLATES_MAX's shape. */
export const SHELF_COLUMNS_MAX = 24

/**
 * A real column, and it cannot be deleted or emptied by a filter.
 *
 * A skill that silently vanishes from the shelf is indistinguishable from a
 * skill that was never installed — this repo's standing rule, applied to a
 * library whose whole promise is "what can this agent do".
 */
export const UNGROUPED_COLUMN_ID = 'ungrouped'

export type PlacementWhy = 'placed' | 'by-plugin' | 'by-scope'

/**
 * The plugin half of `superpowers:brainstorming`, or null for a bare name.
 *
 * Only the FIRST colon: a name may contain more, and splitting on all of them
 * would invent a nesting the CLI does not have.
 */
export function pluginPrefixOf(name: string): string | null {
  const i = name.indexOf(':')
  if (i <= 0) return null
  return name.slice(0, i)
}

/**
 * Where a skill sits, and WHY — and the `why` is not decoration.
 *
 * Derived-default-plus-user-override is two authorities for one position, and
 * its failure is a skill appearing in a column nobody put it in with no way to
 * tell which authority put it there. The fix is this repo's standing one: make
 * the state visible rather than collapsing it. Every card renders the word.
 */
export function placement(
  key: SkillKey,
  shelf: Shelf,
  scope: ToolScope,
  name: string
): { columnId: string; why: PlacementWhy } {
  for (const col of shelf.columns) {
    if (col.keys.includes(key)) return { columnId: col.id, why: 'placed' }
  }
  const plugin = pluginPrefixOf(name)
  if (plugin !== null) return { columnId: `plugin:${plugin}`, why: 'by-plugin' }
  return { columnId: `scope:${scope}`, why: 'by-scope' }
}

/** ABSENT is every pre-M126 file and warns nothing; MALFORMED warns and is dropped. */
export function parseShelf(raw: unknown, warnings: string[]): Shelf {
  if (raw === undefined || raw === null) return { columns: [] }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('dropped shelf: not an object')
    return { columns: [] }
  }
  const cols = (raw as { columns?: unknown }).columns
  if (cols === undefined) return { columns: [] }
  if (!Array.isArray(cols)) {
    warnings.push('dropped shelf: columns was not an array')
    return { columns: [] }
  }
  const out: ShelfColumn[] = []
  for (const entry of cols) {
    if (out.length >= SHELF_COLUMNS_MAX) break
    if (typeof entry !== 'object' || entry === null) {
      warnings.push('dropped a shelf column: not an object')
      continue
    }
    const e = entry as Record<string, unknown>
    if (typeof e.id !== 'string' || e.id === '' || typeof e.title !== 'string') {
      warnings.push(`dropped shelf column ${String(e.id)}: id or title was unusable`)
      continue
    }
    const keys = Array.isArray(e.keys) ? e.keys.filter((k): k is string => typeof k === 'string') : []
    out.push({ id: e.id, title: e.title, keys })
  }
  return { columns: out }
}

/** Field by field, never a spread: a spread writes `key: undefined`, which survives IPC. */
export function carryShelf(shelf: Shelf): Shelf {
  return { columns: shelf.columns.map((c) => ({ id: c.id, title: c.title, keys: [...c.keys] })) }
}

/**
 * A rename changes the KEY (scope:name), so the shelf slot must follow.
 *
 * In place, preserving order: a rename that appended would silently reorder a
 * column the user arranged by hand.
 */
export function renameInShelf(shelf: Shelf, from: SkillKey, to: SkillKey): Shelf {
  return {
    columns: shelf.columns.map((c) => ({
      id: c.id,
      title: c.title,
      keys: c.keys.map((k) => (k === from ? to : k))
    }))
  }
}
```

- [ ] **Step 5: Wire the shelf into `layout-schema.ts`**

Three edits, mirroring `templates` exactly:

1. Add `shelf: Shelf` to the top-level layout interface beside `templates: PersistedTemplate[]`.
2. Add `shelf: { columns: [] }` to `emptyLayout()` beside `templates: []`.
3. In `parseLayout`, beside `templates: parseTemplates(parsed.templates, warnings)`, add
   `shelf: parseShelf(parsed.shelf, warnings)`.
4. In `serialiseLayout`, **delete the key when the shelf is empty** — M93's annotations rule:

```ts
// Absent on disk when empty. A written `"shelf":{"columns":[]}` is a record
// claiming to exist; the store deletes the key instead, so a pre-M126 file and
// a file whose shelf was emptied are byte-identical.
if (out.shelf.columns.length === 0) delete (out as { shelf?: unknown }).shelf
```

- [ ] **Step 6: Add the module to the toolbox entry**

`scripts/toolbox-entry.cjs`:

```js
module.exports = {
  ...require('../src/shared/toolbox'),
  ...require('../src/shared/skills.ts'),
  ...require('../src/main/toolbox-scan.ts'),
  ...require('../src/main/toolbox-read.ts')
}
```

- [ ] **Step 7: Run both suites green, then the whole chain**

```bash
npm run verify:toolbox && npm run verify:layout && npm run verify
```

Expected: all `shelf.*` PASS; `npm run verify` exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/shared/skills.ts src/shared/layout-schema.ts scripts/toolbox-entry.cjs
git commit -m "feat(m126): the skill key as scope:name and the shelf record — placement carries its why, empty absent on disk"
```

---

### Task 2: Resources at the read boundary (M126, spec §2.2)

**Files:**
- Modify: `src/shared/toolbox.ts` (add `SkillResources`, `RESOURCES_MAX`)
- Modify: `src/main/toolbox-read.ts` (`readSkills`, around line 180)
- Test: `scripts/verify-toolbox.cjs`

**Interfaces:**
- Consumes: `NamedToolEntry` from Task 0 state (existing).
- Produces: `resources: SkillResources` on a `kind: 'skill'` entry. Tasks 4, 5, 6 render it.

- [ ] **Step 1: Write the failing check**

The suite already builds a fixture tree with a SPACE in its path. Extend it — add a skill with
two sibling files, a skill with none, and a skill whose directory is chmod `0o000`:

```js
/* ---- M126: resources, counted at the boundary ---- */
{
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
     skills.every((e) => e.resources.kind !== 'some' || e.resources.n <= RESOURCES_MAX), '')
  ok('skill.1e only skills carry resources',
     inv.entries.filter((e) => e.kind !== 'skill').every((e) => e.resources === undefined),
     'a command has no resources folder')
}
```

- [ ] **Step 2: Run and confirm red**

```bash
npm run verify:toolbox
```
Expected: `skill.1a` FAILS reading `.kind` of undefined — `resources` is not on the entry yet.

- [ ] **Step 3: Commit the red check**

```bash
git add scripts/verify-toolbox.cjs
git commit -m "check(m126): skill.1 — resources three-state at the read boundary — red"
```

- [ ] **Step 4: Add the type**

In `src/shared/toolbox.ts`, beside the other caps:

```ts
/**
 * A skill's bundled files — `references/`, `scripts/`, `assets/` — counted,
 * never listed. Capped HERE, at the read boundary, so every consumer inherits
 * the bound rather than the one that remembered it (this module's own rule).
 */
export const RESOURCES_MAX = 50

export type SkillResources =
  | { kind: 'none' }
  | { kind: 'some'; n: number }
  /**
   * The directory could not be listed. A `0` printed here is the confident
   * wrong answer `costOf`'s `undefined` already refuses to give: "this skill
   * ships nothing" and "we could not look" are different sentences and lead
   * the user to different fixes.
   */
  | { kind: 'unknown'; why: string }
```

Add to `NamedToolEntry`:

```ts
  /** Skills only — a command and an agent are one file each. */
  resources?: SkillResources
```

- [ ] **Step 5: Count in `readSkills`**

In `src/main/toolbox-read.ts`, inside the `for (const name of listed.names)` loop, after
`const entry = readNamed(...)`:

```ts
    if (entry !== null) {
      entry.resources = countResources(join(dir, name))
      out.push(entry)
    }
```

And the helper, beside `listDir`:

```ts
/**
 * Files beside SKILL.md, counted at the boundary and capped.
 *
 * Recurses one level only — deep enough for `references/foo.md`, shallow
 * enough that a skill that vendored a node_modules cannot turn a pane read
 * into a filesystem crawl. A depth this app cannot bound is a hang, not a
 * slow read.
 */
function countResources(skillDir: string): SkillResources {
  const listed = listDir(skillDir)
  if (listed.status !== 'ok') return { kind: 'unknown', why: listed.detail ?? 'could not list' }
  let n = 0
  for (const entry of listed.names) {
    if (entry === 'SKILL.md') continue
    if (n >= RESOURCES_MAX) break
    const child = join(skillDir, entry)
    const sub = listDir(child)
    // A directory contributes its children; an unreadable one contributes
    // itself, so the count never silently shrinks.
    n += sub.status === 'ok' ? Math.min(sub.names.length, RESOURCES_MAX - n) : 1
  }
  if (n === 0) return { kind: 'none' }
  return { kind: 'some', n: Math.min(n, RESOURCES_MAX) }
}
```

- [ ] **Step 6: Run green, then the chain**

```bash
npm run verify:toolbox && npm run verify
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/toolbox.ts src/main/toolbox-read.ts
git commit -m "feat(m126): resources counted at the read boundary — none, some, and unknown for a directory that would not list"
```

---

### Task 3: Plugin skills, through the CLI's own answer (M126, spec §2.3)

**Files:**
- Create: `src/main/plugin-list.ts`
- Modify: `src/main/toolbox-read.ts` (walk enabled `installPath`s)
- Modify: `src/shared/toolbox.ts` (`pluginId?` on `NamedToolEntry`)
- Modify: `scripts/file-entry.cjs`
- Test: `scripts/verify-file.cjs`

**Interfaces:**
- Consumes: the injected runner shape from `src/main/agent-runner.ts`.
- Produces: `listPlugins(run): Promise<PluginListResult>` where
  `PluginListResult = { kind: 'ok'; plugins: PluginRecord[] } | { kind: 'unknown'; why: string }`
  and `PluginRecord = { id: string; installPath: string; enabled: boolean }`.
  Task 4 renders the plugin column titles from `pluginId`.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-file.cjs`. Drive a FAKE runner — the real CLI is never spawned:

```js
/* ---- M126: plugin-list, over a fake runner ---- */
{
  const RECORDED = JSON.stringify([
    { id: 'superpowers@claude-plugins-official', version: '6.3.0', scope: 'user',
      enabled: true, installPath: '/tmp/p/superpowers/6.3.0' },
    { id: 'atomic-agents@claude-plugins-official', version: 'b15c', scope: 'user',
      enabled: false, installPath: '/tmp/p/atomic/b15c' }
  ])
  const fake = (out, code) => () => Promise.resolve({ stdout: out, code })

  const okRes = await listPlugins(fake(RECORDED, 0))
  ok('plugins.1a the recorded JSON parses',
     okRes.kind === 'ok' && okRes.plugins.length === 1, JSON.stringify(okRes))
  ok('plugins.1b only ENABLED plugins are returned',
     okRes.kind === 'ok' && okRes.plugins[0].id.startsWith('superpowers'),
     'a disabled plugin is unavailable to every agent; listing it answers the pane with a lie')

  const bad = await listPlugins(fake('not json', 0))
  ok('plugins.1c unparseable output is UNKNOWN, never an empty list',
     bad.kind === 'unknown' && typeof bad.why === 'string', JSON.stringify(bad))

  const nonzero = await listPlugins(fake('', 127))
  ok('plugins.1d an absent CLI is UNKNOWN', nonzero.kind === 'unknown', JSON.stringify(nonzero))

  const slow = await listPlugins(() => new Promise(() => {}))
  ok('plugins.1e a hung CLI times out to UNKNOWN rather than hanging the read',
     slow.kind === 'unknown' && /timed out/i.test(slow.why), JSON.stringify(slow))
}
```

- [ ] **Step 2: Run and confirm red**

```bash
npm run verify:file
```
Expected: FAIL — `listPlugins is not a function`.

- [ ] **Step 3: Commit the red check**

```bash
git add scripts/verify-file.cjs
git commit -m "check(m126): plugins.1 — the CLI's plugin list over a fake runner, unknown never empty — red"
```

- [ ] **Step 4: Implement `src/main/plugin-list.ts`**

```ts
/**
 * M126. The enabled plugins, from the CLI's own answer.
 *
 * `docs/ideas-backlog.md` #26 declined plugin skills because
 * `~/.claude/plugins` is 663 MB containing 700 SKILL.md files. This is the
 * answer that makes them affordable: `claude plugin list --json` names each
 * plugin's own `installPath`, so the walk is bounded to the enabled ones
 * rather than being a recursive descent from the cache root.
 *
 * `enabled` is the CLI's answer, not this app's inference from
 * `enabledPlugins` — a disabled plugin's skills are available to no agent, and
 * listing them would answer "what can this agent do" with a lie.
 *
 * The runner is INJECTED (agent-runner.ts's shape), so every check drives a
 * fake and no suite spawns the real CLI.
 */
export interface PluginRecord {
  id: string
  installPath: string
  enabled: boolean
}

export type PluginListResult =
  | { kind: 'ok'; plugins: PluginRecord[] }
  /** Absent CLI, non-zero exit, unparseable output, or a timeout. NEVER `[]`. */
  | { kind: 'unknown'; why: string }

export type PluginRunner = () => Promise<{ stdout: string; code: number }>

export const PLUGIN_LIST_TIMEOUT_MS = 5_000

export async function listPlugins(
  run: PluginRunner,
  timeoutMs: number = PLUGIN_LIST_TIMEOUT_MS
): Promise<PluginListResult> {
  let res: { stdout: string; code: number }
  try {
    res = await Promise.race([
      run(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timed out')), timeoutMs).unref?.()
      )
    ])
  } catch (e) {
    return { kind: 'unknown', why: String(e instanceof Error ? e.message : e) }
  }
  if (res.code !== 0) return { kind: 'unknown', why: `claude plugin list exited ${res.code}` }
  let parsed: unknown
  try {
    parsed = JSON.parse(res.stdout)
  } catch {
    return { kind: 'unknown', why: 'claude plugin list did not return JSON' }
  }
  if (!Array.isArray(parsed)) return { kind: 'unknown', why: 'plugin list was not an array' }
  const plugins: PluginRecord[] = []
  for (const raw of parsed) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    if (r.enabled !== true) continue
    if (typeof r.id !== 'string' || typeof r.installPath !== 'string') continue
    plugins.push({ id: r.id, installPath: r.installPath, enabled: true })
  }
  return { kind: 'ok', plugins }
}
```

- [ ] **Step 5: Walk the enabled paths in `toolbox-read.ts`**

Add `pluginId?: string` to `NamedToolEntry` in `src/shared/toolbox.ts`. In `toolbox-read.ts`,
after the three scopes are read, take an optional `plugins: PluginRecord[]` argument and read
`join(p.installPath, 'skills')` for each, stamping `pluginId: p.id` and `scope: 'user'`.

**`SKILLS_MAX` is the TOTAL**, not per source — pass the same `out.length` budget through, so
three scopes plus thirteen plugins cannot multiply the cap.

- [ ] **Step 6: Add to the file entry, run green, run the chain**

`scripts/file-entry.cjs` gains `...require('../src/main/plugin-list.ts')`.

```bash
npm run verify:file && npm run verify
```

- [ ] **Step 7: Commit**

```bash
git add src/main/plugin-list.ts src/main/toolbox-read.ts src/shared/toolbox.ts scripts/file-entry.cjs
git commit -m "feat(m126): plugin skills through claude plugin list --json — installPath bounds the walk, enabled is the CLI's answer, unknown never empty"
```

---

### Task 4: The Skills pane (M127, spec §3)

**Files:**
- Create: `src/renderer/shell/skills-pane-model.ts`, `src/renderer/shell/SkillsPane.tsx`
- Modify: `src/shared/settings-schema.ts` (`shell.navigator` gains `skills`),
  `src/renderer/shell/Navigator.tsx`, `src/renderer/shell/Dock.tsx`
- Test: `scripts/verify-rail.cjs`

**Interfaces:**
- Consumes: `placement`, `UNGROUPED_COLUMN_ID` (Task 1); `SkillResources`, `pluginId` (Tasks 2–3);
  `scoreMatch` from `src/renderer/palette/fuzzy.ts` (existing — read its exact export name before
  use; do not write a second matcher).
- Produces: `buildSkillColumns(entries, shelf, filter): SkillColumn[]` where
  `SkillColumn = { id: string; title: string; cards: SkillCard[] }` and
  `SkillCard = { key: SkillKey; name: string; description: string; why: PlacementWhy;
  resources: SkillResources; pluginId?: string; installed: boolean }`. Task 5 opens a card.

- [ ] **Step 1: Write the failing checks**

```js
/* ---- M127: the Skills pane ---- */
{
  const entries = [
    { kind: 'skill', scope: 'user', name: 'superpowers:brainstorming', description: 'd1',
      resources: { kind: 'none' }, pluginId: 'superpowers@x' },
    { kind: 'skill', scope: 'project', name: 'audit', description: 'd2',
      resources: { kind: 'some', n: 3 } },
    { kind: 'command', scope: 'user', name: 'review', description: 'd3' }
  ]
  const shelf = { columns: [{ id: 'c1', title: 'mobile', keys: ['["project","audit"]'] }] }
  const cols = buildSkillColumns(entries, shelf, { kind: 'skill', query: '', scopes: null, placedOnly: false })

  ok('skills.1a only the asked KIND appears',
     cols.every((c) => c.cards.every((k) => k.name !== 'review')), 'a command is not a skill')
  ok('skills.1b a placed skill sits in its column and says `placed`',
     cols.find((c) => c.id === 'c1').cards[0].why === 'placed', '')
  ok('skills.1c a plugin skill derives its own column',
     cols.some((c) => c.id === 'plugin:superpowers'), cols.map((c) => c.id).join(','))
  ok('skills.1d Ungrouped is ALWAYS present, even when it holds nothing',
     cols.some((c) => c.id === UNGROUPED_COLUMN_ID),
     'a column that vanishes when empty reads as a broken pane')

  const shelfWithGhost = { columns: [{ id: 'c1', title: 'mobile', keys: ['["user","gone"]'] }] }
  const ghost = buildSkillColumns(entries, shelfWithGhost, { kind: 'skill', query: '', scopes: null, placedOnly: false })
  ok('skills.1e a key whose skill is gone KEEPS its slot, marked not installed',
     ghost.find((c) => c.id === 'c1').cards.some((k) => k.installed === false),
     'the shelf is the user arrangement; a git pull does not get to edit it')

  const none = buildSkillColumns(entries, shelf, { kind: 'skill', query: 'zzzz', scopes: null, placedOnly: false })
  ok('skills.1f a search matching nothing yields NO columns, so the pane can say so',
     none.length === 0, 'an empty pane and "no skill matches zzzz" are different renderings')

  const placed = buildSkillColumns(entries, shelf, { kind: 'skill', query: '', scopes: null, placedOnly: true })
  ok('skills.1g placedOnly hides derived cards but never the Ungrouped column',
     placed.every((c) => c.cards.every((k) => k.why === 'placed')) &&
     placed.some((c) => c.id === UNGROUPED_COLUMN_ID), '')
}
```

- [ ] **Step 2: Run red, confirm the reason, commit the red check**

```bash
npm run verify:rail
git add scripts/verify-rail.cjs
git commit -m "check(m127): skills.1 — the pane's columns, Ungrouped always present, no-match says so — red"
```

- [ ] **Step 3: Implement `skills-pane-model.ts`, then `SkillsPane.tsx`**

The model is pure and is where every check lands. The component renders it and owns only the
tabs, the search input and the drag handlers. **Import `fuzzy.ts`'s matcher; do not write a
second one** — a divergent matcher differs from the palette's exactly in the cases nobody tests.

The pane's drop target carries its **own MIME** and reads nothing else (M114's rule for the
board). A drag onto the canvas opens the Task 5 panel at the drop point.

- [ ] **Step 4: Add `skills` to `shell.navigator`, wire `Navigator.tsx` and `Dock.tsx`**

- [ ] **Step 5: Run green, run the chain, commit**

```bash
npm run verify:rail && npm run verify
git add src/renderer/shell/ src/shared/settings-schema.ts
git commit -m "feat(m127): the Skills pane — columns over the inventory, three kind tabs, fuzzy.ts reused, Ungrouped undeletable"
```

---

### Task 5: The `skill` panel kind, the thirteenth (M128, spec §4)

**Files:**
- Create: `src/renderer/skills/SkillNode.tsx`, `src/renderer/skills/skill-node-model.ts`
- Modify: **the thirteen fan-out sites**, one appended arm each —
  `src/shared/layout-schema.ts`, `src/shared/settings-schema.ts`,
  `src/renderer/panels/panels.ts`, `src/renderer/panels/panel-state.ts`,
  `src/renderer/panels/layout-adapt.ts`, `src/renderer/components/PanelFrame.tsx`,
  `src/renderer/palette/commands.ts`, `src/renderer/palette/panel-name.ts`,
  `src/renderer/shell/rail-rows.ts`, `src/renderer/shell/inspector-fields.ts`,
  `src/renderer/shell/Inspector.tsx`, `src/renderer/shell/useShellChrome.ts`, `Canvas.tsx`
- Test: `scripts/verify-panels.cjs`, `scripts/verify-layout.cjs`

**Interfaces:**
- Consumes: `SkillCard` (Task 4), `ToolboxCache` (existing, keyed by resolved cwd).
- Produces: panel record `{ kind: 'skill', skill: { scope: ToolScope; name: string } }` and
  `skillNodeSections(entry, panelsOnCanvas): SkillSection[]`. Task 6 adds the Edit tab; Task 7's
  trail cards open this panel.

- [ ] **Step 1: Write the failing checks**

```js
/* ---- M128: the thirteenth kind ---- */
ok('skill.panel.1a the record holds exactly two fields and no copied data',
   Object.keys(rec.skill).sort().join(',') === 'name,scope',
   'a copied description is a second author that goes stale silently')
ok('skill.panel.1b a skill panel is sessionless', rec.session === undefined, '')
ok('skill.panel.1c the body names which OPEN panels can see this skill',
   /can see|available in/i.test(bodyText), 'the backlog #26 cross-panel answer')
ok('skill.panel.1d two scopes defining the name states the link and picks NO winner',
   /defined in/i.test(bodyText) && !/wins|shadows|overrides/i.test(bodyText), '')
ok('skill.panel.1e a plugin skill renders `claude plugin details` VERBATIM',
   verbatimBlock === recordedDetailsOutput,
   'parsed nowhere — there is no --json, and a parser here is a differential')
```

Plus a layout check that a `skill` panel round-trips and a pre-M128 file is untouched.

- [ ] **Step 2: Run red, commit the red check**

```bash
npm run verify:panels
git add scripts/verify-panels.cjs scripts/verify-layout.cjs
git commit -m "check(m128): skill.panel.1 — two fields and no copy, the cross-panel answer, no shadow winner — red"
```

- [ ] **Step 3: Add the kind at all thirteen sites**

Follow `work` (M116) as the worked example — `grep -rn "'work'" src/` lists exactly the sites
and shows the shape of each arm. **One appended arm per file; change nothing else.**

- [ ] **Step 4: Implement the model and the node**

Six body sections, **each a three-state result**: frontmatter, the capped `SKILL.md` text,
resources, `alsoDefinedIn`, the cross-panel answer, and the verbatim `claude plugin details`
block with a `readAt` and a refresh.

Three doors: `Start a chat with this skill` (**inserts** into the composer, never sends — M80's
rule for a template's chat message, not M114's for a dispatch), `Open folder`
(`shell.showItemInFolder` on `sourcePath`), `Help me write` (a chat in the skill's directory).

- [ ] **Step 5: Run green, run the chain, commit**

```bash
npm run verify:panels && npm run verify
git commit -am "feat(m128): the skill panel — the thirteenth kind, two fields and no copy, the cross-panel answer, plugin details verbatim"
```

---

### Task 6: The editor (M129, spec §5)

**Files:**
- Create: `src/shared/skill-edit.ts`, `src/main/skill-write.ts`,
  `src/renderer/skills/SkillEditor.tsx`
- Modify: `src/shared/ipc-contract.ts` (+4 channels), `src/main/ipc.ts`, `src/main/index.ts`
- Test: `scripts/verify-toolbox.cjs`, `scripts/verify-panels.cjs`

**Interfaces:**
- Consumes: `insidePlace(candidate, places, realpath)` from `src/shared/places.ts` — **reuse it,
  do not write a second containment check at a security boundary**; `parseFrontmatter` from
  `toolbox-scan.ts`; `renameInShelf` (Task 1).
- Produces: `frontmatterGrammatical(text): boolean`,
  `applySkillEdit(text, edit): { kind: 'ok'; text: string } | { kind: 'refused'; why: string }`,
  `ReadStamp = { mtimeMs: number; size: number }`, `staleRefusal(): string`, and main's four
  writers: `writeSkill(target, text, stamp, deps)`, `createSkill(root, name, deps)`,
  `renameSkill(from, to, deps)`, `deleteSkill(dir, deps)` — each taking
  `deps = { realpath: Realpath; skillRoots: string[]; pluginPaths: {id: string; installPath: string}[];
  trash: (p: string) => Promise<void> }`, so every refusal path runs under plain node.

- [ ] **Step 1: Write the failing checks — `edit.1` is the one that matters**

```js
/* ---- M129: the frontmatter round-trip. THE check of this milestone. ---- */
{
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
}
```

Then `edit.2` (atomic: no partial file after a failed rename), `edit.3` (containment over a
fake `realpath`: `..` out, a symlink out, a relative path, and a plugin `installPath` refused
**naming the plugin**), `edit.4` (the stale write refuses, keeps the text, names the fix),
`edit.5` (rename collision refused; `renameInShelf` carries the slot; delete calls the injected
`trash` and never `unlink`).

- [ ] **Step 2: Run red, read every failure, commit the red checks**

```bash
npm run verify:toolbox
git add scripts/verify-toolbox.cjs
git commit -m "check(m129): edit.1-.5 — the frontmatter round-trip, containment, the stale write — red"
```

- [ ] **Step 3: Implement `src/shared/skill-edit.ts`**

```ts
/**
 * M129. Editing a SKILL.md without destroying what we could not read.
 *
 * `parseFrontmatter` is DELIBERATELY a small grammar — a `key: value` line,
 * optionally quoted, and `null` for block scalars, anchors and multi-line
 * folds — because a real YAML parser would be a second runtime dependency and
 * a parser DIFFERENTIAL against the CLI. Its own comment says so.
 *
 * That refusal has a consequence the read half never faced. If Save
 * re-serialised the block from what the grammar parsed, every field the
 * grammar could not read would be DELETED — silently, in the user's own file,
 * while the panel reported a successful save. The file would still load; it
 * would just quietly mean something else.
 *
 * So this NEVER re-serialises. It rewrites only the specific `key: value`
 * LINES it understood, in place, and preserves every other byte inside the
 * fence — comments, blank lines, ordering, and every construct it cannot read.
 */
const KEY_LINE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/

export interface SkillMetaEdit {
  name?: string
  description?: string
}

export type SkillEditResult =
  | { kind: 'ok'; text: string }
  | { kind: 'refused'; why: string }

/** Split at the fences. Returns null when there is no frontmatter block at all. */
function splitFence(text: string): { open: number; close: number; lines: string[] } | null {
  const lines = text.split('\n')
  if (lines[0]?.trim() !== '---') return null
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return { open: 0, close: i, lines }
  }
  return null
}

/**
 * True when every non-blank line inside the fence is a `key: value` the small
 * grammar reads. False means the METADATA FIELDS render read-only with a named
 * reason while the body stays editable — the three-state rule applied to
 * editability, rather than a dead Save button that explains nothing.
 */
export function frontmatterGrammatical(text: string): boolean {
  const f = splitFence(text)
  if (f === null) return true // no block: nothing to preserve, nothing to break
  for (let i = f.open + 1; i < f.close; i++) {
    const line = f.lines[i]
    if (line.trim() === '') continue
    if (!KEY_LINE.test(line)) return false
  }
  return true
}

export function applySkillEdit(
  text: string,
  edit: { meta?: SkillMetaEdit; body?: string }
): SkillEditResult {
  const f = splitFence(text)
  if (f === null) {
    if (edit.meta !== undefined && Object.keys(edit.meta).length > 0) {
      return { kind: 'refused', why: 'this file has no frontmatter block to edit' }
    }
    return { kind: 'ok', text: edit.body ?? text }
  }
  const lines = [...f.lines]
  if (edit.meta !== undefined) {
    for (const [key, value] of Object.entries(edit.meta)) {
      if (value === undefined) continue
      let found = false
      for (let i = f.open + 1; i < f.close; i++) {
        const m = KEY_LINE.exec(lines[i])
        // Only a line the grammar UNDERSTOOD is rewritten. Everything else —
        // including a line whose key happens to match inside a block scalar —
        // is left exactly as it was.
        if (m !== null && m[1] === key) {
          lines[i] = `${key}: ${value}`
          found = true
          break
        }
      }
      // A key the block does not have is APPENDED just above the closing
      // fence, never at the top: prepending would reorder a block the user or
      // an agent authored deliberately.
      if (!found) lines.splice(f.close, 0, `${key}: ${value}`)
    }
  }
  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  const head = lines.slice(0, closeIdx + 1).join('\n')
  if (edit.body === undefined) {
    const oldBody = f.lines.slice(f.close + 1).join('\n')
    return { kind: 'ok', text: `${head}\n${oldBody}` }
  }
  return { kind: 'ok', text: `${head}\n\n${edit.body}` }
}

/**
 * The stamp the panel READ, carried on every write.
 *
 * An agent editing SKILL.md while the panel has it open is the ORDINARY case
 * in this application — it is what `Help me write` does. A blind save destroys
 * the agent's edit with no symptom on either side. M21's stat-sweep already
 * computes exactly this pair for its `stale` freshness arm.
 */
export interface ReadStamp {
  mtimeMs: number
  size: number
}

export function staleRefusal(): string {
  return 'this file changed on disk since you opened it — reload to see it; your edit is still here'
}
```

- [ ] **Step 4: Implement `src/main/skill-write.ts`**

Four writers, each refusing before it touches disk:

1. **Containment** — `insidePlace(target, skillRoots, realpath)`. Reused, not rewritten.
2. **Plugin refusal** — a target under any enabled `installPath` is refused **naming the
   plugin**: *"`superpowers` owns this folder; `claude plugin install` will discard the edit on
   the next upgrade."*
3. **Stale** — compare `ReadStamp` before writing; `staleRefusal()` on mismatch.
4. **Atomic** — temp file in the SAME directory, then `renameSync`.
5. **Delete** — the injected `trash` dep (`shell.trashItem` at runtime), on the skill's
   **directory**, so resources go with it; the confirm names the resource count from Task 2.
6. **Rename** — move the directory, refuse a collision, then `renameInShelf`.

- [ ] **Step 5: Implement `SkillEditor.tsx`**

Metadata fields + body + Save. When `frontmatterGrammatical()` is false the metadata fields are
read-only **with the reason on screen** and the body stays editable.

**Subscribe to `edit:copy` / `edit:paste` — `Palette.tsx`'s shape.** This is the fifth text
surface to inherit the hazard `CLAUDE.md` records for `ReviewNode`, `FileNode` and
`JiraTicket`, and the most expensive one. Add a comment saying the `edit:undo` half remains
open and why.

- [ ] **Step 6: Add the four channels, re-derive `EXPECTED_CHANNELS`, run the chain, commit**

```bash
npm run verify:toolbox && npm run verify:ipc && npm run verify
git add -A
git commit -m "feat(m129): the editor — Save never re-serialises frontmatter, the stale write refuses and keeps your text, containment is insidePlace reused"
```

---

### Task 7: The trail — main's half (M130, spec §6.1–6.3)

**Files:**
- Create: `src/shared/skill-trail.ts`, `src/main/skill-trail-read.ts`
- Modify: `src/shared/ipc-contract.ts` (`skill:trail`), `scripts/file-entry.cjs`
- Create fixture: `scripts/fixtures/skill-trail/session.jsonl`
- Test: `scripts/verify-file.cjs`

**Interfaces:**
- Consumes: `resolveTranscript(sessionId)` and `pinnedSession(panelId)` — **already injected
  deps on `PtyManager`** (`src/main/pty-manager.ts:533`, `:725`). Add no new path to the CLI's
  transcript.
- Produces: `scanTrailChunk(chunk, carry): { entries: TrailEntry[]; carry: string }`,
  `TrailEntry = { at: number; name: string; args?: string }`,
  `Trail = { kind: 'entries'; entries: TrailEntry[]; more: number } | { kind: 'none' } |
  { kind: 'unreadable'; why: string }`, `TRAIL_MAX = 40` (a 200-skill session must not paint
  200 cards, and a silent truncation is a lie about the order — hence `more`), and
  `trailFor(deps): Promise<Trail>` where
  `deps = { backend: BackendId; panelId: PanelId; pinnedSession: (id: PanelId) => string | undefined;
  resolveTranscript: (sessionId: string) => string | undefined; readDelta: (path: string, from: number)
  => { text: string; offset: number } }` — every one injected, so the suite drives fakes and no
  check reads the developer's real `~/.claude/projects`. Task 8 renders it.

- [ ] **Step 1: Record the fixture, then write the failing checks**

Build `scripts/fixtures/skill-trail/session.jsonl` from the measured shape (spec §0.1):

```jsonl
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Skill","input":{"skill":"superpowers:brainstorming"}}]},"timestamp":"2026-09-06T12:00:00.000Z"}
{"type":"assistant","message":{"content":[{"type":"text","text":"thinking"}]},"timestamp":"2026-09-06T12:00:01.000Z"}
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Read","input":{"file_path":"/x"}}]},"timestamp":"2026-09-06T12:00:02.000Z"}
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t3","name":"Skill","input":{"skill":"claude-api","args":"model ids"}}]},"timestamp":"2026-09-06T12:00:03.000Z"}
```

```js
/* ---- M130: the trail ---- */
{
  const all = readFileSync(FIXTURE, 'utf8')
  const one = scanTrailChunk(all, '')
  ok('trail.1a only Skill tool_use records become entries',
     one.entries.length === 2, JSON.stringify(one.entries))
  ok('trail.1b order is the transcript order',
     one.entries[0].name === 'superpowers:brainstorming' && one.entries[1].name === 'claude-api',
     'what order they were used in is the whole point')
  ok('trail.1c args ride when present and are ABSENT when not',
     one.entries[1].args === 'model ids' && !('args' in one.entries[0]),
     'an absent optional field stays absent — a spread would write undefined')

  // The byte-offset resume: two appends must equal one read.
  const cut = Math.floor(all.length / 2)
  const first = scanTrailChunk(all.slice(0, cut), '')
  const second = scanTrailChunk(all.slice(cut), first.carry)
  ok('trail.1d a truncated final line is CARRIED, never parsed',
     first.entries.length + second.entries.length === one.entries.length,
     'the tail resumes at a byte offset; a half-written line is not a dropped record')

  const capped = scanTrailChunk(all.repeat(200), '')
  ok('trail.1e TRAIL_MAX newest, with `more` counting what was dropped',
     capped.entries.length <= TRAIL_MAX, String(capped.entries.length))

  ok('trail.1f a codex panel refuses BY NAME, never an empty list',
     (await trailFor({ backend: 'codex' })).kind === 'unreadable',
     '"no skills used" and "we cannot see this session" are different sentences')
  ok('trail.1g an unresolvable transcript refuses by name',
     (await trailFor({ backend: 'claude', resolveTranscript: () => undefined })).kind === 'unreadable', '')
}
```

- [ ] **Step 2: Run red, commit the red checks**

```bash
npm run verify:file
git add scripts/verify-file.cjs scripts/fixtures/skill-trail/
git commit -m "check(m130): trail.1 — the recorded fixture, the byte-offset resume, codex refused by name — red"
```

- [ ] **Step 3: Implement the scan and the tail**

`scanTrailChunk` follows `agent-state.ts`'s `scanChunk` shape: a carry for the incomplete final
line, no throw on a malformed line (skip and count). `skill-trail-read.ts` keeps a per-panel
byte offset and reads only the delta — `scrollback-log.ts`'s append discipline, inverted.

- [ ] **Step 4: Run green, run the chain, commit**

```bash
npm run verify:file && npm run verify
git commit -am "feat(m130): the trail read — the CLI's own transcript tailed from a byte offset, codex and an unresolvable session refused by name"
```

---

### Task 8: The trail — the anchored lane (M130, spec §6.2, §6.4)

**Files:**
- Create: `src/renderer/skills/skill-trail-store.ts`
- Modify: `src/renderer/canvas/Canvas.tsx` (the derived lane beside `anchoredPanels`),
  `src/shared/layout-schema.ts` (`skillTrail?: 'collapsed'`),
  `src/renderer/panels/panels.ts` (`carryMarks`), `src/renderer/components/PanelFrame.tsx`
  (the capsule), `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs`

**Interfaces:**
- Consumes: `Trail` (Task 7); `carryMarks` (existing, M92); `anchoredPanels` (existing, M114).
- Produces: the derived lane. Nothing downstream consumes it.

- [ ] **Step 1: Write the failing checks**

```js
ok('trail.lane.1a NO trail entry is in the panel array',
   panels.every((p) => p.kind !== 'skill-trail'),
   'derived like a run frame — forty uses cost zero LOD budget and zero records')
ok('trail.lane.1b the lane re-derives from its host on a move', laneX2 - laneX1 === hostDx, '')
ok('trail.lane.1c the collapse mark SURVIVES a reload', afterReload.skillTrail === 'collapsed',
   'a layout mark like pinned, not a view state like flipped')
ok('trail.lane.1d collapsed shows one capsule that never disappears',
   /\d+ skills?/.test(capsuleText), 'a control that vanishes when off reads as never built')
ok('trail.lane.1e a carded panel paints no trail', cardTierTrailCount === 0, '')
ok('trail.lane.1f order on screen matches transcript order', laneOrder.join(',') === trailOrder.join(','), '')
ok('trail.lane.1g a name defined in two scopes picks NO winner',
   /defined in 2 scopes/.test(ambiguousCardText), 'M21 refusal, reused')
ok('trail.lane.1h a name the inventory does not know says `not installed here`',
   /not installed here/.test(unknownCardText),
   'the useful answer after a session used a plugin skill this project cannot see')
```

- [ ] **Step 2: Run red, commit the red checks**

- [ ] **Step 3: Implement**

The lane is a **single column at a fixed offset**, ordered top to bottom, derived every render
and never written back. `skillTrail?: 'collapsed'` is the only stored fact; carry it in
`carryMarks` beside `pinned`. The expand is a **finite** transition (M111's pulse rule); the
trail exists at the near tiers only.

- [ ] **Step 4: Add a `shot` scene `trail`, run the chain, commit**

```bash
npm run verify:panels && npm run verify && npm run shot
git commit -am "feat(m130): the trail's lane — derived and anchored, collapse the only stored fact, the capsule never disappears"
```

**Then read `docs/shots/trail.png`.** Spec §6.4 predicts this is the geometry most likely to
look wrong. If the lane crowds its host, adjust the offset here — not in a later milestone.

---

### Task 9: Assignments (M131, spec §7)

**Files:**
- Modify: `src/shared/teammates.ts` (`skills?: SkillKey[]`), `src/main/index.ts` (the brief
  append), `src/renderer/shell/SkillsPane.tsx` (the assign door)
- Test: `scripts/verify-teammates.cjs`

**Interfaces:**
- Consumes: `SkillKey` (Task 1), `insidePlace` (existing).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing checks**

```js
ok('assign.1a the brief append happens ONCE and in main', mainAppendCount === 1,
   'M100: main appends the brief from its own roster on every spawn — never a renderer copy')
ok('assign.1b a project-scoped skill outside the teammate places refuses BY NAME',
   /is not in .*'s places/.test(refusal) && !refusal.includes(worktreePath),
   'M114: a refusal must not name a path nobody should add')
ok('assign.1c the refusal names the REPOSITORY, which is the actionable fix',
   refusal.includes(repoRoot), refusal)
ok('assign.1d an unknown teammate is refused', assignTo('ghost').ok === false, '')
ok('assign.1e carryTeammate writes no undefined skills key',
   !('skills' in carryTeammate({ id: 'a', name: 'ada' })),
   'an absent optional field stays absent through every copy site')
```

- [ ] **Step 2: Run red, confirm the reason, commit the red checks**

```bash
npm run verify:teammates
git add scripts/verify-teammates.cjs
git commit -m "check(m131): assign.1 — the brief append in main, the project-scope refusal naming the repository — red"
```

- [ ] **Step 3: Add `skills?: SkillKey[]` to the teammate record**

In `src/shared/teammates.ts`, beside the existing optional fields. **Carry it in
`carryTeammate` only when present** — `if (t.skills !== undefined) out.skills = [...t.skills]`,
never `skills: t.skills`, which writes `undefined` and survives IPC as a present key.

- [ ] **Step 4: Append to the brief in main, at the one existing site**

`src/main/index.ts` already appends the teammate's brief from its own roster on every spawn
(M100). Extend **that append**, never add a second one — a renderer-side copy of the brief
drifts from main's in exactly the cases nobody tests.

```ts
// The claim is precise and the sentence must stay precise: the skills are
// NAMED to the agent. This app does not load, install or activate anything,
// and saying otherwise would be the overclaim agent-session.ts refuses when it
// declines to report a cost codex never gave.
const named = (teammate.skills ?? [])
  .map((k) => parseSkillKey(k))
  .filter((v): v is { scope: ToolScope; name: string } => v !== null)
  .filter((v) => v.scope !== 'project' || insidePlace(repoRootOf(v), teammate.places, realpath))
if (named.length > 0) {
  brief += `\n\nSkills available to you here: ${named.map((v) => v.name).join(', ')}.`
}
```

A project-scoped skill whose repository is outside the teammate's places is **dropped from the
brief and refused by name at the assign door** — naming the REPOSITORY, which is the actionable
fix, and never the worktree path (M114's rule: a refusal must not name a path nobody should add).

- [ ] **Step 5: Add the assign door to the pane, run green, run the chain, commit**

```bash
npm run verify:teammates && npm run verify
```

```bash
npm run verify:teammates && npm run verify
git commit -am "feat(m131): assignments — a shelf column onto a teammate's brief through M100's one append, the project-scope refusal naming the repository"
```

---

## Track B — a fresh-context subagent, in a worktree off Task 1's commit

**Dispatch after Task 1 lands.** Track B needs `shared/skills.ts` for nothing; it needs the
schema commit only so the two branches share a base for `layout-schema.ts`.

```bash
git worktree add -b m131-workflow .claude/worktrees/m131-workflow <Task-1-commit-sha>
```

### Task 10: The three node kinds (M132, spec §8)

**Files:**
- Create: `src/shared/workflow-nodes.ts`
- Modify: `src/shared/templates.ts`, `src/shared/layout-schema.ts:1359` (the template node arm)
- Test: `scripts/verify-layout.cjs`

**Interfaces:**
- Produces: `PoolNode = { kind: 'pool'; width: number; list: string; prompt: string }`,
  `OrchestratorNode = { kind: 'orchestrator'; prompt: string }`,
  `CollectNode = { kind: 'collect'; target: string }`, and `blockCount(template): number`.
  Task 11 runs the pool; Task 12 draws them.

- [ ] **Step 1: Write the failing checks**

```js
ok('workflow.1a the three kinds parse', parsed.nodes.length === 3, '')
ok('workflow.1b a pre-M132 template file loads UNTOUCHED',
   JSON.stringify(parseTemplates(preM131, w)) === JSON.stringify(expectedPreM131) && w.length === 0,
   'every existing template must survive this change silently')
ok('workflow.1c an unknown kind drops the node AND its edges, the template kept',
   after.nodes.length === 1 && after.edges.length === 0 && warnings.length === 1,
   'layout-schema:1359 existing arm, unchanged for whatever comes after these three')
ok('workflow.1d a pool width below 1 is dropped, never coerced to 1', /* … */)
ok('workflow.1e blockCount counts nodes, matching the header readout', blockCount(t) === 3, '')
```

- [ ] **Step 2: Run red, commit the red checks**

```bash
npm run verify:layout
git add scripts/verify-layout.cjs
git commit -m "check(m132): workflow.1 — three node kinds, a pre-M132 template untouched, an unknown kind drops its edges — red"
```

- [ ] **Step 3: Create `src/shared/workflow-nodes.ts`**

```ts
import type { TemplateNode } from './templates'

/**
 * M132. Three block types M80's template did not have.
 *
 * Each is a NEW ARM on an existing union, never a new engine: the pool asks
 * M82's ceiling, the orchestrator is M81's supervisor mechanism, and the
 * collect is M78's joinAdvance, which already delivers payloads in panel
 * order. Adding a fourth later takes the same shape.
 */
export interface PoolNode {
  kind: 'pool'
  /**
   * How many workers the author WANTS. Not a ceiling: M82's
   * agents.maxConcurrent is read live at start and bounds this, so a pool of
   * 12 under a ceiling of 4 runs 4 and queues 8 with reason 'concurrency'.
   */
  width: number
  /**
   * The shared work list, as a FILE PATH.
   *
   * A shared list needs exactly one authority, and a file on disk is one both
   * the app and the agents can see, that neither has to invent, and that
   * survives a relaunch. An in-memory list would make this app the author of
   * work the agents are doing — the two-authors failure refused at groupRect,
   * at the work card's rect and at the diagnostics bundle.
   */
  list: string
  prompt: string
  cwd: string
  dx: number
  dy: number
}

export interface OrchestratorNode {
  kind: 'orchestrator'
  /** Rides every spawn through --append-system-prompt. See parse note below. */
  prompt: string
  cwd: string
  dx: number
  dy: number
}

export interface CollectNode {
  kind: 'collect'
  /** A file path or a template node key. */
  target: string
  cwd: string
  dx: number
  dy: number
}

export type WorkflowNode = PoolNode | OrchestratorNode | CollectNode

export const POOL_WIDTH_MAX = 24

/** The header readout. Nodes, not edges — the screenshot says BLOCKS. */
export function blockCount(t: { nodes: readonly unknown[] }): number {
  return t.nodes.length
}

/**
 * ABSENT-vs-MALFORMED, per node. A node the parser cannot use is DROPPED and
 * takes its edges with it, and the template is kept — layout-schema:1359's
 * existing arm, which stays exactly as it is for whatever comes after these
 * three.
 */
export function parseWorkflowNode(raw: Record<string, unknown>, warnings: string[]): WorkflowNode | null {
  const base = { cwd: String(raw.cwd ?? ''), dx: Number(raw.dx ?? 0), dy: Number(raw.dy ?? 0) }
  if (raw.kind === 'pool') {
    const width = raw.width
    // Never coerced. A width of 0 is not "1 worker" — it is a file the author
    // did not finish, and running it would mint work nobody asked for.
    if (typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > POOL_WIDTH_MAX) {
      warnings.push(`dropped pool node: width was unusable`)
      return null
    }
    if (typeof raw.list !== 'string' || raw.list === '') {
      warnings.push('dropped pool node: no list')
      return null
    }
    return { ...base, kind: 'pool', width, list: raw.list, prompt: String(raw.prompt ?? '') }
  }
  if (raw.kind === 'orchestrator') {
    if (typeof raw.prompt !== 'string' || raw.prompt === '') {
      warnings.push('dropped orchestrator node: no prompt')
      return null
    }
    return { ...base, kind: 'orchestrator', prompt: raw.prompt }
  }
  if (raw.kind === 'collect') {
    if (typeof raw.target !== 'string' || raw.target === '') {
      warnings.push('dropped collect node: no target')
      return null
    }
    return { ...base, kind: 'collect', target: raw.target }
  }
  return null
}
```

- [ ] **Step 4: Widen the template parser at `layout-schema.ts:1359`**

The existing line reads
`if (n.kind !== 'terminal' && n.kind !== 'chat') { warnings.push(...); continue }`.
Widen the accepted set to include the three new kinds and route them through
`parseWorkflowNode`. **Leave the `continue` arm exactly as it is** — it is what makes an
unknown fourth kind drop cleanly rather than crash a user's whole template.

- [ ] **Step 5: Run green, run the chain, commit**

```bash
npm run verify:layout && npm run verify
git add src/shared/workflow-nodes.ts src/shared/templates.ts src/shared/layout-schema.ts
git commit -m "feat(m132): three template node kinds — pool, orchestrator and collect, each an arm on an existing union; a pre-M132 template loads untouched"
```

---

### Task 11: The pool (M132, spec §8.1) — the act's one new engine

**Files:**
- Create: `src/main/pool-runner.ts`
- Test: `scripts/verify-agent-session.cjs`

**Interfaces:**
- Consumes: the `limits` dep on `AgentSessionManager` (`agents.maxConcurrent`,
  `agents.budgetUsd` — **read live on every send**), the injected runner seam.
- Produces: `startPool(node, deps): PoolHandle`.

- [ ] **Step 1: Write the failing checks**

```js
ok('pool.1a width is bounded by maxConcurrent READ LIVE, not captured',
   started === 4 && queued === 8,
   'a pool of 12 under a ceiling of 4 — M82 built this queue; the pool gets no ceiling of its own')
ok('pool.1b a queued worker names WHICH queue it is in', reason === 'concurrency', '')
ok('pool.1c a worker that finishes pulls the next item until the list is empty',
   pulls === itemCount, "M97's loop shape widened from one agent to N")
ok('pool.1d an empty list ends the pool without minting a worker', minted === 0, '')
ok('pool.1e a list that cannot be read refuses BY NAME before any worker is minted',
   res.kind === 'refused' && minted === 0, '')
ok('pool.1f a budget crossing INTERRUPTS every worker and never kills one',
   interrupts === 4 && kills === 0,
   'a killed agent loses its turn, and a budget is a stop — M82, unchanged')
```

- [ ] **Step 2: Run red, commit the red checks**

```bash
npm run verify:agent-session
git add scripts/verify-agent-session.cjs
git commit -m "check(m132): pool.1 — the ceiling read live, the queue's reason, a budget crossing interrupting and never killing — red"
```

- [ ] **Step 3: Implement `src/main/pool-runner.ts`**

```ts
/**
 * M132. N workers over a shared list, each pulling the next item until the
 * list is empty. The act's ONE new engine.
 *
 * It takes NO ceiling of its own. M82's agents.maxConcurrent is read LIVE on
 * every send, and a send past it QUEUES on the same queue an in-flight turn
 * uses with reason 'concurrency' — the pool does not get its own queue, its
 * own limit, or its own opinion about concurrency. Every subsystem here that
 * invented its own limit eventually disagreed with the shipped one.
 *
 * M82's BUDGET applies unchanged, and this comment exists because a pool is
 * the single fastest way to spend money in this application. A crossing
 * INTERRUPTS every worker in flight and never kills one: a killed agent loses
 * its turn, and a budget is a stop.
 *
 * The loop is M97's shape widened from one agent to N — MAIN enforces the
 * stop, and any renderer chip is a projection that can never move it.
 */
import type { PoolNode } from '../shared/workflow-nodes'

export interface PoolDeps {
  /** Reads the shared list file. A failure is a REFUSAL, before any worker exists. */
  readList: (path: string) => { kind: 'ok'; items: string[] } | { kind: 'error'; why: string }
  /** M82's ceilings, read live — never captured at start. */
  limits: () => { maxConcurrent: number; budgetUsd: number }
  spend: () => number
  createWorker: (prompt: string, item: string) => Promise<{ id: string }>
  interrupt: (id: string) => void
  onEvent: (e: PoolEvent) => void
}

export type PoolEvent =
  | { kind: 'started'; id: string; item: string }
  | { kind: 'queued'; item: string; reason: 'concurrency' }
  | { kind: 'finished'; id: string }
  | { kind: 'refused'; why: string }
  | { kind: 'stopped'; why: 'empty' | 'budget' | 'by-hand' }

export function startPool(node: PoolNode, deps: PoolDeps): { stop: () => void } {
  const listed = deps.readList(node.list)
  if (listed.kind === 'error') {
    // Refused BY NAME before a worker is minted. A pool that starts four
    // agents and then discovers it has nothing for them has already spent
    // money on the mistake.
    deps.onEvent({ kind: 'refused', why: `could not read the work list: ${listed.why}` })
    return { stop: () => {} }
  }
  const pending = [...listed.items]
  const live = new Set<string>()
  let stopped = false

  const pump = async (): Promise<void> => {
    if (stopped) return
    const { maxConcurrent, budgetUsd } = deps.limits()   // LIVE, every pump
    if (budgetUsd > 0 && deps.spend() >= budgetUsd) {
      for (const id of live) deps.interrupt(id)          // interrupt, never kill
      stopped = true
      deps.onEvent({ kind: 'stopped', why: 'budget' })
      return
    }
    const ceiling = maxConcurrent > 0 ? Math.min(node.width, maxConcurrent) : node.width
    while (live.size < ceiling && pending.length > 0) {
      const item = pending.shift() as string
      const { id } = await deps.createWorker(node.prompt, item)
      live.add(id)
      deps.onEvent({ kind: 'started', id, item })
    }
    for (const item of pending.slice(0, Math.max(0, node.width - ceiling))) {
      deps.onEvent({ kind: 'queued', item, reason: 'concurrency' })
    }
    if (live.size === 0 && pending.length === 0) {
      stopped = true
      deps.onEvent({ kind: 'stopped', why: 'empty' })
    }
  }

  void pump()
  return {
    stop: () => {
      stopped = true
      for (const id of live) deps.interrupt(id)
      deps.onEvent({ kind: 'stopped', why: 'by-hand' })
    }
  }
}
```

Wire `finished` back into `pump()` so a worker that ends pulls the next item.

- [ ] **Step 4: Run green, run the chain**

```bash
npm run verify:agent-session && npm run verify
```

- [ ] **Step 5: Commit**

```bash
git add src/main/pool-runner.ts scripts/verify-agent-session.cjs
git commit -m "feat(m132): the pool — the shared list as a file, the ceiling read live with M82's own queue, a budget crossing interrupting every worker and killing none"
```

---

### Task 12: The workflow panel, the fourteenth kind (M133, spec §9)

**Files:**
- Create: `src/renderer/workflow/WorkflowNode.tsx`, `src/renderer/workflow/workflow-diagram.ts`
- Modify: the thirteen fan-out sites again, one arm each
- Test: `scripts/verify-panels.cjs`

- [ ] **Step 1: Write the failing checks**

```js
ok('workflow.panel.1a the diagram matches the RECORD, not a second layout',
   diagramNodeIds.join(',') === templateNodeKeys.join(','),
   'a projection — the live canvas is the editor and the template is the truth')
ok('workflow.panel.1b the header block count equals blockCount()', headerN === blockCount(t), '')
ok('workflow.panel.1c Runs shows only THIS template runs', runIds.every(inThisTemplate), '')
ok('workflow.panel.1d a trigger round-trips through watch-trigger.ts unchanged',
   savedTrigger.kind === 'git-ref', 'a workflow trigger is a watcher; not a second scheduler')
ok('workflow.panel.1e Run reaches M80 instantiation, not a second copy',
   instantiateCalls === 1, '')
```

- [ ] **Step 2: Run red, commit the red checks**

```bash
npm run verify:panels
git add scripts/verify-panels.cjs
git commit -m "check(m133): workflow.panel.1 — the diagram as a projection, Runs filtered, Run reaching M80 — red"
```

- [ ] **Step 3: Add the fourteenth kind at the thirteen fan-out sites**

Record: `{ kind: 'workflow', workflow: { templateId: string } }` — **the id and nothing else**,
for M116's reason: the template lives top level in the layout, and a copied node list on the
panel would be a second author that goes stale the moment the template is edited.

- [ ] **Step 4: Implement `workflow-diagram.ts` — pure, and the checks live here**

```ts
/**
 * The block diagram is a PROJECTION of the template record. It computes
 * geometry and returns it; it stores nothing and owns no camera.
 *
 * This is why @xyflow/react is declined in spec §11: a graph library brings a
 * second canvas with its own pan, zoom, selection and undo, and this app
 * already has one. The live canvas is the editor; the template is the truth;
 * this draws it.
 */
export interface DiagramBlock {
  key: string
  label: string
  sublabel: string      // 'POOL - 6 AT A TIME', 'SCRIPT - BASH', 'JUDGES EVERY RESULT'
  x: number; y: number; w: number; h: number
}
export interface DiagramEdge { from: string; to: string; trigger: string }

export function buildDiagram(t: PersistedTemplate): {
  blocks: DiagramBlock[]; edges: DiagramEdge[]; width: number; height: number
}
```

Nodes carry authored `dx`/`dy` (M80), so **no auto-layout is needed and `dagre` stays
declined** — spec §11 records it as a candidate only if that ever changes. Use a hyphen, not
`›`: `verify:styles icons.1` bans the glyph in renderer text.

- [ ] **Step 5: Implement `WorkflowNode.tsx`**

Header (name, `${blockCount(t)} blocks`, Run, Triggers, Save, Delete, Build with AI), a
**Definition** tab rendering `buildDiagram` as SVG — a sibling layer, the way
`AnnotationLayer.tsx` is a sibling of the link layer — and a **Runs** tab filtering M79's
existing `PersistedRun` records to this template. Triggers reuse `shared/watch-trigger.ts`
unchanged; Run calls M80's existing instantiation and never a second copy of it.

- [ ] **Step 6: Add a `shot` scene `workflow`, run the chain, commit**

```bash
npm run verify:panels && npm run verify && npm run shot
git add -A
git commit -m "feat(m133): the workflow panel — the diagram as a projection of the record, Runs from M79, triggers as watchers, Run reaching M80's instantiation"
```

**Then read `docs/shots/workflow.png`** before claiming the task done.

**If the act runs long, this is the task to defer** — the blocks are useful without the panel;
the panel is useless without the blocks.

---

## Merge

Track B merges into `m125-skills` after Task 9. **Run every plain-node suite the merge
touched**, not just the chain: Act I's merge lesson was a keep-both resolution of two blocks
appended at one marker that dropped a closing brace, and `verify:layout` read
`Unexpected end of input`. Both tracks append to `verify:layout.cjs` and to the panel-kind
fan-out, so that is exactly the collision shape.

```bash
npm run verify:layout && npm run verify:panels && npm run verify
```

## The gate

After the merge: `npm run shot`, read all scenes, hand the new ones (`skills`, `trail`,
`workflow`) plus the spec to a fresh-context critic and a fresh-context verifier. Then write
`docs/build-log/m126-m132-skills-and-workflows.md`, update `README.md`'s milestone table and
`CLAUDE.md`'s suite rows and channel count, and record the four owed manual-only checks from
spec §12 at the end of `docs/load-bearing.md`:

1. One real `claude` in a real terminal panel, two skills invoked, the lane showing both in order.
2. A real `SKILL.md` edited, saved, and invoked from a real session.
3. `shell.trashItem` on this machine.
4. A pool of N against a real budget, with `agents.budgetUsd` set deliberately low.
