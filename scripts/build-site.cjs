/* The Pages site: the landing page at the root and the browser demo under
   /demo/. Run after `npm run build:web`; pages.yml uploads out/site.

   The demo is built exactly as before into out/web and copied whole into
   out/site/demo/. vite.web.config.ts builds with `base: './'`, so every URL
   the demo makes is relative to its own index.html and moves with it; the
   demo's build and its smoke test need to know nothing about the move.

   The landing page is plain HTML and CSS in site/, with no build step and no
   script. The pictures come from docs/assets, the same files the README
   shows, so the two never disagree; only the ones the page names are copied.
   A relative link on the page that resolves to nothing in out/site fails the
   build, because GitHub Pages answers a missing file with a 404 and no error. */
const { cpSync, existsSync, mkdirSync, readFileSync, rmSync } = require('fs')
const { dirname, join, resolve } = require('path')

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'out/site')
const WEB = join(ROOT, 'out/web')

if (!existsSync(join(WEB, 'index.html'))) {
  console.error('out/web/index.html is missing: run `npm run build:web` first')
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
cpSync(join(ROOT, 'site'), OUT, { recursive: true })
cpSync(WEB, join(OUT, 'demo'), { recursive: true })

const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8')
const refs = [...html.matchAll(/(?:href|src)="\.\/([^"#?]*)/g)].map((m) => m[1])
for (const ref of refs.filter((r) => r.startsWith('assets/'))) {
  const from = join(ROOT, 'docs', ref)
  if (!existsSync(from)) continue
  mkdirSync(dirname(join(OUT, ref)), { recursive: true })
  cpSync(from, join(OUT, ref))
}
// The og:image is absolute (a crawler needs a full URL), so the regex above
// does not see it; copy it by name.
mkdirSync(join(OUT, 'assets'), { recursive: true })
cpSync(join(ROOT, 'docs/assets/social-preview.png'), join(OUT, 'assets/social-preview.png'))

const missing = refs.filter((r) => !existsSync(join(OUT, r === '' || r.endsWith('/') ? `${r}index.html` : r)))
if (missing.length > 0) {
  console.error(`site/index.html links to files the site does not have: ${missing.join(', ')}`)
  process.exit(1)
}
console.log(`out/site: landing page, ${refs.length} local links resolved, demo under /demo/`)
