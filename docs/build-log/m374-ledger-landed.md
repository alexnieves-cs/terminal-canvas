# M374 — the run ledger says whether a row landed

**Verdict: shipped.** Owed by M373. The run ledger's `append` queued each write and ended
the queue in `.catch(() => {})` (M52), so a row that never reached disk (a full disk, a
missing directory) resolved exactly like one that did. Two readers acted on that false
yes:
- `recordDecision` (M373) mirrored a decision into the audit that the ledger never
  recorded, so the two records disagreed;
- the renderer's `ledger:event` answered `true`, so `recordOrchEvent`'s "say it did not
  land" arm could never fire.

`append` now resolves `true` once the line is on disk, and `false` otherwise. It still
never rejects.

## What landed

- **`RunLedger.append(row): Promise<boolean>`** (`main/run-ledger.ts`). A trim that fails
  after the line was written leaves it counted as landed, because the row is on disk.
- **`recordDecision`** (`main/decision-audit.ts`) mirrors only a row that landed.
  Through it, `ledger:event` answers the truth.
- **`bootstrap/kit-handlers.ts`**: the integrator's `record` keeps its
  `Promise<void>` shape through a one-line wrapper. Integrate records beside its work,
  never on it.

## Decisions, and why

- **A boolean, never a rejection.** Most callers ignore the result: a command end, a
  usage row, a watcher's pass. A rejecting `append` would turn a full disk into an
  unhandled rejection in main for each of them. The caller that must know asks.
- **The queue survives a failed write.** The next row is still tried, so a disk that
  frees up records again with no restart.

## Checks

- `verify:control ledger.landed.1`, through the real ledger:
  - a ledger whose directory is missing resolves `false` twice and never rejects;
  - a good one resolves `true`;
  - `recordDecision` refuses the first and records the second, and the audit holds one
    row.

  37/37. `verify:file` 114/114, `verify:review` 161/161, `verify:jobs` 17/17 and
  `verify:agent-session` 179/179 stay green.

No display changed, so `verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean; `verify:control` 37/37, `verify:file`
114/114, `verify:review` 161/161, `verify:jobs` 17/17 and `verify:agent-session` 179/179.

**The chain gate (M366, M373, M374), on the tree holding all three:** the full
`npm run verify` ran 59/61 suites in 772.9s, and every red is the baseline:
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: its watchdog fired as load climbed mid-run. Rerun alone at
  load 5.9, it finished inside its watchdog with the baseline `starter.1` and seven
  `workflow.*`, plus `onboarding.start.1`.

`onboarding.start.1` was traced this time, not rerun. Its log shows the composer holding
`ask: list itReply with exactly the word:`. A serial run keeps ONE Electron `userData`
across panels parts and across runs. So `localStorage` carried a composer draft that
`verify:panels:orchestrate` leaves on purpose (M322's drafts are kept by panel id) into
the chat this check minted under the same id. The recorded agent never heard its exact
prompt, and never said `pong`. The failure is a harness leak between parts, never this
chain's code, and it is fixed as M385 (each panels part starts with empty browser
storage).

## Owed

Nothing new.

Next: M362 (a proposal golden on a laned fixture task), or M368 (the narrow header's
pill).
