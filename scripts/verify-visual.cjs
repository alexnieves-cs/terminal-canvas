/* verify:visual (M148). The visual-regression suite over the shot harness.
   Run with: npm run build && npm run verify:visual
   NOT in `npm run verify`: it paints every scene of scripts/shot.cjs in a
   child Electron (about two minutes) and consumes the build — a hand-run
   gate, like verify:packaged. verify:meta visual.1 pins it as one.

   Each scene's fresh PNG is compared with its committed GOLDEN under
   verify/visual/goldens/<scene>.png, decoded with Electron's own nativeImage
   (no image library enters the repository). Three outcomes per scene, never
   two: PASS under the budget, FAIL over it (with the differing ratio and a
   diff image at out/visual/<scene>.diff.png), MISSING when there is no golden.

   TWO BUDGETS, two questions: PIXEL_BUDGET over the frame catches a moved
   pane or a changed theme and tolerates scattered antialiasing jitter;
   TILE_BUDGET over 32px tiles catches a changed word or a control that
   moved, which jitter never clusters into. A change under both is under
   this suite's sight, and the audit says so.

   UPDATING GOLDENS. `UPDATE_GOLDENS=1 npm run verify:visual` writes every
   fresh capture that CHANGED (past either budget) over its golden — one that
   still passes is kept byte for byte — and exits 0. To force ONE golden that
   the budgets cannot see (a thin line moved), delete the file and update:
   a missing golden is always written. Do it only after LOOKING at the
   fresh image and the diff and deciding the change is the intended one; an
   update made to turn a red green is this suite switched off. A milestone
   that changes a scene commits its golden in the same commit as the change,
   so `git log -- verify/visual/goldens` is the visual changelog. */
const { app, nativeImage, screen } = require('electron')
const { spawn } = require('node:child_process')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const ROOT = join(__dirname, '..')
const GOLDENS = join(ROOT, 'verify', 'visual', 'goldens')
const DIFFS = join(ROOT, 'out', 'visual')
const UPDATE = process.env.UPDATE_GOLDENS === '1'

// A pixel DIFFERS when any channel differs by more than this, of 255. Font
// antialiasing and a WebGL terminal's subpixel jitter sit under 24; a colour
// change — a token, a tone, a theme — sits well over it.
const CHANNEL_TOLERANCE = 24 // of 255 per channel: antialiasing jitter sits under it, a colour change over it
// A scene FAILS when this fraction of its pixels differ. Half a percent of a
// 1440x900 frame is ~6,500 pixels: a moved pane, a lost panel or a changed
// theme is far over it. A changed WORD is not (a label is a few hundred
// pixels, under the frame's own jitter floor) — the tile budget below is
// what sees those; this budget catches layout-scale change and jitter alone.
const PIXEL_BUDGET = 0.005 // of the frame: a moved pane is far over it, antialiasing jitter far under
// The frame is also cut into TILE x TILE squares, and a scene FAILS when any
// one tile has more than TILE_BUDGET of its pixels differing: antialiasing
// jitter SCATTERS across the frame and never fills a tile, while a changed
// word, a control that moved ten pixels or a pip that appeared CLUSTERS in a
// few tiles (the Act III critic's metric). The two budgets are two questions.
const TILE = 32 // pixels per side at the golden's scale; a word is about one tile
const TILE_BUDGET = 0.35 // of one tile's pixels: a changed word fills a tile past this, jitter never does
// Goldens and captures are compared at HALF the painted size. A 1440x900
// capture of a WebGL terminal is ~650 KB of PNG and 53 of them are 34 MB per
// golden refresh — a cost the repository would pay on every visual change.
// At half size a moved control, a lost row or a changed colour is still
// orders of magnitude over the budget, and the antialiasing jitter that sits
// under the tolerance shrinks with it. The fresh capture is resized the same
// way before the comparison, so the two sides see one scale.
const GOLDEN_SCALE = 0.5
// The whole run: the harness paints 55 scenes in under three minutes.
// Measured (M183): the harness paints 58 scenes, the workflow editor's among
// them. Two green runs of this suite, alone in the Electron tier: 174.1 s and
// 176.4 s wall, times 1.25 — the M135 rule; the M160 figures (166.5 s, 166.2 s
// over 55 scenes) are what this replaces, and an update run that writes
// goldens tripped the old 209 s ceiling. Re-measure when a milestone adds scenes.
const WATCHDOG_MS = 221000

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

/** A golden is stored at GOLDEN_SCALE; a fresh capture is brought to the same size before the two are compared. */
function halved(path) {
  const img = nativeImage.createFromPath(path)
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  return img.resize({ width: Math.round(width * GOLDEN_SCALE), height: Math.round(height * GOLDEN_SCALE), quality: 'good' })
}

