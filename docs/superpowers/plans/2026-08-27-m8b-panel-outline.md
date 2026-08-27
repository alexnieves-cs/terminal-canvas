# M8b — The Panel Outline Rail: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the shell's left rail with one row per panel — an agent-state dot, the honest title, and a status tail — that navigates without waking, wakes only through an explicit control, and closes through the verb that already exists.

**Architecture:** A pure module (`renderer/shell/rail-rows.ts`) turns `Panel[]` plus a status lookup plus the dormant set into `RailRow[]`, and reduces that array to a **signature string** of only the fields a row renders. `Canvas.tsx` rebuilds the rows every render (cheap) and freezes their array identity on that signature, so the 60Hz `panels` churn of a drag re-renders nothing. `SideRail` and each `RailPanelRow` are `memo`'d; each row subscribes `useAgentState(id)` individually so a bell on `n3` re-renders one row. The rail reaches the app only through the shared actions object, which gains two required members.

**Tech Stack:** TypeScript, React 18 (no StrictMode), Electron, esbuild (verify bundles), plain-node assertion suites.

**Spec:** `docs/superpowers/specs/2026-08-27-m8-app-shell-design.md` — the **M8b — The panel outline** section, plus **Three rules the shell must obey**, which every task below is bound by.

## One deliberate departure from the spec

The spec's M8b section says the row memo is keyed on "a signature of only the
fields a row renders (`id`, `title`)". This plan widens that parenthetical to
**`id`, `label`, `tail`, `dormant`** — every field of the rendered row — and a
reviewer should not narrow it back.

The spec's two-field list predates its own status tail: a panel going from
`starting` to `running` changes only `tail`, and under an `(id, title)`
signature the frozen array would never rebuild, so a rail row would read
`starting…` for the rest of the run beside a panel that had been live for
hours. Nothing would throw. Taking the signature over the ROWS rather than a
hand-picked subset of their inputs is what removes the whole class: the list
cannot fall behind the fields, because it *is* the fields. `verify:rail` 12
pins the case the spec's version would have missed.

Agent state is the one thing genuinely excluded, and by design rather than by
omission — see `railSignature`'s own comment in Task 1.

## Global Constraints

Copied from the spec and `CLAUDE.md`. Every task's requirements implicitly include these.

- **Rule 1 — the shell never owns canvas state.** A rail row calls `goToPanel(id)` (frame, select, raise) and **never** `onSelectPanel`, which clears the dormant id and calls `registry.wake`. Waking is reachable only through the explicit start control.
- **Rule 2 — the shell is not a keyboard owner.** Every new control mounts `shellControl()` from `src/renderer/shell/shell-control.ts`, whose `onMouseDown` calls `preventDefault()` so DOM focus never leaves xterm's hidden textarea. No blur-back. No new element swallows a bare key. Nothing clears `focusedId`.
- **Rule 3 — everything new is a descendant of `.shell`**, so the palette's outside-click capture listener on the `.shell` root still covers it.
- **The honest chain is `title ?? status.command ?? spec.command ?? 'login shell'`**, exactly as `src/renderer/components/TerminalPanel.tsx:158-161` walks it. The resolved command is read off `PanelStatus` and is **never** written back into `PanelSpec`.
- **The two new verbs emit no palette `Command` rows.** They are required members of `PaletteActions` and nothing more. (Spec amendment, commit `50bcb5a`.)
- **No drag-to-reorder.** Rows render in `panels` array order.
- **`registry.dispose` gains no new call site.** `closePanel` routes into the existing `onClosePanel`; `pty.kill`'s two-caller count inside `session-registry.ts` is untouched.
- **Comments explain *why*.** Match the surrounding density; a non-obvious line with no reason attached will be "fixed" by someone later.
- **`npm run verify` must be green** before any task claims done. `tsconfig.*.json` set `noUnusedLocals`/`noUnusedParameters` — prefix intentionally-unused params with `_`.

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/shell/rail-rows.ts` **(new)** | Pure: the honest chain, the status tail, `buildRailRows`, `railSignature`. No React, no DOM, no `@shared` value imports. |
| `scripts/rail-entry.cjs` **(new)** | esbuild entry re-exporting `rail-rows.ts` for the plain-node bundle. |
| `scripts/verify-rail.cjs` **(new)** | The `verify:rail` suite. Where M8c's inspector rows and M8d's workspace/attention rows will also land. |
| `src/renderer/shell/RailPanelRow.tsx` **(new)** | One row. `memo`'d; owns the per-id `useAgentState` subscription. |
| `src/renderer/shell/SideRail.tsx` | Gains the Panels list. Becomes `memo`'d. |
| `src/renderer/palette/commands.ts` | `PaletteActions` gains `closePanel` and `startPanel`. |
| `src/renderer/canvas/Canvas.tsx` | Builds the rows, freezes them on the signature, wires the two new actions, passes props to `SideRail`. |
| `src/renderer/styles.css` | `.rail-list`, `.rail-row` and its parts; the collapsed-rail rule. |
| `package.json` | `verify:rail` script + its slot in the `verify` chain. |
| `scripts/verify-panels.cjs` | Checks 81–86. |
| `CLAUDE.md`, `README.md` | The new suite row, the load-bearing entries, the milestone row. |

---

### Task 1: `rail-rows.ts` and the `verify:rail` suite

**Files:**
- Create: `src/renderer/shell/rail-rows.ts`
- Create: `scripts/rail-entry.cjs`
- Create: `scripts/verify-rail.cjs`
- Modify: `package.json` (scripts block)

**Interfaces:**
- Consumes: `Panel` from `@renderer/panels/panels`; `PanelStatus` from `@renderer/session/panel-session`. Both are type-only imports, so esbuild erases them and the bundle needs no alias for them — but the alias is configured anyway, pre-emptively, for the reason `CLAUDE.md` records about `verify-palette.cjs`.
- Produces: `RailRow` (`{ id: string; label: string; tail: string; dormant: boolean }`), `railLabel(panel, status)`, `railTail(status, dormant)`, `buildRailRows(panels, statusOf, dormantIds)`, `railSignature(rows)`. Tasks 2–4 consume all five.

- [ ] **Step 1: Write the failing suite**

Create `scripts/rail-entry.cjs`:

```js
/* Bundle entry for the shell's pure row modules. No React, no DOM, no native
   dependencies, so the suite runs under plain node — the cheapest tier this
   repo has. M8c's inspector rows and M8d's workspace and attention rows are
   expected to join this entry rather than get suites of their own. */
