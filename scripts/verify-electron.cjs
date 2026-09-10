/* Verifies the Electron security boundary as Electronegativity reads it.
   Run with: npm run verify:electron

   Plain node. The tool parses src/ (AST for .ts, DOM for .html) for the
   configurations Electron's own security checklist names — contextIsolation,
   nodeIntegration, sandbox, the CSP, the preload, openExternal, protocol
   handlers — none of which has a runtime symptom when regressed: the app
   keeps working with the boundary gone, which is the one failure the
   credential store, the broker and the outward gate cannot survive.

   ACCEPTED is a closed list. A finding not on it FAILS (eneg.2). A row on it
   that stopped firing ALSO fails (eneg.3): the code it described moved or
   changed, and the sentence beside it now explains nothing — the fix is
   editing this list by hand, with a new sentence. Rows are keyed by check,
   file and a SAMPLE SUBSTRING, never a line number, which drifts on every
   edit above it.

   `-e` is passed from package.json, and eneg.1 asserts the tool did not
   print its "assuming v0.1.0" fallback: without the version the checks
   assume 2018 defaults (nodeIntegration ON, contextIsolation OFF) and every
   verdict below is about a different Electron, silently. */
'use strict'
const { execFileSync } = require('node:child_process')
const { readFileSync, mkdirSync, existsSync } = require('node:fs')
const { join, relative } = require('node:path')

const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'out', 'verify')
mkdirSync(OUT_DIR, { recursive: true })
/* SARIF, not CSV: the tool's own CSV writer was observed (at M112, v1.10.3)
   to truncate whichever row's sample text is the CSP meta tag's content
   attribute — the row's leading cells vanish and the line becomes
   unparseable, silently dropping that finding from a naive line-based CSV
   reader. SARIF is real JSON with no such row, so the finding survives; the
   "sample" text is reconstructed by slicing the SOURCE file at the region
   SARIF names, which is what the CSV's `sample` column would have printed. */
const SARIF = join(OUT_DIR, 'electronegativity.sarif')

const { ok, results } = require('./lib/checks.cjs').createChecks()

/* The accepted findings. Each `why` is the reason the pattern is deliberate,
   in this repository's own words; a reader of a red eneg.3 should be able to
   tell from the sentence whether the code or the list is wrong. */
const ACCEPTED = [
  { check: 'CSP_GLOBAL_CHECK', file: 'src/renderer/index.html', sample: "content=\"default-src 'self'",
    why: "xterm sets inline styles on its layers; script-src stays 'self' and nothing loads remotely" },
  { check: 'SANDBOX_JS_CHECK', file: 'src/main/index.ts', sample: 'sandbox: false,',
    why: "the preload needs require('electron') for contextBridge; node-pty stays in main" },
  { check: 'PRELOAD_JS_CHECK', file: 'src/main/index.ts', sample: "preload: join(__dirname, '../preload/index.js'),",
    why: 'the one bridge; verify:ipc pins every channel it exposes' },
  { check: 'AUXCLICK_JS_CHECK', file: 'src/main/index.ts', sample: 'new BrowserWindow(',
    why: 'the renderer is file: and never navigates (drop-guard.ts); a middle-click has no target' },
  { check: 'OPEN_EXTERNAL_JS_CHECK', file: 'src/main/index.ts', sample: 'shell.openExternal(url)',
    why: 'the link:open door — main decides after resolveOpen, the renderer opens nothing' },
  { check: 'OPEN_EXTERNAL_JS_CHECK', file: 'src/main/index.ts', sample: 'shell.openExternal(r.url)',
    why: "the browser pane's Open in browser; the url is the guest's own getURL()" },
  { check: 'PROTOCOL_HANDLER_JS_CHECK', file: 'src/main/index.ts', sample: 'app.setAsDefaultProtocolClient(CONTROL_SCHEME)',
    why: 'the tc:// URL door, restricted to open (M54)' }
]

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const electronVersion = String(pkg.devDependencies.electron).replace(/^[\^~]/, '')
const bin = join(ROOT, 'node_modules', '.bin', 'electronegativity')

let stdout = '', ran = false, argv = []
try {
  argv = ['-i', join(ROOT, 'src'), '-e', electronVersion, '-o', SARIF, '-r']
  stdout = execFileSync(bin, argv, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 })
  ran = true
} catch (error) {
  stdout = `${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message}`
}

const assumed = /assuming v0\.1\.0/.test(stdout)
ok('eneg.1 electronegativity ran over src/ with the installed Electron version and did not fall back to its v0.1.0 defaults',
  ran && argv.includes('-e') && argv[argv.indexOf('-e') + 1] === electronVersion && !assumed,
  JSON.stringify({ ran, electronVersion, assumed, tail: stdout.trim().split('\n').slice(-3) }))