function decode(img) {
  if (img === null || img.isEmpty()) return null
  const { width, height } = img.getSize()
  return { width, height, bytes: img.toBitmap() } // BGRA, 4 bytes per pixel
}

/** Differing-pixel count, the worst tile, and a diff bitmap: the golden dimmed, differing pixels painted red. */
function compare(golden, fresh) {
  const total = golden.width * golden.height
  const diff = Buffer.alloc(total * 4)
  const cols = Math.ceil(golden.width / TILE)
  const tiles = new Uint32Array(cols * Math.ceil(golden.height / TILE))
  let differing = 0
  for (let i = 0; i < total; i++) {
    const o = i * 4
    const dB = Math.abs(golden.bytes[o] - fresh.bytes[o])
    const dG = Math.abs(golden.bytes[o + 1] - fresh.bytes[o + 1])
    const dR = Math.abs(golden.bytes[o + 2] - fresh.bytes[o + 2])
    const differs = dB > CHANNEL_TOLERANCE || dG > CHANNEL_TOLERANCE || dR > CHANNEL_TOLERANCE
    if (differs) {
      differing += 1
      const x = i % golden.width, y = (i - x) / golden.width
      tiles[Math.floor(y / TILE) * cols + Math.floor(x / TILE)] += 1
      diff[o] = 40; diff[o + 1] = 40; diff[o + 2] = 230; diff[o + 3] = 255
    } else {
      diff[o] = golden.bytes[o] >> 2; diff[o + 1] = golden.bytes[o + 1] >> 2; diff[o + 2] = golden.bytes[o + 2] >> 2; diff[o + 3] = 255
    }
  }
  // The worst tile, as a fraction of a FULL tile's pixels (an edge tile is
  // smaller, which only makes it harder to fill — never easier).
  let worstTile = 0, worstAt = null
  for (let t = 0; t < tiles.length; t++) {
    const frac = tiles[t] / (TILE * TILE)
    if (frac > worstTile) { worstTile = frac; worstAt = [(t % cols) * TILE, Math.floor(t / cols) * TILE] }
  }
  return { differing, ratio: differing / total, worstTile, worstAt, diff }
}

let shotChild = null // held so the watchdog can kill it: an orphaned child keeps the build and its fixture HOME alive
function runShot(dir) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'shot'], { cwd: ROOT, env: { ...process.env, SHOT_DIR: dir, ELECTRON_RUN_AS_NODE: undefined }, stdio: ['ignore', 'pipe', 'pipe'] })
    shotChild = child
    let out = ''
    child.stdout.on('data', (d) => { out += String(d) })
    child.stderr.on('data', (d) => { out += String(d) })
    child.on('exit', (code) => resolve({ code, out }))
    child.on('error', (error) => resolve({ code: -1, out: String(error) }))
  })
}

app.on('window-all-closed', () => {})