module.exports = {
  ...require('../src/renderer/shell/rail-rows')
}
```

Create `scripts/verify-rail.cjs`:

```js
/* Verifies the shell's pure row construction.
   Run with: npm run verify:rail

   Plain node, like verify:viewport and verify:palette: rail-rows.ts imports
   nothing from electron or node-pty and never touches the DOM, so the rail's
   two most easily-wrong pieces — the honest chain and the 60Hz signature —
   sit in the fastest tier rather than needing a real Electron window. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'out', 'verify', 'rail.cjs')
buildSync({
  entryPoints: [join(__dirname, 'rail-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Nothing in this bundle imports a VALUE from @shared or @renderer today —
  // rail-rows.ts's two imports are `import type`, which esbuild erases. The
  // aliases are here pre-emptively for the reason CLAUDE.md records about
  // verify-palette.cjs: needing no alias YET is exactly the state
  // verify-viewport.cjs was in right up until the day it broke.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const R = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

// A panel as panels.ts builds one, trimmed to the fields rail-rows reads.
// `rect` is carried in full BECAUSE it is what check 10 moves: a signature
// that ignored rects by construction would make that check vacuous.
const panel = (id, over = {}) => ({
  rect: { id, x: 0, y: 0, w: 720, h: 460 },
  z: 1,
  spec: { cwd: '~', args: [] },
  ...over
})
const running = (pid, command) => ({ kind: 'running', pid, command, cwd: '~', reattached: false })
const NONE = new Set()
const statuses = (map) => (id) => map[id]

/* ---- The honest chain ---- */

// 1. A user's own title outranks every other link. It is the only one of the
//    four the user chose, so nothing resolved may override it.
ok('1 an explicit title wins over a resolved command',
  R.railLabel(panel('n1', { title: 'auth refactor' }), running(48213, '/bin/zsh')) === 'auth refactor')

// 2. The link that took two milestones to connect. pty:create has returned the
//    RESOLVED command since M4, and for a login-shell panel — spec.command
//    absent, because only main can name the user's shell — it is the only
//    honest label that exists anywhere in the renderer.
ok('2 no title, running: the RESOLVED command, not the spec\'s',
  R.railLabel(panel('n1'), running(48213, '/bin/zsh')) === '/bin/zsh')

// 3. Pre-spawn fallback: a dormant or never-started panel has no resolved
//    command, and the spec's is the best thing left.
ok('3 not running: the spec command',
  R.railLabel(panel('n1', { spec: { cwd: '~', command: '/usr/bin/claude', args: [] } }),
    { kind: 'idle' }) === '/usr/bin/claude')

// 4. The end of the chain. An absent spec.command MEANS "the user's login
//    shell" (M5a's absent-command rule); rendering an empty string here would
//    read as a broken row rather than as a shell.
ok('4 nothing at all: "login shell"',
  R.railLabel(panel('n1'), { kind: 'idle' }) === 'login shell')

/* ---- The status tail ---- */

ok('5 running reads its pid', R.railTail(running(48213, '/bin/zsh'), false) === 'pid 48213')

// 6. Dormant OUTRANKS the status kind. A dormant panel's status is
//    {kind:'idle'}, and "not started" is true but useless — "dormant" is the
//    word the panel's own card uses, and it is what tells the user the start
//    control on this row exists at all.
ok('6 dormant outranks the status kind',
  R.railTail({ kind: 'idle' }, true) === 'dormant')

// 7. THE FALSY TRAP. A successful exit is code 0, and `code || ''` or a
//    ternary on `code` would silently print the wrong tail for the single most
//    common exit there is. Nothing else in this repo can catch it.
ok('7 exit code 0 renders as a number, not as absence',
  R.railTail({ kind: 'exited', code: 0 }, false) === 'exited 0')

ok('8 a non-zero exit renders its code',
  R.railTail({ kind: 'exited', code: 1 }, false) === 'exited 1')

// 9. `starting` is a real state main SENDS directly at spawn (see CLAUDE.md's
//    "`starting` is sent directly"), and a real claude takes seconds to boot —
//    that silence is exactly when the rail should say something is happening.
ok('9 starting says so', R.railTail({ kind: 'starting' }, false) === 'starting…')

/* ---- The signature: the 60Hz defence ---- */

// 10. THE CHECK THIS MODULE EXISTS FOR. `panels` is a fresh array on every
//     setPanelRect — every frame of a drag — and the rail cannot use the
//     palette's escape hatch (key the memo on `open`, read panelsRef) because
//     it is never closed. A rect move must leave the signature BYTE-identical,
//     which is what lets Canvas freeze the rows array on it.
{
  const before = [panel('n1', { title: 'a' }), panel('n2')]
  const after = [
    panel('n1', { title: 'a', rect: { id: 'n1', x: 900, y: -400, w: 720, h: 460 } }),
    panel('n2', { rect: { id: 'n2', x: 12, y: 34, w: 300, h: 200 } })
  ]
  const map = statuses({ n1: running(1, '/bin/zsh'), n2: running(2, '/bin/sh') })
  ok('10 moving every rect leaves the signature byte-identical',
    R.railSignature(R.buildRailRows(before, map, NONE)) ===
    R.railSignature(R.buildRailRows(after, map, NONE)))
}

// 11-13. The other direction: the signature must MOVE for everything a row
//        actually renders, or a frozen array would show stale text forever —
//        the failure being silent, because the rail would simply be wrong.
{
  const map = statuses({ n1: running(1, '/bin/zsh') })
  const base = R.railSignature(R.buildRailRows([panel('n1')], map, NONE))
  ok('11 a title change moves the signature',
    R.railSignature(R.buildRailRows([panel('n1', { title: 'renamed' })], map, NONE)) !== base)
  ok('12 a status change moves the signature',
    R.railSignature(R.buildRailRows([panel('n1')],
      statuses({ n1: { kind: 'exited', code: 3 } }), NONE)) !== base)
  ok('13 waking a dormant panel moves the signature',
    R.railSignature(R.buildRailRows([panel('n1')], map, new Set(['n1']))) !== base)
}

// 14. FIELD SEPARATION. A label is USER TEXT. Under the obvious
//     implementation — `id + '|' + label + '|' + tail` — a title containing
//     the separator forges a field boundary, two genuinely different lists
//     produce one string, and the rail freezes on the wrong rows: for the
//     users whose titles happen to contain that character, and nobody else.
//     This is the check that makes JSON.stringify the answer rather than a
//     chosen separator, and it must keep failing against any implementation
//     that goes back to concatenating with one.
{
  const a = R.buildRailRows([panel('n1', { title: 'x|y' }), panel('n2', { title: 'z' })],
    statuses({}), NONE)
  const b = R.buildRailRows([panel('n1', { title: 'x' }), panel('n2', { title: 'y|z' })],
    statuses({}), NONE)
  ok('14 a title cannot forge a field boundary', R.railSignature(a) !== R.railSignature(b))
}

