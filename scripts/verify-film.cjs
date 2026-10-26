/* Run with: node scripts/verify-film.cjs
   Lane L (M561–M564): the night as a film (docs/streams/bold.md). Plain node:
   the script, the frame model, the MP4 writer and main's two doors are each
   bundled with esbuild and driven with fixtures. Drawing and encoding need a
   browser's canvas and WebCodecs, so they are checked by reading the source
   here and by the real render in scripts/film-sample.cjs, which is hand-run.
   Every check reports even when its module fails to load. */
const { buildSync } = require('esbuild')
const { readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ALIAS = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
function load(entry, name) {
  try {
    const outfile = join(ROOT, 'out/verify', `film-${name}.cjs`)
    buildSync({ entryPoints: [join(ROOT, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', alias: ALIAS, logLevel: 'silent' })
    return { mod: require(outfile) }
  } catch (error) {
    return { error: error.message.split('\n')[0] }
  }
}
const check = (id, loaded, test) => {
  if (loaded.mod === undefined) { ok(id, false, loaded.error); return }
  try {
    const r = test(loaded.mod)
    ok(id, r.pass, JSON.stringify(r.detail).slice(0, 400))
  } catch (error) { ok(id, false, error.message) }
}
const checkAsync = async (id, loaded, test) => {
  if (loaded.mod === undefined) { ok(id, false, loaded.error); return }
  try {
    const r = await test(loaded.mod)
    ok(id, r.pass, JSON.stringify(r.detail).slice(0, 400))
  } catch (error) { ok(id, false, error.message) }
}
const src = (p) => readFileSync(join(ROOT, p), 'utf8')

const film = load('src/shared/night-film.ts', 'script')
const sample = load('src/shared/night-film-sample.ts', 'sample')
const mux = load('src/shared/mp4-mux.ts', 'mux')
const doors = load('src/main/film-export.ts', 'doors')

const TOKEN = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'
const MIN = 60_000
const FROM = Date.UTC(2026, 9, 25, 23, 0)
const TO = FROM + 8 * 60 * MIN
const clock = (ms) => new Date(ms).toISOString().slice(11, 16)
const ev = (t, event, panelId, title) => ({ kind: 'event', row: { kind: 'event', runId: `r-${panelId}`, at: t, event, source: 'agent', title, panelId } })
const cmd = (panelId, command, end, exitCode) => ({ kind: 'command', row: { panelId, command, cwd: '/x', startedAt: end - MIN, endedAt: end, exitCode } })
const P = (id, x) => ({ id, label: `panel ${id}`, kind: 'terminal', rect: { x, y: 0, w: 400, h: 300 } })
const base = (extra = {}) => ({ from: FROM, to: TO, clock, panels: [P('a', 0), P('b', 500)], timeline: [], ...extra })

// Every string a frame could draw: labels, captions, body lines, clock, cards.
const wordsOf = (L, script) => {
  const out = [script.title, script.subtitle, script.fromWords, script.toWords, ...script.queue.map((q) => q.text), ...script.panels.map((p) => p.label), ...script.shots.map((s) => s.caption)]
  for (let t = 0; t <= script.durationMs; t += 250) {
    const f = L.filmFrame(script, t, clock)
    out.push(f.clock, ...(f.caption === null ? [] : [f.caption.text]), ...f.panels.flatMap((p) => [p.label, ...(p.line === undefined ? [] : [p.line])]))
  }
  return out
}

// M561 — film.script.1. The sample night fits the fixed timeline: at most
//   FILM_SHOTS_MAX shots, in order, never closer than the gap, all inside
//   the night section — so the title card and the morning queue are never
//   cut into by a cluster of shots.
check('film.script.1 the sample night is a 60-second script: shots in order, inside the night section, never closer than the gap, at most the cap', film, (L) => {
  const s = L.nightFilmScript(sample.mod.sampleNight())
  const gaps = s.shots.slice(1).map((x, i) => x.at - s.shots[i].at)
  return {
    pass: s.durationMs === 60000 && s.shots.length > 5 && s.shots.length <= L.FILM_SHOTS_MAX &&
      gaps.every((g) => g >= L.FILM_SHOT_GAP_MS - 1e-6) &&
      s.shots.every((x) => x.at >= L.FILM_NIGHT_FROM && x.at + x.dur <= L.FILM_NIGHT_TO + 1e-6 && x.dur > 0) &&
      s.subtitle === '23:10 – 06:40 · 3 tasks · 2 checked' && s.redacted === 0,
    detail: { n: s.shots.length, gaps, subtitle: s.subtitle }
  }
})

// film.script.2. THE GATE. A token planted in a ledger title, a command, a
//   panel's name and a morning-queue line never reaches a word the frames are
//   drawn from, at any frame; the count says four. A film is pixels, so this
//   is the only place a token can be caught.
check('film.script.2 a token planted in a ledger row, a command, a panel name and a queue line reaches no frame; the gate counts all four', film, (L) => {
  const s = L.nightFilmScript(base({
    panels: [{ ...P('a', 0), label: `deploy ${TOKEN}` }, P('b', 500)],
    timeline: [ev(FROM + 60 * MIN, 'dispatch', 'b', `Dispatched with ${TOKEN}`), cmd('b', `curl -H "Authorization: token ${TOKEN}"`, FROM + 90 * MIN, 1)],
    queue: [{ kind: 'failed', itemId: 'i', title: 'deploy', text: `set ${TOKEN}` }]
  }))
  const leaked = wordsOf(L, s).filter((w) => w.includes(TOKEN.slice(0, 12)))
  return { pass: leaked.length === 0 && s.redacted === 4, detail: { leaked, redacted: s.redacted } }
})

// film.script.3. Scrub, THEN clip. A token that straddles the caption's
//   length limit would lose its tail to a clip-first and slip under the
//   scrubber's pattern with its head intact.
check('film.script.3 a token straddling the caption limit is scrubbed before the caption is clipped — not even its head reaches the frame', film, (L) => {
  const pad = 'x'.repeat(L.FILM_CAPTION_MAX - 20)
  const s = L.nightFilmScript(base({ timeline: [ev(FROM + 60 * MIN, 'check', 'a', `${pad} ${TOKEN} passed`)] }))
  const leaked = wordsOf(L, s).filter((w) => w.includes('ghp_A1b2'))
  return { pass: leaked.length === 0 && s.redacted === 1 && s.shots.every((x) => x.caption.length <= L.FILM_CAPTION_MAX), detail: { leaked, caption: s.shots.map((x) => x.caption) } }
})

// film.script.4. A long night keeps its loudest moments: forty passes and
//   one failure at 6am leave the failure on film, and the rest (the two
//   panels' appearances among them) are counted as dropped, never vanishing.
check('film.script.4 a night with more moments than fit keeps its failure and counts what it left out', film, (L) => {
  const passes = Array.from({ length: 40 }, (_, i) => cmd('a', 'npm test', FROM + (i + 1) * 10 * MIN, 0))
  const s = L.nightFilmScript(base({ timeline: [...passes, cmd('b', 'npm run e2e', FROM + 7 * 60 * MIN, 2)] }))
  const failed = s.shots.filter((x) => x.kind === 'failed')
  return { pass: s.shots.length === L.FILM_SHOTS_MAX && failed.length === 1 && failed[0].caption === '`npm run e2e` failed (exit 2)' && s.dropped === 41 + 2 - L.FILM_SHOTS_MAX, detail: { n: s.shots.length, dropped: s.dropped, failed } }
})

// film.script.5. Appearing: a panel with a record from before the night was
//   already there (appearAt 0); one whose first record is inside the night
//   fades in at its first shot. A Tonight "Started" and its dispatch row are
//   one moment, not two shots.
check('film.script.5 a panel recorded before the night is already there; a new one appears with its first start, and a start and its dispatch are one shot', film, (L) => {
  const s = L.nightFilmScript(base({
    timeline: [cmd('a', 'ls', FROM - 30 * MIN, 0), ev(FROM + 61 * MIN, 'dispatch', 'b', 'Dispatched: fix it')],
    tonight: { state: 'done', startedAt: FROM, endedAt: TO, awake: false, tasks: [{ id: 't', panelId: 'b', title: 'Fix it', state: 'claimed', attempts: 1, spentUsd: 0, checkFailures: 0, startedAt: FROM + 60 * MIN, endedAt: FROM + 120 * MIN }] }
  }))
  const a = s.panels.find((p) => p.id === 'a'), b = s.panels.find((p) => p.id === 'b')
  const starts = s.shots.filter((x) => x.panelId === 'b' && (x.kind === 'appear' || x.kind === 'working'))
  return { pass: a.appearAt === 0 && b.appearAt > 0 && starts.length === 1 && starts[0].caption === 'Started: Fix it' && starts[0].at === b.appearAt, detail: { a: a.appearAt, b: b.appearAt, shots: s.shots } }
})

// film.script.6. Only the night: rows before or after the window are not
//   shots, tool rows are never shots, and a row about a panel that is no
//   longer on the canvas keeps its caption but flies the camera nowhere.
check('film.script.6 rows outside the window and tool rows are not shots; a closed panel\'s row keeps its caption without a panel', film, (L) => {
  const s = L.nightFilmScript(base({
    timeline: [ev(FROM - MIN, 'check', 'a', 'before'), ev(TO + MIN, 'check', 'a', 'after'), ev(FROM + 30 * MIN, 'tool', 'a', 'Edit x.ts'), ev(FROM + 40 * MIN, 'check', 'gone', 'Check passed on a closed panel')]
  }))
  return { pass: s.shots.length === 1 && s.shots[0].caption === 'Check passed on a closed panel' && s.shots[0].panelId === undefined && s.tones.length === 0, detail: s.shots }
})

// film.script.7. A panel whose own appear shot was ranked out still fades
//   in no later than its first kept shot, and `seenBefore` from main marks a
//   panel as already there without its older rows crossing the bridge.
check('film.script.7 a panel is never focused before it has faded in, and seenBefore keeps an old panel on screen from the start', film, (L) => {
  const fails = Array.from({ length: 23 }, (_, i) => cmd('a', 'npm test', FROM + (i + 1) * 12 * MIN, 1))
  const s = L.nightFilmScript(base({ seenBefore: ['a'], timeline: [...fails, cmd('b', 'make', FROM + 5 * MIN, 0)] }))
  const a = s.panels.find((p) => p.id === 'a'), b = s.panels.find((p) => p.id === 'b')
  const bShots = s.shots.filter((x) => x.panelId === 'b')
  return { pass: a.appearAt === 0 && bShots.length === 1 && bShots[0].kind === 'passed' && bShots[0].at >= b.appearAt && b.appearAt > 0, detail: { a: a.appearAt, b: b.appearAt, bShots } }
})

// film.frame.1. The frame model: the four scenes at their times, a caption
//   and a focused panel only while a shot holds, the tone a record set, and
//   the same frame for the same t (any frame can be drawn alone).
check('film.frame.1 the frame model: title, night, queue and end at their times; a shot focuses its panel and captions it; tone follows the record; frames are pure', film, (L) => {
  const s = L.nightFilmScript(base({ timeline: [cmd('a', 'npm test', FROM + 4 * 60 * MIN, 1)] }))
  const shot = s.shots.find((x) => x.kind === 'failed')
  const mid = L.filmFrame(s, shot.at + 1000, clock)
  const scenes = [0, 10000, 52000, 59500].map((t) => L.filmFrame(s, t, clock).scene)
  const a = mid.panels.find((p) => p.id === 'a')
  return {
    pass: JSON.stringify(scenes) === '["title","night","queue","end"]' && mid.caption?.text === '`npm test` failed (exit 1)' && a.focus > 0 && a.tone === 'exited' &&
      mid.panels.find((p) => p.id === 'b').focus === 0 && L.filmFrame(s, s.shots[0].at - 1000, clock).caption === null &&
      JSON.stringify(L.filmFrame(s, 20000, clock)) === JSON.stringify(L.filmFrame(s, 20000, clock)) && /^\d\d:\d\d$/.test(mid.clock) && a.opacity === 1 && L.filmFrameCount(s) === 1800,
    detail: { scenes, caption: mid.caption, a, clock: mid.clock }
  }
})

// film.window.1. Which night "Last night" means: the batch when one ran,
//   else the absence, else the last twelve hours; never under half an hour.
check('film.window.1 the night is the Tonight batch (unless it ended over a day ago), else the absence, else twelve hours, and never under half an hour', film, (L) => {
  const now = TO
  const a = L.nightWindow({ startedAt: FROM, endedAt: FROM + 60 * MIN, tasks: [] }, null, now)
  const b = L.nightWindow(null, FROM + 30 * MIN, now)
  const c = L.nightWindow(null, null, now)
  const d = L.nightWindow(null, now - MIN, now)
  const stale = L.nightWindow({ startedAt: FROM - 48 * 60 * MIN, endedAt: FROM - 40 * 60 * MIN, tasks: [] }, null, now)
  return { pass: stale.to === now && stale.from === now - 12 * 60 * MIN && a.from === FROM && a.to === FROM + 60 * MIN && b.from === FROM + 30 * MIN && b.to === now && c.from === now - 12 * 60 * MIN && d.from === now - 30 * MIN, detail: { a, b, c, d } }
})

// M563 — film.mux.1. The MP4 writer: ftyp, then moov (fast start), then mdat;
//   the one chunk offset lands on the first sample's first byte; sizes, key
//   frames and the run-length frame rate read back as written.
check('film.mux.1 the MP4 is ftyp → moov → mdat; stco points at the first sample; stsz, stss and stts read back as written', mux, (M) => {
  const samples = [5, 3, 4, 6].map((n, i) => ({ data: new Uint8Array(n).fill(i + 1), duration: 1000, key: i % 2 === 0 }))
  const bytes = M.muxMp4({ width: 1280, height: 720, timescale: 30000, avcC: new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe0, 0]), samples })
  const top = M.readMp4Boxes(bytes)
  const find = (boxes, path) => path.reduce((b, t) => (b?.children ?? boxes).find((x) => x.type === t) ?? null, null)
  const stbl = find(top, ['moov', 'trak', 'mdia', 'minf', 'stbl'])
  const box = (t) => stbl.children.find((x) => x.type === t)
  const v = new DataView(bytes.buffer, bytes.byteOffset)
  const stco = box('stco'), stsz = box('stsz'), stss = box('stss'), stts = box('stts')
  const offset = v.getUint32(stco.start + 16)
  const sizes = [0, 1, 2, 3].map((i) => v.getUint32(stsz.start + 20 + i * 4))
  const keys = [0, 1].map((i) => v.getUint32(stss.start + 16 + i * 4))
  const mdat = top[2]
  return {
    pass: top.map((b) => b.type).join() === 'ftyp,moov,mdat' && offset === mdat.start + 8 && bytes[offset] === 1 && bytes[offset + 5] === 2 &&
      JSON.stringify(sizes) === '[5,3,4,6]' && JSON.stringify(keys) === '[1,3]' && v.getUint32(stts.start + 12) === 1 && v.getUint32(stts.start + 16) === 4 &&
      bytes.length === offset + 18,
    detail: { top: top.map((b) => b.type), offset, sizes, keys }
  }
})

check('film.mux.2 a film with no frames, or one that does not open on a key frame, is refused by name', mux, (M) => {
  const t = (samples) => { try { M.muxMp4({ width: 2, height: 2, timescale: 30, avcC: new Uint8Array(1), samples }); return 'wrote' } catch (e) { return e.message } }
  const a = t([]), b = t([{ data: new Uint8Array(1), duration: 1, key: false }])
  return { pass: /at least one frame/.test(a) && /key frame/.test(b), detail: { a, b } }
})

// film.door.1–.3. Main's doors, with a fake dialog and write.
const muxed = mux.mod === undefined ? null : mux.mod.muxMp4({ width: 2, height: 2, timescale: 30, avcC: new Uint8Array(1), samples: [{ data: new Uint8Array([9, 9]), duration: 1, key: true }] })
const box = (type, body) => { const n = body.length + 8; return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...[...type].map((c) => c.charCodeAt(0)), ...body] }
const mkDoors = (D, answer) => {
  const writes = []
  const d = D.createFilmDoors({
    timeline: async () => ({ entries: [cmd('old', 'w', FROM - 9 * MIN, 0), cmd('a', 'x', FROM + MIN, 0), ev(FROM + 2 * MIN, 'tool', 'a', 'Edit a.ts'), cmd('a', 'y', TO + MIN, 0), ev(TO + 2 * MIN, 'check', 'a', 'z')], reachedStart: true }),
    tonight: () => null,
    askPath: async () => answer,
    write: (path, data) => writes.push({ path, data: [...data] }),
    now: () => new Date(Date.UTC(2026, 9, 26, 7, 0))
  })
  return { d, writes }
}

;(async () => {
  await checkAsync('film.door.1 the save writes exactly the film\'s bytes where the person picked (always as .mp4), and reports the gate\'s count; cancel writes nothing', doors, async (D) => {
    const yes = mkDoors(D, '/tmp/n')
    const r = await yes.d.nightFilm({ bytes: muxed, seconds: 60, redacted: 2 })
    const no = mkDoors(D, null)
    const c = await no.d.nightFilm({ bytes: muxed, seconds: 60, redacted: 0 })
    return {
      pass: r.kind === 'written' && r.path === '/tmp/n.mp4' && yes.writes[0].path === '/tmp/n.mp4' && r.redacted === 2 && r.seconds === 60 && yes.writes.length === 1 && JSON.stringify(yes.writes[0].data) === JSON.stringify([...muxed]) &&
        c.kind === 'cancelled' && no.writes.length === 0,
      detail: { r, c, writes: yes.writes.length }
    }
  })

  // film.door.2. The door writes only a film of the muxer's shape: any other
  //   bytes are refused before the dialog opens, so it cannot be used to
  //   drop an arbitrary file on disk.
  await checkAsync('film.door.2 bytes that are not a film of the muxer\'s shape, a valid-looking header over junk among them, are refused before the dialog opens', doors, async (D) => {
    let asked = 0
    const d = D.createFilmDoors({ timeline: async () => ({ entries: [], reachedStart: true }), tonight: () => null, askPath: async () => { asked += 1; return '/tmp/x' }, write: () => {} })
    const rs = await Promise.all([
      d.nightFilm({ bytes: new TextEncoder().encode('#!/bin/sh\nrm -rf ~\n'), seconds: 1, redacted: 0 }),
      d.nightFilm({ bytes: new Uint8Array(0), seconds: 1, redacted: 0 }),
      d.nightFilm({ bytes: 'not bytes', seconds: 1, redacted: 0 }),
      d.nightFilm({ bytes: Uint8Array.from([...muxed, 0, 0, 0]), seconds: 1, redacted: 0 }),
      // A file that only LOOKS like a film at the top: ftyp, a moov of junk, and an mdat carrying a script.
      d.nightFilm({ bytes: Uint8Array.from([...box('ftyp', [105, 115, 111, 109]), ...box('moov', [...box('junk', [1, 2, 3])]), ...box('mdat', [...new TextEncoder().encode('#!/bin/sh\n')])]), seconds: 1, redacted: 0 })
    ])
    return { pass: rs.every((r) => r.kind === 'failed') && asked === 0 && D.isFilmBytes(muxed), detail: { rs, asked } }
  })

  await checkAsync('film.door.3 the record read refuses a window that ends first or spans more than a day; it sends only the night\'s rows, no tool rows, and names the panels seen before', doors, async (D) => {
    const { d } = mkDoors(D, null)
    const r = await d.filmNight({ from: FROM, to: TO })
    const a = await d.filmNight({ from: TO, to: FROM })
    const b = await d.filmNight({ from: FROM, to: FROM + 25 * 60 * MIN })
    const c = await d.filmNight({ from: 'x', to: TO })
    return { pass: r.kind === 'ok' && r.entries.length === 1 && r.entries[0].row.command === 'x' && JSON.stringify(r.seenBefore) === '["old"]' && r.tonight === null && a.kind === 'refused' && b.kind === 'refused' && c.kind === 'refused', detail: { r, a, b, c } }
  })

  // film.wire.1. The pieces are joined: main handles both channels and
  //   builds the doors; the morning queue's card carries the button; and the
  //   painter reads nothing but the frame and the script — no live canvas
  //   store, no session, no terminal buffer — so nothing ungated can be drawn.
  {
    const ipc = src('src/main/ipc.ts'), handlers = src('src/main/bootstrap/panel-handlers.ts'), card = src('src/renderer/shell/ReturnBriefing.tsx'), models = src('src/renderer/canvas/useAttentionModels.tsx')
    const paint = src('src/renderer/film/film-paint.ts'), encode = src('src/renderer/film/film-encode.ts')
    const imports = (s) => [...s.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]).sort()
    const paintImports = imports(paint), encodeImports = imports(encode)
    ok('film.wire.1 main handles film:night and export:night-film through createFilmDoors; the briefing card has the Last night button; the painter and encoder import only the frame model, the palette and the muxer',
      /IPC\.FILM_NIGHT/.test(ipc) && /IPC\.EXPORT_NIGHT_FILM/.test(ipc) && /createFilmDoors\(/.test(handlers) && /data-last-night-film/.test(card) && /onLastNight=\{lastNight\.run\}/.test(models) &&
        JSON.stringify(paintImports) === JSON.stringify(['@shared/night-film', '@shared/redesign-contracts', '@shared/state-palette']) &&
        JSON.stringify(encodeImports) === JSON.stringify(['./film-paint', '@shared/mp4-mux', '@shared/night-film']),
      JSON.stringify({ paintImports, encodeImports }))
  }

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
