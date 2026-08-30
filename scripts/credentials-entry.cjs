/* esbuild entry for the credential suite. credential-schema.ts imports
   NOTHING and credential-store.ts takes its crypto injected, which is what
   keeps this suite in the cheap plain-node tier.

   It grows ONE spread per task, as each module comes into existence: Task 2
   adds credential-store, Task 4 adds credential-verify. Naming a module before
   the task that creates it makes esbuild fail to resolve the whole bundle, so
   NO check runs and the suite cannot go green — which is exactly what happened
   to the first draft of the M9 plan. See scripts/review-entry.cjs. */
module.exports = {
  ...require('../src/shared/credential-schema'),
  ...require('../src/main/credential-store'),
  ...require('../src/main/credential-verify'),
}