// 15. Array order is preserved and there is exactly one row per panel. Order
//     is `panels` order deliberately — NOT Panel.z. Sorting the rendered list
//     by z would move DOM nodes on every raise, and a move is
//     remove-then-insert; the rail holds no live terminal, but the rule is the
//     one panels.ts states and there is no reason for the two lists to
//     disagree about what order means.
{
  const rows = R.buildRailRows([panel('n3'), panel('n1'), panel('n2')], statuses({}), NONE)
  ok('15 one row per panel, in array order',
    rows.length === 3 && rows.map((r) => r.id).join(',') === 'n3,n1,n2')
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
```

Add to `package.json`'s `scripts`, immediately after the `verify:palette` line:

```json
    "verify:rail": "node scripts/verify-rail.cjs",
```

and insert it into the `verify` chain right after `npm run verify:palette &&`:

```
npm run verify:palette && npm run verify:rail && npm run verify:tmux && ...
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run verify:rail`
Expected: FAIL — esbuild cannot resolve `../src/renderer/shell/rail-rows`. That is the correct first failure: the module does not exist yet.

- [ ] **Step 3: Write `src/renderer/shell/rail-rows.ts`**

```ts
import type { Panel } from '@renderer/panels/panels'
import type { PanelStatus } from '@renderer/session/panel-session'

/**
 * What the rail's Panels section renders, as plain data.
 *
 * Pure by construction — no React, no DOM, no registry reference — for the
 * same reason palette/commands.ts is: it puts the two pieces of this milestone
 * most able to be subtly wrong (the honest chain and the signature) in the
 * cheapest verify tier the repo has, and it means the rail's row logic can be
 * asserted without mounting anything.
 */

export interface RailRow {
  id: string
  /** The honest chain's answer. See railLabel. */
  label: string
  /** `pid 48213` / `dormant` / `exited 1` / `starting…`. See railTail. */
  tail: string
  /** Drives the start control, which is the ONLY way the rail wakes a panel. */
  dormant: boolean
}

/**
 * The same four links TerminalPanel's header walks, most specific first.
 *
 * The second link is the one that matters and the one that is easy to drop:
 * `status.command` is what main ACTUALLY spawned, and for a login-shell panel
 * `spec.command` is ABSENT — only main can name the user's shell — so without
 * it every default panel in the rail would read "login shell" while the panel's
 * own header reads `/bin/zsh`. Two labels for one panel, differing only in the
 * common case.
 *
 * The resolved command is deliberately NOT copied back into PanelSpec. Doing so
 * would make this a fifth place M5a's absent-command rule can be lost, and
 * every command-less preset would start spawning a hardcoded shell.
 */
export function railLabel(panel: Panel, status: PanelStatus | undefined): string {
  return panel.title
    ?? (status?.kind === 'running' ? status.command : undefined)
    ?? panel.spec.command
    ?? 'login shell'
}

/**
 * The row's right-hand tail.
 *
 * `dormant` is tested FIRST and outranks the status kind. A dormant panel's
 * status is {kind:'idle'}, so a status-first implementation would render
 * "not started" — true, and useless: "dormant" is the word the panel's own card
 * uses, and it is what tells the user the start control on this row exists.
 *
 * The exited case is a template rather than a truthiness test on purpose.
 * `code` is 0 for a successful exit, the single most common exit there is, and
 * `code || ...` would print the wrong tail for exactly it.
 */
export function railTail(status: PanelStatus | undefined, dormant: boolean): string {
  if (dormant) return 'dormant'
  if (status === undefined) return 'not started'
  switch (status.kind) {
    case 'running': return `pid ${status.pid}`
    case 'starting': return 'starting…'
    case 'exited': return `exited ${status.code}`
    case 'error': return status.message
    case 'idle': return 'not started'
  }
}

/**
 * Array order, never Panel.z. Stacking is z and the array's order is
 * deliberately not (panels.ts says why); there is no reason for the rail to
 * invent a second answer to what order means, and sorting here would also make
 * every raise reorder a keyed list.
 *
 * The object literal's KEY ORDER is load-bearing, because railSignature below
 * serialises these rows: JSON.stringify preserves insertion order, so building
 * a row's fields in a different order in a later edit would change every
 * signature at once. Harmless in itself — the rows rebuild — but it means this
 * literal is not free to be reshuffled for tidiness.
 */
export function buildRailRows(
  panels: readonly Panel[],
  statusOf: (id: string) => PanelStatus | undefined,
  dormantIds: ReadonlySet<string>
): RailRow[] {
  return panels.map((panel) => {
    const id = panel.rect.id
    const status = statusOf(id)
    const dormant = dormantIds.has(id)
    return { id, label: railLabel(panel, status), tail: railTail(status, dormant), dormant }
  })
}

/**
 * The whole reason this module is not just a `.map()` in Canvas.tsx.
 *
 * `panels` is a fresh array on every setPanelRect — i.e. every frame of a drag
 * — and the palette's escape hatch for exactly this (key the memo on
 * `palette.open`, read out of panelsRef) is unavailable to the rail, which is
 * never closed. So Canvas rebuilds the rows every render and freezes their
 * ARRAY IDENTITY on this string: a drag moves rects, the signature is
 * byte-identical, and memo'd SideRail/RailPanelRow re-render nothing.
 *
 * It is JSON.stringify over the ROWS rather than a hand-rolled concatenation
 * of their inputs, and both halves of that matter. Over the rows, so "the
 * signature covers exactly what a row renders" is structurally true rather
 * than dependent on someone remembering to add a field. And JSON rather than
 * `a + '|' + b`, because a label is USER TEXT: with an ordinary separator a
 * title containing it could forge a field boundary and make two genuinely
 * different lists produce one string, freezing the rail on stale rows for the
 * users whose titles happen to contain that character and nobody else. JSON
 * escapes quotes and needs no separator to be chosen at all.
 *
 * Agent state is deliberately absent from RailRow and therefore from this
 * signature: each row subscribes useAgentState(id) individually, so a bell on
 * n3 re-renders one row rather than moving a signature that rebuilds the list.
 */
export function railSignature(rows: readonly RailRow[]): string {
  return JSON.stringify(rows)
}
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npm run verify:rail`
Expected: `15/15 passed`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shell/rail-rows.ts scripts/rail-entry.cjs scripts/verify-rail.cjs package.json
git commit -m "test(m8b): the rail's row construction, and the signature that freezes it

The rail is always open, so the palette's escape hatch for the 60Hz panels
churn — key the memo on palette.open and read panelsRef — is unavailable to
it. railSignature is the structural replacement, and it is taken over the
ROWS rather than their inputs so that 'it covers what a row renders' is true
by construction rather than by anyone remembering to add a field.

Check 7 is the one worth knowing by number: a successful exit is code 0, and
a truthiness test on it prints the wrong tail for the most common exit there
is. Check 14 pins that a user's own title cannot forge a field boundary and
freeze the rail on stale rows, which is why the signature is JSON rather than
a concatenation with a separator a label is free to contain.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The rail renders its rows

**Files:**
- Create: `src/renderer/shell/RailPanelRow.tsx`
- Modify: `src/renderer/shell/SideRail.tsx` (whole file)
- Modify: `src/renderer/palette/commands.ts` (the `PaletteActions` interface, after `deleteWorkspace`)
- Modify: `src/renderer/canvas/Canvas.tsx` (imports; the `paletteActions` memo; a new derivation near `panelRows`; the `<SideRail/>` element)
- Modify: `src/renderer/styles.css` (after the `.shell__region-title` block)
- Test: `scripts/verify-panels.cjs` (checks 81, 82)

**Interfaces:**
- Consumes: `RailRow`, `buildRailRows`, `railSignature` from Task 1; `shellControl` from `src/renderer/shell/shell-control.ts`; `useAgentState` from `@renderer/session/agent-state-store`.
- Produces: `PaletteActions.closePanel(id: string): void` and `PaletteActions.startPanel(id: string): void`; and the DOM contract Tasks 3–4 assert against — `li.rail-row[data-rail-row="<panelId>"]` containing `button.rail-row__main`, `span.rail-row__dot[data-agent-state]`, `span.rail-row__label`, `span.rail-row__tail`, an optional `button.rail-row__start`, and `button.rail-row__close`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, immediately after check 80's closing block and before the `} catch (error) {`:

```js
    /* ---- M8b: the panel outline rail ---- */

    // World state inherited from 80: the RAIL IS OPEN (79 reopened it), the
    // inspector is collapsed, two live panels, palette closed. The rail being
    // open is a precondition for everything below — a collapsed rail hides the
    // list — so it is asserted rather than assumed.

    // 81. A ROW PER PANEL, WITH THE HONEST LABEL AND A REAL PID.
    //     The pid half is what makes this more than a count: a row rendering
    //     the panel id, or a hardcoded stand-in, would satisfy "there are N
    //     rows" while telling the user nothing main actually resolved. And a
    //     label of '' — the shape a dropped honest chain produces — is checked
    //     explicitly, because an empty row is indistinguishable from a styling
    //     bug at a glance.
    {
      const railOpen = await wc.executeJavaScript(
        `!document.querySelector('.shell').classList.contains('shell--rail-collapsed')`)
      const rows = await wc.executeJavaScript(`
        [...document.querySelectorAll('.rail-row')].map((r) => ({
          id: r.getAttribute('data-rail-row'),
          label: r.querySelector('.rail-row__label').textContent,
          tail: r.querySelector('.rail-row__tail').textContent
        }))`)
      const panelIdsNow = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      const sameSet = rows.length === panelIdsNow.length &&
        panelIdsNow.every((id) => rows.some((r) => r.id === id))
      const labelled = rows.every((r) => typeof r.label === 'string' && r.label.length > 0)
      const pidTail = rows.every((r) => /^pid \d+$/.test(r.tail))
      ok('81 the rail renders one labelled row per panel, with a real pid',
        railOpen === true && sameSet && labelled && pidTail,
        `railOpen=${railOpen} rows=${JSON.stringify(rows)} panels=${JSON.stringify(panelIdsNow)}`)
    }

    // 82. ONE TITLE SOURCE, NOT TWO. A rename typed into the palette has to
    //     reach the rail row, because the rail reads Panel.title through the
    //     same honest chain the header does. The failure this catches is a rail
    //     that snapshotted its labels once and froze — a LIVE hazard here and
    //     nowhere else, since railRows is deliberately frozen on a signature:
    //     get that signature's fields wrong and the rows never rebuild, with
    //     nothing throwing and the panel's own header still correct beside a
    //     stale row.
    //
    //     Spawns its own panel with Cmd+N rather than renaming one of 81's,
    //     because the rename row targets `capturedId` — focusedId as it was
    //     when the palette opened — and a Cmd+N spawn is the one gesture in
    //     this harness that reliably leaves the new panel focused. Check 86
    //     closes this panel again through the rail's own close control.
    let renamedId = null
    {
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      await zoomTo(wc, 'n')
      const idsAfter = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 4000)
      renamedId = idsAfter ? idsAfter.find((id) => !idsBefore.has(id)) : null
      if (!renamedId) throw new Error('82: Cmd+N produced no new panel')

      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await waitUntil(() => wc.executeJavaScript(
        `document.querySelector('.palette__input') !== null`), 2000)
      const ran = await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set
          setter.call(input, v)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        nativeSet(document.querySelector('.palette__input'), 'rename panel')
        await new Promise((r) => setTimeout(r, 50))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Rename panel'))
        if (!row) return 'no rename-panel row'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 100))
        const field = document.querySelector('.palette__input')
        if (!field) return 'no input after entering rename mode'
        nativeSet(field, 'outline probe')
        await new Promise((r) => setTimeout(r, 50))
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        return 'ok'
      })()`)
      const rowLabel = () => wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row=${JSON.stringify(renamedId)}]')
        return row ? row.querySelector('.rail-row__label').textContent : null
      })()`)
      const landed = ran === 'ok' &&
        Boolean(await waitUntil(async () => (await rowLabel()) === 'outline probe', 3000))
      ok('82 a rename typed into the palette reaches the rail row',
        landed, `ran=${ran} id=${renamedId} label=${await rowLabel()}`)
      // What 82 LEAVES BEHIND: a THIRD panel, titled "outline probe", focused
      // and selected; the palette is closed. Check 86 closes it again.
    }
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: 81 FAILs with `rows=[]` (no `.rail-row` elements exist), and 82 FAILs with `label=null`.

