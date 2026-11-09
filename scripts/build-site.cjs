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
   twice is a guide that disagrees with itself. Each page is rendered by
   `marked` into the frame below, and three kinds of link are rewritten,
   because a path that is right on github.com is wrong on Pages:
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

function renderGuide() {
  const { Marked } = require('marked')
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
    const marked = new Marked({
      gfm: true,
      renderer: {
        heading({ tokens, depth }) {
          const inner = this.parser.parseInline(tokens)
          return `<h${depth} id="${slug(inner)}">${inner}</h${depth}>\n`
        },
        link({ href: to, tokens }) {
          return `<a href="${esc(href(to))}">${this.parser.parseInline(tokens)}</a>`
        },
        image({ href: src, text }) {
          const target = posix.normalize(posix.join('docs/guide', src))
          const ref = target.startsWith('verify/visual/goldens/') ? `shots/${target.slice('verify/visual/goldens/'.length)}` : target.startsWith('docs/assets/') ? target.slice('docs/'.length) : null
          if (ref === null || !copyPicture(ref)) { problems.push(`picture ${src}`); return '' }
          const size = ref.endsWith('.png') ? pngSize(join(OUT, ref)) : null
          const dims = size === null ? '' : ` width="${size.width}" height="${size.height}"`
          return `<figure class="shot"><img src="../${esc(ref)}"${dims} loading="lazy" alt="${esc(text)}" /></figure>`
        },
        // A wide table scrolls inside its own box instead of pushing the page sideways on a phone.
        table(token) {
          const cell = (c, tag) => `<${tag}>${this.parser.parseInline(c.tokens)}</${tag}>`
          const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`
          const rows = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('\n')
          return `<div class="docs__table"><table><thead>${head}</thead><tbody>\n${rows}\n</tbody></table></div>\n`
        }
      }
    })
    // A picture alone in a paragraph is a figure; <p><figure> is not valid HTML.
    const body = marked.parse(md).replace(/<p>(<figure class="shot">.*?<\/figure>)<\/p>/g, '$1')
    if (problems.length > 0) {
      console.error(`docs/guide/${file}: ${problems.join('; ')} resolves to nothing in the repository`)
      process.exit(1)
    }
    if (/<script/i.test(body)) {
      console.error(`docs/guide/${file} carries a script; the site has none and its CSP would refuse it`)
      process.exit(1)
    }
    const title = (md.match(/^# (.+)$/m) ?? ['', 'Terminal Canvas'])[1]
    const firstLine = (md.split('\n\n').find((p) => !p.startsWith('#') && !p.startsWith('!') && !p.startsWith('<')) ?? '').replace(/\s+/g, ' ').replace(/[`*]|\[([^\]]+)\]\([^)]*\)/g, '$1').trim()
    writeFileSync(join(OUT, 'docs', `${name}.html`), frame({ title, description: firstLine.slice(0, 200), name, body }))
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
