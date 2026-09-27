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

const { ok, results } = require('./lib/checks.cjs').createChecks()

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

// pricing.1 The rates checked against platform.claude.com on 2026-09-14 are
//     PINNED. Checks 9–13 are all shape checks — a table with Sonnet 5 at
//     3/15 (the first transcription, 50% high) satisfies every one of them.
//     A deliberate price change edits this check and the table together.
{
  const pinned = {
    'claude-fable-5-1': [10, 50, 0.25],
    'claude-opus-5': [5, 25, 0.5],
    'claude-sonnet-5': [2, 10, 0.2],
    'claude-haiku-4-5': [1, 5, 0.1]
  }
  const off = Object.entries(pinned).filter(([m, [i, o, r]]) => {
    const x = U.MODEL_RATES[m]
    return !x || x.input !== i || x.output !== o || x.cacheRead !== r
  })
  ok('pricing.1 checked rates are pinned', off.length === 0,
    off.length ? `drifted: ${off.map(([m]) => m).join(', ')}` : 'ok')
}

// pricing.2 A dated snapshot id prices as its alias. Claude Code transcripts
//     carry `claude-haiku-4-5-20251001` (see fixtures), so without this every
//     Haiku turn is "unpriced" and blanks the run total around it.
{
  const t = { input: 1000000, output: 0, cacheWrite: 0, cacheRead: 0 }
  ok('pricing.2 dated snapshot prices as alias',
    U.costOf(t, 'claude-haiku-4-5-20251001') === U.costOf(t, 'claude-haiku-4-5') &&
      U.costOf(t, 'claude-haiku-4-5') === 1,
    String(U.costOf(t, 'claude-haiku-4-5-20251001')))
}

// pricing.3 Only an 8-digit date is stripped. A looser rule would price a
//     future `claude-opus-5-2` at Opus 5's rate — check 11's plausible wrong
//     answer arriving by the side door.
{
  const t = { input: 100, output: 100, cacheWrite: 0, cacheRead: 0 }
  ok('pricing.3 non-date suffix stays unpriced',
    U.costOf(t, 'claude-opus-5-2') === undefined && U.costOf(t, 'claude-opus-5-2026') === undefined,
    String(U.costOf(t, 'claude-opus-5-2')))
}

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

// M39 — the two pure text helpers the log, the card and (later) search and
// export share. Scoped ids.
//
// ansi.1. stripAnsi removes SGR, CSI cursor moves, an OSC title (BEL- and
//      ST-terminated) and a bare BEL, and keeps the text between them. The
//      OSC case is the one worth having: a title's BODY is text too, and a
//      stripper that only knew SGR would leak "0;claude — ~/repo" into the
//      card as though the agent had printed it.
{
  const fn = typeof U.stripAnsi === 'function' ? U.stripAnsi : null
  const raw = '\x1b[32mgreen\x1b[0m \x1b[2K\x1b[1;5Hmoved \x1b]0;a title\x07after \x1b]0;st title\x1b\\end\x07!'
  const out = fn ? fn(raw) : null
  ok('ansi.1 stripAnsi drops SGR, CSI, both OSC terminators and a bare BEL, and keeps the text',
    out === 'green moved after end!', JSON.stringify(out))
}

