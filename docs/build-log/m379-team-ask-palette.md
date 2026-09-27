# M379 — the team's asks in the palette: Allow once and Deny, a person's door only

**Verdict: shipped.** M378 put a teammate's agent's ask in Needs you. This gives it the
palette's door, beside M76's permission rows: each open team ask has
**Allow once — Ada's agent · api agent** and **Deny — …**, with the whole line it would
run as the subtitle. Either row answers that ask as the person at this machine, through
the same store the Dock uses, so it leaves both surfaces in one frame. A refusal says why.

## What landed

- **`PaletteActions.answerTeamAsk(workspaceId, askId, allow)`** (`commands.ts`), and its
  implementation in the presets slice beside `answerApproval`: the store's own answer
  and a refusal toast.
- **The rows** (`commands.ts`): two per ask from `ctx.teamAsks`, named in
  `teamAskWords`' words.
- **`PaletteContext.teamAsks`** (`commands/context.ts`). `Palette.tsx` reads it from
  `useTeamAsks`, the one store, so Canvas passes nothing new.
- **`verb-table.ts`** names why no plan or workflow node ever answers one.

## Decisions, and why

- **Two doors, and two refused by name.** The run's rule is four doors per verb.
  CLAUDE.md's rule, "Four doors, and the fourth is real", comes with an excluded list,
  and `answerApproval` has been on it since M98: "a plan may never answer a permission
  question for the user". A team ask is the same question asked of a team. An agent's
  plan or a workflow node that could answer it would be the automation that multi-human
  approval exists to stop, so the gesture (M378) and the palette (here) are its doors,
  and the other two are refused with that reason. CLAUDE.md wins where the run prompt
  and it conflict.
- **Allow is ONCE here too.** The row never offers a grant, for M375's reason.

## Checks

- `verify:palette team.rows.1`:
  - an ask is two rows with whose agent and the whole line;
  - each row answers that ask with allow or deny;
  - without team asks there are no such rows.

  163/163.
- `verify:verbs` holds `answerTeamAsk` to its excluded-list reason (`closure.1`).

No display changed at rest (the rows exist only while a team ask is open, and no shot
scene opens the palette with one), so `verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean; `verify:palette` 163/163, `verify:verbs`
30/30, `verify:meta` 51/51.

**The team-queue chain gate (M375–M379), on the tree holding all five:** the full
`npm run verify` ran 59/61 suites in 725.6s, and every red is the baseline:
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

There was no watchdog, and `onboarding.start.1` passed (M385's fix holding). M378's
visual pass wrote `team-ask.png` alone.

## Owed

Nothing new.

Next: the landing of M373–M383, then the report.
