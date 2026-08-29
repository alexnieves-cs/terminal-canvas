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
  ...require('../src/main/review-engine'),
  // The impure one. It joins the bundle — rather than the suite requiring the
  // .ts directly, which plain node cannot load — and needs no `external`
  // entry: node:child_process is a builtin, which esbuild leaves alone under
  // platform:'node'. If this ever needs external:['node-pty'], something has
  // leaked that belongs elsewhere.
  ...require('../src/main/git-runner'),
  // Task 6's fix round: the once-only capture guard main/index.ts wires up.
  // Pure — no electron, no node-pty — so the epoch race that let a killed
  // panel's in-flight capture write a stale baseline can be driven here
  // against fakes instead of a real PTY and a real kill().
  ...require('../src/main/baseline-capture'),
  // M9c's write verb. Pure the way review-engine.ts is pure — its GitRunner
  // and its two filesystem callbacks are injected — so the whole five-call
  // commit transaction can be driven here against a fake runner, with no real
  // git and no real repository, in the cheapest tier the repo has.
  ...require('../src/main/review-commit'),
}
