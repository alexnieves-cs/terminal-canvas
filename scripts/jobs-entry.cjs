/* esbuild entry for the job-recovery suite (M316). Every module here is pure
   or takes its fs/electron edges by injection: the journal model, the file
   store (node:fs against a tmpdir), the recovery doors, the pool caller and
   its engine, and the renderer's run model for the handoff-run account. None
   may import `electron` — main/job-recovery.ts takes the pool caller, the
   transcripts and git as functions for exactly that reason. */
module.exports = {
  journal: require('../src/shared/job-journal'),
  store: require('../src/main/job-store'),
  recovery: require('../src/main/job-recovery'),
  poolCaller: require('../src/main/pool-caller'),
  runModel: require('../src/renderer/canvas/run-model')
}
