/* Bundle entry for M17's pure accounting modules. No React, no DOM, no
   electron, no node-pty and — deliberately — no `fs`: the three modules
   bundled here are pure functions over strings and numbers, so they sit in
   the cheapest verify tier this repo has. transcript-reader.ts is the thin
   real-fs half and is NOT here, the same way git-runner.ts stays out of
   review-engine.ts's own reach. */
module.exports = {
  ...require('../src/shared/cost'),
  ...require('../src/main/usage-parse'),
  ...require('../src/main/pricing'),
  ...require('../src/main/usage-accumulator')
}