/* A region's charLength is an ABSOLUTE character count from startLine/startColumn
   (both 1-based), which can and does cross line boundaries (the CSP meta tag's
   sample spans three lines of the pretty-printed HTML) — so the slice is taken
   from the whole file text via the flattened offset, never per-line. A file
   electronegativity names but that no longer exists at that offset yields ''
   rather than throwing, which just fails to match any ACCEPTED row (correct:
   a finding that cannot be re-derived is not a finding you can accept blind). */
const sampleAt = (fileUnderSrc, region) => {
  try {
    const text = readFileSync(join(ROOT, 'src', fileUnderSrc), 'utf8')
    const lines = text.split('\n')
    let offset = 0
    for (let i = 0; i < region.startLine - 1; i++) offset += lines[i].length + 1
    offset += region.startColumn - 1
    return text.slice(offset, offset + region.charLength)
  } catch {
    return ''
  }
}

/* The read+parse is guarded because a timed-out or killed electronegativity
   process can leave a missing or truncated SARIF file behind, and a thrown
   SyntaxError here would abort the whole suite — eneg.2 through eneg.4 would
   never print, and the run would exit on a stack trace instead of a FAIL
   line (the global rule: a check that throws takes every check below it
   down with it, silently). A bad file becomes zero findings plus a
   `parseError` string eneg.2 reports and fails on, rather than a vacuous
   pass — an unreadable report is not evidence of a clean one. */
let sarif = null, parseError = null
try {
  sarif = existsSync(SARIF) ? JSON.parse(readFileSync(SARIF, 'utf8')) : null
} catch (error) {
  parseError = String(error.message ?? error)
}

/* A SARIF result with no usable location (an empty `locations` array, or a
   ruleId the rules table doesn't carry a URL for) is skipped rather than
   thrown on, but COUNTED — a finding the suite can't place must not vanish
   from the tally the way a truncated CSV row silently did in the CSV path
   this suite replaced. */
let unplaced = 0
const findings = (sarif?.runs?.[0]?.results ?? []).flatMap((r) => {
  const loc = r.locations?.[0]?.physicalLocation
  if (!loc?.artifactLocation?.uri || !loc?.region) { unplaced++; return [] }
  const file = relative(ROOT, join(ROOT, 'src', loc.artifactLocation.uri)).replace(/\\/g, '/')
  const rule = sarif.runs[0].tool.driver.rules.find((x) => x.id === r.ruleId)
  return [{ check: r.ruleId, file, sample: sampleAt(loc.artifactLocation.uri, loc.region), url: rule?.helpUri }]
})

const matches = (row, f) => row.check === f.check && row.file === f.file && f.sample.includes(row.sample)

const unexpected = findings.filter((f) => !ACCEPTED.some((row) => matches(row, f)))
ok('eneg.2 no finding outside ACCEPTED — a new anti-pattern fails with its wiki page',
  ran && !parseError && unplaced === 0 && unexpected.length === 0,
  parseError ? `SARIF unreadable: ${parseError}`
    : unplaced > 0 ? `${unplaced} finding(s) with no usable location`
    : unexpected.map((f) => `${f.check} ${f.file} «${f.sample}» ${f.url}`).join(' | ') || `${findings.length} findings, all accepted`)

const stale = ACCEPTED.filter((row) => !findings.some((f) => matches(row, f)))
ok('eneg.3 every ACCEPTED row still fires — a row that stopped firing describes code that moved, and is edited by hand',
  ran && stale.length === 0,
  stale.map((row) => `${row.check} ${row.file} «${row.sample}»`).join(' | ') || `${ACCEPTED.length} rows`)

/* eneg.4 — the tool's blind spot, measured at M112: it did not report
   `webviewTag: true` at all. The guest's hardening is therefore pinned HERE
   as text (comment-stripped, meta browser.1's own regexes), so a reader of
   this suite is not lulled by a green eneg.2 into thinking the webview was
   looked at. */
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  const src = strip(readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8'))
  const at = src.indexOf("'will-attach-webview'")
  const attach = at < 0 ? '' : src.slice(at, at + 900)
  const webviewTag = /webviewTag:\s*true/.test(src)
  const stripsPreload = /delete\s+webPreferences\.preload/.test(attach)
  const noNode = /webPreferences\.nodeIntegration\s*=\s*false/.test(attach) && /webPreferences\.contextIsolation\s*=\s*true/.test(attach)
  ok('eneg.4 the webview guest the tool cannot see is hardened as text: will-attach-webview strips preload and forces nodeIntegration false / contextIsolation true',
    webviewTag && stripsPreload && noNode,
    JSON.stringify({ webviewTag, stripsPreload, noNode }))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
