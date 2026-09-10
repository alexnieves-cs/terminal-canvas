/* esbuild entry for verify:tool (M252). The reply parser and the capability
   derivation are pure; the generator runs over an injected AgentRunner and a
   real temp folder. Absent until they land, so a missing module reads red
   rather than crashing. */
module.exports = {
  ...((() => { try { return require('../src/shared/tool-spec.ts') } catch { return {} } })()),
  ...((() => { try { return require('../src/main/tool-generate.ts') } catch { return {} } })())
}
