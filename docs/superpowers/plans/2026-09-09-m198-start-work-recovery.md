# M198 implementation plan

1. Add red-first renderer coverage for simultaneous starts, chat refusal, send refusal and an
   already-started item. Make the test hook return the real promise so the suite can observe the
   executor's answer.
2. Add one in-flight map keyed by work-item id. Split dispatch into a guarded public callback and
   a single attempt function.
3. Persist the reserved conversation and worktree association immediately after `board:lane`.
4. Resume from an existing association, refusing an id collision and skipping a duplicate first
   send after success.
5. Run the product panel suite, then `npm run verify`. Record critic findings and update the
   roadmap documents. M198 has no intended visual change, so no golden should move.

