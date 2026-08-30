# M17: Token and dollar accounting per panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show what each panel's agent has spent — tokens as the primary figure, dollars labelled as API list price — in the inspector, live, while the agent is still running.

**Architecture:** A preset declares itself a Claude Code preset; `PtyManager.create` mints a session UUID for a panel spawned from one, passes `--session-id <uuid>`, and **persists it** in `layout.json` (a `sessions` map, a sibling of `workspaces`, exactly as `baselines` is). A third slow tick in `PtyManager` resolves each pinned transcript by globbing `~/.claude/projects/*/<uuid>.jsonl` **once**, tails it from a stored byte offset, accumulates four token classes per model, and emits `usage:panel` **only on a change**. A module-level renderer store subscribed per panel id feeds an inspector Cost section.

**Tech Stack:** TypeScript, Electron (main + preload + renderer), React 18, esbuild-bundled plain-node verify suites. No new runtime dependencies — the parser is `JSON.parse` over lines and the file reads are `node:fs`.

**Spec:** [`docs/superpowers/specs/2026-08-30-m17-usage-accounting-design.md`](../specs/2026-08-30-m17-usage-accounting-design.md) — read it before Task 1. Every task below argues from it.

## Global Constraints

Copied verbatim from the spec and from `CLAUDE.md`. Every task's requirements implicitly include this section.

- **Four token classes, never two.** `input`, `output`, `cacheWrite`, `cacheRead`. An `input + output` model is wrong by more than an order of magnitude on long sessions. Never sum classes into one number anywhere except inside `costOf`.
- **`usage:panel` is an `IPC_EVENTS` member, not an `IPC` one.** It is a main→renderer send handled by nobody. **`verify:ipc` must stay at `1/1` and its channel count must NOT move.** M6d and M12 both recorded getting this wrong.
- **The renderer usage store must never bump `registry.version()`.** That counter gates `TerminalPanel`'s `memo`; a per-turn fact riding it re-renders every panel on every other panel's turn.
- **Zero and unmeasured are different facts.** A panel with no pinned session renders **no Cost section at all**, never `$0.00`.
- **An unknown model yields no dollar figure at all**, never `0`.
- **Every object hop rebuilds field by field, never by spreading.** Spreading carries `command: undefined` across an IPC structured clone, where `'command' in template` then reads `true`. This is why `agent` must be added at four sites by hand.
- **New verify suites must be wired into the `verify` chain** (`verify:meta` 19 fails otherwise) **and new IPC channels must appear in the README's architecture diagram** — specifically inside the fenced block containing `--invoke-->` (`verify:meta` 14 fails otherwise).
- **Commit style:** conventional, scoped `feat(m17):` / `fix(m17):` / `docs(m17):`. End every commit message with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **A check that THROWS aborts the run**, so every check after it never executes and its RED is not evidence. Guard calls that may not exist yet (`if (row) row.run()`), and when watching checks fail test-first, note which checks a throw prevented from running.
- **Milestone number is M17.** M14 is claimed by `worktree-m14-workspace-extras`.

## File Structure

**Create:**
| File | Responsibility |
|---|---|
| `src/shared/cost.ts` | The vendor-neutral accounting types. No vendor word appears in it. |
| `src/main/usage-parse.ts` | Pure. A JSONL byte chunk → usage entries + the unconsumed carry. Imports nothing. |
| `src/main/pricing.ts` | Pure. Model id → per-class rates; `costOf`. Imports only `@shared/cost` as a type. |
| `src/main/usage-accumulator.ts` | Pure. Offsets, carries, totals, and the change test. Imports no `fs`. |
| `src/main/transcript-reader.ts` | The thin real-`fs` half: glob a transcript by session id, read a byte range. The only file in this milestone that touches disk. |
| `src/renderer/session/usage-store.ts` | Module-level store, subscribed per panel id. |
| `scripts/verify-usage.cjs` | The new plain-node suite. |
| `scripts/usage-entry.cjs` | Its esbuild entry shim. |

**Modify:**
| File | Change |
|---|---|
| `src/shared/layout-schema.ts` | `sessions` on `LayoutSnapshot`; `parseSessions`; `agent` on `Preset`. |
| `src/main/layout-store.ts` | `session()` / `setSession()` / `dropSession()` accessors. |
| `src/shared/ipc-contract.ts` | `USAGE_PANEL` in `IPC_EVENTS`; `agent` on `PresetTemplate` and `CapturedPanel`; `onUsage` on the bridge type. |
| `src/shared/types.ts` | `agent` on `PanelSpec`. |
| `src/main/pty-manager.ts` | Pin the session id and inject the flag; the third tick; drop on `kill`. |
| `src/main/presets.ts` | Carry `agent` through `templateOf` and `presetFromCapture`; declare it on the built-in Claude preset. |
| `src/main/index.ts` | Wire the store accessors into `PtyManager`. |
| `src/preload/index.ts` | Expose `onUsage`. |
| `src/renderer/panels/panels.ts` | Carry `agent` from template into `PanelSpec`. |
| `src/renderer/canvas/Canvas.tsx` | The one `usage:panel` subscription; clear on dispose; pass usage to the inspector. |
| `src/renderer/shell/inspector-fields.ts` | `usage` on `InspectorModel`; `buildUsageFields`. |
| `src/renderer/shell/Inspector.tsx` | Render the Cost section. |
| `src/renderer/styles.css` | Cost section styling, using existing tokens only. |
| `scripts/rail-entry.cjs` | Nothing — `inspector-fields.ts` is already in it. |
| `package.json` | `verify:usage` script + chain wiring. |
| `README.md` | The channel in the architecture diagram; the suite in the table; the milestone row. |
| `CLAUDE.md` | The load-bearing details and the suite table entry. |
| `docs/ideas-backlog.md` | Rewrite #19 down to its still-open half. |

---

### Task 1: The accounting types and the pure parser

**Files:**
- Create: `src/shared/cost.ts`
- Create: `src/main/usage-parse.ts`
- Create: `scripts/usage-entry.cjs`
- Create: `scripts/verify-usage.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `TokenTotals`, `PanelUsage`, `emptyTotals()`, `addTotals(a, b)` from `@shared/cost`; `UsageEntry`, `parseUsageChunk(text, carry)` from `main/usage-parse`.

- [ ] **Step 1: Write the failing checks**

Create `scripts/usage-entry.cjs`:

```js
/* Bundle entry for M17's pure accounting modules. No React, no DOM, no
   electron, no node-pty and — deliberately — no `fs`: the three modules
   bundled here are pure functions over strings and numbers, so they sit in
   the cheapest verify tier this repo has. transcript-reader.ts is the thin
   real-fs half and is NOT here, the same way git-runner.ts stays out of
   review-engine.ts's own reach. */
module.exports = {
  ...require('../src/shared/cost'),
  ...require('../src/main/usage-parse'),
  ...require('../src/main/pricing'),
  ...require('../src/main/usage-accumulator')
}
```

Create `scripts/verify-usage.cjs`:

```js
/* Verifies M17's pure accounting: the JSONL parser, the price table, and the
   accumulator.
   Run with: npm run verify:usage

   Plain node, like verify:viewport and verify:rail: none of these modules
   imports electron or node-pty, none touches the DOM, and none touches `fs`
   — the real-fs half lives in transcript-reader.ts and is deliberately not
   in this bundle, exactly as git-runner.ts stays out of review-engine.ts's
   reach so verify:review's fake-runner tier can exist at all. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'out', 'verify', 'usage.cjs')
buildSync({
  entryPoints: [join(__dirname, 'usage-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Both aliases pre-emptively, for the reason CLAUDE.md gives for
  // verify-rail.cjs carrying them: every @shared import reachable from here
  // is an `import type` today, which esbuild erases before bundling — and
  // "needing no alias YET" is precisely the state verify-viewport.cjs was in
  // right up until the day panel-interaction.ts broke it.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const U = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

// An assistant record as Claude Code actually writes one. The field names are
// copied from a real transcript read on 2026-08-30 and must not be "tidied":
// they are another program's format, not ours.
const rec = (over = {}) => JSON.stringify({
  type: 'assistant',
  cwd: '/tmp/x',
  sessionId: 's1',
  timestamp: '2026-08-30T00:00:00.000Z',
  isSidechain: false,
  message: {
    model: 'claude-opus-5',
    usage: {
      input_tokens: 2,
      output_tokens: 1095,
      cache_creation_input_tokens: 1491,
      cache_read_input_tokens: 120118
    }
  },
  ...over
})

// 1. The ordinary case: one complete record, one entry, four classes landed
//    SEPARATELY. The four-class clause is the whole check — an implementation
//    that summed input+output passes any assertion phrased as "an entry came
//    back", and is wrong by an order of magnitude on this very fixture.
{
  const { entries, carry } = U.parseUsageChunk(rec() + '\n', '')
  const e = entries[0]
  ok(1, entries.length === 1 && carry === ''
      && e.model === 'claude-opus-5'
      && e.totals.input === 2 && e.totals.output === 1095
      && e.totals.cacheWrite === 1491 && e.totals.cacheRead === 120118
      && e.subagent === false,
    entries.length ? JSON.stringify(e.totals) : 'no entries')
}

// 2. A chunk ending MID-RECORD yields NO entry and returns the fragment as
//    carry. This is the half that makes the number correct: a tick can land
//    while Claude Code is mid-write, and DROPPING that fragment loses the
//    turn permanently, because the byte offset has already advanced past it.
{
  const text = rec() + '\n' + '{"type":"assistant","mess'
  const { entries, carry } = U.parseUsageChunk(text, '')
  ok(2, entries.length === 1 && carry === '{"type":"assistant","mess',
    `entries=${entries.length} carry=${JSON.stringify(carry)}`)
}

// 3. That carry COMPLETES on the next chunk and yields the entry EXACTLY
//    ONCE. 2 and 3 are one check in two halves and neither alone is worth
//    much: 2 alone passes against an implementation that returns a carry and
//    never consumes it (so the turn is lost anyway), and 3 alone passes
//    against one that double-counts the fragment.
{
  const whole = rec()
  const head = whole.slice(0, 40)
  const tail = whole.slice(40)
  const first = U.parseUsageChunk(head, '')
  const second = U.parseUsageChunk(tail + '\n', first.carry)
  ok(3, first.entries.length === 0 && second.entries.length === 1
      && second.carry === '' && second.entries[0].totals.output === 1095,
    `first=${first.entries.length} second=${second.entries.length}`)
}

// 4. A non-assistant record contributes nothing. Transcripts are mostly NOT
//    assistant records — a real one measured 262 lines of which 105 were —
//    so a parser that counted every line's `usage` would be reading fields
//    that are not there and, worse, would count `user` records that echo a
//    usage block.
{
  const other = JSON.stringify({ type: 'user', message: { content: 'hi' } })
  const { entries } = U.parseUsageChunk(other + '\n' + rec() + '\n', '')
  ok(4, entries.length === 1, `entries=${entries.length}`)
}

// 5. A malformed line is skipped ALONE and does not take the rest of the
//    chunk with it — parseLayout's individual-drop rule, applied to another
//    program's file, where we have even less right to assume well-formedness.
{
  const { entries } = U.parseUsageChunk('{not json\n' + rec() + '\n', '')
  ok(5, entries.length === 1, `entries=${entries.length}`)
}

// 6. An assistant record with no usage block is skipped rather than throwing
//    or contributing zeros. Reachable: a streamed record can be written
//    before its usage is known.
{
  const noUsage = JSON.stringify({ type: 'assistant', message: { model: 'm' } })
  const { entries } = U.parseUsageChunk(noUsage + '\n', '')
  ok(6, entries.length === 0, `entries=${entries.length}`)
}

// 7. isSidechain marks a subagent turn. It counts (a subagent spends real
//    money) but is FLAGGED, so "why is this panel's number so large" stays
//    answerable.
{
  const { entries } = U.parseUsageChunk(rec({ isSidechain: true }) + '\n', '')
  ok(7, entries.length === 1 && entries[0].subagent === true,
    entries.length ? String(entries[0].subagent) : 'no entries')
}

// 8. Absent token fields default to 0 rather than NaN. `cache_creation_input_
//    tokens` is absent on a first turn with nothing cached, and one NaN
//    poisons every later addition silently — the total renders as "NaN" or,
//    worse, as nothing.
{
  const sparse = JSON.stringify({
    type: 'assistant',
    message: { model: 'm', usage: { input_tokens: 5, output_tokens: 7 } }
  })
  const { entries } = U.parseUsageChunk(sparse + '\n', '')
  const t = entries[0].totals
  ok(8, t.cacheWrite === 0 && t.cacheRead === 0 && t.input === 5 && t.output === 7,
    JSON.stringify(t))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
```

Add to `package.json` scripts, after `"verify:review"`:

```json
"verify:usage": "node scripts/verify-usage.cjs",
```

and insert `&& npm run verify:usage` into the `verify` chain immediately after `npm run verify:review`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:usage`
Expected: FAIL — the build throws because `src/shared/cost.ts` and `src/main/usage-parse.ts` do not exist. **This is a throw, not a red check**, so no check number is evidence yet; note that all 8 were prevented from running.

- [ ] **Step 3: Write `src/shared/cost.ts`**

```ts
/**
 * What an agent has spent, in a shape with no vendor in it.
 *
 * FOUR classes, never two. Measured from a real Claude Code transcript on
 * 2026-08-30: one assistant turn reported input_tokens 2 against
 * cache_read_input_tokens 120118. Cache reads are priced near a tenth of
 * fresh input and cache writes above it, so `input + output` — the obvious
 * model, and the one every naive implementation reaches for — is wrong by
 * more than an order of magnitude on exactly the long-lived sessions this app
 * exists to run. Collapsing these into one number anywhere but inside
 * costOf() reintroduces that error.
 */
