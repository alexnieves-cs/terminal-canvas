/* The shots gallery (M465). Plain node, no dependency.

   `npm run shot` leaves PNGs and a manifest in a directory; a person deciding
   whether those pictures may become goldens needs to LOOK at them, often on a
   phone, without a Mac or a checkout. This turns a shot directory into one
   static page: every scene with its intent, the capture, and — where a golden
   already exists — the golden one tap away, so a regression shows in the same
   glance the critic brief asks for. A failed scene is listed first and in red,
   never dropped: an empty card is how a missing picture would go unnoticed.

   CLI: node scripts/shot-gallery.cjs <shotDir> <galleryDir> [ext]
   Copies nothing it was not told to: <galleryDir> must already hold
   shots/<scene>.<ext> and, optionally, golden/<scene>.<ext> (the CI job
   converts both to JPEG first, because 100+ full-size PNGs are too heavy for a
   phone). Writes <galleryDir>/index.html and gallery.json. */
const { readFileSync, writeFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const [shotDir, galleryDir, ext = 'png'] = process.argv.slice(2)
if (!shotDir || !galleryDir) { console.error('usage: shot-gallery.cjs <shotDir> <galleryDir> [ext]'); process.exit(2) }

const manifest = JSON.parse(readFileSync(join(shotDir, 'manifest.json'), 'utf8'))
const pendingPath = join(__dirname, '..', 'verify', 'visual', 'pending-goldens.json')
const pending = new Set(existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, 'utf8')).scenes : [])

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const scenes = manifest.map((m) => {
  const name = m.file.replace(/\.png$/, '')
  const shot = `shots/${name}.${ext}`
  const golden = `golden/${name}.${ext}`
  return {
    name,
    intent: m.intent || '',
    failed: m.failed || null,
    shot: existsSync(join(galleryDir, shot)) ? shot : null,
    golden: existsSync(join(galleryDir, golden)) ? golden : null,
    pending: pending.has(name)
  }
})
// Failures first, then scenes with no golden yet (the ones a person is being
// asked to approve), then the rest in harness order.
const rank = (s) => (s.failed || !s.shot ? 0 : !s.golden ? 1 : 2)
const ordered = scenes.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([s]) => s)

const counts = {
  scenes: scenes.length,
  failed: scenes.filter((s) => s.failed || !s.shot).length,
  noGolden: scenes.filter((s) => !s.failed && s.shot && !s.golden).length
}
const meta = {
  run: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  sha: process.env.GITHUB_SHA || null,
  ref: process.env.GITHUB_REF_NAME || null,
  at: new Date().toISOString()
}

const card = (s) => {
  const badge = s.failed || !s.shot ? '<span class="b b-fail">failed</span>'
    : !s.golden ? `<span class="b b-new">${s.pending ? 'awaiting golden' : 'no golden'}</span>`
    : '<span class="b">has golden</span>'
  const img = s.shot
    ? `<button class="pic" data-shot="${esc(s.shot)}"${s.golden ? ` data-golden="${esc(s.golden)}"` : ''} aria-label="${s.golden ? 'Tap to compare with the golden' : 'Open full size'}"><img loading="lazy" src="${esc(s.shot)}" alt="${esc(s.name)}"><span class="which">${s.golden ? 'new · tap for golden' : 'new'}</span></button>`
    : ''
  return `<article id="${esc(s.name)}" class="${s.failed || !s.shot ? 'fail' : ''}">
<header><h2><a href="#${esc(s.name)}">${esc(s.name)}</a></h2>${badge}</header>
${img}
<p>${esc(s.intent)}</p>${s.failed ? `<pre>${esc(s.failed)}</pre>` : ''}
</article>`
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Terminal Canvas shots</title>
<style>
:root{--bg:#f6f6f4;--fg:#1d1d1b;--mut:#6b6b66;--card:#fff;--line:#e3e2dd;--fail:#b3261e;--new:#8a5a00}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--mut:#a3a29c;--card:#1f1f1d;--line:#33332f;--fail:#f2b8b5;--new:#f0c674}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:8px 0 4px}.sum{color:var(--mut);margin:0 0 12px}.sum a{color:inherit}
nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}nav button{font:inherit;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg)}nav button[aria-pressed=true]{background:var(--fg);color:var(--bg)}
article{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:0 0 14px}
article.fail{border-color:var(--fail)}
header{display:flex;align-items:center;gap:8px;justify-content:space-between}
h2{font-size:15px;margin:0;word-break:break-all}h2 a{color:inherit;text-decoration:none}
.b{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--mut);white-space:nowrap}.b-fail{color:var(--fail);border-color:var(--fail)}.b-new{color:var(--new);border-color:var(--new)}
.pic{position:relative;display:block;width:100%;padding:0;margin:10px 0 6px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:none;cursor:pointer}
.pic img{display:block;width:100%;height:auto}
.which{position:absolute;left:8px;bottom:8px;font-size:12px;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.65);color:#fff}
.pic.g .which{background:#8a5a00}
p{margin:4px 0 0;color:var(--mut);font-size:13px}pre{white-space:pre-wrap;color:var(--fail);font-size:12px}
</style></head><body><main>
<h1>Terminal Canvas shots</h1>
<p class="sum">${counts.scenes} scenes · ${counts.failed} failed · ${counts.noGolden} with no golden yet${meta.ref ? ` · ${esc(meta.ref)}` : ''}${meta.sha ? ` @ ${esc(meta.sha.slice(0, 7))}` : ''}${meta.run ? ` · <a href="${esc(meta.run)}">run</a>` : ''} · ${esc(meta.at.slice(0, 16).replace('T', ' '))} UTC</p>
<nav><button data-f="all" aria-pressed="true">All</button><button data-f="new" aria-pressed="false">No golden yet</button><button data-f="fail" aria-pressed="false">Failed</button></nav>
${ordered.map(card).join('\n')}
</main>
<script>
document.querySelectorAll('.pic').forEach(function (b) {
  b.addEventListener('click', function () {
    var img = b.querySelector('img'), label = b.querySelector('.which')
    if (!b.dataset.golden) { window.open(b.dataset.shot, '_blank'); return }
    var g = b.classList.toggle('g')
    img.src = g ? b.dataset.golden : b.dataset.shot
    label.textContent = g ? 'golden · tap for new' : 'new · tap for golden'
  })
})
document.querySelectorAll('nav button').forEach(function (n) {
  n.addEventListener('click', function () {
    document.querySelectorAll('nav button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === n)) })
    document.querySelectorAll('article').forEach(function (a) {
      var badge = a.querySelector('.b'), f = n.dataset.f
      a.hidden = f === 'all' ? false : f === 'fail' ? !badge.classList.contains('b-fail') : !badge.classList.contains('b-new')
    })
  })
})
</script></body></html>
`
writeFileSync(join(galleryDir, 'index.html'), html)
writeFileSync(join(galleryDir, 'gallery.json'), JSON.stringify({ ...meta, counts, scenes }, null, 2))
console.log(`gallery: ${counts.scenes} scenes, ${counts.failed} failed, ${counts.noGolden} without a golden → ${join(galleryDir, 'index.html')}`)
