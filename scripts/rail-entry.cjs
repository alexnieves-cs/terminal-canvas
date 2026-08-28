/* Bundle entry for the shell's pure row modules. No React, no DOM, no native
   dependencies, so the suite runs under plain node — the cheapest tier this
   repo has. M8c's inspector rows and M8d's workspace and attention rows both
   joined this entry rather than getting suites of their own. */
module.exports = {
  ...require('../src/renderer/shell/rail-rows'),
  ...require('../src/renderer/shell/inspector-fields'),
  ...require('../src/renderer/shell/rail-sections')
}