// redact.1. Each well-known token shape is replaced by a placeholder that
//      NAMES ITS KIND and shares no character run with the original — a
//      placeholder that echoed the token's tail would be a partial leak — and
//      the count equals the number of replacements.
{
  const fn = typeof U.redactSecrets === 'function' ? U.redactSecrets : null
  const samples = {
    aws: 'AKIAIOSFODNN7EXAMPLE',
    github: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    sk: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ',
    bearer: 'Authorization: Bearer eyJabc.DEFghi.JKLmno_pqr',
    slack: 'xoxb-1234567890-abcdefghijklmnop'
  }
  const text = Object.values(samples).join('\n')
  const out = fn ? fn(text) : null
  const leaked = out ? Object.values(samples).filter((t) => out.text.includes(t.slice(-12))) : ['unrun']
  ok('redact.1 every known token shape is replaced by a kind-named placeholder, counted, with no tail leaked',
    out !== null && out.count === 5 && leaked.length === 0 &&
      /\[redacted aws/.test(out.text) && /\[redacted github/.test(out.text) && /\[redacted api key/.test(out.text) &&
      /\[redacted bearer/.test(out.text) && /\[redacted slack/.test(out.text),
    JSON.stringify({ out, leaked }))
}

// redact.4. A STANDALONE JWT — three base64url segments, not preceded by
//      "Bearer" — is its own rule, and redact.1 covers it only when the
//      bearer rule swallows it whole (the M39 verifier's note). A JWT is
//      exactly what a `curl -v` or an SDK's debug log prints bare.
{
  const fn = typeof U.redactSecrets === 'function' ? U.redactSecrets : null
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  const out = fn ? fn(`token=${jwt} ok`) : null
  ok('redact.4 a bare JWT is replaced by the jwt placeholder and none of its segments survive',
    out !== null && out.count === 1 && /\[redacted jwt\]/.test(out.text) &&
      !out.text.includes('eyJhbGci') && !out.text.includes('SflKxwRJ') && out.text.endsWith(' ok'),
    JSON.stringify(out))
}

// redact.2. A private-key block is one replacement, header to footer, not a
//      line-by-line mangling that leaves the base64 body intact.
{
  const fn = typeof U.redactSecrets === 'function' ? U.redactSecrets : null
  const key = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n-----END OPENSSH PRIVATE KEY-----'
  const out = fn ? fn(`before\n${key}\nafter`) : null
  ok('redact.2 a private-key block is one replacement and its body is gone',
    out !== null && out.count === 1 && !out.text.includes('b3BlbnNzaC') && /\[redacted private key\]/.test(out.text) &&
      out.text.startsWith('before\n') && out.text.endsWith('\nafter'),
    JSON.stringify(out))
}

// redact.3. Ordinary developer text is untouched: a 40-hex git sha, a UUID, a
//      path, a URL with no token, a short "token" word. Over-matching is its
//      own failure — an export that redacts a commit sha is an export nobody
//      can act on.
{
  const fn = typeof U.redactSecrets === 'function' ? U.redactSecrets : null
  const text = 'commit 3f2a1b4c5d6e7f8091a2b3c4d5e6f708192a3b4c\nid 123e4567-e89b-12d3-a456-426614174000\n/Users/x/repo/token.ts https://example.com/path?x=1\nthe token was rotated'
  const out = fn ? fn(text) : null
  ok('redact.3 ordinary text — a sha, a UUID, a path, a URL, the word token — is untouched with count 0',
    out !== null && out.count === 0 && out.text === text, JSON.stringify(out))
}

// M380 — cache.return.1. What caching returned, at the pinned list prices:
//     a read is fresh input not paid (input − read rate), a write is paid
//     above input (write − input rate). The net can be negative — a session
//     that wrote more than it reused — and an unpriced model has no figure.
{
  const t = (cacheRead, cacheWrite) => ({ input: 0, output: 0, cacheRead, cacheWrite })
  const reuse = U.cacheReturnOf(t(1_000_000, 100_000), 'claude-sonnet-5')
  const waste = U.cacheReturnOf(t(0, 1_000_000), 'claude-sonnet-5')
  const dated = U.cacheReturnOf(t(1_000_000, 0), 'claude-haiku-4-5-20251001')
  ok('cache.return.1 caching\'s return at list price: a million reads on sonnet 5 saved $1.80 less $0.05 for a hundred thousand writes; a million writes and no reads is a $0.50 net cost; a dated id prices as its alias; an unknown model has no figure',
    Math.abs(reuse.saved - 1.8) < 1e-9 && Math.abs(reuse.premium - 0.05) < 1e-9 && Math.abs(reuse.net - 1.75) < 1e-9 &&
      Math.abs(waste.net + 0.5) < 1e-9 && Math.abs(dated.saved - 0.9) < 1e-9 && U.cacheReturnOf(t(1, 1), 'gpt-9') === undefined,
    JSON.stringify({ reuse, waste, dated }))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
