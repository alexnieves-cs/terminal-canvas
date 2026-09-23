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
  /* M77. The tool-call → file index: pure over transcript turns. */
  ...require('../src/shared/tool-index'),
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
  ...require('../src/main/review-discard'),
  // M37. The pure half of the worktree feature: naming and path derivation.
  // Import-free, so it costs this tier nothing; the git-running half is
  // worktree-manager.ts, which takes its runner injected and joins below it.
  ...require('../src/main/worktree'),
  // The git-running half. Its runner, resolver and record store are all
  // injected, so verify:review drives it against a real temporary repository
  // and an in-memory record list — no Electron, no real userData.
  ...require('../src/main/worktree-manager'),
  /* M196 (D04). The scope resolver and its pure half: injected deps, so every
     arm — including git DECLINING, which the memory door used to swallow —
     runs here against the fake runner this suite already has. */
  ...require('../src/shared/work-scope'),
  ...require('../src/main/work-scope'),
  /* M201 (D07). Local review readiness: a pure projection over the work item,
     the lane's fork diff, the linked conversation's supervision and the two
     evidence sources. Nothing injected — it asks for nothing. */
  ...require('../src/shared/review-readiness'),
  /* M202. `ACROSS_BASELINE` — the one VALUE shared/review.ts exports. It was
     types only until now, which is exactly the case the alias comment above
     warns about: a module that starts exporting a value where it exported
     only types breaks a bundle that never carried it. */
  ...require('../src/shared/review'),
  /* M285. The review content identity: the pure type/compare/parse half and
     main's hashing half, so the same-size-edit checks run against the real
     sha256 and the real policy, not a stand-in. */
  ...require('../src/shared/review-identity'),
  ...require('../src/main/review-identity'),
  /* M286. Revision-bound check evidence: pure over ledger rows, watcher
     outcomes and the M285 identity. */
  ...require('../src/shared/check-evidence'),
  /* M307. The reviewer's side: line comments, the follow-up they compose,
     and the finished-is-not-verified judgment — pure, this suite's tier. */
  ...require('../src/shared/review-comments'),
  ...require('../src/shared/work-items'),
  /* M309. The return briefing — pure over the durable record and the inbox. */
  ...require('../src/shared/return-briefing'),
  /* M310. The flagship flow's joins — pure. */
  ...require('../src/shared/task-flow'),
  /* M311–M314. The workflow kit: combine's plan and its runner (real git),
     the repository setup and its store, recipes and their store, the editor
     plan and its opener. */
  ...require('../src/shared/combine'),
  ...require('../src/main/combine-runner'),
  ...require('../src/shared/repo-setup'),
  ...require('../src/main/repo-setup-store'),
  ...require('../src/shared/recipes'),
  ...require('../src/main/recipe-store'),
  ...require('../src/shared/editor-open'),
  ...require('../src/main/kit'),
}
