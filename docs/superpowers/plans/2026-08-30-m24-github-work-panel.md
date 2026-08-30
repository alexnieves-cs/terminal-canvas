# M24 — GitHub work panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship GitHub as the second tier-2 integration and collapse it with Jira into one `work` panel kind, one `work:list` channel and one grouped result.

**Architecture:** Two provider-specific adapters in main (`jira-client.ts`, `github-client.ts`) share one injected-requester type and one `WorkListResult`. The persisted `jira` panel kind becomes `work` carrying a `provider`, migrating on parse. The renderer gets one pure `work-node-model.ts` and one `WorkNode.tsx` serving both providers.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React, `node:https`, plain-node verify scripts driven by esbuild bundles.

**Spec:** [`docs/superpowers/specs/2026-08-30-m24-github-work-panel-design.md`](../specs/2026-08-30-m24-github-work-panel-design.md)

## Global Constraints

- **No suite may make a network request.** Every adapter takes an injected requester. `npm run verify` is the repo's one green-or-not signal and must stay fast and offline.
- **No IPC return may carry a secret.** M14 rule 1. `work:list` returns `WorkListResult` only.
- **No environment-building module may import credential code.** M14 rule 2, policed as source text by `verify:meta` 21.
- **`verify:ipc` stays at 45 channels.** `jira:list` is *renamed*, never joined by a sibling.
- **Five panel kinds before and after.** `jira` becomes `work`; nothing is added.
- **Absence is preserved, never normalised to `undefined`.** Optional keys are rebuilt field by field, never spread — a spread survives IPC structured clone as a present key holding `undefined`.
- **Check numbers are appended, never renumbered.** Next free number per suite: `verify:layout` 150, `verify:viewport` 93, `verify:rail` 110, `verify:palette` 85, `verify:panels` 172. `verify:work` is a new suite starting at 1.
- **Run `npm run verify` before claiming a task done.** There is no unit-test runner and no linter; the chain is the whole verification story.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/work-item.ts` (modify) | Everything that crosses IPC: `WorkItem`, `WorkProvider`, `WorkGroup`, `WorkListResult`, provider labels, `isWorkProvider` |
| `src/main/work-request.ts` (create) | Main-only requester types + the one `node:https` implementation both adapters share |
| `src/main/jira-client.ts` (modify) | Jira adapter, now returning one group |
| `src/main/github-client.ts` (create) | GitHub adapter: two queries, dedupe, the 403 split |
| `src/shared/layout-schema.ts` (modify) | `PersistedWorkPanel`, the `jira`→`work` migration, provider validation |
| `src/renderer/panels/panels.ts` (modify) | `WorkPanel`, `isWorkPanel`, `makeWorkPanel`, the partition |
| `src/renderer/panels/layout-adapt.ts` (modify) | Both directions of the other door onto the format |
| `src/renderer/work/work-node-model.ts` (create) | Pure view model — every arm, checkable in plain node |
| `src/renderer/work/WorkNode.tsx` (create) | The component; replaces `JiraNode.tsx` |
| `scripts/verify-work.cjs` (create) | Replaces `verify-jira.cjs`; drives both adapters offline |

---

## Phase 1 — The work types and the migration

*Jira keeps working throughout. No behaviour change.*

### Task 1: The shared work vocabulary

**Files:**
- Modify: `src/shared/work-item.ts`
- Test: `scripts/verify-layout.cjs` (check 150)

**Interfaces:**
- Consumes: nothing.
- Produces: `WorkProvider`, `WORK_PROVIDERS`, `isWorkProvider(value: unknown): value is WorkProvider`, `WORK_PROVIDER_LABEL: Record<WorkProvider, string>`, `WorkGroup`, `WorkFailureKind`, `WorkListResult`. `WorkItem` is unchanged.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-layout.cjs`, after check 149. The bundle already resolves `@shared`; import the module at the top of the file beside the existing schema import.

```js
// 150. The provider union is CLOSED and its guard rejects everything outside
// it. A closed union that fails safe is M20's permissionMode rule: a value
// written by a version that knows a provider this one does not is one we
// cannot render, and guessing renders one provider's panel under another's
// name. The label map is asserted TOTAL in the same read, because a missing
// entry renders a panel titled `undefined` rather than failing to compile.
{
  const known = W.WORK_PROVIDERS.every((p) => W.isWorkProvider(p))
  const labelled = W.WORK_PROVIDERS.every(
    (p) => typeof W.WORK_PROVIDER_LABEL[p] === 'string' && W.WORK_PROVIDER_LABEL[p] !== ''
  )
  const rejects = ['linear', '', 'JIRA', null, undefined, 7, {}].every((v) => !W.isWorkProvider(v))
  ok('150 the provider union is closed, guarded and totally labelled',
    known && labelled && rejects && W.WORK_PROVIDERS.length === 2,
    `providers=${JSON.stringify(W.WORK_PROVIDERS)}`)
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run verify:layout`
Expected: FAIL — `W.WORK_PROVIDERS` is undefined, so `.every` throws. **A throw aborts the run**, so confirm the failure is this check and not a later one being skipped.

- [ ] **Step 3: Widen the module**

Replace the whole of `src/shared/work-item.ts`:

```ts
/** The one provider-neutral shape that crosses from a work-service adapter to
 * the canvas. M24 added a second provider and it did NOT have to change — that
 * the six fields survived contact with GitHub is the measured result, not a
 * design intention. */
export interface WorkItem {
  id: string
  title: string
  description: string
  assignee: string | null
  state: string | null
  url: string
}

/** Closed, and ordered as the palette renders it. A provider not named here
 * cannot be stored, listed or persisted — the rule SERVICES already states for
 * credentials, for the same reason: a free-form key makes a typo a permanent,
 * invisible second thing. */
export const WORK_PROVIDERS = ['jira', 'github'] as const
export type WorkProvider = (typeof WORK_PROVIDERS)[number]

export function isWorkProvider(value: unknown): value is WorkProvider {
  return typeof value === 'string' && (WORK_PROVIDERS as readonly string[]).includes(value)
}

/** One spelling of each provider's name, shared by the panel title, the palette
 * row and the node's heading. Three copies would drift the first time one was
 * edited. */
export const WORK_PROVIDER_LABEL: Record<WorkProvider, string> = {
  jira: 'Jira',
  github: 'GitHub'
}

/**
 * A group names the QUERY that produced its items, never the items themselves.
 *
 * This is the one place M24's surface widened under a second customer, and the
 * reason is worth keeping: an item found by `review-requested:@me` is
 * identical, on the wire, to the same item found by `assignee:@me`. The item
 * does not know which pile it is in — the query does — so encoding it on the
 * item would be the adapter stamping a value derived from which loop it
 * happened to be in.
 */
export interface WorkGroup {
  label: string
  items: WorkItem[]
  /** What the service said the FULL count is, which may exceed items.length.
   * Reported rather than swallowed: a list that simply stops is
   * indistinguishable from a list that is complete — REVIEW_FILE_CAP's rule. */
  total: number
}

/** Six answers, never collapsed, because each has a different fix. `rejected`
 * and `rate-limited` are the pair that matters: GitHub reports both as 403, and
 * rendering a rate limit as a bad credential sends the user to regenerate a
 * token that was fine. */
export type WorkFailureKind =
  | 'no-credential'
  | 'invalid-credential'
  | 'rejected'
  | 'rate-limited'
  | 'unavailable'
  | 'malformed'

export type WorkListResult =
  | { kind: 'groups'; groups: WorkGroup[] }
  | { kind: WorkFailureKind; reason: string }
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm run verify:layout`
Expected: PASS, and the suite's total rises by exactly 1.

- [ ] **Step 5: Commit**

```bash
git add src/shared/work-item.ts scripts/verify-layout.cjs
git commit -m "feat(m24): the shared work vocabulary, with a closed provider union"
```

---

### Task 2: The persisted `work` kind and the migration

**Files:**
- Modify: `src/shared/layout-schema.ts` (`PersistedJiraPanel` at :134, the `kind === 'jira'` arm at :492)
- Test: `scripts/verify-layout.cjs` (checks 151–153)

**Interfaces:**
- Consumes: `WorkProvider`, `isWorkProvider` from Task 1.
- Produces: `PersistedWorkPanel { kind: 'work'; provider: WorkProvider }`, replacing `PersistedJiraPanel` in the `PersistedPanel` union.

- [ ] **Step 1: Write the three failing checks**

Append to `scripts/verify-layout.cjs`:

```js
// 151. Legacy `kind: 'jira'` migrates and warns NOTHING. It is every file
// written between M17 and M24, which is exactly the standing an absent `kind`
// has at M9b: a historical fact about earlier files, not a message from a
// later version. A warning here would put a line in the log for every panel a
// working user already has.
{
  const parsed = parseLayout(JSON.stringify({
    version: 1,
    workspaces: [{ id: 'w1', name: 'Main', panels: [{ id: 'j3', kind: 'jira', x: 0, y: 0, w: 640, h: 520, z: 1 }] }],
    activeWorkspaceId: 'w1'
  }))
  const panel = parsed.state.workspaces[0].panels[0]
  ok('151 a legacy jira panel migrates to work/jira and warns nothing',
    panel?.kind === 'work' && panel.provider === 'jira' &&
      !parsed.warnings.some((w) => w.includes('j3')),
    `kind=${panel?.kind} provider=${panel?.provider} warnings=${JSON.stringify(parsed.warnings)}`)
}

// 152. An UNKNOWN provider drops THAT panel with a warning while its neighbour
// survives — the individual-drop rule this file obeys everywhere else, plus
// M20's closed-union rule. Both clauses are required: dropping everything
// satisfies "the bad one is gone" while silently emptying the canvas.
{
  const parsed = parseLayout(JSON.stringify({
    version: 1,
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'w9', kind: 'work', provider: 'linear', x: 0, y: 0, w: 640, h: 520, z: 1 },
      { id: 'w8', kind: 'work', provider: 'github', x: 0, y: 0, w: 640, h: 520, z: 2 }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const ids = parsed.state.workspaces[0].panels.map((p) => p.id ?? p.rect?.id)
  ok('152 an unknown provider is dropped alone, with a warning',
    parsed.state.workspaces[0].panels.length === 1 &&
      parsed.state.workspaces[0].panels[0].provider === 'github' &&
      parsed.warnings.some((w) => w.includes('w9')),
    `ids=${JSON.stringify(ids)} warnings=${JSON.stringify(parsed.warnings)}`)
}

// 153. An ABSENT provider on a `work` panel is DROPPED, never defaulted to
// jira. Defaulting would render one provider's panel under another's name and
// run the other's query behind it — a confident wrong answer, where a drop is
// merely a loss the warning explains.
{
  const parsed = parseLayout(JSON.stringify({
    version: 1,
    workspaces: [{ id: 'w1', name: 'Main', panels: [{ id: 'w7', kind: 'work', x: 0, y: 0, w: 640, h: 520, z: 1 }] }],
    activeWorkspaceId: 'w1'
  }))
  ok('153 a work panel with no provider is dropped, not defaulted',
    parsed.state.workspaces[0].panels.length === 0 &&
      parsed.warnings.some((w) => w.includes('w7')),
    `panels=${parsed.state.workspaces[0].panels.length}`)
}
```

- [ ] **Step 2: Run and watch all three fail**

Run: `npm run verify:layout`
Expected: 151 FAIL (`kind` is still `'jira'`), 152 FAIL (an unknown `work` kind is dropped for the wrong reason — the unrecognised-kind arm — so assert the *warning text* names the provider, not just that a warning exists), 153 FAIL for the same reason.

- [ ] **Step 3: Replace the type and the parse arm**

In `src/shared/layout-schema.ts`, replace line 134:

```ts
/**
 * M17 shipped this as `kind: 'jira'`. M24 renamed it, because a second
 * provider arrived and the kind was never about Jira — it is about work a
 * service says you owe. Legacy records migrate on parse; see the `'jira'` arm
 * in parsePanel.
 */
export interface PersistedWorkPanel extends PersistedPanelBase {
  kind: 'work'
  provider: WorkProvider
}
```

Update the `PersistedPanel` union member from `PersistedJiraPanel` to `PersistedWorkPanel`, and add `WorkProvider`/`isWorkProvider` to the existing `@shared/work-item` import.

Replace the `kind === 'jira'` arm:

```ts
  // Legacy, and it warns NOTHING: every file written between M17 and M24 says
  // 'jira', which is a historical fact about earlier files rather than a
  // message from a later version — the standing an absent `kind` has at M9b.
  if (kind === 'jira') return { ...base, kind: 'work', provider: 'jira' }
  if (kind === 'work') {
    const provider = (raw as Record<string, unknown>).provider
    // Closed union, dropped rather than defaulted. Defaulting to jira here
    // would render a GitHub panel under Jira's name and run Jira's query
    // behind it — a confident wrong answer, where a drop is a loss the
    // warning explains.
    if (!isWorkProvider(provider)) {
      warnings.push(`dropped panel ${id}: unknown work provider ${JSON.stringify(provider)}`)
      return null
    }
    return { ...base, kind: 'work', provider }
  }
```

- [ ] **Step 4: Run and watch all three pass**

Run: `npm run verify:layout`
Expected: PASS ×3, total up by 3. `npm run typecheck` will still fail — the renderer has not been updated yet; that is Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/shared/layout-schema.ts scripts/verify-layout.cjs
git commit -m "feat(m24): persist work panels, migrating the legacy jira kind"
```

---

### Task 3: The renderer panel type and the partition

**Files:**
- Modify: `src/renderer/panels/panels.ts` (:107, :127, :153, :178, :600–603)
- Test: `scripts/verify-viewport.cjs` (checks 93–94)

**Interfaces:**
- Consumes: `WorkProvider`, `WORK_PROVIDER_LABEL` from Task 1.
- Produces: `WorkPanel`, `isWorkPanel(panel): panel is WorkPanel`, `makeWorkPanel(id, centre, z, provider): WorkPanel`, `WORK_W`, `WORK_H`. `JiraPanel`, `isJiraPanel`, `makeJiraPanel`, `JIRA_W`, `JIRA_H` are all deleted.

- [ ] **Step 1: Write the two failing checks**

Append to `scripts/verify-viewport.cjs`:

```js
// 93. makeWorkPanel centres exactly and carries its provider, and the title is
// the SHARED label rather than a string typed here. makePanel's own contract
// (check 48) inherited by a sixth constructor.
{
  const p = P.makeWorkPanel('w1', 'github', { x: 1000, y: 500 }, 3)
  ok('93 makeWorkPanel centres exactly and carries its provider',
    p.kind === 'work' && p.provider === 'github' && p.z === 3 &&
      p.rect.x === 1000 - P.WORK_W / 2 && p.rect.y === 500 - P.WORK_H / 2 &&
      p.title === 'GitHub',
    `x=${p.rect.x} y=${p.rect.y} title=${p.title}`)
}

// 94. Check 92 widened to the RENAMED kind. It asserts FIVE panels in one read
// because a helper that got any ONE of them backwards still looks correct
// against the other four — and the two that must read TRUE are as load-bearing
// as the three that must read false. A work panel reading `true` here is a
// PanelSession minted for a <div>, a LIVE_BUDGET slot and a WebGL context spent
// on a panel that owns no process.
{
  const terminal = P.makePanel('n1', { command: '/bin/sh', cwd: '/', args: [] }, { x: 0, y: 0 }, 1)
  const legacy = { rect: { id: 'n2', x: 0, y: 0, w: 10, h: 10 }, z: 1, spec: { cwd: '/', args: [] } }
  const file = P.makeFilePanel('f1', { path: '/tmp/x' }, { x: 0, y: 0 }, 1)
  const review = P.makeReviewPanel('r1', { subjectId: 'n1', repoRoot: '/', baselineSha: 'abc', label: 'x' }, { x: 0, y: 0 }, 1)
  const work = P.makeWorkPanel('w1', 'jira', { x: 0, y: 0 }, 1)
  ok('94 isTerminalPanel admits a terminal and a kind-less panel, and excludes all four others',
    P.isTerminalPanel(terminal) === true && P.isTerminalPanel(legacy) === true &&
      P.isTerminalPanel(file) === false && P.isTerminalPanel(review) === false &&
      P.isTerminalPanel(work) === false && P.isWorkPanel(work) === true,
    `work=${P.isTerminalPanel(work)}`)
}
```

- [ ] **Step 2: Run and watch both fail**

Run: `npm run verify:viewport`
Expected: FAIL — `P.makeWorkPanel is not a function` throws. Since a throw aborts the run, confirm 94's failure separately after 93 passes.

- [ ] **Step 3: Rename in `panels.ts`**

Line 107:

```ts
export interface WorkPanel extends PanelBase { kind: 'work'; provider: WorkProvider }
```

Line 127 union: `JiraPanel` → `WorkPanel`. Line 153:

```ts
export function isWorkPanel(panel: Panel): panel is WorkPanel { return panel.kind === 'work' }
```

Line 178 — the partition. **Do not change its arity**:

```ts
    !isReviewPanel(panel) && !isFilePanel(panel) && !isWorkPanel(panel) && !isToolboxPanel(panel)
```

Lines 600–603:

```ts
export const WORK_W = 640
export const WORK_H = 520
/**
 * The provider is fixed at mint and there is no control that changes it: the
 * panel IS the answer to "what does this service say I owe", so a switcher
 * would make its own title a claim about a query it is no longer running.
 */
