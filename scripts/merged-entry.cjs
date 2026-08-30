// esbuild entry for verify:merged. merged-layout.ts and marquee.ts are both
// pure — no DOM, no electron, no node-pty — so they run in the cheapest tier
// the repo has.
//
// Task 3 exported only merged-layout.ts: marquee.ts did not exist yet, and
// esbuild resolves an entry's requires eagerly, so naming it here before
// Task 4 landed would have made this file unbuildable. Task 4 adds it back.
module.exports = {
  ...require('../src/renderer/canvas/merged-layout.ts'),
  ...require('../src/renderer/canvas/marquee.ts')
}
