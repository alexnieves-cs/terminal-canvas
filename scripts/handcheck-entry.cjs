/**
 * esbuild entry for `npm run handcheck` (M136): the four automated arms reach
 * the same production functions the app calls — `listPlugins` over the real
 * CLI, `createSkill` under a fenced home, `renameInShelf` over a shelf whose
 * destination is occupied — so a green arm is evidence about shipped code,
 * not about a copy of it.
 */
module.exports = {
  ...require('../src/main/plugin-list.ts'),
  ...require('../src/main/skill-write.ts'),
  ...require('../src/shared/skills.ts')
}