export function makeWorkPanel(id: string, centre: Point, z: number, provider: WorkProvider): WorkPanel {
  return {
    kind: 'work',
    provider,
    rect: { id, x: centre.x - WORK_W / 2, y: centre.y - WORK_H / 2, w: WORK_W, h: WORK_H },
    z,
    title: WORK_PROVIDER_LABEL[provider]
  }
}
```

Import `WorkProvider` and `WORK_PROVIDER_LABEL` from `@shared/work-item`.

- [ ] **Step 4: Run and watch both pass**

Run: `npm run verify:viewport`
Expected: PASS ×2. `verify-viewport.cjs`'s `@renderer` alias is already load-bearing, so no config change is needed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/panels.ts scripts/verify-viewport.cjs
git commit -m "feat(m24): rename the jira panel type to work, carrying its provider"
```

---

### Task 4: The other door onto the format

**Files:**
- Modify: `src/renderer/panels/layout-adapt.ts` (:35, :90)
- Test: `scripts/verify-layout.cjs` (check 154)

**Interfaces:**
- Consumes: `isWorkPanel` (Task 3), `PersistedWorkPanel` (Task 2).
- Produces: nothing new.

- [ ] **Step 1: Write the failing check**

```js
// 154. Check 117's argument applied to the renamed kind. `layout-adapt` is the
// OTHER door onto this format — fromPanels/toPanels, called on every save and
// every boot — and a schema-only round trip cannot see it. The no-cwd clause
// is the one with teeth: a work panel HAS no cwd, and writing one would parse
// back as a TERMINAL panel on the next launch and spawn a process.
{
  const live = [{ kind: 'work', provider: 'github', rect: { id: 'w1', x: 5, y: 6, w: 640, h: 520 }, z: 2, title: 'GitHub' }]
  const written = toPanels(live)
  const back = fromPanels(written)
  ok('154 a work panel round-trips through layout-adapt with no cwd key at all',
    written[0].kind === 'work' && written[0].provider === 'github' &&
      !('cwd' in written[0]) && !('args' in written[0]) &&
      back[0].kind === 'work' && back[0].provider === 'github' && back[0].title === 'GitHub',
    JSON.stringify(written[0]))
}
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run verify:layout`
Expected: FAIL — `written[0].kind` is `'jira'` and `provider` is undefined.

- [ ] **Step 3: Update both arms**

Line 35 (`fromPanels`, disk → live):

```ts
    if (p.kind === 'work') return { ...base, kind: 'work' as const, provider: p.provider }
```

Line 90 (`toPanels`, live → disk):

```ts
    // No cwd and no args keys AT ALL, the rule the two branches above state.
    if (isWorkPanel(panel)) return { ...base, kind: 'work' as const, provider: panel.provider }
```

Update the import from `isJiraPanel` to `isWorkPanel`.

- [ ] **Step 4: Run and watch it pass**

Run: `npm run verify:layout`
Expected: PASS. Then `npm run verify:viewport` to confirm Task 3 stayed green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/layout-adapt.ts scripts/verify-layout.cjs
git commit -m "feat(m24): carry the work provider through layout-adapt both ways"
```

---

### Task 5: Wire the renderer back up and widen the id seeds

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx` (:57, :69, :162, :359, :477, :1436), `src/renderer/jira/JiraNode.tsx` (props type only), `src/renderer/shell/rail-rows.ts`, `src/renderer/shell/inspector-fields.ts`, `src/renderer/palette/commands.ts`
- Test: `npm run typecheck` and the existing suites

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: `openWork(provider: WorkProvider): void` on the palette actions object, replacing `openJira()`.

This task is a compile-driven rename with **one** behavioural change: the id-seed regexes.

- [ ] **Step 1: Widen both id-seed regexes**

`Canvas.tsx` lines 359 and 1436 both read `/^[nrfjt](\d+)$/`. Both become:

```ts
      const match = /^[nrfjtw](\d+)$/.exec(id)
```

The comment near line 2916 that names the prefixes needs `w` added. **Legacy `j` ids must stay in the class** — a persisted `j4` the seed cannot see is a counter that hands out a duplicate id, which is the quiet direction.

- [ ] **Step 2: Rename every reference**

Run `grep -rn "isJiraPanel\|makeJiraPanel\|JiraPanel\|openJira\|JIRA_W\|JIRA_H" src/` and update each site. `Canvas.tsx:477` gains a provider parameter:

```ts
  const openWork = useCallback((provider: WorkProvider): void => {
    const id = `w${nextIdRef.current++}`
    setPanels((current) => {
      const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
      const next = [...current, makeWorkPanel(id, cascadeCentre(centre, current), nextZ(current), provider)]
      commitHistory(next)
      return next
    })
  }, [])
```

`Canvas.tsx:162`'s switcher label becomes:

```ts
  if (isWorkPanel(panel)) return `${WORK_PROVIDER_LABEL[panel.provider]} work (${panel.rect.id})`
```

Leave `JiraNode.tsx` in place for now, typed against `WorkPanel` — Task 10 replaces it.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean. Every remaining error is a rename site you missed.

- [ ] **Step 4: Full verify**

Run: `npm run verify`
Expected: green, with `verify:layout` +4, `verify:viewport` +2 versus the baseline. **Jira panels still render and still list tickets** — this phase changed no behaviour.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(m24): rename the jira panel kind through the renderer, widen id seeds"
```

---

## Phase 2 — The channel and the grouped result

### Task 6: The shared requester and Jira's group

**Files:**
- Create: `src/main/work-request.ts`
- Modify: `src/main/jira-client.ts`
- Create: `scripts/verify-work.cjs` (from `scripts/verify-jira.cjs`)
- Delete: `scripts/verify-jira.cjs`
- Modify: `package.json` (`verify:jira` → `verify:work`, in both the script list and the `verify` chain)

**Interfaces:**
- Consumes: `WorkListResult`, `WorkGroup` (Task 1).
- Produces: `WorkRequest`, `WorkResponse { status, body, headers }`, `WorkRequester`, `createWorkRequester()`, `WORK_TIMEOUT_MS`, `WORK_MAX_BODY_BYTES`. `listAssignedWorkItems(deps: { store, requester }): Promise<WorkListResult>` now returns `{ kind: 'groups', groups: [...] }`.

- [ ] **Step 1: Copy the suite and rewire the chain**

```bash
git mv scripts/verify-jira.cjs scripts/verify-work.cjs
```

In `package.json`, rename the `verify:jira` script to `verify:work` pointing at the new file, and change `npm run verify:jira` to `npm run verify:work` in the `verify` chain. `verify:meta` 19 asserts every suite is wired into the chain, so missing either half fails there rather than here.

- [ ] **Step 2: Write the failing check**

Append to `scripts/verify-work.cjs`:

```js
// 6. The result is GROUPED, and Jira returns exactly one group whose label
// names the QUERY. A flat list was the shape one customer could support; the
// second one cannot, and the group carries the service's own total so a capped
// list can say so rather than simply stopping.
{
  const body = JSON.stringify({
    total: 137,
    issues: [{ key: 'ENG-1', fields: { summary: 'Fix the thing', description: 'body', assignee: { displayName: 'Dev' }, status: { name: 'In Progress' } } }]
  })
  const deps = { store: store(BUNDLE), requester: async () => ({ status: 200, body, headers: {} }) }
  const res = await J.listAssignedWorkItems(deps)
  ok('6 Jira returns one labelled group carrying the service total',
    res.kind === 'groups' && res.groups.length === 1 &&
      res.groups[0].label === 'Assigned to you' &&
      res.groups[0].total === 137 &&
      res.groups[0].items[0].id === 'ENG-1',
    JSON.stringify(res))
}
```

- [ ] **Step 3: Run and watch it fail**

Run: `npm run verify:work`
Expected: FAIL — `res.kind` is `'items'`.

- [ ] **Step 4: Create the shared requester**

`src/main/work-request.ts`:

```ts
/**
 * What both work adapters need from the network, and the one implementation of
 * it. The TYPES live in main rather than in shared/ deliberately: nothing here
 * crosses IPC, and a requester type in shared/ would invite the renderer to
 * imagine it could make a request. What crosses IPC is WorkListResult, and that
 * is in shared/ for exactly that reason.
 */
import { request } from 'node:https'

export const WORK_TIMEOUT_MS = 15000
export const WORK_MAX_BODY_BYTES = 1024 * 1024

export interface WorkRequest {
  url: string
  headers: Record<string, string>
  timeoutMs: number
}

export interface WorkResponse {
  status: number
  body: string
  /**
   * Lower-cased header names. Jira ignores these; GitHub cannot, because it
   * answers 403 both for a rejected token and for an exhausted rate limit, and
   * `x-ratelimit-remaining` is the only thing that separates them. Reporting a
   * rate limit as a bad credential sends the user to regenerate a token that
   * was fine.
   */
  headers: Record<string, string>
}

export type WorkRequester = (req: WorkRequest) => Promise<WorkResponse>

