/**
 * esbuild entry for verify:toolbox.
 *
 * Two modules, split for the reason git-args.ts/git-runner.ts and
 * subagent-scan.ts/subagent-watch.ts are split: toolbox-scan.ts is pure and
 * toolbox-read.ts reaches a real filesystem, and only the second needs a
 * fixture directory. Both stay in the plain-node tier — node:fs is not what
 * moves a module out of it, importing electron or node-pty is, and
 * main/prompts.ts is the standing precedent.
 */
module.exports = {
  ...require('../src/shared/toolbox'),
  ...require('../src/shared/skills.ts'),
  // M129. The editor's two halves: the pure round-trip and main's four
  // writers, whose every refusal must run under plain node — including the
  // ones that must never reach a real ~/.claude.
  ...require('../src/shared/skill-edit.ts'),
  ...require('../src/main/skill-write.ts'),
  ...require('../src/main/toolbox-scan.ts'),
  ...require('../src/main/toolbox-read.ts')
}
