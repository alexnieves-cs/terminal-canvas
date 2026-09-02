/* esbuild entry for the tmux suite. tmux-args.ts is pure — no node-pty, no
   electron, no fs — which is what keeps this suite in the cheap plain-node
   tier. If this entry ever needs `external: ['node-pty']`, something impure
   has leaked into tmux-args.ts and belongs in session-backend.ts instead. */
module.exports = {
  ...require('../src/main/tmux-args'),
  ...require('../src/main/tmux-probe'),
  ...require('../src/main/env-report')
}