export interface TokenTotals {
  /** Fresh, uncached input. */
  input: number
  output: number
  /** cache_creation_input_tokens: written to the cache, priced above input. */
  cacheWrite: number
  /** cache_read_input_tokens: served from cache, priced far below input. */
  cacheRead: number
}

/**
 * One panel's spend.
 *
 * `byModel` is not a nicety: a session can change model mid-conversation, and
 * a flat total cannot be priced at all once it has. It is the unit the price
 * table is applied to.
 */
export interface PanelUsage {
  totals: TokenTotals
  byModel: Record<string, TokenTotals>
  turns: number
  /** Of `turns`, how many were subagent (isSidechain) turns. Included in it. */
  subagentTurns: number
}

export function emptyTotals(): TokenTotals {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
}

export function addTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead
  }
}
```

- [ ] **Step 4: Write `src/main/usage-parse.ts`**

```ts
import { type TokenTotals } from '../shared/cost'

/**
 * One assistant turn's usage, pulled out of a Claude Code transcript line.
 *
 * Pure and import-free apart from a type, so it runs in the plain-node verify
 * tier — the same trade git-args.ts makes.
 */
export interface UsageEntry {
  model: string
  totals: TokenTotals
  /** An isSidechain record: a subagent's turn, in the same session file. */
  subagent: boolean
}

export interface ParsedChunk {
  entries: UsageEntry[]
  /**
   * The trailing fragment this chunk ended on, to be prepended to the next.
   *
   * This is the parser's whole correctness. A read can land while Claude Code
   * is mid-write, so the last line routinely arrives without its newline.
   * Parsing it fails; DROPPING it loses that turn's tokens permanently,
   * because the caller's byte offset has already advanced past those bytes and
   * nothing will ever read them again. The failure is a total that is quietly
   * and unrecoverably low, by an amount proportional to how busy the agent
   * is — the worst possible direction for this feature.
   */
  carry: string
}

