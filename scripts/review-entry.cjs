/* esbuild entry for the review suite. git-args.ts is pure — no child_process,
   no electron, no node-pty — which is what keeps this suite in the cheap
   plain-node tier. If this entry ever needs `external: ['node-pty']`,
   something impure has leaked in and belongs in git-runner.ts instead.

   It grows ONE spread per task, as each module comes into existence: Task 2
   adds review-engine, Task 4 adds git-runner. Naming a module before the task
   that creates it makes esbuild fail to resolve the whole bundle, so NO check
   runs and the suite cannot go green — which is exactly what happened to the
   first draft of this plan. */
module.exports = {
  ...require('../src/main/git-args'),
  ...require('../src/main/review-engine')
}