- [ ] **Step 3: Add the two verbs to the actions interface**

In `src/renderer/palette/commands.ts`, inside `export interface PaletteActions`, after the `deleteWorkspace(...)` member:

```ts
  /**
   * The rail's close control. NOT a new dispose call site: it is the same
   * onClosePanel the panel's own × already uses, reached through this object
   * because the shell reaches the app only through it (spec rule 1). A rail
   * that closed over registry.dispose directly would be a second
   * implementation of a verb that already has an authority, and pty.kill's
   * two-caller count inside session-registry.ts would stop being re-derivable
   * from one place.
   *
   * Deliberately emits no Command row: closing already has a gesture on every
   * panel, and M6p sized the resting list on purpose.
   */
  closePanel(id: string): void
  /**
   * The rail's start control, rendered on a dormant row only. This is
   * onSelectPanel — the path that clears the dormant id and calls
   * registry.wake — and it is deliberately NOT what a row CLICK does.
   * goToPanel navigates without waking (rule 1), so the wake stays a separate,
   * visible affordance rather than a side effect of browsing a list: on a
   * restored twelve-panel canvas, a list whose rows wake is twelve agent CLIs
   * launched by scrolling it.
   *
   * Emits no Command row either — waking already has a gesture: clicking the
   * card that says "click to start".
   */
  startPanel(id: string): void
```

- [ ] **Step 4: Write `src/renderer/shell/RailPanelRow.tsx`**

