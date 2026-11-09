/* The Pages site: the landing page at the root, the user guide under /docs/
   and the browser demo under /demo/. Run after `npm run build:web`; pages.yml
   uploads out/site.

   The demo is built exactly as before into out/web and copied whole into
   out/site/demo/. vite.web.config.ts builds with `base: './'`, so every URL
   the demo makes is relative to its own index.html and moves with it; the
   demo's build and its smoke test need to know nothing about the move.

   The landing page is plain HTML and CSS in site/, with no build step and no
   script.

   M632. The user guide is docs/guide/*.md, the same files GitHub renders in
   the repository, turned into pages here. One source on purpose: a guide kept
   twice is a guide that disagrees with itself. Each page is parsed by the
   app's OWN Markdown grammar (see loadGrammar) and written into the frame
   below, and three kinds of link are rewritten, because a path that is right
   on github.com is wrong on Pages:
   - a link to another guide page (`review.md#x`) becomes `./review.html#x`;
   - any other relative link leaves the guide, so it points at the file on
     github.com;
   - a picture is copied next to the site and its `src` follows it.

   PICTURES ARE THE REAL APP. `shots/<scene>.png` is
   verify/visual/goldens/<scene>.png, the reference verify:visual compares a
   Mac runner's capture against, so the site and the README can only show what
   the app really paints, and a re-taken golden updates both with no copy to
   forget. `assets/<file>` is docs/assets/<file>.

   Two things fail the build rather than ship quietly: a relative link that
   resolves to nothing in out/site (GitHub Pages answers a missing file with a
   404 and no error), and a guide page this script does not name (a page
   written and never published). */
const { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('fs')
const { dirname, join, posix, resolve } = require('path')

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'out/site')
const WEB = join(ROOT, 'out/web')
const GUIDE = join(ROOT, 'docs/guide')
const GOLDENS = join(ROOT, 'verify/visual/goldens')
const REPO = 'https://github.com/alexnieves-cs/terminal-canvas'

/** The guide's pages in reading order: [source file, page name, label in the side list]. */
const PAGES = [
  ['README.md', 'index', 'Overview'],
  ['install.md', 'install', 'Install'],
  ['first-task.md', 'first-task', 'Your first task'],
  ['review.md', 'review', 'Review'],
  ['overnight.md', 'overnight', 'Overnight'],
  ['keyboard.md', 'keyboard', 'Keyboard'],
  ['agents.md', 'agents', 'Supported agents'],
  ['faq.md', 'faq', 'FAQ'],
  ['compare.md', 'compare', 'Comparison']
]

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
const slug = (text) => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/ /g, '-')

/** A PNG's pixel size from its IHDR, so the page reserves the picture's space before it loads. */
function pngSize(file) {
  const b = readFileSync(file)
  return b.length > 24 && b.toString('latin1', 1, 4) === 'PNG' ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null
}

/** Copy one site-relative picture (`shots/x.png`, `assets/y.gif`) into out/site. False when its source does not exist. */
function copyPicture(ref) {
  const from = ref.startsWith('shots/') ? join(GOLDENS, ref.slice('shots/'.length)) : ref.startsWith('assets/') ? join(ROOT, 'docs', ref) : null
  if (from === null || !existsSync(from)) return false
  mkdirSync(dirname(join(OUT, ref)), { recursive: true })
  cpSync(from, join(OUT, ref))
  return true
}

function frame({ title, description, name, body }) {
  const side = PAGES.map(([, page, label]) => `<li><a href="./${page === 'index' ? '' : `${page}.html`}"${page === name ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`).join('\n            ')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} · Terminal Canvas</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="color-scheme" content="dark light" />
    <!-- No script on this page at all: it is words, pictures and links. -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'" />
    <link rel="icon" type="image/png" href="../assets/logo.png" />
    <link rel="stylesheet" href="../site.css" />
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="top">
      <a class="brand" href="../">
        <img src="../assets/logo.png" alt="" width="28" height="28" />
        <span>Terminal Canvas</span>
      </a>
      <nav aria-label="Site">
        <a href="./">Docs</a>
        <a href="../demo/">Live demo</a>
        <a href="${REPO}/releases/latest">Download</a>
        <a href="${REPO}">GitHub</a>
      </nav>
    </header>
    <div class="docs">
      <nav class="docs__side" aria-label="Guide">
        <ul>
            ${side}
        </ul>
      </nav>
      <main id="main" class="docs__page">
