/* Verifies M15's pure accounting: the JSONL parser, the price table, and the
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
