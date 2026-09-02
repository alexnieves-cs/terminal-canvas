# M38 — Agents that outlive the app: implementation plan

Spec: `../specs/2026-09-01-m38-agents-outlive-the-app-design.md`. Four tasks,
check-first.

## Task 1 — The setting (`verify:layout`)

Check `keep-on-quit.1`: `settingDef('session.keepOnQuit')` exists, `type`
is `boolean`, `default` is `false`, `category` is the exported
`SESSION_CATEGORY`, and `resolveSetting({}, 'session.keepOnQuit')` is
`false`. RED (undefined def). Then the `SettingDef` and the category
constant in `shared/settings-schema.ts`.

## Task 2 — The quit sequence (`verify:pty-manager`)

Checks `keep-on-quit.1`/`.2` inside the tmux block, before check 15's
definite `kill-server`:
- `.1`: create `q1` on the tmux backend, record its pane pid via
  `manager.list()`, call `runQuit({ keep: true, manager, backend, flush })`
  with a spy `flush`; assert the session is still listed on the verify
  socket, `flush` was called once, `shutdown` was not; then a second manager's
  `create('q1')` reports `reattached: true` and the same pid.
- `.2`: create `q2`, call `runQuit({ keep: false, ... })` with spies that
  record call order; assert the order is `killAll`, `flush`, `shutdown`, the
  session is gone and `list-sessions` is empty.
RED (no `runQuit` export). Then `main/quit.ts`, added to the suite's bundle
through a second `buildSync` entry (it imports nothing impure, so it could
equally join a plain-node tier — it joins this suite because its subject is
this suite's real tmux server).

## Task 3 — Wiring (`main/index.ts`)

`before-quit` calls `runQuit` with `keep: layoutStore.getSetting(
'session.keepOnQuit') === true && backend.kind === 'tmux'`, read at quit
time. The existing comment block moves into `quit.ts` with the keep arm's
reasoning added. `npm run typecheck`.

## Task 4 — Close

README (the two quit sentences), `CLAUDE.md`'s "What this is" note on M4c,
`docs/load-bearing.md` (the entry: keep is opt-in, teardown-then-flush in
both arms and why the keep arm needs it), backlog #56 → gone table,
`docs/verify-suites.md` counts, build log, `npm run verify`, merge.
