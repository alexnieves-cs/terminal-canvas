/* Bundle entry for the pure subagent scanner plus the stateful watcher built
   on top of it. Neither imports fs or electron, so the suite runs under
   plain node — the same tier git-args.ts and tmux-args.ts already sit in,
   and for the same reason. */
module.exports = {
  ...require('../src/main/subagent-scan'),
  ...require('../src/main/subagent-watch'),
  // M398. The home test both the watcher's feed and the toolbox fence ask.
  // node:fs (a cached realpath) and nothing else, so the tier is unchanged.
  ...require('../src/main/home-dir')
}