/** Absent is 0, never NaN: one NaN poisons every later addition silently. */
function num(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

/**
 * Parse the bytes appended since the last read, plus whatever fragment that
 * read ended on.
 *
 * Individual lines are dropped individually on malformed input, the rule
 * parseLayout already obeys — and with more reason here, since this is another
 * program's file and one bad line must not cost the rest of the chunk.
 */
export function parseUsageChunk(text: string, carry: string): ParsedChunk {
  const whole = carry + text
  const lines = whole.split('\n')
  // The last element is whatever followed the final newline: '' for a chunk
  // that ended cleanly, a fragment otherwise. Either way it is NOT a complete
  // line and must not be parsed.
  const nextCarry = lines.pop() ?? ''
  const entries: UsageEntry[] = []
  for (const line of lines) {
    if (line.trim() === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(parsed) || parsed.type !== 'assistant') continue
    const message = parsed.message
    if (!isRecord(message)) continue
    const usage = message.usage
    // A streamed record can be written before its usage is known. No usage is
    // not a zero-cost turn, it is a turn we cannot price yet.
    if (!isRecord(usage)) continue
    entries.push({
      model: typeof message.model === 'string' ? message.model : 'unknown',
      subagent: parsed.isSidechain === true,
      totals: {
        input: num(usage.input_tokens),
        output: num(usage.output_tokens),
        cacheWrite: num(usage.cache_creation_input_tokens),
        cacheRead: num(usage.cache_read_input_tokens)
      }
    })
  }
  return { entries, carry: nextCarry }
}
```

- [ ] **Step 5: Stub `pricing.ts` and `usage-accumulator.ts` so the bundle builds**

The entry shim requires all four modules. Create both files with only a comment and one export each, to be filled in by Tasks 2 and 3:

```ts
// src/main/pricing.ts — filled in by Task 2.
export const PRICING_PLACEHOLDER = true
```

```ts
// src/main/usage-accumulator.ts — filled in by Task 3.
export const ACCUMULATOR_PLACEHOLDER = true
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm run verify:usage`
Expected: `8/8 passed`, exit 0.

- [ ] **Step 7: Confirm the chain wiring**

Run: `npm run verify:meta`
Expected: `19/19 passed` — specifically check 19, which fails if `verify:usage` exists as a script and is not in the chain.

- [ ] **Step 8: Commit**

```bash
git add src/shared/cost.ts src/main/usage-parse.ts src/main/pricing.ts \
        src/main/usage-accumulator.ts scripts/usage-entry.cjs \
        scripts/verify-usage.cjs package.json
git commit -m "$(cat <<'EOF'
feat(m17): the accounting types and the transcript parser

Four token classes, never two: a real assistant turn reported input_tokens 2
against cache_read_input_tokens 120118, so input+output is wrong by more than
an order of magnitude on exactly the long sessions this app runs.

The carry buffer is the parser's whole correctness. A read lands while Claude
Code is mid-write, so the last line routinely arrives without its newline —
and dropping it loses that turn permanently, because the caller's offset has
already advanced past those bytes. Checks 2 and 3 are one check in two halves:
2 alone passes against a parser that returns a carry and never consumes it, 3
alone against one that double-counts it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The price table

**Files:**
- Modify: `src/main/pricing.ts`
- Modify: `scripts/verify-usage.cjs`

**Interfaces:**
- Consumes: `TokenTotals` from `@shared/cost`.
- Produces: `costOf(totals: TokenTotals, model: string): number | undefined` and `MODEL_RATES` from `main/pricing`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-usage.cjs`, immediately before the `console.log('\n' + '='.repeat(60))` summary block:

```js
// 9. The four classes are priced SEPARATELY, and the fixture is built so an
//    input+output implementation is NUMERICALLY distinguishable — cache read
//    dominates by a factor of 60,000 here, which is the ordinary shape of a
//    long session rather than a contrived one. A check with a balanced
//    fixture cannot tell the two implementations apart and is worth nothing.
{
  const heavy = { input: 2, output: 1000, cacheWrite: 0, cacheRead: 120000 }
  const light = { input: 2, output: 1000, cacheWrite: 0, cacheRead: 0 }
  const a = U.costOf(heavy, 'claude-opus-5')
  const b = U.costOf(light, 'claude-opus-5')
  ok(9, typeof a === 'number' && typeof b === 'number' && a > b,
    `withCache=${a} withoutCache=${b}`)
}

// 10. A cache READ costs less than the same count of FRESH input. This is the
//     direction the whole four-class model exists for, and a table with the
//     two rates transposed satisfies check 9 perfectly — 9 only asks that
//     cache reads cost SOMETHING.
{
  const asRead = { input: 0, output: 0, cacheWrite: 0, cacheRead: 100000 }
  const asInput = { input: 100000, output: 0, cacheWrite: 0, cacheRead: 0 }
  ok(10, U.costOf(asRead, 'claude-opus-5') < U.costOf(asInput, 'claude-opus-5'),
    `read=${U.costOf(asRead, 'claude-opus-5')} input=${U.costOf(asInput, 'claude-opus-5')}`)
}

// 11. An unknown model yields UNDEFINED, never 0. A new model shipping while
//     this table is old must read as "not priced here" — a zero would render
//     as "$0.00" beside an agent that is plainly spending, which is the
//     confident wrong answer this milestone's whole honesty rule forbids.
{
  const t = { input: 100, output: 100, cacheWrite: 0, cacheRead: 0 }
  ok(11, U.costOf(t, 'some-model-shipped-next-year') === undefined,
    String(U.costOf(t, 'some-model-shipped-next-year')))
}

// 12. Every declared rate is a positive finite number for all four classes.
//     A table entry with a missing class silently prices that class at
//     undefined, and `undefined * n` is NaN, which propagates to a dollar
//     figure that renders as nothing at all.
{
  const bad = Object.entries(U.MODEL_RATES).filter(([, r]) =>
    !['input', 'output', 'cacheWrite', 'cacheRead'].every(
      (k) => typeof r[k] === 'number' && Number.isFinite(r[k]) && r[k] > 0))
  ok(12, Object.keys(U.MODEL_RATES).length > 0 && bad.length === 0,
    bad.length ? `bad: ${bad.map(([m]) => m).join(', ')}` : `${Object.keys(U.MODEL_RATES).length} models`)
}

// 13. Zero tokens is zero dollars for a KNOWN model — distinct from check
//     11's undefined for an unknown one. The two must not collapse: "this
//     model is not priced" and "this panel has spent nothing yet" are
//     different sentences and the pane renders them differently.
{
  ok(13, U.costOf(U.emptyTotals(), 'claude-opus-5') === 0,
    String(U.costOf(U.emptyTotals(), 'claude-opus-5')))
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:usage`
Expected: FAIL — a `TypeError` on `U.costOf is not a function` at check 9, which **aborts the run**. Checks 10–13 never execute; their RED is not yet evidence. Confirm each separately after implementing, by re-reading the output.

- [ ] **Step 3: Write `src/main/pricing.ts`**

Replace the placeholder entirely:

```ts
import { type TokenTotals } from '../shared/cost'

/**
 * Dollars per MILLION tokens, per class, per model.
 *
 * PRICES AS OF 2026-08-30, from Anthropic's published API price list. A price
 * table with no date is a table nobody can tell is stale, which is why that
 * sentence is here rather than in a commit message — and why an unknown model
 * yields no figure at all rather than a plausible-looking wrong one.
 *
 * These are API LIST prices. They are not what a Max or Pro subscriber is
 * charged, which is nothing per token. Everything downstream labels the
 * figure accordingly; see buildUsageFields.
 *
 * The four rates are not derivable from one another. Cache writes cost MORE
 * than fresh input (a 5-minute write is 1.25x) and cache reads cost far LESS
 * (0.1x), so a table that stored one "input" rate and scaled it would be
 * inventing two of its four numbers.
 */
export interface ModelRates {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

export const MODEL_RATES: Record<string, ModelRates> = {
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
}

const PER_MILLION = 1_000_000

/**
 * List-price dollars for these totals, or undefined when the model is not in
 * the table.
 *
 * UNDEFINED, never 0. A model that shipped after this table was written must
 * read as "not priced here"; a zero renders as "$0.00" beside an agent that
 * is visibly working, which is the confident wrong answer the whole design
 * refuses. Note the asymmetry with a KNOWN model at zero tokens, which
 * legitimately IS 0 — those are two different sentences.
 */
export function costOf(totals: TokenTotals, model: string): number | undefined {
  const rates = MODEL_RATES[model]
  if (!rates) return undefined
  return (
    (totals.input * rates.input +
      totals.output * rates.output +
      totals.cacheWrite * rates.cacheWrite +
      totals.cacheRead * rates.cacheRead) /
    PER_MILLION
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run verify:usage`
Expected: `13/13 passed`. Read every line: checks 10–13 could not run in Step 2, so confirm each says PASS now and reason about whether it would have failed against the absent implementation.

- [ ] **Step 5: Commit**

```bash
git add src/main/pricing.ts scripts/verify-usage.cjs
git commit -m "$(cat <<'EOF'
feat(m17): the price table, dated, with an unknown model priced at nothing

Four rates per model, not one scaled three ways: a cache write costs MORE than
fresh input and a cache read far less, so a derived table would be inventing
two of its four numbers.

Check 10 is the one worth knowing by number — it pins that a cache READ costs
less than the same count of fresh input, which is the direction the whole
four-class model exists for. A table with those two rates transposed satisfies
check 9 completely, since 9 only asks that cache reads cost something.

An unknown model yields undefined, never 0: "$0.00" beside a visibly working
agent is the confident wrong answer this milestone refuses.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The accumulator — offsets, carries, and the change test

**Files:**
- Modify: `src/main/usage-accumulator.ts`
- Modify: `scripts/verify-usage.cjs`

**Interfaces:**
- Consumes: `parseUsageChunk`, `UsageEntry` from `main/usage-parse`; `PanelUsage`, `emptyTotals`, `addTotals` from `@shared/cost`.
- Produces: from `main/usage-accumulator`:
  - `createUsageState(): UsageState`
  - `applyChunk(state: UsageState, panelId: string, text: string, fileSize: number): PanelUsage | undefined` — returns the new usage **only when it changed**, `undefined` otherwise.
  - `offsetFor(state: UsageState, panelId: string): number`
  - `resetIfShrunk(state: UsageState, panelId: string, fileSize: number): void`
  - `dropUsage(state: UsageState, panelId: string): void`
  - `usageFor(state: UsageState, panelId: string): PanelUsage | undefined`

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-usage.cjs` before the summary block:

```js
// A file-size argument the accumulator can compare against its offset. The
// tests pass `offset + text.length` for the ordinary growing case.
const grow = (st, id, text) => U.applyChunk(st, id, text, U.offsetFor(st, id) + text.length)

// 14. Totals accumulate ACROSS chunks and the offset advances by the bytes
//     consumed. Two records in two reads must total the same as two in one.
{
  const st = U.createUsageState()
  grow(st, 'n1', rec() + '\n')
  const after = grow(st, 'n1', rec() + '\n')
  ok(14, after.totals.output === 2190 && after.turns === 2
      && U.offsetFor(st, 'n1') === (rec() + '\n').length * 2,
    `output=${after && after.totals.output} turns=${after && after.turns} offset=${U.offsetFor(st, 'n1')}`)
}

// 15. byModel keeps models apart. A session that changed model mid-way cannot
//     be priced from a flat total at all, so this is not bookkeeping — it is
//     the unit costOf is applied to.
{
  const st = U.createUsageState()
  grow(st, 'n1', rec() + '\n')
  const u = grow(st, 'n1', rec({ message: { model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 20 } } }) + '\n')
  ok(15, Object.keys(u.byModel).length === 2
      && u.byModel['claude-sonnet-5'].output === 20
      && u.byModel['claude-opus-5'].output === 1095,
    JSON.stringify(Object.keys(u.byModel)))
}

// 16. subagentTurns counts isSidechain records and is INCLUDED in turns. Both
//     clauses matter: reporting them separately is what keeps "why is this
//     number so large" answerable, and excluding them from `turns` would make
//     the two figures fail to reconcile on screen.
{
  const st = U.createUsageState()
  grow(st, 'n1', rec() + '\n' + rec({ isSidechain: true }) + '\n')
  const u = U.usageFor(st, 'n1')
  ok(16, u.turns === 2 && u.subagentTurns === 1, `turns=${u.turns} sub=${u.subagentTurns}`)
}

// 17. A SPLIT record spanning two applyChunk calls is counted exactly once.
//     This is checks 2/3 driven through the layer that actually stores the
//     carry — the parser can be perfect and the accumulator can still throw
//     its carry away, which loses the turn just as completely.
{
  const whole = rec()
  const st = U.createUsageState()
  grow(st, 'n1', whole.slice(0, 40))
  const u = grow(st, 'n1', whole.slice(40) + '\n')
  ok(17, u && u.turns === 1 && u.totals.output === 1095,
    u ? `turns=${u.turns} output=${u.totals.output}` : 'no change reported')
}

// 18. The DEDUPE: a read that added nothing returns undefined rather than a
//     fresh equal object. Without it every tick sends a message describing a
//     fact that changes once per agent turn — invisible on screen, and
//     purely heat, which is why only a check can ever notice it.
{
  const st = U.createUsageState()
  grow(st, 'n1', rec() + '\n')
  const again = grow(st, 'n1', '')
  ok(18, again === undefined, String(again))
}

// 19. A file that SHRANK resets the offset to 0. A truncated or replaced
//     transcript read from a stale offset yields garbage or nothing, with no
//     error anywhere — the offset only ever advances against a file that only
//     ever grows, and this is the branch for when that stops being true.
{
  const st = U.createUsageState()
  grow(st, 'n1', rec() + '\n')
  U.resetIfShrunk(st, 'n1', 10)
  ok(19, U.offsetFor(st, 'n1') === 0 && U.usageFor(st, 'n1') === undefined,
    `offset=${U.offsetFor(st, 'n1')} usage=${U.usageFor(st, 'n1')}`)
}

// 20. dropUsage clears everything for a panel — totals, offset and carry.
//     The same recycled-id hazard dropBaseline and clearLiveSession each
//     close: without it the map grows for the life of the process and a panel
//     reusing a dead one's id inherits a stranger's spend.
{
  const st = U.createUsageState()
  grow(st, 'n1', rec() + '\n')
  U.dropUsage(st, 'n1')
  ok(20, U.usageFor(st, 'n1') === undefined && U.offsetFor(st, 'n1') === 0,
    `usage=${U.usageFor(st, 'n1')} offset=${U.offsetFor(st, 'n1')}`)
}

// 21. Panels are independent. One flat store keyed by nothing would total
//     every panel's spend into whichever panel asked last, which reads as
//     "every agent costs the same" and is the shape a single shared
//     accumulator produces.
{
  const st = U.createUsageState()
  grow(st, 'n1', rec() + '\n')
  grow(st, 'n2', rec() + '\n')
  ok(21, U.usageFor(st, 'n1').turns === 1 && U.usageFor(st, 'n2').turns === 1,
    `n1=${U.usageFor(st, 'n1').turns} n2=${U.usageFor(st, 'n2').turns}`)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:usage`
Expected: FAIL — `TypeError: U.createUsageState is not a function` at check 14, aborting the run. Checks 15–21 do not execute.

- [ ] **Step 3: Write `src/main/usage-accumulator.ts`**

Replace the placeholder entirely:

```ts
import { addTotals, emptyTotals, type PanelUsage } from '../shared/cost'
import { parseUsageChunk } from './usage-parse'

/**
 * Per-panel reading state: how far into the transcript we have read, what
 * fragment that read ended on, and the running totals.
 *
 * Pure — it takes bytes, never a path. The real-fs half is transcript-reader.ts,
 * kept out of this module the same deliberate way git-runner.ts is kept out of
 * review-engine.ts's reach: that separation is what lets the whole accumulator
 * be driven in the plain-node verify tier with no file anywhere in earshot.
 */
interface PanelState {
  offset: number
  carry: string
  usage: PanelUsage
}

export interface UsageState {
  panels: Map<string, PanelState>
}

export function createUsageState(): UsageState {
  return { panels: new Map() }
}

function stateFor(state: UsageState, panelId: string): PanelState {
  let s = state.panels.get(panelId)
  if (!s) {
    s = {
      offset: 0,
      carry: '',
      usage: { totals: emptyTotals(), byModel: {}, turns: 0, subagentTurns: 0 }
    }
    state.panels.set(panelId, s)
  }
  return s
}

export function offsetFor(state: UsageState, panelId: string): number {
  return state.panels.get(panelId)?.offset ?? 0
}

export function usageFor(state: UsageState, panelId: string): PanelUsage | undefined {
  // Undefined means "nothing has been read for this panel", which is a
  // different fact from "this panel has read something and spent nothing" —
  // the latter returns a usage whose `turns` is 0, and buildUsageFields
  // renders the two differently. Never collapse them here.
  return state.panels.get(panelId)?.usage
}

/**
 * The transcript SHRANK, so it was truncated or replaced and the stored offset
 * points past its end. Reading from there yields garbage or nothing at all,
 * with no error anywhere — so everything for this panel resets and the file is
 * re-read from the top.
 */
export function resetIfShrunk(state: UsageState, panelId: string, fileSize: number): void {
  const s = state.panels.get(panelId)
  if (!s || fileSize >= s.offset) return
  state.panels.delete(panelId)
}

/**
 * A panel is gone for good. Without this the map grows for the life of the
 * process and a panel reusing a dead one's id inherits a stranger's spend —
 * the same recycled-id hazard dropBaseline and clearLiveSession each close.
 */
export function dropUsage(state: UsageState, panelId: string): void {
  state.panels.delete(panelId)
}

/**
 * Fold the bytes appended since the last read into this panel's totals.
 *
 * Returns the new usage ONLY when it actually changed, and undefined
 * otherwise. That dedupe IS the throttle: this rides a slow tick, and an
 * unconditional send would be a message per tick per panel describing a fact
 * that changes once per agent turn. Its failure changes no pixel — it shows up
 * as heat — so nothing but a check will ever notice it, which is why
 * verify:usage 18 exists and why verify:pty-manager's own version of it spans
 * several ticks.
 */
export function applyChunk(
  state: UsageState,
  panelId: string,
  text: string,
  fileSize: number
): PanelUsage | undefined {
  const s = stateFor(state, panelId)
  s.offset = fileSize
  const { entries, carry } = parseUsageChunk(text, s.carry)
  s.carry = carry
  if (entries.length === 0) return undefined
  for (const entry of entries) {
    s.usage.totals = addTotals(s.usage.totals, entry.totals)
    s.usage.byModel[entry.model] = addTotals(
      s.usage.byModel[entry.model] ?? emptyTotals(),
      entry.totals
    )
    s.usage.turns += 1
    // Included in `turns`, not counted beside it: the pane renders "N turns,
    // M of them subagent", and two figures that do not reconcile read as a bug.
    if (entry.subagent) s.usage.subagentTurns += 1
  }
  // A fresh object, so the renderer store's identity check and React's
  // useSyncExternalStore both see a real change. Mutating in place would make
  // the snapshot identical by reference and the pane would never repaint.
  return {
    totals: { ...s.usage.totals },
    byModel: { ...s.usage.byModel },
    turns: s.usage.turns,
    subagentTurns: s.usage.subagentTurns
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run verify:usage`
Expected: `21/21 passed`. Read checks 15–21 individually — none of them ran in Step 2.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean. `noUnusedLocals` and `noUnusedParameters` are on; prefix any intentionally-unused parameter with `_`.

- [ ] **Step 6: Commit**

```bash
git add src/main/usage-accumulator.ts scripts/verify-usage.cjs
git commit -m "$(cat <<'EOF'
feat(m17): the accumulator — offsets, carries, and the change test

The dedupe is the design, not an optimisation, and it is the rule applyEvent
and pollLive already follow: this rides a slow tick and an unconditional send
would be a message per tick per panel describing a fact that changes once per
agent turn. Its failure changes no pixel — it is heat — so check 18 is the
only thing that would ever notice it.

Check 17 is checks 2/3 driven one layer up: the parser can be perfect and the
accumulator can still discard its carry, which loses the turn just as
completely. Check 19 is the shrunk-file branch — an offset only ever advances
against a file that only ever grows, and reading from a stale one past a
truncation yields nothing with no error anywhere.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The persisted session id — schema and store

**Files:**
- Modify: `src/shared/layout-schema.ts`
- Modify: `src/main/layout-store.ts`
- Modify: `scripts/verify-layout.cjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `parseSessions(raw, warnings): Record<string, string>`; `LayoutSnapshot.sessions`; and on `LayoutStore`: `session(panelId): string | undefined`, `setSession(panelId, sessionId): void`, `dropSession(panelId): void`.

- [ ] **Step 1: Write the failing checks**

Find the last check in `scripts/verify-layout.cjs` (currently 117 assertions; the last numbered one is 108 with lettered sub-checks). Append these before the summary block, using the file's existing `ok(...)` helper and its existing store-construction helper — read the neighbouring checks 98–103b (the `baselines` block) and mirror their construction exactly, since `sessions` is deliberately the same shape:

```js
// 109. Absent warns NOTHING. Every layout.json written before M17 has no
//      sessions key, and shouting about those would make the first launch
//      after an upgrade complain about a file that is perfectly fine — the
//      line parsePresets, parsePreferences and parseBaselines all already draw.
{
  const warnings = []
  const out = S.parseSessions(undefined, warnings)
  ok('109 an absent sessions map warns nothing',
    Object.keys(out).length === 0 && warnings.length === 0,
    `warnings=${warnings.length}`)
}

// 110. Present but MALFORMED warns rather than vanishing silently. The rule
//      check 41 states for presets and 99 for baselines: a map dropped without
//      a word is every pinned panel's accounting gone with nothing said.
{
  const warnings = []
  S.parseSessions([], warnings)
  ok('110 a malformed sessions map warns', warnings.length === 1, warnings.join('; '))
}

// 111. A malformed ENTRY drops alone while its neighbour survives — the
//      individual-drop rule parseLayout obeys everywhere else. A non-string
//      session id is the reachable case: a hand-edited file, or a future
//      version writing an object here.
{
  const warnings = []
  const out = S.parseSessions({ n1: 'abc-123', n2: 42 }, warnings)
  ok('111 a malformed session entry drops alone',
    out.n1 === 'abc-123' && out.n2 === undefined && warnings.length === 1,
    JSON.stringify(out))
}

// 112. A session id survives a write and a reopen through the real coalesced
//      store. This is success criterion 2's storage half: without it a Cmd+R
//      reload re-mints, the new uuid names a transcript that does not exist,
//      and the panel's cost freezes with nothing in any log.
{
  const dir = freshDir()
  const a = makeStore(dir)
  a.setSession('n1', 'abc-123')
  a.flushSync()
  const b = makeStore(dir)
  ok('112 a session id survives a write and a reopen',
    b.session('n1') === 'abc-123', String(b.session('n1')))
}

// 113. dropSession removes it. The same recycled-id hazard dropBaseline
//      closes: a panel reusing a dead one's id must not inherit its session,
//      because --session-id naming an EXISTING session is a resume — that
//      panel would come back holding a stranger's conversation.
{
  const dir = freshDir()
  const s = makeStore(dir)
  s.setSession('n1', 'abc-123')
  s.dropSession('n1')
  s.flushSync()
  ok('113 dropSession removes the pin', makeStore(dir).session('n1') === undefined,
    String(makeStore(dir).session('n1')))
}
```

Note: `freshDir` and `makeStore` are this suite's existing helpers — read the top of the file and use whatever they are actually called there rather than inventing names.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:layout`
Expected: FAIL — `TypeError: S.parseSessions is not a function` at 109, aborting the run. 110–113 do not execute.

- [ ] **Step 3: Add `parseSessions` to `src/shared/layout-schema.ts`**

Immediately after `parseBaselines`:

```ts
/**
 * Which agent session id each panel is pinned to, keyed by PanelId.
 *
 * A sibling of `workspaces` rather than a member of one, and keyed GLOBALLY,
 * for the reason baselines is: PanelId is global (it doubles as a tmux session
 * name), and a hidden workspace's panel holds a pin exactly as the active
 * workspace's does.
 *
 * This map exists because create() runs again for EVERY panel on a Cmd+R
 * reload, and tmux's `new-session -A` reattaches without re-running the
 * command — so a re-minted uuid there would name a transcript that does not
 * exist while the real one went on growing, and the panel's cost would freeze
 * with nothing in any log. See "`reattached` costs a probe".
 */
export function parseSessions(
  raw: unknown,
  warnings: string[]
): Record<string, string> {
  // Every file written before M17 has no sessions key. Warning about those
  // would make the first launch after an upgrade shout about a file that is
  // perfectly fine — the same line parseBaselines draws one function up.
  if (raw === undefined) return {}
  if (!isRecord(raw)) {
    warnings.push('sessions was not an object; ignoring it')
    return {}
  }
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id)) {
      warnings.push(`session for ${id} has an unusable panel id; dropped`)
      continue
    }
    if (!isStr(value)) {
      warnings.push(`session for ${id} was malformed; dropped`)
      continue
    }
    out[id] = value
  }
  return out
}
```

- [ ] **Step 4: Add `sessions` to the snapshot**

In `LayoutSnapshot` (beside `baselines`, around line 214):

```ts
  /**
   * Per-panel agent session ids, keyed by PanelId. See parseSessions for why
   * this is persisted rather than re-minted at each spawn.
   */
  sessions: Record<string, string>
```

In the empty-snapshot literal (around line 250), beside `baselines: {}`:

```ts
    sessions: {},
```

In `parseLayout`'s returned object (around line 775), beside the `baselines` line:

```ts
      sessions: parseSessions(parsed.sessions, warnings),
```

- [ ] **Step 5: Add the store accessors**

In `src/main/layout-store.ts`, in the `LayoutStore` interface immediately after `baselinePeers`:

```ts
  /** The agent session id this panel is pinned to, if it has one. */
  session(panelId: string): string | undefined
  setSession(panelId: string, sessionId: string): void
  dropSession(panelId: string): void
```

In the returned object, immediately after `baselinePeers`'s implementation:

```ts
    session(panelId) {
      return snapshot.sessions[panelId]
    },
    setSession(panelId, sessionId) {
      snapshot.sessions[panelId] = sessionId
      scheduleWrite()
    },
    dropSession(panelId) {
      if (snapshot.sessions[panelId] === undefined) return
      delete snapshot.sessions[panelId]
      scheduleWrite()
    },
```

Read the neighbouring `setBaseline`/`dropBaseline` implementations first and match how they call the write scheduler — use the identical call, whatever it is named there.

- [ ] **Step 6: Run to verify it passes**

Run: `npm run verify:layout`
Expected: `122/122 passed` (117 + 5). Read 110–113 individually — none ran in Step 2.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/layout-schema.ts src/main/layout-store.ts scripts/verify-layout.cjs
git commit -m "$(cat <<'EOF'
feat(m17): persist a panel's agent session id, keyed globally

A sibling of workspaces rather than a member of one, for the reason baselines
is: PanelId is global and a hidden workspace's panel holds a pin exactly as
the active one's does.

It is persisted rather than derived or re-minted, and check 112 is the storage
half of that. create() runs again for every panel on a Cmd+R reload and tmux's
-A reattaches without re-running the command, so a re-minted uuid names a
transcript that does not exist while the real one goes on growing. Deriving it
from the panel id fails differently and worse: ids ARE recycled (onReset
installs FIRST_RUN_ID), and --session-id naming an existing session is a
resume, so that panel would come back holding a stranger's conversation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `agent` on a preset — the four hops, in two directions

**Files:**
- Modify: `src/shared/layout-schema.ts` (`Preset` + its parser)
- Modify: `src/shared/ipc-contract.ts` (`PresetTemplate`, `CapturedPanel`)
- Modify: `src/shared/types.ts` (`PanelSpec`)
- Modify: `src/main/presets.ts` (`templateOf`, `presetFromCapture`, `BUILT_IN_PRESETS`)
- Modify: `src/renderer/panels/panels.ts` (template → spec)
- Modify: `scripts/verify-layout.cjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `AgentKind = 'claude-code'` exported from `@shared/cost`; an optional `agent?: AgentKind` field present and preserved on `Preset`, `PresetTemplate`, `CapturedPanel` and `PanelSpec`.

- [ ] **Step 1: Read the four rebuild sites before writing anything**

Run:

```bash
grep -rn "args: \(preset\|template\|captured\|p\)\.args\|args," src/main/presets.ts src/renderer/panels/panels.ts | head -20
```

Every one of these rebuilds its object **field by field, never by spreading**. That is not style: spreading carries `command: undefined` across an IPC structured clone where `'command' in template` then reads `true`, which is a different fact from the key being absent, and it makes every command-less preset spawn a hardcoded shell. Adding `agent` means adding it by hand at each site, and a missed site drops it **silently** — the panel spawns, the agent runs, and it simply never gets a session id, which reads as "the cost feature does not work for this preset".

- [ ] **Step 2: Write the failing check**

Append to `scripts/verify-layout.cjs` before the summary:

```js
// 114. `agent` round-trips through a preset, and an ABSENT agent writes no key
//      at all rather than a saved absent-marker. Absent is the ordinary case —
//      a login-shell preset is not a Claude Code preset — and the `in` test is
//      deliberate: `agent: undefined` is a DIFFERENT fact from the key being
//      missing, and it is the one that survives an IPC structured clone. This
//      is check 97's rule and the absent-command rule, applied to a second
//      optional field.
{
  const warnings = []
  const out = S.parsePresets(
    [{ id: 'p1', name: 'Claude', cwd: '~', args: [], agent: 'claude-code' },
     { id: 'p2', name: 'Shell', cwd: '~', args: [] }],
    warnings)
  ok('114 agent round-trips, and absent stays absent',
    out[0].agent === 'claude-code' && !('agent' in out[1]) && warnings.length === 0,
    `${out[0].agent} / ${'agent' in out[1]}`)
}

// 115. An UNKNOWN agent value is dropped with a warning rather than carried
//      forward. Check 107's asymmetry: a value written by a version that knew
//      an adapter this one does not must not be honoured, because honouring it
//      means passing a flag to a CLI that has never heard of it — which fails
//      the spawn outright rather than merely failing to account.
{
  const warnings = []
  const out = S.parsePresets([{ id: 'p1', name: 'x', cwd: '~', args: [], agent: 'codex' }], warnings)
  ok('115 an unknown agent is dropped with a warning',
    !('agent' in out[0]) && warnings.length === 1, warnings.join('; '))
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run verify:layout`
Expected: FAIL at 114 (`out[0].agent` is `undefined`) and FAIL at 115 (no warning). Both are ordinary red checks, not throws, so both genuinely ran — record both.

- [ ] **Step 4: Add the type**

In `src/shared/cost.ts`:

```ts
/**
 * Which agent CLI a preset launches, when this app knows how to account for
 * it. Absent means "we do not account for this one", which is every login
 * shell and every preset the user wrote by hand.
 *
 * A UNION with one member rather than a boolean, so a second adapter is a new
 * member rather than a rename of every use site — and deliberately not an
 * abstraction beyond that. ideas-backlog #19's own constraint: do not build
 * the abstraction until a second CLI actually wants it.
 */
export type AgentKind = 'claude-code'

export const AGENT_KINDS: readonly AgentKind[] = ['claude-code']
```

- [ ] **Step 5: Add the field at all four sites**

In `src/shared/layout-schema.ts`, on `Preset` (line ~122):

```ts
  /** Which agent CLI this launches, when this app can account for it. */
  agent?: AgentKind
```

and import `AgentKind` and `AGENT_KINDS` from `./cost`. In `parsePresets`' per-preset rebuild, add — matching how the existing optional `w`/`h` fields are conditionally included, so an absent value writes **no key at all**:

```ts
    ...(isStr(raw.agent) && (AGENT_KINDS as readonly string[]).includes(raw.agent)
      ? { agent: raw.agent as AgentKind }
      : {}),
```

and immediately before it, the warning branch for a present-but-unknown value:

```ts
    // Present but unknown is check 107's asymmetry: it was written by a
    // version that knew an adapter this one does not, and honouring it means
    // passing a flag to a CLI that has never heard of it — which fails the
    // spawn outright rather than merely failing to account.
    if (raw.agent !== undefined && !(AGENT_KINDS as readonly string[]).includes(raw.agent as string)) {
      warnings.push(`preset ${String(raw.id)} named an unknown agent; dropped that field`)
    }
```

In `src/shared/ipc-contract.ts`, add the same optional field with a one-line comment to both `PresetTemplate` and `CapturedPanel`.

In `src/shared/types.ts`, add it to `PanelSpec`:

```ts
  /**
   * Which agent CLI this is, when this app can account for it. Main uses it to
   * decide whether to pin a session id; it never changes what gets spawned
   * beyond that one flag.
   */
  agent?: AgentKind
```

In `src/main/presets.ts`, add `agent` to the field-by-field rebuilds in `templateOf` and `presetFromCapture`, conditionally so absent stays absent, and add `agent: 'claude-code'` to the Claude entry of `BUILT_IN_PRESETS`.

In `src/renderer/panels/panels.ts`, carry it from the template into the built `PanelSpec`, conditionally, at whichever site builds a spec from a `PresetTemplate`.

- [ ] **Step 6: Run to verify it passes**

Run: `npm run verify:layout && npm run typecheck`
Expected: `124/124 passed`, typecheck clean.

- [ ] **Step 7: Prove no hop dropped it**

Run: `npm run verify:panels 2>&1 | tail -5`
Expected: still `149/149 passed`. Then confirm by hand that the field survives the whole chain:

```bash
grep -n "agent" src/main/presets.ts src/renderer/panels/panels.ts src/shared/ipc-contract.ts
```

Expected: `agent` appears in `templateOf`, in `presetFromCapture`, in `BUILT_IN_PRESETS`, in `PresetTemplate`, in `CapturedPanel`, and at the spec-building site in `panels.ts`. **Six mentions minimum.** A missing one is the silent drop this task exists to avoid.

- [ ] **Step 8: Commit**

```bash
git add src/shared/cost.ts src/shared/layout-schema.ts src/shared/ipc-contract.ts \
        src/shared/types.ts src/main/presets.ts src/renderer/panels/panels.ts \
        scripts/verify-layout.cjs
git commit -m "$(cat <<'EOF'
feat(m17): a preset declares its agent, and the field survives four hops

Declared rather than sniffed. Appending --session-id whenever argv[0] is
`claude` needs no configuration and was rejected because it silently rewrites
a command the user typed — the move resolveCommand already refuses, filling in
an ABSENT command and never editing a present one.

The field is added by hand at four sites in two directions (Preset ->
PresetTemplate -> PanelSpec on the way out, CapturedPanel -> Preset on the way
back) because every one of those hops rebuilds field by field rather than
spreading, which is the mechanism that keeps an absent command absent across a
structured clone. A missed site drops it silently: the panel spawns, the agent
runs, and it simply never gets a session id.

Check 115 is check 107's asymmetry inherited — an unknown agent is dropped
rather than honoured, because honouring it passes a flag to a CLI that has
never heard of it, which fails the spawn outright.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Pin the session id and inject the flag

**Files:**
- Modify: `src/main/pty-manager.ts`
- Modify: `src/main/index.ts`
- Modify: `scripts/verify-pty-manager.cjs`

**Interfaces:**
- Consumes: `LayoutStore.session/setSession/dropSession` (Task 4); `PanelSpec.agent` (Task 5).
- Produces: two new `PtyManager` constructor deps, `pinnedSession: (panelId) => string | undefined` and `setPinnedSession: (panelId, sessionId) => void`, both **optional and defaulted** so every existing check keeps its exact meaning.

- [ ] **Step 1: Write the failing checks**

In `scripts/verify-pty-manager.cjs`, append inside the tmux block, **before its final `shutdown()`** — and then move that `shutdown()` below your new checks, because this block must end in a definite `kill-server` and check 20's comment hands that obligation to whoever appends next. Read check 24's own closing comment first; it names you as the next inheritor.

```js
// 25. The pin is minted ONCE and REUSED on a second create at the same panel
//     id. That second create is exactly what a Cmd+R reload does for every
//     restored panel, and under tmux it REATTACHES to a session that may have
//     been working for an hour — so a re-mint there names a transcript that
//     does not exist while the real one goes on growing, and the panel's cost
//     freezes forever with nothing in any log. This is success criterion 2's
//     mechanism, and it is check 21's shape (the once-only baseline capture)
//     applied to a second thing create() must not do twice.
{
  const pins = new Map()
  const mgr = makeManager({
    pinnedSession: (id) => pins.get(id),
    setPinnedSession: (id, sid) => pins.set(id, sid)
  })
  await mgr.create(spec('p9', { agent: 'claude-code' }))
  const first = pins.get('p9')
  mgr.detachAll()
  await mgr.create(spec('p9', { agent: 'claude-code' }))
  ok(25, typeof first === 'string' && first.length > 0 && pins.get('p9') === first,
    `first=${first} second=${pins.get('p9')}`)
}

// 26. A panel whose preset declares NO agent is never pinned. The whole
//     honesty rule rests on this: a login shell must reach the PTY exactly as
//     the user wrote it, and a pin for it would also make the inspector render
//     a Cost section for a panel that can never have one.
{
  const pins = new Map()
  const mgr = makeManager({
    pinnedSession: (id) => pins.get(id),
    setPinnedSession: (id, sid) => pins.set(id, sid)
  })
  await mgr.create(spec('p10'))
  ok(26, pins.get('p10') === undefined, String(pins.get('p10')))
}

// 27. The flag actually reaches the spawn's ARGV, carrying the pinned id.
//     25 proves the id is stable and says nothing about whether it is ever
//     passed to anything — a manager that minted, stored and never spawned
//     with it satisfies 25 completely and accounts for nothing at all.
{
  const pins = new Map()
  const seen = []
  const mgr = makeManager({
    pinnedSession: (id) => pins.get(id),
    setPinnedSession: (id, sid) => pins.set(id, sid),
    onSpawnArgs: (args) => seen.push(args)
  })
  await mgr.create(spec('p11', { agent: 'claude-code' }))
  const args = seen[0] ?? []
  const i = args.indexOf('--session-id')
  ok(27, i >= 0 && args[i + 1] === pins.get('p11'),
    `args=${JSON.stringify(args)} pin=${pins.get('p11')}`)
}
```

`makeManager`, `spec` and `ok` are this suite's existing helpers — read the file's own top and its tmux block and use whatever they are actually called. `onSpawnArgs` does not exist yet; wire it in the harness's fake backend, not in production code. If the suite's fake backend cannot observe argv, add the observation there rather than adding a hook to `PtyManager`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:pty-manager`
Expected: FAIL — 25 reports `first=undefined`, since nothing mints. Note which of 26/27 ran; 26 will PASS vacuously (nothing pins anything yet), which is exactly why 27 exists.

- [ ] **Step 3: Add the constructor deps**

In `src/main/pty-manager.ts`, after `dropBaseline` in the constructor parameter list:

```ts
    /**
     * The stored agent session id for this panel, if it has one.
     *
     * OPTIONAL and defaulted, the trade captureBaseline/dropBaseline already
     * make: every fixture in the verify suites constructs a manager without
     * these, and a required dep would change what a dozen existing checks
     * assert while looking like a widening.
     */
    private readonly pinnedSession: (panelId: PanelId) => string | undefined = () => undefined,
    private readonly setPinnedSession: (panelId: PanelId, sessionId: string) => void = () => {}
```

- [ ] **Step 4: Mint and inject in `create()`**

In `create()`, immediately after the `const command = resolveCommand(spec, loginEnv)` line:

```ts
    // Pin an agent session id, and pass it as a flag so the transcript this
    // panel writes is one we can find later.
    //
    // Read-then-mint, never mint: this function runs again for EVERY panel on
    // a Cmd+R reload, and under tmux `new-session -A` reattaches rather than
    // creating — the command is not re-run and the agent keeps the id it was
    // given. A fresh uuid on that second call would name a transcript that
    // does not exist while the real one went on growing, and the panel's cost
    // would freeze at whatever it was before the reload with nothing in any
    // log. Same shape as captureBaseline's guard twenty lines up, and the same
    // shape as `reattached` needing its probe BEFORE the spawn.
    //
    // Gated on spec.agent, never on the resolved command: appending a flag to
    // a command the user typed is the move resolveCommand deliberately refuses.
    let args = spec.args
    if (spec.agent === 'claude-code') {
      let sessionId = this.pinnedSession(spec.panelId)
      if (sessionId === undefined) {
        sessionId = randomUUID()
        this.setPinnedSession(spec.panelId, sessionId)
      }
      // Only when the user has not already said otherwise. A preset whose args
      // carry their own --session-id is the user being explicit, and a second
      // one would make the CLI reject the invocation outright.
      if (!args.includes('--session-id')) {
        args = [...args, '--session-id', sessionId]
      }
    }
```

Import `randomUUID` from `node:crypto` at the top of the file.

Then pass the effective args to the backend. `SessionBackend.spawn` reads `spec.args`, so hand it a spec carrying them — rebuilt field by field is unnecessary here because this object never crosses an IPC boundary, but keep it explicit:

```ts
    const proc = this.getBackend().spawn({ ...spec, args }, command, cwd, env)
```

- [ ] **Step 5: Drop the pin on `kill()`**

In `kill()`, beside each existing `this.dropBaseline(panelId)` call — there are two, on both branches — add:

```ts
      this.dropPinnedSession(panelId)
```

and add the third optional dep:

```ts
    /**
     * Drop the pin, beside dropBaseline and for its reason: the map must not
     * grow for the life of the install, and a recycled panel id must not
     * inherit a dead panel's session — `--session-id` naming an EXISTING
     * session is a RESUME, so that panel would come back holding a stranger's
     * conversation.
     */
    private readonly dropPinnedSession: (panelId: PanelId) => void = () => {}
```

**`detachAll()` must NOT drop it.** That is the reload path, where the tmux session survives and the agent keeps its id — dropping there re-mints on the next create and reintroduces exactly the bug check 25 exists against. This is the mirror image of `lastLive`, which `detachAll()` *must* clear; the two are opposite for opposite reasons, and both reasons belong in a comment beside them.

- [ ] **Step 6: Wire the store in `src/main/index.ts`**

At the `new PtyManager(...)` construction, pass three more arguments after the existing baseline ones:

```ts
  (panelId) => layoutStore.session(panelId),
  (panelId, sessionId) => layoutStore.setSession(panelId, sessionId),
  (panelId) => layoutStore.dropSession(panelId)
```

- [ ] **Step 7: Run to verify it passes**

Run: `npm run verify:pty-manager`
Expected: `33/33 passed` (30 + 3). Confirm 27 specifically — it is the only check proving the flag reaches argv.

- [ ] **Step 8: Full chain and commit**

```bash
npm run verify
git add src/main/pty-manager.ts src/main/index.ts scripts/verify-pty-manager.cjs
git commit -m "$(cat <<'EOF'
feat(m17): pin an agent session id at spawn, read-then-mint

Read-then-mint, never mint. create() runs again for every panel on a Cmd+R
reload and tmux's -A reattaches without re-running the command, so a fresh
uuid on that second call names a transcript that does not exist while the real
one goes on growing — the panel's cost frozen forever with nothing in any log.
Check 25 is that, and it is check 21's once-only-capture shape applied to a
second thing create() must not do twice.

detachAll() deliberately does NOT drop the pin, which is the exact mirror of
lastLive, which it must clear: there the tmux session survives and the local
value is stale, here the tmux session survives and the pin is still correct.

Check 27 is the one that stops 25 being vacuous: a manager that minted, stored
and never spawned with the flag satisfies 25 completely and accounts for
nothing at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The transcript reader and the third tick

**Files:**
- Create: `src/main/transcript-reader.ts`
- Modify: `src/main/pty-manager.ts`
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/preload/index.ts`
- Modify: `README.md`
- Modify: `scripts/verify-pty-manager.cjs`

**Interfaces:**
- Consumes: `createUsageState`, `applyChunk`, `resetIfShrunk`, `dropUsage`, `offsetFor` (Task 3); the pin (Task 6).
- Produces: `resolveTranscript(sessionId): string | undefined` and `readFrom(path, offset): { text: string, size: number } | undefined` from `main/transcript-reader`; the `usage:panel` event carrying `{ panelId, usage }`.

- [ ] **Step 1: Write `src/main/transcript-reader.ts`**

This file has no pure-tier check by design — it is the thin real-`fs` half, the same position `git-runner.ts` holds. Its correctness is covered end to end by Task 10.

```ts
import { readdirSync, openSync, readSync, closeSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Where Claude Code keeps its session transcripts. Another program's
 * directory, so everything here treats it as untrusted and absent-by-default:
 * a missing directory is the empty answer, never an error.
 */
const PROJECTS_DIR = join(homedir(), '.claude', 'projects')

/**
 * The transcript for this session id, by GLOBBING for the filename rather
 * than rebuilding the path from a cwd.
 *
 * The filename IS the session id and a session id is unique, so this needs no
 * knowledge of Claude Code's directory-slug rule — an undocumented detail of
 * another program that can change in a release with nothing here to notice.
 * It is also immune to a panel that `cd`s: the transcript stays where it was
 * created, so a cwd-derived path would go stale exactly as ideas-backlog #41
 * describes, in a milestone that is not about cwd at all.
 *
 * Undefined is the ORDINARY answer for the first seconds of every pinned
 * panel — the agent has started and not yet written — and the caller retries.
 */
export function resolveTranscript(sessionId: string): string | undefined {
  const name = `${sessionId}.jsonl`
  let dirs: string[]
  try {
    dirs = readdirSync(PROJECTS_DIR)
  } catch {
    return undefined
  }
  for (const dir of dirs) {
    const candidate = join(PROJECTS_DIR, dir, name)
    try {
      statSync(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * The bytes appended since `offset`, and the file's size now.
 *
 * The size is returned alongside so the caller can notice a file that SHRANK,
 * which means it was truncated or replaced and the stored offset points past
 * its end — reading from there yields garbage or nothing at all, with no error.
 *
 * Reads only the delta. The file is append-only and unbounded (a real session
 * measured 262 lines), so re-reading it per tick is quadratic in session
 * length, on the main thread, for a number that changes once per agent turn.
 */
export function readFrom(
  path: string,
  offset: number
): { text: string; size: number } | undefined {
  let fd: number | undefined
  try {
    const size = statSync(path).size
    if (size <= offset) return { text: '', size }
    fd = openSync(path, 'r')
    const length = size - offset
    const buffer = Buffer.allocUnsafe(length)
    const read = readSync(fd, buffer, 0, length, offset)
    return { text: buffer.subarray(0, read).toString('utf8'), size }
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
```

- [ ] **Step 2: Add the channel**

In `src/shared/ipc-contract.ts`, at the end of `IPC_EVENTS` after `SESSION_LIVE`:

```ts
  ,
  /**
   * What a panel's agent has spent, pushed when it CHANGES.
   *
   * An IPC_EVENTS member and not an IPC one, which decides a number:
   * verify:ipc asserts over Object.values(IPC) — invoke channels, each needing
   * an ipcMain.handle — and is unmoved by this. M6d and M12 both hit this same
   * boundary and both recorded the count staying put; an earlier draft of one
   * of those specs said otherwise and would have failed the suite by "fixing"
   * a correct number.
   *
   * Deduped in main for the reason AGENT_STATE and SESSION_LIVE are: this
   * rides a slow tick and an unconditional send would be a message per tick
   * per panel describing a fact that changes once per agent turn.
   */
  USAGE_PANEL: 'usage:panel'
```

Add to the bridge type, beside `onLiveSession`:

```ts
    /** What this panel's agent has spent. Fires only on a change. */
    onUsage(listener: (payload: { panelId: PanelId; usage: PanelUsage }) => void): () => void
```

Expose it in `src/preload/index.ts` mirroring the neighbouring `onLiveSession` exactly, **returning its own unsubscribe** so React effects do not stack listeners.

- [ ] **Step 3: Add the channel to the README diagram**

`verify:meta` 14 parses channels out of `ipc-contract.ts` and requires each to appear **inside the fenced block containing `--invoke-->`**. Add, beside the `session:live` line:

```
main     --send-->   usage:panel                                    --> renderer
```

- [ ] **Step 4: Write the failing check**

In `scripts/verify-pty-manager.cjs`, append inside the tmux block before its final `shutdown()`, then move that `shutdown()` below it — you inherit check 25's obligation exactly as it inherited 24's:

```js
// 28. The usage tick DEDUPES. Its failure changes no pixel — it is heat — so
//     this counts MESSAGES rather than reading a value, exactly as check 23
//     does for session:live. The WINDOW is what makes the count mean anything
//     and a future editor must not shrink it: an implementation with no dedupe
//     emits once per USAGE_TICK_MS, so a sample spanning a single tick sees one
//     message either way and stays green against the defect. This waits three
//     ticks over a transcript that does not change.
{
  const sent = []
  const pins = new Map()
  const mgr = makeManager({
    send: (channel, payload) => { if (channel === 'usage:panel') sent.push(payload) },
    pinnedSession: (id) => pins.get(id),
    setPinnedSession: (id, sid) => pins.set(id, sid)
  })
  await mgr.create(spec('p12', { agent: 'claude-code' }))
  await sleep(7000)
  ok(28, sent.filter((p) => p.panelId === 'p12').length === 0,
    `messages=${sent.length}`)
}
```

Note what 28 actually asserts: this panel's agent is a fixture shell, not a real `claude`, so **no transcript is ever written** and the correct number of messages is zero. That makes it a check about the tick not inventing traffic — real accumulation is Task 10's job, end to end, against a transcript the harness writes itself. Say so in the check's own comment; a later reader must not mistake a green 28 for proof that anything is counted.

- [ ] **Step 5: Add the tick to `PtyManager`**

Constant, beside `LIVE_TICK_MS`:

```ts
/**
 * How often to re-read pinned transcripts.
 *
 * A THIRD timer, not a merge into either existing one, and the reason is
 * asymmetric. IDLE_TICK_MS is 500 and is the RESOLUTION of M6c's idleness
 * threshold — folding a file read onto it would put disk IO on the 500ms path
 * for a number that changes once per agent turn, and folding this onto the
 * idle tick's period would make idleness detection four times coarser
 * silently, while agent.idleAfterMs went on reading whatever the user set.
 * LIVE_TICK_MS is 2000 and is a tmux subprocess; this is a file read; they are
 * unrelated cadences that would be coupled by a merge for no benefit.
 */
const USAGE_TICK_MS = 2000
```

State, beside `lastLive`:

```ts
  /** One per manager, like idleTimer and liveTimer. See USAGE_TICK_MS. */
  private usageTimer: ReturnType<typeof setInterval> | null = null
  private usageState = createUsageState()
  /** Resolved transcript paths, cached: the glob runs once per session. */
  private transcriptPaths = new Map<PanelId, string>()
```

Arm it in `create()` beside `this.startLiveTick()`, tear it down at every site that empties the map (mirror `stopLiveTick`'s call sites exactly), and `unref()` it.

The poll:

```ts
  /**
   * Re-read each pinned panel's transcript from where we left off.
   *
   * Only panels this manager is holding AND that carry a pin, the same
   * narrowing pollLive makes: a panel with no pin has no transcript, and a
   * panel not in the map belongs to nothing subscribed.
   */
  private pollUsage(): void {
    for (const panelId of this.sessions.keys()) {
      const sessionId = this.pinnedSession(panelId)
      if (sessionId === undefined) continue
      let path = this.transcriptPaths.get(panelId)
      if (path === undefined) {
        // Undefined here is the ORDINARY state for the first seconds of every
        // pinned panel — the agent has started and not yet answered — so this
        // is a retry, not a failure.
        path = this.deps.resolveTranscript(sessionId)
        if (path === undefined) continue
        this.transcriptPaths.set(panelId, path)
      }
      const read = this.deps.readFrom(path, offsetFor(this.usageState, panelId))
      if (read === undefined) continue
      resetIfShrunk(this.usageState, panelId, read.size)
      const usage = applyChunk(this.usageState, panelId, read.text, read.size)
      // undefined means nothing changed. That dedupe IS the throttle; see
      // applyChunk's own comment and verify:usage 18.
      if (usage === undefined) continue
      this.send(IPC_EVENTS.USAGE_PANEL, { panelId, usage })
    }
  }
```

`resolveTranscript` and `readFrom` reach it as **injected deps with real-`fs` defaults**, so a harness can substitute them — the trade `review-engine.ts` makes with `GitRunner`. Add them to the constructor alongside the pin deps, defaulted to the real implementations imported from `transcript-reader.ts`.

In `kill()`, beside `this.dropPinnedSession(panelId)`:

```ts
      dropUsage(this.usageState, panelId)
      this.transcriptPaths.delete(panelId)
```

**`detachAll()` clears `transcriptPaths` but NOT `usageState`.** The reload path: the agent kept running and its transcript kept growing, so the accumulated totals and the byte offset are still correct and re-reading from zero would double-count every turn. The cached PATH is dropped only because it is cheap to re-resolve and a stale one is the one thing here that could be wrong. Both halves need the comment.

- [ ] **Step 6: Run to verify it passes**

Run: `npm run verify:pty-manager && npm run verify:ipc && npm run verify:meta`
Expected: `34/34`, `1/1` (**unchanged** — the channel count must not move), `19/19`.

- [ ] **Step 7: Commit**

```bash
npm run typecheck
git add src/main/transcript-reader.ts src/main/pty-manager.ts \
        src/shared/ipc-contract.ts src/preload/index.ts README.md \
        scripts/verify-pty-manager.cjs
git commit -m "$(cat <<'EOF'
feat(m17): read pinned transcripts on a third tick, deduped

The path is GLOBBED by session id rather than rebuilt from a cwd. The filename
is the session id and a session id is unique, so this needs no knowledge of
Claude Code's directory-slug rule — an undocumented detail of another program
— and it cannot go stale when a panel cds, which a cwd-derived path would, per
ideas-backlog #41, in a milestone that is not about cwd.

A third timer, not a merge. IDLE_TICK_MS is the RESOLUTION of M6c's idleness
threshold, so folding this onto it makes idleness detection four times coarser
silently while agent.idleAfterMs goes on reading whatever the user set.

detachAll() clears the cached path and deliberately NOT the totals or the
offset: the agent kept running across the reload and its transcript kept
growing, so re-reading from zero would double-count every turn.

verify:ipc stays at 1/1: usage:panel is an IPC_EVENTS send, handled by nobody
and counted by nothing. M6d and M12 both recorded this same boundary.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The renderer store and the one subscription

**Files:**
- Create: `src/renderer/session/usage-store.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`

**Interfaces:**
- Consumes: the `usage:panel` event (Task 7); `PanelUsage` from `@shared/cost`.
- Produces: `applyUsage(panelId, usage)`, `clearUsage(panelId)`, `getUsage(panelId)`, `useUsage(panelId)` from `renderer/session/usage-store`.

- [ ] **Step 1: Write `src/renderer/session/usage-store.ts`**

Mirror `live-session-store.ts` exactly — read it first and keep its structure.

```ts
import { useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'
import type { PanelUsage } from '@shared/cost'

/**
 * What each panel's agent has spent, as told by main.
 *
 * A FOURTH module-level store beside agent-state-store.ts, live-session-store.ts
 * and the link store, and subscribed the same way: PER PANEL ID. This must
 * never bump registry.version() — that counter deliberately moves only on
 * tier/status/focus/exit so a chatty agent cannot re-render the canvas at
 * 60Hz, and a fact that changes on every agent TURN riding it would put that
 * traffic straight back, for every panel, on every OTHER panel's turn. This is
 * the fourth entry to record that rule; each of the previous three found it
 * independently.
 *
 * A CACHE of main's answer, never a second author of it. Nothing here counts
 * anything; main reads the transcript and this holds what arrived.
 */

const usage = new Map<PanelId, PanelUsage>()
const listeners = new Map<PanelId, Set<() => void>>()

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (!set) return
  for (const listener of set) listener()
}

/**
 * Called by the one IPC subscription in Canvas.tsx.
 *
 * No equality check, unlike applyLiveSession's: main already sends only on a
 * change, and usage is a monotonically growing object whose every arrival IS a
 * change. A deep compare here would cost more than the re-render it saves.
 * The object is REPLACED rather than mutated, which is what lets the hook hand
 * React a stable reference between arrivals.
 */
export function applyUsage(panelId: PanelId, next: PanelUsage): void {
  usage.set(panelId, next)
  notify(panelId)
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Without
 * this the map grows for the life of the renderer and a recycled panel id
 * inherits a dead panel's spend — the same reason clearAgentState and
 * clearLiveSession exist.
 */
export function clearUsage(panelId: PanelId): void {
  if (!usage.has(panelId)) return
  usage.delete(panelId)
  notify(panelId)
}

/** A plain read, for callers that want the answer at call time. */
export function getUsage(panelId: PanelId): PanelUsage | undefined {
  return usage.get(panelId)
}

function subscribe(panelId: PanelId, listener: () => void): () => void {
  let set = listeners.get(panelId)
  if (!set) {
    set = new Set()
    listeners.set(panelId, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(panelId)
  }
}

/**
 * The snapshot is the STORED object, never one built per call.
 * useSyncExternalStore compares snapshots by identity, so returning a fresh
 * object each time makes React see a new value every render and loop — the
 * same trap attentionSnapshot and useLiveSession both exist for.
 */
export function useUsage(panelId: PanelId): PanelUsage | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => usage.get(panelId),
    () => usage.get(panelId)
  )
}
```

- [ ] **Step 2: Subscribe once in `Canvas.tsx`**

Find the existing `onLiveSession` subscription effect and add a sibling, in the same effect or immediately beside it, following its exact cleanup shape:

```tsx
  useEffect(() => {
    return window.canvas.session.onUsage(({ panelId, usage }) => {
      applyUsage(panelId, usage)
    })
  }, [])
```

**One canvas-wide subscription, never one per panel** — the rule the `Cmd+C`/`Cmd+V` subscription and the agent-state one both follow: a per-panel subscription means every panel but one receives and discards each message.

- [ ] **Step 3: Clear on every dispose site**

`clearUsage(id)` must be called wherever `clearAgentState(id)` and `clearLiveSession(id)` already are. Find them:

```bash
grep -n "clearLiveSession" src/renderer/canvas/Canvas.tsx
```

Add a `clearUsage` call beside **every** one. A missed site is the recycled-id hazard: a new panel inheriting a dead one's spend, which looks like a working feature reporting a wrong number.

- [ ] **Step 4: Typecheck, build, and confirm nothing regressed**

```bash
npm run typecheck && npm run build && npm run verify:panels 2>&1 | tail -3
```
Expected: clean, and `149/149 passed` — nothing renders usage yet, so this task must move no existing check.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/session/usage-store.ts src/renderer/canvas/Canvas.tsx
git commit -m "$(cat <<'EOF'
feat(m17): the renderer usage store, one canvas-wide subscription

A fourth module-level store subscribed per panel id, and the fourth to record
the same rule: it must never bump registry.version(). That counter moves only
on tier/status/focus/exit so a chatty agent cannot re-render the canvas at
60Hz, and a fact that changes on every agent TURN riding it would put that
traffic straight back, for every panel, on every other panel's turn.

One subscription in Canvas, never one per panel — the rule the clipboard and
agent-state subscriptions already follow, since a per-panel one means every
panel but one receives and discards each message.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The inspector Cost section

**Files:**
- Modify: `src/renderer/shell/inspector-fields.ts`
- Modify: `src/renderer/shell/Inspector.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `scripts/verify-rail.cjs`

**Interfaces:**
- Consumes: `PanelUsage` from `@shared/cost` (Task 1), and `costOf` from `@shared/pricing`. **Note the path**: Step 3 of this task moves the price table from `src/main/pricing.ts` to `src/shared/pricing.ts`, because the inspector prices its own totals and the renderer must never import from `src/main`. `src/main/pricing.ts` becomes a one-line re-export, so Task 2's checks and `usage-entry.cjs` keep working unchanged.
- Produces: `UsageFieldModel`, `buildUsageFields(usage, pinned)` from `inspector-fields`; `usage` on `InspectorModel`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-rail.cjs` before the summary. The current last check is 75.

```js
// 76. THREE states, not two, and the pane must not collapse them. No pin
//     renders NOTHING (a login shell can never have a cost, and "$0.00"
//     beside it is a confident wrong answer); pinned-but-nothing-yet renders
//     a NOTE (true for the first seconds of every panel, and an empty section
//     there reads as broken); totals render figures. This is M9a's
//     not-a-repo / never-started distinction, in a second section.
{
  const none = R.buildUsageFields(undefined, false)
  const waiting = R.buildUsageFields(undefined, true)
  const totals = R.buildUsageFields(
    { totals: { input: 2, output: 1095, cacheWrite: 1491, cacheRead: 120118 },
      byModel: { 'claude-opus-5': { input: 2, output: 1095, cacheWrite: 1491, cacheRead: 120118 } },
      turns: 3, subagentTurns: 1 }, true)
  ok(76, none.hidden === true
      && waiting.hidden === false && waiting.note !== undefined && waiting.rows.length === 0
      && totals.hidden === false && totals.note === undefined && totals.rows.length > 0,
    `none=${none.hidden} waiting=${waiting.note} totals=${totals.rows.length}`)
}

// 77. The four classes render as FOUR figures, not one sum. The pane's whole
//     job here is to let the user see what the number is made of — "the
//     inspector shows the links, not the answer" applied to a third pair —
//     and a single "121,613 tokens" row is unanswerable when the user asks
//     why it is so large.
{
  const m = R.buildUsageFields(
    { totals: { input: 2, output: 1095, cacheWrite: 1491, cacheRead: 120118 },
      byModel: { 'claude-opus-5': { input: 2, output: 1095, cacheWrite: 1491, cacheRead: 120118 } },
      turns: 1, subagentTurns: 0 }, true)
  const labels = m.rows.map((r) => r.label).join('|')
  ok(77, ['input', 'output', 'cache write', 'cache read'].every((l) => labels.includes(l)),
    labels)
}

// 78. The dollar figure is LABELLED and never bare. A Max or Pro subscriber
//     is charged nothing per token, so an unlabelled figure states as fact a
//     number that is wrong for a large share of the people reading it.
{
  const m = R.buildUsageFields(
    { totals: { input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0 },
      byModel: { 'claude-opus-5': { input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0 } },
      turns: 1, subagentTurns: 0 }, true)
  ok(78, typeof m.cost === 'number' && /list price/i.test(m.costLabel ?? ''),
    `${m.cost} / ${m.costLabel}`)
}

// 79. An UNPRICED model yields tokens and NO dollar figure — check 11's rule
//     reaching the pane. A zero here renders "$0.00" beside a visibly working
//     agent, which is the one thing this section must never say.
{
  const m = R.buildUsageFields(
    { totals: { input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0 },
      byModel: { 'model-from-next-year': { input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0 } },
      turns: 1, subagentTurns: 0 }, true)
  ok(79, m.cost === undefined && m.rows.length > 0, `cost=${m.cost} rows=${m.rows.length}`)
}

// 80. Subagent turns are reported SEPARATELY. They are in the same transcript
//     and they spend real money, so they count — but a panel that is large
//     because it dispatched twelve subagents is a different situation from
//     one the user talked to for an hour, and the pane has to say which.
{
  const m = R.buildUsageFields(
    { totals: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 },
      byModel: { 'claude-opus-5': { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 } },
      turns: 5, subagentTurns: 2 }, true)
  ok(80, m.turns === 5 && m.subagentTurns === 2, `${m.turns}/${m.subagentTurns}`)
}

// 81. inspectorSignature MOVES on a usage change and stays byte-identical on
//     a rect change. THE check for this milestone's 60Hz defence: Canvas
//     freezes the model on that signature, so a live value it does not cover
//     renders once and never updates again — stuck at whatever it was when
//     the panel was selected, with nothing throwing. M12's check 63 exactly,
//     and usage is the newest field and so the easiest to leave uncovered.
{
  const p = panel('n1')
  const u1 = { totals: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 },
               byModel: {}, turns: 1, subagentTurns: 0 }
  const u2 = { totals: { input: 2, output: 2, cacheWrite: 0, cacheRead: 0 },
               byModel: {}, turns: 2, subagentTurns: 0 }
  const a = R.inspectorSignature(R.buildInspectorModel(p, undefined, undefined, [], u1))
  const b = R.inspectorSignature(R.buildInspectorModel(p, undefined, undefined, [], u2))
  const moved = R.inspectorSignature(R.buildInspectorModel(
    { ...p, rect: { ...p.rect, x: 999 } }, undefined, undefined, [], u1))
  ok(81, a !== b && a === moved, `usageMoved=${a !== b} rectStable=${a === moved}`)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:rail`
Expected: FAIL — `TypeError: R.buildUsageFields is not a function` at 76, aborting. 77–81 do not execute.

- [ ] **Step 3: Move pricing to `shared`**

The renderer must not import from `src/main`. Move `src/main/pricing.ts` verbatim to `src/shared/pricing.ts`, changing only its import (`from './cost'`). Replace `src/main/pricing.ts` with:

```ts
/**
 * Re-export, so main-side callers and scripts/usage-entry.cjs keep their
 * import path. The table lives in shared because the INSPECTOR prices its own
 * totals, and the renderer must never import from src/main.
 */
export { costOf, MODEL_RATES, type ModelRates } from '../shared/pricing'
```

Run `npm run verify:usage` — expected still `21/21`, unchanged.

- [ ] **Step 4: Write `buildUsageFields`**

In `src/renderer/shell/inspector-fields.ts`:

```ts
export interface UsageRow {
  label: string
  tokens: number
}

export interface UsageFieldModel {
  /** True when the section renders nothing at all. */
  hidden: boolean
  /** Rendered instead of rows when there is a reason to explain. */
  note?: string
  rows: UsageRow[]
  turns: number
  subagentTurns: number
  /** List-price dollars, or undefined when no model here is priced. */
  cost?: number
  /** Always set when `cost` is, and always says whose price it is. */
  costLabel?: string
}

/**
 * The Cost section.
 *
 * THREE states, and collapsing any two is a wrong answer rather than a
 * simplification. `pinned === false` is a panel whose preset declared no agent
 * — a login shell, most panels — and it renders NOTHING: "$0.00" beside a
 * working agent is the confident wrong answer M9a's not-a-repo arm exists to
 * refuse, and it trains the user to disbelieve the section. `pinned === true`
 * with no usage yet is the first seconds of every pinned panel and renders a
 * NOTE, because a heading with an empty body reads as broken.
 *
 * Four figures, never one sum: "the inspector shows the links, not the answer"
 * applied to a third pair. A single total is unanswerable when the user asks
 * why it is large, and cache reads are usually most of it.
 */
export function buildUsageFields(
  usage: PanelUsage | undefined,
  pinned: boolean
): UsageFieldModel {
  if (!pinned) return { hidden: true, rows: [], turns: 0, subagentTurns: 0 }
  if (!usage || usage.turns === 0) {
    return {
      hidden: false,
      note: 'no answer from this agent yet',
      rows: [],
      turns: 0,
      subagentTurns: 0
    }
  }
  const rows: UsageRow[] = [
    { label: 'input', tokens: usage.totals.input },
    { label: 'output', tokens: usage.totals.output },
    { label: 'cache write', tokens: usage.totals.cacheWrite },
    { label: 'cache read', tokens: usage.totals.cacheRead }
  ]
  // Priced PER MODEL and summed, never by pricing the flat total against one
  // model: a session that changed model mid-way cannot be priced from a flat
  // total at all. A model the table does not know contributes nothing and
  // makes the whole figure undefined — a partial sum presented as a total is
  // worse than no figure, because it is plausible.
  let cost: number | undefined = 0
  for (const [model, totals] of Object.entries(usage.byModel)) {
    const c = costOf(totals, model)
    if (c === undefined) {
      cost = undefined
      break
    }
    cost += c
  }
  return {
    hidden: false,
    rows,
    turns: usage.turns,
    subagentTurns: usage.subagentTurns,
    ...(cost !== undefined
      ? { cost, costLabel: 'API list price — not what a subscription is charged' }
      : {})
  }
}
```

Import `costOf` from `@shared/pricing` and `PanelUsage` from `@shared/cost`.

- [ ] **Step 5: Put `usage` on `InspectorModel`**

Add a fifth optional parameter to `buildInspectorModel`, following the exact convention of `live` and `panels`:

```ts
  /**
   * What this panel's agent has spent, when it is pinned and anything is
   * known.
   *
   * OPTIONAL and defaulted, so every pre-M17 caller and every pre-M17 check
   * keeps its exact meaning — the trade `live` made in M12, `panels` made in
   * M13 and review-engine.ts's `notARepo` made in M9a.
   */
  usage?: PanelUsage | undefined
```

Add `usage: UsageFieldModel` to `InspectorModel` and build it in the terminal-panel branch. **It is part of the model, so `inspectorSignature` — `JSON.stringify` over the whole model — covers it with no edit**, exactly as `links` does. Check 81 pins it anyway, because "covered for free today" is not the same as "covered".

For the **review-node** branch, `usage` is `{ hidden: true, rows: [], turns: 0, subagentTurns: 0 }`: a node has no process, so it can have no spend, and the section must not render for it.

`pinned` reaches the builder from the panel's own spec — `isTerminalPanel(panel) && panel.spec.agent !== undefined`.

- [ ] **Step 6: Render it in `Inspector.tsx` and wire `Canvas.tsx`**

In `Inspector.tsx`, add a `Cost` section beside the Changes one, returning `null` when `model.usage.hidden`. Render the note when present, otherwise the four rows, the turn counts (`"5 turns, 2 by subagents"` — omit the second clause when `subagentTurns` is 0), and the dollar figure with `costLabel` as its `title` attribute and a visible suffix. Follow the Changes section's markup and class-naming conventions exactly.

In `Canvas.tsx`, pass `useUsage(selectedId)`'s value as `buildInspectorModel`'s fifth argument.

In `styles.css`, style it using **only existing tokens** — `verify:styles` check 1 fails on any hardcoded colour outside a theme block, check 4 on any font-size literal, check 6 on any spacing literal.

- [ ] **Step 7: Run everything**

```bash
npm run verify:rail && npm run verify:styles && npm run typecheck && npm run build
```
Expected: `84/84` rail (79 + 5 new... confirm the actual number and use it), `11/11` styles, clean typecheck and build. Read checks 77–81 individually; none ran in Step 2.

- [ ] **Step 8: Commit**

```bash
git add src/shared/pricing.ts src/main/pricing.ts src/renderer/shell/inspector-fields.ts \
        src/renderer/shell/Inspector.tsx src/renderer/canvas/Canvas.tsx \
        src/renderer/styles.css scripts/verify-rail.cjs
git commit -m "$(cat <<'EOF'
feat(m17): the inspector Cost section — three states, four figures

Three states and collapsing any two is a wrong answer. No pin renders nothing,
because "$0.00" beside a working agent is the confident wrong answer M9a's
not-a-repo arm refuses and it trains the user to disbelieve the section;
pinned-with-nothing-yet renders a note, because a heading with an empty body
reads as broken and that is the first seconds of every pinned panel.

Four figures, never one sum — "the inspector shows the links, not the answer"
applied to a third pair. A single total is unanswerable when the user asks why
it is large, and cache reads are usually most of it.

Check 81 is this milestone's 60Hz defence and the likeliest regression in it:
Canvas freezes the model on inspectorSignature, so a live value the signature
does not cover renders once and never updates again. usage rides in the model
so JSON.stringify covers it for free, exactly as links does — the check exists
because "covered for free today" is not "covered".

Pricing moved to shared: the renderer prices its own totals and must never
import from src/main. src/main/pricing.ts is now a re-export so the suite and
the bundle entry are unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: End to end in a real renderer

**Files:**
- Modify: `scripts/verify-panels.cjs`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs` after the M11 block. The current last numbered check is 124.

The harness is its own Electron entry point, so it constructs `PtyManager` itself. **Substitute the two transcript deps** rather than writing into the real `~/.claude/projects` — the rule the git fence and the prompt fence both already obey: a suite must never read or write state the repo does not own.

```js
// 125. The number reaches the pane, end to end. The FIRST thing to exercise
//      the pin, the tick, the reader, the store and the section together:
//      verify:rail 76-80 prove the MODEL and nothing between that builder and
//      a painted pane is covered by them — the hook could read the wrong id,
//      the subscription could be missing, the store could be empty.
//
//      The transcript is SYNTHESISED by the harness and reached through
//      substituted deps, never through the real ~/.claude/projects: the rule
//      the git fence and the prompt fence both obey, since a suite must not
//      read state this repo does not own, and on a developer's machine that
//      directory holds their actual work.
//
//      It WAITS on the value rather than sleeping: a fixed sleep against a 2s
//      poll is a flake, not a bound.
{
  const file = join(fixtureDir, 'sess.jsonl')
  writeFileSync(file, assistantRecord({ output: 1095 }) + '\n')
  // spawn a panel whose preset declares agent: 'claude-code'
  const id = await spawnAgentPanel(wc)
  await selectPanelViaRailRow(wc, id)
  const shown = await waitUntil(wc, `
    (() => {
      const el = document.querySelector('[data-usage-output]')
      return el ? el.textContent : null
    })()
  `)
  ok('125 the panel\'s token total reaches the inspector',
    shown !== null && /1,?095/.test(shown), String(shown))
}

// 126. The total GROWS as the agent works, which is what makes this a live
//      readout rather than a one-shot read. The discriminating half: an
//      implementation that read the file once at spawn and cached it satisfies
//      125 completely and is not the feature.
{
  appendFileSync(file, assistantRecord({ output: 5 }) + '\n')
  const grown = await waitUntil(wc, `
    (() => {
      const el = document.querySelector('[data-usage-output]')
      return el && /1,?100/.test(el.textContent) ? el.textContent : null
    })()
  `)
  ok('126 the total grows as the transcript grows', grown !== null, String(grown))
}

// 127. A panel with NO pin renders NO Cost section — not an empty one, and
//      not "$0.00". Asserted as the element being ABSENT rather than as empty
//      text, because an empty-but-present section is a visible blank gap in a
//      260px pane. Deliberately weak on its own: it passes vacuously before
//      the section exists at all, so it is only evidence once 125 has been
//      watched red first.
//
//      It waits for the SELECTION to land before reading, for check 100b's
//      reason: the outgoing panel's section is still on screen for a moment
//      after the click, and a bare read catches that stale state and fails for
//      a reason that has nothing to do with this panel's own answer.
{
  const plain = await spawnShellPanel(wc)
  await selectPanelViaRailRow(wc, plain)
  const state = await read(wc, `
    (() => ({
      selected: (document.querySelector('.panel--selected') || {}).dataset?.panelId,
      section: !!document.querySelector('[data-usage-section]')
    }))()
  `)
  ok('127 an unpinned panel renders no Cost section at all',
    state.selected === plain && state.section === false, JSON.stringify(state))
}
```

`fixtureDir`, `waitUntil`, `read`, `selectPanelViaRailRow` and the panel-spawning helpers are this suite's own — read the neighbouring M9a checks 99–101 and the M12 checks 116–117 and reuse whatever they are actually called. `assistantRecord` is a new local helper; write it beside the other fixture builders, producing the same record shape `verify:usage`'s `rec()` does.

`selectPanelViaRailRow` **must** be a rail-row click, not a coordinate click: cascaded spawns overlap and selecting one raises it, so a click aimed at the second panel lands on the first — check 100b's own recorded lesson.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build && npm run verify:panels 2>&1 | tail -20`
Expected: 125 and 126 FAIL (no `[data-usage-output]` element). 127 will PASS vacuously — note that, and do not count it as evidence until 125 is green.

- [ ] **Step 3: Add the data attributes**

In `Inspector.tsx`, add `data-usage-section` to the section root and `data-usage-output` to the output-tokens figure. These are production markup, the same way `.panel--selected` and `[data-review-summary]` are — not test hooks.

- [ ] **Step 4: Substitute the transcript deps in the harness**

In `scripts/panels-entry.cjs`, where `PtyManager` is constructed, pass `resolveTranscript` and `readFrom` implementations fenced to the fixture directory — answering `undefined` for any session id the harness did not create, exactly as the prompt fence answers `[]` for every cwd but its own.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run build && npm run verify:panels 2>&1 | tail -10`
Expected: `152/152 passed`. Confirm 126 specifically — it is the only check separating a live readout from a one-shot read.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-panels.cjs scripts/panels-entry.cjs src/renderer/shell/Inspector.tsx
git commit -m "$(cat <<'EOF'
test(m17): the cost readout end to end in a real renderer

Check 126 is the discriminating one: an implementation that read the
transcript once at spawn and cached it satisfies 125 completely and is not a
live readout at all. It waits on the value rather than sleeping, because a
fixed sleep against a 2s poll is a flake and not a bound.

The transcript is synthesised and reached through substituted deps, never
through the real ~/.claude/projects — the rule the git fence and the prompt
fence both obey, and on a developer's machine that directory holds their
actual work.

Check 127 is deliberately weak on its own and its comment says so: it passes
vacuously before the section exists, so it is evidence only once 125 has been
watched red.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Documentation, and the backlog entry rewritten down

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/ideas-backlog.md`

**Interfaces:** none.

- [ ] **Step 1: Add the `verify:usage` row to both suite tables**

In `README.md` and in `CLAUDE.md`'s suite table, add a row in the same dense style the neighbours use, naming the checks worth knowing by number: **2/3** (the carry pair, and why neither half alone is worth much), **10** (a cache read costs less than fresh input — a transposed table satisfies 9 completely), **11** (an unknown model yields undefined, never 0), **18** (the dedupe, whose failure is heat and which nothing else can see), and **19** (the shrunk-file reset).

- [ ] **Step 2: Add the milestone row to `README.md`**

```
| M17 | Token and dollar accounting: what each panel's agent has spent | ✅ done |
```

- [ ] **Step 3: Add the load-bearing details to `CLAUDE.md`**

Add these entries under `## Load-bearing details`, each written in the file's own voice — the invariant, then the silent failure that follows from undoing it:

1. **"The session id is persisted, never re-minted"** — `create()` runs again on every reload; `-A` reattaches without re-running the command; a re-mint names a transcript that does not exist. Include why deriving it from the panel id is worse (ids are recycled by `onReset`; `--session-id` on an existing session is a *resume*). Name `verify:pty-manager` 25 and `verify:layout` 112.
2. **"`detachAll()` clears the cached path and NOT the totals"** — and the mirror-image note that `lastLive` is the opposite. Both are one sentence each and both are wrong in the other direction if swapped.
3. **"Four token classes, never two"** — with the measured numbers.
4. **"The carry buffer is the parser's whole correctness"** — a dropped fragment is lost permanently because the offset advanced past it.
5. **"Zero and unmeasured are different facts"** — the three-state rule, and `verify:rail` 76.
6. **"`usage:panel` is an `IPC_EVENTS` send, so `verify:ipc` stays at 31"** — the **third** time this boundary has been recorded (M6d, M12, M17). Say so.
7. **"The transcript path is globbed, not rebuilt"** — needs no knowledge of another program's slug rule; immune to #41's live-cwd problem.
8. **"A third tick, not a merge"** — `IDLE_TICK_MS` is the *resolution* of M6c's threshold.

Also update the `verify:ipc` row's prose: the channel count is **unchanged**, and the reason belongs beside M6d's and M12's identical notes.

- [ ] **Step 4: Rewrite backlog #19 down to its open half**

The backlog's own preamble: *"Where a milestone shipped most of an entry and deliberately left part of it, the entry stays but is rewritten down to the part that is still open, keeping the recorded constraint attached to the half that still has to survive it."*

Rewrite `## 19` to cover only what is still open, and nothing that shipped:
- **History and retention** — the entry's own open question, answered "live readout" by M17. State that the storage question is unowned and cross-reference #46.
- **A second CLI adapter** — the neutral model exists; no `codex` adapter does. Keep the original constraint attached: *do not build the abstraction until a second CLI actually wants it.*
- **The un-pinned panel** — a `claude` typed by hand into a login shell reports nothing, and the cwd-matching fallback that would cover it is a guess whenever two panels share a directory.
- **Per-workspace and canvas-wide totals** — the store makes both cheap; neither shipped.

Add a line to the "numbers that are gone" table's neighbourhood **only if** you delete the entry — you are not deleting it, so leave that table alone. Add a note at the top of #19 naming M17 and the `CLAUDE.md` headings, so a reader knows which half is already in the app.

- [ ] **Step 5: State the unverified link, in `CLAUDE.md`, in the suite table's own voice**

The claim that `--session-id <uuid>` causes Claude Code to write `<uuid>.jsonl` is verified by observation on one machine on one version and by **nothing repeatable**. No check spawns a real `claude`. If that behaviour changes, every suite stays green and the feature reports nothing for every panel. Write it down with the same honesty this file already applies to `verify:panels` 32, to the auto-repeat checks, and to M11's `keyup` link — including the sentence that it needs a hand on a real agent once and must not be read as checked until somebody has done it.

- [ ] **Step 6: Verify the whole chain**

```bash
npm run verify
```
Expected: every suite green, exit 0. `verify:meta` 14 fails if the channel is missing from the README diagram; 19 fails if `verify:usage` is not in the chain.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md docs/ideas-backlog.md
git commit -m "$(cat <<'EOF'
docs(m17): record the accounting layer and rewrite backlog #19 down

Eight load-bearing details, each with the silent failure that follows from
undoing it. The two most easily reversed are the persisted session id (a
re-mint on reload names a transcript that does not exist, and the panel's cost
freezes with nothing in any log) and detachAll() clearing the cached path but
NOT the totals — the exact mirror of lastLive, which it must clear, and both
wrong in the other direction if swapped.

Records the third instance of the same IPC counting boundary: usage:panel is
an IPC_EVENTS send, so verify:ipc does not move. M6d and M12 each recorded it
before, and an earlier draft of one of those specs got it backwards.

States the unverified link plainly: nothing repeatable proves --session-id
makes Claude Code write <uuid>.jsonl, so if that changes every suite stays
green and the feature reports nothing. It needs a hand on a real agent once.

#19 is rewritten down to its open half rather than deleted — history, a second
adapter, the un-pinned panel, and the aggregate totals — per the backlog's own
rule.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: the pinned session id → Tasks 4–6; the poller → Task 7; the pure parser and pricing → Tasks 1–3; the renderer store → Task 8; the inspector section → Task 9; all six verification bullets → Tasks 1–3 (`verify:usage`), 4–5 (`verify:layout`), 9 (`verify:rail`), 6–7 (`verify:pty-manager`), 7 (`verify:ipc`/`verify:meta`), 10 (`verify:panels`); the honesty rules → Tasks 2 and 9; the "what none of it can see" paragraph → Task 11 Step 5. All seven success criteria are pinned: 1 → 125, 2 → 25 + 112, 3 → 76 + 127, 4 → 9/10 + 77, 5 → 16 + 80, 6 → 11 + 78/79, 7 → 81 + 127.

**Type consistency.** `TokenTotals` fields are `input`/`output`/`cacheWrite`/`cacheRead` everywhere. `PanelUsage` is `{ totals, byModel, turns, subagentTurns }` in the type, the accumulator, the store, and every check. `costOf(totals, model)` returns `number | undefined` in Task 2 and is consumed as such in Task 9. `applyChunk` returns `PanelUsage | undefined` in Task 3 and is used that way in Task 7.

**Ordering risks, both resolved in the plan rather than left to be discovered:**

- Task 1's bundle entry requires all four modules, so Tasks 2 and 3 begin from placeholder files created in Task 1 Step 5. Without them, `verify:usage` cannot build at all until Task 3 lands, and Tasks 1 and 2 would have no runnable checks.
- The price table is written into `src/main` in Task 2 and moved to `src/shared` in Task 9, because Task 9 is where the renderer first needs it and the renderer must never import from `src/main`. The move is a step with its own re-run of `verify:usage`, not a silent refactor.

**Two places where a `TypeError` will abort a suite mid-run**, both flagged in the step that causes them (Task 2 Step 2, Task 3 Step 2, Task 9 Step 2). The plan tells the executor which later checks did not execute and to confirm each one's PASS individually afterwards, because a suite total that moves proves nothing about which checks moved it.