export function createWorkRequester(): WorkRequester {
  return ({ url, headers, timeoutMs }) =>
    new Promise((resolve, reject) => {
      const req = request(url, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
        let body = ''
        let bytes = 0
        res.setEncoding('utf8')
        res.on('data', (part: string) => {
          bytes += Buffer.byteLength(part)
          if (bytes > WORK_MAX_BODY_BYTES) res.destroy(new Error('response too large'))
          else body += part
        })
        res.on('end', () => {
          const flat: Record<string, string> = {}
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') flat[key.toLowerCase()] = value
            else if (Array.isArray(value)) flat[key.toLowerCase()] = value.join(', ')
          }
          resolve({ status: res.statusCode ?? 0, body, headers: flat })
        })
        res.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', reject)
      req.end()
    })
}
```

- [ ] **Step 5: Move Jira onto it**

In `src/main/jira-client.ts`: delete `JiraRequest`, `JiraRequester`, `JiraListResult`, `TIMEOUT_MS`, `MAX_BODY_BYTES` and `createJiraRequester`; import `WorkRequester`, `WORK_TIMEOUT_MS`, `createWorkRequester` from `./work-request` and `WorkListResult` from `../shared/work-item`. `JiraDeps` becomes `{ store: CredentialStore; requester: WorkRequester }`. Re-export the shared requester so main's wiring has one import site: `export { createWorkRequester } from './work-request'`.

Change the success return of `listAssignedWorkItems`:

```ts
    const total = typeof (JSON.parse(response.body) as { total?: unknown }).total === 'number'
      ? (JSON.parse(response.body) as { total: number }).total
      : items.length
    // One group, and its label names the QUERY rather than the items. Jira
    // asks one question; GitHub asks two. The shape is the second customer's,
    // and Jira degenerates to it cleanly.
    return { kind: 'groups', groups: [{ label: 'Assigned to you', items, total }] }
```

Parse the body **once** into a local rather than calling `JSON.parse` twice — hoist the existing parse into `const payload = JSON.parse(response.body) as { issues?: unknown; total?: unknown }` and read both fields from it.

Update the return type of `listAssignedWorkItems` to `Promise<WorkListResult>` and delete the local `JiraListResult`.

- [ ] **Step 6: Run and watch it pass**

Run: `npm run verify:work`
Expected: 6/6 PASS. Checks 1–5 must be green too — check 5's assertion on the mapped item now reads `res.groups[0].items`, so update its indexing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(m24): one requester with headers, and Jira's grouped result"
```

---

### Task 7: `work:list` replaces `jira:list`

**Files:**
- Modify: `src/shared/ipc-contract.ts` (:216), `src/preload/index.ts`, `src/main/ipc.ts`, `README.md`, `scripts/verify-ipc-surface.cjs` (comment only)
- Test: `npm run verify:ipc`, `npm run verify:meta`

**Interfaces:**
- Consumes: `WorkProvider`, `WorkListResult`, `listAssignedWorkItems`.
- Produces: `IPC.WORK_LIST = 'work:list'`; bridge member `window.canvas.work.list(provider: WorkProvider): Promise<WorkListResult>`.

- [ ] **Step 1: Rename the channel**

`src/shared/ipc-contract.ts`, replacing the `JIRA_LIST` entry:

```ts
  /**
   * Main reads what a work service says the authenticated user owes.
   *
   * A RENAME of M17's `jira:list`, not a sibling: a second provider is a
   * parameter, and a channel per provider would make verify:ipc's count a
   * function of how many integrations exist. No return carries a secret — the
   * result is WorkItems and reasons, and there is still no credential:get.
   */
  WORK_LIST: 'work:list',
```

Update the bridge interface in the same file: `jira: { list(): ... }` becomes

```ts
  work: { list(provider: WorkProvider): Promise<WorkListResult> }
```

- [ ] **Step 2: Update preload and main**

`src/preload/index.ts` — replace the `jira` member:

```ts
  work: { list: (provider: WorkProvider) => ipcRenderer.invoke(IPC.WORK_LIST, provider) },
```

`src/main/ipc.ts` — replace the `JIRA_LIST` handler:

```ts
  ipcMain.handle(IPC.WORK_LIST, async (_event, provider: unknown): Promise<WorkListResult> => {
    // The provider is validated at the door rather than trusted: this argument
    // arrives from the renderer, and an unvalidated value would reach a switch
    // whose default is easy to write as a silent empty answer.
    if (!isWorkProvider(provider)) {
      return { kind: 'malformed', reason: 'unknown work provider' }
    }
    const requester = createWorkRequester()
    return provider === 'jira'
      ? listAssignedWorkItems({ store: credentialStore, requester })
      : listGithubWorkItems({ store: credentialStore, requester })
  })
```

`listGithubWorkItems` does not exist until Task 8. Until then, return `{ kind: 'no-credential', reason: 'GitHub is not wired up yet.' }` for the github arm and replace it in Task 8 — the plan's only deliberate stub, and it is replaced two tasks later.

- [ ] **Step 3: Update the README diagram**

In `README.md`'s IPC fenced block, change

```
renderer --invoke--> jira:list                                                 --> main
```

to

```
renderer --invoke--> work:list                                                 --> main
```

`verify:meta` 14 reads that fenced block against the real contract, so a missed line fails there.

- [ ] **Step 4: Update the channel-count comment**

In `scripts/verify-ipc-surface.cjs`, `EXPECTED_CHANNELS` **stays 45**. Its neighbouring comment carries the running arithmetic; add a sentence: *"M24 renamed `jira:list` to `work:list` and added none — a second provider is a parameter, not a channel."*

- [ ] **Step 5: Run the two suites**

Run: `npm run verify:ipc` — expected 1/1, still 45 channels.
Run: `npm run verify:meta` — expected 21/21.
Run: `npm run typecheck` — clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(m24): work:list replaces jira:list, taking a provider"
```

---

## Phase 3 — The GitHub adapter

### Task 8: `github-client.ts`

**Files:**
- Create: `src/main/github-client.ts`
- Modify: `src/main/ipc.ts` (replace Task 7's stub arm)
- Test: `scripts/verify-work.cjs` (checks 7–11)

**Interfaces:**
- Consumes: `WorkRequester`, `WORK_TIMEOUT_MS`, `CredentialStore`, `WorkListResult`.
- Produces: `listGithubWorkItems(deps: { store: CredentialStore; requester: WorkRequester }): Promise<WorkListResult>`.

- [ ] **Step 1: Write the five failing checks**

Append to `scripts/verify-work.cjs`:

```js
const ghStore = (value) => ({
  read: () => value,
  setLabel: () => {},
  list: () => (value === undefined ? [] : [{ service: 'github', label: 'octocat', addedAt: 'now' }])
})
const ghItem = (n, url) => ({
  number: n,
  title: `Item ${n}`,
  body: 'body text',
  html_url: url,
  state: 'open',
  assignee: { login: 'octocat' },
  repository_url: 'https://api.github.com/repos/acme/web'
})

// 7. Every request carries Bearer auth AND a User-Agent. The User-Agent is the
// one with teeth: GitHub rejects a request without one with 403 and an
// administrative-rules message, which is indistinguishable at this layer from
// a rejected token — so a missing header reports "GitHub rejected the
// credential" for a perfectly good PAT, forever, on every machine.
{
  const seen = []
  const deps = { store: ghStore('ghp_token'), requester: async (req) => { seen.push(req); return { status: 200, body: JSON.stringify({ total_count: 0, items: [] }), headers: {} } } }
  await G.listGithubWorkItems(deps)
  ok('7 every GitHub request carries Bearer auth and a User-Agent',
    seen.length === 2 &&
      seen.every((r) => r.headers.Authorization === 'Bearer ghp_token') &&
      seen.every((r) => typeof r.headers['User-Agent'] === 'string' && r.headers['User-Agent'] !== '') &&
      seen.every((r) => r.headers.Accept === 'application/vnd.github+json'),
    JSON.stringify(seen.map((r) => r.headers)))
}

// 8. Two queries become two labelled groups in a fixed order, and an item found
// by BOTH is listed ONCE under the earlier one. A PR assigned to you and
// awaiting your review is one obligation, not two, and the assignment is the
// stronger of them — listing it twice inflates both counts and makes the panel
// disagree with itself about how much is outstanding.
{
  const both = ghItem(7, 'https://github.com/acme/web/pull/7')
  const bodies = [
    JSON.stringify({ total_count: 2, items: [ghItem(1, 'https://github.com/acme/web/issues/1'), both] }),
    JSON.stringify({ total_count: 1, items: [both] })
  ]
  let call = 0
  const deps = { store: ghStore('ghp_token'), requester: async () => ({ status: 200, body: bodies[call++], headers: {} }) }
  const res = await G.listGithubWorkItems(deps)
  ok('8 two groups in order, with an item in both listed once under the first',
    res.kind === 'groups' && res.groups.length === 2 &&
      res.groups[0].label === 'Assigned to you' && res.groups[1].label === 'Awaiting your review' &&
      res.groups[0].items.length === 2 && res.groups[1].items.length === 0 &&
      res.groups[0].items[1].id === 'acme/web#7',
    JSON.stringify(res.groups.map((g) => [g.label, g.items.map((i) => i.id)])))
}

