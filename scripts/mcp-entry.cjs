/* esbuild entry for the MCP suite (M487). The server and the real control
   server and handler it talks to, the plan door's own runner (so a refusal
   is the one a client would get), and the state vocabulary the attention
   queue reads. The SDK stays external: it is loaded from node_modules, as
   the shipped `tc` loads it. */
module.exports = {
  ...require('../src/cli/mcp'),
  ...require('../src/cli/tc'),
  ...require('../src/main/control-server'),
  ...require('../src/main/control-protocol'),
  ...require('../src/shared/settings-schema'),
  ...require('../src/main/control-handler'),
  ...require('../src/shared/plan'),
  ...require('../src/renderer/panels/panel-state')
}
