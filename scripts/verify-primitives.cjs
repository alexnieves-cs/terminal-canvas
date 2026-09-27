/* Run with: node scripts/verify-primitives.cjs
   The Radix primitives in src/renderer/primitives, as STATIC MARKUP. Markup
   proves which props reach the DOM element — never that a key or a focus does
   anything; verify:panels:product reach.1 owns that.

   Why this exists: every primitive renders `<Radix.X.Content asChild>` around
   a <MotionSurface>, and `asChild` is a contract — Radix's Slot MERGES its own
   props (the ref, onFocusCapture/onBlurCapture, onKeyDown, role, id,
   data-state, aria-*) into its one child. M276's MotionSurface rebuilt its
   element from the CHILD's props alone, so all of that was dropped with no
   error: the DismissableLayer's inside-tracking never ran, every focus inside
   a popover read as outside, and the ⋯ menu dismissed itself one Tab in
   (reach.1 red from M276 to the carried-reds pass). Attributes and handlers
   ride the same spread, so an attribute arriving is the discriminator a
   browser-free suite can read. */
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const alias = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }

const load = (entry, out) => {
  try {
    buildSync({
      entryPoints: [join(ROOT, entry)], outfile: join(ROOT, 'out/verify', out), bundle: true, platform: 'node', format: 'cjs',
      jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-dom'], alias,
      loader: { '.css': 'empty', '.svg': 'text' }
    })
    return { mod: require(join(ROOT, 'out/verify', out)) }
  } catch (error) { return { error: error.message } }
}
const check = (loaded, id, test) => {
  if (loaded.error !== undefined) { ok(id, false, loaded.error); return }
  try { const r = test(loaded.mod); ok(id, r.pass, JSON.stringify(r.detail)) } catch (error) { ok(id, false, error.message) }
}

const { createElement: h } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const POPOVER = load('src/renderer/primitives/Popover.tsx', 'primitives-popover.cjs')
const SURFACE = load('src/renderer/primitives/MotionSurface.tsx', 'primitives-surface.cjs')
const noop = () => {}

// The production path, byte for byte: the inspector's ⋯ is Popover →
// PopoverContent forceMount → its own <div>. Radix's content carries
// role="dialog", an id and data-state; each must land on THAT div.
check(POPOVER, 'prim.slot.1 an open Popover\'s content element carries what Radix\'s Slot passed — role="dialog", data-state="open" and an id — merged with its own props, not replaced by them', (m) => {
  const html = renderToStaticMarkup(h(m.Popover, { open: true, onOpenChange: noop },
    h(m.PopoverTrigger, null, 'more'),
    h(m.PopoverContent, { forceMount: true }, h('div', { 'data-probe': 'menu', className: 'own' }, 'rows'))))
  const tag = (html.match(/<div[^>]*data-probe="menu"[^>]*>/) || [''])[0]
  return { pass: /role="dialog"/.test(tag) && /data-state="open"/.test(tag) && /\bid="/.test(tag) && /class="own"/.test(tag), detail: tag }
})

// The surface on its own: a prop given to MotionSurface (as the Slot gives
// them) reaches the element, the child's own prop still wins a collision, and
// both classNames and styles survive — the Slot's mergeProps semantics.
check(SURFACE, 'prim.slot.2 MotionSurface forwards props it was given to the element, composing className and style, with the child\'s own attribute winning a collision', (m) => {
  const html = renderToStaticMarkup(h(m.MotionSurface, { open: true, role: 'dialog', 'data-state': 'open', title: 'slot', className: 'from-slot', style: { color: 'red' } },
    h('div', { title: 'child', className: 'from-child', style: { top: '1px' } }, 'x')))
  const tag = (html.match(/<div[^>]*>/) || [''])[0]
  return { pass: /role="dialog"/.test(tag) && /data-state="open"/.test(tag) && /title="child"/.test(tag) && /from-slot/.test(tag) && /from-child/.test(tag) && /color:\s*red/.test(tag) && /top:\s*1px/.test(tag), detail: tag }
})

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
