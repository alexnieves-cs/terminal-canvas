# M205 — plan

Spec: [2026-09-10-m205-intent-led-onboarding.md](../specs/2026-09-10-m205-intent-led-onboarding.md).

1. **Red first, plain node.** `verify:onboarding onboarding.intent.1–.5` against `firstWorkPlan` /
   `firstWorkRepoAnswer` before they exist (each fails on its own, the suite's existing pattern);
   `onboarding.markup.1` rewritten for the new launcher and `onboarding.markup.3/.4` added
   (disclosure keeps every legacy door; readiness only as needed; no process jargon). Watch red.
2. **The model** in `src/shared/onboarding.ts`. Green.
3. **The launcher**: the intent form, the one alternative, `More ways to start`, readiness rows
   gated on need, the codex hint. Green plain-node.
4. **The orchestration** in `Canvas.tsx`: `startFirstWork` (plan → git status → teammate reuse or
   mint → typed item → `startWork`), `chatHere`, `askWithoutFolder`; Recent chips fill the folder.
   The primary no longer calls `openStarter`.
5. **Electron checks** in `verify:panels:product`: `onboarding.start.1` through the alternative;
   new `onboarding.intent.e2e.1` (real temp repo → teammate with exactly that place, typed item,
   chat in the lane, the sentence as the first user line, zero PTYs, no starter record) and
   `onboarding.intent.e2e.2` (a plain folder → refused by name, nothing minted, `Chat in this
   folder instead` inserts without sending); `starter.1` through the disclosure line; the Tab walk
   counts only reachable verbs. `shot.cjs`'s `starter` scene through the disclosure.
6. `npm run verify`; `npm run shot` and look; critic sentences; `UPDATE_GOLDENS=1` for the launcher
   (and starter only if it changed); `verify:visual`; `verify:packaged`.
7. Fresh-context critic; disposition; build log, ledger row, guide checkbox, getting-started.
