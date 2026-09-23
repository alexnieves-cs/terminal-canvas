#!/usr/bin/env node
/**
 * verify:toast (Round 8) — what may become a toast, and what may not.
 *
 * Plain node over `toast-decision.ts`, which imports no library and touches no
 * DOM. The delivery half (`toast.ts`, which calls sonner) is deliberately NOT
 * reached from here: there is nothing in it to check that is not either the
 * library's own behaviour or a colour, and pulling sonner and React into this
 * tier to assert "it called toast.success" would test the mock.
 *
 * THE CHECK THAT MATTERS IS `toast.attention.1`. Every other rule here is
 * hygiene; that one is a product rule with a documented history. This app's
 * attention system — the wants-you set, the dock count, the panel ring, the
 * pill's rest line — is about STATE that is still true after you have read
 * it. A toast is about an EVENT that is over. Restating the queue count as a
 * toast was removed once already (M265) because it teaches a person that the
 * persistent surfaces are decoration, and a new toast layer is exactly how
 * that comes back. So the suppression is asserted from both sides: by the
 * sentence's own shape, and by the pill's rest state.
 */
const { buildSync } = require('esbuild')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
const outDir = join(root, 'out/verify')
mkdirSync(outDir, { recursive: true })

function load (entry, name) {
  const outfile = join(outDir, name)
  buildSync({
    entryPoints: [join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'react', 'sonner'],
    alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
  })
  return require(outfile)
}

const T = load('src/renderer/shell/toast-decision.ts', 'toast-decision.cjs')
const shown = (sentence, restKind) => T.toastDecision({ sentence }, restKind)

// ---------------------------------------------------------------------------
// The attention line. Both halves.
// ---------------------------------------------------------------------------
ok('toast.attention.1 a queue-count sentence NEVER becomes a toast, whatever produced it — it is state the dock, the ring and the pill already carry, and a five-second window onto a fact that outlives it teaches a person to stop reading the real surfaces',
  ['3 panels need you', '1 panel needs you', '3 chats need you', '1 chat needs you', '2 agents need you', '  4 chats need you  ']
    .every((s) => shown(s).kind === 'suppressed' && shown(s).why === 'attention-restatement'),
  JSON.stringify(shown('3 chats need you')))

ok('toast.attention.2 while the pill is RESTING on attention, a needs-you sentence is suppressed even when it is phrased some other way — the same fact is on screen and stays on screen',
  shown('the review chat needs you', 'attention').kind === 'suppressed' &&
  shown('the review chat needs you', 'running').kind === 'show' &&
  shown('the review chat needs you').kind === 'show',
  JSON.stringify({ resting: shown('the review chat needs you', 'attention'), running: shown('the review chat needs you', 'running') }))

ok('toast.attention.3 the suppression is NARROW — an ordinary outcome is not silenced just because the pill happens to be resting on attention',
  shown('Exported the canvas as a picture', 'attention').kind === 'show' &&
  shown('Saved the GitHub credential', 'attention').kind === 'show')

// ---------------------------------------------------------------------------
// The outcome arms.
// ---------------------------------------------------------------------------
ok('toast.outcome.1 a refusal is its OWN arm, never the failure one — "a built-in workflow saves as a copy" is the app working correctly, and the error colour would send a person hunting a bug that is not there',
  T.toastDecision({ sentence: 'a built-in workflow saves as a copy', outcome: 'refused' }).outcome === 'refused' &&
  T.toastDecision({ sentence: 'x', outcome: 'failed' }).outcome === 'failed' &&
  T.toastDecision({ sentence: 'x' }).outcome === 'done')

ok('toast.outcome.2 a refusal and a failure stand LONGER than a success — a success confirms what the person just did and expected; the other two tell them something they did not know',
  T.TOAST_MS.done < T.TOAST_MS.refused && T.TOAST_MS.refused < T.TOAST_MS.failed &&
  T.TOAST_MS.done >= 2000,
  JSON.stringify(T.TOAST_MS))

// ---------------------------------------------------------------------------
// The empty case, and the detail line.
// ---------------------------------------------------------------------------
ok('toast.empty.1 an empty or blank sentence shows nothing — a rectangle that appears, says nothing and leaves is worse than silence, because the person looked away from their work to read it',
  shown('').kind === 'suppressed' && shown('   ').kind === 'suppressed' &&
  shown('').why === 'empty')

ok('toast.detail.1 the sentence and the detail are both trimmed, and a blank detail is DROPPED rather than rendered as an empty second line',
  (() => {
    const withDetail = T.toastDecision({ sentence: '  Exported  ', detail: '  /tmp/a.txt  ' })
    const blank = T.toastDecision({ sentence: 'Exported', detail: '   ' })
    const none = T.toastDecision({ sentence: 'Exported' })
    return withDetail.sentence === 'Exported' && withDetail.detail === '/tmp/a.txt' &&
      Object.prototype.hasOwnProperty.call(blank, 'detail') === false &&
      Object.prototype.hasOwnProperty.call(none, 'detail') === false
  })())

ok('toast.pure.1 the decision is PURE — no sonner, no react, no DOM reached from the module this tier loads, which is the whole reason it can be checked here at all',
  (() => {
    const src = require('node:fs').readFileSync(join(root, 'src/renderer/shell/toast-decision.ts'), 'utf8')
    return !/from 'sonner'/.test(src) && !/from 'react'/.test(src) && !/\bdocument\.|\bwindow\./.test(src)
  })())

// ---------------------------------------------------------------------------
// The single-table rule: the suppression is the pill's function, not a copy.
// ---------------------------------------------------------------------------
ok('toast.single-table.1 the attention rule is IMPORTED from command-pill, never re-expressed here — two copies of that regex is exactly how the restatement comes back on one side only',
  (() => {
    const src = require('node:fs').readFileSync(join(root, 'src/renderer/shell/toast-decision.ts'), 'utf8')
    return /import \{ isAttentionQueueRestatement \} from '\.\.\/canvas\/command-pill'/.test(src) &&
      !/chats? needs? you/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''))
  })())

// The door the rest of the app calls must ROUTE through the decision rather
// than reaching for the library itself, or the rule above is advisory.
ok('toast.door.1 sonner is imported in exactly one file — every other caller goes through notify(), so the suppression cannot be walked around by importing toast directly',
  (() => {
    const { execFileSync } = require('node:child_process')
    const hits = execFileSync('grep', ['-rl', "from 'sonner'", join(root, 'src')], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean).map((p) => p.replace(join(root, 'src/'), ''))
    // CanvasToaster imports the <Toaster/> component, which is the mount, not
    // the door; toast.ts imports the emitter. Those two, and nothing else.
    return hits.length === 2 && hits.includes('renderer/shell/toast.ts') && hits.includes('renderer/shell/CanvasToaster.tsx')
  })(),
  'every emitter call belongs behind notify()')

const failed = results.filter((x) => !x.pass)
console.log(`verify:toast ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.n}${f.detail ? ` — ${f.detail}` : ''}`)
  process.exit(1)
}