```tsx
import { memo, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import type { RailRow } from './rail-rows'
import { shellControl } from './shell-control'

export interface RailPanelRowProps {
  row: RailRow
  selected: boolean
  onGoTo: (id: string) => void
  onStart: (id: string) => void
  onClose: (id: string) => void
}

/**
 * One row of the panel outline.
 *
 * It is a `memo` component AND it owns its own useAgentState subscription, and
 * the pairing is the point. agent-state-store.ts subscribes PER PANEL ID
 * precisely so a change for n3 notifies only whatever asked about n3; if this
 * list subscribed once and passed each state down, a bell on any panel would
 * re-render every row — the fan-out that module exists to refuse, arriving
 * through a door it could not see. With the subscription here, a bell
 * re-renders exactly one row, and the memo blocks everything else Canvas's
 * 60Hz render churn would otherwise push through.
 *
 * Three sibling controls rather than one clickable row with buttons inside it:
 * nested interactive elements are invalid HTML and give the browser no
 * defensible answer about which one a click meant.
 */
function RailPanelRowImpl({
  row, selected, onGoTo, onStart, onClose
}: RailPanelRowProps): JSX.Element {
  const state = useAgentState(row.id)
  return (
    <li
      className={`rail-row${selected ? ' rail-row--selected' : ''}`}
      data-rail-row={row.id}
    >
      {/*
        goToPanel — frame, select, raise — and NEVER onSelectPanel. Waking
        hangs off select, so reusing it here would spawn an agent as a side
        effect of clicking a list entry (spec rule 1). The start control below
        is the only thing in this row that wakes anything.
      */}
      <button
        type="button"
        className="rail-row__main"
        title={`Go to ${row.label}`}
        {...shellControl(() => onGoTo(row.id))}
      >
        {/*
          The attribute, not only a class: a class is a styling decision a
          restyle may rename, while data-agent-state is this row's stated
          answer to "what is that agent doing" — the same split check 54
          already draws for the panel itself.
        */}
        <span
          className="rail-row__dot"
          data-agent-state={state ?? 'none'}
          aria-hidden="true"
        />
        <span className="rail-row__label">{row.label}</span>
        <span className="rail-row__tail">{row.tail}</span>
      </button>
      {row.dormant && (
        <button
          type="button"
          className="rail-row__start"
          title={`Start ${row.label}`}
          aria-label={`Start ${row.label}`}
          {...shellControl(() => onStart(row.id))}
        >
          &#9654;
        </button>
      )}
      <button
        type="button"
        className="rail-row__close"
        title={`Close ${row.label}`}
        aria-label={`Close ${row.label}`}
        {...shellControl(() => onClose(row.id))}
      >
        &times;
      </button>
    </li>
  )
}

export const RailPanelRow = memo(RailPanelRowImpl)
```

- [ ] **Step 5: Rewrite `src/renderer/shell/SideRail.tsx`**

```tsx
import { memo, type JSX } from 'react'
import type { RailRow } from './rail-rows'
import { RailPanelRow } from './RailPanelRow'
import { shellControl } from './shell-control'

export interface SideRailProps {
  onToggle: () => void
  rows: RailRow[]
  selectedId: string | null
  onGoToPanel: (id: string) => void
  onStartPanel: (id: string) => void
  onClosePanel: (id: string) => void
}

/**
 * The left rail. M8b fills it with the panel outline; M8d adds the Workspaces
 * and Attention sections around it.
 *
 * Presentational by construction — every prop is derived data or a
 * PaletteActions member. A rail that reached into Canvas for its own copy of a
 * verb would be a second implementation of it; see the spec's "The shell is a
 * second view over one verb surface".
 *
 * memo'd, and `rows` is frozen on a signature by Canvas. Canvas re-renders on
 * every mousemove over the canvas (setCursor) and on every frame of a drag
 * (setPanelRect); without both halves the whole list would be rebuilt at 60Hz
 * for rect changes no row displays.
 *
 * The toggle stays mounted when the rail is collapsed — the collapsed strip is
 * 22px of button and nothing else, because it is the only way back for a user
 * who does not know the chord.
 */
function SideRailImpl({
  onToggle, rows, selectedId, onGoToPanel, onStartPanel, onClosePanel
}: SideRailProps): JSX.Element {
  return (
    <aside className="shell__rail" aria-label="Side rail">
      <button
        type="button"
        className="shell__rail-toggle"
        title="Hide the side rail (⌘\)"
        aria-label="Hide the side rail"
        {...shellControl(onToggle)}
      >
        ‹
      </button>
      <div className="shell__region-title">Panels</div>
      <ul className="rail-list" aria-label="Panels">
        {rows.map((row) => (
          <RailPanelRow
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            onGoTo={onGoToPanel}
            onStart={onStartPanel}
            onClose={onClosePanel}
          />
        ))}
      </ul>
    </aside>
  )
}

export const SideRail = memo(SideRailImpl)
```

- [ ] **Step 6: Wire it in `src/renderer/canvas/Canvas.tsx`**

Add beside the other shell imports (lines 37-39):

```ts
import { buildRailRows, railSignature } from '../shell/rail-rows'
```

Add the two members inside the `paletteActions` `useMemo`, after `deleteWorkspace`:

```ts
    // Not a new dispose call site — this IS onClosePanel, the one the panel's
    // own × already uses. See PaletteActions.closePanel for why it is reached
    // through this object rather than closed over directly by the rail.
    closePanel: (id) => onClosePanel(id),
    // The wake path, and deliberately not what a row CLICK does. See
    // PaletteActions.startPanel.
    startPanel: (id) => onSelectPanel(id),
```

and extend that memo's dependency array with `onClosePanel, onSelectPanel`.

Add the row derivation immediately after the `panelRows` memo (just before `hasSelection`):

```ts
  /**
   * The rail's rows, and the one defence that makes an always-open list
   * affordable.
   *
   * `panels` is a fresh array on every setPanelRect — i.e. every frame of a
   * drag. `panelRows` above escapes that by keying on `palette.open` and
   * reading panelsRef, which works only because the palette is a surface that
   * is usually closed. The rail has no such escape: it is never closed. So the
   * rows are rebuilt on EVERY render (cheap — N panels, no IO, no allocation
   * that matters) and their ARRAY IDENTITY is then frozen on a signature of
   * only the fields a row renders. A drag moves rects, the signature is
   * byte-identical, `railRows` keeps its identity, and memo'd SideRail and
   * RailPanelRow re-render nothing.
   *
   * The dep array is the SIGNATURE, not `railBuilt`, and that is the whole
   * mechanism rather than a lint workaround: when the signature is equal,
   * `railBuilt` is equal by construction, so returning the previous array is
   * not a stale read.
   *
   * The status is read straight off the registry rather than from React state,
   * the same way TerminalPanel reads it. `version` — already in this render —
   * is what makes a status change (idle -> running, with a pid) re-run this at
   * all; registry.version() bumps on tier/status/focus/exit and nothing
   * higher-frequency, which is exactly the rate the rail wants.
   */
  const railBuilt = buildRailRows(panels, (id) => registry.get(id)?.status, dormantIds)
  const railSig = railSignature(railBuilt)
  const railRows = useMemo(() => railBuilt, [railSig])
```

Replace the `<SideRail onToggle={chrome.toggleRail} />` element with:

```tsx
      <SideRail
        onToggle={chrome.toggleRail}
        rows={railRows}
        selectedId={selectedId}
        onGoToPanel={paletteActions.goToPanel}
        onStartPanel={paletteActions.startPanel}
        onClosePanel={paletteActions.closePanel}
      />
```

- [ ] **Step 7: Add the styles**

In `src/renderer/styles.css`, extend the existing collapsed-region rule so the list hides with the title. Find:

```css
.shell--rail-collapsed .shell__rail .shell__region-title,
.shell--inspector-collapsed .shell__inspector .shell__region-title {
  display: none;
}
```

and add `.shell--rail-collapsed .shell__rail .rail-list,` as the first selector in that group. Then append after the `.shell__region-title` block:

```css
/* The panel outline. Scrolls on its own rather than growing the rail: the
   canvas can hold far more panels than the rail is tall, and a rail that grew
   would push its own toggle off screen — the one control that is the way back
   from a collapse. */
.rail-list {
  list-style: none;
  margin: 0;
  padding: 0 4px;
  overflow-y: auto;
  max-height: calc(100% - 60px);
}

.rail-row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 4px;
}

.rail-row--selected { background: rgba(255, 255, 255, 0.08); }

/* The row body is a button, not the <li>: three sibling controls rather than
   nested interactive elements, which are invalid HTML and give the browser no
   defensible answer about which one a click meant. */
.rail-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.rail-row__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--border);
}

/* The same colours the panel border and the card stripe already use, so a
   glance at the rail and a glance at the canvas cannot disagree about what a
   panel is doing. `starting` and `idle` deliberately keep the neutral default:
   neither is asking for anything. */
.rail-row__dot[data-agent-state="busy"] { background: var(--blue); }
.rail-row__dot[data-agent-state="wants-you"] { background: var(--amber); }
.rail-row__dot[data-agent-state="exited"] { background: var(--red); }

/* min-width: 0 on the flex item, or a long resolved command refuses to shrink
   and pushes the tail and both controls out of the rail entirely — the same
   min-width:auto failure the .canvas grid cell's own comment records. */
.rail-row__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-row__tail {
  flex: none;
  color: var(--muted);
  font-size: 10px;
}

.rail-row__start,
.rail-row__close {
  flex: none;
  width: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}

.rail-row__start:hover,
.rail-row__close:hover { color: var(--text); }
```

- [ ] **Step 8: Run the checks to verify they pass**

Run: `npm run build && npm run verify:panels`
Expected: 81 and 82 PASS; every pre-existing check still passes.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/shell/RailPanelRow.tsx src/renderer/shell/SideRail.tsx \
  src/renderer/palette/commands.ts src/renderer/canvas/Canvas.tsx \
  src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m8b): the panel outline, frozen on a signature

The rail is never closed, so the palette's escape hatch for the 60Hz panels
churn does not apply to it. Canvas rebuilds the rows every render and freezes
their array identity on railSignature; SideRail and RailPanelRow are memo'd,
so a drag that moves every rect re-renders neither.

Each row subscribes useAgentState(id) itself rather than taking a state prop
from the list. That is the fan-out agent-state-store.ts already refuses: one
subscription for the list would re-render every row on any panel's bell.

closePanel and startPanel are required PaletteActions members with no Command
rows. Both already have a gesture; what they buy is that the rail reaches
onClosePanel and onSelectPanel through the one authority rather than closing
over registry.dispose and registry.wake itself.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: A bell reaches one row and no other

**Files:**
- Test: `scripts/verify-panels.cjs` (check 83)

**Interfaces:**
- Consumes: Task 2's DOM contract (`span.rail-row__dot[data-agent-state]`); the harness's existing `ptyManager` handle, its `BELL_LINE` constant and its `sessionMap` helper.
- Produces: nothing new. This task is verification only — if it fails, the fix belongs in Task 2's files.

- [ ] **Step 1: Confirm the three harness names this check borrows**

Run: `grep -n "BELL_LINE\|sessionMap\|ptyManager.write" scripts/verify-panels.cjs | head`

All three are used by checks 54–57. If `sessionMap` turns out to be defined inside an earlier block rather than at suite scope, hoist that one definition to suite scope in this same edit rather than duplicating it — a second copy is a second thing to keep true.

- [ ] **Step 2: Write the failing check**

Append after check 82's block:

```js
    // 83. A REAL BELL REACHES ONE ROW, AND ONLY ONE.
    //     Check 54 already proves a bell reaches the PANEL. What this adds is
    //     the half only the rail can be wrong about: every row is fed from one
    //     `rows` array, so an implementation that subscribed the LIST to agent
    //     state — rather than each row to its own id — would paint the right
    //     dot and still be the fan-out agent-state-store.ts exists to refuse.
    //     Asserting the OTHER rows did not move is the only thing that
    //     separates the two, and it is why this reads every dot rather than
    //     one.
    //
    //     The attribute, not the class: a class is a styling decision a
    //     restyle may rename, the same split check 54 draws for the panel.
    {
      const dots = () => wc.executeJavaScript(`
        Object.fromEntries([...document.querySelectorAll('.rail-row')].map((r) => [
          r.getAttribute('data-rail-row'),
          r.querySelector('.rail-row__dot').getAttribute('data-agent-state')
        ]))`)
      const before = await dots()
      // renamedId is check 82's Cmd+N spawn — a panel with a live PTY this
      // harness can write to directly.
      const target = renamedId
      const hasPty = await waitUntil(async () => (await sessionMap(wc)).has(target), 8000)
      if (!hasPty) throw new Error(`83: panel ${target} never got a PTY`)
      ptyManager.write(target, BELL_LINE)
      const rang = await waitUntil(async () => {
        const now = await dots()
        return now[target] === 'wants-you' ? now : false
      }, 6000)
      const others = rang
        ? Object.keys(rang).filter((id) => id !== target)
            .every((id) => rang[id] === before[id])
        : false
      ok('83 a real bell changes that panel\'s row dot and no other',
        rang !== false && others === true,
        `target=${target} before=${JSON.stringify(before)} after=${JSON.stringify(rang)}`)
      // What 83 LEAVES BEHIND: `renamedId` is in wants-you, in main's store and
      // on its row. Nothing below acknowledges it; check 86 closes the panel,
      // which clears the state with it.
    }
```

- [ ] **Step 3: Run it, and prove it can fail**

Run: `npm run verify:panels`
Expected: PASS against Task 2's per-row subscription.

Then prove the check discriminates rather than merely passing: temporarily change `RailPanelRow` to take `state` as a prop and have `SideRail` supply it from a single `useAttentionIds()` read, rebuild, and confirm 83 goes red on the `others` clause. Revert.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-panels.cjs
git commit -m "test(m8b): a bell moves one rail row, and the others prove it

The dot being right is the easy half and check 54 already covers the same
fact for the panel. What only the rail can get wrong is the SUBSCRIPTION
shape: one subscription for the whole list paints exactly the same dot and
re-renders every row on every panel's bell. Reading every dot and asserting
the others are unchanged is what tells the two apart.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Navigating does not wake; the start control does; the close control closes

**Files:**
- Test: `scripts/verify-panels.cjs` (checks 84, 85, 86)

**Interfaces:**
- Consumes: Task 2's DOM contract; the harness's `LAYOUT_PATH`, `layoutStore`, `flushLayoutStore()`, `readFileSync`/`writeFileSync`, `__m4aSessions`, `__m4aViewport`.
- Produces: nothing new.

- [ ] **Step 1: Confirm the seeding helpers exist at this scope**

Run: `grep -n "flushLayoutStore\|LAYOUT_PATH\|readFileSync" scripts/verify-panels.cjs | head`

All three are used by check 39's fixture seeding, which this task copies. If any is block-scoped, hoist it rather than duplicating it.

- [ ] **Step 2: Write the failing checks**

Append after check 83's block:

```js
    // 84-85. THE DORMANCY PAIR, on a fixture seeded for it.
    //     Check 39's NEVER_WOKEN_ID does not survive M7's workspace churn —
    //     check 71 deletes the last workspace and installs a fresh one — so a
    //     dormant panel has to be seeded again here. The mechanism is the one
    //     check 39's own seeding uses, and its comment explains each step:
    //     append to the on-disk layout, re-load the store (layout:load answers
    //     from the in-memory snapshot, not a fresh disk read), and reload the
    //     renderer. A panel with no live session restores dormant under EITHER
    //     backend, so this needs nothing tmux set up.
    //
    //     Parked at world (60000, 60000): far outside anything any check above
    //     frames or clicks, and distinct from check 39's (50000, 50000) so a
    //     stale fixture cannot be mistaken for this one.
    const RAIL_DORMANT_ID = 'rail-dormant'
    {
      flushLayoutStore()
      const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
      const ws = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
      const maxZ = ws.panels.reduce((m, p) => Math.max(m, p.z), 0)
      ws.panels.push({
        id: RAIL_DORMANT_ID,
        x: 60000, y: 60000, w: 720, h: 460, z: maxZ + 1,
        cwd: '~', args: ['-l']
      })
      writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
      layoutStore.load()
      const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload()
      await reloaded
      await waitUntil(async () => {
        const sessions = await wc.executeJavaScript(
          `window.__m4aSessions ? window.__m4aSessions() : []`)
        return sessions.some((s) => s.id === RAIL_DORMANT_ID) || false
      }, 4000)
    }

    // 84. CLICKING A ROW FRAMES ITS PANEL AND DOES NOT START IT.
    //     Rule 1 of the spec, and the one failure a screenshot cannot show: a
    //     row wired to onSelectPanel instead of goToPanel frames the panel just
    //     as correctly and ALSO clears the dormant id and calls registry.wake.
    //     On a restored twelve-panel canvas that is twelve agent CLIs launched
    //     by browsing a list. Both assertions are required: the camera clause
    //     alone passes against the wake, and the no-spawn clause alone passes
    //     against a row wired to nothing at all.
    {
      const rowState = () => wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}]')
        return row ? {
          tail: row.querySelector('.rail-row__tail').textContent,
          hasStart: row.querySelector('.rail-row__start') !== null
        } : null
      })()`)
      const seeded = await waitUntil(async () => {
        const s = await rowState()
        return s && s.tail === 'dormant' ? s : false
      }, 4000)
      const before = await wc.executeJavaScript(`window.__m4aViewport()`)
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}] .rail-row__main')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await sleep(400)
      const after = await wc.executeJavaScript(`window.__m4aViewport()`)
      const sessions = await wc.executeJavaScript(`window.__m4aSessions()`)
      const still = sessions.find((s) => s.id === RAIL_DORMANT_ID)
      ok('84 a rail row frames its panel and leaves a dormant one dormant',
        seeded !== false && seeded.hasStart === true &&
          (after.x !== before.x || after.y !== before.y) &&
          still !== undefined && still.dormant === true && still.spawned === false,
        `seeded=${JSON.stringify(seeded)} camera ${JSON.stringify(before)} -> ` +
          `${JSON.stringify(after)} session=${JSON.stringify(still)}`)
    }

    // 85. THE START CONTROL IS THE ONLY THING THAT WAKES.
    //     The other half of 84, and it has to be asserted or "never wakes"
    //     would be satisfied just as well by a rail that CANNOT wake — a
    //     dormant panel reachable from the rail but unstartable from it, with
    //     the arrow rendered and inert.
    {
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}] .rail-row__start')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      const woke = await waitUntil(async () => {
        const sessions = await wc.executeJavaScript(`window.__m4aSessions()`)
        const s = sessions.find((x) => x.id === RAIL_DORMANT_ID)
        return s && s.dormant === false ? s : false
      }, 6000)
      const tail = await wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}]')
        return row ? row.querySelector('.rail-row__tail').textContent : null
      })()`)
      ok('85 the start control wakes the panel the row click would not',
        woke !== false && tail !== 'dormant',
        `session=${JSON.stringify(woke)} tail=${tail}`)
    }

    // 86. THE ROW'S CLOSE CONTROL CLOSES THE PANEL.
    //     Asserted through THREE reads, because each alone passes against a
    //     different wrong implementation: the row going is satisfied by a rail
    //     that filtered its own list locally, the .panel going is satisfied by
    //     a close that left the session running, and the session going is what
    //     proves the control reached onClosePanel — the one call site that
    //     disposes. Together they pin that the rail added no fourth way to
    //     remove a panel.
    {
      const target = renamedId
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row=${JSON.stringify(target)}] .rail-row__close')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      const gone = await waitUntil(async () => {
        const state = await wc.executeJavaScript(`(() => ({
          row: document.querySelector('.rail-row[data-rail-row=${JSON.stringify(target)}]') !== null,
          panel: document.querySelector('.panel[data-panel-id=${JSON.stringify(target)}]') !== null,
          session: window.__m4aSessions().some((s) => s.id === ${JSON.stringify(target)})
        }))()`)
        return (!state.row && !state.panel && !state.session) ? state : false
      }, 6000)
      ok('86 the row\'s close control closes the panel, its DOM and its session',
        gone !== false, `target=${target} state=${JSON.stringify(gone)}`)
    }
```

Note on 86's fixture: the reload in the 84/85 seeding block restores `renamedId` from disk along with everything else, so it is still present here — but under the DIRECT backend it comes back dormant, with no session. If the three-clause read is ever seen failing only on `session`, check which backend the run took before assuming a regression: `!state.session` is trivially true for a panel that never respawned, and the clause that carries the weight there is the row and the `.panel` both going.

- [ ] **Step 3: Run them, and prove 84 can fail**

Run: `npm run verify:panels`
Expected: 84, 85, 86 PASS.

Then temporarily point `RailPanelRow`'s `onGoTo` prop at `onStart` in `SideRail`, rebuild, and confirm 84 goes red on the `still.dormant` clause while its camera clause stays green — that is the pairing the check exists for. Revert.

- [ ] **Step 4: Run the whole chain**

Run: `npm run verify`
Expected: every suite green, including the new `verify:rail` slot.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-panels.cjs
git commit -m "test(m8b): navigating does not wake, the start control does, the close closes

84 and 85 are one rule stated from both sides. A row wired to onSelectPanel
frames the panel exactly as correctly as goToPanel does and also wakes it, so
the camera clause alone cannot tell them apart — and 'never wakes' alone is
satisfied by a rail that CANNOT wake, with an inert arrow beside a dormant
panel it can never start.

