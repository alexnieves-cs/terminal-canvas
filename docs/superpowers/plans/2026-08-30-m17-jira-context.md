# M17 Jira context — Implementation plan

1. **Write the red checks.** Add `scripts/verify-jira.cjs` and its esbuild
   entry against the non-existent Jira client; run it and record every named
   check failing separately. Add the new verify script to `package.json` only
   after the red run is observable.
2. **Credential and adapter.** Declare Jira, add the opaque bundle parser and
   injected requester in `main/jira-client.ts`, extend credential verification,
   and add the `jira:list` IPC contract, main handler, preload bridge, fake
   IPC wiring, README diagram, and offline adapter checks.
3. **Panel kind.** Add the persisted, sessionless Jira panel and its renderer
   component. Extend the terminal partition, layout adapter/schema, viewport
   and layout checks; run each new check red before implementing its target.
4. **Ticket-to-session.** Give the Jira panel a callback to Canvas. Extend the
   existing `onSpawn` funnel with title/context options, call `paste()` only
   after its normal spawn path, and add a panel-level check which observes the
   bracketed paste stream.
5. **Close out.** Update README, backlog #9/#12, CLAUDE.md's silent-failure
   invariant, run the unique-socket `npm run verify`, and perform/record the
   real Jira Cloud hand check if credentials are available.