// 9. THE CHECK THIS MILESTONE TURNS ON. GitHub answers 403 for a rejected token
// AND for an exhausted search rate limit, and only x-ratelimit-remaining
// separates them. Without this split the app tells a rate-limited user their
// token is bad, and the user regenerates a perfectly good credential. Both
// directions are asserted, because a split written backwards reports every
// rejection as a rate limit and is equally wrong.
{
  const limited = { store: ghStore('ghp_token'), requester: async () => ({ status: 403, body: '{}', headers: { 'x-ratelimit-remaining': '0' } }) }
  const rejected = { store: ghStore('ghp_token'), requester: async () => ({ status: 403, body: '{}', headers: { 'x-ratelimit-remaining': '27' } }) }
  const unauthorised = { store: ghStore('ghp_token'), requester: async () => ({ status: 401, body: '{}', headers: {} }) }
  const a = await G.listGithubWorkItems(limited)
  const b = await G.listGithubWorkItems(rejected)
  const c = await G.listGithubWorkItems(unauthorised)
  ok('9 a 403 splits into rate-limited and rejected on the remaining header',
    a.kind === 'rate-limited' && b.kind === 'rejected' && c.kind === 'rejected' &&
      a.reason !== b.reason,
    `limited=${a.kind} rejected=${b.kind} unauthorised=${c.kind}`)
}

// 10. No stored credential refuses with ZERO network calls. The clause that
// carries this is `called === false`: an implementation that asked GitHub and
// then mapped the 401 answers "no credential" too, while having put an empty
// Bearer header on the wire.
{
  let called = false
  const deps = { store: ghStore(undefined), requester: async () => { called = true; return { status: 200, body: '{}', headers: {} } } }
  const res = await G.listGithubWorkItems(deps)
  ok('10 no stored credential refuses before any request is made',
    res.kind === 'no-credential' && called === false, `kind=${res.kind} called=${called}`)
}

// 11. A malformed 200 is its own answer, and a FAILED SECOND request fails the
// WHOLE load rather than rendering one group as if it were the answer. A
// partial answer shown as a complete one is the confident-wrong-answer failure
// this repo refuses everywhere: a user seeing one group has no way to know the
// other query returned 500.
{
  const bad = { store: ghStore('ghp_token'), requester: async () => ({ status: 200, body: 'not json', headers: {} }) }
  let call = 0
  const half = { store: ghStore('ghp_token'), requester: async () => (call++ === 0
    ? { status: 200, body: JSON.stringify({ total_count: 0, items: [] }), headers: {} }
    : { status: 500, body: '', headers: {} }) }
  const a = await G.listGithubWorkItems(bad)
  const b = await G.listGithubWorkItems(half)
  ok('11 a malformed body and a failed second query each fail the whole load',
    a.kind === 'malformed' && b.kind === 'unavailable', `a=${a.kind} b=${b.kind}`)
}
```

Bundle `github-client.ts` at the top of the suite the way `jira-client.ts` is already bundled, into `out/verify/github.cjs`, and bind it to `G`.

- [ ] **Step 2: Run and watch all five fail**

Run: `npm run verify:work`
Expected: the bundle step fails first (`Could not resolve`), which is this repo's test-first RED for a module that does not exist — **zero checks run**, so confirm each of 7–11 individually after Step 3 rather than trusting the total.

- [ ] **Step 3: Write the adapter**

`src/main/github-client.ts`:

```ts
import type { CredentialStore } from './credential-store'
import type { WorkItem, WorkGroup, WorkListResult } from '../shared/work-item'
import { WORK_TIMEOUT_MS, type WorkRequester, type WorkResponse } from './work-request'

const SEARCH = 'https://api.github.com/search/issues'
const PER_PAGE = 50

/**
 * The two questions, in the order they are rendered. `author:@me` is
 * deliberately absent: your own open PR is either assigned to you — the first
 * query — or it is waiting on someone else, which makes it their work item and
 * not yours. A third query would add a third failure path to restate a set we
 * mostly already have.
 */
const QUERIES: readonly { label: string; q: string }[] = [
  { label: 'Assigned to you', q: 'is:open assignee:@me' },
  { label: 'Awaiting your review', q: 'is:open review-requested:@me' }
]

export interface GithubDeps { store: CredentialStore; requester: WorkRequester }

function token(store: CredentialStore): string | 'missing' | 'invalid' {
  const value = store.read('github')
  if (value === undefined) return 'missing'
  const trimmed = value.trim()
  // A bare opaque string, unlike Jira's three-line bundle — so there is nothing
  // to parse beyond refusing an empty one, which would otherwise put
  // `Bearer ` on the wire and come back as a rejection the user cannot act on.
  return trimmed === '' ? 'invalid' : trimmed
}