86 reads three facts in one wait because each alone passes against a
different wrong close: a locally filtered list, a close that left the session
running, and a row that removed nothing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md` (the verify table; the "Load-bearing details" section)
- Modify: `README.md` (the milestone table)

**Interfaces:**
- Consumes: the shipped behaviour of Tasks 1–4.
- Produces: nothing code depends on.

- [ ] **Step 1: Add the suite to `CLAUDE.md`'s verify table**

Insert a row after the `verify:palette` row:

```
| `verify:rail` | plain node | 15 checks against `renderer/shell/rail-rows.ts`: the honest chain's four links (1–4), the status tail (5–9), and the signature (10–15). Three are worth knowing by number. **7** pins that an exit code of 0 renders as `exited 0` — a truthiness test on `code` prints the wrong tail for the single most common exit there is, and no other check in the repo can see it. **10** is the check the module exists for: moving every rect must leave the signature byte-identical, which is what lets `Canvas.tsx` freeze the rows array on it; the rail is always open, so the escape hatch `panelRows` uses (key the memo on `palette.open`, read `panelsRef`) is unavailable to it. **14** pins that a user's own title cannot forge a field boundary and freeze the rail on stale rows — which is why the signature is `JSON.stringify` over the rows rather than a concatenation with a separator a label is free to contain. M8c's inspector rows and M8d's workspace and attention rows are expected to join this suite rather than get their own |
```

Update the `verify:panels` row's count from 91 to 97 and append to its text:

```
M8b adds the panel outline end to end (81–86). **83 is the one to know by number**: check 54 already proves a bell reaches the PANEL, so what 83 adds is the half only the rail can be wrong about — it reads EVERY row's dot and asserts the others did not move, which is the only thing separating a per-row `useAgentState(id)` subscription from one subscription for the whole list. Both paint the same dot; only the second re-renders every row on every panel's bell, the fan-out `agent-state-store.ts` exists to refuse. 84 and 85 are one rule stated from both sides: a row wired to `onSelectPanel` frames its panel exactly as correctly as `goToPanel` does and also wakes it, so 84's camera clause alone cannot tell them apart — and "never wakes" alone is satisfied by a rail that CANNOT wake, with an inert start control beside a dormant panel it can never start, which is what 85 exists to reject. 84 seeds its own dormant fixture (`rail-dormant`, parked at world 60000,60000) by the same disk-append-and-reload route check 39's `never-woken` uses, because M7's check 71 deletes the last workspace and check 39's fixture does not survive it. 86 reads three facts in one wait — the row is gone, the `.panel` is gone, and `__m4aSessions` no longer holds it — because each alone passes against a different wrong close; note that its session clause is weaker under the DIRECT backend, where the 84/85 reload leaves that panel dormant with no session to lose
```

- [ ] **Step 2: Add the load-bearing entries to `CLAUDE.md`**

Append to the "Load-bearing details" section, after the `useShellChrome` entry:

```markdown
**The rail is always open, so its rows are frozen on a signature
(`shell/rail-rows.ts`, `Canvas.tsx`'s `railRows`).** `panels` is a fresh array
on every `setPanelRect` — i.e. every frame of a drag — and the palette solved
that by keying `panelRows` on `palette.open` and reading `panelsRef`, which
works only because the palette is a surface that is usually closed. The rail
has no such escape. So the rows are rebuilt on EVERY render (cheap: N panels,
no IO) and their ARRAY IDENTITY is frozen on `railSignature`. A drag moves
rects, the signature is byte-identical, `railRows` keeps its identity, and
`memo`'d `SideRail` and `RailPanelRow` re-render nothing. The `useMemo` dep is
deliberately the signature and not `railBuilt`: when the signature is equal,
`railBuilt` is equal by construction, so returning the previous array is the
mechanism rather than a stale read. Two details fail silently if undone. The
signature is taken over the ROWS rather than their inputs, which is what makes
"covers exactly what a row renders" structurally true instead of dependent on
someone remembering to add a field. And it is `JSON.stringify` rather than a
concatenation, because a label is USER TEXT: with an ordinary separator a title
containing it could forge a field boundary, make two different lists produce
one string, and freeze the rail on stale rows — for the users whose titles
happen to contain that character and nobody else. `verify:rail` 10 and 14.

**Agent state reaches a rail row by the row's own subscription, never the
list's (`shell/RailPanelRow.tsx`).** `agent-state-store.ts` subscribes PER
PANEL ID precisely so a change for `n3` notifies only whatever asked about
`n3`; a list that subscribed once and passed each state down as a prop would
re-render every row on every panel's bell — the fan-out that module exists to
refuse, arriving through a door it could not see. It is also why agent state is
deliberately ABSENT from `RailRow` and therefore from `railSignature`: putting
it there would rebuild the whole rows array on a bell instead of re-rendering
one row. `verify:panels` 83 is the only check that can tell the two
implementations apart, and it does it by reading every dot rather than one —
both paint the target dot correctly.

**The rail navigates; only the start control wakes (`shell/RailPanelRow.tsx`,
`PaletteActions.startPanel`).** A row's body calls `goToPanel(id)` — frame,
select, raise — and never `onSelectPanel`, which clears the dormant id and
calls `registry.wake`. The obvious implementation, reuse `onSelectPanel`,
frames the panel exactly as correctly and spawns an agent as a side effect of
clicking a list entry; on a restored twelve-panel canvas that is twelve CLIs
launched by browsing. This is M5b's `goToPanel` rule ("Navigating must not
wake") reaching a second surface, not a new one. The wake is still reachable,
through an explicit control on dormant rows only — `verify:panels` 85 exists
because "never wakes" is satisfied just as well by a rail that CANNOT wake.

**`closePanel` and `startPanel` are actions members with no palette rows
(`palette/commands.ts`).** The shell reaches the app only through the actions
object (the spec's rule 1), so a rail that closed over `registry.dispose` or
`registry.wake` directly would be a second implementation of a verb that
already has an authority — and `pty.kill`'s two-caller count inside
`session-registry.ts` would stop being re-derivable from one place. They
deliberately emit no `Command` rows, which is the one place M8b declines
something the shell/palette symmetry would hand it for free: both verbs already
have a gesture (the panel's own `×`; clicking the card that says "click to
start"), and M6p sized the resting list to roughly eight rows on purpose.
`restartPanel` in M8c is the verb that DOES earn a row, because it has no other
gesture at all.
```

- [ ] **Step 3: Add the milestone row to `README.md`**

After the `M8a` row in the milestone table:

```
| M8b | The panel outline: a rail row per panel, navigate without waking | ✅ done |
```

- [ ] **Step 4: Re-derive the two counts this repo has already let go stale**

`CLAUDE.md` records that the `registry.dispose` call-site count went stale once. Re-derive both before committing, and correct the file if either moved:

```bash
grep -n "registry.dispose" src/renderer/canvas/Canvas.tsx
grep -n "pty.kill" src/renderer/session/session-registry.ts
```

Expected: still four `dispose` call sites (close button, `applyHistory`, `onReset`, workspace delete) and still two `pty.kill` callers. M8b adds neither — `closePanel` routes into the existing `onClosePanel`. If either number moved, something in Task 2 reached past the actions object; fix the code, not the count.

- [ ] **Step 5: Refresh the knowledge graph and run the full verification**

```bash
graphify update .
npm run verify
```

Expected: `verify` green end to end.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md graphify-out
git commit -m "docs(m8b): the panel outline, and the two counts re-derived

Records the three things a later reader would otherwise undo: rows frozen on
a signature taken over the ROWS (so its coverage is structural, not
remembered), JSON rather than a separator a user's title is free to contain,
and a per-row agent-state subscription rather than the list's.

Re-derived registry.dispose's four call sites and pty.kill's two callers
rather than trusting the numbers already written down — this file records
that the first of those has gone stale once already. Neither moved: closePanel
routes into the onClosePanel that already existed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
