# M209–M210 plan — D11 retained outcomes and return to work

Spec: [2026-09-10-m209-m210-d11-retained-outcomes.md](../specs/2026-09-10-m209-m210-d11-retained-outcomes.md).

1. Add a pure retained-outcome schema and projection. Write layout checks for absent, malformed,
   unknown, trim, missing panel/run and copy/restore behavior before implementation.
2. Capture a task outcome before its lane panel is removed, without changing `parseRuns`; carry it
   through layout store save, snapshot, restore, reset and workspace deletion.
3. Project the retained record onto work cards and the task far view. Keep the unavailable source
   visible and add an explicit, task-scoped history-clear action.
4. Make closed-lane return route through the existing explicit Start work flow. It must neither
   resurrect a session nor submit a message.
5. Run focused layout/panel checks, then `npm run verify`; inspect affected visual scenes before
   any golden update, then run visual and packaged gates. Record evidence in the D11 build log and
   ledger, including manual checks.
