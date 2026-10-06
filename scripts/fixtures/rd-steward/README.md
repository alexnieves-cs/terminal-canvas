# rd-steward fixture

The demo workspace from the redesign mockups. Sample names (Steward,
ledger-export, SW-412) live here and only here. They are not product copy.

`workspace.json` is the cast: five tasks, the panels on them, and the state
each one is in. `world-sim.ts` turns the agents' `world` field into the
`AgentEvent` stream the World scenes read. `load.cjs` turns the cast into
a layout. `TC_FIXTURE=rd-steward` is the one switch, shared by `npm run dev`
and `scripts/shot.cjs`. Dev points userData at a throwaway directory first,
so the person's layout is not the file that changes.

The frame matches the World room (mockups 11 and 14): 3 waiting, 1 failed,
4 working. Screen 07 shows Claude on the Plaid task as `exited 1`. This
fixture keeps that agent as needing you, and the failure is Codex on
pricing, so the feed and the canvas are one moment.