${body}
        <p class="docs__edit"><a href="${REPO}/blob/main/docs/guide/${PAGES.find((p) => p[1] === name)[0]}">Edit this page on GitHub</a></p>
      </main>
    </div>
    <footer class="foot">
      <span>MIT licensed</span>
      <a href="${REPO}">Source</a>
      <a href="${REPO}/releases">Releases</a>
      <a href="${REPO}/issues/new?template=feedback.yml">Feedback</a>
    </footer>
  </body>
</html>
`
}

/**
 * The app's own Markdown grammar (src/shared/markdown.ts, with the deck's
 * `slides` option for pictures and tables), bundled the way ipc-list.cjs
 * bundles the contract. NOT a Markdown library: verify:deck deck.deps.1
 * refuses one by name, because this repository renders Markdown with one
 * small closed grammar and a second renderer is a second set of answers to
 * "what does this line mean". The price is that the guide is written inside
 * that grammar: headings to three levels, paragraphs, flat lists, fenced
 * code, a picture on its own line, pipe tables, and code, bold, italic and
 * links inline. Anything else comes out as a paragraph of its own source,
 * which is loud on the page.
 */
function loadGrammar() {
  const { buildSync } = require('esbuild')
  const out = join(ROOT, 'out', 'verify', 'site-markdown.cjs')
  mkdirSync(dirname(out), { recursive: true })
  buildSync({ entryPoints: [join(ROOT, 'src', 'shared', 'markdown.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error' })
  delete require.cache[out]
  return require(out)
}

/**
 * Two things GitHub's renderer accepts and the grammar does not, removed
 * before parsing so the source can stay readable at 100 columns:
 * - an HTML comment on its own line (the guide:keys markers);
 * - a list item wrapped onto indented continuation lines, which the grammar
 *   would end the list at. They are joined back into their item.
 */
function normalize(md) {
  const out = []
  let inFence = false
  let inItem = false
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) { inFence = !inFence; inItem = false; out.push(line); continue }
    if (inFence) { out.push(line); continue }
    if (/^\s*<!--.*-->\s*$/.test(line)) continue
    const isItem = /^\s*(?:[-*]|\d+[.)])\s+/.test(line)
    if (inItem && !isItem && /^\s{2,}\S/.test(line)) { out[out.length - 1] += ` ${line.trim()}`; continue }
    inItem = isItem
    out.push(line)
  }
  return out.join('\n')
}

function renderGuide() {
  const { parseMarkdown } = loadGrammar()
  const onDisk = readdirSync(GUIDE).filter((f) => f.endsWith('.md')).sort()
  const named = PAGES.map((p) => p[0]).sort()
  if (onDisk.join() !== named.join()) {
    console.error(`docs/guide and build-site.cjs PAGES disagree: on disk [${onDisk.join(', ')}], named [${named.join(', ')}]`)
    process.exit(1)
  }
  const pageOf = new Map(PAGES.map(([file, page]) => [file, page === 'index' ? './' : `./${page}.html`]))
  mkdirSync(join(OUT, 'docs'), { recursive: true })

  for (const [file, name] of PAGES) {
    const md = readFileSync(join(GUIDE, file), 'utf8')
    const problems = []
    const href = (raw) => {
      if (/^(https?:|mailto:|#)/.test(raw)) return raw
      const [path, hash = ''] = raw.split('#')
      if (pageOf.has(path)) return pageOf.get(path) + (hash === '' ? '' : `#${hash}`)
      // Anything else leaves the guide: the file on github.com, resolved from docs/guide/.
      const target = posix.normalize(posix.join('docs/guide', path))
      if (target.startsWith('..') || !existsSync(join(ROOT, target))) problems.push(`link to ${raw}`)
      return `${REPO}/blob/main/${target}${hash === '' ? '' : `#${hash}`}`
    }
    const inline = (runs) => runs.map((r) =>
      r.kind === 'text' ? esc(r.text)
        : r.kind === 'code' ? `<code>${esc(r.text)}</code>`
          : r.kind === 'bold' ? `<strong>${inline(r.children)}</strong>`
            : r.kind === 'italic' ? `<em>${inline(r.children)}</em>`
              : `<a href="${esc(href(r.href))}">${esc(r.text)}</a>`).join('')
    const text = (runs) => runs.map((r) => r.kind === 'text' || r.kind === 'code' || r.kind === 'link' ? r.text : text(r.children)).join('')
    const picture = (src, alt) => {
      const target = posix.normalize(posix.join('docs/guide', src))
      const ref = target.startsWith('verify/visual/goldens/') ? `shots/${target.slice('verify/visual/goldens/'.length)}` : target.startsWith('docs/assets/') ? target.slice('docs/'.length) : null
      if (ref === null || !copyPicture(ref)) { problems.push(`picture ${src}`); return '' }
      const size = ref.endsWith('.png') ? pngSize(join(OUT, ref)) : null
      const dims = size === null ? '' : ` width="${size.width}" height="${size.height}"`
      return `<figure class="shot"><img src="../${esc(ref)}"${dims} loading="lazy" alt="${esc(alt)}" /></figure>`
    }
    const block = (b) => {
      switch (b.kind) {
        case 'heading': return `<h${b.level} id="${slug(text(b.children))}">${inline(b.children)}</h${b.level}>`
        case 'paragraph': return `<p>${inline(b.children)}</p>`
        case 'list': { const tag = b.ordered ? 'ol' : 'ul'; return `<${tag}>\n${b.items.map((item) => `<li>${inline(item)}</li>`).join('\n')}\n</${tag}>` }
        case 'code': return `<pre><code>${esc(b.text)}</code></pre>`
        case 'image': return picture(b.src, b.alt)
        // A wide table scrolls inside its own box instead of pushing the page sideways on a phone.
        case 'table': return `<div class="docs__table"><table><thead><tr>${b.header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>\n${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n')}\n</tbody></table></div>`
        default: return ''
      }
    }
    const blocks = parseMarkdown(normalize(md), { slides: true })
    const body = blocks.map(block).join('\n')
    if (problems.length > 0) {
      console.error(`docs/guide/${file}: ${problems.join('; ')} resolves to nothing in the repository`)
      process.exit(1)
    }
    // The grammar has no raw HTML, so a tag or a stray marker in the source
    // reaches the page as its own text. Fail here instead of publishing it.
    const leaked = blocks.filter((b) => b.kind === 'paragraph').map((b) => text(b.children)).find((t) => /^\s*(?:<[a-z!/]|\||```|#{1,6}\s|!\[)/i.test(t))
    if (leaked !== undefined) {
      console.error(`docs/guide/${file} has a block outside the site's Markdown grammar: ${JSON.stringify(leaked.slice(0, 80))}`)
      process.exit(1)
    }
    const title = (md.match(/^# (.+)$/m) ?? ['', 'Terminal Canvas'])[1]
    const first = blocks.find((b) => b.kind === 'paragraph')
    const description = first === undefined ? title : text(first.children).replace(/\s+/g, ' ').trim().slice(0, 200)
    writeFileSync(join(OUT, 'docs', `${name}.html`), frame({ title, description, name, body }))
  }
}

/** Every relative href and src in out/site's own pages (never the demo's) that resolves to no file. */
function missingLinks() {
  const pages = ['index.html', ...PAGES.map(([, name]) => `docs/${name}.html`)]
  const missing = []
  let count = 0
  for (const page of pages) {
    const html = readFileSync(join(OUT, page), 'utf8')
    for (const m of html.matchAll(/(?:href|src)="(\.\.?\/[^"#?]*)/g)) {
      count += 1
      const target = posix.normalize(posix.join(posix.dirname(page), m[1]))
      const file = target === '.' || target === './' ? 'index.html' : target.endsWith('/') ? `${target}index.html` : target
      if (file.startsWith('..') || !existsSync(join(OUT, file))) missing.push(`${page} → ${m[1]}`)
    }
  }
  return { missing, count }
}

function build() {
  if (!existsSync(join(WEB, 'index.html'))) {
    console.error('out/web/index.html is missing: run `npm run build:web` first')
    process.exit(1)
  }

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  cpSync(join(ROOT, 'site'), OUT, { recursive: true })
  cpSync(WEB, join(OUT, 'demo'), { recursive: true })

  const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8')
  for (const m of html.matchAll(/(?:href|src)="\.\/((?:shots|assets)\/[^"#?]*)/g)) copyPicture(m[1])
  // The og:image is absolute (a crawler needs a full URL), so the pattern above
  // does not see it; the guide's frame names the logo the same way. Copy both by name.
  copyPicture('assets/social-preview.png')
  copyPicture('assets/logo.png')

  renderGuide()

  const { missing, count } = missingLinks()
  if (missing.length > 0) {
    console.error(`the site links to files it does not have: ${missing.join(', ')}`)
    process.exit(1)
  }
  console.log(`out/site: landing page, ${PAGES.length} guide pages under /docs/, ${count} local links resolved, demo under /demo/`)
}

module.exports = { PAGES }

if (require.main === module) build()