const SCRIPT_NAME = 'verify-visual.cjs'

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => {
    console.error(`\nFAIL  watchdog — run did not finish within ${WATCHDOG_MS}ms`)
    try { shotChild?.kill('SIGTERM') } catch { /* already gone */ }
    app.exit(1)
  }, WATCHDOG_MS)
  // The goldens are one machine's captures at a device scale factor of 2,
  // halved. On a 1x display every scene would fail as `the size changed`,
  // fifty-four times, for one reason — said once, by name, instead.
  const scale = screen.getPrimaryDisplay().scaleFactor
  if (scale !== 2) {
    ok(`display the goldens are 2x captures; this display is ${scale}x — a 1x golden set would be a second set, not this one`, false, `scaleFactor ${scale}`)
    console.log('\n' + '='.repeat(60)); console.log(`0/1 passed`); clearTimeout(watchdog); app.exit(1); return
  }
  const started = Date.now()
  const dir = mkdtempSync(join(tmpdir(), 'tc visual '))
  console.log(`[verify:visual] painting into ${dir}${UPDATE ? ' (UPDATING GOLDENS)' : ''}`)
  const shot = await runShot(dir)
  const manifestPath = join(dir, 'manifest.json')
  if (shot.code !== 0 || !existsSync(manifestPath)) {
    ok('harness the shot harness painted its scenes and wrote a manifest', false, `exit ${shot.code}; tail: ${shot.out.slice(-600)}`)
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    ok(`harness the shot harness painted ${manifest.length} scenes`, manifest.length >= 50, `${manifest.length} scenes`)
    mkdirSync(GOLDENS, { recursive: true })
    mkdirSync(DIFFS, { recursive: true })
    for (const scene of manifest) {
      const name = scene.file.replace(/\.png$/, '')
      const capture = join(dir, scene.file)
      const golden = join(GOLDENS, scene.file)
      if (scene.failed !== undefined || !existsSync(capture)) {
        ok(`${name} FAIL — the harness could not paint it`, false, scene.failed || 'no capture')
        continue
      }
      if (UPDATE) {
        const small = halved(capture)
        if (small === null) { ok(`${name} FAIL — the capture could not be decoded`, false, capture); continue }
        // A golden that still PASSES is kept byte for byte: a PNG re-encode
        // of the same pixels is a different file, and an update that
        // rewrote all fifty-four goldens for one changed scene made every
        // update a 14 MB commit and `git log -- goldens` say nothing.
        if (existsSync(golden)) {
          const g = decode(nativeImage.createFromPath(golden))
          const f = decode(small)
          if (g !== null && f !== null && g.width === f.width && g.height === f.height) {
            const { ratio, worstTile } = compare(g, f)
            if (ratio <= PIXEL_BUDGET && worstTile <= TILE_BUDGET) { ok(`${name} golden kept`, true, `unchanged within both budgets (${(ratio * 100).toFixed(3)}%)`); continue }
          }
        }
        writeFileSync(golden, small.toPNG())
        ok(`${name} golden written`, true, `${golden} at ${GOLDEN_SCALE}x`)
        continue
      }
      if (!existsSync(golden)) {
        ok(`${name} MISSING — no golden`, false, `UPDATE_GOLDENS=1 npm run verify:visual after looking at ${capture}`)
        continue
      }
      const g = decode(nativeImage.createFromPath(golden))
      const f = decode(halved(capture))
      if (g === null || f === null) { ok(`${name} FAIL — a PNG could not be decoded`, false, `golden=${g !== null} fresh=${f !== null}`); continue }
      if (g.width !== f.width || g.height !== f.height) {
        ok(`${name} FAIL — the size changed`, false, `golden ${g.width}x${g.height}, fresh ${f.width}x${f.height}`)
        continue
      }
      const { differing, ratio, worstTile, worstAt, diff } = compare(g, f)
      const pct = (ratio * 100).toFixed(3)
      const tilePct = (worstTile * 100).toFixed(0)
      if (ratio > PIXEL_BUDGET || worstTile > TILE_BUDGET) {
        const diffPath = join(DIFFS, `${name}.diff.png`)
        writeFileSync(diffPath, nativeImage.createFromBitmap(diff, { width: g.width, height: g.height }).toPNG())
        writeFileSync(join(DIFFS, `${name}.fresh.png`), halved(capture).toPNG())
        const why = ratio > PIXEL_BUDGET ? `${pct}% of pixels differ (budget ${(PIXEL_BUDGET * 100).toFixed(1)}%)` : `a ${TILE}px tile at ${worstAt.join(',')} is ${tilePct}% different (budget ${(TILE_BUDGET * 100).toFixed(0)}%)`
        ok(`${name} FAIL — ${why}`, false, `diff: ${diffPath}; fresh: ${join(DIFFS, `${name}.fresh.png`)}`)
      } else {
        ok(`${name}`, true, `${pct}% differ (${differing} px); worst tile ${tilePct}%`)
      }
    }
    if (!UPDATE) {
      // A golden with no scene is a scene that was removed from the harness
      // without its golden going with it — the suite would say nothing about it.
      const stray = readdirSync(GOLDENS).filter((f) => f.endsWith('.png') && !manifest.some((s) => s.file === f))
      ok('goldens every golden names a scene the harness still declares', stray.length === 0, stray.length ? `stray: ${stray.join(', ')}` : `${manifest.length} goldens`)
    }
  }
  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  console.log(`[verify:visual] ${((Date.now() - started) / 1000).toFixed(1)}s wall`)
  clearTimeout(watchdog)
  app.exit(failed.length ? 1 : 0)
}).catch((error) => {
  // A THROW IN A REAL-ELECTRON HARNESS HANGS WITHOUT THIS. `app.whenReady()
  // .then(async () => ...)` with no catch turns any throw into an unhandled
  // rejection: nothing calls app.exit, the hidden window stays open, and the
  // suite reads as a suite that is still running. CLAUDE.md names that shape
  // directly — "the trap manifests as a HANG, not a red suite" — and a chain
  // of ~40 suites that stops dead with no message is the most expensive
  // failure this harness can produce, because it does not even say which
  // suite stopped. Print the error, name the script, exit non-zero.
  console.log(`\n${SCRIPT_NAME} threw before it could report: ${(error && error.stack) || error}`)
  app.exit(1)
})
