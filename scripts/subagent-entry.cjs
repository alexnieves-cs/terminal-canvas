/* Bundle entry for the pure subagent scanner plus the stateful watcher built
   on top of it. Neither imports fs or electron, so the suite runs under
   plain node — the same tier git-args.ts and tmux-args.ts already sit in,
   and for the same reason. */
module.exports = {
  ...require('../src/main/subagent-scan'),
  ...require('../src/main/subagent-watch')
}
