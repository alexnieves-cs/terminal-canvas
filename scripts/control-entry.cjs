/* esbuild entry for the control suite (M54). control-protocol.ts is pure;
   control-server.ts touches only node:net and node:fs; cli/tc.ts touches
   node:net through an injected connect. None may import electron — the CLI
   runs under ELECTRON_RUN_AS_NODE, where `electron` is undefined. */
module.exports = {
  ...require('../src/main/control-protocol'),
  ...require('../src/main/control-server'),
  ...require('../src/main/control-handler'),
  ...require('../src/main/launcher'),
  ...require('../src/cli/tc'),
  /* M369. The decision audit behind `tc audit`: node:fs only. */
  ...require('../src/shared/decision-audit'),
  ...require('../src/main/decision-audit'),
  /* M366. The toolbox door behind `tc toolbox`, with the cache it reads
     through and the query both doors answer with: node:fs only. */
  ...require('../src/main/toolbox-door'),
  ...require('../src/main/toolbox-cache'),
  ...require('../src/shared/toolbox-query'),
  /* M81. The word producers `tc status` reports in — checked here so drift
     is caught where it would happen, not where it passes through. */
  ...require('../src/renderer/panels/panel-state'),
  ...require('../src/renderer/canvas/trigger-words')
}
