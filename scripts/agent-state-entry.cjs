/* esbuild entry for the agent-state suite. agent-state.ts is pure — no
   node-pty, no electron, no fs — which is what keeps this suite in the cheap
   plain-node tier. If this entry ever needs `external: ['node-pty']`,
   something impure has leaked into agent-state.ts and belongs in
   pty-manager.ts instead. */
module.exports = require('../src/main/agent-state')
