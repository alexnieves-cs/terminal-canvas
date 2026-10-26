/* Hand-run, outside the verify chain:
     node_modules/.bin/electron scripts/film-sample.cjs
   (on Linux add `--no-sandbox` and run under xvfb-run).

   M564 (lane L). Renders the SAMPLE night (src/shared/night-film-sample.ts)
   with the app's own film code — the same script, painter, encoder and
   muxer the "Last night" button runs — in a hidden Electron window, and
   writes out/film-sample/night-film.mp4. With ffmpeg on PATH it turns that
   into docs/assets/night-film.gif for the README, which cannot play an MP4
   that lives in the repository; the MP4 itself is not committed (a minute
   of film is several MB, and the GIF is what a reader sees). The data is
   sample data and the README says so. */
const { app, BrowserWindow } = require('electron')
const { buildSync } = require('esbuild')
const { execFileSync } = require('node:child_process')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'out/film-sample')
const ASSETS = join(ROOT, 'docs/assets')

const ENTRY = `
import { nightFilmScript } from '@shared/night-film'
import { sampleClock, sampleNight } from '@shared/night-film-sample'
import { encodeFilm } from '@renderer/film/film-encode'
;(window as unknown as { renderSample: () => Promise<unknown> }).renderSample = async () => {
  const script = nightFilmScript(sampleNight())
  const film = await encodeFilm(script, { clock: sampleClock })
  return { bytes: Array.from(film.bytes), frames: film.frames, codec: film.codec, shots: script.shots.length, redacted: script.redacted }
}
`

app.whenReady().then(async () => {
  try {
    mkdirSync(OUT, { recursive: true })
    buildSync({
      stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts' },
      outfile: join(OUT, 'film.js'), bundle: true, format: 'iife', platform: 'browser',
      alias: { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }, logLevel: 'silent'
    })
    writeFileSync(join(OUT, 'index.html'), '<!doctype html><meta charset="utf-8"><script src="film.js"></script>')
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
    await win.loadFile(join(OUT, 'index.html'))
    const r = await win.webContents.executeJavaScript('window.renderSample()')
    mkdirSync(ASSETS, { recursive: true })
    const mp4 = join(OUT, 'night-film.mp4')
    writeFileSync(mp4, Buffer.from(r.bytes))
    console.log(`wrote ${mp4}: ${r.frames} frames, ${r.codec}, ${r.shots} shots, ${(r.bytes.length / 1e6).toFixed(1)} MB`)
    try {
      const gif = join(ASSETS, 'night-film.gif')
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', 'fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle', gif])
      console.log(`wrote ${gif}`)
    } catch (error) {
      console.log(`no GIF: ${error.message.split('\n')[0]}`)
    }
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
