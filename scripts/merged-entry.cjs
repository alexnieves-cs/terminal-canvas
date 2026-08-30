// esbuild entry for verify:merged. merged-layout.ts is pure — no DOM, no
// electron, no node-pty — so it runs in the cheapest tier the repo has.
//
// Task 3 exports only merged-layout.ts. marquee.ts does not exist yet — it
// lands in Task 4 — and esbuild resolves an entry's requires eagerly, so
// spreading it in here now would make this file unbuildable until Task 4
// lands. Task 4 adds that second line back.
module.exports = {
  ...require('../src/renderer/canvas/merged-layout.ts')
}
