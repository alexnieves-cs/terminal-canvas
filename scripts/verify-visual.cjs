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

   UPDATING GOLDENS. `UPDATE_GOLDENS=1 npm run verify:visual` writes every
   fresh capture over its golden and exits 0. Do it only after LOOKING at the
   fresh image and the diff and deciding the change is the intended one; an
   update made to turn a red green is this suite switched off. A milestone
   that changes a scene commits its golden in the same commit as the change,
   so `git log -- verify/visual/goldens` is the visual changelog. */
const { app, nativeImage } = require('electron')
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
// A scene FAILS when this fraction of its pixels differ. A moved control, a
// lost row or a changed word is orders of magnitude more than half a percent;
// a cursor blink or a clock digit is orders of magnitude less.
const PIXEL_BUDGET = 0.005 // of the frame: a moved control is far over it, a blinking cursor far under
// Goldens and captures are compared at HALF the painted size. A 1440x900
// capture of a WebGL terminal is ~650 KB of PNG and 53 of them are 34 MB per
// golden refresh — a cost the repository would pay on every visual change.
// At half size a moved control, a lost row or a changed colour is still
// orders of magnitude over the budget, and the antialiasing jitter that sits
// under the tolerance shrinks with it. The fresh capture is resized the same
// way before the comparison, so the two sides see one scale.
const GOLDEN_SCALE = 0.5
// The whole run: the harness paints 54 scenes in about two and a half minutes.
// Measured (M149): two runs of 159.2 s and 159.2 s, alone in the Electron
// tier, times 1.25 — the M135 rule; re-measure when a milestone adds scenes.
const WATCHDOG_MS = 200000

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

/** Differing-pixel count and a diff bitmap: the golden dimmed, differing pixels painted red. */
function compare(golden, fresh) {
  const total = golden.width * golden.height
  const diff = Buffer.alloc(total * 4)
  let differing = 0
  for (let i = 0; i < total; i++) {
    const o = i * 4
    const dB = Math.abs(golden.bytes[o] - fresh.bytes[o])
    const dG = Math.abs(golden.bytes[o + 1] - fresh.bytes[o + 1])
    const dR = Math.abs(golden.bytes[o + 2] - fresh.bytes[o + 2])
    const differs = dB > CHANNEL_TOLERANCE || dG > CHANNEL_TOLERANCE || dR > CHANNEL_TOLERANCE
    if (differs) {
      differing += 1
      diff[o] = 40; diff[o + 1] = 40; diff[o + 2] = 230; diff[o + 3] = 255
    } else {
      diff[o] = golden.bytes[o] >> 2; diff[o + 1] = golden.bytes[o + 1] >> 2; diff[o + 2] = golden.bytes[o + 2] >> 2; diff[o + 3] = 255
    }
  }
  return { differing, ratio: differing / total, diff }
}

function runShot(dir) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'shot'], { cwd: ROOT, env: { ...process.env, SHOT_DIR: dir, ELECTRON_RUN_AS_NODE: undefined }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => { out += String(d) })
    child.stderr.on('data', (d) => { out += String(d) })
    child.on('exit', (code) => resolve({ code, out }))
    child.on('error', (error) => resolve({ code: -1, out: String(error) }))
  })
}

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => {
    console.error(`\nFAIL  watchdog — run did not finish within ${WATCHDOG_MS}ms`)
    app.exit(1)
  }, WATCHDOG_MS)
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
      const { differing, ratio, diff } = compare(g, f)
      const pct = (ratio * 100).toFixed(3)
      if (ratio > PIXEL_BUDGET) {
        const diffPath = join(DIFFS, `${name}.diff.png`)
        writeFileSync(diffPath, nativeImage.createFromBitmap(diff, { width: g.width, height: g.height }).toPNG())
        writeFileSync(join(DIFFS, `${name}.fresh.png`), halved(capture).toPNG())
        ok(`${name} FAIL — ${pct}% of pixels differ (budget ${(PIXEL_BUDGET * 100).toFixed(1)}%)`, false, `diff: ${diffPath}; fresh: ${join(DIFFS, `${name}.fresh.png`)}`)
      } else {
        ok(`${name}`, true, `${pct}% differ (${differing} px)`)
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
})
