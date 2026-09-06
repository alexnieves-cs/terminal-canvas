/* M96. Bundle entry for the verb table, the plan and the outward gate — all
   pure shared modules — plus the scrollback log (node:fs over an injected
   directory) so the gate check can plant a token in a REAL panel log and
   read it back through the same path a plan's read takes. No electron, no
   node-pty, no React. */
module.exports = {
  verbs: require('../src/shared/verb-table'),
  plan: require('../src/shared/plan'),
  outward: require('../src/shared/outward'),
  auto: require('../src/shared/auto'),
  routines: require('../src/shared/routines'),
  settings: require('../src/shared/settings-schema'),
  scrollback: require('../src/main/scrollback-log')
}
