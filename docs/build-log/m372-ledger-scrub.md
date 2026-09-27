# M372 — the run ledger scrubs what it writes, and counts it

**Verdict: shipped.** Found while building M369. The run ledger (M52, M300) is where a
terminal's command line lands (a command row), where a tool row quotes the command it
ran, and where a permission record quotes the command it allowed. It wrote every one of
them to disk as it came. The run's rule is that anything moving terminal bytes off the
panel (disk, index, export, server) is a disclosure surface: scrub the secrets, count
them, report the count. The ledger was not on `redactSecrets`' caller list.

Now `curl -H "Authorization: Bearer ghp_…" https://api.github.com/user` reaches disk as
`curl -H "Authorization: Bearer [redacted bearer token]" https://api.github.com/user`,
with `scrubbed: 1` on the row. An event row's title and detail are scrubbed the same
way. A row with no secret is written exactly as it was.

## What landed

- **`scrubbedRow`** in `main/run-ledger.ts`'s `append`. It covers a command row's
  `command`, and an event row's `title` and `detail`. Usage and gap rows carry no
  words. The count adds to any count the row already had.
- **`RunRow.scrubbed`** and **`EventRow.scrubbed`** (`shared/run-ledger.ts`), each parsed
  back field-level (`runRowOf`, `parseEventRow`). A malformed count costs the field.
- **`redactSecrets`' named callers** gain `main/run-ledger.ts`, deliberately
  (`verify:verbs gate.2`, its sentence and its list).

## Decisions, and why

- **At the one writer, in main.** Every row reaches disk through `append`: the terminal
  recorder's command rows, the renderer's `ledger:event` and main's own. One scrub
  there covers them all, and no caller can skip it.
- **Command rows too.** A command line is terminal bytes, the exact case the rule names.
  A scrub replaces only secret-shaped tokens, so the row still says what ran, and a
  repeated command scrubs the same way each time.
- **Known consequence:** a check whose command line itself holds a secret now reads back
  scrubbed. It no longer matches its live watcher's command string, so its tally reads
  it as a different command. That case is rare, and a secret in a check's command line
  is its own problem. The record choosing safety over that match is the decision.
- **The decision audit scrubs on its own** (M369). It receives the row before the
  ledger's scrub, and counts what it scrubs for its own file.

## Checks

- `verify:file ledger.scrub.1`, through the real ledger:
  - a GitHub token in a command line, and in an event's title and detail, never
    reaches the file;
  - `scrubbed` is 1 on the command row and 2 on the event row;
  - a clean `npm test` row is unchanged;
  - `list` reads the scrubbed command and its count back.

  114/114.
- `verify:verbs gate.2` names the new caller. 30/30.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran 59/61 suites in 780.5s. It ran
on the tree holding both this milestone and M369's `tc list` fix, which touch no file in
common. Every red is the baseline:
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: its watchdog fired under load (31). Rerun alone at load 9.4,
  it finished with the baseline `starter.1` and seven `workflow.*`, plus
  `onboarding.start.1`, the known load flake. That check then passed alone.

No display changed, so `verify:visual` was not run.

## Owed

- **The count is kept but not yet SAID on screen.** Orchestrate's record rows could say
  "1 secret scrubbed" beside a row that had one. That is a display change with a golden.

Next: M366 (`tc toolbox <name>`), or Arc 4's `tc task --swarm` (M370).
