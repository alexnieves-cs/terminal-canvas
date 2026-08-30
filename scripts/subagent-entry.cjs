/* Bundle entry for the pure subagent scanner. No fs, no electron, no node-pty,
   so the suite runs under plain node — the same tier git-args.ts and
   tmux-args.ts already sit in, and for the same reason. */
module.exports = {
  ...require('../src/main/subagent-scan')
}
