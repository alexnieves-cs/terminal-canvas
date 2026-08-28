/* Bundle entry for the shell's pure row modules. No React, no DOM, no native
   dependencies, so the suite runs under plain node — the cheapest tier this
   repo has. M8d's workspace and attention rows are expected to join this
   entry rather than get suites of their own; M8c's inspector rows already
   have. */
module.exports = {
  ...require('../src/renderer/shell/rail-rows'),
  ...require('../src/renderer/shell/inspector-fields')
}
