/* esbuild entry for the control suite (M54). control-protocol.ts is pure;
   control-server.ts touches only node:net and node:fs; cli/tc.ts touches
   node:net through an injected connect. None may import electron — the CLI
   runs under ELECTRON_RUN_AS_NODE, where `electron` is undefined. */
module.exports = {
  ...require('../src/main/control-protocol'),
  ...require('../src/main/control-server'),
  ...require('../src/main/control-handler'),
  ...require('../src/main/launcher'),
  ...require('../src/cli/tc')
}