function headers(bearer: string): Record<string, string> {
  return {
    Authorization: `Bearer ${bearer}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // Mandatory. Without it GitHub answers 403 with an administrative-rules
    // message, which is indistinguishable at this layer from a rejected token.
    // credential-verify.ts already sends this on its own GET /user; this is the
    // same fact, in the app's second GitHub caller.
    'User-Agent': 'terminal-canvas'
  }
}

function url(q: string): string {
  const params = new URLSearchParams({
    q,
    sort: 'updated',
    order: 'desc',
    per_page: String(PER_PAGE),
    advanced_search: 'true'
  })
  return `${SEARCH}?${params}`
}

/** `repository_url` is the only place a search result names its repository, and
 * `owner/repo#123` is what a user can paste into a browser or an agent. */
function itemId(record: { repository_url?: unknown; number?: unknown }): string | null {
  if (typeof record.repository_url !== 'string' || typeof record.number !== 'number') return null
  const parts = record.repository_url.split('/')
  const repo = parts.slice(-2).join('/')
  return repo === '' ? null : `${repo}#${record.number}`
}

function mapItem(raw: unknown): WorkItem | null {
  if (raw === null || typeof raw !== 'object') return null
  const record = raw as {
    number?: unknown; title?: unknown; body?: unknown; html_url?: unknown
    state?: unknown; draft?: unknown; assignee?: { login?: unknown }; repository_url?: unknown
  }
  const id = itemId(record)
  if (id === null || typeof record.title !== 'string' || typeof record.html_url !== 'string') return null
  return {
    id,
    title: record.title,
    description: typeof record.body === 'string' ? record.body : '',
    assignee: typeof record.assignee?.login === 'string' ? record.assignee.login : null,
    state: record.draft === true ? 'draft' : typeof record.state === 'string' ? record.state : null,
    url: record.html_url
  }
}

function failure(response: WorkResponse): { kind: 'rejected' | 'rate-limited' | 'unavailable'; reason: string } | null {
  if (response.status === 200) return null
  // The 403 split. GitHub reports a rejected token and an exhausted rate limit
  // with the same status, and these are two situations with two different
  // fixes: regenerate the token, or wait. Collapsing them tells a rate-limited
  // user their credential is bad.
  if (response.status === 403 && response.headers['x-ratelimit-remaining'] === '0') {
    return { kind: 'rate-limited', reason: 'GitHub’s search rate limit is spent. Try again shortly.' }
  }
  if (response.status === 401 || response.status === 403) {
    return { kind: 'rejected', reason: 'GitHub rejected the credential.' }
  }
  return { kind: 'unavailable', reason: `GitHub answered ${response.status}.` }
}

export async function listGithubWorkItems(deps: GithubDeps): Promise<WorkListResult> {
  const bearer = token(deps.store)
  if (bearer === 'missing') return { kind: 'no-credential', reason: 'Connect GitHub before loading work.' }
  if (bearer === 'invalid') return { kind: 'invalid-credential', reason: 'The stored GitHub credential is empty.' }

  const groups: WorkGroup[] = []
  // Deduped across groups, and the ORDER of QUERIES is what decides the winner:
  // an item in both piles is listed under the earlier one. Stated as an
  // ordering rather than as a PR-versus-issue rule, so a third provider's
  // groups inherit it.
  const seen = new Set<string>()

  for (const query of QUERIES) {
    let response: WorkResponse
    try {
      response = await deps.requester({ url: url(query.q), headers: headers(bearer), timeoutMs: WORK_TIMEOUT_MS })
    } catch {
      return { kind: 'unavailable', reason: 'GitHub could not be reached.' }
    }
    // Any failed request fails the WHOLE load. A partial answer rendered as a
    // complete one is a wrong answer the user cannot detect.
    const failed = failure(response)
    if (failed !== null) return failed

    let payload: { total_count?: unknown; items?: unknown }
    try {
      payload = JSON.parse(response.body) as { total_count?: unknown; items?: unknown }
    } catch {
      return { kind: 'malformed', reason: 'GitHub returned a response this app could not read.' }
    }
    if (!Array.isArray(payload.items)) {
      return { kind: 'malformed', reason: 'GitHub returned no result list.' }
    }

    const items: WorkItem[] = []
    for (const raw of payload.items) {
      const item = mapItem(raw)
      if (item === null || seen.has(item.url)) continue
      seen.add(item.url)
      items.push(item)
    }
    groups.push({
      label: query.label,
      items,
      // The service's own count, so a group holding 50 of 231 can say so.
      total: typeof payload.total_count === 'number' ? payload.total_count : items.length
    })
  }

  return { kind: 'groups', groups }
}
```

- [ ] **Step 4: Replace the stub in `main/ipc.ts`**

Import `listGithubWorkItems` and replace Task 7's placeholder arm with the real call.

- [ ] **Step 5: Run and watch all five pass**

Run: `npm run verify:work`
Expected: 11/11.
Run: `npm run typecheck` — clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(m24): the GitHub adapter, with the 403 split that separates two failures"
```

---

## Phase 4 — The renderer

### Task 9: The pure node model

**Files:**
- Create: `src/renderer/work/work-node-model.ts`
- Modify: `scripts/rail-entry.cjs` (re-export the new module), `src/renderer/shell/rail-rows.ts`, `src/renderer/shell/inspector-fields.ts`
- Test: `scripts/verify-rail.cjs` (checks 110–113)

**Interfaces:**
- Consumes: `WorkListResult`, `WorkProvider`, `WORK_PROVIDER_LABEL`.
- Produces: `buildWorkNodeModel(provider, result, title): WorkNodeModel` where

```ts
export interface WorkNodeRow { id: string; title: string; meta: string; description: string; url: string }
export interface WorkNodeGroup { label: string; rows: WorkNodeRow[]; note: string | null }
export interface WorkNodeModel {
  heading: string
  note: string | null
  groups: WorkNodeGroup[]
  /** True only for the arm a "Connect <service>" verb can fix. */
  connectable: boolean
}
```

- [ ] **Step 1: Write the three failing checks**

Append to `scripts/verify-rail.cjs`:

```js
// 110. Every non-groups arm renders a heading AND a note, never nothing. A work
// panel is one the user deliberately opened and dragged, and a panel that
// renders nothing at all is indistinguishable from a broken one — the rule
// buildFileNodeModel's own arms already obey. The non-vacuity clause demands
// the notes be DISTINCT sentences: "connect GitHub" and "GitHub rejected your
// token" have two different fixes, and collapsing them tells a user with a
// revoked token to connect an account they already connected.
{
  const arms = ['no-credential', 'invalid-credential', 'rejected', 'rate-limited', 'unavailable', 'malformed']
  const models = arms.map((kind) => W.buildWorkNodeModel('github', { kind, reason: `reason ${kind}` }, undefined))
  const notes = models.map((m) => m.note)
  ok('110 every failure arm renders a heading and its own distinct note',
    models.every((m) => typeof m.heading === 'string' && m.heading !== '' && typeof m.note === 'string' && m.note !== '') &&
      new Set(notes).size === arms.length,
    JSON.stringify(notes))
}

// 111. `connectable` is true for no-credential ALONE. It is what the node's
// "Connect GitHub" verb is gated on, and a flag that is always true offers to
// re-enter a credential to a user whose token was merely rate-limited — while a
// flag that is always false deletes the one affordance a user with nothing
// stored is guaranteed to be looking for (verify:palette 31's rule).
{
  const connect = W.buildWorkNodeModel('github', { kind: 'no-credential', reason: 'x' }, undefined)
  const others = ['invalid-credential', 'rejected', 'rate-limited', 'unavailable', 'malformed']
    .map((kind) => W.buildWorkNodeModel('github', { kind, reason: 'x' }, undefined))
  const listed = W.buildWorkNodeModel('github', { kind: 'groups', groups: [] }, undefined)
  ok('111 connectable is true for no-credential alone',
    connect.connectable === true && others.every((m) => m.connectable === false) &&
      listed.connectable === false,
    `connect=${connect.connectable}`)
}

// 112. An EMPTY group RENDERS with its own note rather than vanishing, and a
// group holding fewer items than the service's total says so. verify:rail 43's
// rule for the review pane's `clean` arm: a user with no review requests and a
// user whose query silently failed must not see the same thing. The title
// clause is M6a's honest chain reaching a sixth kind — a user's own title
// outranks the provider label.
{
  const result = {
    kind: 'groups',
    groups: [
      { label: 'Assigned to you', items: [{ id: 'acme/web#1', title: 'Fix it', description: 'body', assignee: 'octocat', state: 'open', url: 'https://example.test/1' }], total: 231 },
      { label: 'Awaiting your review', items: [], total: 0 }
    ]
  }
  const m = W.buildWorkNodeModel('github', result, 'My queue')
  ok('112 an empty group renders a note, a capped group reports its remainder, and a title outranks the label',
    m.heading === 'My queue' && m.note === null &&
      m.groups.length === 2 &&
      m.groups[0].rows.length === 1 && typeof m.groups[0].note === 'string' && m.groups[0].note.includes('231') &&
      m.groups[1].rows.length === 0 && typeof m.groups[1].note === 'string' && m.groups[1].note !== '' &&
      W.buildWorkNodeModel('github', result, undefined).heading === 'GitHub',
    JSON.stringify(m.groups.map((g) => [g.label, g.rows.length, g.note])))
}
```

```js
// 113. The rail and inspector arms together, and this check closes a
// PRE-EXISTING gap the rename surfaced rather than caused: `rail-rows.ts` has
// arms for `file` and `toolbox` — both placed BEFORE the dormant test, and both
// commented with the same reason — and has never had one for `jira`. So a work
// panel falls through to `if (dormant) return 'dormant'` and then to
// `'not started'`: a sentence about a process it does not have, above a start
// control nothing can honour. The inspector clause is the other half — a node
// with no process must refuse the process verbs, the refusal a review node and
// a file panel already earn.
{
  const panel = { kind: 'work', provider: 'github', rect: { id: 'w1', x: 0, y: 0, w: 640, h: 520 }, z: 1 }
  const tail = R.railTail({ kind: 'work', dormant: true, status: undefined })
  const rows = R.buildRailRows([panel], undefined, new Map(), new Set(['w1']))
  const inspector = I.buildInspectorModel(panel, undefined, [], [])
  ok('113 a work panel is never dormant, says `work`, and refuses the process verbs',
    tail === 'work' && rows[0].tail === 'work' &&
      inspector.restartable === false && inspector.reattached === false,
    `tail=${tail} rowTail=${rows[0]?.tail} restartable=${inspector.restartable}`)
}
```

Match the real signatures of `railTail`, `buildRailRows` and `buildInspectorModel` as the suite already calls them — the shapes above are indicative, and the surrounding checks show the exact argument lists.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run verify:rail`
Expected: the esbuild bundle fails to resolve the new module — zero checks run. Confirm 110–113 individually once the module exists. **113 fails for its own reason even after the module lands**, because `rail-rows.ts` needs the new arm.

- [ ] **Step 3: Write the model**

`src/renderer/work/work-node-model.ts`:

```ts
/**
 * The work node's own view model — pure, so every arm is checkable in the
 * cheapest tier the repo has.
 *
 * M17's JiraNode built its rendering inline and had no model checks at all;
 * review, file and toolbox nodes each have one of these. The new kind follows
 * the majority rather than the one exception.
 */
import type { WorkListResult, WorkProvider } from '@shared/work-item'
import { WORK_PROVIDER_LABEL } from '@shared/work-item'

export interface WorkNodeRow {
  id: string
  title: string
  /** State and assignee, already composed — the row renders it verbatim. */
  meta: string
  description: string
  url: string
}

export interface WorkNodeGroup {
  label: string
  rows: WorkNodeRow[]
  /** Present when the group is empty, or when it holds fewer than the total. */
  note: string | null
}

export interface WorkNodeModel {
  heading: string
  note: string | null
  groups: WorkNodeGroup[]
  connectable: boolean
}

const FAILURE_NOTE: Record<string, (label: string, reason: string) => string> = {
  'no-credential': (label) => `Connect ${label} to see the work assigned to you.`,
  'invalid-credential': (label) => `The stored ${label} credential could not be read. Enter it again.`,
  rejected: (label) => `${label} rejected the stored credential. Regenerate the token and enter it again.`,
  'rate-limited': (label) => `${label} is rate-limiting this app. Refresh in a minute.`,
  unavailable: (_label, reason) => reason,
  malformed: (label) => `${label} returned a response this app could not read.`
}

function groupNote(shown: number, total: number): string | null {
  // An empty group RENDERS rather than vanishing: a user with nothing awaiting
  // their review and a user whose query silently failed must not see the same
  // thing. verify:rail 43's rule, in a second section.
  if (shown === 0) return 'Nothing here.'
  // A list that simply stops is indistinguishable from a list that is complete.
  if (total > shown) return `Showing ${shown} of ${total}.`
  return null
}

export function buildWorkNodeModel(
  provider: WorkProvider,
  result: WorkListResult | null,
  title: string | undefined
): WorkNodeModel {
  const label = WORK_PROVIDER_LABEL[provider]
  // M6a's honest chain, reaching a sixth kind: a user's own title outranks the
  // provider's name, exactly as it already does for a terminal panel's header
  // and a review node's heading.
  const heading = title ?? label

  if (result === null) {
    return { heading, note: `Reading ${label}…`, groups: [], connectable: false }
  }

  if (result.kind !== 'groups') {
    const note = FAILURE_NOTE[result.kind]?.(label, result.reason) ?? result.reason
    // Only the arm a "Connect" verb can actually fix. A flag that is always
    // true offers to re-enter a credential to a rate-limited user.
    return { heading, note, groups: [], connectable: result.kind === 'no-credential' }
  }

  return {
    heading,
    note: null,
    connectable: false,
    groups: result.groups.map((group) => ({
      label: group.label,
      note: groupNote(group.items.length, group.total),
      rows: group.items.map((item) => ({
        id: item.id,
        title: item.title,
        meta: [item.state, item.assignee].filter((part) => part !== null && part !== '').join(' · '),
        description: item.description,
        url: item.url
      }))
    }))
  }
}
```

- [ ] **Step 4: Re-export it from the rail bundle**

`scripts/rail-entry.cjs` re-exports each pure model it checks; add `work-node-model` alongside the existing ones and bind it to `W` in the suite. `verify-rail.cjs`'s `@renderer` alias is already load-bearing, and `@shared` becomes load-bearing here for the first time — this module imports `WORK_PROVIDER_LABEL` as a **value**. If the bundle fails to resolve `@shared`, add the alias to `rail-entry.cjs`'s `buildSync` call. **Measure it rather than assuming**: delete the alias and build; if it resolves, the alias is pre-emptive and say so in the file's header comment.

- [ ] **Step 5: Add the missing rail arm**

In `src/renderer/shell/rail-rows.ts`, beside the `file` and `toolbox` arms and **before the dormant test**, for the reason their own comments give:

```ts
  // Same reason again, same placement: a work panel owns no process, so
  // 'not started' is a sentence about something it does not have and 'dormant'
  // would render a start control nothing can honour. M17's jira panel never had
  // this arm and fell through to both; the rename is what surfaced it.
  if (kind === 'work') return 'work'
```

In `src/renderer/shell/inspector-fields.ts`, update the `isJiraPanel` arm at :426 to `isWorkPanel`, keeping `restartable: false`, and make its one field name the provider rather than hardcoding Jira:

```ts
    fields: [{ key: 'work', label: 'source', value: `work assigned to you in ${WORK_PROVIDER_LABEL[panel.provider]}` }]
```

- [ ] **Step 6: Run and watch them pass**

Run: `npm run verify:rail`
Expected: 117/117 (113 + 4).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(m24): the work node's pure model, and the rail arm jira never had"
```

---

### Task 10: `WorkNode.tsx`

**Files:**
- Create: `src/renderer/work/WorkNode.tsx`
- Delete: `src/renderer/jira/JiraNode.tsx` (and the now-empty `src/renderer/jira/`)
- Modify: `src/renderer/canvas/Canvas.tsx` (the render arm at :69 and its usage), `src/renderer/styles.css` (rename `.jira-node__item` to `.work-node__item`)
- Test: covered end to end by Task 12

**Interfaces:**
- Consumes: `buildWorkNodeModel`, `WorkPanel`, `window.canvas.work.list`.
- Produces: `WorkNode` component with props `{ panel: WorkPanel; selected: boolean; onSelect; onFocus; onBeginDrag; onClose; onSpawn(item: WorkItem): void; onConnect(provider: WorkProvider): void }`.

- [ ] **Step 1: Write the component**

`src/renderer/work/WorkNode.tsx` — modelled on `JiraNode.tsx`, with three differences that each matter:

```tsx
import { useCallback, useEffect, useState, type JSX } from 'react'
import type { WorkPanel } from '@renderer/panels/panels'
import type { WorkItem, WorkListResult, WorkProvider } from '@shared/work-item'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { buildWorkNodeModel } from './work-node-model'

export function WorkNode(props: {
  panel: WorkPanel
  selected: boolean
  onSelect(id: string): void
  onFocus(id: string): void
  onBeginDrag(state: DragState): void
  onClose(id: string): void
  onSpawn(item: WorkItem): void
  onConnect(provider: WorkProvider): void
}): JSX.Element {
  const { panel } = props
  const [result, setResult] = useState<WorkListResult | null>(null)

  const load = useCallback((): void => {
    setResult(null)
    void window.canvas.work
      .list(panel.provider)
      .then(setResult)
      .catch(() => setResult({ kind: 'unavailable', reason: 'The request could not be made.' }))
  }, [panel.provider])

  useEffect(() => { load() }, [load])

  const model = buildWorkNodeModel(panel.provider, result, panel.title)

  return (
    <div
      className={`panel work-node${props.selected ? ' panel--selected' : ''}`}
      data-panel-id={panel.rect.id}
      data-panel-kind="work"
      data-work-provider={panel.provider}
      style={{ left: panel.rect.x, top: panel.rect.y, width: panel.rect.w, height: panel.rect.h, zIndex: panel.z }}
    >
      <header
        className="panel__chrome"
        onMouseDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          props.onSelect(panel.rect.id)
          props.onBeginDrag({ panelId: panel.rect.id, mode: { kind: 'move' }, originRect: panel.rect, originWorld: { x: e.clientX, y: e.clientY } })
        }}
      >
        <span className="panel__title">{model.heading}</span>
        <button type="button" className="file-node__refresh" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); load() }}>⟳</button>
        <button type="button" className="panel__close" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) }}>×</button>
      </header>
      <div className="file-node__body" data-scroll-host onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}>
        {model.note !== null ? <p className="file-node__note">{model.note}</p> : null}
        {model.connectable ? (
          <button type="button" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onConnect(panel.provider) }}>
            Connect
          </button>
        ) : null}
        {model.groups.map((group) => (
          <section className="work-node__group" key={group.label}>
            <h3 className="work-node__group-label">{group.label}</h3>
            {group.rows.map((row) => (
              <article className="work-node__item" key={row.id}>
                <strong>{row.id}: {row.title}</strong>
                <small>{row.meta}</small>
                <p>{row.description || 'No description.'}</p>
                <button type="button" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onSpawn({ id: row.id, title: row.title, description: row.description, assignee: null, state: null, url: row.url }) }}>
                  Start session
                </button>
              </article>
            ))}
            {group.note !== null ? <p className="file-node__note">{group.note}</p> : null}
          </section>
        ))}
      </div>
    </div>
  )
}
```

`WorkNodeRow` deliberately carries everything the spawn needs, which is why the button reconstructs a `WorkItem` from the row rather than the model holding a second copy of the adapter's own list.

- [ ] **Step 2: Render it from `Canvas.tsx`**

Replace the `JiraNode` import and its render arm with `WorkNode`, passing `onConnect` wired to the existing credential-entry flow (`beginSetCredential`, the same verb the palette's credential rows already call).

- [ ] **Step 3: Rename the CSS class**

`.jira-node__item` becomes `.work-node__item`; add `.work-node__group` and `.work-node__group-label` using only existing tokens — `verify:styles` 1 fails on any hardcoded colour and 4–6 on any literal outside the type/radius/spacing scales.

- [ ] **Step 4: Verify**

Run: `npm run verify:styles && npm run typecheck && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(m24): WorkNode replaces JiraNode and serves both providers"
```

---

### Task 11: The palette rows

**Files:**
- Modify: `src/renderer/palette/commands.ts` (:292, :869–870)
- Test: `scripts/verify-palette.cjs` (checks 85–86)

**Interfaces:**
- Consumes: `WORK_PROVIDERS`, `WORK_PROVIDER_LABEL`, `openWork(provider)` (Task 5).
- Produces: `REASON_NO_CONNECTION` exported constant; one `work.open.<provider>` row per provider.

- [ ] **Step 1: Write the two failing checks**

```js
// 85. One row per provider, ALWAYS VISIBLE, each aimed at its OWN provider. The
// always-visible half is the fix: today's jira row renders only when a Jira
// credential exists, which is exactly the failure verify:palette 70's comment
// names for the credential Add row — the row a user without the integration
// most needs to see is the one that is missing, and its absence is
// indistinguishable from a feature that was never built. The own-provider
// clause is the other half: a row carrying a hardcoded provider opens the wrong
// panel and looks entirely correct doing it.
{
  const bare = ctx({ credentials: [] })
  const work = P.buildCommands(bare).filter((r) => r.id.startsWith('work.open.'))
  const connected = ctx({ credentials: [{ service: 'github', label: 'octocat', addedAt: 'now' }] })
  const github = byId(P.buildCommands(connected), 'work.open.github')
  github?.run()
  ok('85 one always-visible row per provider, each aimed at its own',
    work.length === 2 && work.every((r) => typeof r.disabledReason === 'string') &&
      github !== undefined && github.disabledReason === undefined &&
      connected.actions.calls.length === 1 &&
      connected.actions.calls[0][0] === 'openWork' && connected.actions.calls[0][1] === 'github',
    `rows=${work.length} calls=${JSON.stringify(connected.actions.calls)}`)
}

// 86. An unconnected provider's row is DISABLED WITH A REASON naming that
// provider, never absent — and the two reasons differ, because "connect Jira"
// and "connect GitHub" send the user to two different places. Compared against
// the EXPORTED constant rather than a string literal, which would keep passing
// while the text the user actually reads said something else entirely.
{
  const rows = P.buildCommands(ctx({ credentials: [] }))
  const jira = byId(rows, 'work.open.jira')
  const github = byId(rows, 'work.open.github')
  ok('86 an unconnected provider is disabled with its own reason, not hidden',
    jira?.disabledReason === P.REASON_NO_CONNECTION('Jira') &&
      github?.disabledReason === P.REASON_NO_CONNECTION('GitHub') &&
      jira.disabledReason !== github.disabledReason,
    `jira=${jira?.disabledReason} github=${github?.disabledReason}`)
}
```

- [ ] **Step 2: Run and watch both fail**

Run: `npm run verify:palette`
Expected: FAIL — `work.length === 0`, because the row is still `jira.open` and still conditional.

- [ ] **Step 3: Replace the row**

In `commands.ts`, the actions member `openJira(): void` becomes `openWork(provider: WorkProvider): void`. Export the reason builder and generate one row per provider:

```ts
/** Names WHICH service to connect. "Connect an account" would leave a user with
 * two integrations unable to tell which row they are looking at. */
export const REASON_NO_CONNECTION = (label: string): string => `connect ${label} first`

for (const provider of WORK_PROVIDERS) {
  const label = WORK_PROVIDER_LABEL[provider]
  const connected = ctx.credentials.some((credential) => credential.service === provider)
  out.push({
    id: `work.open.${provider}`,
    title: `Open ${label} work`,
    subtitle: 'Assigned to you',
    searchText: `${provider} ${label} tickets issues assigned work review`,
    group: 'manage',
    // Present and disabled rather than absent: a row that appears only once a
    // credential exists is indistinguishable from a feature that was never
    // built, and it is the one row a user with nothing stored is guaranteed to
    // be looking for.
    disabledReason: connected ? undefined : REASON_NO_CONNECTION(label),
    run: () => actions.openWork(provider)
  })
}
```

- [ ] **Step 4: Run and watch both pass**

Run: `npm run verify:palette`
Expected: 89/89 (87 + 2). **Check 33 may now match more rows** — it asserts ranks-first rather than exclusivity, so confirm it is still green rather than assuming.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(m24): one always-visible palette row per work provider"
```

---

### Task 12: End to end in a real renderer

**Files:**
- Modify: `scripts/panels-entry.cjs` (stub the requester), `scripts/verify-panels.cjs` (checks 172–174)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Fence the harness**

`panels-entry.cjs` must never reach GitHub. Substitute the requester where it constructs the IPC handlers, answering a fixture payload for the two search URLs and refusing everything else — the same substituted-deps route the git and prompt fences already establish. **Set it before anything constructs the handlers**, the rule M15's projects-root fence records.

- [ ] **Step 2: Write the three failing checks**

```js
// 172. The panel renders REAL items from the adapter, under BOTH group labels.
// The group clause is what separates this from a check a flat list would pass:
// the whole surface widening is that the panel says which pile an item is in.
{
  await open(wc, 'github')
  const seen = await wc.executeJavaScript(`(() => {
    const node = document.querySelector('[data-panel-kind="work"][data-work-provider="github"]')
    if (!node) return null
    return {
      labels: [...node.querySelectorAll('.work-node__group-label')].map((el) => el.textContent),
      ids: [...node.querySelectorAll('.work-node__item strong')].map((el) => el.textContent)
    }
  })()`)
  ok('172 a github work panel renders both groups and their real items',
    seen !== null && seen.labels.length === 2 &&
      seen.labels[0] === 'Assigned to you' && seen.labels[1] === 'Awaiting your review' &&
      seen.ids.some((text) => text.includes('acme/web#1')),
    JSON.stringify(seen))
}

// 173. Check 103's argument applied to a SIXTH kind. The panel holds no
// PanelSession, and the .xterm count is unchanged FROM BEFORE the node existed
// — the second clause is what rejects an implementation that quietly demoted
// some other panel to pay for this one, which "no xterm" alone is satisfied by.
{
  const after = await wc.executeJavaScript(`({
    sessions: Object.keys(window.__m4aSessions()),
    xterms: document.querySelectorAll('.xterm').length
  })`)
  ok('173 a work panel holds no session and costs no WebGL context',
    !after.sessions.includes(workId) && after.xterms === xtermsBefore,
    `xterms ${xtermsBefore} -> ${after.xterms}`)
}

// 174. Closing it sends NO pty.kill for its id — asserted against a SHADOWED
// recorder, never by absence of a crash, because a kill aimed at an id naming
// no session is swallowed at every layer below the IPC door. The positive half
// is in the SAME window: a real terminal panel closed here IS recorded, or the
// negative proves only that the probe was dead. This block spawns that terminal
// itself rather than borrowing one, the fixture lesson check 165 records.
{
  const termId = await spawnTerminal(wc)
  await closePanel(wc, workId)
  await closePanel(wc, termId)
  const kills = await wc.executeJavaScript('window.__m24Kills')
  ok('174 closing a work panel kills nothing, while a real terminal close is recorded',
    !kills.includes(workId) && kills.includes(termId),
    `kills=${JSON.stringify(kills)}`)
}
```

Reuse the existing `spawnTerminal`/`closePanel` helpers and the `PtyManager.kill` shadow the M9b/M16/M21 blocks already install; bind it to `window.__m24Kills` if a distinct recorder is clearer than reusing theirs.

- [ ] **Step 3: Run and watch them fail, then pass**

Run: `npm run verify:panels`
Expected: FAIL first (no work panel mints), then 193/193 after Tasks 5–11 are all in. This suite takes 3–4 minutes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(m24): the work panel end to end, holding no session"
```

---

## Phase 5 — Documentation and the hand-check

### Task 13: Record what changed and what is unproven

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/ideas-backlog.md`
- Test: `npm run verify:meta`

- [ ] **Step 1: Update the verify table in `CLAUDE.md`**

Rename the `verify:jira` row to `verify:work`, restate its count (11), and name the checks worth knowing by number — 9 above all, with the reason (GitHub reports two different failures as 403). Add the new check numbers to the `verify:layout` (150–154), `verify:viewport` (93–94), `verify:rail` (110–112), `verify:palette` (85–86) and `verify:panels` (172–174) rows.

- [ ] **Step 2: Update the channel arithmetic**

The `verify:ipc` row states the running sum. Add: M24 renamed `jira:list` to `work:list` and added none, so the count stays 45 — and say why, because the temptation to add a channel per provider is exactly what this milestone declined.

- [ ] **Step 3: Update the two load-bearing entries**

The `isTerminalPanel` entry names `isJiraPanel`; it now names `isWorkPanel`, with the arity unchanged. The id-prefix entry gains `w` and records that legacy `j` ids must stay in the class forever, because a persisted `j4` the seed cannot see hands out a duplicate id.

- [ ] **Step 4: Add the new load-bearing entry**

Write the "one panel kind, two providers" entry: why the result is grouped rather than the item tagged, why the 403 split exists, and why a panel cannot switch provider.

- [ ] **Step 5: Update `docs/ideas-backlog.md` #9**

Record that GitHub is the second tier-2 implementation, that the surface has been derived and what it turned out to be (`WorkItem` unchanged; the result grouped), and that tier 1, tier 3 and tier 4 remain open. **#9 does not get ticked off** — this is one slice.

- [ ] **Step 6: Run the full chain**

Run: `npm run verify`
Expected: green end to end.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs(m24): record the work surface, the 403 split and what stays unproven"
```

- [ ] **Step 8: The hand-check (a human, not an agent)**

No suite reaches GitHub. A person must connect a real PAT through the palette and record, in this plan's commit message or a follow-up doc:

1. The `github` credential's label changed from `GitHub` to the account's own login — a value nothing local can derive from the token string, so it is the only evidence the request actually left the machine.
2. A work panel listed an issue whose `owner/repo#123` and title match github.com.
3. Both groups populated independently.

State plainly what it does **not** prove: rejected-token behaviour, the rate-limit split, enterprise tenants, or that `advanced_search=true` will still be the contract in a month.
